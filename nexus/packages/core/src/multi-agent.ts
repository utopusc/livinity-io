import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { SdkAgentRunner } from './sdk-agent-runner.js';
import { ToolRegistry } from './tool-registry.js';
import type { Brain } from './brain.js';
import type { NexusConfig } from './config/schema.js';
import { logger } from './logger.js';

// ── Redis key patterns ──────────────────────────────────────────────
// nexus:multi-agent:session:{id}     — JSON session state (TTL: 1 hour)
// nexus:multi-agent:history:{id}     — List of messages  (TTL: 1 hour)
// nexus:multi-agent:active           — SET of currently active (running/pending) session IDs
// nexus:multi-agent:parent:{parentId} — SET of child session IDs for a parent

const KEY_PREFIX = 'nexus:multi-agent';
const SESSION_TTL = 3600; // 1 hour
const MAX_HISTORY_MESSAGES = 50;

/** Sub-agent session stored in Redis */
export interface SubAgentSession {
  id: string;               // UUID
  parentSessionId: string;  // Who spawned this
  task: string;             // The assigned task
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;        // Unix timestamp ms
  updatedAt: number;        // Unix timestamp ms
  maxTurns: number;         // Default 8, hard max 8
  maxTokens: number;        // Default 50k, hard max 50k
  result?: string;          // Final answer when completed
  error?: string;           // Error message if failed
  turns: number;            // Turns used so far
  inputTokens: number;      // Input tokens consumed
  outputTokens: number;     // Output tokens consumed
  isSubAgent: true;         // Metadata flag — actual tool exclusion enforced in Plan 03
}

/** Message in a sub-agent conversation */
export interface SubAgentMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * MultiAgentManager — Redis-backed sub-agent session lifecycle management.
 *
 * The main AI agent spawns focused sub-agents for specific subtasks
 * (research, file operations, analysis) via four MCP tools:
 *   sessions_create, sessions_list, sessions_send, sessions_history
 *
 * Sessions are stored in Redis with 1-hour TTL for automatic cleanup.
 * Concurrent sessions are limited to protect VPS resources (MULTI-06).
 */
export class MultiAgentManager {
  private redis: Redis;
  private maxConcurrent: number;
  private brain?: Brain;
  private toolRegistry?: ToolRegistry;
  private nexusConfig?: NexusConfig;

  constructor(config: {
    redis: Redis;
    maxConcurrent?: number;
    brain?: Brain;
    toolRegistry?: ToolRegistry;
    nexusConfig?: NexusConfig;
  }) {
    this.redis = config.redis;
    this.maxConcurrent = config.maxConcurrent ?? 2; // MULTI-06: VPS resource constraint
    this.brain = config.brain;
    this.toolRegistry = config.toolRegistry;
    this.nexusConfig = config.nexusConfig;
  }

  // ── Key helpers ──────────────────────────────────────────────────

  private sessionKey(id: string): string {
    return `${KEY_PREFIX}:session:${id}`;
  }

  private historyKey(id: string): string {
    return `${KEY_PREFIX}:history:${id}`;
  }

  private get activeKey(): string {
    return `${KEY_PREFIX}:active`;
  }

  private parentKey(parentId: string): string {
    return `${KEY_PREFIX}:parent:${parentId}`;
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Create a new sub-agent session.
   * Enforces concurrent limit (MULTI-06) and resource caps.
   */
  async create(opts: {
    parentSessionId: string;
    task: string;
    maxTurns?: number;
    maxTokens?: number;
  }): Promise<SubAgentSession> {
    // MULTI-06: Check concurrent count
    const activeCount = await this.redis.scard(this.activeKey);
    if (activeCount >= this.maxConcurrent) {
      throw new Error(
        `Maximum concurrent sub-agents (${this.maxConcurrent}) reached. Wait for an existing sub-agent to complete.`,
      );
    }

    const id = randomUUID();
    const now = Date.now();

    // Enforce hard limits
    const maxTurns = Math.min(opts.maxTurns ?? 8, 8);
    const maxTokens = Math.min(opts.maxTokens ?? 50_000, 50_000);

    const session: SubAgentSession = {
      id,
      parentSessionId: opts.parentSessionId,
      task: opts.task,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      maxTurns,
      maxTokens,
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      isSubAgent: true,
    };

    // Store atomically: session JSON + add to active set + add to parent's children set
    const pipeline = this.redis.pipeline();
    pipeline.set(this.sessionKey(id), JSON.stringify(session), 'EX', SESSION_TTL);
    pipeline.sadd(this.activeKey, id);
    pipeline.sadd(this.parentKey(opts.parentSessionId), id);
    await pipeline.exec();

    logger.info('MultiAgent: session created', {
      sessionId: id.slice(0, 8),
      parentSessionId: opts.parentSessionId.slice(0, 8),
      task: opts.task.slice(0, 80),
      maxTurns,
      maxTokens,
    });

    return session;
  }

  /**
   * Get a session by ID. Returns null if not found or expired.
   */
  async get(sessionId: string): Promise<SubAgentSession | null> {
    const raw = await this.redis.get(this.sessionKey(sessionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SubAgentSession;
    } catch {
      return null;
    }
  }

  /**
   * List sessions. If parentSessionId is given, returns that parent's children.
   * Otherwise returns all active sessions.
   */
  async list(parentSessionId?: string): Promise<SubAgentSession[]> {
    const setKey = parentSessionId ? this.parentKey(parentSessionId) : this.activeKey;
    const ids = await this.redis.smembers(setKey);

    if (ids.length === 0) return [];

    // Fetch all sessions in a single pipeline
    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.get(this.sessionKey(id));
    }
    const results = await pipeline.exec();

    const sessions: SubAgentSession[] = [];
    for (const result of results || []) {
      if (result && !result[0] && result[1]) {
        try {
          sessions.push(JSON.parse(result[1] as string) as SubAgentSession);
        } catch {
          // Skip unparseable entries
        }
      }
    }

    // Sort by createdAt descending (newest first)
    sessions.sort((a, b) => b.createdAt - a.createdAt);
    return sessions;
  }

  /**
   * Update a session's state. Handles terminal status transitions
   * by removing from the active set.
   */
  async updateStatus(sessionId: string, updates: Partial<SubAgentSession>): Promise<void> {
    const raw = await this.redis.get(this.sessionKey(sessionId));
    if (!raw) return;

    let session: SubAgentSession;
    try {
      session = JSON.parse(raw) as SubAgentSession;
    } catch {
      return;
    }

    // Merge updates
    Object.assign(session, updates, { updatedAt: Date.now() });

    // Preserve remaining TTL
    const ttl = await this.redis.ttl(this.sessionKey(sessionId));
    const effectiveTtl = ttl > 0 ? ttl : SESSION_TTL;

    await this.redis.set(this.sessionKey(sessionId), JSON.stringify(session), 'EX', effectiveTtl);

    // Terminal states: remove from active set
    if (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') {
      await this.redis.srem(this.activeKey, sessionId);
      logger.info('MultiAgent: session terminated', {
        sessionId: sessionId.slice(0, 8),
        status: session.status,
        turns: session.turns,
        tokens: session.inputTokens + session.outputTokens,
      });
    }
  }

  /**
   * Add a message to a session's conversation history.
   */
  async addMessage(sessionId: string, message: SubAgentMessage): Promise<void> {
    const key = this.historyKey(sessionId);
    const pipeline = this.redis.pipeline();
    pipeline.rpush(key, JSON.stringify(message));
    pipeline.ltrim(key, -MAX_HISTORY_MESSAGES, -1); // Keep last N messages
    pipeline.expire(key, SESSION_TTL);
    await pipeline.exec();
  }

  /**
   * Get a session's conversation history in chronological order.
   */
  async getHistory(sessionId: string): Promise<SubAgentMessage[]> {
    const raw = await this.redis.lrange(this.historyKey(sessionId), 0, -1);
    const messages: SubAgentMessage[] = [];
    for (const entry of raw) {
      try {
        messages.push(JSON.parse(entry) as SubAgentMessage);
      } catch {
        // Skip unparseable entries
      }
    }
    return messages;
  }

  /**
   * Get the count of currently active (running/pending) sessions.
   */
  async getActiveCount(): Promise<number> {
    return this.redis.scard(this.activeKey);
  }

  /**
   * Clean up stale entries from the active set.
   * Sessions that have expired from Redis but remain in the active set are removed.
   * Returns the number of cleaned-up entries.
   */
  async cleanup(): Promise<number> {
    const ids = await this.redis.smembers(this.activeKey);
    if (ids.length === 0) return 0;

    let cleaned = 0;
    const pipeline = this.redis.pipeline();

    for (const id of ids) {
      const exists = await this.redis.exists(this.sessionKey(id));
      if (!exists) {
        pipeline.srem(this.activeKey, id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await pipeline.exec();
      logger.info('MultiAgent: cleaned up stale sessions', { cleaned });
    }

    return cleaned;
  }

  /**
   * Cancel a running or pending session.
   * Returns true if cancelled, false if not found or already in terminal state.
   */
  async cancel(sessionId: string): Promise<boolean> {
    const session = await this.get(sessionId);
    if (!session) return false;

    if (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') {
      return false; // Already terminal
    }

    await this.updateStatus(sessionId, { status: 'cancelled' });
    return true;
  }

  // ── Sub-agent execution ──────────────────────────────────────────

  /**
   * Execute a sub-agent session through SdkAgentRunner.
   *
   * MULTI-07 (DAG topology): Sub-agents CANNOT spawn further sub-agents.
   * This is enforced by building a restricted ToolRegistry that excludes all
   * sessions_* tools, and by setting a system prompt that explicitly states
   * the sub-agent cannot create sessions.
   *
   * MULTI-05: Turn limit (maxTurns) and token budget (maxTokens) are
   * enforced via the SdkAgentRunner config inherited from the session.
   */
  async executeSubAgent(sessionId: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (!this.brain || !this.toolRegistry) {
      throw new Error('Execution dependencies not configured (brain, toolRegistry required)');
    }

    // Update status to running
    await this.updateStatus(sessionId, { status: 'running', updatedAt: Date.now() });

    try {
      // MULTI-07: Build a restricted ToolRegistry — exclude sessions_* tools
      // to prevent fork bombs (sub-agents cannot spawn further sub-agents)
      const restrictedRegistry = new ToolRegistry();
      const allToolNames = this.toolRegistry.list();
      for (const name of allToolNames) {
        if (name.startsWith('sessions_')) continue; // DAG enforcement
        const tool = this.toolRegistry.get(name);
        if (tool) {
          restrictedRegistry.register(tool);
        }
      }

      // Build context from session history (messages sent to this sub-agent)
      const history = await this.getHistory(sessionId);
      const historyContext = history.length > 0
        ? history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')
        : '';

      const taskWithContext = historyContext
        ? `## Prior Context\n${historyContext}\n\n## Task\n${session.task}`
        : session.task;

      // Create SdkAgentRunner with restricted config
      // MULTI-05: maxTurns and maxTokens from session (hard-capped at 8 turns / 50k tokens)
      const runner = new SdkAgentRunner({
        brain: this.brain,
        toolRegistry: restrictedRegistry,
        nexusConfig: this.nexusConfig,
        maxTurns: session.maxTurns,
        maxTokens: session.maxTokens,
        tier: 'sonnet',
        stream: false, // Sub-agents don't stream to channels
        systemPromptOverride: `You are a focused sub-agent working on a specific task. Complete the task efficiently and provide a clear, concise result. You do NOT have access to session management tools — you cannot spawn further sub-agents. Focus only on the task assigned to you.`,
      });

      const result = await runner.run(taskWithContext);

      // Store result in session state
      await this.updateStatus(sessionId, {
        status: result.success ? 'completed' : 'failed',
        result: result.answer,
        error: result.success ? undefined : result.answer,
        turns: result.turns,
        inputTokens: result.totalInputTokens,
        outputTokens: result.totalOutputTokens,
        updatedAt: Date.now(),
      });

      // Add the result as an assistant message in history
      await this.addMessage(sessionId, {
        role: 'assistant',
        content: result.answer,
        timestamp: Date.now(),
      });

      logger.info('MultiAgent: sub-agent completed', {
        sessionId: sessionId.slice(0, 8),
        success: result.success,
        turns: result.turns,
        inputTokens: result.totalInputTokens,
        outputTokens: result.totalOutputTokens,
      });
    } catch (err: any) {
      await this.updateStatus(sessionId, {
        status: 'failed',
        error: err.message,
        updatedAt: Date.now(),
      });

      await this.addMessage(sessionId, {
        role: 'assistant',
        content: `Sub-agent error: ${err.message}`,
        timestamp: Date.now(),
      });

      logger.error('MultiAgent: sub-agent execution failed', {
        sessionId: sessionId.slice(0, 8),
        error: err.message,
      });
    }
  }
}
