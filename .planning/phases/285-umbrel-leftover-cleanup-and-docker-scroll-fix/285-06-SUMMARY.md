---
phase: 285-umbrel-leftover-cleanup-and-docker-scroll-fix
plan: 06
subsystem: ui
tags: [react, react-router, window-manager, files, command-palette, umbrel-cleanup]

# Dependency graph
requires:
  - phase: 285-02
    provides: dock.test.tsx mock seam (default-pins assertion re-checked here)
  - phase: 285-05
    provides: dock icon disposition (original icons kept; mock strings stable)
  - phase: 285-07
    provides: the 3 backups deep-links repointed to windowManager.openWindow + FilesWindowContent ?dialog=/?rewind= suffix-parser (so removing the full-page route cannot 404 them)
provides:
  - Files opens ONLY as a LivOS window (FilesWindowContent) — no browser-URL change to /files/Home, no umbrelOS full-page 3-col layout
  - apple-spotlight (live Search palette) + cmdk palette Files/Recents/Apps/Trash actions repointed to windowManager.openWindow('LIVINITY_files', …) with navigate() fallback
  - Full-page /files route removed: filesRoutes import + spread deleted from router.tsx; features/files/routes.tsx + features/files/index.tsx (FilesLayout) deleted
affects: [files, window-manager, command-palette, future Umbrel-cleanup phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Palette launch entries open Files via windowManager.openWindow('LIVINITY_files', route, 'Files', icon) with a navigate() fallback when windowManager is null (mirrors desktop-folder.tsx:87-101)"

key-files:
  created: []
  modified:
    - livos/packages/ui/src/components/apple-spotlight.tsx
    - livos/packages/ui/src/components/cmdk.tsx
    - livos/packages/ui/src/router.tsx
  deleted:
    - livos/packages/ui/src/features/files/routes.tsx
    - livos/packages/ui/src/features/files/index.tsx

key-decisions:
  - "Option A (LOCKED): remove the full-page /files route mount + repoint palette launch entries to the window; keep FilesWindowContent as the only Files surface"
  - "Repointed cmdk (dead/Docker-only palette) too for consistency, even though it is not the live palette"
  - "dock.test.tsx required NO edit — its default-pins assertion tests the data-test seam, not the /files route (passed 9/9 unchanged)"

patterns-established:
  - "Repoint-before-delete: every consumer of the full-page route (palettes here + 3 backups deep-links in prior-wave Plan 07) targets the window BEFORE the route is deleted → no intermediate-state 404 (Phase-276 trap avoided)"

requirements-completed: [Item-1]

# Metrics
duration: 18min
completed: 2026-06-18
---

# Phase 285 Plan 06: Remove full-page /files route + repoint palettes to windowed Files (Item 1a) Summary

**Files now opens ONLY as a LivOS window (FilesWindowContent) — the umbrelOS full-page /files route is removed and both command palettes repoint their Files/Recents/Apps/Trash actions to windowManager.openWindow('LIVINITY_files', …) with a navigate() fallback.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-18T15:46Z (approx)
- **Completed:** 2026-06-18T15:54Z (approx)
- **Tasks:** 3
- **Files modified:** 3 modified + 2 deleted

## Accomplishments
- Repointed the live `apple-spotlight.tsx` Search palette: added `useWindowManagerOptional()` (it had NO window-manager hook before) and moved Files + Recents + Apps + Trash from `navigate('/files…')` to `windowManager.openWindow('LIVINITY_files', target, 'Files', icon)` with a `navigate()` fallback. Home + all Settings actions left on `navigate`.
- Repointed `cmdk.tsx` (dead/Docker-only palette) Files/Recents/Apps/Trash to the already-present `windowManager` with the same fallback pattern.
- Removed the full-page `/files` route: deleted the `filesRoutes` import + `...filesRoutes` spread from `router.tsx` SheetLayout (replaced the stale OwnCloud "preserved" comment with a Phase-285 removal note), and `git rm`'d `features/files/routes.tsx` (defined `filesRoutes`) + `features/files/index.tsx` (`FilesLayout` full-page 3-col wrapper).
- Kept the windowed surface and all shared modules intact: `FilesWindowContent` (incl. Plan 07's `?dialog=`/`?rewind=` suffix-parser + `forcedDeviceId` — 3 refs survive), the shared `features/files/components/sidebar/`, `apps.tsx` `systemAppTo:'/files/Home'`, and `system-windowed-routes.ts` `LIVINITY_files = '/files/Home'`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Repoint apple-spotlight Files actions** - `6ca16017` (feat)
2. **Task 2: Repoint cmdk Files actions** - `6ded94e9` (feat)
3. **Task 3: Remove full-page /files route + delete route tree and wrapper** - `e33b811a` (feat)

**Plan metadata:** (final docs commit — SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `livos/packages/ui/src/components/apple-spotlight.tsx` — added `useWindowManagerOptional()`; Files/Recents/Apps/Trash actions open the window (navigate fallback)
- `livos/packages/ui/src/components/cmdk.tsx` — Files/Recents/Apps/Trash actions open the window via the already-present windowManager (navigate fallback)
- `livos/packages/ui/src/router.tsx` — removed `filesRoutes` import + `...filesRoutes` spread; replaced stale OwnCloud comment with a Phase-285 removal note
- `livos/packages/ui/src/features/files/routes.tsx` — **DELETED** (defined the full-page `filesRoutes` only; lazy-imported the bare index)
- `livos/packages/ui/src/features/files/index.tsx` — **DELETED** (the `FilesLayout` full-page 3-col wrapper, imported only by the deleted routes.tsx)

## Decisions Made
- Followed Option A (LOCKED in CONTEXT) exactly: remove the route, keep the window, repoint the palettes.
- `dock.test.tsx` needed NO edit — its default-pins / icon-mock assertions key on the data-test seam and the mock `systemAppTo`, not the route. It passed 9/9 at baseline and after the route removal.
- Kept the multi-line palette actions in `{ … }` block form (with a `const target = …` local) so `openWindow('LIVINITY_files'` stays on one line per action — this both reads cleanly and satisfies the literal grep acceptance criterion (4 single-line matches).

## Deviations from Plan

None - plan executed exactly as written.

Two file:line drift notes (verified against master before editing, as the plan instructed — NOT deviations, the plan explicitly warned line numbers had drifted):
- `system-windowed-routes.ts` lives at `modules/desktop/system-windowed-routes.ts`, not `modules/window/…` as one acceptance line stated. The `LIVINITY_files = '/files/Home'` entry is present and was KEPT (verified, 1 ref).
- All apple-spotlight / cmdk / router line numbers matched the plan's stated lines on master — no drift there.

## Issues Encountered
- First pass on the apple-spotlight Recents/Apps/Trash actions used a multi-line `windowManager.openWindow(\n 'LIVINITY_files', …)` formatting, which dropped the `openWindow('LIVINITY_files'` single-line grep count to 1. Reformatted to a `{ const target = …; if (windowManager) windowManager.openWindow('LIVINITY_files', target, …); else navigate(target) }` block so all 4 actions match on one line. Re-grep returned 4 (criterion met). Caught before the Task-1 commit.

## Verification Gate Results
- `cd livos && pnpm --filter ui build` → **exit 0** after every task (CRITICAL gate — proves no dangling `FilesLayout`/`filesRoutes`/`@/features/files` import after the route + wrapper deletion). Final build: `✓ built in 30.69s`.
- `cd livos && pnpm --filter ui test:run src/modules/desktop/dock.test.tsx` → **9/9 pass** (baseline and post-removal, no edit needed).
- grep: 0 `filesRoutes` refs, 0 bare `@/features/files` importers, both full-page files deleted; `FilesWindowContent` + shared sidebar + `apps.tsx` systemAppTo + `system-windowed-routes.ts` LIVINITY_files all KEPT; Plan 07's `ALLOWED_DIALOGS`/`forcedDeviceId` additions intact (3 refs).

## User Setup Required
None - no external service configuration required. Box deploy is release-based (tag → `bash /opt/livos/update.sh`); the UI is vite-built (this build gate is the on-box backstop), livinityd is unaffected (no backend change in this plan).

## Next Phase Readiness
- Item 1 (Files redirect → Option A) is now fully shipped across the phase: Plan 07 repointed the 3 backups deep-links + added the windowed dialog suffix-parser (prior wave); this plan removed the route + repointed the palettes. No /files full-page surface remains.
- Phase 285 plan set is now complete (07/07 plans have summaries after this one). Ready for verifier + phase close.

## Self-Check: PASSED

- SUMMARY.md created: FOUND
- Commits exist: `6ca16017`, `6ded94e9`, `e33b811a` all FOUND
- Deleted files gone: `features/files/routes.tsx`, `features/files/index.tsx`
- Modified files present: `apple-spotlight.tsx`, `cmdk.tsx`, `router.tsx`
