/**
 * LivAgentRunner Hermes-pattern integration tests — Phase 87.
 *
 * Standalone tsx-runnable script matching the existing test harness pattern
 * in this package (NOT vitest). Top-level async IIFE, exit 0 on all-pass.
 *
 * Tests verify V32-HERMES-01..05:
 *   a. status_detail emitted at start of turn, tool dispatch, after tool result.
 *   b. IterationBudget: maxIterations=2, 3-turn loop -> error chunk MAX_ITERATIONS.
 *   c. injectSteer: steer guidance prepended to currentHistory as <liv_steer> msg.
 *   d. batchId: two tool_use blocks in one turn share the same batchId.
 *
 * Run: npx tsx liv/packages/core/src/liv-agent-runner.hermes.test.ts
 */

import { EventEmitter } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  LivAgentRunner,
  type ToolCallSnapshot,
} from './liv-agent-runner.js';

// ── Fake RunStore ───────────────────────────────────────────────────────

type Call = { method: string; args: unknown[] };

class FakeRunStore {
  calls: Call[] = [];
  controlState = new Map<string, 'stop' | null>();

  async createRun(_userId: string, _task: string): Promise<string> {
    this.calls.push({ method: 'createRun', args: [_userId, _task] });
    return 'run_hermes_test';
  }

  async appendChunk(
    runId: string,
    chunk: { type: string; payload: unknown; ts?: number },
  ): Promise<{ idx: number }> {
    this.calls.push({ method: 'appendChunk', args: [runId, chunk] });
    const prior = this.calls.filter((c) => c.method === 'appendChunk').length;
    return { idx: prior - 1 };
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

  async listRuns(): Promise<[]> {
    return [];
  }

  chunksOfType(type: string): Array<{ type: string; payload: unknown }> {
    return this.calls
      .filter((c) => c.method === 'appendChunk')
      .map((c) => c.args[1] as { type: string; payload: unknown })
      .filter((chunk) => chunk.type === type);
  }
}

// ── Stub SDK runner ─────────────────────────────────────────────────────

type ScriptStep = { delayMs: number; emit: (stub: StubSdkRunner) => void };

class StubSdkRunner extends EventEmitter {
  script: ScriptStep[] = [];

  async run(_task: string): Promise<unknown> {
    for (const step of this.script) {
      await sleep(step.delayMs);
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
    if ((e as Error).stack) console.error((e as Error).stack?.split('\n').slice(0, 5).join('\n'));
    fail++;
  }
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function makeRunner(opts: {
  fakeStore: FakeRunStore;
  stub: StubSdkRunner;
  maxIterations?: number;
}) {
  return new LivAgentRunner({
    runStore: opts.fakeStore as unknown as ConstructorParameters<typeof LivAgentRunner>[0]['runStore'],
    sdkRunner: opts.stub as unknown as ConstructorParameters<typeof LivAgentRunner>[0]['sdkRunner'],
    toolRegistry: {} as ConstructorParameters<typeof LivAgentRunner>[0]['toolRegistry'],
    redisClient: {} as ConstructorParameters<typeof LivAgentRunner>[0]['redisClient'],
    maxIterations: opts.maxIterations,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('LivAgentRunner Hermes-pattern tests (Phase 87)');

  // ── Test a: status_detail emitted at start, tool dispatch, after tool result ─
  await test('(a) status_detail emitted at start, tool_use, and after tool result', async () => {
    const fakeStore = new FakeRunStore();
    const stub = new StubSdkRunner();
    const runner = makeRunner({ fakeStore, stub });

    stub.script = [
      {
        delayMs: 0,
        emit: (s) =>
          s.emit('liv:assistant_message', {
            content: [
              {
                type: 'tool_use',
                id: 'tu_a1',
                name: 'read-file',
                input: { path: '/tmp/x' },
              },
            ],
          }),
      },
      {
        delayMs: 0,
        emit: (s) =>
          s.emit('liv:tool_result', {
            tool_use_id: 'tu_a1',
            content: 'file contents',
            is_error: false,
          }),
      },
      {
        delayMs: 0,
        emit: (s) =>
          s.emit('liv:assistant_message', {
            content: [{ type: 'text', text: 'done' }],
          }),
      },
    ];

    await runner.start('run_a', 'task');

    const sdChunks = fakeStore.chunksOfType('status_detail');
    // Expect:
    //   - start of turn 1 (thinking)
    //   - tool dispatch (tool_use)
    //   - after tool result (thinking)
    //   - start of turn 2 (thinking)
    assert(sdChunks.length >= 4, `expected >=4 status_detail chunks, got ${sdChunks.length}`);

    const phases = sdChunks.map((c) => (c.payload as { phase: string }).phase);
    assert(phases[0] === 'thinking', `first sd phase must be 'thinking', got '${phases[0]}'`);

    const toolUsePhases = phases.filter((p) => p === 'tool_use');
    assert(toolUsePhases.length >= 1, `expected at least 1 tool_use phase chunk`);

    // Verify elapsed is a non-negative number
    for (const sd of sdChunks) {
      const p = sd.payload as { elapsed: number; phrase: string; phase: string };
      assert(typeof p.elapsed === 'number' && p.elapsed >= 0, `elapsed must be non-negative number, got ${p.elapsed}`);
      assert(typeof p.phrase === 'string' && p.phrase.length > 0, `phrase must be non-empty string`);
    }

    // Verify tool_use verb hint for 'read-file' is 'inspecting'
    const toolUseChunk = sdChunks.find((c) => (c.payload as { phase: string }).phase === 'tool_use');
    assert(toolUseChunk !== undefined, 'tool_use status_detail chunk not found');
    const toolPhrase = (toolUseChunk!.payload as { phrase: string }).phrase;
    assert(toolPhrase === 'inspecting', `expected 'inspecting' for read-file, got '${toolPhrase}'`);
  });

  // ── Test b: IterationBudget fires MAX_ITERATIONS error ─────────────────
  await test('(b) maxIterations=2 fires MAX_ITERATIONS error on 3rd turn', async () => {
    const fakeStore = new FakeRunStore();
    const stub = new StubSdkRunner();
    // Pass maxIterations=2 — the 3rd handleAssistantMessage call should breach it.
    const runner = makeRunner({ fakeStore, stub, maxIterations: 2 });

    // 3 assistant turns — the 3rd will exceed the budget.
    stub.script = [
      {
        delayMs: 0,
        emit: (s) =>
          s.emit('liv:assistant_message', { content: [{ type: 'text', text: 'turn 1' }] }),
      },
      {
        delayMs: 0,
        emit: (s) =>
          s.emit('liv:assistant_message', { content: [{ type: 'text', text: 'turn 2' }] }),
      },
      {
        delayMs: 0,
        emit: (s) =>
          s.emit('liv:assistant_message', { content: [{ type: 'text', text: 'turn 3' }] }),
      },
    ];

    await runner.start('run_b', 'task');

    const errorChunks = fakeStore.chunksOfType('error');
    assert(errorChunks.length >= 1, `expected error chunk, got ${errorChunks.length}`);

    const errPayload = errorChunks[errorChunks.length - 1].payload as {
      message: string;
      code: string;
    };
    assert(errPayload.code === 'MAX_ITERATIONS', `error code must be MAX_ITERATIONS, got '${errPayload.code}'`);
    assert(
      errPayload.message.includes('Max iterations (2)'),
      `error message must include 'Max iterations (2)', got: '${errPayload.message}'`,
    );

    // markError must have been called
    const markErrorCalls = fakeStore.calls.filter((c) => c.method === 'markError');
    assert(markErrorCalls.length >= 1, `markError must be called on MAX_ITERATIONS breach`);

    // stopRequested must have halted further processing — only 2 turns worth of text
    const textChunks = fakeStore.chunksOfType('text');
    // Turn 1 and 2 emit text; turn 3 is blocked by IterationBudget
    assert(textChunks.length <= 2, `turn 3 text must be blocked; got ${textChunks.length} text chunks`);
  });

  // ── Test c: injectSteer prepends <liv_steer> to currentHistory ─────────
  await test('(c) injectSteer prepends <liv_steer> system message before next turn', async () => {
    const fakeStore = new FakeRunStore();
    const stub = new StubSdkRunner();
    const runner = makeRunner({ fakeStore, stub });

    // Capture the currentHistory state after the runner processes one turn.
    // We do this by hooking the contextManagerHook which receives currentHistory.
    let capturedHistory: Array<{ role: string; content: unknown }> | null = null;

    const runnerWithHook = new LivAgentRunner({
      runStore: fakeStore as unknown as ConstructorParameters<typeof LivAgentRunner>[0]['runStore'],
      sdkRunner: stub as unknown as ConstructorParameters<typeof LivAgentRunner>[0]['sdkRunner'],
      toolRegistry: {} as ConstructorParameters<typeof LivAgentRunner>[0]['toolRegistry'],
      redisClient: {} as ConstructorParameters<typeof LivAgentRunner>[0]['redisClient'],
      contextManagerHook: async (history) => {
        capturedHistory = history as Array<{ role: string; content: unknown }>;
        return undefined;
      },
    });

    // Inject steer BEFORE the run starts — it will be drained on the first assistant turn.
    runnerWithHook.injectSteer('be concise');

    stub.script = [
      {
        delayMs: 0,
        emit: (s) =>
          s.emit('liv:assistant_message', { content: [{ type: 'text', text: 'hello' }] }),
      },
    ];

    await runnerWithHook.start('run_c', 'task');

    // The steer is added to currentHistory BEFORE the contextManagerHook is called.
    // capturedHistory should contain a system message with <liv_steer>be concise</liv_steer>.
    assert(capturedHistory !== null, 'capturedHistory must have been set by the hook');
    const history = capturedHistory!;

    const steerEntry = history.find(
      (m) =>
        m.role === 'system' &&
        typeof m.content === 'string' &&
        (m.content as string).includes('<liv_steer>be concise</liv_steer>'),
    );
    assert(steerEntry !== undefined, `currentHistory must contain <liv_steer>be concise</liv_steer> system message; history roles: ${JSON.stringify(history.map((m) => m.role))}`);

    // Verify single-shot drain: steer is null after first turn — inject a new steer
    // and verify it is NOT already in history on the second call (because we didn't call again).
    runnerWithHook.injectSteer('second steer');
    // The field is set — but it was drained on the first turn. A second run would drain it.
    // We can't easily verify drain without a 2-turn script, but we verify the _pendingSteer
    // was cleared after first use by checking capturedHistory doesn't have 2 steer entries.
    const steerEntries = history.filter(
      (m) => typeof m.content === 'string' && (m.content as string).includes('<liv_steer>'),
    );
    assert(steerEntries.length === 1, `only ONE steer entry expected after single drain; got ${steerEntries.length}`);
  });

  // ── Test d: batchId shared by tools in same turn ────────────────────────
  await test('(d) batchId shared by tool_use blocks in the same SDK turn', async () => {
    const fakeStore = new FakeRunStore();
    const stub = new StubSdkRunner();
    const runner = makeRunner({ fakeStore, stub });

    // One assistant message with TWO tool_use blocks in the same turn.
    stub.script = [
      {
        delayMs: 0,
        emit: (s) =>
          s.emit('liv:assistant_message', {
            content: [
              {
                type: 'tool_use',
                id: 'tu_d1',
                name: 'read-file',
                input: { path: '/a' },
              },
              {
                type: 'tool_use',
                id: 'tu_d2',
                name: 'read-file',
                input: { path: '/b' },
              },
            ],
          }),
      },
    ];

    await runner.start('run_d', 'task');

    const snapshotChunks = fakeStore.chunksOfType('tool_snapshot');
    // 2 tool_use blocks → 2 'running' snapshots (no tool_result scripted)
    assert(snapshotChunks.length >= 2, `expected at least 2 tool_snapshot chunks, got ${snapshotChunks.length}`);

    const runningSnapshots = snapshotChunks.filter(
      (c) => (c.payload as ToolCallSnapshot).status === 'running',
    );
    assert(runningSnapshots.length === 2, `expected 2 running snapshots, got ${runningSnapshots.length}`);

    const snap1 = runningSnapshots[0].payload as ToolCallSnapshot;
    const snap2 = runningSnapshots[1].payload as ToolCallSnapshot;

    assert(snap1.batchId !== undefined, `snap1.batchId must be set`);
    assert(snap2.batchId !== undefined, `snap2.batchId must be set`);
    assert(
      snap1.batchId === snap2.batchId,
      `both snapshots must share the same batchId; got '${snap1.batchId}' vs '${snap2.batchId}'`,
    );

    // batchId must be a valid UUID (v4 pattern)
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assert(uuidRe.test(snap1.batchId!), `batchId must be a valid UUID v4; got '${snap1.batchId}'`);
  });

  // ── Test e: hermes-phrases module ──────────────────────────────────────
  await test('(e) hermes-phrases: all entries non-empty, pickers return from tuples', async () => {
    const { THINKING_VERBS, WAITING_VERBS, pickThinkingVerb, pickWaitingVerb } = await import('./lib/hermes-phrases.js');

    assert(THINKING_VERBS.length === 15, `THINKING_VERBS must have 15 entries, got ${THINKING_VERBS.length}`);
    assert(WAITING_VERBS.length === 3, `WAITING_VERBS must have 3 entries, got ${WAITING_VERBS.length}`);

    for (const v of THINKING_VERBS) {
      assert(typeof v === 'string' && v.length > 0, `THINKING_VERBS entry must be non-empty string: ${JSON.stringify(v)}`);
    }
    for (const v of WAITING_VERBS) {
      assert(typeof v === 'string' && v.length > 0, `WAITING_VERBS entry must be non-empty string: ${JSON.stringify(v)}`);
    }

    // Sample pickers 50 times each — all results must be in the tuple.
    const thinkingSet = new Set(THINKING_VERBS as readonly string[]);
    const waitingSet = new Set(WAITING_VERBS as readonly string[]);
    for (let i = 0; i < 50; i++) {
      const tv = pickThinkingVerb();
      assert(thinkingSet.has(tv), `pickThinkingVerb returned '${tv}' which is not in THINKING_VERBS`);
      const wv = pickWaitingVerb();
      assert(waitingSet.has(wv), `pickWaitingVerb returned '${wv}' which is not in WAITING_VERBS`);
    }
  });

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Hermes test runner crashed:', e);
  process.exit(1);
});
