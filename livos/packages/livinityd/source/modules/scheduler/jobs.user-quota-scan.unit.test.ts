// Phase 325 STOR-02 — user-quota-scan unit tests.
//
// Covers:
//   1-4: usersOverSoftQuota() pure-function threshold + boundary + unlimited tests
//   5:   SKIP-PATH — userQuotaScanHandler with NO ctx.livinityd resolves (never
//        throws) and returns {status: 'skipped'} (the Plan-02 ctx seam)
//   6:   registry reachability — BUILT_IN_HANDLERS['user-quota-scan'] is the same
//        handler and also skips cleanly
//   7:   HAPPY-PATH (over soft%) — a user's du result over 90% of their quota →
//        add('quota-exceeded', {severity:'warning', external:false}), clear NOT called;
//        the per-user byte map is cached to the store
//   8:   HAPPY-PATH (under soft%) — everyone under 90% → clear('quota-exceeded'),
//        add NOT called
//   9:   du failure on one user degrades to 0 (per-target), job still 'success'
//
// getDirectorySize + listUserQuotas are mocked so no real du / PG is touched.

import {describe, expect, test, vi} from 'vitest'

import type {ScheduledJob} from './types.js'

// ---------------------------------------------------------------------------
// Module mocks (hoisted before importing the module under test, per vitest rules)
// ---------------------------------------------------------------------------
const mockGetDirectorySize = vi.fn()
vi.mock('../utilities/get-directory-size.js', () => ({
	default: (...args: unknown[]) => mockGetDirectorySize(...args),
}))

const mockListUserQuotas = vi.fn()
vi.mock('../database/index.js', () => ({
	listUserQuotas: (...args: unknown[]) => mockListUserQuotas(...args),
}))

import {BUILT_IN_HANDLERS, userQuotaScanHandler, usersOverSoftQuota, QUOTA_SOFT_RATIO} from './jobs.js'

// Minimal ScheduledJob-shaped stub — the handler only reads job.name.
const fakeJob = {name: 'user-quota-scan', type: 'user-quota-scan'} as unknown as ScheduledJob
const fakeLogger = {log: vi.fn(), error: vi.fn()}

function makeLivinityd() {
	const add = vi.fn().mockResolvedValue(true)
	const clear = vi.fn().mockResolvedValue(true)
	const set = vi.fn().mockResolvedValue(true)
	const livinityd = {
		dataDirectory: '/data',
		notifications: {add, clear},
		store: {set},
	} as never
	return {livinityd, add, clear, set}
}

describe('usersOverSoftQuota (pure threshold logic)', () => {
	test('over the soft ratio → listed', () => {
		expect(usersOverSoftQuota({alice: 95}, {alice: 100})).toEqual(['alice'])
	})
	test('under the soft ratio → not listed', () => {
		expect(usersOverSoftQuota({alice: 50}, {alice: 100})).toEqual([])
	})
	test('boundary: exactly at the soft ratio → listed (>=)', () => {
		expect(usersOverSoftQuota({alice: QUOTA_SOFT_RATIO * 100}, {alice: 100})).toEqual(['alice'])
	})
	test('null / zero quota = unlimited → never listed', () => {
		expect(usersOverSoftQuota({alice: 999, bob: 999}, {alice: null, bob: 0})).toEqual([])
	})
})

describe('userQuotaScanHandler — ctx.livinityd seam (Plan 02)', () => {
	test('SKIP-PATH: no ctx.livinityd → resolves, never throws, returns {status: skipped}', async () => {
		mockListUserQuotas.mockReset()
		const result = await userQuotaScanHandler(fakeJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
		expect(mockListUserQuotas).not.toHaveBeenCalled()
	})

	test('registry: BUILT_IN_HANDLERS[user-quota-scan] is wired and skips cleanly', async () => {
		const handler = BUILT_IN_HANDLERS['user-quota-scan']
		expect(handler).toBe(userQuotaScanHandler)
		const result = await handler(fakeJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
	})

	test('HAPPY-PATH (over soft%): du > 90% of quota → add(quota-exceeded, warning, external:false), no clear, cache set', async () => {
		mockListUserQuotas.mockReset()
		mockGetDirectorySize.mockReset()
		mockListUserQuotas.mockResolvedValue([{id: 'u1', username: 'alice', quotaBytes: 1000}])
		mockGetDirectorySize.mockResolvedValue(950)
		const {livinityd, add, clear, set} = makeLivinityd()

		const result = await userQuotaScanHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(add).toHaveBeenCalledWith('quota-exceeded', {severity: 'warning', external: false})
		expect(clear).not.toHaveBeenCalled()
		expect(set).toHaveBeenCalledWith('storageQuota', expect.objectContaining({usedBytes: {alice: 950}}))
	})

	test('HAPPY-PATH (under soft%): everyone under 90% → clear(quota-exceeded), no add', async () => {
		mockListUserQuotas.mockReset()
		mockGetDirectorySize.mockReset()
		mockListUserQuotas.mockResolvedValue([{id: 'u1', username: 'alice', quotaBytes: 1000}])
		mockGetDirectorySize.mockResolvedValue(100)
		const {livinityd, add, clear} = makeLivinityd()

		const result = await userQuotaScanHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(clear).toHaveBeenCalledWith('quota-exceeded')
		expect(add).not.toHaveBeenCalled()
	})

	test('du failure on one user degrades to 0 — job still success', async () => {
		mockListUserQuotas.mockReset()
		mockGetDirectorySize.mockReset()
		mockListUserQuotas.mockResolvedValue([{id: 'u1', username: 'alice', quotaBytes: 1000}])
		mockGetDirectorySize.mockRejectedValue(new Error('du: cannot access'))
		const {livinityd, set} = makeLivinityd()

		const result = await userQuotaScanHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(set).toHaveBeenCalledWith('storageQuota', expect.objectContaining({usedBytes: {alice: 0}}))
	})
})
