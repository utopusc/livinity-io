# Phase 43: Exec Terminal + Enhanced Logs - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add container exec terminal (xterm.js shell into running containers) and enhance the existing log viewer with search, download, timestamps toggle, and line wrap toggle.

</domain>

<decisions>
## Implementation Decisions

### Backend — Container Exec
- New WebSocket endpoint for container exec (NOT tRPC — xterm needs raw stdin/stdout)
- Route: `/ws/docker-exec?container={name}&shell={bash|sh|ash}&user={user}`
- Auth: validate JWT from cookie or query param before accepting WebSocket
- Uses dockerode: container.exec({Cmd: [shell], AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true}) → exec.start({hijack: true, stdin: true})
- Pipe WebSocket ↔ Docker exec stream bidirectionally
- Handle resize: client sends JSON {type:'resize', cols, rows} → exec.resize({h: rows, w: cols})
- Protected containers CAN have exec (reading is fine, admin-only still)
- Close exec stream when WebSocket disconnects

### Frontend — Exec Terminal
- New "Console" tab in ContainerDetailSheet (alongside Info, Logs, Stats)
- Only shown for running containers
- Uses @xterm/xterm (already installed) + @xterm/addon-fit for auto-resize
- Shell selector dropdown: bash (default), sh, ash
- Optional user field (empty = default container user)
- Connect/Disconnect button
- WebSocket URL: `ws://${window.location.host}/ws/docker-exec?container=${name}&shell=${shell}`

### Frontend — Enhanced Logs
- Add search input to Logs tab: highlights matching text, prev/next navigation
- Add "Download" button: downloads current log content as .log file
- Add timestamps toggle (checkbox): re-fetches with timestamps=true/false
- Add line wrap toggle (checkbox): CSS white-space: pre-wrap vs pre
- Uses existing containerLogs query from Phase 36

### Claude's Discretion
- xterm.js theme/colors
- Search highlight color
- Download filename format
- Terminal font size

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- @xterm/xterm already installed (used by existing terminal features)
- Phase 36 ContainerDetailSheet with Info/Logs/Stats tabs
- Phase 36 containerLogs tRPC query
- Existing WebSocket setup in livinityd server (terminal-socket.ts pattern)
- Express server for adding WebSocket upgrade handler

### Integration Points
- Add WebSocket handler to Express server (or reuse existing upgrade mechanism)
- Add Console tab to container-detail-sheet.tsx
- Enhance Logs tab in container-detail-sheet.tsx
- Auth middleware for WebSocket (JWT validation)

</code_context>

<specifics>
- terminal-socket.ts already exists for system terminal — reuse pattern for docker exec
- xterm addon-fit handles terminal resize automatically
</specifics>

<deferred>
- Exec into multiple containers side-by-side — v14.0
- Log streaming (real-time follow) — v14.0
</deferred>
