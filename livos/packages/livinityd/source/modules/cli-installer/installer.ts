// Phase 239-01 Task 1 — `installCli` spawn wrapper.
//
// Whitelist-gated (D-239-07 RCE boundary) bash invocation of the matching
// `scripts/install/cli/<name>.sh` install script. Captures stdout + stderr
// (capped at 32KB tail), enforces a 5-minute SIGKILL timeout, and resolves
// to a structured InstallResult. Never throws on subprocess failure — only
// the whitelist guard throws (so the tRPC layer can map it to BAD_REQUEST).

import {createHash} from 'node:crypto'
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'

import type {AuditLogFn} from './auth.js'
import {resolveInstallScript, SUPPORTED_CLIS_SET} from './install-scripts.js'
import type {CliName, InstallResult, InstallerLogger} from './types.js'

/** 5-minute install timeout (D-239-09 / drift-lock constant). */
export const INSTALL_TIMEOUT_MS = 300_000

const OUTPUT_CAP_BYTES = 32 * 1024

/** DI surface — tests inject a fake `spawn`; production uses node:child_process. */
export interface InstallCliDeps {
	logger: InstallerLogger
	/**
	 * Optional spawn override (vitest injects a fake). When absent, the real
	 * `node:child_process` spawn is used.
	 */
	spawnFn?: typeof nodeSpawn
	/**
	 * Phase 240-01 — Optional audit-log writer. When provided, installCli
	 * invokes it ONCE on completion with a structured row (tool_name =
	 * 'cliInstaller.install', SHA-256 params_digest of {name}, success,
	 * error). Failure to write is logged warn-level and never reflected to
	 * the caller — audit observability MUST NEVER block the functional path.
	 */
	auditLog?: AuditLogFn
}

export interface InstallCliInput {
	name: CliName
}

/**
 * Combine accumulated stdout + stderr chunks into a single output string,
 * keeping at most the last OUTPUT_CAP_BYTES bytes.
 */
function joinTail(chunks: Buffer[]): string {
	const total = Buffer.concat(chunks)
	const sliced = total.length > OUTPUT_CAP_BYTES ? total.subarray(total.length - OUTPUT_CAP_BYTES) : total
	return sliced.toString('utf8')
}

/**
 * Spawn `bash <scriptPath>` (argv-array form — NO shell=true, NO string
 * interpolation; the script path is computed from the enum-constrained
 * CLI name so user input can never reach the shell verbatim).
 *
 * Resolves on either subprocess exit OR after INSTALL_TIMEOUT_MS, whichever
 * comes first. On timeout the child receives SIGKILL and the result carries
 * a `===TIMEOUT===` marker plus exitCode=-1.
 */
export async function installCli(
	input: InstallCliInput,
	deps: InstallCliDeps,
): Promise<InstallResult> {
	// D-239-07 RCE BOUNDARY — whitelist guard MUST be the very first thing,
	// before any path resolution or subprocess call.
	if (!SUPPORTED_CLIS_SET.has(input.name)) {
		throw new Error(`CLI not in whitelist: ${String(input.name)}`)
	}

	const spawn = deps.spawnFn ?? nodeSpawn
	const scriptPath = resolveInstallScript(input.name)
	const startMs = Date.now()

	deps.logger.info(`[cli-installer] install start: ${input.name} (${scriptPath})`)

	const result = await new Promise<InstallResult>((resolve) => {
		let settled = false
		const stdoutChunks: Buffer[] = []
		const stderrChunks: Buffer[] = []

		// Argv-array form — defense against shell injection: the script path
		// is enum-constrained and never concatenated with user input.
		let child: ChildProcess
		try {
			child = spawn('bash', [scriptPath])
		} catch (spawnErr) {
			// Spawn itself failed (binary missing, EACCES…). Treat as a
			// non-throw structured failure so the tRPC mutation can render
			// the error in the UI.
			const durationMs = Date.now() - startMs
			deps.logger.error(
				`[cli-installer] spawn failed for ${input.name}`,
				spawnErr,
			)
			resolve({
				ok: false,
				output: `===SPAWN-FAILED=== ${spawnErr instanceof Error ? spawnErr.message : String(spawnErr)}`,
				exitCode: -1,
				durationMs,
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
				`[cli-installer] install TIMEOUT after ${INSTALL_TIMEOUT_MS}ms: ${input.name}`,
			)
			resolve({
				ok: false,
				output: `===TIMEOUT=== ${input.name} exceeded ${INSTALL_TIMEOUT_MS}ms\n${tail}`,
				exitCode: -1,
				durationMs,
			})
		}, INSTALL_TIMEOUT_MS)

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
				`[cli-installer] install exit ${exitCode} for ${input.name} (${durationMs}ms)`,
			)
			resolve({
				ok: exitCode === 0,
				output,
				exitCode,
				durationMs,
			})
		})

		;(child as unknown as NodeJS.EventEmitter).on('error', (err: Error) => {
			if (settled) return
			settled = true
			clearTimeout(timeoutHandle)
			const durationMs = Date.now() - startMs
			deps.logger.error(
				`[cli-installer] child error for ${input.name}`,
				err,
			)
			resolve({
				ok: false,
				output: `===CHILD-ERROR=== ${err.message}`,
				exitCode: -1,
				durationMs,
			})
		})
	})

	// Phase 240-01 — auditLog hook on completion (when provided). Failures
	// are warn-logged but never reflected to the caller (defense-in-depth:
	// audit observability MUST NEVER block the functional path).
	if (deps.auditLog) {
		try {
			await deps.auditLog({
				tool_name: 'cliInstaller.install',
				params_digest: createHash('sha256')
					.update(JSON.stringify({name: input.name}))
					.digest('hex'),
				success: result.ok,
				error: result.ok ? null : `exit=${result.exitCode}`,
			})
		} catch (err) {
			deps.logger.warn(
				`[cli-installer] auditLog install row failed for ${input.name}`,
				err,
			)
		}
	}

	return result
}
