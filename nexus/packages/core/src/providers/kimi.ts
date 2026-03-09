/**
 * KimiProvider — AI provider for LivOS using Kimi's OpenAI-compatible API.
 * Implements the AIProvider interface with chat, streaming, tool calling, and model tiers.
 * Uses raw fetch() against api.kimi.com/coding/v1 (no SDK dependency).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, hostname, platform, release } from 'node:os';
import type { Redis } from 'ioredis';
import type {
  AIProvider,
  ProviderChatOptions,
  ProviderChatResult,
  ProviderStreamResult,
  ProviderStreamChunk,
  ModelTier,
  ToolUseBlock,
  ToolDefinition,
} from './types.js';
import { prepareForProvider } from './normalize.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KIMI_MODELS: Record<string, string> = {
  flash: 'kimi-for-coding',
  haiku: 'kimi-for-coding',
  sonnet: 'kimi-for-coding',
  opus: 'kimi-for-coding',
};

const BASE_URL = 'https://api.kimi.com/coding/v1';
const API_KEY_REDIS_KEY = 'nexus:config:kimi_api_key';
const MODELS_REDIS_KEY = 'nexus:config:kimi_models';
const MODEL_CACHE_TTL_MS = 60_000; // 60 seconds
const KIMI_CLI_VERSION = '1.17.0';

// Read device ID once at startup
let DEVICE_ID = '';
try {
  DEVICE_ID = readFileSync(join(homedir(), '.kimi', 'device_id'), 'utf-8').trim();
} catch { /* no device_id file */ }

/** Headers required by Kimi API to identify as a coding agent */
function getKimiHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': `KimiCLI/${KIMI_CLI_VERSION}`,
    'X-Msh-Platform': 'kimi_cli',
    'X-Msh-Version': KIMI_CLI_VERSION,
    'X-Msh-Device-Name': hostname(),
    'X-Msh-Device-Model': `${platform()} ${release()}`,
    'X-Msh-Os-Version': release(),
  };
  if (DEVICE_ID) headers['X-Msh-Device-Id'] = DEVICE_ID;
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  return headers;
}

// ---------------------------------------------------------------------------
// OpenAI-compatible types (internal, not exported)
// ---------------------------------------------------------------------------

interface OpenAIFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAIStreamChunk {
  id: string;
  choices: Array<{
    delta: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface OpenAIChatResponse {
  id: string;
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ---------------------------------------------------------------------------
// Helper: Translate tool definitions to OpenAI function format
// ---------------------------------------------------------------------------

/**
 * Convert a tool definition (input_schema) to an OpenAI function tool (parameters).
 * This is a straightforward field rename: input_schema -> parameters.
 */
function translateToolDefinition(tool: ToolDefinition): OpenAIFunctionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.input_schema.properties,
        required: tool.input_schema.required,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: Convert Anthropic-format raw messages to OpenAI format
// ---------------------------------------------------------------------------

/**
 * The agent loop builds provider messages in Anthropic format (tool_use / tool_result
 * content blocks). Kimi uses the OpenAI format (tool_calls on assistant, role: 'tool'
 * for results). This function converts on the fly.
 */
function convertRawMessages(raw: unknown[]): OpenAIChatMessage[] {
  const out: OpenAIChatMessage[] = [];

  for (const msg of raw as Array<{ role: string; content: unknown; _reasoning?: string }>) {
    // Plain text message — pass through
    if (typeof msg.content === 'string') {
      out.push({ role: msg.role as any, content: msg.content });
      continue;
    }

    // Array content — could be Anthropic-style content blocks
    if (!Array.isArray(msg.content)) {
      out.push(msg as OpenAIChatMessage);
      continue;
    }

    const blocks = msg.content as Array<{ type: string; [k: string]: unknown }>;

    if (msg.role === 'assistant') {
      // Convert assistant content blocks → OpenAI assistant with tool_calls
      const textParts: string[] = [];
      const toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];

      for (const b of blocks) {
        if (b.type === 'text') {
          textParts.push(b.text as string);
        } else if (b.type === 'tool_use') {
          toolCalls.push({
            id: b.id as string,
            type: 'function',
            function: {
              name: b.name as string,
              arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input),
            },
          });
        }
      }

      const assistantMsg: any = {
        role: 'assistant',
        content: textParts.join('\n') || null,
      };
      if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
      // Kimi's thinking model requires reasoning_content in assistant messages
      if (msg._reasoning) assistantMsg.reasoning_content = msg._reasoning;
      out.push(assistantMsg);

    } else if (msg.role === 'user') {
      // Convert user tool_result blocks → OpenAI role: 'tool' messages
      let hasToolResults = false;
      for (const b of blocks) {
        if (b.type === 'tool_result') {
          hasToolResults = true;
          out.push({
            role: 'tool',
            content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content),
            tool_call_id: b.tool_use_id as string,
          });
        }
      }
      // If no tool results, pass as regular user message
      if (!hasToolResults) {
        out.push({ role: 'user', content: blocks.map(b => (b as any).text || '').join('\n') });
      }

    } else {
      out.push(msg as OpenAIChatMessage);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Helper: Parse tool call arguments (string or object)
// ---------------------------------------------------------------------------

/**
 * Handle Kimi's tool call arguments which may be a JSON string or already parsed object.
 * Returns an empty object on parse failure rather than crashing the agent loop.
 */
function parseToolArguments(args: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof args === 'object' && args !== null) {
    return args;
  }

  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch (err) {
      logger.warn('KimiProvider: failed to parse tool call arguments', {
        raw: typeof args === 'string' ? args.slice(0, 200) : String(args),
      });
      return {};
    }
  }

  return {};
}

// ---------------------------------------------------------------------------
// Helper: Map OpenAI finish_reason to internal stop_reason
// ---------------------------------------------------------------------------

function mapStopReason(finishReason: string | null): string {
  switch (finishReason) {
    case 'stop':
      return 'end_turn';
    case 'tool_calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      return finishReason || 'end_turn';
  }
}

// ---------------------------------------------------------------------------
// KimiProvider
// ---------------------------------------------------------------------------

const KIMI_OAUTH_HOST = 'https://auth.kimi.com';
const KIMI_CLIENT_ID = '17e5f671-d194-4dfb-9706-5516cb48c098';
const CRED_FILE = join(homedir(), '.kimi', 'credentials', 'kimi-code.json');
const TOKEN_REFRESH_MARGIN_S = 60; // refresh 60s before expiry

interface KimiOAuthCreds {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  token_type?: string;
}

export class KimiProvider implements AIProvider {
  readonly id = 'kimi';
  readonly supportsVision = false; // Kimi K2.5 vision TBD
  readonly supportsToolCalling = true;

  private redis: Redis | null = null;
  private cachedToken: string = '';
  private tokenExpiresAt: number = 0;
  private refreshing: Promise<string> | null = null;
  private cachedModels: Record<string, string> | null = null;
  private modelsCachedAt: number = 0;

  constructor(redis?: Redis) {
    this.redis = redis ?? null;
  }

  // -------------------------------------------------------------------------
  // OAuth token management (read from CLI credentials, auto-refresh)
  // -------------------------------------------------------------------------

  private async getApiKey(): Promise<string> {
    // Return cached token if still valid
    const now = Date.now() / 1000;
    if (this.cachedToken && now < this.tokenExpiresAt - TOKEN_REFRESH_MARGIN_S) {
      return this.cachedToken;
    }

    // Prevent concurrent refresh
    if (this.refreshing) return this.refreshing;

    this.refreshing = this._refreshToken().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private async _refreshToken(): Promise<string> {
    // Read credentials file
    let creds: KimiOAuthCreds;
    try {
      const raw = readFileSync(CRED_FILE, 'utf-8');
      creds = JSON.parse(raw);
    } catch {
      throw new Error('Kimi not authenticated — no credentials file found. Please sign in via Settings.');
    }

    const now = Date.now() / 1000;

    // If access token is still valid, use it
    if (creds.access_token && now < creds.expires_at - TOKEN_REFRESH_MARGIN_S) {
      this.cachedToken = creds.access_token;
      this.tokenExpiresAt = creds.expires_at;
      // Also sync to Redis for status checks
      if (this.redis) {
        this.redis.set(API_KEY_REDIS_KEY, creds.access_token).catch(() => {});
        this.redis.set('nexus:kimi:authenticated', '1').catch(() => {});
      }
      return creds.access_token;
    }

    // Need to refresh
    if (!creds.refresh_token) {
      throw new Error('Kimi token expired and no refresh token available. Please sign in again.');
    }

    logger.info('KimiProvider: refreshing OAuth token...');
    const kimiHeaders = getKimiHeaders('');
    const response = await fetch(`${KIMI_OAUTH_HOST}/api/oauth/token`, {
      method: 'POST',
      headers: {
        ...kimiHeaders,
        'Content-Type': 'application/x-www-form-urlencoded',  // must override JSON for OAuth
      },
      body: new URLSearchParams({
        client_id: KIMI_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: creds.refresh_token,
      }),
    });

    const data = await response.json() as Record<string, any>;

    if (response.status === 401 || response.status === 403) {
      throw new Error('Kimi refresh token expired. Please sign in again via Settings.');
    }
    if (!response.ok) {
      throw new Error(`Kimi token refresh failed: ${data.error_description || response.status}`);
    }

    // Save new credentials to file (same format as kimi CLI)
    const newCreds: KimiOAuthCreds = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || creds.refresh_token,
      expires_at: data.expires_at || (Date.now() / 1000 + (data.expires_in || 900)),
      scope: data.scope || creds.scope,
      token_type: data.token_type || 'Bearer',
    };

    try {
      writeFileSync(CRED_FILE, JSON.stringify(newCreds));
    } catch (err) {
      logger.warn('KimiProvider: failed to write refreshed credentials', { error: String(err) });
    }

    this.cachedToken = newCreds.access_token;
    this.tokenExpiresAt = newCreds.expires_at;

    // Sync to Redis
    if (this.redis) {
      this.redis.set(API_KEY_REDIS_KEY, newCreds.access_token).catch(() => {});
      this.redis.set('nexus:kimi:authenticated', '1').catch(() => {});
    }

    logger.info('KimiProvider: OAuth token refreshed successfully');
    return newCreds.access_token;
  }

  // -------------------------------------------------------------------------
  // Model tier resolution
  // -------------------------------------------------------------------------

  private async getModelForTier(tier: string): Promise<string> {
    // Check if cached models are still fresh
    if (this.cachedModels && Date.now() - this.modelsCachedAt < MODEL_CACHE_TTL_MS) {
      return this.cachedModels[tier] || KIMI_MODELS[tier] || KIMI_MODELS.sonnet;
    }

    // Try Redis for model overrides
    if (this.redis) {
      try {
        const raw = await this.redis.get(MODELS_REDIS_KEY);
        if (raw) {
          const overrides = JSON.parse(raw) as Record<string, string>;
          this.cachedModels = overrides;
          this.modelsCachedAt = Date.now();
          return overrides[tier] || KIMI_MODELS[tier] || KIMI_MODELS.sonnet;
        }
      } catch (err: any) {
        logger.warn('KimiProvider: failed to read model overrides from Redis', { error: err.message });
      }
    }

    // Fall back to hardcoded defaults
    this.cachedModels = { ...KIMI_MODELS };
    this.modelsCachedAt = Date.now();
    return KIMI_MODELS[tier] || KIMI_MODELS.sonnet;
  }

  // -------------------------------------------------------------------------
  // chat() — Non-streaming completion
  // -------------------------------------------------------------------------

  async chat(options: ProviderChatOptions): Promise<ProviderChatResult> {
    const tier = options.tier || 'sonnet';
    const model = await this.getModelForTier(tier);
    const apiKey = await this.getApiKey();

    // Build messages
    const kimiMessages: OpenAIChatMessage[] = [];

    // System message
    if (options.systemPrompt) {
      kimiMessages.push({ role: 'system', content: options.systemPrompt });
    }

    // User/assistant messages
    if (options.rawMessages) {
      kimiMessages.push(...convertRawMessages(options.rawMessages as unknown[]));
    } else {
      const prepared = prepareForProvider(options.messages, 'kimi') as Array<{ role: string; content: string }>;
      for (const msg of prepared) {
        kimiMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Build request body
    const body: Record<string, unknown> = {
      model,
      messages: kimiMessages,
      stream: false,
    };

    if (options.maxOutputTokens) {
      body.max_tokens = options.maxOutputTokens;
    }

    // Translate tools if provided
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(translateToolDefinition);
    }

    // Make request
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: getKimiHeaders(apiKey),
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      logger.error('KimiProvider: fetch failed', { error: err.message });
      throw new Error(`KimiProvider: network error: ${err.message}`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('KimiProvider: API error', { status: response.status, body: errorBody.slice(0, 500) });
      throw new Error(`KimiProvider: API error ${response.status}: ${errorBody.slice(0, 500)}`);
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const choice = data.choices[0];

    // Extract text
    const text = choice.message.content || '';

    // Extract tool calls
    const toolCalls: ToolUseBlock[] = [];
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        toolCalls.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: parseToolArguments(tc.function.arguments),
        });
      }
    }

    return {
      text,
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      provider: 'kimi',
      model,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: mapStopReason(choice.finish_reason),
    };
  }

  // -------------------------------------------------------------------------
  // chatStream() — SSE streaming completion
  // -------------------------------------------------------------------------

  chatStream(options: ProviderChatOptions): ProviderStreamResult {
    const tier = options.tier || 'sonnet';
    let resolvedModel = KIMI_MODELS[tier] || KIMI_MODELS.sonnet;

    let finalInputTokens = 0;
    let finalOutputTokens = 0;
    const self = this;

    async function* generate(): AsyncGenerator<ProviderStreamChunk> {
      const model = await self.getModelForTier(tier);
      resolvedModel = model;
      const apiKey = await self.getApiKey();

      // Build messages
      const kimiMessages: OpenAIChatMessage[] = [];

      if (options.systemPrompt) {
        kimiMessages.push({ role: 'system', content: options.systemPrompt });
      }

      if (options.rawMessages) {
        kimiMessages.push(...convertRawMessages(options.rawMessages as unknown[]));
      } else {
        const prepared = prepareForProvider(options.messages, 'kimi') as Array<{ role: string; content: string }>;
        for (const msg of prepared) {
          kimiMessages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          });
        }
      }

      // Build request body
      const body: Record<string, unknown> = {
        model,
        messages: kimiMessages,
        stream: true,
      };

      if (options.maxOutputTokens) {
        body.max_tokens = options.maxOutputTokens;
      }

      if (options.tools && options.tools.length > 0) {
        body.tools = options.tools.map(translateToolDefinition);
      }

      // Make streaming request
      let response: Response;
      try {
        response = await fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: getKimiHeaders(apiKey),
          body: JSON.stringify(body),
        });
      } catch (err: any) {
        logger.error('KimiProvider: stream fetch failed', { error: err.message });
        yield { text: '', done: true };
        throw new Error(`KimiProvider: network error: ${err.message}`);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error('KimiProvider: stream API error', { status: response.status, body: errorBody.slice(0, 500) });
        yield { text: '', done: true };
        throw new Error(`KimiProvider: API error ${response.status}: ${errorBody.slice(0, 500)}`);
      }

      if (!response.body) {
        logger.error('KimiProvider: no response body for stream');
        yield { text: '', done: true };
        return;
      }

      // Track pending tool calls during streaming
      const pendingToolCalls: Map<number, { id: string; name: string; args: string }> = new Map();
      let lastStopReason = '';
      let buffer = '';

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines from the buffer
          const lines = buffer.split('\n');
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith(':')) continue;

            // SSE data lines — Kimi may send "data:" or "data: " (both valid SSE)
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5);

            // Check for stream end
            if (data === '[DONE]') {
              // Emit any remaining pending tool calls
              if (pendingToolCalls.size > 0) {
                for (const [, tc] of pendingToolCalls) {
                  yield {
                    text: '',
                    done: false,
                    toolUse: {
                      type: 'tool_use',
                      id: tc.id,
                      name: tc.name,
                      input: parseToolArguments(tc.args),
                    },
                  };
                }
                pendingToolCalls.clear();
              }
              yield { text: '', done: true, stopReason: lastStopReason || 'end_turn' };
              return;
            }

            // Parse chunk JSON
            let chunk: OpenAIStreamChunk;
            try {
              chunk = JSON.parse(data) as OpenAIStreamChunk;
            } catch {
              logger.warn('KimiProvider: failed to parse SSE chunk', { data: data.slice(0, 200) });
              continue;
            }

            // Extract usage if present (some providers include in final chunks)
            if (chunk.usage) {
              finalInputTokens = chunk.usage.prompt_tokens;
              finalOutputTokens = chunk.usage.completion_tokens;
            }

            const choice = chunk.choices?.[0];
            if (!choice) continue;

            // Track finish reason
            if (choice.finish_reason) {
              lastStopReason = mapStopReason(choice.finish_reason);
            }

            // Handle reasoning_content (Kimi's thinking/CoT)
            if ((choice.delta as any).reasoning_content) {
              yield { text: '', done: false, reasoning: (choice.delta as any).reasoning_content };
            }

            // Handle text content delta
            if (choice.delta.content) {
              yield { text: choice.delta.content, done: false };
            }

            // Handle tool call deltas
            if (choice.delta.tool_calls) {
              for (const tcDelta of choice.delta.tool_calls) {
                const idx = tcDelta.index;

                if (!pendingToolCalls.has(idx)) {
                  // New tool call — id and name come in the first chunk
                  pendingToolCalls.set(idx, {
                    id: tcDelta.id || '',
                    name: tcDelta.function?.name || '',
                    args: tcDelta.function?.arguments || '',
                  });
                } else {
                  // Update existing tool call
                  const existing = pendingToolCalls.get(idx)!;
                  if (tcDelta.id) existing.id = tcDelta.id;
                  if (tcDelta.function?.name) existing.name = tcDelta.function.name;
                  if (tcDelta.function?.arguments) existing.args += tcDelta.function.arguments;
                }
              }
            }

            // If finish_reason indicates tool calls are complete, emit them
            if (choice.finish_reason === 'tool_calls' && pendingToolCalls.size > 0) {
              for (const [, tc] of pendingToolCalls) {
                yield {
                  text: '',
                  done: false,
                  toolUse: {
                    type: 'tool_use',
                    id: tc.id,
                    name: tc.name,
                    input: parseToolArguments(tc.args),
                  },
                };
              }
              pendingToolCalls.clear();
            }
          }
        }

        // If stream ended without [DONE], emit final chunk
        yield { text: '', done: true, stopReason: lastStopReason || 'end_turn' };
      } catch (err: any) {
        logger.error('KimiProvider.chatStream error', { error: err.message });
        yield { text: '', done: true };
        throw err;
      }
    }

    return {
      stream: generate(),
      getUsage: () => ({ inputTokens: finalInputTokens, outputTokens: finalOutputTokens }),
      provider: 'kimi',
      model: resolvedModel,
    };
  }

  // -------------------------------------------------------------------------
  // think() — Simple text completion
  // -------------------------------------------------------------------------

  async think(options: { prompt: string; systemPrompt?: string; tier?: ModelTier; maxTokens?: number }): Promise<string> {
    const result = await this.chat({
      systemPrompt: options.systemPrompt || 'You are a helpful assistant.',
      messages: [{ role: 'user', content: options.prompt }],
      tier: options.tier,
      maxOutputTokens: options.maxTokens,
    });
    return result.text;
  }

  // -------------------------------------------------------------------------
  // isAvailable() — Check if API key is configured
  // -------------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    try {
      await this.getApiKey();
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // getModels() — Return current model tier mapping
  // -------------------------------------------------------------------------

  getModels(): Record<string, string> {
    // Return cached models if available and fresh, otherwise defaults
    if (this.cachedModels && Date.now() - this.modelsCachedAt < MODEL_CACHE_TTL_MS) {
      return { ...this.cachedModels };
    }
    return { ...KIMI_MODELS };
  }
}
