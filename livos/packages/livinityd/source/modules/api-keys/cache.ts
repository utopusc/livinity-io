/**
 * Phase 59 FR-BROKER-B1-03 — in-memory cache for the Bearer auth hot path.
 *
 * Two responsibilities, one class:
 *
 *   1. POSITIVE / NEGATIVE LOOKUP CACHE (Map<keyHash, CacheEntry>)
 *      - setValid(hash, {userId, id})  → 60s TTL  (matches debounced last_used_at flush)
 *      - setInvalid(hash)              →  5s TTL  (caps brute-force PG QPS — CONTEXT.md
 *                                                   "Specific Idea" + RESEARCH.md A3 STRIDE T-59-12)
 *      - invalidate(hash)              → SYNCHRONOUS Map.delete — Wave 3's `apiKeys.revoke`
 *                                         calls this so revocation is IMMEDIATE rather than
 *                                         waiting for the 60s positive TTL to elapse
 *                                         (RESEARCH.md Pitfall 1 / Open Question 3).
 *      - get(hash)                     → returns the entry only if expiresAt > Date.now()
 *                                         (lazy expiry — no proactive sweep needed).
 *
 *   2. last_used_at DEBOUNCER (Map<keyHash, Date>)
 *      - touchLastUsed(hash)           → records latest seen time; repeated calls within the
 *                                         same flush window coalesce to ONE PG write per key.
 *      - flushLastUsed()               → drains the queue, issues per-key UPDATEs against
 *                                         api_keys.last_used_at; errors logged at warn level
 *                                         and SWALLOWED (observability data, not user error).
 *      - 30s setInterval triggers flushLastUsed in the background.
 *      - dispose() clearInterval + final flushLastUsed — wired into cli.ts cleanShutdown
 *         so pending writes survive SIGTERM/SIGINT (RESEARCH.md Pitfall 2).
 *
 * Invariant: single-process only. No Redis pub/sub for cross-process invalidation
 * (RESEARCH.md A3 — livinityd is single-process per Mini PC). If Phase 60+ ever
 * runs livinityd multi-process, swap this file for a Redis-backed cache without
 * touching the Bearer middleware contract.
 */

import type pg from 'pg'

import {getPool} from '../database/index.js'

const POSITIVE_TTL_MS = 60_000 // 60s — see CONTEXT.md last_used_at debounce window
const NEGATIVE_TTL_MS = 5_000 //  5s — caps brute-force PG QPS
const FLUSH_INTERVAL_MS = 30_000 // 30s background last_used_at flusher

export type CacheEntry =
	| {kind: 'valid'; userId: string; id: string; expiresAt: number}
	| {kind: 'invalid'; expiresAt: number}

export type PublicCacheEntry =
	| {kind: 'valid'; userId: string; id: string}
	| {kind: 'invalid'}

/**
 * Minimal logger surface — both `warn` and `verbose` are optional so this
 * cache can be wired with the native Livinityd logger (which exposes
 * `log`/`verbose`/`error`, no `warn`) AND with a richer logger in tests.
 * Resolution order for non-fatal flush errors:  warn → verbose → error.
 */
export interface MinimalLogger {
	log?: (message: string) => void
	warn?: (message: string) => void
	verbose?: (message: string) => void
	error: (message: string, err?: unknown) => void
}

const noopLogger: MinimalLogger = {
	log: () => {},
	warn: () => {},
	verbose: () => {},
	error: () => {},
}

function emitWarn(logger: MinimalLogger, message: string): void {
	if (logger.warn) {
		logger.warn(message)
		return
	}
	if (logger.verbose) {
		logger.verbose(message)
		return
	}
	logger.error(message)
}

export interface CreateApiKeyCacheDeps {
	pool?: pg.Pool | null
	logger?: MinimalLogger
}

export class ApiKeyCache {
	private readonly entries: Map<string, CacheEntry> = new Map()
	private readonly pendingLastUsed: Map<string, Date> = new Map()
	// Coalescing window — a key successfully flushed less than this ago is
	// SKIPPED on the next flush (CONTEXT.md "≤1 PG write/min/key" debounce).
	private readonly lastFlushedAt: Map<string, number> = new Map()
	private readonly logger: MinimalLogger
	private readonly resolvePool: () => pg.Pool | null
	private flusherHandle: NodeJS.Timeout | null = null
	private disposed = false

	constructor(deps: CreateApiKeyCacheDeps = {}) {
		this.logger = deps.logger ?? noopLogger
		// Pool is resolved lazily on each flush — at construction time the DB
		// may not yet be initialised (livinityd constructs the cache before
		// initDatabase runs), so capture a getter rather than a pool reference.
		const explicitPool = deps.pool
		this.resolvePool = explicitPool === undefined ? () => getPool() : () => explicitPool
		// Schedule the background flusher; .unref() so it doesn't hold the event
		// loop open in tests / CLI flows.
		this.flusherHandle = setInterval(() => {
			void this.flushLastUsed()
		}, FLUSH_INTERVAL_MS)
		if (typeof this.flusherHandle.unref === 'function') {
			this.flusherHandle.unref()
		}
	}

	/**
	 * Lookup a hash. Returns the cache entry only if not yet expired — lazy
	 * expiry keeps the hot path branchless (no time-driven sweep).
	 */
	get(keyHash: string): PublicCacheEntry | undefined {
		const entry = this.entries.get(keyHash)
		if (!entry) return undefined
		if (entry.expiresAt <= Date.now()) return undefined
		if (entry.kind === 'valid') {
			return {kind: 'valid', userId: entry.userId, id: entry.id}
		}
		return {kind: 'invalid'}
	}

	setValid(keyHash: string, value: {userId: string; id: string}): void {
		this.entries.set(keyHash, {
			kind: 'valid',
			userId: value.userId,
			id: value.id,
			expiresAt: Date.now() + POSITIVE_TTL_MS,
		})
	}

	setInvalid(keyHash: string): void {
		this.entries.set(keyHash, {
			kind: 'invalid',
			expiresAt: Date.now() + NEGATIVE_TTL_MS,
		})
	}

	/**
	 * Synchronous removal — Wave 3's `apiKeys.revoke` mutator calls this so
	 * revocation propagates immediately rather than waiting up to 60s for the
	 * positive TTL to elapse (RESEARCH.md Pitfall 1).
	 */
	invalidate(keyHash: string): void {
		this.entries.delete(keyHash)
	}

	/**
	 * Queue the latest "last seen" timestamp for this key. Repeated calls
	 * within the same flush window coalesce — only the latest timestamp wins
	 * and only ONE UPDATE is issued on flush (debouncing requirement from
	 * CONTEXT.md "≤1 PG write/min/key").
	 */
	touchLastUsed(keyHash: string): void {
		this.pendingLastUsed.set(keyHash, new Date())
	}

	/**
	 * Drain the queue and issue per-key UPDATEs against api_keys. Errors are
	 * logged at warn level and SWALLOWED — losing one last_used_at update is
	 * observability data lost, never a user-facing error.
	 *
	 * Per-key UPDATEs (rather than a batched VALUES join) keep this readable;
	 * the queue size is bounded by active key count per process per 30s window
	 * which is small.
	 */
	async flushLastUsed(): Promise<void> {
		if (this.pendingLastUsed.size === 0) return
		// Snapshot + clear up-front so concurrent touches during the await land
		// in the next flush window rather than being dropped.
		const snapshot = Array.from(this.pendingLastUsed.entries())
		this.pendingLastUsed.clear()

		const pool = this.resolvePool()
		if (!pool) {
			// No DB — nothing to flush. Drop snapshot silently; calling code
			// already accepted that last_used_at is best-effort.
			return
		}

		const now = Date.now()
		// First pass: filter snapshot to only keys we are *going to* write, AND
		// reserve the lastFlushedAt slot synchronously BEFORE any await. This
		// closes the race where two flushLastUsed calls overlap (background
		// 30s flusher + explicit dispose flush): the second call sees the
		// reservation made by the first and skips, producing ONE write per key
		// per minute as required by cache.test.ts T5.
		const toWrite: Array<[string, Date]> = []
		for (const [keyHash, seenAt] of snapshot) {
			const lastFlushed = this.lastFlushedAt.get(keyHash)
			if (lastFlushed !== undefined && now - lastFlushed < POSITIVE_TTL_MS) {
				continue
			}
			this.lastFlushedAt.set(keyHash, now)
			toWrite.push([keyHash, seenAt])
		}
		for (const [keyHash, seenAt] of toWrite) {
			try {
				await pool.query(
					`UPDATE api_keys SET last_used_at = $1 WHERE key_hash = $2`,
					[seenAt, keyHash],
				)
			} catch (err) {
				emitWarn(this.logger,
					`[api-keys.cache] flush UPDATE failed for one key (non-fatal): ${(err as Error).message}`,
				)
			}
		}
	}

	/**
	 * Cleanup hook — wired into cli.ts cleanShutdown so pending last_used_at
	 * writes are flushed before process.exit (RESEARCH.md Pitfall 2).
	 *
	 * Best-effort: errors inside flushLastUsed are already swallowed; this
	 * method MUST never throw because cleanShutdown is on the critical exit
	 * path and PM2 will SIGKILL after a short grace period anyway.
	 */
	async dispose(): Promise<void> {
		if (this.disposed) return
		this.disposed = true
		if (this.flusherHandle !== null) {
			clearInterval(this.flusherHandle)
			this.flusherHandle = null
		}
		try {
			await this.flushLastUsed()
		} catch (err) {
			emitWarn(
				this.logger,
				`[api-keys.cache] dispose flush failed (non-fatal): ${(err as Error).message}`,
			)
		}
	}
}

/**
 * Factory mirrors database.ts pattern. Default deps resolve `getPool()` at
 * flush time so the cache can be constructed before initDatabase runs.
 */
export function createApiKeyCache(deps: CreateApiKeyCacheDeps = {}): ApiKeyCache {
	return new ApiKeyCache(deps)
}

// ─── Singleton accessor (Wave 3 / Plan 04) ─────────────────────────────────
// The Livinityd constructor builds the canonical `apiKeyCache` (the one the
// bearer middleware mounts onto `/u/:userId/v1`). The Wave 3 tRPC routes
// (`apiKeys.revoke` in particular) need to call `.invalidate(keyHash)` on
// THAT same instance so revocation propagates synchronously through the same
// cache the bearer middleware reads from. Rather than thread the cache
// reference through every tRPC procedure's context, the constructor calls
// `setSharedApiKeyCache(this.apiKeyCache)` once at startup; routes.ts then
// calls `getSharedApiKeyCache()` lazily inside each procedure.
//
// Mirrors the `getPool()` shape from `database/index.ts` — process-wide
// singleton, set once at boot, throws if accessed before set.

let sharedInstance: ApiKeyCache | null = null

export function setSharedApiKeyCache(cache: ApiKeyCache): void {
	sharedInstance = cache
}

export function getSharedApiKeyCache(): ApiKeyCache {
	if (sharedInstance === null) {
		throw new Error(
			'[api-keys.cache] getSharedApiKeyCache() called before setSharedApiKeyCache() — ' +
				'Livinityd constructor must register the cache singleton before any tRPC route runs.',
		)
	}
	return sharedInstance
}

/**
 * Test-only escape hatch — clears the singleton so independent test files
 * don't see leftover state from prior runs. Production code MUST NOT call
 * this; the singleton is set once per process at Livinityd construction.
 */
export function resetSharedApiKeyCacheForTests(): void {
	sharedInstance = null
}
