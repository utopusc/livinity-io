/**
 * Redis-backed CRUD for MCP server configurations.
 * Publishes 'mcp_config' to 'liv:config:updated' on every change.
 */

import type Redis from 'ioredis';
import { logger } from './logger.js';
import type { McpConfig, McpServerConfig } from './mcp-types.js';

const CONFIG_KEY = 'liv:mcp:config';
const UPDATE_CHANNEL = 'liv:config:updated';

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

  /** Read the full MCP config from Redis */
  async getConfig(): Promise<McpConfig> {
    const raw = await this.redis.get(CONFIG_KEY);
    if (!raw) return { mcpServers: {} };
    try {
      const parsed = JSON.parse(raw);
      // Handle migration from old 'servers' key to 'mcpServers'
      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        return parsed as McpConfig;
      }
      if (parsed.servers && typeof parsed.servers === 'object') {
        logger.info('McpConfigManager: migrating config from servers to mcpServers');
        const migrated: McpConfig = { mcpServers: parsed.servers };
        await this.saveAndPublish(migrated);
        return migrated;
      }
      return { mcpServers: {} };
    } catch {
      logger.warn('McpConfigManager: invalid config JSON, resetting');
      return { mcpServers: {} };
    }
  }

  /** List all installed servers (name is always the config key) */
  async listServers(): Promise<McpServerConfig[]> {
    const config = await this.getConfig();
    return Object.entries(config.mcpServers).map(([key, val]) => ({ ...val, name: key }));
  }

  /** Install (add) a new MCP server */
  async installServer(server: McpServerConfig): Promise<void> {
    // Phase 100-10-13: allow `:` so per-WebApp Luse instances can register
// under `luse:webapp:<uuid>` (introduced in 100-08-04, broken by regex
// hardening before per-WebApp shipped). Backwards-compat for any pre-rename
// `bytebot:webapp:<uuid>` names (now cleaned by 100-10-09 anyway).
if (!/^[a-z0-9][a-z0-9_:-]*$/.test(server.name)) {
      throw new Error(`Invalid server name "${server.name}": must be lowercase alphanumeric with hyphens/underscores/colons`);
    }
    if (RESERVED_NAMES.has(server.name)) {
      throw new Error(
        `Server name "${server.name}" is reserved and would conflict with built-in tools. ` +
        `Reserved names: ${Array.from(RESERVED_NAMES).join(', ')}`,
      );
    }
    const config = await this.getConfig();
    if (config.mcpServers[server.name]) {
      throw new Error(`Server "${server.name}" is already installed`);
    }
    config.mcpServers[server.name] = server;
    await this.saveAndPublish(config);
    logger.info(`McpConfigManager: installed server "${server.name}"`);
  }

  /** Update fields on an existing server */
  async updateServer(name: string, updates: Partial<McpServerConfig>): Promise<McpServerConfig | null> {
    const config = await this.getConfig();
    const existing = config.mcpServers[name];
    if (!existing) return null;

    const updated = { ...existing, ...updates, name }; // name is immutable
    config.mcpServers[name] = updated;
    await this.saveAndPublish(config);
    logger.info(`McpConfigManager: updated server "${name}"`);
    return updated;
  }

  /** Remove a server */
  async removeServer(name: string): Promise<boolean> {
    const config = await this.getConfig();
    if (!config.mcpServers[name]) return false;

    delete config.mcpServers[name];
    await this.saveAndPublish(config);
    logger.info(`McpConfigManager: removed server "${name}"`);
    return true;
  }

  /** Get raw JSON config string */
  async getRawConfig(): Promise<string> {
    const raw = await this.redis.get(CONFIG_KEY);
    return raw || JSON.stringify({ mcpServers: {} }, null, 2);
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
      // Phase 100-10-13: allow `:` for per-WebApp Luse naming `luse:webapp:<uuid>`.
if (!/^[a-z0-9][a-z0-9_:-]*$/.test(name)) {
        throw new Error(`Invalid server name "${name}": must be lowercase alphanumeric with hyphens/underscores/colons`);
      }
      if (RESERVED_NAMES.has(name)) {
        throw new Error(`Server name "${name}" is reserved and would conflict with built-in tools`);
      }
    }
    await this.saveAndPublish(parsed);
    logger.info('McpConfigManager: raw config updated');
  }

  private async saveAndPublish(config: McpConfig): Promise<void> {
    // Phase 211.1 — defensive dual-writer collision guard.
    //
    // The livinityd tRPC `mcp-config-router.ts` stores this same key
    // (`liv:mcp:config`) as a Redis HASH (HSET/HGETALL primitives), while
    // McpConfigManager here stores it as a STRING (SET/GET, JSON-stringified).
    // Writing to a HASH key with SET would Redis-WRONGTYPE-error. The two
    // writers existed in parallel because no production deploy has actually
    // written through both paths yet (live `TYPE liv:mcp:config` returned
    // `none` on Mini PC 2026-05-26) — but the moment one writes, the other
    // crashes. Defensive: type-check before SET. Full unification (pick a
    // single primitive across both writers + migrate UI calls + delete the
    // loser) is filed as CARRY-P211-UNIFY in `.planning/phases/211-*`.
    try {
      const t = await this.redis.type(CONFIG_KEY);
      if (t !== 'none' && t !== 'string') {
        logger.error(
          `McpConfigManager: refusing to SET ${CONFIG_KEY} — existing Redis type is "${t}" ` +
            `(expected "string" or "none"). Another writer (likely livinityd ` +
            `mcp-config-router.ts) owns this key with a different primitive. ` +
            `See CARRY-P211-UNIFY in .planning/phases/211-*/211-CONTEXT.md.`,
        );
        return;
      }
    } catch (err) {
      // ioredis may throw on type errors in unusual states; do not block the
      // write entirely (older behavior). Log and proceed.
      logger.warn(`McpConfigManager: TYPE check failed for ${CONFIG_KEY}`, err);
    }
    await this.redis.set(CONFIG_KEY, JSON.stringify(config));
    // Phase 211.1 — also publish on the channel livinityd's `mcp-bridge`
    // subscribes to (`liv:mcp:updated`). Without this cross-publish, any
    // McpConfigManager mutation would update Redis but never trigger the
    // agent runtime's live-reload (subscribed at mcp-bridge.ts:545).
    await this.redis.publish(UPDATE_CHANNEL, 'mcp_config');
    try {
      await this.redis.publish(
        'liv:mcp:updated',
        JSON.stringify({op: 'set', name: 'config', ts: new Date().toISOString()}),
      );
    } catch (err) {
      logger.warn('McpConfigManager: cross-publish to liv:mcp:updated failed', err);
    }
  }
}
