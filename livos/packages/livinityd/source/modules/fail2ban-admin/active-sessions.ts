/**
 * Phase 46 Plan 02 — active SSH session provider (mock-friendly DI).
 *
 * Wraps `who -u` with the same factory-pattern DI shape as client.ts. Tests
 * inject a fake `ExecFileFn`; production wires real `child_process.execFile`.
 *
 * Per pitfall B-19 + sub-issue #7 (PATTERNS.md): if `who` is missing on the
 * host (e.g., minimal container), this provider degrades to `[]` + warn,
 * NEVER throwing. Caller (routes.ts) merges this with the HTTP X-Forwarded-For
 * IP from the request to compute the admin's "active source IPs" set for
 * self-ban detection (B-02).
 *
 * Cellular-CGNAT consideration (B-19): the HTTP source IP and the SSH source
 * IP can differ when the admin is on cellular tethering. Routes.ts surfaces
 * BOTH and lets the operator opt-in to bypass the self-ban check via a
 * "cellularBypass" toggle.
 */

import {execFile as execFileCb} from 'node:child_process'
import {promisify} from 'node:util'

import type {ExecFileFn} from './client.js'
import {parseWhoOutput} from './parser.js'

const WHO_BINARY = 'who'
const WHO_TIMEOUT_MS = 5_000

export interface ActiveSshSession {
	user: string
	sourceIp: string | null
	since: Date | null
}

export interface ActiveSessionsProvider {
	listActiveSshSessions(): Promise<ActiveSshSession[]>
}

interface MinimalLogger {
	warn: (...args: unknown[]) => void
	error?: (...args: unknown[]) => void
}

/**
 * Build a provider backed by the given `execFile`. Optional logger is used
 * when `who` is unavailable (graceful degrade path — caller may pass a silent
 * logger in tests to avoid stderr noise).
 */
export function makeActiveSessionsProvider(
	execFile: ExecFileFn,
	logger: MinimalLogger = console,
): ActiveSessionsProvider {
	return {
		async listActiveSshSessions() {
			let stdout: string
			try {
				const r = await execFile(WHO_BINARY, ['-u'], {timeout: WHO_TIMEOUT_MS})
				stdout = r.stdout
			} catch (err) {
				const code = (err as {code?: string})?.code ?? ''
				if (code === 'ENOENT') {
					// Sub-issue #7: graceful degrade. Caller already handles `[]` (HTTP-only IP detection).
					logger.warn(
						'[fail2ban-active-sessions] `who` binary missing; returning empty session list',
					)
					return []
				}
				// Other errors (timeout, perm, etc.) — also degrade. SSH source IP is
				// best-effort enrichment; the HTTP X-Forwarded-For path in routes.ts is
				// always available as fallback for self-ban detection.
				logger.warn(
					'[fail2ban-active-sessions] `who -u` failed:',
					(err as Error)?.message || String(err),
				)
				return []
			}
			return parseWhoOutput(stdout)
		},
	}
}

// Production-wired provider — same execFile shim as client.ts (kept local to
// avoid circular import; trivial pure-passthrough adapter).
const execFileP = promisify(execFileCb)
const realExec: ExecFileFn = async (binary, args, opts) => {
	const r = await execFileP(binary, args, {timeout: opts.timeout, encoding: 'utf8'})
	return {stdout: r.stdout, stderr: r.stderr}
}
export const realActiveSessionsProvider: ActiveSessionsProvider =
	makeActiveSessionsProvider(realExec)
