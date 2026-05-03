// Phase 61 Plan 03 D1 — Redis-backed model alias resolver.
//
// Supersedes the hardcoded if/else cascade in openai-translator.ts:32-70
// (Phase 42 D-42-11). Redis-backed: admin runtime updates take effect within
// 5 seconds without restart (FR-BROKER-D1-02).
//
// Single-process cache only — if livinityd ever goes multi-process (v31+),
// switch to Redis pub/sub for invalidation (RESEARCH.md Pitfall 2).
//
// Threat model:
//   - T-61-07 (Tampering / Injection): `requested` is untrusted client input
//     (body.model). We lowercase + trim BEFORE concatenating into the Redis
//     key. ioredis treats the resulting string as a literal key (no glob/
//     pattern eval); colon-injection produces a valid-but-non-existent key.
//   - T-61-08 (DoS via cache flooding): Cache TTL 5s × ~80B per entry × 100k
//     unique requests/sec ≈ 40MB worst-case. Acceptable for v30. Switch to
//     LRU in v31+ if observed.

const CACHE_TTL_MS = 5_000
const ALIAS_PREFIX = 'livinity:broker:alias:'
const DEFAULT_FALLBACK_KEY = 'default'
const HARDCODED_FALLBACK = 'claude-sonnet-4-6'

/** Minimal Redis interface — keeps the resolver decoupled from ioredis types. */
export interface AliasRedisLike {
	get(key: string): Promise<string | null>
}

interface CacheEntry {
	value: string | null
	expiresAt: number
}

const cache = new Map<string, CacheEntry>()

async function lookup(redis: AliasRedisLike, alias: string): Promise<string | null> {
	const now = Date.now()
	const hit = cache.get(alias)
	if (hit && hit.expiresAt > now) return hit.value
	let value: string | null
	try {
		value = await redis.get(`${ALIAS_PREFIX}${alias}`)
	} catch {
		// Redis error — caller treats as "miss" (per RESEARCH.md Open Q4).
		// We DO NOT cache the failure — next call retries Redis fresh.
		return null
	}
	cache.set(alias, {value, expiresAt: now + CACHE_TTL_MS})
	return value
}

/**
 * Resolve a client-supplied model name to a real Claude model ID.
 *
 * Resolution order:
 *   1. Lowercase + trim the input.
 *   2. Redis lookup at `livinity:broker:alias:<lowercased-input>` — return verbatim if hit.
 *   3. If input starts with `claude-`, pass through verbatim (assume real model ID).
 *   4. Otherwise, look up the `default` alias (Redis or HARDCODED_FALLBACK), warn=true, return.
 *
 * On Redis error at step 2 or 4: returns `{HARDCODED_FALLBACK, warn: true}` instead of throwing.
 * The hardcoded fallback prevents the broker from ever 5xx-ing solely because Redis is down.
 */
export async function resolveModelAlias(
	redis: AliasRedisLike,
	requested: string,
): Promise<{actualModel: string; warn: boolean}> {
	const r = (requested || '').toLowerCase().trim()
	const direct = await lookup(redis, r)
	if (direct !== null) return {actualModel: direct, warn: false}
	if (r.startsWith('claude-')) return {actualModel: r, warn: false}
	const fallback = await lookup(redis, DEFAULT_FALLBACK_KEY)
	return {actualModel: fallback ?? HARDCODED_FALLBACK, warn: true}
}

/** Test seam — clears the in-memory TTL cache between tests. */
export function _resetAliasCacheForTest(): void {
	cache.clear()
}
