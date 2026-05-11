---
phase: 102
plan: 06
title: Luse MCP env switch (LUSE_TARGET_DISPLAY) + Active Display Context snippet
subsystem: livinityd computer-use + agent broker + UI WS envelope
tags: [luse-mcp, env-scoping, agent-prompt, display-pivot, t-102-06]
wave: 2
dependency-graph:
  requires: []
  provides:
    - LUSE_TARGET_DISPLAY env propagation (luse-mcp-config -> spawned Luse child)
    - Active Display Context prompt snippet (buildActiveDisplaySnippet)
    - agent-runner-factory.activeDisplay opt (replaces activeWid as canonical)
    - UI WS envelope activeDisplay field
    - regex /^:[1-9][0-9]?$/ T-102-06 enforcement
  affects:
    - 102-04 (window-manager.ts descriptor caller - surgical descriptor edit)
tech-stack:
  added: []
  patterns:
    - regex-guard env scoping (T-102-06)
    - graceful fail-open env precedence (LUSE_TARGET_DISPLAY -> LUSE_DISPLAY -> DISPLAY)
    - back-compat dual-path (activeDisplay + activeWid coexist during WS migration)
key-files:
  created:
    - livos/packages/livinityd/source/modules/computer-use/mcp/server.test.ts
  modified:
    - livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts
    - livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.test.ts
    - livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.window.test.ts
    - livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
    - livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts
    - livos/packages/livinityd/source/modules/ai/agent-prompt-builder.test.ts
    - livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts
    - livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.test.ts
    - livos/packages/livinityd/source/modules/webapps/window-manager.ts
    - livos/packages/livinityd/source/modules/webapps/window-manager.test.ts
    - livos/packages/ui/src/hooks/use-agent-socket.ts
    - .planning/phases/102-per-app-display-pivot/102-VALIDATION.md
decisions:
  - PerWebAppMcpDescriptor.display is REQUIRED; windowId field dropped (no opt fallback)
  - buildActiveDisplaySnippet regex /^:\d{1,3}$/ - 3-digit headroom in the prompt builder
  - luse-mcp-config descriptor regex /^:[1-9][0-9]?$/ - strict :1..:99 for spawned env
  - mcp/server.ts resolveDisplay() extracted as pure helper for unit testability
  - When both activeDisplay + activeWid present in opts, activeDisplay wins (no double snippet)
  - LUSE_TARGET_WINDOW_ID legacy env read marked deprecated; retained for host-display fallback
metrics:
  duration-min: 27
  tasks-completed: 5
  files-changed: 13
  commits: 5
  tests-passed: "105/108 (3 failures pre-existing in registerLuseMcpServer T4/T5/T6 - LUSE_REDIS_URL stale tests, unrelated)"
  completed-date: 2026-05-11
---

# Phase 102 Plan 06: Luse MCP env switch (LUSE_TARGET_DISPLAY) + Active Display Context

**One-liner:** Per-WebApp Luse MCP children now scope by X11 display (`LUSE_TARGET_DISPLAY=:N`) instead of window-id; LLM prompt receives "Active Display Context" with 1280x720 native coordinate hint; broker + UI WS envelope migrated to `activeDisplay` alongside legacy `activeWid` back-compat.

## What Shipped

### Backend env contract (D-102-LUSE-DISPLAY-SCOPING)

- **`LUSE_TARGET_DISPLAY_ENV` constant** replaces `LUSE_TARGET_WINDOW_ID_ENV` in `luse-mcp-config.ts`. The per-WebApp descriptor branch now emits BOTH `DISPLAY: :N` (so child-spawned xdotool/maim/xclip inherit it) AND `LUSE_TARGET_DISPLAY: :N` (canonical Phase 102 env read by mcp/server.ts).
- **`PerWebAppMcpDescriptor.display`** is REQUIRED (was optional with `:1` default); `windowId` field DROPPED entirely.
- **T-102-06 regex enforcement:** `DISPLAY_RE = /^:[1-9][0-9]?$/` (matches `:1` through `:99`, denies shell-meta / path-traversal / over-bound payloads). Validated at `buildLuseConfig()` entry; throws with descriptive error if descriptor violates.
- **`mcp/server.ts` env-read precedence:**
  1. `LUSE_TARGET_DISPLAY` (canonical, regex-validated)
  2. `LUSE_DISPLAY` (legacy alias from Phase 100-10-03)
  3. `DISPLAY` (system default)
  4. `undefined` (no env vars set)
- **Fail-open behavior:** malformed `LUSE_TARGET_DISPLAY` emits stderr warning and falls through to legacy chain rather than crashing the MCP child.
- **`LUSE_TARGET_WINDOW_ID`** read at `mcp/server.ts:55` marked `@deprecated since Phase 102-06` - retained ONLY as legacy fallback for host-display Luse (per-WebApp Luse children no longer have it set).

### Prompt builder (D-102-LUSE-DISPLAY-SCOPING + T-102-06b)

- **NEW `buildActiveDisplaySnippet({activeDisplay, appMeta})`** in `agent-prompt-builder.ts`. Emits 5-line markdown:

  ```
  ## Active Display Context
  You are operating in the context of the LivOS app: <title> (<kind>).
  Active X11 display: <:N> (resolution 1280x720)
  URL/Binary: <url ?? binary ?? '(unknown)'>
  All your Luse tool calls (screenshot, click, key) are implicitly scoped to <:N> via LUSE_TARGET_DISPLAY. Coordinate space is 1280x720 native - no offset, no scaling.
  ```

- **`DISPLAY_RE_PROMPT = /^:\d{1,3}$/`** - wider than descriptor regex (allows 3-digit headroom for future Xvfb beyond `:99`); descriptor stays strict :1..:99 since that is authoritative.
- **T-101-03 sanitization** (control-char strip + length-cap) carryover via existing `sanitizeActiveAppMeta()`.
- **`buildActiveWindowSnippet` marked `@deprecated`** - kept temporarily for callers still passing `activeWid` (pre-102 broker payloads).

### Agent broker factory (D-102-LUSE-DISPLAY-SCOPING)

- **`createSdkAgentRunnerForUser` opts adds `activeDisplay?: string`** alongside legacy `activeWid?: number`.
- **Precedence rule:** when BOTH `activeDisplay` and `activeWid` are present, `activeDisplay` wins (calls `buildActiveDisplaySnippet`, skips `buildActiveWindowSnippet`) - prevents double snippet contradiction during migration window.
- **Fallback path:** when only `activeWid` present (pre-102 broker callers), the legacy `buildActiveWindowSnippet` path still injects (back-compat preserved).
- **Regex-guard fail-open:** invalid `activeDisplay` value -> no snippet injection (graceful skip, prevents prompt corruption).

### UI WS envelope migration

- **`UseAgentSocketOpts.activeDisplay?: string`** added to `use-agent-socket.ts`. `sendMessage` propagates `activeDisplay` to the WS `start` envelope alongside legacy `activeWid` + `activeAppMeta`. `useCallback` dep array updated.
- Both `activeWid` and `activeDisplay` sent simultaneously during the migration window - backend's precedence rule picks the new path automatically. Once all caller sites (Phase 103+) drop `activeWid`, the deprecated factory branch becomes dead code.

## Env-Read Precedence Diagram

```
process.env.LUSE_TARGET_DISPLAY   (canonical, regex-validated /^:[1-9][0-9]?$/)
         |  (if unset or malformed)
         v
process.env.LUSE_DISPLAY          (legacy alias, Phase 100-10-03+)
         |  (if unset)
         v
process.env.DISPLAY               (system default)
         |  (if unset)
         v
       undefined
```

## Caller-Update List

| File | Change | Reason |
|------|--------|--------|
| `webapps/window-manager.ts:716` | descriptor construction drops `windowId: wid` line | Rule 3 unblock - required to satisfy new PerWebAppMcpDescriptor contract (caller-side fix needed for compile). |
| `webapps/window-manager.test.ts:438` (Test 16) | rewrote assertions: `LUSE_TARGET_WINDOW_ID` -> `LUSE_TARGET_DISPLAY` env shape check | Rule 3 unblock - test asserted old env shape. |
| `ui/src/hooks/use-agent-socket.ts` | added `activeDisplay` to UseAgentSocketOpts + sendMessage payload + useCallback deps | Plan task 5 - UI WS envelope migration. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] window-manager.ts windowId caller**
- **Found during:** Task 2 (luse-mcp-config GREEN)
- **Issue:** Plan dropped `windowId` from `PerWebAppMcpDescriptor`, but `window-manager.ts:716-718` still constructed the descriptor with `windowId: wid`. TypeScript would refuse to compile.
- **Fix:** Minimal surgical removal of the `windowId: wid` line + the stale Phase 100-10-08 comment block above `display`. Applied to the HEAD-version of window-manager.ts (NOT the 102-04 working-dir version, which had been overwritten with 102-04's rewrite by a parallel executor). Used Python `bytes()` slice-replace to isolate just my 9-line diff.
- **Files modified:** `livos/packages/livinityd/source/modules/webapps/window-manager.ts`
- **Commit:** `a4f6af2f` (Task 2 GREEN)

**2. [Rule 3 - Blocking] Test 16 assertion on LUSE_TARGET_WINDOW_ID**
- **Found during:** Task 2 GREEN
- **Issue:** `window-manager.test.ts` Test 16 asserted `installCalls[0]!.env?.LUSE_TARGET_WINDOW_ID === String(0x200)`. With my changes the descriptor no longer emits that env key, so the assertion would always fail.
- **Fix:** Rewrote Test 16 assertions to verify the new env shape: `LUSE_TARGET_WINDOW_ID` is `undefined`; `LUSE_TARGET_DISPLAY` is a string matching `/^:[1-9][0-9]?$/`; `DISPLAY === LUSE_TARGET_DISPLAY`. Marked `[Phase 102-06 adapted]` in the test name for archaeologists.
- **Files modified:** `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts`
- **Commit:** `a4f6af2f`

### Worktree Sync Anomaly (logged, not a deviation)

- **Found during:** Task 1 (RED)
- **Observed:** This worktree's HEAD is `a884a382` (102-03), but the working-directory copies of `window-manager.ts` + `window-manager.test.ts` + several other files reflect 102-04's rewrite (which was committed directly to main as `82f7f711`/`869657ae`/`01f963d5` etc. by another parallel executor while I was running). The worktree filesystem state diverged from worktree HEAD.
- **Mitigation:** All my commits use **explicit per-file `git add`** (never `git add .` or `git add -A`). For files where the working-dir version was 102-04's rewrite (not my target state), I used Python `bytes()` slice-replace from `git show HEAD:<path>` to apply ONLY my surgical change against the HEAD-version, then `git add <path>` to stage just the surgical diff. This kept my commits scoped to 102-06 changes; 102-04's rewrite is preserved in main and will surface naturally when the orchestrator merges this worktree.
- **Impact:** Zero - the 5 102-06 commits are clean, targeted, and don't accidentally co-commit 102-04's window-manager rewrite.

## Snippet Excerpt

`buildActiveDisplaySnippet({activeDisplay: ':10', appMeta: {appId: 'webapp-1', kind: 'webapp', url: 'https://example.com/x', title: 'My WebApp'}})` returns:

```
## Active Display Context
You are operating in the context of the LivOS app: My WebApp (webapp).
Active X11 display: :10 (resolution 1280x720)
URL/Binary: https://example.com/x
All your Luse tool calls (screenshot, click, key) are implicitly scoped to :10 via LUSE_TARGET_DISPLAY. Coordinate space is 1280x720 native - no offset, no scaling.
```

## Sacred SHA Pre/Post

| Stage | `liv/packages/core/src/sdk-agent-runner.ts` SHA |
|-------|---------------------------------------------------|
| Pre-Task-1 | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-Task-1 (7f78fae3) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-Task-2 (a4f6af2f) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-Task-3 (e203d437) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-Task-4 (9f4eaa0e) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-Task-5 (034f6c4c) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

UNTOUCHED throughout. Plan 102-06 does not import or modify any file under `liv/` tree.

## Test Results

| Test File | Status | Tests |
|-----------|--------|-------|
| `computer-use/luse-mcp-config.test.ts` | 12 pass / 3 fail (pre-existing T4/T5/T6 - LUSE_REDIS_URL field not in expected env, unrelated to 102-06; verified by `git stash` revert) | 12/15 |
| `computer-use/luse-mcp-config.window.test.ts` | 5 pass | 5/5 |
| `computer-use/mcp/server.test.ts` (NEW) | 11 pass | 11/11 |
| `computer-use/mcp/tools.test.ts` | 24 pass | 24/24 |
| `computer-use/mcp/tools.window.test.ts` | 9 pass | 9/9 |
| `ai/agent-prompt-builder.test.ts` | 23 pass (12 legacy + 11 NEW for buildActiveDisplaySnippet) | 23/23 |
| `livinity-broker/agent-runner-factory.test.ts` | 16 pass (11 legacy + 5 NEW for activeDisplay) | 16/16 |
| **Total Phase 102-06 unit tests** | **105 / 108** (3 unrelated pre-existing failures) | |

VALIDATION.md rows 102-06-01..03 all flipped to green.

## Deferred Issues

**Pre-existing T4/T5/T6 failures in `registerLuseMcpServer` (luse-mcp-config.test.ts:146-228)** - these tests expect the env block to contain only `{DISPLAY, XAUTHORITY}` but the production code (since Phase 100-10-04) also emits `LUSE_REDIS_URL: ''`. The 3 tests have been broken since `LUSE_REDIS_URL` was added; my 102-06 changes are orthogonal. Filing as deferred-item for a future cleanup plan (not blocking 102-06).

## Threat Flags

(none - no new trust-boundary surface introduced beyond what the plan's `<threat_model>` already enumerated. T-102-06 (display env injection) is fully mitigated by the descriptor regex; T-102-06b (prompt injection) is mitigated by `DISPLAY_RE_PROMPT` + existing `sanitizeActiveAppMeta`.)

## Self-Check: PASSED

- [x] All 13 created/modified files present on disk (verified via `git ls-files` against `key-files` block).
- [x] All 5 commit hashes (7f78fae3, a4f6af2f, e203d437, 9f4eaa0e, 034f6c4c) present in `git log`.
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged.
- [x] VALIDATION.md 102-06-01..03 all green.
- [x] No commits include sacred file modifications (`liv/` tree untouched).
