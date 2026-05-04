/**
 * ContextManager — Kimi-for-coding window overflow protection. Phase 73-01.
 *
 * Naive truncate-oldest summarization at 75% threshold (CONTEXT D-09..D-12).
 * Real LLM-summarization is a deferred backlog item (D-13) — the
 * `summarizationStrategy` parameter exists so future versions can plug in
 * `'kimi-summary'` / `'claude-haiku-summary'` etc. without breaking the
 * constructor surface. Only `'truncate-oldest'` has an implementation in
 * v31; other strategies throw `Error('summarization strategy <X> not
 * implemented in v31')`.
 *
 * Persistence: post-summary history is JSON.stringified to Redis key
 * `liv:agent_run:{runId}:summary_checkpoint` with 24h TTL — matches
 * RunStore D-04 / D-10 conventions and v31-DRAFT line 697.
 *
 * Token counting: simple heuristic — `1 token ≈ 4 chars` over JSON.stringify
 * of the entire history (CONTEXT D-11). NO real tokenizer dependency, no
 * per-model bytes-per-token table. The 4-chars-per-token ratio is the
 * conservative side (real-world English is closer to 4.5/token), so the
 * heuristic over-counts slightly — preferable to under-counting and
 * overflowing the Kimi window.
 *
 * Sacred-file invariant respected (CONTEXT D-05): only type imports from
 * RunStore — held in opts but unused in v31. Runner factory passes its
 * RunStore instance for future side effects (e.g. recording summarization
 * events as chunks in P75+).
 *
 * Phase 73 prereq for: 73-03 (LivAgentRunner integration — modifies
 * runner's per-iteration hook to call `checkAndMaybeSummarize`).
 */

import type Redis from 'ioredis';
import type { RunStore } from './run-store.js';

// ── Types ────────────────────────────────────────────────────────

/**
 * Anthropic-style message shape — minimal subset matching what
 * LivAgentRunner emits and what truncate-oldest needs to reason about.
 *
 * Note: `liv-agent-runner.ts` does NOT export a `Message` type — it has
 * `AssistantContentBlock` and `AssistantMessageEventPayload` that are
 * narrower (assistant-only) and intentionally not public. We define a
 * broader, role-bearing `Message` here so ContextManager's surface stays
 * decoupled from the runner's internal event payload contract. This
 * choice is documented in the SUMMARY.
 */
export type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | {
            type: 'tool_use';
            id: string;
            name: string;
            input: Record<string, unknown>;
          }
        | {
            type: 'tool_result';
            tool_use_id: string;
            content: unknown;
            is_error?: boolean;
          }
      >;
  /** Kimi-specific reasoning content (P67-02 D-14). */
  reasoning_content?: string;
};

/**
 * Summarization strategy union. Only `'truncate-oldest'` has an
 * implementation in v31 (CONTEXT D-13). Other strategies throw.
 *
 * The `(string & {})` branch keeps the union open for future strategies
 * without requiring a type-system change at consumers.
 */
export type SummarizationStrategy =
  | 'truncate-oldest'
  | 'kimi-summary'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

export type ContextManagerOptions = {
  runStore: RunStore;
  redisClient: Redis;
  /** Default 200_000 (Kimi-for-coding window per CONTEXT D-09). */
  kimiContextWindow?: number;
  /** Default 0.75 (per CONTEXT D-09 + v31-DRAFT 9.1). */
  thresholdRatio?: number;
  /** Default `'truncate-oldest'` (the naive default; CONTEXT D-09). */
  summarizationStrategy?: SummarizationStrategy;
};

// ── Constants ────────────────────────────────────────────────────

// 24h TTL (86400 seconds) matches RunStore D-10 / D-04. Literal kept
// alongside the computed form for greppability against the plan
// must-have shape check.
const TTL_SECONDS = 86400; // 24 * 60 * 60
const KEY_PREFIX = 'liv:agent_run';
const summaryCheckpointKey = (runId: string): string =>
  `${KEY_PREFIX}:${runId}:summary_checkpoint`;

/** How many tail messages to preserve (CONTEXT D-12 step 1). */
const PRESERVE_TAIL_COUNT = 10;

/** Max chars from first dropped user message to embed in synthetic summary. */
const LAST_TOPIC_MAX_CHARS = 200;

// ── Public helpers ───────────────────────────────────────────────

/**
 * Token-count heuristic: `Math.ceil(JSON.stringify(history).length / 4)`.
 * Matches CONTEXT D-11 verbatim. Exported for tests + downstream callers
 * that want to display token counts in UI without re-implementing.
 */
export function countTokens(history: Message[]): number {
  return Math.ceil(JSON.stringify(history).length / 4);
}

// ── Internal helpers ─────────────────────────────────────────────

function isSystem(m: Message): boolean {
  return m.role === 'system';
}

/**
 * Sanitize user-provided text before embedding in the synthetic system
 * message (T-73-01-01 mitigation): a malicious or unlucky user message
 * containing `</context_summary>` would close the synthetic block early
 * and inject content into the surrounding system prompt scope. Strip
 * angle brackets defensively.
 */
function sanitizeForSummaryEmbed(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Extract the textual content of a message for the "Last topic:" snippet.
 * Returns '' if the message has no text content (e.g. tool_use only).
 */
function messageTextSnippet(m: Message): string {
  if (typeof m.content === 'string') return m.content;
  if (Array.isArray(m.content)) {
    const block = m.content.find((b) => b.type === 'text') as
      | { type: 'text'; text: string }
      | undefined;
    return block?.text ?? '';
  }
  return '';
}

/**
 * Collect tool-call IDs referenced by content blocks in `messages`.
 * Returns the union of all `tool_use.id` and `tool_result.tool_use_id`.
 */
function collectToolIds(messages: Message[]): Set<string> {
  const out = new Set<string>();
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (block.type === 'tool_use') out.add(block.id);
        else if (block.type === 'tool_result') out.add(block.tool_use_id);
      }
    }
  }
  return out;
}

/**
 * Test whether a message references any of the `preservedToolIds` via a
 * tool_use or tool_result block. Used to pull tool_results from the
 * "discarded middle" whose matching tool_use survives in the last-N tail
 * (and vice versa) — best-effort tool-pair preservation per the plan
 * behavior spec.
 */
function messageReferencesToolId(m: Message, preservedToolIds: Set<string>): boolean {
  if (!Array.isArray(m.content)) return false;
  for (const block of m.content) {
    if (block.type === 'tool_use' && preservedToolIds.has(block.id)) return true;
    if (block.type === 'tool_result' && preservedToolIds.has(block.tool_use_id)) {
      return true;
    }
  }
  return false;
}

/**
 * Naive truncate-oldest implementation per CONTEXT D-12 verbatim 4-step:
 *
 *   1. Preserve: ALL system messages, the LAST 10 messages regardless of
 *      role, AND any tool_result whose matching tool_use is preserved
 *      (and vice versa for tool_use).
 *   2. Discard: everything else (the "old middle").
 *   3. Inject ONE synthetic system message at index 1 (right after the
 *      original first system prompt). If no original system prompt is
 *      present, prepend at index 0.
 *   4. (Persistence handled by caller.)
 *
 * Algorithm refinement note: middles are computed as
 *   `history.filter(m => !isSystem(m) && !last10.includes(m))`
 * — works regardless of where systems sit in the history (D-12 doesn't
 * require systems-only-at-start). This is the broader interpretation
 * mentioned in the plan's "Algorithm refinement note".
 */
function truncateOldest(history: Message[]): Message[] {
  const systems = history.filter(isSystem);
  const last10 = history.slice(-PRESERVE_TAIL_COUNT);
  const last10Set = new Set(last10);

  // The "middle" = everything that is NOT a system AND NOT in the last-10 tail.
  const middle = history.filter((m) => !isSystem(m) && !last10Set.has(m));

  // Tool-pair preservation (best-effort): if last10 contains a tool_use whose
  // tool_result lives in the middle, pull the tool_result back; same for the
  // reverse direction. We compute this via a single pass over `middle`,
  // checking against the union of last10's tool ids.
  const last10ToolIds = collectToolIds(last10);
  const pulledFromMiddle: Message[] = [];
  if (last10ToolIds.size > 0) {
    for (const m of middle) {
      if (messageReferencesToolId(m, last10ToolIds)) {
        pulledFromMiddle.push(m);
      }
    }
  }

  // Find the first dropped user message text for the "Last topic:" snippet.
  // The "first dropped" is the first message in `middle` that is NOT also
  // being pulled back into preserved.
  const pulledSet = new Set(pulledFromMiddle);
  let firstDroppedUserText = '';
  for (const m of middle) {
    if (pulledSet.has(m)) continue;
    if (m.role !== 'user') continue;
    const text = messageTextSnippet(m);
    if (text) {
      firstDroppedUserText = sanitizeForSummaryEmbed(text.slice(0, LAST_TOPIC_MAX_CHARS));
      break;
    }
  }

  const droppedCount = middle.length - pulledFromMiddle.length;
  const synthetic: Message = {
    role: 'system',
    content: `<context_summary>Earlier conversation truncated to fit context window. ${droppedCount} messages elided. Last topic: ${firstDroppedUserText}</context_summary>`,
  };

  // Reconstruct: original-first-system, synthetic, remaining-systems,
  // pulled-from-middle (in original order), last10 tail.
  // If there's no original system prompt, prepend synthetic at index 0.
  const out: Message[] = [];
  if (systems.length > 0) {
    out.push(systems[0]);
    out.push(synthetic);
    for (let i = 1; i < systems.length; i++) out.push(systems[i]);
  } else {
    out.push(synthetic);
  }
  for (const m of pulledFromMiddle) out.push(m);
  for (const m of last10) out.push(m);

  return out;
}

// ── Class ────────────────────────────────────────────────────────

class ContextManager {
  private readonly window: number;
  private readonly threshold: number;
  private readonly strategy: SummarizationStrategy;

  constructor(private readonly opts: ContextManagerOptions) {
    this.window = opts.kimiContextWindow ?? 200_000;
    this.threshold = opts.thresholdRatio ?? 0.75;
    this.strategy = opts.summarizationStrategy ?? 'truncate-oldest';
    // No Redis calls in constructor — surface is fully lazy.
  }

  /**
   * Decide whether to summarize, and if so, do it. Called per-iteration by
   * `LivAgentRunner` (Plan 73-03). Returns the (possibly new) history
   * along with token counts before/after for telemetry.
   *
   * Behavior:
   *   - If `tokenCountBefore < window * threshold`: return same reference,
   *     `summarized: false`. Zero side effects.
   *   - If history is shorter than the preservation window
   *     (`length <= PRESERVE_TAIL_COUNT + systemCount`): same as above —
   *     short fast path, nothing to elide.
   *   - Else: run the configured summarization strategy. Persist the
   *     resulting history to `liv:agent_run:{runId}:summary_checkpoint`
   *     with 24h TTL. Recompute tokenCount on the new history.
   */
  async checkAndMaybeSummarize(
    runId: string,
    conversationHistory: Message[],
  ): Promise<{
    summarized: boolean;
    newHistory: Message[];
    tokenCountBefore: number;
    tokenCountAfter: number;
  }> {
    const tokenCountBefore = countTokens(conversationHistory);
    const limit = Math.floor(this.window * this.threshold);

    // Fast path 1: under threshold — return same reference.
    if (tokenCountBefore < limit) {
      return {
        summarized: false,
        newHistory: conversationHistory,
        tokenCountBefore,
        tokenCountAfter: tokenCountBefore,
      };
    }

    // Fast path 2: short history — nothing meaningful to elide. Even if
    // the byte budget is huge (a single 1-MB user message), summarization
    // can't help because there's no "old middle" to discard.
    const systemCount = conversationHistory.filter(isSystem).length;
    if (conversationHistory.length <= PRESERVE_TAIL_COUNT + systemCount) {
      return {
        summarized: false,
        newHistory: conversationHistory,
        tokenCountBefore,
        tokenCountAfter: tokenCountBefore,
      };
    }

    // Strategy guard — only `'truncate-oldest'` is implemented in v31.
    if (this.strategy !== 'truncate-oldest') {
      throw new Error(
        `summarization strategy ${this.strategy} not implemented in v31`,
      );
    }

    const newHistory = truncateOldest(conversationHistory);
    const tokenCountAfter = countTokens(newHistory);

    // Persist the post-summary history JSON-stringified — replay buffer
    // for clients that reconnect mid-run via SSE.
    await this.opts.redisClient.set(
      summaryCheckpointKey(runId),
      JSON.stringify(newHistory),
      'EX',
      TTL_SECONDS,
    );

    return {
      summarized: true,
      newHistory,
      tokenCountBefore,
      tokenCountAfter,
    };
  }
}

// ── Public exports ───────────────────────────────────────────────
// Explicit `export { ... }` form for greppability + downstream barrel
// re-exports. Mirrors run-store.ts's pattern (P67-01).
export { ContextManager };

