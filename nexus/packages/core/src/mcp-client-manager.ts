/**
 * MCP Client Manager — connects to external MCP servers, discovers tools,
 * and registers them in the ToolRegistry.
 *
 * Lifecycle:
 * 1. On start(): subscribes to config changes, then connects to all enabled servers
 * 2. For stdio: spawns child process via StdioClientTransport (command allowlist enforced)
 * 3. For streamableHttp: connects via StreamableHTTPClientTransport (SSRF protection)
 * 4. Discovers tools via client.listTools()
 * 5. Registers each tool in ToolRegistry as mcp_{serverName}_{toolName}
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type Redis from 'ioredis';
import { logger } from './logger.js';
import type { ToolRegistry } from './tool-registry.js';
import type { McpConfigManager } from './mcp-config-manager.js';
import type { McpServerConfig, McpServerStatus } from './mcp-types.js';

const STATUS_KEY_PREFIX = 'nexus:mcp:status:';
const STATUS_TTL = 3600; // 1 hour
const UPDATE_CHANNEL = 'nexus:config:updated';
const CONNECT_TIMEOUT_MS = 30_000; // 30 seconds
const RECONNECT_DELAY_MS = 5_000; // 5 seconds before reconnect attempt
const MAX_RECONNECT_ATTEMPTS = 3;

/** Only these commands are allowed for stdio transport */
const ALLOWED_COMMANDS = new Set([
  'npx', 'node', 'python', 'python3', 'uvx', 'docker', 'deno', 'bun',
]);

/** Block internal/private IPs for streamableHttp transport */
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^\[::1\]$/,
  /^169\.254\./,
  /^::1$/,
];

interface ManagedServer {
  config: McpServerConfig;
  client: Client;
  transport: StdioClientTransport | StreamableHTTPClientTransport;
  tools: string[]; // tool names registered in ToolRegistry
  connectedAt: number;
  reconnectAttempts: number;
}

export class McpClientManager {
  private servers = new Map<string, ManagedServer>();
  private subscriber: Redis | null = null;
  private stopped = false;
  private reconciling = false;
  private reconcilePending = false;

  constructor(
    private redis: Redis,
    private toolRegistry: ToolRegistry,
    private configManager: McpConfigManager,
  ) {}

  /** Start the client manager: subscribe to changes first, then connect to all enabled servers */
  async start(): Promise<void> {
    this.stopped = false;
    logger.info('McpClientManager: starting');

    // Subscribe to config changes BEFORE initial reconcile to avoid race condition
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe(UPDATE_CHANNEL);
    this.subscriber.on('message', async (channel, message) => {
      if (channel === UPDATE_CHANNEL && message === 'mcp_config') {
        logger.info('McpClientManager: config change detected, reconciling');
        if (this.reconciling) {
          this.reconcilePending = true;
          return;
        }
        this.reconciling = true;
        try {
          await this.reconcile();
          while (this.reconcilePending) {
            this.reconcilePending = false;
            await this.reconcile();
          }
        } catch (err) {
          logger.error('McpClientManager: reconcile error', { error: (err as Error).message });
        } finally {
          this.reconciling = false;
        }
      }
    });

    // Now connect to all enabled servers
    await this.reconcile();

    logger.info('McpClientManager: started, subscribed to config updates');
  }

  /** Stop all servers and unsubscribe */
  async stop(): Promise<void> {
    this.stopped = true;
    logger.info('McpClientManager: stopping');

    if (this.subscriber) {
      await this.subscriber.unsubscribe(UPDATE_CHANNEL).catch(() => {});
      await this.subscriber.quit().catch(() => {});
      this.subscriber = null;
    }

    const names = Array.from(this.servers.keys());
    for (const name of names) {
      await this.disconnectServer(name);
    }

    logger.info('McpClientManager: stopped');
  }

  /** Reconcile running servers with config — connect new, disconnect removed, restart changed */
  async reconcile(): Promise<void> {
    const config = await this.configManager.getConfig();
    const desired = new Set<string>();

    // Connect / reconnect enabled servers
    for (const [key, serverConfig] of Object.entries(config.mcpServers)) {
      if (!serverConfig.enabled) continue;
      desired.add(key);

      // Normalize: ensure config.name always matches the config key
      const normalizedConfig = { ...serverConfig, name: key };
      const existing = this.servers.get(key);
      if (existing) {
        // Check if config changed (simple JSON comparison)
        if (JSON.stringify(existing.config) !== JSON.stringify(normalizedConfig)) {
          logger.info(`McpClientManager: config changed for "${key}", reconnecting`);
          await this.disconnectServer(key);
          await this.connectServer(normalizedConfig);
        }
      } else {
        await this.connectServer(normalizedConfig);
      }
    }

    // Disconnect servers no longer in config or disabled
    // Copy keys to array to avoid mutation during iteration
    const currentNames = Array.from(this.servers.keys());
    for (const name of currentNames) {
      if (!desired.has(name)) {
        logger.info(`McpClientManager: removing server "${name}" (no longer enabled)`);
        await this.disconnectServer(name);
      }
    }
  }

  /** Restart a specific server by name */
  async restartServer(name: string): Promise<void> {
    const config = await this.configManager.getConfig();
    const serverConfig = config.mcpServers[name];
    if (!serverConfig) throw new Error(`Server "${name}" not found in config`);

    await this.disconnectServer(name);
    if (serverConfig.enabled) {
      await this.connectServer({ ...serverConfig, name });
    }
  }

  /** Get status for a specific server */
  async getStatus(name: string): Promise<McpServerStatus> {
    // Try live status first
    const managed = this.servers.get(name);
    if (managed) {
      return {
        running: true,
        tools: managed.tools,
        connectedAt: managed.connectedAt,
      };
    }

    // Fall back to Redis status
    const raw = await this.redis.get(`${STATUS_KEY_PREFIX}${name}`);
    if (raw) {
      try {
        return JSON.parse(raw) as McpServerStatus;
      } catch { /* fall through */ }
    }

    return { running: false, tools: [] };
  }

  /** Get status for all configured servers */
  async getAllStatuses(): Promise<Record<string, McpServerStatus>> {
    const config = await this.configManager.getConfig();
    const result: Record<string, McpServerStatus> = {};

    for (const name of Object.keys(config.mcpServers)) {
      result[name] = await this.getStatus(name);
    }

    return result;
  }

  /** Validate that a stdio command is in the allowlist */
  private validateCommand(command: string): void {
    const base = command.split('/').pop() || command; // handle full paths like /usr/bin/node
    if (!ALLOWED_COMMANDS.has(base)) {
      throw new Error(
        `Command "${command}" is not allowed. Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(', ')}`,
      );
    }
  }

  /** Validate that a streamableHttp URL doesn't point to internal resources */
  private validateUrl(urlStr: string): void {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      throw new Error(`Invalid URL: ${urlStr}`);
    }

    // Only allow http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`URL protocol must be http or https, got: ${parsed.protocol}`);
    }

    const hostname = parsed.hostname;
    for (const pattern of BLOCKED_HOST_PATTERNS) {
      if (pattern.test(hostname)) {
        throw new Error(`URL hostname "${hostname}" is blocked (internal/private address)`);
      }
    }
  }

  private async connectServer(config: McpServerConfig, reconnectAttempt = 0): Promise<void> {
    if (this.stopped) return;
    const { name } = config;

    try {
      logger.info(`McpClientManager: connecting to "${name}" (${config.transport})${reconnectAttempt > 0 ? ` [reconnect #${reconnectAttempt}]` : ''}`);

      let transport: StdioClientTransport | StreamableHTTPClientTransport;

      if (config.transport === 'stdio') {
        if (!config.command) throw new Error('stdio transport requires "command"');

        // Validate command against allowlist
        this.validateCommand(config.command);

        // Build safe env: user env first, then system vars (system takes precedence)
        const userEnv = config.env || {};
        const safeEnv: Record<string, string> = {
          ...userEnv,
          PATH: process.env.PATH || '',
          HOME: process.env.HOME || '',
          NODE_ENV: process.env.NODE_ENV || 'production',
        };
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: safeEnv,
        });
      } else if (config.transport === 'streamableHttp') {
        if (!config.url) throw new Error('streamableHttp transport requires "url"');

        // Validate URL to prevent SSRF
        this.validateUrl(config.url);

        transport = new StreamableHTTPClientTransport(
          new URL(config.url),
          { requestInit: { headers: config.headers || {} } },
        );
      } else {
        throw new Error(`Unknown transport: ${config.transport}`);
      }

      const client = new Client(
        { name: `nexus-mcp-${name}`, version: '1.0.0' },
        { capabilities: {} },
      );

      // Connect with timeout (clean up timer to avoid leaks)
      const timeoutId = setTimeout(() => {}, 0); // placeholder
      clearTimeout(timeoutId);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Connection timeout after ${CONNECT_TIMEOUT_MS}ms`)),
          CONNECT_TIMEOUT_MS,
        );
        client.connect(transport).then(() => {
          clearTimeout(timer);
          resolve();
        }).catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      // Discover tools
      const toolsResult = await client.listTools();
      const registeredTools: string[] = [];

      for (const mcpTool of toolsResult.tools) {
        const toolName = `mcp_${name}_${mcpTool.name}`;
        const inputSchema = mcpTool.inputSchema || { type: 'object', properties: {} };

        this.toolRegistry.register({
          name: toolName,
          description: `[MCP:${name}] ${mcpTool.description || mcpTool.name}`,
          parameters: this.schemaToParameters(inputSchema),
          execute: async (params) => {
            try {
              const result = await client.callTool({
                name: mcpTool.name,
                arguments: params,
              });
              const textParts: string[] = [];
              const images: Array<{ base64: string; mimeType: string }> = [];

              if (Array.isArray(result.content)) {
                for (const c of result.content as any[]) {
                  if (c.type === 'image' && c.data) {
                    images.push({ base64: c.data, mimeType: c.mimeType || 'image/png' });
                  } else if (c.text) {
                    textParts.push(c.text);
                  } else {
                    textParts.push(JSON.stringify(c));
                  }
                }
              } else {
                textParts.push(String(result.content));
              }

              const output = textParts.join('\n');
              return {
                success: !result.isError,
                output,
                error: result.isError ? output : undefined,
                images: images.length > 0 ? images : undefined,
              };
            } catch (err: any) {
              return { success: false, output: '', error: `MCP tool error: ${err.message}` };
            }
          },
        });

        registeredTools.push(toolName);
      }

      const connectedAt = Date.now();
      this.servers.set(name, { config, client, transport, tools: registeredTools, connectedAt, reconnectAttempts: reconnectAttempt });

      // Set up close handler for auto-reconnection
      client.onclose = () => {
        if (this.stopped) return;
        const managed = this.servers.get(name);
        if (!managed) return;

        logger.warn(`McpClientManager: "${name}" connection closed unexpectedly`);

        // Clean up the dead connection
        for (const toolName of managed.tools) {
          this.toolRegistry.unregister(toolName);
        }
        this.servers.delete(name);

        // Auto-reconnect if under limit
        const attempt = managed.reconnectAttempts + 1;
        if (attempt <= MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_DELAY_MS * attempt;
          logger.info(`McpClientManager: reconnecting "${name}" in ${delay}ms (attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS})`);
          setTimeout(async () => {
            if (this.stopped) return;
            try {
              await this.connectServer(config, attempt);
            } catch (err: any) {
              logger.error(`McpClientManager: reconnect failed for "${name}"`, { error: err.message });
            }
          }, delay);
        } else {
          logger.error(`McpClientManager: "${name}" max reconnect attempts reached`);
        }
      };

      // Write status to Redis
      const status: McpServerStatus = {
        running: true,
        tools: registeredTools,
        connectedAt,
      };
      await this.redis.set(
        `${STATUS_KEY_PREFIX}${name}`,
        JSON.stringify(status),
        'EX',
        STATUS_TTL,
      );

      logger.info(`McpClientManager: connected to "${name}", ${registeredTools.length} tools registered`);
    } catch (err: any) {
      logger.error(`McpClientManager: failed to connect to "${name}"`, { error: err.message });

      // Write error status to Redis
      const status: McpServerStatus = {
        running: false,
        tools: [],
        lastError: err.message,
      };
      await this.redis.set(
        `${STATUS_KEY_PREFIX}${name}`,
        JSON.stringify(status),
        'EX',
        STATUS_TTL,
      ).catch(() => {});
    }
  }

  private async disconnectServer(name: string): Promise<void> {
    const managed = this.servers.get(name);
    if (!managed) return;

    // Clear close handler to prevent auto-reconnect on intentional disconnect
    managed.client.onclose = undefined as any;

    // Unregister all tools
    for (const toolName of managed.tools) {
      this.toolRegistry.unregister(toolName);
    }

    // Close client (also closes underlying transport)
    try {
      await managed.client.close();
    } catch (err: any) {
      logger.warn(`McpClientManager: error closing client for "${name}"`, { error: err.message });
    }

    this.servers.delete(name);

    // Update Redis status
    const status: McpServerStatus = { running: false, tools: [] };
    await this.redis.set(
      `${STATUS_KEY_PREFIX}${name}`,
      JSON.stringify(status),
      'EX',
      STATUS_TTL,
    ).catch(() => {});

    logger.info(`McpClientManager: disconnected from "${name}"`);
  }

  /** Convert JSON Schema to ToolParameter array */
  private schemaToParameters(schema: any): Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description: string;
    required: boolean;
    enum?: string[];
    default?: unknown;
  }> {
    const params: Array<{
      name: string;
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      description: string;
      required: boolean;
      enum?: string[];
      default?: unknown;
    }> = [];

    const properties = schema.properties || {};
    const required = new Set(schema.required || []);

    for (const [propName, propSchema] of Object.entries(properties)) {
      const s = propSchema as any;
      const typeMap: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'> = {
        string: 'string',
        number: 'number',
        integer: 'number',
        boolean: 'boolean',
        object: 'object',
        array: 'array',
      };

      params.push({
        name: propName,
        type: typeMap[s.type] || 'string',
        description: s.description || propName,
        required: required.has(propName),
        enum: s.enum,
        default: s.default,
      });
    }

    return params;
  }
}
