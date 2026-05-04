/**
 * Gemini Smart Model Router
 *
 * ALL available models from the Google AI Studio dashboard are registered here.
 * Each task type uses a priority list optimised for:
 *   1. Highest quota availability (RPM/TPM/RPD)
 *   2. Best capability for the task
 *   3. Speed vs quality trade-off
 *
 * Dashboard quota (current as of April 2025):
 *   gemini-3.1-flash-lite  — highest RPM (15), best availability
 *   gemini-2.5-flash-lite  — 10 RPM
 *   gemini-2.5-flash       — 5 RPM
 *   gemini-3.0-flash       — 5 RPM
 *   gemma-4-27b/31b        — 15 RPM (large capable open models)
 *   gemma-3-*              — 30 RPM (fastest quota refresh)
 *   gemini-2.5-pro         — currently 0 quota (included as last resort)
 */

import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";

// ── All registered models ──────────────────────────────────────────────────────
export const GEMINI_MODELS = {
  // ── Gemini 2.5 family ──
  FLASH_25:       "gemini-2.5-flash",
  FLASH_LITE_25:  "gemini-2.5-flash-lite",
  PRO_25:         "gemini-2.5-pro",

  // ── Gemini 2.0 family ──
  FLASH_20:       "gemini-2.0-flash",
  FLASH_LITE_20:  "gemini-2.0-flash-lite",

  // ── Gemini 3.x family (newest) ──
  FLASH_30:       "gemini-3.0-flash",
  FLASH_LITE_31:  "gemini-3.1-flash-lite",
  PRO_31:         "gemini-3.1-pro",

  // ── Gemma 4 family (large open models, high RPM) ──
  GEMMA4_31B:     "gemma-4-31b",
  GEMMA4_27B:     "gemma-4-27b",

  // ── Gemma 3 family (very high RPM, lighter tasks) ──
  GEMMA3_27B:     "gemma-3-27b-it",
  GEMMA3_12B:     "gemma-3-12b-it",
  GEMMA3_4B:      "gemma-3-4b-it",
  GEMMA3_2B:      "gemma-3-2b-it",
  GEMMA3_1B:      "gemma-3-1b-it",
} as const;

export type GeminiModel = typeof GEMINI_MODELS[keyof typeof GEMINI_MODELS];

// ── Task → model priority lists ────────────────────────────────────────────────
// Models are tried IN ORDER — first success wins.
// Priority logic: highest RPM quota → then best capability for task.
export const TASK_MODELS: Record<string, GeminiModel[]> = {
  /**
   * Brand DNA extraction — structured JSON output, accuracy matters.
   * 3.1-flash-lite first (15 RPM), then 2.5-flash (best JSON accuracy).
   */
  "dna-extraction": [
    GEMINI_MODELS.FLASH_LITE_31,  // 15 RPM — highest quota
    GEMINI_MODELS.FLASH_25,       // 5 RPM  — excellent structured output
    GEMINI_MODELS.FLASH_LITE_25,  // 10 RPM — fast fallback
    GEMINI_MODELS.FLASH_30,       // 5 RPM  — newer model
    GEMINI_MODELS.FLASH_20,       // backup
    GEMINI_MODELS.FLASH_LITE_20,
    GEMINI_MODELS.GEMMA4_27B,
    GEMINI_MODELS.PRO_25,
  ],

  /**
   * Business Profile — detailed writing, factual accuracy.
   * Favour capable models over fastest.
   */
  "business-profile": [
    GEMINI_MODELS.FLASH_25,       // 5 RPM  — quality writing
    GEMINI_MODELS.FLASH_LITE_31,  // 15 RPM — high availability
    GEMINI_MODELS.FLASH_30,       // 5 RPM  — newer generation
    GEMINI_MODELS.GEMMA4_31B,     // 15 RPM — large, capable
    GEMINI_MODELS.GEMMA4_27B,     // 15 RPM
    GEMINI_MODELS.FLASH_LITE_25,  // 10 RPM — solid fallback
    GEMINI_MODELS.PRO_25,         // 0 RPM  — last resort
    GEMINI_MODELS.PRO_31,
    GEMINI_MODELS.GEMMA3_27B,
    GEMINI_MODELS.FLASH_20,
  ],

  /**
   * Market Research — needs real world knowledge for competitor names,
   * industry trends, SEO keywords. Best large models first.
   */
  "market-research": [
    GEMINI_MODELS.FLASH_25,       // 5 RPM  — strong world knowledge
    GEMINI_MODELS.FLASH_LITE_31,  // 15 RPM — newest, high quota
    GEMINI_MODELS.FLASH_30,       // 5 RPM
    GEMINI_MODELS.GEMMA4_31B,     // 15 RPM — large model
    GEMINI_MODELS.GEMMA4_27B,     // 15 RPM
    GEMINI_MODELS.PRO_25,         // 0 RPM  — most knowledge depth
    GEMINI_MODELS.PRO_31,
    GEMINI_MODELS.FLASH_LITE_25,  // 10 RPM
    GEMINI_MODELS.GEMMA3_27B,
    GEMINI_MODELS.FLASH_20,
  ],

  /**
   * Social Strategy — creative + strategic thinking.
   * Balance between capability and quota.
   */
  "social-strategy": [
    GEMINI_MODELS.FLASH_LITE_31,  // 15 RPM — newest, highest quota
    GEMINI_MODELS.FLASH_25,       // 5 RPM  — creative quality
    GEMINI_MODELS.FLASH_30,       // 5 RPM
    GEMINI_MODELS.FLASH_LITE_25,  // 10 RPM
    GEMINI_MODELS.GEMMA4_27B,     // 15 RPM — capable for creative
    GEMINI_MODELS.GEMMA4_31B,     // 15 RPM
    GEMINI_MODELS.GEMMA3_27B,
    GEMINI_MODELS.FLASH_20,
    GEMINI_MODELS.PRO_25,
  ],

  /**
   * Content generation (chat) — fast, conversational responses.
   * Prioritise speed and quota availability.
   */
  "content-generation": [
    GEMINI_MODELS.FLASH_LITE_31,  // 15 RPM — fastest + most quota
    GEMINI_MODELS.FLASH_LITE_25,  // 10 RPM — very fast
    GEMINI_MODELS.FLASH_30,       // 5 RPM  — newer generation
    GEMINI_MODELS.FLASH_25,       // 5 RPM
    GEMINI_MODELS.GEMMA3_12B,     // 30 RPM — massive quota for chat
    GEMINI_MODELS.GEMMA3_27B,     // 30 RPM
    GEMINI_MODELS.GEMMA4_27B,     // 15 RPM
    GEMINI_MODELS.FLASH_20,
    GEMINI_MODELS.FLASH_LITE_20,
    GEMINI_MODELS.PRO_25,
  ],

  /**
   * Steve visual design briefs — creative JSON with slide copy.
   * Needs creative capability + structured output.
   */
  "steve-design": [
    GEMINI_MODELS.FLASH_25,       // 5 RPM  — best creative JSON
    GEMINI_MODELS.FLASH_LITE_31,  // 15 RPM — high quota
    GEMINI_MODELS.FLASH_30,       // 5 RPM  — newer
    GEMINI_MODELS.FLASH_LITE_25,  // 10 RPM
    GEMINI_MODELS.GEMMA4_31B,     // 15 RPM — large creative model
    GEMINI_MODELS.GEMMA4_27B,     // 15 RPM
    GEMINI_MODELS.FLASH_20,
    GEMINI_MODELS.PRO_25,
  ],

  /**
   * Short creative copy — headlines, captions, CTAs.
   * Smallest/fastest models are perfect here.
   */
  "creative-copy": [
    GEMINI_MODELS.GEMMA3_4B,      // 30 RPM — tiny, fast
    GEMINI_MODELS.GEMMA3_12B,     // 30 RPM
    GEMINI_MODELS.FLASH_LITE_31,  // 15 RPM
    GEMINI_MODELS.FLASH_LITE_25,  // 10 RPM
    GEMINI_MODELS.FLASH_20,
    GEMINI_MODELS.FLASH_LITE_20,
    GEMINI_MODELS.FLASH_25,
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRateLimit(msg: string) {
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota") || msg.includes("rate");
}

function isInvalidKey(msg: string) {
  return (
    msg.includes("API key") ||
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("API_KEY_INVALID") ||
    msg.includes("leaked") ||
    msg.includes("401")
  );
}

// ── Core call function ─────────────────────────────────────────────────────────
export interface GeminiCallOptions {
  taskType: keyof typeof TASK_MODELS;
  prompt: string;
  /** defaults to "text/plain" */
  mimeType?: "text/plain" | "application/json";
  /** override model order for this specific call */
  modelOverride?: GeminiModel[];
  /** minimum acceptable response length in chars (default 50) */
  minLength?: number;
  /**
   * Max retries per model on rate-limit (default 2).
   * Waits backoff[attempt] ms before each retry.
   */
  maxRetries?: number;
}

export interface GeminiResult {
  text: string;
  model: string;
  taskType: string;
}

// Backoff delays (ms) for rate-limit retries: 4s → 10s → 20s
const BACKOFF = [4_000, 10_000, 20_000];

export async function callGemini(options: GeminiCallOptions): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured in .env.local");

  const genAI = new GoogleGenAI({ apiKey });
  const models = options.modelOverride ?? TASK_MODELS[options.taskType] ?? Object.values(GEMINI_MODELS);
  const minLen = options.minLength ?? 50;
  const maxRetries = options.maxRetries ?? 2;
  const config: GenerateContentConfig = {
    responseMimeType: options.mimeType ?? "text/plain",
  };

  let lastError = "";

  for (const model of models) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Wait before retry (not on first attempt)
      if (attempt > 0) {
        const wait = BACKOFF[attempt - 1] ?? BACKOFF[BACKOFF.length - 1];
        console.log(`[gemini/${options.taskType}] ⏳ ${model} rate-limited — retrying in ${wait / 1000}s (attempt ${attempt}/${maxRetries})`);
        await sleep(wait);
      }

      try {
        console.log(`[gemini/${options.taskType}] trying ${model}${attempt > 0 ? ` (retry ${attempt})` : ""}`);
        const response = await genAI.models.generateContent({
          model,
          contents: options.prompt,
          config,
        });
        const text = response.text?.trim() ?? "";
        if (text.length >= minLen) {
          console.log(`[gemini/${options.taskType}] ✅ ${model} → ${text.length} chars`);
          return { text, model, taskType: options.taskType };
        }
        console.warn(`[gemini/${options.taskType}] ${model} too short (${text.length} chars)`);
        break; // short response — move to next model, no retry
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg;

        if (isInvalidKey(msg)) {
          // Invalid key — no point trying other models
          const error = new Error(
            "Gemini API key is invalid or revoked. Get a fresh key at https://aistudio.google.com/apikey"
          ) as Error & { detail: string };
          error.detail = msg.slice(0, 400);
          throw error;
        }

        if (isRateLimit(msg) && attempt < maxRetries) {
          // Rate limited — will retry this model after backoff
          continue;
        }

        // Other error or retries exhausted — log and move to next model
        if (!isRateLimit(msg)) {
          console.warn(`[gemini/${options.taskType}] ${model} failed: ${msg.slice(0, 200)}`);
        }
        break; // move to next model
      }
    }
  }

  // All models exhausted
  let userMsg = `All Gemini models failed for "${options.taskType}"`;
  if (isRateLimit(lastError)) {
    userMsg = "All Gemini models are rate-limited right now. Please wait 1–2 minutes and try again.";
  } else if (lastError.includes("404") || lastError.includes("not found")) {
    userMsg = "Gemini model not found — model names may have changed.";
  }

  const error = new Error(userMsg) as Error & { detail: string };
  error.detail = lastError.slice(0, 400);
  throw error;
}

export async function generateGeminiImage(prompt: string, businessId?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured in .env.local");

  const genAI = new GoogleGenAI({ apiKey });

  let finalPrompt = prompt;

  // ─── BRAND CONSISTENCY ENFORCEMENT ───
  if (businessId) {
    const { localDb } = await import("@/lib/localDb");
    const business = localDb.get(businessId);
    if (business) {
      const guidelines = business.brand_guidelines || {};
      const visualId = business.brand_memory?.visual_identity || {};
      const primaryColor = guidelines.colors?.[0]?.hex || "#333";
      const accentColor = guidelines.colors?.[1]?.hex || "#555";
      const imageStyle = visualId.image_style || business.enriched_data?.brandAesthetic || "modern, high quality";
      
      finalPrompt = `[Brand Aesthetics: ${imageStyle}. Color palette to emphasize: ${primaryColor}, ${accentColor}. Ensure lighting and composition is professional commercial standard] ${prompt}`;
    }
  }

  try {
    const response = await genAI.models.generateImages({
      model: 'imagen-3.0-generate-002',
      prompt: finalPrompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
      }
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      return response.generatedImages[0].image.imageBytes;
    }
    throw new Error("No image generated");
  } catch (err: any) {
    console.error("[generateGeminiImage] Error:", err);
    throw err;
  }
}

export async function generateGeminiVideo(prompt: string): Promise<string> {
  // Veo integration placeholder / stub
  throw new Error("Video generation is not currently available. Please use image generation.");
}
