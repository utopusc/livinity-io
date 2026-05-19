// Phase 164 — Autonomous scheduler module barrel.
//
// Re-exports the canonical parser API (Phase 164-01) and inbox writeback
// (Phase 164-03). Phase 164-02 (scheduler) will extend this surface next.

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

export {writeInboxEntry} from './inbox-writer.js'

export type {
	AutonomousRunStatus,
	InboxEntryInput,
	WriteInboxResult,
} from './inbox-writer.js'
