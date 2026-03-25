---
phase: v1.3-01-container-app-store
plan: 02
subsystem: app-store
tags: [chromium, selkies, docker, port-mapping, app-manifest]

# Dependency graph
requires:
  - phase: v1.0-release
    provides: App Store infrastructure with builtin-apps.ts and patchComposeFile
provides:
  - Chromium Browser entry with correct Selkies port (3000)
  - Port mapping configuration for chromium app
affects: [app-store, container-management, browser-app]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "commonPorts fallback map for container port detection"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/apps/builtin-apps.ts
    - livos/packages/livinityd/source/modules/apps/app.ts

key-decisions:
  - "Port 3000 used for Selkies web viewer (was 6901 for KasmVNC)"
  - "Subdomain 'browser' configured for browser.domain.com access"

patterns-established:
  - "commonPorts map entry ensures correct port detection when docker-compose.yml has no explicit ports/expose directives"

# Metrics
duration: 1min
completed: 2026-02-07
---

# Phase v1.3-01 Plan 02: Container App Store Summary

**Chromium Browser entry updated to use Selkies port 3000 with correct description and port mapping configuration**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-07T19:02:28Z
- **Completed:** 2026-02-07T19:03:56Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Updated Chromium entry in builtin-apps.ts to use port 3000 (Selkies) instead of 6901 (KasmVNC)
- Changed description from "KasmVNC web viewer" to "Selkies web viewer"
- Added chromium to commonPorts map ensuring correct 3000:3000 port mapping

## Task Commits

Each task was committed atomically:

1. **Task 1: Update Chromium entry in builtin-apps.ts** - `fa91f1b` (feat)
2. **Task 2: Add chromium to commonPorts map** - `c222692` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` - Updated chromium entry: port 6901→3000, KasmVNC→Selkies description
- `livos/packages/livinityd/source/modules/apps/app.ts` - Added 'chromium': 3000 to commonPorts map in patchComposeFile()

## Decisions Made

**Port mapping strategy:**
- Port 3000 is CRITICAL for the install flow to work correctly
- builtin-apps.ts `port: 3000` defines the host port
- commonPorts map `'chromium': 3000` defines the internal container port
- patchComposeFile creates 3000:3000 mapping (host:container)
- Without the commonPorts entry, patchComposeFile would fallback to 8080 which is incorrect for Selkies

**Description update:**
- Changed from KasmVNC to Selkies to reflect actual web viewer technology
- Kept all other description text identical (persistent sessions, AI automation, anti-detection)

**No other changes:**
- All other fields unchanged: subdomain 'browser', environment variables, volumes, icon, tagline
- No modifications to other app entries in builtin-apps.ts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - both file updates were straightforward text replacements.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for next phase:**
- Chromium Browser now shows in App Store with correct metadata
- Install flow will correctly map port 3000 for Selkies access
- Subdomain configuration set to 'browser' for browser.domain.com access

**Verification path:**
1. User clicks Install in App Store
2. appStore.getAppTemplateFilePath('chromium') returns gallery path
3. rsync copies template to app-data
4. patchComposeFile creates 3000:3000 port mapping
5. docker compose up --build builds Dockerfile
6. Container starts with Selkies on port 3000
7. Caddy routes browser.domain.com to port 3000

**No blockers** - configuration complete.

---
*Phase: v1.3-01-container-app-store*
*Completed: 2026-02-07*
