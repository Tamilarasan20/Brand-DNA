/**
 * NICK — AI Analyst
 *
 * Reads performance data from posts, ads, and content. Reports what worked,
 * what didn't, why, and what to do next. Generates ranked insights + a
 * prioritised action list.
 */

import { BrandVoice } from '@/types/agents';
import { callGemini } from '../gemini';
import { buildBrandContext } from '../brandVoiceEngine';

export type ContentSource = 'organic-post' | 'ad' | 'video' | 'email' | 'blog';

export interface NickContentItem {
  id: string;
  source: ContentSource;
  platform: string;
  title?: string;
  publishedAt?: string;
  metrics: {
    impressions?: number;
    reach?: number;
    clicks?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    watchTimeSec?: number;
    completionRate?: number;
    ctr?: number;
    cpc?: number;
    cpa?: number;
    roas?: number;
    conversions?: number;
    revenueUsd?: number;
    spendUsd?: number;
  };
  meta?: {
    hook?: string;
    format?: string;
    hashtags?: string[];
    cta?: string;
  };
}

export interface NickInput {
  businessName: string;
  brandVoice: BrandVoice;
  items: NickContentItem[];
  goal?: string;
  periodLabel?: string;
}

export interface NickInsight {
  rank: number;
  severity: 'high' | 'medium' | 'low';
  category: 'hook' | 'format' | 'timing' | 'audience' | 'creative' | 'cta' | 'targeting' | 'budget' | 'platform';
  finding: string;
  evidence: string[];
  recommendation: string;
}

export interface NickWinner {
  itemId: string;
  reason: string;
  metric: string;
  value: string;
  replicableElements: string[];
}

export interface NickLoser {
  itemId: string;
  reason: string;
  metric: string;
  value: string;
  fixSuggestion: string;
}

export interface NickOutput {
  period: string;
  summary: string;
  scorecard: {
    totalContent: number;
    avgEngagementRate: string;
    topPerformingFormat: string;
    topPerformingPlatform: string;
    overallVerdict: 'crushing-it' | 'on-track' | 'underperforming' | 'mixed';
  };
  winners: NickWinner[];
  losers: NickLoser[];
  insights: NickInsight[];
  patterns: {
    workingPatterns: string[];
    failingPatterns: string[];
  };
  nextActions: {
    priority: 'do-now' | 'do-this-week' | 'do-this-month';
    action: string;
    expectedImpact: string;
  }[];
  benchmarkNotes: string[];
}

function compactItems(items: NickContentItem[]): string {
  return items
    .slice(0, 50)
    .map((it) => {
      const m = it.metrics;
      const eng = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
      const er = m.impressions ? ((eng / m.impressions) * 100).toFixed(2) : 'n/a';
      return `${it.id} | ${it.source} | ${it.platform} | ${it.title?.slice(0, 60) ?? ''} | imp:${m.impressions ?? 0} eng:${eng} er:${er}% ctr:${m.ctr ?? 'n/a'} conv:${m.conversions ?? 0} roas:${m.roas ?? 'n/a'} hook:"${it.meta?.hook?.slice(0, 80) ?? ''}" format:${it.meta?.format ?? 'n/a'}`;
    })
    .join('\n');
}

export async function runNick(input: NickInput): Promise<NickOutput> {
  const { businessName, brandVoice, items, goal, periodLabel = 'Last 30 days' } = input;
  const brandContext = buildBrandContext(brandVoice, businessName);

  if (items.length === 0) {
    return {
      period: periodLabel,
      summary: 'No content data available for this period.',
      scorecard: { totalContent: 0, avgEngagementRate: '0%', topPerformingFormat: 'n/a', topPerformingPlatform: 'n/a', overallVerdict: 'underperforming' },
      winners: [], losers: [], insights: [],
      patterns: { workingPatterns: [], failingPatterns: [] },
      nextActions: [{ priority: 'do-now', action: 'Publish content to generate performance data', expectedImpact: 'Establishes baseline metrics for analysis' }],
      benchmarkNotes: [],
    };
  }

  const prompt = `You are NICK, head of growth analytics for ${businessName}.

Brand: ${brandContext}

Period: ${periodLabel}
${goal ? `Stated goal: ${goal}` : ''}

Content performance data (${items.length} items):
${compactItems(items)}

Analyse what worked, what didn't, and produce a ranked, evidence-backed action list. Don't speculate without data — every insight must cite specific item IDs or metrics. Be specific, blunt, and useful — not generic.

Return STRICT JSON:
{
  "period": "${periodLabel}",
  "summary": "2-3 sentence executive summary of the period",
  "scorecard": {
    "totalContent": ${items.length},
    "avgEngagementRate": "X.X%",
    "topPerformingFormat": "Format type",
    "topPerformingPlatform": "Platform name",
    "overallVerdict": "crushing-it | on-track | underperforming | mixed"
  },
  "winners": [
    {
      "itemId": "id from data",
      "reason": "Why it won — specific to this piece",
      "metric": "Which KPI it dominated",
      "value": "The actual number",
      "replicableElements": ["What to copy into future content"]
    }
  ],
  "losers": [
    {
      "itemId": "id from data",
      "reason": "Why it failed — specific diagnosis",
      "metric": "Which KPI tanked",
      "value": "The actual number",
      "fixSuggestion": "Concrete fix for next time"
    }
  ],
  "insights": [
    {
      "rank": 1,
      "severity": "high | medium | low",
      "category": "hook | format | timing | audience | creative | cta | targeting | budget | platform",
      "finding": "What you discovered in plain English",
      "evidence": ["Specific item IDs and metrics that support this"],
      "recommendation": "What to do about it"
    }
  ],
  "patterns": {
    "workingPatterns": ["Pattern across multiple winners"],
    "failingPatterns": ["Pattern across multiple losers"]
  },
  "nextActions": [
    {
      "priority": "do-now | do-this-week | do-this-month",
      "action": "Specific, executable action",
      "expectedImpact": "What lift you expect and on which KPI"
    }
  ],
  "benchmarkNotes": ["How this compares to industry baselines"]
}`;

  try {
    const result = await callGemini({
      taskType: 'market-research',
      prompt,
      mimeType: 'application/json',
      minLength: 600,
    });
    return JSON.parse(result.text);
  } catch (error) {
    console.error('[NICK] Error:', error);
    const totalImp = items.reduce((s, it) => s + (it.metrics.impressions ?? 0), 0);
    const totalEng = items.reduce((s, it) => s + (it.metrics.likes ?? 0) + (it.metrics.comments ?? 0) + (it.metrics.shares ?? 0), 0);
    const avgEr = totalImp > 0 ? ((totalEng / totalImp) * 100).toFixed(2) : '0';
    return {
      period: periodLabel,
      summary: `Reviewed ${items.length} pieces of content in ${periodLabel}. Analysis service temporarily degraded — basic metrics below.`,
      scorecard: {
        totalContent: items.length,
        avgEngagementRate: `${avgEr}%`,
        topPerformingFormat: items[0]?.meta?.format ?? 'n/a',
        topPerformingPlatform: items[0]?.platform ?? 'n/a',
        overallVerdict: 'mixed',
      },
      winners: [], losers: [], insights: [],
      patterns: { workingPatterns: [], failingPatterns: [] },
      nextActions: [{ priority: 'do-this-week', action: 'Re-run analysis when service recovers', expectedImpact: 'Full insight set' }],
      benchmarkNotes: [],
    };
  }
}
