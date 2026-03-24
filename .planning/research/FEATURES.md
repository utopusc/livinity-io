# Feature Research: Remote PC Control Agent

**Domain:** Cross-platform remote PC control agent for AI-driven management
**Researched:** 2026-03-23
**Confidence:** HIGH (based on analysis of RustDesk, MeshCentral, Tailscale, Teleport, TeamViewer, Claude Computer Use, Open Interpreter)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or untrustworthy.

#### 1. Device Registration and Discovery

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| One-command agent install | Every competitor (RustDesk, MeshCentral, Tailscale) does this. Friction = abandonment | MEDIUM | Single binary download + `./livinity-agent install` or MSI/DMG/DEB. Auto-registers on first run |
| OAuth-based device registration | Users expect to log in once and have the device appear. MeshCentral agents auto-register in under 60 seconds | MEDIUM | Agent opens browser for livinity.io OAuth, receives device token, registers with LivOS |
| Unique device identity | All tools assign persistent device IDs. RustDesk uses numeric IDs, MeshCentral uses agent GUIDs | LOW | Generate UUID on first install, persist in agent config file. Survives reboots and updates |
| Device naming (human-readable) | Tailscale MagicDNS auto-generates names from hostname. Users expect "Bruce-Desktop" not "a3f7c2d1" | LOW | Default to OS hostname, allow rename from LivOS UI |
| Online/offline status indicator | Every remote tool shows green/red dots. Users need instant trust signal | LOW | WebSocket heartbeat (30s interval), show last-seen timestamp when offline |
| Auto-reconnection | Tailscale, RustDesk all handle network changes silently. Dropping and not recovering is unacceptable | MEDIUM | Exponential backoff reconnect (1s, 2s, 4s... max 60s). Handle WiFi switches, sleep/wake, IP changes |

#### 2. Remote Shell / Terminal

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Interactive shell session | Core feature of every remote management tool. Teleport, MeshCentral, Tailscale SSH all provide this | HIGH | Spawn PTY (pseudo-terminal) on agent side, stream stdin/stdout over WebSocket. Must handle Windows (ConPTY), macOS/Linux (posix PTY) |
| Cross-platform shell detection | Users expect the right shell: PowerShell on Windows, bash/zsh on macOS/Linux | LOW | Detect OS, spawn appropriate default shell. Allow override in agent config |
| Working directory persistence | Shell sessions should remember cwd between commands within a session | LOW | Maintain PTY session state. Already handled by PTY approach |
| Environment variable access | Remote shell must see user's PATH, HOME, etc. MeshCentral agents run in user context | MEDIUM | Agent must run as the logged-in user (or configurable user), not just SYSTEM/root |
| Command output streaming | Users expect real-time output, not batch. Teleport streams SSH output in browser | MEDIUM | Chunked WebSocket streaming. Buffer management for large outputs (e.g., `find /`) |
| Shell session timeout | Security requirement. Teleport enforces idle timeouts | LOW | Configurable idle timeout (default 30 min), explicit session close |

#### 3. File Transfer and Browsing

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Remote directory listing | Every tool has a file browser. MeshCentral "Files" tab, RustDesk file manager | MEDIUM | Agent lists directory contents with metadata (size, type, modified date, permissions) |
| File upload (LivOS to PC) | Basic file transfer is table stakes. TeamViewer, AnyDesk, RustDesk all do this | MEDIUM | Chunked upload over WebSocket/HTTP. Resume support for large files. Progress indication |
| File download (PC to LivOS) | Bidirectional transfer expected. TeamViewer offers drag-and-drop in both directions | MEDIUM | Stream file from agent to LivOS. Same chunked protocol as upload |
| Path navigation (breadcrumbs) | Users expect to browse like a file manager, not type raw paths | LOW | UI concern. Agent returns directory tree data, LivOS renders breadcrumb navigation |
| File metadata (size, date, perms) | Standard in every file browser. MeshCentral shows full file details | LOW | Agent stat() calls, return structured JSON |
| Create/delete/rename files | Basic file operations. LivOS already has a file manager, users expect parity | LOW | Agent exposes CRUD file operations via API |

#### 4. Process Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Process list with resource usage | ManageEngine, MeshCentral, Remote Utilities all show running processes with CPU/RAM. Users expect a task manager view | MEDIUM | Cross-platform: Windows (WMI/tasklist), macOS (ps aux), Linux (proc filesystem). Return PID, name, CPU%, memory, user |
| Kill/terminate process | Every remote management tool supports this. Action1, N-able all provide remote kill | LOW | Send SIGTERM/SIGKILL (Unix) or TerminateProcess (Windows). Require confirmation in UI |
| Service status listing | IT admins expect to see and manage services. ManageEngine, Remote Utilities show services tab | MEDIUM | Windows (sc query), Linux (systemctl list-units), macOS (launchctl list). Return name, status, startup type |

#### 5. System Information Collection

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| OS version and type | Every device management tool shows this. MeshCentral displays in device list | LOW | Agent reports at registration and on heartbeat changes |
| CPU, RAM, disk overview | Standard dashboard data. MeshCentral, EMCO inventory, PDQ all collect this | LOW | Agent collects on connect and periodically (every 5 min). Report total/used/free |
| Hostname and network info | Users need to know which machine they are controlling. IP address, MAC for WoL | LOW | Report hostname, local IPs, MAC addresses, public IP |
| Uptime | Standard system health indicator | LOW | Agent reports OS uptime. Simple cross-platform API call |

#### 6. Screenshot / Screen Capture

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| On-demand screenshot | MeshCentral, Alloy Remote Screenshot, MIS all support this. AI needs visual context | MEDIUM | Capture primary display, compress as JPEG/PNG, send to LivOS. Windows (GDI/DXGI), macOS (CGDisplayCreateImage), Linux (X11/Wayland grab) |
| Multi-monitor awareness | RustDesk supports multi-monitor. Users with 2+ screens need to specify which one | MEDIUM | Enumerate displays, capture specific or all. Report display topology |

#### 7. Connection and Security

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| TLS-encrypted transport | Every production tool uses encryption. TeamViewer AES-256, RustDesk NaCl E2EE | MEDIUM | TLS 1.3 for agent-to-relay. Token-based auth on every connection |
| Authentication token rotation | Security baseline. Tokens should not be permanent | LOW | Short-lived JWT or device tokens, auto-refresh via relay |
| Heartbeat / keepalive | All tools maintain persistent connections with health checks | LOW | 30-second ping/pong over WebSocket. Detect stale connections server-side |

---

### Differentiators (Competitive Advantage)

These are what make LivOS's remote agent fundamentally different from RustDesk/MeshCentral/TeamViewer. The key insight: **traditional tools are human-operated via GUI; LivOS's agent is AI-operated via structured tool APIs.**

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **AI-native tool interface** | Agent exposes structured JSON APIs (not GUI). AI calls `shell.execute("ls -la")`, `files.list("/home")`, `process.kill(1234)` as tools. No other remote desktop tool is designed API-first for AI consumption | HIGH | This is the core differentiator. Every capability is a well-typed tool the AI can invoke. Inspired by Claude Computer Use's tool approach but without needing screenshots for every action |
| **Natural language device control** | User says "show me what's eating CPU on my desktop" and AI runs process list, identifies culprit, offers to kill it. No clicking through menus | MEDIUM | Orchestration layer in LivOS's existing AI agent. Agent provides raw capabilities, AI provides intelligence |
| **Structured output for AI reasoning** | Agent returns typed JSON (not raw terminal text). Process list returns `{pid, name, cpu, mem}` not a text table. AI can reason over data without parsing | MEDIUM | Design all agent responses as structured data. AI gets machine-readable data, not human-readable text. This is what separates this from just "SSH + LLM" |
| **Per-device permission scoping** | User configures what AI can do per device: "shell: read-only, files: home directory only, processes: view only". Fine-grained RBAC per device | HIGH | Permission matrix: {device} x {capability} x {scope}. More granular than MeshCentral's group-level permissions. Critical for trust |
| **Audit log with AI intent** | Logs not just "ran command X" but "AI ran command X because user asked to free disk space". Links AI reasoning to actions | MEDIUM | Extend existing LivOS audit system. Each tool invocation logs: user request, AI reasoning, tool call, result |
| **Multi-device orchestration** | "Update node.js on all my machines" -- AI runs commands across multiple devices in parallel. MeshCentral supports multi-device commands but requires manual scripting | HIGH | Fan-out tool execution. AI decides per-device commands (apt vs brew vs choco). Aggregate results. Defer to v2+ |
| **Contextual system awareness** | Agent continuously reports system state so AI can proactively suggest: "Your desktop is running low on disk, want me to clean temp files?" | MEDIUM | Periodic telemetry (every 5 min): disk, CPU, RAM, notable processes. AI can reference without explicit query |
| **Clipboard bridge** | Copy on PC, paste in LivOS AI chat (and vice versa). AI can read clipboard as context for requests | MEDIUM | RustDesk and TeamViewer have clipboard sync but it is human-to-human. LivOS makes clipboard an AI-readable tool |
| **Wake-on-LAN integration** | "Turn on my desktop" from LivOS. Agent on another device on the same LAN sends WoL packet | MEDIUM | Requires a peer agent on the same LAN (or the LivOS server itself if co-located). Store MAC addresses from device registration |
| **Zero-config tunnel routing** | Agent connects outbound to livinity.io relay, no port forwarding needed. Like Tailscale but without installing a VPN on both sides | MEDIUM | Agent maintains persistent outbound WebSocket to relay. LivOS connects to relay. Relay bridges the two. Already have relay infrastructure from livinity.io platform |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full desktop streaming (RDP/VNC)** | "I want to see my desktop screen live" | Extremely complex (codec, latency, bandwidth). RustDesk's core codebase is 90% video streaming. Massive engineering effort for marginal AI value. AI does not need a live video feed to run shell commands | On-demand screenshots when AI needs visual context. Users who need full remote desktop should use RustDesk/MeshCentral alongside LivOS |
| **Keyboard/mouse takeover** | "I want to control the mouse remotely" | Same as above -- full remote desktop is a different product. Also creates dangerous AI autonomy concerns (AI moving your mouse) | AI executes structured commands (shell, file ops). For the rare case needing visual interaction, screenshots + coordinate-based clicks could be a v3+ exploration |
| **Unattended access without user consent** | "Agent should work even when I'm not logged in" | Security nightmare for an AI-controlled agent. User must explicitly trust and configure | Agent runs as user-level service (not root/SYSTEM by default). Elevated mode available but opt-in with clear warnings |
| **Browser automation on remote PC** | "Have the AI browse the web on my desktop" | Enormous attack surface, credential theft risk, unreliable | AI can open URLs via shell command. Full browser automation is out of scope -- use dedicated tools (Playwright, etc.) |
| **Real-time screen recording** | "Record everything happening on my screen" | Privacy invasion, massive storage, legal issues in many jurisdictions | Audit log of AI actions is sufficient. Point-in-time screenshots on AI request only |
| **Chat/messaging between devices** | "Let me send messages to my PC" | Feature creep -- there are a million chat apps | AI chat in LivOS IS the communication channel. Commands flow through AI, not direct messaging |
| **Application install abstraction** | "Install Chrome on my PC remotely via a unified API" | Cross-platform package management is a bottomless pit (chocolatey vs winget vs brew vs apt vs snap vs flatpak) | AI can execute install commands via shell. No abstraction layer needed -- the shell IS the abstraction. AI knows which package manager to use per OS |
| **Remote printing** | "Print a document on my remote PC" | Extremely niche, complex driver issues | Shell command: `lpr` / `print` via remote shell if truly needed |

---

## Feature Dependencies

```
[Device Registration & Auth]
    |
    +--requires--> [Secure Tunnel / WebSocket Connection]
    |                   |
    |                   +--enables--> [Remote Shell]
    |                   +--enables--> [File Transfer]
    |                   +--enables--> [Process Management]
    |                   +--enables--> [Screenshot Capture]
    |                   +--enables--> [Clipboard Sync]
    |                   +--enables--> [System Info Collection]
    |
    +--enables--> [Device Dashboard UI ("My Devices")]

[Per-Device Permissions]
    +--requires--> [Device Registration & Auth]
    +--gates-----> [Remote Shell] (scope: full/read-only/disabled)
    +--gates-----> [File Transfer] (scope: full/read-only/path-restricted)
    +--gates-----> [Process Management] (scope: view/kill/disabled)
    +--gates-----> [Screenshot Capture] (scope: allowed/disabled)

[AI Tool Integration]
    +--requires--> [Remote Shell]
    +--requires--> [File Transfer]
    +--requires--> [Process Management]
    +--requires--> [Screenshot Capture]
    +--requires--> [System Info Collection]
    +--enhances--> [Audit Log] (adds AI intent/reasoning)

[Audit Log]
    +--requires--> [Device Registration & Auth]
    +--requires--> [All tool invocations to emit events]

[Wake-on-LAN]
    +--requires--> [Device Registration] (for MAC address storage)
    +--requires--> [Peer agent on same LAN OR LivOS on same network]
    +--independent of--> [Secure Tunnel] (WoL is a LAN broadcast)

[Multi-Device Orchestration]
    +--requires--> [AI Tool Integration] (per-device)
    +--requires--> [Multiple registered devices]
    +--conflicts with--> [MVP scope] (defer to v2)
```

### Dependency Notes

- **Secure Tunnel is the foundation.** Every feature flows through it. Must be phase 1.
- **Device Registration gates everything.** No device identity = no permissions, no audit, no tools.
- **AI Tool Integration is the final assembly.** Shell, files, processes, screenshots are primitives. AI tools compose them. Must come after primitives are solid.
- **Per-Device Permissions can be added incrementally.** Start with all-or-nothing (device connected = full access), add granular permissions before public release.
- **Wake-on-LAN is independent** but low priority. Requires LAN peer or co-located LivOS, which is not the primary use case (LivOS is a remote server).

---

## MVP Definition

### Launch With (v1 -- Prove the Concept)

Minimum viable product -- what is needed to validate "AI controls your remote PC."

- [ ] **Cross-platform agent binary** (Win/Mac/Linux) -- single binary, one-command install
- [ ] **livinity.io OAuth device registration** -- agent authenticates, appears in "My Devices"
- [ ] **Secure WebSocket tunnel** through livinity.io relay -- no port forwarding
- [ ] **Remote shell execution** -- AI can run commands on the PC
- [ ] **Remote file listing and transfer** -- AI can browse and move files
- [ ] **Process listing** -- AI can see what is running
- [ ] **On-demand screenshot** -- AI can see the screen when needed
- [ ] **System info collection** -- OS, CPU, RAM, disk reported at registration
- [ ] **Basic audit log** -- every remote operation logged with timestamp and user
- [ ] **"My Devices" UI panel** in LivOS -- list connected devices with status
- [ ] **AI tool definitions** for shell, files, processes, screenshot -- wired into existing Nexus agent

### Add After Validation (v1.x)

Features to add once core is working and users are connecting devices.

- [ ] **Per-device permission matrix** -- when users want to restrict what AI can do per device
- [ ] **Clipboard sync as AI tool** -- when users ask "read my clipboard" or "copy this to my PC"
- [ ] **Service management** (start/stop/restart services) -- when users manage server-like PCs
- [ ] **File search** (find files by name/content on remote PC) -- when AI needs to locate files
- [ ] **Process kill** -- when users want AI to manage runaway processes (view-only in v1 is safer)
- [ ] **Persistent agent config UI** -- in-agent tray icon / web UI for agent settings
- [ ] **Agent auto-update mechanism** -- pull new versions from livinity.io without manual reinstall

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Multi-device orchestration** -- "run this on all my machines" fan-out
- [ ] **Wake-on-LAN** -- requires LAN peer, niche use case
- [ ] **Scheduled tasks / cron management** -- when users want recurring remote operations
- [ ] **Remote notification delivery** -- push notifications to PC from LivOS
- [ ] **Network topology mapping** -- show how devices relate (same LAN, etc.)
- [ ] **Bandwidth/usage tracking per device** -- for power users managing quotas
- [ ] **Coordinate-based click/type** -- screenshot + click for GUI automation (Claude Computer Use style). Massive complexity, defer significantly
- [ ] **Mobile agent** (Android/iOS) -- fundamentally different capabilities, separate product

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Agent binary (cross-platform) | HIGH | HIGH | P1 |
| OAuth device registration | HIGH | MEDIUM | P1 |
| Secure tunnel (WebSocket relay) | HIGH | HIGH | P1 |
| Remote shell execution | HIGH | HIGH | P1 |
| File listing and transfer | HIGH | MEDIUM | P1 |
| Process listing | MEDIUM | LOW | P1 |
| On-demand screenshot | MEDIUM | MEDIUM | P1 |
| System info collection | MEDIUM | LOW | P1 |
| Basic audit log | HIGH | LOW | P1 |
| "My Devices" UI | HIGH | MEDIUM | P1 |
| AI tool definitions | HIGH | MEDIUM | P1 |
| Per-device permissions | HIGH | MEDIUM | P2 |
| Clipboard sync | MEDIUM | MEDIUM | P2 |
| Service management | MEDIUM | MEDIUM | P2 |
| Process kill | MEDIUM | LOW | P2 |
| Agent auto-update | MEDIUM | MEDIUM | P2 |
| Agent tray icon / config UI | LOW | MEDIUM | P2 |
| File search | MEDIUM | LOW | P2 |
| Multi-device orchestration | HIGH | HIGH | P3 |
| Wake-on-LAN | LOW | MEDIUM | P3 |
| Scheduled tasks | LOW | MEDIUM | P3 |
| GUI automation (click/type) | MEDIUM | VERY HIGH | P3 |

**Priority key:**
- P1: Must have for launch -- proves the concept works
- P2: Should have, add when core is stable
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | RustDesk | MeshCentral | Tailscale | Teleport | TeamViewer | LivOS Agent (Planned) |
|---------|----------|-------------|-----------|----------|------------|----------------------|
| **Primary Interface** | GUI (desktop app) | Web UI | CLI + admin console | Web UI + CLI | GUI (desktop app) | AI chat (natural language) |
| **Remote Desktop Streaming** | Full (VP8/VP9/AV1/H264/H265) | Full (WebRTC) | No (SSH/network only) | No (SSH/browser shell) | Full (proprietary) | No -- screenshot on demand |
| **Remote Shell** | Via remote desktop | Web terminal | Tailscale SSH | SSH + browser shell | Via remote desktop | Structured API + PTY stream |
| **File Transfer** | Drag-and-drop GUI | Web file browser | Via SSH/SCP | SCP + directory sharing | Drag-and-drop + file box | AI-driven + structured API |
| **Process Management** | No dedicated feature | Web task manager | No | Session recording | Via remote desktop | Structured API (list, kill) |
| **System Info** | Basic (in About) | Hardware/software inventory | Device posture | Node metadata | System details | Structured JSON telemetry |
| **Screenshot** | Live streaming | Remote desktop view | No | Session recording | Live streaming | On-demand capture API |
| **Clipboard Sync** | Yes (bidirectional) | Yes | No | No | Yes | Yes (AI-readable tool) |
| **Wake-on-LAN** | LAN discovery only | Server/agent/Intel AMT | No (MagicDNS) | No | Yes (with agent) | Via LAN peer (future) |
| **Multi-Device UI** | Address book | Web device groups | Admin console | Cluster dashboard | Device list | "My Devices" panel |
| **Audit Log** | Basic (Pro) | Event log per device/user | Device activity | Full session recording + replay | Session logging (Enterprise) | Per-action log with AI intent |
| **Permissions** | Password-only | Fine-grained per user/group | ACL policies | RBAC + per-session MFA | Password + allowlist | Per-device capability matrix |
| **AI Integration** | None | None | None | AI session summaries (v18.2+) | None | Core architecture -- AI is the primary operator |
| **Self-Hosted** | Yes (relay server) | Yes (full server) | No (SaaS + DERP) | Yes (cluster) | No (SaaS) | Yes (LivOS IS the server) |
| **Agent Size** | ~15MB | ~4MB (C agent) | ~25MB | ~50MB+ | ~25MB | Target: <15MB |
| **Install Complexity** | Download + run | URL + one-click install | CLI install | CLI install | Download + run | Single command or download |

---

## What Separates AI-Driven Control from Traditional Remote Desktop

### Traditional tools (RustDesk, TeamViewer, MeshCentral) are designed for:
- A human staring at a screen, clicking through a file browser, typing in a terminal
- Optimized for visual fidelity and low latency of the remote desktop stream
- Manual everything -- user drives every action
- Single device at a time, no context between sessions

### LivOS's AI-driven agent is designed for:
1. **Intent-based, not action-based.** User says "clean up temp files" not `rm -rf /tmp/*`
2. **Multi-step reasoning.** AI checks what is in /tmp, identifies safe targets, confirms, then deletes
3. **Structured data over screenshots.** JSON responses are kilobytes vs megabytes for video frames; AI reasons over typed data not parsed terminal text
4. **Cross-device awareness.** AI knows the state of all your devices, can compare and coordinate
5. **Error recovery.** If a command fails, AI can diagnose and retry with a different approach
6. **Explanation.** AI explains what it did and why, creating implicit documentation
7. **Proactive insights.** Agent telemetry lets AI suggest actions before user asks

### Engineering implications of AI-first design:
- **Simpler agent** -- no video encoding/decoding, no GUI rendering engine
- **Faster development** -- structured API is easier to build than a video pipeline
- **Better AI performance** -- JSON data beats screenshot parsing for most tasks
- **Lower bandwidth** -- structured responses vs video stream
- **Unique positioning** -- nobody else is building remote access AI-first

### Closest competitor: Teleport
Teleport added AI session summaries in v18.2 (Sep 2025) and MCP server support in v18.1. But Teleport's AI is a post-hoc analyzer of SSH sessions, not the primary operator. LivOS makes AI the primary interface -- the agent exists to serve the AI, not a human GUI user.

---

## Sources

- [RustDesk Official](https://rustdesk.com/) -- feature overview, self-hosted remote desktop
- [RustDesk GitHub](https://github.com/rustdesk/rustdesk) -- releases, codec support, clipboard architecture
- [RustDesk Clipboard Deep Wiki](https://deepwiki.com/rustdesk/rustdesk/4.4-file-transfer-service) -- clipboard sync architecture, format support
- [MeshCentral GitHub](https://github.com/Ylianst/MeshCentral) -- agent architecture, device groups, permissions
- [MeshCentral Documentation](https://docs.meshcentral.com/meshcentral/) -- agent features, WoL, file transfer
- [MeshCentral Agent Info](https://ylianst.github.io/MeshCentral/meshcentral/agents/) -- agent registration, C agent architecture
- [MeshCentral Blog - Access Rights](https://meshcentral2.blogspot.com/2020/10/meshcentral-access-rights-remote-exec.html) -- fine-grained permissions, session recording
- [MeshCentral Blog - WoL and Multi-Agent](https://meshcentral2.blogspot.com/2021/05/meshcentral-assistant-image-multi-agent.html) -- Wake-on-LAN methods
- [Tailscale SSH Docs](https://tailscale.com/kb/1193/tailscale-ssh) -- SSH integration, WireGuard encryption
- [Tailscale MagicDNS](https://tailscale.com/docs/features/magicdns) -- automatic device naming
- [Tailscale Device Management](https://tailscale.com/docs/features/access-control/device-management) -- device posture, fleet management
- [Teleport Platform](https://goteleport.com/) -- identity-based access, AI session summaries (v18.2+)
- [Teleport GitHub](https://github.com/gravitational/teleport) -- v18 features, MCP server support
- [TeamViewer File Transfer](https://www.teamviewer.com/en/solutions/use-cases/file-transfer/) -- AES-256, drag-drop, file box
- [TeamViewer Remote Support](https://www.teamviewer.com/en/platform/one/features/remote-support-control/) -- cross-platform features
- [Claude Computer Use Tool Docs](https://docs.claude.com/en/docs/agents-and-tools/tool-use/computer-use-tool) -- screenshot + action loop, API design
- [Open Interpreter](https://github.com/openinterpreter/open-interpreter) -- natural language shell/file/OS control, Computer API
- [AI Computer Use Agents Survey (arXiv)](https://arxiv.org/abs/2501.16150) -- comprehensive survey of ACU foundations and challenges
- [ManageEngine Remote Task Manager](https://www.manageengine.com/remote-desktop-management/remote-task-manager.html) -- remote process management features
- [BeyondTrust Audit](https://www.beyondtrust.com/products/remote-support/features/audit) -- session recording, audit trail patterns

---
*Feature research for: Remote PC Control Agent (v14.0)*
*Researched: 2026-03-23*
