# NICK — AI Analyst

## Role
**Growth Analytics Lead**
Nick reads performance data from posts, ads, videos, and emails — then tells you what worked, what didn't, **why**, and what to do next. Every insight is evidence-backed: he cites specific item IDs and metrics rather than handing out generic advice.

---

## Responsibilities
- Score the period (engagement rate, top format, top platform, overall verdict)
- Identify **winners** with replicable elements
- Identify **losers** with concrete fix suggestions
- Rank insights by severity (high / medium / low)
- Categorise insights (hook / format / timing / audience / creative / cta / targeting / budget / platform)
- Spot **working patterns** across winners
- Spot **failing patterns** across losers
- Produce prioritised next actions (do-now / do-this-week / do-this-month)
- Benchmark against industry baselines

---

## Triggered By
`POST /api/agents/nick`

```json
{
  "businessId": "uuid (optional)",
  "periodLabel": "Last 30 days",
  "goal": "Grow newsletter signups",
  "items": [
    {
      "id": "post_42",
      "source": "organic-post",
      "platform": "instagram",
      "title": "Behind the scenes",
      "publishedAt": "2026-04-15",
      "metrics": {
        "impressions": 12400,
        "reach": 9800,
        "likes": 642,
        "comments": 38,
        "shares": 21,
        "saves": 145,
        "ctr": 2.1,
        "conversions": 18
      },
      "meta": { "hook": "What we shoot before sunrise", "format": "carousel", "hashtags": ["#bts"], "cta": "Save this" }
    }
  ]
}
```

---

## Supported Content Sources
`organic-post` · `ad` · `video` · `email` · `blog`

---

## Output

```json
{
  "period": "Last 30 days",
  "summary": "2-3 sentence executive summary",
  "scorecard": {
    "totalContent": 28,
    "avgEngagementRate": "4.2%",
    "topPerformingFormat": "carousel",
    "topPerformingPlatform": "instagram",
    "overallVerdict": "on-track"
  },
  "winners": [
    {
      "itemId": "post_42",
      "reason": "Save rate 3.7x category average — high signal of utility",
      "metric": "saves",
      "value": "145 saves / 12.4K impressions",
      "replicableElements": ["BTS hook format", "Save-this CTA", "Carousel format"]
    }
  ],
  "losers": [
    {
      "itemId": "post_38",
      "reason": "Hook reused 3rd time this month — audience fatigue",
      "metric": "engagement_rate",
      "value": "0.4%",
      "fixSuggestion": "Rotate hook category — try pain-point instead of curiosity"
    }
  ],
  "insights": [
    {
      "rank": 1,
      "severity": "high",
      "category": "format",
      "finding": "Carousels outperform single-image posts 3.2x on saves",
      "evidence": ["post_42: 145 saves", "post_19: 89 saves", "post_07: 12 saves (single)"],
      "recommendation": "Default to carousel for educational content; reserve single-image for product launches"
    }
  ],
  "patterns": {
    "workingPatterns": ["BTS / process content drives saves", "Tuesday 9am posts get 40% more reach"],
    "failingPatterns": ["Sales CTAs without context tank engagement", "Hashtag stuffing reduces reach"]
  },
  "nextActions": [
    {
      "priority": "do-now",
      "action": "Schedule next carousel for Tue 9am with BTS angle",
      "expectedImpact": "Predicted 2.5x engagement vs current baseline"
    }
  ],
  "benchmarkNotes": ["IG carousel ER benchmark: 1.6% — you are at 4.2%, top-quartile"]
}
```

---

## Severity Definitions

| Severity | Meaning |
|---|---|
| `high` | Pattern affects >50% of content; immediate action required |
| `medium` | Pattern affects 20–50% of content; address this week |
| `low` | Marginal optimisation; nice-to-have |

---

## Insight Categories

| Category | What it covers |
|---|---|
| `hook` | First 3 seconds / first line |
| `format` | Carousel vs single vs video vs Reel |
| `timing` | Day-of-week, time-of-day |
| `audience` | Targeting / segment fit |
| `creative` | Visual style, copy style |
| `cta` | Call-to-action wording + placement |
| `targeting` | Ad-side: interests / lookalikes |
| `budget` | Ad-side: spend allocation |
| `platform` | Cross-platform performance gaps |

---

## Gemini Model
Task type: `market-research`
Priority: FLASH_25 → FLASH_LITE_31 → FLASH_30 → GEMMA4_31B → PRO_25

---

## Credit Cost
**2 credits** per call (`nick_analyze`)

---

## Pipeline Position

```
Performance data (organic + paid)
     ↓
[ NICK ]
     ↓
Winners + losers + ranked insights + next actions → feeds back into
  • Lora / Clara — to change strategy + copy
  • Elena — to kill / scale / iterate ad sets
  • Sophie — to update SEO briefs
```
