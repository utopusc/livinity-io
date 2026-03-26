# Phase 6: Browser Viewer & Integration - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the browser-side remote desktop viewer using noVNC, accessible as a standalone page at `pc.{username}.livinity.io`. Full mouse/keyboard input, connection status with auto-reconnect, fullscreen mode with dynamic resolution, and tunnel relay accessibility.

</domain>

<decisions>
## Implementation Decisions

### Viewer Approach
- Standalone HTML page served by livinityd at `pc.{domain}` path — NOT embedded in LivOS React UI
- Uses `@novnc/novnc` npm package directly (not react-vnc wrapper) for maximum control
- Page served when Caddy routes `pc.{domain}` to livinityd port 8080
- noVNC connects to `/ws/desktop?token={JWT}` endpoint built in Phase 5

### Layout & UX
- Full-viewport canvas — no chrome, no borders, desktop fills the entire page
- Floating toolbar (top-center, auto-hide after 3s inactivity) with: fullscreen toggle, connection status badge, disconnect button
- Connection status: green dot "Connected" / yellow spinner "Reconnecting..." / red dot "Disconnected"
- Latency displayed in ms next to status badge
- Dark background behind canvas (#1a1a1a) for letterboxing if aspect ratios don't match

### Input Handling
- noVNC handles mouse and keyboard natively (RFB protocol)
- Cursor: hide local, show remote only (noVNC `showDotCursor: false`)
- Fullscreen via Fullscreen API — button in toolbar + F11 hint text
- No special keyboard handling needed beyond noVNC defaults (it captures most keys)

### Connection Management
- Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- noVNC built-in `reconnect: true, reconnect_delay: 1000` config
- Show reconnection attempts in status bar
- JWT token refresh: re-read `livinity_token` cookie on reconnect

### Resolution
- Send browser viewport dimensions to server on connect and resize
- Server-side xrandr resize to match client dimensions (via livinityd API endpoint)
- noVNC `scaleViewport: true, resizeSession: true` for client-side scaling

### Claude's Discretion
- Exact toolbar animation/styling
- Error page design when VNC is unavailable
- Loading spinner style during initial connection

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- livinityd serves static files and has Express routes — can serve the standalone HTML/JS page
- JWT token available from `livinity_token` cookie (Caddy validates before reaching livinityd)
- `/ws/desktop` WebSocket endpoint (Phase 5) ready for noVNC connection
- NativeApp auto-start on first connection (Phase 5)

### Established Patterns
- LivOS uses React 18 + Vite for the main UI, but standalone pages (like login) use simple HTML
- The `pc.{domain}` Caddy block routes to port 8080 (livinityd) after JWT cookie check

### Integration Points
- Express route in server/index.ts to serve the desktop viewer page
- noVNC JS loaded from npm package or CDN
- WebSocket URL constructed from current hostname + `/ws/desktop?token=`
- xrandr resize endpoint (new) for dynamic resolution

</code_context>

<specifics>
## Specific Ideas

The viewer page should feel like opening a native remote desktop app — full screen, no browser UI distractions. The floating toolbar should be minimal and get out of the way.

For tunnel relay accessibility: the existing relay at Server5 already handles `*.*.livinity.io` subdomains and WebSocket proxying. No relay changes needed — `pc.{username}.livinity.io` routes through the tunnel just like app subdomains.

</specifics>

<deferred>
## Deferred Ideas

- Clipboard sync (v2)
- Mobile touch controls (v2)
- On-screen virtual keyboard (v2)
- Adaptive quality based on bandwidth (v2)

</deferred>
