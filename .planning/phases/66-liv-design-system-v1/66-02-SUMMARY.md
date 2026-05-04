---
phase: 66-liv-design-system-v1
plan: 02
subsystem: ui-design-system
tags: [design-system, motion, framer-motion, primitives, ui]
requirements: [DESIGN-05]
dependency_graph:
  requires:
    - "livos/packages/ui/src/components/motion-primitives/in-view.tsx"
    - "livos/packages/ui/src/components/motion-primitives/glow-effect.tsx"
    - "livos/packages/ui/src/components/motion-primitives/transition-panel.tsx"
    - "livos/packages/ui/src/components/motion-primitives/animated-group.tsx"
    - "motion@^12.35.0 (already installed)"
  provides:
    - "FadeIn — fade-up entrance primitive"
    - "GlowPulse — color-parameterized breathing glow"
    - "SlideInPanel — directional panel slide-in"
    - "TypewriterCaret — anchored blinking caret for streaming text"
    - "StaggerList — 50ms-staggered child entrance"
    - "@/components/motion barrel export"
  affects:
    - "P68 side panel (will consume SlideInPanel)"
    - "P69 per-tool views (will consume StaggerList for tool list)"
    - "P70 composer + streaming UX (will consume TypewriterCaret)"
    - "P75 reasoning cards + memory (will consume FadeIn + GlowPulse)"
tech-stack:
  added: []
  patterns:
    - "Wrapper-over-library composition (D-09: wrap, don't rewrite)"
    - "framer-motion variant overrides via *Override prop slots (D-07)"
    - "MutationObserver-driven DOM position tracking (TypewriterCaret)"
    - "requestAnimationFrame batching for reflow"
key-files:
  created:
    - "livos/packages/ui/src/components/motion/FadeIn.tsx"
    - "livos/packages/ui/src/components/motion/GlowPulse.tsx"
    - "livos/packages/ui/src/components/motion/SlideInPanel.tsx"
    - "livos/packages/ui/src/components/motion/StaggerList.tsx"
    - "livos/packages/ui/src/components/motion/TypewriterCaret.tsx"
    - "livos/packages/ui/src/components/motion/index.ts"
  modified: []
decisions:
  - "Imported types from `motion/react` (v12.35.0) rather than `framer-motion` (v10.16.4) to stay consistent with what motion-primitives/* already use. Both packages are installed; the wrapped primitives' type signatures are motion/react's, so wrapping with framer-motion types would force casts."
  - "TypewriterCaret uses `position: fixed` rather than `position: absolute` to avoid coupling to the anchor parent's containing block (anchor may be inside a transformed/scrolled subtree). Repositions on `resize` and capture-phase `scroll` events."
  - "GlowPulse defaults to `mode='breathe'` (per v31-DRAFT reasoning-card pattern) instead of `rotate` (the underlying GlowEffect default). Single color (not gradient) array is passed to keep the breathe pulse visually monochromatic."
  - "SlideInPanel wraps the single child in an array `[children]` because TransitionPanel's `children` prop is `ReactNode[]` keyed by `activeIndex`. Always passes `activeIndex={0}`; consumers swap content by remounting."
  - "StaggerList exposes `staggerMs` (number, ms) instead of seconds because the spec D-06 quote was '50ms' — the conversion to seconds (0.05) happens internally."
metrics:
  duration_minutes: 18
  completed_date: "2026-05-04"
  tasks_completed: 2
  files_created: 6
  files_modified: 0
  total_loc_added: 508
---

# Phase 66 Plan 02: Motion Primitives Summary

Five named motion components landed under `livos/packages/ui/src/components/motion/` with a barrel export — four wrap existing `motion-primitives/*` library components (FadeIn, GlowPulse, SlideInPanel, StaggerList per D-06/D-09), one is genuinely new (TypewriterCaret, 133 LOC, MutationObserver-anchored). Build is green and `motion-primitives/` was not touched.

## What Shipped

| Component        | Wraps                      | LOC | Purpose |
|------------------|----------------------------|-----|---------|
| `FadeIn`         | `motion-primitives/in-view`        | 78  | Entrance for cards (opacity 0→1, y 8→0, 350ms, `--liv-ease-out`) |
| `GlowPulse`      | `motion-primitives/glow-effect`    | 78  | Color-parameterized breathing glow (`amber` / `cyan` / `violet`) |
| `SlideInPanel`   | `motion-primitives/transition-panel` | 100 | Directional panel entrance (`from='right' \| 'left' \| 'top' \| 'bottom'`) |
| `StaggerList`    | `motion-primitives/animated-group` | 93  | 50ms-staggered child entrance (D-06 default) |
| `TypewriterCaret`| **NEW (no wrap)**          | 133 | Blinking caret pinned to anchor's last text node via MutationObserver |
| `index.ts`       | barrel                     | 26  | Re-exports all 5 named primitives + their `*Props` types |

**Total LOC added:** 508 across 6 new files. `motion-primitives/` files: zero changes.

All five accept framer-motion-style variant overrides via `variantsOverride` and/or `transition` props (D-07: pass-through composability).

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| All 4 wrapper files exist as named exports | PASS |
| `TypewriterCaret.tsx` exists, ≥25 LOC, uses `useRef` + `useEffect` | PASS (133 LOC, both hooks present) |
| `index.ts` re-exports all 5 named primitives | PASS |
| `FadeIn` imports from `@/components/motion-primitives/in-view` | PASS |
| `GlowPulse` imports from `@/components/motion-primitives/glow-effect` and contains `amber`/`cyan`/`violet` | PASS |
| `SlideInPanel` imports from `@/components/motion-primitives/transition-panel` | PASS |
| `StaggerList` imports from `@/components/motion-primitives/animated-group` and contains `0.05` | PASS (`staggerSeconds = staggerMs / 1000` with default `50` → `0.05`) |
| `git status livos/packages/ui/src/components/motion-primitives/` shows ZERO changes (D-09) | PASS |
| `pnpm --filter @livos/config build && pnpm --filter ui build` exits 0 | PASS (vite build ✓ 38s, PWA 195 precache entries) |
| Sacred SHA `nexus/packages/core/src/sdk-agent-runner.ts` = `4f868d31...8b` | PASS (verified at start, mid-Task-1, mid-Task-2, end) |
| `pnpm --filter ui typecheck` exits 0 | **PARTIAL** — see Deviations below |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Scope Boundary] `pnpm --filter ui typecheck` does not exit 0 (538 pre-existing errors)**
- **Found during:** Task 1 verification step.
- **Issue:** The plan's acceptance criterion "`pnpm --filter ui typecheck` exits 0" is unattainable in the current repo state. The `ui` package has 538 pre-existing TypeScript errors at the master HEAD before this plan started, in files this plan is forbidden to touch:
  - `src/components/motion-primitives/glow-effect.tsx` line 142, plus `morphing-popover.tsx`, `scroll-progress.tsx`, `spinning-text.tsx`, `toolbar-dynamic.tsx`, `toolbar-expandable.tsx` (all `motion-primitives/*` — **D-09 forbids editing**)
  - `src/routes/settings/users.tsx`, `src/utils/search.ts` (unrelated subsystems — out of scope)
  - `tailwind.config.ts` (token-extension types — owned by Plan 66-01 typography scale)
  - `stories/src/routes/stories/*` (Storybook-style stories, broken before this plan)
- **Verification:** Stashed all changes and ran `pnpm --filter ui typecheck` — error count was already 538 before any motion/* file existed. After my 6 files were added, count is still 538 (zero net delta).
- **Scope boundary applied:** Per executor's `<deviation_rules>` SCOPE BOUNDARY — only auto-fix issues DIRECTLY caused by the current task's changes. Pre-existing failures in unrelated files are out of scope. Fixing the `motion-primitives/*` errors would also violate D-09.
- **My new files contribute zero typecheck errors** (verified: `pnpm --filter ui typecheck 2>&1 | grep -E "src/components/motion/(FadeIn|GlowPulse|SlideInPanel|StaggerList|TypewriterCaret|index)"` returns empty).
- **What was used as the green-gate instead:** `pnpm --filter @livos/config build && pnpm --filter ui build` — the **vite build succeeds in 38s** with 195 PWA precache entries, which proves the new components compile and are bundleable. This is the binding correctness signal for downstream P68-P75 phases (they will `import` from the barrel; bundling resolves their types via the bundler-mode TypeScript path).
- **Files modified:** None.
- **Commit:** N/A (deviation note only; no code change required).

## TDD Gate Compliance

The plan declares `tdd="true"` on both tasks. The verification commands act as the test gates:

- **Task 1 RED:** `node -e "...check files exist..."` was run before any writes — failed with `Missing: livos/packages/ui/src/components/motion/FadeIn.tsx` (verified pre-implementation gate).
- **Task 1 GREEN:** After writing the 4 files, the same node check returned `Wrappers OK`. Task 1 commit `d3a63dd0` recorded as `feat(66-02): ...` per spec.
- **Task 2 RED:** Implicit — `index.ts` and `TypewriterCaret.tsx` did not exist; the verification grep would have failed.
- **Task 2 GREEN:** `Caret + barrel OK; LOC= 134` — all 5 primitives in barrel; both hooks (`useRef`, `useEffect`) present in TypewriterCaret. Task 2 commit `9f9b1c31`.

No REFACTOR commits were needed; the implementations landed clean on first pass.

Note: this plan does not have unit tests under `__tests__/` because the existing `ui` package has no Vitest scaffold for component testing (Vitest is a devDep but no `*.test.tsx` patterns exist for motion-primitives, which is the closest analog). The static-analysis gates (grep + typecheck-of-new-files + vite-build) were used as the test-substitute, consistent with how `motion-primitives/` itself was added historically. A future BACKLOG item could add Vitest + React Testing Library snapshot tests for these 5 primitives once consumers in P68-P75 motivate concrete behavior assertions.

## Verification Evidence

```bash
# Task 1 grep gate
$ node -e "...4 wrappers + content checks..."
Wrappers OK

# Task 2 grep gate
$ node -e "...caret + barrel checks..."
Caret + barrel OK; LOC= 134

# motion-primitives invariant (D-09)
$ git status livos/packages/ui/src/components/motion-primitives/
nothing to commit, working tree clean

# typecheck-of-new-files (zero errors in motion/*)
$ pnpm --filter ui typecheck 2>&1 | grep -E "src/components/motion/(FadeIn|GlowPulse|SlideInPanel|StaggerList|TypewriterCaret|index)"
(empty)

# Sacred SHA gate (run 4×: pre-Task-1, mid-Task-1, pre-Task-2, post-Task-2)
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b

# Build gate
$ pnpm --filter @livos/config build
@livos/config@0.1.0 build → tsc (exit 0)

$ pnpm --filter ui build
✓ built in 38.27s
PWA v1.2.0 — precache 195 entries (6966.24 KiB)
```

## Threat Register Compliance

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-66-02-01 (motion-primitives modified by mistake) | mitigate | **MET** — `git status livos/packages/ui/src/components/motion-primitives/` confirms zero diff. |
| T-66-02-02 (TypewriterCaret leaks intervals/observers) | mitigate | **MET** — `useEffect` cleanup disconnects observer, clears interval, removes resize/scroll listeners, cancels pending RAF. |
| T-66-02-03 (caret reads cross-origin DOM) | accept | n/a — `anchorRef` is always a same-origin React ref. |

No new threats discovered during execution.

## Commits

| Task | Commit | Files | Lines |
|------|--------|-------|-------|
| 1 | `d3a63dd0` | FadeIn.tsx, GlowPulse.tsx, SlideInPanel.tsx, StaggerList.tsx | 349 |
| 2 | `9f9b1c31` | TypewriterCaret.tsx, index.ts | 159 |

## Downstream Consumer Contract

Phases P68-P75 import via the barrel:

```ts
import {
  FadeIn,
  GlowPulse,
  SlideInPanel,
  TypewriterCaret,
  StaggerList,
} from '@/components/motion';

// Examples (consumer code, not in this plan):
<FadeIn delay={0.1}><Card .../></FadeIn>
<GlowPulse color="amber"><ReasoningCard .../></GlowPulse>
<SlideInPanel from="right"><SidePanel .../></SlideInPanel>
<TypewriterCaret anchorRef={streamingTextRef} />
<StaggerList staggerMs={50}>{toolList.map(...)}</StaggerList>
```

All five accept framer-motion overrides (`variantsOverride`, `transition`) per D-07.

## Self-Check: PASSED

- [x] FOUND: `livos/packages/ui/src/components/motion/FadeIn.tsx`
- [x] FOUND: `livos/packages/ui/src/components/motion/GlowPulse.tsx`
- [x] FOUND: `livos/packages/ui/src/components/motion/SlideInPanel.tsx`
- [x] FOUND: `livos/packages/ui/src/components/motion/StaggerList.tsx`
- [x] FOUND: `livos/packages/ui/src/components/motion/TypewriterCaret.tsx`
- [x] FOUND: `livos/packages/ui/src/components/motion/index.ts`
- [x] FOUND: commit `d3a63dd0` (Task 1)
- [x] FOUND: commit `9f9b1c31` (Task 2)
- [x] FOUND: sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` matches.
- [x] FOUND: zero diff under `livos/packages/ui/src/components/motion-primitives/`.
