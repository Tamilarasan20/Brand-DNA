/**
 * ELENA — AI Ads Manager
 *
 * Plans, drafts, and improves paid ad campaigns across Meta, Google,
 * TikTok, and LinkedIn. Generates: audience targeting, creative variants,
 * bidding strategy, budget allocation, and post-launch optimisation logic.
 */

import { BrandVoice } from '@/types/agents';
import { callGemini } from '../gemini';
import { buildBrandContext } from '../brandVoiceEngine';

export type AdNetwork = 'meta' | 'google' | 'tiktok' | 'linkedin' | 'youtube';
export type CampaignObjective = 'awareness' | 'traffic' | 'leads' | 'sales' | 'app-installs' | 'engagement';

export interface ElenaInput {
  product: string;
  businessName: string;
  brandVoice: BrandVoice;
  network: AdNetwork;
  objective: CampaignObjective;
  budgetUsdPerDay: number;
  durationDays?: number;
  audienceHints?: string;
  currentPerformance?: {
    impressions?: number;
    clicks?: number;
    conversions?: number;
    spendUsd?: number;
    ctr?: number;
    cpa?: number;
    roas?: number;
  };
}

export interface ElenaAdCreative {
  variantName: string;
  headline: string;
  primaryText: string;
  description: string;
  callToAction: string;
  visualConcept: string;
  hookType: 'pain-point' | 'curiosity' | 'social-proof' | 'urgency' | 'aspiration' | 'transformation';
}

export interface ElenaAudience {
  name: string;
  type: 'cold' | 'warm' | 'retargeting' | 'lookalike';
  interests: string[];
  demographics: { ageRange: string; gender: string; locations: string[] };
  behaviours: string[];
  estimatedReachLow: number;
  estimatedReachHigh: number;
}

export interface ElenaOutput {
  campaignName: string;
  objective: CampaignObjective;
  network: AdNetwork;
  totalBudgetUsd: number;
  dailyBudgetUsd: number;
  durationDays: number;
  biddingStrategy: string;
  audiences: ElenaAudience[];
  creatives: ElenaAdCreative[];
  budgetSplit: { audienceName: string; creativeName: string; sharePercent: number }[];
  utmTemplate: string;
  conversionEvents: string[];
  kpiTargets: { ctr: string; cpc: string; cpa: string; roas: string };
  optimisationRules: {
    kill: string[];
    scale: string[];
    iterate: string[];
  };
  testingPlan: string[];
  forecastedMetrics: {
    impressions: string;
    clicks: string;
    conversions: string;
    estimatedSpend: string;
  };
}

export async function runElena(input: ElenaInput): Promise<ElenaOutput> {
  const {
    product, businessName, brandVoice,
    network, objective, budgetUsdPerDay,
    durationDays = 14, audienceHints, currentPerformance,
  } = input;

  const brandContext = buildBrandContext(brandVoice, businessName);
  const totalBudget = budgetUsdPerDay * durationDays;

  const perfBlock = currentPerformance
    ? `Current campaign performance (optimise based on this):
${Object.entries(currentPerformance).map(([k, v]) => `  - ${k}: ${v}`).join('\n')}`
    : 'No prior campaign data — this is a new campaign launch.';

  const prompt = `You are ELENA, a performance marketing director for ${businessName}.

Brand: ${brandContext}

Campaign brief:
- Product/offer: ${product}
- Network: ${network}
- Objective: ${objective}
- Daily budget: $${budgetUsdPerDay}
- Duration: ${durationDays} days (total $${totalBudget})
${audienceHints ? `- Audience hints: ${audienceHints}` : ''}

${perfBlock}

Build a complete, launch-ready paid campaign. Include 3-5 audience segments, 3-5 creative variants designed for split-testing, budget allocation, KPI targets, and rules for when to kill / scale / iterate.

Return STRICT JSON:
{
  "campaignName": "Tactical campaign name",
  "objective": "${objective}",
  "network": "${network}",
  "totalBudgetUsd": ${totalBudget},
  "dailyBudgetUsd": ${budgetUsdPerDay},
  "durationDays": ${durationDays},
  "biddingStrategy": "Specific bidding strategy for this network + objective",
  "audiences": [
    {
      "name": "Audience segment name",
      "type": "cold | warm | retargeting | lookalike",
      "interests": ["specific interest targeting"],
      "demographics": { "ageRange": "25-44", "gender": "all", "locations": ["US", "CA"] },
      "behaviours": ["specific behaviours"],
      "estimatedReachLow": 100000,
      "estimatedReachHigh": 500000
    }
  ],
  "creatives": [
    {
      "variantName": "V1 — Pain point hook",
      "headline": "<= 40 chars",
      "primaryText": "<= 125 chars",
      "description": "<= 30 chars",
      "callToAction": "Shop Now | Learn More | Sign Up | Get Quote | Download",
      "visualConcept": "What the image/video should show",
      "hookType": "pain-point | curiosity | social-proof | urgency | aspiration | transformation"
    }
  ],
  "budgetSplit": [
    { "audienceName": "...", "creativeName": "...", "sharePercent": 25 }
  ],
  "utmTemplate": "utm_source=${network}&utm_medium=cpc&utm_campaign=...",
  "conversionEvents": ["events to optimise for"],
  "kpiTargets": {
    "ctr": "Target CTR with reasoning",
    "cpc": "Target CPC range",
    "cpa": "Target CPA",
    "roas": "Target ROAS"
  },
  "optimisationRules": {
    "kill": ["Ad set conditions to pause"],
    "scale": ["Ad set conditions to scale budget"],
    "iterate": ["Ad set conditions to iterate creative"]
  },
  "testingPlan": ["Week-by-week test priorities"],
  "forecastedMetrics": {
    "impressions": "Estimated range",
    "clicks": "Estimated range",
    "conversions": "Estimated range",
    "estimatedSpend": "$X over ${durationDays} days"
  }
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
    console.error('[ELENA] Error:', error);
    return {
      campaignName: `${product} — ${objective}`,
      objective,
      network,
      totalBudgetUsd: totalBudget,
      dailyBudgetUsd: budgetUsdPerDay,
      durationDays,
      biddingStrategy: 'Lowest cost with bid cap',
      audiences: [
        { name: 'Cold — broad interest', type: 'cold', interests: [product], demographics: { ageRange: '25-54', gender: 'all', locations: ['US'] }, behaviours: [], estimatedReachLow: 500000, estimatedReachHigh: 2000000 },
      ],
      creatives: [
        { variantName: 'V1 — Direct offer', headline: product, primaryText: `Try ${product} from ${businessName}.`, description: 'Learn more', callToAction: 'Learn More', visualConcept: 'Hero product shot', hookType: 'aspiration' },
      ],
      budgetSplit: [{ audienceName: 'Cold — broad interest', creativeName: 'V1 — Direct offer', sharePercent: 100 }],
      utmTemplate: `utm_source=${network}&utm_medium=cpc&utm_campaign=${product.toLowerCase().replace(/\s+/g, '-')}`,
      conversionEvents: ['Purchase', 'Lead'],
      kpiTargets: { ctr: '> 1.5%', cpc: '< $1.50', cpa: '< $30', roas: '> 2x' },
      optimisationRules: { kill: ['CTR < 0.5% after $50 spend'], scale: ['ROAS > 3x sustained 3 days'], iterate: ['CTR good but CPA high → swap CTA'] },
      testingPlan: ['Week 1: Test 3 audiences × 3 creatives', 'Week 2: Scale winners'],
      forecastedMetrics: { impressions: 'N/A', clicks: 'N/A', conversions: 'N/A', estimatedSpend: `$${totalBudget}` },
    };
  }
}
