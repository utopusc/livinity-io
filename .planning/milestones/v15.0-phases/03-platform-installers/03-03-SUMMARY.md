---
phase: 03-platform-installers
plan: 03
subsystem: agent
tags: [fpm, deb, systemd, linux-installer, auto-start]

# Dependency graph
requires:
  - phase: 03-platform-installers
    plan: 01
    provides: SEA binary build pipeline (build-sea.mjs), --background flag, CJS format
provides:
  - Linux .deb build script using fpm with SEA binary, native deps, and systemd service
  - systemd system service with dynamic User= detection via SUDO_USER
  - postinst.sh and prerm.sh lifecycle scripts for package install/remove
  - Programmatic systemd user service auto-install in CLI for direct binary usage
affects: [download-page, linux-packaging, agent-distribution]

# Tech tracking
tech-stack:
  added: [fpm]
  patterns: [deb-staging-layout, systemd-user-placeholder, dual-service-strategy]

key-files:
  created: [agent/installer/linux/build-deb.sh, agent/installer/linux/livinity-agent.service, agent/installer/linux/postinst.sh, agent/installer/linux/prerm.sh]
  modified: [agent/package.json, agent/src/cli.ts]

key-decisions:
  - "Dual systemd strategy: .deb installs system service with dynamic User=, direct binary installs user service to ~/.config/systemd/user/"
  - "User detection via SUDO_USER fallback chain: SUDO_USER -> logname -> whoami"
  - "__USER__ placeholder in service file replaced at install time by postinst.sh"
  - "installSystemdService() skips if system-level service exists (defers to .deb)"

patterns-established:
  - "Linux .deb packaging: fpm with --after-install/--before-remove scripts and staging directory layout"
  - "Systemd auto-install: user service written programmatically on first run, skip if system service present"

requirements-completed: [LIN-01, LIN-02, LIN-03]

# Metrics
duration: 2min
completed: 2026-03-24
---

# Phase 3 Plan 3: Linux Installer Pipeline Summary

**Linux .deb build pipeline with fpm, systemd service (system + user dual strategy), and CLI auto-install for auto-start on boot**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-24T09:30:04Z
- **Completed:** 2026-03-24T09:32:28Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created build-deb.sh (109 lines) that stages SEA binary, native deps, setup-ui, and systemd service into a .deb package via fpm
- Created systemd service file with __USER__ placeholder that postinst.sh replaces with the actual installing user (SUDO_USER detection)
- Added installSystemdService() to cli.ts for programmatic user-level service install when running the binary directly (outside .deb)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create systemd service file and build-deb.sh script** - `1b315c1` (feat)
2. **Task 2: Add Linux systemd auto-install logic to CLI** - `401ee08` (feat)

## Files Created/Modified
- `agent/installer/linux/build-deb.sh` - Shell script to build .deb package using fpm with staging directory
- `agent/installer/linux/livinity-agent.service` - systemd system service with __USER__ placeholder for dynamic user detection
- `agent/installer/linux/postinst.sh` - Post-install script: detects SUDO_USER, replaces placeholder, enables/starts service
- `agent/installer/linux/prerm.sh` - Pre-remove script: stops and disables service before package removal
- `agent/package.json` - Added build:installer:linux script
- `agent/src/cli.ts` - Added installSystemdService() for programmatic user service install on Linux

## Decisions Made
- Dual systemd strategy: .deb packages install a system service (User= set by postinst.sh), while direct binary usage installs a user service to ~/.config/systemd/user/. The system service takes precedence -- installSystemdService() checks for its existence before writing the user service.
- User detection uses SUDO_USER -> logname -> whoami fallback chain in postinst.sh to find the actual installing user (not root).
- The __USER__ placeholder approach in the service file keeps the template static in the .deb while allowing dynamic user substitution at install time.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three platform installers complete (Windows .exe, macOS .dmg, Linux .deb)
- All three auto-start mechanisms implemented (Windows registry, macOS LaunchAgent, Linux systemd)
- Ready for download page and end-to-end testing across platforms

---
## Self-Check: PASSED

All 7 files verified present. All 2 commits verified in git log.

---
*Phase: 03-platform-installers*
*Completed: 2026-03-24*
