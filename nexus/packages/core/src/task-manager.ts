/**
 * TaskManager: BullMQ-based parallel agent task execution.
 *
 * Enables running multiple independent agent tasks concurrently with:
 * - Status tracking (queued, running, completed, failed, cancelled)
 * - Resource-aware scheduling (BullMQ concurrency limits)
 * - Cancellation via Redis flag
 * - Result persistence with configurable TTL
 * - Real-time event publishing via Redis pub/sub
 */

import { randomUUID } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { AgentLoop } from './agent.js';
import type { AgentEvent, AgentResult } from './agent.js';
import type { Brain } from './brain.js';
import type { ToolRegistry } from './tool-registry.js';
import type { ApprovalManager } from './approval-manager.js';
import type { NexusConfig } from './config/schema.js';
import { logger } from './logger.js';

// ── Types ─────────────────────────────────────────────────────────────────

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskInfo {
  id: string;
  task: string;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  progress?: string;
  result?: {
    success: boolean;
    answer: string;
    turns: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    stoppedReason: string;
  };
  error?: string;
  sessionId?: string;
  tier?: string;
}

export interface SubmitTaskOptions {
  task: string;
  tier?: 'flash' | 'haiku' | 'sonnet' | 'opus';
  maxTurns?: number;
  maxTokens?: number;
  timeoutMs?: number;
  sessionId?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

const QUEUE_NAME = 'nexus-parallel-tasks';
const TASK_KEY_PREFIX = 'nexus:tasks:';
const CANCEL_KEY_SUFFIX = ':cancel';
const NOTIFY_PREFIX = 'nexus:notify:task:';

// ── TaskManager Class ─────────────────────────────────────────────────────

interface TaskManagerOpts {
  brain: Brain;
  toolRegistry: ToolRegistry;
  redis: Redis;
  nexusConfig?: NexusConfig;
  approvalManager?: ApprovalManager;
}

export class TaskManager {
  private queue: Queue;
  private worker: Worker;
  private brain: Brain;
  private toolRegistry: ToolRegistry;
  private redis: Redis;
  private nexusConfig?: NexusConfig;
  private approvalManager?: ApprovalManager;

  constructor(opts: TaskManagerOpts) {
    this.brain = opts.brain;
    this.toolRegistry = opts.toolRegistry;
    this.redis = opts.redis;
    this.nexusConfig = opts.nexusConfig;
    this.approvalManager = opts.approvalManager;

    const tasksConfig = opts.nexusConfig?.tasks;
    const maxConcurrent = tasksConfig?.maxConcurrent ?? 4;

    // Extract BullMQ-compatible connection options from ioredis
    const redisOpts = opts.redis.options as any;
    const bullConnection = {
      host: redisOpts?.host || 'localhost',
      port: redisOpts?.port || 6379,
      ...(redisOpts?.password ? { password: redisOpts.password } : {}),
    };

    // Create BullMQ queue
    this.queue = new Queue(QUEUE_NAME, {
      connection: bullConnection,
      defaultJobOptions: {
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    });

    // Create BullMQ worker with concurrency limit
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => this.processTask(job),
      { connection: bullConnection, concurrency: maxConcurrent },
    );

    this.worker.on('failed', (job, err) => {
      logger.error('[TaskManager] Worker job failed', { jobId: job?.id, error: err.message });
    });

    logger.info('[TaskManager] Initialized', { maxConcurrent, queue: QUEUE_NAME });
  }

  // ── Submit ──────────────────────────────────────────────────────────────

  async submit(options: SubmitTaskOptions): Promise<string> {
    const taskId = randomUUID();
    const now = Date.now();

    const tasksConfig = this.nexusConfig?.tasks;

    // Build task info
    const info: TaskInfo = {
      id: taskId,
      task: options.task,
      status: 'queued',
      createdAt: now,
      sessionId: options.sessionId,
      tier: options.tier,
    };

    // Store initial status in Redis
    const ttl = tasksConfig?.resultTtlSec ?? 3600;
    await this.redis.set(
      `${TASK_KEY_PREFIX}${taskId}`,
      JSON.stringify(info),
      'EX',
      ttl + 600, // Extra 10min buffer for running tasks
    );

    // Enqueue for processing
    await this.queue.add('task', {
      ...options,
      taskId,
      maxTurns: options.maxTurns ?? tasksConfig?.perTaskMaxTurns ?? 15,
      maxTokens: options.maxTokens ?? tasksConfig?.perTaskTokenBudget ?? 100000,
      timeoutMs: options.timeoutMs ?? tasksConfig?.perTaskTimeoutMs ?? 300000,
    }, { jobId: taskId });

    logger.info('[TaskManager] Task submitted', { taskId, task: options.task.slice(0, 80) });
    return taskId;
  }

  // ── Status ──────────────────────────────────────────────────────────────

  async getStatus(taskId: string): Promise<TaskInfo | null> {
    const raw = await this.redis.get(`${TASK_KEY_PREFIX}${taskId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TaskInfo;
    } catch {
      return null;
    }
  }

  // ── List ────────────────────────────────────────────────────────────────

  async listTasks(filter?: { status?: TaskStatus }): Promise<TaskInfo[]> {
    const tasks: TaskInfo[] = [];
    let cursor = '0';

    // Use SCAN to avoid blocking Redis with KEYS
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH', `${TASK_KEY_PREFIX}*`,
        'COUNT', 100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        // Skip cancel flag keys
        if (key.endsWith(CANCEL_KEY_SUFFIX)) continue;

        const raw = await this.redis.get(key);
        if (!raw) continue;
        try {
          const info = JSON.parse(raw) as TaskInfo;
          if (filter?.status && info.status !== filter.status) continue;
          tasks.push(info);
        } catch {
          // Skip malformed entries
        }
      }
    } while (cursor !== '0');

    // Sort by createdAt descending, limit to 50
    tasks.sort((a, b) => b.createdAt - a.createdAt);
    return tasks.slice(0, 50);
  }

  // ── Cancel ──────────────────────────────────────────────────────────────

  async cancel(taskId: string): Promise<boolean> {
    const raw = await this.redis.get(`${TASK_KEY_PREFIX}${taskId}`);
    if (!raw) return false;

    let info: TaskInfo;
    try {
      info = JSON.parse(raw);
    } catch {
      return false;
    }

    // Can only cancel queued or running tasks
    if (info.status !== 'queued' && info.status !== 'running') {
      return false;
    }

    // Set cancel flag (worker checks this between turns)
    await this.redis.set(`${TASK_KEY_PREFIX}${taskId}${CANCEL_KEY_SUFFIX}`, '1', 'EX', 60);

    // Update status to cancelled
    info.status = 'cancelled';
    info.completedAt = Date.now();
    const ttl = this.nexusConfig?.tasks?.resultTtlSec ?? 3600;
    await this.redis.set(
      `${TASK_KEY_PREFIX}${taskId}`,
      JSON.stringify(info),
      'EX',
      ttl,
    );

    // Publish cancellation event
    await this.redis.publish(`${NOTIFY_PREFIX}${taskId}`, JSON.stringify({
      channel: `task:${taskId}`,
      event: 'task.cancelled',
      data: { taskId },
      timestamp: Date.now(),
    }));

    logger.info('[TaskManager] Task cancelled', { taskId });
    return true;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  async cleanup(): Promise<void> {
    logger.info('[TaskManager] Shutting down...');
    await this.worker.close();
    await this.queue.close();
    logger.info('[TaskManager] Shutdown complete');
  }

  // ── Worker Processor ────────────────────────────────────────────────────

  private async processTask(job: Job): Promise<void> {
    const { taskId, task, tier, maxTurns, maxTokens, timeoutMs, sessionId } = job.data;

    const tasksConfig = this.nexusConfig?.tasks;
    const resultTtl = tasksConfig?.resultTtlSec ?? 3600;

    // Check if already cancelled before starting
    const cancelFlag = await this.redis.get(`${TASK_KEY_PREFIX}${taskId}${CANCEL_KEY_SUFFIX}`);
    if (cancelFlag) {
      logger.info('[TaskManager] Task was cancelled before starting', { taskId });
      return;
    }

    // Update status to running
    const info: TaskInfo = {
      id: taskId,
      task,
      status: 'running',
      createdAt: job.timestamp,
      startedAt: Date.now(),
      sessionId,
      tier,
    };
    await this.redis.set(
      `${TASK_KEY_PREFIX}${taskId}`,
      JSON.stringify(info),
      'EX',
      resultTtl + 600,
    );

    // Publish running event
    await this.redis.publish(`${NOTIFY_PREFIX}${taskId}`, JSON.stringify({
      channel: `task:${taskId}`,
      event: 'task.running',
      data: { taskId, task: task.slice(0, 200) },
      timestamp: Date.now(),
    }));

    // Create AgentLoop for this task
    const approvalPolicy = this.nexusConfig?.approval?.policy ?? 'destructive';

    const agent = new AgentLoop({
      brain: this.brain,
      toolRegistry: this.toolRegistry,
      nexusConfig: this.nexusConfig,
      maxTurns: maxTurns ?? 15,
      maxTokens: maxTokens ?? 100000,
      timeoutMs: timeoutMs ?? 300000,
      tier: tier || 'sonnet',
      stream: true,
      approvalManager: this.approvalManager,
      approvalPolicy,
      sessionId: sessionId || taskId,
    });

    // Forward agent events to Redis pub/sub and update progress
    const eventHandler = async (event: AgentEvent) => {
      // Check cancel flag on each event
      const cancelled = await this.redis.get(`${TASK_KEY_PREFIX}${taskId}${CANCEL_KEY_SUFFIX}`);
      if (cancelled) {
        // We can't abort the agent mid-turn, but we note it
        logger.info('[TaskManager] Cancel flag detected during event', { taskId, eventType: event.type });
      }

      // Update progress in Redis
      if (event.type === 'tool_call' || event.type === 'thinking') {
        const progressMsg = event.type === 'tool_call'
          ? `Turn ${event.turn}: calling tool`
          : `Turn ${event.turn}: thinking`;
        info.progress = progressMsg;
        await this.redis.set(
          `${TASK_KEY_PREFIX}${taskId}`,
          JSON.stringify(info),
          'KEEPTTL',
        );
      }

      // Publish event to Redis pub/sub for real-time WebSocket routing
      await this.redis.publish(`${NOTIFY_PREFIX}${taskId}`, JSON.stringify({
        channel: `task:${taskId}`,
        event: `task.agent.${event.type}`,
        data: { taskId, turn: event.turn, agentEvent: event },
        timestamp: Date.now(),
      }));
    };

    agent.on('event', eventHandler);

    try {
      const result: AgentResult = await agent.run(task);
      agent.removeListener('event', eventHandler);

      // Check if cancelled during execution
      const cancelledDuring = await this.redis.get(`${TASK_KEY_PREFIX}${taskId}${CANCEL_KEY_SUFFIX}`);
      if (cancelledDuring) {
        info.status = 'cancelled';
        info.completedAt = Date.now();
        info.result = {
          success: false,
          answer: 'Task was cancelled during execution.',
          turns: result.turns,
          totalInputTokens: result.totalInputTokens,
          totalOutputTokens: result.totalOutputTokens,
          stoppedReason: 'cancelled',
        };
      } else {
        info.status = 'completed';
        info.completedAt = Date.now();
        info.result = {
          success: result.success,
          answer: result.answer,
          turns: result.turns,
          totalInputTokens: result.totalInputTokens,
          totalOutputTokens: result.totalOutputTokens,
          stoppedReason: result.stoppedReason,
        };
      }

      await this.redis.set(
        `${TASK_KEY_PREFIX}${taskId}`,
        JSON.stringify(info),
        'EX',
        resultTtl,
      );

      // Publish completion event
      await this.redis.publish(`${NOTIFY_PREFIX}${taskId}`, JSON.stringify({
        channel: `task:${taskId}`,
        event: info.status === 'cancelled' ? 'task.cancelled' : 'task.completed',
        data: { taskId, success: result.success, turns: result.turns },
        timestamp: Date.now(),
      }));

      logger.info('[TaskManager] Task completed', {
        taskId,
        status: info.status,
        turns: result.turns,
        success: result.success,
      });
    } catch (err: any) {
      agent.removeListener('event', eventHandler);

      info.status = 'failed';
      info.completedAt = Date.now();
      info.error = err.message || String(err);

      await this.redis.set(
        `${TASK_KEY_PREFIX}${taskId}`,
        JSON.stringify(info),
        'EX',
        resultTtl,
      );

      // Publish error event
      await this.redis.publish(`${NOTIFY_PREFIX}${taskId}`, JSON.stringify({
        channel: `task:${taskId}`,
        event: 'task.failed',
        data: { taskId, error: err.message },
        timestamp: Date.now(),
      }));

      logger.error('[TaskManager] Task failed', { taskId, error: err.message });
    }
  }
}
