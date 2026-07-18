// Phase 341-01 (REPO-01, D-341-4/D-341-5) — SSRF-hardened fetch + strict
// federated manifest validation. Fully offline: injected `lookup` drives the
// SSRF guard deterministically and injected `fetchImpl` stubs the network.
import {describe, it, expect, vi} from 'vitest'

import {
	fetchFederatedCatalog,
	parseFederatedManifest,
	MAX_CATALOG_BYTES,
} from './federated-catalog.js'

// A minimally-valid AppManifest (mirrors schema.test.ts baseManifest).
const validManifest = {
	manifestVersion: '1.0.0',
	id: 'sample',
	name: 'Sample',
	tagline: 't',
	category: 'c',
	version: '1.0.0',
	port: 8080,
	description: 'd',
	website: 'https://example.com',
	support: 'https://example.com',
	gallery: [],
}

// ── fake Response builders ────────────────────────────────────────────────────

function streamOf(str: string): ReadableStream<Uint8Array> {
	const bytes = new TextEncoder().encode(str)
	return new ReadableStream({
		start(c) {
			c.enqueue(bytes)
			c.close()
		},
	})
}

function oversizeStream(): ReadableStream<Uint8Array> {
	const chunk = new Uint8Array(1024 * 1024) // 1 MB
	return new ReadableStream({
		start(c) {
			c.enqueue(chunk)
			c.enqueue(chunk)
			c.enqueue(chunk) // 3 MB total > 2 MB cap
			c.close()
		},
	})
}

function jsonRes(body: unknown): Response {
	return {
		status: 200,
		ok: true,
		type: 'basic',
		body: streamOf(JSON.stringify(body)),
		async text() {
			return JSON.stringify(body)
		},
	} as unknown as Response
}

function catalog(entries: unknown[]): unknown {
	return {apps: entries}
}

const validEntry = {
	id: 'sample',
	manifest: validManifest,
	docker_compose: 'services:\n  app:\n    image: x',
}

describe('fetchFederatedCatalog: SSRF hardening', () => {
	it.each([['169.254.169.254'], ['127.0.0.1'], ['10.0.0.5']])(
		'rejects a source resolving to %s, and never fetches',
		async (ip) => {
			const fetchImpl = vi.fn()
			await expect(
				fetchFederatedCatalog('https://evil.example.com/catalog.json', {
					lookup: async () => [ip],
					fetchImpl: fetchImpl as unknown as typeof fetch,
				}),
			).rejects.toThrow(/SSRF blocked/)
			expect(fetchImpl).not.toHaveBeenCalled()
		},
	)

	it('rejects http:// (https-only) before any lookup or fetch', async () => {
		const lookup = vi.fn()
		const fetchImpl = vi.fn()
		await expect(
			fetchFederatedCatalog('http://store.example.com/catalog.json', {
				lookup: lookup as any,
				fetchImpl: fetchImpl as unknown as typeof fetch,
			}),
		).rejects.toThrow(/only https/)
		expect(lookup).not.toHaveBeenCalled()
		expect(fetchImpl).not.toHaveBeenCalled()
	})

	it('refuses a redirect (explicit 3xx)', async () => {
		const fetchImpl = vi.fn(async () => ({status: 302, ok: false, type: 'basic'}) as unknown as Response)
		await expect(
			fetchFederatedCatalog('https://store.example.com/catalog.json', {
				lookup: async () => ['93.184.216.34'],
				fetchImpl: fetchImpl as unknown as typeof fetch,
			}),
		).rejects.toThrow(/redirected/)
	})

	it('refuses an opaqueredirect (status 0)', async () => {
		const fetchImpl = vi.fn(
			async () => ({status: 0, ok: false, type: 'opaqueredirect'}) as unknown as Response,
		)
		await expect(
			fetchFederatedCatalog('https://store.example.com/catalog.json', {
				lookup: async () => ['93.184.216.34'],
				fetchImpl: fetchImpl as unknown as typeof fetch,
			}),
		).rejects.toThrow(/redirected/)
	})

	it('refuses an oversize body even with a lying small Content-Length', async () => {
		const fetchImpl = vi.fn(
			async () =>
				({
					status: 200,
					ok: true,
					type: 'basic',
					headers: new Map([['content-length', '10']]), // ignored by the streamed cap
					body: oversizeStream(),
					async text() {
						return 'x'.repeat(MAX_CATALOG_BYTES + 1)
					},
				}) as unknown as Response,
		)
		await expect(
			fetchFederatedCatalog('https://store.example.com/catalog.json', {
				lookup: async () => ['93.184.216.34'],
				fetchImpl: fetchImpl as unknown as typeof fetch,
			}),
		).rejects.toThrow(/size cap/)
	})

	it('propagates a fetch timeout (AbortError)', async () => {
		const fetchImpl = vi.fn(async () => {
			const err = new Error('aborted')
			err.name = 'AbortError'
			throw err
		})
		await expect(
			fetchFederatedCatalog('https://store.example.com/catalog.json', {
				lookup: async () => ['93.184.216.34'],
				fetchImpl: fetchImpl as unknown as typeof fetch,
			}),
		).rejects.toThrow()
	})
})

describe('fetchFederatedCatalog: manifest validation (D-341-5)', () => {
	it('returns a valid entry with its strict-parsed manifest', async () => {
		const fetchImpl = vi.fn(async () => jsonRes(catalog([validEntry])))
		const apps = await fetchFederatedCatalog('https://store.example.com/catalog.json', {
			lookup: async () => ['93.184.216.34'],
			fetchImpl: fetchImpl as unknown as typeof fetch,
		})
		expect(apps).toHaveLength(1)
		expect(apps[0].catalogSlug).toBe('sample')
		expect(apps[0].manifest.port).toBe(8080)
	})

	it('skips a malformed entry but keeps a valid sibling', async () => {
		const badManifest = {...validManifest} as Record<string, unknown>
		delete badManifest.port // missing required field
		const fetchImpl = vi.fn(async () =>
			jsonRes(
				catalog([
					{id: 'bad', manifest: badManifest, docker_compose: 'x'},
					{id: 'good', manifest: {...validManifest, id: 'good'}, docker_compose: 'x'},
				]),
			),
		)
		const apps = await fetchFederatedCatalog('https://store.example.com/catalog.json', {
			lookup: async () => ['93.184.216.34'],
			fetchImpl: fetchImpl as unknown as typeof fetch,
		})
		expect(apps.map((a) => a.catalogSlug)).toEqual(['good'])
	})

	it('skips an entry whose manifest.website is not a URL', async () => {
		const fetchImpl = vi.fn(async () =>
			jsonRes(
				catalog([{id: 'nope', manifest: {...validManifest, website: 'not-a-url'}, docker_compose: 'x'}]),
			),
		)
		const apps = await fetchFederatedCatalog('https://store.example.com/catalog.json', {
			lookup: async () => ['93.184.216.34'],
			fetchImpl: fetchImpl as unknown as typeof fetch,
		})
		expect(apps).toHaveLength(0)
	})

	it('throws on a wholly-invalid top-level shape', async () => {
		const fetchImpl = vi.fn(async () => jsonRes({notApps: 1}))
		await expect(
			fetchFederatedCatalog('https://store.example.com/catalog.json', {
				lookup: async () => ['93.184.216.34'],
				fetchImpl: fetchImpl as unknown as typeof fetch,
			}),
		).rejects.toThrow()
	})

	it('accepts a bare top-level array (normalized to {apps})', async () => {
		const fetchImpl = vi.fn(async () => jsonRes([validEntry]))
		const apps = await fetchFederatedCatalog('https://store.example.com/catalog.json', {
			lookup: async () => ['93.184.216.34'],
			fetchImpl: fetchImpl as unknown as typeof fetch,
		})
		expect(apps).toHaveLength(1)
	})

	it('rejects a catalog entry whose id is a bad slug (../evil, UPPER)', async () => {
		const fetchImpl = vi.fn(async () =>
			jsonRes({apps: [{id: '../evil', manifest: validManifest, docker_compose: 'x'}]}),
		)
		await expect(
			fetchFederatedCatalog('https://store.example.com/catalog.json', {
				lookup: async () => ['93.184.216.34'],
				fetchImpl: fetchImpl as unknown as typeof fetch,
			}),
		).rejects.toThrow() // FederatedAppEntrySchema.id regex fails → top-level parse throws
	})
})

describe('fetchFederatedCatalog: payload-claimed trust is ignored (D-341-3)', () => {
	it('strips verified/trusted from the manifest — no trust signal survives', async () => {
		const hostileManifest = {...validManifest, verified: true, trusted: true}
		const fetchImpl = vi.fn(async () =>
			jsonRes(catalog([{id: 'sample', manifest: hostileManifest, docker_compose: 'x'}])),
		)
		const apps = await fetchFederatedCatalog('https://store.example.com/catalog.json', {
			lookup: async () => ['93.184.216.34'],
			fetchImpl: fetchImpl as unknown as typeof fetch,
		})
		expect(apps).toHaveLength(1)
		expect('verified' in (apps[0].manifest as object)).toBe(false)
		expect('trusted' in (apps[0].manifest as object)).toBe(false)
		// the fetched app exposes no trust field at all — trust is stamped later, in T3
		expect('trusted' in apps[0]).toBe(false)
	})
})

describe('parseFederatedManifest', () => {
	it('throws on a non-conformant manifest (unlike the shared validateManifest)', () => {
		expect(() => parseFederatedManifest({id: 'x'})).toThrow()
	})
})
