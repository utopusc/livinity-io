// Phase 241 — typed HTTP client for AionUi's MCP API.
//
// Endpoints + payloads verified by live Mini PC probes 2026-05-27 — see
// .planning/phases/241-mcp-auto-add-liv-tools/241-RESEARCH.md §1.
//
// CRITICAL contract notes:
//   - GET /api/mcp/servers is the canonical list (NOT the /api/extensions/* sibling — Pitfall 3)
//   - POST /api/mcp/servers is upsert-by-name (DESTRUCTIVE on existing) — Pitfall 1
//   - POST /api/mcp/servers does NOT accept `enabled` field — Pitfall 4. Use /toggle as follow-up.
//   - POST /api/mcp/sync-to-agents body is `{servers: string[]}` (array of NAMES)
//
// Every HTTP call funnels through fetchJson() so the AbortController +
// clearTimeout pair lives in exactly one place. No method here keeps a
// reference to the timer outside the try/finally — no listener leaks.

import type {
	AionUiCreateMcpServerRequest,
	AionUiServerRecord,
} from './types.js'

/** Outer envelope wrapping AionUi's MCP HTTP responses. */
interface ApiEnvelope<T> {
	success: boolean
	data?: T
	error?: string
}

/** Result returned by sync-to-agents — outer envelope `success` is unwrapped
 * by the client; the inner `success` + per-agent `results` are exposed so the
 * orchestrator (plan 241-03) can log partial failures without re-fetching. */
export interface AionUiSyncResult {
	success: boolean
	results: Array<{agent: string; success: boolean; error?: string}>
}

export class AionUiMcpClient {
	constructor(
		private readonly baseUrl: string,
		private readonly perCallTimeoutMs = 5_000,
	) {}

	/** GET /api/mcp/servers — canonical EXISTS-gate list (D-241-04). */
	async listServers(): Promise<AionUiServerRecord[]> {
		const env = await this.fetchJson<AionUiServerRecord[]>(
			`${this.baseUrl}/api/mcp/servers`,
		)
		if (!env.success) {
			throw new Error(`listServers: ${env.error ?? 'unknown error'}`)
		}
		return env.data ?? []
	}

	/** Convenience — listServers + name lookup (returns null when absent). */
	async findByName(name: string): Promise<AionUiServerRecord | null> {
		const all = await this.listServers()
		return all.find((s) => s.name === name) ?? null
	}

	/**
	 * POST /api/mcp/servers — register a new MCP server.
	 *
	 * WARNING: AionUi treats this endpoint as upsert-by-name; calling it for
	 * an already-existing `name` will DESTRUCTIVELY OVERWRITE every field
	 * (Pitfall 1 in 241-RESEARCH.md). The orchestrator MUST gate via the
	 * EXISTS-check on listServers() before calling this.
	 */
	async createServer(req: AionUiCreateMcpServerRequest): Promise<AionUiServerRecord> {
		const env = await this.fetchJson<AionUiServerRecord>(
			`${this.baseUrl}/api/mcp/servers`,
			{
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(req),
			},
		)
		if (!env.success || !env.data) {
			throw new Error(`createServer(${req.name}): ${env.error ?? 'unknown error'}`)
		}
		return env.data
	}

	/**
	 * POST /api/mcp/servers/{id}/toggle — enable or disable.
	 *
	 * Payload shape is `{enabled: boolean}` (Assumption A2 in 241-RESEARCH;
	 * the endpoint string is visible in the aioncore binary but the exact
	 * payload was not probe-tested. Switch to a probe-confirmed shape during
	 * 241-04 deploy walk if A2 turns out wrong — worst case is server stays
	 * disabled and operator flips it manually, which the EXISTS gate then
	 * preserves on every future boot).
	 */
	async toggleServer(id: string, enabled: boolean): Promise<void> {
		const env = await this.fetchJson<unknown>(
			`${this.baseUrl}/api/mcp/servers/${id}/toggle`,
			{
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({enabled}),
			},
		)
		if (!env.success) {
			throw new Error(`toggleServer(${id}): ${env.error ?? 'unknown error'}`)
		}
	}

	/**
	 * POST /api/mcp/sync-to-agents — distribute the named server set to all
	 * 8 agent CLI config files (claude/gemini/qwen/codex/codebuddy/opencode/
	 * aionrs/aionui). Body is `{servers: string[]}` (probe-verified §1).
	 *
	 * Resolves even when the outer envelope is success:true but some agent
	 * results are success:false — partial failures are returned via
	 * AionUiSyncResult.results so the orchestrator can log them. The method
	 * ONLY throws when the outer envelope says success:false.
	 */
	async syncToAgents(serverNames: string[]): Promise<AionUiSyncResult> {
		const env = await this.fetchJson<AionUiSyncResult>(
			`${this.baseUrl}/api/mcp/sync-to-agents`,
			{
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({servers: serverNames}),
			},
		)
		if (!env.success) {
			throw new Error(`syncToAgents: ${env.error ?? 'unknown error'}`)
		}
		return env.data ?? {success: true, results: []}
	}

	/**
	 * Single chokepoint for fetch + AbortController timeout. Every public
	 * method funnels through here so timer cleanup happens in exactly one
	 * place (finally → clearTimeout — no listener leaks).
	 */
	private async fetchJson<T>(url: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
		const ctrl = new AbortController()
		const t = setTimeout(() => ctrl.abort(), this.perCallTimeoutMs)
		try {
			const res = await fetch(url, {...init, signal: ctrl.signal})
			return (await res.json()) as ApiEnvelope<T>
		} finally {
			clearTimeout(t)
		}
	}
}
