---
phase: 70-composer-streaming-ux-polish
plan: 06
subsystem: ai-chat-ux
tags: [stop-button, model-badge, color-toggle, p66-consumer, composer-controls]
requires:
  - p66-liv-tokens-css-accent-rose
  - p66-liv-tokens-css-accent-cyan
  - p66-liv-tokens-css-bg-elevated
  - p66-liv-tokens-css-border-subtle
  - p66-liv-tokens-css-text-secondary
  - tabler-icons-react
  - shadcn-cn-utility
provides:
  - LivStopButton React component (3 visual states; red↔cyan toggle)
  - LivModelBadge React component (env-driven model name pill)
  - getStopButtonState pure helper (boolean props → 'streaming' | 'send' | 'disabled')
  - getModelBadgeText pure helper (env value → model name with 'Kimi' fallback)
affects:
  - none (P70-08 will integrate these into liv-composer.tsx by replacing the
    data-testid='liv-composer-stop-stub' / 'liv-composer-model-badge-stub' placeholders)
tech_stack:
  added: []
  patterns:
    - P66 design-token consumption (--liv-accent-rose/cyan, --liv-bg-elevated, --liv-border-subtle, --liv-text-secondary)
    - Tailwind transition-colors duration-200 for the red↔cyan micro-interaction (CONTEXT D-24, no framer-motion)
    - Pure-helper unit-testing (no @testing-library/react — D-NO-NEW-DEPS)
    - Native title= attribute for tooltip (no new tooltip library)
    - import.meta.env for build-time model-name configuration
key_files:
  created:
    - livos/packages/ui/src/routes/ai-chat/components/liv-stop-button.tsx
    - livos/packages/ui/src/routes/ai-chat/components/liv-model-badge.tsx
    - livos/packages/ui/src/routes/ai-chat/components/liv-stop-button.unit.test.tsx
  modified: []
decisions:
  - "State-priority ladder in getStopButtonState: explicit `disabled` wins → `isStreaming` next → `hasContent` last. Plan must-have line specifies disabled-priority is absolute (user can't stop a stream they don't own); 3-way explicit case (streaming + content + disabled) tested."
  - "data-state='${state}' attribute exposed on the button root so 70-08 integration tests + Playwright smokes can grep state without inspecting class strings."
  - "data-testid='liv-model-badge' on the badge root so 70-08 swap target is greppable AND so smoke tests can assert presence without DOM tree walking."
  - "getModelBadgeText whitespace-trimming: a `.trim().length > 0` check catches `'   '` / `'\\t\\n'` cases (real-world risk: env loader leaving whitespace from .env value parsing). Plan behavior contract honored verbatim."
  - "Pure helpers (getStopButtonState, getModelBadgeText) exported alongside the components for vitest hammering — D-NO-NEW-DEPS precedent (P67-04 D-25 / 70-04 / 70-05)."
  - "Click handler in LivModelBadge logs `[LivModelBadge] Model switching not yet implemented` so the surface is greppable when P75/v32 wires real switching. Plan-mandated no-op behavior preserved."
  - "Native `title` attribute used for hover tooltip — explicitly chosen over importing a tooltip library (no new deps per D-07). Tooltip text format: `Current model: ${model}. Click to switch (coming soon).`"
  - "TDD ordering enforced: RED commit (failing tests, modules don't exist) → GREEN commit (component impl). Phase 70-04/70-05 commit-history precedent."
metrics:
  duration: ~12 minutes
  tasks: 2
  files: 3
  loc_added: 217
  tests_added: 13
  completed: "2026-05-04"
---

# Phase 70 Plan 06: LivStopButton + LivModelBadge Summary

**One-liner:** Composer-footer adornments — the user's PANIC button (red↔cyan stop/send toggle) plus a quiet model-provenance pill (Liv Agent · Kimi).

## What was built

Two small leaf components co-shipped because P70-08 imports both and they live in the composer footer side-by-side. Each component is paired with an exported pure helper for direct vitest coverage (no DOM/RTL needed).

### `liv-stop-button.tsx` (85 LOC)

Single button rendering three visual states per CONTEXT D-22:

| State       | Trigger                                               | BG color                                | Icon            | onClick     |
|-------------|-------------------------------------------------------|-----------------------------------------|-----------------|-------------|
| `streaming` | `isStreaming === true && !disabled`                   | `var(--liv-accent-rose)`                | `IconPlayerStop` | fires `onStop` |
| `send`      | `!isStreaming && hasContent && !disabled`             | `var(--liv-accent-cyan)`                | `IconArrowUp`   | fires `onSend` |
| `disabled`  | `disabled` set, OR (`!isStreaming && !hasContent`)    | `var(--liv-accent-cyan)/40` (low-op)    | `IconArrowUp`   | no-op        |

Color transition: Tailwind `transition-colors duration-200` (CONTEXT D-24, NO framer-motion for this micro-interaction). `aria-label` swaps between `'Stop generation'` and `'Send message'` based on state. `data-state` attribute exposes the derived state for downstream tests.

Exported pure helper: `getStopButtonState({isStreaming, hasContent, disabled?}): 'streaming' | 'send' | 'disabled'`. Priority ladder: `disabled` > `isStreaming` > `hasContent` > `disabled` (default).

### `liv-model-badge.tsx` (58 LOC)

Inline pill: `<IconBrain /> Liv Agent · ${model}` where `${model}` is read from `import.meta.env.VITE_LIV_MODEL_DEFAULT` at build time, falling back to `'Kimi'` when undefined / null / empty / whitespace-only (CONTEXT D-31).

Click handler logs `[LivModelBadge] Model switching not yet implemented` (no-op for P70 — model switching is backlog per D-31). Hover tooltip via native `title` attribute (no new tooltip library, D-NO-NEW-DEPS).

Visual: `inline-flex` rounded pill with `var(--liv-border-subtle)` border, `var(--liv-bg-elevated)` background, `var(--liv-text-secondary)` text. IconBrain colored `var(--liv-accent-cyan)`. Hover state: `var(--liv-bg-deep)/50`.

Exported pure helper: `getModelBadgeText(envValue: string | undefined | null): string` — trims whitespace and returns `'Kimi'` for any falsy / blank value.

### `liv-stop-button.unit.test.tsx` (74 LOC, 13 cases)

**`getStopButtonState (D-22)`** — 8 tests covering the full priority lattice:
- streaming priority (with/without content)
- send when not streaming + has content
- disabled when no content + not streaming
- disabled wins over streaming (explicit disabled)
- disabled wins over content
- 3-way explicit (streaming + content + disabled = disabled)
- undefined disabled treated as false (3 sub-cases)

**`getModelBadgeText (D-31)`** — 5 tests covering env fallback behavior:
- env value passes through (`'Sonnet 4.5'`, `'kimi-for-coding'`)
- undefined → `'Kimi'`
- null → `'Kimi'`
- empty string → `'Kimi'`
- whitespace-only → `'Kimi'` (`'   '`, `'\\t\\n'`)

## Verification results

| Check                                                                                    | Result   |
|------------------------------------------------------------------------------------------|----------|
| `pnpm --filter ui exec vitest run ... liv-stop-button.unit.test.tsx`                     | ✅ 13/13 pass (1.60s) |
| `pnpm --filter ui build`                                                                 | ✅ exits 0 (45.63s, no NEW errors) |
| Sacred SHA `nexus/packages/core/src/sdk-agent-runner.ts` = `4f868d31...`                 | ✅ unchanged |
| Required exports in `liv-stop-button.tsx`: `LivStopButton, getStopButtonState, IconPlayerStop, IconArrowUp, transition-colors, isStreaming, hasContent, onSend, onStop` | ✅ all present |
| Required exports in `liv-model-badge.tsx`: `LivModelBadge, getModelBadgeText, IconBrain, VITE_LIV_MODEL_DEFAULT` | ✅ all present |
| Test count ≥ 8                                                                           | ✅ 13 cases |
| Min lines: stop-button ≥ 60, model-badge ≥ 35, tests ≥ 70                                | ✅ 85 / 58 / 74 |
| P66 token surface: `var\\(--liv-accent-(rose\\|cyan)\\)`                                  | ✅ 5 matches in stop-button |
| D-NO-NEW-DEPS                                                                            | ✅ no package.json changes |

## Commits

| Phase | Commit     | Title                                                          |
|-------|------------|----------------------------------------------------------------|
| RED   | `d9521f61` | `test(70-06): add failing tests for stop-button state + model-badge text` |
| GREEN | `72367292` | `feat(70-06): implement LivStopButton + LivModelBadge`         |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Parallel-execution race-condition leak**
- **Found during:** Task 1 GREEN commit
- **Issue:** Concurrent agents (Phase 73-03, 75-01, 75-02, 75-04, 70-07) were committing on `master` in the same time window. My `git add livos/packages/ui/src/routes/ai-chat/components/liv-stop-button.tsx livos/packages/ui/src/routes/ai-chat/components/liv-model-badge.tsx` (specific paths only) ended up sweeping in `livos/packages/livinityd/source/modules/database/messages-repository.test.ts` — a Phase 75-01 follow-up file the parallel agent was preparing but had not yet committed. `git diff --cached --name-only` immediately before the commit showed only the two intended files; the leak entered between staging and commit-finalization.
- **Fix:** Per `<destructive_git_prohibition>` (no `git reset --hard` / no `git rm` on files I didn't author), the leaked file remains in commit `72367292`. The 75-01 agent will detect their file already on disk + already in HEAD and adapt their workflow.
- **Files affected:** `livos/packages/livinityd/source/modules/database/messages-repository.test.ts` (extra file in 70-06 GREEN commit)
- **Commit:** `72367292`
- **Impact on 70-06 deliverables:** Zero. All 70-06 must-have artifacts (3 files) committed correctly with intended content. Sacred SHA unchanged. Build + tests both pass.

### Non-deviations (plan executed verbatim)

- File paths exactly as plan specified.
- Component prop signatures verbatim (`{isStreaming, hasContent, disabled?, onSend, onStop, className?}` for stop button; `{className?}` for badge).
- Exported pure helper signatures verbatim (`getStopButtonState`, `getModelBadgeText`).
- All 6 plan-specified state cases tested + 7 additional edge cases (3-way explicit, undefined-disabled triplet, null/empty/whitespace fallback variants).
- P66 token names verbatim.

## Auth gates

None.

## Known Stubs

- **`LivModelBadge` click handler is a no-op.** Plan-mandated for P70 (CONTEXT D-31 — model switching is backlog). Logs intent so the surface is greppable when P75/v32 wires real switching. Documented in component header comment + log message.

## Threat Flags

None — all surfaces stay within the plan's `<threat_model>` scope (T-70-06-01 mitigation = pure helper covered by 8 state-permutation tests; T-70-06-02 = build-time public env, intentionally visible).

## Self-Check: PASSED

- ✅ FOUND: `livos/packages/ui/src/routes/ai-chat/components/liv-stop-button.tsx` (85 lines)
- ✅ FOUND: `livos/packages/ui/src/routes/ai-chat/components/liv-model-badge.tsx` (58 lines)
- ✅ FOUND: `livos/packages/ui/src/routes/ai-chat/components/liv-stop-button.unit.test.tsx` (74 lines)
- ✅ FOUND commit: `d9521f61` (RED)
- ✅ FOUND commit: `72367292` (GREEN)
- ✅ Sacred SHA `4f868d31...` unchanged
- ✅ 13/13 vitest pass
- ✅ pnpm --filter ui build clean

## Success criteria status

- ✅ COMPOSER-02 (stop button color toggle red↔cyan with icon Stop↔ArrowUp) — implemented + 8 state-permutation tests
- ✅ COMPOSER-04 (model badge inline) — implemented + 5 fallback tests
- ✅ 70-08 swap-ready: `LivStopButton` ↔ `data-testid='liv-composer-stop-stub'` and `LivModelBadge` ↔ `data-testid='liv-composer-model-badge-stub'` placeholders shipped by 70-01 are now ready for one-line replacement
