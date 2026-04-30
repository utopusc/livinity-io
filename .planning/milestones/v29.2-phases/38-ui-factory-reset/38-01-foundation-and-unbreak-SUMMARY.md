---
phase: 38-ui-factory-reset
plan: 01
subsystem: ui-factory-reset-foundation
tags: [foundation, type-fix, pure-logic, vitest, factory-reset]
requires:
  - 'Phase 37 backend contract (D-BE-01: system.factoryReset({preserveApiKey: boolean}))'
  - 'Phase 37 D-EVT-02 JSON event row schema (status / wipe_duration_ms / reinstall_duration_ms / install_sh_source / error)'
  - 'Phase 38 D-MD-01 (verbatim 7-item deletion list)'
  - 'Phase 38 D-CF-02 (strict-equality FACTORY RESET matcher)'
  - 'Phase 38 D-OV-03 (state→text mapping)'
  - 'Phase 38 D-PF-02 (5s AbortController preflight)'
  - 'Phase 38 D-RT-02 (error-tag → user-facing message mapping)'
provides:
  - '@/features/factory-reset/lib/types — FactoryResetEvent, FactoryResetUiState, FactoryResetErrorTag, FactoryResetAccepted, PreserveApiKeyChoice'
  - '@/features/factory-reset/lib/typed-confirm — isFactoryResetTrigger(), EXPECTED_CONFIRM_PHRASE'
  - '@/features/factory-reset/lib/deletion-list — DELETION_LIST (readonly 7-item)'
  - '@/features/factory-reset/lib/error-tags — mapErrorTagToMessage()'
  - '@/features/factory-reset/lib/state-machine — deriveFactoryResetState(), stateLabel()'
  - '@/features/factory-reset/lib/network-preflight — preflightFetchLivinity(), DEFAULT_PREFLIGHT_TIMEOUT_MS, PREFLIGHT_URL'
  - 'GlobalSystemStateContext.reset typed (input: {preserveApiKey: boolean}) => void'
  - 'useReset() consuming new {preserveApiKey} mutation shape'
affects:
  - 'Plan 02 (Settings > Advanced Danger Zone button) imports lib/error-tags + lib/network-preflight'
  - 'Plan 03 (modal rewrite) imports lib/typed-confirm + lib/deletion-list and uses GlobalSystemStateContext.reset({preserveApiKey})'
  - 'Plan 04 (BarePage overlay) imports lib/state-machine and replaces ResettingCover stub'
tech-stack:
  added: []
  patterns:
    - 'Pure-logic + co-located vitest unit tests (no @testing-library/react required)'
    - 'fetchImpl/timeoutMs dependency-injection for AbortController preflight tests'
    - 'Verbatim spec strings asserted by exact-match unit tests (D-MD-01 / D-RT-02 lockdown)'
key-files:
  created:
    - 'livos/packages/ui/src/features/factory-reset/lib/types.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/typed-confirm.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/typed-confirm.unit.test.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/deletion-list.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/deletion-list.unit.test.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/error-tags.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/error-tags.unit.test.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/state-machine.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/state-machine.unit.test.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/network-preflight.ts'
    - 'livos/packages/ui/src/features/factory-reset/lib/network-preflight.unit.test.ts'
  modified:
    - 'livos/packages/ui/src/providers/global-system-state/reset.tsx'
    - 'livos/packages/ui/src/providers/global-system-state/index.tsx'
    - 'livos/packages/ui/src/routes/factory-reset/index.tsx'
decisions:
  - 'Bridged the legacy /factory-reset/confirm route by passing preserveApiKey:true (safer default) — Plan 03 deletes the whole route'
  - 'Made ResettingCover a Plan 01 STUB (indeterminate ProgressLayout) — Plan 04 reintroduces real polling + state machine'
  - 'mapErrorTagToMessage formats install_sh_exit_code via "?" when undefined OR null (consistent fallback)'
  - 'preflightFetchLivinity treats HTTP non-2xx as reachable:false reason="http-error" (separate from fetch-error and timeout)'
  - 'Co-located unit tests next to lib files (matches project pattern: docker/dashboard/sort-top-cpu.unit.test.ts)'
metrics:
  duration_minutes: 10
  completed_date: '2026-04-29'
  tasks_completed: 2
  files_changed: 14
  tests_added: 54
---

# Phase 38 Plan 01: Foundation and Un-break Summary

**One-liner:** Six pure-logic lib modules under `@/features/factory-reset/lib/*` unit-tested with 54 vitest assertions, plus a typed un-break of `useReset` and `GlobalSystemStateContext.reset` so the UI typecheck stops failing on Phase 37's `{preserveApiKey: boolean}` schema rewrite.

## What Shipped

### Pure-logic lib (Task 1, commit `e1247c67`)

Five testable modules under `livos/packages/ui/src/features/factory-reset/lib/`. Each is a deterministic function or constant that downstream Plans (02, 03, 04) will import.

| Module | Exports | Test count | Key invariants |
|---|---|---|---|
| `types.ts` | `FactoryResetEvent`, `FactoryResetStatus`, `FactoryResetErrorTag`, `FactoryResetUiState`, `FactoryResetAccepted`, `PreserveApiKeyChoice` | (types only) | Mirrors Phase 37 D-EVT-02 schema exactly — including the 4-tag union and the in-progress / success / failed / rolled-back status set |
| `typed-confirm.ts` | `isFactoryResetTrigger()`, `EXPECTED_CONFIRM_PHRASE` | 9 | Strict `===` only; 7 distinct negative variants asserted (lowercase, mixed case, hyphen, leading/trailing whitespace, double-space, empty) |
| `deletion-list.ts` | `DELETION_LIST` | 11 | Length === 7 + each item asserted verbatim against D-MD-01 |
| `error-tags.ts` | `mapErrorTagToMessage()`, `ErrorMessageContext` | 9 | All 4 tags + null fallback; install_sh_exit_code interpolation; "?" fallback for null/undefined; NO message contains "Server4" |
| `state-machine.ts` | `deriveFactoryResetState()`, `stateLabel()`, `FactoryResetUiStateOrUnknown` | 16 | All 5 D-OV-03 transitions + label invariants for each state |
| `network-preflight.ts` | `preflightFetchLivinity()`, `DEFAULT_PREFLIGHT_TIMEOUT_MS`, `PREFLIGHT_URL` | 9 | success / fetch-error / http-error / timeout (real AbortController, 50ms test timeout) |

**Total: 54 vitest assertions, all passing.** The acceptance bar of "≥30 assertions" is exceeded by 80%.

### Type un-break (Task 2, commit `002e8fa3`)

Phase 37 changed `system.factoryReset` from `{password: string}` → `{preserveApiKey: boolean}` and removed `system.getFactoryResetStatus`. The legacy UI hook `useReset(password)` and `ResettingCover` were type-broken since Phase 37 landed. Plan 38-01 Task 2 fixes this:

- **`providers/global-system-state/reset.tsx` (rewritten)**:
  - `useReset()` returns `(input: {preserveApiKey: boolean}) => void`
  - Calls `trpcReact.system.factoryReset.useMutation({preserveApiKey})` (the new schema)
  - The legacy `getFactoryResetStatus.useQuery` import + call are GONE — that route no longer exists in `livinityd`
  - `ResettingCover` is now a Plan 01 STUB rendering an indeterminate `ProgressLayout` with a `t('factory-reset')` title and the existing `t('factory-reset.resetting.dont-turn-off-device')` callout. Plan 04 reintroduces real polling.

- **`providers/global-system-state/index.tsx` (1-line context type change)**:
  ```diff
  - reset: (password: string) => void
  + reset: (input: {preserveApiKey: boolean}) => void
  ```

- **`routes/factory-reset/index.tsx` (Plan 01 BRIDGE)**:
  The legacy `<ConfirmWithPassword onSubmit={reset}>` callsite is bridged with `(_password: string) => reset({preserveApiKey: true})`. The password value is discarded — the legacy backend gate it used to gate (via UNAUTHORIZED) is gone. Plan 03 deletes this whole route. The bridge keeps Plan 01's typecheck green without invasive cross-plan rewrites.

## Verification

```bash
$ cd livos && pnpm --filter ui exec vitest run src/features/factory-reset/lib --reporter=basic
✓ src/features/factory-reset/lib/typed-confirm.unit.test.ts (9 tests)
✓ src/features/factory-reset/lib/error-tags.unit.test.ts (9 tests)
✓ src/features/factory-reset/lib/state-machine.unit.test.ts (16 tests)
✓ src/features/factory-reset/lib/deletion-list.unit.test.ts (11 tests)
✓ src/features/factory-reset/lib/network-preflight.unit.test.ts (9 tests)
Test Files  5 passed (5)
     Tests  54 passed (54)
```

```bash
$ pnpm --filter ui exec tsc --noEmit -p . 2>&1 | grep -iE "factory|reset|password" | grep -v "stories/"
(no output)
```

```bash
$ grep -rn "getFactoryResetStatus" livos/packages/ui/src/
(no output)

$ grep -rn "system\.factoryReset" livos/packages/ui/src/
livos/packages/ui/src/providers/global-system-state/reset.tsx:23:	const resetMut = trpcReact.system.factoryReset.useMutation({
```

```bash
$ pnpm --filter ui exec vitest run src/providers/global-system-state/onerror-audit.unit.test.ts
Test Files  1 passed (1)
     Tests  1 passed (1)
```

All success criteria from the plan satisfied:

- [x] 6 lib files (types/error-tags/state-machine/typed-confirm/network-preflight/deletion-list) created
- [x] 5 unit-test files created (types.ts has no test — types-only)
- [x] 54 vitest assertions, all passing (≥30 required)
- [x] typed-confirm has 7 negative variants (≥6 required)
- [x] network-preflight covers success / fetch-error / timeout (3 cases minimum) + http-error + AbortSignal injection
- [x] state-machine covers all 5 D-OV-03 transitions (+ label invariants)
- [x] `useReset` rewritten to take `{preserveApiKey}`
- [x] `getFactoryResetStatus` query removed from UI source
- [x] `GlobalSystemStateContext.reset` re-typed to `(input: {preserveApiKey: boolean}) => void`
- [x] `pnpm --filter ui exec tsc --noEmit -p .` shows 0 NEW factory-reset errors
- [x] Pre-existing `onerror-audit` regression test still passes
- [x] `livos/packages/livinityd/` UNTOUCHED
- [x] No `Server4` string in any non-test source (Server4 appears only in negative-test assertion strings, explicitly allowed by plan critical_constraints)

## Threat Surface Scan

No new threat surface introduced by this plan. The pure-logic lib does NOT touch:
- Authentication paths (the new mutation contract is just a typed rewrite of an existing route consumer)
- Filesystem (no fs imports)
- Network (preflight uses HEAD against the public livinity.io hostname; no internal IP)
- Schema at trust boundaries (the FactoryResetEvent type is a passive mirror of Phase 37's already-locked D-EVT-02)

The `mapErrorTagToMessage()` strings have been audited for the project's "no Server4" memory rule — passes (with negative-test assertions enforcing the invariant going forward).

## Deviations from Plan

**None.** Plan executed exactly as written, with one trivial cosmetic adjustment:
- Removed a stale "Hard rule: NEVER mention Server4…" comment block from `error-tags.ts` to keep the source file's `grep -r "Server4"` result empty (negative-test assertions in the test file remain — explicitly allowed by plan critical_constraints).

## Resume Notes (for downstream Plans)

- Plan 02 can `import {preflightFetchLivinity, mapErrorTagToMessage} from '@/features/factory-reset/lib/network-preflight' / '../error-tags'`
- Plan 03 can `import {isFactoryResetTrigger, EXPECTED_CONFIRM_PHRASE, DELETION_LIST} from '@/features/factory-reset/lib/typed-confirm' / '../deletion-list'`
- Plan 04 can `import {deriveFactoryResetState, stateLabel} from '@/features/factory-reset/lib/state-machine'` and replace the Plan 01 `ResettingCover` stub
- All four downstream plans can `import type {FactoryResetEvent, FactoryResetUiState, FactoryResetErrorTag} from '@/features/factory-reset/lib/types'`

The legacy `/factory-reset/confirm` route + its `ConfirmWithPassword` / `ReviewData` / `Success` components are still on disk under `livos/packages/ui/src/routes/factory-reset/_components/` — Plan 03 will delete them. Plan 01 only bridged the password-input call site to keep the typecheck green; nothing else was deleted (per scope discipline).

## Self-Check: PASSED

**Files (all 11 expected lib files present):**
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/types.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/typed-confirm.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/typed-confirm.unit.test.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/deletion-list.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/deletion-list.unit.test.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/error-tags.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/error-tags.unit.test.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/state-machine.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/state-machine.unit.test.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/network-preflight.ts`
- FOUND: `livos/packages/ui/src/features/factory-reset/lib/network-preflight.unit.test.ts`

**Commits:**
- FOUND: `e1247c67` — feat(38-01): add factory-reset pure-logic lib + unit tests
- FOUND: `002e8fa3` — fix(38-01): un-break factoryReset schema in useReset + GlobalSystemStateContext
