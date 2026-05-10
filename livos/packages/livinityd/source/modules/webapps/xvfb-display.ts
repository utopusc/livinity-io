/**
 * Phase 100-08-01 — Xvfb :1 helper.
 *
 * Spawns Xvfb on a dedicated display (:1 by default — D-100-08-A) under
 * `sudo -n -u bruce`. WebApp Chrome instances connect to :1 instead of
 * bruce's GNOME :0, eliminating the IPC merge that drops
 * `--window-size=1280,720` (Bug 1 from CONTINUE.md).
 *
 * Lifecycle owned by livinityd's start()/stop() (see ../../../index.ts).
 * On crash: log + emit via `exited` promise. Auto-respawn deferred until
 * production evidence (risk #3 mitigation deferred per 100-08-CONTEXT).
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (D-100-SACRED) — never touched.
 */
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'

export interface StartXvfbOpts {
	display?: string         // default ':1' (D-100-08-A)
	resolution?: string      // default '1920x1080x24' (selfclaude recipe)
	user?: string            // default 'bruce'
	spawnFn?: typeof nodeSpawn
	logger?: {info: (m: string) => void; warn: (m: string, e?: unknown) => void; error: (m: string, e?: unknown) => void}
}

export interface XvfbHandle {
	pid: number
	display: string
	exited: Promise<{code: number | null; signal: NodeJS.Signals | null}>
	stop(): Promise<void>
}

export async function startXvfb(opts: StartXvfbOpts = {}): Promise<XvfbHandle> {
	const display = opts.display ?? ':1'
	const resolution = opts.resolution ?? '1920x1080x24'
	const user = opts.user ?? 'bruce'
	const spawnFn = opts.spawnFn ?? nodeSpawn
	const logger = opts.logger

	// sudo -n -u bruce Xvfb :1 -screen 0 1920x1080x24 -nolisten tcp -ac
	const args = [
		'-n', '-u', user,
		'Xvfb', display,
		'-screen', '0', resolution,
		'-nolisten', 'tcp',
		'-ac',
	]
	const child = spawnFn('sudo', args, {
		detached: true,
		stdio: 'ignore',
	}) as ChildProcess

	const exited = new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolve) => {
		child.on('exit', (code, signal) => {
			logger?.warn?.(`Xvfb pid=${child.pid} exited (code=${code} signal=${signal})`)
			resolve({code, signal})
		})
	})

	try {
		child.unref?.()
	} catch {
		/* noop */
	}

	const stop = async (): Promise<void> => {
		try {
			child.kill('SIGTERM')
		} catch {
			/* may already be gone */
		}
		// 2s grace then SIGKILL
		const timer = setTimeout(() => {
			try {
				child.kill('SIGKILL')
			} catch {
				/* noop */
			}
		}, 2000)
		await exited
		clearTimeout(timer)
	}

	const pid = child.pid ?? 0
	logger?.info?.(`Xvfb spawned pid=${pid} display=${display}`)
	return {pid, display, exited, stop}
}
