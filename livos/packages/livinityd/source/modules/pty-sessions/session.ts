/**
 * Phase 243-01 Task 2 — PtySession class wrapping node-pty.
 *
 * D-243-NO-ROOT (L-243-B) + R4 (Phase 252-02): start() THROWS synchronously
 *   if opts.username is root/uid-0 ('root' or '0'). Any non-root desktop user
 *   is allowed (the WS layer resolves it from `livos:desktop:user`). This is
 *   defense-in-depth backing the WS-layer auth check in Plan 243-02.
 *
 * R8 (Phase 252-02): the PTY spawns `bash --login` DIRECTLY — no self-`sudo`,
 *   no user-switch flag, no sudoers grant. livos.service already runs as the
 *   desktop user, so the spawned shell inherits the correct uid.
 *
 * MOTD bash literal copied verbatim from legacy `terminal-socket.ts` line 102:
 *   'if [ -f /etc/motd ]; then cat /etc/motd; fi; exec bash'
 *
 * Lazy spawn: constructor does NOT spawn; the caller (Plan 243-02 WS handler)
 *   invokes start() after validating auth + flag gate.
 *
 * Idempotent kill: second kill() is a no-op so WS-close races don't double-SIGHUP.
 */

import {EventEmitter} from 'node:events'
import pty from 'node-pty'
import {uuidv7} from 'uuidv7'

import type {PtySpawnOptions, SessionEventMap} from './types.js'

/** Minimal PTY surface — matches node-pty's IPty for the calls we use. */
export interface MinimalPty {
	onData(cb: (chunk: string) => void): void
	onExit(cb: (info: {exitCode: number; signal: string | null}) => void): void
	write(data: string): void
	resize(cols: number, rows: number): void
	kill(): void
}

/** Factory + DI seam — production default uses real node-pty. */
export interface PtySessionDeps {
	ptyFactory?: (
		file: string,
		args: string[],
		opts: {name: string; cols: number; rows: number; cwd?: string},
	) => MinimalPty
}

const DEFAULT_PTY_FACTORY: NonNullable<PtySessionDeps['ptyFactory']> = (
	file,
	args,
	opts,
) => pty.spawn(file, args, opts) as unknown as MinimalPty

/** MOTD bash literal — verbatim from legacy terminal-socket.ts. */
const MOTD_BASH_LITERAL =
	'if [ -f /etc/motd ]; then cat /etc/motd; fi; exec bash'

export class PtySession {
	readonly #sessionId: string
	readonly #opts: PtySpawnOptions
	readonly #ptyFactory: NonNullable<PtySessionDeps['ptyFactory']>
	readonly #emitter = new EventEmitter()
	#pty: MinimalPty | null = null
	#killed = false

	constructor(opts: PtySpawnOptions, deps: PtySessionDeps = {}) {
		this.#opts = opts
		this.#ptyFactory = deps.ptyFactory ?? DEFAULT_PTY_FACTORY
		this.#sessionId = uuidv7()
	}

	get sessionId(): string {
		return this.#sessionId
	}

	/**
	 * Spawn the underlying PTY. Throws synchronously if opts.username is
	 * root/uid-0 (D-243-NO-ROOT). Idempotent — second start() is a no-op.
	 */
	start(): void {
		if (this.#pty) {
			return
		}
		// R4 + D-243-NO-ROOT: reject root/uid-0 ONLY; any non-root desktop user
		// is allowed.
		if (this.#opts.username === 'root' || this.#opts.username === '0') {
			throw new Error(
				`pty-sessions: root/uid-0 username rejected (D-243-NO-ROOT): ${this.#opts.username}`,
			)
		}
		// R8(b): livos.service already runs as the desktop user, so spawn bash
		// --login directly — no self-`sudo`, no sudoers grant. The resolved
		// username is enforced by the WS-layer lookup (ws-handler) + this root
		// guard; we do NOT re-switch users here because the process is already
		// the correct uid.
		const argv = ['--login', '-c', MOTD_BASH_LITERAL]
		const factoryOpts: {
			name: string
			cols: number
			rows: number
			cwd?: string
		} = {
			name: 'xterm-color',
			cols: this.#opts.cols,
			rows: this.#opts.rows,
		}
		if (this.#opts.cwd !== undefined) {
			factoryOpts.cwd = this.#opts.cwd
		}
		const child = this.#ptyFactory('bash', argv, factoryOpts)
		this.#pty = child
		child.onData((chunk) => {
			this.#emitter.emit('data', chunk)
		})
		child.onExit((info) => {
			this.#emitter.emit('exit', info)
		})
	}

	on<E extends keyof SessionEventMap>(
		event: E,
		listener: SessionEventMap[E],
	): void {
		this.#emitter.on(event, listener as (...args: unknown[]) => void)
	}

	write(data: string): void {
		if (!this.#pty) {
			return
		}
		this.#pty.write(data)
	}

	resize(cols: number, rows: number): void {
		if (!this.#pty) {
			return
		}
		this.#pty.resize(cols, rows)
	}

	kill(): void {
		if (this.#killed) {
			return
		}
		this.#killed = true
		if (this.#pty) {
			this.#pty.kill()
		}
	}
}
