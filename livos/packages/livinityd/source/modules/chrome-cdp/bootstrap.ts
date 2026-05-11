/**
 * Phase 101-01 — bootstrapChrome.
 *
 * Spawns the singleton Chrome with CDP enabled at livinityd boot. Polls
 * `http://localhost:9222/json/version` until 200 OK (or the ready-timeout
 * elapses), then returns `{pid, child}`. The child is kept around so the
 * livinityd lifecycle (and tests) can SIGKILL on shutdown.
 *
 * Owns:
 *   - The Chrome process argv (CHROME_ARGS), including the T-101-01 mitigation
 *     `--remote-debugging-address=127.0.0.1` (bind CDP to loopback only).
 *   - stderr tail (last 50 lines) dumped to logger.error on non-zero exit.
 *     Mirror of `vnc-bridge.ts` pattern (D-99-07).
 *   - Ready-poll loop on `/json/version` with configurable interval +
 *     timeout. SIGKILL on timeout — no half-alive Chrome left behind.
 *
 * Does NOT own:
 *   - CDP connection — that's `ChromeCdpClient` (client.ts).
 *   - Reconnect on Chrome crash — that's a future Plan 101-04+ concern
 *     (the bootstrap helper returns once and is not respawn-aware).
 *
 * RESEARCH correction #1 (101-RESEARCH.md §Summary): the spawn argv lists
 * `--remote-debugging-port=9222` and `--remote-debugging-address=127.0.0.1`
 * as two separate flags. The second flag is the T-101-01 mitigation — even
 * if a misconfigured firewall opened :9222 the CDP socket refuses non-loopback
 * sources.
 *
 * Sacred SHA gate: liv/packages/core/src/sdk-agent-runner.ts MUST equal
 * f3538e1d811992b782a9bb057d1b7f0a0189f95f before AND after every commit.
 */

import {
	spawn as nodeSpawn,
	type ChildProcess,
	type SpawnOptions,
} from 'node:child_process'

/** Thrown when `/json/version` does not return 200 within `readyTimeoutMs`.
 *  Caller is expected to log + degrade (livinityd.start() catches this and
 *  keeps the rest of the boot going — Pillar A is offline but the rest of
 *  the daemon stays up). */
export class ChromeBootstrapTimeoutError extends Error {
	code = 'CHROME_BOOTSTRAP_TIMEOUT'
	constructor(public timeoutMs: number) {
		super(`chrome bootstrap timeout after ${timeoutMs}ms`)
	}
}

export interface ChromeBootstrapHandle {
	pid: number
	child: ChildProcess
}

/**
 * Canonical Chrome argv. Pinned in source (not env-derived) so the spawn
 * surface is auditable.
 *
 *   --remote-debugging-port=9222
 *     CDP socket port. Standard.
 *
 *   --remote-debugging-address=127.0.0.1
 *     T-101-01 mitigation. Bind CDP to loopback ONLY. Without this, Chrome
 *     listens on 0.0.0.0:9222 and any host that can route to the Mini PC
 *     could drive arbitrary CDP commands (info-disclosure + elevation).
 *
 *   --user-data-dir=/home/bruce/.config/livos-chrome
 *     D-101-SHARED-PROFILE. Single profile for ALL WebApps; same Google
 *     login (lucyfeilu123@gmail.com per CLAUDE.md memory).
 *
 *   --no-first-run, --no-default-browser-check, --no-sandbox
 *     Boot quietly under the `bruce` user. No-sandbox avoids the chroot
 *     setuid helper which doesn't exist in the LivOS env.
 *
 *   --disable-features=ChromeWhatsNewUI,TranslateUI,InfoBars
 *   --disable-infobars
 *   --test-type
 *     Suppress "unsupported flag" infobar + WhatsNewUI dialog — they steal
 *     focus on first launch.
 *
 *   --new-window=about:blank
 *     Open a single shell window so the process has something to render
 *     until the first WebApp click. The shell is minimized post-boot via
 *     ChromeCdpClient.minimizeWindow().
 */
const CHROME_ARGS: readonly string[] = [
	'--remote-debugging-port=9222',
	'--remote-debugging-address=127.0.0.1',
	'--user-data-dir=/home/bruce/.config/livos-chrome',
	'--no-first-run',
	'--no-default-browser-check',
	'--no-sandbox',
	'--disable-features=ChromeWhatsNewUI,TranslateUI,InfoBars',
	'--disable-infobars',
	'--test-type',
	'--new-window=about:blank',
]

type SpawnFn = (cmd: string, args: string[], opts?: SpawnOptions) => ChildProcess
type FetchFn = typeof fetch

export type BootstrapLogger = {
	info: (msg: string) => void
	warn: (msg: string) => void
	error: (msg: string) => void
	verbose?: (msg: string) => void
}

export interface BootstrapOpts {
	/** X display. Defaults to `:1` (the 100-08-01 singleton on Mini PC). */
	display?: string
	/** Chrome binary path. Defaults to `google-chrome` (Ubuntu apt package). */
	chromeBinary?: string
	/** Injectable spawn fn — tests pass FakeChild factory. */
	spawnFn?: SpawnFn
	/** Injectable fetch fn — tests sequence /json/version responses. */
	fetchFn?: FetchFn
	/** Total deadline for ready-poll. Default 10s. */
	readyTimeoutMs?: number
	/** Backoff between /json/version probes. Default 200ms. */
	pollIntervalMs?: number
	/** Optional structured logger; if absent, only console output via
	 *  inherited stderr is emitted on crash. */
	logger?: BootstrapLogger
}

/**
 * Spawn Chrome with CDP and wait for `/json/version` to return 200.
 *
 * On success: resolves with `{pid, child}`. The caller owns the child for
 * teardown (e.g. SIGKILL on livinityd.stop()).
 *
 * On timeout: SIGKILLs the child and throws ChromeBootstrapTimeoutError.
 * The stderr tail (last 50 lines) was already captured + emitted via the
 * `child.on('exit')` handler if Chrome crashed during the poll.
 */
export async function bootstrapChrome(
	opts: BootstrapOpts = {},
): Promise<ChromeBootstrapHandle> {
	const display = opts.display ?? ':1'
	const bin = opts.chromeBinary ?? 'google-chrome'
	const spawnFn: SpawnFn = opts.spawnFn ?? (nodeSpawn as SpawnFn)
	const fetchFn: FetchFn = opts.fetchFn ?? fetch
	const timeoutMs = opts.readyTimeoutMs ?? 10_000
	const pollInterval = opts.pollIntervalMs ?? 200
	const log = opts.logger

	const child = spawnFn(bin, [...CHROME_ARGS], {
		env: {...process.env, DISPLAY: display},
		detached: false,
		stdio: ['ignore', 'ignore', 'pipe'],
	})

	// D-99-07 — stderr tail diagnostic. Same shape as vnc-bridge.ts. Keep
	// the last 50 lines, dump on non-zero exit. Verbose listener lets us
	// stream stderr to the logger live when --log-level=verbose.
	const stderrTail: string[] = []
	child.stderr?.on('data', (chunk: Buffer) => {
		const line = chunk.toString('utf-8').trim()
		if (!line) return
		log?.verbose?.(`chrome stderr: ${line}`)
		stderrTail.push(line)
		if (stderrTail.length > 50) stderrTail.shift()
	})
	child.on('exit', (code, signal) => {
		if (code !== 0 && code !== null) {
			const tail =
				stderrTail.length > 0
					? `\n--- chrome stderr (last ${stderrTail.length}) ---\n${stderrTail.join('\n')}`
					: ' (no stderr captured)'
			log?.error(
				`chrome process exited code=${code} signal=${signal}${tail}`,
			)
		}
	})

	const start = Date.now()
	while (Date.now() - start < timeoutMs) {
		try {
			const r = await fetchFn('http://localhost:9222/json/version')
			if (r.ok) {
				log?.info(
					`chrome-cdp: ready after ${Date.now() - start}ms pid=${child.pid}`,
				)
				return {pid: child.pid as number, child}
			}
		} catch {
			/* expected during boot — Chrome takes 100-500ms to open the socket */
		}
		await new Promise((r) => setTimeout(r, pollInterval))
	}
	try {
		child.kill('SIGKILL')
	} catch {
		/* noop — child may have already exited */
	}
	throw new ChromeBootstrapTimeoutError(timeoutMs)
}
