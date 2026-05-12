# ELENA — AI Ads Manager

## Role
**Performance Marketing Director**
Elena plans, drafts, and improves paid ad campaigns across Meta, Google, TikTok, LinkedIn, and YouTube. She returns a launch-ready brief: audiences, creatives, budget allocation, KPI targets, and rules for when to kill / scale / iterate.

---

## Responsibilities
- Build campaign structure (objective + bidding strategy)
- Define 3–5 audience segments (cold, warm, retargeting, lookalike)
- Write 3–5 creative variants for split-testing
- Allocate budget across audience × creative combinations
- Set KPI targets (CTR, CPC, CPA, ROAS)
- Generate UTM tracking template
- Write optimisation rules (kill / scale / iterate)
- Forecast impressions, clicks, conversions
- Re-optimise campaigns when given current performance data

---

## Triggered By
`POST /api/agents/elena`

```json
{
  "businessId": "uuid (optional)",
  "product": "Summer sale — 30% off all skincare",
  "network": "meta",
  "objective": "sales",
  "budgetUsdPerDay": 100,
  "durationDays": 14,
  "audienceHints": "Women 25-44 interested in clean beauty",
  "currentPerformance": {
    "impressions": 50000,
    "clicks": 600,
    "conversions": 24,
    "spendUsd": 800,
    "ctr": 1.2,
    "cpa": 33,
    "roas": 1.8
  }
}
```

---

## Supported Networks
`meta` · `google` · `tiktok` · `linkedin` · `youtube`

## Supported Objectives
`awareness` · `traffic` · `leads` · `sales` · `app-installs` · `engagement`

---

## Output

```json
{
  "campaignName": "...",
  "objective": "sales",
  "network": "meta",
  "totalBudgetUsd": 1400,
  "dailyBudgetUsd": 100,
  "durationDays": 14,
  "biddingStrategy": "Lowest cost with $10 bid cap",
  "audiences": [
    {
      "name": "Cold — Clean beauty enthusiasts",
      "type": "cold",
      "interests": ["clean beauty", "skincare"],
      "demographics": { "ageRange": "25-44", "gender": "female", "locations": ["US", "CA"] },
      "behaviours": ["online shoppers"],
      "estimatedReachLow": 800000,
      "estimatedReachHigh": 2500000
    }
  ],
  "creatives": [
    {
      "variantName": "V1 — Pain point",
      "headline": "<= 40 chars",
      "primaryText": "<= 125 chars",
      "description": "<= 30 chars",
      "callToAction": "Shop Now",
      "visualConcept": "Before/after split-screen",
      "hookType": "pain-point"
    }
  ],
  "budgetSplit": [{ "audienceName": "...", "creativeName": "...", "sharePercent": 25 }],
  "utmTemplate": "utm_source=meta&utm_medium=cpc&utm_campaign=summer-sale",
  "conversionEvents": ["Purchase"],
  "kpiTargets": {
    "ctr": "> 1.5%",
    "cpc": "< $1.20",
    "cpa": "< $25",
    "roas": "> 2.5x"
  },
  "optimisationRules": {
    "kill": ["CTR < 0.5% after $50 spend"],
    "scale": ["ROAS > 3x sustained 3 days → +20% budget"],
    "iterate": ["CTR good but CPA high → swap CTA"]
  },
  "testingPlan": ["Week 1: 3×3 split test", "Week 2: Scale winners"],
  "forecastedMetrics": {
    "impressions": "300K – 600K",
    "clicks": "3K – 7K",
    "conversions": "60 – 120",
    "estimatedSpend": "$1,400"
  }
}
```

---

## Hook Types Elena Uses

| Hook | When to use |
|---|---|
| `pain-point` | Direct response, fix-it offers |
| `curiosity` | Top-of-funnel, content-led |
| `social-proof` | Crowded categories |
| `urgency` | Sales, deadlines, limited stock |
| `aspiration` | Lifestyle / premium positioning |
| `transformation` | Before/after, results-driven |

---

## Gemini Model
Task type: `market-research`
Priority: FLASH_25 → FLASH_LITE_31 → FLASH_30 → GEMMA4_31B → PRO_25

---

## Credit Cost
**4 credits** per call (`elena_ads`)

---

## Pipeline Position

```
Product + budget + objective
     ↓
[ ELENA ] ← optionally fed current campaign metrics
     ↓
Launch-ready campaign plan + creatives + rules → marketer executes
```
