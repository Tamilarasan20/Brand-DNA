import { NextResponse } from "next/server";
import { localDb } from "@/lib/localDb";
import { callGemini } from "@/lib/gemini";
import { meterIfAuthed } from "@/lib/withCredits";

// Helper to determine the best agent persona based on the user prompt
function determineAgentPersona(prompt: string): { name: string; role: string; responsibility: string } {
  const p = prompt.toLowerCase();
  
  if (p.includes("video") || p.includes("reel") || p.includes("tiktok") || p.includes("motion")) {
    return { name: "Kip", role: "Video Creator", responsibility: "video scripts, motion direction, thumbnail consistency" };
  }
  if (p.includes("image") || p.includes("design") || p.includes("visual") || p.includes("layout") || p.includes("carousel") || p.includes("picture") || p.includes("photo")) {
    return { name: "Nova", role: "Visual Designer", responsibility: "image generation prompts, layout consistency, visual branding" };
  }
  if (p.includes("caption") || p.includes("copy") || p.includes("hook") || p.includes("write") || p.includes("text")) {
    return { name: "Sophie", role: "Copywriter", responsibility: "captions, hooks, cta generation, brand tone consistency" };
  }
  if (p.includes("analytics") || p.includes("perform") || p.includes("metric") || p.includes("data")) {
    return { name: "Maya", role: "Analytics", responsibility: "performance tracking, top-performing pattern analysis" };
  }
  
  return { name: "Lora", role: "Marketing Strategist", responsibility: "campaign planning, brand positioning, content direction" };
}

export async function POST(req: Request) {
  try {
    const { businessId, prompt } = await req.json();

    if (!businessId || !prompt) {
      return NextResponse.json({ error: "businessId and prompt are required" }, { status: 400 });
    }

    const metered = await meterIfAuthed('clara', 'content');
    if (!metered.ok) return metered.response;

    const business = localDb.get(businessId);
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const enriched = business.enriched_data || {};
    const guidelines = business.brand_guidelines || {};
    const memory = business.brand_memory || {};
    
    // Fallbacks for memory if not fully populated yet
    const visualId = memory.visual_identity || {};
    const voiceId = memory.brand_voice || {};
    const patterns = memory.content_patterns || {};

    const agent = determineAgentPersona(prompt);

    const context = `
Brand Name: ${business.business_name}
Overview: ${enriched.businessOverview || "N/A"}
Tagline: ${enriched.tagline || "N/A"}
Values: ${(enriched.brandValues || []).join(", ") || "N/A"}

=== VISUAL IDENTITY (Nova's Memory) ===
Primary Colors: ${(visualId.primary_colors || []).join(", ")}
Secondary Colors: ${(visualId.secondary_colors || []).join(", ")}
Lighting Style: ${visualId.lighting_style || "N/A"}
Composition Style: ${visualId.composition_style || "N/A"}
Spacing Style: ${visualId.spacing_style || "N/A"}
Image Style: ${visualId.image_style || enriched.brandAesthetic || "N/A"}
Typography: ${guidelines.typography?.map((t: any) => `${t.usage}: ${t.family}`).join(", ") || "N/A"}

=== BRAND VOICE (Sophie's Memory) ===
Tone: ${(voiceId.tone || [enriched.brandTone]).join(", ")}
Writing Style: ${(voiceId.writing_style || []).join(", ")}
Sentence Length: ${voiceId.sentence_length || "N/A"}
Emotional Style: ${voiceId.emotional_style || "N/A"}
CTA Style: ${voiceId.cta_style || "N/A"}
Banned Words: ${(voiceId.banned_words || []).join(", ")}

=== CONTENT PATTERNS (Lora & Kip's Memory) ===
Hooks: ${(patterns.hooks || []).join(" | ")}
Post Structures: ${(patterns.post_structures || []).join(" | ")}

=== KNOWLEDGE BASE DOCUMENTS ===

--- Business Profile ---
${(business.business_profile || "").slice(0, 2000)}

--- Market Research ---
${(business.market_research || "").slice(0, 1500)}

--- Social Strategy ---
${(business.social_strategy || "").slice(0, 1500)}

=== AVAILABLE BRAND IMAGES (scraped from website) ===
${(guidelines.images || []).slice(0, 10).map((img: string, i: number) => `${i + 1}. ${img}`).join("\n") || "None available"}

=== PRODUCTS/SERVICES ===
${Array.isArray(enriched.products) ? enriched.products.join(", ") : (enriched.keyProducts || "N/A")}
`.trim();

    const fullPrompt = `You are ${agent.name}, the ${agent.role} for ${business.business_name}. Your responsibility is: ${agent.responsibility}.
    
You are operating inside the Brand Consistency Generation Engine.
Your objective is to generate Instagram-ready creative outputs that strictly follow the brand identity using ONLY scraped brand images and brand guidelines.

=== RETRIEVED BRAND CONTEXT ===
${context}

=== CRITICAL GENERATION RULES ===
1. NEVER generate from scratch.
2. ALWAYS use retrieved brand memory context above.
3. NEVER use random AI-generated styles, generic stock aesthetics, or random typography choices.
4. ALWAYS follow brand tone and maintain 100% visual consistency.
5. Every generated output (text or image prompt) must feel like it belongs to the brand's existing Instagram feed and should appear as if it was designed by the same professional creative team.

${agent.name === "Nova" ? `=== NOVA EXACT IMAGE PROMPT TEMPLATE ===
When asked to generate an image prompt, output EXACTLY this structure filled in with the brand's scraped data:

A highly professional, minimal Instagram post design for a modern brand. The composition is strictly UI/UX focused, resembling a high-end SaaS marketing asset. 

BRAND CONSTRAINTS:
- Primary Color: [Insert Scraped Primary Hex/Color Name]
- Accent Color: [Insert Scraped Accent Hex/Color Name]
- Background: A clean, soft, noise-textured gradient using the Primary Color. Massive amounts of empty whitespace. No clutter. No random floating objects.

TYPOGRAPHY & TEXT OVERLAY:
- The exact text "[Insert Short Scraped Headline, max 5 words]" is written in large, bold, modern sans-serif typography right in the center. The text is perfectly legible, crisp, and pure white.
- Below the headline, the exact text "[Insert Short Scraped Subtitle, max 6 words]" is written in a smaller, regular weight sans-serif font.

VISUAL COMPOSITION:
- A high-fidelity, 3D glassmorphism UI card sits slightly behind the text. 
- A subtle, glowing CTA button at the bottom center with the text "[Insert CTA, e.g., Try For Free]".
- The overall aesthetic is premium, flat-design mixed with subtle 3D lighting, similar to Stripe or Linear branding.

NEGATIVE PROMPT: 
No distorted text, no messy fonts, no people, no faces, no photorealism, no clutter, no generic stock photo vibe, no excessive icons, no drop shadows on text, no complex backgrounds.` : ""}

=== INTERNAL VALIDATION & SCORING (DO NOT OUTPUT THIS) ===
Before answering, internally score your response against the brand context (0-100). 
If your internal 'overall_consistency_score' is under 85, rewrite your response to be more aligned before outputting it.

USER REQUEST:
${prompt}

Respond directly as ${agent.name}. Do not explain your scoring, just provide the final high-consistency output.`;

    // Cost-tier routing: agent persona determines the cheapest model
    const result = await callGemini({
      taskType: "content-generation",
      prompt: fullPrompt,
      minLength: 50,
    });

    return NextResponse.json({ content: result.text });
  } catch (err: any) {
    console.error("[generate-content] Error:", err);
    const userMsg = err.message?.includes("API key") || err.message?.includes("revoked")
      ? err.message
      : err.message || "Failed to generate content";
    return NextResponse.json({ error: userMsg, detail: err.detail || "" }, { status: 500 });
  }
}
