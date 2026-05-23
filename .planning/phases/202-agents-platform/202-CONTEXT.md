---
phase: 202-agents-platform
status: planned
created: 2026-05-23
owner: livinity-user
goal: Ship a user-facing Agents Platform on top of the existing Mastra + Liv AI subapp. Operators can create custom Agents from the UI, give them tools (Luse MCP + Phase 200-C built-ins + sub-agent delegation), bind them to a cron schedule, and watch them run live in an Agents dashboard. Sub-agents can be invoked by parent agents via Mastra Supervisor pattern. Settings page gets an MCP tab (porting Phase 201-05 panel surface). Chat responses upgrade to true Generative UI via assistant-ui tool-ui primitives + OpenUI components.
---

# Phase 202 — Agents Platform (multi-agent + scheduling + generative UI)

## Why this phase

Phase 197-201 wired the Mastra runtime (Agent + Memory + McpBridge + dynamic model resolver + approval gate) and the assistant-ui frontend on top of it. Today there is exactly one hard-coded agent (`livAi`), no UI to create more, no scheduler, and no way for one agent to delegate to another. The operator wants:

1. **Self-service agent creation from the browser** — a form that produces a new persisted agent (name, instructions, model, tool selection, optional cron schedule, optional parent-agent linkage).
2. **An Agents dashboard** at `/agents` — live status (idle / running / scheduled-next-at), last run time, click-through to detail + edit + manual "Run now".
3. **Sub-agent execution** — Agent A can delegate to Agent B via Mastra's Supervisor pattern (`agents: { … }` on the parent). UI shows the parent → child tree.
4. **Settings page with MCP tab** — replace the in-sidebar Settings button stub from Phase 201 with a real `/settings` page; first tab is Account, second tab is MCP (ports P201-05 `Built-in tools (10)` panel + adds external MCP server CRUD), third tab is Models.
5. **Generative UI** — when an agent's tool call returns structured data (chart, table, image gallery, geo-map, code-diff, custom card), the assistant-ui tool-ui primitives render it inline in the thread. OpenUI Lang (@openuidev) is the standard for LLM-emitted ad-hoc UI; we adopt it as the "agent emits a UI block" surface.

This phase ships the lowest-friction integration of all five against the existing LivOSMastra singleton (the B-02 lock from Phase 197-01 is preserved — only additive changes).

## Phase Boundary

**IN SCOPE**

- PostgreSQL `livos_agents` table — `id, name, instructions, model_name, tool_ids[], schedule_cron?, parent_agent_id?, enabled, created_at, updated_at`
- Agent registry repo (`livos/packages/livinityd/source/modules/mastra/agents/agent-repository.ts`) + Drizzle migration
- Dynamic Mastra wire — on boot + on every CRUD mutation, rebuild the agent map and re-bind Supervisor `agents: { … }` for any parent that lists children
- node-cron scheduler (`livos/packages/livinityd/source/modules/mastra/scheduler.ts`) — reads `livos_agents.schedule_cron` on boot, schedules each enabled agent, Redis `SET NX PX` lock prevents overlap
- Task tRPC router (`livos/packages/livinityd/source/modules/server/trpc/agent-task-router.ts`) — `createTask`, `getTaskResult`, `listTasks`, `cancelTask`
- Mastra constructor wrap — replace ad-hoc `new Agent(...)` with `new Mastra({ agents, telemetry: { enabled: true, serviceName: 'livOS', export: { type: 'console' } } })` so workflows/evals/telemetry can hook later
- `/agents` list page (Next.js subapp) — grid of agent cards with live status badge
- `/agents/[id]` detail page — edit form + recent tasks list + "Run now" button + sub-agent tree
- `/agents/new` create page — form with model picker, tool checkboxes, schedule cron picker (visual + free-form), parent-agent select
- `/settings` page — tabs: Account, MCP, Models. MCP tab ports P201-05 built-in tools panel + adds external MCP server CRUD (Redis `liv:mcp:config` hash backing)
- Generative UI integration — assistant-ui tool-ui primitives (chart, code-block, data-table, image-gallery, geo-map, link-preview, weather-widget) wired to specific tool names; OpenUI Lang renderer mounted for arbitrary `ui_render` tool emissions
- Real-time status — Server-Sent Events from livinityd `/agents/status/stream` route, frontend EventSource hook updates list + detail pages without polling

**OUT OF SCOPE (defer)**

- Multi-user agent ownership (every agent is admin-owned in v202; per-user agents = Phase 220+)
- Agent marketplace / sharing (Phase 220+)
- Workflow editor UI (manual workflow CRUD via JSON is allowed; visual graph editor = Phase 220+)
- Eval suite definition UI (eval suites can be JSON-defined in code in v202; visual editor = Phase 220+)
- RAG / semantic recall (kept disabled per operator directive — embedder picking deferred)
- External telemetry dashboards (Langfuse / Phoenix integration = Phase 220+); v202 ships console export only
- Distributed scheduler (single-instance node-cron only; multi-replica = Phase 220+ with Inngest)
- Sub-agent recursion depth > 2 (parent → child only; grandchildren raise runtime error in v202)

## Locked Decisions (D-202-XX)

| ID | Decision | Value |
|----|----------|-------|
| D-202-01 | Agent persistence backend | PostgreSQL `livos_agents` table (existing `livos` DB) |
| D-202-02 | Schema migration tool | Drizzle (`livos/packages/livinityd/source/db/migrations/`) — same pattern as Mastra PgStore tables |
| D-202-03 | Mastra multi-agent pattern | **Supervisor** (`Agent({ agents: { … } })`) — NOT deprecated `.network()`, NOT manual createTool wrapping |
| D-202-04 | Scheduler runtime | `node-cron` + Redis `SET NX PX` mutex per agent (lock key `livos:agent:{id}:lock`, TTL = `min(cron-interval - 1m, 1h)`) |
| D-202-05 | Task record format | Memory thread w/ metadata `{ taskId, agentId, triggeredBy, triggeredAt, parentTaskId? }`. Memory.recall covers result polling |
| D-202-06 | Mastra constructor wrap | `new Mastra({ agents: {…}, telemetry: {enabled:true, serviceName:'livOS', export:{type:'console'}} })` — replaces ad-hoc `new Agent()` in livOSMastra |
| D-202-07 | Mastra workflows / evals registration | Empty maps in v202 (`workflows: {}, evals: {}`) — wired to constructor but no concrete workflows or evals shipped this phase. Use-cases defined in Phase 203+. |
| D-202-08 | Real-time status transport | SSE (`/agents/status/stream`) — same pattern as `/chat/livAi` SSE. Frontend uses native EventSource. NOT WebSocket. |
| D-202-09 | Generative UI primitives | Reuse Phase 201-03 ported tool-renderers + 11 tool-ui primitives (already in subapp). Wire each by `toolName` registration via `makeAssistantToolUI`. OpenUI added for `ui_render` ad-hoc emissions. |
| D-202-10 | OpenUI package | `@openuidev/renderer` — agent emits OpenUI Lang JSON via a single `ui_render` tool, renderer mounts inside Thread |
| D-202-11 | Settings page route | `/settings` (subapp root, NOT `/agents/settings`) — tabs via shadcn `<Tabs>` |
| D-202-12 | MCP tab external server CRUD | Backed by Redis hash `liv:mcp:config` (Phase 109 seed key) — adds/removes spawn the McpBridge `MCPClient` connection at next boot (NOT hot-reload; documented in UI) |
| D-202-13 | Sub-agent depth | Maximum 2 (parent + 1 layer of children). Grandchild dispatch raises runtime error with operator-readable message. |
| D-202-14 | Agent name uniqueness | UNIQUE constraint on `name` column. Form rejects duplicates with inline error. |
| D-202-15 | Schedule cron format | Standard 5-field cron (`min hour dom month dow`). Frontend uses `cronstrue` for human-readable preview. |
| D-202-16 | Run now privilege | Any admin can trigger any agent's "Run now". No per-agent ACL in v202. |
| D-202-17 | Memory inheritance | Sub-agents share the parent Memory instance (Mastra Supervisor default) but get a fresh thread per delegation. Resource ID = `{parentResource}-{subAgentName}`. |
| D-202-18 | Telemetry export | Console (Mastra OTel `export: { type: 'console' }`). External backend = Phase 220+. |
| D-202-19 | Schedule precision | Cron resolution = 1 minute. Sub-minute scheduling not supported. |
| D-202-20 | LIV AI default agent | The original `livAi` (Phase 197-04) stays as the bootstrap agent — it IS persisted in `livos_agents` table on first boot (seeded), but its row is `system: true` and cannot be deleted from the UI (Delete button hidden). |
| D-202-21 | English UI text only | INV-202-05 carries forward INV-201-05 |
| D-202-22 | Sacred SHA | INV-202-01 — every commit passes the hook (20 files) |
| D-202-23 | Backend stays in livinityd | INV-202-02 — Phase 201 invariant carries forward. Subapp adds pages + tRPC calls; backend logic lives in `livos/packages/livinityd/` |
| D-202-24 | Agents page lives in subapp | NOT in `livos/packages/ui/`. Same iframe pattern as Liv AI. `/agents`, `/agents/[id]`, `/agents/new`, `/settings` all under `livos/packages/liv-ai-app/app/` |

## Threat / Invariant Model

| ID | Description |
|----|-------------|
| INV-202-01 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved every commit |
| INV-202-02 | Backend Mastra runtime stays in livinityd — subapp is UI-only tier |
| INV-202-03 | LivOSMastra B-02 lock honoured — only additive (new method / new slot), never restructure the class |
| INV-202-04 | Approval gate (Phase 198-04 W-02) preserved for destructive tool dispatch on all agents — Reject returns REJECTED_TOOL_RESULT sentinel |
| INV-202-05 | English UI text only |
| INV-202-06 | Sub-agent depth ≤ 2 — runtime guard rails reject deeper delegation |
| INV-202-07 | Agent name UNIQUE in DB + form validation |
| INV-202-08 | Mastra MCP source list unchanged (Luse + future MCP servers) — Phase 201 Luse spawn wire preserved |
| INV-202-09 | Phase 200-C 10 built-in tools preserved (weather, luse_list_windows, get_current_time + 7 destructive) — wired into the dynamic tool catalog for every agent |
| INV-202-10 | Phase 201 generative UI renderers FROZEN (tool-renderers.tsx, 11 primitives) — Phase 202 ADDs the OpenUI renderer on top, does NOT modify existing ones |

| Threat | Mitigation |
|--------|-----------|
| T-202-01 (Schedule overlap) | Redis `SET NX PX` lock per agent (`livos:agent:{id}:lock`, TTL = `min(cron-interval - 1m, 1h)`); second invocation bails immediately. Crash-safe via TTL auto-expiry. |
| T-202-02 (Agent name collision) | DB UNIQUE constraint + form validation. Update mutation that would create a duplicate fails with `AGENT_NAME_TAKEN` error code. |
| T-202-03 (Cron injection) | Validate cron string via `node-cron`'s `validate()` before saving. Reject malformed expressions in the tRPC `createAgent` mutation. |
| T-202-04 (Sub-agent recursion) | Database constraint `parent_agent_id IS NULL OR (SELECT parent_agent_id FROM livos_agents WHERE id = parent_agent_id) IS NULL` (enforced at insert time). Runtime double-check in Mastra wire-up. |
| T-202-05 (Telemetry leak) | Console export only — no outbound trace traffic. Trace spans redact `Authorization` headers and `password=...` patterns. |
| T-202-06 (OpenUI XSS) | OpenUI renderer is server-emit / client-render with sanitized whitelist of component types. Free-form HTML is NOT allowed in the OpenUI Lang surface. |
| T-202-07 (Agent privilege escalation) | All agent CRUD mutations require admin JWT. No per-agent ACL in v202; that's a Phase 220+ design point. |
| T-202-08 (Scheduler thunder-herd) | All schedules use 1-minute resolution; node-cron honours cron-syntax jitter naturally. If two agents land on the same minute, node-cron fires sequentially within the same tick. |

## Acceptance Envelope (operator-walkable)

1. **Boot:** `systemctl is-active livos` reports active. `journalctl -u livos` contains `Phase 202 — agent registry loaded with N agents` line.
2. **Default agent seed:** First boot creates the `livAi` row in `livos_agents` with `system=true`. `/agents` page lists it.
3. **Agents list page:** Open `https://bruce.livinity.io/liv-ai-app/agents` (or local dev). Renders a grid of agent cards. `livAi` card shows status badge (idle/running/scheduled).
4. **Create agent form:** Click "+ New Agent" → form opens at `/agents/new`. Fields: name, instructions, model picker (3 Grok variants), tool checkboxes (Luse 17 + Built-in 10 + Sub-agent select), schedule cron picker with cronstrue preview, parent-agent select.
5. **Save:** Submit form → POST creates DB row → dynamic Mastra registry refreshes → new agent appears in list within 2s.
6. **Manual Run now:** Click "Run now" on an agent card → backend creates a thread, runs the agent, returns threadId. SSE chunks render in a live drawer or take user to `/chat?threadId=<id>`. Verifies streaming.
7. **Schedule binding:** Create an agent with cron `*/5 * * * *` and a one-line instruction. Wait 5 minutes. `livos_tasks` (thread metadata) contains a new row triggered by cron. Boot log shows the trigger.
8. **Sub-agent delegation:** Create agent "Coordinator" with `parent_agent_id = NULL` and `tools` including the new sub-agent "Researcher" (whose `parent_agent_id` is the Coordinator's id). Send a task to Coordinator → Mastra Supervisor selects `agent-researcher` tool → child agent thread spawned → both threads visible in `/agents/<coordinator-id>` recent runs view.
9. **Status SSE:** `/agents` page open in two browser tabs. Trigger "Run now" in tab A. Status badge in tab B flips from idle → running → idle without manual refresh. SSE event count > 0 in DevTools.
10. **Settings page MCP tab:** Open `/settings` → click "MCP" tab. Built-in tools (10) group renders (Phase 201-05 panel surface ported). External MCP server section shows Luse (enabled) + an "Add MCP Server" button. Adding a dummy entry persists to Redis `liv:mcp:config` hash.
11. **Generative UI — chart:** Send "show me a sample bar chart" to an agent with a tool named `render_chart`. ToolUI primitive (ported in Phase 201-03) renders a real Recharts bar chart inline. NOT plain JSON.
12. **Generative UI — OpenUI:** Send "design a card for product X" to an agent with `ui_render` tool. Agent emits OpenUI Lang JSON, renderer mounts inline. Card shows correctly.
13. **Browser console:** 0 red errors across pages and chat sessions.

## Wave Plan

**Wave 1 — Backend foundation (depends on nothing)**
- 202-01: Agent registry schema + Drizzle migration + repository
- 202-02: Dynamic Mastra registry + Supervisor wire (sub-agent delegation backend) + LivOSMastra additive extension
- 202-03: Scheduler (node-cron + Redis mutex) + Task tRPC router + agent CRUD tRPC

**Wave 2 — Frontend pages**
- 202-04: `/agents` list page + SSE status hook
- 202-05: `/agents/[id]` detail + edit + recent tasks + Run now
- 202-06: `/agents/new` create form

**Wave 3 — Settings + Generative UI**
- 202-07: `/settings` page (Account, MCP, Models tabs) — MCP tab ports P201-05 panel + adds external server CRUD
- 202-08: OpenUI Lang generative UI integration (`@openuidev/renderer` + `ui_render` tool wire + assistant-ui tool-ui re-wire for missing primitives)

**Wave 4 — Polish + deploy**
- 202-09: Sub-agent tree visualization on detail page + Mastra constructor wrap (telemetry + workflows + evals registration scaffold)
- 202-10: Mini PC deploy + executor smoke tests + 202-VERIFICATION.md + STATE/ROADMAP flip + final commit

## Intra-wave file-overlap

Wave 1: 202-01 touches DB only; 202-02 touches `mastra/` only; 202-03 touches `server/` + `mastra/scheduler.ts` only. Disjoint.

Wave 2: each page is a separate file under `liv-ai-app/app/agents/`. Disjoint.

Wave 3: 202-07 touches `app/settings/` + extends MCP panel from livos/packages/ui; 202-08 touches subapp tool-ui mount + new OpenUI renderer file. Disjoint.

Wave 4: 202-09 touches `index.ts` (LivOSMastra additive) + 1 detail-page component; 202-10 touches deploy scripts + .planning artifacts. Disjoint.

## Skill references (consult during execution)

- `Skill:assistant-ui` — overall architecture / debugging
- `Skill:primitives` — Thread / Composer / Message UI primitives
- `Skill:runtime` — assistant-ui runtime state + thread management
- `Skill:tools` — `makeAssistantToolUI` tool-UI registration and human-in-the-loop
- `Skill:thread-list` — multi-thread management (for the recent-runs view on `/agents/[id]`)
- `Skill:openui` — OpenUI Lang renderer + `defineComponent` (D-202-09 / D-202-10)
- `Skill:senior-frontend` — Next.js + Tailwind + shadcn polish for new pages
- `Skill:frontend-design` — page layout + production-grade polish (avoid generic AI aesthetic)
- `Skill:senior-backend` — Mastra + Drizzle + node-cron + Redis lock idioms

## Deferred to Phase 203+

- Workflow definition + visual editor — case-by-case design with operator
- Eval suite definition + dashboard — needs eval criteria first
- RAG / semantic recall enable — embedder picker decision (OpenAI vs local Ollama)
- External telemetry dashboard (Langfuse / Phoenix / OTLP collector)
- Multi-user agent ownership + per-agent ACL
- Agent marketplace / sharing
- Distributed scheduler (Inngest) for multi-replica deploys
- Sub-agent recursion depth > 2
- WebSocket-based bi-directional real-time (current SSE is one-way)
- Agent versioning + rollback

## Speed budget

| Wave | Estimate | Notes |
|------|----------|-------|
| 1 (202-01..03) | 4-5 hours | DB schema + Mastra wire + scheduler + tRPC routes |
| 2 (202-04..06) | 4-5 hours | 3 Next.js pages + forms + SSE hook |
| 3 (202-07..08) | 3-4 hours | Settings page + OpenUI integration |
| 4 (202-09..10) | 2-3 hours | Tree viz + Mastra constructor wrap + deploy |
| **Total** | **13-17 hours** | Wall-clock for autonomous executor |

If a plan exceeds +50% of its budget, executor MUST stop and surface the blocker.
