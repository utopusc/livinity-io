/**
 * Phase 203-06 Task 1 — Internal-only plugin RPC surface (Express
 * RequestHandler factory).
 *
 * The rebranded openclaw plugin (livos/packages/liv-claw-os/packages/claw-plugin/)
 * registers 20 LivOS-side tools (9 luse_* + 11 BUILT_IN_TOOL_CATALOG) with the
 * openclaw gateway via `api.registerTool(factory, {name})`. The factory's
 * `execute` closure dispatches a single sync HTTP POST back to livinityd at
 * `POST /openclawos/plugin-rpc` carrying `{method, args}`. This file is the
 * livinityd-side dispatcher for those calls.
 *
 * Auth model
 * ──────────
 * Internal-only — never exposed to the operator's browser. Authenticated via
 * `X-Internal-Plugin-Token` header against `process.env.LIV_PLUGIN_TOKEN`
 * (Plan 203-04 D-203-06 fallback uses `LIV_API_KEY` until 203-05's service-token
 * format is mature). Mismatch → 403. Missing env on server side → 503 (route is
 * unusable until LIV_PLUGIN_TOKEN is wired into the systemd unit Environment=).
 *
 * Dispatch surface (D-203-13 / D-203-14)
 * ──────────────────────────────────────
 *   luse.list                                 → mcpBridge.listTools() filtered to luse_* names
 *   luse.invoke({toolName, args})             → forwards to MCPClient.callTool('luse', toolName, args)
 *   builtin.list                              → BUILT_IN_TOOL_CATALOG (11 entries)
 *   builtin.invoke({toolName, args})          → invokes builtInTools[toolName].execute({context: args})
 *   approval.request({toolName, args, agentId?, userId?, timeoutMs?})
 *                                             → approvalManager.requestSync(...) — awaits operator decision
 *                                               returns {decision: 'approved' | 'rejected' | 'timeout'}
 *
 * Response shapes
 * ───────────────
 *   200 {ok: true, result: <method-specific>}
 *   200 {ok: false, error: 'APPROVAL_REJECTED' | 'APPROVAL_TIMEOUT' | 'TOOL_ERROR', detail?: string}
 *   400 {error: 'BAD_REQUEST', detail: string}
 *   403 {error: 'FORBIDDEN'}
 *   404 {error: 'METHOD_NOT_FOUND' | 'TOOL_NOT_FOUND', detail?: string}
 *   503 {error: 'PLUGIN_TOKEN_UNCONFIGURED'} — LIV_PLUGIN_TOKEN env missing
 *
 * Threat mitigations
 * ──────────────────
 *   T-203-02 (replay) — token header is opaque; not a JWT. Rotation = redeploy.
 *   INV-203-04 — destructive tool calls MUST gate through approval.request. The
 *                plugin-side proxy (Task 2) decides which tools are destructive
 *                using the same DESTRUCTIVE set as mcp-bridge; this route does
 *                NOT enforce auto-approval — it's a pure dispatch surface.
 */

import type {RequestHandler} from 'express'
import {randomUUID} from 'node:crypto'

import type {ApprovalManager} from '../mastra/approval-manager.js'

// ──────────────────────────────────────────────────────────────────────────────
// External dependency interfaces — kept minimal so tests can supply pure mocks
// ──────────────────────────────────────────────────────────────────────────────

export interface PluginRpcLogger {
	info(msg: string): void
	warn(msg: string, err?: unknown): void
	error(msg: string, err?: unknown): void
}

/**
 * Subset of MCPClient surface this route consumes. Production wires this to the
 * shared mcpBridge's underlying MCPClient via a thin adapter (the bridge does
 * not expose callTool directly — see boot wire-up in source/index.ts).
 *
 * Returns the raw MCP tool-result envelope: { content: [...], isError?: boolean }
 */
export interface LusePluginRpcMcp {
	callTool(args: {
		serverName: string
		name: string
		args: Record<string, unknown>
	}): Promise<unknown>
	getServerTools?(serverName: string): Promise<Record<string, unknown>>
}

/**
 * Subset of the built-in tool registry. Both `builtInTools` (runtime resolver)
 * and `BUILT_IN_TOOL_CATALOG` (UI manifest) live in
 * `modules/mastra/agents/built-in-tools.ts`; boot wires both here.
 */
export interface BuiltInToolEntry {
	id: string
	name: string
	description: string
	destructive: boolean
	category: string
}

export interface BuiltInToolExecutable {
	execute(input: {context: Record<string, unknown>}): Promise<unknown>
}

export interface PluginRpcDeps {
	approvalManager: ApprovalManager
	/**
	 * MCP client adapter. May be `null` when Luse is disabled / bridge construction
	 * failed — `luse.*` methods then return TOOL_NOT_FOUND so the plugin handles
	 * graceful degradation rather than hanging.
	 */
	mcp: LusePluginRpcMcp | null
	builtInTools: Record<string, BuiltInToolExecutable>
	builtInCatalog: readonly BuiltInToolEntry[]
	logger?: PluginRpcLogger
	/**
	 * Test seam — override the env-var lookup so unit tests don't need to mutate
	 * process.env. Defaults to reading `process.env.LIV_PLUGIN_TOKEN` (with
	 * `LIV_API_KEY` as the 203-04 fallback).
	 */
	expectedToken?: () => string | undefined
}

// ──────────────────────────────────────────────────────────────────────────────
// Method-name dispatch
// ──────────────────────────────────────────────────────────────────────────────

type RpcResult =
	| {ok: true; result: unknown}
	| {ok: false; error: string; detail?: string}

type RpcHandler = (
	args: Record<string, unknown>,
	deps: PluginRpcDeps,
) => Promise<RpcResult>

const luseList: RpcHandler = async (_args, deps) => {
	if (!deps.mcp || !deps.mcp.getServerTools) {
		return {ok: true, result: {tools: []}}
	}
	try {
		const raw = await deps.mcp.getServerTools('luse')
		const tools = Object.entries(raw ?? {}).map(([name, def]) => {
			const d = (def ?? {}) as Record<string, unknown>
			return {
				name,
				description: typeof d['description'] === 'string' ? d['description'] : '',
				parameters: d['parameters'] ?? d['inputSchema'] ?? null,
				destructive: Boolean(
					(d['meta'] as Record<string, unknown> | undefined)?.['requireApproval'],
				),
			}
		})
		return {ok: true, result: {tools}}
	} catch (err) {
		deps.logger?.warn('[plugin-rpc] luse.list failed', err)
		return {ok: true, result: {tools: []}}
	}
}

const luseInvoke: RpcHandler = async (args, deps) => {
	const toolName = typeof args['toolName'] === 'string' ? args['toolName'] : ''
	const toolArgs =
		typeof args['args'] === 'object' && args['args'] !== null
			? (args['args'] as Record<string, unknown>)
			: {}
	if (!toolName) {
		return {ok: false, error: 'BAD_REQUEST', detail: 'toolName is required'}
	}
	if (!deps.mcp) {
		return {ok: false, error: 'TOOL_NOT_FOUND', detail: 'luse bridge unavailable'}
	}
	try {
		const result = await deps.mcp.callTool({
			serverName: 'luse',
			name: toolName,
			args: toolArgs,
		})
		return {ok: true, result}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		deps.logger?.warn(`[plugin-rpc] luse.invoke ${toolName} failed: ${msg}`)
		return {ok: false, error: 'TOOL_ERROR', detail: msg}
	}
}

const builtinList: RpcHandler = async (_args, deps) => {
	return {ok: true, result: {tools: deps.builtInCatalog}}
}

const builtinInvoke: RpcHandler = async (args, deps) => {
	const toolName = typeof args['toolName'] === 'string' ? args['toolName'] : ''
	const toolArgs =
		typeof args['args'] === 'object' && args['args'] !== null
			? (args['args'] as Record<string, unknown>)
			: {}
	if (!toolName) {
		return {ok: false, error: 'BAD_REQUEST', detail: 'toolName is required'}
	}
	const tool = deps.builtInTools[toolName]
	if (!tool) {
		return {ok: false, error: 'TOOL_NOT_FOUND', detail: `unknown built-in: ${toolName}`}
	}
	try {
		const result = await tool.execute({context: toolArgs})
		return {ok: true, result}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		deps.logger?.warn(`[plugin-rpc] builtin.invoke ${toolName} failed: ${msg}`)
		return {ok: false, error: 'TOOL_ERROR', detail: msg}
	}
}

const approvalRequest: RpcHandler = async (args, deps) => {
	const toolName = typeof args['toolName'] === 'string' ? args['toolName'] : ''
	if (!toolName) {
		return {ok: false, error: 'BAD_REQUEST', detail: 'toolName is required'}
	}
	const opts = {
		toolName,
		args: args['args'],
		agentId: typeof args['agentId'] === 'string' ? args['agentId'] : undefined,
		userId: typeof args['userId'] === 'string' ? args['userId'] : undefined,
		toolCallId:
			typeof args['toolCallId'] === 'string' && args['toolCallId'].length > 0
				? args['toolCallId']
				: randomUUID(),
		timeoutMs:
			typeof args['timeoutMs'] === 'number' && args['timeoutMs'] > 0
				? args['timeoutMs']
				: undefined,
	}
	try {
		const decisionResult = await deps.approvalManager.requestSync(opts)
		return {ok: true, result: decisionResult}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		deps.logger?.error(`[plugin-rpc] approval.request ${toolName} failed`, err)
		return {ok: false, error: 'TOOL_ERROR', detail: msg}
	}
}

const DISPATCH: Record<string, RpcHandler> = {
	'luse.list': luseList,
	'luse.invoke': luseInvoke,
	'builtin.list': builtinList,
	'builtin.invoke': builtinInvoke,
	'approval.request': approvalRequest,
}

export const PLUGIN_RPC_METHODS = Object.keys(DISPATCH)

// ──────────────────────────────────────────────────────────────────────────────
// Express handler factory
// ──────────────────────────────────────────────────────────────────────────────

function defaultExpectedToken(): string | undefined {
	// Prefer the plugin-specific token; fall back to LIV_API_KEY (Plan 203-04 D-203-06).
	return process.env['LIV_PLUGIN_TOKEN'] ?? process.env['LIV_API_KEY']
}

export function createPluginRpcHandler(deps: PluginRpcDeps): RequestHandler {
	const expectedTokenFn = deps.expectedToken ?? defaultExpectedToken

	const handler: RequestHandler = async (req, res) => {
		try {
			const expectedToken = expectedTokenFn()
			if (!expectedToken) {
				res.status(503).json({error: 'PLUGIN_TOKEN_UNCONFIGURED'})
				return
			}

			const presented = req.headers['x-internal-plugin-token']
			const presentedStr = Array.isArray(presented) ? presented[0] : presented
			if (presentedStr !== expectedToken) {
				res.status(403).json({error: 'FORBIDDEN'})
				return
			}

			const body =
				typeof req.body === 'object' && req.body !== null
					? (req.body as Record<string, unknown>)
					: {}
			const method = typeof body['method'] === 'string' ? body['method'] : ''
			const args =
				typeof body['args'] === 'object' && body['args'] !== null
					? (body['args'] as Record<string, unknown>)
					: {}

			if (!method) {
				res.status(400).json({error: 'BAD_REQUEST', detail: 'method is required'})
				return
			}

			const dispatch = DISPATCH[method]
			if (!dispatch) {
				res
					.status(404)
					.json({error: 'METHOD_NOT_FOUND', detail: `unknown method: ${method}`})
				return
			}

			const result = await dispatch(args, deps)
			if (!result.ok && result.error === 'TOOL_NOT_FOUND') {
				res.status(404).json(result)
				return
			}
			if (!result.ok && result.error === 'BAD_REQUEST') {
				res.status(400).json(result)
				return
			}
			res.status(200).json(result)
		} catch (err) {
			deps.logger?.error('[plugin-rpc] unexpected error', err)
			res.status(500).json({error: 'INTERNAL', detail: err instanceof Error ? err.message : String(err)})
		}
	}

	return handler
}
