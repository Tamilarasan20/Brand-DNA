import { NextResponse } from "next/server";
import { localDb } from "@/lib/localDb";
import { callGemini } from "@/lib/gemini";

/**
 * Brand-Consistent Social Post Generation Pipeline
 *
 * Steps:
 *  1. Analyze campaign context and key details from user prompt
 *  2. Fetch brand tone, colors, templates from knowledge base
 *  3. Generate draft image concept (brand aesthetics + campaign theme)
 *  4. Craft draft caption (brand tone + key details + CTA)
 *  5. Self-evaluate consistency against brand guidelines
 *  6. If score < 85, refine and re-check; else finalize
 */
export async function POST(req: Request) {
  try {
    const { businessId, prompt, mediaType } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    const business = localDb.get(businessId);
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    // ─── STEP 2: Fetch brand guidelines from Knowledge Base ──────────────
    const enriched = business.enriched_data || {};
    const guidelines = business.brand_guidelines || {};
    const memory = business.brand_memory || {};
    const visualId = memory.visual_identity || {};
    const voiceId = memory.brand_voice || {};
    const patterns = memory.content_patterns || {};

    const primaryColor = guidelines.colors?.[0]?.hex || visualId.primary_colors?.[0] || "#333";
    const accentColor = guidelines.colors?.[3]?.hex || guidelines.colors?.[1]?.hex || visualId.secondary_colors?.[0] || "#0066ff";
    const brandName = business.business_name || "Brand";
    const brandImages = guidelines.images || [];
    const heroImage = brandImages[0] || "";

    // Knowledge Base documents (scraped + generated)
    const businessProfile = business.business_profile || "";
    const marketResearch = business.market_research || "";
    const socialStrategy = business.social_strategy || "";
    const products = enriched.products || enriched.keyProducts || [];

    const platform = mediaType || "Instagram image";

    // Build the complete brand context block (shared across steps)
    const brandContext = `
=== BRAND KNOWLEDGE BASE ===
Brand: ${brandName}
Overview: ${enriched.businessOverview || "N/A"}
Tagline: ${enriched.tagline || "N/A"}
Industry: ${enriched.industry || "N/A"}
Target Audience: ${(enriched.targetAudience || []).join(", ") || "N/A"}
Values: ${(enriched.brandValues || []).join(", ") || "N/A"}
Aesthetic: ${enriched.brandAesthetic || visualId.image_style || "N/A"}
USP: ${enriched.uniqueSellingProposition || "N/A"}

=== VISUAL IDENTITY ===
Primary Color: ${primaryColor}
Accent Color: ${accentColor}
All Colors: ${(guidelines.colors || []).map((c: any) => `${c.usage}: ${c.hex}`).join(", ") || "N/A"}
Typography: ${(guidelines.typography || []).map((t: any) => `${t.usage}: ${t.family}`).join(", ") || "N/A"}
Lighting: ${visualId.lighting_style || "N/A"}
Composition: ${visualId.composition_style || "minimal, balanced"}
Spacing: ${visualId.spacing_style || "generous whitespace"}
Image Style: ${visualId.image_style || enriched.brandAesthetic || "modern, clean, premium"}
Design Density: ${visualId.design_density || "low"}

=== BRAND VOICE ===
Tone: ${(voiceId.tone || [enriched.brandTone]).filter(Boolean).join(", ") || "N/A"}
Writing Style: ${(voiceId.writing_style || []).join(", ") || "N/A"}
CTA Style: ${voiceId.cta_style || "N/A"}
Emotional Style: ${voiceId.emotional_style || "N/A"}
Sentence Length: ${voiceId.sentence_length || "N/A"}
Banned Words: ${(voiceId.banned_words || []).join(", ") || "None"}
Preferred Phrases: ${(voiceId.preferred_phrases || []).join(", ") || "N/A"}

=== CONTENT PATTERNS ===
Hooks: ${(patterns.hooks || []).join(" | ") || "N/A"}
CTA Patterns: ${(patterns.cta_patterns || []).join(" | ") || "N/A"}
Post Structures: ${(patterns.post_structures || []).join(" | ") || "N/A"}
Winning Formats: ${(patterns.winning_formats || []).join(" | ") || "N/A"}

=== BUSINESS PROFILE (excerpt) ===
${(businessProfile || "").slice(0, 2000)}

=== MARKET RESEARCH (excerpt) ===
${(marketResearch || "").slice(0, 1000)}

=== SOCIAL STRATEGY (excerpt) ===
${(socialStrategy || "").slice(0, 1000)}

=== AVAILABLE BRAND IMAGES (scraped from website) ===
${brandImages.slice(0, 10).map((img: string, i: number) => `${i + 1}. ${img}`).join("\n") || "None"}

=== PRODUCTS/SERVICES ===
${Array.isArray(products) ? products.join(", ") : products || "N/A"}`.trim();

    // ─── STEP 1: Analyze campaign context ────────────────────────────────
    // ─── STEP 3: Generate draft image concept ────────────────────────────
    // ─── STEP 4: Craft draft caption ─────────────────────────────────────
    // All done in a single structured call for latency efficiency

    const generationPrompt = `You are the Brand Consistency Generation Engine for ${brandName}.
You have 3 expert agents working together:
- **Nova** (Visual Designer): Creates image concepts that match brand aesthetics.
- **Sophie** (Copywriter): Writes captions in the brand's exact voice.
- **Lora** (Strategist): Ensures campaign alignment and strategic consistency.

${brandContext}

=== CAMPAIGN CONTEXT ===
User Request: ${prompt || "Create the next Instagram post for this brand"}
Platform: ${platform}

=== YOUR PIPELINE ===

**Step 1 — Campaign Analysis (Lora)**
Analyze the user's request. Identify:
- Campaign theme (product launch, event, seasonal, educational, engagement, etc.)
- Key details (product name, features, dates, audience segment)
- Strategic angle that aligns with the brand's social strategy

**Step 2 — Image Concept (Nova)**
Design an image concept that:
- Uses ONLY the brand's colors: primary ${primaryColor}, accent ${accentColor}
- Matches the brand's composition style: ${visualId.composition_style || "minimal"}
- Follows the brand's image style: ${visualId.image_style || enriched.brandAesthetic || "modern premium"}
- Is optimized for ${platform}

**Step 3 — Caption & Copy (Sophie)**
Write a caption that:
- Uses the brand's exact tone: ${(voiceId.tone || [enriched.brandTone]).filter(Boolean).join(", ")}
- Follows the brand's writing style: ${(voiceId.writing_style || []).join(", ")}
- Uses the brand's CTA pattern: ${voiceId.cta_style || "direct, action-oriented"}
- Avoids banned words: ${(voiceId.banned_words || []).join(", ")}
- Includes brand-relevant hashtags

=== OUTPUT FORMAT ===
Return ONLY valid JSON (no markdown, no code fences):

{
  "campaign_analysis": {
    "theme": "The identified campaign theme",
    "key_details": "Extracted key details from the user's prompt",
    "strategic_angle": "How this post serves the brand's strategy"
  },
  "image_concept": {
    "description": "A 2-3 sentence description of the visual concept for the creative team",
    "prompt": "A detailed image generation prompt. MUST include: primary color ${primaryColor}, accent color ${accentColor}, the brand's visual style. Must describe layout, colors, typography placement, and mood. No people, no faces, no stock photo vibe. Optimized for ${platform}.",
    "composition_notes": "Brief notes on layout, spacing, focal point"
  },
  "caption": {
    "hook": "The first line that grabs attention. Max 10 words. Must match brand personality.",
    "body": "The main caption text. 100-250 characters. Written in exact brand voice. Include line breaks.",
    "cta": "A short call-to-action matching the brand's CTA style.",
    "hashtags": ["#brandTag", "#nicheTag1", "#nicheTag2", "#trendingTag", "#campaignTag"]
  },
  "headline": "3-5 word image overlay headline",
  "subtitle": "4-6 word image overlay subtitle",
  "consistency_score": 0
}

=== STEP 5 — SELF-EVALUATION (INTERNAL, DO NOT SKIP) ===
Before outputting, score your draft against these criteria (each 0-20, total 0-100):
1. **Color Adherence**: Does the image prompt use ONLY brand colors?
2. **Voice Match**: Does the caption sound exactly like the brand?
3. **CTA Alignment**: Does the CTA match the brand's documented CTA style?
4. **Visual Consistency**: Does the image concept match the brand's documented aesthetic?
5. **Strategic Fit**: Does this post serve the brand's social strategy?

Set "consistency_score" to your total (0-100).

=== STEP 6 — REFINEMENT ===
If your consistency_score is below 85, REWRITE the entire output to improve alignment. Only output the final, refined version.

CRITICAL: Return ONLY the JSON object. No other text.`;

    const result = await callGemini({
      taskType: "content-generation",
      prompt: generationPrompt,
      mimeType: "application/json",
      minLength: 200,
    });

    let parsed: any;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      // Fallback if JSON parse fails
      parsed = {
        campaign_analysis: { theme: "general", key_details: prompt, strategic_angle: "brand awareness" },
        image_concept: { description: "", prompt: "", composition_notes: "" },
        caption: { hook: "", body: result.text.slice(0, 300), cta: "Learn More", hashtags: [] },
        headline: brandName,
        subtitle: enriched.tagline || "",
        consistency_score: 0,
      };
    }

    // ── Normalize output for frontend ──
    const caption = parsed.caption || {};
    const imageConcept = parsed.image_concept || {};

    // Build the image generation prompt with guaranteed brand constraints
    let imagePrompt = imageConcept.prompt || imageConcept.description || "";
    if (!imagePrompt || imagePrompt.length < 30) {
      imagePrompt = `A highly professional, minimal ${platform} post design for ${brandName}. Primary Color: ${primaryColor}. Accent Color: ${accentColor}. Style: ${enriched.brandAesthetic || "modern, clean, premium"}. Clean gradient background using ${primaryColor}, bold white typography, glassmorphism UI card. No people, no faces, no stock photo vibe.`;
    }

    // Ensure brand colors are always injected even if the LLM missed them
    if (!imagePrompt.includes(primaryColor)) {
      imagePrompt += ` Primary brand color: ${primaryColor}.`;
    }
    if (!imagePrompt.includes(accentColor)) {
      imagePrompt += ` Accent brand color: ${accentColor}.`;
    }

    // ── BRAND IMAGE SELECTION ──
    // Pick the best matching scraped brand image based on the campaign theme
    let selectedBrandImage = heroImage;
    let useBrandImage = false;
    if (brandImages.length > 0) {
      const theme = (parsed.campaign_analysis?.theme || prompt || "").toLowerCase();
      const matchedImage = brandImages.find((img: string) => {
        const lower = img.toLowerCase();
        // Match product keywords from prompt against image URLs
        const keywords = theme.split(/\s+/).filter((w: string) => w.length > 3);
        return keywords.some((kw: string) => lower.includes(kw));
      });
      if (matchedImage) {
        selectedBrandImage = matchedImage;
        useBrandImage = true;
      } else {
        // Default to first brand image — always prefer real over generated
        selectedBrandImage = brandImages[0];
        useBrandImage = true;
      }
    }

    const response = {
      // Structured data for the frontend
      campaign_analysis: parsed.campaign_analysis || {},
      image_concept: {
        description: imageConcept.description || "",
        composition_notes: imageConcept.composition_notes || "",
      },
      // Flat fields the frontend already expects
      caption: caption.body || caption.caption || parsed.caption_text || "",
      hook: caption.hook || parsed.hook || "",
      cta: caption.cta || parsed.cta || "Learn More",
      hashtags: caption.hashtags || parsed.hashtags || [],
      headline: parsed.headline || brandName,
      subtitle: parsed.subtitle || enriched.tagline || "",
      image_prompt: imagePrompt,
      consistency_score: parsed.consistency_score || 0,
      // Brand image selection — frontend should prefer this over AI generation
      use_brand_image: useBrandImage,
      selected_brand_image: selectedBrandImage,
      // Brand metadata
      brandColors: { primary: primaryColor, accent: accentColor },
      brandName,
      brandImages: brandImages.slice(0, 10),
      heroImage,
      model_used: result.model,
    };

    console.log(`[generate-post] ✅ Post generated for ${brandName} | Score: ${response.consistency_score}/100 | Model: ${result.model}`);

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("[generate-post] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate post" },
      { status: 500 }
    );
  }
}
