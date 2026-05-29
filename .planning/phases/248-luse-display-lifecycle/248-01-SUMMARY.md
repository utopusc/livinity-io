---
phase: 248
plan: 01
subsystem: livinityd / computer-use / displays
tags: [v44, luse, displays, xephyr, xvfb, redis, owner-scoped, backend-module, tdd]
one_liner: "Backend display-manager factory — Xephyr/Xvfb spawn + :10+ allocator + Redis HSET state + apps LIST + owner-scoped kill; 15/15 vitest GREEN; 0 new typecheck errors; sacred SHA preserved."
status: complete
type: tdd
wave: 1
depends_on: []
requirements: []
dependency_graph:
  requires:
    - phase: 246
      plan: 05
      reason: "ttl-gc.ts DI pattern + setIntervalFn/clearIntervalFn factory shape mirrored verbatim into createDisplayManager (sweepNow analog: scanAllDisplayKeys)"
    - phase: 243
      plan: 01
      reason: "metadata.ts Redis prefix-constant convention copied (PTY_SESSION_REDIS_PREFIX → DISPLAY_REDIS_PREFIX = 'luse:display:')"
  provides:
    - "createDisplayManager factory + DisplayManager runtime type"
    - "DISPLAY_REDIS_PREFIX + redisKeyForDisplay + redisKeyForDisplayApps (drift-locked literals)"
    - "DisplayMode union, DisplayRecord, CreateDisplayInput, KillDisplayResult types"
    - "displays/ module barrel for 248-02 MCP tool registrations"
  affects:
    - "Phase 248-02 (MCP tools — computer_create_display / list / kill / launch_app_in_display) — consumes createDisplayManager + DisplayMode + KillDisplayResult"
    - "Phase 248-03 (TTL GC — 4h idle display sweep) — consumes list() + isOwner() + kill() (with a system 'gc' session ID that owner-bypass for GC is a 248-03 design call)"
tech_stack:
  added: []
  patterns:
    - "DI factory (createDisplayManager(deps): DisplayManager) — mirrors createTtlGc / createSessionManager"
    - "Async initialization seam (mgr.initialized promise) — SCAN-seeds allocator before first create()"
    - "Per-instance in-memory spawn-handle Map + Redis as source-of-truth — handle map is local lifecycle, Redis is global state"
    - "Best-effort process kill — swallows ESRCH so partial-state cleanup doesn't throw mid-DEL"
    - "Drift-lock testing — Map-backed fake Redis + vi.fn spawn pin EXACT literals (DISPLAY_REDIS_PREFIX, allocator start :10, default mode 'xephyr', default geometry 1920x1080)"
key_files:
  created:
    - path: livos/packages/livinityd/source/modules/computer-use/displays/types.ts
      role: "Public type surface (13 interfaces / unions / aliases)"
      lines: 130
    - path: livos/packages/livinityd/source/modules/computer-use/displays/redis-keys.ts
      role: "Drift-locked Redis key helpers + SCAN pattern"
      lines: 28
    - path: livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts
      role: "createDisplayManager factory — owns spawn + allocator + Redis + owner-scope"
      lines: 370
    - path: livos/packages/livinityd/source/modules/computer-use/displays/index.ts
      role: "Module barrel — 5 runtime exports + 13 type re-exports"
      lines: 35
    - path: livos/packages/livinityd/source/modules/computer-use/displays/__tests__/display-manager.test.ts
      role: "15-case vitest suite (14 plan cases + 1 bonus types union)"
      lines: 360
  modified: []
decisions:
  - id: D-248-01-A
    title: "Allocator seeds from Redis SCAN at construction, not at every create()"
    why: "Cross-livinityd-restart continuity without per-call SCAN cost — the seed runs once via `mgr.initialized` promise and the counter increments in-memory thereafter"
  - id: D-248-01-B
    title: "kill() best-effort SIGTERMs every app pid before DEL-ing Redis keys"
    why: "Operator-visible cleanup semantics — Redis state outliving the X server would leak into list() forever; SIGTERM ordering (apps → X server → Redis DEL) matches user-mental-model: 'kill the display + everything in it'"
  - id: D-248-01-C
    title: "list() is global (any session reads); kill() is owner-scoped"
    why: "D-V44-DISPLAY-OWNER-SCOPED honored at the manager layer — other sessions can see another session's displays for awareness/coordination but cannot destroy them. MCP wrappers in 248-02 + TTL GC in 248-03 inherit the policy for free."
  - id: D-248-01-D
    title: "Spawn-handle map is per-DisplayManager-instance (not Redis-backed)"
    why: "ChildProcess handles can't survive process restart anyway; if livinityd restarts, the Xephyr process the prior instance spawned is now an orphan with no way to SIGTERM via the spawn API. Future micro-phase could read PID from Redis HSET and use `process.kill(pid, 'SIGTERM')` for cross-restart kill — deferred to v45+."
metrics:
  duration_seconds: 329
  started_at: "2026-05-29T00:52:05Z"
  completed_at: "2026-05-29T00:57:34Z"
  tasks_completed: 3
  files_created: 5
  files_modified: 0
  commits: 3
  vitest_cases: 15
  drift_locks: 6  # DISPLAY_REDIS_PREFIX, allocator start :10, monotonic +1, default mode xephyr, default WxH, owner-scope deny+allow
---

# Phase 248 Plan 01: Backend Display Module Summary

## Outcome

Shipped the backend foundation for the v44 Luse display-lifecycle ship-train. `createDisplayManager` is now the single chokepoint for nested-X spawn + Redis state + owner-scope policy. Every downstream consumer (248-02 MCP tools, 248-03 TTL GC, 248-04 docs) imports from `displays/index.ts` and inherits the policy correctness drift-locked here.

- **15/15 vitest cases GREEN** in 8ms (vitest 2.1.9, singleThread).
- **0 new typecheck errors** under `computer-use/displays/` (`pnpm tsc --noEmit | grep computer-use/displays | wc -l → 0`).
- **Sacred blob SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** of `liv/packages/core/src/sdk-agent-runner.ts` **preserved** across all 3 implementation commits — pre-commit hook reported `[sacred-sha] PASS: 20 files verified` on every commit.
- **D-V44-DISPLAY-XEPHYR-DEFAULT enforced** at the lowest layer: `create({ownerSession})` with no mode argument defaults to `'xephyr'` and spawns the Xephyr binary (Case 6 drift-locks `spawnHarness.calls[0].cmd === 'Xephyr'`).
- **D-V44-DISPLAY-OWNER-SCOPED enforced** at the lowest layer: `kill({display, callerSession})` reads `owner_session` via Redis HGETALL and refuses with `{ok:false, error:'not-owner'}` when caller mismatches; the X server spawn-handle is NEVER kill'd in that path (Case 11 drift-locks `xHandle.kill not called` + Redis state preserved post-denial).

## The 4 created module files

| File              | Purpose                                                                                          | Lines |
| ----------------- | ------------------------------------------------------------------------------------------------ | ----- |
| `types.ts`        | Public type surface (13 interfaces/unions/aliases)                                               | 130   |
| `redis-keys.ts`   | Drift-locked Redis key helpers + SCAN pattern                                                    | 28    |
| `display-manager.ts` | `createDisplayManager` factory — spawn + allocator + Redis + owner-scope                      | 370   |
| `index.ts`        | Module barrel — 5 runtime exports + 13 type re-exports                                           | 35    |

Plus `__tests__/display-manager.test.ts` (360 lines, 15 vitest cases).

## The 14+1 drift-locked vitest cases

| Case | Suite                              | Drift-locks                                                                                                                                  |
| ---- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | redis-keys                         | `DISPLAY_REDIS_PREFIX === 'luse:display:'`                                                                                                   |
| 2    | redis-keys                         | `redisKeyForDisplay(':12') === 'luse:display::12'` (note: double-colon is intentional — `:12` is the X11 display literal)                    |
| 3    | redis-keys                         | `redisKeyForDisplayApps(':12') === 'luse:display::12:apps'`                                                                                  |
| 4    | allocator                          | Empty Redis → first `create()` returns `:10`                                                                                                 |
| 5    | allocator                          | Second `create()` returns `:11` (monotonic, no reuse)                                                                                        |
| 6    | mode default                       | **D-V44-DISPLAY-XEPHYR-DEFAULT** — `create({ownerSession})` defaults to mode `'xephyr'`, spawns binary `Xephyr`                              |
| 7    | mode opt-in                        | `create({mode:'xvfb'})` spawns binary `Xvfb`                                                                                                  |
| 8    | geometry default                   | Default width=1920 + height=1080 → spawn args contain `'1920x1080'`                                                                          |
| 9    | Redis HSET shape                   | After `create({mode:'xephyr', ownerSession:'s1'})`, HGETALL `luse:display::10` returns 6 fields: `owner_session, mode, created_at, name, width, height` — `created_at` is the ISO of `nowFn()` |
| 10   | list()                             | SCAN-driven aggregation: 2 displays each with their `running_apps` populated from `LRANGE luse:display:<d>:apps`                              |
| 11   | owner-scope deny                   | **D-V44-DISPLAY-OWNER-SCOPED** — `kill({display:':10', callerSession:'s2'})` when `owner_session === 's1'` returns `{ok:false, error:'not-owner'}`; `xHandle.kill` NEVER called; Redis state preserved |
| 12   | owner-scope allow                  | **D-V44-DISPLAY-OWNER-SCOPED** — `kill({display:':10', callerSession:'s1'})` SIGTERMs the X handle, SIGTERMs every app pid via DI'd `processKillFn`, DELs both Redis keys, returns `{ok:true, killed_apps_count:2}` |
| 13   | attachApp                          | `attachApp({display:':10', pid:1234, app_name:'firefox'})` RPUSHes `'1234'` into `luse:display::10:apps` + HSETs `last_app_at` on the display hash |
| 14   | allocator SCAN-seed                | Pre-existing `luse:display::15` in Redis → next `create()` returns `:16` (allocator seeded from highest existing :N + 1)                     |
| 15   | types union                        | `DisplayMode` exports both `'xephyr'` and `'xvfb'` (compile-time + runtime sanity)                                                            |

## Why owner-scope is enforced at the manager layer (not at the MCP wrapper)

MCP wrappers (Phase 248-02) and the TTL GC (Phase 248-03) are policy consumers, not policy authors. Putting the owner-session check inside `createDisplayManager.kill()` means:

1. **248-02 MCP wrappers cannot accidentally violate the policy** — they just forward `callerSession` (the MCP session ID) to `kill()` and trust the typed `KillDisplayResult` discriminated union to surface the denial.
2. **248-03 TTL GC inherits a clean exit path** — if the GC wants to kill ANY idle display regardless of owner, it has to pass a special `callerSession` value (or 248-03 will introduce a `killAsSystem()` admin method); the explicit-bypass requirement prevents an oversight from quietly turning the GC into a global owner-bypass tool.
3. **List operations stay open** — `list()` doesn't take `callerSession` at all; any session can see what displays exist. This matches the v43 PTY-sessions admin model where listing is global and only mutate operations are scoped.

## Next plan (248-02)

Wave 2 — MCP tool registrations under `livos/packages/livinityd/source/modules/computer-use/mcp/`:

- `computer_create_display({name?, mode?:'xephyr'|'xvfb', width?, height?})` → `{display, name}` — forwards to `createDisplayManager.create()`, derives `ownerSession` from the MCP transport's per-connection session ID
- `computer_list_displays()` → `[DisplayRecord]` — forwards to `createDisplayManager.list()`
- `computer_kill_display({display})` → `{ok, killed_apps_count}` — forwards to `createDisplayManager.kill({display, callerSession})`; the `not-owner` error path becomes a structured MCP error response (NOT a thrown exception)
- `computer_launch_app_in_display({display, app, args?})` → `{pid, app_name}` — resolves app via LivOS catalog like `computer_application`, spawns with `DISPLAY=:N` env, then calls `createDisplayManager.attachApp()`
- Extends existing `computer_application` with an optional `display` param

248-02 imports come from `livos/packages/livinityd/source/modules/computer-use/displays/index.ts` (the barrel) — no new computer-use files need to be touched outside `mcp/`.

## Deviations from plan

None — plan executed exactly as written + one test-design fix during GREEN that turned out to be a test bug, not an impl bug.

The original Case 12 test scaffolded a second `mgr2` to inject the `processKillFn` spy, but `mgr2` had its own empty spawn-handle Map (handles are per-instance — D-248-01-D). The fix (still inside Task 2's GREEN commit window) extended the test helper `makeMgr()` to accept `processKillFn` so the spy is injected into the SAME manager that holds the handle. The runtime contract didn't change; only the test scaffolding became consistent with the per-instance handle-map design. Documented in the GREEN commit body.

## Sacred SHA verification

```
git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
→ f3538e1d811992b782a9bb057d1b7f0a0189f95f  (UNCHANGED)
```

Pre-commit hook fired `[sacred-sha] PASS: 20 files verified` on all 3 commits:

- `5ff2f0fb` test(248-01): RED display-manager — drift-locks + create/list/kill/owner-scope
- `f4c42eae` feat(248-01): GREEN display-manager — Xephyr/Xvfb spawn + allocator + Redis state + owner-scoped kill
- `9a72fa99` chore(248-01): typecheck clean + barrel surface verified

## TDD Gate Compliance

- ✅ Task 1 RED — module-not-found error confirmed via `pnpm vitest run` (`Failed to load url ../display-manager.js`), committed
- ✅ Task 2 GREEN — 15/15 vitest pass, committed
- ✅ Task 3 typecheck — 0 errors under displays/, barrel surface verified, committed
- REFACTOR — skipped; 370-line factory has no duplication justifying a refactor commit

## Self-Check

- ✅ All 5 created files exist at the documented paths
- ✅ All 3 commits in `git log --oneline` (5ff2f0fb / f4c42eae / 9a72fa99)
- ✅ vitest: `15 passed (15)` in 8ms
- ✅ tsc --noEmit: 0 errors under `computer-use/displays/`
- ✅ Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved
- ✅ Module is self-contained — zero edits to existing computer-use files (mcp/, native/, luse-tools.ts, index.ts) — 248-02 wave does the MCP wiring
