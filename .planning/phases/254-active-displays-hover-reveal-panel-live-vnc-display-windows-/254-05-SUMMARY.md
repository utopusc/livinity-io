---
phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-
plan: 05
subsystem: infra
tags: [display-manager, xvfb, redis, vnc, trpc, vitest, tdd, gap-closure]

# Dependency graph
requires:
  - phase: 254-01
    provides: displays.list / displays.getVncUrl tRPC seam reading luse:display:* keys
  - phase: 254-02
    provides: exported DEFAULT_DISPLAY_WIDTH / DEFAULT_DISPLAY_HEIGHT shared resolution constants
  - phase: 254-04
    provides: Active Displays hover strip that renders displays.list rows
provides:
  - "DisplayManager.registerExisting(input) — records an already-running X display into Redis WITHOUT spawning"
  - "RegisterExistingInput type on the displays public surface"
  - "Boot-time registration of the :1 host Xvfb so it appears in displays.list (empty owner_session = host/shared)"
affects: [254-active-displays, hover-strip, getVncUrl, vnc-window]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "register-only Redis adoption: write the create()-shaped HSET WITHOUT spawning an X server"
    - "idempotent boot registration: no-op on existing record so a restart never clobbers a user rename"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/computer-use/displays/types.ts
    - livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts
    - livos/packages/livinityd/source/modules/computer-use/displays/index.ts
    - livos/packages/livinityd/source/modules/computer-use/displays/__tests__/display-manager.test.ts
    - livos/packages/livinityd/source/index.ts

key-decisions:
  - "registerExisting is a Redis-only HSET (never calls spawnFn) — the boot startXvfb already owns the running :1 server, so spawning a second Xvfb would collide (T-254-08 mitigation)"
  - "registerExisting is idempotent: no-op when a record already exists, preserving a user-renamed/re-owned :1 across livinityd restart (T-254-07 mitigation)"
  - ":1 is registered with empty owner_session (host/shared) so any authenticated user passes the getVncUrl gate — deliberate, :1 IS the shared host LivOS desktop (T-254-06 accept)"
  - "registerExisting does NOT touch allocateNext/nextDisplayNum — registering :1 (below allocatorStart) must not perturb the :10+ allocator"
  - "boot call is guarded (this.displayManager?) + wrapped in try/catch + non-fatal so a Redis write failure logs a warning but never breaks boot"

patterns-established:
  - "Pattern: adopt an externally-spawned long-lived process into the DisplayManager via a register-only path that mirrors create()'s persisted shape minus the spawn"

requirements-completed: [GOAL-254-HOVER-PANEL, GOAL-254-DISPLAYS-TRPC]

# Metrics
duration: 3 min
completed: 2026-06-02
---

# Phase 254 Plan 05: Register boot :1 host display (Gap 1 closure) Summary

**`DisplayManager.registerExisting()` adopts the boot `:1` host Xvfb into Redis without spawning a second X server, so the Active Displays hover strip lists the LivOS desktop and `getVncUrl(':1')` resolves (empty owner_session = host/shared).**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-02T11:11:40Z
- **Completed:** 2026-06-02T11:14:33Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `registerExisting(input: RegisterExistingInput): Promise<DisplayRecord>` to the `DisplayManager` interface and implemented it as a register-only Redis HSET (same field-for-field shape as `create()`, minus the spawn) — idempotent (no-op on existing record), allocator-untouched.
- Wired the boot sequence in `index.ts`: after `startXvfb(':1')` + fluxbox succeed, `displayManager.registerExisting({display:':1', WxH from shared constants, mode:'xvfb', name:'Host Display', ownerSession:''})` is called (guarded + try/catch + non-fatal).
- Closed Gap 1: on a fresh boot `displays.list` now returns `:1`, and `getVncUrl(':1')` passes the gate (empty owner_session → no FORBIDDEN; record present → no NOT_FOUND).

## Task Commits

TDD plan — RED then GREEN:

1. **Task 1 RED: failing tests for registerExisting()** - `5e57eaf4` (test)
2. **Task 1 GREEN: DisplayManager.registerExisting() implementation** - `00348c6d` (feat)
3. **Task 2: register boot :1 host display after startXvfb** - `67426089` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/computer-use/displays/types.ts` - Added `RegisterExistingInput` type + `registerExisting` to the `DisplayManager` interface.
- `livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts` - Implemented `registerExisting` (register-only HSET, idempotent no-op on existing record, no spawn, no allocator advance) + added it to the returned manager object + imported `RegisterExistingInput`.
- `livos/packages/livinityd/source/modules/computer-use/displays/index.ts` - Re-exported `RegisterExistingInput` from the displays barrel.
- `livos/packages/livinityd/source/modules/computer-use/displays/__tests__/display-manager.test.ts` - 4 new cases (15-18): hash shape + no spawn, list() returns :1, idempotent no-clobber, allocator untouched.
- `livos/packages/livinityd/source/index.ts` - Boot call to `displayManager.registerExisting({display:':1', ...})` after fluxbox starts, guarded + non-fatal.

## Decisions Made
None beyond the plan — followed plan as specified. The five locked decisions above are restated from the plan's interfaces/threat model.

## Deviations from Plan

None - plan executed exactly as written.

The plan's line-number hints for `index.ts` were stale (the registration was placed after the fluxbox `streamingLogger.info` line, still inside the same `:1` startXvfb `try` block, as the plan permitted: "placement inside the same try is fine"). The `DEFAULT_DISPLAY_WIDTH`/`DEFAULT_DISPLAY_HEIGHT` import was already present at index.ts:57-58 (added by Plan 254-02), so no import change was needed — exactly as the plan anticipated. `streamingLogger.warn(msg, error?)` exists with the expected signature.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None — no functional divergence.

## Verification Results

- `npx vitest run display-manager.test.ts` → **21/21 PASS** (17 pre-existing regression + 4 new registerExisting cases 15-18).
- RED→GREEN evidence: at commit `5e57eaf4` the 4 new cases failed with `mgr.registerExisting is not a function` (17 passed); at `00348c6d` all 21 pass.
- `rg "registerExisting"` matches in `types.ts` (3), `display-manager.ts` (3), `index.ts` (the boot call).
- `rg "ownerSession: ''"` matches in `index.ts` (host/shared for :1).
- `rg "displayManager.create\(':1'\)"` → **no matches** (we never use create() for :1).
- `rg "spawn"` within the `registerExisting` body → only doc/comment text ("WITHOUT spawning", "NO spawn call", "no spawn"); zero `spawnFn`/`ensureSpawnFn`/`buildSpawnArgs` calls. Test asserts `spawnFn` called 0 times.
- `tsc --noEmit`: zero new errors in the displays module or the root `source/index.ts` registerExisting/displayManager wiring (only pre-existing baseline errors in unrelated `server/index.ts` + `server/trpc/index.ts`).

## TDD Gate Compliance
RED gate (`test(254-05): ...` = `5e57eaf4`) precedes GREEN gate (`feat(254-05): ...` = `00348c6d`). No unexpected RED-phase pass. No REFACTOR commit needed (implementation was minimal and clean).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Takes effect on the next livinityd boot after deploy.

## Next Phase Readiness
- Gap 1 closed: the `:1` host display is now listable and VNC-resolvable from the Active Displays hover strip on a fresh Mini PC boot.
- Plan 254-06 (admin-bypass getVncUrl) is the remaining Phase-254 gap-closure plan.
- Runtime takes effect on the next livinityd boot after deploy — not yet deployed (all 254 commits are unpushed to GitHub master, per the phase's tar+scp deploy precedent).

## Self-Check: PASSED
- Files verified on disk: 254-05-SUMMARY.md, display-manager.ts, types.ts, index.ts (all FOUND).
- Commits verified in git log: `5e57eaf4` (RED), `00348c6d` (GREEN), `67426089` (Task 2) — all FOUND.

---
*Phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-*
*Completed: 2026-06-02*
