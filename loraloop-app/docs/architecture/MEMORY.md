# Laraloop Memory Architecture

**Status:** Design RFC
**Author:** Principal AI Systems Architect review
**Last updated:** 2026-05-12

> Goal — make Laraloop **learn from every campaign**. Every hook that
> worked, every ad that flopped, every founder-rejected draft must become
> a durable, queryable signal that flows into the next campaign without
> a human re-explaining context.

---

## 0. Executive summary

**The system we're building**

A 5-layer memory architecture on Supabase + pgvector, with a fact-extraction
pipeline inspired by **Mem0** and a document-ingestion pipeline inspired by
**Supermemory**, accessed through a thin Laraloop-owned SDK (`@/lib/memory`).
Memory is partitioned by `workspace_id` and tagged with `agent_scope` so each
of the 12 agents reads its own slice and a shared "institutional" slice.

**The headline decisions**

| Question | Decision | Why |
|---|---|---|
| Use Mem0 directly? | **No — adopt its pattern, not its SaaS** | LiteLLM dep, vendor lock-in, can't use Gemini router cleanly, RLS doesn't carry through |
| Use Supermemory directly? | **No — adopt its pattern, not its CF stack** | Cloudflare-native; we're Supabase + Vercel. Worth borrowing the ingestion/MCP architecture |
| New database? | **No — extend Supabase** | pgvector already runs; one query plane; RLS gives free multi-tenancy |
| Vector index? | **HNSW on pgvector** | Best recall/latency trade-off below ~10M rows |
| Embedding model? | **Gemini `text-embedding-004`** (768-dim) | Already in stack; multi-lingual; free tier generous |
| Hybrid search? | **pgvector + Postgres `tsvector` BM25 + cross-encoder rerank** | Pure semantic loses on entity names ("Stripe", "Klaviyo") |
| Orchestration? | **LangGraph (TypeScript) + Supabase Realtime events** | Stateful graph + event log; works with Next.js |
| Fact extraction? | **Background worker invoked after each agent run** | Don't block the user-facing path |
| Memory mutation rules? | **Mem0-style ADD / UPDATE / DELETE / NOOP via LLM-judge** | Otherwise memory grows unboundedly and contradicts itself |

**The moat this builds**

Generic AI tools forget the customer the moment a session ends. Laraloop
will accumulate **institutional marketing intelligence** per workspace —
the longer a customer stays, the better the agents perform, and the more
expensive it gets to switch off the platform. That's the lock-in.

---

## 1. Repository analysis — Mem0 & Supermemory

### 1.1 Mem0 (`mem0ai/mem0`)

**What it is.** A memory layer for AI agents. Takes raw conversation
transcripts, extracts atomic *memories* (facts) using an LLM, reconciles
them against existing memories (ADD / UPDATE / DELETE / NOOP), and stores
them in a vector store + optional graph database.

**Architecture (as of 2025):**

```
[Conversation messages]
        │
        ▼
[Fact extraction LLM]            ← "What facts does this contain?"
        │
        ▼
[Existing memory recall]         ← top-k similar memories
        │
        ▼
[Memory reconciliation LLM]      ← merge / replace / discard?
        │
        ▼
[Vector store + Graph store]     ← Qdrant default; Neo4j optional
```

**Strengths**
- The **reconciliation LLM** step is the killer idea. Without it, memory
  systems decay into thousands of duplicate / contradictory entries.
- Works at the **fact level**, not document level. Tiny units = precise recall.
- Graph layer captures **entity relationships** that pure vector search misses.
- Multi-level scopes: user / session / agent.
- Solid claim of ~30% recall lift on LongMemEval vs raw vector RAG.

**Weaknesses for Laraloop**
- Built on LiteLLM — clashes with our **Gemini multi-model router**.
- Managed service is a hard vendor lock-in; self-hosting requires Qdrant
  *and* Neo4j *and* an LLM provider — three new dependencies.
- Python-first; the JS SDK lags features.
- No native multi-tenancy beyond `user_id`. Our `workspace_id` /
  `agent_scope` matrix is more complex.
- No RLS — security is enforced at the application layer; doesn't compose
  with Supabase's policy model.

**Verdict:** Steal the **fact-extraction + reconciliation pipeline**.
Re-implement against pgvector. Don't ship the dependency.

---

### 1.2 Supermemory (`supermemoryai/supermemory`)

**What it is.** A universal document memory layer. Built for the
Cloudflare stack (Workers, D1, Vectorize, R2). Ingests web pages, PDFs,
Notion, tweets via a Chrome extension or API; chunks them; embeds them;
exposes them via API + **MCP server**.

**Architecture (as of 2025):**

```
[Source: web / PDF / Notion / tweet]
        │
        ▼
[Ingestion worker — extract + clean + chunk]
        │
        ▼
[Cloudflare Vectorize embeddings]
        │
        ▼
[D1 metadata + R2 raw blob]
        │
        ▼
[API / MCP server / SDK]         ← what the agent sees
```

**Strengths**
- **Connector ecosystem** (Google Drive, Notion, OneDrive, Twitter) — we
  can borrow the shape, especially for ingesting **competitor sites,
  customer Notion docs, analytics CSV dumps.**
- **MCP server** out of the box → any MCP-aware agent can query memory.
  Excellent forward bet given the direction of AI tooling.
- Edge-native; sub-50ms retrieval globally.
- Hierarchical chunking: large doc → semantic chunks → re-rankable.

**Weaknesses for Laraloop**
- Cloudflare-locked. Our stack is Supabase + Vercel. Migrating to CF for
  this alone would dominate the engineering budget.
- D1 is SQLite — not enough for our analytics joins.
- Document-centric. We *also* need behavioural memory (Mem0's domain).
- Multi-tenant story is thinner than Mem0's.

**Verdict:** Steal the **document ingestion pipeline + chunking strategy
+ MCP-server surface**. Re-implement against our stack.

---

### 1.3 Side-by-side

| Capability | Mem0 | Supermemory | Laraloop wants |
|---|---|---|---|
| Atomic fact extraction | ✅ | ❌ | ✅ |
| Reconciliation LLM (UPDATE/DELETE) | ✅ | ❌ | ✅ |
| Document chunking | basic | ✅ | ✅ |
| Connectors (Notion, Drive) | partial | ✅ | ✅ |
| MCP server | ❌ | ✅ | ✅ (for autonomous agents) |
| Graph relationships | ✅ (Neo4j) | ❌ | partial — Postgres can fake it |
| Multi-tenancy | weak | weak | strong — workspace + agent_scope |
| RLS / row-level security | ❌ | ❌ | ✅ (free via Supabase) |
| Temporal decay | partial | ❌ | ✅ |
| Native to our stack | ❌ | ❌ | n/a |

**They are complementary, not competitive.** Mem0 owns the
"what-the-customer-said" memory. Supermemory owns the
"what-the-customer-uploaded" memory. Laraloop needs both, plus a third
neither addresses well: **what-the-agent-learned-from-performance-data**.

---

## 2. The Laraloop memory model

Five distinct memory layers. Each has its own write semantics, decay
policy, scope, and retrieval pattern. They share the same physical store
(pgvector) but are partitioned by `layer` enum and `workspace_id`.

### 2.1 Brand memory

**What it is.** The crystallised brand DNA: tone of voice, positioning,
visual identity, messaging rules, banned phrases, approved phrases.

| Property | Value |
|---|---|
| Granularity | One memory per attribute (e.g. "uses Oxford comma: yes") |
| Write trigger | Sam's DNA extraction, founder edits, Aura corrections |
| Decay | Never — only superseded by explicit founder edit |
| Scope | `workspace_id` (shared across all agents) |
| Consumers | Sophie, Clara, Steve, Theo |
| Volume | ~50–200 facts per workspace |

### 2.2 Campaign memory

**What it is.** Every launch, every creative, every metric — with the
contextual story of what we believed when we shipped it.

| Property | Value |
|---|---|
| Granularity | One memory per campaign + per ad variant |
| Write trigger | Elena launches campaign, Nick analyses results |
| Decay | After 18 months, embeddings stay but retrieval weight drops |
| Scope | `workspace_id` |
| Consumers | Elena, Nick, Sam, Lora |
| Volume | 100s–1000s per workspace per year |

### 2.3 Strategic memory

**What it is.** The high-level company narrative — ICP, competitor map,
quarterly goals, market positioning, SEO/GEO trends. Founder-curated.

| Property | Value |
|---|---|
| Granularity | One memory per strategic claim with provenance |
| Write trigger | Lora's strategy runs, founder Q&A, Sam's research |
| Decay | None; explicit versioning with timestamps |
| Scope | `workspace_id` |
| Consumers | Lora, Sam (read-heavy), all others (low-priority context) |
| Volume | 50–500 per workspace |

### 2.4 User preference memory

**What it is.** Founder preferences inferred from approvals, rejections,
edits, and direct feedback. The "house style" that no brand guide
captures.

| Property | Value |
|---|---|
| Granularity | One memory per inferred preference |
| Write trigger | Every founder approve/reject/edit action |
| Decay | Reinforcement-weighted — overridden by 3+ contrary actions |
| Scope | `workspace_id` + `user_id` |
| Consumers | All agents |
| Volume | 100s per workspace |

### 2.5 Reflection memory

**What it is.** The "post-mortem" layer. Why did this campaign work? Why
did this hook fail? What pattern repeats across our wins? Inspired by
Mem0's agent-memory concept + Reflexion.

| Property | Value |
|---|---|
| Granularity | One memory per reflection event |
| Write trigger | Nick's analysis runs, weekly Lora retros |
| Decay | None — these are the most valuable memories |
| Scope | `workspace_id` (some shared globally for institutional learning, opt-in) |
| Consumers | Lora, Nick (write); all agents (read) |
| Volume | 20–50 per workspace per month |

---

## 3. Database schema (Supabase / Postgres)

Single source of truth. Every memory layer = one row shape, partitioned
by enum + indexed for hybrid search.

```sql
-- ── Extensions ────────────────────────────────────────────────
create extension if not exists vector;
create extension if not exists pg_trgm;

-- ── Enums ─────────────────────────────────────────────────────
create type memory_layer as enum (
  'brand', 'campaign', 'strategic', 'preference', 'reflection'
);
create type memory_event as enum (
  'add', 'update', 'delete', 'noop'
);

-- ── Core: atomic memory facts (Mem0-style) ────────────────────
create table memories (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  user_id         uuid,
  layer           memory_layer not null,
  agent_scope     text,                          -- 'shared' | 'lora' | 'elena' | ...
  content         text not null,                 -- the fact, in natural language
  source_type     text,                          -- 'conversation' | 'campaign-run' | 'document' | 'founder-edit'
  source_id       uuid,                          -- FK to the originating event
  metadata        jsonb default '{}'::jsonb,     -- arbitrary structured payload
  embedding       vector(768),                   -- Gemini text-embedding-004
  importance      smallint default 5,            -- 1-10; affects ranking
  confidence      real default 1.0,              -- 0-1; Mem0-style
  expires_at      timestamptz,                   -- nullable = permanent
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  superseded_by   uuid references memories(id),  -- update chain
  tsv             tsvector generated always as (to_tsvector('english', content)) stored
);

-- ── Document memory (Supermemory-style — chunked source material) ──
create table memory_documents (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  title           text not null,
  source_url      text,
  source_type     text,                          -- 'web' | 'pdf' | 'notion' | 'analytics-csv'
  raw_uri         text,                          -- R2 / Supabase Storage key
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz default now()
);

create table memory_chunks (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references memory_documents(id) on delete cascade,
  workspace_id    uuid not null,
  chunk_index     int not null,
  parent_chunk_id uuid references memory_chunks(id),  -- hierarchical chunking
  content         text not null,
  embedding       vector(768),
  metadata        jsonb default '{}'::jsonb,
  tsv             tsvector generated always as (to_tsvector('english', content)) stored,
  created_at      timestamptz default now()
);

-- ── Entity graph (Mem0-style relationships, on Postgres) ──────
create table memory_entities (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  name            text not null,
  kind            text,                          -- 'competitor' | 'channel' | 'audience-segment' | 'campaign'
  metadata        jsonb default '{}'::jsonb,
  unique (workspace_id, name, kind)
);

create table memory_relations (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  subject_id      uuid not null references memory_entities(id) on delete cascade,
  predicate       text not null,                 -- 'outperforms' | 'targets' | 'rejects'
  object_id       uuid not null references memory_entities(id) on delete cascade,
  evidence_memory_id uuid references memories(id),
  weight          real default 1.0,
  created_at      timestamptz default now()
);

-- ── Event log (every memory mutation, for audit + reflection) ──
create table memory_events (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  memory_id       uuid references memories(id),
  agent           text,                          -- which agent wrote
  event           memory_event not null,
  delta           jsonb,                         -- before/after diff
  created_at      timestamptz default now()
);

-- ── Indexes ───────────────────────────────────────────────────
create index memories_workspace_layer_idx     on memories (workspace_id, layer) where superseded_by is null;
create index memories_agent_scope_idx         on memories (workspace_id, agent_scope) where superseded_by is null;
create index memories_embedding_hnsw          on memories using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);
create index memories_tsv_gin                 on memories using gin (tsv);
create index memories_metadata_gin            on memories using gin (metadata jsonb_path_ops);
create index memory_chunks_embedding_hnsw     on memory_chunks using hnsw (embedding vector_cosine_ops);
create index memory_chunks_tsv_gin            on memory_chunks using gin (tsv);
create index memory_entities_workspace_idx    on memory_entities (workspace_id, name);
create index memory_events_workspace_idx      on memory_events (workspace_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────
alter table memories            enable row level security;
alter table memory_documents    enable row level security;
alter table memory_chunks       enable row level security;
alter table memory_entities     enable row level security;
alter table memory_relations    enable row level security;
alter table memory_events       enable row level security;

create policy "workspace-isolation"
  on memories for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));
-- (Repeat the policy for every memory_* table; the shape is identical.)
```

**Why this shape**

- One row per atomic fact = composable. Lora can pull 12 facts and stitch
  a paragraph; Elena can pull 3 facts and pick a CTA.
- `agent_scope` lets us answer "what does Elena know that Sophie
  doesn't?" without joins.
- `superseded_by` is a linked list of updates → preserves audit history
  while letting queries ignore stale rows.
- `tsv` generated column = no separate full-text pipeline.
- HNSW over IVFFlat — better recall at our scale (< 10M rows per
  workspace).
- RLS is the *only* thing standing between workspace A's data and
  workspace B's agents. Don't skip it.

---

## 4. Retrieval pipeline (hybrid search)

```
[Agent issues query]
        │
        ▼
[Plan retrieval: which layers? which scopes? time window?]
        │
        ▼
┌────────────────────────────┬───────────────────────────┐
│  Vector ANN (pgvector)     │  BM25 (tsvector)          │
│  → top 50 candidates       │  → top 50 candidates       │
└──────────────┬─────────────┴────────────┬──────────────┘
               │ Reciprocal-rank fusion   │
               ▼                          │
        [Candidate set ≈ 60]              │
               │                          │
               ▼                          │
        [Metadata filter:                 │
         layer / agent_scope /            │
         time window / importance]        │
               │                          │
               ▼                          │
        [Cross-encoder rerank             │
         (Cohere rerank-3 or Gemini       │
         re-ranking prompt)]              │
               │                          │
               ▼                          │
        [Top 5-10 memories]               │
               │                          │
               ▼                          │
        [Inject into agent prompt]        │
```

**When agents retrieve**

| Agent | Trigger | Layers it pulls |
|---|---|---|
| Lora | Start of every strategy run | strategic + reflection + recent campaign |
| Sam | DNA extract / competitor research | brand + strategic + documents |
| Sophie | Every SEO brief | brand + strategic + reflection (SEO-tagged) |
| Clara | Every copy run | brand + preference + reflection (copy-tagged) |
| Steve | Every visual brief | brand + preference |
| Theo | Every video plan | brand + preference + campaign (video-tagged) |
| Sarah | Calendar planning | campaign (timing patterns) + preference |
| Elena | Campaign build | campaign + reflection + strategic |
| Nick | Performance analysis | campaign + reflection (read & write) |

**Latency budget**

| Step | Budget | How |
|---|---|---|
| Query embedding | 80ms | Gemini embedding API (cached for hot queries) |
| pgvector ANN | 30ms | HNSW with `ef_search=40` |
| tsvector BM25 | 20ms | GIN index |
| Filter + RRF | 10ms | In-Postgres CTE |
| Cross-encoder rerank | 200ms | Cohere rerank, can fall back to LLM rerank if budget allows |
| **Total p95** | **< 350ms** | Acceptable for non-streaming agents; pre-fetch for streaming |

**Caching**
- Query embeddings: keyed by SHA(text), 24h TTL in Redis (or Supabase
  KV during MVP).
- Hot memories per agent per workspace: pre-warmed every 15 min.
- Cross-encoder results cached per (query_hash, candidate_set_hash) for 1h.

---

## 5. Multi-agent orchestration

### 5.1 The campaign loop

This is the unit Laraloop optimises. Every memory write happens inside a
loop iteration; every retrieval reads the loop's context.

```
                       ┌────────────────────┐
                       │  Founder kicks off │
                       │  "launch X"        │
                       └─────────┬──────────┘
                                 ▼
            ┌─────────────────────────────────────────┐
            │  LORA — pulls strategic + reflection    │
            │         memory; writes strategy doc     │
            │         + emits CAMPAIGN_INTENT event   │
            └─────────────────┬───────────────────────┘
                              ▼
            ┌──────────────────────────────────────────┐
            │  SAM — competitor + SEO retrieval        │
            │        writes new strategic facts        │
            └─────────────────┬────────────────────────┘
                              ▼
        ┌──────────┬──────────┴──────────┬──────────┐
        ▼          ▼                     ▼          ▼
    ┌────────┐ ┌────────┐           ┌────────┐ ┌────────┐
    │ SOPHIE │ │ CLARA  │   read    │ STEVE  │ │ THEO   │
    │ (SEO)  │ │ (copy) │  brand +  │ (img)  │ │(video) │
    │        │ │        │   pref    │        │ │        │
    └────────┘ └────────┘           └────────┘ └────────┘
                              ▼
            ┌──────────────────────────────────────────┐
            │  SARAH — schedules; writes timing facts  │
            └─────────────────┬────────────────────────┘
                              ▼
            ┌──────────────────────────────────────────┐
            │  ELENA — builds paid; writes ad memory   │
            └─────────────────┬────────────────────────┘
                              ▼
              [   CAMPAIGN LIVE — metrics flow back   ]
                              ▼
            ┌──────────────────────────────────────────┐
            │  NICK — diff vs prior campaigns;         │
            │         writes reflection memories       │
            └─────────────────┬────────────────────────┘
                              ▼
            ┌──────────────────────────────────────────┐
            │  LORA — updates strategic memory based   │
            │         on Nick's reflections (the loop  │
            │         closes here)                     │
            └──────────────────────────────────────────┘
```

### 5.2 Event bus

Memory state is event-sourced. Every mutation emits a `memory_event`.
Other agents subscribe via Supabase Realtime (Phase 1) or NATS (Phase 3).

```
memory_event {
  workspace_id, memory_id, event: add|update|delete|noop,
  agent: "elena", delta: {...}, ts
}
```

Subscribers:
- **Aura** listens to *all* events for brand-consistency checks.
- **Nick** listens to `campaign` layer events for performance flagging.
- **Lora** listens to `reflection` writes to trigger strategy updates.

### 5.3 LangGraph for stateful orchestration

The campaign loop is too complex for fire-and-forget API calls. We model
it as a LangGraph state machine (TypeScript) — each node is one agent,
edges encode "Lora done → fan out to Sophie/Clara/Steve/Theo in
parallel". Memory writes are side-effects from nodes; the graph state
itself is short-lived (one campaign run).

### 5.4 Conflict resolution

Two agents writing contradictory facts:

```
Elena (today, confidence 0.9): "TikTok ROAS 2.1x"
Nick  (next week, confidence 1.0): "TikTok ROAS 1.4x after attribution fix"
```

Reconciliation LLM judges → UPDATE Elena's fact with Nick's (higher
confidence + later timestamp + provenance from attribution).

If neither dominates → keep both; surface conflict to the founder via the
mission feed.

---

## 6. Infrastructure plan

### 6.1 Phase 1 — MVP (this quarter)

| Component | Tech |
|---|---|
| Memory store | Supabase Postgres + pgvector |
| Embeddings | Gemini `text-embedding-004` (768-dim) |
| Full-text | Postgres `tsvector` |
| Reranker | Cohere `rerank-3-multilingual` (free tier covers thousands/day) |
| Event bus | Supabase Realtime |
| Orchestration | LangGraph in Next.js route handlers (`/api/agents/run-campaign`) |
| Fact-extraction worker | Vercel cron + Supabase queue table |
| Document ingestion | Supabase Storage for raw, chunker as Vercel function |
| Auth / RLS | Supabase Auth + RLS policies |

**Goal:** prove the loop end-to-end on one workspace before scaling.

### 6.2 Phase 2 — Production scale (Q3-Q4)

| Add | Why |
|---|---|
| Redis (Upstash) | Embedding + rerank cache; rate-limit token buckets |
| pgvector partitioning by `workspace_id` | Larger workspaces / multi-tenant scale |
| Dedicated worker (Cloudflare Workers or Railway) | Long-running reconciliation jobs |
| Cross-encoder hosted (BGE-reranker-base on Modal) | Cohere cost rises; self-hosting is 10x cheaper at scale |
| MCP server | `@laraloop/mcp-memory` so Claude / ChatGPT / IDE agents query memory directly |
| Memory snapshots → R2 | Cheap cold storage for >18mo memories |

### 6.3 Phase 3 — Autonomous (next year)

| Add | Why |
|---|---|
| Neo4j (or AGE on Postgres) | When entity-graph queries dominate workload |
| NATS or Kafka | When event volume exceeds Realtime sustained limits (~1k/sec) |
| Cross-workspace anonymised institutional memory | The biggest moat — Laraloop learns from *every* customer's wins, opt-in |
| Online learning loop | Memory weights tuned by gradient signal from campaign outcomes |
| Tool-use memory | Agents memorise which tool calls succeeded for which intents |

---

## 7. Code — TypeScript skeleton

A minimal, production-shaped SDK that the agents will import as
`@/lib/memory`. The full module split:

```
src/lib/memory/
├── index.ts              ← public surface
├── types.ts              ← MemoryRecord, RetrievalQuery, etc.
├── embed.ts              ← Gemini embedding wrapper + cache
├── store.ts              ← raw Supabase CRUD
├── reconcile.ts          ← Mem0-style ADD/UPDATE/DELETE LLM judge
├── retrieve.ts           ← hybrid search + rerank
├── extract.ts            ← fact extraction from conversations / outputs
├── ingest.ts             ← document ingestion + chunking (Supermemory pattern)
├── events.ts             ← Supabase Realtime pub/sub
└── orchestrate.ts        ← LangGraph campaign loop
```

### 7.1 `types.ts`

```typescript
export type MemoryLayer =
  | 'brand'
  | 'campaign'
  | 'strategic'
  | 'preference'
  | 'reflection';

export type AgentScope =
  | 'shared'
  | 'lora' | 'sam'   | 'sophie' | 'clara'
  | 'steve'| 'theo'  | 'sarah'  | 'elena' | 'nick';

export interface MemoryRecord {
  id: string;
  workspaceId: string;
  userId?: string;
  layer: MemoryLayer;
  agentScope: AgentScope;
  content: string;
  metadata: Record<string, unknown>;
  importance: number;          // 1-10
  confidence: number;          // 0-1
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RetrievalQuery {
  workspaceId: string;
  query: string;
  layers?: MemoryLayer[];
  agentScopes?: AgentScope[];
  limit?: number;              // default 8
  minImportance?: number;
  timeWindowDays?: number;     // null = all time
}

export interface RetrievalResult {
  memory: MemoryRecord;
  score: number;
  source: 'vector' | 'bm25' | 'fusion';
}
```

### 7.2 `embed.ts`

```typescript
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const cache = new Map<string, number[]>();   // swap for Redis in Phase 2

export async function embed(text: string): Promise<number[]> {
  const key = crypto.createHash('sha256').update(text).digest('hex');
  const hit = cache.get(key);
  if (hit) return hit;

  const res = await genAI.models.embedContent({
    model: 'text-embedding-004',
    contents: [{ role: 'user', parts: [{ text }] }],
  });
  const vec = res.embeddings?.[0]?.values ?? [];
  cache.set(key, vec);
  return vec;
}
```

### 7.3 `store.ts`

```typescript
import { getServiceSupabase } from '@/lib/supabase';
import type { MemoryRecord } from './types';
import { embed } from './embed';

export async function upsertMemory(
  partial: Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<MemoryRecord> {
  const db = getServiceSupabase();
  const embedding = await embed(partial.content);

  const { data, error } = await db
    .from('memories')
    .upsert({
      id:           partial.id,
      workspace_id: partial.workspaceId,
      user_id:      partial.userId,
      layer:        partial.layer,
      agent_scope:  partial.agentScope,
      content:      partial.content,
      metadata:     partial.metadata,
      importance:   partial.importance,
      confidence:   partial.confidence,
      expires_at:   partial.expiresAt,
      embedding,
    })
    .select()
    .single();

  if (error) throw error;
  return mapRow(data);
}

export async function supersede(oldId: string, newId: string): Promise<void> {
  const db = getServiceSupabase();
  await db.from('memories').update({ superseded_by: newId }).eq('id', oldId);
}

// (mapRow omitted for brevity — maps snake_case → camelCase)
```

### 7.4 `retrieve.ts` — hybrid retrieval

```typescript
import { getServiceSupabase } from '@/lib/supabase';
import { embed } from './embed';
import type { RetrievalQuery, RetrievalResult } from './types';
import { rerank } from './rerank';

export async function retrieve(q: RetrievalQuery): Promise<RetrievalResult[]> {
  const db = getServiceSupabase();
  const queryEmbedding = await embed(q.query);
  const limit = q.limit ?? 8;
  const candidates = 50;

  // Single Postgres CTE that runs vector + BM25 + RRF in one round trip
  const { data, error } = await db.rpc('memories_hybrid_search', {
    workspace_id_in:  q.workspaceId,
    query_text:       q.query,
    query_embedding:  queryEmbedding,
    layers_in:        q.layers ?? null,
    scopes_in:        q.agentScopes ?? null,
    min_importance:   q.minImportance ?? 1,
    time_window_days: q.timeWindowDays ?? null,
    candidate_n:      candidates,
  });

  if (error) throw error;
  const fused = (data ?? []) as RetrievalResult[];

  // Cross-encoder rerank — top-N before LLM context injection
  const reranked = await rerank(q.query, fused, limit);
  return reranked;
}
```

```sql
-- The RPC the function above calls
create or replace function memories_hybrid_search(
  workspace_id_in   uuid,
  query_text        text,
  query_embedding   vector(768),
  layers_in         memory_layer[],
  scopes_in         text[],
  min_importance    int,
  time_window_days  int,
  candidate_n       int
) returns table (
  id uuid, content text, metadata jsonb, layer memory_layer,
  agent_scope text, importance int, confidence real, created_at timestamptz,
  score real, source text
)
language sql stable
as $$
  with vec as (
    select
      m.*,
      1 - (m.embedding <=> query_embedding) as vscore,
      'vector'::text as src
    from memories m
    where m.workspace_id = workspace_id_in
      and m.superseded_by is null
      and m.importance >= min_importance
      and (layers_in is null or m.layer = any(layers_in))
      and (scopes_in is null or m.agent_scope = any(scopes_in))
      and (time_window_days is null
           or m.created_at >= now() - (time_window_days || ' days')::interval)
    order by m.embedding <=> query_embedding
    limit candidate_n
  ),
  bm as (
    select
      m.*,
      ts_rank(m.tsv, plainto_tsquery('english', query_text)) as vscore,
      'bm25'::text as src
    from memories m
    where m.workspace_id = workspace_id_in
      and m.superseded_by is null
      and m.tsv @@ plainto_tsquery('english', query_text)
    order by vscore desc
    limit candidate_n
  ),
  fused as (
    select * from vec
    union all
    select * from bm
  ),
  ranked as (
    select
      id, content, metadata, layer, agent_scope, importance, confidence, created_at,
      max(vscore) as score,
      string_agg(distinct src, '+') as source
    from fused
    group by id, content, metadata, layer, agent_scope, importance, confidence, created_at
  )
  select * from ranked
  order by score desc
  limit candidate_n;
$$;
```

### 7.5 `reconcile.ts` — Mem0-style memory mutation

```typescript
import { callGemini } from '@/lib/gemini';
import { retrieve } from './retrieve';
import { upsertMemory, supersede } from './store';
import type { MemoryLayer, AgentScope } from './types';

interface ReconcileInput {
  workspaceId: string;
  agentScope: AgentScope;
  layer: MemoryLayer;
  candidateFact: string;
  metadata?: Record<string, unknown>;
}

interface ReconcileDecision {
  action: 'add' | 'update' | 'delete' | 'noop';
  targetId?: string;
  mergedContent?: string;
  reason: string;
}

export async function reconcileFact(input: ReconcileInput): Promise<void> {
  // 1. Recall the closest existing memories in this layer + scope.
  const neighbours = await retrieve({
    workspaceId:  input.workspaceId,
    query:        input.candidateFact,
    layers:       [input.layer],
    agentScopes:  [input.agentScope, 'shared'],
    limit:        5,
  });

  // 2. Ask the model to decide: ADD / UPDATE / DELETE / NOOP.
  const decision = await llmJudge(input.candidateFact, neighbours.map((n) => n.memory));

  // 3. Apply the mutation.
  switch (decision.action) {
    case 'add':
      await upsertMemory({
        workspaceId: input.workspaceId,
        layer:       input.layer,
        agentScope:  input.agentScope,
        content:     decision.mergedContent ?? input.candidateFact,
        metadata:    input.metadata ?? {},
        importance:  5,
        confidence:  1.0,
      });
      break;

    case 'update': {
      const updated = await upsertMemory({
        workspaceId: input.workspaceId,
        layer:       input.layer,
        agentScope:  input.agentScope,
        content:     decision.mergedContent ?? input.candidateFact,
        metadata:    input.metadata ?? {},
        importance:  5,
        confidence:  1.0,
      });
      if (decision.targetId) await supersede(decision.targetId, updated.id);
      break;
    }

    case 'delete':
      if (decision.targetId) {
        await supersede(decision.targetId, decision.targetId); // tombstone
      }
      break;

    case 'noop':
      // The fact added no information; drop silently.
      break;
  }
}

async function llmJudge(
  candidate: string,
  existing: Array<{ id: string; content: string }>,
): Promise<ReconcileDecision> {
  const prompt = `You are a memory reconciliation judge for a marketing AI system.

CANDIDATE FACT TO INTEGRATE:
"${candidate}"

EXISTING MEMORIES IN THIS LAYER:
${existing.map((m, i) => `[${i}] (id=${m.id}) ${m.content}`).join('\n')}

Decide one of:
- ADD: candidate adds new info, no overlap → return action="add"
- UPDATE: candidate refines / corrects an existing memory → return action="update", targetId=<id>, mergedContent=<merged fact>
- DELETE: candidate negates an existing memory → return action="delete", targetId=<id>
- NOOP: candidate is already represented → return action="noop"

Return STRICT JSON: { "action": "...", "targetId": "...", "mergedContent": "...", "reason": "..." }`;

  const res = await callGemini({
    taskType:  'social-strategy',
    prompt,
    mimeType:  'application/json',
    minLength: 30,
  });
  return JSON.parse(res.text) as ReconcileDecision;
}
```

### 7.6 `extract.ts` — fact extraction from agent runs

```typescript
import { callGemini } from '@/lib/gemini';
import { reconcileFact } from './reconcile';
import type { AgentScope, MemoryLayer } from './types';

export async function extractAndStoreFacts(opts: {
  workspaceId: string;
  agentScope:  AgentScope;
  layer:       MemoryLayer;
  raw:         string;          // agent output, conversation transcript, etc.
  metadata?:   Record<string, unknown>;
}): Promise<number> {
  const prompt = `Extract atomic, durable facts from the text below.

A "fact" is one self-contained statement that would still be true and useful
to a marketing AI six months from now. Skip ephemeral details.

TEXT:
${opts.raw.slice(0, 12000)}

Return STRICT JSON: { "facts": ["fact 1", "fact 2", ...] }`;

  const res  = await callGemini({ taskType: 'social-strategy', prompt, mimeType: 'application/json', minLength: 20 });
  const { facts } = JSON.parse(res.text) as { facts: string[] };

  await Promise.all(
    facts.map((f) => reconcileFact({
      workspaceId:    opts.workspaceId,
      agentScope:     opts.agentScope,
      layer:          opts.layer,
      candidateFact:  f,
      metadata:       opts.metadata,
    })),
  );

  return facts.length;
}
```

### 7.7 `ingest.ts` — document ingestion (Supermemory pattern)

```typescript
import { getServiceSupabase } from '@/lib/supabase';
import { embed } from './embed';

// Hierarchical chunking — coarse parent chunks + fine child chunks
export async function ingestDocument(opts: {
  workspaceId:  string;
  title:        string;
  sourceUrl?:   string;
  sourceType:   'web' | 'pdf' | 'notion' | 'analytics-csv';
  rawText:      string;
  metadata?:    Record<string, unknown>;
}): Promise<{ documentId: string; chunkCount: number }> {
  const db = getServiceSupabase();

  // 1. Persist the document row.
  const { data: doc } = await db.from('memory_documents').insert({
    workspace_id: opts.workspaceId,
    title:        opts.title,
    source_url:   opts.sourceUrl,
    source_type:  opts.sourceType,
    metadata:     opts.metadata ?? {},
  }).select().single();

  // 2. Hierarchical chunk: 2000 char parents, 400 char children.
  const parents = chunk(opts.rawText, 2000, 200);
  let total = 0;

  for (const parent of parents) {
    const { data: parentRow } = await db.from('memory_chunks').insert({
      workspace_id: opts.workspaceId,
      document_id:  doc!.id,
      chunk_index:  total++,
      content:      parent,
      embedding:    await embed(parent),
    }).select().single();

    const children = chunk(parent, 400, 50);
    for (const child of children) {
      await db.from('memory_chunks').insert({
        workspace_id:    opts.workspaceId,
        document_id:     doc!.id,
        chunk_index:     total++,
        parent_chunk_id: parentRow!.id,
        content:         child,
        embedding:       await embed(child),
      });
    }
  }

  return { documentId: doc!.id, chunkCount: total };
}

function chunk(text: string, size: number, overlap: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return out;
}
```

### 7.8 `orchestrate.ts` — LangGraph campaign loop

```typescript
import { StateGraph, END } from '@langchain/langgraph';
import { retrieve } from './retrieve';
import { extractAndStoreFacts } from './extract';
import { runLora, runClara, runSteve, runSophie, runTheo, runElena, runNick }
  from '@/lib/agents';

interface CampaignState {
  workspaceId: string;
  goal:        string;
  strategy?:   unknown;
  copy?:       unknown;
  visuals?:    unknown;
  ads?:        unknown;
  metrics?:    unknown;
  reflections?: unknown;
}

const graph = new StateGraph<CampaignState>({
  channels: {
    workspaceId: null, goal: null,
    strategy: null, copy: null, visuals: null, ads: null,
    metrics: null, reflections: null,
  } as never,
})
  // Strategy
  .addNode('lora', async (s) => {
    const ctx = await retrieve({
      workspaceId: s.workspaceId, query: s.goal,
      layers: ['strategic', 'reflection'], limit: 10,
    });
    const strategy = await runLora({ goal: s.goal, /* ... */ } as never);
    await extractAndStoreFacts({
      workspaceId: s.workspaceId, agentScope: 'lora', layer: 'strategic',
      raw: JSON.stringify(strategy),
    });
    return { strategy };
  })
  // Content fan-out (Sophie, Clara, Steve, Theo run in parallel via the graph runtime)
  .addNode('sophie', async (s) => ({ /* runSophie with retrieved brand+strategic */ }))
  .addNode('clara',  async (s) => ({ /* runClara  with retrieved brand+preference */ }))
  .addNode('steve',  async (s) => ({ /* runSteve  with retrieved brand+preference */ }))
  .addNode('theo',   async (s) => ({ /* runTheo   with retrieved brand+preference */ }))
  // Launch
  .addNode('elena',  async (s) => ({ /* runElena with retrieved campaign+strategic */ }))
  // Analyse
  .addNode('nick', async (s) => {
    const metrics = await loadCampaignMetrics(s.workspaceId);
    const reflections = await runNick({ /* ... */ } as never);
    await extractAndStoreFacts({
      workspaceId: s.workspaceId, agentScope: 'nick', layer: 'reflection',
      raw: JSON.stringify(reflections),
    });
    return { metrics, reflections };
  })
  .addEdge('lora',   'sophie')
  .addEdge('lora',   'clara')
  .addEdge('lora',   'steve')
  .addEdge('lora',   'theo')
  .addEdge('sophie', 'elena')
  .addEdge('clara',  'elena')
  .addEdge('steve',  'elena')
  .addEdge('theo',   'elena')
  .addEdge('elena',  'nick')
  .addEdge('nick',   END)
  .setEntryPoint('lora');

export const campaignGraph = graph.compile();

async function loadCampaignMetrics(_workspaceId: string) { /* TODO */ }
```

---

## 8. Final recommendation

### 8.1 What to adopt from Mem0

| Pattern | Use? | Notes |
|---|---|---|
| Atomic fact extraction | **Yes** | Core of `extract.ts` |
| LLM reconciliation (ADD/UPDATE/DELETE/NOOP) | **Yes** | Core of `reconcile.ts` — this is the moat against memory rot |
| Multi-level scope (user/session/agent) | **Yes** | We extend with `workspace_id` + `agent_scope` |
| Graph layer (Neo4j) | **Phase 3 only** | Postgres `memory_entities` + `memory_relations` covers Phase 1–2 |
| LiteLLM dependency | **No** | Conflicts with our Gemini router |
| Mem0 SaaS | **No** | Lock-in + no RLS |

### 8.2 What to adopt from Supermemory

| Pattern | Use? | Notes |
|---|---|---|
| Hierarchical chunking | **Yes** | Parent + child chunks for retrieval precision |
| Connector ecosystem | **Yes, gradually** | Notion + Drive in Phase 2; analytics CSV first |
| MCP server | **Phase 2** | `@laraloop/mcp-memory` so external agents query memory |
| Cloudflare D1/Vectorize | **No** | We stay on Supabase |
| Chrome extension | **No (not yet)** | Not the product surface |

### 8.3 What to build custom

1. **Reconciliation prompt + judge** tuned for marketing facts (different
   structure than Mem0's general prompt — campaigns have rich entities).
2. **The 5-layer model** — `brand / campaign / strategic / preference /
   reflection` is unique to autonomous-marketing and not provided by either.
3. **Cross-agent retrieval policy** — which agent reads which layer, with
   workspace-level overrides. Pure Mem0 has flat scoping.
4. **Reflection generation pipeline** — Nick's analysis becomes
   first-class memory, not just a report.
5. **Confidence + temporal decay tuned for marketing** — a Q4 holiday
   campaign learning should not steer Q2 strategy at full weight.

### 8.4 What to avoid

- **Don't ship managed Mem0 in production.** Vendor lock-in on the
  *exact* layer we want to own.
- **Don't pre-shard.** RLS + workspace_id partitioning gets us to ~10k
  workspaces on one Supabase project.
- **Don't store agent outputs as a single blob.** Decompose into facts
  on write — recomposition on read is much more flexible.
- **Don't skip RLS.** A single missing policy = cross-tenant data leak.
- **Don't run the reconciliation LLM inline.** Put it behind a queue or
  the founder waits 4s for every agent action.

### 8.5 What creates the moat

The institutional reflection layer. Mem0 gives us facts; Supermemory
gives us documents; **neither learns from campaign outcomes**. The piece
that compounds is `reflection` memory tied to attribution-corrected
metrics. After 6 months, Laraloop's agents will outperform any
cold-start AI marketing tool on a workspace they've lived inside —
that's the defensibility.

The cross-workspace anonymised "institutional brain" (Phase 3, opt-in)
turns that single-tenant moat into a *platform* moat: every customer's
wins make every other customer's agents slightly smarter.

### 8.6 What scales best

The Supabase + pgvector stack scales to ~10M memories per project before
read latency degrades. Beyond that:

1. Partition `memories` by `workspace_id` hash (Phase 2).
2. Move oldest cold tier (>18 months) into compressed JSONB snapshots in
   Supabase Storage (Phase 2).
3. Sharded Postgres + dedicated pgvector replicas (Phase 3, when revenue
   justifies).

There is no point introducing Qdrant / Weaviate / Pinecone until that
ceiling is in sight — pgvector with HNSW is within 10–15% of the best
specialised stores up to that scale, and one query plane is worth a lot.

---

## 9. Implementation checklist

**Phase 1 — Foundation (4 weeks)**

- [ ] Migrate `supabase-migration.sql` with `memories`, `memory_documents`,
      `memory_chunks`, `memory_entities`, `memory_relations`, `memory_events`
- [ ] Add `memories_hybrid_search` Postgres function
- [ ] Build `@/lib/memory` module (types, embed, store, retrieve)
- [ ] Wire reconciliation worker + queue
- [ ] Add fact extraction to existing agent runners (Lora, Nick first)
- [ ] Add retrieval injection to Sophie, Clara, Elena
- [ ] Add a `/api/memory/search` admin route for debugging

**Phase 2 — Production (8 weeks)**

- [ ] Redis cache layer for embeddings + rerank
- [ ] Cross-encoder rerank (Cohere → self-hosted BGE)
- [ ] MCP server `@laraloop/mcp-memory`
- [ ] Notion + Google Drive connectors
- [ ] Memory snapshot job → Supabase Storage / R2
- [ ] LangGraph campaign loop endpoint replaces the linear orchestrator
- [ ] Aura uses event subscription instead of polling
- [ ] Memory analytics dashboard (per workspace)

**Phase 3 — Institutional intelligence (12 weeks)**

- [ ] Anonymised cross-workspace memory (opt-in)
- [ ] Entity graph promoted to Neo4j / AGE
- [ ] NATS event bus replaces Realtime
- [ ] Online learning: memory weights trained on campaign outcomes
- [ ] Memory-aware agent fine-tuning of Gemini via prompt-tuned models

---

## 10. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Reconciliation LLM hallucinates UPDATE → corrupts a real fact | Med | Always supersede (never destroy); event log allows replay |
| Vector store fills up with low-signal facts | High | Importance scoring + decay; periodic "gardening" worker |
| Cross-workspace leak via missing RLS policy | Low (but catastrophic) | Policy test suite — every memory_* table covered by `pgtap` test on every PR |
| Embedding model change invalidates index | Med | Versioned embeddings — never overwrite; backfill in background |
| LangGraph state blows up in Vercel function timeout | Med | Move long-running graphs to a queue worker (Phase 2) |
| Cohere rerank rate-limit on free tier | High | Cache + self-host fallback in Phase 2 |

---

*End of RFC. Open questions: do we want opt-in cross-workspace memory in
the product from day 1 (helps cold-start new customers), or only after
trust is established? Recommend starting closed and turning it on as a
Phase 3 deliverable with explicit founder consent.*
