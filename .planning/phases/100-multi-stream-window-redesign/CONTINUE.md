---
phase: 100-multi-stream-window-redesign
status: partial-pass-with-residual-bugs
date: 2026-05-08
audience: next-session
---

# Phase 100 — CONTINUE (residual bugs + selfclaude study)

## Status snapshot

**Code-shipped + deployed to Mini PC `2f973413`:**
- 100-01..05 (5 plans, original scope) — visual rewire + multi-stream creation works
- 100-06 — UI revisions (action bar OUTSIDE window, round, drop Watch, 1280x720 base)
- 100-06.1 — Chrome spawn `--window-size=1280,720 --window-position=0,0`
- 100-06.2 — getResponsiveSize aspect-preserve (16:9 lock when clamping)
- 100-07.1/.2 — User canvas click bypass (RFB viewOnly + tRPC `webapp.input.*` + xdotool windowactivate-first)
- 100-07.3 — Bytebot `tryXdotoolClick` activate-first + chat UI object render fix
- 100-07.4 — Bytebot host MCP auto-scope via `/tmp/livos-active-webapp-wid` shared-file IPC

**Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across 31 commits + 10 deploys.**

## RESIDUAL BUGS (user-reported 2026-05-08)

### Bug 1 — Stream still opens VERTICAL despite 100-06.2 fix
- 100-06.2 made `getResponsiveSize` aspect-preserve for WebApp windows.
- User confirms it's still showing dikey (vertical).
- **Hypotheses to investigate:**
  - Service-worker cache served old UI (test: hard-refresh + DevTools → Application → Service Workers → Unregister + Storage → Clear site data + Ctrl+Shift+R)
  - Chrome `--window-size` flag IGNORED on subsequent app spawns due to IPC merge with the existing `--start-maximized` host Chrome (PID 4089251, started by some other process at boot)
  - LivOS window size correct (yatay) but the captured Chrome wid is dikey because Chrome inherited maximize state from existing instance
- **Quickest verification:** SSH to Mini PC, `xdotool getwindowgeometry <gmail_wid>` after fresh Gmail open → if NOT 1280×720 then Chrome's --window-size is being ignored (root cause = existing Chrome instance already maximized)
- **Possible fix:** kill ALL google-chrome procs (including the host PID 4089251) before spawning new --app= Chromes. This forces Chrome to start fresh with our flags honored. OR use `--user-data-dir=` per-WebApp (D-100-SHARED-PROFILE rejected; would lose Google login).

### Bug 2 — When WebApp B opens, WebApp A no longer controllable
- User canvas clicks (100-07.1/.2) ARE per-webapp routed — verify in browser console that `[100-07.2] click → tRPC webappId=<A>` shows the CORRECT webappId
- Bytebot via 100-07.4 single-active-wid file: if 2 WebApps active, marker file is empty → bytebot falls back to host display → bug returns
- **Proper fix queued** (100-07.5): per-WebApp bytebot MCP child process spawn lifecycle (window-manager.spawn → mcpClientManager.registerWebAppInstance with PerWebAppMcpDescriptor; close → deregister)
- **Why not yet shipped:** requires also fixing chat-surface tool-routing so the agent uses `mcp__bytebot:webapp:<wid>__*` instead of host `mcp__bytebot__*`. Spec'd in 100-07 plan but multi-touchpoint (mcp-client-manager + agent runner + system prompt). Estimated 1-2 days.

## SELFCLAUDE REFERENCE (user's hackathon project)

**Repo:** https://github.com/utopusc/selfclaude

**Why study it:** user built it today during a hackathon and reports it WORKS for the same use case (computer-use / multi-window agent control). Patterns there may be the right architectural template for the LivOS rewrite of this subsystem.

**What to look for in selfclaude:**
1. Per-window input routing — how does it dispatch clicks per wid? xdotool? CDP? Wayland? VNC RFB?
2. Per-window agent scope — how does the agent target the correct window? MCP scoping? Direct IPC? System prompt?
3. Chrome window size lock — how does it produce a stable 1280×720 (or whatever) capture canvas? --window-size flag honored? Custom Xvfb?
4. Multi-stream isolation — what stops cross-stream interference?

## SUGGESTED NEXT-SESSION FLOW

Recommended `/gsd-*` sequence after `/clear`:

```
/gsd-progress                       # see updated roadmap + Phase 100 PARTIAL-PASS state
/gsd-discuss-phase 100-08           # spec a new "selfclaude study + routing rewrite" phase
                                    # — reference https://github.com/utopusc/selfclaude
                                    # — bring back patterns into LivOS
                                    # — design proper per-WebApp MCP wiring
/gsd-plan-phase 100-08              # produce plans
/gsd-execute-phase 100-08           # ship
```

Or for just the focused routing fix:

```
/gsd-discuss-phase 100-07-routing-proper
                                    # spec the per-WebApp MCP child lifecycle
                                    # without the selfclaude detour
```

## KEY FILES TO RE-READ ON RESUME

- `.planning/phases/100-multi-stream-window-redesign/CONTINUE.md` (this file)
- `.planning/phases/100-multi-stream-window-redesign/PHASE-SUMMARY.md` (Phase 100 close + carry-overs)
- `.planning/phases/100-multi-stream-window-redesign/100-05-SUMMARY.md` (UAT 9/11 + diagnosis)
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` (Chrome spawn argv + getSingleActiveWid)
- `livos/packages/livinityd/source/modules/webapps/input-dispatcher.ts` (user-click xdotool path)
- `livos/packages/livinityd/source/modules/computer-use/native/input.ts` (bytebot xdotool path)
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` (resolveWindowId 4-tier fallback)
- `liv/packages/core/src/mcp-client-manager.ts` (registerWebAppInstance — already exists, never wired to spawn)
- `livos/packages/livinityd/source/modules/computer-use/bytebot-mcp-config.ts` (buildBytebotConfig with PerWebAppMcpDescriptor — already exists, never spawned)

## SACRED CONSTRAINT (locked through 100-08+)

`liv/packages/core/src/sdk-agent-runner.ts` SHA must remain `f3538e1d811992b782a9bb057d1b7f0a0189f95f` at all times. Pre-commit hook at `.husky/pre-commit` enforces. NEVER use `--no-verify`.

## Memory write pending

Save `project_p100_routing_open.md` capturing:
- Phase 100 closed PARTIAL-PASS with 2 known bugs (vertical stream + multi-stream routing)
- selfclaude reference URL
- Path forward: 100-08 (selfclaude study) or 100-07-routing-proper
- Sacred SHA hook is live and active
