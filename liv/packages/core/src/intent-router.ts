/**
 * Intent Router v2
 *
 * Classifies user messages and selects relevant capabilities from the unified
 * registry using keyword/trigger matching with TF-IDF-like scoring, confidence
 * thresholds, context budget management, and Redis caching.
 *
 * Replaces static tool-loading with intelligent, intent-based capability selection.
 * Keeps context window lean (under 30% for tools) and improves response quality
 * by only presenting relevant tools to the AI.
 *
 * Runs in two contexts:
 * - nexus (index.ts): getCapabilities wraps capabilityRegistry.list()
 * - livinityd (ws-agent.ts): getCapabilities wraps HTTP fetch to /api/capabilities
 */

import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import type { CapabilityManifest } from './capability-registry.js';
import type { LearningEngine } from './learning-engine.js';
import { logger } from './logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface IntentRouterDeps {
  redis: Redis;
  getCapabilities: () => CapabilityManifest[] | Promise<CapabilityManifest[]>;
  brain?: { think(opts: { prompt: string; tier?: string; maxTokens?: number }): Promise<string> };
  learningEngine?: LearningEngine;
}

export interface IntentResult {
  capabilities: ScoredCapability[];
  fromCache: boolean;
  totalContextCost: number;
}

export type ScoredCapability = CapabilityManifest & { _score: number };

// ── Constants ────────────────────────────────────────────────────────────────

/** Core tools that are always loaded regardless of intent match */
const CORE_TOOL_NAMES = [
  'shell',
  'files_read',
  'files_write',
  'files_list',
  'sysinfo',
  'docker_list',
  'docker_manage',
  'docker_exec',
];

const DEFAULT_CONFIDENCE_THRESHOLD = 0.3;
const DEFAULT_CACHE_TTL_SECONDS = 3600;
const MAX_CAPABILITIES = 15;

/** Approximate context window sizes by model tier (token counts) */
const CONTEXT_WINDOWS: Record<string, number> = {
  opus: 200000,
  sonnet: 200000,
  haiku: 200000,
  flash: 200000,
};

/** Maximum fraction of context window that tool definitions may consume */
const CONTEXT_BUDGET_RATIO = 0.3;

// ── IntentRouter ─────────────────────────────────────────────────────────────

export class IntentRouter {
  private deps: IntentRouterDeps;

  constructor(deps: IntentRouterDeps) {
    this.deps = deps;
  }

  // ── Main Entry Point ────────────────────────────────────────────────────────

  /**
   * Classify a user message and return matching capabilities sorted by relevance.
   *
   * Steps: cache check -> score all capabilities -> threshold filter ->
   * optional LLM fallback -> sort -> budget cap -> ensure core tools -> cache write.
   */
  async resolveCapabilities(message: string, tier?: string): Promise<IntentResult> {
    const startMs = Date.now();

    // 1. Cache check
    const hash = this.normalizeAndHash(message);
    const cacheKey = `liv:intent:${hash}`;

    try {
      const cached = await this.deps.redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as IntentResult;
        logger.info('IntentRouter: resolved from cache', {
          cacheKey,
          capabilities: parsed.capabilities.length,
          totalContextCost: parsed.totalContextCost,
          ms: Date.now() - startMs,
        });
        return { ...parsed, fromCache: true };
      }
    } catch (err: any) {
      logger.error('IntentRouter: cache read failed, proceeding without cache', { error: err.message });
    }

    // 2. Get all active capabilities
    const allCapabilities = await this.deps.getCapabilities();

    // 3. Tokenize message
    const normalizedMsg = message.toLowerCase().replace(/[^\w\s]/g, '');
    const tokens = normalizedMsg.split(/\s+/).filter(Boolean);
    const tokenSet = new Set(tokens);

    // 4. Score each capability
    const scored: ScoredCapability[] = [];
    for (const cap of allCapabilities) {
      const score = this.scoreCapability(tokens, tokenSet, cap);
      if (score > 0) {
        scored.push({ ...cap, _score: score });
      }
    }

    // 5. Filter by threshold
    let threshold = DEFAULT_CONFIDENCE_THRESHOLD;
    try {
      const configThreshold = await this.deps.redis.get('liv:config:intent_threshold');
      if (configThreshold) {
        const parsed = parseFloat(configThreshold);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 1) {
          threshold = parsed;
        }
      }
    } catch (err: any) {
      logger.error('IntentRouter: failed to read threshold config', { error: err.message });
    }

    let filtered = scored.filter((c) => c._score >= threshold);

    // 6. LLM fallback — only if zero caps above threshold, message has 3+ words, brain exists
    if (filtered.length === 0 && tokens.length >= 3 && this.deps.brain) {
      logger.warn('IntentRouter: no keyword matches, attempting LLM fallback', {
        message: message.slice(0, 100),
        tokenCount: tokens.length,
      });

      try {
        const capList = allCapabilities
          .slice(0, 50)
          .map((c) => `${c.id}: ${c.description}`)
          .join('\n');

        const llmResponse = await this.deps.brain.think({
          prompt: `Given this user message: "${message}"\n\nWhich of these capability categories are relevant? Return a JSON array of matching IDs.\n\nCapabilities:\n${capList}`,
          tier: 'haiku',
          maxTokens: 300,
        });

        // Parse JSON array from LLM response (handle markdown code blocks)
        const jsonStr = llmResponse.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
        const matchedIds: string[] = JSON.parse(jsonStr);

        if (Array.isArray(matchedIds)) {
          const capMap = new Map(allCapabilities.map((c) => [c.id, c]));
          for (const id of matchedIds) {
            const cap = capMap.get(id);
            if (cap) {
              filtered.push({ ...cap, _score: 0.5 });
            }
          }
          logger.info('IntentRouter: LLM fallback matched capabilities', {
            count: filtered.length,
          });
        }
      } catch (err: any) {
        logger.error('IntentRouter: LLM fallback failed', { error: err.message });
        // Continue with empty filtered — core tools will still be included
      }
    }

    // 7. Sort by score descending
    filtered.sort((a, b) => b._score - a._score);

    // 8. Apply context budget
    const budgetTokens = (CONTEXT_WINDOWS[tier || 'sonnet'] || 200000) * CONTEXT_BUDGET_RATIO;
    let accumulatedCost = 0;
    const selected: ScoredCapability[] = [];

    for (const cap of filtered) {
      if (selected.length >= MAX_CAPABILITIES) break;
      if (accumulatedCost + cap.context_cost > budgetTokens) break;
      accumulatedCost += cap.context_cost;
      selected.push(cap);
    }

    // 8b. Expand dependencies — ensure required capabilities are included
    const expanded = this.expandDependencies(selected, allCapabilities);
    selected.length = 0;
    selected.push(...expanded);

    // 9. Always include core tools
    const selectedIds = new Set(selected.map((c) => c.id));
    for (const toolName of CORE_TOOL_NAMES) {
      const coreId = `tool:${toolName}`;
      if (!selectedIds.has(coreId)) {
        const coreCap = allCapabilities.find((c) => c.id === coreId);
        if (coreCap) {
          selected.push({ ...coreCap, _score: 0 });
          selectedIds.add(coreId);
        }
      }
    }

    // 9b. Learning engine suggestions — append commonly co-used capabilities not yet selected
    if (this.deps.learningEngine) {
      try {
        const selectedToolNames = this.getToolNamesFromCapabilities(selected);
        const suggestions = await this.deps.learningEngine.getSuggestions(selectedToolNames, allCapabilities);
        for (const suggestion of suggestions) {
          if (!selectedIds.has(suggestion.capability.id)) {
            selected.push({ ...suggestion.capability, _score: suggestion.confidence });
            selectedIds.add(suggestion.capability.id);
          }
        }
      } catch (err: any) {
        logger.warn('IntentRouter: learning engine suggestion failed', { error: err.message });
      }
    }

    const totalContextCost = selected.reduce((sum, c) => sum + c.context_cost, 0);

    // 10. Cache result
    const result: IntentResult = {
      capabilities: selected,
      fromCache: false,
      totalContextCost,
    };

    try {
      const cacheTTL = DEFAULT_CACHE_TTL_SECONDS;
      await this.deps.redis.set(cacheKey, JSON.stringify(result), 'EX', cacheTTL);
    } catch (err: any) {
      logger.error('IntentRouter: cache write failed', { error: err.message });
    }

    logger.info('IntentRouter: resolved capabilities', {
      capabilities: selected.length,
      fromCache: false,
      totalContextCost,
      threshold,
      tier: tier || 'sonnet',
      ms: Date.now() - startMs,
    });

    // 11. Return
    return result;
  }

  // ── Dependency Resolution ───────────────────────────────────────────────────

  /**
   * Expand `requires` dependencies for selected capabilities.
   *
   * Performs depth-first resolution: for each selected capability, recursively
   * adds any required capabilities that are not yet in the set. Circular
   * dependencies are detected via a `visited` set and logged as warnings.
   *
   * Dependencies are added with `_score: 0` (dependency-injected, not intent-matched).
   */
  private expandDependencies(
    selected: ScoredCapability[],
    allCapabilities: CapabilityManifest[],
  ): ScoredCapability[] {
    const capMap = new Map<string, CapabilityManifest>();
    for (const cap of allCapabilities) {
      capMap.set(cap.id, cap);
    }

    const resultMap = new Map<string, ScoredCapability>();
    for (const cap of selected) {
      resultMap.set(cap.id, cap);
    }

    const visited = new Set<string>();

    const resolve = (capId: string) => {
      if (visited.has(capId)) return;
      visited.add(capId);

      const cap = resultMap.get(capId) || capMap.get(capId);
      if (!cap) return;

      for (const depId of cap.requires) {
        if (resultMap.has(depId)) {
          // Dependency already in result set — still need to resolve its transitive deps
          if (!visited.has(depId)) {
            resolve(depId);
          }
          continue;
        }

        // Check for circular dependency
        if (visited.has(depId)) {
          logger.warn('IntentRouter: circular dependency detected', { capId, depId });
          continue;
        }

        const depCap = capMap.get(depId);
        if (!depCap) {
          logger.warn('IntentRouter: required dependency not found in registry', { capId, depId });
          continue;
        }

        // Add dependency with score 0 (dependency-injected)
        resultMap.set(depId, { ...depCap, _score: 0 });
        // Recursively resolve transitive dependencies
        resolve(depId);
      }
    };

    // Resolve dependencies for each originally selected capability
    for (const cap of selected) {
      resolve(cap.id);
    }

    return Array.from(resultMap.values());
  }

  // ── Public Accessors ──────────────────────────────────────────────────────

  /** Expose getCapabilities for discover_capability tool */
  async getCapabilitiesList(): Promise<CapabilityManifest[]> {
    return this.deps.getCapabilities();
  }

  // ── Scoring ─────────────────────────────────────────────────────────────────

  /**
   * Score a single capability against the user message tokens.
   *
   * Scoring rules:
   * - Exact trigger match: +1.0 per match
   * - Semantic tag word match: +0.5 per match
   * - Name/description token hit: +0.3 per unique token
   *
   * Normalized by token count, capped at 1.0.
   */
  private scoreCapability(
    tokens: string[],
    tokenSet: Set<string>,
    cap: CapabilityManifest,
  ): number {
    let rawScore = 0;

    // Trigger matches: exact token match against triggers (case-insensitive)
    for (const trigger of cap.triggers) {
      const triggerLower = trigger.toLowerCase();
      if (tokenSet.has(triggerLower)) {
        rawScore += 1.0;
      }
    }

    // Semantic tag matches: split multi-word tags, match each word
    for (const tag of cap.semantic_tags) {
      const tagWords = tag.toLowerCase().split(/[\s\-]+/);
      for (const tagWord of tagWords) {
        if (tagWord && tokenSet.has(tagWord)) {
          rawScore += 0.5;
        }
      }
    }

    // Name/description token hits: +0.3 per unique token that appears
    const nameLower = cap.name.toLowerCase();
    const descLower = cap.description.toLowerCase();
    for (const token of tokens) {
      if (token.length < 2) continue; // Skip very short tokens
      if (nameLower.includes(token) || descLower.includes(token)) {
        rawScore += 0.3;
      }
    }

    // Normalize by token count, cap at 1.0
    const normalized = rawScore / Math.max(1, tokens.length);
    return Math.min(1.0, normalized);
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  /**
   * Normalize a message and produce an MD5 hash for cache keying.
   *
   * Normalization: lowercase, strip punctuation, split on whitespace,
   * filter empty, sort alphabetically, join with space, then MD5 hash.
   */
  private normalizeAndHash(message: string): string {
    const normalized = message
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' ');

    return createHash('md5').update(normalized).digest('hex');
  }

  /**
   * Extract unique tool names from a list of scored capabilities.
   *
   * Collects all `provides_tools` arrays, flattens and deduplicates.
   * Used by agent-session to build the filtered tool set.
   */
  getToolNamesFromCapabilities(capabilities: ScoredCapability[]): string[] {
    const toolNames = new Set<string>();
    for (const cap of capabilities) {
      for (const toolName of cap.provides_tools) {
        toolNames.add(toolName);
      }
    }
    return Array.from(toolNames);
  }
}

// ── System Prompt Composition ───────────────────────────────────────────────

/**
 * Compose a per-session system prompt by appending capability-specific
 * instruction sections to a base prompt.
 *
 * For each capability that has `metadata.instructions` (string), a section
 * is appended: `## {capability.name} Instructions\n{instructions}`.
 *
 * This function does NOT enforce token budgets — the caller is responsible
 * for limiting context_cost via the IntentRouter budget cap.
 */
export function composeSystemPrompt(
  basePrompt: string,
  capabilities: CapabilityManifest[],
): string {
  let prompt = basePrompt;

  for (const cap of capabilities) {
    const instructions = cap.metadata?.instructions;
    if (typeof instructions === 'string' && instructions.trim()) {
      prompt += `\n\n## ${cap.name} Instructions\n${instructions}`;
    }
  }

  return prompt;
}
