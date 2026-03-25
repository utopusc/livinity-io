# Feature Research: Precision Computer Use (v17.0)

**Domain:** Accessibility tree integration, DPI-aware coordinate handling, and cross-platform element targeting for AI computer use
**Researched:** 2026-03-25
**Confidence:** HIGH for DPI/screenshot pipeline fixes, MEDIUM for accessibility tree cross-platform, LOW for Linux AT-SPI2 via Node.js

## Context: What Exists Today

The Livinity agent (agent-core.ts) currently has:
- 8 desktop automation tools (6 mouse + 2 keyboard) via @jitsi/robotjs
- Screenshot capture via node-screenshots (JPEG encoding, base64 transfer)
- screen_info tool returning display resolution, scale factor, monitor positions
- Autonomous screenshot-then-analyze-then-act-then-verify loop (50-action step limit)
- Live monitoring panel with screenshot feed, click overlays, action timeline
- Coordinate scaling logic (screenScaleX/Y) intended to map AI coordinates to screen coordinates

**Known broken:** Screenshots capture in physical pixels (e.g., 2560x1440 on a 150% DPI display) but robotjs operates in logical pixels (1707x960). The scaling logic in toScreenX/toScreenY does not account for DPI scaling at all -- it only handles the downscale-for-API case. node-screenshots does not have a resize method, so the agent sends full-resolution images and tells the AI about target dimensions, but the API auto-resizes internally, creating an opaque coordinate mismatch.

## Feature Landscape

### Table Stakes (Must Fix / Must Have)

Features that fix broken behavior or match what every serious computer use implementation does. Missing these means the product fundamentally does not work reliably.

#### 1. Screenshot Pipeline Fix (Physical to Logical Pixels)

| Feature | Why Required | Complexity | Notes |
|---------|-------------|------------|-------|
| Resize screenshots to logical pixel dimensions using sharp | Current pipeline sends physical-pixel screenshots. Anthropic docs explicitly say: resize screenshots yourself and scale coordinates back up. Without this, AI coordinates are in an undefined space | LOW | `sharp(buffer).resize(logicalWidth, logicalHeight).jpeg().toBuffer()`. Sharp is already a common Node.js dep, ~6MB |
| Report logical dimensions in screenshot metadata | The screenshot tool currently reports physical `captureW x captureH` but the AI needs to know the coordinate space it should use | LOW | Change `data.width`/`data.height` to report logical dimensions. Add `physicalWidth`/`physicalHeight` for diagnostics |
| Calculate correct scale factor from display API | `node-screenshots` `Monitor.scaleFactor()` already returns the DPI scale. Use it: `logicalWidth = physicalWidth / scaleFactor` | LOW | Single line of math. Critical foundation for everything else |

**Anthropic official guidance (HIGH confidence, from docs):** "The API constrains images to a maximum of 1568 pixels on the longest edge and approximately 1.15 megapixels total. To fix coordinate mismatches, resize screenshots yourself and scale Claude's coordinates back up." Recommended resolutions: 1024x768 (XGA), 1280x800 (WXGA), 1366x768 (FWXGA).

#### 2. Coordinate Mapping Fix (toScreenX/toScreenY)

| Feature | Why Required | Complexity | Notes |
|---------|-------------|------------|-------|
| Fix toScreenX/toScreenY to use logical pixel space | Current logic only handles downscale. It needs to: (1) map from AI image coords to logical pixels, (2) account for DPI if robotjs uses physical coords | LOW | Replace the current broken conditional with: `screenX = Math.round(aiX / imageScale)` where imageScale = displayWidth_sentToAI / logicalScreenWidth |
| Handle multi-monitor coordinate offsets | robotjs moveMouse uses absolute desktop coordinates. Multi-monitor setups need monitor X/Y offsets added | MEDIUM | Use `monitorX`/`monitorY` from node-screenshots. Already captured but not used in coordinate math |
| Validate coordinates before execution | Anthropic docs show returning error for out-of-bounds coords. Current code does not validate | LOW | Check `0 <= x < logicalWidth && 0 <= y < logicalHeight` before calling robotjs |

#### 3. DPI Awareness at Agent Startup (Windows)

| Feature | Why Required | Complexity | Notes |
|---------|-------------|------------|-------|
| Call SetProcessDpiAwarenessContext(PerMonitorAwareV2) at process startup | Without this, Windows virtualizes coordinates for "DPI-unaware" apps. robotjs may receive virtualized coordinates that do not match actual pixel positions | MEDIUM | Requires native addon or ffi call. Can use `ffi-napi` to call `user32.dll!SetProcessDpiAwarenessContext(-4)` at startup. The `-4` constant is DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 |
| Detect actual DPI per monitor at runtime | Windows can have different DPI per monitor. Need to know which monitor the target element is on | MEDIUM | `GetDpiForMonitor()` via ffi-napi or use node-screenshots scaleFactor per monitor. Already partially available |

**Microsoft docs (HIGH confidence):** "Calling SetProcessDpiAwarenessContext with per-monitor V2 awareness does not cause use of a virtualized coordinate system, so it will generally give you 1 coordinate = 1 pixel even on high-DPI displays."

### Differentiators (Accessibility Tree Integration)

Features that go beyond screenshot-only computer use. These are what Windows-Use, nut.js, and advanced agents implement. Not strictly required for basic functionality, but dramatically improve accuracy and efficiency.

#### 4. Windows UI Automation (UIA) Accessibility Tree

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Enumerate interactive elements via Windows UIA API | Eliminates guessing from screenshots. AI gets exact element names, types, and positions. Windows-Use uses this as primary input (no vision model needed). Benchmarks show UIA-backed agents outperform pixel-only agents | HIGH | Three implementation paths: (A) PowerShell subprocess calling System.Windows.Automation .NET classes, (B) @bright-fish/node-ui-automation native addon wrapping COM UIA, (C) @nut-tree/element-inspector. **Recommend (A) for v1 because zero native dep risk** |
| Element serialization as structured text for AI | The AI needs a compact, parseable representation of UI elements. Windows-Use sends this as primary context instead of screenshots | MEDIUM | Format: indexed list with role, name, value, bounding rect. See "Element Serialization Format" section below |
| Center-point coordinates for each element | AI can click by element ID rather than guessing pixel coordinates | LOW | Each element's bounding rect provides `(x + width/2, y + height/2)` in logical pixels |
| Focused window scoping | Only enumerate elements of the foreground/active window, not entire desktop tree. Full tree can have 10,000+ nodes | MEDIUM | Get foreground window handle via `GetForegroundWindow()`, walk only that subtree. Critical for performance |
| Depth-limited tree traversal | Full accessibility trees are enormous. Limit to interactive elements and 3-4 levels deep | MEDIUM | Filter by control patterns (InvokePattern, TogglePattern, ValuePattern, SelectionItemPattern) to find clickable/typeable elements |

**Windows-Use approach (MEDIUM confidence, from GitHub analysis):** Windows-Use uses `use_accessibility=True` (default) with UIA as the primary perception mechanism. Vision (`use_vision=False` by default) is optional supplement. Their 13 tools operate on structured element data, not pixel coordinates.

#### 5. `screen_elements` Tool

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| New tool returning structured element list | Single tool call gives AI a complete picture of what can be interacted with, plus precise coordinates for each element | MEDIUM | Returns JSON array of `{ id, role, name, value, x, y, width, height, clickX, clickY, enabled, focused }`. Replaces need for screenshot in many cases |
| Element count and summary in output text | AI needs a quick textual summary alongside the structured data: "Found 23 interactive elements in window 'Settings'" | LOW | Simple string generation from element list |
| Optional filtering by element type | AI can request only buttons, or only text fields, reducing token consumption | LOW | Parameter: `filter?: 'button' | 'text' | 'menu' | 'all'` |
| Caching with change detection | If accessibility tree has not changed since last call, return cached result and skip re-enumeration. Reduces unnecessary work in the action loop | MEDIUM | Hash the element tree structure. If hash matches previous, return `{ changed: false, cachedAt: timestamp }` |

#### 6. macOS AXUIElement Accessibility Backend

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Enumerate elements via macOS Accessibility API (AXUIElement) | Same structured element data as Windows, enabling cross-platform parity | HIGH | macOS requires: (1) Accessibility permission granted in System Preferences, (2) Swift or Objective-C bridge to call AXUIElementCopyAttributeValues. Libraries: AXorcist (Swift), DFAXUIElement (Swift). **Must be called from a compiled helper binary, not Node.js directly** |
| Swift helper binary invoked as subprocess | Node.js cannot call AXUIElement APIs directly. A small Swift CLI tool can enumerate the tree and output JSON to stdout | HIGH | ~200 lines of Swift. Compile with `swiftc` at build time. Ship as part of agent binary or compile on first run. macOS-only binary |
| Permission detection and user prompt | macOS blocks accessibility access until user explicitly grants it in System Preferences > Privacy > Accessibility | MEDIUM | Check `AXIsProcessTrusted()`. If false, show dialog explaining how to grant permission. Critical for UX -- without this, the feature silently fails |

**Apple docs (HIGH confidence):** AXUIElement is the core type for accessibility clients. It requires explicit user permission. Libraries like AXorcist and AccessibilityNavigator provide modern Swift wrappers.

#### 7. Linux AT-SPI2 Accessibility Backend

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Enumerate elements via AT-SPI2 D-Bus protocol | Completes the cross-platform story. Linux GNOME/GTK apps expose accessibility via AT-SPI2 | HIGH | AT-SPI2 uses D-Bus. Can be accessed via: (1) Python pyatspi2 as subprocess, (2) Direct D-Bus calls from Node.js via `dbus-native` npm package, (3) `gdbus` CLI subprocess. **Recommend (1) pyatspi2 subprocess for reliability** |
| Handle missing accessibility support | Many Linux apps (especially Qt/KDE, Electron) have poor or no accessibility tree support. Need graceful fallback | MEDIUM | Detect empty/stub trees. Return `{ available: false, reason: 'No accessibility support for this window' }` and fall back to screenshot mode |

**AT-SPI2 docs (MEDIUM confidence):** AT-SPI2 is a D-Bus protocol where toolkit widgets expose their content. Python bindings (pyatspi2) are the most well-documented access path. GTK apps have good support; Qt apps have partial support; Electron apps have variable support depending on `--force-renderer-accessibility` flag.

#### 8. Unified Cross-Platform screen_elements Interface

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Platform-agnostic element format | AI gets same JSON structure regardless of OS. Same prompt works everywhere | MEDIUM | Normalize platform-specific properties (UIA ControlType, AX role, AT-SPI role) to common set: button, textField, checkbox, menu, menuItem, link, list, listItem, tab, window, generic |
| Platform detection and backend routing | Agent detects OS at startup and loads appropriate accessibility backend | LOW | `process.platform` switch: win32 -> UIA, darwin -> AXUIElement, linux -> AT-SPI2 |
| Graceful degradation | If accessibility backend fails or is unavailable, fall back to screenshot-only mode (current behavior) | LOW | Try-catch around accessibility calls. Return `{ available: false }` and continue with screenshot-based computer use |

### Differentiators: AI Prompt Optimization

#### 9. Accessibility-First AI Prompting

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Send accessibility tree as primary context, screenshot as secondary | Dramatically reduces token consumption and improves accuracy. The AI reads structured element data first, only uses screenshot for visual layout context | MEDIUM | Modify agent loop system prompt: "You have a structured list of UI elements with their coordinates. Use element IDs and coordinates from this list. Only request a screenshot if the element list is insufficient" |
| Element ID-based click targets | Instead of AI guessing pixel coordinates from a screenshot, it references `element_id: 7` and the agent looks up coordinates | LOW | AI returns `{ tool: 'mouse_click', params: { element_id: 7 } }` instead of `{ params: { x: 483, y: 217 } }`. Agent resolves element_id to clickX/clickY from cached tree |
| Smart screenshot skipping | If accessibility tree is unchanged and last action was keyboard input, skip screenshot capture. Saves ~200ms per loop iteration and reduces token cost | MEDIUM | Track tree hash. If `hash === previousHash && lastAction.type !== 'mouse'`, skip screenshot on next iteration |

#### 10. Hybrid Mode (Accessibility + Screenshot Fallback)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Automatic mode selection per action | Use accessibility coordinates when element is found in tree. Fall back to screenshot coordinates when element is not in tree (custom-drawn UIs, games, etc.) | MEDIUM | If AI provides `element_id`, use tree coordinates. If AI provides raw `x, y`, use screenshot coordinate mapping. Both paths work simultaneously |
| Screenshot annotation with element overlays | Optionally draw bounding boxes and element IDs on screenshots before sending to AI. Bridges gap between structured data and visual context | HIGH | Use sharp to composite rectangles and text labels onto screenshot buffer. Token cost increases but accuracy may improve for complex UIs. **Defer -- high effort, unclear ROI** |
| Confidence-based mode switching | If accessibility tree has very few elements (< 3), switch to screenshot-primary mode automatically | LOW | Simple heuristic check after tree enumeration |

## Anti-Features (Do NOT Build)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full desktop tree enumeration | Enumerating the entire accessibility tree from root can return 10,000+ nodes, takes seconds, and overwhelms the AI context window | Only enumerate the focused/foreground window subtree, max 3-4 levels deep, interactive elements only |
| Vision-based element detection (OmniParser) | OmniParser/V2 is a separate ML model (1-2GB) that detects UI elements from screenshots. Requires GPU, adds massive latency, and is overkill when the OS already provides accessibility trees | Use the OS accessibility APIs. They are free, instant, and more accurate. OmniParser is for environments without accessibility support (headless VMs, game UIs) |
| Browser DOM inspection | Building a separate browser automation layer (like Playwright) adds enormous complexity and scope creep | Use the OS accessibility tree which already exposes browser UI elements. If the user wants browser automation specifically, that is a separate future milestone |
| Real-time screen streaming / VNC | Video streaming is a completely different architecture (WebRTC, codec, bandwidth). The screenshot-then-act loop is the right architecture for AI agents | Keep discrete screenshot captures. The loop approach matches Anthropic and OpenAI reference implementations |
| Custom accessibility tree for Electron apps | Forcing `--force-renderer-accessibility` on user's Electron apps or injecting accessibility providers is invasive and fragile | Accept that some apps have poor accessibility trees and fall back to screenshot mode gracefully |
| Multi-monitor element enumeration | Scanning all monitors' accessibility trees multiplies complexity and confuses the AI about which screen to target | Only enumerate elements on the primary monitor or the monitor containing the active/focused window |

## Element Serialization Format

The format AI receives for `screen_elements` output. Based on analysis of Windows-Use, nut.js element-inspector, and Playwright accessibility snapshots:

### Recommended Format (Compact Indexed List)

```
Window: "Settings" (1920x1080)
[1] button "Save" at (850, 950) enabled
[2] button "Cancel" at (960, 950) enabled
[3] textField "Username" value="admin" at (400, 200) enabled focused
[4] checkbox "Enable notifications" checked at (400, 300) enabled
[5] combobox "Theme" value="Dark" at (400, 400) enabled
[6] tab "General" at (100, 50) selected
[7] tab "Advanced" at (200, 50)
[8] link "Documentation" at (400, 500) enabled
```

**Why this format:**
- Numbered IDs let AI reference elements unambiguously: "Click element [3]"
- Compact enough to fit in context alongside screenshot
- Human-readable for debugging
- Role + name + value + coordinates + state covers all interaction needs
- Coordinates are center-points in logical pixels (ready for clicking)

### Full JSON Structure (Internal)

```typescript
interface ScreenElement {
  id: number;              // Sequential ID for this snapshot
  role: string;            // Normalized: button, textField, checkbox, etc.
  name: string;            // Accessible name / label
  value?: string;          // Current value (for inputs, combos, etc.)
  clickX: number;          // Center X in logical pixels
  clickY: number;          // Center Y in logical pixels
  width: number;           // Element width in logical pixels
  height: number;          // Element height in logical pixels
  enabled: boolean;
  focused: boolean;
  selected?: boolean;
  checked?: boolean;
  expandState?: 'expanded' | 'collapsed';
  children?: ScreenElement[];  // For tree views, menus
}
```

## Coordinate Space Handling

### The Three Coordinate Spaces

1. **Physical pixels** -- What the display hardware uses. On a 2560x1440 display at 150% DPI, this is 2560x1440.
2. **Logical pixels** -- What the OS and apps use. On that same display, this is 1707x960 (physical / scaleFactor).
3. **AI image pixels** -- What the AI sees after the screenshot is resized to fit API limits. If we resize to 1280x800, the AI operates in that space.

### Correct Pipeline

```
Capture (physical pixels: 2560x1440)
    |
    v
Resize with sharp (to recommended target: 1280x800 or 1366x768)
    |
    v
Send to AI (display_width_px: 1280, display_height_px: 800)
    |
    v
AI returns coordinates in AI image space (e.g., click at 640, 400)
    |
    v
Scale up: screenX = aiX * (logicalWidth / imageWidth)
          screenY = aiY * (logicalHeight / imageHeight)
    |
    v
robotjs.moveMouse(screenX + monitorOffsetX, screenY + monitorOffsetY)
```

### When Accessibility Tree Coordinates Are Used

```
screen_elements returns clickX, clickY in logical pixels
    |
    v
AI says: click element [3] (which has clickX=400, clickY=200)
    |
    v
robotjs.moveMouse(400 + monitorOffsetX, 200 + monitorOffsetY)
```

No scaling needed -- accessibility tree coordinates are already in logical pixel space.

## Feature Dependencies

```
DPI Awareness (3) ──────────────┐
                                v
Screenshot Pipeline Fix (1) ──> Coordinate Mapping Fix (2) ──> AI Prompt Update (9)
                                ^                                    |
                                |                                    v
Windows UIA (4) ──> screen_elements Tool (5) ──> Hybrid Mode (10)
                                ^
macOS AXUIElement (6) ─────────┤
                                |
Linux AT-SPI2 (7) ─────────────┤
                                |
Unified Interface (8) ─────────┘
```

**Critical path:** Features 1-3 (DPI/screenshot/coordinate fixes) are prerequisites for everything else and independently fix the existing broken behavior.

**Parallel track:** Features 4-8 (accessibility tree) can start after 1-3, with Windows UIA first (primary development platform), then macOS and Linux.

**Integration:** Features 9-10 (AI prompt optimization and hybrid mode) come last, requiring both the fixed pipeline and at least one accessibility backend.

## MVP Recommendation

### Phase 1: Fix What Is Broken (Critical, Unblocks Everything)
1. **Screenshot resize via sharp** -- physical to logical pixel conversion
2. **Correct coordinate metadata** -- report logical dimensions to AI
3. **Fix toScreenX/toScreenY** -- proper bidirectional coordinate mapping
4. **DPI awareness on Windows** -- SetProcessDpiAwarenessContext call at startup

### Phase 2: Windows Accessibility Tree (Primary Differentiator)
5. **Windows UIA via PowerShell subprocess** -- enumerate focused window elements
6. **screen_elements tool** -- new tool with compact indexed element list
7. **Element ID-based clicking** -- AI references elements by ID
8. **AI prompt update** -- accessibility-first prompting strategy

### Phase 3: Cross-Platform + Hybrid (Complete the Story)
9. **macOS AXUIElement via Swift helper** -- compiled binary subprocess
10. **Linux AT-SPI2 via pyatspi2** -- Python subprocess
11. **Unified cross-platform interface** -- normalize roles and properties
12. **Hybrid mode** -- automatic fallback from accessibility to screenshot coordinates

### Defer
- **Screenshot annotation with element overlays** -- unclear ROI, adds ~150ms per screenshot, high implementation effort
- **OmniParser / vision-based element detection** -- unnecessary when OS accessibility APIs are available
- **Browser DOM inspection** -- separate scope entirely
- **Multi-monitor element enumeration** -- complexity not justified for initial release

## Competitive Landscape

| Product | Approach | Accessibility Tree? | DPI Handling | Cross-Platform |
|---------|----------|-----------------------|--------------|----------------|
| Anthropic computer-use-demo | Screenshot only + coordinate scaling | No | Manual resize recommended | Linux (Docker VM) only |
| OpenAI CUA / Operator | Screenshot (vision) primary | No (vision-only per research) | Not documented | Browser only (Operator) |
| Windows-Use (CursorTouch) | Accessibility tree primary, vision optional | Yes (Windows UIA) | Not documented | Windows only |
| nut.js + element-inspector | Both (programmatic) | Yes (Windows, macOS planned) | Handled by nut.js | Windows (beta), macOS planned |
| OmniParser V2 (Microsoft) | Vision ML model | No (detects from screenshots) | Resolution-dependent | Any (screenshot input) |
| **Livinity v17.0 (target)** | **Hybrid: accessibility first, screenshot fallback** | **Yes (Win/Mac/Linux)** | **Full DPI pipeline fix** | **Windows, macOS, Linux** |

**Livinity's differentiator:** The only cross-platform computer use agent that combines accessibility tree integration with proper DPI-aware screenshot handling AND supports multiple AI providers (Claude + Kimi). Windows-Use only does Windows. Anthropic's reference only does screenshots. OpenAI only does vision. Livinity does all of it.

## Sources

- [Anthropic Computer Use Tool Documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) -- HIGH confidence, official API docs
- [Windows-Use (CursorTouch) GitHub](https://github.com/CursorTouch/Windows-Use) -- MEDIUM confidence, open source implementation
- [nut.js Element Inspector Plugin](https://nutjs.dev/plugins/element-inspector) -- MEDIUM confidence, official docs
- [nut.js Element Inspection Blog](https://nutjs.dev/blog/element-inspection) -- MEDIUM confidence
- [Microsoft UI Automation Overview](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-uiautomationoverview) -- HIGH confidence, official docs
- [Apple AXUIElement Documentation](https://developer.apple.com/documentation/applicationservices/axuielement) -- HIGH confidence, official docs
- [AT-SPI2 Architecture](https://gnome.pages.gitlab.gnome.org/at-spi2-core/devel-docs/architecture.html) -- HIGH confidence, official GNOME docs
- [SetProcessDpiAwarenessContext (Microsoft)](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setprocessdpiawarenesscontext) -- HIGH confidence, official docs
- [sharp Image Processing](https://sharp.pixelplumbing.com/api-resize/) -- HIGH confidence, official docs
- [@bright-fish/node-ui-automation](https://github.com/bright-fish/node-ui-automation) -- LOW confidence, small package, unclear maintenance
- [OmniParser V2 (Microsoft Research)](https://microsoft.github.io/OmniParser/) -- MEDIUM confidence, research project
- [A11y-CUA Dataset (accessibility gap in CUAs)](https://arxiv.org/html/2602.09310) -- MEDIUM confidence, academic paper
- [AXorcist (Swift AX wrapper)](https://github.com/steipete/AXorcist) -- MEDIUM confidence, open source
- [pyatspi2 Examples](https://www.freedesktop.org/wiki/Accessibility/PyAtSpi2Example/) -- MEDIUM confidence, official wiki
