import { NextResponse } from "next/server";
import { localDb } from "@/lib/localDb";
import { callGemini } from "@/lib/gemini";

const VALID_DOCS = ["businessProfile", "marketResearch", "socialStrategy"] as const;
type DocType = typeof VALID_DOCS[number];

const DB_FIELD: Record<DocType, string> = {
  businessProfile: "business_profile",
  marketResearch: "market_research",
  socialStrategy: "social_strategy",
};

// ─────────────────────────────────────────────────────────────────────────────
// MASTER PROMPT — ZERO HALLUCINATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────
const MASTER_SYSTEM_PROMPT = `You are a STRICT, ZERO-HALLUCINATION business analysis engine.

Your job:
Convert provided website content into a fully structured business knowledge base
WITHOUT adding, assuming, or hallucinating any information.

---

#############################
## 🔒 CORE RULES (MANDATORY)
#############################

1. SOURCE LOCK
- Use ONLY the provided website content
- Do NOT use prior knowledge

2. ZERO HALLUCINATION POLICY
- If information is missing → output EXACTLY:
  "Not found on website"

3. NO ASSUMPTIONS
- Do NOT infer:
  - target audience
  - competitors
  - pricing
  - positioning

4. EVIDENCE REQUIREMENT
- Every statement MUST be traceable to the input

5. ABSTENTION RULE
- If unsure → DO NOT GUESS → say "Not found on website"

6. NO GENERIC OUTPUT
- Avoid generic marketing language
- Avoid templates or common industry assumptions

---

#############################
## 🧩 INTERNAL PROCESS (FOLLOW EXACTLY)
#############################

### STEP 1: FACT EXTRACTION
- Extract ONLY factual statements from the website
- Prefer exact phrases or very close paraphrasing
- Break into atomic facts

### STEP 2: STRUCTURING
- Convert extracted facts into structured sections
- Do NOT introduce new information

### STEP 3: VALIDATION
- Check EVERY statement:
  → Does it exist in the website content?
  → If NOT → DELETE IT

---

#############################
## 🛡️ FINAL VALIDATION (CRITICAL)
#############################

Before final output:
- Remove ANY assumption
- Remove ANY unsupported claim
- Replace uncertain info with:
  "Not found on website"

If ANY hallucination remains → output is INVALID

---

ANTIGRAVITY TEXT PROCESSOR STRICT RULES:
- Clean text, clear hierarchy, structured format.
- NO placeholders (e.g., {{title}}, lorem ipsum).
- Human-readable, polished formatting ready to publish.
- No unnecessary symbols or encoding issues.
- DO NOT use markdown tables; use bulleted lists instead.
- Use ## headers and - bullets.
`;

// ─────────────────────────────────────────────────────────────────────────────
// Build the website content block from all scraped data
// ─────────────────────────────────────────────────────────────────────────────
function buildWebsiteContent(business: any): string {
  const enriched = business.enriched_data || {};
  const guidelines = business.brand_guidelines || {};
  const scraped = business.scraped_data || {};
  const memory = business.brand_memory || {};
  const name = business.business_name || "Brand";
  const url = business.website || "";

  const colors = (guidelines.colors || [])
    .map((c: any) => `${c.name || c.usage}: ${c.hex}`)
    .join(", ");
  const fonts = (guidelines.typography || [])
    .map((t: any) => `${t.usage}: ${t.family}`)
    .join(", ");
  const images = (guidelines.images || []).slice(0, 10);
  const logo = guidelines.logos?.[0]?.url || "";

  // Scraped text content
  const scrapedTitle = scraped.content?.title || "";
  const scrapedDescription = scraped.content?.description || "";
  const scrapedHeadings = (scraped.content?.headings || []).join("\n");
  const scrapedParagraphs = (scraped.content?.paragraphs || []).join("\n");

  // Voice/visual memory
  const voiceId = memory.brand_voice || {};
  const visualId = memory.visual_identity || {};

  return `
<WEBSITE_CONTENT>

## Source URL
${url}

## Brand Name
${name}

## Page Title
${scrapedTitle || "Not found"}

## Meta Description
${scrapedDescription || "Not found"}

## Business Overview (from scraping)
${enriched.businessOverview || "Not found on website"}

## Tagline
${enriched.tagline || "Not found on website"}

## Brand Values (extracted from website)
${(enriched.brandValues || []).join(", ") || "Not found on website"}

## Brand Aesthetic
${enriched.brandAesthetic || "Not found on website"}

## Tone of Voice
${enriched.brandTone || "Not found on website"}

## Visual Identity
- Primary Colors: ${(visualId.primary_colors || []).join(", ") || colors || "Not found"}
- Lighting Style: ${visualId.lighting_style || "Not found"}
- Composition: ${visualId.composition_style || "Not found"}
- Image Style: ${visualId.image_style || "Not found"}

## Colors Extracted
${colors || "Not found on website"}

## Typography Extracted
${fonts || "Not found on website"}

## Logo
${logo || "Not found on website"}

## Images Found
${images.length} brand images captured from website

## Voice Attributes
- Tone: ${(voiceId.tone || []).join(", ") || "Not found"}
- Writing Style: ${(voiceId.writing_style || []).join(", ") || "Not found"}
- CTA Style: ${voiceId.cta_style || "Not found"}
- Emotional Style: ${voiceId.emotional_style || "Not found"}

## Page Headings (from website)
${scrapedHeadings || "Not found on website"}

## Page Content (from website)
${scrapedParagraphs.slice(0, 5000) || "Not found on website"}

## Existing Documents
### Business Profile (current)
${(business.business_profile || "").slice(0, 2000) || "Not generated yet"}

### Market Research (current)
${(business.market_research || "").slice(0, 2000) || "Not generated yet"}

### Social Strategy (current)
${(business.social_strategy || "").slice(0, 2000) || "Not generated yet"}

</WEBSITE_CONTENT>
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Document-specific output templates (structure only, no content)
// ─────────────────────────────────────────────────────────────────────────────
function getDocPrompt(docType: DocType, brandName: string, websiteContent: string): string {
  const prompts: Record<DocType, string> = {
    businessProfile: `${MASTER_SYSTEM_PROMPT}

${websiteContent}

---

## 📤 OUTPUT FORMAT

Generate the Business Profile document in this EXACT structure:

# ${brandName} – Business Profile

## Overview
- (strictly from website content)

## Products/Services
- List ONLY explicitly mentioned items from the website
- If none found → "Not found on website"

## Key Selling Points
- ONLY explicit value propositions from website text
- If none found → "Not found on website"

## Retail Presence / Distribution
- Where products are sold — ONLY if mentioned on website
- If not mentioned → "Not found on website"

## Target Audience
- If clearly stated on website → include
- If NOT → "Not found on website"

## Founder Story
- ONLY if mentioned on website
- If NOT → "Not found on website"

## Brand Identity
- Tagline (if found)
- Brand Values (if found)
- Aesthetic (if found)
- Tone of Voice (if found)

## Visual Brand
### Color Palette
- List extracted colors

### Typography
- List extracted fonts

## Digital Presence
- Website URL
- Number of images captured
- Social links (if found on website)

## Gaps & Missing Information
List what is NOT present on the website:
- Target audience clarity
- Pricing
- Positioning
- Competitors
- Other missing elements

OUTPUT ONLY THE MARKDOWN DOCUMENT. No explanations. No extra text.`,

    marketResearch: `${MASTER_SYSTEM_PROMPT}

${websiteContent}

---

## 📤 OUTPUT FORMAT

Generate the Market Research document in this EXACT structure:

# ${brandName} – Market Research

## Market Opportunity
- ONLY if directly stated on the website
- If NOT → "Not found on website"

## Keywords
- Extract ONLY repeated or emphasized terms from website content
- Do NOT add generic industry keywords

## Competitors
- ONLY if website explicitly mentions competitor names
- Otherwise → "Not found on website"

## Trend Tailwinds
- ONLY if the website mentions industry trends
- Otherwise → "Not found on website"

## Key Risks
- ONLY if the website mentions challenges or risks
- Otherwise → "Not found on website"

## Target Audiences
- ONLY if the website explicitly mentions audience segments
- Otherwise → "Not found on website"

## Brand Positioning Signals
- What positioning cues exist on the website (tagline, value props, visual style)
- ONLY from website evidence

## Digital Footprint
- Website URL
- Number of brand images
- Number of colors identified
- Number of fonts identified
- Social media links found on website

## Gaps & Missing Information
List what is NOT present on the website:
- Target audience definition
- Pricing information
- Competitor mentions
- Market size data
- Other missing elements

OUTPUT ONLY THE MARKDOWN DOCUMENT. No explanations. No extra text.`,

    socialStrategy: `${MASTER_SYSTEM_PROMPT}

${websiteContent}

---

## 📤 OUTPUT FORMAT

Generate the Social Strategy document in this EXACT structure:

# ${brandName} – Social Strategy

## Platforms
- ONLY from visible social links or mentions on the website
- If no social links found → "Not found on website"

## Content Pillars
- Derived ONLY from:
  - Products/services mentioned on website
  - Features mentioned on website
  - Blog topics (if present on website)
- Do NOT add generic content pillars

## Posting Ideas
- MUST directly map to actual offerings/content found on the website
- No generic ideas
- Each idea must reference a specific product, feature, or content from the website

## Messaging Hierarchy
- ONLY from actual taglines, headlines, and value propositions found on website
- If insufficient data → "Not found on website"

## Visual Guidelines for Social
- Primary Color: (from extracted colors)
- Secondary Color: (from extracted colors)
- Typography: (from extracted fonts)
- Style: (from extracted brand aesthetic)

## Quick Wins (Next 30 Days)
- ONLY actionable items that directly relate to the brand's actual content
- Each must reference a specific asset or offering from the website

## Gaps & Missing Information
List what is NOT present on the website:
- Social media accounts
- Content calendar data
- Audience engagement data
- Other missing elements

OUTPUT ONLY THE MARKDOWN DOCUMENT. No explanations. No extra text.`,
  };

  return prompts[docType];
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback template — used when Gemini is unavailable
// ─────────────────────────────────────────────────────────────────────────────
function buildFallbackDoc(business: any, docType: DocType): string {
  const name = business.business_name || "Brand";
  const enriched = business.enriched_data || {};
  const guidelines = business.brand_guidelines || {};
  const url = business.website || "";

  const overview = enriched.businessOverview || "Not found on website";
  const tagline = enriched.tagline || "Not found on website";
  const values = (enriched.brandValues || []).join(", ") || "Not found on website";
  const aesthetic = enriched.brandAesthetic || "Not found on website";
  const tone = enriched.brandTone || "Not found on website";
  const colors = (guidelines.colors || [])
    .map((c: any) => `- **${c.name || c.usage}**: \`${c.hex}\``)
    .join("\n") || "- Not found on website";
  const fonts = (guidelines.typography || [])
    .map((f: any) => `- **${f.usage}**: ${f.family}`)
    .join("\n") || "- Not found on website";
  const imageCount = (guidelines.images || []).length;

  if (docType === "businessProfile") {
    return `# ${name} – Business Profile

## Overview
${overview}

## Products/Services
- Not found on website

## Key Selling Points
- Not found on website

## Target Audience
- Not found on website

## Brand Identity
- **Tagline:** ${tagline}
- **Values:** ${values}
- **Aesthetic:** ${aesthetic}
- **Tone:** ${tone}

## Visual Brand
### Color Palette
${colors}

### Typography
${fonts}

## Digital Presence
- **Website:** ${url}
- **Images captured:** ${imageCount}

## Gaps & Missing Information
- Products/services not explicitly listed
- Target audience not defined on website
- Pricing not found
- Competitor positioning not found`;
  }

  if (docType === "marketResearch") {
    return `# ${name} – Market Research

## Market Opportunity
- Not found on website

## Keywords
- ${name}
- ${values !== "Not found on website" ? values : "No keywords extracted"}

## Competitors
- Not found on website

## Target Audiences
- Not found on website

## Digital Footprint
- **Website:** ${url}
- **Brand images:** ${imageCount}
- **Colors identified:** ${(guidelines.colors || []).length}
- **Fonts identified:** ${(guidelines.typography || []).length}

## Gaps & Missing Information
- No competitor data on website
- No market size data
- No pricing information
- No audience demographics`;
  }

  // socialStrategy
  return `# ${name} – Social Strategy

## Platforms
- Not found on website

## Content Pillars
- Not found on website — insufficient product/service data to derive pillars

## Visual Guidelines for Social
${colors}
${fonts}
- **Style:** ${aesthetic}

## Gaps & Missing Information
- No social media links found on website
- No content calendar data
- No audience engagement data
- Insufficient product data for posting ideas`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const { businessId, docType } = await req.json();

    if (!businessId || !docType || !VALID_DOCS.includes(docType)) {
      return NextResponse.json({ error: "businessId and valid docType required" }, { status: 400 });
    }

    const business = localDb.get(businessId);
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const brandName = business.business_name || "Brand";
    const websiteContent = buildWebsiteContent(business);
    const docPrompt = getDocPrompt(docType as DocType, brandName, websiteContent);

    const TASK_MAP: Record<DocType, string> = {
      businessProfile: "business-profile",
      marketResearch: "market-research",
      socialStrategy: "social-strategy",
    };

    // Try Gemini with the strict zero-hallucination prompt
    let content = "";
    try {
      const result = await callGemini({
        taskType: TASK_MAP[docType as DocType],
        prompt: docPrompt,
        minLength: 200,
      });
      content = result.text;
      console.log(`[regenerate-doc] ✅ ${docType} via ${result.model} (${content.length} chars)`);
    } catch (err: any) {
      console.log(`[regenerate-doc] Gemini failed — using fallback template for ${docType}:`, err.message);
    }

    // Fall back to template if Gemini didn't produce content
    if (!content || content.length < 100) {
      content = buildFallbackDoc(business, docType as DocType);
    }

    // Save to LocalDb
    const { error: saveError } = localDb.update(businessId, {
      [DB_FIELD[docType as DocType]]: content,
    });

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    console.log(`[regenerate-doc] ✅ Saved ${docType} (${content.length} chars)`);
    return NextResponse.json({ content });
  } catch (err: any) {
    console.error("[regenerate-doc] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
