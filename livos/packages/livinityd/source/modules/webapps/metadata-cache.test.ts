// Phase 92-07 — metadata-cache.ts unit tests.
//
// Uses an in-memory RedisLike fake (no real ioredis instantiation, no
// network) — mirrors the DI pattern `createMetadataCache(client)` exposes.
// Validates round-trip, miss-returns-null, key format, and TTL argument
// shape.

import {describe, expect, test} from 'vitest'

import {createMetadataCache, type RedisLike} from './metadata-cache.js'
import type {MetadataResult} from './metadata-extractor.js'

class FakeRedis implements RedisLike {
	store = new Map<string, string>()
	lastSetTtl: number | null = null
	lastSetKey: string | null = null

	async get(key: string): Promise<string | null> {
		return this.store.get(key) ?? null
	}
	async set(key: string, value: string, ex: 'EX', seconds: number): Promise<unknown> {
		this.lastSetKey = key
		this.lastSetTtl = seconds
		expect(ex).toBe('EX')
		this.store.set(key, value)
		return 'OK'
	}
}

const SAMPLE: MetadataResult = {
	title: 'Example Page',
	faviconUrl: 'https://example.com/favicon.ico',
	description: 'desc',
	ogImage: 'https://example.com/og.png',
}

describe('metadata-cache — round-trip', () => {
	test('set followed by get returns the same payload', async () => {
		const fake = new FakeRedis()
		const cache = createMetadataCache(fake)
		await cache.set('https://example.com', SAMPLE)
		const out = await cache.get('https://example.com')
		expect(out).toEqual(SAMPLE)
	})

	test('get for unknown URL returns null', async () => {
		const fake = new FakeRedis()
		const cache = createMetadataCache(fake)
		const out = await cache.get('https://never-set.example.com')
		expect(out).toBeNull()
	})

	test('corrupt cache entry returns null (graceful miss)', async () => {
		const fake = new FakeRedis()
		// Pre-poison the store with non-JSON value at the expected key.
		const cache = createMetadataCache(fake)
		const key = cache.keyFor('https://corrupt.example.com')
		fake.store.set(key, '{not-json')
		const out = await cache.get('https://corrupt.example.com')
		expect(out).toBeNull()
	})
})

describe('metadata-cache — key format', () => {
	test('key matches liv:webapp:meta:<64-hex>', async () => {
		const fake = new FakeRedis()
		const cache = createMetadataCache(fake)
		const key = cache.keyFor('https://example.com/x')
		expect(key).toMatch(/^liv:webapp:meta:[0-9a-f]{64}$/)
	})

	test('different URLs produce different keys', () => {
		const fake = new FakeRedis()
		const cache = createMetadataCache(fake)
		const a = cache.keyFor('https://a.example.com')
		const b = cache.keyFor('https://b.example.com')
		expect(a).not.toBe(b)
	})

	test('same URL produces a stable key', () => {
		const fake = new FakeRedis()
		const cache = createMetadataCache(fake)
		const a = cache.keyFor('https://stable.example.com/x?y=1')
		const b = cache.keyFor('https://stable.example.com/x?y=1')
		expect(a).toBe(b)
	})
})

describe('metadata-cache — TTL', () => {
	test('set passes 86400s TTL via EX', async () => {
		const fake = new FakeRedis()
		const cache = createMetadataCache(fake)
		await cache.set('https://ttl.example.com', SAMPLE)
		expect(fake.lastSetTtl).toBe(86400)
	})

	test('set writes to the prefixed sha256 key', async () => {
		const fake = new FakeRedis()
		const cache = createMetadataCache(fake)
		await cache.set('https://ttl.example.com', SAMPLE)
		expect(fake.lastSetKey).toMatch(/^liv:webapp:meta:[0-9a-f]{64}$/)
	})
})
