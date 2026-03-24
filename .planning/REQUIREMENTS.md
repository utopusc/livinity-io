# Requirements: Livinity v14.0 — Remote PC Control Agent

**Defined:** 2026-03-23
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v14.0 Requirements

### Agent — Remote Agent Binary

- [ ] **AGENT-01**: User can download a single binary for their platform (Windows/Mac/Linux)
- [ ] **AGENT-02**: Agent runs as background daemon with start/stop/status CLI commands
- [ ] **AGENT-03**: Agent auto-reconnects with exponential backoff on connection loss
- [ ] **AGENT-04**: Agent reports its available tools to the relay on connect

### Auth — Device Authentication

- [ ] **AUTH-01**: Agent performs OAuth Device Authorization Grant via `setup` command
- [ ] **AUTH-02**: User approves device at livinity.io/device by entering the displayed code
- [ ] **AUTH-03**: Agent stores device token securely and auto-refreshes on expiry

### Platform — livinity.io Device Endpoints

- [ ] **PLAT-01**: livinity.io exposes POST /api/device/register (generates device_code + user_code)
- [ ] **PLAT-02**: livinity.io exposes POST /api/device/token (agent polls for approval)
- [ ] **PLAT-03**: livinity.io has /device approval page where user enters code

### Relay — Relay Server Extension

- [ ] **RELAY-01**: Relay accepts device connections at /device/connect WebSocket endpoint
- [ ] **RELAY-02**: Relay maintains DeviceRegistry (user -> devices mapping)
- [ ] **RELAY-03**: Relay routes tool_call/tool_result messages between LivOS tunnel and device
- [ ] **RELAY-04**: Relay notifies LivOS when devices connect/disconnect

### Shell — Remote Shell Execution

- [ ] **SHELL-01**: AI can execute shell commands on the remote PC
- [ ] **SHELL-02**: Agent uses the correct shell per OS (PowerShell/bash/zsh)
- [ ] **SHELL-03**: Command output returns as structured JSON result

### Files — Remote File Operations

- [ ] **FILES-01**: AI can list directory contents with metadata (name, size, type, modified date)
- [ ] **FILES-02**: AI can read file contents from the remote PC
- [ ] **FILES-03**: AI can write/create files on the remote PC
- [ ] **FILES-04**: AI can delete and rename files on the remote PC

### Proc — Process & System Info

- [ ] **PROC-01**: AI can list running processes with PID, name, CPU%, memory
- [ ] **PROC-02**: AI can collect system info (OS, CPU, RAM, disk, hostname, IPs, uptime)

### Screen — Screenshot Capture

- [ ] **SCREEN-01**: AI can capture on-demand screenshot of the remote PC display

### Tools — AI Tool Integration

- [ ] **TOOLS-01**: Connected device tools dynamically register in Nexus ToolRegistry as proxy tools
- [ ] **TOOLS-02**: Tools unregister when device disconnects
- [ ] **TOOLS-03**: Tool names prefixed with `device_{deviceId}_` to avoid collisions

### UI — My Devices Panel

- [ ] **UI-01**: LivOS shows "My Devices" panel listing connected devices
- [ ] **UI-02**: Each device shows name, OS, platform icon, connection status, last seen
- [ ] **UI-03**: User can rename or remove a device

### Audit — Audit Logging

- [ ] **AUDIT-01**: Every remote tool execution logged with timestamp, user, tool, parameters, result
- [ ] **AUDIT-02**: Audit log viewable per device from LivOS UI

### Security

- [ ] **SEC-01**: All agent-relay transport uses WSS (TLS 1.3)
- [ ] **SEC-02**: Device tokens are JWTs with 24h expiry and auto-refresh
- [ ] **SEC-03**: Agent runs as logged-in user (not root/SYSTEM) by default
- [ ] **SEC-04**: Dangerous command blocklist enforced on agent side

## Future Requirements (v14.1)

### Permissions

- **PERM-01**: Per-device permission matrix (shell scope, file path restrictions)
- **PERM-02**: User can configure what AI can do per device from UI

### Enhanced Capabilities

- **ENH-01**: Clipboard sync as AI-readable tool
- **ENH-02**: Process kill/terminate capability
- **ENH-03**: Service management (systemd/launchctl/sc)
- **ENH-04**: File search (find by name/content on remote PC)
- **ENH-05**: Multi-monitor screenshot selection
- **ENH-06**: Agent auto-update mechanism
- **ENH-07**: Agent tray icon / config UI

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full desktop streaming (RDP/VNC) | Different product — 90% of RustDesk is video streaming. AI doesn't need live video |
| Keyboard/mouse takeover | AI executes structured commands, not GUI interaction |
| Multi-device orchestration | v15+ after single-device is proven |
| Wake-on-LAN | Requires LAN peer, niche use case |
| Browser automation on remote PC | Enormous attack surface, credential theft risk |
| Real-time screen recording | Privacy invasion, massive storage, legal issues |
| Mobile agent (Android/iOS) | Fundamentally different capabilities, separate product |
| Application install abstraction | Shell IS the abstraction — AI knows which package manager per OS |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AGENT-01 | TBD | Pending |
| AGENT-02 | TBD | Pending |
| AGENT-03 | TBD | Pending |
| AGENT-04 | TBD | Pending |
| AUTH-01 | TBD | Pending |
| AUTH-02 | TBD | Pending |
| AUTH-03 | TBD | Pending |
| PLAT-01 | TBD | Pending |
| PLAT-02 | TBD | Pending |
| PLAT-03 | TBD | Pending |
| RELAY-01 | TBD | Pending |
| RELAY-02 | TBD | Pending |
| RELAY-03 | TBD | Pending |
| RELAY-04 | TBD | Pending |
| SHELL-01 | TBD | Pending |
| SHELL-02 | TBD | Pending |
| SHELL-03 | TBD | Pending |
| FILES-01 | TBD | Pending |
| FILES-02 | TBD | Pending |
| FILES-03 | TBD | Pending |
| FILES-04 | TBD | Pending |
| PROC-01 | TBD | Pending |
| PROC-02 | TBD | Pending |
| SCREEN-01 | TBD | Pending |
| TOOLS-01 | TBD | Pending |
| TOOLS-02 | TBD | Pending |
| TOOLS-03 | TBD | Pending |
| UI-01 | TBD | Pending |
| UI-02 | TBD | Pending |
| UI-03 | TBD | Pending |
| AUDIT-01 | TBD | Pending |
| AUDIT-02 | TBD | Pending |
| SEC-01 | TBD | Pending |
| SEC-02 | TBD | Pending |
| SEC-03 | TBD | Pending |
| SEC-04 | TBD | Pending |

**Coverage:**
- v14.0 requirements: 36 total
- Mapped to phases: 0
- Unmapped: 36

---
*Requirements defined: 2026-03-23*
*Last updated: 2026-03-23 after initial definition*
