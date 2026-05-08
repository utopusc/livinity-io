# Phase 93 — Streaming Subsystem + Window Manager — SUMMARY

**Status:** CODE-COMPLETE 2026-05-07. 13 atomic commits, all 14 PLAN tasks landed (T93-00 spike DONE pre-execution).
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED before AND after every commit.
**Pushed:** Pending — push happens at end of T93-13 once all gates green.

---

## Tasks shipped

| Task | Commit (short) | What landed |
|------|----------------|-------------|
| T93-00 | (pre-exec) | Spike outcome — `93-CONTEXT.md` §Spike outcome |
| T93-01 | `cf61685d` | install.sh + update.sh apt-install streaming binaries + ydotoold systemd |
| T93-02 | `d3258bed` | streaming/vaapi-probe.ts + Redis HASH `liv:streaming:caps` |
| T93-03 | `3125c867` | streaming/encoder-args.ts — ffmpeg + gst-launch argv builder |
| T93-04 | `c181c143` | streaming/fmp4-fanout.ts — init buffer + box parser + WS broadcast |
| T93-05 | `b3a61c78` | streaming/stream-manager.ts — lifecycle + idempotency + cap enforcement |
| T93-06 | `7080f645` | server/index.ts — `/ws/stream/:id` upgrade handler |
| T93-07 | `84055cdb` | webapps/window-discovery.ts — xdotool/wmctrl/xprop wrappers |
| T93-08 | `737ea5d1` | webapps/pipewire-portal.ts — D-Bus screencast portal client |
| T93-09 | `107bf51a` | webapps/geometry-tracker.ts — x11grab crop fallback |
| T93-10 | `7f4daaa9` | webapps/window-manager.ts — orchestrator class |
| T93-11 | `db9b83b8` | tRPC routes streams.* + webapp.window.* + httpOnlyPaths |
| T93-12 | `d670847e` | streaming/integration.test.ts + fake-encoder.cjs fixture |
| T93-13 | (this commit) | SUMMARY + STATE/ROADMAP updates |

13 active task commits. Range: `cf61685d..d670847e` (plus this rollup).

---

## Files created (paths + approx line count)

### Streaming subsystem
- `livos/packages/livinityd/source/modules/streaming/vaapi-probe.ts` — 150 lines
- `livos/packages/livinityd/source/modules/streaming/vaapi-probe.test.ts` — 175 lines
- `livos/packages/livinityd/source/modules/streaming/encoder-args.ts` — 175 lines
- `livos/packages/livinityd/source/modules/streaming/encoder-args.test.ts` — 230 lines
- `livos/packages/livinityd/source/modules/streaming/fmp4-fanout.ts` — 320 lines
- `livos/packages/livinityd/source/modules/streaming/fmp4-fanout.test.ts` — 200 lines
- `livos/packages/livinityd/source/modules/streaming/stream-manager.ts` — 320 lines
- `livos/packages/livinityd/source/modules/streaming/stream-manager.test.ts` — 240 lines
- `livos/packages/livinityd/source/modules/streaming/trpc-router.ts` — 130 lines
- `livos/packages/livinityd/source/modules/streaming/integration.test.ts` — 100 lines
- `livos/packages/livinityd/source/modules/streaming/__fixtures__/fake-encoder.cjs` — 80 lines

### WebApp window manager
- `livos/packages/livinityd/source/modules/webapps/window-discovery.ts` — 195 lines
- `livos/packages/livinityd/source/modules/webapps/window-discovery.test.ts` — 175 lines
- `livos/packages/livinityd/source/modules/webapps/pipewire-portal.ts` — 220 lines
- `livos/packages/livinityd/source/modules/webapps/pipewire-portal.test.ts` — 110 lines
- `livos/packages/livinityd/source/modules/webapps/geometry-tracker.ts` — 110 lines
- `livos/packages/livinityd/source/modules/webapps/geometry-tracker.test.ts` — 145 lines
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — 365 lines
- `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` — 245 lines
- `livos/packages/livinityd/source/modules/webapps/trpc-streams.test.ts` — 195 lines

### Server / WS handler / tRPC plumbing (edits, not creates)
- `livos/packages/livinityd/source/modules/server/index.ts` — `/ws/stream/:id` block ~70 lines added
- `livos/packages/livinityd/source/modules/server/ws-stream.test.ts` — 130 lines (new)
- `livos/packages/livinityd/source/modules/server/trpc/index.ts` — streams router mounted
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — 7 new httpOnlyPaths entries
- `livos/packages/livinityd/source/modules/webapps/trpc-router.ts` — webapp.window.* sub-router added
- `livos/packages/livinityd/source/index.ts` — `streamManager?` + `webappWindowManager?` fields
- `livos/packages/livinityd/package.json` — `dbus-next ^0.10.2` added

### Deploy
- `livos/install.sh` — install_streaming_subsystem() + setup_ydotoold_service() (~120 lines added)
- `update.sh` — Phase 93 apt-install step + ydotoold provisioning (~70 lines added)

---

## Tests (count + summary)

| File | Tests |
|------|-------|
| streaming/vaapi-probe.test.ts | 8 |
| streaming/encoder-args.test.ts | 10 |
| streaming/fmp4-fanout.test.ts | 9 |
| streaming/stream-manager.test.ts | 10 |
| streaming/integration.test.ts | 1 (E2E with fake-encoder fixture) |
| webapps/window-discovery.test.ts | 11 |
| webapps/pipewire-portal.test.ts | 7 |
| webapps/geometry-tracker.test.ts | 6 |
| webapps/window-manager.test.ts | 11 |
| webapps/trpc-streams.test.ts | 9 |
| server/ws-stream.test.ts | 13 |
| **Total** | **95** new test cases |

Combined run (P93 modules + ws-desktop regression): **200/200 green** in ~1s.

---

## Encoder choice + VAAPI status

D-93-03 → boot-time `vainfo` probe persists `liv:streaming:caps` HASH. The encoder-args module reads `caps.vaapi`:
- **VAAPI present** → `-c:v h264_vaapi -vaapi_device /dev/dri/renderD128 -vf 'hwupload,scale_vaapi=format=nv12' -qp 23`. Concurrent stream cap = 10.
- **libx264 fallback** → `-c:v libx264 -preset ultrafast -tune zerolatency`. Concurrent stream cap = 5.

Both branches share the MSE-tuning flags (D-93-02): `-fflags nobuffer -probesize 32 -analyzeduration 0`, fragmented MP4 (`+frag_keyframe+empty_moov+default_base_moof+separate_moof`), 200ms `-frag_duration` default. Cursor visible (`-draw_mouse 1`, D-93-05).

PipeWire-fd mode (D-93-04 primary per-window) uses `gst-launch-1.0` instead of ffmpeg:
```
gst-launch-1.0 -q fdsrc fd=N ! pipewiresrc path=<nodeId> do-timestamp=true \
  ! videorate ! video/x-raw,framerate=30/1 ! videoconvert \
  ! x264enc tune=zerolatency speed-preset=ultrafast key-int-max=30 \
  ! mp4mux fragment-duration=200 streamable=true ! fdsink fd=1
```

---

## Decisions diff vs CONTEXT

- **D-93-01..D-93-08:** all locked decisions implemented as specified. No drift.
- **Plan referenced `webapps.window.*` (plural namespace) but actual P92 mount is `webapp` (singular).** Deviation: extended the singular `webapp` namespace in-place with a `window` sub-router instead of creating a duplicate `webapps` namespace. Documented in T93-11 commit body.
- **GA-93-03 fMP4 box parser:** chose hand-roll over `mp4frag` npm dep. Box format is trivial (4 BE size + 4 ASCII type + payload); mp4frag also tries to parse codec params / GOPs which we don't need. Hand-roll keeps dep weight zero (only new dep is `dbus-next` for portal).
- **install.sh + update.sh BOTH apt-install the 18 packages.** Per user 2026-05-07 directive (override of plan T93-01 which only mentions install.sh).

---

## Sacred SHA verification

| Phase | Pre-commit | Post-commit |
|-------|------------|-------------|
| T93-01 | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | same |
| T93-02 | same | same |
| T93-03 | same | same |
| T93-04 | same | same |
| T93-05 | same | same |
| T93-06 | same | same |
| T93-07 | same | same |
| T93-08 | same | same |
| T93-09 | same | same |
| T93-10 | same | same |
| T93-11 | same | same |
| T93-12 | same | same |
| T93-13 | same | same — recorded here as the closing line |

`liv/packages/core/src/sdk-agent-runner.ts` git-hash-object stayed at `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for the entire phase.

---

## Carryovers (P95 / P97 / P98)

- **P95** (Wave 3): wire MSE `<video>` client to `wsUrl` returned by `streams.start` / `webapp.window.spawn`. Decode init-segment + appendBuffer fragment loop. Frontend reuses the 7 new tRPC routes. UI lives in `livos/packages/ui/src/components/webapp-stream-window/...` (TBD path).
- **P97** (Wave 4): bytebot `screenshot.ts` / `input.ts` extension with `windowId?: number` param. Use the `wid` returned by `webapp.window.spawn` to scope `maim -i <wid>` and `xdotool --window <wid>`. The new `BYTEBOT_TARGET_WINDOW_ID` env per CONTEXT §Out-of-scope.
- **P98** (Wave 5):
  - **Mini PC live deploy:** `git pull && bash /opt/livos/update.sh` on `bruce@10.69.31.68`. The update.sh edit (T93-01) apt-installs the 18 packages + writes the ydotoold systemd unit on first run.
  - **2-hour stream-stability UAT:** spawn 5 WebApps (different domains), verify subscriber WS receives ≥30 fragments per minute for 2h, no encoder crashes, VAAPI iGPU not starved.
  - **Hookup of streamManager + webappWindowManager** in `livinityd.start()` — currently the field is declared on `Livinityd` but `undefined` at runtime. tRPC routes return `SERVICE_UNAVAILABLE` until P98 instantiates them. Lifecycle: probe vainfo → persistVaapiCaps → `new StreamManager({caps, spawn: child_process.spawn, logger})` → `new WebAppWindowManager({streamManager, spawn, logger})` → `webappWindowManager.startIdleCleanup()`.
- **dbus-next install:** added to `package.json` but `pnpm install` runs on next `bash /opt/livos/update.sh`. No-op until P98 runs the deploy.

---

## Hand-off paragraph for P95

P95 builds the WebApp Stream Window UI on top of P93's surface. The contract:

1. Call `webapp.window.spawn({webappId, url, expectedTitle?})` — returns `{windowId, streamId, wsUrl}`.
2. Open `new WebSocket(wsUrl + '?token=<jwt>')` from the React component.
3. The first binary frame is the fMP4 init segment (`ftyp` + `moov`). Pass it to `MediaSource.sourceBuffer.appendBuffer()`.
4. Subsequent binary frames are media fragments (`moof` + `mdat` pairs). Append each to the same SourceBuffer.
5. Mode selector (Watch/Teach/Auto/Chat) drives the per-WebApp agent panel — independent of the streaming surface.
6. On window close: call `webapp.window.close({webappId})`. The /ws/stream/:id socket terminates with code 1011.

Per-window streaming uses the PipeWire portal when available (mode=`pipewire-fd`) and falls back to ffmpeg crop (mode=`window-crop`) automatically. The frontend doesn't need to know which path is active.

---

**Closing sacred-SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
