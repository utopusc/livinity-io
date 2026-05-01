/**
 * Phase 46 Plan 02 — fail2ban-client wrapper (DI factory + structured errors).
 *
 * Pattern (per PATTERNS.md + pitfall W-20): exposes `makeFail2banClient(execFile)`
 * factory taking an injected `ExecFileFn`. Tests pass a fake; production wires
 * `realFail2banClient` to `node:util.promisify(execFile)`. NO test-double
 * module replacement of child_process; tests inject fakes via the factory.
 *
 * Defense-in-depth (per pitfall X-03 + threat T-46-04 / T-46-09):
 *   - Inputs are Zod-validated upstream (routes.ts in Plan 03) AND re-validated
 *     here BEFORE every `execFile` spawn. Spawn never receives an unchecked
 *     jail name or IP string.
 *   - args is always an array (NEVER a shell string). No `shell: true`.
 *   - Hardcoded BINARY_PATH (no PATH lookup) verified in 46-01-DIAGNOSTIC.md.
 *
 * Action-targeted unban (per pitfall B-01): `unbanIp` calls
 * `set <jail> unbanip <ip>` — NEVER `unban` (which would flush the entire
 * jail and re-cycle the admin's active session through fail2ban filter).
 *
 * Timeout (per pitfall M-07): 10s gives slack on slow Mini PC I/O peaks.
 *
 * Sacred file untouched: this module never imports nexus core; it lives
 * entirely under livinityd.
 */

import {execFile as execFileCb} from 'node:child_process'
import {promises as fs} from 'node:fs'
import {promisify} from 'node:util'

import {parseAuthLogForLastUser, parseJailList, parseJailStatus} from './parser.js'

// Verified against fail2ban 1.0.2-3ubuntu0.1 on Mini PC bruce@10.69.31.68 (2026-05-01)
// Captured live in .planning/phases/46-fail2ban-admin-panel/46-01-DIAGNOSTIC.md.
const BINARY_PATH = '/usr/bin/fail2ban-client'

// Per pitfall M-07: 5s is tight on slow Mini PC I/O peaks; 10s is the
// sweet-spot used by the Phase 45 broker subprocess timeouts.
const EXECFILE_TIMEOUT_MS = 10_000

// auth.log on Mini PC. Owner syslog:adm; livinityd is root → readable.
const AUTH_LOG_PATH = '/var/log/auth.log'

// Defense-in-depth validators (pre-spawn). Caller in routes.ts ALSO
// Zod-validates these — this is layer 2 (per X-03 / B-03 / T-46-09).
const JAIL_NAME_RE = /^[a-zA-Z0-9_.-]+$/
const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/

export type Fail2banErrorKind =
	| 'binary-missing'
	| 'service-down'
	| 'jail-not-found'
	| 'ip-invalid'
	| 'timeout'
	| 'parse-failed'
	| 'transient'

/**
 * Tagged error class — routes.ts discriminates on `.kind` to map to TRPC codes.
 * Mirrors the shape of livinity-broker's UpstreamHttpError (lines 18-27).
 */
export class Fail2banClientError extends Error {
	readonly kind: Fail2banErrorKind
	readonly stderr?: string
	constructor(message: string, kind: Fail2banErrorKind, stderr?: string) {
		super(message)
		this.name = 'Fail2banClientError'
		this.kind = kind
		this.stderr = stderr
	}
}

/**
 * The execFile contract this module depends on. Tests inject a fake; production
 * wires `promisify(child_process.execFile)`.
 */
export interface ExecFileFn {
	(
		binary: string,
		args: string[],
		opts: {timeout: number},
	): Promise<{stdout: string; stderr: string}>
}

/** Public surface consumed by routes.ts (Plan 03). */
export interface Fail2banClient {
	listJails(): Promise<string[]>
	getJailStatus(jail: string): Promise<{
		currentlyFailed: number
		totalFailed: number
		currentlyBanned: number
		totalBanned: number
		bannedIps: string[]
	}>
	unbanIp(jail: string, ip: string): Promise<void>
	banIp(jail: string, ip: string): Promise<void>
	addIgnoreIp(jail: string, ip: string): Promise<void>
	ping(): Promise<{healthy: boolean; reason?: 'binary-missing' | 'service-down'}>
	readAuthLogForLastUser(ip: string): Promise<string | null>
}

function assertJailName(j: string): void {
	if (typeof j !== 'string' || !JAIL_NAME_RE.test(j)) {
		throw new Fail2banClientError(`invalid jail name: ${String(j)}`, 'ip-invalid')
	}
}

function assertIp(ip: string): void {
	if (typeof ip !== 'string' || !IPV4_RE.test(ip)) {
		throw new Fail2banClientError(`invalid IP: ${String(ip)}`, 'ip-invalid')
	}
}

/**
 * Inspect a thrown value from execFile (or its DI fake) and convert to a
 * typed `Fail2banClientError`. Recognized cases:
 *   - `code === 'ENOENT'`            → binary-missing
 *   - `code === 'ETIMEDOUT'`         → timeout
 *   - stderr matches "Could not find server" → service-down (fail2ban-server down)
 *   - stderr matches "does not exist"        → jail-not-found
 *   - anything else → 'transient' (caller may retry / surface generic error)
 *
 * Re-throws unchanged when the input is already a Fail2banClientError (so
 * the inner `assertJailName` / `assertIp` ip-invalid throws survive the
 * outer try/catch around execFile).
 */
function wrapExecError(err: unknown): Fail2banClientError {
	if (err instanceof Fail2banClientError) return err

	const e = err as {code?: string; stderr?: string; message?: string}
	const code = e?.code ?? ''
	const stderr = (typeof e?.stderr === 'string' ? e.stderr : '') || ''
	const msg = e?.message || 'fail2ban-client subprocess failed'

	if (code === 'ENOENT') {
		return new Fail2banClientError('fail2ban-client binary not found', 'binary-missing')
	}
	if (code === 'ETIMEDOUT') {
		return new Fail2banClientError('fail2ban-client timed out', 'timeout')
	}
	if (stderr.includes('Could not find server')) {
		return new Fail2banClientError('fail2ban server is down', 'service-down', stderr)
	}
	if (stderr.includes('does not exist')) {
		return new Fail2banClientError('jail not found', 'jail-not-found', stderr)
	}
	return new Fail2banClientError(msg, 'transient', stderr)
}

/**
 * Build a Fail2banClient backed by the given `execFile`. Production wires the
 * real promisified `execFile`; tests wire a fake to capture argv shape.
 */
export function makeFail2banClient(execFile: ExecFileFn): Fail2banClient {
	async function spawn(args: string[]): Promise<{stdout: string; stderr: string}> {
		try {
			return await execFile(BINARY_PATH, args, {timeout: EXECFILE_TIMEOUT_MS})
		} catch (err) {
			throw wrapExecError(err)
		}
	}

	return {
		async listJails() {
			const {stdout} = await spawn(['status'])
			try {
				return parseJailList(stdout)
			} catch (err) {
				throw new Fail2banClientError(
					`failed to parse jail list: ${(err as Error).message}`,
					'parse-failed',
				)
			}
		},

		async getJailStatus(jail) {
			assertJailName(jail)
			const {stdout} = await spawn(['status', jail])
			try {
				return parseJailStatus(stdout)
			} catch (err) {
				throw new Fail2banClientError(
					`failed to parse jail status: ${(err as Error).message}`,
					'parse-failed',
				)
			}
		},

		async unbanIp(jail, ip) {
			// Defense-in-depth: validate BEFORE spawn (X-03 / T-46-09).
			assertJailName(jail)
			assertIp(ip)
			// Action-targeted unban (B-01). NEVER `unban` (global flush).
			await spawn(['set', jail, 'unbanip', ip])
		},

		async banIp(jail, ip) {
			assertJailName(jail)
			assertIp(ip)
			await spawn(['set', jail, 'banip', ip])
		},

		async addIgnoreIp(jail, ip) {
			// FR-F2B-02: per-jail ignoreip whitelist via `set <jail> addignoreip <ip>`.
			assertJailName(jail)
			assertIp(ip)
			await spawn(['set', jail, 'addignoreip', ip])
		},

		async ping() {
			try {
				await spawn(['status'])
				return {healthy: true}
			} catch (err) {
				if (err instanceof Fail2banClientError) {
					if (err.kind === 'binary-missing') {
						return {healthy: false, reason: 'binary-missing'}
					}
					if (err.kind === 'service-down') {
						return {healthy: false, reason: 'service-down'}
					}
				}
				// Unknown error → surface as binary-missing (most operationally useful
				// signal for the UI service-state banner per pitfall W-04). Service-down
				// path matched above; ENOENT path matched above. Anything else here is
				// a true diagnostic gap that the UI's "Refresh" path will retry.
				return {healthy: false, reason: 'binary-missing'}
			}
		},

		async readAuthLogForLastUser(ip) {
			// File read — not a fail2ban-client spawn. ENOENT/EACCES → null silently
			// (test rigs / non-Mini-PC dev hosts may not have /var/log/auth.log).
			try {
				assertIp(ip)
			} catch {
				return null
			}
			let content: string
			try {
				content = await fs.readFile(AUTH_LOG_PATH, 'utf8')
			} catch {
				return null
			}
			try {
				return parseAuthLogForLastUser(content, ip)
			} catch {
				return null
			}
		},
	}
}

// Production-wired client using the real child_process.execFile. With
// `encoding: 'utf8'` the promisified return is typed `{stdout: string,
// stderr: string}` — wrap once in the simpler ExecFileFn shape.
const execFileP = promisify(execFileCb)
const realExec: ExecFileFn = async (binary, args, opts) => {
	const r = await execFileP(binary, args, {timeout: opts.timeout, encoding: 'utf8'})
	return {stdout: r.stdout, stderr: r.stderr}
}
export const realFail2banClient: Fail2banClient = makeFail2banClient(realExec)
