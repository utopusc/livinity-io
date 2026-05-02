/**
 * Phase 48 Plan 48-01 — journalctl streaming module (FR-SSH-01).
 *
 * Wraps a long-running `journalctl -u ssh -o json --follow --since "1 hour ago"`
 * subprocess. Mirrors the DI factory pattern from `fail2ban-admin/active-sessions.ts`
 * (per pitfall W-20 — tests inject a fake `SpawnFn`; production wires `node:child_process.spawn`).
 *
 * Key differences from `active-sessions.ts`:
 *   - `journalctl --follow` is long-running, NOT a single execFile. Hence `spawn`
 *     (NOT `execFile`) and a `subscribe(listener) → unsubscribe` fan-out shape.
 *   - ENOENT degrades to `onMissing()` callback (NOT empty list). Caller in
 *     `ws-handler.ts` translates that to WS close 4404 (binary missing).
 *
 * D-NO-NEW-DEPS upheld:
 *   - Built-in `node:child_process.spawn` only. No new third-party deps.
 *   - IP extraction is plain regex on MESSAGE — NO geo-IP enrichment in v29.4
 *     (deferred to v30+ per `v29.4-STACK.md`).
 *
 * D-NO-SERVER4 upheld:
 *   - Mini PC only.
 */

import {spawn as realSpawn} from 'node:child_process'

/**
 * Wire shape of one journalctl event after parsing + IP extraction.
 *
 * `timestamp` is the verbatim `__REALTIME_TIMESTAMP` string from journalctl
 * (microseconds-since-epoch). UI converts via `Number(ts) / 1000` for ms-precision
 * Date — but the wire keeps the string to dodge JS-number-precision concerns at
 * 2^53+ microseconds (~year 2255 — defensive but cheap).
 *
 * `ip` is null when MESSAGE has no `from <ipv4>` pattern (e.g., pam session lines).
 * Rows without an IP STILL emit so operators see context — they're just non-clickable
 * in the UI (Plan 48-02).
 */
export interface SshSessionEvent {
	timestamp: string
	message: string
	ip: string | null
	hostname?: string
}

/**
 * The spawn contract this module depends on. Tests inject a fake; production
 * wires the adapter at the bottom of this file (`realJournalctlStream`).
 *
 * Shape is the minimal subset of `child_process.ChildProcess` that makes
 * unit testing easy without dragging in the full ChildProcess type.
 */
export interface SpawnFn {
	(binary: string, args: string[]): {
		stdout: NodeJS.ReadableStream
		stderr: NodeJS.ReadableStream
		on(event: 'error' | 'exit' | 'close', listener: (...args: any[]) => void): void
		kill(signal?: string): void
	}
}

export interface JournalctlStream {
	/** Per-listener subscribe — caller (ws-handler) attaches one. Returns unsubscribe. */
	subscribe(listener: (ev: SshSessionEvent) => void): () => void
	/** Stop the spawned process — called when the last subscriber disconnects. */
	stop(): void
}

export interface MakeStreamOptions {
	/** ENOENT — `journalctl` binary missing on host; ws-handler closes WS with 4404. */
	onMissing?: () => void
	/** Subprocess exited (any reason). ws-handler invalidates the shared state. */
	onExit?: (code: number | null, signal: string | null) => void
	logger?: {
		// Both fields optional so this is structurally compatible with the
		// livinityd workspace logger (no `warn`, stricter signatures) AND with
		// `console` (has both, looser signatures). First arg is the human-readable
		// message; trailing args may be error objects / context.
		warn?: (message: string, ...args: unknown[]) => void
		error?: (message: string, ...args: unknown[]) => void
	}
}

function logWarn(
	logger: MakeStreamOptions['logger'] | undefined,
	message: string,
	...args: unknown[]
): void {
	if (!logger) return
	if (typeof logger.warn === 'function') logger.warn(message, ...args)
	else if (typeof logger.error === 'function') logger.error(message, ...args)
}

/**
 * Pure helper — exported so tests can drive it directly.
 *
 * Regex matches both Failed-password ("Failed password ... from <IP>") AND
 * Accepted-publickey ("Accepted publickey ... from <IP>") forms — and any other
 * "from <IP>" pattern sshd emits (Disconnected, Invalid user, etc.).
 *
 * Returns null when no match. IPv4 only for v29.4 (IPv6 deferred — same scope as
 * Phase 46 `ipSchema`, also IPv4-only).
 */
export function extractIp(message: string): string | null {
	const m = message.match(/\bfrom\s+(\d{1,3}(?:\.\d{1,3}){3})\b/)
	return m ? m[1] : null
}

const NO_OP_STREAM: JournalctlStream = {
	subscribe: () => () => {},
	stop: () => {},
}

/**
 * Build a journalctl stream backed by the given `spawn`. Tests inject a fake
 * SpawnFn; production wires `realJournalctlStream`.
 *
 * Lifecycle:
 *   1. spawn `journalctl -u ssh -o json --follow --since "1 hour ago"`.
 *   2. `stdout` is line-buffered. Each '\n'-terminated line is JSON.parsed.
 *      Malformed lines are dropped silently (mid-flush partials).
 *   3. Defensive `_SYSTEMD_UNIT === 'ssh.service'` filter even though `-u ssh`
 *      already gates at journalctl level.
 *   4. Each parsed event is fanned out to every subscriber. Listener throws
 *      are caught + logged so one bad subscriber doesn't tear down the rest.
 *   5. `error` event with `code === 'ENOENT'` invokes `opts.onMissing` (NOT throw).
 */
export function makeJournalctlStream(
	spawn: SpawnFn,
	opts: MakeStreamOptions = {},
): JournalctlStream {
	const listeners = new Set<(ev: SshSessionEvent) => void>()
	let buffer = ''
	let stopped = false
	let child: ReturnType<SpawnFn> | null = null

	try {
		child = spawn('journalctl', [
			'-u',
			'ssh',
			'-o',
			'json',
			'--follow',
			'--since',
			'1 hour ago',
		])
	} catch (err) {
		// Synchronous spawn failure (extremely rare — usually emits 'error' event instead).
		const code = (err as {code?: string})?.code ?? ''
		if (code === 'ENOENT') opts.onMissing?.()
		logWarn(opts.logger, '[ssh-sessions] spawn failed:', (err as Error)?.message || err)
		return NO_OP_STREAM
	}

	child.on('error', (err: NodeJS.ErrnoException) => {
		if (err?.code === 'ENOENT') {
			opts.onMissing?.()
			return
		}
		logWarn(opts.logger, '[ssh-sessions] journalctl error:', err?.message || err)
	})

	child.on('exit', (code: number | null, signal: string | null) => {
		opts.onExit?.(code, signal)
	})

	child.stdout.on('data', (chunk: Buffer | string) => {
		buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
		let nl: number
		while ((nl = buffer.indexOf('\n')) !== -1) {
			const line = buffer.slice(0, nl).trim()
			buffer = buffer.slice(nl + 1)
			if (!line) continue
			let parsed: Record<string, unknown>
			try {
				parsed = JSON.parse(line)
			} catch {
				// Malformed mid-flush — skip silently.
				continue
			}
			// Defensive — `-u ssh` already gates at journalctl level, but if a row sneaks
			// through with a different unit (e.g., journal merge edge case), drop it.
			if (
				typeof parsed._SYSTEMD_UNIT === 'string' &&
				parsed._SYSTEMD_UNIT !== 'ssh.service'
			) {
				continue
			}
			const message = typeof parsed.MESSAGE === 'string' ? parsed.MESSAGE : ''
			const ts =
				typeof parsed.__REALTIME_TIMESTAMP === 'string'
					? parsed.__REALTIME_TIMESTAMP
					: String(Date.now() * 1000)
			const ev: SshSessionEvent = {
				timestamp: ts,
				message,
				ip: extractIp(message),
				hostname:
					typeof parsed._HOSTNAME === 'string' ? parsed._HOSTNAME : undefined,
			}
			for (const listener of listeners) {
				try {
					listener(ev)
				} catch (lerr) {
					logWarn(opts.logger, '[ssh-sessions] listener throw:', lerr)
				}
			}
		}
	})

	return {
		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		stop() {
			if (stopped) return
			stopped = true
			listeners.clear()
			try {
				child?.kill('SIGTERM')
			} catch {
				// already dead — ignore
			}
		},
	}
}

/**
 * Production-wired journalctl stream factory. Uses real
 * `node:child_process.spawn` with `stdio: ['ignore', 'pipe', 'pipe']`.
 *
 * Caller (ws-handler) passes `onMissing` to handle ENOENT (binary missing)
 * gracefully — closes the WS with code 4404 instead of crashing livinityd.
 */
export function realJournalctlStream(
	opts: MakeStreamOptions = {},
): JournalctlStream {
	const adapter: SpawnFn = (binary, args) => {
		const c = realSpawn(binary, args, {stdio: ['ignore', 'pipe', 'pipe']})
		return {
			stdout: c.stdout!,
			stderr: c.stderr!,
			on: (event, listener) => {
				c.on(event, listener)
			},
			kill: (sig?: string) => {
				c.kill(sig as NodeJS.Signals | undefined)
			},
		}
	}
	return makeJournalctlStream(adapter, opts)
}
