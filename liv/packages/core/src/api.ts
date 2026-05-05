import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import express from 'express';
import type { Server } from 'http';
import Redis from 'ioredis';
import { logger } from './logger.js';
import { formatErrorMessage } from './infra/errors.js';
import { requireApiKey, extractUserIdFromRequest } from './auth.js';
import { Daemon } from './daemon.js';
import { Brain } from './brain.js';
import { ToolRegistry } from './tool-registry.js';
import type { Tool, ToolResult } from './types.js';
import { AgentLoop } from './agent.js';
import type { AgentEvent } from './agent.js';
import { KimiAgentRunner } from './kimi-agent-runner.js';
import { SdkAgentRunner } from './sdk-agent-runner.js';
import type { McpConfigManager } from './mcp-config-manager.js';
import type { McpRegistryClient } from './mcp-registry-client.js';
import type { McpClientManager } from './mcp-client-manager.js';
import { AppManager, createAppRoutes } from './modules/apps/index.js';
import type { ChannelManager, ChannelId, ChannelConfig } from './channels/index.js';
import type { GmailProvider } from './channels/gmail.js';
import type { ApprovalManager } from './approval-manager.js';
import type { TaskManager, TaskStatus } from './task-manager.js';
import type { SkillInstaller } from './skill-installer.js';
import type { SkillRegistryClient } from './skill-registry-client.js';
import type { SkillLoader } from './skill-loader.js';
import type { DmPairingManager } from './dm-pairing.js';
import { WsGateway } from './ws-gateway.js';
import type { WsGatewayDeps } from './ws-gateway.js';
import type { UsageTracker } from './usage-tracker.js';
import type { WebhookManager } from './webhook-manager.js';
import { isCommand, handleCommand, listCommands } from './commands.js';
import type { ClaudeProvider } from './providers/claude.js';
import type { CapabilityRegistry } from './capability-registry.js';

// Phase 13 SHELL-01: built-in local tool names that MUST NOT be overwritten
// by external /api/tools/register callers. Device proxy tools always use
// the `device_<deviceId>_<toolName>` naming convention so they never
// collide; this set exists to defend against rogue or misconfigured
// external registrations (e.g., a malicious agent POSTing {name: 'shell'}
// directly to /api/tools/register, which would silently overwrite the
// local shell via ToolRegistry.register's set() semantics).
const RESERVED_TOOL_NAMES: ReadonlySet<string> = new Set([
  // Core system tools
  'status', 'logs', 'sysinfo',
  // Shell (the reason this guard exists — SHELL-01 / SHELL-02)
  'shell',
  // Docker controls
  'docker_list', 'docker_manage', 'docker_exec',
  // Process manager
  'pm2',
  // File operations
  'files', 'files_list', 'files_read', 'files_write', 'files_delete', 'files_rename',
  // Web tools
  'web_search', 'scrape',
  // Messaging
  'whatsapp_send', 'channel_send',
  // Memory + search
  'memory_search', 'memory_add', 'conversation_search',
]);

interface ApiDeps {
  daemon: Daemon;
  redis: Redis;
  brain: Brain;
  toolRegistry: ToolRegistry;
  mcpConfigManager?: McpConfigManager;
  mcpRegistryClient?: McpRegistryClient;
  mcpClientManager?: McpClientManager;
  channelManager?: ChannelManager;
  approvalManager?: ApprovalManager;
  taskManager?: TaskManager;
  skillInstaller?: SkillInstaller;
  skillRegistryClient?: SkillRegistryClient;
  skillLoader?: SkillLoader;
  dmPairingManager?: DmPairingManager;
  usageTracker?: UsageTracker;
  webhookManager?: WebhookManager;
  capabilityRegistry?: CapabilityRegistry;
}


/** Mask sensitive values in env/headers for API responses */
function maskSensitiveValues(servers: any[]): any[] {
  const sensitivePattern = /key|secret|token|password|credential|auth/i;
  return servers.map(s => {
    const masked = { ...s };
    if (masked.env) {
      masked.env = { ...masked.env };
      for (const k of Object.keys(masked.env)) {
        if (sensitivePattern.test(k)) {
          const v = masked.env[k];
          masked.env[k] = v.length > 8 ? v.slice(0, 4) + '****' + v.slice(-4) : '****';
        }
      }
    }
    if (masked.headers) {
      masked.headers = { ...masked.headers };
      for (const k of Object.keys(masked.headers)) {
        if (sensitivePattern.test(k)) {
          const v = masked.headers[k];
          masked.headers[k] = v.length > 8 ? v.slice(0, 4) + '****' + v.slice(-4) : '****';
        }
      }
    }
    return masked;
  });
}

export function createApiServer({ daemon, redis, brain, toolRegistry, mcpConfigManager, mcpRegistryClient, mcpClientManager, channelManager, approvalManager, taskManager, skillInstaller, skillRegistryClient, skillLoader, dmPairingManager, usageTracker, webhookManager, capabilityRegistry }: ApiDeps) {
  const app = express();

  // ── Dynamic Webhook Receiver (raw body, own HMAC auth — before json parser & API key auth) ──
  app.post('/api/webhook/:id',
    express.raw({ type: '*/*', limit: '1mb' }),
    async (req, res) => {
      // Skip UUID-shaped IDs only; let non-UUID paths (like 'git') fall through
      const { id } = req.params;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return (req as any)._skipWebhook = true, res.status(404).json({ error: 'Not a dynamic webhook' });
      }

      if (!webhookManager) {
        return res.status(503).json({ error: 'Webhook system not initialized' });
      }

      // ── Rate limiting: 30 requests/minute per webhook ID ──
      const rateKey = `liv:webhook:rate:${id}`;
      try {
        const count = await redis.incr(rateKey);
        if (count === 1) {
          await redis.expire(rateKey, 60);
        }
        if (count > 30) {
          res.setHeader('Retry-After', '60');
          return res.status(429).json({ error: 'Rate limit exceeded (30 requests/minute)' });
        }
      } catch (err) {
        // Rate limiter failure should not block webhook processing
        logger.warn('Webhook rate limiter error (allowing request)', { id, error: formatErrorMessage(err) });
      }

      const signature = (req.headers['x-hub-signature-256'] || req.headers['x-signature-256'] || '') as string;
      const deliveryId = (req.headers['x-delivery-id'] || req.headers['x-github-delivery'] || '') as string;

      const payload = req.body as Buffer;

      try {
        const result = await webhookManager.handleIncoming(id, payload, signature, deliveryId || undefined);

        if (result.ok) {
          res.json({ ok: true, message: 'Webhook received and queued' });
        } else {
          const statusMap: Record<string, number> = {
            'not_found': 404,
            'invalid_signature': 401,
            'duplicate': 200, // Return 200 for dupes to prevent retries
          };
          const status = statusMap[result.reason || ''] || 400;
          res.status(status).json({ ok: result.reason === 'duplicate', message: result.reason });
        }
      } catch (err) {
        logger.error('Webhook receiver error', { id, error: formatErrorMessage(err) });
        res.status(500).json({ error: 'Internal webhook processing error' });
      }
    }
  );

  app.use(express.json());

  // ── Health Check (public, no auth required) ───────────────────
  app.get('/api/health', async (_req, res) => {
    const uptime = process.uptime();
    const redisOk = await redis.ping().catch(() => 'FAIL');
    res.json({ status: 'ok', uptime: Math.floor(uptime), redis: redisOk === 'PONG' ? 'ok' : 'error' });
  });

  // ── Gmail OAuth Callback (public — Google redirects user browser here) ──
  app.get('/api/gmail/oauth/callback', async (req, res) => {
    const gmailProvider = channelManager?.getProvider('gmail') as GmailProvider | undefined;
    if (!gmailProvider) {
      res.status(503).send('Gmail not configured');
      return;
    }

    const code = req.query.code as string;
    if (!code) {
      res.status(400).send('Missing authorization code');
      return;
    }

    try {
      // Read credentials from Redis config (with env var fallback)
      const configStr = await redis.get('liv:gmail:config');
      let clientId = process.env.GMAIL_CLIENT_ID || '';
      let clientSecret = process.env.GMAIL_CLIENT_SECRET || '';
      if (configStr) {
        try {
          const config = JSON.parse(configStr);
          if (config.gmailClientId) clientId = config.gmailClientId;
          if (config.gmailClientSecret) clientSecret = config.gmailClientSecret;
        } catch { /* use env vars */ }
      }
      // Read stored public URL (saved during /oauth/start) with fallbacks
      const storedPublicUrl = await redis.get('liv:gmail:public_url');
      const publicUrl = storedPublicUrl
        || process.env.LIV_PUBLIC_URL
        || `http://localhost:${process.env.API_PORT || '3200'}`;
      const redirectUri = `${publicUrl}/api/gmail/oauth/callback`;

      const { tokens, profile } = await gmailProvider.exchangeCode(clientId, clientSecret, redirectUri, code);
      await gmailProvider.finishOAuth(tokens, profile);

      // Redirect back to LivOS Settings UI (same origin the user came from)
      res.redirect(`${publicUrl}/settings?gmail=connected`);
    } catch (err) {
      logger.error('Gmail OAuth callback error', { error: formatErrorMessage(err) });
      const storedUrl = await redis.get('liv:gmail:public_url');
      const uiBase = storedUrl || process.env.LIVOS_UI_URL || 'http://localhost:2017';
      res.redirect(`${uiBase}/settings?gmail=error&message=${encodeURIComponent(formatErrorMessage(err))}`);
    }
  });

  // ── API Key Authentication (all /api/* routes below require auth) ──
  app.use('/api', requireApiKey);

  // ── Kimi Auth (CLI-based OAuth) ──────────────────────────────
  // Active login sessions: sessionId → { process, verificationUrl, userCode, status }
  const kimiLoginSessions = new Map<string, {
    process: ChildProcess;
    verificationUrl?: string;
    userCode?: string;
    status: 'starting' | 'waiting' | 'success' | 'error';
    error?: string;
  }>();

  /** Read Kimi OAuth token from CLI credentials file and save to Redis */
  async function syncKimiOAuthToken(): Promise<void> {
    try {
      const credPath = join(homedir(), '.kimi', 'credentials', 'kimi-code.json');
      const raw = await readFile(credPath, 'utf-8');
      const creds = JSON.parse(raw) as { access_token?: string; expires_at?: number };
      if (creds.access_token) {
        await redis.set('liv:config:kimi_api_key', creds.access_token);
        await redis.set('liv:kimi:authenticated', '1');
        logger.info('Kimi OAuth token synced to Redis from credentials file');
      }
    } catch (err) {
      logger.warn('Failed to sync Kimi OAuth token', { error: formatErrorMessage(err) });
    }
  }

  // Sync OAuth token on startup (in case kimi CLI is already logged in)
  syncKimiOAuthToken().catch(() => {});

  /** Check if Kimi CLI is authenticated (uses Redis flag — no process spawn) */
  app.get('/api/kimi/status', async (_req, res) => {
    try {
      const flag = await redis.get('liv:kimi:authenticated');
      res.json({
        authenticated: flag === '1',
        provider: 'kimi',
      });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Start Kimi CLI login — spawns `kimi login --json` and returns auth URL */
  app.post('/api/kimi/login', async (_req, res) => {
    try {
      // Kill any existing login sessions to avoid conflicts
      for (const [id, s] of kimiLoginSessions) {
        s.process.kill();
        kimiLoginSessions.delete(id);
      }

      const sessionId = randomUUID();

      const proc = spawn('kimi', ['login', '--json'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` },
      });

      const session = {
        process: proc,
        status: 'starting' as const,
        verificationUrl: undefined as string | undefined,
        userCode: undefined as string | undefined,
        error: undefined as string | undefined,
      };
      kimiLoginSessions.set(sessionId, session);

      // Auto-cleanup after 5 minutes
      setTimeout(() => {
        const s = kimiLoginSessions.get(sessionId);
        if (s) {
          s.process.kill();
          kimiLoginSessions.delete(sessionId);
        }
      }, 5 * 60 * 1000);

      let output = '';
      let urlResolved = false;

      // Wait for verification_url event (should come within a few seconds)
      const urlPromise = new Promise<{ verificationUrl: string; userCode: string }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for Kimi login URL'));
        }, 15000);

        proc.stdout?.on('data', (data: Buffer) => {
          output += data.toString();
          // Process only complete lines
          const lines = output.split('\n');
          // Keep the last incomplete line in output
          output = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              if (event.type === 'verification_url' && event.data && !urlResolved) {
                session.verificationUrl = event.data.verification_url;
                session.userCode = event.data.user_code;
                (session as any).status = 'waiting';
                urlResolved = true;
                clearTimeout(timeout);
                resolve({
                  verificationUrl: event.data.verification_url,
                  userCode: event.data.user_code,
                });
              }
              if (event.type === 'success' || event.type === 'login_success') {
                (session as any).status = 'success';
                syncKimiOAuthToken().catch(() => {});
                logger.info('Kimi CLI login completed successfully');
              }
            } catch { /* skip non-JSON lines */ }
          }
        });

        proc.on('error', (err) => {
          clearTimeout(timeout);
          (session as any).status = 'error';
          session.error = err.message;
          if (!urlResolved) reject(err);
        });

        proc.on('close', (code) => {
          clearTimeout(timeout);
          if ((session as any).status !== 'success') {
            if (code === 0) {
              (session as any).status = 'success';
              redis.set('liv:kimi:authenticated', '1').catch(() => {});
              logger.info('Kimi CLI login process exited successfully (code 0)');
            } else if (!urlResolved) {
              (session as any).status = 'error';
              session.error = `kimi login exited with code ${code}`;
              reject(new Error(session.error));
            }
          }
        });
      });

      const { verificationUrl, userCode } = await urlPromise;

      logger.info(`Kimi login started, session=${sessionId}, url=${verificationUrl}`);
      res.json({ sessionId, verificationUrl, userCode });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Poll login session status */
  app.get('/api/kimi/login/poll/:sessionId', async (req, res) => {
    const session = kimiLoginSessions.get(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'Login session not found or expired' });
      return;
    }
    res.json({
      status: session.status,
      verificationUrl: session.verificationUrl,
      userCode: session.userCode,
      error: session.error,
    });
  });

  /** Logout from Kimi CLI */
  app.post('/api/kimi/logout', async (_req, res) => {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('kimi', ['logout', '--json'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` },
        });
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`kimi logout exited with code ${code}`));
        });
        proc.on('error', reject);
        // Timeout after 10s
        setTimeout(() => { proc.kill(); resolve(); }, 10000);
      });
      // Clear auth flag and any stored API key
      await redis.del('liv:kimi:authenticated');
      await redis.del('liv:config:kimi_api_key');
      logger.info('Kimi CLI logout completed');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // Phase 23 (AID-01/03/04) — One-shot Kimi chat for Docker AI diagnostics.
  // Wraps brain.chat() with a system+user prompt, no tools, no streaming.
  // Called from livinityd over X-API-Key (LIV_API_KEY middleware applied to /api/*).
  // 60-second wall clock so a stuck Kimi call cannot pin nexus-core.
  app.post('/api/kimi/chat', async (req, res) => {
    const ALLOWED_TIERS = new Set(['haiku', 'sonnet', 'opus']);
    try {
      const body = (req.body ?? {}) as {
        systemPrompt?: unknown;
        userPrompt?: unknown;
        maxTokens?: unknown;
        tier?: unknown;
      };

      // Validate
      if (typeof body.systemPrompt !== 'string' || body.systemPrompt.trim().length === 0) {
        res.status(400).json({ error: 'systemPrompt must be a non-empty string' });
        return;
      }
      if (typeof body.userPrompt !== 'string' || body.userPrompt.trim().length === 0) {
        res.status(400).json({ error: 'userPrompt must be a non-empty string' });
        return;
      }
      let maxTokens: number | undefined = undefined;
      if (body.maxTokens !== undefined && body.maxTokens !== null) {
        if (typeof body.maxTokens !== 'number' || !Number.isInteger(body.maxTokens) || body.maxTokens < 256 || body.maxTokens > 16384) {
          res.status(400).json({ error: 'maxTokens must be an integer in [256, 16384]' });
          return;
        }
        maxTokens = body.maxTokens;
      }
      let tier: 'haiku' | 'sonnet' | 'opus' | undefined = undefined;
      if (body.tier !== undefined && body.tier !== null) {
        if (typeof body.tier !== 'string' || !ALLOWED_TIERS.has(body.tier)) {
          res.status(400).json({ error: 'tier must be one of haiku|sonnet|opus' });
          return;
        }
        tier = body.tier as 'haiku' | 'sonnet' | 'opus';
      }

      const systemPrompt = body.systemPrompt as string;
      const userPrompt = body.userPrompt as string;

      logger.info('Kimi one-shot chat', {
        systemPromptLen: systemPrompt.length,
        userPromptLen: userPrompt.length,
        tier: tier ?? 'sonnet',
      });

      // 60s timeout race — Kimi calls that overrun must surface as [ai-timeout]
      // rather than holding the express handler indefinitely.
      const TIMEOUT_MS = 60_000;
      const result = await Promise.race([
        brain.chat({
          systemPrompt,
          messages: [{ role: 'user', text: userPrompt }],
          tier: tier ?? 'sonnet',
          maxTokens: maxTokens ?? 4096,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('[ai-timeout] Kimi chat exceeded 60s')), TIMEOUT_MS),
        ),
      ]);

      res.json({
        text: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
    } catch (err) {
      const message = formatErrorMessage(err).slice(0, 500);
      logger.error('Kimi one-shot chat failed', { error: message });
      res.status(502).json({ error: message });
    }
  });

  // ── Claude Auth API ─────────────────────────────────────────────

  /** Set Claude API key — validates against Anthropic API and stores in Redis */
  app.post('/api/claude/set-api-key', async (req, res) => {
    try {
      const { apiKey } = req.body as { apiKey?: string };
      if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('sk-ant-')) {
        res.status(400).json({ error: 'Invalid API key format' });
        return;
      }

      // Validate against Anthropic API
      const validateResp = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      });

      if (!validateResp.ok) {
        res.status(401).json({ error: `API key validation failed: ${validateResp.status}` });
        return;
      }

      // Store key and set auth method
      await redis.set('liv:config:anthropic_api_key', apiKey);
      await redis.set('liv:config:claude_auth_method', 'api-key');
      logger.info('Claude API key set and validated');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get Claude authentication status */
  app.get('/api/claude/status', async (_req, res) => {
    try {
      const provider = brain.getProviderManager().getProvider('claude') as ClaudeProvider | undefined;
      if (!provider) {
        res.status(503).json({ error: 'Claude provider not available' });
        return;
      }

      // Check if Claude is actually usable (credentials file, API key, or CLI)
      const available = await provider.isAvailable();
      const authMethod = (await redis.get('liv:config:claude_auth_method')) || 'api-key';
      res.json({ authenticated: available, method: authMethod, provider: 'claude' });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Start Claude OAuth PKCE login flow */
  app.post('/api/claude/start-login', async (_req, res) => {
    try {
      const provider = brain.getProviderManager().getProvider('claude') as ClaudeProvider | undefined;
      if (!provider) {
        res.status(503).json({ error: 'Claude provider not available' });
        return;
      }

      const result = await provider.startLogin();
      // Set auth method to sdk-subscription since user is using OAuth
      await redis.set('liv:config:claude_auth_method', 'sdk-subscription');
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Submit OAuth authorization code for Claude */
  app.post('/api/claude/submit-code', async (req, res) => {
    try {
      const { code } = req.body as { code?: string };
      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'Missing authorization code' });
        return;
      }

      const provider = brain.getProviderManager().getProvider('claude') as ClaudeProvider | undefined;
      if (!provider) {
        res.status(503).json({ error: 'Claude provider not available' });
        return;
      }

      const result = await provider.submitLoginCode(code);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Logout from Claude — clears credentials and auth state */
  app.post('/api/claude/logout', async (_req, res) => {
    try {
      const provider = brain.getProviderManager().getProvider('claude') as ClaudeProvider | undefined;
      if (!provider) {
        res.status(503).json({ error: 'Claude provider not available' });
        return;
      }

      await provider.logout();
      // Clear Redis keys
      await redis.del('liv:config:anthropic_api_key');
      await redis.del('liv:config:claude_auth_method');
      logger.info('Claude logout completed, auth state cleared');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // -- Provider Management --

  /** List all AI providers and their availability */
  app.get('/api/providers', async (_req, res) => {
    try {
      const pm = brain.getProviderManager();
      const providers = await pm.listProviders();
      const fallbackOrder = pm.getFallbackOrder();
      const primaryProvider = await redis.get('liv:config:primary_provider') || 'kimi';

      res.json({
        providers,
        primaryProvider,
        fallbackOrder,
      });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Set the primary AI provider */
  app.put('/api/provider/primary', async (req, res) => {
    try {
      const { provider } = req.body as { provider: string };

      if (!provider || !['claude', 'kimi'].includes(provider)) {
        res.status(400).json({ error: 'Invalid provider. Must be "claude" or "kimi".' });
        return;
      }

      // Store in Redis for persistence
      await redis.set('liv:config:primary_provider', provider);

      // Also update the NexusConfig blob if it exists
      const configBlob = await redis.get('liv:config');
      if (configBlob) {
        try {
          const config = JSON.parse(configBlob);
          if (!config.provider) config.provider = {};
          config.provider.primaryProvider = provider;
          config.updatedAt = new Date().toISOString();
          await redis.set('liv:config', JSON.stringify(config));
        } catch { /* ignore parse errors */ }
      }

      // Immediately update fallback order in running ProviderManager
      const pm = brain.getProviderManager();
      const secondary = provider === 'claude' ? 'kimi' : 'claude';
      pm.setFallbackOrder([provider, secondary]);

      logger.info('Primary provider switched', { provider, fallbackOrder: pm.getFallbackOrder() });
      res.json({ success: true, primaryProvider: provider, fallbackOrder: pm.getFallbackOrder() });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Gmail OAuth API (authenticated) ────────────────────────────

  /** Helper: get Gmail credentials from Redis config (with env var fallback) */
  async function getGmailCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    const configStr = await redis.get('liv:gmail:config');
    if (configStr) {
      try {
        const config = JSON.parse(configStr);
        if (config.gmailClientId && config.gmailClientSecret) {
          return { clientId: config.gmailClientId, clientSecret: config.gmailClientSecret };
        }
      } catch { /* fall through to env vars */ }
    }
    return {
      clientId: process.env.GMAIL_CLIENT_ID || '',
      clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
    };
  }

  /** Save Gmail OAuth credentials (Client ID + Secret) from UI */
  app.post('/api/gmail/credentials', async (req, res) => {
    const gmailProvider = channelManager?.getProvider('gmail') as GmailProvider | undefined;
    if (!gmailProvider) {
      res.status(503).json({ error: 'Gmail provider not available' });
      return;
    }

    const { clientId, clientSecret } = req.body as { clientId?: string; clientSecret?: string };
    if (!clientId || !clientSecret) {
      res.status(400).json({ error: 'clientId and clientSecret are required' });
      return;
    }

    try {
      await gmailProvider.updateConfig({
        enabled: true,
        gmailClientId: clientId.trim(),
        gmailClientSecret: clientSecret.trim(),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get Gmail settings */
  app.get('/api/gmail/settings', async (_req, res) => {
    const gmailProvider = channelManager?.getProvider('gmail') as GmailProvider | undefined;
    if (!gmailProvider) {
      res.status(503).json({ error: 'Gmail provider not available' });
      return;
    }
    res.json(gmailProvider.getSettings());
  });

  /** Update Gmail settings */
  app.put('/api/gmail/settings', async (req, res) => {
    const gmailProvider = channelManager?.getProvider('gmail') as GmailProvider | undefined;
    if (!gmailProvider) {
      res.status(503).json({ error: 'Gmail provider not available' });
      return;
    }

    try {
      await gmailProvider.updateSettings(req.body);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Start Gmail OAuth — returns URL for Google consent screen */
  app.get('/api/gmail/oauth/start', async (req, res) => {
    const gmailProvider = channelManager?.getProvider('gmail') as GmailProvider | undefined;
    if (!gmailProvider) {
      res.status(503).json({ error: 'Gmail provider not available' });
      return;
    }

    const { clientId, clientSecret } = await getGmailCredentials();
    if (!clientId || !clientSecret) {
      res.status(400).json({ error: 'Gmail credentials not configured. Set them in Settings > Gmail.' });
      return;
    }

    // Public URL passed from livinityd (derived from the browser's request)
    const publicUrl = (req.query.publicUrl as string)
      || process.env.LIV_PUBLIC_URL
      || `http://localhost:${process.env.API_PORT || '3200'}`;
    const redirectUri = `${publicUrl}/api/gmail/oauth/callback`;

    // Store the public URL in Redis so the callback can reconstruct the redirect URI
    await redis.set('liv:gmail:public_url', publicUrl);

    try {
      const url = gmailProvider.getAuthUrl(clientId, clientSecret, redirectUri);
      res.json({ url });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get Gmail connection status */
  app.get('/api/gmail/oauth/status', async (_req, res) => {
    const gmailProvider = channelManager?.getProvider('gmail') as GmailProvider | undefined;
    if (!gmailProvider) {
      res.json({ connected: false, configured: false });
      return;
    }

    try {
      const status = await gmailProvider.getStatus();
      const profile = await gmailProvider.getProfile();
      const { clientId, clientSecret } = await getGmailCredentials();
      const configured = !!(clientId && clientSecret);
      res.json({
        connected: status.connected,
        enabled: status.enabled,
        configured,
        email: profile?.email || null,
        error: status.error || null,
        lastMessage: status.lastMessage || null,
      });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Disconnect Gmail — clears tokens and stops polling */
  app.post('/api/gmail/oauth/disconnect', async (_req, res) => {
    const gmailProvider = channelManager?.getProvider('gmail') as GmailProvider | undefined;
    if (!gmailProvider) {
      res.status(503).json({ error: 'Gmail provider not available' });
      return;
    }

    try {
      await gmailProvider.clearOAuth();
      res.json({ ok: true, message: 'Gmail disconnected' });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── App Management Routes ─────────────────────────────────────
  const appManager = new AppManager(redis);
  app.use('/api/apps', createAppRoutes(appManager));

  // ── Existing endpoints ────────────────────────────────────────

  app.post('/api/webhook/git', async (req, res) => {
    const payload = req.body;
    const ref = payload.ref || '';
    const commits = payload.commits || [];
    logger.info(`Git webhook: ${ref}, ${commits.length} commits`);
    daemon.addToInbox(`New commit pushed to ${ref}. Run tests.`, 'webhook');
    res.json({ ok: true, message: 'Webhook received' });
  });

  app.get('/api/notifications', async (_req, res) => {
    try {
      const notifications: string[] = [];
      const count = await redis.llen('liv:notifications');
      if (count > 0) {
        const items = await redis.lrange('liv:notifications', 0, 9);
        notifications.push(...items.map((i: string) => {
          try { return JSON.parse(i).message; } catch { return i; }
        }));
        await redis.ltrim('liv:notifications', items.length, -1);
      }
      res.json({ notifications });
    } catch {
      res.json({ notifications: [] });
    }
  });

  app.post('/api/session', async (req, res) => {
    const { event, sessionId, cwd } = req.body;
    logger.info(`Session ${event}: ${sessionId}`, { cwd });
    if (event === 'session_start') {
      await redis.set('liv:active_session', JSON.stringify({ sessionId, cwd, timestamp: Date.now() }), 'EX', 86400);
      const pending = await redis.llen('liv:inbox');
      if (pending > 0) {
        await redis.lpush('liv:notifications', JSON.stringify({
          message: `Welcome back! You have ${pending} pending tasks.`,
          timestamp: Date.now(),
        }));
      }
    }
    res.json({ ok: true });
  });

  app.get('/api/status', async (_req, res) => {
    const stats = await redis.get('liv:stats');
    const inbox = await redis.llen('liv:inbox');
    res.json({ inbox, stats: stats ? JSON.parse(stats) : {}, uptime: Math.floor(process.uptime()) });
  });

  // ── MCP Marketplace + Manager API ────────────────────────────

  app.get('/api/mcp/registry/search', async (req, res) => {
    if (!mcpRegistryClient) { res.status(503).json({ error: 'MCP Registry not configured' }); return; }
    try {
      const { q, cursor, limit } = req.query as Record<string, string>;
      const result = await mcpRegistryClient.search(q, cursor, limit ? parseInt(limit) : undefined);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  app.get('/api/mcp/servers', async (_req, res) => {
    if (!mcpConfigManager) { res.status(503).json({ error: 'MCP not configured' }); return; }
    try {
      const servers = await mcpConfigManager.listServers();
      const statuses = mcpClientManager ? await mcpClientManager.getAllStatuses() : {};
      res.json({ servers: maskSensitiveValues(servers), statuses });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  app.post('/api/mcp/servers', async (req, res) => {
    if (!mcpConfigManager) { res.status(503).json({ error: 'MCP not configured' }); return; }
    try {
      const { name, transport, command, args, url, env, headers, description, installedFrom } = req.body;
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: '"name" is required and must be a string' }); return;
      }
      if (transport !== 'stdio' && transport !== 'streamableHttp') {
        res.status(400).json({ error: '"transport" must be "stdio" or "streamableHttp"' }); return;
      }
      if (transport === 'stdio' && !command) {
        res.status(400).json({ error: 'stdio transport requires "command"' }); return;
      }
      if (transport === 'streamableHttp' && !url) {
        res.status(400).json({ error: 'streamableHttp transport requires "url"' }); return;
      }
      await mcpConfigManager.installServer({
        name, transport, command, args, url, env, headers,
        description, installedFrom,
        enabled: true,
        installedAt: Date.now(),
      });
      res.json({ ok: true, message: `Server "${name}" installed` });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  app.put('/api/mcp/servers/:name', async (req, res) => {
    if (!mcpConfigManager) { res.status(503).json({ error: 'MCP not configured' }); return; }
    try {
      const updated = await mcpConfigManager.updateServer(req.params.name, req.body);
      if (!updated) { res.status(404).json({ error: 'Server not found' }); return; }
      res.json({ ok: true, server: updated });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  app.delete('/api/mcp/servers/:name', async (req, res) => {
    if (!mcpConfigManager) { res.status(503).json({ error: 'MCP not configured' }); return; }
    try {
      const removed = await mcpConfigManager.removeServer(req.params.name);
      if (!removed) { res.status(404).json({ error: 'Server not found' }); return; }
      res.json({ ok: true, message: `Server "${req.params.name}" removed` });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  app.post('/api/mcp/servers/:name/restart', async (req, res) => {
    if (!mcpClientManager) { res.status(503).json({ error: 'MCP not configured' }); return; }
    try {
      await mcpClientManager.restartServer(req.params.name);
      res.json({ ok: true, message: `Server "${req.params.name}" restarted` });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  app.get('/api/mcp/servers/:name/status', async (req, res) => {
    if (!mcpClientManager) { res.status(503).json({ error: 'MCP not configured' }); return; }
    try {
      const status = await mcpClientManager.getStatus(req.params.name);
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  app.get('/api/mcp/config', async (_req, res) => {
    if (!mcpConfigManager) { res.status(503).json({ error: 'MCP not configured' }); return; }
    try {
      const raw = await mcpConfigManager.getRawConfig();
      res.type('application/json').send(raw);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  app.put('/api/mcp/config', async (req, res) => {
    if (!mcpConfigManager) { res.status(503).json({ error: 'MCP not configured' }); return; }
    try {
      const json = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      await mcpConfigManager.setRawConfig(json);
      res.json({ ok: true, message: 'Config updated' });
    } catch (err) {
      res.status(400).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Tool List & Execute (used by livos AgentSessionManager proxy) ────────

  app.get('/api/tools', (_req, res) => {
    const tools = toolRegistry.listAll();
    res.json(tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      requiresApproval: t.requiresApproval || false,
    })));
  });

  app.post('/api/tools/:name/execute', async (req, res) => {
    const { name } = req.params;
    const params = req.body || {};
    try {
      const result = await toolRegistry.execute(name, params);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, output: '', error: err.message });
    }
  });

  // ── External Tool Registration (for device proxy tools) ────────

  app.post('/api/tools/register', async (req, res) => {
    try {
      const { name, description, parameters, callbackUrl } = req.body;
      if (!name || !description || !callbackUrl) {
        return res.status(400).json({ error: 'name, description, and callbackUrl are required' });
      }
      // Phase 13 SHELL-01: reject attempts to overwrite built-in local tools.
      // Device proxy tools use the `device_<deviceId>_<toolName>` convention
      // and will never collide; any other collision is a misconfiguration or
      // adversarial registration and MUST be rejected at the HTTP boundary.
      if (RESERVED_TOOL_NAMES.has(name)) {
        return res.status(409).json({
          error: 'tool_name_reserved',
          name,
          message: `Tool name '${name}' is reserved for the built-in local tool set and cannot be registered via /api/tools/register. Device proxy tools must use the 'device_<deviceId>_<toolName>' naming convention.`,
        });
      }
      // Create a tool whose execute function POSTs to callbackUrl
      const tool: Tool = {
        name,
        description,
        parameters: parameters || [],
        execute: async (params) => {
          const resp = await fetch(callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: name, params }),
          });
          if (!resp.ok) {
            return { success: false, output: '', error: `Callback failed: ${resp.status}` };
          }
          return await resp.json() as ToolResult;
        },
      };
      toolRegistry.register(tool);
      res.json({ registered: true, name });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/tools/:name', async (req, res) => {
    const existed = toolRegistry.unregister(req.params.name);
    res.json({ unregistered: existed, name: req.params.name });
  });

  // ── Capability Registry API ─────────────────────────────────────

  /** List all capabilities with optional type/status filter */
  app.get('/api/capabilities', (_req, res) => {
    if (!capabilityRegistry) {
      return res.status(503).json({ error: 'Capability registry not available' });
    }
    const type = _req.query.type as string | undefined;
    const status = _req.query.status as string | undefined;
    const filter: { type?: any; status?: string } = {};
    if (type && ['tool', 'skill', 'mcp', 'hook', 'agent'].includes(type)) {
      filter.type = type;
    }
    if (status) filter.status = status;
    const capabilities = capabilityRegistry.list(Object.keys(filter).length > 0 ? filter : undefined);
    res.json({ capabilities, total: capabilities.length });
  });

  /** Search capabilities by text, tags, or type */
  app.get('/api/capabilities/search', (_req, res) => {
    if (!capabilityRegistry) {
      return res.status(503).json({ error: 'Capability registry not available' });
    }
    const text = _req.query.q as string | undefined;
    const tags = _req.query.tags ? (_req.query.tags as string).split(',') : undefined;
    const type = _req.query.type as string | undefined;
    const query: { text?: string; tags?: string[]; type?: any } = {};
    if (text) query.text = text;
    if (tags) query.tags = tags;
    if (type && ['tool', 'skill', 'mcp', 'hook', 'agent'].includes(type)) {
      query.type = type;
    }
    const results = capabilityRegistry.search(query);
    res.json({ results, total: results.length });
  });

  /** Get a single capability by ID (IDs contain colons, e.g. tool:shell) */
  app.get('/api/capabilities/:id(*)', (req, res) => {
    if (!capabilityRegistry) {
      return res.status(503).json({ error: 'Capability registry not available' });
    }
    const id = (req.params as any)['id(*)'] || (req.params as any)[0] || '';
    const capability = capabilityRegistry.get(id);
    if (!capability) {
      return res.status(404).json({ error: `Capability "${id}" not found` });
    }
    res.json(capability);
  });

  /** Update capability metadata fields */
  app.patch('/api/capabilities/:id(*)', async (req, res) => {
    if (!capabilityRegistry) {
      return res.status(503).json({ error: 'Capability registry not available' });
    }
    const id = (req.params as any)['id(*)'] || (req.params as any)[0] || '';
    const { metadata } = req.body || {};
    if (!metadata || typeof metadata !== 'object') {
      return res.status(400).json({ error: 'metadata object required' });
    }
    const updated = await capabilityRegistry.updateMetadata(id, metadata);
    if (!updated) {
      return res.status(404).json({ error: `Capability "${id}" not found` });
    }
    res.json({ success: true, id });
  });

  /** Register a new capability (used by UI install button) */
  app.post('/api/capabilities', async (req, res) => {
    if (!capabilityRegistry) {
      return res.status(503).json({ error: 'Capability registry not available' });
    }
    const { name, type, description, provides_tools, semantic_tags, source } = req.body || {};
    if (!name || !type) {
      return res.status(400).json({ error: 'name and type are required' });
    }
    const id = `${type}:${name}`;
    const manifest = {
      id,
      type,
      name,
      description: description || '',
      semantic_tags: semantic_tags || [],
      triggers: [],
      provides_tools: provides_tools || [],
      requires: [],
      conflicts: [],
      context_cost: 0,
      tier: 'any' as const,
      source: source || 'marketplace',
      status: 'active' as const,
      last_used_at: 0,
      registered_at: Date.now(),
      metadata: {},
    };
    await capabilityRegistry.registerCapability(manifest);
    res.status(201).json({ id, success: true });
  });

  // ── Liv Config API ──────────────────────────────────────────────

  app.get('/api/nexus/config', async (_req, res) => {
    try {
      const configManager = daemon.configManager;
      if (!configManager) {
        res.status(503).json({ error: 'Config manager not initialized' });
        return;
      }
      const config = configManager.exportForUI();
      res.json({ config });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  app.put('/api/nexus/config', async (req, res) => {
    try {
      const configManager = daemon.configManager;
      if (!configManager) {
        res.status(503).json({ error: 'Config manager not initialized' });
        return;
      }
      const result = await configManager.update(req.body);
      if (result.success) {
        res.json({ ok: true, config: configManager.exportForUI() });
      } else {
        res.status(400).json({ ok: false, errors: result.errors });
      }
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  app.post('/api/nexus/config/validate', async (req, res) => {
    try {
      const configManager = daemon.configManager;
      if (!configManager) {
        res.status(503).json({ error: 'Config manager not initialized' });
        return;
      }
      const result = configManager.validate(req.body);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  app.post('/api/nexus/config/reset', async (_req, res) => {
    try {
      const configManager = daemon.configManager;
      if (!configManager) {
        res.status(503).json({ error: 'Config manager not initialized' });
        return;
      }
      await configManager.reset();
      res.json({ ok: true, config: configManager.exportForUI() });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Heartbeat API ────────────────────────────────────────────

  /** Manually trigger heartbeat (for testing) */
  app.post('/api/heartbeat/trigger', async (_req, res) => {
    try {
      const heartbeatRunner = daemon.heartbeatRunner;
      if (!heartbeatRunner) {
        res.status(503).json({ error: 'Heartbeat runner not initialized' });
        return;
      }
      const result = await heartbeatRunner.runOnce();
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get heartbeat state */
  app.get('/api/heartbeat/state', async (_req, res) => {
    try {
      const heartbeatRunner = daemon.heartbeatRunner;
      if (!heartbeatRunner) {
        res.status(503).json({ error: 'Heartbeat runner not initialized' });
        return;
      }
      const state = await heartbeatRunner.getState();
      const nextRun = heartbeatRunner.getNextRunTime();
      res.json({ state, nextRun, isRunning: heartbeatRunner.isRunning() });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Subagent API ────────────────────────────────────────────

  /** List all subagents */
  app.get('/api/subagents', async (_req, res) => {
    try {
      const subagentManager = daemon.subagentManager;
      if (!subagentManager) {
        res.status(503).json({ error: 'Subagent manager not initialized' });
        return;
      }
      const subagents = await subagentManager.list();
      res.json(subagents);
    } catch (err) {
      logger.error('List subagents error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get a subagent by ID */
  app.get('/api/subagents/:id', async (req, res) => {
    try {
      const subagentManager = daemon.subagentManager;
      if (!subagentManager) {
        res.status(503).json({ error: 'Subagent manager not initialized' });
        return;
      }
      const subagent = await subagentManager.get(req.params.id);
      if (!subagent) {
        res.status(404).json({ error: 'Subagent not found' });
        return;
      }
      res.json(subagent);
    } catch (err) {
      logger.error('Get subagent error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get subagent conversation history */
  app.get('/api/subagents/:id/history', async (req, res) => {
    try {
      const subagentManager = daemon.subagentManager;
      if (!subagentManager) {
        res.status(503).json({ error: 'Subagent manager not initialized' });
        return;
      }
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const messages = await subagentManager.getHistory(req.params.id, limit);
      res.json(messages);
    } catch (err) {
      logger.error('Get subagent history error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Create a new subagent */
  app.post('/api/subagents', async (req, res) => {
    try {
      const subagentManager = daemon.subagentManager;
      if (!subagentManager) {
        res.status(503).json({ error: 'Subagent manager not initialized' });
        return;
      }
      const subagent = await subagentManager.create({
        ...req.body,
        status: req.body.status || 'active',
        createdBy: req.body.createdBy || 'ui',
      });
      res.json(subagent);
    } catch (err) {
      logger.error('Create subagent error', { error: formatErrorMessage(err) });
      res.status(400).json({ error: formatErrorMessage(err) });
    }
  });

  /** Update a subagent */
  app.put('/api/subagents/:id', async (req, res) => {
    try {
      const subagentManager = daemon.subagentManager;
      if (!subagentManager) {
        res.status(503).json({ error: 'Subagent manager not initialized' });
        return;
      }
      const subagent = await subagentManager.update(req.params.id, req.body);
      if (!subagent) {
        res.status(404).json({ error: 'Subagent not found' });
        return;
      }
      res.json(subagent);
    } catch (err) {
      logger.error('Update subagent error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Delete a subagent */
  app.delete('/api/subagents/:id', async (req, res) => {
    try {
      const subagentManager = daemon.subagentManager;
      if (!subagentManager) {
        res.status(503).json({ error: 'Subagent manager not initialized' });
        return;
      }
      const deleted = await subagentManager.delete(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Subagent not found' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      logger.error('Delete subagent error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Execute a subagent task (proper pipeline with history recording) */
  app.post('/api/subagents/:id/execute', async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'message is required' });
        return;
      }
      const result = await daemon.executeSubagentTask(req.params.id, message);
      res.json({ content: result });
    } catch (err) {
      logger.error('Execute subagent error', { id: req.params.id, error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Loop Management API ────────────────────────────────────

  /** List all active loops */
  app.get('/api/loops', async (_req, res) => {
    try {
      const loops = daemon.loopRunner.listActive();
      res.json(loops);
    } catch (err) {
      logger.error('List loops error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get loop status for a subagent */
  app.get('/api/loops/:id/status', async (req, res) => {
    try {
      const state = await daemon.loopRunner.getState(req.params.id);
      const loops = daemon.loopRunner.listActive();
      const active = loops.find(l => l.subagentId === req.params.id);
      res.json({
        subagentId: req.params.id,
        running: !!active,
        iteration: active?.iteration || 0,
        intervalMs: active?.intervalMs || 0,
        state: state || null,
      });
    } catch (err) {
      logger.error('Get loop status error', { id: req.params.id, error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Start a loop for a subagent */
  app.post('/api/loops/:id/start', async (req, res) => {
    try {
      const config = await daemon.subagentManager.get(req.params.id);
      if (!config) {
        res.status(404).json({ error: 'Subagent not found' });
        return;
      }
      if (!config.loop) {
        res.status(400).json({ error: 'Subagent has no loop configuration' });
        return;
      }
      await daemon.subagentManager.update(req.params.id, { status: 'active' });
      await daemon.loopRunner.start(config);
      res.json({ ok: true });
    } catch (err) {
      logger.error('Start loop error', { id: req.params.id, error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Stop a loop for a subagent */
  app.post('/api/loops/:id/stop', async (req, res) => {
    try {
      daemon.loopRunner.stopOne(req.params.id);
      await daemon.subagentManager.update(req.params.id, { status: 'stopped' });
      res.json({ ok: true });
    } catch (err) {
      logger.error('Stop loop error', { id: req.params.id, error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Schedule API ────────────────────────────────────────────

  /** List all schedules */
  app.get('/api/schedules', async (_req, res) => {
    try {
      const scheduleManager = daemon.scheduleManager;
      if (!scheduleManager) {
        res.status(503).json({ error: 'Schedule manager not initialized' });
        return;
      }
      const schedules = await scheduleManager.listSchedules();
      res.json(schedules);
    } catch (err) {
      logger.error('List schedules error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Add or update a schedule */
  app.post('/api/schedules', async (req, res) => {
    try {
      const scheduleManager = daemon.scheduleManager;
      if (!scheduleManager) {
        res.status(503).json({ error: 'Schedule manager not initialized' });
        return;
      }
      const { subagentId, task, cron, timezone } = req.body;
      if (!subagentId || !task || !cron) {
        res.status(400).json({ error: 'subagentId, task, and cron are required' });
        return;
      }
      const jobName = await scheduleManager.addSchedule({ subagentId, task, cron, timezone });
      res.json({ ok: true, jobName });
    } catch (err) {
      logger.error('Add schedule error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Remove a schedule */
  app.delete('/api/schedules/:subagentId', async (req, res) => {
    try {
      const scheduleManager = daemon.scheduleManager;
      if (!scheduleManager) {
        res.status(503).json({ error: 'Schedule manager not initialized' });
        return;
      }
      const removed = await scheduleManager.removeSchedule(req.params.subagentId);
      res.json({ ok: removed });
    } catch (err) {
      logger.error('Remove schedule error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Channel Management API ────────────────────────────────────

  /** Get all channel statuses */
  app.get('/api/channels', async (_req, res) => {
    try {
      if (!channelManager) {
        res.status(503).json({ error: 'Channel manager not initialized' });
        return;
      }
      const statuses = await channelManager.getAllStatus();
      res.json(statuses);
    } catch (err) {
      logger.error('Get channels error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get WhatsApp QR code data URL from Redis */
  app.get('/api/channels/whatsapp/qr', async (_req, res) => {
    try {
      const qr = await redis.get('liv:whatsapp:qr');
      res.json({ qr: qr || null });
    } catch (err) {
      logger.error('Get WhatsApp QR error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Trigger WhatsApp connection (enable + connect) */
  app.post('/api/channels/whatsapp/connect', async (_req, res) => {
    try {
      if (!channelManager) {
        res.status(503).json({ error: 'Channel manager not initialized' });
        return;
      }
      await channelManager.updateProviderConfig('whatsapp', { enabled: true });
      const provider = channelManager.getProvider('whatsapp') as any;
      if (provider?.connect) {
        // Don't await — Chrome init takes time, QR will appear via polling
        provider.connect(true).catch((err: any) => {
          logger.error('WhatsApp connect background error', { error: formatErrorMessage(err) });
        });
      }
      res.json({ ok: true, message: 'Connecting... QR code will appear shortly.' });
    } catch (err) {
      logger.error('WhatsApp connect error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Placeholder for pairing code — now unused, QR flow used instead */
  app.get('/api/channels/whatsapp/pairing-code', async (_req, res) => {
    try {
      const code = await redis.get('liv:whatsapp:pairing_code');
      const error = await redis.get('liv:whatsapp:pairing_error');
      res.json({ code: code || null, error: error || null });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Full disconnect WhatsApp (close socket + clear auth state) */
  app.post('/api/channels/whatsapp/disconnect', async (_req, res) => {
    try {
      if (!channelManager) {
        res.status(503).json({ error: 'Channel manager not initialized' });
        return;
      }
      const provider = channelManager.getProvider('whatsapp');
      if (!provider) {
        res.status(404).json({ error: 'WhatsApp provider not found' });
        return;
      }
      await (provider as any).fullDisconnect();
      res.json({ ok: true });
    } catch (err) {
      logger.error('WhatsApp disconnect error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get specific channel status */
  app.get('/api/channels/:id', async (req, res) => {
    try {
      if (!channelManager) {
        res.status(503).json({ error: 'Channel manager not initialized' });
        return;
      }
      const id = req.params.id as ChannelId;
      const provider = channelManager.getProvider(id);
      if (!provider) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }
      const status = await provider.getStatus();
      res.json(status);
    } catch (err) {
      logger.error('Get channel error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Update channel config */
  app.put('/api/channels/:id', async (req, res) => {
    try {
      if (!channelManager) {
        res.status(503).json({ error: 'Channel manager not initialized' });
        return;
      }
      const id = req.params.id as ChannelId;
      const config = req.body as ChannelConfig;
      await channelManager.updateProviderConfig(id, config);
      const status = await channelManager.getProvider(id)?.getStatus();
      res.json({ ok: true, status });
    } catch (err) {
      logger.error('Update channel error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Test channel connection */
  app.post('/api/channels/:id/test', async (req, res) => {
    try {
      if (!channelManager) {
        res.status(503).json({ error: 'Channel manager not initialized' });
        return;
      }
      const id = req.params.id as ChannelId;
      const result = await channelManager.testProvider(id);
      res.json(result);
    } catch (err) {
      logger.error('Test channel error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Send message via channel */
  app.post('/api/channels/:id/send', async (req, res) => {
    try {
      if (!channelManager) {
        res.status(503).json({ error: 'Channel manager not initialized' });
        return;
      }
      const id = req.params.id as ChannelId;
      const { chatId, text, replyTo } = req.body;
      if (!chatId || !text) {
        res.status(400).json({ error: 'chatId and text are required' });
        return;
      }
      const success = await channelManager.sendMessage(id, chatId, text, replyTo);
      res.json({ ok: success });
    } catch (err) {
      logger.error('Send channel message error', { error: formatErrorMessage(err) });
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Approval Management API ────────────────────────────────────

  /** Get audit trail of approval decisions (must be before /:id route) */
  app.get('/api/approvals/audit', async (req, res) => {
    if (!approvalManager) {
      res.status(503).json({ error: 'Approval system not configured' });
      return;
    }
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const trail = await approvalManager.getAuditTrail({ limit, offset });
      res.json({ audit: trail });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** List pending approval requests */
  app.get('/api/approvals', async (_req, res) => {
    if (!approvalManager) {
      res.status(503).json({ error: 'Approval system not configured' });
      return;
    }
    try {
      const pending = await approvalManager.listPending();
      res.json({ approvals: pending });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get a specific approval request */
  app.get('/api/approvals/:id', async (req, res) => {
    if (!approvalManager) {
      res.status(503).json({ error: 'Approval system not configured' });
      return;
    }
    try {
      const request = await approvalManager.getRequest(req.params.id);
      if (!request) {
        res.status(404).json({ error: 'Approval request not found' });
        return;
      }
      res.json(request);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Resolve (approve/deny) an approval request */
  app.post('/api/approvals/:id/resolve', async (req, res) => {
    if (!approvalManager) {
      res.status(503).json({ error: 'Approval system not configured' });
      return;
    }
    try {
      const { decision } = req.body;
      if (decision !== 'approve' && decision !== 'deny') {
        res.status(400).json({ error: '"decision" must be "approve" or "deny"' });
        return;
      }
      const resolved = await approvalManager.resolve({
        requestId: req.params.id,
        decision,
        respondedBy: req.headers['x-user-id'] as string || 'api',
        respondedFrom: 'http-api',
      });
      if (!resolved) {
        res.status(404).json({ error: 'Approval request not found or already resolved' });
        return;
      }
      res.json({ ok: true, decision });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Parallel Task Management API ────────────────────────────────

  /** Submit a new parallel task */
  app.post('/api/tasks', async (req, res) => {
    if (!taskManager) {
      res.status(503).json({ error: 'Task system not configured' });
      return;
    }
    try {
      const { task, tier, maxTurns, timeoutMs } = req.body;
      if (!task || typeof task !== 'string') {
        res.status(400).json({ error: '"task" is required and must be a string' });
        return;
      }
      const taskId = await taskManager.submit({ task, tier, maxTurns, timeoutMs });
      res.json({ taskId, status: 'queued' });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** List all tasks (optional status filter) */
  app.get('/api/tasks', async (req, res) => {
    if (!taskManager) {
      res.status(503).json({ error: 'Task system not configured' });
      return;
    }
    try {
      const status = req.query.status as TaskStatus | undefined;
      const tasks = await taskManager.listTasks(status ? { status } : undefined);
      res.json({ tasks });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get status of a specific task */
  app.get('/api/tasks/:id', async (req, res) => {
    if (!taskManager) {
      res.status(503).json({ error: 'Task system not configured' });
      return;
    }
    try {
      const info = await taskManager.getStatus(req.params.id);
      if (!info) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      res.json(info);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Cancel a running task */
  app.post('/api/tasks/:id/cancel', async (req, res) => {
    if (!taskManager) {
      res.status(503).json({ error: 'Task system not configured' });
      return;
    }
    try {
      const cancelled = await taskManager.cancel(req.params.id);
      res.json({ cancelled });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Skill Marketplace API ────────────────────────────────────────

  /** Browse skill marketplace catalog */
  app.get('/api/skills/marketplace', async (req, res) => {
    if (!skillRegistryClient) {
      res.status(503).json({ error: 'Skill registry not configured' });
      return;
    }
    try {
      const search = req.query.search as string | undefined;
      const skills = search
        ? await skillRegistryClient.searchCatalog(search)
        : await skillRegistryClient.fetchCatalog();
      res.json({ skills });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** List installed marketplace skills */
  app.get('/api/skills/installed', async (_req, res) => {
    if (!skillInstaller) {
      res.status(503).json({ error: 'Skill installer not configured' });
      return;
    }
    try {
      const skills = await skillInstaller.listInstalled();
      res.json({ skills });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** List builtin skills */
  app.get('/api/skills/builtin', async (_req, res) => {
    if (!skillLoader) {
      res.status(503).json({ error: 'Skill loader not configured' });
      return;
    }
    try {
      const all = skillLoader.listSkills();
      const builtins = all.filter((s) => s.source !== 'marketplace');
      res.json({ skills: builtins });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Preview skill install (get permissions) */
  app.post('/api/skills/preview', async (req, res) => {
    if (!skillInstaller) {
      res.status(503).json({ error: 'Skill installer not configured' });
      return;
    }
    try {
      const { skillName } = req.body;
      if (!skillName || typeof skillName !== 'string') {
        res.status(400).json({ error: '"skillName" is required and must be a string' });
        return;
      }
      const result = await skillInstaller.previewInstall(skillName);
      if (!result) {
        res.status(404).json({ error: `Skill "${skillName}" not found in any registry` });
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Install a skill after permission review */
  app.post('/api/skills/install', async (req, res) => {
    if (!skillInstaller) {
      res.status(503).json({ error: 'Skill installer not configured' });
      return;
    }
    try {
      const { skillName, acceptedPermissions } = req.body;
      if (!skillName || typeof skillName !== 'string') {
        res.status(400).json({ error: '"skillName" is required and must be a string' });
        return;
      }
      if (!Array.isArray(acceptedPermissions)) {
        res.status(400).json({ error: '"acceptedPermissions" must be an array of strings' });
        return;
      }
      const result = await skillInstaller.install(skillName, acceptedPermissions);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Uninstall a marketplace skill */
  app.post('/api/skills/uninstall', async (req, res) => {
    if (!skillInstaller) {
      res.status(503).json({ error: 'Skill installer not configured' });
      return;
    }
    try {
      const { skillName } = req.body;
      if (!skillName || typeof skillName !== 'string') {
        res.status(400).json({ error: '"skillName" is required and must be a string' });
        return;
      }
      const result = await skillInstaller.uninstall(skillName);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Skill Registry Management API ────────────────────────────

  /** List all configured registries */
  app.get('/api/skills/registries', async (_req, res) => {
    if (!skillRegistryClient) {
      res.status(503).json({ error: 'Skill registry not configured' });
      return;
    }
    try {
      const registries = skillRegistryClient.getRegistries();
      res.json({ registries });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Add a new registry */
  app.post('/api/skills/registries', async (req, res) => {
    if (!skillRegistryClient) {
      res.status(503).json({ error: 'Skill registry not configured' });
      return;
    }
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'url is required' });
        return;
      }
      // Validate GitHub URL format
      if (!url.match(/github\.com\/[^/]+\/[^/]+/)) {
        res.status(400).json({ error: 'URL must be a GitHub repository (e.g. https://github.com/user/repo)' });
        return;
      }
      skillRegistryClient.addRegistry(url);
      // Persist to Redis so registries survive restarts
      if (redis) {
        const registries = skillRegistryClient.getRegistries();
        await redis.set('liv:skills:registries', JSON.stringify(registries));
      }
      res.json({ success: true, registries: skillRegistryClient.getRegistries() });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Remove a registry */
  app.delete('/api/skills/registries', async (req, res) => {
    if (!skillRegistryClient) {
      res.status(503).json({ error: 'Skill registry not configured' });
      return;
    }
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'url is required' });
        return;
      }
      skillRegistryClient.removeRegistry(url);
      // Persist to Redis
      if (redis) {
        const registries = skillRegistryClient.getRegistries();
        await redis.set('liv:skills:registries', JSON.stringify(registries));
      }
      res.json({ success: true, registries: skillRegistryClient.getRegistries() });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Force refresh skill catalog (clears cache and re-fetches) */
  app.post('/api/skills/refresh', async (_req, res) => {
    if (!skillRegistryClient) {
      res.status(503).json({ error: 'Skill registry not configured' });
      return;
    }
    try {
      skillRegistryClient.clearCache();
      const skills = await skillRegistryClient.fetchCatalog();
      res.json({ success: true, count: skills.length });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── DM Pairing Management API ────────────────────────────────

  /** Get all pending DM pairing requests */
  app.get('/api/dm-pairing/pending', async (_req, res) => {
    if (!dmPairingManager) {
      res.status(503).json({ error: 'DM pairing not configured' });
      return;
    }
    try {
      const pending = await dmPairingManager.getPendingRequests();
      res.json({ pending });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get allowlist for a channel */
  app.get('/api/dm-pairing/allowlist/:channel', async (req, res) => {
    if (!dmPairingManager) {
      res.status(503).json({ error: 'DM pairing not configured' });
      return;
    }
    try {
      const users = await dmPairingManager.getAllowlist(req.params.channel);
      res.json({ channel: req.params.channel, users });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Approve a pending pairing request */
  app.post('/api/dm-pairing/approve', async (req, res) => {
    if (!dmPairingManager) {
      res.status(503).json({ error: 'DM pairing not configured' });
      return;
    }
    try {
      const { channel, userId } = req.body;
      if (!channel || !userId) {
        res.status(400).json({ error: '"channel" and "userId" are required' });
        return;
      }
      const approved = await dmPairingManager.approvePairing(channel, userId);
      if (!approved) {
        res.status(404).json({ error: 'Pending request not found' });
        return;
      }
      res.json({ ok: true, message: `User ${userId} approved for ${channel}` });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Deny a pending pairing request */
  app.post('/api/dm-pairing/deny', async (req, res) => {
    if (!dmPairingManager) {
      res.status(503).json({ error: 'DM pairing not configured' });
      return;
    }
    try {
      const { channel, userId } = req.body;
      if (!channel || !userId) {
        res.status(400).json({ error: '"channel" and "userId" are required' });
        return;
      }
      const denied = await dmPairingManager.denyPairing(channel, userId);
      if (!denied) {
        res.status(404).json({ error: 'Pending request not found' });
        return;
      }
      res.json({ ok: true, message: `User ${userId} denied for ${channel}` });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get DM policy for a channel */
  app.get('/api/dm-pairing/policy/:channel', async (req, res) => {
    if (!dmPairingManager) {
      res.status(503).json({ error: 'DM pairing not configured' });
      return;
    }
    try {
      const policy = await dmPairingManager.getPolicy(req.params.channel);
      res.json({ channel: req.params.channel, policy });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Update DM policy for a channel */
  app.put('/api/dm-pairing/policy/:channel', async (req, res) => {
    if (!dmPairingManager) {
      res.status(503).json({ error: 'DM pairing not configured' });
      return;
    }
    try {
      const { policy } = req.body;
      if (!policy || !['pairing', 'allowlist', 'open', 'disabled'].includes(policy)) {
        res.status(400).json({ error: '"policy" must be one of: pairing, allowlist, open, disabled' });
        return;
      }
      await dmPairingManager.setPolicy(req.params.channel, policy);
      res.json({ ok: true, channel: req.params.channel, policy });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Remove a user from the allowlist */
  app.delete('/api/dm-pairing/allowlist/:channel/:userId', async (req, res) => {
    if (!dmPairingManager) {
      res.status(503).json({ error: 'DM pairing not configured' });
      return;
    }
    try {
      await dmPairingManager.removeFromAllowlist(req.params.channel, req.params.userId);
      res.json({ ok: true, message: `User ${req.params.userId} removed from ${req.params.channel} allowlist` });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Usage Tracking API ─────────────────────────────────────────

  /** Get usage summary for a specific user */
  app.get('/api/usage/summary/:userId', async (req, res) => {
    if (!usageTracker) {
      res.status(503).json({ error: 'Usage tracking not configured' });
      return;
    }
    try {
      const summary = await usageTracker.getUserSummary(req.params.userId);
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get daily usage for a user over a range of days */
  app.get('/api/usage/daily/:userId', async (req, res) => {
    if (!usageTracker) {
      res.status(503).json({ error: 'Usage tracking not configured' });
      return;
    }
    try {
      const days = parseInt(req.query.days as string) || 30;
      const daily = await usageTracker.getDailyRange(req.params.userId, Math.min(days, 90));
      res.json({ daily });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get overall usage overview across all users */
  app.get('/api/usage/overview', async (_req, res) => {
    if (!usageTracker) {
      res.status(503).json({ error: 'Usage tracking not configured' });
      return;
    }
    try {
      const overview = await usageTracker.getOverview();
      res.json(overview);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Webhook CRUD Endpoints ───────────────────────────────────

  /** List all webhooks */
  app.get('/api/webhooks', async (_req, res) => {
    if (!webhookManager) {
      res.status(503).json({ error: 'Webhook system not initialized' });
      return;
    }
    try {
      const webhooks = await webhookManager.listWebhooks();
      // Strip secrets from list response for safety
      const safe = webhooks.map(({ secret, ...rest }) => rest);
      res.json({ webhooks: safe });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Create a new webhook */
  app.post('/api/webhooks', async (req, res) => {
    if (!webhookManager) {
      res.status(503).json({ error: 'Webhook system not initialized' });
      return;
    }
    const { name, secret } = req.body as { name?: string; secret?: string };
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: '"name" is required and must be a string' });
      return;
    }
    try {
      const result = await webhookManager.createWebhook(name, secret);
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Get a single webhook by ID */
  app.get('/api/webhooks/:id', async (req, res) => {
    if (!webhookManager) {
      res.status(503).json({ error: 'Webhook system not initialized' });
      return;
    }
    try {
      const webhook = await webhookManager.getWebhook(req.params.id);
      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }
      // Strip secret from GET response
      const { secret, ...safe } = webhook;
      res.json(safe);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Delete a webhook by ID */
  app.delete('/api/webhooks/:id', async (req, res) => {
    if (!webhookManager) {
      res.status(503).json({ error: 'Webhook system not initialized' });
      return;
    }
    try {
      const deleted = await webhookManager.deleteWebhook(req.params.id);
      if (deleted) {
        res.json({ ok: true, message: 'Webhook deleted' });
      } else {
        res.status(404).json({ error: 'Webhook not found' });
      }
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Voice Config API ─────────────────────────────────────────

  /** Get voice pipeline configuration (API keys masked for security) */
  app.get('/api/voice/config', async (_req, res) => {
    try {
      const configRaw = await redis.get('liv:config');
      const config = configRaw ? JSON.parse(configRaw) : {};
      const voice = config.voice || {};
      res.json({
        enabled: voice.enabled ?? false,
        hasDeepgramKey: !!voice.deepgramApiKey,
        hasCartesiaKey: !!voice.cartesiaApiKey,
        cartesiaVoiceId: voice.cartesiaVoiceId || 'a0e99841-438c-4a64-b679-ae501e7d6091',
        sttLanguage: voice.sttLanguage || 'en',
        sttModel: voice.sttModel || 'nova-3',
      });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Update voice pipeline configuration */
  app.put('/api/voice/config', async (req, res) => {
    try {
      const { deepgramApiKey, cartesiaApiKey, cartesiaVoiceId, sttLanguage, sttModel, enabled } = req.body;

      // Read current config
      const configRaw = await redis.get('liv:config');
      const config = configRaw ? JSON.parse(configRaw) : {};
      const voice = config.voice || {};

      // Merge voice section
      if (deepgramApiKey !== undefined) voice.deepgramApiKey = deepgramApiKey;
      if (cartesiaApiKey !== undefined) voice.cartesiaApiKey = cartesiaApiKey;
      if (cartesiaVoiceId !== undefined) voice.cartesiaVoiceId = cartesiaVoiceId;
      if (sttLanguage !== undefined) voice.sttLanguage = sttLanguage;
      if (sttModel !== undefined) voice.sttModel = sttModel;
      if (enabled !== undefined) voice.enabled = enabled;

      config.voice = voice;
      await redis.set('liv:config', JSON.stringify(config));

      // Publish config update so VoiceGateway can hot-reload
      await redis.publish('liv:config:updated', 'voice');

      logger.info('[Voice Config] Updated voice configuration', {
        enabled: voice.enabled,
        hasDeepgramKey: !!voice.deepgramApiKey,
        hasCartesiaKey: !!voice.cartesiaApiKey,
      });

      res.json({
        enabled: voice.enabled ?? false,
        hasDeepgramKey: !!voice.deepgramApiKey,
        hasCartesiaKey: !!voice.cartesiaApiKey,
        cartesiaVoiceId: voice.cartesiaVoiceId || 'a0e99841-438c-4a64-b679-ae501e7d6091',
        sttLanguage: voice.sttLanguage || 'en',
        sttModel: voice.sttModel || 'nova-3',
      });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Canvas API ──────────────────────────────────────────────────

  /** Get a single canvas artifact by ID */
  app.get('/api/canvas/:id', async (req, res) => {
    const canvasManager = daemon.canvasManager;
    if (!canvasManager) {
      res.status(503).json({ error: 'Canvas not available' });
      return;
    }
    try {
      const artifact = await canvasManager.get(req.params.id);
      if (!artifact) {
        res.status(404).json({ error: 'Artifact not found' });
        return;
      }
      res.json(artifact);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** List canvas artifacts for a conversation */
  app.get('/api/canvas', async (req, res) => {
    const canvasManager = daemon.canvasManager;
    if (!canvasManager) {
      res.status(503).json({ error: 'Canvas not available' });
      return;
    }
    try {
      const conversationId = req.query.conversationId as string;
      if (!conversationId) {
        res.status(400).json({ error: 'conversationId query param required' });
        return;
      }
      const artifacts = await canvasManager.listByConversation(conversationId);
      res.json({ artifacts });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Delete a canvas artifact by ID */
  app.delete('/api/canvas/:id', async (req, res) => {
    const canvasManager = daemon.canvasManager;
    if (!canvasManager) {
      res.status(503).json({ error: 'Canvas not available' });
      return;
    }
    try {
      const deleted = await canvasManager.delete(req.params.id);
      res.json({ success: deleted });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  // ── Slash Commands Listing ──────────────────────────────────
  app.get('/api/slash-commands', async (_req, res) => {
    try {
      const commands: Array<{name: string; description: string; category: string}> = [];

      // 1. Built-in slash commands from commands.ts
      const cmdDescriptions: Record<string, string> = {
        '/help': 'Show available commands',
        '/new': 'Start new conversation',
        '/usage': 'Show token usage and costs',
        '/think': 'Set thinking level (off/low/medium/high)',
        '/verbose': 'Set verbose level (0-3)',
        '/model': 'Change model tier (haiku/sonnet/opus)',
        '/status': 'Show current session settings',
        '/reset': 'Reset preferences to defaults',
        '/compact': 'Compact conversation history',
        '/activation': 'Set group trigger mode',
        '/stats': 'Show usage statistics',
      };
      for (const cmd of listCommands()) {
        commands.push({name: cmd, description: cmdDescriptions[cmd] || '', category: 'command'});
      }

      // 2. Registered tools from ToolRegistry
      for (const name of toolRegistry.list()) {
        const tool = toolRegistry.get(name);
        commands.push({name: `/${name}`, description: tool?.description?.slice(0, 80) || '', category: 'tool'});
      }

      // 3. Loaded skills from SkillLoader
      if (skillLoader) {
        for (const skill of skillLoader.listSkills()) {
          commands.push({name: `/${skill.name}`, description: skill.description?.slice(0, 80) || '', category: 'skill'});
        }
      }

      res.json({commands});
    } catch (err) {
      res.status(500).json({error: formatErrorMessage(err)});
    }
  });

  // ── SSE Streaming Endpoint ────────────────────────────────────

  app.post('/api/agent/stream', async (req, res) => {
    const { task, max_turns, conversationId, userPersonalization, computer_use_step_limit } = req.body;
    if (!task) {
      res.status(400).json({ error: 'task is required' });
      return;
    }

    // Extract userId from JWT for per-user session isolation
    const userId = await extractUserIdFromRequest(req);
    // webJid uses JWT-derived userId only (NOT header-derived) — session tracking is
    // anchored on Authorization/cookie auth, not livinityd-proxy header. Header-derived
    // userId is used solely for HOME isolation below.
    const webJid = userId ? `web-ui:${userId}` : 'web-ui';

    // Phase 41 D-41-16: livinityd forwards X-LivOS-User-Id in multi-user mode so we can
    // set SdkAgentRunner's homeOverride to the calling user's per-user .claude/ dir.
    // Trust model: requireApiKey middleware (api.ts:11 + line 229) already gates this
    // route — only livinityd (with LIV_API_KEY) can send this header. The header is
    // therefore as trusted as livinityd itself, which is already the trust boundary.
    const headerUserId = (() => {
      const raw = req.headers['x-livos-user-id'];
      if (typeof raw !== 'string') return undefined;
      // Same regex as per-user-claude.ts getUserClaudeDir validation — defense-in-depth
      // against path traversal even though the trust model gates this header.
      if (!/^[a-zA-Z0-9_-]+$/.test(raw)) return undefined;
      return raw;
    })();

    // Phase 41 D-41-16: Per-user HOME isolation for the spawned claude CLI subprocess.
    // Only set when X-LivOS-User-Id header was provided (multi-user mode).
    // When undefined: SdkAgentRunner falls back to process.env.HOME (pre-Phase-41
    // behavior, verified preserved by sdk-agent-runner-home-override.test.ts test #2).
    let homeOverride: string | undefined;
    if (headerUserId) {
      // Read data dir from env (testability) — defaults to production path per MEMORY.md.
      const dataDir = process.env.LIVOS_DATA_DIR || '/opt/livos/data';
      homeOverride = join(dataDir, 'users', headerUserId, '.claude');
      logger.info('Phase 41: per-user HOME isolation', { userId: headerUserId, homeOverride });
    }

    // ── Handle slash commands (/usage, /new, /status, etc.) ──────────
    if (isCommand(task) && daemon.userSessionManager) {
      try {
        const session = await daemon.userSessionManager.get(webJid);
        const cmdResult = await handleCommand(task, {
          jid: webJid,
          userSession: daemon.userSessionManager,
          currentThink: session.thinkLevel,
          currentVerbose: session.verboseLevel,
          currentModel: session.modelTier,
          sessionManager: daemon.sessionManager,
          redis: redis,
          usageTracker: usageTracker,
          brain: brain,
        });

        if (cmdResult?.handled && cmdResult.response) {
          // Return as a simple JSON response (not SSE) for commands
          res.json({ command: true, response: cmdResult.response });
          return;
        }
        // If command returned null (unrecognized), fall through to agent
      } catch (err) {
        logger.warn('Command handler error in stream endpoint', { error: formatErrorMessage(err) });
        // Fall through to agent on error
      }
    }

    // Set canvas conversation context so canvas_render/canvas_update tools can tag artifacts
    if (conversationId) {
      daemon.setCanvasConversationId(conversationId);
    }

    // SSE headers — keep connection alive
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Disable Nagle's algorithm for real-time streaming
    res.socket?.setNoDelay(true);

    const sendEvent = (event: AgentEvent) => {
      if (!res.writableEnded) {
        const payload = `data: ${JSON.stringify(event)}\n\n`;
        res.write(payload);
        // Force flush — needed for SSE through proxies/SSH
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
        logger.debug('SSE: sent event', { type: event.type, turn: event.turn, bytes: payload.length });
      }
    };

    // Heartbeat to keep connection alive (every 15s)
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': heartbeat\n\n');
      }
    }, 15000);

    logger.info('SSE: agent stream started', { task: task.slice(0, 80) });

    // Get config from ConfigManager if available
    const nexusConfig = daemon.getNexusConfig();
    const agentDefaults = nexusConfig?.agent;

    const approvalPolicy = nexusConfig?.approval?.policy ?? 'destructive';

    const agentConfig = {
      brain,
      toolRegistry,
      nexusConfig,
      ...(homeOverride ? { homeOverride } : {}),    // Phase 41 D-41-16
      maxTurns: Math.min(max_turns || agentDefaults?.maxTurns || parseInt(process.env.AGENT_MAX_TURNS || '30'), 200),
      maxTokens: agentDefaults?.maxTokens || parseInt(process.env.AGENT_MAX_TOKENS || '200000'),
      timeoutMs: agentDefaults?.timeoutMs || parseInt(process.env.AGENT_TIMEOUT_MS || '600000'),
      tier: (agentDefaults?.tier || (process.env.AGENT_TIER as any) || 'sonnet') as 'haiku' | 'sonnet' | 'opus',
      maxDepth: agentDefaults?.maxDepth ?? parseInt(process.env.AGENT_MAX_DEPTH || '3'),
      stream: true,
      approvalManager,
      approvalPolicy: approvalPolicy as 'always' | 'destructive' | 'never',
      sessionId: randomUUID(),
      userPersonalization: userPersonalization || undefined,
      computerUseStepLimit: computer_use_step_limit || 50,
    };

    // v20.0: SDK is the default agent runner. AgentLoop preserved as fallback.
    // To force legacy mode, set Redis key nexus:config:agent_runner to 'legacy'.
    const runnerMode = (await redis.get('liv:config:agent_runner')) || 'sdk';
    const agent = runnerMode === 'legacy'
      ? new AgentLoop(agentConfig)
      : new SdkAgentRunner(agentConfig);

    logger.info('SSE: agent runner', { mode: runnerMode });

    agent.on('event', sendEvent);

    // Handle client disconnect — use res.on('close'), NOT req.on('close')
    // req 'close' fires when request body is done reading (immediately for POST),
    // res 'close' fires when the actual TCP connection drops
    res.on('close', () => {
      clearInterval(heartbeat);
      agent.removeListener('event', sendEvent);
      logger.info('SSE: client disconnected');
    });

    try {
      const result = await agent.run(task);
      clearInterval(heartbeat);
      // Send final result as last event
      // Phase 59 (v29.5 hot-fix) — include token counts in done event so the
      // broker (livinity-broker agent-runner-factory.ts:141-149) and any other
      // consumers can populate usage{prompt_tokens, completion_tokens, total_tokens}
      // on the OpenAI/Anthropic streaming terminal chunk. Without these the broker
      // emits zero-token usage which downstream clients (Bolt.diy / Vercel AI SDK)
      // may interpret as a malformed stream.
      sendEvent({ type: 'done', data: {
        success: result.success,
        answer: result.answer,
        turns: result.turns,
        stoppedReason: result.stoppedReason,
        totalInputTokens: result.totalInputTokens,
        totalOutputTokens: result.totalOutputTokens,
      }});
      res.end();
    } catch (err) {
      clearInterval(heartbeat);
      sendEvent({ type: 'error', data: formatErrorMessage(err) });
      res.end();
    } finally {
      // Clear canvas conversation context
      if (conversationId) {
        daemon.clearCanvasConversationId();
      }
    }
  });

  return app;
}

// ── WebSocket Gateway ─────────────────────────────────────────

/**
 * Create and attach a JSON-RPC 2.0 WebSocket gateway to the HTTP server.
 * Replaces the old bare setupWebSocket with auth, multiplexing, and standard protocol.
 */
export function setupWsGateway(server: Server, deps: WsGatewayDeps): WsGateway {
  return new WsGateway(server, deps);
}
