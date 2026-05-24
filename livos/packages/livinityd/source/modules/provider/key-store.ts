/**
 * Phase 204-01 — LLM provider API key store (Redis-backed).
 *
 * Owns the persistence side of the `/settings → Providers` tab. The Phase 204
 * trust model (D-204-02): Mini PC is single-tenant, keys live in plaintext in
 * Redis (same level of protection as `/opt/livos/.env`). HD-encryption is the
 * operator's responsibility.
 *
 * Storage: Redis hash `liv:provider:keys`. Field = provider name (lowercase).
 * Value = JSON-encoded `{key: string, addedAt: ISO-8601 string}`.
 *
 * INV-204-04 — `list()` NEVER returns the raw key value. Only a redacted
 * preview (`<provider>-***<last4>`) plus the `addedAt` timestamp.
 *
 * INV-204-06 — log lines NEVER include the raw key. Server-side audit lines
 * are constructed via `redactKey(provider, key)` so the journal only ever
 * sees the redacted preview.
 *
 * Carry-over INV-203-01 sacred SHA: this file is NEW (not on the 20-file
 * registry); pre-commit hook still verifies the 20 protected blobs are
 * untouched.
 */

import type {Redis} from 'ioredis'

// ── Constants ────────────────────────────────────────────────────────────

/** Redis hash key. Single hash holds every provider's record. */
export const PROVIDER_KEYS_HASH = 'liv:provider:keys'

/**
 * Locked supported provider set (D-204-03). The openclaw gateway's provider
 * router resolves each of these to its env var on first tool call. Adding a
 * 7th provider = source edit in this file + matching `PROVIDER_ENV_VAR`
 * entry below + a regen of the env file.
 */
export const PROVIDER_ENUM = [
	'xai',
	'anthropic',
	'openai',
	'groq',
	'mistral',
	'ollama',
] as const

export type ProviderName = (typeof PROVIDER_ENUM)[number]

/**
 * Provider name → env var the openclaw gateway expects at process boot.
 * The env-file writer fans these out one per line into the file referenced
 * by `liv-claw-gateway.service`'s `EnvironmentFile=` directive.
 *
 * IMPORTANT: keep this map sorted by VALUE so the emitted env file is
 * deterministic between syncs (writer sorts at emit time anyway, but
 * keeping the source aligned makes review trivial).
 */
export const PROVIDER_ENV_VAR: Record<ProviderName, string> = {
	anthropic: 'ANTHROPIC_API_KEY',
	groq: 'GROQ_API_KEY',
	mistral: 'MISTRAL_API_KEY',
	ollama: 'OLLAMA_API_KEY',
	openai: 'OPENAI_API_KEY',
	xai: 'XAI_API_KEY',
}

// ── Types ────────────────────────────────────────────────────────────────

/**
 * Persisted record shape inside the Redis hash. NEVER returned to UI clients
 * (clients see `ProviderRow` instead — preview only).
 */
export interface StoredKey {
	key: string
	addedAt: string
}

/**
 * Redacted public shape returned by `list()`. INV-204-04 — clients only ever
 * see this; the raw key never crosses the tRPC boundary.
 */
export interface ProviderRow {
	provider: ProviderName
	preview: string
	addedAt: string
}

export interface ProviderKeyStoreLogger {
	info(msg: string): void
	warn(msg: string, error?: unknown): void
}

/**
 * Narrow ioredis surface so tests can pass a tiny mock without pulling the
 * whole client (matches the mcp-config-router pattern).
 */
export interface ProviderKeyStoreRedis {
	hget(key: string, field: string): Promise<string | null>
	hset(key: string, field: string, value: string): Promise<unknown>
	hdel(key: string, field: string): Promise<unknown>
	hgetall(key: string): Promise<Record<string, string>>
}

export interface ProviderKeyStoreOptions {
	redis: ProviderKeyStoreRedis | Redis
	logger?: ProviderKeyStoreLogger
}

// ── Public helpers ───────────────────────────────────────────────────────

/**
 * Format a key for log lines + UI preview. Pattern: `<provider>-***<last4>`.
 *
 * Examples:
 *   redactKey('xai', 'xai-abcd1234efgh5678')  → 'xai-***5678'
 *   redactKey('groq', 'gsk_abcdefgh')           → 'groq-***efgh'
 *
 * For keys shorter than 4 chars (would be rejected by the zod schema, but
 * defense-in-depth) we emit `<provider>-***` with no suffix.
 */
export function redactKey(provider: ProviderName, key: string): string {
	const last4 = key.length >= 4 ? key.slice(-4) : ''
	return `${provider}-***${last4}`
}

// ── Class ────────────────────────────────────────────────────────────────

/**
 * Redis-backed CRUD over the `liv:provider:keys` hash. Constructed once at
 * livinityd boot wire-up; lives for the lifetime of the process. The router
 * (Plan 204-01 Task 3) wraps this with the tRPC layer.
 */
export class ProviderKeyStore {
	private readonly redis: ProviderKeyStoreRedis
	private readonly logger: ProviderKeyStoreLogger

	constructor(opts: ProviderKeyStoreOptions) {
		this.redis = opts.redis as ProviderKeyStoreRedis
		this.logger = opts.logger ?? {
			info: () => undefined,
			warn: () => undefined,
		}
	}

	/**
	 * Persist a provider key. Overwrites any existing value atomically
	 * (HSET is atomic in Redis). `addedAt` is set to NOW, not the original
	 * add time — this is intentional so the UI surfaces "last touched" not
	 * "first added"; if we ever need both we'll add a separate field.
	 */
	async set(provider: ProviderName, key: string): Promise<void> {
		const record: StoredKey = {
			key,
			addedAt: new Date().toISOString(),
		}
		await this.redis.hset(PROVIDER_KEYS_HASH, provider, JSON.stringify(record))
		// INV-204-06 — log line uses redacted preview ONLY. Never the raw key.
		this.logger.info(
			`[provider-key-store] set ${provider} (preview=${redactKey(provider, key)})`,
		)
	}

	/**
	 * Read one provider's raw record. Used by `getAllForEnvFile` and tests
	 * — NOT exposed via the tRPC layer (INV-204-04). Returns null on missing
	 * or corrupt entries.
	 */
	async get(provider: ProviderName): Promise<StoredKey | null> {
		const raw = await this.redis.hget(PROVIDER_KEYS_HASH, provider)
		if (raw === null || raw === undefined) return null
		try {
			const parsed = JSON.parse(raw) as Partial<StoredKey>
			if (typeof parsed.key !== 'string' || typeof parsed.addedAt !== 'string') {
				this.logger.warn(
					`[provider-key-store] entry '${provider}' has invalid shape — treating as missing`,
				)
				return null
			}
			return {key: parsed.key, addedAt: parsed.addedAt}
		} catch (err) {
			this.logger.warn(
				`[provider-key-store] entry '${provider}' JSON parse failed — treating as missing`,
				err,
			)
			return null
		}
	}

	/**
	 * Remove a provider. Returns true if a field was actually removed (idempotent
	 * — deleting a missing provider returns false but does NOT throw).
	 */
	async delete(provider: ProviderName): Promise<boolean> {
		const removed = (await this.redis.hdel(PROVIDER_KEYS_HASH, provider)) as number
		const ok = removed === 1
		if (ok) {
			this.logger.info(`[provider-key-store] delete ${provider}`)
		}
		return ok
	}

	/**
	 * Public-facing list. INV-204-04 — returns ONLY the redacted shape; raw
	 * keys never leave this method. Corrupt rows are skipped (logged at warn
	 * level) so a single bad entry doesn't brick the whole `/settings →
	 * Providers` tab render.
	 */
	async list(): Promise<ProviderRow[]> {
		const raw = await this.redis.hgetall(PROVIDER_KEYS_HASH)
		const out: ProviderRow[] = []
		for (const [field, value] of Object.entries(raw ?? {})) {
			// Defense-in-depth: ignore fields outside the locked enum
			// (e.g. someone HSET'd a 7th provider manually).
			if (!(PROVIDER_ENUM as readonly string[]).includes(field)) {
				this.logger.warn(
					`[provider-key-store] entry '${field}' is not in PROVIDER_ENUM — skipping`,
				)
				continue
			}
			try {
				const parsed = JSON.parse(value) as Partial<StoredKey>
				if (typeof parsed.key !== 'string' || typeof parsed.addedAt !== 'string') {
					this.logger.warn(
						`[provider-key-store] entry '${field}' has invalid shape — skipping`,
					)
					continue
				}
				out.push({
					provider: field as ProviderName,
					preview: redactKey(field as ProviderName, parsed.key),
					addedAt: parsed.addedAt,
				})
			} catch (err) {
				this.logger.warn(
					`[provider-key-store] entry '${field}' JSON parse failed — skipping`,
					err,
				)
			}
		}
		out.sort((a, b) => a.provider.localeCompare(b.provider))
		return out
	}

	/**
	 * INTERNAL ONLY — used by the env-file writer. Returns the full `{ENV_VAR:
	 * raw_key}` shape suitable for emission to `/etc/default/liv-claw-gateway`.
	 * MUST NOT be exposed via the tRPC layer (INV-204-04).
	 *
	 * Corrupt entries are silently dropped; this is the writer's responsibility,
	 * not the operator's. Out-of-enum entries are also dropped.
	 */
	async getAllForEnvFile(): Promise<Record<string, string>> {
		const raw = await this.redis.hgetall(PROVIDER_KEYS_HASH)
		const map: Record<string, string> = {}
		for (const [field, value] of Object.entries(raw ?? {})) {
			if (!(PROVIDER_ENUM as readonly string[]).includes(field)) continue
			try {
				const parsed = JSON.parse(value) as Partial<StoredKey>
				if (typeof parsed.key !== 'string') continue
				const envVar = PROVIDER_ENV_VAR[field as ProviderName]
				if (!envVar) continue
				map[envVar] = parsed.key
			} catch {
				// Same defensive skip as `list()`; writer is best-effort over
				// the current Redis state.
				continue
			}
		}
		return map
	}
}
