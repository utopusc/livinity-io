---
phase: 248
plan: 03
subsystem: livinityd / computer-use / displays
tags: [v44, luse, displays, ttl-gc, idle-sweep, owner-impersonation, di-timer, tdd]
one_liner: "TTL GC for idle nested displays — 1h sweep / 4h idle threshold — owner-impersonation lift so GC can kill any stale display; wired into mcp/server.ts main() with beforeExit handler; 8/8 vitest GREEN; 0 new typecheck errors; sacred SHA preserved; boot smoke confirms (displayTtlGc=null) fail-closed branch."
status: complete
type: tdd
wave: 2
depends_on:
  - 248-01
requirements: []
dependency_graph:
  requires:
    - phase: 246
      plan: 05
      reason: "ttl-gc.ts factory pattern mirrored verbatim (DI'd setIntervalFn/clearIntervalFn/nowFn/logger; idempotent start; null-safe stop; sweepNow returns kill count). 248-03 is the displays-side analog of 246-05's pty-sessions-side TTL GC."
    - phase: 248
      plan: 01
      reason: "createDisplayManager + DisplayRecord (+ owner_session field) + KillDisplayResult discriminated union are the surface the TTL GC reads list() / kill() through. last_app_at field added to DisplayRecord by this plan as an additive types.ts change (the field was already written by attachApp in 248-01, just not surfaced through list() until now)."
  provides:
    - "createDisplayTtlGc factory + IdleDisplaySweep type + 2 drift-lock constants (DISPLAY_TTL_GC_DEFAULT_IDLE_MS / DISPLAY_TTL_GC_DEFAULT_SWEEP_MS)"
    - "DisplayRecord.last_app_at?: string (additive — already written by attachApp; this plan surfaces it through list())"
    - "Boot wiring in mcp/server.ts main() — TTL GC constructed when displayManager is wired, started AFTER server.connect(transport), stopped on process beforeExit"
    - "Boot log line extended with (displayTtlGc=started|null) — operator probe shape for 248-05"
  affects:
    - "Phase 248-04 (docs/luse/DISPLAY-LIFECYCLE.md) — documents the 4h idle threshold so agents know their displays will survive multi-hour UAT walks but get reclaimed beyond that"
    - "Phase 248-05 (Mini PC deploy + probes) — operator greps journalctl for 'display-ttl-gc: started' as the single-line probe that the TTL GC wiring landed; absence indicates either displayManager=null (redis unreachable) or pre-248-03 binary"
tech_stack:
  added: []
  patterns:
    - "DI'd timer factory (createDisplayTtlGc(deps): IdleDisplaySweep) — verbatim port of Phase 246-05 createTtlGc"
    - "Owner-impersonation lift — TTL GC reads owner_session off each record and passes it BACK into kill() as callerSession, bypassing the user-facing D-V44-DISPLAY-OWNER-SCOPED check in a well-scoped in-process code path the test suite drift-locks"
    - "Best-effort kill — ok:false discriminated-union results AND thrown exceptions are silently swallowed; only ok:true kills count toward the return value (most common ok:false case: display vanished between list() and kill())"
    - "Idempotent start / null-safe stop — second start() clears the prior interval handle (no leak); stop() before any start() or twice is a no-op"
    - "Process exit handler (process.on('beforeExit')) — ensures vitest / dev restarts don't leak the 1h wall-clock interval"
key_files:
  created:
    - path: livos/packages/livinityd/source/modules/computer-use/displays/display-ttl-gc.ts
      role: "createDisplayTtlGc factory + IdleDisplaySweep type + 2 drift-lock constants"
      lines: 120
    - path: livos/packages/livinityd/source/modules/computer-use/displays/__tests__/display-ttl-gc.test.ts
      role: "8-case vitest suite drift-locking constants + sweep + lifecycle + best-effort + audit"
      lines: 286
  modified:
    - path: livos/packages/livinityd/source/modules/computer-use/displays/types.ts
      role: "Additive: DisplayRecord gains optional last_app_at?: string"
      lines: 6
    - path: livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts
      role: "Additive: list() surfaces last_app_at when present in the Redis hash"
      lines: 3
    - path: livos/packages/livinityd/source/modules/computer-use/displays/index.ts
      role: "Barrel re-exports the 3 new runtime symbols + 2 types"
      lines: 7
    - path: livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
      role: "Boot wiring — createDisplayTtlGc construction, start() after server.connect, beforeExit handler, boot log line extension"
      lines: 32
decisions:
  - id: D-248-03-A
    title: "Owner-impersonation lift instead of admin escape method"
    why: "Two viable shapes: (1) impersonate owner_session by reading it off each record and passing it back into kill() as callerSession (chosen), or (2) extend DisplayManager with an admin killAsSystem() method that skips the owner-scope check entirely. The plan called out both — chose (1) because it requires zero new surface on DisplayManager (the existing kill() contract is sufficient), reuses the existing test infrastructure, and the 'system' identity is implicit in the in-process code path (the only caller that ever passes record.owner_session BACK to kill() is the TTL GC itself). Future v45+ refinement noted in module doc-comment: if a second admin caller surfaces, promote to killAsSystem() so the bypass becomes type-visible."
  - id: D-248-03-B
    title: "TTL GC starts AFTER server.connect(transport), not before"
    why: "If server.connect throws (transport setup failure, bad stdin/stdout, etc.), starting the TTL GC first would leak the 1h interval handle — the process would either hang on the unref'd interval or exit with the handle dangling. Starting after connect means failed boots never reach the start() line, and successful boots get the GC armed for the rest of the process lifetime. Symmetric with the beforeExit handler — both lifecycle hooks live on the same side of the connect call."
  - id: D-248-03-C
    title: "DisplayRecord.last_app_at surfaced through list() as an additive types.ts change in 248-03 (not retro-patched into 248-01)"
    why: "The field is already WRITTEN by attachApp() at the manager layer (248-01 display-manager.ts:351). The 248-01 list() just didn't surface it through the typed return. Adding the field to types.ts + populating it through list() is additive (no test breakage in 248-01), keeps the change scoped to where it's first needed (the TTL GC), and avoids touching the 248-01 SUMMARY's drift-lock claims about the 15 vitest cases. Future readers can see the field's add-trail in 248-03's git log without needing to re-read 248-01."
  - id: D-248-03-D
    title: "Best-effort ok:false handling — silently swallowed, does NOT count toward kill total"
    why: "The most common ok:false case is 'not-found' when a display vanishes between list() and kill() (operator killed it manually, owner session called computer_kill_display, etc.). Treating that as a kill (counting it) would inflate the audit count and trip alerting; treating it as an error (re-throwing) would crash the interval handler and leak. Silently swallowing matches the same best-effort semantic the manager itself uses for SIGTERM-during-display-teardown."
metrics:
  duration_seconds: 249
  started_at: "2026-05-29T01:13:30Z"
  completed_at: "2026-05-29T01:17:39Z"
  tasks_completed: 3
  files_created: 2
  files_modified: 4
  commits: 3
  vitest_cases_new: 8
  vitest_cases_displays_total: 23
  drift_locks: 4  # 2 constant literals + 1 owner-impersonation kill payload + 1 audit log shape
---

# Phase 248 Plan 03: Display TTL GC Summary

## Outcome

Closed the v44 display-lifecycle loop opened by 248-01 (backend manager) + 248-02 (MCP tools): a TTL GC now runs inside every Luse MCP child process whose Redis client could be constructed, sweeping every 1 hour and killing any nested display whose most-recent app activity (or creation time, if no app was ever attached) is older than 4 hours. An AI agent that creates a Xephyr display for a UAT walk and forgets to call `computer_kill_display` no longer leaves Xephyr/Xvfb processes + Redis state lingering — the worst-case lifetime is now bounded at 4 hours plus the next sweep tick.

- **8/8 vitest cases GREEN** in 6ms (vitest 2.1.9, singleThread).
- **23/23 cumulative cases GREEN under displays/** (15 from 248-01 display-manager + 8 from 248-03 display-ttl-gc).
- **41/41 cumulative cases GREEN under computer-use/** (15 display-manager + 8 display-ttl-gc + 18 tools.test.ts from 248-02).
- **0 new typecheck errors** under `computer-use/displays/` or `computer-use/mcp/` (`pnpm tsc --noEmit | grep -E '(displays/|computer-use/mcp/server\.ts)' | wc -l → 0`).
- **Sacred blob SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** of `liv/packages/core/src/sdk-agent-runner.ts` **preserved** across all 3 commits — pre-commit hook reported `[sacred-sha] PASS: 20 files verified` on every commit.
- **Boot smoke verified** — `LUSE_REDIS_URL='' pnpm tsx source/modules/computer-use/mcp/server.ts < /dev/null` emits the fail-closed log line `[luse-mcp] connected via stdio transport (redis=null, create_stream gated off) (displayManager=null) (displayTtlGc=null)`, proving the null-branch leaks no interval handle.

## The 4 drift-locks

### Constants (Cases 1+2)

| Constant                          | Exact literal       | Value         |
| --------------------------------- | ------------------- | ------------- |
| `DISPLAY_TTL_GC_DEFAULT_IDLE_MS`  | `4 * 60 * 60 * 1000` | `14_400_000`  |
| `DISPLAY_TTL_GC_DEFAULT_SWEEP_MS` | `60 * 60 * 1000`    | `3_600_000`   |

The 4h idle threshold is **different** from PTY's 24h (Phase 246-05 `TTL_GC_DEFAULT_IDLE_MS`). Rationale: nested X servers are much heavier than PTYs (Xephyr/Xvfb processes, app subprocesses inside them, Redis state per running app), so a shorter idle window bounds the worst-case resource hold while still giving an AI agent room for multi-step UAT walks + batch screenshot runs. The 1h sweep cadence matches Phase 246 for consistency — operators only need to remember one number.

### Owner-impersonation kill payload (Case 3)

```typescript
// For every stale record:
displayManager.kill({
  display: r.display,
  callerSession: r.owner_session,  // ← LIFT
})
```

The TTL GC reads `owner_session` off each `DisplayRecord` and passes it back into `kill()` as `callerSession`, bypassing the user-facing `D-V44-DISPLAY-OWNER-SCOPED` check in a well-scoped in-process code path. The fake test fixture (`makeDisplayManager`) records the exact `{display, callerSession}` payload via `vi.fn`, and Case 3 pins the literal — drift in the impersonation logic would fail the test.

### Audit log shape (Case 8)

```typescript
logger.info('display-ttl-gc: killed idle display', {
  display: ':10',
  idleAgeMs: 18_000_000,   // 5h in this test
  owner_session: 's1',
})
```

The msg literal + ctx field shape are drift-locked so the Phase 248-05 deploy probe can grep `journalctl -u livos | grep 'display-ttl-gc: killed idle display'` and confirm both the line shape and the ctx fields. `idleAgeMs` is `now() - lastMs` (computed inside `sweepNow`) so it's always a positive integer.

## The 8 vitest cases

| Case | Suite                           | Drift-locks                                                                                                                                                                                                                  |
| ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | drift-lock constants            | `DISPLAY_TTL_GC_DEFAULT_IDLE_MS === 14_400_000` (4h)                                                                                                                                                                         |
| 2    | drift-lock constants            | `DISPLAY_TTL_GC_DEFAULT_SWEEP_MS === 3_600_000` (1h)                                                                                                                                                                         |
| 3    | sweepNow()                      | 1 stale (5h ago) + 1 fresh (1h ago) → `kill` called once with `{display:':10', callerSession:'s1'}` (owner-impersonation); count===1; `:11` NOT touched                                                                      |
| 4    | sweepNow() — fallback           | No `last_app_at` field → falls back to `created_at` (5h ago) → killed                                                                                                                                                       |
| 5    | start() lifecycle               | Idempotent — second start() clears the first handle (clearIntervalFn called with the returnValue from the first setIntervalFn call); both setIntervalFn calls forward the sweepMs                                            |
| 6    | stop() lifecycle                | Null-safe — stop() before any start() does NOT throw + does NOT call clearIntervalFn; stop() after a start() calls clearIntervalFn(handle); repeated stop() is a no-op                                                       |
| 7    | best-effort kill                | When kill returns `{ok:false, error:'not-found'}` (display vanished between list and kill), sweepNow does NOT throw; count reflects ONLY successful kills (1 of 2 stale records — the not-found one is silently swallowed)   |
| 8    | audit logging                   | logger.info called per kill with msg `'display-ttl-gc: killed idle display'` + ctx `{display, idleAgeMs:number, owner_session}` — exact field names + types pinned                                                          |

Test fixtures use a `makeDisplayManager(records: Partial<DisplayRecord>[])` helper that returns `vi.fn()`-backed stubs for all 6 DisplayManager methods plus `initialized: Promise.resolve()`. Fixed epoch `FIXED_NOW = Date.parse('2026-05-28T12:00:00.000Z')` + `isoAgo(ms)` helper for round-trip-exact staleness math.

## Boot wiring in mcp/server.ts

Three observable variants at `[luse-mcp] connected via stdio transport ...`:

| Env state                          | Log suffix shape                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LUSE_REDIS_URL unset / empty       | `(redis=null, create_stream gated off) (displayManager=null) (displayTtlGc=null)`                                                                       |
| LUSE_REDIS_URL set, valid          | `(redis=connected) (displayManager=wired) (displayTtlGc=started)`                                                                                       |
| LUSE_TARGET_DISPLAY=:N + redis set | `(display=:N) (redis=connected) (displayManager=wired) (displayTtlGc=started)`                                                                          |

Phase 248-05 UAT step: `journalctl -u livinityd | grep '\[luse-mcp\] connected'` MUST contain `displayTtlGc=started` post-deploy when Redis is reachable. The absence of that suffix indicates either:

1. The deploy didn't include 248-03 commits (binary too old)
2. `displayManager=null` so the TTL GC was correctly skipped (Redis unreachable)
3. The TTL GC threw during start() — investigate journalctl for stack traces

The `beforeExit` handler ensures vitest runs + dev restarts that exit gracefully don't leak the 1h interval. The interval handle is also auto-cleared by process termination (SIGTERM/SIGKILL) since the libuv timer dies with the process — `beforeExit` is belt-and-suspenders for graceful-exit paths only.

## Why owner-impersonation is the right call here

Per D-248-01-C, the owner-scope check lives at the manager layer so MCP wrappers (248-02) and the TTL GC (248-03) inherit a single chokepoint. The TTL GC is the FIRST consumer that needs to legitimately bypass the check — every other caller (MCP wrappers) gets `callerSession` from the per-user session ID and SHOULD be scoped. Two design options were considered:

1. **Owner-impersonation lift (chosen, D-248-03-A)** — TTL GC reads `owner_session` off each record and passes it back into `kill()` as `callerSession`. Pros: zero new surface on DisplayManager; existing test infrastructure works unchanged; bypass is implicit but documented. Cons: future readers might miss the bypass in code review (mitigated by the module doc-comment).
2. **Admin escape method** — DisplayManager grows a `killAsSystem({display})` method that skips the owner-scope check. Pros: bypass is type-visible at the call site. Cons: new surface area, new test coverage, redundant for a single caller.

If a second admin caller surfaces (e.g. an operator "kill all displays" UI in v45+), promote to option 2.

## Deviations from plan

None — plan executed exactly as written with two small additive expansions that the plan flagged as "may be needed":

1. **`DisplayRecord.last_app_at?: string`** — the plan flagged "Note: `DisplayRecord` type needs `last_app_at?: string` field — confirm 248-01 included it in types.ts. If not, this plan adds it as an additive types.ts change (still task 2 — same plan as TTL GC)." 248-01 did NOT include the field in the typed surface (attachApp wrote it to Redis but list() didn't surface it), so 248-03 adds it. Documented as D-248-03-C.
2. **`display-manager.ts list()` populates `last_app_at`** — the field was already being written by `attachApp()` at line 351 (verified in 248-01 source). 248-03 adds a 3-line additive change to list() so the TTL GC can read it back through the typed interface without re-HGETALLing. Zero test breakage in 248-01.

Plan's "8+" target → exactly 8 cases shipped. Plan's "Test 7 (owner-impersonation)" and "Test 8 (audit-log)" map verbatim to Cases 7 + 8.

## Sacred SHA verification

```
git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
→ f3538e1d811992b782a9bb057d1b7f0a0189f95f  (UNCHANGED)
```

Pre-commit hook fired `[sacred-sha] PASS: 20 files verified` on all 3 commits:

- `e8a6ab01` test(248-03): RED display-ttl-gc — drift-locks + 4h idle sweep + impersonation
- `6ac2c3ac` feat(248-03): GREEN display-ttl-gc — 4h idle sweep with owner-impersonation
- `0f9fcc95` feat(248-03): wire display-ttl-gc into mcp/server.ts boot

## TDD Gate Compliance

- Task 1 RED — `Failed to load url ../display-ttl-gc.js` module-not-found confirmed via `pnpm vitest run` (classic RED gate); committed `e8a6ab01`.
- Task 2 GREEN — 8/8 cases pass in 6ms; 23/23 cumulative across displays/; committed `6ac2c3ac`.
- Task 3 wiring — 0 typecheck errors under `mcp/server.ts` or `displays/`; boot smoke confirms `(displayTtlGc=null)` fail-closed branch; committed `0f9fcc95`.
- REFACTOR — skipped; the 120-line factory has no duplication that would justify a refactor commit (it IS a refactor — the 246-05 pattern transplanted into the displays module).

## Next plan (248-04)

Wave 3 — `docs/luse/DISPLAY-LIFECYCLE.md` (canonical agent-agnostic prose layer) + sync to all 4 shim dirs via `scripts/sync-luse-skills.sh`. Sections: when-to-create, isolation guarantees, cleanup discipline (explicit `computer_kill_display` is still the polite contract; 4h TTL GC is the safety net), app-placement recipes, troubleshooting. The TTL GC's behavior should be documented as a single bullet under "Known limits" — agents should NOT rely on the 4h reclaim window for correctness (always call `computer_kill_display`); the TTL GC exists only to bound the worst case when the agent forgets.

Plan 248-05 (Mini PC deploy + automated probes + UAT) consumes the TTL GC boot log line shape from this plan as one of the wire-level deploy probes.

## Self-Check

- ✅ Both created files exist at the documented paths (`display-ttl-gc.ts` + `__tests__/display-ttl-gc.test.ts`)
- ✅ All 4 modified files updated at the documented paths (`types.ts` + `display-manager.ts` + `index.ts` + `mcp/server.ts`)
- ✅ All 3 commits in `git log --oneline` (`e8a6ab01` + `6ac2c3ac` + `0f9fcc95`)
- ✅ vitest: `8 passed (8)` on display-ttl-gc.test.ts in 6ms
- ✅ vitest: `23 passed (23)` on the full displays/ folder
- ✅ vitest: `41 passed (41)` across displays/ + mcp/tools.test.ts
- ✅ tsc --noEmit: 0 errors under `computer-use/displays/` or `computer-use/mcp/server.ts`
- ✅ Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved
- ✅ Boot smoke: `(displayTtlGc=null)` emitted with empty LUSE_REDIS_URL — fail-closed branch verified
- ✅ Drift-locked literals: 14_400_000 (4h) + 3_600_000 (1h) match plan must_haves.truths verbatim

## Self-Check: PASSED

All claimed files exist on disk, all 3 commit hashes resolve in git log, sacred SHA preserved at `f3538e1d811992b782a9bb057d1b7f0a0189f95f`, vitest 8/8 + 23/23 + 41/41 verified, typecheck 0 new errors, boot smoke (displayTtlGc=null) confirmed under empty LUSE_REDIS_URL.
