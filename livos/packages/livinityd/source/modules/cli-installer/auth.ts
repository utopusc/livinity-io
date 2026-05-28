// Phase 240-01 Task 1 — `authCli` per-CLI canonical login spawn wrapper.
//
// Companion to `installCli` (Phase 239-01). After install completes the UI
// surfaces an "Auth" button; clicking it routes through cliInstaller.auth(name)
// which spawns the per-CLI canonical login command (e.g. `claude code login`,
// `opencode auth login`) in argv-array form (NO shell=true, NO interpolation).
//
// Drift-locks (vitest enforced):
//   - AUTH_TIMEOUT_MS === 300_000 (matches INSTALL_TIMEOUT_MS magnitude —
//     auth flows can include a one-time browser device-code paste).
//   - CLI_AUTH_COMMANDS has exactly 5 keys matching SUPPORTED_CLIS tuple.
//     aion-cli is null — auth is EXPLICITLY UNSUPPORTED upstream (Phase 239
//     verification found canonical sources unreachable). authCli short-circuits
//     to AUTH_UNSUPPORTED without spawning.
//
// Side-effects beyond spawn:
//   - Redis SET liv:cli:auth:<name> = 'running' (on dispatch), 'ok' | 'failed'
//     (on completion), TTL 3600s. The UI may poll this key for status.
//   - Optional auditLog DI seam writes one row to device_audit_log per attempt.

import {createHash} from 'node:crypto'
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'

import type {Redis} from 'ioredis'

import {SUPPORTED_CLIS_SET} from './install-scripts.js'
import type {CliName, InstallerLogger} from './types.js'

/** 5-minute auth timeout (drift-locked; same magnitude as INSTALL_TIMEOUT_MS). */
export const AUTH_TIMEOUT_MS = 300_000

const OUTPUT_CAP_BYTES = 32 * 1024
const REDIS_TTL_SECONDS = 3600

/**
 * Per-CLI canonical login argv. `null` = explicitly unsupported (no canonical
 * login command exists upstream — authCli short-circuits to AUTH_UNSUPPORTED).
 *
 * Phase 240-01 contract: exactly 5 keys matching SUPPORTED_CLIS. Drift-lock
 * test enforces shape.
 *
 *   claude-code → ['claude', ['code', 'login']]    // Phase 224 reference
 *   opencode    → ['opencode', ['auth', 'login']]  // Phase 195/196 reference
 *   gemini      → ['gemini',   ['auth', 'login']]  // best-effort
 *   openclaw    → ['openclaw', ['auth', 'login']]  // best-effort
 *   aion-cli    → null                             // EXPLICITLY UNSUPPORTED
 */
export const CLI_AUTH_COMMANDS: Readonly<
	Record<CliName, readonly [string, readonly string[]] | null>
> = {
	'claude-code': ['claude', ['code', 'login']],
	opencode: ['opencode', ['auth', 'login']],
	gemini: ['gemini', ['auth', 'login']],
	openclaw: ['openclaw', ['auth', 'login']],
	'aion-cli': null,
}

/**
 * Result of authCli — same shape as InstallResult plus `redisStatusKey` echo
 * so the UI can derive the poll-key without re-deriving the literal.
 */
export interface AuthResult {
	ok: boolean
	/** Combined stdout + stderr (last 32KB only). */
	output: string
	/** Process exit code; -1 on timeout / spawn-failure / AUTH_UNSUPPORTED. */
	exitCode: number
	/** Wall-clock ms from spawn start to exit/timeout. */
	durationMs: number
	/** `liv:cli:auth:<name>` — the key the UI may poll for live status. */
	redisStatusKey: string
}

/**
 * Optional auditLog DI seam. When provided, authCli invokes it ONCE on
 * completion with the structured row. Production wires this via
 * livinityd boot — see source/index.ts auditLogFactory.
 *
 * Shape mirrors device_audit_log columns (user_id + device_id are added by
 * the production auditLog implementation; this seam only carries the
 * tool-level fields). Plan 240-01 Task 3 wires `user_id` from
 * ctx.currentUser.id and `device_id = 'livinityd-trpc'`.
 */
export interface AuditLogRow {
	tool_name: 'cliInstaller.auth' | 'cliInstaller.install'
	params_digest: string
	success: boolean
	error: string | null
}

export type AuditLogFn = (row: AuditLogRow) => Promise<void>

/** DI surface — tests inject fake spawn/redis/auditLog; production uses real. */
export interface AuthCliDeps {
	logger: InstallerLogger
	/** Required: ioredis client (production passes this.ai.redis). */
	redis: Pick<Redis, 'set'>
	/**
	 * Optional spawn override (vitest injects a fake). When absent, the real
	 * `node:child_process` spawn is used.
	 */
	spawnFn?: typeof nodeSpawn
	/** Optional audit-log writer (production wires via auditLogFactory). */
	auditLog?: AuditLogFn
}

export interface AuthCliInput {
	name: CliName
}

/**
 * Combine accumulated stdout + stderr chunks into a single output string,
 * keeping at most the last OUTPUT_CAP_BYTES bytes (tail-truncation).
 */
function joinTail(chunks: Buffer[]): string {
	const total = Buffer.concat(chunks)
	const sliced =
		total.length > OUTPUT_CAP_BYTES ? total.subarray(total.length - OUTPUT_CAP_BYTES) : total
	return sliced.toString('utf8')
}

/** Compute SHA-256 hex digest of JSON.stringify({name}) — tamper-evidence marker. */
function paramsDigestFor(name: CliName): string {
	return createHash('sha256').update(JSON.stringify({name})).digest('hex')
}

/**
 * Fire the per-CLI canonical login command in a child process. Resolves
 * structured AuthResult — never throws on subprocess failure (only the
 * whitelist guard throws so the tRPC layer can map it to BAD_REQUEST).
 *
 * Lifecycle:
 *   1. Whitelist guard (D-239-07 RCE boundary).
 *   2. aion-cli short-circuit → AUTH_UNSUPPORTED (no spawn, no Redis write).
 *   3. Redis SET 'running' (best-effort; failure is non-fatal — logged).
 *   4. Spawn (argv-array form). On ENOENT → ===SPAWN-FAILED===.
 *   5. Timeout race: AUTH_TIMEOUT_MS → SIGKILL → ===TIMEOUT===.
 *   6. Redis SET 'ok' | 'failed' (best-effort).
 *   7. auditLog (when provided) called ONCE with the structured row.
 */
export async function authCli(
	input: AuthCliInput,
	deps: AuthCliDeps,
): Promise<AuthResult> {
	// 1. D-239-07 RCE BOUNDARY — whitelist guard MUST be first.
	if (!SUPPORTED_CLIS_SET.has(input.name)) {
		throw new Error(`CLI not in whitelist: ${String(input.name)}`)
	}

	const redisStatusKey = `liv:cli:auth:${input.name}`

	// 2. aion-cli short-circuit — no canonical login command upstream.
	const command = CLI_AUTH_COMMANDS[input.name]
	if (command === null) {
		const result: AuthResult = {
			ok: false,
			output:
				'AUTH_UNSUPPORTED: aion-cli has no canonical login command (Phase 239 found upstream unreachable)',
			exitCode: -1,
			durationMs: 0,
			redisStatusKey,
		}
		// Best-effort audit row even on short-circuit (operator visibility).
		if (deps.auditLog) {
			try {
				await deps.auditLog({
					tool_name: 'cliInstaller.auth',
					params_digest: paramsDigestFor(input.name),
					success: false,
					error: 'AUTH_UNSUPPORTED',
				})
			} catch (err) {
				deps.logger.warn(
					`[cli-installer] auditLog AUTH_UNSUPPORTED row failed for ${input.name}`,
					err,
				)
			}
		}
		return result
	}

	const spawn = deps.spawnFn ?? nodeSpawn
	const [bin, args] = command
	const startMs = Date.now()

	deps.logger.info(`[cli-installer] auth start: ${input.name} (${bin} ${args.join(' ')})`)

	// 3. Redis SET 'running' on dispatch (best-effort).
	try {
		await deps.redis.set(redisStatusKey, 'running', 'EX', REDIS_TTL_SECONDS)
	} catch (err) {
		deps.logger.warn(`[cli-installer] redis SET 'running' failed for ${input.name}`, err)
	}

	const result = await new Promise<AuthResult>((resolve) => {
		let settled = false
		const stdoutChunks: Buffer[] = []
		const stderrChunks: Buffer[] = []

		// 4. Argv-array spawn (no shell, no string interpolation).
		let child: ChildProcess
		try {
			child = spawn(bin, args as string[])
		} catch (spawnErr) {
			const durationMs = Date.now() - startMs
			deps.logger.error(
				`[cli-installer] auth spawn failed for ${input.name}`,
				spawnErr,
			)
			resolve({
				ok: false,
				output: `===SPAWN-FAILED=== ${spawnErr instanceof Error ? spawnErr.message : String(spawnErr)}`,
				exitCode: -1,
				durationMs,
				redisStatusKey,
			})
			return
		}

		const timeoutHandle = setTimeout(() => {
			if (settled) return
			settled = true
			try {
				child.kill('SIGKILL')
			} catch {
				/* swallow — best-effort kill */
			}
			const durationMs = Date.now() - startMs
			const tail = joinTail([...stdoutChunks, ...stderrChunks])
			deps.logger.warn(
				`[cli-installer] auth TIMEOUT after ${AUTH_TIMEOUT_MS}ms: ${input.name}`,
			)
			resolve({
				ok: false,
				output: `===TIMEOUT=== ${input.name} exceeded ${AUTH_TIMEOUT_MS}ms\n${tail}`,
				exitCode: -1,
				durationMs,
				redisStatusKey,
			})
		}, AUTH_TIMEOUT_MS)

		child.stdout?.on('data', (chunk: Buffer | string) => {
			stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
		})
		child.stderr?.on('data', (chunk: Buffer | string) => {
			stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
		})

		;(child as unknown as NodeJS.EventEmitter).on('exit', (code: number | null) => {
			if (settled) return
			settled = true
			clearTimeout(timeoutHandle)
			const exitCode = typeof code === 'number' ? code : -1
			const durationMs = Date.now() - startMs
			const output = joinTail([...stdoutChunks, ...stderrChunks])
			deps.logger.info(
				`[cli-installer] auth exit ${exitCode} for ${input.name} (${durationMs}ms)`,
			)
			resolve({
				ok: exitCode === 0,
				output,
				exitCode,
				durationMs,
				redisStatusKey,
			})
		})

		;(child as unknown as NodeJS.EventEmitter).on('error', (err: Error) => {
			if (settled) return
			settled = true
			clearTimeout(timeoutHandle)
			const durationMs = Date.now() - startMs
			deps.logger.error(`[cli-installer] auth child error for ${input.name}`, err)
			resolve({
				ok: false,
				output: `===CHILD-ERROR=== ${err.message}`,
				exitCode: -1,
				durationMs,
				redisStatusKey,
			})
		})
	})

	// 6. Redis SET 'ok' | 'failed' on completion (best-effort).
	try {
		await deps.redis.set(
			redisStatusKey,
			result.ok ? 'ok' : 'failed',
			'EX',
			REDIS_TTL_SECONDS,
		)
	} catch (err) {
		deps.logger.warn(
			`[cli-installer] redis SET final status failed for ${input.name}`,
			err,
		)
	}

	// 7. auditLog on completion (when provided).
	if (deps.auditLog) {
		try {
			await deps.auditLog({
				tool_name: 'cliInstaller.auth',
				params_digest: paramsDigestFor(input.name),
				success: result.ok,
				error: result.ok ? null : `exit=${result.exitCode}`,
			})
		} catch (err) {
			deps.logger.warn(
				`[cli-installer] auditLog row write failed for ${input.name}`,
				err,
			)
		}
	}

	return result
}
