---
phase: 285-umbrel-leftover-cleanup-and-docker-scroll-fix
plan: 02
subsystem: ui
tags: [icons, figma-exports, svg, dock, mobile-tab-bar, umbrel-cleanup, cache-bust]

# Dependency graph
requires:
  - phase: 285-01
    provides: Docker container-section scroll fix (prior safe-first plan in this phase; no code dependency)
provides:
  - Devices + Schedules system-app icons repointed to LivOS dock-settings-new.svg?v=285
  - Mobile Files/Settings/Server tab icons repointed to LivOS SVGs (dock-files-new / dock-settings-new / dock-server, all ?v=285)
  - dock.test.tsx Devices mock string locked in step with apps.tsx (character-for-character)
  - 8 always-orphan Umbrel PNGs deleted from figma-exports
affects: [285-05]  # Plan 05 authors new Home/Live-Usage/App-Store tiles and deletes the remaining 5 PNGs

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Icon repoint with ?v=285 cache-bust suffix (mirrors apps.tsx:143 dock-ai-chat.svg?v= convention)"
    - "dock.test.tsx mock icon literal kept character-for-character in lock-step with apps.tsx production literal"

key-files:
  created: []
  modified:
    - livos/packages/ui/src/providers/apps.tsx
    - livos/packages/ui/src/modules/mobile/mobile-tab-bar.tsx
    - livos/packages/ui/src/modules/desktop/dock.test.tsx

key-decisions:
  - "Repointed only the Umbrel PNG consumers that already have an existing LivOS SVG replacement (Devices/Schedules, mobile Files/Settings/Server) — Home/Live-Usage/App-Store deferred to Plan 05 (need new tiles)"
  - "Deleted only the 8 grep-verified zero-importer Umbrel PNGs; left the 5 still-referenced PNGs (dock-home/live-usage/app-store/settings/files) for Plan 05 lock-step deletion"

patterns-established:
  - "Pattern 1: ?v=285 cache-bust on every repointed icon string this phase"
  - "Pattern 2: mock-string lock-step — dock.test.tsx Devices mock changed in the same logical change set as apps.tsx"

requirements-completed: [Item-2]

# Metrics
duration: 4min
completed: 2026-06-18
---

# Phase 285 Plan 02: Umbrel Icon Repoint + Orphan-PNG Delete (Item 2a) Summary

**Repointed the Devices/Schedules + mobile Files/Settings/Server icons from Umbrel PNGs to existing LivOS SVGs (with ?v=285 cache-bust), locked the dock.test.tsx mock in step, and deleted 8 zero-importer Umbrel PNGs — all gated by a clean `pnpm --filter ui build`.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-18T19:50:54Z
- **Completed:** 2026-06-18T19:54:52Z
- **Tasks:** 3
- **Files modified:** 3 modified + 8 deleted

## Accomplishments
- `apps.tsx`: Devices (`LIVINITY_my-devices`) and Schedules (`LIVINITY_schedules`) now use `dock-settings-new.svg?v=285` (was Umbrel `dock-settings.png`).
- `mobile-tab-bar.tsx`: Files → `dock-files-new.svg?v=285`, Settings → `dock-settings-new.svg?v=285`, Server → `dock-server.svg?v=285` (was Umbrel `dock-files.png` / `dock-settings.png`).
- `dock.test.tsx`: Devices mock icon literal repointed to `dock-settings-new.svg?v=285`, character-for-character matching the new `apps.tsx` literal; dock.test.tsx passes 9/9.
- Deleted the 8 always-orphan Umbrel PNGs (`dock-chrome`, `dock-preview`, `dock-widgets`, `dock-remote-desktop`, `app-facebook`, `app-gmail`, `app-whatsapp`, `app-youtube`) — all re-verified zero importers at execute time.

## Task Commits

Each task was committed atomically:

1. **Task 1: Repoint Devices/Schedules + mobile tab icons** - `29c50390` (feat)
2. **Task 2: Lock-step dock.test Devices mock** - `f29e51ef` (test)
3. **Task 3: Delete 8 always-orphan Umbrel PNGs** - `c1d43bbe` (chore)

**Plan metadata:** (final docs commit — STATE/ROADMAP/SUMMARY)

## Files Created/Modified
- `livos/packages/ui/src/providers/apps.tsx` - Devices + Schedules registry icons → `dock-settings-new.svg?v=285`.
- `livos/packages/ui/src/modules/mobile/mobile-tab-bar.tsx` - Files/Settings/Server `appIcon` paths → LivOS SVGs with `?v=285`.
- `livos/packages/ui/src/modules/desktop/dock.test.tsx` - Devices mock icon literal locked to the new `apps.tsx` string.
- Deleted: `livos/packages/ui/public/figma-exports/{dock-chrome,dock-preview,dock-widgets,dock-remote-desktop,app-facebook,app-gmail,app-whatsapp,app-youtube}.png`.

## Decisions Made
- Followed the plan exactly. Touched only Devices (:99) + Schedules (:107) in `apps.tsx`; left Home (:42), Live Usage (:63), App Store (:72) on their PNGs for Plan 05 (they need new authored tiles).
- Kept the 5 still-referenced PNGs (`dock-home.png`, `dock-live-usage.png`, `dock-app-store.png`, `dock-settings.png`, `dock-files.png`) — they retain importers until Plan 05 repoints them; deleting now would break the intermediate `ui build` (lock-step rule).
- The single remaining `dock-settings.png` token in `apps.tsx` is the historical comment at line 86 (not an `icon:` line), as the plan anticipated.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Test-runner script name mismatch (not a deviation, no code change):** The plan's verify step specifies `pnpm --filter ui test -- dock`, but `packages/ui/package.json` has no `test` script — only `test:run` (`vitest run`). `pnpm` exits 0 with a missing-script warning, so the bare command ran nothing. I ran the real script: `pnpm --filter ui test:run src/modules/desktop/dock.test.tsx` → **9/9 passed** (the lock-step gate the plan intended). Running the broad `test:run dock` substring matches `routes/docker/**` unit tests, which surface 19 pre-existing `localStorage is not defined` failures in files last touched in Phase 29-01 (commit `6949a23b`) — untouched by this plan, OUT OF SCOPE per the scope-boundary rule. Logged to `deferred-items.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 05 (Item 2b) is now unblocked for the icon work: it must author the 3 new tiles (`dock-home.svg`, `dock-live-usage.svg`, `dock-app-store.svg`), repoint Home/Live-Usage/App-Store in `apps.tsx` (+ live-usage/app-store mock strings in `dock.test.tsx`), then delete the remaining 5 PNGs in lock-step.
- No blockers.

## Verification Gate Result
- `cd livos && pnpm --filter ui build` → **exit 0** (clean) — run after Task 1 (repoints) and again after Task 3 (deletions); no dangling import to any deleted PNG.
- `pnpm --filter ui test:run src/modules/desktop/dock.test.tsx` → **9/9 passed** (mock lock-step gate).
- All `grep -c` acceptance criteria in Tasks 1-3 returned the expected counts.

## Self-Check: PASSED

- SUMMARY file present: `285-02-SUMMARY.md`
- All 3 task commits exist in history: `29c50390`, `f29e51ef`, `c1d43bbe`
- All 3 modified files present on disk.

---
*Phase: 285-umbrel-leftover-cleanup-and-docker-scroll-fix*
*Completed: 2026-06-18*
