# Phase 3: Platform Installers - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Build native installers for all 3 platforms (Windows .exe, macOS .dmg, Linux .deb) that package the SEA binary with auto-start on boot. After this phase, users download and install the agent like any desktop application — no terminal needed.

</domain>

<decisions>
## Implementation Decisions

### SEA Binary Build
- First: ensure `npm run build:sea` works and produces platform binaries
- The esbuild step bundles agent + setup-ui dist into single JS
- Node.js SEA wraps it into a standalone executable
- Binary names: `livinity-agent-win-x64.exe`, `livinity-agent-darwin-arm64`, `livinity-agent-linux-x64`
- For now: build only for current platform (Windows). macOS/Linux installer SCRIPTS created but binaries need CI/CD or Docker cross-compilation later

### Windows Installer (Inno Setup)
- Inno Setup .iss script at `agent/installer/windows/setup.iss`
- Installs to `C:\Program Files\Livinity Agent\`
- Creates Start Menu folder "Livinity" with "Livinity Agent" shortcut
- Optional Desktop shortcut (checkbox in installer)
- Auto-start: adds Registry Run key `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\LivinityAgent`
- Uninstaller removes files, shortcuts, registry keys, and ~/.livinity/ (with user confirmation)
- Installer icon: Livinity logo

### macOS Installer (create-dmg)
- Shell script at `agent/installer/macos/build-dmg.sh`
- Creates .app bundle structure: `Livinity Agent.app/Contents/MacOS/livinity-agent` + Info.plist + icon.icns
- Uses `create-dmg` npm package or `hdiutil` to build .dmg
- LaunchAgent plist at `~/Library/LaunchAgents/io.livinity.agent.plist` — installed by the agent on first run
- LaunchAgent runs agent with `--background` flag on login

### Linux Installer (fpm)
- Shell script at `agent/installer/linux/build-deb.sh`
- Uses `fpm` gem to build .deb from directory layout
- Installs binary to `/usr/local/bin/livinity-agent`
- systemd service file: `/etc/systemd/system/livinity-agent.service`
- Service runs as the installing user (`User=` directive, detected at install time)
- Post-install script enables and starts the service

### Auto-Start Integration
- Agent's `startCommand()` already handles the main loop
- Each platform's auto-start mechanism calls `livinity-agent start --background`
- `--background` flag: suppresses console output, uses file logging only
- PID file at ~/.livinity/agent.pid for stop/status commands

### Build Scripts
- `agent/package.json` scripts:
  - `build` — esbuild bundle + setup-ui copy
  - `build:sea` — full SEA binary build for current platform
  - `build:installer:win` — runs Inno Setup compiler (requires ISCC.exe on PATH)
  - `build:installer:mac` — runs build-dmg.sh
  - `build:installer:linux` — runs build-deb.sh

### Claude's Discretion
- Inno Setup wizard page customization
- DMG window appearance
- .deb package metadata details

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agent/esbuild.config.mjs` — Current build config (esbuild + setup-ui copy)
- `agent/sea-config.json` — SEA blob configuration
- `agent/src/cli.ts` — startCommand() is the entry point for auto-start
- `agent/package.json` — Build scripts to extend

### Established Patterns
- esbuild bundles to dist/agent.js
- SEA config references dist/agent.js
- Build scripts in package.json

### Integration Points
- New: `agent/installer/` directory with per-platform build scripts
- Modified: `agent/package.json` for new build scripts
- Modified: `agent/src/cli.ts` for `--background` flag support

</code_context>

<specifics>
## Specific Ideas

- Windows installer should look professional — custom banner image, Livinity branding
- The uninstaller should ask if user wants to remove credentials (~/.livinity/)
- Auto-start should be silent — no console window flashing on boot

</specifics>

<deferred>
## Deferred Ideas

- Cross-platform CI/CD builds (GitHub Actions matrix) — needs separate infra setup
- Code signing — requires certificates
- Chocolatey/Homebrew/APT repository — after direct download proves working
- MSI installer (alternative to Inno Setup) — NSIS/Inno is simpler

</deferred>
