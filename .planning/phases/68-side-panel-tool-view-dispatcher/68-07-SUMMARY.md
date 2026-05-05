---
phase: 68-side-panel-tool-view-dispatcher
plan: 07
subsystem: liv-tool-panel
tags: [integration-test, auto-open, e2e-store-panel, locked-decision-verification, end-of-phase-gate]
requires:
  - "68-01 (store + handleNewSnapshot + isVisualTool)"
  - "68-02 (GenericToolView + ToolView types)"
  - "68-04 (useToolView dispatcher)"
  - "68-05 (LivToolPanel component + close button + slider chrome)"
  - "68-06 (useLivToolPanelShortcut Cmd+I listener)"
provides:
  - "End-to-end regression protection for STATE.md line 79 (locked auto-open ruling)"
  - "End-of-phase verification gate confirming P68 is shippable"
affects:
  - "P70 wiring confidence: <LivToolPanel /> can mount in ai-chat/index.tsx with the auto-open contract verified"
tech-stack:
  added: []
  patterns:
    - "react-dom/client + HookProbe harness mimicking RTL render/screen/fireEvent/waitFor (D-NO-NEW-DEPS, established 68-05/68-06)"
    - "Real-store integration testing — no mocks for store/panel/shortcut/dispatcher"
    - "ResizeObserver polyfill for jsdom + Radix Slider compatibility (Rule 3 auto-fix carried from 68-05)"
key-files:
  created:
    - "livos/packages/ui/src/routes/ai-chat/liv-tool-panel.integration.test.tsx (391 lines, 8 integration tests)"
  modified: []
decisions:
  - "Used react-dom/client harness instead of @testing-library/react — D-NO-NEW-DEPS, established 68-05/68-06 precedent. Helpers shaped 1:1 with RTL API for future drop-in swap."
  - "Implemented waitFor() locally (16ms poll, 1000ms timeout) — matches RTL semantics, handles AnimatePresence exit cycles without flake (T-68-07-02 mitigation)."
  - "Test names embed CAPS-LOCKED phrases from STATE.md line 79 contract — failure logs immediately point to the violated decision (T-68-07-03)."
  - "All 8 must_haves covered exactly: AUTO-OPEN, NO AUTO-OPEN, USER-CLOSED STICKY, VISUAL RE-OPEN, MANUAL OPEN, LIVE-MODE ADVANCE, CMD+I, DEDUPE."
metrics:
  duration: "~15 minutes"
  completed: "2026-05-04"
  tests-pass: "8/8"
  test-file-lines: 391
---

# Phase 68 Plan 07: LivToolPanel Integration Tests Summary

End-to-end integration test suite verifying the LOCKED auto-open behavior contract from STATE.md line 79 — exercises real Zustand store + real LivToolPanel + real Cmd+I shortcut hook + real dispatcher pipeline through 8 caps-named scenarios.

## What Shipped

- **`livos/packages/ui/src/routes/ai-chat/liv-tool-panel.integration.test.tsx`** (NEW, 391 lines) — 8 integration tests covering:
  1. `VISUAL TOOL AUTO-OPEN — browser-* snapshot opens panel even when previously closed`
  2. `NON-VISUAL TOOL DOES NOT AUTO-OPEN — execute-command snapshot keeps panel closed`
  3. `USER-CLOSED PANEL STAYS CLOSED FOR NON-VISUAL TOOLS`
  4. `NEW VISUAL TOOL RE-OPENS PANEL EVEN AFTER USER-CLOSE`
  5. `MANUAL OPEN VIA store.open(toolId) WORKS FOR NON-VISUAL TOOLS`
  6. `LIVE-MODE AUTO-ADVANCE applies to all categories once panel is open`
  7. `CMD+I CLOSES PANEL FROM AUTO-OPEN STATE AND SETS userClosed (regression for 68-06)`
  8. `SAME VISUAL TOOL DISPATCHED TWICE → DEDUPED, panel still open (regression for 68-01)`

## Test Result

**8/8 integration tests PASS** (vitest run, ~3.7s, jsdom environment).

```
✓ src/routes/ai-chat/liv-tool-panel.integration.test.tsx
  ✓ P68 Integration — Auto-Open Behavior (STATE.md line 79 LOCKED)
    ✓ VISUAL TOOL AUTO-OPEN
    ✓ NON-VISUAL TOOL DOES NOT AUTO-OPEN
    ✓ USER-CLOSED PANEL STAYS CLOSED FOR NON-VISUAL TOOLS
    ✓ NEW VISUAL TOOL RE-OPENS PANEL EVEN AFTER USER-CLOSE
    ✓ MANUAL OPEN VIA store.open(toolId) WORKS FOR NON-VISUAL TOOLS
    ✓ LIVE-MODE AUTO-ADVANCE applies to all categories once panel is open
    ✓ CMD+I CLOSES PANEL FROM AUTO-OPEN STATE AND SETS userClosed
    ✓ SAME VISUAL TOOL DISPATCHED TWICE → DEDUPED, panel still open
```

Pre-existing act() warnings from Radix Slider mount inside AnimatePresence (T-68-07-02 noise — also present in 68-05 unit tests) are non-fatal; tests pass cleanly.

## Prior P68 Plan Test Result (Regression Check)

| Plan | Test File | Result |
|------|-----------|--------|
| 68-01 | `src/stores/liv-tool-panel-store.unit.test.ts` | PASS |
| 68-02 | `src/routes/ai-chat/tool-views/generic-tool-view.unit.test.tsx` | PASS |
| 68-03 | `src/components/inline-tool-pill.unit.test.tsx` | PASS |
| 68-04 | `src/routes/ai-chat/tool-views/dispatcher.unit.test.tsx` | **FAIL — out of scope** (see Deferred Issues) |
| 68-05 | `src/routes/ai-chat/liv-tool-panel.unit.test.tsx` | **FAIL — out of scope** (see Deferred Issues) |
| 68-06 | `src/hooks/use-liv-tool-panel-shortcut.unit.test.ts` | PASS |

Net: **4/6 prior P68 unit suites pass; 2 fail due to parallel-wave Phase 69 in-flight changes** that swapped specialized tool-views (CommandToolView, McpToolView, etc.) into the dispatcher. These failures are NOT caused by 68-07 — `git status` confirms my plan only added a single new file (`liv-tool-panel.integration.test.tsx`) and made no modifications elsewhere. See Deferred Issues below.

## Build Status

`pnpm --filter ui build` exits **0** (33.07s, PWA generated, 202 precache entries). No TypeScript errors. No vite warnings introduced by the new test file.

## Sacred SHA Verification

`nexus/packages/core/src/sdk-agent-runner.ts` SHA at start AND end: **`4f868d318abff71f8c8bfbcf443b2393a553018b`** — UNCHANGED.

## End-of-Phase P68 Contract Verification

ROADMAP P68 success criteria mapping (each criterion to which integration test verifies it):

| ROADMAP Criterion | Verified By | Notes |
|-------------------|-------------|-------|
| #1 Visual tools auto-open the side panel | Test 1 (VISUAL TOOL AUTO-OPEN) + Test 4 (NEW VISUAL TOOL RE-OPENS) | Covers both first-open and post-close re-open paths |
| #2 Non-visual tools never auto-open | Test 2 (NON-VISUAL TOOL DOES NOT AUTO-OPEN) + Test 3 (USER-CLOSED STAYS CLOSED) | Covers cold-start and post-close states |
| #3 User can manually open any tool via inline pill click | Test 5 (MANUAL OPEN VIA store.open(toolId)) | Verifies open(toolId) → manual mode + correct index |
| #4 Cmd+I global toggle works | Test 7 (CMD+I CLOSES PANEL FROM AUTO-OPEN STATE) | Regression for 68-06; verifies userClosed sticky flag flips |

Bonus regression coverage: Test 6 verifies live-mode auto-advance is category-agnostic once open (D-11 step 4); Test 8 verifies toolId-based snapshot dedupe (D-15) does not flicker the panel.

## Deviations from Plan

**None caused by my plan.** Plan executed exactly as written. The integration test file matches the reference skeleton in `<reference_test_skeleton>` and all 8 must_haves are covered.

The act() warnings in test output are pre-existing noise from Radix Slider's internal state updates inside framer-motion's AnimatePresence — they predate 68-07 and are present in 68-05 unit tests too. T-68-07-02 documents this as known-flake-resistant since `waitFor()` handles it.

## Deferred Issues (out of scope per `<scope_guard>`)

Two prior-plan unit tests fail at the time 68-07 ships, BOTH caused by parallel-wave Phase 69 (Per-Tool Views Suite) in-flight changes that landed specialized tool-views in the dispatcher:

1. **`src/routes/ai-chat/tool-views/dispatcher.unit.test.tsx`** — 4 failures. The dispatcher now returns `CommandToolView` for `'execute-command'` and `McpToolView` for `'mcp_brave_search'` (etc.), but this test still expects `GenericToolView` for those routes. The test file was modified by the Phase 69 agent (`git diff --stat` shows `+106 -25` lines) but the assertions still mismatch the new implementation.
2. **`src/routes/ai-chat/liv-tool-panel.unit.test.tsx`** — 1 failure. The "renders dispatched view when snapshot present" test asserts `body.querySelector('[data-testid="liv-generic-tool-view"]')` non-null after dispatching `execute-command`, but the dispatcher now routes that to CommandToolView (testid `liv-command-tool-view`).

Per the plan's `<scope_guard>` ("DO NOT modify any prior plan's source file") and the executor SCOPE BOUNDARY rule ("Only auto-fix issues DIRECTLY caused by the current task's changes"), these failures are deferred. They are caused by Phase 69's parallel-wave work and must be fixed in that phase's gap-closure plan, not here.

**Action for Phase 69**: update `dispatcher.unit.test.tsx` assertions to match the specialized routing it implements; update `liv-tool-panel.unit.test.tsx` line 233 to look for `liv-command-tool-view` instead of `liv-generic-tool-view` (or add a `category: 'generic'` snapshot to that test so it stays GenericToolView-routed).

## Post-Plan Recommendations

P68 is **shippable as a contract**. The locked auto-open behavior is now regression-protected by 8 integration tests. Recommended next steps for the orchestrator:

1. **Mark P68 complete in STATE.md** — all 7 plans (68-01..68-07) have shipped; the synthetic requirement `PANEL-AUTO-OPEN-E2E` is implemented and verified.
2. **Coordinate Phase 69 to fix the 5 deferred unit-test failures** — single-line testid renames + assertion updates; not a 68-07 responsibility.
3. **Phase 70 (Composer Polish) and Phase 69 (Per-Tool Views Suite) can run in parallel** after P68's contract is locked. P70 specifically can mount `<LivToolPanel />` inside `ai-chat/index.tsx` with confidence the auto-open contract is correct.

## Self-Check: PASSED

- Created file exists: `livos/packages/ui/src/routes/ai-chat/liv-tool-panel.integration.test.tsx` — FOUND
- Commit exists: `2d4131d6` — FOUND
- Sacred SHA: `4f868d318abff71f8c8bfbcf443b2393a553018b` — UNCHANGED
- Build: PASS
- Integration tests: 8/8 PASS
- Plan deferred issues documented: YES (2 prior-plan failures attributed to Phase 69 parallel work)
