// Phase 343-02 RESIL-02 — oomWatchHandler unit tests.
//
// Mirrors the jobs.app-update-window.unit.test.ts harness (fake job, fakeLogger,
// daemonWith({apps:{instances:[app]}}), makeApp store.get switch). The raw OOM inspect
// is routed through the module-scoped `oomInspector.read` seam so NO real docker socket
// is touched (offline dev host); each test overwrites it with a keyed fake.
//
// Covers:
//   - SKIP-PATH: no ctx.livinityd → {status:'skipped'}, never throws.
//   - registry: BUILT_IN_HANDLERS['oom-watch'] === oomWatchHandler.
//   - happy restart: ready + OOMKilled + selfHeal undefined → restart() once + warning alert.
//   - opt-out: oomSelfHeal false + OOM → no restart, no alert.
//   - state-ownership skip: state 'stopped' + OOM → no restart.
//   - debug skip: debugMode true + OOM → no restart.
//   - window breach: 4th OOM tick → no restart + critical app-oom-loop alert.
//   - per-app isolation: one app whose inspect throws does not fail the tick.

import {describe, expect, test, vi, beforeEach} from 'vitest'

import type {ScheduledJob} from '../scheduler/types.js'
import {BUILT_IN_HANDLERS} from '../scheduler/jobs.js'
import {oomWatchHandler, oomInspector, _resetOomWindowForTests, type OomInspectSnapshot} from './oom-watch.js'

const fakeJob = {name: 'oom-watch', type: 'oom-watch'} as unknown as ScheduledJob
const fakeLogger = {log: vi.fn(), error: vi.fn()}

const OOM: OomInspectSnapshot = {oomKilled: true, status: 'exited', exitCode: 137}
const HEALTHY: OomInspectSnapshot = {oomKilled: false, status: 'running', exitCode: 0}

// Build an installed-app stub. `state` drives ownership; store.get answers per-key.
function makeApp(opts: {
	id: string
	state: string
	oomSelfHeal?: boolean
	debugMode?: boolean
	memoryLimit?: number
	restart: ReturnType<typeof vi.fn>
	containerName?: string | undefined
}) {
	return {
		id: opts.id,
		state: opts.state,
		restart: opts.restart,
		getMainContainerName: vi.fn().mockResolvedValue(
			opts.containerName === undefined && 'containerName' in opts ? undefined : (opts.containerName ?? `${opts.id}_app_1`),
		),
		store: {
			get: vi.fn(async (key: string) => {
				if (key === 'oomSelfHeal') return opts.oomSelfHeal
				if (key === 'debugMode') return opts.debugMode
				if (key === 'memoryLimit') return opts.memoryLimit
				return undefined
			}),
		},
	}
}

// A notifications double capturing add() calls; add() is fire-and-forget in the handler.
function makeNotifications() {
	return {add: vi.fn().mockResolvedValue(true), clear: vi.fn().mockResolvedValue(true)}
}

function daemonWith(apps: ReturnType<typeof makeApp>[], notifications: ReturnType<typeof makeNotifications>) {
	return {apps: {instances: apps}, notifications} as never
}

// Point the inspect seam at a name→snapshot map (or a thrower for the isolation case).
function stubInspect(byName: Record<string, OomInspectSnapshot | Error>) {
	oomInspector.read = vi.fn(async (name: string) => {
		const v = byName[name]
		if (v instanceof Error) throw v
		return v ?? HEALTHY
	})
}

const realRead = oomInspector.read

describe('oomWatchHandler — inspect-based OOM self-heal (restart + alert, 3/60min cap)', () => {
	beforeEach(() => {
		_resetOomWindowForTests()
		fakeLogger.log.mockClear()
		fakeLogger.error.mockClear()
		oomInspector.read = realRead
	})

	test('SKIP-PATH: no ctx.livinityd → resolves, never throws, {status: skipped}', async () => {
		const result = await oomWatchHandler(fakeJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
	})

	test('registry: BUILT_IN_HANDLERS[oom-watch] is wired and skips cleanly without a daemon', async () => {
		const handler = BUILT_IN_HANDLERS['oom-watch']
		expect(handler).toBe(oomWatchHandler)
		const result = await handler(fakeJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
	})

	test('happy restart: ready + OOMKilled + selfHeal undefined → restart() once + warning alert', async () => {
		const restart = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', state: 'ready', memoryLimit: 512_000_000, restart})
		stubInspect({gitea_app_1: OOM})
		const notifications = makeNotifications()

		const result = await oomWatchHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith([app], notifications)})

		expect(result.status).toBe('success')
		expect(restart).toHaveBeenCalledTimes(1)
		expect(notifications.add).toHaveBeenCalledTimes(1)
		expect(notifications.add).toHaveBeenCalledWith('app-oom-restarted:gitea', {severity: 'warning', external: true})
		expect((result.output as {restarted: number}).restarted).toBe(1)
	})

	test('opt-out: oomSelfHeal false + OOM → restart NOT called, no alert', async () => {
		const restart = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', state: 'ready', oomSelfHeal: false, restart})
		stubInspect({gitea_app_1: OOM})
		const notifications = makeNotifications()

		const result = await oomWatchHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith([app], notifications)})

		expect(result.status).toBe('success')
		expect(restart).not.toHaveBeenCalled()
		expect(notifications.add).not.toHaveBeenCalled()
	})

	test('state-ownership skip: state stopped + OOM → restart NOT called', async () => {
		const restart = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', state: 'stopped', restart})
		stubInspect({gitea_app_1: OOM})
		const notifications = makeNotifications()

		const result = await oomWatchHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith([app], notifications)})

		expect(result.status).toBe('success')
		expect(restart).not.toHaveBeenCalled()
		expect(notifications.add).not.toHaveBeenCalled()
	})

	test('debug skip: debugMode true + OOM → restart NOT called', async () => {
		const restart = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', state: 'ready', debugMode: true, restart})
		stubInspect({gitea_app_1: OOM})
		const notifications = makeNotifications()

		const result = await oomWatchHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith([app], notifications)})

		expect(result.status).toBe('success')
		expect(restart).not.toHaveBeenCalled()
		expect(notifications.add).not.toHaveBeenCalled()
	})

	test('window breach: after 3 in-window restarts, the 4th OOM tick → no restart + critical loop alert', async () => {
		const restart = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', state: 'ready', restart})
		stubInspect({gitea_app_1: OOM})
		const notifications = makeNotifications()
		const ctx = {logger: fakeLogger, livinityd: daemonWith([app], notifications)}

		// Ticks 1-3 restart (each records a window timestamp); the 4th breaches the 3/60min cap.
		for (let i = 0; i < 3; i++) await oomWatchHandler(fakeJob, ctx)
		expect(restart).toHaveBeenCalledTimes(3)

		notifications.add.mockClear()
		const result = await oomWatchHandler(fakeJob, ctx)

		expect(result.status).toBe('success')
		expect(restart).toHaveBeenCalledTimes(3) // unchanged — no 4th restart
		expect(notifications.add).toHaveBeenCalledWith('app-oom-loop:gitea', {severity: 'critical', external: true})
		expect((result.output as {suspended: number}).suspended).toBe(1)
	})

	test('343-review INFO-03: a failed recovery restart raises app-oom-restart-failed AND still counts the window slot', async () => {
		const restart = vi.fn().mockRejectedValue(new Error('compose up failed'))
		const app = makeApp({id: 'gitea', state: 'ready', restart})
		stubInspect({gitea_app_1: OOM})
		const notifications = makeNotifications()
		const ctx = {logger: fakeLogger, livinityd: daemonWith([app], notifications)}

		const result = await oomWatchHandler(fakeJob, ctx)

		// The tick never fails; the failed attempt surfaces as a warning (not the success alert).
		expect(result.status).toBe('success')
		expect(restart).toHaveBeenCalledTimes(1)
		expect((result.output as {restarted: number}).restarted).toBe(0) // failed → not counted as restarted
		expect(notifications.add).toHaveBeenCalledWith('app-oom-restart-failed:gitea', {severity: 'warning', external: true})
		expect(notifications.add).not.toHaveBeenCalledWith('app-oom-restarted:gitea', expect.anything())

		// The window timestamp was recorded BEFORE the failed attempt (no infinite retry): after 2
		// more failures the 4th tick breaches the 3/60min cap and pages critical instead of thrashing.
		notifications.add.mockClear()
		await oomWatchHandler(fakeJob, ctx)
		await oomWatchHandler(fakeJob, ctx)
		const breach = await oomWatchHandler(fakeJob, ctx)
		expect(restart).toHaveBeenCalledTimes(3) // no 4th restart attempt
		expect((breach.output as {suspended: number}).suspended).toBe(1)
		expect(notifications.add).toHaveBeenCalledWith('app-oom-loop:gitea', {severity: 'critical', external: true})
	})

	test('per-app isolation: one app whose inspect throws does not fail the tick (still success)', async () => {
		const restartGood = vi.fn().mockResolvedValue(undefined)
		const restartBad = vi.fn().mockResolvedValue(undefined)
		const good = makeApp({id: 'gitea', state: 'ready', restart: restartGood})
		const bad = makeApp({id: 'immich', state: 'ready', restart: restartBad})
		stubInspect({gitea_app_1: OOM, immich_app_1: new Error('inspect blew up')})
		const notifications = makeNotifications()

		const result = await oomWatchHandler(fakeJob, {
			logger: fakeLogger,
			livinityd: daemonWith([good, bad], notifications),
		})

		expect(result.status).toBe('success')
		expect(restartGood).toHaveBeenCalledTimes(1) // healthy app still recovered
		expect(fakeLogger.error).toHaveBeenCalled() // the bad app's error was logged, not rethrown
		expect(fakeLogger.error.mock.calls[0][0]).toContain('immich')
	})
})
