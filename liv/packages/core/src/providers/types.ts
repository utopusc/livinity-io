/**
 * Provider-neutral types for multi-provider AI abstraction.
 * All providers implement the AIProvider interface.
 */

export type ModelTier = 'none' | 'haiku' | 'sonnet' | 'opus';

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
  /** Tool definitions for native tool calling */
  tools?: ToolDefinition[];
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
  /** Native tool calls from the provider */
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
  /** Reasoning/thinking content (e.g. Kimi's reasoning_content) */
  reasoning?: string;
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

/** Tool definition format (input_schema style) */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

/** A tool_use content block from provider response */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** A tool_result content block to send back to provider */
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<{ type: string; [k: string]: unknown }>;
  is_error?: boolean;
}

/** Cost per million tokens by provider and tier. */
export const PROVIDER_COST_DEFAULTS = {
  kimi: {
    flash: { input: 0.10, output: 0.40 },
    haiku: { input: 0.10, output: 0.40 },
    sonnet: { input: 0.30, output: 1.20 },
    opus: { input: 0.60, output: 2.40 },
  },
  claude: {
    flash: { input: 0.80, output: 4.00 },
    haiku: { input: 0.80, output: 4.00 },
    sonnet: { input: 3.00, output: 15.00 },
    opus: { input: 15.00, output: 75.00 },
  },
} as const;
