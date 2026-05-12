# Mission Control Agents — Autonomous Loop

## Overview
Mission Control runs a separate **always-on autonomous agent loop** independent of the content generation pipeline. Once started, three agents (Aura, Echo, Nexus) cycle continuously, each handling a different layer of the marketing operation.

---

## Agents

### AURA — Brand Strategist
**Role:** Brand consistency enforcer and context analyst

**What she does each cycle:**
1. Analyses the loaded brand DNA for alignment
2. Runs a consistency check across all active content
3. Surfaces core values and flags any off-brand decisions

**Example output:**
> *"Consistency check: 100%. Core values identified: Innovation, Speed, Quality."*

**Emit types:** `THOUGHT` → `RESULT`

---

### ECHO — Content Creator
**Role:** High-volume content ideation and drafting

**What he does each cycle:**
1. Ideates social content ideas for LinkedIn and X simultaneously
2. Drafts a post with a specific angle
3. Bundles the post with suggested visual assets

**Example output:**
> *"Content bundle generated with suggested visual assets."*

**Emit types:** `THOUGHT` → `ACTION` → `SUCCESS`

---

### NEXUS — Ops Manager
**Role:** Cross-platform distribution and scheduling

**What she does each cycle:**
1. Syncs with the Postiz backend
2. Polls optimal engagement windows based on platform data
3. Schedules the post across LinkedIn, X, and Instagram

**Example output:**
> *"Optimal window found: Today at 2:00 PM. Post scheduled to LinkedIn, X, and Instagram."*

**Emit types:** `ACTION` → `RESULT` → `SUCCESS` (or `ERROR` on failure)

---

### SYSTEM
**Role:** Lifecycle manager

Emits start/stop events and signals when each cycle completes.

---

## Event Types

| Type | Meaning |
|---|---|
| `THOUGHT` | Agent is planning / reasoning |
| `ACTION` | Agent is executing a task |
| `RESULT` | Agent received data or completed a check |
| `SUCCESS` | Task completed successfully |
| `ERROR` | Task failed — will retry |

---

## Cycle Timing

| Step | Agent | Duration |
|---|---|---|
| 1 | Aura — brand analysis | ~3s |
| 2 | Echo — ideation | ~4s |
| 3 | Echo — drafting | ~3s |
| 4 | Nexus — scheduling | ~3s |
| Wait | Between cycles | 15s |

Full cycle: ~28 seconds per loop

---

## How to Start / Stop

```typescript
import { AgentOrchestrator } from '@/lib/agent-orchestrator';

const orchestrator = new AgentOrchestrator((event) => {
  console.log(`[${event.agent}] ${event.type}: ${event.message}`);
});

// Start with brand DNA
await orchestrator.startMission(brandDna);

// Stop at any time
orchestrator.stopMission();
```

---

## UI — Mission Control Page
Located at `/mission-control`

The page renders a live **Mission Feed** showing all agent events in real time as they stream in. Events are colour-coded by agent and type.

---

## Architecture Note
Mission Control agents are **simulated** — they emit realistic event streams and demonstrate the autonomous loop pattern. Full integration with real Postiz scheduling is wired through Nexus → Postiz API (`/api/postiz`).
