/**
 * Phase 196-05 Task 2 — timezone-service.ts unit tests.
 *
 * Coverage (8 cases):
 *
 *   T1 validate('Europe/Istanbul') → true (happy path)
 *   T2 validate('Mars/Olympus')    → false (unknown zone)
 *   T3 validate('')                → false (empty input)
 *   T4 validate(undefined)         → false (defensive null/undefined gate)
 *   T5 setSystemTimezone('Europe/Istanbul') with mock execFile that
 *      succeeds → argv shape is ['sudo', ['/usr/bin/timedatectl',
 *      'set-timezone', 'Europe/Istanbul'], ...]; result is {ok:true}
 *   T6 setSystemTimezone('Mars/Olympus') → REJECTS via InvalidTimezoneError
 *      BEFORE execFile is invoked (validate gate fires first); assert
 *      execFile.mock.calls.length === 0
 *   T7 setSystemTimezone('Europe/Istanbul') with mock execFile that
 *      fails with stderr 'permission denied' → throws TimedatectlError
 *      whose message contains 'permission denied'
 *   T8 setSystemTimezone('; rm -rf /')   → REJECTS via InvalidTimezoneError
 *      (validate rejects the semicolon-containing string — locks
 *      T-196-05-01 Tampering regression)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {createTimezoneService, InvalidTimezoneError, TimedatectlError} from './timezone-service.js'

type ExecFileCb = (
	error: (Error & {code?: number | string}) | null,
	stdout: string,
	stderr: string,
) => void

let execFileMock: ReturnType<typeof vi.fn>

beforeEach(() => {
	execFileMock = vi.fn()
})

describe('Phase 196-05 timezone-service — validate()', () => {
	test('T1 — validate("Europe/Istanbul") returns true (happy path)', () => {
		const svc = createTimezoneService({execFile: execFileMock as any})
		expect(svc.validate('Europe/Istanbul')).toBe(true)
	})

	test('T2 — validate("Mars/Olympus") returns false (unknown IANA zone)', () => {
		const svc = createTimezoneService({execFile: execFileMock as any})
		expect(svc.validate('Mars/Olympus')).toBe(false)
	})

	test('T3 — validate("") returns false (empty-string defensive gate)', () => {
		const svc = createTimezoneService({execFile: execFileMock as any})
		expect(svc.validate('')).toBe(false)
	})

	test('T4 — validate(undefined) returns false (null/undefined defensive gate)', () => {
		const svc = createTimezoneService({execFile: execFileMock as any})
		expect(svc.validate(undefined as any)).toBe(false)
		expect(svc.validate(null as any)).toBe(false)
	})
})

describe('Phase 196-05 timezone-service — setSystemTimezone()', () => {
	test('T5 — setSystemTimezone("Europe/Istanbul") invokes execFile with argv-array shape + resolves {ok:true}', async () => {
		execFileMock.mockImplementation(
			(_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
				cb(null, '', '')
			},
		)
		const svc = createTimezoneService({execFile: execFileMock as any})

		const result = await svc.setSystemTimezone('Europe/Istanbul')

		expect(result).toEqual({ok: true})
		expect(execFileMock).toHaveBeenCalledTimes(1)
		expect(execFileMock).toHaveBeenCalledWith(
			'sudo',
			['/usr/bin/timedatectl', 'set-timezone', 'Europe/Istanbul'],
			expect.any(Object),
			expect.any(Function),
		)
		// 10s timeout per Phase 196-05 § threat_model T-196-05-05 DoS mitigation.
		const opts = execFileMock.mock.calls[0][2] as {timeout?: number}
		expect(opts.timeout).toBe(10_000)
	})

	test('T6 — setSystemTimezone("Mars/Olympus") rejects via InvalidTimezoneError BEFORE execFile is invoked', async () => {
		const svc = createTimezoneService({execFile: execFileMock as any})

		await expect(svc.setSystemTimezone('Mars/Olympus')).rejects.toBeInstanceOf(
			InvalidTimezoneError,
		)
		// The validate gate fires BEFORE execFile — if it didn't, we'd
		// have shipped a remote-code-execution sink. Lock the regression.
		expect(execFileMock).not.toHaveBeenCalled()
	})

	test('T7 — setSystemTimezone failure surfaces stderr in TimedatectlError', async () => {
		execFileMock.mockImplementation(
			(_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
				const err = new Error('Command failed') as Error & {code?: number}
				err.code = 1
				cb(err, '', 'permission denied: are you in the sudoers file?')
			},
		)
		const svc = createTimezoneService({execFile: execFileMock as any})

		await expect(svc.setSystemTimezone('Europe/Istanbul')).rejects.toMatchObject({
			name: 'TimedatectlError',
			zone: 'Europe/Istanbul',
		})

		// Re-invoke to assert the stderr is included in the surface
		try {
			await svc.setSystemTimezone('Europe/Istanbul')
		} catch (err) {
			expect(err).toBeInstanceOf(TimedatectlError)
			expect((err as TimedatectlError).stderr).toContain('permission denied')
			expect((err as Error).message).toContain('permission denied')
		}
	})

	test('T8 — setSystemTimezone("; rm -rf /") rejects via InvalidTimezoneError (T-196-05-01 Tampering regression-lock)', async () => {
		const svc = createTimezoneService({execFile: execFileMock as any})

		await expect(svc.setSystemTimezone('; rm -rf /')).rejects.toBeInstanceOf(
			InvalidTimezoneError,
		)
		// The semicolon never reaches the OS argv layer because Intl
		// `supportedValuesOf('timeZone')` does not contain a value
		// starting with `;`. Defense layer 1 fires.
		expect(execFileMock).not.toHaveBeenCalled()
	})
})
