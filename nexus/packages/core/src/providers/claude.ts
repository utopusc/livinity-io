/**
 * ClaudeProvider — Primary AI provider for LivOS using Anthropic's Claude API.
 * Implements the AIProvider interface with chat, streaming, think, and native tool calling.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Redis } from 'ioredis';
import type {
  AIProvider,
  ProviderChatOptions,
  ProviderChatResult,
  ProviderStreamResult,
  ProviderStreamChunk,
  ModelTier,
  ToolUseBlock,
} from './types.js';
import { prepareForProvider } from './normalize.js';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../logger.js';

const execFileAsync = promisify(execFile);

const CLAUDE_MODELS: Record<string, string> = {
  flash: 'claude-haiku-4-5',
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-5',
  opus: 'claude-opus-4-6',
};

const REDIS_KEY = 'nexus:config:anthropic_api_key';
const AUTH_METHOD_KEY = 'nexus:config:claude_auth_method';

export type ClaudeAuthMethod = 'api-key' | 'sdk-subscription';

export class ClaudeProvider implements AIProvider {
  readonly id = 'claude';
  readonly supportsVision = true;
  readonly supportsToolCalling = true;

  private client: Anthropic | null = null;
  private redis: Redis | null = null;
  private cachedApiKey: string = '';
  private cliStatusCache: { installed: boolean; authenticated: boolean; user?: string; checkedAt: number } | null = null;
  /** Active login process (only one at a time) */
  private loginProcess: { proc: ReturnType<typeof spawn>; url?: string; startedAt: number } | null = null;

  constructor(redis?: Redis) {
    this.redis = redis ?? null;
  }

  private async getApiKey(): Promise<string> {
    if (this.redis) {
      try {
        const key = await this.redis.get(REDIS_KEY);
        if (key) return key;
      } catch (err: any) {
        logger.warn('ClaudeProvider: Redis read failed, falling back to env', { error: err.message });
      }
    }

    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey) return envKey;

    throw new Error('No Anthropic API key configured');
  }

  private async getClient(): Promise<Anthropic> {
    const apiKey = await this.getApiKey();

    if (this.client && apiKey === this.cachedApiKey) {
      return this.client;
    }

    this.client = new Anthropic({ apiKey });
    this.cachedApiKey = apiKey;
    return this.client;
  }

  async chat(options: ProviderChatOptions): Promise<ProviderChatResult> {
    const tier = options.tier || 'sonnet';
    const model = CLAUDE_MODELS[tier] || CLAUDE_MODELS.sonnet;
    const maxTokens = options.maxOutputTokens || 4096;
    const claudeMessages = (options.rawMessages as Anthropic.MessageParam[])
      || prepareForProvider(options.messages, 'claude') as Anthropic.MessageParam[];

    const client = await this.getClient();

    const createParams: Anthropic.MessageCreateParams = {
      model,
      max_tokens: maxTokens,
      system: options.systemPrompt,
      messages: claudeMessages,
    };

    if (options.tools && options.tools.length > 0) {
      (createParams as any).tools = options.tools;
    }

    const response = await client.messages.create(createParams);

    // Extract text and tool_use blocks from content
    let text = '';
    const toolCalls: ToolUseBlock[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      provider: 'claude',
      model,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: response.stop_reason || undefined,
    };
  }

  chatStream(options: ProviderChatOptions): ProviderStreamResult {
    const tier = options.tier || 'sonnet';
    const model = CLAUDE_MODELS[tier] || CLAUDE_MODELS.sonnet;
    const maxTokens = options.maxOutputTokens || 4096;
    const claudeMessages = (options.rawMessages as Anthropic.MessageParam[])
      || prepareForProvider(options.messages, 'claude') as Anthropic.MessageParam[];

    let finalInputTokens = 0;
    let finalOutputTokens = 0;
    const self = this;

    async function* generate(): AsyncGenerator<ProviderStreamChunk> {
      const client = await self.getClient();

      const createParams: Anthropic.MessageCreateParams = {
        model,
        max_tokens: maxTokens,
        system: options.systemPrompt,
        messages: claudeMessages,
      };

      if (options.tools && options.tools.length > 0) {
        (createParams as any).tools = options.tools;
      }

      const stream = client.messages.stream(createParams);

      // Track tool_use accumulation
      let currentToolUse: { id: string; name: string; inputJson: string } | null = null;
      let stopReason = '';

      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              yield { text: event.delta.text, done: false };
            } else if (event.delta.type === 'input_json_delta') {
              if (currentToolUse) {
                currentToolUse.inputJson += event.delta.partial_json;
              }
            }
          } else if (event.type === 'content_block_start') {
            if (event.content_block.type === 'tool_use') {
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                inputJson: '',
              };
            }
          } else if (event.type === 'content_block_stop') {
            if (currentToolUse) {
              let input: Record<string, unknown> = {};
              try {
                input = currentToolUse.inputJson ? JSON.parse(currentToolUse.inputJson) : {};
              } catch {
                logger.warn('ClaudeProvider: failed to parse tool input JSON', {
                  raw: currentToolUse.inputJson.slice(0, 200),
                });
              }
              yield {
                text: '',
                done: false,
                toolUse: {
                  type: 'tool_use',
                  id: currentToolUse.id,
                  name: currentToolUse.name,
                  input,
                },
              };
              currentToolUse = null;
            }
          } else if (event.type === 'message_delta') {
            stopReason = (event as any).delta?.stop_reason || '';
          }
        }

        const finalMessage = await stream.finalMessage();
        finalInputTokens = finalMessage.usage.input_tokens;
        finalOutputTokens = finalMessage.usage.output_tokens;

        yield { text: '', done: true, stopReason: stopReason || finalMessage.stop_reason || '' };
      } catch (err: any) {
        logger.error('ClaudeProvider.chatStream error', { error: err.message });
        yield { text: '', done: true };
        throw err;
      }
    }

    return {
      stream: generate(),
      getUsage: () => ({ inputTokens: finalInputTokens, outputTokens: finalOutputTokens }),
      provider: 'claude',
      model,
    };
  }

  async think(options: { prompt: string; systemPrompt?: string; tier?: ModelTier; maxTokens?: number }): Promise<string> {
    const result = await this.chat({
      systemPrompt: options.systemPrompt || 'You are a helpful assistant.',
      messages: [{ role: 'user', content: options.prompt }],
      tier: options.tier,
      maxOutputTokens: options.maxTokens,
    });
    return result.text;
  }

  async isAvailable(): Promise<boolean> {
    const method = await this.getAuthMethod();
    if (method === 'sdk-subscription') {
      const status = await this.getCliStatus();
      return status.installed && status.authenticated;
    }
    try {
      await this.getApiKey();
      return true;
    } catch {
      return false;
    }
  }

  getModels(): Record<string, string> {
    return { ...CLAUDE_MODELS };
  }

  /** Get the configured auth method (api-key or sdk-subscription) */
  async getAuthMethod(): Promise<ClaudeAuthMethod> {
    if (this.redis) {
      try {
        const method = await this.redis.get(AUTH_METHOD_KEY);
        if (method === 'sdk-subscription') return 'sdk-subscription';
      } catch (err: any) {
        logger.warn('ClaudeProvider: failed to read auth method from Redis', { error: err.message });
      }
    }
    return 'api-key';
  }

  /** Check Claude CLI installation and authentication status */
  async getCliStatus(): Promise<{ installed: boolean; authenticated: boolean; user?: string }> {
    // Cache for 30 seconds to avoid spawning processes repeatedly
    if (this.cliStatusCache && Date.now() - this.cliStatusCache.checkedAt < 30_000) {
      return this.cliStatusCache;
    }

    let installed = false;
    let authenticated = false;
    let user: string | undefined;

    try {
      await execFileAsync('claude', ['--version'], { timeout: 5000 });
      installed = true;
    } catch {
      this.cliStatusCache = { installed: false, authenticated: false, checkedAt: Date.now() };
      return this.cliStatusCache;
    }

    try {
      const { stdout } = await execFileAsync('claude', ['auth', 'status'], { timeout: 10000 });
      const output = stdout.toString();
      // CLI v2 returns JSON: {"loggedIn":true/false,"authMethod":"...","apiProvider":"..."}
      try {
        const status = JSON.parse(output);
        authenticated = status.loggedIn === true;
      } catch {
        // Fallback: regex for older CLI versions
        if (/authenticated|logged.?in|active/i.test(output)) {
          authenticated = true;
        }
      }
      const emailMatch = output.match(/[\w.+-]+@[\w.-]+\.\w+/);
      if (emailMatch) user = emailMatch[0];
    } catch {
      // auth status command failed — not authenticated
    }

    this.cliStatusCache = { installed, authenticated, user, checkedAt: Date.now() };
    return this.cliStatusCache;
  }

  /**
   * Start `claude login` in the background and capture the OAuth URL.
   * Returns the URL the user should open in their browser to authenticate.
   * The login process runs in the background — once the user completes auth
   * in the browser, the CLI stores credentials and exits.
   */
  async startLogin(): Promise<{ url?: string; error?: string; alreadyAuthenticated?: boolean }> {
    // Check if already authenticated
    this.cliStatusCache = null; // bust cache
    const status = await this.getCliStatus();
    if (status.authenticated) {
      return { alreadyAuthenticated: true };
    }
    if (!status.installed) {
      return { error: 'Claude CLI is not installed on the server. Run: npm install -g @anthropic-ai/claude-code' };
    }

    // Kill any existing login process
    if (this.loginProcess) {
      try { this.loginProcess.proc.kill(); } catch { /* ignore */ }
      this.loginProcess = null;
    }

    return new Promise((resolve) => {
      const proc = spawn('claude', ['auth', 'login'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, BROWSER: 'echo' }, // Prevent auto-opening browser, just print the URL
        timeout: 300_000, // 5 minute timeout
      });

      this.loginProcess = { proc, startedAt: Date.now() };
      let allOutput = '';
      let resolved = false;

      const tryExtractUrl = (chunk: string) => {
        allOutput += chunk;
        // Look for an HTTPS URL in the output
        const urlMatch = allOutput.match(/https:\/\/[^\s"'<>]+/);
        if (urlMatch && !resolved) {
          resolved = true;
          if (this.loginProcess) this.loginProcess.url = urlMatch[0];
          logger.info('ClaudeProvider: login URL captured', { url: urlMatch[0] });
          resolve({ url: urlMatch[0] });
        }
      };

      proc.stdout?.on('data', (data: Buffer) => tryExtractUrl(data.toString()));
      proc.stderr?.on('data', (data: Buffer) => tryExtractUrl(data.toString()));

      proc.on('close', (code) => {
        logger.info('ClaudeProvider: login process exited', { code });
        this.loginProcess = null;
        // Bust status cache so next poll picks up the new auth state
        this.cliStatusCache = null;
        if (!resolved) {
          resolved = true;
          if (code === 0) {
            resolve({ alreadyAuthenticated: true });
          } else {
            resolve({ error: `Login process exited with code ${code}. Output: ${allOutput.slice(0, 500)}` });
          }
        }
      });

      proc.on('error', (err) => {
        logger.error('ClaudeProvider: login process error', { error: err.message });
        this.loginProcess = null;
        if (!resolved) {
          resolved = true;
          resolve({ error: err.message });
        }
      });

      // If we don't get a URL within 15 seconds, return whatever we have
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ error: `Timed out waiting for login URL. Output so far: ${allOutput.slice(0, 500)}` });
        }
      }, 15_000);
    });
  }

  /**
   * Submit the OAuth code from the browser back to the running `claude auth login` process.
   * The CLI waits for this code on stdin after the user authenticates in the browser.
   */
  submitLoginCode(code: string): { success: boolean; error?: string } {
    if (!this.loginProcess) {
      return { success: false, error: 'No login process running. Click "Authenticate with Claude" first.' };
    }
    const { proc } = this.loginProcess;
    if (!proc.stdin || proc.stdin.destroyed) {
      return { success: false, error: 'Login process stdin is not available.' };
    }
    try {
      proc.stdin.write(code.trim() + '\n');
      logger.info('ClaudeProvider: login code submitted');
      // Bust status cache so polling picks up new auth state
      this.cliStatusCache = null;
      return { success: true };
    } catch (err: any) {
      logger.error('ClaudeProvider: failed to submit login code', { error: err.message });
      return { success: false, error: err.message };
    }
  }
}
