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

import type {
	OpenclawConfigStore,
	OpenclawMcpServerConfig,
} from '../../openclawos/openclaw-config-store.js'
import {MCP_CATALOG, type McpCatalogEntry} from './mcp-catalog-data.js'
import {
	readSystemMcpCatalog,
	seedAionUiMcpConfig,
	type SeedRedisClient,
} from '../../mcp-registrar/index.js'
import {SUPPORTED_CLIS_SET} from '../../cli-installer/install-scripts.js'
import type {CliName} from '../../cli-installer/types.js'
import type {LivMcpDef, WriteLivMcpsToCliResult} from '../../cli-installer/mcp-writer.js'
import {adminProcedure, router} from './trpc.js'

export const MCP_CONFIG_REDIS_HASH_KEY = 'liv:mcp:config'
export const MCP_CONFIG_REDIS_PUBSUB_CHANNEL = 'liv:mcp:updated'
const REDIS_HASH_KEY = MCP_CONFIG_REDIS_HASH_KEY
// Phase 219 T3 — luse + 4 local LivOS MCP servers (liv-docker / liv-system /
// liv-apps / liv-vault). System MCPs cannot be deleted from the UI (the
// router refuses with FORBIDDEN + SYSTEM_MCP). Toggling + editing still
// allowed so operators can disable a server during debugging.
const SYSTEM_MCP_NAMES = new Set(['luse', 'liv-docker', 'liv-system', 'liv-apps', 'liv-vault'])

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
	/**
	 * Phase 207 UAT 2026-05-24 round 4 — get/set a single string key for the
	 * runtime-toggles store (Redis SET / GET). Used for the auto-approve
	 * persistence (`liv:config:auto_approve_destructive`). Optional so the
	 * ioredis instance with the full API satisfies the type while a
	 * minimal test mock can omit the methods (the consuming routes
	 * gracefully degrade to in-memory only when set/get are absent).
	 */
	set?(key: string, value: string): Promise<unknown>
	get?(key: string): Promise<string | null>
	/**
	 * Phase 219 T1 — TYPE + DEL needed for STRING→HASH self-healing migration.
	 * Optional so the test mock can omit them when not relevant; production
	 * ioredis exposes both. Without these, ensureHashPrimitive() short-circuits
	 * to a no-op (router still works on already-HASH keys but cannot recover a
	 * stale STRING from pre-218 deploys).
	 */
	type?(key: string): Promise<string>
	del?(key: string): Promise<unknown>
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

/**
 * Phase 219 T1 — STRING→HASH self-healing migration for the tRPC router.
 *
 * The Phase 109 install seed historically did `SET liv:mcp:config "<json>"`,
 * which left the key as a Redis STRING. The router uses HASH operations
 * (HGETALL/HSET/HGET/HDEL), so the first mutation on a freshly-installed box
 * threw WRONGTYPE — surfacing as "Add failed (HTTP 500)" in the operator's
 * UI. Phase 218 T6 added an equivalent migration in liv-core's
 * `McpConfigManager.ensureHashPrimitive()`, but livinityd's tRPC router has
 * its own minimal Redis surface and never crossed that path.
 *
 * Mirrors `McpConfigManager.ensureHashPrimitive`:
 *   - TYPE check; no-op on every type other than 'string'
 *   - Parse the legacy `{mcpServers: {...}}` JSON, DEL the STRING, HSET each
 *     server entry into the canonical HASH
 *   - Fail-open: on any failure, log + DEL so subsequent HSET succeeds
 *
 * Optional `type`/`del` on the Redis client means tests that mock only the
 * hash surface still work — the function short-circuits when the type probe
 * isn't available.
 */
async function ensureHashPrimitive(deps: McpConfigRouterDeps): Promise<void> {
	const {redis, logger} = deps
	if (typeof redis.type !== 'function' || typeof redis.del !== 'function') return
	let kind: string
	try {
		kind = await redis.type(REDIS_HASH_KEY)
	} catch (err) {
		logger.warn(`[mcp-config] TYPE check failed for ${REDIS_HASH_KEY}`, err)
		return
	}
	if (kind !== 'string') return

	try {
		const get = redis.get
		const raw = typeof get === 'function' ? await get.call(redis, REDIS_HASH_KEY) : null
		if (!raw) {
			await redis.del(REDIS_HASH_KEY)
			logger.info(`[mcp-config] cleared empty STRING at ${REDIS_HASH_KEY}`)
			return
		}
		const parsed = JSON.parse(raw) as {mcpServers?: Record<string, unknown>; servers?: Record<string, unknown>}
		const servers =
			parsed.mcpServers && typeof parsed.mcpServers === 'object'
				? parsed.mcpServers
				: parsed.servers && typeof parsed.servers === 'object'
					? parsed.servers
					: {}
		await redis.del(REDIS_HASH_KEY)
		let migrated = 0
		for (const [name, val] of Object.entries(servers)) {
			if (!val || typeof val !== 'object') continue
			await redis.hset(REDIS_HASH_KEY, name, JSON.stringify(val))
			migrated++
		}
		logger.info(`[mcp-config] migrated ${REDIS_HASH_KEY} STRING → HASH (${migrated} servers)`)
	} catch (err) {
		logger.warn(`[mcp-config] STRING→HASH migration failed for ${REDIS_HASH_KEY}, deleting key to recover`, err)
		try {
			await redis.del(REDIS_HASH_KEY)
		} catch {
			/* swallow — already logged */
		}
	}
}

export interface McpConfigRouterDeps {
	redis: McpConfigRedisClient
	logger: {
		info: (msg: string) => void
		warn: (msg: string, error?: unknown) => void
	}
	/**
	 * Phase 207 R1 — openclaw.json mirror.
	 *
	 * Optional handle to `/opt/livos/data/openclaw/openclaw.json`. When
	 * present, every mutation (add/update/delete/toggle) is mirrored to the
	 * config file's `mcp.servers.<name>` field so the openclaw gateway
	 * live-reloads it (Probe A6, 205-01 SPIKE) and spawns the corresponding
	 * MCP runtime. Without this dep configured MCP servers stay in Redis
	 * only and the chat agent never sees their tools — that was the operator
	 * UAT failure on 2026-05-24 ("MCP ile ilgili özel araçlar bulunmuyor").
	 *
	 * Optional so unit tests can omit it and so livinityd boot can fall back
	 * to Redis-only when `OpenclawConfigStore` construction fails (path
	 * missing, permission denied). All mirror calls fail-open: a write
	 * failure is logged but never bubbles a TRPCError because the Redis
	 * write already succeeded and the UI must reflect the authoritative
	 * state.
	 */
	openclawConfigStore?: OpenclawConfigStore
	/**
	 * Phase 207 R1 — system MCP servers we never mirror.
	 *
	 * `luse` is the built-in OS bridge wired by the claw-plugin process
	 * itself, NOT a remote MCP server openclaw spawns. Adding it to
	 * `mcp.servers` would cause openclaw to try and double-spawn it. The
	 * router filters these names out of every mirror.
	 */
	mirrorSkipNames?: ReadonlySet<string>
	/**
	 * Phase 207 UAT 2026-05-24 round 4 — runtime auto-approve toggle hook.
	 *
	 * Operator quote (last frustrated request): "LuseMCP yi Onayli
	 * calisiyor ya bunun icin bir ayar olustur Sormadan onay istemeden
	 * devam etmesini ayarlayabilmemiz icin." (Add a setting for LuseMCP
	 * so we can configure it to continue without asking approval.)
	 *
	 * When this callback is wired (boot wire-up in livinityd/source/
	 * index.ts), the `setAutoApprove` mutation forwards the new value to
	 * the in-process ApprovalManager so the change takes effect on the
	 * NEXT destructive-tool call — no restart needed. Without the
	 * callback the mutation only persists to Redis (`liv:config:auto_-
	 * approve_destructive`); a subsequent restart reads Redis and
	 * re-seeds the resolver via the env-var pathway.
	 */
	onAutoApproveChanged?: (enabled: boolean) => void
	/**
	 * Phase 207 UAT 2026-05-24 round 4 — read the live boolean for the
	 * `getAutoApprove` query. Boot wires this to `approvalManager.
	 * getAutoApprove()` so the Settings checkbox seeds with the actual
	 * runtime state (which may be true via env var even before any
	 * mutation lands).
	 */
	getAutoApprove?: () => boolean
	/**
	 * Liv-MCP CLI-picker — DI seam for `installLivMcpsToCli`. Prod (livinityd
	 * boot) wires a wrapper that calls `writeLivMcpsToCli` (cli-installer/
	 * mcp-writer.ts) with the live desktop-user home dir + fs, so the router
	 * stays fs-free + unit-testable (mirrors the cli-installer-router
	 * writeApiKeyFn pattern). The whitelist guard on `cli` (the D-239-07 RCE
	 * boundary) runs in the PROC before this is ever called. When unset, the
	 * proc throws PRECONDITION_FAILED (boot did not wire the writer).
	 */
	writeLivMcpsToCliFn?: (input: {
		cli: CliName
		servers: LivMcpDef[]
	}) => Promise<WriteLivMcpsToCliResult>
}

/** Phase 207 UAT 2026-05-24 round 4 — Redis key for the persisted toggle. */
export const AUTO_APPROVE_REDIS_KEY = 'liv:config:auto_approve_destructive'

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
 * Phase 207 R1 — translate the LivOS-shape MCP body into the openclaw-shape
 * server-config the gateway expects in `mcp.servers.<name>`. Returns `null`
 * when the entry is disabled — disabled servers are dropped from openclaw.json
 * so the gateway doesn't spawn them, matching the McpBridge semantics
 * (`mcp-bridge.ts` skips entries with `enabled === false`).
 */
function toOpenclawMcpServerConfig(
	body: z.infer<typeof ServerBodySchema>,
): OpenclawMcpServerConfig | null {
	if (!body.enabled) return null
	const out: OpenclawMcpServerConfig = {}
	if (body.transport === 'stdio') {
		if (body.command !== undefined) out.command = body.command
		if (body.args !== undefined) out.args = body.args
		if (body.env !== undefined) out.env = body.env
	} else if (body.transport === 'http') {
		if (body.url !== undefined) out.url = body.url
	}
	return out
}

/**
 * Phase 207 R1 — mirror one `mcp.config.*` mutation to openclaw.json.
 *
 * Fail-open: never throws. A failure is logged with the operator-readable
 * reason so the SettingsDialog → MCP tab still surfaces the Redis truth even
 * if the openclaw config file is unwritable.
 *
 * Phase 219 T1 — returns a warning string when the mirror fails so the
 * caller can surface it in the mutation's `warnings` array. The operator
 * sees "MCP added — but openclaw.json mirror failed (chat agent will not
 * see this server until next boot)" instead of a silent server-side log.
 */
async function mirrorMcpEntryToOpenclawJson(
	deps: McpConfigRouterDeps,
	op: 'set' | 'delete',
	name: string,
	body: z.infer<typeof ServerBodySchema> | null,
): Promise<string | null> {
	const store = deps.openclawConfigStore
	if (!store) return null
	if (deps.mirrorSkipNames?.has(name)) return null
	try {
		store.patch((cfg) => {
			if (!cfg.mcp) cfg.mcp = {}
			if (!cfg.mcp.servers) cfg.mcp.servers = {}
			if (op === 'delete') {
				delete cfg.mcp.servers[name]
				return
			}
			const projection = body ? toOpenclawMcpServerConfig(body) : null
			if (projection === null) {
				delete cfg.mcp.servers[name]
				return
			}
			cfg.mcp.servers[name] = projection
		})
		deps.logger.info(
			`[mcp-config] mirrored '${name}' to openclaw.json mcp.servers (op=${op})`,
		)
		return null
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err)
		deps.logger.warn(
			`[mcp-config] mirror to openclaw.json failed for '${name}' (op=${op}) — chat agent may not see this server until openclaw.json catches up`,
			err,
		)
		return `openclaw.json mirror failed: ${reason}. Server saved to Redis but the chat agent will not see it until openclaw.json catches up.`
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
			await ensureHashPrimitive(deps)
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
			await ensureHashPrimitive(deps)
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
			const warning = await mirrorMcpEntryToOpenclawJson(deps, 'set', input.name, body)
			return {ok: true as const, warnings: warning ? [warning] : []}
		}),

		// ── update ─────────────────────────────────────────────────────────────
		// Read-modify-write merge. If the field is missing, surface NOT_FOUND +
		// MCP_NOT_FOUND. The patch is merged at the runtime-shape layer so callers
		// can send only the fields they care about (transport-switch is allowed
		// when the caller supplies the matching `command`/`args` or `url`).
		update: adminProcedure.input(UpdateInput).mutation(async ({input}) => {
			await ensureHashPrimitive(deps)
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
			const warning = await mirrorMcpEntryToOpenclawJson(deps, 'set', input.name, merged)
			return {ok: true as const, warnings: warning ? [warning] : []}
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
			await ensureHashPrimitive(deps)
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
			const warning = await mirrorMcpEntryToOpenclawJson(deps, 'delete', input.name, null)
			return {ok: true as const, warnings: warning ? [warning] : []}
		}),

		// ── toggle ─────────────────────────────────────────────────────────────
		// Convenience helper — patches only the `enabled` field. Equivalent to
		// `update({name, patch: {enabled}})` but keeps the wire-level
		// audit log entry distinct.
		toggle: adminProcedure.input(ToggleInput).mutation(async ({input}) => {
			await ensureHashPrimitive(deps)
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
			const warning = await mirrorMcpEntryToOpenclawJson(deps, 'set', input.name, merged)
			return {ok: true as const, warnings: warning ? [warning] : []}
		}),

		// ── catalog ────────────────────────────────────────────────────────────
		// Phase 219 T2 — read-only curated MCP catalog rendered by the
		// `/settings → MCP → Add → Browse` picker. Returns the catalog sorted
		// alphabetically (matches list's sort for UI consistency). System
		// entries (luse, liv-*) are filtered OUT because they're auto-seeded
		// and cannot be deleted — offering them in the Add form would let
		// operators stack duplicates.
		catalog: adminProcedure.query(async (): Promise<McpCatalogEntry[]> => {
			return [...MCP_CATALOG]
				.filter((entry) => !entry.system)
				.sort((a, b) => a.name.localeCompare(b.name))
		}),

		// ── installLivTools ──────────────────────────────────────────────────
		// One-click: push Liv's 5 system MCPs (luse, liv-system, liv-vault,
		// liv-apps, liv-docker) into AionUi on demand + distribute them to every
		// installed CLI agent. Reuses the Phase-241 boot seed in FORCE mode (skips
		// the boot sentinel — neither read nor written — but the per-server
		// GET-and-skip keeps it idempotent, so re-clicks never duplicate).
		// Powers the "One-Click: Install Liv MCPs" button injected into AionUi's
		// MCP config dialog by scripts/aionui-patches/install-liv-mcps-section.js.
		//
		// Source of truth = the Redis hash liv:mcp:config (same as the boot seed).
		// An empty catalog (install seed never ran) returns emptyCatalog:true so
		// the UI can tell the operator to reinstall instead of silently no-oping.
		installLivTools: adminProcedure.mutation(async () => {
			const aionUiBaseUrl = process.env.AIONUI_BASE_URL ?? 'http://127.0.0.1:3020'
			// Adapt the router's Redis surface to the seed's SeedRedisClient. In
			// force mode the seed never touches the sentinel, so the get/set
			// fallbacks below are inert; only hgetall (catalog read) is exercised.
			const seedRedis: SeedRedisClient = {
				hgetall: (k) => deps.redis.hgetall(k),
				get: (k) => (deps.redis.get ? deps.redis.get(k) : Promise.resolve(null)),
				set: (k, v) => (deps.redis.set ? deps.redis.set(k, v) : Promise.resolve(undefined)),
			}
			const r = await seedAionUiMcpConfig({
				redis: seedRedis,
				aionUiBaseUrl,
				force: true,
				logger: {
					info: (msg) => deps.logger.info(msg),
					warn: (msg, err) => deps.logger.warn(msg, err),
					error: (msg, err) => deps.logger.warn(msg, err),
				},
			})
			deps.logger.info(
				`[mcp-config] installLivTools (created=${r.created} skipped=${r.skipped} errored=${r.errored}${r.emptyCatalog ? ' EMPTY_CATALOG' : ''})`,
			)
			return {
				ok: true as const,
				created: r.created,
				skipped: r.skipped,
				errored: r.errored,
				emptyCatalog: r.emptyCatalog === true,
			}
		}),

		// ── installLivMcpsToCli ──────────────────────────────────────────────
		// Liv-MCP CLI-picker: write the 5 Liv system MCPs (luse, liv-system,
		// liv-apps, liv-vault, liv-docker) into ONE chosen CLI's OWN config file
		// (e.g. claude → ~/.claude.json mcpServers) so that running that CLI in a
		// terminal sees the Liv tools. Powers the per-CLI rows in the "One-Click:
		// Install Liv MCPs" picker (scripts/aionui-patches/install-liv-mcps-section.js).
		//
		// Whitelist guard FIRST (D-239-07 RCE boundary): cli MUST be one of the 20
		// SUPPORTED_CLIS names — rejected BEFORE any fs path is built. Source of
		// truth for the MCP defs = the Redis hash liv:mcp:config (same as
		// installLivTools / the boot seed), so the env (LIV_API_KEY etc.) is the
		// already-resolved install-time value, never re-derived here.
		installLivMcpsToCli: adminProcedure
			.input(z.object({cli: z.string().trim().min(1).max(64)}))
			.mutation(async ({input}) => {
				if (!SUPPORTED_CLIS_SET.has(input.cli as CliName)) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: `CLI_NOT_SUPPORTED: '${input.cli}' is not a known CLI agent (D-239-07 RCE boundary).`,
					})
				}
				const cli = input.cli as CliName
				if (!deps.writeLivMcpsToCliFn) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message:
							'installLivMcpsToCli requires production wire-up (writeLivMcpsToCliFn DI seam unfilled — home/fs missing)',
					})
				}
				let targets
				try {
					targets = await readSystemMcpCatalog(deps.redis, {
						info: deps.logger.info,
						warn: deps.logger.warn,
						error: (msg, err) => deps.logger.warn(msg, err),
					})
				} catch (err) {
					deps.logger.warn(
						'[mcp-config] installLivMcpsToCli — failed to read liv:mcp:config',
						err,
					)
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: 'Failed to read the Liv MCP catalog from Redis.',
					})
				}
				if (targets.length === 0) {
					deps.logger.warn(
						`[mcp-config] installLivMcpsToCli cli=${cli} — EMPTY liv:mcp:config catalog (install seed missing)`,
					)
					return {
						ok: true as const,
						cli,
						supported: true,
						emptyCatalog: true,
						written: [] as string[],
						skippedExisting: [] as string[],
					}
				}
				const servers: LivMcpDef[] = targets.map((t) => ({
					name: t.name,
					transport: t.cfg.transport,
					command: t.cfg.command,
					args: t.cfg.args,
					env: t.cfg.env,
					url: t.cfg.url,
				}))
				const r = await deps.writeLivMcpsToCliFn({cli, servers})
				deps.logger.info(
					`[mcp-config] installLivMcpsToCli cli=${cli} supported=${r.supported} written=${r.written.length} skipped=${r.skippedExisting.length}${r.path ? ` path=${r.path}` : ''}`,
				)
				return {
					ok: r.ok,
					cli,
					supported: r.supported,
					path: r.path,
					written: r.written,
					skippedExisting: r.skippedExisting,
					emptyCatalog: false as const,
				}
			}),

		// ── getAutoApprove ─────────────────────────────────────────────────────
		// Phase 207 UAT 2026-05-24 round 4 — read the live auto-approve flag.
		// Returns false when no override is set AND the env var is unset.
		// The Settings checkbox seeds with this value.
		getAutoApprove: adminProcedure.query(async () => {
			if (deps.getAutoApprove) {
				return {enabled: deps.getAutoApprove() as boolean}
			}
			// Fallback: read Redis directly (boot didn't wire the live getter).
			if (deps.redis.get) {
				try {
					const raw = await deps.redis.get(AUTO_APPROVE_REDIS_KEY)
					return {enabled: raw === 'true' || raw === '1'}
				} catch {
					return {enabled: false}
				}
			}
			return {enabled: false}
		}),

		// ── setAutoApprove ─────────────────────────────────────────────────────
		// Phase 207 UAT 2026-05-24 round 4 — flip the destructive-tool
		// approval gate. Persists to Redis AND forwards to the live
		// ApprovalManager via deps.onAutoApproveChanged so the next
		// `requestSync()` call picks up the change without a restart.
		setAutoApprove: adminProcedure
			.input(z.object({enabled: z.boolean()}))
			.mutation(async ({input}) => {
				// Persist first (so the next boot picks up the choice).
				if (deps.redis.set) {
					try {
						await deps.redis.set(
							AUTO_APPROVE_REDIS_KEY,
							input.enabled ? 'true' : 'false',
						)
					} catch (err) {
						deps.logger.warn(
							`[mcp-config] persisting auto-approve to Redis failed (runtime override still applies for this process)`,
							err,
						)
					}
				}
				// Forward to the live ApprovalManager (best-effort).
				if (deps.onAutoApproveChanged) {
					try {
						deps.onAutoApproveChanged(input.enabled)
					} catch (err) {
						deps.logger.warn(
							`[mcp-config] onAutoApproveChanged callback failed`,
							err,
						)
					}
				}
				deps.logger.info(
					`[mcp-config] auto-approve destructive tool calls → ${input.enabled ? 'ENABLED' : 'disabled'}`,
				)
				return {ok: true as const, enabled: input.enabled}
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
	// Phase 219 T2 — catalog needs no Redis surface; provide a real impl
	// even in the empty-injection stub so the picker keeps working before
	// boot wires the Redis-backed routes. Mirrors the production catalog
	// route 1:1.
	catalog: adminProcedure.query(async (): Promise<McpCatalogEntry[]> => {
		return [...MCP_CATALOG]
			.filter((entry) => !entry.system)
			.sort((a, b) => a.name.localeCompare(b.name))
	}),
	getAutoApprove: adminProcedure.query(() => notInjected()),
	setAutoApprove: adminProcedure
		.input(z.object({enabled: z.boolean()}))
		.mutation(() => notInjected()),
})

export type McpConfigRouter = ReturnType<typeof createMcpConfigRouter>
