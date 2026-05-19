---
phase: 159-nativeapp-webapp-parity-window-manager-panel
plan: 05
subsystem: ui
tags: [workstream-b, lifecycle, registry-consumer, webapp, defensive-symmetry, vitest, sacred-sha]

# Dependency graph
requires:
  - phase: 159-02
    provides: "WindowManagerContext.registerCloseHandler(windowId, handler) + unregisterCloseHandler(windowId) + CloseHandler type"
  - phase: 159-04
    provides: "Canonical registry-consumer shape mirrored here on the WebApp side; window-content.tsx native branch already forwards windowId (this plan adds the WebApp branch leg)"
provides:
  - "WebAppStreamWindow consumes the 159-02 registry — handler runs while React tree is still mounted (eliminates the H1 race documented in 159-RESEARCH.md Workstream B, defensively for WebApp side too)"
  - "windowId prop chain extended: WindowAppContent's WebApp branch now forwards windowId={windowId} (Plan 04 only did the native branch)"
  - "Defensive fallback to legacy D-95-CLEANUP unmount cleanup when windowId or wm is absent (rollout safety net; symmetric to native-app-stream-window.tsx)"
  - "Phase 159-05 describe block APPENDED to webapp-stream-window.unit.test.tsx (extension, not replacement) — 2 new invariants lock the registry path + the defensive fallback"
  - "Existing 100-10 D-95-CLEANUP invariant test (line 55-57) STILL PASSES because the fallback path preserves the byte-exact literal closeMutationRef.current.mutate({webappId})"
affects: [159-07, 159-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Registry-consumer useEffect for WebApp surface (defensive symmetry with native-app-stream-window.tsx Plan 04)"
    - "Source-text invariant extension pattern (APPEND new describe block, NEVER replace existing invariants) — preserves Phase 100-10 contract"
    - "useWindowManagerOptional (NOT useWindowManager) — symmetric defensive choice with NativeAppStreamWindow Plan 04"

key-files:
  created: []
  modified:
    - "livos/packages/ui/src/modules/window/window-content.tsx (WebApp branch in WindowAppContent now forwards windowId={windowId} to WebAppStreamWindowContent)"
    - "livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx (useWindowManagerOptional import; windowId?: string prop on WebAppStreamWindowProps; registry useEffect with !windowId||!wm defensive fallback; mutateAsync in handler; legacy mutate literal preserved in fallback for 100-10 invariant)"
    - "livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx (NEW describe block 'Phase 159-05 — registry-mediated close (Workstream B)' appended at end; 2 new invariants)"

key-decisions:
  - "Plan 05 source-text invariant extension uses APPEND-AT-END pattern. The existing 600+ line test file holds 3 describe blocks (WebAppStreamWindow source-text invariants, WebAppFloatingActionBar source-text invariants, Phase 100-10-10 chat-response wire-up). The new Phase 159-05 describe block lands as a 4th sibling. ZERO existing test was modified or deleted — the 100-10 D-95-CLEANUP invariant (line 55-57) stays green because the fallback path preserves the literal `closeMutationRef.current.mutate({webappId})` byte-for-byte."
  - "Defensive fallback retained — same call as Plan 04 on the native side. Rationale: rollout-window safety (component might render before windowId is reliably threaded via Plan 07 windows-container.tsx full block rewrite). Server-side close mutation is idempotent so double-fire is harmless. Removing the fallback would re-introduce the H1 race during the rollout gap."
  - "Atomic per-task commits this time (Task 1 + Task 2 separate). Unlike Plan 02/04 where source-text invariants were bound to the source file they tested, Plan 05's Task 1 (windowId thread) and Task 2 (registry useEffect + tests) are operationally separate — Task 1's tsc gate passes independently because windowId is optional everywhere. Splitting was safe and produced cleaner per-task commits."
  - "useWindowManagerOptional NOT useWindowManager — same defensive choice as Plan 04. The component may render outside the provider tree in test surfaces; the optional hook returns null and we transparently fall back."

patterns-established:
  - "Source-text test extension pattern: APPEND new describe block at end-of-file; preserve all existing invariants byte-for-byte; new describe block carries its own header comment explaining the relationship to prior locks"
  - "Defensive-fallback symmetry — Plan 04 (native) + Plan 05 (webapp) now share the same registry consumer shape; future Workstream-B-style components can copy either as canonical reference"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-05-19
---

# Phase 159 Plan 05: WebAppStreamWindow Registry Migration (Defensive Symmetric Consumer) Summary

**WebAppStreamWindow defensively migrated from the H1-prone unmount-cleanup path to the 159-02 close-handler registry — same registry-consumer shape as Plan 04's NativeAppStreamWindow. The existing 100-10 D-95-CLEANUP invariant (test line 55-57) stays green because the defensive fallback path preserves the byte-exact `closeMutationRef.current.mutate({webappId})` literal.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-19T01:38Z (approx)
- **Completed:** 2026-05-19T01:46Z (approx)
- **Tasks:** 2 (Task 1 windowId thread; Task 2 registry useEffect + test extension)
- **Files modified:** 3 (window-content.tsx, webapp-stream-window.tsx, webapp-stream-window.unit.test.tsx)
- **Files created:** 0

## Accomplishments

- `WindowAppContent`'s WebApp branch (`window-content.tsx:82-91`) now forwards `windowId` to `WebAppStreamWindowContent`. Mirrors the native-app branch wiring done in Plan 04.
- `WebAppStreamWindowProps` interface gained `windowId?: string` field with JSDoc explaining the registry rationale.
- `WebAppStreamWindow` function signature destructures `{webappId, windowId}`.
- Added `import {useWindowManagerOptional} from '@/providers/window-manager'` near the other hook imports.
- **Replaced** the legacy unmount-cleanup useEffect (old lines 204-220 of webapp-stream-window.tsx) with the registry pattern + defensive fallback:
  - When both `windowId` and `wm` present: registers `handler = async () => closeMutationRef.current.mutateAsync({webappId})` via `wm.registerCloseHandler(windowId, handler)`. Returns `() => wm.unregisterCloseHandler(windowId)`.
  - When either is absent: falls back to the legacy unmount cleanup that calls `closeMutationRef.current.mutate({webappId})` — byte-exact literal preservation for the 100-10 invariant.
  - Effect deps: `[windowId, webappId, wm]`.
- **Extended** (not replaced) `webapp-stream-window.unit.test.tsx` with a new 4th describe block `Phase 159-05 — registry-mediated close (Workstream B)` holding 2 source-text invariants:
  1. `Phase 159 — registers close handler with WindowManager when windowId is present` — locks the import, `wm.registerCloseHandler(windowId, handler)`, `wm.unregisterCloseHandler(windowId)`, and `mutateAsync({webappId})` literals.
  2. `Phase 159 — keeps the defensive D-95-CLEANUP fallback for missing windowId` — locks the `if (!windowId || !wm)` branch literal AND the byte-exact `closeMutationRef.current.mutate({webappId})` legacy literal (same shape as line 55-57).

## Task Commits

Each task was committed atomically with a `feat(159-05):` prefix:

1. **Task 1 — `1d960fc2`** `feat(159-05): thread windowId to WebApp branch + accept on WebAppStreamWindow`
   - Files: `window-content.tsx` + `webapp-stream-window.tsx`.
   - 2 files / 15 insertions / 2 deletions.
   - Verified: source-text greps `WebAppStreamWindowContent webappId={webappId} windowId={windowId}` (1) + `windowId?: string` (1 in webapp-stream-window.tsx).

2. **Task 2 — `f0e8ecd2`** `feat(159-05): migrate WebAppStreamWindow to registerCloseHandler with defensive fallback`
   - Files: `webapp-stream-window.tsx` + `webapp-stream-window.unit.test.tsx`.
   - 2 files / 70 insertions / 7 deletions.
   - TDD cycle:
     - RED (before edit): new tests file → 5 failures (2 new Phase 159 + 3 mid-state, since the test imports SRC and 3 sibling regex tests had transitively failing literals). Confirmed all 5 fail.
     - GREEN (after edit): `pnpm exec vitest run webapp-stream-window.unit.test.tsx` → 60 pass, 2 fail. The 2 remaining failures are PRE-EXISTING (T-10-05-11 on `windows-container.tsx` looking for `WebAppFloatingSkillsButton`; T-10-10-STATUS-02 counting `agentStatus?.phrase` matches in `webapp-floating-action-bar.tsx`). Stash-diff proved these failures exist on baseline HEAD too (60 pass / 2 fail without my edits, 60 pass / 2 fail with my edits — net delta +2 new passing tests).

## Files Modified

- `livos/packages/ui/src/modules/window/window-content.tsx` (Task 1, commit `1d960fc2`) — added a Phase 159-05 comment block above the WebApp branch and changed `<WebAppStreamWindowContent webappId={webappId} />` → `<WebAppStreamWindowContent webappId={webappId} windowId={windowId} />`. WindowContent/WindowAppContent's optional `windowId?: string` accept-side props were already added by Plan 04 — Plan 05 only widened the WebApp call-site.
- `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` (Tasks 1+2, commits `1d960fc2` then `f0e8ecd2`) — Task 1 added the prop; Task 2 added the `useWindowManagerOptional` import (with comment block explaining the optional choice) and replaced the unmount-cleanup useEffect with the registry + defensive-fallback effect.
- `livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx` (Task 2, commit `f0e8ecd2`) — appended a new 4th describe block at end-of-file with 2 source-text invariants. NO existing test modified.

## Files Untouched (Per Plan 05 Boundary)

- `livos/packages/ui/src/providers/window-manager.tsx` — Plan 02's registry implementation; no changes needed (consumer-side only this plan).
- `livos/packages/ui/src/modules/window/app-contents/native-app-stream-window.tsx` — Plan 04's surface; Plan 05 does NOT touch it.
- `livos/packages/ui/src/modules/window/windows-container.tsx` — Plan 07's exclusive lane. NOT in this plan's commits. (Note: this file appeared in pre-existing uncommitted WT state from a prior session — Plan 05's commits explicitly excluded it from staging.)

## Decisions Made

- **Atomic per-task commits.** Plan 02/04 used a single combined commit because their source-text invariants were bound to the same source file they tested. Plan 05's Task 1 (windowId thread) doesn't need any test rewiring — the optional prop passes tsc independently. So Task 1 = pure plumbing commit, Task 2 = registry useEffect + test extension. Cleaner per-task history.
- **APPEND at end-of-file, not in-place.** The existing 100-10 invariant test sits at line 55-57 of a 670+ line file. Re-shaping it (e.g. adding `or matches the registry path` literal) would have been the brittle path — the regex would suddenly accept two unrelated source shapes and a future regression could silently land. Instead the new Phase 159 invariants live in their own describe block, completely separate. Clear authorship per Phase, clean intent per assertion.
- **Defensive fallback retained byte-for-byte.** The fallback's `closeMutationRef.current.mutate({webappId})` is the SAME literal the line-55-57 invariant locks. Removing it would have broken the locked test; rewriting the test to accept the new shape would have been a regression-amnesia hazard. Keeping the literal AND adding the new registry path is the correct defense-in-depth answer (Plan 04 precedent on native side).
- **useWindowManagerOptional (not throwing variant).** Symmetric defensive choice with Plan 04. Allows the component to render in test/storybook surfaces outside the provider tree without throwing — the optional hook returns null, the `!wm` guard takes the fallback branch, the legacy unmount cleanup runs. Zero functional regression for surfaces that don't yet use the WindowManager.

## Deviations from Plan

### [Rule: scope-pure commit hygiene] Pre-existing dirty WT files left untouched

- **Found during:** Pre-stage inventory (Task 1 commit + Task 2 commit).
- **Issue:** Working tree contained pre-existing uncommitted modifications to `livos/packages/ui/src/modules/window/window-chrome.tsx`, `livos/packages/ui/src/modules/window/window.tsx`, `livos/packages/ui/src/modules/window/windows-container.tsx`, and `livos/packages/ui/src/modules/window/window-chrome.test.tsx`. These contain Plan 07-shaped changes (NATIVE_APP_ID_PREFIX, nativeAppId chrome wiring, `windowId={window.id}` call-side thread, mutual-exclusion warn) from a prior session that were never committed. The orchestrator-handoff context warned the WT should be clean of unrelated changes; on actual `git status` after Plan 05's Task 1 staging, the files surfaced (likely a Windows-side `git status` lazy-refresh quirk — the initial check after orchestrator's commits showed only `.planning/` modifications).
- **Fix:** Plan 05's two commits explicitly staged only the plan-scoped files (`window-content.tsx`, `webapp-stream-window.tsx`, `webapp-stream-window.unit.test.tsx`) — the pre-existing dirty files remain unstaged in WT and are out of Plan 05 scope. The orchestrator (or a future Plan 07 commit) owns disposition of those files.
- **Files modified:** None this session beyond Plan 05's three.
- **Commit:** No commit needed for this deviation — it's a scope-discipline note.

### [Rule: out-of-scope test failures deferred] 2 pre-existing test failures in webapp-stream-window.unit.test.tsx

- **Found during:** Final verification step.
- **Issue:** `pnpm exec vitest run webapp-stream-window` reports 2 failures: (1) `T-10-05-11: windows-container.tsx renders WebAppFloatingSkillsButton` — regex expects `WebAppFloatingSkillsButton` literal in `windows-container.tsx`, not present in HEAD; (2) `T-10-10-STATUS-02: ChatInputBar also renders the per-tool status line while streaming (sub-line beneath input)` — expects ≥2 matches of `agentStatus?.phrase` and `agentStatus?.currentTool` in `webapp-floating-action-bar.tsx`, finds 1.
- **Fix:** Confirmed pre-existing via stash-diff (baseline HEAD reproduces the same 60/2 split as post-Plan-05). Both invariants reference OTHER source files (`windows-container.tsx`, `webapp-floating-action-bar.tsx`), not Plan 05's `webapp-stream-window.tsx`. They belong to Phase 100-10-05 / Phase 100-10-10 carryover scope. Per Plan 02 precedent ("pre-existing UI test drift logged to deferred-items.md"), these are out of Plan 05 scope.
- **Files modified:** None.
- **Commit:** None.

## Sacred SHA Invariant

`git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — unchanged before Task 1, after Task 1, and after Task 2. ✓

## Verification (final, post-Task-2 commit)

```bash
# Targeted (Plan 05 invariants only):
cd livos/packages/ui
pnpm exec vitest run src/modules/window/webapp-stream-window.unit.test.tsx -t "D-95-CLEANUP"
# → Test Files  1 passed (1)
# → Tests       2 passed (62)   (legacy 100-10 D-95-CLEANUP literal preserved)

pnpm exec vitest run src/modules/window/webapp-stream-window.unit.test.tsx -t "Phase 159"
# → Test Files  1 passed (1)
# → Tests       2 passed (62)   (new Phase 159-05 registry invariants both green)

# Full file (includes 2 pre-existing carryover failures unrelated to Plan 05):
pnpm exec vitest run src/modules/window/webapp-stream-window.unit.test.tsx
# → Test Files  1 failed (1)
# → Tests       2 failed | 60 passed (62)
# → Failures: T-10-05-11 (windows-container.tsx pre-existing), T-10-10-STATUS-02 (webapp-floating-action-bar.tsx pre-existing)
# → Stash-diff vs HEAD confirms identical 60/2 split → my edits added +2 passing tests, zero regressions.

git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
# → f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

## Acceptance Criteria Status

**Task 1 (windowId thread):**
- [x] `git grep "WebAppStreamWindowContent webappId={webappId} windowId={windowId}" livos/packages/ui/src/modules/window/window-content.tsx` returns 1 match.
- [x] `git grep "windowId?: string" livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` returns 1 match.
- [x] tsc clean on Plan 05 surface. (Pre-existing `webapp-stream-window.tsx:589/591/610` errors involve `ActionLog.meta` — pre-date Plan 05 per stash-diff; logged out-of-scope.)

**Task 2 (registry migration + test fill):**
- [x] `wm.registerCloseHandler(windowId, handler)` × 1.
- [x] `wm.unregisterCloseHandler(windowId)` × 1.
- [x] `closeMutationRef.current.mutateAsync({webappId})` × 1.
- [x] `closeMutationRef.current.mutate({webappId})` × 1 (defensive fallback — preserved literal for 100-10 invariant; also referenced in a comment line which doesn't violate the count guard).
- [x] Legacy `fires close.mutate on unmount (D-95-CLEANUP — fire-and-forget)` test at line 55-57 STILL PASSES (re-run, green).
- [x] 2 new Phase 159 tests PASS.
- [x] Full vitest run reports 60 passed on the file (target: all webapp-stream-window invariants green); 2 carryover failures on OTHER source files (target: not Plan 05 scope, deferred).

## Next Phase Readiness

- **Plan 159-07 (windows-container.tsx full `.map()` block rewrite — `windowId={window.id}` call-side forwarding):** REQUIRES Plan 04's + Plan 05's accept-side widening (both DONE). After Plan 07 lands, both surfaces (native + webapp) reliably get windowId and the defensive `!windowId || !wm` branches become dead code — kept as safety nets, harmless.
- **Plan 159-08 (WindowsManagerPanel):** Plan 05 has no direct dependency, but the panel's close button benefits from the registry pattern transparently — when panel calls `wm.closeWindow(id)`, the registered handler (now reliable on both native AND webapp) fires before CLOSE_WINDOW dispatch.

## Self-Check: PASSED

- File `livos/packages/ui/src/modules/window/window-content.tsx`: FOUND (modified in `1d960fc2`)
- File `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx`: FOUND (modified in `1d960fc2` and `f0e8ecd2`)
- File `livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx`: FOUND (modified in `f0e8ecd2`)
- Commit `1d960fc2`: FOUND in `git log --oneline`
- Commit `f0e8ecd2`: FOUND in `git log --oneline`
- Sacred SHA preserved: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- 2/2 NEW Phase 159 invariants PASS
- Legacy 100-10 D-95-CLEANUP invariant STILL PASSES (literal preserved byte-for-byte)
- 60/62 total tests pass in file (2 carryover pre-existing failures referencing unrelated source files — deferred)
- WebApp + Native registry shapes are now defensively symmetric (Plan 04 / Plan 05 mirror)

---
*Phase: 159-nativeapp-webapp-parity-window-manager-panel*
*Completed: 2026-05-19*
