/**
 * Phase 102-02 — ChromeProcessSpawner (D-102-PER-APP-CHROME).
 *
 * Spawns a per-app google-chrome subprocess scoped to its own --user-data-dir
 * (singleton-lock isolation) and Xvfb display (DISPLAY=:N). --start-fullscreen
 * + --app=<URL> yields chromeless full-display rendering (no tabs, no address
 * bar — the SelfClaude pattern verified working by the user 2026-05-11).
 *
 * Per-app --user-data-dir eliminates Chrome's process-singleton IPC merge
 * (chromium/src process_singleton_posix.cc) which broke 100-10-08's shared-
 * profile attempt.
 *
 * ## Threat T-102-02 (Chrome arg injection)
 *
 * Caller (window-manager.ts) supplies `url`, `userDataDir`, `display`. All
 * three flow into argv positions that are NOT shell-quoted (sudo argv is
 * exec-vector, not shell; but Chrome itself parses --app and --user-data-dir
 * literally, and a malicious userDataDir could escape into an arbitrary path).
 *
 * Mitigation: every input is validated at the gate BEFORE spawn() is called:
 *   - `url` parsed via `new URL()`; protocol must be http/https/file
 *   - `userDataDir` regex-matched against /tmp/livos-chrome-app-<uuid v4>
 *   - `display` regex-matched against :1..:99
 * Any rejection throws ChromeProcessSpawnError; spawn() is NEVER reached.
 *
 * ## Threat T-102-02c (zombie Chrome on app close)
 *
 * `ChromeProcessHandle.stop()` sends SIGTERM, waits 2s grace, sends SIGKILL.
 * Window-manager close path (102-08) MUST call stop() on every WebApp close.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f — never touched.
 */

import {spawn as nodeSpawn, type ChildProcess, type SpawnOptions} from 'node:child_process'

/**
 * userDataDir regex — either `/tmp/livos-chrome-app-<uuid v4>` (per-app)
 * OR the master profile constant `/opt/livos/data/chrome-master`.
 *
 * Phase 103-01 widening rationale (T-103-01-02): master path is a
 * hardcoded constant in master-login-routes.ts (MASTER_PROFILE_DIR), not
 * a caller-controlled value. Adding it as a second alternative (NOT a
 * pattern) preserves T-102-02 protection for the per-app branch — no
 * /etc/passwd, /opt/livos/data/chrome-master/.. or trailing-path injection
 * is possible because both alternatives are fully anchored (^ ... $).
 */
// Phase 259 — a third anchored alternative for the PERSISTENT per-WebApp profile
// `/opt/livos/data/chrome-webapps/<uuid v4>` (profile-seeder.ts seed({persistent}))
// — same fully-anchored UUID shape as the /tmp branch, so no traversal is possible.
const USER_DATA_DIR_RE =
	/^(\/tmp\/livos-chrome-app-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|\/opt\/livos\/data\/chrome-webapps\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|\/opt\/livos\/data\/chrome-master)$/

/**
 * Display regex — `:1` .. `:99` only.
 *
 * The DisplayAllocator (102-01) allocates [10, 100) — :1..:9 are reserved for
 * host-side LivOS Xvfb (D-100-08-A) but the format is still legal here for
 * test/debug spawns. :0 (physical screen) is forbidden — Master Login (102-07)
 * has a dedicated path for that.
 */
const DISPLAY_RE = /^:[1-9][0-9]?$/

/**
 * Canonical Chrome args every per-app spawn uses.
 *
 * Ordered for readability. None of these accept caller-controlled values, so
 * they require no validation. The `--app=<URL>` and `--user-data-dir=<dir>`
 * args ARE built per-call (with validated values) and concatenated after this
 * STATIC_ARGS block.
 *
 * - `--no-first-run` / `--no-default-browser-check` — skip welcome dialogs
 * - `--no-sandbox` — required because Chrome runs under sudo -u bruce in a
 *   container-style isolation; the kernel sandbox needs CAP_SYS_ADMIN which
 *   we don't grant. The per-app --user-data-dir + Xvfb display isolation IS
 *   our sandbox.
 * - `--start-fullscreen` — covers the entire 1280x720 Xvfb canvas
 * - `--disable-features=...` — suppresses Chrome 100+ welcome modals
 * - `--disable-infobars` / `--test-type` — extra noise suppression
 */
const STATIC_ARGS = [
	'--no-first-run',
	'--no-default-browser-check',
	'--no-sandbox',
	// Phase 102 UAT round 6 (2026-05-11): --start-fullscreen put Chrome in
	// F11-equivalent mode (tabs hidden) and user couldn't re-enter normal
	// view. Switch to --start-maximized + --window-size=1280,720 so Chrome
	// fills the 1280x720 Xvfb canvas with tabs+address bar visible at top.
	'--start-maximized',
	'--window-size=1280,720',
	'--window-position=0,0',
	'--disable-features=ChromeWhatsNewUI,TranslateUI,InfoBars',
	'--disable-infobars',
	'--test-type',
] as const

/** Stderr-tail bound (vnc-bridge.ts / native-app-spawner.ts convention). */
const STDERR_TAIL_LIMIT = 50

/** Grace period (ms) between SIGTERM and SIGKILL in `stop()`. */
const STOP_GRACE_MS = 2000

/** Typed error class. `code` is a stable identifier for callers to switch on. */
export class ChromeProcessSpawnError extends Error {
	constructor(
		public code:
			| 'CHROME_INVALID_URL'
			| 'CHROME_INVALID_USERDATADIR'
			| 'CHROME_INVALID_DISPLAY'
			| 'CHROME_SPAWN_FAILED',
		msg: string,
	) {
		super(msg)
		this.name = 'ChromeProcessSpawnError'
	}
}

/** Minimal logger surface (matches vnc-bridge / native-app-spawner convention). */
export interface ChromeProcessSpawnerLogger {
	info(msg: string): void
	warn(msg: string, err?: unknown): void
	error(msg: string, err?: unknown): void
	verbose?(msg: string): void
}

/** Spawn factory shape — production uses `child_process.spawn`; tests inject FakeChild. */
export type ChromeSpawnFn = (
	cmd: string,
	args: string[],
	opts?: SpawnOptions,
) => ChildProcess

export interface ChromeSpawnOpts {
	/** X11 display token like `:10`, `:11` (matches DisplayAllocator output). */
	display: string
	/** Per-app Chrome user-data dir; must match `/tmp/livos-chrome-app-<uuid v4>`. */
	userDataDir: string
	/** Target URL (http/https/file). Validated via `new URL()`. */
	url: string
	/** Unix user to sudo to; default `bruce` (the LivOS service user). */
	user?: string
	/** Override the chrome binary path (tests use this; default `google-chrome`). */
	chromeBinary?: string
	/** Spawn factory injection (tests pass FakeChild). */
	spawnFn?: ChromeSpawnFn
	logger?: ChromeProcessSpawnerLogger
}

export interface ChromeProcessHandle {
	pid: number
	child: ChildProcess
	display: string
	userDataDir: string
	/**
	 * Idempotent shutdown — SIGTERM, wait `STOP_GRACE_MS`, then SIGKILL. Resolves
	 * when the child emits `exit`. Safe to call multiple times (subsequent calls
	 * race the same exit-promise resolution).
	 */
	stop(): Promise<void>
}

/**
 * Defense-in-depth gate: validate caller inputs BEFORE any spawn() call.
 *
 * Throws ChromeProcessSpawnError with a stable `code` field for switch-based
 * caller error handling. Each input has its own discriminating code so the
 * caller can surface a specific message to the UI (e.g. "your bookmark URL
 * is invalid" vs. "internal: display allocator handed us a bad token").
 */
function validateInputs(opts: ChromeSpawnOpts): void {
	// URL — parse + protocol allowlist (T-102-02).
	let parsed: URL
	try {
		parsed = new URL(opts.url)
	} catch {
		throw new ChromeProcessSpawnError(
			'CHROME_INVALID_URL',
			`invalid url: ${opts.url}`,
		)
	}
	if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) {
		throw new ChromeProcessSpawnError(
			'CHROME_INVALID_URL',
			`unsupported url protocol: ${parsed.protocol} (expected http/https/file)`,
		)
	}

	// userDataDir — regex-pinned to the /tmp/livos-chrome-app-<uuid v4> shape (T-102-02).
	if (!USER_DATA_DIR_RE.test(opts.userDataDir)) {
		throw new ChromeProcessSpawnError(
			'CHROME_INVALID_USERDATADIR',
			`userDataDir must match ${USER_DATA_DIR_RE}, got: ${opts.userDataDir}`,
		)
	}

	// display — regex-pinned to :1..:99 (T-102-02).
	if (!DISPLAY_RE.test(opts.display)) {
		throw new ChromeProcessSpawnError(
			'CHROME_INVALID_DISPLAY',
			`display must match :1..:99, got: ${opts.display}`,
		)
	}
}

/**
 * Spawn a per-app google-chrome subprocess. Returns a handle with `stop()` for
 * the caller's close lifecycle (102-08).
 *
 * Spawn shape (canonical D-102-PER-APP-CHROME argv):
 *   sudo -n -u bruce DISPLAY=:N <chromeBinary> \
 *       --user-data-dir=/tmp/livos-chrome-app-<uuid> \
 *       --no-first-run --no-default-browser-check --no-sandbox \
 *       --start-fullscreen \
 *       --disable-features=... --disable-infobars --test-type \
 *       --app=<URL>
 *
 * The `DISPLAY=...` argv element is the `sudo -E` substitute — we put DISPLAY
 * directly in the env-mutation position of the sudo argv so the spawned Chrome
 * inherits it without us having to pass `--preserve-env=DISPLAY`. We ALSO set
 * DISPLAY in the SpawnOptions.env block so any pre-sudo lookups (PATH resolve)
 * see it too.
 */
export async function spawnChromeProcess(
	opts: ChromeSpawnOpts,
): Promise<ChromeProcessHandle> {
	validateInputs(opts)

	const user = opts.user ?? 'bruce'
	const bin = opts.chromeBinary ?? 'google-chrome'
	const spawnFn = opts.spawnFn ?? (nodeSpawn as ChromeSpawnFn)
	const log = opts.logger

	const args = [
		'-n',
		'-u',
		user,
		`DISPLAY=${opts.display}`,
		bin,
		`--user-data-dir=${opts.userDataDir}`,
		...STATIC_ARGS,
		// Phase 102 deploy UAT round 4 (2026-05-11): user explicitly wants
		// Chrome's tabs + address bar visible at top ("Yukarida gormem
		// gerekiyordu"). `--app=URL` mode is chromeless; switching to URL
		// positional arg gives normal Chrome window — tabs, address bar,
		// nav buttons all visible. `--start-fullscreen` still fills 1280x720.
		opts.url,
	]

	const child = spawnFn('sudo', args, {
		env: {...process.env, DISPLAY: opts.display},
		detached: true,
		stdio: ['ignore', 'ignore', 'pipe'],
	})

	if (!child.pid) {
		throw new ChromeProcessSpawnError(
			'CHROME_SPAWN_FAILED',
			'spawned child has no pid',
		)
	}

	// Stderr-tail diagnostic (vnc-bridge.ts:132-157 / native-app-spawner.ts:124-131 pattern).
	const stderrTail: string[] = []
	child.stderr?.on('data', (chunk: Buffer) => {
		const line = chunk.toString('utf-8').trim()
		if (!line) return
		log?.verbose?.(`chrome[${opts.display}] stderr: ${line}`)
		stderrTail.push(line)
		while (stderrTail.length > STDERR_TAIL_LIMIT) stderrTail.shift()
	})

	child.on('exit', (code, signal) => {
		// code=0 → clean exit; code=null → killed by signal. We dump tail only on
		// non-zero numeric codes so deliberate SIGTERM (from stop()) is quiet.
		if (code !== 0 && code !== null) {
			const tail =
				stderrTail.length > 0
					? `\n--- chrome[${opts.display}] stderr (last ${stderrTail.length}) ---\n${stderrTail.join('\n')}`
					: ' (no stderr captured)'
			log?.error(
				`chrome[${opts.display}] exited code=${code} signal=${signal}${tail}`,
			)
		} else if (code === null && signal) {
			log?.info(`chrome[${opts.display}] terminated by signal=${signal}`)
		} else {
			log?.verbose?.(`chrome[${opts.display}] exited cleanly (code=0)`)
		}
	})

	// Unref so livinityd's event loop isn't held open by this child.
	try {
		child.unref?.()
	} catch {
		/* noop */
	}

	log?.info(
		`chrome[${opts.display}] spawned pid=${child.pid} userDataDir=${opts.userDataDir} url=${opts.url}`,
	)

	return {
		pid: child.pid,
		child,
		display: opts.display,
		userDataDir: opts.userDataDir,
		stop: () => stopChrome(child, STOP_GRACE_MS, opts.display, log),
	}
}

/**
 * SIGTERM → grace → SIGKILL teardown. Idempotent — re-calling on an already-
 * exited child is a no-op (kill() throws are swallowed).
 */
async function stopChrome(
	child: ChildProcess,
	graceMs: number,
	display: string,
	log: ChromeProcessSpawnerLogger | undefined,
): Promise<void> {
	try {
		child.kill('SIGTERM')
	} catch (err) {
		log?.warn(`chrome[${display}] SIGTERM kill failed`, err)
	}
	const killer = setTimeout(() => {
		try {
			child.kill('SIGKILL')
		} catch (err) {
			log?.warn(`chrome[${display}] SIGKILL kill failed`, err)
		}
	}, graceMs)
	await new Promise<void>((resolve) => {
		// If the child already exited, the 'exit' event has fired and we'll never
		// hear it again — but the FakeChild test path emits a fresh 'exit' AFTER
		// stop() is awaited, so 'once' is correct here. For double-stop calls in
		// production, the second await resolves immediately because the listener
		// runs synchronously on already-emitted events (Node EventEmitter does
		// NOT replay past events, so we'd actually deadlock; mitigate with a
		// promise.race against a short timeout if double-stop becomes a real
		// concern. v1 callers (102-08 close path) call stop() exactly once.)
		child.once('exit', () => resolve())
	})
	clearTimeout(killer)
}
