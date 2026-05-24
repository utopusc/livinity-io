/**
 * Phase 202-07 — MCP external server config tRPC router.
 *
 * Provides CRUD over the Redis hash `liv:mcp:config` that backs the
 * `/settings → MCP` tab (D-202-12). The hash uses the server's `name` as the
 * field key; each value is JSON with the shape:
 *
 *   {
 *     name: string,
 *     transport: 'stdio' | 'http',
 *     command?: string,
 *     args?: string[],
 *     url?: string,
 *     env?: Record<string, string>,
 *     enabled: boolean
 *   }
 *
 * The set mirrors the seed at `scripts/install/seeds/mcp-servers.json`.
 *
 * Five adminProcedure-gated routes mounted under `mcp.config.*`:
 *
 *   - mcp.config.list    → McpServerConfig[]
 *   - mcp.config.add     → input {name, transport, command?, args?, url?, env?, enabled} → {ok: true}
 *   - mcp.config.update  → input {name, patch}                                           → {ok: true}
 *   - mcp.config.delete  → input {name}                                                  → {ok: true}
 *   - mcp.config.toggle  → input {name, enabled}                                         → {ok: true}
 *
 * Locks honoured:
 *   D-202-12 — Backed by Redis hash `liv:mcp:config`. Mutations do NOT
 *              hot-reload the running McpBridge (which spawned MCPClient at
 *              boot); UI surfaces a "Changes take effect on next service
 *              restart." banner.
 *   D-202-21 / INV-202-05 — English error messages.
 *   INV-202-02 — Backend additive only; lives in livinityd.
 *   INV-202-08 — Mastra MCP source list unchanged. This router only mutates
 *                the Redis hash; the McpBridge picks up the changes at the
 *                next livinityd boot.
 *
 * Special cases:
 *   - `luse` is the system MCP server (Phase 197-02 / Phase 201) and cannot
 *     be deleted from the UI; the delete route refuses with FORBIDDEN +
 *     `SYSTEM_MCP`. Toggling and editing it is still allowed (operator may
 *     legitimately disable Luse during debugging).
 *   - `add` refuses to clobber an existing name with CONFLICT + `MCP_NAME_TAKEN`
 *     so the dialog can surface "an MCP server with this name already exists".
 *   - `update` / `toggle` / `delete` on a missing name return NOT_FOUND +
 *     `MCP_NOT_FOUND`.
 */

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from './trpc.js'

export const MCP_CONFIG_REDIS_HASH_KEY = 'liv:mcp:config'
export const MCP_CONFIG_REDIS_PUBSUB_CHANNEL = 'liv:mcp:updated'
const REDIS_HASH_KEY = MCP_CONFIG_REDIS_HASH_KEY
const SYSTEM_MCP_NAMES = new Set(['luse'])

/**
 * Minimal Redis surface — `.hgetall`, `.hget`, `.hset`, `.hdel`. Matches both
 * the ioredis runtime and the test mock pattern used elsewhere in this
 * router-family (mastra-router, agent-task-router).
 */
export interface McpConfigRedisClient {
	hgetall(key: string): Promise<Record<string, string>>
	hget(key: string, field: string): Promise<string | null>
	hset(key: string, field: string, value: string): Promise<unknown>
	hdel(key: string, field: string): Promise<unknown>
	/**
	 * Phase 205-03 — publish a notification on `liv:mcp:updated` after every
	 * state-mutating procedure. mcp-bridge subscribes via `redis.duplicate()`
	 * and reconciles its spawned-server map. See SPEC R3 + 205-01 SPIKE-NOTES.
	 */
	publish(channel: string, message: string): Promise<number>
}

/**
 * Phase 205-03 — best-effort publish on `liv:mcp:updated` after every
 * state-mutating procedure. Wrapped so a Redis-side failure never bubbles
 * out of the tRPC mutation (the hash write already succeeded; pub/sub is
 * advisory). Mirrors `native-app-config.ts` publisher template.
 */
async function publishMcpUpdated(
	deps: McpConfigRouterDeps,
	op: 'set' | 'delete',
	name: string,
): Promise<void> {
	try {
		await deps.redis.publish(
			MCP_CONFIG_REDIS_PUBSUB_CHANNEL,
			JSON.stringify({op, name, ts: new Date().toISOString()}),
		)
	} catch (err) {
		deps.logger.warn(`[mcp-config] failed to publish ${MCP_CONFIG_REDIS_PUBSUB_CHANNEL} for '${name}'`, err)
	}
}

export interface McpConfigRouterDeps {
	redis: McpConfigRedisClient
	logger: {
		info: (msg: string) => void
		warn: (msg: string, error?: unknown) => void
	}
}

/**
 * Persisted shape of one MCP server config. Matches
 * `scripts/install/seeds/mcp-servers.json` (with `installedAt` / `description`
 * dropped — those are seed-only metadata, not part of the runtime contract).
 */
export interface McpServerConfig {
	name: string
	transport: 'stdio' | 'http'
	command?: string
	args?: string[]
	url?: string
	env?: Record<string, string>
	enabled: boolean
	/** True for `luse` and any other entry in SYSTEM_MCP_NAMES. UI uses this to hide Delete. */
	system: boolean
}

const NameSchema = z
	.string()
	.trim()
	.min(1, 'name required')
	.max(64, 'name too long (max 64 chars)')
	.regex(/^[a-zA-Z0-9_-]+$/, 'name must be alphanumeric, dash or underscore only')

const TransportSchema = z.enum(['stdio', 'http'])

/**
 * Body schema for `add` + the patch payload of `update`. The transport-specific
 * fields (`command`/`args` vs `url`) are NOT discriminated at the zod layer —
 * the McpBridge ignores irrelevant fields at boot, so we keep the schema
 * permissive and let the UI shape the payload. Defense-in-depth: the runtime
 * `McpServerConfig` type narrows fields per-transport.
 */
const ServerBodySchema = z.object({
	transport: TransportSchema,
	command: z.string().trim().max(512).optional(),
	args: z.array(z.string().max(1024)).max(64).optional(),
	url: z.string().trim().max(2048).optional(),
	env: z.record(z.string().max(128), z.string().max(2048)).optional(),
	enabled: z.boolean(),
})

const AddInput = ServerBodySchema.extend({name: NameSchema})
const UpdateInput = z.object({name: NameSchema, patch: ServerBodySchema.partial()})
const DeleteInput = z.object({name: NameSchema})
const ToggleInput = z.object({name: NameSchema, enabled: z.boolean()})

/**
 * Parse a JSON-encoded value from the hash. On malformed JSON, log and skip
 * (returning null) so a single corrupt entry doesn't brick the whole tab.
 */
export function parseEntry(name: string, raw: string, logger: McpConfigRouterDeps['logger']): McpServerConfig | null {
	try {
		const parsed = JSON.parse(raw) as Partial<McpServerConfig>
		const transport = parsed.transport
		if (transport !== 'stdio' && transport !== 'http') {
			logger.warn(`[mcp-config] entry '${name}' has invalid transport — skipping`)
			return null
		}
		return {
			name,
			transport,
			command: typeof parsed.command === 'string' ? parsed.command : undefined,
			args: Array.isArray(parsed.args) ? parsed.args.filter((a): a is string => typeof a === 'string') : undefined,
			url: typeof parsed.url === 'string' ? parsed.url : undefined,
			env: parsed.env && typeof parsed.env === 'object' ? (parsed.env as Record<string, string>) : undefined,
			enabled: Boolean(parsed.enabled),
			system: SYSTEM_MCP_NAMES.has(name),
		}
	} catch (err) {
		logger.warn(`[mcp-config] entry '${name}' JSON parse failed — skipping`, err)
		return null
	}
}

/**
 * Serialize the user-supplied body to the JSON shape we persist in the hash.
 * `system` is NOT persisted (it's a runtime-computed flag); the rest of the
 * fields are.
 */
function serializeBody(body: z.infer<typeof ServerBodySchema>): string {
	const payload: Record<string, unknown> = {
		transport: body.transport,
		enabled: body.enabled,
	}
	if (body.command !== undefined) payload.command = body.command
	if (body.args !== undefined) payload.args = body.args
	if (body.url !== undefined) payload.url = body.url
	if (body.env !== undefined) payload.env = body.env
	return JSON.stringify(payload)
}

export function createMcpConfigRouter(deps: McpConfigRouterDeps) {
	return router({
		// ── list ───────────────────────────────────────────────────────────────
		// Read every field of the hash. Returns an array sorted alphabetically
		// so the UI render is deterministic between calls.
		list: adminProcedure.query(async () => {
			const raw = await deps.redis.hgetall(REDIS_HASH_KEY)
			const entries: McpServerConfig[] = []
			for (const [name, value] of Object.entries(raw ?? {})) {
				const parsed = parseEntry(name, value, deps.logger)
				if (parsed) entries.push(parsed)
			}
			entries.sort((a, b) => a.name.localeCompare(b.name))
			return entries
		}),

		// ── add ────────────────────────────────────────────────────────────────
		// HSETNX-equivalent: reject if the field already exists. Surfaces
		// CONFLICT + MCP_NAME_TAKEN so the AddMcpServerDialog can render
		// "An MCP server with this name already exists" inline under the Name
		// field.
		add: adminProcedure.input(AddInput).mutation(async ({input}) => {
			const existing = await deps.redis.hget(REDIS_HASH_KEY, input.name)
			if (existing !== null && existing !== undefined) {
				throw new TRPCError({
					code: 'CONFLICT',
					message: `MCP_NAME_TAKEN: An MCP server named '${input.name}' already exists.`,
				})
			}
			const {name: _ignored, ...body} = input
			await deps.redis.hset(REDIS_HASH_KEY, input.name, serializeBody(body))
			deps.logger.info(`[mcp-config] added external MCP server '${input.name}'`)
			await publishMcpUpdated(deps, 'set', input.name)
			return {ok: true as const}
		}),

		// ── update ─────────────────────────────────────────────────────────────
		// Read-modify-write merge. If the field is missing, surface NOT_FOUND +
		// MCP_NOT_FOUND. The patch is merged at the runtime-shape layer so callers
		// can send only the fields they care about (transport-switch is allowed
		// when the caller supplies the matching `command`/`args` or `url`).
		update: adminProcedure.input(UpdateInput).mutation(async ({input}) => {
			const existing = await deps.redis.hget(REDIS_HASH_KEY, input.name)
			if (existing === null || existing === undefined) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: `MCP_NOT_FOUND: No MCP server named '${input.name}'.`,
				})
			}
			const current = parseEntry(input.name, existing, deps.logger)
			if (!current) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `MCP_CORRUPT: Stored entry for '${input.name}' could not be parsed.`,
				})
			}
			const merged: z.infer<typeof ServerBodySchema> = {
				transport: input.patch.transport ?? current.transport,
				command: input.patch.command !== undefined ? input.patch.command : current.command,
				args: input.patch.args !== undefined ? input.patch.args : current.args,
				url: input.patch.url !== undefined ? input.patch.url : current.url,
				env: input.patch.env !== undefined ? input.patch.env : current.env,
				enabled: input.patch.enabled !== undefined ? input.patch.enabled : current.enabled,
			}
			await deps.redis.hset(REDIS_HASH_KEY, input.name, serializeBody(merged))
			deps.logger.info(`[mcp-config] updated MCP server '${input.name}'`)
			await publishMcpUpdated(deps, 'set', input.name)
			return {ok: true as const}
		}),

		// ── delete ─────────────────────────────────────────────────────────────
		// Refuses to delete system MCP servers (currently just 'luse'). Surfaces
		// FORBIDDEN + SYSTEM_MCP so the UI never even renders the Delete button
		// for those rows — but defense-in-depth still rejects at the server.
		delete: adminProcedure.input(DeleteInput).mutation(async ({input}) => {
			if (SYSTEM_MCP_NAMES.has(input.name)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: `SYSTEM_MCP: '${input.name}' is a system MCP server and cannot be deleted.`,
				})
			}
			const existing = await deps.redis.hget(REDIS_HASH_KEY, input.name)
			if (existing === null || existing === undefined) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: `MCP_NOT_FOUND: No MCP server named '${input.name}'.`,
				})
			}
			await deps.redis.hdel(REDIS_HASH_KEY, input.name)
			deps.logger.info(`[mcp-config] deleted MCP server '${input.name}'`)
			await publishMcpUpdated(deps, 'delete', input.name)
			return {ok: true as const}
		}),

		// ── toggle ─────────────────────────────────────────────────────────────
		// Convenience helper — patches only the `enabled` field. Equivalent to
		// `update({name, patch: {enabled}})` but keeps the wire-level
		// audit log entry distinct.
		toggle: adminProcedure.input(ToggleInput).mutation(async ({input}) => {
			const existing = await deps.redis.hget(REDIS_HASH_KEY, input.name)
			if (existing === null || existing === undefined) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: `MCP_NOT_FOUND: No MCP server named '${input.name}'.`,
				})
			}
			const current = parseEntry(input.name, existing, deps.logger)
			if (!current) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `MCP_CORRUPT: Stored entry for '${input.name}' could not be parsed.`,
				})
			}
			const merged: z.infer<typeof ServerBodySchema> = {
				transport: current.transport,
				command: current.command,
				args: current.args,
				url: current.url,
				env: current.env,
				enabled: input.enabled,
			}
			await deps.redis.hset(REDIS_HASH_KEY, input.name, serializeBody(merged))
			deps.logger.info(
				`[mcp-config] toggled MCP server '${input.name}' → ${input.enabled ? 'enabled' : 'disabled'}`,
			)
			await publishMcpUpdated(deps, 'set', input.name)
			return {ok: true as const}
		}),
	})
}

/**
 * Empty-injection stub mirroring the chromeMaster / xaiAuth / mastra pattern.
 * Boot wire-up at livinityd/source/index.ts swaps this for a real
 * createMcpConfigRouter({redis, logger}) build via setProductionAppRouter.
 * Until then, calls throw PRECONDITION_FAILED via the helper.
 */
const notInjected = (): never => {
	throw new TRPCError({
		code: 'PRECONDITION_FAILED',
		message: 'mcp-config-router not yet injected — livinityd boot did not wire the Redis client',
	})
}

export const mcpConfigRouter = router({
	list: adminProcedure.query(() => notInjected()),
	add: adminProcedure.input(AddInput).mutation(() => notInjected()),
	update: adminProcedure.input(UpdateInput).mutation(() => notInjected()),
	delete: adminProcedure.input(DeleteInput).mutation(() => notInjected()),
	toggle: adminProcedure.input(ToggleInput).mutation(() => notInjected()),
})

export type McpConfigRouter = ReturnType<typeof createMcpConfigRouter>
