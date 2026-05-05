---
phase: 72-computer-use-agent-loop
plan: 01
subsystem: livinityd/computer-use
tags: [computer-use, bytebot, tool-schemas, foundation, apache-2.0]
dependency_graph:
  requires:
    - "Phase 71 task-repository.ts (existing barrel partner; no behavior coupling — only file co-location)"
    - "Sacred file nexus/packages/core/src/sdk-agent-runner.ts SHA 4f868d318abff71f8c8bfbcf443b2393a553018b (read-only invariant)"
  provides:
    - "BYTEBOT_TOOLS readonly array of 17 Anthropic-format tool schemas"
    - "BYTEBOT_TOOL_NAMES readonly string[] derived from BYTEBOT_TOOLS"
    - "isBytebotToolName(name) type-guard predicate"
    - "BytebotToolName string-literal-union type"
    - "AnthropicTool type for downstream consumers"
    - ".planning/licenses/bytebot-LICENSE.txt — first mirrored upstream license (Apache 2.0)"
  affects:
    - "Plan 72-02 (system prompt) imports nothing from this module but lives in the same dir"
    - "Plan 72-03 (LivAgentRunner wiring) will import { BYTEBOT_TOOL_NAMES, isBytebotToolName }"
    - "Plan 72-04 (broker proxy env var) is independent"
tech_stack:
  added: []
  patterns:
    - "Verbatim upstream copy with Apache 2.0 attribution header (D-09 + D-11 contract)"
    - "License mirror at .planning/licenses/<project>-LICENSE.txt for first-time usage"
    - "TDD RED → GREEN gate sequence (test commit precedes feat commit)"
    - "Barrel re-export pattern matching livinity-broker/index.ts shape"
key_files:
  created:
    - "livos/packages/livinityd/source/modules/computer-use/bytebot-tools.ts (483 lines)"
    - "livos/packages/livinityd/source/modules/computer-use/bytebot-tools.test.ts (78 lines)"
    - ".planning/licenses/bytebot-LICENSE.txt (201 lines, Apache 2.0 verbatim)"
  modified:
    - "livos/packages/livinityd/source/modules/computer-use/index.ts (re-exports added; existing task-repository re-export untouched)"
decisions:
  - "Verbatim upstream snapshot: 17 tools (separate-tools form, NOT consolidated computer_action). Plan brief mentioned 16 + write_file + computer_action consolidator — upstream as of 2026-05-04 ships neither. Followed D-09 verbatim contract over plan brief."
  - "Test file canonical-anchor assertion uses substring match on 'screenshot' (not exact 'screenshot') so the test survives upstream's possible future rename to a consolidated computer_action shape."
  - "License directory created at .planning/licenses/ (first time usage); future verbatim-mirror plans will land their license files here."
  - "Skipped consumer-facing pnpm build — livinityd is tsx-only per MEMORY.md (package.json has typecheck not build). Used `npx tsc --noEmit` for typecheck verification; only PRE-EXISTING errors (user/widgets/file-store) — no new errors introduced by this plan's files."
metrics:
  duration_minutes: ~15
  completed_date: 2026-05-05
  tasks_completed: 1
  tasks_total: 1
---

# Phase 72 Plan 01: Bytebot Tool Schemas Summary

Verbatim Apache-2.0 copy of Bytebot's 17 computer-use tool schemas as `livinityd/computer-use/bytebot-tools.ts`, satisfying CU-LOOP-01 and unblocking Plans 72-03/72-04.

## What Shipped

| File                                                                          | Type     | Lines | Purpose                                                                |
| ----------------------------------------------------------------------------- | -------- | ----: | ---------------------------------------------------------------------- |
| `livos/packages/livinityd/source/modules/computer-use/bytebot-tools.ts`       | NEW      |   483 | 17 Bytebot tool schemas + `BYTEBOT_TOOLS` / `BYTEBOT_TOOL_NAMES` / `isBytebotToolName` / types |
| `livos/packages/livinityd/source/modules/computer-use/bytebot-tools.test.ts`  | NEW      |    78 | 7 vitest specs proving Anthropic-format compliance + snake_case + screenshot anchor |
| `livos/packages/livinityd/source/modules/computer-use/index.ts`               | MODIFIED |    21 | Barrel re-export adds new public surface alongside existing `task-repository.js` exports |
| `.planning/licenses/bytebot-LICENSE.txt`                                      | NEW      |   201 | Apache 2.0 license text mirrored from upstream `bytebot-ai/bytebot/LICENSE` |

## Upstream Snapshot

- **URL fetched:** `https://raw.githubusercontent.com/bytebot-ai/bytebot/main/packages/bytebot-agent/src/agent/agent.tools.ts`
- **Snapshot date:** 2026-05-04
- **License URL fetched:** `https://raw.githubusercontent.com/bytebot-ai/bytebot/main/LICENSE`
- **License header line 1:** `Apache License` / `Version 2.0, January 2004`
- **Upstream tools count at fetch time:** **17** (separate-tools form — NOT consolidated `computer_action`)
- **Tool name list (verbatim, in upstream array order):**
  1. `computer_move_mouse`
  2. `computer_trace_mouse`
  3. `computer_click_mouse`
  4. `computer_press_mouse`
  5. `computer_drag_mouse`
  6. `computer_scroll`
  7. `computer_type_keys`
  8. `computer_press_keys`
  9. `computer_type_text`
  10. `computer_paste_text`
  11. `computer_wait`
  12. `computer_screenshot`
  13. `computer_application`
  14. `computer_cursor_position`
  15. `set_task_status`
  16. `create_task`
  17. `computer_read_file`

**Notable upstream realities (recorded for future audits):**
- No `write_file` tool (the plan brief mentioned one; upstream does not ship it). Verbatim contract followed.
- No `computer_action` consolidator (the plan brief mentioned both forms as possibilities; upstream still ships separate tools).
- `computer_wait.duration` schema enums to a single value `[500]` — preserved verbatim.
- `set_task_status` enums `['completed', 'needs_help']` — load-bearing for Plan 72-05 NEEDS_HELP UI flow.
- `computer_application.application` enums `['firefox', '1password', 'thunderbird', 'vscode', 'terminal', 'desktop', 'directory']` — preserved verbatim.
- All shared sub-schemas (`coordinateSchema`, `holdKeysSchema`, `buttonSchema`) preserved as private file-scoped consts.

## Public Surface (binding contract)

```typescript
// livos/packages/livinityd/source/modules/computer-use/index.ts
export { BYTEBOT_TOOLS, BYTEBOT_TOOL_NAMES, isBytebotToolName } from './bytebot-tools.js'
export type { AnthropicTool, BytebotToolName } from './bytebot-tools.js'
```

```typescript
// livos/packages/livinityd/source/modules/computer-use/bytebot-tools.ts
export type AnthropicTool = {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export const BYTEBOT_TOOLS: readonly AnthropicTool[] = [ /* 17 entries */ ] as const
export const BYTEBOT_TOOL_NAMES: readonly string[] = BYTEBOT_TOOLS.map(t => t.name)
export type BytebotToolName = (typeof BYTEBOT_TOOLS)[number]['name']
export function isBytebotToolName(name: string): name is BytebotToolName
```

## Verification Results

| Gate                                                                                                | Result                                       |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Sacred SHA at start (`git hash-object nexus/packages/core/src/sdk-agent-runner.ts`)                | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| Sacred SHA at end (post-commit re-check)                                                            | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| Apache 2.0 license file present + contains `Apache License`                                        | ✅                                            |
| `bytebot-tools.ts` shape grep (BYTEBOT_TOOLS, BYTEBOT_TOOL_NAMES, isBytebotToolName, attribution)   | ✅                                            |
| `vitest run source/modules/computer-use/bytebot-tools.test.ts`                                      | **7/7 pass** (4ms)                           |
| `tsc --noEmit` errors in `bytebot-tools.ts` / `bytebot-tools.test.ts` / `index.ts` (this plan's files) | **0 errors**                                 |
| Build verification path                                                                             | `npx tsc --noEmit` (livinityd is tsx-only — no `scripts.build` per MEMORY.md note) |

**Pre-existing typecheck errors:** `tsc --noEmit` reports errors in unrelated files (`source/modules/user/routes.ts`, `source/modules/widgets/routes.ts`, `source/modules/utilities/file-store.ts`, `source/modules/user/user.ts`). These are NOT introduced by this plan and are out of scope per executor scope-boundary rules. Logged for awareness only.

## TDD Gate Compliance

| Gate     | Commit hash      | Subject                                                                                       |
| -------- | ---------------- | --------------------------------------------------------------------------------------------- |
| RED      | `43e51531`       | (test file `bytebot-tools.test.ts` was bundled into a parallel-agent commit titled "chore(71-01)"; verified `git log -- bytebot-tools.test.ts` returns this commit; test was confirmed to fail before impl was written) |
| GREEN    | `62f9b1cd`       | `feat(72-01): add Bytebot tool schemas (verbatim Apache 2.0 copy) (CU-LOOP-01)`               |
| REFACTOR | n/a              | not needed — verbatim copy is final; no cleanup pass required                                  |

**RED gate anomaly (deviation):** The test file `bytebot-tools.test.ts` was staged via `git add` and committed by my `git commit` invocation, but a parallel-agent process running concurrently in the same working tree appears to have bundled the file into a commit titled `chore(71-01): add bytebot-desktop SQL for Server5 platform.apps catalog`. The test file's content + my staged file are identical to what landed in commit `43e51531`. The TDD RED gate IS satisfied (test commit precedes feat commit; test was empirically confirmed to fail before impl was written — vitest output `Failed to load url ./bytebot-tools.js`), but the commit message attribution is incorrect. Documented as a deviation; no remediation attempted (would require `--amend` which is forbidden per executor protocol absent explicit user request).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test assertion `toContain('screenshot')` adjusted to substring match `BYTEBOT_TOOL_NAMES.some(n => n.includes('screenshot'))`**
- **Found during:** Task 1 step 5 (test authoring)
- **Issue:** The plan's test step 4 specified `expect(BYTEBOT_TOOL_NAMES).toContain('screenshot');` but upstream Bytebot's actual tool name is `computer_screenshot`. The plan's own behavior section acknowledges: "the only schema we can absolutely guarantee exists across all Bytebot versions" — but the upstream name is namespaced.
- **Fix:** Used substring match (`.some(n => n.includes('screenshot'))`) so the assertion is verbatim-compatible with upstream's `computer_screenshot` AND survives a future upstream consolidation to `computer_action` with `action='screenshot'`.
- **Files modified:** `livos/packages/livinityd/source/modules/computer-use/bytebot-tools.test.ts` (test #4)
- **Commit:** `43e51531` (RED test commit; the substring-match form is what shipped from the start)

### Acknowledged Anomalies (no auto-fix)

**A. Parallel-agent commit attribution drift (RED gate)**
- **Found during:** Task 1 step 5 (RED commit)
- **Issue:** A parallel agent in the same working tree appears to have bundled my staged test file into its own commit (`43e51531`) with a `chore(71-01)` message instead of my intended `test(72-01)` message.
- **Fix:** None — `git commit --amend` is prohibited absent explicit user request. The test file IS in version control under SHA `43e51531`; the RED gate IS empirically satisfied (failing test → impl → passing test). Only the commit message attribution is incorrect.
- **Mitigation:** Documented in `## TDD Gate Compliance` above so future audits can reconcile.

**B. Out-of-scope files in the same module directory**
- **Found:** During final `tsc --noEmit` run.
- **Issue:** Files `bytebot-system-prompt.ts` and `bytebot-system-prompt.test.ts` (Plan 72-02 territory) and `task-repository.test.ts` (Plan 71-03 territory) appeared in the same `computer-use/` directory mid-execution from parallel agent work.
- **Fix:** None — out of scope per executor SCOPE BOUNDARY rule. Did NOT stage/commit these files.

## Self-Check: PASSED

- [x] `livos/packages/livinityd/source/modules/computer-use/bytebot-tools.ts` exists (FOUND)
- [x] `livos/packages/livinityd/source/modules/computer-use/bytebot-tools.test.ts` exists (FOUND)
- [x] `livos/packages/livinityd/source/modules/computer-use/index.ts` exists (FOUND)
- [x] `.planning/licenses/bytebot-LICENSE.txt` exists (FOUND)
- [x] Commit `43e51531` exists (FOUND in `git log`)
- [x] Commit `62f9b1cd` exists (FOUND in `git log`)
- [x] Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged (FOUND)
- [x] All 7 vitest tests pass (FOUND in test output)

No claims unverified.
