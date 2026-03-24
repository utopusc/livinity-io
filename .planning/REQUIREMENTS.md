# Requirements: Livinity v14.1 -- Agent Installer & Setup UX

**Defined:** 2026-03-24
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v14.1 Requirements

### Setup -- Web-Based Setup Wizard

- [x] **SETUP-01**: Agent starts a local HTTP server and opens browser to a setup wizard page on first run
- [x] **SETUP-02**: Setup wizard shows a polished React UI with "Connect Your Account" flow
- [x] **SETUP-03**: Setup wizard initiates OAuth device flow, displays the code, and polls for approval
- [x] **SETUP-04**: After approval, setup wizard shows success state with device name and "Connected!" confirmation
- [x] **SETUP-05**: Setup wizard auto-closes after successful setup, agent continues running in background

### Installer -- Windows

- [x] **WIN-01**: Windows .exe installer built with Inno Setup packages the SEA binary
- [x] **WIN-02**: Installer creates Start Menu shortcut and optional Desktop shortcut
- [x] **WIN-03**: Installer registers agent for auto-start on Windows boot (Registry Run key or Task Scheduler)
- [x] **WIN-04**: Installer includes uninstaller that removes files, shortcuts, and auto-start entry

### Installer -- macOS

- [ ] **MAC-01**: macOS .dmg created with create-dmg containing the agent .app bundle
- [ ] **MAC-02**: .app bundle includes the SEA binary with proper Info.plist and icon
- [ ] **MAC-03**: Agent registers as LaunchAgent for auto-start on login

### Installer -- Linux

- [ ] **LIN-01**: Linux .deb package built with fpm containing the SEA binary
- [ ] **LIN-02**: .deb includes systemd service file for auto-start on boot
- [ ] **LIN-03**: systemd service runs agent as the installing user (not root)

### Tray -- System Tray Icon

- [x] **TRAY-01**: Agent shows a system tray icon when running (Windows/macOS/Linux)
- [x] **TRAY-02**: Tray icon shows connection status (green = connected, yellow = connecting, red = disconnected)
- [x] **TRAY-03**: Tray menu includes: Status, Open Setup, Disconnect, Quit

### Download -- livinity.io Download Page

- [ ] **DL-01**: livinity.io/download page detects user's platform and shows appropriate download button
- [ ] **DL-02**: Page shows download links for all 3 platforms with icons
- [ ] **DL-03**: Page includes brief setup instructions (download, install, connect)

## Future Requirements (v15.0+)

- **FUT-01**: Code signing for binaries (Windows Authenticode, macOS codesign, Linux GPG)
- **FUT-02**: Auto-update mechanism (check for new version, download, replace)
- **FUT-03**: Tauri rewrite for smaller binary size (~10MB vs ~60MB)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Electron GUI | Too heavy (100MB+) for a background agent |
| Tauri rewrite | Requires Rust toolchain, defer to v15.0 |
| Agent settings GUI | Web setup is one-time; ongoing settings via LivOS UI |
| Homebrew/Chocolatey/APT repo | Direct download first, package managers later |
| CI/CD cross-platform builds | GitHub Actions matrix deferred -- local builds for now |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 1 | Complete |
| SETUP-02 | Phase 1 | Complete |
| SETUP-03 | Phase 1 | Complete |
| SETUP-04 | Phase 1 | Complete |
| SETUP-05 | Phase 1 | Complete |
| WIN-01 | Phase 3 | Complete |
| WIN-02 | Phase 3 | Complete |
| WIN-03 | Phase 3 | Complete |
| WIN-04 | Phase 3 | Complete |
| MAC-01 | Phase 3 | Pending |
| MAC-02 | Phase 3 | Pending |
| MAC-03 | Phase 3 | Pending |
| LIN-01 | Phase 3 | Pending |
| LIN-02 | Phase 3 | Pending |
| LIN-03 | Phase 3 | Pending |
| TRAY-01 | Phase 2 | Complete |
| TRAY-02 | Phase 2 | Complete |
| TRAY-03 | Phase 2 | Complete |
| DL-01 | Phase 4 | Pending |
| DL-02 | Phase 4 | Pending |
| DL-03 | Phase 4 | Pending |

**Coverage:**
- v14.1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Traceability updated: 2026-03-24*
