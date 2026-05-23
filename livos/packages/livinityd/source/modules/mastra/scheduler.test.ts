/**
 * Phase 202-03 Task 6 — AgentScheduler unit tests.
 *
 * Coverage (≥5 PASS):
 *   1. init() arms N node-cron tasks for every enabled row with schedule_cron
 *   2. Rows with invalid cron expressions are skipped + warned (T-202-03)
 *   3. refresh() stops old tasks before arming new (idempotent across calls)
 *   4. T-202-01 — second concurrent fire (Redis SET NX returns null) is
 *      skipped without invoking runOnce a second time
 *   5. runOnce() creates a Memory thread with the right metadata + dispatches
 *      agent.stream() in the background
 *   6. runOnce() throws when the row does not exist
 *
 * Strategy:
 *   - vi.mock('node-cron') so we can capture every schedule() call + drive
 *     the registered handler manually (no real timers needed).
 *   - Hand-rolled mock Redis with `set` returning configurable {acquired,
 *     null} for lock-contention tests.
 *   - Hand-rolled mock memory exposing `saveThread`.
 *   - Hand-rolled mock registry + repo.
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

// node-cron mock — capture the handler per schedule() call.
type CronHandler = () => Promise<void> | void
const cronTasks: Array<{expr: string; handler: CronHandler; stop: () => void; start?: () => void}> = []
vi.mock('node-cron', () => ({
	default: {
		validate: (expr: string) => {
			// Mirror the real regex behaviour for our test fixtures:
			//   - "*/5 * * * *"     valid
			//   - "0 9 * * *"       valid
			//   - "garbage"         invalid
			//   - "0 0 0"           invalid (only 3 fields)
			if (!expr || typeof expr !== 'string') return false
			const fields = expr.trim().split(/\s+/)
			return fields.length === 5 || fields.length === 6
		},
		schedule: (expr: string, handler: CronHandler) => {
			const stop = vi.fn()
			const start = vi.fn()
			cronTasks.push({expr, handler, stop, start} as never)
			return {stop, start}
		},
	},
	validate: (expr: string) => {
		if (!expr || typeof expr !== 'string') return false
		const fields = expr.trim().split(/\s+/)
		return fields.length === 5 || fields.length === 6
	},
	schedule: (expr: string, handler: CronHandler) => {
		const stop = vi.fn()
		cronTasks.push({expr, handler, stop})
		return {stop}
	},
}))

import {AgentScheduler, type SchedulerDeps} from './scheduler.js'
import type {LivosAgent} from '../../db/schema.js'

// --- Fixtures ---------------------------------------------------------------

const newRow = (over: Partial<LivosAgent> = {}): LivosAgent => ({
	id: over.id ?? 'a-' + Math.random().toString(36).slice(2, 6),
	name: over.name ?? 'unnamed',
	instructions: over.instructions ?? 'Do the thing.',
	modelName: over.modelName ?? 'grok-4.3',
	toolIds: over.toolIds ?? [],
	scheduleCron: over.scheduleCron ?? null,
	parentAgentId: over.parentAgentId ?? null,
	enabled: over.enabled ?? true,
	system: over.system ?? false,
	createdAt: over.createdAt ?? new Date(),
	updatedAt: over.updatedAt ?? new Date(),
})

interface MockRedis {
	set: ReturnType<typeof vi.fn>
	del: ReturnType<typeof vi.fn>
}

function makeMockRedis(setBehaviour: 'always-acquire' | 'never-acquire'): MockRedis {
	return {
		set: vi.fn().mockImplementation(async () =>
			setBehaviour === 'always-acquire' ? 'OK' : null,
		),
		del: vi.fn().mockResolvedValue(1),
	}
}

interface MockAgent {
	stream: ReturnType<typeof vi.fn>
}

function makeMockAgent(): MockAgent {
	return {
		stream: vi.fn().mockReturnValue({text: Promise.resolve('agent reply')}),
	}
}

function makeMakers(rows: LivosAgent[], opts: {
	redisBehaviour?: 'always-acquire' | 'never-acquire'
} = {}): {
	scheduler: AgentScheduler
	repo: {listAll: ReturnType<typeof vi.fn>; getById: ReturnType<typeof vi.fn>}
	registry: {get: ReturnType<typeof vi.fn>}
	memory: {saveThread: ReturnType<typeof vi.fn>}
	redis: MockRedis
	logger: {info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>}
	agent: MockAgent
} {
	const repo = {
		listAll: vi.fn().mockResolvedValue(rows),
		getById: vi
			.fn()
			.mockImplementation(async (id: string) =>
				rows.find((r) => r.id === id) ?? null,
			),
	}
	const agent = makeMockAgent()
	const registry = {
		get: vi
			.fn()
			.mockImplementation((id: string) =>
				rows.find((r) => r.id === id) ? agent : undefined,
			),
	}
	const memory = {saveThread: vi.fn().mockResolvedValue(undefined)}
	const redis = makeMockRedis(opts.redisBehaviour ?? 'always-acquire')
	const logger = {info: vi.fn(), warn: vi.fn()}

	const deps: SchedulerDeps = {
		repo: repo as never,
		registry: registry as never,
		memory,
		redis: redis as never,
		logger,
	}
	const scheduler = new AgentScheduler(deps)
	return {scheduler, repo, registry, memory, redis, logger, agent}
}

// --- Tests ------------------------------------------------------------------

describe('AgentScheduler', () => {
	beforeEach(() => {
		cronTasks.length = 0
	})

	test('Test 1: init() arms node-cron tasks for every enabled row with schedule_cron', async () => {
		const rows = [
			newRow({id: 'a', name: 'Alpha', scheduleCron: '*/5 * * * *'}),
			newRow({id: 'b', name: 'Beta', scheduleCron: '0 9 * * *'}),
			newRow({id: 'c', name: 'NoCron'}), // null scheduleCron → not armed
			newRow({id: 'd', name: 'Disabled', scheduleCron: '0 0 * * *', enabled: false}),
		]
		const {scheduler, logger} = makeMakers(rows)
		await scheduler.init()
		// Only 'a' and 'b' should be armed.
		expect(cronTasks.length).toBe(2)
		expect(cronTasks.map((t) => t.expr).sort()).toEqual([
			'*/5 * * * *',
			'0 9 * * *',
		])
		expect(
			logger.info.mock.calls.some((c) =>
				String(c[0]).includes('armed 2 agents'),
			),
		).toBe(true)
	})

	test('Test 2: invalid cron expressions are skipped + warned (T-202-03)', async () => {
		const rows = [
			newRow({id: 'a', name: 'Good', scheduleCron: '*/5 * * * *'}),
			newRow({id: 'b', name: 'Bad', scheduleCron: 'this is not cron'}),
			newRow({id: 'c', name: 'BadShort', scheduleCron: '0 0'}),
		]
		const {scheduler, logger} = makeMakers(rows)
		await scheduler.init()
		expect(cronTasks.length).toBe(1)
		expect(cronTasks[0]!.expr).toBe('*/5 * * * *')
		// Two warns — one per invalid row.
		const warnMsgs = logger.warn.mock.calls.map((c) => String(c[0]))
		expect(warnMsgs.some((m) => m.includes('Bad') && m.includes('invalid cron'))).toBe(true)
		expect(warnMsgs.some((m) => m.includes('BadShort') && m.includes('invalid cron'))).toBe(true)
	})

	test('Test 3: refresh() stops old tasks before arming new (idempotent)', async () => {
		const rows = [
			newRow({id: 'a', name: 'Alpha', scheduleCron: '*/5 * * * *'}),
		]
		const {scheduler} = makeMakers(rows)
		await scheduler.init()
		expect(cronTasks.length).toBe(1)
		const firstStop = cronTasks[0]!.stop
		await scheduler.refresh()
		// Old task stopped, new task created → 2 entries total, first one's
		// stop() invoked exactly once.
		expect(firstStop).toHaveBeenCalledTimes(1)
		expect(cronTasks.length).toBe(2) // captured + recaptured
	})

	test('Test 4: T-202-01 — second concurrent fire bails when Redis NX returns null', async () => {
		const rows = [
			newRow({id: 'a', name: 'Alpha', scheduleCron: '*/5 * * * *'}),
		]
		const {scheduler, redis, registry, memory, logger} = makeMakers(rows, {
			redisBehaviour: 'never-acquire',
		})
		await scheduler.init()
		// Fire the cron handler manually — simulates two ticks racing.
		await cronTasks[0]!.handler()
		// SET was called once; agent.stream / memory.saveThread were NOT called
		// because the lock acquisition returned null.
		expect(redis.set).toHaveBeenCalledTimes(1)
		expect(registry.get).not.toHaveBeenCalled()
		expect(memory.saveThread).not.toHaveBeenCalled()
		// Info logged "prior run still active".
		const infoMsgs = logger.info.mock.calls.map((c) => String(c[0]))
		expect(infoMsgs.some((m) => m.includes('prior run still active'))).toBe(
			true,
		)
		// del was NOT called (we never acquired so we don't release).
		expect(redis.del).not.toHaveBeenCalled()
	})

	test('Test 5: runOnce() creates a Memory thread with metadata + dispatches agent.stream()', async () => {
		const rows = [
			newRow({
				id: 'a',
				name: 'Alpha',
				instructions: 'Sweep the floor.',
				scheduleCron: '*/5 * * * *',
			}),
		]
		const {scheduler, memory, agent} = makeMakers(rows)
		const threadId = await scheduler.runOnce('a', 'manual')
		expect(typeof threadId).toBe('string')
		expect(threadId.startsWith('task-a-')).toBe(true)
		// saveThread called with the right shape.
		expect(memory.saveThread).toHaveBeenCalledTimes(1)
		const savedArg = memory.saveThread.mock.calls[0]![0] as {
			thread: {
				id: string
				resourceId: string
				title?: string
				metadata?: Record<string, unknown>
			}
		}
		expect(savedArg.thread.id).toBe(threadId)
		expect(savedArg.thread.resourceId).toBe('system')
		expect(savedArg.thread.metadata?.taskId).toBe(threadId)
		expect(savedArg.thread.metadata?.agentId).toBe('a')
		expect(savedArg.thread.metadata?.agentName).toBe('Alpha')
		expect(savedArg.thread.metadata?.triggeredBy).toBe('manual')
		// Give the background drain a tick to fire.
		await new Promise((resolve) => setImmediate(resolve))
		expect(agent.stream).toHaveBeenCalledTimes(1)
		// First arg = messages array; second = opts with memory.thread === threadId.
		const streamArgs = agent.stream.mock.calls[0]!
		expect(streamArgs[0]).toEqual([
			{role: 'user', content: 'Sweep the floor.'},
		])
		expect((streamArgs[1] as {memory: {thread: string}}).memory.thread).toBe(
			threadId,
		)
	})

	test('Test 6: runOnce() throws when the row does not exist', async () => {
		const rows = [
			newRow({id: 'a', name: 'Alpha', scheduleCron: '*/5 * * * *'}),
		]
		const {scheduler} = makeMakers(rows)
		await expect(scheduler.runOnce('nope', 'manual')).rejects.toThrow(
			/not found/i,
		)
	})

	test('Test 7: runOnce() with overridePrompt dispatches the override instead of row.instructions', async () => {
		const rows = [
			newRow({
				id: 'a',
				name: 'Alpha',
				instructions: 'Default instructions.',
			}),
		]
		const {scheduler, agent} = makeMakers(rows)
		await scheduler.runOnce('a', 'manual', {overridePrompt: 'Custom prompt'})
		await new Promise((resolve) => setImmediate(resolve))
		expect(agent.stream).toHaveBeenCalledWith(
			[{role: 'user', content: 'Custom prompt'}],
			expect.objectContaining({memory: expect.objectContaining({thread: expect.any(String)})}),
		)
	})

	test('Test 9: Phase 203-08 T-203-04 — pauseAll() stops every armed task; resumeAll() re-arms them', async () => {
		const rows = [
			newRow({id: 'a', name: 'Alpha', scheduleCron: '*/5 * * * *'}),
			newRow({id: 'b', name: 'Beta', scheduleCron: '0 9 * * *'}),
		]
		const {scheduler} = makeMakers(rows)
		await scheduler.init()
		expect(cronTasks.length).toBe(2)
		// Capture the stop spies BEFORE pauseAll consumes them.
		const stops = cronTasks.map((t) => t.stop)
		const paused = scheduler.pauseAll()
		expect(paused.sort()).toEqual(['a', 'b'])
		// Both task.stop() invoked.
		for (const s of stops) {
			expect(s).toHaveBeenCalledTimes(1)
		}
		const resumed = scheduler.resumeAll()
		expect(resumed.sort()).toEqual(['a', 'b'])
		// Second resume = no-op (pausedAgentIds was cleared).
		const resumedAgain = scheduler.resumeAll()
		expect(resumedAgain).toEqual([])
	})

	test('Test 10: Phase 203-08 T-203-04 — drainForRuntimeSwap returns immediately when nothing is running', async () => {
		const rows = [
			newRow({id: 'a', name: 'Alpha', scheduleCron: '*/5 * * * *'}),
		]
		const {scheduler} = makeMakers(rows)
		await scheduler.init()
		const before = Date.now()
		const {paused, wasRunning} = await scheduler.drainForRuntimeSwap({
			timeoutMs: 1000,
		})
		const elapsed = Date.now() - before
		expect(paused).toEqual(['a'])
		expect(wasRunning).toEqual([])
		// Fast-path — no polling loop entered.
		expect(elapsed).toBeLessThan(500)
	})

	test('Test 11: Phase 203-08 T-203-04 — drainForRuntimeSwap waits for in-flight tasks to settle', async () => {
		const rows = [
			newRow({id: 'a', name: 'Alpha', scheduleCron: '*/5 * * * *'}),
		]
		const {scheduler, agent} = makeMakers(rows)
		// Force agent.stream() to return a stream whose text-promise we
		// resolve manually — gives us deterministic control over when the
		// in-flight drain finishes.
		let resolveText: ((v: string) => void) | undefined
		agent.stream.mockReturnValue({
			text: new Promise<string>((r) => {
				resolveText = r
			}),
		})
		// Kick off a run that registers in runningTasks.
		await scheduler.runOnce('a', 'manual')
		// Give the microtask queue a beat so drainAgentStream registers in the set.
		await new Promise((r) => setImmediate(r))

		// drainForRuntimeSwap should NOT resolve until we resolve the text promise.
		let drainSettled = false
		const drainPromise = scheduler
			.drainForRuntimeSwap({timeoutMs: 5000})
			.then((r) => {
				drainSettled = true
				return r
			})
		await new Promise((r) => setTimeout(r, 100))
		expect(drainSettled).toBe(false)

		// Resolve the agent text → background drain finishes → runningTasks clears.
		resolveText!('done')
		const {wasRunning} = await drainPromise
		expect(drainSettled).toBe(true)
		expect(wasRunning).toEqual(['a'])
	})

	test('Test 12: Phase 203-08 T-203-04 — drainForRuntimeSwap times out cleanly when tasks never finish', async () => {
		const rows = [
			newRow({id: 'a', name: 'Alpha', scheduleCron: '*/5 * * * *'}),
		]
		const {scheduler, agent, logger} = makeMakers(rows)
		// Stream that never resolves.
		agent.stream.mockReturnValue({text: new Promise<string>(() => {})})
		await scheduler.runOnce('a', 'manual')
		await new Promise((r) => setImmediate(r))
		const {wasRunning} = await scheduler.drainForRuntimeSwap({timeoutMs: 200})
		// Still recorded the task that was running at drain start.
		expect(wasRunning).toEqual(['a'])
		// Warn logged about the unsettled task.
		const warnMsgs = logger.warn.mock.calls.map((c) => String(c[0]))
		expect(warnMsgs.some((m) => m.includes('still running'))).toBe(true)
	})

	test('Test 8: T-202-01 lock release — del() called after successful acquire run', async () => {
		const rows = [
			newRow({id: 'a', name: 'Alpha', scheduleCron: '*/5 * * * *'}),
		]
		const {scheduler, redis} = makeMakers(rows, {redisBehaviour: 'always-acquire'})
		await scheduler.init()
		await cronTasks[0]!.handler()
		// Allow the background drain to flush.
		await new Promise((resolve) => setImmediate(resolve))
		expect(redis.set).toHaveBeenCalledWith(
			'livos:agent:a:lock',
			'1',
			'PX',
			expect.any(Number),
			'NX',
		)
		expect(redis.del).toHaveBeenCalledWith('livos:agent:a:lock')
	})
})
