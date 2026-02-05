/**
 * Redis-backed CRUD for MCP server configurations.
 * Publishes 'mcp_config' to 'nexus:config:updated' on every change.
 */

import type Redis from 'ioredis';
import { logger } from './logger.js';
import type { McpConfig, McpServerConfig } from './mcp-types.js';

const CONFIG_KEY = 'nexus:mcp:config';
const UPDATE_CHANNEL = 'nexus:config:updated';

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
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(server.name)) {
      throw new Error(`Invalid server name "${server.name}": must be lowercase alphanumeric with hyphens/underscores`);
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
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
        throw new Error(`Invalid server name "${name}": must be lowercase alphanumeric with hyphens/underscores`);
      }
      if (RESERVED_NAMES.has(name)) {
        throw new Error(`Server name "${name}" is reserved and would conflict with built-in tools`);
      }
    }
    await this.saveAndPublish(parsed);
    logger.info('McpConfigManager: raw config updated');
  }

  private async saveAndPublish(config: McpConfig): Promise<void> {
    await this.redis.set(CONFIG_KEY, JSON.stringify(config));
    await this.redis.publish(UPDATE_CHANNEL, 'mcp_config');
  }
}
