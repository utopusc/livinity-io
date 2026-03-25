# Feature Research: Web-Based Remote Desktop Streaming

**Domain:** Browser-based remote desktop streaming for self-hosted servers
**Researched:** 2026-03-25
**Confidence:** HIGH (well-established domain with mature solutions; Apache Guacamole, KasmVNC, noVNC, Chrome Remote Desktop all provide reference implementations)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any web-based remote desktop. Missing these = product feels broken or unusable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Real-time screen rendering** | Core purpose of the product. Users expect to see their desktop in the browser with <100ms visible latency | HIGH | Requires efficient screen capture, encoding (JPEG/WebP/PNG), WebSocket transport, and canvas rendering. 30 FPS minimum for usable interaction; 60 FPS for desktop-like feel. KasmVNC achieves 60fps at 1080p with WebP+JPEG mix |
| **Mouse input (click, move, drag, scroll)** | Cannot interact with desktop without mouse. Every remote desktop solution supports this | MEDIUM | Map browser mouse events to remote coordinates. Must handle coordinate scaling when display is scaled/fit-to-window. Scroll wheel must map correctly |
| **Keyboard input (typing + shortcuts)** | Cannot interact with desktop without keyboard. Users expect to type naturally including special characters | HIGH | Must capture key events before browser processes them. `event.preventDefault()` on keydown. Handle international keyboards, dead keys, IME. Browser steals some shortcuts (Ctrl+W, Ctrl+T, F5, F11) -- these CANNOT be intercepted in non-fullscreen mode |
| **Dynamic resolution / fit-to-window** | Users expect the remote desktop to fill their browser viewport, not show a tiny fixed-size box or require scrolling | MEDIUM | Two approaches: (1) scale the rendered image client-side (simpler, blurry), (2) tell the server to resize the virtual display to match browser viewport (crisp, requires xrandr/KasmVNC allow_resize). LivOS should use approach (2) -- server-side resize to match client dimensions |
| **Connection status indicator** | Users need to know if they're connected, reconnecting, or disconnected. Without this, a frozen screen is ambiguous -- is the remote machine frozen, or is the connection dead? | LOW | Simple status badge: Connected (green), Reconnecting (yellow), Disconnected (red). Show latency in ms. RDP uses 1-4 bars based on RTT + bandwidth |
| **Automatic reconnection** | Network blips are common. Users should not have to manually refresh the page or re-navigate to resume their session | MEDIUM | Exponential backoff reconnect on WebSocket close. noVNC has `reconnect` and `reconnect_delay` options. The remote desktop session on the server persists -- only the viewer connection drops. LivOS already implements this pattern in the agent relay (heartbeat + exponential backoff) |
| **Text clipboard sync (copy/paste)** | Users absolutely expect to copy text on their local machine and paste into the remote desktop, and vice versa. Without this, the remote desktop feels like a video stream, not a workspace | HIGH | Browser Clipboard API (navigator.clipboard) requires HTTPS + secure context + user gesture for read. Chromium browsers support it well; Firefox has restrictions. Guacamole uses a sidebar text area as fallback. KasmVNC has seamless clipboard on Chromium. LivOS approach: use Clipboard API with Guacamole-style text area fallback for non-Chromium |
| **Authentication gate** | The remote desktop must not be publicly accessible. Users expect login before access | LOW | LivOS already has JWT auth + `livinity_token` cookie. Caddy `nativeApps` pattern already does cookie-based gating with login redirect. Zero new work -- just register `pc` subdomain as a native app |
| **Cursor rendering** | Users need to see where their mouse is on the remote desktop. Dual-cursor (local + remote) is standard but jarring | MEDIUM | Best UX: hide the local cursor over the canvas, render only the remote cursor position. This avoids the "two cursors" problem. On high-latency connections, show local cursor as dot with remote cursor as arrow (Guacamole approach). KasmVNC hides local cursor and renders server cursor in the stream |
| **Session persistence across reconnects** | When the browser tab is closed or network drops, the remote desktop session should persist on the server. Reopening the URL should reconnect to the same session, not start a new login | MEDIUM | The VNC/RDP session runs independently of the viewer connection. Closing the browser only drops the WebSocket -- the X11 session stays alive. On reconnect, the viewer re-attaches. This is inherent in VNC architecture. Important: set idle timeout (e.g., 30 min) so abandoned sessions eventually clean up |
| **Fullscreen mode** | Users expect to go fullscreen for an immersive desktop experience. This also enables capturing more keyboard shortcuts | LOW | Use Fullscreen API (`element.requestFullscreen()`). Provide a toolbar button. In fullscreen, most browser shortcuts are suppressed, solving the Ctrl+W/Ctrl+T problem. Escape exits fullscreen (browser-enforced, cannot override). Show a floating toolbar overlay for connection controls |

### Differentiators (Competitive Advantage)

Features that set LivOS remote desktop apart from generic VNC-in-browser. Aligned with LivOS core value: "one-command deployment, accessible anywhere."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Zero-config install via install.sh** | Competitors (Guacamole, Kasm Workspaces) require multi-step Docker/manual setup. LivOS auto-detects GUI presence at install time and configures everything. User just opens `pc.username.livinity.io` | MEDIUM | install.sh checks for X11/Wayland display server (`systemctl list-units --type=target \| grep graphical` or `loginctl show-session`). If GUI detected: install VNC server, configure systemd service, add Caddy subdomain. If headless: skip entirely. Fits LivOS "one command" ethos |
| **Integrated JWT auth (no separate login)** | Guacamole has its own auth system. KasmVNC has its own auth. With LivOS, the user is already logged in -- the remote desktop is just another "app" behind the same session cookie. No double-login | LOW | Existing `nativeApps` Caddy pattern handles this. The `livinity_token` cookie is already set by LivOS login. Caddy checks for cookie presence, redirects to `/login` if absent. The streaming backend receives already-authenticated requests |
| **AI-aware desktop (existing agent integration)** | LivOS already has AI Computer Use (v15.0-v17.0) with screenshot analysis, accessibility tree, mouse/keyboard automation. The remote desktop viewer is the visual companion -- users can watch AI operate their desktop in real-time. No competitor offers this combination | LOW | The remote desktop stream and the AI Computer Use system share the same X11 session. When AI takes actions via robotjs, the user sees them in real-time through the stream. The existing live monitoring UI (screenshot feed + action timeline) could be integrated into the streaming view |
| **Per-user session isolation** | In multi-user LivOS, each user gets their own desktop session. User A cannot see User B's desktop | HIGH | Requires per-user X11 sessions or per-user VNC instances. For v1, this is out of scope (single display, single user). For future: Xvfb per user, or container-based desktop isolation. Flag this as v2 feature |
| **Adaptive quality based on connection** | Automatically reduce image quality and frame rate when bandwidth is low, increase when bandwidth is available. Smooth experience regardless of connection quality | MEDIUM | KasmVNC does this natively with dynamic JPEG/WebP quality settings based on screen change rates. If using KasmVNC as the backend, this is built-in. If custom: measure WebSocket send buffer backpressure to estimate bandwidth, adjust JPEG quality (30-90) and frame rate (10-60 fps) accordingly |
| **Mobile-friendly touch controls** | LivOS is "accessible anywhere" -- that includes phones and tablets. Users should be able to interact with their server desktop from a phone in a pinch | MEDIUM | Touch-to-click, pinch-to-zoom, two-finger scroll, three-finger right-click. Guacamole's touch emulation is the gold standard here: relative pointer mode (drag to move cursor), tap to click, two-finger tap for right-click. Virtual keyboard trigger button for mobile. Important: this is a "works" feature, not a "great" feature -- full productivity on mobile is unrealistic for a desktop environment |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create substantial complexity, maintenance burden, or UX problems for limited value.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Audio streaming** | "I want to hear my desktop" -- video playback, system sounds, music | Audio adds massive complexity: PulseAudio/PipeWire capture, Opus encoding, separate WebRTC audio channel, sync with video frames, browser autoplay policies. Doubles bandwidth. Most server desktops have no meaningful audio. PROJECT.md explicitly defers this | Defer to v2+. If needed, use WebRTC audio channel added later as separate concern. For v1, document that audio is not streamed |
| **File transfer via drag-and-drop** | "I want to drag files from my desktop to the remote" | Requires virtual drive mapping (SFTP/RDPDR), upload progress UI, large file handling, security scanning. Guacamole does this but it is one of their most bug-reported features. LivOS already has a File Manager app | Use the existing LivOS File Manager (`files.username.livinity.io`) for file transfer. It is already built, tested, and accessible via subdomain. Adding a second file transfer mechanism through the desktop stream is redundant |
| **Multi-monitor support** | "I have two monitors on my server" | Browser tab can only show one viewport. Multi-monitor in web requires opening multiple browser tabs/windows for each display (Citrix approach) -- confusing UX. PROJECT.md explicitly scopes to single display | Single display for v1. If the server has multiple monitors, stream the primary. Add monitor selector in v2 if demand materializes |
| **Clipboard sync for images/files** | "I want to paste screenshots between local and remote" | Binary clipboard requires Chromium-only `navigator.clipboard.read()` with MIME type negotiation. Does not work in Firefox or Safari. Creates false expectation of full clipboard support | Support text-only clipboard sync in v1. This covers 95% of clipboard use (URLs, code snippets, passwords). Binary clipboard is a v2 Chromium-only enhancement |
| **Printing redirection** | "I want to print from remote to my local printer" | Requires virtual printer driver on remote, PDF generation, download to browser, then local print dialog. Extremely niche for a server OS. No web-based solution does this well | Not applicable for LivOS use case. Servers do not print |
| **USB device redirection** | "I want to use my local USB device on the remote" | WebUSB API is Chromium-only and restricted. USB redirection requires kernel-level drivers on both ends. No browser-based solution supports this | Out of scope. Use SSH or agent tools for device access |
| **Hardware-accelerated video decode (WebRTC)** | "Use WebRTC for lower latency" | WebRTC adds STUN/TURN infrastructure, codec negotiation, ICE candidates, and NAT traversal complexity. For a same-LAN or tunnel-proxied connection, WebSocket + canvas is simpler and sufficient. KasmVNC supports WebRTC but it is optional for high-latency scenarios | Start with WebSocket + canvas (proven, simple). WebRTC can be added later as an optional transport for users with high-latency tunnels. The tunnel relay already solves NAT traversal |

## Feature Dependencies

```
[Authentication (JWT/Cookie)] (EXISTING)
    |
    v
[Caddy Subdomain Routing: pc.{user}.domain] (EXISTING PATTERN)
    |
    v
[VNC Server on Desktop] (NEW - core dependency)
    |
    +---> [Screen Capture & Encoding]
    |         |
    |         v
    |     [WebSocket Transport]
    |         |
    |         v
    |     [Browser Canvas Rendering] ----> [Dynamic Resolution]
    |
    +---> [Mouse Input Handling] --------> [Cursor Rendering]
    |
    +---> [Keyboard Input Handling] -----> [Shortcut Passthrough]
    |
    +---> [Clipboard Sync]
    |
    +---> [Connection Management]
              |
              +---> [Status Indicator]
              +---> [Auto-Reconnect]
              +---> [Session Persistence]

[Fullscreen Mode] --enhances--> [Keyboard Input Handling] (captures more shortcuts)

[Touch Controls] --enhances--> [Mouse Input Handling] (alternative input method)

[Adaptive Quality] --enhances--> [Screen Capture & Encoding] (bandwidth optimization)

[AI Computer Use (v15-17)] --shares-session--> [VNC Server on Desktop] (same X11 session)

[install.sh GUI Detection] --gates--> [VNC Server on Desktop] (skip on headless)
```

### Dependency Notes

- **Authentication requires nothing new:** LivOS JWT + `livinity_token` cookie + Caddy `nativeApps` pattern is already implemented. The remote desktop just needs to be registered as a native app subdomain.
- **VNC Server is the foundational dependency:** Everything else (rendering, input, clipboard) flows through the VNC protocol or the chosen streaming backend. This must be set up first.
- **Keyboard Input benefits from Fullscreen:** In normal browser mode, Ctrl+W, Ctrl+T, Ctrl+N, F5, F11, and other browser shortcuts cannot be intercepted. Fullscreen mode suppresses most of these. Users should be encouraged to go fullscreen for best experience.
- **AI Computer Use shares the X11 session:** The VNC server and robotjs both operate on the same display (`:0` or `:1`). No conflict -- VNC streams what robotjs manipulates. This is a natural integration point.
- **install.sh GUI detection gates the entire feature:** On headless servers (no X11/Wayland), the remote desktop feature should be silently skipped. Detection: `systemctl list-units --type=target | grep graphical.target` or check for `$DISPLAY` environment variable.

## MVP Definition

### Launch With (v1 -- v18.0 milestone)

Minimum viable remote desktop streaming. Validates the concept and is genuinely usable for server administration.

- [ ] **VNC server auto-setup in install.sh** -- detect GUI, install KasmVNC or TigerVNC, configure systemd service, bind to localhost only
- [ ] **Caddy subdomain registration** -- `pc.{username}.{domain}` using existing `nativeApps` pattern with JWT cookie gating
- [ ] **WebSocket proxy/bridge** -- either direct WebSocket passthrough (KasmVNC has built-in web client) or a lightweight websockify bridge for TigerVNC
- [ ] **Real-time screen rendering in browser** -- HTML5 canvas, minimum 30 FPS, server-side resolution matching client viewport
- [ ] **Mouse input** -- click (left/right/middle), move, drag, scroll wheel, coordinate mapping with display scaling
- [ ] **Keyboard input** -- full key capture with `event.preventDefault()`, dead keys, modifier keys (Ctrl, Alt, Shift, Super)
- [ ] **Text clipboard sync** -- bidirectional text copy/paste using Clipboard API with text area fallback
- [ ] **Connection status indicator** -- green/yellow/red badge with latency display
- [ ] **Auto-reconnect on disconnect** -- exponential backoff, session persistence on server side
- [ ] **Fullscreen mode** -- button + Fullscreen API for immersive experience and better keyboard capture
- [ ] **Cursor rendering** -- hide local cursor over canvas, render remote cursor from stream

### Add After Validation (v18.x)

Features to add once the core streaming is stable and users are actively using it.

- [ ] **Adaptive quality** -- dynamic JPEG/WebP quality based on bandwidth estimation (add when users report performance issues over tunnels)
- [ ] **Mobile touch controls** -- touch-to-click, pinch-to-zoom, virtual keyboard button (add when analytics show mobile usage)
- [ ] **On-screen keyboard for special keys** -- Ctrl+Alt+Del, Print Screen, Super key, function keys (add when users request specific shortcuts that cannot be captured)
- [ ] **Connection quality history** -- latency/FPS graph over time for debugging connection issues
- [ ] **Session timeout configuration** -- admin setting for idle timeout duration (default 30 min, configurable)

### Future Consideration (v2+)

Features to defer until remote desktop is proven and multi-user demand exists.

- [ ] **Audio streaming** -- PulseAudio/PipeWire capture + Opus encoding + WebRTC audio channel. Only if users specifically demand it
- [ ] **Per-user desktop isolation** -- Xvfb per user or container-based desktops for multi-user LivOS. Requires significant architecture work
- [ ] **Multi-monitor support** -- monitor selector UI, ability to choose which display to stream
- [ ] **Binary clipboard (images)** -- Chromium-only Clipboard API for image copy/paste
- [ ] **WebRTC transport** -- optional lower-latency transport for high-latency tunnel connections
- [ ] **File drag-and-drop** -- drag files from local browser to remote desktop surface
- [ ] **Recording/playback** -- record desktop sessions for audit or training (Guacamole supports this)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | LivOS Dependency |
|---------|------------|---------------------|----------|------------------|
| Screen rendering (30+ FPS) | HIGH | HIGH | P1 | None (new) |
| Mouse input (click/move/drag/scroll) | HIGH | MEDIUM | P1 | None (new) |
| Keyboard input + shortcuts | HIGH | HIGH | P1 | None (new) |
| JWT auth gate | HIGH | LOW | P1 | Existing Caddy nativeApps pattern |
| Auto-reconnect | HIGH | MEDIUM | P1 | Existing pattern from agent relay |
| Connection status indicator | HIGH | LOW | P1 | None (new) |
| Text clipboard sync | HIGH | HIGH | P1 | Browser Clipboard API |
| Dynamic resolution / fit-to-window | HIGH | MEDIUM | P1 | VNC server config (allow_resize) |
| Fullscreen mode | MEDIUM | LOW | P1 | Browser Fullscreen API |
| Cursor rendering (single cursor) | MEDIUM | MEDIUM | P1 | VNC server cursor handling |
| Session persistence | MEDIUM | LOW | P1 | Inherent in VNC architecture |
| install.sh GUI detection + setup | HIGH | MEDIUM | P1 | Existing install.sh |
| Adaptive quality | MEDIUM | MEDIUM | P2 | VNC server encoding config |
| Mobile touch controls | MEDIUM | MEDIUM | P2 | Touch event handlers |
| On-screen special key keyboard | LOW | LOW | P2 | UI component |
| Session timeout config | LOW | LOW | P2 | Admin settings UI |
| Audio streaming | LOW | HIGH | P3 | PulseAudio/PipeWire + WebRTC |
| Per-user isolation | MEDIUM | HIGH | P3 | Xvfb/container per user |
| Multi-monitor | LOW | MEDIUM | P3 | xrandr/display enumeration |
| WebRTC transport | LOW | HIGH | P3 | STUN/TURN infrastructure |

**Priority key:**
- P1: Must have for v18.0 launch
- P2: Should have, add in v18.x iterations
- P3: Nice to have, defer to future milestone

## Competitor Feature Analysis

| Feature | Apache Guacamole | KasmVNC (built-in client) | noVNC + websockify | Chrome Remote Desktop | LivOS v18.0 Approach |
|---------|-----------------|-------------------------------|--------------------|-----------------------|---------------------|
| **Browser-only (no client)** | Yes | Yes | Yes | No (extension) | Yes -- pure browser |
| **Protocol support** | VNC, RDP, SSH, Telnet | VNC only | VNC only | Proprietary | VNC (sufficient for Linux) |
| **Auth integration** | Own auth + LDAP/SAML/header | Own auth or API key | None (external) | Google account | LivOS JWT cookie (existing) |
| **Setup complexity** | Docker + Tomcat + guacd + DB | Single binary + web files | Python websockify + HTML | Google-managed | install.sh one-command |
| **Dynamic resolution** | VNC: sometimes; RDP: initial only | Yes (allow_resize: true) | Depends on VNC server | Yes | Yes (server-side resize) |
| **Clipboard** | Text via sidebar panel | Seamless text on Chromium; binary | Text only | Full (native client) | Text via Clipboard API + fallback |
| **Touch support** | Excellent (3 touch modes) | Basic | Basic | Excellent (3 modes) | Basic touch-to-click for v1 |
| **Reconnect** | Manual | Manual | Configurable auto | Automatic | Automatic with exponential backoff |
| **Image encoding** | PNG (server-side) | WebP + JPEG + QOI (adaptive) | Raw framebuffer + Tight | H.264/VP8 | Depends on backend choice |
| **Audio** | RDP only | PulseAudio capture | No | Yes | No (deferred) |
| **File transfer** | Yes (SFTP/RDPDR drag-drop) | No | No | Yes | No (use existing File Manager) |
| **Latency (LAN)** | ~50-100ms | ~16-33ms (60fps) | ~50-100ms | ~16-33ms | Target: <50ms LAN, <150ms tunnel |
| **Self-hosted** | Yes | Yes | Yes | No | Yes |
| **AI integration** | No | No | No | No | Yes (shares X11 with AI Computer Use) |

### Key Competitor Insight

No existing solution combines remote desktop streaming with AI desktop automation. LivOS uniquely owns this intersection: users can both watch their desktop and have AI operate it, through the same authenticated web interface. This is the primary differentiator.

## Integration Points with Existing LivOS Infrastructure

| LivOS Component | Integration | Effort |
|-----------------|------------|--------|
| **Caddy reverse proxy** | Add `pc` subdomain to `nativeApps` array in `generateFullCaddyfile()`. Cookie-based JWT gating already implemented. WebSocket upgrade headers must be configured | LOW |
| **JWT authentication** | No changes needed. Existing `livinity_token` cookie validates user. Caddy handles redirect-to-login for unauthenticated requests | NONE |
| **install.sh** | Add GUI detection section. Check for graphical.target or display server. Conditionally install VNC server, configure systemd service, add firewall rule for VNC port (localhost only) | MEDIUM |
| **Multi-user routing** | In multi-user mode, wildcard Caddy block routes to livinityd (port 8080). App gateway extracts username from subdomain, validates session, routes to per-user VNC port. Pattern matches existing Docker app routing | MEDIUM |
| **AI Computer Use (v15-17)** | Shares same X11 display. No integration needed -- robotjs and VNC server both operate on the same framebuffer. AI actions visible in real-time naturally | NONE |
| **Agent relay (Server5)** | Remote desktop streams locally (not through relay). `pc.username.livinity.io` resolves to user's LivOS server directly via Cloudflare Tunnel or direct DNS. Relay is not involved | NONE |

## Behavioral Expectations (User Mental Model)

Users coming from Chrome Remote Desktop, TeamViewer, AnyDesk, or RDP have specific expectations:

| Behavior | What Users Expect | LivOS Approach |
|----------|-------------------|----------------|
| **First connection** | Open URL, see desktop immediately (after auth) | JWT cookie auto-validates. If logged in, desktop streams instantly. If not, redirect to login, then back to desktop |
| **Resize browser window** | Remote desktop resizes to match | Server-side xrandr resize via VNC protocol. 200ms debounce on window resize events |
| **Close browser tab** | Desktop keeps running, re-opening URL reconnects | VNC session persists. WebSocket reconnect on page load |
| **Network interruption** | Brief freeze, then auto-recovery | Auto-reconnect with exponential backoff. Show "Reconnecting..." overlay |
| **Copy text locally, paste remotely** | Ctrl+V works in remote desktop | Clipboard API intercepts paste, sends text to VNC server clipboard |
| **Ctrl+Alt+Del** | Security screen on remote machine | On-screen button (cannot capture this combo in browser). Or use Ctrl+Alt+End as alternative shortcut |
| **Latency** | Responsive enough for terminal work, file browsing, basic GUI. Not expected to be "gaming quality" | Target <50ms LAN, <150ms tunnel. 30 FPS minimum. Acceptable for server admin tasks |
| **Mobile access** | Basic ability to check on server from phone | Touch-to-click, pinch-to-zoom. Not a primary use case but should work |

## Sources

- [Apache Guacamole Manual v1.6.0 - User Interface](https://guacamole.apache.org/doc/gug/using-guacamole.html)
- [Apache Guacamole - HTTP Header Authentication](https://guacamole.apache.org/doc/gug/header-auth.html)
- [Apache Guacamole - Reverse Proxy](https://guacamole.apache.org/doc/gug/reverse-proxy.html)
- [Apache Guacamole - Configuration](https://guacamole.apache.org/doc/gug/configuring-guacamole.html)
- [KasmVNC - Features](https://kasm.com/kasmvnc)
- [KasmVNC - GitHub](https://github.com/kasmtech/KasmVNC)
- [KasmVNC - Client Side Documentation](https://kasmweb.com/kasmvnc/docs/master/clientside.html)
- [KasmVNC - Configuration](https://www.kasmweb.com/kasmvnc/docs/latest/configuration.html)
- [KasmVNC - Video Rendering Options](https://github.com/kasmtech/KasmVNC/wiki/Video-Rendering-Options)
- [noVNC - Embedding Documentation](https://novnc.com/noVNC/docs/EMBEDDING.html)
- [MDN - Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
- [web.dev - Unblocking Clipboard Access](https://web.dev/articles/async-clipboard)
- [Microsoft - RDP Bandwidth Requirements](https://learn.microsoft.com/en-us/azure/virtual-desktop/rdp-bandwidth)
- [Microsoft - Frame Rate Limited to 30 FPS](https://learn.microsoft.com/en-us/troubleshoot/windows-server/remote/frame-rate-limited-to-30-fps)
- [Microsoft - Graphics Encoding over RDP](https://learn.microsoft.com/en-us/azure/virtual-desktop/graphics-encoding)
- [Kasm VNC vs Other Linux VNC Tools](https://www.cendio.com/blog/kasm-vnc-alternatives/)
- [Kasm Workspaces vs Apache Guacamole](https://symalon.com/en/kasm-workspaces-vs-apache-guacamole-a-comparison-of-open-source-remote-desktop-solutions/)
- [noVNC Auto-reconnect Issue #799](https://github.com/novnc/noVNC/issues/799)
- [LinuxServer.io - Webtop 2.0](https://www.linuxserver.io/blog/webtop-2-0-the-year-of-the-linux-desktop)

---
*Feature research for: Web-based remote desktop streaming (v18.0)*
*Researched: 2026-03-25*
