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
 * P100-09-07 — stderr capture + early-exit health check.
 *
 * Original spawn used `stdio: 'ignore'` which silently swallowed fluxbox's
 * stderr. When sudo NOPASSWD for `bruce` was missing on Mini PC (or PATH
 * missed fluxbox, or :1 was unreachable, etc.), the child died on startup
 * with no log trail. Downstream: no WM on :1 → root window has no
 * `_NET_CLIENT_LIST` atom → every `wmctrl -lG` call returned
 * `Cannot get client list properties (_NET_CLIENT_LIST or _WIN_CLIENT_LIST)`,
 * and that error string surfaced where the user expected the Chrome stream
 * to render.
 *
 * Fix: capture stderr to `stderrChunks`, forward each chunk to
 * `logger.warn`, and race a 500ms timer against the child's `exit` event.
 * If the child dies inside the window, throw an Error carrying the captured
 * stderr in the message so deploys can diagnose the real cause loudly.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (D-100-SACRED) — never touched.
 */
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import {getDesktopUser} from '../system/desktop-user.js'

export interface StartFluxboxOpts {
	display?: string                // default ':1'
	user?: string                   // default: the desktop user (getDesktopUser())
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

/** Empty-keybindings stub config so fluxbox doesn't swallow Alt+F1 etc.
 *
 * Phase 102 UAT round 9 (2026-05-11): user reported "yayın ilk açıldığında
 * tıklanılan konumlar doğru değil" — click coords off by fluxbox decoration
 * offset. fluxbox adds a title bar (~16px) + borders (~2px) to every window
 * by default. Chrome at (0,0) actually renders content at (~2, ~18) → user
 * clicks at canvas (100, 100) → xdotool dispatches to :N (100, 100) → that's
 * on the title bar, not Chrome content.
 *
 * Fix: `session.screen0.fullMaximization: true` makes maximized windows
 * cover the FULL display including over/under decorations. Also setting
 * decoration-related options to "NONE" to suppress title bars on Chrome.
 */
const EMPTY_RC = `# livinityd-managed; empty so WebApp keys pass through
session.screen0.toolbar.visible: false
session.screen0.workspaces: 1
session.screen0.fullMaximization: true
session.screen0.defaultDeco: NONE
session.screen0.maxOverSlit: true
session.screen0.maxIgnoreIncrement: true
session.screen0.windowPlacement: RowMinOverlapPlacement
session.screen0.allowRemoteActions: false
`

export async function startFluxbox(opts: StartFluxboxOpts = {}): Promise<FluxboxHandle> {
	const display = opts.display ?? ':1'
	const user = opts.user ?? getDesktopUser()
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
		// P100-09-07: pipe stderr/stdout instead of 'ignore' so we can surface
		// startup failures (sudo NOPASSWD missing, PATH issue, etc.) via logger
		// instead of dying silently and leaving callers staring at downstream
		// wmctrl `_NET_CLIENT_LIST` errors.
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {...process.env, DISPLAY: display},
	}) as ChildProcess

	// P100-09-07: capture stderr chunks so the early-exit handler can put the
	// real reason into the thrown Error, AND so a stderr-but-alive child still
	// gets its complaints written to the log.
	const stderrChunks: string[] = []
	child.stderr?.on('data', (chunk: Buffer | string) => {
		const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
		stderrChunks.push(text)
		logger?.warn?.(`fluxbox stderr: ${text.trim()}`)
	})

	const exited = new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolve) => {
		child.on('exit', (code, signal) => {
			logger?.warn?.(`fluxbox pid=${child.pid} exited (code=${code} signal=${signal})`)
			resolve({code, signal})
		})
	})

	// P100-09-07: 500ms health check. If fluxbox dies inside this window the
	// caller learns the actual stderr reason instead of getting a "successful"
	// handle that points at a corpse.
	const earlyExitRace = new Promise<{code: number | null; signal: NodeJS.Signals | null} | null>(
		(resolve) => {
			const timer = setTimeout(() => resolve(null), 500)
			child.once('exit', (code, signal) => {
				clearTimeout(timer)
				resolve({code, signal})
			})
		},
	)
	const earlyExit = await earlyExitRace
	if (earlyExit !== null) {
		const stderrText = stderrChunks.join('').trim()
		const reason = stderrText || 'no stderr output'
		logger?.error?.(
			`fluxbox FAILED to start within 500ms (code=${earlyExit.code} signal=${earlyExit.signal}). stderr: ${reason}`,
		)
		throw new Error(`fluxbox failed to start on ${display}: ${reason}`)
	}

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
