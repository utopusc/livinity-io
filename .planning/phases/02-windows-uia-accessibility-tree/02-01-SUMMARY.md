---
phase: 02-windows-uia-accessibility-tree
plan: 01
subsystem: agent
tags: [windows, uia, accessibility, powershell, dpi, screen-elements, robotjs]

# Dependency graph
requires:
  - phase: 01-dpi-fix-screenshot-pipeline
    provides: "screenshot resize pipeline, toScreenX/toScreenY coordinate mapping"
provides:
  - "DPI awareness (PerMonitorAwareV2) at agent startup on Windows"
  - "Persistent PowerShell subprocess for UIA queries"
  - "screen_elements tool returning interactive UI elements with coordinates"
  - "raw flag on all mouse tools for direct element coordinate usage"
affects: [03-prompt-hybrid-mode, computer-use, agent-core]

# Tech tracking
tech-stack:
  added: [Windows UI Automation via PowerShell, System.Windows.Automation .NET assemblies]
  patterns: [persistent subprocess IPC via stdin/stdout JSON, raw coordinate flag for element-based clicking]

key-files:
  created: []
  modified:
    - agent-app/src/main/agent-core.ts

key-decisions:
  - "Persistent PowerShell subprocess instead of cold-start per UIA query -- eliminates 1-2s assembly load overhead"
  - "Custom control type replaces ToggleButton since System.Windows.Automation.ControlType has no ToggleButton"
  - "raw flag on mouse tools rather than separate click method -- backward compatible, no new tools needed"
  - "UIA coordinates are logical screen pixels (same as robotjs) -- no conversion needed with raw:true"
  - "Pipe-delimited text format for AI consumption -- compact, parseable, minimal token usage"

patterns-established:
  - "Persistent subprocess pattern: spawn once at construction, stdin/stdout JSON IPC, auto-restart on crash"
  - "raw flag pattern: params.raw skips AI-to-screen coordinate conversion for element-sourced coordinates"

requirements-completed: [UIA-01, UIA-02, UIA-03, UIA-04, UIA-05]

# Metrics
duration: 5min
completed: 2026-03-25
---

# Phase 02 Plan 01: Windows UIA Accessibility Tree Summary

**Windows UIA accessibility tree via persistent PowerShell subprocess with screen_elements tool returning pipe-delimited interactive elements and raw coordinate flag for all mouse tools**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T09:25:24Z
- **Completed:** 2026-03-25T09:29:56Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- DPI awareness set to PerMonitorAwareV2 at agent startup (Windows only) via SetProcessDpiAwarenessContext(-4)
- Persistent PowerShell subprocess pre-warmed at construction with embedded UIA script in REPL mode
- screen_elements tool queries focused window's accessibility tree, returns up to 100 interactive elements filtered to 11 control types
- All 6 mouse tools support params.raw flag to accept logical coordinates directly from screen_elements without AI-to-screen conversion
- Auto-restart on subprocess crash, 3-second query timeout, 5-second readiness timeout
- Non-Windows platforms return graceful error without spawning subprocess

## Task Commits

Each task was committed atomically:

1. **Task 1: DPI Awareness + Persistent PowerShell Subprocess** - `23fb56e` (feat)
2. **Task 2: screen_elements Tool Registration and Implementation** - `e87b998` (feat)

## Files Created/Modified
- `agent-app/src/main/agent-core.ts` - Added DPI awareness, UIA subprocess infrastructure, screen_elements tool, raw flag on mouse tools (+307 lines)

## Decisions Made
- Persistent PowerShell subprocess instead of cold-start per query to avoid 1-2s assembly load overhead on each call
- Used Custom control type instead of ToggleButton since System.Windows.Automation.ControlType does not have ToggleButton
- Added raw flag to existing mouse tools rather than creating separate click methods -- backward compatible, no new tool registration needed
- Pipe-delimited text format (id|window|control_type|name|(cx,cy)) chosen for compact AI token usage

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- screen_elements tool registered and ready for use via DeviceBridge auto-discovery
- Phase 3 (prompt update / hybrid mode) can now reference screen_elements in AI system prompt
- Element coordinates in logical screen pixels work directly with mouse_click raw:true
- macOS/Linux accessibility backends deferred to future milestone (returns graceful error on non-Windows)

## Self-Check: PASSED

- agent-app/src/main/agent-core.ts: FOUND
- 02-01-SUMMARY.md: FOUND
- Commit 23fb56e: FOUND
- Commit e87b998: FOUND

---
*Phase: 02-windows-uia-accessibility-tree*
*Completed: 2026-03-25*
