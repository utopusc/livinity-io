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
	const getWindowGeometry = vi.fn(async () => ({x: 100, y: 100, w: 800, h: 600}))
	return {isWindowAlive, activateWindow, snapshotWindowIds, findNewWindowMatching, getWindowGeometry}
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
	})
	return {mgr, streamManager, started, stopped, discovery, portal, closeSession, spawn, trackerInstances, logger}
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

	it('Test 4: spawn throws WINDOW_NOT_FOUND when findNewWindowMatching times out', async () => {
		const discovery = makeDiscovery()
		discovery.findNewWindowMatching = vi.fn(async () => null)
		const {mgr} = makeManager({discovery})
		await expect(
			mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'}),
		).rejects.toBeInstanceOf(WindowNotFoundError)
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
})
