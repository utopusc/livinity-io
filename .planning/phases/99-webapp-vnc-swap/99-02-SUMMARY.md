# Phase 99-02 — vnc-bridge.ts (TDD) — SUMMARY

**Status:** PASS — RED→GREEN cycle clean. 12/12 vitest cases green.
**Date:** 2026-05-08
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED before AND after both commits.

## What this plan shipped

Pure-Node `vnc-bridge.ts` module that owns:

1. Per-window x11vnc spawn (D-99-01 canonical argv copied verbatim from `99-01-SUMMARY.md`).
2. WS↔TCP byte bridge (D-99-02 — no `websockify` subprocess; auth gate stays in `/ws/stream/:streamId`).
3. 4 MB `bufferedAmount` backpressure drop (mirrors `Fmp4Fanout` threshold).
4. Bidirectional close propagation (`ws ↔ tcp` events).
5. ECONNREFUSED retry — 3× 100 ms backoff before `ws.close(1011, "vnc backend unreachable")` (Pitfall 4 mitigation for x11vnc bind race).
6. stderr tail (last 50 lines) dumped to `logger.error` on non-zero exit (D-99-07; mirrors `stream-manager.ts` ffmpeg pattern from commit 782cafeb).

## Commits

| Step | SHA | Message |
|------|-----|---------|
| RED | `986f24e4` | `test(99-02): add failing vitest spec for vnc-bridge.ts` |
| GREEN | `909cca8e` | `feat(99-02): implement vnc-bridge.ts (spawn x11vnc + WS↔TCP byte pipe)` |

## Files

| Path | Lines | Role |
|------|-------|------|
| `livos/packages/livinityd/source/modules/streaming/vnc-bridge.test.ts` | 281 | vitest spec (12 cases) |
| `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` | 290 | Implementation |

## Test results

```
Test Files  1 passed (1)
     Tests  12 passed (12)
  Duration  392ms

✓ vnc-bridge — spawnVncForWindow > spawn argv: passes canonical D-99-01 sudo + DISPLAY/XAUTHORITY + x11vnc flags with hex wid
✓ vnc-bridge — spawnVncForWindow > exits non-zero with stderr tail: logger.error includes argv + last stderr lines
✓ vnc-bridge — attachVncBridge — byte pipe > forwards ws "message" → tcp.write byte-equal
✓ vnc-bridge — attachVncBridge — byte pipe > forwards tcp "data" → ws.send byte-equal
✓ vnc-bridge — attachVncBridge — backpressure > drops slow subscriber when bufferedAmount > 4 MB and destroys tcp
✓ vnc-bridge — attachVncBridge — backpressure > exposes BACKPRESSURE_BYTES === 4 * 1024 * 1024 (matches Fmp4Fanout default)
✓ vnc-bridge — attachVncBridge — close propagation > ws "close" → tcp.destroy
✓ vnc-bridge — attachVncBridge — close propagation > tcp "close" → ws.close(1011)
✓ vnc-bridge — attachVncBridge — close propagation > ws "error" → tcp.destroy
✓ vnc-bridge — attachVncBridge — close propagation > tcp "error" → ws.close(1011)
✓ vnc-bridge — attachVncBridge — ECONNREFUSED retry (Pitfall 4) > retries 3× with 100 ms backoff before giving up
✓ vnc-bridge — attachVncBridge — ECONNREFUSED retry (Pitfall 4) > after 3 failed attempts, gives up with ws.close(1011, "vnc backend unreachable")
```

## Note on test scope vs plan target

Plan 99-02 specified "9 vitest cases ≥". The actual file has 12 `it()` blocks (the plan's 6 behaviour buckets each expand to 1–4 `it()` blocks):
- spawnVncForWindow → 2 (argv + stderr-tail)
- byte pipe → 2 (ws→tcp + tcp→ws)
- backpressure → 2 (drop + constant export)
- close propagation → 4 (ws.close, tcp.close, ws.error, tcp.error)
- ECONNREFUSED retry → 2 (succeeds-on-3rd + gives-up-after-3-fails)

12/12 ≥ plan minimum 9 ✓.

## Sacred SHA verification

| Stage | SHA |
|-------|-----|
| Pre-RED | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-RED | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Pre-GREEN | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-GREEN | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

`liv/packages/core/src/sdk-agent-runner.ts` UNTOUCHED across both commits.

## Carryover to plan 99-03

`stream-manager.ts` extension imports:

```ts
import {spawnVncForWindow, attachVncBridge, type VncBridgeLogger} from './vnc-bridge.js'
```

Add `kind: 'vnc'` branch to the new discriminated-union `StreamSession` (per D-99-04). The `spawnFactory` injection point exists for tests; production code uses `node:child_process.spawn` default.

The existing fMP4 path (`Fmp4Fanout`, `encoder-args.ts`, `vaapi-probe.ts`) is byte-for-byte unchanged and continues to serve `mode: 'desktop'`, `mode: 'window-crop'`, `mode: 'pipewire-fd'`.

## Implementation notes worth flagging for plan 99-04

- `attachVncBridge` registers `ws.on('close')` / `ws.on('error')` ONCE (outside the retry loop), so a ws-side close during retry correctly aborts further connect attempts via the `wsClosed` flag.
- After backpressure-drop, the bridge sets `backendDone = true` so the subsequent `tcp.on('close')` (triggered by our own `tcp.destroy()`) does NOT re-emit a `ws.close(1011)` race.
- `nodeNetConnect` is wrapped to convert `connect({port, host})` → bridge's `(port, host) => Socket` shape. Tests inject `vi.fn(() => mockTcp)` directly, bypassing the wrapper.
