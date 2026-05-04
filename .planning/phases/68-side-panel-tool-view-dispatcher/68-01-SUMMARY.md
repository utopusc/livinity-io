---
phase: 68
plan: 01
subsystem: ui-state
tags: [zustand, store, side-panel, auto-open, tool-snapshot, vitest]
requirements: [PANEL-01, PANEL-02, PANEL-03]
dependency-graph:
  requires:
    - p67-67-CONTEXT.md (D-12 ToolCallSnapshot shape — locally re-declared per CONTEXT D-14)
    - zustand@^5.0.2 (existing dep)
    - vitest@^2.1.9 (existing dep)
  provides:
    - useLivToolPanelStore (Zustand hook — state + 7 actions)
    - isVisualTool helper + VISUAL_TOOL_PATTERN constant
    - ToolCallSnapshot type (re-exported)
    - NavigationMode type
    - LivToolPanelStore interface (binding contract for 68-02..68-07)
  affects:
    - 68-02 (LivToolPanel component) — consumes the hook
    - 68-06 (Cmd+I shortcut) — calls open()/close()
    - 68-07 (integration test) — exercises handleNewSnapshot algorithm end-to-end
    - 70 (P70 chat-messages wiring) — calls openPanelAt(toolId) via open(toolId)
tech-stack:
  added: []
  patterns:
    - "Zustand v5 named-export `create()` factory (no persist) — matches environment-store.ts minus persist"
    - "Vitest beforeEach reset pattern — store.getState().reset() prevents cross-test pollution"
key-files:
  created:
    - livos/packages/ui/src/stores/liv-tool-panel-store.ts (184 LOC)
    - livos/packages/ui/src/stores/liv-tool-panel-store.unit.test.ts (369 LOC)
  modified: []
decisions:
  - "Visual-tool regex extracted to VISUAL_TOOL_PATTERN constant + exported alongside isVisualTool — improves test ergonomics and makes the locked product decision (STATE.md line 79) discoverable via grep"
  - "Local re-declaration of ToolCallSnapshot in store file per CONTEXT D-14 — P67-04 shipped its own re-declaration in liv-agent-types.ts but P67 has not exported from `@nexus/core` for UI consumption yet; aligning here when P67 ships package exports"
  - "All 7 store actions implemented as inline arrow functions inside `create()` factory (matches environment-store.ts style); initialState extracted as module-level const so reset() can spread it without rebuilding the action set"
  - "22 unit tests instead of the 12-minimum: covered every branch of handleNewSnapshot algorithm (6 expected + 2 extra: visual+open+manual non-advance, missing-toolId fallback in open()) — algorithm is the LOCKED product behavior so test density is justified"
metrics:
  duration: "~30 minutes"
  completed-date: "2026-05-04"
  task-count: 2
  test-count: 22
  loc-added: 553
---

# Phase 68 Plan 01: useLivToolPanelStore Zustand Store Summary

LivToolPanel state machine — Zustand hook with auto-open algorithm honoring STATE.md line 79 (visual tools ONLY) — shipped as the foundation for Phase 68-02..68-07.

## What Was Built

### `livos/packages/ui/src/stores/liv-tool-panel-store.ts` (184 LOC)

Zustand v5 store with:

- **State (CONTEXT D-10):** `isOpen`, `navigationMode: 'live' | 'manual'`, `internalIndex`, `userClosed`, `lastVisualToolId`, `snapshots[]`
- **Actions (CONTEXT D-10):** `open(toolId?)`, `close()`, `goToIndex(idx)`, `goLive()`, `handleNewSnapshot(snapshot)`, `setSnapshots(snapshots)`, `reset()`
- **Helper:** `isVisualTool(toolName: string): boolean` — exported as a free function so tests hammer it deterministically
- **Constant:** `VISUAL_TOOL_PATTERN = /^(browser-|computer-use-|screenshot)/` (verbatim from CONTEXT D-05; STATE.md line 79 LOCKED — DO NOT WIDEN)
- **Types exported:** `ToolCallSnapshot`, `NavigationMode`, `LivToolPanelStore` interface

Implements `handleNewSnapshot` per CONTEXT D-11 verbatim:
1. Append snapshot (or replace by `toolId` per P67 D-15 dedupe)
2. Classify visual / non-visual via `isVisualTool`
3. **Visual:** record `lastVisualToolId`; if closed → auto-open + reset `userClosed=false`; if open + live → auto-advance index
4. **Non-visual:** if open + live → auto-advance index; **NEVER** change `isOpen`

NO `persist` middleware (CONTEXT D-09 — store is in-memory, refresh resets state).

### `livos/packages/ui/src/stores/liv-tool-panel-store.unit.test.ts` (369 LOC, 22 tests)

Vitest unit tests with `beforeEach(reset)` pattern. Every test passes (381ms wall-clock).

#### Coverage

| describe block | tests | maps to |
| --- | --- | --- |
| `isVisualTool (D-05)` | 4 | browser-/computer-use-/screenshot prefixes + negative cases (incl. regex anchor edge `do-browser-thing` → false) |
| `initial state` | 1 | D-10 — initial state shape |
| `open (D-13)` | 4 | tail-live, toolId-targeted-manual, missing-id fallback, empty-snapshots |
| `close (D-08)` | 1 | sticky `userClosed=true` |
| `goToIndex (D-12)` | 2 | manual when idx<tail, live when idx===tail |
| `goLive` | 1 | pin to tail in live mode |
| `handleNewSnapshot (D-11)` | 8 | visual+closed → opens & resets; non-visual+closed → no-op; non-visual+open+live → advance; non-visual+open+manual → no advance; toolId dedupe; visual+user-closed → re-open; visual+open+live → advance; visual+open+manual → don't advance but track lastVisualToolId |
| `reset` | 1 | full state restoration |

All 6 `handleNewSnapshot` scenarios from CONTEXT D-11 are tested (plus 2 bonus scenarios for completeness).

## Confirmations

- **Visual-tool regex:** `/^(browser-|computer-use-|screenshot)/` — exactly matches CONTEXT D-05 / STATE.md line 79.
- **Sacred file SHA:** `4f868d318abff71f8c8bfbcf443b2393a553018b` (start) → `4f868d318abff71f8c8bfbcf443b2393a553018b` (end). Unchanged. Verified twice.
- **Build:** `pnpm --filter ui build` exits 0 (35.32s, vite 4.5.x).
- **Tests:** `pnpm --filter ui exec vitest run --reporter=verbose src/stores/liv-tool-panel-store.unit.test.ts` exits 0 — 22/22 pass in 381ms.
- **No broker / chat UI / sacred file touched:** `git status` confirms only the 2 new files in `livos/packages/ui/src/stores/`.

## Commits

| Task | Commit | Type | Files |
| ---- | ------ | ---- | ----- |
| 1: Implement store + isVisualTool helper | `3676aba5` | feat | `liv-tool-panel-store.ts` (184 LOC) |
| 2: Vitest unit tests | `8e9a0653` | test | `liv-tool-panel-store.unit.test.ts` (369 LOC) |

## Deviations from Plan

None — plan executed exactly as written.

Two minor judgement calls (within plan's "Claude's Discretion" envelope):

1. **22 tests instead of 12:** Plan said "12+, you may add more." Algorithm is locked product behavior; extra tests cover (a) regex anchor edge case (`do-browser-thing` must NOT match), (b) `open()` fallback when `toolId` not in snapshots, (c) `open()` on empty snapshots edge, (d) `visual+open+manual` (don't advance, but DO update `lastVisualToolId`).
2. **Counter-based `toolId` generator:** Plan suggested `Math.random().toString(36).slice(2, 8)` but a monotonically-incrementing counter (`'tool-' + counter++`) is more deterministic for snapshots that might collide otherwise. Tests are deterministic regardless.

## TDD Gate Compliance

Plan's tasks have `tdd="true"` but the plan structure is "store first, then tests" (Task 1 = implementation, Task 2 = tests) — not classic RED→GREEN. This is intentional per the plan's `<action>` blocks: Task 1 includes a `pnpm --filter ui build` gate (type-check), Task 2 then writes tests against a stable signature. Both tasks committed individually with appropriate `feat(...)` and `test(...)` types.

The store's `handleNewSnapshot` algorithm was implemented directly from the verbatim spec in CONTEXT D-11, then verified test-driven against 22 cases without iteration — algorithm is correct on first pass.

## Threat Flags

None. Store is pure client-side state; no new network surface, no auth boundary, no schema changes.

## Self-Check: PASSED

- File `livos/packages/ui/src/stores/liv-tool-panel-store.ts` exists ✓ (184 LOC, contains `useLivToolPanelStore`, `isVisualTool`, `VISUAL_TOOL_PATTERN`, `handleNewSnapshot`, all 7 actions, regex `/^(browser-|computer-use-|screenshot)/`)
- File `livos/packages/ui/src/stores/liv-tool-panel-store.unit.test.ts` exists ✓ (369 LOC, 22 `it(...)` blocks)
- Commit `3676aba5` exists in `git log` ✓
- Commit `8e9a0653` exists in `git log` ✓
- Sacred file SHA unchanged: `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓
- `pnpm --filter ui build` exits 0 ✓
- `pnpm --filter ui exec vitest run --reporter=verbose src/stores/liv-tool-panel-store.unit.test.ts` exits 0 with 22/22 ✓

## Hand-off to Downstream Plans

| Consumer | What it imports | Where |
| -------- | --------------- | ----- |
| 68-02 LivToolPanel component | `useLivToolPanelStore`, `ToolCallSnapshot`, `NavigationMode` | hook + reading state |
| 68-04 GenericToolView | `ToolCallSnapshot` | type-only import |
| 68-05 InlineToolPill | `useLivToolPanelStore.open(toolId)` | click handler |
| 68-06 Cmd+I shortcut | `useLivToolPanelStore.open() / close()` | keyboard listener |
| 68-07 integration test | `useLivToolPanelStore`, `isVisualTool` | end-to-end behavior |
| 70 chat wiring | `useLivToolPanelStore.handleNewSnapshot`, `setSnapshots` | called from useLivAgentStream subscriber |

The store API is complete and stable. No store changes anticipated for 68-02..68-07.
