// Phase 23 (AID-02) — ai-resource-watch unit tests.
//
// Covers:
//   1-6: isThresholdExceeded() pure-function boundary + priority tests
//   7:   handler shape with mocked Docker / Kimi / PG (3 containers — one
//        healthy, one stressed-no-recent-alert, one stressed-with-recent-alert
//        for dedupe coverage)
//   8:   _throttledTimeCache delta correctness across two handler invocations
//
// Mocks:
//   - dockerode (default + getContainer + stats)         — for raw stats access
//   - ./docker.js  listContainers + inspectContainer +
//                  getContainerLogs                       — for handler input
//   - ./ai-alerts.js  findRecentAlertByKind + insertAiAlert — for dedupe + persist
//   - ./ai-diagnostics.js  callKimi + redactSecrets       — Plan 23-01 deps

import {beforeEach, describe, expect, test, vi} from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks (defined BEFORE importing the module under test, per vitest hoisting rules)
// ---------------------------------------------------------------------------

const mockListContainers = vi.fn()
const mockInspectContainer = vi.fn()
const mockGetContainerLogs = vi.fn()
const mockFindRecentAlertByKind = vi.fn()
const mockInsertAiAlert = vi.fn()
const mockCallKimi = vi.fn()
const mockGetContainer = vi.fn()
const mockStats = vi.fn()

vi.mock('./docker.js', () => ({
	listContainers: (...args: unknown[]) => mockListContainers(...args),
	inspectContainer: (...args: unknown[]) => mockInspectContainer(...args),
	getContainerLogs: (...args: unknown[]) => mockGetContainerLogs(...args),
}))

vi.mock('./ai-alerts.js', () => ({
	findRecentAlertByKind: (...args: unknown[]) => mockFindRecentAlertByKind(...args),
	insertAiAlert: (...args: unknown[]) => mockInsertAiAlert(...args),
}))

vi.mock('./ai-diagnostics.js', () => ({
	callKimi: (...args: unknown[]) => mockCallKimi(...args),
	redactSecrets: (s: string) => s, // identity in tests; the real function is covered by ai-diagnostics.unit.test.ts
}))

vi.mock('dockerode', () => {
	// Mock the default export — `new Dockerode()` returns an object with getContainer().
	// Each call to getContainer(name) returns an object with stats({stream:false}) -> mockStats(name).
	const Dockerode = vi.fn().mockImplementation(() => ({
		getContainer: (name: string) => {
			mockGetContainer(name)
			return {
				stats: (opts: {stream: boolean}) => mockStats(name, opts),
			}
		},
	}))
	return {default: Dockerode}
})

// Now import after the mocks are registered
import {
	aiResourceWatchHandler,
	isThresholdExceeded,
	_resetThrottleCacheForTests,
} from './ai-resource-watch.js'

const ctx = {
	logger: {
		log: vi.fn(),
		error: vi.fn(),
	},
}

const baseJob = {
	id: 'job-uuid-1',
	name: 'ai-resource-watch',
	schedule: '*/5 * * * *',
	type: 'ai-resource-watch' as const,
	config: {},
	enabled: true,
	lastRun: null,
	lastRunStatus: null,
	lastRunError: null,
	lastRunOutput: null,
	nextRun: null,
	createdAt: new Date(),
	updatedAt: new Date(),
}

// ---------------------------------------------------------------------------
// Pure-function tests (1-6) — no mocks needed
// ---------------------------------------------------------------------------

describe('isThresholdExceeded', () => {
	test('1. healthy container returns null', () => {
		expect(
			isThresholdExceeded({memoryPercent: 79, throttledTimeDelta: 0, restartCount: 0}),
		).toBeNull()
	})

	test('2. memory > 80% (and < 95) returns warning memory-pressure', () => {
		expect(
			isThresholdExceeded({memoryPercent: 81, throttledTimeDelta: 0, restartCount: 0}),
		).toEqual({kind: 'memory-pressure', severity: 'warning'})
	})

	test('3. memory >= 95% returns critical memory-pressure', () => {
		expect(
			isThresholdExceeded({memoryPercent: 96, throttledTimeDelta: 0, restartCount: 0}),
		).toEqual({kind: 'memory-pressure', severity: 'critical'})
	})

	test('4. CPU throttled time delta > 0 returns warning cpu-throttle', () => {
		expect(
			isThresholdExceeded({memoryPercent: 50, throttledTimeDelta: 1_000_000, restartCount: 0}),
		).toEqual({kind: 'cpu-throttle', severity: 'warning'})
	})

	test('5. restartCount >= 3 returns warning restart-loop', () => {
		expect(
			isThresholdExceeded({memoryPercent: 50, throttledTimeDelta: 0, restartCount: 5}),
		).toEqual({kind: 'restart-loop', severity: 'warning'})
	})

	test('6. priority: critical-memory > restart-loop > cpu-throttle when all three trigger', () => {
		expect(
			isThresholdExceeded({memoryPercent: 96, throttledTimeDelta: 1_000_000, restartCount: 5}),
		).toEqual({kind: 'memory-pressure', severity: 'critical'})
	})
})

// ---------------------------------------------------------------------------
// Handler shape tests (7-8) — full mocks
// ---------------------------------------------------------------------------

function buildRawStats(opts: {
	memUsage: number
	memCache: number
	memLimit: number
	throttledTime: number
}) {
	return {
		memory_stats: {
			usage: opts.memUsage,
			limit: opts.memLimit,
			stats: {cache: opts.memCache},
		},
		cpu_stats: {
			cpu_usage: {total_usage: 1_000_000_000},
			throttling_data: {periods: 100, throttled_periods: 0, throttled_time: opts.throttledTime},
		},
		precpu_stats: {
			cpu_usage: {total_usage: 900_000_000},
		},
	}
}

describe('aiResourceWatchHandler', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		_resetThrottleCacheForTests()
	})

	test('7. dedupes per (container, kind): kimi called once, insert called once across 3 containers', async () => {
		// 3 containers: healthy, stressed-fresh, stressed-recent
		mockListContainers.mockResolvedValue([
			{id: 'c0id', name: 'healthy', state: 'running', image: 'nginx:alpine'},
			{id: 'c1id', name: 'stressed-fresh', state: 'running', image: 'postgres:14'},
			{id: 'c2id', name: 'stressed-recent', state: 'running', image: 'redis:7'},
		])

		// Stats: c0 healthy (50% mem); c1 + c2 over 80% mem
		mockStats.mockImplementation(async (name: string) => {
			if (name === 'healthy') {
				return buildRawStats({
					memUsage: 50_000_000,
					memCache: 0,
					memLimit: 100_000_000,
					throttledTime: 0,
				})
			}
			// 90% memory -> warning memory-pressure
			return buildRawStats({
				memUsage: 90_000_000,
				memCache: 0,
				memLimit: 100_000_000,
				throttledTime: 0,
			})
		})

		mockInspectContainer.mockResolvedValue({
			id: 'irrelevant',
			state: 'running',
			restartCount: 0,
			healthStatus: null,
			image: 'irrelevant',
		})
		mockGetContainerLogs.mockResolvedValue('mock log line')

		// Dedupe: c1 has no recent alert, c2 already has one
		mockFindRecentAlertByKind.mockImplementation(async (containerName: string) => {
			if (containerName === 'stressed-recent') {
				return {
					id: 'existing-alert',
					containerName: 'stressed-recent',
					environmentId: null,
					severity: 'warning',
					kind: 'memory-pressure',
					message: 'previous',
					payloadJson: {},
					createdAt: new Date().toISOString(),
					dismissedAt: null,
				}
			}
			return null
		})

		mockCallKimi.mockResolvedValue({
			text: 'Will OOM in approximately 10 minutes unless memory limit increased. Recommended: docker update --memory 2G stressed-fresh.',
			inputTokens: 200,
			outputTokens: 80,
		})

		mockInsertAiAlert.mockImplementation(async (input: any) => ({
			id: 'new-alert-uuid',
			...input,
			createdAt: new Date().toISOString(),
			dismissedAt: null,
		}))

		const result = await aiResourceWatchHandler(baseJob, ctx as any)

		expect(result.status).toBe('success')
		expect(result.output).toEqual({
			checked: 3,
			alertsCreated: 1,
			alertsSkippedDeduped: 1,
			errors: 0,
		})

		// Kimi called exactly once (for stressed-fresh, not for stressed-recent)
		expect(mockCallKimi).toHaveBeenCalledTimes(1)
		// insertAiAlert called exactly once with kind='memory-pressure'
		expect(mockInsertAiAlert).toHaveBeenCalledTimes(1)
		const insertCall = mockInsertAiAlert.mock.calls[0][0]
		expect(insertCall.containerName).toBe('stressed-fresh')
		expect(insertCall.kind).toBe('memory-pressure')
		expect(insertCall.severity).toBe('warning')

		// findRecentAlertByKind called exactly twice (only for stressed containers, not for healthy)
		expect(mockFindRecentAlertByKind).toHaveBeenCalledTimes(2)
	})

	test('8. throttledTime delta is computed against the cache (delta=4000 on second run)', async () => {
		mockListContainers.mockResolvedValue([
			{id: 'cpu-id', name: 'cpu-throttler', state: 'running', image: 'app:latest'},
		])

		// Run 1: throttled_time=1000 (no prior cache → delta=0 from itself, no alert)
		// Run 2: throttled_time=5000 (delta = 5000 - 1000 = 4000 > 0 → cpu-throttle warning)
		let callCount = 0
		mockStats.mockImplementation(async () => {
			callCount++
			return buildRawStats({
				memUsage: 30_000_000,
				memCache: 0,
				memLimit: 100_000_000,
				throttledTime: callCount === 1 ? 1000 : 5000,
			})
		})

		mockInspectContainer.mockResolvedValue({
			id: 'cpu-id',
			state: 'running',
			restartCount: 0,
			healthStatus: null,
			image: 'app:latest',
		})
		mockGetContainerLogs.mockResolvedValue('mock logs')
		mockFindRecentAlertByKind.mockResolvedValue(null)
		mockCallKimi.mockResolvedValue({
			text: 'Will continue throttling indefinitely unless cpu_quota raised.',
			inputTokens: 100,
			outputTokens: 30,
		})
		mockInsertAiAlert.mockImplementation(async (input: any) => ({
			id: 'a',
			...input,
			createdAt: new Date().toISOString(),
			dismissedAt: null,
		}))

		// First run: primes the cache; delta is 0 (current vs current) → no alert
		const r1 = await aiResourceWatchHandler(baseJob, ctx as any)
		expect((r1.output as any).alertsCreated).toBe(0)

		// Second run: delta = 5000 - 1000 = 4000 → cpu-throttle warning
		const r2 = await aiResourceWatchHandler(baseJob, ctx as any)
		expect((r2.output as any).alertsCreated).toBe(1)

		// Verify the insert payload has cpu-throttle kind
		const insertCall = mockInsertAiAlert.mock.calls[0][0]
		expect(insertCall.kind).toBe('cpu-throttle')
		expect(insertCall.severity).toBe('warning')
	})
})
