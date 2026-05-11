/**
 * Phase 93-10 — WebAppWindowManager unit tests.
 *
 * Mocks discovery / portal / GeometryTracker / streamManager. No real
 * Chrome / xdotool / D-Bus needed.
 *
 * Coverage (≥10):
 *   1. spawn happy path with portal — returns {windowId, streamId, wsUrl}
 *   2. spawn idempotent — second call same webappId + alive window returns existing
 *   3. spawn falls back to geometry-tracker on PORTAL_UNAVAILABLE
 *   4. spawn throws WINDOW_NOT_FOUND on title timeout
 *   5. spawn enforces per-user webapp cap → TOO_MANY_WEBAPPS
 *   6. focus on alive window calls activateWindow
 *   7. focus on dead window returns WINDOW_GONE + auto-closes entry
 *   8. close stops stream + portal session + geometry tracker
 *   9. list filters by userId
 *  10. idle cleanup detects window-gone and cascades close
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {EventEmitter} from 'node:events'
import {
	WebAppWindowManager,
	WindowNotFoundError,
	WebappCapExceededError,
} from './window-manager.js'
import {PortalUnavailable} from './pipewire-portal.js'

class FakeChild extends EventEmitter {
	unref = vi.fn()
}

function makeStreamManager() {
	const started: any[] = []
	const stopped: string[] = []
	let nextId = 1
	const startStream = vi.fn((opts: any) => {
		const streamId = `stream-${nextId++}`
		started.push({streamId, ...opts})
		return {streamId, wsUrl: `/ws/stream/${streamId}`}
	})
	const stopStream = vi.fn(async (streamId: string) => {
		stopped.push(streamId)
		return {stopped: true}
	})
	const addSubscriber = vi.fn(() => true)
	const getFanout = vi.fn(() => null)
	return {streamManager: {startStream, stopStream, addSubscriber, getFanout}, started, stopped}
}

function makeDiscovery() {
	const isWindowAlive = vi.fn(async () => true)
	const activateWindow = vi.fn(async () => true)
	const snapshotWindowIds = vi.fn(async () => new Set<number>([0x100]))
	const findNewWindowMatching = vi.fn(async () => ({
		wid: 0x200,
		title: 'GitHub',
		geometry: {x: 100, y: 100, w: 800, h: 600},
	}))
	// Phase 101-04 — PID-narrowed wid resolution (RESEARCH Q1 RESOLVED).
	// Mocks added alongside the legacy title-match mock so the discovery shape
	// satisfies both pre-101-04 callers (during incremental migration) and
	// the new CDP-driven spawn body. The returned wid string is `'512'` so
	// `parseInt(wid, 10)` matches the legacy mock's numeric `0x200` (= 512);
	// keeps the existing `r.windowId).toBe(0x200)` assertions stable across
	// the title-match → PID-narrowed swap.
	const listWindowIdsForPid = vi.fn(async (_pid: number) => [] as string[])
	const findNewWindowByPid = vi.fn(
		async (_opts: {chromePid: number; baselineWids: string[]; timeoutMs: number}) =>
			({wid: '512'}) as {wid: string} | null,
	)
	const getWindowGeometry = vi.fn(async () => ({x: 100, y: 100, w: 800, h: 600}))
	return {
		isWindowAlive,
		activateWindow,
		snapshotWindowIds,
		findNewWindowMatching,
		findNewWindowByPid,
		listWindowIdsForPid,
		getWindowGeometry,
	}
}

// Phase 101-04 — mock ChromeCdpClient. Records createWindowForUrl + closeTarget
// calls so tests can assert the CDP-driven spawn body talks to the right CDP
// surface in the right order. getChromePid returns 12345 so the PID-narrowed
// discovery mock can baseline against a stable value.
function makeChromeCdpClient(opts: {createWindowFn?: typeof vi.fn} = {}) {
	const created: Array<{url: string; opts: any}> = []
	const closed: string[] = []
	const createWindowForUrl =
		opts.createWindowFn ??
		vi.fn(async (url: string, o: any) => {
			created.push({url, opts: o})
			return {targetId: `tgt-${created.length}`, windowId: created.length}
		})
	const closeTarget = vi.fn(async (targetId: string) => {
		closed.push(targetId)
	})
	const findTargetByUrl = vi.fn(async () => null)
	const minimizeWindow = vi.fn(async () => {})
	const getChromePid = vi.fn(async () => 12345)
	const getWindowIdForTarget = vi.fn(async () => 1)
	const setChromePid = vi.fn((_pid: number) => {})
	const client = {
		createWindowForUrl,
		closeTarget,
		findTargetByUrl,
		minimizeWindow,
		getChromePid,
		getWindowIdForTarget,
		setChromePid,
	}
	return {client, created, closed}
}

function makePortal(opts: {available?: boolean; canceled?: boolean; throwOnRequest?: Error} = {}) {
	const isPortalAvailable = vi.fn(async () => opts.available !== false)
	const closeSession = vi.fn(async () => {})
	const requestWindowSession = vi.fn(async () => {
		if (opts.throwOnRequest) throw opts.throwOnRequest
		return {pwNodeId: 42, fd: 7, closeSession}
	})
	return {portal: {isPortalAvailable, requestWindowSession}, closeSession}
}

function makeGeometryTrackerCtor() {
	const instances: Array<{start: any; stop: any}> = []
	const ctor = vi.fn(() => {
		const inst = {
			start: vi.fn(),
			stop: vi.fn(),
			on: vi.fn(),
			emit: vi.fn(),
			once: vi.fn(),
			off: vi.fn(),
		}
		instances.push(inst)
		return inst
	})
	return {ctor: ctor as any, instances}
}

function makeManager(overrides: any = {}) {
	const {streamManager, started, stopped} = makeStreamManager()
	const discovery = overrides.discovery ?? makeDiscovery()
	const {portal, closeSession} = overrides.portalBundle ?? makePortal()
	const {ctor: GeometryTrackerCtor, instances: trackerInstances} =
		overrides.trackerBundle ?? makeGeometryTrackerCtor()
	const spawn = vi.fn(() => new FakeChild() as any)
	const logger = {info: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn()}
	// Phase 101-04 — every manager now needs a ChromeCdpClient. Tests that don't
	// override one get the default mock so the constructor satisfies the new
	// required opt. Bundle is exposed in the return so tests can assert against
	// createWindowForUrl / closeTarget call counts.
	const chromeCdpBundle = overrides.chromeCdpBundle ?? makeChromeCdpClient()
	const mgr = new WebAppWindowManager({
		streamManager,
		spawn,
		logger,
		discovery,
		portal,
		GeometryTrackerCtor,
		titleTimeoutMs: overrides.titleTimeoutMs ?? 100,
		idlePollMs: overrides.idlePollMs ?? 50,
		webappCap: overrides.webappCap,
		// Phase 100-08-04 — optional MCP config-manager opts (Redis pub-sub
		// path; liv-core's McpClientManager reconciles async).
		mcpConfigManager: overrides.mcpConfigManager,
		luseServerPath: overrides.luseServerPath,
		luseMcpEnv: overrides.luseMcpEnv,
		// Phase 100-10-01 — per-WebApp Xvfb display allocator + start fns.
		displayAllocator: overrides.displayAllocator,
		xvfbStartFn: overrides.xvfbStartFn,
		fluxboxStartFn: overrides.fluxboxStartFn,
		// Phase 101-04 — CDP-driven spawn. Injected for every manager so the
		// new spawn body has a CDP surface to talk to.
		chromeCdpClient: chromeCdpBundle.client as any,
	})
	return {
		mgr,
		streamManager,
		started,
		stopped,
		discovery,
		portal,
		closeSession,
		spawn,
		trackerInstances,
		logger,
		chromeCdpBundle,
	}
}

describe('WebAppWindowManager', () => {
	beforeEach(() => {
		vi.useRealTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('Test 1: spawn happy path returns {webappId,windowId,streamId,wsUrl} with mode:"vnc-window" (Phase 99-04 swap)', async () => {
		const {mgr, streamManager, started} = makeManager()
		const r = await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'})
		expect(r.windowId).toBe(0x200)
		expect(r.streamId).toMatch(/^stream-/)
		expect(r.wsUrl).toMatch(/^\/ws\/stream\//)
		expect(streamManager.startStream).toHaveBeenCalledOnce()
		expect(started[0].mode).toBe('vnc-window')
		expect(started[0].target).toEqual({wid: 0x200})
		mgr._clearForTests()
	})

	it('Test 2: spawn is idempotent for same webappId when window still alive', async () => {
		const {mgr, streamManager} = makeManager()
		const a = await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'})
		const b = await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'})
		expect(a.streamId).toBe(b.streamId)
		expect(streamManager.startStream).toHaveBeenCalledTimes(1)
		mgr._clearForTests()
	})

	it('Test 3: spawn ignores portal availability — always uses vnc-window, no GeometryTracker (Phase 99-04 swap)', async () => {
		const portalBundle = makePortal({available: false})
		const {mgr, started, trackerInstances, portal} = makeManager({portalBundle})
		const r = await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'})
		expect(started[0].mode).toBe('vnc-window')
		expect(started[0].target).toEqual({wid: 0x200})
		// Portal probe is GONE — D-99-04: x11vnc -id <wid> needs no PipeWire portal
		expect(portal.isPortalAvailable).not.toHaveBeenCalled()
		expect(portal.requestWindowSession).not.toHaveBeenCalled()
		// GeometryTracker is GONE — x11vnc reads pixmap by wid, not by geometry
		expect(trackerInstances).toHaveLength(0)
		expect(r.streamId).toMatch(/^stream-/)
		mgr._clearForTests()
	})

	it('Test 4: spawn throws WINDOW_NOT_FOUND when findNewWindowByPid times out (Phase 101-04 — PID-narrowed lookup replaces title-match)', async () => {
		const discovery = makeDiscovery()
		// Phase 101-04 — the spawn body no longer calls findNewWindowMatching.
		// The PID-narrowed lookup is the only timeout path now.
		discovery.findNewWindowByPid = vi.fn(async () => null)
		const {mgr, chromeCdpBundle} = makeManager({discovery})
		await expect(
			mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'}),
		).rejects.toBeInstanceOf(WindowNotFoundError)
		// Degenerate cleanup: the CDP target that was created must be closed
		// before the throw so we don't leak a Chrome window.
		expect(chromeCdpBundle.closed).toHaveLength(1)
	})

	it('Test 5: spawn enforces per-user webapp cap → TOO_MANY_WEBAPPS', async () => {
		const {mgr} = makeManager({webappCap: 2})
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://a.com'})
		await mgr.spawn({userId: 'u1', webappId: 'app2', url: 'https://b.com'})
		await expect(
			mgr.spawn({userId: 'u1', webappId: 'app3', url: 'https://c.com'}),
		).rejects.toBeInstanceOf(WebappCapExceededError)
		mgr._clearForTests()
	})

	it('Test 6: focus on alive window calls activateWindow', async () => {
		const {mgr, discovery} = makeManager()
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'})
		const r = await mgr.focus({webappId: 'app1', userId: 'u1'})
		expect(r.ok).toBe(true)
		expect(discovery.activateWindow).toHaveBeenCalledWith(0x200)
		mgr._clearForTests()
	})

	it('Test 7: focus on dead window returns WINDOW_GONE + auto-closes entry', async () => {
		const discovery = makeDiscovery()
		const {mgr} = makeManager({discovery})
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'})
		// Now simulate the window dying
		discovery.isWindowAlive.mockResolvedValue(false)
		const r = await mgr.focus({webappId: 'app1', userId: 'u1'})
		expect(r.ok).toBe(false)
		expect(r.code).toBe('WINDOW_GONE')
		expect(mgr.list({userId: 'u1'})).toEqual([])
	})

	it('Test 8: close cascades stopStream and clears entry (Phase 99-04: portal session is null for vnc-window)', async () => {
		const portalBundle = makePortal({available: true})
		const {mgr, streamManager, closeSession} = makeManager({portalBundle})
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'})
		const result = await mgr.close({webappId: 'app1', userId: 'u1'})
		expect(result.ok).toBe(true)
		expect(streamManager.stopStream).toHaveBeenCalled()
		// Portal session is null under vnc-window mode (D-99-04) — closeSession
		// path becomes dead code for WebApp entries.
		expect(closeSession).not.toHaveBeenCalled()
		expect(mgr.list({userId: 'u1'})).toEqual([])
	})

	it('Test 9: list filters by userId', async () => {
		const {mgr} = makeManager()
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://a.com'})
		await mgr.spawn({userId: 'u2', webappId: 'app2', url: 'https://b.com'})
		expect(mgr.list({userId: 'u1'})).toHaveLength(1)
		expect(mgr.list({userId: 'u2'})).toHaveLength(1)
		expect(mgr.list({userId: 'u3'})).toHaveLength(0)
		mgr._clearForTests()
	})

	it('Test 10: idle-cleanup tick cascades close on window-gone', async () => {
		vi.useFakeTimers()
		const discovery = makeDiscovery()
		const {mgr, streamManager} = makeManager({discovery, idlePollMs: 100})
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'})
		expect(mgr.list({userId: 'u1'})).toHaveLength(1)

		discovery.isWindowAlive.mockResolvedValue(false)
		mgr.startIdleCleanup()
		await vi.advanceTimersByTimeAsync(150)
		// give microtasks a chance after the async tick resolves
		await vi.advanceTimersByTimeAsync(50)
		expect(mgr.list({userId: 'u1'})).toEqual([])
		expect(streamManager.stopStream).toHaveBeenCalled()
		mgr.stopIdleCleanup()
		mgr._clearForTests()
	})

	it('Test 11: spawn ignores portal request errors entirely — portal is never called (Phase 99-04 swap)', async () => {
		// Even if the portal would throw, we never call it. The setup proves the
		// regression lock: WebApp spawns are unconditional vnc-window.
		const portalBundle = makePortal({available: true, throwOnRequest: new Error('something else')})
		const {mgr, started, trackerInstances, portal} = makeManager({portalBundle})
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'})
		expect(started[0].mode).toBe('vnc-window')
		expect(portal.isPortalAvailable).not.toHaveBeenCalled()
		expect(portal.requestWindowSession).not.toHaveBeenCalled()
		expect(trackerInstances).toHaveLength(0)
		mgr._clearForTests()
	})
})

// ============================================================================
// Phase 99-04 — vnc-window swap regression locks (3 new cases)
// ============================================================================

describe('WebAppWindowManager — vnc-window swap (Phase 99-04)', () => {
	beforeEach(() => {
		vi.useRealTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('Test 12: spawn() calls streamManager.startStream with mode:"vnc-window" and target:{wid}', async () => {
		const {mgr, streamManager, started} = makeManager()
		const r = await mgr.spawn({userId: 'admin', webappId: 'wa-1', url: 'https://example.com'})
		expect(streamManager.startStream).toHaveBeenCalledTimes(1)
		expect(started[0].mode).toBe('vnc-window')
		expect(started[0].target).toEqual({wid: 0x200})
		expect(r.streamId).toMatch(/^stream-/)
		mgr._clearForTests()
	})

	it('Test 13: close() cascades stopStream for vnc-window entries', async () => {
		const {mgr, streamManager} = makeManager()
		await mgr.spawn({userId: 'admin', webappId: 'wa-2', url: 'https://example.com'})
		await mgr.close({webappId: 'wa-2', userId: 'admin'})
		expect(streamManager.stopStream).toHaveBeenCalledWith(expect.stringMatching(/^stream-/))
	})

	it('Test 14: idleCleanupTick cascades close+stopStream when window-gone (Assumption A5 lock)', async () => {
		vi.useFakeTimers()
		const discovery = makeDiscovery()
		const {mgr, streamManager} = makeManager({discovery, idlePollMs: 100})
		await mgr.spawn({userId: 'admin', webappId: 'wa-3', url: 'https://example.com'})
		expect(mgr.list({userId: 'admin'})).toHaveLength(1)
		discovery.isWindowAlive.mockResolvedValue(false)
		mgr.startIdleCleanup()
		await vi.advanceTimersByTimeAsync(150)
		await vi.advanceTimersByTimeAsync(50)
		expect(mgr.list({userId: 'admin'})).toEqual([])
		expect(streamManager.stopStream).toHaveBeenCalled()
		mgr.stopIdleCleanup()
		mgr._clearForTests()
	})

	it('Test 11 [Phase 101-04 RETIRED]: legacy --app=<url> argv path is gone; spawn drives Chrome via CDP createWindowForUrl', async () => {
		// Phase 101-04: the `sudo google-chrome --app=<url>` argv path is DEAD.
		// CDP createTarget({newWindow:true}) is the only way to get distinct
		// windows under a shared `--user-data-dir`. This assertion is the
		// regression lock — if anyone re-introduces the argv path, this test
		// fails BEFORE Mini PC UAT hits the IPC-merge bug again.
		const {mgr, spawn, chromeCdpBundle} = makeManager()
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://duckduckgo.com'})
		// No spawnFactory invocation for Chrome (close path with killWindow is
		// the only legitimate spawnFactory use, and we didn't call close here).
		expect(spawn).not.toHaveBeenCalled()
		// CDP path is exercised exactly once with the requested URL.
		expect(chromeCdpBundle.created).toHaveLength(1)
		expect(chromeCdpBundle.created[0]!.url).toBe('https://duckduckgo.com')
		mgr._clearForTests()
	})

	it('Test 15 [Phase 101-04 RETIRED]: XAUTHORITY leak regression no longer applies — CDP path has no argv env-prefix surface', async () => {
		// The XAUTHORITY-leak test was a P100-08-02 regression lock on the
		// `sudo VAR=val google-chrome ...` argv shape. Post-101-04 there's no
		// argv to leak into — Chrome is booted once at livinityd.start() and
		// per-WebApp windows are CDP targets. Test promoted to a smoke check:
		// spawn() does NOT invoke spawnFactory at all on the happy path.
		const prev = process.env.XAUTHORITY
		process.env.XAUTHORITY = '/should/not/leak'
		try {
			const {mgr, spawn} = makeManager()
			await mgr.spawn({userId: 'u1', webappId: 'app-leak', url: 'https://duckduckgo.com'})
			// No spawnFactory call → no argv surface to leak through. Stronger
			// invariant than the original test.
			expect(spawn).not.toHaveBeenCalled()
			mgr._clearForTests()
		} finally {
			if (prev === undefined) delete process.env.XAUTHORITY
			else process.env.XAUTHORITY = prev
		}
	})
})

// ============================================================================
// Phase 100-08-04 per-WebApp Luse MCP lifecycle (Redis pub-sub) — 5 tests
// (Renamed P100-10-02 from bytebot per D-100-10-B.)
// ============================================================================

describe('WebAppWindowManager — Phase 100-08-04 per-WebApp Luse MCP lifecycle (Redis pub-sub)', () => {
	beforeEach(() => {
		vi.useRealTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('Test 16: spawn() calls mcpConfigManager.installServer with luse:webapp:<webappId> + descriptor env (DISPLAY=:1, LUSE_TARGET_WINDOW_ID)', async () => {
		const installCalls: any[] = []
		const mcpConfigManager = {
			installServer: vi.fn(async (config: any) => {
				installCalls.push(config)
			}),
			updateServer: vi.fn(async (_name: string, _updates: any) => null),
			removeServer: vi.fn(async (_name: string) => true),
		}
		const {mgr} = makeManager({
			mcpConfigManager,
			luseServerPath: '/tmp/server.ts',
		})
		await mgr.spawn({userId: 'user-1', webappId: 'webapp-abc', url: 'https://example.com'})
		expect(installCalls).toHaveLength(1)
		expect(installCalls[0]!.name).toBe('luse:webapp:webapp-abc')
		expect(installCalls[0]!.transport).toBe('stdio')
		expect(installCalls[0]!.env?.LUSE_TARGET_WINDOW_ID).toBe(String(0x200))
		expect(installCalls[0]!.env?.DISPLAY).toBe(':1')
		mgr._clearForTests()
	})

	it('Test 17: close() calls mcpConfigManager.removeServer with luse:webapp:<webappId>', async () => {
		const removeCalls: string[] = []
		const mcpConfigManager = {
			installServer: vi.fn(async () => {}),
			updateServer: vi.fn(async () => null),
			removeServer: vi.fn(async (name: string) => {
				removeCalls.push(name)
				return true
			}),
		}
		const {mgr} = makeManager({
			mcpConfigManager,
			luseServerPath: '/tmp/server.ts',
		})
		await mgr.spawn({userId: 'user-1', webappId: 'webapp-abc', url: 'https://example.com'})
		await mgr.close({webappId: 'webapp-abc', userId: 'user-1'})
		expect(removeCalls).toEqual(['luse:webapp:webapp-abc'])
	})

	it('Test 18: spawn() falls back to updateServer when installServer throws (idempotent re-spawn / regex rejection)', async () => {
		const updateCalls: any[] = []
		const mcpConfigManager = {
			installServer: vi.fn(async () => {
				throw new Error('Server "luse:webapp:webapp-abc" is already installed')
			}),
			updateServer: vi.fn(async (name: string, _updates: any) => {
				updateCalls.push({name})
				return {name} as any
			}),
			removeServer: vi.fn(async () => true),
		}
		const {mgr} = makeManager({
			mcpConfigManager,
			luseServerPath: '/tmp/server.ts',
		})
		await mgr.spawn({userId: 'user-1', webappId: 'webapp-abc', url: 'https://example.com'})
		expect(updateCalls).toHaveLength(1)
		expect(updateCalls[0]!.name).toBe('luse:webapp:webapp-abc')
		mgr._clearForTests()
	})

	it('Test 19: spawn() succeeds even when both installServer and updateServer fail (non-fatal MCP wiring)', async () => {
		const mcpConfigManager = {
			installServer: vi.fn(async () => {
				throw new Error('regex rejected')
			}),
			updateServer: vi.fn(async () => null),
			removeServer: vi.fn(async () => false),
		}
		const {mgr} = makeManager({
			mcpConfigManager,
			luseServerPath: '/tmp/server.ts',
		})
		const result = await mgr.spawn({
			userId: 'user-1',
			webappId: 'webapp-fail',
			url: 'https://example.com',
		})
		// Spawn still resolved with a valid SpawnResult.
		expect(result.webappId).toBe('webapp-fail')
		expect(result.windowId).toBe(0x200)
		mgr._clearForTests()
	})

	it('Test 20: spawn()/close() skip MCP wiring when mcpConfigManager is undefined (backward compat)', async () => {
		const {mgr} = makeManager() // no mcpConfigManager
		await expect(
			mgr.spawn({userId: 'user-1', webappId: 'webapp-bare', url: 'https://example.com'}),
		).resolves.toBeDefined()
		await expect(
			mgr.close({webappId: 'webapp-bare', userId: 'user-1'}),
		).resolves.toEqual({ok: true})
	})
})

// ============================================================================
// Phase 100-10-08 — D-100-10-A REVERTED (per-WebApp Xvfb withdrawn).
//
// The per-spawn allocate/Xvfb/fluxbox assertions from 100-10-01 (T-WM-10-01-01,
// T-WM-10-01-02, T-WM-10-01-03) are SKIPPED — they encoded the inverse of the
// post-revert contract. Re-enabling those tests is appropriate only when the
// Phase 101 CDP architecture lands (where Luse drives multi-target Chrome via
// DevTools Protocol while preserving shared profile). T-WM-10-01-04 is
// PROMOTED to the always-on path (legacy single-display behavior is now the
// only behavior) and renamed T-WM-10-08-01 to reflect the new contract.
// ============================================================================

describe('Phase 100-10-08 single-:1 display contract (D-100-10-A reverted)', () => {
	function makeAllocator() {
		const allocCalls: string[] = []
		const releaseCalls: string[] = []
		let counter = 10
		const allocator = {
			allocate: vi.fn(() => {
				const d = `:${counter++}`
				allocCalls.push(d)
				return d
			}),
			release: vi.fn((display: string) => {
				releaseCalls.push(display)
			}),
			inUse: vi.fn(() => allocCalls.filter((d) => !releaseCalls.includes(d))),
			on: vi.fn(),
			emit: vi.fn(),
			once: vi.fn(),
			off: vi.fn(),
		}
		return {allocator: allocator as any, allocCalls, releaseCalls}
	}

	function makeXvfbStartFn() {
		const fn = vi.fn(async () => ({
			pid: 1234,
			display: ':1',
			exited: new Promise(() => {}),
			stop: vi.fn(async () => {}),
		}))
		return {fn: fn as any}
	}

	function makeFluxboxStartFn() {
		const fn = vi.fn(async () => ({
			pid: 5678,
			display: ':1',
			exited: new Promise(() => {}),
			stop: vi.fn(async () => {}),
		}))
		return {fn: fn as any}
	}

	beforeEach(() => {
		vi.useRealTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	// --- 100-10-01 per-spawn assertions: SKIPPED post-revert (Phase 101 only) ---
	it.skip('T-WM-10-01-01 [SKIPPED in 100-10-08]: spawn() calls displayAllocator.allocate() — re-enable when Phase 101 CDP lands', () => {
		// Re-enable when Phase 101 introduces a CDP-driven Chrome that can target
		// per-display via DevTools Protocol while keeping shared profile.
	})
	it.skip('T-WM-10-01-02 [SKIPPED in 100-10-08]: DISPLAY env equals allocated :10/:11 — re-enable in Phase 101 CDP', () => {
		// Re-enable when Phase 101 CDP architecture allows per-display targeting.
	})
	it.skip('T-WM-10-01-03 [SKIPPED in 100-10-08]: close() calls displayAllocator.release — re-enable in Phase 101 CDP', () => {
		// Re-enable when Phase 101 CDP architecture allows per-display lifecycle.
	})

	// --- Post-revert always-on contract ---
	it('T-WM-10-08-01: spawn() NEVER calls displayAllocator.allocate() even when allocator is provided (D-100-10-A reverted; Phase 101-04 CDP path)', async () => {
		const {allocator} = makeAllocator()
		const xvfb = makeXvfbStartFn()
		const fluxbox = makeFluxboxStartFn()
		const {mgr, spawn, chromeCdpBundle} = makeManager({
			displayAllocator: allocator,
			xvfbStartFn: xvfb.fn,
			fluxboxStartFn: fluxbox.fn,
		})
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})
		// Post-100-10-08: allocate is a no-op even when allocator is wired in.
		expect(allocator.allocate).not.toHaveBeenCalled()
		// Singleton :1 display => no per-spawn Xvfb / fluxbox start either.
		expect(xvfb.fn).not.toHaveBeenCalled()
		expect(fluxbox.fn).not.toHaveBeenCalled()
		// Phase 101-04: Chrome is booted ONCE at livinityd.start(); per-WebApp
		// spawn does NOT invoke spawnFactory at all on the happy path. The
		// (display, --user-data-dir, --app=URL) flags now live in bootstrap.ts.
		expect(spawn).not.toHaveBeenCalled()
		// And the URL is delivered via CDP createWindowForUrl, not argv.
		expect(chromeCdpBundle.created).toHaveLength(1)
		mgr._clearForTests()
	})

	it('T-WM-10-08-02: close() NEVER calls displayAllocator.release (D-100-10-A reverted; lifecycle moves out of spawn/close)', async () => {
		const {allocator} = makeAllocator()
		const {mgr} = makeManager({displayAllocator: allocator})
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})
		await mgr.close({webappId: 'app1', userId: 'u1'})
		expect(allocator.release).not.toHaveBeenCalled()
	})

	it('T-WM-10-08-03 (back-compat regression lock; was T-WM-10-01-04): no allocator → no per-spawn X11 spawns (Phase 101-04: CDP path means no Chrome spawn at all)', async () => {
		const xvfb = makeXvfbStartFn()
		const fluxbox = makeFluxboxStartFn()
		// No displayAllocator passed — matches the new always-on contract.
		const {mgr, spawn, chromeCdpBundle} = makeManager({
			xvfbStartFn: xvfb.fn,
			fluxboxStartFn: fluxbox.fn,
		})
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})
		// Phase 101-04: no spawnFactory invocation on happy path; URL is
		// delivered via CDP createWindowForUrl. Xvfb/fluxbox lifecycle moved
		// to livinityd.start() (100-08-01 baseline).
		expect(spawn).not.toHaveBeenCalled()
		expect(chromeCdpBundle.created).toHaveLength(1)
		expect(chromeCdpBundle.created[0]!.url).toBe('https://example.com')
		expect(xvfb.fn).not.toHaveBeenCalled()
		expect(fluxbox.fn).not.toHaveBeenCalled()
		mgr._clearForTests()
	})
})

// ============================================================================
// Phase 100-10-11 — Per-WebApp cascade window-position
//
// User UAT 2026-05-10: opening two concurrent WebApps causes visual overlap
// because every WebApp spawns at --window-position=0,0 on the shared :1
// display. The second Chrome window stacks on the same display origin and
// x11vnc captures whichever fluxbox raised most recently — user sees only one
// WebApp's pixels even though both are alive.
//
// Fix: cascade per-spawn --window-position by `n * 120` where `n` is the
// current count of active WebApps. Modulo wrap at 10 slots so we never
// generate off-screen positions on the Xvfb 1920x1080 :1 display.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNTOUCHED.
// ============================================================================

describe('Phase 100-10-11 per-WebApp cascade window-position', () => {
	beforeEach(() => {
		vi.useRealTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	// Phase 101-04 — cascade is now passed to CDP createWindowForUrl({left, top})
	// instead of the legacy `--window-position=X,Y` argv. The PID-narrowed
	// discovery mock returns a unique wid string per call so idempotency
	// doesn't short-circuit subsequent spawns. Default `makeDiscovery()`
	// returns a constant `'512'`, so we override here.
	function makeDiscoveryWithUniqueWids() {
		let nextWid = 0x200
		const isWindowAlive = vi.fn(async () => true)
		const activateWindow = vi.fn(async () => true)
		const snapshotWindowIds = vi.fn(async () => new Set<number>([0x100]))
		const findNewWindowMatching = vi.fn(async () => ({
			wid: nextWid,
			title: 'WebApp',
			geometry: {x: 0, y: 0, w: 800, h: 600},
		}))
		const listWindowIdsForPid = vi.fn(async (_pid: number) => [] as string[])
		const findNewWindowByPid = vi.fn(
			async (_opts: {chromePid: number; baselineWids: string[]; timeoutMs: number}) => ({
				wid: String(nextWid++),
			}) as {wid: string} | null,
		)
		const getWindowGeometry = vi.fn(async () => ({x: 0, y: 0, w: 800, h: 600}))
		return {
			isWindowAlive,
			activateWindow,
			snapshotWindowIds,
			findNewWindowMatching,
			findNewWindowByPid,
			listWindowIdsForPid,
			getWindowGeometry,
		}
	}

	it('T-10-11-CASCADE-01: per-WebApp CDP bounds cascade (0,0) → (120,120) → (240,240) (Phase 101-04: now passed as createWindowForUrl bounds, not --window-position argv)', async () => {
		const discovery = makeDiscoveryWithUniqueWids()
		const {mgr, chromeCdpBundle} = makeManager({discovery})
		await mgr.spawn({userId: 'u1', webappId: 'app-a', url: 'https://a.test'})
		await mgr.spawn({userId: 'u1', webappId: 'app-b', url: 'https://b.test'})
		await mgr.spawn({userId: 'u1', webappId: 'app-c', url: 'https://c.test'})

		expect(chromeCdpBundle.created).toHaveLength(3)
		expect(chromeCdpBundle.created[0]!.opts).toMatchObject({left: 0, top: 0, width: 1280, height: 720})
		expect(chromeCdpBundle.created[1]!.opts).toMatchObject({left: 120, top: 120, width: 1280, height: 720})
		expect(chromeCdpBundle.created[2]!.opts).toMatchObject({left: 240, top: 240, width: 1280, height: 720})

		mgr._clearForTests()
	})

	it('T-10-11-CASCADE-02: cascade wraps around to avoid off-screen positions (CDP bounds, Phase 101-04)', async () => {
		const discovery = makeDiscoveryWithUniqueWids()
		const {mgr, chromeCdpBundle} = makeManager({discovery})
		for (let i = 0; i < 11; i++) {
			await mgr.spawn({userId: 'u1', webappId: `app-${i}`, url: `https://test-${i}.local`})
		}
		expect(chromeCdpBundle.created).toHaveLength(11)

		// All positions must be on-screen (Xvfb :1 is 1920x1080).
		for (const c of chromeCdpBundle.created) {
			expect(c.opts.left).toBeGreaterThanOrEqual(0)
			expect(c.opts.left).toBeLessThan(1920)
			expect(c.opts.top).toBeGreaterThanOrEqual(0)
			expect(c.opts.top).toBeLessThan(1080)
		}

		// Cascade pattern must produce DISTINCT positions for the first 10
		// spawns (regression lock against the pre-fix constant `0,0` shape).
		const firstTen = new Set(
			chromeCdpBundle.created.slice(0, 10).map((c) => `${c.opts.left},${c.opts.top}`),
		)
		expect(firstTen.size).toBe(10)

		// 11th spawn (index 10) is slot 10 % 10 = 0 → wraps back to (0,0).
		expect(chromeCdpBundle.created[10]!.opts.left).toBe(0)
		expect(chromeCdpBundle.created[10]!.opts.top).toBe(0)

		mgr._clearForTests()
	})
})

// ============================================================================
// Phase 101-04 — CDP-driven WebApp Spawn (Window-Manager Rewrite)
//
// The `sudo google-chrome --app=URL --user-data-dir=...` argv path is GONE.
// Instead, the spawn body drives Chrome via:
//   1. chromeCdpClient.getChromePid()      — pid of the connected Chrome
//   2. discovery.listWindowIdsForPid(pid)  — baseline wids BEFORE createTarget
//   3. chromeCdpClient.createWindowForUrl(url, {width,height,left,top}) — new window
//   4. discovery.findNewWindowByPid({chromePid, baselineWids, timeoutMs:5000})
//      — first new wid for THIS PID is ours (deterministic; no title race)
//
// On close: chromeCdpClient.closeTarget(targetId) releases the CDP target
// (and therefore the Chrome window) so port releases align with target life.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNTOUCHED.
// ============================================================================

describe('Phase 101-04 — CDP-driven spawn body (replaces --app=URL argv + title-match)', () => {
	beforeEach(() => {
		vi.useRealTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('T-101-04-01: spawn calls chromeCdpClient.createWindowForUrl with {url, width:1280, height:720, left, top}', async () => {
		const {mgr, chromeCdpBundle} = makeManager()
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})
		expect(chromeCdpBundle.created).toHaveLength(1)
		expect(chromeCdpBundle.created[0]!.url).toBe('https://example.com')
		expect(chromeCdpBundle.created[0]!.opts).toMatchObject({
			width: 1280,
			height: 720,
			left: 0,
			top: 0,
		})
		mgr._clearForTests()
	})

	it('T-101-04-02: spawn calls discovery.findNewWindowByPid with {chromePid, baselineWids, timeoutMs:5000} (RESEARCH Q1 RESOLVED)', async () => {
		const discovery = makeDiscovery()
		const {mgr, chromeCdpBundle} = makeManager({discovery})
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})
		expect(discovery.findNewWindowByPid).toHaveBeenCalledTimes(1)
		const call = (discovery.findNewWindowByPid as any).mock.calls[0]![0]
		expect(call.chromePid).toBe(12345)
		expect(call.baselineWids).toEqual([])
		expect(call.timeoutMs).toBe(5000)
		// getChromePid was called BEFORE listWindowIdsForPid was called BEFORE
		// createWindowForUrl was called BEFORE findNewWindowByPid.
		expect(chromeCdpBundle.client.getChromePid).toHaveBeenCalled()
		mgr._clearForTests()
	})

	it('T-101-04-03: spawn does NOT call discovery.findNewWindowMatching (legacy title-match path is gone from window-manager.ts)', async () => {
		const discovery = makeDiscovery()
		const {mgr} = makeManager({discovery})
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})
		expect(discovery.findNewWindowMatching).not.toHaveBeenCalled()
		mgr._clearForTests()
	})

	it('T-101-04-04: spawn snapshots baselineWids via discovery.listWindowIdsForPid(chromePid) BEFORE createWindowForUrl', async () => {
		const discovery = makeDiscovery()
		// Make listWindowIdsForPid return a specific baseline so we can prove
		// it was the baseline passed to findNewWindowByPid.
		const baselineSnapshot = ['111', '222']
		discovery.listWindowIdsForPid = vi.fn(async (_pid: number) => baselineSnapshot)
		const {mgr, chromeCdpBundle} = makeManager({discovery})
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})
		expect(discovery.listWindowIdsForPid).toHaveBeenCalledWith(12345)
		// Order: listWindowIdsForPid call returned BEFORE createWindowForUrl was
		// invoked. We can prove this by checking the invocationCallOrder fields.
		const baselineOrder = (discovery.listWindowIdsForPid as any).mock.invocationCallOrder[0]
		const createOrder = (chromeCdpBundle.client.createWindowForUrl as any).mock.invocationCallOrder[0]
		expect(baselineOrder).toBeLessThan(createOrder)
		// And the baseline returned by listWindowIdsForPid is what flowed into
		// findNewWindowByPid as `baselineWids`.
		const findCall = (discovery.findNewWindowByPid as any).mock.calls[0]![0]
		expect(findCall.baselineWids).toEqual(baselineSnapshot)
		mgr._clearForTests()
	})

	it('T-101-04-05: spawn does NOT call spawnFactory("sudo", ...) — argv path is dead', async () => {
		const {mgr, spawn} = makeManager()
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})
		// Inspect every spawn call: none must have cmd === 'sudo'.
		for (const call of spawn.mock.calls) {
			const [cmd] = call as unknown as [string, string[]]
			expect(cmd).not.toBe('sudo')
		}
		mgr._clearForTests()
	})

	it('T-101-04-06: spawn does NOT call spawnFactory("google-chrome", ...) — argv path is dead', async () => {
		const {mgr, spawn} = makeManager()
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})
		for (const call of spawn.mock.calls) {
			const [cmd] = call as unknown as [string, string[]]
			expect(cmd).not.toBe('google-chrome')
		}
		mgr._clearForTests()
	})

	it('T-101-04-07: cascade offset starts at (0,0) and steps by 120 with wrap at 10 active (Phase 101-04 carries 100-10-11 invariant)', async () => {
		let nextWid = 1000
		const discovery = makeDiscovery()
		discovery.findNewWindowByPid = vi.fn(
			async (_opts: any) => ({wid: String(nextWid++)}) as {wid: string} | null,
		)
		const {mgr, chromeCdpBundle} = makeManager({discovery})
		// Spawn 11 to prove wrap.
		for (let i = 0; i < 11; i++) {
			await mgr.spawn({userId: 'u1', webappId: `app-${i}`, url: `https://t-${i}.test`})
		}
		expect(chromeCdpBundle.created).toHaveLength(11)
		expect(chromeCdpBundle.created[0]!.opts.left).toBe(0)
		expect(chromeCdpBundle.created[0]!.opts.top).toBe(0)
		expect(chromeCdpBundle.created[1]!.opts.left).toBe(120)
		expect(chromeCdpBundle.created[1]!.opts.top).toBe(120)
		expect(chromeCdpBundle.created[10]!.opts.left).toBe(0)
		expect(chromeCdpBundle.created[10]!.opts.top).toBe(0)
		mgr._clearForTests()
	})

	it('T-101-04-08: spawn stashes targetId on the per-entry record (so close() can route through CDP closeTarget)', async () => {
		const {mgr, chromeCdpBundle} = makeManager()
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})
		// We can't directly read the ActiveWebApp map without a test helper; but
		// closing the WebApp must invoke closeTarget with the SAME targetId that
		// createWindowForUrl returned (`'tgt-1'`).
		await mgr.close({webappId: 'app1', userId: 'u1'})
		expect(chromeCdpBundle.closed).toEqual(['tgt-1'])
		mgr._clearForTests()
	})

	it('T-101-04-09: close path calls chromeCdpClient.closeTarget(targetId) for the entry', async () => {
		const {mgr, chromeCdpBundle} = makeManager()
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://a.test'})
		await mgr.spawn({userId: 'u1', webappId: 'app2', url: 'https://b.test'})
		// Two CDP creates → two targets.
		expect(chromeCdpBundle.created).toHaveLength(2)
		// Close ONLY app1 — closeTarget must be called with 'tgt-1' but NOT 'tgt-2'.
		await mgr.close({webappId: 'app1', userId: 'u1'})
		expect(chromeCdpBundle.closed).toEqual(['tgt-1'])
		// app2 still alive — close it now and assert tgt-2 also routed through CDP.
		await mgr.close({webappId: 'app2', userId: 'u1'})
		expect(chromeCdpBundle.closed).toEqual(['tgt-1', 'tgt-2'])
		mgr._clearForTests()
	})

	it('T-101-04-10: WindowNotFoundError thrown when findNewWindowByPid returns null; CDP target is cleaned up via closeTarget before throwing', async () => {
		const discovery = makeDiscovery()
		discovery.findNewWindowByPid = vi.fn(async () => null)
		const {mgr, chromeCdpBundle} = makeManager({discovery})
		await expect(
			mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'}),
		).rejects.toBeInstanceOf(WindowNotFoundError)
		// Degenerate-case cleanup: closeTarget must have been called on the
		// orphan CDP target so we don't leak a window.
		expect(chromeCdpBundle.closed).toEqual(['tgt-1'])
		mgr._clearForTests()
	})
})
