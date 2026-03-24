# Phase 48: Agent Binary + Authentication - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase creates the remote agent binary — a Node.js application that compiles to a single executable via SEA. Delivers: CLI with setup/start/stop/status commands, OAuth Device Authorization Grant flow (polling livinity.io endpoints from Phase 47), WebSocket connection manager to relay /device/connect, heartbeat, exponential backoff reconnection, and tool capability advertisement. Does NOT implement the actual tools (Phase 50-51) or message routing (Phase 49).

</domain>

<decisions>
## Implementation Decisions

### Project Structure
- Create agent as a new top-level directory: `agent/` (NOT inside livos/ or nexus/)
- TypeScript source in `agent/src/`, build output in `agent/dist/`
- Package.json with esbuild for bundling, Node.js SEA for binary creation
- Share protocol types with relay by importing from `../platform/relay/src/device-protocol.ts` or duplicating (prefer duplication for SEA bundling simplicity)

### CLI Commands
- Entry point: `src/index.ts` with subcommand routing (setup, start, stop, status)
- `livinity-agent setup` — OAuth device flow: POST /api/device/register, display code+URL, poll /api/device/token every 5s, store token to ~/.livinity/credentials.json
- `livinity-agent start` — Read stored token, connect to relay WSS, maintain heartbeat, run as foreground process (background daemon deferred to v14.1)
- `livinity-agent stop` — Send SIGTERM to running process (via PID file at ~/.livinity/agent.pid)
- `livinity-agent status` — Read PID file and connection state from ~/.livinity/state.json

### Connection Manager
- Connect to `wss://relay.livinity.io/device/connect` (URL from token response or config)
- Send DeviceAuth message on connect: { type: 'device_auth', token, deviceId, deviceName, platform, tools[] }
- Heartbeat: respond to ping with pong (30s interval, matching relay)
- Auto-reconnect with exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, max 60s (same as TunnelClient)
- Add jitter: ±20% randomization on backoff delay
- Log connection state changes to console

### Tool Registration
- On connect, send list of available tool names to relay (tools are stubs for now — actual implementations in Phase 50-51)
- Tool list: ['shell', 'files_list', 'files_read', 'files_write', 'files_delete', 'files_rename', 'processes', 'system_info', 'screenshot']
- Tools are declared but NOT implemented — tool executor dispatches to stubs that return "not yet implemented"

### Credential Storage
- Store at `~/.livinity/credentials.json`: { deviceToken, deviceId, deviceName, relayUrl, platform }
- Store PID at `~/.livinity/agent.pid`
- Store runtime state at `~/.livinity/state.json`: { status, connectedAt, relayUrl, deviceName }
- Create ~/.livinity/ directory on first setup

### Build System
- esbuild bundles to single JS file: `dist/agent.js`
- Node.js SEA config: `sea-config.json`
- npm scripts: `build` (esbuild), `build:sea` (full SEA binary), `dev` (tsx for development)
- Cross-platform SEA builds deferred to CI/CD — local dev uses `npx tsx src/index.ts`

### Claude's Discretion
- Console output formatting (colors, spinners, etc.)
- Error message wording
- Config file format details beyond what's specified

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `platform/relay/src/device-protocol.ts` — Device message types (DeviceAuth, DeviceConnected, DeviceAuthError, etc.)
- `platform/relay/src/config.ts` — RELAY_HOST, HEARTBEAT_INTERVAL_MS constants
- `livos/packages/livinityd/source/modules/platform/tunnel-client.ts` — ReconnectionManager pattern with exponential backoff + jitter

### Established Patterns
- TunnelClient in livinityd: WebSocket connection with auth-on-first-message, ping/pong heartbeat, ReconnectionManager class
- DeviceAuth message format from device-protocol.ts: { type: 'device_auth', token, deviceId, deviceName, platform, tools }
- OAuth endpoints from Phase 47: POST /api/device/register, POST /api/device/token (poll), POST /api/device/approve

### Integration Points
- Agent connects to relay at wss://relay.livinity.io/device/connect
- Agent polls livinity.io at /api/device/register and /api/device/token during setup
- Agent sends DeviceAuth message matching relay's onDeviceConnect handler

</code_context>

<specifics>
## Specific Ideas

- The agent should feel like a polished CLI tool — clear setup instructions, connection status feedback
- Use the same reconnection pattern as TunnelClient (proven in production) but adapted for the agent context
- For dev/testing, `npx tsx src/index.ts start` should work without needing to build the SEA binary
- Tool list should match what Phase 50-51 will implement so the relay gets accurate capability info

</specifics>

<deferred>
## Deferred Ideas

- Background daemon mode (systemd/launchd/Windows service) — v14.1
- Agent tray icon / GUI — v14.1
- Agent auto-update mechanism — v14.1
- Code signing for binaries — v14.1
- Token storage in OS keychain (DPAPI/Keychain/libsecret) — v14.1, using file for now

</deferred>
