/**
 * Barrel export for all Loraloop AI agents.
 *
 * Import any agent's runner from a single location:
 *   import { runLora, runSophie, runTheo, runElena, runNick } from '@/lib/agents';
 *
 * For agent metadata (name, cost, endpoint, description), import from
 * `@/lib/agents/registry`.
 */

// Content pipeline agents
export { runLora } from './lora';
export type { LoraInput } from './lora';

export { runClara } from './clara';
export type { ClaraInput } from './clara';

export { runSteve } from './steve';
export type { SteveInput } from './steve';

// Autonomous agents
export { runSophie } from './sophie';
export type { SophieInput, SophieOutput } from './sophie';

export { runTheo } from './theo';
export type { TheoInput, TheoOutput, TheoShot, VideoPlatform } from './theo';

export { runElena } from './elena';
export type {
  ElenaInput,
  ElenaOutput,
  ElenaAdCreative,
  ElenaAudience,
  AdNetwork,
  CampaignObjective,
} from './elena';

export { runNick } from './nick';
export type {
  NickInput,
  NickOutput,
  NickContentItem,
  NickInsight,
  NickWinner,
  NickLoser,
  ContentSource,
} from './nick';

// Pipeline coordinator
export { orchestrateContent } from './orchestrator';

// Mission Control autonomous loop (Aura / Echo / Nexus)
export { AgentOrchestrator } from './missionControl';
export type { AgentRole, EventType, AgentEvent } from './missionControl';

// Shared utilities
export { loadBrandContext } from './_loadBrand';
export type { BrandContext } from './_loadBrand';
