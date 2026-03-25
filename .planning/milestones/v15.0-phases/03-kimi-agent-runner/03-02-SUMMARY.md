---
phase: 03-kimi-agent-runner
plan: 02
subsystem: agent-runner
tags: [kimi, cli, subprocess, jsonl, mcp, agent-runner, child-process, streaming]

# Dependency graph
requires:
  - phase: 01-kimi-provider
    provides: KimiProvider with OpenAI-compatible API for direct chat
  - phase: 02-configuration-layer
    provides: Config schema with Kimi model IDs and API key storage
  - phase: 03-kimi-agent-runner plan 01
    provides: Kimi CLI installed on server (Python 3.12, uv, kimi binary in PATH)
provides:
  - KimiAgentRunner class with same EventEmitter + run(task) interface as SdkAgentRunner
  - JSONL event parsing mapping Kimi CLI output to AgentEvent types
  - MCP tool bridging via --mcp-config (nexus-tools HTTP + chrome-devtools stdio)
  - Temp agent YAML + system prompt file lifecycle management
  - Token usage tracking from JSONL metadata
affects:
  - 04-cleanup (wiring KimiAgentRunner into api.ts, daemon.ts, replacing SdkAgentRunner)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI subprocess with JSONL readline parsing for agent execution"
    - "MCP tool bridging via --mcp-config inline JSON (HTTP + stdio)"
    - "Temp file lifecycle: write before spawn, cleanup in finally block"

key-files:
  created:
    - nexus/packages/core/src/kimi-agent-runner.ts
  modified:
    - nexus/packages/core/src/lib.ts

key-decisions:
  - "Print mode over Agent SDK: spawn kimi --print for stability (SDK v0.1.5 too immature)"
  - "nexus-tools via HTTP URL (port 3100) not inline MCP server: Kimi CLI cannot host in-process MCP"
  - "Temp agent YAML + .md files in /tmp/nexus-agents/ with cleanup in finally block"
  - "JSONL parsing with graceful skip on parse errors (log + continue, not crash)"
  - "Token estimation at ~4 chars/token for budget enforcement mid-run"
  - "Export added to lib.ts (barrel export) not index.ts (main entry point)"

patterns-established:
  - "KimiAgentRunner pattern: spawn CLI subprocess, parse JSONL, emit AgentEvents"
  - "MCP config as inline JSON string passed via --mcp-config flag"

# Metrics
duration: 4min
completed: 2026-03-09
---

# Phase 3 Plan 2: KimiAgentRunner Implementation Summary

**KimiAgentRunner spawning kimi CLI in print mode with JSONL parsing, MCP bridging via --mcp-config, and temp agent file lifecycle**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-09T08:58:56Z
- **Completed:** 2026-03-09T09:02:29Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Complete KimiAgentRunner implementation (497 lines) with same interface as SdkAgentRunner
- JSONL event parsing maps assistant content, tool_calls, tool results, and usage metadata to AgentEvent types
- MCP tool bridging via --mcp-config inline JSON (nexus-tools HTTP on 3100 + chrome-devtools conditional)
- Temp agent YAML + system prompt .md files per session, cleaned up in finally block
- Full token usage tracking, timeout enforcement, TTFB measurement, token budget enforcement

## Task Commits

Each task was committed atomically:

1. **Task 1: Create KimiAgentRunner with JSONL parsing and MCP bridging** - `d86eb39` (feat)
2. **Task 2: Export KimiAgentRunner from package index** - `4a624c8` (feat)

## Files Created/Modified
- `nexus/packages/core/src/kimi-agent-runner.ts` - KimiAgentRunner class: spawns kimi CLI, parses JSONL, bridges MCP tools, manages temp files
- `nexus/packages/core/src/lib.ts` - Added KimiAgentRunner to @nexus/core/lib barrel exports

## Decisions Made
- **Print mode over SDK:** Using `kimi --print --output-format=stream-json` subprocess instead of `@moonshot-ai/kimi-agent-sdk` because the SDK is v0.1.5 and unstable (see PITFALLS.md P1). Print mode is simpler and equally capable.
- **HTTP URL for nexus-tools MCP:** Kimi CLI's `--mcp-config` accepts `url` for HTTP MCP servers. The existing nexus-mcp StreamableHTTP server on port 3100 is referenced directly -- no need for inline tool registration or in-process MCP server.
- **Export in lib.ts, not index.ts:** The plan specified index.ts but that file is the main daemon entry point, not a barrel export. Added to lib.ts which is the actual library barrel (`@nexus/core/lib`), matching the pattern used by AgentLoop and other exportable classes.
- **Model ID mapping:** Used `kimi-for-coding` (sonnet), `kimi-latest` (flash/haiku), `kimi-k2.5` (opus) based on research. These may need adjustment after `kimi info` verification on server.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Export target changed from index.ts to lib.ts**
- **Found during:** Task 2 (Export KimiAgentRunner)
- **Issue:** Plan specified index.ts but that file is the main daemon entry (`main()` function), not a barrel export
- **Fix:** Added export to lib.ts which is the actual library barrel export file for @nexus/core
- **Files modified:** nexus/packages/core/src/lib.ts
- **Verification:** `tsc --noEmit` passes, grep confirms export line
- **Committed in:** 4a624c8

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Correct export location ensures importability without breaking the main entry point. No scope creep.

## Issues Encountered
None -- plan executed cleanly with the single export target adjustment noted above.

## User Setup Required
None -- no external service configuration required. The Kimi CLI must be installed on the server (handled by 03-01 plan).

## Next Phase Readiness
- KimiAgentRunner is complete and exported, ready to be wired into api.ts and daemon.ts
- Phase 4 (cleanup) will: import KimiAgentRunner in api.ts/daemon.ts, replace SdkAgentRunner references, remove Claude SDK dependency
- Pending: `nexus/scripts/install-kimi.sh` must be run on server4 before runtime testing

---
*Phase: 03-kimi-agent-runner*
*Completed: 2026-03-09*
