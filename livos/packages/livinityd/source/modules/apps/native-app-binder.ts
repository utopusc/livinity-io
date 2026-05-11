/**
 * Phase 101-05 — Native-app window binder.
 *
 * After `spawnNativeApp()` (101-03) hands back `{pid, child}`, this module
 * answers the question "which X11 window did that binary just open?" by
 * polling `xdotool` for a new WM_CLASS-matching wid on the target display,
 * then allocates a stream port from the shared `PortAllocator` (101-02)
 * and starts the x11vnc-backed stream against the matched wid.
 *
 * Algorithm (baseline-and-poll, mirrors webapps/window-discovery.ts):
 *   1. Snapshot every currently-visible wid on the display (the "baseline").
 *   2. Loop until deadline:
 *      - Run `xdotool search --onlyvisible --class <wmClass>` on the display.
 *      - Pick the first wid in stdout that was NOT in the baseline.
 *      - On match: break.
 *      - On miss: wait `pollIntervalMs`, try again.
 *   3. If deadline elapses without a match, throw NativeAppWindowNotFoundError
 *      and leave the spawned child running so the user can retry / debug
 *      manually via `xdotool` or `wmctrl`.
 *   4. After the wid is matched, allocate a port from the PortAllocator
 *      (THIS ORDER MATTERS — we don't burn a port slot if the bind times out)
 *      and call `startStreamFn({wid, port, label})`. If that throws, release
 *      the port back to the allocator so the slot is reusable.
 *
 * Defaults:
 *   - display: `:1` (matches livinityd's singleton Xvfb per 100-08-01)
 *   - deadlineMs: 5_000 (D-101-NATIVE-APPS — 5s budget for the WM_CLASS poll)
 *   - pollIntervalMs: 100 (matches webapps/window-discovery.ts cadence)
 *
 * No shell expansion ever: all args are passed through `execFile` (argv),
 * not `exec` (shell string). The wmClass + display strings are also bound
 * by the upstream nativeAppConfigSchema (`wmClassHint` regex `^[\w-]{1,64}$`,
 * display is owned by livinityd code paths, not user input).
 */

import {execFile} from 'node:child_process'
import {basename} from 'node:path'
import {promisify} from 'node:util'

import type {PortAllocator} from '../streaming/port-allocator.js'

const execFileP = promisify(execFile)

/**
 * Shape of an `execFile`-style async function. Production code injects the
 * Node built-in; tests inject `vi.fn()` returning queued stdouts.
 */
export type ExecFileFn = (
	cmd: string,
	args: string[],
	opts?: {env?: NodeJS.ProcessEnv},
) => Promise<{stdout: string; stderr: string}>

/**
 * The contract a stream-start callback must satisfy. In production it adapts
 * `StreamManager.startStream(...)` (sync, returns `{streamId, wsUrl}`) into a
 * Promise-returning function. Tests provide a `vi.fn()` directly.
 */
export interface StreamStartFn {
	(opts: {wid: number; port: number; label?: string}): Promise<{
		streamId: string
		wsUrl: string
	}>
}

/** Minimal logger surface — matches the spawner/window-manager conventions. */
export interface BinderLogger {
	info(msg: string): void
	warn(msg: string): void
	error(msg: string): void
	verbose?(msg: string): void
}

/** Thrown when no new matching window appears within the deadline. */
export class NativeAppWindowNotFoundError extends Error {
	code = 'NATIVE_APP_WINDOW_NOT_FOUND'
	constructor(public wmClass: string) {
		super(
			`no new window matching WM_CLASS=${wmClass} appeared within the binder deadline`,
		)
		this.name = 'NativeAppWindowNotFoundError'
	}
}

const DEFAULT_DISPLAY = ':1'
const DEFAULT_DEADLINE_MS = 5_000
const DEFAULT_POLL_INTERVAL_MS = 100

/**
 * Infer a sensible `--class` value from a binary path. The basename is
 * lowercased and any trailing file extension is stripped. This is the
 * fallback used when `cfg.wmClassHint` is absent — most Linux apps register
 * a WM_CLASS that matches their executable's basename (Antigravity sets
 * `Antigravity`, VSCode sets `code`, etc.).
 *
 * Examples:
 *   inferWmClass('/usr/bin/code')             → 'code'
 *   inferWmClass('/opt/Antigravity/antigravity') → 'antigravity'
 *   inferWmClass('/opt/foo/bar.bin')          → 'bar'
 */
export function inferWmClass(binaryPath: string): string {
	const base = basename(binaryPath).toLowerCase()
	return base.replace(/\.[^.]+$/, '')
}

/**
 * Snapshot every currently-visible top-level wid on the display. Used as
 * the baseline against which post-spawn polls are diffed.
 *
 * Failures (xdotool missing / X server unreachable) are caught silently and
 * an empty Set is returned. The caller's poll loop will simply consider
 * every match a "new" window — acceptable because if xdotool is broken the
 * bind path is broken too and the deadline will catch the no-match case.
 */
export async function snapshotWindowIds(
	display: string,
	execFileFn?: ExecFileFn,
): Promise<Set<number>> {
	const fn = execFileFn ?? (execFileP as unknown as ExecFileFn)
	try {
		const {stdout} = await fn(
			'xdotool',
			['search', '--onlyvisible', ''],
			{env: {...process.env, DISPLAY: display}},
		)
		const set = new Set<number>()
		for (const line of stdout.split(/\r?\n/)) {
			const trimmed = line.trim()
			if (!trimmed) continue
			const n = parseInt(trimmed, 10)
			if (Number.isFinite(n)) set.add(n)
		}
		return set
	} catch {
		return new Set()
	}
}

export interface BindOpts {
	/** pid of the spawned process (informational — used only for logging). */
	pid: number
	/** WM_CLASS to match. Pass the cfg.wmClassHint or the inferWmClass(binaryPath) result. */
	wmClass: string
	/** X11 display, default `:1`. */
	display?: string
	/** Shared PortAllocator instance (101-02). */
	portAllocator: PortAllocator
	/** Stream-start callback (adapts StreamManager.startStream in production). */
	startStreamFn: StreamStartFn
	/** Optional execFile injection for tests; defaults to node:child_process.execFile (promisified). */
	execFileFn?: ExecFileFn
	/** Total bind budget in ms; default 5000 (D-101-NATIVE-APPS). */
	deadlineMs?: number
	/** Poll cadence in ms; default 100. Tests pass 0 to run instantly. */
	pollIntervalMs?: number
	/** Optional human-readable label propagated to the stream (used in logs). */
	label?: string
	logger?: BinderLogger
}

/**
 * Poll xdotool for a new WM_CLASS-matching wid, then allocate a port and
 * start the stream. See module header for the full algorithm.
 *
 * Returns `{wid, port, streamId, wsUrl}` on success. Throws
 * `NativeAppWindowNotFoundError` on deadline; rethrows any error from
 * `startStreamFn` after releasing the allocated port (cleanup safety).
 */
export async function bindNativeAppWindow(
	opts: BindOpts,
): Promise<{wid: number; port: number; streamId: string; wsUrl: string}> {
	const display = opts.display ?? DEFAULT_DISPLAY
	const execFn: ExecFileFn = opts.execFileFn ?? (execFileP as unknown as ExecFileFn)
	const deadline = Date.now() + (opts.deadlineMs ?? DEFAULT_DEADLINE_MS)
	const poll = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
	const env: NodeJS.ProcessEnv = {...process.env, DISPLAY: display}

	const baseline = await snapshotWindowIds(display, execFn)

	let wid: number | undefined
	while (Date.now() < deadline) {
		try {
			const {stdout} = await execFn(
				'xdotool',
				['search', '--onlyvisible', '--class', opts.wmClass],
				{env},
			)
			const candidates: number[] = []
			for (const line of stdout.split(/\r?\n/)) {
				const trimmed = line.trim()
				if (!trimmed) continue
				const n = parseInt(trimmed, 10)
				if (Number.isFinite(n)) candidates.push(n)
			}
			const cand = candidates.find((w) => !baseline.has(w))
			if (cand !== undefined) {
				wid = cand
				break
			}
		} catch {
			// xdotool exits non-zero when zero windows match — keep polling.
		}
		if (Date.now() >= deadline) break
		// pollIntervalMs===0 still yields to the macrotask queue (setTimeout 0
		// is one tick) so the loop is cooperatively cancellable.
		await new Promise((r) => setTimeout(r, poll))
	}

	if (wid === undefined) {
		throw new NativeAppWindowNotFoundError(opts.wmClass)
	}

	// Allocate the port AFTER the wid match — if the bind had timed out we
	// would NOT have consumed a slot from the [15900, 16000) pool.
	const port = opts.portAllocator.allocate()
	try {
		const {streamId, wsUrl} = await opts.startStreamFn({
			wid,
			port,
			label: opts.label,
		})
		opts.logger?.info(
			`native-app bound pid=${opts.pid} wid=${wid} port=${port} streamId=${streamId}`,
		)
		return {wid, port, streamId, wsUrl}
	} catch (err) {
		// Cleanup safety: release the slot so the next bind can use it.
		opts.portAllocator.release(port)
		throw err
	}
}
