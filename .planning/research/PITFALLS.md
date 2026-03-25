# Pitfalls Research: Precision Computer Use (v17.0)

**Domain:** DPI-aware screenshot pipeline, accessibility tree integration, cross-platform element targeting
**Researched:** 2026-03-25
**Confidence:** HIGH (based on existing codebase analysis + verified documentation)

## Critical Pitfalls

### Pitfall 1: node-screenshots Returns Physical Pixels But robotjs Expects Logical Pixels

**What goes wrong:**
The existing code captures screenshots via `node-screenshots` where `primary.width()` and `primary.height()` return **physical pixel dimensions** (e.g., 3840x2160 on a 4K monitor at 200% scaling). However, `@jitsi/robotjs.moveMouse(x, y)` operates in **logical/DPI-scaled coordinates** (e.g., 1920x1080 at 200% scaling). The current `toScreenX`/`toScreenY` methods attempt to compensate by dividing by a scale factor derived from comparing capture resolution to an Anthropic target resolution (1280x800, etc.), but this conflates two independent scaling operations: (1) DPI physical-to-logical conversion and (2) AI image resize for token efficiency. These are two completely different transforms and must not be mixed.

**Why it happens:**
The original code assumed a single scale factor could handle both "make screenshot smaller for AI" and "map AI coords back to screen coords." On 100% DPI monitors these happen to be the same transform, masking the bug. On any non-100% DPI display, coordinates diverge because physical pixels != logical pixels.

**How to avoid:**
Separate the two transforms explicitly:
1. **DPI transform** (physical to logical): `logicalX = physicalX / scaleFactor`. Use `primary.scaleFactor()` from node-screenshots. This converts capture pixels to the coordinate system robotjs uses.
2. **AI resize transform**: Resize the screenshot image (using sharp) from physical resolution to a target resolution (e.g., 1280x800). Store the ratio `aiScale = targetW / physicalW`. When AI returns coordinates in AI-image space, reverse: `physicalX = aiCoordX / aiScale`, then apply DPI transform to get logical coords for robotjs.

The full chain is: `robotjsX = (aiX / aiScale) / scaleFactor` or equivalently `robotjsX = aiX * physicalW / (targetW * scaleFactor)`.

**Warning signs:**
- Clicks land offset from target on non-100% DPI monitors
- Clicks work perfectly at 100% scaling but miss at 125%/150%/200%
- Clicks are "close but not quite" (off by a consistent factor)
- `captureW` in screenshot data matches physical pixels, not the logical resolution you see in Windows Display Settings

**Phase to address:**
Phase 1 (DPI fix) -- this is the root cause of the existing bug and must be fixed before anything else.

---

### Pitfall 2: node-screenshots Cannot Resize Images (sharp Bundling in Electron/SEA)

**What goes wrong:**
The current code has a revealing comment: "node-screenshots doesn't have resize -- use crop at full then encode smaller via quality / Actually crop doesn't resize. We'll send full res but tell AI the target dimensions." This means the agent currently sends **full physical-resolution** screenshots (potentially 3840x2160 JPEG = 500KB-2MB) to the AI and merely *tells* the AI what dimensions to imagine. The AI sees whatever the API auto-resizes to, creating an unpredictable third coordinate space. Adding sharp for proper resize introduces a native module (libvips) that must be bundled alongside the Electron app and its existing native modules (robotjs, node-screenshots).

**Why it happens:**
sharp depends on platform-specific prebuilt libvips binaries. In Electron builds, sharp must be unpacked from ASAR (`asarUnpack`). The current `package.json` already unpacks `@jitsi/robotjs` and `node-screenshots` but sharp requires its own platform-specific handling. If sharp binaries are not properly unpacked or if the wrong platform binary ships, the resize silently fails or crashes at runtime.

**How to avoid:**
1. Add sharp to `asarUnpack` in electron-builder config: `"node_modules/sharp/**"`, `"node_modules/@img/sharp-*/**"` (sharp v0.33+ uses `@img/sharp-{platform}-{arch}` scoped packages).
2. Test the build artifact on a clean machine (not dev machine) -- missing DLLs only manifest on machines without build tools.
3. Consider using sharp's `sharp.resize(width, height).jpeg({quality: 80})` pipeline to produce correctly-sized images before encoding to base64.
4. Fallback: if sharp fails to load at runtime, send full-res with a warning log, so the agent doesn't crash entirely.

**Warning signs:**
- `Error: Could not load the "sharp" module` in production builds
- `libvips` not found errors on clean installs
- Screenshot file sizes are 1-3MB (indicates no resize happened)
- Coordinate offsets that vary between screenshots (API auto-resize is not deterministic per provider)

**Phase to address:**
Phase 1 (screenshot pipeline fix) -- required to establish a known, deterministic coordinate space.

---

### Pitfall 3: PowerShell-Based Windows UIA Is Unacceptably Slow for Real-Time Use

**What goes wrong:**
Spawning PowerShell to query the Windows UI Automation tree via .NET's `System.Windows.Automation` namespace adds 1-3 seconds of overhead per call. PowerShell cold start on Windows is ~500ms-2s. Even with a warm PowerShell process, marshaling a full accessibility tree through stdout as JSON adds significant latency. Since the AI agent calls `screen_elements` before each action in the screenshot-analyze-act loop, this makes each iteration 2-5x slower, destroying the user experience during live monitoring.

**Why it happens:**
PowerShell is a convenient "no compilation needed" bridge to .NET/COM, but it was never designed for high-frequency programmatic calls from Node.js. Each `child_process.spawn('powershell', [...])` incurs: process creation overhead, .NET CLR startup, assembly loading, COM interop initialization, tree walking, JSON serialization, stdout buffering, and process cleanup.

**How to avoid:**
Use one of these approaches (in order of preference):
1. **Persistent PowerShell process**: Spawn one PowerShell instance at agent startup, keep stdin/stdout open, send commands as newline-delimited scripts, read JSON responses. Eliminates cold-start overhead. Reduces per-call cost to ~100-300ms.
2. **Native C++ addon** (`@bright-fish/node-ui-automation` or custom NAPI addon): Direct COM calls from Node.js via a prebuilt `.node` binary. Fastest option (~10-50ms per tree query) but adds a native module to bundle.
3. **C# helper binary**: A small compiled .exe that runs as a persistent subprocess (like the PowerShell approach but without PowerShell overhead). Can be compiled to self-contained single-file with `dotnet publish`.
4. **Avoid calling accessibility tree every iteration**: Cache the tree and only re-query when the AI requests it or when a certain time has elapsed (see Pitfall 8).

**Warning signs:**
- `screen_elements` tool takes >500ms consistently
- Live monitoring shows long pauses between actions
- User sees "thinking..." for seconds between each click
- CPU spikes on every `screen_elements` call (PowerShell + conhost.exe appearing in Task Manager)

**Phase to address:**
Phase 2 (Windows UIA) -- critical architecture decision that must be made before implementation starts.

---

### Pitfall 4: macOS Accessibility Permission Gate (TCC) Blocks Agent Silently

**What goes wrong:**
On macOS, accessing the accessibility tree via `AXUIElement` APIs requires explicit user permission through the TCC (Transparency, Consent, and Control) framework. The permission dialog only appears once, and if the user denies it (or doesn't understand it), all accessibility calls silently return empty/null results. Worse: if the app is sandboxed, the permission prompt **never appears** and `AXIsProcessTrusted()` always returns `false`. Additionally, after macOS updates, TCC permissions can be reset, breaking previously working agents.

**Why it happens:**
Apple designed TCC to prevent programmatic access to accessibility without explicit consent. There is no supported way to programmatically add your app to the trusted list. The agent binary (whether Electron app or SEA) must be properly code-signed for TCC to even offer the permission dialog. Unsigned binaries get blocked without any prompt.

**How to avoid:**
1. **Code-sign the macOS agent binary** (already planned for .dmg distribution). Use a Developer ID certificate, not ad-hoc signing.
2. **Check `AXIsProcessTrusted()` at startup** and display a clear in-app message guiding the user to System Settings > Privacy & Security > Accessibility if permission is missing.
3. **Implement graceful degradation**: If accessibility is unavailable, fall back to screenshot-only computer use (current v15.0 behavior). Never crash or stall.
4. **Test on fresh macOS installations**: TCC state is per-app, per-user. Dev machines always have permissions granted.
5. **Handle the Electron case**: If the agent is an Electron app, note that Electron's Info.plist must declare `NSAccessibilityUsageDescription`. Without it, the TCC dialog may not appear even for non-sandboxed apps.

**Warning signs:**
- `screen_elements` returns empty array on macOS but works on Windows
- "Permission denied" errors in macOS Console.app but no error in agent logs
- Works on developer's Mac but fails on user's Mac
- Agent worked before macOS update, stops after

**Phase to address:**
Phase 3 (macOS accessibility) -- must include permission detection and user guidance as part of the implementation, not as an afterthought.

---

### Pitfall 5: Mixed DPI Multi-Monitor Coordinate Discontinuity

**What goes wrong:**
When a user has multiple monitors with different DPI scale factors (e.g., laptop at 150% + external at 100%), the logical coordinate space has **discontinuities at monitor boundaries**. A point at physical (3840, 500) on Monitor 2 might map to logical (1920, 500) if Monitor 2 is at 100%, but the same X coordinate on Monitor 1 at 150% would map differently. The agent currently only captures and targets the primary monitor, but if the user moves a window to a secondary monitor with different DPI, all coordinates break. Even `node-screenshots`'s `Monitor.all()` returns each monitor's own scale factor, but the coordinate offsets (`m.x()`, `m.y()`) may be in either physical or logical space depending on the process's DPI awareness mode.

**Why it happens:**
Windows DPI awareness has three modes: unaware (everything scaled to 96 DPI), system-aware (one DPI for all monitors), and per-monitor-aware (each monitor has its own DPI). Node.js/Electron processes default to "system DPI aware" unless the manifest declares PerMonitorAwareV2. In system-aware mode, coordinates for secondary monitors with different DPI are silently re-scaled by Windows, creating invisible coordinate drift.

**How to avoid:**
1. **Set DPI awareness at process startup** via app manifest (not API call). For Electron, this is in the `.exe` manifest. For SEA builds, the manifest must be embedded in the binary. Use `<dpiAwareness>PerMonitorV2,PerMonitor</dpiAwareness>`.
2. **For v17.0, scope to primary monitor only** and document this limitation. Multi-monitor DPI support is significantly harder and should be a separate milestone.
3. **Always store and report which monitor** a screenshot came from, including that monitor's specific scale factor.
4. **Validate coordinates against monitor bounds** before passing to robotjs: if `x > logicalWidth` or `y > logicalHeight`, clamp or reject the action with an error rather than clicking in the wrong place.

**Warning signs:**
- Clicks land correctly on the primary monitor but are offset on secondary monitors
- Moving a window between monitors causes coordinate mismatch
- `screen_info` reports different scale factors per monitor
- Agent works fine on single-monitor setups but fails on multi-monitor

**Phase to address:**
Phase 1 (DPI fix) -- establish single-monitor correctness first, document multi-monitor as out-of-scope for v17.0.

---

### Pitfall 6: Accessibility Tree Overwhelms AI Context Window

**What goes wrong:**
A typical desktop application's accessibility tree can contain 500-5000+ elements. A full tree dump as JSON easily reaches 50-200KB of text, consuming 10,000-50,000 tokens per call. If the agent sends the full tree every iteration of the screenshot-analyze-act loop, token costs explode and response latency increases significantly. Research shows that 51-79% of accessibility tree tokens are wasted on non-interactive or irrelevant elements.

**Why it happens:**
The natural approach is to walk the entire tree and return everything. Developers assume the AI will "just pick out what matters." But LLMs process tokens linearly; larger contexts mean slower responses and higher costs. Additionally, the tree contains decorative elements, hidden items, offscreen content, and structural containers that provide no actionable information.

**How to avoid:**
1. **Filter aggressively**: Only return interactive elements (buttons, links, text fields, checkboxes, menu items, tabs, sliders). Skip static text, decorative images, layout containers.
2. **Limit tree depth**: Walk 3-4 levels deep maximum. Deep nesting rarely contains actionable elements.
3. **Include only essential properties**: `role`, `name`, `value`, `bounds` (x, y, width, height), `enabled`, `focused`. Skip `description`, `help`, verbose state flags.
4. **Return center coordinates pre-calculated**: Instead of bounds, give the AI a single `(x, y)` click target per element. This is what the AI needs -- it does not need to calculate centers from bounds.
5. **Cap element count**: Return top 50-100 elements maximum. If more exist, filter by visibility and proximity to current focus.
6. **Diff-based updates**: If the tree hasn't changed since last query, return `{"unchanged": true}` and save tokens entirely.

**Warning signs:**
- `screen_elements` tool response exceeds 5000 tokens
- AI responses become noticeably slower when `screen_elements` is in context
- Token usage per agent loop iteration doubles or triples
- AI starts hallucinating element names because the context is too noisy

**Phase to address:**
Phase 2 (Windows UIA, first platform) -- establish the filtering strategy on Windows, then apply the same approach to macOS and Linux.

---

### Pitfall 7: Accessibility Tree Coordinates Are in a Different Space Than Screenshot Coordinates

**What goes wrong:**
Accessibility tree element bounds (from UIA, AXUIElement, or AT-SPI2) are reported in **logical screen coordinates** (DPI-scaled). Screenshot images captured by node-screenshots are in **physical pixel coordinates**. If the `screen_elements` tool returns element `(x: 960, y: 540)` (logical) but the screenshot shows the element at pixel `(1920, 1080)` (physical, at 200% DPI), the AI gets confused -- it sees the element at one position in the screenshot but the accessibility tree says it's at a different position. If the AI uses accessibility coordinates for clicking (correct) but screenshot coordinates for visual verification, the mismatch causes the agent to think clicks failed.

**Why it happens:**
Each data source uses its own coordinate system, and developers forget to normalize. The accessibility tree and the robotjs click target should both be in logical coordinates, but the screenshot image is in whatever resolution it was captured/resized at. Without explicit documentation in the tool response about which coordinate space each value uses, the AI has no way to reconcile them.

**How to avoid:**
1. **Standardize on one coordinate space for all AI-facing data**: Use the AI-image coordinate space (e.g., 1280x800 after resize). Convert accessibility tree bounds to this space before returning them.
2. **Conversion formula for accessibility coords to AI-image coords**: `aiX = logicalX * scaleFactor * aiScale` where `aiScale = targetW / physicalW` and `scaleFactor = physicalW / logicalW`.
3. **Or simpler**: Have `screen_elements` return coordinates in logical space and have the AI use those directly for click actions (since robotjs uses logical coords). Then the screenshot is purely visual context with no coordinate significance.
4. **Document the coordinate space** in each tool's response: "Coordinates are in logical screen space. Use these values directly with mouse_click."
5. **Annotate screenshots** with element overlays (bounding boxes) so the AI can visually verify that accessibility coordinates align with what it sees.

**Warning signs:**
- AI says "I see button X at (400, 300) in the screenshot but screen_elements says it's at (800, 600)"
- AI consistently clicks at wrong positions when using accessibility coordinates
- Coordinates align at 100% DPI but diverge at other scale factors
- AI starts ignoring accessibility data and falling back to screenshot-only targeting

**Phase to address:**
Phase 2 (first accessibility integration) -- the coordinate space decision must be made explicitly and documented in tool schemas before implementation.

---

### Pitfall 8: Stale Accessibility Tree After UI State Changes

**What goes wrong:**
The accessibility tree is a snapshot -- it represents the UI at the moment it was queried. If the AI queries `screen_elements`, gets a list of buttons, clicks one, and then a dialog appears or the page navigates, the cached tree is stale. If the AI re-uses stale element references for the next action, it clicks on elements that no longer exist or have moved. This is especially problematic with: modal dialogs (overlay changes the tree entirely), dropdown menus (ephemeral, disappear after click), tab switching (content changes), scrolling (elements move or become offscreen).

**Why it happens:**
Developers assume the tree is "live" or that element IDs are stable across queries. But desktop accessibility trees are inherently dynamic. UIA runtime IDs change when elements are recreated. AXUIElement references can become invalid. The AI has no way to know the tree is stale unless told.

**How to avoid:**
1. **Always re-query after any action that changes UI state**: After mouse_click, keyboard_type, or keyboard_press, mark the cached tree as stale.
2. **Add a `treeAge` field** to `screen_elements` response indicating how many milliseconds ago the tree was queried.
3. **Short TTL on cached trees**: Maximum 2 seconds. After that, force re-query.
4. **Return a hash of the tree**: If the AI calls `screen_elements` and the hash matches the previous call, return `{"unchanged": true, "hash": "..."}` to save tokens. If different, return the full tree.
5. **Instruct the AI in the system prompt**: "After any click or keyboard action, the screen_elements data is stale. Re-query screen_elements before your next action if you need element targeting."

**Warning signs:**
- AI clicks on elements that "should be there" but aren't (dialog closed, menu collapsed)
- AI reports success but the expected UI change didn't happen
- Agent loop stalls because the AI keeps targeting non-existent elements
- Element coordinates from tree are valid positions but wrong elements are at those positions

**Phase to address:**
Phase 2 (accessibility integration) -- cache invalidation strategy must be part of the initial design.

---

### Pitfall 9: Linux AT-SPI2 Availability Is Not Guaranteed

**What goes wrong:**
Unlike Windows UIA (always present) and macOS Accessibility API (always present), Linux AT-SPI2 depends on: (1) the `at-spi2-core` package being installed, (2) the `org.a11y.Bus` D-Bus service running, (3) applications opting in to AT-SPI2 support (GTK/Qt apps do by default, but many others don't). On minimal Linux installations, headless servers, or non-GNOME desktops, AT-SPI2 may be absent, non-functional, or return empty trees. Additionally, Wayland compositors handle AT-SPI2 differently than X11 -- the bus address discovery mechanism differs.

**Why it happens:**
Linux desktop accessibility is fragmented. GNOME invests heavily in AT-SPI2, but KDE, XFCE, and tiling window managers have varying levels of support. Electron apps themselves don't always expose AT-SPI2 by default (requires `--force-renderer-accessibility` flag). Server-style Linux (Ubuntu Server, headless) typically has no accessibility infrastructure at all.

**How to avoid:**
1. **Detect AT-SPI2 availability at startup**: Try to connect to `org.a11y.Bus` on D-Bus. If it fails, log a warning and disable the `screen_elements` tool for Linux.
2. **Make AT-SPI2 entirely optional on Linux**: The agent must work without it. Screenshot-only computer use (current v15.0 behavior) is the fallback.
3. **Document minimum requirements**: "For best results on Linux, install `at-spi2-core` and use a GNOME or KDE desktop."
4. **Handle Wayland vs X11 gracefully**: On Wayland, check for `AT_SPI_BUS` property on the XWayland root window as a fallback discovery mechanism.
5. **Lower priority**: Linux accessibility is the least mature of the three platforms. Implement it last, with the most conservative expectations.

**Warning signs:**
- `screen_elements` returns empty array on Linux
- D-Bus errors in agent logs: `org.freedesktop.DBus.Error.ServiceUnknown`
- Works on developer's Ubuntu GNOME but fails on user's Arch/KDE/i3 setup
- Agent crashes when AT-SPI2 D-Bus timeout occurs

**Phase to address:**
Phase 4 (Linux accessibility) -- implement last, with graceful degradation as the default.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| PowerShell for UIA instead of native addon | No compilation, quick to prototype | 1-3s per tree query, unacceptable for real-time use | Never for production. OK for a 1-day spike/proof-of-concept only |
| Sending full-res screenshots without sharp resize | No sharp dependency to bundle | Unpredictable API auto-resize creates unknown coordinate space, wastes bandwidth | Never -- this is the current bug |
| Hardcoding primary monitor only | Simpler coordinate math | Multi-monitor users can't use computer use on secondary display | Acceptable for v17.0 MVP if documented |
| Returning full unfiltered accessibility tree | Easier implementation | Token explosion, slow AI responses, higher costs | Only for initial prototype testing; filter before any user-facing release |
| Caching accessibility tree indefinitely | Fewer UIA/AX calls | Stale data causes misclicks and action failures | Never. 2-second max TTL with action-based invalidation |
| Using logical coordinates everywhere without documenting which space | "It just works on my machine" | Breaks on any non-100% DPI display, confusing debugging | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| sharp in Electron | Not adding to `asarUnpack`, wrong platform binary ships | Add `"node_modules/sharp/**"` and `"node_modules/@img/sharp-*/**"` to `asarUnpack`. Test on clean machine |
| node-screenshots `width()`/`height()` | Assuming these return logical dimensions | These return **physical pixels**. Divide by `scaleFactor()` to get logical dimensions |
| robotjs `moveMouse(x, y)` | Passing physical pixel coordinates | robotjs expects **logical coordinates**. Must convert from physical: `logicalX = physicalX / scaleFactor` |
| Windows UIA element bounds | Assuming bounds are in physical pixels | UIA returns bounds in **logical (DPI-scaled) screen coordinates**. No conversion needed for robotjs |
| macOS AXUIElement position | Assuming standard Cartesian coordinates | macOS accessibility uses **top-left origin** screen coordinates (not bottom-left like some macOS APIs). Also returns logical points (not Retina pixels) |
| macOS AXUIElement on secondary monitor | Assuming all coordinates are positive | Secondary monitors can have **negative Y coordinates** (e.g., y=-1080 for a monitor above the primary) |
| Linux AT-SPI2 bounds | Assuming AT-SPI2 is always available | Must check D-Bus connectivity first. Many Linux setups lack AT-SPI2 entirely |
| AI coordinate handoff | Mixing coordinate spaces between tools | Document in every tool response which coordinate space is used. Standardize on one space |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| PowerShell spawn per UIA call | 1-3s latency per `screen_elements` | Persistent PowerShell subprocess or native addon | Immediately -- even first call is too slow |
| Full accessibility tree serialization | 50-200KB JSON per query, 10-50K tokens | Filter to interactive elements only, cap at 50-100 elements | First use on a complex app (e.g., VS Code has 2000+ elements) |
| Sharp resize on every screenshot | 100-300ms added per screenshot | Resize only when dimensions actually changed, use sharp pipeline (stream, not sync) | With rapid screenshot frequency (>2/sec) |
| Uncompressed base64 screenshots | 1-3MB per screenshot over WebSocket | JPEG quality 70-80, resize to target resolution, report actual encoded size | When relay or LivOS is on slower network |
| D-Bus round-trips for Linux AT-SPI2 | Each element property requires separate D-Bus call | Use `GetTree()` to bulk-fetch, then filter locally | More than ~200 elements in the tree |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Running accessibility tree queries as elevated process | UIA/AX can read sensitive UI content (passwords in text fields, private messages) | Filter out password fields (`role: "password"`) from tree output. Never expose `value` for password-type elements |
| Exposing full accessibility tree to AI without sanitization | AI could read banking details, health records, or other sensitive data visible on screen | Apply a sensitivity filter: skip elements in windows matching known sensitive apps, or redact `value` fields |
| Accessibility permission escalation on macOS | Granting accessibility permission gives the process ability to control the entire OS | Document that the agent inherits the user's permissions. UI consent dialog at agent install is critical |
| Sharp processing of malicious image data | Crafted screenshot data could exploit libvips vulnerabilities | Keep sharp updated. Screenshots are self-generated (not user-supplied), so risk is low but not zero |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent failure when accessibility unavailable | User sees AI clicking randomly (screenshot-only fallback) with no explanation | Show status indicator: "Accessibility: Active" / "Accessibility: Unavailable (screenshot-only mode)" in live monitoring UI |
| macOS permission prompt with no guidance | User sees system dialog, doesn't understand why, denies it | Pre-flight check at agent startup shows in-app guide with screenshots of System Settings before the OS prompt fires |
| Slow `screen_elements` stalls live monitoring | Action timeline freezes while waiting for tree query | Show "Querying UI elements..." spinner in monitoring UI. Set 3s timeout, fall back to screenshot-only if exceeded |
| AI switches between accessibility and screenshot targeting unpredictably | Clicks sometimes precise, sometimes off, confusing the user | Make the targeting mode visible in action timeline: "[Accessibility] Clicked button 'Save'" vs "[Screenshot] Clicked at (450, 320)" |
| Agent start-up delay for PowerShell warm-up | 2-3s delay before first action while PowerShell/UIA initializes | Pre-warm the accessibility backend at agent connection time, not at first use. Show loading state |

## "Looks Done But Isn't" Checklist

- [ ] **DPI fix:** Test on 100%, 125%, 150%, 200%, and 175% (fractional) scaling -- fractional scaling is the hardest case and is commonly missed
- [ ] **Screenshot resize:** Verify actual JPEG file size is <300KB after resize (if still >500KB, resize isn't working)
- [ ] **Screenshot resize:** Verify the image dimensions in the base64 data match `displayWidth`/`displayHeight` metadata (currently they do NOT match)
- [ ] **Coordinate chain:** Click the exact center of a known button at 150% DPI. Measure the pixel offset between intended and actual click position. Must be <5px
- [ ] **Windows UIA:** Test on a complex app (VS Code, Chrome, File Explorer) -- simple apps like Notepad have trivial trees that hide filtering problems
- [ ] **Windows UIA performance:** `screen_elements` must complete in <500ms. If >1s, the architecture is wrong
- [ ] **macOS TCC:** Test on a fresh macOS user account that has never granted accessibility permission. Verify the agent prompts correctly
- [ ] **macOS TCC reset:** Revoke permission in System Settings, restart agent, verify graceful degradation (not crash)
- [ ] **Linux AT-SPI2:** Test on a minimal Ubuntu install without GNOME Accessibility enabled. Verify fallback to screenshot-only
- [ ] **Tree filtering:** Query `screen_elements` on a complex web page in Chrome. Count returned elements. Must be <100. If >200, filtering is too loose
- [ ] **Coordinate space documentation:** Every tool response that contains coordinates must explicitly state which coordinate space (logical, physical, or AI-image)
- [ ] **Stale tree:** Open a dialog, query `screen_elements`, close the dialog, query again. Second response must NOT contain the dialog's elements
- [ ] **Multi-monitor:** With two monitors at different DPI, verify agent reports correct primary monitor dimensions and does not attempt to target secondary monitor

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| DPI coordinate mismatch shipped to users | LOW | Fix the conversion formula, ship update. No data loss, no state corruption. Users just experienced misclicks |
| sharp bundling broken in release build | LOW | Add sharp to asarUnpack, rebuild, re-release. Fallback: send full-res screenshots (current behavior) |
| PowerShell UIA too slow, already integrated | MEDIUM | Must rewrite to persistent subprocess or native addon. If PowerShell approach is deep in the code, refactoring costs 2-3 days |
| AI receiving unfiltered trees, established patterns | MEDIUM | Add filtering layer between UIA query and AI response. Must update AI system prompt to match new format. May break existing prompt tuning |
| macOS app not code-signed, TCC broken | HIGH | Requires Apple Developer certificate ($99/yr), re-signing all binaries, new .dmg build, update to download page. Cannot be hotfixed |
| Accessibility tree coordinates in wrong space, shipped | MEDIUM | Fix conversion, but also must update AI system prompt, re-test all prompt engineering. Accumulated AI behavior from wrong data is hard to undo |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Physical vs logical pixel mismatch | Phase 1: DPI Fix | Click test at 150% DPI, measure offset <5px |
| node-screenshots can't resize (sharp bundling) | Phase 1: Screenshot Pipeline | Verify JPEG <300KB, dimensions match metadata |
| PowerShell UIA too slow | Phase 2: Windows UIA | `screen_elements` <500ms on VS Code |
| macOS TCC permission blocking | Phase 3: macOS AXUIElement | Test on fresh macOS account, verify graceful fallback |
| Mixed DPI multi-monitor | Phase 1 (document limitation) | Single-monitor works correctly; multi-monitor documented as unsupported |
| Accessibility tree token explosion | Phase 2: Windows UIA | <100 elements returned on complex app, <5000 tokens |
| Coordinate space mismatch between tree and screenshot | Phase 2: Windows UIA | AI clicks using tree coords land within 5px of target |
| Stale accessibility tree | Phase 2: Windows UIA | Stale cache invalidated after click, re-query returns fresh data |
| Linux AT-SPI2 unavailable | Phase 4: Linux AT-SPI2 | Agent runs without crash on minimal Linux, falls back to screenshot-only |

## Sources

- Existing codebase analysis: `agent-app/src/main/agent-core.ts` lines 454-525 (screenshot pipeline, coordinate scaling)
- [Node.js SEA Documentation](https://nodejs.org/api/single-executable-applications.html) -- native addon bundling constraints
- [Node.js 25.5 --build-sea](https://progosling.com/en/dev-digest/2026-01/nodejs-25-5-build-sea-single-executable) -- latest SEA improvements
- [sharp Installation Docs](https://sharp.pixelplumbing.com/install/) -- platform binary requirements
- [Windows SetProcessDpiAwarenessContext](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setprocessdpiawarenesscontext) -- DPI awareness API
- [Windows DPI and Device-Independent Pixels](https://learn.microsoft.com/en-us/windows/win32/learnwin32/dpi-and-device-independent-pixels) -- physical vs logical coordinate systems
- [Win32 DPI and Monitor Scaling](https://gist.github.com/marler8997/9f39458d26e2d8521d48e36530fbb459) -- per-monitor DPI coordinate discontinuities
- [macOS Accessibility Permission in TCC](https://jano.dev/apple/macos/swift/2025/01/08/Accessibility-Permission.html) -- TCC requirements and limitations
- [macOS TCC Developer Forums](https://developer.apple.com/forums/thread/703188) -- sandboxed app accessibility restrictions
- [AXUIElementCopyElementAtPosition](https://developer.apple.com/documentation/applicationservices/1462077-axuielementcopyelementatposition) -- macOS accessibility coordinates
- [NSScreen vs AXUIElement coordinates](https://github.com/tmandry/Swindler/issues/62) -- multi-monitor coordinate mismatches on macOS
- [GNOME AT-SPI2 on D-Bus](https://wiki.linuxfoundation.org/accessibility/atk/at-spi/at-spi_on_d-bus) -- Linux accessibility architecture
- [Wayland Accessibility Notes](https://github.com/splondike/wayland-accessibility-notes) -- AT-SPI2 differences on Wayland
- [AT-SPI2 Freedesktop](https://www.freedesktop.org/wiki/Accessibility/AT-SPI2/) -- reference documentation
- [@bright-fish/node-ui-automation](https://www.npmjs.com/package/@bright-fish/node-ui-automation) -- Native Node.js UIA wrapper (34 weekly downloads, last updated 2022)
- [Accessibility Tree Token Cost in Browser MCPs](https://dev.to/kuroko1t/how-accessibility-tree-formatting-affects-token-cost-in-browser-mcps-n2a) -- 51-79% token waste from unfiltered trees
- [robotjs DPI scaling issue #403](https://github.com/octalmage/robotjs/issues/403) -- robotjs uses logical coordinates
- [Electron Per-Monitor DPI issue #8533](https://github.com/electron/electron/issues/8533) -- Electron DPI awareness limitations
- [node-screenshots GitHub](https://github.com/nashaofu/node-screenshots) -- screenshot library used by agent
- [Node.js PowerShell spawn slowness](https://github.com/nodejs/node/issues/21632) -- child_process performance on Windows

---
*Pitfalls research for: Precision Computer Use (v17.0) -- DPI fix, accessibility tree integration, cross-platform element targeting*
*Researched: 2026-03-25*
