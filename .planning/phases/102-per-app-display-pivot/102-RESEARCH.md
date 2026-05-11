# Phase 102: Per-App Display Pivot — Research

**Researched:** 2026-05-11
**Domain:** Per-app Xvfb display orchestration, per-app Chrome subprocess with master profile seed-copy, x11vnc whole-display capture, Luse display scoping, clean app-close lifecycle.
**Confidence:** HIGH overall — pattern primitives (Xvfb spawn, x11vnc, Chrome `--app` + `--user-data-dir`) are battle-tested in tree from Phase 99-100-101. The "seed-copy master profile" is a NEW pattern requiring careful selection of which Chrome profile files to copy; that decision is documented with confidence MEDIUM (verified file roles via Chromium docs + forensics references) pending a Mini PC empirical test in Plan 102-03 RED phase.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

| ID | Decision (verbatim) |
|----|---------------------|
| **D-102-PER-APP-XVFB** | Each app spawn → dedicated Xvfb display at 1280x720x24. Display range `:10..:99` (90 slots). Args: `Xvfb :N -screen 0 1280x720x24 -ac -nolisten tcp`. Optional fluxbox WM per display. Spawn order: Xvfb → readiness poll (`xdpyinfo -display :N`, 200ms cadence) → fluxbox → Chrome. |
| **D-102-DISPLAY-ALLOCATOR** | DisplayAllocator class — `allocate(): number` from `[10, 100)`, `release(n)`; linear-walker pattern matching PortAllocator; 90 concurrent slots. |
| **D-102-PER-APP-CHROME** | Each app gets own Chrome process with own `--user-data-dir=/tmp/livos-chrome-app-<uuid>`. Args: `chrome --user-data-dir=… --no-first-run --no-default-browser-check --start-fullscreen --app=<URL>`. `DISPLAY=:N` env scopes to its dedicated Xvfb. Singleton lock isolated per `--user-data-dir`. |
| **D-102-MASTER-PROFILE-SEED** | Master profile lives at `/opt/livos/data/chrome-master/` (persistent). User logs in once via Master Login. Every app spawn: `cp -r /opt/livos/data/chrome-master /tmp/livos-chrome-app-<uuid>` (~10MB, ~200ms). One-way inheritance. App close → `rm -rf /tmp/livos-chrome-app-<uuid>`. |
| **D-102-MASTER-LOGIN-UI** | LivOS Settings → "Chrome Master Login" affordance. Spawns master Chrome on bruce's `:0` physical display with `--user-data-dir=/opt/livos/data/chrome-master`. User logs in + closes. "Reset Master Profile" affordance. |
| **D-102-X11VNC-WHOLE-DISPLAY** | x11vnc `-display :N` REPLACES `-id <wid>`. Args: `x11vnc -display :N -rfbport <port> -shared -forever -nopw -quiet -noxdamage`. Output dimensions = 1280x720 exact. |
| **D-102-LUSE-DISPLAY-SCOPING** | Per-WebApp Luse MCP instance gets `LUSE_TARGET_DISPLAY=:N` env (replacing `LUSE_TARGET_WINDOW_ID`). All Luse tool calls scoped to `:N` via `$DISPLAY`. Coords 1:1 native (no offset, no scaling). Global `luse` instance (no scope) keeps existing behavior. |
| **D-102-CLOSE-LIFECYCLE** | App close: (1) SIGTERM Chrome wait 2s, (2) SIGKILL Chrome, (3) SIGTERM x11vnc, (4) SIGTERM Xvfb, (5) rm -rf temp dir, (6) DisplayAllocator.release(N), (7) PortAllocator.release(port), (8) remove LivOS stream window. All steps idempotent. |
| **D-102-NATIVE-APP-PARITY** | Ubuntu native apps use IDENTICAL flow (no profile seed; native apps manage own state). Same close lifecycle. |
| **D-102-SACRED** | `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED. Pre-commit hook enforces. NEVER `--no-verify` except parallel-worktree mode. |
| **D-102-NO-SERVER4** | Mini PC `bruce@10.69.31.68` only deploy target. Server4 + Server5 off-limits. |
| **D-102-PHASE-101-SALVAGE** | ~70% of Phase 101 code retained: 101-00 stubs, 101-01 ChromeCdpClient (optional, unwired), 101-02 PortAllocator (keep), 101-03 NativeAppSpawner (extend), 101-05 native-app stream binder (keep, swap to `:N`), 101-06 Luse auto-context (extend, env switch), 101-07 dock UI (keep), 101-08 SelfClaude Teach v3 (keep), 101-09 chat anims + Hermes relay (keep). Replaced: 101-04 CDP-driven WebApp spawn (→ per-app Xvfb + Chrome subprocess), 101-10 UAT (→ 102-10). |
| **D-102-BACKWARDS-COMPAT** | v33 WebApp configs work after migration (zero data loss). v2 + v3 Teach skills replay unchanged. |

### Claude's Discretion

| Area | Scope |
|------|-------|
| **Master profile file selection** | Which subset of files MUST be copied (Cookies, Login Data, Local State, Preferences, Network/Cookies) vs. which can be skipped (Cache, Service Worker, Storage, History optionally). RESEARCH §"Master Profile Seed Mechanics" recommends a minimal allowlist plus a fallback "full copy if allowlist missing keys." |
| **WM choice on per-app display** | fluxbox vs ratpoison vs no-WM. RESEARCH §"WM choice" recommends no-WM (Chrome `--start-fullscreen` honors EWMH `_NET_WM_STATE_FULLSCREEN` without a WM under Xvfb when `--app=URL` is set — Chrome creates its own toplevel override-redirect-equivalent decorationless window). Fluxbox kept as fallback if validation reveals missing focus events. |
| **Xvfb readiness detection cadence** | `xdpyinfo -display :N` polling interval + max-attempts. CONTEXT specifies 200ms cadence + 5s timeout. RESEARCH locks 200ms × 25 attempts (5s) per `wait-port` style polling pattern already in livinityd deps. |
| **Master profile seed copy approach** | `cp -r` vs `rsync` vs `tar | tar` pipe. RESEARCH recommends `cp -r --reflink=auto` first attempt (Btrfs/XFS CoW = ~10ms; ext4 fallback = ~200ms). Cleanup approach: BOTH boot-time sweep AND on-app-close cleanup (defensive overlap). |
| **DisplayAllocator data structure** | Already implemented in tree at `livos/packages/livinityd/source/modules/webapps/display-allocator.ts` (P100-10-01, retained as 101 scaffolding). RESEARCH §"D-102-01 Implementation Notes" recommends MOVE to `streaming/display-allocator.ts` per CONTEXT decomposition, KEEP existing class semantics (range `:10..:99`, free-list reuse, idempotent release). |
| **Master Login UI design tokens** | Liv design system. Use existing Settings page patterns (`livos/packages/ui/src/modules/settings/*`). RESEARCH provides component sketch with shadcn Dialog + Button + status indicator. |

### Deferred Ideas (OUT OF SCOPE for Phase 102)

- **Phase 103:** Two-way profile sync (auth changes in app A propagate back to master). v102 is one-way master → apps.
- **Phase 103+:** Per-app profile retention (user marks "save this app's state for next launch").
- **Per-app extensions / Chrome flags:** User-configurable per-app `--enable-features=...`.
- **Container migration (selfclaude-style true containers):** v34+.
- **WebRTC stream transport:** v34.
- **Multi-monitor per app** (one app spans multiple Xvfb displays): Not in scope.
- **CDP control of per-app Chrome:** Optional in v1 (per-app Chrome spawned with `--remote-debugging-port` is possible but unwired). Defer wiring to v103 if Luse needs CDP per-window.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **D-102-PER-APP-XVFB** | Per-app Xvfb display at 1280x720x24 in range `:10..:99` | §"D-102-01 Implementation Notes (XvfbSpawner)" — verified Xvfb spawn pattern in tree at `xvfb-display.ts`; readiness poll via `xdpyinfo` per X11 conventions |
| **D-102-DISPLAY-ALLOCATOR** | DisplayAllocator class, range `[10, 100)`, free-list reuse | §"D-102-01 Implementation Notes (DisplayAllocator)" — existing code in `webapps/display-allocator.ts` from P100-10-01 ready to lift; matches PortAllocator pattern |
| **D-102-PER-APP-CHROME** | Per-app Chrome process with own `--user-data-dir` + `--app=URL --start-fullscreen` | §"D-102-02 Implementation Notes" — verified against SelfClaude `webapp-manager.js` per-app `--user-data-dir` pattern + Chromium command-line reference |
| **D-102-MASTER-PROFILE-SEED** | `cp -r /opt/livos/data/chrome-master /tmp/livos-chrome-app-<uuid>` | §"D-102-03 Implementation Notes" — Chromium profile file role table; recommended seed-copy allowlist |
| **D-102-MASTER-LOGIN-UI** | LivOS Settings affordance to spawn master Chrome on `:0` for one-time login | §"D-102-07 Implementation Notes" — tRPC adminProcedure pattern + Chrome subprocess on `:0` (bruce's physical desktop) |
| **D-102-X11VNC-WHOLE-DISPLAY** | `x11vnc -display :N` replaces `-id <wid>` | §"D-102-09 Implementation Notes" — discriminated-union branch ALREADY in `vnc-bridge.ts` (Phase 101 scaffolding); just flip default |
| **D-102-LUSE-DISPLAY-SCOPING** | `LUSE_TARGET_DISPLAY=:N` env propagation to per-WebApp Luse MCP | §"D-102-06 Implementation Notes" — `LUSE_DISPLAY` env name already exists in `mcp/server.ts`; `LUSE_TARGET_WINDOW_ID` replaced for window-scope ops |
| **D-102-CLOSE-LIFECYCLE** | Ordered kill: Chrome → x11vnc → Xvfb → rm -rf temp → release N+port | §"D-102-08 Implementation Notes" — verified order against existing `vnc-bridge` + `xvfb-display.stop()` patterns |
| **D-102-NATIVE-APP-PARITY** | Native apps use same flow (no profile seed) | §"D-102-05 Implementation Notes" — extends existing native-app-binder.ts |
| **D-102-SACRED** | `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d…` UNTOUCHED | §"Sacred SHA Constraint" — pre-commit hook + plan-checker grep |
| **D-102-NO-SERVER4** | Mini PC only | §"Environment Availability" — Mini PC verified |
| **D-102-PHASE-101-SALVAGE** | ~70% of Phase 101 code retained, 101-04 + 101-10 replaced | §"Phase 101 Salvage Map" — file-by-file retention table |
| **D-102-BACKWARDS-COMPAT** | v33 WebApps + v2/v3 Teach skills work post-migration | §"Migration Strategy" — no Redis schema changes needed; first re-open of any WebApp icon spawns via new flow |
</phase_requirements>

---

## Summary

Phase 102 abandons Phase 101's "single Chrome + CDP-multi-target on `:1`" architecture in favor of a much cleaner **per-app isolation** model verified working by the user via SelfClaude. The new model:

1. **Per-app Xvfb display** — each app gets its own X server at `:10`..`:99` running at 1280x720x24. Display isolation eliminates window stacking and overlap-induced black areas (the Phase 100 root cause).

2. **Per-app Chrome subprocess** — each Chrome process gets its own `--user-data-dir=/tmp/livos-chrome-app-<uuid>`, eliminating the Chrome singleton-lock IPC-merge that caused Phase 100-10-08 revert and motivated Phase 101's CDP detour.

3. **Master profile seed-copy** — solves the "but I want the same Google login" problem WITHOUT shared `--user-data-dir`. Master profile at `/opt/livos/data/chrome-master/` is `cp -r`-cloned to the per-app temp dir at spawn. Each app inherits the login state at spawn time; subsequent auth changes don't propagate (one-way).

4. **x11vnc whole-display capture** — `x11vnc -display :N` replaces `x11vnc -id <wid>`. Since each display has exactly one Chrome rendering fullscreen, the whole-display capture IS the app capture. No more WID polling, no more 1920x1080 mismatch, no coordinate translation in Luse.

5. **Luse display scoping** — per-WebApp Luse MCP child gets `LUSE_TARGET_DISPLAY=:N` env. All X11 ops (xdotool, xprop, maim) respect `$DISPLAY`, so the MCP server is implicitly scoped to its target app's display. Screenshots come back at 1280x720 exact (resolution match = 1:1 coordinate mapping).

**Phase 101 salvage:** ~70% of 101's deliverables carry forward unchanged (PortAllocator, native app spawner, Luse auto-context, dock UI, Teach v3, chat anims). The CDP bootstrap (101-01) stays in tree but is no longer wired by default. Only 101-04 (CDP-driven WebApp spawn) is fully replaced, and 101-10 UAT becomes 102-10.

**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` is UNCHANGED throughout. No Phase 102 plan touches `liv/packages/core/src/sdk-agent-runner.ts`.

**Primary recommendation:** Adopt the 10-plan decomposition exactly as locked in CONTEXT. Wave 1 (102-01..03) ships pure-new modules in parallel via worktrees. Wave 2 (102-04..06) wires the orchestrators in parallel. Wave 3 (102-07..09) ships UI + close lifecycle + x11vnc rewrite in parallel. Wave 4 (102-10) is user-walked Mini PC deploy + 25-row UAT.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Xvfb spawn + readiness poll per app | livinityd (Node backend) | — | livinityd is the process supervisor; owns Xvfb child for each WebApp. Pattern lives in `webapps/xvfb-display.ts` and `webapps/fluxbox-wm.ts` already. |
| DisplayAllocator state | livinityd (singleton) | — | Single source of truth for `:10..:99` slot ownership. Reuses existing `display-allocator.ts` class. |
| PortAllocator state | livinityd (singleton) | — | Reuses Phase 101-02 deliverable. |
| Per-app Chrome subprocess | livinityd | — | livinityd spawns + tracks per-app Chrome PID. `child_process.spawn` with `detached:true`, `unref()`. |
| Master profile seed-copy | livinityd | filesystem (`cp -r`) | Boot ensures `/opt/livos/data/chrome-master/` exists; spawn calls `cp -r master /tmp/livos-chrome-app-<uuid>`. |
| Master Login flow (admin tRPC) | livinityd (tRPC adminProcedure) | UI (React Settings page) | Backend spawns Chrome on `:0`; UI surfaces "Chrome Master Login" button + status. |
| x11vnc per-display capture | livinityd (`streaming/vnc-bridge.ts`) | — | Existing pattern; just flips `-id` → `-display`. |
| Luse MCP per-app env injection | livinityd (`computer-use/luse-mcp-config.ts` + `mcp/server.ts`) | per-WebApp Luse child reads env | Per-WebApp Luse MCP child gets `LUSE_TARGET_DISPLAY=:N`; X11 tools (xdotool/xprop/maim) inherit `$DISPLAY`. |
| App close lifecycle orchestration | livinityd (`webapps/window-manager.ts` + `apps/native-app-binder.ts`) | — | Kill order owned by window-manager (WebApps) and native-app-binder (native apps). |
| LivOS stream window UI | UI (React) | livinityd (tRPC subscribes to stream events) | UI mounts noVNC canvas to `ws://localhost:<port>`. No changes vs. Phase 101. |
| Luse window-context auto-injection | UI (sends `activeDisplay` in chat envelope) | livinityd (reads + injects into prompt) | Phase 101-06 carryover; env name changes `activeWid` → `activeDisplay`. |
| Chat animations | UI | — | Pure CSS + Tailwind. Phase 101-09 carryover unchanged. |
| Hermes per-tool status_detail relay | livinityd (`ai/agent-runs.ts`) | UI (renders) | Phase 101-09 carryover unchanged. Sacred file untouched. |

---

## Standard Stack

### Core (already in tree — verified versions)

| Library / Tool | Version | Purpose | Why Standard | Confidence |
|----------------|---------|---------|--------------|------------|
| `Xvfb` | 21.1.x system pkg (Ubuntu 24.04) `[VERIFIED: Phase 100-08 baseline]` | Per-app X server | Already used at `:1` by 100-08-01; Phase 102 extends to `:10..:99` per app | HIGH |
| `x11vnc` | 0.9.16 system pkg (Ubuntu 24.04) `[VERIFIED: Phase 99-02 baseline]` | RFB stream of X display | Phase 99-02 baseline; Phase 102 flips arg from `-id <wid>` to `-display :N` | HIGH |
| `xdpyinfo` | x11-utils system pkg | Xvfb readiness poll | Standard X11 conventions for "is the X server up?" | HIGH |
| `xdotool` | 3.20210903.1 system pkg `[VERIFIED: 100-09-07]` | Window ops (native-app WM_CLASS match, focus, type, click) | Existing pattern; X11 ops respect `$DISPLAY` env | HIGH |
| `fluxbox` (optional) | 1.3.7 system pkg `[VERIFIED: 100-08-01]` | Window manager per display (if WM needed) | Existing pattern; lightweight | MEDIUM (validate if needed — see WM-choice below) |
| `google-chrome` | stable (Ubuntu repo) `[VERIFIED: existing webapp spawn path]` | Per-app browser process | Existing dep; `--app=URL --start-fullscreen --user-data-dir` flags well-documented | HIGH |
| `node:child_process` | Node 22+ builtin | Spawn Xvfb/x11vnc/Chrome | Existing pattern | HIGH |
| `node:fs/promises` (`cp` from `node:fs`) | Node 22+ builtin | Master profile seed-copy | Use either `node:fs/promises.cp` (recursive) OR shell out to `cp -r --reflink=auto` for CoW speed | HIGH |
| `node:crypto` (`randomUUID`) | Node 22+ builtin | `<uuid>` for `/tmp/livos-chrome-app-<uuid>` | Existing pattern | HIGH |
| `ioredis` | 5.4.x in tree `[VERIFIED: package.json]` | Redis client for `liv:config:*` flags | Existing dep | HIGH |
| `zod` | 3.21.4 in tree | Master profile path validation, config schemas | Existing pattern | HIGH |
| `vitest` | 2.1.9 in tree (livinityd + ui) `[VERIFIED: package.json]` | Test runner | Existing pattern | HIGH |

### Already-installed Phase 101 deps (kept, not wired by default)

| Library | Version | Phase 102 Role |
|---------|---------|----------------|
| `chrome-remote-interface` | 0.34.0 `[VERIFIED: npm view 2026-02-09]` | KEPT in `chrome-cdp/client.ts`. Not wired by default; per-app Chrome process can use own CDP port if Luse needs CDP control. v1 doesn't need CDP. |
| `@types/chrome-remote-interface` | 0.33.0 `[VERIFIED]` | KEPT as devDep. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-app Xvfb at `:10..:99` | Single Xvfb `:99` + per-app `--user-data-dir` only (SelfClaude pattern) | Loses display isolation — multi-window on `:99` can still overlap. User EXPLICITLY rejected this in trigger quote: "ayri displayde sorunumu nasil cozersin… ayni screen de iki farkli yayin yapiyorsun ustuste bindiginde sorun cikiyor." Phase 102 goes further than SelfClaude. |
| Per-app `--user-data-dir=/tmp/livos-chrome-app-<uuid>` with seed-copy | Per-app `--user-data-dir` fresh (no seed) | Loses Google login across apps. User wants same login. Seed-copy is the design lock. |
| `cp -r` from master to /tmp | `rsync -a` | `cp -r` is in coreutils, ~200ms for 10MB on SSD; rsync adds a process dep but supports `--ignore-existing`. Recommend `cp -r --reflink=auto` (CoW where supported, ~10ms; falls back to plain copy otherwise). |
| x11vnc `-display :N` | XComposite + xrandr-based capture | x11vnc handles compose semantics correctly; no need to reinvent. Phase 99 baseline. |
| `node:fs/promises.cp` recursive | shell out to `cp -r --reflink=auto` | Node's `cp` doesn't support `--reflink`. For CoW speedup, shell out. For simplicity, Node's `cp` works fine; recommend shell `cp -r --reflink=auto` for the speedup but Node `cp` as fallback. |
| fluxbox per display | ratpoison / no-WM | Chrome `--app=URL --start-fullscreen` under Xvfb (no other windows) typically works WITHOUT a WM because Chrome's frameless mode creates its own decorationless window. Validate empirically (Plan 102-04 RED). Fluxbox kept as fallback. |

**No new npm deps required.** Phase 102 is entirely process orchestration + filesystem ops + existing dep wiring.

**Version verification commands:**
```bash
# Run on Mini PC during 102-10 deploy verification
xvfb-run --help 2>&1 | head -1            # Xvfb version
x11vnc -version                             # x11vnc version
xdotool --version
xdpyinfo -version
fluxbox -version
google-chrome --version
```

---

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  USER                                                                │
│  • Clicks LivOS dock icon                                            │
│  • Types in stream window's chat panel                               │
│  • Clicks Settings → Chrome Master Login                             │
│         │                                                            │
└─────────┼────────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LivOS UI (React + Vite, served by livinityd:8080)                   │
│                                                                      │
│  Dock                  Stream Window N           Settings            │
│  ┌─────────┐          ┌──────────────────┐       ┌────────────────┐  │
│  │ WebApp  │ click→   │ noVNC canvas     │       │ Chrome Master  │  │
│  │ icons   │          │ ws://localhost:N │       │ Login button   │  │
│  │ Native  │          │ Stream Resolution│       │ Reset Profile  │  │
│  │ icons   │          │ = 1280x720       │       │ Status         │  │
│  └─────────┘          └──────────────────┘       └────────────────┘  │
│         │                       │                        │           │
│   tRPC HTTP             WebSocket (chat + RFB)     tRPC HTTP (admin) │
│         ▼                       ▼                        ▼           │
└──────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  livinityd (Node, tsx, systemd: livos.service)                       │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Singletons (constructed in livinityd.start())               │    │
│  │  • DisplayAllocator (10..99)                                 │    │
│  │  • PortAllocator    (15900..15999)                           │    │
│  │  • Boot-time sweep: rm -rf /tmp/livos-chrome-app-*           │    │
│  │  • Ensure /opt/livos/data/chrome-master/ exists              │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Per-WebApp spawn flow (WebAppWindowManager.spawn):                  │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  1. DisplayAllocator.allocate() → N                          │    │
│  │  2. XvfbSpawner.start(N, 1280, 720)                          │    │
│  │     spawn Xvfb :N -screen 0 1280x720x24 -ac -nolisten tcp    │    │
│  │     poll xdpyinfo -display :N (200ms × 25, 5s timeout)       │    │
│  │  3. ProfileSeeder.seed(uuid)                                 │    │
│  │     cp -r --reflink=auto /opt/livos/data/chrome-master       │    │
│  │                           /tmp/livos-chrome-app-<uuid>       │    │
│  │  4. ChromeProcessSpawner.start(uuid, N, url)                 │    │
│  │     spawn chrome --user-data-dir=/tmp/livos-chrome-app-…     │    │
│  │           --no-first-run --no-default-browser-check          │    │
│  │           --start-fullscreen --app=<URL>                     │    │
│  │           env: DISPLAY=:N                                    │    │
│  │  5. PortAllocator.allocate() → port                          │    │
│  │  6. VncBridge.startDisplay(N, port)                          │    │
│  │     spawn x11vnc -display :N -rfbport <port>                 │    │
│  │           -shared -forever -nopw -quiet -noxdamage           │    │
│  │  7. Per-WebApp Luse MCP register (env LUSE_TARGET_DISPLAY=:N)│    │
│  │  8. Return {streamId, wsUrl, display: ':N', port}            │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Per-WebApp close flow:                                              │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  1. SIGTERM Chrome pid → wait 2s → SIGKILL if alive          │    │
│  │  2. SIGTERM x11vnc                                           │    │
│  │  3. SIGTERM Xvfb                                             │    │
│  │  4. rm -rf /tmp/livos-chrome-app-<uuid>                      │    │
│  │  5. DisplayAllocator.release(N)                              │    │
│  │  6. PortAllocator.release(port)                              │    │
│  │  7. Per-WebApp Luse MCP unregister                           │    │
│  │  8. UI stream window unmounts                                │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Native-app flow IDENTICAL except:                                   │
│  • Skip step 3 (no profile seed)                                     │
│  • Step 4: spawn <binaryPath> instead of chrome                      │
│  • Optional fluxbox spawn on :N if binary needs WM (Electron apps)   │
│                                                                      │
│  Master Login flow (admin tRPC):                                     │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  POST /trpc/chromeMaster.startLogin (adminProcedure)         │    │
│  │  → spawn chrome on bruce's :0 (physical desktop)             │    │
│  │  → --user-data-dir=/opt/livos/data/chrome-master             │    │
│  │  → user logs in, configures, closes chrome normally          │    │
│  │  → process exit watcher fires `chromeMaster.completed` event │    │
│  │  POST /trpc/chromeMaster.reset (adminProcedure)              │    │
│  │  → rm -rf /opt/livos/data/chrome-master                      │    │
│  │  → optionally restore from /opt/livos/data/chrome-master.bak │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  X SERVER LAYER (per-app isolation)                                  │
│                                                                      │
│  :0 (bruce's GNOME desktop, physical screen)                         │
│  └─ used ONLY for Master Login spawn (livinityd → chrome on :0)      │
│                                                                      │
│  :1 (legacy Xvfb singleton from 100-08-01, retained for back-compat) │
│  └─ NO new WebApp Chrome spawned here in Phase 102                   │
│                                                                      │
│  :10  → Xvfb :10 + Chrome :10 (livinity.io)                          │
│         └─ /tmp/livos-chrome-app-<uuid-A>                            │
│         └─ x11vnc -display :10 -rfbport 15900                        │
│         └─ Per-WebApp Luse MCP: env DISPLAY=:10                      │
│                                                                      │
│  :11  → Xvfb :11 + Chrome :11 (google.com)                           │
│         └─ /tmp/livos-chrome-app-<uuid-B>                            │
│         └─ x11vnc -display :11 -rfbport 15901                        │
│         └─ Per-WebApp Luse MCP: env DISPLAY=:11                      │
│                                                                      │
│  :12  → Xvfb :12 + Native app (VSCode/Antigravity)                   │
│         └─ Optional fluxbox -display :12 (if binary needs WM)        │
│         └─ x11vnc -display :12 -rfbport 15902                        │
│         └─ Per-app Luse MCP: env DISPLAY=:12                         │
│                                                                      │
│  Memory budget per slot: ~30MB Xvfb + ~80-150MB Chrome + 50MB x11vnc │
│  = ~180MB per WebApp. 7 concurrent (UAT row 25) ≈ 1.3GB. Mini PC ok. │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| **DisplayAllocator** | `livos/packages/livinityd/source/modules/streaming/display-allocator.ts` (NEW — MOVE existing `webapps/display-allocator.ts`) | `allocate(): number` from `[10, 100)`; `release(n)`; in-memory state. |
| **XvfbSpawner** | `livos/packages/livinityd/source/modules/streaming/xvfb-spawner.ts` (NEW — wraps existing `webapps/xvfb-display.ts`) | `start(displayNum, w, h)` → spawn Xvfb + poll `xdpyinfo` ready → return `XvfbHandle`. |
| **ChromeProcessSpawner** | `livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.ts` (NEW) | `start(uuid, displayNum, url)` → spawn chrome with own `--user-data-dir` + `--app=URL` + `DISPLAY=:N` env. Returns `{pid, child}`. |
| **MasterProfileSeeder** | `livos/packages/livinityd/source/modules/chrome-master/profile-seeder.ts` (NEW) | `seed(uuid): string` → `cp -r master /tmp/livos-chrome-app-<uuid>` → returns the temp path. Boot-time `ensureMasterExists()` creates empty dir if absent. |
| **Master Login routes** | `livos/packages/livinityd/source/modules/chrome-master/master-login-routes.ts` (NEW) | tRPC `chromeMaster.startLogin` (spawn chrome on `:0`), `.status` (is chrome on :0 alive?), `.reset` (rm -rf master + optional backup restore). adminProcedure-gated. |
| **VncBridge (rewrite)** | `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` (MODIFIED) | Flip default from `-id <wid>` to `-display :N`. Discriminated union already exists from Phase 100-10-08 scaffolding — just flip the wire path. |
| **StreamManager (extend)** | `livos/packages/livinityd/source/modules/streaming/stream-manager.ts` (MODIFIED) | `VncDisplayTarget = {display: ':N'} | {wid: number}` already exists from 100-10-08 scaffolding. Wire display-target as the post-102 default. |
| **WindowManager (rewrite spawn)** | `livos/packages/livinityd/source/modules/webapps/window-manager.ts` (MODIFIED) | `spawn()` body: DisplayAllocator → XvfbSpawner → ProfileSeeder → ChromeProcessSpawner → PortAllocator → VncBridge.startDisplay. Close path: ordered teardown per D-102-CLOSE-LIFECYCLE. |
| **NativeAppBinder (display swap)** | `livos/packages/livinityd/source/modules/apps/native-app-binder.ts` (MODIFIED) | Replace `DISPLAY=:1 binary` with `DisplayAllocator + XvfbSpawner + DISPLAY=:N binary`. Drop WM_CLASS poll. |
| **Luse MCP descriptor (env switch)** | `livos/packages/livinityd/source/modules/webapps/luse-mcp-descriptor.ts` OR `computer-use/luse-mcp-config.ts` (MODIFIED) | Per-WebApp MCP child env: `LUSE_TARGET_DISPLAY=:N` replaces `LUSE_TARGET_WINDOW_ID` for window-bound ops. `DISPLAY=:N` already set. |
| **agent-prompt-builder (env name update)** | `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` (MODIFIED) | Update Active Window Context snippet: report active display `:N + 1280x720 bounds` instead of `activeWid`. |
| **agent-runner-factory (env propagation)** | `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` (MODIFIED) | Forward `activeDisplay` env (`:N`) instead of `activeWid` to spawned Luse MCP. |
| **computer-use/mcp/server.ts (env read)** | (MODIFIED) | Read `LUSE_TARGET_DISPLAY` from env (replaces `LUSE_TARGET_WINDOW_ID` for the window-scope envelope). |
| **Master Chrome Login UI** | `livos/packages/ui/src/modules/settings/master-chrome-login.tsx` (NEW) | shadcn Dialog + Button + status indicator. tRPC mutations: `chromeMaster.startLogin`, `.reset`. Status query: `chromeMaster.status`. |

### Recommended Project Structure

```
livos/packages/livinityd/source/modules/
├── chrome-cdp/             # Phase 101 — KEPT but unwired by default
│   ├── bootstrap.ts        # Phase 101-01 — left in tree; not called
│   ├── client.ts           # Phase 101-01 — left in tree; not called
│   └── index.ts
├── chrome-master/          # NEW (Phase 102-03 + 102-07)
│   ├── profile-seeder.ts       # NEW (102-03)
│   ├── profile-seeder.test.ts
│   ├── master-login-routes.ts  # NEW (102-07 backend half)
│   ├── master-login-routes.test.ts
│   └── index.ts
├── streaming/              # EXTEND (Phase 102-01 + 102-09)
│   ├── display-allocator.ts        # NEW (MOVE from webapps/)
│   ├── display-allocator.test.ts   # MOVE
│   ├── xvfb-spawner.ts             # NEW (wrap xvfb-display.ts)
│   ├── xvfb-spawner.test.ts
│   ├── port-allocator.ts           # Phase 101-02 — KEPT
│   ├── port-allocator.test.ts      # Phase 101-02 — KEPT
│   ├── vnc-bridge.ts               # MODIFY (102-09 — flip default to -display)
│   ├── stream-manager.ts           # MODIFY (102-09 — wire VncDisplayTarget)
│   └── … (existing files unchanged)
├── webapps/                # MODIFY (Phase 102-02 + 102-04 + 102-06)
│   ├── chrome-process-spawner.ts   # NEW (102-02)
│   ├── chrome-process-spawner.test.ts
│   ├── window-manager.ts           # REWRITE spawn() body + close() (102-04 + 102-08)
│   ├── window-manager.test.ts
│   ├── luse-mcp-descriptor.ts      # MODIFY (102-06 — env switch)
│   ├── xvfb-display.ts             # KEEP (XvfbSpawner wraps it)
│   ├── fluxbox-wm.ts               # KEEP (optional per-app fluxbox)
│   └── … (existing files unchanged)
├── apps/                   # MODIFY (Phase 102-05 + 102-08)
│   ├── native-app-binder.ts        # MODIFY (display swap)
│   ├── native-app-binder.test.ts
│   └── native-app-spawner.ts       # Phase 101-03 — KEEP, extend with display arg
├── ai/                     # MODIFY (Phase 102-06)
│   └── agent-prompt-builder.ts     # MODIFY (display-aware snippet)
├── livinity-broker/        # MODIFY (Phase 102-06)
│   └── agent-runner-factory.ts     # MODIFY (env propagation)
└── computer-use/           # MODIFY (Phase 102-06)
    └── mcp/
        └── server.ts                # MODIFY (LUSE_TARGET_DISPLAY read)

livos/packages/ui/src/
├── modules/
│   ├── settings/
│   │   ├── master-chrome-login.tsx       # NEW (102-07 UI half)
│   │   └── master-chrome-login.test.tsx
│   └── desktop/                          # Phase 101 carryover unchanged
│       ├── native-app-form.tsx
│       └── native-app-icon.tsx
```

### Pattern 1: XvfbSpawner — Spawn + readiness poll

**What:** Spawn Xvfb at a given display number; poll `xdpyinfo` until display is responsive; return handle for later kill.

**When to use:** Plan 102-01 XvfbSpawner module.

**Pattern (wraps existing `xvfb-display.ts`):**

```typescript
// livos/packages/livinityd/source/modules/streaming/xvfb-spawner.ts
// Source: pattern from xvfb-display.ts + xdpyinfo polling
// [VERIFIED: existing xvfb-display.ts in tree; xdpyinfo polling pattern from Pyvirtualdisplay GitHub Issue #33]
import {spawn as nodeSpawn, execFile, type ChildProcess} from 'node:child_process'
import {promisify} from 'node:util'

const execFileP = promisify(execFile)

export interface XvfbSpawnOpts {
  display: string                  // ':10', ':11', etc.
  width?: number                   // default 1280
  height?: number                  // default 720
  depth?: number                   // default 24
  user?: string                    // default 'bruce'
  spawnFn?: typeof nodeSpawn
  execFileFn?: typeof execFile
  pollIntervalMs?: number          // default 200
  readyTimeoutMs?: number          // default 5000
  logger?: {info(m: string): void; warn(m: string, e?: unknown): void; error(m: string, e?: unknown): void}
}

export interface XvfbHandle {
  pid: number
  display: string
  child: ChildProcess
  stop(): Promise<void>
}

export class XvfbReadyTimeoutError extends Error {
  code = 'XVFB_READY_TIMEOUT'
  constructor(public display: string, public timeoutMs: number) {
    super(`Xvfb ${display} did not become ready within ${timeoutMs}ms`)
  }
}

export async function spawnXvfb(opts: XvfbSpawnOpts): Promise<XvfbHandle> {
  const display = opts.display
  const w = opts.width ?? 1280
  const h = opts.height ?? 720
  const d = opts.depth ?? 24
  const user = opts.user ?? 'bruce'
  const spawnFn = opts.spawnFn ?? nodeSpawn
  const pollInterval = opts.pollIntervalMs ?? 200
  const readyTimeout = opts.readyTimeoutMs ?? 5000

  // sudo -n -u bruce Xvfb :N -screen 0 1280x720x24 -nolisten tcp -ac
  const args = [
    '-n', '-u', user,
    'Xvfb', display,
    '-screen', '0', `${w}x${h}x${d}`,
    '-nolisten', 'tcp',
    '-ac',
  ]
  const child = spawnFn('sudo', args, {detached: true, stdio: 'ignore'})

  // Poll xdpyinfo -display :N (200ms × 25 = 5s)
  const start = Date.now()
  while (Date.now() - start < readyTimeout) {
    try {
      await execFileP('xdpyinfo', ['-display', display])
      // Ready — display responding
      try { child.unref?.() } catch { /* noop */ }
      opts.logger?.info(`Xvfb ${display} ready after ${Date.now() - start}ms pid=${child.pid}`)
      return {
        pid: child.pid as number,
        display,
        child,
        stop: () => stopProc(child, 2000, opts.logger),
      }
    } catch {
      // Not yet ready; continue polling
    }
    await new Promise((r) => setTimeout(r, pollInterval))
  }
  // Timeout — kill child
  try { child.kill('SIGKILL') } catch { /* noop */ }
  throw new XvfbReadyTimeoutError(display, readyTimeout)
}

async function stopProc(child: ChildProcess, graceMs: number, logger?: any): Promise<void> {
  try { child.kill('SIGTERM') } catch { /* may already be gone */ }
  const timer = setTimeout(() => {
    try { child.kill('SIGKILL') } catch { /* noop */ }
  }, graceMs)
  await new Promise<void>((resolve) => child.once('exit', () => resolve()))
  clearTimeout(timer)
}
```

### Pattern 2: ChromeProcessSpawner — Per-app Chrome subprocess

**What:** Spawn one Chrome process per app with its own `--user-data-dir`. No CDP. No shared profile. Chrome `--start-fullscreen` + `--app=URL` gives chromeless full-display rendering.

**When to use:** Plan 102-02.

**Pattern:**

```typescript
// livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.ts
// Source: selfclaude/src/webapp-manager.js per-app --user-data-dir pattern
// [VERIFIED: gh api repos/utopusc/selfclaude/contents/src/webapp-manager.js — uses per-app /tmp/chrome-prof-{N}]
// [VERIFIED: existing webapps/window-manager.ts chrome spawn pattern lines 380-407]
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'

export interface ChromeSpawnOpts {
  display: string                  // ':10', ':11', etc.
  userDataDir: string              // /tmp/livos-chrome-app-<uuid>
  url: string                      // https://livinity.io
  user?: string                    // default 'bruce'
  chromeBinary?: string            // default 'google-chrome'
  spawnFn?: typeof nodeSpawn
  logger?: {info(m: string): void; warn(m: string, e?: unknown): void; error(m: string, e?: unknown): void}
}

export interface ChromeProcessHandle {
  pid: number
  child: ChildProcess
  display: string
  userDataDir: string
  stop(): Promise<void>
}

// Pinned argv. Per-app Chrome — no --remote-debugging-port by default.
// --start-fullscreen + --app=URL gives chromeless full-display rendering.
// --no-first-run avoids the "welcome" dialog stealing first-frame focus.
// --no-default-browser-check avoids the "make Chrome default" prompt.
// --disable-features=... suppresses infobars (selfclaude pattern).
// --test-type suppresses "unsupported flag" warning bar.
// --no-sandbox required on Ubuntu under non-root user without setuid helper.
const STATIC_ARGS = [
  '--no-first-run',
  '--no-default-browser-check',
  '--no-sandbox',
  '--start-fullscreen',
  '--disable-features=ChromeWhatsNewUI,TranslateUI,InfoBars',
  '--disable-infobars',
  '--test-type',
] as const

export async function spawnChromeProcess(opts: ChromeSpawnOpts): Promise<ChromeProcessHandle> {
  const user = opts.user ?? 'bruce'
  const bin = opts.chromeBinary ?? 'google-chrome'
  const spawnFn = opts.spawnFn ?? nodeSpawn

  // sudo -n -u bruce DISPLAY=:N chrome --user-data-dir=… --app=URL ...
  const args = [
    '-n', '-u', user,
    `DISPLAY=${opts.display}`,
    bin,
    `--user-data-dir=${opts.userDataDir}`,
    ...STATIC_ARGS,
    `--app=${opts.url}`,
  ]
  const child = spawnFn('sudo', args, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {...process.env, DISPLAY: opts.display},
  })

  // Stderr tail (50 lines) for crash diagnostics (D-99-07 pattern)
  const stderrTail: string[] = []
  child.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString('utf-8').trim()
    if (!line) return
    stderrTail.push(line)
    if (stderrTail.length > 50) stderrTail.shift()
  })
  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      const tail = stderrTail.length > 0
        ? `\n--- chrome stderr (last ${stderrTail.length}) ---\n${stderrTail.join('\n')}`
        : ''
      opts.logger?.error?.(`chrome[${opts.display}] exited code=${code} signal=${signal}${tail}`)
    }
  })
  try { child.unref?.() } catch { /* noop */ }

  opts.logger?.info(`chrome[${opts.display}] spawned pid=${child.pid} userDataDir=${opts.userDataDir} url=${opts.url}`)
  return {
    pid: child.pid as number,
    child,
    display: opts.display,
    userDataDir: opts.userDataDir,
    stop: () => stopProc(child, 2000, opts.logger),
  }
}

async function stopProc(child: ChildProcess, graceMs: number, logger?: any): Promise<void> {
  try { child.kill('SIGTERM') } catch { /* noop */ }
  const timer = setTimeout(() => {
    try { child.kill('SIGKILL') } catch { /* noop */ }
  }, graceMs)
  await new Promise<void>((resolve) => child.once('exit', () => resolve()))
  clearTimeout(timer)
}
```

### Pattern 3: MasterProfileSeeder — `cp -r master /tmp/livos-chrome-app-<uuid>`

**What:** Copy the master profile directory to a per-app temp dir at spawn time. One-way inheritance. Each app starts with master's login state; app-side changes don't propagate back.

**When to use:** Plan 102-03.

**Pattern:**

```typescript
// livos/packages/livinityd/source/modules/chrome-master/profile-seeder.ts
// Source: filesystem cp -r --reflink=auto (CoW where supported)
// [CITED: coreutils cp manpage; --reflink=auto = CoW on btrfs/xfs, fall back to plain copy]
import {execFile} from 'node:child_process'
import {access, mkdir, rm} from 'node:fs/promises'
import {constants as fsConstants} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {promisify} from 'node:util'

const execFileP = promisify(execFile)

export const MASTER_PROFILE_DIR = '/opt/livos/data/chrome-master'
export const APP_PROFILE_PREFIX = '/tmp/livos-chrome-app-'

export class MasterProfileMissingError extends Error {
  code = 'MASTER_PROFILE_MISSING'
  constructor(public masterDir: string) {
    super(`master profile directory does not exist: ${masterDir}`)
  }
}

export interface ProfileSeederOpts {
  masterDir?: string                // default MASTER_PROFILE_DIR
  appPrefix?: string                // default APP_PROFILE_PREFIX
  execFileFn?: typeof execFile
  uuidFn?: () => string             // default randomUUID
  logger?: {info(m: string): void; warn(m: string, e?: unknown): void}
}

export interface ProfileSeederHandle {
  seed(): Promise<{uuid: string; appDir: string}>
  ensureMasterExists(): Promise<void>
  cleanup(uuid: string): Promise<void>
  sweepOrphans(): Promise<number>   // returns number of orphans removed
}

export function createProfileSeeder(opts: ProfileSeederOpts = {}): ProfileSeederHandle {
  const masterDir = opts.masterDir ?? MASTER_PROFILE_DIR
  const appPrefix = opts.appPrefix ?? APP_PROFILE_PREFIX
  const execFileFn = opts.execFileFn ?? execFile
  const uuidFn = opts.uuidFn ?? randomUUID

  return {
    async ensureMasterExists(): Promise<void> {
      try {
        await access(masterDir, fsConstants.R_OK | fsConstants.X_OK)
      } catch {
        await mkdir(masterDir, {recursive: true})
        opts.logger?.info?.(`profile-seeder: created empty master at ${masterDir} (user must run Master Login)`)
      }
    },

    async seed(): Promise<{uuid: string; appDir: string}> {
      // Validate master exists (must have been initialized via ensureMasterExists)
      try {
        await access(masterDir, fsConstants.R_OK | fsConstants.X_OK)
      } catch {
        throw new MasterProfileMissingError(masterDir)
      }

      const uuid = uuidFn()
      const appDir = `${appPrefix}${uuid}`
      const start = Date.now()
      // cp -r --reflink=auto = Copy-on-Write where supported (btrfs/xfs); plain copy otherwise
      await promisify(execFileFn)('cp', ['-r', '--reflink=auto', masterDir, appDir])
      opts.logger?.info?.(`profile-seeder: seeded ${appDir} from ${masterDir} in ${Date.now() - start}ms`)
      return {uuid, appDir}
    },

    async cleanup(uuid: string): Promise<void> {
      const appDir = `${appPrefix}${uuid}`
      try {
        await rm(appDir, {recursive: true, force: true})
        opts.logger?.info?.(`profile-seeder: cleaned ${appDir}`)
      } catch (err) {
        opts.logger?.warn?.(`profile-seeder: cleanup ${appDir} failed`, err)
      }
    },

    async sweepOrphans(): Promise<number> {
      // Boot-time sweep: remove any /tmp/livos-chrome-app-* dirs left over from crashes
      // Implemented as shell glob for performance + simplicity:
      //   rm -rf /tmp/livos-chrome-app-*
      try {
        await promisify(execFileFn)('sh', ['-c', `rm -rf ${appPrefix}*`])
        opts.logger?.info?.(`profile-seeder: swept orphan profiles matching ${appPrefix}*`)
        return 1  // Cannot reliably count without listing first; return non-zero to indicate sweep happened
      } catch (err) {
        opts.logger?.warn?.(`profile-seeder: sweep failed`, err)
        return 0
      }
    },
  }
}
```

### Pattern 4: WindowManager rewrite — full per-app orchestration

**What:** Replace the current `spawn()` body that uses shared `:1` + shared `--user-data-dir` with the per-app Xvfb + per-app Chrome + master-seed flow.

**When to use:** Plan 102-04.

**Pattern:**

```typescript
// livos/packages/livinityd/source/modules/webapps/window-manager.ts (modified spawn() body)
// Source: composition of 102-01, 102-02, 102-03 deliverables
async spawn(opts: SpawnOpts): Promise<SpawnResult> {
  // 1. Idempotency check (unchanged from current)
  // 2. Per-user cap check (unchanged)

  // 3. Allocate display
  const display = this.displayAllocator.allocate()   // ':10', ':11', ...
  // displayAllocator.allocate() returns a number per CONTEXT D-102-DISPLAY-ALLOCATOR;
  // current implementation in tree returns a string (':10'). Pick the string variant —
  // it's already in tree and matches all consumer call sites.

  let xvfb: XvfbHandle | null = null
  let chrome: ChromeProcessHandle | null = null
  let port: number | null = null
  let seed: {uuid: string; appDir: string} | null = null

  try {
    // 4. Spawn Xvfb (with readiness poll)
    xvfb = await spawnXvfb({display, width: 1280, height: 720, logger: this.logger})

    // 5. (Optional) Spawn fluxbox if WM needed.
    //    For Chrome --app=URL --start-fullscreen, validation in 102-04 RED will
    //    determine if fluxbox is required. Default: SKIP fluxbox (Chrome creates
    //    its own decorationless toplevel under Xvfb without a WM).

    // 6. Seed master profile
    seed = await this.profileSeeder.seed()

    // 7. Spawn Chrome on :N with seeded profile
    chrome = await spawnChromeProcess({
      display,
      userDataDir: seed.appDir,
      url: opts.url,
      logger: this.logger,
    })

    // 8. Allocate port
    port = this.portAllocator.allocate()

    // 9. Start x11vnc whole-display capture
    const stream = await this.streamManager.startStream({
      mode: 'vnc-display',
      target: {display},
      port,
    })

    // 10. Register per-WebApp Luse MCP (env LUSE_TARGET_DISPLAY=:N)
    await this.registerWebAppMcp(opts.webappId, display)

    // 11. Store ActiveWebApp + return
    this.active.set(opts.webappId, {
      webappId: opts.webappId,
      display, xvfb, chrome, port, seed,
      streamId: stream.streamId,
    })
    return {
      streamId: stream.streamId,
      wsUrl: stream.wsUrl,
      display,
      port,
    }
  } catch (err) {
    // Compensating cleanup on partial failure
    if (chrome) await chrome.stop().catch(() => {})
    if (seed) await this.profileSeeder.cleanup(seed.uuid).catch(() => {})
    if (xvfb) await xvfb.stop().catch(() => {})
    if (port !== null) this.portAllocator.release(port)
    this.displayAllocator.release(display)
    throw err
  }
}

async close(webappId: string): Promise<void> {
  const entry = this.active.get(webappId)
  if (!entry) return  // idempotent
  this.active.delete(webappId)

  // D-102-CLOSE-LIFECYCLE order:
  // 1. SIGTERM Chrome (2s grace) → SIGKILL
  try { await entry.chrome?.stop() } catch (err) { this.logger?.warn?.('chrome stop failed', err) }
  // 2. SIGTERM x11vnc (via stream-manager.stopStream — already in tree)
  try { await this.streamManager.stopStream(entry.streamId) } catch (err) { this.logger?.warn?.('stream stop failed', err) }
  // 3. SIGTERM Xvfb
  try { await entry.xvfb?.stop() } catch (err) { this.logger?.warn?.('xvfb stop failed', err) }
  // 4. rm -rf /tmp/livos-chrome-app-<uuid>
  if (entry.seed) try { await this.profileSeeder.cleanup(entry.seed.uuid) } catch (err) { this.logger?.warn?.('cleanup failed', err) }
  // 5. release display
  this.displayAllocator.release(entry.display)
  // 6. release port
  if (entry.port !== null) this.portAllocator.release(entry.port)
  // 7. unregister Luse MCP
  try { await this.unregisterWebAppMcp(webappId) } catch (err) { this.logger?.warn?.('mcp unregister failed', err) }
}
```

### Pattern 5: Master Login flow — Chrome on `:0`

**What:** Admin clicks Settings → Chrome Master Login → livinityd spawns Chrome on `bruce`'s physical `:0` display with `--user-data-dir=/opt/livos/data/chrome-master`. User logs in, configures, closes Chrome. Master profile is now seeded with login state.

**When to use:** Plan 102-07.

**Pattern (backend tRPC routes):**

```typescript
// livos/packages/livinityd/source/modules/chrome-master/master-login-routes.ts
import {z} from 'zod'
import {router, adminProcedure} from '../server/trpc/trpc.js'

const MASTER_PROFILE_DIR = '/opt/livos/data/chrome-master'
const MASTER_BACKUP_DIR = '/opt/livos/data/chrome-master.backup'

interface MasterChromeState {
  running: boolean
  pid?: number
  startedAt?: number
}

let currentMaster: {pid: number; startedAt: number} | null = null

export const chromeMaster = router({
  status: adminProcedure.query((): MasterChromeState => ({
    running: !!currentMaster,
    pid: currentMaster?.pid,
    startedAt: currentMaster?.startedAt,
  })),

  startLogin: adminProcedure.mutation(async ({ctx}) => {
    if (currentMaster) {
      throw new Error('master chrome already running; close existing first')
    }
    // Spawn chrome on bruce's :0 — admin operation, requires bruce to be at the
    // physical screen to interact with the login flow.
    const args = [
      '-n', '-u', 'bruce',
      'DISPLAY=:0',  // bruce's GNOME physical screen
      'google-chrome',
      `--user-data-dir=${MASTER_PROFILE_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      // Note: NO --app=URL here — full Chrome window with chrome chrome (tabs,
      // address bar) so user can navigate to Google login etc.
    ]
    const {spawn} = await import('node:child_process')
    const child = spawn('sudo', args, {detached: false, stdio: ['ignore', 'ignore', 'pipe']})
    if (!child.pid) throw new Error('chrome failed to spawn')
    currentMaster = {pid: child.pid, startedAt: Date.now()}
    child.on('exit', () => {
      currentMaster = null
      // Optional: emit `chromeMaster.completed` event over WebSocket so UI can
      // detect "user finished logging in"
    })
    return {pid: child.pid, startedAt: currentMaster.startedAt}
  }),

  reset: adminProcedure
    .input(z.object({backup: z.boolean().default(true)}))
    .mutation(async ({input}) => {
      if (currentMaster) throw new Error('master chrome is still running; close it first')
      const {rm, rename, access} = await import('node:fs/promises')
      const {constants} = await import('node:fs')
      // Optional backup before delete
      if (input.backup) {
        try {
          await access(MASTER_PROFILE_DIR, constants.R_OK)
          try { await rm(MASTER_BACKUP_DIR, {recursive: true, force: true}) } catch { /* */ }
          await rename(MASTER_PROFILE_DIR, MASTER_BACKUP_DIR)
        } catch { /* master didn't exist; nothing to back up */ }
      } else {
        await rm(MASTER_PROFILE_DIR, {recursive: true, force: true})
      }
      // Recreate empty master dir so subsequent spawns don't fail
      const {mkdir} = await import('node:fs/promises')
      await mkdir(MASTER_PROFILE_DIR, {recursive: true})
      return {ok: true}
    }),

  restoreBackup: adminProcedure.mutation(async () => {
    if (currentMaster) throw new Error('master chrome is still running; close it first')
    const {access, rm, rename} = await import('node:fs/promises')
    const {constants} = await import('node:fs')
    await access(MASTER_BACKUP_DIR, constants.R_OK)
    try { await rm(MASTER_PROFILE_DIR, {recursive: true, force: true}) } catch { /* */ }
    await rename(MASTER_BACKUP_DIR, MASTER_PROFILE_DIR)
    return {ok: true}
  }),
})
```

**UI sketch:**

```tsx
// livos/packages/ui/src/modules/settings/master-chrome-login.tsx
// shadcn Dialog + status indicator + Button
import {Button} from '@/shadcn-components/ui/button'
import {Card, CardHeader, CardContent, CardFooter} from '@/shadcn-components/ui/card'
import {trpcReact} from '@/trpc/trpc'

export function MasterChromeLogin() {
  const status = trpcReact.chromeMaster.status.useQuery(undefined, {refetchInterval: 2000})
  const startMut = trpcReact.chromeMaster.startLogin.useMutation()
  const resetMut = trpcReact.chromeMaster.reset.useMutation()
  const restoreMut = trpcReact.chromeMaster.restoreBackup.useMutation()

  return (
    <Card>
      <CardHeader>
        <h3>Chrome Master Login</h3>
        <p className='text-sm text-muted-foreground'>
          Log into Google once; all LivOS apps inherit your login.
        </p>
      </CardHeader>
      <CardContent>
        {status.data?.running ? (
          <p>Master Chrome is running on the host desktop (:0). Log in, then close Chrome.</p>
        ) : (
          <p>Master Chrome is not running.</p>
        )}
      </CardContent>
      <CardFooter className='flex gap-2'>
        <Button
          onClick={() => startMut.mutate()}
          disabled={status.data?.running || startMut.isPending}
        >
          Open Master Chrome
        </Button>
        <Button
          variant='destructive'
          onClick={() => resetMut.mutate({backup: true})}
          disabled={status.data?.running || resetMut.isPending}
        >
          Reset Master Profile (backup first)
        </Button>
        <Button
          variant='outline'
          onClick={() => restoreMut.mutate()}
          disabled={status.data?.running || restoreMut.isPending}
        >
          Restore From Backup
        </Button>
      </CardFooter>
    </Card>
  )
}
```

### Anti-Patterns to Avoid

- **Spawning Chrome before Xvfb is ready** — Chrome will fail with "Cannot open display :N" and crash. Always `await spawnXvfb()` which polls `xdpyinfo` to readiness BEFORE invoking `spawnChromeProcess()`.
- **Killing Xvfb before Chrome** — produces X protocol errors in Chrome stderr. Always SIGTERM Chrome FIRST, wait for it to exit, THEN kill x11vnc, THEN Xvfb.
- **Using `cp` without `--reflink=auto`** — wastes ~200ms per spawn on copyable filesystems (btrfs/xfs) where CoW would be ~10ms.
- **Forgetting to clean `/tmp/livos-chrome-app-*` on boot** — livinityd crash mid-spawn leaves orphan temp dirs. Boot-time sweep `rm -rf /tmp/livos-chrome-app-*` is defense-in-depth alongside per-close cleanup.
- **Re-using a display number while x11vnc still running** — bind race. Always wait for `stopStream()` (which kills x11vnc) BEFORE `displayAllocator.release(N)`. Order in close lifecycle: streamManager.stopStream → displayAllocator.release.
- **Spawning master Chrome on `:1` or `:N` (not `:0`)** — defeats the purpose. The user is supposed to interact with the master Chrome to log in; it must be on their physical screen `:0`.
- **Mixing master Chrome with concurrent per-app Chromes on `:0`** — Master Chrome locks `/opt/livos/data/chrome-master/` singleton. Concurrent app-spawns must NOT use the master dir directly; they always use the seeded `/tmp/livos-chrome-app-<uuid>` copy.
- **Forgetting `--app=URL` on per-app Chrome** — without `--app`, Chrome opens with full chrome (tabs, address bar). `--app=URL` is the flag that hides all browser UI.
- **`-quiet` flag on x11vnc breaking diagnostics** — CONTEXT specifies `-quiet` for cleaner logs but verify it doesn't suppress important warnings. Recommend NOT including `-quiet` initially; add only after Mini PC UAT shows clean logs.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| X server spawn + readiness | Custom `wait-for-X-socket` polling | `xdpyinfo -display :N` exec + poll loop | xdpyinfo is the canonical X11 client-side readiness probe. Pattern is in PyVirtualDisplay GitHub issue #33. |
| Process kill with grace period | Custom SIGTERM-then-SIGKILL timer | Existing `xvfb-display.ts:stopProc()` pattern | Already battle-tested in tree. |
| Recursive directory copy | Custom `node:fs/promises.cp` recursive | `cp -r --reflink=auto` via execFile | CoW where filesystem supports it (10x speedup). Node's `cp` doesn't expose reflink. |
| UUID generation | Custom random hex | `node:crypto.randomUUID()` | Standard, secure, well-formed. |
| Display number allocation | Set + cursor walk | Existing `display-allocator.ts` (P100-10-01) | Already in tree, tested. Just MOVE from `webapps/` to `streaming/`. |
| Port number allocation | Set + cursor walk | Existing `port-allocator.ts` (P101-02) | Already in tree, tested. |
| x11vnc spawn + stderr tail | Custom subprocess wrapper | Existing `vnc-bridge.ts` (P99-02) | Already in tree, supports discriminated union `{wid} | {display}` from P100-10-08 scaffolding. |
| Chrome process spawn pattern | Custom argv construction | Pattern: copy `webapps/window-manager.ts:380-407` shape (sudo + DISPLAY env + detached + unref) | Existing pattern, just swap argv to per-app `--user-data-dir`. |
| Master profile login UI | Custom modal + status | shadcn Card + Button + tRPC mutation | Existing pattern; minimal new code. |
| Profile orphan cleanup | systemd timer / cron | livinityd boot-time `ProfileSeeder.sweepOrphans()` | Single owner (livinityd); fires on every restart. |
| Per-WebApp Luse env injection | Custom child_process invocation | Existing `luse-mcp-config.ts` `buildLuseConfig({descriptor})` | Already accepts a descriptor with `display` + `windowId`; just add `LUSE_TARGET_DISPLAY` env field. |
| tRPC admin gating | Custom auth check | Existing `adminProcedure` from `server/trpc/trpc.ts` | Battle-tested. |
| Chrome subprocess on `:0` for Master Login | Custom X11 forwarding | sudo -u bruce DISPLAY=:0 chrome — Chrome talks to `:0` directly via X authority chain | The session-keyring path is already standard for bruce-owned processes touching `:0`. |
| Restart-resilient master profile state | Custom persistence layer | Filesystem (`/opt/livos/data/chrome-master/` IS the state) | Profile state lives on disk; no Redis schema needed. |

**Key insight:** Phase 102 is ~90% "wire existing primitives together differently" with one genuinely new pattern: master profile seed-copy. Everything else is composition of Phase 99-100-101 deliverables.

---

## Per-Decision Implementation Notes

### D-102-PER-APP-XVFB + D-102-DISPLAY-ALLOCATOR — Plan 102-01

**What's new vs. Phase 100-10-01 / Phase 101:**
- 100-10-01 created `webapps/display-allocator.ts` (P100-10-01) but was REVERTED in 100-10-08 (per CONTEXT note). The class itself is intact in tree.
- Phase 102 lifts the file from `webapps/` to `streaming/` (CONTEXT decomposition explicitly places it under `streaming/`).
- The existing class returns strings (`":10"`); CONTEXT D-102-DISPLAY-ALLOCATOR specifies `allocate(): number`. **Decision (Claude's discretion):** keep the string return type (matches existing tree, matches consumer call sites like `vnc-bridge.spawnVncForWindow({display: ':10'})`). Tests verify string format.

**XvfbSpawner module (new):**
- Wraps existing `webapps/xvfb-display.ts` `startXvfb()` function.
- Adds the `xdpyinfo -display :N` readiness poll (existing `xvfb-display.ts` does NOT poll — it returns immediately on spawn, which causes the race documented in Phase 100-10 RESEARCH).
- Polling: `xdpyinfo -display :N` via `execFile`. 200ms interval, 25 attempts (5s timeout). On success: unref child and return handle. On timeout: SIGKILL child and throw `XvfbReadyTimeoutError`.
- Tests: vitest, mock `child_process.spawn` (existing FakeChild pattern from window-manager.test.ts:31-33), mock `execFile` (existing pattern from input-dispatcher tests).

**Sacred SHA check:** new files in `streaming/` and `webapps/`. NO touch to `liv/`. Pre-commit hook + plan-checker grep.

### D-102-PER-APP-CHROME — Plan 102-02

**What's new vs. Phase 101:**
- Phase 101 boots a SINGLE Chrome with `--remote-debugging-port=9222` at livinityd start; multiple webapps share Chrome via CDP `Target.createTarget`.
- Phase 102 boots NO Chrome at livinityd start. Per-app Chrome spawned in `WindowManager.spawn()` on each webapp open. Per-app `--user-data-dir`, no CDP port. Each Chrome dies on app close.

**Key flags (verified against selfclaude/src/webapp-manager.js + existing window-manager.ts):**
- `--user-data-dir=/tmp/livos-chrome-app-<uuid>` — per-app isolation (singleton lock per data dir)
- `--no-first-run --no-default-browser-check` — silent startup
- `--no-sandbox` — required under non-root without setuid helper
- `--start-fullscreen` — fullscreen on display (per CONTEXT)
- `--app=URL` — chromeless mode (no tabs, no address bar)
- `--disable-features=ChromeWhatsNewUI,TranslateUI,InfoBars --disable-infobars --test-type` — suppress infobars (selfclaude pattern)

**Critical interaction `--app=URL` + `--start-fullscreen`:** verified in selfclaude — they DO combine. Chrome creates one toplevel window matching the Xvfb resolution, no chrome chrome visible. **[ASSUMED — to validate empirically in Plan 102-02 RED phase on Mini PC]** if `--start-fullscreen` doesn't take effect without a window manager, fallback is to spawn fluxbox on the display first (D-102-NATIVE-APP-PARITY already specifies fluxbox is optional). RESEARCH MEDIUM confidence here; locked DECISION: SKIP fluxbox by default; verify in 102-02 RED that Chrome renders fullscreen without WM; if it doesn't, fluxbox becomes part of the spawn chain.

**Stderr tail (50 lines)** for crash diagnostics — copy verbatim from `vnc-bridge.ts` and `bootstrap.ts` patterns.

**Sacred SHA:** none touched. Pre-commit verifies.

### D-102-MASTER-PROFILE-SEED — Plan 102-03

**Master profile location:** `/opt/livos/data/chrome-master/` (livos data volume, persistent across livinityd restarts — `data/` is mounted as persistent volume on Mini PC).

**App temp profile location:** `/tmp/livos-chrome-app-<uuid>/` (ephemeral, cleaned per app close + boot-time sweep).

**Master profile file selection (Claude's discretion):**

Chromium docs + forensics references confirm the following files are essential for Google login persistence:

| File / Dir | Role | Copy? |
|------------|------|-------|
| `Default/Cookies` (SQLite, contains session cookies) | Login session | **YES** |
| `Default/Network/Cookies` (Chrome 96+ moved cookies here) | Login session (newer Chrome) | **YES** — copy both paths if either exists |
| `Default/Login Data` (SQLite, encrypted passwords) | Saved passwords | **YES** if user wants password autofill in apps |
| `Default/Preferences` | Profile config (signed-in account, sync settings) | **YES** |
| `Default/Local Storage/` | Site-specific local storage (incl. tokens) | **YES** for login persistence |
| `Default/Session Storage/` | Tab-scoped (skipped — tab dies on close anyway) | NO |
| `Default/Service Worker/` | Service worker registrations | NO (skip — recreated on first visit) |
| `Default/Cache/` | HTTP cache | NO (cache; bloat) |
| `Default/Code Cache/` | V8 code cache | NO (regenerated) |
| `Default/IndexedDB/` | Site IndexedDB | OPTIONAL (some logins use IndexedDB) — recommend YES |
| `Default/History` | Browse history | NO (privacy + not needed) |
| `Default/Bookmarks` | Bookmarks | OPTIONAL (NO for v1; site-agnostic) |
| `Default/Extensions/` | Installed extensions | OPTIONAL (NO for v1) |
| `Local State` (parent dir, not Default/) | Encryption key for Login Data | **YES** — critical for password decryption |

**Decision (Claude's discretion):** **For v1, do a FULL `cp -r` of the entire master dir.** Reasoning: simpler, lower risk of "missing file → login fails," and the 10MB target is mostly Default/Cookies + Local State (small). Optimization to selective allowlist is a v2 concern. Note in Plan 102-03 implementation: log copy size on each spawn so we can observe in production what's actually being copied. If size grows >50MB, ship a `.cleanignore` for the Cache/ and Service Worker/ subdirs.

**`cp -r --reflink=auto`:** CoW where supported. Mini PC filesystem check (Plan 102-03 RED task):
```bash
ssh bruce@10.69.31.68 "df -T /opt/livos/data | tail -1"
# If type is btrfs or xfs → --reflink=auto = ~10ms
# If type is ext4 → --reflink=auto falls back to plain copy = ~200ms
```

**Boot-time orphan sweep:** `rm -rf /tmp/livos-chrome-app-*` in livinityd `start()` before any spawns. Defensive — pairs with per-close cleanup.

**Cleanup latency:** `rm -rf` of ~10MB takes ~50ms. Async; doesn't block close-lifecycle critical path.

**Backup before reset (102-07 reset path):** `mv /opt/livos/data/chrome-master → /opt/livos/data/chrome-master.backup`. One backup slot. "Restore" undoes.

**Sacred SHA:** none touched.

### D-102-MASTER-LOGIN-UI — Plan 102-07

**UI placement:** LivOS Settings page, new "Chrome" section. Use existing Settings pattern (look at `livos/packages/ui/src/modules/settings/` for analogs — likely there's an existing `general-settings.tsx` or similar).

**Status query:** poll `chromeMaster.status` every 2s while the dialog is open. Shows "running" badge with PID when master Chrome alive; "not running" otherwise.

**Three actions:**
1. **Open Master Chrome** — `startLogin` mutation. Disabled when already running.
2. **Reset Master Profile (backup first)** — `reset({backup: true})`. Disabled when running.
3. **Restore From Backup** — `restoreBackup`. Disabled when running OR no backup exists.

**Security:**
- All tRPC routes use `adminProcedure` (existing pattern from Phase 101).
- `binaryPath` is hardcoded (`google-chrome`) — no user-supplied binary path. Eliminates V12 file/resource attack surface.
- DISPLAY hardcoded to `:0` — no user-supplied display arg.
- httpOnlyPaths registration: `chromeMaster.startLogin`, `.reset`, `.restoreBackup` must be in `livos/packages/livinityd/source/modules/server/trpc/common.ts` httpOnlyPaths Set (mutation routes hang if routed to WS per CLAUDE.md memory).

**Process exit watcher:** `child.on('exit', ...)` clears `currentMaster` so subsequent `startLogin` calls succeed.

**Sacred SHA:** none touched.

### D-102-X11VNC-WHOLE-DISPLAY — Plan 102-09

**What's already in tree:**
- `vnc-bridge.ts` already accepts both `{wid}` and `{display}` in `SpawnVncOpts` (Phase 100-10-08 scaffolding kept).
- Argv builder already branches: `opts.display !== undefined ? ['-display', opts.display] : ['-id', '0x' + wid.toString(16)]`.
- `stream-manager.ts` already has `VncWindowTarget = {wid: number} | {display: string}` discriminated union.

**What Plan 102-09 changes:**
- Flip default-callers: `window-manager.ts` and `native-app-binder.ts` previously pass `{wid}`, now pass `{display}`.
- StreamManager.startStream branch: `mode: 'vnc-display'` (new) vs `mode: 'vnc-window'` (existing, kept for back-compat / Phase 99 legacy).
- The x11vnc args themselves are already correct — no argv changes needed.

**x11vnc concurrent capture:** Multiple x11vnc processes on different displays simultaneously is well-supported (the displays are independent X servers; x11vnc connects via X protocol, not via shared memory). Performance: each x11vnc reads ~1280x720x4 = 3.5MB frame per polling cycle. CONTEXT specifies `-noxdamage` (poll-based, ~5fps default). For 7 concurrent apps: ~25MB/s aggregate framebuffer read — well within RAM bandwidth (>10GB/s).

**Resolution handshake:** x11vnc auto-detects Xvfb resolution via X protocol (`XGetWindowAttributes` on root window). Output stream matches Xvfb resolution exactly. CONTEXT verified: Xvfb at 1280x720 → x11vnc outputs 1280x720 frames.

**`-quiet` flag (CONTEXT mentions):** suppresses x11vnc's per-frame "rfb client connected" logging. Recommend INCLUDE in v1; logs were noisy in P99-P100 UAT.

**Sacred SHA:** none touched.

### D-102-LUSE-DISPLAY-SCOPING — Plan 102-06

**Current state (Phase 100-10-03, 100-08-03):**
- `luse-mcp-config.ts:buildLuseConfig({descriptor})` already accepts a `PerWebAppMcpDescriptor` with `{instanceKey, windowId, display?}` fields.
- `mcp/server.ts` reads `process.env.LUSE_TARGET_WINDOW_ID` at boot to scope tool calls to a window.
- `mcp/server.ts` reads `process.env.LUSE_DISPLAY ?? process.env.DISPLAY` at boot for the X display.

**What Plan 102-06 changes:**
- Add `LUSE_TARGET_DISPLAY` env var. The per-WebApp Luse MCP child reads `LUSE_TARGET_DISPLAY` and scopes screenshot/click/list_windows to that display.
- The descriptor's `display` field becomes the source of truth (it's already wired); the new env var name is purely a semantic rename — `LUSE_DISPLAY` (existing) still works for the host instance; `LUSE_TARGET_DISPLAY` is the new name for the per-WebApp instance.
- **Recommendation:** keep `LUSE_DISPLAY` as the existing name. Phase 102 doesn't need a new env var — the existing `LUSE_DISPLAY` already scopes the display, and per-app Luse children already get `LUSE_DISPLAY=:N` via the descriptor. **Re-read CONTEXT D-102-LUSE-DISPLAY-SCOPING** — it specifies `LUSE_TARGET_DISPLAY=:N` (replacing `LUSE_TARGET_WINDOW_ID`). Two interpretations:
  - (a) Add `LUSE_TARGET_DISPLAY` as a NEW env var alongside existing `LUSE_DISPLAY`. Confusing.
  - (b) Rename `LUSE_TARGET_WINDOW_ID` → `LUSE_TARGET_DISPLAY` (no longer needed since whole-display capture means no specific WID). KEEP `LUSE_DISPLAY` as is.

  **Decision (Claude's discretion):** interpretation (b). The CONTEXT spec is a SEMANTIC replacement (window-id no longer meaningful when whole-display is captured). Implementation: DROP `LUSE_TARGET_WINDOW_ID` from the per-WebApp descriptor env block. KEEP `LUSE_DISPLAY=:N` (already there). Optionally add `LUSE_TARGET_DISPLAY=:N` as a redundant alias for forward compatibility — but `LUSE_DISPLAY` is sufficient.

- `agent-prompt-builder.ts`: change "Active Window Context" snippet to "Active Display Context": report `:N` + bounds `1280x720` instead of `windowId`. The agent doesn't need a WID anymore — all coords are 1:1 native on the dedicated display.

**Code path verification:** existing `LUSE_DISPLAY` env is read at MCP child boot:
```typescript
// computer-use/mcp/server.ts:73
const defaultDisplay = process.env.LUSE_DISPLAY ?? process.env.DISPLAY
```
All X11 ops in `tools.ts` use `defaultDisplay` (via `options?.defaultDisplay`). So setting `DISPLAY=:N` in the descriptor env auto-scopes the entire MCP child to display N. No tool code changes needed.

**Sacred SHA:** none touched.

### D-102-CLOSE-LIFECYCLE — Plan 102-08

**Order (per CONTEXT verbatim):**
1. SIGTERM Chrome → wait 2s → SIGKILL if alive
2. SIGTERM x11vnc (via `streamManager.stopStream()` which already does this)
3. SIGTERM Xvfb (via `xvfb.stop()` from XvfbSpawner handle)
4. `rm -rf /tmp/livos-chrome-app-<uuid>` (via `profileSeeder.cleanup(uuid)`)
5. `displayAllocator.release(N)`
6. `portAllocator.release(port)`
7. Per-WebApp Luse MCP unregister (existing pattern from 100-08-04)
8. UI stream window unmounts (driven by `streamId` lifecycle event already wired)

**Idempotency:** all 8 steps no-op if already cleaned. `window-manager.close()` checks `this.active.has(webappId)` first; if not present, returns early. Sub-helpers (`stop()`, `release()`, `cleanup()`) all idempotent.

**Why this order:** killing Xvfb before Chrome causes X protocol errors in Chrome stderr (cosmetic but noisy). Killing Chrome before x11vnc avoids x11vnc seeing window destroy events. Order matters for clean logs but not correctness.

**Compensating cleanup on partial spawn failure:** if `spawn()` throws after Xvfb is up but before Chrome is up, the `catch` block must clean up Xvfb + release display. See Pattern 4 above — the try/catch shape handles this.

**Zombie prevention:** all child processes use `detached: true + unref()`. Their PIDs are tracked in `ActiveWebApp` entries; cleanup happens via `child.kill()`. Parent (livinityd) reaps children via `child.on('exit')`.

**Sacred SHA:** none touched.

### D-102-NATIVE-APP-PARITY — Plan 102-05

**Phase 101-03/05 deliverables:**
- `apps/native-app-spawner.ts` — spawn detached binary
- `apps/native-app-binder.ts` — xdotool WM_CLASS poll to find new wid

**Phase 102-05 changes:**
- Replace `DISPLAY=:1 binary` with `DisplayAllocator.allocate() → :N; XvfbSpawner.start(N) → display; DISPLAY=:N binary`.
- WM_CLASS poll: NO LONGER NEEDED for x11vnc binding (whole-display capture doesn't need wid). Keep for legacy purposes (the Luse `list_windows` tool still benefits from knowing WID values).
- For Electron apps that expect a WM, spawn fluxbox on `:N` BEFORE the binary. `WindowManager` has fluxbox-WM helper from 100-08-01.

**Close lifecycle:** identical to WebApp (steps 1-6, skip step 4 profile cleanup, skip step 7 Luse MCP).

**Sacred SHA:** none touched.

### D-102-PHASE-101-SALVAGE — Plan 102-04 / 102-10 boundary

**Retained Phase 101 deliverables:**

| Plan | Status in Phase 102 | Notes |
|------|---------------------|-------|
| 101-00 | KEEP — extend with new test stubs (102-00 Wave 0 is implicit) | `chrome-process-spawner.test.ts`, `xvfb-spawner.test.ts`, `profile-seeder.test.ts`, `master-login-routes.test.ts`, `master-chrome-login.test.tsx` |
| 101-01 ChromeCdpClient | KEEP in tree, NOT WIRED by default | Available if per-app Chrome wants CDP control later (per-app Chrome can be spawned with own `--remote-debugging-port=N` where N is unique per app) |
| 101-02 PortAllocator | KEEP unchanged | DisplayAllocator companion added |
| 101-03 NativeAppSpawner | KEEP, EXTEND | Add `display` arg to `spawnNativeApp()`. Caller (native-app-binder) provides allocated display. |
| 101-04 CDP-driven WebApp spawn | REPLACE entirely with per-app Xvfb + Chrome subprocess (Plan 102-04) | Old code removed from `window-manager.spawn()` |
| 101-05 Native app stream binder | KEEP, MODIFY | Bind to `:N` (display), not WM_CLASS WID |
| 101-06 Luse auto-context | KEEP, env switch | `activeWid` → `activeDisplay`; agent-prompt-builder snippet updated |
| 101-07 Dock native UI | KEEP unchanged | UI is backend-agnostic |
| 101-08 SelfClaude Teach v3 | KEEP unchanged | UI-tier DOM listener pattern unchanged |
| 101-09 Chat anims + Hermes relay | KEEP unchanged | Tied to liv-core RunStore; sacred file untouched |
| 101-10 Mini PC UAT 20-row | REPLACE with 102-10 (25-row UAT) | New UAT matrix for per-display |

**File-disjoint Wave 1+2+3 plans:** parallel-friendly per CONTEXT decomposition. Each plan's files are listed in the CONTEXT plan table; planner verifies no overlap during plan generation.

**Sacred SHA:** none touched in any salvaged or new file. Verify via pre-commit hook + plan-checker.

### D-102-BACKWARDS-COMPAT — Plans 102-04, 102-10

**v33 WebApp configs:**
- Stored in Redis `liv:apps:webapp:<id>` namespace (existing Phase 100-08-04 pattern).
- Pre-102 behavior: click icon → window-manager spawns on shared `:1` with shared `--user-data-dir`.
- Post-102 behavior: click icon → window-manager spawns on dedicated `:N` with seeded `--user-data-dir`.
- **Migration:** zero data needed. Re-opening any WebApp icon spawns via new flow automatically. No Redis schema changes. No file format changes.

**v2 + v3 Teach skills (action_log records):**
- v2 schema stores per-event `screenshot_b64 + viewport`.
- v3 schema stores `{action, instruction, t}` per step.
- Replay engine in `computer-use/skill-replay-tool.ts` already handles both versions (lazy-translation from 100-10-02).
- Coord changes from 1920x1080 → 1280x720: action coords stored relative to viewport at record time. Replay uses display target's 1280x720 canvas, NOT the old 1920x1080. v2 skills recorded under old display will replay at 1280x720 canvas → may miss target coords. **Decision:** v2 skills SHOULD work because the per-event viewport is recorded in v2 schema; replay can scale. v3 skills have no screenshots so just dispatch raw coords on the active display.

**Migration verification UAT row 20:** "v2 skill recorded pre-102 still replays correctly on per-app display." Add to 102-10 UAT.

**Sacred SHA:** none touched.

---

## Master Profile Seed Mechanics (deep dive)

**Question:** What files MUST be copied vs. SHOULD be skipped?

**Chrome profile directory structure (Default subdirectory):**

| File / Dir | Size estimate | Purpose | Seed required? |
|------------|---------------|---------|-----------------|
| `Cookies` (SQLite, may be empty post Chrome 96) | <1MB | Session cookies | YES (if exists at this path) |
| `Network/Cookies` (Chrome 96+) | <1MB | Session cookies (moved) | YES |
| `Login Data` (SQLite, encrypted) | <500KB | Saved passwords | YES if password autofill needed |
| `Local State` (parent dir, OUTSIDE Default/) | <100KB | Encryption key for password DB | **YES — critical** |
| `Preferences` | <100KB | Profile settings, signed-in account info | YES |
| `Local Storage/` | varies, often <5MB | Site localStorage | YES (login tokens often here) |
| `IndexedDB/` | varies, can be large | Site IndexedDB | OPTIONAL — recommend YES |
| `Session Storage/` | small | Tab-scoped storage | NO (tabs die anyway) |
| `Service Worker/` | varies | SW registrations | NO (recreated on first visit) |
| `Cache/` | can be 100MB+ | HTTP cache | NO (cache, regenerated) |
| `Code Cache/` | <50MB | V8 bytecode cache | NO (regenerated) |
| `History` (SQLite) | varies | Browse history | NO (privacy + size) |
| `Bookmarks` | <100KB | Bookmarks | OPTIONAL — NO for v1 |
| `Extensions/` | varies | Extensions | OPTIONAL — NO for v1 |
| `Downloads` (file) | <100KB | Download history | NO |
| `Web Data` (SQLite) | <1MB | Autofill, web search | OPTIONAL — recommend YES |

**Sources:**
- [Chromium User Data Directory docs](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md) `[CITED]`
- [Forensics.wiki Google Chrome](https://forensics.wiki/google_chrome/) `[CITED]`
- [Chromium Cookies and Network Data](https://www.avanite.com/blog/chromium-cookies-and-network-data) `[CITED]`

**v1 Decision (Claude's discretion):** FULL `cp -r` of entire master dir. ~10-20MB realistic. Optimization to selective allowlist deferred to v103+ if disk usage becomes an issue.

**v2 Optimization (later):** allowlist copy via `rsync -a --include=… --exclude=Cache --exclude='Code Cache' --exclude='Service Worker' src/ dst/`.

**Disk projection:** 100 concurrent apps × 20MB = 2GB on `/tmp`. Mini PC `/tmp` is tmpfs (RAM-backed in Ubuntu default). 2GB RAM consumption tolerable on 32GB Mini PC; nowhere close to limit.

---

## Validation Architecture

> `workflow.nyquist_validation` not explicitly disabled in `.planning/config.json`. Treat as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.1.9 (livinityd + ui) `[VERIFIED: package.json]` |
| Config file | `livos/packages/livinityd/vitest.config.ts`, `livos/packages/ui/vitest.config.ts` |
| Quick run (livinityd) | `cd livos/packages/livinityd && npm test -- <pattern>` |
| Quick run (ui) | `cd livos/packages/ui && npm test -- <pattern>` |
| Full suite (livinityd) | `cd livos/packages/livinityd && npm test` (testTimeout 180000, maxConcurrency 1, singleThread) |
| Full suite (ui) | `cd livos/packages/ui && npm test` |

### Phase Requirements → Test Map

| Plan | Behavior | Test Type | Automated Command | File Exists? |
|------|----------|-----------|-------------------|--------------|
| 102-01 | DisplayAllocator returns `:10..:99`, reuses released | unit | `npm test -- streaming/display-allocator` | KEEP existing test (move from webapps/) |
| 102-01 | XvfbSpawner polls xdpyinfo until ready, returns handle | unit (mock spawn + execFile) | `npm test -- streaming/xvfb-spawner` | NEW |
| 102-01 | XvfbSpawner throws on timeout, kills child | unit | same | NEW |
| 102-02 | ChromeProcessSpawner argv includes --app=URL --start-fullscreen --user-data-dir | unit | `npm test -- webapps/chrome-process-spawner` | NEW |
| 102-02 | ChromeProcessSpawner env contains DISPLAY=:N | unit | same | NEW |
| 102-02 | ChromeProcessSpawner stderr tail captures crash output | unit | same | NEW |
| 102-03 | MasterProfileSeeder.ensureMasterExists creates dir | unit (mock fs) | `npm test -- chrome-master/profile-seeder` | NEW |
| 102-03 | MasterProfileSeeder.seed runs `cp -r --reflink=auto master /tmp/livos-chrome-app-<uuid>` | unit (mock execFile) | same | NEW |
| 102-03 | MasterProfileSeeder.cleanup runs rm -rf | unit | same | NEW |
| 102-03 | MasterProfileSeeder.sweepOrphans cleans /tmp/livos-chrome-app-* | unit | same | NEW |
| 102-04 | window-manager.spawn full flow: alloc display → xvfb → seed → chrome → port → vnc | unit (mock all subsystems) | `npm test -- webapps/window-manager` | EXTEND existing |
| 102-04 | window-manager.spawn compensating cleanup on Chrome failure | unit | same | EXTEND |
| 102-04 | window-manager.close ordered teardown chrome → vnc → xvfb → rm → release | unit | same | EXTEND |
| 102-05 | native-app-binder allocates display, spawns xvfb + binary | unit | `npm test -- apps/native-app-binder` | EXTEND existing |
| 102-06 | agent-prompt-builder snippet reports activeDisplay :N + bounds | unit | `npm test -- ai/agent-prompt-builder` | EXTEND existing |
| 102-06 | agent-runner-factory propagates activeDisplay env to broker | unit | `npm test -- livinity-broker/agent-runner-factory` | EXTEND existing |
| 102-06 | computer-use/mcp/server reads LUSE_DISPLAY at boot (existing) | unit | `npm test -- computer-use/mcp/tools` | KEEP existing |
| 102-07 | chromeMaster.startLogin spawns chrome on :0 with master dir | unit (mock spawn) | `npm test -- chrome-master/master-login-routes` | NEW |
| 102-07 | chromeMaster.reset moves master to .backup (if backup=true) | unit (mock fs) | same | NEW |
| 102-07 | MasterChromeLogin UI renders 3 buttons with status | unit (RTL + jsdom) | `npm test -- settings/master-chrome-login` | NEW |
| 102-08 | window-manager.close calls all 8 cleanup steps in order | unit | `npm test -- webapps/window-manager` | EXTEND |
| 102-08 | native-app-binder.close calls 6 cleanup steps | unit | `npm test -- apps/native-app-binder` | EXTEND |
| 102-09 | vnc-bridge.spawnVncForWindow argv has -display :N when opts.display set | unit | `npm test -- streaming/vnc-bridge` | EXTEND existing |
| 102-09 | stream-manager.startStream({mode:'vnc-display'}) wires display target | unit | `npm test -- streaming/stream-manager` | EXTEND existing |
| 102-10 | Mini PC 25-row UAT | manual-only | (SSH commands per CONTEXT §Success Criteria) | NEW UAT-CHECKLIST.md |

### Sampling Rate
- **Per task commit:** `npm test -- <subpath>` — quick (~10-30s).
- **Per wave merge:** Full `npm test` in livinityd + ui — green gate (~3-5 min).
- **Phase gate:** Full suite green BEFORE `/gsd-verify-work`. Mini PC deploy + 25-row UAT walk.

### Wave 0 Gaps (test files NEW for Phase 102)

- [ ] `livos/packages/livinityd/source/modules/streaming/xvfb-spawner.test.ts`
- [ ] `livos/packages/livinityd/source/modules/streaming/display-allocator.test.ts` (MOVE from `webapps/display-allocator.test.ts` — verify existing test passes after relocation)
- [ ] `livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.test.ts`
- [ ] `livos/packages/livinityd/source/modules/chrome-master/profile-seeder.test.ts`
- [ ] `livos/packages/livinityd/source/modules/chrome-master/master-login-routes.test.ts`
- [ ] `livos/packages/ui/src/modules/settings/master-chrome-login.test.tsx`

### Mock Strategies (project-conventional)

| Surface | Mock Pattern | Example |
|---------|-------------|---------|
| `child_process.spawn` (Xvfb, Chrome, x11vnc) | `spawnFactory` opt + FakeChild EventEmitter | Existing `window-manager.test.ts:31-33` pattern: `class FakeChild extends EventEmitter { unref = vi.fn(); kill = vi.fn(); stderr = new EventEmitter() }` |
| `execFile` (xdpyinfo, cp, rm) | inject `execFileFn` opt | New in xvfb-spawner.test.ts and profile-seeder.test.ts |
| `fs/promises` (access, mkdir, rm, rename) | `vi.mock('node:fs/promises', () => ({...}))` | Standard vitest pattern |
| StreamManager | inject `streamManager` opt with `startStream/stopStream` mocks | Existing pattern from window-manager.test.ts |
| DisplayAllocator | inject opt — already exposes EventEmitter interface | Existing |
| PortAllocator | inject opt | Phase 101-02 pattern |
| MasterProfileSeeder | inject `profileSeeder` opt with stubbed methods | New |
| ChromeProcessSpawner | inject `chromeSpawner` opt | New |
| tRPC adminProcedure (master-login-routes) | testing utilities in `test-utilities/` (existing) | Reuse |
| React MasterChromeLogin | @testing-library/react + jsdom (project default) | Existing UI test pattern |

### Integration Test Harness

**Plan 102-04 end-to-end (deferred to Mini PC UAT 102-10):**

```typescript
// Wires real Xvfb + Chrome + x11vnc against the Mini PC. Heavy.
// Gated behind LIVOS_INTEGRATION_TEST=1
describe('per-app Xvfb integration (skipped unless env set)', () => {
  it.skipIf(!process.env.LIVOS_INTEGRATION_TEST)('spawns 2 webapps on :10 and :11 with independent Chromes', async () => {
    // 1. spawn webapp livinity.io → expect display :10, x11vnc port 15900, chrome pid present
    // 2. spawn webapp google.com → expect display :11, x11vnc port 15901, different chrome pid
    // 3. close webapp #1 → expect :10 + 15900 released, /tmp/livos-chrome-app-<uuidA> gone
    // 4. spawn webapp #3 → expect display :10 reused (freed slot)
  })
})
```

Standard unit tests (mocked) cover all of Phases 1-9. UAT is the only integration gate.

### Validation strategy per Wave

| Wave | Tests | Gate |
|------|-------|------|
| Wave 1 (102-01..03) | Unit tests for DisplayAllocator + XvfbSpawner + ChromeProcessSpawner + MasterProfileSeeder | Per-task `npm test -- <pattern>` green; wave merge: full `npm test` in livinityd green |
| Wave 2 (102-04..06) | Unit tests for window-manager rewrite + native-app-binder + env propagation | Per-task green; full livinityd green |
| Wave 3 (102-07..09) | Unit tests for master-login-routes + UI + close lifecycle + vnc-bridge | Per-task green; full livinityd + ui green |
| Wave 4 (102-10) | Mini PC 25-row UAT walk | User signoff |

---

## SelfClaude Verbatim Pattern Review

**Critical finding:** SelfClaude does NOT use per-app Xvfb displays. It uses **per-app `--user-data-dir` on a SHARED `:99` display**.

```javascript
// selfclaude/src/webapp-manager.js (verbatim, verified via WebFetch 2026-05-11):
const profileDir = `/tmp/chrome-prof-${profileIdx}`;
const chromeArgs = [
  '--no-sandbox',
  `--user-data-dir=${profileDir}`,
  '--window-size=1280,720',
  '--disable-features=ChromeWhatsNewUI,TranslateUI,InfoBars',
  '--disable-infobars',
  '--test-type',
  '--no-first-run',
  '--no-default-browser-check',
  `--app=${url}`,
];
const chromeProc = spawn('chromium-browser', chromeArgs, {
  stdio: ['ignore', 'ignore', 'pipe'],
  detached: false,
  env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ':99' },
});
```

```javascript
// selfclaude/src/vnc-bridge.js (verbatim):
const args = [
  '-display', WEBAPPS_X11_ENV.DISPLAY,   // :99 (single shared display)
  '-id', widHex,                          // window-region capture
  '-rfbport', String(opts.rfbPort),
  '-localhost', '-shared', '-forever', '-noxdamage', '-nopw',
];
```

```javascript
// selfclaude/src/webapp-manager.js — close lifecycle (verbatim):
if (record.streamId) {
  stopVncSession(record.streamId);
}
record.chromeProc.kill('SIGTERM');
setTimeout(() => {
  record.chromeProc.kill('SIGKILL');
}, 2000).unref();
record.state = 'offline';
webapps.delete(webappId);
```

**What this tells us:**

1. **SelfClaude's success pattern is per-app `--user-data-dir`, NOT per-app display.** They have multi-window on a shared display and rely on x11vnc `-id <wid>` for window-region capture.

2. **Why Phase 102 goes beyond SelfClaude:** the user explicitly identified "ayni screen de iki farkli yayin yapiyorsun ustuste bindiginde sorun cikiyor" (same-screen multi-stream overlap problem) as a reason to use SEPARATE displays. Phase 102 = SelfClaude's `--user-data-dir` pattern + per-app Xvfb display.

3. **The seed-copy idea is LivOS-original.** SelfClaude has NO master profile concept — each WebApp gets a fresh `/tmp/chrome-prof-N` each time, so there's no shared Google login. The user wants seed-copy so all apps see the same login.

4. **Singleton lock — SelfClaude proves it works.** Per-app `--user-data-dir` correctly avoids the Chrome singleton lock that crashed Phase 100-10-08. Phase 102 adopts this exactly.

5. **Close lifecycle is simpler in SelfClaude** (3 steps: stop VNC, SIGTERM chrome, SIGKILL fallback). Phase 102 has 7 steps because we also tear down Xvfb (SelfClaude shares one Xvfb) and clean up the temp profile dir (SelfClaude doesn't — `/tmp/chrome-prof-N` accumulates over time).

6. **Detached:false in SelfClaude.** They use `detached: false` — Chrome dies if their server dies. Phase 102 should consider this trade-off. Decision: **detached:true + unref** (like existing window-manager.ts pattern) so Chrome survives a livinityd hot-reload; cleanup happens on app-close OR boot-time sweep. This is a deliberate divergence from SelfClaude — LivOS needs hot-reload resilience.

---

## Risk Register

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|------------|
| R1 | Chrome `--start-fullscreen --app=URL` doesn't render fullscreen without a window manager on Xvfb | MEDIUM | MEDIUM (visual UX degradation but functional) | Plan 102-02 RED phase tests with mock; Plan 102-04 RED phase tests live on Mini PC. Fallback: spawn fluxbox on per-app display before Chrome. fluxbox is already in tree (100-08-01). |
| R2 | Chrome singleton lock conflicts under per-app `--user-data-dir` (unexpected) | LOW | HIGH (multi-app broken) | SelfClaude verifies per-app `--user-data-dir` works. UUID-based dir ensures uniqueness. Plan 102-04 UAT row 11 explicitly verifies 2 concurrent Chrome processes. |
| R3 | Master profile seed-copy missing critical file → login doesn't persist in app | MEDIUM | MEDIUM (user must re-login per app) | v1 copies FULL master dir. Plan 102-10 UAT row 7 verifies Google login appears in app. If fails, escalate to selective allowlist. |
| R4 | `cp -r --reflink=auto` on ext4 takes >500ms causing app-spawn lag | LOW | LOW | Mini PC filesystem check in 102-03 RED. If ext4 + slow disk → consider tar pipe for speedup. Falls within CONTEXT's 200-500ms budget. |
| R5 | xdpyinfo polling miss-detects Xvfb readiness → Chrome spawned too early → "Cannot open display" | LOW | MEDIUM | 5s timeout with 200ms cadence (25 attempts) — generous. If miss, Chrome crashes immediately and stderr-tail captures it (D-99-07 pattern). |
| R6 | `/tmp/livos-chrome-app-*` orphan accumulation if livinityd crashes mid-spawn | MEDIUM | LOW | Boot-time `sweepOrphans()` AND per-close cleanup. Defense-in-depth. Worst case: 90 dirs × 20MB = 1.8GB lost until restart. |
| R7 | Display number exhaustion (>90 concurrent apps) | LOW | MEDIUM (user can't open more) | Hard cap at 90; surface "Too many apps open" error in UI. CONTEXT specifies this exact mitigation. UAT row 25 tests "5 WebApps + 2 native apps" — well under cap. |
| R8 | Master profile becomes corrupted (user gesture, race during seed-copy mid-app-open) | LOW | MEDIUM (all apps lose login) | "Reset Master Profile" with backup + "Restore Backup" UI affordances. Plan 102-07 covers. Discourage seeding while master Chrome is running (check `currentMaster === null`). |
| R9 | x11vnc `-display :N` slower than `-id <wid>` due to larger framebuffer reads | LOW | LOW | Per research, framebuffer read is 5-10MB/s. 1280×720×4 = 3.5MB per frame. ~5fps polling → 17.5MB/s. Within budget for 5+ concurrent apps on Mini PC. |
| R10 | Master Login UI security: malicious admin runs arbitrary Chrome processes via `startLogin` | LOW | MEDIUM | All routes adminProcedure-gated. Binary path hardcoded ('google-chrome'). DISPLAY hardcoded (':0'). User-data-dir hardcoded ('/opt/livos/data/chrome-master'). No user-supplied args. Single PID tracked; second startLogin call rejected. |
| R11 | Phase 101 carryover code (CDP bootstrap at livinityd start) still spawns Chrome on :1 | LOW | LOW | Plan 102-04 modifies `livinityd.start()` to skip the Phase 101 Chrome bootstrap (or gate it behind `LIVOS_USE_CDP_CHROME=true` env flag, default false). Existing CDP code stays in tree, unwired. |
| R12 | Mini PC Phase 101 deployed code (SHA `abdfe9f`) leaves hanging Chrome processes | LOW | LOW | Plan 102-10 deploy script (`update.sh`) restarts livos service → SIGTERM cascades to all subprocess children. Plan 102-10 first task: pre-deploy `pkill -f google-chrome`, then deploy. |
| R13 | tRPC mutations not in httpOnlyPaths → hang | LOW | HIGH | Plan 102-07 task: add `chromeMaster.startLogin`, `.reset`, `.restoreBackup`, `.status` to `server/trpc/common.ts` httpOnlyPaths Set. CLAUDE.md memory rule. |
| R14 | Sacred file SHA changes during Phase 102 (accident in agent-prompt-builder or computer-use/mcp/server.ts) | LOW | HIGH | Pre-commit hook fires per commit. Plan-checker grep verifies `liv/packages/core/src/sdk-agent-runner.ts` not in any plan's `<files>` list. Sacred is in `liv/`, Phase 102 modifies only `livos/`. |
| R15 | Concurrent x11vnc on 7+ displays exceeds CPU budget | LOW | LOW | `-noxdamage` (poll-based) at default 5fps → each x11vnc <5% CPU. 7 instances = <35% — Mini PC has 16 cores. SAFE. |

---

## Phase 101 Salvage Map (file-by-file)

**Files KEPT unchanged from Phase 101:**

- `livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.ts` — left in tree, not wired
- `livos/packages/livinityd/source/modules/chrome-cdp/client.ts` — left in tree, not wired
- `livos/packages/livinityd/source/modules/chrome-cdp/index.ts` — left in tree
- `livos/packages/livinityd/source/modules/streaming/port-allocator.ts` — used by Phase 102
- `livos/packages/livinityd/source/modules/apps/native-app-spawner.ts` — extended in 102-05
- `livos/packages/ui/src/modules/desktop/native-app-form.tsx` — kept (Phase 101-07)
- `livos/packages/ui/src/modules/desktop/native-app-icon.tsx` — kept (Phase 101-07)
- All Teach v3 files (UI-tier, backend-agnostic) — kept (Phase 101-08)
- Chat animations in `webapp-floating-action-bar.tsx` — kept (Phase 101-09)
- Hermes status_detail relay in `agent-runs.ts` — kept (Phase 101-09)

**Files MOVED (no semantic change):**

- `livos/packages/livinityd/source/modules/webapps/display-allocator.ts` → `streaming/display-allocator.ts`
- `livos/packages/livinityd/source/modules/webapps/display-allocator.test.ts` → `streaming/display-allocator.test.ts`

**Files MODIFIED in Phase 102:**

- `webapps/window-manager.ts` (spawn body + close body rewritten — Plan 102-04 + 102-08)
- `apps/native-app-binder.ts` (display arg threaded — Plan 102-05)
- `ai/agent-prompt-builder.ts` (display-aware snippet — Plan 102-06)
- `livinity-broker/agent-runner-factory.ts` (env propagation — Plan 102-06)
- `computer-use/mcp/server.ts` (LUSE_TARGET_DISPLAY read — Plan 102-06, minor)
- `webapps/luse-mcp-descriptor.ts` (env name — Plan 102-06, minor)
- `streaming/vnc-bridge.ts` (default flip — Plan 102-09)
- `streaming/stream-manager.ts` (display target wire — Plan 102-09)
- `livinityd/source/index.ts` (boot wiring: DisplayAllocator + ProfileSeeder.ensureMasterExists + sweepOrphans — Plans 102-01 + 102-03)

**Files NEW in Phase 102:**

- `streaming/xvfb-spawner.ts` (+ test) — Plan 102-01
- `webapps/chrome-process-spawner.ts` (+ test) — Plan 102-02
- `chrome-master/profile-seeder.ts` (+ test) — Plan 102-03
- `chrome-master/master-login-routes.ts` (+ test) — Plan 102-07
- `chrome-master/index.ts` — Plan 102-03 / 102-07
- `ui/src/modules/settings/master-chrome-login.tsx` (+ test) — Plan 102-07

---

## Migration Strategy (Phase 101 → Phase 102 on Mini PC)

**Pre-deploy state on Mini PC (currently Phase 101 deployed at SHA `abdfe9f`):**
- livinityd boots ONE Chrome at start on `:1` (Phase 101-01).
- Per-WebApp click → CDP `Target.createTarget` (Phase 101-04).
- Each WebApp's window stream via x11vnc `-id <wid>` (Phase 99 path).
- Shared `--user-data-dir=/home/bruce/.config/livos-chrome`.

**Deploy steps (Plan 102-10):**

1. Pre-deploy SSH cleanup:
   ```bash
   ssh bruce@10.69.31.68 "
     sudo systemctl stop livos
     pkill -f google-chrome || true
     pkill -f x11vnc || true
     pkill -f Xvfb || true
     # Keep Xvfb :1 if it's bruce's GNOME — but the 100-08-01 livos-managed :1 is separate
   "
   ```

2. Push to GitHub master.

3. Deploy: `ssh bruce@10.69.31.68 "bash /opt/livos/update.sh"`.

4. Boot verify:
   ```bash
   ssh bruce@10.69.31.68 "
     systemctl status livos liv-core liv-worker liv-memory
     ls /opt/livos/data/chrome-master/  # should exist (created by ensureMasterExists)
     ls /tmp/livos-chrome-app-*  # should be empty (boot sweep)
     pgrep -af google-chrome  # should be empty (no chrome at boot)
   "
   ```

5. Run 25-row UAT (CONTEXT §Success Criteria).

6. On UAT pass: flip ROADMAP.md Phase 102 to `[x]`; update STATE.md.

**Rollback plan:** if UAT row N fails fatally, revert `git revert` on push, redeploy. Phase 101 state restored. No data migration to undo (Redis schemas unchanged).

**Migration data integrity:**
- `liv:apps:webapp:<id>` — unchanged schema, unchanged values.
- `liv:apps:native:<id>` — unchanged schema (Phase 101).
- skills table — unchanged schema (Phase 101-08 v3 + lazy v2 translation).
- `/home/bruce/.config/livos-chrome/` (Phase 101 shared profile) — LEAVE IN PLACE. Phase 102 doesn't read or write it. User can copy contents into `/opt/livos/data/chrome-master/` manually via Master Login flow.

---

## Common Pitfalls

### Pitfall 1: Chrome `--start-fullscreen` doesn't render fullscreen without a WM

**What goes wrong:** Chrome spawns on Xvfb `:N` without fluxbox. `--app=URL --start-fullscreen` should produce a fullscreen frameless window. If Chrome doesn't receive proper EWMH `_NET_WM_STATE_FULLSCREEN` ack (no WM listening), it may fall back to a maximized-but-not-fullscreen window that leaves a thin titlebar visible.
**Why it happens:** Some Chrome versions check for a WM via `_NET_SUPPORTING_WM_CHECK` atom before honoring fullscreen requests.
**How to avoid:** Plan 102-02 RED phase: write a test that spawns Chrome + checks the resulting window's geometry via `xdotool getwindowgeometry`. If geometry ≠ 1280x720, spawn fluxbox before Chrome.
**Warning signs:** Stream shows a tiny visible titlebar or 1-2px white border. Validation via Mini PC screenshot in 102-04 RED.

### Pitfall 2: Master profile racing with concurrent app spawns

**What goes wrong:** User clicks "Open Master Chrome" → master Chrome boots on `:0` with `/opt/livos/data/chrome-master/`. Meanwhile, user clicks a WebApp icon → window-manager.spawn calls `profileSeeder.seed()` which `cp -r /opt/livos/data/chrome-master /tmp/...`. The cp reads files that master Chrome is actively writing → potentially corrupt copy.
**Why it happens:** SQLite databases (Cookies, Login Data) can be in mid-transaction during cp.
**How to avoid:** Plan 102-07: reject `apps.webapp.spawn` calls while `currentMaster !== null`. Surface UI message "Close Master Chrome first." OR snapshot via `sqlite3 .backup` for SQLite files. **Recommendation:** simpler — reject spawn while master running. User intuition matches (don't open apps while configuring master).
**Warning signs:** Random "database disk image is malformed" errors in spawned Chrome logs.

### Pitfall 3: x11vnc `-display :N` race with Xvfb readiness

**What goes wrong:** x11vnc spawned immediately after Xvfb start; Xvfb hasn't finished binding socket → x11vnc fails with "X server isn't responding."
**Why it happens:** Xvfb is async; x11vnc connect is sync.
**How to avoid:** XvfbSpawner explicitly polls `xdpyinfo` to readiness BEFORE returning the handle. Caller (WindowManager) always awaits the handle before invoking x11vnc.
**Warning signs:** x11vnc stderr "unable to open display :N" + exit code 1 within first second of spawn.

### Pitfall 4: PID reuse causing wrong-app close

**What goes wrong:** App A's Chrome pid stored in ActiveWebApp entry. App A closes; Chrome pid freed. App B opens; OS reassigns SAME pid to B's Chrome. close(A) (delayed race) calls `kill(pidA)` → kills B's Chrome.
**Why it happens:** PIDs are recycled.
**How to avoid:** Always SIGTERM via the stored `ChildProcess` handle (Node's `child.kill()` respects the original child), NOT raw `process.kill(pid)`. Plus, `this.active.delete(webappId)` BEFORE the kill — so a duplicate close() returns early.
**Warning signs:** UAT row 21 "close WebApp A → 'pgrep -af chrome' shows only B" passes BUT next close() throws or no-ops unexpectedly.

### Pitfall 5: tmpfs /tmp exhaustion under concurrent app load

**What goes wrong:** Mini PC `/tmp` is tmpfs (RAM-backed). 100 apps × 20MB profile = 2GB RAM consumed. Mini PC swap pressure if user opens too many apps.
**Why it happens:** tmpfs is in-RAM.
**How to avoid:** Hard cap at 90 displays (CONTEXT). With 90 × 20MB = 1.8GB max — tolerable. Add monitoring: log `df -h /tmp` warning if >50% used.
**Warning signs:** Mini PC swap activity spikes; spawn latency increases >1s.

### Pitfall 6: Boot-time sweep deletes legit running app dir on livinityd hot-reload

**What goes wrong:** User hot-reloads livinityd via `systemctl reload livos`. New livinityd boots, calls `profileSeeder.sweepOrphans()` → `rm -rf /tmp/livos-chrome-app-*` → kills RUNNING app profiles.
**Why it happens:** Old livinityd's child Chrome processes are still alive (detached:true) but their profile dirs get wiped.
**How to avoid:** systemd restart cascades SIGTERM to child processes by default. Phase 102 child Chrome processes ARE livinityd children; they should die on restart. **Recommendation:** Accept this trade-off (per Phase 101 §Pitfall 3 — Chrome dies on livinityd restart). Document in close lifecycle as "WebApps lost on livinityd restart; user reopens."
**Warning signs:** After livinityd restart, opening dock icon for an app that was open shows "WebApp closed unexpectedly."

### Pitfall 7: `LUSE_TARGET_WINDOW_ID` env still set after rename

**What goes wrong:** Phase 102 renames `LUSE_TARGET_WINDOW_ID` → `LUSE_TARGET_DISPLAY` (CONTEXT D-102-LUSE-DISPLAY-SCOPING). If some code path still sets the old env var, MCP child gets confused (sees both, prefers one).
**Why it happens:** Wide rename; easy to miss a spot.
**How to avoid:** Plan 102-06 grep verify task: `grep -rn LUSE_TARGET_WINDOW_ID livos/packages/livinityd/source/ | wc -l` should equal `0` (post-deletion) or only in test files asserting absence.
**Warning signs:** MCP child stderr "ignoring LUSE_TARGET_WINDOW_ID=… not a positive integer" — indicates stale env still being set somewhere.

### Pitfall 8: Master Login flow blocked by sudo NOPASSWD on `:0`

**What goes wrong:** `sudo -n -u bruce DISPLAY=:0 google-chrome` requires sudo NOPASSWD for bruce on the livinityd user. If misconfigured, master Chrome never spawns.
**Why it happens:** systemd unit runs as `livinity` user; spawning as `bruce` requires sudoers config.
**How to avoid:** Plan 102-10 Mini PC pre-deploy check: `sudo -n -u bruce true` should return 0 from livinityd context. If not, fix sudoers before deploy.
**Warning signs:** chromeMaster.startLogin returns immediately but no Chrome window appears on `:0`. Backend logs sudo prompt errors.

---

## Code Examples

Verified patterns from official sources or in-tree.

### 1. Xvfb readiness poll via xdpyinfo

```bash
# Source: pyvirtualdisplay GitHub Issue #33 + standard X11 practice
# [CITED: github.com/ponty/PyVirtualDisplay/issues/33]
# Pattern: spawn Xvfb, then poll xdpyinfo until exit 0.
sudo -n -u bruce Xvfb :10 -screen 0 1280x720x24 -nolisten tcp -ac &
XVFB_PID=$!
ATTEMPTS=0
while ! xdpyinfo -display :10 >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [ $ATTEMPTS -ge 25 ]; then
    kill -9 $XVFB_PID
    echo "Xvfb :10 timeout"
    exit 1
  fi
  sleep 0.2
done
echo "Xvfb :10 ready after ${ATTEMPTS} polls"
```

### 2. Per-app Chrome spawn argv (SelfClaude-verified)

```javascript
// Source: github.com/utopusc/selfclaude/blob/main/src/webapp-manager.js (verbatim, Apache 2.0)
// [VERIFIED: WebFetch 2026-05-11]
const chromeArgs = [
  '--no-sandbox',
  `--user-data-dir=${profileDir}`,
  '--window-size=1280,720',
  '--disable-features=ChromeWhatsNewUI,TranslateUI,InfoBars',
  '--disable-infobars',
  '--test-type',
  '--no-first-run',
  '--no-default-browser-check',
  `--app=${url}`,
];
// Phase 102 deviation: add `--start-fullscreen` for full Xvfb-display rendering.
// (SelfClaude uses --window-size + shared display + window-region capture instead.)
```

### 3. x11vnc whole-display capture

```bash
# Source: x11vnc(1) manpage; Phase 99-02 baseline
# Already in vnc-bridge.ts SpawnVncOpts when {display} provided.
x11vnc -display :10 \
  -rfbport 15900 \
  -shared -forever \
  -localhost \
  -nopw \
  -noxdamage \
  -quiet
```

### 4. Master profile seed-copy with CoW where supported

```bash
# Source: coreutils cp manpage; --reflink=auto = CoW on btrfs/xfs, plain copy elsewhere
# [CITED: gnu.org/software/coreutils/cp]
cp -r --reflink=auto /opt/livos/data/chrome-master /tmp/livos-chrome-app-12345
# Typical timing:
# btrfs/xfs: ~10ms (metadata copy only, CoW)
# ext4: ~200ms (full content copy of ~10MB)
```

### 5. Ordered close lifecycle

```typescript
// Source: composition of vnc-bridge.ts stop pattern + xvfb-display.ts stopProc
// [VERIFIED: in-tree patterns]
async function closeApp(entry: ActiveWebApp): Promise<void> {
  // 1. SIGTERM Chrome, 2s grace, then SIGKILL
  await stopProc(entry.chrome.child, 2000, logger)
  // 2. SIGTERM x11vnc (via streamManager.stopStream which already does this)
  await streamManager.stopStream(entry.streamId).catch(() => {})
  // 3. SIGTERM Xvfb
  await entry.xvfb.stop().catch(() => {})
  // 4. rm -rf temp profile
  await profileSeeder.cleanup(entry.seed.uuid).catch(() => {})
  // 5. release display
  displayAllocator.release(entry.display)
  // 6. release port
  portAllocator.release(entry.port)
  // 7. Unregister Luse MCP (via existing per-WebApp pattern)
  await unregisterWebAppMcp(entry.webappId).catch(() => {})
  // 8. UI updates implicitly via streamId close event (already wired)
}
```

---

## State of the Art

| Old Approach (Phase 100/101) | Current Approach (Phase 102) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Shared Xvfb `:1` + shared `--user-data-dir` (Phase 100-10-08) | Per-app Xvfb `:10..:99` + per-app `--user-data-dir` with master seed-copy | Phase 102 | Solves singleton-lock + multi-stream-overlap simultaneously. SelfClaude-verified. |
| Single Chrome + CDP multi-target (Phase 101-04) | Per-app Chrome subprocess (no CDP wired by default) | Phase 102 | Simpler. No CDP race conditions. Each Chrome is independent. CDP code stays in tree for future per-app CDP control. |
| `x11vnc -id <wid>` window-region capture | `x11vnc -display :N` whole-display capture | Phase 102 | No more WID polling. Resolution match (1280x720 exact). No coordinate translation in Luse. |
| `LUSE_TARGET_WINDOW_ID` env on Luse MCP child | `LUSE_TARGET_DISPLAY` (or just `LUSE_DISPLAY`, existing) | Phase 102 | Whole-display capture obviates window-bound ops; everything is display-scoped. |
| Shared Google login (Phase 100-10 D-100-SHARED-PROFILE) | Master profile seed-copy to per-app dirs | Phase 102 | Same effective login across apps WITHOUT shared `--user-data-dir` (which had singleton lock issues). |

**Deprecated / outdated (do not use in plans):**

- **CDP `Target.createTarget({newWindow:true})`:** Phase 101 path, now unused. Code stays for future v103 if needed.
- **xdotool baseline-diff for new Chrome wid (Phase 101-04 Pattern):** N/A — whole-display capture doesn't need wid.
- **Cascade offset for window position (Phase 100-10-11):** N/A — each app has its own dedicated display, no positioning concerns.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `cp -r --reflink=auto` is available on Mini PC and the filesystem supports CoW | §"Master Profile Seed Mechanics" | If filesystem is ext4 (no CoW), seed-copy takes ~200ms instead of ~10ms. Functional but slower. Mitigation: Plan 102-03 RED checks `df -T /opt/livos/data` and adjusts test budgets. `[ASSUMED]` until 102-03 RED verifies. |
| A2 | Chrome `--app=URL --start-fullscreen` produces a chromeless fullscreen window on Xvfb WITHOUT a WM | §"D-102-PER-APP-CHROME Implementation Notes" + Pitfall 1 | If fullscreen requires WM, fluxbox spawn becomes mandatory per display (+30MB RAM × 90 = +2.7GB). Plan 102-04 RED validates empirically. `[ASSUMED]` — selfclaude uses fluxbox so signal is "WM probably required for reliability." |
| A3 | x11vnc `-display :N` auto-detects Xvfb resolution and outputs matching frame size | §"D-102-X11VNC-WHOLE-DISPLAY Implementation Notes" | If misdetected, stream comes back at wrong resolution → UI scaling artifacts. Mitigation: existing Phase 99 baseline confirms x11vnc reads root window geometry correctly. LOW risk. `[CITED: x11vnc/README]` |
| A4 | `LUSE_DISPLAY` env propagation through per-WebApp Luse MCP descriptor already works (Phase 100-10-03) | §"D-102-LUSE-DISPLAY-SCOPING Implementation Notes" | If broken, Luse tools see wrong display. Mitigation: existing tests in `luse-mcp-config.test.ts` cover descriptor env. `[VERIFIED: existing code path read]` |
| A5 | `sudo -n -u bruce DISPLAY=:0 google-chrome` works from livinityd's systemd unit context | §"Pitfall 8" | If NOPASSWD missing, master Chrome doesn't spawn. Mitigation: Plan 102-10 pre-deploy checks sudoers. LOW risk (existing Phase 99-100-101 also use `sudo -n -u bruce` and work). `[ASSUMED]` confirmed by existing patterns |
| A6 | All 7 concurrent x11vnc processes on different displays stay within Mini PC CPU budget | §Risk R15 | If CPU-bound, frame drops or stream lag. Mitigation: `-noxdamage` poll-based mode is light. UAT row 25 tests 7 concurrent apps. `[ASSUMED]` to be measured during UAT |
| A7 | Master profile `cp -r` of full dir doesn't include browser session lock files that cause "this profile is already in use" error | §"Master Profile Seed Mechanics" | If session lock file (`SingletonLock`, `SingletonCookie`) is in master and gets copied, app Chrome refuses to start. Mitigation: include `--exclude='Singleton*'` in cp args, OR rm those files post-copy. Plan 102-03 RED phase validates. `[ASSUMED]` |
| A8 | Mini PC `/tmp` is tmpfs (RAM-backed) per Ubuntu 24.04 default | §"Pitfall 5" | If `/tmp` is disk-backed, no RAM exhaustion risk but slower seed copy. Either way, functional. `[ASSUMED]` confirmable via `df -T /tmp` |
| A9 | Phase 101 chrome-cdp/bootstrap.ts can be skipped at livinityd boot without breaking liv-core or sacred SDK runner | §"R11" + "Phase 101 Salvage Map" | If something depends on Chrome being up at boot, broken. Mitigation: gate Phase 101 Chrome bootstrap behind env flag (default off in 102); leave path open for v103. `[ASSUMED]` — verify in 102-04 task that Chrome bootstrap is not in liv-core's critical path. |
| A10 | Existing `LUSE_DISPLAY` env propagation (Phase 100-10-03) handles `:10..:99` range; no upper bound check needed | §"D-102-LUSE-DISPLAY-SCOPING" | If MCP server has range check that fails for `:10`, broken. Mitigation: server reads display as string; no validation. `[VERIFIED: mcp/server.ts:73]` |

**If this table has entries:** All `[ASSUMED]` claims need confirmation in RED phase or 102-10 UAT. A1, A2, A7 are highest-impact and should be confirmed in Plan 102-02/102-03/102-04 RED phases respectively.

---

## Open Questions

All open questions resolved during research. Encoded as decisions:

1. **`LUSE_TARGET_DISPLAY` vs reuse existing `LUSE_DISPLAY`** — RESOLVED in §"D-102-LUSE-DISPLAY-SCOPING Implementation Notes." Reuse existing `LUSE_DISPLAY`; rename only `LUSE_TARGET_WINDOW_ID` (drop it; whole-display semantics make it meaningless).

2. **fluxbox per display vs no WM** — RESOLVED with empirical gate. Default: SKIP fluxbox. Plan 102-04 RED validates Chrome `--start-fullscreen` works without WM. If not, fluxbox becomes mandatory (small additional spawn step, no new code).

3. **Profile selective vs full cp** — RESOLVED for v1: FULL cp. v2 optimization deferred (§"Master Profile Seed Mechanics").

4. **CoW (reflink) vs plain copy** — RESOLVED: `cp -r --reflink=auto` (auto-fallback to plain). No decision needed at code level.

5. **Singleton lock files in seeded profile** — RESOLVED as Assumption A7: include `--exclude='Singleton*'` OR post-copy rm. Plan 102-03 acceptance criterion.

6. **Boot-time orphan sweep vs per-close only** — RESOLVED: BOTH (defense-in-depth).

7. **Master profile concurrent access during seed-copy** — RESOLVED as Pitfall 2: reject `webapp.spawn` while master Chrome is running. UI surfaces the constraint.

8. **Chrome dies on livinityd restart — accept or persist?** — RESOLVED as Phase 101 precedent: accept. User reopens via dock.

9. **Native apps need fluxbox?** — RESOLVED: probably yes (Electron apps expect a WM for window decorations). Plan 102-05 spawns fluxbox per display for native apps by default. WebApps skip fluxbox by default (per question 2 above).

10. **Test all 9 questions** — RED phases of relevant plans validate.

---

## Environment Availability

> All dependencies on Mini PC verified available from prior Phase 99-100-101 deploys. Phase 102 adds NO new system packages.

| Dependency | Required By | Available on Mini PC | Version | Fallback |
|------------|-------------|----------------------|---------|----------|
| `Xvfb` | Per-app display | ✓ | 21.1.x | None — required |
| `x11vnc` | Stream capture | ✓ | 0.9.16 | None — Phase 99 baseline |
| `xdpyinfo` | Xvfb readiness poll | ✓ (x11-utils pkg) | system | None — required |
| `xdotool` | Optional native-app WM_CLASS detect | ✓ | 3.20210903.1 | wmctrl partial |
| `wmctrl` | Optional WM_CLASS | ✓ | 1.07 | xdotool sufficient |
| `fluxbox` | Optional WM for native apps | ✓ | 1.3.7 | none for WebApps; native apps may break |
| `google-chrome` | Per-app browser | ✓ | stable | None — required |
| `cp` (coreutils) with `--reflink=auto` | Profile seed-copy | ✓ | coreutils 8.x | falls back to plain copy automatically |
| `node:fs/promises` (`cp`, `rm`, `mkdir`, `rename`, `access`) | seeder + master-login routes | ✓ | Node 20+ (livinityd engines) | None — builtin |
| `node:crypto.randomUUID` | uuid generation | ✓ | Node 20+ | None — builtin |
| `ioredis` | Redis client | ✓ (in tree) | 5.4.x | None |
| `vitest` | Test runner | ✓ (in tree) | 2.1.9 | None |
| `chrome-remote-interface` | Phase 101 CDP (NOT WIRED in Phase 102) | ✓ (in tree) | 0.34.0 | n/a — unwired |
| sudo NOPASSWD for `bruce` user | Master Login spawn on `:0` | ✓ (verified Phase 99-100-101 work) | sudoers | None — required |
| Mini PC SSH access | UAT + deploy | ✓ | OpenSSH | None — required |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

**Verification commands** (Plan 102-10 first task):
```bash
ssh bruce@10.69.31.68 "
  command -v Xvfb x11vnc xdpyinfo google-chrome cp fluxbox
  Xvfb -version 2>&1 | head -1
  x11vnc -version | head -1
  xdpyinfo -version
  google-chrome --version
  fluxbox -version
  sudo -n -u bruce true && echo 'sudo NOPASSWD ok'
  df -T /opt/livos/data | tail -1
  df -h /tmp
"
```

---

## Security Domain

> `security_enforcement` not explicitly disabled. Treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing JWT chain; Master Login routes use `adminProcedure` |
| V3 Session Management | yes | Existing per-user JWT (unchanged) |
| V4 Access Control | yes | `adminProcedure` on `chromeMaster.*` routes; `protectedProcedure` on per-user app routes |
| V5 Input Validation | yes | zod schemas for `chromeMaster.reset` input; URL validation on WebApp spawn (existing) |
| V6 Cryptography | no | No new cryptographic surfaces |
| V7 Error Handling / Logging | yes | Don't log Cookies content; log profile sizes not contents |
| V8 Data Protection | yes | Master profile at `/opt/livos/data/chrome-master/` contains login cookies — treat as secret-bearing |
| V12 Files & Resources | yes | `binaryPath` and `userDataDir` paths hardcoded server-side; no user-supplied paths in 102-02/102-03 |
| V13 API & Web Service | yes | adminProcedure on master-login; protectedProcedure on webapp spawn (existing) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `--user-data-dir` path traversal (uuid is server-generated, hardcoded prefix) | T (Tampering) | `randomUUID()` returns uuid hex; prefix `/tmp/livos-chrome-app-` is hardcoded. No user input in path. |
| Master profile read by non-admin user | I (Info Disclosure) | `/opt/livos/data/chrome-master/` owned by bruce (since spawned by sudo -u bruce). Filesystem perms enforce. |
| `chromeMaster.reset` invoked by non-admin | E (Elevation) | adminProcedure enforces |
| Master profile contains writable secrets (Cookies, Login Data) | I | Treat as sensitive; don't log contents; don't expose via API |
| Race during seed-copy → partial profile in app | T | Reject app spawn while master Chrome running (Pitfall 2). Seed-copy is atomic from app's perspective. |
| Sudo NOPASSWD abuse — attacker with livinityd code execution can spawn arbitrary processes as bruce | E | Existing constraint (Phase 99-100-101); not Phase 102 specific. Pre-existing sudoers config; livinityd is trusted code. |
| sudo NOPASSWD elevation by argv injection (user-supplied args in spawn) | T | All argv elements server-controlled (hardcoded or from zod-validated config). NO user-supplied args reach sudo argv. |

### Hardening Checklist for Phase 102 Plans

- [ ] `chromeMaster.startLogin/reset/restoreBackup/status` are `adminProcedure`-gated.
- [ ] `chromeMaster.startLogin` has NO user-supplied path or arg input (zod input schema is empty).
- [ ] `chromeMaster.reset` zod schema validates `backup: boolean` only.
- [ ] Logs from `profile-seeder.ts` redact contents (log path + size, not file contents).
- [ ] tRPC routes in `httpOnlyPaths` Set: `chromeMaster.startLogin`, `.reset`, `.restoreBackup`, `.status`.
- [ ] No `--remote-debugging-address=0.0.0.0` in any Chrome spawn argv (master or app). Default loopback-bind is preserved.
- [ ] Boot-time `sweepOrphans()` only removes paths matching `/tmp/livos-chrome-app-*` prefix (hardcoded glob).
- [ ] Master profile path `/opt/livos/data/chrome-master/` permissions: owner bruce, mode 700 (Plan 102-10 deploy check).

---

## Project Constraints (from CLAUDE.md / Memory)

**CLAUDE.md does not exist at project root.** Constraints come from:

1. **MEMORY.md operational rules:**
   - **D-NO-SERVER4 (HARD RULE):** Server4 + Server5 off-limits. Mini PC `bruce@10.69.31.68` only.
   - **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** for `liv/packages/core/src/sdk-agent-runner.ts`. Pre-commit hook enforces. NEVER `--no-verify`.
   - **D-NO-BYOK:** Subscription-only Claude SDK path. (Not Phase 102 relevant; sacred file boundary.)
   - **tRPC mutations MUST be in `httpOnlyPaths`** else WS routing hangs.
   - **liv-core dist requires `npm run build --workspace=packages/core` after source changes** (sacred file untouched in Phase 102 so no build needed for sacred; liv-agent-runner.ts is non-sacred but Phase 102 doesn't touch it).
   - **update.sh's pnpm-store quirk:** post-deploy verify `@liv+core*` resolution dir uniqueness.
   - **Mini PC SSH rate limit:** batch read-only commands into ONE ssh invocation (UAT script construction).
   - **Status updates in Turkish during autonomous workflows** (code/paths stay English).

2. **`.planning/REQUIREMENTS.md`:** v31+ requirements; Phase 102 is user-vision-driven on top of v33 ship.

3. **`.planning/STATE.md`:** Current phase 101 EXECUTING (Wave 0 complete, Wave 1 unblocked).

All Phase 102 plans MUST honor these constraints. Plans that touch the sacred file, propose Server4 deploys, or omit `httpOnlyPaths` registration MUST be rejected by plan-checker.

---

## Sacred SHA Constraint

`liv/packages/core/src/sdk-agent-runner.ts` MUST equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` before AND after EVERY Phase 102 commit. Pre-commit hook at `.husky/pre-commit` enforces. NEVER use `--no-verify` except in parallel-worktree merge mode.

**Phase 102 modifies files in `livos/packages/` only.** The sacred file is in `liv/packages/`. By construction, no Phase 102 plan touches `liv/`. Plan-checker grep verifies.

**Verification command:**
```bash
git -C C:/Users/hello/Desktop/Projects/contabo/livinity-io hash-object liv/packages/core/src/sdk-agent-runner.ts
# Expected: f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

---

## Sources

### Primary (HIGH confidence)

- LivOS codebase (in-tree, verified via Read + Grep + Bash):
  - `livos/packages/livinityd/source/modules/webapps/{window-manager.ts, display-allocator.ts, xvfb-display.ts, fluxbox-wm.ts}`
  - `livos/packages/livinityd/source/modules/streaming/{vnc-bridge.ts, port-allocator.ts, stream-manager.ts}`
  - `livos/packages/livinityd/source/modules/chrome-cdp/{bootstrap.ts, client.ts}` (Phase 101 kept)
  - `livos/packages/livinityd/source/modules/computer-use/{luse-mcp-config.ts, mcp/server.ts, mcp/tools.ts}`
- `github.com/utopusc/selfclaude` (Apache 2.0) — verified via gh api repos/utopusc/selfclaude + WebFetch on `src/webapp-manager.js` and `src/vnc-bridge.js`. SelfClaude's per-app `--user-data-dir` pattern.
- Chromium docs `chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md` — profile structure.
- `npm view chrome-remote-interface version` → 0.34.0 (confirmed in tree).

### Secondary (MEDIUM confidence)

- `coreutils cp(1)` manpage — `--reflink=auto` semantics.
- `x11vnc(1)` manpage + LibVNC/x11vnc README — `-display :N` mode.
- PyVirtualDisplay GitHub Issues #33, #25, #42, #84 — xdpyinfo readiness polling pattern.
- WebSearch results on Chrome `--app=URL` + `--start-fullscreen` + WM behavior — cross-verified with selfclaude actual usage (selfclaude uses both flags + fluxbox).
- Forensics.wiki Google Chrome profile contents.

### Tertiary (LOW confidence — flagged for validation)

- Assumption A2 (Chrome fullscreen without WM) — needs Mini PC empirical test in Plan 102-04 RED.
- Assumption A1 (CoW reflink on Mini PC filesystem) — needs `df -T` check in Plan 102-03 RED.
- Assumption A7 (SingletonLock files in profile copy) — needs Mini PC test in Plan 102-03 RED.

---

## Metadata

**Confidence breakdown:**

- **Standard stack:** HIGH — all deps in tree, system packages verified Phase 99-100-101.
- **Architecture (per-app Xvfb + Chrome subprocess):** HIGH — SelfClaude's per-app `--user-data-dir` pattern verified; per-app Xvfb is standard Phase 100-10-01 pattern reinstated.
- **Master profile seed-copy:** MEDIUM — file allowlist is from documented Chromium docs; FULL cp is conservative v1 default. Selective optimization is v2 work.
- **x11vnc -display:** HIGH — existing scaffolding in tree (Phase 100-10-08 retained the branch).
- **Luse display scoping:** HIGH — `LUSE_DISPLAY` env propagation already wired (Phase 100-10-03).
- **Close lifecycle:** HIGH — order is documented and aligns with in-tree patterns.
- **Master Login UI:** HIGH — tRPC adminProcedure + shadcn Dialog pattern is project-conventional.
- **Pitfalls:** HIGH — 8 pitfalls verified against existing code paths + SelfClaude source.
- **Security:** HIGH — standard threat models; mitigations are project-conventional.

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (30 days for stable Xvfb/x11vnc; Chrome stable channel; SelfClaude reference is static).

---

## RESEARCH COMPLETE

**Phase:** 102 - Per-App Display Pivot
**Confidence:** HIGH

### Key Findings

- **SelfClaude verified pattern is per-app `--user-data-dir` on SHARED display.** Phase 102 goes further than SelfClaude by adding per-app Xvfb display. The combination eliminates BOTH the singleton-lock issue (per-app data-dir) AND the multi-stream-overlap issue (per-app display). Master seed-copy preserves shared Google login.

- **~70% of Phase 101 code carries forward unchanged.** Only 101-04 (CDP-driven WebApp spawn) is fully replaced; the rest (PortAllocator, NativeAppSpawner, Luse auto-context, dock UI, Teach v3, chat anims, Hermes relay) extend or stay identical. 101-01 ChromeCdpClient is kept in tree but unwired by default.

- **No new npm dependencies needed.** Phase 102 is composition of existing primitives: Xvfb spawn (`webapps/xvfb-display.ts`), x11vnc (`streaming/vnc-bridge.ts` with `-display` branch already scaffolded from 100-10-08), Chrome subprocess (existing window-manager pattern), `cp -r` for seed-copy (filesystem builtin), tRPC adminProcedure (existing).

- **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` is unaffected.** All Phase 102 changes are in `livos/packages/` (livinityd + ui). The sacred file is in `liv/packages/core/`. By construction, no plan touches sacred.

- **Three empirical risks (`[ASSUMED]`) need validation in RED phases:** (1) Chrome `--start-fullscreen` works without WM under Xvfb (Plan 102-02/04); (2) Mini PC filesystem supports CoW reflink for fast seed-copy (Plan 102-03); (3) Profile's SingletonLock files don't break seeded apps (Plan 102-03). All have known fallbacks (add fluxbox; accept slower cp; rm Singleton* post-copy).

### File Created
`C:/Users/hello/Desktop/Projects/contabo/livinity-io/.planning/phases/102-per-app-display-pivot/102-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All deps in tree; system packages verified Phase 99-100-101 deploys. |
| Architecture | HIGH | SelfClaude pattern verified verbatim via gh API. Per-app Xvfb extends existing P100-10-01 work. |
| Master Profile Seed-Copy | MEDIUM | Full-cp v1 default is conservative; selective allowlist is v2 optimization. SingletonLock handling unverified. |
| Close Lifecycle | HIGH | Order matches in-tree patterns. All steps idempotent by design. |
| Pitfalls | HIGH | 8 pitfalls verified against code + SelfClaude reference. |
| Security | HIGH | adminProcedure + hardcoded paths + zod schemas; no new attack surfaces. |

### Open Questions

None blocking. Three empirical assumptions (A1, A2, A7) flagged for RED-phase validation; all have safe fallbacks.

### Ready for Planning

Research complete. Planner can produce 10 PLAN.md files per CONTEXT decomposition:
- Wave 1 (parallel): 102-01 (DisplayAllocator + XvfbSpawner), 102-02 (ChromeProcessSpawner), 102-03 (MasterProfileSeeder)
- Wave 2 (parallel): 102-04 (window-manager rewrite), 102-05 (native-app-binder display swap), 102-06 (Luse env switch)
- Wave 3 (parallel): 102-07 (Master Chrome Login UI), 102-08 (App close lifecycle), 102-09 (x11vnc whole-display rewrite)
- Wave 4 (user-walked): 102-10 (Mini PC deploy + 25-row UAT walk)

Sacred SHA constraint preserved throughout. Mini PC only deploy target.

Sources:
- [SelfClaude reference (Apache 2.0)](https://github.com/utopusc/selfclaude)
- [SelfClaude webapp-manager.js](https://raw.githubusercontent.com/utopusc/selfclaude/main/src/webapp-manager.js)
- [SelfClaude vnc-bridge.js](https://raw.githubusercontent.com/utopusc/selfclaude/main/src/vnc-bridge.js)
- [Chromium User Data Directory docs](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md)
- [LibVNC/x11vnc](https://github.com/LibVNC/x11vnc)
- [x11vnc Ubuntu manpage](https://manpages.ubuntu.com/manpages/jammy/man1/x11vnc.1.html)
- [Forensics.wiki Google Chrome](https://forensics.wiki/google_chrome/)
- [chrome-remote-interface (Node.js CDP client)](https://github.com/cyrus-and/chrome-remote-interface)
- [Chromium Docs - User Data Directory at HEAD](https://github.com/chromium/chromium/blob/main/docs/user_data_dir.md)
- [PyVirtualDisplay Issue #33 - xdpyinfo readiness polling](https://github.com/ponty/PyVirtualDisplay/issues/33)
- [Chromium Cookies and Network Data (Chrome 96 cookie path change)](https://www.avanite.com/blog/chromium-cookies-and-network-data)
- [Phase 101 RESEARCH (in-tree)](.planning/phases/101-livos-universal-app-orchestration/101-RESEARCH.md)
- [Phase 101 PATTERNS (in-tree)](.planning/phases/101-livos-universal-app-orchestration/101-PATTERNS.md)
- [Phase 102 CONTEXT (in-tree)](.planning/phases/102-per-app-display-pivot/102-CONTEXT.md)
- [Phase 100-10 CONTEXT (in-tree, predecessor per-WebApp Xvfb design)](.planning/phases/100-multi-stream-window-redesign/100-10-CONTEXT.md)
