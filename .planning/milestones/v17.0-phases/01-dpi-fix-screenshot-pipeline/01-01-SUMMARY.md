---
phase: 01-dpi-fix-screenshot-pipeline
plan: 01
subsystem: agent
tags: [sharp, dpi, screenshot, robotjs, coordinate-mapping, electron, computer-use]

# Dependency graph
requires: []
provides:
  - "sharp-based screenshot resize pipeline (physical -> target resolution)"
  - "Correct toScreenX/toScreenY coordinate mapping (AI target space -> logical screen space)"
  - "Screenshot metadata with physicalWidth, logicalWidth, displayWidth fields"
  - "AI system prompt documenting coordinate space as displayWidth x displayHeight"
affects: [02-windows-uia-accessibility, 03-macos-ax-accessibility]

# Tech tracking
tech-stack:
  added: [sharp ^0.34.5]
  patterns: [sharp-resize-pipeline, physical-logical-target-coordinate-chain]

key-files:
  created: []
  modified:
    - agent-app/package.json
    - agent-app/package-lock.json
    - agent-app/src/main/agent-core.ts
    - nexus/packages/core/src/agent.ts

key-decisions:
  - "Used sharp JPEG input (toJpegSync) instead of raw BGRA to avoid color channel issues"
  - "Matched SCALE_TARGETS against logical dimensions (not physical) for aspect ratio comparison"
  - "Kept legacy screenWidth/screenHeight fields for backward compat, mapped to logical dimensions"

patterns-established:
  - "Coordinate chain: AI coords (target space) * (logical / target) = logical coords (robotjs space)"
  - "Screenshot metadata: width/height = logical, displayWidth/displayHeight = AI target, physicalWidth/physicalHeight = raw capture"
  - "sharp loaded via require() inside toolScreenshot (lazy loading pattern, matches robotjs pattern)"

requirements-completed: [DPI-01, DPI-02, DPI-03, DPI-04]

# Metrics
duration: 4min
completed: 2026-03-25
---

# Phase 01 Plan 01: DPI Fix & Screenshot Pipeline Summary

**Sharp-based screenshot resize from physical to target resolution with correct coordinate mapping chain (AI -> logical -> robotjs) and explicit AI prompt coordinate documentation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-25T09:03:04Z
- **Completed:** 2026-03-25T09:06:37Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Installed sharp ^0.34.5 and configured asarUnpack for Electron bundling (sharp + @img native binaries)
- Rewrote toolScreenshot() to actually resize screenshots from physical pixels to target resolution using sharp, eliminating the "crop doesn't resize" no-op that sent full-res images with fake metadata
- Fixed toScreenX/toScreenY to use correct formula: AI coord * (logicalScreen / aiTarget) instead of broken division by scaleX that mapped to physical space
- Updated AI system prompt to explicitly state coordinate space is displayWidth x displayHeight with automatic DPI conversion

## Task Commits

Each task was committed atomically:

1. **Task 1: Install sharp, rewrite toolScreenshot with actual resize, fix toScreenX/toScreenY** - `bb6a1ba` (feat)
2. **Task 2: Update AI system prompt to document coordinate space** - `c09b240` (feat)

## Files Created/Modified

- `agent-app/package.json` - Added sharp ^0.34.5 dependency, updated asarUnpack with sharp/** and @img/**
- `agent-app/package-lock.json` - Lock file updated with sharp and platform-specific @img packages
- `agent-app/src/main/agent-core.ts` - Rewrote toolScreenshot() with sharp resize, new logicalScreenW/H and aiTargetW/H fields, corrected toScreenX/toScreenY formula, removed broken screenScaleX/Y
- `nexus/packages/core/src/agent.ts` - Replaced ambiguous "SCALED dimensions" prompt with explicit coordinate space documentation

## Decisions Made

- **JPEG input to sharp instead of raw BGRA:** Used `image.toJpegSync()` and passed the JPEG buffer to sharp directly rather than raw pixel data. This avoids potential BGRA/RGBA channel ordering issues with node-screenshots raw output, and sharp handles JPEG input natively without needing raw width/height/channels parameters.
- **Logical dimensions for SCALE_TARGETS matching:** Compared aspect ratio against logical dimensions (physicalW/scaleFactor) rather than physical dimensions. This ensures the target resolution is appropriate for the screen the user actually sees, not the inflated physical pixel count.
- **Backward compatibility for screenWidth/screenHeight:** Kept these fields mapped to logical dimensions so any code outside this file that references them gets sensible values.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Screenshot pipeline is fully fixed: images are actually resized, coordinates map correctly through the full chain
- The coordinate chain (AI target space -> logical screen space -> robotjs) is established and documented
- Phase 2 (Windows UIA accessibility tree) can build on this foundation -- accessibility element coordinates will need to be converted to the same AI target space for consistency
- Manual verification on a 150% DPI display is recommended to confirm <5px click offset

---
## Self-Check: PASSED

- All 4 modified files exist on disk
- Commit bb6a1ba (Task 1) found in git log
- Commit c09b240 (Task 2) found in git log
- SUMMARY.md created at expected path

---
*Phase: 01-dpi-fix-screenshot-pipeline*
*Completed: 2026-03-25*
