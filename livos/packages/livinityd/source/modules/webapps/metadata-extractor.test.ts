// Phase 92-08 — metadata-extractor.ts orchestration tests.
//
// All collaborators (cache, fetcher) are stubbed via DI. The HTML parser
// + favicon resolver remain real (pure functions; no I/O) so the
// composition glue is exercised end-to-end without leaving the process.
//
// Coverage:
//   - cache miss path: validate → cache.get → fetch → parse → resolve →
//     cache.set called in order
//   - cache hit path: validate → cache.get returns; fetcher NOT called
//   - validator failure short-circuits with BAD_REQUEST before fetch
//   - fetch error mapping (TIMEOUT/NOT_HTML/etc.)
//   - cache.set failure is swallowed (non-fatal)
//   - slow-extraction log fires above threshold

import {describe, expect, test, vi} from 'vitest'

import {extractMetadata, ExtractionError, type MetadataResult} from './metadata-extractor.js'
import {FetchError} from './fetch-html.js'
import type {MetadataCache} from './metadata-cache.js'

function makeFakeCache(initial?: Map<string, MetadataResult>): MetadataCache & {
	getCalls: string[]
	setCalls: Array<{url: string; value: MetadataResult}>
} {
	const store = new Map(initial ?? [])
	const getCalls: string[] = []
	const setCalls: Array<{url: string; value: MetadataResult}> = []
	return {
		async get(url: string) {
			getCalls.push(url)
			return store.get(url) ?? null
		},
		async set(url: string, value: MetadataResult) {
			setCalls.push({url, value})
			store.set(url, value)
		},
		keyFor(url: string) {
			return `liv:webapp:meta:fake:${url}`
		},
		getCalls,
		setCalls,
	}
}

const HTML_FIXTURE = `<!doctype html><html><head>
<title>Composed</title>
<meta name="description" content="composed page">
<meta property="og:image" content="https://example.com/og.png">
<link rel="icon" href="/icon.png">
</head><body></body></html>`

function makeFetcher(html = HTML_FIXTURE, finalPath = '/') {
	const fn = vi.fn(async (url: URL) => ({
		finalUrl: new URL(finalPath, url),
		html,
		contentType: 'text/html',
	}))
	return fn
}

describe('extractMetadata — cache miss path', () => {
	test('validates → cache.get → fetch → parse → resolve → cache.set in order', async () => {
		const cache = makeFakeCache()
		const fetcher = makeFetcher()
		const result = await extractMetadata(
			{url: 'https://example.com/', isAdmin: false},
			{cache, fetcher},
		)

		expect(result.title).toBe('Composed')
		expect(result.description).toBe('composed page')
		expect(result.ogImage).toBe('https://example.com/og.png')
		expect(result.faviconUrl).toBe('https://example.com/icon.png')

		// Cache get attempted with normalized URL string
		expect(cache.getCalls).toHaveLength(1)
		// Fetch invoked exactly once on the normalized URL
		expect(fetcher).toHaveBeenCalledTimes(1)
		// Cache populated after fetch
		expect(cache.setCalls).toHaveLength(1)
		expect(cache.setCalls[0]?.value).toEqual(result)
	})

	test('falls back to /favicon.ico when no link[rel] icons present', async () => {
		const cache = makeFakeCache()
		const fetcher = makeFetcher('<html><head><title>NoIcon</title></head></html>')
		const result = await extractMetadata(
			{url: 'https://noicon.example/', isAdmin: false},
			{cache, fetcher},
		)
		expect(result.faviconUrl).toBe('https://noicon.example/favicon.ico')
	})
})

describe('extractMetadata — cache hit path', () => {
	test('returns cached value without fetching', async () => {
		const cached: MetadataResult = {
			title: 'Cached',
			faviconUrl: 'https://example.com/cached.ico',
			description: null,
			ogImage: null,
		}
		// Cache key is the normalized URL string. validateUrl normalizes
		// 'https://Example.com/' → URL whose toString() is 'https://example.com/'.
		const cache = makeFakeCache(new Map([['https://example.com/', cached]]))
		const fetcher = makeFetcher()
		const result = await extractMetadata(
			{url: 'https://Example.com/', isAdmin: false},
			{cache, fetcher},
		)
		expect(result).toEqual(cached)
		expect(fetcher).not.toHaveBeenCalled()
		expect(cache.setCalls).toHaveLength(0)
	})
})

describe('extractMetadata — validator failure short-circuits', () => {
	test('throws BAD_REQUEST without invoking fetch or cache.set', async () => {
		const cache = makeFakeCache()
		const fetcher = makeFetcher()
		await expect(
			extractMetadata({url: 'file:///etc/passwd', isAdmin: false}, {cache, fetcher}),
		).rejects.toMatchObject({
			name: 'ExtractionError',
			code: 'BAD_REQUEST',
		})
		expect(fetcher).not.toHaveBeenCalled()
		expect(cache.setCalls).toHaveLength(0)
		// validator runs BEFORE cache.get — get not called either
		expect(cache.getCalls).toHaveLength(0)
	})

	test('admin can extract from a private IP that non-admin cannot', async () => {
		const cache = makeFakeCache()
		const fetcher = makeFetcher()
		await expect(
			extractMetadata({url: 'http://192.168.1.1/', isAdmin: false}, {cache, fetcher}),
		).rejects.toMatchObject({code: 'BAD_REQUEST'})

		// Admin path: validator passes; fetcher invoked
		const cache2 = makeFakeCache()
		const fetcher2 = makeFetcher()
		const result = await extractMetadata(
			{url: 'http://192.168.1.1/', isAdmin: true},
			{cache: cache2, fetcher: fetcher2},
		)
		expect(result.title).toBe('Composed')
		expect(fetcher2).toHaveBeenCalledTimes(1)
	})
})

describe('extractMetadata — fetch error mapping', () => {
	test('TIMEOUT FetchError → ExtractionError code TIMEOUT', async () => {
		const cache = makeFakeCache()
		const fetcher = vi.fn(async () => {
			throw new FetchError('TIMEOUT', 'aborted')
		})
		await expect(
			extractMetadata({url: 'https://slow.example/', isAdmin: false}, {cache, fetcher}),
		).rejects.toMatchObject({code: 'TIMEOUT'})
	})

	test('NOT_HTML FetchError → NOT_HTML', async () => {
		const cache = makeFakeCache()
		const fetcher = vi.fn(async () => {
			throw new FetchError('NOT_HTML', 'application/json')
		})
		await expect(
			extractMetadata({url: 'https://api.example/', isAdmin: false}, {cache, fetcher}),
		).rejects.toMatchObject({code: 'NOT_HTML'})
	})

	test('TOO_MANY_REDIRECTS FetchError → TOO_MANY_REDIRECTS', async () => {
		const cache = makeFakeCache()
		const fetcher = vi.fn(async () => {
			throw new FetchError('TOO_MANY_REDIRECTS', 'over cap')
		})
		await expect(
			extractMetadata({url: 'https://loop.example/', isAdmin: false}, {cache, fetcher}),
		).rejects.toMatchObject({code: 'TOO_MANY_REDIRECTS'})
	})

	test('non-FetchError exception → NETWORK_ERROR', async () => {
		const cache = makeFakeCache()
		const fetcher = vi.fn(async () => {
			throw new Error('socket reset')
		})
		await expect(
			extractMetadata({url: 'https://flaky.example/', isAdmin: false}, {cache, fetcher}),
		).rejects.toMatchObject({code: 'NETWORK_ERROR'})
	})
})

describe('extractMetadata — cache.set failure is non-fatal', () => {
	test('extraction succeeds even when cache.set throws', async () => {
		const cache: MetadataCache = {
			async get() {
				return null
			},
			async set() {
				throw new Error('redis unreachable')
			},
			keyFor(s: string) {
				return s
			},
		}
		const fetcher = makeFetcher()
		const errorLog: unknown[] = []
		const logger = {log: () => {}, error: (msg: string, ...rest: unknown[]) => errorLog.push([msg, ...rest])}

		// Allow event-loop to drain the swallowed promise so logger.error fires.
		const result = await extractMetadata(
			{url: 'https://example.com/', isAdmin: false},
			{cache, fetcher, logger},
		)
		expect(result.title).toBe('Composed')
		// Wait a tick so the cache.set rejection settles
		await new Promise((r) => setImmediate(r))
		expect(errorLog.length).toBeGreaterThanOrEqual(1)
	})
})

describe('extractMetadata — slow-extraction telemetry', () => {
	test('logs slow extraction when elapsed > threshold', async () => {
		const cache = makeFakeCache()
		const fetcher = vi.fn(async (url: URL) => {
			// Simulate slow fetch by waiting past the slow threshold.
			await new Promise((r) => setTimeout(r, 60))
			return {finalUrl: new URL('/', url), html: HTML_FIXTURE, contentType: 'text/html'}
		})
		const logs: string[] = []
		const logger = {log: (m: string) => logs.push(m), error: () => {}}
		await extractMetadata(
			{url: 'https://slow.example/', isAdmin: false},
			{cache, fetcher, logger, slowThresholdMs: 30},
		)
		expect(logs.some((m) => m.includes('slow extraction'))).toBe(true)
	})

	test('does not log slow when elapsed < threshold', async () => {
		const cache = makeFakeCache()
		const fetcher = makeFetcher()
		const logs: string[] = []
		const logger = {log: (m: string) => logs.push(m), error: () => {}}
		await extractMetadata(
			{url: 'https://fast.example/', isAdmin: false},
			{cache, fetcher, logger, slowThresholdMs: 60_000},
		)
		expect(logs.some((m) => m.includes('slow extraction'))).toBe(false)
	})
})

describe('extractMetadata — ExtractionError shape', () => {
	test('error class is throwable + carries code', () => {
		const err = new ExtractionError('BAD_REQUEST', 'x', {validateCode: 'INVALID_SCHEME', reason: 'x'})
		expect(err.name).toBe('ExtractionError')
		expect(err.code).toBe('BAD_REQUEST')
		expect(err.cause?.validateCode).toBe('INVALID_SCHEME')
		expect(err instanceof Error).toBe(true)
	})
})
