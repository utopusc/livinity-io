/**
 * ComputerUseContainerManager unit tests — Phase 71-04 (CU-FOUND-06).
 *
 * Mocked dependencies — no real Docker, no real PG.
 *   - apps:           stub object with installForUser/uninstallForUser methods
 *   - pool:           mocked-pool pattern from 71-03 task-repository.test.ts
 *   - dockerInspect:  DI seam (constructor accepts optional DockerInspectFn)
 *   - getUserAppInstance: vi.mock'd module re-export from database/index.js
 *
 * Coverage (>= 12 cases):
 *   ensureContainer:     5 — cached running, restart on stopped, fresh install,
 *                            race retry inconsistent, 15s timeout
 *   stopContainer:       2 — happy path, absent (no-op)
 *   getStatus:           4 — absent, idle (no containerId), running, stopped
 *   bumpActivity:        1 — passes userId through
 *   tickIdleTimeouts:    2 — iterates + logs each, catches iteration error
 *   start/stop interval: 2 — boots/clears interval, idempotent start
 */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import type {Pool} from 'pg'

import {
	ComputerUseContainerManager,
	IDLE_THRESHOLD_MS,
	TICK_INTERVAL_MS,
	SPAWN_BUDGET_MS,
	type DockerInspectFn,
} from './container-manager.js'

// ─────────────────────────────────────────────────────────────────────
// Mock factories
// ─────────────────────────────────────────────────────────────────────

type QueryHandler = (text: string, values: unknown[]) => any

function makePool(handlers: QueryHandler[]): Pool {
	let i = 0
	return {
		query: vi.fn(async (text: string, values: unknown[] = []) => {
			const handler = handlers[i++]
			if (!handler) throw new Error(`unexpected query #${i}: ${text.slice(0, 80)}`)
			return handler(text, values)
		}),
	} as unknown as Pool
}

function makeApps() {
	return {
		installForUser: vi.fn(async (_appId: string, _userId: string) => true),
		uninstallForUser: vi.fn(async (_appId: string, _userId: string) => true),
	} as any
}

function makeLogger() {
	const child: any = {
		log: vi.fn(),
		error: vi.fn(),
		verbose: vi.fn(),
		createChildLogger: () => child,
	}
	return child
}

const FAKE_TASK_ROW = (overrides: Record<string, unknown> = {}) => ({
	id: 'task-1',
	user_id: 'user-1',
	status: 'active' as const,
	container_id: 'docker-abc',
	port: 14101,
	last_activity: new Date('2026-05-04T10:00:00Z'),
	created_at: new Date('2026-05-04T10:00:00Z'),
	stopped_at: null,
	...overrides,
})

// Mock the database/index.ts re-export — getUserAppInstance lives there.
// We patch it for every test in this file (independent of pg.Pool).
vi.mock('../database/index.js', async (importActual) => {
	const actual = await importActual<typeof import('../database/index.js')>()
	return {
		...actual,
		getUserAppInstance: vi.fn(async (userId: string, appId: string) => ({
			id: 'instance-1',
			userId,
			appId,
			subdomain: 'desktop',
			containerName: 'docker-abc',
			port: 14101,
			volumePath: '/tmp/livos-test/users/u1/app-data/bytebot-desktop',
			status: 'running',
			createdAt: new Date('2026-05-04T10:00:00Z'),
		})),
	}
})

// Mock execa so the docker compose calls in restart/stop paths are no-ops.
vi.mock('execa', () => ({
	$: (_strings: TemplateStringsArray, ..._values: unknown[]) =>
		Object.assign(Promise.resolve({stdout: '', stderr: '', exitCode: 0}), {
			catch: (handler: (e: unknown) => any) =>
				Promise.resolve({stdout: '', stderr: '', exitCode: 0}).catch(handler),
		}),
}))

// ─────────────────────────────────────────────────────────────────────
// ensureContainer
// ─────────────────────────────────────────────────────────────────────

describe('ensureContainer', () => {
	it('returns cached when active task + container running (no install call)', async () => {
		const apps = makeApps()
		const pool = makePool([
			() => ({rows: [FAKE_TASK_ROW()]}), // getActiveTask returns active row
		])
		const dockerInspect: DockerInspectFn = vi.fn(async () => ({running: true}))
		const mgr = new ComputerUseContainerManager({
			apps,
			pool,
			logger: makeLogger(),
			dockerInspect,
		})

		const result = await mgr.ensureContainer('user-1')

		expect(result.taskId).toBe('task-1')
		expect(result.containerId).toBe('docker-abc')
		expect(result.port).toBe(14101)
		expect(result.subdomain).toBe('desktop')
		expect(apps.installForUser).not.toHaveBeenCalled()
		expect(dockerInspect).toHaveBeenCalledWith('docker-abc')
	})

	it('restarts compose when active task exists but container not running', async () => {
		const apps = makeApps()
		const pool = makePool([
			() => ({rows: [FAKE_TASK_ROW()]}), // getActiveTask returns active row
		])
		const dockerInspect: DockerInspectFn = vi.fn(async () => ({running: false}))
		const mgr = new ComputerUseContainerManager({
			apps,
			pool,
			logger: makeLogger(),
			dockerInspect,
		})

		const result = await mgr.ensureContainer('user-1')

		// Should NOT call installForUser — restart path uses existing compose
		expect(apps.installForUser).not.toHaveBeenCalled()
		expect(result.subdomain).toBe('desktop')
		expect(result.taskId).toBe('task-1')
	})

	it('creates fresh task + calls installForUser when no existing task', async () => {
		const apps = makeApps()
		const pool = makePool([
			() => ({rows: []}), // getActiveTask → null
			() => ({rows: [FAKE_TASK_ROW()]}), // createActiveTask returns new row
			() => ({rows: []}), // updateContainerInfo
		])
		const dockerInspect: DockerInspectFn = vi.fn(async () => ({running: true}))
		const mgr = new ComputerUseContainerManager({
			apps,
			pool,
			logger: makeLogger(),
			dockerInspect,
		})

		const result = await mgr.ensureContainer('user-1')

		expect(apps.installForUser).toHaveBeenCalledWith('bytebot-desktop', 'user-1')
		expect(result.subdomain).toBe('desktop')
		expect(result.taskId).toBe('task-1')
	})

	it('rejects with state-inconsistent error when 23505 race + re-fetch returns null', async () => {
		const apps = makeApps()
		const pool = makePool([
			() => ({rows: []}), // getActiveTask → null (initial)
			() => {
				// createActiveTask throws "already active" (translated 23505 from task-repo)
				throw new Error('Container already active for user')
			},
			() => ({rows: []}), // re-getActiveTask → STILL null (true inconsistency)
		])
		const mgr = new ComputerUseContainerManager({
			apps,
			pool,
			logger: makeLogger(),
			dockerInspect: async () => ({running: false}),
		})

		await expect(mgr.ensureContainer('user-1')).rejects.toThrow(/state inconsistent/)
	})

	it('rejects with 15s budget error when spawn takes too long', async () => {
		vi.useFakeTimers()
		const apps = makeApps()
		// Make installForUser hang forever so only the timeout fires.
		apps.installForUser = vi.fn(() => new Promise(() => {}))
		const pool = makePool([
			() => ({rows: []}), // getActiveTask → null
			() => ({rows: [FAKE_TASK_ROW()]}), // createActiveTask
		])
		const mgr = new ComputerUseContainerManager({
			apps,
			pool,
			logger: makeLogger(),
			dockerInspect: async () => ({running: false}),
		})

		const promise = mgr.ensureContainer('user-1')
		// Attach the rejection handler before advancing timers so the rejection
		// is observed and Node doesn't print an unhandled-rejection warning.
		const expectation = expect(promise).rejects.toThrow(/15s budget/)
		await vi.advanceTimersByTimeAsync(SPAWN_BUDGET_MS + 1)
		await expectation

		vi.useRealTimers()
	})
})

// ─────────────────────────────────────────────────────────────────────
// stopContainer
// ─────────────────────────────────────────────────────────────────────

describe('stopContainer', () => {
	it('happy path: looks up active task, marks stopped', async () => {
		const apps = makeApps()
		const pool = makePool([
			() => ({rows: [FAKE_TASK_ROW()]}), // getActiveTask returns active row
			() => ({rows: []}), // markStopped
		])
		const mgr = new ComputerUseContainerManager({
			apps,
			pool,
			logger: makeLogger(),
			dockerInspect: async () => ({running: false}),
		})

		await expect(mgr.stopContainer('user-1')).resolves.toBeUndefined()
	})

	it('no-ops when no active task exists', async () => {
		const apps = makeApps()
		const pool = makePool([
			() => ({rows: []}), // getActiveTask → null
		])
		const mgr = new ComputerUseContainerManager({
			apps,
			pool,
			logger: makeLogger(),
			dockerInspect: async () => ({running: false}),
		})

		await expect(mgr.stopContainer('user-1')).resolves.toBeUndefined()
	})
})

// ─────────────────────────────────────────────────────────────────────
// getStatus
// ─────────────────────────────────────────────────────────────────────

describe('getStatus', () => {
	it('returns "absent" when no active task', async () => {
		const pool = makePool([() => ({rows: []})])
		const mgr = new ComputerUseContainerManager({
			apps: makeApps(),
			pool,
			logger: makeLogger(),
			dockerInspect: async () => ({running: false}),
		})
		expect(await mgr.getStatus('user-1')).toBe('absent')
	})

	it('returns "idle" when active task has no containerId', async () => {
		const pool = makePool([() => ({rows: [FAKE_TASK_ROW({container_id: null})]})])
		const mgr = new ComputerUseContainerManager({
			apps: makeApps(),
			pool,
			logger: makeLogger(),
			dockerInspect: async () => ({running: false}),
		})
		expect(await mgr.getStatus('user-1')).toBe('idle')
	})

	it('returns "running" when container running', async () => {
		const pool = makePool([() => ({rows: [FAKE_TASK_ROW()]})])
		const mgr = new ComputerUseContainerManager({
			apps: makeApps(),
			pool,
			logger: makeLogger(),
			dockerInspect: async () => ({running: true}),
		})
		expect(await mgr.getStatus('user-1')).toBe('running')
	})

	it('returns "stopped" when container not running and task.status is active', async () => {
		const pool = makePool([() => ({rows: [FAKE_TASK_ROW()]})])
		const mgr = new ComputerUseContainerManager({
			apps: makeApps(),
			pool,
			logger: makeLogger(),
			dockerInspect: async () => ({running: false}),
		})
		expect(await mgr.getStatus('user-1')).toBe('stopped')
	})
})

// ─────────────────────────────────────────────────────────────────────
// bumpActivity
// ─────────────────────────────────────────────────────────────────────

describe('bumpActivity', () => {
	it('delegates to repo bumpActivity for the given user', async () => {
		const calls: string[] = []
		const pool = makePool([
			(text, values) => {
				calls.push(text)
				expect(values).toEqual(['user-1'])
				return {rows: []}
			},
		])
		const mgr = new ComputerUseContainerManager({
			apps: makeApps(),
			pool,
			logger: makeLogger(),
			dockerInspect: async () => ({running: false}),
		})
		await mgr.bumpActivity('user-1')
		expect(calls[0]).toContain('last_activity = now()')
	})
})

// ─────────────────────────────────────────────────────────────────────
// tickIdleTimeouts
// ─────────────────────────────────────────────────────────────────────

describe('tickIdleTimeouts', () => {
	it('iterates findIdleCandidates and calls stopContainer for each', async () => {
		const apps = makeApps()
		const candidatesA = FAKE_TASK_ROW({user_id: 'user-A'})
		const candidatesB = FAKE_TASK_ROW({id: 'task-2', user_id: 'user-B'})
		const pool = makePool([
			() => ({rows: [candidatesA, candidatesB]}), // findIdleCandidates returns 2
			() => ({rows: [candidatesA]}), // stopContainer→getActiveTask for user-A
			() => ({rows: []}), // stopContainer→markStopped for user-A
			() => ({rows: [candidatesB]}), // stopContainer→getActiveTask for user-B
			() => ({rows: []}), // stopContainer→markStopped for user-B
		])
		const logger = makeLogger()
		const mgr = new ComputerUseContainerManager({
			apps,
			pool,
			logger,
			dockerInspect: async () => ({running: false}),
		})
		await mgr.tickIdleTimeouts()
		// Two stop log lines expected (one per candidate).
		expect(logger.log).toHaveBeenCalledTimes(2)
		// Verify the threshold was passed to findIdleCandidates as IDLE_THRESHOLD_MS.
		expect((pool.query as any).mock.calls[0][1]).toEqual([IDLE_THRESHOLD_MS])
	})

	it('catches errors inside iteration and continues without throwing', async () => {
		const apps = makeApps()
		const pool = makePool([
			() => {
				throw new Error('PG down')
			},
		])
		const logger = makeLogger()
		const mgr = new ComputerUseContainerManager({
			apps,
			pool,
			logger,
			dockerInspect: async () => ({running: false}),
		})
		await expect(mgr.tickIdleTimeouts()).resolves.toBeUndefined()
		expect(logger.error).toHaveBeenCalled()
	})
})

// ─────────────────────────────────────────────────────────────────────
// start / stop interval handle
// ─────────────────────────────────────────────────────────────────────

describe('start / stop interval', () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => vi.useRealTimers())

	it('boots a setInterval on start() and clears it on stop()', () => {
		const setSpy = vi.spyOn(global, 'setInterval')
		const clearSpy = vi.spyOn(global, 'clearInterval')
		const mgr = new ComputerUseContainerManager({
			apps: makeApps(),
			pool: makePool([]),
			logger: makeLogger(),
			dockerInspect: async () => ({running: false}),
		})
		mgr.start()
		expect(setSpy).toHaveBeenCalledWith(expect.any(Function), TICK_INTERVAL_MS)
		mgr.stop()
		expect(clearSpy).toHaveBeenCalled()
	})

	it('start() is idempotent — second call does not double-schedule', () => {
		const setSpy = vi.spyOn(global, 'setInterval')
		const mgr = new ComputerUseContainerManager({
			apps: makeApps(),
			pool: makePool([]),
			logger: makeLogger(),
			dockerInspect: async () => ({running: false}),
		})
		mgr.start()
		mgr.start()
		expect(setSpy).toHaveBeenCalledTimes(1)
		mgr.stop()
	})
})
