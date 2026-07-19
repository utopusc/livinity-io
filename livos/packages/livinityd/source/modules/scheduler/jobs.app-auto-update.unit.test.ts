// Phase 326 APPS-02 — app-auto-update unit tests.
//
// Covers (mirrors the jobs.disk-critical.unit.test.ts template):
//   1: SKIP-PATH — appAutoUpdateHandler with NO ctx.livinityd resolves (never
//      throws) and returns {status: 'skipped'}.
//   2: registry reachability — BUILT_IN_HANDLERS['app-auto-update'] is the handler.
//   3: policy 'manual' → app.update() NOT called (opt-in only).
//   4: policy 'auto' & available === installed → NOT called (already up-to-date).
//   5: policy 'auto' & available !== installed & available !== ignored → update() once.
//   6: policy 'auto' & available === ignoredVersion (pinned) → NOT called.
//
// jobs.ts consumes getBuiltinApp() for the "available version" signal, so we
// partial-mock builtin-apps.js (keep every other export real) to control it.

import {describe, expect, test, vi} from 'vitest'

import type {ScheduledJob} from './types.js'

// ---------------------------------------------------------------------------
// Module mock (hoisted before importing the module under test, per vitest rules).
// ---------------------------------------------------------------------------
const mockGetBuiltinApp = vi.fn()
vi.mock('../apps/builtin-apps.js', async (importActual) => {
	const actual = await importActual<typeof import('../apps/builtin-apps.js')>()
	return {...actual, getBuiltinApp: (...args: unknown[]) => mockGetBuiltinApp(...args)}
})

import {BUILT_IN_HANDLERS, appAutoUpdateHandler} from './jobs.js'

const fakeJob = {name: 'app-auto-update', type: 'app-auto-update'} as unknown as ScheduledJob
const fakeLogger = {log: vi.fn(), error: vi.fn()}

// Build an installed-app stub whose store.get() answers per-key.
// 342-01: `window` (optional) is returned for store.get('updateWindow'). undefined
// (the default for the 6 pre-existing tests) keeps an app OWNED by the 4am job;
// a set window makes the 4am handler SKIP it (disjoint predicate — D-342-3).
function makeApp(opts: {
	id: string
	policy?: 'auto' | 'manual'
	installed: string
	ignored?: string
	window?: {start: string; end: string}
	debugMode?: boolean
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
				// 343-01 RESIL-01: debug apps are skipped by the shared auto-update pass.
				if (key === 'debugMode') return opts.debugMode
				return undefined
			}),
		},
	}
}

// Wrap one app instance in a livinityd stub the handler accepts.
function daemonWith(app: ReturnType<typeof makeApp>) {
	return {apps: {instances: [app]}} as never
}

describe('appAutoUpdateHandler — opt-in, pin-aware true auto-update', () => {
	test('SKIP-PATH: no ctx.livinityd → resolves, never throws, {status: skipped}', async () => {
		mockGetBuiltinApp.mockReset()
		const result = await appAutoUpdateHandler(fakeJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
	})

	test('registry: BUILT_IN_HANDLERS[app-auto-update] is wired and skips cleanly', async () => {
		mockGetBuiltinApp.mockReset()
		const handler = BUILT_IN_HANDLERS['app-auto-update']
		expect(handler).toBe(appAutoUpdateHandler)
		const result = await handler(fakeJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
	})

	test('policy manual: update() NOT called even when a newer version ships', async () => {
		mockGetBuiltinApp.mockReset()
		mockGetBuiltinApp.mockReturnValue({version: '2.0.0'})
		const update = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', policy: 'manual', installed: '1.0.0', update})

		const result = await appAutoUpdateHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith(app)})

		expect(result.status).toBe('success')
		expect(update).not.toHaveBeenCalled()
	})

	test('policy auto + available === installed: update() NOT called (up-to-date)', async () => {
		mockGetBuiltinApp.mockReset()
		mockGetBuiltinApp.mockReturnValue({version: '2.0.0'})
		const update = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', policy: 'auto', installed: '2.0.0', update})

		const result = await appAutoUpdateHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith(app)})

		expect(result.status).toBe('success')
		expect(update).not.toHaveBeenCalled()
	})

	test('policy auto + newer + not pinned: update() called once', async () => {
		mockGetBuiltinApp.mockReset()
		mockGetBuiltinApp.mockReturnValue({version: '2.0.0'})
		const update = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', policy: 'auto', installed: '1.0.0', update})

		const result = await appAutoUpdateHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith(app)})

		expect(result.status).toBe('success')
		expect(update).toHaveBeenCalledTimes(1)
		expect((result.output as {updated: string[]}).updated).toEqual(['gitea'])
	})

	test('policy auto + available === ignoredVersion (pinned): update() NOT called', async () => {
		mockGetBuiltinApp.mockReset()
		mockGetBuiltinApp.mockReturnValue({version: '2.0.0'})
		const update = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', policy: 'auto', installed: '1.0.0', ignored: '2.0.0', update})

		const result = await appAutoUpdateHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith(app)})

		expect(result.status).toBe('success')
		expect(update).not.toHaveBeenCalled()
	})

	// 342-01 (D-342-3): the 4am job now SKIPS any app with an updateWindow — that app is
	// owned by the */15 app-update-window job, so 04:00 must never update it (else the
	// admin's maintenance window is pointless). Disjoint predicate: window undefined ↔ defined.
	test('policy auto + window SET + newer: 4am handler SKIPS it (owned by the windowed job)', async () => {
		mockGetBuiltinApp.mockReset()
		mockGetBuiltinApp.mockReturnValue({version: '2.0.0'})
		const update = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', policy: 'auto', installed: '1.0.0', window: {start: '09:00', end: '17:00'}, update})

		const result = await appAutoUpdateHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith(app)})

		expect(result.status).toBe('success')
		expect(update).not.toHaveBeenCalled()
		expect((result.output as {updated: string[]}).updated).toEqual([])
	})

	// 343-01 RESIL-01 (D-343-3): an app in debug mode is LEFT ALONE by the shared auto-update pass —
	// update() would re-derive the compose and fight the entrypoint-suppression transform.
	test('policy auto + newer + debugMode true: update() NOT called (debug app left alone)', async () => {
		mockGetBuiltinApp.mockReset()
		mockGetBuiltinApp.mockReturnValue({version: '2.0.0'})
		const update = vi.fn().mockResolvedValue(undefined)
		const app = makeApp({id: 'gitea', policy: 'auto', installed: '1.0.0', debugMode: true, update})

		const result = await appAutoUpdateHandler(fakeJob, {logger: fakeLogger, livinityd: daemonWith(app)})

		expect(result.status).toBe('success')
		expect(update).not.toHaveBeenCalled()
		expect((result.output as {updated: string[]}).updated).toEqual([])
	})
})
