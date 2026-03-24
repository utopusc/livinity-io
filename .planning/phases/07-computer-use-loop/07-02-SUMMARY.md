---
phase: 07-computer-use-loop
plan: 02
subsystem: ai
tags: [computer-use, system-prompt, step-limit, agent-loop, device-control]

# Dependency graph
requires:
  - phase: 07-computer-use-loop/01
    provides: "Vision pipeline with multimodal tool results and screenshot tool"
provides:
  - "Computer use loop guidance in AI system prompt (screenshot-analyze-act-verify)"
  - "Configurable step limit for computer use sessions (default 50)"
  - "Higher max_turns cap (200) for computer use sessions"
  - "API parameter for computer_use_step_limit"
affects: [08-live-monitoring-ui, 09-security-consent-audit]

# Tech tracking
tech-stack:
  added: []
  patterns: ["screenshot-analyze-act-verify loop", "step limit enforcement via message injection"]

key-files:
  created: []
  modified:
    - nexus/packages/core/src/agent.ts
    - nexus/packages/core/src/api.ts

key-decisions:
  - "Step limit counts mouse/keyboard actions only (not screenshots) to avoid penalizing verification"
  - "Graceful stop via message injection rather than hard loop break"
  - "Default 50 actions per session, configurable via API parameter"

patterns-established:
  - "Device tool regex pattern: /^device_.*_(mouse_|keyboard_)/ for identifying computer use actions"
  - "Step limit enforcement: count actions, inject system message at limit, let AI self-terminate"

requirements-completed: [LOOP-01, LOOP-03, LOOP-04, LOOP-05]

# Metrics
duration: 2min
completed: 2026-03-24
---

# Phase 07 Plan 02: Computer Use Loop Guidance Summary

**AI system prompt with screenshot-analyze-act-verify loop, configurable 50-action step limit, and graceful session termination**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-24T17:16:31Z
- **Completed:** 2026-03-24T17:18:59Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added comprehensive computer use guidance to NATIVE_SYSTEM_PROMPT with the Screenshot-Analyze-Act-Verify loop
- Implemented configurable step limit (default 50) tracking mouse/keyboard device tool calls
- Raised max_turns cap from 100 to 200 to accommodate longer computer use sessions
- Added computer_use_step_limit API parameter for per-request configuration

## Task Commits

Each task was committed atomically:

1. **Task 1: Add computer use guidance to NATIVE_SYSTEM_PROMPT** - `2245f50` (feat)
2. **Task 2: Add computer use step limit and raise max_turns cap** - `9e0a871` (feat)

## Files Created/Modified
- `nexus/packages/core/src/agent.ts` - Added Computer Use section to NATIVE_SYSTEM_PROMPT with loop guidance, device control in Tool Overview, computerUseStepLimit config, step counter and limit enforcement
- `nexus/packages/core/src/api.ts` - Raised max_turns cap to 200, added computer_use_step_limit parameter passthrough

## Decisions Made
- Step limit counts mouse/keyboard actions only (not screenshots), so verification screenshots don't penalize the AI for following the loop correctly
- Used message injection (appending to last tool result) rather than breaking the loop, allowing the AI to gracefully wrap up with a final screenshot and summary
- Default 50 actions per session balances giving the AI enough room for complex tasks while preventing runaway sessions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Computer use loop is fully guided: AI knows how to screenshot-analyze-act-verify
- Step limits prevent runaway sessions with graceful termination
- Ready for Phase 08 (Live Monitoring UI) and Phase 09 (Security/Consent/Audit)

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 07-computer-use-loop*
*Completed: 2026-03-24*
