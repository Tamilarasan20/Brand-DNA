# THEO — AI Video Producer

## Role
**Short-Form Video Director**
Theo turns ideas into production-ready short video plans. Hook, full script, shot-by-shot direction, captions, music mood, sound effects, thumbnail, CTA — locked to the target platform's specs.

---

## Responsibilities
- Write scroll-stopping hooks for the first 1.5 seconds
- Generate full voiceover scripts with `[SHOT N]` markers
- Build shot-by-shot direction (visual, voiceover, on-screen text, b-roll, camera movement, transitions)
- Lock aspect ratio + dimensions per platform
- Suggest music mood, BPM, and sound effects
- Write platform caption + hashtags
- Define thumbnail / cover frame
- Write production notes (lighting, framing, edit pace)

---

## Triggered By
`POST /api/agents/theo`

```json
{
  "businessId": "uuid (optional)",
  "topic": "Behind the scenes of our new launch",
  "platform": "tiktok",
  "durationSec": 30,
  "style": "ugc",
  "goal": "Drive sign-ups",
  "hookExamples": ["POV: you finally found..."]
}
```

---

## Platform Specs

| Platform | Aspect | Ideal Length | Dimensions |
|---|---|---|---|
| TikTok | 9:16 | 15–60s | 1080×1920 |
| Instagram (Reels) | 9:16 | 15–90s | 1080×1920 |
| YouTube (Shorts) | 9:16 | 30–60s | 1080×1920 |
| LinkedIn | 1:1 | 30–90s | 1080×1080 |
| Twitter / X | 16:9 | 15–45s | 1920×1080 |

---

## Style Options
- `talking-head` — single-subject monologue
- `cinematic` — story-driven, polished
- `tutorial` — step-by-step how-to
- `ugc` — raw, authentic, hand-held
- `animation` — motion graphics
- `product-demo` — product-focused walkthrough

---

## Output

```json
{
  "title": "Working title",
  "hook": "First 1.5s scroll-stopper",
  "fullScript": "Complete script with [SHOT N] markers",
  "shots": [
    {
      "shotNumber": 1,
      "durationSec": 1.5,
      "visual": "What's on screen",
      "voiceover": "What the narrator says",
      "onScreenText": "Burned-in caption",
      "bRoll": ["..."],
      "cameraMovement": "push-in | pan | whip-pan | handheld | static",
      "transition": "cut | match-cut | whip-pan | fade"
    }
  ],
  "totalDurationSec": 30,
  "platform": "tiktok",
  "aspectRatio": "9:16",
  "dimensions": "1080x1920",
  "captions": [{ "time": "0:00", "text": "..." }],
  "musicMood": "Upbeat, 120 BPM, lo-fi hip hop",
  "soundEffects": ["whoosh on transition 1", "ding on reveal"],
  "thumbnailIdea": "Bold text over brand colour",
  "caption": "Platform description",
  "hashtags": ["#tag1"],
  "callToAction": "Follow for part 2",
  "productionNotes": ["..."]
}
```

---

## Hook Philosophy
Theo always builds the first 1.5 seconds as a **pattern interrupt**. Three patterns he favours:

| Pattern | Example |
|---|---|
| Curiosity gap | "Wait — you can actually..." |
| Pain point | "If your launch tanked, this is why" |
| Bold claim | "Most founders get this completely wrong" |

---

## Gemini Model
Task type: `steve-design` (creative JSON)
Priority: FLASH_25 → FLASH_LITE_31 → FLASH_30 → FLASH_LITE_25 → GEMMA4_31B

---

## Credit Cost
**4 credits** per call (`theo_video`)

---

## Pipeline Position

```
Topic + brand DNA
     ↓
[ THEO ]
     ↓
Shot list + script + captions → handed to editor / video generator
```
