/**
 * Phase 100-08-01 — fluxbox WM helper.
 *
 * Lightweight WM bound to Xvfb :1 (D-100-08-A). xdotool's
 * `windowactivate --sync` chain (selfclaude pattern, 100-07.3) requires
 * a running WM to be reliable — fluxbox is the smallest acceptable WM
 * that selfclaude verified for this use case.
 *
 * Risk #2 mitigation: launched with an empty `-rc /tmp/livos-fluxbox.cfg`
 * so fluxbox doesn't bind keys that should reach Chrome. Default
 * fluxbox keybindings (Alt+F1, Alt+Tab, etc.) would otherwise swallow
 * keys the WebApp expects.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (D-100-SACRED) — never touched.
 */
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'
import {writeFileSync} from 'node:fs'

export interface StartFluxboxOpts {
	display?: string                // default ':1'
	user?: string                   // default 'bruce'
	rcPath?: string                 // default '/tmp/livos-fluxbox.cfg'
	spawnFn?: typeof nodeSpawn
	logger?: {info: (m: string) => void; warn: (m: string, e?: unknown) => void; error: (m: string, e?: unknown) => void}
}

export interface FluxboxHandle {
	pid: number
	display: string
	exited: Promise<{code: number | null; signal: NodeJS.Signals | null}>
	stop(): Promise<void>
}

/** Empty-keybindings stub config so fluxbox doesn't swallow Alt+F1 etc. */
const EMPTY_RC = `# livinityd-managed; empty so WebApp keys pass through
session.screen0.toolbar.visible: false
session.screen0.workspaces: 1
`

export async function startFluxbox(opts: StartFluxboxOpts = {}): Promise<FluxboxHandle> {
	const display = opts.display ?? ':1'
	const user = opts.user ?? 'bruce'
	const rcPath = opts.rcPath ?? '/tmp/livos-fluxbox.cfg'
	const spawnFn = opts.spawnFn ?? nodeSpawn
	const logger = opts.logger

	// Write the stub rc (idempotent — overwrite each boot is fine).
	try {
		writeFileSync(rcPath, EMPTY_RC, {encoding: 'utf8'})
	} catch (err) {
		logger?.warn?.(`failed to write fluxbox rc to ${rcPath}; fluxbox will use defaults`, err)
	}

	// sudo -n -u bruce DISPLAY=:1 fluxbox -display :1 -rc /tmp/livos-fluxbox.cfg
	const args = [
		'-n', '-u', user,
		`DISPLAY=${display}`,
		'fluxbox',
		'-display', display,
		'-rc', rcPath,
	]
	const child = spawnFn('sudo', args, {
		detached: true,
		stdio: 'ignore',
		env: {...process.env, DISPLAY: display},
	}) as ChildProcess

	const exited = new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolve) => {
		child.on('exit', (code, signal) => {
			logger?.warn?.(`fluxbox pid=${child.pid} exited (code=${code} signal=${signal})`)
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
			/* noop */
		}
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
	logger?.info?.(`fluxbox spawned pid=${pid} display=${display}`)
	return {pid, display, exited, stop}
}
