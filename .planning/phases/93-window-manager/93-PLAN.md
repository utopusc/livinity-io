# Phase 93: Streaming Subsystem + Window Manager — PLAN

**Wave:** 1 (parallel with P92)
**Effort:** L (4–7 days; 14 tasks)
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — verify start AND end of every task.
**Tasks:** T93-00 (spike — DONE pre-execution) → T93-13 (rollup) — 14 tasks total.

---

## How to run this plan

- T93-00 is the original streamer-choice spike — its outcome is recorded in `93-CONTEXT.md` §"Spike outcome". Treated as DONE for execution. No rerun unless the Mini PC X server is re-imaged.
- T93-01 (install.sh) MUST land before any task that depends on the new binaries on the Mini PC. T93-02–T93-07 are pure-code-on-dev-box and can land before T93-01 in CI; deploy ordering is captured in T93-13 (P98 hand-off).
- Each task ends with: vitest green for new specs, `git hash-object` sacred SHA verify, ONE atomic commit.
- Mini PC probes batch into ONE ssh invocation per memory note (ZeroTier instability + fail2ban).
- Final phase rollup commit (T93-13) references all task ranges.

---

## Task 93-00 — Streamer spike on Mini PC Mutter (gate, DONE)

**Goal:** Already complete — see `93-CONTEXT.md` §"Spike outcome". Per-window `x11vnc -id` / `maim -i` / `import -window` confirmed broken on Mutter; `ffmpeg -f x11grab` on full `:0.0` confirmed working post-gdm-restart with ydotoold attached.

**Outcome:** D-93-01 (architecture pivot to ffmpeg fMP4 + Node WS fan-out, plus PipeWire portal for true per-window) recorded in CONTEXT. No further spike action.

**Acceptance:** `93-CONTEXT.md` §"Spike outcome" present and unchanged by the rewrite.

**Verify:**
- `grep -q "Spike outcome" .planning/phases/93-window-manager/93-CONTEXT.md`
- `git hash-object liv/packages/core/src/sdk-agent-runner.ts` == `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

**Commit:** none (already recorded).

---

## Task 93-01 — `install.sh` updates: streaming binaries + ydotoold systemd unit

**Description:** Extend the existing `install_x11vnc()` step (line 590 of `livos/install.sh`) into a broader `install_streaming_subsystem()` that apt-installs the full 18-package list locked in CONTEXT D-93-07, then writes `/etc/systemd/system/ydotoold.service` and enables it. The user's words: "Install.sh ile bu butun servisler kurulmali."

**Files:**
- EDIT `livos/install.sh` — replace/rename `install_x11vnc()` and add `setup_ydotoold_service()`. Keep idempotency (the existing `apt-get install -y -qq` is already idempotent; new function follows same pattern).

**Acceptance criteria:**
- All 18 apt packages from `93-CONTEXT.md` §Dependencies appear in a single `apt-get install -y -qq` call (or split logically by family — VAAPI separate from GStreamer separate from x11/screenshot).
- `/etc/systemd/system/ydotoold.service` written with: `Description`, `After=graphical.target`, `ExecStart=/usr/bin/ydotoold --socket-path=/tmp/.ydotool_socket --socket-own=$desktop_uid:$desktop_uid`, `Restart=on-failure`, `WantedBy=graphical.target`.
- Post-install verification block runs `which ffmpeg gst-launch-1.0 dbus-send vainfo xdotool maim` and `systemctl is-enabled ydotoold` — fails the install if any returns non-zero.
- Sacred SHA unchanged.

**Effort:** 2h
**Depends on:** —

---

## Task 93-02 — `streaming/vaapi-probe.ts` + Redis caps cache + tests

**Description:** Boot-time VAAPI probe via `vainfo` subprocess. Parses output, extracts `VAEntrypointEncSlice` for `VAProfileH264Main` / `VAProfileH264High` / `VAProfileH264ConstrainedBaseline`. Stores result in Redis HASH `liv:streaming:caps`. Used by encoder-arg builder to pick `h264_vaapi` vs `libx264` (D-93-03).

**Files:**
- CREATE `livos/packages/livinityd/source/modules/streaming/vaapi-probe.ts`
- CREATE `livos/packages/livinityd/source/modules/streaming/vaapi-probe.test.ts`

**Acceptance criteria:**
- Exports `async function probeVaapi(): Promise<{vaapi: boolean; profiles: string[]; error?: string}>`.
- Exports `async function persistVaapiCaps(redis, caps): Promise<void>` — sets `liv:streaming:caps` HASH with `vaapi`, `profiles` (CSV), `probedAt` (ISO timestamp).
- Vitest cases (≥5): vainfo success with H264 profile → `vaapi:true`; vainfo success without H264 → `vaapi:false`; vainfo binary missing (`ENOENT`) → returns `{vaapi:false, error:'vainfo-not-found'}`; vainfo timeout (>3s) → returns `{vaapi:false, error:'timeout'}`; persistVaapiCaps round-trips through ioredis-mock.

**Effort:** 1h
**Depends on:** T93-01 (vainfo binary present on Mini PC for live verification, but vitest mocks execFile)

---

## Task 93-03 — `streaming/encoder-args.ts` + tests

**Description:** Pure-function module that builds the ffmpeg argv array given mode (`desktop` | `window-crop` | `pipewire-fd`), source params (display, geometry, PipeWire fd), VAAPI caps, and tuning knobs (zerolatency on/off). One source of truth for encoder flags so the StreamManager isn't littered with argv strings.

**Files:**
- CREATE `livos/packages/livinityd/source/modules/streaming/encoder-args.ts`
- CREATE `livos/packages/livinityd/source/modules/streaming/encoder-args.test.ts`

**Acceptance criteria:**
- Exports `buildFfmpegArgs(opts: BuildArgsOpts): string[]` and `buildGstWindowArgs(opts): string[]` (for the PipeWire fd → fMP4 path via gst-launch-1.0).
- All MSE-tuning flags from D-93-02 present: `-fflags nobuffer`, `-probesize 32`, `-analyzeduration 0`, `-tune zerolatency`, `-movflags +frag_keyframe+empty_moov+default_base_moof`, `-draw_mouse 1` (D-93-05).
- VAAPI branch swaps `-c:v libx264 -preset ultrafast` for `-c:v h264_vaapi` plus `-vf 'hwupload,scale_vaapi=format=nv12'` and `-vaapi_device /dev/dri/renderD128`.
- Window-crop branch uses `-grab_x`, `-grab_y`, `-video_size WxH` (NOT `+X,Y`; that syntax broke in spike test E).
- Vitest cases (≥8): each mode × VAAPI on/off, plus a snapshot test of one full argv to lock the wire format.

**Effort:** 2h
**Depends on:** T93-02 (caps shape)

---

## Task 93-04 — `streaming/fmp4-fanout.ts` (init segment buffer + box parser) + tests

**Description:** Receives raw bytes from an encoder ChildProcess stdout, parses fMP4 box boundaries, holds the initialization segment (ftyp + moov) for late subscribers, broadcasts each completed media fragment (moof + mdat pair) to all subscribers via `WebSocket.send()`. Backpressure: drop subscribers whose `bufferedAmount > LIVOS_STREAM_BACKPRESSURE_BYTES` (default 4 MB).

**Files:**
- CREATE `livos/packages/livinityd/source/modules/streaming/fmp4-fanout.ts`
- CREATE `livos/packages/livinityd/source/modules/streaming/fmp4-fanout.test.ts`

**Acceptance criteria:**
- Exports class `Fmp4Fanout` with `feed(chunk: Buffer): void`, `addSubscriber(ws: WebSocket): void`, `removeSubscriber(ws): void`, `close(reason?: string): void`, `getSubscriberCount(): number`.
- On first complete `ftyp` + `moov` parsed, holds them as `initSegment: Buffer`. New subscribers receive init segment immediately on `addSubscriber`.
- On each completed `moof` + `mdat` pair, broadcasts to all subscribers.
- Slow subscriber (`ws.bufferedAmount > threshold`) is removed from the set + closed with code 1013 ("try again later").
- Decision: use `mp4frag` npm OR hand-roll based on dep weight (GA-93-03). Document choice in top-of-file comment.
- Vitest cases (≥7): single-fragment broadcast; multi-subscriber broadcast; late subscriber receives init segment + next fragment; slow subscriber dropped; `close()` terminates all subscribers; box parser handles split chunks (one box across two `feed()` calls); malformed bytes logged + skipped without crash.

**Effort:** half-day
**Depends on:** —

---

## Task 93-05 — `streaming/stream-manager.ts` + tests

**Description:** The `StreamManager` class. Owns `Map<streamId, StreamSession>`. `startStream(opts) → {streamId, wsUrl}` spawns the encoder ChildProcess (ffmpeg or gst-launch-1.0 per mode) using `encoder-args` module, wires stdout into a `Fmp4Fanout` instance, returns a stream record. `stopStream(streamId)` SIGTERMs the encoder, escalates to SIGKILL after 2s, calls `fanout.close()`. `listStreams({userId})` returns active records filtered by owner. `getFanout(streamId)` exposed for the WS handler.

**Files:**
- CREATE `livos/packages/livinityd/source/modules/streaming/stream-manager.ts`
- CREATE `livos/packages/livinityd/source/modules/streaming/stream-manager.test.ts`

**Acceptance criteria:**
- `startStream({userId, mode, target})` returns `{streamId, wsUrl: '/ws/stream/' + streamId}` synchronously after encoder spawn (no await on first frame).
- Idempotency (GA-93-07): if `(userId, mode, JSON.stringify(target))` matches an existing alive stream → return existing `{streamId, wsUrl}`, do NOT spawn duplicate encoder.
- `stopStream(streamId)` sends SIGTERM, awaits exit up to 2s, escalates to SIGKILL, calls `fanout.close('encoder-stopped')`.
- Encoder unexpected exit (`exit` event with non-zero code while `stopStream` not called) → mark session as crashed, close fanout with code 1011, log ERROR.
- `listStreams({userId})` returns `Array<{streamId, mode, target, subscriberCount, status: 'alive'|'crashed'}>` filtered.
- VAAPI cap respected: if `liv:streaming:caps.vaapi === 'true'`, max 10 concurrent; else max 5. 11th/6th `startStream` throws `{code: 'STREAM_CAP_EXCEEDED', limit}`.
- Vitest cases (≥9): start happy path; idempotent re-start; stop SIGTERM-then-SIGKILL escalation (fake timers); crash detection; listStreams userId filter; cap-exceeded throws; subscriber count round-trips; mode='desktop' uses ffmpeg argv; mode='pipewire-fd' uses gst-launch-1.0 argv.

**Effort:** half-day
**Depends on:** T93-03, T93-04, T93-02

---

## Task 93-06 — `/ws/stream/:id` upgrade handler in server/index.ts + tests

**Description:** New WebSocket-upgrade handler mounted in `livos/packages/livinityd/source/modules/server/index.ts`, structurally mirroring the existing `/ws/desktop` block at line 856. Auth via D-93-06: JWT-from-query (`?token=...`) with `LIVINITY_SESSION` cookie fallback, `verifyToken()`, then verify the stream belongs to the verified userId.

**Files:**
- EDIT `livos/packages/livinityd/source/modules/server/index.ts` — add the handler after the `/ws/desktop` block (do NOT relocate the existing block; new code follows it). Handler must run BEFORE the generic `this.webSocketRouter.get(pathname)` fallback.
- CREATE `livos/packages/livinityd/source/modules/server/ws-stream.test.ts`

**Acceptance criteria:**
- Path-match: `pathname.startsWith('/ws/stream/')` with regex extraction of `streamId`.
- Auth chain identical to `/ws/desktop`: query param token → cookie fallback → 401 if missing → `verifyToken` → 401 if invalid.
- Stream lookup: `streamManager.list({userId}).find(s => s.streamId === streamId)` — 404 if absent (not 403, to avoid existence leak per STRIDE).
- On accept: `wss.handleUpgrade()`, `binaryType = 'nodebuffer'`, `streamManager.getFanout(streamId).addSubscriber(ws)`. On `ws.close` → `removeSubscriber`.
- Vitest test file uses the same `readFileSync(index.ts)` source-string approach as `ws-desktop.test.ts` (the existing test pattern). Asserts the handler block contains: `pathname.startsWith('/ws/stream/')`, `401 Unauthorized`, `404`, `addSubscriber`, `binaryType`, and is positioned after `/ws/desktop` and before the generic router.

**Effort:** 2h
**Depends on:** T93-05

---

## Task 93-07 — `webapps/window-discovery.ts` (xdotool/wmctrl/xprop wrappers) + tests

**Description:** Strongly-typed wrappers over `xdotool`, `wmctrl`, `xprop`. Pure utility module — no streaming or manager logic. Implements the two-pass title match (D-93-08) plus baseline-wid-diff snapshotting.

**Files:**
- CREATE `livos/packages/livinityd/source/modules/webapps/window-discovery.ts`
- CREATE `livos/packages/livinityd/source/modules/webapps/window-discovery.test.ts`

**Acceptance criteria:**
- Exports `WindowInfo` type (`{wid, title, geometry: {x,y,w,h}}`), `listAllWindows()`, `snapshotWindowIds()`, `findWindowByTitle(opts)`, `findNewWindowMatching({titleHints, baselineWids, timeoutMs})`, `isWindowAlive(wid)`, `getWindowGeometry(wid)`, `activateWindow(wid)`.
- All wrappers use `execFile` (NOT `exec` — avoid shell injection on wid/title args), 2s default timeout, throw on non-zero exit unless documented otherwise.
- Vitest cases (≥9) with mocked `node:child_process.execFile` returning canned stdout strings.

**Effort:** 2h
**Depends on:** T93-01 (binaries present on Mini PC; vitest mocks)

---

## Task 93-08 — PipeWire screencast portal client (`webapps/pipewire-portal.ts`) + tests

**Description:** D-Bus client wrapping `org.freedesktop.portal.ScreenCast`. Implements `requestWindowSession() → {pwNodeId, fd}` via the standard portal handshake: `CreateSession` → `SelectSources(types=window)` → `Start` → consume returned PipeWire node ID and FD. Uses `dbus-next` npm package. Falls back to "portal unavailable" error if `org.freedesktop.portal.Desktop` not on the session bus.

**Files:**
- CREATE `livos/packages/livinityd/source/modules/webapps/pipewire-portal.ts`
- CREATE `livos/packages/livinityd/source/modules/webapps/pipewire-portal.test.ts`
- EDIT `livos/packages/livinityd/package.json` — add `dbus-next` dep.

**Acceptance criteria:**
- Exports `async function requestWindowSession(opts: {desktopUid: number; restoreToken?: string}): Promise<{pwNodeId: number; fd: number; closeSession: () => Promise<void>}>` and `async function isPortalAvailable(): Promise<boolean>`.
- Reads response signal token via the portal Request pattern (subscribe to Response signal on a per-call object path).
- 30s timeout on the user-consent step (portal shows a window picker dialog). Throws `{code: 'PORTAL_USER_CANCELED'}` on dialog dismiss.
- `closeSession()` calls `Session.Close` on the session object.
- Vitest mocks `dbus-next` MessageBus + ProxyObject. Cases (≥6): isPortalAvailable returns false when service missing; isPortalAvailable returns true when present; happy-path session returns pwNodeId + fd; user-canceled response → throws; timeout → throws; closeSession invokes Session.Close.

**Effort:** half-day
**Depends on:** —

---

## Task 93-09 — Geometry-tracker fallback (`webapps/geometry-tracker.ts`) + tests

**Description:** Fallback per-window source for systems without PipeWire portal (D-93-04 → J). Polls `xdotool getwindowgeometry --shell <wid>` every 200ms; exposes a `geometry$` event emitter; the StreamManager subscribes and respawns the ffmpeg encoder with new `-grab_x` / `-grab_y` / `-video_size` when drift > 10px.

**Files:**
- CREATE `livos/packages/livinityd/source/modules/webapps/geometry-tracker.ts`
- CREATE `livos/packages/livinityd/source/modules/webapps/geometry-tracker.test.ts`

**Acceptance criteria:**
- Exports `class GeometryTracker extends EventEmitter` with `start(wid: number)`, `stop()`, emits `'change'` with new geometry on drift > 10px (configurable `driftThreshold`).
- Emits `'window-gone'` when `isWindowAlive(wid)` returns false; `stop()` is automatic on this event.
- Tracker uses `setInterval(200)`; clean shutdown clears it.
- Vitest cases (≥5) with mocked window-discovery and fake timers: no drift → no event; drift > 10px → one event; window gone → 'window-gone' event + auto-stop; multiple ticks of stable geometry don't spam events; stop() clears interval.

**Effort:** 1h
**Depends on:** T93-07

---

## Task 93-10 — `WebAppWindowManager` class (`webapps/window-manager.ts`) + tests

**Description:** Orchestrator. Composes `window-discovery` + `pipewire-portal` (or `geometry-tracker` fallback) + `StreamManager` into the `spawn / focus / close / list` surface for WebApps. Owns `Map<webappId, ActiveWebApp>` and the idle-cleanup poller (xprop poll every 5s).

**Files:**
- CREATE `livos/packages/livinityd/source/modules/webapps/window-manager.ts`
- CREATE `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts`

**Acceptance criteria:**
- `spawn({userId, webappId, url, expectedTitle})` algorithm:
  1. Idempotency check (existing alive entry → return existing handle).
  2. Snapshot wid baseline (D-93-08).
  3. `child_process.spawn('google-chrome', ['--new-window', url], {detached: true, stdio: 'ignore'})` then `unref()` — Chrome is NOT a livinityd child (D-V33-01: shared profile, no `--user-data-dir`).
  4. `findNewWindowMatching({titleHints: [hostname(url), expectedTitle], baselineWids, timeoutMs: 5000})`.
  5. On timeout: throw `{code: 'WINDOW_NOT_FOUND', url}`.
  6. Try `pipewirePortal.requestWindowSession()` (D-93-04 primary); on `PORTAL_UNAVAILABLE` fall back to `GeometryTracker` + crop ffmpeg (J).
  7. `streamManager.startStream({mode: 'pipewire-fd' | 'window-crop', target})` → returns `{streamId, wsUrl}`.
  8. Store `{webappId, userId, wid, mode, streamId, geometryTracker?, portalSession?}` in map.
  9. Return `{windowId: wid, streamId, wsUrl}`.
- `focus({webappId})`: lookup → `isWindowAlive` → `activateWindow` → return `{ok}` or `{code: 'WINDOW_GONE'}`.
- `close({webappId, killWindow?})`: stop stream → close portal session OR stop geometry tracker → optional `xdotool windowkill <wid>` → release map entry.
- `list({userId})`: filter map by userId, return public-shape records.
- Idle-cleanup loop: `setInterval(5000)` calls `isWindowAlive` for each entry, cascades `close` on dead entries.
- Vitest cases (≥10) with mocked discovery / portal / geometry-tracker / streamManager.

**Effort:** half-day
**Depends on:** T93-05, T93-07, T93-08, T93-09

---

## Task 93-11 — tRPC routes: `streams.{start,stop,list}` + `webapps.window.{spawn,focus,close,list}` + auth hardening + tests

**Description:** Append seven tRPC procedures to the existing P92 `webapps` router (or split `streams.*` into a new sub-router under the same package; decide based on P92's actual file layout). All procedures pull `userId` from `ctx.currentUser.id` (NEVER from input). Reject any input that contains a `userId` field different from `ctx.currentUser.id` with `TRPCError({code: 'FORBIDDEN'})`. Add all seven paths to `httpOnlyPaths` in `common.ts` (memory note: long-running routes hang if WebSocket-routed).

**Files:**
- EDIT `livos/packages/livinityd/source/modules/webapps/trpc-router.ts` (path TBD by P92; if P92 chose a different filename adapt accordingly).
- EDIT the file containing `httpOnlyPaths` (likely `livos/packages/ui/src/utils/trpc/common.ts` or sibling — locate at execution time).
- CREATE `livos/packages/livinityd/source/modules/webapps/trpc-streams.test.ts` (vitest with stubbed managers).

**Acceptance criteria:**
- Seven procedures present, each with a Zod input schema and explicit return type.
- `userId` forgery rejected with FORBIDDEN (1 test per route).
- `httpOnlyPaths` updated; `grep "httpOnlyPaths"` shows the seven new entries.
- STRIDE sweep applied (S/T/R/I/D/E checklist documented at end of test file as a comment block):
  - **S**poofing: JWT auth on every endpoint via `protectedProcedure`. ✓
  - **T**ampering: `webappId` and `streamId` flow only through Postgres / Map lookups, never into shell. ✓
  - **R**epudiation: every spawn/close/start/stop logged at INFO with userId + id. Add log calls.
  - **I**nfo disclosure: 404 (not 403) for "wrong user" lookups.
  - **D**oS: stream cap from T93-05 enforced; webapp cap of 50 active per user enforced in `WebAppWindowManager.spawn` (returns `TOO_MANY_WEBAPPS` past 50).
  - **E**levation: WS upgrade handler runs JWT auth (covered by T93-06 tests).

**Effort:** half-day
**Depends on:** T93-05, T93-06, T93-10, P92 router shape

---

## Task 93-12 — Integration test: stream start → frame received → stop → cleanup

**Description:** End-to-end vitest using a fixture-binary that mimics an ffmpeg encoder by emitting a canned fMP4 byte sequence (init segment + 5 fragments) on stdout, then exiting cleanly on SIGTERM. Spawns the actual `StreamManager`, opens an in-process WS server with the `/ws/stream/:id` handler, connects a `ws` client, asserts: init-segment received as first message, ≥3 fragments received within 3s, `stopStream` triggers WS close + encoder exit + map cleanup. No real X server, no real ffmpeg — fixture binary stands in.

**Files:**
- CREATE `livos/packages/livinityd/source/modules/streaming/integration.test.ts`
- CREATE `livos/packages/livinityd/source/modules/streaming/__fixtures__/fake-encoder.cjs` (Node script that writes fixed bytes to stdout)
- CREATE `livos/packages/livinityd/source/modules/streaming/__fixtures__/canned-fmp4.bin` (or generate the bytes inline in the .cjs file)

**Acceptance criteria:**
- Test passes in CI (no Mini PC needed).
- Coverage of the full chain: `StreamManager.startStream` → ChildProcess → `Fmp4Fanout.feed` → WS handler → client receives bytes → `StreamManager.stopStream` → all closed.
- 3s test timeout (Vitest default fits).

**Effort:** half-day
**Depends on:** T93-04, T93-05, T93-06

---

## Task 93-13 — `93-SUMMARY.md` + ROADMAP/STATE update + P95/P97/P98 hand-off

**Description:** Write the phase summary and bump state. Document carryovers explicitly (Mini PC live deploy, 2-hour stream-stability UAT, react-vnc/MSE wiring in P95, bytebot windowId scoping in P97).

**Files:**
- CREATE `.planning/phases/93-window-manager/93-SUMMARY.md`
- EDIT `.planning/STATE.md` — bump to "Phase 93 complete (code-only; deploy in P98)".
- EDIT `.planning/ROADMAP.md` — check P93 done.

**Acceptance criteria:**
- SUMMARY covers: files created (paths + line counts), tests added (count + file:test-name), encoder choice + VAAPI status, decisions diff vs CONTEXT (any drift documented), open carryovers, sacred SHA start + end, hand-off paragraph for P95.
- STATE + ROADMAP updated.
- Sacred SHA verified before AND after.

**Effort:** 1h
**Depends on:** Everything else (T93-01 through T93-12).

---

## Test strategy

| Layer | Tooling | Where |
|-------|---------|-------|
| Unit | Vitest + `vi.mock('node:child_process')` + `ioredis-mock` + DI stubs | Per-module `*.test.ts` files (T93-02 through T93-11) |
| Source-string assertion | Vitest readFileSync of `index.ts` (mirrors existing `ws-desktop.test.ts`) | T93-06 ws-stream handler placement |
| Integration | Vitest with fixture-binary fake encoder | T93-12 |
| Live (Mini PC) | Manual smoke under P98 UAT — NOT in P93 scope | Carryover |

No real X server in CI. No live ffmpeg/gst spawns in CI. The fake-encoder fixture is the boundary.

---

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `dbus-next` D-Bus call hangs on systems without an active session bus (e.g. SSH-only contexts on Mini PC) | M | M | T93-08 includes `isPortalAvailable()` short-circuit; manager falls back to geometry-tracker without blocking. |
| MSE latency > 200ms even after tuning, causing visible lag in P95 demo | M | M | T93-03 locks the tuning flags; if P98 UAT measures > 300ms, file v34 ticket for WebRTC upgrade — does not block v33 ship. |
| VAAPI exhaustion when 10 streams + Chrome compositing both hammer the iGPU | L | M | T93-05 caps concurrent streams; T93-13 SUMMARY notes the cap. |
| `apt-get install` on a fresh Ubuntu 24.04 brings in unexpected GNOME dependencies (xdg-desktop-portal-gnome may pull in mutter / gnome-shell) | M | L | T93-01 verification block fails the install loudly; operator can rerun without GNOME on a headless install (HAS_GUI=false branch already exists in install.sh line 591). |
| fMP4 box-parse off-by-one corrupts the stream for late subscribers | L | H | T93-04 prefers `mp4frag` over hand-roll for this exact reason; chunk-split test covers the edge case. |
| `httpOnlyPaths` location moved since P65 rename | L | M | T93-11 grep at execution time; if missing, escalate to user before committing. |
| Chrome `--new-window` opens a tab in an existing window when the URL matches an open tab's domain | L | M | T93-10 baseline-wid-diff catches "no new window appeared" → throws `WINDOW_NOT_FOUND`; user retries with a unique URL. |
| ZeroTier flap mid-deploy invalidates Mini PC live verification (P98 carryover) | M | L | All Mini PC probes batch into ONE ssh + nohup + log-poll per memory note; P93 itself avoids Mini PC at all. |
| Sacred SHA drift via accidental `liv/packages/core/` import | L | H | `git hash-object` gate before AND after every commit. T93-13 SUMMARY records start + end SHA. |

---

## Sacred SHA verification points

| Task | Pre-commit | Post-commit |
|------|------------|-------------|
| 93-01 | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` == `f3538e1d…` | same |
| 93-02 | same | same |
| 93-03 | same | same |
| 93-04 | same | same |
| 93-05 | same | same |
| 93-06 | same | same |
| 93-07 | same | same |
| 93-08 | same | same |
| 93-09 | same | same |
| 93-10 | same | same |
| 93-11 | same | same |
| 93-12 | same | same |
| 93-13 | same | same — recorded in SUMMARY.md as the closing line |

Any divergence → ABORT phase, escalate to user with `git diff` of the offending file.

---

## Phase verification gates (must all pass before declaring P93 done)

| Gate | Method | Pass |
|------|--------|------|
| install.sh updated | `grep -E "ffmpeg\|gst-launch\|dbus-send\|vainfo" livos/install.sh` matches all 18 packages | exit 0 |
| ydotoold systemd unit installer | `grep "ydotoold.service" livos/install.sh` | exit 0 |
| All module tests | `npm test --filter livinityd -- streaming webapps server/ws-stream` | exit 0 |
| Integration test | `npm test --filter livinityd -- streaming/integration` | exit 0 |
| Build | `npm run build --filter livinityd` | exit 0 |
| Sacred SHA | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` | == `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Sacred file no-touch | `git diff --name-only master..HEAD -- liv/packages/core/` | empty |
| Redis prefix sweep | `grep -rE "liv:streaming:" livos/packages/livinityd/source/modules/streaming` returns only `liv:streaming:caps` | manual |
| `httpOnlyPaths` updated | `grep "httpOnlyPaths" <common.ts location>` includes the seven new entries | exit 0 |
| SUMMARY exists | `test -f .planning/phases/93-window-manager/93-SUMMARY.md` | exit 0 |

---

## Roll-up commit message (final, after T93-13)

```
feat(93): streaming subsystem + window manager (Phase 93)

Wave 1 of v33. Parallel with P92 metadata extractor.

What landed:
- install.sh: 18 apt packages + ydotoold systemd unit
- streaming/vaapi-probe.ts: boot-time VAAPI cap detection
- streaming/encoder-args.ts: ffmpeg/gst argv builder (libx264 + h264_vaapi)
- streaming/fmp4-fanout.ts: init-segment buffer + box-parser broadcast
- streaming/stream-manager.ts: lifecycle + idempotency + cap enforcement
- /ws/stream/:id WS upgrade handler (JWT-from-query, ownership check)
- webapps/window-discovery.ts: xdotool/wmctrl/xprop wrappers
- webapps/pipewire-portal.ts: D-Bus screencast portal client
- webapps/geometry-tracker.ts: x11grab crop fallback
- webapps/window-manager.ts: Chrome --new-window + portal/fallback + idle cleanup
- tRPC: streams.{start,stop,list} + webapps.window.{spawn,focus,close,list}
- httpOnlyPaths updated; STRIDE sweep applied
- Integration test: stream start → frames → stop → cleanup

Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNTOUCHED.
No Docker, no broker edits, no liv/packages/core/ edits, no Python.

Carryovers (P95 / P97 / P98):
- MSE <video> client wired in P95
- Bytebot --window <wid> scoping in P97
- Mini PC live deploy + 2-hour stream-stability UAT in P98
```

NOT pushed.
