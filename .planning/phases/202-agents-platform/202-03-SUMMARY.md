---
phase: 202-agents-platform
plan: 03
subsystem: scheduler + agents-trpc
tags: [scheduler, node-cron, redis-mutex, agents-crud, task-lifecycle, trpc, wave-1]

# Dependency graph
requires:
  - phase: 202-agents-platform
    plan: 01
    provides: livos_agents table + AgentRepository CRUD + livAi seed (system=true)
  - phase: 202-agents-platform
    plan: 02
    provides: AgentRegistry + LivOSMastra.attachRegistry additive slot + chat-route allow-list driven by registry
  - phase: 197-mastra-liv-ai
    provides: LivOSMastra B-02 lock + Memory PgStore + ApprovalManager
  - phase: 198-liv-ai-v2
    provides: chat-route HTTP transport at POST /chat/:agentId
provides:
  - AgentScheduler (node-cron + Redis SET NX PX mutex per agent) — init / refresh / runOnce / destroy
  - LivOSMastra.attachScheduler() + .scheduler slot (additive — INV-202-03 B-02 preserved)
  - tRPC agents.* CRUD router (list / get / create / update / delete / runOnce / cronPreview)
  - tRPC agents.tasks.* lifecycle router (create / list / get / cancel)
  - createAppRouter agents + agentTasks DI slots with t.mergeRouters composition
  - 11 new httpOnlyPaths entries (retires v32 P85 publish/unpublish/clone)
  - Boot wire-up: scheduler armed AFTER registry.init() + attached via LivOSMastra; agent + task router factories receive the same NodePgDatabase the registry uses
affects:
  - 202-04 (/agents list page — consumes agents.list + agents.runOnce via tRPC)
  - 202-05 (/agents/[id] — consumes agents.get + agents.update + agents.delete + agents.tasks.list / get / cancel)
  - 202-06 (/agents/new — consumes agents.cronPreview + agents.create)
  - 202-09 (sub-agent tree viz — agents.tasks.* metadata flows from this plan)

# Tech tracking
tech-stack:
  added:
    - cronstrue@^3.14.0 (human-readable cron previews for the create form)
  patterns:
    - "node-cron + Redis SET NX PX lock per agent (T-202-01 mitigation). Lock key livos:agent:{id}:lock, 14-min TTL fallback. Crash-safe via TTL auto-expiry."
    - "tRPC error code mapping pattern: repository propagates raw pg/drizzle errors unchanged; router layer maps to user-facing AGENT_* codes (CONFLICT/AGENT_NAME_TAKEN, BAD_REQUEST/AGENT_DEPTH_EXCEEDED, FORBIDDEN/AGENT_IS_SYSTEM, NOT_FOUND/AGENT_NOT_FOUND, BAD_REQUEST/AGENT_CRON_INVALID)."
    - "Memory thread-as-task-record (D-202-05): no separate livos_tasks table; Mastra Memory.saveThread + listThreads filter by metadata.agentId covers list/get/cancel surfaces."
    - "Factory-DI tRPC router pattern: createAgentRouter / createAgentTaskRouter mirror Phase 103-01 chromeMaster + 196-01 xaiAuth + 197-05 mastra DI shape. createAppRouter slots default to undefined → empty stub fallback so type inference stays stable on a degraded boot."
    - "Cross-router namespace merge: agents = t.mergeRouters(crud, router({tasks})) — single namespace, two source files, no procedure-name collision."
    - "Fire-and-forget background drain: runOnce returns threadId synchronously; agent.stream() runs in the background and writes its result through Memory; failures logged via logger.warn but never propagate."

key-files:
  created:
    - livos/packages/livinityd/source/modules/mastra/scheduler.ts
    - livos/packages/livinityd/source/modules/mastra/scheduler.test.ts
    - livos/packages/livinityd/source/modules/server/trpc/agent-router.ts
    - livos/packages/livinityd/source/modules/server/trpc/agent-task-router.ts
  modified:
    - livos/packages/livinityd/source/modules/mastra/index.ts (additive — scheduler slot + attachScheduler method)
    - livos/packages/livinityd/source/modules/server/trpc/common.ts (retires v32 P85 paths; adds 11 Phase 202 paths)
    - livos/packages/livinityd/source/modules/server/trpc/index.ts (new agents + agentTasks slots + mergeRouters composition under agents namespace)
    - livos/packages/livinityd/source/index.ts (boot wire-up — AgentScheduler init after registry.init; createAgentRouter / createAgentTaskRouter factories instantiated with shared NodePgDatabase)
    - livos/packages/livinityd/package.json (cronstrue dep)
    - livos/pnpm-lock.yaml (cronstrue resolution)

key-decisions:
  - "TTL strategy uses a single conservative 14-minute fallback for every cron expression rather than per-cron computation. Rationale: D-202-19 locks cron resolution at 1 minute and v202 is explicitly single-host (multi-replica deferred to Phase 220+ Inngest design), so two ticks of any cron schedule cannot start within 60s on the same process. The 14-min TTL safely covers any cadence ≥ 15 min and provides crash-safe auto-expiry without per-row arithmetic complexity."
  - "Fire-and-forget agent.stream() drain. runOnce() returns the threadId synchronously (the Memory thread exists before the function returns) and the actual stream drain runs in a background task. This makes the tRPC mutation response shape match the UI's expectation (Run Now → toast → navigate to /chat?threadId=...) without blocking on the long-lived stream."
  - "Cancellation is metadata-only in v202-03. agents.tasks.cancel writes metadata.cancelled=true via Memory.updateThread; the runner-side polling loop that actually halts a mid-stream run lands in Plan 202-09 (WorkflowExecutor wave). This ships the surface so the UI Cancel button can wire today; the runner honour gate is the next plan's responsibility — documented in the router's JSDoc."
  - "agents namespace fully retires the v32 P85 marketplace publish/unpublish/clone paths. common.ts no longer lists those four; the v32-redo marketplace surface lives under marketplace.* (already documented at line 297-313 of common.ts). No back-compat shim needed because the v32 marketplace router was already detached."
  - "Empty-stub fallback for the agents namespace when livOSMastra or agentsRepoForRouter is null. createAppRouter composes `router({})` as the fallback so the rest of the appRouter still type-infers and serves — degradation is per-namespace, not whole-tRPC."
  - "agent-router calls livOSMastra.scheduler?.refresh() AND livOSMastra.registry?.refresh() in parallel via Promise.allSettled after every mutation. Best-effort: failures are logged but never roll back the persisted DB write. The DB row is the source of truth; the in-memory caches reconcile on next refresh tick or restart."

patterns-established:
  - "Redis SET NX PX overlap mutex: `livos:agent:{id}:lock` with conservative 14-min TTL. Returns 'OK' on acquire / null on contention; finally-block del() releases on success. Crash-safe via TTL — no cleanup required if the process dies mid-run."
  - "tRPC error mapping function: single mapRepoError(err) helper that scans the raw DB error message via regex and surfaces the right TRPCError code + AGENT_* message string. Keeps router procedure bodies tight (one mapRepoError(err) catch per route)."
  - "Memory thread-as-task: D-202-05 task records are first-class Memory threads keyed by `task-{agentId}-{timestamp}-{rand}`. Future task-cancellation runner reads metadata.cancelled inside its stream polling loop (Plan 202-09)."

requirements-completed: [REQ-202-03]

# Metrics
duration: ~40min
completed: 2026-05-23
---

# Phase 202 Plan 03: Scheduler + Agent CRUD tRPC + Task Lifecycle Routes Summary

**Wave 1 of Phase 202 closes:** node-cron + Redis SET NX PX scheduler arms cron tasks for every enabled `livos_agents` row at boot; tRPC `agents.*` CRUD router exposes 7 procedures (list/get/create/update/delete/runOnce/cronPreview) under the existing httpOnly transport; `agents.tasks.*` task lifecycle router exposes 4 more (create/list/get/cancel) via Mastra Memory threads as the task record. LivOSMastra picks up its second additive slot in two plans (`scheduler`) — INV-202-03 B-02 lock still respected.

## Performance

- **Duration:** ~40 min (executor wall-clock 2026-05-23T06:23Z → 2026-05-23T07:04Z)
- **Started:** 2026-05-23T06:23Z
- **Completed:** 2026-05-23T07:04Z
- **Tasks:** 7 (cronstrue install, AgentScheduler, agents-router, agents-tasks-router, boot wire-up, tests, this summary commit)
- **Files created:** 4 (scheduler.ts + scheduler.test.ts + agent-router.ts + agent-task-router.ts)
- **Files modified:** 5 (mastra/index.ts + trpc/common.ts + trpc/index.ts + source/index.ts + package.json + lockfile)
- **Tests:** 8 new vitest cases PASS (Plan task acceptance required ≥5); sibling agent-registry (8) + agent-repository (13) tests still PASS — 21 cumulative cases hot.

## Accomplishments

- **`AgentScheduler` class** — `init / refresh / runOnce / destroy` shape. `init()` reads every row via `repo.listAll()`, filters to enabled + has-cron + valid-cron, and arms a `node-cron.schedule()` per row. The cron handler attempts `redis.set(lockKey, '1', 'PX', ttl, 'NX')`; if the prior run is still active (NX returns null) the handler logs + bails. On successful acquire, `runOnce(agentId, 'cron')` fires; the finally block releases via `redis.del(lockKey)`. Crash-safe via TTL auto-expiry.
- **`runOnce()` surface** — creates a Mastra Memory thread synchronously (so list/get see the task immediately) keyed `task-{agentId}-{ts}-{rand}` with metadata `{taskId, agentId, agentName, triggeredBy, triggeredAt, parentTaskId?}` (D-202-05). Background `agent.stream()` drain writes the run result through Mastra Memory; failures are logged via `logger.warn` but never propagate. `runOnce()` accepts an optional `overridePrompt` so `agents.tasks.create({agentId, prompt})` can dispatch a custom prompt instead of `row.instructions`.
- **`LivOSMastra.attachScheduler()`** — additive slot + helper (INV-202-03). The class shape gains ONE new nullable field + ONE new attach method. Diff of `livos/packages/livinityd/source/modules/mastra/index.ts` is purely additive (~16 lines added, 0 removed).
- **`agents.*` tRPC router** — 7 adminProcedure routes:
  - `list` / `get` — pure repo reads
  - `create` — `name`/`instructions`/`modelName`/`toolIds`/`scheduleCron`/`parentAgentId`/`enabled` zod-gated; `id` auto-minted via `crypto.randomUUID()` when absent; success triggers `registry.refresh()` + `scheduler.refresh()` in parallel (Promise.allSettled; failures logged but don't unwind the mutation).
  - `update` — partial `patch` object; same dual refresh after success.
  - `delete` — repository enforces `system=true` lockout (D-202-20); router maps to `FORBIDDEN + AGENT_IS_SYSTEM`.
  - `runOnce` — delegates to `scheduler.runOnce(id, 'manual')`; returns `{threadId}`. Returns `PRECONDITION_FAILED + AGENT_SCHEDULER_UNAVAILABLE` when the scheduler is null (registry init path errored out).
  - `cronPreview` — `cron.validate()` + `cronstrue.toString()` for the form's live preview.
- **`agents.tasks.*` tRPC router** — 4 adminProcedure routes:
  - `create({agentId, prompt?})` — wraps `scheduler.runOnce(agentId, 'manual', {overridePrompt})`. Returns `{threadId}`.
  - `list({agentId?, limit?})` — `Memory.listThreads({filter: {resourceId:'system', metadata:{agentId?}}})`; returns `TaskSummary[]` with status derived from `metadata.cancelled` / `metadata.status` / default `'completed'`.
  - `get({threadId})` — `Memory.getThreadById` + `Memory.recall` returns full message list.
  - `cancel({threadId})` — writes `metadata.cancelled=true` via `Memory.updateThread`. Runner-side honour (mid-stream halt) is deferred to Plan 202-09 (documented in JSDoc).
- **DB-level error → user-facing code mapping** — single `mapRepoError(err)` helper covers:
  - `unique_violation` → `CONFLICT + AGENT_NAME_TAKEN` (T-202-02)
  - `Sub-agent depth > 2` → `BAD_REQUEST + AGENT_DEPTH_EXCEEDED` (T-202-04)
  - `system agent ... cannot be deleted` → `FORBIDDEN + AGENT_IS_SYSTEM`
  - `agent ... not found` → `NOT_FOUND + AGENT_NOT_FOUND`
- **`common.ts` httpOnlyPaths** — retires the four v32 P85 paths (`agents.publish` / `agents.unpublish` / `agents.clone`) which are no longer mounted under any router, and adds the 11 Phase 202 paths (CRUD + runOnce + cronPreview + tasks.*). Updated inline comment explains the retirement.
- **`createAppRouter` slots** — `agents?` and `agentTasks?` factory-DI slots mirror the existing `mastra?` / `chromeMaster?` / `xaiAuth?` / `setup?` pattern. The namespace mount combines them via `t.mergeRouters(opts.agents, router({tasks: opts.agentTasks}))` so `agents.list` and `agents.tasks.list` both resolve correctly. When either factory is missing, the namespace falls back to an empty `router({})` stub so the rest of the appRouter still type-infers.
- **Boot wire-up** — `AgentScheduler` is constructed inside the existing Phase 197-05 wire-up block right after `registry.init()` + `attachMemory` + `attachMcpBridge` + `attachRegistry` succeed. It borrows `this.ai.redis` for the mutex. Failures are non-fatal — scheduler stays null and the `agents.runOnce` / `agents.tasks.create` routes return PRECONDITION_FAILED until the next restart. Agent + task router factories are then instantiated outside the inner registry try-block (hoisted `agentsRepoForRouter: AgentRepository | null = null` carries the registry's repo across the scope) and passed into `createAppRouter` via the new slots.
- **8 vitest cases PASS** covering init/refresh idempotency, T-202-03 invalid-cron skip+warn, T-202-01 lock contention (set/del semantics), runOnce metadata + stream dispatch shape, runOnce missing-row throw, overridePrompt dispatch.

## Task Commits

Each task was committed atomically; sacred SHA hook PASS × 6 (Tasks 1, 2, 3, 4, 5, 6 — Task 7 is this docs commit).

1. **Task 1: chore — cronstrue dep** — `02a118eb` — `livos/packages/livinityd/package.json` + `pnpm-lock.yaml`
2. **Task 2: AgentScheduler + LivOSMastra additive slot** — `c0d6958c` (feat) — `scheduler.ts` + `mastra/index.ts`
3. **Task 3: tRPC agents.* CRUD router** — `067c60b3` (feat) — `agent-router.ts` + `common.ts` (httpOnlyPaths)
4. **Task 4: tRPC agents.tasks.* lifecycle router + trpc/index.ts mount** — `31b3916a` (feat) — `agent-task-router.ts` + `trpc/index.ts`
5. **Task 5: Boot wire-up — scheduler.init() + router factory instances** — `a75d6abd` (feat) — `livos/packages/livinityd/source/index.ts`
6. **Task 6: Tests — 8 cases PASS** — `e5789829` (test) — `scheduler.test.ts`

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit (INV-202-01 PASS × 6).

## Files Created/Modified

### Created
- `livos/packages/livinityd/source/modules/mastra/scheduler.ts` — `AgentScheduler` class with `init / refresh / runOnce / destroy` (~340 lines incl. JSDoc).
- `livos/packages/livinityd/source/modules/mastra/scheduler.test.ts` — 8 vitest cases (mocks node-cron + Redis + Memory + Mastra Agent).
- `livos/packages/livinityd/source/modules/server/trpc/agent-router.ts` — 7 adminProcedure routes + `mapRepoError` helper + `generateAgentId` server-side id mint.
- `livos/packages/livinityd/source/modules/server/trpc/agent-task-router.ts` — 4 adminProcedure routes + `deriveStatus` heuristic.

### Modified
- `livos/packages/livinityd/source/modules/mastra/index.ts` — additive `scheduler: AgentScheduler | null = null` slot + `attachScheduler()` helper (INV-202-03 B-02 preserved).
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — retires v32 P85 `agents.publish/unpublish/clone`; adds 11 Phase 202 paths (CRUD + runOnce + cronPreview + tasks.* × 4) with updated rationale comment.
- `livos/packages/livinityd/source/modules/server/trpc/index.ts` — new `agents?` + `agentTasks?` factory slots in `createAppRouter`; composes via `t.mergeRouters` under the `agents` namespace; falls back to `router({})` when either is missing.
- `livos/packages/livinityd/source/index.ts` — AgentScheduler init inside the existing 197-05 wire-up block; hoisted `agentsRepoForRouter` so the post-mastra block can build the router factory instances; both routers passed into `createAppRouter` via the new slots.
- `livos/packages/livinityd/package.json` — `cronstrue: ^3.14.0` added.
- `livos/pnpm-lock.yaml` — cronstrue resolution.

## Decisions Made

All Plan 202-03 decisions came from `202-CONTEXT.md` (D-202-04, D-202-05, D-202-13/14/15/16/19/20 + T-202-01/02/03/04/07 + INV-202-01/02/03). Execution-level choices documented above under `key-decisions`. No design-space decisions had to be made on the fly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Block-comment `*/` literal in JSDoc broke parser**
- **Found during:** Task 2 (first typecheck of scheduler.ts)
- **Issue:** A JSDoc paragraph documenting sub-15-minute cron cadences literally embedded `*/2 * * * *` inside the block comment, which TypeScript parses as comment-end. Whole `lockTtlForCron` method body was treated as top-level expression statements → 30+ TS errors.
- **Fix:** Rewrote the offending sentence to use the prose phrase "once-every-2-min" instead of the literal cron expression. JSDoc parser no longer trips over the `*/` token.
- **Files modified:** `livos/packages/livinityd/source/modules/mastra/scheduler.ts`
- **Verification:** `npx tsc --noEmit` clean for scheduler.ts.
- **Committed in:** `c0d6958c` (Task 2 commit — fix folded inline before commit landed).

**2. [Rule 3 — Blocking] `agentsRepoForRouter` scope hoist**
- **Found during:** Task 5 (boot wire-up)
- **Issue:** The repository instance the registry constructs is the same one the router factories need; both must be reachable at the `createAppRouter({...})` call site. Initial draft declared `agentsRepoForRouter` inside the inner registry try-block, so it was out of scope where `createAppRouter` runs.
- **Fix:** Hoisted `let agentsRepoForRouter: AgentRepository | null = null` to the outer mastra wire-up scope (same level as `mastraRouterProductionInstance`). The inner try-block assigns it on success. Outer scope reads it to build the routers.
- **Files modified:** `livos/packages/livinityd/source/index.ts`
- **Verification:** `npx tsc --noEmit` clean for source/index.ts.
- **Committed in:** `a75d6abd` (Task 5 commit — fix folded inline before commit).

**3. [Rule 2 — Missing Critical] v32 P85 `agents.*` legacy paths retired in `common.ts`**
- **Found during:** Task 3 (httpOnlyPaths edit)
- **Issue:** The pre-202 v32 P85 marketplace surface registered `agents.publish` / `agents.unpublish` / `agents.clone` paths that are no longer mounted under any router (the v32-redo marketplace router lives under `marketplace.*`). Leaving them in `httpOnlyPaths` would prevent the new Phase 202 surface from cleanly owning the `agents.*` namespace and would confuse future grep-based audits of dead paths.
- **Fix:** Retired the three dead paths; added Phase 202 entries (`agents.runOnce` / `agents.cronPreview` / `agents.tasks.{create,list,get,cancel}`) alongside the kept `agents.list/get/create/update/delete`. Updated the inline comment to explain the retirement.
- **Files modified:** `livos/packages/livinityd/source/modules/server/trpc/common.ts`
- **Verification:** Grep confirms only Phase 202 `agents.*` paths remain in `common.ts`; no router exports the retired paths.
- **Committed in:** `067c60b3` (Task 3 commit).

### Pre-existing breakage NOT in scope (documented for traceability — not fixed)

- **`server/trpc/index.ts` WebSocketServer type-conflict** — `tsc --noEmit` reports `import("@types/ws").WebSocketServer is not assignable to ...` at the WSS handler. Pre-existing — confirmed by `git stash && tsc --noEmit` before this plan landed. Out of scope for 202-03 (none of this plan's source files touch the WS handler — they all live under `server/trpc/` adjacent files or under `mastra/`). Deferred.
- **`scheduler/routes.ts` `ctx.livinityd` possibly undefined** — three pre-existing diagnostics under `scheduler/routes.ts` (Phase 20 backup scheduler, unrelated to this plan's mastra-scheduler). Out of scope.

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking scope hoist, 1 critical-housekeeping path retirement). **Zero scope creep.**

## Issues Encountered

- The pre-existing working-tree had unrelated modifications under `livos/packages/liv-ai-app/` (Phase 198 follow-up work) and a modified `pnpm-lock.yaml`. These were left untouched in every commit — only files inside the Phase 202-03 scope were staged via explicit `git add <file>` calls. INV-202-02 (backend stays in livinityd) preserved: every file mutated by this plan lives under `livos/packages/livinityd/` (`package.json` + `pnpm-lock.yaml` are workspace-root files, the lockfile mutation is the unavoidable side effect of `pnpm add cronstrue`).

## User Setup Required

None — no external service configuration. cronstrue resolves from npm. The new `agents.*` tRPC namespace is live on the next `systemctl restart livos`. Existing `REDIS_URL` env var already covers the Redis mutex namespace (`livos:agent:*` keys are short-lived; no manual ACL needed).

## Next Phase Readiness

- **Wave 2 (202-04 / 202-05 / 202-06)** — every page consumes the new tRPC routes:
  - `/agents` list → `agents.list` + `agents.runOnce`
  - `/agents/[id]` detail → `agents.get` + `agents.update` + `agents.delete` + `agents.tasks.list` + `agents.tasks.get` + `agents.tasks.cancel`
  - `/agents/new` create form → `agents.cronPreview` (debounced) + `agents.create`
- **202-09** (sub-agent tree viz) — reads `agents.tasks.list` filtered by `metadata.parentTaskId` to build the parent→child tree. Plan 202-03 already populates that metadata field in `scheduler.runOnce` when called with `{parentTaskId}`.
- **Plan 202-09 follow-up** — the `agents.tasks.cancel` runner-side honour (mid-stream halt) requires extending the agent.stream() loop to poll thread metadata. Documented inline in `agent-task-router.ts`'s JSDoc.

## Self-Check

**Files asserted exist:**
- `livos/packages/livinityd/source/modules/mastra/scheduler.ts` — FOUND
- `livos/packages/livinityd/source/modules/mastra/scheduler.test.ts` — FOUND
- `livos/packages/livinityd/source/modules/server/trpc/agent-router.ts` — FOUND
- `livos/packages/livinityd/source/modules/server/trpc/agent-task-router.ts` — FOUND

**Commits asserted exist:**
- `02a118eb` (Task 1 chore) — FOUND
- `c0d6958c` (Task 2 feat scheduler) — FOUND
- `067c60b3` (Task 3 feat agents-router) — FOUND
- `31b3916a` (Task 4 feat agents-tasks-router) — FOUND
- `a75d6abd` (Task 5 feat boot wire-up) — FOUND
- `e5789829` (Task 6 test) — FOUND

**Invariants verified:**
- **INV-202-01** Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved 6/6 (`[sacred-sha] PASS: 20 files verified` on every commit).
- **INV-202-02** Every file mutated by this plan lives under `livos/packages/livinityd/` (or the workspace-root `pnpm-lock.yaml` as the unavoidable `pnpm add` side effect).
- **INV-202-03** LivOSMastra class shape additive only: `git diff c01a0d09..HEAD -- livos/packages/livinityd/source/modules/mastra/index.ts` shows ONE new slot (`scheduler: AgentScheduler | null = null`) + ONE new attach method (`attachScheduler`). All pre-existing fields and methods preserved.
- **INV-202-04** Approval gate preserved — none of this plan's files touch `wrapToolWithApproval`. Phase 202-02's `createAgentFromRow` (which wraps destructive tools) is the canonical surface; scheduler.runOnce dispatches the already-wrapped Agent built by the registry.
- **INV-202-07** Agent name UNIQUE — preserved at DB level (Phase 202-01 constraint) and surfaced through `agent-router.ts` as `CONFLICT + AGENT_NAME_TAKEN`.

## Self-Check: PASSED

---
*Phase: 202-agents-platform*
*Plan: 03*
*Completed: 2026-05-23*
