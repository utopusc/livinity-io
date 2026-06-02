# Phase 255: LivOS Spaces - Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 13 (5 NEW, 5 MODIFIED, 3 DELETED)
**Analogs found:** 10 / 10 (every new/modified file has a direct codebase analog; only the §3 shell *visual outcome* is human-verify-only)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `computer-use/trpc-router.ts` — ADD `displays.screenshot` | route (tRPC) | request-response | `displays.getVncUrl` (same file) + `mcp/tools.ts:1655-1672` env-swap + `native/screenshot.ts` | exact |
| `computer-use/native/screenshot.ts` — extend `captureScreenshot({display})` | service (subprocess capture) | file-I/O / transform | itself (`maim`/`scrot` execFile env at L159/L199) | exact (in-file extension) |
| `webapps/window-manager.ts` — register/kill on spawn/close | service | event-driven (lifecycle) | `index.ts:963-982` boot `registerExisting(:1)` + `display-manager.ts:304-352`/`398-445` | exact |
| `index.ts` — inject `displayManager` into `WebAppWindowManager` ctor | config (DI wiring) | request-response | existing ctor block `index.ts:1089-1113` + `displayManager` construction `852-867` | exact |
| `desktop/displays-popover.tsx` (NEW) | component | request-response (poll) | `active-displays-panel.tsx` (cards) + `windows-manager-panel.tsx` (rows) | exact (merge of two) |
| `desktop/top-bar.tsx` — single 🖥️ popover + ClockWithLocation glow-up | component | request-response | windows-mgr Popover `top-bar.tsx:357-374` + `ClockWithLocation` `516-567` + `useLocationWeather` `457-514` | exact (in-file) |
| `desktop/clock-helpers.ts` (NEW, extract) | utility | transform | `wmoGlyph`/greeting logic (research §5) — testable extract | role-match (new pure module) |
| `router.tsx` — remove ActiveDisplaysPanel | config (routing) | n/a | `router.tsx:25` import + `:95` mount | exact |
| `desktop/active-displays-panel.tsx` — DELETE | component | n/a | — (removal) | n/a |
| `desktop/active-displays-panel.test.tsx` — DELETE | test | n/a | — (removal) | n/a |
| `shell/branded-shell.ts` (NEW) | service (OS integration) | event-driven (boot) | `webapps/fluxbox-wm.ts` (spawn + EMPTY_RC write) + `index.ts:936-992` boot | role-match (new system piece) |
| `shell/assets/livos-wallpaper.png` (NEW asset) | config (binary asset) | file-I/O | none (new) — ships via livinityd source rsync | no analog |
| `update.sh` — add `feh tint2` to apt | config (deploy) | batch | apt block `update.sh:359-370` | exact |

NEW TEST FILES (Wave 0 RED): `computer-use/__tests__/trpc-router-screenshot.test.ts`, `shell/branded-shell.test.ts`; EXTEND: `webapps/window-manager.test.ts`, `desktop/clock-helpers.test.ts`.

---

## Pattern Assignments

### `computer-use/trpc-router.ts` — ADD `displays.screenshot` (route, request-response)

**Analog:** `displays.getVncUrl` in the SAME file (`trpc-router.ts:88-148`) — clone its auth shape verbatim; swap `StreamManager.startStream` for `captureScreenshot`.

**Imports pattern** (top of file, `trpc-router.ts:37-43`):
```typescript
import {z} from 'zod'
import {TRPCError} from '@trpc/server'
import {privateProcedure, router} from '../server/trpc/trpc.js'
// ADD:
import {captureScreenshot} from './native/screenshot.js'
const displayIdSchema = z.string().regex(/^:\d+(\.\d+)?$/)   // already at L43 — REUSE, do not redefine
```

**Auth/identity pattern to copy verbatim** (`trpc-router.ts:91-125` — this is the load-bearing security contract, copy exactly):
```typescript
// STRIDE-S: caller identity from ctx.currentUser ONLY, never input.
const userId = ctx.currentUser?.id
if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
const dm = ctx.livinityd?.displayManager
if (!dm) throw new TRPCError({code: 'SERVICE_UNAVAILABLE', message: 'displayManager not initialised'})
const record = (await dm.list()).find((d) => d.display === input.display)
if (!record) throw new TRPCError({code: 'NOT_FOUND'})
const callerRole = ctx.currentUser?.role ?? 'member'
if (!canAccessDisplay({ownerSession: record.owner_session, callerSession: userId, callerRole})) {
  throw new TRPCError({code: 'FORBIDDEN', message: 'display owned by another session'})
}
```
`canAccessDisplay` is already exported from this file (`trpc-router.ts:64-72`) and unit-tested (`__tests__/trpc-router-authz.test.ts`). REUSE it — do NOT write a new ACL.

**Core pattern (NEW body after the auth block):**
```typescript
const shot = await captureScreenshot({display: input.display})   // subprocess-scoped DISPLAY (Pitfall 1)
return {dataUrl: `data:${shot.mimeType};base64,${shot.base64}`, width: shot.width, height: shot.height}
```

**Procedure type decision (research A5 + §1):** make it a **`query`** (not a mutation) so the popover uses `useQuery({enabled: open, refetchInterval: 2000})` — mirrors `active-displays-panel.tsx:32-35`. A `query` needs NO `httpOnlyPaths` entry (unlike `getVncUrl`, which IS in httpOnlyPaths because it spawns a survive-reconnect x11vnc).

**Mount:** the route auto-exports via `displaysRouter` — already mounted at `modules/server/trpc/index.ts:332` (`displays: displaysRouter`). No mount edit needed.

**Logging contract (`trpc-router.ts:141-146`):** never log a capability token. The screenshot returns base64 (not a token), so logging is moot, but if you log, log only `display=${input.display}` via `ctx.logger?.log?.(...)` — NOT `.info` (ctx.logger exposes `.log`, see the comment at L143-145).

---

### `computer-use/native/screenshot.ts` — extend `captureScreenshot({display})` (service, file-I/O)

**Analog:** itself — the existing `CaptureScreenshotOptions` interface (`screenshot.ts:93-99`) and the two `execFileAsync` env passes (`screenshot.ts:159-162` maim, `198-202` scrot).

**Why extend, not swap process.env (Pitfall 1 — concurrency):** `mcp/tools.ts:1655-1672` mutates the global `process.env.DISPLAY` and gets away with it ONLY because the MCP child serializes calls over stdio. livinityd is a concurrent server — two 2s polls would race. The fix is to thread `display` into the subprocess `env` so `process.env` is never globally mutated.

**Interface extension (`screenshot.ts:93`):**
```typescript
export interface CaptureScreenshotOptions {
  windowId?: number
  display?: string   // NEW — subprocess-scoped DISPLAY, no global process.env mutation
}
```

**execFile env extension (`screenshot.ts:159-162` and identically `198-202`):**
```typescript
await execFileAsync('maim', maimArgs, {
  env: options?.display ? {...process.env, DISPLAY: options.display} : process.env,
  timeout: 10_000,
})
```
The same `{...process.env, DISPLAY: display}` subprocess-env idiom is already the codebase norm — see `fluxbox-wm.ts:103` (`env: {...process.env, DISPLAY: display}`). Existing JPEG transcode (`parsePngResult`, `screenshot.ts:222-257`, sharp q60) is reused unchanged.

---

### `webapps/window-manager.ts` — register/kill on spawn/close (service, event-driven lifecycle)

**Analog:** the boot `:1` registration in `index.ts:963-982` (the EXACT `registerExisting` call shape) + the `displayManager` API at `display-manager.ts:304-352` (`registerExisting`) and `398-445` (`kill`).

**Critical: use `registerExisting`, NOT `create` (Pitfall 2 / research §2).** The WebApp Xvfb is ALREADY spawned by `this.xvfbSpawnFn(...)` at `window-manager.ts:423-428`. `create()` would spawn a SECOND Xvfb on a different `:N` from displayManager's own Redis-seeded allocator (`display-manager.ts:188-205`, `211-215`). `registerExisting` is a Redis-only HSET with no spawn and does NOT advance the `:N` allocator (`display-manager.ts:301-302`, `304-352`).

**Constructor injection (mirror existing optional deps like `mcpConfigManager` at `window-manager.ts:191-195`):**
```typescript
// In WebAppWindowManagerOpts (add an OPTIONAL field, same as mcpConfigManager):
displayManager?: {
  registerExisting(input: {display: string; width: number; height: number; mode: 'xvfb'|'xephyr'; name?: string; ownerSession: string}): Promise<unknown>
  kill(input: {display: string; callerSession: string}): Promise<{ok: boolean}>
}
// In the class fields (mirror window-manager.ts:319 mcpConfigManager):
private readonly displayManager: WebAppWindowManagerOpts['displayManager']
// In constructor (mirror window-manager.ts:349):
this.displayManager = opts.displayManager
```

**Register on spawn** — insert AFTER the ActiveWebApp entry is created and the map set (`window-manager.ts:493`, right after `this.active.set(opts.webappId, entry)`):
```typescript
// EXACT shape of the boot :1 registerExisting at index.ts:965-972, but owner=userId (NOT '').
await this.displayManager?.registerExisting({
  display,                          // ':10' — the already-running per-app Xvfb (window-manager.ts:413-414)
  width: WEBAPP_DISPLAY_WIDTH,      // 1280 (window-manager.ts:107)
  height: WEBAPP_DISPLAY_HEIGHT,    // 720  (window-manager.ts:108)
  mode: 'xvfb',
  name: opts.url,                   // the popover shows this label
  ownerSession: opts.userId,        // user-owned (NOT '' — '' would make it host/shared)
})
```
Guard with `?.` + a try/catch so a Redis write failure never breaks a WebApp launch — mirror the boot guard at `index.ts:963-982` (`if (this.displayManager) { try {...} catch (regErr) { ...warn... } }`).

**Unregister on close** — insert in the teardown chain alongside step 5 `displayAllocator.release(entry.displayN)` (`window-manager.ts:695-703`):
```typescript
// kill gates on owner_session === callerSession (display-manager.ts:407). spawn wrote
// ownerSession: userId, so callerSession: entry.userId matches (research A4, LOW risk).
await this.displayManager?.kill({display: entry.display, callerSession: entry.userId})
```
`entry.display` and `entry.userId` are both on `ActiveWebApp` (`window-manager.ts:288`, `259`). Wrap in best-effort try/catch like every other teardown step in `close()`.

**Allocator-overlap note for planner (Pitfall 2 / Open Question 1):** webapp uses in-memory `DisplayAllocator` [10,100) (`index.ts:1088`); MCP `create()` seeds from Redis. Because webapps use `registerExisting` (no allocator advance), the only residual risk is a within-single-boot `:N` collision between a webapp and an MCP `create()`. Lowest-risk fix: reserve disjoint ranges (webapps [10,60), MCP create [60,100)) + a unit test asserting no overlap.

---

### `index.ts` — inject `displayManager` into `WebAppWindowManager` ctor (config, DI wiring)

**Analog:** the existing `WebAppWindowManager` ctor block at `index.ts:1089-1113`, plus the `displayManager` construction at `index.ts:851-867`.

**Ordering is already correct:** `this.displayManager` is constructed at `index.ts:852` (and `await this.displayManager.initialized` at L859), well BEFORE the `WebAppWindowManager` ctor at L1089. So at the ctor site `this.displayManager` is already populated. Add one line into the existing ctor options object (after `chromeCdpClient: this.chromeCdpClient,` at `index.ts:1112`):
```typescript
this.webappWindowManager = new WebAppWindowManager({
  // ...existing opts (streamManager, spawn, logger, displayAllocator, etc.)...
  displayManager: this.displayManager,   // NEW — enables registerExisting/kill on spawn/close
})
```
This mirrors exactly how `mcpConfigManager: webappMcpConfigManager` is threaded in at `index.ts:1095`.

---

### `desktop/displays-popover.tsx` (NEW) (component, request-response/poll)

**Analog (merge of two):** `active-displays-panel.tsx` (the display-card rendering + poll-while-open) and `windows-manager-panel.tsx` (the window rows + the four Focus/Min/Pin/Close buttons).

**Display-list poll pattern (copy from `active-displays-panel.tsx:32-35`):**
```typescript
const displaysQuery = trpcReact.displays.list.useQuery(undefined, {
  enabled: open,
  refetchInterval: 4000,
})
const displays = displaysQuery.data?.displays ?? []
```

**Per-card screenshot thumb (NEW — per card, gated on open):** use the same `useQuery({enabled, refetchInterval: 2000})` shape against `displays.screenshot`, render `<img src={dataUrl} />`. Do NOT open RFB sockets (D-255-THUMBS-SCREENSHOT). Each card is its own small component so its poll is scoped to that card.

**Card click → open-as-window (copy VERBATIM from `active-displays-panel.tsx:79`):**
```typescript
windowManager?.openWindow(`DISPLAY_${d.display}`, '/', `Display ${d.display}`, '🖥️', undefined, {width: d.width, height: d.height})
```
This is the exact 254-03 contract that `X11DisplayStreamWindow` consumes (the appId `DISPLAY_:N` is sliced back to `:N` at `x11-display-stream-window.tsx:45-46`). UNCHANGED — reuse.

**Folded-in window rows (copy `windows-manager-panel.tsx:56-106`):** the `WindowRow` component with `wm.focusWindow` / `wm.minimizeWindow|restoreWindow` / `wm.pinWindowToTopBar|unpinWindowFromTopBar` / `wm.closeWindow` over `useWindowManagerOptional()`. Either import `WindowsManagerPanel` and render it as a second section, or inline the rows. Both `active-displays-panel` and `windows-manager-panel` already use `useWindowManagerOptional()` (`active-displays-panel.tsx:28`, `windows-manager-panel.tsx:39`).

**Glass-card styling (copy from `active-displays-panel.tsx:63-100`):** `rounded-2xl border border-line bg-card-bg/78 ... backdrop-blur-2xl backdrop-saturate-150 dark:bg-black/55`; per-card `rounded-xl border border-line ... hover:border-line-strong hover:bg-[color:var(--bg-2)]`; section header `text-[11px] font-semibold uppercase tracking-wide text-text-secondary`; empty state `No active displays`.

**Mobile guard (copy `active-displays-panel.tsx:26,37`):** `const isMobile = useIsMobile(); if (isMobile) return null`.

---

### `desktop/top-bar.tsx` — single 🖥️ popover + ClockWithLocation glow-up (component, request-response)

**Analog (in-file):** the windows-manager `Popover` block at `top-bar.tsx:357-374` and the `ClockWithLocation` / `useLocationWeather` at `top-bar.tsx:457-567`.

**Right-cluster rework (`top-bar.tsx:357-374`):** replace the `<LayoutGrid>`-triggered `WindowsManagerPanel` Popover with ONE 🖥️-triggered Popover whose content is `<DisplaysPopover />`. Keep `<ClockWithLocation />` as the sibling. The existing Popover usage is the template:
```typescript
<Popover>
  <PopoverTrigger asChild>
    <button type='button' aria-label='Displays' title='Displays'
      className='grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-[color:var(--bg-2)]'>
      {/* 🖥️ glyph or a lucide icon, replacing <LayoutGrid className='h-4 w-4' /> */}
    </button>
  </PopoverTrigger>
  <PopoverContent align='end' className='p-0'>
    <DisplaysPopover />
  </PopoverContent>
</Popover>
<ClockWithLocation />
```
Imports already present: `Popover, PopoverContent, PopoverTrigger` (`top-bar.tsx:21`). REMOVE the now-unused `WindowsManagerPanel` import (`top-bar.tsx:22`) and `LayoutGrid` import (`top-bar.tsx:5`) if no longer referenced (or keep `WindowsManagerPanel` if `DisplaysPopover` imports it instead).

**Clock glow-up — ADDITIVE only (D-255-NAVBAR-ADDITIVE, `feedback_v36_no_bold_redesigns`).** Do NOT restructure the existing pill/donut/profile layout. Extend the open-meteo fetch (`top-bar.tsx:494-495`) to request `weather_code,is_day`:
```typescript
`https://api.open-meteo.com/v1/forecast?latitude=${first.latitude}&longitude=${first.longitude}&current=temperature_2m,weather_code,is_day`
```
Parse `wx.current?.weather_code` / `wx.current?.is_day` alongside the existing `temperature_2m` (`top-bar.tsx:498-499`). Add the WMO glyph + greeting into the existing `ClockWithLocation` JSX (`top-bar.tsx:533-565`) — the greeting next to the time, the glyph next to the temp. Day/night accent uses `is_day` (or `now.getHours()` 6..20) to pick a warmer/cooler `--fg` tint. Keep the existing 12-hour `hh:mm` + AM/PM (`top-bar.tsx:526-538`) and city/temp row (`539-563`) intact.

---

### `desktop/clock-helpers.ts` (NEW pure module) (utility, transform)

**Analog:** none in `desktop/` — but the extract-pure-fn-for-test pattern is established by `canAccessDisplay` (`trpc-router.ts:64-72`, tested in isolation by `trpc-router-authz.test.ts`). Extract `wmoGlyph(code: number): string` and `greeting(hour: number, name?: string): string` here so they are unit-testable without rendering TopBar (research Wave 0 gap). WMO map per research §5 (code 0→☀️, ≤2→⛅, 3→☁️, 45-48→🌫️, 51-67→🌧️, 71-77→❄️, 80-82→🌧️, ≥95→⛈️). Greeting (Turkish, per `user_language.md`): h<6 'İyi geceler' | h<12 'Günaydın' | h<18 'İyi günler' | else 'İyi akşamlar'.

---

### `router.tsx` — remove ActiveDisplaysPanel (config, routing)

**Analog:** the import at `router.tsx:25` and the mount at `router.tsx:95` (inside `WindowManagerProvider`, sibling of `<TopBar />`).

Remove BOTH (Pitfall 6 — removing one leaves a build break):
- DELETE import `import {ActiveDisplaysPanel} from './modules/desktop/active-displays-panel'` (`router.tsx:25`)
- DELETE the `<ActiveDisplaysPanel />` JSX + its comment block (`router.tsx:90-95`)

No new mount needed — `DisplaysPopover` lives INSIDE `<TopBar />` (already inside `WindowManagerProvider` per `router.tsx:81-89`).

---

### `shell/branded-shell.ts` (NEW) (service, OS integration / boot)

**Analog:** `webapps/fluxbox-wm.ts` (the whole file — spawn-with-injected-spawnFn + idempotent config-file write + early-exit health race + logger shape) and the boot orchestration in `index.ts:936-992`.

**Config-file write idiom (copy `fluxbox-wm.ts:81-86`):** write the LivOS fluxbox STYLE file idempotently each boot (mirrors `EMPTY_RC` write to `/tmp/livos-fluxbox.cfg`). Theme the **style only** (colors/fonts for menu/toolbar) — DO NOT reintroduce window decorations; keep the existing `EMPTY_RC` behavior (`fluxbox-wm.ts:63-72`, `defaultDeco: NONE` + `fullMaximization`) so WebApp keys/clicks aren't swallowed (Pitfall 4).

**Subprocess-env-scoped spawn (copy `fluxbox-wm.ts:96-104`):** spawn `feh` and `tint2` with `env: {...process.env, DISPLAY: display}` (display `:1`). Use an injected `spawnFn` default `node:child_process.spawn` so the test can assert argv shape (research Wave 0 — `shell/branded-shell.test.ts` mirrors `fluxbox-wm.ts` test style). feh invocation: `feh --bg-fill /opt/livos/packages/livinityd/source/modules/shell/assets/livos-wallpaper.png` — an ABSOLUTE deployed filesystem path, NOT a UI URL (Pitfall 5).

**Color source:** `@livinity/design-tokens` dark palette in `tokens.css` (`--bg: #0a0a0c`, `--card-bg: #16161a`, `--fg: #f5f5f7`, `--line: rgb(255 255 255 / .08)`, `--accent-blue: #2563eb`) — authored statically into the fluxbox style + tint2 config (research Open Q2 recommends static-file for v1 over a boot generator). `theme.json` light theme has `accentBlue/accentGreen/accentAmber/accentRed` + `fontMono/fontSerif`.

**Boot wiring (mirror `index.ts:946-982`):** call the shell-boot helper right after `startFluxbox({display: ':1'})` (`index.ts:946-950`) and the `:1` `registerExisting` (`index.ts:963-982`), inside the same `try/catch` so a shell-boot failure is non-fatal (degrades to bare fluxbox, like the existing Xvfb fallback at `index.ts:983-992`). Fallbacks if binaries missing: `xsetroot -solid '#0a0a0c'` for feh, fluxbox toolbar for tint2 (research Environment Availability).

---

### `shell/assets/livos-wallpaper.png` (NEW asset) (config, binary)

**Analog:** none. NEW filesystem asset. Ships via the wholesale livinityd `source/` rsync (`update.sh:433-435`, binary files survive `rsync -a`, research A3). Place under `livinityd/source/modules/shell/assets/`; it reaches `/opt/livos/packages/livinityd/source/modules/shell/assets/livos-wallpaper.png` on the Mini PC. Reference by absolute deployed path in `branded-shell.ts`. Source image is a human/design call (research Open Q3) — pick an existing wallpaper jpg or a brand-mark PNG; confirm the dir is not gitignored.

---

### `update.sh` — add `feh tint2` to apt (config, deploy)

**Analog:** the streaming-subsystem apt block at `update.sh:359-370`.

Add `feh tint2` to the existing `apt-get install -y -qq` package list (alongside `xvfb fluxbox` at `update.sh:369`). Also add them to the post-install verification `for bin in ... ; do` loop at `update.sh:386` (currently `ffmpeg gst-launch-1.0 dbus-send xdotool maim Xvfb fluxbox Xephyr xterm`). Same edit must be made to `livos/install.sh` (~L615, the fresh-install apt block, per CONTEXT). `apt-get install -y -qq` is a no-op on already-installed packages (`update.sh:353`), so re-running is safe.

---

## Shared Patterns

### Display authorization (REUSE, do not rebuild)
**Source:** `canAccessDisplay()` (`computer-use/trpc-router.ts:64-72`)
**Apply to:** `displays.screenshot` (and any future display tRPC route)
```typescript
if (!input.ownerSession) return true                 // host/shared
if (input.callerRole === 'admin') return true        // single-tenant operator bypass (254-06)
return input.callerSession === input.ownerSession    // legitimate owner only
```
Already unit-tested by `__tests__/trpc-router-authz.test.ts`. Identical contract as `getVncUrl`.

### Caller identity from context, never input (STRIDE-S)
**Source:** `trpc-router.ts:91-93`, `context.ts:64`
**Apply to:** `displays.screenshot`
`const userId = ctx.currentUser?.id; if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})` — never read userId from `input`.

### Fail-closed service guard
**Source:** `trpc-router.ts:76-82` / `95-101`
**Apply to:** every new display route
`const dm = ctx.livinityd?.displayManager; if (!dm) throw new TRPCError({code: 'SERVICE_UNAVAILABLE', ...})`. Mirrors how `displayManager` itself is left `undefined` on construction failure (`index.ts:861-866`).

### Subprocess-scoped DISPLAY env (NEVER global process.env mutation in the server)
**Source:** `fluxbox-wm.ts:103` (`env: {...process.env, DISPLAY: display}`)
**Apply to:** `captureScreenshot` extension + `branded-shell.ts` feh/tint2 spawns
The `mcp/tools.ts:1655-1672` global-mutation pattern is SAFE ONLY in the serialized MCP child — do NOT copy it into concurrent livinityd routes (Pitfall 1).

### Idempotent boot config-file write + injected spawnFn + non-fatal try/catch
**Source:** `fluxbox-wm.ts:74-104` + `index.ts:936-992`
**Apply to:** `branded-shell.ts` and its boot call site
Write config files with overwrite-each-boot; spawn via injectable `spawnFn` (testability); wrap the whole boot block in try/catch so failure degrades gracefully and never breaks livinityd boot.

### Poll-while-open tRPC query (no work while closed)
**Source:** `active-displays-panel.tsx:32-35`
**Apply to:** `DisplaysPopover` (both `displays.list` and per-card `displays.screenshot`)
`useQuery(undefined, {enabled: open, refetchInterval: N})` — gate on the popover-open boolean so closed popovers issue zero requests.

### Source-text invariant test (UI contract lock)
**Source:** `active-displays-panel.test.tsx` (reads the .tsx as a string, asserts regex invariants)
**Apply to:** the new `displays-popover.tsx` contract test (model the new test on the deleted one's structure — `displays.list.useQuery`, `openWindow(\`DISPLAY_${`, no-RFB assertion, mobile guard).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `shell/assets/livos-wallpaper.png` | config (binary) | file-I/O | No in-repo asset is designated as the in-display root wallpaper; `ui/public/wallpapers/*.jpg` are browser-only and unreachable by feh inside Xvfb (Pitfall 5). New filesystem asset; source image is a design call (Open Q3). |

`shell/branded-shell.ts` and `clock-helpers.ts` are NEW but have strong structural analogs (`fluxbox-wm.ts` and `canAccessDisplay` extract-for-test respectively) — listed under Pattern Assignments, not here.

## Metadata

**Analog search scope:** `livos/packages/livinityd/source/modules/{computer-use,webapps,shell?,server/trpc}`, `livos/packages/livinityd/source/index.ts`, `livos/packages/ui/src/modules/{desktop,window}`, `livos/packages/ui/src/router.tsx`, `livos/packages/design-tokens/`, `update.sh`
**Files scanned (read this session):** trpc-router.ts, screenshot.ts, mcp/tools.ts (1630-1700), display-manager.ts, displays/types.ts, index.ts (838-1135), fluxbox-wm.ts, webapps/window-manager.ts, window-manager.test.ts, trpc-router-authz.test.ts, top-bar.tsx, active-displays-panel.tsx (+ .test.tsx), windows-manager-panel.tsx, x11-display-stream-window.tsx, router.tsx, design-tokens theme.json/tokens.css, update.sh apt block, server/trpc/{context.ts,index.ts mount}
**Pattern extraction date:** 2026-06-02
