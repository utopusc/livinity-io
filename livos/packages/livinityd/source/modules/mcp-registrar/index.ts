// Phase 241 — mcp-registrar module barrel.
//
// seedAionUiMcpConfig (the orchestrator) is wired in plan 241-03; this file
// re-exports the public symbols plans 241-02/03/04 will import.

export * from './types.js'
export {transformRedisToAionUi} from './transform.js'
export {
	MCP_CONFIG_REDIS_HASH_KEY,
	readSystemMcpCatalog,
	SYSTEM_MCP_NAMES,
	SYSTEM_MCP_NAMES_SET,
	type RedisCatalogClient,
} from './redis-catalog.js'
export {AionUiMcpClient, type AionUiSyncResult} from './aionui-client.js'
export {waitForAionUiReady, type ReadyPollOptions} from './ready-poll.js'
