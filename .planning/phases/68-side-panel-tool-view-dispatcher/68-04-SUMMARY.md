---
phase: 68-side-panel-tool-view-dispatcher
plan: 04
subsystem: ui/ai-chat
tags: [dispatcher, tool-view-routing, fallback, d-no-new-deps, vitest, p69-handoff]
requires:
  - 68-02 (ToolViewProps + GenericToolView)
  - 68-CONTEXT.md (D-20 dispatcher signature, D-22 useToolView memo)
  - v31-DRAFT.md line 354 (case enumeration)
provides:
  - "getToolView(toolName: string): FC<ToolViewProps> — pure routing function"
  - "useToolView(toolName: string): FC<ToolViewProps> — useMemo wrapper for stable refs"
  - "10 TODO(P69-NN) markers reserved for future per-tool view plug-in points"
affects:
  - "68-05 (LivToolPanel) — can `const View = useToolView(snapshot.toolName)` then render <View/>"
  - "P69-01..P69-08 — each plan replaces one TODO(P69-NN) case with a specific view"
tech-stack:
  added: []
  patterns:
    - "D-NO-NEW-DEPS — pure function dispatch, no React render in tests, no testing-library import"
    - "Reference-equality test pattern (toBe) locks contract; flips automatically when P69 plugs in specific views"
    - "useMemo hook wrapper for stable component refs across re-renders (CONTEXT D-22)"
key-files:
  created:
    - livos/packages/ui/src/routes/ai-chat/tool-views/dispatcher.tsx
    - livos/packages/ui/src/routes/ai-chat/tool-views/dispatcher.unit.test.tsx
  modified: []
decisions:
  - "Switch implemented as if/return prefix matching (not literal switch statement) — TypeScript-friendly, supports both prefix and exact-match cases (e.g. 'web-search' === literal but 'browser-*' is prefix)"
  - "10 TODO markers (>= 8 required) — covered every case branch, leaving zero ambiguity for P69 planners"
  - "useToolView NOT covered in unit tests — testing a hook would force @testing-library/react import (D-NO-NEW-DEPS violation); the hook is a thin useMemo wrapper, getToolView coverage is sufficient"
  - "Tabs for indentation per existing tool-views/ files (types.ts, generic-tool-view.tsx)"
metrics:
  duration: ~10 min
  completed: 2026-05-04T14:55:00Z
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  loc_added: 132
  tests_added: 6
requirements: [PANEL-07]
---

# Phase 68 Plan 04: Side Panel + Tool View Dispatcher Summary

**One-liner:** Tool-view dispatcher (`getToolView` + `useToolView`) routing toolName prefixes to React.FC<ToolViewProps> renderers — P68 ships skeleton with all 10 cases falling through to `GenericToolView`, 8 reserved TODO(P69-NN) plug-in points for the upcoming per-tool view plans, locked by 6 reference-equality vitest cases.

## What was built

### `livos/packages/ui/src/routes/ai-chat/tool-views/dispatcher.tsx` — 82 lines

Pure dispatcher exposing two exports per CONTEXT D-20..D-22:

- `export function getToolView(toolName: string): FC<ToolViewProps>` — if/return prefix-matching dispatcher. Cases (each currently `return GenericToolView`):
  1. `browser-*` → `TODO(P69-01): replace with BrowserToolView`
  2. `computer-use-*` → `TODO(P69-01): replace with BrowserToolView (computer-use mode)`
  3. `screenshot` / `screenshot-*` → `TODO(P69-01): replace with BrowserToolView (screenshot mode)`
  4. `execute-*` / `run-command` → `TODO(P69-02): replace with CommandToolView`
  5. `file-*` / `read-file` / `write-file` → `TODO(P69-03): replace with FileOperationToolView`
  6. `str-replace` / `str-replace-editor` → `TODO(P69-04): replace with StrReplaceToolView`
  7. `web-search` / `search-web` → `TODO(P69-05): replace with WebSearchToolView`
  8. `web-crawl` / `crawl-website` → `TODO(P69-06): replace with WebCrawlToolView`
  9. `web-scrape` / `scrape-page` → `TODO(P69-07): replace with WebScrapeToolView`
  10. `mcp_*` / `mcp-*` → `TODO(P69-08): replace with McpToolView`
  - Default → `GenericToolView` (the safe fallback for unknown tools)

- `export function useToolView(toolName: string): FC<ToolViewProps>` — `useMemo`-wrapped variant; re-resolves only when `toolName` changes. P69 will benefit from stable refs since switching to specific views means the returned component identity will actually change.

10 TODO(P69-NN) markers in source (verify check required ≥ 8, file has 10).

### `livos/packages/ui/src/routes/ai-chat/tool-views/dispatcher.unit.test.tsx` — 50 lines

6 vitest cases under one `describe('getToolView (CONTEXT D-20)')` block:

1. `returns GenericToolView for browser-* tools (P68 fallback)` — `browser-navigate` + `browser-click`
2. `returns GenericToolView for computer-use-* tools` — `computer-use-screenshot`
3. `returns GenericToolView for terminal tools` — `execute-command`
4. `returns GenericToolView for MCP tools` — `mcp_brave_search` + `mcp-anthropic-search`
5. `returns GenericToolView for unknown tool names (default fallback)` — `completely-unknown-tool` + `''`
6. `returns the same component reference on repeated calls` — locks idempotency

All assertions use `toBe(GenericToolView)` reference-equality. As P69 lands per-tool views, each matching test line flips to `toBe(BrowserToolView)` etc. — any forgotten case auto-detects.

## Verification results

| Check | Result |
|-------|--------|
| `dispatcher.tsx` contains all required tokens (getToolView, useToolView, GenericToolView, ToolViewProps, useMemo, browser-, computer-use-, execute-, mcp_, TODO(P69, startsWith) | PASS — 10 P69 markers (≥8 required) |
| `dispatcher.unit.test.tsx` contains all required tokens (describe, it(, expect(, getToolView, GenericToolView, toBe, from 'vitest') | PASS — 6 cases (≥4 required) |
| `pnpm --filter ui build` | PASS — exit 0, built in 43.64s |
| `pnpm --filter ui exec vitest run --reporter=verbose src/routes/ai-chat/tool-views/dispatcher.unit.test.tsx` | PASS — 6/6 tests, 659ms |
| Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` (nexus/packages/core/src/sdk-agent-runner.ts) | UNCHANGED |

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | `42d2f94c` | `feat(68-04): add tool-view dispatcher (getToolView + useToolView)` |
| 2 | `ab71b355` | `test(68-04): vitest cases for dispatcher routing` |

## Deviations from Plan

None — plan executed exactly as written. The reference signature in `<reference_signature>` was the complete file; the test signature in Task 2 action step 2 was the complete file. Both transcribed verbatim (with project-style tabs swapped in). The plan's TDD ordering (impl in Task 1, test in Task 2) was preserved despite both tasks carrying `tdd="true"` — the action steps make the implementation-first sequence explicit.

## Handoff notes for downstream plans

- **68-05 (LivToolPanel)** — wire as:
  ```tsx
  import {useToolView} from './tool-views/dispatcher'
  // inside panel render:
  const View = useToolView(activeSnapshot.toolName)
  return <View snapshot={activeSnapshot} isActive={isFocused} onEvent={handleEvent} />
  ```
- **P69-01..P69-08** — for each plan:
  1. Create the specific view file (`browser-tool-view.tsx`, etc.) implementing `(props: ToolViewProps) => JSX.Element`
  2. Replace ONE `// TODO(P69-NN)` comment + adjacent `return GenericToolView` with `return SpecificToolView`
  3. Update the matching dispatcher.unit.test.tsx assertion from `.toBe(GenericToolView)` to `.toBe(SpecificToolView)`
  4. No panel changes needed — the dispatcher is the single contact point.

## Self-Check: PASSED

- File `livos/packages/ui/src/routes/ai-chat/tool-views/dispatcher.tsx` — FOUND (82 lines)
- File `livos/packages/ui/src/routes/ai-chat/tool-views/dispatcher.unit.test.tsx` — FOUND (50 lines)
- Commit `42d2f94c` — FOUND in `git log`
- Commit `ab71b355` — FOUND in `git log`
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — UNCHANGED
- 10 TODO(P69-NN) markers in dispatcher.tsx — VERIFIED
- 6/6 vitest cases pass — VERIFIED
