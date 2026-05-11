# Phase 102: Per-App Display Pivot — CONTEXT

**Gathered:** 2026-05-11 (post Phase 101 deploy + user UAT correction)
**Status:** Ready for planning (`/gsd-plan-phase 102 --chain` or `/gsd-autonomous --only 102`)
**Parent:** `101-CONTEXT.md` (the architecture Phase 102 corrects)
**Trigger:** User UAT 2026-05-11 verbatim:

> "Yeni screen derken ayri Xvfb display mi istiyorsun **evet**. Abi ayri displayde sorunumu nasil cozersin iyice arastir! Cunku olmasi lazim bunun. Ayni screen de iki farkli yayin yapiyorsun ustuste bindiginde sorun cikiyor. Luse duzgun kullanamiyor ayrica luse ssleri 1920x1080 aliyor bizim screen res farkli mk bir duzgun calismiyor. Ama selfClaude da baya iyi calisiyordu!"

Translation: Per-app dedicated Xvfb display REQUIRED. Same-screen multi-stream causes overlap problems. Luse screenshots come back at 1920x1080 even though target screen is different resolution → tool calls miss. SelfClaude reference works well — adopt its pattern.

---

## What Phase 101 Got Wrong

| Pillar | Phase 101 design | What user actually wanted | Phase 102 fix |
|--------|------------------|---------------------------|---------------|
| A — One Chrome | Single `:1` master + CDP multi-target | **Per-app Xvfb display, isolated Chrome per app** | Per-app Xvfb `:10..:99` + per-app Chrome process |
| Streaming | x11vnc `-id <wid>` (window region capture) | **x11vnc whole-display capture (each display = 1 app)** | x11vnc `-display :N` (entire Xvfb display) |
| Window overlap | Cascade offsets on `:1` | **Zero overlap — separate Xvfb displays** | Display isolation = no overlap by design |
| Luse coords | 1920x1080 (`:1` resolution) → coord drift | **1280x720 (per-app display res)** → 1:1 mapping | `LUSE_TARGET_DISPLAY=:N` env scopes screenshot/click to :N |
| Profile | Shared `--user-data-dir` (singleton lock = single process forced) | **Same logical login across apps, but per-app Chrome process** | Master profile seed-copy at spawn |

Phase 101's CDP-on-:1 + WID-filter approach was **wrong**. The user already saw SelfClaude work with per-app Xvfb + per-app Chrome and explicitly cited it as the working pattern. Phase 102 adopts it.

---

## Locked Decisions (D-102-*)

### D-102-PER-APP-XVFB — Per-app Xvfb display

- **Each app spawn → dedicated Xvfb display** at 1280x720x24 resolution
- Display number range `:10..:99` (90 slots, matching PortAllocator capacity)
- Xvfb args: `Xvfb :N -screen 0 1280x720x24 -ac -nolisten tcp`
- Optional fluxbox WM on display for window decoration/focus management (lightweight)
- Spawn order: Xvfb first → wait for `:N` ready (`xdpyinfo -display :N` polls 200ms) → fluxbox → Chrome

### D-102-DISPLAY-ALLOCATOR — DisplayAllocator class

- Companion to existing PortAllocator (101-02)
- `allocate(): number` returns next free display number from `[10, 100)` range
- `release(n: number): void` returns the number to the pool
- Linear-walker pattern matching PortAllocator
- 90 concurrent slots → matches PortAllocator's 100-slot cap (with headroom)

### D-102-PER-APP-CHROME — Per-app Chrome process

- **Each app gets its own Chrome process with own `--user-data-dir`**
- Path: `/tmp/livos-chrome-app-<uuid>` (ephemeral, app-scoped)
- Chrome args: `chrome --user-data-dir=/tmp/livos-chrome-app-<uuid> --no-first-run --no-default-browser-check --start-fullscreen --app=<URL>`
- `DISPLAY=:N` env scopes the Chrome process to its dedicated Xvfb
- `--app=<URL>` flag = chromeless mode (no tabs, no address bar — full content area)
- `--start-fullscreen` = covers the entire 1280x720 Xvfb canvas → user sees pure app content
- Singleton lock isolated per `--user-data-dir` → multiple Chrome processes coexist without IPC conflicts

### D-102-MASTER-PROFILE-SEED — Master profile seed-copy

- **Master profile lives at `/opt/livos/data/chrome-master/`** (livos data volume — persistent)
- User logs in once via the Master Login flow (see D-102-MASTER-LOGIN-UI)
- On every app spawn: `cp -r /opt/livos/data/chrome-master /tmp/livos-chrome-app-<uuid>` (≈10MB, ~200ms)
- Per-app Chrome inherits Google login state (Cookies, Login Data, Local State) from master
- Per-app sessions are independent — auth writes in app A don't propagate to app B or back to master (one-way inheritance)
- App close → `rm -rf /tmp/livos-chrome-app-<uuid>` (master untouched)

### D-102-MASTER-LOGIN-UI — Master Chrome Login flow

- New affordance in LivOS Settings → "Chrome Master Login"
- Click → livinityd spawns master Chrome on `bruce` user's primary `:0` display (the physical screen) with `--user-data-dir=/opt/livos/data/chrome-master`
- User logs into Google, configures extensions, closes Chrome normally
- Logged-in state persists in master profile dir → all subsequent app spawns inherit
- "Re-login" / "Reset Master Profile" affordances for clearing or refreshing

### D-102-X11VNC-WHOLE-DISPLAY — x11vnc captures entire display

- Phase 99 baseline `-id <wid>` window-region capture **REPLACED** by `-display :N` whole-screen capture
- x11vnc args: `x11vnc -display :N -rfbport <port> -shared -forever -nopw -quiet -noxdamage`
- Output stream dimensions = Xvfb dimensions = 1280x720 (exact match)
- No window-coord translation, no WM_CLASS filtering, no WID polling for streaming
- One-to-one: display N ↔ stream port N ↔ Chrome process N ↔ LivOS UI stream window N

### D-102-LUSE-DISPLAY-SCOPING — Luse MCP per-display routing

- Per-WebApp Luse MCP instance (existing pattern from 100-10-04) gets `LUSE_TARGET_DISPLAY=:N` env override (replacing `LUSE_TARGET_WINDOW_ID`)
- All Luse tool calls (`computer_screenshot`, `computer_click_mouse`, etc.) implicitly target `:N` display via `$DISPLAY` env
- `screenshot_window` → captures :N entirely (1280x720 exact)
- `computer_click_mouse(x, y)` → coordinates relative to :N's 1280x720 canvas (no offset, no scaling)
- `list_windows` → only enumerates windows on :N (since Luse is scoped to that display)
- Global `luse` instance (no scope) keeps existing behavior — sees all displays for system-level inspection

### D-102-CLOSE-LIFECYCLE — Clean shutdown

- App close (user clicks X on LivOS stream window OR programmatic):
  1. Send SIGTERM to Chrome → wait 2s for graceful exit
  2. Send SIGKILL to Chrome if still alive
  3. Send SIGTERM to x11vnc (`pkill -f "x11vnc.*:N"`)
  4. Send SIGTERM to Xvfb (`pkill -f "Xvfb :N"`)
  5. `rm -rf /tmp/livos-chrome-app-<uuid>`
  6. DisplayAllocator.release(N)
  7. PortAllocator.release(port)
  8. Remove LivOS stream window from UI
- All steps idempotent — re-running on already-cleaned state is no-op

### D-102-NATIVE-APP-PARITY — Same architecture for native apps

- Ubuntu native binaries (101-03) use **identical** flow:
  1. DisplayAllocator → :N
  2. Xvfb :N -screen 0 1280x720x24
  3. fluxbox -display :N (needed for native apps that expect WM — Antigravity, VSCode, etc.)
  4. PortAllocator → port
  5. x11vnc -display :N -rfbport <port>
  6. DISPLAY=:N <binary> (with detached:true, captured stderr)
  7. LivOS stream window mounts to ws://localhost:<port>
- No profile seeding (native apps manage own state) — only WebApps get master-seed copy
- Same close lifecycle

### D-102-SACRED — Sacred SHA preserved

- `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED
- Pre-commit hook enforces (already live)
- NEVER `--no-verify` except in parallel worktree mode (orchestrator validates after merge)

### D-102-NO-SERVER4 — Mini PC only

- Deploy target `bruce@10.69.31.68` only
- Server4 + Server5 off-limits for LivOS work

### D-102-PHASE-101-SALVAGE — What Phase 101 work is retained

Phase 101 ships 9 plans (101-00..101-09). Phase 102 reuses ~70%:

| Plan | Phase 101 deliverable | Phase 102 status |
|------|----------------------|------------------|
| 101-00 | Wave 0 stubs | ✅ Keep (extend with new test stubs) |
| 101-01 | ChromeCdpClient | ⚠️ Optional — per-app Chrome can use own CDP port if Luse needs CDP control. v1 doesn't need CDP — use direct subprocess. Code kept but not wired by default. |
| 101-02 | PortAllocator | ✅ Keep (DisplayAllocator companion added) |
| 101-03 | NativeAppSpawner | ✅ Keep (extend with Xvfb + display scoping) |
| 101-04 | CDP-driven WebApp spawn | ❌ **Replaced** — new spawn path: per-app Xvfb + Chrome subprocess (no CDP) |
| 101-05 | Native app stream binder | ✅ Keep (now binds to :N display, not WM_CLASS WID) |
| 101-06 | Luse auto-context | ✅ Keep (env switch from LUSE_TARGET_WINDOW_ID to LUSE_TARGET_DISPLAY) |
| 101-07 | Dock native UI | ✅ Keep |
| 101-08 | SelfClaude Teach v3 | ✅ Keep (UI-tier, backend-agnostic) |
| 101-09 | Chat anims + Hermes relay | ✅ Keep |
| 101-10 | Mini PC UAT 20-row | ❌ Replaced by 102-10 (new UAT matrix for per-display) |

### D-102-BACKWARDS-COMPAT — v33 WebApps still work

- Existing WebApp configs (from v33) need migration:
  - Pre-102: window opened on shared `:1` via window-manager CDP
  - Post-102: window opens on dedicated Xvfb via window-manager XvfbSpawn flow
- Migration: zero data loss. Re-opening any WebApp icon spawns via new flow automatically.
- v2 (interval-based) and v3 (action-driven) Teach skills replay path unchanged — Luse coord changes are absorbed by display scoping.

---

## Sub-Plan Decomposition (10 plans, 4 waves, parallel-friendly)

### Wave 1 — Foundation (3 plans, PARALLEL — file-disjoint)

| Plan | Title | Files | Tasks | Autonomous |
|------|-------|-------|-------|-----------|
| **102-01** | DisplayAllocator + XvfbSpawner | `streaming/display-allocator.{ts,test.ts}`, `streaming/xvfb-spawner.{ts,test.ts}`, `streaming/index.ts` | 5 | yes |
| **102-02** | ChromeProcessSpawner (per-app subprocess + --app=URL) | `webapps/chrome-process-spawner.{ts,test.ts}`, `webapps/index.ts` | 4 | yes |
| **102-03** | MasterProfileSeeder (cp -r master → app dir) | `chrome-master/profile-seeder.{ts,test.ts}`, `chrome-master/index.ts`, `livinityd/source/index.ts` boot wire (ensure `/opt/livos/data/chrome-master/` exists) | 4 | yes |

### Wave 2 — Wire-up (3 plans, PARALLEL — file-disjoint)

| Plan | Title | Files | Tasks | Autonomous | Deps |
|------|-------|-------|-------|-----------|------|
| **102-04** | Window-manager rewrite (display + chrome process + x11vnc orchestrator) | `webapps/window-manager.ts` (rewrite spawn body), `window-manager.test.ts` | 6 | yes | 102-01, 102-02, 102-03 |
| **102-05** | Native-app-binder display swap | `apps/native-app-binder.{ts,test.ts}` (use DisplayAllocator + Xvfb instead of WM_CLASS) | 4 | yes | 102-01 |
| **102-06** | Luse env switch (LUSE_TARGET_DISPLAY) | `ai/agent-prompt-builder.ts` + test (display-aware snippet), `livinity-broker/agent-runner-factory.ts` (env propagation), `computer-use/mcp/server.ts` (DISPLAY env handling), `webapps/luse-mcp-descriptor.ts` | 5 | yes | none |

### Wave 3 — UI + Lifecycle (3 plans, PARALLEL — file-disjoint)

| Plan | Title | Files | Tasks | Autonomous | Deps |
|------|-------|-------|-------|-----------|------|
| **102-07** | Master Chrome Login UI | `ui/src/modules/settings/master-chrome-login.tsx` + test, `livinityd/.../chrome-master/master-login-routes.ts` (tRPC) | 5 | yes | 102-03 |
| **102-08** | App close lifecycle (clean Chrome+x11vnc+Xvfb+temp dir) | `webapps/window-manager.ts` close path, `apps/native-app-binder.ts` close path, tests | 4 | yes | 102-04, 102-05 |
| **102-09** | x11vnc whole-display rewrite (-display :N replaces -id <wid>) | `streaming/vnc-bridge.ts` (rewrite spawn args), `streaming/stream-manager.ts` (display-target type variant), tests | 5 | yes | 102-01 |

### Wave 4 — Deploy + UAT (1 plan, user-walked)

| Plan | Title | Files | Tasks | Autonomous |
|------|-------|-------|-------|-----------|
| **102-10** | Mini PC deploy + 25-row UAT walk | ROADMAP.md, STATE.md, `102-UAT-CHECKLIST.md`, PHASE-SUMMARY.md | 6 | **no** |

**Dependency graph:**

```
Wave 1 (parallel):
  102-01 (DisplayAllocator + Xvfb) ──┐
  102-02 (Chrome subprocess) ────────┼──→ Wave 2 (parallel):
  102-03 (Master profile seed) ──────┘    102-04 (window-manager rewrite) ──┐
                                          102-05 (native binder) ───────────┤
                                          102-06 (Luse display scoping) ────┤
                                                                            ├──→ Wave 3 (parallel):
                                                                            │    102-07 (Master Login UI) ──┐
                                                                            │    102-08 (close lifecycle) ──┤
                                                                            │    102-09 (x11vnc -display) ──┤
                                                                            │                              ├──→ Wave 4:
                                                                            └──────────────────────────────┴──→ 102-10 (deploy + UAT)
```

**Estimated:** 10 plans × ~4 tasks each ≈ 35-40 atomic commits. Wave 1+2+3 parallel via worktrees: ~3-4 hours autonomous. User-walked Wave 4 ~30 min.

---

## Canonical References

### Parent context
- `.planning/phases/101-livos-universal-app-orchestration/101-CONTEXT.md` (the architecture being corrected)
- `.planning/phases/101-livos-universal-app-orchestration/101-RESEARCH.md` (CDP research — partially reusable for optional 102 CDP control)
- `.planning/phases/100-multi-stream-window-redesign/100-CONTEXT.md` (Phase 100 multi-stream baseline)
- `.planning/phases/100-multi-stream-window-redesign/100-10-CONTEXT.md` (per-WebApp Xvfb attempt that died from singleton lock — Phase 102's seed-copy fixes the very issue)
- `.planning/ROADMAP.md`

### External research (planner + researcher agents must consult)
- https://github.com/utopusc/selfclaude — SelfClaude reference. **VERIFIED WORKING** by user. Phase 102 adopts its per-app-profile pattern.
- https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/process_singleton_posix.cc — Chrome singleton lock implementation (justifies per-app-data-dir choice)
- https://www.x.org/releases/X11R7.7/doc/man/man1/Xvfb.1.xhtml — Xvfb manpage (per-app display creation)
- https://github.com/LibVNC/x11vnc — x11vnc `-display :N` whole-display capture mode

### Code paths to modify

**Wave 1:**
- NEW: `livos/packages/livinityd/source/modules/streaming/display-allocator.ts` (DisplayAllocator, range 10..100)
- NEW: `livos/packages/livinityd/source/modules/streaming/xvfb-spawner.ts` (Xvfb subprocess + readiness poll)
- NEW: `livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.ts` (Chrome subprocess with --app=URL --start-fullscreen --user-data-dir)
- NEW: `livos/packages/livinityd/source/modules/chrome-master/profile-seeder.ts` (cp -r master → /tmp/livos-chrome-app-<uuid>)
- MODIFIED: `livos/packages/livinityd/source/index.ts` (boot wire DisplayAllocator + ensure /opt/livos/data/chrome-master/ exists)

**Wave 2:**
- REWRITE: `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — spawn flow:
  1. DisplayAllocator.allocate() → N
  2. XvfbSpawner.start(N, 1280, 720)
  3. ProfileSeeder.seed(uuid) → /tmp/livos-chrome-app-<uuid>
  4. ChromeProcessSpawner.start(uuid, N, url)
  5. PortAllocator.allocate() → port
  6. VncBridge.startDisplay(N, port)
  7. Return {streamId, wsUrl, display: N, port}
- MODIFIED: `livos/packages/livinityd/source/modules/apps/native-app-binder.ts` (DisplayAllocator + XvfbSpawner instead of WM_CLASS polling)
- MODIFIED: `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` (Active Window Context → Active Display Context: `LUSE_TARGET_DISPLAY=:N + bounds=1280x720`)
- MODIFIED: `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` (propagate activeDisplay env to spawned Luse MCP instances)
- MODIFIED: `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` (read LUSE_TARGET_DISPLAY env, scope all X11 ops to it)
- MODIFIED: `livos/packages/livinityd/source/modules/webapps/luse-mcp-descriptor.ts` (env var name change)

**Wave 3:**
- NEW: `livos/packages/ui/src/modules/settings/master-chrome-login.tsx` (UI affordance)
- NEW: `livos/packages/ui/src/modules/settings/master-chrome-login.test.tsx`
- NEW: `livos/packages/livinityd/source/modules/chrome-master/master-login-routes.ts` (tRPC `chromeMaster.startLogin` / `.status` / `.reset`)
- MODIFIED: `livos/packages/livinityd/source/modules/webapps/window-manager.ts` close path (full lifecycle cleanup)
- MODIFIED: `livos/packages/livinityd/source/modules/apps/native-app-binder.ts` close path
- REWRITE: `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` (spawn x11vnc with `-display :N` instead of `-id <wid>` — D-99-01 baseline replaced)
- MODIFIED: `livos/packages/livinityd/source/modules/streaming/stream-manager.ts` (VncDisplayTarget type variant — already partially scaffolded by Phase 100-10-08)

**Wave 4:**
- MODIFIED: `.planning/ROADMAP.md` (Phase 102 entry flipped from `[ ]` to `[x]`)
- MODIFIED: `.planning/STATE.md` (current position post-102)
- NEW: `.planning/phases/102-per-app-display-pivot/UAT-CHECKLIST.md` (25-row walk)

### Locked constraint (NEVER touch)
- `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

---

## Success Criteria (UAT walk, 25 rows)

After 102-10 deploy:

| # | Test | Pass Criteria |
|---|------|---------------|
| 1 | LivOS Settings → "Chrome Master Login" exists | UI affordance visible in Settings |
| 2 | Click Master Login → Chrome opens on bruce's :0 desktop | Chrome window appears on physical screen with `/opt/livos/data/chrome-master/` user-data-dir |
| 3 | Log into Google in master Chrome, close | `/opt/livos/data/chrome-master/Default/Cookies` contains Google auth tokens |
| 4 | Click WebApp icon `livinity.io` in LivOS dock | Xvfb `:10` spawns; Chrome on :10 with /tmp/livos-chrome-app-<uuid>; x11vnc on port 15900; LivOS stream window mounts |
| 5 | Chrome on :10 is FULLSCREEN with NO chrome chrome (no tabs, no address bar) | x11vnc capture shows pure app content (livinity.io homepage) |
| 6 | Stream window resolution = 1280x720 | Pixel-measure noVNC canvas — must match |
| 7 | Google account visible in livinity.io (logged in) | Inherited from master profile seed |
| 8 | Click 2nd WebApp `google.com` | Xvfb `:11` spawns; different Chrome process (own user-data-dir); port 15901; different stream window |
| 9 | Both Chromes show same Google account | Master profile seed gives both apps same login |
| 10 | `pgrep -af 'Xvfb :1'` on Mini PC shows :10 + :11 | Two Xvfb processes |
| 11 | `pgrep -af 'chrome.*livos-chrome-app'` shows 2 distinct Chrome processes | Per-app user-data-dir → distinct singleton locks |
| 12 | `lsof -i :15900 -i :15901` shows 2 x11vnc listeners | One per app |
| 13 | Resize LivOS stream window 1 | Stream content stays sharp (Xvfb :10 res unchanged at 1280x720; LivOS UI letterboxes) |
| 14 | Add Ubuntu native app config: VSCode | tRPC apps.native.create succeeds; icon appears in dock |
| 15 | Click VSCode icon | Xvfb `:12` spawns; VSCode binary spawns on :12 with DISPLAY=:12; x11vnc :12 → port 15902 |
| 16 | VSCode UI renders correctly in stream | Native app on dedicated display, no profile-seed for native (binary manages own state) |
| 17 | Chat session in WebApp window has activeDisplay context | Test prompt: "Take a screenshot of this window" → Luse `computer_screenshot` returns 1280x720 image of :10 (not 1920x1080) |
| 18 | Luse coord click works | Click a button at known coord → executes correctly (no offset/scaling) |
| 19 | Teach mode v3: click stream → popover appears at click point | UI-tier DOM listener works regardless of backend display |
| 20 | Save Teach skill, replay | Action coords replay correctly on :N display |
| 21 | Close WebApp `livinity.io` window | Chrome process on :10 killed; x11vnc killed; Xvfb :10 killed; /tmp/livos-chrome-app-<uuid> removed; port + display released |
| 22 | After close, only :11 Xvfb remains | `pgrep -af 'Xvfb :1'` shows only :11 |
| 23 | Close VSCode native app | Binary killed; Xvfb :12 killed; same cleanup as WebApp |
| 24 | Sacred SHA preserved | `ssh bruce@10.69.31.68 'git -C /opt/liv hash-object packages/core/src/sdk-agent-runner.ts'` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| 25 | Concurrent 5 WebApps + 2 native apps | All 7 Xvfb displays, 7 Chrome/binary processes, 7 x11vnc, 7 stream windows, no overlap, no crash, ~3GB RAM total |

---

## Deferred (out of Phase 102 scope)

- **Phase 103:** Two-way profile sync (auth changes in app A propagate back to master). v102 is one-way master → apps.
- **Phase 103+:** Per-app profile retention (user can mark "save this app's state for next launch")
- **Per-app extensions / Chrome flags**: User-configurable per-app `--enable-features=...`
- **Container migration (selfclaude-style true containers)**: Deferred (v34+)
- **WebRTC stream transport**: Deferred (v34)
- **Multi-monitor per app** (one app spans multiple Xvfb displays): Not in scope

---

## Risks

1. **Profile seed copy latency on slow disks.** Mitigation: `/opt/livos/data/chrome-master/` is ~10MB; SSD copy ~200ms; preflight pessimistic 500ms timeout with telemetry.
2. **Xvfb startup race** (Chrome spawned before X server ready). Mitigation: `xdpyinfo -display :N` polls (200ms interval, 5s timeout) before Chrome spawn.
3. **/tmp dir cleanup on crash** — if livinityd crashes mid-spawn, `/tmp/livos-chrome-app-*` accumulates. Mitigation: boot-time `rm -rf /tmp/livos-chrome-app-*` sweep.
4. **Master profile corruption** (user clobbers master via Reset). Mitigation: keep `/opt/livos/data/chrome-master.backup/` snapshot + "Restore Backup" affordance.
5. **Display number exhaustion** (>90 concurrent apps). Mitigation: hard cap at 90; surface "Too many apps open" error to user; backlog UI.
6. **Chrome --start-fullscreen race with Xvfb readiness** — Chrome may launch before Xvfb fully ready. Mitigation: XvfbSpawner.start() must `await readiness` before resolving.
7. **fluxbox on per-app display overhead.** Mitigation: lightweight ratpoison or no WM at all — for `--app=URL` mode, no WM may be required if Chrome creates its own decorations.
8. **Master Login UI security** — opening Chrome on `bruce`'s `:0` is privileged. Mitigation: adminProcedure on tRPC routes; UI only visible to admin role.

---

## Sacred SHA Constraint (carries forward unchanged)

`liv/packages/core/src/sdk-agent-runner.ts` MUST equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` before AND after every 102 commit. Pre-commit hook at `.husky/pre-commit` enforces. NEVER use `--no-verify` except in parallel worktree mode.

---

## Phase 102 Pre-Plan Checklist (for the planner agent)

When `gsd-planner` reads this CONTEXT, it must:

1. ✓ Produce 10 PLAN.md files (`102-00-PLAN.md` Wave 0 stubs through `102-10-PLAN.md`) per decomposition
2. ✓ Wave assignment per dependency graph
3. ✓ Every task has `<read_first>`, `<acceptance_criteria>` (grep-verifiable), concrete `<action>`
4. ✓ Sacred SHA pre/post verify embedded in plans touching `liv/` tree (none expected in 102)
5. ✓ Wave 1+2+3 plans marked `autonomous: true` (9 autonomous + 102-10 user-walked)
6. ✓ Phase 101 PHASE-SUMMARY.md should also be written documenting Phase 101 → 102 architecture pivot (record what 101 shipped + what 102 corrects)
7. ✓ Test patterns: vitest 2.1.9 standard
8. ✓ Plan-checker run AFTER planner; iterate up to 3 revisions if BLOCKERs found
9. ✓ Threat models for security-relevant plans (102-03 binary path validation, 102-07 master login admin gate)
10. ✓ Wave 0 stub plan (102-00) creates test stubs for all NEW modules (display-allocator, xvfb-spawner, chrome-process-spawner, profile-seeder, master-login-routes, master-chrome-login UI)

---

## Supercharge Configuration (for executor agents)

- **Executor model:** `opus` (config inheritance from Phase 101)
- **Parallelization:** `workflow.use_worktrees: true` (set during Phase 101)
- **Context window:** 1M model
- **Phase 101 carryover:** All 101 commits stay in tree (no rollback). 102 modifies on top.

---

## Next Step

`/clear` then:

```
/gsd-autonomous --only 102
```

The planner reads this CONTEXT, produces 10 PLAN.md files, plan-checker verifies, execute-phase runs Wave 1+2+3 in parallel waves (file-disjoint), Wave 4 user-walked.

**Estimated total:** 35-40 atomic commits. Sacred SHA `f3538e1d…` stays throughout. Mini PC deploy + 25-row UAT closes 102.

After 102 ships:
- ✅ Per-app Xvfb display (1280x720 exact)
- ✅ Per-app Chrome process (own user-data-dir, no singleton conflict)
- ✅ Master profile seed-copy (same Google login across apps)
- ✅ Chromeless fullscreen Chrome (`--app=URL` mode)
- ✅ x11vnc whole-display capture (no WID polling, no 1920x1080 drift)
- ✅ Luse screenshots/clicks at 1:1 native resolution
- ✅ Window overlap impossible (display isolation)
- ✅ Clean shutdown lifecycle (Chrome + x11vnc + Xvfb + temp dir all cleaned on close)
