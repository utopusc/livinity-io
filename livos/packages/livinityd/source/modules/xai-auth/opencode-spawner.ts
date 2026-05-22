/**
 * Phase 195 Plan 01 Task 1 — opencode-spawner.ts
 *
 * Thin wrapper around `child_process.spawn()` that launches:
 *
 *     opencode auth login -p <provider> -m <method>
 *
 * The wrapper handles binary discovery (PATH lookup with fallbacks for common
 * install locations), shell-injection-safe argv passing (the shell flag is
 * never enabled — argv is array-shaped per T-195-01-01), and stdout/stderr
 * piping with optional callbacks.
 *
 * Typed errors are thrown for the failure modes the caller cares about:
 *   - `OpencodeNotInstalledError`  → binary not found anywhere on $PATH or
 *                                    in the well-known fallback locations
 *   - `OpencodeSpawnError`         → spawn itself failed (EACCES, ENOENT on
 *                                    the binary, etc.) before any stdout was
 *                                    seen
 *
 * Caller decides lifecycle: the spawner returns the live `ChildProcess` plus
 * a `ready` promise that resolves on first stdout chunk. The caller is
 * responsible for SIGTERM/SIGKILL escalation (see flow-service.ts).
 */

import {spawn, execSync, type ChildProcessWithoutNullStreams} from 'node:child_process'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs'

// ─── Typed errors ────────────────────────────────────────────────────────────

export class OpencodeNotInstalledError extends Error {
	readonly code = 'OPENCODE_NOT_INSTALLED' as const
	constructor(message = 'opencode CLI binary not found on PATH or in common install locations') {
		super(message)
		this.name = 'OpencodeNotInstalledError'
	}
}

export class OpencodeSpawnError extends Error {
	readonly code = 'OPENCODE_SPAWN_FAILED' as const
	readonly cause?: unknown
	constructor(message: string, cause?: unknown) {
		super(message)
		this.name = 'OpencodeSpawnError'
		this.cause = cause
	}
}

// ─── Binary discovery ────────────────────────────────────────────────────────

/**
 * Resolve the `opencode` binary path. Order:
 *   1. Caller-supplied `opencodeBinaryPath` (if exists on disk)
 *   2. PATH lookup via `which` (POSIX) / `where` (Windows)
 *   3. Common fallback locations
 *
 * Throws `OpencodeNotInstalledError` if no candidate exists.
 */
export function resolveOpencodeBinary(opencodeBinaryPath?: string): string {
	// 1. Explicit override
	if (opencodeBinaryPath && fs.existsSync(opencodeBinaryPath)) {
		return opencodeBinaryPath
	}

	// 2. PATH lookup
	const isWindows = process.platform === 'win32'
	const lookupCmd = isWindows ? 'where opencode' : 'which opencode'
	try {
		const stdout = execSync(lookupCmd, {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim()
		// `where` on Windows can return multiple lines; take the first.
		const firstLine = stdout.split(/\r?\n/)[0]?.trim()
		if (firstLine && fs.existsSync(firstLine)) {
			return firstLine
		}
	} catch {
		// Fall through to fallback list.
	}

	// 3. Fallback locations
	const fallbacks = [
		'/usr/local/bin/opencode',
		'/usr/bin/opencode',
		path.join(os.homedir(), '.npm-global', 'bin', 'opencode'),
		path.join(os.homedir(), '.local', 'share', 'opencode', 'bin', 'opencode'),
	]
	for (const candidate of fallbacks) {
		if (fs.existsSync(candidate)) return candidate
	}

	throw new OpencodeNotInstalledError()
}

// ─── Spawner ─────────────────────────────────────────────────────────────────

export interface SpawnOpencodeLoginOpts {
	provider: string
	method: string
	onStdout: (chunk: string) => void
	onStderr?: (chunk: string) => void
	opencodeBinaryPath?: string
	/** Optional environment override; defaults to process.env. */
	env?: NodeJS.ProcessEnv
}

export interface SpawnOpencodeLoginResult {
	child: ChildProcessWithoutNullStreams
	/** Resolves on first stdout chunk; rejects with OpencodeSpawnError if spawn errors before any stdout. */
	ready: Promise<void>
}

/**
 * Spawn `opencode auth login -p <provider> -m <method>` and pipe stdout/stderr
 * back to the caller via callbacks.
 *
 * The shell flag is NEVER enabled — argv is passed as an array, so command
 * injection via the `provider`/`method` strings is structurally impossible
 * (T-195-01-01).
 *
 * The returned `ready` promise resolves on first stdout chunk, which is the
 * caller's signal that the child is alive and producing output. If the child
 * emits `error` before any stdout (binary missing on PATH, EACCES, etc.), the
 * `ready` promise rejects with `OpencodeSpawnError`.
 */
export function spawnOpencodeLogin(opts: SpawnOpencodeLoginOpts): SpawnOpencodeLoginResult {
	const binary = resolveOpencodeBinary(opts.opencodeBinaryPath)
	// argv is an array — `shell` flag is omitted (defaults to false). Defense
	// in depth against T-195-01-01 even though provider/method come from our
	// own code paths.
	const child = spawn(binary, ['auth', 'login', '-p', opts.provider, '-m', opts.method], {
		stdio: ['pipe', 'pipe', 'pipe'],
		env: opts.env ?? {...process.env},
	}) as ChildProcessWithoutNullStreams

	let sawStdout = false

	const ready = new Promise<void>((resolve, reject) => {
		child.stdout.setEncoding('utf8')
		child.stdout.on('data', (chunk: string) => {
			if (!sawStdout) {
				sawStdout = true
				resolve()
			}
			opts.onStdout(chunk)
		})

		if (opts.onStderr) {
			child.stderr.setEncoding('utf8')
			child.stderr.on('data', opts.onStderr)
		}

		child.on('error', (err) => {
			if (!sawStdout) {
				reject(new OpencodeSpawnError(`Failed to spawn opencode: ${err.message}`, err))
			}
		})

		// If the child exits before stdout (e.g. immediate crash), surface as spawn error.
		child.on('exit', (code, signal) => {
			if (!sawStdout) {
				reject(
					new OpencodeSpawnError(
						`opencode exited before producing stdout (code=${code} signal=${signal})`,
					),
				)
			}
		})
	})

	return {child, ready}
}
