# Requirements: Livinity v14.0 -- Remote PC Control Agent

**Defined:** 2026-03-23
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v14.0 Requirements

### Agent -- Remote Agent Binary

- [x] **AGENT-01**: User can download a single binary for their platform (Windows/Mac/Linux)
- [x] **AGENT-02**: Agent runs as background daemon with start/stop/status CLI commands
- [x] **AGENT-03**: Agent auto-reconnects with exponential backoff on connection loss
- [x] **AGENT-04**: Agent reports its available tools to the relay on connect

### Auth -- Device Authentication

- [x] **AUTH-01**: Agent performs OAuth Device Authorization Grant via `setup` command
- [x] **AUTH-02**: User approves device at livinity.io/device by entering the displayed code
- [x] **AUTH-03**: Agent stores device token securely and auto-refreshes on expiry

### Platform -- livinity.io Device Endpoints

- [x] **PLAT-01**: livinity.io exposes POST /api/device/register (generates device_code + user_code)
- [x] **PLAT-02**: livinity.io exposes POST /api/device/token (agent polls for approval)
- [x] **PLAT-03**: livinity.io has /device approval page where user enters code

### Relay -- Relay Server Extension

- [x] **RELAY-01**: Relay accepts device connections at /device/connect WebSocket endpoint
- [x] **RELAY-02**: Relay maintains DeviceRegistry (user -> devices mapping)
- [x] **RELAY-03**: Relay routes tool_call/tool_result messages between LivOS tunnel and device
- [x] **RELAY-04**: Relay notifies LivOS when devices connect/disconnect

### Shell -- Remote Shell Execution

- [x] **SHELL-01**: AI can execute shell commands on the remote PC
- [x] **SHELL-02**: Agent uses the correct shell per OS (PowerShell/bash/zsh)
- [x] **SHELL-03**: Command output returns as structured JSON result

### Files -- Remote File Operations

- [x] **FILES-01**: AI can list directory contents with metadata (name, size, type, modified date)
- [x] **FILES-02**: AI can read file contents from the remote PC
- [x] **FILES-03**: AI can write/create files on the remote PC
- [x] **FILES-04**: AI can delete and rename files on the remote PC

### Proc -- Process & System Info

- [x] **PROC-01**: AI can list running processes with PID, name, CPU%, memory
- [x] **PROC-02**: AI can collect system info (OS, CPU, RAM, disk, hostname, IPs, uptime)

### Screen -- Screenshot Capture

- [x] **SCREEN-01**: AI can capture on-demand screenshot of the remote PC display

### Tools -- AI Tool Integration

- [x] **TOOLS-01**: Connected device tools dynamically register in Nexus ToolRegistry as proxy tools
- [x] **TOOLS-02**: Tools unregister when device disconnects
- [x] **TOOLS-03**: Tool names prefixed with `device_{deviceId}_` to avoid collisions

### UI -- My Devices Panel

- [x] **UI-01**: LivOS shows "My Devices" panel listing connected devices
- [x] **UI-02**: Each device shows name, OS, platform icon, connection status, last seen
- [x] **UI-03**: User can rename or remove a device

### Audit -- Audit Logging

- [x] **AUDIT-01**: Every remote tool execution logged with timestamp, user, tool, parameters, result
- [x] **AUDIT-02**: Audit log viewable per device from LivOS UI

### Security

- [x] **SEC-01**: All agent-relay transport uses WSS (TLS 1.3)
- [x] **SEC-02**: Device tokens are JWTs with 24h expiry and auto-refresh
- [x] **SEC-03**: Agent runs as logged-in user (not root/SYSTEM) by default
- [x] **SEC-04**: Dangerous command blocklist enforced on agent side

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
| Full desktop streaming (RDP/VNC) | Different product -- 90% of RustDesk is video streaming. AI doesn't need live video |
| Keyboard/mouse takeover | AI executes structured commands, not GUI interaction |
| Multi-device orchestration | v15+ after single-device is proven |
| Wake-on-LAN | Requires LAN peer, niche use case |
| Browser automation on remote PC | Enormous attack surface, credential theft risk |
| Real-time screen recording | Privacy invasion, massive storage, legal issues |
| Mobile agent (Android/iOS) | Fundamentally different capabilities, separate product |
| Application install abstraction | Shell IS the abstraction -- AI knows which package manager per OS |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Phase 47 | Complete |
| PLAT-02 | Phase 47 | Complete |
| PLAT-03 | Phase 47 | Complete |
| RELAY-01 | Phase 47 | Complete |
| RELAY-02 | Phase 47 | Complete |
| AGENT-01 | Phase 48 | Complete |
| AGENT-02 | Phase 48 | Complete |
| AGENT-03 | Phase 48 | Complete |
| AGENT-04 | Phase 48 | Complete |
| AUTH-01 | Phase 48 | Complete |
| AUTH-02 | Phase 48 | Complete |
| AUTH-03 | Phase 48 | Complete |
| SEC-01 | Phase 48 | Complete |
| SEC-02 | Phase 48 | Complete |
| RELAY-03 | Phase 49 | Complete |
| RELAY-04 | Phase 49 | Complete |
| TOOLS-01 | Phase 49 | Complete |
| TOOLS-02 | Phase 49 | Complete |
| TOOLS-03 | Phase 49 | Complete |
| SHELL-01 | Phase 50 | Complete |
| SHELL-02 | Phase 50 | Complete |
| SHELL-03 | Phase 50 | Complete |
| FILES-01 | Phase 50 | Complete |
| FILES-02 | Phase 50 | Complete |
| FILES-03 | Phase 50 | Complete |
| FILES-04 | Phase 50 | Complete |
| PROC-01 | Phase 51 | Complete |
| PROC-02 | Phase 51 | Complete |
| SCREEN-01 | Phase 51 | Complete |
| UI-01 | Phase 52 | Complete |
| UI-02 | Phase 52 | Complete |
| UI-03 | Phase 52 | Complete |
| AUDIT-01 | Phase 53 | Complete |
| AUDIT-02 | Phase 53 | Complete |
| SEC-03 | Phase 53 | Complete |
| SEC-04 | Phase 53 | Complete |

**Coverage:**
- v14.0 requirements: 36 total
- Mapped to phases: 36
- Unmapped: 0

---
*Requirements defined: 2026-03-23*
*Last updated: 2026-03-23 after roadmap creation*
