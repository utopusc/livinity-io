---
phase: 72-computer-use-agent-loop
plan: native-02
subsystem: computer-use/native
tags: [computer-use, bytebot, native-port, input, mouse, keyboard, nut-js]
requires:
  - "@nut-tree-fork/nut-js@^4.2.6 (already installed by 72-native-01)"
  - native/screenshot.ts barrel slot (72-native-01)
provides:
  - native/input.ts — 11 pure async functions matching 72-01 BYTEBOT_TOOLS schemas verbatim
  - native/index.ts — barrel re-export of input + screenshot + window
affects:
  - 72-native-05 MCP server (binding contract: 11 functions importable from native barrel)
tech-stack:
  added: []
  patterns:
    - String→nut-js enum translation at the input boundary (BUTTON_MAP + resolveKey)
    - withHeldKeys press-then-action-then-release-reversed wrapper
    - tryXclipCopy spawn fallback to keyboard.type (D-NATIVE-02)
    - isSensitive log redaction (T-72N2-01 mitigation)
key-files:
  created:
    - livos/packages/livinityd/source/modules/computer-use/native/input.ts
    - livos/packages/livinityd/source/modules/computer-use/native/input.test.ts
  modified:
    - livos/packages/livinityd/source/modules/computer-use/native/index.ts
decisions:
  - "Released held keys in REVERSE order (modifier-last release) — matches upstream Bytebot pattern + most app expectations."
  - "pasteText sends Ctrl+V via raw pressKey/releaseKey (NOT keyboard.type(Key.LeftControl, Key.V)) — symmetric with typeKeys, doesn't disturb agent-held modifiers."
  - "dragMouse: pressButton FIRST then walk all path points (including first), then releaseButton. ALL position events enclosed by button-down."
  - "Sleep helper uses global setTimeout (NOT node:timers/promises) so vitest fake timers can advance through delays without real wall time."
  - "isSensitive=true logs `[REDACTED — typed N chars sensitive]` / `[REDACTED — pasted N chars sensitive]` via console.log (no logger import — keeps file dependency surface minimal; per-daemon logger wrap is 72-native-05's job)."
  - "RED test commit + GREEN impl commit kept separate per TDD discipline even though plan packs both into one tdd task."
metrics:
  duration: "~10 min wall clock"
  completed: "2026-05-05"
---

# Phase 72 Plan native-02: Native Input Primitives Summary

11 pure async functions wrapping `@nut-tree-fork/nut-js` mouse + keyboard + cursor APIs, matching the 72-01 BYTEBOT_TOOLS schemas verbatim — the action surface that 72-native-05's MCP server will dispatch to.

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `livos/packages/livinityd/source/modules/computer-use/native/input.ts` | 398 | 11 input primitives + Apache 2.0 attribution + helpers |
| `livos/packages/livinityd/source/modules/computer-use/native/input.test.ts` | 465 | 21 vitest cases (12+ minimum), all nut-js + child_process mocked |

## Files Modified

| File | Change |
|------|--------|
| `livos/packages/livinityd/source/modules/computer-use/native/index.ts` | Replaced `// 72-native-02 input.ts barrel append here` placeholder with `export * from './input.js'` |

## Export Signatures (Binding Contract for 72-native-05)

```typescript
export interface Coords { x: number; y: number }
export type ButtonName = 'left' | 'right' | 'middle'
export type ScrollDirection = 'up' | 'down' | 'left' | 'right'
export type PressMode = 'up' | 'down'

export async function moveMouse(coordinates: Coords): Promise<void>
export async function traceMouse(path: readonly Coords[], holdKeys?: readonly string[]): Promise<void>
export async function clickMouse(opts: { coordinates?: Coords; button: ButtonName; clickCount: number; holdKeys?: readonly string[] }): Promise<void>
export async function pressMouse(opts: { coordinates?: Coords; button: ButtonName; press: PressMode }): Promise<void>
export async function dragMouse(path: readonly Coords[], button: ButtonName, holdKeys?: readonly string[]): Promise<void>
export async function scroll(opts: { coordinates: Coords; direction: ScrollDirection; scrollCount: number; holdKeys?: readonly string[] }): Promise<void>
export async function typeKeys(keys: readonly string[], delay?: number): Promise<void>
export async function pressKeys(keys: readonly string[], press: PressMode): Promise<void>
export async function typeText(text: string, delay?: number, isSensitive?: boolean): Promise<void>
export async function pasteText(text: string, isSensitive?: boolean): Promise<void>
export async function getCursorPosition(): Promise<Coords>
```

## Test Coverage

21 vitest cases (well above 12 minimum):

| Test | Behavior |
|------|----------|
| T1 | All 11 named exports are functions |
| T2 | moveMouse calls mouse.setPosition with Point(100, 200) |
| T3 | clickMouse setPosition then click(LEFT) twice for clickCount=2 |
| T4 | clickMouse with holdKeys: pressKey BEFORE click, releaseKey AFTER |
| T4b | clickMouse with no coordinates skips setPosition (current cursor) |
| T5 | dragMouse pressButton → setPosition through path → releaseButton |
| T6 | scroll direction=down → scrollDown(3) (NOT scrollUp/Left/Right) |
| T7 | typeKeys press in given order, release in REVERSE order |
| T8 | typeText with delay>0 calls keyboard.type per character with delay between |
| T8b | typeText without delay does single keyboard.type call |
| T9 | pasteText isSensitive=true logs REDACTED (no raw text) |
| T10 | pasteText happy path: spawns xclip + sends Ctrl+V via keyboard |
| T11 | pasteText ENOENT fallback to keyboard.type |
| T11b | pasteText non-zero exit fallback to keyboard.type |
| T12 | getCursorPosition returns plain {x, y} |
| T13 | Invalid holdKey name throws clear error mentioning the key |
| T14 | traceMouse walks setPosition through each point with holdKeys |
| T15 | pressMouse press=down calls pressButton(RIGHT) |
| T15b | pressMouse press=up calls releaseButton(MIDDLE) |
| T16 | pressKeys press=up calls releaseKey(LeftAlt) |
| T16b | pressKeys press=down calls pressKey(LeftControl, A) |

**Result:** 21/21 pass (~12 ms). Verified twice for idempotency (Task 1 GREEN gate + Task 3 final).

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `9880bab1` | test | RED: failing tests for native input primitives |
| `f66610a7` | feat | GREEN: 11 input primitives implementation |
| `294d9698` | feat | Barrel append: `export * from './input.js'` |

## Decision Log

### pasteText Ctrl+V API choice

Used **`keyboard.pressKey(Key.LeftControl, Key.V)` + `keyboard.releaseKey(Key.V, Key.LeftControl)`** rather than `keyboard.type(Key.LeftControl, Key.V)`.

Reason: symmetric with `typeKeys` (which also uses pressKey/releaseKey for combo), and keeps Ctrl+V from interfering with any modifier the agent already had held. `keyboard.type(Key, ...)` semantics in nut-js are press+release-each-key, which would not work as a combo (the Ctrl release would happen before V is pressed).

### holdKeys ordering

Press order: provided order (e.g. `['LeftControl', 'LeftShift']` → press LeftControl, LeftShift in that order).
Release order: **REVERSED** (LeftShift, LeftControl).

Rationale: matches upstream Bytebot pattern + standard expectation that modifiers are released last. Wrapped in try/finally so a thrown action doesn't leak held keys.

### isSensitive log shape

`[REDACTED — typed N chars sensitive]` for typeText, `[REDACTED — pasted N chars sensitive]` for pasteText. Output via `console.log` (not a logger import — minimizes file's dependency surface; the per-daemon structured logger is 72-native-05's responsibility to thread through). T9 asserts the raw text never appears in logs even with isSensitive=true.

### dragMouse path enclosure

`pressButton` first, then walk **all** path points (including the first), then `releaseButton`. Plan must-have specified `pressButton(LEFT) → setPosition through path → releaseButton(LEFT)` — first iteration of impl had setPosition(first) **before** pressButton (anchor-first pattern), which broke T5. Corrected to enclose all positions inside the button-held window so drag-with-modifier and drag-and-select work as users expect.

### sleep helper choice

Used `setTimeout(resolve, ms)` via global `setTimeout` rather than `node:timers/promises` setTimeout. Reason: vitest's `vi.useFakeTimers()` cleanly fakes the global, but `node:timers/promises` is harder to fake reliably across versions. T8 timing assertion (per-character delay with `vi.advanceTimersByTimeAsync`) is the test that drove this decision.

### Mock signature width for TS tuple types

Test mocks initially declared as `vi.fn(async () => undefined)` with no parameter type. TypeScript inferred `mock.calls` as `[][]` (empty tuples), making `.calls[0]![0]` a TS2493 error. Fixed by parameterizing each mock: `vi.fn(async (_pt: {x:number; y:number}) => undefined)`. Zero typecheck errors in the new files post-fix.

## Sacred File

`nexus/packages/core/src/sdk-agent-runner.ts` SHA confirmed `4f868d318abff71f8c8bfbcf443b2393a553018b` at:
- Task 1 start (before any new file)
- Task 1 GREEN end (after impl committed)
- Task 2 end (after barrel committed)
- Task 3 final verify

D-NATIVE-15 honored.

## Threat Model Status (from plan)

| Threat | Mitigation | Status |
|--------|------------|--------|
| T-72N2-01 (Info disclosure via typed/pasted text logs) | isSensitive=true log redaction | Implemented + T9 enforces |
| T-72N2-02 (xclip stdin tampering) | Fixed argv `['-selection','clipboard']`, text via stdin only | Implemented |
| T-72N2-03 (Native binding EoP) | Documented architecture (livinityd-as-root drives host X) | Accepted per D-NATIVE-09 |
| T-72N2-04 (Malformed Key DoS) | resolveKey throws clear error | Implemented + T13 enforces |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] sleep helper switched from node:timers/promises to global setTimeout wrapper**
- **Found during:** Task 1 GREEN initial run (T8 typeText delay test)
- **Issue:** `node:timers/promises` setTimeout doesn't reliably play with vitest fake timers under the project's vitest 2.1.9 + Node 22 combo; T8 hung at 1/2 expected calls.
- **Fix:** Replaced `import {setTimeout as sleep} from 'node:timers/promises'` with a tiny `function sleep(ms) { return new Promise<void>(r => setTimeout(r, ms)) }` helper using the global setTimeout. Behaviorally identical at runtime; testable with fake timers.
- **Files modified:** input.ts (sleep helper definition)
- **Commit:** `f66610a7` (already squashed into the GREEN commit before push)

**2. [Rule 3 - Blocking] dragMouse path enclosure correction**
- **Found during:** Task 1 GREEN initial run (T5 drag ordering test)
- **Issue:** Initial impl had `setPosition(first) → pressButton → setPosition(rest...) → releaseButton` (anchor-first pattern). T5 expected `pressButton → setPosition[all] → releaseButton` per plan must-have.
- **Fix:** Moved pressButton BEFORE the first setPosition; loop now walks all points (including first) inside the button-held window.
- **Files modified:** input.ts (dragMouse function body)
- **Commit:** `f66610a7` (squashed into GREEN before push)

**3. [Rule 3 - Blocking] Mock function signature widening for TS tuple types**
- **Found during:** Task 1 typecheck after GREEN
- **Issue:** `vi.fn(async () => undefined)` made mock.calls typed as `[][]`, breaking TS access to `.calls[0]![0]`.
- **Fix:** Parameterized each mock with `_pt`/`_btn`/`_n`/`...args` placeholder params so TS infers tuple element types correctly.
- **Files modified:** input.test.ts (mouseMock + keyboardMock declarations)
- **Commit:** Folded into RED commit `9880bab1` before push.

### Architectural Choices Documented (not deviations)

- 72-native-01 was already shipping in parallel; the barrel's screenshot exports + 72-native-03's `export * from './window.js'` line landed between Task 1 and Task 2 inside this same execution. Final barrel state has all three: `captureScreenshot` + `* from input` + `* from window`. No coordination conflict.
- The plan's `<destructive_git_prohibition>` rule was honored: only the three intended files were staged per commit. `git add livos/packages/livinityd/source/modules/computer-use/native/input.test.ts` etc. (specific paths, never `git add .`). 72-native-01 + 72-native-03 sibling commits flowed through their own commit messages.

## Verification Status

- 21/21 input.test.ts cases pass (Task 1 GREEN + Task 3 idempotency)
- pnpm typecheck on `computer-use/native/` directory: **0 errors** in new files (pre-existing baseline errors in unrelated user/widgets/utilities files predate this plan)
- Barrel exports: `captureScreenshot` (from 72-native-01) + 11 input functions (this plan) + window functions (72-native-03) all reachable via `from './native/index.js'`
- Sacred SHA `4f868d31...`: confirmed unchanged across 4 verification gates

## Note on Real Hardware Verification

These primitives are unit-tested with mocked `@nut-tree-fork/nut-js`. Real input dispatch on the Mini PC's X server (display :0) is **not** verified by this plan — it is the explicit responsibility of **72-native-07** (UAT plan) to confirm:
- nut-js native binding loads on Mini PC (Ubuntu 24.04)
- Mouse moves visibly happen on the screen
- Keyboard types reach the focused window
- Ctrl+V paste works after xclip-installed
- Fallback path activates cleanly if xclip missing

This plan ships the API surface; 72-native-07 ships the live confidence.

## Self-Check: PASSED

- All 3 created/modified files exist on disk (input.ts, input.test.ts, index.ts)
- All 3 commits present in git history (`9880bab1`, `f66610a7`, `294d9698`)
- input.ts: 398 lines (above 200 minimum, contains `moveMouse`)
- input.test.ts: 465 lines (above 200 minimum, contains `moveMouse`)
- index.ts: 13 lines (above 5 minimum, contains `input`)
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged
