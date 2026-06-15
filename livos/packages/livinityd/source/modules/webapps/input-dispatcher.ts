/**
 * Phase 100-07 — xdotool-based input dispatcher.
 *
 * Phase 270-RFB note: WebApp streams NO LONGER use this dispatcher. They now
 * forward real pointer/keyboard/scroll events over RFB (noVNC viewOnly:false)
 * straight into each WebApp's own Xvfb via x11vnc XTest — same model as native
 * app streams. The webapp.input.* tRPC routes (and `dispatchMove`) were
 * retired with that change.
 *
 * The remaining exports (`dispatchPointer`, `dispatchKey`, `dispatchType`,
 * `dispatchScroll`) are kept for the Master Chrome Login feature
 * (chrome-master/master-login-routes.ts), which drives a headless master
 * Chrome on a dedicated display by wid via xdotool.
 *
 * Bypasses x11vnc input forwarding (which dispatches XTestFakeKey/MotionEvent
 * against the X11 display, defaulting to the focused window — wrong wid for
 * multi-window). Instead, every click / key event lands here and is routed
 * through an `xdotool windowactivate + click/key` chain so it ALWAYS targets
 * the bound Chrome window, independent of X11 focus.
 *
 * Coordinates are in the framebuffer's pixel space (0..wid_w, 0..wid_h),
 * known from the `--window-size=1280,720` Chrome spawn (Phase 100-06.1).
 *
 * Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts unchanged.
 */

import {execFile} from 'node:child_process'

import {WEBAPPS_X11_ENV} from './window-discovery.js'

const DEFAULT_TIMEOUT_MS = 1500

/**
 * Promise wrapper around execFile that injects WEBAPPS_X11_ENV. Mirrors the
 * pattern in window-discovery.ts so vi.mock('node:child_process') works for
 * unit tests.
 */
function execFileAsync(
	cmd: string,
	args: string[],
	opts: {timeout?: number; display?: string} = {},
): Promise<{stdout: string; stderr: string}> {
	return new Promise((resolve, reject) => {
		// Phase 102 — xdotool scope-by-display: xdotool reads $DISPLAY env,
		// it has NO `--display` CLI flag (verified via stderr "unrecognized
		// option '--display'" from production logs 2026-05-11). When the
		// caller supplies opts.display (Phase 102 per-app Xvfb routing), we
		// override DISPLAY in the spawn env so the X11 op scopes to :N.
		const env: NodeJS.ProcessEnv = {...process.env, ...WEBAPPS_X11_ENV}
		if (opts.display) env.DISPLAY = opts.display
		execFile(
			cmd,
			args,
			{timeout: opts.timeout, env},
			(err, stdout, stderr) => {
				if (err) {
					;(err as Error & {stdout?: string; stderr?: string}).stdout = String(stdout || '')
					;(err as Error & {stdout?: string; stderr?: string}).stderr = String(stderr || '')
					reject(err)
					return
				}
				resolve({stdout: String(stdout || ''), stderr: String(stderr || '')})
			},
		)
	})
}

export type MouseButton = 1 | 2 | 3 // left / middle / right
export type ClickKind = 'click' | 'mousedown' | 'mouseup' | 'doubleclick'

/**
 * Dispatch a click (or mousedown/up) at (x, y) inside the given X11 wid.
 *
 * `kind` selects the xdotool sub-command:
 *   - `'click'`       → `click <btn>`        (mousedown+mouseup atomic; tap)
 *   - `'doubleclick'` → `doubleclick <btn>`  (two clicks)
 *   - `'mousedown'`   → `mousedown <btn>`    (PRESS & HOLD button — stays
 *                        held at the X server across separate xdotool
 *                        invocations)
 *   - `'mouseup'`     → `mouseup <btn>`      (RELEASE the held button)
 *
 * **Why `windowactivate` instead of `--window` on click:** Chrome (and many
 * GTK apps) ignore synthetic XSendEvent — `xdotool click --window <wid>`
 * dispatches the event but Chrome filters it as `send_event=True` and
 * drops it. The reliable pattern is:
 *   1. `xdotool windowactivate --sync <wid>` — give the bound window X11
 *      focus (sends _NET_ACTIVE_WINDOW; WM honors it; --sync waits for
 *      the focus-out/focus-in events).
 *   2. `xdotool mousemove --window <wid> --sync <x> <y>` — move cursor
 *      to wid-relative (x, y); xdotool internally translates to screen
 *      coords using the wid's geometry.
 *   3. `xdotool click <btn>` (NO --window) — sends a real button event
 *      to the focused window (= the wid we just activated).
 *
 * Side effect: the bound wid steals X11 focus on every click. This is
 * actually desirable for multi-stream — the active stream IS the one the
 * user is clicking, so focus tracking matches user intent.
 */
export async function dispatchPointer(
	wid: number,
	x: number,
	y: number,
	button: MouseButton = 1,
	kind: ClickKind = 'click',
	display?: string,
): Promise<void> {
	if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('invalid coords')
	const ix = Math.max(0, Math.round(x))
	const iy = Math.max(0, Math.round(y))

	// Phase 102 r12 — display-mode dispatch with Chrome-XSendEvent-filter
	// mitigation. The earlier r9 path (just `mousemove + click`) made the
	// cursor move but Chrome silently dropped the resulting synthetic button
	// events (Chrome filters XSendEvent send_event=True), and keystrokes
	// landed nowhere because no X11 window was focused on the per-app Xvfb.
	// Fix: prepend `search --onlyvisible --class chrome windowactivate %@
	// windowfocus %@` so Chrome has X11 focus before the click/key fires.
	// The wid is discovered on-display here rather than passed in — under
	// Phase 102-04 the dispatcher receives wid=0 (display-based scoping).
	if ((wid === 0 || !Number.isInteger(wid)) && display && /^:[1-9][0-9]?$/.test(display)) {
		await execFileAsync(
			'xdotool',
			[
				'search', '--onlyvisible', '--limit', '1', '--class', 'chrome',
				'windowactivate', '--sync', '%@',
				'windowfocus', '--sync', '%@',
				'mousemove', String(ix), String(iy),
				kind, '--clearmodifiers', String(button),
			],
			{timeout: DEFAULT_TIMEOUT_MS, display},
		)
		return
	}

	if (!Number.isInteger(wid) || wid <= 0) throw new Error(`invalid wid: ${wid}`)
	// Phase 103.1-8 — when caller scopes to a non-default display (e.g.
	// master Chrome on `:10`), pass it through to execFileAsync so xdotool's
	// $DISPLAY matches the X server where this wid actually exists.
	// Without this, the explicit-wid xdotool path inherits WEBAPPS_X11_ENV's
	// default `:1` and reports `BadWindow (invalid Window parameter)` when
	// the caller's wid is on `:10`/`:11`/etc. Live UAT 2026-05-11 repro.
	const widStr = String(wid)
	const optsForWidPath = display && /^:[1-9][0-9]?$/.test(display)
		? {timeout: DEFAULT_TIMEOUT_MS, display}
		: {timeout: DEFAULT_TIMEOUT_MS}
	// One xdotool invocation, four sub-commands, all chained:
	//   activate (raise + WM focus) → windowfocus (X11 input focus directly,
	//   bypasses any WM transfer asymmetry for Chrome --app= chromeless
	//   windows) → mousemove (wid-relative) → click (focused).
	// `--clearmodifiers` resets stuck modifiers from prior xdotool calls.
	// Phase 103.1-9 — xdotool `mousemove --window <wid> --sync` HANGS on master
	// Chrome's per-app Xvfb (live probe 2026-05-11: timed out at 5s with no
	// stderr). Same wid + display works with absolute `mousemove x y` in 4ms.
	// Root cause hypothesis: --sync waits for ConfigureNotify / wid-relative
	// pointer ack that fluxbox-on-:N doesn't deliver. Since every LivOS
	// Chrome window is spawned at `--window-position=0,0 --window-size=1280,720`
	// (Phase 100-06.1, applies to per-app WebApps AND master Chrome), screen-
	// absolute coords == window-relative coords. Skip --window --sync when a
	// cross-display dispatch is happening (caller provided `display`).
	const mousemoveArgs =
		display && /^:[1-9][0-9]?$/.test(display)
			? ['mousemove', String(ix), String(iy)]
			: ['mousemove', '--window', widStr, '--sync', String(ix), String(iy)]
	await execFileAsync(
		'xdotool',
		[
			'windowactivate', '--sync', widStr,
			'windowfocus', '--sync', widStr,
			...mousemoveArgs,
			kind, '--clearmodifiers', String(button),
		],
		optsForWidPath,
	)
}

/**
 * Dispatch a single key press (or keydown/keyup) inside the given wid.
 * Same activate-first pattern as `dispatchPointer` (Chrome ignores
 * synthetic key events sent via `--window`; we focus the wid then send
 * a real key event to the focused window).
 *
 * `key` is an X11 keysym name (e.g. `Return`, `BackSpace`, `Escape`,
 * `ctrl+a`). For typing arbitrary text, use `dispatchType` instead.
 */
export async function dispatchKey(
	wid: number,
	key: string,
	kind: 'key' | 'keydown' | 'keyup' = 'key',
	display?: string,
): Promise<void> {
	if (typeof key !== 'string' || !key.trim()) throw new Error('invalid key')
	if (!/^[A-Za-z0-9_+\-]{1,64}$/.test(key)) {
		throw new Error(`invalid key syntax: ${JSON.stringify(key)}`)
	}
	// Phase 102 r12 — display-mode key dispatch with search + windowfocus
	// chain. Without focus on the per-app Chrome window, XTestFakeKeyEvent
	// has no destination and the key is silently dropped. Same root cause
	// and fix shape as dispatchPointer above.
	if ((wid === 0 || !Number.isInteger(wid)) && display && /^:[1-9][0-9]?$/.test(display)) {
		await execFileAsync(
			'xdotool',
			[
				'search', '--onlyvisible', '--limit', '1', '--class', 'chrome',
				'windowactivate', '--sync', '%@',
				'windowfocus', '--sync', '%@',
				kind, '--clearmodifiers', key,
			],
			{timeout: DEFAULT_TIMEOUT_MS, display},
		)
		return
	}
	if (!Number.isInteger(wid) || wid <= 0) throw new Error(`invalid wid: ${wid}`)
	// Phase 103.1-8 — when caller scopes to a non-default display (e.g.
	// master Chrome on `:10`), pass it through to execFileAsync so xdotool's
	// $DISPLAY matches the X server where this wid actually exists.
	// Without this, the explicit-wid xdotool path inherits WEBAPPS_X11_ENV's
	// default `:1` and reports `BadWindow (invalid Window parameter)` when
	// the caller's wid is on `:10`/`:11`/etc. Live UAT 2026-05-11 repro.
	const widStr = String(wid)
	const optsForWidPath = display && /^:[1-9][0-9]?$/.test(display)
		? {timeout: DEFAULT_TIMEOUT_MS, display}
		: {timeout: DEFAULT_TIMEOUT_MS}
	await execFileAsync(
		'xdotool',
		[
			'windowactivate', '--sync', widStr,
			'windowfocus', '--sync', widStr,
			kind, '--clearmodifiers', key,
		],
		display && /^:[1-9][0-9]?$/.test(display)
			? {timeout: DEFAULT_TIMEOUT_MS, display}
			: {timeout: DEFAULT_TIMEOUT_MS},
	)
}

/**
 * Type literal text inside the given wid. Activate-first pattern (Chrome
 * ignores synthetic key events; the activate ensures the focused window
 * is the bound wid before xdotool's `type` dispatches keystrokes).
 */
export async function dispatchType(wid: number, text: string, display?: string): Promise<void> {
	if (typeof text !== 'string') throw new Error('invalid text')
	if (text.length > 4096) throw new Error('text too long (4096 char limit)')
	if (text.length === 0) return
	// Phase 102 r12 — display-mode type dispatch with search + windowfocus
	// chain. Same Chrome-XSendEvent-filter mitigation pattern as
	// dispatchPointer / dispatchKey: focus the Chrome window first so the
	// typed characters land in the focused input element.
	if ((wid === 0 || !Number.isInteger(wid)) && display && /^:[1-9][0-9]?$/.test(display)) {
		await execFileAsync(
			'xdotool',
			[
				'search', '--onlyvisible', '--limit', '1', '--class', 'chrome',
				'windowactivate', '--sync', '%@',
				'windowfocus', '--sync', '%@',
				'type', '--clearmodifiers', '--delay', '0', text,
			],
			{timeout: DEFAULT_TIMEOUT_MS, display},
		)
		return
	}
	if (!Number.isInteger(wid) || wid <= 0) throw new Error(`invalid wid: ${wid}`)
	// Phase 103.1-8 — when caller scopes to a non-default display (e.g.
	// master Chrome on `:10`), pass it through to execFileAsync so xdotool's
	// $DISPLAY matches the X server where this wid actually exists.
	// Without this, the explicit-wid xdotool path inherits WEBAPPS_X11_ENV's
	// default `:1` and reports `BadWindow (invalid Window parameter)` when
	// the caller's wid is on `:10`/`:11`/etc. Live UAT 2026-05-11 repro.
	const widStr = String(wid)
	const optsForWidPath = display && /^:[1-9][0-9]?$/.test(display)
		? {timeout: DEFAULT_TIMEOUT_MS, display}
		: {timeout: DEFAULT_TIMEOUT_MS}
	await execFileAsync(
		'xdotool',
		[
			'windowactivate', '--sync', widStr,
			'windowfocus', '--sync', widStr,
			'type', '--clearmodifiers', '--delay', '0', text,
		],
		optsForWidPath,
	)
}

/**
 * X11 wheel button conventions:
 *   button 4 = scroll up
 *   button 5 = scroll down
 *   button 6 = scroll left
 *   button 7 = scroll right
 */
export type ScrollButton = 4 | 5 | 6 | 7

/**
 * Phase 100-09-02 — Dispatch a scroll wheel event at (x, y) inside the
 * given X11 wid. Same activate-first pattern as `dispatchPointer`.
 *
 * Chrome filters synthetic XSendEvent — `xdotool click --window <wid> 5`
 * dispatches the event but Chrome drops it (same fix as P100-07.3 for
 * regular click). The reliable pattern is: activate the wid, focus it,
 * move the cursor wid-relative, then click (without --window) so xdotool
 * sends a real button event to the X11-focused window.
 *
 * Closes 100-09 Bug 2 (scroll-down doesn't work) — frontend wheel
 * listener (webapp-stream-window.tsx) maps deltaY > 0 → button 5,
 * deltaY < 0 → button 4, deltaX > 0 → button 7, deltaX < 0 → button 6.
 */
export async function dispatchScroll(
	wid: number,
	x: number,
	y: number,
	button: ScrollButton,
	display?: string,
): Promise<void> {
	if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('invalid coords')
	if (button !== 4 && button !== 5 && button !== 6 && button !== 7) {
		throw new Error(`invalid scroll button: ${button} (must be 4/5/6/7)`)
	}
	const ix = Math.max(0, Math.round(x))
	const iy = Math.max(0, Math.round(y))
	// Phase 102 r12 — display-mode scroll with search + windowfocus chain.
	// Mirrors dispatchPointer's mitigation: Chrome ignores synthetic wheel
	// events unless the target Chrome window has X11 focus before the click.
	if ((wid === 0 || !Number.isInteger(wid)) && display && /^:[1-9][0-9]?$/.test(display)) {
		await execFileAsync(
			'xdotool',
			[
				'search', '--onlyvisible', '--limit', '1', '--class', 'chrome',
				'windowactivate', '--sync', '%@',
				'windowfocus', '--sync', '%@',
				'mousemove', String(ix), String(iy),
				'click', '--clearmodifiers', String(button),
			],
			{timeout: DEFAULT_TIMEOUT_MS, display},
		)
		return
	}
	if (!Number.isInteger(wid) || wid <= 0) throw new Error(`invalid wid: ${wid}`)
	// Phase 103.1-8 — when caller scopes to a non-default display (e.g.
	// master Chrome on `:10`), pass it through to execFileAsync so xdotool's
	// $DISPLAY matches the X server where this wid actually exists.
	// Without this, the explicit-wid xdotool path inherits WEBAPPS_X11_ENV's
	// default `:1` and reports `BadWindow (invalid Window parameter)` when
	// the caller's wid is on `:10`/`:11`/etc. Live UAT 2026-05-11 repro.
	const widStr = String(wid)
	const optsForWidPath = display && /^:[1-9][0-9]?$/.test(display)
		? {timeout: DEFAULT_TIMEOUT_MS, display}
		: {timeout: DEFAULT_TIMEOUT_MS}
	// Phase 103.1-9 — same `mousemove --window --sync` hang fix as
	// dispatchPointer. Absolute coords are fine because every Chrome window
	// LivOS spawns sits at (0,0) on its own Xvfb.
	const scrollMousemove =
		display && /^:[1-9][0-9]?$/.test(display)
			? ['mousemove', String(ix), String(iy)]
			: ['mousemove', '--window', widStr, '--sync', String(ix), String(iy)]
	await execFileAsync(
		'xdotool',
		[
			'windowactivate', '--sync', widStr,
			'windowfocus', '--sync', widStr,
			...scrollMousemove,
			'click', '--clearmodifiers', String(button),
		],
		optsForWidPath,
	)
}
