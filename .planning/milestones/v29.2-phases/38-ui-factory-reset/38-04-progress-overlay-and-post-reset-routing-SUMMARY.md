---
phase: 38-ui-factory-reset
plan: 04
subsystem: ui-factory-reset-overlay-and-routing
tags: [factory-reset, overlay, polling, vitest, jsdom, react-router, post-reset-routing]
requires:
  - 'Plan 38-01 lib (FactoryResetEvent type, deriveFactoryResetState/stateLabel, mapErrorTagToMessage)'
  - 'Plan 38-01 ResettingCover Plan-01 stub (this plan replaces it)'
  - 'Plan 38-03 FactoryResetModal navigates to / so the GlobalSystemStateProvider resetting cover takes over'
  - 'Phase 37 D-EVT-02 JSON event row schema (status / wipe_duration_ms / install_sh_source / error)'
  - 'Phase 33 listUpdateHistory route (limit-bound, type-generic, returns {filename, ...parsed})'
  - 'Phase 38 D-OV-01..04 (BarePage overlay + 2s polling + reconnecting + 90s manual-recovery)'
  - 'Phase 38 D-RT-01..03 (post-reset routing + error page + rolled-back recovery page)'
provides:
  - '@/features/factory-reset/lib/select-latest-event — selectLatestFactoryResetEvent(rows)'
  - '@/features/factory-reset/lib/polling-state — computePollingDisplayState + CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS'
  - '@/features/factory-reset/lib/post-reset-redirect — selectPostResetRoute(event)'
  - '@/routes/factory-reset/_components/factory-reset-progress — BarePage polling overlay (replaces Plan 01 ResettingCover stub)'
  - '@/routes/factory-reset/_components/factory-reset-error-page — D-RT-02 error page'
  - '@/routes/factory-reset/_components/factory-reset-recovery-page — D-RT-03 rolled-back recovery page'
  - '@/routes/help/factory-reset-recovery — static SSH recovery instructions page'
  - 'router.tsx route /help/factory-reset-recovery under BareLayout'
affects:
  - 'GlobalSystemStateProvider resetting branch now renders the listUpdateHistory poller (was: indeterminate stub)'
  - 'Phase 38 closes — v29.2 Factory Reset milestone end-to-end UI complete (FR-UI-01..07 satisfied across plans 01..04)'
tech-stack:
  added: []
  patterns:
    - 'Pure-logic decision functions (selectLatestFactoryResetEvent / computePollingDisplayState / selectPostResetRoute) extracted from React component for unit-testability without RTL'
    - 'vi.useFakeTimers harness for the 90s consecutive-failure threshold (D-OV-04 lockdown without 90 real seconds in CI)'
    - 'window.location.href hard navigation for post-reset routing (clears cached tRPC state + auth tokens after reinstall)'
    - 'Render-fan-out by status field — failed renders <FactoryResetErrorPage>, rolled-back renders <FactoryResetRecoveryPage>; auto-redirect explicitly avoided (D-RT-02/03 user-must-read)'
    - 'failureStartRef sentinel + 1s setInterval ticks the consecutiveFailureMs counter so the 90s threshold can fire even if listUpdateHistory never recovers'
    - 'Source-text invariant tests (readFileSync + regex) re-enforce structural wiring — refetchInterval=2_000, lib helper imports, hard-navigation, no auto-redirect on failed/rolled-back'
key-files:
  created:
    - 'livos/packages/ui/src/features/factory-reset/lib/select-latest-event.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/select-latest-event.unit.test.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/polling-state.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/polling-state.unit.test.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/post-reset-redirect.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/post-reset-redirect.unit.test.ts'
    - 'livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx'
    - 'livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.unit.test.tsx'
    - 'livos/packages/ui/src/routes/factory-reset/_components/factory-reset-error-page.tsx'
    - 'livos/packages/ui/src/routes/factory-reset/_components/factory-reset-error-page.unit.test.tsx'
    - 'livos/packages/ui/src/routes/factory-reset/_components/factory-reset-recovery-page.tsx'
    - 'livos/packages/ui/src/routes/help/factory-reset-recovery.tsx'
  modified:
    - 'livos/packages/ui/src/providers/global-system-state/reset.tsx'
    - 'livos/packages/ui/src/router.tsx'
    - 'livos/packages/ui/public/locales/en.json'
decisions:
  - 'Task ordering reversed (Task 3 committed before Task 2) because FactoryResetProgress imports the error/recovery page components — committing Task 2 first would have left an unsatisfied module-load smoke test. The 3 commits ship in dependency order (lib → leaf pages → overlay) — see Deviations below.'
  - 'failureStartRef + 1s setInterval inside FactoryResetProgress instead of bouncing the failure clock through React state on every refetch — keeps the counter advancing during the silent 1.5s gap between react-query failure callbacks during the wipe-then-reinstall window.'
  - 'eventBasename for the View-event-log button derived from started_at (strip separators + trailing .NNNZ) rather than threading snapshotPath/eventPath through the FactoryResetEvent type — Phase 37 emits the basename convention deterministically and the UI never inspected it before, so reconstruction is the lighter touch.'
  - 'selectLatestFactoryResetEvent falls back to timestamp when started_at is absent (defensive; Phase 37 always writes started_at, but partially-flushed rows mid-write are theoretically observable). Retains forward-compat with Phase 33 update-row sort key.'
  - 'computePollingDisplayState exposes recoveryThresholdMs as an override so tests can simulate the 90s threshold without sleeping 90 seconds — keeps the vi.useFakeTimers harness fast.'
  - 'Status-routing intentionally non-redirecting on failed/rolled-back. The user has triggered a destructive op and may need to read the error tag, copy the recovery command, or click View-event-log. Auto-redirect would erase that context.'
  - 'Static help page contains the verbatim D-RT-02 recovery command as a single string constant RECOVERY_COMMAND; an inline <pre> renders it. Avoids accidental string-mutation across i18n / translation passes — the literal command is canon.'
metrics:
  duration_minutes: 18
  completed_date: '2026-04-29'
  tasks_completed: 3
  files_changed: 15
  tests_added: 52
---

# Phase 38 Plan 04: Progress Overlay + Post-Reset Routing Summary

**One-liner:** Replaced the Plan-01 ResettingCover stub with a real BarePage progress overlay (`FactoryResetProgress`) that polls `trpc.system.listUpdateHistory` every 2s, derives the visible state through three new pure-logic helpers (`selectLatestFactoryResetEvent`, `computePollingDisplayState`, `selectPostResetRoute`), fans status:failed/rolled-back to dedicated pages instead of redirecting, redirects success+preserveApiKey through `/login` or `/onboarding`, and ships a static `/help/factory-reset-recovery` page with the verbatim D-RT-02 SSH-rollback command — closing the v29.2 Factory Reset milestone with 52 new vitest assertions, all passing.

## What Shipped

### Pure-logic lib (Task 1 — commit `2659cd22`)

Three new modules under `livos/packages/ui/src/features/factory-reset/lib/`. Each is a deterministic function the overlay calls per refetch.

| Module | Exports | Tests | Key invariants |
|---|---|---|---|
| `select-latest-event.ts` | `selectLatestFactoryResetEvent(rows)` | 8 | Filters `type === 'factory-reset'` only; sorts by `started_at` desc; defensive against empty/null/non-array/non-object/missing-status rows |
| `polling-state.ts` | `computePollingDisplayState({...})`, `CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS` | 10 | Threshold === 90_000; reconnect → manual-recovery transition asserted via `vi.useFakeTimers` simulating 90s of accumulated failures; Server4/5 negative across all 3 modes |
| `post-reset-redirect.ts` | `selectPostResetRoute(event)` | 7 | success+preserveApiKey:true → /login; success+preserveApiKey:false → /onboarding; in-progress/failed/rolled-back/null → 'stay' |

**Total Task 1 tests: 25 (≥6+≥7+≥6 plan floor exceeded by 39%).**

### FactoryResetProgress + ResettingCover swap (Task 2 — commit `355cb94f`)

`livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx` is the BarePage overlay:

- **Polling**: `trpcReact.system.listUpdateHistory.useQuery({limit: 10}, {refetchInterval: 2_000, retry: false, staleTime: 2_000})`. The `staleTime` is set to the poll interval so prev data stays visible during the brief livinityd-restart window.
- **lastKnownEvent capture**: useEffect derives the latest factory-reset event via `selectLatestFactoryResetEvent(historyQ.data)` and persists it across refetches.
- **Failure clock**: when `historyQ.isError` flips on, `failureStartRef.current` is set to `Date.now()` and a `setInterval(1s)` ticks `consecutiveFailureMs` upward — so the 90s threshold fires even if listUpdateHistory never recovers.
- **Render fan-out**:
  - `lastKnownEvent.status === 'failed'` → `<FactoryResetErrorPage event={...} />` (no auto-redirect)
  - `lastKnownEvent.status === 'rolled-back'` → `<FactoryResetRecoveryPage event={...} />` (no auto-redirect)
  - else → `<BarePage><ProgressLayout title=... callout=... message=... isRunning=... /></BarePage>` with `message = display.label + (display.hint ? ` — ${display.hint}` : '')`
- **Post-reset redirect**: separate useEffect calls `selectPostResetRoute(lastKnownEvent)`; on `/login` or `/onboarding` it does `window.location.href = route` (hard navigation) so all in-memory state including auth tokens is cleared.

`livos/packages/ui/src/providers/global-system-state/reset.tsx` had its `ResettingCover` body swapped from the Plan 01 indeterminate stub to a single-line `<FactoryResetProgress />`.

`livos/packages/ui/public/locales/en.json` adds `factory-reset.progress.callout`.

11 source-text + smoke assertions (≥9 plan floor) verify:
- Module exports `FactoryResetProgress`
- `system.listUpdateHistory` import + `refetchInterval: POLL_INTERVAL_MS` + `POLL_INTERVAL_MS = 2_000`
- `selectLatestFactoryResetEvent(`, `computePollingDisplayState(`, `selectPostResetRoute(` all imported and invoked
- Failed/rolled-back branches render the dedicated pages (not navigate)
- `window.location.href = route` hard navigation
- `<BarePage>` and `<ProgressLayout` used for in-progress
- No Server4/5

### Error/recovery/help pages + router register (Task 3 — commit `85a2eaef`)

`factory-reset-error-page.tsx` (D-RT-02):
- `<BareLogoTitle>{t('factory-reset.error.heading')}</BareLogoTitle>` + a paragraph rendering `mapErrorTagToMessage(event.error, {install_sh_exit_code})`
- 3 buttons (per D-RT-02):
  - **View event log** (`<a href="/admin/diagnostic/${eventBasename}">`) — `eventBasename` reconstructed from `event.started_at` (strip separators / trailing ms-Z)
  - **Try again** (`<button onClick={() => navigate('/factory-reset')}>`) — re-opens the FactoryResetModal
  - **Manual SSH recovery instructions** (`<a href="/help/factory-reset-recovery">`) — links to the static help page
- `data-testid` on each button for downstream e2e selectors
- Animated via `animate-in slide-in-from-bottom-2`

`factory-reset-recovery-page.tsx` (D-RT-03):
- `<BareLogoTitle>{t('factory-reset.recovery.heading')}</BareLogoTitle>`
- Body interpolates the verbatim "Reinstall failed but pre-wipe snapshot was successfully restored" copy + the `event.error` tag in `<code>`
- Single `<Link to='/' reloadDocument>` Return-to-dashboard button (reloadDocument forces a fresh page load)

`livos/packages/ui/src/routes/help/factory-reset-recovery.tsx` (static page):
- `RECOVERY_COMMAND` is a single string constant rendered inside a `<pre>` — verbatim per D-RT-02:
  ```
  tar -xzf $(cat /tmp/livos-pre-reset.path) -C / && systemctl restart livos liv-core liv-worker liv-memory
  ```
- Heading, intro, warning, return-to-dashboard link all wired through new i18n keys

`router.tsx` registers `path: 'help/factory-reset-recovery'` under the existing BareLayout (sibling to `/login` and `/factory-reset/*`); component lazy-loaded via `React.lazy`.

`en.json` adds 11 new keys (4 error + 3 recovery + 4 help). Total Plan 04 i18n additions including `factory-reset.progress.callout` from Task 2: **12**.

16 source-text + smoke assertions (≥10 plan floor exceeded by 60%) verify:
- All 3 D-RT-02 buttons (i18n keys + correct hrefs/onClicks)
- `mapErrorTagToMessage(` invocation
- `factory-reset.recovery.heading` and `body-pre-error` keys + `reloadDocument` + `to='/'`
- Verbatim recovery command literal `tar -xzf $(cat /tmp/livos-pre-reset.path) -C /` AND `systemctl restart livos liv-core liv-worker liv-memory`
- Smoke imports for all 3 components
- No Server4/5 anywhere in the source

## Verification

### All Phase 38 factory-reset tests

```text
$ cd livos && pnpm --filter ui exec vitest run src/features/factory-reset/lib src/routes/factory-reset --reporter=basic
 ✓ src/features/factory-reset/lib/polling-state.unit.test.ts (10 tests)
 ✓ src/features/factory-reset/lib/state-machine.unit.test.ts (16 tests)
 ✓ src/features/factory-reset/lib/error-tags.unit.test.ts (9 tests)
 ✓ src/routes/factory-reset/_components/preflight-decision.unit.test.ts (12 tests)
 ✓ src/features/factory-reset/lib/post-reset-redirect.unit.test.ts (7 tests)
 ✓ src/features/factory-reset/lib/typed-confirm.unit.test.ts (9 tests)
 ✓ src/features/factory-reset/lib/deletion-list.unit.test.ts (11 tests)
 ✓ src/features/factory-reset/lib/select-latest-event.unit.test.ts (8 tests)
 ✓ src/features/factory-reset/lib/network-preflight.unit.test.ts (9 tests)
 ✓ src/routes/factory-reset/_components/use-preflight.unit.test.tsx (3 tests)
 ✓ src/routes/factory-reset/_components/factory-reset-error-page.unit.test.tsx (16 tests)
 ✓ src/routes/factory-reset/_components/factory-reset-progress.unit.test.tsx (11 tests)
 ✓ src/routes/factory-reset/_components/factory-reset-modal.unit.test.tsx (14 tests)
 Test Files  13 passed (13)
      Tests  135 passed (135)
```

Phase 38 closes with **135 passing assertions across 13 test files** (Plan 01: 54, Plan 02: 7, Plan 03: 29, Plan 04: 52 — minus duplicates pulled in by directory globs).

### Plan-04-only test breakdown

| Test file | Assertions | Plan floor |
|---|---:|---:|
| select-latest-event.unit.test.ts | 8 | ≥6 |
| polling-state.unit.test.ts (incl. fake-timers) | 10 | ≥7 |
| post-reset-redirect.unit.test.ts | 7 | ≥6 |
| factory-reset-progress.unit.test.tsx | 11 | ≥9 |
| factory-reset-error-page.unit.test.tsx | 16 | ≥10 |
| **TOTAL** | **52** | ≥38 |

### TypeScript

```text
$ cd livos && pnpm --filter ui exec tsc --noEmit -p . 2>&1 | grep -iE "factory-reset|progress|polling-state|select-latest|post-reset|providers/global-system-state" | grep -v "stories/"
(no output)
```

Zero new factory-reset TypeScript errors. Pre-existing `livinityd/source/modules/ai/routes.ts` `ctx.livinityd is possibly 'undefined'` and `motion-primitives/scroll-progress.tsx` framer-motion type drift are NOT touched by this plan.

### Hard rules

```text
$ git diff HEAD~3 HEAD --name-only | grep livinityd/
(no output — zero livinityd modifications)

$ rg "Server4|Server5" livos/packages/ui/src/features/factory-reset livos/packages/ui/src/routes/factory-reset livos/packages/ui/src/routes/help/factory-reset-recovery.tsx
livos/packages/ui/src/features/factory-reset/lib/polling-state.unit.test.ts          (negative-assertion strings — explicitly allowed)
livos/packages/ui/src/features/factory-reset/lib/error-tags.unit.test.ts             (negative-assertion strings — explicitly allowed)
livos/packages/ui/src/routes/factory-reset/_components/factory-reset-error-page.unit.test.tsx     (negative-assertion strings — explicitly allowed)
livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.unit.test.tsx       (negative-assertion strings — explicitly allowed)
livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.unit.test.tsx          (negative-assertion strings — explicitly allowed)
livos/packages/ui/src/routes/factory-reset/_components/preflight-decision.unit.test.ts            (negative-assertion strings — explicitly allowed)
```

Server4/Server5 strings exist ONLY in negative-test assertion strings, explicitly allowed by the plan's critical_constraints.

```text
$ rg "getFactoryResetStatus|confirm-with-password|review-data" livos/packages/ui/src/
(no output — legacy fully removed across plans 01..04)
```

```text
$ rg "refetchInterval:\s*POLL_INTERVAL_MS" livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx
39: refetchInterval: POLL_INTERVAL_MS,

$ rg "tar -xzf .cat /tmp/livos-pre-reset.path. -C /" livos/packages/ui/src/routes/help/factory-reset-recovery.tsx
15: //   tar -xzf $(cat /tmp/livos-pre-reset.path) -C / && systemctl restart livos liv-core liv-worker liv-memory
17: 'tar -xzf $(cat /tmp/livos-pre-reset.path) -C / && systemctl restart livos liv-core liv-worker liv-memory'

$ rg "help/factory-reset-recovery" livos/packages/ui/src/router.tsx
41: const FactoryResetRecoveryHelp = React.lazy(() => import('./routes/help/factory-reset-recovery'))
163:    path: 'help/factory-reset-recovery',
```

All plan verification commands pass.

### Plan acceptance criteria status

| Criterion | Status |
|-----------|--------|
| FactoryResetProgress overlay polls listUpdateHistory @ 2s | ✅ |
| state-machine-derived text via deriveFactoryResetState + stateLabel (Plan 01 reuse) | ✅ |
| Disconnect graceful (Reconnecting → 90s threshold → manual-recovery hint, no redirect) | ✅ |
| FactoryResetErrorPage renders error-tag-specific message + 3 buttons | ✅ |
| FactoryResetRecoveryPage renders rolled-back success state | ✅ |
| /help/factory-reset-recovery static route exists with verbatim SSH instructions | ✅ |
| Post-reset routing splits success+preserveApiKey for /login vs /onboarding | ✅ |
| ResettingCover stub replaced with FactoryResetProgress | ✅ |
| All component tests pass (vitest) — 135/135 | ✅ |
| `tsc --noEmit` passes (no NEW factory-reset errors) | ✅ |
| Each task committed individually (3 atomic commits) | ✅ |
| SUMMARY.md created | ✅ (this file) |
| No `livos/packages/livinityd/` modifications | ✅ |
| No Server4 references in non-test source | ✅ |

## Threat Surface Scan

No new threat surface introduced by this plan. The component:

- Reads pre-existing tRPC route `system.listUpdateHistory` via the standard `useQuery` hook — no new network surface, no auth bypass
- Uses the public `react-router-dom` `useNavigate` and `window.location.href` for redirects — no internal IPs / hostnames surfaced
- Static recovery page is self-contained text — no network calls, no fs reads, no eval, no auth
- No filesystem access, no schema changes, no new auth/authz paths

The post-reset hard-navigation to `/login` or `/onboarding` is the correct security stance: discarding all in-memory tRPC cache and JWT tokens after the reinstall ensures a freshly-deployed livinityd's authentication state is honored, not the cached pre-wipe one.

## Deviations from Plan

**1. [Rule 3 — Blocking issue] Task ordering reversed (Task 3 committed before Task 2)**
- **Found during:** Task 2 smoke test setup
- **Issue:** `factory-reset-progress.tsx` (Task 2) imports `FactoryResetErrorPage` and `FactoryResetRecoveryPage` from sibling files that the plan creates in Task 3. Committing Task 2 first would have left an unsatisfied module-load smoke test (`await import('./factory-reset-progress')` would have thrown ENOENT).
- **Fix:** Reversed commit order — Task 3 (error/recovery/help pages + router) shipped as `85a2eaef`, then Task 2 (FactoryResetProgress + ResettingCover swap) shipped as `355cb94f`. Both still atomic. Lib stayed first as `2659cd22`. The plan's *intent* (3 atomic commits, each test-passing on commit) is fully preserved; only the ordering of commits 2 and 3 changed.
- **Files:** N/A (purely a sequencing change)
- **Commits:** `2659cd22` (lib + 25 tests) → `85a2eaef` (error/recovery/help pages + 16 tests) → `355cb94f` (FactoryResetProgress + ResettingCover swap + 11 tests)

No other deviations. The 11 i18n keys added in Task 3 + the 1 added in Task 2 = 12 keys total (matches the plan's 11 + 1).

## Phase 38 Close-Out Checklist

- [x] **All 15 must_haves from Plan 04 frontmatter verifiable** — listUpdateHistory polling, 2s interval, selectLatestFactoryResetEvent for type filter, deriveFactoryResetState + stateLabel for status text, Reconnecting / 90s threshold logic, /login + /onboarding routing, error-page render-fan-out, rolled-back recovery page, /help/factory-reset-recovery verbatim, no Server4/5, ResettingCover swap, ≥30 lib assertions (52 actual)
- [x] **All FR-UI-XX requirement IDs mapped across plans 01..04**
  - FR-UI-01 — Plan 02 Danger Zone button
  - FR-UI-02 — Plan 03 explicit-list modal (DELETION_LIST + verbatim 7-item ul)
  - FR-UI-03 — Plan 03 preserve-account RadioGroup with safer "preserve" default
  - FR-UI-04 — Plan 01 (lib) + Plan 03 (UI) typed-FACTORY-RESET-to-confirm
  - FR-UI-05 — Plan 04 BarePage progress overlay (this plan)
  - FR-UI-06 — Plan 04 post-reset routing + error/recovery surfaces (this plan)
  - FR-UI-07 — Plan 03 pre-flight blocking checks (update-running + 5s AbortController network preflight)
- [x] **No new Server4/Server5 strings in non-test source**
- [x] **No livinityd/ files modified across all 4 plans**
- [x] **All integration testing left to the opt-in Phase 37 destructive integration test** — Phase 38 ships unit tests only; no real-Mini-PC factory-reset performed during plan execution

## Self-Check: PASSED

**Files (all 12 expected created files present):**
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/select-latest-event.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/select-latest-event.unit.test.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/polling-state.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/polling-state.unit.test.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/post-reset-redirect.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/post-reset-redirect.unit.test.ts`
- FOUND: `livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx`
- FOUND: `livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.unit.test.tsx`
- FOUND: `livos/packages/ui/src/routes/factory-reset/_components/factory-reset-error-page.tsx`
- FOUND: `livos/packages/ui/src/routes/factory-reset/_components/factory-reset-error-page.unit.test.tsx`
- FOUND: `livos/packages/ui/src/routes/factory-reset/_components/factory-reset-recovery-page.tsx`
- FOUND: `livos/packages/ui/src/routes/help/factory-reset-recovery.tsx`

**Files (3 expected modified files present):**
- FOUND (modified): `livos/packages/ui/src/providers/global-system-state/reset.tsx` — ResettingCover swapped to <FactoryResetProgress />
- FOUND (modified): `livos/packages/ui/src/router.tsx` — registers /help/factory-reset-recovery
- FOUND (modified): `livos/packages/ui/public/locales/en.json` — 12 new factory-reset keys

**Commits:**
- FOUND: `2659cd22` — feat(38-04): add polling-state + select-latest-event + post-reset-redirect lib + 25 unit tests
- FOUND: `85a2eaef` — feat(38-04): add error/recovery/help pages + register /help/factory-reset-recovery route
- FOUND: `355cb94f` — feat(38-04): swap ResettingCover stub with FactoryResetProgress polling overlay
