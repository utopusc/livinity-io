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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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

// OAuth PKCE constants (same as Claude Code CLI)
const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const OAUTH_TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const OAUTH_AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const OAUTH_REDIRECT_URI = 'https://platform.claude.com/oauth/code/callback';
const OAUTH_SCOPES = 'org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export type ClaudeAuthMethod = 'api-key' | 'sdk-subscription';

export class ClaudeProvider implements AIProvider {
  readonly id = 'claude';
  readonly supportsVision = true;
  readonly supportsToolCalling = true;

  private client: Anthropic | null = null;
  private redis: Redis | null = null;
  private cachedApiKey: string = '';
  private cliStatusCache: { installed: boolean; authenticated: boolean; user?: string; checkedAt: number } | null = null;
  /** Pending OAuth PKCE flow state */
  private pendingOAuth: { codeVerifier: string; state: string; createdAt: number } | null = null;

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
   * Start a custom PKCE OAuth flow. Generates code_verifier, code_challenge,
   * and returns the authorize URL. The user opens this URL, authenticates,
   * and gets a code which they submit via submitLoginCode().
   */
  async startLogin(): Promise<{ url?: string; error?: string; alreadyAuthenticated?: boolean }> {
    // Check if already authenticated
    this.cliStatusCache = null;
    const status = await this.getCliStatus();
    if (status.authenticated) {
      return { alreadyAuthenticated: true };
    }

    // Generate PKCE parameters
    const codeVerifier = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    const state = base64url(crypto.randomBytes(32));

    // Store for code exchange later
    this.pendingOAuth = { codeVerifier, state, createdAt: Date.now() };

    // Build authorize URL
    const authUrl = new URL(OAUTH_AUTHORIZE_URL);
    authUrl.searchParams.set('code', 'true');
    authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI);
    authUrl.searchParams.set('scope', OAUTH_SCOPES);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    const url = authUrl.toString();
    logger.info('ClaudeProvider: OAuth flow started', { url: url.slice(0, 80) + '...' });
    return { url };
  }

  /**
   * Exchange the OAuth authorization code for tokens.
   * Saves credentials in the format Claude CLI expects (~/.claude/.credentials.json).
   */
  async submitLoginCode(code: string): Promise<{ success: boolean; error?: string }> {
    if (!this.pendingOAuth) {
      return { success: false, error: 'No pending OAuth flow. Click "Authenticate with Claude" first.' };
    }

    // Expire after 10 minutes
    if (Date.now() - this.pendingOAuth.createdAt > 600_000) {
      this.pendingOAuth = null;
      return { success: false, error: 'OAuth flow expired. Please start again.' };
    }

    const { codeVerifier, state } = this.pendingOAuth;

    // Strip the # fragment if present (callback includes state after #)
    let authCode = code.trim();
    if (authCode.includes('#')) {
      authCode = authCode.split('#')[0];
    }

    try {
      // Exchange code for tokens
      const resp = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: authCode,
          redirect_uri: OAUTH_REDIRECT_URI,
          client_id: OAUTH_CLIENT_ID,
          code_verifier: codeVerifier,
          state,
        }),
      });

      const text = await resp.text();
      if (resp.status !== 200) {
        logger.error('ClaudeProvider: token exchange failed', { status: resp.status, body: text.slice(0, 200) });
        return { success: false, error: `Token exchange failed (${resp.status}): ${text.slice(0, 200)}` };
      }

      const tokens = JSON.parse(text);
      logger.info('ClaudeProvider: token exchange success', { keys: Object.keys(tokens) });

      // Save in the format Claude CLI expects
      const claudeDir = path.join(process.env.HOME || '/root', '.claude');
      if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

      const credPath = path.join(claudeDir, '.credentials.json');
      const config: Record<string, unknown> = {
        claudeAiOauth: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + (tokens.expires_in || 28800) * 1000,
          scopes: (tokens.scope || '').split(' ').filter(Boolean),
        },
      };

      // Add account info if available
      if (tokens.account || tokens.organization) {
        config.oauthAccount = {
          accountUuid: tokens.account?.uuid,
          emailAddress: tokens.account?.email_address,
          organizationUuid: tokens.organization?.uuid,
        };
      }

      fs.writeFileSync(credPath, JSON.stringify(config, null, 2));
      fs.chmodSync(credPath, 0o600);

      logger.info('ClaudeProvider: credentials saved', { path: credPath });

      // Clear state
      this.pendingOAuth = null;
      this.cliStatusCache = null;

      return { success: true };
    } catch (err: any) {
      logger.error('ClaudeProvider: OAuth code exchange error', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Log out by deleting the Claude CLI credentials file.
   */
  async logout(): Promise<{ success: boolean; error?: string }> {
    try {
      const claudeDir = path.join(process.env.HOME || '/root', '.claude');
      const credPath = path.join(claudeDir, '.credentials.json');

      if (fs.existsSync(credPath)) {
        fs.unlinkSync(credPath);
        logger.info('ClaudeProvider: credentials deleted', { path: credPath });
      }

      this.cliStatusCache = null;
      this.pendingOAuth = null;

      return { success: true };
    } catch (err: any) {
      logger.error('ClaudeProvider: logout error', { error: err.message });
      return { success: false, error: err.message };
    }
  }
}
