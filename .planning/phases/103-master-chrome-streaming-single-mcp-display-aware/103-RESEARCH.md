# Phase 103: Master Chrome Streaming + Single-MCP Display-Aware — Research

**Researched:** 2026-05-11
**Domain:** X11 process orchestration (Xvfb / x11vnc / xdotool) + MCP server tool-schema redesign + React noVNC viewer embedding
**Confidence:** HIGH (this is a pure reuse-and-refactor phase — every primitive the work needs already exists and is verified in production on the Mini PC; the architecture decisions are not novel discovery, they are composition of 102 building blocks).

## Summary

Phase 103 closes the **last two functional regressions** observed during the Phase 102 r14 UAT on the Mini PC. The architectural pivots in 102 (per-app Xvfb + per-app Chrome subprocess + master profile seed + x11vnc whole-display capture + LUSE_TARGET_DISPLAY env scoping) are all sound and all live; 103 simply applies the **same** pattern to two stragglers that were left out of 102:

1. **Sub-goal A — Master Chrome streaming.** Phase 102-07 shipped `chromeMaster.startLogin` as `sudo -u bruce DISPLAY=:0 google-chrome --user-data-dir=/opt/livos/data/chrome-master` (master-login-routes.ts:181-208). On a headless Mini PC `:0` has no monitor — so the spawned window is *unreachable*. The fix is mechanical: allocate a managed Xvfb display via the existing `DisplayAllocator` (102-01), spawn the master Chrome on it via the existing `ChromeProcessSpawner` shape (102-02) but with `--user-data-dir=/opt/livos/data/chrome-master/` **bypassing profile-seeder** (the master IS the seed), wire `spawnVncForDisplay` (102-09 sugar wrapper) + `StreamManager.startStream` to expose a `wsUrl`, and embed `useWebAppVnc(wsUrl)` into `master-chrome-login.tsx`. Input dispatch (click/key/scroll) reuses the `dispatchPointer / dispatchKey / dispatchType / dispatchScroll` display-mode path already in `input-dispatcher.ts` (which has `(wid === 0 || !Number.isInteger(wid)) && display` branches that resolve Chrome via `xdotool search --class chrome` on the target display — *exactly* what the master needs).

2. **Sub-goal B — Single global luse MCP, per-call `display` arg.** Phase 102 r7 reverted to per-WebApp MCP because the host `luse` (scoped to `:1`) couldn't see `:10`/`:11`. That worked but lit up the Claude Code wildcard-permission prompt (one MCP entry per WebApp = repeated permission grants). Sub-goal B unblocks that by **giving every relevant luse tool an optional `display?: ":N"` arg**, threading it through `LuseToolsOptions` → handler factory → native primitives (which already accept a `display` opt in input-dispatcher.ts and execFile env injection in tools.ts:836-852). The host-display global luse instance — already registered as the canonical `luse` MCP at boot — gains the ability to drive any X display from a per-call param, eliminating both the per-WebApp registrations and the permission prompts. Default fallback: `LUSE_TARGET_DISPLAY` env (existing — Phase 102-06).

**Primary recommendation:** Treat 103 as **two parallel, file-disjoint plans plus a thin UI-integration plan plus a user-walked deploy**. Sub-goal A wave (102-01/02/09 reuse + master-login-routes refactor + UI viewer) is fully orthogonal to sub-goal B wave (tools.ts schema add + handler param read + window-manager LIVOS_PER_APP_LUSE flip). They share no files and can run as a single parallel wave. The risk surface is small — every primitive is battle-tested; the new code is composition, not invention.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Master Chrome process spawn on managed Xvfb | Backend (livinityd) | — | Owns DisplayAllocator + XvfbSpawner + ChromeProcessSpawner; UI cannot reach `sudo -u bruce` directly. |
| Master Chrome → noVNC viewer | Frontend (UI) | Backend (streaming) | Backend exposes `wsUrl`; UI hosts the noVNC RFB instance via `useWebAppVnc`. |
| Master Chrome input dispatch (click/key/scroll) | Backend (livinityd) | Frontend (UI) | Frontend translates DOM events to FB coords; backend xdotool executes against the master's `:N`. |
| Single-MCP display-aware tool dispatch | Backend (livinityd) | — | MCP server lives in livinityd process; agent calls flow through `computer-use/mcp/server.ts` + `tools.ts` handlers. |
| Agent prompt: "pass display arg" | Backend (livinityd) | — | `buildActiveDisplaySnippet` in `agent-prompt-builder.ts` already injects ActiveDisplayContext; 103 just expands the instruction text. |
| MCP config registration (drop per-WebApp) | Backend (livinityd) | — | `window-manager.ts` registerWebAppMcp call is the on/off switch. |

## User Constraints (from ROADMAP.md + Bug B mandate; no formal CONTEXT.md yet)

### Locked Decisions

- **No per-WebApp Luse MCP by default** — `LIVOS_PER_APP_LUSE=0` becomes the production default. Per-WebApp registration code stays in window-manager.ts as an `LIVOS_PER_APP_LUSE=1` opt-in for token-budget / debugging.
- **Single global `luse` MCP** with `display?` param on the relevant tools. Per-call scoping replaces per-WebApp MCP scoping.
- **Master Chrome streams** through the existing per-WebApp pipeline (Xvfb + x11vnc + StreamManager + noVNC). The Settings UI embeds the viewer inline; the user logs in via that embedded view, no physical monitor required.
- **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** UNTOUCHED. Pre-commit hook enforces.
- **No Server4, no Server5** — Mini PC `bruce@10.69.31.68` is the only deploy target.

### Claude's Discretion

- Whether to keep `master` as a "virtual webapp" entry in `WebAppWindowManager` (and reuse `webapp.window.spawn` / `webapp.input.*` wholesale) **OR** add a parallel `chromeMaster.startStream` set of tRPC routes. **Recommendation:** parallel routes (cleaner separation; master profile is not a WebApp; lifecycle/admin gating differs).
- Whether the new master streaming lives in `chrome-master/master-login-routes.ts` as additional routes on the same router OR in a new `chrome-master/master-stream-routes.ts` file. **Recommendation:** same file — the routes share state (`currentMaster` singleton), and 4 routes total stays well under file-budget guidance.
- Whether to keep `--start-maximized` (102 r6) or switch the master to chromeless `--app=URL` for the login flow. **Recommendation:** keep `--start-maximized` with no `--app=URL` — the user needs to see the Chrome address bar and tabs to navigate Google login flows; chromeless mode (Phase 102 r5) blocks that exact use case.
- Display range slice for master: reuse the main `DisplayAllocator [10, 100)` (master takes one slot when active) OR dedicate `:9` as a fixed master display. **Recommendation:** allocate from the same pool — singleton lock on master prevents two concurrent masters; allocator is freed on exit.

### Deferred Ideas (OUT OF SCOPE)

- Two-way profile sync (auth changes in app A propagate back to master). Stays one-way master → apps.
- Per-app profile retention ("save this app's state for next launch").
- Master Chrome multi-account (multiple Google identities).
- Migrating the legacy per-WebApp MCP registration code out of window-manager.ts. Kept as `LIVOS_PER_APP_LUSE=1` opt-in for token-budget testing.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-103-A1 | `chromeMaster.startLogin` spawns Chrome on a managed Xvfb display (not `:0`) and returns `{wsUrl, streamId, display, pid, startedAt}`. | DisplayAllocator (102-01) + XvfbSpawner (102-01) + ChromeProcessSpawner shape (102-02 with master-profile path) + spawnVncForDisplay (102-09) + StreamManager.startStream({mode:'vnc-window', target:{display:':N'}}) — every primitive verified in production. |
| REQ-103-A2 | The Settings → Chrome Profile panel renders the master Chrome as an inline noVNC viewer when `running:true`. | useWebAppVnc(wsUrl) hook (95-04) reusable as-is; status query already polls every 2s. |
| REQ-103-A3 | The user can interact with the embedded viewer (click Google login, type credentials, scroll) — input forwarded via tRPC + xdotool. | dispatchPointer/Key/Type/Scroll (input-dispatcher.ts) already have the display-mode branch (`wid === 0 && display` → `xdotool search --class chrome ... windowactivate ... mousemove ... click`). |
| REQ-103-A4 | On master Chrome exit (user closes window OR `chromeMaster.stopLogin`), stream stops, x11vnc stops, Xvfb stops, display released, `currentMaster` cleared. | Existing exit watcher in master-login-routes.ts:204 + the 102-08 close-lifecycle pattern is the template. |
| REQ-103-B1 | `tools.ts` accepts optional `display?: ":N"` on at least these tools: `computer_screenshot`, `computer_click_mouse`, `computer_move_mouse`, `computer_drag_mouse`, `computer_press_mouse`, `computer_scroll`, `computer_type_keys`, `computer_press_keys`, `computer_type_text`, `computer_paste_text`, `computer_cursor_position`, `list_windows`, `screenshot_window`. | Handler factory `buildHandlers(opts)` already in place; native primitives (clickMouse, scroll, typeText) already accept the windowId opt — adding a display opt is a 5-line change per handler. |
| REQ-103-B2 | When `display` arg present, handler sets `DISPLAY=:N` env on the native primitive's execFile call (overriding LUSE_TARGET_DISPLAY default). | `screenshot_window` (tools.ts:836-852) already does the `prevDisplay = process.env.DISPLAY` ; `process.env.DISPLAY = targetDisplay` ; restore pattern. Extend to every X11-touching handler. |
| REQ-103-B3 | Default fallback when no `display` arg: `LUSE_TARGET_DISPLAY` env (host = `:1`). Backwards compat: existing per-app callers via LUSE_TARGET_DISPLAY env continue to work. | resolveDisplay() in mcp/server.ts:67 already implements LUSE_TARGET_DISPLAY → LUSE_DISPLAY → DISPLAY precedence. |
| REQ-103-B4 | `buildActiveDisplaySnippet` updated to instruct the agent to **always pass `display: ":N"` as a tool arg** when scoping to active WebApp. | agent-prompt-builder.ts:204-209 — update the closing instruction line; existing test suite (agent-prompt-builder.test.ts:219-301) covers regex guard + content invariants. |
| REQ-103-B5 | `LIVOS_PER_APP_LUSE` default flipped to `'0'` (per-WebApp MCP registration skipped). | window-manager.ts:500 — one-line flip + test update (window-manager.test.ts:395-471 already covers env override). |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @novnc/novnc | 1.6.0 | VNC RFB client for embedded viewer | [VERIFIED: livos/packages/livinityd/package.json:70] — already in the tree, already used by `useWebAppVnc`. |
| @modelcontextprotocol/sdk | 1.25.x | MCP server SDK (server + stdio transport) | [VERIFIED: livos/packages/livinityd/source/modules/computer-use/mcp/server.ts:41-42] — already wired; tool schema additions don't require version bumps. |
| ioredis | (project pin) | Redis client for MCP child | [VERIFIED: project memory] — Redis is named export, not default. |
| zod | (project pin) | Tool input schema validation | [VERIFIED: tools.ts:38] — already used; new `display` zod property is `z.string().optional()` with regex refine. |
| @trpc/server | (project pin) | tRPC route registration | [VERIFIED: master-login-routes.ts:62] — adminProcedure / privateProcedure already in use. |
| vitest | ^2.1.2 | Unit test framework | [VERIFIED: livos/packages/livinityd/package.json:58] — test:run script: `vitest run --testTimeout 180000 --hookTimeout 180000 --maxConcurrency 1 --poolOptions.threads.singleThread true`. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:child_process spawn | builtin | Xvfb / Chrome / x11vnc / xdotool spawn | Every primitive in 102 already uses this; never shell out via `sh -c` (path-injection surface). |
| node:fs/promises | builtin | Profile dir mkdir / access | Master profile seeder uses this; reuse for any new dir checks. |
| node:crypto randomUUID | builtin | Per-app uuid for `/tmp/livos-chrome-app-<uuid>` | Master Chrome doesn't need this — master uses `/opt/livos/data/chrome-master/` directly. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing master-login-routes.ts file | New chrome-master/master-stream-routes.ts | Same-file keeps `currentMaster` singleton local; cross-file would require export + risk of two singletons drifting. **Reuse.** |
| Allocating master display from main pool | Dedicated `:9` slot | Dedicated `:9` reserves a fixed range but breaks the symmetry that "every Xvfb is allocator-managed". **Use main pool.** |
| Adding `display` to every single luse tool | Only adding to tools that touch X11 | `set_task_status`, `create_task`, `computer_wait`, `computer_read_file` are not X11-bound — skip them to keep the tool surface minimal. |
| New `chromeMaster.input.{click,key,type}` tRPC routes | Reuse `webapp.input.*` with virtual webappId='master' | New routes is cleaner — master is not a WebApp, the schema doesn't need `webappId`. But the dispatch handlers are 95% identical, so a thin parallel route is cheaper than a refactor of the webapp router. **New routes.** |

**Installation:** No new dependencies. Phase 103 is a pure refactor + composition of existing primitives.

**Version verification:** Confirmed against `livos/packages/livinityd/package.json` — `@novnc/novnc 1.6.0`, `vitest 2.1.2`, `@vitest/coverage-v8 2.1.2`. Pre-commit hook enforces sacred SHA at `liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.

## Architecture Patterns

### System Architecture Diagram

```
SUB-GOAL A — Master Chrome Streaming
======================================

[ Settings page in browser ]
       |
       | (1) user clicks "Open Master Chrome"
       v
[ master-chrome-login.tsx ]
       |
       | (2) trpcReact.chromeMaster.startLogin.useMutation()
       v
[ chromeMaster.startLogin tRPC route ]  (admin-only)
       |
       | (3) singleton check (currentMaster === null?)
       | (4) allocate display = displayAllocator.allocate()  -> e.g. 42
       | (5) xvfb = await spawnXvfb({display: ':42', width: 1280, height: 720})
       | (6) chrome = await spawnChromeProcess({
       |        display: ':42',
       |        userDataDir: '/opt/livos/data/chrome-master',   // <-- MASTER (no profile-seed)
       |        url: 'https://accounts.google.com',
       |     })
       | (7) port = portAllocator.allocate()
       | (8) x11vnc = spawnVncForDisplay({display: ':42', rfbPort: port})
       | (9) {streamId, wsUrl} = streamManager.startStream({
       |        userId, mode: 'vnc-window', target: {display: ':42'},
       |     })  // attaches into the existing /ws/stream/:streamId bridge
       | (10) currentMaster = {pid, child, display, port, streamId, ...}
       | (11) chrome.on('exit') -> stop(x11vnc, xvfb), release(port, display),
       |       clear(currentMaster), streamManager.stopStream(streamId)
       v
[ {pid, startedAt, wsUrl, streamId, display: ':42'} ]
       |
       | (12) UI: render <useWebAppVnc(wsUrl)> in panel
       v
[ embedded noVNC viewer renders pixels of master Chrome on :42 ]


  DOM event in viewer
       |
       v
[ trpcReact.chromeMaster.input.{click|key|type|scroll}.useMutation() ]
       |
       v
[ chromeMaster.input.click route ]
       |  -> dispatchPointer(wid=0, x, y, button, kind, display=':42')
       |     which runs: xdotool search --onlyvisible --class chrome
       |                 windowactivate %@ windowfocus %@
       |                 mousemove X Y  click BTN
       |     with DISPLAY=':42'
       v
[ master Chrome on :42 receives focus + real button event ]



SUB-GOAL B — Single global luse MCP, per-call display arg
==========================================================

OLD (Phase 102 r7..r9):
   liv-core (agent)
        |
        +-- mcp__luse__*                       (host :1, no per-WebApp scope)
        +-- mcp__luse:webapp:yandex-91c9__*    (per-app :10)
        +-- mcp__luse:webapp:google-a3a1__*    (per-app :11)
        +-- mcp__luse:webapp:livinityio-bb22__*(per-app :12)
                                               <- Claude Code wildcard permission prompt
                                                  fires per registration.

NEW (Phase 103):
   liv-core (agent)
        |
        +-- mcp__luse__*  with display: ':N' optional arg
              |
              v
   [ tools.ts handler for e.g. computer_click_mouse ]
        |  reads args.display || defaultDisplay (LUSE_TARGET_DISPLAY env)
        |
        +-- if display set: process.env.DISPLAY = display
        |   (or pass into execFile env override)
        |
        v
   [ native primitive (xdotool / maim) inherits DISPLAY=:N ]
        |
        v
   [ targets :10 OR :11 OR :12 by per-call routing ]


   Agent prompt (buildActiveDisplaySnippet at turn-N) instructs:
       "Active X11 display: :11
        When calling Luse tools, ALWAYS pass display: ':11' to scope
        to this WebApp. Coordinate space is 1280x720 native."
```

### Recommended Project Structure

```
livos/packages/livinityd/source/modules/
  chrome-master/
    master-login-routes.ts          # MODIFIED — add startStream/stopStream/input.* routes
    master-login-routes.test.ts     # MODIFIED — new tests for Xvfb spawn + stream + input
    profile-seeder.ts               # UNTOUCHED
    index.ts                        # MODIFIED — export new routes
  streaming/
    display-allocator.ts            # UNTOUCHED (reused)
    xvfb-spawner.ts                 # UNTOUCHED (reused)
    vnc-bridge.ts                   # UNTOUCHED (spawnVncForDisplay reused)
    stream-manager.ts               # UNTOUCHED (startStream {mode:'vnc-window', target:{display}} reused)
  webapps/
    chrome-process-spawner.ts       # POSSIBLY MODIFIED — allow USER_DATA_DIR regex to permit /opt/livos/data/chrome-master
    chrome-process-spawner.test.ts  # MODIFIED if above
    input-dispatcher.ts             # UNTOUCHED — display-mode path already exists
    window-manager.ts               # MODIFIED — flip LIVOS_PER_APP_LUSE default to '0'
    window-manager.test.ts          # MODIFIED — adjust the default-on test
  computer-use/
    mcp/
      server.ts                     # UNTOUCHED (resolveDisplay already in place)
      tools.ts                      # MODIFIED — add display param + handler env-injection
      tools.test.ts                 # MODIFIED — display-arg coverage
    luse-tools.ts                   # MODIFIED — add display property to relevant tool schemas
  ai/
    agent-prompt-builder.ts         # MODIFIED — update buildActiveDisplaySnippet instruction text
    agent-prompt-builder.test.ts    # MODIFIED — assert new instruction text

livos/packages/ui/src/
  modules/settings/
    master-chrome-login.tsx         # MODIFIED — wire useWebAppVnc + input handlers
    master-chrome-login.test.tsx    # MODIFIED — viewer mount + status branching
```

### Pattern 1: Reuse the 102 spawn-cascade for Master

**What:** Master Chrome reuses the same Wave 1 building blocks as a WebApp does — DisplayAllocator → XvfbSpawner → ChromeProcessSpawner → PortAllocator → spawnVncForDisplay → StreamManager.startStream — with one difference: **skip profile-seeder** and pass `userDataDir = '/opt/livos/data/chrome-master/'` directly.

**When to use:** Sub-goal A. This pattern is the canonical Phase 102 entry path.

**Example:**
```typescript
// Source: livos/packages/livinityd/source/modules/webapps/window-manager.ts:400+ (existing pattern)
// New master-login-routes.ts startStream branch:

const displayN = displayAllocator.allocate()           // -> 42
const display = `:${displayN}`
const xvfb = await spawnXvfb({display, width: 1280, height: 720})
const chrome = await spawnChromeProcess({
  display,
  userDataDir: '/opt/livos/data/chrome-master',        // <-- MASTER PATH (no profile-seed)
  url: 'https://accounts.google.com',
})
const rfbPort = streamManager.getPortAllocator().allocate()
const x11vnc = spawnVncForDisplay({display, rfbPort})
const stream = streamManager.startStream({
  userId,
  mode: 'vnc-window',
  target: {display},
})
currentMaster = {
  pid: chrome.pid,
  child: chrome.child,
  display,
  displayN,
  rfbPort,
  streamId: stream.streamId,
  wsUrl: stream.wsUrl,
  xvfb,
  x11vnc,
  chrome,
  startedAt: Date.now(),
}
chrome.child.on('exit', () => {
  void cleanupMaster()   // see Pattern 3
})
return {pid: chrome.pid, startedAt, wsUrl: stream.wsUrl, streamId: stream.streamId, display}
```

**One catch:** `chrome-process-spawner.ts` line 44-45 has a regex that REJECTS userDataDir paths outside `/tmp/livos-chrome-app-<uuid>`:

```typescript
const USER_DATA_DIR_RE =
  /^\/tmp\/livos-chrome-app-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
```

This will reject `/opt/livos/data/chrome-master`. Two choices:

1. **Widen the regex** to accept either the per-app shape OR `/opt/livos/data/chrome-master`. **Recommended.** Add a `|` alternative for the master path. T-103-A1 threat surface is limited because the master path is a hardcoded constant in the route, not a caller-controlled value.
2. **Bypass spawnChromeProcess** for the master and inline a similar spawn shape directly in master-login-routes.ts. Loses the input validation and exit-watcher boilerplate that 102-02 invested in.

Recommendation: option 1, with a comment naming `T-103-A1` (constant master-dir is gate-validated by adminProcedure + module-singleton currentMaster lock).

### Pattern 2: Master input dispatch via reused input-dispatcher

**What:** The viewer in master-chrome-login.tsx forwards click/key/scroll events via NEW tRPC routes `chromeMaster.input.click|key|type|scroll`. These routes call `dispatchPointer / dispatchKey / dispatchType / dispatchScroll` from `webapps/input-dispatcher.ts` with `wid=0, display=':N'`.

**When to use:** Sub-goal A. The existing display-mode branch in input-dispatcher.ts (lines 103-116, 160-172, 199-211, 264-277) already handles `wid === 0 && display` by running `xdotool search --class chrome ... windowactivate ... mousemove ... click` against the target display. It needs zero modification for master use.

**Example:**
```typescript
// New route in master-login-routes.ts:
input: router({
  click: adminProcedure
    .input(z.object({x: z.number(), y: z.number(), button: z.number().int().min(1).max(3), kind: z.enum(['click','mousedown','mouseup','doubleclick']).default('click')}))
    .mutation(async ({input}) => {
      if (currentMaster === null) throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'no master Chrome running'})
      await dispatchPointer(0, input.x, input.y, input.button as MouseButton, input.kind, currentMaster.display)
      return {ok: true}
    }),
  // key, type, scroll analogous
})
```

### Pattern 3: Ordered cleanup on master exit

**What:** Mirror Phase 102-08's 8-step ordered teardown.

**When to use:** Sub-goal A, both on user-initiated `chromeMaster.stopLogin` AND on the `chrome.child.on('exit')` watcher.

**Example:**
```typescript
async function cleanupMaster(): Promise<void> {
  if (currentMaster === null) return
  const m = currentMaster
  currentMaster = null
  // 1. stop stream (also signals x11vnc clean exit via StreamManager.stopStream's SIGTERM)
  try { await streamManager.stopStream(m.streamId) } catch (e) { log.warn('cleanup: stopStream', e) }
  // 2. SIGTERM x11vnc directly as belt-and-braces (StreamManager kills it but double-kill is idempotent)
  try { m.x11vnc.kill('SIGTERM') } catch {}
  // 3. SIGTERM chrome (if not already exited)
  try { await m.chrome.stop() } catch (e) { log.warn('cleanup: chrome.stop', e) }
  // 4. SIGTERM xvfb
  try { await m.xvfb.stop() } catch (e) { log.warn('cleanup: xvfb.stop', e) }
  // 5. release port + display
  streamManager.getPortAllocator().release(m.rfbPort)
  displayAllocator.release(m.displayN)
  // NOTE: master profile dir NOT cleaned — that's persistent state by design.
  log.info(`master Chrome cleaned up (display=${m.display}, port=${m.rfbPort})`)
}
```

### Pattern 4: Single-MCP per-call display arg

**What:** Every X11-touching luse tool accepts `display?: string` matching `/^:[1-9][0-9]?$/`. When set, the handler temporarily overrides `process.env.DISPLAY` for the duration of the native primitive call (and restores in `finally`). When unset, the handler uses `LuseToolsOptions.defaultDisplay` (which is the `LUSE_TARGET_DISPLAY` env value from `resolveDisplay()` at MCP boot).

**When to use:** Sub-goal B.

**Example (extension of tools.ts:836-852 screenshot_window pattern, applied to every X11 handler):**
```typescript
// Generic display-scoped wrapper used by every X11 handler:
async function withScopedDisplay<T>(display: string | undefined, defaultDisplay: string | undefined, fn: () => Promise<T>): Promise<T> {
  const target = display ?? defaultDisplay
  if (target === undefined) return fn()
  const prev = process.env.DISPLAY
  try {
    process.env.DISPLAY = target
    return await fn()
  } finally {
    if (prev === undefined) delete process.env.DISPLAY
    else process.env.DISPLAY = prev
  }
}

// Applied to e.g. computer_click_mouse handler:
computer_click_mouse: async (args) => {
  const display = (typeof args.display === 'string' && /^:[1-9][0-9]?$/.test(args.display))
    ? args.display
    : undefined
  return withScopedDisplay(display, options.defaultDisplay, () =>
    withPostScreenshot(
      `clickMouse ${summarizeArgs(args)}`,
      () => clickMouse({...args as never, windowId: wid(args)}),
      wid(args),
    ),
  )
}
```

**Key invariant:** `process.env.DISPLAY` mutations MUST be in a `try/finally` block because handlers may run concurrently in the MCP child (the `await` inside the handler yields the event loop). Mutating a shared process.env from concurrent contexts is a known footgun — for sub-goal B v1, vitest tests should assert serial behavior (the singleThread vitest config already enforces this in tests), and the runtime MCP child process serializes tool calls via the JSON-RPC stdio protocol anyway. **Document this assumption.** A future v2 could pass display via execFile env arg directly without touching process.env.

### Anti-Patterns to Avoid

- **Spawning master Chrome on `:0` with sudo.** This is what 102 ships; the headless Mini PC has no monitor on `:0` so the user sees nothing. Replace with managed-Xvfb path.
- **Adding `display` arg without regex-guarding it.** The arg flows into `process.env.DISPLAY` which xdotool concatenates into X11 socket paths. Regex-guard to `/^:[1-9][0-9]?$/` at the handler boundary (same regex as PerWebAppMcpDescriptor.display in luse-mcp-config.ts:133).
- **Forgetting to restore process.env.DISPLAY in finally.** A handler that throws mid-call could leave DISPLAY pointing at `:42` after the call returns, poisoning every subsequent tool call. Always restore.
- **Bypassing the master singleton lock.** If `chromeMaster.startLogin` is called twice concurrently before the first chrome.on('exit') fires, both spawns will fight over `/opt/livos/data/chrome-master/SingletonLock`. The existing `currentMaster === null` check in master-login-routes.ts:174-179 handles this — keep it.
- **Using `--app=URL` for the master.** The user needs the address bar to navigate Google's multi-step login. Chromeless mode breaks this. Use plain `url` positional (same as chrome-process-spawner.ts:239 fix).
- **Triggering `webapp.window.spawn` from the master flow.** That path enforces the per-app /tmp profile-seed and the chrome-process-spawner USER_DATA_DIR regex — both wrong for master. Parallel `chromeMaster.startStream` route is cleaner.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| X11 display allocation | Custom display-number tracker | `DisplayAllocator` from 102-01 | Linear-walker + release-back, capacity 90 — battle tested. |
| Xvfb spawn + readiness | Custom poll loop | `spawnXvfb` from 102-01 | xdpyinfo readiness poll + SIGKILL on timeout already done. |
| Chrome subprocess + cleanup | Custom spawn | `spawnChromeProcess` from 102-02 (with widened USER_DATA_DIR regex) | Validates url/userDataDir/display + stderr tail + idempotent stop(). |
| x11vnc + WS bridge | Custom byte pipe | `spawnVncForDisplay` + `StreamManager.startStream` + `attachVncBridge` | 4 MB backpressure, ECONNREFUSED retry, ws ↔ tcp pipe — already shipped. |
| RFB client in browser | Hand-rolled WebSocket protocol | `useWebAppVnc(wsUrl)` from `livos/packages/ui/src/hooks/use-webapp-vnc.ts` | scaleViewport, ResizeObserver, backoff reconnect — all done. |
| xdotool click/key/scroll dispatch | Custom xdotool argv | `dispatchPointer / dispatchKey / dispatchType / dispatchScroll` from `input-dispatcher.ts` | Activate-first + windowfocus chain already proven against Chrome XSendEvent filter. |
| MCP tool schema → Zod | Hand-rolled Zod build | `jsonSchemaToZodRawShape` in tools.ts:651 | Already handles object/string/number/boolean/enum/array/nested. |
| Active display prompt snippet | Custom prompt-building logic | `buildActiveDisplaySnippet` in agent-prompt-builder.ts | Already regex-guards display string + sanitizes appMeta. |

**Key insight:** Phase 102 has built the entire toolkit. Phase 103 is **composition**, not invention. Any plan that introduces a new primitive should be challenged: "why isn't 102 enough?"

## Runtime State Inventory

This is **partly** a rename/refactor phase (sub-goal B drops per-WebApp MCP registrations from production), so the inventory matters.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Redis keys: `liv:config:luse_can_create_streams` (untouched), `liv:config:primary_provider` (untouched), per-WebApp MCP registrations stored under McpConfigManager Redis keys (canonical key shape: prefix `liv:mcp:server:<name>`, see legacy-bytebot-cleanup.ts for the exact path). When `LIVOS_PER_APP_LUSE` flips to `'0'` the per-WebApp `luse:webapp:<slug>-<suffix>` entries from prior boots remain in Redis until the WebApp is reopened or the cleanup path runs. | **103 cleanup step:** mirror the `cleanupLegacyBytebotState` pattern from agent-runs.ts:195-208. Add a new `cleanupOrphanedPerWebAppLuseEntries` that iterates McpConfigManager.listServers(), filters `name.startsWith('luse:webapp:')`, and calls removeServer on each. Wire after `cleanupLegacyBytebotState` in agent-runs.ts boot path. **Idempotent + non-fatal**, matching the 100-10-09 pattern. |
| Live service config | None — Phase 103 changes are code-only. No n8n / Datadog / Cloudflare touch. | None. |
| OS-registered state | `livos.service` / `liv-core.service` / `liv-worker.service` / `liv-memory.service` systemd units — restart on deploy, no name change needed. | None. |
| Secrets / env vars | `LIVOS_PER_APP_LUSE` env var — currently effective-default `'1'` (per-app on); 103 flips effective-default to `'0'`. No .env on Mini PC currently sets this explicitly (verified by inspecting window-manager.ts:500 — `process.env.LIVOS_PER_APP_LUSE !== '0'`). | **No .env change required.** Code-default flip from "anything-but-0" to "anything-but-1" is the only edit. Operators who want the legacy per-app MCP path can set `LIVOS_PER_APP_LUSE=1` explicitly. |
| Build artifacts / installed packages | None — no package version changes. | After deploy: `bash /opt/livos/update.sh` rebuilds tsx-transpiled livinityd + UI; pnpm-store quirk applies (memory note about `@livos+config*` → `@liv+core*` post-65-04). |

**Verified nothing-found:** No SOPS keys reference per-WebApp luse names; no Windows Task Scheduler / launchd / pm2 process names embed them; no pip egg-info / Docker image tags affected.

## Common Pitfalls

### Pitfall 1: chrome-process-spawner USER_DATA_DIR regex rejects master path

**What goes wrong:** `spawnChromeProcess({userDataDir: '/opt/livos/data/chrome-master', ...})` throws `ChromeProcessSpawnError('CHROME_INVALID_USERDATADIR')` at chrome-process-spawner.ts:182-187 because the regex (line 44-45) only accepts `/tmp/livos-chrome-app-<uuid>`.

**Why it happens:** 102-02 was hardened against caller-controlled paths (T-102-02 threat); the regex was deliberately narrow. The master path isn't caller-controlled but the validator doesn't know that.

**How to avoid:** Widen the regex to accept either the per-app uuid shape OR the constant master path:
```typescript
const USER_DATA_DIR_RE =
  /^(\/tmp\/livos-chrome-app-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|\/opt\/livos\/data\/chrome-master)$/
```
Add a comment naming T-103-A1 and explaining the master path is a hardcoded constant in master-login-routes.ts.

**Warning signs:** `ChromeProcessSpawnError: userDataDir must match /^...$/` in livinityd logs immediately after Open Master Chrome click.

### Pitfall 2: process.env.DISPLAY shared state across concurrent handlers

**What goes wrong:** Two MCP tool calls in flight simultaneously — handler A sets `process.env.DISPLAY = ':10'`, handler B sets `process.env.DISPLAY = ':11'`, handler A awaits a native primitive that reads `process.env.DISPLAY` and gets `:11`.

**Why it happens:** Node.js is single-threaded but `await` yields the event loop. Async handlers that mutate global state race with each other.

**How to avoid:** Three options, increasing robustness:
1. **Document the assumption** that MCP child serializes tool calls (the stdio JSON-RPC protocol does this — one request, one response, one at a time per child). Vitest tests use `singleThread: true` so unit tests serialize too. **v1 default.**
2. Pass display via execFile env arg directly: every native primitive in `native/input.ts` would need a `display?: string` opt that flows into `{env: {...process.env, DISPLAY: display}}` in its execFile call. Touches a lot of files. **v2.**
3. AsyncLocalStorage to associate display per async-task. Heavier. **v3, only if v1 races in production.**

**Warning signs:** Tools call the right tool but the wrong display (e.g., agent calls `computer_screenshot {display:':10'}` but gets a screenshot of `:11`). Check `tools.test.ts` for serial vs parallel test patterns.

### Pitfall 3: chrome.on('exit') doesn't fire if Chrome crashes pre-spawn

**What goes wrong:** Master Chrome fails to spawn (binary missing, sudo permission denied) — the cleanupMaster watcher never fires, currentMaster stays set, the user can't retry.

**Why it happens:** The exit event only fires after a successful spawn-then-exit. Failed spawns reject from spawnChromeProcess.

**How to avoid:** Wrap the spawn cascade in a try/catch that calls cleanupMaster on rejection BEFORE re-throwing. The 102-04 window-manager.ts:520-572 compensating-cleanup pattern is the template.

**Warning signs:** "master chrome already running; close the existing window" CONFLICT error on the second startLogin click even though no Chrome window is visible. Check `currentMaster` state via `chromeMaster.status` (running: true but no Chrome process exists).

### Pitfall 4: noVNC viewer mounts before wsUrl returns

**What goes wrong:** master-chrome-login.tsx renders `<useWebAppVnc wsUrl={...}>` while `startMut.isPending === true` — the hook tries to connect to an undefined wsUrl.

**Why it happens:** React renders synchronously after the mutation starts; wsUrl is only available in `onSuccess`.

**How to avoid:** Gate the viewer render on `wsUrl !== null`:
```typescript
const [wsUrl, setWsUrl] = useState<string | null>(null)
// in startMut.onSuccess: setWsUrl(res.wsUrl)
{wsUrl !== null ? (
  <div ref={vnc.containerRef} className="h-[720px] w-[1280px]" />
) : (
  <p>Starting master Chrome…</p>
)}
```
Mirror the webapp-stream-window.tsx:159-202 pattern (spawn → wsUrl state → conditional viewer render).

**Warning signs:** Browser console "Failed to construct RFB" or "wsUrl is undefined" toast.

### Pitfall 5: LIVOS_PER_APP_LUSE flip leaves orphan MCP entries

**What goes wrong:** Pre-103 deploys registered `luse:webapp:yandex-91c9` etc. in McpConfigManager. After 103 flips the default to '0', those entries remain in Redis. liv-core sees ~10 stale luse:webapp:* MCP entries and still fires permission prompts.

**Why it happens:** The "skip registration" code path doesn't deregister existing entries.

**How to avoid:** Boot-time cleanup pass. Add `cleanupOrphanedPerWebAppLuseEntries(mcpConfigManager)` in agent-runs.ts immediately after `cleanupLegacyBytebotState`. Filter listServers() by `name.startsWith('luse:webapp:')` and removeServer each. Mirror the legacy-bytebot-cleanup pattern (idempotent, non-fatal, logged).

**Warning signs:** liv-core logs show `mcp__luse:webapp:yandex-91c9__list_windows` tools enumerated even after a fresh deploy with no WebApps open.

### Pitfall 6: x11vnc port conflict with concurrent WebApps

**What goes wrong:** Master Chrome takes display `:42` and rfbPort `15942`. User then opens 3 WebApps that take `:10`/`:11`/`:12` and rfbPorts `15910`/`15911`/`15912`. PortAllocator is shared so no collision — but if the allocator's release path on master cleanup is wrong, the master's port leaks and successive masters slowly exhaust the pool.

**Why it happens:** PortAllocator + DisplayAllocator are shared global resources; every spawn path MUST pair allocate with release in both success AND failure paths.

**How to avoid:** Run the cleanupMaster() routine through ALL exit paths (chrome.on('exit'), explicit stopLogin, startLogin throw in compensating cleanup). The 102-04 window-manager.ts compensating-cleanup block is the template — copy its structure verbatim.

**Warning signs:** `streamManager.getPortAllocator().inUseCount` climbs over time without WebApps actually being open. Boot the daemon and run `lsof -i :15900-:15999` — count of listeners should match active streams + master.

### Pitfall 7: Master profile chown breaks per-app seed-copy

**What goes wrong:** If master-login-routes.ts spawns Chrome as root (livinityd is root) and doesn't chown the master dir back to bruce, the bruce-owned per-app Chrome processes fail to read the master profile during cp -r.

**Why it happens:** profile-seeder.ts:244 ALREADY chowns the per-app dir to bruce post-copy, but the SOURCE (master) must be readable by bruce. If master Chrome ran as root and wrote root-owned cookies, the seed copy works (root → root cp; chown after) but normal-user `cp -r` from bruce would fail.

**How to avoid:** Always spawn master Chrome via `sudo -n -u bruce ...` (same shape as the per-app spawn). master-login-routes.ts:181 already does this — just keep the pattern.

**Warning signs:** profile-seeder logs `EACCES /opt/livos/data/chrome-master/Default/Cookies` during per-app spawn after a master login. Fix: `chown -R bruce:bruce /opt/livos/data/chrome-master`.

### Pitfall 8: Agent ignores the "always pass display" instruction

**What goes wrong:** Phase 103-B4 updates buildActiveDisplaySnippet to instruct the agent to pass `display: ':N'` on every Luse tool call. Claude might still call `computer_screenshot` without the display arg — the handler falls back to `LUSE_TARGET_DISPLAY` env which on host is `:1`. The agent sees the host desktop, not the active WebApp.

**Why it happens:** LLMs are imperfect instruction-followers; "always pass display" is best-effort.

**How to avoid:** Belt-and-suspenders defense:
1. Update prompt: "ALL your Luse tool calls MUST pass display: ':N'."
2. Update `LuseToolsOptions.defaultDisplay` resolution: when the agent context includes activeDisplay, set `LUSE_TARGET_DISPLAY=:N` BEFORE the agent's turn so even a missed display arg resolves to the right display.
3. Capture this via a unit test: assert that `buildHandlers({defaultDisplay: ':11'}).computer_screenshot({})` (no display arg) ends up reading `:11`, not `:1`.

**Warning signs:** UAT row "agent screenshots active WebApp" returns the host desktop. Check liv-core logs for the tool call payload — was `display` set?

## Code Examples

### Verified pattern: tool handler reads optional display arg

```typescript
// Source: livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts:836-852 (verbatim existing pattern for screenshot_window)
// New pattern for every X11 handler (extends the above to mouse/key tools):

computer_click_mouse: async (args) => {
  // Phase 103-B — regex-guard display arg per T-102-06 (env injection):
  const display = (typeof args.display === 'string' && /^:[1-9][0-9]?$/.test(args.display))
    ? args.display
    : undefined
  const w = wid(args)

  // Temporarily scope DISPLAY env for the duration of this handler.
  const target = display ?? options.defaultDisplay
  const prev = process.env.DISPLAY
  try {
    if (target !== undefined) process.env.DISPLAY = target
    return await withPostScreenshot(
      `clickMouse ${summarizeArgs(args)}`,
      () => clickMouse({...args as never, windowId: w}),
      w,
    )
  } finally {
    if (prev === undefined) delete process.env.DISPLAY
    else process.env.DISPLAY = prev
  }
}
```

### Verified pattern: master spawn cascade

```typescript
// Source: derived from livos/packages/livinityd/source/modules/webapps/window-manager.ts:400-519 (102 spawn cascade)
// New chromeMaster.startStream tRPC mutation:

startStream: adminProcedure.mutation(async ({ctx}) => {
  if (currentMaster !== null) {
    throw new TRPCError({code: 'CONFLICT', message: 'master Chrome already running'})
  }

  // 1. Ensure master dir exists (idempotent — profile-seeder did this at boot)
  await profileSeeder.ensureMasterExists()

  // 2. Display + Xvfb
  const displayN = displayAllocator.allocate()
  const display = `:${displayN}`
  let xvfb: XvfbHandle | undefined
  let chrome: ChromeProcessHandle | undefined
  let port: number | null = null
  let stream: {streamId: string; wsUrl: string} | undefined
  try {
    xvfb = await spawnXvfb({display, width: 1280, height: 720})

    // 3. Chrome (WIDENED USER_DATA_DIR regex permits the master path)
    chrome = await spawnChromeProcess({
      display,
      userDataDir: MASTER_PROFILE_DIR,                    // /opt/livos/data/chrome-master
      url: 'https://accounts.google.com',
      // NB: do NOT pass --app=URL — the user needs the address bar visible.
      // chrome-process-spawner.ts already drops --app=URL by default per r5.
    })

    // 4. x11vnc + StreamManager session
    port = streamManager.getPortAllocator().allocate()
    spawnVncForDisplay({display, rfbPort: port})           // detached child; StreamManager owns lifecycle
    stream = streamManager.startStream({
      userId: ctx.currentUser.id,
      mode: 'vnc-window',
      target: {display},
    })

    // 5. Stash singleton + register exit watcher
    currentMaster = {
      pid: chrome.pid, child: chrome.child,
      display, displayN, rfbPort: port,
      streamId: stream.streamId, wsUrl: stream.wsUrl,
      xvfb, chrome, x11vnc: null /* stream owns */,
      startedAt: Date.now(),
    }
    chrome.child.on('exit', () => { void cleanupMaster() })

    return {pid: chrome.pid, startedAt: currentMaster.startedAt, wsUrl: stream.wsUrl, streamId: stream.streamId, display}
  } catch (err) {
    // Compensating cleanup — REVERSE order
    if (stream) try { await streamManager.stopStream(stream.streamId) } catch {}
    if (chrome) try { await chrome.stop() } catch {}
    if (xvfb) try { await xvfb.stop() } catch {}
    if (port !== null) try { streamManager.getPortAllocator().release(port) } catch {}
    try { displayAllocator.release(displayN) } catch {}
    throw err
  }
})
```

### Verified pattern: noVNC viewer in master-chrome-login.tsx

```typescript
// Source: derived from livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx:228-450 (full WebApp viewer pattern)
// Trimmed for master Settings panel:

const [wsUrl, setWsUrl] = useState<string | null>(null)
const vnc = useWebAppVnc(wsUrl ?? undefined, {viewOnly: true})

// startMut.onSuccess: setWsUrl(res.wsUrl); stopMut: setWsUrl(null)

const inputClickMutation = trpcReact.chromeMaster.input.click.useMutation()
const inputKeyMutation = trpcReact.chromeMaster.input.key.useMutation()
const inputTypeMutation = trpcReact.chromeMaster.input.type.useMutation()
const inputScrollMutation = trpcReact.chromeMaster.input.scroll.useMutation()

useEffect(() => {
  const container = vnc.containerRef.current
  if (!container || !wsUrl) return
  // Same canvas-coord math as webapp-stream-window.tsx:253-274
  // Same onMouseDown/Up/Wheel/KeyDown handlers as webapp-stream-window.tsx:284-449
  // (Trimmed: no Teach popup host, no Skill scrubber, no drawer store.)
  // ... 80 lines of input-handler wiring …
}, [vnc.containerRef, wsUrl, inputClickMutation, /*...*/])

return (
  <div className="flex flex-col gap-4">
    {/* status indicator + buttons (existing 102-07 UI) */}
    {wsUrl !== null ? (
      <div className="relative aspect-[16/9] w-full max-w-[1280px] overflow-hidden rounded border bg-black">
        <div
          ref={vnc.containerRef}
          tabIndex={0}
          className="h-full w-full [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-cover"
        />
        {vnc.status === 'connecting' && <Overlay text="Connecting to master Chrome…" />}
        {vnc.status === 'error' && vnc.errorMessage && <Overlay text={vnc.errorMessage} variant="error" />}
      </div>
    ) : null}
  </div>
)
```

### Verified pattern: buildActiveDisplaySnippet instruction update

```typescript
// Source: livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts:200-209 (existing)
// REPLACE the closing instruction line for Phase 103-B4:

return [
  '## Active Display Context',
  `You are operating in the context of the LivOS app: ${safe.title} (${safe.kind}).`,
  `Active X11 display: ${input.activeDisplay} (resolution 1280x720)`,
  `URL/Binary: ${target}`,
  // PHASE 103-B4 — make the instruction prescriptive, not descriptive:
  `IMPORTANT — Every Luse tool call (computer_screenshot, computer_click_mouse, computer_type_text, etc.) MUST pass display: "${input.activeDisplay}" as an argument to scope the operation to this WebApp's dedicated X server. If you omit display, the tool falls back to the host display (:1) and you will NOT see this WebApp. Coordinate space is 1280x720 native — no offset, no scaling.`,
].join('\n')
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Master Chrome on `:0` (physical screen) | Master Chrome on managed Xvfb display + noVNC viewer in Settings | Phase 103 (this phase) | Headless Mini PCs can now master-login without a monitor. |
| One MCP server per WebApp (`luse:webapp:<slug>`) | Single global `luse` MCP + per-call `display` param | Phase 103 (this phase) | Eliminates Claude Code wildcard-permission prompt; cleaner tool surface (~17 tools vs ~85 across 5 WebApps). |
| `LUSE_TARGET_WINDOW_ID` env (per-window scoping) | `LUSE_TARGET_DISPLAY` env (per-display scoping) — fallback default | Phase 102-06 (already shipped) | Eliminates 1920x1080 coord drift. |
| x11vnc `-id <wid>` (window-region capture) | x11vnc `-display :N` (whole-display capture) | Phase 102-09 (already shipped) | One stream = one Xvfb = one app, no overlap. |
| Per-app `--user-data-dir` shared via singleton lock IPC merge | Per-app `--user-data-dir` seed-copied from master | Phase 102-03 (already shipped) | Per-app Chrome processes coexist; no IPC merge. |

**Deprecated / outdated:**

- `buildActiveWindowSnippet` (window-id-based) — superseded by `buildActiveDisplaySnippet`. 103-B can finally delete the old function if no callers remain (grep confirms no callers in production paths post 102-06).
- `LUSE_TARGET_WINDOW_ID` env read in mcp/server.ts:84-104 — superseded by LUSE_TARGET_DISPLAY. Keep the dead read with deprecation comment for now (zero cost; signals intent).
- Per-WebApp McpConfigManager entries (`luse:webapp:*`) — keep behind `LIVOS_PER_APP_LUSE=1` opt-in for token-budget testing. Add a boot-time orphan-sweep that cleans Redis entries on every boot (mirrors `cleanupLegacyBytebotState`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The MCP child process serializes tool calls via JSON-RPC stdio → process.env.DISPLAY mutations in handlers don't race. | Sub-goal B Pattern 4, Pitfall 2 | Cross-display tool dispatch hits wrong display. **Mitigation:** singleThread vitest tests catch any local race; production stdio is one-request-one-response. Worst case: hand-roll execFile env arg in v2. |
| A2 | Widening chrome-process-spawner USER_DATA_DIR regex to include `/opt/livos/data/chrome-master` is safe because the master path is a hardcoded constant in master-login-routes.ts (not caller-controlled). | Pitfall 1 | If a future caller passes a caller-controlled path that matches the new regex alternative, T-102-02 protections weaken. **Mitigation:** comment-tag T-103-A1; keep regex narrow (constant alternative, not pattern). |
| A3 | The agent will reliably honor the "always pass display arg" instruction in buildActiveDisplaySnippet — ~95%+ compliance. | Sub-goal B Pitfall 8 | Agent silently uses LUSE_TARGET_DISPLAY default (:1) and screenshots host desktop instead of active WebApp. **Mitigation:** belt-and-suspenders — also set LUSE_TARGET_DISPLAY env per-turn so default fallback is correct. |
| A4 | The user wants ONE master Chrome at a time (singleton); future multi-account scenarios are deferred. | Constraints, ROADMAP non-goals | Two concurrent masters fight over master profile dir. **Mitigation:** currentMaster singleton in master-login-routes.ts:99-101 already exists. |
| A5 | The `webapp.window.spawn` route should NOT be reused for master — a parallel `chromeMaster.startStream` route is cleaner. | Pattern 1, Architecture | Code duplication (~30 lines of orchestration) if master needs its own route file. **Mitigation:** keep both routes in master-login-routes.ts; shared singleton state. |
| A6 | `liv-core` MCP SoT (set in P84) propagates MCP config changes within ~1-2s via Redis pub-sub (`liv:config:updated`). | Sub-goal B cleanup | If propagation lag is longer, stale per-WebApp MCP entries linger in liv-core's tools[] for a brief window after deploy. **Mitigation:** boot-time cleanup runs before McpClientManager start; live UAT will surface lag if any. |

**All other claims in this research are verified via direct file read or production behavior observed during Phase 102 r14 deploy.**

## Open Questions (RESOLVED)

> Resolved during plan-check 2026-05-11; each question's resolution is recorded inline. The de-facto answers were committed by plans 103-01 through 103-05.

1. **Is `:9` reserved for master, or allocator-pool?**
   - What we know: DisplayAllocator currently runs `[10, 100)`; `:1` is host Luse; `:0` is physical screen.
   - What's unclear: Should master have a fixed reserved slot to keep the URL/log predictable, or float with the allocator?
   - **RESOLVED:** Float with the allocator. Plan 103-01 Task 2 (`startStream` action) calls `displayAllocator.allocate()` exactly like a WebApp spawn — no reserved slot. Singleton lock (`currentMaster !== null` guard) prevents two simultaneous masters from racing the same display. The actual display number is returned in the `chromeMaster.startStream` response (`{display, wsUrl, streamId, pid, startedAt}`) so the UI can display "master on :42" if useful.

2. **Should the `/opt/livos/data/chrome-master` permission model change?**
   - What we know: profile-seeder.ts:244 chowns per-app dirs to bruce; master Chrome runs as bruce (sudo -u bruce).
   - What's unclear: Does the master dir need to be bruce:bruce too? livinityd boots as root; an `ensureMasterExists` mkdir runs as root.
   - **RESOLVED:** Yes — extend `ensureMasterExists` to chown root→bruce after mkdir (idempotent). Captured in plan 103-01 Task 1's `read_first` reference set + Task 2 boot-time wire-up. The chown is a one-line addition (`await execP('chown', ['-R', 'bruce:bruce', masterDir])` after `mkFn` succeeds) and is safe to re-run.

3. **Should agent tool calls auto-derive `display` from a "current active webapp" hint without the agent needing to pass it?**
   - What we know: `buildHandlers(opts).defaultDisplay` carries the active webapp display.
   - What's unclear: If we set defaultDisplay correctly per-turn (via a new contextDisplay opt in agent-runner-factory.ts), the agent doesn't strictly NEED to pass `display`.
   - **RESOLVED:** Do both. Plan 103-03 Task 2 keeps `defaultDisplay` as the fallback (`parseDisplayArg(args) ?? opts.defaultDisplay ?? process.env.LUSE_TARGET_DISPLAY ?? ':1'`) — handles the "agent forgot the instruction" case. Plan 103-04 prompts the agent to pass `display` explicitly per turn — handles cross-display tool calls where the agent intends to operate on a non-active WebApp. Belt-and-suspenders.

4. **What happens to existing per-WebApp Luse MCP entries in Redis after the LIVOS_PER_APP_LUSE=0 flip?**
   - What we know: McpConfigManager persists registrations in Redis; the prefix matches `luse:webapp:<slug>-<suffix>`.
   - What's unclear: Without an explicit cleanup, those entries persist forever and might cause stale prompts.
   - **RESOLVED:** Boot-time orphan sweep, mirroring `cleanupLegacyBytebotState`. Plan 103-05 Task 2 adds `cleanupOrphanedPerWebAppLuseEntries()` in `legacy-bytebot-cleanup.ts` and wires it into `agent-runs.ts` BEFORE `registerLuseMcpServer` so the singleton MCP path bootstraps cleanly on a Redis with stale per-app entries.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xvfb | Sub-goal A | ✓ (Mini PC verified) | 21.x | — |
| google-chrome | Sub-goal A | ✓ (Mini PC verified) | 130.x | — |
| x11vnc | Sub-goal A | ✓ (Mini PC verified) | 0.9.16 | — |
| xdotool | Sub-goal A input dispatch | ✓ (Mini PC verified) | 3.20210804.1 | — |
| @novnc/novnc | Sub-goal A UI viewer | ✓ (package.json) | 1.6.0 | — |
| MCP SDK (@modelcontextprotocol/sdk) | Sub-goal B | ✓ (already wired) | 1.25.x | — |
| Node.js | All | ✓ (livinityd runtime) | 22.x | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 2.1.2 |
| Config file | livos/packages/livinityd/vitest.config.ts (assumed; same for ui package) |
| Quick run command | `npm run test --workspace=livos/packages/livinityd -- --run --reporter=verbose <pattern>` |
| Full suite command | `npm run test:run --workspace=livos/packages/livinityd` (singleThread true, maxConcurrency 1, 180s hook + test timeout per package.json) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-103-A1 | `chromeMaster.startStream` allocates Xvfb + spawns Chrome on it | unit | `pnpm vitest run chrome-master/master-login-routes.test.ts -t startStream` | ✓ (extend existing test file) |
| REQ-103-A2 | UI mounts `useWebAppVnc(wsUrl)` when `running:true && wsUrl` set | unit | `pnpm vitest run settings/master-chrome-login.test.tsx -t viewer` | ✓ (extend existing test file) |
| REQ-103-A3 | `chromeMaster.input.click` calls dispatchPointer with display arg | unit | `pnpm vitest run chrome-master/master-login-routes.test.ts -t input.click` | ❌ Wave 0 |
| REQ-103-A4 | chrome.on('exit') triggers cleanupMaster → display/port released | unit | `pnpm vitest run chrome-master/master-login-routes.test.ts -t cleanup` | ❌ Wave 0 |
| REQ-103-B1 | tools.ts accepts `display` arg on every X11 tool | unit | `pnpm vitest run computer-use/mcp/tools.test.ts -t display-arg` | ❌ Wave 0 (extend) |
| REQ-103-B2 | Handler sets DISPLAY env before native primitive, restores after | unit | `pnpm vitest run computer-use/mcp/tools.test.ts -t scoped-display` | ❌ Wave 0 |
| REQ-103-B3 | Falls back to LUSE_TARGET_DISPLAY when display arg absent | unit | `pnpm vitest run computer-use/mcp/tools.test.ts -t default-display-fallback` | ❌ Wave 0 |
| REQ-103-B4 | `buildActiveDisplaySnippet` emits "ALWAYS pass display: ':N'" instruction | unit | `pnpm vitest run ai/agent-prompt-builder.test.ts -t always-pass-display` | ✓ (extend existing) |
| REQ-103-B5 | `window-manager` skips registerWebAppMcp by default | unit | `pnpm vitest run webapps/window-manager.test.ts -t LIVOS_PER_APP_LUSE` | ✓ (existing tests cover env override; flip default) |
| Boot-time orphan sweep | `cleanupOrphanedPerWebAppLuseEntries` removes `luse:webapp:*` from McpConfigManager | unit | `pnpm vitest run computer-use/legacy-bytebot-cleanup.test.ts -t orphan-sweep` | ❌ Wave 0 (new) |
| Manual UAT | User clicks "Open Master Chrome" → embedded viewer shows Google login page | manual | UAT row 1-3 in 103-UAT-CHECKLIST.md | — |
| Manual UAT | User logs into Google in embedded viewer → master profile persists Cookies | manual | UAT row 4 | — |
| Manual UAT | Open WebApp after master login → inherits Google account | manual | UAT row 5 | — |
| Manual UAT | Open 2 WebApps + ask agent to click button on WebApp B → no permission prompt | manual | UAT row 6 | — |
| Manual UAT | Sacred SHA preserved on Mini PC after deploy | scripted | `ssh bruce@10.69.31.68 'git -C /opt/liv hash-object packages/core/src/sdk-agent-runner.ts'` | — |

### Sampling Rate

- **Per task commit:** `pnpm vitest run <touched-test-file>` (single file, ~3s)
- **Per wave merge:** `npm run test:run --workspace=livos/packages/livinityd` AND `npm run test:run --workspace=livos/packages/ui` (full suite each, ~45s each)
- **Phase gate:** Full suite green across livinityd + ui, sacred SHA verified pre+post, then user-walked UAT.

### Wave 0 Gaps

- [ ] `livos/packages/livinityd/source/modules/chrome-master/master-login-routes.test.ts` — extend with startStream/stopStream/input.* test cases
- [ ] `livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts` — extend with `display` arg test cases per tool
- [ ] `livos/packages/livinityd/source/modules/computer-use/legacy-bytebot-cleanup.test.ts` — extend with `luse:webapp:*` orphan-sweep test
- [ ] `livos/packages/ui/src/modules/settings/master-chrome-login.test.tsx` — extend with viewer-mount + input-handler tests
- [ ] No new test infrastructure required — vitest + jsdom + msw already in tree.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `adminProcedure` middleware enforces role check on chromeMaster.* mutations |
| V3 Session Management | no | tRPC session/jwt already covered upstream |
| V4 Access Control | yes | `adminProcedure` + the module-singleton `currentMaster` lock (T-102-07b) |
| V5 Input Validation | yes | zod + regex guards on `display` (`/^:[1-9][0-9]?$/`), URL parse, `x/y/button/kind` enums |
| V6 Cryptography | no | No new cryptographic surface |

### Known Threat Patterns for {Sub-goal A + B}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Elevation of Privilege (non-admin starts master Chrome) | Elevation | adminProcedure gate on chromeMaster.startStream/stopStream/input.*/reset/restoreBackup |
| Tampering (concurrent master spawns) | Tampering | currentMaster module-singleton lock; CONFLICT error on second startLogin |
| Data Loss (accidental master profile reset) | Tampering | default backup=true on reset; restoreBackup route |
| Information Disclosure (master profile cookies dumped) | Info Disclosure | status() reads file existence only, never bytes |
| Env Injection via display string | Tampering | regex `/^:[1-9][0-9]?$/` at handler boundary before `process.env.DISPLAY` mutation |
| Prompt Injection via activeDisplay | Tampering | DISPLAY_RE_PROMPT regex in agent-prompt-builder.ts:174 already guards; new instruction string is constant |
| Path traversal via master userDataDir | Tampering | hardcoded constant `/opt/livos/data/chrome-master` (not caller-controlled); widened USER_DATA_DIR_RE only adds the constant as a second alternative |
| Privilege escalation via create_stream tool | Elevation | unchanged from 102 — Redis flag `liv:config:luse_can_create_streams` (default false) still gates the tool |

## Risks / Landmines

1. **Process.env.DISPLAY race in concurrent MCP handlers** — covered in Pitfall 2. Mitigation: stdio JSON-RPC serializes, but document the assumption and consider v2 execFile-env-arg path.

2. **PortAllocator exhaustion** — pool is `[15900, 16000)` = 100 slots. Master takes 1; per-WebApp takes 1 each. ~95+ WebApps before exhaustion. Plausible in practice for v1.

3. **x11vnc on master Xvfb deadlock** — not observed in 102 testing on per-app `:10..:13`. Master at `:42` should behave identically. Sample x11vnc stderr in tail for `unable to open display` and similar.

4. **MCP schema change breaks existing agent prompts** — adding optional `display` is additive (backwards compatible). Existing per-WebApp env-based scoping continues to work via the LUSE_TARGET_DISPLAY default. **Risk: low.**

5. **MCP config Redis pub-sub propagation lag** — liv-core MCP SoT (P84) reconciles via `liv:config:updated` pub-sub (~1-2s). The boot-time orphan sweep should complete BEFORE McpClientManager.start() reads the config. If start order is wrong, briefly stale entries appear. Mitigation: ensure cleanup runs in agent-runs.ts BEFORE registerLuseMcpServer (matches the bytebot cleanup ordering).

6. **Agent doesn't pass `display`** — covered in Pitfall 8. Belt-and-suspenders: set defaultDisplay per-turn.

7. **noVNC viewer scaling distorts master Chrome** — `useWebAppVnc` uses `scaleViewport=true` which scales the Xvfb canvas (1280x720) to fit the container. If the Settings panel container is narrower, the canvas scales down with letterboxing. Verify with a 1280x720 fixed-aspect container (or `aspect-[16/9]` Tailwind class).

8. **Master Chrome Singleton lock if profile-seeder ran a chmod** — profile-seeder.ts:244 chowns per-app dirs but the source master dir might or might not be bruce-owned at boot. If master Chrome (as bruce) can't write `SingletonLock`, it fails the same way the per-app Chrome did pre-r1 (db5b8b12). Mitigation: `ensureMasterExists` chowns master to bruce.

9. **Stream cap exhaustion** — StreamManager.getCap() returns 10 with VAAPI, 5 without. Master + 9 WebApps fills VAAPI cap. Plausible in practice. Mitigation: surface "Too many streams" error if it bites.

10. **Wave 4 deploy = code path change for every WebApp** — flipping LIVOS_PER_APP_LUSE default to '0' affects every existing WebApp session. Operators with custom `.env` setting `LIVOS_PER_APP_LUSE=1` keep the old behavior; default users get the new path. Document in 103-UAT-CHECKLIST so the user knows what to expect after deploy.

11. **chrome-process-spawner USER_DATA_DIR regex narrow accept** — widening is necessary; T-102-02 stays valid because the new alternative is a constant, not caller-controlled. Triple-check the test (chrome-process-spawner.test.ts) covers BOTH the per-app and master accept branches AND the reject branch (e.g., `/etc/passwd`).

12. **Agent calls a non-display-aware tool with `display` arg** — e.g., `set_task_status({display: ':10'})`. Zod's `.optional()` on `display` and the handler's `display` read should ignore it gracefully. Verify schema permits unknown keys (zod default: rejects extras unless `.passthrough()`). Test this.

## Sources

### Primary (HIGH confidence)
- livos/packages/livinityd/source/modules/streaming/display-allocator.ts — DisplayAllocator implementation
- livos/packages/livinityd/source/modules/streaming/xvfb-spawner.ts — spawnXvfb with xdpyinfo readiness
- livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts — spawnVncForDisplay sugar + ws bridge
- livos/packages/livinityd/source/modules/streaming/stream-manager.ts — startStream/stopStream vnc-window branch
- livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.ts — per-app Chrome spawn (regex to widen)
- livos/packages/livinityd/source/modules/webapps/window-manager.ts — registerWebAppMcp + LIVOS_PER_APP_LUSE switch
- livos/packages/livinityd/source/modules/webapps/input-dispatcher.ts — dispatchPointer/Key/Type/Scroll display-mode branches
- livos/packages/livinityd/source/modules/chrome-master/master-login-routes.ts — current `:0` spawn (to fix)
- livos/packages/livinityd/source/modules/chrome-master/profile-seeder.ts — master profile management
- livos/packages/livinityd/source/modules/computer-use/mcp/server.ts — resolveDisplay precedence
- livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts — handler factory + screenshot_window display arg pattern
- livos/packages/livinityd/source/modules/computer-use/luse-tools.ts — tool schemas (5 already accept display)
- livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts — PerWebAppMcpDescriptor + buildLuseConfig
- livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts — buildActiveDisplaySnippet
- livos/packages/livinityd/source/modules/ai/agent-runs.ts — boot-time registerLuseMcpServer + cleanupLegacyBytebotState
- livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts — activeDisplay opt
- livos/packages/ui/src/hooks/use-webapp-vnc.ts — useWebAppVnc RFB wrapper
- livos/packages/ui/src/modules/settings/master-chrome-login.tsx — current Master Login UI
- livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx — viewer + input dispatch pattern
- .planning/phases/102-per-app-display-pivot/102-CONTEXT.md — Phase 102 locked decisions
- .planning/phases/102-per-app-display-pivot/CONTINUE.md — Bug A/B handoff
- .planning/ROADMAP.md — Phase 103 entry (lines 574-607)

### Secondary (MEDIUM confidence)
- livos/packages/livinityd/package.json — vitest 2.1.2, @novnc/novnc 1.6.0 versions
- livos/packages/livinityd/source/modules/webapps/trpc-router.ts — webapp.input.* dispatch structure (parallel pattern for chromeMaster.input.*)

### Tertiary (LOW confidence)
- (none — all critical claims trace to verified source files)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every primitive lives in-tree and has been verified by Phase 102 production deploy + UAT
- Architecture: HIGH — pure composition of existing 102 building blocks; no novel patterns required
- Pitfalls: MEDIUM-HIGH — Pitfall 2 (process.env race) is the only one without a battle-tested mitigation; the rest are direct Phase 102 lessons learned
- Risks/landmines: HIGH — all 12 risks have either a known mitigation or a low-cost detection path

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (30 days) — assumes no major libnovnc / xdotool / Xvfb / Chrome upstream changes
