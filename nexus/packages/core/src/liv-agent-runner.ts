/**
 * LivAgentRunner — wraps SdkAgentRunner via composition (D-05 sacred file rule).
 *
 * Phase 67-02. Bridges the immutable `SdkAgentRunner` event stream to the
 * `RunStore`-persisted chunk format consumed by the SSE endpoint (67-03)
 * and the `useLivAgentStream` hook (67-04).
 *
 * Responsibilities:
 *   - D-14 reasoning extraction: when an assistant message carries Kimi-style
 *     `reasoning_content`, emit a typed `reasoning` chunk BEFORE any text
 *     chunks for that turn.
 *   - D-15 tool snapshot batching: maintain `Map<toolId, ToolCallSnapshot>`
 *     per run; emit running snapshot on assistant `tool_use`, then merge +
 *     re-emit done/error snapshot keyed by the SAME `toolId` when the
 *     matching `tool_result` arrives.
 *   - D-16 computer-use stub: when `categorizeTool(name) === 'computer-use'`,
 *     emit running snapshot AND IMMEDIATELY emit error snapshot with literal
 *     "Computer use not available until P71 (Bytebot integration)" — never
 *     calls into the SDK's actual execution path. Real Bytebot bridge is P71.
 *   - Cooperative stop signal: poll `runStore.getControl(runId)` at the top
 *     of every event handler invocation (Strategy A — every event = 1 iter).
 *     Satisfies ROADMAP P67 success criterion #2 ("stop within 1 iter").
 *
 * SDK event contract (extracted from sdk-agent-runner.ts read on 2026-05-04):
 *   The sacred `SdkAgentRunner` emits high-level `AgentEvent`s on the
 *   `'event'` channel — NO raw `reasoning_content` field, NO `tool_use_id`,
 *   NO Anthropic-style `content` blocks. To surface those (required by D-14
 *   and D-15) without modifying the sacred file, this runner subscribes to
 *   TWO additional event names that an integration layer (built in 67-03 or
 *   a later daemon-wiring step) will emit alongside the existing AgentEvents:
 *
 *     - `'liv:assistant_message'` payload: {
 *         reasoning_content?: string,
 *         content?: Array<
 *             | { type: 'text', text: string }
 *             | { type: 'tool_use', id: string, name: string, input: Record<string, unknown> }
 *         >,
 *       }
 *     - `'liv:tool_result'` payload: {
 *         tool_use_id: string,
 *         content: unknown,
 *         is_error?: boolean,
 *       }
 *
 *   Tests in liv-agent-runner.test.ts script a stub `EventEmitter` with these
 *   exact event names — production wiring will hook the SDK's internal
 *   message stream into the same event names without touching sacred code.
 *   If the SDK runner internals change, update this header comment.
 *
 * SDK lifecycle interaction:
 *   - `start()` invokes `sdkRunner.run(task)` and races it against the stop
 *     signal. The runner does NOT instantiate `SdkAgentRunner` — it accepts
 *     an injected instance per D-13.
 *   - `stop()` writes the 'stop' control signal to RunStore and best-effort
 *     calls `sdkRunner.removeAllListeners?.()`. The runner does NOT depend
 *     on the SDK runner exposing a `stop()` method (defensive `?.`).
 *
 * Sacred-file invariant respected (D-05): only `import type { SdkAgentRunner }`
 * — never a runtime value import. SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`
 * verified at task start AND end.
 */

import type Redis from 'ioredis';
import type { SdkAgentRunner } from './sdk-agent-runner.js';
import type { RunStore } from './run-store.js';
import type { ToolRegistry } from './tool-registry.js';

// ── Types (D-12 verbatim — locked binding contract) ─────────────────────

/**
 * Tool category — drives Tabler icon selection per
 * `livos/packages/ui/src/icons/liv-icons.ts` (P66-04). The 10-string union
 * MUST stay verbatim: P68/P69 dispatcher and 67-04 type mirror both rely on
 * this exact set. `'computer-use'` falls back to the `generic` icon in
 * P68's dispatcher until the icon-map entry is reconciled.
 */
export type ToolCategory =
  | 'browser'
  | 'terminal'
  | 'file'
  | 'fileEdit'
  | 'webSearch'
  | 'webCrawl'
  | 'webScrape'
  | 'mcp'
  | 'computer-use'
  | 'generic';

/**
 * ToolCallSnapshot — D-12 verbatim, 7 fields. `toolResult` is undefined
 * while the tool is running and gets merged in once the matching
 * `tool_result` block arrives (D-15). Consumer-side dedupe keys on `toolId`.
 */
export type ToolCallSnapshot = {
  toolId: string;
  toolName: string;
  category: ToolCategory;
  assistantCall: { input: Record<string, unknown>; ts: number };
  toolResult?: { output: unknown; isError: boolean; ts: number };
  status: 'running' | 'done' | 'error';
  startedAt: number;
  completedAt?: number;
};

/**
 * Constructor options — D-13 verbatim. `contextManagerHook` and
 * `computerUseRouter` are optional hooks for P73 / P71 respectively;
 * P67 calls the hook (best-effort, single token-count estimate at start)
 * but DOES NOT invoke `computerUseRouter` per scope_guard — the D-16
 * stub error is emitted regardless of router presence.
 */
export type LivAgentRunnerOptions = {
  runStore: RunStore;
  sdkRunner: SdkAgentRunner;
  toolRegistry: ToolRegistry;
  redisClient: Redis;
  contextManagerHook?: (tokenCount: number) => Promise<void> | void;
  computerUseRouter?: (
    snapshot: ToolCallSnapshot,
  ) => Promise<{ output: unknown; isError: boolean }>;
};

// ── SDK event payloads (the contract documented in the file header) ──────

type AssistantContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    };

type AssistantMessageEventPayload = {
  reasoning_content?: string;
  content?: AssistantContentBlock[];
};

type ToolResultEventPayload = {
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
};

// ── Event name constants ────────────────────────────────────────────────

const SDK_EVENT_ASSISTANT_MESSAGE = 'liv:assistant_message';
const SDK_EVENT_TOOL_RESULT = 'liv:tool_result';

// ── Tool categorization ─────────────────────────────────────────────────

/**
 * Map tool name → ToolCategory. Pattern coverage matches must-have list:
 *   - browser-* / browser_*           ⇒ 'browser'
 *   - execute-command / terminal-*    ⇒ 'terminal'
 *   - read-file / write-file / etc.   ⇒ 'file'
 *   - str-replace / edit-file         ⇒ 'fileEdit'
 *   - web-search / web_search         ⇒ 'webSearch'
 *   - web-crawl / web_crawl           ⇒ 'webCrawl'
 *   - web-scrape / web_scrape         ⇒ 'webScrape'
 *   - mcp_* / mcp-*                   ⇒ 'mcp'
 *   - computer_use_* / bytebot_*      ⇒ 'computer-use'
 *   - everything else                 ⇒ 'generic'
 *
 * Order matters: computer-use + mcp prefixes are checked BEFORE the
 * generic browser/terminal/file checks so a hypothetical `mcp_browser-foo`
 * is categorized as `mcp`, not `browser`.
 */
export function categorizeTool(toolName: string): ToolCategory {
  if (toolName.startsWith('computer_use_') || toolName.startsWith('bytebot_')) {
    return 'computer-use';
  }
  if (toolName.startsWith('mcp_') || toolName.startsWith('mcp-')) {
    return 'mcp';
  }
  if (toolName.startsWith('browser-') || toolName.startsWith('browser_')) {
    return 'browser';
  }
  if (
    toolName === 'execute-command' ||
    toolName.startsWith('terminal-') ||
    toolName.startsWith('terminal_')
  ) {
    return 'terminal';
  }
  if (
    toolName === 'str-replace' ||
    toolName === 'edit-file' ||
    toolName.startsWith('str_replace') ||
    toolName.startsWith('str-replace')
  ) {
    return 'fileEdit';
  }
  if (
    toolName === 'read-file' ||
    toolName === 'write-file' ||
    toolName === 'list-files' ||
    toolName === 'delete-file' ||
    toolName.startsWith('read_') ||
    toolName.startsWith('write_') ||
    toolName.startsWith('list_files') ||
    toolName.startsWith('delete_')
  ) {
    return 'file';
  }
  if (toolName === 'web-search' || toolName.startsWith('web_search')) {
    return 'webSearch';
  }
  if (toolName === 'web-crawl' || toolName.startsWith('web_crawl')) {
    return 'webCrawl';
  }
  if (toolName === 'web-scrape' || toolName.startsWith('web_scrape')) {
    return 'webScrape';
  }
  return 'generic';
}

// ── LivAgentRunner ──────────────────────────────────────────────────────

/**
 * Orchestrator that wraps an injected `SdkAgentRunner`, translates its
 * raw event stream into typed `RunStore` chunks, and enforces the
 * cooperative stop signal contract.
 *
 * Threading model: single run at a time per instance. The class is
 * stateful (currentRunId + snapshot map + stopRequested flag), so callers
 * MUST construct a fresh instance per run OR await `start()` to fully
 * resolve before invoking it again. P73 (BullMQ) will fan out concurrent
 * runs by spinning up dedicated worker processes, each with its own
 * runner instance — no shared mutable state crosses run boundaries.
 */
export class LivAgentRunner {
  private snapshots = new Map<string, ToolCallSnapshot>();
  private currentRunId: string | null = null;
  private stopRequested = false;
  private finalAssistantText = '';

  constructor(private readonly opts: LivAgentRunnerOptions) {
    // No-op constructor: storing opts only. Per must-have, instantiating
    // does NOT call any method on sdkRunner — the runner is dormant until
    // `start()` is invoked.
  }

  /**
   * Begin a run. Subscribes to the SDK runner's event stream, drives it
   * to completion (or to a stop signal), and persists every chunk to
   * RunStore. Resolves when:
   *   - the SDK runner's `run()` promise resolves naturally, OR
   *   - the stop signal is observed at the top of an event handler, OR
   *   - the SDK runner throws.
   *
   * On natural completion, calls `runStore.markComplete(runId, finalResult)`.
   * On error path, emits a typed `error` chunk AND calls `markError`.
   * On stop, calls `markComplete(runId, { stopped: true })` (chosen over
   * markError because stop is a graceful user-initiated termination, not
   * a failure — documented choice per must-have wording "pick one").
   */
  async start(runId: string, task: string): Promise<void> {
    this.currentRunId = runId;
    this.stopRequested = false;
    this.snapshots.clear();
    this.finalAssistantText = '';

    // Status chunk announces transition to running.
    await this.opts.runStore.appendChunk(runId, {
      type: 'status',
      payload: 'running',
    });

    // contextManagerHook (P73 deferred): single best-effort token-count
    // estimate at start of run. Per scope_guard we do NOT implement
    // 75% summarization — that's P73. Rough heuristic: 1 token ≈ 4 chars.
    if (this.opts.contextManagerHook) {
      const estimatedTokens = Math.ceil(task.length / 4);
      try {
        await this.opts.contextManagerHook(estimatedTokens);
      } catch {
        // Hook errors are non-fatal — the runner proceeds without
        // context management. P73 will tighten this to fail-closed.
      }
    }

    // Wire SDK event listeners.
    //
    // EventEmitter.emit() is synchronous and ignores returned Promises, so
    // we must track in-flight async handler invocations ourselves and await
    // them before finalizing the run. Otherwise markComplete would fire
    // while the last assistant message's chunks are still being written.
    const inFlight = new Set<Promise<void>>();
    const track = (p: Promise<void>): void => {
      inFlight.add(p);
      p.finally(() => inFlight.delete(p)).catch(() => {});
    };

    const onAssistantMessage = (msg: AssistantMessageEventPayload): void => {
      track(this.handleAssistantMessage(runId, msg));
    };
    const onToolResult = (result: ToolResultEventPayload): void => {
      track(this.handleToolResult(runId, result));
    };

    this.opts.sdkRunner.on(SDK_EVENT_ASSISTANT_MESSAGE, onAssistantMessage);
    this.opts.sdkRunner.on(SDK_EVENT_TOOL_RESULT, onToolResult);

    let stopFinalized = false;
    try {
      await this.opts.sdkRunner.run(task);
      // Drain any handler invocations that the SDK fired during run().
      // Re-scan inFlight after each settle in case a handler chain queued
      // additional follow-up work.
      while (inFlight.size > 0) {
        await Promise.allSettled(Array.from(inFlight));
      }

      // Natural completion path. If stop fired during run(), the handlers
      // already short-circuited — but mark-complete-once still applies.
      if (this.stopRequested) {
        await this.opts.runStore.markComplete(runId, { stopped: true });
        stopFinalized = true;
      } else {
        const finalResult: unknown = this.finalAssistantText
          ? { answer: this.finalAssistantText }
          : {};
        await this.opts.runStore.markComplete(runId, finalResult);
      }
    } catch (err) {
      const error = err as Error;
      // Emit typed error chunk so subscribers see it in the live stream.
      await this.opts.runStore.appendChunk(runId, {
        type: 'error',
        payload: { message: error.message },
      });
      await this.opts.runStore.markError(runId, {
        message: error.message,
        stack: error.stack,
      });
      stopFinalized = true;
    } finally {
      // If stop fired but run() returned synchronously (e.g. stub didn't
      // hand control back), finalize stop here so markComplete is called
      // exactly once per the must-have contract.
      if (this.stopRequested && !stopFinalized) {
        try {
          await this.opts.runStore.markComplete(runId, { stopped: true });
        } catch {
          // Ignore — stop bookkeeping is best-effort.
        }
      }

      // Best-effort SDK runner cleanup. Both methods are guarded with
      // optional-chaining + `as any` so a stub or future SDK that lacks
      // them does not throw.
      try {
        this.opts.sdkRunner.off?.(SDK_EVENT_ASSISTANT_MESSAGE, onAssistantMessage);
        this.opts.sdkRunner.off?.(SDK_EVENT_TOOL_RESULT, onToolResult);
      } catch {
        /* swallow listener-cleanup errors */
      }
      this.currentRunId = null;
    }
  }

  /**
   * Request a graceful stop. Writes 'stop' to the RunStore control key
   * and flips the local flag. Returns immediately — does NOT wait for
   * the runner loop to actually terminate (must-have).
   */
  async stop(runId: string): Promise<void> {
    await this.opts.runStore.setControl(runId, 'stop');
    this.stopRequested = true;
    // Best-effort: nudge the SDK runner to bail. If sdkRunner exposes
    // `removeAllListeners` (EventEmitter standard), strip its handlers
    // so any further emissions are no-ops. P71 will replace this with
    // a real abort signal once the SDK exposes one.
    try {
      (this.opts.sdkRunner as unknown as {
        removeAllListeners?: () => void;
      }).removeAllListeners?.();
    } catch {
      /* swallow */
    }
  }

  /**
   * Handle an assistant message from the SDK. Order of emission per
   * must-have (D-14):
   *   1. If `reasoning_content` is non-empty ⇒ emit `reasoning` chunk.
   *   2. For each block in `content`:
   *      - `text` ⇒ emit `text` chunk.
   *      - `tool_use` ⇒ open a tool snapshot (running) + maybe stub.
   */
  private async handleAssistantMessage(
    runId: string,
    msg: AssistantMessageEventPayload,
  ): Promise<void> {
    if (await this.checkStop(runId)) return;

    if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.length > 0) {
      await this.opts.runStore.appendChunk(runId, {
        type: 'reasoning',
        payload: msg.reasoning_content,
      });
    }

    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (await this.checkStop(runId)) return;

        if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
          this.finalAssistantText = block.text;
          await this.opts.runStore.appendChunk(runId, {
            type: 'text',
            payload: block.text,
          });
        } else if (block.type === 'tool_use') {
          await this.openToolSnapshot(runId, block);
        }
      }
    }
  }

  /**
   * Handle a tool_result block from the SDK. Merges into the existing
   * snapshot keyed by `tool_use_id`; orphan results (no matching open
   * snapshot) are dropped. Computer-use tools: the stub error already
   * fired on tool_use, so a late-arriving real tool_result is overwritten
   * by the stub — semantically correct for D-16.
   */
  private async handleToolResult(
    runId: string,
    result: ToolResultEventPayload,
  ): Promise<void> {
    if (await this.checkStop(runId)) return;

    const existing = this.snapshots.get(result.tool_use_id);
    if (!existing) {
      // Orphan tool_result — log and skip (T-67-02-05 accept-disposition).
      return;
    }

    // If we already finalized the snapshot via the computer-use stub,
    // skip — the stub error stands per D-16.
    if (existing.status !== 'running') return;

    const isError = result.is_error ?? false;
    const merged: ToolCallSnapshot = {
      ...existing,
      toolResult: {
        output: result.content,
        isError,
        ts: Date.now(),
      },
      status: isError ? 'error' : 'done',
      completedAt: Date.now(),
    };
    this.snapshots.set(result.tool_use_id, merged);

    await this.opts.runStore.appendChunk(runId, {
      type: 'tool_snapshot',
      payload: merged,
    });
  }

  /**
   * Open a fresh tool snapshot (status 'running'), emit it, and apply
   * the D-16 computer-use stub if applicable.
   */
  private async openToolSnapshot(
    runId: string,
    block: { id: string; name: string; input: Record<string, unknown> },
  ): Promise<void> {
    const category = categorizeTool(block.name);
    const startedAt = Date.now();

    const snapshot: ToolCallSnapshot = {
      toolId: block.id,
      toolName: block.name,
      category,
      assistantCall: { input: block.input, ts: startedAt },
      status: 'running',
      startedAt,
    };
    this.snapshots.set(block.id, snapshot);

    await this.opts.runStore.appendChunk(runId, {
      type: 'tool_snapshot',
      payload: snapshot,
    });

    // D-16 computer-use stub — emit error snapshot IMMEDIATELY and do
    // NOT call into any execution path. The literal "Computer use not
    // available until P71" string is asserted by the test suite and by
    // greppable contract.
    //
    // P71 will replace this stub-emission with:
    //   const result = await this.opts.computerUseRouter?.(snapshot);
    //   ...emit merged snapshot with result...
    if (category === 'computer-use') {
      // Use console.warn (logger import would create a side-effect cycle
      // for tests; the warning is a one-off operator hint, not load-bearing).
      console.warn(
        `[LivAgentRunner] computer-use tool "${block.name}" stubbed until P71 (Bytebot integration)`,
      );

      const stubbed: ToolCallSnapshot = {
        ...snapshot,
        toolResult: {
          output: 'Computer use not available until P71 (Bytebot integration)',
          isError: true,
          ts: Date.now(),
        },
        status: 'error',
        completedAt: Date.now(),
      };
      this.snapshots.set(block.id, stubbed);

      await this.opts.runStore.appendChunk(runId, {
        type: 'tool_snapshot',
        payload: stubbed,
      });
    }
  }

  /**
   * Cooperative-stop polling tick (Strategy A — every event = 1 iteration).
   * Returns true if the runner should bail out of the current handler.
   * On first observation of the stop signal, performs the bail-out
   * bookkeeping: sets local flag, removes SDK listeners.
   */
  private async checkStop(runId: string): Promise<boolean> {
    if (this.stopRequested) return true;

    const signal = await this.opts.runStore.getControl(runId);
    if (signal === 'stop') {
      this.stopRequested = true;
      // Strip SDK listeners so any further emissions during this run
      // become no-ops. The SDK runner's own `run()` may continue until
      // its next message, but our event handlers stop translating.
      try {
        (this.opts.sdkRunner as unknown as {
          removeAllListeners?: () => void;
        }).removeAllListeners?.();
      } catch {
        /* swallow */
      }
      return true;
    }

    return false;
  }
}
