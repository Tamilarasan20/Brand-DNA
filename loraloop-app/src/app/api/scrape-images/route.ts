import { NextResponse } from "next/server";
import { localDb } from "@/lib/localDb";

const PYTHON_SCRAPER_URL =
  process.env.PYTHON_SCRAPER_URL || "http://127.0.0.1:8000";

function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
  try { return new URL(u).href; } catch { return u; }
}

export async function POST(req: Request) {
  try {
    const { url: rawUrl, businessId } = await req.json();
    if (!rawUrl) return NextResponse.json({ error: "URL is required" }, { status: 400 });

    const url = normalizeUrl(rawUrl);
    const response = await fetch(`${PYTHON_SCRAPER_URL}/scrape-images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(90_000),
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      return NextResponse.json(
        { error: data.error || "Python image scrape failed" },
        { status: response.ok ? 500 : response.status }
      );
    }

    const finalImages: string[] = Array.isArray(data.images) ? data.images : [];

    if (businessId) {
      const business = localDb.get(businessId);
      if (business) {
        const existing = business.brand_guidelines?.images || [];
        const merged = [...new Set([...finalImages, ...existing])].slice(0, 80);
        localDb.update(businessId, {
          brand_guidelines: { ...(business.brand_guidelines || {}), images: merged }
        });
      }
    }

    return NextResponse.json({
      images: finalImages,
      total: finalImages.length,
      raw: data.raw ?? finalImages.length,
      source: "python",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Scrape failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
