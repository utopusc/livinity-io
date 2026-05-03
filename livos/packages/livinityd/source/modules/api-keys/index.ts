/**
 * Phase 59 — api-keys module barrel.
 *
 * Per-user `liv_sk_*` Bearer tokens for the broker. Wave 1 ships the PG CRUD
 * layer; Waves 2-4 add cache + middleware + tRPC routes + UI wiring.
 */

export {
	createApiKey,
	findApiKeyByHash,
	listApiKeysForUser,
	listAllApiKeys,
	revokeApiKey,
	hashKey,
} from './database.js'

export type {ApiKeyRow} from './database.js'

// Wave 2 (Phase 59-03) — Bearer auth hot-path cache.
export {ApiKeyCache, createApiKeyCache} from './cache.js'
export type {CacheEntry, PublicCacheEntry, MinimalLogger} from './cache.js'

// Wave 2 (Phase 59-03) — Bearer middleware factory + mount helper.
export {createBearerMiddleware, mountBearerAuthMiddleware} from './bearer-auth.js'
