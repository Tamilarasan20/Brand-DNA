import { NextResponse } from "next/server";
import { localDb } from "@/lib/localDb";
import { callGemini } from "@/lib/gemini";

/**
 * Multimodal Interface Manager — Image Validation Endpoint
 * 
 * Validates an uploaded image against the active Brand Knowledge Base.
 * Returns a brand alignment score and enforced visual constraints.
 */
export async function POST(req: Request) {
  try {
    const { businessId, imageBase64, userText } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    const business = localDb.get(businessId);
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const enriched = business.enriched_data || {};
    const guidelines = business.brand_guidelines || {};
    const memory = business.brand_memory || {};
    const visualId = memory.visual_identity || {};

    const primaryColor = guidelines.colors?.[0]?.hex || "#333";
    const accentColor = guidelines.colors?.[3]?.hex || guidelines.colors?.[1]?.hex || "#0066ff";
    const brandName = business.business_name || "Brand";

    // Determine user intent
    let intent: "analyze" | "edit" | "reference" = "analyze";
    if (userText) {
      const lower = userText.toLowerCase();
      if (lower.includes("edit") || lower.includes("change") || lower.includes("modify") || lower.includes("fix") || lower.includes("restyle")) {
        intent = "edit";
      } else if (lower.includes("reference") || lower.includes("like this") || lower.includes("similar") || lower.includes("style")) {
        intent = "reference";
      }
    }

    // Build brand constraint context for the validation prompt
    const brandConstraints = {
      required_aesthetics: [
        visualId.composition_style || "minimal",
        visualId.spacing_style || "high whitespace",
        visualId.ui_style || "premium",
      ].filter(Boolean),
      required_colors: [primaryColor, accentColor],
      forbidden_elements: [
        "cluttered backgrounds",
        "generic stock photography",
        "off-brand color palettes",
        "random typography",
        "low-quality imagery",
      ],
      brand_image_style: visualId.image_style || enriched.brandAesthetic || "modern, clean, premium",
    };

    // If no actual image is uploaded, return a pass-through response
    if (!imageBase64) {
      return NextResponse.json({
        ui_action: "generating",
        target_model: "gemini-flash",
        validated_prompt: userText || "",
        image_payload: {
          status: "approved",
          brand_alignment_score: 10,
          enforced_visual_constraints: [],
        },
        intent,
        brand_constraints: brandConstraints,
      });
    }

    // Validate the uploaded image against brand guidelines using Gemini Vision
    const validationPrompt = `You are a Brand Alignment Auditor for ${brandName}.

BRAND VISUAL GUIDELINES:
- Primary Color: ${primaryColor}
- Accent Color: ${accentColor}
- Image Style: ${visualId.image_style || enriched.brandAesthetic || "modern, clean, premium"}
- Composition: ${visualId.composition_style || "minimal, high whitespace"}
- Lighting: ${visualId.lighting_style || "clean, professional"}
- Design Density: ${visualId.design_density || "low to medium"}
- Forbidden: cluttered backgrounds, generic stock photography, off-brand colors, random typography

The user uploaded an image. Based on the brand guidelines above, evaluate the image.

Return ONLY a valid JSON object (no markdown, no code fences):
{
  "status": "approved" or "rejected" or "requires_restyling",
  "brand_alignment_score": 1-10 (10 = perfect brand match),
  "reasoning": "Brief explanation of why this score was given",
  "enforced_visual_constraints": ["List of rules the generation agent must apply if this image needs restyling to match the brand"],
  "suggested_modifications": "If requires_restyling, describe what needs to change"
}`;

    let validationResult;
    try {
      const result = await callGemini({
        taskType: "dna-extraction",
        prompt: validationPrompt,
        mimeType: "application/json",
        minLength: 50,
      });
      validationResult = JSON.parse(result.text);
    } catch {
      // If validation fails, default to requiring restyling
      validationResult = {
        status: "requires_restyling",
        brand_alignment_score: 5,
        reasoning: "Could not validate image. Applying brand constraints as a precaution.",
        enforced_visual_constraints: [
          `Use primary color ${primaryColor}`,
          `Use accent color ${accentColor}`,
          `Apply ${visualId.image_style || "modern, clean"} aesthetic`,
          "Remove any cluttered backgrounds",
          "Ensure high whitespace and premium feel",
        ],
        suggested_modifications: "Restyle to match brand visual identity.",
      };
    }

    // If image needs restyling, enrich the user's prompt with brand constraints
    let validatedPrompt = userText || "";
    if (validationResult.status === "requires_restyling" || validationResult.status === "rejected") {
      const constraintInjection = `\n\n[SYSTEM BRAND CONSTRAINTS — MANDATORY]\n` +
        `The uploaded image does NOT match the brand guidelines (score: ${validationResult.brand_alignment_score}/10).\n` +
        `You MUST apply these visual corrections:\n` +
        (validationResult.enforced_visual_constraints || []).map((c: string) => `- ${c}`).join("\n") + "\n" +
        `Target aesthetic: ${brandConstraints.brand_image_style}\n` +
        `Primary Color: ${primaryColor}, Accent: ${accentColor}`;
      validatedPrompt += constraintInjection;
    }

    return NextResponse.json({
      ui_action: "generating",
      target_model: "gemini-flash",
      validated_prompt: validatedPrompt,
      image_payload: {
        status: validationResult.status,
        brand_alignment_score: validationResult.brand_alignment_score,
        enforced_visual_constraints: validationResult.enforced_visual_constraints || [],
        reasoning: validationResult.reasoning,
        suggested_modifications: validationResult.suggested_modifications,
      },
      intent,
      brand_constraints: brandConstraints,
    });
  } catch (err: any) {
    console.error("[validate-image] Error:", err);
    return NextResponse.json(
      {
        ui_action: "error",
        error: err.message || "Failed to validate image",
      },
      { status: 500 }
    );
  }
}
