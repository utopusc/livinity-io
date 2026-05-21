// Phase 176-02 — Liv MCP tool registration.
//
// Registers 6 tools on a McpServer-compatible instance so Liv's Claude Code
// session can mutate the vault and emit UI side-effects.
//
// Security:
//   - Every tool input validated via Zod .strict() before dispatch (T-176-02-01).
//   - No shell-out — all mutations go through the typed opts.trpcCaller surface.
//   - Audit: every invocation appends to Redis list liv:audit:liv-tools (T-176-02-02).
//   - Audit log trimmed to last 1000 entries after every rpush (T-176-02-05).
//   - open_item payload is {itemId} only — no PII forwarded (T-176-02-03).
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + all Phase 162/171/175 sacred files UNCHANGED.
// This file is NEW (additive only).

import {z} from 'zod'
import type {Redis} from 'ioredis'
import type {AgentRunner} from '../agent-runner.js'
// Phase 189-03 — conditional agent setup tool registration (additive).
import {registerAgentSetupTools} from './agent-setup-tools.js'

// ── Shared Zod shapes ────────────────────────────────────────────────────────
// Mirror vault-items-router.ts ID_RE (T-176-02-01: reject path traversal / NUL injection).
const ID_RE = /^[0-9A-Za-z_-]{20,}$/
const safeId = z.string().regex(ID_RE)

// ── Public surface ────────────────────────────────────────────────────────────

export const LIV_TOOL_NAMES = [
	'create_item',
	'list_items',
	'move_item',
	'archive_item',
	'open_item',
	'run_agent',
] as const

export type LivToolName = (typeof LIV_TOOL_NAMES)[number]

export interface LivToolsOptions {
	trpcCaller: {
		vault: {
			items: {
				create: (input: {
					type: string
					name: string
					parentId?: string | null
					cwd?: string
					schedule?: string
					ccSessionId?: string
				}) => Promise<unknown>
				list: (input?: {archived?: boolean; parentId?: string | null}) => Promise<unknown>
				move: (input: {id: string; newParentId: string | null}) => Promise<unknown>
				archive: (input: {id: string}) => Promise<unknown>
			}
		}
	}
	redis: Redis
	/** Phase 177-02 — wired AgentRunner. When set, run_agent calls it;
	 *  when absent, the stub response is returned instead. */
	agentRunner?: AgentRunner
	/** Phase 189-03 — when set, also registers agent_config_set tool for the agent's own PTY.
	 *  Non-agent sessions omit this field, so agent_config_set is NOT exposed globally. */
	agentDir?: string
}

// ── McpServer-like surface ────────────────────────────────────────────────────
// We type only the `.tool()` call surface we touch to avoid importing the full
// @modelcontextprotocol/sdk type tree here. The runtime caller passes the real
// McpServer instance.
type ToolResult = {content: Array<{type: 'text'; text: string}>; isError: boolean}
type AnyHandler = (args: unknown) => Promise<ToolResult>

interface McpServerLike {
	tool(name: string, description: string, schema: Record<string, unknown>, handler: AnyHandler): void
}

// ── Audit helper ────────────────────────────────────────────────────────────
async function audit(redis: Redis, tool: string, input: unknown): Promise<void> {
	const entry = JSON.stringify({tool, input, ts: Date.now()})
	await redis.rpush('liv:audit:liv-tools', entry)
	await redis.ltrim('liv:audit:liv-tools', -1000, -1)
}

// ── Tool result helpers ──────────────────────────────────────────────────────
function ok(text: string): ToolResult {
	return {content: [{type: 'text', text}], isError: false}
}
function err(text: string): ToolResult {
	return {content: [{type: 'text', text}], isError: true}
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerLivTools(server: McpServerLike, opts: LivToolsOptions): void {
	const {trpcCaller, redis} = opts

	// 1. create_item
	const createSchema = z.object({
		type: z.enum(['project', 'agent', 'chat']),
		name: z.string().min(1).max(200),
		parentId: safeId.nullable().optional(),
		cwd: z.string().optional(),
		schedule: z.string().optional(),
		ccSessionId: z.string().optional(),
	}).strict()

	server.tool(
		'create_item',
		'Create a Project, Agent, or Chat Item in the vault.',
		createSchema.shape,
		async (args: unknown) => {
			const parse = createSchema.safeParse(args)
			if (!parse.success) return err(`Validation error: ${parse.error.message}`)
			try {
				const item = await trpcCaller.vault.items.create(parse.data)
				await audit(redis, 'create_item', {type: parse.data.type, name: parse.data.name})
				return ok(JSON.stringify(item))
			} catch (e: unknown) {
				return err(e instanceof Error ? e.message : String(e))
			}
		},
	)

	// 2. list_items
	const listSchema = z.object({
		archived: z.boolean().optional(),
		parentId: safeId.nullable().optional(),
	}).strict()

	server.tool(
		'list_items',
		'List vault Items. Optionally filter by parentId or archived status.',
		listSchema.shape,
		async (args: unknown) => {
			const parse = listSchema.safeParse(args)
			if (!parse.success) return err(`Validation error: ${parse.error.message}`)
			try {
				const result = await trpcCaller.vault.items.list(parse.data)
				await audit(redis, 'list_items', parse.data)
				return ok(JSON.stringify(result))
			} catch (e: unknown) {
				return err(e instanceof Error ? e.message : String(e))
			}
		},
	)

	// 3. move_item
	const moveSchema = z.object({
		id: safeId,
		newParentId: safeId.nullable(),
	}).strict()

	server.tool(
		'move_item',
		'Move an Item to a new parent. Cycle and depth checks enforced.',
		moveSchema.shape,
		async (args: unknown) => {
			const parse = moveSchema.safeParse(args)
			if (!parse.success) return err(`Validation error: ${parse.error.message}`)
			try {
				const result = await trpcCaller.vault.items.move(parse.data)
				await audit(redis, 'move_item', {id: parse.data.id})
				return ok(JSON.stringify(result))
			} catch (e: unknown) {
				return err(e instanceof Error ? e.message : String(e))
			}
		},
	)

	// 4. archive_item
	const archiveSchema = z.object({
		id: safeId,
	}).strict()

	server.tool(
		'archive_item',
		'Soft-archive an Item (reversible). Archived Items are hidden from the default list.',
		archiveSchema.shape,
		async (args: unknown) => {
			const parse = archiveSchema.safeParse(args)
			if (!parse.success) return err(`Validation error: ${parse.error.message}`)
			try {
				const result = await trpcCaller.vault.items.archive(parse.data)
				await audit(redis, 'archive_item', {id: parse.data.id})
				return ok(JSON.stringify(result))
			} catch (e: unknown) {
				return err(e instanceof Error ? e.message : String(e))
			}
		},
	)

	// 5. open_item
	const openSchema = z.object({
		itemId: safeId,
	}).strict()

	server.tool(
		'open_item',
		'Focus the SidebarTree row for an Item in the UI.',
		openSchema.shape,
		async (args: unknown) => {
			const parse = openSchema.safeParse(args)
			if (!parse.success) return err(`Validation error: ${parse.error.message}`)
			await redis.publish('liv:open:item', JSON.stringify({itemId: parse.data.itemId}))
			await audit(redis, 'open_item', {itemId: parse.data.itemId})
			return ok(`open_item: focused ${parse.data.itemId}`)
		},
	)

	// 6. run_agent — Phase 177-02: wired to AgentRunner when present
	const runAgentSchema = z.object({
		agentId: safeId,
		oneShot: z.boolean().optional(),
		message: z.string().optional(),
	}).strict()

	server.tool(
		'run_agent',
		'Trigger an Agent Item run immediately.',
		runAgentSchema.shape,
		async (args: unknown) => {
			const parse = runAgentSchema.safeParse(args)
			if (!parse.success) return err(`Validation error: ${parse.error.message}`)
			await audit(redis, 'run_agent', {agentId: parse.data.agentId})
			if (opts.agentRunner) {
				try {
					const result = await opts.agentRunner.runAgent(parse.data.agentId, {
						triggeredBy: 'manual',
					})
					return ok(JSON.stringify(result))
				} catch (e: unknown) {
					return err(e instanceof Error ? e.message : String(e))
				}
			}
			// Fallback stub: agentRunner not wired (Phase 177 runner not injected yet)
			return ok('run_agent: scheduled (Phase 177 — runner not wired)')
		},
	)

	// Phase 189-03 — conditionally register agent setup tool.
	// Only registered when agentDir is provided (i.e. for an agent-scoped PTY session).
	// Global Liv MCP server (no agentDir) does NOT expose this tool.
	if (opts.agentDir) {
		registerAgentSetupTools(server, {agentDir: opts.agentDir, redis})
	}
}
