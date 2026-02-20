import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Server } from 'http';
import Redis from 'ioredis';
import { logger } from './logger.js';
import { formatErrorMessage } from './infra/errors.js';
import { requireApiKey } from './auth.js';
import { Daemon } from './daemon.js';
import { Brain } from './brain.js';
import { ToolRegistry } from './tool-registry.js';
import { AgentLoop } from './agent.js';
import type { AgentEvent } from './agent.js';
import { SdkAgentRunner } from './sdk-agent-runner.js';
import { ClaudeProvider } from './providers/claude.js';
import type { McpConfigManager } from './mcp-config-manager.js';
import type { McpRegistryClient } from './mcp-registry-client.js';
import type { McpClientManager } from './mcp-client-manager.js';
import { AppManager, createAppRoutes } from './modules/apps/index.js';
import type { ChannelManager, ChannelId, ChannelConfig } from './channels/index.js';
import type { ApprovalManager } from './approval-manager.js';
import type { TaskManager, TaskStatus } from './task-manager.js';
import type { SkillInstaller } from './skill-installer.js';
import type { SkillRegistryClient } from './skill-registry-client.js';
import type { SkillLoader } from './skill-loader.js';
import type { DmPairingManager } from './dm-pairing.js';
import { WsGateway } from './ws-gateway.js';
import type { WsGatewayDeps } from './ws-gateway.js';

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

export function createApiServer({ daemon, redis, brain, toolRegistry, mcpConfigManager, mcpRegistryClient, mcpClientManager, channelManager, approvalManager, taskManager, skillInstaller, skillRegistryClient, skillLoader, dmPairingManager }: ApiDeps) {
  const app = express();
  app.use(express.json());

  // ── Health Check (public, no auth required) ───────────────────
  app.get('/api/health', async (_req, res) => {
    const uptime = process.uptime();
    const redisOk = await redis.ping().catch(() => 'FAIL');
    res.json({ status: 'ok', uptime: Math.floor(uptime), redis: redisOk === 'PONG' ? 'ok' : 'error' });
  });

  // ── API Key Authentication (all /api/* routes below require auth) ──
  app.use('/api', requireApiKey);

  // ── Claude CLI Status & Login ────────────────────────────────
  app.get('/api/claude-cli/status', async (_req, res) => {
    try {
      const claudeProvider = brain.getProviderManager().getProvider('claude') as ClaudeProvider | undefined;
      if (!claudeProvider || typeof claudeProvider.getCliStatus !== 'function') {
        res.json({ installed: false, authenticated: false, authMethod: 'api-key' });
        return;
      }
      const status = await claudeProvider.getCliStatus();
      const authMethod = await claudeProvider.getAuthMethod();
      res.json({ ...status, authMethod });
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  /** Start Claude CLI OAuth login — returns a URL the user opens in browser */
  app.post('/api/claude-cli/login', async (_req, res) => {
    try {
      const claudeProvider = brain.getProviderManager().getProvider('claude') as ClaudeProvider | undefined;
      if (!claudeProvider || typeof claudeProvider.startLogin !== 'function') {
        res.status(503).json({ error: 'Claude provider not available' });
        return;
      }
      const result = await claudeProvider.startLogin();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  app.post('/api/claude-cli/login-code', async (req, res) => {
    try {
      const claudeProvider = brain.getProviderManager().getProvider('claude') as ClaudeProvider | undefined;
      if (!claudeProvider || typeof claudeProvider.submitLoginCode !== 'function') {
        res.status(503).json({ error: 'Claude provider not available' });
        return;
      }
      const { code } = req.body as { code?: string };
      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'Missing "code" in request body' });
        return;
      }
      const result = await claudeProvider.submitLoginCode(code);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
    }
  });

  app.post('/api/claude-cli/logout', async (_req, res) => {
    try {
      const claudeProvider = brain.getProviderManager().getProvider('claude') as ClaudeProvider | undefined;
      if (!claudeProvider || typeof claudeProvider.logout !== 'function') {
        res.status(503).json({ error: 'Claude provider not available' });
        return;
      }
      const result = await claudeProvider.logout();
      res.json(result);
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
      const count = await redis.llen('nexus:notifications');
      if (count > 0) {
        const items = await redis.lrange('nexus:notifications', 0, 9);
        notifications.push(...items.map((i: string) => {
          try { return JSON.parse(i).message; } catch { return i; }
        }));
        await redis.ltrim('nexus:notifications', items.length, -1);
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
      await redis.set('nexus:active_session', JSON.stringify({ sessionId, cwd, timestamp: Date.now() }), 'EX', 86400);
      const pending = await redis.llen('nexus:inbox');
      if (pending > 0) {
        await redis.lpush('nexus:notifications', JSON.stringify({
          message: `Welcome back! You have ${pending} pending tasks.`,
          timestamp: Date.now(),
        }));
      }
    }
    res.json({ ok: true });
  });

  app.get('/api/status', async (_req, res) => {
    const stats = await redis.get('nexus:stats');
    const inbox = await redis.llen('nexus:inbox');
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

  // ── Nexus Config API ────────────────────────────────────────────

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

  // ── SSE Streaming Endpoint ────────────────────────────────────

  app.post('/api/agent/stream', async (req, res) => {
    const { task, max_turns } = req.body;
    if (!task) {
      res.status(400).json({ error: 'task is required' });
      return;
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

    // Check if we should use SDK subscription mode
    const claudeProvider = brain.getProviderManager().getProvider('claude') as ClaudeProvider | undefined;
    const authMethod = claudeProvider ? await claudeProvider.getAuthMethod() : 'api-key';
    const useSdk = authMethod === 'sdk-subscription';

    const agentConfig = {
      brain,
      toolRegistry,
      nexusConfig,
      maxTurns: Math.min(max_turns || agentDefaults?.maxTurns || parseInt(process.env.AGENT_MAX_TURNS || '30'), 100),
      maxTokens: agentDefaults?.maxTokens || parseInt(process.env.AGENT_MAX_TOKENS || '200000'),
      timeoutMs: agentDefaults?.timeoutMs || parseInt(process.env.AGENT_TIMEOUT_MS || '600000'),
      tier: (agentDefaults?.tier || (process.env.AGENT_TIER as any) || 'sonnet') as 'flash' | 'haiku' | 'sonnet' | 'opus',
      maxDepth: parseInt(process.env.AGENT_MAX_DEPTH || '3'),
      stream: true,
      approvalManager,
      approvalPolicy: approvalPolicy as 'always' | 'destructive' | 'never',
      sessionId: randomUUID(),
    };

    const agent = useSdk
      ? new SdkAgentRunner(agentConfig)
      : new AgentLoop(agentConfig);

    logger.info('SSE: using agent mode', { mode: useSdk ? 'sdk-subscription' : 'api-key' });

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
      sendEvent({ type: 'done', data: { success: result.success, answer: result.answer, turns: result.turns, stoppedReason: result.stoppedReason } });
      res.end();
    } catch (err) {
      clearInterval(heartbeat);
      sendEvent({ type: 'error', data: formatErrorMessage(err) });
      res.end();
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
