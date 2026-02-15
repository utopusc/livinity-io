/**
 * JSON-RPC 2.0 WebSocket Gateway for Nexus.
 *
 * Replaces the old bare setupWebSocket handler with a standards-compliant
 * JSON-RPC 2.0 gateway supporting:
 * - Auth on upgrade (API key header or JWT query param)
 * - Method routing (agent.run, agent.cancel, tools.list, system.ping)
 * - Multiplexed concurrent agent sessions per connection
 * - Heartbeat pings for connection keepalive
 */

import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { Redis } from 'ioredis';
import { logger } from './logger.js';
import { verifyApiKey, verifyJwt } from './auth.js';
import { AgentLoop } from './agent.js';
import type { AgentEvent, AgentResult } from './agent.js';
import type { Brain } from './brain.js';
import type { ToolRegistry } from './tool-registry.js';
import type { Daemon } from './daemon.js';

// ── JSON-RPC 2.0 Types ─────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: string | number;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: JsonRpcError;
  id: string | number | null;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** Server-initiated notification (no id field) */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

// ── Standard JSON-RPC 2.0 Error Codes ──────────────────────────────────────

export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_INTERNAL_ERROR = -32603;

// ── Custom Error Codes ─────────────────────────────────────────────────────

export const RPC_AUTH_ERROR = -32000;
export const RPC_SESSION_NOT_FOUND = -32001;
export const RPC_SESSION_LIMIT_EXCEEDED = -32002;

// ── Gateway Types ──────────────────────────────────────────────────────────

export interface WsGatewayDeps {
  brain: Brain;
  toolRegistry: ToolRegistry;
  daemon: Daemon;
  redis: Redis;
  redisSub: Redis; // Dedicated Redis connection for blocking subscribe
}

/** Payload structure for messages published to nexus:notify:* channels */
export interface NotificationPayload {
  channel: string;       // "global", "agent:<sessionId>", "approval"
  event: string;         // "agent.started", "agent.completed", "approval_request", etc.
  data: unknown;         // Event-specific payload
  timestamp: number;
}

interface WsSession {
  id: string;
  agent: AgentLoop;
  status: 'running' | 'complete' | 'cancelled' | 'error';
  startedAt: number;
  task: string;
  /** Promise that resolves when the agent run completes */
  runPromise?: Promise<AgentResult>;
}

interface ClientState {
  id: string;
  sessions: Map<string, WsSession>;
  ws: WebSocket;
  /** Per-client notification channel filter. Empty set = receive all. */
  notifyFilter: Set<string>;
}

// ── WsGateway Class ────────────────────────────────────────────────────────

export class WsGateway {
  private wss: WebSocketServer;
  private clients: Map<string, ClientState> = new Map();
  private deps: WsGatewayDeps;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private maxSessionsPerClient = 5;

  constructor(server: Server, deps: WsGatewayDeps) {
    this.deps = deps;

    // Create WebSocket server with noServer mode for custom upgrade handling
    this.wss = new WebSocketServer({ noServer: true });

    // Handle HTTP upgrade requests for /ws/agent
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/ws/agent') {
        // Not our path -- ignore (let other upgrade handlers deal with it)
        return;
      }

      this.authenticateUpgrade(req, url)
        .then((authenticated) => {
          if (!authenticated) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }

          this.wss.handleUpgrade(req, socket, head, (ws) => {
            this.wss.emit('connection', ws, req);
          });
        })
        .catch((err) => {
          logger.error('[WsGateway] Auth error during upgrade', { error: err.message });
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
          socket.destroy();
        });
    });

    // Handle new connections
    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      this.handleConnection(ws);
    });

    // Start heartbeat pings every 30s
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, 30_000);

    // Subscribe to Redis pub/sub notification channels
    this.setupPubSub();

    logger.info('[WsGateway] JSON-RPC 2.0 WebSocket gateway on /ws/agent');
  }

  // ── Redis Pub/Sub ──────────────────────────────────────────────────────

  /**
   * Subscribe to nexus:notify:* via Redis psubscribe and route
   * incoming notifications to connected WebSocket clients.
   */
  private setupPubSub(): void {
    const redisSub = this.deps.redisSub;

    redisSub.psubscribe('nexus:notify:*', (err) => {
      if (err) {
        logger.error('[WsGateway] Failed to psubscribe to nexus:notify:*', { error: err.message });
      } else {
        logger.info('[WsGateway] Subscribed to nexus:notify:* pub/sub');
      }
    });

    redisSub.on('pmessage', (_pattern: string, channel: string, message: string) => {
      this.handlePubSubMessage(channel, message);
    });
  }

  /**
   * Route a pub/sub message to the appropriate WebSocket clients.
   *
   * Channel patterns:
   * - nexus:notify:global     -> broadcast to ALL clients
   * - nexus:notify:approval   -> broadcast to ALL clients (any can approve)
   * - nexus:notify:agent:<id> -> send only to the client owning that session
   */
  private handlePubSubMessage(redisChannel: string, raw: string): void {
    let payload: NotificationPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      logger.warn('[WsGateway] Invalid JSON in pub/sub message', { channel: redisChannel });
      return;
    }

    // Extract the sub-channel from Redis channel name (e.g., "global", "approval", "agent:abc-123")
    const prefix = 'nexus:notify:';
    const subChannel = redisChannel.startsWith(prefix) ? redisChannel.slice(prefix.length) : redisChannel;

    if (subChannel === 'global' || subChannel === 'approval') {
      // Broadcast to ALL connected clients (respecting their filter)
      this.broadcastNotification(payload, subChannel);
    } else if (subChannel.startsWith('agent:')) {
      // Targeted: find the client that owns this session
      const sessionId = subChannel.slice('agent:'.length);
      this.sendTargetedNotification(payload, sessionId, subChannel);
    } else {
      // Unknown sub-channel — broadcast to all as fallback
      this.broadcastNotification(payload, subChannel);
    }
  }

  /**
   * Send a notification to ALL connected clients, respecting per-client filters.
   */
  private broadcastNotification(payload: NotificationPayload, subChannel: string): void {
    for (const [, client] of this.clients) {
      if (this.clientAcceptsChannel(client, subChannel)) {
        this.sendNotification(client.ws, 'notify', {
          channel: payload.channel,
          event: payload.event,
          data: payload.data as Record<string, unknown>,
          timestamp: payload.timestamp,
        });
      }
    }
  }

  /**
   * Send a notification only to the client that owns a specific agent session.
   */
  private sendTargetedNotification(payload: NotificationPayload, sessionId: string, subChannel: string): void {
    for (const [, client] of this.clients) {
      if (client.sessions.has(sessionId) && this.clientAcceptsChannel(client, subChannel)) {
        this.sendNotification(client.ws, 'notify', {
          channel: payload.channel,
          event: payload.event,
          data: payload.data as Record<string, unknown>,
          timestamp: payload.timestamp,
        });
        return; // Only one client owns a session
      }
    }
  }

  /**
   * Check if a client's notification filter allows a given channel.
   * Empty filter = accept everything.
   */
  private clientAcceptsChannel(client: ClientState, subChannel: string): boolean {
    if (client.notifyFilter.size === 0) return true;
    // Check exact match or prefix match (e.g., "agent" matches "agent:abc")
    if (client.notifyFilter.has(subChannel)) return true;
    const base = subChannel.split(':')[0];
    return client.notifyFilter.has(base);
  }

  /**
   * Publish a notification to a Redis pub/sub channel.
   * Uses the non-subscriber Redis connection.
   */
  publishNotification(channel: string, event: string, data: unknown): void {
    const payload: NotificationPayload = {
      channel,
      event,
      data,
      timestamp: Date.now(),
    };
    const redisChannel = `nexus:notify:${channel}`;
    this.deps.redis.publish(redisChannel, JSON.stringify(payload)).catch((err) => {
      logger.error('[WsGateway] Failed to publish notification', { channel: redisChannel, error: err.message });
    });
  }

  // ── Authentication ──────────────────────────────────────────────────────

  /**
   * Authenticate a WebSocket upgrade request.
   * Checks (in order):
   * 1. X-API-Key header
   * 2. ?token=<jwt> query parameter
   * Returns true if authenticated.
   */
  private async authenticateUpgrade(req: IncomingMessage, url: URL): Promise<boolean> {
    // Check X-API-Key header
    const apiKey = req.headers['x-api-key'];
    if (apiKey && typeof apiKey === 'string') {
      if (verifyApiKey(apiKey)) {
        return true;
      }
    }

    // Check JWT query parameter
    const token = url.searchParams.get('token');
    if (token) {
      if (await verifyJwt(token)) {
        return true;
      }
    }

    // Check Sec-WebSocket-Protocol for JWT (browser fallback)
    const protocol = req.headers['sec-websocket-protocol'];
    if (protocol) {
      // Protocols are comma-separated; look for a JWT-like token
      const protocols = protocol.split(',').map((p) => p.trim());
      for (const p of protocols) {
        if (p.split('.').length === 3 && await verifyJwt(p)) {
          return true;
        }
      }
    }

    logger.warn('[WsGateway] Rejected unauthenticated upgrade', {
      ip: req.socket.remoteAddress,
      hasApiKey: !!apiKey,
      hasToken: !!token,
    });
    return false;
  }

  // ── Connection Handling ─────────────────────────────────────────────────

  private handleConnection(ws: WebSocket): void {
    const clientId = randomUUID();
    const client: ClientState = {
      id: clientId,
      sessions: new Map(),
      ws,
      notifyFilter: new Set(),
    };
    this.clients.set(clientId, client);

    logger.info('[WsGateway] Client connected', { clientId });

    // Send connection acknowledgement
    this.sendNotification(ws, 'connected', { clientId });

    ws.on('message', (raw: Buffer) => {
      this.handleMessage(client, raw);
    });

    ws.on('close', () => {
      this.handleDisconnect(client);
    });

    ws.on('error', (err) => {
      logger.error('[WsGateway] Client error', { clientId, error: err.message });
    });
  }

  private handleDisconnect(client: ClientState): void {
    logger.info('[WsGateway] Client disconnected', { clientId: client.id, sessions: client.sessions.size });

    // Cancel all running sessions for this client
    for (const [, session] of client.sessions) {
      if (session.status === 'running') {
        session.status = 'cancelled';
      }
    }
    client.sessions.clear();
    this.clients.delete(client.id);
  }

  // ── Message Handling ────────────────────────────────────────────────────

  private handleMessage(client: ClientState, raw: Buffer): void {
    let msg: JsonRpcRequest;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      this.sendError(client.ws, null, RPC_PARSE_ERROR, 'Parse error: invalid JSON');
      return;
    }

    // Validate JSON-RPC 2.0 structure
    if (
      msg.jsonrpc !== '2.0' ||
      typeof msg.method !== 'string' ||
      (msg.id !== undefined && typeof msg.id !== 'string' && typeof msg.id !== 'number')
    ) {
      this.sendError(client.ws, msg.id ?? null, RPC_INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request');
      return;
    }

    // Route to method handler
    switch (msg.method) {
      case 'agent.run':
        this.handleAgentRun(client, msg);
        break;
      case 'agent.cancel':
        this.handleAgentCancel(client, msg);
        break;
      case 'tools.list':
        this.handleToolsList(client, msg);
        break;
      case 'system.ping':
        this.handleSystemPing(client, msg);
        break;
      case 'notify.subscribe':
        this.handleNotifySubscribe(client, msg);
        break;
      case 'notify.unsubscribe':
        this.handleNotifyUnsubscribe(client, msg);
        break;
      default:
        this.sendError(client.ws, msg.id, RPC_METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
    }
  }

  // ── Method Handlers ─────────────────────────────────────────────────────

  /**
   * agent.run: Start a new agent session.
   * params: { task: string, sessionId?: string, maxTurns?: number, tier?: string }
   */
  private handleAgentRun(client: ClientState, msg: JsonRpcRequest): void {
    const params = msg.params || {};
    const task = params.task as string;

    if (!task || typeof task !== 'string') {
      this.sendError(client.ws, msg.id, RPC_INVALID_PARAMS, 'Missing required param: task (string)');
      return;
    }

    // Check session limit
    const activeSessions = Array.from(client.sessions.values()).filter(
      (s) => s.status === 'running',
    ).length;
    if (activeSessions >= this.maxSessionsPerClient) {
      this.sendError(client.ws, msg.id, RPC_SESSION_LIMIT_EXCEEDED,
        `Session limit exceeded: max ${this.maxSessionsPerClient} concurrent sessions`,
      );
      return;
    }

    const sessionId = (params.sessionId as string) || randomUUID();
    const maxTurns = params.maxTurns as number | undefined;
    const tier = params.tier as string | undefined;

    // Get agent config from daemon
    const nexusConfig = this.deps.daemon.getNexusConfig();
    const agentDefaults = nexusConfig?.agent;

    const approvalPolicy = nexusConfig?.approval?.policy ?? 'destructive';

    const agent = new AgentLoop({
      brain: this.deps.brain,
      toolRegistry: this.deps.toolRegistry,
      nexusConfig,
      maxTurns: Math.min(
        maxTurns || agentDefaults?.maxTurns || 30,
        100,
      ),
      maxTokens: agentDefaults?.maxTokens || 200000,
      timeoutMs: agentDefaults?.timeoutMs || 600000,
      tier: (tier as any) || agentDefaults?.tier || 'sonnet',
      maxDepth: agentDefaults?.maxDepth || 3,
      stream: true,
      approvalManager: this.deps.daemon.approvalManager,
      approvalPolicy,
      sessionId,
    });

    const session: WsSession = {
      id: sessionId,
      agent,
      status: 'running',
      startedAt: Date.now(),
      task,
    };
    client.sessions.set(sessionId, session);

    logger.info('[WsGateway] agent.run started', {
      clientId: client.id,
      sessionId,
      task: task.slice(0, 80),
    });

    // Publish agent.started lifecycle event
    this.publishNotification('global', 'agent.started', {
      sessionId,
      task: task.slice(0, 200),
    });

    // Forward agent events as JSON-RPC notifications
    const eventHandler = (event: AgentEvent) => {
      if (session.status === 'cancelled') return;
      if (client.ws.readyState !== WebSocket.OPEN) return;

      this.sendNotification(client.ws, 'agent.event', {
        sessionId,
        event: event as unknown as Record<string, unknown>,
      });
    };

    agent.on('event', eventHandler);

    // Run the agent (async, send result when done)
    const runPromise = agent.run(task)
      .then((result: AgentResult) => {
        agent.removeListener('event', eventHandler);

        if (session.status === 'cancelled') {
          session.status = 'cancelled';
          return result;
        }

        session.status = 'complete';

        // Publish agent.completed lifecycle event
        this.publishNotification('global', 'agent.completed', {
          sessionId,
          success: result.success,
          turns: result.turns,
          stoppedReason: result.stoppedReason,
        });

        // Send JSON-RPC result response
        if (client.ws.readyState === WebSocket.OPEN) {
          this.sendResult(client.ws, msg.id, {
            sessionId,
            success: result.success,
            answer: result.answer,
            turns: result.turns,
            stoppedReason: result.stoppedReason,
            totalInputTokens: result.totalInputTokens,
            totalOutputTokens: result.totalOutputTokens,
          });
        }

        return result;
      })
      .catch((err: Error) => {
        agent.removeListener('event', eventHandler);
        session.status = 'error';

        logger.error('[WsGateway] agent.run error', {
          clientId: client.id,
          sessionId,
          error: err.message,
        });

        // Publish agent.error lifecycle event
        this.publishNotification('global', 'agent.error', {
          sessionId,
          error: err.message,
        });

        if (client.ws.readyState === WebSocket.OPEN) {
          this.sendError(client.ws, msg.id, RPC_INTERNAL_ERROR, `Agent error: ${err.message}`, {
            sessionId,
          });
        }

        return {
          success: false,
          answer: err.message,
          turns: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          toolCalls: [],
          stoppedReason: 'error' as const,
        };
      });

    session.runPromise = runPromise;
  }

  /**
   * agent.cancel: Cancel a running agent session.
   * params: { sessionId: string }
   */
  private handleAgentCancel(client: ClientState, msg: JsonRpcRequest): void {
    const params = msg.params || {};
    const sessionId = params.sessionId as string;

    if (!sessionId || typeof sessionId !== 'string') {
      this.sendError(client.ws, msg.id, RPC_INVALID_PARAMS, 'Missing required param: sessionId (string)');
      return;
    }

    const session = client.sessions.get(sessionId);
    if (!session) {
      this.sendError(client.ws, msg.id, RPC_SESSION_NOT_FOUND, `Session not found: ${sessionId}`);
      return;
    }

    if (session.status !== 'running') {
      this.sendResult(client.ws, msg.id, {
        sessionId,
        cancelled: false,
        reason: `Session is already ${session.status}`,
      });
      return;
    }

    session.status = 'cancelled';
    logger.info('[WsGateway] agent.cancel', { clientId: client.id, sessionId });

    this.sendResult(client.ws, msg.id, {
      sessionId,
      cancelled: true,
    });
  }

  /**
   * tools.list: Return all registered tool names, descriptions, and parameters.
   */
  private handleToolsList(client: ClientState, msg: JsonRpcRequest): void {
    const schemas = this.deps.toolRegistry.toJsonSchemas();
    this.sendResult(client.ws, msg.id, {
      tools: schemas,
    });
  }

  /**
   * system.ping: Keepalive/health check.
   */
  private handleSystemPing(client: ClientState, msg: JsonRpcRequest): void {
    this.sendResult(client.ws, msg.id, {
      pong: true,
      timestamp: Date.now(),
    });
  }

  /**
   * notify.subscribe: Register interest in specific notification channels.
   * params: { channels: string[] }
   * Empty channels array = subscribe to everything (reset filter).
   */
  private handleNotifySubscribe(client: ClientState, msg: JsonRpcRequest): void {
    const params = msg.params || {};
    const channels = params.channels;

    if (!Array.isArray(channels)) {
      this.sendError(client.ws, msg.id, RPC_INVALID_PARAMS, 'Missing required param: channels (string[])');
      return;
    }

    for (const ch of channels) {
      if (typeof ch === 'string') {
        client.notifyFilter.add(ch);
      }
    }

    this.sendResult(client.ws, msg.id, {
      subscribed: Array.from(client.notifyFilter),
    });
  }

  /**
   * notify.unsubscribe: Stop receiving specific notification channels.
   * params: { channels: string[] }
   * Removing all channels resets to "receive everything" mode.
   */
  private handleNotifyUnsubscribe(client: ClientState, msg: JsonRpcRequest): void {
    const params = msg.params || {};
    const channels = params.channels;

    if (!Array.isArray(channels)) {
      this.sendError(client.ws, msg.id, RPC_INVALID_PARAMS, 'Missing required param: channels (string[])');
      return;
    }

    for (const ch of channels) {
      if (typeof ch === 'string') {
        client.notifyFilter.delete(ch);
      }
    }

    this.sendResult(client.ws, msg.id, {
      subscribed: Array.from(client.notifyFilter),
    });
  }

  // ── Message Sending Helpers ─────────────────────────────────────────────

  private sendResult(ws: WebSocket, id: string | number | null, result: unknown): void {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      result,
      id: id ?? 0,
    };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
  }

  private sendError(
    ws: WebSocket,
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown,
  ): void {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      error: { code, message, ...(data !== undefined ? { data } : {}) },
      id: id ?? null,
    };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
  }

  private sendNotification(ws: WebSocket, method: string, params?: Record<string, unknown>): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(notification));
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /** Gracefully stop the gateway. */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Unsubscribe from Redis pub/sub
    this.deps.redisSub.punsubscribe('nexus:notify:*').catch(() => {});

    // Cancel all sessions and close all connections
    for (const [, client] of this.clients) {
      for (const [, session] of client.sessions) {
        if (session.status === 'running') {
          session.status = 'cancelled';
        }
      }
      client.sessions.clear();
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close(1001, 'Server shutting down');
      }
    }
    this.clients.clear();

    this.wss.close();
    logger.info('[WsGateway] Stopped');
  }
}
