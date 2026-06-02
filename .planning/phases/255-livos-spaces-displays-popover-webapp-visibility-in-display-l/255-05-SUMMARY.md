---
phase: 255-livos-spaces-displays-popover-webapp-visibility-in-display-l
plan: 05
subsystem: livinityd
tags: [livinityd, shell, fluxbox, feh, tint2, xvfb, design-tokens, boot, deploy, vitest, tsx]

# Dependency graph
requires:
  - phase: 255-livos-spaces-displays-popover-webapp-visibility-in-display-l (plan 01)
    provides: shell/__tests__/branded-shell.test.ts RED scaffold (now GREEN — the GREEN gate this plan satisfies)
  - phase: 255-livos-spaces-displays-popover-webapp-visibility-in-display-l (plan 03)
    provides: index.ts displayManager DI + disjoint webapp/MCP allocator ranges (this plan only ADDS a call to the same :1 boot block — both edits preserved)
  - phase: 100-08-webapp-display-fluxbox
    provides: webapps/fluxbox-wm.ts (startFluxbox spawn idiom + EMPTY_RC) + the :1 Xvfb/fluxbox boot lifecycle this shell decorates
provides:
  - "shell/branded-shell.ts — bootBrandedShell(): feh wallpaper + design-token fluxbox STYLE + slim tint2 dock, subprocess-scoped to DISPLAY=:1, never-throws graceful degrade"
  - "shell/assets/livos-wallpaper.png — the in-display root wallpaper asset (ships via livinityd source rsync)"
  - "index.ts :1 boot now brands the host shell (bootBrandedShell call inside the existing non-fatal try/catch)"
  - "feh + tint2 on the update.sh + install.sh apt lists + verify loops"
affects: [phase-255 verifier, operator VNC UAT, Mini PC :1 host desktop on next update.sh boot]

# Tech tracking
tech-stack:
  added:
    - "feh (apt) — wallpaper setter for the :1 X root"
    - "tint2 (apt) — slim X11 dock"
  patterns:
    - "Subprocess-scoped DISPLAY: every spawn uses env {...process.env, DISPLAY: ':1'}; process.env is NEVER mutated server-side (Pitfall 1 / T-255-15)"
    - "Idempotent boot config-file write + injected spawnFn + non-fatal try/catch (modeled on webapps/fluxbox-wm.ts)"
    - "Graceful degrade: feh→xsetroot solid #0a0a0c, tint2→fluxbox toolbar, style-apply best-effort; bootBrandedShell never throws (T-255-17)"
    - "Theme the fluxbox STYLE (colors/fonts) only — window-management stays governed by EMPTY_RC (defaultDeco NONE + fullMaximization) so WebApp keys/clicks are not swallowed (Pitfall 4)"
    - "Native shell (NOT a Chromium kiosk — Pitfall 3); absolute deployed asset path, NOT a UI URL, re-invoked each boot rather than ~/.fehbg (Pitfall 5)"

key-files:
  created:
    - livos/packages/livinityd/source/modules/shell/branded-shell.ts
    - livos/packages/livinityd/source/modules/shell/assets/livos-wallpaper.png
  modified:
    - livos/packages/livinityd/source/index.ts
    - update.sh
    - livos/install.sh

key-decisions:
  - "Spawn the shell binaries DIRECTLY (binary name as spawn argv[0]) rather than wrapping in `sudo -n -u bruce` — the 255-01 RED contract asserts spawnFn is called with `feh`/`tint2` as the first arg, and livinityd already runs as bruce, so a direct spawn with subprocess-scoped DISPLAY is correct. (`user` opt kept for future sudo-wrapping, `void user` to keep tsc happy.)"
  - "Attach the feh exit→xsetroot-fallback listener via an optional onExit callback inside spawnBranded, casting the child to EventEmitter for the `.on` call — the monorepo's duplicate @types/node resolves ChildProcess WITHOUT its inherited EventEmitter methods (the SAME TS2339 class that webapps/fluxbox-wm.ts:117 + xvfb-display.ts:53 already carry in the baseline). The cast keeps branded-shell.ts at ZERO net tsc errors."
  - "Authored the fluxbox STYLE + tint2 rc STATICALLY from the design-tokens dark palette (#0a0a0c / #16161a / #f5f5f7 / #2563eb) per research Open Q2 (static > boot-generator for v1)."
  - "Shipped ui/public/wallpapers/1.jpg copied to livos-wallpaper.png — feh reads image content (not the extension), so a .jpg-bytes-named-.png is fine; branded-shell.ts's DEFAULT_WALLPAPER_PATH is byte-in-sync with the shipped filename."

patterns-established:
  - "shell/ module: a NEW livinityd OS-integration subsystem for in-display branding, sibling to webapps/ and computer-use/, sharing the fluxbox-wm spawn idiom."

requirements-completed: [GOAL-255-LIVOS-SHELL]

# Metrics
metrics:
  duration: ~25m
  completed: "2026-06-02"
  tasks_completed: 4
  files_created: 2
  files_modified: 3
---

# Phase 255 Plan 05: In-Display LivOS Branded Shell Summary

Built the §3 in-display LivOS shell: `bootBrandedShell` decorates the host `:1`
X display on boot with a LivOS wallpaper (feh), a design-token-themed fluxbox
STYLE (dark palette colors/fonts), and a slim tint2 dock — replacing the bare
gray fluxbox root. All spawns are subprocess-scoped to `DISPLAY=:1`, the
function never throws (graceful degrade), the wallpaper asset ships via the
livinityd source rsync, the helper is wired into the existing non-fatal `:1`
boot try/catch, and `feh`/`tint2` are added to both deploy scripts' apt lists.

## What Was Built

### Task 1 — `shell/branded-shell.ts` (255-01 RED → GREEN) — commit `03c69a0e`
`bootBrandedShell(opts?)` modeled on `webapps/fluxbox-wm.ts`:
- **Subprocess-scoped env** — one `childEnv = {...process.env, DISPLAY: display}`
  passed to every spawn; `process.env` is NEVER mutated (grep `process.env.DISPLAY =` → 0).
- **Static design-token fluxbox STYLE** (`LIVOS_FLUXBOX_STYLE`) — menu/toolbar/
  window-label colors + a system `sans-8` font from the tokens (`#0a0a0c` bg,
  `#16161a` card/toolbar, `#f5f5f7` fg, `#2563eb` accent/focus); a `rootCommand:
  xsetroot -solid #0a0a0c` belt-and-braces. Colors/fonts only — no decorations,
  so EMPTY_RC window-management is untouched (Pitfall 4).
- **Style apply** via best-effort `fluxbox-remote 'setStyle <path>'` (writing
  `~/.fluxbox` is fragile under bruce-ownership; a missing fluxbox-remote just
  logs a warn — wallpaper + dock still brand the shell).
- **feh** — `feh --bg-fill <absolute asset path>` with the scoped env; on
  spawn-error/binary-missing OR a non-zero feh exit, falls back to
  `xsetroot -solid #0a0a0c`. Re-invoked each boot (NOT `~/.fehbg`, Pitfall 5).
- **tint2** — `tint2 -c <rc>` with a slim dark `LIVOS_TINT2_RC`; on failure the
  fluxbox toolbar remains the dock.
- **Never throws** — every step is best-effort + an outermost try/catch (T-255-17).

Plan-01 RED suite `shell/__tests__/branded-shell.test.ts` flipped from a
collection error ("Failed to load url ../branded-shell.js") to **5/5 GREEN**:
feh `--bg-fill` + absolute path + `env.DISPLAY===':1'`, tint2 `env.DISPLAY===':1'`,
a style file written containing `#0a0a0c|#2563eb`, `process.env.DISPLAY` unchanged,
and non-fatal degrade when spawnFn throws.

### Task 2 — wallpaper asset + boot wiring — commit `1b9c00d8`
- `livos/packages/livinityd/source/modules/shell/assets/livos-wallpaper.png`
  (397 KB, copied from `ui/public/wallpapers/1.jpg`; `git check-ignore` → empty,
  i.e. NOT gitignored, so it commits + rsyncs to
  `/opt/livos/packages/livinityd/source/modules/shell/assets/` on the Mini PC).
- `index.ts`: `import {bootBrandedShell}` + `await bootBrandedShell({display:
  ':1', logger: streamingLogger})` added AFTER the `:1` `registerExisting` block,
  inside the SAME non-fatal `:1` boot try/catch (Pitfall 3: native, no kiosk).
- Plan 03's `displayManager: this.displayManager` ctor DI and disjoint allocator
  range are intact (grep confirms).

### Task 3 — apt lists — commit `bfb0f169`
- `update.sh`: `feh tint2` in the streaming `apt-get install -y -qq` block + the
  post-install `for bin in … feh tint2; do` verify loop (warn-on-missing).
- `livos/install.sh`: `feh` + `tint2` in the fresh-install apt block + the verify
  loop (`fail`-loud, matching that block's hard semantics) + the `ok` summary.
- `bash -n` clean on both. `apt-get install` is a no-op on already-installed
  packages, so re-running update.sh is safe.

### Task 4 — Operator VNC walk (checkpoint:human-verify)
AUTO-APPROVED per autonomous mode (`workflow.auto_advance=true` + the operator's
standing full-autonomous "soru sorma / finish the milestone" preference, same as
Phase 254). The branded-`:1` visual outcome (wallpaper rendered, dark dock,
themed menus, WebApp keys still working, graceful-degrade fallback) is
human-verify-only and has **no code-side assertion** — it is **deferred to
operator UAT**. The operator walk (per the plan's `<how-to-verify>`):
`git push origin master` → `bash /opt/livos/update.sh` on the Mini PC → confirm
`which feh tint2` → open `:1` from the Displays popover → confirm wallpaper +
dock + themed menus + WebApp key passthrough + degrade fallback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Spawn binary as argv[0], not `sudo`-wrapped**
- **Found during:** Task 1 (first test run)
- **Issue:** The plan's pseudocode suggested `sudo -n -u bruce DISPLAY=:1 feh …`
  (mirroring fluxbox-wm.ts), which makes `spawnFn`'s first arg `'sudo'`. The
  255-01 RED test asserts `spawnFn.mock.calls.find((c) => c[0] === 'feh')` /
  `=== 'tint2'` — i.e. the binary name MUST be argv[0]. With the sudo wrapper,
  Tests 1 & 2 failed ("feh/tint2 was not spawned").
- **Fix:** Spawn the binary directly (`spawnFn(bin, args, {env: childEnv, …})`).
  livinityd already runs as bruce, so a direct spawn with the scoped DISPLAY is
  the correct runtime behavior anyway; the `user` opt is retained (`void user`)
  for any future sudo-wrapping.
- **Files modified:** branded-shell.ts
- **Commit:** `03c69a0e`

**2. [Rule 3 — Blocking] EventEmitter cast for the feh-exit listener (tsc)**
- **Found during:** Task 1 (tsc gate)
- **Issue:** `child.on('exit', …)` raised `TS2339: Property 'on' does not exist
  on type 'ChildProcess'` + implicit-any. This is the SAME baseline class the
  existing `webapps/fluxbox-wm.ts:117` and `xvfb-display.ts:53` already carry —
  the monorepo's duplicate `@types/node` resolves `ChildProcess` without its
  inherited EventEmitter methods. Adding a new `.on` site would have raised the
  package tsc count above the 389 baseline.
- **Fix:** Attached the exit→xsetroot-fallback listener inside `spawnBranded` via
  an optional `onExit` callback, casting the child to `EventEmitter` for the
  `.on` call: `(child as unknown as EventEmitter).on('exit', …)`. Runtime is
  unchanged (the test's fake child has `on: vi.fn()`); tsc returns to exactly
  389.
- **Files modified:** branded-shell.ts
- **Commit:** `03c69a0e`

No other deviations — Tasks 2 & 3 executed exactly as written.

## Verification Evidence

- **branded-shell test:** `pnpm exec vitest run branded-shell` → **5 passed (5)**
  (was a collection error / RED before this plan).
- **tsc gate:** package total **389 PRE and POST** = ZERO net new errors. The
  +1 the RED scaffold contributed (390 at plan start) is gone now that the module
  loads, and branded-shell.ts itself contributes 0 errors (grep `branded-shell`
  in the tsc output → empty). 389 = the documented Phase-254 baseline.
- **No global env mutation:** grep `process.env.DISPLAY =` in branded-shell.ts → 0.
- **Token-themed:** `#0a0a0c` (3), `#16161a` (3), `#2563eb` (2), `xsetroot` (8).
- **Asset:** 397 KB, not gitignored.
- **Scripts:** `bash -n update.sh && bash -n livos/install.sh` → SYNTAX OK;
  `feh tint2` present in both apt blocks + both verify loops.
- **Plan 03 preserved:** grep `displayManager: this.displayManager` in index.ts → 1.

## Known Stubs
None. No TODO/FIXME/placeholder patterns in any file this plan created or modified.

## HARD RULE Compliance
This plan edited repo files only (branded-shell.ts / asset / index.ts / update.sh
/ install.sh) and did NOT deploy. No live server changes. Mini PC is the only
deploy target (the operator walk runs `update.sh` on the Mini PC); Server4 is not
referenced anywhere.

## Self-Check: PASSED
- FOUND: livos/packages/livinityd/source/modules/shell/branded-shell.ts
- FOUND: livos/packages/livinityd/source/modules/shell/assets/livos-wallpaper.png
- FOUND: livos/packages/livinityd/source/index.ts
- FOUND: update.sh
- FOUND: livos/install.sh
- FOUND: .planning/.../255-05-SUMMARY.md
- FOUND commit: 03c69a0e (Task 1 branded-shell.ts)
- FOUND commit: 1b9c00d8 (Task 2 asset + boot wiring)
- FOUND commit: bfb0f169 (Task 3 apt lists)
