/**
 * ContextManager unit tests — Phase 73-01.
 *
 * Standalone tsx-runnable script (NOT vitest — matches the existing
 * run-store.test.ts harness pattern in @nexus/core).
 *
 * Test backend: ioredis-mock (in-process Redis emulator, already a devDep
 * since P67-01 per package.json:64). Fallback to process.env.REDIS_URL
 * skip-if-absent mirrors run-store.test.ts.
 *
 * Run: `npx tsx nexus/packages/core/src/context-manager.test.ts`
 *
 * 6 + 1 bonus tests covering:
 *   1. Sub-threshold no-op returns same reference; no Redis calls.
 *   2. Short-history fast path even when bytes exceed threshold.
 *   3. Above-threshold drops middle, preserves system + last 10.
 *   4. Tool_use/tool_result pairing preserved across last 10.
 *   5. Synthetic <context_summary> message injected at index 1.
 *   6. Redis summary_checkpoint persisted with 24h TTL.
 *   7 (bonus). countTokens heuristic matches Math.ceil(JSON.stringify(h).length / 4).
 */

export {}; // Force this file to be parsed as an ES module so top-level
           // `await` is permitted (run-store.test.ts achieves this via its
           // static `import { setTimeout } from 'node:timers/promises'`).

// ── Redis client factory ─────────────────────────────────────────
let createRedis: () => any;
let usingMock = false;

try {
  const mod: any = await import('ioredis-mock');
  const RedisMock = mod.default ?? mod;
  createRedis = () => new RedisMock();
  usingMock = true;
} catch {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('REDIS_URL not set and ioredis-mock unavailable — ContextManager tests skipped');
    process.exit(0);
  }
  const { Redis } = await import('ioredis');
  createRedis = () => new Redis(url, { maxRetriesPerRequest: null });
}

const { ContextManager, countTokens } = await import('./context-manager.js');
type Message = import('./context-manager.js').Message;

// ── Test harness ─────────────────────────────────────────────────
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

function assert(cond: any, msg: string): void {
  if (!cond) throw new Error(msg);
}

// Build a synthetic large history: `n` messages, each with `bytesPerMsg`
// chars of content. Returns Message[] suitable for triggering the
// summarization threshold when n*bytesPerMsg/4 > 0.75 * windowSize.
function buildLargeHistory(n: number, bytesPerMsg: number, leadingSystem = true): Message[] {
  const out: Message[] = [];
  if (leadingSystem) {
    out.push({ role: 'system', content: 'You are a helpful agent.' });
  }
  for (let i = 0; i < n; i++) {
    const role: Message['role'] = i % 2 === 0 ? 'user' : 'assistant';
    out.push({
      role,
      content: `${role}-${i}-${'X'.repeat(Math.max(0, bytesPerMsg - 16))}`,
    });
  }
  return out;
}

// Fake RunStore stub — ContextManager holds a reference but never calls it
// in v31 (D-09). `as any` is fine since the type contract isn't exercised.
function fakeRunStore(): any {
  return {} as any;
}

// ── Tests ────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`ContextManager tests — backend: ${usingMock ? 'ioredis-mock' : 'real Redis'}`);

  // Test 1: Sub-threshold no-op — small history, no summarization, no Redis writes.
  await test('sub-threshold no-op returns same reference; no Redis calls', async () => {
    const redis = createRedis();
    // Wrap redis.set to count calls so we can verify zero writes.
    let setCalls = 0;
    const origSet = redis.set.bind(redis);
    redis.set = (...args: any[]) => {
      setCalls++;
      return origSet(...args);
    };
    const cm = new ContextManager({ runStore: fakeRunStore(), redisClient: redis });

    const history: Message[] = [{ role: 'user', content: 'hi' }];
    const result = await cm.checkAndMaybeSummarize('run-test-1', history);

    assert(result.summarized === false, `expected summarized=false, got ${result.summarized}`);
    assert(result.newHistory === history, 'newHistory must be SAME REFERENCE on no-op');
    assert(result.tokenCountBefore === result.tokenCountAfter,
      `before/after diverged on no-op: ${result.tokenCountBefore} vs ${result.tokenCountAfter}`);
    assert(setCalls === 0, `expected 0 SET calls on sub-threshold no-op, got ${setCalls}`);
    await redis.quit();
  });

  // Test 2: Short-history fast path — bytes exceed threshold but msg count <= 10+systems.
  await test('short-history fast path skips summarization even if bytes huge', async () => {
    const redis = createRedis();
    let setCalls = 0;
    const origSet = redis.set.bind(redis);
    redis.set = (...args: any[]) => { setCalls++; return origSet(...args); };

    // Tiny window so even 5 short messages exceed it.
    const cm = new ContextManager({
      runStore: fakeRunStore(),
      redisClient: redis,
      kimiContextWindow: 100,    // very small
      thresholdRatio: 0.5,       // threshold = 50 tokens
    });

    // 5 messages with content padded so JSON length is well above 50*4=200 chars.
    const history: Message[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'A'.repeat(500) },
      { role: 'assistant', content: 'B'.repeat(500) },
      { role: 'user', content: 'C'.repeat(500) },
      { role: 'assistant', content: 'D'.repeat(500) },
    ];

    const result = await cm.checkAndMaybeSummarize('run-test-2', history);

    assert(result.summarized === false,
      `expected summarized=false (short history), got ${result.summarized}`);
    assert(setCalls === 0, `expected 0 SET calls on short fast path, got ${setCalls}`);
    await redis.quit();
  });

  // Test 3: Above-threshold drops middle, preserves system + last 10.
  await test('above-threshold drops middle and preserves system + last 10', async () => {
    const redis = createRedis();
    const cm = new ContextManager({ runStore: fakeRunStore(), redisClient: redis });

    // Build 200 messages of 4_000 chars each ⇒ JSON length ≈ 800k ⇒ tokens ≈ 200k.
    // Threshold = 0.75 * 200_000 = 150_000 tokens. Triggers.
    const history = buildLargeHistory(200, 4_000, true);
    const result = await cm.checkAndMaybeSummarize('run-test-3', history);

    assert(result.summarized === true,
      `expected summarized=true, got ${result.summarized} (before=${result.tokenCountBefore})`);
    // Expect: 1 original system + 1 synthetic system + 10 last messages = 12 (or 11 if last 10
    // happens to include systems; here all systems sit at index 0, so exactly 12).
    assert(result.newHistory.length === 12,
      `expected newHistory length 12, got ${result.newHistory.length}`);
    assert(result.tokenCountAfter < result.tokenCountBefore,
      `expected tokenCountAfter < tokenCountBefore, got ${result.tokenCountAfter} >= ${result.tokenCountBefore}`);
    // First message is the original system prompt
    assert(result.newHistory[0].role === 'system',
      `expected newHistory[0].role==='system', got ${result.newHistory[0].role}`);
    // Last 10 messages are preserved verbatim from end of input
    const inputTail = history.slice(-10);
    const outputTail = result.newHistory.slice(-10);
    for (let i = 0; i < 10; i++) {
      assert(JSON.stringify(inputTail[i]) === JSON.stringify(outputTail[i]),
        `last-10 message ${i} mismatch:\n  input=${JSON.stringify(inputTail[i])}\n  output=${JSON.stringify(outputTail[i])}`);
    }
    await redis.quit();
  });

  // Test 4: Tool_use/tool_result pairing preserved when both are in last 10.
  await test('preserves tool_use/tool_result pairs in last 10', async () => {
    const redis = createRedis();
    const cm = new ContextManager({ runStore: fakeRunStore(), redisClient: redis });

    // Build a large history. Replace the second-to-last assistant with a tool_use,
    // and the last user message with the matching tool_result.
    const history = buildLargeHistory(200, 4_000, true);
    history[history.length - 2] = {
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'tu_pair', name: 'shell', input: { cmd: 'ls' } },
      ],
    };
    history[history.length - 1] = {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu_pair', content: 'file1\nfile2' },
      ],
    };

    const result = await cm.checkAndMaybeSummarize('run-test-4', history);
    assert(result.summarized === true, `expected summarized=true`);

    // Both tool_use and tool_result should still be present in newHistory.
    const json = JSON.stringify(result.newHistory);
    assert(json.includes('tu_pair'),
      `expected tool_use_id 'tu_pair' to survive, but newHistory has none. JSON: ${json.slice(0, 500)}`);
    // Count occurrences of 'tu_pair' — both blocks reference it, so >= 2.
    const matches = json.match(/tu_pair/g) ?? [];
    assert(matches.length >= 2,
      `expected at least 2 'tu_pair' references (tool_use.id + tool_result.tool_use_id), got ${matches.length}`);
    await redis.quit();
  });

  // Test 5: Synthetic <context_summary> message injection.
  await test('injects synthetic <context_summary> message at index 1', async () => {
    const redis = createRedis();
    const cm = new ContextManager({ runStore: fakeRunStore(), redisClient: redis });

    const history = buildLargeHistory(200, 4_000, true);
    // Make the first non-system message a recognisable user prompt so we can
    // assert the "Last topic" snippet picks it up.
    history[1] = { role: 'user', content: 'BEACON-USER-PROMPT-XYZ deploy nginx to staging' };

    const result = await cm.checkAndMaybeSummarize('run-test-5', history);
    assert(result.summarized === true, 'summarized=false');

    // Synthetic should be at index 1 (right after original system at index 0).
    const synthetic = result.newHistory[1];
    assert(synthetic.role === 'system',
      `expected synthetic at index 1 to be role=system, got ${synthetic.role}`);
    const content = typeof synthetic.content === 'string'
      ? synthetic.content
      : JSON.stringify(synthetic.content);
    assert(content.includes('<context_summary>'),
      `synthetic missing <context_summary> open tag: ${content.slice(0, 200)}`);
    assert(content.includes('</context_summary>'),
      `synthetic missing </context_summary> close tag: ${content.slice(0, 200)}`);
    assert(content.includes('messages elided'),
      `synthetic missing 'messages elided' phrase: ${content.slice(0, 200)}`);
    assert(content.includes('Last topic:'),
      `synthetic missing 'Last topic:' phrase: ${content.slice(0, 200)}`);
    // The recognisable beacon should appear in the synthetic content (sanitized
    // angle-bracket-free text passes through unchanged).
    assert(content.includes('BEACON-USER-PROMPT-XYZ'),
      `synthetic should reference the first dropped user prompt: ${content.slice(0, 300)}`);
    await redis.quit();
  });

  // Test 6: Redis checkpoint persisted with 24h TTL.
  await test('persists summary_checkpoint to Redis with 24h TTL', async () => {
    const redis = createRedis();
    const cm = new ContextManager({ runStore: fakeRunStore(), redisClient: redis });

    const history = buildLargeHistory(200, 4_000, true);
    const result = await cm.checkAndMaybeSummarize('run_test_6', history);
    assert(result.summarized === true, 'summarized=false');

    const checkpointKey = 'liv:agent_run:run_test_6:summary_checkpoint';
    const stored = await redis.get(checkpointKey);
    assert(stored !== null, `summary_checkpoint key missing in Redis`);
    const parsed = JSON.parse(stored);
    assert(JSON.stringify(parsed) === JSON.stringify(result.newHistory),
      'checkpoint JSON does not match newHistory');

    const ttl = await redis.ttl(checkpointKey);
    const TWENTY_FOUR_HOURS = 24 * 60 * 60;
    assert(ttl > 0 && ttl <= TWENTY_FOUR_HOURS,
      `expected TTL in (0, 86400], got ${ttl}`);
    assert(ttl > TWENTY_FOUR_HOURS - 5,
      `expected TTL near 24h fresh, got ${ttl}`);
    await redis.quit();
  });

  // Test 7 (bonus): countTokens heuristic.
  await test('countTokens returns Math.ceil(JSON.stringify(h).length / 4)', async () => {
    const history: Message[] = [
      { role: 'user', content: 'hello world' },
      { role: 'assistant', content: 'hi there' },
    ];
    const expected = Math.ceil(JSON.stringify(history).length / 4);
    const actual = countTokens(history);
    assert(actual === expected, `expected ${expected}, got ${actual}`);
  });

  // Test 8 (bonus): non-implemented strategy throws.
  await test('non-truncate-oldest strategy throws "not implemented in v31"', async () => {
    const redis = createRedis();
    const cm = new ContextManager({
      runStore: fakeRunStore(),
      redisClient: redis,
      summarizationStrategy: 'kimi-summary' as any,
    });

    const history = buildLargeHistory(200, 4_000, true);
    let threw = false;
    let message = '';
    try {
      await cm.checkAndMaybeSummarize('run-test-8', history);
    } catch (e) {
      threw = true;
      message = (e as Error).message;
    }
    assert(threw, 'expected non-truncate-oldest strategy to throw');
    assert(message.includes('not implemented in v31'),
      `expected error message to mention "not implemented in v31", got: ${message}`);
    await redis.quit();
  });

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Test runner crashed:', e);
  process.exit(1);
});
