# SAM — Research Agent

## Role
**Market Research & Brand DNA Extractor**  
Sam is triggered when a user submits a website URL. He scrapes the site using Playwright (or a multi-strategy HTTP fallback), extracts all brand assets, and runs AI analysis to produce a complete Brand DNA profile plus three strategic documents.

---

## Responsibilities
- Scrape website colors, fonts, logo, and images (15 extraction strategies)
- Crawl internal nav pages + CSS files + sitemap + e-commerce APIs in parallel
- Run Gemini DNA extraction to produce a structured brand profile
- Generate three knowledge base documents: Business Profile, Market Research, Social Strategy

---

## Triggered By
`POST /api/extract-dna`  
```json
{ "url": "https://yourbrand.com" }
```

---

## What Sam Extracts

### Visual Assets (Playwright + HTTP Fallback)
| Source | What's extracted |
|---|---|
| `<img>` tags (15 lazy-load attrs) | All image URLs including data-src, data-lazy, data-zoom |
| `<source srcset>` | Responsive `<picture>` images |
| OG / Twitter meta tags | Hero image (highest quality) |
| `<link rel=preload as=image>` | Browser-hinted hero images |
| CSS `background-image` | Inline + CSS file backgrounds |
| JSON-LD structured data | Schema.org image, logo, contentUrl |
| `__NEXT_DATA__` / `__NUXT__` | SSR payload images |
| `<noscript>` fallbacks | Full-res images behind lazy loaders |
| JS URL patterns | Any image URL in script blocks |
| Sub-pages (8 parallel) | Nav link pages crawled in parallel |
| CSS files (8 parallel) | All `url()` in linked stylesheets |
| Sitemap pages (4–6) | Product/gallery pages from sitemap.xml |
| Shopify API | `/products.json` + `/collections.json` |
| WooCommerce API | `/wp-json/wc/v3/products` |
| WordPress Media | `/wp-json/wp/v2/media` |
| Magento API | `/rest/V1/products` |

### Brand Attributes
- Hex color palette (from computed CSS styles)
- Font families (from computed CSS)
- Logo URL (10 detection strategies)
- Page title, meta description, OG tags
- Structured text sample (up to 6,000 chars)

---

## Gemini Analysis (Phase 2)

After scraping, Sam sends everything to Gemini for DNA extraction:

**Task type:** `dna-extraction`  
**Output JSON:**
```json
{
  "brandName": "Official brand name",
  "logoUrl": "https://...",
  "colors": {
    "primary": "#hex",
    "secondary": "#hex",
    "background": "#hex",
    "textHighContrast": "#hex",
    "accent": "#hex"
  },
  "typography": {
    "headingFont": "Google Font name",
    "bodyFont": "Google Font name"
  },
  "tagline": "Brand tagline",
  "brandValue": "value1, value2, value3",
  "brandAesthetic": "minimal, modern, editorial",
  "toneOfVoice": "bold, direct, inspiring",
  "businessOverview": "2-3 sentence description",
  "images": ["https://...", "..."]
}
```

---

## Document Generation (Phase 3)

Sam runs 3 Gemini calls in parallel to build the knowledge base:

| Document | Task Type | Min Length | What's in it |
|---|---|---|---|
| **Business Profile** | `business-profile` | 400 words | Overview, Products/Services, Key Selling Points, Retail Presence, Target Audience |
| **Market Research** | `market-research` | 500 words | Market Opportunity, 8–10 Named Competitors, SEO Keywords, Social Audience Segments |
| **Social Strategy** | `social-strategy` | 500 words | Priority Platforms, Content Pillars, Posting Cadence, Messaging Hierarchy, 30-day Quick Wins |

---

## Image Post-Processing
1. Filter junk (tracking pixels, icons, tiny images, placeholders)
2. Score all images by quality (dimension hints, CDN size params, path keywords)
3. Sort best-quality first
4. Deduplicate by normalised URL (strips CDN resize params)
5. Remove anything scoring below -20
6. Clearbit logo fallback if no logo detected

---

## Credit Cost
**4 credits** per call (`sam_research`)

---

## Fallback Chain
```
Playwright (headless Chrome)
    ↓ fails
Multi-strategy HTTP fallback
  ├── Main page HTML scrape
  ├── 8 sub-page crawls (parallel)
  ├── CSS file scrapes (parallel)
  ├── E-commerce APIs (parallel)
  └── Sitemap crawl (parallel)
    ↓ Gemini DNA analysis
    ↓ 3x document generation (parallel)
    ↓ Return Brand DNA + Documents
```
