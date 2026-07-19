/**
 * Phase 346-03 (MCP-01, D-346-1 / D-346-3 / D-346-4 / D-346-7) — the 10 SAFE
 * MCP control tools, each a THIN HTTP client of an existing `/trpc/<procedure>`
 * endpoint (the liv-apps / liv-deploy GOOD pattern).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ZERO imports from the broker/subscription path (D-346-2). Fenced by
 * __tests__/broker-zero-import.test.ts. This module imports ONLY the SDK,
 * zod, and the local frozen allowlist — NEVER apps.ts / any service module,
 * NEVER a docker socket, NEVER execSync (the liv-docker / liv-system bad
 * pattern is rejected: D-346-1). Every tool handler reaches its data over
 * loopback HTTP, inheriting every tRPC middleware + inline authz + audit.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Security chokepoint (D-346-4): `callTrpcProcedure` calls
 * `assertAllowlistedProcedure(procedure)` FIRST — before ANY fetch — so a
 * procedure path that is not on the frozen allowlist can never reach the
 * network. Procedure paths are hardcoded literals derived from
 * TOOL_PROCEDURE_MAP; they are NEVER agent-supplied (there is no proxy tool).
 *
 * Attribution (D-346-7): every /trpc call carries BOTH headers —
 *   X-Api-Key: LIV_API_KEY  (authentication; the internal loopback service
 *                            token — NEVER exposed to the MCP agent)
 *   X-Mcp-Key-Id: <mcpKeyId> (attribution; threaded from the auth gate so the
 *                             tRPC ctx/audit row records which liv_mcp_* key
 *                             initiated the act — Plan 02 context.ts).
 *
 * Timeouts (plan-check WARN-3): every fetch sets an explicit
 * AbortSignal.timeout so a hung /trpc call can't block a tool invocation —
 * 10s for reads, 60s for the lifecycle mutations (start/stop/restart).
 */

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {
	TOOL_PROCEDURE_MAP,
	assertAllowlistedProcedure,
	type McpToolName,
} from './allowlist.js'

// ─── Timeouts (WARN-3) ───────────────────────────────────────────────────────
/** Read/query timeout — mirrors liv-apps' 5s reads, widened to 10s. */
export const MCP_QUERY_TIMEOUT_MS = 10_000
/** Lifecycle mutation timeout — start/stop/restart can be slow (container ops). */
export const MCP_ACT_TIMEOUT_MS = 60_000

interface MinimalLogger {
	debug?: (...args: unknown[]) => void
	error?: (...args: unknown[]) => void
}

/** Injectable fetch (default global fetch) so tests never hit the network. */
export type FetchImpl = typeof fetch

export interface McpToolDeps {
	/** LIVINITYD_API_URL, e.g. http://127.0.0.1:8080 (loopback only). */
	apiUrl: string
	/** LIV_API_KEY — the internal service token; NEVER exposed to the agent. */
	apiKey: string
	logger: MinimalLogger
	/** Attribution: the resolved liv_mcp_* key id (from the auth gate). */
	mcpKeyId?: string
	/** Test seam: override global fetch. */
	fetchImpl?: FetchImpl
}

export interface CallTrpcOptions {
	procedure: string
	method: 'query' | 'mutation'
	input?: unknown
	mcpKeyId?: string
	timeoutMs?: number
}

/**
 * Thin loopback /trpc client (D-346-1). Order is load-bearing:
 *   1. assertAllowlistedProcedure(procedure) — throws BEFORE any fetch for a
 *      non-allowlisted path (the D-346-4 chokepoint; a spy proves fetch is
 *      never called on refusal).
 *   2. build the liv-deploy/liv-apps-style request (query → GET ?input=…,
 *      mutation → POST JSON body), attaching X-Api-Key + X-Mcp-Key-Id and an
 *      explicit AbortSignal.timeout (WARN-3).
 *   3. non-2xx → throw (the tool handler converts it to {isError:true}); 2xx →
 *      unwrap result.data.
 */
export async function callTrpcProcedure(
	deps: McpToolDeps,
	opts: CallTrpcOptions,
): Promise<unknown> {
	// 1. CHOKEPOINT — refuse a non-allowlisted procedure before touching fetch.
	assertAllowlistedProcedure(opts.procedure)

	const doFetch: FetchImpl = deps.fetchImpl ?? fetch
	const timeoutMs = opts.timeoutMs ?? MCP_QUERY_TIMEOUT_MS
	const mcpKeyId = opts.mcpKeyId ?? deps.mcpKeyId

	const headers: Record<string, string> = {'X-Api-Key': deps.apiKey}
	if (mcpKeyId) headers['X-Mcp-Key-Id'] = mcpKeyId

	let res: Response
	if (opts.method === 'query') {
		// tRPC query: input rides the query string. No-input (undefined) → empty
		// `?input=` (mirrors liv-apps apps.list); with input → urlencoded JSON.
		const encoded =
			opts.input === undefined
				? ''
				: encodeURIComponent(JSON.stringify(opts.input))
		res = await doFetch(`${deps.apiUrl}/trpc/${opts.procedure}?input=${encoded}`, {
			headers,
			signal: AbortSignal.timeout(timeoutMs),
		})
	} else {
		// tRPC mutation: JSON body POST.
		res = await doFetch(`${deps.apiUrl}/trpc/${opts.procedure}`, {
			method: 'POST',
			headers: {...headers, 'Content-Type': 'application/json'},
			body: JSON.stringify(opts.input ?? {}),
			signal: AbortSignal.timeout(timeoutMs),
		})
	}

	if (!res.ok) {
		throw new Error(`HTTP ${res.status} from ${opts.procedure}`)
	}

	const data = (await res.json()) as {result?: {data?: unknown}}
	return data.result?.data ?? null
}

// ─── Per-tool specification ──────────────────────────────────────────────────
// Each of the 10 tools (keys of TOOL_PROCEDURE_MAP) maps 1:1 to an allowlisted
// procedure. `method` picks query vs mutation; `input` is the faithful zod
// shape (appId-taking tools require a non-empty appId; the rest take {}).

const APP_ID_SHAPE = {
	appId: z
		.string()
		.min(1)
		.describe('The installed app instance id / slug (from apps_list).'),
} as const

interface ToolSpec {
	method: 'query' | 'mutation'
	timeoutMs: number
	input: z.ZodRawShape
	description: string
}

const TOOL_SPECS: Record<McpToolName, ToolSpec> = {
	apps_list: {
		method: 'query',
		timeoutMs: MCP_QUERY_TIMEOUT_MS,
		input: {},
		// WARN-2: apps.list returns per-app defaultUsername/defaultPassword/
		// deterministicPassword — same secret-exposure class as app_logs
		// (T-346-15/T-346-16). Flagged here + in the UAT.
		description:
			'List all installed LivOS app instances (id, name, state, subdomain, port). ⚠ May include per-app default credentials (defaultUsername/defaultPassword) — treat output as secret. Reads tRPC apps.list.',
	},
	app_state: {
		method: 'query',
		timeoutMs: MCP_QUERY_TIMEOUT_MS,
		input: APP_ID_SHAPE,
		description:
			'Get the current runtime state of one installed app (running/stopped/…). Reads tRPC apps.state.',
	},
	app_start: {
		method: 'mutation',
		timeoutMs: MCP_ACT_TIMEOUT_MS,
		input: APP_ID_SHAPE,
		description:
			'Start (bring up) an installed app. Safe lifecycle action; routes through tRPC apps.start (inherits its authz + audit).',
	},
	app_stop: {
		method: 'mutation',
		timeoutMs: MCP_ACT_TIMEOUT_MS,
		input: APP_ID_SHAPE,
		description:
			'Stop (bring down) an installed app. Safe lifecycle action; routes through tRPC apps.stop (inherits its authz + audit).',
	},
	app_restart: {
		method: 'mutation',
		timeoutMs: MCP_ACT_TIMEOUT_MS,
		input: APP_ID_SHAPE,
		description:
			'Restart an installed app. Safe lifecycle action; routes through tRPC apps.restart (inherits its authz + audit).',
	},
	app_logs: {
		method: 'query',
		timeoutMs: MCP_QUERY_TIMEOUT_MS,
		input: APP_ID_SHAPE,
		// T-346-15: logs may carry secrets — same exposure as the admin UI's
		// apps.logs behind assertAppLifecycleAccess (same-guard principle).
		description:
			'Read recent container logs for one app. ⚠ Logs may contain secrets (tokens, passwords) — same exposure as the admin UI apps.logs (behind assertAppLifecycleAccess). Reads tRPC apps.logs.',
	},
	system_cpu: {
		method: 'query',
		timeoutMs: MCP_QUERY_TIMEOUT_MS,
		input: {},
		description: 'Current host CPU usage. Reads tRPC system.cpuUsage.',
	},
	system_memory: {
		method: 'query',
		timeoutMs: MCP_QUERY_TIMEOUT_MS,
		input: {},
		description: 'Current host memory usage. Reads tRPC system.memoryUsage.',
	},
	system_disk: {
		method: 'query',
		timeoutMs: MCP_QUERY_TIMEOUT_MS,
		input: {},
		description: 'Current host disk usage. Reads tRPC system.diskUsage.',
	},
	scheduler_list: {
		method: 'query',
		timeoutMs: MCP_QUERY_TIMEOUT_MS,
		input: {},
		description:
			'List the scheduled background jobs and their definitions. Reads tRPC scheduler.listJobs.',
	},
}

/**
 * Register the 10 safe MCP control tools on `server`. Each tool is a thin
 * /trpc client through the allowlist chokepoint; `names === Object.keys(
 * TOOL_PROCEDURE_MAP)` (asserted by the test). When the env-thread is
 * incomplete (missing apiUrl/apiKey) every tool fails closed with an
 * operator-readable error (mirrors liv-deploy requireEnv) — never a silent
 * pass, never a throw out of the handler.
 */
export function registerMcpControlTools(server: McpServer, deps: McpToolDeps): void {
	const envReady = Boolean(deps.apiUrl) && Boolean(deps.apiKey)
	if (!envReady) {
		deps.logger.error?.(
			'[mcp-control.tools] LIVINITYD_API_URL / LIV_API_KEY env-thread incomplete; all tools will fail-closed',
		)
	}

	// Iterate TOOL_PROCEDURE_MAP so the registered set can never drift from the
	// allowlist source of truth.
	for (const toolName of Object.keys(TOOL_PROCEDURE_MAP) as McpToolName[]) {
		const procedure = TOOL_PROCEDURE_MAP[toolName]
		const spec = TOOL_SPECS[toolName]
		const hasInput = Object.keys(spec.input).length > 0

		server.tool(
			toolName,
			spec.description,
			spec.input,
			async (args: Record<string, unknown>) => {
				if (!envReady) {
					return {
						content: [
							{
								type: 'text' as const,
								text: 'env-thread incomplete (LIVINITYD_API_URL / LIV_API_KEY missing)',
							},
						],
						isError: true,
					}
				}
				try {
					const result = await callTrpcProcedure(deps, {
						procedure,
						method: spec.method,
						input: hasInput ? args : undefined,
						mcpKeyId: deps.mcpKeyId,
						timeoutMs: spec.timeoutMs,
					})
					return {
						content: [
							{type: 'text' as const, text: JSON.stringify(result, null, 2)},
						],
					}
				} catch (err) {
					return {
						content: [
							{
								type: 'text' as const,
								text: `${toolName} failed: ${(err as Error).message}`,
							},
						],
						isError: true,
					}
				}
			},
		)
	}
}
