// Phase 320 MON-01 — resource-metrics collect/rollup handler unit tests.
//
// Covers (cloned from jobs.disk-critical.unit.test.ts's ctx/logger + module-mock style):
//   collect:
//     1: SKIP-PATH   — no ctx.livinityd → {status:'skipped'}, no reader/insert called
//     2: HAPPY-PATH  — stub livinityd + mocked readers → insertResourceSample called ONCE
//        with cpuPct=currentLoad, memUsedBytes=mem.active, netRxBps=sum(rxSec); {status:'success'}
//     3: FAILURE     — a reader that REJECTS → {status:'failure'} (never throws out of the tick)
//     4: registry    — BUILT_IN_HANDLERS['resource-metrics-collect'] is the same handler
//   rollup:
//     5: SKIP-PATH   — no ctx.livinityd → {status:'skipped'}, aggregate/prune not called
//     6: HAPPY-PATH  — aggregateRollups() runs BEFORE pruneOldRows() (invocationCallOrder); {status:'success'}
//     7: FAILURE     — aggregateRollups() REJECTS → {status:'failure'}; pruneOldRows NOT reached
//     8: registry    — BUILT_IN_HANDLERS['resource-metrics-rollup'] is the same handler
//
// The three collaborators are mocked so the handlers run with zero real system
// probing / PG I/O: '../monitoring/history.js' (insert/aggregate/prune),
// '../monitoring/monitoring.js' (getDiskIO/getNetworkStats), and the default
// 'systeminformation' export (currentLoad/mem). Same isolated-mock approach as
// the disk-critical test mocking '../system/system.js'.

import {beforeEach, describe, expect, test, vi} from 'vitest'

import type {ScheduledJob} from './types.js'

// ---------------------------------------------------------------------------
// Module mocks (hoisted before importing the module under test, per vitest rules)
// ---------------------------------------------------------------------------
vi.mock('../monitoring/history.js', () => ({
	insertResourceSample: vi.fn(),
	aggregateRollups: vi.fn(),
	pruneOldRows: vi.fn(),
}))
vi.mock('../monitoring/monitoring.js', () => ({
	getDiskIO: vi.fn(),
	getNetworkStats: vi.fn(),
}))
vi.mock('systeminformation', () => ({
	default: {currentLoad: vi.fn(), mem: vi.fn()},
}))

import systemInformation from 'systeminformation'

import {aggregateRollups, insertResourceSample, pruneOldRows} from '../monitoring/history.js'
import {getDiskIO, getNetworkStats} from '../monitoring/monitoring.js'
import {
	BUILT_IN_HANDLERS,
	resourceMetricsCollectHandler,
	resourceMetricsRollupHandler,
} from './jobs.js'

// Minimal ScheduledJob-shaped stub — the handlers only read job.name.
const collectJob = {name: 'resource-metrics-collect', type: 'resource-metrics-collect'} as unknown as ScheduledJob
const rollupJob = {name: 'resource-metrics-rollup', type: 'resource-metrics-rollup'} as unknown as ScheduledJob
const fakeLogger = {log: vi.fn(), error: vi.fn()}
// Handlers only test truthiness of ctx.livinityd (never call a method on it here).
const fakeLivinityd = {} as never

// Typed handles onto the hoisted mocks.
const mockCurrentLoad = vi.mocked(systemInformation.currentLoad)
const mockMem = vi.mocked(systemInformation.mem)
const mockGetDiskIO = vi.mocked(getDiskIO)
const mockGetNetworkStats = vi.mocked(getNetworkStats)
const mockInsertSample = vi.mocked(insertResourceSample)
const mockAggregate = vi.mocked(aggregateRollups)
const mockPrune = vi.mocked(pruneOldRows)

beforeEach(() => {
	vi.clearAllMocks()
})

describe('resourceMetricsCollectHandler', () => {
	test('SKIP-PATH: no ctx.livinityd → {status:skipped}, no reader/insert called', async () => {
		const result = await resourceMetricsCollectHandler(collectJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
		expect(mockCurrentLoad).not.toHaveBeenCalled()
		expect(mockInsertSample).not.toHaveBeenCalled()
	})

	test('HAPPY-PATH: readers → insertResourceSample called once with mapped sample (netRx = Σ rxSec)', async () => {
		mockCurrentLoad.mockResolvedValue({currentLoad: 42} as never)
		mockMem.mockResolvedValue({active: 8_000_000, total: 16_000_000} as never)
		mockGetDiskIO.mockResolvedValue({rIO: 0, wIO: 0, rIOSec: 111, wIOSec: 222})
		mockGetNetworkStats.mockResolvedValue([
			{iface: 'eth0', rxBytes: 0, txBytes: 0, rxSec: 10, txSec: 20},
			{iface: 'eth1', rxBytes: 0, txBytes: 0, rxSec: 5, txSec: 7},
		])
		mockInsertSample.mockResolvedValue(null)

		const result = await resourceMetricsCollectHandler(collectJob, {logger: fakeLogger, livinityd: fakeLivinityd})

		expect(result.status).toBe('success')
		expect(mockInsertSample).toHaveBeenCalledTimes(1)
		expect(mockInsertSample).toHaveBeenCalledWith({
			cpuPct: 42,
			memUsedBytes: 8_000_000,
			memTotalBytes: 16_000_000,
			diskReadBps: 111,
			diskWriteBps: 222,
			netRxBps: 15, // 10 + 5
			netTxBps: 27, // 20 + 7
		})
	})

	test('null rxSec/txSec (first-call) coalesce to 0, disk null passes through', async () => {
		mockCurrentLoad.mockResolvedValue({currentLoad: 1} as never)
		mockMem.mockResolvedValue({active: 1, total: 2} as never)
		mockGetDiskIO.mockResolvedValue({rIO: 0, wIO: 0, rIOSec: null, wIOSec: null})
		mockGetNetworkStats.mockResolvedValue([{iface: 'eth0', rxBytes: 0, txBytes: 0, rxSec: null, txSec: null}])
		mockInsertSample.mockResolvedValue(null)

		const result = await resourceMetricsCollectHandler(collectJob, {logger: fakeLogger, livinityd: fakeLivinityd})

		expect(result.status).toBe('success')
		expect(mockInsertSample).toHaveBeenCalledWith(
			expect.objectContaining({diskReadBps: null, diskWriteBps: null, netRxBps: 0, netTxBps: 0}),
		)
	})

	test('FAILURE: a reader that rejects → {status:failure}, never throws out of the handler', async () => {
		mockCurrentLoad.mockResolvedValue({currentLoad: 1} as never)
		mockMem.mockResolvedValue({active: 1, total: 2} as never)
		mockGetDiskIO.mockRejectedValue(new Error('disksIO boom'))
		mockGetNetworkStats.mockResolvedValue([])

		const result = await resourceMetricsCollectHandler(collectJob, {logger: fakeLogger, livinityd: fakeLivinityd})

		expect(result.status).toBe('failure')
		expect(result.error).toContain('disksIO boom')
		expect(mockInsertSample).not.toHaveBeenCalled()
	})

	test('registry: BUILT_IN_HANDLERS[resource-metrics-collect] is wired and skips cleanly', async () => {
		const handler = BUILT_IN_HANDLERS['resource-metrics-collect']
		expect(handler).toBe(resourceMetricsCollectHandler)
		const result = await handler(collectJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
	})
})

describe('resourceMetricsRollupHandler', () => {
	test('SKIP-PATH: no ctx.livinityd → {status:skipped}, aggregate/prune not called', async () => {
		const result = await resourceMetricsRollupHandler(rollupJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
		expect(mockAggregate).not.toHaveBeenCalled()
		expect(mockPrune).not.toHaveBeenCalled()
	})

	test('HAPPY-PATH: aggregateRollups() runs BEFORE pruneOldRows() → {status:success}', async () => {
		mockAggregate.mockResolvedValue(undefined)
		mockPrune.mockResolvedValue(undefined)

		const result = await resourceMetricsRollupHandler(rollupJob, {logger: fakeLogger, livinityd: fakeLivinityd})

		expect(result.status).toBe('success')
		expect(mockAggregate).toHaveBeenCalledTimes(1)
		expect(mockPrune).toHaveBeenCalledTimes(1)
		// aggregate-before-prune via the global monotonic invocation counter.
		const aggregateOrder = mockAggregate.mock.invocationCallOrder[0]
		const pruneOrder = mockPrune.mock.invocationCallOrder[0]
		expect(aggregateOrder).toBeLessThan(pruneOrder)
	})

	test('FAILURE: aggregateRollups() rejects → {status:failure}, pruneOldRows NOT reached', async () => {
		mockAggregate.mockRejectedValue(new Error('rollup boom'))
		mockPrune.mockResolvedValue(undefined)

		const result = await resourceMetricsRollupHandler(rollupJob, {logger: fakeLogger, livinityd: fakeLivinityd})

		expect(result.status).toBe('failure')
		expect(result.error).toContain('rollup boom')
		expect(mockPrune).not.toHaveBeenCalled()
	})

	test('registry: BUILT_IN_HANDLERS[resource-metrics-rollup] is wired and skips cleanly', async () => {
		const handler = BUILT_IN_HANDLERS['resource-metrics-rollup']
		expect(handler).toBe(resourceMetricsRollupHandler)
		const result = await handler(rollupJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
	})
})
