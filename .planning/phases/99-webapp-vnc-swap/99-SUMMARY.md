# Phase 99 — WebApp VNC Swap (fMP4 → x11vnc) — SUMMARY

**Status:** CODE-COMPLETE 2026-05-08; PENDING Mini PC deploy + user-walked UAT (this plan).
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED before AND after every commit.
**Pushed:** `4c55b173..351bcb62` → origin/master (utopusc/livinity-io) at start of 99-05.
**Phase trigger:** UAT-discovered protocol mismatch on 2026-05-08 — backend was emitting fMP4 (`ftypisom...`) over `/ws/stream/:streamId` but frontend `use-webapp-vnc.ts` is a `@novnc/novnc 1.6.0` RFB client expecting `RFB 003.008\n`. The swap replaces the per-WebApp window backend with `x11vnc -id <wid>` so the existing wire endpoint speaks RFB.

## Plans shipped

| Plan | Status | Commit range | Headline |
|------|--------|--------------|----------|
| 99-01 | DONE | `9a61d78a` | Mini PC live verification PASS — canonical x11vnc argv locked (RFB 003.008 handshake observed against bruce's GNOME-on-Xorg + Mutter session) |
| 99-02 | DONE | `986f24e4..909cca8e..e2fc8d39` | vnc-bridge.ts (spawnVncForWindow + attachVncBridge + 4 MB backpressure + 3×100ms ECONNREFUSED retry) + 12/12 vitest cases (RED→GREEN) |
| 99-03 | DONE | `53f05e5f..72c09c61..7ad594d8..79a09e3d` | StreamSession discriminated union + vnc-window mode + getSession + stopStream cascade. 15/15 stream-manager + 10/10 encoder-args green. |
| 99-04 | DONE | `a6dfd763..6b50c02f..351bcb62` | WebAppWindowManager.spawn() hard-cut to mode:'vnc-window' (portal probe + GeometryTracker for WebApp use REMOVED) + /ws/stream/:streamId dispatches on session.kind. 14/14 window-manager + 15/15 ws-stream green. |
| 99-05 | IN PROGRESS | (this plan) | Push + Mini PC deploy + UAT walk + close |

Total Phase 99 commits: **11** (one for 99-01, three for 99-02, four for 99-03, three for 99-04 — all in `9a61d78a..351bcb62`; this 99-05 will add up to 2 more).

## Files touched

### Created
- `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` — 290 lines (`spawnVncForWindow`, `attachVncBridge`, `BACKPRESSURE_BYTES`, ECONNREFUSED retry per Pitfall 4)
- `livos/packages/livinityd/source/modules/streaming/vnc-bridge.test.ts` — 281 lines (12 vitest cases)

### Modified
- `livos/packages/livinityd/source/modules/streaming/stream-manager.ts` — discriminated-union `StreamSession`; vnc-window branch in `startStream`; `getSession`; vnc cascade in `stopStream`
- `livos/packages/livinityd/source/modules/streaming/stream-manager.test.ts` — +5 cases (15/15 green: 10 fmp4 + 5 vnc)
- `livos/packages/livinityd/source/modules/streaming/encoder-args.ts` — `StreamMode` extended with `'vnc-window'`; defensive throws in `buildFfmpegArgs` / `buildGstWindowArgs`
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — `spawn()` hard-cuts to `mode:'vnc-window'`; PipeWire portal + GeometryTracker for WebApp use case removed; geometry-clamp preserved as no-op per D-99-05
- `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` — Tests 1, 3, 8, 11 updated to assert new behavior; Tests 12, 13, 14 added (14/14 green)
- `livos/packages/livinityd/source/modules/server/index.ts` — `/ws/stream/:streamId` dispatches on `session.kind`: `vnc` → `attachVncBridge`; else → `addSubscriber`
- `livos/packages/livinityd/source/modules/server/ws-stream.test.ts` — Tests 14 + 15 added (15/15 green)

### Untouched (D-99-04 + D-99-10 + D-NO-BYOK preservation)
- `liv/packages/core/src/sdk-agent-runner.ts` — sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (verified across all 11 phase commits)
- `livos/packages/livinityd/source/modules/streaming/fmp4-fanout.ts` — fMP4 fanout for `mode:'desktop'`
- `livos/packages/livinityd/source/modules/webapps/pipewire-portal.ts` — orphaned for fMP4 path; not deleted
- `livos/packages/livinityd/source/modules/webapps/geometry-tracker.ts` — orphaned for fMP4 path; not deleted
- `livos/packages/ui/source/...` — frontend (`use-webapp-vnc.ts`, `webapp-stream-window.tsx`, etc.) — UNCHANGED

## Tests added

| File | New cases | Total |
|------|-----------|-------|
| `streaming/vnc-bridge.test.ts` | 12 | 12 |
| `streaming/stream-manager.test.ts` | +5 | 15 |
| `streaming/encoder-args.test.ts` | 0 | 10 (unchanged) |
| `webapps/window-manager.test.ts` | +3 | 14 |
| `server/ws-stream.test.ts` | +2 | 15 |
| **Total Phase 99 net** | **+22 new cases** | **66 in scope, all green** |

Phase 99-scoped vitest summary at end of 99-04: `Test Files 5 passed (5) — Tests 66 passed (66)`.

## Decisions diff vs CONTEXT

All 12 LOCKED decisions (D-99-01..D-99-12) honored as written. No drift.

- **D-99-01 canonical argv:** implemented verbatim in `vnc-bridge.ts spawnVncForWindow` (`-id 0xHEX -rfbport <port> -localhost -shared -forever -noxdamage -nopw`); empirically verified working against bruce's Mutter session in 99-01.
- **D-99-02 pure-Node bridge (no websockify subprocess):** implemented in `vnc-bridge.ts attachVncBridge`; auth gate stays in livinityd.
- **D-99-03 -localhost bind + per-stream port:** in-process counter starting at 15900, ring [15900, 16100).
- **D-99-04 fMP4 path stays alive:** `Fmp4Fanout`, `encoder-args` (3 fmp4 modes), `pipewire-portal`, `geometry-tracker` all preserved byte-for-byte for `mode:'desktop'`.
- **D-99-05 geometry-clamp preserved as no-op:** explicit comment `preserved for ffmpeg-fallback path; unused under x11vnc mode` marks the dead-but-defensive code.
- **D-99-06 loud-fail (no auto-fallback):** no fallback wired; bridge surfaces `vnc backend unreachable` via `ws.close(1011)` after 3×100ms retry exhaustion.
- **D-99-07 stderr-tail diagnostic:** `spawnVncForWindow` tails last 50 lines of x11vnc stderr + dumps on non-zero exit.
- **D-99-08 + D-99-09 lifecycle cascade:** `stopStream(vnc kind)` SIGTERMs x11vnc with 500ms wait; `idleCleanupTick` → `close` → `stopStream` works for both kinds (Test 14 lock).
- **D-99-10 sacred SHA preserved:** verified across all 11 commits (table below).
- **D-99-11 D-NO-BYOK:** no `@anthropic-ai/sdk` edits, no broker changes.
- **D-99-12 D-NO-SERVER4:** Mini PC `bruce@10.69.31.68` only; Server4 not contacted.

## Sacred SHA verification

| Commit | Subject | sdk-agent-runner.ts SHA |
|--------|---------|-------------------------|
| `9a61d78a` | docs(99-01): record Mini PC x11vnc -id <wid> live verification (PASS) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| `986f24e4` | test(99-02): add failing vitest spec for vnc-bridge.ts | same |
| `909cca8e` | feat(99-02): implement vnc-bridge.ts (spawn x11vnc + WS↔TCP byte pipe) | same |
| `e2fc8d39` | docs(99-02): record vnc-bridge.ts TDD ship | same |
| `53f05e5f` | refactor(99-03): introduce discriminated-union StreamSession (kind:'fmp4') | same |
| `72c09c61` | test(99-03): add 5 failing vitest cases for vnc-window kind | same |
| `7ad594d8` | feat(99-03): startStream({mode:"vnc-window"}) + getSession + stopStream(vnc) | same |
| `79a09e3d` | docs(99-03): record StreamManager discriminated-union ship | same |
| `a6dfd763` | feat(99-04): WebAppWindowManager.spawn() swaps to mode:'vnc-window' | same |
| `6b50c02f` | feat(99-04): /ws/stream/:streamId dispatches on session.kind (fmp4|vnc) | same |
| `351bcb62` | docs(99-04): record WindowManager swap + WS dispatch ship | same |

`liv/packages/core/src/sdk-agent-runner.ts` UNTOUCHED across the entire phase. Verified via:

```bash
for SHA in $(git log --format=%H 7f5b9571..HEAD); do
  echo "$SHA $(git show $SHA:liv/packages/core/src/sdk-agent-runner.ts | git hash-object --stdin)"
done
```

All 11 lines end with `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.

## UAT outcome

**Result:** PARTIAL-PASS (date: 2026-05-08; user-walked).

**What works (PASS):**
- Mini PC deploy via `bash /opt/livos/update.sh` completed cleanly (deployed SHA `cd6f442`); all 4 services (`livos`, `liv-core`, `liv-worker`, `liv-memory`) report `active`; livos.service journal clean (only normal tunnel keepalive reconnects).
- Single WebApp click → stream window opens → noVNC RFB handshake succeeds (no `Invalid server version ftypiso` error); captured Chrome window pixels are visible.
- Mouse + keyboard input pass through to the captured Chrome window (xdotool `--window <wid>` works).
- The original Phase 99 trigger (P93 fMP4 vs noVNC RFB protocol mismatch) is RESOLVED for the single-stream case.

**What does NOT work (gaps requiring follow-up):**
- **G-99-UAT-1 — Multi-stream concurrent broken:** clicking a SECOND WebApp does not produce a second independent stream. User reports "tek pencere üzerinden çalışıyor" (works only through one window). Expected: each WebApp click → its own window + its own stream port. Bytebot per-window window-switching also blocked by this.
- **G-99-UAT-2 — Stream window UI has unwanted URL bar:** the top toolbar (`webapp-toolbar.tsx`, ~95-07.A) shows a URL input that the user does not want. Each WebApp's URL is already bound to the WebApp; showing it inside the stream window is redundant.
- **G-99-UAT-3 — Stream area should fill window:** stream pane should consume the full window; no chrome around it. Current layout has the toolbar above + the AgentPanel (mode selector + chat) below, which compresses the actual stream.
- **G-99-UAT-4 — Chat/Teach/Watch/Auto inline is wrong shape:** these controls are currently inside the same window as the stream. User wants them as **floating icon buttons positioned outside the stream window** (like the existing top drag-to-move and close buttons). Each button opens its own panel/popup (Chat, Teach, Watch, Auto) rather than being inline.

**Status flip:** Phase 99 — `[ ]` → `[~]` in ROADMAP.md (partial-PASS pending Phase 100 follow-up).

**v33 milestone status:** all 8 phases (92-99) now CODE-COMPLETE; the v33-VNC-* requirement set is partially met. Phase 100 (added to ROADMAP) closes the gaps before v33 ships. The protocol-level mismatch that triggered Phase 99 is resolved; remaining issues are concurrency + UI redesign, not wire-format.

**Carryover to Phase 100 — Multi-Stream + Stream-Window Redesign:**
1. Diagnose multi-stream root cause (likely Chrome `--user-data-dir` IPC merge: a 2nd `--new-window` invocation against the same profile may merge into the existing browser process, so xdotool either finds the same wid OR finds a new wid that the frontend doesn't open a fresh window for). Mini PC live verification required (kill-gate).
2. Backend fix: depending on diagnosis — switch to `--app=URL` site-specific-browser mode (no IPC merge, also gives a chromeless window which solves G-99-UAT-2 partially) OR per-WebApp `--user-data-dir` (heavier; loses shared Google login).
3. Frontend redesign: `webapp-stream-window.tsx` + `webapp-toolbar.tsx` — drop URL bar, full-bleed stream area.
4. Frontend redesign: replace inline `webapp-mode-selector.tsx` + agent panel with **floating action button row** (icon-only, anchored to the stream window's bottom edge similar to the top drag/close buttons). Each button (Chat / Teach / Watch / Auto) opens its own panel as a popover/sheet.
5. Mini PC deploy + user-walked UAT close (must verify 2 concurrent streams + new UI shape).

## Carryovers

- **No new carryovers.** The frontend's noVNC reconnect-on-disconnect loop hammers the WS endpoint at 1s/2s/4s/8s backoff after a window dies; this is bounded and self-resolving (Pitfall 3 in 99-RESEARCH.md). Documented here for future maintenance.
- **fMP4 path orphaned for WebApp use case but ALIVE for `mode:'desktop'`** — desktop-stream native app continues to work via `Fmp4Fanout`. If a future cleanup phase decides to retire fMP4, this is the file inventory: `streaming/fmp4-fanout.ts`, `streaming/encoder-args.ts` (fmp4 branches), `webapps/pipewire-portal.ts`, `webapps/geometry-tracker.ts`.
- **WebRTC upgrade for the desktop fMP4 path** — deferred to v34 per `v33-DRAFT.md`.
- **Multi-tab same-WebApp UX nit** (`-shared` allows multiple tabs to drive the same x11vnc → cursor jitter if both move at once) — out of scope; documented in 99-RESEARCH.md §"Open Questions" Q3.
- **Pre-existing broken test:** `livos/packages/livinityd/source/modules/livinity-broker/passthrough-streaming-integration.test.ts > Phase 58 final gate > sacred runner file SHA unchanged at end of phase` fails because it hardcodes the OLD `nexus/packages/core/sdk-agent-runner.ts` path AND old SHA `4f868d318...`. Broken since Phase 65 rename (2026-05-05) + Phase 77 SHA bump. NOT introduced by Phase 99. Out of scope.

---

**Closing sacred-SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (verified pre-deploy AND post-deploy; protocol swap functionally LIVE on Mini PC; multi-stream + UI redesign deferred to Phase 100).
