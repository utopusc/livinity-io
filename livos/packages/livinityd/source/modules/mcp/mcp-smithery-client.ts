/**
 * Phase 84 V32-MCP — Secondary MCP registry client (Smithery).
 *
 * Mirrors the API surface of `liv/packages/core/src/mcp-registry-client.ts`
 * (the OFFICIAL registry client) so the v32 BrowseDialog can render servers
 * from either source through a single renderer. Points at server.smithery.ai.
 *
 * D-DEFENSIVE-SMITHERY (CONTEXT D-): API key lives in Redis under
 *   `liv:config:smithery_api_key`. When missing, every method throws a
 *   plain Error whose `name` field is set to `SMITHERY_NOT_CONFIGURED` so
 *   the tRPC router can map it to a clear PRECONDITION_FAILED response and
 *   the UI can render the "Add API key in Settings" tooltip.
 *
 * The shape returned matches `RegistryServer` from
 * `liv/packages/core/src/mcp-types.ts` — Smithery's native shape is
 * normalized at the boundary so the rest of the system never has to reason
 * about which registry a server came from. The only discriminator is
 * `source: 'official' | 'smithery'` carried on `agents.configured_mcps`
 * rows for re-discovery.
 *
 * Hard constraints:
 *   - ZERO modifications to liv core's `mcp-registry-client.ts` (D-NO-OTHER-LANES)
 *   - ZERO new dependencies — uses Node 20+ global fetch + AbortController
 *   - Stateless per-call (Redis read on every method) so a key rotation
 *     surface area need not invalidate any in-process cache. The cost is one
 *     Redis GET per call which is well below the network HTTP latency.
 */

import type {Redis} from 'ioredis'

// ── Public types (mirrors liv/packages/core/src/mcp-types.ts shape) ──────

/**
 * Normalized server shape — same as `RegistryServer` from liv-core's
 * mcp-types but redeclared here to keep livinityd from cross-importing
 * liv-core internals (D-NO-OTHER-LANES).
 *
 * `configSchema` is the synthesized JSON-Schema-shaped object the UI walks
 * to render credential inputs. For Official, the liv-core client exposes
 * `packages[].environmentVariables[]` instead — the v32 mcp-router maps
 * either to this shape at the procedure boundary.
 */
export interface NormalizedRegistryServer {
	name: string
	qualifiedName?: string
	displayName?: string
	description?: string
	version?: string
	repository?: {url?: string; source?: string}
	homepage?: string
	iconUrl?: string
	tags?: string[]
	category?: string
	installCount?: number
	tools?: Array<{name: string; description?: string; required?: boolean}>
	configSchema?: {
		properties: Record<string, {type: string; description?: string; isSecret?: boolean; default?: unknown; enum?: string[]}>
		required?: string[]
	}
	source: 'official' | 'smithery'
}

export interface NormalizedSearchResult {
	servers: NormalizedRegistryServer[]
	total?: number
	hasMore?: boolean
}

// ── Constants ────────────────────────────────────────────────────────────

const SMITHERY_BASE = 'https://server.smithery.ai/v1'
const SMITHERY_REDIS_KEY = 'liv:config:smithery_api_key'
const FETCH_TIMEOUT_MS = 10_000

// ── Errors ───────────────────────────────────────────────────────────────

/**
 * Thrown when the Smithery API key is not configured in Redis.
 * Callers should catch by name (NOT instanceof) to keep the boundary
 * stable across module-boundary serialization quirks (the daemon path
 * can re-throw across worker boundaries).
 */
export class SmitheryNotConfiguredError extends Error {
	constructor(message = 'Smithery API key not configured. Set liv:config:smithery_api_key in Redis.') {
		super(message)
		this.name = 'SMITHERY_NOT_CONFIGURED'
	}
}

// ── Smithery raw API shape (private — only used inside this file) ────────

interface SmitheryRawServer {
	qualifiedName: string
	displayName?: string
	description?: string
	homepage?: string
	iconUrl?: string
	useCount?: number
	tools?: Array<{name: string; description?: string}>
	connections?: Array<{
		type?: string
		configSchema?: {
			type?: string
			properties?: Record<string, {type: string; description?: string; default?: unknown; enum?: string[]}>
			required?: string[]
		}
	}>
	tags?: string[]
}

interface SmitheryRawSearchResponse {
	servers: SmitheryRawServer[]
	pagination?: {totalCount?: number; currentPage?: number; pageSize?: number; totalPages?: number}
}

// ── Normalizer ───────────────────────────────────────────────────────────

function normalize(raw: SmitheryRawServer): NormalizedRegistryServer {
	const conn = raw.connections?.[0]
	const schema = conn?.configSchema

	return {
		name: raw.qualifiedName,
		qualifiedName: raw.qualifiedName,
		displayName: raw.displayName ?? raw.qualifiedName,
		description: raw.description,
		homepage: raw.homepage,
		iconUrl: raw.iconUrl,
		tags: raw.tags,
		installCount: raw.useCount,
		tools: (raw.tools ?? []).map((t) => ({name: t.name, description: t.description})),
		configSchema: schema
			? {
					properties: schema.properties ?? {},
					required: schema.required,
				}
			: undefined,
		source: 'smithery',
	}
}

// ── Client class ─────────────────────────────────────────────────────────

export class McpSmitheryClient {
	constructor(private readonly redis: Redis) {}

	/** Resolve the API key from Redis — throws SmitheryNotConfiguredError when missing/empty. */
	private async getApiKey(): Promise<string> {
		const key = await this.redis.get(SMITHERY_REDIS_KEY)
		if (!key || key.trim().length === 0) {
			throw new SmitheryNotConfiguredError()
		}
		return key.trim()
	}

	/** Public helper used by the tRPC `mcp.smitheryConfigured` query. Never throws. */
	async isConfigured(): Promise<boolean> {
		try {
			const key = await this.redis.get(SMITHERY_REDIS_KEY)
			return Boolean(key && key.trim().length > 0)
		} catch {
			return false
		}
	}

	/**
	 * Set or rotate the API key. Caller (admin tRPC procedure) is responsible
	 * for authorization. Pass an empty string to CLEAR (which then disables
	 * the Smithery source entirely).
	 */
	async setApiKey(apiKey: string): Promise<void> {
		const trimmed = apiKey.trim()
		if (trimmed.length === 0) {
			await this.redis.del(SMITHERY_REDIS_KEY)
			return
		}
		await this.redis.set(SMITHERY_REDIS_KEY, trimmed)
	}

	/**
	 * Search the Smithery registry. Returns normalized server shapes so the
	 * UI doesn't care which registry the result came from.
	 *
	 * @throws SmitheryNotConfiguredError when API key is missing
	 */
	async searchServers(query?: string, limit = 24, offset = 0): Promise<NormalizedSearchResult> {
		const apiKey = await this.getApiKey()

		const page = Math.floor(offset / limit) + 1
		const params = new URLSearchParams()
		if (query && query.trim().length > 0) params.set('q', query.trim())
		params.set('page', String(page))
		params.set('pageSize', String(limit))

		const url = `${SMITHERY_BASE}/registry?${params.toString()}`
		const raw = await this.fetchJson<SmitheryRawSearchResponse>(url, apiKey)

		const servers = (raw.servers ?? []).map(normalize)
		const total = raw.pagination?.totalCount
		const hasMore = total != null ? offset + servers.length < total : servers.length === limit

		return {servers, total, hasMore}
	}

	/**
	 * Fetch a single server by its qualified name (e.g. "@org/server-name").
	 * Returns null when not found.
	 *
	 * @throws SmitheryNotConfiguredError when API key is missing
	 */
	async getServer(qualifiedName: string): Promise<NormalizedRegistryServer | null> {
		const apiKey = await this.getApiKey()
		const url = `${SMITHERY_BASE}/registry/${encodeURIComponent(qualifiedName)}`

		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

		try {
			const res = await fetch(url, {
				signal: controller.signal,
				headers: {
					Accept: 'application/json',
					Authorization: `Bearer ${apiKey}`,
				},
			})
			if (res.status === 404) return null
			if (!res.ok) {
				throw new Error(`Smithery API error (${res.status}): ${await res.text().catch(() => '')}`)
			}
			const raw = (await res.json()) as SmitheryRawServer
			return normalize(raw)
		} catch (err: unknown) {
			if (err instanceof Error && err.name === 'AbortError') {
				throw new Error(`Smithery API timeout after ${FETCH_TIMEOUT_MS}ms`)
			}
			throw err
		} finally {
			clearTimeout(timeout)
		}
	}

	private async fetchJson<T>(url: string, apiKey: string): Promise<T> {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

		try {
			const res = await fetch(url, {
				signal: controller.signal,
				headers: {
					Accept: 'application/json',
					Authorization: `Bearer ${apiKey}`,
				},
			})
			if (!res.ok) {
				throw new Error(`Smithery API error (${res.status}): ${await res.text().catch(() => '')}`)
			}
			return (await res.json()) as T
		} catch (err: unknown) {
			if (err instanceof Error && err.name === 'AbortError') {
				throw new Error(`Smithery API timeout after ${FETCH_TIMEOUT_MS}ms`)
			}
			throw err
		} finally {
			clearTimeout(timeout)
		}
	}
}
