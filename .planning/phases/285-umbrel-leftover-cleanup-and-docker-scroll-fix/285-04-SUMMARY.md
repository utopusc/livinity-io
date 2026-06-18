---
phase: 285-umbrel-leftover-cleanup-and-docker-scroll-fix
plan: 04
subsystem: ui
tags: [notifications, startup-migrations, umbrel-cleanup, livinityd, react, alert-dialog]

# Dependency graph
requires:
  - phase: 276-app-store-supabase-browse-migration-box-side-umbrel-docker-i
    provides: "Phase 276 already proved 'removing X is harmless' needs live-consumer verification (the MUST-NOT-BREAK discipline applied here)"
provides:
  - "livinityd boot no longer runs migrateBackThatMacUpPort() and never adds the migrated-back-that-mac-up notification"
  - "UI no longer has the Back That Mac Up / Time Machine notice copy (content fn + dispatch branch gone)"
  - "Integration test no longer references the deleted migrateBackThatMacUpPort method"
affects: [285-05, 285-06, 285-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lock-step removal: a boot-time notification trigger (backend) + its UI render copy + its test deleted in ONE atomic commit so boot never emits a notification the UI cannot render"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/startup-migrations/index.ts
    - livos/packages/livinityd/source/modules/startup-migrations/startup-migrations.integration.test.ts
    - livos/packages/ui/src/routes/notifications.tsx

key-decisions:
  - "Single lock-step commit (not per-task) per the plan objective: backend trigger + UI copy + test removed together so an already-deployed gap never opens between boot and render"
  - "Left now-dead module-level readYaml/writeYaml helpers (index.ts) and the now-unused readYaml/yaml import (test file) untouched — strictly out of this plan's narrow scope, cause zero tsc errors, minimize churn"
  - "Task 4 used the CONTEXT/RESEARCH-sanctioned tsc+grep fallback because the WSL livos-itest distro aborted on a pre-existing recursive ui/dist symlink loop (infra defect, not a code/test failure)"

patterns-established:
  - "When a boot migration adds a notification that the operator should never see again, delete the trigger AND the render copy AND the test atomically; keep the generic notification render loop + sibling notices (backups-failing, livos-updated) intact"

requirements-completed: [Item-3]

# Metrics
duration: ~12min
completed: 2026-06-18
---

# Phase 285 Plan 04: Remove Back That Mac Up / Time Machine Notification (Item 3) Summary

**Removed the legacy `migrated-back-that-mac-up` boot migration + its global AlertDialog copy + its integration test in one lock-step commit, while preserving the shared notification render loop, the live `backups-failing` notices, and `livos-updated` auto-clear.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-18T~21:07Z
- **Completed:** 2026-06-18T21:19Z
- **Tasks:** 4 (Task 1 baseline; Task 2 backend+test deletion; Task 3 UI deletion; Task 4 integration-test verification)
- **Files modified:** 3 (code) + 1 (deferred-items.md log)

## Accomplishments
- Deleted `migrateBackThatMacUpPort()` method (was `startup-migrations/index.ts:117-137`) and its `start()` try/catch call block (was `:179-184`) — all sibling migrations (`activateImportedDataDirectory`, `migrateLegacyData`, `migrateLegacyLinuxData`, `migrateDownloadsDirectory`, the version write, and the `livos-updated` add) intact; no empty try/catch left behind.
- Deleted `getMigratedBackThatMacUpContent()` (was `notifications.tsx:154-160`) and ONLY the `migrated-back-that-mac-up` dispatch branch (was `:215-217`) — the LIVE `backups-failing` dispatch branch directly above it, the generic AlertDialog render loop, `getBackupFailingContent`, the `livos-updated` auto-clear, and `getDefaultNotificationContent` all preserved.
- Deleted the entire integration test block `'Back That Mac Up app port is migrated from 445 to 1445'` (was `startup-migrations.integration.test.ts:43-88`) — neighboring tests (`legacy downloads`, `first run writes version`, `OS update adds a notification`) untouched; no dangling reference to the removed method.

## Task Commits

Per the plan `<objective>` ("All in ONE commit (lock-step)"), Tasks 2 and 3 were committed as a single atomic commit (backend trigger + UI copy + test must change in lock-step). Tasks 1 and 4 are measurement/verification only (no code).

1. **Task 1: Capture tsc baseline** - no commit (measurement only)
2. **Task 2 + Task 3: Lock-step removal (backend method + call block + test block + UI content fn + dispatch branch)** - `353c3ada` (feat)
3. **Task 4: Integration-test verification** - no commit (verification only; WSL run aborted on pre-existing infra → tsc+grep fallback)

**Plan metadata:** (final docs commit — see below)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/startup-migrations/index.ts` - removed `migrateBackThatMacUpPort()` + its `start()` call block; siblings intact
- `livos/packages/livinityd/source/modules/startup-migrations/startup-migrations.integration.test.ts` - removed the whole Back That Mac Up test block
- `livos/packages/ui/src/routes/notifications.tsx` - removed `getMigratedBackThatMacUpContent()` + the `migrated-back-that-mac-up` dispatch branch
- `.planning/.../deferred-items.md` - logged the WSL `livos-itest` recursive-symlink-loop infra defect (out of scope)

## Verification Gates (all PASSED)

| Gate | Expected | Result |
|------|----------|--------|
| livinityd `tsc --noEmit` total (baseline) | 305 | **305** (captured to `/tmp/285-tsc-baseline.txt`) |
| Baseline errors in `startup-migrations/index.ts` | 0 | **0** |
| livinityd `tsc --noEmit` total (after edits) | ≤305 | **305** (full diff vs baseline = NO NEW ERRORS) |
| After-edit errors in `startup-migrations/index.ts` | 0 | **0** |
| After-edit errors in the integration test file | 0 | **0** |
| `pnpm --filter ui build` | exit 0 | **exit 0** ("✓ built in 33.50s") |
| `grep -rc migrateBackThatMacUpPort livinityd/source` | 0 | **0** |
| `grep -rc migrated-back-that-mac-up livinityd/source` | 0 | **0** |
| `grep -c getMigratedBackThatMacUpContent notifications.tsx` | 0 | **0** |
| `grep -c migrated-back-that-mac-up notifications.tsx` | 0 | **0** |
| `grep -c backups-failing notifications.tsx` (live branch survives) | ≥1 | **11** |
| `grep -c getBackupFailingContent notifications.tsx` (survive) | ≥1 | **2** |
| `grep -c livos-updated notifications.tsx` (survive) | ≥1 | **4** |
| `grep -c getDefaultNotificationContent notifications.tsx` (survive) | ≥1 | **2** |
| generic render loop `standardNotifications.map` (survive) | ≥1 | **1** |
| `grep -c migrateDownloadsDirectory index.ts` (sibling survives) | ≥1 | **2** |
| `grep -c migrateLegacyLinuxData index.ts` (sibling survives) | ≥1 | **2** |
| `grep -c time-machine en.json` (i18n untouched; en.json NOT staged) | unchanged | **6** (byte-identical — not staged) |

## Decisions Made
- **Single lock-step commit** instead of per-task commits: the plan `<objective>` explicitly mandates "All in ONE commit (lock-step)". Removing the boot trigger without the UI copy (or vice versa) would open a transient gap where a deployed box could either emit a notification with no render copy or render copy for a notification never emitted. One commit keeps the removal atomic.
- **Left dead `readYaml`/`writeYaml` helpers** (index.ts:10-16) and the now-unused `readYaml`/`yaml` in the test file: they became dead solely because of this removal, but the plan's `<action>` scoped Task 2 narrowly to "the ENTIRE method", "the call block", and "the test block". They produce zero tsc errors (verified — full diff vs baseline shows NO NEW ERRORS), so removing them would be unrequested churn outside the plan's stated scope. Noted here for visibility.

## Deviations from Plan

None — plan executed exactly as written. (The "single lock-step commit" is the plan's own `<objective>` instruction, not a deviation; the per-task commit protocol yields to the explicit plan objective.)

## Issues Encountered
- **WSL `livos-itest` integration run aborted on a pre-existing infra defect (Task 4).** `wsl -d livos-itest -- pnpm --filter livinityd test startup-migrations.integration` crashed during vitest startup with `ELOOP: too many symbolic links` watching `/opt/livos/packages/livinityd/ui/dist/dist/dist/.../generated-tabler-icons/...`. The distro's `/opt/livos` deploy has a self-referential `ui/dist/dist/...` symlink loop; the vite FSWatcher crashed BEFORE any test was collected — so this is neither a code defect from this plan nor a failure of the deleted/remaining tests. OUT OF SCOPE (SCOPE BOUNDARY: pre-existing WSL-distro infra). Per the plan's Task 4 acceptance and CONTEXT/RESEARCH, fell back to the sanctioned acceptance: `tsc --noEmit` clean (305 = baseline, 0 in `startup-migrations/index.ts`) + zero dangling reference to `migrateBackThatMacUpPort`/`migrated-back-that-mac-up`/`Back That Mac Up` across livinityd source. Logged in `deferred-items.md`.

## Integration Test Path Taken (Task 4)
- **Path: tsc + grep fallback** (WSL run could not complete — see Issues Encountered).
- The deleted integration test block leaves no dangling reference (`grep -rn "Back That Mac Up" livinityd/source` → 0); the other three tests in the file are byte-untouched; tsc is clean. The remaining tests' correctness on Linux D-Bus is unverifiable in this Windows/WSL environment but the change is a pure deletion of one independent `test(...)` block — no shared fixture or helper used by the other tests was removed (the `readYaml`/`yaml` helper is dead now but was only used by the deleted test).

## User Setup Required
None - no external service configuration required. (CODE ONLY; box deploy is release-based via `bash /opt/livos/update.sh` → livinityd runs via tsx, UI is vite-built. Already-affected boxes keep the persisted `migrated-back-that-mac-up` ID until OK is clicked once; an unknown ID then falls through to `getDefaultNotificationContent` showing the raw ID once — operator confirmed they do not run the legacy app → near-zero impact.)

## Next Phase Readiness
- Item 3 fully removed and gate-verified. Remaining Phase 285 plans: 285-01 (Item 5 Docker scroll), 285-05 (Item 2b new Home/Live-Usage/App-Store tiles + repoint + delete last 5 PNGs), 285-06, 285-07.
- No blockers introduced. The shared notification machinery (`<Notifications/>`, generic render loop, `backups-failing`, `livos-updated`) and the legitimate Time Machine i18n strings remain intact for any future work.

## Self-Check: PASSED
- FOUND: `.planning/phases/285-umbrel-leftover-cleanup-and-docker-scroll-fix/285-04-SUMMARY.md`
- FOUND commit: `353c3ada`
- FOUND: all 3 modified source files exist on disk

---
*Phase: 285-umbrel-leftover-cleanup-and-docker-scroll-fix*
*Completed: 2026-06-18*
