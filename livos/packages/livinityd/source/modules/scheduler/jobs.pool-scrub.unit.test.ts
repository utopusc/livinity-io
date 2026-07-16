// Phase 318 POOL-03 — pool-scrub handler unit tests.
//
// Covers (mirrors the jobs.user-quota-scan.unit.test.ts template):
//   1: registry — BUILT_IN_HANDLERS['pool-scrub'] IS poolScrubHandler.
//   2: SKIP — no ctx.livinityd → {status:'skipped'}, never throws, no scrub.
//   3: SKIP — no pool / combine-only → skipped (nothing to scrub).
//   4: CLEAN SCRUB — a protected pool → scrub -p 8 (≈3-month coverage default)
//      runs, records success, refreshes storagePool.lastStatusSummary, clears
//      the D-09 degradation alerts.
//   5: CONFIG PERCENT — job.config.percent overrides the default.
//   6: NEVER-THROW — an internal throw (scrub rejects) → {status:'failure'}.
//
// snapraid-cli (the ONLY live-snapraid seam) is import-mocked. ZERO live snapraid.

import {describe, expect, test, vi} from 'vitest'

import type {ScheduledJob} from './types.js'

const mockDiff = vi.fn()
const mockSync = vi.fn()
const mockScrub = vi.fn()
const mockStatus = vi.fn()
vi.mock('../storage-pool/snapraid-cli.js', () => ({
	POOL_WRAPPER: '/usr/local/lib/livos/livos-pool.sh',
	diff: (...a: unknown[]) => mockDiff(...a),
	sync: (...a: unknown[]) => mockSync(...a),
	scrub: (...a: unknown[]) => mockScrub(...a),
	status: (...a: unknown[]) => mockStatus(...a),
}))

import {BUILT_IN_HANDLERS, poolScrubHandler, POOL_SCRUB_PERCENT} from './jobs.js'

const fakeLogger = {log: vi.fn(), error: vi.fn()}

function makeJob(config: Record<string, unknown> = {}): ScheduledJob {
	return {id: 'job-1', name: 'pool-scrub', type: 'pool-scrub', config} as unknown as ScheduledJob
}

function protectedState() {
	return {
		members: [
			{deviceId: 'sdb', role: 'data', mountpoint: '/mnt/disk2'},
			{deviceId: 'sdc', role: 'data', mountpoint: '/mnt/disk3'},
			{deviceId: 'sdd', role: 'parity', mountpoint: '/mnt/parity1'},
		],
		protectionLevel: 'protected',
		parityDeviceId: 'sdd',
		safetyFreezeThreshold: {files: 500, percent: 20},
	}
}

function makeLivinityd(state: unknown) {
	const add = vi.fn().mockResolvedValue(true)
	const clear = vi.fn().mockResolvedValue(true)
	const get = vi.fn().mockResolvedValue(state)
	const set = vi.fn().mockResolvedValue(true)
	const livinityd = {notifications: {add, clear}, store: {get, set}} as never
	return {livinityd, add, clear, get, set}
}

function resetSnapraid() {
	mockDiff.mockReset()
	mockSync.mockReset()
	mockScrub.mockReset()
	mockStatus.mockReset()
}

describe('poolScrubHandler — registry + skip seams', () => {
	test('registry: BUILT_IN_HANDLERS[pool-scrub] is wired to poolScrubHandler', () => {
		expect(BUILT_IN_HANDLERS['pool-scrub']).toBe(poolScrubHandler)
	})

	test('SKIP: no ctx.livinityd → skipped, never throws, no scrub', async () => {
		resetSnapraid()
		const result = await poolScrubHandler(makeJob(), {logger: fakeLogger})
		expect(result.status).toBe('skipped')
		expect(mockScrub).not.toHaveBeenCalled()
	})

	test('SKIP: no pool configured → skipped, no scrub', async () => {
		resetSnapraid()
		const {livinityd} = makeLivinityd(undefined)
		const result = await poolScrubHandler(makeJob(), {logger: fakeLogger, livinityd})
		expect(result.status).toBe('skipped')
		expect(mockScrub).not.toHaveBeenCalled()
	})

	test('SKIP: combine-only pool → skipped (no parity to scrub)', async () => {
		resetSnapraid()
		const {livinityd} = makeLivinityd({...protectedState(), protectionLevel: 'combine-only'})
		const result = await poolScrubHandler(makeJob(), {logger: fakeLogger, livinityd})
		expect(result.status).toBe('skipped')
		expect(mockScrub).not.toHaveBeenCalled()
	})
})

describe('poolScrubHandler — scrub run + D-09 alerts', () => {
	test('CLEAN SCRUB: protected pool → scrub -p 8 runs, records success, refreshes status, clears alerts', async () => {
		resetSnapraid()
		mockScrub.mockResolvedValue({errorIo: 0, errorData: 0, errorSoft: 0, exit: 'ok'})
		mockStatus.mockResolvedValue({scrubOldestDays: 1, diskUsePercent: {d2: 10, d3: 20}, exit: 'ok'})
		const {livinityd, clear, set} = makeLivinityd(protectedState())

		const result = await poolScrubHandler(makeJob(), {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		// Default rolling coverage slice (≈3-month full coverage).
		expect(POOL_SCRUB_PERCENT).toBe(8)
		expect(mockScrub).toHaveBeenCalledWith({percent: 8})
		expect(set).toHaveBeenCalledWith(
			'storagePool',
			expect.objectContaining({lastScrub: expect.objectContaining({at: expect.any(Number)})}),
		)
		expect(clear).toHaveBeenCalledWith('pool-degraded:sdb')
		expect(clear).toHaveBeenCalledWith('pool-branch-missing')
	})

	test('CONFIG PERCENT: job.config.percent overrides the default', async () => {
		resetSnapraid()
		mockScrub.mockResolvedValue({errorIo: 0, errorData: 0, errorSoft: 0, exit: 'ok'})
		mockStatus.mockResolvedValue({scrubOldestDays: 1, diskUsePercent: {d2: 10, d3: 20}, exit: 'ok'})
		const {livinityd} = makeLivinityd(protectedState())

		const result = await poolScrubHandler(makeJob({percent: 25}), {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(mockScrub).toHaveBeenCalledWith({percent: 25})
	})

	test('NEVER-THROW: an internal throw (scrub rejects) → {status:failure}, never re-thrown', async () => {
		resetSnapraid()
		mockScrub.mockRejectedValue(new Error('scrub aborted'))
		const {livinityd} = makeLivinityd(protectedState())

		const result = await poolScrubHandler(makeJob(), {logger: fakeLogger, livinityd})

		expect(result.status).toBe('failure')
		expect(result.error).toContain('scrub aborted')
	})
})
