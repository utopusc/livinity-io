# Phase 99-04 — WindowManager swap + WS dispatch — SUMMARY

**Status:** PASS — End-to-end backend swap functionally complete. 66/66 Phase 99-scoped vitest cases green.
**Date:** 2026-05-08
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED before AND after every commit.

## What this plan shipped

The wire-format swap is complete on the backend. Two coupled changes:

### 1. WebAppWindowManager.spawn() — hard-cut to vnc-window
- PipeWire portal probe (`isPortalAvailable` + `requestWindowSession`) and the geometry-tracker / ffmpeg-crop fallback path are BOTH removed for the WebApp use case.
- Every WebApp spawn now unconditionally calls `streamManager.startStream({mode:'vnc-window', target:{wid: newWin.wid}})`.
- `ActiveWebApp.mode` union extended with `'vnc-window'`. Same shape; just a third literal.
- `close()` cascade and `idleCleanupTick()` are UNCHANGED — they already call `streamManager.stopStream()` which post-99-03 handles `kind:'vnc'` via SIGTERM x11vnc.

### 2. /ws/stream/:streamId — dispatch on session.kind
- After the existing JWT auth + ownership check (D-99-02 — auth gate stays in livinityd), the handler fetches `streamManager.getSession(streamId)` and branches inside the WebSocket upgrade callback:
  - `session.kind === 'vnc'` → `attachVncBridge(ws, {host:'127.0.0.1', port: session.rfbPort})` (99-02 primitive byte-pipes RFB frames between browser noVNC and the per-window x11vnc TCP rfbport).
  - else → existing `addSubscriber` path (Fmp4Fanout) — preserved for `mode:'desktop'` (desktop-stream native app, D-99-04).
- Added defensive 404 guard for the rare race where `listStreams` finds the stream but `getSession` returns null between the two reads.

### 3. Geometry-clamp preserved (D-99-05)
- The clamp + warning log from commit `4c55b173` is kept in place as no-op diagnostic logging. The marker comment `preserved for ffmpeg-fallback path; unused under x11vnc mode` makes intent explicit. The clamp result is no longer threaded into the `startStream` call — `target:{wid}` ignores geometry entirely.

## Commits

| Step | SHA | Message |
|------|-----|---------|
| Window-manager swap | `a6dfd763` | `feat(99-04): WebAppWindowManager.spawn() swaps to mode:'vnc-window'` |
| WS dispatch | `6b50c02f` | `feat(99-04): /ws/stream/:streamId dispatches on session.kind (fmp4|vnc)` |

## Files

| Path | Net Δ | Role |
|------|-------|------|
| `livos/packages/livinityd/source/modules/webapps/window-manager.ts` | +12, –42 | Hard-cut spawn body to vnc-window; preserve clamp as no-op |
| `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` | +82, –27 | Update Tests 1, 3, 8, 11 to assert new behavior; add Tests 12, 13, 14 for vnc swap regression locks |
| `livos/packages/livinityd/source/modules/server/index.ts` | +52, –1 | Import attachVncBridge; add session.kind dispatch in WS upgrade callback; getSession 404 guard |
| `livos/packages/livinityd/source/modules/server/ws-stream.test.ts` | +25, –0 | 2 new source-string cases (Test 14: import wired; Test 15: vnc dispatch path) |

## Test results — Phase 99 scope

```
Test Files  5 passed (5)
     Tests  66 passed (66)

  vnc-bridge.test.ts        12/12 ✓ (from 99-02)
  stream-manager.test.ts    15/15 ✓ (10 fmp4 + 5 vnc, from 99-03)
  encoder-args.test.ts      10/10 ✓ (no behavioral change)
  window-manager.test.ts    14/14 ✓ (11 updated/preserved + 3 new vnc swap)
  ws-stream.test.ts         15/15 ✓ (13 preserved + 2 new VNC dispatch)
```

window-manager.test.ts test inventory:
| # | Title | Status |
|---|-------|--------|
| 1 | spawn happy path returns ... mode:'vnc-window' (Phase 99-04 swap) | UPDATED |
| 2 | spawn is idempotent for same webappId | UNCHANGED |
| 3 | spawn ignores portal availability — always uses vnc-window (Phase 99-04 swap) | UPDATED — regression lock proving portal probe is GONE |
| 4 | spawn throws WINDOW_NOT_FOUND on title timeout | UNCHANGED |
| 5 | spawn enforces per-user webapp cap → TOO_MANY_WEBAPPS | UNCHANGED |
| 6 | focus on alive window calls activateWindow | UNCHANGED |
| 7 | focus on dead window returns WINDOW_GONE + auto-closes entry | UNCHANGED |
| 8 | close cascades stopStream and clears entry (portal session is null) | UPDATED — closeSession assertion dropped (no portal under vnc) |
| 9 | list filters by userId | UNCHANGED |
| 10 | idle-cleanup tick cascades close on window-gone | UNCHANGED (legacy regression lock for fmp4 era) |
| 11 | spawn ignores portal request errors entirely — portal is never called | UPDATED — regression lock proving even error paths can't reach portal |
| 12 | spawn() calls streamManager.startStream with mode:"vnc-window" + target:{wid} | NEW |
| 13 | close() cascades stopStream for vnc-window entries | NEW |
| 14 | idleCleanupTick cascades close+stopStream when window-gone (Assumption A5 lock) | NEW |

ws-stream.test.ts test inventory:
| # | Title | Status |
|---|-------|--------|
| 1–13 | Existing source-string assertions (path match, JWT, ownership, etc.) | UNCHANGED |
| 14 | imports attachVncBridge from ../streaming/vnc-bridge.js | NEW |
| 15 | dispatches on session.kind: vnc → attachVncBridge; else → addSubscriber | NEW |

## UI no-regression confirmation

Frontend (`livos/packages/ui/`) was NOT modified in 99-04. The use-webapp-vnc.ts noVNC client was already an RFB consumer; after this swap, the wire format on `/ws/stream/:streamId` finally matches what the client always expected. No UI test runs were necessary because the package contract did not change.

`git diff --name-only HEAD~7..HEAD -- livos/packages/ui/` outputs nothing (across the entire Phase 99 commit range).

## Sacred SHA verification

| Stage | SHA |
|-------|-----|
| Pre window-manager swap | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post window-manager swap | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Pre WS dispatch | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post WS dispatch | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

`liv/packages/core/src/sdk-agent-runner.ts` UNTOUCHED across both commits.

`git diff --name-only` for `liv/packages/core/` across all 99-* commits so far: empty.

## Pre-existing breakage NOT introduced

`livos/packages/livinityd/source/modules/livinity-broker/passthrough-streaming-integration.test.ts > Phase 58 final gate > sacred runner file SHA unchanged at end of phase` fails because it hardcodes the OLD `nexus/packages/core/sdk-agent-runner.ts` path AND the old SHA `4f868d318...`. This test has been broken since:
- Phase 65 (2026-05-05) renamed `nexus/` → `liv/` (the path no longer exists)
- Phase 77 then bumped the sacred SHA to `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

Out of Phase 99 scope. Should be addressed in a future cleanup phase or when the broker tests are next touched.

## Carryover to plan 99-05

End-to-end backend swap is functionally complete. Plan 99-05 closes the phase:

1. `git push` the 99-* commit range to GitHub `utopusc/livinity-io`.
2. User-walked Mini PC deploy via `bash /opt/livos/update.sh`.
3. User-walked end-to-end UAT (per `.planning/phases/98-uat-polish/UAT-CHECKLIST.md`):
   - 3 WebApps spawned (facebook/gmail/x)
   - RFB handshake observed in browser DevTools (binary frames, not fMP4 `ftypiso...`)
   - Mode selector (Watch/Teach/Auto/Chat) functional
   - Per-window framing accurate (not full desktop)
   - Close cascade clean (x11vnc dies on stopStream)
4. Append UAT row to `UAT-CHECKLIST.md`.
5. Write `99-SUMMARY.md` (phase rollup).
6. Flip `ROADMAP.md` line 144 `[ ]` → `[x]` and update STATE.md current-phase.

Plan 99-05 is `autonomous: false` because steps 2 and 3 require the user.
