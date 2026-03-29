/**
 * Learning Engine
 *
 * Logs tool call executions to a Redis stream, mines co-occurrence patterns
 * across sessions, and provides proactive capability suggestions based on
 * usage patterns.
 *
 * Redis stream key: nexus:tool_calls (XADD with ~10000 max length)
 */

import type Redis from 'ioredis';
import type { CapabilityManifest } from './capability-registry.js';
import { logger } from './logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ToolCallEntry {
  tool: string;
  success: boolean;
  duration_ms: number;
  session_id: string;
  type?: string;
}

export interface CoOccurrence {
  toolA: string;
  toolB: string;
  count: number;
}

export interface ToolSuggestion {
  capability: CapabilityManifest;
  reason: string;
  confidence: number;
}

export interface ToolStats {
  tool: string;
  totalCalls: number;
  successRate: number;
  avgDuration: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STREAM_KEY = 'nexus:tool_calls';
const STREAM_MAX_LEN = 10000;
const XRANGE_READ_COUNT = 5000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SUGGESTIONS = 3;
const SUGGESTION_CONFIDENCE = 0.25;
const TOP_CO_OCCURRENCES = 20;

// ── LearningEngine ──────────────────────────────────────────────────────────

export class LearningEngine {
  private redis: Redis;

  // Cached analysis results with TTL
  private cachedCoOccurrences: CoOccurrence[] | null = null;
  private cachedToolStats: ToolStats[] | null = null;
  private cacheTimestamp = 0;

  constructor(opts: { redis: Redis }) {
    this.redis = opts.redis;
  }

  // ── Logging ─────────────────────────────────────────────────────────────────

  /**
   * Log a tool call execution to the Redis stream.
   * Fire-and-forget: errors are caught and logged, never thrown.
   */
  logToolCall(entry: ToolCallEntry): void {
    try {
      // XADD with approximate trimming to keep stream bounded
      this.redis
        .xadd(
          STREAM_KEY,
          'MAXLEN',
          '~',
          String(STREAM_MAX_LEN),
          '*',
          'tool', entry.tool,
          'success', entry.success ? '1' : '0',
          'duration', String(entry.duration_ms),
          'session', entry.session_id,
          'type', entry.type || '',
          'timestamp', String(Date.now()),
        )
        .catch((err: Error) => {
          logger.warn('LearningEngine: XADD failed', { error: err.message });
        });
    } catch (err: any) {
      logger.warn('LearningEngine: logToolCall error', { error: err.message });
    }
  }

  // ── Co-occurrence Mining ─────────────────────────────────────────────────────

  /**
   * Analyze recent tool call stream entries and return the top co-occurring
   * tool pairs across sessions.
   *
   * Results are cached for 5 minutes to avoid repeated XRANGE scans.
   */
  async getCoOccurrences(): Promise<CoOccurrence[]> {
    // Return cached result if still valid
    if (this.cachedCoOccurrences && Date.now() - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cachedCoOccurrences;
    }

    await this.refreshCache();
    return this.cachedCoOccurrences || [];
  }

  // ── Suggestions ──────────────────────────────────────────────────────────────

  /**
   * Given the current set of tool names in a session and all available
   * capabilities, suggest commonly co-used capabilities not yet selected.
   *
   * Returns up to 3 suggestions with confidence 0.25.
   */
  async getSuggestions(
    currentToolNames: string[],
    allCapabilities: CapabilityManifest[],
  ): Promise<ToolSuggestion[]> {
    const coOccurrences = await this.getCoOccurrences();
    if (coOccurrences.length === 0) return [];

    const currentSet = new Set(currentToolNames);
    const suggestedTools = new Map<string, string>(); // tool -> reason

    // For each current tool, find co-occurring tools not already selected
    for (const toolName of currentToolNames) {
      for (const co of coOccurrences) {
        let partner: string | null = null;
        if (co.toolA === toolName && !currentSet.has(co.toolB)) {
          partner = co.toolB;
        } else if (co.toolB === toolName && !currentSet.has(co.toolA)) {
          partner = co.toolA;
        }
        if (partner && !suggestedTools.has(partner)) {
          suggestedTools.set(partner, `commonly used with ${toolName}`);
        }
      }
    }

    if (suggestedTools.size === 0) return [];

    // Map suggested tool names back to capabilities via provides_tools
    const suggestions: ToolSuggestion[] = [];
    const seenCapIds = new Set<string>();

    for (const [tool, reason] of suggestedTools) {
      if (suggestions.length >= MAX_SUGGESTIONS) break;

      const cap = allCapabilities.find(
        (c) => c.provides_tools.includes(tool) && !seenCapIds.has(c.id),
      );
      if (cap) {
        seenCapIds.add(cap.id);
        suggestions.push({
          capability: cap,
          reason,
          confidence: SUGGESTION_CONFIDENCE,
        });
      }
    }

    return suggestions;
  }

  // ── Tool Stats ──────────────────────────────────────────────────────────────

  /**
   * Aggregate per-tool statistics from the stream: total calls, success rate,
   * average duration.
   *
   * Uses the same 5-minute cache as getCoOccurrences.
   */
  async getToolStats(): Promise<ToolStats[]> {
    // Return cached result if still valid
    if (this.cachedToolStats && Date.now() - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cachedToolStats;
    }

    await this.refreshCache();
    return this.cachedToolStats || [];
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Read recent stream entries and compute both co-occurrences and tool stats
   * in a single pass. Updates cache timestamp.
   */
  private async refreshCache(): Promise<void> {
    try {
      // Read last N entries from the stream
      const entries = await this.redis.xrange(
        STREAM_KEY,
        '-',
        '+',
        'COUNT',
        XRANGE_READ_COUNT,
      );

      // Parse entries into structured data
      interface ParsedEntry {
        tool: string;
        success: boolean;
        duration: number;
        session: string;
      }

      const parsed: ParsedEntry[] = [];
      for (const [, fields] of entries) {
        const record: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          record[fields[i]] = fields[i + 1];
        }
        parsed.push({
          tool: record.tool || '',
          success: record.success === '1',
          duration: parseInt(record.duration || '0', 10),
          session: record.session || '',
        });
      }

      // ── Compute co-occurrences ──
      // Group by session
      const sessionTools = new Map<string, Set<string>>();
      for (const entry of parsed) {
        if (!entry.session || !entry.tool) continue;
        let toolSet = sessionTools.get(entry.session);
        if (!toolSet) {
          toolSet = new Set();
          sessionTools.set(entry.session, toolSet);
        }
        toolSet.add(entry.tool);
      }

      // Build co-occurrence counts
      const pairCounts = new Map<string, number>();
      for (const [, tools] of sessionTools) {
        const toolArr = Array.from(tools).sort();
        for (let i = 0; i < toolArr.length; i++) {
          for (let j = i + 1; j < toolArr.length; j++) {
            const key = `${toolArr[i]}||${toolArr[j]}`;
            pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
          }
        }
      }

      // Sort by count descending, take top N
      const coOccurrences: CoOccurrence[] = Array.from(pairCounts.entries())
        .map(([key, count]) => {
          const [toolA, toolB] = key.split('||');
          return { toolA, toolB, count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_CO_OCCURRENCES);

      // ── Compute tool stats ──
      const statsMap = new Map<string, { total: number; success: number; totalDuration: number }>();
      for (const entry of parsed) {
        if (!entry.tool) continue;
        let stat = statsMap.get(entry.tool);
        if (!stat) {
          stat = { total: 0, success: 0, totalDuration: 0 };
          statsMap.set(entry.tool, stat);
        }
        stat.total++;
        if (entry.success) stat.success++;
        stat.totalDuration += entry.duration;
      }

      const toolStats: ToolStats[] = Array.from(statsMap.entries())
        .map(([tool, stat]) => ({
          tool,
          totalCalls: stat.total,
          successRate: stat.total > 0 ? stat.success / stat.total : 0,
          avgDuration: stat.total > 0 ? Math.round(stat.totalDuration / stat.total) : 0,
        }))
        .sort((a, b) => b.totalCalls - a.totalCalls);

      // Update cache
      this.cachedCoOccurrences = coOccurrences;
      this.cachedToolStats = toolStats;
      this.cacheTimestamp = Date.now();
    } catch (err: any) {
      logger.warn('LearningEngine: cache refresh failed', { error: err.message });
      // Return empty on error rather than stale data
      this.cachedCoOccurrences = [];
      this.cachedToolStats = [];
      this.cacheTimestamp = Date.now();
    }
  }
}
