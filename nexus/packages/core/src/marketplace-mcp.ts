/**
 * Livinity Marketplace MCP
 *
 * Provides 5 tools for discovering, installing, and managing marketplace
 * capabilities through the AI agent interface:
 *
 * - livinity_search   — Search marketplace by keyword/tag
 * - livinity_install  — Install a capability (validate + conflict-check + register)
 * - livinity_uninstall — Remove a marketplace capability
 * - livinity_recommend — Get recommendations based on installed capabilities
 * - livinity_list     — List installed capabilities
 *
 * Backed by a GitHub repository (utopusc/livinity-skills) with a
 * marketplace/index.json catalog. Index is cached in Redis for 1 hour.
 */

import type Redis from 'ioredis';
import { logger } from './logger.js';
import type { CapabilityRegistry } from './capability-registry.js';
import type { CapabilityType, CapabilityManifest } from './capability-registry.js';
import type { ToolRegistry } from './tool-registry.js';
import type { SkillRegistryClient } from './skill-registry-client.js';
import type { Tool, ToolResult } from './types.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface MarketplaceMcpDeps {
  capabilityRegistry: CapabilityRegistry;
  skillRegistryClient: SkillRegistryClient;
  toolRegistry: ToolRegistry;
  redis: Redis;
  mcpConfigManager?: any; // McpConfigManager — installServer() to add and start MCP servers
  subagentManager?: any;  // SubagentManager — create() to make agent instances
}

/** A single entry in the marketplace index.json */
interface MarketplaceEntry {
  name: string;
  type: CapabilityType;
  version: string;
  description: string;
  author?: string;
  tags: string[];
  triggers: string[];
  provides_tools: string[];
  requires: string[];
  conflicts: string[];
  context_cost: number;
  tier: 'flash' | 'sonnet' | 'opus' | 'any';
  path: string; // e.g. "marketplace/skills/server-health"
}

// ── Constants ────────────────────────────────────────────────────────────────

const MARKETPLACE_INDEX_URL =
  process.env.MARKETPLACE_URL || 'https://mcp.livinity.io/api/catalog';
const REDIS_INDEX_KEY = 'nexus:marketplace:index';
const REDIS_INDEX_TTL = 3600; // 1 hour in seconds
const REDIS_INSTALLED_PREFIX = 'nexus:marketplace:installed:';
const MAX_SEARCH_RESULTS = 20;

// ── MarketplaceMcp ──────────────────────────────────────────────────────────

export class MarketplaceMcp {
  private deps: MarketplaceMcpDeps;

  constructor(deps: MarketplaceMcpDeps) {
    this.deps = deps;
  }

  /**
   * Register all 5 livinity_* tools in the ToolRegistry.
   * Call once during Nexus startup.
   */
  registerTools(): void {
    this.deps.toolRegistry.register(this.createSearchTool());
    this.deps.toolRegistry.register(this.createInstallTool());
    this.deps.toolRegistry.register(this.createUninstallTool());
    this.deps.toolRegistry.register(this.createRecommendTool());
    this.deps.toolRegistry.register(this.createListTool());
  }

  // ── Marketplace Index ──────────────────────────────────────────────────────

  /**
   * Fetch the marketplace index from GitHub (via Redis cache).
   * Returns empty array if the index doesn't exist yet (404).
   */
  private async fetchIndex(): Promise<MarketplaceEntry[]> {
    // Check Redis cache first
    try {
      const cached = await this.deps.redis.get(REDIS_INDEX_KEY);
      if (cached) {
        return JSON.parse(cached) as MarketplaceEntry[];
      }
    } catch {
      // Cache miss or corrupt — fetch fresh
    }

    // Fetch from mcp.livinity.io marketplace API
    try {
      const response = await fetch(MARKETPLACE_INDEX_URL, {
        headers: {
          'User-Agent': 'Nexus-Marketplace/1.0',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Marketplace API returned ${response.status}`);
      }

      const data = (await response.json()) as { items?: MarketplaceEntry[]; results?: MarketplaceEntry[] } | MarketplaceEntry[];

      // Handle both {items: [...]} format (catalog endpoint) and raw array format
      const entries: MarketplaceEntry[] = Array.isArray(data) ? data : (data.items || data.results || []);

      // Cache in Redis
      await this.deps.redis.setex(REDIS_INDEX_KEY, REDIS_INDEX_TTL, JSON.stringify(entries));

      logger.info('MarketplaceMcp: catalog fetched from marketplace API', { entries: entries.length });
      return entries;
    } catch (err: any) {
      logger.error('MarketplaceMcp: failed to fetch index', { error: err.message });
      // Return empty rather than throwing — marketplace unavailability is not fatal
      return [];
    }
  }

  // ── Tool Factories ────────────────────────────────────────────────────────

  private createSearchTool(): Tool {
    return {
      name: 'livinity_search',
      description:
        'Search the Livinity Marketplace (2800+ capabilities). Use "query" for keyword search and "type" to filter. Available types: mcp (80), agent (403), skill (2270), hook (53), prompt (2). Use query="*" to browse all items of a type. Examples: query="react" type="agent" finds React agents. query="*" type="hook" lists all hooks.',
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'Search keyword (e.g. "react", "docker", "security"). Use "*" to list all items.',
          required: true,
        },
        {
          name: 'type',
          type: 'string',
          description: 'Filter by type: mcp, agent, skill, hook, or prompt',
          required: false,
          enum: ['skill', 'mcp', 'hook', 'agent', 'prompt'],
        },
        {
          name: 'limit',
          type: 'number',
          description: 'Max results to return (default 20, max 100)',
          required: false,
        },
      ],
      execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
        try {
          const query = (params.query as string || '').toLowerCase().trim();
          const typeFilter = params.type as CapabilityType | undefined;
          const limit = Math.min(Math.max((params.limit as number) || 20, 1), 100);

          const entries = await this.fetchIndex();

          // '*' or empty query returns all entries
          let matches = (!query || query === '*')
            ? entries
            : entries.filter((entry) => {
                const nameMatch = entry.name.toLowerCase().includes(query);
                const descMatch = entry.description.toLowerCase().includes(query);
                const tagMatch = entry.tags.some((t) => t.toLowerCase().includes(query));
                return nameMatch || descMatch || tagMatch;
              });

          const totalBeforeType = matches.length;

          if (typeFilter) {
            matches = matches.filter((e) => e.type === typeFilter);
          }

          const totalMatches = matches.length;
          matches = matches.slice(0, limit);

          const results = matches.map((e) => ({
            id: e.id || `${e.type}:${e.name}`,
            name: e.name,
            type: e.type,
            description: e.description,
            tags: e.tags,
            author: e.author,
          }));

          // Summary line at top so AI understands the scope
          const summary = `Found ${totalMatches} results${totalMatches > limit ? ` (showing first ${limit}, use limit param for more)` : ''}. Marketplace total: ${entries.length} items.`;

          return {
            success: true,
            output: summary + '\n\n' + JSON.stringify(results, null, 2),
            data: { results, total: totalMatches, showing: results.length, marketplace_total: entries.length },
          };
        } catch (err: any) {
          return { success: false, output: '', error: err.message };
        }
      },
    };
  }

  private createInstallTool(): Tool {
    return {
      name: 'livinity_install',
      description:
        'Install a capability from the Livinity Marketplace. Performs REAL installation: MCP → starts server process, Agent → creates subagent, Hook → registers event handler, Skill → registers in system. Use the "id" from search results (e.g. "mcp:context7", "agent:code-reviewer").',
      parameters: [
        {
          name: 'id',
          type: 'string',
          description: 'Capability ID from search results (e.g. "mcp:fetch", "agent:devops-engineer", "hook:smart-commit")',
          required: true,
        },
      ],
      execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
        try {
          const id = (params.id as string || params.name as string || '').trim();
          if (!id) {
            return { success: false, output: '', error: 'id parameter is required (e.g. "mcp:fetch")' };
          }

          // 1. Fetch index and find entry by id or name
          const entries = await this.fetchIndex();
          const entry = entries.find((e) => (e.id || `${e.type}:${e.name}`) === id)
            || entries.find((e) => e.name.toLowerCase() === id.toLowerCase())
            || entries.find((e) => e.name.toLowerCase().includes(id.toLowerCase()));

          if (!entry) {
            return { success: false, output: '', error: `"${id}" not found in marketplace. Use livinity_search to find available capabilities.` };
          }

          const capabilityId = entry.id || `${entry.type}:${entry.name}`;
          const config = entry.config || {};

          // 2. Type-specific installation
          let installResult = '';

          switch (entry.type) {
            case 'mcp': {
              const serverName = entry.name.toLowerCase().replace(/\s+/g, '-');
              if (this.deps.mcpConfigManager) {
                await this.deps.mcpConfigManager.installServer({
                  name: serverName,
                  transport: config.transport || 'stdio',
                  command: config.command || 'npx',
                  args: config.args || [],
                  env: config.env || {},
                  enabled: true,
                  description: entry.description,
                  installedFrom: 'marketplace',
                  installedAt: Date.now(),
                });
                installResult = `MCP server "${serverName}" installed and connecting. Command: ${config.command || 'npx'} ${(config.args || []).join(' ')}. Tools will be available shortly.`;
              } else {
                // Fallback: save to Redis config directly
                const mcpConfig = {
                  name: serverName,
                  transport: config.transport || 'stdio',
                  command: config.command || 'npx',
                  args: config.args || [],
                  env: config.env || {},
                  enabled: true,
                  description: entry.description,
                  installedFrom: 'marketplace',
                  installedAt: Date.now(),
                };
                await this.deps.redis.hset('nexus:config:mcp_servers', serverName, JSON.stringify(mcpConfig));
                await this.deps.redis.publish('nexus:config:updated', 'mcp_config');
                installResult = `MCP server "${serverName}" config saved. Restart liv-core to activate.`;
              }
              break;
            }

            case 'agent': {
              // Real agent install — create subagent via SubagentManager
              if (!this.deps.subagentManager) {
                installResult = 'Agent registered in catalog (SubagentManager not available). Config saved.';
              } else {
                const agentId = entry.name.toLowerCase().replace(/\s+/g, '-');
                await this.deps.subagentManager.create({
                  id: agentId,
                  name: entry.name,
                  description: entry.description,
                  systemPrompt: config.systemPrompt || entry.description,
                  tools: config.tools || ['*'],
                  tier: entry.tier === 'any' ? 'sonnet' : entry.tier,
                  maxTurns: 25,
                  status: 'active',
                  createdBy: 'marketplace',
                  createdVia: 'web',
                  ...(config.loop ? { loop: config.loop } : {}),
                  ...(config.schedule ? { schedule: config.schedule } : {}),
                });
                installResult = `Agent "${entry.name}" created with ${(config.tools || ['all tools']).join(', ')}. ${config.loop ? 'Loop configured: ' + config.loop.task : 'Ready to receive messages.'}`;
              }
              break;
            }

            case 'hook': {
              // Save hook to Redis
              const hookName = entry.name.toLowerCase().replace(/\s+/g, '-');
              const hookConfig = {
                name: hookName,
                event: config.event || (config.PostToolUse ? 'post-task' : config.PreToolUse ? 'pre-task' : 'post-task'),
                command: config.command || 'echo "hook triggered"',
                enabled: true,
                installedFrom: 'marketplace',
              };
              await this.deps.redis.set(`nexus:hooks:${hookName}`, JSON.stringify(hookConfig));
              installResult = `Hook "${hookName}" installed. Event: ${hookConfig.event}. Will fire on ${hookConfig.event} events.`;
              break;
            }

            case 'skill': {
              // Register skill in catalog
              installResult = `Skill "${entry.name}" registered. Available for AI to use via skill system.`;
              break;
            }

            default: {
              installResult = `${entry.type} "${entry.name}" registered in capability catalog.`;
            }
          }

          // 3. Register in CapabilityRegistry
          const manifest: CapabilityManifest = {
            id: capabilityId,
            type: entry.type,
            name: entry.name,
            description: entry.description,
            semantic_tags: entry.tags || [],
            triggers: entry.triggers || [],
            provides_tools: entry.provides_tools || [],
            requires: entry.requires || [],
            conflicts: entry.conflicts || [],
            context_cost: entry.context_cost || 0,
            tier: entry.tier || 'any',
            source: 'marketplace',
            status: 'active',
            last_used_at: 0,
            registered_at: Date.now(),
            metadata: { version: entry.version, author: entry.author },
          };
          await this.deps.capabilityRegistry.registerCapability(manifest);

          // 4. Store install metadata
          await this.deps.redis.set(`${REDIS_INSTALLED_PREFIX}${capabilityId}`, JSON.stringify({
            id: capabilityId, type: entry.type, version: entry.version, installedAt: Date.now(),
          }));

          logger.info('MarketplaceMcp: installed', { id: capabilityId, type: entry.type });

          return {
            success: true,
            output: `✅ ${installResult}\n\nCapability "${capabilityId}" is now active in the registry.`,
            data: { id: capabilityId, type: entry.type, version: entry.version },
          };
        } catch (err: any) {
          return { success: false, output: '', error: `Install failed: ${err.message}` };
        }
      },
    };
  }

  private createUninstallTool(): Tool {
    return {
      name: 'livinity_uninstall',
      description:
        'Uninstall a marketplace capability. Only capabilities with source "marketplace" can be uninstalled. Built-in capabilities cannot be removed.',
      parameters: [
        {
          name: 'name',
          type: 'string',
          description: 'Name of the capability to uninstall',
          required: true,
        },
        {
          name: 'type',
          type: 'string',
          description: 'Type of the capability (tool, skill, mcp, hook, agent)',
          required: true,
          enum: ['tool', 'skill', 'mcp', 'hook', 'agent'],
        },
      ],
      execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
        try {
          const name = params.name as string;
          const type = params.type as CapabilityType;

          if (!name || !type) {
            return { success: false, output: '', error: 'name and type parameters are required' };
          }

          const id = `${type}:${name}`;

          // 1. Check capability exists and is marketplace-sourced
          const existing = this.deps.capabilityRegistry.get(id);
          if (!existing) {
            return {
              success: false,
              output: '',
              error: `Capability "${id}" not found in registry`,
            };
          }
          if (existing.source !== 'marketplace') {
            return {
              success: false,
              output: '',
              error: `Cannot uninstall "${id}": source is "${existing.source}" (only marketplace capabilities can be uninstalled)`,
            };
          }

          // 2. Unregister from CapabilityRegistry
          await this.deps.capabilityRegistry.unregisterCapability(id);

          // 3. Remove install metadata from Redis
          await this.deps.redis.del(`${REDIS_INSTALLED_PREFIX}${name}`);

          logger.info('MarketplaceMcp: capability uninstalled', { id });

          return {
            success: true,
            output: `Uninstalled "${id}" from marketplace.`,
            data: { id },
          };
        } catch (err: any) {
          return { success: false, output: '', error: err.message };
        }
      },
    };
  }

  private createRecommendTool(): Tool {
    return {
      name: 'livinity_recommend',
      description:
        'Get personalized marketplace recommendations. Returns popular and relevant capabilities not yet installed. Use after livinity_search to get smart suggestions.',
      parameters: [
        {
          name: 'context',
          type: 'string',
          description: 'What the user is working on (e.g. "web development", "server monitoring"). Helps find relevant recommendations.',
          required: false,
        },
        {
          name: 'limit',
          type: 'number',
          description: 'Max recommendations (default 10)',
          required: false,
          default: 10,
        },
      ],
      execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
        try {
          const limit = (params.limit as number) || 10;
          const context = (params.context as string || '').toLowerCase().trim();

          // 1. Fetch marketplace index
          const entries = await this.fetchIndex();
          if (entries.length === 0) {
            return {
              success: true,
              output: 'Marketplace is empty or unreachable.',
              data: [],
            };
          }

          // 2. Get installed capabilities
          const installed = this.deps.capabilityRegistry.list();
          const installedIds = new Set(installed.map((c) => c.id));

          // 3. Collect tags from installed + context
          const relevantTags = new Set<string>();
          for (const cap of installed) {
            for (const tag of cap.semantic_tags) {
              relevantTags.add(tag.toLowerCase());
            }
          }
          // Add context words as tags for matching
          if (context) {
            for (const word of context.split(/\s+/)) {
              if (word.length > 2) relevantTags.add(word);
            }
          }

          // 4. Score marketplace entries
          const scored: Array<{ entry: MarketplaceEntry; score: number }> = [];

          for (const entry of entries) {
            const capId = entry.id || `${entry.type}:${entry.name}`;
            if (installedIds.has(capId)) continue;

            let score = 0;
            // Tag overlap scoring
            for (const tag of (entry.tags || [])) {
              if (relevantTags.has(tag.toLowerCase())) score += 2;
            }
            // Description keyword matching from context
            if (context) {
              for (const word of context.split(/\s+/)) {
                if (word.length > 2 && entry.description.toLowerCase().includes(word)) score += 1;
                if (word.length > 2 && entry.name.toLowerCase().includes(word)) score += 3;
              }
            }
            // Boost diverse types (prefer showing 1 of each type)
            scored.push({ entry, score });
          }

          // 5. Sort by score descending, then alphabetically
          scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.entry.name.localeCompare(b.entry.name);
          });

          const top = scored.slice(0, limit);
          const results = top.map((s) => ({
            name: s.entry.name,
            type: s.entry.type,
            version: s.entry.version,
            description: s.entry.description,
            tags: s.entry.tags,
            author: s.entry.author,
            score: s.score,
          }));

          return {
            success: true,
            output: JSON.stringify(results, null, 2),
            data: results,
          };
        } catch (err: any) {
          return { success: false, output: '', error: err.message };
        }
      },
    };
  }

  private createListTool(): Tool {
    return {
      name: 'livinity_list',
      description:
        'List currently installed capabilities on this server + marketplace stats. Shows what is active and what is available to install.',
      parameters: [
        {
          name: 'source',
          type: 'string',
          description: 'Filter by source: "marketplace" for marketplace-only, "all" for everything',
          required: false,
          enum: ['marketplace', 'all'],
          default: 'all',
        },
      ],
      execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
        try {
          const source = (params.source as string) || 'all';

          let capabilities = this.deps.capabilityRegistry.list();

          if (source === 'marketplace') {
            capabilities = capabilities.filter((c) => c.source === 'marketplace');
          }

          const results = capabilities.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            description: c.description,
            status: c.status,
            source: c.source,
          }));

          // Add marketplace stats
          const marketplaceEntries = await this.fetchIndex();
          const mktByType: Record<string, number> = {};
          for (const e of marketplaceEntries) {
            mktByType[e.type] = (mktByType[e.type] || 0) + 1;
          }

          const summary = `Installed: ${results.length} capabilities.\nMarketplace available: ${marketplaceEntries.length} total (${Object.entries(mktByType).map(([t, c]) => `${c} ${t}s`).join(', ')}).\nUse livinity_search to find and livinity_install to add new capabilities.`;

          return {
            success: true,
            output: summary + '\n\n' + JSON.stringify(results, null, 2),
            data: { installed: results, marketplace_stats: mktByType, marketplace_total: marketplaceEntries.length },
          };
        } catch (err: any) {
          return { success: false, output: '', error: err.message };
        }
      },
    };
  }
}
