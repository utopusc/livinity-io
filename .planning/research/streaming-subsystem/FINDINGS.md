# LivOS Streaming Subsystem — Architecture Research

**Date**: 2026-05-07
**Researcher**: technical-researcher subagent
**Sacred SHA verified**: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (untouched)

## 1. Use Case Recap

LivOS runs on a single Mini PC (Ubuntu 24.04, GNOME Shell, X11, Mutter compositor). The system needs a streaming subsystem integrated into livinityd (Express/TypeScript) that accepts RPC requests to start/stop/list streams in two modes: full-desktop and per-window. Browser clients connect via WebSocket to receive live frames with <500ms target latency (ideally <100ms). The subsystem must support 5–10 concurrent streams, coexist with the existing bytebot agent (maim/xdotool/ydotoold on the same X server), and run on host bare metal — no Docker, no Python sidecar, Node.js-spawnable only. Per-window capture via `x11vnc -id`, `maim -i`, and `import -window` are already confirmed broken under Mutter; full-display capture via `ffmpeg x11grab` and bare `maim` are confirmed working.

---

## 2. Comparison Matrix

| Candidate | Protocol | Server Tool | Browser Client | Per-Window on Mutter | Latency (E2E) | Encode Cost @1080p30 | BW @1080p30 | Multiplex Model | License | Maintenance | Node Integration | Precedent |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A. x11vnc + websockify + noVNC** | VNC/RFB over WS | x11vnc | noVNC iframe | Full-desktop only (per-window broken on Mutter) | 80–250ms typical | Low (raw FB diff) | 5–15 Mbps adaptive | N × separate x11vnc+websockify procs | GPL-2 | Minimal (LibVNC fork, low commit rate) | HTTP proxy to websockify port; spawn mgmt | Coder (legacy), most cloud IDEs historically |
| **B. ffmpeg x11grab → MJPEG/WS** | MJPEG over WS | ffmpeg | `<img>` or canvas loop | Pseudo-per-window via `+x,y` crop from xdotool | 100–300ms | Medium (no inter-frame; JPEG per frame) | 20–60 Mbps | N × ffmpeg procs, pipe stdout to WS | LGPL-2.1 | Active (ffmpeg project) | `child_process.spawn` → pipe → `ws.send` | Surveillance dashboards, simple demos |
| **C. ffmpeg x11grab → fMP4 H264 → MSE WS** | H264 fMP4 over WS | ffmpeg | MSE `<video>` + mp4frag | Same crop method as B | 150–400ms untuned; ~100–200ms with zerolatency flags | Low–Medium; VAAPI halves it | 2–8 Mbps | N × ffmpeg procs; per-stream fan-out to M clients | LGPL-2.1 | Active | `spawn` → stdout → broadcast | Shinobi CCTV, DIY cloud desktop |
| **D. Selkies-GStreamer** | WebRTC (VP8/VP9/H264/AV1) | GStreamer ximagesrc + webrtcbin + Python signaling | Plain `<video>` via WebRTC | Full-desktop only (ximagesrc `xid=N` → BadMatch on Mutter; GStreamer issue #882) | 50–150ms (typical reports 80–150ms) | Low–Medium; VAAPI/NVENC | 3–8 Mbps | One GStreamer pipeline + Python process per session | Apache-2.0 | Low (last release v1.6.2 Aug 2024; "needs maintainers") | Spawn Python process + proxy HTTP signaling; not pure Node | Google Cloud Workstations, Daytona, HPC |
| **E. Sunshine + Moonlight** | RTSP+RTP (GameStream) | Sunshine daemon | Moonlight app or browser shim | Full-desktop only | 20–50ms | Very Low (VAAPI/NVENC first-class) | 10–30 Mbps | Single host session; no multi-stream API | GPL-3 | Active (LizardByte, 24k stars) | Dedicated daemon; no Node API | Gaming only; browser client is a third-party hack |
| **F. Guacamole / guacamole-lite** | Guacamole proto over WS | guacd (C daemon) → VNC backend | HTML5 canvas client | Full-desktop only (routes through VNC; same Mutter limits) | 150–400ms | Low (guacd encodes) | 2–5 Mbps | guacd manages multiple connections | Apache-2.0 | Active | `guacamole-lite` npm pkg; Node replaces Java servlet | Apache, enterprise deployments |
| **G. neko** | WebRTC (VP8/H264) | GStreamer ximagesrc | Vue.js client | Full-desktop only; hardcoupled to Docker virtual X | 50–300ms (issue #598 shows 10s regression in some v3 configs) | Low–Medium | 3–10 Mbps | One pipeline per Docker container | Apache-2.0 | Active (v3.1.0 Apr 2026, 20.8k stars) | Go binary; no Node API; hardcoupled to Docker | Shared browser, co-browsing |
| **H. Greenfield** | Wayland proto in browser | Custom browser-side Wayland compositor | Built-in | Wrong fit: requires Wayland clients; X11 apps via XWayland shim only; NOT a session streamer | N/A (local render) | Minimal | Very Low | N/A | MIT | Moderate (1.2k stars; last active 2024) | Would require migrating away from X11 compositor entirely | Browser-native Wayland; no desktop streaming use case |
| **I. Custom: ffmpeg x11grab + fMP4 + Node WS fan-out** | H264 fMP4 over WS | ffmpeg | MSE `<video>` | Pseudo-per-window via xdotool crop | 100–300ms; ~100ms with tuning | Low w/ VAAPI; medium w/ libx264 ultrafast | 2–8 Mbps | N × ffmpeg procs; `Map<streamId, Set<WS>>` fan-out in Node | LGPL-2.1 | Active (ffmpeg) | Full control; `spawn` + stdout pipe + broadcast | Identical pattern to Shinobi, DIY cloud desktops |

---

## 3. Per-Window Capture on Mutter — Which Approaches Actually Work

**Confirmed broken on GNOME Shell X11 + Mutter (verified in spike):**
- `x11vnc -id <wid>` — Mutter does not redirect per-window pixmaps to XComposite overlay; XGetImage on the window's own pixmap returns garbage/black.
- `maim -i <wid>` — same root cause; per-window path uses XGetImage + MIT-SHM path.
- `import -window <wid>` (ImageMagick) — identical failure.
- `ximagesrc xid=N` (GStreamer) — GStreamer issue #882 documents `BadMatch (invalid parameter attributes)` from MIT-SHM when specifying `xid` under composited environments. The `use-damage=false` workaround may help under some compositors but is not confirmed to fix Mutter specifically.

**What works for pseudo-per-window:**
- `ffmpeg -f x11grab -video_size WxH -i :0.0+X,Y` — captures the composited framebuffer (which Mutter does write) with a geometry crop. Window coordinates from `xdotool getwindowgeometry --shell <wid>` (returns `X=, Y=, WIDTH=, HEIGHT=`). Confirmed working because it reads from the X11 root window pixmap (the composited output), not individual window pixmaps. Caveat: if the window moves or is occluded the crop is stale; a ~200ms polling loop to re-read geometry is needed.
- `maim` (bare, no `-i`) — confirmed working on Mini PC by P79-05 codebase work; uses XCB with a different XGetImage path. The existing `screenshot.ts` already validates this.

**True per-window path (unverified on this Mini PC):**
PipeWire `screencast` portal via `xdg-desktop-portal-gnome` supports per-window capture even in GNOME X11 mode. Accessing it from Node requires D-Bus calls (`dbus-next` npm pkg) to request a screencast session, then consuming the returned PipeWire node ID via GStreamer `pipewiresrc`. This is how OBS and modern screen-share tools work under GNOME. Complexity: L. Not confirmed live on the Mini PC; deferred to v34.

---

## 4. Top 3 Recommended Architectures

### Rank 1 — Custom ffmpeg x11grab + fMP4/H264 + Node WS Fan-Out (Candidate I)

**Pros:** Lowest integration friction for livinityd. Node spawns one ffmpeg process per stream; ffmpeg writes H264 fMP4 to stdout using `-movflags +frag_keyframe+empty_moov+default_base_moof`; the stream manager buffers the initialization segment and broadcasts each media fragment to all subscribed WebSocket clients via a `Set<WebSocket>` per stream. Browser uses MSE `<video>` with a 30–50 line segment queue. Per-window pseudo-support works today via xdotool crop. VAAPI hardware acceleration (`-vf 'hwupload,scale_vaapi=format=nv12' -c:v h264_vaapi`) is a flag swap, dropping per-stream CPU from ~30% to ~5%. Multiple concurrent streams = multiple independent ffmpeg procs managed by a `Map<streamId, StreamSession>`. Entire module fits in `modules/streaming/` mirroring `computer-use` patterns already in the codebase. No new language runtimes.

**Cons:** MSE has a mandatory initial buffer; without tuning (`-fflags nobuffer -probesize 32 -analyzeduration 0 -tune zerolatency`) latency is 300–500ms. Properly tuned, ~100–200ms is achievable but requires careful `timestampOffset` management on the client. Per-window crop is brittle: window moves/minimizes → stale crop; a geometry-polling loop at ~200ms is required. MJPEG (Candidate B) achieves lower raw latency at 5–10× the bandwidth.

**Integration sketch:** `StreamManager` class holds `activeStreams: Map<string, StreamSession>`. `StreamSession` contains the ffmpeg `ChildProcess`, an `initSegment: Buffer | null`, and `subscribers: Set<WebSocket>`. `POST /api/stream/start` calls `manager.startStream(mode, target)` → spawns ffmpeg, returns `{streamId, wsUrl}`. `/ws/stream/:id` upgrade handler sends `initSegment` on connect, adds socket to `subscribers`. On ffmpeg stdout `data` event, manager broadcasts to all subscribers; on `close`, all sockets are terminated. `POST /api/stream/stop` sends SIGTERM to ffmpeg proc and clears the session. Window-mode: Node polls `xdotool getwindowgeometry` every 200ms, restarts ffmpeg proc if geometry changed by >10px.

**Effort:** M (3–5 days).

---

### Rank 2 — Selkies-GStreamer (Candidate D)

**Pros:** Production-validated on Ubuntu 24.04 bare-metal X11; no Docker required. WebRTC delivers the best achievable latency in the field (50–150ms, sub-100ms documented). VAAPI/NVENC first-class. Apache-2.0. Google-originated; deployed by Daytona, HPC clusters, Cloud Workstations. `<video>` element client needs no custom JS.

**Cons:** Python runtime is mandatory (the GStreamer WebRTC signaling component is Python; no pure-Node alternative exists). Integration = spawn Python + proxy HTTP signaling in Node, adding a cross-language process lifecycle. "We need maintainers" note in the README is a real concern for long-term stability; last release was Aug 2024. Per-window is still broken on Mutter (ximagesrc `xid` failure). Each concurrent stream = a Python+GStreamer process pair, higher memory overhead than ffmpeg. WebRTC signaling adds STUN/TURN complexity for non-LAN clients.

**Integration sketch:** `SelkiesSession` spawns `selkies-gstreamer --encoder=x264 --port=<allocated>`. Node proxies WebRTC signaling HTTP (`/offer`, `/candidate`) to that port. Session lifecycle in `StreamManager`. On end, SIGTERM the Python process.

**Effort:** L (5–8 days including Python dep wiring in update.sh, signaling proxy, session manager, live Mini PC GStreamer pipeline debug).

---

### Rank 3 — x11vnc + websockify + noVNC (Candidate A)

**Pros:** Already partially implemented in livinityd — `ws-desktop.test.ts` expects the exact `/ws/desktop` TCP bridge to port 5900, and the WS-to-TCP relay is already coded in `server/index.ts`. Zero new conceptual territory. noVNC provides keyboard/mouse/clipboard back-channel at no extra cost. Lowest effort of any option to reach a working demo.

**Cons:** Full-desktop only on Mutter (no per-window path). N concurrent clients on the same stream = N separate RFB update streams from x11vnc (no shared pipeline); each client is an independent x11vnc decode+encode cycle. x11vnc maintenance is minimal (LibVNC fork, sporadic commits). websockify is Python. noVNC `<iframe>` integration in React requires `postMessage` or DOM injection. Latency floor is ~80ms but can spike to 250ms under load.

**Effort:** S (2–3 days — the WS bridge is already written; need stream manager for multiple sessions, x11vnc process lifecycle, and a `<noVNCViewer>` React wrapper).

---

## 5. Recommended Path Forward

Ship **Rank 1 (ffmpeg x11grab + fMP4/H264 + Node WS fan-out)** as the primary implementation for v33.0. The codebase already validates `maim` and confirms the X11 composited framebuffer is readable; `ffmpeg x11grab` uses the same composited root-window path. Node child_process patterns (`spawnAndForget`, `execFileAsync`, pipe-to-WS) are established in `computer-use/native/`. The new `modules/streaming/` module mirrors the `computer-use` module structure and requires no sacred-file changes. VAAPI hardware acceleration is one flag swap from the default libx264 path, keeping CPU overhead negligible at 10 concurrent streams. MSE latency of 100–200ms (tuned) meets the <500ms target; the architecture is upgrade-compatible to Selkies WebRTC in v34 by swapping the ffmpeg proc for a GStreamer/Python session while keeping the same REST+WS API surface.

- ffmpeg x11grab is confirmed working on the Mini PC (same XCB composited-framebuffer path as maim, already proven)
- Node fMP4 fan-out requires zero new runtime dependencies (`mp4frag` npm or inline segment parsing) and fits the established spawn-and-pipe pattern
- The module is API-compatible with a future WebRTC upgrade path: the `{streamId, wsUrl}` contract is transport-agnostic

---

## 6. Open Questions

1. **MSE latency floor acceptable?** ffmpeg fMP4 + `-tune zerolatency` achieves ~100–200ms glass-to-glass after careful tuning; untuned out-of-box is 300–500ms. If <100ms is a hard v33 requirement from day one, Selkies (Rank 2) should be prioritized despite the Python dependency and higher effort.

2. **Per-window via PipeWire portal — needed in v33?** The xdotool crop approach is brittle (window occlusion, moves, minimize). If agent workflows require reliably streaming a specific named app window, the PipeWire/D-Bus path should be scoped into v33, pushing effort from M to L.

3. **VAAPI availability on the Mini PC Intel iGPU?** If `vainfo` confirms `VAEntrypointEncSlice` for H264, hardware encoding drops per-stream CPU from ~30% to ~5%, making 10 concurrent streams trivial. If VAAPI is unavailable, 5 streams at `libx264 ultrafast` will consume ~150% CPU and a 3–4 stream cap may be needed.

4. **Cursor rendering in the stream?** ffmpeg x11grab captures the hardware cursor by default (`-draw_mouse 1`). The bytebot agent's maim screenshots omit the cursor intentionally. Confirm whether the streaming view should show the cursor (useful for humans watching the agent) and that this does not interfere with the agent's own screenshot tool.

5. **Stream authentication model for v33?** Should the new `/ws/stream/:id` endpoint use the existing JWT-from-query-param pattern (as `/ws/desktop` does), a short-lived stream token issued at `POST /api/stream/start`, or allow unauthenticated access for a "watch the AI work" public mode? This decision gates the auth middleware design for the new module.

---

## Sources

- [Selkies-GStreamer GitHub](https://github.com/selkies-project/selkies-gstreamer)
- [Selkies Documentation](https://selkies-project.github.io/selkies/)
- [neko GitHub](https://github.com/m1k1o/neko)
- [Greenfield GitHub](https://github.com/udevbe/greenfield)
- [GStreamer ximagesrc documentation](https://gstreamer.freedesktop.org/documentation/ximagesrc/index.html)
- [GStreamer issue #882 — ximagesrc xid BadMatch](https://gitlab.freedesktop.org/gstreamer/gst-plugins-good/-/issues/882)
- [KasmVNC GitHub](https://github.com/kasmtech/KasmVNC)
- [Sunshine GitHub (LizardByte)](https://github.com/LizardByte/Sunshine)
- [websockify latency results](https://github.com/novnc/websockify/blob/master/docs/latency_results.txt)
- [ShinobiCCTV Live-MP4-Stream-with-Node.js-and-FFMPEG](https://github.com/ShinobiCCTV/Live-MP4-Stream-with-Node.js-and-FFMPEG)
- [websocket-mse-demo](https://github.com/elsampsa/websocket-mse-demo)
- [FFmpeg x11grab devices documentation](https://ffmpeg.org/ffmpeg-devices.html)
- [grab_x11_window example](https://github.com/AlbertVeli/grab_x11_window)
- [nanocosmos WebRTC latency comparison](https://www.nanocosmos.net/blog/webrtc-latency/)
- [Coder KasmVNC module announcement](https://coder.com/changelog/new-kasmvnc-module-for-secure-web-based-linux-desktop-experience)
- [guacamole-lite npm/GitHub](https://github.com/vadimpronin/guacamole-lite)
- [mp4frag npm](https://www.npmjs.com/package/mp4frag)
