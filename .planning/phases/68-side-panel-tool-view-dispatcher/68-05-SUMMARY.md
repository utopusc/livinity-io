---
phase: 68-side-panel-tool-view-dispatcher
plan: 05
subsystem: ui
tags: [side-panel, slide-in, mode-slider, return-to-live, suna-pattern, livtoolpanel]
requirements_satisfied: [PANEL-08, PANEL-09]
dependency_graph:
  requires:
    - "livos/packages/ui/src/stores/liv-tool-panel-store.ts (68-01)"
    - "livos/packages/ui/src/routes/ai-chat/tool-views/dispatcher.tsx (68-04)"
    - "livos/packages/ui/src/routes/ai-chat/tool-views/types.ts (68-02)"
    - "livos/packages/ui/src/routes/ai-chat/tool-views/generic-tool-view.tsx (68-02)"
    - "livos/packages/ui/src/components/motion/SlideInPanel.tsx (P66-02)"
    - "livos/packages/ui/src/components/motion/GlowPulse.tsx (P66-02)"
    - "livos/packages/ui/src/components/ui/card.tsx (P66-03 — liv-elevated variant)"
    - "livos/packages/ui/src/shadcn-components/ui/slider.tsx (P66-03 — liv-slider variant)"
    - "livos/packages/ui/src/shadcn-components/ui/badge.tsx (P66-03 — liv-status-running variant)"
    - "livos/packages/ui/src/shadcn-components/ui/button.tsx (P66-03 — liv-primary variant)"
  provides:
    - "LivToolPanel — fixed right-edge overlay component, slide-in entrance, dispatched body, mode slider + return-to-live"
    - "computeStepLabel / showReturnToLive / showJumpToLatest pure helpers (exported for tests + future consumers)"
  affects:
    - "Future P68-06 (Cmd+I shortcut) hooks into the same store via useLivToolPanelStore.getState().{open, close, isOpen}"
    - "Future P68-07 (integration test) renders <LivToolPanel /> in concert with the dispatcher + store"
    - "Future P70 (composer + chat-shell wiring) mounts LivToolPanel inside ai-chat/index.tsx — currently orphan"
tech-stack:
  added: []
  patterns:
    - "Selector-style Zustand subscriptions to limit re-renders"
    - "AnimatePresence + SlideInPanel for entrance/exit transitions"
    - "Pure-helper extraction for D-NO-NEW-DEPS testability (step label, affordance predicates)"
    - "react-dom/client + RTL-shaped helpers (render/screen/fireEvent) — D-NO-NEW-DEPS precedent"
    - "ResizeObserver polyfill in test file head — jsdom env gap fill"
key-files:
  created:
    - "livos/packages/ui/src/routes/ai-chat/liv-tool-panel.tsx (255 lines)"
    - "livos/packages/ui/src/routes/ai-chat/liv-tool-panel.unit.test.tsx (332 lines)"
  modified: []
decisions:
  - "Card import path: @/components/ui/card (NOT @/shadcn-components/ui/card). The plan referenced the latter; the project's Card lives at the former. liv-elevated variant confirmed shipped (line 32). Documented via skeleton comment block."
  - "Single-quote JSX retained per codebase prettier config — plan's verify grep used double-quote literals which is a plan-author oversight, not a code defect (verify shape passes when run quote-agnostic)."
  - "Pure helpers (computeStepLabel, showReturnToLive, showJumpToLatest) extracted as named exports to satisfy D-NO-NEW-DEPS testing without taking @testing-library/react. Same pattern as P67-04 D-25, P68-03, P70-01."
  - "Test harness mimics RTL API surface (render/screen/fireEvent) but is implemented with react-dom/client + jsdom. Drop-in 1:1 swap when @testing-library/react eventually lands."
  - "ResizeObserver no-op polyfill added at test file head — Radix Slider's useSize hook calls `new ResizeObserver()` on mount, jsdom does not provide it. Minimal stub matches the API surface React-use-size touches."
  - "icon-only button size used for header close + footer prev/next (matches P70-01 + button.tsx existing convention) instead of plan-skeleton's `size='icon'` which is not a defined variant in this codebase."
  - "GlowPulse cyan applied with `blur='soft' duration={2}` to keep the live-running pulse subtle (D-18 says 'subtle')."
metrics:
  plan_started: "2026-05-04T17:53:00Z (approx)"
  plan_completed: "2026-05-04T18:02:00Z (approx)"
  duration: "~9 minutes"
  task_count: 2
  test_count: 14
  files_created: 2
  files_modified: 0
  lines_added: 587
---

# Phase 68 Plan 68-05: LivToolPanel Side-Panel Component Summary

**One-liner:** Suna-pattern fixed-right-edge overlay panel with slide-in entrance, dispatched per-tool body, mode slider with prev/next + Return-to-live + Jump-to-latest affordances; orphan until P70 wires it into the chat shell.

## Files Created

| File | Lines | Provides |
|------|------:|----------|
| `livos/packages/ui/src/routes/ai-chat/liv-tool-panel.tsx` | 255 | `LivToolPanel` component + `computeStepLabel` / `showReturnToLive` / `showJumpToLatest` pure helpers |
| `livos/packages/ui/src/routes/ai-chat/liv-tool-panel.unit.test.tsx` | 332 | 14 vitest tests covering pure helpers + 8 DOM render/interaction cases |

## Test Result

```
Test Files  1 passed (1)
     Tests  14 passed (14)
  Duration  2.83s
```

All 14 tests pass — well above the 6 minimum required by the plan's must_haves.

Coverage breakdown:
- **Pure helpers (6 tests):** `computeStepLabel` × 4 (null current, running excluded, formatted Step N of M, skips running snapshots in count); `showReturnToLive` truth-table (4 branches); `showJumpToLatest` truth-table (5 branches).
- **DOM render/interaction (8 tests):** isOpen=false → nothing rendered; open + no snapshots → empty state, no footer; snapshot present → GenericToolView mounted in body via dispatcher; close button → `close()` + userClosed sticky; prev/next → `goToIndex` with mode flips (manual on history, live at tail); Return-to-live visible only when manual+running, click → `goLive`; Jump-to-latest visible only when manual+!running, click → `goLive`; step counter format `/Step\s+3\s+of\s+3/`.

## Build Verification

`pnpm --filter ui build` exits 0 (~50s). No new type errors in the panel file. No new chunks above the existing 500kB warning threshold attributable to this plan.

## Variant + Path Decisions

The plan's reference skeleton imported Card from `@/shadcn-components/ui/card`. That path does NOT exist in this project — Card lives at `@/components/ui/card`. The liv-elevated variant IS shipped there (P66-03, line 10-32 of the file). Used `import {Card} from '@/components/ui/card'`.

Verified P66-03 variants on the file system before authoring:

| Variant | File | Line | Status |
|---------|------|------|--------|
| `Card` `liv-elevated` | `livos/packages/ui/src/components/ui/card.tsx` | 10, 32 | Present (used) |
| `Button` `liv-primary` | `livos/packages/ui/src/shadcn-components/ui/button.tsx` | 26-27 | Present (used on Return-to-live) |
| `Slider` `liv-slider` | `livos/packages/ui/src/shadcn-components/ui/slider.tsx` | 26-27 | Present (used) |
| `Badge` `liv-status-running` | `livos/packages/ui/src/shadcn-components/ui/badge.tsx` | 19-20 | Present (used on running status) |

No fallback className paths were needed — all four `liv-*` variants exist as shipped by P66-03.

## Typography Utility Decisions

`text-h3` and `text-caption` are widely used across the existing codebase (10+ files, including `liv-welcome.tsx`, `generic-tool-view.tsx`, `liv-design-system.tsx`, several settings sections). They are valid Tailwind tokens defined in the P66-01 type scale. No fallback to `text-sm font-semibold`/`text-xs text-muted-foreground` was needed.

## ErrorBoundary (T-68-05-01)

**Deferred.** React error boundaries are not an established pattern in the AI-chat route surface yet. The threat is rated low (a hostile snapshot causing a render error would degrade the panel surface only — chat thread + composer remain mounted). Documented for future P69 polish where per-tool views (which have richer rendering) might benefit more from a boundary wrapper.

## Sacred File Verification

Pre-task: `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → `4f868d318abff71f8c8bfbcf443b2393a553018b`
Post-task-1: same.
Post-task-2: same.

No edits were made (and none were possible given the plan's `livos/packages/ui/` boundary).

## Upstream Plan Files Untouched

Confirmed not modified during this plan:
- `livos/packages/ui/src/stores/liv-tool-panel-store.ts` (68-01)
- `livos/packages/ui/src/routes/ai-chat/tool-views/dispatcher.tsx` (68-04)
- `livos/packages/ui/src/routes/ai-chat/tool-views/types.ts` (68-02)
- `livos/packages/ui/src/routes/ai-chat/tool-views/generic-tool-view.tsx` (68-02)
- `livos/packages/ui/src/components/motion/SlideInPanel.tsx` (P66-02)
- `livos/packages/ui/src/components/motion/GlowPulse.tsx` (P66-02)
- `livos/packages/ui/src/components/ui/card.tsx` (P66-03)
- `livos/packages/ui/src/shadcn-components/ui/{button,slider,badge}.tsx` (P66-03)

## Mounting Status (Critical Reminder)

**`LivToolPanel` is NOT mounted anywhere yet.** Per CONTEXT scope_guard line 102 and v31-DRAFT, P70 (Composer + Streaming UX Polish) is the plan that wires `<LivToolPanel />` into `ai-chat/index.tsx`. A developer running `pnpm dev` will not see the panel at any URL — this is expected and correct. UAT walk happens post-P70.

The component is rendered in tests via direct mount, exercising the full render path including the SlideInPanel motion wrapper, the Card chrome, the dispatcher (which routes to GenericToolView for all toolNames in P68), and the Slider footer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ResizeObserver missing in jsdom**

- **Found during:** Task 2 (vitest run)
- **Issue:** Radix Slider transitively calls `new ResizeObserver(...)` from `@radix-ui/react-use-size`'s mount-time hook. jsdom (^25.0.1, the project's test environment) does not implement ResizeObserver. 6 of the 8 DOM tests failed with `ReferenceError: ResizeObserver is not defined`.
- **Fix:** Added a minimal no-op polyfill at the top of the test file before any imports run. Stubs the constructor + `observe`/`unobserve`/`disconnect` API surface. Polyfill is gated on `typeof globalThis.ResizeObserver === 'undefined'` so it does not collide with future test setups that may install a real implementation.
- **Files modified:** `livos/packages/ui/src/routes/ai-chat/liv-tool-panel.unit.test.tsx`
- **Commit:** `4f5c0857`

**2. [Rule 3 - Blocking] Card import path drift in plan skeleton**

- **Found during:** Task 1 read_first
- **Issue:** Plan skeleton imports `Card` from `@/shadcn-components/ui/card`. That path does not exist (`shadcn-components/ui/card.tsx` is absent from the codebase). Card lives at `@/components/ui/card`.
- **Fix:** Used the correct path. Documented in component header comment so future readers don't repeat the lookup.
- **Files modified:** `livos/packages/ui/src/routes/ai-chat/liv-tool-panel.tsx`
- **Commit:** included with file's initial creation (see Commit hash + race note below)

**3. [Rule 3 - Convention] Button `size` token name**

- **Found during:** Task 1
- **Issue:** Plan reference skeleton uses `size="icon"` on Buttons. The project's Button cva defines `size: 'icon-only'` (NOT `'icon'`).
- **Fix:** Used `size='icon-only'` per the actual button.tsx variants. Functionally identical.
- **Files modified:** `livos/packages/ui/src/routes/ai-chat/liv-tool-panel.tsx`

**4. [Rule 3 - Plan-Verify Mismatch] data-testid grep quote style**

- **Found during:** Task 1 verify
- **Issue:** Plan's automated verify checks for literal substring `data-testid="liv-tool-panel"` (double-quoted). The codebase prettier config emits single-quoted JSX (`data-testid='liv-tool-panel'`).
- **Fix:** Kept single-quote JSX (codebase convention). Verified the panel via a quote-agnostic grep that accepts either style. The plan's verify grep is a tooling drift, not a code defect.
- **Files modified:** none (verify-tool only)

### Race Condition (Multi-Agent Worktree)

**5. [Race-Mitigation] Task 1 component file committed under another agent's plan message**

- **Found during:** Task 1 commit
- **Issue:** This plan executor was running concurrently with another worktree (agent-a4f58…) that was finishing Plan 73-05. After this executor wrote `liv-tool-panel.tsx` and ran `git add livos/packages/ui/src/routes/ai-chat/liv-tool-panel.tsx`, the parallel agent ran a broader staging operation and committed the file as part of its own commit (`e830bd23 feat(73-05): add RunStore.listRuns for boot-recovery scan`). The file content is exactly mine (verified — 255 lines, header comment intact, all data-testid attributes present); only the commit message belongs to a different plan.
- **Why this happened:** Plan 68-05 explicitly warned about this hazard ("Stage files SPECIFICALLY with `git add <exact path>` — race-mitigation"). The mitigation is one-sided — it prevents this executor from sweeping in a sibling worktree's files, but cannot stop a sibling worktree from sweeping in this executor's files via its own bulk-staging.
- **Fix:** No code change needed — the file is on master with correct content. This SUMMARY documents the orphaned commit-message attribution so future audits understand the mismatch.
- **Files affected:** `livos/packages/ui/src/routes/ai-chat/liv-tool-panel.tsx` is on master at `e830bd23` with mistitled commit; correct attribution recorded here.
- **Commit hash for the component file:** `e830bd23` (under wrong plan label).
- **Commit hash for the test file:** `4f5c0857` (correct: `test(68-05): add LivToolPanel vitest+jsdom RTL-shaped tests`).

## Threat Flags

None. The plan's threat register's STRIDE entries (T-68-05-01..05) are all addressed (T-68-05-01 deferred per above; -02..-05 are accept-disposition by plan). No new security-relevant surface introduced — the panel reads from an in-memory Zustand store and renders dispatched view components against that store.

## Authentication Gates

None encountered.

## Stub Tracking

No stubs introduced. All rendered surfaces are wired to actual store state or dispatcher output. The panel renders nothing visible when closed (correct), an empty-state message when open with no snapshots (correct), and the dispatcher's chosen view (GenericToolView in P68) when a snapshot is focused (correct). No "TODO/FIXME/coming soon" placeholders.

## Self-Check: PASSED

Verified existence + commit landing:

- [x] `livos/packages/ui/src/routes/ai-chat/liv-tool-panel.tsx` — present on disk, 255 lines, on master via commit `e830bd23` (race-mitigated, see Deviation #5)
- [x] `livos/packages/ui/src/routes/ai-chat/liv-tool-panel.unit.test.tsx` — present on disk, 332 lines, on master via commit `4f5c0857`
- [x] Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged — verified pre-task and post-task
- [x] `pnpm --filter ui exec vitest run --reporter=verbose src/routes/ai-chat/liv-tool-panel.unit.test.tsx` exits 0 — 14/14 tests pass (2.83s)
- [x] `pnpm --filter ui build` exits 0 — vite build clean (50.09s)
- [x] No upstream plan files (store, dispatcher, types, GenericToolView, motion primitives, shadcn variants) modified — confirmed via `git status`
- [x] Plan must_haves' truths all present (counted 16/16 satisfied incl. all artifact constraints, key_links, behavior, and footer-slider conditional rendering)

## What's Next

- **68-06** — Cmd+I global keyboard shortcut listener (hooks into the same `useLivToolPanelStore` via `open()`/`close()`/`isOpen`)
- **68-07** — Integration test exercising auto-open → click → close end-to-end via store + LivToolPanel + dispatcher together
- **P70 wiring** — Replace `computer-use-panel.tsx` with `<LivToolPanel />` in `ai-chat/index.tsx`; subscribe `useLivAgentStream` (P67-04) → `handleNewSnapshot` to feed the panel from live SSE.
