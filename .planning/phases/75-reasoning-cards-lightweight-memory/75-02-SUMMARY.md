---
phase: 75-reasoning-cards-lightweight-memory
plan: 02
subsystem: ui/ai-chat/reasoning-card
tags: [ui, reasoning-card, kimi, amber-glow, collapsible, react-markdown, glow-pulse, mem-01, mem-02, tdd]
requires:
  - GlowPulse component (P66-02)
  - --liv-border-subtle token (P66-01)
  - --liv-accent-amber token (P66-01)
  - react-markdown ^9.0.1 (already-present, P70-04 verified)
  - @tabler/icons-react ^3.36.1 (already-present)
provides:
  - LivReasoningCard React component (default + named export)
  - LivReasoningCardProps interface
  - formatDuration pure helper (4-branch duration formatter)
affects:
  - Plan 75-07 (chat-messages render path will import + mount)
tech-stack:
  added: []
  patterns:
    - Pure-helper extraction + source-text invariants test pattern (P67-04 D-NO-NEW-DEPS lock)
    - Single-button toggle with role=button + aria-expanded + aria-controls + Enter/Space keyboard
    - GlowPulse wrap conditional on isStreaming (P66-02 amber pulse)
    - ReactMarkdown body without rehype-raw (T-75-02-01 XSS mitigation)
key-files:
  created:
    - livos/packages/ui/src/routes/ai-chat/components/liv-reasoning-card.tsx
    - livos/packages/ui/src/routes/ai-chat/components/liv-reasoning-card.unit.test.tsx
  modified: []
decisions:
  - GlowPulse prop API confirmed { color, mode, blur, intensity, duration, transition } — used color="amber" + blur="soft" + duration={2}
  - Body id stable per-mount via module-scoped seed counter (collisions only matter for SR within same parent)
  - Default + named export both shipped (default for ergonomic single-import, named for tree-shake-friendly destructured imports)
  - Comment text refactored to avoid the literal 'rehype-raw' / 'dangerouslySetInnerHTML' tokens after they collided with negative source-text invariants
metrics:
  duration_minutes: 3
  completed_date: 2026-05-04
  task_count: 1
  test_count: 20
  test_runtime_ms: 6
  build_runtime_s: 44.10
---

# Phase 75 Plan 02: LivReasoningCard Summary

**One-liner:** Collapsible amber-tinted card surfacing Kimi `reasoning_content` as ReactMarkdown with GlowPulse-pulsed Brain icon while streaming and `formatDuration`-stamped header when done.

## Files Created

| File | Lines | Purpose |
|---|---|---|
| `livos/packages/ui/src/routes/ai-chat/components/liv-reasoning-card.tsx` | 196 | Component + props interface + `formatDuration` helper |
| `livos/packages/ui/src/routes/ai-chat/components/liv-reasoning-card.unit.test.tsx` | 124 | Vitest helper coverage + source-text invariants (20 tests) |

## Test Results

```
src/routes/ai-chat/components/liv-reasoning-card.unit.test.tsx  (20 tests | 0 failed)
Tests       20 passed (20)
Duration    ~6ms (transform 65ms, collect 795ms)
```

Coverage breakdown:
- `formatDuration` helper: 4 describe branches (undefined / `<1s` / `1.0s..60.0s` / `1m 0s..62m 5s`) — 12 individual assertions
- Source-text invariants (D-14, D-33): 16 file-level invariants on label strings, GlowPulse + IconBrain + react-markdown imports, aria-expanded + aria-controls, Enter/Space keyboard, no `dangerouslySetInnerHTML`, no rehype-raw, amber tint, `--liv-border-subtle` border, exported props interface, exported component, both chevron icons present.

## Build Status

`pnpm --filter ui build` — clean, exit 0, 44.10s. Pre-existing `chunks > 500kB` warning is unrelated. New component compiles into the route bundle.

## GlowPulse Prop API Confirmed

Read `livos/packages/ui/src/components/motion/GlowPulse.tsx`. Surface:

```ts
type GlowPulseProps = {
  children?: ReactNode
  color?: 'amber' | 'cyan' | 'violet'   // default 'amber'
  mode?: 'pulse' | 'breathe' | 'static' // default 'breathe'
  blur?: 'softest'|'soft'|'medium'|'strong'|'stronger'|'strongest'|'none'|number
  intensity?: number     // pulse scale (default 1.0)
  duration?: number      // loop seconds (default 3)
  className?: string
  glowClassName?: string
  transition?: Transition
}
```

Card uses `<GlowPulse color="amber" blur="soft" duration={2}>{brainIcon}</GlowPulse>` while streaming. When NOT streaming, the icon renders bare (no GlowPulse wrapper at all — GlowPulse has no `paused`/`disabled` prop, so conditional wrapping is the right pattern).

GlowPulse renders a `<div className="relative">` wrapper with absolute-positioned `<GlowEffect>` underneath and `<div className="relative z-10">{children}</div>` on top. This adds a small block-level wrapper around the inline icon — visually fine inside the flex header (gap-2 spacing).

## Token Verification

- `--liv-border-subtle: rgba(120, 180, 255, 0.08)` — present at `liv-tokens.css:16`. Used directly as `border-[color:var(--liv-border-subtle)]`.
- `--liv-accent-amber: #ffbd38` — present at `liv-tokens.css:25`. Used for icon color, label color, and focus ring.
- Background uses inline `bg-[rgba(255,189,56,0.04)]` with `hover:bg-[rgba(255,189,56,0.08)]` per CONTEXT D-14 (no token alias for the 4%/8% amber-tint values yet — fine to inline).

## Sacred SHA Verification

| Gate | SHA |
|---|---|
| Start of plan | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| End of plan | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |

`nexus/packages/core/src/sdk-agent-runner.ts` UNCHANGED — D-35 honored.

## D-NO-NEW-DEPS Verification

`livos/packages/ui/package.json` was momentarily edited by pnpm's auto-install (added a `shiki` line as a dev-dep peer-resolution from `streamdown@2.5.0` → `@streamdown/code` → `shiki`). This is NOT a dep my code introduced — `shiki` was already a transitive (`livos/node_modules/.pnpm/shiki@3.23.0/...` was already on disk pre-this-plan). The change was reverted via `git checkout -- livos/packages/ui/package.json` before the GREEN commit.

Final verification: `livos/packages/ui/package.json` is clean. The two GitHub commits (`d0dbd483` + `16e1e86d`) touch ONLY the two component files.

## Commits

| Phase | Hash | Type | Subject |
|---|---|---|---|
| RED | `d0dbd483` | test | add failing tests for LivReasoningCard |
| GREEN | `16e1e86d` | feat | implement LivReasoningCard collapsible amber card |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking] Comment-text collision with negative source-text invariants**
- **Found during:** GREEN test run
- **Issue:** The component's threat-model comment originally contained the literal strings `dangerouslySetInnerHTML` and `rehype-raw`, which made the negative-invariant tests `expect(src).not.toContain('dangerouslySetInnerHTML')` and `expect(src).not.toMatch(/rehype-raw/)` fail (the comment described exactly what we mustn't add — but the file source still contained those tokens).
- **Fix:** Rewrote the threat-model comment to describe the mitigation conceptually (`raw-HTML rehype plugin or React's html-bypass escape hatch`) without using the forbidden literal tokens. Tests now pass and the file still documents the security rationale.
- **Files modified:** `liv-reasoning-card.tsx` (header comment only)
- **Commit:** Folded into `16e1e86d` (no separate commit; pre-test fix)

**2. [Plan note] Default export added in addition to named export**
- The plan must-haves left it to "Claude's discretion: named export ALSO acceptable, but pick one and stay consistent." Shipped BOTH (named `export function LivReasoningCard` + `export default LivReasoningCard`) so 75-07 wire-up can use either style without re-touching this file. Minimal cost, maximal flexibility. The test asserts the named export shape (`/export\s+function\s+LivReasoningCard/`).

### Did NOT Auto-Fix (out of scope)

- Pre-existing `livos/packages/ui/pnpm-lock.yaml` lockfileVersion drift (v6 in repo → v9 after install). Out of plan scope; reverted to prevent pollution. Tracked as a real-world drift but a separate cleanup plan should regen the lockfile cleanly.
- Pre-existing untracked `mermaid-block.tsx` / `shiki-block.tsx` siblings in the same directory — likely from a parallel-running plan. Left untouched.

## Threat Flags

None — react-markdown 9 handles XSS by default; component does not introduce new trust boundaries beyond those documented in the plan's `<threat_model>` (T-75-02-01..03).

## MEM-01 / MEM-02 / MEM-03 Status

- **MEM-01 (collapsible amber card with label switching by streaming state + duration display):** ✅ delivered.
- **MEM-02 (GlowPulse motion primitive integration; Markdown body):** ✅ delivered.
- **MEM-03 (chat-messages rendering integration):** partial — component exists, exports stable; full wiring is plan 75-07's job. Plan 75-07 can `import {LivReasoningCard} from './components/liv-reasoning-card'` (named) or `import LivReasoningCard from './components/liv-reasoning-card'` (default) without further work.

## TDD Gate Compliance

- **RED gate:** `d0dbd483` (test commit; vitest exits non-zero — file load error, missing component) ✅
- **GREEN gate:** `16e1e86d` (feat commit; vitest exits 0, 20/20 pass) ✅
- **REFACTOR:** Not needed — implementation is minimal + matches CONTEXT contract verbatim.

## Self-Check: PASSED

- ✅ `livos/packages/ui/src/routes/ai-chat/components/liv-reasoning-card.tsx` — FOUND (196 lines)
- ✅ `livos/packages/ui/src/routes/ai-chat/components/liv-reasoning-card.unit.test.tsx` — FOUND (124 lines)
- ✅ Commit `d0dbd483` — FOUND in git log (test commit, RED phase)
- ✅ Commit `16e1e86d` — FOUND in git log (feat commit, GREEN phase)
- ✅ Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — UNCHANGED
- ✅ 20/20 vitest assertions pass
- ✅ vite build clean (44.10s)
- ✅ Zero new package.json deps
