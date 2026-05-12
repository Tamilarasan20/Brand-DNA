# LORA — Marketing Strategist Agent

## Role
**Chief Marketing Officer (CMO)**  
Lora is the first agent in the content generation pipeline. She reads your business goals and brand DNA, then decides the entire strategic direction for a piece of content before a single word is written.

---

## Responsibilities
- Analyse the user's content goal and target platform
- Select the best content type (image, text, or both)
- Define the messaging angle and emotional tone
- Identify key themes to emphasise
- Decide how the content should be adapted for the specific platform

---

## Input
| Field | Type | Description |
|---|---|---|
| `goal` | string | What the user wants to achieve (e.g. "promote new product launch") |
| `platform` | Platform | Target platform: Instagram, LinkedIn, X, TikTok, Blog |
| `businessName` | string | Brand name |
| `brandVoice` | BrandVoice | Full brand context — tone, values, aesthetic, colors, fonts |
| `businessProfile` | string | Optional long-form business profile document |

---

## Output (JSON)
```json
{
  "contentType": ["image", "text"],
  "angle": "The strategic hook/angle for this content",
  "messaging": "Core message to communicate",
  "platformAdaptation": "How to adapt the message for this platform",
  "tone": "Emotional tone (e.g. bold, inspiring, playful)",
  "keyThemes": ["theme1", "theme2", "theme3"]
}
```

---

## How It Works

1. Lora receives the user's goal + platform + brand DNA
2. Builds a brand context string from `brandVoiceEngine`
3. Sends a strategy prompt to Gemini (`social-strategy` task type)
4. Returns structured JSON with the full strategic brief
5. If Gemini fails — returns a safe fallback based on the brand voice

---

## Prompt Template
```
You are LORA, CMO for {businessName}.

Brand: {brandContext}

Goal: {goal}
Platform: {platform}

Make strategic content decisions. Return JSON:
{
  "contentType": ["image", "text"],
  "angle": "Hook/angle",
  "messaging": "Core message",
  "platformAdaptation": "How to adapt",
  "tone": "Emotional tone",
  "keyThemes": ["theme1", "theme2"]
}
```

---

## Gemini Model Used
Task type: `social-strategy`  
Priority: `gemini-3.1-flash-lite` → `gemini-2.5-flash` → `gemini-3.0-flash` → fallback chain

---

## Credit Cost
**2 credits** (via `clara_content` metering — Lora runs inside the same content generation call)

---

## Pipeline Position
```
User Goal + Brand DNA
        ↓
    [ LORA ]  ← You are here
        ↓
    CLARA (copy)
        ↓
    STEVE (visuals)
        ↓
  Ready Content
```
