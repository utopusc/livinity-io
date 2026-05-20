// Phase 164 — Autonomous scheduler module barrel.
//
// Re-exports the canonical parser API (Phase 164-01), inbox writeback
// (Phase 164-03), scheduler runtime + budget gate + CLI trigger
// (Phase 164-02).

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

// Phase 165-02 — Read-only inbox helper for the Settings UI autonomous panel.
export {readLastRunForAgent} from './inbox-reader.js'
export type {LastRunInfo} from './inbox-reader.js'

// Phase 164-02 — scheduler runtime + CLI trigger + budget gate helpers.
export {AutonomousScheduler} from './scheduler.js'
export type {
	AutonomousSchedulerOptions,
	AutonomousSchedulerLogger,
	SdkQueryFn,
	SdkQueryOptions,
} from './scheduler.js'

export {autonomousTriggerCli} from './cli-trigger.js'
export type {AutonomousTriggerCliOptions} from './cli-trigger.js'

export {
	checkAndIncrementConcurrent,
	decrementConcurrent,
	checkDailyBudget,
	incrementDailySpend,
	dateKeyForUtc,
} from './budget-gate.js'
export type {
	ConcurrentGateResult,
	DailyBudgetGateResult,
} from './budget-gate.js'

// Phase 177-01 — per-Agent cron registry (vault-items/agent-schedule.ts).
// Additive exports only — scheduler.ts core UNCHANGED (byte-identical).
export {
	AgentScheduleRegistry,
	scheduleAgent,
	unscheduleAgent,
	bootSweepAgentSchedules,
} from '../vault-items/agent-schedule.js'
export type {BootSweepResult} from '../vault-items/agent-schedule.js'
