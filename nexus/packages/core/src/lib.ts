/**
 * @nexus/core library exports
 *
 * Safe to import without side effects. For daemon startup, import from '@nexus/core'.
 * For library usage: import { SubagentManager, ScheduleManager } from '@nexus/core/lib';
 */

// ── Managers ────────────────────────────────────────────────
export { SubagentManager } from './subagent-manager.js';
export type { SubagentConfig, SubagentMessage } from './subagent-manager.js';

export { ScheduleManager } from './schedule-manager.js';
export type { ScheduleJob, ScheduleJobData } from './schedule-manager.js';

// ── Agent Loop ──────────────────────────────────────────────
export { AgentLoop } from './agent.js';
export type { AgentEvent, AgentConfig, AgentResult } from './agent.js';

// ── Agent Runners ──────────────────────────────────────────────
export { KimiAgentRunner } from './kimi-agent-runner.js';
export { SdkAgentRunner } from './sdk-agent-runner.js';

// ── Run Store (Phase 67-01) ───────────────────────────────────
export { RunStore } from './run-store.js';
export type { Chunk, ChunkType, RunMeta, RunStatus } from './run-store.js';

// ── Liv Agent Runner (Phase 67-02) ───────────────────────────────
export { LivAgentRunner, categorizeTool } from './liv-agent-runner.js';
export type {
  ToolCallSnapshot,
  ToolCategory,
  LivAgentRunnerOptions,
} from './liv-agent-runner.js';

// ── Context Manager (Phase 73-01) ────────────────────────────────
// Naive truncate-oldest summarization at 75% Kimi-window threshold.
// Persists summary_checkpoint to Redis with 24h TTL. Wired into the
// LivAgentRunner per-iteration hook in Plan 73-03.
export { ContextManager, countTokens } from './context-manager.js';
export type {
  Message,
  SummarizationStrategy,
  ContextManagerOptions,
} from './context-manager.js';

// ── Run Queue (Phase 73-02) ──────────────────────────────────────
export { RunQueue } from './run-queue.js';
export type { AgentJobData, RunQueueOptions } from './run-queue.js';

// ── Run Recovery (Phase 73-05) ───────────────────────────────────
// Boot-time orphaned-run scanner. Default 'log-only' mode for v31 entry.
// Wired from livos/packages/livinityd/source/modules/ai/index.ts.
export { recoverIncompleteRuns } from './run-recovery.js';
export type {
  RecoveryMode,
  RecoveryOptions,
  RecoveryResult,
} from './run-recovery.js';

// ── Tool Registry ──────────────────────────────────────────────
export { ToolRegistry } from './tool-registry.js';
export type { ToolPolicy } from './tool-registry.js';

// ── Agent Session Manager ──────────────────────────────────────
export { AgentSessionManager, createInputChannel } from './agent-session.js';
export type { ActiveSession, AgentWsMessage, ClientWsMessage, TurnData } from './agent-session.js';

// ── Intent Router ─────────────────────────────────────────────
export { IntentRouter, composeSystemPrompt } from './intent-router.js';
export type { IntentRouterDeps, IntentResult, ScoredCapability } from './intent-router.js';

// ── Capability Types ──────────────────────────────────────────
export type { CapabilityManifest } from './capability-registry.js';

// ── Learning Engine ─────────────────────────────────────────
export { LearningEngine } from './learning-engine.js';

// ── Marketplace MCP ──────────────────────────────────────────
export { MarketplaceMcp } from './marketplace-mcp.js';

// ── Skill Types ─────────────────────────────────────────────
export type {
  SkillFrontmatter,
  RunAgentOptions,
  SkillRedis,
  SkillContext,
  SkillResult,
  Skill,
} from './skill-types.js';

// ── Prompts ─────────────────────────────────────────────────
export {
  researchPrompt,
  planPrompt,
  executePrompt,
  verifyPrompt,
  COMPLEXITY_PROMPT,
  SELF_REFLECTION_PROMPT,
  subagentPrompt,
  CONTAINER_RESEARCH_CONTEXT,
} from './prompts.js';

// ── Utils ───────────────────────────────────────────────────
export {
  chunkForWhatsApp,
  todayISO,
  buildLearnedEntry,
  buildFailedEntry,
} from './utils.js';
