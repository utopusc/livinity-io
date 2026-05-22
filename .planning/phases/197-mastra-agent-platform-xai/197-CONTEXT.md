# Phase 197: Mastra Agent Platform + xAI/OAuth Integration

**Gathered:** 2026-05-22
**Status:** Ready for planning
**Source:** Operator directive 2026-05-22 — "LangGraph yerine Mastra inceledim, çok yatkın geldi. Şu anki Grok Auth + API key kolay entegre edebilir miyiz? OpenClaw gibi bir agent oluşturmak istiyoruz ama farkımız vs olmalı."
**Milestone:** v38.3 (continues from Phase 196 onboarding completion — LivOS now has live xAI OAuth + 7-step wizard + clean install path; next layer is the actual AI agent on top)
**Wave priority:** 1 (foundational — every future "AI does X on LivOS" phase consumes this layer)

<live_runtime_evidence>
## Why this phase exists — confirmed 2026-05-22 after Phase 196 + Phase 196.1 ship

Phase 195 + 196 chain is live on Mini PC (SHA `98ff2316`):
- ✅ xAI OAuth device-code flow working — operator can sign in via setup wizard, opencode binary at /usr/local/bin/opencode 1.15.7
- ✅ `XaiCredentialsService.getToken()` returns fresh access token with 6h TTL auto-refresh (Phase 195-02)
- ✅ `xai-client` scaffold ready with OpenAI-compatible interface, 401-refresh-retry-once, voice endpoints throw VoiceNotSupportedError (Phase 195-05)
- ✅ Location-aware onboarding (country/city/timezone/locale) via Phase 196.1
- ✅ tRPC `auth.xai.*` router serving HTTP 200 with {flowId, url} (Phase 196-01 DI wire-up)

What's still missing: an actual **agent layer** that consumes these credentials and does work. The xai-client gets us model calls; we need agents, workflows, memory, tools, RAG. The original plan was LangGraph; operator pivoted to Mastra after live research.

**Mastra research findings (technical-researcher 2026-05-22):**
- v1.0 stable Jan 2026, 24.2k GitHub stars, weekly ~300k npm downloads, Replit/PayPal/Adobe users
- **Native xAI support** — `xai/grok-4.20-0309-non-reasoning` model string, `@mastra/voice-xai-realtime` package, `@ai-sdk/xai` for fine-grained provider control
- 4-layer memory (raw history + working memory + semantic recall + observational compression, 94.87% LongMemEval accuracy)
- MCP first-class (MCPClient consumes external + MCPServer exposes ours)
- Workflow primitive with `.then/.branch/.parallel/.foreach/.dowhile/.dountil` + suspend/resume + PostgreSQL snapshot
- Hono server output, Vercel/CF Workers/Lambda/self-host all supported
- PostgreSQL `@mastra/pg` integration (PgStore + PgVector) plugs into existing `livos` DB directly
- 18h dev time vs LangGraph's 41h on equivalent benchmarks (per public migration report)
- Known issues: stack trace leakage #15827 (active), ProcessorRunner corruption #9352 (active), Zod v3/v4 peer conflicts (pnpm overrides workaround), `scope` breaking change ('thread' → 'resource' default)
</live_runtime_evidence>

<domain>
## Phase Boundary

Wire Mastra into LivOS as the agent + workflow layer that sits on top of `XaiCredentialsService`. After this phase ships, livinityd will host a Mastra instance exposing one or more agents that can:

1. **Stream + tool-loop** against Grok-4.20 via the existing OAuth token (no static `XAI_API_KEY` env var)
2. **Use LivOS-native tools** (shell exec with HITL approval, app install/list, Docker, Redis, file system, current selfclaude MCP endpoint at :8090/mcp)
3. **Remember across conversations** via 4-layer memory backed by the existing `livos` PostgreSQL DB with pgvector extension
4. **Run durable workflows** with suspend/resume for HITL gates (app installs, destructive ops, schema migrations)
5. **Be evaluated** via async scorers (answer relevancy + LivOS-specific task completion) writing to `mastra_scorers` table
6. **Emit OpenTelemetry** traces consumable by future Grafana/Loki stack on Mini PC

Six concrete deliverables, each a separate plan.

**Hidden mechanics summary (not user-visible):**
- `LivOSMastra` singleton at `liv/packages/core/src/mastra/index.ts` registered in livinityd boot alongside `setupRouter` + `xaiAuthRouter` singletons (Phase 196-01 pattern)
- Per-request token injection via `@ai-sdk/xai`'s `fetch` middleware → never embeds static key in source
- `pgvector` PostgreSQL extension enabled via migration script (`CREATE EXTENSION IF NOT EXISTS vector;`)
- selfclaude MCP endpoint (`http://localhost:8090/mcp`) consumed via Mastra MCPClient — adds Cursor/Claude Desktop-compatible MCP tools without rewriting them
- Mastra agent stream piped through new tRPC route `mastra.agent.stream` (HTTP SSE), added to `httpOnlyPaths`
- Workflow runs persisted to `livos` DB so `systemctl restart livos` mid-flight resumes from snapshot

**Verified facts (from research, double-check during planning):**
- Mastra v1.35.x is latest stable as of 2026-05-22; pin exact version (rapid release cadence)
- `@mastra/core@1.35.x` + `@ai-sdk/xai` peer-dep matrix needs pnpm `overrides`
- `MCPClient` `id` parameter MANDATORY to avoid memory leaks across multiple instances
- `semanticRecall.scope: 'thread'` MUST be explicit (default changed to `'resource'` in 2026-03)
- `requireApproval: true` on `createTool()` emits `tool-call-approval` chunk — UI handler needed
- Mastra Studio's RBAC requires EE license — LivOS uses tRPC+JWT RBAC, no conflict but no Studio integration either
</domain>

<decisions>

### Plan 197-01: Mastra Core Setup + xAI Provider Wiring (Wave 1)

- NEW pnpm workspace addition: `@mastra/core`, `@mastra/pg`, `@mastra/memory`, `@mastra/mcp`, `@ai-sdk/xai` (pin exact versions)
- NEW `liv/packages/core/src/mastra/index.ts` — `LivOSMastra` singleton with single Mastra instance
- NEW `liv/packages/core/src/mastra/xai-provider.ts` — `buildXaiAgentModel(creds: XaiCredentialsService, modelId?)` factory:
  ```ts
  const xai = createXai({
    apiKey: 'placeholder',
    fetch: async (url, init) => {
      const token = await creds.getToken()   // 6h TTL auto-refresh from Phase 195-02
      const headers = new Headers(init?.headers)
      headers.set('Authorization', `Bearer ${token}`)
      return globalThis.fetch(url, { ...init, headers })
    },
  })
  return xai(modelId ?? 'grok-4.20-0309-non-reasoning')
  ```
- MOD `livos/packages/livinityd/source/index.ts` — instantiate `LivOSMastra` after `xaiCredentialsService`, pass into the existing DI bag alongside `setupRouter` etc.
- NEW unit tests: token freshness assertion (fetch middleware invoked, header set), provider model ID correctness
- Acceptance: `LivOSMastra.agents.testAgent.generate([{role:'user',content:'ping'}])` returns text via xAI without static `XAI_API_KEY` env var; live curl probe returns 200 (mirrors Phase 196-01 verification pattern)

### Plan 197-02: LivOS Tool Registry + MCPClient Bridge (Wave 1)

- NEW `liv/packages/core/src/mastra/tools/` directory
- NEW tools (Zod schema + execute body):
  - `shell_exec` (`requireApproval: true` — destructive)
  - `app_install_from_store` (consumes existing `/api/apps/install` tRPC route under the hood, `requireApproval: true`)
  - `app_list` (read-only, no approval)
  - `docker_ps` (read-only)
  - `redis_get` / `redis_set` (read OK no approval; write `requireApproval: true`)
  - `read_file` / `write_file` (file system tools, bounded to `/home/bruce/livinity/*`, write `requireApproval: true`)
- NEW MCPClient setup consuming `http://localhost:8090/mcp` (selfclaude — list/replay skills, screenshot, list webapps) — tools namespaced as `selfclaude_*`
- Each tool emits clear `description` strings (model routes by description, not name)
- Acceptance: Agent successfully invokes shell_exec (with mock HITL approve), result returned via stream; MCPClient.listTools() returns ≥4 namespaced selfclaude tools

### Plan 197-03: Memory Integration (pgvector on existing livos DB) (Wave 1)

- Migration script: `CREATE EXTENSION IF NOT EXISTS vector;` on `livos` DB (Phase 196.1 chmod chain assumed)
- NEW `liv/packages/core/src/mastra/memory.ts` — `LivOSMemory` factory:
  ```ts
  new Memory({
    storage: new PgStore({ connectionString: DATABASE_URL }),
    vector:  new PgVector({ connectionString: DATABASE_URL, indexConfig: { type: 'hnsw', metric: 'dotproduct' } }),
    options: {
      lastMessages: 20,
      semanticRecall: { topK: 5, messageRange: 2, scope: 'thread' },  // explicit — default changed to 'resource' in 2026-03
      workingMemory: { enabled: true, scope: 'thread' },
    },
  })
  ```
- Migration that adds Mastra-required PG tables (`mastra_threads`, `mastra_messages`, `mastra_working_memory`, `mastra_scorers`)
- Acceptance: Two-turn agent conversation: turn 1 "my name is bruce", turn 2 "what's my name?" → agent recalls via working memory; same query across separate threads in same resource returns null (thread isolation)

### Plan 197-04: tRPC Agent Bridge — SSE Stream + HITL Approval (Wave 2, depends 197-01..03)

- NEW tRPC namespace `mastra.*` mounted under existing app router
- Procedures:
  - `mastra.agent.stream` — SSE long-poll, streams text + tool calls + approval prompts
  - `mastra.agent.approve` — adminProcedure, accepts `{toolCallId, approved}` to resolve pending tool-call-approval chunks
  - `mastra.agent.threads.list` / `.get` / `.delete` — thread management
  - `mastra.agent.cancel` — abort in-flight run via `AbortController`
- All paths added to `httpOnlyPaths` (Phase 195-03 pattern — SSE survives WS reconnect)
- NEW UI hook `useMastraAgent(threadId)` in `livos/packages/ui/src/features/agent-chat/` — Phase 197 introduces a minimal chat panel (Phase 198+ polishes)
- Acceptance: live SSE stream from `curl -N`; HITL approval mid-stream — operator can approve via separate mutation while stream paused; cancellation works mid-tool-call

### Plan 197-05: First Mastra Workflow — App Install Pipeline (Wave 2, depends 197-02 + 197-04)

- NEW `liv/packages/core/src/mastra/workflows/app-install.ts` — durable workflow:
  ```
  validateAppManifest
    → checkDockerHubImageExists
    → [SUSPEND: HITL approval — risky ports/volumes]
    → installForUser  (existing apps.ts code path)
    → configureCaddyProxy
    → emitDoneEvent
  ```
- Snapshot to `livos` DB so `systemctl restart livos` mid-install resumes from last completed step
- UI: install button on App Store dispatches `mastra.workflows.appInstall.start`; approval suspended state surfaced as tRPC subscription
- Acceptance: deliberate `systemctl restart livos` between step 3 and 4 — resume button restarts from step 4, not step 1

### Plan 197-06: Eval Scorers + OpenTelemetry (Wave 3, depends 197-04 + 197-05)

- NEW `liv/packages/core/src/mastra/scorers/` directory
- `createAnswerRelevancyScorer({ model: xai('grok-build-0.1') })` with `sampling: { rate: 0.1 }`
- NEW custom `createLivOSTaskCompletionScorer` — checks if user's task was completed in N tool calls
- OpenTelemetry export to `http://localhost:4317` (placeholder — Grafana/Loki Mini PC stack is Phase 199+ work, but emit traces now so they're available when collector lands)
- `mastra_scorers` PG table populated automatically; expose via `mastra.evals.recent` tRPC query
- Acceptance: 10 agent runs → 1 scorer record (10% sampling); LivOS task completion scorer correctly flags incomplete vs complete runs in unit tests
</decisions>

<deferred>

### Realtime voice via xAI (`@mastra/voice-xai-realtime`)
- xAI voice endpoints return 403/404 for SuperGrok Tier 1 (Phase 195 live evidence)
- Realtime voice deferred until either (a) operator upgrades xAI tier OR (b) we wire `CompositeVoice(OpenAI Whisper STT + ElevenLabs TTS)` as fallback — that's a separate scoped phase

### Mastra Cloud / Mastra Studio
- Self-host only for LivOS; no Mastra Cloud subscription
- Studio's RBAC requires EE license; LivOS uses its own tRPC+JWT RBAC

### Multi-agent orchestration (sub-agents calling sub-agents)
- Mastra supports this via `agents` array; defer until single-agent flow is stable (Phase 198+)

### LangGraph migration path
- Explicitly NOT pursued; this phase is Mastra-only. If Mastra proves unworkable, revisit in future phase with retro

### Server4 / Server5 deployment
- HARD RULE — Phase 197 does NOT deploy to Server4 or Server5
- Mini PC sole deployment target

### Frontend agent chat polish
- Phase 197 adds a MINIMAL chat panel for testing (just SSE renderer + approval modal)
- Full agent chat UI (sidebar, persistent threads, rich rendering) is Phase 198+
</deferred>

<sacred_constraints>

### Sacred SHA preservation
- `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST remain unchanged across every Phase 197 commit
- Mastra integration lives in NEW files under `liv/packages/core/src/mastra/` — sdk-agent-runner.ts is NOT touched

### File scope (don't touch what's not in files_modified)
- Every plan lists exact files_modified; don't bleed
- DO NOT reintroduce deleted modules: cc-pty, claude-runner, livinity-broker, vault-items, computer-use, autonomous-scheduler, AI Chat (Phase 192 sacred boundary)
- DO NOT touch Phase 195's xai-auth/, xai-credentials/, xai-provider/, xai-auth-router (Mastra consumes them, doesn't modify)
- DO NOT touch Phase 196's setup-router setLocation procedure (Mastra is additive)

### Existing live patches MUST be preserved
- `DEFAULT_METHOD = 'xAI Grok OAuth (Headless / Remote / VPS)'` (Phase 196.1 hotfix)
- URL regex `(?:[a-z]+\.)?x\.ai/oauth\w*[/?]` (Phase 196.1 hotfix)

### Mini PC sole deployment target
- All Phase 197 deployment + UAT targets `bruce@10.69.31.68` ONLY
- Server4 + Server5 references forbidden in 197 plans

### No new auth surface
- All Mastra tRPC routes use the existing adminProcedure middleware (Phase 195-03 pattern)
- No new JWT scopes; no new RBAC roles; HITL approval is a Mastra primitive, NOT a separate auth layer

### Mastra version pin
- Pin exact version of `@mastra/core`, `@mastra/pg`, `@mastra/memory`, `@mastra/mcp`, `@mastra/evals`, `@ai-sdk/xai` in package.json (no `^`)
- Rapid release cadence + known breaking changes per minor version → exact pin prevents silent breakage

### Differentiation from OpenClaw / selfclaude
- We CONSUME selfclaude's MCP endpoint via MCPClient, we don't fork or modify selfclaude
- Our differentiators (must be visible in delivered code, not just docs):
  1. Provider-agnostic via `XaiCredentialsService` (selfclaude is Anthropic-coupled)
  2. Durable workflows with suspend/resume (selfclaude is stateless loop)
  3. 4-layer memory backed by livos PG (selfclaude has SQLite skill replay only)
  4. tRPC-native bridge with HITL approval (selfclaude is HTTP REST only)
  5. LivOS-native tools (app store, Docker, Caddy) as first-class agent capabilities
</sacred_constraints>

<unknowns>

### Resolved at planning time by gsd-planner
1. Exact pgvector extension install path on Mini PC (`apt install postgresql-16-pgvector` or build from source?) — grep current PG package state
2. Mastra `@mastra/core` peer-dep conflict resolution strategy (pnpm `overrides` exact pin set) — try local install before plan
3. Whether livinityd's existing tRPC root router can absorb `mastra.*` namespace OR needs `setProductionAppRouter` swap pattern (Phase 195-03 / 196-01 mirror)
4. SSE encoding in livinityd (existing precedent for tRPC SSE? or new) — grep for current SSE patterns
5. Mastra Studio integration: nice-to-have or skip entirely (tilts the eval Plan 197-06 scope)

### Open questions for operator (only ask if essential)
- None expected — operator gave clear directive ("Mastra ile, OpenClaw farkımız olsun"). If genuine ambiguity surfaces during planning, gsd-planner can checkpoint-ask, but default to "pick reasonable interpretation and document it."
</unknowns>

<research_sources>
Key sources from technical-researcher 2026-05-22 (full list in agent return):

- https://mastra.ai (docs landing)
- https://github.com/mastra-ai/mastra (24.2k stars, v1.0 Jan 2026)
- https://mastra.ai/en/models/providers/xai (native xAI support docs)
- https://ai-sdk.dev/providers/ai-sdk-providers/xai (@ai-sdk/xai factory + fetch middleware)
- https://mastra.ai/docs/memory/overview (4-layer memory)
- https://mastra.ai/docs/workflows/suspend-and-resume (durable workflow primitive)
- https://mastra.ai/docs/mcp/overview (MCPClient + MCPServer)
- https://github.com/utopusc/selfclaude (OpenClaw reference for differentiation)
- https://github.com/thesysdev/openclaw-os (UI-rich agent reference)
- https://github.com/mastra-ai/mastra/issues/15827 (stack trace leakage — active)
- https://github.com/mastra-ai/mastra/issues/9352 (ProcessorRunner corruption — active)
</research_sources>
