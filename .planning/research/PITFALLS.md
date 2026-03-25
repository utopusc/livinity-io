# Pitfalls Research: Web-Based Remote Desktop Streaming for LivOS

**Domain:** Adding web-based remote desktop streaming to an existing self-hosted Linux server platform
**Researched:** 2026-03-25
**Confidence:** HIGH (verified through official docs, community reports, and existing codebase analysis)

---

## Critical Pitfalls

### Pitfall 1: Caddy Reload Kills Active Desktop Streams

**What goes wrong:**
Every `caddy reload` forcibly terminates all active WebSocket connections, including live desktop streams. LivOS currently calls `caddy reload` whenever apps are installed, subdomains change, or domain configuration updates. A user mid-session watching their desktop stream will get disconnected with no warning whenever *any* unrelated Caddy config change occurs.

**Why it happens:**
Caddy holds a reference to the active config for every open connection. On reload, old connections must close to free memory. This is a known, long-standing Caddy behavior (issues #5471, #6420, #7222). LivOS's `caddy.ts` calls `caddy reload --config /etc/caddy/Caddyfile` in `applyCaddyConfig()`, `activateDomain()`, `removeDomain()`, and tunnel config changes -- all without any WebSocket preservation.

**How to avoid:**
1. Add `stream_close_delay 5m` to the reverse_proxy block serving the desktop stream subdomain (`pc.{domain}`). This gives users 5 minutes to reconnect gracefully after a config change instead of instant termination.
2. Add `stream_timeout 24h` to prevent indefinite connections but allow long desktop sessions.
3. Implement client-side auto-reconnect in the web viewer with exponential backoff -- the noVNC/KasmVNC client should detect disconnection and re-establish the WebSocket transparently.
4. Minimize unnecessary Caddy reloads by batching config changes.

**Warning signs:**
- Desktop stream drops every time an app is installed or subdomain changes
- Users report "random disconnections" that correlate with admin actions
- Logs show `caddy reload` immediately before WebSocket close events

**Phase to address:**
Phase 1 (Caddy integration) -- must be in the initial Caddyfile generation for the `pc.*` subdomain block.

---

### Pitfall 2: Wayland Detection Failure -- VNC Server Cannot Attach

**What goes wrong:**
Ubuntu 24.04+ defaults to Wayland. Most VNC servers (x11vnc, TigerVNC) only work with X11. If the install script doesn't detect the display server type, the VNC server will fail silently or crash because it cannot find an X11 display to attach to. Ubuntu 26.04 removes the X11 session entirely -- there is no fallback.

**Why it happens:**
Developers test on X11 or headless VMs, never encountering Wayland. The `$DISPLAY` variable exists under Wayland but points to XWayland, not the native compositor. Traditional x11vnc uses `/tmp/.X11-unix/X0` which may not exist or may be an XWayland proxy with incomplete capture capabilities. Wayland's security model deliberately prevents screen capture by unprivileged processes.

**How to avoid:**
1. Detection must check `$XDG_SESSION_TYPE` (returns `wayland`, `x11`, or `tty`) -- NOT `$DISPLAY`.
2. For Wayland: use WayVNC (wlroots-based compositors only, e.g., Sway) or KasmVNC (which ships its own Xorg server and sidesteps the issue entirely).
3. For X11: x11vnc or TigerVNC work fine.
4. For headless (no GUI): skip desktop streaming entirely, or offer to install a virtual desktop via Xvfb + a lightweight WM.
5. KasmVNC is the safest choice because it creates its own X server regardless of what the host runs, making Wayland vs X11 detection a non-issue for the VNC server itself. Detection is still needed to decide whether to capture the existing session or create a virtual one.

**Warning signs:**
- VNC server exits immediately with "cannot open display" or "no screens found"
- Works on test VM (X11) but fails on user's Ubuntu 24.04 with Wayland
- `loginctl show-session` shows `Type=wayland` but VNC assumes X11

**Phase to address:**
Phase 1 (install.sh detection) -- the very first step must be robust display server detection.

---

### Pitfall 3: VNC Server Exposed Without Authentication on the Network

**What goes wrong:**
The VNC server (port 5900+) listens on 0.0.0.0 by default, making the raw desktop stream accessible to anyone who can reach the port -- bypassing LivOS JWT auth entirely. Over 8,000 VNC servers are publicly exposed with no auth on the internet. Attackers actively scan port 5900.

**Why it happens:**
VNC servers default to listening on all interfaces. Developers bind to 127.0.0.1 in the config but miss that Docker's `--network host` or port mapping overrides this. Or the VNC password is set to something weak, giving a false sense of security -- VNC's built-in auth is DES-based and trivially crackable.

**How to avoid:**
1. **NEVER** expose VNC ports to the network. Bind VNC exclusively to `127.0.0.1:590X`.
2. All access goes through Caddy reverse proxy at `pc.{username}.{domain}` which enforces LivOS JWT auth via cookie check (the pattern already exists in `caddy.ts` for native app subdomains).
3. Use UFW/iptables to explicitly block external access to VNC ports: `ufw deny 5900:5999/tcp`.
4. Do NOT rely on VNC's built-in password auth -- it is insecure by design.
5. If running VNC in Docker, use `127.0.0.1:5900:5900` port mapping (not `5900:5900` which binds to all interfaces).

**Warning signs:**
- `ss -tlnp | grep 590` shows 0.0.0.0 instead of 127.0.0.1
- `nmap -p 5900 <server-ip>` shows port open from outside
- Docker `docker ps` shows `0.0.0.0:5900->5900` instead of `127.0.0.1:5900->5900`

**Phase to address:**
Phase 1 (VNC server setup) -- binding and firewall rules must be hardcoded from day one. No "we'll add auth later."

---

### Pitfall 4: Headless Server Has No Display -- VNC Server Fails to Start

**What goes wrong:**
Most LivOS target servers are headless VPS/cloud instances with no physical monitor, no GPU, and no display manager running. VNC servers that attach to an existing display (x11vnc) will fail because there is no display to attach to. Even servers with a GPU but no monitor attached will have the GPU driver refuse to create a framebuffer.

**Why it happens:**
Two distinct scenarios get conflated:
1. **Server with GUI installed but no monitor**: GPU driver has no EDID data, refuses framebuffer allocation. Display manager may be running but Xorg crashes.
2. **Server with no GUI at all**: No X server, no display manager, `systemctl get-default` returns `multi-user.target` not `graphical.target`.

Developers test on their desktop with a monitor -- everything works. Deploy to headless VPS -- nothing works.

**How to avoid:**
1. Detection script in install.sh must distinguish three states:
   - **Has GUI + display**: Stream existing desktop (attach to existing X/Wayland session)
   - **Has GUI packages but no display (headless with DE installed)**: Use virtual framebuffer (Xvfb) or KasmVNC's built-in virtual X server
   - **No GUI at all**: Skip desktop streaming, mark feature as unavailable, inform user
2. Detection approach:
   ```bash
   # Check systemd target
   DEFAULT_TARGET=$(systemctl get-default 2>/dev/null)
   # Check if any display server is running
   HAS_DISPLAY=$(loginctl show-session $(loginctl list-sessions --no-legend | head -1 | awk '{print $1}') -p Type --value 2>/dev/null)
   # Check if desktop packages exist
   HAS_DE=$(dpkg -l | grep -E "ubuntu-desktop|gnome-shell|kde-plasma|xfce4" 2>/dev/null)
   ```
3. For headless servers with no GUI: optionally offer to install a minimal desktop (Xfce4 + Xvfb) but make it opt-in, not automatic -- it pulls 500MB+ of packages.

**Warning signs:**
- VNC server fails with "Xlib: connection to :0 refused" or "cannot open display"
- Works on mini PC (has monitor) but fails on Contabo VPS
- `echo $DISPLAY` returns empty

**Phase to address:**
Phase 1 (install.sh) -- detection must be the first gate before any VNC-related installation.

---

### Pitfall 5: Docker Container Cannot Access Host X11 Display

**What goes wrong:**
If the VNC/streaming server runs inside a Docker container (for isolation), it cannot access the host's X11 display by default. X11 socket forwarding (`/tmp/.X11-unix`) requires UID matching and xhost permissions. Docker Desktop on Linux cannot even expose Unix sockets to containers. The container sees no display and crashes.

**Why it happens:**
Docker's filesystem and network isolation explicitly prevents container processes from accessing host resources. X11 has a client-server architecture where the display socket is local to the host. Three separate mechanisms must align: socket mounting, DISPLAY variable, and X11 auth cookies (`.Xauthority`).

**How to avoid:**
1. **Preferred: Run VNC server on the host, not in Docker.** Install as a systemd service (like the existing NativeApp pattern in `native-app.ts`). This avoids all Docker-display complexity.
2. If Docker is required for isolation:
   - Mount X11 socket: `-v /tmp/.X11-unix:/tmp/.X11-unix`
   - Pass DISPLAY: `-e DISPLAY=$DISPLAY`
   - Pass Xauthority: `-v $HOME/.Xauthority:/root/.Xauthority -e XAUTHORITY=/root/.Xauthority`
   - Run with `--network host` (required for X11 socket communication)
   - Run `xhost +local:docker` on host (security risk -- weakens X11 access control)
3. **Best approach for LivOS: KasmVNC in Docker with its own virtual X server.** This means the container doesn't need host display access -- it creates its own desktop session inside the container. But this streams a virtual desktop, NOT the host's actual desktop.
4. For streaming the actual host desktop: must run on host via systemd (NativeApp pattern).

**Warning signs:**
- Container logs show "cannot connect to X server"
- Docker Compose has no volume mounts for X11 socket
- Works with `docker run` manually but fails in compose (forgot env/volume)

**Phase to address:**
Phase 1 (architecture decision) -- decide Docker vs host early. Mixing later causes rewrites.

---

### Pitfall 6: WebSocket Proxy Timeout Disconnects Idle Desktop Sessions

**What goes wrong:**
Users step away from their desktop stream for 2 minutes, come back, and it's dead. The reverse proxy (Caddy, Nginx) has a default idle timeout of 60 seconds for proxied connections. If no pixels change on screen (static desktop), no data flows through the WebSocket, and the proxy kills it.

**Why it happens:**
Reverse proxies assume HTTP request-response patterns where 60 seconds without data means a dead connection. VNC over WebSocket is a long-lived streaming connection where idle periods (no screen changes) are normal and expected. Caddy's default `read_timeout` and `write_timeout` apply to WebSocket connections too.

**How to avoid:**
1. Configure Caddy's reverse_proxy block for the desktop stream with explicit timeouts:
   ```caddyfile
   pc.{domain} {
       reverse_proxy 127.0.0.1:{vnc_port} {
           transport http {
               read_timeout 0
               write_timeout 0
           }
       }
   }
   ```
   Setting to `0` disables timeout (use `stream_timeout 24h` for an upper bound instead).
2. Implement WebSocket ping/pong heartbeat at 25-second intervals in the VNC client/server. This keeps the connection alive through any intermediate proxy, firewall, or NAT. 25 seconds clears the 30-second cellular NAT timeout.
3. noVNC and KasmVNC both support WebSocket ping frames -- ensure they are enabled in configuration.

**Warning signs:**
- Stream disconnects after exactly 60 seconds of inactivity (proxy default)
- Screensaver triggers, desktop goes static, stream dies
- Works fine during active mouse movement, dies when idle

**Phase to address:**
Phase 1 (Caddy config) -- must be in the initial reverse_proxy configuration.

---

### Pitfall 7: Port Conflict Between VNC Server and Existing Docker Apps

**What goes wrong:**
VNC defaults to port 5900 (or 5900+display number). noVNC web client defaults to port 6080. These may conflict with existing Docker app port allocations in LivOS, which start at port 10000+ for per-user containers but use various lower ports for builtin apps (8080, 8081, 8085, 3100, 2283). If a future builtin app or user-configured service uses 5900 or 6080, the VNC server fails to start.

**Why it happens:**
LivOS has a port allocation system starting at 10000 for per-user apps (`database/index.ts` line 458), but VNC/noVNC ports are below this range. Hard-coding VNC to 5900 and noVNC to 6080 creates an implicit dependency on those ports being free. Docker and UFW interact poorly -- Docker bypasses UFW rules entirely via iptables nat table, so a Docker container binding to 5900 will silently steal the port.

**How to avoid:**
1. Use LivOS's existing port allocation system. Register the VNC server's ports through the database allocator (starting at 10000+) instead of hard-coding 5900/6080.
2. If fixed ports are needed for simplicity, pick a non-standard range unlikely to conflict (e.g., 15900 for VNC, 16080 for noVNC web).
3. Always check port availability before starting: `ss -tlnp | grep :${PORT}`.
4. Document the reserved ports in the install script and add them to a port registry.
5. For multi-user: each user's desktop session needs a unique VNC port. Use the existing `nextAvailablePort()` function from the database module.

**Warning signs:**
- VNC server fails with "address already in use"
- Starting a new Docker app kills the desktop stream (port stolen)
- `docker ps` shows a container bound to the VNC port

**Phase to address:**
Phase 1 (architecture) -- port strategy must be decided alongside the existing allocation system.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hard-code VNC to port 5900 | Simple setup, no port allocation logic | Conflicts with Docker apps, can't do multi-user | Never -- use dynamic ports from day one |
| Skip Wayland detection, assume X11 | Works on test systems | Breaks on Ubuntu 24.04+ (majority of new installs) | Never -- Ubuntu 24.04 is Wayland by default |
| Use VNC built-in password auth | Quick "security" win | False security -- DES-based, trivially crackable | Only as a defense-in-depth layer behind JWT |
| Run VNC as root | Avoids permission issues | Root-level RCE if VNC is compromised | Never -- run as the desktop user |
| Ship Xvfb for all servers | Works everywhere, no detection needed | Wastes RAM, gives virtual desktop instead of real one on GUI servers | Only for headless servers as fallback |
| Inline WebSocket proxy config | Fast to ship | Duplicated timeout/header config, hard to maintain | MVP only -- extract to shared Caddy template |
| Skip auto-reconnect in client | Simpler client code | Every Caddy reload, network blip, or proxy restart kills the session permanently | Never -- auto-reconnect is table stakes for remote desktop |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Caddy reverse proxy** | Forgetting WebSocket upgrade headers or timeout config | Caddy auto-handles WS upgrades, but you must set `stream_close_delay`, `stream_timeout`, and disable read/write timeouts for the VNC proxy block |
| **LivOS JWT auth** | Checking JWT on initial HTTP request but not on WebSocket upgrade | Validate JWT cookie in the Caddy `@notauth` matcher (existing pattern in `caddy.ts` native app blocks), AND validate again on WebSocket upgrade in the VNC proxy layer |
| **Docker UFW firewall** | Assuming UFW blocks VNC port from external access | Docker bypasses UFW entirely via iptables nat table. Must bind VNC to `127.0.0.1` explicitly AND add iptables DROP rule for the port |
| **install.sh** | Running VNC setup before checking for display server | Detection must be the first step: `systemctl get-default`, `$XDG_SESSION_TYPE`, check for X/Wayland process |
| **Multi-user sessions** | Sharing a single VNC server across users | Each user needs their own VNC server instance with unique port, using the existing per-user Docker isolation pattern |
| **Caddy config generation** | Adding `pc.{domain}` block but not handling the case where domain isn't configured yet (tunnel mode or IP-only) | Check `config.mainDomain` and `tunnel` flag in `generateFullCaddyfile()` -- desktop streaming subdomain needs the same conditional logic as app subdomains |
| **PM2/systemd service** | Starting VNC server before the display manager has initialized the X session | Use systemd `After=display-manager.service` and add a startup probe that checks for the X socket before declaring ready |
| **Caddy TLS certificates** | Adding `pc.{domain}` subdomain without ensuring wildcard cert covers it | The relay Caddyfile uses `*.livinity.io` and `*.*.livinity.io` with on_demand TLS -- `pc.username.livinity.io` is a 3rd-level subdomain and needs the `*.*.livinity.io` block to match |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| **Uncompressed VNC encoding** | 50+ Mbps bandwidth for 1080p desktop, laggy on slow connections | Use WebP/JPEG adaptive encoding (KasmVNC default). Set `PreferBandwidth` for remote users on slow links | Immediately on anything slower than LAN |
| **Lossless encoding over WAN** | Saturates connection, frames drop, 1+ second lag | Reserve lossless mode for LAN only. Default to lossy JPEG/WebP with DynamicQualityMax for remote access | Any connection under 100 Mbps at 1080p |
| **No resolution scaling** | Streaming 4K desktop to mobile browser uses 4x bandwidth of 1080p | Implement server-side scaling -- KasmVNC's video mode scales resolution down server-side, then scales up client-side. Much better than client scaling | 3+ simultaneous sessions, or any mobile client |
| **Software rendering without GPU** | High CPU usage (50%+) for VNC encoding, laggy for all users | Use hardware encoding (NVENC for NVIDIA, VA-API for Intel) when GPU is available. Fall back to optimized software encoding (libjpeg-turbo) on headless VPS | 2+ simultaneous users on a VPS without GPU |
| **Full-screen updates on every frame** | Sends entire screen even for cursor blink | Use damage tracking / incremental updates (built into VNC protocol but must be enabled). KasmVNC's EncodeManager tracks per-rectangle update frequency | Any production use -- full-frame is demo-only |
| **noVNC client-side rendering bottleneck** | Browser tab uses 100% CPU, frames drop | noVNC processes binary VNC data in JavaScript which is CPU-heavy. KasmVNC's web client is optimized for this. If using noVNC, ensure WebSocket binary mode (not base64) | Resolutions above 1080p or frame rates above 30fps |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| **VNC port exposed to internet** | Full desktop takeover -- attacker controls mouse, keyboard, sees all screens. Over 8,000 exposed VNC servers found by Cyble in 2024 | Bind to 127.0.0.1 only, block with firewall, all access through authenticated Caddy proxy |
| **VNC password as only auth** | VNC uses DES encryption for auth -- crackable in minutes. CVE-2006-2369 showed client can bypass to "None" auth type | Never rely on VNC auth. Use LivOS JWT as the authentication layer. VNC password is defense-in-depth only |
| **WebSocket connection without origin validation** | Cross-site WebSocket hijacking -- malicious page can connect to VNC WebSocket if user is authenticated | Validate `Origin` header on WebSocket upgrade. Reject connections from unexpected origins |
| **Running VNC server as root** | Any VNC vulnerability gives attacker root shell on the server | Run VNC as the desktop user (not root). Use systemd `User=` directive or Docker `--user` |
| **Clipboard forwarding without sanitization** | Clipboard sync can exfiltrate sensitive data (passwords, tokens) or inject malicious commands | Implement clipboard size limits, disable auto-sync by default, require explicit user action for paste operations |
| **Session not invalidated on logout** | VNC session persists after user logs out of LivOS, allowing continued access | Tie VNC session lifecycle to LivOS JWT session. When JWT expires or user logs out, kill the VNC server process |
| **No rate limiting on failed auth** | Brute force attacks on the auth endpoint | Apply existing LivOS rate limiting to the `pc.*` subdomain auth flow |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| **No loading state during VNC connection** | User sees blank screen for 3-5 seconds, thinks it's broken | Show "Connecting to desktop..." spinner with progress steps (authenticating, establishing connection, waiting for first frame) |
| **Resolution mismatch between server and browser** | Desktop is tiny in a large browser window, or requires horizontal scrolling | Auto-detect browser viewport size, send it to VNC server, let server adjust via xrandr. KasmVNC supports dynamic resolution |
| **No keyboard shortcut passthrough** | Ctrl+W closes the browser tab instead of the remote window. Alt+Tab switches local windows | Implement keyboard grab/capture mode with a toggle hotkey. noVNC uses Ctrl+Alt+Shift to toggle. Must be discoverable |
| **Input lag not communicated** | User clicks, nothing happens for 500ms, clicks again, gets double-action | Show network latency indicator. Highlight cursor position on remote desktop to show where click landed. Add visual feedback for input events |
| **No graceful handling of headless servers** | User sees "Desktop Streaming" in UI, clicks it, gets cryptic error about no display | If install.sh detected headless, hide the desktop streaming feature entirely from the UI. Don't show it as "disabled" -- hide it. Offer setup instructions if user wants to add a desktop |
| **Full-screen mode quirks** | Browser's fullscreen API conflicts with remote desktop fullscreen. Escape exits fullscreen instead of sending Escape to remote | Use requestFullscreen() on the canvas element. Intercept Escape to send to remote first, double-Escape to exit fullscreen |

## "Looks Done But Isn't" Checklist

- [ ] **VNC binding**: Server listens on 127.0.0.1 not 0.0.0.0 -- verify with `ss -tlnp | grep vnc`
- [ ] **WebSocket timeout**: Caddy config has explicit timeout overrides for pc.* block -- verify desktop survives 5 minutes idle
- [ ] **Caddy reload survival**: Desktop stream reconnects after `caddy reload` -- verify by reloading while streaming
- [ ] **Multi-user isolation**: User A cannot see User B's desktop -- verify by logging in as two users simultaneously
- [ ] **JWT auth on WebSocket**: Unauthenticated WebSocket connection is rejected -- verify by connecting without cookie
- [ ] **Headless detection**: install.sh correctly identifies server without GUI -- verify on a fresh VPS with no desktop
- [ ] **Wayland detection**: install.sh handles Wayland session correctly -- verify on Ubuntu 24.04 with default settings
- [ ] **Firewall**: VNC port blocked from external -- verify with `nmap -p 5900-5999 <external-ip>` from a remote host
- [ ] **Resolution handling**: Browser resize triggers remote desktop resize -- verify by resizing browser window
- [ ] **Clipboard**: Copy from remote, paste to local works -- verify bidirectional clipboard
- [ ] **Keyboard capture**: Ctrl+C sends to remote desktop, not browser -- verify with a terminal open in remote desktop
- [ ] **Auto-reconnect**: Network blip recovers automatically -- verify by toggling wifi/network briefly
- [ ] **Session cleanup**: Logging out of LivOS terminates VNC session -- verify VNC port closes after logout
- [ ] **Certificate coverage**: `pc.username.livinity.io` gets valid TLS cert -- verify no cert error in browser

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| VNC exposed to internet | HIGH | Immediately bind to 127.0.0.1, block firewall port, rotate all passwords, audit access logs for unauthorized sessions, check for persistence mechanisms |
| Caddy reload kills sessions | LOW | Add `stream_close_delay` and `stream_timeout` to Caddyfile, deploy. Client auto-reconnect mitigates until fix is deployed |
| Wayland detection broken | MEDIUM | Patch install.sh detection logic, re-run detection on affected servers, offer manual override flag (`--force-x11` / `--force-wayland`) |
| Port conflict | LOW | Stop conflicting service, change VNC port to dynamic allocation, restart. No data loss |
| Docker can't access display | HIGH if architecture was Docker-based | Must refactor to host-based systemd service (NativeApp pattern). This is a fundamental architecture change |
| WebSocket timeouts | LOW | Update Caddy config, reload. No code changes needed |
| Resolution mismatch | LOW | Add xrandr integration to VNC startup script, implement client-side resize event handler |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Caddy reload kills streams | Phase 1: Caddy integration | Stream survives `caddy reload` during active session |
| Wayland detection failure | Phase 1: install.sh detection | Tested on Ubuntu 24.04 Wayland, 22.04 X11, and headless VPS |
| VNC exposed without auth | Phase 1: VNC server setup | External port scan shows 5900-5999 closed, internal shows 127.0.0.1 binding |
| Headless server failure | Phase 1: install.sh detection | Tested on fresh VPS with `multi-user.target`, no GUI packages |
| Docker display access | Phase 1: architecture decision | Chosen approach (host systemd vs Docker) documented, tested |
| WebSocket timeout | Phase 1: Caddy config | 5-minute idle desktop session survives without disconnect |
| Port conflicts | Phase 1: port allocation | VNC uses dynamic port from LivOS allocator, no hard-coded ports |
| JWT auth bypass | Phase 2: auth integration | Unauthenticated WebSocket rejected, JWT expiry kills VNC session |
| Resolution mismatch | Phase 2: client UX | Browser resize triggers server-side resolution change |
| Clipboard issues | Phase 3: polish | Bidirectional clipboard works with text, size-limited |
| Keyboard capture | Phase 2: client UX | Ctrl+C/Ctrl+V go to remote, toggle hotkey documented |
| Multi-user session isolation | Phase 2: multi-user | Two users get independent VNC servers on different ports |
| GPU/encoding performance | Phase 3: optimization | Hardware encoding used when GPU present, graceful CPU fallback |
| Auto-reconnect missing | Phase 2: client resilience | Client recovers from 5-second network interruption without user action |

## Sources

- [Caddy issue #6420: Active websocket connections closed on config reload](https://github.com/caddyserver/caddy/issues/6420)
- [Caddy issue #7222: Preserve active websocket connections when unrelated routes are updated](https://github.com/caddyserver/caddy/issues/7222)
- [Caddy reverse_proxy documentation (stream_close_delay, stream_timeout)](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [noVNC wiki: Proxying with nginx (WebSocket timeout gotchas)](https://github.com/novnc/noVNC/wiki/Proxying-with-nginx)
- [noVNC issue #658: Nginx reverse proxy timeout](https://github.com/novnc/noVNC/issues/658)
- [TigerVNC issue #1775: Websockify disconnects after 1 minute idle](https://github.com/TigerVNC/tigervnc/issues/1775)
- [SecurityWeek: Thousands of VNC Instances Exposed to Internet](https://www.securityweek.com/thousands-vnc-instances-exposed-internet-attacks-increase/)
- [KasmVNC GPU Acceleration documentation](https://kasmweb.com/kasmvnc/docs/master/gpu_acceleration.html)
- [KasmVNC Video Rendering Options wiki](https://github.com/kasmtech/KasmVNC/wiki/Video-Rendering-Options)
- [Arch Wiki: Headless (virtual framebuffer, display detection)](https://wiki.archlinux.org/title/Headless)
- [Arch Wiki: X11vnc (clipboard, startup, configuration)](https://wiki.archlinux.org/title/X11vnc)
- [Ubuntu Wayland detection and fallback guide](https://linuxconfig.org/how-to-enable-disable-wayland-on-ubuntu-22-04-desktop)
- [Docker packet filtering and firewalls documentation](https://docs.docker.com/engine/network/packet-filtering-firewalls/)
- [ufw-docker: Fix Docker and UFW security flaw](https://github.com/chaifeng/ufw-docker)
- [WebSocket.org: Fix WebSocket Timeout and Silent Dropped Connections](https://websocket.org/guides/troubleshooting/timeout/)
- [Cendio: Guide to securing remote desktop access on Linux in 2025](https://www.cendio.com/blog/guide-to-securing-remote-desktop-access-on-linux-in-2025/)
- [x11vnc clipboard issues (LibVNC/x11vnc #260)](https://github.com/LibVNC/x11vnc/issues/260)

---
*Pitfalls research for: Adding web-based remote desktop streaming to LivOS self-hosted AI server platform*
*Researched: 2026-03-25*
