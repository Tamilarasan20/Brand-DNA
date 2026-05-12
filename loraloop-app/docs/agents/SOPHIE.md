# SOPHIE — AI SEO / GEO Manager

## Role
**Discoverability Optimiser**
Sophie makes your content rank — on **Google** (classic SEO) and on **generative engines** (ChatGPT, Claude, Perplexity, Gemini). She produces a full optimisation brief: keywords, meta tags, headings, FAQ schema, citable facts, and direct-answer blocks.

---

## Responsibilities
- Keyword research — primary, secondary, long-tail
- Search intent classification (informational / navigational / transactional / commercial)
- Meta title + description writing (Google CTR-optimised)
- URL slug + heading structure (H1, H2, H3 outline)
- FAQ block generation (schema-eligible)
- JSON-LD schema markup (Article / Product / FAQPage / HowTo / LocalBusiness)
- **GEO** — generative engine optimisations: citable facts, direct answers, source credibility hooks, structured format guidance
- Internal linking suggestions
- Content score (0–100)

---

## Triggered By
`POST /api/agents/sophie`

```json
{
  "businessId": "uuid (optional)",
  "topic": "How to migrate from Mailchimp to ConvertKit",
  "platform": "blog",
  "targetKeywords": ["mailchimp alternative", "email migration"],
  "audience": "SaaS founders",
  "existingContent": "Optional existing draft to optimise"
}
```

---

## Output

```json
{
  "primaryKeyword": "mailchimp to convertkit migration",
  "secondaryKeywords": ["...", "..."],
  "longTailKeywords": ["...", "..."],
  "searchIntent": "informational",
  "metaTitle": "<= 60 chars",
  "metaDescription": "<= 155 chars",
  "slug": "kebab-case-url",
  "h1": "Compelling H1",
  "outline": [
    { "heading": "...", "level": "h2", "bullets": ["..."] }
  ],
  "faqs": [{ "question": "...", "answer": "..." }],
  "schemaMarkup": {
    "type": "Article",
    "jsonLd": { "@context": "https://schema.org", "@type": "Article", "...": "..." }
  },
  "geoOptimisations": {
    "citableFacts": ["..."],
    "directAnswers": [{ "question": "...", "answer": "..." }],
    "sourceCredibilityHooks": ["..."],
    "structuredFormat": "..."
  },
  "internalLinkSuggestions": ["..."],
  "contentScore": 87
}
```

---

## What "GEO" Means

Classic SEO optimises for **ranking on a SERP**. GEO optimises for **being quoted by an LLM**. Different formats work for each:

| Channel | Wins With |
|---|---|
| Google SERP | Keywords, schema, backlinks, page speed |
| ChatGPT / Claude / Perplexity | Citable specific facts, direct Q&A blocks, author credibility, structured lists/tables |

Sophie writes for both at once.

---

## Gemini Model
Task type: `market-research`
Priority: FLASH_25 → FLASH_LITE_31 → FLASH_30 → GEMMA4_31B → PRO_25

---

## Credit Cost
**3 credits** per call (`sophie_seo`)

---

## Pipeline Position

```
Topic / draft
     ↓
[ SOPHIE ]
     ↓
SEO + GEO brief → handed to writer (Clara) or used directly
```
