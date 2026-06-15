/**
 * Phase 196-05 — server-side timezone service.
 *
 * Two-layer defense for `sudo /usr/bin/timedatectl set-timezone <zone>`:
 *
 *   1. `validate(zone)` — resolve-check via `new Intl.DateTimeFormat('en-US',
 *      {timeZone: zone})`. The constructor throws `RangeError` on any zone the
 *      ICU/tz database does not recognize, so a successful construction is the
 *      authoritative "this is a real IANA zone" signal. We deliberately do NOT
 *      use `Intl.supportedValuesOf('timeZone')` set-membership: that list omits
 *      backward-compat IANA *links* such as `America/Indiana/Indianapolis` and
 *      `America/Kentucky/Louisville` (the split-state county zones the
 *      countrystatecity dataset ships), which the old check WRONGLY rejected.
 *      The DateTimeFormat resolve accepts every zone timedatectl will accept.
 *      Returns false on empty / undefined / non-string / unknown / shell-
 *      metacharacter input (the latter trivially because such strings throw).
 *
 *   2. `setSystemTimezone(zone)` — re-validates BEFORE shelling out
 *      (defense-in-depth: even if a caller bypasses zod the Intl gate
 *      still fires). Uses `execFile`, never the unsafe alternatives
 *      (no `child_process.exec`, no spawn with shell-true) — argv is a
 *      literal string array so no shell metacharacter interpretation
 *      can splice extra arguments.
 *
 * The narrow `Cmnd_Alias LIVINITYD_TIMEDATECTL = /usr/bin/timedatectl
 * set-timezone *` in scripts/install/sudoers.d/livinityd (extended in
 * this same plan, atomic with the sacred-shas-v38.json re-pin)
 * guarantees that even a successful Intl bypass cannot escalate beyond
 * the set-timezone sub-command.
 *
 * Threat model:
 *   - T-196-05-01 Tampering: Intl validate + execFile (argv-array) — see
 *     timezone-service.test.ts T6 + T8 for the regression-lock.
 *   - T-196-05-02 EoP: sudoers Cmnd_Alias narrow to set-timezone only.
 *   - T-196-05-05 DoS: 10s execFile timeout caps any pathological invocation.
 */

import {execFile as nodeExecFile, type ExecFileException} from 'node:child_process'

// ─── Typed error ────────────────────────────────────────────────────────────

/**
 * Thrown when the caller hands `setSystemTimezone` a zone that the
 * `Intl.DateTimeFormat` resolve does not recognize. This is the gate that
 * fires BEFORE execFile so no shell-flavoured input ever reaches the sudo
 * command line.
 */
export class InvalidTimezoneError extends Error {
	readonly code = 'INVALID_TIMEZONE' as const
	readonly zone: string
	constructor(zone: string) {
		super(`Phase 196-05: invalid IANA timezone: ${zone}`)
		this.name = 'InvalidTimezoneError'
		this.zone = zone
	}
}

/**
 * Thrown when the underlying `sudo /usr/bin/timedatectl set-timezone`
 * invocation exits non-zero. Includes stderr verbatim so the operator
 * can read "permission denied" / "unable to enable static-host" etc.
 */
export class TimedatectlError extends Error {
	readonly code = 'TIMEDATECTL_FAILED' as const
	readonly zone: string
	readonly stderr: string
	readonly exitCode: number | null
	constructor(zone: string, stderr: string, exitCode: number | null) {
		super(`Phase 196-05: timedatectl set-timezone ${zone} failed (exit ${exitCode}): ${stderr}`)
		this.name = 'TimedatectlError'
		this.zone = zone
		this.stderr = stderr
		this.exitCode = exitCode
	}
}

// ─── Public surface ─────────────────────────────────────────────────────────

export interface TimezoneService {
	validate(zone: string | null | undefined): boolean
	setSystemTimezone(zone: string): Promise<{ok: true}>
}

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Build a TimezoneService. The optional `opts.execFile` parameter is
 * the test seam — vitest passes a mock that records argv invocations
 * without actually launching sudo.
 */
export function createTimezoneService(opts?: {
	execFile?: typeof nodeExecFile
}): TimezoneService {
	const execFile = opts?.execFile ?? nodeExecFile

	function validate(zone: string | null | undefined): boolean {
		if (zone === null || zone === undefined) return false
		if (typeof zone !== 'string') return false
		if (zone.length === 0) return false
		// Resolve-check: `Intl.DateTimeFormat` throws RangeError on any zone the
		// ICU/tz database doesn't know — so a successful construction is the
		// authoritative "real IANA zone" signal. Unlike the old
		// supportedValuesOf() set, this ACCEPTS backward-compat IANA links like
		// America/Indiana/Indianapolis. Shell-metacharacter strings (`; rm -rf /`)
		// throw, so they're rejected here before reaching execFile.
		try {
			// eslint-disable-next-line no-new
			new Intl.DateTimeFormat('en-US', {timeZone: zone})
			return true
		} catch {
			return false
		}
	}

	function setSystemTimezone(zone: string): Promise<{ok: true}> {
		// Defense-in-depth: re-validate before invoking execFile. Even if
		// the caller (setup-router) already gated via zod + this.validate,
		// running it again here means a future caller that imports this
		// module directly still cannot bypass the Intl gate.
		if (!validate(zone)) {
			return Promise.reject(new InvalidTimezoneError(zone))
		}

		return new Promise<{ok: true}>((resolve, reject) => {
			// execFile (NOT child_process.exec, NOT spawn-with-shell-true)
			// — argv-array shape means the shell never gets a chance to
			// interpret metacharacters. Even if Intl missed something
			// weird, the OS argv layer treats `zone` as a single literal
			// argument to timedatectl.
			execFile(
				'sudo',
				['/usr/bin/timedatectl', 'set-timezone', zone],
				{timeout: 10_000},
				(error: ExecFileException | null, _stdout: string | Buffer, stderr: string | Buffer) => {
					if (error) {
						const stderrText =
							typeof stderr === 'string'
								? stderr
								: stderr
								? stderr.toString('utf8')
								: ''
						const exitCode = typeof error.code === 'number' ? error.code : null
						reject(new TimedatectlError(zone, stderrText || error.message, exitCode))
						return
					}
					resolve({ok: true})
				},
			)
		})
	}

	return {validate, setSystemTimezone}
}
