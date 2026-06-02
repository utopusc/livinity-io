# Phase 255: LivOS Spaces — Research

**Researched:** 2026-06-02
**Domain:** X11 display capture/streaming, React TopBar UI, fluxbox/X shell branding, tRPC seams
**Confidence:** HIGH (codebase-grounded; every claim cites a real file:line). LOW only on in-display shell *visual* outcome (human-verify-only).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (from brainstorming — do NOT relitigate)
- **D-255-POPOVER-CONCEPT** — Popover panel chosen over "expanded-bar inline chips" and "full-screen Mission-Control overlay". Displays live in a navbar-anchored popover.
- **D-255-SHELL-LIVOS-BRANDED** — In-display look is a LivOS-branded custom shell, chosen over "polished fluxbox (themed only)" and "full XFCE desktop". Ubuntu-mimicry is explicitly NOT the goal; it must look like LivOS.
- **D-255-THUMBS-SCREENSHOT** — Popover previews are ~2s JPEG screenshots, NOT live RFB. Live VNC is reserved for the opened window. (Mini PC perf.)
- **D-255-REPLACE-STRIP-AND-MERGE** — The 254-04 top-edge hover strip is removed and the windows-manager popover is merged into the new Displays popover.
- **D-255-WEBAPP-REGISTER** — WebApps register/unregister their displays in displayManager.
- **D-255-NAVBAR-ADDITIVE** — Navbar glow-up is additive only, per `feedback_v36_no_bold_redesigns`. Smallest visible deltas, screenshot, validate before stacking.

### Claude's Discretion
- The in-display dock-as-web-shell mechanism (Chromium kiosk vs native panel) is an open implementation choice for the planner/research to resolve under D-255-SHELL-LIVOS-BRANDED. (Resolved below: **native `feh` wallpaper + themed fluxbox style + `tint2` dock**, NOT Chromium kiosk.)

### Deferred Ideas (OUT OF SCOPE)
- XFCE/GNOME install; live RFB thumbnails; touching Server4/Server5; BYOK; a full TopBar teardown.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GOAL-255-DISPLAYS-POPOVER | Single `🖥️` TopBar popover lists all `displays.list` cards; remove 254-04 strip; fold in windows-manager popover | §4 — exact TopBar edit at `top-bar.tsx:357-374`, delete `active-displays-panel.tsx` + `router.tsx:25,95` mount |
| GOAL-255-LIVE-THUMBS | ~2s auto-refreshing JPEG screenshot per card; no N concurrent RFB | §1 — add `displays.screenshot` tRPC reusing `captureScreenshot()` + `withScopedDisplay` env-swap pattern |
| GOAL-255-WEBAPP-DISPLAYS | `WebAppWindowManager.spawn()` registers `:N` in displayManager; `close()` unregisters | §2 — inject `displayManager`, call `registerExisting` (NOT `create`), shared-allocator collision fix |
| GOAL-255-LIVOS-SHELL | Branded shell inside Xvfb: feh wallpaper + design-token fluxbox theme + slim dock | §3 — native `feh`+fluxbox-style+`tint2`; ship wallpaper asset via livinityd source rsync |
| GOAL-255-NAVBAR-GLOWUP | `ClockWithLocation` weather glyph + day/night accent + greeting; additive | §5 — extend open-meteo `current=` params + WMO map in `top-bar.tsx:494-499,516-567` |
| (cross-cutting) Reuse vs build | What exists vs what is new | §6 |
</phase_requirements>

## Summary

Phase 254 already shipped the load-bearing backend seam: `displays.list` / `displays.getVncUrl` / `canAccessDisplay` (`computer-use/trpc-router.ts`), the `displayManager` with `create`/`list`/`kill`/`registerExisting`/`attachApp` (`computer-use/displays/display-manager.ts`), and the `X11DisplayStreamWindow` open-as-window path. Phase 255 is therefore **mostly composition + two genuinely new backend pieces** (a screenshot tRPC seam, and wiring WebApp spawn/close into displayManager) plus **one substantial new system-integration piece** (the in-display LivOS shell).

The good news: the screenshot capture path **already exists and already supports per-display capture** — `captureScreenshot()` (`computer-use/native/screenshot.ts`) shells out to `maim`/`scrot` honoring `process.env.DISPLAY`, already produces JPEG via `sharp` (`LUSE_SCREENSHOT_FORMAT=jpeg` default q60), and the MCP path already demonstrates the exact "swap `process.env.DISPLAY` around the call" idiom (`mcp/tools.ts:1655-1672`). A `displays.screenshot({display})` mutation is ~30 lines reusing all of that — no RFB, no new dependency.

The two real landmines are: (1) the **allocator collision** — `WebAppWindowManager` uses an in-memory `DisplayAllocator` (`new DisplayAllocator()`, range [10,100), `index.ts:1088`) that has ZERO knowledge of the Redis-seeded allocator inside `displayManager.create()`; if webapps write `luse:display:10` via `registerExisting` they must NOT use `create()` (which would double-spawn an Xvfb and advance the wrong allocator). (2) The **in-display shell** requires shipping a wallpaper file to the Mini PC filesystem (NOT a UI-served URL) and adding `feh`+`tint2` to the apt list in `update.sh` — neither is currently installed.

**Primary recommendation:** Add `displays.screenshot` reusing `captureScreenshot`+`withScopedDisplay`; inject `displayManager` into `WebAppWindowManager` and call `registerExisting`/`kill` (never `create`); build the branded shell with native `feh`+themed-fluxbox-style+`tint2` (generate the fluxbox style + tint2 config from `@livinity/design-tokens/theme.json` at boot); rebuild the TopBar right-cluster as one `🖥️` popover that folds in windows-manager rows and renders display cards with screenshot thumbs; extend `ClockWithLocation` additively.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-display JPEG screenshot | API / livinityd (tRPC + maim subprocess) | Browser (poll + render) | Capture must run server-side against the X socket; browser only fetches + paints |
| WebApp display registration | API / livinityd (`WebAppWindowManager`) | DB (Redis `luse:display:*`) | Display lifecycle is owned by the daemon; Redis is the registry |
| Branded in-display shell | OS / system (X11 + feh/fluxbox/tint2) | API (boot orchestration) | A real X desktop runs as a host process group; livinityd spawns it on boot |
| Displays popover UI | Browser (React TopBar) | API (`displays.list`/`screenshot`) | Pure client composition over existing tRPC |
| Clock/weather glow-up | Browser (React) | external (open-meteo, no key) | Client-only; no backend change |
| Open-as-window VNC | Browser (`X11DisplayStreamWindow`) | API (`displays.getVncUrl`) | UNCHANGED from 254 — reuse verbatim |

## Standard Stack

### Core (all already in the tree — NO new npm deps for §1/§2/§4/§5)
| Library / Tool | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| `maim` | 5.7.4 (apt) | Per-display screenshot via XCB | Already the primary capture tool; works on composited X where scrot returns black [VERIFIED: `screenshot.ts:101-130`] |
| `scrot` | apt | Screenshot fallback | Already wired as strategy 2 [VERIFIED: `screenshot.ts:198-210`] |
| `sharp` | installed (used by 208-11) | PNG→JPEG transcode + downscale | Already imported lazily in `parsePngResult` [VERIFIED: `screenshot.ts:235`] |
| `framer-motion` | in `ui` deps | Popover/animation | Already used in `top-bar.tsx` / `active-displays-panel.tsx` |
| Radix `Popover` | shadcn | Popover surface | Already used at `top-bar.tsx:358-372` |
| open-meteo HTTP API | — (no key) | Weather/geocode | Already used by `useLocationWeather` [VERIFIED: `top-bar.tsx:487-499`] |

### Supporting (NEW system packages for §3 only — must be added to `update.sh` apt list)
| Tool | Purpose | When to Use | Note |
|------|---------|-------------|------|
| `feh` | `feh --bg-fill <wallpaper>` sets X root wallpaper | §3 shell branding | NOT currently in apt list [VERIFIED: `update.sh:359-382` — only `xvfb fluxbox` + screenshot tools] |
| `tint2` | Slim native dock/panel on the X display | §3 dock (recommended over Chromium kiosk) | NOT installed; lightweight (~1-2MB RSS), config-file driven |
| `fluxbox` styles | Themed titlebar/menu/toolbar colors+fonts | §3 fluxbox theming | `fluxbox` ALREADY installed; only a style file is new |

### Alternatives Considered (for the §3 dock mechanism — Claude's Discretion)
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tint2` native panel | Borderless Chromium `--kiosk` strip rendering a React dock | **REJECTED for default.** Each kiosk = a full Chrome process (~150-300MB RSS) PER display. The Mini PC already runs one Chrome per WebApp; adding a dock-Chrome per display roughly doubles Chrome process count → memory pressure. `tint2` is ~100× lighter and renders instantly with no profile/CDP/Singleton machinery. Use kiosk only if a future phase needs rich interactive dock content. |
| Generate fluxbox style from tokens at boot | Hand-write a static `.fluxbox/styles/livos` checked into the repo | Static is simpler but drifts from `theme.json`; a tiny boot-time generator (read `theme.json` → emit style) keeps them in sync. Either is acceptable; static-file-shipped is lower-risk for v1. |

**No `npm install` required** for §1/§2/§4/§5. For §3, the only "install" is apt: add `feh tint2` to the `update.sh` streaming-deps block (`update.sh:359` / `livos/install.sh:615`).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────── BROWSER (React UI) ───────────────────────────┐
│  TopBar right cluster (top-bar.tsx)                                        │
│    [🖥️ Displays popover]  +  [ClockWithLocation (glow-up)]                 │
│         │                                                                  │
│         │ open → Radix Popover                                            │
│         ▼                                                                  │
│   DisplaysPopover (NEW, replaces active-displays-panel + windows-mgr)      │
│     ├─ displays.list.useQuery (poll while open)  ──────────┐               │
│     ├─ per card: displays.screenshot poll ~2s    ──────┐   │               │
│     │     <img src={`data:image/jpeg;base64,${b64}`}/> │   │               │
│     ├─ click card → windowManager.openWindow(            │   │              │
│     │       `DISPLAY_:N`, suggested:{w,h})  ── opens ──┐  │   │             │
│     └─ folded-in window rows (focus/min/pin/close)    │  │   │             │
└───────────────────────────────────────────────────────┼──┼───┼───────────┘
                                                         │  │   │ HTTP/tRPC
┌──────────────────── livinityd (tsx, no compile) ──────┼──┼───┼───────────┐
│  displays.getVncUrl ──► StreamManager.startStream  ◄──┘  │   │            │
│       (mode:'vnc-window') → x11vnc + websockify          │   │            │
│  displays.screenshot (NEW) ──────────────────────────────┘   │            │
│       canAccessDisplay → swap process.env.DISPLAY=:N →        │            │
│       captureScreenshot() → maim/scrot → sharp jpeg → b64    │            │
│  displays.list ──► displayManager.list() ────────────────────┘            │
│                         │ reads Redis luse:display:*                      │
│  WebAppWindowManager.spawn() (NEW: + displayManager.registerExisting)     │
│  WebAppWindowManager.close() (NEW: + displayManager.kill)                 │
└────────────────────────┬──────────────────────────────────────────────────┘
                         │ spawns / writes
┌────────────────────── X11 / OS (Mini PC) ─────────────────────────────────┐
│  :1 host Xvfb  ── feh wallpaper + themed fluxbox + tint2 dock (NEW §3)     │
│  :10/:11/... per-WebApp Xvfb (one Chrome each; minimal shell)              │
│  Redis luse:display:*  (the display registry)                             │
└───────────────────────────────────────────────────────────────────────────┘
```

### Recommended file touch-map
```
livinityd/source/
├── modules/computer-use/trpc-router.ts        # ADD displays.screenshot mutation (+ reuse canAccessDisplay)
├── modules/computer-use/native/screenshot.ts  # UNCHANGED (reused as-is)
├── modules/webapps/window-manager.ts           # ADD displayManager opt; registerExisting on spawn, kill on close
├── modules/shell/ (NEW dir)                     # branded-shell boot helper (feh + fluxbox-style + tint2)
│   └── assets/livos-wallpaper.png               # NEW filesystem asset (ships via livinityd source rsync)
├── index.ts                                     # WIRE displayManager into WebAppWindowManager ctor; call shell boot on :1
ui/src/
├── modules/desktop/top-bar.tsx                  # REWORK right cluster → single 🖥️ popover; extend ClockWithLocation
├── modules/desktop/displays-popover.tsx (NEW)   # merged surface (cards + window rows)
├── modules/desktop/active-displays-panel.tsx    # DELETE
├── modules/desktop/windows-manager-panel.tsx    # FOLD INTO displays-popover (or keep + import)
└── router.tsx                                    # REMOVE ActiveDisplaysPanel import (L25) + mount (L95)
```

### Pattern 1: Per-display screenshot via env-DISPLAY swap (the §1 seam)
**What:** Reuse `captureScreenshot()` exactly as the MCP `screenshot_window` tool does for cross-display capture.
**When to use:** `displays.screenshot({display})` handler.
**Example (the exact idiom already in the codebase):**
```typescript
// Source: VERIFIED livos/.../computer-use/mcp/tools.ts:1655-1672
const targetDisplay = displayArg ?? defaultDisplay!
const prevDisplay = process.env.DISPLAY
try {
  process.env.DISPLAY = targetDisplay
  const shot = await captureScreenshot()   // maim/scrot inherit DISPLAY; sharp → jpeg
  return {content: [{type: 'image', data: shot.base64, mimeType: shot.mimeType}], ...}
} finally {
  if (prevDisplay === undefined) delete process.env.DISPLAY
  else process.env.DISPLAY = prevDisplay
}
```
The MCP child serializes calls so the env swap is safe there. **In livinityd (multi-request server) the global `process.env.DISPLAY` mutation is NOT concurrency-safe** — see Pitfall 1 for the mitigation (serialize via a mutex, or extend `captureScreenshot` to accept an explicit `display` and set it only in the spawned subprocess env, not `process.env`).

### Pattern 2: registerExisting NOT create for webapp displays (the §2 fix)
**What:** WebApp Xvfb is **already spawned** by `spawnXvfb` inside `WebAppWindowManager.spawn` (`window-manager.ts:423-428`). The display server exists. So `displayManager.create()` is WRONG (it would spawn a *second* Xvfb on a *different* `:N` from its own allocator). Use `registerExisting` (Redis-only HSET, no spawn) — exactly what 254-05 added for `:1`.
**Example:**
```typescript
// In spawn(), AFTER xvfb readiness + entry creation (window-manager.ts ~L493):
await this.displayManager?.registerExisting({
  display,                       // ':10' — the already-running per-app Xvfb
  width: WEBAPP_DISPLAY_WIDTH,   // 1280  (window-manager.ts:107)
  height: WEBAPP_DISPLAY_HEIGHT, // 720
  mode: 'xvfb',
  name: opts.url,                // or derived app name (the popover shows this)
  ownerSession: opts.userId,     // user-owned (NOT '' which is host/shared)
})
// In close(), step ~5 (window-manager.ts ~L696, where displayAllocator.release runs):
await this.displayManager?.kill({display: entry.display, callerSession: entry.userId})
```
`registerExisting` is idempotent and does NOT touch the `:N` allocator (`display-manager.ts:304-352`).

### Anti-Patterns to Avoid
- **Calling `displayManager.create()` from the webapp path** — double-spawns Xvfb + advances the wrong allocator. Use `registerExisting`.
- **Opening N noVNC/RFB sockets in the popover** — explicitly forbidden by D-255-THUMBS-SCREENSHOT. Use `displays.screenshot` polling.
- **Setting wallpaper to a UI-served URL** — `feh` reads the host filesystem; `public/wallpapers/*.jpg` are browser assets at `ui/public/wallpapers` and are NOT reachable by feh inside the Xvfb. Ship a real file (see Pitfall 5).
- **Logging the wsUrl** — `displays.getVncUrl` deliberately logs only the display id (`trpc-router.ts:146`); the screenshot route returns base64 (not a token) so logging is moot, but keep the contract: never log capability tokens.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-display screenshot | A new x11grab/ffmpeg pipeline | `captureScreenshot()` (`screenshot.ts`) | Already handles maim→scrot fallback, black-frame detection, sharp JPEG transcode |
| JPEG encode/downscale | Manual sharp pipeline | `parsePngResult` env knobs (`LUSE_SCREENSHOT_*`) | Already env-tuned q60 |
| Display authorization | New ACL check | `canAccessDisplay()` (`trpc-router.ts:64-72`) | 254-06 admin-bypass + owner isolation, unit-tested |
| Display registry | New Redis schema | `displayManager.registerExisting/kill` | 254-05 shape, idempotent, allocator-safe |
| Open-as-window VNC | New stream window | `X11DisplayStreamWindow` + `openWindow('DISPLAY_:N', suggested)` | 254-03, viewOnly:false, unchanged |
| Window list rows | New window-state store | `WindowsManagerPanel` rows (`windows-manager-panel.tsx`) | Already Focus/Min/Pin/Close over `useWindowManagerOptional()` |
| X root wallpaper | A custom X drawing program | `feh --bg-fill` | Standard, persists root pixmap |
| Slim dock | A bespoke X panel | `tint2` | Config-file driven, tiny footprint |

**Key insight:** §1/§2/§4 are almost entirely *re-wiring existing primitives*. The only net-new code is the `displays.screenshot` handler (~30 lines), the two displayManager calls in webapp spawn/close (~6 lines + ctor injection), and the popover composition (UI). §3 is the only place that introduces system-level integration.

## Runtime State Inventory

> This is a feature phase, but it WRITES new runtime state (Redis display records for webapps) and SHIPS new OS assets. Inventory below.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | NEW: webapp `:N` records written to Redis `luse:display:<:N>` via `registerExisting` (key prefix `luse:display:` per `redis-keys.ts`). Owner = `userId` (NOT empty). On `close()`, `kill()` DELs both `luse:display:<:N>` and `:apps`. | Code edit only (no migration of existing data). Existing `:1` record (254-05) and MCP `:10+` records UNAFFECTED. |
| Live service config | `tint2` config + fluxbox style file + feh invocation are generated/written at boot under `/tmp` or `~/.fluxbox` (like the existing `EMPTY_RC` at `/tmp/livos-fluxbox.cfg`, `fluxbox-wm.ts:77`). Not git-tracked runtime artifacts; regenerated each boot. | Boot-time write (idempotent overwrite, mirror `fluxbox-wm.ts:82-83`). |
| OS-registered state | None new. No systemd units required (shell spawns are child processes of livinityd, like the existing Xvfb/fluxbox). | None — verified: shell helpers spawn as livinityd children, no new `.service`. |
| Secrets/env vars | None. open-meteo needs no key (`top-bar.tsx:485` — "free, no API key"). Screenshot route is auth-gated by `privateProcedure` + `canAccessDisplay`. | None. |
| Build artifacts | NEW filesystem asset: a LivOS wallpaper image must ship to the Mini PC. livinityd runs via **tsx (no build)** and its `source/` rsyncs wholesale (`update.sh:433-435`). An asset placed under `livinityd/source/modules/shell/assets/` reaches `/opt/livos/packages/livinityd/source/...` automatically. | Place wallpaper under livinityd `source/`; reference by absolute deployed path. ALSO add `feh tint2` to `update.sh:359` apt block (else feh/tint2 ENOENT on Mini PC). |

**The canonical question — after every repo file is updated, what runtime state still lacks the new behavior?**
(a) `feh`/`tint2` binaries — NOT present until the apt list is patched AND `update.sh` re-run as root. (b) Existing webapp displays spawned *before* the deploy won't have Redis records until re-spawned (acceptable — they get registered on next spawn). (c) The `:1` shell branding only applies after a livinityd restart that runs the new boot helper.

## Common Pitfalls

### Pitfall 1: `process.env.DISPLAY` mutation is not concurrency-safe in the server
**What goes wrong:** Two concurrent `displays.screenshot` requests (e.g. a 4-card popover polling every 2s) both swap `process.env.DISPLAY`; request B sets it to `:11` while request A's `captureScreenshot` is mid-flight → A's `maim` subprocess inherits `:11` and screenshots the wrong display.
**Why it happens:** `mcp/tools.ts` gets away with the swap because the MCP child **serializes** tool calls over stdio JSON-RPC (`tools.ts` note ~L390). livinityd is a concurrent server.
**How to avoid:** Two clean options — (A) **Preferred:** extend `captureScreenshot(options)` to accept `options.display` and pass `{...process.env, DISPLAY: display}` to the `execFileAsync('maim', …, {env})` call (`screenshot.ts:159`), so `process.env` is never globally mutated. (B) Serialize screenshot calls behind a single async mutex/queue in the router. (A) is cleaner and the subprocess `env` override is exactly how `fluxbox-wm.ts:103` and `display-size.ts` scope DISPLAY already.
**Warning signs:** Popover cards showing the wrong screen under load; flaky tests that pass single-threaded.

### Pitfall 2: Webapp allocator vs displayManager allocator collision
**What goes wrong:** `WebAppWindowManager` uses `new DisplayAllocator()` (in-memory, range [10,100), `index.ts:1088`, `display-allocator.ts`). `displayManager.create()` uses its OWN allocator that **seeds from Redis** `luse:display:*` on construction (`display-manager.ts:188-205`). Once webapps `registerExisting` write `luse:display:10`, a livinityd restart makes `displayManager`'s allocator seed *past* `:10` — but the in-memory `DisplayAllocator` resets to `:10` every boot and has no Redis awareness. If anything ever calls `displayManager.create()` (the MCP `computer_create_display` tool does), the two could both target the same `:N`.
**Why it happens:** Two independent allocators sharing one Redis registry namespace.
**How to avoid:** Because webapps use `registerExisting` (NOT `create`) the **webapp path never advances displayManager's allocator** — good. The risk is the MCP `create()` path colliding with a webapp's in-memory-allocated `:N`. Mitigation: `displayManager.create()` already seeds past the highest existing `luse:display:*` on boot (`display-manager.ts:191-198`), and webapps now WRITE their `:N` to that namespace → on the next `create()` the seed sees them. The residual gap is *within a single boot* (webapp allocates `:12` in-memory while MCP create independently picks `:12`). **Recommended:** have `registerExisting` from a webapp also nudge a shared high-water mark, OR (simplest, low-risk) keep the existing ranges disjoint by documenting that MCP `create()` is admin-only/rare and the in-boot overlap window is tiny. Flag this explicitly to the planner — it's the subtlest correctness issue in the phase. (See Open Question 1.)
**Warning signs:** Two displays claiming the same `:N`; `Xvfb` "server already active for display N" errors in logs.

### Pitfall 3: Chromium-kiosk-per-display memory blowup
**What goes wrong:** Implementing the §3 dock as a borderless Chromium `--kiosk` per display adds one full Chrome process (~150-300MB) per open display on a 32GB Mini PC that already runs one Chrome per WebApp.
**How to avoid:** Use `tint2` (native, ~1-2MB). Documented as the recommendation under D-255-SHELL-LIVOS-BRANDED Claude's-Discretion.
**Warning signs:** RSS climbing with each opened display; OOM-killer activity.

### Pitfall 4: fluxbox swallowing keys / decoration offset
**What goes wrong:** Default fluxbox keybindings (Alt+F1/Alt+Tab) eat keys the remote VNC user expects; title-bar decorations shift click coords.
**Why it happens:** Known issue — already solved for the empty-keybinding case by `EMPTY_RC` (`fluxbox-wm.ts:63-72`) with `defaultDeco: NONE` + `fullMaximization`.
**How to avoid:** When adding a *themed* style for `:1`, DO NOT reintroduce decorations on app windows. Apply the LivOS *style* (colors/fonts for menu/toolbar) while keeping the existing `EMPTY_RC` window-management behavior. fluxbox separates **style** (`~/.fluxbox/styles/<name>`, colors/fonts) from **init/keys/apps** (behavior) — theme the style only.
**Warning signs:** WebApp keys not reaching Chrome; clicks landing on title bars (the 102-r9 bug).

### Pitfall 5: feh wallpaper not persisting / wrong path
**What goes wrong:** `feh --bg-fill <url>` fails because the path is a browser URL, not a filesystem path; or the wallpaper vanishes on restart.
**Why it happens:** `ui/public/wallpapers/*.jpg` are vite-served browser assets — invisible to feh inside the X server. feh persistence relies on `~/.fehbg` (a script feh writes) being re-run, or feh being re-invoked each boot.
**How to avoid:** Ship a real PNG/JPG under `livinityd/source/modules/shell/assets/` (reaches `/opt/livos/packages/livinityd/source/...` via the wholesale source rsync at `update.sh:433`). Invoke `feh --bg-fill /opt/livos/.../assets/livos-wallpaper.png` with `DISPLAY=:1` env at boot, idempotently re-run each livinityd start (don't rely on `~/.fehbg`). Note `/home/bruce` must be bruce-owned (MEMORY: `feedback_bruce_home_ownership`) for `~/.fehbg` writes — avoid the dependency by re-invoking feh directly.
**Warning signs:** Gray root window on `:1`; `feh ERROR: Cannot open … No such file`.

### Pitfall 6: Removing the strip without removing its router mount (regression)
**What goes wrong:** Deleting `active-displays-panel.tsx` but leaving the import (`router.tsx:25`) + mount (`router.tsx:95`) → build break.
**How to avoid:** Remove BOTH the import and the `<ActiveDisplaysPanel />` JSX, and delete the panel's test file. The hot-zone z-index warning (WR-02, 254 verification) disappears with the strip.
**Warning signs:** Vite build error "ActiveDisplaysPanel is not defined".

### Pitfall 7: Deploy reality — tsx vs vite, and asset shipping
**What goes wrong:** Backend change "doesn't take" or UI change "doesn't take" because the wrong build path is assumed.
**How to avoid:** livinityd runs TypeScript via **tsx — no compile** (CONTEXT + `update.sh:431` comment); source rsyncs and `systemctl restart livos` picks it up. UI needs a **vite build** (handled by `update.sh`). System assets (wallpaper) ride the livinityd source rsync. `feh`/`tint2` need the apt-list patch in `update.sh` + a root re-run. Deploy is `git push origin master` then `bash /opt/livos/update.sh` as root on the Mini PC.
**Warning signs:** New tRPC route 404s after deploy (forgot restart); feh ENOENT (forgot apt).

## Code Examples

### §1 — `displays.screenshot` tRPC (add to `computer-use/trpc-router.ts`)
```typescript
// Source: pattern from mcp/tools.ts:1655-1672 + screenshot.ts; auth from canAccessDisplay (trpc-router.ts:64-72)
import {captureScreenshot} from './native/screenshot.js'

screenshot: privateProcedure
  .input(z.object({display: displayIdSchema}))   // reuse the :N regex already at line 43
  .mutation(async ({ctx, input}) => {
    const userId = ctx.currentUser?.id
    if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
    const dm = ctx.livinityd?.displayManager
    if (!dm) throw new TRPCError({code: 'SERVICE_UNAVAILABLE'})
    const record = (await dm.list()).find((d) => d.display === input.display)
    if (!record) throw new TRPCError({code: 'NOT_FOUND'})
    const callerRole = ctx.currentUser?.role ?? 'member'
    if (!canAccessDisplay({ownerSession: record.owner_session, callerSession: userId, callerRole}))
      throw new TRPCError({code: 'FORBIDDEN'})
    // PREFERRED (Pitfall 1): pass display into captureScreenshot via subprocess env,
    // not process.env. If captureScreenshot is extended to accept {display}:
    const shot = await captureScreenshot({display: input.display})
    return {dataUrl: `data:${shot.mimeType};base64,${shot.base64}`, width: shot.width, height: shot.height}
  }),
```
Mount: already exported via `displaysRouter`; the router is mounted at `server/trpc/index.ts:332`. A mutation does NOT need to be in `httpOnlyPaths` unless it must survive WS reconnect — screenshot is idempotent/cheap, so a `query` with `refetchInterval: 2000` is also viable and arguably cleaner for the ~2s poll (no httpOnlyPaths entry needed). **Recommendation: make it a `query`** so the popover can use `useQuery({enabled: open, refetchInterval: 2000})` per the existing `active-displays-panel.tsx:32` pattern.

### §1 — captureScreenshot signature extension (Pitfall 1 mitigation, `screenshot.ts`)
```typescript
// Extend CaptureScreenshotOptions (screenshot.ts:93) with display; thread into execFile env.
export interface CaptureScreenshotOptions { windowId?: number; display?: string }
// at screenshot.ts:159 — instead of {env: process.env}:
await execFileAsync('maim', maimArgs, {
  env: options?.display ? {...process.env, DISPLAY: options.display} : process.env,
  timeout: 10_000,
})
// same for scrot at :199. No process.env global mutation → concurrency-safe.
```

### §5 — ClockWithLocation glow-up (extend `top-bar.tsx:494-499` + `516-567`)
```typescript
// Add weather_code + is_day to the open-meteo current= params (top-bar.tsx:495):
`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day`
// WMO code → glyph (additive helper):
function wmoGlyph(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '⛅'
  if (code === 3) return '☁️'
  if (code >= 45 && code <= 48) return '🌫️'
  if (code >= 51 && code <= 67) return '🌧️'
  if (code >= 71 && code <= 77) return '❄️'
  if (code >= 80 && code <= 82) return '🌧️'
  if (code >= 95) return '⛈️'
  return '☁️'
}
// Greeting (local hour): const h = now.getHours();
// h<6 'İyi geceler' | h<12 'Günaydın' | h<18 'İyi günler' | else 'İyi akşamlar'  → `${greet}, ${userName}`
// day/night accent: use is_day (or h>=6 && h<20) to pick a warmer vs cooler --fg tint.
```
[CITED: open-meteo.com — `weather_code` is a documented WMO-code field on `current=`; `is_day` is documented 0/1] — verify exact param spelling against current docs before locking (Assumption A1).

### §4 — TopBar right-cluster rework (`top-bar.tsx:357-374`)
Replace the windows-manager `Popover` block + leave `ClockWithLocation` — render ONE `🖥️` `PopoverTrigger` whose `PopoverContent` is the NEW `DisplaysPopover` that internally renders display cards (from `displays.list`) AND the folded-in window rows (the body of `WindowsManagerPanel`). Card click reuses the verbatim `active-displays-panel.tsx:79` call:
```typescript
windowManager?.openWindow(`DISPLAY_${d.display}`, '/', `Display ${d.display}`, '🖥️', undefined, {width: d.width, height: d.height})
```

## State of the Art

| Old Approach (254) | Current Approach (255) | Why Changed | Impact |
|--------------------|------------------------|-------------|--------|
| Top-edge 2px hover strip (`active-displays-panel.tsx`) | Navbar `🖥️` popover | D-255-REPLACE-STRIP-AND-MERGE | Remove strip + router mount; one surface |
| Separate windows-manager `LayoutGrid` popover | Folded into Displays popover | D-255-REPLACE-STRIP-AND-MERGE | One popover, two sections |
| WebApp displays invisible in `displays.list` | Registered via `registerExisting` | D-255-WEBAPP-REGISTER | Webapps appear in popover |
| No display preview (open to see) | ~2s JPEG screenshot thumb | D-255-THUMBS-SCREENSHOT | Preview without RFB cost |
| Bare gray fluxbox root on `:1` | feh wallpaper + themed fluxbox + tint2 | D-255-SHELL-LIVOS-BRANDED | Branded desktop |
| Clock + temp only | + glyph + greeting + day/night | D-255-NAVBAR-GLOWUP | Richer clock cluster |

**Deprecated/outdated:** none being removed except the 254-04 strip (intentional).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | open-meteo `current=temperature_2m,weather_code,is_day` is the exact current param spelling and returns `weather_code`/`is_day` | §5 | Glyph/day-night silently absent (graceful fallback to city+temp); confirm against open-meteo docs before locking |
| A2 | `tint2` is `apt install tint2` on Ubuntu 24.04 and renders on a bare Xvfb without a compositor | §3 | If unavailable, fall back to a static fluxbox toolbar/slit as the "dock"; verify on Mini PC |
| A3 | A wallpaper asset under `livinityd/source/.../assets/` is preserved by the `rsync -a --delete source/ source/` (binary files survive) | §3 deploy | Binary files DO survive rsync; risk is low. Verify the asset dir isn't gitignored |
| A4 | `displayManager.kill({callerSession: userId})` succeeds for a webapp display whose `owner_session === userId` | §2 | `kill` gates on `owner_session !== callerSession` (`display-manager.ts:407`); since spawn writes `ownerSession: userId`, this matches. LOW risk |
| A5 | Making `displays.screenshot` a `query` (not mutation) is acceptable given it spawns a `maim` subprocess | §1 | Subprocess-spawning queries are unusual but fine here (idempotent, no state change); if WS-drop matters, make it a mutation in httpOnlyPaths |

## Open Questions

1. **Webapp ↔ MCP allocator overlap within a single boot (Pitfall 2).**
   - What we know: webapps use an in-memory `DisplayAllocator` (resets to :10 each boot); `displayManager.create()` seeds from Redis. Webapps will now write to that Redis namespace via `registerExisting`.
   - What's unclear: whether MCP `computer_create_display` and a webapp could both pick the same `:N` in the same boot before Redis reflects it.
   - Recommendation: Planner should either (a) reserve disjoint ranges (e.g. webapps [10,60), MCP create [60,100)), or (b) have webapp spawn consult/advance the displayManager's allocator high-water mark. Option (a) is the lowest-risk single-task fix. Confirm with a unit test asserting no `:N` overlap.

2. **fluxbox style: boot-generated from `theme.json` vs static checked-in style file.**
   - What we know: `@livinity/design-tokens/theme.json` exposes colors (`accentBlue` etc., light theme) and fonts; `tokens.css` has the full dark palette (`--card-bg:#16161a`, `--fg:#f5f5f7`, etc.). fluxbox styles are a simple `key: value` text format.
   - Recommendation: ship a static `livos` fluxbox style (lower risk for v1) authored from the dark token values; a boot-time generator is a nice-to-have follow-up. Either reads from the design-tokens package (`design-tokens/theme.json` / `tokens.css`).

3. **Which wallpaper asset is "the LivOS wallpaper"?**
   - What we know: no in-repo asset is designated for the in-display root; `ui/public/wallpapers/*.jpg` are browser-only.
   - Recommendation: pick one existing wallpaper jpg (or a brand-mark PNG), copy it into `livinityd/source/.../shell/assets/`. Human/design call; flag for the planner to confirm the source image.

## Environment Availability

| Dependency | Required By | Available on Mini PC | Version | Fallback |
|------------|------------|----------------------|---------|----------|
| `maim` | §1 screenshot | ✓ (apt list `update.sh:361`) | 5.7.4 | `scrot` (also installed) |
| `scrot` | §1 fallback | ✓ | apt | — |
| `sharp` | §1 JPEG | ✓ (208-11) | installed | — |
| `Xvfb` | :1 + per-app | ✓ | apt `update.sh:369` | — |
| `fluxbox` | §3 WM + style | ✓ | apt `update.sh:369` | — |
| `feh` | §3 wallpaper | ✗ NOT INSTALLED | — | `xsetroot -solid` (flat color, no image) |
| `tint2` | §3 dock | ✗ NOT INSTALLED | — | fluxbox toolbar/slit as minimal dock |
| open-meteo API | §5 | ✓ (network) | — | city+temp only (existing fallback) |

**Missing dependencies with fallback:**
- `feh` — add to `update.sh:359` apt block; fallback `xsetroot -solid '#0a0a0c'` (token `--bg` dark) gives a branded flat color if feh somehow missing.
- `tint2` — add to apt block; fallback is the native fluxbox toolbar (already available) styled via the LivOS fluxbox style.

**No blocking missing dependencies** — every §3 piece degrades gracefully.

## Validation Architecture

> nyquist_validation treated as enabled (not explicitly false in config). Testable seams identified below.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing — see `computer-use/__tests__/trpc-router-authz.test.ts`, `displays/__tests__/display-manager.test.ts`, `webapps/window-manager.test.ts`) |
| Config file | per-package vitest (livinityd + ui) |
| Quick run command | `pnpm --filter @livos/livinityd test -- <file>` (mirror 254 plan commands) |
| Full suite command | `pnpm --filter @livos/livinityd test && pnpm --filter ui test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GOAL-255-LIVE-THUMBS | `displays.screenshot` returns dataUrl for owned/shared display; FORBIDDEN for foreign non-admin | unit | `pnpm --filter @livos/livinityd test -- computer-use/__tests__/trpc-router-screenshot.test.ts` | ❌ Wave 0 |
| GOAL-255-LIVE-THUMBS | `captureScreenshot({display})` passes DISPLAY in subprocess env, not process.env | unit | `pnpm --filter @livos/livinityd test -- computer-use/native/screenshot.test.ts` | ✅ extend existing `mcp/tools.test.ts` sibling / add case |
| GOAL-255-WEBAPP-DISPLAYS | spawn() calls `displayManager.registerExisting` with owner=userId; close() calls `kill` | unit | `pnpm --filter @livos/livinityd test -- webapps/window-manager.test.ts` | ✅ extend (add cases) |
| GOAL-255-WEBAPP-DISPLAYS | no `:N` overlap between webapp registerExisting and MCP create (Pitfall 2) | unit | same file | ❌ Wave 0 |
| GOAL-255-DISPLAYS-POPOVER | strip removed: `active-displays-panel.tsx` deleted, no router import/mount | static/grep | `pnpm --filter ui test` + grep assertion | ❌ Wave 0 (or verify-by-absence) |
| GOAL-255-NAVBAR-GLOWUP | `wmoGlyph()` maps WMO codes → glyphs | unit | `pnpm --filter ui test -- top-bar` | ❌ Wave 0 (extract helper to testable module) |
| GOAL-255-LIVOS-SHELL | shell boot writes fluxbox style + invokes feh/tint2 with DISPLAY=:1 (spawn argv shape) | unit (mock spawn) | `pnpm --filter @livos/livinityd test -- shell/branded-shell.test.ts` | ❌ Wave 0 |
| GOAL-255-LIVOS-SHELL | branded look renders (wallpaper + dock visible) | **manual / human** | live browser at bruce.livinity.io → open `:1` VNC window | n/a — human-verify-only |

### Sampling Rate
- **Per task commit:** the single test file touched by the task (`-- <file>`).
- **Per wave merge:** `pnpm --filter @livos/livinityd test && pnpm --filter ui test`.
- **Phase gate:** full suite green before `/gsd-verify-work`; then the human VNC walk for §3 visual + §4 popover interaction.

### Wave 0 Gaps
- [ ] `computer-use/__tests__/trpc-router-screenshot.test.ts` — covers GOAL-255-LIVE-THUMBS auth + dataUrl shape (model on `trpc-router-authz.test.ts`)
- [ ] `webapps/window-manager.test.ts` — ADD register/kill cases (extend existing file; inject a fake displayManager)
- [ ] `shell/branded-shell.test.ts` — feh/fluxbox-style/tint2 argv via injected spawnFn (mirror `fluxbox-wm.ts` test style)
- [ ] Extract `wmoGlyph`/greeting helpers from `top-bar.tsx` into a testable module (e.g. `desktop/clock-helpers.ts`)
- [ ] Framework install: none — vitest already present.

## Security Domain

> security_enforcement treated as enabled. Phase touches an auth-gated tRPC seam + spawns subprocesses against X.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `privateProcedure` gates `displays.screenshot` (caller from `ctx.currentUser`, never input) |
| V4 Access Control | yes | `canAccessDisplay` (254-06) reused verbatim — admin bypass + owner isolation for screenshots, identical to getVncUrl |
| V5 Input Validation | yes | `displayIdSchema` regex `/^:\d+(\.\d+)?$/` (`trpc-router.ts:43`) blocks shell-meta in `:N`; `screenshot.ts`/`display-size.ts` already strict-regex-validate display before passing to subprocess argv |
| V6 Cryptography | no | none introduced |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Display-id arg injection into `maim`/`xdotool` argv | Tampering | Strict `:N` regex BEFORE subprocess (`display-size.ts:71` precedent); never interpolate into a shell string |
| Cross-session display peek via screenshot | Information disclosure | `canAccessDisplay` — non-admin cannot screenshot a foreign `owner_session`; webapp displays now carry `owner_session=userId` so they're correctly isolated |
| `process.env.DISPLAY` race leaking one user's screen to another's request | Information disclosure | Pitfall 1 mitigation — subprocess-scoped env, no global mutation |
| Capability-token leakage | Information disclosure | screenshot returns base64 (not a token); preserve the 254 contract of never logging wsUrls |

## Sources

### Primary (HIGH confidence — read this session, file:line cited inline)
- `livos/packages/livinityd/source/modules/computer-use/trpc-router.ts` — displays.* + canAccessDisplay
- `livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts` + `types.ts` — registerExisting/create/kill/list, two-allocator analysis
- `livos/packages/livinityd/source/modules/computer-use/native/screenshot.ts` — captureScreenshot, sharp JPEG, maim/scrot
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts:1655-1672` — per-display env-swap idiom
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — spawn/close, allocator usage, no displayManager ref
- `livos/packages/livinityd/source/modules/streaming/display-allocator.ts` — in-memory [10,100) allocator
- `livos/packages/livinityd/source/modules/webapps/fluxbox-wm.ts` — fluxbox spawn + EMPTY_RC style precedent
- `livos/packages/livinityd/source/index.ts:900-1135` — boot Xvfb/fluxbox/registerExisting; both allocator constructions
- `livos/packages/ui/src/modules/desktop/top-bar.tsx` — TopBar, ClockWithLocation, useLocationWeather
- `livos/packages/ui/src/modules/desktop/windows-manager-panel.tsx` + `active-displays-panel.tsx` + `router.tsx` — surfaces to merge/remove
- `livos/packages/ui/src/modules/window/app-contents/x11-display-stream-window.tsx` — open-as-window VNC (reuse)
- `livos/packages/design-tokens/{theme.json,tokens.css,package.json}` — token manifest for shell theming
- `update.sh:353-435` + `livos/install.sh:613-625` — apt list (no feh/tint2), source rsync (tsx no-build)

### Secondary (MEDIUM)
- 254-VERIFICATION.md — confirms 254 shipped contracts (canAccessDisplay, registerExisting, suggested size)

### Tertiary (LOW — verify before locking)
- open-meteo `weather_code`/`is_day` param spelling (A1) — confirm against open-meteo.com current docs
- `tint2` availability/behavior on bare Xvfb (A2) — verify on Mini PC during execution

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every reused primitive read this session and cited
- §1 screenshot seam: HIGH — capture path + env-swap idiom already in codebase
- §2 webapp register: HIGH — registerExisting shape known; collision risk explicitly surfaced
- §3 shell: MEDIUM — mechanism (feh/fluxbox-style/tint2) is standard but feh/tint2 not yet installed; visual outcome is human-verify-only
- §4 popover: HIGH — pure composition over read-this-session components
- §5 clock: HIGH (impl) / LOW (open-meteo exact param) — additive, graceful fallback
- Pitfalls: HIGH — allocator collision + env-race grounded in real code

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (stable internal codebase; open-meteo param check has no expiry concern)
