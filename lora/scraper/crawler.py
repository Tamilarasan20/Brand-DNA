"""
Loraloop — Web Crawler
Multi-page crawler with SPA detection and graceful error handling.
"""

from __future__ import annotations

import re
import time
from urllib.parse import urlparse, urljoin
from typing import Optional

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

from lora.scraper.models import SiteType

# Pages worth crawling first (ordered by brand-content value)
_PRIORITY_PATHS = [
    "about", "about-us", "about_us", "our-story", "story",
    "mission", "values", "team", "who-we-are",
    "services", "products", "solutions", "platform", "features",
    "home",
]

# SPA framework fingerprints in raw HTML (less relevant now that we use Playwright, but kept for classification)
_SPA_SIGNALS = [
    r'data-reactroot',
    r'__NEXT_DATA__',
    r'ng-version\s*=',
    r'<div\s+id=["\']root["\']',
    r'<div\s+id=["\']app["\']',
    r'<div\s+id=["\']__nuxt["\']',
    r'nuxt\.js',
    r'vue(?:\.min)?\.js',
    r'angular(?:\.min)?\.js',
    r'_nuxt/',
    r'gatsby',
]


def auto_scroll(page):
    """
    Scrolls down the page to trigger lazy-loaded images, then scrolls back up slightly.
    Equivalent to the TypeScript autoScroll logic.
    """
    page.evaluate('''
        () => new Promise((resolve) => {
            let totalHeight = 0;
            let lastImgCount = 0;
            let stallCount = 0;
            const distance = 600;
            const maxStalls = 5;
            const maxHeight = 25000;

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
            }, 150);
        })
    ''')
    
    # Scroll back slowly to trigger any IntersectionObserver that requires upward scroll
    page.evaluate('''
        () => new Promise((resolve) => {
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
        })
    ''')


class WebCrawler:
    """
    Polite multi-page crawler using Playwright.

    - Follows internal links (up to max_pages)
    - Prioritises about/mission/values pages
    - Detects SPA frameworks
    - Renders JS and scrolls to trigger lazy loading
    """

    def __init__(self, max_pages: int = 5, timeout: int = 15):
        self.max_pages = max_pages
        self.timeout   = timeout * 1000  # Playwright uses milliseconds

    # ------------------------------------------------------------------ public

    def crawl(
        self,
        start_url: str,
    ) -> tuple[list[tuple[str, str]], SiteType, str]:
        """
        Crawl the site from start_url.

        Returns:
            pages     – list of (url, html) for each crawled page
            site_type – SiteType enum
            error     – non-empty string if the crawl fully failed
        """
        visited:  set[str]          = set()
        queue:    list[str]         = [start_url]
        pages:    list[tuple[str, str]] = []
        first_html = ""

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                # Ignore HTTPS errors and use a standard viewport to ensure mobile layouts don't hide desktop assets
                context = browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    ignore_https_errors=True
                )
                page = context.new_page()

                while queue and len(pages) < self.max_pages:
                    url = queue.pop(0)
                    norm = self._normalize(url)
                    if norm in visited:
                        continue
                    visited.add(norm)

                    try:
                        # Wait for DOM content to be loaded at minimum
                        resp = page.goto(url, timeout=self.timeout, wait_until="domcontentloaded")
                        if resp and resp.status >= 400:
                            continue
                        
                        # Dismiss potential popups simply by evaluating escape
                        page.keyboard.press("Escape")

                        # Scroll down to load images
                        auto_scroll(page)
                        
                        # Let network settle briefly after scroll
                        page.wait_for_timeout(1000)

                        html = page.content()
                    except PlaywrightTimeoutError:
                        if not pages:
                            browser.close()
                            return [], SiteType.LIMITED, "timeout"
                        break
                    except Exception as exc:
                        if not pages:
                            browser.close()
                            return [], SiteType.LIMITED, str(exc)
                        continue

                    pages.append((url, html))
                    if not first_html:
                        first_html = html

                    # Enqueue more internal links
                    if len(pages) < self.max_pages:
                        new_links = self._extract_links(html, url, start_url, visited)
                        queue.extend(self._prioritize(new_links)[:8])

                browser.close()
        except Exception as e:
            if not pages:
                return [], SiteType.LIMITED, f"playwright_error: {e}"

        site_type = self._classify(first_html, len(pages))
        return pages, site_type, ""

    # ------------------------------------------------------------------ helpers

    def _normalize(self, url: str) -> str:
        p = urlparse(url)
        return f"{p.scheme}://{p.netloc}{p.path.rstrip('/') or '/'}"

    def _extract_links(
        self,
        html: str,
        current_url: str,
        base_url: str,
        visited: set[str],
    ) -> list[str]:
        base_domain = urlparse(base_url).netloc
        soup  = BeautifulSoup(html, "html.parser")
        links: dict[str, None] = {}

        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
                continue
            full   = urljoin(current_url, href)
            parsed = urlparse(full)
            if parsed.netloc != base_domain or parsed.scheme not in ("http", "https"):
                continue
            clean = self._normalize(full)
            if clean not in visited:
                links[clean] = None

        return list(links.keys())

    def _prioritize(self, links: list[str]) -> list[str]:
        priority, other = [], []
        for link in links:
            path = urlparse(link).path.lower()
            if any(p in path for p in _PRIORITY_PATHS):
                priority.append(link)
            else:
                other.append(link)
        return priority + other

    def _classify(self, html: str, pages_found: int) -> SiteType:
        if not html:
            return SiteType.LIMITED

        for pattern in _SPA_SIGNALS:
            if re.search(pattern, html, re.IGNORECASE):
                return SiteType.SPA

        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        word_count = len(soup.get_text().split())

        if word_count < 80:
            return SiteType.LIMITED
        if pages_found <= 1:
            return SiteType.SINGLE_PAGE
        return SiteType.MULTI_PAGE
