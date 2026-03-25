# Project Research Summary

**Project:** LivOS v17.0 (Precision Computer Use) + v18.0 (Web-Based Remote Desktop Streaming)
**Domain:** AI desktop automation with DPI-aware screenshot pipeline + browser-based remote desktop streaming
**Researched:** 2026-03-25
**Confidence:** HIGH

## Executive Summary

This research covers two adjacent milestones. v17.0 fixes a critical coordinate mismatch bug in the AI Computer Use system and adds accessibility tree integration for precise element targeting. v18.0 adds a browser-based remote desktop viewer at `pc.username.livinity.io`, letting users see and control their server desktop from any browser. The two milestones share the same X11 display session, creating a natural synergy: v18.0 users can watch the AI (v17.0) operate their desktop in real time through the same authenticated stream.

For v17.0, the root cause is well-understood: node-screenshots captures physical pixels (e.g., 2560x1440 on a 150% DPI display) but robotjs expects logical pixels (1707x960). The fix requires exactly one new npm dependency — `sharp` for image resizing — and follows Anthropic's own reference implementation. Accessibility tree integration uses platform-native tools via child_process (PowerShell on Windows, a custom Swift CLI on macOS, Python/pyatspi2 on Linux) rather than fragile FFI bindings, producing a unified JSON interface regardless of platform.

For v18.0, the domain is mature (Guacamole, KasmVNC, noVNC are reference implementations) but none fit cleanly into LivOS's architecture. The correct approach is a thin integration: x11vnc captures the host X11 display, noVNC renders it in the browser, and a WebSocket-to-TCP proxy inside livinityd (using Node.js's built-in `node:net`) bridges the two. This reuses existing JWT auth, Caddy subdomain routing, NativeApp lifecycle, and WebSocket upgrade infrastructure without introducing parallel auth stacks or heavyweight Java/container dependencies. All critical risks (VNC exposure, Wayland detection failure, Caddy timeout disconnections, port conflicts) are Phase 1 decisions that must be locked in before browser-side work begins.

## Key Findings

### Recommended Stack

The existing LivOS stack needs only one new npm package: `sharp` (^0.34.5). For remote desktop streaming, no new npm packages are required — the WebSocket proxy uses Node.js's built-in `node:net`, and noVNC is served as static assets via `@novnc/novnc` npm package or the `react-vnc` wrapper. Platform accessibility tree helpers are bundled as assets in Electron's `extraResources`, not npm packages.

**Core technologies:**
- **sharp ^0.34.5**: Resize physical-pixel screenshots to Anthropic's recommended logical-pixel targets before sending to AI — the only Node.js image library with prebuilt binaries, proper Electron `asarUnpack` support, and acceptable performance for a per-action capture loop. Anthropic's reference implementation (computer.py) does the identical resize step with ImageMagick; sharp is the equivalent for Node.js
- **x11vnc**: Capture the host X11 display (:0) as a VNC stream on localhost:5900 — simple, battle-tested, designed for real physical displays (not virtual/container displays like KasmVNC)
- **noVNC / react-vnc**: Browser-side JavaScript VNC renderer using HTML5 canvas — standard reference client for VNC-over-WebSocket, maintained, widely deployed
- **node:net (built-in)**: WebSocket-to-TCP bridge inside livinityd — same pattern used by existing `/terminal`, `/ws/docker-exec`, and `/ws/voice` routes; no extra dependency
- **PowerShell + System.Windows.Automation (.NET)**: Windows accessibility tree — zero dependencies, .NET UIAutomation ships with every Windows installation since Vista, returns physical-pixel bounding rectangles
- **Swift CLI binary (livinity-ax)**: macOS accessibility tree via AXUIElement — only reliable approach since no maintained Node.js binding exists; ~50KB universal binary compiled with `swiftc -O`
- **python3 + pyatspi2**: Linux accessibility tree via AT-SPI2/D-Bus — standard Python binding pre-installed on GNOME/GTK desktops

**What NOT to add:** KasmVNC (container-focused, fights physical displays), Apache Guacamole (Java + Tomcat + parallel auth), websockify as a separate process (duplicates auth logic), nut.js (paid subscription), node-ffi-napi (fragile ABI across Node.js versions), Tesseract OCR (accessibility tree gives text labels directly), OpenCV/template matching (over-engineered when accessibility tree gives exact coordinates).

### Expected Features

**v17.0 Computer Use features (from STACK.md — DPI fix):**
- Must have: DPI-aware screenshot pipeline (physical pixels resized to Anthropic target resolutions before sending to AI), correct coordinate back-mapping from AI response space to robotjs logical space, accessibility tree tool (`screen_elements`) returning element names/roles/bounding rects/center coordinates

**v18.0 Remote Desktop features (from FEATURES.md):**

**Must have (table stakes — P1):**
- Real-time screen rendering at 30+ FPS in browser canvas — core product value
- Mouse input: click, move, drag, scroll with accurate coordinate scaling
- Keyboard input with full shortcut capture and `event.preventDefault()`
- Text clipboard sync (bidirectional) — without this the stream feels like a video, not a workspace
- Auto-reconnect with exponential backoff — network blips are common; manual refresh is unacceptable
- Connection status indicator (green/yellow/red + latency) — frozen screen is ambiguous without it
- Dynamic resolution / fit-to-window (server-side xrandr resize) — fixed box or scrolling is unacceptable
- Fullscreen mode — required to capture keyboard shortcuts browsers steal (Ctrl+W, F5, etc.)
- Cursor rendering (hide local, render remote only) — dual cursor is jarring
- Session persistence across reconnects — closing browser tab should not kill desktop session
- Zero-config install via install.sh with GUI auto-detection — aligns with LivOS "one command" ethos
- JWT auth gate via existing `livinity_token` cookie — no double-login; same session as rest of LivOS

**Should have (differentiators — P2, add after validation):**
- Adaptive JPEG/WebP quality based on estimated bandwidth
- Mobile touch controls (touch-to-click, pinch-to-zoom, virtual keyboard)
- On-screen keyboard for special keys (Ctrl+Alt+Del, Print Screen, Super)
- Session timeout configuration in admin settings

**Defer (v2+):**
- Audio streaming (PulseAudio/PipeWire + Opus + WebRTC) — doubles bandwidth, most servers have no meaningful audio
- Per-user desktop isolation (Xvfb per user) — single display is fine for v18.0
- Multi-monitor support, binary clipboard (images), WebRTC transport, file drag-and-drop

**Key competitive differentiator:** No existing solution (Guacamole, KasmVNC, noVNC, Chrome Remote Desktop) combines remote desktop streaming with AI desktop automation. LivOS uniquely owns this: users can watch the AI operate their desktop via the same authenticated web interface. This is the primary v18.0 marketing angle.

### Architecture Approach

**v17.0:** Three platform-specific accessibility backends (PowerShell script, Swift CLI binary, Python script) behind a unified `ScreenElement` JSON interface. AI receives accessibility tree first (structured data with coordinates), screenshot second (visual context). The screenshot pipeline: capture physical pixels → read `scaleFactor()` → compute logical resolution → find best Anthropic target resolution by aspect ratio → sharp resize → send to AI with correct `display_width`/`display_height` metadata → back-map AI coordinates to logical space for robotjs.

**v18.0:** Strict "thin integration" principle — x11vnc runs as a systemd service managed by the existing NativeApp system, a WebSocket-to-TCP proxy inside livinityd bridges browser connections to x11vnc on localhost:5900, and Caddy routes `pc.{domain}` to livinityd:8080 using the existing nativeApps cookie-gating pattern. No new infrastructure processes, no new auth systems, no parallel stacks. The relay (Server5) requires zero changes.

**Major components:**
1. **install.sh** — `detect_gui()` gates the entire v18.0 feature; `install_x11vnc()` and `setup_desktop_streaming()` create the systemd service and store VNC credentials
2. **x11vnc systemd service (livos-x11vnc)** — binds exclusively to localhost:5900 with `-localhost` flag; managed as a NativeApp with 30-minute idle timeout; `User=` directive (not root)
3. **NativeApp config** — adds `desktop-stream` entry to `NATIVE_APP_CONFIGS` in `native-app.ts`; reuses existing lifecycle, idle timeout, and start/stop patterns
4. **WebSocket proxy** — `/ws/desktop` route in `server/index.ts` using `node:net` TCP connection to localhost:5900; identical pattern to existing `/ws/voice` and `/ws/docker-exec` handlers; JWT validated on WebSocket upgrade + Origin header check
5. **Caddy subdomain block** — `pc.{domain}` added to `generateFullCaddyfile()` nativeApps array; must include `stream_close_delay 5m`, `stream_timeout 24h`, and `transport http { read_timeout 0; write_timeout 0 }`
6. **VncViewer React component** — noVNC wrapper in `ui/src/components/desktop/VncViewer.tsx`; handles canvas rendering, mouse/keyboard input, clipboard sync, auto-reconnect
7. **Desktop module** — `livinityd/source/modules/desktop/detect.ts` (X11/Wayland/headless detection) and `index.ts` (lifecycle coordination)

### Critical Pitfalls

1. **Caddy reload kills active desktop streams** — Every `caddy reload` (triggered by app installs, subdomain changes) terminates all WebSocket connections including live sessions. Add `stream_close_delay 5m`, `stream_timeout 24h`, and disable `read_timeout`/`write_timeout` in the Caddy reverse_proxy block for `pc.*`. Must be in initial Caddyfile generation — not retrofitted.

2. **Wayland detection failure** — Ubuntu 24.04+ defaults to Wayland; x11vnc cannot attach to a Wayland session. Detection must check `$XDG_SESSION_TYPE` (returns `wayland`, `x11`, or `tty`) — NOT `$DISPLAY`. On headless: skip the feature entirely and hide it from the UI.

3. **VNC port exposed to the network** — VNC defaults to listening on 0.0.0.0; port 5900 is actively scanned by attackers (8,000+ exposed servers found in 2024). x11vnc must use `-localhost`. Docker bypasses UFW via iptables nat — explicit iptables DROP rules for 5900-5999 are required, not just UFW rules.

4. **WebSocket proxy timeout disconnects idle sessions** — Caddy's default 60-second timeout kills VNC sessions when the screen is static. Disable timeouts in the reverse_proxy block and implement 25-second WebSocket ping/pong heartbeats in the noVNC client.

5. **Port conflicts with Docker apps** — Hard-coding VNC to port 5900 risks collision. Use `nextAvailablePort()` from the database module, or register a reserved port (e.g., 15900) in the port allocator from day one. This also gates future multi-user support.

6. **JWT not validated on WebSocket upgrade** — Caddy's `@notauth` cookie check is a pre-screen, not authentication. Must validate JWT in livinityd's WebSocket upgrade handler (same pattern as existing `/terminal`). Also validate `Origin` header to prevent cross-site WebSocket hijacking.

7. **node-screenshots scaleFactor() semantics unclear** — Documentation does not specify whether `scaleFactor()` returns the OS DPI scale factor or something else. The entire v17.0 DPI pipeline depends on this. Empirical verification on a 150% DPI Windows display is required before implementing the resize math.

## Implications for Roadmap

Research indicates two separate milestone tracks. v17.0 has 4 natural phases; v18.0 has 4 phases. They can proceed sequentially (v17 first, since v18 builds on the stable Computer Use foundation) or in parallel if separate contributors work each.

### v17.0 Phase Structure

#### Phase 1: DPI Fix + sharp Integration
**Rationale:** The coordinate mismatch is the foundation — accessibility features are worthless if clicks land in the wrong position. Fix the screenshot pipeline first.
**Delivers:** sharp integration with Electron asarUnpack, DPI-aware screenshot resize to Anthropic target resolutions, corrected coordinate back-mapping (physical pixels → logical pixels for robotjs), updated `toScreenX`/`toScreenY` functions
**Avoids:** Building accessibility features on a broken coordinate foundation
**Research flag:** Must empirically verify node-screenshots `scaleFactor()` behavior on a 150% DPI Windows display before implementing the math. LOW confidence on current documentation.

#### Phase 2: Windows UIA Accessibility Tree
**Rationale:** Windows is the primary agent platform (Electron app, Windows users are majority). PowerShell + System.Windows.Automation has zero external dependencies — lowest-risk accessibility implementation.
**Delivers:** `screen_elements` tool, PowerShell UIA script (`get-elements.ps1`), Electron extraResources bundling, ScreenElement JSON schema, element-first click mode
**Avoids:** Blocking the release on cross-platform completeness
**Research flag:** Standard patterns — PowerShell + UIAutomation is well-documented by Microsoft. Skip research-phase.

#### Phase 3: AI Prompt Optimization + Hybrid Mode
**Rationale:** With correct coordinates (Phase 1) and elements available (Phase 2), optimize how the AI uses both data sources. Accessibility tree first, screenshot as fallback reduces token costs and improves accuracy.
**Delivers:** Updated AI prompt format, accessibility-first decision logic (use element coordinates when available, screenshot only for visual context or when tree unavailable), element caching with change detection, token usage improvement
**Research flag:** May need prompt engineering experimentation. Standard AI integration pattern but specific prompt format needs testing.

#### Phase 4: macOS + Linux Accessibility
**Rationale:** Extends the capability to other platforms after the Windows implementation is proven and the interface is stable.
**Delivers:** Swift CLI binary (`livinity-ax`) for macOS AXUIElement, Python pyatspi2 script for Linux AT-SPI2, Electron build pipeline for universal Swift binary, graceful degradation when accessibility unavailable
**Research flag:** macOS Swift binary cross-compilation and distribution in Electron needs investigation. Linux pyatspi2 availability varies by distro.

### v18.0 Phase Structure

#### Phase 1: Server-Side Infrastructure
**Rationale:** All critical security and stability pitfalls must be locked in before any browser-visible work. This phase can be tested independently with a standard VNC client before the browser UI exists.
**Delivers:** install.sh GUI detection (`detect_gui()` using `$XDG_SESSION_TYPE`), x11vnc installation, systemd service (localhost-only, dynamic port via `nextAvailablePort()`, `User=` not root), NativeApp registration, Caddy subdomain block with stream timeout configuration
**Addresses:** Zero-config install, session persistence (VNC runs independently of viewer)
**Avoids:** Pitfalls 1-6 (Caddy timeouts, Wayland detection, VNC exposure, headless detection, port conflicts, root VNC)
**Research flag:** Standard patterns — all follow documented LivOS NativeApp and install.sh patterns. Skip research-phase.

#### Phase 2: WebSocket Proxy and Auth Integration
**Rationale:** The proxy is the security-critical bridge. With the VNC server running (Phase 1), this phase connects browser to desktop and validates that auth, reconnect, and routing all work end-to-end before any browser UI is built.
**Delivers:** `/ws/desktop` WebSocket-to-TCP bridge in `server/index.ts`, JWT validation on WebSocket upgrade, Origin header check, auto-start of x11vnc on first connection, idle timeout wiring, end-to-end connection test
**Uses:** `node:net` (built-in), existing `mountWebSocketServer` pattern, existing `verifyToken()` middleware
**Avoids:** Pitfall 6 (JWT bypass on WebSocket upgrade)
**Research flag:** Identical to existing `/ws/voice` handler. Skip research-phase.

#### Phase 3: Browser VNC Viewer (Core UX)
**Rationale:** With a working authenticated backend (Phases 1-2), the browser UI can be built and tested against the real VNC stream. All P1 table-stakes features are implemented here.
**Delivers:** VncViewer React component (noVNC wrapper), mouse/keyboard input capture, text clipboard sync, connection status indicator, auto-reconnect with exponential backoff, dynamic resolution/fit-to-window, fullscreen mode, cursor rendering, Desktop Viewer entry in LivOS UI
**Addresses:** All P1 features from FEATURES.md
**Research flag:** noVNC's `@novnc/novnc` npm programmatic API surface needs verification — confirm WebSocket binary mode (not base64) is default and check the JavaScript API for `connect()`, `sendKey()`, `sendMouseEvent()`, `clipboardPasteFrom()`. Consider whether `react-vnc` reduces integration surface area. Recommend `/gsd:research-phase` before Phase 3 planning.

#### Phase 4: Polish and P2 Features
**Rationale:** Once the core stream is validated with real users, add the enhancement layer. These are additive and do not gate the core use case.
**Delivers:** Adaptive quality (dynamic JPEG/WebP based on bandwidth estimation), mobile touch controls, on-screen special-key keyboard, session timeout configuration in admin settings
**Research flag:** Standard React/event handler patterns. Skip research-phase.

### Phase Ordering Rationale

- v17.0 DPI fix must precede accessibility because accessibility tree coordinates are useless if robotjs receives coordinates in the wrong pixel space
- v17.0 Windows before macOS/Linux because it is the primary platform and has zero external dependency requirements
- v18.0 server infrastructure before browser UI because all security decisions must be locked in before the feature is user-visible
- v18.0 WebSocket proxy before browser UI to verify the backend security perimeter before building UX on top of it
- v18.0 P2 features deferred until core stream is validated — audio, multi-user isolation, WebRTC, and binary clipboard are disproportionately complex relative to their v18.0 value

### Research Flags

**Needs `/gsd:research-phase` before planning:**
- **v17.0 Phase 1:** Empirical verification of node-screenshots `scaleFactor()` semantics on a 150% DPI display. The entire DPI pipeline depends on this and it cannot be resolved from documentation alone.
- **v18.0 Phase 3 (noVNC API):** Programmatic embedding API for `@novnc/novnc` npm package vs `react-vnc` wrapper. Confirm binary WebSocket mode, event sending API, and connection state management API.
- **v18.0 Phase 2 (Wayland fallback):** If the target server (mini PC bruce-EQ, Ubuntu 24.04) runs Wayland by default, the WayVNC integration path needs specific research — current research covers detection but not the full Wayland streaming path.

**Standard patterns (skip research-phase):**
- v17.0 Phase 2 (Windows UIA): Microsoft official API, extensively documented, PowerShell approach proven
- v17.0 Phase 3 (AI prompts): Additive prompt engineering, no new APIs
- v18.0 Phase 1 (server infrastructure): Follows existing LivOS NativeApp and install.sh patterns exactly
- v18.0 Phase 2 (WebSocket proxy): Identical to existing `/ws/voice` handler
- v18.0 Phase 4 (P2 features): Standard React UI patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (sharp) | HIGH | De facto standard; Anthropic's reference implementation does the identical step with ImageMagick; sharp Electron docs cover asarUnpack explicitly |
| Stack (x11vnc + noVNC) | HIGH | Established minimal stack for this exact use case; extensively deployed |
| Stack (accessibility backends) | MEDIUM-HIGH | Windows PowerShell/UIA is HIGH; macOS Swift CLI is MEDIUM (binary distribution complexity); Linux pyatspi2 is MEDIUM (distro fragmentation) |
| Features | HIGH | Mature domain with 4 reference implementations for comparison; P1/P2/P3 classification verified against competitor feature matrices |
| Architecture | HIGH | Based on direct analysis of existing livinityd codebase; patterns are copied from verified working code (no guesswork) |
| Pitfalls | HIGH | All critical pitfalls verified via official docs and issue trackers (Caddy #5471/#6420/#7222, Cyble VNC report 2024, Docker UFW bypass docs) |

**Overall confidence:** HIGH

### Gaps to Address

- **node-screenshots scaleFactor() semantics:** Documentation does not specify whether this returns OS DPI scale factor or something else. Must be empirically verified on a 150% DPI Windows display before implementing the v17.0 DPI pipeline. This is the single highest-risk gap.

- **noVNC npm API surface:** The `@novnc/novnc` package's programmatic embedding API (vs. its standalone HTML page) is less documented. During v18.0 Phase 3 planning, verify `connect()`, `sendKey()`, `sendMouseEvent()`, `clipboardPasteFrom()` against the current npm package version. Evaluate whether `react-vnc` reduces integration complexity.

- **Wayland fallback path:** Research covers detection (`$XDG_SESSION_TYPE`) but not the full WayVNC integration path. If the mini PC (bruce-EQ, Ubuntu 24.04) or Server4 runs Wayland, this needs specific research before v18.0 Phase 1.

- **macOS Swift binary build pipeline:** The `livinity-ax` Swift CLI binary needs a cross-compile step in the Electron builder pipeline (universal arm64+x86_64 via `lipo`). How this integrates with `electron-builder` needs design before v17.0 Phase 4.

- **Multi-user VNC port allocation:** Deferred to v2+ per FEATURES.md, but Phase 1 port allocation decision must not foreclose this. Using `nextAvailablePort()` from the database module (not hard-coding 5900) costs nothing at Phase 1 and keeps multi-user viable.

- **Linux pyatspi2 availability:** Standard on GNOME/Ubuntu; not guaranteed on KDE Plasma, XFCE, or minimal WM installs. Acceptable for v17.0 because Linux desktop is a minority use case and screenshot-only fallback exists, but the fallback path must be explicitly implemented.

## Sources

### Primary (HIGH confidence)
- [Anthropic Computer Use Tool Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) — display_width_px/display_height_px API, scaling recommendations
- [Anthropic Reference Implementation - computer.py](https://github.com/anthropics/anthropic-quickstarts/blob/main/computer-use-demo/computer_use_demo/tools/computer.py) — MAX_SCALING_TARGETS, scale_coordinates() function
- [sharp Documentation](https://sharp.pixelplumbing.com/) — v0.34.5, resize API, Electron asarUnpack config for @img/* prebuilds
- [Microsoft UI Automation Overview](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-uiautomationoverview) — AutomationElement, FindAll, BoundingRectangle, PowerShell integration
- [Windows DPI Awareness](https://learn.microsoft.com/en-us/windows/win32/hidpi/setting-the-default-dpi-awareness-for-a-process) — PerMonitorAwareV2
- [Apple AXUIElement Docs](https://developer.apple.com/documentation/applicationservices/axuielement) — macOS accessibility API
- [AT-SPI2 D-Bus Protocol](https://www.freedesktop.org/wiki/Accessibility/AT-SPI2/) — Linux accessibility standard
- [noVNC GitHub](https://github.com/novnc/noVNC) — browser VNC client, embedding API
- [x11vnc GitHub](https://github.com/LibVNC/x11vnc) — VNC server flags reference
- [Caddy reverse_proxy docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) — stream_close_delay, stream_timeout, read_timeout/write_timeout
- [SecurityWeek: Thousands of VNC Instances Exposed](https://www.securityweek.com/thousands-vnc-instances-exposed-internet-attacks-increase/) — VNC exposure risk (2024)
- [Docker packet filtering and firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/) — UFW bypass via iptables nat
- [Apache Guacamole Manual v1.6.0](https://guacamole.apache.org/doc/gug/) — feature comparison, auth patterns
- [KasmVNC GitHub](https://github.com/kasmtech/KasmVNC) — feature comparison, encoding options, kasmxproxy limitations

### Secondary (MEDIUM confidence)
- [precision-desktop MCP](https://github.com/ikoskela/precision-desktop) — validates PowerShell + UIAutomation approach for DPI coordinate fixing
- [AXorcist Swift Wrapper](https://github.com/steipete/AXorcist) — proves Swift CLI approach for AX tree enumeration on macOS
- [node-screenshots GitHub](https://github.com/nashaofu/node-screenshots) — scaleFactor() API exists but pixel semantics undocumented (needs empirical verification)
- [Caddy issue #6420](https://github.com/caddyserver/caddy/issues/6420) — active WebSocket connections closed on config reload
- [Caddy issue #7222](https://github.com/caddyserver/caddy/issues/7222) — stream_close_delay solution
- [noVNC issue #658](https://github.com/novnc/noVNC/issues/658) — Nginx reverse proxy timeout pattern
- [TigerVNC issue #1775](https://github.com/TigerVNC/tigervnc/issues/1775) — websockify disconnects after 1 minute idle
- [KasmVNC kasmxproxy docs](https://kasmweb.com/kasmvnc/docs/master/man/kasmxproxy.html) — physical display proxy limitations (why KasmVNC rejected)

### Tertiary (LOW confidence, needs validation)
- [react-vnc npm](https://www.npmjs.com/package/react-vnc) — React wrapper for noVNC; API surface needs verification before adopting
- [KasmVNC GPU Acceleration](https://kasmweb.com/kasmvnc/docs/master/gpu_acceleration.html) — future reference if encoding performance becomes a bottleneck

---
*Research completed: 2026-03-25*
*Ready for roadmap: yes*
