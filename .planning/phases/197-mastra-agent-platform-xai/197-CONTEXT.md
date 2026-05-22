# Phase 197: Liv AI — Mastra Agent + Provider Router + Dock App

**Gathered:** 2026-05-22 (rev-2 after operator pivot)
**Status:** Ready for re-planning (CONTEXT rewritten 2026-05-22 mid-day; old 6 plan files deleted)
**Source:** Operator directive 2026-05-22 — "Mastra alt yapısını app install için istemiyorum. Liv AI'ı tasarlamak istiyorum yeniden. LivOS ile birlikte indirilmesi lazım, Docker'da çalışmayacak. Otomatik hangi provider seçili ise onu kullanacak. LivOS UI'da şimdilik 'Liv AI' diye bir app oluştur, Dock'ta tıkladığımda pencere açılsın ve tasarımı göreyim. SelfClaude şu şekilde olmalı — biz önceden Luse MCP yapmıştık, bir nevi bu computer-use özellikleri (pencere seçme vs) vardı, bunları ekle."
**Milestone:** v38.3 (Liv AI is the agent surface that completes the LivOS → AI loop)
**Wave priority:** 1 (foundational — every "AI does X on LivOS" workflow consumes this layer)

<live_runtime_evidence>
## Why this phase exists — confirmed 2026-05-22

Phase 195/196/196.1 chain is live on Mini PC (SHA `9f71435c`):
- ✅ xAI OAuth device-code flow working
- ✅ opencode 1.15.7 on system PATH; `XaiCredentialsService.getToken()` returns fresh access tokens with 6h auto-refresh
- ✅ Onboarding wizard 7 steps; user selects provider (xAI enabled, others "Coming soon") + country/city
- ✅ tRPC `auth.xai.*` and `setup.*` routers all live; httpOnlyPaths in place

What's still missing: an **actual visible agent the operator can chat with**. Phase 195's xai-client gets us model calls; we need an agent surface (Mastra), provider abstraction (so future Claude/OpenAI can plug in), computer-use tools (Luse MCP or selfclaude MCP), and a Dock app the operator clicks to open the chat window.

**Pivot from earlier 197 plan (now obsolete — 6 PLAN.md files deleted):**
- Old 197-05 (app install workflow via Mastra) → DROPPED. Mastra is for Liv AI agent, NOT for LivOS plumbing.
- Old 197-06 (Eval scorers + OTel) → DEFERRED to Phase 198+. Focus on getting the visible agent working first.
- Old plan list (Mastra core / tools / memory / tRPC / workflow / eval) → REPLACED with the 6 plans below that target the visible Liv AI surface.

**Mastra research findings retained from previous CONTEXT (technical-researcher 2026-05-22):**
- v1.0 stable Jan 2026, native xAI support (`xai/grok-*`), `@ai-sdk/xai` factory with `fetch` middleware for dynamic Bearer tokens
- 4-layer memory backed by PostgreSQL + pgvector
- MCPClient first-class for consuming external MCP servers (selfclaude `:8090/mcp` or Luse MCP stdio)
- Workflow primitives with suspend/resume + PG snapshot (still useful, but not the marquee deliverable now)
- Known issues mitigated: stack trace leakage #15827 (redact wrapper), ProcessorRunner #9352 (steps validation), Zod peer conflict (pnpm overrides), scope='thread' explicit, MCPClient `id` mandatory
</live_runtime_evidence>

<domain>
## Phase Boundary

Wire Mastra into livinityd as **Liv AI** — a single visible agent the operator interacts with from the Dock. After this phase ships:

1. **Liv AI app icon in LivOS Dock** — operator clicks "Liv AI" → window opens → chat UI renders
2. **Mastra agent with provider router** — agent reads `liv:config:active_provider` from Redis (defaults to first auth'd provider, currently always `xai`); dynamically resolves to the right `@ai-sdk/*` factory. Static `XAI_API_KEY` env var NEVER used; every request pulls fresh token via `XaiCredentialsService.getToken()` (Phase 195-02 pattern preserved).
3. **Computer-use tools** — operator can say "screenshot my screen" / "list windows" / "click button at X,Y" / "open Firefox" and the agent invokes Luse MCP (stdio) OR selfclaude MCP (HTTP at `:8090/mcp`) — whichever is available, MCPClient bridge consumes both
4. **4-layer memory** — backed by livos PG + pgvector. Operator's preferences, past conversations, learned facts persist across sessions
5. **HITL approval for destructive actions** — `computer_click_mouse` / `computer_type_text` / `shell_exec` emit `tool-call-approval` chunk; UI shows an approval modal; operator clicks Approve/Reject before action executes
6. **Bundled with LivOS** — no Docker. `@mastra/*` packages added to livinityd's pnpm install. Liv AI runs as part of livinityd process (not a separate systemd service in this phase — Phase 198+ may split if process pressure surfaces).

Six concrete deliverables, each a separate plan. Order is:
- Wave 1 (foundations, file-disjoint, parallel): Mastra core + provider router | Luse MCP bridge | Memory + pgvector
- Wave 2: Liv AI agent definition (consumes all three Wave 1 outputs)
- Wave 3: tRPC SSE bridge (depends on agent)
- Wave 4: Dock app + chat window UI (depends on SSE)

**Hidden mechanics summary:**
- `LivOSMastra` singleton at `livos/packages/livinityd/source/modules/mastra/index.ts` registered in livinityd boot alongside `setupRouter` + `xaiAuthRouter` (same Phase 196-01 DI pattern — module-scope singleton, then `setProductionAppRouter(createAppRouter({chromeMaster, xaiAuth, setup, mastra}))`)
- Provider router: `livos/packages/livinityd/source/modules/mastra/provider-router.ts` reads `liv:config:active_provider` from Redis (sync via local cache + invalidate-on-change). xai → `createXai({fetch: tokenFetch})`, claude/openai → throw `ProviderNotConfiguredError` for now (Phase 198+ adds).
- MCPClient: per-request reads Redis flag `liv:mcp:luse:enabled` and `liv:mcp:selfclaude:enabled` to decide which MCP servers to expose. Tools namespaced (`luse_computer_screenshot`, `selfclaude_list_skills`). At least one MCP source must be active; both can be active simultaneously.
- Memory: pgvector extension on existing `livos` DB (operator UAT manual step after Plan 197-03 ships: `sudo apt install postgresql-16-pgvector` + `psql livos -c 'CREATE EXTENSION vector;'`). 4-layer Memory (raw + working + semantic recall + observational) bound to `liv:user:*` Redis scope.
- tRPC `mastra.*` namespace: 5 procedures (`agent.stream` SSE, `agent.approve`, `agent.cancel`, `agent.threads.list`, `agent.threads.delete`). All in `httpOnlyPaths`. Stream emits typed chunks: `text-delta`, `tool-call`, `tool-call-approval`, `tool-result`, `finish`.
- Dock app: NEW entry `LIVINITY_liv-ai` in `systemApps` (`livos/packages/ui/src/providers/apps.tsx`); icon `/figma-exports/liv-ai.svg` (new); `systemAppTo` opens window via `window-manager` → renders `<LivAiChatWindow />` at route `/liv-ai`. Chat UI: message list, streaming text renderer, approval modal, thread sidebar, input box.

**Differentiation from selfclaude / OpenClaw (must be visible in delivered code):**
1. **Provider-agnostic** — selfclaude is Anthropic-coupled via `@anthropic-ai/sdk`; Liv AI runs on ANY provider (xAI today, Claude/OpenAI plugin tomorrow) via single `ProviderRouter` abstraction
2. **OS-native, not Docker** — selfclaude ships as a containerized AI desktop; Liv AI is a process inside livinityd, bundled with LivOS install via pnpm
3. **Dock-first UX** — selfclaude exposes a web UI on a port; Liv AI is a first-class LivOS app with icon + window, indistinguishable from Files/Settings to the operator
4. **Computer-use via MCP bridge** — selfclaude has direct xdotool calls in its loop; Liv AI consumes MCP servers (Luse / selfclaude / future) via Mastra's MCPClient, can swap or compose backends without touching agent code
5. **Memory-first** — selfclaude has SQLite skill replay; Liv AI has 4-layer Mastra memory (raw + working + semantic recall + observational compression) backed by livos PG — agent remembers operator preferences across sessions

**Verified facts (from research + codebase):**
- Mastra v1.35.x latest as of 2026-05-22 — pin exact (no `^`)
- `@ai-sdk/xai` factory supports `fetch` middleware → THE integration point for `XaiCredentialsService.getToken()`
- Luse MCP server itself is NOT in this repo (`luse-mcp-config.ts` module deleted with AI Chat teardown). It's a stdio MCP server, path resolved via `LUSE_MCP_PATH` env var or `/usr/local/bin/luse-mcp` install convention. Phase 197-02 MUST handle the missing-server case gracefully (warn + degrade, don't crash livinityd).
- selfclaude MCP server runs at `http://localhost:8090/mcp` on Mini PC (4 tools). If `:8090` not responding, MCPClient logs and continues (degraded mode).
- LivOS Dock reads from `systemApps` array in `livos/packages/ui/src/providers/apps.tsx`; adding `LIVINITY_liv-ai` entry + a matching window-manager handler is the entry point.
- Window manager at `livos/packages/ui/src/providers/window-manager.tsx` already handles `openWindow(appId, route, title, icon)` — Liv AI plugs into this existing surface.
</domain>

<decisions>

### Plan 197-01: Mastra Core + Provider Router (Wave 1)
- NEW pnpm workspace deps (EXACT pins, no `^`): `@mastra/core`, `@mastra/memory`, `@mastra/pg`, `@mastra/mcp`, `@ai-sdk/xai`, `@ai-sdk/openai-compatible`. Add pnpm `overrides` for Zod v3/v4 peer conflict resolution.
- NEW `livos/packages/livinityd/source/modules/mastra/index.ts` — `LivOSMastra` singleton, holds Mastra instance + registered agents/workflows (extension points for future plans)
- NEW `livos/packages/livinityd/source/modules/mastra/provider-router.ts`:
  ```ts
  type ProviderId = 'xai' | 'claude' | 'openai'
  interface ProviderDeps { xaiCreds: XaiCredentialsService; redis: RedisClient }

  export function createProviderRouter(deps: ProviderDeps) {
    return {
      async resolveAgentModel() {
        const provider = (await deps.redis.get('liv:config:active_provider')) ?? 'xai'
        if (provider === 'xai') {
          return createXai({
            apiKey: 'placeholder',
            fetch: async (url, init) => {
              const token = await deps.xaiCreds.getToken()
              const headers = new Headers(init?.headers)
              headers.set('Authorization', `Bearer ${token}`)
              return globalThis.fetch(url, { ...init, headers })
            },
          })('grok-4.20-0309-non-reasoning')
        }
        throw new ProviderNotConfiguredError(provider)
      }
    }
  }
  ```
- MOD `livos/packages/livinityd/source/index.ts` — instantiate `LivOSMastra` after `xaiCredentialsService` + Redis client; same DI pattern as Phase 196-01 setupRouter
- Acceptance: `LivOSMastra.providerRouter.resolveAgentModel()` returns a Mastra language model bound to fresh xAI token on every fetch (verified by spy)

### Plan 197-02: Luse MCP + selfclaude MCP Bridge (Wave 1)
- NEW `livos/packages/livinityd/source/modules/mastra/mcp-bridge.ts` — `createMcpBridge({redis, logger})` that:
  1. Reads `liv:mcp:luse:enabled` (bool, default true) and `LUSE_MCP_PATH` env var
  2. Reads `liv:mcp:selfclaude:enabled` (bool, default true) and `SELFCLAUDE_MCP_URL` env var (default `http://localhost:8090/mcp`)
  3. Instantiates Mastra `MCPClient` with `id: 'livos-mcp-bridge'` (MANDATORY — memory leak guard)
  4. Graceful degradation: if Luse server path missing OR not executable → log warn, skip Luse but keep selfclaude. If selfclaude port not responding within 2s → log warn, skip. If BOTH missing → still construct bridge with empty tool list (don't crash).
- Tools namespaced: `luse_computer_screenshot`, `luse_list_windows`, etc. + `selfclaude_list_skills`, etc.
- Per CONTEXT.md from Luse vault template, expose at minimum: computer_screenshot, list_windows, focus_window, screenshot_window, computer_click_mouse, computer_type_text, computer_press_keys, computer_application, computer_scroll, computer_drag_mouse, computer_paste_text, computer_wait, computer_cursor_position
- Destructive tools (click_mouse, type_text, press_keys, paste_text, drag_mouse, application) get `requireApproval: true` wrapping (Mastra emits `tool-call-approval` chunk)
- Acceptance: unit test with mock MCP server: bridge returns ≥10 namespaced tools when both sources enabled; ≥4 when only selfclaude enabled; 0 (empty array) when both disabled (no crash)

### Plan 197-03: Memory + pgvector (Wave 1)
- NEW `scripts/install/pgvector-enable.sh` — idempotent: detect package install, `CREATE EXTENSION IF NOT EXISTS vector;` on `livos` DB
- NEW `livos/packages/livinityd/source/modules/mastra/memory.ts` — `createLivOSMemory({databaseUrl})`:
  ```ts
  new Memory({
    storage: new PgStore({ connectionString: databaseUrl }),
    vector:  new PgVector({ connectionString: databaseUrl, indexConfig: { type: 'hnsw', metric: 'dotproduct' } }),
    options: {
      lastMessages: 20,
      semanticRecall: { topK: 5, messageRange: 2, scope: 'thread' },  // explicit — default changed in 2026-03
      workingMemory: { enabled: true, scope: 'thread' },
    },
  })
  ```
- NEW migration for Mastra-required PG tables (`mastra_threads`, `mastra_messages`, `mastra_working_memory`, `mastra_workflow_runs`) — applied at livinityd boot if not exists
- Operator UAT step (post-deploy): `sudo apt install -y postgresql-16-pgvector` + `bash /opt/livos/scripts/install/pgvector-enable.sh`
- Acceptance: two-turn conv "my name is bruce" → "what's my name?" → agent recalls via working memory; cross-thread isolation verified (same query in fresh thread returns null)

### Plan 197-04: Liv AI Agent Definition (Wave 2, depends 197-01..03)
- NEW `livos/packages/livinityd/source/modules/mastra/agents/liv-ai.ts` — single agent definition:
  ```ts
  export function createLivAiAgent(deps: {
    providerRouter: ProviderRouter
    memory: Memory
    mcpBridge: McpBridge
  }) {
    return new Agent({
      id: 'liv-ai',
      name: 'Liv AI',
      instructions: `You are Liv AI, the assistant built into LivOS. You can:
        - Chat with the operator and answer questions
        - Take screenshots, list windows, click, type, launch apps (via the luse_* and selfclaude_* tools)
        - Remember the operator's preferences and past conversations across sessions

        Tone: concise, direct, no narration. When the operator asks for a desktop action, take a screenshot FIRST to see current state, then act, then confirm.`,
      model: async () => deps.providerRouter.resolveAgentModel(),  // dynamic — re-resolved per turn
      tools: async () => deps.mcpBridge.listTools(),                // dynamic — picks up MCP changes
      memory: deps.memory,
    })
  }
  ```
- Registered in `LivOSMastra.agents.livAi` (from Plan 197-01)
- Acceptance: `LivOSMastra.agents.livAi.generate([{role:'user',content:'list my windows'}])` invokes `luse_list_windows` tool (or selfclaude equivalent), returns window list

### Plan 197-05: tRPC SSE Bridge (Wave 3, depends 197-04)
- NEW `livos/packages/livinityd/source/modules/server/trpc/mastra-router.ts` with 5 procedures:
  - `mastra.agent.stream` — SSE endpoint, accepts `{threadId, message}`, streams typed chunks
  - `mastra.agent.approve` — adminProcedure, `{toolCallId, approved}` → resolves pending approval
  - `mastra.agent.cancel` — `{runId}` → AbortController fires
  - `mastra.agent.threads.list` — returns operator's thread list
  - `mastra.agent.threads.delete` — `{threadId}` → DROP from PG
- MOD `livos/packages/livinityd/source/modules/server/trpc/common.ts` — add all 5 paths to `httpOnlyPaths`
- MOD `livos/packages/livinityd/source/modules/server/trpc/index.ts` — mount `mastra` namespace, follow setupRouter empty-injection Proxy pattern from Phase 196-01
- MOD `livos/packages/livinityd/source/index.ts` — inject `mastraRouter` into `createAppRouter` call alongside existing slots
- ApprovalManager + redactError wrappers (Mastra issue #15827 + #9352 mitigations)
- Acceptance: `curl -N http://127.0.0.1:8080/trpc/mastra.agent.stream` returns SSE chunks; mid-stream approval mutation resolves pending tool call; cancel via separate mutation aborts in-flight run

### Plan 197-06: Liv AI Dock App + Chat Window UI (Wave 4, depends 197-05)
- NEW `livos/packages/ui/src/features/liv-ai/` directory:
  - `liv-ai-chat-window.tsx` — main window: message list + streaming renderer + input box + approval modal + thread sidebar
  - `message-bubble.tsx` — text + tool-call + tool-result rendering (markdown OK; code blocks; tool-result expanders)
  - `approval-modal.tsx` — surfaces `tool-call-approval` chunks → Approve / Reject buttons → calls `mastra.agent.approve`
  - `use-liv-ai.ts` — hook that wraps `mastra.agent.stream` SSE consumption, returns `{messages, sendMessage, pendingApproval, isStreaming, cancel}`
- NEW `livos/packages/ui/src/routes/liv-ai.tsx` — route component renders `<LivAiChatWindow />`
- MOD `livos/packages/ui/src/providers/apps.tsx` — add `LIVINITY_liv-ai` entry:
  ```ts
  {
    id: 'LIVINITY_liv-ai',
    name: 'Liv AI',
    icon: '/figma-exports/liv-ai.svg',  // NEW asset — placeholder OK in this phase
    systemApp: true,
    systemAppTo: '/liv-ai',
  }
  ```
- MOD `livos/packages/ui/src/router.tsx` — register `/liv-ai` route
- NEW asset `livos/packages/ui/public/figma-exports/liv-ai.svg` — minimal placeholder icon (cyan circle + LA monogram); Phase 198+ replaces with proper design
- Acceptance: operator clicks "Liv AI" in Dock → window opens → can type message → response streams in → operator can approve a tool call → action executes → result renders in chat
</decisions>

<deferred>

### Eval scorers + OpenTelemetry
- Previously Phase 197-06; deferred to Phase 198+. Mastra has `mastra_scorers` table built-in — when we want eval, add a thin plan.

### Mastra workflow primitive (suspend/resume + PG snapshot)
- Previously Phase 197-05 (app install pipeline); dropped per operator directive. Phase 199+ may revisit if a use case emerges that NEEDS durable multi-step (e.g. long-running data import).

### Claude + OpenAI provider implementations
- Phase 197-01 ProviderRouter throws `ProviderNotConfiguredError` for non-xai providers
- Phase 198+ adds: Anthropic OAuth (mirror xAI Phase 195 pattern) + OpenAI API key path
- UI Provider step already has "Coming soon" placeholders — just flip the disabled flag when ready

### Real Liv AI icon design
- This phase ships a placeholder SVG (cyan circle + LA monogram)
- Phase 198+ replaces via design handoff

### Multi-agent / sub-agent orchestration
- Single Liv AI agent for now; sub-agents (luse-driver delegation pattern from vault-templates/CLAUDE.md) are Phase 199+

### Voice (TTS/STT)
- xAI voice 403/404 for Tier 1 SuperGrok (Phase 195 verified)
- CompositeVoice (OpenAI Whisper STT + ElevenLabs TTS) is a Phase 200+ scope

### Server4 / Server5 deployment
- HARD RULE — Phase 197 does NOT deploy to Server4 or Server5
- Mini PC sole deployment target
</deferred>

<sacred_constraints>

### Sacred SHA preservation
- `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST remain unchanged across every Phase 197 commit
- All Mastra integration code lives in NEW files under `livos/packages/livinityd/source/modules/mastra/**` — sdk-agent-runner.ts is NOT touched

### File scope (don't touch what's not in files_modified)
- Every plan lists exact files_modified; don't bleed
- DO NOT modify Phase 195's `xai-auth/`, `xai-credentials/`, `xai-provider/`, `xai-auth-router.ts` (Mastra consumes them, doesn't rewrite)
- DO NOT modify Phase 196's `setup-router.ts` setLocation procedure
- DO NOT touch Phase 196.1 live patches (`DEFAULT_METHOD` and URL regex in xai-auth/)
- DO NOT reintroduce deleted modules: cc-pty, claude-runner, livinity-broker, vault-items, computer-use, autonomous-scheduler, AI Chat
- DO NOT touch `liv/packages/worker/`, `liv/packages/mcp-server/`, `liv/packages/memory/` — Mastra is a NEW subdirectory `livos/packages/livinityd/source/modules/mastra/` inside livinityd (NOT under liv/packages/core/, which is the sacred-SHA sdk-agent-runner zone)

### Mastra version pin
- Pin EXACT versions of `@mastra/core`, `@mastra/pg`, `@mastra/memory`, `@mastra/mcp`, `@ai-sdk/xai`, `@ai-sdk/openai-compatible` in `livos/package.json` AND `liv/package.json` (no `^`, no `~`)
- Rapid release cadence — exact pin prevents silent breakage

### Mini PC sole deployment target
- Server4 + Server5 references forbidden in 197 plans

### Provider router preserves OAuth chain
- Provider router for xAI MUST use `XaiCredentialsService.getToken()` via fetch middleware
- Static `XAI_API_KEY` env var path forbidden
- Live patches `DEFAULT_METHOD = 'xAI Grok OAuth (Headless / Remote / VPS)'` and the relaxed URL regex MUST stay intact

### MCP bridge graceful degradation
- Plan 197-02 MUST NOT crash livinityd if Luse MCP server binary missing OR selfclaude port not responding
- Failure mode: log warn, skip that source, agent still functional with whatever tools remain (or empty toolset)

### No Docker for Liv AI
- All Mastra code runs as part of livinityd Node process (or its own systemd service if Phase 198+ splits)
- No Dockerfile, no docker-compose entry for Liv AI in this phase

### Differentiation from selfclaude (must be visible in code, not just docs)
1. Provider-agnostic via ProviderRouter (selfclaude is Anthropic-coupled)
2. OS-native (no Docker)
3. Dock-first UX (first-class LivOS app with icon)
4. Computer-use via MCP bridge (selfclaude has direct xdotool in loop)
5. 4-layer Mastra memory (selfclaude has SQLite skill replay only)
</sacred_constraints>

<unknowns>

### Resolved at planning time by gsd-planner
1. Exact Luse MCP server binary location — grep at planning time, find install convention OR document `LUSE_MCP_PATH` env var contract
2. Whether selfclaude MCP at `:8090/mcp` is currently running on Mini PC OR needs separate install — check via `curl -s http://localhost:8090/mcp`
3. pgvector install command for Ubuntu 24.04 vs 22.04 — likely `postgresql-16-pgvector` package OR build from source
4. Where to put new "Liv AI" SVG icon — `/figma-exports/` convention or a new subdirectory
5. Whether the Mastra agent's `model: async () => ...` dynamic resolver re-runs every turn or caches per-agent-instantiation — needs Mastra docs check during 197-04 planning

### Open questions for operator (only ask if essential)
- None expected — operator's directive is clear: Liv AI as Dock app + Mastra agent + provider router + Luse computer-use. If genuine ambiguity surfaces, gsd-planner can checkpoint-ask.
</unknowns>

<research_sources>
Carryover from technical-researcher 2026-05-22 (full list in agent return):
- https://mastra.ai (v1.0 stable docs)
- https://mastra.ai/en/models/providers/xai (native xAI string format)
- https://ai-sdk.dev/providers/ai-sdk-providers/xai (`createXai({fetch})` middleware contract)
- https://mastra.ai/docs/memory/overview (4-layer memory)
- https://mastra.ai/docs/mcp/overview (MCPClient + namespacing)
- https://github.com/mastra-ai/mastra/issues/15827 (stack trace leakage — open)
- https://github.com/mastra-ai/mastra/issues/9352 (ProcessorRunner — open)
- LivOS codebase: `vault-templates/skills/luse-driver.md` (Luse MCP tool list verified)
- LivOS codebase: `livos/packages/livinityd/source/modules/webapps/window-manager.ts` (existing `luseServerPath` parameter shape)
- LivOS codebase: `livos/packages/ui/src/providers/apps.tsx` (Dock systemApps array entry shape)
</research_sources>
