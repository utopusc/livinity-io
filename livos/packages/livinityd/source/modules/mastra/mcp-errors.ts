/**
 * Phase 197-02 — McpBridge error classes.
 *
 * LuseMcpUnavailableError + SelfclaudeMcpUnavailableError surface
 * source-specific degradation (operator can choose to ignore or repair).
 * InvalidMcpUrlError is thrown BEFORE MCPClient construction on a
 * non-loopback hostname (T-197-02-03).
 */

export class LuseMcpUnavailableError extends Error {
	readonly code = 'LUSE_MCP_UNAVAILABLE' as const
	constructor(reason: string) {
		super(`Luse MCP unavailable: ${reason}`)
		this.name = 'LuseMcpUnavailableError'
	}
}

export class SelfclaudeMcpUnavailableError extends Error {
	readonly code = 'SELFCLAUDE_MCP_UNAVAILABLE' as const
	constructor(reason: string) {
		super(`selfclaude MCP unavailable: ${reason}`)
		this.name = 'SelfclaudeMcpUnavailableError'
	}
}

export class InvalidMcpUrlError extends Error {
	readonly code = 'INVALID_MCP_URL' as const
	constructor(url: string, reason: string) {
		super(`Invalid MCP URL ${url}: ${reason}`)
		this.name = 'InvalidMcpUrlError'
	}
}
