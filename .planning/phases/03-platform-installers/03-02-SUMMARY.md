---
phase: 03-platform-installers
plan: 02
subsystem: agent
tags: [macos, dmg, hdiutil, launchagent, app-bundle, plist, auto-start]

# Dependency graph
requires:
  - phase: 03-platform-installers/01
    provides: SEA binary build pipeline (build-sea.mjs), --background flag, CJS format
provides:
  - macOS .app bundle build script (build-dmg.sh) producing drag-to-install .dmg
  - Info.plist with LSUIElement=true for background app (no Dock icon)
  - LaunchAgent auto-install for boot persistence on macOS
  - Launcher script that passes 'start --background' to SEA binary
affects: [linux-installer, download-page]

# Tech tracking
tech-stack:
  added: [hdiutil]
  patterns: [app-bundle-launcher-script, in-memory-plist-generation, launchagent-auto-install]

key-files:
  created: [agent/installer/macos/build-dmg.sh, agent/installer/macos/Info.plist, agent/installer/macos/io.livinity.agent.plist]
  modified: [agent/package.json, agent/src/cli.ts]

key-decisions:
  - "Launcher script as CFBundleExecutable (not SEA binary directly) to pass 'start --background' flag"
  - "In-memory plist generation in cli.ts instead of bundling template file in SEA binary"
  - "installLaunchAgent() called after manager.connect() for idempotent auto-install on every start"

patterns-established:
  - "macOS .app bundle: Contents/MacOS for binaries, Contents/Resources for assets and native deps"
  - "LaunchAgent auto-install: generate plist in-memory, write to ~/Library/LaunchAgents/ on first run"
  - "Platform-guarded code: process.platform === 'darwin' check + try/catch for non-fatal failure"

requirements-completed: [MAC-01, MAC-02, MAC-03]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 3 Plan 2: macOS Installer Pipeline Summary

**macOS .app bundle with Info.plist, build-dmg.sh using hdiutil for drag-to-install DMG, and LaunchAgent auto-install for boot persistence**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T09:25:13Z
- **Completed:** 2026-03-24T09:27:52Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created build-dmg.sh (96 lines) that builds .app bundle with SEA binary, launcher script, native deps, then packages into .dmg with Applications symlink via hdiutil
- Created Info.plist with CFBundleIdentifier=io.livinity.agent and LSUIElement=true (background app, no Dock icon)
- Added installLaunchAgent() to cli.ts that programmatically generates and writes LaunchAgent plist for auto-start on login
- LaunchAgent template file (io.livinity.agent.plist) serves as reference documentation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create .app bundle structure and build-dmg.sh script** - `c830789` (feat)
2. **Task 2: Create LaunchAgent plist and auto-install logic** - `68f8bf6` (feat)

## Files Created/Modified
- `agent/installer/macos/build-dmg.sh` - Shell script: builds SEA, creates .app bundle, packages .dmg with hdiutil
- `agent/installer/macos/Info.plist` - macOS app bundle metadata with io.livinity.agent identifier
- `agent/installer/macos/io.livinity.agent.plist` - LaunchAgent reference template with placeholder paths
- `agent/package.json` - Added build:installer:mac script
- `agent/src/cli.ts` - Added generateLaunchAgentPlist(), installLaunchAgent(), and platform-guarded call from startCommand()

## Decisions Made
- Used a launcher bash script as CFBundleExecutable instead of pointing directly to the SEA binary. This allows passing `start --background` arguments without requiring the user to configure anything.
- Generated plist content in-memory in cli.ts rather than bundling the template file. SEA binaries cannot easily access bundled resource files, so in-memory generation avoids a file dependency.
- installLaunchAgent() is called on every macOS start (idempotent overwrite). This ensures the plist always points to the current binary path if the user moves the app.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- macOS installer pipeline complete: `npm run build:installer:mac` builds .app and .dmg
- Linux installer (Plan 03) can follow the same pattern with fpm for .deb generation
- All three platform installers (Windows .exe, macOS .dmg, Linux .deb) share the same SEA build pipeline (build-sea.mjs)
- CJS format from Plan 01 applies to all platforms

---
## Self-Check: PASSED

All 5 files verified present. All 2 commits verified in git log.

---
*Phase: 03-platform-installers*
*Completed: 2026-03-24*
