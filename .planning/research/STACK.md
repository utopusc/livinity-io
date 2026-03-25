# Technology Stack: v18.0 Remote Desktop Streaming

**Project:** v18.0 Remote Desktop Streaming
**Researched:** 2026-03-25
**Focus:** Web-based remote desktop streaming for LivOS servers

## What Already Exists (DO NOT re-add)

| Technology | Purpose | Status |
|------------|---------|--------|
| Caddy v2.11 + dns.providers.cloudflare | Reverse proxy, subdomain routing, nativeApps pattern | In use |
| Express + tRPC | Backend API, WebSocket upgrade handlers | In use |
| React 18 + Vite + Tailwind 3.4 | Frontend UI | In use |
| JWT + livinity_token cookie | Authentication, session management | In use |
| install.sh | Server installer with systemd services | In use |
| NativeApp class | Systemd lifecycle, idle timeout, port health-check | In use (empty NATIVE_APP_CONFIGS) |
| Docker + per-user isolation | Container management, per-user compose | In use |

---

## Solution Comparison

| Solution | Web Client | Docker | Latency | X11 | Wayland | GPU Accel | Setup Complexity | Auth Integration |
|----------|-----------|--------|---------|-----|---------|-----------|-----------------|-----------------|
| **Apache Guacamole** | Built-in (Java) | Yes | Medium | Yes | No | No | HIGH (Tomcat + guacd + DB) | Own auth system |
| **noVNC + x11vnc** | Built-in (JS) | Optional | Low | Yes | Via XWayland | No | LOW (2 packages) | None (add own) |
| **KasmVNC** | Built-in (JS) | Yes | Very Low | Own X server | N/A | Yes (WebP) | MEDIUM (custom build) | Own auth |
| **Selkies-GStreamer** | WebRTC | Yes | Very Low | Yes | Yes | Yes (GPU encode) | VERY HIGH (GStreamer pipeline) | OIDC |
| **RustDesk** | Own client | No | Low | Yes | Partial | No | MEDIUM (requires relay) | Own system |
| **Wolf/Sunshine+Moonlight** | Moonlight client | No | Very Low | No | No | REQUIRED (GPU) | HIGH (requires GPU) | PIN-based |

---

## Recommended Stack

### Primary: x11vnc + noVNC + livinityd WebSocket bridge

**Why this combination:**

1. **x11vnc** — Captures the actual host X11 display (not a virtual desktop). Lightweight, single binary, available in Ubuntu/Debian repos. Runs as systemd service with `-localhost` binding.

2. **noVNC** — Pure JavaScript VNC client that runs in any browser. No plugins, no client install. Serves static files. Can be embedded as React component via `@novnc/novnc` npm package or `react-vnc` wrapper.

3. **livinityd WebSocket bridge** — Instead of running websockify as a separate process, route WebSocket connections through livinityd's existing WS infrastructure. Pattern already proven: `/terminal`, `/ws/docker-exec`, `/ws/voice` all do WS→TCP bridging with JWT auth.

**Why NOT alternatives:**

| Alternative | Why Rejected |
|-------------|-------------|
| Apache Guacamole | Requires Tomcat (Java), guacd daemon, separate PostgreSQL/MySQL auth. Over-engineered for single-server use case. Parallel auth system conflicts with LivOS JWT. |
| KasmVNC | Replaces X server entirely (not VNC on existing display). Container-focused. Breaks RFB compatibility. Good for virtual desktops, wrong for streaming host desktop. |
| Selkies-GStreamer | Requires GStreamer pipeline, STUN/TURN, WebRTC complexity. Best for GPU-accelerated cloud gaming. Overkill for server admin desktop. |
| RustDesk | Requires its own relay server and client app. Not browser-only. |
| Wolf/Sunshine+Moonlight | Requires dedicated GPU. Uses Moonlight client (not browser). |

### Packages to Install (via install.sh)

| Package | Version | Purpose | Install Command |
|---------|---------|---------|----------------|
| x11vnc | Latest in repo | VNC server capturing host X11 display | `apt install -y x11vnc` |
| noVNC | Latest in repo / npm | Browser VNC client (static JS files) | `apt install -y novnc` or npm `@novnc/novnc` |

### npm Dependencies (livinityd)

| Package | Version | Purpose |
|---------|---------|---------|
| `@novnc/novnc` | ^1.5.0 | noVNC client library for React embedding |

Or alternatively, use `react-vnc` (~wrapper around noVNC):

| Package | Version | Purpose |
|---------|---------|---------|
| `react-vnc` | ^1.0.0 | React component wrapper for noVNC |

**Decision needed during planning:** Whether to use `@novnc/novnc` directly or `react-vnc` wrapper. The wrapper is simpler but less flexible.

---

## Architecture Integration

### Data Flow

```
Browser → pc.{user}.livinity.io → Caddy (JWT check) → livinityd /ws/desktop → TCP bridge → x11vnc :5900
```

### Key Integration Points

1. **Caddy nativeApps** — Register `pc` subdomain in `generateFullCaddyfile()`. Already handles JWT cookie auth + login redirect.

2. **NativeApp config** — Add x11vnc to `NATIVE_APP_CONFIGS` array in `native-app.ts`. Gets systemd lifecycle, idle timeout, port health-checking for free.

3. **WS bridge** — Add `/ws/desktop` route in `server/index.ts` alongside `/terminal` and `/ws/docker-exec`. JWT auth on upgrade, then bidirectional frame relay to VNC TCP socket.

4. **install.sh** — Add GUI detection (`systemctl get-default` + X11/Wayland socket check). If GUI present: install x11vnc, create systemd service, generate Caddy config.

---

## What NOT to Add

| Technology | Why NOT |
|------------|---------|
| websockify (Python) | Separate process for WS→TCP. livinityd already does this pattern natively. |
| Tomcat / Java | Required by Guacamole. Massive dependency for what x11vnc+noVNC does simply. |
| GStreamer | WebRTC pipeline. Overkill for VNC-based approach. |
| STUN/TURN servers | Only needed for WebRTC. WebSocket through Caddy/tunnel is simpler. |
| Xvfb | Virtual framebuffer for headless. We want real display streaming, not virtual. |
| TigerVNC | Server mode creates new X session instead of capturing existing display. |

---

## Wayland Considerations

x11vnc cannot directly capture Wayland displays. Options:

1. **XWayland** (default on most GNOME setups) — x11vnc can capture X11 apps running under XWayland, but not native Wayland windows.
2. **wayvnc** — Native Wayland VNC server. Alternative to x11vnc on Wayland-only systems.
3. **Force X11 session** — Set `WaylandEnable=false` in GDM config during install.

**Recommendation for v1:** Detect display server type. Use x11vnc for X11, document Wayland limitation. Add wayvnc support in v2 if needed.

---

## Security

- x11vnc MUST run with `-localhost` (bind 127.0.0.1 only)
- All external access goes through Caddy reverse proxy with JWT auth
- No VNC password needed (auth handled by Caddy `livinity_token` cookie)
- WebSocket Origin header validation in livinityd

---

## Sources

- [x11vnc documentation](http://www.karlrunge.com/x11vnc/) — VNC server for existing X11 displays
- [noVNC GitHub](https://github.com/novnc/noVNC) — Browser-based VNC client
- [react-vnc](https://github.com/niclas-niclas/react-vnc) — React wrapper for noVNC
- [KasmVNC](https://kasmweb.com/kasmvnc) — Evaluated and rejected (replaces X server)
- [Apache Guacamole](https://guacamole.apache.org/) — Evaluated and rejected (Tomcat dependency)
- [wayvnc](https://github.com/any1/wayvnc) — Wayland VNC server (future consideration)
