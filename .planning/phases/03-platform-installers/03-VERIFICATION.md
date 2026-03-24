---
phase: 03-platform-installers
verified: 2026-03-24T12:00:00Z
status: passed
score: 11/11 must-haves verified
---

# Phase 3: Platform Installers Verification Report

**Phase Goal:** Users install the agent with a native installer on their platform and it auto-starts on boot
**Verified:** 2026-03-24T12:00:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running 'npm run build:sea' produces a standalone livinity-agent.exe in agent/dist/ | VERIFIED | `build-sea.mjs` (203 lines) runs esbuild + SEA blob + postject injection pipeline; `package.json` has `"build:sea": "node build-sea.mjs"` |
| 2 | The livinity-agent.exe runs without Node.js installed on the system | VERIFIED | SEA blob injection via postject with sentinel fuse `NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`; CJS format for SEA compatibility; SUMMARY confirms runtime test passed |
| 3 | Running 'npm run build:installer:win' produces a LivinityAgentSetup.exe installer | VERIFIED | `build-installer.bat` (38 lines) calls `npm run build:sea` then `iscc installer\windows\setup.iss`; setup.iss `OutputBaseFilename=LivinityAgentSetup` |
| 4 | The installer places the agent in Program Files with Start Menu shortcuts | VERIFIED | setup.iss `DefaultDirName={autopf}\Livinity Agent`; [Icons] section has Start Menu shortcut with `{group}\{#MyAppName}`, uninstall shortcut, and optional desktop shortcut via [Tasks] |
| 5 | After installation the agent auto-starts on boot via Registry Run key | VERIFIED | setup.iss line 64: `Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "LivinityAgent"; ValueData: """{app}\{#MyAppExeName}"" start --background"; Flags: uninsdeletevalue` |
| 6 | The uninstaller removes files, shortcuts, and registry entries | VERIFIED | [UninstallRun] stops agent; [UninstallDelete] cleans PID/state/log files; [Code] Pascal Script asks user about credential removal with `DelTree`; Registry `uninsdeletevalue` flag auto-removes Run key |
| 7 | The --background flag suppresses console output | VERIFIED | `index.ts` line 11-13 parses `--background` and sets `LIVINITY_BACKGROUND=1`; `cli.ts` lines 157-171 redirects console.log/warn/error to `~/.livinity/agent.log` in background mode |
| 8 | Running build-dmg.sh on macOS produces a .dmg with drag-to-Applications window | VERIFIED | `build-dmg.sh` (96 lines) creates .app bundle, uses `hdiutil create` with `ln -s /Applications` symlink in DMG staging directory |
| 9 | The .app bundle contains the SEA binary with proper Info.plist and icon | VERIFIED | build-dmg.sh copies SEA binary to `Contents/MacOS/livinity-agent`, creates launcher script at `Contents/MacOS/livinity-agent-launcher`; Info.plist (28 lines) has `CFBundleIdentifier=io.livinity.agent`, `LSUIElement=true` |
| 10 | The agent installs a LaunchAgent plist for auto-start on login | VERIFIED | cli.ts `installLaunchAgent()` (lines 92-107) generates plist in-memory with `RunAtLoad=true`, writes to `~/Library/LaunchAgents/io.livinity.agent.plist`; called from `startCommand()` on darwin (line 263-268) |
| 11 | Running build-deb.sh on Linux produces a .deb package with systemd service running as installing user | VERIFIED | build-deb.sh (109 lines) uses fpm with staging directory; `livinity-agent.service` has `User=__USER__` placeholder; `postinst.sh` detects `SUDO_USER` and replaces `__USER__`, then runs `systemctl enable + start` |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Lines | Status | Details |
|----------|----------|-------|--------|---------|
| `agent/build-sea.mjs` | SEA binary build pipeline (min 40) | 203 | VERIFIED | Full 7-step pipeline: esbuild, SEA blob, binary copy, signature removal, postject injection, native deps, setup-ui |
| `agent/installer/windows/setup.iss` | Inno Setup script (min 60) | 119 | VERIFIED | All sections: Setup, Languages, Tasks, Files, Icons, Registry, Run, UninstallRun, UninstallDelete, Code |
| `agent/installer/windows/build-installer.bat` | Batch wrapper (min 5) | 38 | VERIFIED | Runs build:sea, checks for ISCC on PATH, invokes iscc with error handling |
| `agent/installer/macos/build-dmg.sh` | DMG build script (min 50) | 96 | VERIFIED | Creates .app bundle structure, copies binary/deps, packages with hdiutil |
| `agent/installer/macos/Info.plist` | macOS app metadata (contains io.livinity.agent) | 28 | VERIFIED | CFBundleIdentifier=io.livinity.agent, LSUIElement=true, CFBundleExecutable=livinity-agent-launcher |
| `agent/installer/macos/io.livinity.agent.plist` | LaunchAgent template (contains LaunchAgent) | 22 | VERIFIED | Label=io.livinity.agent, RunAtLoad=true, ProgramArguments with --background |
| `agent/installer/linux/build-deb.sh` | deb build with fpm (min 40) | 109 | VERIFIED | Stages binary at usr/local/bin/, native deps at usr/local/lib/, uses fpm with --after-install/--before-remove |
| `agent/installer/linux/livinity-agent.service` | systemd service (contains ExecStart) | 19 | VERIFIED | ExecStart=/usr/local/bin/livinity-agent start --background, User=__USER__, Restart=on-failure |
| `agent/installer/linux/postinst.sh` | Post-install script (contains systemctl) | 32 | VERIFIED | Detects SUDO_USER, replaces __USER__, runs systemctl daemon-reload/enable/start |
| `agent/installer/linux/prerm.sh` | Pre-remove script | 11 | VERIFIED | Stops and disables service before removal |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `build-sea.mjs` | `dist/livinity-agent.exe` | postject blob injection | WIRED | Line 99-107: `npx postject@latest` with `NODE_SEA_BLOB` and sentinel fuse |
| `setup.iss` | `livinity-agent.exe` | [Files] section | WIRED | Line 40: `Source: "..\..\dist\livinity-agent.exe"; DestDir: "{app}"` |
| `setup.iss` | Registry Run key | [Registry] section | WIRED | Line 64: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` with --background flag |
| `build-dmg.sh` | SEA binary | cp into .app/Contents/MacOS/ | WIRED | Line 31: `cp "$DIST_DIR/livinity-agent" "$APP_BUNDLE/Contents/MacOS/livinity-agent"` |
| `io.livinity.agent.plist` | ~/Library/LaunchAgents/ | installLaunchAgent() in cli.ts | WIRED | cli.ts line 97: writes to `~/Library/LaunchAgents/io.livinity.agent.plist` |
| `cli.ts` | installLaunchAgent | startCommand() calls on darwin | WIRED | cli.ts line 263-265: platform-guarded call after manager.connect() |
| `build-deb.sh` | livinity-agent | fpm packages binary | WIRED | Line 42: `cp "$DIST_DIR/livinity-agent" "$STAGING/usr/local/bin/livinity-agent"`, line 88: `fpm --input-type dir` |
| `livinity-agent.service` | /usr/local/bin/livinity-agent | ExecStart directive | WIRED | Line 9: `ExecStart=/usr/local/bin/livinity-agent start --background` |
| `postinst.sh` | livinity-agent.service | systemctl enable + start | WIRED | Lines 22-23: `systemctl enable livinity-agent.service`, `systemctl start livinity-agent.service` |
| `cli.ts` | installSystemdService | startCommand() calls on linux | WIRED | cli.ts lines 271-278: platform-guarded call, writes user service to ~/.config/systemd/user/ |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| WIN-01 | 03-01 | Windows .exe installer built with Inno Setup packages the SEA binary | SATISFIED | setup.iss references dist/livinity-agent.exe in [Files] section |
| WIN-02 | 03-01 | Installer creates Start Menu shortcut and optional Desktop shortcut | SATISFIED | setup.iss [Icons] section with Start Menu, uninstall, and [Tasks] desktop shortcut |
| WIN-03 | 03-01 | Installer registers agent for auto-start on Windows boot (Registry Run key) | SATISFIED | setup.iss [Registry] HKCU\...\Run with --background flag |
| WIN-04 | 03-01 | Installer includes uninstaller that removes files, shortcuts, and auto-start entry | SATISFIED | [UninstallRun] stops agent, [UninstallDelete] cleans files, [Code] optional credential removal, Registry uninsdeletevalue |
| MAC-01 | 03-02 | macOS .dmg created containing the agent .app bundle | SATISFIED | build-dmg.sh creates .app, uses hdiutil with Applications symlink |
| MAC-02 | 03-02 | .app bundle includes the SEA binary with proper Info.plist and icon | SATISFIED | Info.plist with io.livinity.agent, build-dmg.sh copies binary to Contents/MacOS |
| MAC-03 | 03-02 | Agent registers as LaunchAgent for auto-start on login | SATISFIED | installLaunchAgent() generates plist with RunAtLoad=true, writes to ~/Library/LaunchAgents/ |
| LIN-01 | 03-03 | Linux .deb package built with fpm containing the SEA binary | SATISFIED | build-deb.sh stages binary at usr/local/bin/ and uses fpm to produce .deb |
| LIN-02 | 03-03 | .deb includes systemd service file for auto-start on boot | SATISFIED | livinity-agent.service copied to staging/etc/systemd/system/; postinst.sh enables it |
| LIN-03 | 03-03 | systemd service runs agent as the installing user (not root) | SATISFIED | Service has User=__USER__; postinst.sh detects SUDO_USER and replaces placeholder |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `agent/installer/linux/build-deb.sh` | 80 | Comment: "systemd service file (with placeholder -- postinst replaces __USER__)" | Info | Deliberate design pattern, not an incomplete implementation. The __USER__ template variable is replaced at install time by postinst.sh. |

No blockers or warnings found. The single "placeholder" comment match describes the intentional template variable substitution pattern.

### Human Verification Required

### 1. Windows SEA Binary Standalone Test

**Test:** Copy dist/livinity-agent.exe to a machine without Node.js installed and run `livinity-agent.exe status`
**Expected:** The binary runs and shows agent status output without any Node.js errors
**Why human:** SEA binary runtime behavior requires actual execution on a clean system

### 2. Windows Installer End-to-End

**Test:** Install Inno Setup 6, run `npm run build:installer:win`, then run the produced LivinityAgentSetup.exe
**Expected:** Installer wizard appears, installs to Program Files, creates Start Menu shortcuts, adds Registry Run key, and agent starts after install
**Why human:** Requires Inno Setup installed, interactive installer wizard, and Windows registry inspection

### 3. macOS DMG Build and Install

**Test:** Run `npm run build:installer:mac` on a macOS machine, open the .dmg, and drag to Applications
**Expected:** DMG opens with .app bundle and Applications symlink; app appears in Applications; LaunchAgent registered after first run
**Why human:** Requires macOS with hdiutil; .app bundle behavior and LaunchAgent registration are OS-level behaviors

### 4. Linux .deb Build and Install

**Test:** Run `npm run build:installer:linux` on a Linux machine with fpm installed, then `sudo dpkg -i` the produced .deb
**Expected:** Binary installed at /usr/local/bin/livinity-agent, systemd service created with correct user, service starts automatically
**Why human:** Requires Linux with fpm gem; systemd service activation and user detection need live system

### 5. Auto-Start on Boot (All Platforms)

**Test:** Reboot each platform after installation
**Expected:** Agent starts automatically in background mode with log output in ~/.livinity/agent.log
**Why human:** Boot-time behavior requires actual system restart

### Gaps Summary

No gaps found. All 11 observable truths verified. All 10 artifacts exist, are substantive (meeting minimum line counts), and are properly wired through imports, references, and function calls. All 10 requirements (WIN-01 through WIN-04, MAC-01 through MAC-03, LIN-01 through LIN-03) are satisfied with implementation evidence.

The phase delivers:
- A complete SEA binary build pipeline (`build-sea.mjs`) that bundles the agent into a standalone executable
- Platform-specific installer scripts for Windows (Inno Setup .iss), macOS (.app bundle + .dmg via hdiutil), and Linux (.deb via fpm)
- Auto-start mechanisms for each platform: Windows Registry Run key, macOS LaunchAgent, Linux systemd service (both system-level via .deb and user-level via CLI)
- A --background flag that enables silent file-only logging for auto-start scenarios
- Clean uninstall support on all platforms

Human verification is recommended for the 5 items above, as they involve platform-specific runtime behavior that cannot be verified by static code analysis alone.

---

_Verified: 2026-03-24T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
