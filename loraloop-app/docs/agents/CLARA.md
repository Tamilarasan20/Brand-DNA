# CLARA — Copywriter Agent

## Role
**Chief Content Officer**  
Clara takes Lora's strategic brief and turns it into real, platform-ready copy. She writes the hook, caption, text overlays, hashtags, and CTAs — all locked to your brand's tone of voice.

---

## Responsibilities
- Write attention-grabbing hooks
- Craft the core value proposition message
- Define text overlays (what goes on the image, where, how big)
- Write the full social caption
- Generate relevant, brand-aligned hashtags
- Surface key phrases for the visual designer (Steve)

---

## Input
| Field | Type | Description |
|---|---|---|
| `loraStrategy` | LoraOutput | Full strategic brief from Lora |
| `brandVoice` | BrandVoice | Brand tone, values, aesthetic, fonts, colors |
| `businessName` | string | Brand name |
| `platform` | Platform | Target platform |
| `goal` | string | Original user goal |

---

## Output (JSON)
```json
{
  "hook": "Attention-grabbing opening line",
  "coreMessage": "Main value proposition",
  "textOverlays": [
    { "text": "Overlay text", "placement": "top|center|bottom", "size": "large|medium|small" }
  ],
  "keyPhrases": ["phrase1", "phrase2"],
  "caption": "Full platform-optimised caption ready to post",
  "hashtags": ["#brand", "#relevant", "#hashtag"]
}
```

---

## How It Works

1. Receives Lora's strategy (angle, messaging, tone, key themes)
2. Reads the brand voice for tone, writing style, banned words, CTA style
3. Builds a copy prompt targeting the specific platform's format
4. Sends to Gemini (`social-strategy` task type)
5. Returns structured JSON with all copy elements
6. On failure — falls back to Lora's messaging directly

---

## Prompt Template
```
You are CLARA, Chief Content Officer for {businessName}.

Brand: {brandContext}

Strategy from Lora:
- Angle: {loraStrategy.angle}
- Message: {loraStrategy.messaging}
- Tone: {loraStrategy.tone}

Create compelling copy for {platform}. Return JSON:
{
  "hook": "Attention-grabbing opening",
  "coreMessage": "Main value proposition",
  "textOverlays": [{"text": "Text", "placement": "top", "size": "large"}],
  "keyPhrases": ["phrase1", "phrase2"],
  "caption": "Platform-optimized caption",
  "hashtags": ["#brand", "#relevant"]
}
```

---

## Gemini Model Used
Task type: `social-strategy`  
Priority: `gemini-3.1-flash-lite` → `gemini-2.5-flash` → `gemini-3.0-flash` → fallback chain

---

## Credit Cost
**2 credits** per call (`clara_content` action)

---

## Pipeline Position
```
User Goal + Brand DNA
        ↓
    LORA (strategy)
        ↓
    [ CLARA ]  ← You are here
        ↓
    STEVE (visuals)
        ↓
  Ready Content
```
