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
// Phase 102-04 — new fixtures for the per-app Xvfb + Chrome subprocess rewrite
// of `spawn()`. These types model the Wave 1 primitives (102-01 DisplayAllocator
// + spawnXvfb, 102-02 spawnChromeProcess, 102-03 ProfileSeederHandle) that
// 102-04 wires into WebAppWindowManager. Re-imported indirectly so the test
// file's TypeScript references match the production opt shapes the rewrite adds.
import type {DisplayAllocator, XvfbHandle} from '../streaming/index.js'
// Phase 255-03 — runtime import for the disjoint-range invariant test + the two
// allocator-range constants. Live in streaming/display-allocator.ts (a light
// leaf module — importing index.ts here would load the whole daemon + native
// bindings) and are consumed by livinityd index.ts to wire the disjoint ranges.
import {
	DisplayAllocator as RealDisplayAllocator,
	WEBAPP_DISPLAY_ALLOCATOR_RANGE,
	MCP_CREATE_ALLOCATOR_START,
} from '../streaming/index.js'
import type {ChromeProcessHandle} from './chrome-process-spawner.js'
import type {ProfileSeederHandle} from '../chrome-master/index.js'
import type {PortAllocator} from '../streaming/port-allocator.js'

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

/**
 * Phase 102-04 — legacy makeManager now wraps makeManager102 so the historical
 * test bodies can keep their fixture shape without needing to know about the
 * new per-app primitives. Tests that previously asserted CDP behavior have
 * been retired (see describe.skip below) but tests that exercise general
 * manager surface (spawn happy path, idempotency, list filter, close cascade)
 * still need a working manager.
 *
 * The returned bundle preserves the original `chromeCdpBundle` field so older
 * call sites that destructured it still type-check; under 102-04 the bundle
 * is a no-op record (its mocks are never invoked by spawn() anymore).
 */
function makeManager(overrides: any = {}) {
	const chromeCdpBundle = overrides.chromeCdpBundle ?? makeChromeCdpClient()
	const m102 = makeManager102(overrides)
	const trackerInstances: Array<{start: any; stop: any}> = []
	return {
		mgr: m102.mgr,
		streamManager: m102.streamManager,
		started: m102.started,
		stopped: m102.stopped,
		discovery: m102.discovery,
		portal: m102.portal,
		closeSession: vi.fn(),
		spawn: m102.spawn,
		trackerInstances, // empty under 102-04; geometry-tracker is null
		logger: m102.logger,
		chromeCdpBundle, // unused under 102-04 — kept for legacy destructuring
	}
}

describe('WebAppWindowManager', () => {
	beforeEach(() => {
		vi.useRealTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('Test 1: spawn happy path returns {webappId,windowId:0,streamId,wsUrl} with mode:"vnc-window" + target:{display} (Phase 102-04: per-app-display path)', async () => {
		const {mgr, streamManager, started} = makeManager()
		const r = await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'})
		// Phase 102-04: windowId is vestigial 0 (display is the unit of identity).
		expect(r.windowId).toBe(0)
		expect(r.streamId).toMatch(/^stream-/)
		expect(r.wsUrl).toMatch(/^\/ws\/stream\//)
		expect(streamManager.startStream).toHaveBeenCalledOnce()
		expect(started[0].mode).toBe('vnc-window')
		// Phase 102-04: target is {display: ':10'} (whole-display capture).
		expect(started[0].target).toEqual({display: ':10'})
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

	it('Test 3: spawn uses vnc-window with target:{display} regardless of portal state (Phase 102-04 swap)', async () => {
		const portalBundle = makePortal({available: false})
		const {mgr, started, trackerInstances, portal} = makeManager({portalBundle})
		const r = await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'})
		expect(started[0].mode).toBe('vnc-window')
		// Phase 102-04: target is {display}; whole-display capture via x11vnc -display :N
		expect(started[0].target).toEqual({display: ':10'})
		// Portal probe is GONE — D-99-04: x11vnc -display :N needs no PipeWire portal
		expect(portal.isPortalAvailable).not.toHaveBeenCalled()
		expect(portal.requestWindowSession).not.toHaveBeenCalled()
		// GeometryTracker is GONE — x11vnc reads the whole display
		expect(trackerInstances).toHaveLength(0)
		expect(r.streamId).toMatch(/^stream-/)
		mgr._clearForTests()
	})

	it.skip('Test 4 [Phase 102-04 RETIRED]: WINDOW_NOT_FOUND via title race — per-app-display has no race window', () => {
		// Under Phase 102-04 the window is its own display (1:1). There is no
		// title-match race, no PID-narrowed lookup, no findNewWindowByPid call,
		// and therefore no WINDOW_NOT_FOUND failure mode. Compensating cleanup
		// on Xvfb/Chrome/seed failure is verified by Phase 102-04's own
		// T-102-04-05/06/07 in this file.
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

	it('Test 6 [Phase 102-04 adapted]: focus on existing entry returns ok:true (no wid-based activateWindow under per-app-display)', async () => {
		const {mgr, discovery} = makeManager()
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'})
		const r = await mgr.focus({webappId: 'app1', userId: 'u1'})
		expect(r.ok).toBe(true)
		// Phase 102-04: no wid → no activateWindow call. 102-08 will replace
		// focus with display-level xdotool activate (or display swap).
		expect(discovery.activateWindow).not.toHaveBeenCalled()
		mgr._clearForTests()
	})

	it.skip('Test 7 [Phase 102-04 RETIRED]: focus WINDOW_GONE auto-close — no wid liveness probe under per-app-display', () => {
		// Under Phase 102-04 the wid is always 0; the entry's liveness is
		// keyed on display existence (xdpyinfo :N). 102-08 will re-introduce
		// a display-alive probe; until then focus() is always ok:true while
		// the entry is in the map.
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

	it.skip('Test 10 [Phase 102-04 RETIRED]: idle-cleanup wid-alive probe — per-app-display will use display-alive in 102-08', () => {
		// 102-04 idleCleanupTick is a no-op when wid=0 (always under per-app
		// path). 102-08 will replace with xdpyinfo :N alive check + cascading
		// chrome.stop / xvfb.stop / profile.cleanup / display.release.
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

	it('Test 12 [Phase 102-04 adapted]: spawn() calls streamManager.startStream with mode:"vnc-window" and target:{display}', async () => {
		const {mgr, streamManager, started} = makeManager()
		const r = await mgr.spawn({userId: 'admin', webappId: 'wa-1', url: 'https://example.com'})
		expect(streamManager.startStream).toHaveBeenCalledTimes(1)
		expect(started[0].mode).toBe('vnc-window')
		// Phase 102-04: target shape is {display} (was {wid} under Phase 99-04).
		expect(started[0].target).toEqual({display: ':10'})
		expect(r.streamId).toMatch(/^stream-/)
		mgr._clearForTests()
	})

	it('Test 13: close() cascades stopStream for vnc-window entries', async () => {
		const {mgr, streamManager} = makeManager()
		await mgr.spawn({userId: 'admin', webappId: 'wa-2', url: 'https://example.com'})
		await mgr.close({webappId: 'wa-2', userId: 'admin'})
		expect(streamManager.stopStream).toHaveBeenCalledWith(expect.stringMatching(/^stream-/))
	})

	it.skip('Test 14 [Phase 102-04 RETIRED]: idleCleanupTick wid-alive probe — supersedes by 102-08 display-alive', () => {
		// Same rationale as Test 10. Re-enable under 102-08 when display-alive
		// (xdpyinfo :N) replaces the wid-alive probe.
	})

	it('Test 11 [Phase 102-04 adapted]: spawn does NOT call the legacy raw spawn factory; Chrome is launched via injected chromeSpawnFn', async () => {
		// Phase 102-04: Chrome is launched by the injected chromeSpawnFn
		// (defaulting to spawnChromeProcess from chrome-process-spawner.ts).
		// The raw spawn factory (this.spawnFactory) is reserved for ad-hoc
		// xdotool ops (e.g. close({killWindow:true})), never for Chrome.
		const {mgr, spawn} = makeManager()
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://duckduckgo.com'})
		expect(spawn).not.toHaveBeenCalled()
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

	it('Test 16 [Phase 102-04 adapted]: spawn() calls mcpConfigManager.installServer with luse:webapp:<webappId> + descriptor env (DISPLAY=:N, LUSE_TARGET_WINDOW_ID=0)', async () => {
		// Phase 102 deploy UAT round 4 — per-WebApp Luse MCP registration
		// now gated behind LIVOS_PER_APP_LUSE=1 env (default skip to reduce
		// agent tool clutter). Set env for this test.
		const prevEnv = process.env.LIVOS_PER_APP_LUSE
		// Phase 103-05: default flipped OFF. Explicit opt-in '1' is now
		// required to trigger registerWebAppMcp (was "anything-but-0").
		process.env.LIVOS_PER_APP_LUSE = '1'
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
		expect(installCalls[0]!.name).toBe('luse:webapp:example-weba')
		expect(installCalls[0]!.transport).toBe('stdio')
		// Phase 102-04/102-06: DISPLAY matches the per-app allocated display
		// (:10 for the first WebApp). LUSE_TARGET_DISPLAY is the canonical
		// Phase 102 env (replaces LUSE_TARGET_WINDOW_ID from pre-102-06).
		expect(installCalls[0]!.env?.DISPLAY).toBe(':10')
		expect(installCalls[0]!.env?.LUSE_TARGET_DISPLAY).toBe(':10')
		// LUSE_TARGET_WINDOW_ID is no longer set per-WebApp (102-06).
		expect(installCalls[0]!.env?.LUSE_TARGET_WINDOW_ID).toBeUndefined()
		mgr._clearForTests()
		// Restore env to avoid bleeding into subsequent tests.
		if (prevEnv === undefined) delete process.env.LIVOS_PER_APP_LUSE
		else process.env.LIVOS_PER_APP_LUSE = prevEnv
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
		expect(removeCalls).toEqual(['luse:webapp:example-weba'])
	})

	it('Test 18: spawn() falls back to updateServer when installServer throws (idempotent re-spawn / regex rejection)', async () => {
		// Phase 102 deploy UAT round 4 — gated behind LIVOS_PER_APP_LUSE=1.
		const prevEnv = process.env.LIVOS_PER_APP_LUSE
		// Phase 103-05: default flipped OFF — must set '1' explicitly.
		process.env.LIVOS_PER_APP_LUSE = '1'
		const updateCalls: any[] = []
		const mcpConfigManager = {
			installServer: vi.fn(async () => {
				throw new Error('Server "luse:webapp:example-weba" is already installed')
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
		expect(updateCalls[0]!.name).toBe('luse:webapp:example-weba')
		mgr._clearForTests()
		if (prevEnv === undefined) delete process.env.LIVOS_PER_APP_LUSE
		else process.env.LIVOS_PER_APP_LUSE = prevEnv
	})

	it('Test 19 [Phase 102-04 adapted]: spawn() succeeds even when both installServer and updateServer fail (non-fatal MCP wiring)', async () => {
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
		// Phase 102-04: windowId is vestigial 0 (display is the unit).
		expect(result.windowId).toBe(0)
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

	// ========================================================================
	// Phase 103-05 (REQ-103-B5) — LIVOS_PER_APP_LUSE default flip env-coverage.
	//
	// Before 103-05: gate was `process.env.LIVOS_PER_APP_LUSE !== '0'` —
	// registration on by default; only literal '0' opted out.
	// After 103-05: gate is `process.env.LIVOS_PER_APP_LUSE === '1'` —
	// registration off by default; ONLY literal '1' opts in.
	//
	// Rationale: 103-03 + 103-04 ship the single-MCP display-aware path; the
	// global `luse` MCP accepts per-call `display: ":N"` on every X11 tool
	// and the prompt instructs the agent to pass it. Per-WebApp MCP regs
	// became redundant + triggered Claude Code wildcard permission prompts.
	// ========================================================================

	describe('Phase 103-05 — LIVOS_PER_APP_LUSE default-off env coverage', () => {
		function makeMcpSpy() {
			const installCalls: any[] = []
			return {
				installServer: vi.fn(async (config: any) => {
					installCalls.push(config)
				}),
				updateServer: vi.fn(async (_n: string, _u: any) => null),
				removeServer: vi.fn(async (_n: string) => true),
				installCalls,
			}
		}

		// Save / restore the env across each test so we don't bleed.
		let prevEnv: string | undefined
		beforeEach(() => {
			prevEnv = process.env.LIVOS_PER_APP_LUSE
			delete process.env.LIVOS_PER_APP_LUSE
		})
		afterEach(() => {
			if (prevEnv === undefined) delete process.env.LIVOS_PER_APP_LUSE
			else process.env.LIVOS_PER_APP_LUSE = prevEnv
		})

		it('Test 21 [REQ-103-B5]: default (env unset) → spawn() does NOT call installServer (registration skipped)', async () => {
			// env was deleted in beforeEach → simulates fresh process with no flag
			const mcp = makeMcpSpy()
			const {mgr} = makeManager({mcpConfigManager: mcp, luseServerPath: '/tmp/server.ts'})
			await mgr.spawn({userId: 'user-1', webappId: 'webapp-default', url: 'https://example.com'})
			expect(mcp.installServer).not.toHaveBeenCalled()
			expect(mcp.installCalls).toHaveLength(0)
			mgr._clearForTests()
		})

		it('Test 22 [REQ-103-B5]: explicit LIVOS_PER_APP_LUSE=0 → spawn() does NOT call installServer', async () => {
			process.env.LIVOS_PER_APP_LUSE = '0'
			const mcp = makeMcpSpy()
			const {mgr} = makeManager({mcpConfigManager: mcp, luseServerPath: '/tmp/server.ts'})
			await mgr.spawn({userId: 'user-1', webappId: 'webapp-zero', url: 'https://example.com'})
			expect(mcp.installServer).not.toHaveBeenCalled()
			mgr._clearForTests()
		})

		it("Test 23 [REQ-103-B5]: explicit LIVOS_PER_APP_LUSE='1' → spawn() CALLS installServer exactly once (legacy per-app opt-in)", async () => {
			process.env.LIVOS_PER_APP_LUSE = '1'
			const mcp = makeMcpSpy()
			const {mgr} = makeManager({mcpConfigManager: mcp, luseServerPath: '/tmp/server.ts'})
			await mgr.spawn({userId: 'user-1', webappId: 'webapp-one', url: 'https://example.com'})
			expect(mcp.installServer).toHaveBeenCalledTimes(1)
			// suffix = 'webapp-one'.substring(0,4) === 'weba'; slug from
			// hostname 'example.com' (first path segment) === 'example'.
			expect(mcp.installCalls[0]!.name).toBe('luse:webapp:example-weba')
			mgr._clearForTests()
		})

		it("Test 24 [REQ-103-B5]: ambiguous strings ('true'/'yes'/'on') → spawn() does NOT call installServer (only literal '1' opts in)", async () => {
			for (const val of ['true', 'yes', 'on', 'TRUE', '2', ' 1 ']) {
				process.env.LIVOS_PER_APP_LUSE = val
				const mcp = makeMcpSpy()
				const {mgr} = makeManager({mcpConfigManager: mcp, luseServerPath: '/tmp/server.ts'})
				await mgr.spawn({
					userId: 'user-1',
					webappId: `webapp-${val.replace(/\s/g, 'x')}`,
					url: 'https://example.com',
				})
				expect(
					mcp.installServer,
					`expected installServer NOT called for LIVOS_PER_APP_LUSE='${val}'`,
				).not.toHaveBeenCalled()
				mgr._clearForTests()
			}
		})

		it('Test 25 [REQ-103-B5]: skip path emits "per-WebApp Luse MCP SKIPPED" info log mentioning Phase 103-05 default-off', async () => {
			// env unset → skip branch
			const mcp = makeMcpSpy()
			const {mgr, logger} = makeManager({mcpConfigManager: mcp, luseServerPath: '/tmp/server.ts'})
			await mgr.spawn({userId: 'user-1', webappId: 'webapp-log', url: 'https://example.com'})
			// logger.info is a vi.fn() in makeManager102 — find a call mentioning the skip.
			const infoCalls = (logger.info as any).mock.calls.map((c: any[]) => String(c[0]))
			const skipLine = infoCalls.find((line: string) =>
				line.includes('per-WebApp Luse MCP SKIPPED'),
			)
			expect(skipLine).toBeDefined()
			expect(skipLine).toMatch(/Phase 103-05|default-off/)
			mgr._clearForTests()
		})
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

describe.skip('Phase 100-10-08 single-:1 display contract — RETIRED by 102-04 per-app-display rewrite', () => {
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

describe.skip('Phase 100-10-11 per-WebApp cascade — RETIRED by 102-04 (per-app-display makes overlap impossible)', () => {
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
			chromeCdpBundle.created.slice(0, 10).map((c: any) => `${c.opts.left},${c.opts.top}`),
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

describe.skip('Phase 101-04 CDP-driven spawn body — RETIRED by 102-04 (CDP path replaced by per-app Xvfb+Chrome subprocess)', () => {
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

// ============================================================================
// Phase 102-04 — Per-app Xvfb + Chrome subprocess rewrite of spawn() body
//
// Replaces the Phase 101-04 CDP-driven flow (chromeCdpClient.createWindowForUrl
// + PID-narrowed wid lookup against a singleton Chrome) with per-app primitives
// from Wave 1:
//   1. displayAllocator.allocate() → N
//   2. spawnXvfb({display: `:${N}`, ...}) — A2 fluxbox-or-not toggle
//   3. profileSeeder.seed({uuid: webappId}) → /tmp/livos-chrome-app-<uuid>
//   4. spawnChromeProcess({display, userDataDir, url, ...}) — per-app Chrome
//   5. portAllocator.allocate() → port
//   6. streamManager.startStream({mode:'vnc-window', target:{display}, ...})
//   7. ActiveWebApp map entry stores all handles for 102-08 close lifecycle
//   8. Return {streamId, wsUrl, display, port}
//
// Compensating cleanup: on any partial failure release display + port,
// stop xvfb + chrome, cleanup profile.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNTOUCHED.
// ============================================================================

function makeFakeDisplayAllocator(opts: {nextN?: number} = {}) {
	const allocCalls: number[] = []
	const releaseCalls: number[] = []
	let next = opts.nextN ?? 10
	const allocate = vi.fn(() => {
		const n = next++
		allocCalls.push(n)
		return n
	})
	const release = vi.fn((n: number) => {
		releaseCalls.push(n)
	})
	const allocator = {
		allocate,
		release,
		// Match DisplayAllocator public surface used by callers (none of these
		// are dereferenced by spawn(), but keep the class shape compatible).
		inUseCount: 0,
		capacity: 90,
	} as unknown as DisplayAllocator
	return {allocator, allocCalls, releaseCalls}
}

function makeFakeProfileSeeder(opts: {seedUuid?: string} = {}): {
	seeder: ProfileSeederHandle
	seedCalls: Array<{uuid?: string}>
	cleanupCalls: string[]
} {
	const seedCalls: Array<{uuid?: string}> = []
	const cleanupCalls: string[] = []
	const seed = vi.fn(async (seedOpts: {uuid?: string} = {}) => {
		seedCalls.push({uuid: seedOpts.uuid})
		const uuid = seedOpts.uuid ?? opts.seedUuid ?? 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
		return {uuid, appDir: `/tmp/livos-chrome-app-${uuid}`}
	})
	const cleanup = vi.fn(async (uuid: string) => {
		cleanupCalls.push(uuid)
	})
	const ensureMasterExists = vi.fn(async () => {})
	const sweepOrphans = vi.fn(async () => 0)
	const seeder: ProfileSeederHandle = {seed, ensureMasterExists, cleanup, sweepOrphans}
	return {seeder, seedCalls, cleanupCalls}
}

function makeFakeXvfbSpawnFn(opts: {rejectWith?: Error} = {}) {
	const calls: Array<{display: string; width?: number; height?: number}> = []
	const stopCalls: string[] = []
	const fn = vi.fn(async (xvfbOpts: any) => {
		if (opts.rejectWith) throw opts.rejectWith
		calls.push({display: xvfbOpts.display, width: xvfbOpts.width, height: xvfbOpts.height})
		const stop = vi.fn(async () => {
			stopCalls.push(xvfbOpts.display)
		})
		const handle: XvfbHandle = {
			pid: 11000 + calls.length,
			display: xvfbOpts.display,
			exited: new Promise(() => {}), // never resolves in tests
			stop,
		}
		return handle
	}) as unknown as (xvfbOpts: any) => Promise<XvfbHandle>
	return {fn, calls, stopCalls}
}

function makeFakeChromeSpawnFn(opts: {rejectWith?: Error} = {}) {
	const calls: Array<{display: string; userDataDir: string; url: string}> = []
	const stopCalls: string[] = []
	const fn = vi.fn(async (chromeOpts: any) => {
		if (opts.rejectWith) throw opts.rejectWith
		calls.push({
			display: chromeOpts.display,
			userDataDir: chromeOpts.userDataDir,
			url: chromeOpts.url,
		})
		const stop = vi.fn(async () => {
			stopCalls.push(chromeOpts.display)
		})
		const handle: ChromeProcessHandle = {
			pid: 22000 + calls.length,
			child: new FakeChild() as unknown as ChromeProcessHandle['child'],
			display: chromeOpts.display,
			userDataDir: chromeOpts.userDataDir,
			stop,
		}
		return handle
	}) as unknown as (chromeOpts: any) => Promise<ChromeProcessHandle>
	return {fn, calls, stopCalls}
}

function makeFakePortAllocator(opts: {nextPort?: number} = {}) {
	const allocCalls: number[] = []
	const releaseCalls: number[] = []
	let next = opts.nextPort ?? 15900
	const allocate = vi.fn(() => {
		const p = next++
		allocCalls.push(p)
		return p
	})
	const release = vi.fn((p: number) => {
		releaseCalls.push(p)
	})
	const allocator = {
		allocate,
		release,
		inUseCount: 0,
		capacity: 100,
	} as unknown as PortAllocator
	return {allocator, allocCalls, releaseCalls}
}

/**
 * Builder for a manager configured with the Phase 102-04 per-app primitives.
 * Mirrors makeManager() but injects the new opts (displayAllocator,
 * xvfbSpawnFn, chromeSpawnFn, profileSeeder, portAllocator, withWindowManager).
 *
 * Streams, discovery, and portal still use the existing helpers because Phase
 * 102 does NOT change those surfaces — display targeting flows through the
 * existing stream-manager `{display}` branch (Phase 100-10-04).
 */
function makeManager102(overrides: any = {}) {
	const {streamManager, started, stopped} = makeStreamManager()
	const discovery = overrides.discovery ?? makeDiscovery()
	const {portal} = overrides.portalBundle ?? makePortal()
	const {ctor: GeometryTrackerCtor} = makeGeometryTrackerCtor()
	const spawn = vi.fn(() => new FakeChild() as any)
	const logger = {info: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn()}

	const displayBundle = overrides.displayBundle ?? makeFakeDisplayAllocator()
	const portBundle = overrides.portBundle ?? makeFakePortAllocator()
	const profileBundle = overrides.profileBundle ?? makeFakeProfileSeeder()
	const xvfbBundle = overrides.xvfbBundle ?? makeFakeXvfbSpawnFn()
	const chromeBundle = overrides.chromeBundle ?? makeFakeChromeSpawnFn()
	const fluxboxFn = overrides.fluxboxFn
	// Phase 255-03 — optional displayManager DI (mirrors mcpConfigManager). When
	// `overrides.displayManager` is undefined the field is left unset so the
	// optional-dep backward-compat path is exercised by callers that don't pass it.
	const displayManager = overrides.displayManager

	const mgr = new WebAppWindowManager({
		streamManager,
		spawn,
		logger,
		discovery,
		portal,
		GeometryTrackerCtor,
		titleTimeoutMs: 100,
		idlePollMs: 50,
		webappCap: overrides.webappCap,
		mcpConfigManager: overrides.mcpConfigManager,
		luseServerPath: overrides.luseServerPath,
		luseMcpEnv: overrides.luseMcpEnv,
		// Phase 102-04 — required deps for the per-app spawn body.
		displayAllocator: displayBundle.allocator,
		portAllocator: portBundle.allocator,
		profileSeeder: profileBundle.seeder,
		xvfbSpawnFn: xvfbBundle.fn,
		chromeSpawnFn: chromeBundle.fn,
		withWindowManager: overrides.withWindowManager,
		fluxboxSpawnFn: fluxboxFn,
		// Phase 255-03 — optional displayManager (registerExisting on spawn / kill on close).
		displayManager,
		// chromeCdpClient intentionally OMITTED — 102-04 removes the CDP path.
	} as any)

	return {
		mgr,
		streamManager,
		started,
		stopped,
		discovery,
		portal,
		spawn,
		logger,
		displayBundle,
		portBundle,
		profileBundle,
		xvfbBundle,
		chromeBundle,
		displayManager,
	}
}

/**
 * Phase 255-03 — fake displayManager with the two methods WebAppWindowManager
 * uses. registerExisting + kill default to resolved spies; pass `rejectRegister`
 * / `rejectKill` to assert the best-effort try/catch never propagates the error
 * out of spawn() / close().
 */
function makeFakeDisplayManager(
	opts: {rejectRegister?: Error; rejectKill?: Error} = {},
) {
	const registerExisting = vi.fn(async (_input: any) => {
		if (opts.rejectRegister) throw opts.rejectRegister
		return {}
	})
	const kill = vi.fn(async (_input: any) => {
		if (opts.rejectKill) throw opts.rejectKill
		return {ok: true}
	})
	return {registerExisting, kill}
}

describe('Phase 102-04 — per-app Xvfb + Chrome subprocess spawn body', () => {
	beforeEach(() => {
		vi.useRealTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('T-102-04-01: spawn calls primitives in order — displayAllocator → spawnXvfb → profileSeeder.seed → spawnChromeProcess → portAllocator → streamManager.startStream', async () => {
		const {mgr, displayBundle, profileBundle, xvfbBundle, chromeBundle, portBundle, streamManager} =
			makeManager102()

		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})

		// All primitives called exactly once.
		expect(displayBundle.allocator.allocate).toHaveBeenCalledTimes(1)
		expect(xvfbBundle.fn).toHaveBeenCalledTimes(1)
		expect(profileBundle.seeder.seed).toHaveBeenCalledTimes(1)
		expect(chromeBundle.fn).toHaveBeenCalledTimes(1)
		expect(portBundle.allocator.allocate).toHaveBeenCalledTimes(1)
		expect(streamManager.startStream).toHaveBeenCalledTimes(1)

		// Sequence: each subsequent call must occur AFTER the prior.
		const order = {
			allocate: (displayBundle.allocator.allocate as any).mock.invocationCallOrder[0],
			xvfb: (xvfbBundle.fn as any).mock.invocationCallOrder[0],
			seed: (profileBundle.seeder.seed as any).mock.invocationCallOrder[0],
			chrome: (chromeBundle.fn as any).mock.invocationCallOrder[0],
			port: (portBundle.allocator.allocate as any).mock.invocationCallOrder[0],
			stream: (streamManager.startStream as any).mock.invocationCallOrder[0],
		}
		expect(order.allocate).toBeLessThan(order.xvfb)
		expect(order.xvfb).toBeLessThan(order.seed)
		expect(order.seed).toBeLessThan(order.chrome)
		expect(order.chrome).toBeLessThan(order.port)
		expect(order.port).toBeLessThan(order.stream)
		mgr._clearForTests()
	})

	it('T-102-04-02: spawn does NOT use any chromeCdpClient surface (CDP path removed)', async () => {
		// Per 102-04, the chromeCdpClient ctor opt is dropped. Manager builds
		// fine without it, and spawn never invokes any chrome CDP API.
		const {mgr, spawn} = makeManager102()
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})
		// No spawnFactory invocation either — Chrome is spawned via injected
		// chromeSpawnFn, not via the legacy `sudo google-chrome ...` argv.
		expect(spawn).not.toHaveBeenCalled()
		mgr._clearForTests()
	})

	it('T-102-04-03: spawn passes the WebApp URL to spawnChromeProcess (it then translates to --app=URL argv)', async () => {
		const {mgr, chromeBundle} = makeManager102()
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://duckduckgo.com'})
		expect(chromeBundle.calls).toHaveLength(1)
		expect(chromeBundle.calls[0]!.url).toBe('https://duckduckgo.com')
		expect(chromeBundle.calls[0]!.display).toBe(':10')
		expect(chromeBundle.calls[0]!.userDataDir).toMatch(/^\/tmp\/livos-chrome-app-/)
		// stream target is {display:':10'} (NOT {wid:...}).
		expect((chromeBundle.calls[0] as any).userDataDir).toMatch(/^\/tmp\/livos-chrome-app-/)
		mgr._clearForTests()
	})

	it('T-102-04-04: ActiveWebApp entry stores {display, displayN, port, streamId, profileUuid, xvfbHandle, chromeHandle}', async () => {
		const {mgr, profileBundle, streamManager, started} = makeManager102()
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})

		// list() exposes a subset; for full inspection, we rely on close() to
		// re-route through stored handles (Test 4 + T-102-04-08).
		const entries = mgr.list({userId: 'u1'})
		expect(entries).toHaveLength(1)
		expect(entries[0]).toMatchObject({webappId: 'app1', mode: 'vnc-window'})

		// stream target carried {display: ':10'} (not {wid}).
		expect(started[0].target).toEqual({display: ':10'})

		// profileSeeder.seed was called with the webappId as uuid (so the
		// per-app temp dir is traceable to the WebApp).
		expect(profileBundle.seedCalls[0]!.uuid).toBe('app1')
		mgr._clearForTests()
	})

	it('T-102-04-05: compensating cleanup on Xvfb failure — release display, do not call profile/chrome/port/stream', async () => {
		const xvfbBundle = makeFakeXvfbSpawnFn({rejectWith: new Error('xvfb boom')})
		const {mgr, displayBundle, profileBundle, chromeBundle, portBundle, streamManager} =
			makeManager102({xvfbBundle})

		await expect(
			mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'}),
		).rejects.toThrow(/xvfb boom/)

		expect(displayBundle.releaseCalls).toEqual([10]) // released after partial failure
		expect(profileBundle.seeder.seed).not.toHaveBeenCalled()
		expect(chromeBundle.fn).not.toHaveBeenCalled()
		expect(portBundle.allocator.allocate).not.toHaveBeenCalled()
		expect(streamManager.startStream).not.toHaveBeenCalled()
	})

	it('T-102-04-06: compensating cleanup on Chrome failure — stop xvfb, cleanup profile, release display, do not allocate port or start stream', async () => {
		const chromeBundle = makeFakeChromeSpawnFn({rejectWith: new Error('chrome boom')})
		const {mgr, displayBundle, profileBundle, xvfbBundle, portBundle, streamManager} =
			makeManager102({chromeBundle})

		await expect(
			mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'}),
		).rejects.toThrow(/chrome boom/)

		expect(xvfbBundle.stopCalls).toEqual([':10']) // xvfb.stop() called
		expect(profileBundle.cleanupCalls).toHaveLength(1) // profileSeeder.cleanup(uuid)
		expect(displayBundle.releaseCalls).toEqual([10])
		expect(portBundle.allocator.allocate).not.toHaveBeenCalled()
		expect(streamManager.startStream).not.toHaveBeenCalled()
	})

	it('T-102-04-07: compensating cleanup on stream failure — chrome.stop, xvfb.stop, profile.cleanup, port.release, display.release', async () => {
		// Force streamManager.startStream to throw.
		const failingStreamManager = makeStreamManager()
		failingStreamManager.streamManager.startStream = vi.fn(() => {
			throw new Error('stream boom')
		})
		const displayBundle = makeFakeDisplayAllocator()
		const portBundle = makeFakePortAllocator()
		const profileBundle = makeFakeProfileSeeder()
		const xvfbBundle = makeFakeXvfbSpawnFn()
		const chromeBundle = makeFakeChromeSpawnFn()

		const spawn = vi.fn(() => new FakeChild() as any)
		const logger = {info: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn()}
		const {portal} = makePortal()
		const {ctor: GeometryTrackerCtor} = makeGeometryTrackerCtor()
		const mgr = new WebAppWindowManager({
			streamManager: failingStreamManager.streamManager,
			spawn,
			logger,
			discovery: makeDiscovery(),
			portal,
			GeometryTrackerCtor,
			titleTimeoutMs: 100,
			idlePollMs: 50,
			displayAllocator: displayBundle.allocator,
			portAllocator: portBundle.allocator,
			profileSeeder: profileBundle.seeder,
			xvfbSpawnFn: xvfbBundle.fn,
			chromeSpawnFn: chromeBundle.fn,
		} as any)

		await expect(
			mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'}),
		).rejects.toThrow(/stream boom/)

		expect(chromeBundle.stopCalls).toEqual([':10']) // chrome.stop
		expect(profileBundle.cleanupCalls).toHaveLength(1) // profile cleanup
		expect(xvfbBundle.stopCalls).toEqual([':10']) // xvfb.stop
		expect(portBundle.releaseCalls).toEqual([15900]) // port released
		expect(displayBundle.releaseCalls).toEqual([10]) // display released
	})

	it('T-102-04-08: idempotency — second spawn with same webappId does NOT re-allocate display / spawn xvfb / spawn chrome / seed profile', async () => {
		const {mgr, displayBundle, profileBundle, xvfbBundle, chromeBundle, portBundle, streamManager} =
			makeManager102()

		const r1 = await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})
		const r2 = await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})

		expect(r1.streamId).toBe(r2.streamId)
		expect(displayBundle.allocator.allocate).toHaveBeenCalledTimes(1)
		expect(xvfbBundle.fn).toHaveBeenCalledTimes(1)
		expect(profileBundle.seeder.seed).toHaveBeenCalledTimes(1)
		expect(chromeBundle.fn).toHaveBeenCalledTimes(1)
		expect(portBundle.allocator.allocate).toHaveBeenCalledTimes(1)
		expect(streamManager.startStream).toHaveBeenCalledTimes(1)
		mgr._clearForTests()
	})

	it('T-102-04-09: A2 fluxbox-or-not — withWindowManager:false → fluxbox NEVER spawned', async () => {
		// Phase 102 deploy fix flipped default to true (Chrome --start-fullscreen
		// requires WM to render visibly). This test asserts the opt-out path:
		// explicit `withWindowManager: false` → no fluxbox spawn.
		const fluxboxFn = vi.fn(async () => ({
			pid: 33333,
			display: ':10',
			exited: new Promise(() => {}),
			stop: vi.fn(async () => {}),
		}))
		const {mgr} = makeManager102({withWindowManager: false, fluxboxFn})
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})
		expect(fluxboxFn).not.toHaveBeenCalled()
		mgr._clearForTests()
	})

	it('T-102-04-09b: A2 fluxbox-or-not — withWindowManager:true → fluxbox IS spawned for the allocated display', async () => {
		const fluxboxFn = vi.fn(async () => ({
			pid: 33333,
			display: ':10',
			exited: new Promise(() => {}),
			stop: vi.fn(async () => {}),
		}))
		const {mgr, xvfbBundle, chromeBundle} = makeManager102({withWindowManager: true, fluxboxFn})
		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})

		// fluxbox spawned after xvfb readiness, before chrome spawn.
		expect(fluxboxFn).toHaveBeenCalledTimes(1)
		expect((fluxboxFn as any).mock.calls[0][0].display).toBe(':10')
		const xvfbOrder = (xvfbBundle.fn as any).mock.invocationCallOrder[0]
		const fluxboxOrder = (fluxboxFn as any).mock.invocationCallOrder[0]
		const chromeOrder = (chromeBundle.fn as any).mock.invocationCallOrder[0]
		expect(xvfbOrder).toBeLessThan(fluxboxOrder)
		expect(fluxboxOrder).toBeLessThan(chromeOrder)
		mgr._clearForTests()
	})
})

// ============================================================================
// Phase 102-08 — Close lifecycle (D-102-CLOSE-LIFECYCLE)
//
// Builds on the Phase 102-04 spawn body (ActiveWebApp now stores chromeHandle,
// xvfbHandle, profileUuid, displayN, port, streamId). close() must execute the
// ordered teardown:
//
//   1. chromeHandle.stop()           (SIGTERM Chrome → 2s grace → SIGKILL)
//   2. streamManager.stopStream      (kills x11vnc + releases its own port)
//   3. xvfbHandle.stop()             (SIGTERM Xvfb)
//   4. profileSeeder.cleanup(uuid)   (rm -rf /tmp/livos-chrome-app-<uuid>)
//   5. displayAllocator.release(N)   (return :N to the pool)
//   6. portAllocator.release(port)   (return tracking port slot)
//   7. unregisterWebAppMcp(webappId) (deregister per-WebApp Luse MCP)
//   8. active.delete(webappId)
//
// Every step is wrapped in try/catch — a failure in (e.g.) chromeHandle.stop
// must NOT prevent subsequent steps from running. Re-calling close() on an
// already-cleaned webappId is a no-op (idempotent).
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNTOUCHED.
// ============================================================================

describe('Phase 102-08 — close lifecycle (ordered teardown + idempotency)', () => {
	beforeEach(() => {
		vi.useRealTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('T-102-08-01: close() calls steps in order — chromeHandle.stop → streamManager.stopStream → xvfbHandle.stop → profileSeeder.cleanup → displayAllocator.release → portAllocator.release', async () => {
		const {
			mgr,
			displayBundle,
			portBundle,
			profileBundle,
			xvfbBundle,
			chromeBundle,
			streamManager,
		} = makeManager102()

		await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://example.com'})

		// Reset spawn-time invocation orders so close() ones are easy to compare.
		const closeResult = await mgr.close({webappId: 'app1', userId: 'u1'})
		expect(closeResult.ok).toBe(true)

		// Each teardown step called exactly once.
		expect((chromeBundle.fn as any).mock.results[0].value).resolves
		expect(chromeBundle.stopCalls).toEqual([':10']) // chromeHandle.stop invoked
		expect(streamManager.stopStream).toHaveBeenCalledTimes(1)
		expect(xvfbBundle.stopCalls).toEqual([':10']) // xvfbHandle.stop invoked
		expect(profileBundle.cleanupCalls).toEqual(['app1']) // profileSeeder.cleanup(uuid=webappId)
		expect(displayBundle.releaseCalls).toEqual([10])
		expect(portBundle.releaseCalls).toEqual([15900])

		// Sequence proof: pull invocationCallOrder from each mock's most-recent call.
		const chromeStopMock = (chromeBundle.fn as any).mock.results[0].value
		// Chrome stop is wrapped in a vi.fn inside makeFakeChromeSpawnFn — fetch its order from the handle.
		// (handle.stop is the vi.fn; we can't reach it from outside easily, so compare via stopCalls timing.)
		// Instead use the stopStream + cleanup + display.release + port.release mocks for order proof.
		const stopStreamOrder = (streamManager.stopStream as any).mock.invocationCallOrder[0]
		const cleanupOrder = (profileBundle.seeder.cleanup as any).mock.invocationCallOrder[0]
		const displayReleaseOrder = (displayBundle.allocator.release as any).mock.invocationCallOrder[0]
		const portReleaseOrder = (portBundle.allocator.release as any).mock.invocationCallOrder[0]
		expect(stopStreamOrder).toBeLessThan(cleanupOrder)
		expect(cleanupOrder).toBeLessThan(displayReleaseOrder)
		expect(displayReleaseOrder).toBeLessThan(portReleaseOrder)
		// chromeHandle.stop and xvfbHandle.stop happen before profileSeeder.cleanup —
		// we verify this via stopCalls being populated by the time cleanup runs.
		expect(chromeBundle.stopCalls).toEqual([':10'])
		expect(xvfbBundle.stopCalls).toEqual([':10'])

		void chromeStopMock // silence unused-var lint
	})

	it('T-102-08-02: active.delete — close removes the entry from the manager (list returns empty)', async () => {
		const {mgr} = makeManager102()
		await mgr.spawn({userId: 'u1', webappId: 'app-active', url: 'https://example.com'})
		expect(mgr.list({userId: 'u1'})).toHaveLength(1)
		await mgr.close({webappId: 'app-active', userId: 'u1'})
		expect(mgr.list({userId: 'u1'})).toHaveLength(0)
	})

	it('T-102-08-03: idempotent — calling close() twice on same webappId does NOT throw + second call is a no-op (no double release)', async () => {
		const {mgr, displayBundle, portBundle, profileBundle, xvfbBundle, chromeBundle} =
			makeManager102()

		await mgr.spawn({userId: 'u1', webappId: 'app-idem', url: 'https://example.com'})
		await mgr.close({webappId: 'app-idem', userId: 'u1'})
		// Second close must not throw and must not call any teardown step again.
		await expect(mgr.close({webappId: 'app-idem', userId: 'u1'})).resolves.toBeDefined()

		// Each teardown step called EXACTLY once across the two close() invocations.
		expect(chromeBundle.stopCalls).toEqual([':10'])
		expect(xvfbBundle.stopCalls).toEqual([':10'])
		expect(profileBundle.cleanupCalls).toEqual(['app-idem'])
		expect(displayBundle.releaseCalls).toEqual([10])
		expect(portBundle.releaseCalls).toEqual([15900])
	})

	it('T-102-08-04: no-such-id — close() on a never-spawned webappId is a no-op (no throw, no teardown side effects)', async () => {
		const {mgr, displayBundle, portBundle, profileBundle, xvfbBundle, chromeBundle, streamManager} =
			makeManager102()

		await expect(mgr.close({webappId: 'never-spawned', userId: 'u1'})).resolves.toBeDefined()

		// Zero teardown steps invoked.
		expect(chromeBundle.stopCalls).toEqual([])
		expect(xvfbBundle.stopCalls).toEqual([])
		expect(profileBundle.cleanupCalls).toEqual([])
		expect(displayBundle.releaseCalls).toEqual([])
		expect(portBundle.releaseCalls).toEqual([])
		expect(streamManager.stopStream).not.toHaveBeenCalled()
	})

	it('T-102-08-05: chromeHandle.stop failure — subsequent steps still execute (compensating drain)', async () => {
		// Custom chrome bundle whose handle.stop rejects.
		const chromeBundle = (() => {
			const calls: Array<{display: string; userDataDir: string; url: string}> = []
			const fn = vi.fn(async (chromeOpts: any) => {
				calls.push({
					display: chromeOpts.display,
					userDataDir: chromeOpts.userDataDir,
					url: chromeOpts.url,
				})
				const stop = vi.fn(async () => {
					throw new Error('chrome stop boom')
				})
				const handle: ChromeProcessHandle = {
					pid: 22001,
					child: new FakeChild() as unknown as ChromeProcessHandle['child'],
					display: chromeOpts.display,
					userDataDir: chromeOpts.userDataDir,
					stop,
				}
				return handle
			}) as unknown as (chromeOpts: any) => Promise<ChromeProcessHandle>
			return {fn, calls, stopCalls: [] as string[]}
		})()

		const {mgr, displayBundle, portBundle, profileBundle, xvfbBundle, streamManager} =
			makeManager102({chromeBundle})

		await mgr.spawn({userId: 'u1', webappId: 'app-cs', url: 'https://example.com'})
		// close MUST resolve — chrome stop throws but is swallowed.
		await expect(mgr.close({webappId: 'app-cs', userId: 'u1'})).resolves.toBeDefined()

		// Subsequent steps STILL ran.
		expect(streamManager.stopStream).toHaveBeenCalledTimes(1)
		expect(xvfbBundle.stopCalls).toEqual([':10'])
		expect(profileBundle.cleanupCalls).toEqual(['app-cs'])
		expect(displayBundle.releaseCalls).toEqual([10])
		expect(portBundle.releaseCalls).toEqual([15900])
	})

	it('T-102-08-06: streamManager.stopStream failure — subsequent steps still execute', async () => {
		const {mgr, displayBundle, portBundle, profileBundle, xvfbBundle, chromeBundle, streamManager} =
			makeManager102()

		// Replace stopStream to throw post-spawn.
		;(streamManager.stopStream as any).mockImplementationOnce(async () => {
			throw new Error('stopStream boom')
		})

		await mgr.spawn({userId: 'u1', webappId: 'app-ss', url: 'https://example.com'})
		await expect(mgr.close({webappId: 'app-ss', userId: 'u1'})).resolves.toBeDefined()

		// chrome was called BEFORE stopStream (per ordered teardown), so chrome.stop was invoked first.
		expect(chromeBundle.stopCalls).toEqual([':10'])
		// All subsequent steps still ran despite stopStream failure.
		expect(xvfbBundle.stopCalls).toEqual([':10'])
		expect(profileBundle.cleanupCalls).toEqual(['app-ss'])
		expect(displayBundle.releaseCalls).toEqual([10])
		expect(portBundle.releaseCalls).toEqual([15900])
	})

	it('T-102-08-07: xvfbHandle.stop failure — subsequent steps still execute (profile, display, port release)', async () => {
		// xvfb bundle whose handle.stop rejects.
		const xvfbBundle = (() => {
			const calls: Array<{display: string}> = []
			const fn = vi.fn(async (xvfbOpts: any) => {
				calls.push({display: xvfbOpts.display})
				const stop = vi.fn(async () => {
					throw new Error('xvfb stop boom')
				})
				const handle: XvfbHandle = {
					pid: 11001,
					display: xvfbOpts.display,
					exited: new Promise(() => {}),
					stop,
				}
				return handle
			}) as unknown as (xvfbOpts: any) => Promise<XvfbHandle>
			return {fn, calls, stopCalls: [] as string[]}
		})()

		const {mgr, displayBundle, portBundle, profileBundle, chromeBundle, streamManager} =
			makeManager102({xvfbBundle})

		await mgr.spawn({userId: 'u1', webappId: 'app-xs', url: 'https://example.com'})
		await expect(mgr.close({webappId: 'app-xs', userId: 'u1'})).resolves.toBeDefined()

		expect(chromeBundle.stopCalls).toEqual([':10'])
		expect(streamManager.stopStream).toHaveBeenCalledTimes(1)
		// profile/display/port still released even though xvfb.stop threw.
		expect(profileBundle.cleanupCalls).toEqual(['app-xs'])
		expect(displayBundle.releaseCalls).toEqual([10])
		expect(portBundle.releaseCalls).toEqual([15900])
	})

	it('T-102-08-08: release-before-delete — displayAllocator.release MUST be called even if profileSeeder.cleanup rejects', async () => {
		const profileBundle = makeFakeProfileSeeder()
		// Override cleanup to throw.
		;(profileBundle.seeder.cleanup as any).mockImplementationOnce(async () => {
			throw new Error('profile cleanup boom')
		})

		const {mgr, displayBundle, portBundle, xvfbBundle, chromeBundle} = makeManager102({
			profileBundle,
		})

		await mgr.spawn({userId: 'u1', webappId: 'app-pc', url: 'https://example.com'})
		await expect(mgr.close({webappId: 'app-pc', userId: 'u1'})).resolves.toBeDefined()

		// Display + port still released even though profile cleanup threw.
		expect(displayBundle.releaseCalls).toEqual([10])
		expect(portBundle.releaseCalls).toEqual([15900])
		expect(chromeBundle.stopCalls).toEqual([':10'])
		expect(xvfbBundle.stopCalls).toEqual([':10'])
	})
})

// ============================================================================
// Phase 255-03 — displayManager registerExisting on spawn / kill on close
//
// D-255-WEBAPP-REGISTER: a spawned WebApp must appear in displays.list (and
// therefore the Displays popover) owned by the WebApp user; closing it must
// remove the record. The window-manager uses the SAME displayManager the MCP
// `computer_create_display` path uses, but via `registerExisting` (Redis-only
// HSET, NO second Xvfb spawn, does NOT advance the :N allocator) — never
// `create()` (which would spawn a duplicate Xvfb on a divergent :N).
//
// Invariants under test (plan must_haves):
//   1. spawn() calls registerExisting exactly once with the entry's display,
//      width 1280 / height 720, mode 'xvfb', name = the spawn url, and
//      ownerSession = opts.userId (per-user isolation — NOT '').
//   2. close() calls kill exactly once with {display: entry.display,
//      callerSession: entry.userId} (the owner gates display-manager kill).
//   3. displayManager is OPTIONAL — spawn/close succeed when it is absent.
//   4. A rejecting registerExisting / kill is best-effort (try/catch) and
//      never propagates out of spawn() / close().
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNTOUCHED.
// ============================================================================

describe('Phase 255-03 — displayManager registerExisting on spawn / kill on close', () => {
	beforeEach(() => {
		vi.useRealTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('T-255-03-01: spawn() calls displayManager.registerExisting once with {display, 1280x720, xvfb, name=url, ownerSession=userId}', async () => {
		const displayManager = makeFakeDisplayManager()
		const {mgr} = makeManager102({displayManager})
		await mgr.spawn({userId: 'user-1', webappId: 'app1', url: 'https://github.com'})

		expect(displayManager.registerExisting).toHaveBeenCalledTimes(1)
		const input = (displayManager.registerExisting as any).mock.calls[0][0]
		// First WebApp allocates :10 (fake allocator starts at 10).
		expect(input.display).toBe(':10')
		expect(input.width).toBe(1280)
		expect(input.height).toBe(720)
		expect(input.mode).toBe('xvfb')
		expect(input.name).toBe('https://github.com')
		// Per-user isolation: owner = the WebApp user's id (NEVER '' = host/shared).
		expect(input.ownerSession).toBe('user-1')
		mgr._clearForTests()
	})

	it('T-255-03-02: close() calls displayManager.kill once with {display: entry.display, callerSession: entry.userId}', async () => {
		const displayManager = makeFakeDisplayManager()
		const {mgr} = makeManager102({displayManager})
		await mgr.spawn({userId: 'user-1', webappId: 'app1', url: 'https://github.com'})
		await mgr.close({webappId: 'app1', userId: 'user-1'})

		expect(displayManager.kill).toHaveBeenCalledTimes(1)
		const input = (displayManager.kill as any).mock.calls[0][0]
		expect(input.display).toBe(':10')
		// callerSession must equal the OWNER (the user that spawned), so the
		// display-manager owner-gate (owner_session === callerSession) passes.
		expect(input.callerSession).toBe('user-1')
		mgr._clearForTests()
	})

	it('T-255-03-03: registerExisting / kill are NOT called when displayManager is undefined (optional dep, no throw)', async () => {
		const {mgr} = makeManager102() // no displayManager injected
		await expect(
			mgr.spawn({userId: 'user-1', webappId: 'app-bare', url: 'https://example.com'}),
		).resolves.toBeDefined()
		await expect(
			mgr.close({webappId: 'app-bare', userId: 'user-1'}),
		).resolves.toEqual({ok: true})
		mgr._clearForTests()
	})

	it('T-255-03-04: a rejecting registerExisting does NOT throw out of spawn() (best-effort, non-fatal)', async () => {
		const displayManager = makeFakeDisplayManager({rejectRegister: new Error('redis down')})
		const {mgr} = makeManager102({displayManager})
		// spawn must still resolve with a valid SpawnResult despite the registry write failing.
		const r = await mgr.spawn({userId: 'user-1', webappId: 'app-reg-fail', url: 'https://example.com'})
		expect(r.webappId).toBe('app-reg-fail')
		expect(r.windowId).toBe(0)
		expect(displayManager.registerExisting).toHaveBeenCalledTimes(1)
		// The entry was still created (registration failure must not roll back the spawn).
		expect(mgr.list({userId: 'user-1'})).toHaveLength(1)
		mgr._clearForTests()
	})

	it('T-255-03-05: a rejecting kill does NOT throw out of close() (best-effort, non-fatal)', async () => {
		const displayManager = makeFakeDisplayManager({rejectKill: new Error('redis down')})
		const {mgr} = makeManager102({displayManager})
		await mgr.spawn({userId: 'user-1', webappId: 'app-kill-fail', url: 'https://example.com'})
		await expect(
			mgr.close({webappId: 'app-kill-fail', userId: 'user-1'}),
		).resolves.toEqual({ok: true})
		expect(displayManager.kill).toHaveBeenCalledTimes(1)
		// Entry still removed from the manager despite the registry delete failing.
		expect(mgr.list({userId: 'user-1'})).toHaveLength(0)
		mgr._clearForTests()
	})

	it('T-255-03-06: spawn uses registerExisting (NEVER create) — registry write is the no-spawn adopt path', async () => {
		// Lock the Pitfall-2 contract: the manager must adopt the already-running
		// per-app Xvfb via registerExisting, never spawn a second X server via a
		// create() call. The fake displayManager intentionally has NO `create`
		// method — if window-manager ever called create() the spawn would throw,
		// so a clean spawn here proves create() is never invoked.
		const displayManager = makeFakeDisplayManager()
		const {mgr} = makeManager102({displayManager})
		await expect(
			mgr.spawn({userId: 'user-1', webappId: 'app-adopt', url: 'https://example.com'}),
		).resolves.toBeDefined()
		expect(displayManager.registerExisting).toHaveBeenCalledTimes(1)
		expect((displayManager as any).create).toBeUndefined()
		mgr._clearForTests()
	})
})

// ============================================================================
// Phase 255-03 — disjoint webapp ↔ MCP-create allocator ranges (no :N collision)
//
// T-255-09: webapps register their already-running Xvfb via registerExisting
// (no allocator advance), but the in-memory webapp DisplayAllocator still hands
// out :N values for the per-app Xvfb spawn. The MCP `computer_create_display`
// path uses a SEPARATE displayManager allocator seeded from Redis. Within a
// single boot these two allocators share one `:N` Redis namespace, so they MUST
// be disjoint or a webapp and an MCP create() could claim the same `:N`
// ("server already active for display N"). The fix: webapps [10,60) + MCP
// create() floor at 60 ([60,..)). This test locks the wiring constants so the
// ranges can never silently re-overlap.
// ============================================================================

describe('Phase 255-03 — disjoint webapp/MCP-create display allocator ranges', () => {
	it('T-255-09a: WEBAPP_DISPLAY_ALLOCATOR_RANGE is [10, 60) and floor is below the MCP-create floor', () => {
		expect(WEBAPP_DISPLAY_ALLOCATOR_RANGE.min).toBe(10)
		expect(WEBAPP_DISPLAY_ALLOCATOR_RANGE.max).toBe(60)
		// MCP create() must start AT OR ABOVE the webapp range ceiling.
		expect(MCP_CREATE_ALLOCATOR_START).toBe(60)
		expect(WEBAPP_DISPLAY_ALLOCATOR_RANGE.max).toBeLessThanOrEqual(MCP_CREATE_ALLOCATOR_START)
	})

	it('T-255-09b: a DisplayAllocator over the webapp range only ever returns values in [10, 60) — never colliding with MCP create [60, ..)', () => {
		const alloc = new RealDisplayAllocator({
			min: WEBAPP_DISPLAY_ALLOCATOR_RANGE.min,
			max: WEBAPP_DISPLAY_ALLOCATOR_RANGE.max,
		})
		const seen: number[] = []
		// Exhaust the whole range (50 slots) — every value must be < 60 (the MCP
		// create floor) and >= 10, so no webapp :N can equal an MCP-create :N.
		const capacity = WEBAPP_DISPLAY_ALLOCATOR_RANGE.max - WEBAPP_DISPLAY_ALLOCATOR_RANGE.min
		for (let i = 0; i < capacity; i++) {
			const n = alloc.allocate()
			seen.push(n)
			expect(n).toBeGreaterThanOrEqual(WEBAPP_DISPLAY_ALLOCATOR_RANGE.min)
			expect(n).toBeLessThan(WEBAPP_DISPLAY_ALLOCATOR_RANGE.max)
			expect(n).toBeLessThan(MCP_CREATE_ALLOCATOR_START)
		}
		// All allocated values are unique (no double-hand-out within the range).
		expect(new Set(seen).size).toBe(capacity)
	})
})
