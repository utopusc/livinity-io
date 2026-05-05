---
phase: 72-computer-use-agent-loop
plan: native-05
subsystem: computer-use
tags: [computer-use, mcp-server, native-arch, categorize-patch, needs-help, ui]
requires:
  - 72-01-PLAN.md (BYTEBOT_TOOLS schemas)
  - 72-native-01-PLAN.md (captureScreenshot)
  - 72-native-02-PLAN.md (input.ts — 11 primitives)
  - 72-native-03-PLAN.md (window.ts — openOrFocus / listWindows / readFileBase64)
  - P67-02 (LivAgentRunner.categorizeTool + ToolCallSnapshot type)
  - P68-01 (LivToolPanel + useLivToolPanelStore)
provides:
  - bytebot MCP server (stdio JSON-RPC, name='bytebot' version='1.0.0')
  - registerBytebotTools dispatching 17 native primitives
  - _liv_meta extension protocol for needs-help / completed / task-created signals
  - shouldShowNeedsHelpCard predicate for UI gating
  - LivNeedsHelpCard banner component (3 affordances)
affects:
  - nexus/packages/core/src/liv-agent-runner.ts (categorizeTool patch — additive)
  - livos/packages/ui/src/routes/ai-chat/liv-tool-panel.tsx (additive mount)
tech-stack:
  added: ["@modelcontextprotocol/sdk@^1.12.0 (livinityd direct dep — already in workspace via @nexus/core)"]
  patterns: ["handler-map dispatch", "pure-helper extraction (D-NO-NEW-DEPS)", "underscore-prefixed MCP extension fields"]
key-files:
  created:
    - livos/packages/livinityd/source/modules/computer-use/mcp/server.ts (51 LOC)
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts (309 LOC)
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts (271 LOC)
    - livos/packages/ui/src/routes/ai-chat/components/liv-needs-help-card.tsx (210 LOC)
    - livos/packages/ui/src/routes/ai-chat/components/liv-needs-help-card.unit.test.tsx (148 LOC)
  modified:
    - livos/packages/livinityd/package.json (+1 dep: @modelcontextprotocol/sdk)
    - livos/packages/livinityd/pnpm-lock.yaml (regenerated)
    - livos/packages/livinityd/source/modules/computer-use/index.ts (+native/ re-export)
    - nexus/packages/core/src/liv-agent-runner.ts (categorizeTool +1 prefix branch)
    - nexus/packages/core/src/liv-agent-runner.test.ts (+4 cases / 1 new test fn)
    - livos/packages/ui/src/routes/ai-chat/liv-tool-panel.tsx (additive mount + 1 import)
decisions:
  - handler-map (Record<string, Handler>) chosen over giant switch — better testability + grep-clarity
  - JSON-Schema passthrough for registerTool inputSchema (NOT Zod conversion) — BYTEBOT_TOOLS already use JSON-Schema; SDK accepts both
  - post-action 750ms settle + screenshot scope: skipped for computer_screenshot (already a screenshot), computer_wait (no state change), computer_cursor_position (read-only), set_task_status / create_task (terminal/management)
  - LivToolPanel mount placement at TOP of panel body (above View) — banner is high-priority interrupt, not a step in the chronological tool history
  - Stub onTakeOver/onSubmitGuidance/onCancel callbacks log only (74+ replaces with real run-id wiring) — current panel does not yet have access to runId/conversationId props
metrics:
  duration: "~25 min"
  completed: "2026-05-05T04:38:05Z"
---

# Phase 72 Plan native-05: Bytebot MCP Server + categorizeTool Patch + LivNeedsHelpCard Summary

**One-liner:** Wave-2 integration — stdio MCP server exposing 17 Bytebot tools dispatched to native X11 primitives, additive `mcp_bytebot_*` categorize patch, and `LivNeedsHelpCard` UI banner reading the `_liv_meta` extension field from MCP tool results.

## Files Created / Modified

| Path | Type | LOC |
|------|------|-----|
| `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` | created | 51 |
| `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` | created | 309 |
| `livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts` | created | 271 |
| `livos/packages/livinityd/source/modules/computer-use/index.ts` | modified | +9 |
| `livos/packages/livinityd/package.json` | modified | +1 dep |
| `livos/pnpm-lock.yaml` | modified | regen |
| `nexus/packages/core/src/liv-agent-runner.ts` | modified | +6/-3 |
| `nexus/packages/core/src/liv-agent-runner.test.ts` | modified | +35 |
| `livos/packages/ui/src/routes/ai-chat/components/liv-needs-help-card.tsx` | created | 210 |
| `livos/packages/ui/src/routes/ai-chat/components/liv-needs-help-card.unit.test.tsx` | created | 148 |
| `livos/packages/ui/src/routes/ai-chat/liv-tool-panel.tsx` | modified | +27 |

## HANDLERS Dispatch Table (final, 17 entries)

| BYTEBOT tool name | Native primitive | Post-action screenshot |
|-------------------|------------------|-----------------------|
| `computer_screenshot` | `captureScreenshot()` | n/a (is the screenshot) |
| `computer_move_mouse` | `moveMouse(args.coordinates)` | yes |
| `computer_trace_mouse` | `traceMouse(path, holdKeys)` | yes |
| `computer_click_mouse` | `clickMouse(args)` | yes |
| `computer_press_mouse` | `pressMouse(args)` | yes |
| `computer_drag_mouse` | `dragMouse(path, button, holdKeys)` | yes |
| `computer_scroll` | `scroll(args)` | yes |
| `computer_type_keys` | `typeKeys(keys, delay)` | yes |
| `computer_press_keys` | `pressKeys(keys, press)` | yes |
| `computer_type_text` | `typeText(text, delay, isSensitive)` | yes |
| `computer_paste_text` | `pasteText(text, isSensitive)` | yes |
| `computer_wait` | `setTimeout(duration)` | NO (no state change) |
| `computer_cursor_position` | `getCursorPosition()` | NO (read-only) |
| `computer_application` | `openOrFocus(name)` (validates internally) | yes (when not isError) |
| `computer_read_file` | `readFileBase64(path)` | NO (file IO, not visible state) |
| `set_task_status` | (no native call — emits `_liv_meta`) | NO (terminal action) |
| `create_task` | (passthrough — `_liv_meta`) | NO (management action) |

## `_liv_meta` Shape per kind

```typescript
// kind === 'needs-help' (D-NATIVE-08 — exact)
{
  content: [{ type: 'text', text: `NEEDS_HELP: ${description}` }],
  isError: false,
  _liv_meta: {
    kind: 'needs-help',
    message: description,
    tool: 'mcp_bytebot_set_task_status',
  },
}

// kind === 'completed'
{
  content: [{ type: 'text', text: `COMPLETED: ${description}` }],
  isError: false,
  _liv_meta: {
    kind: 'completed',
    message: description,
  },
}

// kind === 'task-created' (passthrough — no DB write at this phase)
{
  content: [{ type: 'text', text: 'task created (passthrough — no DB write at this phase)' }],
  isError: false,
  _liv_meta: {
    kind: 'task-created',
    ...args,  // description, type, scheduledFor, priority — whatever the agent sent
  },
}
```

The `_liv_meta` underscore prefix is the MCP convention for private extension fields. UI consumers gate on `_liv_meta.kind` to surface UI affordances (LivNeedsHelpCard for `needs-help`).

## categorizeTool Patch (±diff)

```diff
 export function categorizeTool(toolName: string): ToolCategory {
+  // Plan 72-native-05 D-NATIVE-11 — bytebot MCP server's tools (named
+  // `mcp_bytebot_<bytebot-tool>` by the McpClientManager prefixing rule)
+  // must hit the computer-use track BEFORE the generic mcp_* rule wins.
+  if (toolName.startsWith('mcp_bytebot_')) {
+    return 'computer-use';
+  }
   if (toolName.startsWith('computer_use_') || toolName.startsWith('bytebot_')) {
     return 'computer-use';
   }
   if (toolName.startsWith('mcp_') || toolName.startsWith('mcp-')) {
     return 'mcp';
   }
   // ... rest unchanged
```

The `mcp_bytebot_*` check is FIRST so it wins over the generic `mcp_*` rule. The existing `computer_use_*` / `bytebot_*` block is preserved for legacy non-MCP-prefixed tool names (P67-02 D-16 stub fallback).

## LivNeedsHelpCard — Prop Shape + Helper Signature

```typescript
import type { ToolCallSnapshot } from '@/stores/liv-tool-panel-store';

export interface LivNeedsHelpCardProps {
  snapshot: ToolCallSnapshot;
  onTakeOver?: () => void;
  onSubmitGuidance?: (text: string) => void;
  onCancel?: () => void;
}

// Pure helper — gates LivToolPanel render. Tested directly in unit suite.
export function shouldShowNeedsHelpCard(snapshot: ToolCallSnapshot | null): boolean;

// Default export — banner card with 3 affordances + inline guidance textarea.
export default function LivNeedsHelpCard(props: LivNeedsHelpCardProps): JSX.Element;
```

Predicate logic: returns `true` iff
1. `snapshot != null`, AND
2. `snapshot.category === 'computer-use'`, AND
3. `snapshot.toolName.endsWith('set_task_status')`, AND
4. `parseMaybeJSON(snapshot.toolResult?.output)._liv_meta?.kind === 'needs-help'`.

The string-output JSON-parse fallback (step 4) tolerates SSE serialization paths that stringify the entire result before persisting to RunStore (P67-03).

## Test Counts + Results

| Suite | Cases | Status |
|-------|-------|--------|
| `livos/.../mcp/tools.test.ts` | 12 | 12/12 pass |
| `nexus/core/src/liv-agent-runner.test.ts` | 7 (was 6 + 1 new fn / 4 sub-asserts) | 7/7 pass |
| `livos/.../liv-needs-help-card.unit.test.tsx` | 14 | 14/14 pass |
| **Total NEW + EXISTING** | **33** | **33/33 pass** |

Builds:
- `npx tsc` (`@nexus/core`) — clean exit
- `pnpm --filter ui build` — clean (32.83s)
- `pnpm --filter livinityd typecheck` — 358 pre-existing baseline errors in unrelated files (`utilities/file-store.ts`, `widgets/routes.ts`); ZERO errors in any plan-touched module (`computer-use/mcp/*`)

## Decision Log

1. **Handler-map vs switch** — chose `Record<string, Handler>` map. Justification: per-handler unit tests can grab a single fn from `HANDLERS` without spinning up the registration loop; a giant switch would require the test to walk through unrelated cases on every assertion. Also reduces handler-name typo risk since all 17 names live in one greppable object literal.
2. **Post-screenshot scope** — only state-changing actions get the 750ms settle + post-screenshot wrap. Skip list: `computer_screenshot` (is the screenshot), `computer_wait` (no state change to observe), `computer_cursor_position` (read-only), `set_task_status` / `create_task` (terminal/management — no visual change to verify), `computer_read_file` (file IO, not screen state). Per D-NATIVE-05.
3. **JSON-Schema vs Zod for registerTool inputSchema** — chose pass-through. BYTEBOT_TOOLS use Anthropic's JSON-Schema format verbatim (D-09 verbatim copy contract from 72-01); converting to Zod would either drift from upstream or require maintaining a parallel translation layer. The MCP SDK accepts both shapes; passing the raw JSON-Schema object is the lower-friction path.
4. **LivToolPanel mount placement** — at the TOP of the panel body, above the dispatched View. Justification: NEEDS_HELP is a high-priority user interrupt — putting it below the per-tool view would make users scroll past tool details to get to the affordance buttons. Also matches the "alert at top, content below" Suna pattern the broader UI follows.
5. **Stub callback wiring (LivToolPanel handlers)** — onTakeOver / onSubmitGuidance / onCancel currently `console.log` only. Justification: the panel doesn't yet receive `runId` / `conversationId` props; full wiring requires new threading from `useLivAgentStream` (P67-04 hook) up through the component tree. Plan 74+ orchestration takes this on. Current stubs preserve the binding contract so 74's wiring is a callback swap, not a component refactor.
6. **`@modelcontextprotocol/sdk` direct dep on livinityd (Rule 3 deviation)** — added `@modelcontextprotocol/sdk@^1.12.0` to `livos/packages/livinityd/package.json`. Justification: pnpm strict resolution prevented `tsx server.ts` from resolving the SDK through the transitive `@nexus/core` dep path. Same version (`^1.12.0`) as `@nexus/core` — pnpm reuses the existing workspace store entry, no new node_modules downloaded. This satisfies the spirit of D-NO-NEW-DEPS ("reuse existing MCP infrastructure") while making the import resolvable. See "Deviations from Plan" below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @modelcontextprotocol/sdk as direct dep on livinityd**
- **Found during:** Task 1 GREEN gate, when `tsx server.ts` could not resolve the SDK.
- **Issue:** Plan stated SDK is "already transitive via `@nexus/mcp-server`". In reality, `@nexus/mcp-server` is not a livinityd dep; the SDK only reaches livinityd through `@nexus/core` → MCP SDK. Pnpm strict isolation hides transitive deps from direct imports.
- **Fix:** Added `"@modelcontextprotocol/sdk": "^1.12.0"` to `livos/packages/livinityd/package.json` (matches existing version in `@nexus/core` package.json — pnpm reuses the workspace store entry).
- **Files modified:** `livos/packages/livinityd/package.json`, `livos/pnpm-lock.yaml`.
- **Commit:** `aa5cac13` (bundled with Task 1 commit).

No other deviations — plan executed as written.

## Authentication Gates

None encountered. This is pure dispatcher/UI work — no LLM calls, no external service auth.

## Sacred SHA Verification

`nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` verified at:
- Plan start (before any work)
- After Task 1 commit (`aa5cac13`)
- After Task 2 commit (`64d0869e`)
- After Task 3 commit (`1bb5c4a0`)
- Final Task 4 verification (post-test idempotency rerun)

Sacred file untouched throughout the plan.

## Threat Flags

None. All surface introduced by this plan is internal to the livinityd → bytebot MCP child process (stdio) and the UI component tree (already authenticated). No new network endpoints, no new auth paths, no new schema at trust boundaries. The `_liv_meta` flow is the documented private extension channel (T-72N5-02 accept-disposition).

## Self-Check: PASSED

All artifact paths exist:
- `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` — FOUND
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` — FOUND
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts` — FOUND
- `livos/packages/ui/src/routes/ai-chat/components/liv-needs-help-card.tsx` — FOUND
- `livos/packages/ui/src/routes/ai-chat/components/liv-needs-help-card.unit.test.tsx` — FOUND

All commits exist on master:
- `aa5cac13` — Task 1 (MCP server + handlers + tests) — FOUND
- `64d0869e` — Task 2 (categorizeTool patch + 4 tests) — FOUND
- `1bb5c4a0` — Task 3 (LivNeedsHelpCard + LivToolPanel mount) — FOUND
