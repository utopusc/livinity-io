# Phase 93 — Host Chrome Window Manager + per-window x11vnc — PLAN

**Wave:** 1 (parallel with P92)
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (`liv/packages/core/src/sdk-agent-runner.ts`) — verify start AND end of every task.
**Tasks:** 93-00 (spike) → 93-08 (UAT prep) — nine tasks total.

---

## 0. How to run this plan

- Tasks are sequential. T93-00 MUST land first; its outcome locks the streamer for T93-02.
- Each task ends with: vitest green for new specs, `git hash-object` sacred SHA verify, one atomic commit.
- All Mini PC probing during the spike batches into ONE ssh invocation per memory note (ZeroTier instability + fail2ban).
- Commit cadence: one commit per task. Final phase rollup commit message references all task ranges.
- After T93-08, write `93-SUMMARY.md` and update `STATE.md`. P95 picks up from here.

---

## Task 93-00 — Streamer spike on Mini PC Mutter (the gate)

**Goal:** Prove (or disprove) that `x11vnc -id <wid>` produces a non-black VNC stream of a real Chrome window on the Mini PC's host Mutter session. If proven, this is the streamer for the rest of the phase. If disproven, document the failure mode and pick the fallback (ffmpeg-x11grab cropped, or maim-loop MJPEG).

**Why first:** every line of `x11vnc-spawn.ts` is shaped by which streamer wins. Picking wrong here means rewriting that module from scratch in T93-08. This is the single highest-uncertainty item in v33.

**Inputs:**
- Mini PC reachable via SSH (see ZeroTier note in memory — batch into ONE ssh).
- Existing `bruce` user has Chrome installed at `~/.config/google-chrome/Default`.
- xdotool 3.x and ydotoold already verified working (P79, 2026-05-07).
- `x11vnc`, `ffmpeg`, `maim`, `websockify`, `wmctrl` — assume installed; the spike script's first action is `which` for each, fail loudly if absent.

**Action:**

1. Author a one-shot bash script `scripts/p93-spike.sh` (or inline heredoc — Claude's discretion). The script:
   - `which x11vnc ffmpeg maim websockify wmctrl xdotool xprop google-chrome` and dump versions.
   - Open a Chrome window: `google-chrome --new-window https://example.com &` then sleep 2s.
   - Find the wid: `xdotool search --name 'Example Domain'` (with retry up to 5s).
   - **Test A — x11vnc native:** `x11vnc -id <wid> -rfbport 14299 -localhost -shared -forever -bg -o /tmp/p93-x11vnc.log`. Then `vncsnapshot localhost:14299 /tmp/p93-x11vnc.png` (or use `xtigervncviewer`'s screenshot mode, or curl-bridge through websockify with a test client). If `vncsnapshot` is not installed, fall back to: spawn `websockify 14298 localhost:14299 &`, then a one-shot Node script using `@novnc/novnc`'s headless mode to grab a frame, OR simply `ffmpeg -f x11grab -i :0 -vframes 1 /tmp/p93-x11vnc-baseline.png` against the SAME wid as ground truth and compare. Aim for the simplest evidence that produces a real PNG. Inspect the PNG: file size > 5 KB and not all-black. (Black PNGs encode small + uniform; non-trivial JPEG/PNG > 5 KB strongly implies real content.)
   - **Test B — ffmpeg-x11grab cropped:** `xdotool getwindowgeometry --shell <wid>` → parse `WIDTH HEIGHT X Y` → `ffmpeg -f x11grab -framerate 10 -video_size ${W}x${H} -i :0.0+${X},${Y} -vframes 1 /tmp/p93-ffmpeg.png`. Same all-black / size check.
   - **Test C — maim-loop MJPEG:** `maim -i <wid> /tmp/p93-maim.png; ls -l /tmp/p93-maim.png; file /tmp/p93-maim.png`. P79 already confirmed maim works against Mutter, so this should always pass — it's the floor.
   - Capture: streamer that wins, frame size, file sizes, x11vnc log tail, any errors.
   - Cleanup: kill x11vnc, ffmpeg, websockify, kill the Chrome window via `xdotool windowkill <wid>`.
2. Run via `nohup ssh ... 'bash /tmp/p93-spike.sh' > /tmp/p93-spike.out 2>&1 &` to survive ZeroTier flap. Poll `/tmp/p93-spike.out` until script exit marker line.
3. SCP the three PNGs (`/tmp/p93-*.png`) back to the dev machine for visual confirmation. Inspect them via the Read tool (it supports image files).
4. Time-budget the live observe loop: with the winning streamer, run for 60s with the user moving the Chrome window around (manual). Confirm stream stays non-black, no x11vnc / ffmpeg crash. (Optional if T93-00 is being run in user's absence — note "skipped, will retest in P98" in `93-SPIKE.md`.)
5. Author `93-SPIKE.md` with: tool versions table, three-test result table (PASS / FAIL / black / size), screenshots referenced, picked streamer + reason, fallback order if winner fails in production, locked decisions for T93-02.

**Acceptance:**
- `93-SPIKE.md` exists.
- It records ONE of: (a) x11vnc-id PASS — non-black stream of Chrome window — picked as primary, (b) x11vnc-id BLACK / FAIL — fallback to ffmpeg-x11grab cropped — picked as primary, (c) both fail — fallback to maim-loop MJPEG — picked as primary, OR (d) all three fail (escalation to user; phase blocked).
- Three reference PNGs attached or recorded under `.planning/phases/93-window-manager/spike-artifacts/`.
- Sacred SHA verified before AND after.

**Verify:**
- `test -f .planning/phases/93-window-manager/93-SPIKE.md`
- `grep -q "Picked streamer:" .planning/phases/93-window-manager/93-SPIKE.md`
- `git hash-object liv/packages/core/src/sdk-agent-runner.ts` == sacred SHA.

**Commit:**
```
spike(93): streamer choice for host Chrome window VNC on Mutter

Evidence + decision in .planning/phases/93-window-manager/93-SPIKE.md.
Picked: <STREAMER> (x11vnc-id | ffmpeg-x11grab | maim-loop).
Fallback order documented.
Sacred SHA f3538e1d UNTOUCHED.
```

---

## Task 93-01 — `window-discovery.ts` xdotool / wmctrl / xprop wrappers + tests

**Goal:** Strongly-typed wrappers over `xdotool`, `wmctrl`, `xprop`. No callers yet — pure utility module.

**Why before x11vnc-spawn:** spawn needs `findWindowByTitle()` and `getWindowGeometry()`. Decoupling discovery from streaming means discovery is unit-testable today against captured xdotool output strings.

**Inputs:**
- T93-00 SPIKE confirmed which discovery commands actually exist and which produce parseable output.

**Action:**

1. Create `livos/packages/livinityd/source/modules/webapps/window-discovery.ts`. Exports:
   - `type WindowInfo = { wid: number; title: string; geometry: { x: number; y: number; w: number; h: number } }`
   - `async function listAllWindows(): Promise<WindowInfo[]>` — wraps `wmctrl -lG` (geometry-included list), parses each line.
   - `async function snapshotWindowIds(): Promise<Set<number>>` — fast wid-only snapshot via `xdotool search ''` (or `wmctrl -l | awk`), used pre-spawn for diff-detection (D-93-07).
   - `async function findWindowByTitle(opts: { title: string; excludeWids?: Set<number>; timeoutMs?: number; pollMs?: number }): Promise<WindowInfo | null>` — polls `xdotool search --name <title>` every `pollMs` (default 100ms) until match or timeout (default 5000ms). Returns null on timeout. Filters out wids in `excludeWids`.
   - `async function findNewWindowMatching(opts: { titleHints: string[]; baselineWids: Set<number>; timeoutMs?: number }): Promise<WindowInfo | null>` — the two-pass matcher per D-93-06: try each title hint in order, accept first match within (current wids \ baseline wids).
   - `async function isWindowAlive(wid: number): Promise<boolean>` — `xprop -id <wid> WM_NAME` returns 0 if alive, non-zero if gone.
   - `async function getWindowGeometry(wid: number): Promise<{ x: number; y: number; w: number; h: number }>` — `xdotool getwindowgeometry --shell <wid>` parsed.
   - `async function activateWindow(wid: number): Promise<void>` — `wmctrl -ia <wid>` (handles desktop switch) then `xdotool windowactivate --sync <wid>`.
2. All wrappers spawn child processes via `node:child_process`'s `execFile` (not `exec` — avoids shell-injection on the wid / title args). Wrap in `promisify(execFile)`.
3. Strict timeouts on every spawn (default 2s) — if a child process hangs, the wrapper throws.
4. Logging: every public method logs at `debug` level its argv + duration; errors at `warn`.
5. Vitest spec `window-discovery.test.ts`:
   - Mock `execFile` via `vi.mock('node:child_process')` returning canned stdout strings (the spike captured real outputs we paste in as fixtures).
   - Tests: `listAllWindows` parses 3-line wmctrl output → 3 WindowInfo records with correct geometry; `snapshotWindowIds` returns Set with correct wids; `findWindowByTitle` polls and returns within budget; `findWindowByTitle` returns null after timeout; `findNewWindowMatching` skips baseline wids; `isWindowAlive` returns false when xprop exits non-zero; `getWindowGeometry` parses `--shell` format; `activateWindow` invokes wmctrl then xdotool.
   - Edge cases: empty stdout, wmctrl line with no title, xdotool returning multiple matches.

**Acceptance:**
- File exists with the 7 exported functions.
- Vitest passes for `window-discovery.test.ts` (≥ 8 cases).
- TypeScript strict mode happy (no `any` in public types).
- Logging uses livinityd's existing logger (whatever the rest of `modules/webapps/` uses).

**Verify:**
- `npm test --filter livinityd -- window-discovery` exits 0.
- Sacred SHA verify.
- Grep `from ['"](child_process)['"]` shows only `execFile` import (no `exec`).

**Commit:**
```
feat(93-01): window-discovery xdotool/wmctrl/xprop wrappers + tests
```

---

## Task 93-02 — `x11vnc-spawn.ts` (or fallback streamer) + tests

**Goal:** Spawn + supervise ONE streamer process per webapp (whichever T93-00 picked). Spawn the websockify companion. Expose a `StreamerHandle` with `kill()` + status events.

**Inputs:**
- T93-00 picked streamer.
- T93-01 `getWindowGeometry` (only needed if streamer is ffmpeg or maim-loop).

**Action:**

1. Create `livos/packages/livinityd/source/modules/webapps/x11vnc-spawn.ts`. (File name keeps "x11vnc" even if streamer ends up ffmpeg/maim — historical consistency with DRAFT §5; document the actual streamer in a top-of-file comment + the SUMMARY.)
2. Exports:
   - `interface StreamerHandle { wid: number; vncPort: number; wsPort: number; pid: number; wsPid: number; kill(): Promise<void>; on(event: 'exit' | 'error', listener: (...args: any[]) => void): this; }`
   - `async function spawnStreamer(opts: { wid: number; vncPort: number; wsPort: number; geometry?: { x; y; w; h } }): Promise<StreamerHandle>`
3. Implementation per picked streamer:
   - **x11vnc path:** `x11vnc -id <wid> -rfbport <vncPort> -localhost -shared -forever -noxdamage -wait 50 -nopw -quiet`. Then `websockify <wsPort> localhost:<vncPort>`. Both as detached child processes; pipe stderr to logger.
   - **ffmpeg path:** `ffmpeg -f x11grab -framerate 15 -video_size ${w}x${h} -i :0.0+${x},${y} -f mjpeg -qscale:v 5 -listen 1 http://localhost:<vncPort>` (MJPEG over HTTP). `websockify` not needed for HTTP streams; document that gateway middleware proxies HTTP for ffmpeg path. (Pivot the middleware accordingly in T93-04.)
   - **maim-loop path:** Node child process running a 100ms `maim -i <wid> -` capture loop, piping JPEG bytes into a TCP server on `vncPort` framed as MJPEG. Websockify wraps that.
4. `kill()` sends SIGTERM, waits 2s, escalates to SIGKILL. Cleans up both child processes deterministically. Removes the handle from any caller-registered map via the `exit` event.
5. Restart-on-crash policy: NONE in this module. The window-manager (T93-03) decides whether a crash means tear-down or respawn. Streamer just emits `exit`.
6. Vitest spec `x11vnc-spawn.test.ts`:
   - Mock `child_process.spawn` to return EventEmitter stubs.
   - Tests: spawnStreamer returns a handle with the right ports + pids; `kill()` sends SIGTERM then resolves on exit; `kill()` escalates to SIGKILL after 2s if process doesn't exit; `exit` event re-emits from underlying child; spawning ffmpeg path uses geometry; spawning x11vnc path does not require geometry.
   - Use Vitest fake timers for the SIGKILL-escalation timing.
7. NO live integration test in this task — that lives in P98 UAT. Mocked unit coverage only.

**Acceptance:**
- `x11vnc-spawn.ts` exists, exports the two surface items above.
- Streamer commands reflect T93-00's pick (top-of-file comment names which one).
- Vitest green (≥ 6 cases).

**Verify:**
- `npm test --filter livinityd -- x11vnc-spawn` exits 0.
- Sacred SHA verify.

**Commit:**
```
feat(93-02): streamer spawn module (<STREAMER>) + websockify wrap + tests
```

---

## Task 93-03 — `WebAppWindowManager` class + Redis port allocator + tests

**Goal:** The orchestrator. Composes `window-discovery` + `x11vnc-spawn` + the Redis port pool into the `spawn / focus / close / list` surface. Owns the in-memory `Map<webappId, ActiveWebApp>` and the idle-cleanup poller.

**Inputs:**
- T93-01, T93-02 land first.
- ioredis instance from livinityd (existing).

**Action:**

1. Create `livos/packages/livinityd/source/modules/webapps/window-manager.ts`. Two exports: the class and a helper `getOrInitPortPools(redis): Promise<void>` that idempotently seeds `liv:webapp:ports:vnc` (14200-14999) and `liv:webapp:ports:ws` (14000-14199) on first boot.
2. Class shape (high-level — no implementation in this doc; Claude implements):
   - `constructor(deps: { redis: Redis; logger: Logger; chromeBin?: string; })` — chromeBin defaults to `'google-chrome'`.
   - `async spawn({ userId, webappId, url, expectedTitle }): Promise<{ vncWsUrl: string; windowId: number; port: number }>`:
     1. Idempotency: if `webapps.get(webappId)` is alive (isWindowAlive), return existing handle's wsUrl + return early — don't re-spawn (D-93-08, S2b).
     2. Snapshot wid baseline.
     3. `child_process.spawn('google-chrome', ['--new-window', url], { detached: true, stdio: 'ignore' })` and `unref()` — Chrome runs free-standing, NOT a livinityd child.
     4. Find new window via `findNewWindowMatching({ titleHints: [hostname(url), expectedTitle], baselineWids })` with 5s timeout.
     5. On timeout: throw `{ code: 'WINDOW_NOT_FOUND', url }`.
     6. `vncPort = await redis.spop('liv:webapp:ports:vnc')`; `wsPort = await redis.spop('liv:webapp:ports:ws')`. If either returns null → throw `{ code: 'PORT_EXHAUSTED' }` and release whichever did succeed.
     7. `geometry = await getWindowGeometry(wid)` (only needed if streamer needs it).
     8. `handle = await spawnStreamer({ wid, vncPort, wsPort, geometry })`.
     9. Wire `handle.on('exit', () => this.handleStreamerExit(webappId))`.
     10. Store `{ webappId, userId, wid, vncPort, wsPort, handle, lastSeen: Date.now() }` in the map.
     11. Return `{ vncWsUrl: '/webapp-vnc/' + webappId, windowId: wid, port: wsPort }`.
   - `async focus({ webappId }): Promise<{ ok: true } | { code: 'WINDOW_GONE' }>`:
     1. Look up active record; if absent → `WINDOW_GONE`.
     2. `isWindowAlive(wid)`; if false → tear down + `WINDOW_GONE`.
     3. `activateWindow(wid)` → return `ok`.
   - `async close({ webappId, killWindow }): Promise<void>`:
     1. Look up record (return early if absent).
     2. `await handle.kill()`.
     3. Release ports back to Redis SETs.
     4. If `killWindow` → `xdotool windowkill <wid>` via discovery wrapper.
     5. Remove from map.
   - `list({ userId }): Array<{ webappId; windowId; port; status: 'alive'|'streamer-down' }>`:
     1. Iterate map filtered by userId. For each, current `isWindowAlive` reflects status. Cheap O(n) — caller is tRPC, not hot-path.
   - `private async handleStreamerExit(webappId)`:
     1. Tear down (release ports, remove from map). DO NOT respawn — user's window-close is intentional. Frontend (P95) will see the WS drop and prompt user.
   - `private startIdleCleanup()` (called in constructor):
     1. `setInterval(this.idleTick, 5000)` (D-93-05).
     2. `idleTick` iterates map; for each: `isWindowAlive(wid)`. If false → `close({ webappId })`.
3. Vitest spec `window-manager.test.ts`:
   - Mock the discovery + streamer modules + ioredis (use `ioredis-mock`).
   - Tests:
     - `spawn` happy path: returns expected shape; map populated; ports allocated from Redis SETs (verify SET cardinality decreases by 1 each).
     - `spawn` is idempotent — second call with same `webappId` returns the existing handle without calling `spawnStreamer` twice.
     - `spawn` window-not-found: discovery returns null after timeout → throws `WINDOW_NOT_FOUND`.
     - `spawn` port-exhausted: pool empty → throws `PORT_EXHAUSTED` and releases any half-allocated port.
     - `focus` happy path → `activateWindow` called once.
     - `focus` when wid dead → returns `WINDOW_GONE` and tears down the entry.
     - `close` releases ports back to pool (Redis SET cardinality restored).
     - `close({ killWindow: true })` invokes `xdotool windowkill`.
     - `list` filters by userId.
     - Idle-cleanup tick: window-gone → `close()` called → record removed (use vi fake timers + manual advance).
   - Concurrent allocation: 50 parallel `spawn`s allocate 50 distinct ports (use `Promise.all` + Redis-mock).

**Acceptance:**
- `window-manager.ts` exists with the class + helper.
- `getOrInitPortPools` is idempotent (calling twice doesn't double-seed).
- Vitest green (≥ 11 cases).
- TS strict mode happy.

**Verify:**
- `npm test --filter livinityd -- window-manager` exits 0.
- Sacred SHA verify.
- Grep `liv:webapp:ports:` shows only the two whitelisted keys (`vnc`, `ws`).

**Commit:**
```
feat(93-03): WebAppWindowManager + Redis port allocator + idle cleanup + tests
```

---

## Task 93-04 — `webapp-gateway-middleware.ts` (Express WebSocket proxy) + tests

**Goal:** Mount `/webapp-vnc/:webappId` on the livinityd Express app. JWT-auth the upgrade. Resolve `(webappId, currentUser.id)` → wsPort via the WebAppWindowManager. Proxy the WebSocket upgrade to `localhost:<wsPort>`.

**Inputs:**
- T93-03 manager surface (`list({ userId })` is enough — adds a `getHandleFor(userId, webappId)` helper if needed).
- Existing livinityd JWT middleware.

**Action:**

1. Create `livos/packages/livinityd/source/server/webapp-gateway-middleware.ts`. Export `function createWebappGatewayMiddleware(opts: { manager: WebAppWindowManager; verifyJwt: (req) => Promise<{ userId: string } | null> }): RequestHandler`.
2. Implementation:
   - On GET `/webapp-vnc/:webappId` with `upgrade: websocket`:
     1. `verifyJwt(req)` → if null, respond 401.
     2. `manager.list({ userId }).find(w => w.webappId === webappId)` — if absent, 404.
     3. Verify the webapp belongs to currentUser (already done by list filter, but assert too).
     4. Use `http-proxy` (existing dep, fall back to `node-http-proxy` or hand-rolled if not present) to proxy WS upgrade to `ws://localhost:<wsPort>`.
   - For non-WS GET (browser hits the URL directly): respond 426 Upgrade Required + JSON body explaining usage.
3. If the picked streamer is **ffmpeg-MJPEG** (T93-00 fallback (a)): also handle non-WS GET — proxy to `http://localhost:<vncPort>` and return raw MJPEG. Two code paths, branch on streamer-mode constant exported by `x11vnc-spawn.ts`.
4. Mount in livinityd's existing Express server entry — locate the file (likely `livos/packages/livinityd/source/server/index.ts`), add ONE `app.use(createWebappGatewayMiddleware({ manager, verifyJwt }))` line. Edit only that line.
5. Add the four tRPC routes (`webapps.spawn`, `.focus`, `.close`, `.list`) to the existing P92 router. Each is a thin wrapper around the manager. Add them to `httpOnlyPaths` in `common.ts` (memory note — long-running routes hang if WebSocket-routed).
6. Vitest spec `webapp-gateway-middleware.test.ts`:
   - Use `supertest` + a stub manager.
   - Tests:
     - Unauthenticated upgrade request → 401.
     - Authenticated user requesting a webapp not in their `list` → 404.
     - Authenticated user requesting their own webapp → upgrade is proxied (mock the proxy lib, assert it was called with `localhost:<expectedWsPort>`).
     - Non-WS GET → 426 with informative body.
     - tRPC route `webapps.spawn` calls `manager.spawn(...)` with `userId = ctx.currentUser.id` (not the user-provided one — guard against forgery).
     - tRPC route `webapps.list` returns only the current user's webapps.

**Acceptance:**
- Middleware file + integration into Express entry.
- tRPC router gains four methods; `httpOnlyPaths` updated.
- Vitest green (≥ 6 cases).

**Verify:**
- `npm test --filter livinityd -- webapp-gateway-middleware` exits 0.
- `grep -n "httpOnlyPaths" livos/packages/livinityd/source/.../common.ts` includes the four new paths.
- Sacred SHA verify.

**Commit:**
```
feat(93-04): /webapp-vnc gateway middleware + tRPC spawn/focus/close/list
```

---

## Task 93-05 — Auth + scope hardening pass + threat sweep

**Goal:** Tighten the auth boundary BEFORE T93-06 lands a working integration. Cheap to do now; expensive after the surface is exposed.

**Inputs:** T93-04 lands.

**Action:**

1. Read every `webappId` lookup path; prove `userId` is sourced from `ctx.currentUser.id` and never from the request body / query / params. Add an explicit assertion at each entry point: `if (input.userId && input.userId !== ctx.currentUser.id) throw new TRPCError({ code: 'FORBIDDEN' })`.
2. Verify `findWindowByTitle` cannot be tricked into matching a window owned by a different process the user does not own (it can't — wid is OS-level on a single-user host — but document the assumption in a top-of-file comment).
3. Verify `xdotool windowkill <wid>` only fires when the wid is one we previously spawned (i.e. the wid is in the manager map for the calling user). Do NOT accept arbitrary wids from the client.
4. Verify the gateway middleware does not log JWT contents at any level.
5. Run a STRIDE checklist over the new surface:
   - **S** poofing: JWT auth on every endpoint? ✓ via existing livinityd middleware.
   - **T** ampering: does `webappId` flow through any unsanitized exec? It does NOT — webappId is used only for Postgres lookup + map key, never injected into shell. ✓
   - **R** epudiation: do we log every spawn/close at INFO with userId + webappId? Add if missing.
   - **I** nfo disclosure: `/webapp-vnc/<webappId>` returns 404 not 403 for "wrong user" cases (avoid revealing existence). ✓ (list-filter approach above).
   - **D** oS: port pool is finite (1000 VNC + 200 WS). Document that a malicious user spawning 1000 webapps DoSes themself; v33 single-user makes this acceptable. Cap at 50 active per user via a soft check in `manager.spawn` (return `{ code: 'TOO_MANY_WEBAPPS' }` if `list({ userId }).length >= 50`).
   - **E** levation of privilege: middleware double-check — does it ever bypass JWT for the websocket upgrade? Some Express WS setups have a quirk where upgrade events skip middleware; verify the upgrade handler runs JWT auth.
6. Tests: add 3 cases — body-userId-forgery rejected, kill-arbitrary-wid rejected, 50-webapp cap.

**Acceptance:**
- The seven STRIDE bullets above are each addressed in code or in a SUMMARY entry justifying acceptance.
- Three new test cases green.
- No regressions in T93-01..04 specs.

**Verify:**
- Full vitest run for the four module specs exits 0.
- Sacred SHA verify.

**Commit:**
```
chore(93-05): auth + scope hardening, STRIDE sweep, 50-webapp cap
```

---

## Task 93-06 — Live integration smoke (single Chrome window end-to-end on Mini PC)

**Goal:** First end-to-end: livinityd running on the Mini PC with the new code → curl-based tRPC `webapps.spawn` → confirm a Chrome window appears, x11vnc starts, websockify is reachable on the assigned port. This is local-only verification (no LivOS frontend yet — that's P95).

**Inputs:** T93-00..05 land. Mini PC reachable.

**Action:**

1. Build livinityd locally. Confirm `dist/` (or tsx-runnable) artifacts work.
2. SSH the dev branch to the Mini PC's `/tmp/livos-p93/` (rsync, no `update.sh` for the smoke — we don't want to disturb the running production install). Reuse production's Redis + Postgres credentials read-only via env override.
3. Start a sidecar livinityd on a non-prod port (e.g. 8081) bound to 127.0.0.1 with the new code. Inherit the production JWT secret.
4. Manually obtain a JWT for `bruce`; curl `POST /trpc/webapps.spawn` with `{ webappId: <test>, url: 'https://example.com', expectedTitle: 'Example Domain' }`.
5. Expect: HTTP 200 with `{ vncWsUrl, windowId, port }`. Confirm a real Chrome window opened (visible in `wmctrl -l`). Confirm x11vnc / fallback streamer is running (`pgrep -af x11vnc` or `pgrep -af ffmpeg`).
6. Use `wscat` (or a minimal Node WS client) to connect to `ws://127.0.0.1:8081/webapp-vnc/<webappId>` with the JWT cookie. Expect WS handshake success.
7. `webapps.close` → confirm streamer process gone, port returned to Redis pool (`SCARD liv:webapp:ports:vnc`).
8. Smoke for the 50-webapp cap from T93-05: spam 51 spawns (different webappIds with different test URLs that share the host) → 51st returns `TOO_MANY_WEBAPPS`. Cleanup all.
9. Smoke for the idle-cleanup poller: spawn one, manually `xdotool windowkill` the resulting Chrome window, wait 6s, verify the manager tore down the streamer + released the port.
10. Document outcomes in `93-SMOKE.md` (paste curl outputs, port allocation snapshots, x11vnc log tails). Do NOT touch production livinityd.
11. Run all this via ONE batched ssh invocation per ZeroTier note (assemble a shell script, ship it, run with nohup, poll the log).

**Acceptance:**
- `93-SMOKE.md` exists with eight checked-off steps and concrete evidence for each.
- No production livinityd touched. (Verify `systemctl status livos.service` start-time unchanged.)
- All sidecar processes killed at end of smoke.

**Verify:**
- `93-SMOKE.md` mentions "production untouched" with timestamp evidence.
- Sacred SHA verify.

**Commit:**
```
chore(93-06): Mini PC live smoke — spawn/focus/close/idle-cleanup verified
```

---

## Task 93-07 — Documentation, env requirements, deploy notes

**Goal:** Package what an operator needs to know before P95 enables this for real users. No code in this task — only docs.

**Inputs:** T93-06 evidence.

**Action:**

1. Append to `livos/packages/livinityd/README.md` (or create `docs/webapp-window-manager.md` if README would balloon): one section "WebApp Window Manager" with:
   - Required host binaries + minimum versions (captured in T93-00 spike).
   - Env variables (none new beyond `REDIS_URL` already existing).
   - Redis keys created (`liv:webapp:ports:vnc`, `liv:webapp:ports:ws`) — both are SETs with finite pre-seeded ranges.
   - Failure modes operators may see: `WINDOW_NOT_FOUND`, `PORT_EXHAUSTED`, `TOO_MANY_WEBAPPS`, `STREAMER_CRASHED` (logged when `handle.on('exit')` fires unexpectedly).
   - Restart behavior: if livinityd restarts mid-stream, in-memory map is lost; orphaned x11vnc / websockify processes need cleanup. T93-08 covers a one-shot reaper script.
2. Update `update.sh` ONLY IF a new system dep was confirmed missing in T93-00. If `x11vnc`, `websockify`, etc. are already on the Mini PC, skip. Document in SUMMARY which (if any) were missing and how the operator should install. Do NOT auto-install via `apt` from update.sh — that's outside the script's surface.
3. Update memory: add a brief `feedback_p93_streamer.md` (or extend existing `reference_minipc.md`) with the picked streamer + reasoning. Helps future phases not re-litigate the choice.

**Acceptance:**
- Doc section exists, references T93-00 spike artifact.
- Memory note updated with streamer choice.
- No code changes (or only update.sh if a dep was genuinely missing).

**Verify:**
- `grep "WebApp Window Manager"` finds the new section.
- Sacred SHA verify.

**Commit:**
```
docs(93-07): WebApp window manager operator notes + memory update
```

---

## Task 93-08 — Orphan reaper + phase rollup + SUMMARY

**Goal:** Ship the safety net for restart-orphan x11vnc / websockify processes, write `93-SUMMARY.md`, update STATE.

**Inputs:** Everything else.

**Action:**

1. Add to `window-manager.ts` (or a sibling `orphan-reaper.ts`) a startup hook: on `WebAppWindowManager` construction, scan for orphaned x11vnc / ffmpeg / websockify processes that match our argv signature (e.g. `x11vnc -id <wid>` with rfbport in 14200-14999) but are NOT in any current map. SIGTERM them and release the corresponding ports back to the Redis SET (idempotent — `SADD` only if not already in set).
2. Run on every livinityd boot (cheap; runs once).
3. Vitest case: mock `ps` output with two orphaned processes — confirm reaper signals both and re-adds both ports to the SET.
4. Write `.planning/phases/93-window-manager/93-SUMMARY.md` covering:
   - Files created (paths + line counts).
   - Tests added (count + file:test-name).
   - Streamer picked + spike evidence.
   - Decisions diff vs CONTEXT (any drift documented).
   - Open carryovers for P95 / P97 / P98 (e.g. "live UAT for 2-hour-stream stability deferred to P98").
   - Sacred SHA start + end.
   - One-paragraph hand-off to P95.
5. Update `STATE.md` Phase 93 → done. Update `ROADMAP.md` checkbox.

**Acceptance:**
- Orphan reaper runs on boot, vitest covers it.
- `93-SUMMARY.md` exists with all sections above.
- `STATE.md` + `ROADMAP.md` updated.

**Verify:**
- `npm test --filter livinityd -- orphan-reaper` exits 0.
- `grep "Phase 93" .planning/STATE.md` shows current status.
- Sacred SHA verify.

**Commit:**
```
feat(93-08): orphan reaper + phase 93 SUMMARY + state update

Phase: 93-window-manager
Wave: 1 (parallel with P92)
Sacred SHA f3538e1d UNTOUCHED.
Carryovers documented for P95 / P97 / P98.
```

---

## Phase verification gates (must all pass before declaring P93 done)

| Gate | Method | Pass |
|------|--------|------|
| Spike artifact | `test -f .planning/phases/93-window-manager/93-SPIKE.md && grep -q "Picked streamer" .planning/phases/93-window-manager/93-SPIKE.md` | exit 0 |
| Live smoke artifact | `test -f .planning/phases/93-window-manager/93-SMOKE.md` | exit 0 |
| All four module tests | `npm test --filter livinityd -- window-discovery x11vnc-spawn window-manager webapp-gateway-middleware orphan-reaper` | exit 0 |
| Build | `npm run build --filter livinityd` | exit 0 |
| Sacred SHA | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` | == `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Redis prefix sweep | `grep -rE "liv:(webapp|webapps):" livos/packages/livinityd/source/modules/webapps livos/packages/livinityd/source/server/webapp-gateway-middleware.ts` returns only `liv:webapp:ports:vnc`, `liv:webapp:ports:ws`, and (P92) `liv:webapp:cache:*` | manual review |
| Sacred file no-touch | `git diff --name-only master..HEAD -- liv/packages/core/` returns empty | exit 0 |
| Production untouched | T93-06 SMOKE.md asserts `systemctl status livos.service` start-time unchanged | manual review |

---

## Roll-up commit message (final, after T93-08)

```
feat(93): WebApp window manager + per-window VNC stream (Phase 93)

Wave 1 of v33. Parallel with P92 metadata extractor.

What landed:
- Streamer spike: picked <STREAMER> on Mutter (93-SPIKE.md)
- window-discovery.ts: xdotool/wmctrl/xprop typed wrappers
- x11vnc-spawn.ts: streamer + websockify supervision
- window-manager.ts: WebAppWindowManager class + Redis port pool +
  idle cleanup poller + orphan reaper
- webapp-gateway-middleware.ts: /webapp-vnc/:webappId WS upgrade proxy
- tRPC: webapps.{spawn,focus,close,list}; httpOnlyPaths updated
- 50-webapp soft cap, STRIDE sweep applied
- Live smoke on Mini PC sidecar (93-SMOKE.md)
- Operator docs + memory update

Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNTOUCHED.
No Docker, no broker edits, no liv/packages/core/ edits.

Carryovers (P95 / P97 / P98):
- VNC client wired in P95 (react-vnc / @novnc/novnc)
- bytebot --window <wid> scoping in P97
- Multi-hour stream stability UAT in P98
```

NOT pushed.
