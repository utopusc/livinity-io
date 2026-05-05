import { logger } from './logger.js';
import type Redis from 'ioredis';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Persistent subagent configuration stored in Redis */
export interface SubagentConfig {
  id: string;
  name: string;
  description: string;
  /** Tool names to give this agent access to, or ['*'] for all tools */
  tools: string[];
  /** @deprecated Use 'tools' instead. Kept for backward compat with existing Redis data. */
  skills?: string[];
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
  tier: 'haiku' | 'sonnet' | 'opus';
  /** Max turns per execution */
  maxTurns: number;
  /** Status */
  status: 'active' | 'paused' | 'stopped';
  /** Creator (WhatsApp JID or 'system') */
  createdBy: string;
  /** Source channel that created this subagent */
  createdVia?: 'whatsapp' | 'telegram' | 'discord' | 'slack' | 'matrix' | 'web' | 'mcp';
  /** Chat ID for the source channel (for routing results back) */
  createdChatId?: string;
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

const PREFIX = 'liv:subagent:';
const HISTORY_PREFIX = 'liv:subagent_history:';
const INDEX_KEY = 'liv:subagents';

export class SubagentManager {
  private redis: Redis;
  private dataDir: string;

  constructor(redis: Redis, dataDir?: string) {
    this.redis = redis;
    this.dataDir = dataDir || join(process.env.LIV_DATA_DIR || process.env.DATA_DIR || '/opt/nexus/data', 'agents');
  }

  /** Get workspace path for an agent */
  getWorkspacePath(agentId: string): string {
    return join(this.dataDir, agentId);
  }

  /** Ensure agent workspace directories exist */
  private async ensureWorkspace(agentId: string): Promise<string> {
    const base = this.getWorkspacePath(agentId);
    await mkdir(join(base, 'history'), { recursive: true });
    await mkdir(join(base, 'findings'), { recursive: true });
    await mkdir(join(base, 'memory'), { recursive: true });
    return base;
  }

  /** Save data to agent workspace */
  async saveData(agentId: string, key: string, data: unknown): Promise<void> {
    const base = await this.ensureWorkspace(agentId);
    const safeName = key.replace(/[^a-z0-9_-]/gi, '-');
    const filePath = join(base, 'findings', `${safeName}.json`);
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info('SubagentManager: saved data', { agentId, key });
  }

  /** Load data from agent workspace */
  async loadData(agentId: string, key: string): Promise<unknown | null> {
    const safeName = key.replace(/[^a-z0-9_-]/gi, '-');
    const filePath = join(this.getWorkspacePath(agentId), 'findings', `${safeName}.json`);
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** Update agent state in workspace */
  async updateState(agentId: string, state: Record<string, unknown>): Promise<void> {
    const base = await this.ensureWorkspace(agentId);
    const filePath = join(base, 'state.json');
    let current: Record<string, unknown> = {};
    try {
      const raw = await readFile(filePath, 'utf-8');
      current = JSON.parse(raw);
    } catch { /* first write */ }
    const merged = { ...current, ...state, updatedAt: new Date().toISOString() };
    await writeFile(filePath, JSON.stringify(merged, null, 2), 'utf-8');
  }

  /** Get agent state from workspace */
  async getState(agentId: string): Promise<Record<string, unknown> | null> {
    const filePath = join(this.getWorkspacePath(agentId), 'state.json');
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** List saved findings keys */
  async listFindings(agentId: string): Promise<string[]> {
    const dir = join(this.getWorkspacePath(agentId), 'findings');
    try {
      const files = await readdir(dir);
      return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    } catch {
      return [];
    }
  }

  /** Save a run record to workspace history */
  async saveRunHistory(agentId: string, input: string, output: string): Promise<void> {
    const base = await this.ensureWorkspace(agentId);
    const date = new Date().toISOString().slice(0, 10);
    const files = await readdir(join(base, 'history')).catch(() => []);
    const todayRuns = files.filter(f => f.startsWith(date)).length;
    const fileName = `${date}-${String(todayRuns + 1).padStart(3, '0')}.json`;
    await writeFile(join(base, 'history', fileName), JSON.stringify({
      timestamp: new Date().toISOString(),
      input: input.slice(0, 5000),
      output: output.slice(0, 10000),
    }, null, 2), 'utf-8');
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

    // Create workspace directory
    await this.ensureWorkspace(config.id);

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
  async list(): Promise<Array<{ id: string; name: string; status: string; description?: string; tier?: string; schedule?: string; lastRunAt?: number; runCount: number }>> {
    const index = await this.redis.hgetall(INDEX_KEY);
    const results: Array<{ id: string; name: string; status: string; description?: string; tier?: string; schedule?: string; lastRunAt?: number; runCount: number }> = [];

    for (const id of Object.keys(index)) {
      const config = await this.get(id);
      if (config) {
        results.push({
          id: config.id,
          name: config.name,
          status: config.status,
          description: config.description,
          tier: config.tier,
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

  /** Record a run completion (atomic via Lua script) */
  async recordRun(id: string, result: string): Promise<void> {
    const key = `${PREFIX}${id}`;
    const now = Date.now();
    const truncatedResult = result.slice(0, 2000);

    // Atomic read-modify-write via Lua to prevent race conditions
    const luaScript = `
      local raw = redis.call('GET', KEYS[1])
      if not raw then return 0 end
      local config = cjson.decode(raw)
      config.lastRunAt = tonumber(ARGV[1])
      config.lastResult = ARGV[2]
      config.runCount = (config.runCount or 0) + 1
      redis.call('SET', KEYS[1], cjson.encode(config))
      return 1
    `;
    await this.redis.eval(luaScript, 1, key, now.toString(), truncatedResult);
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
