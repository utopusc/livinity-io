---
phase: 38-ui-factory-reset
plan: 04
type: execute
wave: 4
depends_on: ['38-01', '38-02', '38-03']
files_modified:
  - livos/packages/ui/src/providers/global-system-state/reset.tsx
  - livos/packages/ui/src/features/factory-reset/lib/polling-state.ts
  - livos/packages/ui/src/features/factory-reset/lib/polling-state.unit.test.ts
  - livos/packages/ui/src/features/factory-reset/lib/post-reset-redirect.ts
  - livos/packages/ui/src/features/factory-reset/lib/post-reset-redirect.unit.test.ts
  - livos/packages/ui/src/features/factory-reset/lib/select-latest-event.ts
  - livos/packages/ui/src/features/factory-reset/lib/select-latest-event.unit.test.ts
  - livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx
  - livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.unit.test.tsx
  - livos/packages/ui/src/routes/factory-reset/_components/factory-reset-error-page.tsx
  - livos/packages/ui/src/routes/factory-reset/_components/factory-reset-error-page.unit.test.tsx
  - livos/packages/ui/src/routes/factory-reset/_components/factory-reset-recovery-page.tsx
  - livos/packages/ui/src/routes/help/factory-reset-recovery.tsx
  - livos/packages/ui/src/router.tsx
  - livos/packages/ui/public/locales/en.json
autonomous: true
requirements:
  - FR-UI-05
  - FR-UI-06
must_haves:
  truths:
    - 'After confirming the modal (Plan 03), a full-screen BarePage overlay takes over the viewport (mirrors Phase 30 update overlay structure)'
    - 'The overlay polls trpc.system.listUpdateHistory.useQuery({limit: 10}) at 2-second intervals (D-OV-04 refetchInterval: 2000)'
    - 'The overlay filters returned rows for type === "factory-reset" and selects the most recent by started_at descending; the selection logic lives in selectLatestFactoryResetEvent (pure, unit-tested)'
    - 'Status text mapping uses deriveFactoryResetState + stateLabel (Plan 01) — verified via existing Plan 01 tests + a snapshot test in this plan'
    - 'When the listUpdateHistory query throws (livinityd unreachable mid-wipe), the overlay retains last-known status and shows "Reconnecting to LivOS…" (D-OV-04)'
    - 'After 90 seconds of consecutive query failures, the overlay shows the manual-recovery hint "Connection lost. Wait or check `/diagnostic` (manual SSH)." but does NOT redirect (D-OV-04)'
    - 'The reconnect/90s-failure logic lives in computePollingDisplayState (pure, unit-tested with vi.useFakeTimers)'
    - 'On status:success + preserveApiKey:true -> redirect to /login (D-RT-01)'
    - 'On status:success + preserveApiKey:false -> redirect to /onboarding (D-RT-01)'
    - 'On status:failed -> render FactoryResetErrorPage with mapErrorTagToMessage(error, {install_sh_exit_code}) text + 3 buttons (View event log, Try again, Manual SSH recovery instructions) (D-RT-02)'
    - 'On status:rolled-back -> render FactoryResetRecoveryPage with the rollback success copy + Return-to-dashboard button (D-RT-03)'
    - 'Manual SSH recovery instructions live at the new /help/factory-reset-recovery static route (D-RT-02)'
    - 'The recovery instructions page mentions the literal `tar -xzf $(cat /tmp/livos-pre-reset.path) -C /` command + restarting livos services (D-RT-02 verbatim) and contains NO Server4/Server5 references'
    - 'The redirect logic is encoded in selectPostResetRoute({status, preserveApiKey, error}) -> "/login" | "/onboarding" | "stay" — testable as a pure function (D-RT-01)'
    - 'pnpm --filter ui exec tsc --noEmit -p . passes with no new errors after this plan'
  artifacts:
    - path: livos/packages/ui/src/features/factory-reset/lib/select-latest-event.ts
      provides: 'selectLatestFactoryResetEvent(rows: unknown[]): FactoryResetEvent | null — filters for type==="factory-reset" + sorts by started_at desc + picks first'
      exports: ['selectLatestFactoryResetEvent']
    - path: livos/packages/ui/src/features/factory-reset/lib/polling-state.ts
      provides: 'computePollingDisplayState({lastEvent, queryFailing, consecutiveFailureMs, recoveryThresholdMs}): {mode, label, hint?}'
      exports: ['computePollingDisplayState', 'CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS']
    - path: livos/packages/ui/src/features/factory-reset/lib/post-reset-redirect.ts
      provides: 'selectPostResetRoute(event): "/login" | "/onboarding" | "stay"'
      exports: ['selectPostResetRoute']
    - path: livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx
      provides: 'FactoryResetProgress component — the BarePage overlay + listUpdateHistory polling + state-machine + redirect/error fanout'
      exports: ['FactoryResetProgress']
    - path: livos/packages/ui/src/routes/factory-reset/_components/factory-reset-error-page.tsx
      provides: 'FactoryResetErrorPage — D-RT-02 error page with error-tag-driven message + 3 buttons'
      exports: ['FactoryResetErrorPage']
    - path: livos/packages/ui/src/routes/factory-reset/_components/factory-reset-recovery-page.tsx
      provides: 'FactoryResetRecoveryPage — D-RT-03 rolled-back success page'
      exports: ['FactoryResetRecoveryPage']
    - path: livos/packages/ui/src/routes/help/factory-reset-recovery.tsx
      provides: 'Static SSH recovery instructions page (route /help/factory-reset-recovery)'
      exports: ['default']
    - path: livos/packages/ui/src/providers/global-system-state/reset.tsx
      provides: 'ResettingCover swapped from the Plan 01 stub to FactoryResetProgress (the listUpdateHistory poller)'
  key_links:
    - from: livos/packages/ui/src/providers/global-system-state/reset.tsx
      to: livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx
      via: 'ResettingCover() returns <FactoryResetProgress />'
      pattern: 'FactoryResetProgress'
    - from: livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx
      to: trpcReact.system.listUpdateHistory.useQuery
      via: 'refetchInterval: 2000 (D-OV-04)'
      pattern: 'refetchInterval:\\s*2000'
    - from: livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx
      to: '@/features/factory-reset/lib/select-latest-event'
      via: 'selectLatestFactoryResetEvent(rows)'
      pattern: 'selectLatestFactoryResetEvent\\('
    - from: livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx
      to: '@/features/factory-reset/lib/post-reset-redirect'
      via: 'selectPostResetRoute(event) -> useNavigate redirect'
      pattern: 'selectPostResetRoute\\('
    - from: livos/packages/ui/src/router.tsx
      to: livos/packages/ui/src/routes/help/factory-reset-recovery.tsx
      via: 'createBrowserRouter children: { path: "help/factory-reset-recovery" }'
      pattern: 'help/factory-reset-recovery'
---

<objective>
Land the post-confirm experience: BarePage progress overlay polling
listUpdateHistory, post-reset routing (/login or /onboarding), error pages
with error-tag-specific messages, recovery success page for the rolled-back
case, and the static SSH recovery instructions page.

Purpose: FR-UI-05 (BarePage progress overlay) + FR-UI-06 (post-reset routing
and failure surface).

Output: 3 pure-logic lib files (select-latest-event, polling-state,
post-reset-redirect) with tests including vi.useFakeTimers for the 90s
threshold; 4 new components (Progress, ErrorPage, RecoveryPage, static help
page); router registration for the help route; ResettingCover in the
GlobalSystemStateProvider swapped from Plan 01's stub to the new polling
overlay.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/38-ui-factory-reset/38-CONTEXT.md
@.planning/phases/38-ui-factory-reset/38-01-foundation-and-unbreak-SUMMARY.md
@.planning/phases/38-ui-factory-reset/38-03-confirmation-modal-SUMMARY.md
@livos/packages/ui/src/features/factory-reset/lib/types.ts
@livos/packages/ui/src/features/factory-reset/lib/state-machine.ts
@livos/packages/ui/src/features/factory-reset/lib/error-tags.ts
@livos/packages/ui/src/providers/global-system-state/reset.tsx
@livos/packages/ui/src/providers/global-system-state/update.tsx
@livos/packages/ui/src/layouts/bare/bare-page.tsx
@livos/packages/ui/src/modules/bare/progress-layout.tsx
@livos/packages/ui/src/modules/bare/failed-layout.tsx
@livos/packages/ui/src/router.tsx
@livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx
@livos/packages/livinityd/source/modules/system/routes.ts

<interfaces>
From `@/features/factory-reset/lib/types.ts` (Plan 01):
```typescript
export interface FactoryResetEvent {
  type: 'factory-reset'
  status: 'in-progress' | 'success' | 'failed' | 'rolled-back'
  started_at: string
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

From `@/features/factory-reset/lib/state-machine.ts` (Plan 01):
```typescript
export function deriveFactoryResetState(e: FactoryResetEvent | null): FactoryResetUiState | 'unknown'
export function stateLabel(state: FactoryResetUiState | 'unknown', source: 'live' | 'cache' | null): string
```

From `@/features/factory-reset/lib/error-tags.ts` (Plan 01):
```typescript
export function mapErrorTagToMessage(tag, ctx?): string
```

From `livos/packages/livinityd/source/modules/system/routes.ts`:
```typescript
// listUpdateHistory: adminProcedure
//   .input(z.object({limit: z.number().int().min(1).max(200).default(50)}))
//   Returns: Array<{filename: string, ...parsed}>
//   Each parsed JSON has at minimum {timestamp: string, status: string, ...}
//
// IMPORTANT: this reader is GENERIC across update + factory-reset rows. The UI
// MUST filter by `type === 'factory-reset'`. Phase 38 does NOT modify livinityd.
```

From `livos/packages/ui/src/providers/global-system-state/index.tsx`:
```typescript
// systemStatusQ.data === 'resetting' -> renders <ResettingCover />
// (this plan replaces the Plan 01 stub ResettingCover with FactoryResetProgress)
```

From `livos/packages/ui/src/router.tsx` (current structure):
```typescript
// Routes are inside `createBrowserRouter([...])`. The bare layout block
// (lines ~138-159) contains '/login' and 'factory-reset/*' children. The
// help route should sit under the same BareLayout (or the GradientLayout
// block — match what feels natural; static info pages can use either).
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pure-logic lib (selectLatestFactoryResetEvent + computePollingDisplayState + selectPostResetRoute) + unit tests with fake timers</name>
  <files>
    livos/packages/ui/src/features/factory-reset/lib/select-latest-event.ts,
    livos/packages/ui/src/features/factory-reset/lib/select-latest-event.unit.test.ts,
    livos/packages/ui/src/features/factory-reset/lib/polling-state.ts,
    livos/packages/ui/src/features/factory-reset/lib/polling-state.unit.test.ts,
    livos/packages/ui/src/features/factory-reset/lib/post-reset-redirect.ts,
    livos/packages/ui/src/features/factory-reset/lib/post-reset-redirect.unit.test.ts
  </files>
  <read_first>
    1. .planning/phases/38-ui-factory-reset/38-CONTEXT.md (D-OV-04 — Reconnecting + 90s threshold; D-RT-01 — login vs onboarding routing; D-RT-02 — error fan-out)
    2. livos/packages/ui/src/features/factory-reset/lib/types.ts (Plan 01)
    3. livos/packages/ui/src/features/factory-reset/lib/state-machine.ts (Plan 01)
    4. livos/packages/livinityd/source/modules/system/routes.ts lines 119-146 (listUpdateHistory return shape)
  </read_first>
  <action>
**Step 1 — `select-latest-event.ts`:**
```typescript
import type {FactoryResetEvent} from './types'

// listUpdateHistory returns generic rows: {filename, timestamp, type?, status, ...}.
// We filter for type === 'factory-reset' and take the most recent by started_at
// (preferred) or timestamp (fallback for back-compat with rows lacking
// started_at — defensive only; Phase 37 always writes started_at).

export function selectLatestFactoryResetEvent(rows: unknown): FactoryResetEvent | null {
  if (!Array.isArray(rows)) return null
  const candidates: FactoryResetEvent[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    if (r.type !== 'factory-reset') continue
    if (typeof r.status !== 'string') continue
    candidates.push(r as unknown as FactoryResetEvent)
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const sa = (a as any).started_at ?? (a as any).timestamp ?? ''
    const sb = (b as any).started_at ?? (b as any).timestamp ?? ''
    return String(sb).localeCompare(String(sa))
  })
  return candidates[0]
}
```

Test:
```typescript
import {describe, expect, it} from 'vitest'
import {selectLatestFactoryResetEvent} from './select-latest-event'

describe('selectLatestFactoryResetEvent', () => {
  it('returns null for empty input', () => {
    expect(selectLatestFactoryResetEvent([])).toBeNull()
  })
  it('returns null for non-array input', () => {
    expect(selectLatestFactoryResetEvent(null)).toBeNull()
    expect(selectLatestFactoryResetEvent({})).toBeNull()
    expect(selectLatestFactoryResetEvent(undefined)).toBeNull()
  })
  it('filters out rows where type !== "factory-reset"', () => {
    const rows = [
      {type: 'success', status: 'success', started_at: '2026-04-29T12:00Z'},
      {type: 'factory-reset', status: 'in-progress', started_at: '2026-04-29T12:01Z'},
    ]
    expect(selectLatestFactoryResetEvent(rows)?.status).toBe('in-progress')
  })
  it('returns most recent by started_at desc', () => {
    const rows = [
      {type: 'factory-reset', status: 'success', started_at: '2026-04-29T12:00Z'},
      {type: 'factory-reset', status: 'in-progress', started_at: '2026-04-29T13:00Z'},
      {type: 'factory-reset', status: 'failed', started_at: '2026-04-29T11:00Z'},
    ]
    expect(selectLatestFactoryResetEvent(rows)?.status).toBe('in-progress')
  })
  it('falls back to timestamp when started_at is missing (defensive)', () => {
    const rows = [
      {type: 'factory-reset', status: 'success', timestamp: '2026-04-29T12:00Z'},
      {type: 'factory-reset', status: 'failed', timestamp: '2026-04-29T13:00Z'},
    ]
    expect(selectLatestFactoryResetEvent(rows)?.status).toBe('failed')
  })
  it('skips rows missing the required status field', () => {
    const rows = [
      {type: 'factory-reset', started_at: '2026-04-29T13:00Z'},
      {type: 'factory-reset', status: 'success', started_at: '2026-04-29T12:00Z'},
    ]
    expect(selectLatestFactoryResetEvent(rows)?.status).toBe('success')
  })
})
```

**Step 2 — `polling-state.ts`:**
```typescript
import type {FactoryResetEvent} from './types'
import {deriveFactoryResetState, stateLabel} from './state-machine'

// D-OV-04: 90 seconds of consecutive query failures triggers manual-recovery
// hint. The hint replaces the dynamic state label but the overlay does NOT
// redirect — the user might be momentarily disconnected during the brief
// livinityd-restart window.
export const CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS = 90_000

export type PollingDisplayMode = 'live' | 'reconnecting' | 'manual-recovery'

export interface PollingDisplayState {
  mode: PollingDisplayMode
  label: string
  hint?: string
}

export interface PollingInputs {
  lastEvent: FactoryResetEvent | null
  queryFailing: boolean
  consecutiveFailureMs: number   // 0 when not failing
  recoveryThresholdMs?: number   // override for tests
}

export function computePollingDisplayState(input: PollingInputs): PollingDisplayState {
  const threshold = input.recoveryThresholdMs ?? CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS
  if (input.queryFailing) {
    if (input.consecutiveFailureMs >= threshold) {
      return {
        mode: 'manual-recovery',
        label: 'Connection lost.',
        hint: 'Wait or check `/diagnostic` (manual SSH).',
      }
    }
    return {
      mode: 'reconnecting',
      label: 'Reconnecting to LivOS…',
    }
  }
  // Live mode: derive from the latest event
  const state = deriveFactoryResetState(input.lastEvent)
  const source = input.lastEvent?.install_sh_source ?? null
  return {mode: 'live', label: stateLabel(state, source)}
}
```

Test (uses fake timers for the threshold check):
```typescript
import {describe, expect, it, vi} from 'vitest'
import {
  computePollingDisplayState,
  CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS,
} from './polling-state'
import type {FactoryResetEvent} from './types'

const baseEvent: FactoryResetEvent = {
  type: 'factory-reset',
  status: 'in-progress',
  started_at: '2026-04-29T12:00:00Z',
  ended_at: null,
  preserveApiKey: true,
  wipe_duration_ms: 0,
  reinstall_duration_ms: 0,
  install_sh_exit_code: null,
  install_sh_source: null,
  snapshot_path: '/tmp/livos-pre-reset.tar.gz',
  error: null,
}

describe('computePollingDisplayState (D-OV-04)', () => {
  it('CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS === 90000 (D-OV-04)', () => {
    expect(CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS).toBe(90_000)
  })
  it('queryFailing=false -> "live" mode + state-machine-derived label', () => {
    const got = computePollingDisplayState({lastEvent: baseEvent, queryFailing: false, consecutiveFailureMs: 0})
    expect(got.mode).toBe('live')
    expect(got.label).toContain('Stopping services')
  })
  it('queryFailing=true + below threshold -> "reconnecting" mode + "Reconnecting…" label', () => {
    const got = computePollingDisplayState({lastEvent: baseEvent, queryFailing: true, consecutiveFailureMs: 30_000})
    expect(got.mode).toBe('reconnecting')
    expect(got.label).toContain('Reconnecting')
  })
  it('queryFailing=true + at threshold -> "manual-recovery" mode + hint set', () => {
    const got = computePollingDisplayState({lastEvent: baseEvent, queryFailing: true, consecutiveFailureMs: 90_000})
    expect(got.mode).toBe('manual-recovery')
    expect(got.hint).toContain('manual SSH')
  })
  it('queryFailing=true + above threshold -> "manual-recovery" mode', () => {
    const got = computePollingDisplayState({lastEvent: baseEvent, queryFailing: true, consecutiveFailureMs: 200_000})
    expect(got.mode).toBe('manual-recovery')
  })
  it('threshold can be overridden for tests', () => {
    const got = computePollingDisplayState({lastEvent: baseEvent, queryFailing: true, consecutiveFailureMs: 50, recoveryThresholdMs: 25})
    expect(got.mode).toBe('manual-recovery')
  })

  it('vi.useFakeTimers harness: simulates 90s of accumulated failures crossing the threshold', () => {
    vi.useFakeTimers()
    let consecutiveFailureMs = 0
    let lastMode = computePollingDisplayState({lastEvent: baseEvent, queryFailing: true, consecutiveFailureMs}).mode
    expect(lastMode).toBe('reconnecting')
    // Simulate 89.5 seconds of failures — still reconnecting
    for (let i = 0; i < 89; i++) {
      vi.advanceTimersByTime(1_000)
      consecutiveFailureMs += 1_000
    }
    lastMode = computePollingDisplayState({lastEvent: baseEvent, queryFailing: true, consecutiveFailureMs}).mode
    expect(lastMode).toBe('reconnecting')
    // Cross the threshold
    vi.advanceTimersByTime(1_000)
    consecutiveFailureMs += 1_000
    lastMode = computePollingDisplayState({lastEvent: baseEvent, queryFailing: true, consecutiveFailureMs}).mode
    expect(lastMode).toBe('manual-recovery')
    vi.useRealTimers()
  })

  it('NO label/hint contains Server4 or Server5', () => {
    const cases = [
      computePollingDisplayState({lastEvent: baseEvent, queryFailing: false, consecutiveFailureMs: 0}),
      computePollingDisplayState({lastEvent: baseEvent, queryFailing: true, consecutiveFailureMs: 0}),
      computePollingDisplayState({lastEvent: baseEvent, queryFailing: true, consecutiveFailureMs: 90_000}),
    ]
    for (const c of cases) {
      expect(c.label).not.toContain('Server4')
      expect(c.label).not.toContain('Server5')
      if (c.hint) {
        expect(c.hint).not.toContain('Server4')
        expect(c.hint).not.toContain('Server5')
      }
    }
  })
})
```

**Step 3 — `post-reset-redirect.ts`:**
```typescript
import type {FactoryResetEvent} from './types'

// D-RT-01: success + preserveApiKey=true -> /login
//          success + preserveApiKey=false -> /onboarding
//          else -> 'stay' (the overlay/error/recovery page handles it)
export type PostResetRoute = '/login' | '/onboarding' | 'stay'

export function selectPostResetRoute(event: FactoryResetEvent | null): PostResetRoute {
  if (!event) return 'stay'
  if (event.status !== 'success') return 'stay'
  return event.preserveApiKey ? '/login' : '/onboarding'
}
```

Test:
```typescript
import {describe, expect, it} from 'vitest'
import {selectPostResetRoute} from './post-reset-redirect'
import type {FactoryResetEvent} from './types'

const base: FactoryResetEvent = {
  type: 'factory-reset',
  status: 'success',
  started_at: '2026-04-29T12:00Z',
  ended_at: '2026-04-29T12:08Z',
  preserveApiKey: true,
  wipe_duration_ms: 12000,
  reinstall_duration_ms: 410000,
  install_sh_exit_code: 0,
  install_sh_source: 'live',
  snapshot_path: '/tmp/livos-pre-reset.tar.gz',
  error: null,
}

describe('selectPostResetRoute (D-RT-01)', () => {
  it('null event -> stay', () => {
    expect(selectPostResetRoute(null)).toBe('stay')
  })
  it('success + preserveApiKey:true -> /login', () => {
    expect(selectPostResetRoute({...base, preserveApiKey: true})).toBe('/login')
  })
  it('success + preserveApiKey:false -> /onboarding', () => {
    expect(selectPostResetRoute({...base, preserveApiKey: false})).toBe('/onboarding')
  })
  it('in-progress -> stay (no redirect mid-reset)', () => {
    expect(selectPostResetRoute({...base, status: 'in-progress'})).toBe('stay')
  })
  it('failed -> stay (error page handles it; do NOT auto-redirect per CONTEXT specifics)', () => {
    expect(selectPostResetRoute({...base, status: 'failed', error: 'install-sh-failed'})).toBe('stay')
  })
  it('rolled-back -> stay (recovery page handles it)', () => {
    expect(selectPostResetRoute({...base, status: 'rolled-back', error: 'install-sh-failed'})).toBe('stay')
  })
})
```
  </action>
  <acceptance_criteria>
    - 3 lib files created with their exports
    - 3 test files pass with: select-latest-event ≥6 assertions, polling-state ≥7 assertions including the vi.useFakeTimers harness, post-reset-redirect ≥6 assertions
    - The vi.useFakeTimers harness explicitly verifies the 90s threshold transition (reconnecting → manual-recovery)
    - `CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS === 90_000` is asserted
    - `grep -rn "Server4\|Server5" livos/packages/ui/src/features/factory-reset/lib/` returns nothing
  </acceptance_criteria>
  <verify>
    <automated>cd livos && pnpm --filter ui exec vitest run src/features/factory-reset/lib/select-latest-event src/features/factory-reset/lib/polling-state src/features/factory-reset/lib/post-reset-redirect --reporter=verbose</automated>
  </verify>
  <done>3 lib files + 3 test files committed; vitest passes including the vi.useFakeTimers harness.</done>
</task>

<task type="auto">
  <name>Task 2: Build FactoryResetProgress (BarePage overlay + listUpdateHistory polling + 90s reconnect + redirect/error fan-out) + swap ResettingCover</name>
  <files>
    livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx,
    livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.unit.test.tsx,
    livos/packages/ui/src/providers/global-system-state/reset.tsx
  </files>
  <read_first>
    1. .planning/phases/38-ui-factory-reset/38-CONTEXT.md (D-OV-01..04, D-RT-01..03)
    2. livos/packages/ui/src/providers/global-system-state/update.tsx (FULL — UpdatingCover is the structural precedent: BarePage + ProgressLayout + FailedLayout fan-out)
    3. livos/packages/ui/src/providers/global-system-state/reset.tsx (Plan 01 stub — replace ResettingCover body)
    4. livos/packages/ui/src/modules/bare/progress-layout.tsx (props: title, callout, progress?, message?, isRunning)
    5. The 3 lib helpers from Task 1
  </read_first>
  <action>
**Step 1 — Create `factory-reset-progress.tsx`:**

```typescript
// Phase 38 Plan 04 — BarePage overlay that takes over after the user confirms
// the modal. Polls listUpdateHistory every 2s, picks the latest factory-reset
// event, derives display state via the pure helpers, and fans out:
//
//   - status:in-progress  -> ProgressLayout with state-derived label
//   - status:success+preserveApiKey:true  -> location.href = '/login'
//   - status:success+preserveApiKey:false -> location.href = '/onboarding'
//   - status:failed       -> <FactoryResetErrorPage event={...} />
//   - status:rolled-back  -> <FactoryResetRecoveryPage event={...} />
//
// Connection-failure handling (D-OV-04):
//   - lastEventQ.error -> retain lastEvent, show "Reconnecting to LivOS…"
//   - 90s of consecutive failures -> show manual-recovery hint (no redirect)
//
// All decision logic lives in pure lib helpers (Task 1) — this component is
// thin wiring + render-fan-out.

import {useEffect, useRef, useState} from 'react'

import {selectLatestFactoryResetEvent} from '@/features/factory-reset/lib/select-latest-event'
import {selectPostResetRoute} from '@/features/factory-reset/lib/post-reset-redirect'
import {computePollingDisplayState} from '@/features/factory-reset/lib/polling-state'
import type {FactoryResetEvent} from '@/features/factory-reset/lib/types'
import {BarePage} from '@/layouts/bare/bare-page'
import {ProgressLayout} from '@/modules/bare/progress-layout'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import {FactoryResetErrorPage} from './factory-reset-error-page'
import {FactoryResetRecoveryPage} from './factory-reset-recovery-page'

const POLL_INTERVAL_MS = 2_000

export function FactoryResetProgress() {
  const historyQ = trpcReact.system.listUpdateHistory.useQuery(
    {limit: 10},
    {
      // D-OV-04 polling cadence
      refetchInterval: POLL_INTERVAL_MS,
      refetchOnWindowFocus: false,
      retry: false,
      // CRITICAL: disable react-query's cache eviction-on-error. We deliberately
      // retain the previous data so the UI can show the last-known status while
      // the brief livinityd-restart window passes (D-OV-04 / specifics #2).
      // staleTime + cacheTime keep prev data visible while errored.
      staleTime: POLL_INTERVAL_MS,
    },
  )

  const [lastKnownEvent, setLastKnownEvent] = useState<FactoryResetEvent | null>(null)
  const failureStartRef = useRef<number | null>(null)
  const [consecutiveFailureMs, setConsecutiveFailureMs] = useState(0)

  // Track query state -> derive lastKnownEvent + failure window
  useEffect(() => {
    if (historyQ.isError) {
      // Failure: start the failure clock; re-render every second so the
      // 90s threshold can fire even if listUpdateHistory never recovers.
      if (failureStartRef.current === null) {
        failureStartRef.current = Date.now()
      }
      const tick = setInterval(() => {
        if (failureStartRef.current !== null) {
          setConsecutiveFailureMs(Date.now() - failureStartRef.current)
        }
      }, 1_000)
      return () => clearInterval(tick)
    }
    // Success: reset the failure clock + capture the latest event
    failureStartRef.current = null
    setConsecutiveFailureMs(0)
    if (historyQ.data) {
      const latest = selectLatestFactoryResetEvent(historyQ.data)
      if (latest) setLastKnownEvent(latest)
    }
  }, [historyQ.isError, historyQ.data])

  // Post-reset redirect (D-RT-01)
  useEffect(() => {
    const route = selectPostResetRoute(lastKnownEvent)
    if (route === 'stay') return
    // Hard navigation — the bash has reinstalled livinityd; we want a fresh
    // page load to clear all in-memory state (auth tokens, cached queries).
    window.location.href = route
  }, [lastKnownEvent])

  // Render fan-out
  if (lastKnownEvent?.status === 'failed') {
    return <FactoryResetErrorPage event={lastKnownEvent} />
  }
  if (lastKnownEvent?.status === 'rolled-back') {
    return <FactoryResetRecoveryPage event={lastKnownEvent} />
  }

  // In-progress / unknown — render the BarePage progress overlay
  const display = computePollingDisplayState({
    lastEvent: lastKnownEvent,
    queryFailing: historyQ.isError,
    consecutiveFailureMs,
  })

  return (
    <BarePage>
      <ProgressLayout
        title={t('factory-reset.modal.heading')}
        callout={t('factory-reset.progress.callout')}
        progress={undefined} // indeterminate — bash doesn't emit % progress
        message={display.label + (display.hint ? ` — ${display.hint}` : '')}
        isRunning={display.mode === 'live' || display.mode === 'reconnecting'}
      />
    </BarePage>
  )
}
```

**Step 2 — Add i18n key** to `livos/packages/ui/public/locales/en.json`:
```json
"factory-reset.progress.callout": "Estimated 5–10 minutes. Do not close this tab."
```

**Step 3 — Update `livos/packages/ui/src/providers/global-system-state/reset.tsx`** so `ResettingCover` returns `<FactoryResetProgress />`:
```typescript
import type {RouterError} from '@/trpc/trpc'
import {trpcReact} from '@/trpc/trpc'

import {FactoryResetProgress} from '@/routes/factory-reset/_components/factory-reset-progress'
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
  const resetMut = trpcReact.system.factoryReset.useMutation({
    onMutate,
    onSuccess: (_data) => onSuccess?.(true),
    onError,
  })
  const reset = (input: {preserveApiKey: PreserveApiKeyChoice}) =>
    resetMut.mutate({preserveApiKey: input.preserveApiKey})
  return reset
}

export function ResettingCover() {
  // Plan 04: replaces the Plan 01 stub with the listUpdateHistory poller +
  // post-reset routing + error/recovery fan-out.
  return <FactoryResetProgress />
}
```

**Step 4 — Smoke test for FactoryResetProgress** (RTL-free):
```typescript
// @vitest-environment jsdom
import {readFileSync} from 'node:fs'
import path from 'node:path'

import {describe, expect, it} from 'vitest'

const SRC = path.join(__dirname, 'factory-reset-progress.tsx')

describe('FactoryResetProgress smoke', () => {
  it('module exports FactoryResetProgress', async () => {
    const mod = await import('./factory-reset-progress')
    expect(typeof mod.FactoryResetProgress).toBe('function')
  })
})

describe('FactoryResetProgress source-text invariants (D-OV-04 / D-RT-01)', () => {
  const src = readFileSync(SRC, 'utf8')

  it('imports listUpdateHistory tRPC query', () => {
    expect(src).toMatch(/system\.listUpdateHistory/)
  })
  it('refetchInterval is 2_000 (D-OV-04 / D-BE-03)', () => {
    expect(src).toMatch(/refetchInterval:\s*POLL_INTERVAL_MS/)
    expect(src).toMatch(/POLL_INTERVAL_MS\s*=\s*2_?000/)
  })
  it('uses selectLatestFactoryResetEvent to filter rows', () => {
    expect(src).toMatch(/selectLatestFactoryResetEvent\(/)
  })
  it('uses computePollingDisplayState for the reconnect + 90s logic', () => {
    expect(src).toMatch(/computePollingDisplayState\(/)
  })
  it('uses selectPostResetRoute for the redirect decision', () => {
    expect(src).toMatch(/selectPostResetRoute\(/)
  })
  it('does NOT auto-redirect on status=failed (D-RT-02 — user must read)', () => {
    // The failed branch must render FactoryResetErrorPage, NOT navigate
    expect(src).toMatch(/lastKnownEvent\?\.status === 'failed'[^}]*<FactoryResetErrorPage/)
  })
  it('does NOT auto-redirect on status=rolled-back (D-RT-03 — user must read)', () => {
    expect(src).toMatch(/lastKnownEvent\?\.status === 'rolled-back'[^}]*<FactoryResetRecoveryPage/)
  })
  it('redirect uses window.location.href (hard navigation to clear state)', () => {
    expect(src).toMatch(/window\.location\.href\s*=\s*route/)
  })
  it('NO references to Server4 or Server5', () => {
    expect(src).not.toContain('Server4')
    expect(src).not.toContain('Server5')
  })
})
```
  </action>
  <acceptance_criteria>
    - `factory-reset-progress.tsx` exists with the full component
    - The component imports the 3 lib helpers from Task 1
    - `refetchInterval: 2_000` literal present in the file
    - The component does NOT call `useNavigate()` for the failed/rolled-back branches — it renders `<FactoryResetErrorPage>` / `<FactoryResetRecoveryPage>` instead (D-RT-02 specifics #3: error page must not auto-redirect)
    - `livos/packages/ui/src/providers/global-system-state/reset.tsx` `ResettingCover` returns `<FactoryResetProgress />`
    - The new i18n key `factory-reset.progress.callout` is in `en.json`
    - Smoke + source-text test passes (≥9 assertions)
    - `cd livos && pnpm --filter ui exec tsc --noEmit -p .` passes
    - `grep -n "Server4\|Server5" livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx` returns nothing
  </acceptance_criteria>
  <verify>
    <automated>cd livos && pnpm --filter ui exec vitest run src/routes/factory-reset/_components/factory-reset-progress.unit.test.tsx --reporter=verbose</automated>
  </verify>
  <done>BarePage progress overlay wired; ResettingCover swapped from Plan 01 stub to the new poller; tests + typecheck pass.</done>
</task>

<task type="auto">
  <name>Task 3: Build FactoryResetErrorPage + FactoryResetRecoveryPage + the static /help/factory-reset-recovery page + register route</name>
  <files>
    livos/packages/ui/src/routes/factory-reset/_components/factory-reset-error-page.tsx,
    livos/packages/ui/src/routes/factory-reset/_components/factory-reset-error-page.unit.test.tsx,
    livos/packages/ui/src/routes/factory-reset/_components/factory-reset-recovery-page.tsx,
    livos/packages/ui/src/routes/help/factory-reset-recovery.tsx,
    livos/packages/ui/src/router.tsx,
    livos/packages/ui/public/locales/en.json
  </files>
  <read_first>
    1. .planning/phases/38-ui-factory-reset/38-CONTEXT.md (D-RT-02 verbatim copy + 3 buttons; D-RT-03 verbatim copy)
    2. livos/packages/ui/src/modules/bare/failed-layout.tsx (mirror this pattern for the error page styling)
    3. livos/packages/ui/src/modules/bare/shared.tsx (BareLogoTitle, BareSpacer, bareTextClass)
    4. livos/packages/ui/src/layouts/bare/shared.tsx (buttonClass, secondaryButtonClasss)
    5. livos/packages/ui/src/router.tsx FULL (find the right place to register the help route)
    6. livos/packages/ui/src/features/factory-reset/lib/error-tags.ts (mapErrorTagToMessage — Plan 01)
  </read_first>
  <action>
**Step 1 — Add i18n keys** to `livos/packages/ui/public/locales/en.json`:
```json
"factory-reset.error.heading": "Factory Reset Failed",
"factory-reset.error.view-event-log": "View event log",
"factory-reset.error.try-again": "Try again",
"factory-reset.error.manual-ssh": "Manual SSH recovery instructions",
"factory-reset.recovery.heading": "Factory Reset Rolled Back",
"factory-reset.recovery.body-pre-error": "The reinstall failed but the pre-wipe snapshot was successfully restored. Your LivOS is back to the state it was in before you started the factory reset. The original error:",
"factory-reset.recovery.return-to-dashboard": "Return to dashboard",
"factory-reset.help.recovery.heading": "Manual Factory-Reset Recovery (SSH)",
"factory-reset.help.recovery.intro": "If the factory reset failed and your LivOS is unreachable, you can roll back to the pre-wipe snapshot via SSH. Connect to your Mini PC and run:",
"factory-reset.help.recovery.warning": "These steps require root SSH access. They are only useful when you can SSH but cannot reach the LivOS web UI.",
"factory-reset.help.recovery.return": "Return"
```

**Step 2 — Create `factory-reset-error-page.tsx`:**
```typescript
import {useNavigate} from 'react-router-dom'

import {mapErrorTagToMessage} from '@/features/factory-reset/lib/error-tags'
import type {FactoryResetEvent} from '@/features/factory-reset/lib/types'
import {BarePage} from '@/layouts/bare/bare-page'
import {buttonClass, secondaryButtonClasss} from '@/layouts/bare/shared'
import {bareContainerClass, BareLogoTitle, BareSpacer, bareTextClass} from '@/modules/bare/shared'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

export function FactoryResetErrorPage({event}: {event: FactoryResetEvent}) {
  const navigate = useNavigate()
  const message = mapErrorTagToMessage(event.error, {install_sh_exit_code: event.install_sh_exit_code})

  // The eventPath is encoded in snapshot_path's neighborhood; Phase 33's
  // diagnostic surface keys off basename. We extract it from snapshot_path's
  // sibling logic by looking at started_at -> ${ts}-factory-reset.json.
  // Defensive: if anything is unparseable, fall through with no-op.
  const eventBasename = ((): string | null => {
    try {
      const ts = event.started_at.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
      return `${ts}-factory-reset.json`
    } catch {
      return null
    }
  })()

  return (
    <BarePage>
      <div className={cn(bareContainerClass, 'animate-in slide-in-from-bottom-2')}>
        <BareLogoTitle>{t('factory-reset.error.heading')}</BareLogoTitle>
        <BareSpacer />
        <p className={bareTextClass}>{message}</p>
        <BareSpacer />
        <div className='flex flex-col items-center gap-2 sm:flex-row'>
          {/* D-RT-02 buttons */}
          {eventBasename && (
            <a
              data-testid='factory-reset-view-event-log'
              href={`/admin/diagnostic/${eventBasename}`}
              className={secondaryButtonClasss}
            >
              {t('factory-reset.error.view-event-log')}
            </a>
          )}
          <button
            data-testid='factory-reset-try-again'
            type='button'
            className={buttonClass}
            onClick={() => navigate('/factory-reset')}
          >
            {t('factory-reset.error.try-again')}
          </button>
          <a
            data-testid='factory-reset-manual-ssh'
            href='/help/factory-reset-recovery'
            className={secondaryButtonClasss}
          >
            {t('factory-reset.error.manual-ssh')}
          </a>
        </div>
      </div>
    </BarePage>
  )
}
```

**Step 3 — Create `factory-reset-recovery-page.tsx`:**
```typescript
import {Link} from 'react-router-dom'

import type {FactoryResetEvent} from '@/features/factory-reset/lib/types'
import {BarePage} from '@/layouts/bare/bare-page'
import {buttonClass} from '@/layouts/bare/shared'
import {bareContainerClass, BareLogoTitle, BareSpacer, bareTextClass} from '@/modules/bare/shared'
import {t} from '@/utils/i18n'

export function FactoryResetRecoveryPage({event}: {event: FactoryResetEvent}) {
  const errorTag = event.error ?? 'unknown'

  return (
    <BarePage>
      <div className={bareContainerClass}>
        <BareLogoTitle>{t('factory-reset.recovery.heading')}</BareLogoTitle>
        <BareSpacer />
        <p className={bareTextClass}>
          {t('factory-reset.recovery.body-pre-error')} <code>{errorTag}</code>.
        </p>
        <BareSpacer />
        <Link to='/' reloadDocument className={buttonClass}>
          {t('factory-reset.recovery.return-to-dashboard')}
        </Link>
      </div>
    </BarePage>
  )
}
```

**Step 4 — Create `livos/packages/ui/src/routes/help/factory-reset-recovery.tsx`** (static instructions per D-RT-02 verbatim):
```typescript
import {Link} from 'react-router-dom'

import {BarePage} from '@/layouts/bare/bare-page'
import {buttonClass} from '@/layouts/bare/shared'
import {bareContainerClass, BareLogoTitle, BareSpacer, bareTextClass} from '@/modules/bare/shared'
import {t} from '@/utils/i18n'

// Phase 38 Plan 04 — D-RT-02 manual SSH recovery static instructions.
// Linked from FactoryResetErrorPage. NO Server4/Server5 references — the
// snapshot lives on the user's own Mini PC.
export default function FactoryResetRecoveryHelp() {
  // Verbatim per D-RT-02:
  //   tar -xzf $(cat /tmp/livos-pre-reset.path) -C / && systemctl restart livos liv-core liv-worker liv-memory
  const RECOVERY_COMMAND =
    'tar -xzf $(cat /tmp/livos-pre-reset.path) -C / && systemctl restart livos liv-core liv-worker liv-memory'

  return (
    <BarePage>
      <div className={bareContainerClass}>
        <BareLogoTitle>{t('factory-reset.help.recovery.heading')}</BareLogoTitle>
        <BareSpacer />
        <p className={bareTextClass}>{t('factory-reset.help.recovery.intro')}</p>
        <BareSpacer />
        <pre
          data-testid='factory-reset-recovery-command'
          className='max-w-full overflow-x-auto rounded-radius-md bg-surface-1 p-4 text-left font-mono text-body-sm'
        >
{RECOVERY_COMMAND}
        </pre>
        <BareSpacer />
        <p className={bareTextClass}>{t('factory-reset.help.recovery.warning')}</p>
        <BareSpacer />
        <Link to='/' className={buttonClass}>
          {t('factory-reset.help.recovery.return')}
        </Link>
      </div>
    </BarePage>
  )
}
```

**Step 5 — Register the help route in `router.tsx`:**

Inside the bare-layout block (the same block holding `/login` and
`/factory-reset/*`, around line 138-159 of the current router.tsx), add a NEW
child route lazily. Apply this minimal diff:

1. Near the other `React.lazy` imports at the top of the file, add:
```typescript
const FactoryResetRecoveryHelp = React.lazy(() => import('./routes/help/factory-reset-recovery'))
```

2. Inside the bare-layout's `children` array, AFTER the `factory-reset/*` entry, add:
```typescript
{
  path: 'help/factory-reset-recovery',
  element: <FactoryResetRecoveryHelp />,
},
```

**Step 6 — Test for FactoryResetErrorPage** (smoke + source-text):
```typescript
// @vitest-environment jsdom
import {readFileSync} from 'node:fs'
import path from 'node:path'

import {describe, expect, it} from 'vitest'

const ERR_SRC = path.join(__dirname, 'factory-reset-error-page.tsx')
const REC_SRC = path.join(__dirname, 'factory-reset-recovery-page.tsx')
const HELP_SRC = path.join(__dirname, '..', '..', 'help', 'factory-reset-recovery.tsx')

describe('FactoryResetErrorPage smoke', () => {
  it('exports FactoryResetErrorPage', async () => {
    const mod = await import('./factory-reset-error-page')
    expect(typeof mod.FactoryResetErrorPage).toBe('function')
  })
})

describe('FactoryResetErrorPage source-text invariants (D-RT-02)', () => {
  const src = readFileSync(ERR_SRC, 'utf8')
  it('uses mapErrorTagToMessage from the lib', () => {
    expect(src).toMatch(/mapErrorTagToMessage\(/)
  })
  it('renders all 3 D-RT-02 buttons (View event log / Try again / Manual SSH recovery)', () => {
    expect(src).toMatch(/factory-reset\.error\.view-event-log/)
    expect(src).toMatch(/factory-reset\.error\.try-again/)
    expect(src).toMatch(/factory-reset\.error\.manual-ssh/)
  })
  it('Manual SSH button links to /help/factory-reset-recovery', () => {
    expect(src).toMatch(/href=['"]\/help\/factory-reset-recovery['"]/)
  })
  it('Try again button navigates to /factory-reset (re-opens the modal)', () => {
    expect(src).toMatch(/navigate\(['"]\/factory-reset['"]\)/)
  })
  it('NO Server4 / Server5 references', () => {
    expect(src).not.toContain('Server4')
    expect(src).not.toContain('Server5')
  })
})

describe('FactoryResetRecoveryPage source-text invariants (D-RT-03)', () => {
  const src = readFileSync(REC_SRC, 'utf8')
  it('exports FactoryResetRecoveryPage', async () => {
    const mod = await import('./factory-reset-recovery-page')
    expect(typeof mod.FactoryResetRecoveryPage).toBe('function')
  })
  it('shows the rollback heading', () => {
    expect(src).toMatch(/factory-reset\.recovery\.heading/)
  })
  it('Return-to-dashboard link uses reloadDocument', () => {
    expect(src).toMatch(/reloadDocument/)
  })
})

describe('FactoryResetRecoveryHelp (static SSH page) source-text invariants (D-RT-02 verbatim)', () => {
  const src = readFileSync(HELP_SRC, 'utf8')
  it('contains the literal recovery tar command (D-RT-02 verbatim)', () => {
    expect(src).toContain('tar -xzf $(cat /tmp/livos-pre-reset.path) -C /')
    expect(src).toContain('systemctl restart livos liv-core liv-worker liv-memory')
  })
  it('NO Server4 / Server5 references in the help page', () => {
    expect(src).not.toContain('Server4')
    expect(src).not.toContain('Server5')
  })
})
```
  </action>
  <acceptance_criteria>
    - 3 component files created: factory-reset-error-page.tsx, factory-reset-recovery-page.tsx, help/factory-reset-recovery.tsx
    - 1 unit test file with ≥10 assertions covering error-page wiring + recovery-page wiring + help-page verbatim command + Server4/5 negatives
    - The help page contains the LITERAL string `tar -xzf $(cat /tmp/livos-pre-reset.path) -C /` (D-RT-02 verbatim)
    - The help page contains the LITERAL string `systemctl restart livos liv-core liv-worker liv-memory` (D-RT-02 verbatim)
    - The /help/factory-reset-recovery route is registered in router.tsx (under BareLayout)
    - 11 new i18n keys added to `en.json` (4 error + 3 recovery + 4 help)
    - `cd livos && pnpm --filter ui exec tsc --noEmit -p .` passes
    - `grep -rn "Server4\|Server5" livos/packages/ui/src/routes/factory-reset livos/packages/ui/src/routes/help/factory-reset-recovery.tsx` returns nothing
    - Run `cd livos && pnpm --filter ui exec vitest run src/routes/factory-reset/_components/factory-reset-error-page.unit.test.tsx`
  </acceptance_criteria>
  <verify>
    <automated>cd livos && pnpm --filter ui exec vitest run src/routes/factory-reset/_components/factory-reset-error-page.unit.test.tsx --reporter=verbose</automated>
  </verify>
  <done>Error page + recovery page + static help page created; router registers /help/factory-reset-recovery; tests + typecheck pass; verbatim recovery command present; no Server4/5 leakage.</done>
</task>

</tasks>

<verification>
1. `cd livos && pnpm --filter ui exec vitest run src/features/factory-reset/lib src/routes/factory-reset src/routes/help` — all factory-reset Phase-38 tests pass
2. `cd livos && pnpm --filter ui exec tsc --noEmit -p .` — passes with no new errors
3. `grep -rn "Server4\|Server5" livos/packages/ui/src/features/factory-reset livos/packages/ui/src/routes/factory-reset livos/packages/ui/src/routes/help/factory-reset-recovery.tsx livos/packages/ui/src/routes/settings/_components/danger-zone.tsx` returns nothing
4. `grep -n "refetchInterval:\\s*POLL_INTERVAL_MS" livos/packages/ui/src/routes/factory-reset/_components/factory-reset-progress.tsx` returns 1 match
5. `grep -n "tar -xzf .cat /tmp/livos-pre-reset.path. -C /" livos/packages/ui/src/routes/help/factory-reset-recovery.tsx` returns the verbatim line
6. `grep -n "help/factory-reset-recovery" livos/packages/ui/src/router.tsx` returns ≥1 match
7. `grep -rn "getFactoryResetStatus\|confirm-with-password\|review-data" livos/packages/ui/src/` returns NOTHING (legacy fully removed across all 4 plans)

End-to-end smoke walk-through (manual, optional, post-Phase):
- /settings -> Advanced -> Danger Zone -> Factory Reset button -> /factory-reset -> modal opens
- Type "FACTORY RESET" -> destructive button enables -> click confirms
- BarePage progress overlay takes over the screen (initial label "Stopping services and stashing API key…")
- (against a mock backend that returns status:success+preserveApiKey:true) -> redirects to /login
- (against a mock backend that returns status:failed+error:'install-sh-failed') -> error page with "View event log" / "Try again" / "Manual SSH recovery instructions" buttons
- Clicking "Manual SSH recovery instructions" -> /help/factory-reset-recovery static page with verbatim tar+systemctl command
</verification>

<success_criteria>
- Phase-level verification: all 15 must_haves from the planning context floor decomposed across plans 01..04 are reachable from the artifacts shipped in this plan
- ResettingCover renders the listUpdateHistory poller (no Plan 01 stub left)
- Polling cadence is 2_000ms exactly
- 90s consecutive-failure threshold proven via `vi.useFakeTimers` test
- Pre-flight 5s AbortController timeout proven via `vi.useFakeTimers`-style timeout test (Plan 01)
- Strict-equality typed-confirm tested with ≥6 negative variants (Plan 01)
- Post-reset routing tested for both /login and /onboarding branches (this plan)
- Static help page contains the verbatim `tar -xzf $(cat /tmp/livos-pre-reset.path) -C /` recovery command
- ZERO Server4/Server5 references introduced anywhere in Phase 38
- ZERO modifications to `livos/packages/livinityd/` across all 4 plans
- ZERO integration tests against real backend / Mini PC
</success_criteria>

<output>
After completion, create `.planning/phases/38-ui-factory-reset/38-04-progress-overlay-and-post-reset-routing-SUMMARY.md` listing:
- All artifacts shipped
- Test totals: select-latest-event ≥6, polling-state ≥7 (incl. fake-timers), post-reset-redirect ≥6, factory-reset-progress ≥9, error-page ≥10
- 11 new i18n keys
- Confirmation that the legacy `routes/factory-reset/_components/{review-data,confirm-with-password,success}.tsx` are deleted (Plan 03 step 5)
- Phase-38 close-out checklist:
  - [ ] All 15 must_haves from CONTEXT.md verifiable
  - [ ] All 7 FR-UI-XX requirement IDs mapped across plans 01-04
  - [ ] No new Server4/Server5 strings
  - [ ] No livinityd/ files modified
  - [ ] All integration testing left to the opt-in Phase 37 destructive integration test
</output>
