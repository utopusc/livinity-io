import type { ToolRegistry } from './tool-registry.js';
import type { Tool, ToolResult } from './types.js';
import type { AgentResult } from './agent.js';
import type { SkillManifest } from './skill-manifest.js';

/** YAML frontmatter parsed from skill files */
export interface SkillFrontmatter {
  name: string;
  description: string;
  /** Tool names this skill is allowed to use */
  tools: string[];
  /** Trigger patterns — regex strings or keywords that route messages to this skill */
  triggers: string[];
  /** Model tier for this skill's agent loop */
  model_tier: 'flash' | 'sonnet' | 'opus';
  /** Optional: custom tools this skill registers */
  custom_tools?: string[];
  /** Skill type: 'simple' runs handler directly, 'autonomous' runs multi-phase pipeline */
  type?: 'simple' | 'autonomous';
  /** Phase names for autonomous skills (e.g. ['research', 'plan', 'execute', 'verify']) */
  phases?: string[];
  /** Max agent turns per phase */
  max_turns?: number;
  /** Max tokens per phase */
  max_tokens?: number;
  /** Timeout in ms per phase */
  timeout_ms?: number;
}

/** Options for spawning a focused agent within a skill */
export interface RunAgentOptions {
  /** Task description for the agent */
  task: string;
  /** System prompt override (phase-specific prompt) */
  systemPrompt?: string;
  /** Context to prepend to the task (research results, plan, etc.) */
  contextPrefix?: string;
  /** Tool names the agent can use (defaults to skill's declared tools) */
  tools?: string[];
  /** Model tier override */
  tier?: 'flash' | 'sonnet' | 'opus';
  /** Max turns for this agent run */
  maxTurns?: number;
  /** Max tokens for this agent run */
  maxTokens?: number;
  /** Timeout in ms */
  timeoutMs?: number;
}

/** Redis helper interface for skill state persistence */
export interface SkillRedis {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
  del: (key: string) => Promise<void>;
  keys: (pattern: string) => Promise<string[]>;
}

/** Context passed to a skill handler when invoked */
export interface SkillContext {
  /** The raw user message that triggered this skill */
  message: string;
  /** Parsed parameters from the trigger match */
  params: Record<string, unknown>;
  /** Source of the message */
  source: string;
  /** Access to the tool registry (scoped to skill's declared tools) */
  toolRegistry: ToolRegistry;
  /** Execute a tool by name */
  executeTool: (name: string, params: Record<string, unknown>) => Promise<ToolResult>;
  /** Spawn a focused AgentLoop with custom system prompt + scoped tools */
  runAgent: (options: RunAgentOptions) => Promise<AgentResult>;
  /** Redis state persistence (key prefix: nexus:task_state:) */
  redis: SkillRedis;
  /** Send a WhatsApp progress update without ending the agent loop */
  sendProgress: (message: string) => Promise<void>;
  /** One-shot Brain call for classification/synthesis (no tool use) */
  think: (prompt: string, options?: { tier?: 'flash' | 'sonnet' | 'opus'; maxTokens?: number; systemPrompt?: string }) => Promise<string>;
  /** WhatsApp sender JID (if triggered from WhatsApp) */
  whatsappJid?: string;
}

/** Result returned by a skill handler */
export interface SkillResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/** A loaded skill */
export interface Skill {
  /** Parsed frontmatter */
  meta: SkillFrontmatter;
  /** The handler function */
  handler: (ctx: SkillContext) => Promise<SkillResult>;
  /** Custom tools to register */
  tools?: Tool[];
  /** File path of the skill */
  filePath: string;
  /** Compiled trigger regexes */
  triggerPatterns: RegExp[];
  /** Parsed SKILL.md manifest (for marketplace skills) */
  manifest?: SkillManifest;
  /** Timestamp when this skill was installed from the marketplace */
  installedAt?: number;
  /** Origin of the skill: builtin (bundled) or marketplace (downloaded) */
  source?: 'builtin' | 'marketplace';
}
