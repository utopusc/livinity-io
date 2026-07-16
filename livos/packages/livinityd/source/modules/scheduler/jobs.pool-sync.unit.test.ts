// Phase 318 POOL-03 — pool-sync handler unit tests.
//
// Covers (mirrors the jobs.user-quota-scan.unit.test.ts template):
//   1: registry — BUILT_IN_HANDLERS['pool-sync'] IS poolSyncHandler (the TOTAL
//      Record reachability the 3-site registration guarantees, Trap 8).
//   2: SKIP — no ctx.livinityd → {status:'skipped'}, never throws, no snapraid.
//   3: SKIP — no pool configured / combine-only → skipped (no alert noise).
//   4: FREEZE-BLOCKS-SYNC (D-08/T-318-13) — diff.removed over the threshold →
//      checkFreezeGate blocks → notifications.add('pool-sync-frozen') AND
//      snapraid sync is NEVER called.
//   5: CLEAN SYNC — small diff → sync runs → status persisted to
//      storagePool.lastStatusSummary (W-2) → all D-09 alerts CLEARED (recovery).
//   6: DEGRADED MEMBER — a member branch missing from `status` → per-member
//      notifications.add('pool-degraded:<deviceId>') + system-wide
//      pool-branch-missing (D-09).
//   7: NEVER-THROW — an internal throw (diff rejects) → {status:'failure'}.
//
// snapraid-cli (the ONLY live-snapraid seam) is import-mocked; checkFreezeGate is
// the REAL pure gate driven via diff.removed + the state threshold. ZERO live
// snapraid / execa / PG (getPool() is null in the unit env → history is fail-open).

import {describe, expect, test, vi} from 'vitest'

import type {ScheduledJob} from './types.js'

// ---------------------------------------------------------------------------
// Module mocks (hoisted before importing the module under test, per vitest rules).
// snapraid-cli.js is the sole live-snapraid boundary — stubbing it isolates the
// handler while the REAL checkFreezeGate (pool.js) runs against the mocked diff.
// ---------------------------------------------------------------------------
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

import {BUILT_IN_HANDLERS, poolSyncHandler} from './jobs.js'

const fakeJob = {id: 'job-1', name: 'pool-sync', type: 'pool-sync', config: {}} as unknown as ScheduledJob
const fakeLogger = {log: vi.fn(), error: vi.fn()}

// A protected pool: two data branches (d2/d3) + a parity disk.
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

describe('poolSyncHandler — registry + skip seams', () => {
	test('registry: BUILT_IN_HANDLERS[pool-sync] is wired to poolSyncHandler', () => {
		expect(BUILT_IN_HANDLERS['pool-sync']).toBe(poolSyncHandler)
	})

	test('SKIP: no ctx.livinityd → skipped, never throws, no snapraid', async () => {
		resetSnapraid()
		const result = await poolSyncHandler(fakeJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
		expect(mockDiff).not.toHaveBeenCalled()
	})

	test('SKIP: no pool configured → skipped, no diff', async () => {
		resetSnapraid()
		const {livinityd} = makeLivinityd(undefined)
		const result = await poolSyncHandler(fakeJob, {logger: fakeLogger, livinityd})
		expect(result.status).toBe('skipped')
		expect(mockDiff).not.toHaveBeenCalled()
	})

	test('SKIP: combine-only pool → skipped (no parity to sync)', async () => {
		resetSnapraid()
		const {livinityd} = makeLivinityd({...protectedState(), protectionLevel: 'combine-only'})
		const result = await poolSyncHandler(fakeJob, {logger: fakeLogger, livinityd})
		expect(result.status).toBe('skipped')
		expect(mockDiff).not.toHaveBeenCalled()
	})
})

describe('poolSyncHandler — D-08 freeze gate + D-09 alerts', () => {
	test('FREEZE-BLOCKS-SYNC: diff.removed > threshold → pool-sync-frozen raised AND sync NOT called', async () => {
		resetSnapraid()
		mockDiff.mockResolvedValue({counts: {added: 0, removed: 999, updated: 0, moved: 0}, exit: 'diff'})
		const {livinityd, add} = makeLivinityd(protectedState())

		const result = await poolSyncHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect((result.output as {frozen?: boolean}).frozen).toBe(true)
		expect(add).toHaveBeenCalledWith('pool-sync-frozen', {severity: 'warning', external: true})
		// The sync MUST NOT run while frozen (T-318-13 — no mass-deletion commit to parity).
		expect(mockSync).not.toHaveBeenCalled()
		expect(mockStatus).not.toHaveBeenCalled()
	})

	test('CLEAN SYNC: small diff → sync runs, status persisted (W-2), all alerts cleared', async () => {
		resetSnapraid()
		mockDiff.mockResolvedValue({counts: {added: 3, removed: 2, updated: 1, moved: 0}, exit: 'diff'})
		mockSync.mockResolvedValue({errorIo: 0, errorData: 0, errorSoft: 0, exit: 'ok'})
		mockStatus.mockResolvedValue({scrubOldestDays: 5, diskUsePercent: {d2: 10, d3: 20}, exit: 'ok'})
		const {livinityd, add, clear, set} = makeLivinityd(protectedState())

		const result = await poolSyncHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(mockSync).toHaveBeenCalledTimes(1)
		// W-2: lastStatusSummary persisted for the NEXT freeze-gate percentage leg.
		expect(set).toHaveBeenCalledWith(
			'storagePool',
			expect.objectContaining({lastStatusSummary: expect.objectContaining({protectedFileCount: 2, scrubOldestDays: 5})}),
		)
		// Recovery: freeze + both per-member degradation alerts + branch-missing all cleared.
		expect(clear).toHaveBeenCalledWith('pool-sync-frozen')
		expect(clear).toHaveBeenCalledWith('pool-degraded:sdb')
		expect(clear).toHaveBeenCalledWith('pool-degraded:sdc')
		expect(clear).toHaveBeenCalledWith('pool-branch-missing')
		// A clean pool raises NO degradation alert.
		expect(add).not.toHaveBeenCalledWith('pool-branch-missing', expect.anything())
	})

	test('DEGRADED MEMBER: a branch missing from status → pool-degraded:<id> + pool-branch-missing raised', async () => {
		resetSnapraid()
		mockDiff.mockResolvedValue({counts: {added: 0, removed: 1, updated: 0, moved: 0}, exit: 'diff'})
		mockSync.mockResolvedValue({errorIo: 0, errorData: 1, errorSoft: 0, exit: 'error'})
		// d3 (sdc) is absent from the reported disk set → its branch is missing/unreadable.
		mockStatus.mockResolvedValue({scrubOldestDays: 3, diskUsePercent: {d2: 10}, exit: 'bad'})
		const {livinityd, add, clear} = makeLivinityd(protectedState())

		const result = await poolSyncHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(add).toHaveBeenCalledWith('pool-degraded:sdc', {severity: 'warning', external: true})
		expect(add).toHaveBeenCalledWith('pool-branch-missing', {severity: 'warning', external: true})
		// The healthy member's alert is cleared, not raised.
		expect(clear).toHaveBeenCalledWith('pool-degraded:sdb')
	})

	test('NEVER-THROW: an internal throw (diff rejects) → {status:failure}, never re-thrown', async () => {
		resetSnapraid()
		mockDiff.mockRejectedValue(new Error('snapraid unreachable'))
		const {livinityd} = makeLivinityd(protectedState())

		const result = await poolSyncHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('failure')
		expect(result.error).toContain('snapraid unreachable')
		expect(mockSync).not.toHaveBeenCalled()
	})
})
