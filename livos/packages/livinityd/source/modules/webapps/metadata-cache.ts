// Phase 92-07 — Redis cache wrapper for metadata extraction.
//
// 24h TTL on `liv:webapp:meta:<sha256(normalizedUrl)>`. Value is a
// JSON-stringified MetadataResult. The orchestrator (92-08) calls
//   cache.get(url) → null OR MetadataResult
//   cache.set(url, value) → void
// before / after the fetch+parse pipeline.
//
// Lazy ioredis singleton (mirrors `docker/ai-diagnostics.ts:getRedis()`)
// so importing this module does NOT open a socket at module-load time —
// keeps unit tests cheap and avoids spurious connection retries when the
// surface is exercised via DI fakes.

import {createHash} from 'node:crypto'

import {Redis} from 'ioredis'

import type {MetadataResult} from './metadata-extractor.js'

const KEY_PREFIX = 'liv:webapp:meta:'
const TTL_SECONDS = 24 * 60 * 60 // 86400

// Minimal interface — accepts the real ioredis client OR a test double
// that implements just `get` + `set`. set signature matches ioredis's
// "EX" variadic so we don't need to mock the rich overload set.
export type RedisLike = {
	get(key: string): Promise<string | null>
	set(key: string, value: string, ex: 'EX', seconds: number): Promise<unknown>
}

let _redis: Redis | null = null
function getRealRedis(): Redis {
	if (!_redis) {
		_redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
			maxRetriesPerRequest: null,
		})
	}
	return _redis
}

function urlKey(normalizedUrl: string): string {
	const digest = createHash('sha256').update(normalizedUrl).digest('hex')
	return `${KEY_PREFIX}${digest}`
}

export type MetadataCache = {
	get(normalizedUrl: string): Promise<MetadataResult | null>
	set(normalizedUrl: string, value: MetadataResult): Promise<void>
	keyFor(normalizedUrl: string): string
}

export function createMetadataCache(client?: RedisLike): MetadataCache {
	const lazyRedis = (): RedisLike => client ?? (getRealRedis() as unknown as RedisLike)

	return {
		async get(normalizedUrl: string): Promise<MetadataResult | null> {
			const raw = await lazyRedis().get(urlKey(normalizedUrl))
			if (!raw) return null
			try {
				return JSON.parse(raw) as MetadataResult
			} catch {
				// Corrupt cache entry — treat as a miss; next set() overwrites.
				return null
			}
		},

		async set(normalizedUrl: string, value: MetadataResult): Promise<void> {
			await lazyRedis().set(urlKey(normalizedUrl), JSON.stringify(value), 'EX', TTL_SECONDS)
		},

		keyFor(normalizedUrl: string): string {
			return urlKey(normalizedUrl)
		},
	}
}
