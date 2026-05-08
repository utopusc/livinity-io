# Phase 99-03 — StreamManager discriminated-union — SUMMARY

**Status:** PASS — 15/15 stream-manager + 10/10 encoder-args vitest cases green.
**Date:** 2026-05-08
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED before AND after every commit.

## What this plan shipped

`stream-manager.ts` extended with discriminated-union `StreamSession` (`kind: 'fmp4' | 'vnc'`). The existing fMP4 path is byte-for-byte unchanged (`mode: 'desktop' | 'window-crop' | 'pipewire-fd'` continues to spawn ffmpeg/gst-launch-1.0 + Fmp4Fanout per D-99-04).

New code path for `mode: 'vnc-window'`:
- `startStream({mode:'vnc-window', target:{wid}})` validates `wid` is a positive integer, allocates an ephemeral rfbPort (in-process counter `[15900, 16100)` ring), spawns x11vnc via `spawnVncForWindow()` (99-02), and registers a `kind:'vnc'` `StreamSession`. Returns the same `{streamId, wsUrl}` shape as fmp4 callers expect.
- `getSession(streamId)` — new public method exposing the discriminated-union session for the WS handler dispatch in 99-04.
- `stopStream(streamId)` — branches on `session.kind`. `vnc` → SIGTERM x11vnc, await clean exit up to 500ms, delete from map. `fmp4` → existing SIGTERM→SIGKILL escalation cascade preserved.
- Crash detection mirrors fmp4 path (non-zero exit → `status='crashed'`, emits `crash` event).
- Idempotency cache (`userId, mode, targetKey`) extends transparently — same `(admin, vnc-window, {wid:0x3000})` returns the same streamId and only spawns x11vnc ONCE.

## Commits

| Step | SHA | Message |
|------|-----|---------|
| Refactor | `53f05e5f` | `refactor(99-03): introduce discriminated-union StreamSession (kind:'fmp4')` |
| RED | `72c09c61` | `test(99-03): add 5 failing vitest cases for vnc-window kind` |
| GREEN | `7ad594d8` | `feat(99-03): startStream({mode:"vnc-window"}) + getSession + stopStream(vnc)` |

## Files

| Path | Change | Net Δ |
|------|--------|-------|
| `livos/packages/livinityd/source/modules/streaming/encoder-args.ts` | StreamMode `'vnc-window'` literal added; defensive throws in `buildFfmpegArgs` + `buildGstWindowArgs` | +12, –1 |
| `livos/packages/livinityd/source/modules/streaming/stream-manager.ts` | Discriminated-union types; vnc-window branch in `startStream`; `getSession`; vnc cascade in `stopStream`; toRecord/getFanout/addSubscriber/_clearForTests guarded on `kind` | +143, –14 |
| `livos/packages/livinityd/source/modules/streaming/stream-manager.test.ts` | New describe block with 5 vnc tests (Test 11–15) | +121, 0 |

## Test results

```
Test Files  2 passed (2)
     Tests  20 passed (20)   ← 10 stream-manager + 10 encoder-args after refactor
                              (then 15/15 stream-manager after vnc TDD: 10 fmp4 + 5 vnc)
```

vnc-window cases:
- Test 11: spawn argv (sudo + DISPLAY/XAUTHORITY + `/usr/bin/x11vnc -id 0xabcdef -localhost -noxdamage`) ✓
- Test 12: stopStream cascade (SIGTERM x11vnc + delete from map) ✓
- Test 13: getSession routes by kind / null for unknown streamId ✓
- Test 14: idempotent (same wid → same streamId, ONE spawn) ✓
- Test 15: listStreams kind:'vnc' with subscriberCount=0 (vnc has no fanout) ✓

## Sacred SHA verification

| Stage | SHA |
|-------|-----|
| Pre-Refactor | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-Refactor | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Pre-RED | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-RED | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Pre-GREEN | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-GREEN | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

`liv/packages/core/src/sdk-agent-runner.ts` UNTOUCHED across all three commits.

## Carryover to plan 99-04

WS dispatch — `/ws/stream/:streamId` upgrade handler in `server/index.ts`:

```ts
import {attachVncBridge} from '../streaming/vnc-bridge.js'

// after JWT verify + ownership check…
const session = streamManager.getSession(streamId)
if (!session) { ws.close(4404, 'unknown stream'); return }
if (session.kind === 'fmp4') {
  streamManager.addSubscriber(streamId, ws as never)  // existing path
} else {
  // session.kind === 'vnc'
  attachVncBridge(ws as never, {host: '127.0.0.1', port: session.rfbPort, logger})
}
```

WebAppWindowManager swap — `webapps/window-manager.ts` swaps the
`streamManager.startStream({mode:'window-crop', target:{display, geometry}})`
call to `streamManager.startStream({mode:'vnc-window', target:{wid}})`.
The geometry-clamp logic from P93-93 stays for layout positioning
(D-99-05) but no longer drives an ffmpeg crop.

## Implementation notes for 99-04

- The `VNC_PORT_COUNTER` ring runs OS-process-local. If livinityd is
  later split across multiple processes, this must move to Redis. For
  now (single-process Mini PC), in-process state is sufficient.
- `stopStream` for vnc kind never escalates to SIGKILL — x11vnc has
  always handled SIGTERM cleanly in the 99-01 verification. If a
  hardened path is needed later, the timer at 500ms could escalate.
- `getSession` returns the FULL session including the live `ChildProcess`
  reference, so 99-04's WS handler must NOT modify it. It only reads
  `session.kind`, `session.rfbPort`, and (for fmp4) the path through
  `addSubscriber`.
