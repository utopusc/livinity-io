/**
 * F5 identity cache (Phase 74 Plan 04 — BROKER-CARRY-04 + BROKER-CARRY-05).
 *
 * In-process LRU+TTL cache for the broker's URL-path identity resolution.
 * Per CONTEXT decisions D-16..D-20:
 *   - In-memory only (no Redis backing — D-16). livinityd is single-process
 *     per Mini PC; all broker requests for a user route through the same
 *     process. A Redis hop would add 1-2ms RTT per request — pointless when
 *     the cache miss penalty (PG + disk) is what we are optimizing.
 *   - Cache key: `${userId}:${conversationId}` — D-17. `conversationId` comes
 *     from `X-Liv-Conversation-Id` header → `x-request-id` (Caddy/relay-set)
 *     → per-request UUID fallback (graceful degradation = current behavior).
 *   - 30-minute TTL — D-18. Implemented as lazy eviction on read.
 *   - Cached value: `{ userId, claudeDir, multiUserMode, cachedAt }` — D-19.
 *     The `multiUserMode` flag is bound at write-time so a flip between
 *     calls (admin re-enables multi-user mode mid-session, etc.) invalidates
 *     the entry. The `SubscriptionToken` itself is NOT cached — credentials
 *     can rotate via OAuth refresh, and stale tokens cause auth failures.
 *     We cache only the resolved `userId` + path tuple.
 *   - 1024-entry LRU cap — D-20. Map preserves insertion order in JS, so
 *     "first key" = least-recently-inserted. Read-touch (delete + re-set)
 *     promotes recency.
 *
 * Bearer-authenticated requests are NOT cached — the Phase 59 middleware
 * already short-circuits identity via `req.userId` from `api_keys.user_id`,
 * so caching that path would shadow the api_keys table. F5 only wraps the
 * URL-path identity branch in `auth.ts` (lines 46-78).
 *
 * Threat coverage (per <threat_model> in 74-04-PLAN.md):
 *   - T-74-04-01 (cross-user cache hit via spoofed conversationId): mitigated
 *     by `${userId}:${conversationId}` composite key — userId is validated
 *     against PG via the URL-path branch BEFORE reaching the cache, and a
 *     different userId always lands in a different slot.
 *   - T-74-04-05 (DoS via cache flooding): mitigated by 1024 LRU cap. Worst
 *     case: legitimate users get cache misses (degrades to current behavior).
 *   - T-74-04-09 (stale multiUserMode): mitigated by per-read flag check.
 */

const TTL_MS = 30 * 60 * 1000 // 30 minutes (D-18)
const MAX_ENTRIES = 1024 // LRU cap (D-20)

export type CachedIdentity = {
	userId: string
	claudeDir: string // /opt/livos/data/users/<id>/.claude OR /root/.claude under BROKER_FORCE_ROOT_HOME
	multiUserMode: boolean // bound at write-time so a toggle invalidates this entry (D-19)
	cachedAt: number
}

export class IdentityCache {
	private store = new Map<string, CachedIdentity>()

	/**
	 * Look up a cached identity. Returns `undefined` on miss (key not present),
	 * TTL expiry (lazy-evicted), or multi-user-mode mismatch (lazy-evicted).
	 *
	 * On hit, the entry is re-inserted to promote it to most-recent insertion
	 * order — Map iteration order tracks recency of last `set` call.
	 */
	get(key: string, currentMultiUserMode: boolean): CachedIdentity | undefined {
		const v = this.store.get(key)
		if (!v) return undefined

		if (Date.now() - v.cachedAt > TTL_MS) {
			// TTL expired — lazy-evict
			this.store.delete(key)
			return undefined
		}

		if (v.multiUserMode !== currentMultiUserMode) {
			// Multi-user-mode flipped between write and read — entry may carry
			// stale identity assumptions. Drop it; force fresh resolution.
			this.store.delete(key)
			return undefined
		}

		// LRU promote: delete + re-set pushes to end of insertion order.
		this.store.delete(key)
		this.store.set(key, v)
		return v
	}

	/**
	 * Insert (or overwrite) an entry. When the cache is full, evicts the
	 * least-recently-inserted key first.
	 */
	set(key: string, value: CachedIdentity): void {
		if (this.store.size >= MAX_ENTRIES && !this.store.has(key)) {
			// Evict the oldest entry (first key in insertion order)
			const oldest = this.store.keys().next().value
			if (oldest !== undefined) this.store.delete(oldest)
		}
		this.store.set(key, value)
	}

	invalidate(key: string): void {
		this.store.delete(key)
	}

	size(): number {
		return this.store.size
	}

	/** Test-only helper: dump all entries. */
	_resetForTest(): void {
		this.store.clear()
	}
}

/**
 * Module-singleton instance. Used by `auth.ts:resolveAndAuthorizeUserId`
 * via the cache-aside pattern wrapping the URL-path identity branch.
 *
 * Lifetime: livinityd process lifetime. Restart = empty cache. This is the
 * intended behavior — BROKER_FORCE_ROOT_HOME only flips at startup via the
 * systemd unit env, so a service restart naturally clears stale entries.
 */
export const identityCache = new IdentityCache()
