---
phase: 24-app-store-expansion
plan: 01
subsystem: apps
tags: [docker, compose, builtin-apps, adguard, wireguard, navidrome, calibre-web, homarr]

requires:
  - phase: 23-livos-native-app-compose-system
    provides: BuiltinAppManifest interface and compose-based install system
provides:
  - 5 new BuiltinAppManifest entries (AdGuard Home, WireGuard Easy, Navidrome, Calibre-web, Homarr)
  - Privacy category apps (adguard-home, wireguard-easy)
  - Media category apps (navidrome, calibre-web)
  - Productivity category app (homarr)
affects: [24-02, 24-03, 24-04, app-store-ui, apps-api]

tech-stack:
  added: []
  patterns: [BuiltinAppManifest with compose definition pattern for new categories]

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/apps/builtin-apps.ts

key-decisions:
  - "Followed plan exactly -- all 5 app definitions match the established BuiltinAppManifest pattern"

patterns-established:
  - "Privacy category apps: adguard-home (DNS ad-blocking), wireguard-easy (VPN with web UI)"
  - "WireGuard UDP port (51820) exposed directly (not 127.0.0.1) for tunnel traffic"

requirements-completed: [R-APPS-RESEARCH, R-APPS-BUILTIN]

duration: 1min
completed: 2026-03-21
---

# Phase 24 Plan 01: App Store Expansion Batch 1 Summary

**5 new builtin apps added (AdGuard Home, WireGuard Easy, Navidrome, Calibre-web, Homarr) expanding store from 18 to 23 apps across privacy, media, and productivity categories**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-21T10:49:29Z
- **Completed:** 2026-03-21T10:50:46Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added AdGuard Home (privacy, port 3003) -- network-wide DNS ad/tracker blocker
- Added WireGuard Easy (privacy, port 51821) -- VPN server with web management UI
- Added Navidrome (media, port 4533) -- music server with Subsonic/Airsonic compatibility
- Added Calibre-web (media, port 8083) -- ebook library with OPDS feed and in-browser reading
- Added Homarr (productivity, port 7575) -- customizable server dashboard with Docker integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 5 new app definitions to builtin-apps.ts** - `b9540ba` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` - Added 5 new BuiltinAppManifest entries (217 lines added), updated file comment to reflect 23 total apps

## Decisions Made
None - followed plan as specified. All 5 app definitions were added exactly as defined in the plan with matching ports, categories, compose definitions, healthchecks, and volume mappings.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 23 builtin apps now available in the BUILTIN_APPS array
- Ready for Plan 02 (second batch of 5 apps) to continue expansion to 28 apps
- All new apps follow the established compose pattern and will work with the existing install system

---
*Phase: 24-app-store-expansion*
*Completed: 2026-03-21*
