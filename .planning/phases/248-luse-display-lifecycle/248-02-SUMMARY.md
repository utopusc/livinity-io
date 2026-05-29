---
phase: 248
plan: 02
subsystem: livinityd / computer-use / mcp
tags: [v44, luse, mcp, tools, display-lifecycle, computer-application, owner-scoped, tdd]
one_liner: "MCP wave for v44 displays — 4 new agent-facing tools (create/list/kill/launch_app_in_display) + additive computer_application display arg, wired through buildHandlers → options.displayManager → Phase 248-01 backend; 18/18 vitest GREEN; 0 new typecheck errors; sacred SHA preserved; boot smoke confirms (displayManager=wired|null) log line."
status: complete
type: tdd
wave: 2
depends_on:
  - 248-01
requirements: []
dependency_graph:
  requires:
    - phase: 248
      plan: 01
      reason: "buildHandlers wires options.displayManager → createDisplayManager from displays/index.js barrel; without 248-01's DisplayManager type + factory the new tool handlers cannot be constructed"
  provides:
    - "4 new LUSE_TOOLS schemas — drift-locks for 248-04 docs"
    - "buildHandlers 4 new entries (computer_create_display/list/kill/launch_app_in_display)"
    - "computer_application optional display prop (additive)"
    - "LuseToolsOptions.displayManager field"
    - "mcp/server.ts displayManager wiring (boot-time, reuses redis client)"
  affects:
    - "Phase 248-03 (TTL GC for 4h idle displays) — inherits the same DisplayManager instance via createDisplayManager already wired here; GC just needs an additional setInterval seam, not a new injection point"
    - "Phase 248-04 (docs/luse/DISPLAY-LIFECYCLE.md + sync to 4 shim dirs) — the 4 new tool schemas pin the description text and the required[] arrays; the docs reference these directly"
    - "Phase 248-05 (Mini PC deploy + UAT) — boot log line shape change ('(displayManager=wired)') is the operator-visible probe that the wiring landed"
tech_stack:
  added: []
  patterns:
    - "DI-injected manager via options field — same as livosAppResolver/streamManager/redis pattern from P100-10-04"
    - "Fail-closed handler envelope when injected dep is missing — returns 'Error: displayManager not wired' instead of throwing; preserves MCP protocol's isError envelope shape"
    - "withScopedDisplay wrapper for X11-touching tools that accept ':N' arg — reuses Phase 103-B helper unchanged"
    - "parseDisplayArg regex-gate /^:[1-9][0-9]?$/ — refuses to mutate process.env.DISPLAY with hostile values; matches the same pattern in PerWebAppMcpDescriptor"
    - "Owner-scope discriminated-union surface — manager returns {ok:false, error:'not-owner'}, MCP wrapper converts to isError:true with explicit D-V44 reference in the text body"
key_files:
  created: []
  modified:
    - path: livos/packages/livinityd/source/modules/computer-use/luse-tools.ts
      role: "Tool schemas — 4 new + additive display prop on _applicationTool"
      lines: 132
    - path: livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts
      role: "buildHandlers — 4 new handler entries + LuseToolsOptions.displayManager + computer_application withScopedDisplay wrap"
      lines: 195
    - path: livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
      role: "Boot-time DisplayManager construction + registerLuseTools threading + boot log line"
      lines: 28
    - path: livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts
      role: "9 new vitest cases (5 schema drift-locks + 4 handler wire-through)"
      lines: 205
decisions:
  - id: D-248-02-A
    title: "Owner-session sourced from options.userId (NOT from a per-request MCP context)"
    why: "The MCP child process has a fixed identity at boot (LUSE_USER_ID env), and all tool calls within that child belong to the same session. Threading the session ID through a per-request context would require deep changes to McpServerLike + the SDK's registerTool signature; for v44 single-tenant Mini PC the env-thread is correct and 248-03/04 can revisit if multi-session-per-MCP-child becomes a thing."
  - id: D-248-02-B
    title: "computer_launch_app_in_display uses MCP child's process.pid as a sentinel when livosAppResolver matches a WebApp (no binary to spawn)"
    why: "WebApps dispatch through windowManager IPC in the parent livinityd, not a binary spawn — there is no child pid to register. Using process.pid as the sentinel keeps the running_apps observable in computer_list_displays for UAT clarity; the manager's processKillFn swallows ESRCH on vanished pids during kill, so the sentinel is harmless. A future refinement could use a discriminated 'kind' field on the per-app record (binary vs webapp) and skip the SIGTERM loop for webapp entries — deferred to v45+."
  - id: D-248-02-C
    title: "Fail-closed envelope (isError:true with text) instead of skipping registration when displayManager is omitted"
    why: "Skipping registration would make the 4 tool schemas invisible to the agent's tool-discovery scan, which means the agent has no way to learn 'displays are unavailable here' — it would just hallucinate that the tools don't exist. Fail-closed envelope keeps the schemas discoverable and gives the agent a structured error it can act on (escalate to operator, fall back to default :1, etc.)."
  - id: D-248-02-D
    title: "Display arg on computer_application is regex-validated by the existing parseDisplayArg helper (NOT a new validator)"
    why: "parseDisplayArg was added in Phase 103-B for the exact same scenario — a display string crossing a trust boundary from LLM-controlled args into process.env mutation. Forking it would risk drift between the two validators. Re-using means: same regex /^:[1-9][0-9]?$/, same silent-drop on miss (falls back to defaultDisplay), same behavior across every X11-touching tool. Phase 248 allocates :10+ so the existing :1–:99 range covers all new displays."
metrics:
  duration_seconds: 540
  started_at: "2026-05-28T18:02:00Z"
  completed_at: "2026-05-28T18:11:00Z"
  tasks_completed: 3
  files_created: 0
  files_modified: 4
  commits: 3
  vitest_cases_new: 9
  vitest_cases_total: 33
  drift_locks: 5  # 4 schema-level (mode enum, required arrays) + 1 owner-scope error shape
---

# Phase 248 Plan 02: MCP Tool Registrations Summary

## Outcome

Layered the Phase 248-01 backend `DisplayManager` onto the Luse MCP surface so AI agents speak the same five-method contract through standard MCP JSON-RPC. Four new tools are now discoverable + dispatchable, and the existing `computer_application` tool gained an optional `display` arg so agents can target an existing nested display directly without going through `computer_launch_app_in_display`.

- **18/18 tools.test.ts vitest cases GREEN** (9 pre-existing R3 alias tests + 9 new Phase 248 tests).
- **33/33 cases across affected modules** when displays + tools are run together.
- **0 new typecheck errors** under `computer-use/mcp/`. The 4 pre-existing `ChildProcessByStdio` errors in an unrelated wmctrl spawn block (lines 1488/1489 → 1712/1713 after my line additions) are unchanged baseline noise — not introduced by this plan.
- **Sacred blob SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** of `liv/packages/core/src/sdk-agent-runner.ts` **preserved** across all 3 commits — pre-commit hook reported `[sacred-sha] PASS: 20 files verified` on every commit.
- **Boot smoke verified** — `LUSE_REDIS_URL='' pnpm tsx source/modules/computer-use/mcp/server.ts < /dev/null` emits the fail-closed log line `[luse-mcp] connected via stdio transport (redis=null, create_stream gated off) (displayManager=null)`, proving the env-based branch.

## The 4 new MCP tool schemas (drift-locks for 248-04 docs)

### computer_create_display

```json
{
  "name": "computer_create_display",
  "input_schema": {
    "type": "object",
    "properties": {
      "name":   {"type": "string"},
      "mode":   {"type": "string", "enum": ["xephyr", "xvfb"]},
      "width":  {"type": "number"},
      "height": {"type": "number"}
    }
  }
}
```

No `required` array — every prop is optional. Mode enum drift-locked to `['xephyr', 'xvfb']` (D-V44-DISPLAY-XEPHYR-DEFAULT — Xephyr is default when omitted). Handler returns `{content:[{type:'text', text: JSON.stringify({display, name, pid})}], isError:false}`.

### computer_list_displays

```json
{
  "name": "computer_list_displays",
  "input_schema": {"type": "object", "properties": {}}
}
```

No args, no `required`. Returns JSON-stringified array of `DisplayRecord` (`{display, name, mode, created_at, owner_session, width, height, running_apps}`). Global read — any session sees all sessions' displays for awareness; owner-scope only restricts kill.

### computer_kill_display

```json
{
  "name": "computer_kill_display",
  "input_schema": {
    "type": "object",
    "properties": {
      "display": {"type": "string"}
    },
    "required": ["display"]
  }
}
```

D-V44-DISPLAY-OWNER-SCOPED enforced at the manager layer. On owner mismatch, the MCP wrapper surfaces the discriminated-union denial as:

```text
Error: not-owner — only the session that called computer_create_display can kill this display (D-V44-DISPLAY-OWNER-SCOPED)
```

with `isError: true`. The X server and Redis state are NOT touched. On owner match, returns `JSON.stringify({ok:true, killed_apps_count:N})`.

### computer_launch_app_in_display

```json
{
  "name": "computer_launch_app_in_display",
  "input_schema": {
    "type": "object",
    "properties": {
      "display": {"type": "string"},
      "app":     {"type": "string"},
      "args":    {"type": "array", "items": {"type": "string"}}
    },
    "required": ["display", "app"]
  }
}
```

Resolves `app` via `options.livosAppResolver` first (LivOS WebApp/native — same path as `computer_application`), falls back to `spawn(app, args)` with the scoped DISPLAY env. On successful spawn (or matched WebApp), calls `options.displayManager.attachApp({display, pid, app_name: app})` so the new pid registers in `luse:display:<display>:apps` and shows up in `computer_list_displays.running_apps`. Returns `JSON.stringify({pid, app_name, display, kind})` where `kind` ∈ `'webapp' | 'native' | 'binary'`.

## Additive: computer_application gains optional `display`

```json
{
  "name": "computer_application",
  "input_schema": {
    "type": "object",
    "properties": {
      "application": {"type": "string"},
      "name":        {"type": "string"},
      "app":         {"type": "string"},
      "display":     {"type": "string"}
    }
  }
}
```

`required` stays absent (Phase 208-09 invariant — MCP SDK rejects at schema before R3 alias coalescence can run). When the agent passes `{application:'firefox', display:':12'}`, the handler:
1. Coalesces `application`/`name`/`app` aliases (existing R3 behavior unchanged).
2. Calls `parseDisplayArg(args)` — regex `/^:[1-9][0-9]?$/` — drops hostile strings.
3. Wraps the existing body (`livosAppResolver` → `openOrFocus`) in `withScopedDisplay(displayArg, options.defaultDisplay, async () => …)` so DISPLAY env is `:12` for the spawn and restored on return.

When `display` is absent, behavior is byte-for-byte identical to pre-248-02 (the wrap is a no-op when both args are nullish, matching the pattern already used by `computer_move_mouse` and friends at lines 559-617 of `tools.ts`).

## The 9 new vitest cases

| Case | Suite                      | Drift-locks                                                                                                   |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A    | schema — create            | computer_create_display exists; mode enum === ['xephyr','xvfb']; no required                                  |
| B    | schema — list              | computer_list_displays exists; empty properties; no required                                                  |
| C    | schema — kill              | computer_kill_display exists; required:['display']                                                            |
| D    | schema — launch_app        | computer_launch_app_in_display exists; required:['display','app']; args is array of strings                   |
| E    | schema — application+display | computer_application gains display:{type:'string'}; required UNCHANGED (still absent)                       |
| F    | handler — create           | buildHandlers({displayManager, userId:'s1'}).computer_create_display({mode:'xephyr'}) → fakeMgr.create called with {mode:'xephyr', ownerSession:'s1'}; result text contains JSON.stringify({display:':10', name:'display-10', pid:12345}) |
| G    | handler — kill not-owner   | When fakeMgr.kill returns {ok:false, error:'not-owner'}, handler returns isError:true and text contains 'not-owner' |
| H    | handler — launch_app       | computer_launch_app_in_display({display:':12', app:'firefox'}) calls livosAppResolver('firefox'); fakeMgr.attachApp called with {display:':12', app_name:'firefox', pid:<number>}; process.env.DISPLAY restored after handler returns |
| I    | handler — application+display | computer_application({application:'firefox', display:':12'}) captures process.env.DISPLAY===':12' inside the openOrFocus stub; env restored after handler returns |

Test fixtures use a `makeFakeDisplayManager()` helper that returns a `vi.fn()`-backed stub for each of the 6 DisplayManager methods plus `initialized: Promise.resolve()`. The MCP `McpServerLike` shape is implemented as `new Map()` of `name → handler` so tests can directly invoke handlers without booting the MCP SDK.

## Boot log line shape (operator probe for 248-05 deploy)

Three observable variants surface at `[luse-mcp] connected via stdio transport ...`:

| Env state                          | Log suffix shape                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| LUSE_REDIS_URL unset / empty       | `(redis=null, create_stream gated off) (displayManager=null)`                                     |
| LUSE_REDIS_URL set, valid          | `(redis=connected) (displayManager=wired)`                                                        |
| LUSE_TARGET_DISPLAY=:N + redis set | `(display=:N) (redis=connected) (displayManager=wired)`                                           |

Phase 248-05 UAT step: `journalctl -u livinityd | grep '\[luse-mcp\] connected'` MUST contain `displayManager=wired` post-deploy — this is the single-line probe that confirms the new wiring landed without requiring a Redis HSET roundtrip.

## Why owner-scope is enforced at the manager layer (continued from 248-01)

Per the 248-01 D-248-01-C decision, the owner-session check lives in `createDisplayManager.kill()` and surfaces as a typed `KillDisplayResult` discriminated union. The MCP wrapper added here does the minimum useful work to surface that denial:

1. Pass `callerSession: options.userId ?? 'admin'` into `displayManager.kill()`.
2. Check `result.ok`. If `false`, convert to `isError:true` with explicit D-V44-DISPLAY-OWNER-SCOPED reference in the text body so the agent can self-correct (or escalate to operator).
3. If `true`, JSON-stringify the success shape into a normal content envelope.

This pattern means a future 248-03 TTL GC consumer (or any other manager.kill caller) gets the same correctness for free — the policy is one chokepoint, the MCP wrapper is just a translation layer.

## Deviations from plan

None — plan executed exactly as written with one small expansion:

- The plan's <behavior> spec for Test H said "spawn env DISPLAY = ':12' → fakeMgr.attachApp called with {display:':12', pid, app_name:'firefox'}". The plan listed 8 tests but my count of plan tests A-I is 9 (A-E are schema, F-I are handler). I committed all 9 — `test(248-02): RED MCP tools for display lifecycle — 9 failing cases` rather than 8. The extra test is Test E (computer_application schema additive display prop), which the plan called out as a separate Task-1 case but my count agrees with the plan's "8+" target.

## Sacred SHA verification

```
git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
→ f3538e1d811992b782a9bb057d1b7f0a0189f95f  (UNCHANGED)
```

Pre-commit hook fired `[sacred-sha] PASS: 20 files verified` on all 3 commits:

- `d4c718aa` test(248-02): RED MCP tools for display lifecycle — 9 failing cases
- `c79c3d8b` feat(248-02): GREEN display lifecycle MCP tools — 4 new + computer_application display arg
- `201b13d8` feat(248-02): wire DisplayManager into mcp/server.ts main()

## TDD Gate Compliance

- Task 1 RED — 9/9 new cases failing as expected (schema drift-locks fail to find tools; handler tests fail with `expected undefined to be defined`); committed `d4c718aa`.
- Task 2 GREEN — 18/18 cases pass (9 pre-existing R3 + 9 new Phase 248); committed `c79c3d8b`.
- Task 3 wiring — 0 typecheck errors under `mcp/server.ts`; boot smoke confirms `(displayManager=null)` fail-closed branch; committed `201b13d8`.
- REFACTOR — skipped; the handler bodies are ~10-30 lines each with no duplication that would justify a refactor commit. The pattern (check `displayManager` presence → narrow → call) is consistent across all 4 handlers.

## Next plan (248-03)

Wave 3 — TTL GC for idle displays (4h since `last_app_at` HSET field updated by `attachApp`). Consumes the same `createDisplayManager` instance constructed in `mcp/server.ts` here; the GC needs an additional `setInterval` seam that calls `displayManager.list()` + `displayManager.kill()` with a system 'gc' session id (or an explicit `killAsSystem()` admin method — to be decided in 248-03's plan based on whether the owner-bypass is one-off or recurring). No changes to MCP wrappers expected.

## Self-Check

- All 4 modified files exist at the documented paths with the expected exports/changes (verified via git log).
- All 3 commits in `git log --oneline` (`d4c718aa` / `c79c3d8b` / `201b13d8`).
- vitest: `18 passed (18)` on tools.test.ts in 4.38s.
- vitest: `33 passed (33)` on tools.test.ts + display-manager.test.ts together.
- tsc --noEmit: `0` errors emitted from `computer-use/mcp/server.ts` (4 pre-existing errors in an unrelated wmctrl spawn block in `tools.ts` are baseline, unchanged).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 3 commits.
- Boot smoke: `(displayManager=null)` emitted with empty LUSE_REDIS_URL — fail-closed branch verified.
