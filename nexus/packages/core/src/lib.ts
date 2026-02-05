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
  loopIterationPrompt,
  SUBAGENT_ROUTING_PROMPT,
} from './prompts.js';

// ── Utils ───────────────────────────────────────────────────
export {
  chunkForWhatsApp,
  todayISO,
  buildLearnedEntry,
  buildFailedEntry,
} from './utils.js';
