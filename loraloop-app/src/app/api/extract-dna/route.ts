import { NextResponse } from "next/server";
import { chromium, Browser, Page } from "playwright";
import { callGemini } from "@/lib/gemini";
import { meterIfAuthed } from "@/lib/withCredits";

// ────────────────────────────────────────────────────────────────
// UTILITY
// ────────────────────────────────────────────────────────────────

function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
  return u;
}

// Reject tracking pixels, icons, placeholder services, and tiny junk
function isUsefulImage(src: string): boolean {
  if (!src || src.length < 10) return false;
  if (/\s+\d+(\.\d+)?[wx]/.test(src)) return false;  // srcset string
  if (/,\s*https?:\/\//.test(src)) return false;       // multi-url srcset
  if (src.includes(" ")) return false;

  const lower = src.toLowerCase();

  const hardReject = [
    "pixel", "track", "analytics", "beacon", "1x1", "spacer",
    "facebook.com/tr", "google-analytics", "doubleclick",
    "googletagmanager", "hotjar", "data:image/gif",
    "data:image/svg+xml", "gravatar", "wp-emoji",
    "wpcf7", "spinner", "loading.gif", "recaptcha",
    "cloudflare", "captcha",
  ];
  if (hardReject.some((j) => lower.includes(j))) return false;

  const placeholders = [
    "placeholder.com", "via.placeholder.com", "placeimg.com",
    "placekitten.com", "dummyimage.com", "loremflickr.com",
    "lorempixel.com", "imagefor.me", "placeholder.pics",
    "picsum.photos",
  ];
  if (placeholders.some((p) => lower.includes(p))) return false;

  // Reject tiny dimension hints (< 50px)
  const dimMatch = src.match(/[_\-x](\d+)x(\d+)/i);
  if (dimMatch) {
    const w = parseInt(dimMatch[1]), h = parseInt(dimMatch[2]);
    if (w < 50 && h < 50) return false;
  }
  const wParam = src.match(/[?&](?:w|width)=(\d+)/i);
  if (wParam && parseInt(wParam[1]) < 50) return false;

  if (lower.endsWith(".ico")) return false;
  if (/\/(favicon|sprite)\b/i.test(lower)) return false;
  if (/\/(icon|arrow|chevron|check|star|dot|close|menu|hamburger|button|btn)\//i.test(lower)) return false;

  return true;
}

// Strip CDN size params so different sizes of the same image deduplicate
function normalizeImageUrl(src: string): string {
  try {
    const u = new URL(src);
    ["w", "h", "width", "height", "size", "q", "quality", "fit",
      "resize", "scale", "format", "auto", "fm", "crop", "dpr"].forEach((p) => u.searchParams.delete(p));
    let path = u.pathname
      .replace(/-\d+x\d+(\.[a-zA-Z]+)$/, "$1")
      .replace(/_\d+x\d+(\.[a-zA-Z]+)$/, "$1")
      .replace(/@[0-9.]+x(\.[a-zA-Z]+)$/, "$1")
      .replace(/-(scaled|large|medium|small|thumbnail|full|crop|original)(\.[a-zA-Z]+)$/, "$2")
      .replace(/\/(w_\d+|h_\d+|c_\w+|f_\w+|q_\w+|ar_\w+),?/g, "/")
      .replace(/\/\/+/g, "/");
    u.pathname = path;
    return u.origin + u.pathname;
  } catch {
    return src;
  }
}

// Extract the highest-resolution URL from a srcset string
function pickBestFromSrcset(srcset: string): string[] {
  const results: string[] = [];
  if (!srcset) return results;
  srcset.split(",").forEach((entry) => {
    const parts = entry.trim().split(/\s+/);
    if (parts[0]) results.push(parts[0]);
  });
  return results;
}

// ────────────────────────────────────────────────────────────────
// SCORING — higher = better quality / more useful image
// ────────────────────────────────────────────────────────────────

function scoreImage(u: string): number {
  const lower = u.toLowerCase();
  let score = 0;

  // Dimension hints in the URL
  const dimMatch = u.match(/[_\-](\d{3,4})x(\d{3,4})/i);
  if (dimMatch) {
    const w = parseInt(dimMatch[1]), h = parseInt(dimMatch[2]);
    if (w >= 1600 || h >= 1600) score += 40;
    else if (w >= 1200 || h >= 1200) score += 30;
    else if (w >= 800  || h >= 800)  score += 20;
    else if (w >= 400  || h >= 400)  score += 8;
    else score -= 15;
  }

  // Query-string width hints
  const wMatch = u.match(/[?&](?:w|width|imwidth|imageWidth)=(\d+)/i);
  if (wMatch) {
    const w = parseInt(wMatch[1]);
    if (w >= 1600) score += 35;
    else if (w >= 1200) score += 25;
    else if (w >= 800)  score += 15;
    else if (w >= 400)  score += 5;
    else if (w < 200)   score -= 25;
  }

  // Modern formats preferred
  if (/\.(webp|avif)(\?|$)/i.test(u)) score += 5;

  // High-value path keywords
  if (/\/(product|hero|banner|feature|gallery|portfolio|campaign|lifestyle|collection|look|editorial|showcase|flagship)/i.test(lower)) score += 20;
  if (/\/(about|brand|identity|team|story|culture|history)/i.test(lower)) score += 12;
  if (/\/(images?|img|media|photos?|assets?|uploads?|static|content)\//i.test(lower)) score += 5;
  if (/zoom|retina|highres|fullsize|full[_\-]?size|hi[_\-]?res|@2x|@3x|original/i.test(lower)) score += 18;

  // Social/OG images are always high quality
  if (/og[_\-]?image|social[_\-]?share|opengraph/i.test(lower)) score += 25;

  // Penalise thumbnails and small variants
  if (/thumbnail|thumb|\bsmall\b|\bmini\b|[_\-]sm[_\-]|[_\-]xs[_\-]|\bpreview\b/i.test(lower)) score -= 25;
  if (/[_\-](50|75|80|100|120|150)x/i.test(u)) score -= 20;
  if (/icon|sprite|arrow|check|star|dot|close|menu|placeholder/i.test(lower)) score -= 30;

  // Cloudinary / imgix transforms that target small sizes
  if (/[,/]w_(\d+)[,/]/i.test(u)) {
    const m = u.match(/[,/]w_(\d+)[,/]/i);
    if (m && parseInt(m[1]) < 300) score -= 20;
    else if (m && parseInt(m[1]) >= 800) score += 15;
  }

  return score;
}

// ────────────────────────────────────────────────────────────────
// SCROLL & INTERACTION
// ────────────────────────────────────────────────────────────────

async function autoScroll(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      let lastImgCount = 0;
      let stallCount = 0;
      const distance = 600;
      const maxStalls = 5;    // stop after 5 consecutive scrolls with no new images
      const maxHeight = 25000; // absolute safety cap

      const timer = setInterval(() => {
        const currentImgCount = document.querySelectorAll("img, [style*='background-image']").length;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (currentImgCount === lastImgCount) {
          stallCount++;
        } else {
          stallCount = 0;
          lastImgCount = currentImgCount;
        }

        const atBottom = totalHeight + window.innerHeight >= document.body.scrollHeight;
        if (atBottom || totalHeight > maxHeight || stallCount >= maxStalls) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 120);
    });
  });
  // Scroll back slowly to trigger IntersectionObserver-based lazy loaders
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const total = document.body.scrollHeight;
      let pos = 0;
      const step = 400;
      const timer = setInterval(() => {
        pos += step;
        window.scrollTo(0, pos);
        if (pos >= total) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 80);
    });
  });
}

async function dismissPopups(page: Page) {
  const selectors = [
    'button[id*="accept"]', 'button[id*="cookie"]', 'button[class*="accept"]',
    'button[class*="cookie"]', 'a[id*="accept"]', '[data-testid*="accept"]',
    'button[aria-label*="Accept"]', 'button[aria-label*="accept"]',
    'button[aria-label*="Close"]', 'button[aria-label*="close"]',
    'button[aria-label*="Dismiss"]',
    '.modal-close', '.popup-close', '[class*="close-button"]',
    '[class*="dismiss"]', '[class*="consent"] button',
    '#onetrust-accept-btn-handler', '.cc-dismiss', '.cc-allow',
    '[data-cookie-accept]', '.gdpr-accept', '[class*="gdpr"] button',
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 250 })) {
        await btn.click({ timeout: 400 });
        await page.waitForTimeout(250);
      }
    } catch { /* expected */ }
  }
}

async function clickCarousels(page: Page): Promise<void> {
  const nextSelectors = [
    '[class*="slick-next"]', '[class*="swiper-next"]', '[class*="carousel-next"]',
    '[class*="arrow-next"]', '[class*="arrow-right"]', '[data-slide="next"]',
    '[aria-label="Next"]', '[aria-label="Next slide"]', '[aria-label="next"]',
    'button[class*="next"]', '[class*="owl-next"]', '[class*="flickity-next"]',
    '[class*="glide__arrow--right"]', '[data-controls="next"]',
    '[class*="splide__arrow--next"]', '[class*="embla__next"]',
  ];

  for (const sel of nextSelectors) {
    try {
      const btns = page.locator(sel);
      const count = await btns.count();
      for (let b = 0; b < Math.min(count, 6); b++) {
        const btn = btns.nth(b);
        if (!(await btn.isVisible({ timeout: 200 }))) continue;
        let clicks = 0;
        while (clicks < 20) {
          const isDisabled = await btn.evaluate((el: Element) =>
            (el as HTMLButtonElement).disabled ||
            el.getAttribute("aria-disabled") === "true" ||
            el.classList.contains("disabled") ||
            el.classList.contains("is-disabled")
          );
          if (isDisabled) break;
          try { await btn.click({ timeout: 300 }); } catch { break; }
          await page.waitForTimeout(150);
          clicks++;
        }
      }
    } catch { /* carousel absent */ }
  }

  // Trigger tab panels and accordions to expose hidden images
  const tabSelectors = [
    '[role="tab"]', '[class*="tab-item"]', '[class*="tab-link"]',
    '[class*="accordion"] button', '[data-toggle="collapse"]',
  ];
  for (const sel of tabSelectors) {
    try {
      const tabs = page.locator(sel);
      const count = await tabs.count();
      for (let i = 0; i < Math.min(count, 8); i++) {
        try {
          await tabs.nth(i).click({ timeout: 300 });
          await page.waitForTimeout(200);
        } catch { /* skip */ }
      }
    } catch { /* absent */ }
  }
}

// ────────────────────────────────────────────────────────────────
// MAIN DOM SCRAPER — runs inside the browser context
// ────────────────────────────────────────────────────────────────

async function scrapePage(page: Page) {
  return page.evaluate(() => {
    // ── helpers ──
    const rgb2hex = (rgb: string) => {
      const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return rgb;
      return "#" + [m[1], m[2], m[3]].map((n) => parseInt(n, 10).toString(16).padStart(2, "0")).join("");
    };

    const seenSrcs = new Set<string>();
    const images: string[] = [];

    const addImg = (src: string | null | undefined, base?: string) => {
      if (!src) return;
      let s = src.trim();
      // Handle srcset-style strings
      if (/\s+\d+(\.\d+)?[wx]/.test(s) || /,\s*https?:\/\//.test(s)) {
        s.split(",").forEach((entry) => {
          const u = entry.trim().split(/\s+/)[0];
          if (u) addImg(u, base);
        });
        return;
      }
      if (s.startsWith("//")) s = "https:" + s;
      if (s.startsWith("/") && !s.startsWith("//") && base) {
        try { s = new URL(s, base || document.baseURI).href; } catch { return; }
      }
      if (!s.startsWith("http")) return;
      if (s.includes(" ")) return;
      if (!seenSrcs.has(s)) {
        seenSrcs.add(s);
        images.push(s);
      }
    };

    const base = document.baseURI;

    // ══════════════════════════════════════════════════════════
    // LOGO DETECTION (10 strategies)
    // ══════════════════════════════════════════════════════════
    let logoUrl = "";

    const headerAreas = document.querySelectorAll("header, nav, [class*='header'], [class*='navbar'], [id*='header'], [id*='nav']");
    for (const area of Array.from(headerAreas)) {
      if (logoUrl) break;
      for (const img of Array.from(area.querySelectorAll("img"))) {
        const combined = (img.src + img.alt + img.className + img.id).toLowerCase();
        if (combined.includes("logo") || combined.includes("brand") || img.closest("a[href='/']")) {
          logoUrl = img.src || img.getAttribute("data-src") || "";
          break;
        }
      }
      if (!logoUrl) {
        for (const svg of Array.from(area.querySelectorAll("svg"))) {
          const parent = svg.closest("a");
          if (parent && (parent.getAttribute("href") === "/" || parent.getAttribute("href") === "./")) {
            try {
              const svgStr = new XMLSerializer().serializeToString(svg);
              logoUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgStr)));
              break;
            } catch { /* skip */ }
          }
        }
      }
    }
    if (!logoUrl) {
      for (const img of Array.from(document.querySelectorAll("img"))) {
        const combined = (img.src + img.alt + img.className + img.id + (img.getAttribute("data-src") || "")).toLowerCase();
        if (combined.includes("logo") || combined.includes("brand-mark")) {
          logoUrl = img.src || img.getAttribute("data-src") || ""; break;
        }
      }
    }
    if (!logoUrl) {
      for (const link of Array.from(document.querySelectorAll('a[href="/"], a[href="./"]'))) {
        const img = link.querySelector("img");
        if (img?.src) { logoUrl = img.src; break; }
      }
    }
    if (!logoUrl) {
      const apple = document.querySelector('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]');
      if (apple) logoUrl = (apple as HTMLLinkElement).href;
    }
    if (!logoUrl) {
      const og = document.querySelector('meta[property="og:image"]');
      if (og) logoUrl = (og as HTMLMetaElement).content;
    }
    if (!logoUrl) {
      const icon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
      if (icon) logoUrl = (icon as HTMLLinkElement).href;
    }
    if (!logoUrl) {
      const manifest = document.querySelector('link[rel="manifest"]');
      if (manifest) logoUrl = "__MANIFEST__:" + (manifest as HTMLLinkElement).href;
    }

    // ══════════════════════════════════════════════════════════
    // STRATEGY 1 — Social / OG / Twitter meta tags (highest quality)
    // ══════════════════════════════════════════════════════════
    const socialImages: string[] = [];
    const metaSelectors = [
      'meta[property="og:image"]',
      'meta[property="og:image:secure_url"]',
      'meta[name^="twitter:image"]',
      'meta[property="pinterest:media"]',
      'meta[name="thumbnail"]',
      'meta[itemprop="image"]',
      'meta[property="og:image:url"]',
    ];
    for (const sel of metaSelectors) {
      document.querySelectorAll(sel).forEach((tag) => {
        const url = (tag as HTMLMetaElement).content;
        if (url?.startsWith("http")) socialImages.push(url);
      });
    }
    // <link rel="image_src"> — used by some CMSs
    document.querySelectorAll('link[rel="image_src"]').forEach((l) => {
      const href = (l as HTMLLinkElement).href;
      if (href?.startsWith("http")) socialImages.push(href);
    });
    // <link rel="preload" as="image"> — browser hint for hero images
    document.querySelectorAll('link[rel="preload"][as="image"]').forEach((l) => {
      const href = (l as HTMLLinkElement).href;
      if (href?.startsWith("http")) socialImages.push(href);
      const imagesrcset = l.getAttribute("imagesrcset");
      if (imagesrcset) {
        imagesrcset.split(",").forEach((entry) => {
          const u = entry.trim().split(/\s+/)[0];
          try { socialImages.push(new URL(u, base).href); } catch { /* skip */ }
        });
      }
    });

    // ══════════════════════════════════════════════════════════
    // STRATEGY 2 — All <img> tags with every lazy-load attribute
    // ══════════════════════════════════════════════════════════
    const lazyAttrs = [
      "src", "data-src", "data-lazy-src", "data-original", "data-lazy",
      "data-image", "data-bg", "data-full", "data-hi-res", "loading-src",
      "data-src-lg", "data-src-large", "data-lazy-load", "data-url",
      "data-img-src", "data-imgurl", "data-thumb", "data-large-file",
      "data-orig-file", "data-medium-file", "data-full-url", "data-natural-src",
      "data-zoom-src", "data-big", "data-highres", "data-retina",
      "data-normal", "data-2x", "data-hi", "data-full-size",
    ];
    for (const img of Array.from(document.querySelectorAll("img"))) {
      for (const attr of lazyAttrs) {
        const val = img.getAttribute(attr);
        if (val) addImg(val, base);
      }
      // srcset variants
      for (const attr of ["srcset", "data-srcset", "data-sizes"]) {
        const srcset = img.getAttribute(attr);
        if (srcset) {
          srcset.split(",").forEach((entry) => {
            const u = entry.trim().split(/\s+/)[0];
            if (u) try { addImg(new URL(u, base).href); } catch { addImg(u); }
          });
        }
      }
      // currentSrc (set by browser after responsive selection)
      if ((img as HTMLImageElement).currentSrc) addImg((img as HTMLImageElement).currentSrc);
    }

    // ══════════════════════════════════════════════════════════
    // STRATEGY 3 — <picture> <source> elements
    // ══════════════════════════════════════════════════════════
    for (const source of Array.from(document.querySelectorAll("picture source"))) {
      for (const attr of ["srcset", "data-srcset"]) {
        const srcset = source.getAttribute(attr);
        if (srcset) {
          srcset.split(",").forEach((entry) => {
            const u = entry.trim().split(/\s+/)[0];
            try { addImg(new URL(u, base).href); } catch { addImg(u); }
          });
        }
      }
    }

    // ══════════════════════════════════════════════════════════
    // STRATEGY 4 — Video poster images
    // ══════════════════════════════════════════════════════════
    for (const video of Array.from(document.querySelectorAll("video[poster]"))) {
      addImg(video.getAttribute("poster"), base);
    }

    // ══════════════════════════════════════════════════════════
    // STRATEGY 5 — CSS background-image (computed styles)
    // ══════════════════════════════════════════════════════════
    const cssTargets = Array.from(document.querySelectorAll(
      "header,footer,nav,main,section,article,aside,div,span,a,button,figure,h1,h2,h3,h4,h5,h6,p,li," +
      "[class*='hero'],[class*='banner'],[class*='slide'],[class*='bg'],[class*='image'],[class*='thumb']," +
      "[class*='card'],[class*='cover'],[class*='feature'],[class*='gallery'],[class*='grid'],[class*='product']," +
      "[style*='background']"
    ));

    const colors = new Set<string>();
    const fonts = new Set<string>();

    for (const el of [document.body, ...cssTargets].slice(0, 800)) {
      try {
        const cs = window.getComputedStyle(el);
        const bg = cs.backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") colors.add(rgb2hex(bg));
        if (cs.color) colors.add(rgb2hex(cs.color));
        const border = cs.borderColor;
        if (border && border !== "rgba(0, 0, 0, 0)" && border !== "transparent" && border !== "rgb(0, 0, 0)") {
          colors.add(rgb2hex(border));
        }
        if (cs.fontFamily) {
          const primary = cs.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
          if (primary && primary !== "inherit" && primary !== "initial") fonts.add(primary);
        }
        const bgImg = cs.backgroundImage;
        if (bgImg && bgImg !== "none") {
          for (const m of bgImg.matchAll(/url\(["']?(.*?)["']?\)/g)) {
            if (m[1] && !m[1].startsWith("data:image/svg") && !m[1].startsWith("data:image/gif")) {
              try { addImg(new URL(m[1], base).href); } catch { addImg(m[1]); }
            }
          }
        }
      } catch { /* skip */ }
    }

    // ══════════════════════════════════════════════════════════
    // STRATEGY 6 — Inline style attributes background-image
    // ══════════════════════════════════════════════════════════
    for (const el of Array.from(document.querySelectorAll("[style*='background']"))) {
      const style = el.getAttribute("style") || "";
      for (const m of style.matchAll(/url\(["']?(.*?)["']?\)/g)) {
        try { addImg(new URL(m[1], base).href); } catch { addImg(m[1]); }
      }
    }
    // data-bg and data-background attributes
    for (const attr of ["data-bg", "data-background", "data-background-image", "data-cover"]) {
      for (const el of Array.from(document.querySelectorAll(`[${attr}]`))) {
        const val = el.getAttribute(attr);
        if (val) {
          if (val.startsWith("http") || val.startsWith("/")) addImg(val, base);
          // might be an inline style value
          for (const m of val.matchAll(/url\(["']?(.*?)["']?\)/g)) {
            try { addImg(new URL(m[1], base).href); } catch { addImg(m[1]); }
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════
    // STRATEGY 7 — <a href> linking directly to image files
    // ══════════════════════════════════════════════════════════
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      const href = (a as HTMLAnchorElement).href;
      if (/\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(href)) addImg(href);
    }

    // ══════════════════════════════════════════════════════════
    // STRATEGY 8 — <noscript> fallback (full-res behind lazy loaders)
    // ══════════════════════════════════════════════════════════
    for (const ns of Array.from(document.querySelectorAll("noscript"))) {
      const raw = ns.textContent || "";
      for (const m of raw.matchAll(/(?:src|data-src|data-lazy-src)=["']([^"']+)["']/g)) {
        try { addImg(new URL(m[1], base).href); } catch { addImg(m[1]); }
      }
      for (const m of raw.matchAll(/srcset=["']([^"']+)["']/g)) {
        m[1].split(",").forEach((entry) => {
          const u = entry.trim().split(/\s+/)[0];
          try { addImg(new URL(u, base).href); } catch { addImg(u); }
        });
      }
    }

    // ══════════════════════════════════════════════════════════
    // STRATEGY 9 — JSON-LD structured data (schema.org)
    // ══════════════════════════════════════════════════════════
    for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
      try {
        const walk = (obj: unknown): void => {
          if (!obj || typeof obj !== "object") return;
          if (Array.isArray(obj)) { (obj as unknown[]).forEach(i => walk(i)); return; }
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            if (
              ["image", "url", "contentUrl", "thumbnailUrl", "photo", "logo"].includes(k) &&
              typeof v === "string" && /^https?:\/\//.test(v)
            ) {
              addImg(v);
            } else if (v && typeof v === "object") {
              walk(v);
            }
          }
        };
        walk(JSON.parse(script.textContent || "{}"));
      } catch { /* skip */ }
    }

    // ══════════════════════════════════════════════════════════
    // STRATEGY 10 — Zoom / high-res product data attributes
    // ══════════════════════════════════════════════════════════
    const zoomAttrs = [
      "data-zoom-image", "data-large", "data-full-src", "data-retina-src",
      "data-echo", "data-highres", "data-big", "data-photo",
      "data-original-src", "data-full-size-url", "data-zoom-src",
      "data-gallery", "data-lightbox", "data-fancybox",
      "data-mfp-src", "data-photoswipe-src",
    ];
    for (const el of Array.from(document.querySelectorAll(zoomAttrs.map(a => `[${a}]`).join(",")))) {
      for (const attr of zoomAttrs) {
        const val = el.getAttribute(attr);
        if (val) { try { addImg(new URL(val, base).href); } catch { addImg(val); } }
      }
    }

    // ══════════════════════════════════════════════════════════
    // STRATEGY 11 — <template> tags (Vue, Web Components)
    // ══════════════════════════════════════════════════════════
    for (const tpl of Array.from(document.querySelectorAll("template"))) {
      try {
        const content = tpl.content;
        for (const img of Array.from(content.querySelectorAll("img"))) {
          const s = img.getAttribute("src") || img.getAttribute("data-src");
          if (s) addImg(s, base);
        }
      } catch { /* skip */ }
    }

    // ══════════════════════════════════════════════════════════
    // STRATEGY 12 — Image maps (<map><area>)
    // ══════════════════════════════════════════════════════════
    for (const area of Array.from(document.querySelectorAll("area[href]"))) {
      const href = (area as HTMLAreaElement).href;
      if (/\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(href)) addImg(href);
    }

    // ══════════════════════════════════════════════════════════
    // STRATEGY 13 — Inline <style> blocks
    // ══════════════════════════════════════════════════════════
    for (const style of Array.from(document.querySelectorAll("style"))) {
      const css = style.textContent || "";
      for (const m of css.matchAll(/url\(["']?(https?:\/\/[^"')]+)["']?\)/g)) {
        addImg(m[1]);
      }
    }

    // ══════════════════════════════════════════════════════════
    // STRATEGY 14 — Extract from embedded JavaScript globals
    //   (Next.js __NEXT_DATA__, Nuxt __NUXT__, custom window vars)
    // ══════════════════════════════════════════════════════════
    const walkJsonForImages = (obj: unknown, out: string[]) => {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) { obj.forEach(i => walkJsonForImages(i, out)); return; }
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (
          typeof v === "string" &&
          /^https?:\/\/.+\.(jpg|jpeg|png|webp|avif)/i.test(v) &&
          !["script", "html", "css", "js"].some(x => v.includes(x))
        ) {
          out.push(v);
        } else if (v && typeof v === "object") {
          walkJsonForImages(v, out);
        }
        void k;
      }
    };
    for (const script of Array.from(document.querySelectorAll("script:not([src])"))) {
      const text = script.textContent || "";
      // Next.js __NEXT_DATA__
      const nextMatch = text.match(/\b__NEXT_DATA__\s*=\s*(\{[\s\S]+?\});?\s*(?:$|<\/script>)/);
      if (nextMatch) {
        try {
          const out: string[] = [];
          walkJsonForImages(JSON.parse(nextMatch[1]), out);
          out.forEach(u => addImg(u));
        } catch { /* skip */ }
      }
      // Nuxt __NUXT__
      const nuxtMatch = text.match(/\b__NUXT__\s*=\s*(\{[\s\S]+?\});?\s*(?:$|<\/script>)/);
      if (nuxtMatch) {
        try {
          const out: string[] = [];
          walkJsonForImages(JSON.parse(nuxtMatch[1]), out);
          out.forEach(u => addImg(u));
        } catch { /* skip */ }
      }
      // Generic JSON blobs containing image URLs
      const jsonBlobs = text.matchAll(/\{[^{}]{50,}\}/g);
      for (const blob of jsonBlobs) {
        if (blob[0].includes(".jpg") || blob[0].includes(".png") || blob[0].includes(".webp")) {
          try {
            const out: string[] = [];
            walkJsonForImages(JSON.parse(blob[0]), out);
            out.slice(0, 20).forEach(u => addImg(u));
          } catch { /* skip */ }
        }
      }
    }

    // ══════════════════════════════════════════════════════════
    // STRATEGY 15 — Figcaption / figure / item containers
    //   (lightbox galleries that store full URL in data-href or similar)
    // ══════════════════════════════════════════════════════════
    for (const fig of Array.from(document.querySelectorAll("figure, [class*='gallery-item'], [class*='grid-item'], [class*='portfolio-item']"))) {
      for (const attr of ["data-href", "data-src", "data-url", "data-full", "data-original"]) {
        const val = fig.getAttribute(attr);
        if (val && /\.(jpg|jpeg|png|webp|avif)/i.test(val)) addImg(val, base);
      }
    }

    // ══════════════════════════════════════════════════════════
    // TEXT extraction
    // ══════════════════════════════════════════════════════════
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";

    const textParts: string[] = [];
    if (ogTitle) textParts.push(ogTitle);
    if (metaDesc) textParts.push(metaDesc);
    if (ogDesc && ogDesc !== metaDesc) textParts.push(ogDesc);

    const contentSelectors = [
      "h1", "h2", "h3", "h4",
      "[class*='hero'] p", "[class*='hero'] h1", "[class*='hero'] h2",
      "[class*='tagline']", "[class*='slogan']", "[class*='headline']",
      "[class*='subtitle']", "[class*='description']",
      "main p", "article p", "section p",
      "p", "li", "blockquote", "figcaption",
      "[class*='feature'] h3", "[class*='feature'] p",
      "[class*='about'] p", "[class*='mission'] p",
      "footer p",
    ];
    for (const sel of contentSelectors) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const t = el.textContent?.trim();
        if (t && t.length > 5 && !textParts.includes(t)) textParts.push(t);
      }
    }

    for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
      try {
        const data = JSON.parse(script.textContent || "");
        if (data.description) textParts.push(data.description);
        if (data.name) textParts.push(data.name);
        if (data.slogan) textParts.push(data.slogan);
      } catch { /* skip */ }
    }

    const textSample = textParts.join(" | ").slice(0, 5000);

    // ══════════════════════════════════════════════════════════
    // INTERNAL LINKS
    // ══════════════════════════════════════════════════════════
    const baseHostname = window.location.hostname;
    const seenPaths = new Set<string>([window.location.pathname]);
    const internalLinks: string[] = [];
    const skipPatterns = ["login", "signin", "signup", "register", "cart", "checkout",
      "account", "privacy", "terms", "cookie", "legal", "#", "mailto:", "tel:", "javascript:", "cdn-cgi"];

    const navAreas = document.querySelectorAll("nav, header, [role='navigation'], [class*='nav'], [class*='menu']");
    for (const area of Array.from(navAreas)) {
      for (const a of Array.from(area.querySelectorAll("a[href]"))) {
        try {
          const href = new URL((a as HTMLAnchorElement).href, document.baseURI);
          const path = href.pathname.toLowerCase();
          if (href.hostname === baseHostname && !seenPaths.has(href.pathname) && path !== "/") {
            if (!skipPatterns.some((s) => path.includes(s) || href.href.includes(s))) {
              seenPaths.add(href.pathname);
              internalLinks.push(href.href);
            }
          }
        } catch { /* skip */ }
      }
    }
    // Fallback
    if (internalLinks.length < 8) {
      for (const a of Array.from(document.querySelectorAll("a[href]"))) {
        if (internalLinks.length >= 12) break;
        try {
          const href = new URL((a as HTMLAnchorElement).href, document.baseURI);
          const path = href.pathname.toLowerCase();
          if (href.hostname === baseHostname && !seenPaths.has(href.pathname) && path !== "/" && path.split("/").length <= 3) {
            if (!skipPatterns.some((s) => path.includes(s) || href.href.includes(s))) {
              seenPaths.add(href.pathname);
              internalLinks.push(href.href);
            }
          }
        } catch { /* skip */ }
      }
    }

    // Social images at front (highest quality), then the rest
    const allImages = [...new Set([...socialImages, ...images])];

    return {
      colors: Array.from(colors).filter((c) => c.startsWith("#")).slice(0, 25),
      fonts: Array.from(fonts).slice(0, 8),
      logoUrl,
      images: allImages,
      textSample,
      pageTitle: document.title,
      internalLinks: internalLinks.slice(0, 12),
    };
  });
}

// ────────────────────────────────────────────────────────────────
// E-COMMERCE + CMS API SCRAPERS
// ────────────────────────────────────────────────────────────────

function extractImagesFromJson(obj: unknown, results: string[]): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) { for (const item of obj) extractImagesFromJson(item, results); return; }
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (typeof value === "string" && /https?:\/\/.+\.(jpg|jpeg|png|webp|avif)/i.test(value)) {
      if (isUsefulImage(value)) results.push(value);
    } else if (value && typeof value === "object") {
      extractImagesFromJson(value, results);
    }
  }
}

async function scrapeEcommerceApis(origin: string): Promise<string[]> {
  const images: string[] = [];
  const headers = { "User-Agent": "Mozilla/5.0 (compatible)" };

  // ── Shopify
  try {
    const res = await fetch(`${origin}/products.json?limit=250`, { signal: AbortSignal.timeout(7000), headers });
    if (res.ok) {
      const data = await res.json();
      if (data.products) {
        for (const product of data.products.slice(0, 100)) {
          if (product.images) {
            for (const img of product.images) {
              if (img.src && isUsefulImage(img.src)) images.push(img.src);
            }
          }
          if (product.variants) {
            for (const v of product.variants) {
              if (v.featured_image?.src && isUsefulImage(v.featured_image.src)) images.push(v.featured_image.src);
            }
          }
        }
        console.log(`[extract-dna] 🛍 Shopify API: +${images.length} images`);
      }
    }
  } catch { /* not shopify */ }

  // ── Shopify collections
  if (images.length < 50) {
    try {
      const res = await fetch(`${origin}/collections.json?limit=50`, { signal: AbortSignal.timeout(5000), headers });
      if (res.ok) {
        const data = await res.json();
        if (data.collections) {
          for (const col of data.collections) {
            if (col.image?.src && isUsefulImage(col.image.src)) images.push(col.image.src);
          }
        }
      }
    } catch { /* skip */ }
  }

  // ── WooCommerce
  try {
    const res = await fetch(`${origin}/wp-json/wc/v3/products?per_page=100&_fields=id,images`, { signal: AbortSignal.timeout(7000), headers });
    if (res.ok) {
      const products = await res.json();
      if (Array.isArray(products)) {
        for (const product of products.slice(0, 100)) {
          if (product.images) {
            for (const img of product.images) {
              if (img.src && isUsefulImage(img.src)) images.push(img.src);
            }
          }
        }
        console.log(`[extract-dna] 🔧 WooCommerce API: +${images.length} images`);
      }
    }
  } catch { /* not woo */ }

  // ── WordPress Media Library (all media, not just products)
  try {
    const res = await fetch(`${origin}/wp-json/wp/v2/media?per_page=100&media_type=image&_fields=source_url,media_details`, { signal: AbortSignal.timeout(7000), headers });
    if (res.ok) {
      const media = await res.json();
      if (Array.isArray(media)) {
        for (const item of media) {
          if (item.source_url && isUsefulImage(item.source_url)) images.push(item.source_url);
          // Also grab all available sizes
          if (item.media_details?.sizes) {
            for (const size of Object.values(item.media_details.sizes) as any[]) {
              if (size.source_url && isUsefulImage(size.source_url)) images.push(size.source_url);
            }
          }
        }
        console.log(`[extract-dna] 📰 WP Media API: +${images.length} total images`);
      }
    }
  } catch { /* not wp */ }

  // ── Magento
  try {
    const res = await fetch(`${origin}/rest/V1/products?searchCriteria[pageSize]=100&fields=items[id,media_gallery_entries]`, { signal: AbortSignal.timeout(7000), headers });
    if (res.ok) {
      const data = await res.json();
      if (data.items) {
        for (const product of data.items.slice(0, 100)) {
          if (product.media_gallery_entries) {
            for (const media of product.media_gallery_entries) {
              const src = media.file ? `${origin}/media/catalog/product${media.file}` : null;
              if (src && isUsefulImage(src)) images.push(src);
            }
          }
        }
        console.log(`[extract-dna] 🏗 Magento API: +${images.length} images`);
      }
    }
  } catch { /* not magento */ }

  return images;
}

// ────────────────────────────────────────────────────────────────
// EXTERNAL CSS — scrape background-image URLs
// ────────────────────────────────────────────────────────────────

async function fetchExternalCssImages(page: Page): Promise<string[]> {
  const cssUrls: string[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((l) => (l as HTMLLinkElement).href)
      .filter((h) => h.startsWith("http"))
      .slice(0, 10)
  );
  const images: string[] = [];
  await Promise.allSettled(
    cssUrls.map(async (cssUrl) => {
      try {
        const resp = await fetch(cssUrl, { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "Mozilla/5.0 (compatible)" } });
        if (!resp.ok) return;
        const text = await resp.text();
        for (const m of text.matchAll(/url\(["']?(https?:\/\/[^"')]+)["']?\)/g)) {
          if (isUsefulImage(m[1])) images.push(m[1]);
        }
      } catch { /* CSS fetch failed */ }
    })
  );
  return images;
}

// ────────────────────────────────────────────────────────────────
// SITEMAP CRAWL
// ────────────────────────────────────────────────────────────────

async function fetchSitemapUrls(origin: string): Promise<string[]> {
  const headers = { "User-Agent": "Mozilla/5.0 (compatible)" };
  const allUrls: string[] = [];

  const parseSitemapXml = (text: string): string[] =>
    [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

  const tryFetch = async (url: string): Promise<string | null> => {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000), headers });
      return resp.ok ? await resp.text() : null;
    } catch { return null; }
  };

  // Try sitemap index first
  const sitemapPaths = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/sitemaps/sitemap.xml"];
  for (const path of sitemapPaths) {
    const text = await tryFetch(`${origin}${path}`);
    if (!text) continue;

    const locs = parseSitemapXml(text);
    if (locs.some(u => u.endsWith(".xml"))) {
      // It's a sitemap index — fetch the first sub-sitemaps in parallel
      const subSitemaps = locs.filter(u => u.endsWith(".xml")).slice(0, 5);
      const subTexts = await Promise.all(subSitemaps.map(tryFetch));
      for (const st of subTexts) {
        if (st) allUrls.push(...parseSitemapXml(st));
      }
    } else {
      allUrls.push(...locs);
    }
    if (allUrls.length > 0) break;
  }

  const useful = allUrls.filter((u) =>
    /\/(product|collection|gallery|shop|catalog|item|category|portfolio|about|brand|lifestyle|look)/i.test(u)
  );
  if (useful.length > 0) console.log(`[extract-dna] 🗺 Sitemap: ${useful.length} useful URLs`);
  return useful.slice(0, 10);
}

// ────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  let browser: Browser | null = null;

  try {
    const body = await req.json();
    const rawUrl = body?.url;
    if (!rawUrl) return NextResponse.json({ error: "URL is required" }, { status: 400 });

    const metered = await meterIfAuthed('sam', 'research');
    if (!metered.ok) return metered.response;

    const url = normalizeUrl(rawUrl);
    console.log("[extract-dna] 🚀 Starting deep extraction for:", url);

    let textSample = "";
    let extractedColors: string[] = [];
    let extractedFonts: string[] = [];
    let extractedLogo = "";
    let extractedImages: string[] = [];
    let pageTitle = "";

    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
      });

      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        viewport: { width: 1440, height: 900 },
        extraHTTPHeaders: {
          "Accept-Language": "en-US,en;q=0.9",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        },
        javaScriptEnabled: true,
        bypassCSP: true,
      });

      // Block heavy non-image assets
      await context.route("**/*.{mp4,webm,ogg,mp3,wav,flac,woff2,woff,ttf,eot,pdf,zip}", (route) => route.abort());

      const page = await context.newPage();

      // ── NETWORK INTERCEPTION — captures every image request the browser makes
      const networkImages: string[] = [];
      const jsonImagePromises: Promise<void>[] = [];

      page.on("response", (response) => {
        try {
          const respUrl = response.url();
          const ct = response.headers()["content-type"] || "";
          if (
            (ct.startsWith("image/jpeg") || ct.startsWith("image/png") ||
              ct.startsWith("image/webp") || ct.startsWith("image/avif") ||
              /\.(jpg|jpeg|png|webp|avif)(\?|#|$)/i.test(respUrl)) &&
            isUsefulImage(respUrl)
          ) {
            networkImages.push(respUrl);
          }
          if (ct.includes("application/json") && !respUrl.match(/analytics|tracking|gtm|google|facebook|hotjar|segment/i)) {
            const p = response.json()
              .then((json) => extractImagesFromJson(json, networkImages))
              .catch(() => {});
            jsonImagePromises.push(p);
          }
        } catch { /* */ }
      });

      console.log("[extract-dna] 📄 Loading main page...");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      try { await page.waitForLoadState("networkidle", { timeout: 5000 }); } catch { /* ok */ }

      await dismissPopups(page);
      console.log("[extract-dna] 📜 Scrolling + interacting...");
      await autoScroll(page);
      await clickCarousels(page);
      await page.waitForTimeout(500);

      const mainData = await scrapePage(page);
      extractedColors = mainData.colors;
      extractedFonts = mainData.fonts;
      extractedLogo = mainData.logoUrl;
      extractedImages = [...mainData.images];
      textSample = mainData.textSample;
      pageTitle = mainData.pageTitle;

      console.log(`[extract-dna] ✅ Main page: ${extractedImages.length} images, ${extractedColors.length} colors`);

      // ── SUB-PAGE CRAWLER
      const scrapeSubPage = async (link: string) => {
        const subPage = await context.newPage();
        try {
          await subPage.goto(link, { waitUntil: "domcontentloaded", timeout: 15000 });
          try { await subPage.waitForLoadState("networkidle", { timeout: 3000 }); } catch { /* ok */ }
          await dismissPopups(subPage);
          await autoScroll(subPage);
          await clickCarousels(subPage);
          const subData = await scrapePage(subPage);
          console.log(`[extract-dna]   ✅ ${link} — +${subData.images.length} images`);
          return subData;
        } catch (err) {
          console.warn(`[extract-dna]   ⚠ Failed: ${link}`, err);
          return null;
        } finally {
          await subPage.close();
        }
      };

      // Crawl up to 8 nav sub-pages + CSS + sitemap + e-commerce APIs all in parallel
      const internalLinks = mainData.internalLinks.slice(0, 8);
      const origin = new URL(url).origin;
      if (internalLinks.length > 0) {
        console.log(`[extract-dna] 🔗 Crawling ${internalLinks.length} sub-pages in parallel...`);
      }

      const [subResults, cssImages, sitemapUrls, ecommerceImages] = await Promise.all([
        Promise.allSettled(internalLinks.map(scrapeSubPage)),
        fetchExternalCssImages(page).catch(() => [] as string[]),
        fetchSitemapUrls(origin).catch(() => [] as string[]),
        scrapeEcommerceApis(origin).catch(() => [] as string[]),
      ]);

      // Merge sub-page results
      for (const result of subResults) {
        if (result.status !== "fulfilled" || !result.value) continue;
        const subData = result.value;
        for (const img of subData.images) {
          if (!extractedImages.includes(img)) extractedImages.push(img);
        }
        if (subData.textSample) textSample += " | " + subData.textSample;
        for (const c of subData.colors) {
          if (!extractedColors.includes(c)) extractedColors.push(c);
        }
      }

      // Merge CSS background images
      for (const img of cssImages) {
        if (!extractedImages.includes(img)) extractedImages.push(img);
      }
      if (cssImages.length > 0) console.log(`[extract-dna] 🎨 CSS: +${cssImages.length} images`);

      // Merge e-commerce API images
      for (const img of ecommerceImages) {
        if (!extractedImages.includes(img)) extractedImages.push(img);
      }

      // Crawl sitemap product/gallery pages not yet visited
      if (sitemapUrls.length > 0) {
        const crawledUrls = new Set([url, ...internalLinks]);
        const sitemapTargets = sitemapUrls.filter((u) => !crawledUrls.has(u)).slice(0, 6);
        if (sitemapTargets.length > 0) {
          console.log(`[extract-dna] 🗺 Crawling ${sitemapTargets.length} sitemap pages...`);
          const sitemapCrawlResults = await Promise.allSettled(sitemapTargets.map(scrapeSubPage));
          for (const result of sitemapCrawlResults) {
            if (result.status !== "fulfilled" || !result.value) continue;
            for (const img of result.value.images) {
              if (!extractedImages.includes(img)) extractedImages.push(img);
            }
          }
        }
      }

      // Flush JSON promises then merge all network-intercepted images
      await Promise.allSettled(jsonImagePromises);
      for (const img of networkImages) {
        if (!extractedImages.includes(img)) extractedImages.push(img);
      }
      console.log(`[extract-dna] 🌐 Network interception: +${networkImages.length} images`);

      // Handle manifest logo
      if (extractedLogo.startsWith("__MANIFEST__:")) {
        try {
          const manifestUrl = extractedLogo.replace("__MANIFEST__:", "");
          const manifestPage = await context.newPage();
          const resp = await manifestPage.goto(manifestUrl, { timeout: 5000 });
          const manifestJson = await resp?.json();
          if (manifestJson?.icons?.length > 0) {
            const bestIcon = manifestJson.icons[manifestJson.icons.length - 1];
            extractedLogo = new URL(bestIcon.src, manifestUrl).href;
          }
          await manifestPage.close();
        } catch { extractedLogo = ""; }
      }

      await browser.close();
      browser = null;

    } catch (err: unknown) {
      console.warn("[extract-dna] ⚠ Playwright failed, using HTTP fallback...", err);
      if (browser) { try { await browser.close(); } catch { /* */ } browser = null; }

      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", "Accept": "text/html,application/xhtml+xml" },
        });
        const html = await res.text();

        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) pageTitle = titleMatch[1].trim();

        const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        const metaDesc = metaMatch ? metaMatch[1] : "";

        const textContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ");
        textSample = (metaDesc + " | " + textContent).slice(0, 5000);

        // Extract all img src and srcset
        const imgRegex = /<img[^>]+>/gi;
        let imgTag;
        while ((imgTag = imgRegex.exec(html)) !== null && extractedImages.length < 200) {
          for (const attr of ["src", "data-src", "data-lazy-src", "data-original"]) {
            const m = imgTag[0].match(new RegExp(`${attr}=["'](https?://[^"']+)["']`, "i"));
            if (m && isUsefulImage(m[1])) extractedImages.push(m[1]);
          }
          const srcsetM = imgTag[0].match(/srcset=["']([^"']+)["']/i);
          if (srcsetM) {
            srcsetM[1].split(",").forEach((entry) => {
              const u = entry.trim().split(/\s+/)[0];
              if (u.startsWith("http") && isUsefulImage(u)) extractedImages.push(u);
            });
          }
        }

        // Background images from inline styles
        const bgRegex = /background(?:-image)?:\s*url\(["']?(https?:\/\/[^"')]+)["']?\)/gi;
        let match;
        while ((match = bgRegex.exec(html)) !== null && extractedImages.length < 250) {
          if (isUsefulImage(match[1])) extractedImages.push(match[1]);
        }

        // JSON-LD
        const jldRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
        let jldMatch;
        while ((jldMatch = jldRegex.exec(html)) !== null) {
          try {
            const out: string[] = [];
            extractImagesFromJson(JSON.parse(jldMatch[1]), out);
            out.forEach(u => { if (isUsefulImage(u)) extractedImages.push(u); });
          } catch { /* skip */ }
        }

        // Colors
        const colorRegex = /#([0-9a-fA-F]{3,8})\b/g;
        while ((match = colorRegex.exec(html)) !== null && extractedColors.length < 15) {
          const hex = "#" + match[1];
          if (hex.length === 4 || hex.length === 7) extractedColors.push(hex);
        }

        const logoMatch = html.match(/<img[^>]*(?:class|id|alt)=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i)
          || html.match(/<img[^>]*src=["']([^"']*logo[^"']*)["']/i);
        if (logoMatch) extractedLogo = logoMatch[1];

      } catch (fbErr) {
        console.error("[extract-dna] HTTP fallback also failed:", fbErr);
      }
    }

    // ── POST-PROCESSING ──

    // Filter junk
    extractedImages = extractedImages.filter(isUsefulImage);

    // Sort best quality first, then deduplicate by normalized URL
    extractedImages.sort((a, b) => scoreImage(b) - scoreImage(a));

    const seenNormalized = new Set<string>();
    const deduped: string[] = [];
    for (const img of extractedImages) {
      const key = normalizeImageUrl(img);
      if (!seenNormalized.has(key)) {
        seenNormalized.add(key);
        deduped.push(img);
      }
    }
    extractedImages = deduped; // no hard cap — keep all quality images

    // Remove images scoring very poorly (likely icons, tracking, or badges)
    extractedImages = extractedImages.filter((img) => scoreImage(img) > -20);

    console.log(`[extract-dna] 📊 After filter + dedup: ${extractedImages.length} quality images`);

    // Clearbit logo fallback
    if (!extractedLogo || !extractedLogo.startsWith("http")) {
      try {
        const domain = new URL(url).hostname;
        extractedLogo = `https://logo.clearbit.com/${domain}`;
        console.log("[extract-dna] 🔄 Using Clearbit fallback logo:", extractedLogo);
      } catch { /* */ }
    }

    textSample = textSample.slice(0, 6000);

    console.log(`[extract-dna] 📊 Final totals: ${extractedImages.length} images, ${extractedColors.length} colors, ${extractedFonts.length} fonts`);

    // ══════════════════════════════════════════════════════════
    // PHASE 2 — GEMINI DNA EXTRACTION
    // ══════════════════════════════════════════════════════════

    const dnaPrompt = `You are an expert Brand Analyst and designer. Analyze this website: ${url}

SCRAPED DATA:
- Page Title: "${pageTitle}"
- Extracted Colors: [${extractedColors.join(", ")}]
- Extracted Fonts: [${extractedFonts.join(", ")}]
- Logo URL: ${extractedLogo}
- Full Website Text (from homepage + internal pages): """${textSample}"""

YOUR TASK: Return ONLY a valid JSON object (no markdown, no explanation, no code fences) with this EXACT schema:
{
  "brandName": "The official brand/company name",
  "logoUrl": "${extractedLogo}",
  "colors": {
    "primary": "#hex - the main brand color",
    "secondary": "#hex - supporting color",
    "background": "#hex - page background",
    "textHighContrast": "#hex - main text color",
    "accent": "#hex - accent/CTA color"
  },
  "typography": {
    "headingFont": "exact Google Font name for headings",
    "bodyFont": "exact Google Font name for body"
  },
  "tagline": "the brand's actual tagline or a highly accurate 3-8 word one inferred from the website text",
  "brandValue": "comma-separated list of 4-6 core brand values inferred from the content",
  "brandAesthetic": "comma-separated list of 3-5 visual/aesthetic descriptors",
  "toneOfVoice": "comma-separated list of 3-5 tone descriptors",
  "businessOverview": "2-3 sentence overview of what this business does, their products/services, and their positioning",
  "images": []
}

STRICT REQUIREMENTS:
1. brandName MUST be the real brand name from the website, NOT the domain name.
2. Map the scraped hex colors to the semantic color roles intelligently.
3. tagline should be extracted from the hero section text if possible.
4. All fields MUST be filled with real, accurate data. NO placeholder or generic text.
5. businessOverview must describe the ACTUAL products/services mentioned.
6. If extracted fonts are system fonts, suggest the closest Google Font equivalent.
7. Return ONLY the JSON object. No other text.`;

    let parsedDna: any;
    try {
      const dnaResult = await callGemini({ taskType: "dna-extraction", prompt: dnaPrompt, mimeType: "application/json", minLength: 50 });
      parsedDna = JSON.parse(dnaResult.text);
    } catch (err: any) {
      console.warn("[extract-dna] DNA Gemini call failed, using raw scrape fallback:", err.message);
      parsedDna = {
        brandName: pageTitle.split("|")[0].split("-")[0].split("—")[0].trim() || "Unknown",
        logoUrl: extractedLogo,
        colors: {
          primary: extractedColors[0] || "#333", secondary: extractedColors[1] || "#666",
          background: "#fff", textHighContrast: "#000", accent: extractedColors[2] || "#0066ff",
        },
        typography: { headingFont: extractedFonts[0] || "Inter", bodyFont: extractedFonts[1] || "Inter" },
        tagline: "", brandValue: "", brandAesthetic: "", toneOfVoice: "",
        businessOverview: textSample.slice(0, 300), images: [],
      };
    }

    parsedDna.images = [...new Set(extractedImages)];
    if (!parsedDna.logoUrl && extractedLogo) parsedDna.logoUrl = extractedLogo;
    console.log("[extract-dna] ✅ Brand DNA complete:", parsedDna.brandName, `— ${parsedDna.images.length} images`);

    // ══════════════════════════════════════════════════════════
    // PHASE 3 — DOCUMENT GENERATION
    // ══════════════════════════════════════════════════════════

    const brandContext = `
Brand: ${parsedDna.brandName}
Website: ${url}
Overview: ${parsedDna.businessOverview}
Tagline: ${parsedDna.tagline}
Brand Values: ${parsedDna.brandValue}
Brand Aesthetic: ${parsedDna.brandAesthetic}
Tone of Voice: ${parsedDna.toneOfVoice}
Website Text: """${textSample.slice(0, 3000)}"""
`.trim();

    const docPrompts = {
      businessProfile: `You are a senior brand analyst. Using ONLY information from the website text below, write a detailed Business Profile document in markdown.

${brandContext}

Write the Business Profile with these exact sections:
# ${parsedDna.brandName} – Business Profile

## Overview
2-3 paragraphs: what the business does, mission, founding story if mentioned, market positioning.

## Products & Services
List every product or service mentioned with a short description of each.

## Key Selling Points
5-8 bullet points of the most compelling reasons to choose this brand.

## Retail Presence
Where products are sold — online store, retailers, marketplaces, physical locations.

## Target Audience
Demographics, psychographics, interests based on the website tone and content.

Rules: Only facts from website text. Use ## headers, - bullets, **bold** key terms. Min 400 words.`,

      marketResearch: `You are a senior market researcher. Write a comprehensive Market Research document in markdown.

${brandContext}

Write the Market Research with these exact sections:
# ${parsedDna.brandName} – Market Research

## Market Opportunity
The market this brand operates in, current trends, growth indicators, why now is a good time.

## Competitive Landscape
List 8-10 REAL named competitor companies. For each, 1-2 lines on what they do and how they compare.

## SEO & GEO Keywords
15-20 high-value search keywords grouped by intent (informational, commercial, transactional).

## Target Audiences on Social
4-5 distinct audience segments — platform preferences, what content resonates, how to reach them.

Rules: Real named competitors only. Use ## headers, - bullets, **bold** key names. Min 500 words.`,

      strategy: `You are a senior social media strategist. Write a detailed Social Media Strategy document in markdown.

${brandContext}

Write the Social Media Strategy with these exact sections:
# ${parsedDna.brandName} – Social Media Strategy

## Priority Platforms
Top 3-4 platforms — why each is a priority, audience, and content format.

## Content Pillars
4-6 content themes with name, description, 2-3 example post ideas each.

## Posting Cadence
Recommended posting frequency per platform.

## Messaging Hierarchy
3-4 core messages ranked by priority — lead message, secondary hooks, proof points.

## Quick Wins
5-7 immediately actionable tactics for the next 30 days.

Rules: Specific to ${parsedDna.brandName}'s industry. Tone of voice: ${parsedDna.toneOfVoice}. Min 500 words.`,
    };

    const [businessProfile, marketResearch, strategy] = await Promise.all([
      callGemini({ taskType: "business-profile", prompt: docPrompts.businessProfile, minLength: 300 }).then(r => r.text).catch(() => ""),
      callGemini({ taskType: "market-research", prompt: docPrompts.marketResearch, minLength: 300 }).then(r => r.text).catch(() => ""),
      callGemini({ taskType: "social-strategy", prompt: docPrompts.strategy, minLength: 300 }).then(r => r.text).catch(() => ""),
    ]);

    console.log(`[extract-dna] 📄 Docs — profile:${businessProfile.length} research:${marketResearch.length} strategy:${strategy.length}`);

    return NextResponse.json({ dna: parsedDna, documents: { businessProfile, marketResearch, strategy } });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "An unexpected server error occurred.";
    console.error("[extract-dna] ❌ Fatal error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (browser) { try { await browser.close(); } catch { /* */ } }
  }
}
