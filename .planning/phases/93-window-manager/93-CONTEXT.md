# Phase 93: Streaming Subsystem + Window Manager — Context

**Wave:** 1 (parallel with P92 metadata extractor)
**Status:** Planning (rewritten 2026-05-07 after streaming-subsystem research)
**Effort:** L (4–7 days; ~14 tasks)
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — `liv/packages/core/src/sdk-agent-runner.ts` UNTOUCHED before AND after every commit.

---

## Goal (1 sentence)

Ship a livinityd-owned streaming subsystem that captures the Mini PC's host X11 display (full-desktop or per-window) as low-latency H264/fMP4, fans out to authenticated browser WebSocket subscribers, and exposes the lifecycle plus a Chrome WebApp window manager via tRPC for downstream phases (P95 stream window UI, P97 auto-mode bytebot).

---

## Why this phase exists

The 0.5-day spike (recorded below in §"Spike outcome") proved that all standard per-window X11 capture tools (`x11vnc -id`, `maim -i`, `import -window`, `ximagesrc xid=N`) are broken under GNOME Shell + Mutter — Mutter's compositor does not expose per-window pixmaps to XGetImage / XRender. That breaks the original D-V33-03 design (one x11vnc per WebApp). The streaming-subsystem research (`.planning/research/streaming-subsystem/FINDINGS.md`) recommends Rank 1 — `ffmpeg x11grab → fMP4 H264 → Node WS fan-out` — as the production path: composited-framebuffer capture works, MSE latency tunes to 100–200ms, integration is pure Node `child_process.spawn` with no Python sidecar. The user explicitly locked Rank 1 plus the PipeWire-portal upgrade for true per-window in v33 (not deferred), and asked for every binary used by livinityd to be installed by `install.sh` so the system reproduces from scratch on a fresh Mini PC.

---

## In-scope

| # | Item | Detail |
|---|------|--------|
| **A** | `install.sh` updates | Extend `install_x11vnc` (or add a new `install_streaming_subsystem` step) to apt-install: `ffmpeg`, `ydotool`, `ydotoold`, `xdotool`, `maim`, `scrot`, `gnome-screenshot`, `x11vnc`, `websockify`, `vncsnapshot`, `gstreamer1.0-tools`, `gstreamer1.0-plugins-good`, `gstreamer1.0-plugins-bad`, `gstreamer1.0-plugins-ugly`, `xdg-desktop-portal-gnome`, `vainfo`, `intel-media-va-driver`, `libdrm-intel1`. Also write `/etc/systemd/system/ydotoold.service` (currently exists only manually on Mini PC). |
| **B** | VAAPI capability detection | Boot-time `vainfo` probe in livinityd that records `{vaapi: boolean, encoder: 'h264_vaapi'\|'libx264'}` to Redis (`liv:streaming:caps`). Used by encoder-arg builder to pick `-c:v h264_vaapi` vs `libx264 -preset ultrafast -tune zerolatency`. Falls back gracefully if `vainfo` absent or returns no `VAEntrypointEncSlice` for H264. |
| **C** | `StreamManager` class | `Map<streamId, StreamSession>` lifecycle. `startStream(opts) → {streamId, wsUrl}`, `stopStream(streamId)`, `listStreams({userId})`. Each `StreamSession` holds the encoder `ChildProcess`, `initSegment: Buffer \| null`, `subscribers: Set<WebSocket>`, `mode: 'desktop' \| 'window' \| 'pipewire'`, lastActivity timestamp. |
| **D** | Full-desktop streaming source | `ffmpeg -f x11grab -framerate 30 -video_size 1920x1080 -i :0.0 -draw_mouse 1 [encoder args] -f mp4 -movflags +frag_keyframe+empty_moov+default_base_moof+separate_moof -reset_timestamps 1 pipe:1`. Parse fMP4 init segment (ftyp+moov) on first chunks, then broadcast each fragment (moof+mdat). |
| **E** | Per-window streaming via PipeWire portal | Node calls `org.freedesktop.portal.ScreenCast` via `dbus-next` → `CreateSession` → `SelectSources(types=window)` → `Start` → portal returns PipeWire node ID + file descriptor. Spawn `gst-launch-1.0 fdsrc ! pipewiresrc ! videoconvert ! x264enc tune=zerolatency speed-preset=ultrafast ! mp4mux fragment-duration=200 streamable=true ! fdsink fd=1`. Pipe stdout into the same fan-out as D. |
| **F** | WebSocket fan-out | Per-stream `Set<WebSocket>` subscribers. On subscriber connect: send buffered init segment, then live fragments. On encoder stdout chunk: parse fMP4 box boundaries, broadcast each complete moof+mdat pair to all subscribers. On encoder exit: terminate all subscriber sockets with code 1011. Backpressure: if subscriber `bufferedAmount > 4 MB`, drop and close that subscriber. |
| **G** | tRPC procedures | `streams.{start, stop, list}` and `webapps.window.{spawn, focus, close, list}`. All scoped to `ctx.currentUser.id`. Routes added to `httpOnlyPaths` in `common.ts` (long-running). `streams.start({mode, target})` returns `{streamId, wsUrl}`. `webapps.window.spawn` calls Chrome + window-discovery + (optionally) `streams.start` chained. |
| **H** | WS endpoint `/ws/stream/:id` | New WebSocket-upgrade handler in `livos/packages/livinityd/source/modules/server/index.ts`, mounted alongside existing `/ws/desktop`. JWT-from-query (and cookie fallback) auth identical to `/ws/desktop` block at line 856. Verifies stream belongs to `currentUser` before joining the subscriber set. |
| **I** | `WebAppWindowManager` | `spawn({userId, webappId, url, expectedTitle})` → `google-chrome --new-window <url>` (NO `--user-data-dir`); xdotool title-poll within 5s using two-pass match (hostname → page title) with baseline-wid diff (D-93-07). `focus({webappId})` → `wmctrl -ia <wid>` + `xdotool windowactivate --sync <wid>`. `close({webappId})` tears down associated stream + (optionally) `xdotool windowkill <wid>`. `list({userId})` returns active records. Idle-cleanup loop (`xprop -id <wid>` poll every 5s) detects window-gone and cascades. |
| **J** | Geometry-tracker fallback | If PipeWire portal unavailable (no GNOME portal session, headless install), per-window mode falls back to ffmpeg x11grab cropped via `-grab_x N -grab_y N -video_size WxH -i :0.0` (NOT the `+X,Y` syntax — confirmed broken on Mini PC ffmpeg version). Geometry refreshed by polling `xdotool getwindowgeometry --shell <wid>` every 200ms; restart encoder if geometry drift > 10px. |
| **K** | Integration test | Vitest + spawn smoke: start stream → connect WS → assert init segment + ≥3 fragments received within 3s → stop → assert encoder PID gone + subscriber socket closed. Mocks ffmpeg via test fixture binary that emits a canned fMP4 byte sequence (no real X server in CI). |

---

## Out-of-scope

| Boundary | Phase that owns it |
|----------|--------------------|
| VNC client component (react-vnc / @novnc/novnc) and the WebApp Stream Window UI | P95 |
| Mode selector pill (Watch / Teach / Auto / Chat) and chat panel mounting | P95 |
| Teach-mode action recording + screenshot storage | P96 |
| Auto-mode bytebot loop with `--window <wid>` scoping | P97 |
| Bytebot `screenshot.ts` / `input.ts` `windowId` parameter extension | P97 |
| Mini PC live deploy and 2-hour stream-stability UAT | P98 |
| `webapps` Postgres table and metadata extractor (URL → title/favicon/og) | P92 |
| Multi-user per-user Chrome profiles | v34 |
| CDP `--remote-debugging-port` window control | v34 |
| WebRTC streaming upgrade (replacing fMP4 path while keeping `{streamId, wsUrl}` API) | v34 |
| Edits to `liv/packages/core/`, the broker, or anything under `livos/packages/livinityd/source/modules/livinity-broker/` | NEVER (sacred) |

---

## Dependencies

**Code (existing):**
- `livos/packages/livinityd/source/modules/server/index.ts` (`/ws/desktop` block at line 856 is the auth pattern to mirror)
- `livos/packages/livinityd/source/modules/computer-use/native/screenshot.ts` (the `execFile` + spawn-to-temp-file pattern this phase generalises to spawn-to-stdout-pipe)
- `livos/packages/livinityd/source/modules/computer-use/native/input.ts` (xdotool / ydotool wrapping; same wrapper style for new `window-discovery.ts`)
- `livos/packages/livinityd/source/modules/livinityd/livinityd.ts` (ioredis client, logger, JWT verifier — DI surface for StreamManager)
- tRPC `common.ts` `httpOnlyPaths` array (memory: long-running routes hang if WebSocket-routed)

**Code (created in P92, parallel wave):**
- `livos/packages/livinityd/source/modules/webapps/trpc-router.ts` — append new methods here
- `webapps` Postgres table — read-only; this phase doesn't migrate

**Phases:**
- **P79 (shipped 2026-05-07)** — maim works on Mutter, xdotool 3.x and ydotoold attached as slave pointer, gdm-restart sequence verified. Without P79's host-display fixes, ffmpeg x11grab returns black.
- **P92 (Wave 1, parallel)** — `webapps` table + metadata. Title from P92 is the page-title string for window-discovery's two-pass match.

**External binaries (apt packages — ALL must land in install.sh per scope item A):**

```
ffmpeg
ydotool
ydotoold              (binary inside `ydotool` package on Ubuntu 24.04; verify in spike)
xdotool
maim
scrot
gnome-screenshot
x11vnc
websockify
vncsnapshot
gstreamer1.0-tools                  (provides gst-launch-1.0)
gstreamer1.0-plugins-good           (videoconvert, mp4mux, fdsrc/fdsink)
gstreamer1.0-plugins-bad            (pipewiresrc)
gstreamer1.0-plugins-ugly           (x264enc)
xdg-desktop-portal-gnome            (D-Bus screencast portal)
vainfo                              (VAAPI probe)
intel-media-va-driver               (Intel iGPU VAAPI driver)
libdrm-intel1                       (DRM userspace lib)
```

**Node packages (new):**
- `dbus-next` — D-Bus client for the PipeWire screencast portal call.
- (Optional) `mp4frag` — fMP4 box parser; can hand-roll instead. Decide in T93-04.

**Runtime data:**
- Redis keys this phase introduces: `liv:streaming:caps` (HASH — vaapi probe result), `liv:streaming:ports:ws` (SET — pre-seeded 14000–14199, 200 ports for stream-WS endpoints, though most streams reuse the single livinityd port via path parameter so this may be unused; document final decision in plan).

---

## Sacred constraints

- `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED. Verify via `git hash-object` before AND after every commit in this phase.
- Subscription-only: no raw `@anthropic-ai/sdk` paths, no BYOK key surfacing. (None expected — this is OS plumbing.)
- No edits to `liv/packages/core/`, no edits to broker (`livos/packages/livinityd/source/modules/livinity-broker/`).
- No Docker. Pure Node `child_process.spawn` orchestration. GStreamer is acceptable as a spawned `gst-launch-1.0` child; signaling and lifecycle stay in Node.
- No Python sidecar (rules out Selkies-GStreamer Rank 2).
- New code only — no rewrites of existing modules. `install.sh` and the existing `webapps` tRPC router (P92) are the only "modify" targets.
- No emoji unless user explicitly authors it.

---

## Locked decisions

| ID | Decision | Source |
|----|----------|--------|
| **D-93-01** | **Architecture pivot: single shared x11vnc on full `:0` is REJECTED in favor of the streaming subsystem** — `ffmpeg x11grab + fMP4/H264 + Node WS fan-out` (Rank 1). Per-window goes through PipeWire portal (D-93-04), not browser-side CSS clip of a shared full-desktop VNC. The original "Spike outcome" + "Architecture pivot" addenda below remain as historical context for the rejection of x11vnc-id. | Locked 2026-05-07 by user after FINDINGS.md review |
| **D-93-02** | Latency budget: 100–200ms tuned MSE acceptable. ffmpeg flags `-fflags nobuffer -probesize 32 -analyzeduration 0 -tune zerolatency -preset ultrafast` (libx264 path) or `-tune zerolatency` equivalent for h264_vaapi. <100ms is NOT a v33 hard requirement; that lives in v34's optional WebRTC upgrade. | Locked 2026-05-07 by user (FINDINGS.md Open Question #1) |
| **D-93-03** | VAAPI on the Mini PC's Intel iGPU is the preferred encoder. Boot-time `vainfo` probe stored in Redis. If `VAEntrypointEncSlice` for H264 absent → fall back to `libx264 -preset ultrafast -tune zerolatency`. Cap concurrent streams at 5 in the libx264-fallback path; 10 with VAAPI. | Derived from FINDINGS.md Open Question #3 + user lock on Rank 1 |
| **D-93-04** | **True per-window via PipeWire screencast portal IS in v33** (not deferred). Implementation: `dbus-next` → `org.freedesktop.portal.ScreenCast` → `CreateSession`/`SelectSources(types=window)`/`Start` → consume PipeWire node ID via `gst-launch-1.0 ... pipewiresrc ... mp4mux fragment-duration=200 ! fdsink`. Geometry-tracker (J) is the FALLBACK for systems without portal. | Locked 2026-05-07 by user (FINDINGS.md Open Question #2) |
| **D-93-05** | **Cursor visible in the streamed view** — ffmpeg `-draw_mouse 1` (its default). Bytebot's existing `captureScreenshot()` path remains cursor-less (different concern, different code path, no shared state). | Locked 2026-05-07 by user (FINDINGS.md Open Question #4) |
| **D-93-06** | **Auth model: existing JWT-from-query-param pattern** (same as `/ws/desktop` at `livos/packages/livinityd/source/modules/server/index.ts:856`). NO public/unauthenticated mode. New `/ws/stream/:id` MUST: (a) read token from `searchParams.get('token')` with `LIVINITY_SESSION` cookie fallback, (b) `verifyToken()`, (c) verify the stream's owning userId matches the verified user. | Locked 2026-05-07 by user (FINDINGS.md Open Question #5) |
| **D-93-07** | install.sh installs every binary used by livinityd. The user's words: "Install.sh ile bu butun servisler kurulmali." The full apt-package list lives in §"Dependencies" above. Also write the systemd unit for `ydotoold` (currently only on Mini PC by hand). | Locked 2026-05-07 by user |
| **D-93-08** | Two-pass window discovery (hostname → page title from P92), baseline-wid diff to filter pre-existing windows. 5s timeout, 100ms poll. If both passes time out → throw `WINDOW_NOT_FOUND` + propagate to UI. | Carried over from prior CONTEXT D-93-06/D-93-07 |

---

## Gray areas / open questions

| GA | Question | Resolution path |
|----|----------|-----------------|
| **GA-93-01** | `ydotoold` package vs binary location on Ubuntu 24.04 — is it inside `ydotool` package or separate? | T93-01 spike inside install.sh draft: `apt-cache search ydotoold` and `dpkg -L ydotool \| grep ydotoold`. Document, lock the install line. |
| **GA-93-02** | Does `xdg-desktop-portal-gnome` work over SSH session / autostart for a logged-in `bruce` desktop? Portals normally require an active D-Bus user session. | T93-08 (PipeWire path) tries the call live; if `org.freedesktop.portal.Desktop` not on the session bus, fall back to geometry-tracker (J) and log it. |
| **GA-93-03** | fMP4 box parsing — hand-roll or use `mp4frag`? mp4frag adds a dep but battle-tested for this exact use case. | Decide in T93-04. Default to `mp4frag` unless it pulls in heavy transitive deps. |
| **GA-93-04** | Geometry-tracker encoder restart cost on window-move — ~300ms ffmpeg respawn likely visible as a freeze. Acceptable? | Yes for v33 fallback path (PipeWire is the primary). Document in T93-09 acceptance. |
| **GA-93-05** | When VAAPI encode is active and Chrome is also using the iGPU for compositing, can we starve compositing? | T93-03 includes a cap-and-monitor: 10 streams hard limit on VAAPI; if `vainfo` post-load shows `BAD_RESOURCE`, kill newest stream + log. |
| **GA-93-06** | Should `/ws/stream/:id` reuse the existing livinityd HTTP port (8080), or open a separate streaming port? | Reuse existing port. WebSocket path-routing handles multiplexing; opening a second port complicates Caddy/firewall. Lock in T93-05. |
| **GA-93-07** | `streams.start` idempotency — if `(userId, mode, target)` matches an existing stream, return that one or spawn fresh? | Return existing (idempotent). Otherwise users hammering "play" spawn parallel encoders. Document in T93-03. |
| **GA-93-08** | Subscriber backpressure threshold (4 MB chosen) — too aggressive for slow clients, too lax for fast ones? | Configurable via env `LIVOS_STREAM_BACKPRESSURE_BYTES`, default 4 MB. Document in T93-06. |

---

## Success criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| **S1** | `install.sh` installs all 18 apt packages from §Dependencies AND writes `/etc/systemd/system/ydotoold.service` AND enables it on a fresh Ubuntu 24.04 Mini PC. | `bash livos/install.sh` on a clean VM/container; post-install `systemctl is-enabled ydotoold` returns `enabled`; `which ffmpeg gst-launch-1.0 dbus-send vainfo` all succeed. |
| **S2** | VAAPI capability detection runs at livinityd boot; result in Redis `liv:streaming:caps`; encoder-arg builder selects `h264_vaapi` if present, else `libx264`. | Vitest with mocked `execFile` returning canned `vainfo` output (one PASS, one FAIL fixture); inspect built argv. |
| **S3** | `StreamManager.startStream({mode: 'desktop'})` returns `{streamId, wsUrl}` within 1s and `subscribers.size === 0`; ffmpeg ChildProcess exists and is alive. | Vitest with stubbed spawn. |
| **S4** | A WS subscriber connecting to `/ws/stream/:id` receives the buffered init segment as the FIRST binary frame, then ≥3 media fragments within 3s. | Vitest integration with fixture-binary fake-encoder emitting canned fMP4 bytes. |
| **S5** | `StreamManager.stopStream(id)` SIGTERMs the encoder, escalates to SIGKILL after 2s, closes all subscriber sockets with WS close code 1011, removes the session from the map. | Vitest with EventEmitter stubs + fake timers. |
| **S6** | tRPC `webapps.window.spawn({url, webappId})` calls Chrome, finds the window via two-pass match within 5s, returns `{windowId, streamId, wsUrl}`. Idempotent: second call with same `webappId` and a still-alive window returns the existing handle. | Vitest with mocked discovery + manager. |
| **S7** | `/ws/stream/:id` rejects connections without a JWT (401), with an invalid JWT (401), and with a JWT that does not own the stream (404). | Vitest with supertest + a stub StreamManager + a fixture verifyToken. |
| **S8** | PipeWire portal path: when `dbus-next` succeeds in calling `org.freedesktop.portal.ScreenCast.CreateSession`, GStreamer pipeline is spawned with the returned PipeWire node ID and emits fMP4 fragments. | Vitest mocks the dbus-next surface; a separate manual smoke (T93-13) validates against the real Mini PC if the user enables it during P98 UAT. |
| **S9** | Geometry-tracker fallback: when portal returns "no such interface" (the simulated absence), the manager falls back to `ffmpeg x11grab -grab_x -grab_y` cropped, and restarts ffmpeg when `xdotool getwindowgeometry` reports >10px drift. | Vitest with mocked discovery driving simulated drift. |
| **S10** | `liv/packages/core/src/sdk-agent-runner.ts` SHA equals `f3538e1d811992b782a9bb057d1b7f0a0189f95f` before AND after every commit. | `git hash-object` in each task's verify block. |

---

## Spike outcome (2026-05-07 — pre-execution)

The 0.5-day spike (T93-00 in PLAN) was run early via Mini PC SSH with these results:

| Test | Result |
|------|--------|
| `x11vnc -id <wid>` on Mutter composited Firefox window | **FAIL** — MIT-SHM permission denied; with `-noshm` → segfault on startup |
| `maim -i <wid>` (sanity check) | **FAIL** — `BadMatch (RenderCreatePicture)` X Render error; produces 0-byte file |
| `x11vnc -display :0` (full desktop, no -id) | **STARTS** — daemon comes up on port 5901; vncsnapshot connect failed but likely syntax issue (`localhost:5901` vs `localhost:1`); needs re-verify in execution phase |
| `ffmpeg -f x11grab -video_size 1920x1080 -i :0.0` (full desktop) | **PASS** — produces 1920×1080 PNG with >10000 unique colors. Post-gdm-restart Mutter cooperates with x11grab. |
| `ffmpeg -f x11grab -i :0.0+X,Y` (cropped to window region) | **FAIL** — `Invalid argument` on `+X,Y` syntax (ffmpeg version-specific); use `-grab_x N -grab_y N` instead |

**Root cause confirmed**: Mutter X11 compositor does not export per-window pixmaps via the standard X protocols (XRender Picture / XGetImage scoped to window). All per-window capture tools (x11vnc -id, maim -i, scrot's earlier failure) hit the same wall. The composited frame buffer lives in Mutter's GPU-side render target.

**What works**: full-desktop capture via either x11vnc (full :0) or ffmpeg x11grab (full :0.0). After gdm restart with ydotoold attached as a slave pointer (post-2026-05-07 P79 sequence), the X server reports proper pixels for the full root window.

## Architecture pivot — D-93-01

**Original D-V33-03**: per-window x11vnc via `-id <wid>`. **REJECTED** by spike.

**New D-93-01** (replaces D-V33-03 in DRAFT for this phase):

- **Single shared x11vnc daemon** on the Mini PC, attached to the full `:0` display (`x11vnc -display :0 -shared -forever -bg -nopw -localhost -noshm`). Starts at livinityd boot via systemd unit, identical lifecycle to ydotoold.
- **Per-WebApp browser-side viewport crop**: the WebApp Stream Window (P95) shows a CSS-clipped sub-region of the full VNC stream. Crop region tracks the Chrome window's geometry (poll xdotool `getwindowgeometry <wid>` every 500ms; emit geometry deltas over the existing SSE channel; client updates its `clip-path` accordingly).
- **Per-window `wmctrl windowactivate --sync <wid>`** when WebApp icon clicked, so the focused window is in the foreground of the cropped region.
- **Privacy disclaimer** (D-V33-07 single-user scope makes this acceptable for v33): the underlying VNC stream contains the entire desktop. The crop is a CLIENT-SIDE convenience, not a security boundary. v34 multi-user upgrade will need per-WebApp ffmpeg cropped MJPEG OR per-WebApp Xvfb display (architectural change deferred).

> **2026-05-07 follow-on** — the user reviewed `.planning/research/streaming-subsystem/FINDINGS.md` and **superseded** the single-shared-x11vnc + browser-crop pivot with the streaming subsystem (Rank 1 ffmpeg fMP4 + Node WS fan-out) AND scoped the PipeWire portal per-window path INTO v33. The "Spike outcome" + this section remain as the historical record of why x11vnc-id was rejected; the active architecture is D-93-01 through D-93-08 in §"Locked decisions".
