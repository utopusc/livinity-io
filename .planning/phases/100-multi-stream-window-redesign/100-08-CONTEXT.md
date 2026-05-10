# Plan 100-08: SelfClaude Adoption + Per-WebApp MCP Routing — CONTEXT

**Gathered:** 2026-05-10
**Status:** Ready for planning (`/gsd-plan-phase 100-08`)
**Parent context:** `100-CONTEXT.md` (phase-level — original Phase 100 scope, mostly shipped)
**Trigger:** Two residual bugs from 100-07 that the existing routing layer can't fix without an architectural shift. User-referenced hackathon project `https://github.com/utopusc/selfclaude` solves the same use case in a Docker container; we adopt its patterns onto bare metal.

<scope>
## Plan Boundary

**In scope:**
1. Stand up a dedicated Xvfb display (`:1`) for WebApp Chromes, leaving bruce's GNOME on `:0` untouched. Includes lightweight WM (fluxbox per selfclaude) lifecycle managed by livinityd.
2. Migrate Chrome spawn argv (`window-manager.ts`), x11vnc argv (`vnc-bridge.ts`), and xdotool input dispatch (`input-dispatcher.ts`, `computer-use/native/input.ts`) from `DISPLAY=:0` to `DISPLAY=:1`.
3. Wire per-WebApp bytebot MCP children using the existing `mcp-client-manager.registerWebAppInstance` + `bytebot-mcp-config.buildBytebotConfig(PerWebAppMcpDescriptor)` infrastructure. window-manager.spawn registers; window close deregisters.
4. Tool-routing on the chat surface: each WebApp's chat panel addresses tools as `mcp__bytebot:webapp:<wid>__*` (or equivalent namespacing — final shape locked in 100-08-01 plan). Single host bytebot MCP becomes a fallback only.
5. Verification: 2 concurrent WebApps, each with independent stream + independent bytebot scope. Chat in WebApp A only operates on WebApp A. Chrome `--window-size=1280,720` honored on both.

**Out of scope:**
- Container migration of all of LivOS (selfclaude is fully containerized; we stay bare-metal).
- Multi-user concurrency (single Mini PC user; D-V33-07 still locked).
- Changes to `livos/packages/ui/src/modules/window/webapp-stream-window.tsx` UI shape (already locked by 100-06).
- Any `liv/packages/core/` edits (D-100-SACRED carries forward).
- BYOK or `@anthropic-ai/sdk` paths (D-100-NO-BYOK).
- Server4 (D-100-NO-SERVER4).
- Skill-as-context recording layer changes (P96 teach mode, working).
- WebRTC upgrade (deferred to v34).

</scope>

<decisions>
## Implementation Decisions

### D-100-08-A — Display strategy: dedicated Xvfb `:1`

**Decision:** Run all WebApp Chromes on a dedicated Xvfb display launched and managed by livinityd. Reserve `:1` (selfclaude uses `:99` because their container has no host X server; we have bruce's GNOME on `:0`, so `:1` is the conventional "next free" display).

**Why:** Eliminates the host-Chrome IPC merge that causes Bug 1 (Chrome `--window-size` flag dropped). Fresh X server = fresh Chromium-like-process tree = window-size honored. Bruce's `:0` desktop stays usable for normal browsing.

**Lifecycle:**
- livinityd boot: spawn `Xvfb :1 -screen 0 1920x1080x24` + lightweight WM (fluxbox, per selfclaude — xdotool needs a WM to be reliable).
- Per-WebApp Chrome spawn: `DISPLAY=:1 google-chrome --user-data-dir=/home/bruce/.config/livos-chrome --app=<URL>`. Shared profile preserves Google login (D-V33-01 / D-100-SHARED-PROFILE still applies).
- WebApp close: window-manager kills only that Chrome wid; Xvfb + fluxbox stay up across the livinityd lifetime.

**NOT chosen:**
- Kill host Chrome before each spawn (rejected: breaks bruce's interactive browsing).
- Per-WebApp Xvfb (`:10, :11, ...`) (rejected: more processes, more lifecycle bugs; one shared `:1` is enough since fluxbox + xdotool can target distinct wids on one display).
- Defer/accept current state (rejected: kills v33 milestone close).

### D-100-08-B — Per-WebApp bytebot MCP child via `registerWebAppInstance`

**Decision:** When window-manager spawns a WebApp, register a NEW bytebot MCP child via `mcpClientManager.registerWebAppInstance(webappId, PerWebAppMcpDescriptor)`. The descriptor's env carries `BYTEBOT_TARGET_WINDOW_ID=<wid>` and `DISPLAY=:1`. On window close, deregister the instance (kills the child).

**Why:** The infrastructure already exists in `liv/packages/core/src/mcp-client-manager.ts` and `livos/packages/livinityd/source/modules/computer-use/bytebot-mcp-config.ts` (per CONTINUE.md `Key files to re-read`). It was built for exactly this case but never wired to the window-manager spawn path. Wiring closes Bug 2 architecturally rather than papering it over.

**Tool-routing (chat surface):**
- Chat panel for WebApp A sends tool calls scoped to `webappId=A`. The agent loop receives tools registered as `mcp__bytebot:webapp:<wid>__*`.
- Host bytebot MCP child (which already runs and serves the desktop-stream native app, NOT WebApps) stays as fallback for non-WebApp surfaces.
- Final namespacing pattern (e.g., `mcp__bytebot:webapp:<wid>__*` vs. `mcp__bytebot__webapp_<wid>_*`) locked in 100-08-PLAN by reading the existing `bytebot-mcp-config.buildBytebotConfig` shape.

**NOT chosen:**
- Single host MCP + always-pass windowId (rejected: leaks scope, agent can drift to wrong window).
- Hybrid shared MCP + per-call scope hint (rejected: adds a fragile routing layer between agent and MCP, hard to debug).

### D-100-08-C — Adopt selfclaude patterns; no code import

**Decision:** Read selfclaude's `src/input-dispatcher.js`, `src/mcp-server.js`, `src/agent-chat.js`, `src/skills.js` (action_log shape). Reimplement the relevant patterns in our existing TypeScript modules. No fork, no vendor, no submodule.

**Patterns to adopt:**
1. **xdotool input chain** — `windowactivate --sync <wid> windowfocus --sync <wid>` then input verb without `--window` flag (already shipped in 100-07.3 `tryXdotoolClick`; verify our existing pattern matches selfclaude's exactly).
2. **Display-bound xdotool** — every `xdotool` call gets `DISPLAY=:1` env (changed from `:0` post D-100-08-A).
3. **wid-bound x11vnc** — `x11vnc -id <wid>` per WebApp (already shipped in Phase 99-02; verify it works on `:1`).
4. **Per-WebApp action_log + replay dispatch** — selfclaude's per-event xdotool dispatch loop with `min(ev.ts - prevTs, 2000)` ms inter-event sleep. Our P96 teach-recorder is structurally similar; cross-check field shape and timing.
5. **MCP transport: Streamable HTTP, single source-of-truth modules** — selfclaude's `src/mcp-server.js` shares its tool implementations with the chat agent via direct module imports. Our `bytebot-mcp-config` should similarly share with the agent loop, no parallel state.

**NOT chosen:**
- Spike-only doc-and-defer (rejected: pushes v33 ship date past acceptable window).
- Vendor selfclaude modules (rejected: maintenance burden, JS↔TS shim complexity, divergent test infra).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Parent phase context
- `.planning/phases/100-multi-stream-window-redesign/100-CONTEXT.md` — Phase-level boundary, locked decisions D-100-SACRED / D-100-SHARED-PROFILE / D-100-X11VNC-CANONICAL / D-100-FMP4-ALIVE / D-100-LIVE-VERIFY-FIRST.
- `.planning/phases/100-multi-stream-window-redesign/CONTINUE.md` — Residual bugs hypotheses, key files list, selfclaude reference URL.
- `.planning/phases/100-multi-stream-window-redesign/PHASE-SUMMARY.md` — Phase 100 close summary + what was deferred.

### External reference
- https://github.com/utopusc/selfclaude — selfclaude v1.0 README (read in full; `src/input-dispatcher.js`, `src/mcp-server.js`, `src/agent-chat.js`, `src/skills.js`, `Dockerfile`).

### LivOS code paths to study
- `liv/packages/core/src/mcp-client-manager.ts` — `registerWebAppInstance` + `PerWebAppMcpDescriptor` (already exists, never wired).
- `livos/packages/livinityd/source/modules/computer-use/bytebot-mcp-config.ts` — `buildBytebotConfig(PerWebAppMcpDescriptor)` (already exists, never spawned per-WebApp).
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — Chrome spawn argv (will change DISPLAY=:0 → :1; argv lock from 100-02 stays `--app=URL`).
- `livos/packages/livinityd/source/modules/webapps/input-dispatcher.ts` — user-canvas xdotool path (100-07.1/.2).
- `livos/packages/livinityd/source/modules/computer-use/native/input.ts` — bytebot xdotool path (100-07.3 activate-first chain).
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` — `resolveWindowId` 4-tier fallback (100-07.4 single-active-wid file IPC; this fallback path becomes obsolete once per-WebApp MCP children carry their own `BYTEBOT_TARGET_WINDOW_ID`).
- `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` — x11vnc spawn (Phase 99-02 argv-locked; will need DISPLAY=:1 update only).
- `liv/packages/core/src/sdk-agent-runner.ts` — D-100-SACRED. Read for context only. NEVER edit.

### Locked constraint
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on `liv/packages/core/src/sdk-agent-runner.ts`. Pre-commit hook at `.husky/pre-commit` enforces. NEVER use `--no-verify`.

</canonical_refs>

<code_context>
## Existing Code Insights (from CONTINUE.md + scout)

### Reusable Assets (already exist, need wiring)
- **`mcp-client-manager.ts:registerWebAppInstance`** — accepts a `PerWebAppMcpDescriptor`, spawns a child MCP server, namespaces tools under the WebApp scope. Currently called only from a test fixture per CONTINUE.md.
- **`bytebot-mcp-config.ts:buildBytebotConfig(PerWebAppMcpDescriptor)`** — produces the env + argv for a per-WebApp bytebot MCP child. Currently never invoked from window-manager spawn.
- **`tryXdotoolClick` (input.ts) and `webapp.input.{click,keypress,type}` tRPC routes (input-dispatcher.ts)** — already use windowactivate-first pattern from 100-07.3. Selfclaude alignment: low-cost cross-check.

### Established Patterns
- **window-manager spawn lifecycle** — already does spawn → register → return wid; deregister on close. Pattern: drop in `registerWebAppInstance` call alongside.
- **Xvfb-on-bare-metal precedent** — none in LivOS yet. New pattern. Lifecycle helper module needed (likely `livos/packages/livinityd/source/modules/webapps/xvfb-display.ts`).
- **fluxbox-on-livinityd** — none in LivOS yet. New install dependency for Mini PC `update.sh` / `install.sh` apt-list.

### Integration Points
- **livinityd boot path** — `livinityd.start()` (where 99-04 wired streamManager + windowManager). Add Xvfb + fluxbox spawn here.
- **Chat surface tool routing** — wherever the agent loop receives the WebApp's chat (search for the `webappId` → tool prefix mapping; new wiring point).
- **`update.sh` apt-install loop** — add `xvfb`, `fluxbox` (per selfclaude Dockerfile baseline).

</code_context>

<deferred>
## Deferred Ideas (out of plan 100-08 scope)

- **Action_log replay parity with selfclaude** — our P96 teach-mode action_log shape may diverge from selfclaude's `{type, button, x, y, ts}` schema. Cross-check is in scope; reconciling differences is deferred unless it blocks 100-08 verification.
- **Streamable HTTP MCP transport for external Claude Code** — selfclaude exposes `:8090/mcp` for the host's Claude Code. LivOS could too, but that's a v34 capability (computer-use as a remote service). Not in 100-08.
- **Container option** — full Docker migration like selfclaude is a v34+ project rewrite, not 100-08.
- **Multi-user WebApp concurrency** — locked out per D-V33-07. Not 100-08.
- **WebRTC upgrade for stream transport** — deferred to v34 per 100-CONTEXT.md.
- **Per-WebApp Xvfb display** (`:10, :11, ...`) — rejected in D-100-08-A. If a future need (e.g., per-WebApp resolution lock) arises, revisit.

</deferred>

<success_criteria>
## Success Criteria (UAT-walkable on Mini PC)

1. After deploy, `xdpyinfo -display :1` returns valid output (Xvfb is up).
2. After deploy, `pgrep -af fluxbox` lists exactly one fluxbox process bound to `:1`.
3. Open WebApp A (Gmail). `xdotool search --display :1 --name "Gmail"` returns exactly one wid. `xdotool getwindowgeometry --display :1 <wid>` reports `1280x720`.
4. Open WebApp B (Twitter). Same probe shows a SECOND distinct wid, also 1280x720, on `:1`.
5. `pgrep -af 'bytebot' | wc -l` is at least 3 (host bytebot + 2 per-WebApp). Each per-WebApp bytebot env shows `BYTEBOT_TARGET_WINDOW_ID=<wid>` and `DISPLAY=:1`.
6. Chat in WebApp A's panel asks bytebot to "click the compose button". Click occurs on Gmail (A's wid). WebApp B's Twitter window is untouched.
7. Chat in WebApp B's panel asks bytebot to "scroll down". Scroll occurs on Twitter (B's wid). Gmail is untouched.
8. Close WebApp A. `pgrep -af 'bytebot' | wc -l` drops by 1. WebApp B remains functional.
9. Bruce's host Chrome on `:0` (if running) is unaffected at every step.
10. Sacred SHA `f3538e1d…` UNTOUCHED across all 100-08 commits (pre-commit hook fires green).
11. Mini PC user-walked UAT signoff documented; v33 milestone close gate flips to PASS.

</success_criteria>

<implementation_notes>
## Specific Implementation Notes

### Xvfb + fluxbox boot (likely 100-08-01 or -02)

Add to `livinityd.start()`:
```ts
import { startXvfb } from './modules/webapps/xvfb-display';
import { startFluxbox } from './modules/webapps/fluxbox-wm';

const xvfbHandle = await startXvfb({ display: ':1', resolution: '1920x1080x24' });
const wmHandle = await startFluxbox({ display: ':1' });
```

Both helpers spawn under bruce (sudo -n -u bruce), kill on livinityd shutdown.

### Chrome spawn argv (likely 100-08-03)

Current (post-100-02):
```
sudo -n -u bruce DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  google-chrome --user-data-dir=/home/bruce/.config/livos-chrome --app=<URL>
```

After:
```
sudo -n -u bruce DISPLAY=:1 \
  google-chrome --user-data-dir=/home/bruce/.config/livos-chrome \
                --window-size=1280,720 --window-position=0,0 \
                --app=<URL>
```

XAUTHORITY drop possible (Xvfb on `:1` has its own auth; verify with `Xvfb -auth /tmp/livos-x1.auth` if needed).

### Per-WebApp bytebot MCP wiring (likely 100-08-04)

In `window-manager.ts:spawn`:
```ts
const bytebotDescriptor = buildBytebotConfig({
  webappId: spawned.id,
  windowId: spawned.wid,
  display: ':1',
});
await mcpClientManager.registerWebAppInstance(spawned.id, bytebotDescriptor);
```

In `window-manager.ts:close`:
```ts
await mcpClientManager.deregisterWebAppInstance(closed.id);
```

### x11vnc argv (likely 100-08-03)

Current (Phase 99-02 locked):
```
sudo -n -u bruce DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  /usr/bin/x11vnc -id 0xHEX -rfbport <port> -localhost -shared -forever -noxdamage -nopw
```

After (D-100-X11VNC-CANONICAL relaxed for 100-08; the only diff is DISPLAY):
```
sudo -n -u bruce DISPLAY=:1 \
  /usr/bin/x11vnc -id 0xHEX -rfbport <port> -localhost -shared -forever -noxdamage -nopw
```

### update.sh / install.sh apt deps

Add:
- `xvfb`
- `fluxbox`

Already present (verify): `xdotool`, `wmctrl`, `xprop`, `x11vnc`, `maim`.

</implementation_notes>

<risks>
## Known Risks (planner addresses)

1. **Chrome on Xvfb GPU acceleration** — Xvfb has no GPU. Chrome may fall back to software rendering, slower for video-heavy WebApps. Mitigation: accept for v33; explore `--disable-gpu` + virtual GL in v34 if performance complaints arise.
2. **fluxbox keybinding conflicts** — fluxbox may swallow keys that should reach the WebApp. Mitigation: launch fluxbox with empty keys file (`-rc /tmp/fluxbox-livos.cfg` with no bindings).
3. **Xvfb crash recovery** — if Xvfb on `:1` dies, all WebApps go dark. Mitigation: livinityd watches the Xvfb PID, restarts if dead, re-discovers wids (existing window-manager has discovery logic from Phase 93).
4. **bruce's `:0` Chrome and `:1` Chrome both writing to `/home/bruce/.config/livos-chrome`** — shared profile may have lock contention. Mitigation: run host bruce's `:0` browsing on a different Chrome profile dir (or accept the rare lock conflict; selfclaude bypasses this entirely with container isolation).
5. **Memory footprint on Mini PC** — Xvfb + fluxbox + 2 WebApp Chromes + 3 bytebot children. Mini PC has 32GB RAM, headroom OK but worth measuring during UAT.

</risks>

---

**Next step:**

```
/gsd-plan-phase 100-08
```

The planner reads BOTH `100-CONTEXT.md` (parent phase) and this `100-08-CONTEXT.md` (sub-plan). Output: `100-08-PLAN.md` (or split into `100-08-01-PLAN.md` … `100-08-NN-PLAN.md` if the planner judges the work is too large for a single plan).

Sacred SHA gate: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
