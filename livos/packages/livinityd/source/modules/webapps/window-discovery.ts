/**
 * Phase 93-07 — X11 window discovery wrappers (xdotool / wmctrl / xprop).
 *
 * Strongly-typed surface over `xdotool`, `wmctrl`, `xprop` — used by the
 * WebApp Window Manager (T93-10) to find the Chrome window we just spawned
 * and to track its lifecycle.
 *
 * Locked decision D-93-08: two-pass title match (hostname → page title)
 * with baseline-wid diff to filter pre-existing windows. 5s timeout default
 * (configurable per call), 100ms poll.
 *
 * All wrappers use `execFile` (NOT `exec`) so wid/title args are passed as
 * argv — no shell injection surface.
 */

import {execFile} from 'node:child_process'

export type Geometry = {x: number; y: number; w: number; h: number}

export type WindowInfo = {
	wid: number
	title: string
	geometry: Geometry
}

export type FindNewWindowOpts = {
	titleHints: string[] // e.g. ['github.com', 'GitHub - issues']
	baselineWids: Set<number>
	timeoutMs?: number
	pollIntervalMs?: number
}

const DEFAULT_TIMEOUT_MS = 2000
const DEFAULT_FIND_TIMEOUT_MS = 5000
const DEFAULT_POLL_INTERVAL_MS = 100

/**
 * X11 env defaults injected into every binary spawn from this module.
 *
 * 2026-05-08 hotfix: livinityd's systemd unit env has only PATH/USER/HOME —
 * no DISPLAY, no XAUTHORITY. Direct xdotool/wmctrl/xprop calls failed with
 * `Cannot open display.` Bytebot MCP child process does set these explicitly
 * (`bytebot-mcp-config.ts:149-158`); the new P93 streaming + window-manager
 * code path missed the same step. Inject here so every helper inherits.
 *
 * Override via env vars `LIVOS_X11_DISPLAY` / `LIVOS_X11_XAUTHORITY` for
 * non-default Mini PC layouts (e.g. multi-seat hosts).
 */
const X11_ENV = {
	DISPLAY: process.env.LIVOS_X11_DISPLAY ?? ':0',
	XAUTHORITY: process.env.LIVOS_X11_XAUTHORITY ?? '/run/user/1000/gdm/Xauthority',
} as const

/** Public re-export so other webapps modules (window-manager, etc.) reuse the
 *  same defaults instead of duplicating literals. */
export const WEBAPPS_X11_ENV = X11_ENV

/**
 * Promise wrapper around `execFile`. Hand-rolled instead of util.promisify
 * because Node's execFile has a custom promisify symbol that bypasses
 * vi.mock of node:child_process (vaapi-probe.ts uses the same pattern).
 *
 * Always merges X11_ENV into the spawn env so wmctrl/xdotool/xprop reach
 * the host display.
 */
function execFileAsync(
	cmd: string,
	args: string[],
	opts: {timeout?: number; maxBuffer?: number} = {},
): Promise<{stdout: string; stderr: string}> {
	return new Promise((resolve, reject) => {
		execFile(cmd, args, {...opts, env: {...process.env, ...X11_ENV}}, (err, stdout, stderr) => {
			if (err) {
				;(err as Error & {stdout?: string; stderr?: string}).stdout = String(stdout || '')
				;(err as Error & {stdout?: string; stderr?: string}).stderr = String(stderr || '')
				reject(err)
				return
			}
			resolve({stdout: String(stdout || ''), stderr: String(stderr || '')})
		})
	})
}

/**
 * List all visible top-level X11 windows. Uses `wmctrl -lG` which emits
 * `<wid_hex> <desktop> <x> <y> <w> <h> <hostname> <title...>` per line.
 */
export async function listAllWindows(): Promise<WindowInfo[]> {
	let stdout: string
	try {
		const result = await execFileAsync('wmctrl', ['-lG'], {timeout: DEFAULT_TIMEOUT_MS})
		stdout = result.stdout
	} catch (err) {
		// wmctrl missing or X server unreachable — return empty list, callers
		// see "no windows" not an exception.
		const e = err as NodeJS.ErrnoException
		if (e.code === 'ENOENT') return []
		throw err
	}

	const out: WindowInfo[] = []
	for (const line of stdout.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed) continue
		// 0x05000003  0 100 200 800 600 hostname Title with spaces
		const match = trimmed.match(/^(0x[0-9a-fA-F]+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)
		if (!match) continue
		const wid = parseInt(match[1], 16)
		const x = parseInt(match[3], 10)
		const y = parseInt(match[4], 10)
		const w = parseInt(match[5], 10)
		const h = parseInt(match[6], 10)
		const title = match[8]
		out.push({wid, title, geometry: {x, y, w, h}})
	}
	return out
}

/**
 * Snapshot of currently-visible top-level window IDs. Used to construct
 * the baseline set passed to `findNewWindowMatching`.
 */
export async function snapshotWindowIds(): Promise<Set<number>> {
	const windows = await listAllWindows()
	return new Set(windows.map((w) => w.wid))
}

export type FindByTitleOpts = {
	hint: string
	caseInsensitive?: boolean
	excludeWids?: Set<number>
}

export async function findWindowByTitle(opts: FindByTitleOpts): Promise<WindowInfo | null> {
	const windows = await listAllWindows()
	const needle = opts.caseInsensitive !== false ? opts.hint.toLowerCase() : opts.hint
	for (const w of windows) {
		if (opts.excludeWids?.has(w.wid)) continue
		const hay = opts.caseInsensitive !== false ? w.title.toLowerCase() : w.title
		if (hay.includes(needle)) return w
	}
	return null
}

/**
 * Two-pass title match (D-93-08): try each titleHint in order, return the
 * first new window (excluding baselineWids) whose title contains the hint.
 * Polls every pollIntervalMs until timeoutMs elapses.
 *
 * Returns null on timeout (caller throws WINDOW_NOT_FOUND).
 */
export async function findNewWindowMatching(
	opts: FindNewWindowOpts,
): Promise<WindowInfo | null> {
	const timeoutMs = opts.timeoutMs ?? DEFAULT_FIND_TIMEOUT_MS
	const pollMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
	const deadline = Date.now() + timeoutMs

	while (Date.now() < deadline) {
		const windows = await listAllWindows()
		const newWindows = windows.filter((w) => !opts.baselineWids.has(w.wid))
		for (const hint of opts.titleHints) {
			if (!hint) continue
			const needle = hint.toLowerCase()
			for (const w of newWindows) {
				if (w.title.toLowerCase().includes(needle)) return w
			}
		}
		const remaining = deadline - Date.now()
		if (remaining <= 0) break
		await sleep(Math.min(pollMs, remaining))
	}
	return null
}

export async function isWindowAlive(wid: number): Promise<boolean> {
	if (!Number.isInteger(wid) || wid <= 0) return false
	try {
		await execFileAsync('xdotool', ['getwindowname', String(wid)], {
			timeout: DEFAULT_TIMEOUT_MS,
		})
		return true
	} catch {
		return false
	}
}

/**
 * Read window geometry via `xdotool getwindowgeometry --shell <wid>`.
 * Output format:
 *   WINDOW=12345
 *   X=100
 *   Y=200
 *   WIDTH=800
 *   HEIGHT=600
 *   SCREEN=0
 */
export async function getWindowGeometry(wid: number): Promise<Geometry | null> {
	if (!Number.isInteger(wid) || wid <= 0) return null
	let stdout: string
	try {
		const result = await execFileAsync(
			'xdotool',
			['getwindowgeometry', '--shell', String(wid)],
			{timeout: DEFAULT_TIMEOUT_MS},
		)
		stdout = result.stdout
	} catch {
		return null
	}
	const map: Record<string, string> = {}
	for (const line of stdout.split(/\r?\n/)) {
		const m = line.match(/^([A-Z]+)=(.*)$/)
		if (m) map[m[1]] = m[2]
	}
	if (!('X' in map) || !('Y' in map) || !('WIDTH' in map) || !('HEIGHT' in map)) {
		return null
	}
	return {
		x: parseInt(map.X, 10),
		y: parseInt(map.Y, 10),
		w: parseInt(map.WIDTH, 10),
		h: parseInt(map.HEIGHT, 10),
	}
}

export async function activateWindow(wid: number): Promise<boolean> {
	if (!Number.isInteger(wid) || wid <= 0) return false
	try {
		await execFileAsync('xdotool', ['windowactivate', '--sync', String(wid)], {
			timeout: DEFAULT_TIMEOUT_MS,
		})
		return true
	} catch {
		return false
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
