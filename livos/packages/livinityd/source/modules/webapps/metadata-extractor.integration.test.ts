// Phase 92-10 — end-to-end integration test for the webapp metadata
// extraction pipeline.
//
// Boots an in-process http server, calls `extractMetadata()` (the surface
// the tRPC procedure delegates to) twice against the same URL, and asserts
// the second call hits the in-memory cache (server request count stays at
// 1). This validates the full validate→fetch→parse→resolve→cache pipeline
// using real implementations of every stage except the cache, where we use
// the in-memory FakeRedis (already proven in 92-07's unit tests) so we
// don't depend on a live Redis instance.
//
// Manual smoke curl (documented for the executor — run against the dev
// livinityd before phase close):
//
//   curl -sS -H 'content-type: application/json' \
//     -H "authorization: Bearer $LIV_API_KEY" \
//     -X POST http://localhost:3001/trpc/webapp.extractMetadata \
//     -d '{"url":"https://github.com"}' | jq
//
// Expected: 200 with shape {result:{data:{title,faviconUrl,description,
// ogImage}}}; second call returns in <50ms (cache hit).

import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'

import {afterAll, beforeAll, describe, expect, test} from 'vitest'

import {extractMetadata, type MetadataResult} from './metadata-extractor.js'
import type {MetadataCache, RedisLike} from './metadata-cache.js'
import {createMetadataCache} from './metadata-cache.js'

// In-memory RedisLike — same shape used in metadata-cache.test.ts.
class FakeRedis implements RedisLike {
	store = new Map<string, string>()
	async get(key: string): Promise<string | null> {
		return this.store.get(key) ?? null
	}
	async set(key: string, value: string): Promise<unknown> {
		this.store.set(key, value)
		return 'OK'
	}
}

let server: Server
let baseHost: string
let requestCount = 0

const HTML = `<!doctype html><html><head>
<title>Integration Test</title>
<meta name="description" content="end-to-end happy path">
<meta property="og:image" content="https://example.com/og.png">
<link rel="icon" href="/icon-192.png" sizes="192x192">
<link rel="icon" href="/icon-32.png" sizes="32x32">
</head><body><h1>hello</h1></body></html>`

beforeAll(async () => {
	server = createServer((req: IncomingMessage, res: ServerResponse) => {
		requestCount++
		res.setHeader('content-type', 'text/html; charset=utf-8')
		res.end(HTML)
	})
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
	const addr = server.address() as AddressInfo
	baseHost = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('webapp.extractMetadata — integration', () => {
	test('first call performs fetch + populates cache; second call hits cache', async () => {
		const fakeRedis = new FakeRedis()
		const cache: MetadataCache = createMetadataCache(fakeRedis)
		// Admin so we bypass the private-IP guard for 127.0.0.1.
		const args = {url: `${baseHost}/`, isAdmin: true}

		requestCount = 0
		const first = (await extractMetadata(args, {cache})) as MetadataResult

		expect(first.title).toBe('Integration Test')
		expect(first.description).toBe('end-to-end happy path')
		expect(first.ogImage).toBe('https://example.com/og.png')
		// 192x192 wins the sizes tie-breaker; resolved against finalUrl host.
		expect(first.faviconUrl).toBe(`${baseHost}/icon-192.png`)
		expect(requestCount).toBe(1)

		// Second call should NOT hit the upstream — cache short-circuits it.
		const second = (await extractMetadata(args, {cache})) as MetadataResult
		expect(second).toEqual(first)
		expect(requestCount).toBe(1) // unchanged: cache served the second call
	})

	test('non-admin call against a private-IP rejects BAD_REQUEST without a fetch', async () => {
		const fakeRedis = new FakeRedis()
		const cache: MetadataCache = createMetadataCache(fakeRedis)

		requestCount = 0
		await expect(
			extractMetadata({url: `${baseHost}/`, isAdmin: false}, {cache}),
		).rejects.toMatchObject({
			name: 'ExtractionError',
			code: 'BAD_REQUEST',
		})
		expect(requestCount).toBe(0)
	})
})
