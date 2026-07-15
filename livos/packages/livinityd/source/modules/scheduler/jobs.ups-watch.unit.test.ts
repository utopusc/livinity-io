// Phase 326 HW-01 — ups-watch unit tests.
//
// Covers (mirrors the jobs.disk-critical.unit.test.ts template):
//   1: SKIP-PATH — upsWatchHandler with NO ctx.livinityd resolves (never throws)
//      and returns {status: 'skipped'}, and never shells out to upsc.
//   2: registry reachability — BUILT_IN_HANDLERS['ups-watch'] is the same handler.
//   3: UNAVAILABLE — upsc errors / no UPS → {status:'success', unavailable}; the
//      Phase-310 bridge (add/clear) is NEVER called (a box with no UPS is normal).
//   4: OB (mains lost) — ups.status OB → add('ups-power-loss',{critical,external}),
//      clear NOT called.
//   5: OL (recovery) — ups.status OL → add('ups-power-restored',{info,external}) +
//      clear('ups-power-loss').
//
// jobs.ts consumes `execa` for the upsc poll, so mocking it here is isolated.

import {describe, expect, test, vi} from 'vitest'

import type {ScheduledJob} from './types.js'

// ---------------------------------------------------------------------------
// Module mock (hoisted before importing the module under test, per vitest rules).
// Partial-mock execa so only `execa` is stubbed — `$`/execaCommand etc. stay real
// for the rest of the jobs.ts import graph.
// ---------------------------------------------------------------------------
const mockExeca = vi.fn()
vi.mock('execa', async (importActual) => {
	const actual = await importActual<typeof import('execa')>()
	return {...actual, execa: (...args: unknown[]) => mockExeca(...args)}
})

import {BUILT_IN_HANDLERS, upsWatchHandler} from './jobs.js'

// Minimal ScheduledJob-shaped stub — the handler only reads job.name.
const fakeJob = {name: 'ups-watch', type: 'ups-watch'} as unknown as ScheduledJob
const fakeLogger = {log: vi.fn(), error: vi.fn()}

describe('upsWatchHandler — ctx.livinityd seam + Phase-310 alert bridge', () => {
	test('SKIP-PATH: no ctx.livinityd → resolves, never throws, {status: skipped}, no upsc call', async () => {
		mockExeca.mockReset()
		const result = await upsWatchHandler(fakeJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
		expect(mockExeca).not.toHaveBeenCalled()
	})

	test('registry: BUILT_IN_HANDLERS[ups-watch] is wired and skips cleanly', async () => {
		mockExeca.mockReset()
		const handler = BUILT_IN_HANDLERS['ups-watch']
		expect(handler).toBe(upsWatchHandler)
		const result = await handler(fakeJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
	})

	test('UNAVAILABLE: upsc errors / no UPS → success/unavailable, no add/clear', async () => {
		mockExeca.mockReset()
		mockExeca.mockResolvedValue({stdout: '', exitCode: 1})
		const add = vi.fn().mockResolvedValue(true)
		const clear = vi.fn().mockResolvedValue(true)
		const livinityd = {notifications: {add, clear}} as never

		const result = await upsWatchHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect((result.output as {status: string}).status).toBe('unavailable')
		expect(add).not.toHaveBeenCalled()
		expect(clear).not.toHaveBeenCalled()
	})

	test('OB (mains lost): ups.status OB → add(ups-power-loss, critical, external), no clear', async () => {
		mockExeca.mockReset()
		mockExeca.mockResolvedValue({
			stdout: 'ups.status: OB\nbattery.charge: 55\nbattery.runtime: 900',
			exitCode: 0,
		})
		const add = vi.fn().mockResolvedValue(true)
		const clear = vi.fn().mockResolvedValue(true)
		const livinityd = {notifications: {add, clear}} as never

		const result = await upsWatchHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(add).toHaveBeenCalledWith('ups-power-loss', {severity: 'critical', external: true})
		expect(clear).not.toHaveBeenCalled()
	})

	test('OL (recovery): ups.status OL → add(ups-power-restored, info, external) + clear(ups-power-loss)', async () => {
		mockExeca.mockReset()
		mockExeca.mockResolvedValue({
			stdout: 'ups.status: OL\nbattery.charge: 100\nbattery.runtime: 3000',
			exitCode: 0,
		})
		const add = vi.fn().mockResolvedValue(true)
		const clear = vi.fn().mockResolvedValue(true)
		const livinityd = {notifications: {add, clear}} as never

		const result = await upsWatchHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(add).toHaveBeenCalledWith('ups-power-restored', {severity: 'info', external: true})
		expect(clear).toHaveBeenCalledWith('ups-power-loss')
	})
})
