---
phase: 47-platform-oauth-relay-device-infrastructure
plan: 01
subsystem: auth
tags: [oauth, device-flow, rfc-8628, jwt, jsonwebtoken, drizzle, postgresql]

# Dependency graph
requires:
  - phase: 11-platform-registration
    provides: users table, sessions table, getSession auth helper
provides:
  - devices and device_grants database tables (Drizzle + SQL migration)
  - device-auth.ts helper library (grant lifecycle, JWT signing, user code generation)
  - POST /api/device/register endpoint (RFC 8628 device code issuance)
  - POST /api/device/token endpoint (polling for device JWT)
  - POST /api/device/approve endpoint (session-protected grant approval)
  - /device approval UI page (auto-formatting code input)
affects: [47-02-relay-websocket, agent-binary, my-devices-ui]

# Tech tracking
tech-stack:
  added: [jsonwebtoken, "@types/jsonwebtoken"]
  patterns: [RFC 8628 OAuth Device Authorization Grant, device JWT with HS256]

key-files:
  created:
    - platform/web/src/lib/device-auth.ts
    - platform/web/src/db/migrations/0004_create_devices_tables.sql
    - platform/web/src/app/api/device/register/route.ts
    - platform/web/src/app/api/device/token/route.ts
    - platform/web/src/app/api/device/approve/route.ts
    - platform/web/src/app/(auth)/device/page.tsx
  modified:
    - platform/web/src/db/schema.ts
    - platform/web/package.json
    - platform/relay/src/schema.sql

key-decisions:
  - "User codes are 8-char XXXX-XXXX format with unambiguous chars (no 0/O/1/I/L)"
  - "Device JWT uses HS256 with DEVICE_JWT_SECRET env var shared between web and relay"
  - "Grants auto-expire after 15 minutes; device tokens expire after 24 hours"
  - "Consumed grants are deleted from device_grants table to prevent device_code reuse"
  - "Device tables added to both web schema.ts (Drizzle) and relay schema.sql (startup apply)"

patterns-established:
  - "Device OAuth flow: agent calls /register, user approves at /device, agent polls /token"
  - "User code normalization: strip dashes, uppercase, re-insert dash after 4 chars"

requirements-completed: [PLAT-01, PLAT-02, PLAT-03]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 47 Plan 01: OAuth Device Authorization Grant Summary

**RFC 8628 device auth flow with 3 API routes, device-auth helper library, Drizzle schema, and approval UI page**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T05:19:34Z
- **Completed:** 2026-03-24T05:22:44Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Complete RFC 8628 OAuth Device Authorization Grant flow for agent authentication
- Device-auth helper library with grant lifecycle management, JWT signing, and user code generation
- Three API routes (register, token, approve) with proper validation and error handling
- Centered approval UI page with auto-formatting XXXX-XXXX code input matching existing auth styling
- Database schema for devices and device_grants in both web (Drizzle) and relay (SQL)

## Task Commits

Each task was committed atomically:

1. **Task 1: Database schema + device-auth helper library** - `10f6fc3` (feat)
2. **Task 2: API routes (register, token, approve) + /device approval page** - `3fe7c9c` (feat)

## Files Created/Modified
- `platform/web/src/lib/device-auth.ts` - Grant lifecycle, JWT signing, user code generation helper library
- `platform/web/src/db/schema.ts` - Added devices and deviceGrants Drizzle table definitions
- `platform/web/src/db/migrations/0004_create_devices_tables.sql` - SQL migration for devices + device_grants with indexes
- `platform/web/src/app/api/device/register/route.ts` - POST endpoint returning device_code, user_code per RFC 8628
- `platform/web/src/app/api/device/token/route.ts` - POST polling endpoint returning authorization_pending or JWT
- `platform/web/src/app/api/device/approve/route.ts` - POST session-protected endpoint to approve device grants
- `platform/web/src/app/(auth)/device/page.tsx` - Device approval page with auto-formatting code input
- `platform/web/package.json` - Added jsonwebtoken dependency
- `platform/relay/src/schema.sql` - Appended devices + device_grants tables for relay startup apply

## Decisions Made
- User codes use unambiguous character set (ABCDEFGHJKMNPQRSTUVWXYZ23456789) in XXXX-XXXX format
- Device JWT signed with HS256 using DEVICE_JWT_SECRET, containing userId, deviceId, deviceName, platform
- Grant expiry: 15 minutes for pending grants, 24 hours for device tokens
- Consumed grants are deleted (not just status-updated) to prevent device_code reuse
- Both web and relay schemas updated since they share the same platform database

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] User code normalization in approveGrant**
- **Found during:** Task 1 (device-auth.ts)
- **Issue:** Plan's approveGrant used simple `toUpperCase().trim()` which wouldn't normalize codes without dashes (e.g., user typing "ABCD1234" without dash)
- **Fix:** Added normalization that strips all dashes, uppercases, and re-inserts dash after 4 chars to match stored format
- **Files modified:** platform/web/src/lib/device-auth.ts
- **Verification:** Code format matches DB-stored XXXX-XXXX regardless of input format
- **Committed in:** 10f6fc3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Minor normalization improvement for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. DEVICE_JWT_SECRET defaults to a dev value; production deployment will need the env var set on both platform web and relay.

## Next Phase Readiness
- Device auth flow complete, ready for relay WebSocket implementation (47-02)
- Relay can validate device JWTs using shared DEVICE_JWT_SECRET
- Agent binary can implement the register/poll/connect flow against these endpoints

---
## Self-Check: PASSED

All 8 files verified present. Both task commits (10f6fc3, 3fe7c9c) verified in git log. TypeScript compilation passes cleanly.

---
*Phase: 47-platform-oauth-relay-device-infrastructure*
*Completed: 2026-03-24*
