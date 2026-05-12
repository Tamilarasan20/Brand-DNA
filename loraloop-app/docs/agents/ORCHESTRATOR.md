# Orchestrator — Agent Pipeline Coordinator

## Role
**Pipeline Manager**  
The Orchestrator loads the business knowledge base from Supabase, then chains Lora → Clara → Steve in sequence, passing each agent's output as the next agent's input. It returns the final formatted content ready to post.

---

## Full Pipeline Flow

```
POST /api/agents/orchestrate
        │
        ▼
┌─────────────────────────────┐
│  Load Knowledge Base (KB)   │  ← Supabase businesses table
│  enriched_data, brand_      │
│  guidelines, documents      │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  Extract Brand Voice        │  ← brandVoiceEngine.ts
│  colors, fonts, tone,       │
│  values, aesthetic          │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  LORA — Strategy            │  ← Gemini: social-strategy
│  angle, messaging, tone,    │
│  themes, platform adapt     │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  CLARA — Copy               │  ← Gemini: social-strategy
│  hook, caption, hashtags,   │
│  text overlays, key phrases │
└────────────┬────────────────┘
             │
             ▼ (only if contentTypes includes "image")
┌─────────────────────────────┐
│  STEVE — Visuals            │  ← Gemini: steve-design
│  image prompt + dimensions  │
│  + brand asset references   │
└────────────┬────────────────┘
             │
             ▼
     Final OrchestratorOutput
```

---

## API Endpoint

**POST** `/api/agents/orchestrate`

### Request Body
```json
{
  "businessId": "uuid",
  "goal": "Promote our new product launch to drive signups",
  "platform": "instagram",
  "contentTypes": ["text", "image"],
  "preferences": {
    "style": "professional",
    "imageType": "branded"
  }
}
```

### Response
```json
{
  "metadata": {
    "businessId": "uuid",
    "businessName": "Acme Corp",
    "platform": "instagram",
    "goal": "...",
    "generatedAt": "2025-05-12T...",
    "brandVoice": "Bold, innovative, customer-first",
    "processingTime": 4200,
    "agentDecisions": {
      "lora": { "angle": "...", "messaging": "...", "tone": "..." },
      "clara": { "hook": "...", "caption": "...", "hashtags": [...] }
    }
  },
  "text": {
    "caption": "Full ready-to-post caption",
    "hashtags": ["#brand", "#launch"],
    "keyPhrases": ["phrase1", "phrase2"]
  },
  "image": {
    "url": "https://...",
    "prompt": "Full image generation prompt...",
    "metadata": {
      "platform": "instagram",
      "dimensions": "1080x1350",
      "generatedAt": "..."
    }
  }
}
```

---

## Knowledge Base Loading

The Orchestrator loads data from Supabase `businesses` table and maps it to structured types:

| Supabase Column | Mapped To |
|---|---|
| `enriched_data.brandValues` | `brandVoice.values` |
| `enriched_data.brandTone` | `brandVoice.tone` |
| `enriched_data.brandAesthetic` | `brandVoice.aesthetic` |
| `brand_guidelines.colors[]` | `brandVoice.colors` (object) |
| `brand_guidelines.typography[]` | `brandVoice.fonts.headingFont/bodyFont` |
| `brand_guidelines.logos[0].url` | `logoUrl` for Steve |
| `brand_guidelines.images[]` | `referenceImages` for Steve (top 3) |
| `business_profile` | Long-form profile fed to Lora |

Falls back to `getMockBusiness()` if business not found.

---

## Supported Platforms
`instagram` · `linkedin` · `twitter` · `tiktok` · `blog`

---

## Supported Content Types
`text` · `image` (Steve only runs if `"image"` is in `contentTypes`)
