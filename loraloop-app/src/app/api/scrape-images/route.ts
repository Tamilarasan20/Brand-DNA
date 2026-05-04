import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { localDb } from "@/lib/localDb";

// ── Helpers ──
function isUsefulImage(url: string): boolean {
  const lower = url.toLowerCase();
  const blocked = [
    "data:image", "1x1", "pixel", "tracking", "analytics", "beacon",
    "favicon", "spinner", "loading", "placeholder", "blank", "transparent",
    "avatar", "gravatar", "profile-pic", "user-icon", "emoji",
    "sprite", "icon-", "-icon.", "flag-", "star-rating", "badge-",
    "captcha", "recaptcha", "cookie", "widget", "ads/", "/ad/",
    "doubleclick", "googletagmanager", "hotjar", "clarity.ms",
    ".svg", ".gif", ".ico", ".bmp", ".webp?w=1", ".webp?w=2",
  ];
  if (blocked.some(b => lower.includes(b))) return false;
  if (!/(jpg|jpeg|png|webp|avif)/i.test(lower)) return false;
  return true;
}

function scoreImage(url: string): number {
  let score = 0;
  const lower = url.toLowerCase();
  // Resolution hints
  if (/[_-](\d{3,4})x\d{3,4}/i.test(url)) score += 20;
  if (/[_-](xl|xxl|large|hero|full|original|hires)/i.test(lower)) score += 15;
  if (/[_-](sm|xs|thumb|tiny|icon|px60|px80|px100)/i.test(lower)) score -= 20;
  if (/w=(\d+)/.test(url)) {
    const w = parseInt(url.match(/w=(\d+)/)![1]);
    if (w >= 800) score += 20;
    else if (w >= 400) score += 8;
    else if (w < 200) score -= 15;
  }
  // Brand keywords
  const brandKeys = ["product", "hero", "banner", "feature", "campaign", "lifestyle", "brand", "collection", "cover", "main"];
  if (brandKeys.some(k => lower.includes(k))) score += 20;
  // CDN/upload hints
  if (lower.includes("uploads/") || lower.includes("media/") || lower.includes("images/") || lower.includes("assets/")) score += 10;
  return score;
}

function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
  try { return new URL(u).href; } catch { return u; }
}

export async function POST(req: Request) {
  let browser = null;
  try {
    const { url: rawUrl, businessId } = await req.json();
    if (!rawUrl) return NextResponse.json({ error: "URL is required" }, { status: 400 });

    const url = normalizeUrl(rawUrl);
    console.log("[scrape-images] 🖼️ Scraping images from:", url);

    browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
      javaScriptEnabled: true,
      bypassCSP: true,
    });

    // Block non-visual assets
    await context.route("**/*.{mp4,webm,ogg,mp3,wav,flac,woff2,woff,ttf,eot,pdf,zip}", r => r.abort());

    const page = await context.newPage();

    // Network interception — capture every real image request
    const networkImages = new Set<string>();
    page.on("response", async (response) => {
      try {
        const resUrl = response.url();
        const ct = response.headers()["content-type"] || "";
        if (response.status() === 200 && ct.startsWith("image/") && isUsefulImage(resUrl)) {
          networkImages.add(resUrl);
        }
      } catch { /* skip */ }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    try { await page.waitForLoadState("networkidle", { timeout: 5000 }); } catch { /* ok */ }

    // Auto-scroll to trigger lazy loading
    await page.evaluate(async () => {
      await new Promise<void>(resolve => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) { clearInterval(timer); resolve(); }
        }, 80);
        setTimeout(() => { clearInterval(timer); resolve(); }, 8000);
      });
    });
    await page.waitForTimeout(600);

    // Carousel click automation
    const carouselSelectors = [
      '[class*="next"]', '[class*="slick-next"]', '[class*="swiper-button-next"]',
      '[aria-label="Next"]', '[aria-label="Next slide"]', '[data-slide="next"]',
      '.flickity-prev-next-button.next', '[class*="owl-next"]', '[class*="glide__arrow--right"]',
    ];
    for (const sel of carouselSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 150 })) {
          for (let i = 0; i < 6; i++) {
            try { await btn.click({ timeout: 400 }); await page.waitForTimeout(300); } catch { break; }
          }
        }
      } catch { /* selector not found */ }
    }
    await page.waitForTimeout(400);

    // DOM extraction — all 15 strategies
    const domImages: string[] = await page.evaluate((baseUrl) => {
      const seen = new Set<string>();
      const imgs: string[] = [];
      const add = (src: string | null | undefined) => {
        if (!src) return;
        let s = src.trim();
        if (s.startsWith("//")) s = "https:" + s;
        if (s && !s.startsWith("http") && !s.startsWith("data:")) {
          try { s = new URL(s, baseUrl).href; } catch { return; }
        }
        if (s && !seen.has(s) && s.startsWith("http") && !s.startsWith("data:") && !s.includes(" ")) {
          seen.add(s); imgs.push(s);
        }
      };
      const addSrcset = (ss: string | null | undefined) => {
        if (!ss) return;
        ss.split(",").forEach(e => { const u = e.trim().split(/\s+/)[0]; if (u) add(u); });
      };

      // Meta tags
      ['meta[property="og:image"]','meta[property="og:image:url"]','meta[name="twitter:image"]','meta[name="twitter:image:src"]'].forEach(s => {
        const el = document.querySelector(s); if (el) add((el as HTMLMetaElement).content);
      });

      // All img tags with 30+ lazy attrs
      const lazyAttrs = ["src","data-src","data-lazy-src","data-original","data-lazy","data-image","data-bg","data-full","data-hi-res","data-url","data-img-src","data-echo","data-large","data-large-file","data-retina","data-2x","data-zoom-image","data-highres","data-original-src","data-fallback-src","data-noscript-src","data-swiper-lazy","data-flickity-lazyload","data-lazy-load","data-pagespeed-lazy-src"];
      document.querySelectorAll("img").forEach(img => {
        lazyAttrs.forEach(attr => { const v = img.getAttribute(attr); if (v) add(v); });
        addSrcset(img.getAttribute("srcset")); addSrcset(img.getAttribute("data-srcset"));
      });

      // picture sources
      document.querySelectorAll("picture source, video source").forEach(s => { addSrcset(s.getAttribute("srcset")); add(s.getAttribute("src")); });

      // video poster
      document.querySelectorAll("video[poster]").forEach(v => add(v.getAttribute("poster")));

      // CSS background-image on every element
      document.querySelectorAll("*").forEach(el => {
        try {
          const cs = window.getComputedStyle(el as Element);
          const bg = cs.backgroundImage;
          if (bg && bg !== "none") {
            for (const m of bg.matchAll(/url\(["']?(.*?)["']?\)/g)) {
              if (m[1] && !m[1].startsWith("data:")) add(m[1]);
            }
          }
        } catch {}
      });

      // Inline style
      document.querySelectorAll("[style]").forEach(el => {
        const style = el.getAttribute("style") || "";
        for (const m of style.matchAll(/url\(["']?(.*?)["']?\)/g)) add(m[1]);
      });

      // noscript
      document.querySelectorAll("noscript").forEach(ns => {
        const m = ns.innerHTML.match(/src=['"]([^'"]+)['"]/); if (m) add(m[1]);
        const ms = ns.innerHTML.match(/srcset=['"]([^'"]+)['"]/); if (ms) addSrcset(ms[1]);
      });

      // JSON-LD
      document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
        try {
          const recurse = (o: any) => {
            if (!o) return;
            if (Array.isArray(o)) { o.forEach(recurse); return; }
            ["image","url","contentUrl","thumbnailUrl","logo","photo"].forEach(k => {
              if (o[k]) { if (typeof o[k] === "string") add(o[k]); else if (o[k]?.url) add(o[k].url); }
            });
            Object.values(o).forEach(recurse);
          };
          recurse(JSON.parse(script.textContent || ""));
        } catch {}
      });

      // Next.js __NEXT_DATA__
      const nd = document.getElementById("__NEXT_DATA__");
      if (nd) { try { const dig = (o: any, d=0) => { if (d>6||!o) return; if (typeof o==="string" && /^https?:\/\/.+\.(jpg|jpeg|png|webp|avif)/i.test(o)) { add(o); } else if (Array.isArray(o)) o.forEach(i=>dig(i,d+1)); else if (typeof o==="object") Object.values(o).forEach(v=>dig(v,d+1)); }; dig(JSON.parse(nd.textContent||"")); } catch {} }

      // Shopify inline scripts
      document.querySelectorAll("script:not([src])").forEach(s => {
        const t = s.textContent||"";
        (t.match(/(https?:\/\/[^"'\s\\]+\.(jpg|jpeg|png|webp|avif))/gi)||[]).slice(0,30).forEach(add);
      });

      // Full attribute scan
      Array.from(document.querySelectorAll("*")).slice(0,3000).forEach(el => {
        Array.from((el as Element).attributes).forEach(attr => {
          if (attr.value && attr.value.startsWith("http") && /\.(jpg|jpeg|png|webp|avif)([\?&]|$)/i.test(attr.value)) add(attr.value);
        });
      });

      return imgs;
    }, url);

    await browser.close();
    browser = null;

    // Merge all sources
    const allImages = new Set<string>([...domImages]);
    for (const img of networkImages) allImages.add(img);

    // Filter + score + sort
    const scored = Array.from(allImages)
      .filter(isUsefulImage)
      .map(img => ({ url: img, score: scoreImage(img) }))
      .sort((a, b) => b.score - a.score);

    const finalImages = scored.map(s => s.url).slice(0, 80);
    console.log(`[scrape-images] ✅ ${allImages.size} raw → ${finalImages.length} scored images`);

    // Optionally save to knowledge base
    if (businessId) {
      const business = localDb.get(businessId);
      if (business) {
        const existing = business.brand_guidelines?.images || [];
        const merged = [...new Set([...finalImages, ...existing])].slice(0, 80);
        localDb.update(businessId, {
          brand_guidelines: { ...(business.brand_guidelines || {}), images: merged }
        });
        console.log(`[scrape-images] 💾 Saved ${merged.length} images to KB for ${business.business_name}`);
      }
    }

    return NextResponse.json({
      images: finalImages,
      total: finalImages.length,
      raw: allImages.size,
    });

  } catch (err: any) {
    console.error("[scrape-images] Error:", err);
    if (browser) { try { await (browser as any).close(); } catch {} }
    return NextResponse.json({ error: err.message || "Scrape failed" }, { status: 500 });
  }
}
