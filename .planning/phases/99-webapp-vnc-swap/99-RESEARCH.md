# Phase 99: WebApp VNC Swap (fMP4 → x11vnc) — Research

**Researched:** 2026-05-08
**Domain:** X11 RFB capture (x11vnc per-window) + Node WS↔TCP byte-bridging + noVNC RFB client
**Confidence:** HIGH (Mutter compatibility + noVNC subprotocol + bridge pattern all verified against installed code or upstream sources)

---

## Summary

Phase 99 swaps the per-WebApp streaming backend from `ffmpeg x11grab` window-crop fMP4 to per-window `x11vnc -id <wid>` with a transparent WS↔TCP byte bridge in livinityd. The frontend (`use-webapp-vnc.ts`, already consuming `@novnc/novnc 1.6.0`) is left untouched. The fMP4 path stays alive for `mode:'desktop'` (the `desktop-stream` native app). This is a backend-only refactor; the existing `/ws/stream/:streamId` endpoint, the JWT-from-query auth, the ownership check, and the public tRPC surface (`webapps.window.spawn` → `{streamId, wsUrl}`) all remain identical. Only the bytes flowing through the WS endpoint change.

Two contradictions in the prior planning record have been resolved by direct evidence:

1. **P93's spike rejected `x11vnc -id <wid>` on Mutter** — the rejection was real for THAT MOMENT but is not a permanent compatibility wall. Root cause in the spike was multi-factor (MIT-SHM permission denied + segfault on `-noshm` + an unrelated XRender error in `maim -i`). Subsequent evidence: x11vnc gained explicit XComposite extension support in 0.9.14 specifically to handle compositors that move pixmaps off-screen; `-noxdamage` is the canonical Mutter/compositor workaround documented in upstream x11vnc FAQ; install.sh already provisions a working system-wide `livos-x11vnc.service` against the full `:0` display under Mutter. The 2026-05-08 environment-verification (binaries `/usr/bin/x11vnc 0.9.16` + `/usr/local/bin/websockify` already installed and serving the full-desktop) plus the swap's own scope-item "Mini PC live RFB handshake test" before any code ships is sufficient to de-risk this. **Phase 99 MUST start with a 30-min Mini PC verification step before any code lands** (see §"Open Questions" Q1) — but on the evidence this verification is overwhelmingly likely to pass.

2. **noVNC's `wsProtocols` default** — internet sources contradict each other (some say `['binary']`, some say `[]`). Resolved by reading the actually-installed `@novnc/novnc 1.6.0` source on disk: `_wsProtocols = options.wsProtocols || []` (`livos/node_modules/.pnpm/@novnc+novnc@1.6.0/.../lib/rfb.js:147`). The hook `use-webapp-vnc.ts` does NOT pass `wsProtocols`. Therefore the bridge does NOT need to negotiate `Sec-WebSocket-Protocol`; the existing WS upgrade handler (which uses `WebSocketServer({noServer:true}).handleUpgrade()`) is correct as-is.

**Primary recommendation:** Hard-cut the `mode:'window-crop'` branch in `WebAppWindowManager.spawn()` to a new `mode:'vnc-window'` (or extend `StreamSession` with a discriminated union), wire a 50-line `vnc-bridge.ts` (spawn x11vnc, attach a `net.Socket`, expose attach/detach), modify `/ws/stream/:streamId` to dispatch on `session.kind` (fMP4 → existing fanout, VNC → bridge attach), preserve the 4 MB backpressure rule from `Fmp4Fanout` in the bridge. Frontend zero changes. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED. Cost: ~5 plans, 1-2 days as scoped in CONTEXT.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-99-01** Per-WebApp window stream uses `x11vnc -id <wid> -rfbport <port> -localhost -shared -forever -noxdamage -nopw` spawned per window. RFB protocol over the WS endpoint.
- **D-99-02** WS handler at `/ws/stream/:streamId` for VNC streams acts as a transparent bidirectional bridge: WS frames (binary) ↔ TCP socket connected to `x11vnc`'s `-rfbport`. NOT `websockify` as a separate process — bridge logic lives in livinityd Node code so JWT auth + ownership check stay in one place.
- **D-99-03** RFB port allocation reuses the existing per-stream port pool. `localhost`-only bind on x11vnc — no external exposure; only livinityd's bridge connects.
- **D-99-04** fMP4 path stays alive. `Fmp4Fanout` and the ffmpeg encoder factory remain in `streaming/`. `StreamManager.startStream({mode})` gains/retains a branch: `mode:'desktop'` → existing fMP4; `mode:'window'` (or new `mode:'vnc-window'`) → new VNC bridge.
- **D-99-05** Geometry clamp logic from `4c55b173` is dead code AFTER swap (x11vnc reads pixmap by window ID, not geometry). Keep the clamp as no-op safe code with comment "preserved for ffmpeg-fallback path; unused under x11vnc mode".
- **D-99-06** If x11vnc fails to capture a given Chrome window (Mutter pixmap returns blank), DO NOT auto-fall-back at runtime. Surface the error to the frontend with a clear "stream unavailable" payload. Phase 99 verifies that this case does not occur on Mini PC — if it does, that's a P99-blocker.
- **D-99-07** ffmpeg argv + stderr dump from `782cafeb` stays as-is. Same diagnostic pattern applied to x11vnc spawn: log argv + stderr tail on encoder/x11vnc crash.
- **D-99-08** When `xprop -id <wid>` poll reports the Chrome window has died, cascade: SIGTERM x11vnc PID, close all WS subscribers with code 1011, free port back to pool, remove from `StreamSession` map.
- **D-99-09** If `streams.stop({streamId})` is called via tRPC, same cascade as D-99-08.
- **D-99-10** `liv/packages/core/src/sdk-agent-runner.ts` SHA must equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` before AND after every commit.
- **D-99-11** D-NO-BYOK preserved (subscription-only Claude path).
- **D-99-12** D-NO-SERVER4 preserved. Mini PC (`bruce@10.69.31.68`) is the only deploy target.

### Claude's Discretion

- Exact module name (`vnc-bridge.ts` vs `x11vnc-spawn.ts` vs nesting under `streaming/vnc/`) — pick the layout that minimises surface area in the existing `streaming/` folder.
- Whether to introduce a discriminated-union `StreamSession` type (`{kind:'fmp4',...} | {kind:'vnc',...}`) or two parallel maps — pick whichever produces fewer call-site branches.
- Test strategy for the VNC bridge — vitest with a mock TCP server emitting canned RFB bytes is acceptable; do NOT require a real X server in CI.
- Whether to gate the swap behind a Redis/env flag or hard-cut. **Recommendation:** hard-cut on the WebApp window-crop branch only; `mode:'desktop'` stays fMP4 unconditionally.

### Deferred Ideas (OUT OF SCOPE)

- WebRTC upgrade — deferred to v34.
- Multi-user per-WebApp profiles — single Mini PC user only in v33; multi-user → v34.
- CDP `--remote-debugging-port` window control — deferred to v34.
- Per-window quality settings UI (`-quality`, `-scale` x11vnc args) — out of scope.
- `websockify` as a separate process — explicitly ruled out per D-99-02 (auth gate must stay in livinityd).
- Auto-fallback to ffmpeg crop on x11vnc failure — explicitly ruled out per D-99-06.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **V33-VNC-01** | Per-Chrome-window x11vnc spawn produces a working RFB stream consumable by `@novnc/novnc 1.6.0` under bruce's GNOME Shell + Mutter X11 session | x11vnc 0.9.16 (Ubuntu 24.04 default) supports `-id <wid>` with XComposite extension since 0.9.14; `-noxdamage` is upstream's canonical Mutter workaround per FAQ; install.sh's existing `livos-x11vnc.service` already runs against the same display under the same compositor and works. Verify via §"Mini PC verification" before code lands. [VERIFIED: install.sh:614,621,826 + upstream FAQ.md] |
| **V33-VNC-02** | A pure-Node WS↔TCP bridge in livinityd forwards binary RFB bytes in both directions transparently, with a `bufferedAmount > 4 MB` drop rule mirroring `Fmp4Fanout` backpressure | websockify-js reference pattern is `client.on('message', m => target.write(m))` + `target.on('data', d => client.send(d))` with both-direction close propagation; backpressure rule extracted from `Fmp4Fanout.feed()` line 246 (already-shipped pattern). [VERIFIED: novnc/websockify-js source + fmp4-fanout.ts:246] |
| **V33-VNC-03** | Frontend `use-webapp-vnc.ts` consumes the new RFB byte stream without any code change — wsUrl shape `/ws/stream/:streamId?token=…` unchanged, no subprotocol negotiation needed | `use-webapp-vnc.ts` constructs `new RFB(target, wsUrl, {credentials})` without `wsProtocols`; installed `@novnc/novnc@1.6.0/lib/rfb.js:147` defaults `_wsProtocols = options.wsProtocols || []`; no `Sec-WebSocket-Protocol` header sent → server-side bridge does not need to negotiate. [VERIFIED: rfb.js:147 + use-webapp-vnc.ts:137] |
| **V33-VNC-04** | x11vnc lifecycle is bound to the Chrome window — when `xprop -id <wid>` poll reports window-gone, x11vnc is SIGTERM'd, all WS subscribers closed with code 1011, port returned to pool | Existing `WebAppWindowManager.idleCleanupTick()` already polls `isWindowAlive(wid)` every 5s and cascades to `close({webappId})`; cascade just needs to call new `vncBridge.stop(streamId)` instead of `streamManager.stopStream(streamId)` (or the StreamManager call dispatches internally on session kind). [VERIFIED: window-manager.ts:438 + isWindowAlive uses xdotool getwindowname which is the xprop equivalent] |
| **V33-VNC-05** | Sacred file `liv/packages/core/src/sdk-agent-runner.ts` SHA stays at `f3538e1d811992b782a9bb057d1b7f0a0189f95f` before AND after every commit; no edits to `liv/packages/core/`, no Docker, no Python sidecar | Phase 93 SUMMARY.md confirms this SHA preserved across 13 task commits in P93 alone. Verify via `git hash-object` gate identical to T93-* tasks. [CITED: 93-SUMMARY.md:139] |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Spawn x11vnc per window + manage process lifecycle | API / Backend (livinityd) | — | x11vnc reads the host X server pixmap; must run as bruce on the Mini PC, not in the browser. Already where Chrome spawn lives. |
| WS↔TCP byte bridging + backpressure | API / Backend (livinityd) | — | Auth gate (JWT verify + ownership check) must stay in livinityd per D-99-02. Bridge cannot live in CDN/edge. |
| RFB protocol decoding + canvas rendering | Browser / Client (UI) | — | Already shipped in P95-04 via `@novnc/novnc 1.6.0`. Phase 99 must NOT touch this tier. |
| Mouse/keyboard event capture + send-back over WS | Browser / Client (UI) | API / Backend (transparent forward) | noVNC RFB client encodes input as RFB ClientMsg bytes; bridge forwards bytes verbatim; x11vnc decodes and uses xdotool internally. No new code path. |
| Window discovery (xdotool/wmctrl) + idle cleanup | API / Backend (livinityd) | — | Already shipped in P93-07/P93-10. Phase 99 reuses `findNewWindowMatching` + `isWindowAlive` unchanged. |
| Static assets + frontend bundle | CDN / Static | — | Out of phase scope. UI build untouched. |
| Stream port pool | API / Backend (Redis or in-memory) | — | Existing per-stream allocator (currently keyed by `streamId`); reuse. |

**Critical:** No tier reassignment occurs in Phase 99. Backend swaps wire format; frontend stays as-is. The Architectural Responsibility Map is structurally identical to P93+P95 — only the protocol on the wire between Backend and Browser changes (fMP4 → RFB).

## Standard Stack

### Core (already installed and verified)

| Library/Binary | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `x11vnc` | 0.9.16-10 (Ubuntu 24.04 noble) | RFB server attached to a single X11 window via `-id <wid>` | Defacto X11 VNC server; pinned in `livos/install.sh:614`; already running as `livos-x11vnc.service` on the full desktop. [VERIFIED: install.sh:614 + Ubuntu 24.04 packages.ubuntu.com] |
| `@novnc/novnc` | 1.6.0 | Browser-side RFB client (already shipped, do not touch) | Industry-standard JS noVNC implementation. [VERIFIED: livos/node_modules/.pnpm/@novnc+novnc@1.6.0/.../lib/rfb.js + 95-SUMMARY.md:59] |
| `ws` | (already in livinityd deps) | Node WebSocket server (handleUpgrade pattern at `/ws/stream/:streamId`) | Already used for `/ws/desktop` + `/ws/stream/:id` upgrade handlers. No new dep. [VERIFIED: server/index.ts:1044] |
| `node:net` | Node ≥ 20 stdlib | TCP socket to `x11vnc`'s `-rfbport <local_port>` | Stdlib; no new dep. [VERIFIED] |

### Supporting (already installed)

| Library/Binary | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `xdotool` | 3.x | `xdotool getwindowname <wid>` for `isWindowAlive` poll | Already used by `window-discovery.ts:isWindowAlive` |
| `wmctrl` | 1.07 | `wmctrl -lG` window list for baseline-wid diff | Already used by `window-discovery.ts:listAllWindows` |
| `xprop` | 1.x | Optional cross-check against xdotool for window-gone detection | Mentioned in CONTEXT D-99-08; xdotool is the existing pattern, equally valid |

### Alternatives Considered (and why they're NOT used)

| Instead of | Could Use | Tradeoff (Why we don't) |
|------------|-----------|-------------------------|
| Per-Node WS↔TCP bridge | `websockify` as a separate child process | Would split the auth boundary across two processes; bridge would need a unix-socket handshake or shared secret. Pure-Node bridge keeps JWT verify + ownership check in livinityd. **D-99-02 explicit lock.** [VERIFIED: D-99-02] |
| `x11vnc -id <wid>` per window | Single shared `x11vnc :0` + browser-side CSS clip | Was the P93 architecture-pivot proposal; rejected because frontend already shipped noVNC RFB client per-stream; sharing one VNC across multiple WebApps would force cross-WebApp pointer/keyboard collision. [VERIFIED: 93-CONTEXT.md "Architecture pivot" section] |
| `x11vnc -id <wid>` per window | PipeWire screencast portal (`mode:'pipewire-fd'`) | Requires user-consent dialog every spawn (portal UX); would emit fMP4 fragments not RFB → wire-format mismatch persists; portal availability gated on active D-Bus session bus. **Already implemented in P93-08; left as-is for fMP4 path; not used by VNC swap.** [VERIFIED: pipewire-portal.ts] |
| `x11vnc` | `Selkies-GStreamer` (Python sidecar with WebRTC) | Heavyweight + Python sidecar dep ruled out by P93 scope; deferred to v34 per v33-DRAFT.md §9. [CITED: v33-DRAFT.md:287] |
| Hand-roll Node bridge | `websockify-js` library inline | Library is itself ~50 lines and lacks backpressure; D-99-02 forbids extra-process variant; inlining the npm package adds a dep with no win. Hand-roll matches the project's "no new deps unless necessary" posture. [VERIFIED: 93-SUMMARY.md:116 — same posture used for fMP4 box parser] |

### Installation

**Nothing new to install.** All binaries + npm packages are already in the dependency tree:

- `x11vnc` apt-installed by `livos/install.sh:614` (P93-01).
- `@novnc/novnc 1.6.0` shipped via P95-03 commit `dd6a12b6`.
- `ws` already used by livinityd's WS infrastructure.
- `node:net` is stdlib.

If a fresh Mini PC is ever re-imaged, `bash livos/install.sh` already provisions everything required by Phase 99.

**Version verification (Brave/web-search confirmed 2026-05-08):**

| Package | Pinned in repo | Latest published | Action |
|---------|----------------|------------------|--------|
| `@novnc/novnc` | `^1.6.0` (95-03 commit) | 1.6.0 | None needed; already on latest. [VERIFIED: WebSearch confirms 1.6.0 is latest stable] |
| `x11vnc` (apt) | distro pin (`x11vnc 0.9.16-10`) | upstream 0.9.16 (released 2025-01-05) | None needed. The 0.9.17 release tag exists but is from 2009; 0.9.16 is the genuine latest stable. [VERIFIED: github.com/LibVNC/x11vnc/releases] |

## Architecture Patterns

### System Architecture Diagram

```
                 ┌─────────────────────────────────────────────────────┐
                 │                   Browser (UI)                      │
                 │  ┌─────────────────────────────────────────────┐    │
                 │  │ webapp-stream-window.tsx (P95-08, unchanged) │    │
                 │  │   ↓                                          │    │
                 │  │ use-webapp-vnc.ts (P95-04, unchanged)        │    │
                 │  │   ↓ new RFB(div, wsUrl, {credentials})       │    │
                 │  │ @novnc/novnc 1.6.0 lib/rfb.js                │    │
                 │  │   ↓ wsProtocols=[] (no Sec-WebSocket-Proto)  │    │
                 │  │ WebSocket(wsUrl + '?token=<jwt>')            │    │
                 │  └────────┬─────────────────────────────────────┘    │
                 └───────────┼─────────────────────────────────────────┘
                             │ WS upgrade (binary frames)
                             │ wsUrl = /ws/stream/<streamId>?token=…
                             ▼
                 ┌─────────────────────────────────────────────────────┐
                 │              livinityd (Node, runs as root)        │
                 │  ┌─────────────────────────────────────────────┐   │
                 │  │ /ws/stream/:streamId upgrade handler        │   │
                 │  │   1. Extract streamId, verify JWT           │   │
                 │  │   2. Ownership check via                    │   │
                 │  │      streamManager.listStreams({userId})    │   │
                 │  │   3. Branch on session kind:                │   │
                 │  │      kind === 'fmp4'  → fanout.addSubscriber│   │
                 │  │      kind === 'vnc'   → vncBridge.attach    │   │  ◄── NEW dispatch
                 │  └────────┬────────────────────────────────────┘   │
                 │           │                                          │
                 │   ┌───────┴────────┐                                 │
                 │   │                │                                 │
                 │   ▼ kind='fmp4'    ▼ kind='vnc'                      │
                 │  ┌──────────────┐ ┌──────────────────────────────┐   │
                 │  │ Fmp4Fanout   │ │ VncBridge (NEW, ~50 lines)   │   │
                 │  │ (P93-04,     │ │   ws.on('message', d =>      │   │
                 │  │  unchanged)  │ │     tcp.write(d))            │   │
                 │  └──────┬───────┘ │   tcp.on('data', d =>        │   │
                 │         │         │     ws.bufferedAmount<4MB    │   │
                 │         │         │       ? ws.send(d)           │   │
                 │         │         │       : ws.close(1013))      │   │
                 │         │         │   ws.on('close', () =>       │   │
                 │         │         │     tcp.destroy())           │   │
                 │         │         │   tcp.on('close', () =>      │   │
                 │         │         │     ws.close(1011))          │   │
                 │         │         └─────────┬────────────────────┘   │
                 │         │                   │                        │
                 │         │ stdin             │ net.Socket             │
                 │         │ (encoder stdout)  │ → 127.0.0.1:rfbPort    │
                 │         ▼                   ▼                        │
                 │  ┌──────────────┐ ┌──────────────────────────────┐   │
                 │  │ ffmpeg/gst   │ │ x11vnc -id <wid>             │   │
                 │  │ (existing,   │ │   -rfbport <localPort>       │   │
                 │  │  unchanged   │ │   -localhost -shared -forever│   │
                 │  │  for desktop │ │   -noxdamage -nopw           │   │
                 │  │  mode)       │ │   spawned as bruce via sudo  │   │
                 │  └──────┬───────┘ │   with DISPLAY=:0 +          │   │
                 │         │         │   XAUTHORITY=/run/user/1000/ │   │
                 │         │         │   gdm/Xauthority             │   │
                 │         │         └─────────┬────────────────────┘   │
                 └─────────┼───────────────────┼────────────────────────┘
                           │                   │
                           ▼                   ▼
                 ┌─────────────────────────────────────────────────────┐
                 │   Mini PC X11 server (:0, GNOME Shell + Mutter)      │
                 │     ┌────────────────┐  ┌────────────────┐           │
                 │     │ Chrome window 1│  │ Chrome window 2│           │
                 │     │   (wid=A,      │  │   (wid=B,      │           │
                 │     │    facebook)   │  │    gmail)      │           │
                 │     └────────────────┘  └────────────────┘           │
                 │                                                      │
                 │  XComposite extension provides off-screen pixmaps    │
                 │  per-window even when Chrome is partially obscured.  │
                 └──────────────────────────────────────────────────────┘
```

**Reading order:** A user click on a WebApp icon (1) calls tRPC `webapps.window.spawn({webappId,url})` which (2) spawns Chrome `--new-window`, (3) discovers the wid via `findNewWindowMatching`, (4) calls `streamManager.startStream({mode:'vnc-window', target:{wid}})` which (5) allocates a local port, (6) spawns x11vnc, (7) returns `{streamId, wsUrl}`. The frontend (8) opens `new RFB(div, wsUrl + '?token=…')`, the WS handler (9) authenticates the JWT, (10) verifies ownership, (11) constructs a `VncBridge` that opens a `net.connect({port:rfbPort})` TCP socket and pipes bytes both ways. The user's mouse/keyboard input flows browser → ws → tcp → x11vnc → xdotool → Chrome window. The Chrome window's pixel updates flow Chrome → X server → x11vnc → tcp → ws → @novnc/novnc canvas.

### Recommended Project Structure (post-Phase 99)

```
livos/packages/livinityd/source/modules/
├── streaming/
│   ├── encoder-args.ts         # UNCHANGED (window-crop branch becomes dead code)
│   ├── fmp4-fanout.ts           # UNCHANGED (still used by mode='desktop')
│   ├── stream-manager.ts        # MODIFIED — discriminated-union session: {kind:'fmp4'|'vnc'}
│   ├── vaapi-probe.ts           # UNCHANGED
│   └── vnc-bridge.ts            # NEW — spawnVncForWindow() + WS↔TCP byte pipe
└── webapps/
    ├── window-manager.ts        # MODIFIED — startStream({mode:'vnc-window',target:{wid}})
                                 #   instead of {mode:'window-crop',target:{display,geometry}}
    │                            #   geometry-clamp logic preserved as no-op (D-99-05)
    ├── window-discovery.ts      # UNCHANGED
    ├── pipewire-portal.ts       # UNCHANGED (orphaned but kept for fMP4 path)
    └── geometry-tracker.ts      # UNCHANGED (orphaned but kept for fMP4 path)

livos/packages/livinityd/source/modules/server/
└── index.ts                     # MODIFIED — /ws/stream/:streamId branches on session.kind
```

### Pattern 1: x11vnc Per-Window Spawn (CANONICAL FLAGS)

**What:** Spawn one x11vnc daemon per WebApp window, bound to localhost on a livinityd-allocated port.

**When to use:** Every WebApp window (D-99-01).

**Example:**

```bash
# Source: x11vnc man page + LibVNC/x11vnc FAQ.md
# Verified flag set per D-99-01 + upstream Mutter compatibility guidance:
sudo -u bruce \
  DISPLAY=:0 \
  XAUTHORITY=/run/user/1000/gdm/Xauthority \
  /usr/bin/x11vnc \
    -id 0xABCDEF \              # the wid from xdotool, accepts hex (0x...) or decimal
    -rfbport 15999 \             # local port allocated from pool, livinityd will net.connect to this
    -localhost \                 # bind 127.0.0.1 only — no external surface
    -shared \                    # multiple subscribers can attach (matches Fmp4Fanout multi-subscriber UX)
    -forever \                   # x11vnc stays alive after first client disconnect
    -noxdamage \                 # canonical Mutter/compositor workaround per upstream FAQ
    -nopw                        # no VNC password — auth happens at WS layer via JWT (D-99-01)
```

**Hex vs decimal for `-id`:** x11vnc accepts both. xdotool/wmctrl emit decimal in `wmctrl -lG`'s first column when LP-prefixed (e.g. `0x05000003`); `window-discovery.ts:108` parses with `parseInt(match[1], 16)` so the in-memory `wid: number` is decimal. Spawn argv can pass either `String(wid)` (decimal) or `'0x' + wid.toString(16)` (hex). **Recommendation:** pass hex with leading `0x` to match the canonical x11vnc man-page examples and avoid any decimal-vs-hex parsing ambiguity. [VERIFIED: x11vnc man page + window-discovery.ts:108]

**Source:** D-99-01 specifies the flag set; upstream FAQ at `github.com/LibVNC/x11vnc/blob/master/doc/FAQ.md` documents `-noxdamage` for compositors.

### Pattern 2: Pure-Node WS↔TCP Bridge with Backpressure

**What:** A small, self-contained bridge that pipes binary bytes between an upgraded `ws.WebSocket` and a `net.Socket` connected to x11vnc's local RFB port.

**When to use:** Every VNC-mode subscriber attach (replaces `Fmp4Fanout.addSubscriber` for VNC sessions).

**Example:**

```typescript
// Source: novnc/websockify-js + fmp4-fanout.ts:246 backpressure pattern
// (Illustrative — the planner refines naming + DI)

import {connect as netConnect, type Socket} from 'node:net'
import type {WebSocket} from 'ws'

const BACKPRESSURE_BYTES = 4 * 1024 * 1024 // matches Fmp4Fanout default (D-99 "Bridge sketch")

export function attachVncBridge(ws: WebSocket, opts: {host: string; port: number; logger?: Logger}): void {
  const tcp: Socket = netConnect({host: opts.host, port: opts.port})

  ws.binaryType = 'nodebuffer' // already set by /ws/stream upgrade handler

  // Browser → x11vnc (RFB ClientMsg: SetEncodings, FramebufferUpdateRequest, KeyEvent, PointerEvent)
  ws.on('message', (data: Buffer) => {
    if (tcp.writable) tcp.write(data)
  })

  // x11vnc → Browser (RFB ServerMsg: FramebufferUpdate, ServerCutText, etc.)
  tcp.on('data', (data: Buffer) => {
    const buffered = (ws as WebSocket & {bufferedAmount?: number}).bufferedAmount ?? 0
    if (buffered > BACKPRESSURE_BYTES) {
      opts.logger?.warn(`vnc-bridge: dropping slow subscriber (buffered=${buffered})`)
      ws.close(1013, 'try again later') // mirrors Fmp4Fanout drop code
      tcp.destroy()
      return
    }
    ws.send(data)
  })

  // Bidirectional close propagation
  ws.on('close', () => tcp.destroy())
  ws.on('error', (err) => {
    opts.logger?.warn('vnc-bridge: WS error', err)
    tcp.destroy()
  })
  tcp.on('close', () => {
    if (ws.readyState === ws.OPEN) ws.close(1011, 'vnc backend closed')
  })
  tcp.on('error', (err) => {
    opts.logger?.warn('vnc-bridge: TCP error', err)
    if (ws.readyState === ws.OPEN) ws.close(1011, 'vnc backend error')
  })
}
```

**Why per-subscriber TCP:** RFB is a stateful, single-client-per-session protocol (each connection negotiates ProtocolVersion → Security → Init independently). Even with x11vnc's `-shared` flag, EACH connected client opens a separate TCP connection to the rfbport — the `-shared` flag just means x11vnc accepts multiple parallel TCP connections instead of refusing them. Therefore one `net.connect()` per WS subscriber is correct. (The Fmp4Fanout multi-subscriber model fans out one encoder stdout to N subscribers; the VNC bridge is structurally simpler: one ws ↔ one tcp ↔ one x11vnc port. If two browsers open the same `streamId`, two TCP connections open to the same rfbport — that's what `-shared` is for.) [VERIFIED: x11vnc man page + RFB protocol spec]

**Source:** novnc/websockify-js core forwarding pattern; backpressure rule and threshold from `Fmp4Fanout.feed()` line 246 (already-shipped code).

### Pattern 3: Discriminated-Union StreamSession

**What:** Swap `Map<streamId, StreamSession>` from a single shape to a discriminated union so `/ws/stream/:streamId` can dispatch correctly.

**When to use:** Inside `stream-manager.ts` when `mode === 'vnc-window'` is added.

**Example:**

```typescript
// Source: project's own StreamManager.ts existing pattern, extended
// (Illustrative — planner picks parallel-maps OR discriminated union per Discretion)

type StreamSession =
  | {
      kind: 'fmp4'
      streamId: string
      userId: string
      mode: 'desktop' | 'window-crop' | 'pipewire-fd'
      encoder: ChildProcess
      fanout: Fmp4Fanout
      // ... existing fields
    }
  | {
      kind: 'vnc'
      streamId: string
      userId: string
      mode: 'vnc-window'
      x11vnc: ChildProcess
      rfbPort: number
      wid: number
      // No fanout — bridge is per-subscriber, not shared
    }

// In /ws/stream/:streamId handler:
const session = streamManager.getSession(streamId) // new method
if (session.kind === 'fmp4') {
  streamManager.addSubscriber(streamId, ws) // existing path
} else {
  attachVncBridge(ws, {host: '127.0.0.1', port: session.rfbPort, logger})
}
```

**Source:** Project's own `stream-manager.ts:65-77` already defines `StreamSession` as a single shape; the swap extends it.

### Anti-Patterns to Avoid

- **Spawning x11vnc with `-id 0xN -display :0` from livinityd's root process:** Chrome runs as bruce; x11vnc must read bruce's X session. Spawning x11vnc as root will hit the same `Cannot open display` failure that the 5 Chrome-spawn fixes (`5e126607..4c55b173`) solved. **Mitigation:** spawn x11vnc through the IDENTICAL `sudo -u bruce -n DISPLAY=… XAUTHORITY=… /usr/bin/x11vnc …` command-prefix-env pattern from `window-manager.ts:223-238`. [VERIFIED: window-manager.ts:223 pattern + 96f2527b commit]
- **Setting `Sec-WebSocket-Protocol` on the server bridge:** Triggers handshake mismatch with `@novnc/novnc 1.6.0` which sends NO subprotocol. Leave `WebSocketServer({noServer:true}).handleUpgrade()` as-is. [VERIFIED: rfb.js:147 default empty]
- **Streaming RFB through `Fmp4Fanout`:** The fanout assumes fMP4 box boundaries (`tryReadBox`), corrupts arbitrary byte streams. The VNC path MUST bypass the fanout entirely. [VERIFIED: fmp4-fanout.ts:115 hard-codes 4 BE size + 4 ASCII type]
- **Holding `tcp.write()`'s return value blocking:** websockify-js does fire-and-forget. Backpressure on the OUTBOUND (browser→x11vnc) direction is not implemented because RFB ClientMsg traffic is tiny (mouse moves at ~30 Hz × ~6 bytes). Backpressure check is on the INBOUND (x11vnc→browser) direction only, where framebuffer updates can spike to MB/s. [VERIFIED: websockify-js source pattern]
- **Auto-falling-back to ffmpeg crop on x11vnc spawn failure:** **D-99-06 explicitly forbids this.** Fail loud — if x11vnc cannot capture the window, that's a P99-blocker discovered during plan-checker walk and the milestone stops. The fMP4 codepath stays as a separate, explicit `mode:'desktop'` selection, never auto-substituted.
- **Renaming or removing `Fmp4Fanout`:** Even though the WebApp branch no longer uses it, `mode:'desktop'` (the `desktop-stream` native app) still does. **D-99-04 requires the fMP4 path to stay alive.** Don't rip it out as part of "cleanup".

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RFB protocol parser/encoder on the server | A homegrown RFB negotiation in Node | x11vnc + transparent byte bridge | RFB negotiation includes versions, security types, pixel format negotiation — getting it wrong breaks every client. x11vnc handles all of it; the bridge is a pure byte pipe. |
| RFB protocol decoder on the client | Hand-written canvas painter | `@novnc/novnc 1.6.0` (already shipped) | noVNC has 10+ years of compatibility battle-testing with every RFB server variant. Already in the bundle. |
| WebSocket server | Hand-rolled HTTP-upgrade handler | `ws` package (already used) + `WebSocketServer({noServer:true})` | RFC 6455 is non-trivial; livinityd already uses `ws` for `/ws/desktop` and `/ws/stream/:id`. |
| TCP socket pump | Manual `Buffer.concat` + custom queue | `node:net` `tcp.on('data', ws.send)` direct forward | Node's stream backpressure + the simple bridge pattern from websockify-js is sufficient for RFB throughput. |
| Window discovery / lifecycle polling | Reimplement xdotool wrappers | Existing `window-discovery.ts` (P93-07) | Already handles X11 env injection (`/run/user/1000/gdm/Xauthority`), `execFile` quoting, and the snapshot/diff pattern. |
| Compositor pixmap extraction | Custom XComposite client | x11vnc's built-in `-id` + `-noxdamage` | x11vnc already integrates XComposite (since 0.9.14); rolling your own would mean writing a Composite Extension client in Node. |

**Key insight:** Every primitive Phase 99 needs is already on the box. The phase is a 50-line bridge plus 4 file edits, not a rewrite of streaming. Resist the urge to "clean up" the fMP4 path while you're in there — it stays alive for `mode:'desktop'` per D-99-04.

## Common Pitfalls

### Pitfall 1: x11vnc spawned as root or with no DISPLAY → "Cannot open display: :0"

**What goes wrong:** livinityd runs as root via systemd. If x11vnc inherits root's environment (no DISPLAY, no XAUTHORITY), it fails with `xauth: error in locking authority file` or `Xlib: connection to ":0.0" refused`. x11vnc exits non-zero within ~100ms; the WS bridge `tcp.connect()` fails with `ECONNREFUSED`; the noVNC client errors `Failed when connecting`.

**Why it happens:** Root's env in systemd has only `PATH`/`HOME`/`USER`. Chrome had this exact problem in P79; commits `5e126607..4c55b173` fixed it for Chrome but x11vnc spawn is a NEW path.

**How to avoid:** Spawn x11vnc through the IDENTICAL pattern from `window-manager.ts:223-238`:

```typescript
// Reuse the existing WEBAPPS_X11_ENV constant
const x11vncArgs = [
  '-n', '-u', 'bruce',
  `DISPLAY=${WEBAPPS_X11_ENV.DISPLAY}`,
  `XAUTHORITY=${WEBAPPS_X11_ENV.XAUTHORITY}`,
  '/usr/bin/x11vnc',
  '-id', '0x' + wid.toString(16),
  '-rfbport', String(rfbPort),
  '-localhost', '-shared', '-forever', '-noxdamage', '-nopw',
]
const proc = spawn('sudo', x11vncArgs, {
  stdio: ['ignore', 'ignore', 'pipe'], // capture stderr for D-99-07 diagnostic
  env: {...process.env, ...WEBAPPS_X11_ENV},
})
```

**Warning signs:** x11vnc exits within 200ms of spawn; stderr contains `Cannot open display`, `xauth:`, or `XOpenDisplay failed`. The D-99-07 stderr-tail diagnostic surfaces this immediately.

### Pitfall 2: x11vnc returns "black" because XComposite redirects pixmap off-screen

**What goes wrong:** Under Mutter's compositing, when a window is partially obscured or is rendered via DRI3 direct-to-GPU (which Chrome does for video tags and some accelerated layers), `XGetImage(window, ...)` reads from on-screen pixmaps that may be empty. The result: x11vnc "works" (RFB handshake succeeds, framebuffer updates flow) but every frame is black or frozen.

**Why it happens:** Compositors redirect window contents to off-screen pixmaps managed by the compositor. The XComposite extension provides `XCompositeNameWindowPixmap()` to access these, but only if the window is `RedirectAutomatic` and the compositor cooperates.

**How to avoid (verified workarounds in priority order):**

1. **`-noxdamage`** — already in D-99-01 flag set. This is upstream's canonical compositor workaround per `LibVNC/x11vnc/doc/FAQ.md`. [VERIFIED: WebSearch + upstream FAQ]
2. **Verify x11vnc was built with XComposite support** — Ubuntu 24.04's `x11vnc 0.9.16-10` is built against `libxcomposite-dev` per the standard build recipe. Check with `x11vnc -h | grep -i composite` if any doubt arises during the verification step.
3. **Force the window onto an unredirected path during capture** — `xdotool windowmap <wid>` + `xdotool windowactivate --sync <wid>` ensures the window is mapped (not iconified) before x11vnc attaches. Already done by P95's spawn flow indirectly; can be made explicit in the bridge spawn step.
4. **Last-resort fallback flags if -noxdamage alone fails:** `-rawfb` (writes pixels directly without going through X), `-onetile` (single-tile updates instead of damage-rectangle batching). These are only worth trying if the verification step actually surfaces a black frame.

**Warning signs:** noVNC handshake succeeds, browser canvas shows a black/white/uniform-color rectangle the size of the window geometry, then no further updates. **The Mini PC verification step (`nc 127.0.0.1 <port> | head -c 12` returns `RFB 003.008\n` AND a real noVNC connect shows real pixels) is the gate.**

### Pitfall 3: noVNC's reconnect-on-disconnect loop hammering x11vnc

**What goes wrong:** `use-webapp-vnc.ts:181-193` schedules backoff reconnects (`[1000, 2000, 4000, 8000]` ms ladder) on `disconnect` event with `clean !== true`. When the WS handler sends `ws.close(1011)` on x11vnc TCP close, noVNC sees a non-clean disconnect and reconnects. If the user-walked window has died, `xprop` polling will detect it within 5s and cascade-close the StreamSession; meanwhile noVNC keeps reconnecting against a now-removed streamId. Each reconnect attempts WS upgrade, JWT verify, ownership lookup, gets 404, retries.

**Why it happens:** Frontend retry logic predates the x11vnc swap; backend lifecycle (`xprop -id <wid>` 5s poll → cascade close) doesn't surface "stream went away forever" vs "stream is reconnecting" distinctly.

**How to avoid:** When the WS handler's ownership lookup returns 404 for a streamId, that's a "stream is gone" signal. noVNC's reconnect loop will see WS connect-then-immediate-close-with-401/404 and the existing 8s backoff cap means at most ~1 attempt every 8s — acceptable cost. **No frontend change needed**, but document this in the SUMMARY so future maintenance knows the noVNC reconnect-spam is bounded.

**Warning signs:** livinityd logs show repeated `WS stream <streamId> rejected: not found for user <userId>` at 1s/2s/4s/8s intervals after a window closes. This is benign and self-resolving when the user closes the WebApp window in the LivOS UI (which fires `webapps.window.close({webappId})` and unmounts the noVNC-bearing component).

### Pitfall 4: x11vnc spawn → first TCP connect race

**What goes wrong:** `streamManager.startStream({mode:'vnc-window'})` spawns x11vnc and returns `{streamId, wsUrl}` synchronously. The frontend opens the WS within ~100ms (mutation resolves → render → useEffect → new RFB). The bridge's `net.connect({port:rfbPort})` fires before x11vnc's `bind(0.0.0.0:<port>)` has completed, gets `ECONNREFUSED`, and the bridge calls `ws.close(1011)`.

**Why it happens:** x11vnc takes ~200-400ms to print "PORT=<port>\n" on stderr and start accepting connections. `child_process.spawn` returns immediately.

**How to avoid:** Two options:
1. **Wait for x11vnc readiness before returning startStream:** Parse stderr for `PORT=<port>` line (x11vnc prints this when ready) OR retry `net.connect` 3 times with 100ms backoff before giving up. Recommend the latter — simpler, doesn't depend on x11vnc stderr format.
2. **Pre-allocate the port via `net.createServer().listen(0)` then close** to avoid the system races, then spawn x11vnc with that port. Slightly racy on its own; the retry loop is more robust.

**Warning signs:** First user-click on a WebApp shows "Stream ended" briefly before reconnect succeeds. Bridge logs `tcp connect ECONNREFUSED 127.0.0.1:<port>` immediately after spawn. **Mitigation:** retry-with-backoff inside `attachVncBridge` (3 attempts × 100ms — only ~300ms upper bound, invisible to user, hides the spawn-race entirely).

### Pitfall 5: streams.start({mode:'window-crop'}) idempotency hash collision

**What goes wrong:** `StreamManager.startStream` (line 122-134) keys idempotency on `(userId, mode, JSON.stringify(target))`. After swap, the mode goes from `'window-crop'` to `'vnc-window'`. If the StreamManager retains in-memory state across the deploy (it does NOT — livinityd restart clears the Map), this is moot. But if a future migration ever needs to coexist with the old mode (e.g., gradual rollout), the same `(userId, 'vnc-window', target)` could collide with a leftover `(userId, 'window-crop', target)` for the same `wid`. The idempotency check returns the wrong session.

**Why it happens:** Mode is part of the cache key, target is JSON-stringified. If `target` becomes `{wid: 1234}` instead of `{display: ':0.0', geometry: {x,y,w,h}}`, the hash differs anyway. **No real risk unless someone restarts livinityd mid-flight while preserving the Map.**

**How to avoid:** Hard-cut, no flag (per CONTEXT recommendation). On livinityd restart, all streams die and respawn fresh. No coexistence path exists. Document in SUMMARY.

**Warning signs:** None expected. Listed for completeness.

## Runtime State Inventory

> **This is a refactor phase** (wire-format swap). Runtime state inventory is REQUIRED.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | None — `liv:streaming:caps` Redis HASH stores VAAPI probe result; unaffected by swap. No persisted streamIds, no persisted RFB session state. | None |
| **Live service config** | `livos-x11vnc.service` (system-wide x11vnc on full :0) — written by `install.sh:812-826`, runs independently of livinityd. **NOT touched by Phase 99.** This service is for the legacy desktop-stream native app (an SDK consumer that connects directly to `:5900`). Phase 99's per-window x11vnc instances are spawned dynamically by livinityd and bind ephemeral ports, not 5900. **No collision.** | None — verify in Mini PC step that the per-window x11vnc instance binds to a port DIFFERENT from 5900 (port pool should already exclude 5900) |
| **OS-registered state** | None — no Task Scheduler, no launchd, no systemd unit registers a Phase-99-specific name. Existing `livos.service` runs livinityd; that's it. | None |
| **Secrets and env vars** | `JWT secret` at `/opt/livos/data/secrets/jwt` — used by the existing WS handler's `verifyToken()`. **Unchanged.** No new env var introduced by Phase 99. `WEBAPPS_X11_ENV` (DISPLAY/XAUTHORITY) reused from `window-discovery.ts:49-52`. | None |
| **Build artifacts / installed packages** | `livos/node_modules/.pnpm/@novnc+novnc@1.6.0/...` — installed during P95-03 deploy. Verified present on Mini PC (since UAT got far enough to fire the noVNC client and ERROR on ftypiso). x11vnc binary at `/usr/bin/x11vnc 0.9.16-10` — installed by P93-01. websockify at `/usr/local/bin/websockify` — installed by P93-01 (NOT used by Phase 99 because D-99-02 forbids extra-process variant; presence is harmless). | None |

**The canonical question: After every file in the repo is updated, what runtime systems still have the old wire format cached, stored, or registered?**

- **Browser cache:** noVNC bundle is cached but identical across the swap (frontend zero changes). Forced reload not strictly needed — but recommend hard-refresh during UAT to rule out service-worker stale state.
- **Existing `desktop-stream` native app:** Connects to `mode:'desktop'` fMP4 path, untouched. Verifying this still works post-deploy is part of P98 UAT, not P99.
- **In-memory StreamSession Map:** Cleared on livinityd restart (`systemctl restart livos`). No persistence.

**Nothing else.** This is a clean wire-format swap with no migrations.

## Code Examples

### x11vnc spawn invocation (from livinityd)

```typescript
// Source: window-manager.ts:223-238 pattern (Chrome spawn, identical env injection)
//         + D-99-01 flag set
//         + Pitfall 1 mitigation
import {spawn, type ChildProcess} from 'node:child_process'
import {WEBAPPS_X11_ENV} from '../webapps/window-discovery.js'

export function spawnVncForWindow(opts: {wid: number; rfbPort: number; logger?: Logger}): ChildProcess {
  const widHex = '0x' + opts.wid.toString(16)
  const args = [
    '-n', '-u', 'bruce',
    `DISPLAY=${WEBAPPS_X11_ENV.DISPLAY}`,
    `XAUTHORITY=${WEBAPPS_X11_ENV.XAUTHORITY}`,
    '/usr/bin/x11vnc',
    '-id', widHex,
    '-rfbport', String(opts.rfbPort),
    '-localhost',
    '-shared',
    '-forever',
    '-noxdamage',
    '-nopw',
  ]
  const proc = spawn('sudo', args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {...process.env, ...WEBAPPS_X11_ENV},
  })
  // D-99-07: stderr tail diagnostic
  const stderrTail: string[] = []
  proc.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString('utf-8').trim()
    if (line) {
      opts.logger?.verbose?.(`x11vnc[${opts.wid}] stderr: ${line}`)
      stderrTail.push(line)
      if (stderrTail.length > 50) stderrTail.shift()
    }
  })
  proc.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      opts.logger?.error?.(
        `x11vnc[${opts.wid}] crashed (code=${code} signal=${signal}` +
        ` argv=${JSON.stringify(args)})\n--- stderr ---\n${stderrTail.join('\n')}`,
      )
    }
  })
  return proc
}
```

### Mini PC live verification (BEFORE any code lands — this is the gate)

```bash
# Run on Mini PC via SSH (single batched session per memory note feedback_ssh_rate_limit.md)
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
  'set -e

   # 1. Confirm session is X11 (NOT Wayland — would block x11vnc cold)
   echo "session_type=$XDG_SESSION_TYPE"

   # 2. Spawn a fresh Chrome window for testing
   sudo -u bruce DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
     google-chrome --new-window about:blank &
   sleep 2

   # 3. Find the window
   WID=$(sudo -u bruce DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
     xdotool search --name "New Tab" | tail -1)
   WID_HEX=$(printf "0x%x" "$WID")
   echo "wid=$WID hex=$WID_HEX"

   # 4. Spawn x11vnc on a known port
   sudo -u bruce DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
     /usr/bin/x11vnc -id "$WID_HEX" -rfbport 15999 -localhost -shared -forever -noxdamage -nopw &
   X11VNC_PID=$!
   sleep 1

   # 5. Verify RFB handshake
   HANDSHAKE=$(timeout 1 nc 127.0.0.1 15999 | head -c 12 | xxd | head -1 || echo "FAIL")
   echo "handshake=$HANDSHAKE"
   # Expected: "00000000: 5246 4220 3030 332e 3030 380a   RFB 003.008."
   #           ^^ ASCII for "RFB 003.008\n" — the protocol-version string

   # 6. Verify x11vnc is alive after handshake
   kill -0 "$X11VNC_PID" 2>/dev/null && echo "x11vnc=alive" || echo "x11vnc=dead"

   # 7. Cleanup
   kill -TERM "$X11VNC_PID" 2>/dev/null || true
   pkill -f "google-chrome.*about:blank" 2>/dev/null || true
  '
```

**PASS:** `session_type=x11` AND `handshake=...RFB 003.008...` AND `x11vnc=alive`.
**FAIL (any):** STOP. The phase cannot ship without this passing. Investigate root cause (Wayland session? XAUTHORITY drift? compositor variant?).

### Branching the WS upgrade handler

```typescript
// Source: server/index.ts:1042-1066 (existing fanout-attach block, modified)
// Insert dispatch BEFORE the existing addSubscriber call
const session = streamManager.getSession(streamId) // new helper exposing kind
const streamWss = new WebSocketServer({noServer: true})
streamWss.handleUpgrade(request, socket, head, (ws) => {
  streamWss.close()
  ws.binaryType = 'nodebuffer'
  if (session.kind === 'vnc') {
    attachVncBridge(ws, {host: '127.0.0.1', port: session.rfbPort, logger: this.logger})
  } else {
    const ok = streamManager.addSubscriber(streamId, ws)
    if (!ok) {
      ws.close(1011, 'stream gone')
      return
    }
    ws.on('close', () => streamManager.getFanout(streamId)?.removeSubscriber(ws))
    ws.on('error', () => streamManager.getFanout(streamId)?.removeSubscriber(ws))
  }
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-window via `ffmpeg x11grab -grab_x N -grab_y N` cropped (P93 D-93-01) | Per-window via `x11vnc -id <wid>` + RFB | Phase 99 (2026-05-08) | Frontend untouched; backend wire format flips fMP4 → RFB; bidirectional input "for free" via RFB ClientMsg encoding |
| `wsProtocols: ['binary']` default in noVNC | `wsProtocols: []` default (since the [`c912230` commit](https://github.com/novnc/noVNC/commit/c912230309806aacbae4295faf7ad6406da97617) shipped in upstream master, applies to `@novnc/novnc 1.6.0`) | Verified 2026-05-08 against installed `lib/rfb.js:147` | No subprotocol negotiation needed; bridge is transparent |
| Mutter rejects `XGetImage` on per-window pixmap (pre-XComposite era) | x11vnc 0.9.14+ uses XComposite extension to access off-screen window pixmaps | x11vnc 0.9.14 (~2014) | `-id <wid>` works under modern compositors when paired with `-noxdamage` |
| `websockify` as separate proxy process | Inlined Node WS↔TCP bridge | Phase 99 (locked D-99-02) | Auth boundary + JWT verification stays in livinityd; no second port to firewall |

**Deprecated/outdated:**

- v33-DRAFT.md §7 risk row "x11vnc -id wid returns black on Mutter" — supplanted by 2026-05-08 evidence + `-noxdamage` + XComposite. Note in 99-SUMMARY.md as "research-superseded".
- 93-CONTEXT.md "Architecture pivot" section (single shared x11vnc + browser-side CSS clip) — never shipped, but recorded in CONTEXT for historical traceability. Phase 99 takes the OPPOSITE direction (per-window x11vnc, no shared daemon).
- The `streamManager.startStream({mode:'window-crop'})` call site at `window-manager.ts:310` — replaced by `mode:'vnc-window'`. Geometry-clamp logic immediately above (lines 295-309) preserved as no-op (D-99-05).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| **A1** | bruce's GDM session is X11, not Wayland (`echo $XDG_SESSION_TYPE` returns `x11`) | Pitfall 2, Mini PC verification step | If Wayland, `x11vnc` exits immediately with "Wayland session detected — only -rawfb supported". This is a HARD blocker. Mitigation: §"Mini PC verification" step 1 reads $XDG_SESSION_TYPE first; if Wayland, escalate before any other step. **Likelihood:** LOW — install.sh `:136` has Wayland detection that auto-switches GDM to X11; the existing P93/P95 ffmpeg + scrot flow only works under X11 too, and that flow has been working since P79 ship 2026-05-05. So $XDG_SESSION_TYPE is almost certainly already x11. |
| **A2** | x11vnc spawn race (Pitfall 4) is bounded ≤300ms with 3-retry backoff inside `attachVncBridge` | Pitfall 4 mitigation | If x11vnc actually takes >300ms to bind, first user-click shows brief error before reconnect. **Likelihood:** LOW — x11vnc on a fresh window typically binds in <100ms per upstream perf notes. But not measured on the Mini PC specifically. **Risk if wrong:** UAT shows transient error banner. Mitigation: extend retry to 10× 100ms or wait for `PORT=<n>\n` stderr line. |
| **A3** | The 4 MB backpressure threshold (lifted from `Fmp4Fanout`) is appropriate for RFB | Pattern 2 | RFB ServerMsg payloads can spike higher than fMP4 fragments during full-screen redraws (e.g., VLC playback in the captured window). 4 MB might fire prematurely for legitimate spikes. **Likelihood:** LOW for the WebApp use case (Chrome rendering normal websites); MEDIUM for media-heavy captures. **Risk if wrong:** Slow clients get dropped/closed unexpectedly. Mitigation: make threshold configurable via `LIVOS_VNC_BACKPRESSURE_BYTES` env, default 4 MB, raise to 16 MB if observed in UAT. |
| **A4** | xdotool emits decimal `wid`s in the existing pipeline; passing as hex `'0x' + wid.toString(16)` to x11vnc is correct | Pattern 1 hex/decimal note | If x11vnc rejects hex on this version, spawn fails immediately. **Likelihood:** VERY LOW — x11vnc man page explicitly accepts both forms. Quoted: `windowid is the X window id of the X window e.g. 0x180007 or 25165831`. **Mitigation:** if stderr contains "Bad window ID", swap to decimal `String(wid)`. Both encodings are valid; planner should pick one and document. |
| **A5** | The existing 5s `xprop -id <wid>` window-gone polling (`window-manager.ts:438`) cascades correctly to a new VNC-mode session via `streamManager.stopStream` | V33-VNC-04 | If the stream-manager `stopStream` path doesn't know about VNC kind (i.e., still calls `fanout.close()` only), x11vnc PIDs leak. **Likelihood:** MEDIUM — this is exactly the kind of silent regression that lifecycle changes induce. **Mitigation:** `stream-manager.test.ts` MUST cover both kinds in the stop path. Test: spawn vnc-mode session → stop → assert x11vnc child got SIGTERM AND any open net.Sockets are destroyed. |

**If the planner / discuss-phase wants to lock any of these as decisions before execution, A1 is the highest-impact (a Wayland session blocks the whole phase) and A5 is the highest-likelihood-of-bug (lifecycle regression). A2/A3/A4 can ride into UAT as low-risk knobs.**

## Open Questions

1. **Is bruce's current GDM session X11 or Wayland?** (Maps to A1.)
   - What we know: install.sh detects Wayland and flips GDM config; P79+P93+P95 all rely on X11; the live UAT WS error was "Invalid server version ftypiso" which means the WS connect itself succeeded — implying Chrome is running and visible on an X server.
   - What's unclear: We have no direct read-out of `$XDG_SESSION_TYPE` from the Mini PC in the past 24h.
   - **Recommendation:** First step of Phase 99 plan-checker walk: `ssh bruce@10.69.31.68 'echo $XDG_SESSION_TYPE'`. If `x11` → green-light. If `wayland` → STOP, escalate to user (might require a `gdm` reconfig from install.sh or a session relogin).

2. **Does x11vnc-spawned-as-bruce inherit the right `XAUTHORITY` path?**
   - What we know: P79-03 fixed XAUTHORITY = `/run/user/1000/gdm/Xauthority` (NOT `/home/bruce/.Xauthority`). `WEBAPPS_X11_ENV` constant in `window-discovery.ts:49-52` already encodes this.
   - What's unclear: Whether `/run/user/1000/gdm/Xauthority` survives a GDM session restart (e.g., user logs out/in). If the path changes, x11vnc spawn breaks until livinityd restarts.
   - **Recommendation:** Document this as a known sensitivity. Already mitigated by `LIVOS_X11_XAUTHORITY` env override hook in `window-discovery.ts:51`. No code change needed; just note in SUMMARY.

3. **Does `x11vnc -shared` cause client-input contention if a user opens the same WebApp window in two browser tabs?**
   - What we know: `-shared` allows multiple TCP connections; each is a separate RFB session that x11vnc multiplexes inputs from.
   - What's unclear: Whether two simultaneous mouse-move streams cause Chrome to "fight" itself (cursor jitter). Probably yes, but only matters if the user does open the same WebApp twice.
   - **Recommendation:** Out of scope for Phase 99. Document as "known multi-tab UX nit, deferred to v34" in SUMMARY.

4. **Should keyboard input be scoped to the captured Chrome window only?**
   - What we know: noVNC RFB sends `KeyEvent` ClientMsg to x11vnc, which calls XSendEvent or XTestFakeKeyEvent against the captured window's wid. x11vnc's `-id <wid>` mode scopes input to that window automatically when keyboard is focused on the noVNC canvas.
   - What's unclear: If the user `Alt+Tab`s their physical Mini PC keyboard while noVNC is also sending keys, do events interleave? Yes — x11vnc input is layered on top of physical input. Not a Phase 99 concern; this is a single-user single-Mini-PC posture.
   - **Recommendation:** Out of scope. Document as "single-user single-screen design" in SUMMARY.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `x11vnc` (Mini PC) | x11vnc spawn (D-99-01) | ✓ | 0.9.16-10 (Ubuntu noble; verified 2026-05-08 binary present) | — |
| `@novnc/novnc` (UI bundle) | Frontend RFB decoder (untouched) | ✓ | 1.6.0 | — (already shipped) |
| `ws` (livinityd npm) | WS upgrade handler | ✓ | already in livinityd deps | — |
| `node:net` | TCP socket to x11vnc | ✓ | Node ≥ 20 stdlib | — |
| `xdotool` (Mini PC) | Window discovery (existing) | ✓ | 3.x | — |
| `wmctrl` (Mini PC) | Window list (existing) | ✓ | 1.07 | — |
| X11 session on Mini PC | Whole phase | ⚠ | unconfirmed at this exact moment | NONE — Wayland blocks x11vnc; must be x11 |
| sudo bruce password-less | Spawning x11vnc as bruce | ✓ | install.sh provisions sudoers entry; Chrome spawn already uses this with `-n` flag | — |
| Mini PC SSH reachable | Verification step + deploy | ⚠ | ZeroTier-flap-prone per `reference_zerotier_unstable.md` | Detach long ops with nohup + log + bg poll; verification fits in single ssh call |

**Missing dependencies with no fallback:**

- **X11 session (not Wayland)** — soft-blocker; almost certainly satisfied (see A1) but MUST be verified as plan-checker walk step 1.

**Missing dependencies with fallback:**

- None.

**Notes:**

- ZeroTier link to Mini PC is unstable per memory `reference_zerotier_unstable.md`. Verification step (§"Code Examples" Mini PC live verification) MUST batch into ONE ssh invocation. ✓ Already structured that way.
- `feedback_ssh_rate_limit.md` warns of fail2ban on rapid SSH probes; the verification step is a single connection, no rapid-fire risk.

## Validation Architecture

> `workflow.nyquist_validation` is not present in `.planning/config.json`; treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (livinityd uses `npm test`; UI uses `pnpm --filter ui test`) |
| Config file | `livos/packages/livinityd/vitest.config.ts` (existing) and `livos/packages/ui/vitest.config.ts` (existing) |
| Quick run command (livinityd, scoped) | `cd livos/packages/livinityd && npm test -- streaming/vnc-bridge webapps/window-manager server/ws-stream` |
| Full suite command | `cd livos/packages/livinityd && npm test` (and `pnpm --filter ui test` for UI regressions — should be no-op since UI is untouched) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| V33-VNC-01 | x11vnc spawn produces a working RFB stream under Mutter | manual-only (live X server required) | Mini PC verification step (§Code Examples → "Mini PC live verification") | ❌ Wave 0 — `bash` script, no test framework |
| V33-VNC-01 | x11vnc spawn argv has the canonical D-99-01 flag set | unit | `vitest streaming/vnc-bridge.test.ts -t "spawn argv"` (assert exact argv contains `-id`, `-rfbport`, `-localhost`, `-shared`, `-forever`, `-noxdamage`, `-nopw`) | ❌ Wave 0 — `streaming/vnc-bridge.test.ts` to be created |
| V33-VNC-02 | WS↔TCP bridge forwards bytes both ways without modification | unit | `vitest streaming/vnc-bridge.test.ts -t "byte pipe"` (mock `net.Socket` + mock WS; emit canned RFB bytes; assert ws.send called with same Buffer; emit ws.message; assert tcp.write called with same Buffer) | ❌ Wave 0 |
| V33-VNC-02 | Bridge drops slow subscribers (`bufferedAmount > 4 MB`) | unit | `vitest streaming/vnc-bridge.test.ts -t "backpressure"` (mock WS with controllable bufferedAmount; emit large tcp.data; assert ws.close(1013) when threshold breached) | ❌ Wave 0 |
| V33-VNC-02 | Bridge propagates closes both ways | unit | `vitest streaming/vnc-bridge.test.ts -t "close propagation"` (4 cases: ws.close → tcp.destroy; tcp.close → ws.close(1011); ws.error → tcp.destroy; tcp.error → ws.close(1011)) | ❌ Wave 0 |
| V33-VNC-03 | Frontend `use-webapp-vnc.ts` tests still pass (no regression in UI) | unit | `pnpm --filter ui test use-webapp-vnc` | ✅ Existing — `livos/packages/ui/src/hooks/use-webapp-vnc.unit.test.tsx` (no changes expected) |
| V33-VNC-03 | `/ws/stream/:streamId` upgrade handler dispatches on session.kind | unit / source-string | `vitest server/ws-stream.test.ts -t "VNC dispatch"` (extend existing test with kind-discriminator assertion) | ✅ Existing — `livos/packages/livinityd/source/modules/server/ws-stream.test.ts` (modify) |
| V33-VNC-04 | Window-gone cascade fires `vnc-bridge.stop` (not just `fanout.close`) | unit | `vitest webapps/window-manager.test.ts -t "vnc-window cleanup"` (add new test: spawn vnc-mode → simulate isWindowAlive=false → assert x11vnc SIGTERM) | ✅ Existing — extend `window-manager.test.ts` |
| V33-VNC-04 | `streamManager.stopStream` for vnc-mode kills x11vnc + closes any attached bridges | unit | `vitest streaming/stream-manager.test.ts -t "stopStream vnc kind"` (add new test alongside existing fmp4 cases) | ✅ Existing — extend `stream-manager.test.ts` |
| V33-VNC-04 | Live RFB handshake test from Mini PC | smoke (manual) | `bash` script — `nc 127.0.0.1 <port> | head -c 12` should return `RFB 003.008\n` | ❌ Wave 0 — verification script |
| V33-VNC-04 | End-to-end: WebApp click → noVNC handshake completes → mouse click in noVNC fires xdotool input → real Chrome reacts | manual-only (UAT) | UAT-CHECKLIST.md row added in plan-checker walk | ❌ — UAT extension |
| V33-VNC-05 | Sacred SHA unchanged before AND after every commit | smoke (CI gate) | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` == `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ pattern shipped in P93/P95 SUMMARYs |

### Sampling Rate

- **Per task commit:** `cd livos/packages/livinityd && npm test -- streaming webapps server` (covers all touched modules; ~1-2s)
- **Per wave merge:** Full suite — `cd livos/packages/livinityd && npm test && pnpm --filter ui test`
- **Phase gate:** Full suite green AND Mini PC verification PASSED (§Open Question 1) AND UAT row in CHECKLIST signed off

### Wave 0 Gaps

- [ ] `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` — implementation (covers V33-VNC-02)
- [ ] `livos/packages/livinityd/source/modules/streaming/vnc-bridge.test.ts` — unit tests for bridge (byte-pipe, backpressure, close propagation, spawn argv)
- [ ] Modifications to `stream-manager.test.ts` — add `kind:'vnc'` cases (start, stop, idempotency)
- [ ] Modifications to `window-manager.test.ts` — add `mode:'vnc-window'` spawn path test
- [ ] Modifications to `ws-stream.test.ts` — add VNC-dispatch source-string assertion
- [ ] Mini PC verification bash script (one-shot, embedded in plan, not a recurring CI job)
- [ ] UAT-CHECKLIST.md addition under `.planning/phases/98-uat-polish/` — single row "WebApp window opens with live RFB stream + bidirectional input"

*If no gaps: not applicable — refactor phase requires new test coverage of the new path.*

## Security Domain

> `security_enforcement` not explicitly disabled — including domain.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing JWT-from-query at `/ws/stream/:streamId` (D-99-02 keeps auth gate in livinityd) — NO changes |
| V3 Session Management | yes | Existing JWT lifecycle (P67/P79); WS connection inherits session — NO changes |
| V4 Access Control | yes | Existing ownership check (`streamManager.listStreams({userId}).find(s => s.streamId === streamId)`); 404 on mismatch (STRIDE I) — NO changes |
| V5 Input Validation | yes | `streamId` regex `/^\/ws\/stream\/([0-9a-f-]+)$/i` (existing); `wid: number` validated as `Number.isInteger(wid) && wid > 0` in window-discovery.ts — NEW: no user-supplied input touches the new bridge code path beyond the existing JWT/ownership gate |
| V6 Cryptography | no — out of scope (no new crypto introduced) | — |

### Known Threat Patterns for {Node + x11vnc + WS}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-user stream access (User A's WS subscribes to User B's streamId) | I (Info Disclosure) | Existing ownership check filters via `listStreams({userId}).find(streamId)`; 404 on miss to prevent existence leak — UNCHANGED by Phase 99 |
| External attacker connects to x11vnc directly bypassing WS auth | E (Elevation) | x11vnc spawned with `-localhost` (binds 127.0.0.1 only); only livinityd on the same host can connect → bridge enforces JWT before opening TCP socket — VERIFIED D-99-01 + D-99-03 |
| Slow client memory-fills livinityd | D (DoS) | 4 MB `bufferedAmount` drop rule per WS subscriber + `ws.close(1013)` — Pattern 2 mitigation, mirrors Fmp4Fanout |
| Many concurrent x11vnc spawns exhaust ports / file descriptors | D (DoS) | Existing per-user webapp cap = 50 (window-manager.ts:55 `DEFAULT_WEBAPP_CAP`); existing per-user stream cap = 10 (VAAPI) / 5 (libx264) — UNCHANGED by Phase 99 (the x11vnc daemon counts as a stream) |
| Argv injection via wid or url | T (Tampering) | `spawn('sudo', [...])` with array argv; wid is `number` validated by `Number.isInteger`; url passed to Chrome only, not x11vnc — VERIFIED window-discovery.ts:196 + window-manager.ts:223 (existing pattern, reused) |
| RFB protocol downgrade attack | S (Spoofing) | x11vnc-side: `-localhost` means only livinityd connects, no MITM possible. Frontend-side: `wss://` (TLS) terminated at Caddy → livinityd. Bridge in the middle is byte-transparent; no protocol negotiation to downgrade. |
| `-nopw` allowing connection without VNC password | S (Spoofing) | Auth happens at WS layer (JWT) before the TCP socket is opened — `-nopw` is correct posture (D-99-01) |
| Bridge holds x11vnc TCP socket open indefinitely (resource leak) | D (DoS) | `ws.on('close', () => tcp.destroy())` ensures TCP gets cleaned up when WS goes away — Pattern 2 |

**Project Constraints (from CLAUDE.md / project memory):**

- `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST equal before AND after every commit — D-99-10
- D-NO-BYOK: no raw `@anthropic-ai/sdk` paths introduced — D-99-11 (none expected; this phase is OS plumbing)
- D-NO-SERVER4: Mini PC only — D-99-12
- No Docker, no Python sidecar — D-99 inherits from P93 sacred constraints
- No emoji unless user explicitly authors it — universal v33 rule
- Status updates in Turkish during long autonomous workflows; code/paths/commits stay English — `user_language.md`

## Sources

### Primary (HIGH confidence)

- **Installed `@novnc/novnc 1.6.0` `lib/rfb.js:147`** — verified `_wsProtocols = options.wsProtocols || []` default empty
- **Installed `use-webapp-vnc.ts:137`** — `new RFB(target, wsUrl, {credentials})` constructor call (no wsProtocols passed)
- **`livos/install.sh:614,621,809-826`** — x11vnc + websockify already provisioned by install.sh; `livos-x11vnc.service` already runs against full `:0`
- **`93-CONTEXT.md` "Spike outcome" section** — historical record of the 2026-05-07 spike rejection (multi-factor: MIT-SHM + segfault + XRender, NOT a Mutter-fundamental-incompatibility)
- **`93-SUMMARY.md`** — confirms 13 P93 tasks shipped under sacred SHA `f3538e1d…` preserved
- **`stream-manager.ts:65-77, 122-237`** — existing StreamSession/spawn lifecycle pattern that Phase 99 extends
- **`fmp4-fanout.ts:246`** — existing 4 MB `bufferedAmount` backpressure rule (project's own pattern)
- **`window-manager.ts:223-238`** — existing sudo+DISPLAY+XAUTHORITY spawn pattern that Phase 99 reuses for x11vnc
- **`window-discovery.ts:49-52`** — `WEBAPPS_X11_ENV` constant Phase 99 reuses
- **`server/index.ts:990-1066`** — existing `/ws/stream/:streamId` upgrade handler that Phase 99 extends with kind-dispatch
- **Project memory `project_v33_protocol_mismatch.md`** — captures live UAT failure + 5-fix preservation table

### Secondary (MEDIUM confidence — WebSearch verified against ≥1 official source)

- **x11vnc upstream FAQ** (`github.com/LibVNC/x11vnc/blob/master/doc/FAQ.md`) — `-noxdamage` is canonical Mutter/compositor workaround [verified by WebSearch quoting upstream FAQ]
- **x11vnc 0.9.14 release notes** — XComposite extension support added specifically for off-screen window pixmap capture under compositors [WebSearch + WebFetch on github.com/LibVNC/x11vnc/releases]
- **noVNC `c912230` commit** — removed `wsProtocols: ['binary']` default (later partially reverted in some downstream forks); current upstream master has empty default; `@novnc/novnc 1.6.0` matches the empty-default behavior per direct file inspection
- **websockify-js core forwarding pattern** (`github.com/novnc/websockify-js/blob/master/websockify/websockify.js`) — bidirectional pipe + close propagation reference; lacks backpressure (which we add ourselves)
- **Ubuntu 24.04 packages**: `x11vnc 0.9.16-10` confirmed available [WebSearch on packages.ubuntu.com]

### Tertiary (LOW confidence — single source, marked for verification at execution time)

- **A1 (X11 vs Wayland on bruce's session)** — based on inference from install.sh's auto-switch logic + the existing P79/P93/P95 working state under X11. Direct readout deferred to plan-checker walk step 1.
- **A2 (x11vnc spawn timing ≤300ms)** — common knowledge / upstream perf docs; not measured on this Mini PC. Mitigation (retry-with-backoff) covers any drift.
- **A3 (4 MB backpressure threshold appropriate for RFB)** — borrowed from fMP4 setting; RFB throughput characteristics differ (less steady, more spiky). Configurable via env if observed.

## Metadata

**Confidence breakdown:**

- **Standard stack:** HIGH — every binary and package version verified against installed code on disk OR upstream registry
- **Architecture:** HIGH — diagram + dispatch pattern derived from existing project code (StreamManager, WS handler, window-manager); only the bridge module is new and it follows the websockify-js + Fmp4Fanout patterns the project already uses
- **Pitfalls:** HIGH — Pitfalls 1-3 verified against existing project commits and upstream FAQ; Pitfalls 4-5 are forward-looking but well-bounded
- **Mutter compatibility:** MEDIUM-HIGH — `-noxdamage` is documented upstream workaround; XComposite support since 0.9.14; live verification step gates execution. Confidence drops to MEDIUM only because we have not yet executed the verification step on bruce's actual session in this research session — Pitfall 2 surfaces this honestly.

**Research date:** 2026-05-08
**Valid until:** 2026-06-07 (30 days for stable stack — x11vnc/Node/ws/noVNC are mature, low-churn deps; v33 is hot-fix scope so the planner should consume this within days, not weeks)

---

*Phase: 99-webapp-vnc-swap*
*Research conducted: 2026-05-08 against installed code on disk + upstream documentation + project memory*
*Sacred SHA at research time: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (verified via project memory `feedback_p65_rename_complete.md`)*
