// Phase 241 — convert a Liv Redis catalog entry into the AionUi
// POST /api/mcp/servers payload. Pure function — no I/O, no side effects.
//
// Reference: .planning/phases/241-mcp-auto-add-liv-tools/241-RESEARCH.md §Code Examples
// + §1 Endpoint A (probe-verified 5-field CreateMcpServerRequest shape).
//
// Quirks honored here:
//   - `enabled` is NOT a CreateMcpServerRequest field — stripped from output.
//     To enable a server, follow with POST /api/mcp/servers/{id}/toggle.
//   - No `description: undefined` leaks — description key is OMITTED when
//     the Redis entry has no description (per test 7 + AionUi serde behavior).
//   - Liv catalog supports stdio + http; sse is AionUi-only — unknown
//     transport throws with the transport name in the message.

import type {AionUiCreateMcpServerRequest, LivRedisEntry} from './types.js'

export function transformRedisToAionUi(
	name: string,
	redisEntry: LivRedisEntry,
): AionUiCreateMcpServerRequest {
	if (redisEntry.transport === 'stdio') {
		if (!redisEntry.command) {
			throw new Error(`Liv MCP '${name}' marked stdio but has no command`)
		}
		const out: AionUiCreateMcpServerRequest = {
			name,
			transport: {
				type: 'stdio',
				command: redisEntry.command,
				args: redisEntry.args ?? [],
				...(redisEntry.env !== undefined ? {env: redisEntry.env} : {}),
			},
			builtin: false,
		}
		if (redisEntry.description !== undefined) out.description = redisEntry.description
		return out
	}
	if (redisEntry.transport === 'http') {
		if (!redisEntry.url) {
			throw new Error(`Liv MCP '${name}' marked http but has no url`)
		}
		const out: AionUiCreateMcpServerRequest = {
			name,
			transport: {
				type: 'http',
				url: redisEntry.url,
				...(redisEntry.headers !== undefined ? {headers: redisEntry.headers} : {}),
			},
			builtin: false,
		}
		if (redisEntry.description !== undefined) out.description = redisEntry.description
		return out
	}
	throw new Error(
		`Liv MCP '${name}' has unknown transport: ${(redisEntry as {transport: string}).transport}`,
	)
}
