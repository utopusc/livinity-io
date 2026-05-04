/**
 * RunQueue — BullMQ-backed agent run queue. Phase 73-02.
 *
 * Per-user concurrency=1 via manual INCR/DECR gate (CONTEXT D-17, since
 * BullMQ's free tier only supports a global Worker `concurrency` knob; the
 * "group keys" feature for per-user serialization is BullMQ Pro / paid).
 *
 * Queue name: 'liv:agent-jobs' (CONTEXT D-15). Job options: `attempts: 1`
 * — agent runs are NOT idempotent (retrying a half-completed run would
 * double-emit chunks into RunStore). CONTEXT D-19.
 *
 * Active counter: `liv:agent_run:active:{userId}` with EX 3600 defensive TTL
 * (CONTEXT D-17 + Claude's Discretion guidance — defends against DECR leaks
 * if a worker crashes mid-job, so a stuck counter resets within 1h).
 *
 * Job lifecycle on the BullMQ side:
 *   - `enqueue()` calls `Queue.add('run', data, { attempts: 1, ... })`.
 *   - Worker processor INCRs the active counter; if > perUserConcurrency it
 *     undoes the increment, calls `job.moveToDelayed(now + 1000)`, and throws
 *     a `RUN_QUEUE_DELAYED` marker error so BullMQ does NOT mark the job
 *     'completed'. The `failed` event handler recognizes this marker and
 *     skips the markError side-effect.
 *   - On `completed` / `failed`, DECR the active counter (clamp at 0
 *     defensively if a race took it negative).
 *   - On real `failed` (non-marker), call `runStore.markError(runId, ...)`.
 *
 * Plan 73-02 ships ONLY the queue + its tests. The wire-up into
 * `agent-runs.ts` happens in Plan 73-04 (different file).
 *
 * Sacred-file guarantee (CONTEXT D-05): does NOT modify
 * `nexus/packages/core/src/sdk-agent-runner.ts` (SHA
 * `4f868d318abff71f8c8bfbcf443b2393a553018b`).
 */

import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { RunStore } from './run-store.js';

// ── Types ────────────────────────────────────────────────────────

/**
 * Job payload for the agent-run queue. Note `conversationHistory` is NOT
 * carried here (CONTEXT D-18) — the runner factory in livinityd loads
 * conversation context from its own session/conversation store. Diverges
 * from v31-DRAFT line 703 by design; matches the existing P67-03
 * `livAgentRunnerFactory(runId, task)` signature parity.
 */
export type AgentJobData = {
  runId: string;
  userId: string;
  task: string;
  enqueuedAt: number;
};

/**
 * Constructor options. Defaults per CONTEXT D-15:
 *   perUserConcurrency = 1   (v31-DRAFT 9.2 spec)
 *   globalConcurrency  = 5   (LivOS single-machine, conservative)
 *   queueName          = 'liv:agent-jobs'
 */
export type RunQueueOptions = {
  redisClient: Redis;
  runStore: RunStore;
  livAgentRunnerFactory: (runId: string, task: string) => Promise<void>;
  perUserConcurrency?: number;
  globalConcurrency?: number;
  queueName?: string;
};

// ── Constants ────────────────────────────────────────────────────

/**
 * Marker error message thrown out of the worker processor when a job is
 * delayed via `moveToDelayed` because the per-user gate said "wait". The
 * `failed` event handler recognizes this and skips the markError side-effect
 * (it's not a real failure — the job is on its way back to the queue).
 */
const DELAY_MARKER = 'RUN_QUEUE_DELAYED';

/** EXPIRE 3600 (1h) on every INCR — defensive against DECR leaks. */
const ACTIVE_COUNTER_TTL = 3600;

/** Active-counter key per user. Prefix `liv:` per CONTEXT D-04. */
const activeKey = (userId: string): string => `liv:agent_run:active:${userId}`;

// ── Class ────────────────────────────────────────────────────────

class RunQueue {
  private queue: Queue<AgentJobData> | null = null;
  private worker: Worker<AgentJobData> | null = null;
  private readonly perUserConcurrency: number;
  private readonly globalConcurrency: number;
  private readonly queueName: string;

  constructor(private readonly opts: RunQueueOptions) {
    this.perUserConcurrency = opts.perUserConcurrency ?? 1;
    this.globalConcurrency = opts.globalConcurrency ?? 5;
    this.queueName = opts.queueName ?? 'liv:agent-jobs';

    this.queue = new Queue<AgentJobData>(this.queueName, {
      connection: opts.redisClient,
    });
  }

  /**
   * Enqueue an agent run job. Adds with `attempts: 1` (no retries —
   * CONTEXT D-19) and `removeOnComplete/Fail: 100` to bound BullMQ
   * key growth in Redis.
   *
   * Throws if `stop()` has been called on this instance — pick a NEW
   * RunQueue rather than re-using one that's been torn down.
   */
  async enqueue(jobData: AgentJobData): Promise<void> {
    if (!this.queue) {
      throw new Error('RunQueue stopped — construct a new instance');
    }
    await this.queue.add('run', jobData, {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  }

  /**
   * Start the worker. Idempotent: subsequent calls after the first do NOT
   * create a second worker (early-return guard). Wire `completed` and
   * `failed` event handlers for active-counter bookkeeping + markError
   * routing.
   */
  async start(): Promise<void> {
    if (this.worker) return;
    this.worker = new Worker<AgentJobData>(
      this.queueName,
      async (job) => this.processJob(job),
      {
        connection: this.opts.redisClient,
        concurrency: this.globalConcurrency,
      },
    );
    this.worker.on('failed', async (job, err) => this.onJobFailed(job, err));
    this.worker.on('completed', async (job) => this.onJobCompleted(job));
  }

  /**
   * Gracefully close the worker and queue. BullMQ's `worker.close()` waits
   * for the current job to complete by default, so in-flight jobs are not
   * killed. After `stop()`, calling `enqueue()` throws.
   */
  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.worker = null;
    this.queue = null;
  }

  /**
   * Read the current active-run count for a user. Always returns a
   * non-negative integer (NaN ⇒ 0; missing key ⇒ 0).
   */
  async getActiveCount(userId: string): Promise<number> {
    const v = await this.opts.redisClient.get(activeKey(userId));
    const n = parseInt(v ?? '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  // ── Internal ──────────────────────────────────────────────────

  /**
   * Worker processor body. Per-user gate THEN factory call.
   *
   * Gate algorithm (CONTEXT D-17 + reference impl in plan):
   *   1. INCR active counter
   *   2. EXPIRE 3600 (defensive TTL)
   *   3. If count > perUserConcurrency: DECR (undo) + moveToDelayed +
   *      throw DELAY_MARKER (BullMQ requires a throw to halt the
   *      processor cleanly; the `failed` handler skips markError when
   *      it sees this marker).
   *   4. Else: invoke livAgentRunnerFactory(runId, task) and await.
   */
  private async processJob(job: Job<AgentJobData>): Promise<void> {
    const redis = this.opts.redisClient;
    const userId = job.data.userId;
    const key = activeKey(userId);

    // INCR returns the new value (Redis docs: post-increment).
    const count = await redis.incr(key);
    // Defensive TTL — defends against DECR leaks if process crashes between
    // INCR and the `completed`/`failed` event handler. CONTEXT Claude's
    // Discretion. Greppable: 'EX' / EXPIRE / 3600.
    await redis.expire(key, ACTIVE_COUNTER_TTL);

    if (count > this.perUserConcurrency) {
      // Undo our increment — we're not actually going to run.
      await redis.decr(key);
      // Re-queue with a 1s delay so the gate-poll doesn't pin a CPU.
      await job.moveToDelayed(Date.now() + 1000);
      // BullMQ semantic: moveToDelayed alone re-queues but the processor
      // would still resolve normally and BullMQ would mark the job
      // 'completed'. Throwing breaks the processor cleanly so BullMQ
      // routes via the 'failed' path. The DELAY_MARKER lets the failed
      // handler distinguish this benign re-queue from a real factory
      // failure (no markError side-effect, no double-DECR).
      throw new Error(DELAY_MARKER);
    }

    // Actually run the agent. The factory's promise resolves on completion
    // (or throws on real error) — BullMQ routes throws to the 'failed'
    // event, which calls runStore.markError(runId, ...).
    await this.opts.livAgentRunnerFactory(job.data.runId, job.data.task);
  }

  /**
   * BullMQ 'failed' event handler. Two paths:
   *   - DELAY_MARKER → benign re-queue from the per-user gate. The
   *     processor already DECR'd before throwing, so we MUST NOT
   *     DECR again here. Just early-return — no markError.
   *   - Real failure → DECR the active counter (clamp negative to 0)
   *     and call runStore.markError(runId, { message, stack }).
   *
   * Best-effort try/catch around markError prevents secondary failures
   * (e.g. RunStore on a TTL'd run) from masking the primary failure.
   */
  private async onJobFailed(
    job: Job<AgentJobData> | undefined,
    err: Error,
  ): Promise<void> {
    if (!job) return;

    // DELAY_MARKER is a re-queue signal, not a real failure. The
    // processor already undid its own INCR before throwing, so we
    // skip the DECR + markError here entirely.
    if (err?.message === DELAY_MARKER) return;

    const redis = this.opts.redisClient;
    const userId = job.data.userId;
    const key = activeKey(userId);

    // Real failure: undo the INCR the processor performed at the top.
    const after = await redis.decr(key);
    // Lua-free best-effort clamp: if a concurrent failed job pushed the
    // counter negative (e.g. EXPIRE wiped it mid-flight), reset to 0.
    // Race window is microseconds; T-73-02-03 documented as 'accept'.
    if (after < 0) await redis.set(key, 0);

    try {
      await this.opts.runStore.markError(job.data.runId, {
        message: err?.message ?? 'unknown',
        stack: err?.stack,
      });
    } catch {
      // RunStore.markError best-effort — already-completed runs may noop,
      // and a TTL'd meta key returns null which markError silently
      // tolerates. Don't let a secondary failure mask the primary.
    }
  }

  /**
   * BullMQ 'completed' event handler. Just bookkeeping: DECR the
   * active counter (clamp negative to 0). RunStore.markComplete is
   * already called by LivAgentRunner.start() — RunQueue does NOT
   * duplicate that call (CONTEXT D-19).
   */
  private async onJobCompleted(job: Job<AgentJobData>): Promise<void> {
    const redis = this.opts.redisClient;
    const userId = job.data.userId;
    const key = activeKey(userId);
    const after = await redis.decr(key);
    if (after < 0) await redis.set(key, 0);
  }
}

// ── Public exports ───────────────────────────────────────────────

export { RunQueue };
