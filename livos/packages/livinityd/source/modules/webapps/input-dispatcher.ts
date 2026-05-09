/**
 * Phase 100-07 — Input dispatcher for WebApp streams.
 *
 * Bypasses x11vnc input forwarding (which dispatches XTestFakeKey/MotionEvent
 * against the X11 display, defaulting to the focused window — wrong wid for
 * multi-stream). Instead, every click / move / key event lands here and is
 * routed through `xdotool --window <wid>` so it ALWAYS targets the captured
 * Chrome window for that WebApp, independent of X11 focus.
 *
 * Coordinates are in the captured framebuffer's pixel space (0..wid_w,
 * 0..wid_h). The frontend computes them from the canvas mouse event using
 * `getBoundingClientRect()` and the known `--window-size=1280,720` Chrome
 * spawn (Phase 100-06.1).
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
	opts: {timeout?: number} = {},
): Promise<{stdout: string; stderr: string}> {
	return new Promise((resolve, reject) => {
		execFile(
			cmd,
			args,
			{...opts, env: {...process.env, ...WEBAPPS_X11_ENV}},
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
 * `xdotool --window <wid>` ensures the event targets the bound window
 * regardless of X11 focus.
 */
export async function dispatchPointer(
	wid: number,
	x: number,
	y: number,
	button: MouseButton = 1,
	kind: ClickKind = 'click',
): Promise<void> {
	if (!Number.isInteger(wid) || wid <= 0) throw new Error(`invalid wid: ${wid}`)
	if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('invalid coords')
	const ix = Math.max(0, Math.round(x))
	const iy = Math.max(0, Math.round(y))
	const widStr = String(wid)
	// Move to coords, THEN dispatch the click — xdotool resets the --window
	// scope between sub-commands, so we pass --window twice.
	await execFileAsync(
		'xdotool',
		[
			'mousemove',
			'--window',
			widStr,
			'--sync',
			String(ix),
			String(iy),
			kind,
			'--window',
			widStr,
			String(button),
		],
		{timeout: DEFAULT_TIMEOUT_MS},
	)
}

/**
 * Dispatch a single key press (or keydown/keyup) inside the given wid.
 * `key` is an X11 keysym name (e.g. `Return`, `BackSpace`, `Escape`,
 * `ctrl+a`). For typing arbitrary text, use `dispatchType` instead.
 */
export async function dispatchKey(
	wid: number,
	key: string,
	kind: 'key' | 'keydown' | 'keyup' = 'key',
): Promise<void> {
	if (!Number.isInteger(wid) || wid <= 0) throw new Error(`invalid wid: ${wid}`)
	if (typeof key !== 'string' || !key.trim()) throw new Error('invalid key')
	// Prevent shell-metachar injection: xdotool key names are alphanumeric +
	// `+ - _` (modifier separators). Reject anything else.
	if (!/^[A-Za-z0-9_+\-]{1,64}$/.test(key)) {
		throw new Error(`invalid key syntax: ${JSON.stringify(key)}`)
	}
	await execFileAsync(
		'xdotool',
		[kind, '--window', String(wid), key],
		{timeout: DEFAULT_TIMEOUT_MS},
	)
}

/**
 * Type literal text inside the given wid. `text` is passed verbatim to
 * `xdotool type --window <wid>` which dispatches one keysym per char.
 */
export async function dispatchType(wid: number, text: string): Promise<void> {
	if (!Number.isInteger(wid) || wid <= 0) throw new Error(`invalid wid: ${wid}`)
	if (typeof text !== 'string') throw new Error('invalid text')
	if (text.length > 4096) throw new Error('text too long (4096 char limit)')
	if (text.length === 0) return
	await execFileAsync(
		'xdotool',
		['type', '--window', String(wid), '--delay', '0', text],
		{timeout: DEFAULT_TIMEOUT_MS},
	)
}
