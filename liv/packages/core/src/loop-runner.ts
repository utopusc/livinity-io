import { logger } from './logger.js';
import type { SubagentConfig } from './subagent-manager.js';
import type { SubagentManager } from './subagent-manager.js';
import type Redis from 'ioredis';

export interface LoopContext {
  /** Current iteration (0-based) */
  iteration: number;
  /** Subagent config */
  config: SubagentConfig;
  /** Persistent state from previous iteration */
  previousState?: string;
}

type LoopExecutor = (ctx: LoopContext) => Promise<{ result: string; state?: string }>;

interface ActiveLoop {
  subagentId: string;
  timer: ReturnType<typeof setTimeout> | null;
  iteration: number;
  maxIterations: number;
  intervalMs: number;
  running: boolean;
  task: string;
}

const STATE_PREFIX = 'nexus:loop_state:';

export class LoopRunner {
  private redis: Redis;
  private subagentManager: SubagentManager;
  private loops = new Map<string, ActiveLoop>();
  private executor: LoopExecutor | null = null;
  private stopping = false;

  constructor(redis: Redis, subagentManager: SubagentManager) {
    this.redis = redis;
    this.subagentManager = subagentManager;
  }

  /** Set the executor function that runs each loop iteration */
  onExecute(executor: LoopExecutor): void {
    this.executor = executor;
  }

  /** Start all active loop agents */
  async startAll(): Promise<void> {
    const agents = await this.subagentManager.getLoopAgents();
    for (const agent of agents) {
      if (agent.loop) {
        await this.start(agent);
      }
    }
    logger.info('LoopRunner: started all loops', { count: agents.length });
  }

  /** Start a loop for a specific subagent */
  async start(config: SubagentConfig): Promise<void> {
    if (!config.loop) {
      logger.warn('LoopRunner: no loop config', { id: config.id });
      return;
    }

    // Stop existing loop for this subagent if any
    this.stopOne(config.id);

    const active: ActiveLoop = {
      subagentId: config.id,
      timer: null,
      iteration: 0,
      maxIterations: config.loop.maxIterations || Infinity,
      intervalMs: config.loop.intervalMs,
      running: true,
      task: config.loop.task,
    };

    this.loops.set(config.id, active);

    logger.info('LoopRunner: starting loop', {
      id: config.id,
      intervalMs: active.intervalMs,
      maxIterations: active.maxIterations === Infinity ? 'unlimited' : active.maxIterations,
    });

    // Run first iteration immediately
    this.runIteration(config.id);
  }

  /** Stop a specific subagent's loop */
  stopOne(subagentId: string): void {
    const active = this.loops.get(subagentId);
    if (!active) return;

    active.running = false;
    if (active.timer) {
      clearTimeout(active.timer);
      active.timer = null;
    }
    this.loops.delete(subagentId);
    logger.info('LoopRunner: stopped loop', { id: subagentId, iterations: active.iteration });
  }

  /** Stop all loops */
  async stopAll(): Promise<void> {
    this.stopping = true;
    for (const [id] of this.loops) {
      this.stopOne(id);
    }
    logger.info('LoopRunner: all loops stopped');
  }

  /** List active loops */
  listActive(): Array<{ subagentId: string; iteration: number; intervalMs: number; running: boolean }> {
    return Array.from(this.loops.values()).map((l) => ({
      subagentId: l.subagentId,
      iteration: l.iteration,
      intervalMs: l.intervalMs,
      running: l.running,
    }));
  }

  /** Run a single iteration of a subagent's loop */
  private async runIteration(subagentId: string): Promise<void> {
    const active = this.loops.get(subagentId);
    if (!active || !active.running || this.stopping) return;

    if (active.iteration >= active.maxIterations) {
      logger.info('LoopRunner: max iterations reached', { id: subagentId, iterations: active.iteration });
      this.stopOne(subagentId);
      return;
    }

    // Get fresh config in case it was updated
    const config = await this.subagentManager.get(subagentId);
    if (!config || config.status !== 'active') {
      logger.info('LoopRunner: subagent no longer active', { id: subagentId });
      this.stopOne(subagentId);
      return;
    }

    if (!this.executor) {
      logger.error('LoopRunner: no executor set');
      return;
    }

    const iteration = active.iteration;
    active.iteration++;

    try {
      // Load previous state
      const previousState = await this.redis.get(`${STATE_PREFIX}${subagentId}`) || undefined;

      const ctx: LoopContext = {
        iteration,
        config,
        previousState,
      };

      logger.info('LoopRunner: executing iteration', { id: subagentId, iteration });

      const { result, state } = await this.executor(ctx);

      // Save state for next iteration
      if (state) {
        await this.redis.set(`${STATE_PREFIX}${subagentId}`, state, 'EX', 7 * 86400); // 7 day TTL
      }

      // Record run
      await this.subagentManager.recordRun(subagentId, result);

      logger.info('LoopRunner: iteration complete', {
        id: subagentId,
        iteration,
        resultLength: result.length,
        hasState: !!state,
      });
    } catch (err: any) {
      logger.error('LoopRunner: iteration failed', {
        id: subagentId,
        iteration,
        error: err.message,
      });

      await this.subagentManager.recordRun(subagentId, `ERROR: ${err.message}`);
    }

    // Schedule next iteration (unless stopped or max reached)
    if (active.running && !this.stopping && active.iteration < active.maxIterations) {
      active.timer = setTimeout(() => this.runIteration(subagentId), active.intervalMs);
    }
  }

  /** Get loop state for a subagent */
  async getState(subagentId: string): Promise<string | null> {
    return this.redis.get(`${STATE_PREFIX}${subagentId}`);
  }

  /** Clear loop state for a subagent */
  async clearState(subagentId: string): Promise<void> {
    await this.redis.del(`${STATE_PREFIX}${subagentId}`);
  }
}
