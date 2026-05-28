// Phase 241 — shared types for the mcp-registrar boot-time seed module.
// See .planning/phases/241-mcp-auto-add-liv-tools/241-RESEARCH.md §1 for the
// AionUi API contract these mirror. All probe-verified 2026-05-27 against
// Mini PC bruce@10.69.31.68 liv-assistant 2.1.4 (port 3020).

/** Shape stored at each field of Redis hash `liv:mcp:config`. */
export interface LivRedisEntry {
	name: string
	transport: 'stdio' | 'http'
	command?: string
	args?: string[]
	url?: string
	env?: Record<string, string>
	headers?: Record<string, string>
	enabled?: boolean
	description?: string
	category?: string
	installedAt?: number
}

/**
 * Body for POST /api/mcp/servers — probe-verified 2026-05-27.
 * NOTE: `enabled` is INTENTIONALLY absent — the Rust `CreateMcpServerRequest`
 * struct has only 5 fields. To enable a server, follow the create with a
 * separate POST /api/mcp/servers/{id}/toggle call.
 */
export interface AionUiCreateMcpServerRequest {
	name: string
	transport:
		| {type: 'stdio'; command: string; args?: string[]; env?: Record<string, string>}
		| {type: 'http'; url: string; headers?: Record<string, string>}
		| {type: 'sse'; url: string; headers?: Record<string, string>}
	description?: string
	original_json?: string
	builtin?: boolean
}

/** Response row from GET /api/mcp/servers — probe-verified shape. */
export interface AionUiServerRecord {
	id: string
	name: string
	enabled: boolean
	transport: {type: 'stdio' | 'http' | 'sse'; [k: string]: unknown}
	status: 'disconnected' | 'connected' | 'error' | 'testing'
	builtin: boolean
	created_at: number
	updated_at: number
}

/**
 * Logger contract — structurally compatible with the livinityd boot logger
 * used by `drain-install-pending-redis.ts` and friends. `warn` accepts an
 * optional second arg for an error/cause object.
 */
export interface SeedLogger {
	info: (msg: string) => void
	warn: (msg: string, err?: unknown) => void
	error: (msg: string, err?: unknown) => void
}

/** Result returned by seedAionUiMcpConfig — never throws (plan 241-03). */
export interface SeedResult {
	created: number
	skipped: number
	errored: number
	sentinelSet: boolean
}

/** A single Liv→AionUi mirror target — name + parsed Redis cfg. */
export interface McpCatalogTarget {
	name: string
	cfg: LivRedisEntry
}
