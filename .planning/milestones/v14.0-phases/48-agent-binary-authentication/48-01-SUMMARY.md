---
phase: 48-agent-binary-authentication
plan: 01
subsystem: agent
tags: [websocket, cli, reconnection, esbuild, sea, node-agent]

requires:
  - phase: 47-platform-oauth-relay-device-infrastructure
    provides: "Device protocol types, /device/connect WebSocket endpoint, DeviceRegistry"
provides:
  - "agent/ top-level project scaffold with TypeScript, esbuild, SEA config"
  - "CLI entry point with setup/start/stop/status subcommands"
  - "ConnectionManager with WSS auth, heartbeat, exponential backoff reconnection"
  - "Device protocol types duplicated for standalone SEA bundling"
  - "Tool capability advertisement (9 tool names)"
  - "PID file and state file management for process lifecycle"
affects: [48-agent-setup-oauth, 50-tool-implementations, 51-tool-implementations]

tech-stack:
  added: [ws, esbuild, tsx]
  patterns: ["ConnectionManager replicates TunnelClient reconnection pattern", "Standalone SEA-compatible agent project"]

key-files:
  created:
    - agent/package.json
    - agent/tsconfig.json
    - agent/esbuild.config.mjs
    - agent/sea-config.json
    - agent/src/types.ts
    - agent/src/config.ts
    - agent/src/state.ts
    - agent/src/tools.ts
    - agent/src/index.ts
    - agent/src/cli.ts
    - agent/src/connection-manager.ts
  modified: []

key-decisions:
  - "Duplicated device protocol types from relay for SEA bundling simplicity (no cross-project imports)"
  - "sendMessage typed with DeviceToRelayMessage union instead of Record<string, unknown> for type safety"
  - "Tool executor is a stub returning 'not yet implemented' -- real implementations deferred to Phase 50-51"

patterns-established:
  - "Agent project at agent/ top-level, independent from livos/ and nexus/"
  - "ReconnectionManager class with exponential backoff + jitter replicated from TunnelClient"
  - "Credentials/state/PID stored at ~/.livinity/ directory"

requirements-completed: [AGENT-01, AGENT-02, AGENT-03, AGENT-04, SEC-01]

duration: 3min
completed: 2026-03-24
---

# Phase 48 Plan 01: Agent Project Scaffold + ConnectionManager Summary

**Agent CLI with start/stop/status commands, WebSocket ConnectionManager with DeviceAuth, heartbeat pong, exponential backoff reconnection, and 9-tool capability advertisement**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T05:40:03Z
- **Completed:** 2026-03-24T05:43:38Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Complete agent/ project scaffold with package.json, TypeScript, esbuild bundler, and Node.js SEA config
- CLI entry point routing setup/start/stop/status subcommands with proper process lifecycle management
- ConnectionManager connecting to relay WSS, authenticating with DeviceAuth (matching relay protocol exactly), maintaining heartbeat, and auto-reconnecting with exponential backoff (1s, 2s, 4s... max 60s with jitter)
- 7 device protocol interfaces duplicated from relay with union types for standalone bundling

## Task Commits

Each task was committed atomically:

1. **Task 1: Agent project scaffold with types, config, esbuild, and SEA config** - `581761e` (feat)
2. **Task 2: CLI entry point, ConnectionManager, and start/stop/status commands** - `81556cd` (feat)

## Files Created/Modified
- `agent/package.json` - npm project with ws, esbuild, tsx, typescript dependencies
- `agent/tsconfig.json` - TypeScript config targeting ES2022, NodeNext modules, strict mode
- `agent/esbuild.config.mjs` - Bundles src/index.ts to dist/agent.js with CJS shim banner
- `agent/sea-config.json` - Node.js SEA config pointing to dist/agent.js
- `agent/src/types.ts` - All 7 device protocol interfaces + 3 union types duplicated from relay
- `agent/src/config.ts` - Agent version, relay URL, heartbeat/auth/reconnection constants
- `agent/src/state.ts` - Credentials, state, and PID file read/write functions for ~/.livinity/
- `agent/src/tools.ts` - 9 tool names array and stub executor
- `agent/src/index.ts` - CLI entry point with subcommand routing
- `agent/src/cli.ts` - setup (stub), start, stop, status command implementations
- `agent/src/connection-manager.ts` - ReconnectionManager + ConnectionManager classes

## Decisions Made
- Duplicated device protocol types instead of importing from relay, since the agent needs to be independently bundleable as a SEA binary
- Used DeviceToRelayMessage union type for sendMessage instead of Record<string, unknown> to get compile-time type checking on outgoing messages
- Tool executor returns stub responses -- actual tool implementations are scoped to Phase 50-51

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed sendMessage type signature for type safety**
- **Found during:** Task 2 (ConnectionManager implementation)
- **Issue:** Plan specified `sendMessage(msg: Record<string, unknown>)` but DeviceToolResult interface is not assignable to Record<string, unknown> due to index signature mismatch
- **Fix:** Changed sendMessage parameter type to `DeviceToRelayMessage` union, providing proper type safety
- **Files modified:** agent/src/connection-manager.ts
- **Verification:** TypeScript compiles with zero errors
- **Committed in:** 81556cd (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type-level fix improves correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
- `agent/src/tools.ts:18` - `executeToolStub()` returns "not yet implemented" for all 9 tools. Intentional -- implementations in Phase 50-51.
- `agent/src/cli.ts:7` - `setupCommand()` prints placeholder message. Intentional -- OAuth flow implemented in Plan 02.

## Next Phase Readiness
- Agent project fully scaffolded and compiling cleanly
- Ready for Plan 02 to implement OAuth Device Authorization Grant flow in setupCommand()
- ConnectionManager ready to connect to relay once credentials are obtained via setup
- esbuild produces dist/agent.js bundle for SEA compilation

## Self-Check: PASSED

- All 11 files verified present on disk
- Both commit hashes (581761e, 81556cd) verified in git log
- TypeScript compiles with zero errors
- esbuild produces dist/agent.js bundle

---
*Phase: 48-agent-binary-authentication*
*Completed: 2026-03-24*
