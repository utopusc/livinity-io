// Phase 313 Plan 02 Task 3 — smart-health-scan + smart-self-test-short handler tests.
//
// Both handlers are proven OFFLINE (no real daemon, no smartctl, no PG):
//   1: failing drive → add('smart-failing:sda', {critical, external}) + deduped insert
//   2: dedupe hit → insertSmartAlert NOT called (no re-insert)
//   3: healthy drive → clear('smart-failing:sda'), add NOT called
//   4: usb unsupported (SMART-05 Scope A) → NO smart-unavailable NAG dispatched (badge-only,
//      non-actionable); scan still 'success' — the honest 'unavailable' UI badge is unchanged
//   5: virtual disk (WSL) unsupported → NO notification raised, badge stays 'unavailable'
//   6: permission-denied internal → add('smart-permission-denied', ...)  [KEEP — fixable misconfig]
//   7: recovery — no denied drive this scan → clear('smart-permission-denied')
//   8: guard (no ctx.livinityd) → {status: 'skipped'}, never throws
//   9: listDrives throws → {status: 'failure'} (NOT 'error'), never throws out
//  10: self-test DoS guard — in-progress + unavailable skipped, idle readable triggered
//
// SMART-05 (Scope A / D-5): drives with no SMART capability (detectionMethod 'unsupported' —
// WSL/virtual disks AND USB enclosures that swallow SAT) are a PERMANENT, non-actionable state →
// badge-only, no external notification + no audit row. permission-denied (fixable) + failing
// drives still alert. Tests 4 + 5 lock the no-NAG behavior; 6 + 1 lock the preserved alerting.
//
// Only jobs.ts consumes '../monitoring/smart.js'/'../monitoring/smart-alerts.js' in the
// scheduler graph, so mocking them here is isolated (no transitive module breaks).

import {describe, expect, test, vi, beforeEach} from 'vitest'

import type {ScheduledJob} from './types.js'
import type {SmartDrive} from '../monitoring/smart.js'

// ---------------------------------------------------------------------------
// Module mocks (hoisted before importing the module under test)
// ---------------------------------------------------------------------------
const mockListDrives = vi.fn()
const mockRunSelfTest = vi.fn()
vi.mock('../monitoring/smart.js', () => ({
	listDrives: (...a: unknown[]) => mockListDrives(...a),
	runSelfTest: (...a: unknown[]) => mockRunSelfTest(...a),
}))

const mockInsertSmartAlert = vi.fn()
const mockFindRecentSmartAlert = vi.fn()
vi.mock('../monitoring/smart-alerts.js', () => ({
	insertSmartAlert: (...a: unknown[]) => mockInsertSmartAlert(...a),
	findRecentSmartAlert: (...a: unknown[]) => mockFindRecentSmartAlert(...a),
}))

import {BUILT_IN_HANDLERS, smartHealthScanHandler, smartSelfTestShortHandler} from './jobs.js'

const fakeJob = {name: 'smart-health-scan', type: 'smart-health-scan'} as unknown as ScheduledJob
const fakeLogger = {log: vi.fn(), error: vi.fn()}

function drive(overrides: Partial<SmartDrive>): SmartDrive {
	return {
		deviceId: 'sda',
		transport: 'sata',
		model: 'Test Drive',
		healthStatus: 'healthy',
		severity: null,
		temperature: 30,
		temperatureStatus: 'ok',
		detectionMethod: 'ata',
		reasons: [],
		attributes: [],
		selfTestInProgress: false,
		lastSelfTest: null,
		...overrides,
	}
}

function fakeDaemon() {
	const add = vi.fn().mockResolvedValue(true)
	const clear = vi.fn().mockResolvedValue(true)
	return {livinityd: {notifications: {add, clear}} as never, add, clear}
}

beforeEach(() => {
	mockListDrives.mockReset()
	mockRunSelfTest.mockReset().mockResolvedValue({started: true})
	mockInsertSmartAlert.mockReset().mockResolvedValue(null)
	mockFindRecentSmartAlert.mockReset().mockResolvedValue(null) // default: no recent → insert allowed
})

// ─────────────────────────────────────────────────────────────────────────
// smartHealthScanHandler — alert routing (Phase-310 bridge ONLY)
// ─────────────────────────────────────────────────────────────────────────
describe('smartHealthScanHandler', () => {
	test('failing drive → add smart-failing:sda (critical, external) + deduped insert', async () => {
		mockListDrives.mockResolvedValue([
			drive({deviceId: 'sda', healthStatus: 'failing', severity: 'critical', reasons: ['Reallocated_Sector_Ct']}),
		])
		const {livinityd, add} = fakeDaemon()

		const result = await smartHealthScanHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(add).toHaveBeenCalledWith('smart-failing:sda', {severity: 'critical', external: true})
		expect(mockFindRecentSmartAlert).toHaveBeenCalledWith('sda', 'sata-attribute', 360)
		expect(mockInsertSmartAlert).toHaveBeenCalledTimes(1)
	})

	test('dedupe hit → insertSmartAlert NOT called (no re-insert within window)', async () => {
		mockListDrives.mockResolvedValue([drive({deviceId: 'sda', healthStatus: 'failing', severity: 'warning'})])
		mockFindRecentSmartAlert.mockResolvedValue({id: 'existing', deviceId: 'sda', kind: 'sata-attribute'})
		const {livinityd} = fakeDaemon()

		await smartHealthScanHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(mockInsertSmartAlert).not.toHaveBeenCalled()
	})

	test('healthy drive → clear(smart-failing:sda), add NOT called', async () => {
		mockListDrives.mockResolvedValue([drive({deviceId: 'sda', healthStatus: 'healthy'})])
		const {livinityd, add, clear} = fakeDaemon()

		const result = await smartHealthScanHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(clear).toHaveBeenCalledWith('smart-failing:sda')
		expect(add).not.toHaveBeenCalledWith('smart-failing:sda', expect.anything())
	})

	test('usb unsupported → NO smart-unavailable NAG (Scope A: badge-only, non-actionable)', async () => {
		mockListDrives.mockResolvedValue([
			drive({deviceId: 'sdb', transport: 'usb', healthStatus: 'unavailable', detectionMethod: 'unsupported'}),
		])
		const {livinityd, add} = fakeDaemon()

		const result = await smartHealthScanHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(add).not.toHaveBeenCalledWith('smart-unavailable:sdb', expect.anything())
	})

	test('virtual disk (WSL) unsupported → badge stays unavailable, NO notification raised', async () => {
		mockListDrives.mockResolvedValue([
			drive({deviceId: 'sdc', transport: 'unknown', model: 'Virtual Disk', healthStatus: 'unavailable', detectionMethod: 'unsupported'}),
		])
		const {livinityd, add} = fakeDaemon()

		const result = await smartHealthScanHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(add).not.toHaveBeenCalledWith('smart-unavailable:sdc', expect.anything())
	})

	test('permission-denied internal → add smart-permission-denied', async () => {
		mockListDrives.mockResolvedValue([
			drive({deviceId: 'sda', healthStatus: 'unavailable', detectionMethod: 'permission-denied'}),
		])
		const {livinityd, add, clear} = fakeDaemon()

		await smartHealthScanHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(add).toHaveBeenCalledWith('smart-permission-denied', {severity: 'warning', external: true})
		// system-level alert must NOT be cleared while a drive is still denied
		expect(clear).not.toHaveBeenCalledWith('smart-permission-denied')
	})

	test('recovery: no denied drive this scan → clear(smart-permission-denied) so a fixed grant un-sticks', async () => {
		mockListDrives.mockResolvedValue([drive({deviceId: 'sda', healthStatus: 'healthy'})])
		const {livinityd, clear} = fakeDaemon()

		await smartHealthScanHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(clear).toHaveBeenCalledWith('smart-permission-denied')
	})

	test('guard: no ctx.livinityd → resolves {status: skipped}, never throws', async () => {
		const result = await smartHealthScanHandler(fakeJob, {logger: fakeLogger})
		expect(result).toMatchObject({status: 'skipped'})
		expect(mockListDrives).not.toHaveBeenCalled()
	})

	test('listDrives throws → {status: failure} (NOT error), never throws out', async () => {
		mockListDrives.mockRejectedValue(new Error('smartctl exploded'))
		const {livinityd} = fakeDaemon()

		const result = await smartHealthScanHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('failure')
		expect(result.error).toMatch(/smartctl exploded/)
	})

	test('registry: BUILT_IN_HANDLERS[smart-health-scan] is wired', () => {
		expect(BUILT_IN_HANDLERS['smart-health-scan']).toBe(smartHealthScanHandler)
	})
})

// ─────────────────────────────────────────────────────────────────────────
// smartSelfTestShortHandler — DoS guard (not-while-running + unreadable skip)
// ─────────────────────────────────────────────────────────────────────────
describe('smartSelfTestShortHandler', () => {
	test('skips in-progress + unavailable drives; triggers only idle readable ones', async () => {
		mockListDrives.mockResolvedValue([
			drive({deviceId: 'sda', detectionMethod: 'ata', selfTestInProgress: false}), // → triggered
			drive({deviceId: 'sdb', detectionMethod: 'ata', selfTestInProgress: true}), // NOT-WHILE-RUNNING guard
			drive({deviceId: 'sdc', detectionMethod: 'unsupported', healthStatus: 'unavailable'}), // unreadable → skip
		])
		const {livinityd} = fakeDaemon()

		const result = await smartSelfTestShortHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(mockRunSelfTest).toHaveBeenCalledTimes(1)
		expect(mockRunSelfTest).toHaveBeenCalledWith('sda', 'short')
		expect(mockRunSelfTest).not.toHaveBeenCalledWith('sdb', 'short')
		expect(mockRunSelfTest).not.toHaveBeenCalledWith('sdc', 'short')
	})

	test('guard: no ctx.livinityd → {status: skipped}, runSelfTest never called', async () => {
		const result = await smartSelfTestShortHandler(fakeJob, {logger: fakeLogger})
		expect(result).toMatchObject({status: 'skipped'})
		expect(mockRunSelfTest).not.toHaveBeenCalled()
	})

	test('registry: BUILT_IN_HANDLERS[smart-self-test-short] is wired', () => {
		expect(BUILT_IN_HANDLERS['smart-self-test-short']).toBe(smartSelfTestShortHandler)
	})
})
