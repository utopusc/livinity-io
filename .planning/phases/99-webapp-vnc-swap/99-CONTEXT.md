# Phase 99: WebApp VNC Swap (fMP4 → x11vnc) — Context

**Wave:** Hot-fix (sequential, single-phase)
**Status:** Ready for planning
**Source:** Live UAT discovery 2026-05-08; design decision user-confirmed pre-/clear
**Effort:** S (~1-2 days; ~5 plans)
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — `liv/packages/core/src/sdk-agent-runner.ts` UNTOUCHED before AND after every commit.

---

## Goal (1 sentence)

Replace the per-WebApp window streaming backend from ffmpeg fMP4 to per-window `x11vnc -id <wid>` so the existing `/ws/stream/:streamId` endpoint emits RFB bytes that the frontend's already-shipped noVNC client (`use-webapp-vnc.ts`) can decode — fixing the live UAT failure `Failed when connecting: Invalid server version ftypiso` while preserving the desktop-stream native app's fMP4 path.

---

## Why this phase exists

P93 and P95 were planned in parallel without coordinating the wire format. P93 (D-93-02) locked ffmpeg fMP4 (first bytes `ftypisom...`) over `/ws/stream/:streamId`. P95-04 (`use-webapp-vnc.ts`) shipped `@novnc/novnc` RFB client expecting `RFB 003.008\n` handshake. Live UAT 2026-05-08 fired both halves and the frontend immediately errored with `Invalid server version ftypiso`.

P93's earlier spike rejected `x11vnc -id <wid>` on Mutter ("returns black"). That rejection appears to be either wrong, environment-specific, or fixable — verification on the actual Mini PC desktop session 2026-05-08 found `x11vnc 0.9.16` AND `/usr/local/bin/websockify` both already installed and functional under the user's GNOME session. Phase 99 re-verifies and ships the swap.

**Cost comparison (locked decision driver):**
- Backend swap: ~1-2 hr refactor in livinityd, frontend zero changes
- Frontend MSE rewrite: multi-day, plus would need an out-of-band input protocol (mouse/keyboard) that noVNC's RFB already handles natively

The 5 host-Chrome fixes shipped earlier this session (`5e126607..4c55b173`) all survive the swap — Chrome still spawns the same way under bruce's user session, X11 env still injected, livos-chrome profile still reused. Only the bytes flowing through the WS endpoint change.

---

<domain>
## Phase Boundary

**Owns:**
- New module `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` (or similar) — `spawnVncForWindow(wid, opts)` returns `{vncTcpPort, pid}`; lifecycle teardown
- Modification to `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — replace `streamManager.startStream({mode:'window-crop'})` call with VNC spawn call
- Modification to `/ws/stream/:streamId` upgrade handler — when stream is a VNC stream, bridge raw bytes to/from a TCP socket connected to `x11vnc`'s RFB port (instead of buffering fMP4 fragments through `Fmp4Fanout`)
- Mini PC environment verification: `x11vnc 0.9.16 -id <wid>` actually produces a working RFB stream against bruce's host GNOME session (no Mutter black-out)
- Cleanup on window-gone (existing `xprop -id <wid>` watch already cascades — extend cascade to kill x11vnc PID)

**Does NOT own:**
- Frontend `use-webapp-vnc.ts` or any noVNC consumer code — must remain unchanged
- The fMP4 path itself — `streamManager.startStream({mode:'desktop'})` and `Fmp4Fanout` stay alive and untouched for the desktop-stream native app and any other non-WebApp consumer
- Sacred file `liv/packages/core/src/sdk-agent-runner.ts` — UNTOUCHED
- Any rename, reshape, or relocation of `streams.*` or `webapp.window.*` tRPC routes — wire-format change is internal to the WS handler
- Frontend wsUrl shape — remains `/ws/stream/:streamId?token=…`; only the bytes change
- WebRTC upgrade — deferred to v34 per v33-DRAFT.md

</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Streaming protocol
- **D-99-01 [LOCKED]** Per-WebApp window stream uses `x11vnc -id <wid> -rfbport <port> -localhost -shared -forever -noxdamage -nopw` spawned per window. RFB protocol over the WS endpoint.
- **D-99-02 [LOCKED]** WS handler at `/ws/stream/:streamId` for VNC streams acts as a transparent bidirectional bridge: WS frames (binary) ↔ TCP socket connected to `x11vnc`'s `-rfbport`. NOT `websockify` as a separate process — bridge logic lives in livinityd Node code so JWT auth + ownership check stay in one place. (Rationale: avoid extra process, avoid double-port binding, keep the auth gate in `/ws/stream/:streamId` exactly as P93 designed it.)
- **D-99-03 [LOCKED]** RFB port allocation reuses the existing per-stream port pool (Redis `liv:streaming:ports` or equivalent). `localhost`-only bind on x11vnc — no external exposure; only livinityd's bridge connects.
- **D-99-04 [LOCKED]** fMP4 path stays alive. `Fmp4Fanout` and the ffmpeg encoder factory remain in `streaming/`. `StreamManager.startStream({mode})` gains/retains a branch: `mode:'desktop'` → existing fMP4; `mode:'window'` (or new `mode:'vnc-window'`) → new VNC bridge.

### Geometry / fallback
- **D-99-05 [LOCKED]** Geometry clamp logic from `4c55b173` is dead code AFTER swap (x11vnc reads pixmap by window ID, not geometry). Keep the clamp as no-op safe code (don't rip out — it's a defensive layer for any future ffmpeg fallback). Mark with comment "preserved for ffmpeg-fallback path; unused under x11vnc mode".
- **D-99-06 [LOCKED]** If x11vnc fails to capture a given Chrome window (Mutter pixmap returns blank), DO NOT auto-fall-back at runtime. Surface the error to the frontend with a clear "stream unavailable" payload. Phase 99 verifies that this case does not occur on Mini PC — if it does, that's a P99-blocker discovered during plan-checker walk and the milestone stops here.

### Diagnostics
- **D-99-07 [LOCKED]** ffmpeg argv + stderr dump from `782cafeb` stays as-is. Same diagnostic pattern applied to x11vnc spawn: log argv + stderr tail on encoder/x11vnc crash.

### Lifecycle
- **D-99-08 [LOCKED]** When `xprop -id <wid>` poll reports the Chrome window has died, cascade: SIGTERM x11vnc PID, close all WS subscribers with code 1011, free port back to pool, remove from `StreamSession` map.
- **D-99-09 [LOCKED]** If `streams.stop({streamId})` is called via tRPC, same cascade as above.

### Sacred constraints
- **D-99-10 [LOCKED]** `liv/packages/core/src/sdk-agent-runner.ts` SHA must equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` before AND after every commit. Verify with `git log -1 --format=%H -- liv/packages/core/src/sdk-agent-runner.ts | xargs -I{} git show {}:liv/packages/core/src/sdk-agent-runner.ts | sha1sum` (or equivalent) on each plan close.
- **D-99-11 [LOCKED]** D-NO-BYOK preserved (subscription-only Claude path). This phase does not touch `@anthropic-ai/sdk` or the broker.
- **D-99-12 [LOCKED]** D-NO-SERVER4 preserved. Mini PC (`bruce@10.69.31.68`) is the only deploy target. Server4 stays untouched.

### Claude's Discretion
- Exact module name (`vnc-bridge.ts` vs `x11vnc-spawn.ts` vs nesting under `streaming/vnc/`) — pick the layout that minimises surface area in the existing `streaming/` folder
- Whether to introduce a discriminated-union `StreamSession` type (`{ kind: 'fmp4', encoder: ChildProcess, fanout: Fmp4Fanout } | { kind: 'vnc', x11vnc: ChildProcess, vncSocket: net.Socket }`) or two parallel maps — pick whichever produces fewer call-site branches
- Test strategy for the VNC bridge — vitest with a mock TCP server emitting canned RFB bytes is acceptable; do NOT require a real X server in CI
- Whether to gate the swap behind a Redis/env flag (`liv:webapp:vnc_mode=x11vnc|fmp4`) or hard-cut. **Recommendation:** hard-cut on the WebApp window-crop branch only; `mode:'desktop'` stays fMP4 unconditionally so no flag needed and no rollback risk for the desktop-stream native app.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Live failure evidence
- Memory `project_v33_protocol_mismatch.md` (already loaded into auto-memory) — captures the exact UAT error and the 5-fix preservation table

### P93 (the swap target)
- `.planning/phases/93-window-manager/93-CONTEXT.md` — original D-V33-03 design (per-window x11vnc) and the spike rejection
- `.planning/phases/93-window-manager/93-PLAN.md` — locked architecture, file boundaries
- `.planning/phases/93-window-manager/93-SUMMARY.md` — what actually shipped (fMP4)
- `livos/packages/livinityd/source/modules/streaming/` — current StreamManager + Fmp4Fanout + encoder factory (DO NOT delete; modify additively)
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — call site that needs to swap from `streamManager.startStream({mode:'window-crop'})` to VNC bridge spawn
- `livos/packages/livinityd/source/modules/server/index.ts` — `/ws/stream/:streamId` upgrade handler (line range from P93 — locate and modify the WebSocket-upgrade block; keep the JWT-from-query auth pattern identical)

### P95 (the unchanged consumer)
- `.planning/phases/95-stream-window/95-CONTEXT.md`, `95-PLAN.md`, `95-SUMMARY.md` — verify what wsUrl shape and what RFB version the frontend expects
- `livos/packages/ui/source/.../use-webapp-vnc.ts` (path approximate — locate via grep) — the noVNC RFB consumer; confirm it sends nothing extra (no protocol switching message, no custom headers) so the bridge can be a pure byte pipe

### Sacred SHA references
- Memory `feedback_subscription_only.md` — sdk-agent-runner.ts is gold; never touch
- Memory `feedback_p65_rename_complete.md` — current sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

### Mini PC environment
- Memory `reference_minipc.md` and `reference_minipc_ssh.md` — bruce@10.69.31.68 + sudo for /opt/livos/ paths
- Memory `feedback_ssh_rate_limit.md` — batch SSH commands
- Memory `reference_zerotier_unstable.md` — detach long Mini PC operations (nohup + log + bg poll)
- 2026-05-08 binary verification: `x11vnc 0.9.16` AT `/usr/bin/x11vnc` (or equivalent), `websockify` AT `/usr/local/bin/websockify` — confirmed installed; `install.sh` already added these per P93 scope item A

### Five preserved fixes (must NOT regress)
| SHA | Why it's still relevant |
|-----|-------------------------|
| `5e126607` | Chrome spawns as bruce via sudo -u with livos-chrome profile — needed for x11vnc to find a window |
| `96f2527b` | DISPLAY/XAUTHORITY passed as sudo command-prefix env vars — Chrome needs X11; x11vnc reads the same display |
| `368a09f7` | DISPLAY/XAUTHORITY injected at spawn factory in `index.ts` — applies to x11vnc too (it's spawned through the same factory or a new sibling) |
| `782cafeb` | Diagnostic argv+stderr dump on encoder crash — pattern reused for x11vnc crashes |
| `4c55b173` | Geometry clamp — dead code after swap but kept defensively (D-99-05) |

</canonical_refs>

<specifics>
## Specific Implementation Notes

### x11vnc command (verified working syntax — derived from v33-DRAFT.md §D-V33-03)

```
x11vnc \
  -id <window_id> \
  -rfbport <local_port> \
  -localhost \
  -shared \
  -forever \
  -noxdamage \
  -nopw \
  -display $DISPLAY \
  -auth $XAUTHORITY
```

- `-localhost` is critical — no external exposure; only livinityd's bridge connects
- `-noxdamage` — bypasses the X-DAMAGE extension which Mutter sometimes mishandles for child windows
- `-nopw` — local-only, auth happens at WS layer via JWT (P93 pattern)
- `-shared` — multiple WS subscribers can attach (matches Fmp4Fanout multi-subscriber semantics)
- DISPLAY + XAUTHORITY env injection identical to the Chrome spawn pattern from `368a09f7`

### Bridge sketch (illustrative, NOT canonical — planner refines)

```ts
// On WS subscriber attach to a vnc-mode StreamSession:
const tcp = net.connect({ host: '127.0.0.1', port: session.rfbPort });
ws.on('message', (data) => tcp.write(data));     // browser → x11vnc
tcp.on('data',    (data) => ws.send(data));      // x11vnc → browser
ws.on('close', () => tcp.destroy());
tcp.on('close', () => ws.close(1011));
// Backpressure: same 4 MB bufferedAmount drop rule from P93's Fmp4Fanout
```

### Files expected to change (planner finalises)

- **CREATE** `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` — spawn x11vnc, manage TCP↔WS bridge per subscriber
- **MODIFY** `livos/packages/livinityd/source/modules/streaming/index.ts` (or `stream-manager.ts`) — discriminate by `kind`/`mode` between fMP4 and VNC sessions
- **MODIFY** `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — call new VNC bridge factory instead of `streamManager.startStream({mode:'window-crop'})`
- **MODIFY** `livos/packages/livinityd/source/modules/server/index.ts` — `/ws/stream/:streamId` upgrade handler branches on session kind: fMP4 → existing fanout join; VNC → new bridge attach
- **OPTIONAL** Add a vitest covering the bridge (mock TCP server emitting canned RFB bytes; assert WS receives them and ws.send() forwards bytes back to TCP)

### Mini PC live verification (final plan must include)

After deploy, smoke test from a known-working Chrome window:
1. `xdotool search --name 'New Tab'` → pick a wid (or spawn a fresh `google-chrome --new-window about:blank` as bruce)
2. `sudo -u bruce DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority x11vnc -id <wid> -rfbport 15999 -localhost -shared -forever -noxdamage -nopw &`
3. `nc 127.0.0.1 15999 | head -c 12` should return `RFB 003.008\n`
4. If non-zero exit or empty bytes — Mutter incompat reproduces; STOP and reassess (Phase 99 cannot ship without this passing)
5. Then full E2E: WebApp click → noVNC handshake reaches `successful` → mouse click in noVNC fires xdotool input on Mini PC → real Chrome window reacts

</specifics>

<deferred>
## Deferred Ideas

- **WebRTC upgrade** — replace fMP4 path while keeping `{streamId, wsUrl}` API contract. Deferred to v34 per v33-DRAFT.md.
- **Multi-user per-WebApp profiles** — single Mini PC user only in v33; multi-user → v34.
- **CDP `--remote-debugging-port` window control** — replaces xdotool-based window discovery. Deferred to v34.
- **Per-window quality settings UI** (`-quality`, `-scale` x11vnc args) — out of scope for the swap; reuse x11vnc defaults.
- **`websockify` as a separate process** — explicitly ruled out per D-99-02 (auth gate must stay in livinityd).
- **Auto-fallback to ffmpeg crop on x11vnc failure** — explicitly ruled out per D-99-06 (loud-fail instead of silent-fallback). If x11vnc proves unreliable on Mutter despite the 2026-05-08 verification, that's a separate phase.

</deferred>

---

*Phase: 99-webapp-vnc-swap*
*Context gathered: 2026-05-08 directly from session memory `project_v33_protocol_mismatch.md` (user-confirmed decisions, no discuss-phase round-trip required).*
