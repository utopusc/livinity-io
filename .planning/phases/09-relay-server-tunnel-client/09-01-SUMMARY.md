---
phase: 09-relay-server-tunnel-client
plan: 01
subsystem: infra
tags: [websocket, tunnel, typescript, postgresql, protocol, relay]

# Dependency graph
requires: []
provides:
  - "Relay project scaffold (platform/relay/) with all dependencies"
  - "14 tunnel protocol message types as TypeScript interfaces"
  - "4 union types (RelayToClientMessage, ClientToRelayMessage, BidirectionalMessage, TunnelMessage)"
  - "Environment-based config module with 14 configuration keys"
  - "PostgreSQL schema with 4 tables (users, api_keys, bandwidth_usage, tunnel_connections)"
affects: [09-02, 09-03, 09-04, 09-05, 09-06, 10-tunnel-client, 11-platform-app]

# Tech tracking
tech-stack:
  added: [ws, ioredis, pg, nanoid, bcryptjs, jsonwebtoken, tsx, typescript]
  patterns: [ESM-only Node.js project, JSON+base64 tunnel envelope protocol, env-based config with typed defaults]

key-files:
  created:
    - platform/relay/package.json
    - platform/relay/tsconfig.json
    - platform/relay/src/protocol.ts
    - platform/relay/src/config.ts
    - platform/relay/src/schema.sql
  modified: []

key-decisions:
  - "ESM-only project (type: module) with NodeNext resolution"
  - "Discriminated union pattern for message type routing (TunnelMessage['type'])"
  - "Helper types (MessageType, MessageTypeMap) added for future type-safe message routing"

patterns-established:
  - "Protocol-first design: all message types defined before any implementation"
  - "Config as const object with typed env helpers (envInt, envStr)"
  - "Idempotent SQL schema (all IF NOT EXISTS) applied on startup"

# Metrics
duration: 3min
completed: 2026-03-17
---

# Phase 9 Plan 01: Project Scaffold + Protocol Types Summary

**Relay project scaffolded with 14 tunnel message types, env-based config, and 4-table PostgreSQL schema**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-17T19:29:31Z
- **Completed:** 2026-03-17T19:32:05Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created standalone relay project at platform/relay/ with all runtime and dev dependencies
- Defined complete tunnel protocol specification as TypeScript interfaces (14 message types, 4 union types)
- Built typed config module reading 14 environment variables with sensible defaults
- Created idempotent PostgreSQL schema for users, API keys, bandwidth metering, and tunnel connections

## Task Commits

Each task was committed atomically:

1. **Task 1: Create relay project scaffold with dependencies** - `753d482` (chore)
2. **Task 2: Define tunnel protocol types, config module, and PostgreSQL schema** - `f94e9a8` (feat)

## Files Created/Modified
- `platform/relay/package.json` - Node.js project with ws, ioredis, pg, nanoid, bcryptjs, jsonwebtoken
- `platform/relay/tsconfig.json` - TypeScript config targeting ESNext with NodeNext module resolution
- `platform/relay/src/protocol.ts` - All 14 tunnel message type interfaces + 4 union types + helper types
- `platform/relay/src/config.ts` - Environment-based configuration with 14 typed keys and defaults
- `platform/relay/src/schema.sql` - PostgreSQL schema: users, api_keys, bandwidth_usage, tunnel_connections + 2 indexes

## Decisions Made
- Used ESM-only (`"type": "module"`) with NodeNext resolution for modern Node.js compatibility
- Added discriminated union helper types (MessageType, MessageTypeMap) beyond what the plan specified, for type-safe message routing in subsequent plans
- Added `envInt` and `envStr` helper functions in config.ts for clean env parsing with warning on invalid values

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All subsequent plans (09-02 through 09-06) can import protocol types and config
- `import type { TunnelRequest } from './protocol.js'` works
- `import { config } from './config.js'` works
- schema.sql ready to apply on Server5 PostgreSQL in plan 09-02

---
*Phase: 09-relay-server-tunnel-client*
*Completed: 2026-03-17*
