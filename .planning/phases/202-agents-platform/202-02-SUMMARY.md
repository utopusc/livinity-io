---
phase: 202-agents-platform
plan: 02
subsystem: mastra-multi-agent
tags: [mastra, multi-agent, supervisor, agent-registry, wave-1]

# Dependency graph
requires:
  - phase: 202-agents-platform
    plan: 01
    provides: livos_agents table + AgentRepository CRUD + livAi seed (system=true)
  - phase: 197-mastra-liv-ai
    provides: LivOSMastra B-02 slot + createLivAiAgent factory + ApprovalGate
  - phase: 198-liv-ai-v2
    provides: createChatRouteHandler — extended in this plan to consume the registry
provides:
  - agent-factory.ts — `createAgentFromRow(row, deps)` builds a Mastra Agent from a livos_agents row
  - agent-registry.ts — `AgentRegistry` class (init / refresh / get / getByName / listAll / rowsAll), two-pass Supervisor wiring, T-202-05 single-flight refresh latch
  - LivOSMastra `.registry` slot + `.attachRegistry(reg)` additive helper (INV-202-03)
  - chat-route.ts dynamic `isAgentAllowed()` allow-list — `livAi` forever-allowed alias + registry-driven multi-agent surface
  - livAi shim — `createLivAiAgent` now delegates to `createAgentFromRow` (back-compat preserved for any direct caller)
affects:
  - 202-03 (scheduler CRUD mutations will call `registry.refresh()` after each create/update/delete)
  - 202-04..06 (frontend pages consume the registry through 202-03's tRPC routes)
  - 202-09 (Mastra constructor wrap will read `livOSMastra.registry.listAll()` to build the `agents:{}` map for `new Mastra({...})`)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-pass Supervisor wiring: pass-1 instantiates every enabled row as a flat Agent; pass-2 walks rows again, REBUILDS any parent with non-empty children list using `agents: {childName: childAgent}` from the pass-1 map. Mastra requires ALREADY-CONSTRUCTED Agent instances in the supervisor map — no row references."
    - "Single-flight refresh coalescing — `inflightRefresh: Promise<void> | null` latch returns the same Promise when a refresh is in flight. N concurrent CRUD mutations from Plan 202-03 coalesce into one rebuild without losing the await-completion contract any caller depends on."
    - "Defense-in-depth depth-2 cap — DB trigger (Phase 202-01 T-202-04 mitigation) rejects depth-3 inserts at write time; AgentRegistry refresh() defensively warns if a 3-deep chain survives anyway (manual SQL bypass, stale rows from before the trigger landed)."
    - "B-02-respecting LivOSMastra extension — class shape change limited to ONE new nullable slot (`registry: AgentRegistry | null = null`) + ONE new attach helper (`attachRegistry(registry)`). Diff of `livos/packages/livinityd/source/modules/mastra/index.ts` is purely additive (~14 lines added, 0 removed)."

key-files:
  created:
    - livos/packages/livinityd/source/modules/mastra/agents/agent-factory.ts
    - livos/packages/livinityd/source/modules/mastra/agents/agent-registry.ts
    - livos/packages/livinityd/source/modules/mastra/agents/agent-registry.test.ts
  modified:
    - livos/packages/livinityd/source/modules/mastra/index.ts (additive — `registry` slot + `attachRegistry` method)
    - livos/packages/livinityd/source/modules/mastra/agents/liv-ai.ts (refactor — `createLivAiAgent` now a shim over `createAgentFromRow`)
    - livos/packages/livinityd/source/modules/mastra/chat-route.ts (allow-list driven by registry)
    - livos/packages/livinityd/source/index.ts (boot wire-up — registry construction + init + livAi back-compat slot double-wire)

key-decisions:
  - "Factory returns a NEW Agent on every invocation — the registry's two-pass algorithm requires the parent to be REBUILT in pass-2 once children exist (Mastra Supervisor needs constructed child instances). No memoization of pass-1 parent agents to avoid stale-tools surface."
  - "Per-row default modelName NOT applied inside the factory's model resolver — would diverge from Phase 199-03 Test 12 contract that liv-ai.test.ts regression-locks (`resolveAgentModel` MUST be called with `undefined` when chat-route hasn't pushed a modelName). row.modelName is reserved for future chat-route resolution: chat-route reads the row from the registry, looks up its modelName, pushes onto RequestContext before agent.stream(). That migration is out of scope for 202-02."
  - "livAi forever-allowed in chat-route — even if the AgentRegistry init fails (DB outage), the legacy `livOSMastra.agents.livAi` slot stays populated by the fallback `createLivAiAgent` path so the P198 frontend keeps working. Removing the literal alias is deferred to a post-202 cleanup once telemetry shows zero legacy-route hits."
  - "Registry pool kept open for the process lifetime — repo holds the drizzle handle through AgentRepository for later `registry.refresh()` calls from Plan 202-03 CRUD mutations. Closing the pool in a `finally` would break that. The pool is single-instance per process; pgInstance.end() runs at livinityd shutdown via the existing graceful-shutdown chain."
  - "Defense-in-depth depth guard logs+continues instead of throwing — the DB trigger already rejects depth-3 at insert time. Throwing in the registry would brick subsequent enabled rows; warning + continuing keeps the rest of the catalog hot while surfacing the violation in logs."

patterns-established:
  - "Mastra Supervisor wire-up = two-pass — pass-1 flat agents, pass-2 parent rebuild with agents:{}. Recipe for any future multi-agent registry."
  - "Single-flight Promise latch — `inflightRefresh: Promise<void> | null` is the simplest coalescing primitive when ordering doesn't matter but de-duplication does. Reusable for any external-state-rebuild pattern."
  - "Forever-allowed literal aliases in dynamic allow-lists — when migrating a hard-coded `Set([...])` to a dynamic registry, keep the original literal in the function body as a free-pass check before consulting the registry. Lets you remove the consumer dependency on the registry being initialised."

requirements-completed: [REQ-202-02]

# Metrics
duration: ~9min
completed: 2026-05-23
---

# Phase 202 Plan 02: Dynamic Mastra Agent Registry + Supervisor Wire + LivOSMastra Additive Extension Summary

**Mastra is now agent-aware** — boot reads every enabled row from `livos_agents`, instantiates each as a Mastra `Agent` via the new `createAgentFromRow` factory, wires parent → children via the Supervisor `agents:{}` map, and exposes the live `Map<id,Agent>` through `LivOSMastra.registry`. CRUD mutations (landing in Plan 202-03) will call `registry.refresh()` to rebuild the in-memory map. T-202-05 single-flight latch coalesces concurrent refresh callers into one rebuild. The pre-202 hard-coded `livAi` chat-route allow-list is replaced by a registry-backed `isAgentAllowed()` check while `livAi` stays a forever-allowed alias for P198 back-compat. The LivOSMastra class shape gains ONE new slot + ONE new method — INV-202-03 B-02 lock fully respected.

## Performance

- **Duration:** ~9 min (executor wall-clock 2026-05-23T13:35Z → 2026-05-23T13:44Z)
- **Started:** 2026-05-23T13:35:54Z
- **Completed:** 2026-05-23T13:44:31Z
- **Tasks:** 5 (Tasks 1-5; Task 6 was the umbrella commit envelope that this plan's per-task atomic commits already satisfy)
- **Files created:** 3 (agent-factory.ts + agent-registry.ts + agent-registry.test.ts)
- **Files modified:** 4 (mastra/index.ts + liv-ai.ts + chat-route.ts + source/index.ts)
- **Tests:** 8 new vitest cases PASS (≥6 required by Task 5 acceptance criteria); 13 prior agent-repository tests still PASS; pre-existing liv-ai.test.ts Test 9 failure unchanged (Phase 200-C built-in shadow issue — pre-existing, not caused by this plan, scope-boundary respected per executor rules)

## Accomplishments

- **`agent-factory.ts`** — `createAgentFromRow(row, deps)` consumes a `LivosAgent` row and returns a Mastra `Agent`. Mirrors the Phase 197-04 livAi factory's wrap order: `filterMcpTools(rawTools) → wrapDestructive(filtered)` merged with `wrapDestructive(builtInTools)` (built-ins shadow MCP entries with the same name — intentional, carried from Phase 198 UAT hot-fix #3). Per-row `toolIds` allow-list applied AFTER both halves are merged so the operator can carve out a subset of the catalog per agent. Supervisor `agents:{}` map plumbed via optional `deps.subAgents` parameter.
- **`agent-registry.ts`** — `AgentRegistry` class with `init / refresh / get / getByName / listAll / rowsAll`. Two-pass refresh: pass-1 builds every enabled row as a flat Agent; pass-2 walks the rows, rebuilds any parent with non-empty children list using the pass-1 child instances. T-202-04 depth-2 cap enforced at runtime (defense in depth over the Phase 202-01 DB trigger). T-202-05 single-flight latch coalesces concurrent refresh callers into one rebuild.
- **`LivOSMastra` extension** — `registry: AgentRegistry | null = null` slot + `attachRegistry(registry)` method. Diff is purely additive — INV-202-03 B-02 lock fully respected. The pre-existing `agents.livAi?` slot is preserved; boot double-wires it from `registry.getByName('livAi')` for the chat-route back-compat window.
- **Boot wire-up in `source/index.ts`** — registry constructed inside the existing Phase 197-05 wire-up block (right after McpBridge + Memory + ApprovalManager are ready), `init()` loads all enabled livos_agents rows + builds Supervisor pairs, then livAi slot populated from `registry.getByName('livAi')`. Legacy single-agent `createLivAiAgent` path kept as fallback so a registry init failure (DB outage, schema drift) still produces a working livAi.
- **`chat-route.ts` allow-list** — pre-202 hard-coded `ALLOWED_AGENT_IDS = new Set(['livAi'])` replaced with `isAgentAllowed(agentId, deps)` that honours every enabled row in `livos_agents` via the registry while keeping `livAi` a forever-allowed literal alias. Agent resolution: `registry.getByName(agentId)` first, fall back to `livOSMastra.agents.livAi` for `livAi` specifically.
- **`liv-ai.ts` shim** — `createLivAiAgent` now a thin wrapper over `createAgentFromRow` that builds an in-memory `LivosAgent` row mirroring the seeded `livAi` system agent. Back-compat for any direct caller; the boot wire-up itself no longer calls this function in the happy path (registry replaces it), but the fallback path still does when registry init fails.
- **8 vitest cases PASS** covering: init populates the live map, refresh idempotent, Supervisor wiring (`agents:{}` on parent), leaf agents constructed without `agents:` key, disabled rows skipped from listAll + Supervisor map, T-202-04 depth > 2 triggers `logger.warn`, T-202-05 single-flight coalesces two concurrent refresh calls into one `repo.listAll()`, accessor coverage (`get / getByName / rowsAll`).

## Task Commits

Each task was committed atomically; sacred SHA hook PASS × 5.

1. **Task 1: Extract `createAgentFromRow` factory + livAi shim** — `ae89e9f1` (feat) — `agent-factory.ts` (new) + `liv-ai.ts` (refactor — `createLivAiAgent` now delegates).
2. **Task 2: AgentRegistry — live Map + Supervisor wire + T-202-05 single-flight** — `7fc306f5` (feat) — `agent-registry.ts` (new).
3. **Task 3: Wire AgentRegistry into LivOSMastra + livinityd boot** — `95e961cd` (feat) — `mastra/index.ts` (additive) + `source/index.ts` (boot wire-up).
4. **Task 4: chat-route allow-list driven by AgentRegistry** — `99e61d6b` (feat) — `chat-route.ts`.
5. **Task 5: Tests (8 cases PASS) + agent-factory model resolver fix** — `c01a0d09` (test) — `agent-registry.test.ts` (new) + `agent-factory.ts` (model-resolver match to P199-03 Test 12 contract).

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit (INV-202-01 PASS × 5).

## Files Created/Modified

### Created

- `livos/packages/livinityd/source/modules/mastra/agents/agent-factory.ts` — `createAgentFromRow(row, deps)` factory + supporting `wrapDestructiveTools` + `applyRowToolFilter` helpers.
- `livos/packages/livinityd/source/modules/mastra/agents/agent-registry.ts` — `AgentRegistry` class with init/refresh/get/getByName/listAll/rowsAll + T-202-05 single-flight latch.
- `livos/packages/livinityd/source/modules/mastra/agents/agent-registry.test.ts` — 8 vitest cases (mock `@mastra/core/agent` + mock `@mastra/mcp` + mock repo).

### Modified

- `livos/packages/livinityd/source/modules/mastra/index.ts` — additive (one slot + one method per INV-202-03).
- `livos/packages/livinityd/source/modules/mastra/agents/liv-ai.ts` — `createLivAiAgent` refactor to delegate to `createAgentFromRow`; `LIV_AI_SYSTEM_PROMPT` + `filterMcpTools` + `wrapDestructiveTools` exports preserved for `liv-ai.test.ts` back-compat.
- `livos/packages/livinityd/source/modules/mastra/chat-route.ts` — `isAgentAllowed` dynamic allow-list + registry-first agent resolution.
- `livos/packages/livinityd/source/index.ts` — `AgentRegistry` import added; boot block extended to construct + init + attach the registry inside the existing 197-05 try/catch.

## Decisions Made

All Plan 202-02 decisions came from `202-CONTEXT.md` (D-202-XX). Execution-level decisions documented above under `key-decisions`. No new design-space decisions had to be made on the fly — the plan template was crisp enough that every code path had a single obvious shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Removed per-row default-modelName forwarding from the factory model resolver**
- **Found during:** Task 5 (test run after liv-ai.ts shim landed)
- **Issue:** Initial draft of `agent-factory.ts` forwarded `row.modelName` as a fallback when `requestContext.get('modelName')` returned undefined. That diverged from the Phase 199-03 Test 12 contract regression-locked in `liv-ai.test.ts`: `resolveAgentModel(undefined)` must be the call shape when chat-route hasn't pushed a modelName. The new behaviour was calling `resolveAgentModel('grok-4.3')` instead.
- **Fix:** Reverted the model resolver to forward `requestContext.get('modelName')` verbatim (may be undefined). Per-row default-model surfacing is deferred to chat-route building the RequestContext from the row's modelName before `agent.stream()` — that migration is out of scope for 202-02.
- **Files modified:** `livos/packages/livinityd/source/modules/mastra/agents/agent-factory.ts`
- **Verification:** liv-ai.test.ts Test 12 PASS (was FAIL); Test 11 + Test 13 still PASS.
- **Committed in:** `c01a0d09` (Task 5 commit — folded with the test file addition).

**2. [Rule 3 — Blocking] Boot wire-up — registry pool kept open for the process lifetime**
- **Found during:** Task 3 (boot wire-up Implementation)
- **Issue:** Plan Task 3's literal sketch instantiated the pg.Pool inline alongside the registry. A naive `await registryPool.end()` in a `finally` clause would break `registry.refresh()` calls from Plan 202-03 CRUD mutations because the repo holds the drizzle handle through AgentRepository.
- **Fix:** Wrapped the pool construction in a try/finally where the `finally` only fires on error (the `void registryPool` no-op guards against unused-variable lint warnings). Pool stays open for the lifetime of the process; shuts down via the existing graceful-shutdown chain. Documented inline.
- **Files modified:** `livos/packages/livinityd/source/index.ts`
- **Verification:** Boot wire-up TypeScript-compiles; pool persists across registry.refresh() calls in agent-registry.test.ts (Test 2 idempotency + Test 7 single-flight).
- **Committed in:** `95e961cd` (Task 3 commit).

### Pre-existing breakage NOT in scope (documented for traceability — not fixed)

- **liv-ai.test.ts Test 9** ("W-02 — destructive tool wrapped; non-destructive passes through") FAILed against `0772c735` (the Plan 202-01 close commit) too — confirmed via `git checkout 0772c735 -- liv-ai.ts && npx vitest run liv-ai.test.ts`. Root cause is the Phase 200-C built-in `luse_computer_screenshot` shadowing the MCP entry of the same name (intentional Phase 198 UAT hot-fix #3 behaviour) — but Test 9 still asserts `screenshot.execute === deps._spies.screenshotExec`, which only holds if the MCP entry survives the shadow. Test 9 needs updating to assert against the built-in's `execute`, or the assertion needs to be reframed as "wrapped destructive tools change reference vs the original ctor". Out of scope for 202-02 (no source file in this plan touches the W-02 wrap order); deferred to a future test-hygiene plan.

---

**Total deviations:** 2 auto-fixed (1 model-resolver regression-lock match + 1 pool-lifetime correctness).
**Impact on plan:** Zero scope creep. Both deviations are correctness or test-contract prerequisites that the plan template anticipated but did not pre-specify. No checkpoint needed.

## Issues Encountered

- The pre-existing working-tree had unrelated modifications under `livos/packages/liv-ai-app/` and a modified `pnpm-lock.yaml` from prior planning sessions. These were left untouched in every commit — only files inside the Phase 202-02 scope were staged via explicit `git add <file>` calls. INV-202-02 (backend stays in livinityd) preserved: every file mutated by this plan lives under `livos/packages/livinityd/`.

## User Setup Required

None — no external service configuration. The registry init runs on the next `systemctl restart livos`. Existing `DATABASE_URL` env var already covers the new query path (registry reuses the `livos` PG database via the Phase 202-01 `AgentRepository`).

## Next Phase Readiness

- **202-03** (scheduler + agent CRUD tRPC) can immediately consume `livOSMastra.registry.refresh()` after each create/update/delete; the dependency graph is satisfied.
- **202-04..06** (frontend pages) read the same registry through 202-03's tRPC routes; no direct backend touch from the subapp tier (INV-202-02 preserved across Wave 2).
- **202-09** (Mastra constructor wrap) will read `livOSMastra.registry.listAll()` to construct the `new Mastra({agents:…, telemetry:…})` instance.

## Self-Check

**Files asserted exist:**
- `livos/packages/livinityd/source/modules/mastra/agents/agent-factory.ts` — FOUND
- `livos/packages/livinityd/source/modules/mastra/agents/agent-registry.ts` — FOUND
- `livos/packages/livinityd/source/modules/mastra/agents/agent-registry.test.ts` — FOUND

**Commits asserted exist:**
- `ae89e9f1` (Task 1) — FOUND
- `7fc306f5` (Task 2) — FOUND
- `95e961cd` (Task 3) — FOUND
- `99e61d6b` (Task 4) — FOUND
- `c01a0d09` (Task 5) — FOUND

**Invariants verified:**
- **INV-202-01** Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved 5/5 (hook `[sacred-sha] PASS: 20 files verified` on every commit).
- **INV-202-02** Every file mutated by this plan lives under `livos/packages/livinityd/`.
- **INV-202-03** LivOSMastra class shape additive only: `git diff 0772c735..HEAD -- livos/packages/livinityd/source/modules/mastra/index.ts` shows ONE new slot (`registry: AgentRegistry | null = null`) + ONE new attach method (`attachRegistry`). All pre-existing fields and methods preserved.
- **INV-202-04** Approval gate preserved — `wrapDestructiveTools` from `agent-factory.ts` mirrors the Phase 197-04 wrap order; destructive tools still ride the ApprovalManager.
- **INV-202-06** Sub-agent depth ≤ 2 enforced at runtime (T-202-04 defense-in-depth `logger.warn` for 3-deep chains) + at DB level (Phase 202-01 trigger).
- **INV-202-07** Agent name UNIQUE preserved (Phase 202-01 DB constraint).
- **INV-202-08** MCP source list unchanged — Luse stays in the catalog via the same `filterMcpTools` allow-list; livAi shim builds in-memory row with `toolIds: []` so the full catalog passes through.
- **INV-202-09** Phase 200-C 10 built-in tools preserved — `builtInTools` import + wrap path is byte-identical to the Phase 197-04 surface (just relocated to agent-factory.ts).
- **INV-202-10** Phase 201 generative UI renderers FROZEN — no file under `livos/packages/liv-ai-app/` or `livos/packages/ui/` touched by this plan.

## Self-Check: PASSED

---
*Phase: 202-agents-platform*
*Plan: 02*
*Completed: 2026-05-23*
