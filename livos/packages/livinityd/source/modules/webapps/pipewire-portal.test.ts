/**
 * Phase 93-08 — pipewire-portal unit tests.
 *
 * Tests the portal handshake by replacing the DbusBridge factory. No real
 * D-Bus session required — the bridge is a stub.
 *
 * Coverage (≥6 acceptance):
 *   1. isPortalAvailable returns false when service missing
 *   2. isPortalAvailable returns true when present
 *   3. happy-path session returns {pwNodeId, fd, closeSession}
 *   4. user-canceled response → PortalUserCanceled
 *   5. consent timeout → PortalTimeout
 *   6. closeSession invokes the bridge
 *   7. portal unavailable → PortalUnavailable
 */

import {describe, it, expect, vi, afterEach} from 'vitest'
import {
	isPortalAvailable,
	requestWindowSession,
	PortalUserCanceled,
	PortalTimeout,
	PortalUnavailable,
	_setDbusBridgeFactoryForTests,
	_resetDbusBridgeFactoryForTests,
	type DbusBridge,
} from './pipewire-portal.js'

function makeBridge(overrides: Partial<DbusBridge> = {}): DbusBridge {
	return {
		hasService: vi.fn(async () => true),
		callMethod: vi.fn(async () => '/test/session/path'),
		subscribeRequestResponse: vi.fn(async () => ({nodeId: 42, canceled: false})),
		openPipeWireFd: vi.fn(async () => 7),
		closeSession: vi.fn(async () => {}),
		...overrides,
	}
}

describe('pipewire-portal', () => {
	afterEach(() => {
		_resetDbusBridgeFactoryForTests()
	})

	it('Test 1: isPortalAvailable returns false when service missing', async () => {
		const bridge = makeBridge({hasService: vi.fn(async () => false)})
		_setDbusBridgeFactoryForTests(async () => bridge)
		expect(await isPortalAvailable()).toBe(false)
	})

	it('Test 2: isPortalAvailable returns true when service present', async () => {
		const bridge = makeBridge({hasService: vi.fn(async () => true)})
		_setDbusBridgeFactoryForTests(async () => bridge)
		expect(await isPortalAvailable()).toBe(true)
	})

	it('Test 3: happy-path session returns {pwNodeId, fd, closeSession}', async () => {
		const bridge = makeBridge()
		_setDbusBridgeFactoryForTests(async () => bridge)
		const result = await requestWindowSession({desktopUid: 1000})
		expect(result.pwNodeId).toBe(42)
		expect(result.fd).toBe(7)
		expect(typeof result.closeSession).toBe('function')
		await result.closeSession()
		expect(bridge.closeSession).toHaveBeenCalled()
	})

	it('Test 4: user-canceled response throws PortalUserCanceled', async () => {
		const bridge = makeBridge({
			subscribeRequestResponse: vi.fn(async () => ({nodeId: 0, canceled: true})),
		})
		_setDbusBridgeFactoryForTests(async () => bridge)
		await expect(requestWindowSession({desktopUid: 1000})).rejects.toBeInstanceOf(PortalUserCanceled)
	})

	it('Test 5: consent timeout throws PortalTimeout', async () => {
		const bridge = makeBridge({
			// Never resolves
			subscribeRequestResponse: vi.fn(() => new Promise(() => {})),
		})
		_setDbusBridgeFactoryForTests(async () => bridge)
		await expect(
			requestWindowSession({desktopUid: 1000, consentTimeoutMs: 50}),
		).rejects.toBeInstanceOf(PortalTimeout)
	})

	it('Test 6: closeSession is wired through to the bridge', async () => {
		const bridge = makeBridge()
		_setDbusBridgeFactoryForTests(async () => bridge)
		const result = await requestWindowSession({desktopUid: 1000})
		await result.closeSession()
		expect(bridge.closeSession).toHaveBeenCalledTimes(1)
	})

	it('Test 7: portal unavailable throws PortalUnavailable', async () => {
		const bridge = makeBridge({hasService: vi.fn(async () => false)})
		_setDbusBridgeFactoryForTests(async () => bridge)
		await expect(requestWindowSession({desktopUid: 1000})).rejects.toBeInstanceOf(PortalUnavailable)
	})
})
