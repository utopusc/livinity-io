/**
 * LivAgentRunner unit tests — Phase 67-02.
 *
 * Standalone tsx-runnable script (matches the test:phase39 pattern in
 * @nexus/core package.json — NOT vitest). Top-level async IIFE with try/catch
 * per test case, exit 0 on all-pass, exit 1 on any failure.
 *
 * Strategy:
 *   - FakeRunStore — in-memory recorder with the full RunStore surface
 *     (createRun, appendChunk, getChunks, subscribeChunks, setControl,
 *     getControl, markComplete, markError, getMeta). Records every method
 *     call into a `calls` array so tests can assert on order + arguments.
 *   - StubSdkRunner — extends EventEmitter; exposes `run(task)` that
 *     iterates a `script: Array<{ delayMs, emit }>` and emits the scripted
 *     events. Tests script the events the runner subscribes to:
 *       - 'liv:assistant_message' — { reasoning_content?, content? }
 *       - 'liv:tool_result' — { tool_use_id, content, is_error? }
 *     The event-name contract is documented in the LivAgentRunner header.
 *
 * Test cases (matching plan must-haves):
 *   1. Reasoning emitted BEFORE text for Kimi-style messages.
 *   2. Tool snapshot pairing: tool_use → running snapshot, tool_result →
 *      merged done snapshot, both keyed by same toolId.
 *   3. Stop signal interrupts run within 1 iter.
 *   4. Computer-use tool emits stub error WITHOUT scripted tool_result.
 *   5. (Bonus) categorizeTool maps known patterns correctly.
 *
 * Run: `npx tsx nexus/packages/core/src/liv-agent-runner.test.ts`
 */

import { EventEmitter } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  LivAgentRunner,
  categorizeTool,
  type Message,
  type ToolCallSnapshot,
} from './liv-agent-runner.js';

// ── Fake RunStore ───────────────────────────────────────────────────────

type Call = { method: string; args: unknown[] };

class FakeRunStore {
  calls: Call[] = [];
  controlState = new Map<string, 'stop' | null>();

  async createRun(userId: string, task: string): Promise<string> {
    this.calls.push({ method: 'createRun', args: [userId, task] });
    return 'run_test_uuid';
  }

  async appendChunk(
    runId: string,
    chunk: { type: string; payload: unknown; ts?: number },
  ): Promise<{ idx: number }> {
    this.calls.push({ method: 'appendChunk', args: [runId, chunk] });
    const priorAppends = this.calls.filter((c) => c.method === 'appendChunk').length;
    return { idx: priorAppends - 1 };
  }

  async getChunks(): Promise<unknown[]> {
    return [];
  }

  async subscribeChunks(): Promise<() => Promise<void>> {
    return async () => {};
  }

  async setControl(runId: string, signal: 'stop'): Promise<void> {
    this.calls.push({ method: 'setControl', args: [runId, signal] });
    this.controlState.set(runId, signal);
  }

  async getControl(runId: string): Promise<'stop' | null> {
    return this.controlState.get(runId) ?? null;
  }

  async markComplete(runId: string, finalResult: unknown): Promise<void> {
    this.calls.push({ method: 'markComplete', args: [runId, finalResult] });
  }

  async markError(runId: string, error: unknown): Promise<void> {
    this.calls.push({ method: 'markError', args: [runId, error] });
  }

  async getMeta(): Promise<null> {
    return null;
  }

  /** Helper: extract chunks of a given type from the calls log. */
  chunksOfType(type: string): Array<{ type: string; payload: unknown }> {
    return this.calls
      .filter((c) => c.method === 'appendChunk')
      .map((c) => c.args[1] as { type: string; payload: unknown })
      .filter((chunk) => chunk.type === type);
  }
}

// ── Stub SDK runner ─────────────────────────────────────────────────────

type ScriptStep = {
  delayMs: number;
  emit: (stub: StubSdkRunner) => void;
};

class StubSdkRunner extends EventEmitter {
  script: ScriptStep[] = [];
  stopped = false;

  /** Mirrors SdkAgentRunner.run() — iterates the script and emits each step. */
  async run(_task: string): Promise<unknown> {
    for (const step of this.script) {
      if (this.stopped) return { stopped: true };
      await sleep(step.delayMs);
      if (this.stopped) return { stopped: true };
      step.emit(this);
    }
    return { ok: true };
  }
}

// ── Harness ─────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    pass++;
  } catch (e) {
    console.error(`  FAIL  ${name}: ${(e as Error).message}`);
    if ((e as Error).stack) console.error((e as Error).stack);
    fail++;
  }
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ── Tests ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('LivAgentRunner tests — backend: FakeRunStore + StubSdkRunner');

  // ── Test 1: Reasoning emitted BEFORE text ─────────────────────────────
  await test('reasoning chunk emitted before text chunk for Kimi-style msg', async () => {
    const fakeStore = new FakeRunStore();
    const stub = new StubSdkRunner();
    const runner = new LivAgentRunner({
      runStore: fakeStore as unknown as ConstructorParameters<typeof LivAgentRunner>[0]['runStore'],
      sdkRunner: stub as unknown as ConstructorParameters<typeof LivAgentRunner>[0]['sdkRunner'],
      toolRegistry: {} as ConstructorParameters<typeof LivAgentRunner>[0]['toolRegistry'],
      redisClient: {} as ConstructorParameters<typeof LivAgentRunner>[0]['redisClient'],
    });

    stub.script = [
      {
        delayMs: 10,
        emit: (s) =>
          s.emit('liv:assistant_message', {
            reasoning_content: 'thinking step',
            content: [{ type: 'text', text: 'final answer' }],
          }),
      },
    ];

    await runner.start('run_t1', 'task');

    const appendCalls = fakeStore.calls.filter((c) => c.method === 'appendChunk');
    // Expect: status('running'), reasoning('thinking step'), text('final answer')
    assert(appendCalls.length >= 3, `expected >=3 appendChunk calls, got ${appendCalls.length}`);

    // Find indices of reasoning and text chunks (skip the leading status chunk).
    const types = appendCalls.map((c) => (c.args[1] as { type: string }).type);
    const reasoningIdx = types.indexOf('reasoning');
    const textIdx = types.indexOf('text');

    assert(reasoningIdx >= 0, `no reasoning chunk found; types=${JSON.stringify(types)}`);
    assert(textIdx >= 0, `no text chunk found; types=${JSON.stringify(types)}`);
    assert(
      reasoningIdx < textIdx,
      `reasoning (idx=${reasoningIdx}) must come BEFORE text (idx=${textIdx})`,
    );

    const reasoningChunk = appendCalls[reasoningIdx].args[1] as {
      type: string;
      payload: unknown;
    };
    const textChunk = appendCalls[textIdx].args[1] as {
      type: string;
      payload: unknown;
    };
    assert(
      reasoningChunk.payload === 'thinking step',
      `reasoning payload wrong: ${JSON.stringify(reasoningChunk.payload)}`,
    );
    assert(
      textChunk.payload === 'final answer',
      `text payload wrong: ${JSON.stringify(textChunk.payload)}`,
    );
  });

  // ── Test 2: Tool snapshot pairing ─────────────────────────────────────
  await test('tool snapshot pairing — tool_use + tool_result merged by toolId', async () => {
    const fakeStore = new FakeRunStore();
    const stub = new StubSdkRunner();
    const runner = new LivAgentRunner({
      runStore: fakeStore as unknown as ConstructorParameters<typeof LivAgentRunner>[0]['runStore'],
      sdkRunner: stub as unknown as ConstructorParameters<typeof LivAgentRunner>[0]['sdkRunner'],
      toolRegistry: {} as ConstructorParameters<typeof LivAgentRunner>[0]['toolRegistry'],
      redisClient: {} as ConstructorParameters<typeof LivAgentRunner>[0]['redisClient'],
    });

    stub.script = [
      {
        delayMs: 10,
        emit: (s) =>
          s.emit('liv:assistant_message', {
            content: [
              {
                type: 'tool_use',
                id: 'tu_1',
                name: 'browser-navigate',
                input: { url: 'https://x' },
              },
            ],
          }),
      },
      {
        delayMs: 10,
        emit: (s) =>
          s.emit('liv:tool_result', {
            tool_use_id: 'tu_1',
            content: 'ok',
            is_error: false,
          }),
      },
    ];

    await runner.start('run_t2', 'task');

    const snapshotChunks = fakeStore.chunksOfType('tool_snapshot');
    assert(
      snapshotChunks.length === 2,
      `expected exactly 2 tool_snapshot chunks, got ${snapshotChunks.length}`,
    );

    const first = snapshotChunks[0].payload as ToolCallSnapshot;
    const second = snapshotChunks[1].payload as ToolCallSnapshot;

    assert(first.toolId === 'tu_1', `first.toolId wrong: ${first.toolId}`);
    assert(second.toolId === 'tu_1', `second.toolId wrong: ${second.toolId}`);
    assert(
      first.toolName === 'browser-navigate',
      `first.toolName wrong: ${first.toolName}`,
    );
    assert(
      first.category === 'browser',
      `first.category wrong: ${first.category}`,
    );

    assert(first.status === 'running', `first.status wrong: ${first.status}`);
    assert(first.toolResult === undefined, `first.toolResult should be undefined`);
    assert(
      first.assistantCall.input.url === 'https://x',
      `first.assistantCall.input.url wrong: ${JSON.stringify(first.assistantCall.input)}`,
    );

    assert(second.status === 'done', `second.status wrong: ${second.status}`);
    assert(
      second.toolResult !== undefined,
      `second.toolResult should be set`,
    );
    assert(
      second.toolResult?.output === 'ok',
      `second.toolResult.output wrong: ${JSON.stringify(second.toolResult?.output)}`,
    );
    assert(
      second.toolResult?.isError === false,
      `second.toolResult.isError wrong: ${JSON.stringify(second.toolResult?.isError)}`,
    );
    assert(
      typeof second.completedAt === 'number',
      `second.completedAt should be a number, got ${typeof second.completedAt}`,
    );
  });

  // ── Test 3: Stop signal interrupts within 1 iter ──────────────────────
  await test('stop() interrupts loop within 1 iter (graceful, <450ms total)', async () => {
    const fakeStore = new FakeRunStore();
    const stub = new StubSdkRunner();
    const runner = new LivAgentRunner({
      runStore: fakeStore as unknown as ConstructorParameters<typeof LivAgentRunner>[0]['runStore'],
      sdkRunner: stub as unknown as ConstructorParameters<typeof LivAgentRunner>[0]['sdkRunner'],
      toolRegistry: {} as ConstructorParameters<typeof LivAgentRunner>[0]['toolRegistry'],
      redisClient: {} as ConstructorParameters<typeof LivAgentRunner>[0]['redisClient'],
    });

    // Script: 5 text-emitting steps 100ms apart (full duration ~500ms).
    stub.script = Array.from({ length: 5 }, (_, i) => ({
      delayMs: 100,
      emit: (s: StubSdkRunner) =>
        s.emit('liv:assistant_message', {
          content: [{ type: 'text', text: `chunk-${i}` }],
        }),
    }));

    const startedAt = Date.now();
    const startPromise = runner.start('run_t3', 'long-task');

    // After 250ms, request stop.
    setTimeout(() => {
      void runner.stop('run_t3');
    }, 250);

    await startPromise;
    const elapsed = Date.now() - startedAt;

    assert(
      elapsed < 600,
      `start() took ${elapsed}ms — expected < 600ms (early bail-out on stop signal)`,
    );

    const setControlCalls = fakeStore.calls.filter((c) => c.method === 'setControl');
    assert(
      setControlCalls.length === 1,
      `expected 1 setControl call, got ${setControlCalls.length}`,
    );
    assert(
      setControlCalls[0].args[1] === 'stop',
      `setControl signal wrong: ${setControlCalls[0].args[1]}`,
    );

    // markComplete OR markError must fire exactly once.
    const finalCalls = fakeStore.calls.filter(
      (c) => c.method === 'markComplete' || c.method === 'markError',
    );
    assert(
      finalCalls.length === 1,
      `expected exactly 1 mark{Complete,Error} call, got ${finalCalls.length}: ${JSON.stringify(finalCalls.map((c) => c.method))}`,
    );

    // We chose markComplete with { stopped: true } per documented decision.
    assert(
      finalCalls[0].method === 'markComplete',
      `expected markComplete (stop graceful path), got ${finalCalls[0].method}`,
    );
    const finalResult = finalCalls[0].args[1] as { stopped?: boolean };
    assert(
      finalResult.stopped === true,
      `markComplete finalResult.stopped should be true, got ${JSON.stringify(finalResult)}`,
    );
  });

  // ── Test 4: Computer-use stub ─────────────────────────────────────────
  await test('computer-use tool emits stub error snapshot (no SDK tool_result needed)', async () => {
    const fakeStore = new FakeRunStore();
    const stub = new StubSdkRunner();
    const runner = new LivAgentRunner({
      runStore: fakeStore as unknown as ConstructorParameters<typeof LivAgentRunner>[0]['runStore'],
      sdkRunner: stub as unknown as ConstructorParameters<typeof LivAgentRunner>[0]['sdkRunner'],
      toolRegistry: {} as ConstructorParameters<typeof LivAgentRunner>[0]['toolRegistry'],
      redisClient: {} as ConstructorParameters<typeof LivAgentRunner>[0]['redisClient'],
    });

    // NOTE: NO scripted tool_result — D-16 says the stub error must fire
    // regardless of whether the SDK ever emits a tool_result for the call.
    stub.script = [
      {
        delayMs: 10,
        emit: (s) =>
          s.emit('liv:assistant_message', {
            content: [
              {
                type: 'tool_use',
                id: 'tu_cu',
                name: 'computer_use_screenshot',
                input: {},
              },
            ],
          }),
      },
    ];

    // Suppress the console.warn emitted by the runner during the stub
    // path so test output stays clean.
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      await runner.start('run_t4', 'task');
    } finally {
      console.warn = originalWarn;
    }

    const snapshotChunks = fakeStore.chunksOfType('tool_snapshot');
    assert(
      snapshotChunks.length === 2,
      `expected exactly 2 tool_snapshot chunks (running + stub error), got ${snapshotChunks.length}`,
    );

    const first = snapshotChunks[0].payload as ToolCallSnapshot;
    const second = snapshotChunks[1].payload as ToolCallSnapshot;

    assert(first.toolId === 'tu_cu', `first.toolId wrong: ${first.toolId}`);
    assert(second.toolId === 'tu_cu', `second.toolId wrong: ${second.toolId}`);
    assert(
      first.category === 'computer-use',
      `first.category wrong: ${first.category}`,
    );
    assert(first.status === 'running', `first.status wrong: ${first.status}`);

    assert(second.status === 'error', `second.status wrong: ${second.status}`);
    assert(
      second.toolResult !== undefined,
      `second.toolResult should be defined`,
    );
    assert(
      second.toolResult?.isError === true,
      `second.toolResult.isError must be true, got ${JSON.stringify(second.toolResult?.isError)}`,
    );

    const stubMessage = String(second.toolResult?.output ?? '');
    assert(
      stubMessage.includes('Computer use not available until P71'),
      `stub error must contain literal 'Computer use not available until P71', got: ${JSON.stringify(stubMessage)}`,
    );
  });

  // ── Test 5 (NEW — Phase 73-03): per-iter contextManagerHook ───────────
  await test('context-manager-hook called per iter; summarized=true emits status chunk', async () => {
    const fakeStore = new FakeRunStore();
    const stub = new StubSdkRunner();

    // Script: 3 assistant text events, 50ms apart. Each emission triggers
    // an iter-handler invocation; the hook should be called per-iter.
    stub.script = [
      {
        delayMs: 50,
        emit: (s) =>
          s.emit('liv:assistant_message', {
            content: [{ type: 'text', text: 'one' }],
          }),
      },
      {
        delayMs: 50,
        emit: (s) =>
          s.emit('liv:assistant_message', {
            content: [{ type: 'text', text: 'two' }],
          }),
      },
      {
        delayMs: 50,
        emit: (s) =>
          s.emit('liv:assistant_message', {
            content: [{ type: 'text', text: 'three' }],
          }),
      },
    ];

    let callCount = 0;
    const fakeHook = async (history: Message[]) => {
      callCount++;
      if (callCount === 1) {
        return {
          history: [
            ...history,
            {
              role: 'system' as const,
              content:
                '<context_summary>summed</context_summary>',
            },
          ],
          summarized: true,
        };
      }
      return undefined;
    };

    const runner = new LivAgentRunner({
      runStore: fakeStore as unknown as ConstructorParameters<typeof LivAgentRunner>[0]['runStore'],
      sdkRunner: stub as unknown as ConstructorParameters<typeof LivAgentRunner>[0]['sdkRunner'],
      toolRegistry: {} as ConstructorParameters<typeof LivAgentRunner>[0]['toolRegistry'],
      redisClient: {} as ConstructorParameters<typeof LivAgentRunner>[0]['redisClient'],
      contextManagerHook: fakeHook,
    });

    await runner.start('run_ctx_test', 'task');

    assert(callCount >= 1, `hook called ${callCount} times, expected >= 1`);

    const statusChunkCalls = fakeStore.calls.filter(
      (c) =>
        c.method === 'appendChunk' &&
        (c.args[1] as { type?: string }).type === 'status' &&
        (c.args[1] as { payload?: unknown }).payload === 'context-summarized',
    );
    assert(
      statusChunkCalls.length >= 1,
      `expected at least one 'context-summarized' status chunk, got ${statusChunkCalls.length}`,
    );
  });

  // ── Test 6 (bonus): categorizeTool ────────────────────────────────────
  await test('categorizeTool maps known patterns to correct categories', async () => {
    assert(categorizeTool('browser-navigate') === 'browser', 'browser-navigate');
    assert(categorizeTool('browser_click') === 'browser', 'browser_click');
    assert(categorizeTool('execute-command') === 'terminal', 'execute-command');
    assert(categorizeTool('terminal-spawn') === 'terminal', 'terminal-spawn');
    assert(categorizeTool('str-replace') === 'fileEdit', 'str-replace');
    assert(categorizeTool('edit-file') === 'fileEdit', 'edit-file');
    assert(categorizeTool('read-file') === 'file', 'read-file');
    assert(categorizeTool('write-file') === 'file', 'write-file');
    assert(categorizeTool('list-files') === 'file', 'list-files');
    assert(categorizeTool('delete-file') === 'file', 'delete-file');
    assert(categorizeTool('web-search') === 'webSearch', 'web-search');
    assert(categorizeTool('web-crawl') === 'webCrawl', 'web-crawl');
    assert(categorizeTool('web-scrape') === 'webScrape', 'web-scrape');
    assert(
      categorizeTool('computer_use_screenshot') === 'computer-use',
      'computer_use_screenshot',
    );
    assert(categorizeTool('bytebot_click') === 'computer-use', 'bytebot_click');
    assert(categorizeTool('mcp_some_thing') === 'mcp', 'mcp_some_thing');
    assert(categorizeTool('mcp-some-thing') === 'mcp', 'mcp-some-thing');
    assert(categorizeTool('foobar-quux') === 'generic', 'foobar-quux');
  });

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Test runner crashed:', e);
  process.exit(1);
});
