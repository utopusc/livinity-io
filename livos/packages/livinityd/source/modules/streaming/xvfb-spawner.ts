/**
 * Phase 102-01 — XvfbSpawner (D-102-PER-APP-XVFB).
 *
 * Spawns `Xvfb :N -screen 0 WxHx24 -nolisten tcp -ac` under `sudo -n -u <user>`
 * (default `bruce`) as a detached child, then blocks on a readiness poll
 * (`xdpyinfo -display :N` every 200ms, 5s deadline) before returning the
 * handle. On readiness failure, SIGKILLs the orphan and throws
 * `XvfbReadyTimeoutError` so callers (Wave 2 window-manager.ts, native-app-binder.ts)
 * surface the failure loudly instead of racing Chrome against a half-up X server.
 *
 * Companion to streaming/display-allocator.ts. Wave 2 composes them:
 *   const display = displayAllocator.allocate()        // → number e.g. 10
 *   const handle = await spawnXvfb({display: `:${display}`, width: 1280, height: 720})
 *   // ...spawn Chrome/native binary with DISPLAY=:N env...
 *   // on close: await handle.stop(); displayAllocator.release(display)
 *
 * Replaces the 1920x1080 single-display `webapps/xvfb-display.ts` (Phase 100-08-01)
 * for the per-app path. The legacy `:1` Xvfb stays in the tree as the host-Luse
 * baseline; this module is the per-app variant.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (D-102-SACRED) — never touched.
 */

import {
	spawn as nodeSpawn,
	execFile as nodeExecFile,
	type ChildProcess,
	type SpawnOptions,
} from 'node:child_process'
import {promisify} from 'node:util'
import {getDesktopUser} from '../system/desktop-user.js'

const defaultExecFile = promisify(nodeExecFile)

export type XvfbSpawnFn = (cmd: string, args: string[], opts?: SpawnOptions) => ChildProcess

export type XvfbExecFileFn = (
	file: string,
	args: string[],
	opts?: {env?: NodeJS.ProcessEnv},
) => Promise<{stdout: string; stderr: string}>

export type XvfbLogger = {
	info?: (msg: string) => void
	warn?: (msg: string, err?: unknown) => void
	error?: (msg: string, err?: unknown) => void
	verbose?: (msg: string) => void
}

export interface XvfbSpawnOpts {
	/** X display number, e.g. ':10'. Required — no default (allocator-driven). */
	display: string
	/** Pixel width. Default 1280. */
	width?: number
	/** Pixel height. Default 720. */
	height?: number
	/** Color depth. Default 24. */
	depth?: number
	/** Service user passed to `sudo -n -u <user>`. Default 'bruce'. */
	user?: string
	/** xdpyinfo poll interval. Default 200ms. */
	pollIntervalMs?: number
	/** Readiness deadline. Default 5000ms (25 poll iterations). */
	readyTimeoutMs?: number
	/** SIGTERM→SIGKILL grace on stop(). Default 2000ms. */
	graceMs?: number
	/** Injected for tests; defaults to node:child_process.spawn. */
	spawnFn?: XvfbSpawnFn
	/** Injected for tests; defaults to promisified node:child_process.execFile. */
	execFileFn?: XvfbExecFileFn
	logger?: XvfbLogger
}

export interface XvfbHandle {
	pid: number
	display: string
	exited: Promise<{code: number | null; signal: NodeJS.Signals | null}>
	stop(): Promise<void>
}

export class XvfbReadyTimeoutError extends Error {
	code = 'XVFB_READY_TIMEOUT'
	constructor(
		public display: string,
		public timeoutMs: number,
	) {
		super(`Xvfb on ${display} did not become ready within ${timeoutMs}ms (xdpyinfo never returned 0)`)
		this.name = 'XvfbReadyTimeoutError'
	}
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * SIGTERM → wait graceMs → SIGKILL pattern. Both kills wrapped in try/catch
 * (process may already be gone). Resolves when the exited promise resolves OR
 * after grace+250ms slack (covers cases where exit event never fires).
 */
async function stopProc(
	child: ChildProcess,
	exited: Promise<{code: number | null; signal: NodeJS.Signals | null}>,
	graceMs: number,
	logger?: XvfbLogger,
): Promise<void> {
	try {
		child.kill('SIGTERM')
	} catch (err) {
		logger?.warn?.('xvfb-spawner: SIGTERM failed (process may already be gone)', err)
	}
	const killTimer = setTimeout(() => {
		try {
			child.kill('SIGKILL')
		} catch (err) {
			logger?.warn?.('xvfb-spawner: SIGKILL failed (process may already be gone)', err)
		}
	}, graceMs)
	await exited
	clearTimeout(killTimer)
}

/**
 * Spawn Xvfb on `display` at `width x height x depth`, poll xdpyinfo until
 * ready (or timeout), return a handle wrapping the live child.
 *
 * Throws `XvfbReadyTimeoutError` if xdpyinfo never returns 0 within readyTimeoutMs.
 * On timeout, the child is SIGKILL'd before the error propagates so callers
 * don't leak an orphan Xvfb process.
 */
export async function spawnXvfb(opts: XvfbSpawnOpts): Promise<XvfbHandle> {
	const display = opts.display
	const width = opts.width ?? 1280
	const height = opts.height ?? 720
	const depth = opts.depth ?? 24
	const user = opts.user ?? getDesktopUser()
	const pollIntervalMs = opts.pollIntervalMs ?? 200
	const readyTimeoutMs = opts.readyTimeoutMs ?? 5000
	const graceMs = opts.graceMs ?? 2000
	const spawnFn = opts.spawnFn ?? (nodeSpawn as unknown as XvfbSpawnFn)
	const execFileFn = opts.execFileFn ?? (defaultExecFile as unknown as XvfbExecFileFn)
	const logger = opts.logger

	const resolution = `${width}x${height}x${depth}`
	const args = [
		'-n',
		'-u',
		user,
		'Xvfb',
		display,
		'-screen',
		'0',
		resolution,
		'-nolisten',
		'tcp',
		'-ac',
	]

	const child = spawnFn('sudo', args, {
		detached: true,
		stdio: 'ignore',
	})

	const exited = new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolve) => {
		child.on('exit', (code, signal) => {
			logger?.warn?.(
				`xvfb-spawner: Xvfb pid=${child.pid ?? '?'} display=${display} exited (code=${code} signal=${signal})`,
			)
			resolve({code, signal})
		})
	})

	const pid = child.pid ?? 0
	logger?.info?.(`xvfb-spawner: spawned pid=${pid} display=${display} resolution=${resolution}`)

	// xdpyinfo readiness poll — block until the X server responds or timeout.
	const start = Date.now()
	let ready = false
	while (Date.now() - start < readyTimeoutMs) {
		try {
			await execFileFn('xdpyinfo', ['-display', display], {env: {...process.env, DISPLAY: display}})
			ready = true
			break
		} catch {
			await sleep(pollIntervalMs)
		}
	}
	if (!ready) {
		// SIGKILL the orphan before we throw so the caller doesn't leak an Xvfb.
		try {
			child.kill('SIGKILL')
		} catch {
			/* may already be gone */
		}
		throw new XvfbReadyTimeoutError(display, readyTimeoutMs)
	}

	try {
		child.unref?.()
	} catch {
		/* noop */
	}

	const stop = (): Promise<void> => stopProc(child, exited, graceMs, logger)

	return {pid, display, exited, stop}
}
