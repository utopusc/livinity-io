// Phase 342 APPD-01 — app-update-window job unit tests.
//
// Mirrors the jobs.app-auto-update.unit.test.ts harness. The window job is the
// disjoint twin of the 4am app-auto-update job: it processes ONLY apps that have
// BOTH autoUpdatePolicy==='auto' AND an updateWindow, and only while `now` is
// INSIDE that window.
//
// Covers:
//   1: SKIP-PATH — no ctx.livinityd → {status:'skipped'}, never throws.
//   2: registry — BUILT_IN_HANDLERS['app-update-window'] is the handler; skips cleanly.
//   3: policy 'manual' + window + newer → update() NOT called.
//   4: policy 'auto' + window + now INSIDE + newer + not pinned → update() once.
//   5: policy 'auto' + window + now OUTSIDE → update() NOT called.
//   6: policy 'auto' + NO window + newer → update() NOT called (owned by the 4am job).
//   7: policy 'auto' + window + inside + available===ignoredVersion → NOT called (pin honored).

import {describe, expect, test, vi} from 'vitest'

import type {ScheduledJob} from './types.js'

const mockGetBuiltinApp = vi.fn()
vi.mock('../apps/builtin-apps.js', async (importActual) => {
	const actual = await importActual<typeof import('../apps/builtin-apps.js')>()
	return {...actual, getBuiltinApp: (...args: unknown[]) => mockGetBuiltinApp(...args)}
})

import {BUILT_IN_HANDLERS, appUpdateWindowHandler} from './jobs.js'

const fakeJob = {name: 'app-update-window', type: 'app-update-window'} as unknown as ScheduledJob
const fakeLogger = {log: vi.fn(), error: vi.fn()}

// Build an installed-app stub whose store.get() answers per-key. `window` (optional)
// is returned for store.get('updateWindow') — undefined mirrors an app owned by the 4am job.
function makeApp(opts: {
	id: string
	policy?: 'auto' | 'manual'
	installed: string
	ignored?: string
	window?: {start: string; end: string}
	update: ReturnType<typeof vi.fn>
}) {
	return {
		id: opts.id,
		update: opts.update,
		readManifest: vi.fn().mockResolvedValue({version: opts.installed}),
		store: {
			get: vi.fn(async (key: string) => {
				if (key === 'autoUpdatePolicy') return opts.policy
				if (key === 'ignoredVersion') return opts.ignored
				if (key === 'updateWindow') return opts.window
				return undefined
			}),
		},
	}
}

function daemonWith(app: ReturnType<typeof makeApp>) {
	return {apps: {instances: [app]}} as never
}

// now built via new Date(2026,0,1,HH,MM). An 09:00-17:00 window with now 12:00 is INSIDE;
// now 03:00 is OUTSIDE. Vitest fake timers keep the handler's internal new Date() aligned.
function withNow<T>(h: number, m: number, fn: () => Promise<T>): Promise<T> {
	vi.useFakeTimers()
	vi.setSystemTime(new Date(2026, 0, 1, h, m))
	return fn().finally(() => vi.useRealTimers())
}

describe('appUpdateWindowHandler — windowed, inside-only, disjoint from 4am', () => {
	test('SKIP-PATH: no ctx.livinityd → resolves, never throws, {status: skipped}', async () => {
		mockGetBuiltinApp.mockReset()
		const result = await appUpdateWindowHandler(fakeJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
	})

	test('registry: BUILT_IN_HANDLERS[app-update-window] is wired and skips cleanly', async () => {
		mockGetBuiltinApp.mockReset()
		const handler = BUILT_IN_HANDLERS['app-update-window']
		expect(handler).toBe(appUpdateWindowHandler)
		const result = await handler(fakeJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
	})

	test('policy manual + window + newer: update() NOT called', async () => {
		mockGetBuiltinApp.mockReset()
		mockGetBuiltinApp.mockReturnValue({version: '2.0.0'})
		const update = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', policy: 'manual', installed: '1.0.0', window: {start: '09:00', end: '17:00'}, update})

		const result = await withNow(12, 0, () =>
			appUpdateWindowHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith(app)}),
		)

		expect(result.status).toBe('success')
		expect(update).not.toHaveBeenCalled()
	})

	test('policy auto + window + now INSIDE + newer + not pinned: update() called once', async () => {
		mockGetBuiltinApp.mockReset()
		mockGetBuiltinApp.mockReturnValue({version: '2.0.0'})
		const update = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', policy: 'auto', installed: '1.0.0', window: {start: '09:00', end: '17:00'}, update})

		const result = await withNow(12, 0, () =>
			appUpdateWindowHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith(app)}),
		)

		expect(result.status).toBe('success')
		expect(update).toHaveBeenCalledTimes(1)
		expect((result.output as {updated: string[]}).updated).toEqual(['gitea'])
	})

	test('policy auto + window + now OUTSIDE: update() NOT called', async () => {
		mockGetBuiltinApp.mockReset()
		mockGetBuiltinApp.mockReturnValue({version: '2.0.0'})
		const update = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', policy: 'auto', installed: '1.0.0', window: {start: '09:00', end: '17:00'}, update})

		const result = await withNow(3, 0, () =>
			appUpdateWindowHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith(app)}),
		)

		expect(result.status).toBe('success')
		expect(update).not.toHaveBeenCalled()
	})

	test('policy auto + NO window + newer: update() NOT called (owned by the 4am job)', async () => {
		mockGetBuiltinApp.mockReset()
		mockGetBuiltinApp.mockReturnValue({version: '2.0.0'})
		const update = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', policy: 'auto', installed: '1.0.0', update})

		const result = await withNow(12, 0, () =>
			appUpdateWindowHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith(app)}),
		)

		expect(result.status).toBe('success')
		expect(update).not.toHaveBeenCalled()
	})

	test('WARN-01: policy auto + malformed window (start===end): NOT updated + invalid-window error logged', async () => {
		mockGetBuiltinApp.mockReset()
		mockGetBuiltinApp.mockReturnValue({version: '2.0.0'})
		fakeLogger.error.mockClear()
		const update = vi.fn().mockResolvedValue(undefined)
		// A DEFINED-but-INVALID window (start===end) is skipped by BOTH scheduler jobs forever
		// and silently — the window job must surface it as a stalled-auto-update error.
		const app = makeApp({id: 'gitea', policy: 'auto', installed: '1.0.0', window: {start: '09:00', end: '09:00'}, update})

		const result = await withNow(12, 0, () =>
			appUpdateWindowHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith(app)}),
		)

		expect(result.status).toBe('success')
		expect(update).not.toHaveBeenCalled()
		expect(fakeLogger.error).toHaveBeenCalledTimes(1)
		expect(fakeLogger.error.mock.calls[0][0]).toContain('gitea')
		expect(fakeLogger.error.mock.calls[0][0]).toMatch(/invalid|stalled/i)
	})

	test('policy auto + window + inside + available===ignoredVersion: update() NOT called (pin honored)', async () => {
		mockGetBuiltinApp.mockReset()
		mockGetBuiltinApp.mockReturnValue({version: '2.0.0'})
		const update = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({
			id: 'gitea',
			policy: 'auto',
			installed: '1.0.0',
			ignored: '2.0.0',
			window: {start: '09:00', end: '17:00'},
			update,
		})

		const result = await withNow(12, 0, () =>
			appUpdateWindowHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith(app)}),
		)

		expect(result.status).toBe('success')
		expect(update).not.toHaveBeenCalled()
	})
})
