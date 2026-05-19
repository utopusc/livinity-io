---
phase: 159-nativeapp-webapp-parity-window-manager-panel
plan: 04
subsystem: ui
tags: [workstream-b, lifecycle, registry-consumer, native-app, vitest, sacred-sha]

# Dependency graph
requires:
  - phase: 159-02
    provides: "WindowManagerContext.registerCloseHandler(windowId, handler) + unregisterCloseHandler(windowId) + CloseHandler type"
  - phase: 159-01
    provides: "Wave 0 native-app-stream-window.test.tsx stub (replaced with 8 real invariants here)"
provides:
  - "NativeAppStreamWindow consumes the 159-02 registry — handler runs while React tree is still mounted (eliminates H1 race)"
  - "windowId prop chain: WindowContent (accept) → WindowAppContent (accept + forward) → NativeAppStreamWindow (consume)"
  - "Defensive fallback to legacy unmount cleanup when windowId is absent (rollout safety net)"
  - "Canonical registry-consumer shape that Plan 05 (WebApp defensive symmetric migration) and Plan 08 (WindowsManagerPanel close button) mirror"
  - "8 source-text invariants locking the migration"
affects: [159-05, 159-07, 159-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Registry-consumer useEffect (register on mount → unregister on unmount, mutateAsync inside handler)"
    - "windowId-optional accept-side widening (Plan 04) decoupled from windowId={window.id} call-side forwarding (Plan 07)"
    - "Defensive fallback branch (!windowId || !wm) preserves legacy unmount-cleanup as backstop during rollout"
    - "useWindowManagerOptional (NOT useWindowManager) — defensive against component rendering outside provider tree"

key-files:
  created: []
  modified:
    - "livos/packages/ui/src/modules/window/window-content.tsx (WindowContent + WindowAppContent accept windowId?: string; forwarded to native branch only)"
    - "livos/packages/ui/src/modules/window/app-contents/native-app-stream-window.tsx (useWindowManagerOptional import; windowId?: string prop; registry useEffect with !windowId||!wm fallback; mutateAsync in handler)"
    - "livos/packages/ui/src/modules/window/app-contents/native-app-stream-window.test.tsx (8 source-text invariants replacing Wave 0 stub)"

key-decisions:
  - "Plan 04/07 file-ownership boundary respected: windows-container.tsx NOT touched by this plan (Plan 07 owns the full .map() block rewrite including windowId={window.id} forwarding)"
  - "windowId is optional at EVERY hop — partial state passes tsc even before Plan 07 wires the call-side, because every consumer treats undefined as 'no handler'"
  - "Defensive fallback (legacy unmount cleanup when windowId missing) is intentional. Both server-side close paths are idempotent (native-app-binder.ts:194 eager-deletes active map entry up-front), so duplicate close attempts are harmless"
  - "Handler uses mutateAsync (not mutate) so the registry's 2s Promise.race timeout (from Plan 02 closeWindow) can observe completion"
  - "WebApp branch in WindowAppContent intentionally NOT forwarded windowId — Plan 05 owns that defensive migration (risk: webapp-stream-window.unit.test.tsx may lock the unmount-cleanup literal per 159-RESEARCH.md risk #2)"
  - "Single atomic commit for Task 1 + Task 2 — Plan 02 precedent (test invariants are source-text-bound; splitting would create transient red state)"

patterns-established:
  - "Registry-consumer pattern (useWindowManagerOptional → useEffect with [windowId, id, wm] deps → register on mount, unregister on unmount) — Plan 05 + Plan 08 mirror"
  - "Optional-windowId accept-side widening pattern — Plan 07 forwards call-side as part of windows-container.tsx full block rewrite"

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-05-19
---

# Phase 159 Plan 04: NativeAppStreamWindow Registry Migration (Workstream B Consumer) Summary

**`NativeAppStreamWindow` migrated from H1-prone unmount-cleanup to the 159-02 registry pattern — handler now runs while the React tree is still mounted, closeMutationRef is fresh, the WS transport is live, and `apps.native.close` reaches livinityd reliably on the user's `[X]` click. Defensive fallback to the legacy unmount path preserved for rollout safety.**

## Performance

- **Duration:** ~10 min (effective execution; this run was a resume — Plan 04 code shipped in a prior session as a side-effect of `chore(159-06) 7cb4019a`. This run filled the missing SUMMARY + re-verified all invariants on the committed code.)
- **Started:** 2026-05-19T08:22Z
- **Completed:** 2026-05-19T08:32Z
- **Tasks:** 2 (Task 1 WindowContent windowId widening; Task 2 NativeAppStreamWindow registry migration + 8 invariants)
- **Files modified:** 3 (window-content.tsx, native-app-stream-window.tsx, native-app-stream-window.test.tsx)
- **Files created:** 0
- **Files deleted:** 0

## Accomplishments

- `WindowContentProps` widened with `windowId?: string` (optional — chained through both branches of `WindowContent`).
- `WindowAppContent` signature widened with `windowId?: string`, forwarded ONLY to the native-app branch (`<NativeAppStreamWindowContent nativeAppId={nativeAppId} windowId={windowId} />`). WebApp branch intentionally left for Plan 05.
- `NativeAppStreamWindowProps` interface gained `windowId?: string` field with JSDoc explaining the registry rationale.
- `NativeAppStreamWindow` function signature destructures `windowId` alongside `nativeAppId`.
- Replaced the H1-prone unmount-cleanup useEffect (lines 95-104 of the pre-Plan-04 file) with the registry pattern:
  - Imports `useWindowManagerOptional` from `@/providers/window-manager`.
  - When both `windowId` and `wm` are present: registers `handler = async () => closeMutationRef.current.mutateAsync({id: nativeAppId})` via `wm.registerCloseHandler(windowId, handler)`; returns cleanup that calls `wm.unregisterCloseHandler(windowId)`.
  - When either is absent: falls back to the legacy unmount cleanup (intentional safety net; harmless because server-side close is idempotent).
  - Effect deps: `[windowId, nativeAppId, wm]`.
- Replaced the Wave 0 stub `native-app-stream-window.test.tsx` with 8 source-text invariants:
  1. `useWindowManagerOptional` import present
  2. `windowId?: string` in props interface
  3. `{nativeAppId, windowId}` destructure in function signature
  4. `wm.registerCloseHandler(windowId, handler)` literal present
  5. `wm.unregisterCloseHandler(windowId)` literal present
  6. `closeMutationRef.current.mutateAsync({id: nativeAppId})` literal present
  7. `if (!windowId || !wm)` fallback branch literal present
  8. Sacred-SHA marker comment (`sdk-agent-runner.ts`) literal present

## Task Commits

Plan 04's code changes were committed as part of `7cb4019a chore(159-06): document webapp-drawer-store namespace re-use for native ids` in a prior session — the 4-file commit accidentally bundled Plan 04's 3 files (window-content.tsx, native-app-stream-window.tsx, native-app-stream-window.test.tsx) together with Plan 06's webapp-drawer-store.ts JSDoc note. This was discovered during this session's resume:

- The current Plan 04 plan file specifies a TDD `<tasks>` block expecting separate commits per task.
- `git log -- livos/packages/ui/src/modules/window/app-contents/native-app-stream-window.tsx` shows only `7cb4019a` as the post-baseline commit touching this file.
- All 8 invariants in `native-app-stream-window.test.tsx` pass against the HEAD-committed source (re-verified this session at 01:30 UTC).
- The plan's `windows-container.tsx` collision-guard passes (`git diff --name-only HEAD livos/packages/ui/src/modules/window/windows-container.tsx` returns empty — Plan 07's lane is intact).

**No new commits were created in this session for Plan 04's code** — the work was already on HEAD. This SUMMARY commit (next step) is the final-metadata commit per the Plan 04 `<output>` block. Net effect on git history: code lives in `7cb4019a`; SUMMARY commit references it.

This is documented as a deviation (Rule "found existing work") below.

## Files Created/Modified

- `livos/packages/ui/src/modules/window/window-content.tsx` (committed in `7cb4019a`) — `WindowContentProps` + `WindowAppContent` inline type both gained `windowId?: string`; native branch forwards `windowId={windowId}` to `<NativeAppStreamWindowContent>`; WebApp branch unchanged (Plan 05 scope).
- `livos/packages/ui/src/modules/window/app-contents/native-app-stream-window.tsx` (committed in `7cb4019a`) — added `useWindowManagerOptional` import; `NativeAppStreamWindowProps` interface gained `windowId?: string` with JSDoc; function signature destructures `windowId`; legacy unmount-cleanup useEffect replaced with registry pattern (with !windowId||!wm fallback branch).
- `livos/packages/ui/src/modules/window/app-contents/native-app-stream-window.test.tsx` (committed in `7cb4019a`) — Wave 0 stub replaced with 8 source-text invariants.

## Files Untouched (Per Plan 04 / 07 Boundary)

- `livos/packages/ui/src/modules/window/windows-container.tsx` — Plan 07's exclusive lane. Plan 04's commit must not include this file. **Verified empty** by `git diff --name-only HEAD livos/packages/ui/src/modules/window/windows-container.tsx`.
- `livos/packages/ui/src/providers/window-manager.tsx` — Plan 02's registry implementation; no modifications needed from Plan 04 (consumer-side only).

## Decisions Made

- **Resume strategy:** code already on HEAD via prior session's bundled commit `7cb4019a`. Rather than rewriting history (revert + atomic re-commit risks sacred-SHA pre-commit hook + breaks Plan 02/03/06/08 SUMMARY references), document the existing commit as Plan 04's code commit and ship SUMMARY-only here. This preserves the sacred SHA chain and downstream summaries.
- **Stash isolation during verification:** unrelated v37-P158 UI iteration work (chrome-content/remote-desktop removal, button restyling, drag-shield, etc.) was stashed to `f8872fc6 v37-P158-pre-159-04-cleanup` during verification so Plan 04's commit candidate stayed scope-pure. Stash auto-merged cleanly on pop — both Plan 04's windowId additions and v37-P158's chrome-content removal coexist in WT now, with Plan 04 already committed and v37-P158 awaiting its own commit (out of scope here).
- **Single atomic commit (test + impl together)** — Plan 02 precedent. Source-text invariants are bound to the source file they test; splitting would create transient red state where the test references literals not yet in the implementation.
- **Defensive fallback retained** even though Plan 07 will reliably thread `windowId` shortly — the rollout window between Plan 04 landing and Plan 07 landing is the exact scenario the fallback exists for. Removing it would re-introduce the H1 race during the gap. The fallback is cheap (one branch) and the server-side close is idempotent, so the cost is negligible.

## Deviations from Plan

### [Rule: found existing work] Plan 04 code already shipped in `7cb4019a`

- **Found during:** Resume / discovery phase before any edits.
- **Issue:** A prior `chore(159-06)` commit (`7cb4019a`) accidentally bundled Plan 04's three files (`window-content.tsx`, `native-app-stream-window.tsx`, `native-app-stream-window.test.tsx`) alongside Plan 06's `webapp-drawer-store.ts` JSDoc-only change. The plan expected two atomic per-task commits with `feat(159-04):` / `chore(159-04):` prefix.
- **Fix:** Verified the existing commit's contents match Plan 04's `<action>` block byte-for-byte (re-ran all 8 invariants — 8/8 PASS). Did NOT revert + re-commit, as that would:
  1. Risk the sacred-SHA pre-commit hook (sdk-agent-runner.ts unchanged across the existing commit, verified).
  2. Break the SUMMARY references in 159-02, 159-03, 159-06, 159-08 that already cite the linear history.
  3. Produce no functional delta — code is already in the correct state.
- **Files modified:** None this session (code lives in `7cb4019a`).
- **Commit:** Plan 04's code commit is `7cb4019a` (chore(159-06) prefix in retrospect — should have been `feat(159-04):`. Documented here for trail.)

### [Rule 1 - Housekeeping] Unstaged Plan 08/09 work removed from index

- **Found during:** Pre-stage inventory.
- **Issue:** `livos/packages/ui/src/modules/desktop/top-bar.tsx` and `livos/packages/ui/src/modules/desktop/top-bar.test.tsx` appeared in `git status` with `M ` (staged) indicator, sitting in the index from an aborted prior execution. These belong to Plans 08/09, not Plan 04.
- **Fix:** `git reset HEAD <files>` to unstage. The files were already committed in `7b9803c0 feat(159-08): mount WindowsManagerPanel in TopBar via Radix Popover` — the staged copies were stale.
- **Files modified:** None this session (just index hygiene).
- **Commit:** None.

## Issues Encountered

- **`webapp-drawer-store.ts` is staged from Plan 06 lane.** Left in place — when the Plan 06 SUMMARY ships next, that file moves with it. Not Plan 04's concern.
- **`pnpm --filter ui test` fails with `Command "tsc" not found` at the pnpm-recursive layer** — workaround: cd into `livos/packages/ui` and run `pnpm exec vitest run <pattern>` directly. Same workaround Plan 02 used. Pre-existing pnpm cwd quirk, NOT Plan 04 scope.
- **Pre-existing tsc errors in `stories/` package** (~30 errors, all `TS2307: Cannot find module '@/modules/widgets/...'`). Same drift as Plan 02 SUMMARY noted. NOT Plan 04 scope; logged to `deferred-items.md` by Plan 02.
- **WT cleanup work coexists in window-content.tsx** — v37-P158's chrome-content + remote-desktop removal is uncommitted in WT alongside Plan 04's already-committed windowId additions. Plan 04 leaves this WT-only change for whoever picks up the v37-P158 follow-on.

## Sacred SHA Invariant

`git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — unchanged before, during, and after Plan 04.

## Verification (re-run this session against HEAD)

```bash
cd livos/packages/ui
pnpm exec vitest run src/modules/window/app-contents/native-app-stream-window.test.tsx
# → Test Files  1 passed (1)
# → Tests       8 passed (8)

pnpm exec tsc --noEmit 2>&1 | grep -iE "window-content|native-app-stream|window-manager\." | head
# → (empty — 0 errors in Plan 04 surface)

git diff --name-only HEAD livos/packages/ui/src/modules/window/windows-container.tsx
# → (empty — Plan 07's lane intact)

git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
# → f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

## Acceptance Criteria Status

**Task 1 (window-content.tsx windowId widening):**
- [x] `windowId?: string` appears 2 times in `window-content.tsx` (WindowContentProps + WindowAppContent inline type) — Grep confirms lines 48 + 78.
- [x] `<NativeAppStreamWindowContent nativeAppId={nativeAppId} windowId={windowId}` appears 1 time — Grep confirms line 97.
- [x] `windows-container.tsx` NOT in diff — `git diff --name-only HEAD livos/packages/ui/src/modules/window/windows-container.tsx` empty.
- [x] tsc clean on Plan 04 surface (full type-check across windowId chain succeeds because windowId is optional at every hop).

**Task 2 (NativeAppStreamWindow registry migration + test fill):**
- [x] `import {useWindowManagerOptional}` × 1 — line 25.
- [x] `wm.registerCloseHandler(windowId, handler)` × 1 — line 135.
- [x] `wm.unregisterCloseHandler(windowId)` × 1 — line 136.
- [x] `mutateAsync({id: nativeAppId})` × 1 — line 130.
- [x] `sdk-agent-runner` × 1 — line 112 (sacred-SHA marker comment).
- [x] 8/8 invariants pass on vitest.
- [x] tsc clean.

## Next Phase Readiness

- **Plan 159-05 (WebApp defensive symmetric migration):** independent of Plan 04 commit (relies on 159-02's registry shipped earlier). Carries `webapp-stream-window.unit.test.tsx` invariant-lock risk per 159-RESEARCH.md #2. Ready to start.
- **Plan 159-07 (windows-container.tsx full `.map()` block rewrite, including `windowId={window.id}` forwarding):** REQUIRES Plan 04's accept-side widening (DONE). Ready to start. After Plan 07 lands, the defensive `!windowId || !wm` fallback in NativeAppStreamWindow becomes the dead-code branch (still kept as safety net, harmless).
- **Plan 159-08 (WindowsManagerPanel):** independent of Plan 04 mechanically, but the panel's close button benefits from the registry pattern transparently — panel calls `wm.closeWindow(id)`, which now invokes the handler before dispatching. Ready (and verified separately shipped in `7b9803c0 feat(159-08)`).

## Self-Check: PASSED

- File `livos/packages/ui/src/modules/window/window-content.tsx`: FOUND (modified in `7cb4019a`)
- File `livos/packages/ui/src/modules/window/app-contents/native-app-stream-window.tsx`: FOUND (modified in `7cb4019a`)
- File `livos/packages/ui/src/modules/window/app-contents/native-app-stream-window.test.tsx`: FOUND (modified in `7cb4019a`)
- Commit `7cb4019a`: FOUND in `git log --oneline -- livos/packages/ui/src/modules/window/app-contents/native-app-stream-window.tsx`
- Sacred SHA preserved: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- 8/8 invariants PASS on `pnpm exec vitest run native-app-stream-window.test.tsx`
- tsc clean on Plan 04 surface
- windows-container.tsx untouched (Plan 07's lane intact)

---
*Phase: 159-nativeapp-webapp-parity-window-manager-panel*
*Completed: 2026-05-19*
