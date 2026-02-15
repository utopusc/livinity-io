/**
 * Nexus Configuration Schema
 * Comprehensive Zod validation for all Nexus settings.
 * Inspired by OpenClaw's configuration system.
 */

import { z } from 'zod';

// ─── Retry Configuration ───────────────────────────────────────────────────

export const RetryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  attempts: z.number().int().min(1).max(10).default(5), // Increased default for better resilience
  minDelayMs: z.number().int().min(0).max(60000).default(1000),
  maxDelayMs: z.number().int().min(0).max(300000).default(30000),
  jitter: z.number().min(0).max(1).default(0.2),
}).strict().optional();

// ─── Model Configuration ───────────────────────────────────────────────────

export const ModelTierSchema = z.enum(['none', 'flash', 'haiku', 'sonnet', 'opus']);

export const ModelConfigSchema = z.object({
  primary: z.string().optional(),
  fallbacks: z.array(z.string()).optional(),
}).strict().optional();

export const ModelsConfigSchema = z.object({
  default: z.string().default('gemini-3-flash-preview'),
  flash: z.string().default('gemini-3-flash-preview'),
  haiku: z.string().default('gemini-3-flash-preview'),
  sonnet: z.string().default('gemini-3-flash-preview'),
  opus: z.string().default('gemini-2.5-pro'),
  fallbackEnabled: z.boolean().default(true),
  fallbackOrder: z.array(z.string()).default(['flash', 'haiku', 'sonnet', 'opus']),
}).strict().optional();

// ─── Agent Configuration ───────────────────────────────────────────────────

export const ThinkingLevelSchema = z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']);

export const AgentDefaultsSchema = z.object({
  maxTurns: z.number().int().min(1).max(100).default(30),
  maxTokens: z.number().int().min(1000).max(1000000).default(200000),
  timeoutMs: z.number().int().min(10000).max(3600000).default(600000),
  tier: ModelTierSchema.default('sonnet'),
  maxDepth: z.number().int().min(1).max(10).default(3),
  thinkingLevel: ThinkingLevelSchema.default('off'),
  streamEnabled: z.boolean().default(true),
}).strict().optional();

export const SubagentConfigSchema = z.object({
  maxConcurrent: z.number().int().min(1).max(20).default(8),
  maxTurns: z.number().int().min(1).max(100).default(15), // Increased from max 20 to 100, default 15
  maxTokens: z.number().int().min(1000).max(200000).default(50000),
  timeoutMs: z.number().int().min(10000).max(600000).default(120000),
  archiveAfterMinutes: z.number().int().min(1).max(1440).default(60),
}).strict().optional();

// ─── Tool Configuration ───────────────────────────────────────────────────

export const ToolProfileSchema = z.enum(['minimal', 'basic', 'coding', 'messaging', 'full']);

export const ToolPolicySchema = z.object({
  profile: ToolProfileSchema.default('full'),
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
  alsoAllow: z.array(z.string()).optional(),
}).strict().optional();

export const ExecConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timeoutSec: z.number().int().min(1).max(3600).default(300),
  backgroundMs: z.number().int().min(1000).max(300000).default(30000),
  safeBins: z.array(z.string()).optional(),
  pathPrepend: z.array(z.string()).optional(),
}).strict().optional();

// ─── Session Configuration ───────────────────────────────────────────────────

export const SessionResetModeSchema = z.enum(['daily', 'idle', 'manual']);

export const SessionResetConfigSchema = z.object({
  mode: SessionResetModeSchema.default('daily'),
  atHour: z.number().int().min(0).max(23).default(4),
  idleMinutes: z.number().int().min(5).max(1440).default(60),
  triggers: z.array(z.string()).default(['/new', '/reset', '/clear']),
}).strict().optional();

export const SessionConfigSchema = z.object({
  scope: z.enum(['per-sender', 'global']).default('per-sender'),
  idleMinutes: z.number().int().min(5).max(1440).default(60),
  reset: SessionResetConfigSchema,
  maxHistoryMessages: z.number().int().min(10).max(500).default(100),
}).strict().optional();

// ─── Memory Configuration ───────────────────────────────────────────────────

export const MemorySearchConfigSchema = z.object({
  enabled: z.boolean().default(true),
  provider: z.enum(['cognee', 'local', 'openai']).default('cognee'),
  maxResults: z.number().int().min(1).max(50).default(10),
  minScore: z.number().min(0).max(1).default(0.5),
}).strict().optional();

// ─── Context Pruning ───────────────────────────────────────────────────────

export const ContextPruningConfigSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.enum(['off', 'cache-ttl', 'auto']).default('auto'),
  ttlMinutes: z.number().int().min(1).max(1440).default(30),
  keepLastAssistants: z.number().int().min(1).max(50).default(10),
  softTrimRatio: z.number().min(0).max(1).default(0.7),
  hardClearRatio: z.number().min(0).max(1).default(0.9),
}).strict().optional();

// ─── Heartbeat Configuration ───────────────────────────────────────────────────

export const HeartbeatConfigSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMinutes: z.number().int().min(5).max(1440).default(30),
  activeHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    timezone: z.string().default('UTC'),
  }).strict().optional(),
  prompt: z.string().max(1000).optional(),
  target: z.enum(['telegram', 'discord', 'all', 'none']).default('telegram'),
}).strict().optional();

// ─── TTS Configuration ───────────────────────────────────────────────────────

export const TtsProviderSchema = z.enum(['elevenlabs', 'openai', 'edge', 'off']);

export const TtsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: TtsProviderSchema.default('off'),
  voiceId: z.string().optional(),
  modelId: z.string().optional(),
  autoMode: z.enum(['off', 'always', 'inbound', 'tagged']).default('off'),
}).strict().optional();

// ─── Logging Configuration ───────────────────────────────────────────────────

export const LogLevelSchema = z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']);

export const LoggingConfigSchema = z.object({
  level: LogLevelSchema.default('info'),
  file: z.string().optional(),
  consoleLevel: LogLevelSchema.default('info'),
  consoleStyle: z.enum(['pretty', 'compact', 'json']).default('pretty'),
  redactSensitive: z.boolean().default(true),
}).strict().optional();

// ─── Diagnostics Configuration ───────────────────────────────────────────────

export const DiagnosticsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  otel: z.object({
    enabled: z.boolean().default(false),
    endpoint: z.string().optional(),
    serviceName: z.string().default('nexus'),
    traces: z.boolean().default(true),
    metrics: z.boolean().default(true),
  }).strict().optional(),
}).strict().optional();

// ─── API Configuration ───────────────────────────────────────────────────────

export const ApiConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3030),
  host: z.string().default('0.0.0.0'),
  corsOrigins: z.array(z.string()).default(['*']),
  rateLimit: z.object({
    enabled: z.boolean().default(true),
    maxRequests: z.number().int().min(1).max(10000).default(100),
    windowMs: z.number().int().min(1000).max(3600000).default(60000),
  }).strict().optional(),
}).strict().optional();

// ─── Channels Configuration ───────────────────────────────────────────────────

export const WhatsAppConfigSchema = z.object({
  enabled: z.boolean().default(true),
  commandPrefix: z.string().default('!'),
  historyLimit: z.number().int().min(1).max(100).default(20),
  mentionPatterns: z.array(z.string()).optional(),
}).strict().optional();

export const ChannelsConfigSchema = z.object({
  whatsapp: WhatsAppConfigSchema,
}).strict().optional();

// ─── Skills Configuration ───────────────────────────────────────────────────

export const SkillsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  allowBundled: z.array(z.string()).optional(),
  load: z.object({
    extraDirs: z.array(z.string()).optional(),
    watch: z.boolean().default(false),
  }).strict().optional(),
  entries: z.record(z.string(), z.object({
    enabled: z.boolean().default(true),
    config: z.record(z.string(), z.unknown()).optional(),
  }).strict()).optional(),
}).strict().optional();

// ─── Message Queue Configuration ───────────────────────────────────────────

export const QueueModeSchema = z.enum(['steer', 'followup', 'collect', 'queue', 'interrupt']);

export const MessageQueueConfigSchema = z.object({
  mode: QueueModeSchema.default('steer'),
  debounceMs: z.number().int().min(0).max(10000).default(500),
  cap: z.number().int().min(1).max(100).default(10),
  drop: z.enum(['old', 'new', 'summarize']).default('old'),
}).strict().optional();

// ─── Response Style Configuration ───────────────────────────────────────────

export const ResponseStyleSchema = z.enum(['detailed', 'concise', 'direct']);

export const ResponseConfigSchema = z.object({
  style: ResponseStyleSchema.default('detailed'),
  showSteps: z.boolean().default(true),
  showReasoning: z.boolean().default(true),
  language: z.string().default('auto'),
  maxLength: z.number().int().min(100).max(10000).optional(),
}).strict().optional();

// ─── Approval Configuration ───────────────────────────────────────────────────

export const ApprovalPolicySchema = z.enum(['always', 'destructive', 'never']);

export const ApprovalConfigSchema = z.object({
  /** Policy: 'always' = approve all tools, 'destructive' = only requiresApproval tools, 'never' = auto-approve */
  policy: ApprovalPolicySchema.default('destructive'),
  /** Timeout in milliseconds for approval requests (default: 5 minutes) */
  timeoutMs: z.number().int().min(10000).max(3600000).default(300000),
  /** Whether to log all approvals to audit trail */
  auditEnabled: z.boolean().default(true),
}).strict().optional();

// ─── Main Nexus Configuration Schema ───────────────────────────────────────

export const NexusConfigSchema = z.object({
  // Meta
  version: z.string().default('1.0.0'),
  updatedAt: z.string().optional(),

  // Core settings
  retry: RetryConfigSchema,
  models: ModelsConfigSchema,
  agent: AgentDefaultsSchema,
  subagents: SubagentConfigSchema,

  // Tools
  tools: ToolPolicySchema,
  exec: ExecConfigSchema,

  // Session & Memory
  session: SessionConfigSchema,
  memory: MemorySearchConfigSchema,
  contextPruning: ContextPruningConfigSchema,

  // Features
  heartbeat: HeartbeatConfigSchema,
  tts: TtsConfigSchema,

  // Infrastructure
  logging: LoggingConfigSchema,
  diagnostics: DiagnosticsConfigSchema,
  api: ApiConfigSchema,

  // Integrations
  channels: ChannelsConfigSchema,
  skills: SkillsConfigSchema,
  messageQueue: MessageQueueConfigSchema,

  // Response Style
  response: ResponseConfigSchema,

  // Human-in-the-Loop
  approval: ApprovalConfigSchema,
}).strict();

export type NexusConfig = z.infer<typeof NexusConfigSchema>;
export type RetryConfig = z.infer<typeof RetryConfigSchema>;
export type AgentDefaults = z.infer<typeof AgentDefaultsSchema>;
export type ToolPolicy = z.infer<typeof ToolPolicySchema>;
export type SessionConfig = z.infer<typeof SessionConfigSchema>;
export type TtsConfig = z.infer<typeof TtsConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type ResponseConfig = z.infer<typeof ResponseConfigSchema>;
export type ApprovalConfig = z.infer<typeof ApprovalConfigSchema>;

// ─── Default Configuration ───────────────────────────────────────────────────

export const DEFAULT_NEXUS_CONFIG: NexusConfig = {
  version: '1.0.0',
  retry: {
    enabled: true,
    attempts: 5,
    minDelayMs: 1000,
    maxDelayMs: 30000,
    jitter: 0.2,
  },
  models: {
    default: 'gemini-3-flash-preview',
    flash: 'gemini-3-flash-preview',
    haiku: 'gemini-3-flash-preview',
    sonnet: 'gemini-3-flash-preview',
    opus: 'gemini-2.5-pro',
    fallbackEnabled: true,
    fallbackOrder: ['flash', 'haiku', 'sonnet', 'opus'],
  },
  agent: {
    maxTurns: 30,
    maxTokens: 200000,
    timeoutMs: 600000,
    tier: 'sonnet',
    maxDepth: 3,
    thinkingLevel: 'off',
    streamEnabled: true,
  },
  subagents: {
    maxConcurrent: 8,
    maxTurns: 15, // Increased default for complex subagent tasks
    maxTokens: 50000,
    timeoutMs: 120000,
    archiveAfterMinutes: 60,
  },
  tools: {
    profile: 'full',
  },
  exec: {
    enabled: true,
    timeoutSec: 300,
    backgroundMs: 30000,
  },
  session: {
    scope: 'per-sender',
    idleMinutes: 60,
    reset: {
      mode: 'daily',
      atHour: 4,
      idleMinutes: 60,
      triggers: ['/new', '/reset', '/clear'],
    },
    maxHistoryMessages: 100,
  },
  memory: {
    enabled: true,
    provider: 'cognee',
    maxResults: 10,
    minScore: 0.5,
  },
  contextPruning: {
    enabled: true,
    mode: 'auto',
    ttlMinutes: 30,
    keepLastAssistants: 10,
    softTrimRatio: 0.7,
    hardClearRatio: 0.9,
  },
  heartbeat: {
    enabled: false,
    intervalMinutes: 30,
    target: 'telegram',
  },
  tts: {
    enabled: false,
    provider: 'off',
    autoMode: 'off',
  },
  logging: {
    level: 'info',
    consoleLevel: 'info',
    consoleStyle: 'pretty',
    redactSensitive: true,
  },
  diagnostics: {
    enabled: false,
  },
  api: {
    port: 3030,
    host: '0.0.0.0',
    corsOrigins: ['*'],
  },
  channels: {
    whatsapp: {
      enabled: true,
      commandPrefix: '!',
      historyLimit: 20,
    },
  },
  skills: {
    enabled: true,
  },
  messageQueue: {
    mode: 'steer',
    debounceMs: 500,
    cap: 10,
    drop: 'old',
  },
  response: {
    style: 'detailed',
    showSteps: true,
    showReasoning: true,
    language: 'auto',
  },
  approval: {
    policy: 'destructive',
    timeoutMs: 300000,
    auditEnabled: true,
  },
};

export default NexusConfigSchema;
