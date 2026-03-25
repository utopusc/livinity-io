---
phase: 03-ai-prompt-optimization-hybrid-mode
verified: 2026-03-25T09:54:33Z
status: passed
score: 5/5 must-haves verified
---

# Phase 03: AI Prompt Optimization & Hybrid Mode Verification Report

**Phase Goal:** AI uses accessibility tree element coordinates as its primary targeting method, only falling back to screenshot pixel analysis when no matching element exists
**Verified:** 2026-03-25T09:54:33Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | AI system prompt instructs to call screen_elements before any mouse action and use element coordinates with raw:true | VERIFIED | `agent.ts` line 267: "Elements first: Call device_*_screen_elements"; line 285: "ALWAYS pass raw:true to mouse_click/move/drag/scroll" |
| 2   | AI system prompt describes hybrid flow: element coords first, screenshot fallback only when no matching element | VERIFIED | `agent.ts` lines 263-275: "The Elements-First Workflow" section with explicit "Fall back to screenshots ONLY when:" |
| 3   | toolScreenElements() computes a hash of the element list and stores it as lastElementHash | VERIFIED | `agent-core.ts` line 748: `this.lastElementHash = createHash('sha256').update(text).digest('hex')` |
| 4   | toolScreenshot() returns cached screenshot when lastElementHash matches current hash (tree unchanged) | VERIFIED | `agent-core.ts` lines 611-632: cache check re-queries UIA, compares hash, returns early with cached data |
| 5   | Cached screenshot includes a cached:true indicator in the response | VERIFIED | `agent-core.ts` line 624: `data: { ...this.lastScreenshotData, cached: true }` |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `nexus/packages/core/src/agent.ts` | Rewritten Computer Use prompt section with accessibility-first hybrid flow | VERIFIED | Contains "The Elements-First Workflow" section (lines 263-291). Old "Screenshot-Analyze-Act-Verify Loop" removed (0 matches). `screen_elements` referenced 7 times across tool list and prompt body. |
| `agent-app/src/main/agent-core.ts` | Hash-based screenshot caching tied to accessibility tree changes | VERIFIED | `createHash` imported (line 7), 4 cache instance variables declared (lines 598-601), hash computed in `toolScreenElements()` (line 748), cache check + early return in `toolScreenshot()` (lines 611-632), cache populated after fresh capture (lines 683-692). |

---

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `nexus/packages/core/src/agent.ts` | agent-app screen_elements tool | AI prompt references `device_*_screen_elements` tool by name | WIRED | 7 matches for `screen_elements` in `agent.ts`: 1 in tool list (line 254), 6 in prompt body including "Elements first: Call device_*_screen_elements" |
| `agent-core.ts toolScreenshot()` | `agent-core.ts toolScreenElements()` | shared `lastElementHash` instance variable for cache invalidation | WIRED | `lastElementHash` assigned in `toolScreenElements()` (line 748), read in `toolScreenshot()` (line 612), reset on zero-element result (line 733). `queryUia()` called in both paths (lines 614, 718). |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| AIP-01 | 03-01-PLAN.md | Computer use system prompt updated: "Use element coordinates from screen_elements, screenshot for visual context only" | SATISFIED | `agent.ts` lines 256-291: Elements-First Workflow with explicit accessibility tree priority instruction. `screen_elements` in tool list (line 254). |
| AIP-02 | 03-01-PLAN.md | Hybrid mode: AI tries accessibility tree coordinates first, falls back to screenshot coordinates if no matching element | SATISFIED | `agent.ts` lines 272-275: "Fall back to screenshots ONLY when: The accessibility tree returns 0 elements or the target element is not in the list" |
| AIP-03 | 03-01-PLAN.md | Agent skips screenshot re-capture when accessibility tree content hasn't changed since last capture | SATISFIED | `agent-core.ts` lines 611-632: cache check at start of `toolScreenshot()`, returns cached base64+data when SHA-256 hash matches. |

All 3 requirement IDs from plan frontmatter are satisfied. No orphaned requirements — REQUIREMENTS.md maps AIP-01, AIP-02, AIP-03 only to Phase 3, all accounted for.

---

### Anti-Patterns Found

None. No TODO/FIXME/HACK/placeholder comments in either modified file. No empty return stubs. No static hardcoded data flowing to user-visible output. Cache instance variables are populated by real data (screenshot capture pipeline) and consumed by real logic (hash comparison).

---

### Human Verification Required

#### 1. End-to-end accessibility-first flow

**Test:** Open any Windows application (e.g., Notepad), send an agent task to "click the File menu", observe tool call order in agent logs.
**Expected:** Agent calls `device_*_screen_elements` first, finds a Button/MenuItem named "File" in the element list, then calls `device_*_mouse_click` with `raw:true` and the element's (cx,cy). No screenshot taken unless needed.
**Why human:** Tool call sequence and raw:true usage requires a live agent run to confirm the AI model follows the prompt instructions correctly.

#### 2. Screenshot cache hit in practice

**Test:** Run an agent task that calls `screen_elements` then `screenshot` twice without any UI change.
**Expected:** Second screenshot response includes `[cached — accessibility tree unchanged]` in the output string and `cached: true` in response data.
**Why human:** Cache hit depends on UIA returning identical element sets across two calls, which requires a live Windows environment and a stable focused window.

#### 3. Fallback to screenshot when no matching element

**Test:** Send a task that requires clicking an element that typically doesn't appear in the accessibility tree (e.g., a canvas-rendered element or image).
**Expected:** Agent calls `screen_elements`, finds no match, then falls back to `screenshot` for visual pixel analysis without `raw:true`.
**Why human:** Requires testing with a real app that has inaccessible elements to confirm the fallback path is exercised correctly.

---

## Acceptance Criteria Check (from PLAN)

All criteria from the plan's `<verify>` blocks confirmed:

**Task 1 (agent.ts):**
- "Elements-First Workflow" in `agent.ts`: 1 match (line 263) — PASS
- `screen_elements` in `agent.ts`: 7 matches (>= 5 required) — PASS
- `raw:true` in `agent.ts`: 3 matches (>= 2 required) — PASS
- "Fall back to screenshots ONLY" in `agent.ts`: 1 match (line 272) — PASS
- "Screenshot-Analyze-Act-Verify" in `agent.ts`: 0 matches — PASS (old section removed)
- "Messaging Context" in `agent.ts`: 1 match (line 293) — PASS (section after Computer Use intact)

**Task 2 (agent-core.ts):**
- `lastElementHash` matches: declared + assignment in toolScreenElements + check + comparison = multiple — PASS
- `lastScreenshotBase64` matches: declaration + assignment + usage = 3 — PASS
- `createHash` matches: import (line 7) + toolScreenElements (line 748) + toolScreenshot cache check (line 619) = 3 — PASS
- `cached.*true`: `cached: true` (line 624) — PASS
- "accessibility tree unchanged": 1 match (line 623) — PASS
- `import.*createHash.*from.*crypto`: 1 match (line 7) — PASS

---

## Commit Verification

| Commit | Message | Files Changed | Status |
| ------ | ------- | ------------- | ------ |
| `57162d9` | feat(03-01): rewrite AI system prompt for accessibility-first hybrid computer use | `nexus/packages/core/src/agent.ts` (+24/-18 lines) | VERIFIED |
| `df41e33` | feat(03-01): add hash-based screenshot caching tied to accessibility tree changes | `agent-app/src/main/agent-core.ts` (+48/-9 lines) | VERIFIED |

---

## Summary

Phase 03 fully achieved its goal. The AI system prompt in `nexus/packages/core/src/agent.ts` has been replaced with an accessibility-first Elements-First Workflow that explicitly instructs the AI to call `screen_elements` before mouse actions, use element coordinates with `raw:true`, and fall back to screenshots only when no matching element is found. The old "Screenshot-Analyze-Act-Verify Loop" is completely removed.

The caching mechanism in `agent-app/src/main/agent-core.ts` is fully wired: `toolScreenElements()` computes a SHA-256 hash of the pipe-delimited element list and stores it as `lastElementHash`; `toolScreenshot()` re-queries UIA at call time, computes the current hash, and returns the cached screenshot (with `cached:true`) when the tree is unchanged. Non-Windows and UIA failure paths fall through gracefully.

All 3 requirements (AIP-01, AIP-02, AIP-03) are satisfied. No anti-patterns found. Three human-verification items remain that require a live Windows + agent execution environment to confirm end-to-end behavior.

---

_Verified: 2026-03-25T09:54:33Z_
_Verifier: Claude (gsd-verifier)_
