# STEVE — Visual Designer Agent

## Role
**AI Image Director**  
Steve takes Clara's copy and turns it into a precise, brand-locked image generation prompt. He knows your exact colors, fonts, logo URL, and reference images — and uses them to produce prompts that generate visuals that look like they came from your existing creative team.

---

## Responsibilities
- Build detailed image generation prompts using scraped brand assets
- Enforce brand color palette (primary, secondary, accent, background)
- Specify typography (heading font, body font from brand guidelines)
- Set correct platform dimensions (Instagram 1080×1350, TikTok 1080×1920, etc.)
- Include logo placement instructions
- Reference brand image URLs to match visual style
- Define text overlay positions, sizes, and copy

---

## Input
| Field | Type | Description |
|---|---|---|
| `claraOutput` | ClaraOutput | Hook, message, text overlays, key phrases from Clara |
| `brandVoice` | BrandVoice | Colors, fonts, aesthetic, tone, values |
| `businessName` | string | Brand name |
| `platform` | Platform | Target platform — determines output dimensions |
| `style` | string | Visual style preference (default: `professional`) |
| `imageType` | string | Type of image (default: `branded`) |
| `referenceImages` | string[] | Up to 3 brand image URLs scraped from the website |
| `logoUrl` | string | Brand logo URL scraped from the website |

---

## Output
```typescript
{
  prompt: {
    prompt: string,           // Full image generation prompt
    style: string,            // Visual aesthetic
    composition: string,      // Platform + dimensions
    colors: string,           // Primary / Secondary / Accent
    textOverlay: string,      // Overlay instructions
    aspectRatio: string,      // "1:1" | "4:5" | "9:16" | etc.
    platform: Platform,
    brandColors: object,
    brandFonts: object,
    metadata: { platform, dimensions }
  },
  imageUrl?: string,          // If Gemini returns a URL
  generatedAt: string
}
```

---

## Platform Dimensions
| Platform | Width | Height | Ratio |
|---|---|---|---|
| Instagram | 1080px | 1350px | 4:5 |
| LinkedIn | 1200px | 627px | 1.91:1 |
| X (Twitter) | 1200px | 675px | 16:9 |
| TikTok | 1080px | 1920px | 9:16 |
| Blog | 1200px | 600px | 2:1 |

---

## Brand Reference Section
Steve automatically builds a brand reference block from scraped knowledge base data:

```
Color Palette:
  Primary: #1a1a2e
  Secondary: #16213e
  Accent: #0f3460
  Background: #f5f5f5

Logo: https://brand.com/logo.svg — preserve brand mark placement, top-left or watermark corner

Brand Visual References (match this aesthetic style):
  1. https://brand.com/hero-image.jpg
  2. https://brand.com/product-shot.jpg
  3. https://brand.com/lifestyle.webp
  → Match the visual style, composition, and mood of these brand images
```

---

## Prompt Template
```
Create a {style} {imageType} image for {businessName}.

BRAND GUIDELINES (from knowledge base):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{brandReferenceSection}

CONTENT TO VISUALIZE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hook: "{claraOutput.hook}"
Message: "{claraOutput.coreMessage}"
Platform: {platform} ({width}x{height}px, ratio {ratio})

TEXT OVERLAYS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• TOP | large | "Overlay text"

VISUAL DIRECTION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Aesthetic: {brandVoice.aesthetic}
- Tone: {brandVoice.tone}
- Values: {brandVoice.values}
- Typography: {headingFont} / {bodyFont}
- Tagline: "{brandVoice.tagline}"
```

---

## Gemini Model Used
Task type: `steve-design`  
Priority: `gemini-2.5-flash` → `gemini-3.1-flash-lite` → `gemini-3.0-flash` → fallback chain

Image generation: `generateGeminiImage()` → Imagen 3 (`imagen-3.0-generate-002`)

---

## Credit Cost
- **Image:** 3 credits (`steve_image`)
- **Carousel:** 5 credits (`steve_carousel`)

---

## Pipeline Position
```
User Goal + Brand DNA
        ↓
    LORA (strategy)
        ↓
    CLARA (copy)
        ↓
    [ STEVE ]  ← You are here
        ↓
  Ready Content (prompt + optional image URL)
```
