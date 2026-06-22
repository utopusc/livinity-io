/* eslint-disable @typescript-eslint/no-explicit-any */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {AnnouncementPoller} from './announcement-poller.js'

function makeFakeRedis(initial: Record<string, string> = {}) {
	const store = new Map<string, string>(Object.entries(initial))
	return {
		store,
		async get(k: string) {
			return store.get(k) ?? null
		},
		async set(k: string, v: string, ..._rest: unknown[]) {
			store.set(k, v)
			return 'OK'
		},
	}
}

function makeLogger() {
	return {log: vi.fn(), error: vi.fn()}
}

const API_KEY = 'livos:platform:api_key'
const DISABLED = 'livos:platform:announcement_poller_disabled'
const CACHE = 'livos:announcements:active'

const sampleAnnouncement = {
	id: 'a1',
	slug: null,
	title: 'Hello fleet',
	kind: 'announcement',
	blocks: [],
	raw_html_sanitized: null,
	frequency: 'once_ever',
	frequency_n: null,
	priority: 100,
	dismissible: true,
	start_at: null,
	end_at: null,
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe('AnnouncementPoller', () => {
	let fetchMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
	})

	it('stays idle when the kill-switch is set', async () => {
		const redis = makeFakeRedis({[DISABLED]: '1', [API_KEY]: 'liv_k_test'})
		const logger = makeLogger()
		const poller = new AnnouncementPoller({redis: redis as any, version: '1', logger, pollIntervalMs: 10})
		await poller.start()
		expect(fetchMock).not.toHaveBeenCalled()
		expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('kill-switch'))
		poller.stop()
	})

	it('stays idle when no api-key is configured', async () => {
		const redis = makeFakeRedis({})
		const logger = makeLogger()
		const poller = new AnnouncementPoller({redis: redis as any, version: '1', logger, pollIntervalMs: 10})
		await poller.start()
		expect(fetchMock).not.toHaveBeenCalled()
		poller.stop()
	})

	it('caches the polled announcements to Redis on success', async () => {
		const redis = makeFakeRedis({[API_KEY]: 'liv_k_test'})
		const logger = makeLogger()
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({announcements: [sampleAnnouncement]}),
		})
		const poller = new AnnouncementPoller({
			redis: redis as any,
			version: '1',
			logger,
			platformBaseUrl: 'https://example.test',
			pollIntervalMs: 10,
		})
		// Drive one tick directly for determinism.
		await (poller as any).tick()
		poller.stop()

		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.test/api/me/announcements/poll',
			expect.objectContaining({headers: expect.objectContaining({'X-API-Key': 'liv_k_test'})}),
		)
		const cached = redis.store.get(CACHE)
		expect(cached).toBeDefined()
		expect(JSON.parse(cached as string)).toEqual([sampleAnnouncement])
	})

	it('backs off on HTTP 429 and does not cache', async () => {
		const redis = makeFakeRedis({[API_KEY]: 'liv_k_test'})
		const logger = makeLogger()
		fetchMock.mockResolvedValue({
			ok: false,
			status: 429,
			text: async () => 'Attack Challenge Mode',
		})
		const poller = new AnnouncementPoller({
			redis: redis as any,
			version: '1',
			logger,
			platformBaseUrl: 'https://example.test',
			pollIntervalMs: 10,
		})
		await (poller as any).tick()
		poller.stop()

		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('rate-limited'))
		expect(redis.store.get(CACHE)).toBeUndefined()
	})
})
