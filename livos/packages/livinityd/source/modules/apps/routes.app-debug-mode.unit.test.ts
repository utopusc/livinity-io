// Phase 343-01 RESIL-01 — route-level WIRING tests for debug mode.
//
// Mirrors routes.app-lifecycle-depth.unit.test.ts: invoke the tRPC mutation handlers
// through a real caller and lock:
//   - enterDebugMode / exitDebugMode delegate to apps.enterDebugMode / exitDebugMode.
//   - update while debugMode true → CONFLICT, apps.update NEVER called (D-343-3).
//   - update while debugMode false → reaches apps.update.
//   - W1: restart / start while debugMode true → CONFLICT, the lifecycle call is NEVER made.
//   - W1: stop while debugMode true → ALLOWED (deliberately un-guarded).
//
// currentUser carries role:'admin' but NO id, so the per-user-instance DB branch
// (getUserAppInstance) is skipped and assertAppLifecycleAccess passes on the admin role
// alone — the routes stay offline.

import {describe, expect, test, vi} from 'vitest'
import {TRPCError} from '@trpc/server'

import {apps as appsRouter} from './routes.js'
import {t} from '../server/trpc/trpc.js'

function makeCtx(appsStub: unknown) {
	return {
		dangerouslyBypassAuthentication: true,
		transport: 'ws',
		currentUser: {username: 'alice', role: 'admin'},
		apps: appsStub,
		logger: {log: () => {}, verbose: () => {}, error: () => {}},
	} as never
}

// Build an apps stub: getApp(id).store.get('debugMode') answers `debugMode`; the lifecycle
// delegators are vi.fns so their (non-)invocation can be asserted. getNativeApp returns
// undefined (start/stop probe it first).
function makeApps(opts: {debugMode?: boolean} = {}) {
	const start = vi.fn().mockResolvedValue(true)
	const stop = vi.fn().mockResolvedValue(true)
	const app = {
		store: {get: vi.fn(async (key: string) => (key === 'debugMode' ? opts.debugMode : undefined))},
		start,
		stop,
	}
	return {
		enterDebugMode: vi.fn().mockResolvedValue(true),
		exitDebugMode: vi.fn().mockResolvedValue(true),
		update: vi.fn().mockResolvedValue(true),
		restart: vi.fn().mockResolvedValue(true),
		getNativeApp: vi.fn(() => undefined),
		getApp: vi.fn(() => app),
		_app: app,
	}
}

describe('apps.enterDebugMode / exitDebugMode route wiring (343-01)', () => {
	test('enterDebugMode → delegates to apps.enterDebugMode(appId)', async () => {
		const appsStub = makeApps()
		const caller = t.createCallerFactory(appsRouter)(makeCtx(appsStub))

		await caller.enterDebugMode({appId: 'gitea'})
		expect(appsStub.enterDebugMode).toHaveBeenCalledWith('gitea')
	})

	test('exitDebugMode → delegates to apps.exitDebugMode(appId)', async () => {
		const appsStub = makeApps()
		const caller = t.createCallerFactory(appsRouter)(makeCtx(appsStub))

		await caller.exitDebugMode({appId: 'gitea'})
		expect(appsStub.exitDebugMode).toHaveBeenCalledWith('gitea')
	})
})

describe('lifecycle debug guards (343-01 D-343-3 / W1)', () => {
	test('update while debugMode true → CONFLICT, apps.update NOT called', async () => {
		const appsStub = makeApps({debugMode: true})
		const caller = t.createCallerFactory(appsRouter)(makeCtx(appsStub))

		await expect(caller.update({appId: 'gitea'})).rejects.toBeInstanceOf(TRPCError)
		expect(appsStub.update).not.toHaveBeenCalled()
	})

	test('update while debugMode false → reaches apps.update', async () => {
		const appsStub = makeApps({debugMode: false})
		const caller = t.createCallerFactory(appsRouter)(makeCtx(appsStub))

		await caller.update({appId: 'gitea'})
		expect(appsStub.update).toHaveBeenCalledWith('gitea')
	})

	test('W1: restart while debugMode true → CONFLICT, apps.restart NOT called', async () => {
		const appsStub = makeApps({debugMode: true})
		const caller = t.createCallerFactory(appsRouter)(makeCtx(appsStub))

		await expect(caller.restart({appId: 'gitea'})).rejects.toBeInstanceOf(TRPCError)
		expect(appsStub.restart).not.toHaveBeenCalled()
	})

	test('W1: restart while debugMode false → reaches apps.restart', async () => {
		const appsStub = makeApps({debugMode: false})
		const caller = t.createCallerFactory(appsRouter)(makeCtx(appsStub))

		await caller.restart({appId: 'gitea'})
		expect(appsStub.restart).toHaveBeenCalledWith('gitea')
	})

	test('W1: start while debugMode true → CONFLICT, app.start NOT called', async () => {
		const appsStub = makeApps({debugMode: true})
		const caller = t.createCallerFactory(appsRouter)(makeCtx(appsStub))

		await expect(caller.start({appId: 'gitea'})).rejects.toBeInstanceOf(TRPCError)
		expect(appsStub._app.start).not.toHaveBeenCalled()
	})

	test('W1: stop while debugMode true → ALLOWED (deliberately un-guarded), app.stop called', async () => {
		const appsStub = makeApps({debugMode: true})
		const caller = t.createCallerFactory(appsRouter)(makeCtx(appsStub))

		await caller.stop({appId: 'gitea'})
		expect(appsStub._app.stop).toHaveBeenCalledWith({persistState: true})
	})
})
