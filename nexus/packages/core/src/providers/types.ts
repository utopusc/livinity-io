/**
 * Provider-neutral types for multi-provider AI abstraction.
 * All providers (Claude, Gemini, OpenAI) implement the AIProvider interface.
 */

export type ModelTier = 'none' | 'flash' | 'haiku' | 'sonnet' | 'opus';

/** Provider-neutral message format. Uses 'assistant' (not 'model'). */
export interface ProviderMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: Array<{ base64: string; mimeType: string }>;
}

/** Options passed to provider chat methods. */
export interface ProviderChatOptions {
  systemPrompt: string;
  messages: ProviderMessage[];
  tier?: ModelTier;
  maxOutputTokens?: number;
  /** Provider-specific options (extended thinking, cache control, etc.) */
  providerOptions?: Record<string, unknown>;
  /** Tool definitions for native tool calling (Claude tool_use) */
  tools?: ClaudeToolDefinition[];
  /** Pre-formatted provider messages (bypasses normalization) */
  rawMessages?: unknown[];
}

/** Non-streaming chat response. */
export interface ProviderChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  provider: string;
  model: string;
  /** Native tool calls from the provider (Claude tool_use blocks) */
  toolCalls?: ToolUseBlock[];
  /** Provider's stop reason (end_turn, tool_use, max_tokens) */
  stopReason?: string;
}

/** A single chunk from a streaming response. */
export interface ProviderStreamChunk {
  text: string;
  done: boolean;
  /** Tool use block completed during streaming */
  toolUse?: ToolUseBlock;
  /** Stop reason from the provider */
  stopReason?: string;
}

/** Streaming chat response with async generator and usage getter. */
export interface ProviderStreamResult {
  stream: AsyncGenerator<ProviderStreamChunk>;
  getUsage: () => { inputTokens: number; outputTokens: number };
  provider: string;
  model: string;
}

/** Core interface all AI providers must implement. */
export interface AIProvider {
  readonly id: string;
  readonly supportsVision: boolean;
  readonly supportsToolCalling: boolean;

  chat(options: ProviderChatOptions): Promise<ProviderChatResult>;
  chatStream(options: ProviderChatOptions): ProviderStreamResult;
  think(options: { prompt: string; systemPrompt?: string; tier?: ModelTier; maxTokens?: number }): Promise<string>;
  isAvailable(): Promise<boolean>;
  getModels(): Record<string, string>;
}

/** Provider configuration shape. */
export interface ProviderConfig {
  id: string;
  priority: number;
  enabled: boolean;
  models: Record<string, string>;
  costPerMillionTokens: { input: number; output: number };
  defaultMaxOutputTokens: number;
}

/** Claude tool definition format (input_schema, not parameters) */
export interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

/** A tool_use content block from Claude's response */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** A tool_result content block to send back to Claude */
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/** Cost per million tokens by provider and tier. */
export const PROVIDER_COST_DEFAULTS = {
  claude: {
    flash: { input: 1.0, output: 5.0 },
    haiku: { input: 1.0, output: 5.0 },
    sonnet: { input: 3.0, output: 15.0 },
    opus: { input: 5.0, output: 25.0 },
  },
  gemini: {
    flash: { input: 0.10, output: 0.40 },
    haiku: { input: 0.10, output: 0.40 },
    sonnet: { input: 0.10, output: 0.40 },
    opus: { input: 1.25, output: 5.0 },
  },
} as const;
