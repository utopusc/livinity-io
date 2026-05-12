/**
 * Phase 102-07-01 + Phase 103-01 — chromeMaster tRPC router vitest spec.
 *
 * Phase 102-07-01 (Tests 1-9) — created BEFORE master-login-routes.ts existed.
 * Task 2 (GREEN) of 102-07-01 landed the implementation that turns the 9
 * tests below into passes.
 *
 * Phase 103-01 (Tests 10-19) — extends the original 9 with the factory-
 * injected Xvfb/Chrome/x11vnc/StreamManager pipeline (REQ-103-A1, REQ-103-A3,
 * REQ-103-A4). Master Chrome now runs on a managed Xvfb display (e.g. :42),
 * NOT :0. Headless Mini PCs can master-login without a physical monitor.
 *
 * Coverage:
 *
 * 102-07-01 (admin gate + singleton lock + status + reset + httpOnlyPaths):
 *   1. T-102-07 admin gate on startLogin
 *   2. startLogin :0 happy path (LEGACY — Phase 103 deprecates the :0 path
 *      but the old test asserted argv shape. Updated below to exercise the
 *      injected Xvfb path instead — same intent, new pipeline.)
 *   3. T-102-07b singleton lock — second startLogin throws CONFLICT
 *   4. status returns hasCookies:true when accessFn resolves
 *   5. status returns hasCookies:false when accessFn rejects
 *   6. T-102-07c reset({backup:true}) — rename before mkdir
 *   7. reset({backup:false}) — rm -rf directly
 *   8. T-102-07 admin gate on reset
 *   9. httpOnlyPaths registration (chromeMaster.{startLogin,reset,...})
 *
 * 103-01 (Xvfb pipeline + stopLogin + input.*):
 *  10. createChromeMasterRouter returns full surface (status / startLogin /
 *      stopLogin / input.{click,key,type,scroll} / reset / restoreBackup).
 *  11. startLogin admin happy path — allocates display via mock allocator,
 *      spawns Xvfb + chrome + x11vnc, returns {pid, startedAt, wsUrl, streamId, display}.
 *  12. Concurrent startLogin throws CONFLICT (102-07b lock preserved).
 *  13. T-103-01-01 — non-admin startLogin throws FORBIDDEN before any spawn.
 *  14. T-103-01-04 — startLogin compensating cleanup when chromeSpawnFn rejects:
 *      xvfb.stop called, displayAllocator.release called, no port/stream allocated.
 *  15. chrome.on('exit') triggers cleanupMaster — stopStream + x11vnc.kill +
 *      chrome.stop + xvfb.stop + portAllocator.release + displayAllocator.release;
 *      currentMaster cleared (status.running=false). REQ-103-A4 invariant.
 *  16. input.click admin dispatches dispatchPointer(0, x, y, button, kind,
 *      currentMaster.display). Throws PRECONDITION_FAILED when not running.
 *  17. input.click zod schema rejects x:NaN, button:0, button:4, kind:'foo'.
 *  18. status when master running returns {display, wsUrl, streamId, pid,
 *      startedAt, running:true, hasCookies, dir}.
 *  19. stopLogin admin invokes cleanupMaster (same effects as test 15);
 *      returns {ok:true}; PRECONDITION_FAILED when not running.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f.
 */

import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {EventEmitter} from 'node:events'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {TRPCError} from '@trpc/server'

import {
	createChromeMasterRouter,
	MASTER_PROFILE_DIR,
	MASTER_BACKUP_DIR,
	_resetMasterStateForTest,
} from './master-login-routes.js'
import {t} from '../server/trpc/trpc.js'

function makeCtx(opts: {role?: 'admin' | 'member' | 'guest'; userId?: string} = {}) {
	return {
		dangerouslyBypassAuthentication: true,
		transport: 'ws',
		currentUser: {
			id: opts.userId ?? 'user-A',
			username: 'alice',
			role: opts.role ?? 'admin',
		},
		logger: {
			log: () => {},
			verbose: () => {},
			error: () => {},
		},
	} as never
}

function makeFakeChild(pid = 12345) {
	const listeners: Record<string, Array<(...a: unknown[]) => void>> = {}
	return {
		pid,
		stderr: null,
		on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
			listeners[ev] = listeners[ev] ?? []
			listeners[ev].push(cb)
		}),
		once: (ev: string, cb: (...a: unknown[]) => void) => {
			listeners[ev] = listeners[ev] ?? []
			listeners[ev].push(cb)
		},
		unref: () => {},
		kill: vi.fn(),
		__listeners: listeners,
		__emit: (ev: string, ...args: unknown[]) => {
			for (const cb of listeners[ev] ?? []) cb(...args)
		},
	}
}

function makeOkAccess() {
	return vi.fn(async (_p: string) => undefined)
}
function makeFailAccess() {
	return vi.fn(async (_p: string) => {
		throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
	})
}
function makeRm() {
	return vi.fn(async (_p: string, _opts?: unknown) => undefined)
}
function makeRename() {
	return vi.fn(async (_from: string, _to: string) => undefined)
}
function makeMkdir() {
	return vi.fn(async (_p: string, _opts: {recursive: boolean}) => undefined)
}

// ─── Phase 103-01 mock helpers ─────────────────────────────────────────────

function makeFakeDisplayAllocator(initial = 42) {
	const allocate = vi.fn(() => initial)
	const release = vi.fn((_n: number) => undefined)
	return {allocate, release}
}

function makeFakeXvfbHandle(display = ':42') {
	const stop = vi.fn(async () => undefined)
	return {display, pid: 1001, stop}
}

function makeFakeChromeHandle(pid = 54321) {
	const child = makeFakeChild(pid)
	const stop = vi.fn(async () => undefined)
	return {pid, child, stop}
}

function makeFakeX11vnc() {
	const kill = vi.fn()
	const emitter = new EventEmitter() as EventEmitter & {kill: typeof kill}
	emitter.kill = kill
	return emitter
}

function makeFakePortAllocator(initial = 15942) {
	const allocate = vi.fn(() => initial)
	const release = vi.fn((_n: number) => undefined)
	return {allocate, release}
}

function makeFakeStreamManager(
	portAllocator: ReturnType<typeof makeFakePortAllocator>,
	wsUrl = 'ws://localhost:8080/ws/stream/abc',
	streamId = 'stream-abc',
) {
	const startStream = vi.fn(
		(_opts: {userId: string; mode: 'vnc-window'; target: {display: string}}) => ({
			streamId,
			wsUrl,
		}),
	)
	const stopStream = vi.fn(async (_id: string) => undefined)
	const getPortAllocator = vi.fn(() => portAllocator)
	return {startStream, stopStream, getPortAllocator}
}

function makeFakeProfileSeeder() {
	const ensureMasterExists = vi.fn(async () => undefined)
	return {ensureMasterExists}
}

function makeDispatchMocks() {
	return {
		dispatchPointerFn: vi.fn(async () => undefined),
		dispatchKeyFn: vi.fn(async () => undefined),
		dispatchTypeFn: vi.fn(async () => undefined),
		dispatchScrollFn: vi.fn(async () => undefined),
	}
}

/**
 * Build the full set of injectables Phase 103-01 needs for the spawn pipeline.
 * Includes the Phase 102-07 fs/spawn mocks (still required for status / reset
 * / restoreBackup) PLUS the Phase 103-01 native primitive mocks.
 */
function makeFull103Injectables(
	overrides: Partial<
		ReturnType<typeof _bareInjectables>
	> = {},
): ReturnType<typeof _bareInjectables> {
	return {..._bareInjectables(), ...overrides}
}

function _bareInjectables() {
	const portAllocator = makeFakePortAllocator(15942)
	const displayAllocator = makeFakeDisplayAllocator(42)
	const streamManager = makeFakeStreamManager(portAllocator)
	const profileSeeder = makeFakeProfileSeeder()
	const xvfb = makeFakeXvfbHandle(':42')
	const chrome = makeFakeChromeHandle(54321)
	const x11vnc = makeFakeX11vnc()
	const xvfbSpawnFn = vi.fn(async (_opts: never) => xvfb as never)
	const chromeSpawnFn = vi.fn(async (_opts: never) => chrome as never)
	const vncSpawnFn = vi.fn((_opts: never) => x11vnc as never)
	// Phase 103.1-4 — fluxbox handle on master display so xdotool input dispatch finds focus
	const fluxbox = {pid: 9999, display: ':42', stop: vi.fn(async () => undefined)}
	const fluxboxSpawnFn = vi.fn(async (_opts: never) => fluxbox as never)
	// Phase 103.1-5 — no-op dialog dismissal (real one polls xdotool which isn't on the test host)
	const dismissProfileDialogFn = vi.fn(async (_display: string) => undefined)
	// Phase 103.1-7 — stub resolves to a fake Chrome wid so input routes can
	// exercise the explicit-wid path. Tests can override per-case.
	const resolveMasterChromeWidFn = vi.fn(async (_display: string) => 0xdeadbeef)
	const dispatch = makeDispatchMocks()
	// Phase 103.1 — unlinkFn defaults to a no-op that pretends ENOENT (no
	// lock files exist). Tests can override to assert specific paths.
	const unlinkFn = vi.fn(async (_p: string) => {
		throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
	})
	// Phase 103.1-3 — chownExecFn defaults to a no-op success. Tests can
	// override to assert the chown was invoked with bruce:bruce + the
	// master dir.
	const chownExecFn = vi.fn(async (_cmd: string, _args: string[]) => ({
		stdout: '',
		stderr: '',
	}))
	return {
		spawnFn: vi.fn(() => makeFakeChild() as never),
		accessFn: makeOkAccess(),
		rmFn: makeRm(),
		renameFn: makeRename(),
		mkdirFn: makeMkdir(),
		unlinkFn,
		chownExecFn,
		displayAllocator,
		streamManager,
		profileSeeder,
		xvfbSpawnFn,
		chromeSpawnFn,
		vncSpawnFn,
		fluxboxSpawnFn,
		dismissProfileDialogFn,
		resolveMasterChromeWidFn,
		// dispatchers
		dispatchPointerFn: dispatch.dispatchPointerFn,
		dispatchKeyFn: dispatch.dispatchKeyFn,
		dispatchTypeFn: dispatch.dispatchTypeFn,
		dispatchScrollFn: dispatch.dispatchScrollFn,
		// expose fakes for assertions
		_fakes: {portAllocator, xvfb, chrome, x11vnc, fluxbox},
	}
}

describe('102-07-01 chromeMaster tRPC router', () => {
	beforeEach(() => {
		_resetMasterStateForTest()
	})
	afterEach(() => {
		_resetMasterStateForTest()
	})

	describe('startLogin — T-102-07 admin gate (legacy 102 shape preserved)', () => {
		test('Test 1: non-admin caller throws FORBIDDEN; allocator never invoked', async () => {
			const inj = makeFull103Injectables()
			const chromeMasterRouter = createChromeMasterRouter(inj as never)
			const caller = t.createCallerFactory(chromeMasterRouter)(makeCtx({role: 'member'}))
			await expect(caller.startLogin()).rejects.toThrow(TRPCError)
			await expect(caller.startLogin()).rejects.toMatchObject({code: 'FORBIDDEN'})
			expect(inj.displayAllocator.allocate).not.toHaveBeenCalled()
			expect(inj.xvfbSpawnFn).not.toHaveBeenCalled()
			expect(inj.chromeSpawnFn).not.toHaveBeenCalled()
		})
	})

	// Tests 4-8 retained from Phase 102-07-01 — fs primitive paths (status / reset).
	describe('status', () => {
		test('Test 4: returns {hasCookies: true} when accessFn resolves', async () => {
			const accessFn = makeOkAccess()
			const inj = makeFull103Injectables({accessFn})
			const chromeMasterRouter = createChromeMasterRouter(inj as never)
			const caller = t.createCallerFactory(chromeMasterRouter)(makeCtx({role: 'member'}))
			const result = await caller.status()
			expect(result.hasCookies).toBe(true)
			expect(result.dir).toBe(MASTER_PROFILE_DIR)
			expect(accessFn).toHaveBeenCalled()
			expect((accessFn.mock.calls[0] as unknown as [string])[0]).toContain('Default/Cookies')
		})

		test('Test 5: returns {hasCookies: false} when accessFn rejects', async () => {
			const inj = makeFull103Injectables({accessFn: makeFailAccess()})
			const chromeMasterRouter = createChromeMasterRouter(inj as never)
			const caller = t.createCallerFactory(chromeMasterRouter)(makeCtx({role: 'member'}))
			const result = await caller.status()
			expect(result.hasCookies).toBe(false)
			expect(result.dir).toBe(MASTER_PROFILE_DIR)
		})
	})

	describe('reset — T-102-07c backup-before-delete', () => {
		test('Test 6: reset({backup: true}) renames master → master.backup BEFORE recreating master dir', async () => {
			const callOrder: string[] = []
			const accessFn = vi.fn(async (_p: string) => {
				callOrder.push('access')
			})
			const rmFn = vi.fn(async (_p: string, _opts?: unknown) => {
				callOrder.push('rm')
			})
			const renameFn = vi.fn(async (_from: string, _to: string) => {
				callOrder.push('rename')
			})
			const mkdirFn = vi.fn(async (_p: string, _opts: {recursive: boolean}) => {
				callOrder.push('mkdir')
			})
			const inj = makeFull103Injectables({accessFn, rmFn, renameFn, mkdirFn})
			const chromeMasterRouter = createChromeMasterRouter(inj as never)
			const caller = t.createCallerFactory(chromeMasterRouter)(makeCtx({role: 'admin'}))
			const result = await caller.reset({backup: true})
			expect(result.ok).toBe(true)
			expect(renameFn).toHaveBeenCalled()
			expect(mkdirFn).toHaveBeenCalled()
			const renameCall = renameFn.mock.calls[0] as unknown as [string, string]
			expect(renameCall[0]).toBe(MASTER_PROFILE_DIR)
			expect(renameCall[1]).toBe(MASTER_BACKUP_DIR)
			expect(callOrder.indexOf('rename')).toBeLessThan(callOrder.indexOf('mkdir'))
		})
	})

	describe('reset — no-backup direct path', () => {
		test('Test 7: reset({backup: false}) rm -rf master directly; renameFn never invoked', async () => {
			const renameFn = makeRename()
			const rmFn = makeRm()
			const inj = makeFull103Injectables({renameFn, rmFn})
			const chromeMasterRouter = createChromeMasterRouter(inj as never)
			const caller = t.createCallerFactory(chromeMasterRouter)(makeCtx({role: 'admin'}))
			const result = await caller.reset({backup: false})
			expect(result.ok).toBe(true)
			expect(renameFn).not.toHaveBeenCalled()
			expect(rmFn).toHaveBeenCalled()
			const rmCall = rmFn.mock.calls[0] as unknown as [string, {recursive: boolean; force: boolean}]
			expect(rmCall[0]).toBe(MASTER_PROFILE_DIR)
			expect(rmCall[1]).toMatchObject({recursive: true, force: true})
		})
	})

	describe('reset — T-102-07 admin gate', () => {
		test('Test 8: non-admin caller throws FORBIDDEN; rmFn never invoked', async () => {
			const rmFn = makeRm()
			const inj = makeFull103Injectables({rmFn})
			const chromeMasterRouter = createChromeMasterRouter(inj as never)
			const caller = t.createCallerFactory(chromeMasterRouter)(makeCtx({role: 'member'}))
			await expect(caller.reset({backup: false})).rejects.toMatchObject({code: 'FORBIDDEN'})
			expect(rmFn).not.toHaveBeenCalled()
		})
	})

	describe('httpOnlyPaths registration', () => {
		test('Test 9: common.ts httpOnlyPaths includes chromeMaster.{startLogin,reset,restoreBackup,status}', () => {
			const __filename = fileURLToPath(import.meta.url)
			const __dirname = dirname(__filename)
			const commonPath = join(__dirname, '..', 'server', 'trpc', 'common.ts')
			const commonSrc = readFileSync(commonPath, 'utf8')
			expect(commonSrc).toContain("'chromeMaster.startLogin'")
			expect(commonSrc).toContain("'chromeMaster.reset'")
			expect(commonSrc).toContain("'chromeMaster.restoreBackup'")
			expect(commonSrc).toContain("'chromeMaster.status'")
		})
	})
})

// ───────────────────────────────────────────────────────────────────────────
// Phase 103-01 — Xvfb-driven master Chrome streaming pipeline.
// ───────────────────────────────────────────────────────────────────────────

describe('103-01 chromeMaster tRPC router — Xvfb streaming pipeline', () => {
	beforeEach(() => {
		_resetMasterStateForTest()
	})
	afterEach(() => {
		_resetMasterStateForTest()
	})

	test('Test 10: createChromeMasterRouter returns full surface', () => {
		const inj = makeFull103Injectables()
		const r = createChromeMasterRouter(inj as never)
		// tRPC v11 router has _def with procedures map
		const procedures = (r as unknown as {_def: {procedures: Record<string, unknown>}})._def
			.procedures
		expect(procedures).toHaveProperty('status')
		expect(procedures).toHaveProperty('startLogin')
		expect(procedures).toHaveProperty('stopLogin')
		expect(procedures).toHaveProperty('reset')
		expect(procedures).toHaveProperty('restoreBackup')
		// input sub-router shows up as input.click / input.key / input.type / input.scroll
		expect(procedures).toHaveProperty('input.click')
		expect(procedures).toHaveProperty('input.key')
		expect(procedures).toHaveProperty('input.type')
		expect(procedures).toHaveProperty('input.scroll')
	})

	test('Test 11: startLogin happy path — Xvfb + chrome + x11vnc + stream', async () => {
		const inj = makeFull103Injectables()
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin', userId: 'admin-1'}))

		const result = await caller.startLogin()

		expect(result.pid).toBe(54321)
		expect(result.display).toBe(':42')
		expect(result.streamId).toBe('stream-abc')
		expect(result.wsUrl).toBe('ws://localhost:8080/ws/stream/abc')
		expect(typeof result.startedAt).toBe('number')

		// Allocator + profile-seeder + spawn chain assertions
		expect(inj.profileSeeder.ensureMasterExists).toHaveBeenCalledTimes(1)
		expect(inj.displayAllocator.allocate).toHaveBeenCalledTimes(1)
		expect(inj.xvfbSpawnFn).toHaveBeenCalledWith(
			expect.objectContaining({display: ':42', width: 1280, height: 720}),
		)
		expect(inj.chromeSpawnFn).toHaveBeenCalledWith(
			expect.objectContaining({
				display: ':42',
				userDataDir: '/opt/livos/data/chrome-master',
				url: 'https://accounts.google.com',
			}),
		)
		const portAlloc = inj._fakes.portAllocator
		expect(portAlloc.allocate).toHaveBeenCalledTimes(1)
		expect(inj.vncSpawnFn).toHaveBeenCalledWith(
			expect.objectContaining({display: ':42', rfbPort: 15942}),
		)
		expect(inj.streamManager.startStream).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'admin-1',
				mode: 'vnc-window',
				target: {display: ':42'},
			}),
		)
	})

	test('Test 12: second concurrent startLogin throws CONFLICT', async () => {
		const inj = makeFull103Injectables()
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))

		await caller.startLogin()
		await expect(caller.startLogin()).rejects.toMatchObject({code: 'CONFLICT'})
		// Only one spawn cascade ran
		expect(inj.chromeSpawnFn).toHaveBeenCalledTimes(1)
	})

	test('Test 13: T-103-01-01 non-admin startLogin throws FORBIDDEN before any spawn', async () => {
		const inj = makeFull103Injectables()
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'member'}))
		await expect(caller.startLogin()).rejects.toMatchObject({code: 'FORBIDDEN'})
		expect(inj.displayAllocator.allocate).not.toHaveBeenCalled()
		expect(inj.xvfbSpawnFn).not.toHaveBeenCalled()
		expect(inj.chromeSpawnFn).not.toHaveBeenCalled()
		expect(inj.profileSeeder.ensureMasterExists).not.toHaveBeenCalled()
	})

	// ── Phase 103.1 — stale Chromium singleton lock cleanup ─────────────────
	//
	// User-walked Phase 103 UAT (2026-05-11) surfaced WS 1006 on first Open:
	// stream registered then immediately got `stop requested` because Chrome
	// exited within ms of spawn. Root cause: stale `SingletonLock` +
	// `SingletonCookie` + `SingletonSocket` artifacts left in the master
	// profile dir by a prior crashed Chrome. Chromium's
	// process_singleton_posix.cc reads them, can't message the dead PID, and
	// exits with non-zero → `chrome.on('exit')` fires → cleanupMaster runs →
	// stopStream removes the just-registered stream → client WS 404s.
	//
	// Fix: clear all three artifacts in `MASTER_PROFILE_DIR` before chromeSpawnFn.

	test('Test 14a (103.1): startLogin clears stale Chromium singleton lock files before chromeSpawnFn', async () => {
		const callOrder: string[] = []
		const inj = makeFull103Injectables()
		// Override unlinkFn to succeed (simulates stale files present)
		inj.unlinkFn = vi.fn(async (path: string) => {
			callOrder.push(`unlink:${path}`)
		})
		// Wrap chromeSpawnFn to track when it ran relative to unlinks
		const origChromeSpawn = inj.chromeSpawnFn
		inj.chromeSpawnFn = vi.fn(async (opts: never) => {
			callOrder.push('chromeSpawnFn')
			return origChromeSpawn(opts)
		})
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))

		await caller.startLogin()

		// All three Chromium singleton artifacts attempted to be unlinked
		const unlinkArgs = (inj.unlinkFn as ReturnType<typeof vi.fn>).mock.calls.map(
			(c) => c[0] as string,
		)
		expect(unlinkArgs).toEqual(
			expect.arrayContaining([
				'/opt/livos/data/chrome-master/SingletonLock',
				'/opt/livos/data/chrome-master/SingletonCookie',
				'/opt/livos/data/chrome-master/SingletonSocket',
			]),
		)
		// Order: all three unlinks happen BEFORE chromeSpawnFn
		const chromeSpawnIdx = callOrder.indexOf('chromeSpawnFn')
		const allBefore = callOrder
			.slice(0, chromeSpawnIdx)
			.filter((s) => s.startsWith('unlink:'))
		expect(allBefore.length).toBe(3)
	})

	test('Test 14b (103.1): startLogin swallows ENOENT from unlinkFn (clean profile happy path)', async () => {
		const inj = makeFull103Injectables()
		// Default unlinkFn throws ENOENT — startLogin must NOT propagate
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		// Should resolve, not throw
		await expect(caller.startLogin()).resolves.toMatchObject({pid: 54321})
		expect(inj.chromeSpawnFn).toHaveBeenCalledTimes(1)
	})

	test('Test 14d (103.1-3): startLogin chowns master dir to bruce:bruce BEFORE chromeSpawnFn', async () => {
		const callOrder: string[] = []
		const inj = makeFull103Injectables()
		inj.chownExecFn = vi.fn(async (cmd: string, args: string[]) => {
			callOrder.push(`chown:${cmd}:${args.join(",")}`)
			return {stdout: '', stderr: ''}
		})
		const origChromeSpawn = inj.chromeSpawnFn
		inj.chromeSpawnFn = vi.fn(async (opts: never) => {
			callOrder.push('chromeSpawnFn')
			return origChromeSpawn(opts)
		})

		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		await caller.startLogin()

		// chown called with bruce:bruce + MASTER_PROFILE_DIR
		const chownCalls = (
			inj.chownExecFn as ReturnType<typeof vi.fn>
		).mock.calls as Array<[string, string[]]>
		expect(chownCalls).toEqual(
			expect.arrayContaining([
				['chown', ['bruce:bruce', '/opt/livos/data/chrome-master']],
			]),
		)
		// And chown ran BEFORE chromeSpawnFn (otherwise Chrome would still fail with code=21)
		const chownIdx = callOrder.findIndex((s) =>
			s.startsWith('chown:chown:bruce:bruce'),
		)
		const chromeIdx = callOrder.indexOf('chromeSpawnFn')
		expect(chownIdx).toBeGreaterThanOrEqual(0)
		expect(chromeIdx).toBeGreaterThanOrEqual(0)
		expect(chownIdx).toBeLessThan(chromeIdx)
	})

	test('Test 14f (103.1-4): startLogin spawns fluxbox on master display BETWEEN xvfb and chrome', async () => {
		const callOrder: string[] = []
		const inj = makeFull103Injectables()
		inj.xvfbSpawnFn = vi.fn(async (opts: never) => {
			callOrder.push('xvfbSpawnFn')
			return inj._fakes.xvfb as never
		})
		inj.fluxboxSpawnFn = vi.fn(async (opts: never) => {
			callOrder.push('fluxboxSpawnFn')
			return inj._fakes.fluxbox as never
		})
		inj.chromeSpawnFn = vi.fn(async (opts: never) => {
			callOrder.push('chromeSpawnFn')
			return inj._fakes.chrome as never
		})

		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		await caller.startLogin()

		// Order: xvfb → fluxbox → chrome
		expect(callOrder.indexOf('xvfbSpawnFn')).toBeLessThan(
			callOrder.indexOf('fluxboxSpawnFn'),
		)
		expect(callOrder.indexOf('fluxboxSpawnFn')).toBeLessThan(
			callOrder.indexOf('chromeSpawnFn'),
		)
		// fluxbox called with the master display
		expect(inj.fluxboxSpawnFn).toHaveBeenCalledWith(
			expect.objectContaining({display: ':42'}),
		)
	})

	test('Test 14h (103.1-5): startLogin awaits dismissProfileDialogFn AFTER chromeSpawnFn (so input dispatcher lands on main window not modal)', async () => {
		const callOrder: string[] = []
		const inj = makeFull103Injectables()
		const origChromeSpawn = inj.chromeSpawnFn
		inj.chromeSpawnFn = vi.fn(async (opts: never) => {
			callOrder.push('chromeSpawnFn')
			return origChromeSpawn(opts)
		})
		inj.dismissProfileDialogFn = vi.fn(async (display: string) => {
			callOrder.push(`dismiss:${display}`)
		})

		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		await caller.startLogin()

		// Dismiss called once with the master display.
		expect(inj.dismissProfileDialogFn).toHaveBeenCalledTimes(1)
		expect(inj.dismissProfileDialogFn).toHaveBeenCalledWith(':42')
		// Order: chromeSpawnFn → dismiss
		const chromeIdx = callOrder.indexOf('chromeSpawnFn')
		const dismissIdx = callOrder.indexOf('dismiss::42')
		expect(chromeIdx).toBeGreaterThanOrEqual(0)
		expect(dismissIdx).toBeGreaterThanOrEqual(0)
		expect(chromeIdx).toBeLessThan(dismissIdx)
	})

	test('Test 14g (103.1-4): cleanupMaster cascade stops fluxbox before xvfb', async () => {
		const inj = makeFull103Injectables()
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		await caller.startLogin()

		// Explicit stopLogin (clean teardown path).
		await caller.stopLogin()

		expect(inj._fakes.fluxbox.stop).toHaveBeenCalledTimes(1)
		expect(inj._fakes.xvfb.stop).toHaveBeenCalledTimes(1)
	})

	test('Test 14e (103.1-3): startLogin swallows chown failures (non-fatal — Chrome may still succeed if dir was already bruce-owned)', async () => {
		const inj = makeFull103Injectables()
		inj.chownExecFn = vi.fn(async (_cmd: string, _args: string[]) => {
			throw new Error('Operation not permitted')
		})
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		await expect(caller.startLogin()).resolves.toMatchObject({pid: 54321})
		expect(inj.chromeSpawnFn).toHaveBeenCalledTimes(1)
	})

	test('Test 14c (103.1): startLogin swallows non-ENOENT unlinkFn errors (non-fatal)', async () => {
		const inj = makeFull103Injectables()
		// Simulate EPERM (e.g. lock file owned by another user). Should not
		// block — Chrome may still hit the same lock and fail, but at least
		// the spawn chain proceeds (no regression vs pre-103.1).
		inj.unlinkFn = vi.fn(async (_p: string) => {
			throw Object.assign(new Error('EPERM'), {code: 'EPERM'})
		})
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		await expect(caller.startLogin()).resolves.toMatchObject({pid: 54321})
	})

	test('Test 14: T-103-01-04 startLogin compensating cleanup when chromeSpawnFn rejects', async () => {
		const inj = makeFull103Injectables()
		const boom = new Error('chrome spawn failed')
		inj.chromeSpawnFn.mockRejectedValueOnce(boom as never)

		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))

		await expect(caller.startLogin()).rejects.toThrow(boom)

		// xvfb was started and then stopped
		expect(inj.xvfbSpawnFn).toHaveBeenCalledTimes(1)
		expect(inj._fakes.xvfb.stop).toHaveBeenCalledTimes(1)

		// display was released
		expect(inj.displayAllocator.release).toHaveBeenCalledWith(42)

		// no port allocated, no stream started, no x11vnc spawned
		expect(inj._fakes.portAllocator.allocate).not.toHaveBeenCalled()
		expect(inj.vncSpawnFn).not.toHaveBeenCalled()
		expect(inj.streamManager.startStream).not.toHaveBeenCalled()
	})

	test('Test 15: chrome.on(exit) with non-zero code triggers cleanupMaster — full release cascade', async () => {
		const inj = makeFull103Injectables()
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		await caller.startLogin()

		// Capture chrome.child.on('exit', cb) listener
		const chromeChild = inj._fakes.chrome.child
		const exitListener = (
			chromeChild.on.mock.calls.find((c) => c[0] === 'exit') as
				| [string, (code: number | null, signal: NodeJS.Signals | null) => void]
				| undefined
		)?.[1]
		expect(exitListener).toBeDefined()
		// Phase 103.1: simulate a REAL crash (non-zero exit code). code=0
		// is now reserved for the sudo wrapper's clean exit on Chrome
		// daemonization and must NOT trigger cleanup (see Test 15b).
		exitListener!(11, null)
		// cleanupMaster runs `void` style; wait a tick for awaited steps.
		await new Promise((resolve) => setTimeout(resolve, 10))

		// All cleanup actions fired
		expect(inj.streamManager.stopStream).toHaveBeenCalledWith('stream-abc')
		expect(inj._fakes.x11vnc.kill).toHaveBeenCalledWith('SIGTERM')
		expect(inj._fakes.chrome.stop).toHaveBeenCalledTimes(1)
		expect(inj._fakes.xvfb.stop).toHaveBeenCalledTimes(1)
		expect(inj._fakes.portAllocator.release).toHaveBeenCalledWith(15942)
		expect(inj.displayAllocator.release).toHaveBeenCalledWith(42)

		// status reflects cleared singleton
		const s = await caller.status()
		expect(s.running).toBe(false)
		expect(s.pid).toBeUndefined()
		expect(s.display).toBeUndefined()
	})

	test('Test 15b (103.1): chrome.on(exit) with code=0 + signal=null is treated as daemonization — NO cleanup, stream stays alive', async () => {
		const inj = makeFull103Injectables()
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		await caller.startLogin()

		const chromeChild = inj._fakes.chrome.child
		const exitListener = (
			chromeChild.on.mock.calls.find((c) => c[0] === 'exit') as
				| [string, (code: number | null, signal: NodeJS.Signals | null) => void]
				| undefined
		)?.[1]
		expect(exitListener).toBeDefined()
		// Simulate `sudo google-chrome` daemonization: launcher returns code=0.
		exitListener!(0, null)
		await new Promise((resolve) => setTimeout(resolve, 10))

		// Cleanup MUST NOT have fired — Chrome is daemonized but alive.
		expect(inj.streamManager.stopStream).not.toHaveBeenCalled()
		expect(inj._fakes.x11vnc.kill).not.toHaveBeenCalled()
		expect(inj._fakes.chrome.stop).not.toHaveBeenCalled()
		expect(inj._fakes.xvfb.stop).not.toHaveBeenCalled()
		expect(inj.displayAllocator.release).not.toHaveBeenCalled()

		// status still shows master running.
		const s = await caller.status()
		expect(s.running).toBe(true)
		expect(s.display).toBe(':42')
	})

	test('Test 15c (103.1): chrome.on(exit) with signal=SIGTERM triggers cleanup (external kill is a real death)', async () => {
		const inj = makeFull103Injectables()
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		await caller.startLogin()

		const chromeChild = inj._fakes.chrome.child
		const exitListener = (
			chromeChild.on.mock.calls.find((c) => c[0] === 'exit') as
				| [string, (code: number | null, signal: NodeJS.Signals | null) => void]
				| undefined
		)?.[1]
		exitListener!(null, 'SIGTERM' as NodeJS.Signals)
		await new Promise((resolve) => setTimeout(resolve, 10))

		// SIGTERM → cleanup fires (Chrome was killed externally).
		expect(inj.streamManager.stopStream).toHaveBeenCalledWith('stream-abc')
		expect(inj._fakes.chrome.stop).toHaveBeenCalled()
		expect(inj.displayAllocator.release).toHaveBeenCalledWith(42)
	})

	test('Test 16 (103.1-7): input.click resolves the master Chrome wid and dispatches with explicit wid (WebApp parity)', async () => {
		const inj = makeFull103Injectables()
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))

		// PRECONDITION when no master running
		await expect(
			caller.input.click({x: 10, y: 20, button: 1, kind: 'click'}),
		).rejects.toMatchObject({code: 'PRECONDITION_FAILED'})

		// Spawn master, then dispatch — should resolve wid and pass it to the dispatcher
		await caller.startLogin()
		await caller.input.click({x: 100, y: 200, button: 1, kind: 'click'})

		// resolveMasterChromeWidFn called with the master display
		expect(inj.resolveMasterChromeWidFn).toHaveBeenCalledWith(':42')
		// dispatchPointer called with the resolved wid (0xdeadbeef from stub)
		expect(inj.dispatchPointerFn).toHaveBeenCalledWith(
			0xdeadbeef,
			100,
			200,
			1,
			'click',
			':42',
		)
	})

	test('Test 16b (103.1-7): if resolveMasterChromeWidFn returns undefined, dispatch falls back to wid=0 (display-mode)', async () => {
		const inj = makeFull103Injectables()
		inj.resolveMasterChromeWidFn = vi.fn(async (_display: string) => undefined)
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		await caller.startLogin()
		await caller.input.click({x: 1, y: 2, button: 1, kind: 'click'})
		// wid=0 → dispatcher uses its display-mode fallback (existing 102 path)
		expect(inj.dispatchPointerFn).toHaveBeenCalledWith(0, 1, 2, 1, 'click', ':42')
	})

	test('Test 17: input.click zod schema rejects NaN x / out-of-range button / bad kind', async () => {
		const inj = makeFull103Injectables()
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		await caller.startLogin()

		await expect(
			caller.input.click({x: NaN, y: 0, button: 1, kind: 'click'}),
		).rejects.toThrow()
		await expect(
			caller.input.click({x: 0, y: 0, button: 0, kind: 'click'} as never),
		).rejects.toThrow()
		await expect(
			caller.input.click({x: 0, y: 0, button: 4, kind: 'click'} as never),
		).rejects.toThrow()
		await expect(
			caller.input.click({x: 0, y: 0, button: 1, kind: 'foo'} as never),
		).rejects.toThrow()
	})

	test('Test 18: status when master running returns display + wsUrl + streamId', async () => {
		const inj = makeFull103Injectables()
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		await caller.startLogin()
		const s = await caller.status()
		expect(s.running).toBe(true)
		expect(s.pid).toBe(54321)
		expect(s.display).toBe(':42')
		expect(s.wsUrl).toBe('ws://localhost:8080/ws/stream/abc')
		expect(s.streamId).toBe('stream-abc')
		expect(s.hasCookies).toBe(true)
		expect(s.dir).toBe(MASTER_PROFILE_DIR)
	})

	test('Test 19: stopLogin admin invokes cleanupMaster; PRECONDITION_FAILED when not running', async () => {
		const inj = makeFull103Injectables()
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))

		// not running → precondition failure
		await expect(caller.stopLogin()).rejects.toMatchObject({code: 'PRECONDITION_FAILED'})

		await caller.startLogin()
		const result = await caller.stopLogin()
		expect(result.ok).toBe(true)
		// Cleanup cascade observed
		expect(inj.streamManager.stopStream).toHaveBeenCalledWith('stream-abc')
		expect(inj._fakes.xvfb.stop).toHaveBeenCalled()
		expect(inj.displayAllocator.release).toHaveBeenCalledWith(42)
		// singleton cleared
		const s = await caller.status()
		expect(s.running).toBe(false)
	})

	test('Test 20: missing-deps bare default router — startLogin returns INTERNAL_SERVER_ERROR', async () => {
		// Bare factory (no Phase 103 injection)
		const r = createChromeMasterRouter()
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		await expect(caller.startLogin()).rejects.toMatchObject({code: 'INTERNAL_SERVER_ERROR'})
	})

	test('Test 21 (103.1-7): input.key / input.type / input.scroll resolve wid and dispatch with explicit wid', async () => {
		const inj = makeFull103Injectables()
		const r = createChromeMasterRouter(inj as never)
		const caller = t.createCallerFactory(r)(makeCtx({role: 'admin'}))
		await caller.startLogin()

		await caller.input.key({key: 'Return', kind: 'key'})
		expect(inj.dispatchKeyFn).toHaveBeenCalledWith(0xdeadbeef, 'Return', 'key', ':42')

		await caller.input.type({text: 'hello@example.com'})
		expect(inj.dispatchTypeFn).toHaveBeenCalledWith(0xdeadbeef, 'hello@example.com', ':42')

		await caller.input.scroll({x: 50, y: 60, direction: 'down', clicks: 3})
		expect(inj.dispatchScrollFn).toHaveBeenCalledWith(0xdeadbeef, 50, 60, 'down', 3, ':42')
	})
})
