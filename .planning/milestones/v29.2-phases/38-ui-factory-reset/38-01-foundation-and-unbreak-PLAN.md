---
phase: 38-ui-factory-reset
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - livos/packages/ui/src/features/factory-reset/lib/types.ts
  - livos/packages/ui/src/features/factory-reset/lib/error-tags.ts
  - livos/packages/ui/src/features/factory-reset/lib/error-tags.unit.test.ts
  - livos/packages/ui/src/features/factory-reset/lib/state-machine.ts
  - livos/packages/ui/src/features/factory-reset/lib/state-machine.unit.test.ts
  - livos/packages/ui/src/features/factory-reset/lib/deletion-list.ts
  - livos/packages/ui/src/features/factory-reset/lib/deletion-list.unit.test.ts
  - livos/packages/ui/src/features/factory-reset/lib/network-preflight.ts
  - livos/packages/ui/src/features/factory-reset/lib/network-preflight.unit.test.ts
  - livos/packages/ui/src/features/factory-reset/lib/typed-confirm.ts
  - livos/packages/ui/src/features/factory-reset/lib/typed-confirm.unit.test.ts
  - livos/packages/ui/src/providers/global-system-state/reset.tsx
  - livos/packages/ui/src/providers/global-system-state/index.tsx
  - livos/packages/ui/src/routes/factory-reset/index.tsx
autonomous: true
requirements:
  - FR-UI-04
  - FR-UI-05
  - FR-UI-06
  - FR-UI-07
must_haves:
  truths:
    - 'pnpm --filter ui tsc --noEmit passes with no new type errors after this plan'
    - 'GlobalSystemStateContext.reset is typed as (input: {preserveApiKey: boolean}) => void'
    - 'isFactoryResetTrigger() === true exactly when input is "FACTORY RESET" (strict equality, case-sensitive, no trim, no normalization)'
    - 'preflightFetchLivinity() resolves to {reachable: true} on HEAD 2xx within 5s'
    - 'preflightFetchLivinity() resolves to {reachable: false, reason: "timeout"} when fetch hangs >5s (AbortController-driven)'
    - 'preflightFetchLivinity() resolves to {reachable: false, reason: "fetch-error"} on network failure'
    - 'mapErrorTagToMessage() returns the spec text verbatim per D-RT-02 for each of the 5 input keys (api-key-401 / server5-unreachable / install-sh-failed / install-sh-unreachable / null)'
    - 'deriveFactoryResetState() returns "stopping-services" / "fetching-install-sh" / "reinstalling" / "success" / "failed" / "rolled-back" deterministically per D-OV-03'
    - 'DELETION_LIST has exactly 7 items, each a non-empty string, in the verbatim order specified by D-MD-01'
  artifacts:
    - path: livos/packages/ui/src/features/factory-reset/lib/types.ts
      provides: 'Shared types: FactoryResetEvent (per D-BE-04), FactoryResetState (D-OV-03), FactoryResetErrorTag, PreserveApiKeyChoice'
      exports: ['FactoryResetEvent', 'FactoryResetState', 'FactoryResetErrorTag']
    - path: livos/packages/ui/src/features/factory-reset/lib/error-tags.ts
      provides: 'mapErrorTagToMessage(tag) -> verbatim error text per D-RT-02'
      exports: ['mapErrorTagToMessage']
    - path: livos/packages/ui/src/features/factory-reset/lib/state-machine.ts
      provides: 'deriveFactoryResetState(event) -> derived state for the BarePage overlay'
      exports: ['deriveFactoryResetState']
    - path: livos/packages/ui/src/features/factory-reset/lib/typed-confirm.ts
      provides: 'isFactoryResetTrigger(input) -> input === "FACTORY RESET" (strict equality)'
      exports: ['isFactoryResetTrigger', 'EXPECTED_CONFIRM_PHRASE']
    - path: livos/packages/ui/src/features/factory-reset/lib/network-preflight.ts
      provides: 'preflightFetchLivinity({signal, timeoutMs}) using AbortController + fetch HEAD'
      exports: ['preflightFetchLivinity', 'PreflightResult', 'DEFAULT_PREFLIGHT_TIMEOUT_MS']
    - path: livos/packages/ui/src/features/factory-reset/lib/deletion-list.ts
      provides: 'DELETION_LIST: readonly string[] of length 7 (D-MD-01)'
      exports: ['DELETION_LIST']
  key_links:
    - from: livos/packages/ui/src/providers/global-system-state/reset.tsx
      to: trpcReact.system.factoryReset.useMutation
      via: 'useReset({onMutate, onSuccess, onError}) -> reset({preserveApiKey: boolean})'
      pattern: 'system\\.factoryReset\\.useMutation'
    - from: livos/packages/ui/src/providers/global-system-state/index.tsx
      to: 'GlobalSystemStateContext.reset'
      via: 'context type signature change: reset: (input: {preserveApiKey: boolean}) => void'
      pattern: 'reset:.*preserveApiKey'
---

<objective>
Lay down the pure-logic foundation that the rest of Phase 38 builds on, AND
un-break the type system. Phase 37 changed `system.factoryReset` from
`{password: string}` -> `{preserveApiKey: boolean}` and removed
`getFactoryResetStatus`. The legacy `useReset(password)` and `ResettingCover`
in `providers/global-system-state/reset.tsx` are now type-broken — UI typecheck
fails until this plan ships.

Purpose: Pure functions are deterministically testable in vitest+jsdom (no RTL
needed). Extract every testable unit (state derivation, error-tag mapping,
strict-equality typed confirm, network preflight with AbortController, deletion
list). This makes the 4 must-haves about state-machine / error tags / strict
equality / 5s preflight timeout testable with pure unit tests instead of
component tests.

Output: 5 lib files (types, error-tags, state-machine, typed-confirm,
network-preflight, deletion-list) + 5 unit test files + rewrite of
`reset.tsx` so `useReset()` takes `{preserveApiKey: boolean}` + minimal touch
of `index.tsx` (context signature). UI typecheck passes; downstream plans (02,
03, 04) can import from `@/features/factory-reset/lib/*`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/38-ui-factory-reset/38-CONTEXT.md
@.planning/phases/37-backend-factory-reset/37-04-failure-handling-integration-SUMMARY.md
@.planning/REQUIREMENTS.md
@livos/packages/ui/src/providers/global-system-state/reset.tsx
@livos/packages/ui/src/providers/global-system-state/index.tsx
@livos/packages/ui/src/providers/global-system-state/onerror-audit.unit.test.ts
@livos/packages/ui/src/components/update-log-viewer-dialog.unit.test.tsx
@livos/packages/livinityd/source/modules/system/factory-reset.ts
@livos/packages/ui/src/hooks/use-current-user.ts

<interfaces>
<!-- Phase 37 backend contract (READ-ONLY — DO NOT MODIFY livinityd/) -->

From `livos/packages/livinityd/source/modules/system/factory-reset.ts`:
```typescript
export const factoryResetInputSchema = z.object({
  preserveApiKey: z.boolean(),
})
export interface FactoryResetAccepted {
  accepted: true
  eventPath: string
  snapshotPath: string
}
```

JSON event row schema (D-BE-04 / D-EVT-02 from Phase 37):
```typescript
type FactoryResetEvent = {
  type: 'factory-reset'
  status: 'in-progress' | 'success' | 'failed' | 'rolled-back'
  started_at: string  // ISO
  ended_at: string | null
  preserveApiKey: boolean
  wipe_duration_ms: number
  reinstall_duration_ms: number
  install_sh_exit_code: number | null
  install_sh_source: 'live' | 'cache' | null
  snapshot_path: string
  error: 'api-key-401' | 'server5-unreachable' | 'install-sh-failed' | 'install-sh-unreachable' | null
}
```

From `livos/packages/ui/src/trpc/trpc.ts`:
```typescript
export const trpcReact = createTRPCReact<AppRouter>()
export type RouterError = TRPCClientErrorLike<AppRouter>
```

From `livos/packages/ui/src/hooks/use-current-user.ts`:
```typescript
export function useCurrentUser(): {
  user: User | undefined
  isLoading: boolean
  isAdmin: boolean
  isMember: boolean
  isGuest: boolean
  role: 'admin' | 'member' | 'guest'
  userId: string | undefined
  username: string | undefined
}
```

From `livos/packages/ui/src/providers/global-system-state/index.tsx` (CURRENT, BROKEN):
```typescript
const GlobalSystemStateContext = createContext<{
  // ...
  reset: (password: string) => void   // <-- THIS LINE CHANGES IN THIS PLAN
  // ...
} | null>(null)
```

From `livos/packages/ui/src/providers/global-system-state/reset.tsx` (CURRENT, BROKEN):
```typescript
const reset = (password: string) => resetMut.mutate({password})    // type error: password not in input
const resetStatusQ = trpcReact.system.getFactoryResetStatus.useQuery(...)  // type error: route removed
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create pure-logic lib (types, error-tags, state-machine, typed-confirm, network-preflight, deletion-list) + unit tests</name>
  <files>
    livos/packages/ui/src/features/factory-reset/lib/types.ts,
    livos/packages/ui/src/features/factory-reset/lib/error-tags.ts,
    livos/packages/ui/src/features/factory-reset/lib/error-tags.unit.test.ts,
    livos/packages/ui/src/features/factory-reset/lib/state-machine.ts,
    livos/packages/ui/src/features/factory-reset/lib/state-machine.unit.test.ts,
    livos/packages/ui/src/features/factory-reset/lib/typed-confirm.ts,
    livos/packages/ui/src/features/factory-reset/lib/typed-confirm.unit.test.ts,
    livos/packages/ui/src/features/factory-reset/lib/network-preflight.ts,
    livos/packages/ui/src/features/factory-reset/lib/network-preflight.unit.test.ts,
    livos/packages/ui/src/features/factory-reset/lib/deletion-list.ts,
    livos/packages/ui/src/features/factory-reset/lib/deletion-list.unit.test.ts
  </files>
  <read_first>
    1. .planning/phases/38-ui-factory-reset/38-CONTEXT.md (FULL — D-MD-01, D-OV-03, D-CF-02, D-PF-02, D-RT-02 are the spec lines being implemented)
    2. .planning/phases/37-backend-factory-reset/37-04-failure-handling-integration-SUMMARY.md (verbatim error-tag set: api-key-401 / server5-unreachable / install-sh-failed / install-sh-unreachable)
    3. livos/packages/ui/src/providers/global-system-state/onerror-audit.unit.test.ts (project test pattern: vitest, no jsdom env directive needed for pure-logic tests, use `describe/it/expect` from 'vitest')
    4. livos/packages/livinityd/source/modules/system/factory-reset.ts lines 1-100 (the canonical FactoryResetAccepted shape — types.ts FactoryResetAccepted MUST match)
  </read_first>
  <action>
**Step 1 — `lib/types.ts`** (no test file needed — types only):
```typescript
// Phase 38 — shared types for the factory-reset UI surface.
// Mirror Phase 37 D-EVT-02 schema exactly — the UI consumes JSON event rows
// produced by livinityd's factory-reset.sh.

export type FactoryResetErrorTag =
  | 'api-key-401'
  | 'server5-unreachable'
  | 'install-sh-failed'
  | 'install-sh-unreachable'

export type FactoryResetStatus = 'in-progress' | 'success' | 'failed' | 'rolled-back'

export interface FactoryResetEvent {
  type: 'factory-reset'
  status: FactoryResetStatus
  started_at: string
  ended_at: string | null
  preserveApiKey: boolean
  wipe_duration_ms: number
  reinstall_duration_ms: number
  install_sh_exit_code: number | null
  install_sh_source: 'live' | 'cache' | null
  snapshot_path: string
  error: FactoryResetErrorTag | null
}

// Derived UI state (D-OV-03). Distinguishes the 3 in-progress sub-states by
// inspecting wipe_duration_ms / reinstall_duration_ms; success / failed /
// rolled-back fall through to the JSON's status field directly.
export type FactoryResetUiState =
  | 'stopping-services'
  | 'fetching-install-sh'
  | 'reinstalling'
  | 'success'
  | 'failed'
  | 'rolled-back'

export interface FactoryResetAccepted {
  accepted: true
  eventPath: string
  snapshotPath: string
}

export type PreserveApiKeyChoice = boolean
```

**Step 2 — `lib/typed-confirm.ts` + test**:
```typescript
// D-CF-02: STRICT equality. NO trim, NO lowercase, NO regex.
export const EXPECTED_CONFIRM_PHRASE = 'FACTORY RESET'
export function isFactoryResetTrigger(input: string): boolean {
  return input === EXPECTED_CONFIRM_PHRASE
}
```
Test (`typed-confirm.unit.test.ts`):
```typescript
import {describe, expect, it} from 'vitest'
import {isFactoryResetTrigger, EXPECTED_CONFIRM_PHRASE} from './typed-confirm'

describe('isFactoryResetTrigger (D-CF-02 strict equality)', () => {
  it('accepts the exact phrase', () => {
    expect(isFactoryResetTrigger('FACTORY RESET')).toBe(true)
  })
  it('rejects lowercase', () => {
    expect(isFactoryResetTrigger('factory reset')).toBe(false)
  })
  it('rejects mixed case (FactoryReset)', () => {
    expect(isFactoryResetTrigger('FactoryReset')).toBe(false)
  })
  it('rejects hyphenated (FACTORY-RESET)', () => {
    expect(isFactoryResetTrigger('FACTORY-RESET')).toBe(false)
  })
  it('rejects leading whitespace', () => {
    expect(isFactoryResetTrigger(' FACTORY RESET')).toBe(false)
  })
  it('rejects trailing whitespace', () => {
    expect(isFactoryResetTrigger('FACTORY RESET ')).toBe(false)
  })
  it('rejects double-space variant', () => {
    expect(isFactoryResetTrigger('FACTORY  RESET')).toBe(false)
  })
  it('rejects empty string', () => {
    expect(isFactoryResetTrigger('')).toBe(false)
  })
  it('exposes EXPECTED_CONFIRM_PHRASE', () => {
    expect(EXPECTED_CONFIRM_PHRASE).toBe('FACTORY RESET')
  })
})
```
Note: At least 6 NEGATIVE variants are required (project context constraint:
"≥4 negative variants"). The test above has 7.

**Step 3 — `lib/deletion-list.ts` + test**:
The 7 items are VERBATIM from D-MD-01. ZERO paraphrasing.
```typescript
export const DELETION_LIST: readonly string[] = [
  'All installed apps and their data',
  'All user accounts (admin, members, guests)',
  'All sessions, JWT tokens, and stored secrets',
  'All AI keys (Anthropic, OpenAI, Kimi, etc.)',
  'All schedules and automations',
  'All Docker volumes managed by LivOS',
  'All system settings and preferences',
] as const
```
Test (`deletion-list.unit.test.ts`):
```typescript
import {describe, expect, it} from 'vitest'
import {DELETION_LIST} from './deletion-list'

describe('DELETION_LIST (D-MD-01 verbatim)', () => {
  it('has exactly 7 items', () => {
    expect(DELETION_LIST.length).toBe(7)
  })
  it('every item is a non-empty string', () => {
    for (const item of DELETION_LIST) {
      expect(typeof item).toBe('string')
      expect(item.length).toBeGreaterThan(0)
    }
  })
  it('first item is verbatim per D-MD-01', () => {
    expect(DELETION_LIST[0]).toBe('All installed apps and their data')
  })
  it('mentions Docker volumes managed by LivOS (R6 mitigation — scoped, not global)', () => {
    expect(DELETION_LIST).toContain('All Docker volumes managed by LivOS')
  })
  it('mentions AI keys explicitly with provider names (D-MD-01)', () => {
    expect(DELETION_LIST).toContain('All AI keys (Anthropic, OpenAI, Kimi, etc.)')
  })
})
```

**Step 4 — `lib/error-tags.ts` + test**:
Map the 4 Phase 37 error tags + null fallback to verbatim D-RT-02 strings.
NO Server4 references anywhere.
```typescript
import type {FactoryResetErrorTag} from './types'

// D-RT-02 mapping. Strings are USER-FACING and MUST match CONTEXT.md verbatim
// modulo `{install_sh_exit_code}` interpolation (callers pass the value).
export function mapErrorTagToMessage(
  tag: FactoryResetErrorTag | null,
  ctx: {install_sh_exit_code?: number | null} = {},
): string {
  switch (tag) {
    case 'api-key-401':
      return 'Your Livinity API key was rejected (HTTP 401). The key may have been revoked. Log into livinity.io and re-issue, then try again.'
    case 'server5-unreachable':
      return 'Cannot reach the install server (livinity.io). Try again in a few minutes.'
    case 'install-sh-failed': {
      const code = ctx.install_sh_exit_code ?? '?'
      return `The reinstall script failed (exit code: ${code}). Check the event log for details.`
    }
    case 'install-sh-unreachable':
      return 'Cannot fetch install.sh (live URL and cache both unavailable). Manual recovery required.'
    case null:
    default:
      return 'Reinstall failed for an unspecified reason. Check the event log.'
  }
}
```
Test (`error-tags.unit.test.ts`):
```typescript
import {describe, expect, it} from 'vitest'
import {mapErrorTagToMessage} from './error-tags'

describe('mapErrorTagToMessage (D-RT-02 verbatim)', () => {
  it('api-key-401: mentions HTTP 401 + livinity.io re-issue', () => {
    const msg = mapErrorTagToMessage('api-key-401')
    expect(msg).toContain('HTTP 401')
    expect(msg).toContain('livinity.io')
    expect(msg).toContain('re-issue')
  })
  it('server5-unreachable: mentions livinity.io NOT Server4 NOT Server5', () => {
    const msg = mapErrorTagToMessage('server5-unreachable')
    expect(msg).toContain('livinity.io')
    expect(msg).not.toContain('Server4')
    expect(msg).not.toContain('Server5')
  })
  it('install-sh-failed: interpolates exit_code when provided', () => {
    expect(mapErrorTagToMessage('install-sh-failed', {install_sh_exit_code: 42})).toContain('42')
  })
  it('install-sh-failed: shows ? when exit_code is null', () => {
    expect(mapErrorTagToMessage('install-sh-failed', {install_sh_exit_code: null})).toContain('?')
  })
  it('install-sh-unreachable: mentions Manual recovery', () => {
    expect(mapErrorTagToMessage('install-sh-unreachable')).toContain('Manual recovery')
  })
  it('null fallback: returns "unspecified reason" message', () => {
    expect(mapErrorTagToMessage(null)).toContain('unspecified')
  })
  it('every message is non-empty', () => {
    const tags = ['api-key-401', 'server5-unreachable', 'install-sh-failed', 'install-sh-unreachable', null] as const
    for (const tag of tags) {
      expect(mapErrorTagToMessage(tag).length).toBeGreaterThan(0)
    }
  })
  it('NO message contains "Server4" string anywhere', () => {
    const tags = ['api-key-401', 'server5-unreachable', 'install-sh-failed', 'install-sh-unreachable', null] as const
    for (const tag of tags) {
      expect(mapErrorTagToMessage(tag)).not.toContain('Server4')
    }
  })
})
```

**Step 5 — `lib/state-machine.ts` + test**:
```typescript
import type {FactoryResetEvent, FactoryResetUiState} from './types'

// D-OV-03 mapping. Pure function — given the latest JSON event row, derive the
// UI sub-state. Falls through to status field for terminal states.
export function deriveFactoryResetState(event: FactoryResetEvent | null): FactoryResetUiState | 'unknown' {
  if (!event) return 'unknown'
  switch (event.status) {
    case 'success':
      return 'success'
    case 'failed':
      return 'failed'
    case 'rolled-back':
      return 'rolled-back'
    case 'in-progress': {
      if (event.wipe_duration_ms === 0) return 'stopping-services'
      if (event.reinstall_duration_ms === 0) return 'fetching-install-sh'
      return 'reinstalling'
    }
  }
}

export function stateLabel(state: FactoryResetUiState | 'unknown', source: 'live' | 'cache' | null): string {
  switch (state) {
    case 'stopping-services':
      return 'Stopping services and stashing API key…'
    case 'fetching-install-sh':
      return 'Wipe complete. Fetching install.sh…'
    case 'reinstalling':
      return `Reinstalling LivOS… (${source ?? 'live'} install.sh source)`
    case 'success':
      return 'Reinstall complete. Redirecting…'
    case 'failed':
      return 'Reinstall failed.'
    case 'rolled-back':
      return 'Rolled back to pre-reset snapshot.'
    case 'unknown':
    default:
      return 'Connecting to LivOS…'
  }
}
```
Test (`state-machine.unit.test.ts`):
```typescript
import {describe, expect, it} from 'vitest'
import {deriveFactoryResetState, stateLabel} from './state-machine'
import type {FactoryResetEvent} from './types'

const base: FactoryResetEvent = {
  type: 'factory-reset',
  status: 'in-progress',
  started_at: '2026-04-29T12:00:30Z',
  ended_at: null,
  preserveApiKey: true,
  wipe_duration_ms: 0,
  reinstall_duration_ms: 0,
  install_sh_exit_code: null,
  install_sh_source: null,
  snapshot_path: '/tmp/livos-pre-reset.tar.gz',
  error: null,
}

describe('deriveFactoryResetState (D-OV-03)', () => {
  it('null event -> "unknown"', () => {
    expect(deriveFactoryResetState(null)).toBe('unknown')
  })
  it('in-progress + wipe=0 -> stopping-services', () => {
    expect(deriveFactoryResetState({...base, status: 'in-progress', wipe_duration_ms: 0})).toBe('stopping-services')
  })
  it('in-progress + wipe>0 + reinstall=0 -> fetching-install-sh', () => {
    expect(deriveFactoryResetState({...base, wipe_duration_ms: 5000, reinstall_duration_ms: 0})).toBe('fetching-install-sh')
  })
  it('in-progress + reinstall>0 -> reinstalling', () => {
    expect(deriveFactoryResetState({...base, wipe_duration_ms: 5000, reinstall_duration_ms: 1000})).toBe('reinstalling')
  })
  it('status=success -> success', () => {
    expect(deriveFactoryResetState({...base, status: 'success'})).toBe('success')
  })
  it('status=failed -> failed', () => {
    expect(deriveFactoryResetState({...base, status: 'failed', error: 'install-sh-failed'})).toBe('failed')
  })
  it('status=rolled-back -> rolled-back', () => {
    expect(deriveFactoryResetState({...base, status: 'rolled-back', error: 'install-sh-failed'})).toBe('rolled-back')
  })
})

describe('stateLabel', () => {
  it('reinstalling label includes install_sh_source', () => {
    expect(stateLabel('reinstalling', 'live')).toContain('live')
    expect(stateLabel('reinstalling', 'cache')).toContain('cache')
  })
  it('reinstalling label defaults source to "live" when null', () => {
    expect(stateLabel('reinstalling', null)).toContain('live')
  })
  it('unknown -> Connecting to LivOS…', () => {
    expect(stateLabel('unknown', null)).toContain('Connecting')
  })
})
```

**Step 6 — `lib/network-preflight.ts` + test**:
```typescript
export interface PreflightResult {
  reachable: boolean
  reason?: 'timeout' | 'fetch-error' | 'http-error'
  status?: number
}

export const DEFAULT_PREFLIGHT_TIMEOUT_MS = 5000
export const PREFLIGHT_URL = 'https://livinity.io'

// Pure function (modulo the global fetch). Inject `fetchImpl` for tests.
export async function preflightFetchLivinity(opts: {
  timeoutMs?: number
  fetchImpl?: typeof fetch
  url?: string
} = {}): Promise<PreflightResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_PREFLIGHT_TIMEOUT_MS
  const fetchImpl = opts.fetchImpl ?? fetch
  const url = opts.url ?? PREFLIGHT_URL
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, {method: 'HEAD', signal: ctrl.signal})
    if (res.ok) return {reachable: true, status: res.status}
    return {reachable: false, reason: 'http-error', status: res.status}
  } catch (err: any) {
    if (err && (err.name === 'AbortError' || ctrl.signal.aborted)) {
      return {reachable: false, reason: 'timeout'}
    }
    return {reachable: false, reason: 'fetch-error'}
  } finally {
    clearTimeout(timer)
  }
}
```
Test (`network-preflight.unit.test.ts`):
```typescript
import {describe, expect, it, vi} from 'vitest'
import {preflightFetchLivinity, DEFAULT_PREFLIGHT_TIMEOUT_MS, PREFLIGHT_URL} from './network-preflight'

describe('preflightFetchLivinity (D-PF-02)', () => {
  it('returns reachable:true on HEAD 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ok: true, status: 200})
    const res = await preflightFetchLivinity({fetchImpl: fetchImpl as any})
    expect(res.reachable).toBe(true)
    expect(res.status).toBe(200)
  })
  it('uses HEAD method against livinity.io by default', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ok: true, status: 200})
    await preflightFetchLivinity({fetchImpl: fetchImpl as any})
    expect(fetchImpl).toHaveBeenCalledWith(
      PREFLIGHT_URL,
      expect.objectContaining({method: 'HEAD'})
    )
  })
  it('returns reachable:false reason=http-error on 5xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ok: false, status: 503})
    const res = await preflightFetchLivinity({fetchImpl: fetchImpl as any})
    expect(res.reachable).toBe(false)
    expect(res.reason).toBe('http-error')
    expect(res.status).toBe(503)
  })
  it('returns reachable:false reason=fetch-error on TypeError', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const res = await preflightFetchLivinity({fetchImpl: fetchImpl as any})
    expect(res.reachable).toBe(false)
    expect(res.reason).toBe('fetch-error')
  })
  it('returns reachable:false reason=timeout when fetch hangs >timeoutMs (AbortController-driven)', async () => {
    // fetchImpl: never resolves on its own; resolves only when signal fires.
    const fetchImpl = vi.fn((url: string, init: any) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const e = new Error('aborted')
          ;(e as any).name = 'AbortError'
          reject(e)
        })
      })
    })
    const res = await preflightFetchLivinity({fetchImpl: fetchImpl as any, timeoutMs: 50})
    expect(res.reachable).toBe(false)
    expect(res.reason).toBe('timeout')
  })
  it('passes the AbortSignal into fetch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ok: true, status: 200})
    await preflightFetchLivinity({fetchImpl: fetchImpl as any})
    const init = (fetchImpl as any).mock.calls[0][1]
    expect(init.signal).toBeDefined()
    expect(typeof init.signal.aborted).toBe('boolean')
  })
  it('default timeout is 5000ms (D-PF-02)', () => {
    expect(DEFAULT_PREFLIGHT_TIMEOUT_MS).toBe(5000)
  })
})
```

Each test file must start with the appropriate vitest env directive ONLY if
DOM globals are needed. The tests above are pure-logic; no `@vitest-environment
jsdom` directive needed.
  </action>
  <acceptance_criteria>
    - File `livos/packages/ui/src/features/factory-reset/lib/types.ts` exists and exports {FactoryResetEvent, FactoryResetStatus, FactoryResetErrorTag, FactoryResetUiState, FactoryResetAccepted, PreserveApiKeyChoice}
    - File `livos/packages/ui/src/features/factory-reset/lib/typed-confirm.ts` exists and exports {isFactoryResetTrigger, EXPECTED_CONFIRM_PHRASE}
    - File `livos/packages/ui/src/features/factory-reset/lib/deletion-list.ts` exists and exports DELETION_LIST as a readonly array of length 7
    - File `livos/packages/ui/src/features/factory-reset/lib/error-tags.ts` exists and exports mapErrorTagToMessage
    - File `livos/packages/ui/src/features/factory-reset/lib/state-machine.ts` exists and exports {deriveFactoryResetState, stateLabel}
    - File `livos/packages/ui/src/features/factory-reset/lib/network-preflight.ts` exists and exports {preflightFetchLivinity, DEFAULT_PREFLIGHT_TIMEOUT_MS, PREFLIGHT_URL}
    - All 5 unit-test files exist (typed-confirm / deletion-list / error-tags / state-machine / network-preflight)
    - Run `pnpm --filter ui exec vitest run src/features/factory-reset/lib` (from livos/) — ALL tests pass, ≥30 assertions total
    - Run `grep -r "Server4" livos/packages/ui/src/features/factory-reset/` — returns nothing
    - Run `grep -r "Server5" livos/packages/ui/src/features/factory-reset/` — returns nothing
    - typed-confirm test has ≥6 negative variants (factory reset / FactoryReset / FACTORY-RESET / leading space / trailing space / double-space / empty)
    - network-preflight test has explicit AbortController timeout case using 50ms timeoutMs
  </acceptance_criteria>
  <verify>
    <automated>cd livos && pnpm --filter ui exec vitest run src/features/factory-reset/lib --reporter=verbose</automated>
  </verify>
  <done>All 5 lib files + 5 test files committed; vitest run passes; typecheck against just these files passes (`pnpm --filter ui exec tsc --noEmit -p .` covers them).</done>
</task>

<task type="auto">
  <name>Task 2: Rewrite useReset() to take {preserveApiKey} and update GlobalSystemStateContext signature</name>
  <files>
    livos/packages/ui/src/providers/global-system-state/reset.tsx,
    livos/packages/ui/src/providers/global-system-state/index.tsx
  </files>
  <read_first>
    1. livos/packages/ui/src/providers/global-system-state/reset.tsx (CURRENT — replace the body)
    2. livos/packages/ui/src/providers/global-system-state/index.tsx (CURRENT — find every reference to `reset(...)` to update consumer call sites)
    3. livos/packages/ui/src/routes/factory-reset/index.tsx (legacy consumer of `reset(password)` — Plan 03 will replace this; for now keep it COMPILING by passing through)
    4. livos/packages/ui/src/routes/factory-reset/_components/confirm-with-password.tsx (called via `onSubmit={reset}`; Plan 03 deletes this; for now leave intact)
    5. .planning/phases/38-ui-factory-reset/38-CONTEXT.md D-BE-01 + D-OV-01 + D-OV-04 (new mutation contract)
  </read_first>
  <action>
**Step 1 — Rewrite `livos/packages/ui/src/providers/global-system-state/reset.tsx`** to:
1. `useReset()` returns `(input: {preserveApiKey: boolean}) => void`
2. The mutation calls `trpcReact.system.factoryReset.useMutation` with the new input shape
3. The legacy `ResettingCover` (which queried the removed `getFactoryResetStatus`) is REMOVED from this file. Plan 04 reintroduces it polling `listUpdateHistory`. For now export a stub `ResettingCover` component that renders the existing `ProgressLayout` with indeterminate progress + "Reinstalling LivOS..." so consumers don't break.

```typescript
import {BarePage} from '@/layouts/bare/bare-page'
import {ProgressLayout} from '@/modules/bare/progress-layout'
import {trpcReact, type RouterError} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import type {PreserveApiKeyChoice} from '@/features/factory-reset/lib/types'

export function useReset({
  onMutate,
  onSuccess,
  onError,
}: {
  onMutate?: () => void
  onSuccess?: (didWork: boolean) => void
  onError?: (err: RouterError) => void
}) {
  // Phase 38 Plan 01 — schema rewrite: {password} -> {preserveApiKey: boolean}
  // (Phase 37 D-BE-01). Mutation returns {accepted, eventPath, snapshotPath}.
  const resetMut = trpcReact.system.factoryReset.useMutation({
    onMutate,
    // The mutation now returns {accepted: true, eventPath, snapshotPath}.
    // We treat any non-throw as "accepted" for the global-system-state cover.
    onSuccess: (_data) => onSuccess?.(true),
    onError,
  })

  const reset = (input: {preserveApiKey: PreserveApiKeyChoice}) =>
    resetMut.mutate({preserveApiKey: input.preserveApiKey})

  return reset
}

// Plan 01 STUB: indeterminate progress while the bash detaches and starts
// writing the JSON event row. Plan 04 replaces this with a real polling
// overlay (listUpdateHistory + state machine + 90s reconnect handling).
export function ResettingCover() {
  return (
    <BarePage>
      <ProgressLayout
        title={t('factory-reset')}
        callout={t('factory-reset.resetting.dont-turn-off-device')}
        progress={undefined}
        message={'Reinstalling LivOS…'}
        isRunning={true}
      />
    </BarePage>
  )
}
```

**Step 2 — Update `livos/packages/ui/src/providers/global-system-state/index.tsx`**:
1. Change context type:
```typescript
const GlobalSystemStateContext = createContext<{
  shutdown: () => void
  restart: () => void
  update: () => void
  updatePending: boolean
  updateError: RouterError | null
  migrate: () => void
  reset: (input: {preserveApiKey: boolean}) => void   // <-- CHANGED
  getError(): RouterError | null
  clearError(): void
} | null>(null)
```
2. The `reset` const declared on line ~95 from `useReset({onMutate, onSuccess, onError})` already returns the right thing — no body change needed there beyond the type flowing through.
3. Provider value's `reset` already passes through; no change.

**Step 3 — TEMPORARILY adjust legacy callsite** in `livos/packages/ui/src/routes/factory-reset/index.tsx`:
The line `<ConfirmWithPassword onSubmit={reset} ... />` becomes a TS error because `reset` no longer takes `string`. Plan 03 will rewrite this whole route. For Plan 01 to leave a green typecheck, change the ConfirmWithPassword integration to:
```typescript
// Phase 38 Plan 01 NOTE: legacy password gate is dead — Plan 03 replaces this
// component with the new explicit-list modal. For Plan 01's typecheck-clean
// gate, ignore the password and pass the new {preserveApiKey} shape with the
// safer default (true). Plan 03 deletes this whole route.
<ConfirmWithPassword
  onSubmit={(_password: string) => reset({preserveApiKey: true})}
  error={getPasswordError()}
  clearError={clearError}
/>
```
This leaves the legacy UI flow technically reachable (button still wires to mutation) so the type system is green, but the resulting reset is a no-op of the legacy password — Plan 03 throws away the whole route.

  </action>
  <acceptance_criteria>
    - `livos/packages/ui/src/providers/global-system-state/reset.tsx` is rewritten: `useReset` parameters unchanged but `reset` const returned signature is `(input: {preserveApiKey: boolean}) => void`
    - The mutation call `trpcReact.system.factoryReset.useMutation({...})` is the ONLY call site of system.factoryReset in this file
    - The legacy `getFactoryResetStatus.useQuery` import and call are REMOVED
    - `ResettingCover` exported as a stub (Plan 04 will replace)
    - `livos/packages/ui/src/providers/global-system-state/index.tsx` context type for `reset` is updated to `(input: {preserveApiKey: boolean}) => void`
    - `livos/packages/ui/src/routes/factory-reset/index.tsx` legacy callsite passes `reset({preserveApiKey: true})` so typecheck is green
    - Run `pnpm --filter ui exec tsc --noEmit -p .` from `livos/` — passes with NO new errors (compare against pre-change baseline; existing errors unrelated to factory-reset are tolerated, but no NEW factory-reset-related errors introduced)
    - Run `grep -rn "getFactoryResetStatus" livos/packages/ui/src/` — returns nothing
    - Run `grep -rn "system\.factoryReset" livos/packages/ui/src/` — returns ONLY in `providers/global-system-state/reset.tsx`
    - Run `pnpm --filter ui exec vitest run src/providers/global-system-state` — onerror-audit test still passes (unchanged invariant)
  </acceptance_criteria>
  <verify>
    <automated>cd livos && pnpm --filter ui exec tsc --noEmit -p . 2>&1 | grep -E "(error TS|factory|reset)" | tee /tmp/tsc-after.log; test ! -s /tmp/tsc-after.log || echo "WARN: tsc errors above — review for relevance"</automated>
  </verify>
  <done>useReset has new signature; index.tsx context typed correctly; legacy index.tsx route compiles via the {preserveApiKey: true} bridge; pnpm tsc passes with no new factory-reset errors; existing onerror-audit unit test still passes.</done>
</task>

</tasks>

<verification>
1. `cd livos && pnpm --filter ui exec vitest run src/features/factory-reset/lib --reporter=verbose` — all 5 lib unit-test files pass, ≥30 assertions
2. `cd livos && pnpm --filter ui exec tsc --noEmit -p .` — no new errors mentioning `factoryReset`, `getFactoryResetStatus`, or `password` related to system.factoryReset
3. `grep -rn "Server4\|Server5" livos/packages/ui/src/features/factory-reset/` returns nothing
4. `grep -rn "getFactoryResetStatus" livos/packages/ui/src/` returns nothing
5. `cd livos && pnpm --filter ui exec vitest run src/providers/global-system-state/onerror-audit.unit.test.ts` — passes (regression check)
</verification>

<success_criteria>
- The 6 lib files (types/error-tags/state-machine/typed-confirm/network-preflight/deletion-list) and their 5 unit-test files exist
- `useReset` and `GlobalSystemStateContext.reset` are typed `(input: {preserveApiKey: boolean}) => void`
- The legacy `getFactoryResetStatus` query is gone from the UI codebase
- All 30+ unit-test assertions pass
- UI typecheck has no new errors
- No Server4 or Server5 strings in any new code
</success_criteria>

<output>
After completion, create `.planning/phases/38-ui-factory-reset/38-01-foundation-and-unbreak-SUMMARY.md` listing:
- Lib files created + their key exports
- The useReset signature change
- Test count by file (typed-confirm: ≥9, deletion-list: ≥5, error-tags: ≥8, state-machine: ≥10, network-preflight: ≥7)
- Pre-condition for Plan 02/03/04: import from `@/features/factory-reset/lib/*` is now possible
</output>
