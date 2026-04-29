---
phase: 38
phase_name: "UI Factory Reset"
verified_at: 2026-04-29T06:20:00Z
status: human_needed
must_haves_total: 7
must_haves_verified: 7
hard_gates_passed: true
test_status:
  unit_tests: 143/143
  typecheck: pass
gaps: []
human_verification:
  - test: "Settings > Advanced > Danger Zone end-to-end click-through (admin user)"
    expected: "Open Settings > Advanced; Danger Zone section visible at the bottom with red border + warning header. Click the destructive Factory Reset button; navigates to /factory-reset; modal appears centered, 7 deletion-list <li> items visible, radio defaults to 'Restore my account', confirm button initially disabled."
    why_human: "Visual presentation (red border, icon placement, scroll behavior, modal dimensions) cannot be verified by static grep — only by rendering in a real browser."
  - test: "Type-to-confirm interaction"
    expected: "Type 'factory reset' (lower) — Confirm button stays disabled with tooltip 'Type FACTORY RESET (case-sensitive) to enable.'. Clear and type 'FACTORY RESET' — Confirm button enables and tooltip disappears."
    why_human: "Tooltip rendering and live keystroke debouncing require user interaction in a real browser; pure-logic isFactoryResetTrigger is unit-tested but the wired tooltip render is not."
  - test: "Modal dismiss behavior (D-CF-03)"
    expected: "Clicking outside the modal does NOT close it. Pressing Escape DOES close it (returns to /settings). Clicking the explicit Cancel button closes it."
    why_human: "Radix DialogContent's onPointerDownOutside preventDefault is wired in source — but actual outside-click suppression and Escape pass-through must be verified at the DOM event level, which requires a real browser."
  - test: "Pre-flight gating: simulated update-in-progress"
    expected: "Mock trpc.system.updateStatus to return {running: true}. Open the modal: Confirm button disabled, tooltip reads 'An update is currently running. Try again after it completes.'"
    why_human: "Requires a running dev server with tRPC mock or actual update job; pure-logic computeConfirmEnabled is unit-tested but the wired query → button-disable transition is not."
  - test: "Pre-flight gating: simulated unreachable network"
    expected: "Block https://livinity.io at the network layer (devtools offline mode). Open the modal: Confirm button disabled, tooltip reads 'Cannot reach livinity.io. Reinstall would fail. Check your internet connection and try again.' after ~5s."
    why_human: "Requires browser network throttling; the AbortController timeout fires correctly per unit test, but the wired UI feedback after timeout requires manual verification."
  - test: "BarePage progress overlay visual + polling cadence"
    expected: "After clicking Confirm with valid state, the modal closes and BarePage takes over the screen with 'Reinstalling LivOS' heading + animated progress + 'Stopping services and stashing API key…' message. Network tab shows /trpc/system.listUpdateHistory polling every 2s."
    why_human: "Requires actual mutation flow + tRPC poll observation in DevTools Network panel."
  - test: "Post-reset routing — preserveApiKey=true success"
    expected: "With a mock listUpdateHistory returning {status: 'success', preserveApiKey: true}, overlay performs window.location.href = '/login' redirect."
    why_human: "Hard navigation cannot be safely simulated in unit tests; the pure selectPostResetRoute returns '/login' correctly but the wired window.location.href call requires browser verification."
  - test: "Post-reset routing — preserveApiKey=false success"
    expected: "With a mock listUpdateHistory returning {status: 'success', preserveApiKey: false}, overlay redirects to /onboarding."
    why_human: "Same — hard navigation requires browser."
  - test: "Failure path — error page renders 3 buttons"
    expected: "With a mock listUpdateHistory returning {status: 'failed', error: 'install-sh-failed', install_sh_exit_code: 42}, FactoryResetErrorPage renders with message containing exit code 42 + 3 buttons (View event log / Try again / Manual SSH recovery instructions). 'Manual SSH' click navigates to /help/factory-reset-recovery showing the verbatim tar+systemctl command."
    why_human: "End-to-end fan-out from polling overlay to error page to recovery help is a multi-route navigation that benefits from human walkthrough, even though all source-level wiring is verified."
  - test: "Rolled-back path — recovery page renders"
    expected: "With a mock listUpdateHistory returning {status: 'rolled-back', error: 'install-sh-failed'}, FactoryResetRecoveryPage renders with rollback success message and 'Return to dashboard' button. Button reloads document fully (not SPA navigation)."
    why_human: "reloadDocument behavior must be observed in DevTools Network panel."
  - test: "Non-admin user sees explanatory note instead of button"
    expected: "Login as a non-admin user (member or guest). Open Settings > Advanced. Danger Zone section shows the explanatory note 'Factory reset is restricted to admin users…' instead of the destructive button. No faded/disabled button visible."
    why_human: "Requires a multi-user dev environment with at least one non-admin role; useCurrentUser branch is unit-tested but the rendered output requires browser."
---

# Phase 38: UI Factory Reset Verification Report

**Phase Goal:** A user can find the Factory Reset button in Settings > Advanced, read an explicit list of what will be deleted, type-to-confirm, choose preserve-account-vs-fresh, and watch the reinstall progress in a BarePage cover (mirroring Phase 30 update overlay). The pre-flight blocks reset if an update or backup is running, the network is unreachable, or the user lacks admin role.

**Verified:** 2026-04-29T06:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| #   | Truth                                                                                                                                  | Status     | Evidence                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SC1 | Settings > Advanced > Danger Zone admin-only red destructive Factory Reset button + non-admin explanatory note                         | ✓ VERIFIED | `danger-zone.tsx:42-89` renders 3 branches via `decideDangerZoneVisibility`; `advanced.tsx:14, 123, 169` imports + renders DangerZone in both Drawer and Dialog; legacy inline row removed (advanced.tsx:121, 167 comments confirm).               |
| SC2 | Confirmation modal explicit-list `<ul>` with verbatim 7-item deletion list (D-MD-01)                                                   | ✓ VERIFIED | `factory-reset-modal.tsx:98-105` renders DELETION_LIST as `<ul>` with `<li>` per item; `deletion-list.ts:9-17` has all 7 verbatim items; deletion-list.unit.test.ts: 11 assertions including verbatim D-MD-01 first item match. |
| SC3 | Account preservation radio with default "Restore my account"                                                                           | ✓ VERIFIED | `factory-reset-modal.tsx:41` `useState<RadioValue>('preserve')` initial state; `:109-133` RadioGroup with both options + descriptions; both i18n keys present in en.json:345-348.                                                |
| SC4 | Type-to-confirm strict equality `FACTORY RESET`                                                                                        | ✓ VERIFIED | `typed-confirm.ts:8-10` strict equality `===`; `factory-reset-modal.tsx:57` calls `isFactoryResetTrigger(confirmInput)`; typed-confirm.unit.test.ts has 9 negative variants (factory reset / FactoryReset / FACTORY-RESET / leading space / trailing space / double-space / empty + 1 acceptance + 1 const check). |
| SC5 | BarePage progress overlay polls listUpdateHistory @ 2s with state machine + reconnect threshold                                        | ✓ VERIFIED | `factory-reset-progress.tsx:32` `POLL_INTERVAL_MS = 2_000`; `:39` `refetchInterval: POLL_INTERVAL_MS`; `:73` `selectLatestFactoryResetEvent`; `:97-101` `computePollingDisplayState`; `polling-state.ts:23` 90s threshold; polling-state.unit.test.ts 10 assertions including vi.useFakeTimers harness. |
| SC6 | Post-reset routing — /login (preserve+success), /onboarding (fresh+success), error page (failed), recovery page (rolled-back)         | ✓ VERIFIED | `post-reset-redirect.ts:17-21` 3-branch decision; `factory-reset-progress.tsx:79-85` window.location.href hard nav + `:89-94` fan-out to error/recovery pages; `factory-reset-error-page.tsx:48-74` 3 buttons rendered; `factory-reset-recovery-page.tsx:27-31` Return-to-dashboard with reloadDocument; `help/factory-reset-recovery.tsx:16-17` verbatim tar command; router.tsx:41,163 registers the help route. |
| SC7 | Pre-reset blocking checks — update-in-progress, network unreachable, backup mutex (TODO), non-admin (already SC1)                      | ✓ VERIFIED | `factory-reset-modal.tsx:45-48` updateStatus query + `running` check; `:54-55` usePreflight hook; `:58-64` computeConfirmEnabled gates all 5 paths; `:50-52` v30.0 backup-mutex TODO comment present; preflight-decision.unit.test.ts 12 assertions covering all paths + precedence. |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact                                                                                          | Expected                                              | Status     | Details                                                                                                |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| `livos/packages/ui/src/features/factory-reset/lib/types.ts`                                        | Shared types (FactoryResetEvent, UiState, etc.)       | ✓ VERIFIED | Read OK                                                                                                |
| `livos/packages/ui/src/features/factory-reset/lib/typed-confirm.ts`                                | strict equality helper                                | ✓ VERIFIED | 10 lines, exports EXPECTED_CONFIRM_PHRASE + isFactoryResetTrigger                                       |
| `livos/packages/ui/src/features/factory-reset/lib/deletion-list.ts`                                | 7 verbatim items                                      | ✓ VERIFIED | length 7, all D-MD-01 verbatim                                                                          |
| `livos/packages/ui/src/features/factory-reset/lib/error-tags.ts`                                   | mapErrorTagToMessage 5-way                            | ✓ VERIFIED | 4 tags + null fallback                                                                                  |
| `livos/packages/ui/src/features/factory-reset/lib/state-machine.ts`                                | deriveFactoryResetState + stateLabel                  | ✓ VERIFIED | All 5 D-OV-03 transitions                                                                               |
| `livos/packages/ui/src/features/factory-reset/lib/network-preflight.ts`                            | preflightFetchLivinity + 5s AbortController           | ✓ VERIFIED | DEFAULT_PREFLIGHT_TIMEOUT_MS = 5_000                                                                    |
| `livos/packages/ui/src/features/factory-reset/lib/polling-state.ts`                                | computePollingDisplayState + 90s threshold            | ✓ VERIFIED | CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS = 90_000                                                      |
| `livos/packages/ui/src/features/factory-reset/lib/post-reset-redirect.ts`                          | selectPostResetRoute                                  | ✓ VERIFIED | 3-branch pure decision                                                                                  |
| `livos/packages/ui/src/features/factory-reset/lib/select-latest-event.ts`                          | filter + sort by started_at desc                      | ✓ VERIFIED | type === 'factory-reset' filter + sort                                                                  |
| `livos/packages/ui/src/routes/settings/_components/danger-zone.tsx`                                | DangerZone admin/non-admin/loading                    | ✓ VERIFIED | decideDangerZoneVisibility pure helper                                                                  |
| `livos/packages/ui/src/routes/settings/advanced.tsx`                                               | DangerZone integration mobile + desktop               | ✓ VERIFIED | Drawer (line 123) + Dialog (line 169); legacy row removed                                               |
| `livos/packages/ui/src/routes/factory-reset/index.tsx`                                             | renders FactoryResetModal                             | ✓ VERIFIED | EnsureLoggedIn wrapper                                                                                  |
| `livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.tsx`                   | explicit-list modal + radio + typed-confirm + gating  | ✓ VERIFIED | All 11 truth-criteria from PLAN03 satisfied                                                             |
| `livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx`                | BarePage overlay + polling + redirect/error fan-out   | ✓ VERIFIED | Source-text matches all PLAN04 must_haves                                                               |
| `livos/packages/ui/src/routes/factory-reset/_components/factory-reset-error-page.tsx`              | 3-button error page                                   | ✓ VERIFIED | View event log / Try again / Manual SSH                                                                 |
| `livos/packages/ui/src/routes/factory-reset/_components/factory-reset-recovery-page.tsx`           | rolled-back recovery page                             | ✓ VERIFIED | Return-to-dashboard with reloadDocument                                                                 |
| `livos/packages/ui/src/routes/factory-reset/_components/preflight-decision.ts`                     | computeConfirmEnabled                                 | ✓ VERIFIED | 5 disable paths + precedence                                                                            |
| `livos/packages/ui/src/routes/factory-reset/_components/use-preflight.ts`                          | usePreflight hook                                     | ✓ VERIFIED | 5s AbortController via lib                                                                              |
| `livos/packages/ui/src/routes/factory-reset/_components/misc.tsx`                                  | simplified — title + backPath only                    | ✓ VERIFIED | description() removed                                                                                   |
| `livos/packages/ui/src/routes/help/factory-reset-recovery.tsx`                                     | static SSH recovery page with verbatim tar command    | ✓ VERIFIED | RECOVERY_COMMAND constant on line 16-17                                                                 |
| `livos/packages/ui/src/providers/global-system-state/reset.tsx`                                    | useReset({preserveApiKey}) + ResettingCover swap      | ✓ VERIFIED | ResettingCover returns `<FactoryResetProgress />`                                                       |
| `livos/packages/ui/src/providers/global-system-state/index.tsx`                                    | context type updated                                  | ✓ VERIFIED | line 32: reset: (input: {preserveApiKey: boolean}) => void                                              |
| `livos/packages/ui/src/router.tsx`                                                                  | /help/factory-reset-recovery registered                | ✓ VERIFIED | line 41 lazy import; line 163-164 route element                                                         |
| `livos/packages/ui/public/locales/en.json`                                                          | 25 new i18n keys                                       | ✓ VERIFIED | 4 (Plan 02) + 10 (Plan 03) + 11 (Plan 04) = 25 keys present                                             |
| Legacy: `_components/{review-data,confirm-with-password,success}.tsx`                              | DELETED                                                | ✓ VERIFIED | Glob returns no files; grep returns no consumer references                                              |

### Key Link Verification

| From                                                                | To                                                              | Via                                                       | Status     | Details                                                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| reset.tsx                                                            | trpcReact.system.factoryReset.useMutation                       | useMutation contract returning {accepted, eventPath, snapshotPath} | ✓ WIRED    | reset.tsx:23                                                                                            |
| index.tsx (provider)                                                 | GlobalSystemStateContext.reset                                  | (input: {preserveApiKey: boolean}) => void                 | ✓ WIRED    | index.tsx:32                                                                                            |
| danger-zone.tsx                                                      | useCurrentUser                                                  | isAdmin gate                                              | ✓ WIRED    | danger-zone.tsx:21,43                                                                                   |
| danger-zone.tsx                                                      | /factory-reset route                                            | IconButtonLink to='/factory-reset'                         | ✓ WIRED    | danger-zone.tsx:67                                                                                      |
| advanced.tsx                                                         | DangerZone                                                      | imports + renders                                         | ✓ WIRED    | advanced.tsx:14,123,169                                                                                 |
| factory-reset-modal.tsx                                              | typed-confirm lib                                               | isFactoryResetTrigger                                     | ✓ WIRED    | line 20,57                                                                                              |
| factory-reset-modal.tsx                                              | deletion-list lib                                               | DELETION_LIST.map                                         | ✓ WIRED    | line 19,102                                                                                             |
| factory-reset-modal.tsx                                              | useGlobalSystemState                                             | reset({preserveApiKey})                                    | ✓ WIRED    | line 21,37,71                                                                                           |
| factory-reset-modal.tsx                                              | trpc.system.updateStatus                                        | running:boolean check                                      | ✓ WIRED    | line 45-48                                                                                              |
| factory-reset-modal.tsx                                              | usePreflight + preflightFetchLivinity                            | 5s AbortController                                        | ✓ WIRED    | line 31,54                                                                                              |
| factory-reset-progress.tsx                                           | trpc.system.listUpdateHistory                                   | refetchInterval:2000                                       | ✓ WIRED    | line 35-47                                                                                              |
| factory-reset-progress.tsx                                           | selectLatestFactoryResetEvent                                    | filter + sort                                             | ✓ WIRED    | line 21,73                                                                                              |
| factory-reset-progress.tsx                                           | selectPostResetRoute                                            | window.location.href                                       | ✓ WIRED    | line 22,80,84                                                                                           |
| factory-reset-progress.tsx                                           | computePollingDisplayState                                       | 90s threshold                                             | ✓ WIRED    | line 20,97                                                                                              |
| reset.tsx (Plan 04)                                                  | FactoryResetProgress                                            | ResettingCover swap                                        | ✓ WIRED    | reset.tsx:39-41                                                                                         |
| router.tsx                                                           | help/factory-reset-recovery                                     | createBrowserRouter children                               | ✓ WIRED    | router.tsx:41,163-164                                                                                   |

### Data-Flow Trace (Level 4)

| Artifact                                                                    | Data Variable           | Source                                                   | Produces Real Data                          | Status     |
| --------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------- | ------------------------------------------- | ---------- |
| `factory-reset-modal.tsx`                                                    | updateStatusQ.data       | trpc.system.updateStatus.useQuery                        | Live tRPC query → backend updateStatus       | ✓ FLOWING  |
| `factory-reset-modal.tsx`                                                    | preflight.result          | usePreflight → preflightFetchLivinity → fetch HEAD       | Live fetch against https://livinity.io      | ✓ FLOWING  |
| `factory-reset-modal.tsx`                                                    | radioValue + confirmInput | useState (user input)                                    | User-driven                                 | ✓ FLOWING  |
| `factory-reset-progress.tsx`                                                 | historyQ.data             | trpc.system.listUpdateHistory.useQuery({limit:10})       | Live tRPC poll @ 2s → JSON event row reader | ✓ FLOWING  |
| `factory-reset-progress.tsx`                                                 | lastKnownEvent            | selectLatestFactoryResetEvent(historyQ.data)             | Pure derivation from polled rows            | ✓ FLOWING  |
| `factory-reset-error-page.tsx`                                               | event prop                | passed from FactoryResetProgress                          | Real event from polled history               | ✓ FLOWING  |
| `factory-reset-recovery-page.tsx`                                            | event prop                | passed from FactoryResetProgress                          | Real event from polled history               | ✓ FLOWING  |
| `danger-zone.tsx`                                                            | isAdmin / isLoading       | useCurrentUser hook                                       | Live identity from auth state               | ✓ FLOWING  |
| `help/factory-reset-recovery.tsx`                                            | RECOVERY_COMMAND          | const literal (D-RT-02 verbatim)                          | Static (intentional)                         | ✓ FLOWING  |

### Behavioral Spot-Checks

| Behavior                                                       | Command                                                                                                                                                                                                          | Result                  | Status |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------ |
| All Phase 38 unit tests pass                                    | `cd livos && pnpm --filter ui exec vitest run src/features/factory-reset src/routes/factory-reset src/routes/settings/_components/danger-zone src/providers/global-system-state` | 143/143 passing in 3.7s | ✓ PASS |
| TypeScript compiles with no new factory-reset errors           | `cd livos/packages/ui && npx tsc --noEmit -p . 2>&1 \| grep -E "factory-reset\|danger-zone\|global-system-state/reset"`                                                                                          | empty output           | ✓ PASS |
| `IconButtonLink` and dialog/radix imports resolve              | TypeScript pass implies module resolution OK                                                                                                                                                                     | implicit via tsc        | ✓ PASS |
| Verbatim recovery command present in help page source          | grep "tar -xzf $(cat /tmp/livos-pre-reset.path) -C /" livos/packages/ui/src/routes/help/factory-reset-recovery.tsx                                                                                              | match on line 17        | ✓ PASS |
| Polling interval literal = 2000ms                              | grep "POLL_INTERVAL_MS = 2_000" livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx                                                                                                  | match on line 32        | ✓ PASS |
| 90s threshold literal = 90_000ms                               | grep "CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS = 90_000" livos/packages/ui/src/features/factory-reset/lib/polling-state.ts                                                                                       | match on line 23        | ✓ PASS |

### Requirements Coverage (FR-UI-01..07)

| Requirement | Source Plan(s) | Description                                                                                       | Status        | Evidence                                                                                                            |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| FR-UI-01    | 02             | Settings > Advanced Danger Zone destructive Factory Reset button                                   | ✓ SATISFIED   | danger-zone.tsx + advanced.tsx integration verified                                                                |
| FR-UI-02    | 03             | Confirmation modal explicit-list consent surface                                                  | ✓ SATISFIED   | factory-reset-modal.tsx:98-105 `<ul>` with verbatim DELETION_LIST                                                  |
| FR-UI-03    | 03             | Account preservation radio (preserve/fresh)                                                       | ✓ SATISFIED   | factory-reset-modal.tsx:109-133 + i18n descriptions                                                                |
| FR-UI-04    | 01 (lib) + 03 (wired) | Type-to-confirm `FACTORY RESET` strict equality                                                   | ✓ SATISFIED   | typed-confirm.ts strict eq + factory-reset-modal.tsx:57 wired                                                       |
| FR-UI-05    | 01 (lib) + 04 (component) | BarePage progress overlay polling event row                                                       | ✓ SATISFIED   | factory-reset-progress.tsx + ResettingCover swap                                                                   |
| FR-UI-06    | 01 (lib) + 04 (component) | Post-reset routing (/login, /onboarding, error page, recovery page) + recovery static page        | ✓ SATISFIED   | post-reset-redirect.ts + 3 page components + /help/factory-reset-recovery route                                     |
| FR-UI-07    | 01 (lib) + 02 (admin gate) + 03 (wired) | Pre-reset blocking checks (update / network / backup-TODO / non-admin)                            | ✓ SATISFIED   | preflight-decision.ts + danger-zone.tsx admin gate + factory-reset-modal.tsx wiring                                |

**No orphaned requirements** — REQUIREMENTS.md maps FR-UI-01..07 to Phase 38 only; all 7 satisfied.

### Anti-Patterns Found

| File                                                                | Line | Pattern                                                                  | Severity | Impact                                                                                          |
| ------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `factory-reset-modal.tsx`                                            | 50-52 | `// TODO(v30.0): backup-mutex pre-flight check (BAK-SCHED-04 lock)`     | ℹ️ Info  | Forward-compat marker — explicitly required by D-PF-01 item 3 / D-DEF-01. Not a regression.     |

No blocker anti-patterns. No TODO/FIXME/PLACEHOLDER comments outside the intentional v30.0 forward-compat marker. No empty handlers (`() => {}`) feeding into rendering. No hardcoded empty arrays in render paths (DELETION_LIST has 7 items).

### Hard-Gate Regression Checks

| Hard Gate                                                       | Status   | Evidence                                                                                                |
| --------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| ZERO modifications to `livos/packages/livinityd/`                | ✓ PASS   | `git show --name-only` for d2fef46e, f8d80579, 040d5f4f, 366aa6e1 returns 0 livinityd files            |
| No Server4 references in production code                        | ✓ PASS   | Grep for Server4|Server5 returns only test files (negative-assertion tests verifying absence)           |
| TypeScript passes (no new factory-reset errors)                 | ✓ PASS   | `tsc --noEmit -p .` — pre-existing livinityd ai/routes errors only; 0 errors in Phase 38 files         |
| All component tests pass                                        | ✓ PASS   | 143/143 vitest assertions pass in 3.7s                                                                  |
| Strict equality `FACTORY RESET` matcher used everywhere         | ✓ PASS   | `isFactoryResetTrigger` is the single helper; modal calls it directly; no inline string comparison elsewhere |
| Legacy `getFactoryResetStatus`/`ConfirmWithPassword`/`ReviewData` removed | ✓ PASS   | Grep returns no results across `livos/packages/ui/src/`                                          |

### Human Verification Required

11 items need human testing in a real browser (see frontmatter `human_verification`). Summary:

1. **Settings > Advanced > Danger Zone end-to-end click-through (admin user)** — visual presentation
2. **Type-to-confirm interaction** — live keystroke + tooltip rendering
3. **Modal dismiss behavior (D-CF-03)** — outside-click suppression + Escape pass-through
4. **Pre-flight gating: simulated update-in-progress** — wired query → button-disable transition
5. **Pre-flight gating: simulated unreachable network** — 5s timeout + tooltip feedback
6. **BarePage progress overlay visual + polling cadence** — DevTools Network panel observation
7. **Post-reset routing — preserveApiKey=true success** — window.location.href to /login
8. **Post-reset routing — preserveApiKey=false success** — window.location.href to /onboarding
9. **Failure path — error page renders 3 buttons** — multi-route navigation
10. **Rolled-back path — recovery page renders** — reloadDocument behavior
11. **Non-admin user sees explanatory note instead of button** — multi-user dev environment required

### Gaps Summary

No automated gaps. All 7 success criteria pass static + unit-test verification:

- Settings > Advanced Danger Zone is wired with admin-only gating (SC1).
- Confirmation modal renders the verbatim 7-item DELETION_LIST as a real `<ul>` with `<li>` per item (SC2).
- Preserve-account radio defaults to "Restore my account" with both descriptions (SC3).
- Strict `===` typed-confirm with 9 negative-variant test assertions (SC4).
- BarePage overlay polls listUpdateHistory @ 2s with state-machine label and 90s reconnect threshold (SC5).
- Post-reset fan-out to /login | /onboarding | error page | recovery page + static SSH recovery help page with verbatim tar+systemctl command (SC6).
- Pre-flight gates 5 paths (mutation pending, update running, preflight in flight, network unreachable, typed-confirm mismatch) with explicit precedence + v30.0 backup-mutex TODO (SC7).

Hard gates pass: 0 livinityd modifications, 0 production-code Server4/5 references, TypeScript clean for Phase 38 files, 143/143 unit tests, strict-equality matcher used everywhere, all 3 legacy components deleted.

The remaining work is a manual browser walkthrough of UI behaviors that cannot be programmatically verified without a running dev server: visual presentation, tooltip rendering, multi-route navigation, hard-navigation observation, and the multi-user non-admin path.

---

_Verified: 2026-04-29T06:20:00Z_
_Verifier: Claude (gsd-verifier)_
