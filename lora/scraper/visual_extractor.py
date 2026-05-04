"""
Loraloop — Visual Extractor
Extracts brand colors, fonts, and images from HTML + CSS.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from lora.scraper.models import ColorPalette, Typography, VisualAssets

# ── Regex patterns ─────────────────────────────────────────────────────────────

_HEX_RE         = re.compile(r'#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')
_FONT_FAMILY_RE = re.compile(r'font-family\s*:\s*([^;{}!\n]+)', re.IGNORECASE)
_GFONT_RE       = re.compile(
    r'fonts\.googleapis\.com/css2?\?family=([^&\'")\s]+)', re.IGNORECASE
)
_FONT_FACE_RE   = re.compile(
    r"@font-face\s*\{[^}]*font-family\s*:\s*['\"]?([^;'\"{}]+)['\"]?",
    re.IGNORECASE,
)
_CSS_VAR_COLOR_RE = re.compile(
    r'--[\w-]*color[\w-]*\s*:\s*(#[0-9a-fA-F]{3,8}|rgb[^;]+)',
    re.IGNORECASE,
)
_IMAGE_EXT_RE = re.compile(r'\.(?:jpe?g|png|webp|avif)(?:[?#][^\s"\'<>)]*)?$', re.IGNORECASE)
_IMAGE_URL_RE = re.compile(r'https?://[^"\'\s<>)\\]+?\.(?:jpe?g|png|webp|avif)(?:[?#][^"\'\s<>)\\]*)?', re.IGNORECASE)
_CSS_URL_RE = re.compile(r'url\((["\']?)(.*?)\1\)', re.IGNORECASE)

def _is_useful_image(src: str) -> bool:
    if not src or len(src) < 10: return False
    if re.search(r'\s+\d+(\.\d+)?[wx]', src): return False
    if re.search(r',\s*https?://', src): return False
    if " " in src: return False

    lower = src.lower()
    hard_reject = [
        "pixel", "track", "analytics", "beacon", "1x1", "spacer",
        "facebook.com/tr", "google-analytics", "doubleclick",
        "googletagmanager", "hotjar", "data:image/gif",
        "data:image/svg+xml", "gravatar", "wp-emoji",
        "wpcf7", "spinner", "loading.gif", "recaptcha",
        "cloudflare", "captcha",
    ]
    if any(j in lower for j in hard_reject): return False

    placeholders = [
        "placeholder.com", "via.placeholder.com", "placeimg.com",
        "placekitten.com", "dummyimage.com", "loremflickr.com",
        "lorempixel.com", "imagefor.me", "placeholder.pics",
        "picsum.photos",
    ]
    if any(p in lower for p in placeholders): return False

    dim_match = re.search(r'[_\-x](\d+)x(\d+)', src, re.I)
    if dim_match:
        w, h = int(dim_match.group(1)), int(dim_match.group(2))
        if w < 50 and h < 50: return False

    w_param = re.search(r'[?&](?:w|width)=(\d+)', src, re.I)
    if w_param and int(w_param.group(1)) < 50: return False

    if lower.endswith(".ico"): return False
    if re.search(r'\.(svg|gif|bmp|ico)(\?|$)', lower): return False
    if re.search(r'/(favicon|sprite)\b', lower, re.I): return False
    if re.search(r'/(icon|arrow|chevron|check|star|dot|close|menu|hamburger|button|btn)/', lower, re.I): return False

    return True

def _pick_srcset_candidates(srcset: str) -> list[tuple[str, int]]:
    candidates: list[tuple[str, int]] = []
    for entry in srcset.split(","):
        parts = entry.strip().split()
        if not parts:
            continue
        score = 0
        if len(parts) > 1:
            descriptor = parts[1].lower()
            if descriptor.endswith("w"):
                try: score = int(float(descriptor[:-1]))
                except ValueError: score = 0
            elif descriptor.endswith("x"):
                try: score = int(float(descriptor[:-1]) * 1000)
                except ValueError: score = 0
        candidates.append((parts[0], score))
    return sorted(candidates, key=lambda item: item[1], reverse=True)

def _normalize_image_url(src: str) -> str:
    from urllib.parse import urlparse, urlunparse, parse_qs, urlencode
    try:
        u = urlparse(src)
        qs = parse_qs(u.query)
        for p in ["w", "h", "width", "height", "size", "q", "quality", "fit", "resize", "scale", "format", "auto", "fm", "crop", "dpr"]:
            qs.pop(p, None)
        u = u._replace(query=urlencode(qs, doseq=True))
        
        path = u.path
        path = re.sub(r'-\d+x\d+(\.[a-zA-Z]+)$', r'\1', path)
        path = re.sub(r'_\d+x\d+(\.[a-zA-Z]+)$', r'\1', path)
        path = re.sub(r'@[0-9.]+x(\.[a-zA-Z]+)$', r'\1', path)
        path = re.sub(r'-(scaled|large|medium|small|thumbnail|full|crop|original)(\.[a-zA-Z]+)$', r'\2', path)
        path = re.sub(r'/(w_\d+|h_\d+|c_\w+|f_\w+|q_\w+|ar_\w+),?', '/', path)
        path = re.sub(r'//+', '/', path)
        u = u._replace(path=path)
        return urlunparse(u)
    except:
        return src

def _score_image(u: str) -> int:
    lower = u.lower()
    score = 0

    dim_match = re.search(r'[_\-](\d{3,4})x(\d{3,4})', u, re.I)
    if dim_match:
        w, h = int(dim_match.group(1)), int(dim_match.group(2))
        if w >= 1600 or h >= 1600: score += 40
        elif w >= 1200 or h >= 1200: score += 30
        elif w >= 800  or h >= 800:  score += 20
        elif w >= 400  or h >= 400:  score += 8
        else: score -= 15

    w_match = re.search(r'[?&](?:w|width|imwidth|imageWidth)=(\d+)', u, re.I)
    if w_match:
        w = int(w_match.group(1))
        if w >= 1600: score += 35
        elif w >= 1200: score += 25
        elif w >= 800:  score += 15
        elif w >= 400:  score += 5
        elif w < 200:   score -= 25

    if re.search(r'\.(webp|avif)(\?|$)', u, re.I): score += 5

    if re.search(r'/(product|hero|banner|feature|gallery|portfolio|campaign|lifestyle|collection|look|editorial|showcase|flagship)', lower, re.I): score += 20
    if re.search(r'/(about|brand|identity|team|story|culture|history)', lower, re.I): score += 12
    if re.search(r'/(images?|img|media|photos?|assets?|uploads?|static|content)/', lower, re.I): score += 5
    if re.search(r'zoom|retina|highres|fullsize|full[_\-]?size|hi[_\-]?res|@2x|@3x|original', lower, re.I): score += 18

    if re.search(r'og[_\-]?image|social[_\-]?share|opengraph', lower, re.I): score += 25

    if re.search(r'thumbnail|thumb|\bsmall\b|\bmini\b|[_\-]sm[_\-]|[_\-]xs[_\-]|\bpreview\b', lower, re.I): score -= 25
    if re.search(r'[_\-](50|75|80|100|120|150)x', u, re.I): score -= 20
    if re.search(r'icon|sprite|arrow|check|star|dot|close|menu|placeholder', lower, re.I): score -= 30

    m = re.search(r'[,/]w_(\d+)[,/]', u, re.I)
    if m:
        w = int(m.group(1))
        if w < 300: score -= 20
        elif w >= 800: score += 15

    return score

# ── Noise filters ──────────────────────────────────────────────────────────────

_NOISE_HEX = {
    "#fff", "#ffffff", "#000", "#000000",
    "#333", "#333333", "#666", "#666666",
    "#999", "#999999", "#ccc", "#cccccc",
    "#eee", "#eeeeee", "#f0f0f0", "#f5f5f5",
    "#fafafa", "#e5e7eb", "#d1d5db", "#9ca3af",
}

_SYSTEM_FONTS = {
    "serif", "sans-serif", "monospace", "cursive", "fantasy",
    "system-ui", "-apple-system", "BlinkMacSystemFont",
    "Helvetica Neue", "Helvetica", "Arial", "Georgia",
    "Times New Roman", "Verdana", "inherit", "initial", "unset",
}

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}


class VisualExtractor:
    """Extracts visual brand identity from HTML and associated CSS."""

    MAX_CSS_FILES = 4        # limit external stylesheet fetches
    MAX_CSS_BYTES = 60_000   # cap per stylesheet

    def extract(self, html: str, base_url: str) -> VisualAssets:
        soup = BeautifulSoup(html, "html.parser")
        css  = self._collect_css(soup, base_url)

        colors     = self._extract_colors(html, css)
        typography = self._extract_typography(html, css)
        images     = self._extract_images(soup, base_url, css)
        logo       = self._extract_logo(soup, base_url)
        favicon    = self._extract_favicon(soup, base_url)
        og_image   = self._get_og_image(soup)
        hints      = self._infer_visual_style(colors, typography, css)

        return VisualAssets(
            logo_url=logo,
            favicon_url=favicon,
            og_image=og_image,
            hero_images=images[:5],
            all_images=images[:80],
            colors=colors,
            typography=typography,
            visual_style_hints=hints,
        )

    # ── CSS collection ─────────────────────────────────────────────────────────

    def _collect_css(self, soup: BeautifulSoup, base_url: str) -> str:
        parts: list[str] = []

        # Inline <style> blocks
        for tag in soup.find_all("style"):
            parts.append(tag.string or "")

        # External <link rel="stylesheet">
        fetched = 0
        for link in soup.find_all("link", rel=lambda r: r and "stylesheet" in r):
            if fetched >= self.MAX_CSS_FILES:
                break
            href = link.get("href", "")
            if not href:
                continue
            css_url = urljoin(base_url, href)
            try:
                resp = requests.get(css_url, headers=_HEADERS, timeout=6)
                if resp.status_code == 200:
                    parts.append(resp.text[: self.MAX_CSS_BYTES])
                    fetched += 1
            except Exception:
                pass

        return "\n".join(parts)

    # ── Color extraction ───────────────────────────────────────────────────────

    def _extract_colors(self, html: str, css: str) -> ColorPalette:
        combined = html + "\n" + css

        raw_hex = _HEX_RE.findall(combined)
        # Expand 3-digit hex → 6-digit
        normalized = []
        for c in raw_hex:
            c = c.lower()
            if len(c) == 4:   # #rgb
                c = "#" + c[1] * 2 + c[2] * 2 + c[3] * 2
            if c not in _NOISE_HEX:
                normalized.append(c)

        # Also capture CSS custom property colors (brand tokens)
        var_colors = [
            m.group(1).strip().lower()
            for m in _CSS_VAR_COLOR_RE.finditer(css)
        ]
        for c in var_colors:
            if c.startswith("#") and len(c) in (4, 7) and c not in _NOISE_HEX:
                if len(c) == 4:
                    c = "#" + c[1] * 2 + c[2] * 2 + c[3] * 2
                normalized.append(c)

        counter = Counter(normalized)
        ranked  = [c for c, _ in counter.most_common(20)]

        return ColorPalette(
            primary=ranked[0] if ranked else None,
            secondary=ranked[1:4],
            accent=ranked[4:8],
            all_colors=ranked[:15],
        )

    # ── Typography extraction ──────────────────────────────────────────────────

    def _extract_typography(self, html: str, css: str) -> Typography:
        all_fonts:    list[str] = []
        google_fonts: list[str] = []
        custom_fonts: list[str] = []

        # font-family declarations
        for m in _FONT_FAMILY_RE.finditer(css):
            stack = m.group(1).strip()
            first = stack.split(",")[0].strip().strip("'\"")
            if first and first not in _SYSTEM_FONTS and len(first) > 1:
                all_fonts.append(first)

        # Google Fonts URL imports
        for m in _GFONT_RE.finditer(html + css):
            for part in m.group(1).split("|"):
                name = part.split(":")[0].replace("+", " ").strip()
                if name:
                    google_fonts.append(name)
                    all_fonts.append(name)

        # @font-face custom declarations
        for m in _FONT_FACE_RE.finditer(css):
            name = m.group(1).strip().strip("'\"")
            if name and name not in _SYSTEM_FONTS:
                custom_fonts.append(name)

        def dedup(lst: list[str]) -> list[str]:
            return list(dict.fromkeys(lst))

        all_fonts    = dedup(all_fonts)[:8]
        google_fonts = dedup(google_fonts)[:5]
        custom_fonts = dedup(custom_fonts)[:5]

        return Typography(
            primary_font=all_fonts[0] if all_fonts else None,
            secondary_font=all_fonts[1] if len(all_fonts) > 1 else None,
            all_fonts=all_fonts,
            google_fonts=google_fonts,
            custom_fonts=custom_fonts,
        )

    # ── Image extraction ───────────────────────────────────────────────────────

    def _extract_images(self, soup: BeautifulSoup, base_url: str, css: str = "") -> list[str]:
        scored_images: dict[str, int] = {}

        def add(src: str | None, base_score: int = 0) -> None:
            if not src:
                return
            src = src.strip()
            if src.startswith("//"):
                src = "https:" + src
            if src and not src.startswith("data:") and _is_useful_image(src):
                full = urljoin(base_url, src)
                norm = _normalize_image_url(full)
                score = _score_image(full) + base_score
                if norm not in scored_images or score > scored_images[norm]:
                    scored_images[norm] = score

        def add_srcset(srcset: str | None, base_score: int = 0) -> None:
            if not srcset:
                return
            for src, descriptor_score in _pick_srcset_candidates(srcset):
                add(src, base_score + min(descriptor_score // 100, 25))

        def add_from_css(css_text: str | None, base_score: int = 0) -> None:
            if not css_text:
                return
            for match in _CSS_URL_RE.finditer(css_text):
                add(match.group(2), base_score)

        def walk_json(obj, base_score: int = 0) -> None:
            if obj is None:
                return
            if isinstance(obj, str):
                if _IMAGE_URL_RE.search(obj) or _IMAGE_EXT_RE.search(obj):
                    add(obj, base_score)
                return
            if isinstance(obj, list):
                for item in obj:
                    walk_json(item, base_score)
                return
            if isinstance(obj, dict):
                for key, value in obj.items():
                    key_score = 12 if str(key).lower() in {
                        "image", "images", "logo", "photo", "thumbnail",
                        "thumbnailurl", "contenturl", "src", "url",
                        "featured_image", "featuredimage",
                    } else 0
                    walk_json(value, base_score + key_score)

        # Social preview images first (highest quality brand assets)
        for prop in (
            "og:image", "og:image:url", "og:image:secure_url",
            "twitter:image", "twitter:image:src", "image",
        ):
            tag = soup.find("meta", attrs={"property": prop}) or \
                  soup.find("meta", attrs={"name": prop}) or \
                  soup.find("meta", attrs={"itemprop": prop})
            if tag:
                add(tag.get("content"), base_score=50)

        # Browser/CMS image hints.
        for link in soup.find_all("link"):
            rel = " ".join(link.get("rel") or []).lower()
            if rel == "image_src" or (rel == "preload" and link.get("as") == "image"):
                add(link.get("href"), base_score=35)
                add_srcset(link.get("imagesrcset"), base_score=35)

        # <img> tags and <picture> sources
        image_attrs = [
            "src", "data-src", "data-lazy-src", "data-original", "data-lazy",
            "data-image", "data-bg", "data-full", "data-hi-res", "data-url",
            "data-img-src", "data-imgurl", "data-thumb", "data-large-file",
            "data-orig-file", "data-medium-file", "data-full-url",
            "data-natural-src", "data-zoom-image", "data-large",
            "data-full-src", "data-retina-src", "data-original-src",
            "data-full-size-url", "data-zoom-src", "data-swiper-lazy",
            "data-flickity-lazyload", "data-lazy-load", "loading-src",
        ]
        for img in soup.find_all("img"):
            for attr in image_attrs:
                add(img.get(attr))
            add_srcset(img.get("srcset"), base_score=10)
            add_srcset(img.get("data-srcset"), base_score=10)

        for source in soup.find_all(["source", "video"]):
            add(source.get("src"))
            add(source.get("poster"), base_score=15)
            add_srcset(source.get("srcset"), base_score=10)

        # Backgrounds and generic data attributes used by CMS galleries.
        for el in soup.find_all(True):
            add_from_css(el.get("style"), base_score=8)
            for attr, value in el.attrs.items():
                if not isinstance(value, str):
                    continue
                attr_lower = attr.lower()
                if attr_lower in {
                    "data-bg", "data-background", "data-background-image",
                    "data-cover", "data-href", "data-full", "data-original",
                    "data-large", "data-src", "data-url",
                }:
                    add(value, base_score=8)
                    add_from_css(value, base_score=8)
                elif value.startswith(("http://", "https://", "//")) and _IMAGE_EXT_RE.search(value):
                    add(value, base_score=4)

        # Noscript fallback markup often contains real lazy-loaded images.
        for ns in soup.find_all("noscript"):
            nested = BeautifulSoup(ns.get_text() or ns.decode_contents(), "html.parser")
            for img in nested.find_all("img"):
                for attr in image_attrs:
                    add(img.get(attr), base_score=10)
                add_srcset(img.get("srcset"), base_score=10)

        # Structured data and hydration blobs from modern JS frameworks.
        for script in soup.find_all("script"):
            script_text = script.string or script.get_text() or ""
            script_type = (script.get("type") or "").lower()
            if script_type == "application/ld+json":
                try:
                    walk_json(json.loads(script_text), base_score=30)
                except Exception:
                    pass

            if script.get("id") == "__NEXT_DATA__" or "__NUXT__" in script_text[:500] or "window.__INITIAL_STATE__" in script_text[:5000]:
                try:
                    walk_json(json.loads(script_text), base_score=12)
                except Exception:
                    pass

            for match in _IMAGE_URL_RE.finditer(script_text[:250_000]):
                add(match.group(0), base_score=6)

        # External CSS background URLs collected earlier.
        add_from_css(css, base_score=6)

        # Sort by score descending and return top ones (up to 200)
        sorted_images = sorted(scored_images.items(), key=lambda x: x[1], reverse=True)
        return [url for url, score in sorted_images[:200]]

    # ── Logo detection ─────────────────────────────────────────────────────────

    def _extract_logo(self, soup: BeautifulSoup, base_url: str) -> str | None:
        logo_pattern = re.compile(r"logo", re.I)

        # 1. <img> with class/id/alt containing "logo"
        for img in soup.find_all("img"):
            attrs_str = " ".join([
                img.get("class", [""])[0] if img.get("class") else "",
                img.get("id", ""),
                img.get("alt", ""),
            ]).lower()
            if "logo" in attrs_str:
                src = img.get("src") or img.get("data-src")
                if src and not src.startswith("data:"):
                    return urljoin(base_url, src)

        # 2. Container element with "logo" class/id, containing an <img>
        for container in soup.find_all(attrs={"class": logo_pattern}):
            img = container.find("img")
            if img:
                src = img.get("src") or img.get("data-src")
                if src and not src.startswith("data:"):
                    return urljoin(base_url, src)

        # 3. First <img> inside <header> / <nav>
        for selector in ["header", "nav", '[class*="header"]', '[class*="navbar"]']:
            container = soup.find(selector)
            if container:
                img = container.find("img")
                if img:
                    src = img.get("src") or img.get("data-src")
                    if src and not src.startswith("data:"):
                        return urljoin(base_url, src)

        return None

    def _extract_favicon(self, soup: BeautifulSoup, base_url: str) -> str | None:
        for rel in ("shortcut icon", "icon", "apple-touch-icon"):
            link = soup.find("link", rel=re.compile(re.escape(rel), re.I))
            if link and link.get("href"):
                return urljoin(base_url, link["href"])
        return urljoin(base_url, "/favicon.ico")

    def _get_og_image(self, soup: BeautifulSoup) -> str | None:
        tag = soup.find("meta", attrs={"property": "og:image"})
        return tag.get("content") if tag else None

    # ── Visual style inference ─────────────────────────────────────────────────

    def _infer_visual_style(
        self, colors: ColorPalette, typography: Typography, css: str
    ) -> list[str]:
        hints: list[str] = []

        # Dark vs light theme
        primary = colors.primary or ""
        if primary and len(primary) == 7:
            try:
                r = int(primary[1:3], 16)
                g = int(primary[3:5], 16)
                b = int(primary[5:7], 16)
                brightness = (r * 299 + g * 587 + b * 114) / 1000
                hints.append("dark-themed" if brightness < 80 else "light-themed")
            except ValueError:
                pass

        # Color palette richness
        n = len(colors.all_colors)
        if n <= 2:
            hints.append("minimal color palette")
        elif n >= 8:
            hints.append("rich multi-color palette")

        # Font style
        font = (typography.primary_font or "").lower()
        if any(f in font for f in ("serif", "times", "garamond", "georgia", "playfair")):
            hints.append("editorial / serif typography")
        elif any(f in font for f in ("mono", "code", "courier", "ibm plex mono")):
            hints.append("technical / monospace typography")
        elif font:
            hints.append("modern sans-serif typography")

        # CSS animations = dynamic/modern
        if re.search(r'@keyframes|animation\s*:', css, re.IGNORECASE):
            hints.append("animated / dynamic UI")

        # Grid / Flex heavy = structured layout
        if len(re.findall(r'display\s*:\s*(?:grid|flex)', css, re.IGNORECASE)) > 5:
            hints.append("structured grid layout")

        return hints
