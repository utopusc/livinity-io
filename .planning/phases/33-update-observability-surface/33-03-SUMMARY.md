---
phase: 33-update-observability-surface
plan: 03
subsystem: ui
tags: [phase-33, observability, ui, react, settings, vitest, smoke-test, badge, dialog, table, deferred-rtl]

# Dependency graph
requires:
  - phase: 33-update-observability-surface
    provides: "Plan 33-01 system.listUpdateHistory + system.readUpdateLog adminProcedure routes (consumed by PastDeploysTable + UpdateLogViewerDialog)"
  - phase: 33-update-observability-surface
    provides: "Plan 33-02 update.sh logging patch (writes the .log + <ts>-success/failed.json files that the table surfaces)"
  - phase: 30-update-stability
    provides: "useSoftwareUpdate() hook (consumed by MenuItemBadge to derive UX-04 visibility from .state)"
provides:
  - "PastDeploysTable React component (Settings > Software Update; renders 50 rows from listUpdateHistory)"
  - "UpdateLogViewerDialog modal component (tail-500 + Download full log via Blob anchor click)"
  - "MenuItemBadge React component (sidebar dot when state='update-available' AND activeSection !== 'software-update' per O-05 LOCK)"
  - "settings-content.tsx wired in 5 splice points (2 imports + Past Deploys h3+component + 3 MenuItemBadge injection sites: home view, detail view, mobile home view)"
  - "3 new vitest+jsdom smoke tests (with deferred RTL plans inline; 7+6+4 deferred RTL tests documented for when @testing-library/react lands)"
affects:
  - Phase 33 phase-level UAT (deploy via update.sh on Mini PC, observe table populates with real deploy rows + dialog renders log + badge appears in both themes)
  - Future plans that add @testing-library/react to UI devDeps (the 17 deferred RTL tests can be lifted verbatim from the smoke-file comment blocks)

# Tech tracking
tech-stack:
  added: []  # No new deps — reuses existing date-fns, shadcn Table/Dialog/Badge/Button, trpcReact + trpcClient
  patterns:
    - "Smoke + deferred-RTL pattern (Plan 30-02 D-04 precedent extended): when @testing-library/react absent, ship import-only smoke tests that flip RED→GREEN as components materialize, with full RTL test plan documented inline so future plans can adopt verbatim"
    - "Browser-side basename derivation for path-traversal defense in depth: `row.log_path?.split('/').pop()` strips server-absolute paths before tRPC calls, complementing the backend's 3-layer guard (R-10)"
    - "O-05 LOCK badge dismissal: a notification badge hides itself when the user is on the page it points to (activeSection === target), even if the underlying state still indicates the condition — the badge is a notification, not a duplicate page indicator"

key-files:
  created:
    - livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx
    - livos/packages/ui/src/components/update-log-viewer-dialog.tsx
    - livos/packages/ui/src/routes/settings/_components/menu-item-badge.tsx
    - livos/packages/ui/src/routes/settings/_components/past-deploys-table.unit.test.tsx
    - livos/packages/ui/src/components/update-log-viewer-dialog.unit.test.tsx
    - livos/packages/ui/src/routes/settings/_components/menu-item-badge.unit.test.tsx
    - .planning/phases/33-update-observability-surface/33-03-SUMMARY.md
  modified:
    - livos/packages/ui/src/routes/settings/_components/settings-content.tsx
    - .planning/phases/33-update-observability-surface/deferred-items.md

key-decisions:
  - "Smoke tests + deferred-RTL pattern: @testing-library/react is NOT in UI devDeps (verified via package.json — only vitest + jsdom are present). Shipped 1 smoke test per file (import + typeof assertion) plus a comment block enumerating the 4-7 deferred RTL tests per file so a future plan adding RTL can lift them verbatim. Same Plan 30-02 D-04 precedent the previous Wave 0 plan locked in."
  - "DialogScrollableContent fallback: This repo's DialogScrollableContent wraps a ScrollArea with a `showClose` prop — different shape than the research skeleton assumed. Used the inline 'max-h-[60vh] overflow-y-auto' wrapper inside DialogContent (per the plan's <action> note's Plan B). Visually equivalent; avoids the export-shape mismatch."
  - "Three MenuItemBadge injection sites (not two): Plan called for home + detail view; I added the mobile home view too for cross-viewport UX consistency. The plan's <action> Step B-5 explicitly enumerated this third site. Total grep count for MenuItemBadge in settings-content.tsx is 4 (1 import + 3 injection sites) — matches the plan's acceptance criterion of `>= 4`."

patterns-established:
  - "UI smoke test format: `// @vitest-environment jsdom` directive + `expect(typeof Component).toBe('function')` + a comment block listing N deferred RTL tests with their setup, action, assertion. Forces a real RED state on first commit (import resolution fails) without forcing the executor to install @testing-library/react in a Wave 0 context."
  - "Defense-in-depth path traversal: backend's 3-layer guard (basename equality + alnum-leading regex + resolved-path containment) is mirrored UI-side by basename-stripping at the call site. Even if a future UI bug sent the absolute log_path, the backend would reject with BAD_REQUEST."
  - "Notification badge with activeSection-aware dismissal: when adding any notification surface to a settings sidebar, also pass the activeSection so the notification can hide itself when the user navigates to the targeted page (saves a click and prevents the badge from looking like a permanent page indicator)."

requirements-completed: [OBS-02, OBS-03, UX-04]

# Metrics
duration: ~10min
completed: 2026-04-27
---

# Phase 33 Plan 03: Frontend OBS-02/03 + UX-04 Surface Summary

**Three new React components (PastDeploysTable, UpdateLogViewerDialog, MenuItemBadge) wired into Settings > Software Update at 5 splice points, surfacing the Plan 33-01 backend routes + Plan 33-02 logging artifacts as a Past Deploys table with click-through log viewer + a brand-color sidebar dot when an update is available.**

## Performance

- **Duration:** ~10 min (worktree mode; environment was warm — pnpm install for UI ran during execution but vitest binary surfaced before completion)
- **Started:** 2026-04-27T10:33:38Z
- **Completed:** 2026-04-27T10:43:04Z
- **Tasks:** 4 (TDD: RED + GREEN + GREEN + GREEN)
- **Files created:** 7 (3 components + 3 test files + this SUMMARY)
- **Files modified:** 2 (settings-content.tsx + deferred-items.md)

## Accomplishments

- `PastDeploysTable` (~173 lines) renders the 50-row history with 4 columns (SHA, When, Status, Duration), handles loading/error/empty states, click-through to log dialog, and applies the R-10 basename mitigation so server-absolute log_paths never flow back to the readUpdateLog tRPC call.
- `UpdateLogViewerDialog` (~96 lines) opens with `enabled: open` so the React-Query tail fetch is lazy, renders content in a monospace `<pre>` with `bg-surface-1`, shows the "Showing last 500 of N lines" hint when the backend reports `truncated: true`, and downloads the full log via `trpcClient.system.readUpdateLog.query({full: true})` → `Blob('text/plain')` → anchor click.
- `MenuItemBadge` (~49 lines) implements the O-05 LOCK contract from R-08: render only when `itemId === 'software-update'` AND `state === 'update-available'` AND `activeSection !== 'software-update'`. Uses `bg-brand` Tailwind token (R-09 verified — auto-flips light/dark via existing software-update-list-row.tsx + mobile/software-update.tsx usage).
- `settings-content.tsx` modified with 5 splice points: 2 new imports + h3+PastDeploysTable injection inside SoftwareUpdateSection + 3 MenuItemBadge injection sites (desktop home view, detail view, mobile home view). Required adding `relative` class to the home-view motion.button containers (the detail-view button already had it).
- 3 new vitest smoke test files; all 3 pass; each file documents 4-7 deferred RTL tests inline as a comment block for future adoption.

## Task Commits

Each task was committed atomically with `--no-verify` (worktree mode):

1. **Task 1 (RED): add failing tests for Phase 33 UI components** — `acb42a2a` (test)
2. **Task 2 (GREEN): implement UpdateLogViewerDialog modal** — `ea25132f` (feat)
3. **Task 3 (GREEN): implement PastDeploysTable component** — `72e74139` (feat)
4. **Task 4 (GREEN): wire PastDeploysTable + MenuItemBadge into settings-content** — `b9705410` (feat)

_TDD gate sequence: test(33-03) → feat(33-03) → feat(33-03) → feat(33-03). Both RED and GREEN gates present in `git log`._

## Files Created/Modified

### Created

- `livos/packages/ui/src/components/update-log-viewer-dialog.tsx` (96 lines) — Dialog wrapper with tail-500 React-Query fetch, monospace `<pre>` render, truncated banner, Blob-download via vanilla `trpcClient`. Falls back from research's `DialogScrollableContent` to the inline `max-h-[60vh] overflow-y-auto` wrapper because this repo's DialogScrollableContent has a different shape (ScrollArea + showClose prop).
- `livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx` (173 lines) — 4-column shadcn Table fed by `trpcReact.system.listUpdateHistory.useQuery({limit: 50})`. Includes `formatDuration`, `safeFormatRelative`, and `basenameFromLogPath` helpers. Loading/Error/Empty branches; rows without `log_path` (precheck-failed before SHA known) get non-clickable styling.
- `livos/packages/ui/src/routes/settings/_components/menu-item-badge.tsx` (49 lines) — Tiny extracted component with the 3-condition guard. Returns null in 3 cases, renders the `bg-brand` dot in the 4th. Uses `useSoftwareUpdate().state` directly (R-07: React Query dedupes the underlying query across all menu-item subscribers).
- 3 vitest smoke test files (~55-65 lines each) under the canonical `*.unit.test.tsx` naming. Each starts with `// @vitest-environment jsdom`, imports the target component, asserts `typeof Component === 'function'`, and documents the deferred RTL test list as an inline comment block.

### Modified

- `livos/packages/ui/src/routes/settings/_components/settings-content.tsx`:
  - Added `import {PastDeploysTable} from './past-deploys-table'` and `import {MenuItemBadge} from './menu-item-badge'` next to the existing `SoftwareUpdateListRow` import (line 114).
  - Replaced `SoftwareUpdateSection()` body to include `<h3>Past Deploys</h3>` + `<PastDeploysTable />` after the existing `<SoftwareUpdateListRow>`.
  - Added `relative` class to the desktop home-view `motion.button` and injected `<MenuItemBadge itemId={item.id} activeSection={activeSection} />` as its last child.
  - Added `<MenuItemBadge itemId={item.id} activeSection={section} />` as the last child of the detail-view `<button>` (which already had `relative`).
  - Added `relative` class to the mobile home-view `motion.button` and injected `<MenuItemBadge itemId={item.id} activeSection={activeSection} />` as its last child.
- `.planning/phases/33-update-observability-surface/deferred-items.md` — added a new entry under "33-03 (Plan: frontend OBS-02/03/UX-04 surface)" documenting the pre-existing tRPC AppRouter type-collision (D-05) that affects 194 call sites including the 3 new Phase 33 files.

## Decisions Made

- **Smoke + deferred-RTL pattern.** `@testing-library/react` is not in `livos/packages/ui/package.json` devDeps — only `vitest` (^2.1.9) and `jsdom` (^25.0.1) are present. Per Plan 30-02 D-04 precedent, shipped a single smoke test per file that imports the target component and asserts the export is a function, plus a multi-line `/* Deferred RTL tests: ... */` comment block enumerating the full test list (PT1-PT7 for table, UD1-UD6 for dialog, MB1-MB4 for badge — 17 deferred tests total). When a future plan adds `@testing-library/react` to UI devDeps, those test plans can be lifted verbatim into vitest blocks.
- **DialogScrollableContent fallback.** The research skeleton imported `DialogScrollableContent` from `@/shadcn-components/ui/dialog` and used it as a `<DialogScrollableContent className='max-h-[60vh]'>` wrapper. The actual export in this repo (verified during Task 2 read) wraps the children in a `ScrollArea` and takes a `showClose` prop — incompatible shape. Used the plan's documented Plan B fallback: an inline `<div className='max-h-[60vh] overflow-y-auto'>` inside `DialogContent`. Visually equivalent for the log-viewer use case.
- **Three MenuItemBadge injection sites (not two).** Plan acceptance criterion expected `grep -c "MenuItemBadge" settings-content.tsx >= 4` (import + home + detail + mobile home). The plan's `<action>` Step B-5 explicitly added the mobile home view as a third injection site for cross-viewport UX consistency. Final count: 4. Met criterion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bootstrapped pnpm install for UI package so vitest binary was available**
- **Found during:** Task 1 verify (first attempt to run vitest)
- **Issue:** Fresh worktree had no `node_modules/.bin/vitest` for the UI package. `pnpm install --filter ui` was needed to surface the binary so the RED tests could be confirmed to fail for the expected reason (module not found, not "vitest not installed"). Same shape as Plan 33-01 Deviation #2.
- **Fix:** `cd livos && pnpm install --filter ui`. The install completed all real work but exited non-zero because the `postinstall` script (`npm run copy-tabler-icons`) uses `mkdir -p && cp -r` which fails on Windows — that failure is unrelated to vitest binary placement, which had already happened before the postinstall ran.
- **Files modified:** None tracked by git — `livos/pnpm-lock.yaml` was modified by `pnpm install` but I did NOT include it in any commit (kept off-tree to preserve the lockfile invariant).
- **Verification:** `livos/packages/ui/node_modules/.bin/vitest` exists; `vitest run` collects + runs the 3 RED tests cleanly.
- **Committed in:** N/A (env bootstrap, not source change)

**2. [Rule 3 - Style] DialogScrollableContent shape mismatch — used inline scroll wrapper instead**
- **Found during:** Task 2 (creating UpdateLogViewerDialog from research skeleton)
- **Issue:** The research skeleton imports `DialogScrollableContent` and uses it as `<DialogScrollableContent className='max-h-[60vh]'>{...}</DialogScrollableContent>`. The actual export at `@/shadcn-components/ui/dialog.tsx:61-71` wraps children in a `ScrollArea` and accepts only `{children, showClose?}` — no `className` prop. Importing it as the research skeleton showed would either lose the `max-h-[60vh]` constraint (className silently dropped) or cause a TS prop-type error.
- **Fix:** Used the plan's documented Plan B fallback in the `<action>` block: `<div className='max-h-[60vh] overflow-y-auto'>` inside `DialogContent`. Visual behaviour matches the original intent — log content scrolls within a 60vh window.
- **Files modified:** `livos/packages/ui/src/components/update-log-viewer-dialog.tsx`
- **Verification:** Smoke test passes; visual verification deferred to phase-level UAT (manual browser smoke after Mini PC deploy).
- **Committed in:** `ea25132f` (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking env, 1 Rule 3 style adjustment).
**Impact on plan:** Both deviations were anticipated by the plan itself (Deviation 2 explicitly listed as Plan B in the `<action>` block; Deviation 1 mirrors Plan 33-01 Deviation #2). No scope creep, no contract changes.

## Issues Encountered

- **Pre-existing TypeScript errors in trpcReact accesses (194 occurrences across the UI package).** Verified via `tsc --noEmit`: the AppRouter type collapses to a string-literal union of "Property X collides with built-in method" error messages, which makes every `trpcReact.<router>.<procedure>` access TS-fail. The new Phase 33 files inherit this exact same failure pattern (lines: `update-log-viewer-dialog.tsx:36`, `past-deploys-table.tsx:80`). NOT a regression — the same error appears at 192 other call sites (e.g., `settings-content.tsx:185, 619-621, 833, 881-905, 1054-1057, ...` and many other unmodified files). Documented in `deferred-items.md`. Runtime is unaffected (smoke tests pass; the running app uses these hooks daily).
- No other issues during planned work.

## TDD Gate Compliance

`git log` shows the required test→feat→feat→feat sequence:

```
b9705410 feat(33-03): wire PastDeploysTable + MenuItemBadge into settings-content
72e74139 feat(33-03): implement PastDeploysTable component
ea25132f feat(33-03): implement UpdateLogViewerDialog modal
acb42a2a test(33-03): add RED tests for Phase 33 UI components
```

- RED gate: `acb42a2a` — all 3 new test files fail with "Failed to resolve import" (genuine RED — the components didn't exist yet).
- GREEN gate (UD): `ea25132f` — UpdateLogViewerDialog smoke flips GREEN.
- GREEN gate (PT): `72e74139` — PastDeploysTable smoke flips GREEN.
- GREEN gate (MB + wire): `b9705410` — MenuItemBadge smoke flips GREEN AND settings-content.tsx wires all 3 components in.

No REFACTOR commit — implementations are the simplest form satisfying the contract.

## Threat Flags

None. The 3 new components are pure presentation + read-only tRPC consumers behind the Plan 33-01 adminProcedure perimeter. All threats modeled in the plan's `<threat_model>` block (T-33-10 through T-33-13) have corresponding production code paths:

- T-33-10 (Information Disclosure via absolute path leak): `basenameFromLogPath()` strips to basename before any tRPC call — defense in depth on top of the backend's 3-layer guard.
- T-33-11 (DoS via large download): `setDownloading(true)` disables the Download button during fetch; backend caps at 50MB per O-04.
- T-33-12 (Badge state spoofing): accepted — pure render of `useSoftwareUpdate().state`; user can't escalate by spoofing their own browser state.
- T-33-13 (Log content leakage to shoulder-surfer): accepted — adminProcedure on readUpdateLog is the perimeter; the user opening the modal is already an authenticated admin.

## User Setup Required

None — pure UI plan. The 3 new components consume already-shipped backend routes (Plan 33-01) and read the .log/.json files written by the Mini PC patched update.sh (Plan 33-02). No environment variables, no database migrations, no service restarts. The UI deploy path is the standard `update.sh` flow already in use.

## Carry-forward for Phase-Level UAT

After the next `bash /opt/livos/update.sh` run on the Mini PC, manual browser verification should confirm:

- [ ] Settings > Software Update page renders the Past Deploys table.
- [ ] Table shows at least 1 row (the most recent deploy that ran the patched update.sh).
- [ ] Click a row → UpdateLogViewerDialog opens; tail-500 visible in monospace; truncated banner visible if applicable.
- [ ] Click "Download full log" → browser triggers a download with the .log filename; downloaded file content matches what's on disk.
- [ ] Trigger an "update available" state (e.g., point latest to a newer SHA) → sidebar shows the brand-color dot on Software Update row in BOTH light and dark themes.
- [ ] Click Software Update menu row → badge disappears (per O-05 LOCK).
- [ ] After successful install → state becomes 'at-latest' → badge stays gone (per useSoftwareUpdate refetchOnMount: 'always').

## Phase 33 Close-out Checklist

- [x] OBS-01 satisfied via Plan 33-02 (logs + JSON written by patched update.sh)
- [x] OBS-02 satisfied via Plans 33-01 (backend listUpdateHistory route) + 33-03 (PastDeploysTable UI)
- [x] OBS-03 satisfied via Plans 33-01 (readUpdateLog route + 3-layer traversal guard) + 33-03 (UpdateLogViewerDialog modal + Download)
- [x] UX-04 satisfied via Plan 33-03 (MenuItemBadge wired in 3 sidebar render sites: home, detail, mobile home)

All Phase 33 success criteria are now feature-complete from a code perspective. Phase-level UAT (above) closes the loop on the live deploy path.

## Next Phase Readiness

- Phase 33 implementation complete. Ready for orchestrator to merge this worktree, mark phase as DONE in ROADMAP after UAT, and select the next phase from the roadmap.
- Pre-existing tRPC AppRouter type-collision (194 errors) remains a phase-level cleanup task — recommend adding it to the roadmap as a future plan or hot-fix. Does not block any Phase 33 deliverable.

## Self-Check: PASSED

Verified before commit:

```
$ git log --oneline | head -5
b9705410 feat(33-03): wire PastDeploysTable + MenuItemBadge into settings-content
72e74139 feat(33-03): implement PastDeploysTable component
ea25132f feat(33-03): implement UpdateLogViewerDialog modal
acb42a2a test(33-03): add RED tests for Phase 33 UI components
32c6e8f6 docs(phase-33): mark Wave 1 plans complete (33-01 backend, 33-02 logging patch)
```

Files all exist:

- ✓ `livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx` (173 lines)
- ✓ `livos/packages/ui/src/components/update-log-viewer-dialog.tsx` (96 lines)
- ✓ `livos/packages/ui/src/routes/settings/_components/menu-item-badge.tsx` (49 lines)
- ✓ `livos/packages/ui/src/routes/settings/_components/past-deploys-table.unit.test.tsx`
- ✓ `livos/packages/ui/src/components/update-log-viewer-dialog.unit.test.tsx`
- ✓ `livos/packages/ui/src/routes/settings/_components/menu-item-badge.unit.test.tsx`
- ✓ `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` (modified — 5 splice points: 2 imports + Past Deploys h3 + 3 MenuItemBadge sites)
- ✓ `.planning/phases/33-update-observability-surface/deferred-items.md` (modified — 33-03 entry appended)
- ✓ `.planning/phases/33-update-observability-surface/33-03-SUMMARY.md` (this file)

Commits all exist (verified via `git log --oneline | head -4`):

- ✓ `acb42a2a` test(33-03)
- ✓ `ea25132f` feat(33-03) UpdateLogViewerDialog
- ✓ `72e74139` feat(33-03) PastDeploysTable
- ✓ `b9705410` feat(33-03) wire-in

Final test run: `cd livos/packages/ui && ./node_modules/.bin/vitest run src/routes/settings/_components/past-deploys-table.unit.test.tsx src/components/update-log-viewer-dialog.unit.test.tsx src/routes/settings/_components/menu-item-badge.unit.test.tsx` → 3 tests passed, 0 failed.

Acceptance grep counts (Task 4):
- `grep -c "PastDeploysTable" settings-content.tsx` = 2 (≥2 ✓)
- `grep -c "MenuItemBadge" settings-content.tsx` = 4 (≥4 ✓)
- `grep -c "Past Deploys" settings-content.tsx` = 1 (≥1 ✓)

---
*Phase: 33-update-observability-surface*
*Plan: 03*
*Completed: 2026-04-27*
