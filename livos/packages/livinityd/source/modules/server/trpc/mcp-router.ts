/**
 * Phase 84 V32-MCP — MCP single-source-of-truth tRPC router (Wave 3).
 *
 * Six procedures:
 *   - mcp.search             (privateProcedure query)    — registry search across either source
 *   - mcp.getServer          (privateProcedure query)    — single server detail incl. configSchema
 *   - mcp.installToAgent     (privateProcedure mutation) — append to agents.configured_mcps JSONB
 *   - mcp.removeFromAgent    (privateProcedure mutation) — filter out from configured_mcps
 *   - mcp.smitheryConfigured (publicProcedure query)     — UI gate for the Smithery toggle
 *   - mcp.setSmitheryKey     (adminProcedure mutation)   — admin sets/rotates Redis key
 *
 * D-MCP-SOT (CONTEXT): all MCP UI flows through this router. The legacy
 *   `/api/mcp/*` Express routes in liv core remain (they back the legacy
 *   mcp-panel which is unwired by this phase) but no NEW UI consumes them.
 *
 * D-DUAL-SOURCE (CONTEXT): each search/getServer call carries `source:
 *   'official' | 'smithery'`. The router dispatches to the right client.
 *   The discriminator is persisted on every `configured_mcps` row written
 *   so re-discovery (a future "reinstall" UX) can go back to the right
 *   registry.
 *
 * D-PROCEDURE-HTTP (CONTEXT): all 6 procedure paths added to httpOnlyPaths
 *   in ./common.ts. Smithery/Official HTTP fetches can take seconds;
 *   mutations patch agents.configured_mcps and must survive WS reconnect
 *   after `systemctl restart livos` (memory pitfall B-12 / X-04).
 *
 * D-DEFENSIVE-SMITHERY (CONTEXT): Smithery client throws
 *   SMITHERY_NOT_CONFIGURED when the Redis key is absent. We translate to
 *   TRPCError({code: 'PRECONDITION_FAILED', message: 'Smithery API key
 *   required'}) so the UI can render the "Add API key" tooltip.
 *
 * D-NO-OTHER-LANES (CONTEXT): consumes agents-repo via database/index.ts
 *   barrel; never modifies it. Does NOT touch agents-router.ts (P85-UI
 *   lane), marketplace-router.ts (P86 lane), or liv-core's
 *   mcp-registry-client.ts (preserved as primary source of truth).
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {publicProcedure, privateProcedure, adminProcedure, router} from './trpc.js'
import {
	getPool,
	getAgent,
	updateAgent,
	type ConfiguredMcp,
} from '../../database/index.js'
import {
	McpSmitheryClient,
	SmitheryNotConfiguredError,
	type NormalizedRegistryServer,
	type NormalizedSearchResult,
} from '../../mcp/mcp-smithery-client.js'

// ─── Constants ──────────────────────────────────────────────────────────

const OFFICIAL_REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0.1/servers'
const FETCH_TIMEOUT_MS = 10_000

// ─── Source enum ────────────────────────────────────────────────────────

const sourceSchema = z.enum(['official', 'smithery'])
type McpSource = z.infer<typeof sourceSchema>

// ─── Input schemas ──────────────────────────────────────────────────────

const searchInput = z.object({
	query: z.string().trim().max(200).optional(),
	source: sourceSchema,
	limit: z.number().int().min(1).max(50).optional(),
	offset: z.number().int().min(0).optional(),
})

const getServerInput = z.object({
	serverId: z.string().min(1).max(512),
	source: sourceSchema,
})

const installToAgentInput = z.object({
	agentId: z.string().uuid(),
	serverId: z.string().min(1).max(512),
	source: sourceSchema,
	credentials: z.record(z.string(), z.string()).optional(),
	enabledTools: z.array(z.string().max(256)).max(200),
})

const removeFromAgentInput = z.object({
	agentId: z.string().uuid(),
	serverName: z.string().min(1).max(512),
})

const setSmitheryKeyInput = z.object({
	apiKey: z.string().max(512),
})

// ─── Helpers ────────────────────────────────────────────────────────────

function requirePool() {
	const pool = getPool()
	if (!pool) {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'Database not initialized',
		})
	}
	return pool
}

function requireUser(ctx: {currentUser?: {id: string; username: string; role: string}}) {
	if (!ctx.currentUser) {
		throw new TRPCError({code: 'UNAUTHORIZED', message: 'No authenticated user'})
	}
	return ctx.currentUser
}

/**
 * Maps a SmitheryNotConfiguredError → PRECONDITION_FAILED. Other Errors
 * pass through as INTERNAL_SERVER_ERROR with their original message.
 */
function mapClientError(err: unknown): TRPCError {
	if (err instanceof SmitheryNotConfiguredError || (err instanceof Error && err.name === 'SMITHERY_NOT_CONFIGURED')) {
		return new TRPCError({
			code: 'PRECONDITION_FAILED',
			message: 'Smithery API key required. Add it in Settings > Integrations > Smithery.',
		})
	}
	if (err instanceof TRPCError) return err
	const msg = err instanceof Error ? err.message : String(err)
	return new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: msg})
}

// ─── Official MCP Registry HTTP (kept inline — D-NO-OTHER-LANES forbids ──
//     touching liv-core's mcp-registry-client.ts; this is a livinityd-side
//     fetch wrapper that mirrors the same endpoint contract) ──────────────

interface OfficialRawServer {
	name: string
	description?: string
	version?: string
	repository?: {url?: string; source?: string}
	packages?: Array<{
		registryType: string
		identifier: string
		version?: string
		transport?: {type: string}
		environmentVariables?: Array<{
			name: string
			description?: string
			isSecret?: boolean
		}>
	}>
	remotes?: Array<{type: string; url: string}>
}

interface OfficialRawSearchItem {
	server: OfficialRawServer
	_meta?: Record<string, unknown>
}

interface OfficialRawSearchResponse {
	servers: OfficialRawSearchItem[]
	next_cursor?: string
}

async function fetchOfficialJson<T>(url: string): Promise<T> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {Accept: 'application/json'},
		})
		if (!res.ok) {
			throw new Error(`Official registry error (${res.status}): ${await res.text().catch(() => '')}`)
		}
		return (await res.json()) as T
	} catch (err: unknown) {
		if (err instanceof Error && err.name === 'AbortError') {
			throw new Error(`Official registry timeout after ${FETCH_TIMEOUT_MS}ms`)
		}
		throw err
	} finally {
		clearTimeout(timeout)
	}
}

/**
 * Normalize an Official registry server to the same shape Smithery returns.
 * Synthesizes a `configSchema` from `packages[0].environmentVariables[]`
 * so the UI's credential form renderer is source-agnostic.
 */
function normalizeOfficial(raw: OfficialRawServer): NormalizedRegistryServer {
	const pkg = raw.packages?.[0]
	const envVars = pkg?.environmentVariables ?? []

	const properties: Record<
		string,
		{type: string; description?: string; isSecret?: boolean}
	> = {}
	for (const ev of envVars) {
		properties[ev.name] = {
			type: 'string',
			description: ev.description,
			isSecret: ev.isSecret,
		}
	}

	return {
		name: raw.name,
		qualifiedName: raw.name,
		displayName: raw.name,
		description: raw.description,
		version: raw.version,
		repository: raw.repository,
		// Official registry doesn't expose tools list at search time — UI
		// will fall back to "all tools enabled" with a manual edit affordance.
		tools: [],
		configSchema:
			Object.keys(properties).length > 0
				? {
						properties,
						required: envVars.filter((ev) => ev.isSecret !== false).map((ev) => ev.name),
					}
				: undefined,
		source: 'official',
	}
}

async function searchOfficial(query: string | undefined, limit: number): Promise<NormalizedSearchResult> {
	const params = new URLSearchParams()
	if (query && query.trim().length > 0) params.set('q', query.trim())
	params.set('limit', String(limit))
	const url = `${OFFICIAL_REGISTRY_BASE}?${params.toString()}`
	const raw = await fetchOfficialJson<OfficialRawSearchResponse>(url)
	const servers = (raw.servers ?? []).map((item) => normalizeOfficial(item.server))
	return {servers, hasMore: Boolean(raw.next_cursor)}
}

async function getOfficial(serverName: string): Promise<NormalizedRegistryServer | null> {
	const url = `${OFFICIAL_REGISTRY_BASE}/${encodeURIComponent(serverName)}`
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {Accept: 'application/json'},
		})
		if (res.status === 404) return null
		if (!res.ok) {
			throw new Error(`Official registry error (${res.status}): ${await res.text().catch(() => '')}`)
		}
		const raw = (await res.json()) as OfficialRawSearchItem
		// API returns the nested {server, _meta} shape; unwrap.
		const inner = raw.server ?? (raw as unknown as OfficialRawServer)
		return normalizeOfficial(inner)
	} catch (err: unknown) {
		if (err instanceof Error && err.name === 'AbortError') {
			throw new Error(`Official registry timeout after ${FETCH_TIMEOUT_MS}ms`)
		}
		throw err
	} finally {
		clearTimeout(timeout)
	}
}

// ─── Smithery client factory (per-call; ai.redis lives on livinityd) ────
//
// The merged Context type (express + ws) makes static field-access
// inference cumbersome (the wss branch is a Promise type). We accept `any`
// here for the same reason existing routes (computer-use/routes.ts:31,
// server/index.ts redis reads) do — the field path is stable + tested by
// the running daemon, not the typechecker.

function smitheryClient(ctx: any): McpSmitheryClient {
	return new McpSmitheryClient(ctx.livinityd.ai.redis)
}

// ─── Router definition ──────────────────────────────────────────────────

const mcpRouter = router({
	// ── search ────────────────────────────────────────────────────────────
	// Dispatches to the correct registry client by `source`. Returns a
	// uniform NormalizedSearchResult shape so the UI doesn't branch.
	search: privateProcedure.input(searchInput).query(async ({ctx, input}) => {
		requireUser(ctx)
		const limit = Math.min(Math.max(input.limit ?? 24, 1), 50)
		try {
			if (input.source === 'official') {
				return await searchOfficial(input.query, limit)
			}
			const client = smitheryClient(ctx)
			return await client.searchServers(input.query, limit, input.offset ?? 0)
		} catch (err) {
			throw mapClientError(err)
		}
	}),

	// ── getServer ─────────────────────────────────────────────────────────
	// Returns the full detail incl. credential schema and tool list.
	// Throws NOT_FOUND when the registry returns 404.
	getServer: privateProcedure.input(getServerInput).query(async ({ctx, input}) => {
		requireUser(ctx)
		try {
			let server: NormalizedRegistryServer | null
			if (input.source === 'official') {
				server = await getOfficial(input.serverId)
			} else {
				const client = smitheryClient(ctx)
				server = await client.getServer(input.serverId)
			}
			if (!server) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'MCP server not found in registry'})
			}
			return server
		} catch (err) {
			throw mapClientError(err)
		}
	}),

	// ── installToAgent ────────────────────────────────────────────────────
	// Appends a ConfiguredMcp entry to agents.configured_mcps JSONB. The
	// entry shape matches the agents-repo `ConfiguredMcp` type. We persist
	// `source` so a future "reinstall" UX knows which registry to query.
	installToAgent: privateProcedure
		.input(installToAgentInput)
		.mutation(async ({ctx, input}) => {
			const user = requireUser(ctx)
			const pool = requirePool()

			const agent = await getAgent(pool, input.agentId, user.id)
			if (!agent) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'Agent not found'})
			}
			// Ownership: updateAgent enforces user_id = $userId, so a non-owner
			// (system seed or another user's agent) gets null back. Surface as
			// FORBIDDEN since the get() succeeded but the patch will fail.
			if (agent.userId === null || agent.userId !== user.id) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Cannot install MCP servers on a system or non-owned agent. Clone first.',
				})
			}

			// De-dupe by `name`: replace if already present (treats "install"
			// as upsert). The new entry carries fresh credentials + tool
			// selection. The agents-repo `ConfiguredMcp` type currently has
			// {name, enabledTools} — we extend with `source` and `credentials`
			// at the JSONB level (the column is untyped jsonb so this is safe;
			// the agent-editor reads the extra fields opportunistically).
			const existing = (agent.configuredMcps ?? []).filter((m) => m.name !== input.serverId)
			const next: Array<ConfiguredMcp & {source: McpSource; credentials?: Record<string, string>}> = [
				...existing.map((m) => m as ConfiguredMcp & {source: McpSource; credentials?: Record<string, string>}),
				{
					name: input.serverId,
					enabledTools: input.enabledTools,
					source: input.source,
					credentials: input.credentials,
				},
			]

			const updated = await updateAgent(pool, input.agentId, user.id, {
				// Cast: ConfiguredMcp[] is the repo type; we're storing the
				// extended shape but the repo serializes via JSON.stringify
				// so structural extras pass through untouched.
				configuredMcps: next as unknown as ConfiguredMcp[],
			})
			if (!updated) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'Agent not found or not owned'})
			}
			return updated
		}),

	// ── removeFromAgent ───────────────────────────────────────────────────
	// Filters out the named entry from agents.configured_mcps. Idempotent:
	// removing a name that isn't present is a no-op that still returns the
	// fresh agent row.
	removeFromAgent: privateProcedure
		.input(removeFromAgentInput)
		.mutation(async ({ctx, input}) => {
			const user = requireUser(ctx)
			const pool = requirePool()

			const agent = await getAgent(pool, input.agentId, user.id)
			if (!agent) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'Agent not found'})
			}
			if (agent.userId === null || agent.userId !== user.id) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Cannot modify MCP servers on a system or non-owned agent.',
				})
			}

			const next = (agent.configuredMcps ?? []).filter((m) => m.name !== input.serverName)

			const updated = await updateAgent(pool, input.agentId, user.id, {
				configuredMcps: next,
			})
			if (!updated) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'Agent not found or not owned'})
			}
			return updated
		}),

	// ── smitheryConfigured (public) ───────────────────────────────────────
	// UI gate for the Smithery source pill. Public so the dialog can render
	// pre-auth-resolution. Returns ONLY {configured: boolean} — never the
	// key value or any other detail.
	smitheryConfigured: publicProcedure.query(async ({ctx}) => {
		try {
			const client = smitheryClient(ctx)
			const configured = await client.isConfigured()
			return {configured}
		} catch {
			// Never throw — the gate degrades to "not configured".
			return {configured: false}
		}
	}),

	// ── setSmitheryKey (admin) ────────────────────────────────────────────
	// Admin-only — sets or clears the Smithery API key in Redis. Pass an
	// empty string to clear (which disables the Smithery source entirely).
	setSmitheryKey: adminProcedure.input(setSmitheryKeyInput).mutation(async ({ctx, input}) => {
		try {
			const client = smitheryClient(ctx)
			await client.setApiKey(input.apiKey)
			return {ok: true as const}
		} catch (err) {
			throw mapClientError(err)
		}
	}),
})

export default mcpRouter
