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
