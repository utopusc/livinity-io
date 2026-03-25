# Research Summary: v17.0 Precision Computer Use

**Domain:** AI Desktop Automation -- DPI Scaling Fix + Accessibility Tree Integration
**Researched:** 2026-03-25
**Overall confidence:** MEDIUM-HIGH

## Executive Summary

The v15.0 Computer Use system has a critical coordinate mismatch bug: screenshots captured by node-screenshots are in physical pixels (e.g., 2560x1440 on a 150% DPI display), but robotjs mouse control operates in logical pixels (1707x960). The existing code attempts to scale coordinates but never actually resizes the screenshot image (node-screenshots has no resize API), and the toScreenX/toScreenY functions incorrectly map to physical space when robotjs expects logical space.

The fix requires exactly one new npm dependency: **sharp** (v0.34.5) for image resizing. Sharp resizes the captured physical-pixel screenshot to an Anthropic-recommended resolution (XGA 1024x768, WXGA 1280x800, or FWXGA 1366x768), and the coordinate back-mapping scales AI coordinates to logical pixel space for robotjs. This follows the exact same approach as Anthropic's reference implementation (which uses ImageMagick `convert` for the same purpose).

For accessibility tree integration, the research recommends **platform-native tools spawned via child_process** rather than Node.js FFI or npm packages. Windows uses PowerShell loading the built-in System.Windows.Automation .NET assembly (zero external dependencies, available on every Windows installation). macOS requires a small custom Swift CLI binary using AXUIElement APIs. Linux uses a Python script with pyatspi2 (the standard AT-SPI2 binding). All three produce the same JSON schema, consumed by a unified `screen_elements` tool.

The key architectural insight is that accessibility tree coordinates are already in the correct coordinate space for clicking -- they return physical screen coordinates on Windows and absolute screen coordinates on macOS/Linux. When the AI receives both the accessibility tree (with element names, roles, and center coordinates) and a screenshot (for visual context), it can directly use element coordinates instead of pixel-counting, dramatically improving click accuracy.

## Key Findings

**Stack:** Add sharp (^0.34.5) for screenshot resize. No other npm deps needed -- accessibility backends use platform-native tools via child_process.

**Architecture:** Three platform-specific accessibility backends (PowerShell, Swift CLI, Python) behind a unified ScreenElement JSON interface. AI receives accessibility tree first (structured data with coordinates), screenshot second (visual fallback).

**Critical pitfall:** node-screenshots does not document whether width()/height() return physical or logical pixels. Empirical testing on a scaled display is required before implementing the resize pipeline. The scaleFactor() method exists but its exact semantics are undocumented.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **DPI Fix + sharp Integration** - Fix the screenshot resize pipeline first
   - Addresses: Screenshot resize (physical to logical), coordinate back-mapping, toScreenX/toScreenY fix
   - Avoids: Building accessibility features on a broken coordinate foundation
   - Must verify: node-screenshots pixel semantics empirically on a 150% display

2. **Windows UIA Accessibility** - Highest-value platform (most users)
   - Addresses: screen_elements tool, PowerShell UIA integration, element targeting
   - Avoids: Trying to ship all 3 platforms at once (complexity risk)
   - Rationale: Windows is the primary agent platform, PowerShell approach has zero external deps

3. **AI Prompt Optimization + Hybrid Mode** - Make accessibility tree useful
   - Addresses: AI prompt update, accessibility-first with screenshot fallback, caching
   - Avoids: Wasting tokens sending screenshots when accessibility tree is sufficient
   - Depends on: Phase 1 (correct coordinates) + Phase 2 (elements available)

4. **macOS + Linux Accessibility** - Extend to other platforms
   - Addresses: Swift CLI for macOS, Python/pyatspi2 for Linux, unified interface
   - Avoids: Blocking the Windows release on cross-platform completeness
   - Rationale: macOS requires building/shipping a Swift binary, Linux has fragmentation risk

**Phase ordering rationale:**
- DPI fix is prerequisite for everything -- accessibility coordinates are useless if the coordinate space is wrong
- Windows first because it is the primary target platform and has zero external dependency requirements
- AI prompt optimization after elements exist, so we can test the hybrid approach with real data
- macOS/Linux last because they require building/shipping platform-specific binaries and have more edge cases

**Research flags for phases:**
- Phase 1: Needs empirical verification of node-screenshots pixel semantics (LOW confidence on docs)
- Phase 2: Standard patterns (PowerShell + UIA is well-documented), unlikely to need more research
- Phase 3: May need experimentation with prompt engineering to find optimal accessibility tree format for AI
- Phase 4: macOS Swift binary build/distribution needs investigation; Linux pyatspi2 availability varies by distro

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (sharp) | HIGH | De facto standard, Anthropic uses same approach, Electron docs cover integration |
| DPI Fix | HIGH | Root cause well understood, precision-desktop MCP validates the approach |
| Windows UIA | HIGH | Microsoft official API, .NET built-in, PowerShell approach proven |
| macOS AXUIElement | MEDIUM | API is stable but shipping a Swift binary in Electron is less common |
| Linux AT-SPI2 | MEDIUM | Standard protocol but pyatspi2 availability varies by distro |
| node-screenshots pixel semantics | LOW | Documentation does not specify physical vs logical -- needs empirical test |

## Gaps to Address

- **Empirical test needed:** Capture screenshot on a 150% DPI Windows display, verify whether node-screenshots width()/height() returns physical (2560) or logical (1707) pixels
- **macOS binary distribution:** How to build universal Swift binary in CI and bundle in Electron -- needs investigation during Phase 4
- **Linux pyatspi2 availability:** Which distros have it pre-installed vs require manual install -- test on Ubuntu, Fedora, Arch
- **Accessibility tree caching:** How to detect when tree has changed vs is stable (to avoid redundant queries) -- needs experimentation
- **Multi-monitor accessibility:** BoundingRectangle coordinates across multiple monitors with different DPI settings -- edge case for Phase 2
