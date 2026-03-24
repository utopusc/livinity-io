# Phase 2: System Tray Icon - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a cross-platform system tray icon to the agent that shows connection status and provides a context menu. The agent runs silently in the background — the tray icon is the only visible indicator. After this phase, users can see at a glance whether their PC is connected to LivOS.

</domain>

<decisions>
## Implementation Decisions

### Tray Library
- Use `node-systray` (or `systray2`) npm package — lightweight, cross-platform (Win/Mac/Linux), no native compilation
- Alternative: `electron-tray` requires Electron — rejected (too heavy)
- The tray icon uses PNG files embedded in the binary

### Tray Icons
- 3 icon states: connected (green), connecting (yellow), disconnected (red/gray)
- Simple 16x16 and 32x32 PNG icons — Livinity "L" logo with colored dot
- Store as base64 in code or as files alongside the binary
- Icons at `agent/assets/tray-connected.png`, `tray-connecting.png`, `tray-disconnected.png`

### Tray Menu
- Right-click context menu items:
  1. **Status: Connected to LivOS** (disabled text, shows current state)
  2. **Open Setup** → opens browser to setup wizard (reuses setup-server from Phase 1)
  3. **Disconnect** → disconnects from relay, icon goes gray
  4. **Quit** → graceful shutdown, cleanup PID file

### Integration
- `agent/src/tray.ts` — new module: `startTray(onDisconnect, onQuit, onOpenSetup)` with `updateStatus(status)` method
- ConnectionManager emits status changes → tray updates icon
- Tray starts in `startCommand()` after connection manager initializes
- On Windows: tray icon in notification area
- On macOS: menu bar icon
- On Linux: system tray (depends on desktop environment)

### Claude's Discretion
- Exact icon design (simple colored dot is fine)
- Tooltip text format
- Whether to use PNG files or base64 embedded icons

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agent/src/connection-manager.ts` — ConnectionManager with status tracking (connected/disconnected/connecting)
- `agent/src/cli.ts` — startCommand() where tray should be initialized
- `agent/src/setup-server.ts` — setup wizard server (Open Setup menu item reuses this)

### Established Patterns
- Agent uses event-style callbacks (onMessage, onClose)
- Status tracking already exists in ConnectionManager

### Integration Points
- `cli.ts` startCommand: initialize tray after ConnectionManager
- `connection-manager.ts`: emit status changes to tray
- New module: `agent/src/tray.ts`
- New assets: `agent/assets/` directory with tray icon PNGs

</code_context>

<specifics>
## Specific Ideas

- Keep it minimal — the tray is just a status indicator and quick menu, not a full UI
- The icon should be instantly recognizable as "connected" or "not connected"

</specifics>

<deferred>
## Deferred Ideas

- Notification popups on connect/disconnect — v15.0
- Tray icon tooltip showing detailed stats — v15.0

</deferred>
