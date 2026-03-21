# Phase 25: Native Chrome Browser - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Install Google Chrome natively on Server4 (no Docker). On-demand browser streaming via noVNC when user opens the Chrome app in LivOS. JWT-authenticated access. Manageable from LivOS UI (start/stop). Chrome session persists across service restarts.

</domain>

<decisions>
## Implementation Decisions

### User Requirements (Locked)
- Use Google Chrome (`google-chrome-stable`), NOT Chromium
- No Docker — Chrome runs as a native process on the server
- Stream only starts when user clicks/opens Chrome app — NOT always running
- Stream stops when window is closed or idle timeout
- Must be auth-gated — no access without LivOS login (JWT cookie check)
- Chrome session persists — tabs, logins survive restarts
- Manageable from LivOS UI and AI MCP
- Remove existing Docker-based Chromium container from Server4

### Claude's Discretion
- Virtual display solution (Xvfb vs Xdummy)
- VNC server choice (x11vnc, TigerVNC, KasmVNC)
- Web streaming frontend (noVNC)
- Systemd service design for on-demand start/stop
- Idle timeout duration
- Port allocation for VNC/noVNC
- How livinityd manages native app start/stop (systemd wrapper)
- Caddy reverse proxy configuration for streaming endpoint

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` — Chrome/Chromium entry exists (id: 'chromium')
- `livos/packages/livinityd/source/modules/apps/apps.ts` — Install/uninstall flow (Docker-based)
- `livos/packages/livinityd/source/modules/apps/app.ts` — App lifecycle management
- `livos/packages/livinityd/source/server/index.ts` — Express server, Caddy proxy setup

### Current Chrome Setup
- Docker container `livinity-chromium` on Server4 using `lscr.io/linuxserver/chromium:latest`
- Port 3000, subdomain 'chrome'
- Needs to be replaced with native installation

### Integration Points
- livinityd needs new "native app" management capability (systemd service control)
- Caddy needs reverse proxy route for Chrome stream
- LivOS UI Chrome app window needs to load noVNC iframe
- Auth middleware needs to protect the streaming endpoint

</code_context>

<specifics>
## Specific Ideas

Architecture:
1. Install google-chrome-stable + Xvfb + x11vnc + noVNC/websockify on Server4
2. Create systemd service `livos-chrome.service` (Type=oneshot or simple)
3. Service script: start Xvfb :99 → start Chrome on :99 → start x11vnc → start websockify
4. livinityd: add native app endpoint (POST /api/native-app/start, /stop, /status)
5. Caddy route: chrome.{domain} → localhost:{noVNC_port} with JWT middleware
6. LivOS Chrome window: iframe to chrome.{domain}/vnc.html
7. On window close: send stop signal to livinityd → systemctl stop livos-chrome

</specifics>

<deferred>
## Deferred Ideas

- Multi-user Chrome sessions (separate displays per user)
- GPU acceleration for Chrome rendering
- Chrome extension management from LivOS UI

</deferred>
