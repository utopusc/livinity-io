---
phase: 48-agent-binary-authentication
plan: 02
subsystem: agent
tags: [oauth, device-flow, rfc8628, jwt, cli, authentication]

requires:
  - phase: 48-agent-binary-authentication
    plan: 01
    provides: "Agent CLI scaffold with setup stub, ConnectionManager, state.ts credential storage"
  - phase: 47-platform-oauth-relay-device-infrastructure
    plan: 01
    provides: "POST /api/device/register and POST /api/device/token OAuth endpoints"
provides:
  - "OAuth Device Authorization Grant (RFC 8628) implementation in agent/src/auth.ts"
  - "Full setup command: device name prompt, register, display code+URL, poll, store credentials"
  - "Token expiry checking with 5-minute buffer (no JWT library, base64url decode)"
  - "Token expiry check wired into ConnectionManager.connect() preventing expired reconnects"
  - "Status command displays token_expired state"
affects: [49-message-routing, 50-tool-implementations, 51-tool-implementations]

tech-stack:
  added: []
  patterns: ["RFC 8628 device flow with native fetch()", "JWT base64url decode without library", "Token expiry gate in ConnectionManager.connect()"]

key-files:
  created:
    - agent/src/auth.ts
  modified:
    - agent/src/cli.ts
    - agent/src/connection-manager.ts

key-decisions:
  - "No JWT library for client-side decode -- base64url split+decode is sufficient since relay verifies tokens"
  - "No refresh token flow in v14.0 -- expired tokens require re-running setup (acceptable for 24h expiry)"
  - "5-minute buffer on token expiry check to avoid edge-case failures during connection setup"
  - "Token expiry in ConnectionManager sets status='error' to break reconnect loop (reuses existing error gate)"

patterns-established:
  - "PLATFORM_URL hardcoded for security -- agent must always auth against real livinity.io"
  - "Token expiry check at connect() entry point prevents expired-token reconnect storms"
  - "statusCommand handles token_expired state with actionable re-auth message"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, SEC-02]

duration: 3min
completed: 2026-03-24
---

# Phase 48 Plan 02: Agent OAuth Device Flow + Token Expiry Summary

**RFC 8628 OAuth device flow in agent setup command with JWT base64url decode, credential storage, and token expiry gates in start and reconnect paths**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T05:46:17Z
- **Completed:** 2026-03-24T05:49:06Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Full OAuth Device Authorization Grant (RFC 8628) flow: register device, display user code + verification URL, poll for approval, decode JWT, store credentials
- Token expiry checking with 5-minute buffer using pure base64url JWT decode (no library dependency)
- Token expiry gate wired into ConnectionManager.connect() preventing expired-token reconnect storms
- Setup command with device name prompt (hostname default), existing credentials warning, and confirmation

## Task Commits

Each task was committed atomically:

1. **Task 1: OAuth device flow auth module and setup command** - `8f9e6b8` (feat)
2. **Task 2: Wire token expiry check into ConnectionManager reconnect loop** - `d057dda` (feat)

## Files Created/Modified
- `agent/src/auth.ts` - OAuth device flow (deviceFlowSetup, isTokenExpired, refreshOrReauth), JWT base64url decode
- `agent/src/cli.ts` - Setup command with device name prompt and OAuth flow, start command with token expiry check, status command with token_expired display
- `agent/src/connection-manager.ts` - Token expiry check at connect() entry point, writes token_expired state

## Decisions Made
- No JWT library needed for client-side decode -- the agent only needs to extract deviceId from the payload, and the relay handles full JWT verification. A simple base64url split+decode suffices.
- No refresh token endpoint exists in v14.0 platform. When the 24h token expires, users must re-run `livinity-agent setup`. This is acceptable given the device flow is quick.
- 5-minute buffer on expiry check (exp - 300 seconds) prevents edge cases where token expires mid-connection-setup.
- ConnectionManager token expiry sets `this.status = 'error'` which reuses the existing scheduleReconnect guard (`if (this.status === 'error') return`) to break the reconnect loop.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all planned functionality implemented. The `refreshOrReauth()` function is intentionally simple (no refresh, just check+throw) because the platform has no refresh token endpoint yet.

## Next Phase Readiness
- Agent authentication lifecycle complete: setup -> store -> connect -> expiry detection -> re-setup
- Agent can authenticate, connect to relay, and maintain connection with auto-reconnect
- Ready for Phase 49 (message routing) and Phase 50-51 (tool implementations)
- esbuild produces dist/agent.js bundle cleanly for SEA compilation

## Self-Check: PASSED

- All 3 source files verified present on disk (auth.ts, cli.ts, connection-manager.ts)
- SUMMARY.md verified present
- Both commit hashes (8f9e6b8, d057dda) verified in git log
- TypeScript compiles with zero errors
- esbuild produces dist/agent.js bundle

---
*Phase: 48-agent-binary-authentication*
*Completed: 2026-03-24*
