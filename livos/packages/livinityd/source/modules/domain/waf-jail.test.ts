// Phase 332 (WAF-01) — waf-jail.ts unit tests (injected runner; no real sudo).

import {describe, expect, it, vi} from 'vitest'

import {installAbuseJail, removeAbuseJail} from './waf-jail.js'

describe('installAbuseJail — argv + int bounding + fail-soft', () => {
	it('passes bounded integer args to the wrapper install-jail action', async () => {
		const run = vi.fn().mockResolvedValue({exitCode: 0, stdout: ''})
		const ok = await installAbuseJail({maxretry: 30, findtime: 120, bantime: 7200}, {run})
		expect(ok).toBe(true)
		expect(run).toHaveBeenCalledWith([
			'install-jail',
			'--maxretry',
			'30',
			'--findtime',
			'120',
			'--bantime',
			'7200',
		])
	})

	it('clamps out-of-range / non-finite tuning to safe bounds', async () => {
		const run = vi.fn().mockResolvedValue({exitCode: 0})
		await installAbuseJail({maxretry: 0, findtime: 10_000_000, bantime: Number.NaN}, {run})
		const args = run.mock.calls[0][0] as string[]
		// maxretry floored to 1, findtime capped to 86400, bantime → default 3600.
		expect(args).toEqual(['install-jail', '--maxretry', '1', '--findtime', '86400', '--bantime', '3600'])
	})

	it('332-REVIEW INFO-2: bantime is capped to 7 digits so it never exceeds the wrapper _valid_int', async () => {
		const run = vi.fn().mockResolvedValue({exitCode: 0})
		await installAbuseJail({bantime: 99_999_999}, {run})
		const args = run.mock.calls[0][0] as string[]
		const bantime = args[args.indexOf('--bantime') + 1]
		expect(bantime).toBe('9999999')
		expect(bantime.length).toBeLessThanOrEqual(7)
	})

	it('defaults every field when tuning is empty', async () => {
		const run = vi.fn().mockResolvedValue({exitCode: 0})
		await installAbuseJail({}, {run})
		expect(run).toHaveBeenCalledWith(['install-jail', '--maxretry', '20', '--findtime', '60', '--bantime', '3600'])
	})

	it('returns false (never throws) when the wrapper exits non-zero (absent grant)', async () => {
		const run = vi.fn().mockResolvedValue({exitCode: 1})
		expect(await installAbuseJail({}, {run})).toBe(false)
	})

	it('returns false (never throws) when the runner rejects', async () => {
		const run = vi.fn().mockRejectedValue(new Error('sudo: not found'))
		expect(await installAbuseJail({}, {run})).toBe(false)
	})
})

describe('removeAbuseJail', () => {
	it('calls the remove-jail action and reports success', async () => {
		const run = vi.fn().mockResolvedValue({exitCode: 0})
		expect(await removeAbuseJail({run})).toBe(true)
		expect(run).toHaveBeenCalledWith(['remove-jail'])
	})
	it('fail-soft on error', async () => {
		const run = vi.fn().mockRejectedValue(new Error('nope'))
		expect(await removeAbuseJail({run})).toBe(false)
	})
})
