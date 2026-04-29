---
phase: 38-ui-factory-reset
plan: 03
subsystem: ui-factory-reset-modal
tags: [factory-reset, modal, dialog, vitest, jsdom, preflight, type-to-confirm]
requires:
  - 'Plan 38-01 lib (DELETION_LIST, isFactoryResetTrigger, EXPECTED_CONFIRM_PHRASE, preflightFetchLivinity, DEFAULT_PREFLIGHT_TIMEOUT_MS)'
  - 'Plan 38-01 useReset/GlobalSystemStateContext.reset({preserveApiKey})'
  - 'Plan 38-02 DangerZone IconButtonLink to /factory-reset (entry point)'
  - 'Phase 38 D-MD-01 (verbatim 7-item <ul>)'
  - 'Phase 38 D-RD-01 ("Restore my account" safer default)'
  - 'Phase 38 D-CF-01..03 (typed confirm + outside-click-disabled + Cancel button)'
  - 'Phase 38 D-PF-01..02 (update-in-progress + 5s AbortController network preflight)'
  - 'Phase 30 trpc.system.updateStatus.useQuery (running:boolean)'
provides:
  - 'computeConfirmEnabled({typedConfirm, updateRunning, networkReachable, preflightInFlight, mutationPending}) → {enabled, reason}'
  - 'usePreflight() React hook → {inFlight, result} backed by preflightFetchLivinity'
  - 'FactoryResetModal React component (the explicit-list dialog with radio + type-confirm + pre-flight-gated submit)'
  - '/factory-reset route now renders <EnsureLoggedIn><FactoryResetModal /></EnsureLoggedIn> (legacy multi-route password gate gone)'
affects:
  - 'Plan 38-04 (BarePage progress overlay) — modal closes + navigates to / so GlobalSystemStateProvider resetting cover takes over; Plan 04 swaps that cover for the polling overlay'
  - 'DangerZone button (Plan 02) — still navigates to /factory-reset; route now opens the modal directly instead of the legacy 3-step wizard'
tech-stack:
  added: []
  patterns:
    - 'shadcn/ui Dialog with onPointerDownOutside preventDefault for D-CF-03 (outside-click-disabled, Escape-enabled)'
    - 'Pure-logic decision function (computeConfirmEnabled) extracted from React component for unit-testability without RTL'
    - 'usePreflight ranRef sentinel ensures fetch fires once per mount; modal close = unmount = next open re-runs the check (D-PF-02 last paragraph)'
    - 'Tooltip wraps a <span> wrapper so disabled buttons can still surface a hover reason (Radix idiom)'
    - 'Source-text invariant tests (readFileSync + regex) re-enforce structural wiring without RTL — DELETION_LIST.map, onPointerDownOutside preventDefault, useState<RadioValue>(''preserve''), TODO(v30.0) backup-mutex'
key-files:
  created:
    - 'livos/packages/ui/src/routes/factory-reset/_components/preflight-decision.ts'
    - 'livos/packages/ui/src/routes/factory-reset/_components/preflight-decision.unit.test.ts'
    - 'livos/packages/ui/src/routes/factory-reset/_components/use-preflight.ts'
    - 'livos/packages/ui/src/routes/factory-reset/_components/use-preflight.unit.test.tsx'
    - 'livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.tsx'
    - 'livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.unit.test.tsx'
  modified:
    - 'livos/packages/ui/src/routes/factory-reset/index.tsx'
    - 'livos/packages/ui/src/routes/factory-reset/_components/misc.tsx'
    - 'livos/packages/ui/public/locales/en.json'
  deleted:
    - 'livos/packages/ui/src/routes/factory-reset/_components/confirm-with-password.tsx'
    - 'livos/packages/ui/src/routes/factory-reset/_components/review-data.tsx'
    - 'livos/packages/ui/src/routes/factory-reset/_components/success.tsx'
decisions:
  - 'Pre-flight precedence chain encoded as a pure function (computeConfirmEnabled) so the React component just consumes the decision object — keeps the gating rules unit-testable without RTL'
  - 'Tooltip wraps the destructive Button in a <span> sibling because Radix Tooltip cannot trigger off a natively disabled <button> (pointer events suppressed). The <span> trigger preserves the disabled state while still surfacing the reason text on hover.'
  - 'Submitting the modal navigates to / and lets GlobalSystemStateProvider''s existing `resetting` status cover take over (Plan 01 ResettingCover stub). Plan 04 swaps that stub for the listUpdateHistory-polling overlay; Plan 03 stays out of post-reset routing.'
  - 'usePreflight is intentionally a one-shot per mount (ranRef sentinel) — D-PF-02 says "once per modal-open" and the modal unmounts on close, so a fresh open creates a fresh hook instance which fires a fresh check.'
  - 'Used <span><Button disabled /></span> Tooltip pattern instead of aria-disabled-only Button so keyboard users still get the disabled-state announced; aria-disabled also passed for AT compatibility.'
metrics:
  duration_minutes: 12
  completed_date: '2026-04-29'
  tasks_completed: 3
  files_changed: 9
  tests_added: 29
---

# Phase 38 Plan 03: Confirmation Modal Summary

**One-liner:** Replaced the legacy 3-route password-gated factory-reset wizard with a single explicit-list shadcn/ui Dialog modal that renders the verbatim 7-item DELETION_LIST as a real `<ul>`, defaults the preserve-account radio to the safer "Restore my account" choice, gates the destructive Confirm button via a pure-logic precedence chain (`computeConfirmEnabled`) wired to `system.updateStatus` + a 5s-AbortController `usePreflight` hook, and deleted three legacy components — all enforced by 29 vitest assertions across 3 test files.

## What Shipped

### Pure decision logic (Task 1, commit `b0d69196`)

`livos/packages/ui/src/routes/factory-reset/_components/preflight-decision.ts` exports `computeConfirmEnabled(input) → {enabled, reason}` with the FULL D-PF-01 + D-CF-02 precedence chain:

1. `mutationPending` → `"Reset already in progress…"`
2. `updateRunning` → `"An update is currently running. Try again after it completes."`
3. `preflightInFlight || networkReachable === null` → `"Checking network…"`
4. `networkReachable === false` → `"Cannot reach livinity.io. Reinstall would fail. Check your internet connection and try again."`
5. `!typedConfirm` → `"Type FACTORY RESET (case-sensitive) to enable."`
6. else → `{enabled: true, reason: null}`

12 vitest assertions cover all 5 disable paths, the all-clear path, 4 precedence cases, and a Server4/Server5 negative-assertion guard.

### usePreflight hook (Task 2, commit `f57f9761`)

`livos/packages/ui/src/routes/factory-reset/_components/use-preflight.ts` exports `usePreflight({enabled, fetchImpl}) → {inFlight, result}`. Uses a `ranRef` sentinel so the underlying `preflightFetchLivinity()` fires exactly once per mount; D-PF-02's "once per modal-open" semantics fall out naturally because the modal unmounts on close.

3 vitest assertions: smoke import + AbortController-driven `reason: 'timeout'` re-verification at the lib boundary + `DEFAULT_PREFLIGHT_TIMEOUT_MS === 5_000` lockdown so D-PF-02's 5s timeout cannot drift silently.

### FactoryResetModal + route + i18n + legacy delete (Task 3, commit `20de82ef`)

`livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.tsx` is the new explicit-list modal:

- **DialogContent** with `onPointerDownOutside={(e) => e.preventDefault()}` (D-CF-03; Escape still dismisses by Radix default).
- **Real `<ul>`** with 7 `<li>` children rendered from `DELETION_LIST.map()` (D-MD-01 — single source of truth, lib import).
- **RadioGroup** with `useState<RadioValue>('preserve')` initial state — "Restore my account" is the default-checked option (D-RD-01 safer default).
- **Type-to-confirm input** uses the lib's `isFactoryResetTrigger` helper (strict equality — no inline string comparison; the lib enforces `===`).
- **Pre-flight inputs**:
  - `trpc.system.updateStatus.useQuery({refetchOnWindowFocus: false})` → `updateRunning = data?.running === true`
  - `usePreflight({enabled: true})` → `networkReachable: boolean | null` and `preflightInFlight: boolean`
  - `// TODO(v30.0): backup-mutex pre-flight check (BAK-SCHED-04 lock)` — forward-compat comment, NOT implemented in v29.2.
- **Destructive Confirm button** wrapped in `<TooltipTrigger asChild><span><Button ...></span></TooltipTrigger>` so the disabled state still surfaces the `decision.reason` tooltip on hover. `decision.enabled` from `computeConfirmEnabled()` flows into `disabled` and `aria-disabled`.
- **Cancel button** navigates back to `/settings` (`backPath` from misc.tsx).
- **On confirm**: sets the single-shot `submitted` flag, calls `useGlobalSystemState().reset({preserveApiKey: radioValue === 'preserve'})`, then `navigate('/')` so the existing `resetting` status cover takes over.

`livos/packages/ui/src/routes/factory-reset/index.tsx` rewritten — now `<EnsureLoggedIn><FactoryResetModal /></EnsureLoggedIn>` (was: `<Routes>` with 3 sub-routes, password mutation wiring, ImmersiveDialog wrapper). Legacy `<ConfirmWithPassword>`, `<ReviewData>`, `<Success>` components deleted.

`livos/packages/ui/src/routes/factory-reset/_components/misc.tsx` simplified — only `title()` (now points at `'factory-reset.modal.heading'`) and `backPath = '/settings'` remain. Legacy `description()` export removed (no consumers).

`livos/packages/ui/public/locales/en.json` adds 10 new keys:

| Key | Value |
|-----|-------|
| `factory-reset.modal.heading` | `"Factory Reset"` |
| `factory-reset.modal.intro` | `"This will permanently delete:"` |
| `factory-reset.modal.bottom-line` | `"If you previously chose 'Restore my account' the reinstalled LivOS will recognize your Livinity account and current credentials still work. Otherwise the host onboards as new."` |
| `factory-reset.radio.preserve.title` | `"Restore my account"` |
| `factory-reset.radio.preserve.description` | `"Your Livinity API key is preserved. After reinstall, log in with your existing credentials."` |
| `factory-reset.radio.fresh.title` | `"Start fresh as new user"` |
| `factory-reset.radio.fresh.description` | `"Wipe everything including the Livinity API key. After reinstall, you'll go through the onboarding wizard as a new user."` |
| `factory-reset.confirm-input.label` | `"Type FACTORY RESET to enable the destructive button:"` |
| `factory-reset.confirm-button.label` | `"Erase everything and reset"` |
| `factory-reset.cancel-button.label` | `"Cancel"` |

The 7 deletion-list items themselves are NOT in en.json — they live in `DELETION_LIST` (Plan 01) as the single source of truth, asserted verbatim by Plan 01's `deletion-list.unit.test.ts`.

`factory-reset-modal.unit.test.tsx` ships 14 source-text + smoke assertions enforcing:

- Smoke: module exports `FactoryResetModal`
- `DELETION_LIST.map` + import from `@/features/factory-reset/lib/deletion-list`
- Real `<ul data-testid="factory-reset-deletion-list">`
- `isFactoryResetTrigger` import (strict-equality matcher)
- `computeConfirmEnabled(` invocation
- `usePreflight(` invocation
- `system.updateStatus` query
- `onPointerDownOutside={... preventDefault ...}` (D-CF-03)
- `useState<RadioValue>('preserve')` (D-RD-01 safer default)
- Both `data-testid="factory-reset-cancel"` and `factory-reset-confirm` present
- `TODO(v30.0)` backup-mutex comment present (D-PF-01 item 3)
- No `Server4` / `Server5` substring
- `reset({preserveApiKey` invocation
- Confirm input uses `placeholder={EXPECTED_CONFIRM_PHRASE}`

## Verification

```text
$ cd livos && pnpm --filter ui exec vitest run src/routes/factory-reset --reporter=verbose
 ✓ src/routes/factory-reset/_components/preflight-decision.unit.test.ts (12 tests)
 ✓ src/routes/factory-reset/_components/use-preflight.unit.test.tsx (3 tests)
 ✓ src/routes/factory-reset/_components/factory-reset-modal.unit.test.tsx (14 tests)
 Test Files  3 passed (3)
      Tests  29 passed (29)
```

```text
$ cd livos && pnpm --filter ui exec tsc --noEmit -p . 2>&1 | grep -iE "factory|reset" | grep -v "stories/"
(no output)
```

```text
$ grep -rn "ConfirmWithPassword\|ReviewData\|review-data\|confirm-with-password" livos/packages/ui/src/
(no output — legacy refs gone)

$ grep -rn "Server4\|Server5" livos/packages/ui/src/routes/factory-reset/
(only in negative-assertion test strings — explicitly allowed by plan critical_constraints)

$ ls livos/packages/ui/src/routes/factory-reset/_components/
factory-reset-modal.tsx
factory-reset-modal.unit.test.tsx
misc.tsx
preflight-decision.ts
preflight-decision.unit.test.ts
use-preflight.ts
use-preflight.unit.test.tsx
```

All success criteria from the plan satisfied:

- [x] /factory-reset route renders the new explicit-list modal
- [x] Modal has a real `<ul>` with 7 verbatim DELETION_LIST items
- [x] Radio defaults to "preserve" (preserveApiKey=true)
- [x] Type-to-confirm uses `isFactoryResetTrigger` (strict equality, ≥7 negative variants in Plan 01 tests)
- [x] Pre-flight check runs once per modal-open with 5s AbortController timeout
- [x] Destructive button gating tested via pure `computeConfirmEnabled` with all 6 paths + 4 precedence cases
- [x] Forward-compat backup-mutex TODO present
- [x] No Server4/Server5 references (test files contain only negative assertions)
- [x] 3 legacy files deleted (confirm-with-password, review-data, success)
- [x] 10 new i18n keys added
- [x] `tsc --noEmit` shows 0 NEW factory-reset errors
- [x] Each task committed individually (3 atomic commits)
- [x] No `livos/packages/livinityd/` modifications

## Threat Surface Scan

No new threat surface introduced. The modal:

- Calls a pre-existing tRPC route (`system.factoryReset`) via the Plan 01-rewritten `useReset` hook — no new mutation surface
- Reads pre-existing tRPC queries (`system.updateStatus`, the new `usePreflight` does HEAD against the public `https://livinity.io` hostname — no internal IPs, no auth headers)
- Adds no filesystem access, no schema changes, no new auth/authz paths
- Forward-compat comment about backup-mutex is documentation only

The `reset({preserveApiKey})` call surface is gated by the existing `adminProcedure` middleware on the backend (Phase 37 D-BE-02) — Plan 02 already gates the entry button at the UI render layer (`useCurrentUser().isAdmin`).

No content references Server4 or Server5 (test files contain only negative-assertion strings, explicitly allowed).

## Deviations from Plan

**None.** Plan executed exactly as written. Two minor clarifications worth noting (NOT deviations):

- The `factory-reset-modal.unit.test.tsx` ships 14 source-text + smoke assertions instead of the planned ≥10 — went with a slightly tighter set covering the additional `EXPECTED_CONFIRM_PHRASE` placeholder check.
- `usePreflight` does NOT explicitly clean up the in-flight fetch on unmount — relies on the `cancelled` flag in the Promise resolver to no-op the `setState` if the component unmounts mid-flight. The underlying `AbortController` lives inside `preflightFetchLivinity` and aborts on its own 5s timer; mount-then-rapid-unmount leaks one 5s timer but no data and no setState-on-unmounted-component warnings.

## Resume Notes (for Plan 04)

- The modal ends by calling `reset({preserveApiKey})` and `navigate('/')`. The `reset` call goes through `useReset` (Plan 01 rewrite) which fires `trpc.system.factoryReset.useMutation()` and routes through `GlobalSystemStateProvider.onMutate`/`onSuccess`/`onError`. After ~500ms (the active-mutation polling cadence), `system.status` returns `'resetting'` and the existing `ResettingCover` (Plan 01 STUB) renders.
- **Plan 04 should:**
  1. Replace the `ResettingCover` Plan 01 stub with a real polling overlay reading `trpc.system.listUpdateHistory.useQuery({limit: 10, type: 'factory-reset'})` at `refetchInterval: 2000`
  2. Wire `deriveFactoryResetState()` + `stateLabel()` (Plan 01 lib) for the D-OV-03 status text mapping
  3. Handle 90s consecutive query-failure threshold (D-OV-04)
  4. Replace the `/factory-reset/success` redirect target in `global-system-state/index.tsx` line 151 with the proper post-reset routing (D-RT-01 splits on preserveApiKey: `/login` vs `/onboarding`)
  5. Add error page (`status: 'failed'` → D-RT-02 with error-tag-specific messages from `mapErrorTagToMessage`) and recovery page (`status: 'rolled-back'` → D-RT-03)
  6. Add static `/help/factory-reset-recovery` page

The 7 deletion-list items remain in `DELETION_LIST` (Plan 01) as the single source of truth — Plan 04 should not duplicate them.

## Self-Check: PASSED

**Files (all 6 expected created files present + 3 modified files):**
- FOUND: `livos/packages/ui/src/routes/factory-reset/_components/preflight-decision.ts`
- FOUND: `livos/packages/ui/src/routes/factory-reset/_components/preflight-decision.unit.test.ts`
- FOUND: `livos/packages/ui/src/routes/factory-reset/_components/use-preflight.ts`
- FOUND: `livos/packages/ui/src/routes/factory-reset/_components/use-preflight.unit.test.tsx`
- FOUND: `livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.tsx`
- FOUND: `livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.unit.test.tsx`
- FOUND (modified): `livos/packages/ui/src/routes/factory-reset/index.tsx`
- FOUND (modified): `livos/packages/ui/src/routes/factory-reset/_components/misc.tsx`
- FOUND (modified): `livos/packages/ui/public/locales/en.json`

**Files (3 expected deletions confirmed):**
- DELETED: `livos/packages/ui/src/routes/factory-reset/_components/confirm-with-password.tsx`
- DELETED: `livos/packages/ui/src/routes/factory-reset/_components/review-data.tsx`
- DELETED: `livos/packages/ui/src/routes/factory-reset/_components/success.tsx`

**Commits:**
- FOUND: `b0d69196` — feat(38-03): add pure preflight-decision logic + 12 unit tests
- FOUND: `f57f9761` — feat(38-03): add usePreflight hook + smoke + AbortController re-verify test
- FOUND: `20de82ef` — feat(38-03): replace legacy password gate with FactoryResetModal
