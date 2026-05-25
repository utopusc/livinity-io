/**
 * Phase 206 — openclaw CLI spawner.
 *
 * Thin wrapper around `child_process.execFile` + `spawn` for calling the
 * `openclaw` binary (version 2026.5.20+) from livinityd. Used by both the
 * `openclaw-router.ts` tRPC procedures (one-shot JSON queries via execFile)
 * and the generic `auth-flow-service.ts` (long-running OAuth flows via spawn).
 *
 * Binary discovery (in order, Phase 208-03 R2 hardened):
 *   1. `override` arg if non-empty AND fs.existsSync
 *   2. `OPENCLAW_BINARY` env var (Phase 208-03 alias) — checked first
 *   3. `OPENCLAW_BIN` env var (legacy caller override; defense against tests)
 *   4. `/opt/livos/bin/openclaw` vendored shim (Phase 208-03 installer target)
 *   5. PATH lookup via `which openclaw`
 *   6. Fallback to `/opt/livos/node_modules/.pnpm/node_modules/.bin/openclaw`
 *      (verified live on Mini PC 2026-05-24 — pnpm hoisted .bin/openclaw)
 *   7. /usr/local/bin/openclaw, /usr/bin/openclaw, ~/.npm-global/bin/openclaw
 *   8. throw OpenclawNotInstalledError listing checked paths + installer hint
 *
 * Environment contract:
 *   Every spawned child MUST inherit `OPENCLAW_STATE_DIR` (default
 *   `/opt/livos/data/openclaw` per Phase 203 systemd contract) so the agent
 *   subprocess reads/writes the same state dir as the running gateway.
 *   `HOME=/home/bruce` is also preserved so the CLI's `~/.openclaw` fallback
 *   never re-creates a parallel state dir.
 *
 * INV-203-01 sacred SHA preserved (this is a NEW file — 0 protected blobs
 * touched).
 * INV-204-04 carry-forward — raw API keys NEVER cross logs at info level;
 * caller is responsible for redaction before any debug forwarding.
 */

import {
	execFile,
	spawn,
	execSync,
	type ChildProcessWithoutNullStreams,
} from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// ─── Typed errors ────────────────────────────────────────────────────────────

export class OpenclawNotInstalledError extends Error {
	readonly code = 'OPENCLAW_NOT_INSTALLED' as const
	constructor(
		message = 'openclaw CLI binary not found on PATH or in common install locations. ' +
			'Checked: /opt/livos/bin/openclaw, node_modules/.bin/openclaw, $PATH. ' +
			'Run scripts/install/install-openclaw-cli.sh to install (Phase 208-03 R2).',
	) {
		super(message)
		this.name = 'OpenclawNotInstalledError'
	}
}

export class OpenclawSpawnError extends Error {
	readonly code = 'OPENCLAW_SPAWN_FAILED' as const
	readonly cause?: unknown
	constructor(message: string, cause?: unknown) {
		super(message)
		this.name = 'OpenclawSpawnError'
		this.cause = cause
	}
}

export class OpenclawExecError extends Error {
	readonly code = 'OPENCLAW_EXEC_FAILED' as const
	readonly stderr?: string
	readonly exitCode?: number | null
	constructor(message: string, opts?: {stderr?: string; exitCode?: number | null}) {
		super(message)
		this.name = 'OpenclawExecError'
		this.stderr = opts?.stderr
		this.exitCode = opts?.exitCode
	}
}

export class OpenclawTimeoutError extends Error {
	readonly code = 'OPENCLAW_TIMEOUT' as const
	constructor(message = 'openclaw CLI call exceeded its timeout') {
		super(message)
		this.name = 'OpenclawTimeoutError'
	}
}

// ─── Binary discovery ────────────────────────────────────────────────────────

const DEFAULT_PNPM_FALLBACK =
	'/opt/livos/node_modules/.pnpm/node_modules/.bin/openclaw'

/**
 * Phase 208-03 — vendored binary shim path installed by
 * scripts/install/install-openclaw-cli.sh. Checked BEFORE PATH so a Mini PC
 * with a stale system `openclaw` can't shadow the workspace-pinned version.
 */
export const VENDORED_BIN_PATH = '/opt/livos/bin/openclaw'

/**
 * Resolve the `openclaw` binary path. Throws `OpenclawNotInstalledError`
 * when nothing is found. The error message names every path checked plus the
 * installer command so the operator knows the recovery action.
 *
 * Lookup order (Phase 208-03 R2 hardened):
 *   1. `override` arg
 *   2. `process.env.OPENCLAW_BINARY` (Phase 208-03 alias)
 *   3. `process.env.OPENCLAW_BIN` (legacy alias preserved for callers/tests)
 *   4. VENDORED_BIN_PATH = /opt/livos/bin/openclaw
 *   5. PATH lookup via `which openclaw`
 *   6. DEFAULT_PNPM_FALLBACK
 *   7. /usr/local/bin/openclaw, /usr/bin/openclaw, ~/.npm-global/bin/openclaw
 */
export function resolveOpenclawBinary(override?: string): string {
	if (override && fs.existsSync(override)) return override

	// Phase 208-03 — preferred env var name (matches docs); fall back to legacy.
	const envBinary = process.env.OPENCLAW_BINARY
	if (envBinary && fs.existsSync(envBinary)) return envBinary

	const envOverride = process.env.OPENCLAW_BIN
	if (envOverride && fs.existsSync(envOverride)) return envOverride

	// Phase 208-03 vendored-path fallback — checked BEFORE PATH so a stale
	// system-wide openclaw can't shadow the workspace-pinned version.
	try {
		if (fs.existsSync(VENDORED_BIN_PATH)) {
			fs.accessSync(VENDORED_BIN_PATH, fs.constants.X_OK)
			return VENDORED_BIN_PATH
		}
	} catch {
		// Vendored binary exists but is not executable (mode bits stripped?).
		// Fall through to PATH lookup so we don't return a non-runnable path.
	}

	const isWindows = process.platform === 'win32'
	const lookup = isWindows ? 'where openclaw' : 'which openclaw'
	try {
		const out = execSync(lookup, {stdio: ['ignore', 'pipe', 'ignore']})
			.toString()
			.trim()
		const first = out.split(/\r?\n/)[0]?.trim()
		if (first && fs.existsSync(first)) return first
	} catch {
		// Fall through.
	}

	const fallbacks = [
		DEFAULT_PNPM_FALLBACK,
		'/usr/local/bin/openclaw',
		'/usr/bin/openclaw',
		path.join(os.homedir(), '.npm-global', 'bin', 'openclaw'),
	]
	for (const candidate of fallbacks) {
		if (fs.existsSync(candidate)) return candidate
	}

	throw new OpenclawNotInstalledError()
}

// ─── Env builder ─────────────────────────────────────────────────────────────

const DEFAULT_OPENCLAW_STATE_DIR = '/opt/livos/data/openclaw'

/**
 * Build the env block passed to every openclaw child. Always sets
 * `OPENCLAW_STATE_DIR` (operator-locked SPEC constraint: Phase 206 must NEVER
 * spawn a CLI without this env var or the agent will read a different state
 * dir than the running gateway).
 */
export function buildOpenclawEnv(
	override?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
	const base = override ?? process.env
	return {
		...base,
		OPENCLAW_STATE_DIR:
			base.OPENCLAW_STATE_DIR ?? DEFAULT_OPENCLAW_STATE_DIR,
		// HOME defaults to bruce's home on Mini PC; allow override for tests.
		HOME: base.HOME ?? '/home/bruce',
		// Disable color output so JSON parsing doesn't trip on ANSI codes.
		NO_COLOR: '1',
	}
}

// ─── One-shot exec (for query procedures) ────────────────────────────────────

export interface ExecOpenclawCliOpts {
	args: string[]
	/** Default 10_000 ms. Operator-locked SPEC constraint. */
	timeoutMs?: number
	/** Binary path override (tests). */
	openclawBinaryPath?: string
	/** Env block override. */
	env?: NodeJS.ProcessEnv
}

export interface ExecOpenclawCliResult {
	stdout: string
	stderr: string
}

/**
 * Run an openclaw CLI subcommand and return its stdout+stderr. Throws on
 * non-zero exit. Argv is array-shaped — never invokes a shell (defense
 * against command injection per Phase 195 T-195-01-01 carry-forward).
 */
export async function execOpenclawCli(
	opts: ExecOpenclawCliOpts,
): Promise<ExecOpenclawCliResult> {
	const binary = resolveOpenclawBinary(opts.openclawBinaryPath)
	const timeoutMs = opts.timeoutMs ?? 10_000
	const env = buildOpenclawEnv(opts.env)

	return new Promise((resolve, reject) => {
		execFile(
			binary,
			opts.args,
			{
				timeout: timeoutMs,
				env,
				encoding: 'utf8',
				// Allow up to 16MB of output (the `capability model list` can be
				// 200+ lines × ~300 bytes; OpenRouter alone is 265 models).
				maxBuffer: 16 * 1024 * 1024,
			},
			(err, stdout, stderr) => {
				if (err) {
					if ((err as NodeJS.ErrnoException & {killed?: boolean}).killed) {
						reject(
							new OpenclawTimeoutError(
								`openclaw ${opts.args.join(' ')} exceeded ${timeoutMs}ms`,
							),
						)
						return
					}
					const errno = err as NodeJS.ErrnoException
					reject(
						new OpenclawExecError(
							`openclaw ${opts.args.join(' ')} exited with error: ${err.message}`,
							{
								stderr: typeof stderr === 'string' ? stderr : String(stderr ?? ''),
								exitCode:
									typeof errno.code === 'number' ? errno.code : null,
							},
						),
					)
					return
				}
				resolve({
					stdout: typeof stdout === 'string' ? stdout : String(stdout ?? ''),
					stderr: typeof stderr === 'string' ? stderr : String(stderr ?? ''),
				})
			},
		)
	})
}

// ─── JSON-lines parser ───────────────────────────────────────────────────────

/**
 * Parse openclaw's JSON-lines stdout output into an array. Tolerates both
 * shapes:
 *   - JSON-lines: one object per line
 *   - JSON array: a single bracketed array
 *
 * Lines that fail to parse are silently dropped (the alternative — throwing
 * — is worse UX because a single malformed line would invalidate the whole
 * response).
 */
export function parseJsonLines<T = unknown>(stdout: string): T[] {
	const trimmed = stdout.trim()
	if (!trimmed) return []

	// Single JSON array path
	if (trimmed.startsWith('[')) {
		try {
			const arr = JSON.parse(trimmed)
			return Array.isArray(arr) ? (arr as T[]) : []
		} catch {
			// Fall through to line-by-line.
		}
	}

	const out: T[] = []
	for (const line of trimmed.split(/\r?\n/)) {
		const ln = line.trim()
		if (!ln) continue
		try {
			out.push(JSON.parse(ln) as T)
		} catch {
			// Skip — non-JSON noise (banners, warnings).
		}
	}
	return out
}

/**
 * Parse openclaw's single-object JSON stdout (e.g. `capability model auth
 * status`). Returns the parsed object or throws OpenclawExecError if the
 * output is not valid JSON.
 */
export function parseJsonObject<T = unknown>(stdout: string): T {
	const trimmed = stdout.trim()
	try {
		return JSON.parse(trimmed) as T
	} catch (err) {
		throw new OpenclawExecError(
			'openclaw CLI returned non-JSON output where JSON was expected',
			{stderr: trimmed.slice(0, 500)},
		)
	}
}

// ─── Long-running spawn (for OAuth flows) ────────────────────────────────────

export interface SpawnOpenclawCliOpts {
	args: string[]
	onStdout: (chunk: string) => void
	onStderr?: (chunk: string) => void
	openclawBinaryPath?: string
	env?: NodeJS.ProcessEnv
}

export interface SpawnOpenclawCliResult {
	child: ChildProcessWithoutNullStreams
	/** Resolves on first stdout chunk; rejects with OpenclawSpawnError on early failure. */
	ready: Promise<void>
}

/**
 * Spawn an openclaw CLI subcommand with stdout/stderr callbacks. Used by
 * `auth-flow-service.ts` for the OAuth device-code flow which streams a URL
 * to stdout, waits for the user to complete in a browser, then exits 0 on
 * success.
 */
export function spawnOpenclawCli(
	opts: SpawnOpenclawCliOpts,
): SpawnOpenclawCliResult {
	const binary = resolveOpenclawBinary(opts.openclawBinaryPath)
	const env = buildOpenclawEnv(opts.env)

	// argv array, shell:false (default) — never invokes a shell.
	const child = spawn(binary, opts.args, {
		stdio: ['pipe', 'pipe', 'pipe'],
		env,
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
				reject(
					new OpenclawSpawnError(
						`Failed to spawn openclaw: ${err.message}`,
						err,
					),
				)
			}
		})

		child.on('exit', (code, signal) => {
			if (!sawStdout) {
				reject(
					new OpenclawSpawnError(
						`openclaw exited before any stdout (code=${code} signal=${signal})`,
					),
				)
			}
		})
	})

	return {child, ready}
}
