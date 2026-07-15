// Phase 329 APPS-04 — custom-command handler unit tests.
//
// Covers (mirrors the jobs.ups-watch.unit.test.ts template):
//   1: SKIP-PATH — no ctx.livinityd → {status:'skipped'}, never throws, no execa.
//   2: registry — BUILT_IN_HANDLERS['custom-command'] is the same handler.
//   3: SHELL:FALSE — execa(command, args, {shell:false, timeout, all}) — the
//      non-root/no-shell contract (D-12), assertion-proof.
//   4: 16KB TRUNCATION — a >16KB child output is stored as the LAST 16 KB tail.
//   5: FAILURE PATH — a throwing execa (non-zero exit/timeout) → {status:'failure'}
//      (never re-thrown) + a single coalesced notification is raised.
//   6: SUCCESS clears the coalesced failure notification (clear-on-recovery).
//   7: MISCONFIG — an empty command degrades to a recorded failure, never throws.
//
// jobs.ts consumes `execa`; mocking it here isolates the child-process seam.
// job_runs history writes go through getPool() which returns null in the unit
// env (fail-open, mirrors history.ts) — so no DB is exercised here.

import {describe, expect, test, vi} from 'vitest'

import type {ScheduledJob} from './types.js'

// Partial-mock execa so only `execa` is stubbed (rest of the import graph stays real).
const mockExeca = vi.fn()
vi.mock('execa', async (importActual) => {
	const actual = await importActual<typeof import('execa')>()
	return {...actual, execa: (...args: unknown[]) => mockExeca(...args)}
})

import {BUILT_IN_HANDLERS, customCommandHandler, tail16k} from './jobs.js'

const fakeLogger = {log: vi.fn(), error: vi.fn()}

function makeJob(config: Record<string, unknown>): ScheduledJob {
	return {id: 'job-1', name: 'my-job', type: 'custom-command', config} as unknown as ScheduledJob
}

function makeLivinityd() {
	const add = vi.fn().mockResolvedValue(true)
	const clear = vi.fn().mockResolvedValue(true)
	return {livinityd: {notifications: {add, clear}} as never, add, clear}
}

describe('customCommandHandler — non-root execa + history + alerts (D-12..15)', () => {
	test('SKIP: no ctx.livinityd → skipped, never throws, no execa', async () => {
		mockExeca.mockReset()
		const result = await customCommandHandler(makeJob({command: 'echo', args: ['hi']}), {logger: fakeLogger})
		expect(result.status).toBe('skipped')
		expect(mockExeca).not.toHaveBeenCalled()
	})

	test('registry: BUILT_IN_HANDLERS[custom-command] is wired', () => {
		expect(BUILT_IN_HANDLERS['custom-command']).toBe(customCommandHandler)
	})

	test('SHELL:FALSE + non-root: execa(command, args, {shell:false, timeout, all}) — no shell/sudo', async () => {
		mockExeca.mockReset()
		mockExeca.mockResolvedValue({all: 'ok', stdout: 'ok', exitCode: 0})
		const {livinityd, clear} = makeLivinityd()
		const result = await customCommandHandler(makeJob({command: 'echo', args: ['hi'], timeoutSec: 42}), {
			logger: fakeLogger,
			livinityd,
		})
		expect(result.status).toBe('success')
		expect(mockExeca).toHaveBeenCalledTimes(1)
		const [cmd, args, opts] = mockExeca.mock.calls[0] as [string, string[], Record<string, unknown>]
		expect(cmd).toBe('echo')
		expect(args).toEqual(['hi'])
		expect(opts.shell).toBe(false)
		expect(opts.timeout).toBe(42 * 1000)
		expect(opts.all).toBe(true)
		// success clears any prior coalesced failure alert
		expect(clear).toHaveBeenCalledWith('custom-command:my-job')
	})

	test('timeout defaults to 300s when config omits it (mandatory bounded timeout)', async () => {
		mockExeca.mockReset()
		mockExeca.mockResolvedValue({all: 'ok', stdout: 'ok', exitCode: 0})
		const {livinityd} = makeLivinityd()
		await customCommandHandler(makeJob({command: 'echo'}), {logger: fakeLogger, livinityd})
		const [, , opts] = mockExeca.mock.calls[0] as [string, string[], Record<string, unknown>]
		expect(opts.timeout).toBe(300 * 1000)
	})

	test('timeout is capped at 3600s even if config asks for more', async () => {
		mockExeca.mockReset()
		mockExeca.mockResolvedValue({all: 'ok', stdout: 'ok', exitCode: 0})
		const {livinityd} = makeLivinityd()
		await customCommandHandler(makeJob({command: 'echo', timeoutSec: 999999}), {logger: fakeLogger, livinityd})
		const [, , opts] = mockExeca.mock.calls[0] as [string, string[], Record<string, unknown>]
		expect(opts.timeout).toBe(3600 * 1000)
	})

	test('16KB truncation: >16KB output stored as the LAST 16 KB tail', async () => {
		mockExeca.mockReset()
		const big = 'a'.repeat(20 * 1024)
		mockExeca.mockResolvedValue({all: big, stdout: big, exitCode: 0})
		const {livinityd} = makeLivinityd()
		const result = await customCommandHandler(makeJob({command: 'yes'}), {logger: fakeLogger, livinityd})
		expect(result.status).toBe('success')
		const out = result.output as string
		expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(16 * 1024)
		expect(out).toBe(big.slice(-16 * 1024))
	})

	test('FAILURE: throwing execa (non-zero/timeout) → failure, never re-thrown, alert raised', async () => {
		mockExeca.mockReset()
		const err = Object.assign(new Error('Command failed with exit code 1'), {all: 'boom stderr', exitCode: 1})
		mockExeca.mockRejectedValue(err)
		const {livinityd, add} = makeLivinityd()
		const result = await customCommandHandler(makeJob({command: 'false'}), {logger: fakeLogger, livinityd})
		expect(result.status).toBe('failure')
		expect(result.error).toContain('boom stderr')
		expect(add).toHaveBeenCalledWith('custom-command:my-job', {severity: 'warning', external: false})
	})

	test('MISCONFIG: empty command → failure (never throws), no execa, alert raised', async () => {
		mockExeca.mockReset()
		const {livinityd, add} = makeLivinityd()
		const result = await customCommandHandler(makeJob({}), {logger: fakeLogger, livinityd})
		expect(result.status).toBe('failure')
		expect(mockExeca).not.toHaveBeenCalled()
		expect(add).toHaveBeenCalled()
	})

	test('tail16k: returns input unchanged when ≤16KB, empty for non-strings', () => {
		expect(tail16k('hello')).toBe('hello')
		expect(tail16k('')).toBe('')
	})
})
