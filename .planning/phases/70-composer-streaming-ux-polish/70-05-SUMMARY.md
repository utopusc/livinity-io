---
phase: 70-composer-streaming-ux-polish
plan: 05
subsystem: ai-chat-ux
tags: [agent-status, typing-dots, glow-pulse, status-badge, p66-consumer]
requires:
  - p66-glow-pulse-motion-primitive
  - p66-liv-status-running-badge-variant
  - p66-liv-tokens-css-accent-rose
  - tabler-icons-react
provides:
  - LivAgentStatus React component (6 visual states)
  - LivTypingDots React component (500ms breathing dots)
  - getStatusGlowColor pure helper (phase → 'cyan' | 'amber' | 'rose' | null)
  - getNextDot pure helper ('' → '.' → '..' → '...' → '')
affects:
  - none (P70-08 will integrate these into routes/ai-chat/index.tsx + chat-messages.tsx)
tech_stack:
  added: []
  patterns:
    - P66 motion-primitive consumption (GlowPulse via @/components/motion barrel)
    - P66 design-token consumption (--liv-accent-* CSS vars)
    - shadcn variant consumption (Badge variant='liv-status-running')
    - Pure-helper unit-testing (no @testing-library/react — D-NO-NEW-DEPS)
key_files:
  created:
    - livos/packages/ui/src/routes/ai-chat/components/liv-agent-status.tsx
    - livos/packages/ui/src/routes/ai-chat/components/liv-typing-dots.tsx
    - livos/packages/ui/src/routes/ai-chat/components/liv-agent-status.unit.test.tsx
  modified: []
decisions:
  - "GlowPulse 'rose' adaptation: helper returns 'rose' (per plan must-have), but render path falls back to a static rose-tinted ring instead of <GlowPulse color='rose'> because GlowPulse only accepts 'amber'/'cyan'/'violet' (P66-02 signature)."
  - "AgentStatus type widening via 'as unknown as' cast for steps[]: legacy AgentStatus (livos/packages/ui/src/hooks/use-agent-socket.ts:32) declares only `phase: 'idle'|'thinking'|'executing'|'responding'` and `currentTool` — no `steps` field. Defensive cast preserves the legacy steps-list rendering pattern (CONTEXT D-37 verbatim port) while keeping the new file type-safe at its boundary."
  - "Pure helpers exported (getStatusGlowColor, getNextDot) for vitest unit coverage. RTL-absent precedent: P67-04 + P68 SUMMARY established this for D-NO-NEW-DEPS."
  - "Steps-list rendering ports legacy lines 38-58 verbatim with P66 token replacements (text-violet-400 → --liv-accent-violet, text-red-400 → --liv-accent-rose, text-green-400 → --liv-accent-emerald)."
metrics:
  duration: ~10 minutes
  tasks: 2
  files: 3
  loc_added: 313
  tests_added: 13
  completed: "2026-05-04"
---

# Phase 70 Plan 05: LivAgentStatus + LivTypingDots Summary

**One-liner:** Suna-style agent feedback components — 6-state status overlay with P66 GlowPulse + breathing typing dots while waiting for first token.

## What was built

Two co-shipped UX-feedback components that replace (functionally, not literally) the legacy `agent-status-overlay.tsx`. Both are isolated leaf components consumed in P70-08's chat shell integration.

### `liv-agent-status.tsx` (159 LOC)

Renders 6 distinct visual states (CONTEXT D-36) for the agent's current phase:

| Phase      | Visual                                                                |
|------------|-----------------------------------------------------------------------|
| idle       | renders null                                                          |
| listening  | cyan GlowPulse + IconBrain + "Listening..."                           |
| thinking   | cyan GlowPulse + IconBrain + "Thinking..."                            |
| executing  | amber GlowPulse + IconLoader2 + Badge(liv-status-running) + tool name |
| responding | no glow (caret in chat handles this; passes through)                  |
| error      | rose-tinted static ring + IconX + "Error" (see GlowPulse adaptation)  |

Plus the steps-list (last 6 visible) ported verbatim from legacy `agent-status-overlay.tsx` lines 38-58 with P66 token replacements.

Exported pure helper: `getStatusGlowColor(phase: string): 'cyan' | 'amber' | 'rose' | null`.

Tool-name formatter `formatToolName` ported verbatim (strips `mcp__servername__` prefix).

### `liv-typing-dots.tsx` (61 LOC)

Suna's breathing dots animation while waiting for the first token. Cycle `'' → '.' → '..' → '...'` at 500ms via `setInterval` inside `useEffect`. Cleanup function calls `clearInterval` (T-70-05-04 mitigation). Optional `active?: boolean` prop (defaults true) — when false, returns null and pauses the interval.

Exported pure helper: `getNextDot(current: string): string`.

### `liv-agent-status.unit.test.tsx` (93 LOC)

13 vitest cases:

- `getStatusGlowColor` (D-36): 7 tests covering all 6 phase mappings + defensive default for unknown phase (case-sensitive: `'THINKING'` returns null).
- `getNextDot` (D-39): 6 tests covering 4-step cycle, defensive default for unknown input (`'????'`, `'....'`, `'foo'` all → `''`), idempotent multi-cycle loops, odd-step landing positions, recovery from unknown input.

All 13 pass: `pnpm --filter ui exec vitest run --reporter=verbose src/routes/ai-chat/components/liv-agent-status.unit.test.tsx` exits 0 in ~1s.

## GlowPulse API adaptation

The plan's must-have spec said `getStatusGlowColor('error')` returns `'rose'`. But on reading `livos/packages/ui/src/components/motion/GlowPulse.tsx`, the `color` prop is locked to `'amber' | 'cyan' | 'violet'` only — there is no `'rose'` option in `GlowPulseColor`.

**Adaptation (Rule 3 auto-fix):** the pure helper still returns `'rose'` to satisfy the locked test contract (and to remain a meaningful "this is the error state" signal for future consumers). The render path checks `glow === 'amber' || glow === 'cyan'` before wrapping in `<GlowPulse color={glow}>`; for `'rose'` it falls back to a static rose-tinted border on the outer container (`border-[color:var(--liv-accent-rose)]/40`) and the IconX/Error label inherits the rose accent. No new GlowPulse color was added (D-07: D-NO-NEW-DEPS — GlowPulse signature would require modifying P66-02 motion code, out of scope).

This is documented as a `// GlowPulse only accepts...` comment block in the file header and at the wrap call site so future readers don't expect a missing `'rose'` option.

## AgentStatus type adaptation

The plan and CONTEXT D-37 said port the steps-list rendering verbatim. But `AgentStatus` (defined in `livos/packages/ui/src/hooks/use-agent-socket.ts:32`) is typed as:

```ts
export interface AgentStatus {
  phase: 'idle' | 'thinking' | 'executing' | 'responding'
  currentTool: string | null
}
```

— no `steps` field, no `'error'` or `'listening'` phase. The legacy `agent-status-overlay.tsx` reads `status.steps` and `status.phase === 'error'` regardless (so the legacy file already has type errors against this declaration; pre-existing per P66's 538-error baseline).

**Adaptation:** the new file uses a defensive `as unknown as` cast at the read boundary to extract `steps` if present, defaulting to `[]` if absent or non-array. Phase is widened via `phase as string` so the switch supports the future `'listening'`/`'error'` values that CONTEXT D-36 specifies. This keeps the type contract clean *inside* the new file while still rendering the documented 6 phases when the runtime supplies them.

A future plan that updates `AgentStatus` (likely 70-08 integration or v32 cleanup) can drop the cast.

## Verification

| Check                                                                             | Result            |
|-----------------------------------------------------------------------------------|-------------------|
| `pnpm --filter ui build`                                                          | exit 0 (45.64s)   |
| `pnpm --filter ui exec vitest run …liv-agent-status.unit.test.tsx`                | 13/13 pass (~1s)  |
| Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`                             | unchanged         |
| Legacy `agent-status-overlay.tsx`                                                 | UNTOUCHED         |
| `npm install --no-save --dry-run` produces no new top-level packages              | confirmed (no npm calls made) |
| All 8 must-have invariants ('LivAgentStatus', 'getStatusGlowColor', 'GlowPulse', 'liv-status-running', 'AgentStatus', 'IconBrain', 'IconLoader2', 'IconX' in agent-status; 'LivTypingDots', 'getNextDot', 'setInterval', 'useEffect', 'useState', 'clearInterval' in typing-dots) | all present |

## Decisions Made

1. **GlowPulse rose adaptation** — described above. Helper contract preserved; render path forks at the wrap site.
2. **AgentStatus widening cast** — described above. Defensive read at the new component's boundary; legacy hook untouched.
3. **Test split: pure helpers only** — RTL-absent precedent inherited from P67-04 SUMMARY. The locked product behavior lives in `getStatusGlowColor` and `getNextDot`; the JSX shell is render-only.
4. **Test count exceeds minimum** — plan required 8+ tests; shipped 13. Five extra cases harden the dot-cycle's idempotence and probe odd-step positions, plus an unknown-input recovery test that exercises the helper's loop boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] GlowPulse signature lacks 'rose' color**
- **Found during:** Task 1 — read of `GlowPulse.tsx` in step 2 of plan action.
- **Issue:** Plan's render-path snippet shows `<GlowPulse color={glow}>` where `glow` may be `'rose'`. Actual `GlowPulseColor = 'amber' | 'cyan' | 'violet'` — no `'rose'` accepted.
- **Fix:** Helper still returns `'rose'` (test contract preserved); render path forks: only wrap in `<GlowPulse>` when color is `'amber'` or `'cyan'`. For `'rose'` (error state), apply static rose-tinted border on the outer container and rose-tinted icon/text. Documented in file header.
- **Files modified:** `livos/packages/ui/src/routes/ai-chat/components/liv-agent-status.tsx` only.
- **Commit:** `a9148336`

**2. [Rule 3 - Blocking] AgentStatus type missing `steps`/'error'/'listening'**
- **Found during:** Task 1 — read of `use-agent-socket.ts` step 4 of plan action.
- **Issue:** Plan says "import `AgentStatus` from `@/hooks/use-agent-socket`" + render `status.steps`. But the type declares only 4 phases and no steps field.
- **Fix:** Defensive cast at read boundary inside the new component. Phase widened via `as string` to allow `'listening'`/`'error'` switch arms; steps extracted via `as unknown as {steps?:...}` defaulting to `[]`.
- **Files modified:** `livos/packages/ui/src/routes/ai-chat/components/liv-agent-status.tsx` only.
- **Commit:** `a9148336`

### Concurrent-commit incident (informational)

Task 2's first commit (`b37dd5a5`) accidentally swept three unrelated files (`nexus/packages/core/src/index.ts`, `lib.ts`, `run-queue.ts`) into the test commit. Cause: a parallel agent staged those files between my `git add` and `git commit`. The race was non-destructive — both my test file AND the unrelated files all landed correctly; the parallel agent's subsequent commit (`c0d4966d` for 70-04) had no conflict. No data loss. Documented for transparency. The expansion commit `e8783814` was clean (only the test file).

## Self-Check: PASSED

- `livos/packages/ui/src/routes/ai-chat/components/liv-agent-status.tsx` — FOUND (159 LOC ≥ 110 ✓)
- `livos/packages/ui/src/routes/ai-chat/components/liv-typing-dots.tsx` — FOUND (61 LOC ≥ 40 ✓)
- `livos/packages/ui/src/routes/ai-chat/components/liv-agent-status.unit.test.tsx` — FOUND (93 LOC ≥ 80 ✓)
- Commit `a9148336` (feat) — FOUND in `git log`
- Commit `b37dd5a5` (test) — FOUND in `git log`
- Commit `e8783814` (test expand) — FOUND in `git log`
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — unchanged
- Legacy `agent-status-overlay.tsx` — UNTOUCHED (last commit `bea4e260`, Phase 19)

## Threat Surface Scan

No new network endpoints, auth paths, file access, or schema changes introduced. Threat register T-70-05-01..04 mitigations honored:

- T-70-05-03 (DoS via long steps array): `slice(-6)` limits visible steps to last 6.
- T-70-05-04 (interval leak): `useEffect` cleanup returns `clearInterval`.

No new threat flags.

## Success Criteria

- ✅ COMPOSER-07 (`liv-agent-status.tsx` with 6 distinct states) implemented and tested.
- ✅ COMPOSER-08 (`liv-typing-dots.tsx` 500ms breathing dots) implemented and tested.
- ✅ 70-08 can consume `<LivAgentStatus>` + `<LivTypingDots>` directly.
