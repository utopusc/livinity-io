/**
 * Unified Capability Registry
 *
 * Single source of truth for all capability types in the Livinity platform.
 * Aggregates tools, skills, MCPs, hooks, and agents into a single queryable
 * registry with rich manifests, Redis persistence, and in-memory search.
 *
 * Sync sources:
 * - ToolRegistry     -> tool capabilities
 * - SkillLoader      -> skill capabilities
 * - McpClientManager -> MCP server capabilities
 * - SubagentManager  -> agent capabilities
 *
 * Hooks are a reserved type for future use (event-driven automation).
 */

import type Redis from 'ioredis';
import { logger } from './logger.js';
import type { ToolRegistry } from './tool-registry.js';
import type { SkillLoader } from './skill-loader.js';
import type { McpClientManager } from './mcp-client-manager.js';
import type { McpConfigManager } from './mcp-config-manager.js';
import type { SubagentManager } from './subagent-manager.js';

// ── Types ────────────────────────────────────────────────────────────────────

/** The 5 capability types representable in the registry */
export type CapabilityType = 'tool' | 'skill' | 'mcp' | 'hook' | 'agent';

/** Rich manifest describing a single capability in the registry */
export interface CapabilityManifest {
  /** Unique identifier: {type}:{name} e.g. "mcp:chrome-devtools" */
  id: string;
  /** One of the 5 capability types */
  type: CapabilityType;
  /** Human-readable name */
  name: string;
  /** Description of what this capability does */
  description: string;
  /** Free-form semantic tags for search */
  semantic_tags: string[];
  /** Trigger patterns -- keywords or regex strings that activate this capability */
  triggers: string[];
  /** Tool names this capability provides (for MCPs: tool names registered in ToolRegistry) */
  provides_tools: string[];
  /** Capability names this depends on */
  requires: string[];
  /** Capability names this conflicts with */
  conflicts: string[];
  /** Approximate token cost of loading this capability's tool definitions */
  context_cost: number;
  /** Model tier for execution */
  tier: 'flash' | 'sonnet' | 'opus' | 'any';
  /** Origin of the capability */
  source: 'builtin' | 'marketplace' | 'custom' | 'system';
  /** Runtime status */
  status: 'active' | 'inactive' | 'error';
  /** Last error message if status is 'error' */
  last_error?: string;
  /** Unix timestamp when last used (0 if never) */
  last_used_at: number;
  /** Unix timestamp when registered */
  registered_at: number;
  /** Additional metadata specific to the capability type */
  metadata?: Record<string, unknown>;
}

// ── Registry Dependencies ────────────────────────────────────────────────────

interface CapabilityRegistryDeps {
  redis: Redis;
  toolRegistry: ToolRegistry;
  skillLoader: SkillLoader;
  mcpClientManager: McpClientManager;
  mcpConfigManager: McpConfigManager;
  subagentManager: SubagentManager;
}

// ── CapabilityRegistry ───────────────────────────────────────────────────────

export class CapabilityRegistry {
  /** Redis key prefix: nexus:cap:{type}:{name} */
  private static REDIS_PREFIX = 'nexus:cap:';
  /** Pub/sub channel for config change events (shared with McpClientManager) */
  private static UPDATE_CHANNEL = 'nexus:config:updated';

  /** In-memory cache for fast search (<200 entries expected) */
  private cache = new Map<string, CapabilityManifest>();
  /** Redis subscriber connection for pub/sub */
  private subscriber: Redis | null = null;

  private deps: CapabilityRegistryDeps;

  constructor(deps: CapabilityRegistryDeps) {
    this.deps = deps;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Start the registry: subscribe to config change events and perform
   * initial sync from all data sources.
   */
  async start(): Promise<void> {
    // Subscribe to config change events via Redis pub/sub
    this.subscriber = this.deps.redis.duplicate();
    await this.subscriber.subscribe(CapabilityRegistry.UPDATE_CHANNEL);

    this.subscriber.on('message', async (_channel: string, message: string) => {
      if (message === 'mcp_config') {
        logger.info('CapabilityRegistry: config change detected, re-syncing');
        try {
          await this.syncAll();
        } catch (err: any) {
          logger.error('CapabilityRegistry: re-sync failed', { error: err.message });
        }
      }
    });

    // Initial sync
    await this.syncAll();
    logger.info('CapabilityRegistry: started');
  }

  /**
   * Stop the registry: unsubscribe from pub/sub and clean up.
   */
  async stop(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.unsubscribe(CapabilityRegistry.UPDATE_CHANNEL);
      this.subscriber.disconnect();
      this.subscriber = null;
    }
    logger.info('CapabilityRegistry: stopped');
  }

  // ── Sync Engine ────────────────────────────────────────────────────────────

  /**
   * Full sync from all 4 data sources.
   * Clears in-memory cache, re-populates from ToolRegistry, SkillLoader,
   * McpClientManager/McpConfigManager, and SubagentManager, then persists
   * all manifests to Redis.
   */
  async syncAll(): Promise<void> {
    // Clear cache for fresh sync
    this.cache.clear();

    // Sync from each data source
    this.syncTools();
    this.syncSkills();
    await this.syncMcps();
    await this.syncAgents();

    // Persist all manifests to Redis via pipeline
    const pipeline = this.deps.redis.pipeline();
    for (const [id, manifest] of this.cache) {
      const [type, ...nameParts] = id.split(':');
      const name = nameParts.join(':');
      pipeline.set(
        `${CapabilityRegistry.REDIS_PREFIX}${type}:${name}`,
        JSON.stringify(manifest),
      );
    }
    await pipeline.exec();

    logger.info('CapabilityRegistry: synced', { total: this.cache.size });
  }

  /**
   * Sync tools from ToolRegistry.
   * Skips tools starting with 'mcp__' (they are captured under MCP entries).
   */
  private syncTools(): void {
    const now = Date.now();
    const tools = this.deps.toolRegistry.listAll();

    for (const tool of tools) {
      // Skip MCP-provided tools -- they'll be listed under the MCP capability's provides_tools
      if (tool.name.startsWith('mcp__')) continue;

      // Estimate context cost: characters in description + stringified params, divided by 4
      const paramStr = JSON.stringify(tool.parameters);
      const contextCost = Math.ceil((tool.description.length + paramStr.length) / 4);

      const manifest: CapabilityManifest = {
        id: `tool:${tool.name}`,
        type: 'tool',
        name: tool.name,
        description: tool.description,
        semantic_tags: [],
        triggers: [],
        provides_tools: [tool.name],
        requires: [],
        conflicts: [],
        context_cost: contextCost,
        tier: 'any',
        source: 'system',
        status: 'active',
        last_used_at: 0,
        registered_at: now,
      };

      this.cache.set(manifest.id, manifest);
    }
  }

  /**
   * Sync skills from SkillLoader.
   * Skills consume tools but don't provide them.
   */
  private syncSkills(): void {
    const now = Date.now();
    const skills = this.deps.skillLoader.listSkills();

    for (const skill of skills) {
      const manifest: CapabilityManifest = {
        id: `skill:${skill.name}`,
        type: 'skill',
        name: skill.name,
        description: skill.description,
        semantic_tags: [], // Tags not exposed by listSkills(); will be populated when API is enhanced
        triggers: skill.triggers,
        provides_tools: [],
        requires: [],
        conflicts: [],
        context_cost: 0, // Skills don't add tool definitions to context
        tier: 'any', // Skills have their own tier internally
        source: skill.source || 'builtin',
        status: 'active',
        last_used_at: 0,
        registered_at: now,
      };

      this.cache.set(manifest.id, manifest);
    }
  }

  /**
   * Sync MCP servers from McpConfigManager (configs) and McpClientManager (statuses).
   * Each MCP server becomes one capability entry with its provided tools listed.
   */
  private async syncMcps(): Promise<void> {
    const now = Date.now();
    const config = await this.deps.mcpConfigManager.getConfig();
    const statuses = await this.deps.mcpClientManager.getAllStatuses();

    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      const status = statuses[serverName] || { running: false, tools: [] };

      // Calculate context cost by summing the cost of each provided tool
      let contextCost = 0;
      const providedTools: string[] = status.tools || [];
      for (const toolName of providedTools) {
        const toolEntry = this.cache.get(`tool:${toolName}`);
        if (toolEntry) {
          contextCost += toolEntry.context_cost;
        }
      }

      // Determine status
      let capStatus: 'active' | 'inactive' | 'error' = 'inactive';
      if (status.running) {
        capStatus = 'active';
      } else if (status.lastError) {
        capStatus = 'error';
      }

      const manifest: CapabilityManifest = {
        id: `mcp:${serverName}`,
        type: 'mcp',
        name: serverName,
        description: serverConfig.description || serverName,
        semantic_tags: [],
        triggers: [],
        provides_tools: providedTools,
        requires: [],
        conflicts: [],
        context_cost: contextCost,
        tier: 'any',
        source: serverConfig.installedFrom ? 'marketplace' : 'builtin',
        status: capStatus,
        last_error: status.lastError,
        last_used_at: 0,
        registered_at: serverConfig.installedAt || now,
        metadata: {
          transport: serverConfig.transport,
          command: serverConfig.command,
          url: serverConfig.url,
        },
      };

      this.cache.set(manifest.id, manifest);
    }
  }

  /**
   * Sync agents from SubagentManager.
   * Agents are user-created autonomous entities.
   */
  private async syncAgents(): Promise<void> {
    const now = Date.now();
    const agents = await this.deps.subagentManager.list();

    for (const agent of agents) {
      const manifest: CapabilityManifest = {
        id: `agent:${agent.id}`,
        type: 'agent',
        name: agent.name,
        description: agent.description || '',
        semantic_tags: [],
        triggers: [],
        provides_tools: [],
        requires: [],
        conflicts: [],
        context_cost: 0,
        tier: (agent.tier as 'flash' | 'sonnet' | 'opus') || 'any',
        source: 'custom',
        status: agent.status === 'active' ? 'active' : 'inactive',
        last_used_at: agent.lastRunAt || 0,
        registered_at: now,
        metadata: {
          schedule: agent.schedule,
          runCount: agent.runCount,
        },
      };

      this.cache.set(manifest.id, manifest);
    }
  }

  // ── Query API ──────────────────────────────────────────────────────────────

  /**
   * Get a single capability manifest by ID.
   * Lookup from in-memory cache (sub-ms).
   */
  get(id: string): CapabilityManifest | undefined {
    return this.cache.get(id);
  }

  /**
   * List all capabilities, optionally filtered by type and/or status.
   */
  list(filter?: { type?: CapabilityType; status?: string }): CapabilityManifest[] {
    let results = Array.from(this.cache.values());

    if (filter?.type) {
      results = results.filter((m) => m.type === filter.type);
    }
    if (filter?.status) {
      results = results.filter((m) => m.status === filter.status);
    }

    return results;
  }

  /**
   * Search capabilities using text, tags, and/or type filters.
   * In-memory filter optimized for <200 entries (no Redis SCAN needed).
   *
   * - type: filter by capability type
   * - tags: OR match -- entries where semantic_tags includes ANY of the query tags
   * - text: case-insensitive substring match on name, description, or any semantic_tag
   *
   * Results sorted by name.
   */
  search(query: { text?: string; tags?: string[]; type?: CapabilityType }): CapabilityManifest[] {
    let results = Array.from(this.cache.values());

    // Filter by type
    if (query.type) {
      results = results.filter((m) => m.type === query.type);
    }

    // Filter by tags (OR match)
    if (query.tags && query.tags.length > 0) {
      const queryTags = new Set(query.tags.map((t) => t.toLowerCase()));
      results = results.filter((m) =>
        m.semantic_tags.some((tag) => queryTags.has(tag.toLowerCase())),
      );
    }

    // Filter by text (case-insensitive substring match)
    if (query.text) {
      const lowerText = query.text.toLowerCase();
      results = results.filter((m) =>
        m.name.toLowerCase().includes(lowerText) ||
        m.description.toLowerCase().includes(lowerText) ||
        m.semantic_tags.some((tag) => tag.toLowerCase().includes(lowerText)),
      );
    }

    // Sort by name
    results.sort((a, b) => a.name.localeCompare(b.name));

    return results;
  }

  /** Number of capabilities in the registry */
  get size(): number {
    return this.cache.size;
  }
}
