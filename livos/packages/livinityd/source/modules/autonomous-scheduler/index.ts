// Phase 164 — Autonomous scheduler module barrel.
//
// Re-exports the canonical parser API (Phase 164-01). Later plans (164-02
// scheduler, 164-03 inbox writeback) will add their public surface here.

export {
	parseAgentDefinition,
	parseAgentDefinitionsDir,
} from './agent-definition-parser.js'

export type {
	AgentDefinition,
	ParseResult,
	ParseError,
	DirParseResult,
} from './agent-definition-parser.js'
