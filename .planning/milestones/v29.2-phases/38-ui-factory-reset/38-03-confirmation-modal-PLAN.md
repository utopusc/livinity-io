---
phase: 38-ui-factory-reset
plan: 03
type: execute
wave: 3
depends_on: ["38-01", "38-02"]
files_modified:
  - livos/packages/ui/src/routes/factory-reset/index.tsx
  - livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.tsx
  - livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.unit.test.tsx
  - livos/packages/ui/src/routes/factory-reset/_components/use-preflight.ts
  - livos/packages/ui/src/routes/factory-reset/_components/use-preflight.unit.test.tsx
  - livos/packages/ui/src/routes/factory-reset/_components/preflight-decision.ts
  - livos/packages/ui/src/routes/factory-reset/_components/preflight-decision.unit.test.ts
  - livos/packages/ui/src/routes/factory-reset/_components/misc.tsx
  - livos/packages/ui/public/locales/en.json
autonomous: true
requirements:
  - FR-UI-02
  - FR-UI-03
  - FR-UI-04
  - FR-UI-07
must_haves:
  truths:
    - 'Navigating to /factory-reset opens a confirmation modal (shadcn/ui Dialog) on top of the existing app, with closeOnPointerDownOutside disabled (D-CF-03)'
    - 'Modal body contains a real <ul> element with exactly 7 <li> children, each rendering one verbatim DELETION_LIST item (D-MD-01)'
    - 'Modal contains a RadioGroup with two options: "Restore my account" (preserveApiKey=true, default-checked) and "Start fresh as new user" (preserveApiKey=false), each with the spec-locked description text (D-RD-01)'
    - 'Modal contains a text input labeled "Type FACTORY RESET to enable the destructive button" (D-CF-01)'
    - 'The destructive Confirm button is DISABLED until input.value === "FACTORY RESET" (strict equality via isFactoryResetTrigger from Plan 01) (D-CF-02)'
    - 'The destructive Confirm button is ALSO disabled when pre-flight fails: update-in-progress (trpc.system.updateStatus.useQuery -> running:true) OR network unreachable (preflightFetchLivinity -> reachable:false) OR while pre-flight is still in flight (D-PF-01, D-PF-02)'
    - 'Pre-flight check runs once per modal-open via the preflightFetchLivinity helper from Plan 01, with 5s AbortController timeout — verified by unit test injecting a slow fetchImpl'
    - 'Closing and re-opening the modal triggers a fresh pre-flight check (D-PF-02 last paragraph)'
    - 'The "Restore my account" radio is preselected on first render (the safer default per D-RD-01)'
    - 'On confirm-button-click, the modal calls reset({preserveApiKey}) from useGlobalSystemState() (Plan 01 contract) and the modal closes / global cover takes over'
    - 'There is a forward-compat // TODO comment about the v30.0 backup-mutex pre-flight check (D-PF-01 item 3)'
  artifacts:
    - path: livos/packages/ui/src/routes/factory-reset/_components/preflight-decision.ts
      provides: 'computeConfirmEnabled({typedConfirm, updateRunning, networkReachable, preflightInFlight, mutationPending}) -> {enabled: boolean, reason: string | null}'
      exports: ['computeConfirmEnabled', 'PreflightDecision']
    - path: livos/packages/ui/src/routes/factory-reset/_components/use-preflight.ts
      provides: 'usePreflight() React hook -> {isFlight, result} backed by preflightFetchLivinity'
      exports: ['usePreflight']
    - path: livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.tsx
      provides: 'FactoryResetModal React component (the new explicit-list dialog with radio + type-confirm + pre-flight-gated submit)'
      exports: ['FactoryResetModal']
    - path: livos/packages/ui/src/routes/factory-reset/index.tsx
      provides: 'Top-level /factory-reset route renderer (legacy ReviewData/ConfirmWithPassword/Success removed; new FactoryResetModal mounted)'
  key_links:
    - from: livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.tsx
      to: '@/features/factory-reset/lib/typed-confirm'
      via: 'isFactoryResetTrigger(input)'
      pattern: 'isFactoryResetTrigger\\('
    - from: livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.tsx
      to: '@/features/factory-reset/lib/deletion-list'
      via: 'DELETION_LIST.map((item) => <li>...</li>)'
      pattern: 'DELETION_LIST\\.map'
    - from: livos/packages/ui/src/routes/factory-reset/_components/use-preflight.ts
      to: '@/features/factory-reset/lib/network-preflight'
      via: 'preflightFetchLivinity({timeoutMs: 5000})'
      pattern: 'preflightFetchLivinity\\('
    - from: livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.tsx
      to: trpcReact.system.updateStatus.useQuery
      via: 'system.updateStatus -> running:boolean (D-PF-01 item 1)'
      pattern: 'system\\.updateStatus'
    - from: livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.tsx
      to: useGlobalSystemState
      via: 'reset({preserveApiKey})'
      pattern: 'useGlobalSystemState\\('
---

<objective>
Replace the legacy password-gated factory-reset UI with the new explicit-list
modal that meets D-MD-01 (verbatim deletion list as a real `<ul>`), D-RD-01
(preserve-account radio with safe default), D-CF-01..03 (type-`FACTORY
RESET`-to-confirm + non-dismissable-on-outside-click + Cancel button), and
D-PF-01..02 (pre-flight blocking checks: update-in-progress + network
reachability with 5s AbortController timeout).

Purpose: FR-UI-02 (consent surface), FR-UI-03 (account preservation choice),
FR-UI-04 (type-to-confirm), FR-UI-07 (pre-flight gating).

Output: A new `FactoryResetModal` component + an extracted-pure-logic file
`preflight-decision.ts` that decides "is the destructive button enabled or
not, and if not why" — testable without RTL. The legacy `_components/{
review-data, confirm-with-password, success}.tsx` files are deleted; the
`/factory-reset` route renders the new modal.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/38-ui-factory-reset/38-CONTEXT.md
@.planning/phases/38-ui-factory-reset/38-01-foundation-and-unbreak-SUMMARY.md
@livos/packages/ui/src/features/factory-reset/lib/typed-confirm.ts
@livos/packages/ui/src/features/factory-reset/lib/deletion-list.ts
@livos/packages/ui/src/features/factory-reset/lib/network-preflight.ts
@livos/packages/ui/src/features/factory-reset/lib/types.ts
@livos/packages/ui/src/routes/factory-reset/index.tsx
@livos/packages/ui/src/routes/factory-reset/_components/misc.tsx
@livos/packages/ui/src/shadcn-components/ui/dialog.tsx
@livos/packages/ui/src/shadcn-components/ui/radio-group.tsx
@livos/packages/ui/src/shadcn-components/ui/button.tsx
@livos/packages/ui/src/shadcn-components/ui/tooltip.tsx
@livos/packages/ui/src/providers/global-system-state/index.tsx

<interfaces>
From `@/features/factory-reset/lib/typed-confirm.ts` (Plan 01):
```typescript
export const EXPECTED_CONFIRM_PHRASE = 'FACTORY RESET'
export function isFactoryResetTrigger(input: string): boolean
```

From `@/features/factory-reset/lib/deletion-list.ts` (Plan 01):
```typescript
export const DELETION_LIST: readonly string[]   // length 7
```

From `@/features/factory-reset/lib/network-preflight.ts` (Plan 01):
```typescript
export interface PreflightResult {
  reachable: boolean
  reason?: 'timeout' | 'fetch-error' | 'http-error'
  status?: number
}
export const DEFAULT_PREFLIGHT_TIMEOUT_MS: number   // 5000
export async function preflightFetchLivinity(opts?: {
  timeoutMs?: number
  fetchImpl?: typeof fetch
  url?: string
}): Promise<PreflightResult>
```

From `@/providers/global-system-state` (Plan 01 rewrite):
```typescript
export function useGlobalSystemState(): {
  // ...
  reset: (input: {preserveApiKey: boolean}) => void
  // ...
}
```

From `livos/packages/livinityd/source/modules/system/update.ts` (existing — DO NOT MODIFY livinityd):
```typescript
// system.updateStatus.useQuery() returns:
type UpdateStatus = {
  progress?: number
  description?: string
  running: boolean
  error?: string
}
```

From `livos/packages/ui/src/shadcn-components/ui/dialog.tsx`:
```typescript
// Dialog (Radix Root), DialogTrigger, DialogContent, DialogPortal, DialogOverlay
// Use `<Dialog open onOpenChange={...}>` and pass `onPointerDownOutside={(e) => e.preventDefault()}`
// to DialogContent to disable outside-click dismissal (D-CF-03).
```

From `livos/packages/ui/src/shadcn-components/ui/radio-group.tsx`:
```typescript
export {RadioGroup, RadioGroupItem}
// Use defaultValue='preserve' to default-select the safer option.
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract pure preflight-decision logic + write unit tests</name>
  <files>
    livos/packages/ui/src/routes/factory-reset/_components/preflight-decision.ts,
    livos/packages/ui/src/routes/factory-reset/_components/preflight-decision.unit.test.ts
  </files>
  <read_first>
    1. .planning/phases/38-ui-factory-reset/38-CONTEXT.md (D-PF-01 + D-PF-02 + D-CF-02 — the gating rules being encoded)
    2. livos/packages/ui/src/features/factory-reset/lib/typed-confirm.ts (the strict-equality helper this decision composes with)
  </read_first>
  <action>
**Step 1 — Create `preflight-decision.ts`:**
A single pure function that encodes the "should the destructive button be
enabled?" decision with the FULL precedence chain (D-PF-01). Each disabled
case returns a tooltip reason string verbatim per CONTEXT.md.
```typescript
// Phase 38 Plan 03 — pure decision function for the destructive Confirm button.
// Implements D-PF-01 + D-CF-02 precedence:
//   1. mutation-pending  -> disabled, tooltip "Reset already in progress…"
//   2. update-running    -> disabled, "An update is currently running. Try again after it completes."
//   3. preflight-in-flight -> disabled, "Checking network…"
//   4. network-unreachable -> disabled, "Cannot reach livinity.io. Reinstall would fail. Check your internet connection and try again."
//   5. typed-confirm-mismatch -> disabled, "Type FACTORY RESET (case-sensitive) to enable."
//   6. else -> enabled, tooltip null
//
// CALLER MUST also call isFactoryResetTrigger() to derive `typedConfirm`.

export interface PreflightInputs {
  typedConfirm: boolean        // input.value === 'FACTORY RESET'
  updateRunning: boolean        // trpc.system.updateStatus.data?.running === true
  networkReachable: boolean | null  // null = preflight in flight; true/false = settled
  preflightInFlight: boolean    // true while preflight fetch hasn't returned
  mutationPending: boolean      // resetMut.isPending
}

export interface PreflightDecision {
  enabled: boolean
  reason: string | null   // tooltip when disabled; null when enabled
}

export function computeConfirmEnabled(input: PreflightInputs): PreflightDecision {
  if (input.mutationPending) {
    return {enabled: false, reason: 'Reset already in progress…'}
  }
  if (input.updateRunning) {
    return {enabled: false, reason: 'An update is currently running. Try again after it completes.'}
  }
  if (input.preflightInFlight || input.networkReachable === null) {
    return {enabled: false, reason: 'Checking network…'}
  }
  if (input.networkReachable === false) {
    return {
      enabled: false,
      reason: 'Cannot reach livinity.io. Reinstall would fail. Check your internet connection and try again.',
    }
  }
  if (!input.typedConfirm) {
    return {enabled: false, reason: 'Type FACTORY RESET (case-sensitive) to enable.'}
  }
  return {enabled: true, reason: null}
}
```

**Step 2 — Create `preflight-decision.unit.test.ts`:**
```typescript
import {describe, expect, it} from 'vitest'
import {computeConfirmEnabled} from './preflight-decision'

const baseEnabled = {
  typedConfirm: true,
  updateRunning: false,
  networkReachable: true,
  preflightInFlight: false,
  mutationPending: false,
}

describe('computeConfirmEnabled (D-PF-01 + D-CF-02 precedence)', () => {
  it('all-clear -> enabled, no reason', () => {
    expect(computeConfirmEnabled(baseEnabled)).toEqual({enabled: true, reason: null})
  })
  it('mutationPending -> disabled, "Reset already in progress…"', () => {
    expect(computeConfirmEnabled({...baseEnabled, mutationPending: true})).toEqual({
      enabled: false,
      reason: 'Reset already in progress…',
    })
  })
  it('updateRunning -> disabled, mentions "update is currently running"', () => {
    const got = computeConfirmEnabled({...baseEnabled, updateRunning: true})
    expect(got.enabled).toBe(false)
    expect(got.reason).toContain('update is currently running')
  })
  it('preflightInFlight=true -> disabled, "Checking network…"', () => {
    expect(computeConfirmEnabled({...baseEnabled, preflightInFlight: true, networkReachable: null}).reason).toBe('Checking network…')
  })
  it('networkReachable=null -> disabled, "Checking network…"', () => {
    expect(computeConfirmEnabled({...baseEnabled, networkReachable: null}).reason).toBe('Checking network…')
  })
  it('networkReachable=false -> disabled, mentions "Cannot reach livinity.io"', () => {
    const got = computeConfirmEnabled({...baseEnabled, networkReachable: false})
    expect(got.enabled).toBe(false)
    expect(got.reason).toContain('Cannot reach livinity.io')
  })
  it('typedConfirm=false -> disabled, mentions "FACTORY RESET (case-sensitive)"', () => {
    const got = computeConfirmEnabled({...baseEnabled, typedConfirm: false})
    expect(got.enabled).toBe(false)
    expect(got.reason).toContain('FACTORY RESET (case-sensitive)')
  })
  it('precedence: mutationPending wins over updateRunning', () => {
    expect(
      computeConfirmEnabled({...baseEnabled, mutationPending: true, updateRunning: true}).reason
    ).toContain('Reset already in progress')
  })
  it('precedence: updateRunning wins over preflight states', () => {
    expect(
      computeConfirmEnabled({...baseEnabled, updateRunning: true, preflightInFlight: true, networkReachable: null}).reason
    ).toContain('update is currently running')
  })
  it('precedence: preflight-in-flight wins over network-unreachable', () => {
    expect(
      computeConfirmEnabled({...baseEnabled, preflightInFlight: true, networkReachable: false}).reason
    ).toBe('Checking network…')
  })
  it('precedence: network-unreachable wins over typedConfirm=false', () => {
    expect(
      computeConfirmEnabled({...baseEnabled, networkReachable: false, typedConfirm: false}).reason
    ).toContain('Cannot reach livinity.io')
  })
  it('NO reason references Server4 or Server5', () => {
    const allCases = [
      computeConfirmEnabled({...baseEnabled, mutationPending: true}),
      computeConfirmEnabled({...baseEnabled, updateRunning: true}),
      computeConfirmEnabled({...baseEnabled, preflightInFlight: true, networkReachable: null}),
      computeConfirmEnabled({...baseEnabled, networkReachable: false}),
      computeConfirmEnabled({...baseEnabled, typedConfirm: false}),
    ]
    for (const c of allCases) {
      expect(c.reason).not.toContain('Server4')
      expect(c.reason).not.toContain('Server5')
    }
  })
})
```
  </action>
  <acceptance_criteria>
    - File exists with `computeConfirmEnabled` exported
    - Test file has ≥10 assertions covering all 5 disable paths + the all-clear path + at least 4 precedence cases + Server4/5 negative check
    - Run `cd livos && pnpm --filter ui exec vitest run src/routes/factory-reset/_components/preflight-decision.unit.test.ts` — all pass
  </acceptance_criteria>
  <verify>
    <automated>cd livos && pnpm --filter ui exec vitest run src/routes/factory-reset/_components/preflight-decision.unit.test.ts --reporter=verbose</automated>
  </verify>
  <done>Pure decision function + tests committed.</done>
</task>

<task type="auto">
  <name>Task 2: Create usePreflight() hook + unit test (5s AbortController timeout, fresh check per modal-open)</name>
  <files>
    livos/packages/ui/src/routes/factory-reset/_components/use-preflight.ts,
    livos/packages/ui/src/routes/factory-reset/_components/use-preflight.unit.test.tsx
  </files>
  <read_first>
    1. livos/packages/ui/src/features/factory-reset/lib/network-preflight.ts (Plan 01 — the underlying fetch helper)
    2. livos/packages/ui/src/features/factory-reset/lib/network-preflight.unit.test.ts (Plan 01 — patterns for testing AbortController-driven timeouts)
    3. .planning/phases/38-ui-factory-reset/38-CONTEXT.md D-PF-02 (5s timeout, run-once-per-modal-open semantics)
  </read_first>
  <action>
**Step 1 — Create `use-preflight.ts`:**
```typescript
// Phase 38 Plan 03 — React hook wrapper around preflightFetchLivinity.
// Runs ONCE per modal-open (D-PF-02 last paragraph). Caller passes `enabled`
// which goes false when the modal closes; the next open re-mounts this hook
// (because the modal unmounts when closed) and triggers a fresh check.
//
// 5-second timeout per D-PF-02 — passed to AbortController via the lib helper.

import {useEffect, useRef, useState} from 'react'

import {
  preflightFetchLivinity,
  DEFAULT_PREFLIGHT_TIMEOUT_MS,
  type PreflightResult,
} from '@/features/factory-reset/lib/network-preflight'

export interface UsePreflightState {
  inFlight: boolean
  result: PreflightResult | null
}

export function usePreflight(opts: {enabled: boolean; fetchImpl?: typeof fetch} = {enabled: true}): UsePreflightState {
  const [state, setState] = useState<UsePreflightState>({inFlight: opts.enabled, result: null})
  const ranRef = useRef(false)

  useEffect(() => {
    if (!opts.enabled) return
    if (ranRef.current) return
    ranRef.current = true
    let cancelled = false
    setState({inFlight: true, result: null})
    preflightFetchLivinity({
      timeoutMs: DEFAULT_PREFLIGHT_TIMEOUT_MS,
      fetchImpl: opts.fetchImpl,
    }).then((result) => {
      if (cancelled) return
      setState({inFlight: false, result})
    })
    return () => {
      cancelled = true
    }
  }, [opts.enabled, opts.fetchImpl])

  return state
}
```

**Step 2 — Create `use-preflight.unit.test.tsx`:**
RTL is NOT installed. We'll smoke-test the import + verify the underlying lib
behavior is consumed correctly via a non-React harness that calls
`preflightFetchLivinity` directly with an injected `fetchImpl` matching the
hook's call shape. Keep the deferred-RTL test plan in comments.

```typescript
// @vitest-environment jsdom
//
// Phase 38 Plan 03 — usePreflight hook tests.
//
// `@testing-library/react` is NOT installed. The hook is a thin wrapper around
// `preflightFetchLivinity` (Plan 01) — the substantive behavior (5s timeout,
// AbortController, fetch-error vs timeout) is already covered by Plan 01's
// tests. This file ships the smoke import + a re-verification at the lib
// boundary the hook depends on.
//
// Deferred RTL tests:
//   UP1 (mounts -> inFlight=true initially, settles to inFlight=false +
//        result.reachable=true when fetchImpl resolves with HEAD 200)
//   UP2 (re-mount triggers a fresh fetch — same fetchImpl spy called twice
//        across two mount/unmount cycles)
//   UP3 (enabled=false -> never fetches; inFlight stays at the initial value
//        and result stays null)
//   UP4 (timeout — fetchImpl that hangs >5s causes result.reason='timeout')

import {describe, expect, it, vi} from 'vitest'

import {preflightFetchLivinity, DEFAULT_PREFLIGHT_TIMEOUT_MS} from '@/features/factory-reset/lib/network-preflight'

describe('usePreflight smoke', () => {
  it('module exports usePreflight', async () => {
    const mod = await import('./use-preflight')
    expect(typeof mod.usePreflight).toBe('function')
  })
})

describe('preflight 5s AbortController timeout (re-verified at lib boundary the hook calls)', () => {
  it('hangs >timeoutMs -> reason=timeout (re-verifies AbortController firing)', async () => {
    const fetchImpl = vi.fn((_url: string, init: any) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const e = new Error('aborted')
          ;(e as any).name = 'AbortError'
          reject(e)
        })
      })
    })
    const res = await preflightFetchLivinity({fetchImpl: fetchImpl as any, timeoutMs: 25})
    expect(res.reachable).toBe(false)
    expect(res.reason).toBe('timeout')
  })
  it('default timeout is 5000ms (D-PF-02)', () => {
    expect(DEFAULT_PREFLIGHT_TIMEOUT_MS).toBe(5000)
  })
})
```
  </action>
  <acceptance_criteria>
    - `use-preflight.ts` exists, exports `usePreflight`
    - `use-preflight.unit.test.tsx` smoke test passes; AbortController re-verification test passes
    - The test file references `DEFAULT_PREFLIGHT_TIMEOUT_MS === 5000` so D-PF-02 cannot drift to a different timeout silently
    - Run `cd livos && pnpm --filter ui exec vitest run src/routes/factory-reset/_components/use-preflight.unit.test.tsx`
  </acceptance_criteria>
  <verify>
    <automated>cd livos && pnpm --filter ui exec vitest run src/routes/factory-reset/_components/use-preflight.unit.test.tsx --reporter=verbose</automated>
  </verify>
  <done>Hook + smoke test committed; AbortController-driven 5s timeout still verified at lib boundary.</done>
</task>

<task type="auto">
  <name>Task 3: Build FactoryResetModal component (Dialog + radio + type-confirm + pre-flight-gated submit) + replace /factory-reset route + i18n keys</name>
  <files>
    livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.tsx,
    livos/packages/ui/src/routes/factory-reset/_components/factory-reset-modal.unit.test.tsx,
    livos/packages/ui/src/routes/factory-reset/_components/misc.tsx,
    livos/packages/ui/src/routes/factory-reset/index.tsx,
    livos/packages/ui/public/locales/en.json
  </files>
  <read_first>
    1. .planning/phases/38-ui-factory-reset/38-CONTEXT.md (D-MD-01, D-MD-02, D-RD-01, D-CF-01, D-CF-02, D-CF-03 — every word matters for verbatim text)
    2. livos/packages/ui/src/shadcn-components/ui/dialog.tsx (FULL — verify `onPointerDownOutside` and `onEscapeKeyDown` props on DialogContent; if absent, find equivalent radix props)
    3. livos/packages/ui/src/shadcn-components/ui/radio-group.tsx (FULL — confirm RadioGroup + RadioGroupItem API)
    4. livos/packages/ui/src/shadcn-components/ui/button.tsx (FULL — confirm `variant='destructive'` exists)
    5. livos/packages/ui/src/shadcn-components/ui/tooltip.tsx (FULL — Tooltip API for the disabled-button reason)
    6. livos/packages/ui/src/providers/global-system-state/index.tsx (useGlobalSystemState API after Plan 01)
    7. livos/packages/ui/src/routes/factory-reset/index.tsx (CURRENT — replace contents wholesale; legacy SplitDialog/ReviewData/ConfirmWithPassword wiring deleted)
    8. livos/packages/ui/src/routes/factory-reset/_components/misc.tsx (delete or repurpose `backPath` constant — keep `backPath = '/settings'` for the Cancel button; drop `title()`/`description()` wrappers if unused)
  </read_first>
  <action>
**Step 1 — Add i18n keys** to `livos/packages/ui/public/locales/en.json`. Verbatim per D-MD-01/D-MD-02/D-RD-01/D-CF-01:
```json
"factory-reset.modal.heading": "Factory Reset",
"factory-reset.modal.intro": "This will permanently delete:",
"factory-reset.modal.bottom-line": "If you previously chose 'Restore my account' the reinstalled LivOS will recognize your Livinity account and current credentials still work. Otherwise the host onboards as new.",
"factory-reset.radio.preserve.title": "Restore my account",
"factory-reset.radio.preserve.description": "Your Livinity API key is preserved. After reinstall, log in with your existing credentials.",
"factory-reset.radio.fresh.title": "Start fresh as new user",
"factory-reset.radio.fresh.description": "Wipe everything including the Livinity API key. After reinstall, you'll go through the onboarding wizard as a new user.",
"factory-reset.confirm-input.label": "Type FACTORY RESET to enable the destructive button:",
"factory-reset.confirm-button.label": "Erase everything and reset",
"factory-reset.cancel-button.label": "Cancel"
```

NOTE: Use the verbatim 7 deletion-list strings DIRECTLY from `DELETION_LIST`
(imported from Plan 01's `@/features/factory-reset/lib/deletion-list`). DO NOT
duplicate them as i18n keys; the constant is the source of truth, the test
suite verifies the structure, and Phase 38 is English-first per project memory.

**Step 2 — Update `_components/misc.tsx`** to keep ONLY what's still used:
```typescript
import {t} from '@/utils/i18n'

export const title = () => t('factory-reset.modal.heading')
export const backPath = '/settings'
```
(remove the legacy `description()` export if no longer referenced.)

**Step 3 — Create `factory-reset-modal.tsx`:**

```typescript
// Phase 38 Plan 03 — explicit-list confirmation modal (FR-UI-02..04 + FR-UI-07).
//
// Mounted by the /factory-reset route. The Settings > Advanced > Danger Zone
// button (Plan 02) navigates here. On open the modal:
//   1. Renders the verbatim 7-item DELETION_LIST as a real <ul>
//   2. Renders the preserve-account RadioGroup, default-checked on "preserve"
//   3. Renders a text input that must equal "FACTORY RESET" exactly to enable
//   4. Runs preflightFetchLivinity once on mount (D-PF-02; re-mount = re-check)
//   5. Wires updateStatus query for the update-in-progress check
//   6. Computes destructive-button enabled state via computeConfirmEnabled
//   7. On confirm-click, calls reset({preserveApiKey}) and navigates back to
//      the dashboard so the GlobalSystemStateProvider's `resetting` cover
//      takes over (Plan 04 ships the new BarePage overlay).

import {useState} from 'react'
import {TbShieldExclamation} from 'react-icons/tb'
import {useNavigate} from 'react-router-dom'

import {DELETION_LIST} from '@/features/factory-reset/lib/deletion-list'
import {EXPECTED_CONFIRM_PHRASE, isFactoryResetTrigger} from '@/features/factory-reset/lib/typed-confirm'
import {useGlobalSystemState} from '@/providers/global-system-state'
import {Button} from '@/shadcn-components/ui/button'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'
import {RadioGroup, RadioGroupItem} from '@/shadcn-components/ui/radio-group'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/shadcn-components/ui/tooltip'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import {backPath} from './misc'
import {computeConfirmEnabled} from './preflight-decision'
import {usePreflight} from './use-preflight'

type RadioValue = 'preserve' | 'fresh'

export function FactoryResetModal() {
  const navigate = useNavigate()
  const {reset} = useGlobalSystemState()

  // ─ State ────────────────────────────────────────────────────────────────
  const [confirmInput, setConfirmInput] = useState('')
  const [radioValue, setRadioValue] = useState<RadioValue>('preserve') // D-RD-01 default
  const [submitted, setSubmitted] = useState(false)

  // ─ Pre-flight inputs ────────────────────────────────────────────────────
  const updateStatusQ = trpcReact.system.updateStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })
  const updateRunning = updateStatusQ.data?.running === true

  // TODO(v30.0): backup-mutex pre-flight check (BAK-SCHED-04 lock). When v30.0
  // ships, gate on `trpc.backups.statusForFactoryReset.useQuery()` here.
  // For v29.2 we ONLY check update-in-progress + network reachability.

  const preflight = usePreflight({enabled: true})
  const networkReachable = preflight.result === null ? null : preflight.result.reachable

  const typedConfirm = isFactoryResetTrigger(confirmInput)
  const decision = computeConfirmEnabled({
    typedConfirm,
    updateRunning,
    networkReachable,
    preflightInFlight: preflight.inFlight,
    mutationPending: submitted, // single-shot guard until the GlobalSystemState cover takes over
  })

  // ─ Handlers ─────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (!decision.enabled || submitted) return
    setSubmitted(true)
    const preserveApiKey = radioValue === 'preserve'
    reset({preserveApiKey})
    // GlobalSystemStateProvider's `resetting` status cover takes over on the
    // next system.status poll. Navigate to root so we sit under the cover.
    navigate('/')
  }

  const handleClose = (open: boolean) => {
    if (!open) navigate(backPath)
  }

  // ─ Render ───────────────────────────────────────────────────────────────
  return (
    <Dialog open onOpenChange={handleClose}>
      <DialogContent
        data-testid='factory-reset-modal'
        onPointerDownOutside={(e) => e.preventDefault()} // D-CF-03: outside click does NOT dismiss
        // Escape DOES dismiss (default Radix behavior — do NOT prevent it)
      >
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2 text-destructive2'>
            <TbShieldExclamation className='h-5 w-5' aria-hidden='true' />
            {t('factory-reset.modal.heading')}
          </DialogTitle>
        </DialogHeader>

        {/* Explicit-list consent surface (D-MD-01 — REAL <ul>) */}
        <p className='text-body-sm font-medium'>{t('factory-reset.modal.intro')}</p>
        <ul data-testid='factory-reset-deletion-list' className='ml-6 list-disc space-y-1 text-body-sm'>
          {DELETION_LIST.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
        <p className='text-body-sm text-text-tertiary'>{t('factory-reset.modal.bottom-line')}</p>

        {/* Preserve-account radio (D-RD-01) */}
        <RadioGroup
          data-testid='factory-reset-radio'
          value={radioValue}
          onValueChange={(v) => setRadioValue(v as RadioValue)}
          className='gap-3'
        >
          <label className='flex items-start gap-2 rounded-radius-md bg-surface-1 p-3'>
            <RadioGroupItem value='preserve' id='radio-preserve' className='mt-0.5' />
            <div className='flex-1'>
              <div className='font-medium'>{t('factory-reset.radio.preserve.title')}</div>
              <div className='text-body-sm text-text-tertiary'>{t('factory-reset.radio.preserve.description')}</div>
            </div>
          </label>
          <label className='flex items-start gap-2 rounded-radius-md bg-surface-1 p-3'>
            <RadioGroupItem value='fresh' id='radio-fresh' className='mt-0.5' />
            <div className='flex-1'>
              <div className='font-medium'>{t('factory-reset.radio.fresh.title')}</div>
              <div className='text-body-sm text-text-tertiary'>{t('factory-reset.radio.fresh.description')}</div>
            </div>
          </label>
        </RadioGroup>

        {/* Type-to-confirm input (D-CF-01) */}
        <label className='block'>
          <span className='mb-1 block text-body-sm font-medium'>{t('factory-reset.confirm-input.label')}</span>
          <input
            data-testid='factory-reset-typed-confirm'
            type='text'
            autoComplete='off'
            spellCheck={false}
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={EXPECTED_CONFIRM_PHRASE}
            className='w-full rounded-radius-md border border-border-subtle bg-surface-base px-3 py-2 font-mono text-body-sm focus:outline-none focus:ring-2 focus:ring-brand/30'
          />
        </label>

        {/* Footer: Cancel + destructive Confirm (gated by computeConfirmEnabled) */}
        <div className='mt-4 flex items-center justify-end gap-2'>
          <Button
            data-testid='factory-reset-cancel'
            type='button'
            variant='secondary'
            onClick={() => navigate(backPath)}
          >
            {t('factory-reset.cancel-button.label')}
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    data-testid='factory-reset-confirm'
                    type='button'
                    variant='destructive'
                    disabled={!decision.enabled}
                    aria-disabled={!decision.enabled}
                    onClick={handleConfirm}
                  >
                    {t('factory-reset.confirm-button.label')}
                  </Button>
                </span>
              </TooltipTrigger>
              {decision.reason && (
                <TooltipContent data-testid='factory-reset-confirm-reason'>
                  {decision.reason}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

If `Button` does NOT have a `variant='secondary'` (verify by reading
`shadcn-components/ui/button.tsx`), substitute the appropriate non-destructive
variant from that file (e.g., `variant='outline'`).

If `DialogContent` does NOT accept `onPointerDownOutside` directly, wrap with
the radix primitive directly: `<DialogPrimitive.Content onPointerDownOutside=
{(e) => e.preventDefault()}>` — but the Radix Dialog upstream supports it, so
it should pass through.

**Step 4 — Replace `livos/packages/ui/src/routes/factory-reset/index.tsx`**:
```typescript
import {EnsureLoggedIn} from '@/modules/auth/ensure-logged-in'

import {FactoryResetModal} from './_components/factory-reset-modal'

export default function FactoryReset() {
  // Phase 38 Plan 03 — replaces the legacy multi-route password gate. The
  // explicit-list modal IS the consent surface; the BarePage progress overlay
  // is wired via GlobalSystemStateProvider's `resetting` status cover (Plan 04).
  return (
    <EnsureLoggedIn>
      <FactoryResetModal />
    </EnsureLoggedIn>
  )
}
```

**Step 5 — Delete legacy components** (no longer referenced):
- `livos/packages/ui/src/routes/factory-reset/_components/confirm-with-password.tsx`
- `livos/packages/ui/src/routes/factory-reset/_components/review-data.tsx`
- `livos/packages/ui/src/routes/factory-reset/_components/success.tsx`

**Step 6 — Create `factory-reset-modal.unit.test.tsx`:**
RTL-free smoke + structural-import tests. Use static module inspection where
possible. The destructive-button gating is already verified by Task 1's pure
tests (composable). The deletion-list structure is verified by Plan 01's
deletion-list test. Here we just confirm wiring exists.

```typescript
// @vitest-environment jsdom
//
// Phase 38 Plan 03 — FactoryResetModal smoke + wiring tests.
//
// `@testing-library/react` is NOT installed. The substantive behaviors are
// covered by pure-logic tests:
//   - Strict-equality typed confirm (Plan 01: typed-confirm.unit.test.ts)
//   - Pre-flight 5s AbortController timeout (Plan 01: network-preflight.unit.test.ts)
//   - 7-item DELETION_LIST verbatim (Plan 01: deletion-list.unit.test.ts)
//   - Confirm-button gating precedence (this plan: preflight-decision.unit.test.ts)
//
// What's left for this file: smoke imports + textual assertions on the
// component source itself (the `<ul>` shape, `<RadioGroup defaultValue>`,
// `onPointerDownOutside`).
//
// Deferred RTL tests (uncomment when @testing-library/react lands):
//   FRM1: opens by default; getByTestId('factory-reset-modal') exists
//   FRM2: getAllByRole('listitem') under the deletion list returns 7
//   FRM3: getByTestId('factory-reset-radio') has data-state='checked' on the
//         'preserve' RadioGroupItem on first render
//   FRM4: typing 'factory reset' (lower) in confirm input: confirm button
//         remains disabled (aria-disabled='true')
//   FRM5: typing 'FACTORY RESET' enables the confirm button
//   FRM6: when system.updateStatus mock returns running:true, confirm button
//         disabled with tooltip "An update is currently running. Try again
//         after it completes."
//   FRM7: when fetchImpl rejects, after re-render confirm button disabled with
//         tooltip "Cannot reach livinity.io. Reinstall would fail. Check your
//         internet connection and try again."
//   FRM8: clicking outside the modal does NOT close it (onPointerDownOutside
//         preventDefault)
//   FRM9: pressing Escape closes the modal (default Radix behavior)
//   FRM10: clicking confirm with valid state calls
//          useGlobalSystemState().reset({preserveApiKey: true}) once

import {readFileSync} from 'node:fs'
import path from 'node:path'

import {describe, expect, it} from 'vitest'

const MODAL_SRC = path.join(__dirname, 'factory-reset-modal.tsx')

describe('FactoryResetModal smoke', () => {
  it('module exports FactoryResetModal', async () => {
    const mod = await import('./factory-reset-modal')
    expect(typeof mod.FactoryResetModal).toBe('function')
  })
})

describe('FactoryResetModal source-text invariants (D-MD-01 / D-CF-03 / D-RD-01 wiring)', () => {
  const src = readFileSync(MODAL_SRC, 'utf8')

  it('imports DELETION_LIST from the lib (D-MD-01 single source of truth)', () => {
    expect(src).toMatch(/from\s+['"]@\/features\/factory-reset\/lib\/deletion-list['"]/)
    expect(src).toMatch(/DELETION_LIST\.map/)
  })
  it('renders the deletion list as a REAL <ul> (not a paragraph)', () => {
    expect(src).toMatch(/<ul[^>]*data-testid=['"]factory-reset-deletion-list['"]/)
  })
  it('imports isFactoryResetTrigger for strict-equality confirm', () => {
    expect(src).toMatch(/isFactoryResetTrigger/)
  })
  it('uses computeConfirmEnabled for the destructive button gate', () => {
    expect(src).toMatch(/computeConfirmEnabled\s*\(/)
  })
  it('uses usePreflight for network reachability', () => {
    expect(src).toMatch(/usePreflight\s*\(/)
  })
  it('imports system.updateStatus for the update-in-progress check', () => {
    expect(src).toMatch(/system\.updateStatus/)
  })
  it('passes onPointerDownOutside preventDefault to DialogContent (D-CF-03)', () => {
    expect(src).toMatch(/onPointerDownOutside=\{[^}]*preventDefault/)
  })
  it('default radio value is "preserve" (D-RD-01 safer default)', () => {
    // either useState<RadioValue>('preserve') or value='preserve' on RadioGroup
    expect(src).toMatch(/useState<RadioValue>\(\s*['"]preserve['"]\s*\)/)
  })
  it('renders Cancel button alongside the destructive button', () => {
    expect(src).toMatch(/data-testid=['"]factory-reset-cancel['"]/)
    expect(src).toMatch(/data-testid=['"]factory-reset-confirm['"]/)
  })
  it('forward-compat backup-mutex TODO comment is present (D-PF-01 item 3)', () => {
    expect(src).toMatch(/TODO\(v30\.0\)[\s\S]*backup-mutex/i)
  })
  it('NO references to Server4 or Server5', () => {
    expect(src).not.toContain('Server4')
    expect(src).not.toContain('Server5')
  })
  it('calls reset({preserveApiKey}) — Plan 01 contract', () => {
    expect(src).toMatch(/reset\(\{preserveApiKey/)
  })
})
```
  </action>
  <acceptance_criteria>
    - `factory-reset-modal.tsx` exists with the full component
    - `factory-reset-modal.unit.test.tsx` exists with ≥10 source-text + smoke assertions
    - `index.tsx` is rewritten to render `<EnsureLoggedIn><FactoryResetModal /></EnsureLoggedIn>` only
    - 3 legacy files deleted: `_components/confirm-with-password.tsx`, `_components/review-data.tsx`, `_components/success.tsx`
    - 10 new i18n keys added to `en.json`
    - `misc.tsx` simplified — only `title()` and `backPath` remain (drop `description()` if unused)
    - Run `cd livos && pnpm --filter ui exec vitest run src/routes/factory-reset` — all tests pass (preflight-decision + use-preflight + factory-reset-modal)
    - Run `cd livos && pnpm --filter ui exec tsc --noEmit -p .` — no new errors
    - Run `grep -rn "ConfirmWithPassword\|ReviewData\|review-data\|confirm-with-password" livos/packages/ui/src/` — returns nothing (legacy refs gone)
    - Run `grep -rn "Server4\|Server5" livos/packages/ui/src/routes/factory-reset/` — returns nothing
    - The destructive button has `data-testid='factory-reset-confirm'` and the deletion list has `data-testid='factory-reset-deletion-list'` for future RTL tests
  </acceptance_criteria>
  <verify>
    <automated>cd livos && pnpm --filter ui exec vitest run src/routes/factory-reset --reporter=verbose</automated>
  </verify>
  <done>FactoryResetModal renders the explicit list + radio + typed-confirm + pre-flight-gated submit; legacy files deleted; tests + typecheck pass.</done>
</task>

</tasks>

<verification>
1. `cd livos && pnpm --filter ui exec vitest run src/routes/factory-reset --reporter=verbose` — all 3 test files pass with ≥30 total assertions
2. `cd livos && pnpm --filter ui exec tsc --noEmit -p .` — no new errors
3. Legacy components deleted: `grep -rn "confirm-with-password\|review-data" livos/packages/ui/src/` returns nothing
4. `grep -rn "Server4\|Server5" livos/packages/ui/src/routes/factory-reset/` returns nothing
5. The forward-compat backup-mutex TODO is present in `factory-reset-modal.tsx`
6. The legacy `t('factory-reset.confirm.body')`, `t('factory-reset.confirm.submit')` etc keys can stay in `en.json` (they're harmless) — no need to delete them
</verification>

<success_criteria>
- /factory-reset route renders the new explicit-list modal
- Modal has a real `<ul>` with 7 verbatim DELETION_LIST items
- Radio defaults to "preserve" (preserveApiKey=true)
- Type-to-confirm uses `isFactoryResetTrigger` (strict equality, ≥6 negative variants in tests)
- Pre-flight check runs once per modal-open with 5s AbortController timeout
- Destructive button gating tested via pure `computeConfirmEnabled` with all 6 paths + precedence
- Forward-compat backup-mutex TODO present
- No Server4/Server5 references
</success_criteria>

<output>
After completion, create `.planning/phases/38-ui-factory-reset/38-03-confirmation-modal-SUMMARY.md` listing:
- New components/hooks/lib files created
- Legacy files deleted
- 10 new i18n keys
- Test totals: preflight-decision ≥11 assertions, use-preflight ≥3, factory-reset-modal ≥10
- Pre-condition for Plan 04: clicking the destructive button calls
  `reset({preserveApiKey})` and navigates to `/`, where the
  GlobalSystemStateProvider's `resetting` cover renders. Plan 04 swaps that
  cover for the listUpdateHistory-polling overlay + post-reset routing + error
  pages + recovery static page.
</output>
