"""
Loraloop — Website Scraper Engine
Main orchestrator: URL → RawWebsiteData in < 60 s.

Pipeline:
  1. Validate & normalise URL
  2. Capture full-page snapshot  (Playwright, optional)
  3. Crawl pages                 (home + up to 4 internal)
  4. Extract content per page    (title, headings, text)
  5. Extract visual identity     (colors, fonts, images, logo)
  6. SPA JS-render fallback      (Playwright, if thin content)
  7. Classify & return
"""

from __future__ import annotations

import time
from datetime import datetime
from urllib.parse import urlparse

from lora.scraper.models import (
    RawWebsiteData,
    VisualAssets,
    CrawlStatus,
    SiteType,
    ProgressCallback,
)
from lora.scraper.crawler          import WebCrawler
from lora.scraper.content_extractor import ContentExtractor
from lora.scraper.visual_extractor  import VisualExtractor
from lora.scraper.snapshot          import take_snapshot


def _norm_url(url: str) -> str:
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url.rstrip("/")


def _emit(cb: ProgressCallback, step: str, pct: int) -> None:
    print(f"  [{pct:3d}%] {step}")
    if cb:
        cb(step, pct)


class ScraperEngine:
    """
    Website Scraper Engine.

    Usage::

        engine = ScraperEngine()
        data   = engine.scrape("https://acme.com", on_progress=my_callback)
        print(data.model_dump_json(indent=2))
    """

    def __init__(
        self,
        max_pages:       int  = 5,
        timeout:         int  = 15,
        enable_snapshot: bool = True,
        snapshot_dir:    str  = ".lora_snapshots",
    ):
        self.enable_snapshot = enable_snapshot
        self.snapshot_dir    = snapshot_dir
        self._crawler  = WebCrawler(max_pages=max_pages, timeout=timeout)
        self._content  = ContentExtractor()
        self._visual   = VisualExtractor()

    # ------------------------------------------------------------------ public

    def scrape(
        self,
        url:         str,
        on_progress: ProgressCallback = None,
    ) -> RawWebsiteData:
        """
        Fully scrape a website and return structured data.

        Args:
            url:         Website URL (scheme optional).
            on_progress: Optional callback(step_name, percent 0–100).

        Returns:
            RawWebsiteData — ready for the AI Enrichment Layer.
        """
        t0  = time.time()
        url = _norm_url(url)
        result = RawWebsiteData(url=url, crawled_at=datetime.utcnow())

        # ── 1. Validate ────────────────────────────────────────────────
        _emit(on_progress, "Validating URL", 2)
        if not urlparse(url).netloc:
            result.crawl_status = CrawlStatus.FAILED
            result.error        = "Invalid URL — no hostname found"
            result.error_type   = "invalid_url"
            result.crawl_duration_seconds = round(time.time() - t0, 2)
            return result

        # ── 2. Snapshot ────────────────────────────────────────────────
        if self.enable_snapshot:
            _emit(on_progress, "Capturing full-page snapshot", 8)
            result.snapshot_path = take_snapshot(url, self.snapshot_dir)

        # ── 3. Crawl ───────────────────────────────────────────────────
        _emit(on_progress, "Initiating website crawl", 18)
        try:
            pages_raw, site_type, error = self._crawler.crawl(url)
        except Exception as exc:
            result.crawl_status = CrawlStatus.FAILED
            result.error        = str(exc)
            result.error_type   = "crawl_error"
            result.crawl_duration_seconds = round(time.time() - t0, 2)
            return result

        result.site_type       = site_type
        result.pages_attempted = len(pages_raw) if pages_raw else 1

        if not pages_raw:
            result.crawl_status = CrawlStatus.FAILED
            result.error        = error or "No pages could be fetched"
            result.error_type   = (error.split(":")[0] if error else "unknown")
            result.crawl_duration_seconds = round(time.time() - t0, 2)
            return result

        _emit(on_progress, f"Crawled {len(pages_raw)} page(s) — site type: {site_type.value}", 32)

        # ── 4. Extract content ─────────────────────────────────────────
        _emit(on_progress, "Extracting business content from pages", 42)
        for page_url, html in pages_raw:
            try:
                result.pages.append(self._content.extract(html, page_url))
            except Exception:
                pass

        result.pages_crawled     = len(result.pages)
        result.raw_html_preview  = pages_raw[0][1][:10_000]

        # ── 5. Visual brand identity ───────────────────────────────────
        _emit(on_progress, "Analyzing visual brand identity (colors, fonts, logo)", 55)
        try:
            result.visual_assets = self._visual.extract(pages_raw[0][1], url)
        except Exception:
            result.visual_assets = VisualAssets()

        # ── 6. SPA JS-render fallback ──────────────────────────────────
        # (Removed: Playwright is now used natively in the crawler)

        # ── 7. Final status ────────────────────────────────────────────
        _emit(on_progress, "Finalizing extraction results", 88)
        total_words = sum(p.word_count for p in result.pages)

        if total_words < 50:
            result.crawl_status = CrawlStatus.PARTIAL
            result.error        = "Very limited text content extracted — site may require JavaScript"
        elif result.pages_crawled < result.pages_attempted:
            result.crawl_status = CrawlStatus.PARTIAL
        else:
            result.crawl_status = CrawlStatus.SUCCESS

        result.crawl_duration_seconds = round(time.time() - t0, 2)
        _emit(on_progress, "Scraping complete", 100)
        return result

    # ------------------------------------------------------------------ helpers
