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
  process.env.MARKETPLACE_URL || 'http://45.137.194.102:4100/api/catalog';
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
        'Search the Livinity Marketplace for capabilities by keyword or tag. Returns matching capabilities with name, type, version, description, and tags.',
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'Keyword or tag to search for',
          required: true,
        },
        {
          name: 'type',
          type: 'string',
          description: 'Filter by capability type',
          required: false,
          enum: ['tool', 'skill', 'mcp', 'hook', 'agent'],
        },
      ],
      execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
        try {
          const query = (params.query as string || '').toLowerCase();
          const typeFilter = params.type as CapabilityType | undefined;

          if (!query) {
            return { success: false, output: '', error: 'query parameter is required' };
          }

          const entries = await this.fetchIndex();

          let matches = entries.filter((entry) => {
            const nameMatch = entry.name.toLowerCase().includes(query);
            const descMatch = entry.description.toLowerCase().includes(query);
            const tagMatch = entry.tags.some((t) => t.toLowerCase().includes(query));
            return nameMatch || descMatch || tagMatch;
          });

          if (typeFilter) {
            matches = matches.filter((e) => e.type === typeFilter);
          }

          matches = matches.slice(0, MAX_SEARCH_RESULTS);

          const results = matches.map((e) => ({
            name: e.name,
            type: e.type,
            version: e.version,
            description: e.description,
            tags: e.tags,
            author: e.author,
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

  private createInstallTool(): Tool {
    return {
      name: 'livinity_install',
      description:
        'Install a capability from the Livinity Marketplace. Validates the manifest, checks for conflicts with installed capabilities, and registers it immediately in the CapabilityRegistry.',
      parameters: [
        {
          name: 'name',
          type: 'string',
          description: 'Name of the capability to install (from marketplace search results)',
          required: true,
        },
      ],
      execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
        try {
          const name = params.name as string;
          if (!name) {
            return { success: false, output: '', error: 'name parameter is required' };
          }

          // 1. Fetch index and find entry
          const entries = await this.fetchIndex();
          const entry = entries.find((e) => e.name === name);
          if (!entry) {
            return {
              success: false,
              output: '',
              error: `Capability "${name}" not found in marketplace`,
            };
          }

          // 2. Validate manifest fields
          if (!entry.name || !entry.type || !entry.description || !entry.version) {
            return {
              success: false,
              output: '',
              error: `Invalid manifest for "${name}": missing required fields (name, type, description, version)`,
            };
          }

          // 3. Conflict detection
          if (entry.conflicts && entry.conflicts.length > 0) {
            const conflicting: string[] = [];
            for (const conflictId of entry.conflicts) {
              const existing = this.deps.capabilityRegistry.get(conflictId);
              if (existing) {
                conflicting.push(conflictId);
              }
            }
            if (conflicting.length > 0) {
              return {
                success: false,
                output: '',
                error: `Cannot install "${name}": conflicts with installed capabilities: ${conflicting.join(', ')}`,
              };
            }
          }

          // 4. Check not already installed
          const capabilityId = `${entry.type}:${name}`;
          const existing = this.deps.capabilityRegistry.get(capabilityId);
          if (existing && existing.source === 'marketplace') {
            return {
              success: false,
              output: '',
              error: `Capability "${capabilityId}" is already installed from marketplace`,
            };
          }

          // 5. Create CapabilityManifest
          const manifest: CapabilityManifest = {
            id: capabilityId,
            type: entry.type,
            name: entry.name,
            description: entry.description,
            semantic_tags: entry.tags,
            triggers: entry.triggers,
            provides_tools: entry.provides_tools,
            requires: entry.requires,
            conflicts: entry.conflicts,
            context_cost: entry.context_cost,
            tier: entry.tier,
            source: 'marketplace',
            status: 'active',
            last_used_at: 0,
            registered_at: Date.now(),
            metadata: {
              version: entry.version,
              author: entry.author,
              path: entry.path,
            },
          };

          // 6. Register in CapabilityRegistry
          await this.deps.capabilityRegistry.registerCapability(manifest);

          // 7. Store install metadata in Redis
          await this.deps.redis.set(
            `${REDIS_INSTALLED_PREFIX}${name}`,
            JSON.stringify({
              name: entry.name,
              type: entry.type,
              version: entry.version,
              installedAt: Date.now(),
            }),
          );

          logger.info('MarketplaceMcp: capability installed', {
            id: capabilityId,
            version: entry.version,
          });

          return {
            success: true,
            output: `Installed "${capabilityId}" (v${entry.version}) from marketplace. Capability is now active.`,
            data: { id: capabilityId, version: entry.version },
          };
        } catch (err: any) {
          return { success: false, output: '', error: err.message };
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
        'Get marketplace capability recommendations based on tag overlap with currently installed capabilities. Returns scored suggestions.',
      parameters: [
        {
          name: 'limit',
          type: 'number',
          description: 'Maximum number of recommendations to return',
          required: false,
          default: 5,
        },
      ],
      execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
        try {
          const limit = (params.limit as number) || 5;

          // 1. Fetch marketplace index
          const entries = await this.fetchIndex();
          if (entries.length === 0) {
            return {
              success: true,
              output: JSON.stringify([]),
              data: [],
            };
          }

          // 2. Get installed capabilities
          const installed = this.deps.capabilityRegistry.list();
          const installedIds = new Set(installed.map((c) => c.id));

          // 3. Collect all tags from installed capabilities
          const installedTags = new Set<string>();
          for (const cap of installed) {
            for (const tag of cap.semantic_tags) {
              installedTags.add(tag.toLowerCase());
            }
          }

          // 4. Score marketplace entries by tag overlap
          const scored: Array<{ entry: MarketplaceEntry; score: number }> = [];

          for (const entry of entries) {
            // Skip already installed
            const capId = `${entry.type}:${entry.name}`;
            if (installedIds.has(capId)) continue;

            if (installedTags.size === 0) {
              // No installed tags — treat all as equally recommended ("popular")
              scored.push({ entry, score: 0 });
            } else {
              // Count tag overlap
              let overlap = 0;
              for (const tag of entry.tags) {
                if (installedTags.has(tag.toLowerCase())) {
                  overlap++;
                }
              }
              scored.push({ entry, score: overlap });
            }
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
        'List installed capabilities. Filter by source to see only marketplace-installed capabilities or all capabilities.',
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
}
