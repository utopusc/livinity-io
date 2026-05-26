/**
 * Redis-backed CRUD for MCP server configurations.
 *
 * Phase 218 T6 — canonical Redis HASH primitive everywhere. Previously this
 * file used STRING (SET / GET) while livinityd's `mcp-config-router.ts` used
 * HASH (HSET / HGETALL / HDEL) on the same `liv:mcp:config` key, producing
 * a WRONGTYPE crash whenever the operator deleted-and-re-added an MCP server
 * (HDEL'ing the last field auto-deletes the HASH; the next McpConfigManager
 * SET would create a STRING; the next UI add would HSET → WRONGTYPE). T6
 * makes both writers use HASH so the collision can't recur, AND adds a
 * defensive STRING→HASH inline migration on first read so existing boxes
 * with a STRING value left over from pre-T6 code self-heal on next boot.
 *
 * Publishes 'mcp_config' to 'liv:config:updated' (legacy channel) AND a
 * structured envelope to 'liv:mcp:updated' (mcp-bridge's reconcile signal).
 */

import type Redis from 'ioredis';
import { logger } from './logger.js';
import type { McpConfig, McpServerConfig } from './mcp-types.js';

const CONFIG_KEY = 'liv:mcp:config';
const UPDATE_CHANNEL = 'liv:config:updated';
const MCP_UPDATED_CHANNEL = 'liv:mcp:updated';

/** Reserved names that would conflict with built-in tool prefixes */
const RESERVED_NAMES = new Set([
  'registry', 'install', 'list', 'manage', 'config',
  'status', 'shell', 'logs', 'docker', 'pm2', 'sysinfo',
  'files', 'scrape', 'memory', 'web', 'cron', 'agent',
]);

/** Regex pattern for sensitive env var keys */
const SENSITIVE_KEY_PATTERN = /key|secret|token|password|credential|auth/i;

export class McpConfigManager {
  constructor(private redis: Redis) {}

  /**
   * Phase 218 T6 — coerce a stale STRING value at `liv:mcp:config` into the
   * canonical HASH primitive. No-op on every type other than 'string'. Safe
   * to call from every read (TYPE is cheap; only the STRING branch does
   * any work).
   */
  private async ensureHashPrimitive(): Promise<void> {
    let type: string;
    try {
      type = await this.redis.type(CONFIG_KEY);
    } catch (err) {
      logger.warn(`McpConfigManager: TYPE check failed for ${CONFIG_KEY}`, err);
      return;
    }
    if (type !== 'string') return;

    try {
      const raw = await this.redis.get(CONFIG_KEY);
      if (!raw) {
        await this.redis.del(CONFIG_KEY);
        logger.info(`McpConfigManager: cleared empty STRING ${CONFIG_KEY}`);
        return;
      }
      const parsed = JSON.parse(raw) as Partial<McpConfig> & { servers?: Record<string, McpServerConfig> };
      const servers = (parsed.mcpServers && typeof parsed.mcpServers === 'object')
        ? parsed.mcpServers
        : (parsed.servers && typeof parsed.servers === 'object')
          ? parsed.servers
          : {};
      await this.redis.del(CONFIG_KEY);
      const names = Object.keys(servers);
      for (const name of names) {
        const val = servers[name];
        if (!val || typeof val !== 'object') continue;
        await this.redis.hset(CONFIG_KEY, name, JSON.stringify(val));
      }
      logger.info(`McpConfigManager: migrated ${CONFIG_KEY} STRING → HASH (${names.length} servers)`);
    } catch (err) {
      logger.error(`McpConfigManager: STRING→HASH migration failed for ${CONFIG_KEY}, deleting key to recover`, err);
      try {
        await this.redis.del(CONFIG_KEY);
      } catch {
        /* swallow — we've already logged */
      }
    }
  }

  /** Read the full MCP config from Redis (HGETALL) */
  async getConfig(): Promise<McpConfig> {
    await this.ensureHashPrimitive();
    let hash: Record<string, string>;
    try {
      hash = await this.redis.hgetall(CONFIG_KEY);
    } catch (err) {
      logger.warn(`McpConfigManager: HGETALL failed for ${CONFIG_KEY}`, err);
      return { mcpServers: {} };
    }
    const servers: Record<string, McpServerConfig> = {};
    for (const [name, raw] of Object.entries(hash ?? {})) {
      try {
        servers[name] = JSON.parse(raw) as McpServerConfig;
      } catch (err) {
        logger.warn(`McpConfigManager: invalid HASH entry for "${name}", skipping`, err);
      }
    }
    return { mcpServers: servers };
  }

  /** List all installed servers (name is always the config key) */
  async listServers(): Promise<McpServerConfig[]> {
    const config = await this.getConfig();
    return Object.entries(config.mcpServers).map(([key, val]) => ({ ...val, name: key }));
  }

  /** Install (add) a new MCP server */
  async installServer(server: McpServerConfig): Promise<void> {
    // Phase 100-10-13: allow `:` so per-WebApp Luse instances can register
    // under `luse:webapp:<uuid>`.
    if (!/^[a-z0-9][a-z0-9_:-]*$/.test(server.name)) {
      throw new Error(`Invalid server name "${server.name}": must be lowercase alphanumeric with hyphens/underscores/colons`);
    }
    if (RESERVED_NAMES.has(server.name)) {
      throw new Error(
        `Server name "${server.name}" is reserved and would conflict with built-in tools. ` +
        `Reserved names: ${Array.from(RESERVED_NAMES).join(', ')}`,
      );
    }
    await this.ensureHashPrimitive();
    const existing = await this.redis.hget(CONFIG_KEY, server.name);
    if (existing !== null && existing !== undefined) {
      throw new Error(`Server "${server.name}" is already installed`);
    }
    await this.redis.hset(CONFIG_KEY, server.name, JSON.stringify(server));
    await this.publishUpdate('set', server.name);
    logger.info(`McpConfigManager: installed server "${server.name}"`);
  }

  /** Update fields on an existing server */
  async updateServer(name: string, updates: Partial<McpServerConfig>): Promise<McpServerConfig | null> {
    await this.ensureHashPrimitive();
    const raw = await this.redis.hget(CONFIG_KEY, name);
    if (raw === null || raw === undefined) return null;
    let existing: McpServerConfig;
    try {
      existing = JSON.parse(raw) as McpServerConfig;
    } catch {
      return null;
    }
    const updated = { ...existing, ...updates, name }; // name is immutable
    await this.redis.hset(CONFIG_KEY, name, JSON.stringify(updated));
    await this.publishUpdate('set', name);
    logger.info(`McpConfigManager: updated server "${name}"`);
    return updated;
  }

  /** Remove a server */
  async removeServer(name: string): Promise<boolean> {
    await this.ensureHashPrimitive();
    const existed = await this.redis.hget(CONFIG_KEY, name);
    if (existed === null || existed === undefined) return false;
    await this.redis.hdel(CONFIG_KEY, name);
    await this.publishUpdate('delete', name);
    logger.info(`McpConfigManager: removed server "${name}"`);
    return true;
  }

  /** Get raw JSON config string (derived from current HASH state) */
  async getRawConfig(): Promise<string> {
    const config = await this.getConfig();
    return JSON.stringify(config, null, 2);
  }

  /** Get raw JSON config with env values masked for safe display */
  async getSafeConfig(): Promise<string> {
    const config = await this.getConfig();
    const safe = JSON.parse(JSON.stringify(config)) as McpConfig;

    for (const server of Object.values(safe.mcpServers)) {
      if (server.env) {
        for (const key of Object.keys(server.env)) {
          if (SENSITIVE_KEY_PATTERN.test(key)) {
            const val = server.env[key];
            server.env[key] = val.length > 8
              ? val.slice(0, 4) + '****' + val.slice(-4)
              : '****';
          }
        }
      }
      if (server.headers) {
        for (const key of Object.keys(server.headers)) {
          if (SENSITIVE_KEY_PATTERN.test(key)) {
            const val = server.headers[key];
            server.headers[key] = val.length > 8
              ? val.slice(0, 4) + '****' + val.slice(-4)
              : '****';
          }
        }
      }
    }

    return JSON.stringify(safe, null, 2);
  }

  /** Set raw JSON config (validates before saving) */
  async setRawConfig(json: string): Promise<void> {
    const parsed = JSON.parse(json) as McpConfig; // throws if invalid JSON
    if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
      throw new Error('Config must have a "mcpServers" object');
    }
    // Validate all server names
    for (const name of Object.keys(parsed.mcpServers)) {
      if (!/^[a-z0-9][a-z0-9_:-]*$/.test(name)) {
        throw new Error(`Invalid server name "${name}": must be lowercase alphanumeric with hyphens/underscores/colons`);
      }
      if (RESERVED_NAMES.has(name)) {
        throw new Error(`Server name "${name}" is reserved and would conflict with built-in tools`);
      }
    }
    await this.ensureHashPrimitive();
    // Replace-all semantics: DEL then HSET each entry. Brief window where
    // the hash is empty — acceptable because setRawConfig is an admin bulk
    // edit, not a hot path. A pipeline keeps the round-trip cost flat.
    const pipeline = this.redis.multi();
    pipeline.del(CONFIG_KEY);
    for (const [name, server] of Object.entries(parsed.mcpServers)) {
      pipeline.hset(CONFIG_KEY, name, JSON.stringify(server));
    }
    await pipeline.exec();
    await this.publishUpdate('set', 'config');
    logger.info(`McpConfigManager: raw config updated (${Object.keys(parsed.mcpServers).length} servers)`);
  }

  /**
   * Phase 218 T6 — emit BOTH the legacy `liv:config:updated` channel
   * (subscribed by liv-core's daemon for the lifecycle 'mcp_config' tag)
   * AND the structured `liv:mcp:updated` envelope (subscribed by livinityd's
   * mcp-bridge for per-entry reconciliation). Best-effort — a Redis-side
   * publish failure logs and continues; the HASH write already succeeded.
   */
  private async publishUpdate(op: 'set' | 'delete', name: string): Promise<void> {
    try {
      await this.redis.publish(UPDATE_CHANNEL, 'mcp_config');
    } catch (err) {
      logger.warn(`McpConfigManager: publish to ${UPDATE_CHANNEL} failed`, err);
    }
    try {
      await this.redis.publish(
        MCP_UPDATED_CHANNEL,
        JSON.stringify({ op, name, ts: new Date().toISOString() }),
      );
    } catch (err) {
      logger.warn(`McpConfigManager: publish to ${MCP_UPDATED_CHANNEL} failed`, err);
    }
  }
}
