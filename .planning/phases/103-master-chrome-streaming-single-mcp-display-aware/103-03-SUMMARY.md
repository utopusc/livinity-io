---
phase: 103
plan: 03
subsystem: computer-use
tags:
  - luse
  - mcp
  - display-scoping
  - x11
  - tdd
  - additive-schema
dependency-graph:
  requires:
    - 100-10-02-luse-rename-foundation
    - 100-10-03-luse-window-aware-tools
    - 102-09-vnc-bridge-display-mode
  provides:
    - luse tool input_schema `display?: ":N"` field on 13 X11-touching tools
    - withScopedDisplay() helper (process.env.DISPLAY scope+restore)
    - parseDisplayArg() helper (regex-guarded display string parser)
    - exported helpers for test access (`@internal` JSDoc tag)
  affects:
    - 103-04-buildActiveDisplaySnippet (will instruct agent to pass display arg)
    - 103-05-LIVOS_PER_APP_LUSE flip default '0' (single-MCP per-call routing)
tech-stack:
  added:
    - withScopedDisplay (async try/finally env scope)
    - parseDisplayArg (regex /^:[1-9][0-9]?$/ trust boundary)
  patterns:
    - Apache-2.0 verbatim-tool-schema extension (additive `display` field with comment-tag)
    - Trust-boundary regex guard mirroring PerWebAppMcpDescriptor.display (luse-mcp-config.ts:133)
    - Action-summary string surfaces display scope (`display=:N`) for agent observability
key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/computer-use/luse-tools.ts
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts
decisions:
  - "ADDITIVE schema-only change — 13 X11-touching tools gain optional `display: \":N\"` property; `required` arrays unchanged so existing callers (LUSE_TARGET_DISPLAY env fallback) keep working"
  - "Regex /^:[1-9][0-9]?$/ enforces 1-99 display range — same regex as PerWebAppMcpDescriptor.display (luse-mcp-config.ts:133); invalid strings ('foo', ':0', ':100', '', non-strings) fall back to defaultDisplay rather than mutating process.env.DISPLAY"
  - "process.env.DISPLAY mutation v1 over execFile env arg v2 — MCP stdio JSON-RPC serializes calls (one request → one response), so handler-level race is impossible in production; Pitfall 2 from 103-RESEARCH documented in withScopedDisplay JSDoc"
  - "screenshot_window optional refactor SKIPPED — pre-existing prev/process.env.DISPLAY swap pattern semantically equivalent; tests already pass, minimizing risk"
  - "withScopedDisplay + parseDisplayArg exported with `@internal` JSDoc tag — purely for test access; MCP child serializes calls so no production callers exist outside tools.ts"
metrics:
  duration: 40min
  completed: 2026-05-11
---

# Phase 103 Plan 03: Single-MCP Display-Aware Tool Schema Summary

Single-instance `luse` MCP gains per-call display scoping so one global server can drive any of the per-WebApp Xvfb displays (`:10`, `:11`, ...) without needing per-WebApp MCP registrations. Schema is fully backward-compatible: existing callers via `LUSE_TARGET_DISPLAY` env fallback keep working; new callers pass `display: ":N"` as a tool arg to scope a single op cross-display.

## What Shipped

| Task                                                | Commit     | Files                                          | Lines (+/-) |
|-----------------------------------------------------|------------|------------------------------------------------|-------------|
| 1. Add `display` to 13 X11 tool schemas             | `d38af35f` | 1 (`luse-tools.ts`)                            | +87 / -2    |
| 2a. RED — failing tests for helpers + threading     | `cd95b58d` | 1 (`mcp/tools.test.ts`)                        | +268 / -1   |
| 2b. GREEN — withScopedDisplay + parseDisplayArg     | `2bd32a25` | 1 (`mcp/tools.ts`)                             | +210 / -93  |

**Total: 565 + / 96 - across 3 files in 3 commits.**

## Behaviour

### Before

Single-instance `luse` MCP server resolved `process.env.DISPLAY` once at boot via `resolveDisplay()` (mcp/server.ts:67). Every tool call within the process honored only that single env-derived display. To drive `:11` from one MCP call and `:12` from the next, callers needed per-WebApp MCP child processes — exactly the topology Plan 100-08 Wave 4 implemented and which 103-05 will retire.

### After (Phase 103-03)

13 X11-touching tools accept an optional `display: ":N"` arg in `input_schema.properties`:

| Tool                       | Where                                    |
|----------------------------|------------------------------------------|
| `computer_move_mouse`      | buildHandlers → moveMouse                |
| `computer_trace_mouse`     | buildHandlers → traceMouse               |
| `computer_click_mouse`     | buildHandlers → clickMouse               |
| `computer_press_mouse`     | buildHandlers → pressMouse               |
| `computer_drag_mouse`      | buildHandlers → dragMouse                |
| `computer_scroll`          | buildHandlers → scroll                   |
| `computer_type_keys`       | buildHandlers → typeKeys                 |
| `computer_press_keys`      | buildHandlers → pressKeys                |
| `computer_type_text`       | buildHandlers → typeText                 |
| `computer_paste_text`      | buildHandlers → pasteText                |
| `computer_screenshot`      | buildHandlers → captureScreenshot        |
| `computer_cursor_position` | buildHandlers → getCursorPosition        |
| `list_windows`             | registerLuseWindowTools → listWindows    |

Each handler reads `args.display` through `parseDisplayArg(args)` (regex `/^:[1-9][0-9]?$/`), then wraps its existing native-primitive call in `withScopedDisplay(displayArg, options.defaultDisplay, async () => ...)`. The wrapper sets `process.env.DISPLAY = (displayArg ?? defaultDisplay)` for the duration of the async fn, then restores the previous value in `finally` (works on throw).

Resolution precedence inside `withScopedDisplay`:

1. **Explicit `args.display`** matching `/^:[1-9][0-9]?$/` (e.g. `":11"`)
2. **`options.defaultDisplay`** — seeded from `LUSE_TARGET_DISPLAY` env at MCP boot via `resolveDisplay()` (mcp/server.ts:67)
3. **Neither set** → no mutation; native primitive sees whatever DISPLAY was before the call

Invalid `args.display` strings (`'foo'`, `':0'`, `':100'`, `''`, non-string types) are silently treated as undefined by `parseDisplayArg` and fall back to step 2. This is the T-103-03-01 trust-boundary guard — the same regex used by `PerWebAppMcpDescriptor.display` (luse-mcp-config.ts:133), so a hostile MCP arg cannot inject path-traversal characters into the X11 socket path xdotool / maim constructs from `$DISPLAY`.

Action-summary strings surface the scope when applied: `clickMouse {…} display=:11`, `Screenshot captured (1280x720) display=:11`, etc. The agent observes this in the post-action screenshot's text content, so cross-display dispatch is visible in transcripts.

## Tests

**Coverage matrix** (15 new tests under `Phase 103-B — withScopedDisplay + display arg threading`, all green):

| Test ID    | Behaviour Verified                                                                 |
|------------|------------------------------------------------------------------------------------|
| T103B-01   | `withScopedDisplay(":11", ":1")` sets DISPLAY=":11" inside fn; restores after      |
| T103B-02   | `withScopedDisplay(undefined, ":1")` falls back to defaultDisplay=":1"             |
| T103B-03   | Both undefined → NO mutation of process.env.DISPLAY                                |
| T103B-03b  | When prev DISPLAY is unset, finally cleanup `delete`s the var (not assigns "undefined") |
| T103B-04   | Restoration works when wrapped fn throws (`rejects.toThrow('boom')`, prev preserved) |
| T103B-05   | `computer_click_mouse({display:":11"})` runs clickMouse with DISPLAY=":11" at call time |
| T103B-06   | No display arg + `defaultDisplay=":10"` → clickMouse sees DISPLAY=":10"            |
| T103B-07   | No display arg + no defaultDisplay → clickMouse sees host DISPLAY unchanged        |
| T103B-08   | `display:"foo"` (invalid) → falls back to defaultDisplay                           |
| T103B-09   | `display:":0"` (forbidden — regex requires 1-99) → falls back to defaultDisplay     |
| T103B-09b  | `display:":100"` (3-digit out of range) → falls back to defaultDisplay              |
| T103B-09c  | `display:""` (empty) → falls back to defaultDisplay                                 |
| T103B-10   | `list_windows({display:":12"})` invokes listWindows({display:":12"})                |
| T103B-11   | `computer_screenshot({display:":11"})` runs captureScreenshot with DISPLAY=":11"    |
| T103B-12   | `parseDisplayArg` regex acceptance: valid `:1..:99`, rejected `:0/:100/foo/""/non-string` |

**Verified existing tests:** `pnpm vitest run source/modules/computer-use/mcp/tools.test.ts` — 39/39 pass (24 original P72/P100-10 cases + 15 new P103-B cases).

**Broader regression scan:** `pnpm vitest run source/modules/computer-use/` — 221/238 pass; the 17 failures are pre-existing platform-specific failures (Windows tests trying to spawn Linux xdotool/maim) unchanged from the pre-103-03 baseline (verified via temporary `git stash` of these changes and re-run — same 17 failed both before and after). NOT regressions introduced by this plan.

**TypeScript:** `pnpm tsc --noEmit -p .` on `livos/packages/livinityd` — zero new errors in `luse-tools.ts` or `mcp/tools.ts`. Pre-existing TS errors elsewhere in the codebase (skills/_templates, conversation-search.test.ts) are out of plan scope.

## Sacred SHA

```
git hash-object liv/packages/core/src/sdk-agent-runner.ts
→ f3538e1d811992b782a9bb057d1b7f0a0189f95f  (UNCHANGED across all 3 commits)
```

Pre-commit hook (`.husky/pre-commit` + `scripts/check-sacred.sh`) verified on all three task commits.

## Deviations from Plan

None — plan executed exactly as written.

The only "judgement call" was choosing to LEAVE `screenshot_window`'s pre-existing manual prev/process.env.DISPLAY swap as-is rather than refactor it to use the new `withScopedDisplay` helper. The plan explicitly marked that refactor as OPTIONAL with the condition "should ONLY be done if it keeps all existing tests green." Semantically the two implementations are equivalent, so any refactor would be cosmetic only and increases the diff surface. Existing `screenshot_window` tests (T-10-03-HANDLER-02, T-10-03-HANDLER-05) continue to pass without the refactor.

## Carry-forward to 103-04 / 103-05

- **103-04** (`buildActiveDisplaySnippet`): Update agent prompt to instruct Claude to ALWAYS pass `display: ":N"` when scoping to the active WebApp's Xvfb. The arg is now a valid input_schema property on 13 tools — agents will type-check the tool call when emitting JSON. (Mitigation for Pitfall 8 in 103-RESEARCH: belt-and-suspenders — also set `LUSE_TARGET_DISPLAY` env per-turn so the default fallback is correct when the agent omits the arg.)
- **103-05** (`LIVOS_PER_APP_LUSE='0'` default flip): Once 103-04 ships, per-WebApp MCP registrations become redundant. Single-MCP serves all displays via per-call routing through `display` arg.
- **Out-of-scope deferred** (logged for v2 if production race observed): execFile env arg pattern (Pattern v2 in 103-RESEARCH Pitfall 2). Current v1 relies on MCP stdio JSON-RPC serialization invariant.

## Self-Check

- ✅ `livos/packages/livinityd/source/modules/computer-use/luse-tools.ts` — FOUND
- ✅ `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` — FOUND
- ✅ `livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts` — FOUND
- ✅ Commit `d38af35f` — FOUND in `git log` (Task 1)
- ✅ Commit `cd95b58d` — FOUND in `git log` (Task 2 RED)
- ✅ Commit `2bd32a25` — FOUND in `git log` (Task 2 GREEN)
- ✅ Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — preserved after all 3 commits

## Self-Check: PASSED
