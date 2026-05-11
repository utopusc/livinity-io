/**
 * Phase 101-01 Task 2 — ChromeCdpClient unit tests.
 *
 * Coverage:
 *   1. constructs with default host (127.0.0.1) and port (9222)
 *   2. connect() resolves when factory succeeds
 *   3. connect() throws CdpTimeoutError after exhausting retries
 *   4. disconnect handler clears internal client; ensureConnected re-runs connect()
 *   5. createWindowForUrl returns {targetId, windowId} from mocked CDP
 *   6. createWindowForUrl with {left, top} issues a SECOND bounds-only
 *      setWindowBounds call (never combined with windowState)
 *   7. createWindowForUrl WITHOUT {left, top} does NOT issue a second call
 *   8. minimizeWindow issues setWindowBounds with windowState ONLY (separate
 *      call from any bounds-set above — RESEARCH correction #1)
 *   9. closeTarget calls Target.closeTarget({targetId})
 *  10. findTargetByUrl returns the matching target or null
 *  11. getWindowIdForTarget wraps Browser.getWindowForTarget (added for
 *      Task 4 livinityd.start() about:blank minimize path)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, vi, beforeEach} from 'vitest'

import {
	ChromeCdpClient,
	CdpTimeoutError,
	CdpDisconnectedError,
} from './client.js'

type DisconnectHandler = () => void

function makeMockCdpClient(opts: {
	targetId?: string
	windowId?: number
	targets?: Array<{targetId: string; url: string; type?: string}>
} = {}) {
	const targetId = opts.targetId ?? 'tgt-1'
	const windowId = opts.windowId ?? 7
	const disconnectListeners: DisconnectHandler[] = []

	const Target = {
		createTarget: vi.fn(async (_args: any) => ({targetId})),
		getTargets: vi.fn(async () => ({
			targetInfos: opts.targets ?? [
				{targetId, url: 'about:blank', type: 'page'},
				{targetId: 'browser', url: '', type: 'browser'},
			],
		})),
		closeTarget: vi.fn(async (_args: any) => ({})),
	}
	const Browser = {
		getWindowForTarget: vi.fn(async (_args: any) => ({windowId, bounds: {}})),
		setWindowBounds: vi.fn(async (_args: any) => ({})),
	}
	const client = {
		Target,
		Browser,
		on: vi.fn((event: string, handler: DisconnectHandler) => {
			if (event === 'disconnect') disconnectListeners.push(handler)
		}),
		close: vi.fn(async () => {}),
	}
	const triggerDisconnect = () => {
		for (const h of disconnectListeners) h()
	}
	return {client, triggerDisconnect}
}

describe('ChromeCdpClient', () => {
	let logger: {
		info: ReturnType<typeof vi.fn>
		warn: ReturnType<typeof vi.fn>
		error: ReturnType<typeof vi.fn>
		verbose: ReturnType<typeof vi.fn>
	}
	beforeEach(() => {
		logger = {info: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn()}
	})

	it('constructs with default host (127.0.0.1) and port (9222)', async () => {
		const {client} = makeMockCdpClient()
		const cdpFactory = vi.fn(async () => client)
		const c = new ChromeCdpClient({cdpFactory, logger})
		await c.connect()
		expect(cdpFactory).toHaveBeenCalledWith(
			expect.objectContaining({host: '127.0.0.1', port: 9222}),
		)
	})

	it('connect() resolves when factory succeeds', async () => {
		const {client} = makeMockCdpClient()
		const cdpFactory = vi.fn(async () => client)
		const c = new ChromeCdpClient({cdpFactory, logger})
		await expect(c.connect()).resolves.toBeUndefined()
		expect(logger.info).toHaveBeenCalledWith(
			expect.stringContaining('chrome-cdp: connected to 127.0.0.1:9222'),
		)
	})

	it('connect() throws CdpTimeoutError after exhausting retries', async () => {
		const cdpFactory = vi.fn(async () => {
			throw new Error('ECONNREFUSED')
		})
		const c = new ChromeCdpClient({
			cdpFactory,
			logger,
			connectRetries: 3,
			connectTimeoutMs: 1234,
		})
		await expect(c.connect()).rejects.toBeInstanceOf(CdpTimeoutError)
		expect(cdpFactory).toHaveBeenCalledTimes(3)
	})

	it('disconnect handler clears client; ensureConnected re-runs connect', async () => {
		const m1 = makeMockCdpClient({targetId: 'tgt-1'})
		const m2 = makeMockCdpClient({targetId: 'tgt-2'})
		const cdpFactory = vi
			.fn()
			.mockResolvedValueOnce(m1.client)
			.mockResolvedValueOnce(m2.client)
		const c = new ChromeCdpClient({cdpFactory, logger})
		await c.connect()
		// fire the registered disconnect handler — this should null the
		// internal client and cause the next call to lazy-reconnect.
		m1.triggerDisconnect()
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('chrome-cdp: disconnected'),
		)
		// Next op triggers ensureConnected -> connect() again, returning m2.
		const {targetId} = await c.createWindowForUrl('https://example.com', {
			width: 1280,
			height: 720,
		})
		expect(cdpFactory).toHaveBeenCalledTimes(2)
		expect(targetId).toBe('tgt-2')
	})

	it('createWindowForUrl returns {targetId, windowId}', async () => {
		const {client} = makeMockCdpClient({targetId: 'tgt-abc', windowId: 42})
		const cdpFactory = vi.fn(async () => client)
		const c = new ChromeCdpClient({cdpFactory, logger})
		const result = await c.createWindowForUrl('https://example.com', {
			width: 1280,
			height: 720,
		})
		expect(result).toEqual({targetId: 'tgt-abc', windowId: 42})
		expect(client.Target.createTarget).toHaveBeenCalledWith({
			url: 'https://example.com',
			newWindow: true,
			background: false,
			width: 1280,
			height: 720,
		})
		expect(client.Browser.getWindowForTarget).toHaveBeenCalledWith({
			targetId: 'tgt-abc',
		})
	})

	it('createWindowForUrl with {left, top} issues SECOND bounds-only setWindowBounds call', async () => {
		const {client} = makeMockCdpClient({targetId: 'tgt-1', windowId: 5})
		const cdpFactory = vi.fn(async () => client)
		const c = new ChromeCdpClient({cdpFactory, logger})
		await c.createWindowForUrl('https://example.com', {
			width: 1280,
			height: 720,
			left: 120,
			top: 240,
		})
		// exactly one setWindowBounds call, payload bounds-only (no windowState)
		expect(client.Browser.setWindowBounds).toHaveBeenCalledTimes(1)
		const call = client.Browser.setWindowBounds.mock.calls[0][0]
		expect(call).toEqual({
			windowId: 5,
			bounds: {left: 120, top: 240, width: 1280, height: 720},
		})
		// RESEARCH correction #1 — verify windowState is NOT in the same payload.
		expect(call.bounds).not.toHaveProperty('windowState')
	})

	it('createWindowForUrl WITHOUT left/top does NOT issue a second setWindowBounds call', async () => {
		const {client} = makeMockCdpClient()
		const cdpFactory = vi.fn(async () => client)
		const c = new ChromeCdpClient({cdpFactory, logger})
		await c.createWindowForUrl('https://example.com', {
			width: 1280,
			height: 720,
		})
		expect(client.Browser.setWindowBounds).not.toHaveBeenCalled()
	})

	it('minimizeWindow issues setWindowBounds with windowState ONLY (separate call)', async () => {
		const {client} = makeMockCdpClient({windowId: 9})
		const cdpFactory = vi.fn(async () => client)
		const c = new ChromeCdpClient({cdpFactory, logger})
		await c.connect()
		await c.minimizeWindow(9)
		expect(client.Browser.setWindowBounds).toHaveBeenCalledWith({
			windowId: 9,
			bounds: {windowState: 'minimized'},
		})
		// The payload must NOT contain bounds fields — RESEARCH correction #1.
		const call = client.Browser.setWindowBounds.mock.calls[0][0]
		expect(call.bounds).not.toHaveProperty('left')
		expect(call.bounds).not.toHaveProperty('top')
		expect(call.bounds).not.toHaveProperty('width')
		expect(call.bounds).not.toHaveProperty('height')
	})

	it('closeTarget calls Target.closeTarget({targetId})', async () => {
		const {client} = makeMockCdpClient()
		const cdpFactory = vi.fn(async () => client)
		const c = new ChromeCdpClient({cdpFactory, logger})
		await c.connect()
		await c.closeTarget('tgt-xyz')
		expect(client.Target.closeTarget).toHaveBeenCalledWith({targetId: 'tgt-xyz'})
	})

	it('findTargetByUrl returns matching target or null', async () => {
		const {client} = makeMockCdpClient({
			targets: [
				{targetId: 't1', url: 'about:blank', type: 'page'},
				{targetId: 't2', url: 'https://livinity.io/', type: 'page'},
			],
		})
		const cdpFactory = vi.fn(async () => client)
		const c = new ChromeCdpClient({cdpFactory, logger})
		const hit = await c.findTargetByUrl((u) => u.includes('livinity'))
		expect(hit).toEqual({targetId: 't2', url: 'https://livinity.io/'})
		const miss = await c.findTargetByUrl((u) => u.startsWith('chrome://'))
		expect(miss).toBeNull()
	})

	it('getWindowIdForTarget wraps Browser.getWindowForTarget', async () => {
		const {client} = makeMockCdpClient({targetId: 't1', windowId: 13})
		const cdpFactory = vi.fn(async () => client)
		const c = new ChromeCdpClient({cdpFactory, logger})
		await c.connect()
		const wid = await c.getWindowIdForTarget('t1')
		expect(wid).toBe(13)
		expect(client.Browser.getWindowForTarget).toHaveBeenCalledWith({
			targetId: 't1',
		})
	})

	it('exports CdpDisconnectedError class (typed-error shape)', () => {
		const err = new CdpDisconnectedError()
		expect(err).toBeInstanceOf(Error)
		expect(err.code).toBe('CDP_DISCONNECTED')
	})
})
