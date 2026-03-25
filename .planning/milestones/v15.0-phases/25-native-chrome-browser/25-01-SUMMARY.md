---
phase: 25-native-chrome-browser
plan: 01
subsystem: infra
tags: [chrome, systemd, xvfb, x11vnc, novnc, websockify, native-app, streaming]

# Dependency graph
requires:
  - phase: 23-livos-native-app-compose
    provides: builtin-apps.ts compose pattern and apps.ts install flow
provides:
  - Setup script for native Chrome + streaming deps on Ubuntu server
  - NativeApp class for systemd-based app lifecycle management
  - Chromium builtin entry with native=true flag and noVNC port 6080
  - Native app install short-circuit in apps.ts (skips Docker)
affects: [25-02, caddy-proxy, ui-chrome-window]

# Tech tracking
tech-stack:
  added: [xvfb, x11vnc, websockify, noVNC]
  patterns: [systemd-service-management, native-app-lifecycle, idle-timeout-auto-stop]

key-files:
  created:
    - scripts/setup-chrome-native.sh
    - livos/packages/livinityd/source/modules/apps/native-app.ts
  modified:
    - livos/packages/livinityd/source/modules/apps/builtin-apps.ts
    - livos/packages/livinityd/source/modules/apps/apps.ts

key-decisions:
  - "Type=forking + RemainAfterExit=yes for systemd service because websockify daemonizes"
  - "Restart=no for on-demand only operation (livinityd controls lifecycle)"
  - "30-minute idle timeout with auto-stop to conserve resources"
  - "Native app install writes minimal livinity-app.yml manifest and registers Caddy subdomain"
  - "Dynamic yaml import in apps.ts native install path (consistent with existing pattern)"

patterns-established:
  - "NativeApp pattern: systemd service management via execa $ subprocess for non-Docker apps"
  - "NATIVE_APP_CONFIGS registry for declarative native app configuration"
  - "native/nativePort fields on BuiltinAppManifest for distinguishing Docker vs native apps"

requirements-completed: [R-CHROME-NATIVE, R-CHROME-STREAM]

# Metrics
duration: 3min
completed: 2026-03-21
---

# Phase 25 Plan 01: Native Chrome Infrastructure Summary

**Setup script for native Chrome + Xvfb + x11vnc + websockify streaming, NativeApp class with systemd lifecycle, and builtin-apps native flag replacing Docker container**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T12:29:32Z
- **Completed:** 2026-03-21T12:32:42Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created server setup script that installs Google Chrome stable and all streaming dependencies (Xvfb, x11vnc, websockify, noVNC)
- Created systemd service `livos-chrome.service` that chains Xvfb -> Chrome -> x11vnc -> websockify on demand
- Implemented NativeApp class with start/stop/restart/getStatus via systemctl and 30-minute idle auto-stop
- Updated builtin-apps.ts chromium entry from Docker to native (port 6080, native=true)
- Added native app install flow in apps.ts that skips Docker pull/compose entirely

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Chrome native setup script and systemd service** - `342770c` (feat)
2. **Task 2: Add NativeApp class and update builtin-apps for native Chrome** - `0a3fb5b` (feat)

## Files Created/Modified
- `scripts/setup-chrome-native.sh` - Server setup script: installs Chrome, Xvfb, x11vnc, websockify, noVNC, creates systemd service
- `livos/packages/livinityd/source/modules/apps/native-app.ts` - NativeApp class with systemctl-based lifecycle, idle timer, NATIVE_APP_CONFIGS registry
- `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` - Added native/nativePort interface fields, updated chromium entry to native mode
- `livos/packages/livinityd/source/modules/apps/apps.ts` - Import NativeApp, nativeInstances field, getNativeApp/isNativeApp methods, native install short-circuit

## Decisions Made
- Used `Type=forking` + `RemainAfterExit=yes` for systemd service because websockify daemonizes with `--daemon` flag
- `Restart=no` ensures Chrome stream only runs on demand (livinityd controls start/stop)
- 30-minute idle timeout with auto-stop timer to conserve server resources when user walks away
- Native app install writes a minimal `livinity-app.yml` manifest so the app appears correctly in the UI list
- Used dynamic `import('js-yaml')` for yaml in the native install path, consistent with the existing dynamic import pattern elsewhere in apps.ts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. The setup script must be run on the server before the Chrome app can be used, but that is part of the planned workflow.

## Next Phase Readiness
- Native Chrome infrastructure is ready for Plan 02 (Caddy proxy, JWT auth, UI integration)
- Setup script needs to be run on Server4 before the Chrome app will function
- NativeApp class is registered in apps.ts start() and ready for start/stop commands from routes

---
*Phase: 25-native-chrome-browser*
*Completed: 2026-03-21*
