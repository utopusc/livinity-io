# Technology Stack

**Project:** v17.0 Precision Computer Use
**Researched:** 2026-03-25
**Focus:** DPI-aware screenshot pipeline, accessibility tree integration, cross-platform element targeting

## What Already Exists (DO NOT re-add)

| Technology | Purpose | Status |
|------------|---------|--------|
| @jitsi/robotjs ^0.6.21 | Mouse/keyboard automation (6 mouse + 2 keyboard tools) | In use |
| node-screenshots ^0.2.8 | Screen capture (primary + multi-monitor) | In use |
| Electron 33 + electron-builder 25 | Agent packaging (Inno Setup .exe, .dmg, .deb) | In use |
| WebSocket (ws ^8.18) | Agent-relay communication | In use |
| React 18 + Vite + Tailwind 3.4 | Agent setup wizard renderer | In use |

---

## Recommended Stack Additions

### 1. Image Processing -- Screenshot DPI Resize

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| sharp | ^0.34.5 | Resize screenshots from physical to logical pixels before sending to AI | Only reliable way to do server-side image resize in Node.js. Prebuilt binaries for Win/Mac/Linux (x64, arm64). Node-API v9, supports Node.js >=18.17.0 including 22+. 40M+ weekly npm downloads. |

**Why sharp and not alternatives:**

| Alternative | Why Not |
|-------------|---------|
| node-screenshots crop | node-screenshots has no resize API -- only crop, which does not scale pixels |
| ImageMagick via shell | Requires system dependency, not bundled. Anthropic reference impl uses it only because they run in Docker containers with ImageMagick pre-installed |
| Jimp (pure JS) | 10-50x slower than sharp for resize. Unacceptable in screenshot-every-action loop |
| Canvas (node-canvas) | Requires Cairo system dependency. Heavier than sharp for a simple resize |
| Sending full-res + relying on API auto-resize | Anthropic explicitly warns: "Relying on the image resizing behavior in the API will result in lower model accuracy and slower performance than implementing scaling in your tools directly" |

**Electron/electron-builder integration:**

Add to `package.json` build config:
```json
"asarUnpack": [
  "**/node_modules/sharp/**/*",
  "**/node_modules/@img/**/*",
  "**/node_modules/@jitsi/robotjs/**",
  "**/node_modules/node-screenshots/**",
  "**/node_modules/node-screenshots-win32-x64-msvc/**",
  "**/node_modules/node-gyp-build/**"
]
```

Sharp uses `@img/sharp-*` platform-specific prebuilt binaries (e.g., `@img/sharp-win32-x64`). These must be unpacked from ASAR alongside the existing native modules.

**Confidence:** HIGH -- sharp is the de facto standard, Anthropic reference impl does the same resize step, and sharp's Electron integration docs explicitly cover asarUnpack.

---

### 2. Windows Accessibility Tree -- PowerShell + System.Windows.Automation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PowerShell child_process | Built-in | Spawn PowerShell to query Windows UIA tree | Zero dependencies. .NET UIAutomation assembly ships with every Windows installation since Vista. Avoids fragile FFI bindings. |
| System.Windows.Automation (.NET) | Framework 4.x (pre-installed) | AutomationElement.FindAll(), BoundingRectangleProperty, NameProperty, ControlTypeProperty | The actual Windows accessibility API. Available to PowerShell without installing anything. Returns physical-pixel bounding rectangles. |

**Why PowerShell child_process and NOT alternatives:**

| Alternative | Why Not |
|-------------|---------|
| @bright-fish/node-ui-automation (npm) | v0.1.7, last published 3 years ago, 0 weekly downloads. COM/NAPI wrapper is fragile across Node.js versions. Abandoned. |
| node-ffi-napi + UIAutomationClient.dll | FFI to COM interfaces is extremely fragile. Requires exact struct layouts, manual memory management. Breaks across Node.js major versions (ABI changes). |
| nut.js @nut-tree/element-inspector | Paid plugin (requires subscription). Windows-only beta. Adds massive dependency tree (nut.js core + all plugins). License incompatible with our distribution model. |
| @nodert-win10-21h1/windows.ui.uiautomation | WinRT projection, tied to specific Windows 10 SDK version. Does not work on Windows 11 cleanly. |

**PowerShell script approach (spawned via child_process.execSync):**

```powershell
# The agent will ship a .ps1 script that loads UIAutomation and dumps element tree as JSON
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = [System.Windows.Automation.Condition]::TrueCondition
$scope = [System.Windows.Automation.TreeScope]::Children

# Get top-level windows, then drill into focused/active window
$focused = [System.Windows.Automation.AutomationElement]::FocusedElement
$window = # walk up to window ancestor
$elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)

# For each element: Name, ControlType, BoundingRectangle, AutomationId, IsEnabled
# Output as JSON array
```

Key properties extracted per element:
- `Name` -- visible label/text
- `ControlType` -- Button, Edit, ComboBox, MenuItem, etc.
- `BoundingRectangle` -- {X, Y, Width, Height} in physical screen pixels
- `AutomationId` -- programmatic identifier (stable across sessions)
- `IsEnabled` -- whether element is interactive
- `IsOffscreen` -- filter out invisible elements
- Center coordinate computed as `{X + Width/2, Y + Height/2}`

**Performance:** PowerShell startup is ~200-500ms. Acceptable because accessibility tree queries happen once per action cycle (not per-frame). Cache the tree and diff on subsequent calls to detect changes.

**Confidence:** HIGH -- System.Windows.Automation is the official Microsoft accessibility API, ships with Windows, used by all screen readers. The PowerShell approach is used by the precision-desktop MCP project which solves the exact same DPI coordinate problem.

---

### 3. macOS Accessibility Tree -- Swift CLI Helper Binary

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Swift CLI binary (custom) | macOS 13+ | Query AXUIElement tree, output JSON to stdout | macOS accessibility API (ApplicationServices/AXUIElement) is only accessible from Objective-C/Swift. No maintained Node.js binding exists. A small Swift binary (~50KB compiled) spawned via child_process is the only reliable approach. |

**Why a custom Swift binary and NOT alternatives:**

| Alternative | Why Not |
|-------------|---------|
| macos_accessibility_client (npm) | Only checks if app is trusted accessibility client. Does NOT enumerate elements. |
| AXorcist (Swift library) | Full framework, targets macOS 14+, MIT licensed but designed as library not CLI tool. Could be inspiration but is overkill for our JSON-dump use case. |
| AppleScript / osascript | AppleScript accessibility support is limited to System Events scripting. Cannot enumerate arbitrary app UI trees with bounding rects. |
| node-ffi-napi + CoreFoundation | AXUIElement APIs use CFTypes, toll-free bridging, and callback patterns that are extremely difficult to call correctly via FFI. |

**Approach:**

Compile a small Swift CLI (`livinity-ax`) that:
1. Accepts a PID or "focused" as argument
2. Uses AXUIElementCreateApplication() to get the app's accessibility tree
3. Walks children recursively up to depth 10
4. For each element: AXRole, AXTitle, AXDescription, AXPosition, AXSize, AXEnabled, AXSubrole
5. Computes center coordinate from AXPosition + AXSize/2
6. Outputs JSON array to stdout

```swift
// Simplified -- the actual binary will be ~100 lines
import ApplicationServices

func getElements(element: AXUIElement, depth: Int) -> [[String: Any]] {
    var result: [[String: Any]] = []
    // Get AXRole, AXTitle, AXPosition, AXSize
    // Recurse into AXChildren
    return result
}
```

**Requirements:**
- macOS Accessibility permission must be granted (user sees system dialog on first run)
- Binary compiled with `swiftc -O -o livinity-ax main.swift` -- produces ~50KB universal binary
- Ship pre-compiled for arm64 + x86_64 (universal binary via `lipo`)
- Bundle in Electron app's `extraResources`

**Confidence:** MEDIUM -- AXUIElement API is stable and well-documented by Apple. The risk is building/shipping the Swift binary cross-architecture and handling the accessibility permission prompt gracefully. AXorcist project proves this approach works.

---

### 4. Linux Accessibility Tree -- Python + AT-SPI2 via D-Bus

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| python3 + pyatspi2 | System Python 3 | Query AT-SPI2 accessibility tree via D-Bus | pyatspi2 is the standard Python binding for AT-SPI2, pre-installed on GNOME/GTK desktops. AT-SPI2 is the Linux accessibility standard (D-Bus protocol). |

**Why python3/pyatspi2 and NOT alternatives:**

| Alternative | Why Not |
|-------------|---------|
| dbus-next (npm) | Pure JS D-Bus library. Works for simple calls but AT-SPI2 protocol is complex -- object paths per application, custom interfaces, variant types. Would require reimplementing the entire pyatspi2 binding layer. |
| busctl / dbus-send CLI | Can introspect but no convenient tree traversal. Would require dozens of sequential D-Bus calls with complex output parsing. |
| node-dbus (npm) | Native C++ addon, requires system libdbus-dev. Less maintained than dbus-next. |
| nut.js (Linux) | Only supports X11, not Wayland. No accessibility tree support on Linux. |

**Approach:**

Spawn a small Python script via child_process:
```python
#!/usr/bin/env python3
import pyatspi
import json

def get_elements(obj, depth=0, max_depth=8):
    elements = []
    try:
        role = obj.getRoleName()
        name = obj.name
        # Get bounding box via Component interface
        if obj.queryComponent():
            bbox = obj.queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
            elements.append({
                "role": role, "name": name,
                "x": bbox.x, "y": bbox.y,
                "width": bbox.width, "height": bbox.height,
                "centerX": bbox.x + bbox.width // 2,
                "centerY": bbox.y + bbox.height // 2,
            })
        if depth < max_depth:
            for child in obj:
                elements.extend(get_elements(child, depth + 1, max_depth))
    except:
        pass
    return elements

# Get focused application
desktop = pyatspi.Registry.getDesktop(0)
# ... find active window, dump elements as JSON
print(json.dumps(elements))
```

**Caveats:**
- pyatspi2 may not be installed on non-GNOME desktops (KDE Plasma, XFCE)
- Wayland support in AT-SPI2 is improving but not universal
- Fallback: if pyatspi2 unavailable, degrade gracefully to screenshot-only mode
- AT-SPI2 daemon (at-spi2-registryd) must be running

**Confidence:** MEDIUM -- AT-SPI2 is the Linux standard but ecosystem fragmentation (GNOME vs KDE vs minimal WMs) means this will not work everywhere. Acceptable for v17.0 since Linux desktop users are a small minority and screenshot-only fallback exists.

---

### 5. DPI Awareness -- Windows API Call at Startup

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Windows manifest / ffi call | Win10 1703+ | SetProcessDpiAwarenessContext(PerMonitorAwareV2) | Without this, Windows lies about coordinates -- GetWindowRect returns logical pixels, screenshots may be auto-scaled by DWM. Setting DPI awareness ensures consistent physical-pixel coordinates from all APIs. |

**Implementation:**

Electron already handles DPI awareness for the renderer. For the main process (where robotjs and node-screenshots run), we need to ensure the process is PerMonitorAwareV2. This is typically set via:

1. **Electron app.manifest** -- Electron 33 should already declare DPI awareness, but verify
2. **Fallback**: Use a small native addon or child_process call to `SetProcessDpiAwarenessContext`

**What node-screenshots returns:**
- `Monitor.width()` and `Monitor.height()` return the **physical pixel dimensions** of the capture
- `Monitor.scaleFactor()` returns the DPI scale (e.g., 1.5 for 150%)
- The captured image is in physical pixels (full resolution)
- `@jitsi/robotjs` moveMouse() operates in **logical pixels** on Windows

This is the root cause of the v15.0 coordinate mismatch: screenshots are 2560x1440 physical pixels, but robotjs expects logical coordinates like 1707x960 (at 150% scaling).

**The fix (no new dependency needed):**

```typescript
// In toolScreenshot():
const physicalW = primary.width();    // e.g., 2560
const physicalH = primary.height();   // e.g., 1440
const scaleFactor = primary.scaleFactor(); // e.g., 1.5
const logicalW = Math.round(physicalW / scaleFactor);  // 1707
const logicalH = Math.round(physicalH / scaleFactor);  // 960

// Use sharp to resize screenshot from physicalW x physicalH to targetW x targetH
// where target is one of the Anthropic recommended resolutions
```

**Confidence:** HIGH -- the DPI mismatch is a well-understood problem. The precision-desktop MCP project documents the exact same issue and solution.

---

## Screenshot Pipeline (End-to-End)

This is the critical fix. Current pipeline is broken; proposed pipeline:

### Current (Broken)

```
1. node-screenshots captures: 2560x1440 (physical pixels)
2. No resize (node-screenshots has no resize API)
3. Send full-res JPEG to AI with metadata saying "1280x800"
4. AI returns coordinates in 1280x800 space
5. toScreenX divides by (1280/2560 = 0.5) -- gets 2x physical coords
6. robotjs.moveMouse() expects LOGICAL coords (1707x960 at 150%)
7. MISMATCH: we send physical-space coords to a logical-space API
```

### Proposed (Fixed)

```
1. node-screenshots captures: 2560x1440 (physical pixels)
2. Get scaleFactor: 1.5
3. Compute logical resolution: 1707x960
4. Find best Anthropic target by aspect ratio: 1366x768 (FWXGA)
5. sharp.resize(1366, 768, { fit: 'fill' }) -- actual pixel resize
6. Send resized JPEG to AI with display_width=1366, display_height=768
7. AI returns coordinates in 1366x768 space
8. Scale to logical: x * (1707/1366), y * (960/768)
9. robotjs.moveMouse(logicalX, logicalY) -- correct coordinate space
```

### Required Libraries for Pipeline

| Step | Library | New? |
|------|---------|------|
| Capture | node-screenshots | Existing |
| Scale factor | node-screenshots scaleFactor() | Existing (unused) |
| Resize | sharp | NEW |
| Encode JPEG | sharp (.jpeg()) | NEW |
| Click | @jitsi/robotjs | Existing |

---

## Unified screen_elements Tool Interface

All three platform backends (PowerShell, Swift CLI, Python script) output the same JSON schema:

```typescript
interface ScreenElement {
  role: string;         // "Button", "Edit", "MenuItem", etc.
  name: string;         // Visible label text
  automationId?: string; // Programmatic ID (Windows only, stable)
  x: number;            // Top-left X (physical pixels)
  y: number;            // Top-left Y (physical pixels)
  width: number;        // Element width
  height: number;       // Element height
  centerX: number;      // Center X for clicking
  centerY: number;      // Center Y for clicking
  enabled: boolean;     // Whether interactive
  children?: ScreenElement[]; // Nested elements (optional, depth-limited)
}

interface ScreenElementsResult {
  elements: ScreenElement[];
  windowTitle: string;
  windowBounds: { x: number; y: number; width: number; height: number };
  platform: 'win32' | 'darwin' | 'linux';
  timestamp: number;
  cached: boolean;     // Whether this is a cached result (tree unchanged)
}
```

---

## What NOT to Add

| Technology | Why NOT |
|-------------|---------|
| nut.js | Paid subscription for element-inspector plugin. Replaces robotjs (which already works). Massive dependency. |
| Puppeteer / Playwright | Browser-only accessibility. We need desktop-wide element targeting. |
| OpenCV / template matching | Over-engineered for element location when accessibility tree gives exact coordinates. |
| node-ffi-napi | Fragile ABI, breaks across Node.js versions, painful COM/ObjC bridging. |
| @anthropic-ai computer_use tool type | We implement our own computer use tools, not Anthropic's built-in tool format. Our tools work with both Claude AND Kimi providers. |
| Tesseract OCR | Accessibility tree gives text labels directly. OCR is slower, less accurate, and adds a 30MB+ dependency. |
| xdotool / wmctrl (Linux) | Window management, not accessibility tree. Does not give element hierarchy or bounding rects. |

---

## Installation

### New Dependencies (agent-app/package.json)

```bash
# Production dependency
npm install sharp

# No other new npm packages needed
# PowerShell script, Swift binary, and Python script are bundled as assets
```

### Electron Builder Config Update

```json
{
  "build": {
    "asarUnpack": [
      "**/node_modules/@jitsi/robotjs/**",
      "**/node_modules/node-screenshots/**",
      "**/node_modules/node-screenshots-win32-x64-msvc/**",
      "**/node_modules/node-gyp-build/**",
      "**/node_modules/sharp/**/*",
      "**/node_modules/@img/**/*"
    ],
    "extraResources": [
      { "from": "scripts/", "to": "scripts/" }
    ]
  }
}
```

The `scripts/` directory contains:
- `get-elements.ps1` -- Windows PowerShell UIA script
- `livinity-ax` -- macOS Swift binary (universal arm64+x86_64)
- `get-elements.py` -- Linux pyatspi2 script

### Platform-Specific Requirements

| Platform | Pre-installed | User Action Needed |
|----------|--------------|-------------------|
| Windows | PowerShell 5.1+, .NET Framework 4.x (UIAutomation) | None |
| macOS | Swift runtime, ApplicationServices framework | Grant Accessibility permission on first run (system dialog) |
| Linux | Python 3 (most distros) | Install pyatspi2 if not present: `sudo apt install python3-pyatspi` |

---

## Sources

- [Anthropic Computer Use Tool Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) -- display_width_px/display_height_px API, scaling recommendations (HIGH confidence)
- [Anthropic Reference Implementation - computer.py](https://github.com/anthropics/anthropic-quickstarts/blob/main/computer-use-demo/computer_use_demo/tools/computer.py) -- MAX_SCALING_TARGETS, scale_coordinates() function (HIGH confidence)
- [sharp Documentation](https://sharp.pixelplumbing.com/) -- v0.34.5, resize API, Electron asarUnpack config (HIGH confidence)
- [sharp Electron Install Guide](https://sharp.pixelplumbing.com/install/) -- asarUnpack for @img/* prebuilds (HIGH confidence)
- [Microsoft UI Automation Overview](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-uiautomationoverview) -- AutomationElement, FindAll, BoundingRectangle (HIGH confidence)
- [Microsoft .NET UIAutomation](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/obtaining-ui-automation-elements) -- PowerShell integration pattern (HIGH confidence)
- [precision-desktop MCP](https://github.com/ikoskela/precision-desktop) -- Validates PowerShell + UIAutomation approach for DPI coordinate fixing (MEDIUM confidence)
- [Apple AXUIElement Docs](https://developer.apple.com/documentation/applicationservices/axuielement) -- macOS accessibility API (HIGH confidence)
- [AXorcist Swift Wrapper](https://github.com/steipete/AXorcist) -- Proves Swift CLI approach for AX tree enumeration (MEDIUM confidence)
- [AT-SPI2 D-Bus Protocol](https://www.freedesktop.org/wiki/Accessibility/AT-SPI2/) -- Linux accessibility standard (HIGH confidence)
- [dbus-next npm](https://github.com/dbusjs/node-dbus-next) -- Evaluated and rejected for AT-SPI2 (LOW confidence for our use case)
- [node-screenshots GitHub](https://github.com/nashaofu/node-screenshots) -- scaleFactor() API, physical pixel capture behavior (MEDIUM confidence -- docs unclear on pixel semantics, needs empirical verification)
- [Windows DPI Awareness](https://learn.microsoft.com/en-us/windows/win32/hidpi/setting-the-default-dpi-awareness-for-a-process) -- PerMonitorAwareV2 (HIGH confidence)
