// Phase 76 MARKET-03 — seeds/ barrel. Every seed runner exports through here
// so initDatabase() (and future callers) can discover them via a single path.
// Future seed runners (per-table) get added with another `export * from`.

export * from './agent-templates.js'

// Phase 85 V32-AGENT-03 — 5-agent v32 system seed catalog.
export {
	AGENT_SEEDS,
	seedAgents,
	type AgentSeed,
	type ConfiguredMcpSeed,
	type AgentpressToolsSeed,
} from './agents.js'
