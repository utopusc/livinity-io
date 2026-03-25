---
phase: 01-dpi-fix-screenshot-pipeline
verified: 2026-03-25T10:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
human_verification:
  - test: "Click accuracy on 150% DPI display"
    expected: "AI click coordinates land within 5px of the intended button center"
    why_human: "Requires a live HiDPI display and running application — cannot verify the physical click offset programmatically"
---

# Phase 01: DPI Fix & Screenshot Pipeline Verification Report

**Phase Goal:** Screenshots sent to AI match the logical pixel coordinate space that robotjs uses for mouse control, eliminating the DPI mismatch that causes misclicks
**Verified:** 2026-03-25
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                             | Status     | Evidence                                                                                                       |
|----|-----------------------------------------------------------------------------------|------------|----------------------------------------------------------------------------------------------------------------|
| 1  | Screenshot image sent to AI is resized to a known target resolution               | VERIFIED   | `sharp(jpegInput).resize(targetW, targetH, {fit:'fill'})` at agent-core.ts:515-516                            |
| 2  | AI coordinates map to logical screen pixels for robotjs with no DPI mismatch      | VERIFIED   | `toScreenX`: `Math.round(x * (this.logicalScreenW / this.aiTargetW))` at agent-core.ts:572                   |
| 3  | Screenshot metadata reports actual resized dimensions, not claimed/fake dimensions| VERIFIED   | `displayWidth: targetW, displayHeight: targetH` set after actual resize at agent-core.ts:527 — same variables used for `.resize()` call |
| 4  | AI system prompt explicitly states the coordinate space and dimensions            | VERIFIED   | Prompt at nexus/packages/core/src/agent.ts:270-276 contains "displayWidth x displayHeight", "logical screen pixels automatically", "displayWidth=1366, displayHeight=768" |

**Score:** 4/4 truths verified

---

## Required Artifacts

| Artifact                                      | Expected                                                        | Status     | Details                                                                                             |
|-----------------------------------------------|-----------------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------------|
| `agent-app/package.json`                      | sharp dependency + asarUnpack config                           | VERIFIED   | `"sharp": "^0.34.5"` in dependencies; asarUnpack contains `"node_modules/sharp/**"` and `"node_modules/@img/**"` |
| `agent-app/src/main/agent-core.ts`            | Rewritten toolScreenshot with sharp resize, fixed toScreenX/Y  | VERIFIED   | sharp loaded, `.resize()` called, `logicalScreenW/H` and `aiTargetW/H` fields present, correct formula in toScreenX/Y |
| `nexus/packages/core/src/agent.ts`            | Updated system prompt with explicit coordinate space           | VERIFIED   | Contains "logical pixels", "displayWidth x displayHeight", "You do NOT need to account for DPI scaling" |

---

## Key Link Verification

| From                                                      | To                      | Via                                            | Status     | Details                                                                           |
|-----------------------------------------------------------|-------------------------|------------------------------------------------|------------|-----------------------------------------------------------------------------------|
| `agent-core.ts toolScreenshot()`                          | sharp resize pipeline   | `require('sharp')` called on captured JPEG    | WIRED      | `const sharp = require('sharp')` at line 476; `.resize(targetW, targetH, {fit:'fill'})` at line 516 |
| `agent-core.ts toScreenX/toScreenY`                       | robotjs moveMouse       | AI coords scaled to logical screen space       | WIRED      | `logicalScreenW / aiTargetW` formula at lines 571-578; called by `toolMouseClick` and all other mouse tools at lines 586-641 |
| `nexus/packages/core/src/agent.ts`                        | agent-app screenshot output | AI reads prompt then uses displayWidth/displayHeight | WIRED | Prompt at lines 270-276 directly references `displayWidth` and `displayHeight` fields which `toolScreenshot()` returns at line 527 |

---

## Requirements Coverage

| Requirement | Source Plan | Description                                                                          | Status    | Evidence                                                                                              |
|-------------|-------------|--------------------------------------------------------------------------------------|-----------|-------------------------------------------------------------------------------------------------------|
| DPI-01      | 01-01-PLAN  | Agent resizes screenshots from physical to logical pixel dimensions using sharp      | SATISFIED | `sharp(jpegInput).resize(targetW, targetH)` in `toolScreenshot()` — targetW/H derived from logical dimensions via SCALE_TARGETS |
| DPI-02      | 01-01-PLAN  | Screenshot coordinate metadata reports logical dimensions                            | SATISFIED | `width: logicalW, height: logicalH` (logical), `displayWidth: targetW, displayHeight: targetH` (AI target), `physicalWidth/physicalHeight` (raw) — three-tier metadata |
| DPI-03      | 01-01-PLAN  | toScreenX/toScreenY uses 1:1 mapping after proper resize (no broken scaling logic)   | SATISFIED | Formula `x * (logicalScreenW / aiTargetW)` at lines 570-581 — maps target space to logical space; old `screenScaleX/Y` fields fully removed |
| DPI-04      | 01-01-PLAN  | AI system prompt clearly states coordinate space is logical pixels with dimensions   | SATISFIED | agent.ts lines 268-276: "EXACT pixel dimensions", "displayWidth x displayHeight", "logical screen pixels automatically", "You do NOT need to account for DPI scaling" |

**All 4 requirements from PLAN frontmatter satisfied. No orphaned requirements — REQUIREMENTS.md traceability table marks DPI-01 through DPI-04 as Complete for Phase 1.**

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `agent-app/src/main/agent-core.ts` | 335 | `return this.toolScreenshot()` (no `await` keyword) | Info | `executeTool` is `async` so it returns a Promise of the inner async result — the caller `await`s `executeTool` at line 270. The Promise chain is correct but the call site lacks `await` for clarity. No functional impact. |

No blocker or warning anti-patterns found. The single info-level item (missing explicit `await` on `this.toolScreenshot()` inside a switch-case in an async method) does not affect correctness — the Promise propagates correctly to the caller.

---

## Human Verification Required

### 1. Click accuracy on a HiDPI display

**Test:** On a Windows machine configured at 125%, 150%, or 200% display scaling, launch the Livinity Agent, connect it to a session, and use the AI to click a visually distinct button (e.g., the Start menu button or a dialog OK button).
**Expected:** The click lands on the intended target within 5 pixels. The mouse cursor visibly moves to the correct position.
**Why human:** Requires a live HiDPI display and the Electron app running. The coordinate chain correctness can be traced in code but the physical accuracy of robotjs mouse placement cannot be confirmed without real hardware execution.

---

## Gaps Summary

No gaps. All four DPI requirements are fully implemented and wired:

- sharp is installed, loads successfully (`node -e "require('sharp')"` exits 0 with resize test passing), and asarUnpack is configured for Electron bundling.
- `toolScreenshot()` captures via node-screenshots, derives logical dimensions from `physicalW / scaleFactor`, finds the best Anthropic target resolution, and calls `sharp(...).resize(targetW, targetH, {fit:'fill'})` before encoding to JPEG.
- The returned metadata `displayWidth`/`displayHeight` are the same `targetW`/`targetH` variables used in the `.resize()` call — no fake dimensions.
- `toScreenX`/`toScreenY` use the formula `x * (logicalScreenW / aiTargetW)` mapping AI target space to robotjs logical space. The old broken `screenScaleX`/`Y` fields are fully removed.
- The AI system prompt is explicit: "displayWidth x displayHeight", "logical screen pixels automatically", "You do NOT need to account for DPI scaling".
- Both commits (`bb6a1ba`, `c09b240`) are present in git history and match the changes described in SUMMARY.md.

---

_Verified: 2026-03-25_
_Verifier: Claude (gsd-verifier)_
