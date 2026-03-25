# Architecture Research: Web-Based Remote Desktop Streaming for LivOS

**Domain:** Web-based remote desktop streaming integration with existing self-hosted server platform
**Researched:** 2026-03-25
**Confidence:** HIGH (existing codebase thoroughly analyzed, proven open-source components)

## Decision: x11vnc + noVNC + Node.js WebSocket Proxy (Not KasmVNC)

After evaluating the ecosystem, the recommended architecture is:

- **x11vnc** captures the host's physical X11 display (:0) as a VNC stream
- **noVNC** (via `@novnc/novnc` npm package or `react-vnc`) renders the desktop in the browser
- **A Node.js WebSocket proxy** (built into livinityd) bridges noVNC to x11vnc, enforcing JWT auth before any VNC frames flow

**Why not KasmVNC?** KasmVNC is superior in raw performance (60fps, QOI encoding, built-in web server) but is designed primarily for virtual displays and containerized desktops. Capturing an existing physical display requires `kasmxproxy`, which adds complexity and has documented issues with physical displays. KasmVNC also breaks RFB compatibility, making it harder to debug. For v18.0 scope -- streaming an existing Linux desktop at acceptable latency on a LAN/tunnel -- x11vnc + noVNC is simpler, battle-tested, and integrates cleanly with the existing Node.js middleware stack.

**Why not Apache Guacamole?** Guacamole is a Java servlet container (requires Tomcat) with its own auth system. It is architecturally heavy for a single-purpose integration. LivOS already has JWT auth, Express middleware, and Caddy routing. Guacamole would be a parallel auth/proxy stack fighting the existing one.

## System Overview

```
Browser (pc.{username}.livinity.io)
    |
    | HTTPS (WebSocket upgrade)
    |
[Caddy] ---- reverse_proxy ---> [livinityd :8080]
    |                                |
    |                           [Auth Middleware]
    |                           JWT cookie check
    |                                |
    |                           [WebSocket Proxy]
    |                           /ws/desktop route
    |                                |
    |                           TCP connection
    |                                |
                                [x11vnc :5900]
                                captures :0 display
                                (host native process)
```

### For Tunnel Users (livinity.io relay):

```
Browser (pc.{username}.livinity.io)
    |
    | HTTPS
    |
[Relay Server5] --- tunnel WebSocket ---> [LivOS client]
    |                                          |
    | subdomain: pc.{username}            [livinityd :8080]
    | parsed as appName="pc"                   |
    |                                     [Auth + WS Proxy]
    |                                          |
                                          [x11vnc :5900]
```

The relay already supports `*.*.livinity.io` in its Caddyfile and the subdomain parser correctly extracts `appName="pc"` from `pc.{username}.livinity.io`. No relay changes needed.

## Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| **x11vnc** | Capture host display :0, serve VNC on localhost:5900 | NEW: installed by install.sh |
| **noVNC client** | Browser-side JavaScript VNC renderer | NEW: served as static assets or embedded in LivOS UI |
| **WebSocket proxy** (livinityd) | Bridge browser WebSocket to x11vnc TCP:5900, enforce JWT auth | NEW: new route in server/index.ts |
| **Caddy subdomain block** | Route `pc.{domain}` to livinityd:8080 | MODIFIED: add to generateFullCaddyfile nativeApps |
| **install.sh** | Detect GUI, install x11vnc, create systemd service | MODIFIED: new detection + install functions |
| **NativeApp registry** | Manage x11vnc lifecycle (start/stop/idle timeout) | MODIFIED: add desktop-stream config to NATIVE_APP_CONFIGS |
| **React UI** | Desktop viewer component embedded in LivOS window or standalone page | NEW: VncViewer component |

## Detailed Data Flow

### 1. Desktop Stream Connection Flow

```
1. User navigates to pc.{domain} OR opens Desktop Viewer in LivOS UI
    |
2. Caddy matches pc.{domain} block, reverse_proxies to 127.0.0.1:8080
    |
3. livinityd receives request:
   a. If HTTP GET /desktop -> serve noVNC HTML page (standalone mode)
   b. If WebSocket upgrade to /ws/desktop -> proceed to step 4
    |
4. Auth middleware extracts JWT from:
   - LIVINITY_SESSION cookie (subdomain mode)
   - ?token= query param (WebSocket mode, like existing WS pattern)
    |
5. If valid JWT -> create TCP connection to localhost:5900
    |
6. Bidirectional frame relay:
   Browser WS frames <---> TCP VNC frames to x11vnc
    |
7. On disconnect or idle timeout -> close TCP + WS connections
```

### 2. Auto-Start Flow (Lazy Initialization)

```
1. First connection to /ws/desktop arrives
    |
2. Check if x11vnc is running (NativeApp.getStatus())
    |
3. If not running:
   a. Detect display server (X11 vs Wayland vs headless)
   b. If headless -> return error "No display available"
   c. Start x11vnc via systemd (NativeApp.start())
   d. Wait for port 5900 to be available (existing poll loop)
    |
4. Reset idle timer (existing NativeApp.resetIdleTimer())
    |
5. Proceed with WebSocket proxy connection
```

### 3. Caddy Configuration Generation

The existing `generateFullCaddyfile()` already accepts a `nativeApps` parameter for JWT-gated Caddy blocks. The desktop streaming service fits this pattern exactly:

```typescript
// In NATIVE_APP_CONFIGS (or dynamically when desktop streaming is enabled)
{
  id: 'desktop-stream',
  serviceName: 'livos-x11vnc',
  port: 6080, // noVNC WebSocket proxy port (served by livinityd, not a separate process)
  idleTimeoutMs: 30 * 60 * 1000 // 30 min idle timeout
}
```

However, since the WebSocket proxy is INSIDE livinityd (port 8080), not a separate port, the Caddy block for `pc.{domain}` should route to 8080 just like other subdomain blocks. The nativeApps Caddy pattern with cookie-check redirect already handles auth at the Caddy level:

```caddy
pc.{domain} {
    @notauth {
        not {
            header Cookie *livinity_token=*
        }
    }
    handle @notauth {
        redir https://{domain}/login?redirect={scheme}://{host}{uri}
    }
    reverse_proxy 127.0.0.1:8080
}
```

This is a Caddy-level pre-check. The real JWT verification happens in livinityd's WebSocket upgrade handler (defense in depth).

## Recommended Architecture Pattern: Integrated WebSocket Proxy

### Pattern: WebSocket-to-TCP Bridge Inside livinityd

**What:** Instead of running websockify as a separate process (Python or Node.js), build the WebSocket-to-TCP bridge directly into livinityd's existing WebSocket upgrade handler.

**Why this pattern:**
- livinityd already has a WebSocket upgrade handler with auth verification (server/index.ts line 359)
- Existing patterns: /terminal, /ws/docker-exec, /ws/voice all use the same `mountWebSocketServer` + auth flow
- No additional process to manage, no additional port to configure
- JWT auth is already implemented in the upgrade handler

**Trade-offs:**
- Pro: Zero new infrastructure, uses proven auth flow, single process
- Pro: Works with both direct domain and tunnel relay (relay proxies WS natively)
- Con: VNC binary frames through Node.js add some overhead vs native C proxy
- Con: Node.js single-thread could bottleneck under heavy frame rates (mitigated: VNC is low bandwidth, typically 1-5 Mbps)

**Implementation sketch:**

```typescript
// In server/index.ts -- mount alongside existing WS handlers

import { createConnection } from 'node:net'

this.mountWebSocketServer('/ws/desktop', (wss) => {
    wss.on('connection', (ws, req) => {
        // Ensure desktop streaming service is running
        const desktopApp = this.livinityd.apps.getNativeApp('desktop-stream')
        if (!desktopApp || desktopApp.state !== 'ready') {
            ws.close(1013, 'Desktop streaming not available')
            return
        }

        // Reset idle timer on each connection (heartbeat)
        desktopApp.resetIdleTimer()

        // Create TCP connection to x11vnc
        const vnc = createConnection({ host: '127.0.0.1', port: 5900 })

        vnc.on('connect', () => {
            // Bidirectional relay
            ws.on('message', (data) => {
                if (vnc.writable) vnc.write(Buffer.from(data as ArrayBuffer))
            })
            vnc.on('data', (data) => {
                if (ws.readyState === 1) ws.send(data)
            })
        })

        // Cleanup
        ws.on('close', () => vnc.destroy())
        vnc.on('close', () => ws.close())
        vnc.on('error', () => ws.close(1011, 'VNC connection error'))
        ws.on('error', () => vnc.destroy())
    })
})
```

This is the exact same pattern used for the existing voice WebSocket proxy (line 476-539 in server/index.ts) and Docker exec WebSocket handler.

## Alternative Pattern Considered: Standalone websockify Process

**What:** Run websockify (Python or Node.js) as a separate systemd service on port 6080, have Caddy route directly to it.

**Why rejected:**
- Requires separate auth mechanism (websockify auth plugins are limited)
- Additional systemd service to manage
- Additional port (6080) to open in firewall and Caddy
- Duplicates auth logic that already exists in livinityd
- Breaks the "everything through livinityd" routing pattern

## New vs Modified Components

### NEW Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Desktop WS proxy route | `livinityd/source/modules/server/index.ts` | `/ws/desktop` WebSocket-to-TCP bridge |
| Desktop detection module | `livinityd/source/modules/desktop/detect.ts` | Detect X11/Wayland/headless, DISPLAY env |
| Desktop streaming module | `livinityd/source/modules/desktop/index.ts` | Manages x11vnc lifecycle, coordinates start/stop |
| VncViewer React component | `ui/src/components/desktop/VncViewer.tsx` | noVNC wrapper for browser-side rendering |
| Desktop viewer page/window | `ui/src/routes/desktop.tsx` or window component | Standalone page or LivOS window for desktop view |
| x11vnc systemd service | `/etc/systemd/system/livos-x11vnc.service` | Created by install.sh |

### MODIFIED Components

| Component | Location | Change |
|-----------|----------|--------|
| `install.sh` | `livos/install.sh` | Add `detect_gui()`, `install_x11vnc()`, `setup_desktop_streaming()` functions |
| `native-app.ts` | `livinityd/source/modules/apps/native-app.ts` | Add desktop-stream to NATIVE_APP_CONFIGS |
| `caddy.ts` | `livinityd/source/modules/domain/caddy.ts` | Desktop subdomain included in nativeApps array for Caddy generation |
| `server/index.ts` | `livinityd/source/modules/server/index.ts` | Add `/ws/desktop` mount + desktop subdomain handling in app gateway |
| CSP directives | `server/index.ts` helmet config | Add `connect-src` for desktop WebSocket if served on subdomain |

### UNCHANGED Components

| Component | Why Unchanged |
|-----------|---------------|
| Relay (platform/relay) | Already handles `*.*.livinity.io` with WS proxying |
| JWT / auth middleware | Reused as-is for desktop stream auth |
| Redis | No new keys needed (NativeApp state is in-memory) |
| PostgreSQL | No schema changes needed |
| App gateway middleware | Desktop stream handled via subdomain Caddy block, not app gateway |

## install.sh Modifications

### New Functions

```bash
# 1. GUI Detection
detect_gui() {
    # Check for running display server
    if command -v loginctl &>/dev/null; then
        SESSION_TYPE=$(loginctl show-session $(loginctl | grep "seat" | head -1 | awk '{print $1}') \
            -p Type --value 2>/dev/null)
    fi

    # Fallback: check for X11 socket
    if [[ -z "$SESSION_TYPE" ]]; then
        if [[ -e /tmp/.X11-unix/X0 ]]; then
            SESSION_TYPE="x11"
        fi
    fi

    # Fallback: check for Wayland socket
    if [[ -z "$SESSION_TYPE" ]]; then
        if [[ -n "$WAYLAND_DISPLAY" ]] || ls /run/user/*/wayland-* &>/dev/null 2>&1; then
            SESSION_TYPE="wayland"
        fi
    fi

    case "$SESSION_TYPE" in
        x11)
            HAS_GUI=true
            GUI_TYPE="x11"
            ok "Display server detected: X11"
            ;;
        wayland)
            HAS_GUI=true
            GUI_TYPE="wayland"
            warn "Wayland detected -- x11vnc requires XWayland or wayvnc"
            ;;
        *)
            HAS_GUI=false
            GUI_TYPE="none"
            info "No GUI detected (headless server) -- desktop streaming skipped"
            ;;
    esac
}

# 2. x11vnc Installation
install_x11vnc() {
    if ! $HAS_GUI; then
        info "Skipping x11vnc (no GUI detected)"
        return 0
    fi

    if command -v x11vnc &>/dev/null; then
        ok "x11vnc already installed"
        return 0
    fi

    info "Installing x11vnc for desktop streaming..."
    apt-get install -y -qq x11vnc
    ok "x11vnc installed"
}

# 3. Desktop Streaming Service Setup
setup_desktop_streaming() {
    if ! $HAS_GUI; then return 0; fi

    local vnc_password
    vnc_password=$(openssl rand -hex 16)

    # Store VNC password for x11vnc
    mkdir -p /opt/livos/data/secrets
    x11vnc -storepasswd "$vnc_password" /opt/livos/data/secrets/vncpasswd

    # Create systemd service
    cat > /etc/systemd/system/livos-x11vnc.service << UNIT
[Unit]
Description=LivOS Desktop Streaming (x11vnc)
After=display-manager.service

[Service]
Type=simple
User=root
ExecStart=/usr/bin/x11vnc -display :0 -rfbauth /opt/livos/data/secrets/vncpasswd \
    -rfbport 5900 -localhost -shared -forever -noxdamage -ncache 10 -threads
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

    systemctl daemon-reload
    # Do NOT enable by default -- started on-demand by NativeApp
    ok "Desktop streaming service created (livos-x11vnc)"

    # Store VNC password in Redis for livinityd's WebSocket proxy
    local redis_pass
    redis_pass=$(echo "$REDIS_URL" | sed -n 's|redis://:\(.*\)@.*|\1|p')
    if [[ -n "$redis_pass" ]]; then
        redis-cli -a "$redis_pass" SET livos:desktop:vnc_password "$vnc_password" 2>/dev/null
    fi
}
```

### Integration Points in install.sh Main Flow

```bash
# After detect_os / detect_arch
detect_gui

# After install_caddy
install_x11vnc

# After create_systemd_service
setup_desktop_streaming
```

### x11vnc Flags Rationale

| Flag | Purpose |
|------|---------|
| `-display :0` | Capture the physical display |
| `-rfbauth ...` | Password protect VNC (defense in depth behind JWT) |
| `-rfbport 5900` | Standard VNC port, localhost only |
| `-localhost` | Only accept connections from 127.0.0.1 (critical security) |
| `-shared` | Allow multiple viewers |
| `-forever` | Don't exit after first client disconnects |
| `-noxdamage` | Avoid X Damage extension issues on some compositors |
| `-ncache 10` | Client-side pixel caching for better performance |
| `-threads` | Threaded mode for better responsiveness |

## Caddy Configuration Approach

### Direct Domain Mode

The `generateFullCaddyfile()` function already supports native app subdomains with JWT cookie gating. The desktop stream becomes another entry:

```typescript
// In apps.ts rebuildCaddy(), nativeAppSubdomains array:
nativeAppSubdomains.push({
    subdomain: 'pc',
    port: 8080  // Routes to livinityd, not x11vnc directly
})
```

This generates:

```caddy
pc.example.com {
    @notauth {
        not {
            header Cookie *livinity_token=*
        }
    }
    handle @notauth {
        redir https://example.com/login?redirect={scheme}://{host}{uri}
    }
    reverse_proxy 127.0.0.1:8080
}
```

### Tunnel Mode

No Caddy changes needed. The relay's Caddyfile already handles `*.*.livinity.io`. The subdomain parser correctly parses `pc.{username}.livinity.io` as `appName="pc"`, and the relay forwards both HTTP and WebSocket to the tunnel client.

### Cloudflare Tunnel Mode

When using Cloudflare Tunnel (not the custom relay), the tunnel configuration in Cloudflare Dashboard must add a route for `pc.{domain}` pointing to `http://localhost:8080`. This is a manual step documented in setup.

## Scaling Considerations

| Scale | Approach |
|-------|----------|
| 1 user (typical) | Single x11vnc process, single WS connection. Node.js handles easily. |
| 2-5 concurrent viewers | x11vnc `-shared` flag handles multiple VNC clients. Multiple WS connections in livinityd. No issues. |
| Heavy usage (AI computer use + human viewing) | x11vnc captures display; both the AI agent's screenshot tool and the VNC stream access :0. No conflict -- x11vnc is read-only on the framebuffer. |
| Multi-user (future) | Each user would need their own X session + x11vnc instance. Out of scope for v18.0 (single display). |

### First Bottleneck: Bandwidth

VNC over WebSocket at 1080p typically uses 2-10 Mbps depending on screen change rate. Through the tunnel relay (Server5 with 8GB RAM), this is the first constraint. Mitigation: x11vnc JPEG encoding (lossy, lower bandwidth) and ncache (client-side caching).

### Second Bottleneck: Node.js Frame Relay

Node.js relaying binary VNC frames adds ~1-3ms latency per frame. For interactive desktop use, total latency should stay under 100ms including network. On LAN this is negligible. Through the relay, it adds up but remains acceptable for most use cases.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Running websockify as a Separate Process

**What people do:** Deploy websockify (Python) on port 6080, configure Caddy to proxy to it, implement separate auth.
**Why it's wrong for LivOS:** Duplicates auth logic, adds process management complexity, breaks the established "livinityd is the single entry point" pattern. The existing server already handles WebSocket upgrades with JWT verification.
**Do this instead:** Build the WebSocket-to-TCP bridge inside livinityd, reusing the existing auth and WS infrastructure.

### Anti-Pattern 2: Exposing x11vnc Directly to the Network

**What people do:** Run x11vnc without `-localhost`, let Caddy proxy directly to port 5900.
**Why it's wrong:** VNC has weak native auth (DES-based password). Even with Caddy TLS, the VNC port would be accessible from the Docker network or if firewall rules change.
**Do this instead:** x11vnc with `-localhost` (only accepts 127.0.0.1), accessed exclusively through livinityd's authenticated WebSocket proxy.

### Anti-Pattern 3: KasmVNC/Guacamole for Simple Display Capture

**What people do:** Deploy full KasmVNC stack or Guacamole with Tomcat for a single-display streaming use case.
**Why it's wrong for LivOS:** Over-engineering. KasmVNC is designed for containerized desktops with virtual displays. Guacamole requires Java + Tomcat + its own auth + its own DB. Both are heavyweight solutions when the need is "stream display :0 to a browser with JWT auth."
**Do this instead:** x11vnc (proven, simple, captures real displays) + noVNC (proven, standard) + a thin Node.js bridge.

### Anti-Pattern 4: Skipping GUI Detection in install.sh

**What people do:** Always install x11vnc and create the systemd service, even on headless VPS servers.
**Why it's wrong:** Installs unnecessary packages, creates services that will never work, confuses users with broken desktop streaming UI on headless servers.
**Do this instead:** `detect_gui()` function checks for X11/Wayland before installing. On headless servers, skip entirely and hide the UI option.

## Integration Points

### With Existing LivOS Auth System

| Integration | How | Notes |
|-------------|-----|-------|
| JWT verification | Reuse `server.verifyToken()` in WS upgrade handler | Same pattern as /terminal, /ws/docker-exec |
| Cookie check | `LIVINITY_SESSION` cookie from subdomain | Same pattern as app gateway |
| Caddy pre-check | Cookie presence check in Caddy block | Same pattern as nativeApps in caddy.ts |
| Multi-user | `ctx.currentUser` from JWT payload | Admin-only for v18.0 (single display) |

### With Existing NativeApp System

| Integration | How | Notes |
|-------------|-----|-------|
| Lifecycle | `NATIVE_APP_CONFIGS` array + `NativeApp` class | Identical pattern to (previously) Chrome streaming |
| Idle timeout | `resetIdleTimer()` on each WS heartbeat | 30-min default, same as existing native apps |
| Start/stop | `systemctl start/stop livos-x11vnc` | Standard NativeApp pattern |
| Status | `systemctl is-active` check | Used by UI to show streaming status |

### With Caddy Configuration System

| Integration | How | Notes |
|-------------|-----|-------|
| Subdomain block | `nativeAppSubdomains` array in `rebuildCaddy()` | Existing pattern, just add entry |
| HTTPS cert | Caddy auto-obtains cert for `pc.{domain}` | Same Let's Encrypt flow as app subdomains |
| Tunnel mode | No Caddy change needed | Relay handles subdomain routing |

### With AI Computer Use (v15.0/v17.0)

| Integration | How | Notes |
|-------------|-----|-------|
| No conflict | Both access display :0 read-only | x11vnc captures framebuffer; screenshot tool captures framebuffer |
| Synergy | User watches AI work via desktop stream | Desktop stream + AI computer use = live monitoring |
| Future | Could trigger AI computer use from desktop viewer | Out of scope for v18.0 |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Browser <-> livinityd | WebSocket (binary VNC frames) | `/ws/desktop` route |
| livinityd <-> x11vnc | TCP socket to localhost:5900 | Standard VNC protocol (RFB) |
| livinityd <-> NativeApp | In-process method calls | `apps.getNativeApp()` |
| install.sh <-> systemd | `systemctl` commands | Create and manage livos-x11vnc.service |

## Suggested Build Order

Based on dependency analysis of existing components:

1. **install.sh: GUI detection + x11vnc install** (no dependencies, can test independently)
2. **x11vnc systemd service** (depends on 1, can test with manual VNC client)
3. **NativeApp config registration** (depends on 2, uses existing NativeApp class)
4. **WebSocket-to-TCP proxy in livinityd** (depends on 3 for lifecycle management)
5. **Caddy subdomain generation** (depends on 4 being testable, uses existing caddy.ts pattern)
6. **noVNC React component + UI** (depends on 4 being the backend it connects to)
7. **End-to-end testing** (all components integrated)

### Phase 1 should cover: Steps 1-3 (server-side infrastructure)
### Phase 2 should cover: Steps 4-5 (proxy + routing)
### Phase 3 should cover: Steps 6-7 (UI + integration testing)

## Sources

- [Apache Guacamole](https://guacamole.apache.org/) - Evaluated and rejected (too heavyweight)
- [KasmVNC GitHub](https://github.com/kasmtech/KasmVNC) - Evaluated and rejected (container-focused)
- [KasmVNC kasmxproxy docs](https://kasmweb.com/kasmvnc/docs/master/man/kasmxproxy.html) - Physical display proxy limitations
- [noVNC official site](https://novnc.com/noVNC/) - Browser VNC client
- [noVNC GitHub](https://github.com/novnc/noVNC) - Source + library API docs
- [@novnc/novnc npm](https://www.npmjs.com/package/@novnc/novnc) - npm package
- [react-vnc npm](https://www.npmjs.com/package/react-vnc) - React wrapper for noVNC
- [websockify GitHub](https://github.com/novnc/websockify) - WebSocket-to-TCP proxy reference
- [websockify-js GitHub](https://github.com/novnc/websockify-js) - Node.js implementation reference
- [node-websockify](https://github.com/maximegris/node-websockify) - Node.js WebSocket-to-TCP bridge
- [x11vnc GitHub](https://github.com/LibVNC/x11vnc) - VNC server for real X displays
- [Caddy reverse_proxy docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) - WebSocket proxy config
- [caddy-websockify plugin](https://github.com/hadi77ir/caddy-websockify) - Evaluated, not needed
- [Linux display detection](https://www.cyberciti.biz/faq/howto-check-for-wayland-or-x11-with-my-linux-desktop/) - GUI detection approaches
- [noVNC in Node.js + React](https://medium.com/@deepakmukundpur/how-to-use-vnc-in-a-node-js-react-project-with-novnc-83f5c8fae616) - Integration pattern

---
*Architecture research for: v18.0 Remote Desktop Streaming integration with LivOS*
*Researched: 2026-03-25*
