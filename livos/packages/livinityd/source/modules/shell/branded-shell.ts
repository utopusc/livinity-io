/**
 * Phase 255-05 (D-255-SHELL-LIVOS-BRANDED) — in-display LivOS branded shell.
 *
 * On boot, the host `:1` X display would otherwise show a bare gray fluxbox
 * root. `bootBrandedShell` brands it natively (NOT a Chromium kiosk — research
 * Pitfall 3) with three pieces, all subprocess-scoped to `DISPLAY=:1`:
 *
 *   1. a design-token-themed fluxbox STYLE file (dark palette colors/fonts for
 *      menu/toolbar/window-label) applied via `fluxbox-remote setStyle`;
 *   2. the LivOS wallpaper set via `feh --bg-fill <abs-asset-path>`
 *      (Pitfall 5: an absolute deployed filesystem path, NOT a UI URL, and
 *      re-invoked each boot rather than relying on `~/.fehbg`);
 *   3. a slim `tint2` dock themed with the same token colors.
 *
 * Modeled on `webapps/fluxbox-wm.ts` (injected `spawnFn`, idempotent
 * `writeFileFn`, `env: {...process.env, DISPLAY}` — Pitfall 1: NEVER mutate the
 * server-global `process.env.DISPLAY`, which would leak the display into
 * concurrent requests; T-255-15).
 *
 * The STYLE themes colors/fonts ONLY — it does NOT re-add window decorations.
 * Window-management behavior stays governed by `fluxbox-wm.ts`'s EMPTY_RC
 * (`defaultDeco: NONE` + `fullMaximization`) so WebApp keys/clicks are not
 * swallowed (Pitfall 4 / T-255 boundary preservation).
 *
 * Graceful degrade (T-255-17): a missing binary or any spawn failure NEVER
 * throws out of this function. feh failure → `xsetroot -solid '#0a0a0c'`;
 * tint2 failure → leave the fluxbox toolbar visible; style-apply failure →
 * wallpaper + dock still brand the shell. The boot call site (index.ts) is
 * already inside a non-fatal try/catch, but this function self-guards too.
 *
 * Token colors are authored STATICALLY from the design-tokens dark palette
 * (tokens.css; research Open Q2 recommends static for v1):
 *   --bg #0a0a0c · --bg-2/--card-bg #16161a · --fg #f5f5f7 · --accent-blue #2563eb
 */
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import type {EventEmitter} from 'node:events'
import {getDesktopUser} from '../system/desktop-user.js'

/** Absolute deployed path of the wallpaper asset on the Mini PC. Ships via the
 * wholesale livinityd `source/` rsync (binary survives `rsync -a`). MUST stay
 * byte-in-sync with the shipped filename (the asset directory). NOT a UI URL —
 * feh inside Xvfb cannot read browser wallpapers (Pitfall 5). */
export const DEFAULT_WALLPAPER_PATH =
	'/opt/livos/packages/livinityd/source/modules/shell/assets/livos-wallpaper.png'

/** Design-token dark palette (tokens.css) — authored statically. */
const TOKENS = {
	bg: '#0a0a0c', // --bg (root / panel background)
	card: '#16161a', // --bg-2 / --card-bg (toolbar / menu / titlebar)
	fg: '#f5f5f7', // --fg (text)
	accent: '#2563eb', // --accent-blue (focus / hilite)
} as const

/** A LivOS-themed fluxbox STYLE (colors + fonts ONLY — no decorations).
 *
 * Pitfall 4: the STYLE must NOT re-introduce window decorations or keybinds;
 * window-management is governed by `fluxbox-wm.ts`'s EMPTY_RC. This file only
 * recolors the menu/toolbar/window-label using the design tokens, and picks a
 * system font (X cannot read the bundled web fonts). */
const LIVOS_FLUXBOX_STYLE = `! livinityd-managed LivOS fluxbox STYLE (Phase 255-05) — colors/fonts only.
! Sourced from @livinity/design-tokens dark palette (tokens.css). Does NOT
! re-add window decorations; window-management stays governed by EMPTY_RC.

*.font:                       sans-8

menu.title.color:             ${TOKENS.card}
menu.title.textColor:         ${TOKENS.fg}
menu.frame.color:             ${TOKENS.card}
menu.frame.textColor:         ${TOKENS.fg}
menu.hilite.color:            ${TOKENS.accent}
menu.hilite.textColor:        ${TOKENS.fg}
menu.bevelWidth:              2

toolbar.color:                ${TOKENS.card}
toolbar.textColor:            ${TOKENS.fg}
toolbar.clock.color:          ${TOKENS.card}
toolbar.clock.textColor:      ${TOKENS.fg}
toolbar.button.color:         ${TOKENS.card}
toolbar.button.picColor:      ${TOKENS.fg}

window.title.focus.color:     ${TOKENS.card}
window.title.unfocus.color:   ${TOKENS.bg}
window.label.focus.color:     ${TOKENS.card}
window.label.focus.textColor: ${TOKENS.fg}
window.label.unfocus.color:   ${TOKENS.bg}
window.label.unfocus.textColor: ${TOKENS.fg}
window.frame.focusColor:      ${TOKENS.accent}
window.frame.unfocusColor:    ${TOKENS.card}

rootCommand:                  xsetroot -solid ${TOKENS.bg}
`

/** A minimal slim tint2 dock themed with the LivOS token colors. */
const LIVOS_TINT2_RC = `# livinityd-managed LivOS tint2 dock (Phase 255-05).
# Slim dark dock themed from @livinity/design-tokens (tokens.css).
panel_monitor = all
panel_position = bottom center horizontal
panel_size = 100% 32
panel_margin = 0 0
panel_padding = 6 2 6
panel_background_id = 1
panel_items = TSC

# background 1 — panel (card-bg #16161a)
rounded = 0
border_width = 0
background_color = ${TOKENS.card} 100
border_color = ${TOKENS.bg} 100

# taskbar / tasks
taskbar_mode = single_desktop
taskbar_padding = 4 2 4
task_text = 1
task_font_color = ${TOKENS.fg} 100
task_active_background_id = 0

# systray
systray_padding = 4 2 4

# clock
time1_format = %H:%M
clock_font_color = ${TOKENS.fg} 100
`

export interface BootBrandedShellOpts {
	display?: string // default ':1'
	user?: string // default 'bruce'
	wallpaperPath?: string // default the deployed asset abs path
	stylePath?: string // default '/tmp/livos-fluxbox-style'
	tint2RcPath?: string // default '/tmp/livos-tint2rc'
	spawnFn?: typeof nodeSpawn
	writeFileFn?: (path: string, data: string) => void // default writeFileSync wrapper
	logger?: {
		info?: (m: string) => void
		warn?: (m: string, e?: unknown) => void
		error?: (m: string, e?: unknown) => void
	}
}

/**
 * Brand the host `:1` shell: themed fluxbox STYLE + feh wallpaper + slim tint2
 * dock. Subprocess-scoped to DISPLAY=:1, graceful degrade, NEVER throws.
 */
export async function bootBrandedShell(opts?: BootBrandedShellOpts): Promise<void> {
	const display = opts?.display ?? ':1'
	const user = opts?.user ?? getDesktopUser()
	const wallpaperPath = opts?.wallpaperPath ?? DEFAULT_WALLPAPER_PATH
	const stylePath = opts?.stylePath ?? '/tmp/livos-fluxbox-style'
	const tint2RcPath = opts?.tint2RcPath ?? '/tmp/livos-tint2rc'
	const spawnFn = opts?.spawnFn ?? nodeSpawn
	const writeFile =
		opts?.writeFileFn ?? ((path: string, data: string) => writeFileSync(path, data, {encoding: 'utf8'}))
	const logger = opts?.logger

	// Pitfall 1 / T-255-15: subprocess-scoped env. NEVER mutate process.env.
	// `user` is reserved for future sudo-wrapping; livinityd already runs as
	// bruce so the shell binaries are spawned directly (the binary name is the
	// spawn argv[0], per the plan-01 RED contract) with DISPLAY scoped to the
	// subprocess env only.
	void user
	const childEnv = {...process.env, DISPLAY: display}

	/** Spawn `<bin> <args...>` detached with DISPLAY scoped to childEnv, best-effort.
	 * The binary name is argv[0] (NOT wrapped in sudo) — livinityd already runs
	 * as bruce, and the 255-01 RED contract asserts the binary is the spawn
	 * argv[0]. Returns the child or null. NEVER throws (caller wraps too). */
	const spawnBranded = (
		bin: string,
		args: string[],
		onExit?: (code: number | null) => void,
	): ChildProcess | null => {
		try {
			const child = spawnFn(bin, args, {
				detached: true,
				stdio: ['ignore', 'pipe', 'pipe'],
				env: childEnv,
			}) as ChildProcess
			// WSL field test 2026-06-11 (P0): `spawn <bin> ENOENT` (missing
			// binary, e.g. tint2 not installed) is an ASYNCHRONOUS 'error'
			// event, NOT a synchronous throw — the try/catch below does NOT
			// catch it. With no 'error' listener, Node treats it as an
			// unhandled 'error' and CRASHES the whole livinityd process →
			// livos.service crash-loops forever and the UI never loads. Attach
			// the handler FIRST so a missing/un-spawnable branded-shell binary
			// degrades to a warning (T-255-17 "NEVER throws" now also holds for
			// async spawn failures, not just sync ones).
			;(child as unknown as EventEmitter).on('error', (err: unknown) => {
				logger?.warn?.(`branded-shell: ${bin} spawn error on ${display} (degrading)`, err)
			})
			child.stderr?.on('data', (chunk: Buffer | string) => {
				const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
				logger?.warn?.(`${bin} stderr: ${text.trim()}`)
			})
			if (onExit) {
				// Cast to EventEmitter for the `.on` call: the monorepo's resolved
				// ChildProcess type (duplicate @types/node) does not surface the
				// inherited EventEmitter methods (same class of TS2339 the existing
				// webapps/{fluxbox-wm,xvfb-display}.ts carry) — casting keeps this
				// new module at ZERO net tsc errors vs the package baseline.
				;(child as unknown as EventEmitter).on('exit', (code: number | null) => onExit(code))
			}
			try {
				child.unref?.()
			} catch {
				/* noop */
			}
			return child
		} catch (err) {
			logger?.warn?.(`branded-shell: failed to spawn ${bin} on ${display} (degrading)`, err)
			return null
		}
	}

	try {
		// 1. Write the LivOS fluxbox STYLE file idempotently (overwrite each boot).
		try {
			writeFile(stylePath, LIVOS_FLUXBOX_STYLE)
		} catch (err) {
			logger?.warn?.(`branded-shell: failed to write fluxbox style to ${stylePath}`, err)
		}

		// 2. Apply the style via fluxbox-remote (best-effort). Writing ~/.fluxbox is
		// fragile under bruce-ownership (MEMORY feedback_bruce_home_ownership), so we
		// ask the running fluxbox to set the style. If fluxbox-remote is unavailable
		// the wallpaper + dock still brand the shell — log and continue.
		spawnBranded('fluxbox-remote', [`setStyle ${stylePath}`])

		// 3. Set the wallpaper via feh (--bg-fill, absolute path, re-invoked each
		// boot — do NOT rely on ~/.fehbg, Pitfall 5). On feh failure / binary
		// missing, fall back to a solid dark root via xsetroot.
		// If feh dies immediately (binary present but errors), degrade to xsetroot.
		const fehChild = spawnBranded('feh', ['--bg-fill', wallpaperPath], (code) => {
			if (code && code !== 0) {
				logger?.warn?.(`branded-shell: feh exited code=${code} — falling back to xsetroot`)
				spawnBranded('xsetroot', ['-solid', TOKENS.bg])
			}
		})
		if (!fehChild) {
			logger?.warn?.('branded-shell: feh unavailable — falling back to xsetroot solid root')
			spawnBranded('xsetroot', ['-solid', TOKENS.bg])
		}

		// 4. Write the slim tint2 dock rc (idempotent) + launch tint2. On tint2
		// failure / binary missing, leave the fluxbox toolbar visible (no throw).
		try {
			writeFile(tint2RcPath, LIVOS_TINT2_RC)
		} catch (err) {
			logger?.warn?.(`branded-shell: failed to write tint2 rc to ${tint2RcPath}`, err)
		}
		const tint2Child = spawnBranded('tint2', ['-c', tint2RcPath])
		if (!tint2Child) {
			logger?.warn?.('branded-shell: tint2 unavailable — fluxbox toolbar remains as the dock')
		}

		logger?.info?.(`branded-shell: LivOS shell applied on ${display} (feh + tint2 + fluxbox style)`)
	} catch (err) {
		// Outermost guard — bootBrandedShell NEVER throws (T-255-17). A degrade is
		// always acceptable; a thrown error would break livinityd boot.
		logger?.error?.('branded-shell: unexpected failure (degrading, boot continues)', err)
	}
}
