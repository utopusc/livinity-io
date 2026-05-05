---
phase: 69-per-tool-views-suite
plan: 05
subsystem: ui
tags: [dispatcher, integration, routing, e2e-test, p69-wave3]
requirements_satisfied: [VIEWS-10]
dependency_graph:
  requires:
    - "livos/packages/ui/src/routes/ai-chat/tool-views/browser-tool-view.tsx (P69-01)"
    - "livos/packages/ui/src/routes/ai-chat/tool-views/command-tool-view.tsx (P69-01)"
    - "livos/packages/ui/src/routes/ai-chat/tool-views/file-operation-tool-view.tsx (P69-02)"
    - "livos/packages/ui/src/routes/ai-chat/tool-views/str-replace-tool-view.tsx (P69-02)"
    - "livos/packages/ui/src/routes/ai-chat/tool-views/web-search-tool-view.tsx (P69-03)"
    - "livos/packages/ui/src/routes/ai-chat/tool-views/web-crawl-tool-view.tsx (P69-03)"
    - "livos/packages/ui/src/routes/ai-chat/tool-views/web-scrape-tool-view.tsx (P69-03)"
    - "livos/packages/ui/src/routes/ai-chat/tool-views/mcp-tool-view.tsx (P69-04)"
    - "livos/packages/ui/src/routes/ai-chat/tool-views/generic-tool-view.tsx (P68-02 — fallback)"
    - "livos/packages/ui/src/routes/ai-chat/tool-views/types.ts (P68-02 — ToolViewProps)"
  provides:
    - "Updated getToolView(toolName) — routes 8 specific views per CONTEXT D-28; default falls through to GenericToolView"
    - "Updated useToolView(toolName) — useMemo wrapper unchanged"
    - "Comprehensive routing test suite (24 individual test cases) covering all 10 routing rules + fallback + memoization + exclusivity"
  affects:
    - "P70-08 (composer integration) — LivToolPanel will now render the SPECIFIC view component for each tool snapshot, not GenericToolView"
    - "ROADMAP P69 success criterion #1 satisfied (each tool type renders with distinct view component)"
tech-stack:
  added: []
  patterns:
    - "Pure-function dispatcher (no React rendering needed for tests; reference-equality via toBe)"
    - "it.each parametric table with FC<unknown> assertion for routing-exclusivity coverage"
    - "Alphabetical import ordering within each group (per ESLint sort-imports + grep-ability)"
key-files:
  created: []
  modified:
    - "livos/packages/ui/src/routes/ai-chat/tool-views/dispatcher.tsx (79 lines, was 83 lines — net -4: removed 10 TODO(P69-NN) comments + 9 redundant `return GenericToolView` lines, added 8 specific view imports + 8 specific returns; net result is slightly more compact)"
    - "livos/packages/ui/src/routes/ai-chat/tool-views/dispatcher.unit.test.tsx (131 lines, was 50 lines — added 8 specific view imports + 7 describe blocks + 15 it()/it.each invocations covering 24 individual test cases)"
decisions:
  - "Replaced (NOT deleted) the original 6 P68 tests. They previously asserted toBe(GenericToolView) for browser-* / computer-use-* / execute-* / mcp_*; those assertions now flip to toBe(BrowserToolView) / toBe(CommandToolView) / toBe(McpToolView). This is a test-correctness UPDATE — the contract has shifted from 'P68 fallback' to 'P69 specific routing'."
  - "Used the it.each parametric table form for routing exclusivity (10 cases) per the plan's reference signature. The FC<unknown> assertion casts compile cleanly under TS strict — no friction observed; all 24 test cases pass on first run."
  - "Plan brief said '8 TODO(P69-NN) markers' but the live P68-04 dispatcher.tsx had 10 TODO markers (P69-01 appears 3× for browser/computer-use/screenshot, plus P69-02..P69-08 each once). All 10 were removed; the verification node script greps for `TODO(P69` and confirms 0 remaining. Documented as a count clarification, not a deviation — the intent (remove all TODOs and wire specific views) is identical."
  - "Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged at start AND end of every task (4 verifications)."
  - "No P69 view component was modified — all 8 are imported as-is. Confirmed by grep-existence + import-name match against each view's `export function NameToolView` signature."
metrics:
  duration: "~4m execute (Tasks 1-4)"
  tasks_completed: 4
  files_modified: 2
  files_created: 0
  test_cases_added: 18  # 24 dispatcher cases - 6 P68 baseline = 18 net new
  total_p69_test_cases_passing: 218
  ts_build_status: "pnpm --filter ui build exit 0 (32.81s + 32.96s + 33.60s — three clean builds across Tasks 2/3/4)"
  completed_date: "2026-05-05"
---

# Phase 69 Plan 05: Dispatcher Integration Summary

**One-liner:** Wired 8 P69 specific tool views (Browser, Command, FileOperation, StrReplace, WebSearch, WebCrawl, WebScrape, Mcp) into the P68-04 dispatcher skeleton — all 10 `TODO(P69-NN)` markers removed; default `GenericToolView` fallback preserved; 24-case test suite verifies every routing rule + memoization + exclusivity.

## What shipped

### File 1: `livos/packages/ui/src/routes/ai-chat/tool-views/dispatcher.tsx` (MODIFIED, 79 lines)

- **Imports section** — 8 specific view imports added in alphabetical order alongside the existing `GenericToolView` import:
  - `BrowserToolView`, `CommandToolView`, `FileOperationToolView`, `GenericToolView`, `McpToolView`, `StrReplaceToolView`, `WebCrawlToolView`, `WebScrapeToolView`, `WebSearchToolView`.
- **Switch body** — 9 prefix/exact-match branches each return their specific view per CONTEXT D-28:
  - `^browser-` → `BrowserToolView`
  - `^computer-use-` → `BrowserToolView`
  - `screenshot` / `^screenshot-` → `BrowserToolView`
  - `^execute-` / `=== 'run-command'` → `CommandToolView`
  - `^file-` / `=== 'read-file'` / `=== 'write-file'` → `FileOperationToolView`
  - `=== 'str-replace'` / `=== 'str-replace-editor'` → `StrReplaceToolView`
  - `=== 'web-search'` / `=== 'search-web'` → `WebSearchToolView`
  - `=== 'web-crawl'` / `=== 'crawl-website'` → `WebCrawlToolView`
  - `=== 'web-scrape'` / `=== 'scrape-page'` → `WebScrapeToolView`
  - `^mcp_` / `^mcp-` → `McpToolView`
- **Default branch** — unchanged: `return GenericToolView`. Verified by node script: exactly 1 `return GenericToolView` remains in the file.
- **`useToolView(toolName)` hook** — UNCHANGED (`useMemo(() => getToolView(toolName), [toolName])`).
- **All `TODO(P69-` markers removed** — verified by node script (0 occurrences after edit, was 10).
- **File header comment updated** — now reads "Phase 68-04 (skeleton) → 69-05 (specific views wired)" (the bridge documentation per plan reference).

### File 2: `livos/packages/ui/src/routes/ai-chat/tool-views/dispatcher.unit.test.tsx` (MODIFIED, 131 lines)

- **Imports** — 8 specific view imports + `GenericToolView` + `getToolView` + vitest + `type {FC}` from react.
- **7 describe blocks** + **15 `it()`/`it.each()` invocations** producing **24 individual test cases**:
  - **Browser routing (3 it tests, 8 expect):** `browser-*`, `computer-use-*`, `screenshot`/`screenshot-*` → `BrowserToolView`
  - **Command routing (2 tests, 3 expect):** `execute-*`, `run-command` → `CommandToolView`
  - **FileOperation routing (2 tests, 5 expect):** `file-*`, `read-file`, `write-file` → `FileOperationToolView`
  - **StrReplace routing (1 test, 2 expect):** `str-replace`, `str-replace-editor` → `StrReplaceToolView`
  - **Web routing (3 tests, 6 expect):** `web-search`/`search-web`, `web-crawl`/`crawl-website`, `web-scrape`/`scrape-page` → respective views
  - **MCP routing (1 test, 3 expect):** `mcp_*`, `mcp-*` → `McpToolView`
  - **Fallback (2 tests, 3 expect):** unknown tool name + empty string → `GenericToolView`; reference-equality on repeated calls
  - **Routing exclusivity (1 it.each, 10 parametric cases):** confirms each known tool routes to its specific view AND `!== GenericToolView` (catches typo'd imports, regression alarm)
- **Test result:** 24/24 pass in 6ms (`pnpm --filter ui exec vitest run dispatcher.unit.test.tsx`).

## Test results — full P69 suite (Task 4 regression)

```
Test Files  11 passed (11)
     Tests  218 passed (218)
  Duration  2.52s
```

| File | Cases |
|------|------:|
| utils.unit.test.ts | 32 |
| dispatcher.unit.test.tsx | 24 |
| web-crawl-tool-view.unit.test.tsx | 24 |
| web-search-tool-view.unit.test.tsx | 25 |
| file-operation-tool-view.unit.test.tsx | 13 |
| command-tool-view.unit.test.tsx | 24 |
| mcp-tool-view.unit.test.tsx | 13 |
| liv-tool-row.unit.test.tsx | 13 |
| browser-tool-view.unit.test.tsx | 23 |
| str-replace-tool-view.unit.test.tsx | 8 |
| web-scrape-tool-view.unit.test.tsx | 19 |
| **Total** | **218** |

(Plan estimate was ~80; the actual count is 2.7× higher because each view file shipped richer behavior coverage than the plan's lower bound — no regressions.)

## Build status

`pnpm --filter ui build` exited 0 three times (after Task 2, after Task 3, after Task 4). Dist payload unchanged size class — last build: `index-97b7cba7.js 1,434.31 kB / gzip 430.41 kB`. PWA precache 201→202 entries (one new asset for the wired dispatcher's resolved imports).

## Sacred file SHA verification

`git hash-object nexus/packages/core/src/sdk-agent-runner.ts` returned `4f868d318abff71f8c8bfbcf443b2393a553018b` at:

| Gate | Result |
|------|--------|
| Task 1 start | unchanged |
| Task 2 start + end | unchanged |
| Task 3 start + end | unchanged |
| Task 4 end | unchanged |

## Coexistence files (CONTEXT D-13 preserved)

| File | Status | Provenance |
|------|--------|------------|
| `livos/packages/ui/src/components/inline-tool-pill.tsx` | present, untouched | P68-03 |
| `livos/packages/ui/src/routes/ai-chat/components/liv-tool-row.tsx` | present, untouched | P69-04 |
| `livos/packages/ui/src/routes/ai-chat/tool-views/generic-tool-view.tsx` | present, untouched | P68-02 |

Both inline tool render components coexist as required by D-13. The deprecation of P68-03's `inline-tool-pill.tsx` is deferred to P70 (after `LivToolRow` adoption is confirmed in `chat-messages.tsx`).

## P69-01..P69-04 view files NOT modified

This plan touched EXACTLY 2 files:
- `tool-views/dispatcher.tsx` (modified)
- `tool-views/dispatcher.unit.test.tsx` (modified)

Verified via `git status livos/packages/ui/src/routes/ai-chat/tool-views/`. No view component was edited.

## Total P69 effort across all 5 plans (final tally)

- **5 plans** (69-01 through 69-05)
- **17 source files** in `tool-views/` + `components/` (utils.tsx + 9 view tsx + LivToolRow + dispatcher = 12; plus 5 LivToolRow/dispatcher/utils companion files in companion paths makes ~17)
- **11 vitest files** running 218 test cases
- **0 new package dependencies** (D-NO-NEW-DEPS honored across the entire phase)
- **Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged across all 5 plans**

## Deviations from Plan

### Auto-fixed Issues

**None.** Plan executed exactly as written; the only documentation drift was a count clarification (10 TODO markers removed, plan brief said 8) — the intent was identical and all are gone.

### Auth gates encountered

None.

## Note for P70 planner

P70 must:

1. Mount `<LivToolPanel>` (P68-05) in `livos/packages/ui/src/routes/ai-chat/index.tsx`.
2. Replace inline tool render in `chat-messages.tsx` with `<LivToolRow>` (P69-04) — clicking the row toggles the panel for the matching `runId`.
3. Consider deleting the deprecated P68-03 `inline-tool-pill.tsx` AFTER `LivToolRow` adoption is verified (D-13 cleanup deferred per CONTEXT).
4. Wire `LivToolPanel` content area to render `getToolView(toolCall.toolName)({snapshot, isActive, onEvent})` so the right view component appears per selected tool.

Phase 69 is implementation-complete. ROADMAP P69 success criterion #1 ("Each tool type renders with distinct view component") is now TRUE — every dispatcher branch returns its specific view, fallback only fires for unknown tool names.

## Self-Check: PASSED

- File `livos/packages/ui/src/routes/ai-chat/tool-views/dispatcher.tsx` — FOUND
- File `livos/packages/ui/src/routes/ai-chat/tool-views/dispatcher.unit.test.tsx` — FOUND
- Commit `fcb7cb1c` (Task 2 — dispatcher wiring) — FOUND
- Commit `fbce38a1` (Task 3 — test extension) — FOUND
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — UNCHANGED
