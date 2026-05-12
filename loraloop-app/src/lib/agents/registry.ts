/**
 * Single source of truth for every Loraloop AI agent.
 *
 * The UI agent grid, pricing page, and credit accounting all read from this
 * registry. Add a new agent here and it shows up everywhere automatically.
 */

export type AgentCategory =
  | 'research'
  | 'strategy'
  | 'copy'
  | 'visual'
  | 'video'
  | 'seo'
  | 'ads'
  | 'analytics'
  | 'calendar'
  | 'autonomous';

export interface AgentMeta {
  id: string;
  name: string;
  role: string;
  tagline: string;
  category: AgentCategory;
  /** Cost-key used in AGENT_CREDIT_COST (`{agent}_{action}`) */
  costKey: string;
  credits: number;
  endpoint: string;
  docPath: string;
}

export const AGENT_REGISTRY: AgentMeta[] = [
  {
    id: 'sam',
    name: 'Sam',
    role: 'Research Agent',
    tagline: 'Scrapes any website and produces a complete Brand DNA profile.',
    category: 'research',
    costKey: 'sam_research',
    credits: 4,
    endpoint: '/api/extract-dna',
    docPath: 'docs/agents/SAM.md',
  },
  {
    id: 'lora',
    name: 'Lora',
    role: 'CMO / Strategy',
    tagline: 'Plans the angle, tone, and platform adaptation for every post.',
    category: 'strategy',
    costKey: 'lora_strategy',
    credits: 2,
    endpoint: '/api/agents/orchestrate',
    docPath: 'docs/agents/LORA.md',
  },
  {
    id: 'clara',
    name: 'Clara',
    role: 'Copywriter',
    tagline: 'Writes the hook, caption, overlays, and hashtags.',
    category: 'copy',
    costKey: 'clara_content',
    credits: 2,
    endpoint: '/api/agents/orchestrate',
    docPath: 'docs/agents/CLARA.md',
  },
  {
    id: 'steve',
    name: 'Steve',
    role: 'Visual Designer',
    tagline: 'Builds brand-locked image prompts and generates visuals.',
    category: 'visual',
    costKey: 'steve_image',
    credits: 3,
    endpoint: '/api/agents/orchestrate',
    docPath: 'docs/agents/STEVE.md',
  },
  {
    id: 'sophie',
    name: 'Sophie',
    role: 'SEO / GEO Manager',
    tagline: 'Optimises content to rank on Google AND in ChatGPT, Claude, Perplexity.',
    category: 'seo',
    costKey: 'sophie_seo',
    credits: 3,
    endpoint: '/api/agents/sophie',
    docPath: 'docs/agents/SOPHIE.md',
  },
  {
    id: 'theo',
    name: 'Theo',
    role: 'Video Producer',
    tagline: 'Plans and scripts short-form videos for TikTok, Reels, Shorts.',
    category: 'video',
    costKey: 'theo_video',
    credits: 4,
    endpoint: '/api/agents/theo',
    docPath: 'docs/agents/THEO.md',
  },
  {
    id: 'elena',
    name: 'Elena',
    role: 'Ads Manager',
    tagline: 'Runs and scales paid campaigns across Meta, Google, TikTok, LinkedIn.',
    category: 'ads',
    costKey: 'elena_ads',
    credits: 4,
    endpoint: '/api/agents/elena',
    docPath: 'docs/agents/ELENA.md',
  },
  {
    id: 'nick',
    name: 'Nick',
    role: 'Analyst',
    tagline: 'Reports what worked, what didn\'t, and what to do next.',
    category: 'analytics',
    costKey: 'nick_analyze',
    credits: 2,
    endpoint: '/api/agents/nick',
    docPath: 'docs/agents/NICK.md',
  },
  {
    id: 'sarah',
    name: 'Sarah',
    role: 'Content Calendar',
    tagline: 'Schedules posts at the optimal time for each platform.',
    category: 'calendar',
    costKey: 'sarah_calendar',
    credits: 1,
    endpoint: '/api/postiz',
    docPath: 'docs/agents/SARAH.md',
  },
  {
    id: 'aura',
    name: 'Aura',
    role: 'Brand Strategist (autonomous)',
    tagline: 'Continuously checks brand consistency across all active content.',
    category: 'autonomous',
    costKey: 'aura_check',
    credits: 0,
    endpoint: '(simulated via Mission Control)',
    docPath: 'docs/agents/MISSION-CONTROL.md',
  },
  {
    id: 'echo',
    name: 'Echo',
    role: 'Content Creator (autonomous)',
    tagline: 'Generates high-volume content ideas and drafts on a loop.',
    category: 'autonomous',
    costKey: 'echo_ideate',
    credits: 0,
    endpoint: '(simulated via Mission Control)',
    docPath: 'docs/agents/MISSION-CONTROL.md',
  },
  {
    id: 'nexus',
    name: 'Nexus',
    role: 'Ops Manager (autonomous)',
    tagline: 'Syncs the calendar and schedules posts across platforms.',
    category: 'autonomous',
    costKey: 'nexus_schedule',
    credits: 0,
    endpoint: '(simulated via Mission Control)',
    docPath: 'docs/agents/MISSION-CONTROL.md',
  },
];

export function getAgent(id: string): AgentMeta | undefined {
  return AGENT_REGISTRY.find((a) => a.id === id);
}

export function getAgentsByCategory(category: AgentCategory): AgentMeta[] {
  return AGENT_REGISTRY.filter((a) => a.category === category);
}
