// Phase 84 V32-MCP — shared types for the MCP UI components.
//
// Mirrors the NormalizedRegistryServer shape from livinityd's
// mcp-smithery-client.ts so the dialogs work source-agnostically. Kept
// hand-typed (instead of derived from RouterOutput) so type drift on the
// backend can't silently break the dialog renderers — the breakage will
// surface as a tRPC payload mismatch at runtime which is easier to debug.

export type McpSource = 'official' | 'smithery'

export interface McpConfigSchemaProperty {
	type: string
	description?: string
	isSecret?: boolean
	default?: unknown
	enum?: string[]
}

export interface McpConfigSchema {
	properties: Record<string, McpConfigSchemaProperty>
	required?: string[]
}

export interface McpRegistryServer {
	name: string
	qualifiedName?: string
	displayName?: string
	description?: string
	version?: string
	repository?: {url?: string; source?: string}
	homepage?: string
	iconUrl?: string
	tags?: string[]
	category?: string
	installCount?: number
	tools?: Array<{name: string; description?: string; required?: boolean}>
	configSchema?: McpConfigSchema
	source: McpSource
}

/**
 * The shape persisted on agents.configured_mcps JSONB rows. Extends the
 * agents-repo `ConfiguredMcp` type structurally (the column is jsonb so
 * extra fields pass through untouched). Read by ConfiguredMcpList +
 * MCPConfigurationNew.
 */
export interface ConfiguredMcp {
	name: string
	enabledTools: string[]
	source?: McpSource
	credentials?: Record<string, string>
}
