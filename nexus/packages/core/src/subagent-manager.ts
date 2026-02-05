import { logger } from './logger.js';
import type Redis from 'ioredis';

/** Persistent subagent configuration stored in Redis */
export interface SubagentConfig {
  id: string;
  name: string;
  description: string;
  /** Skill names or '*' for all */
  skills: string[];
  /** Custom system prompt override */
  systemPrompt?: string;
  /** Cron expression (e.g. '0 9 * * MON-FRI') */
  schedule?: string;
  /** Timezone for schedule (IANA, e.g. 'Europe/Istanbul') */
  timezone?: string;
  /** Task to execute on schedule trigger */
  scheduledTask?: string;
  /** Loop config — if set, subagent runs in a loop */
  loop?: {
    intervalMs: number;
    maxIterations?: number;
    /** Task to execute each iteration */
    task: string;
  };
  /** Model tier */
  tier: 'flash' | 'sonnet' | 'opus';
  /** Max turns per execution */
  maxTurns: number;
  /** Status */
  status: 'active' | 'paused' | 'stopped';
  /** Creator (WhatsApp JID or 'system') */
  createdBy: string;
  createdAt: number;
  lastRunAt?: number;
  lastResult?: string;
  /** Total runs count */
  runCount: number;
}

export interface SubagentMessage {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
}

const PREFIX = 'nexus:subagent:';
const HISTORY_PREFIX = 'nexus:subagent_history:';
const INDEX_KEY = 'nexus:subagents';

export class SubagentManager {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /** Create a new subagent */
  async create(config: Omit<SubagentConfig, 'createdAt' | 'runCount'>): Promise<SubagentConfig> {
    const existing = await this.redis.hget(INDEX_KEY, config.id);
    if (existing) {
      throw new Error(`Subagent "${config.id}" already exists`);
    }

    const full: SubagentConfig = {
      ...config,
      createdAt: Date.now(),
      runCount: 0,
    };

    await this.redis.set(`${PREFIX}${config.id}`, JSON.stringify(full));
    await this.redis.hset(INDEX_KEY, config.id, config.name);

    logger.info('SubagentManager: created', { id: config.id, name: config.name });
    return full;
  }

  /** Get a subagent by ID */
  async get(id: string): Promise<SubagentConfig | null> {
    const raw = await this.redis.get(`${PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  /** List all subagents (summary) */
  async list(): Promise<Array<{ id: string; name: string; status: string; schedule?: string; lastRunAt?: number; runCount: number }>> {
    const index = await this.redis.hgetall(INDEX_KEY);
    const results: Array<{ id: string; name: string; status: string; schedule?: string; lastRunAt?: number; runCount: number }> = [];

    for (const id of Object.keys(index)) {
      const config = await this.get(id);
      if (config) {
        results.push({
          id: config.id,
          name: config.name,
          status: config.status,
          schedule: config.schedule,
          lastRunAt: config.lastRunAt,
          runCount: config.runCount,
        });
      }
    }

    return results;
  }

  /** Update a subagent */
  async update(id: string, updates: Partial<SubagentConfig>): Promise<SubagentConfig | null> {
    const current = await this.get(id);
    if (!current) return null;

    const updated = { ...current, ...updates, id: current.id };
    await this.redis.set(`${PREFIX}${id}`, JSON.stringify(updated));

    if (updates.name) {
      await this.redis.hset(INDEX_KEY, id, updates.name);
    }

    logger.info('SubagentManager: updated', { id, updates: Object.keys(updates) });
    return updated;
  }

  /** Record a run completion */
  async recordRun(id: string, result: string): Promise<void> {
    const config = await this.get(id);
    if (!config) return;

    config.lastRunAt = Date.now();
    config.lastResult = result.slice(0, 2000);
    config.runCount++;

    await this.redis.set(`${PREFIX}${id}`, JSON.stringify(config));
  }

  /** Delete a subagent */
  async delete(id: string): Promise<boolean> {
    const exists = await this.redis.exists(`${PREFIX}${id}`);
    if (!exists) return false;

    await this.redis.del(`${PREFIX}${id}`);
    await this.redis.hdel(INDEX_KEY, id);
    await this.redis.del(`${HISTORY_PREFIX}${id}`);

    logger.info('SubagentManager: deleted', { id });
    return true;
  }

  /** Add a message to subagent conversation history */
  async addMessage(id: string, message: SubagentMessage): Promise<void> {
    const key = `${HISTORY_PREFIX}${id}`;
    await this.redis.lpush(key, JSON.stringify(message));
    await this.redis.ltrim(key, 0, 99); // Keep last 100 messages
    await this.redis.expire(key, 7 * 86400); // 7 day TTL
  }

  /** Get subagent conversation history */
  async getHistory(id: string, limit = 20): Promise<SubagentMessage[]> {
    const key = `${HISTORY_PREFIX}${id}`;
    const items = await this.redis.lrange(key, 0, limit - 1);
    return items.map((item) => JSON.parse(item)).reverse(); // oldest first
  }

  /** Format conversation history as context string */
  async getHistoryContext(id: string, limit = 10): Promise<string> {
    const messages = await this.getHistory(id, limit);
    if (messages.length === 0) return '';

    return messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Subagent'}: ${m.text}`)
      .join('\n');
  }

  /** Get all active subagents with schedules */
  async getScheduledAgents(): Promise<SubagentConfig[]> {
    const index = await this.redis.hgetall(INDEX_KEY);
    const scheduled: SubagentConfig[] = [];

    for (const id of Object.keys(index)) {
      const config = await this.get(id);
      if (config && config.status === 'active' && config.schedule) {
        scheduled.push(config);
      }
    }

    return scheduled;
  }

  /** Get all active subagents with loop configs */
  async getLoopAgents(): Promise<SubagentConfig[]> {
    const index = await this.redis.hgetall(INDEX_KEY);
    const loopAgents: SubagentConfig[] = [];

    for (const id of Object.keys(index)) {
      const config = await this.get(id);
      if (config && config.status === 'active' && config.loop) {
        loopAgents.push(config);
      }
    }

    return loopAgents;
  }
}
