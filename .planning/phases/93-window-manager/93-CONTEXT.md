# Phase 93 — Host Chrome Window Manager + per-window x11vnc — CONTEXT

**Wave:** 1 (parallel with P92 metadata extractor)
**Status:** Planning
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (`liv/packages/core/src/sdk-agent-runner.ts`) — MUST be unchanged before AND after this phase.

---

## 1. Goal

Given `(userId, webappId, url)`, spawn a Chrome window on the host Mini PC against the user's existing Chrome profile, attach a per-window VNC stream to that window, and return a websocket URL the LivOS browser frontend can connect to. Provide a programmatic surface (`spawn` / `focus` / `close` / `list`) that Phase 95 (stream window UI) and Phase 94 (desktop launcher) call, plus an idle cleanup loop that tears down the VNC stack when the underlying Chrome window goes away.

This is the backend window-manager primitive for the v33 WebApp launcher. No UI in this phase.

---

## 2. Why

- v33 vision (DRAFT v2 §1): clicking a WebApp icon must open a real Chrome window on the Mini PC and stream that **single window** back to the LivOS browser. The host-Chrome direction was locked by the user to preserve the shared Google profile (D-V33-01).
- P95 (stream window) and P97 (auto-mode bytebot loop with `--window <wid>` scoping) both depend on a stable `(webappId) → wid + vnc port + ws url` mapping. P93 owns that mapping.
- P79 just landed maim + xdotool fixes for the host GNOME / Mutter display. P93 is the first phase to consume those fixes for a real product surface.

---

## 3. In-scope

| Item | Detail |
|------|--------|
| **Spike (T93-00)** | Verify `x11vnc -id <wid>` produces a non-black VNC stream of a Chrome window on host Mutter. If black like scrot was, document and pick fallback (a) `ffmpeg -f x11grab` cropped via `-video_size WxH -i :0+X,Y` from window geometry, or (b) maim-loop → MJPEG. The fallback choice locks the spawn implementation for the rest of the phase. |
| **`window-discovery.ts`** | Thin wrappers around `xdotool search`, `xdotool getwindowname`, `xdotool getwindowgeometry`, `wmctrl -l`, `wmctrl -ia`, `xprop -id`. Returns typed `{wid, title, x, y, w, h}`. Polls with timeout for "new window matching X" after a Chrome spawn. |
| **`x11vnc-spawn.ts`** | Spawns + supervises one `x11vnc -id <wid> -rfbport <port> -localhost -shared -forever` per active webapp. If P93 spike fell back to ffmpeg/maim, this module owns that fallback instead. Owns websockify `<wsPort> localhost:<port>` companion process per stream. Returns a handle with `pid`, `port`, `wsPort`, `kill()`. |
| **`window-manager.ts`** | The `WebAppWindowManager` class with `spawn`, `focus`, `close`, `list`. Owns the `liv:webapp:ports` Redis pool (range to be picked in spike — recommend 14200-14999 reusing v1's reserved range). Owns the in-memory `webappId → handle` map. Idle-cleanup poller: every 5s, for each tracked webapp, runs `xprop -id <wid>` — if the window is gone, tears down x11vnc + websockify and emits an event the gateway middleware can listen to. |
| **`webapp-gateway-middleware.ts`** | Express middleware mounted on `/webapp-vnc/:webappId`. Looks up the websockify port for that webappId, http-proxies the WebSocket upgrade. Returns 404 if no handle (window already torn down). Auth: reuses livinityd JWT cookie / header check, must verify `webapps.userId === ctx.currentUser.id` before proxying. |
| **Port allocator** | Redis sorted set `liv:webapp:ports`. `SPOP`-style allocate from a free pool; release on close. First-time init seeds 14200-14999. Allocation is keyed `(userId, webappId)` so a re-spawn of the same webapp reuses its prior port if still free. |
| **tRPC surface** | `webapps.spawn`, `webapps.focus`, `webapps.close`, `webapps.list` in the existing webapps router (created in P92). Each method is a thin wrapper around the WebAppWindowManager class, scoped to `ctx.currentUser.id`. |
| **Logging / observability** | `winston` (or whatever livinityd uses today) logs at INFO level on each spawn/close, ERROR on x11vnc/websockify exit, DEBUG on idle-cleanup ticks. No metrics export in this phase. |
| **Vitest unit tests** | Mock-only tests for window-discovery output parsing (xdotool / wmctrl text → typed records), port allocator (Redis-mock), and the idle-cleanup state machine. Spawn integration is **not** unit-testable here — covered by the spike + P98 UAT walk on the Mini PC. |

---

## 4. Out-of-scope

- **No Docker.** User locked the v2 pivot away from per-WebApp containers (DRAFT §2). Anything container-shaped belongs in v34 power-user mode.
- **No CDP / `--remote-debugging-port` path.** Deferred to v34 per D-V33-02.
- **No UI.** P95 owns the stream window component; P94 owns the launcher icon.
- **No multi-user logic.** v33 is single Mini PC user (`bruce`) per D-V33-07. Pass `userId` through but don't branch on it; current user is always the only user.
- **No skill recording.** P96 owns teach mode. This phase only sets up the substrate it will record against.
- **No bytebot integration.** P97 wires `--window <wid>` into the bytebot tools. P93 only ensures `wid` is reliably discoverable + retrievable via `list({userId})`.
- **No Mini PC deploy.** Phase ships code; P98 owns the live UAT walk.
- **No VNC client.** Frontend (P95) brings novnc / react-vnc; P93 only exposes the websocket endpoint.

---

## 5. Dependencies

| Source | What we consume | Why |
|--------|-----------------|-----|
| **P79 (shipped)** | maim works on Mutter, xdotool 3.x installed on Mini PC, ydotoold systemd unit attached as slave pointer | Window discovery + the maim fallback (if spike forces it) both inherit P79's host-display fixes. Without P79, none of this works. |
| **P92 (parallel, Wave 1)** | `webapps` Postgres table with `(id, userId, url, title, faviconUrl)`, the `webapps` tRPC router | P93 adds `spawn/focus/close/list` to that same router. Title from P92 is the candidate match string when polling xdotool for the new Chrome window. |
| **livinityd existing infra** | Express server, tRPC context with `currentUser`, ioredis client, JWT auth | Middleware mount point + Redis pool live in livinityd. |
| **Mini PC host** (runtime, not code) | `google-chrome`, `xdotool`, `wmctrl`, `xprop`, `x11vnc`, `websockify`, `ffmpeg`, `maim` binaries on PATH | Spike confirms versions and fallback choice. Install commands captured in SUMMARY for the deploy script. |
| **Memory: ZeroTier instability** | Spike must batch all SSH probes into ONE ssh invocation, log to file, detach long ops | Avoids fail2ban + ZT drop-mid-run failures. |

---

## 6. Sacred constraints

- `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED. Verify via `git hash-object` before AND after every commit in this phase.
- Subscription-only. No raw `@anthropic-ai/sdk` or BYOK paths added (none expected; this phase is pure OS plumbing).
- No edits to `liv/packages/core/`. P93 lives entirely in `livos/packages/livinityd/source/`.
- No edits to broker (`livos/packages/livinityd/source/modules/livinity-broker/`).
- No edits to `sdk-agent-runner` callers — bytebot scoping (windowId) is P97's lane.
- No emoji unless the user explicitly authors it.
- New code only — no rewrites of existing modules. Only the existing webapps router (P92) gets new tRPC methods appended.

---

## 7. Gray areas (decide during planning / spike)

| GA | Question | Resolution path |
|----|----------|-----------------|
| **GA-93-01** | Does `x11vnc -id <wid>` produce a non-black stream against host Mutter, or does Mutter's compositor hide the window's pixmap from XGetImage the same way it broke scrot? | **T93-00 spike** is the first task. Outcome locks the streamer choice (x11vnc vs ffmpeg-x11grab vs maim-loop MJPEG). Document in `93-SPIKE.md` and reference from SUMMARY. |
| GA-93-02 | Window-discovery race: how long does Chrome take to make a `--new-window` visible to xdotool after spawn? | Spike measures wall-clock from `spawn()` → first xdotool match across 10 trials with 50ms poll. Set the production timeout to `max(observed) + 1s`, capped at 5s. |
| GA-93-03 | Title-match strategy: URL hostname vs page `<title>`? Page title is racy (loads after window). | Match in two passes: pass 1 — title contains hostname (fast, racy-tolerant); pass 2 (after 1s) — title contains the page `<title>` from P92 metadata. Use the most specific matched window. |
| GA-93-04 | What if the user already has 5 Chrome windows open and our spawn races against one of those? | Snapshot wid set BEFORE `chrome --new-window` spawns; match new wids only (set diff). Belt-and-braces with title match on top. |
| GA-93-05 | Port range — reuse v1's reserved 14200-14999 or pick fresh? | Reuse 14200-14999. Document in SUMMARY. Note a separate ws-port range (14000-14199) for websockify so they don't collide. |
| GA-93-06 | When Chrome window closes via user clicking ✕, x11vnc should die naturally (parent-window-gone). Does it? Or do we need active polling? | Spike T93-00 confirms via 1-minute observe loop. If x11vnc lingers, idle-cleanup poller (xprop every 5s) is the safety net. Either way the poller ships — it's also the recovery path for x11vnc segfaults. |
| GA-93-07 | Auth on `/webapp-vnc/:webappId` — JWT in cookie (browser default) or signed query token? Browsers can't set custom headers on WebSocket upgrade requests. | Use the existing livinityd JWT cookie. WebSocket upgrade reuses cookie auth automatically. Verify P92 router uses the same. If cookie is httpOnly + same-origin, this is the cleanest path. |
| GA-93-08 | `focus({webappId})` when the wid is gone (user closed it): error or auto-respawn? | Error with `{code: 'WINDOW_GONE', webappId}`. P95 catches and prompts user "Window was closed. Reopen?" → calls `spawn`. No silent respawn. |
| GA-93-09 | x11vnc password / auth — should the VNC stream itself be authenticated, or do we trust localhost-only binding? | Trust `-localhost`. Only websockify (which we control) can connect. Frontend goes through gateway middleware which is JWT-authed. No VNC password. |

---

## 8. Success criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| S1 | Spike outcome documented with picked streamer (x11vnc / ffmpeg / maim) + measured frame rate + memory per stream | `93-SPIKE.md` exists with curl/screenshot evidence, decision recorded in SUMMARY |
| S2 | `WebAppWindowManager.spawn(...)` returns `{vncWsUrl, windowId, port}` within 6s for a fresh Chrome window | Vitest mock test asserts the return shape; live verification in P98 UAT |
| S2b | `spawn` is idempotent: calling twice for the same `(userId, webappId)` while a window is alive returns the existing handle (focus, don't double-spawn) | Vitest with mocked window-discovery returning the same wid |
| S3 | `WebAppWindowManager.focus({webappId})` activates the window via wmctrl + xdotool windowactivate; returns `{ok: true}` or `{code: 'WINDOW_GONE'}` | Vitest with mocked discovery; live verification in P98 |
| S4 | `WebAppWindowManager.close({webappId})` kills x11vnc + websockify; Chrome window survives unless `xdotool windowkill` flag passed | Vitest verifies kill calls; live in P98 |
| S5 | `WebAppWindowManager.list({userId})` returns active webapps with `{webappId, windowId, port, wsPort, status}` | Vitest |
| S6 | `/webapp-vnc/:webappId` proxies WebSocket upgrade to local websockify; returns 404 when no active handle, 401 when no/wrong JWT | Vitest with supertest + mocked websockify |
| S7 | Idle-cleanup poller tears down x11vnc + websockify within ≤6s of the underlying Chrome window closing | Vitest with mocked xprop returning "window gone" + fake timers |
| S8 | Port allocator: `liv:webapp:ports` Redis SET seeded 14200-14999 (VNC) + 14000-14199 (websockify); allocation/release round-trips correctly under contention | Vitest with redis-mock, 50 concurrent allocate calls — no duplicate ports |
| S9 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged before AND after every commit | `git hash-object` in CI-style verify block at end of each task |
| S10 | `pnpm --filter livinityd build` / `npm run build` (whichever this package uses) exits 0 | Local build at end of phase |
| S11 | Vitest suite for the four new modules exits 0 | `npm test --filter livinityd` or local equivalent |
| S12 | Zero `liv:capabilities:*` Redis keys touched (post-P65 prefix is `liv:cap:*`); the only new prefix introduced by this phase is `liv:webapp:*` | grep check in verify block |

---

## 9. Decisions (locked at planning time)

| ID | Decision | Rationale |
|----|----------|-----------|
| D-93-01 | Spike comes FIRST as Task 93-00 — no implementation begins until streamer is picked | Picking wrong streamer means rewriting `x11vnc-spawn.ts`. Spike de-risks the whole phase. |
| D-93-02 | Streamer fallback order: x11vnc-id → ffmpeg-x11grab cropped → maim-loop MJPEG | x11vnc native VNC is lowest-latency. ffmpeg gives MJPEG-over-HTTP fallback that any browser can render. maim-loop is last resort. |
| D-93-03 | Single livinityd process owns `liv:webapp:ports`; no cross-process locking needed in v33 | v33 is single Mini PC user, single livinityd. Redis is the pool record-keeper, not a lock. |
| D-93-04 | Port ranges: `14200-14999` VNC, `14000-14199` websockify | Reuses v1's reserved VNC range (no collisions with existing services). Websockify range is 200 ports — supports up to 200 concurrent webapps which is far above realistic usage. |
| D-93-05 | Idle-cleanup poll interval = 5s | Matches DRAFT spec. Fast enough to feel responsive, slow enough to keep CPU near zero (5 webapps × 1 xprop call / 5s). |
| D-93-06 | Title-match for window discovery uses two-pass: (1) hostname, (2) page title from P92 metadata if step 1 returns multiple | Hostname is in title from frame 0 of Chrome's page load. Page title arrives later. Two-pass minimizes false matches without depending on page-load timing. |
| D-93-07 | Snapshot wid set before spawn → diff after spawn → match within new wids only | Eliminates "user already has facebook.com open in another window" false-match. |
| D-93-08 | tRPC routes added to existing webapps router from P92 — no new router file | One router per Postgres table. |
| D-93-09 | Auth on `/webapp-vnc/:webappId`: livinityd JWT cookie. Verify webapp belongs to `currentUser.id` before proxying. | Standard livinityd auth. No new mechanism. |
| D-93-10 | No VNC password (`-rfbauth`); rely on `-localhost` binding + gateway JWT | Defense-in-depth via two layers (loopback bind + JWT) is sufficient for single-user host. |
| D-93-11 | `close({webappId})` does NOT kill the Chrome window by default; only kills the streamer stack | Chrome window is the user's. They close it via Chrome ✕. P95 may pass `{killWindow: true}` when user clicks the LivOS shell ✕. |
| D-93-12 | Chrome spawned via `google-chrome --new-window <url>` — NO `--user-data-dir` flag | Per D-V33-01: shared profile is the user's hard requirement. |
| D-93-13 | All four new files live under `livos/packages/livinityd/source/modules/webapps/` (window-manager, x11vnc-spawn, window-discovery) and `…/source/server/` (webapp-gateway-middleware) | Matches DRAFT §5 file list verbatim. |
| D-93-14 | One commit per task (T93-00 ships `93-SPIKE.md` + decisions; subsequent tasks ship code) | Matches Phase 91 commit cadence. |

---

## 10. Out of scope (explicit non-goals)

- Any UI work (P94, P95).
- Bytebot windowId scoping (P97 owns native primitive extension).
- Skill recording (P96).
- Multi-user / per-user Chrome profiles.
- CDP-based window control.
- WebRTC streaming.
- Touching `liv/packages/core/` or the broker.
- Mini PC deploy / live UAT (P98 owns).
- Postgres migrations beyond what P92 already adds (this phase reads `webapps` rows but doesn't add columns).

---

## 11. Files this phase creates / modifies

**New files** (per DRAFT §5 verbatim):
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts`
- `livos/packages/livinityd/source/modules/webapps/x11vnc-spawn.ts`
- `livos/packages/livinityd/source/modules/webapps/window-discovery.ts`
- `livos/packages/livinityd/source/server/webapp-gateway-middleware.ts`
- `.planning/phases/93-window-manager/93-SPIKE.md` (spike artifact)
- `.planning/phases/93-window-manager/93-SUMMARY.md` (after work lands)
- Vitest spec files alongside each module (e.g. `window-discovery.test.ts`, `port-allocator.test.ts`).

**Modified files**:
- The existing webapps tRPC router from P92 — add four methods (`spawn`, `focus`, `close`, `list`). Filename TBD by P92; expected `livos/packages/livinityd/source/modules/webapps/trpc-router.ts`.
- The livinityd Express server entry — mount `webapp-gateway-middleware`. Existing file (no creation).
- `httpOnlyPaths` in tRPC `common.ts` if any of the four new tRPC methods need HTTP-only routing per the memory note (likely yes — `spawn` is long-running).

---

## 12. Risk register (phase-local)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| x11vnc returns black on Mutter (same root cause as scrot pre-P79) | M | H | Spike T93-00 catches it. Fallback is ffmpeg-x11grab (already verified to work for screen capture in non-Mutter environments). |
| Window-discovery race — chrome new-window not visible to xdotool within 5s timeout | M | M | Spike measures actual timing. Snapshot-wid-set-then-diff catches the case even if title polling lags. |
| websockify version pin drift on Mini PC | L | L | Capture exact version in `93-SPIKE.md`. P98 UAT verifies. |
| `xdotool windowactivate` doesn't focus across virtual desktops | L | M | wmctrl `-ia` does the desktop switch first; xdotool finishes the focus. Both run in `focus()`. |
| Port allocator races between two near-simultaneous spawns | L | M | Redis `SPOP` is atomic. Tests cover 50-way concurrent allocate. |
| ZeroTier flap mid-spike causes false negatives | M | M | Per memory: batch all probes into ONE ssh invocation, run via `nohup …  &` with file log, poll log offline. |
| Sacred SHA drift via accidental import re-export | L | H | `git hash-object` gate before AND after every task. Reviewed in commit message. |

---

## 13. Notes

- The user has explicitly OK'd `bytebot operates on host display` (P79) and the v2 pivot's "no Docker in v33" rule. We follow that.
- This phase is the most uncertain in v33 because of GA-93-01. If the spike fails outright (none of x11vnc / ffmpeg / maim work), the phase escalates to user with the recorded evidence; we do NOT silently work around — too much downstream depends on a working stream.
- Phase 91 set the precedent that the spike artifact (SPIKE.md) lives alongside SUMMARY.md inside the phase directory; we follow that.

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

## Task list adjustments

The original 9-task PLAN (T93-00..T93-08) is revised:

- **T93-00 (spike)** — DONE pre-execution. Outcome documented above. The spike task remains in PLAN as a pointer to this CONTEXT addendum.
- **T93-01..T93-04 (per-window x11vnc)** — REPLACED by new tasks centered on the single shared daemon + geometry-tracking + browser crop. Specifically:
  - Single shared x11vnc systemd unit
  - WebAppWindowManager class (spawn / focus / close / list — same surface, but spawn now JUST runs `chrome --new-window` + xdotool poll + record geometry; no per-WebApp x11vnc)
  - Geometry-tracker: per-WebApp `xdotool getwindowgeometry <wid>` poll loop, emits over SSE
  - websockify single instance bridging the shared x11vnc port
- **T93-05..T93-08** — UNCHANGED (gateway middleware, idle-cleanup detection, tRPC `webapps.spawn/focus/close/list`, summary).

The PLAN file SHOULD be updated to reflect the new task numbering when execution begins. For now this addendum is the source of truth — executor must read both PLAN.md AND this addendum.

## Open question for user

The single-shared-x11vnc + client-crop architecture means **the user's other windows are technically streamed** (just hidden by CSS clip). For single-user Mini PC v33 scope, this is acceptable. **Confirm**: ship v33 with this constraint, document it in `docs/webapp-launcher.md` (P98), and plan v34 multi-user privacy upgrade as a follow-on milestone?
