/**
 * RunQueue integration tests — Phase 73-02.
 *
 * Standalone tsx-runnable script (matches the existing test:phase39 pattern in
 * @nexus/core package.json + the P67-01 run-store.test.ts harness style).
 *
 * Backend: REAL Redis (gated on `process.env.REDIS_URL`). BullMQ does NOT
 * support ioredis-mock natively (ioredis-mock can't fake the Redis stream
 * commands BullMQ relies on for atomicity), so this file skips-with-warning
 * when REDIS_URL is absent. CONTEXT D-29 + plan must-have line 35.
 *
 * Run:
 *   REDIS_URL=redis://localhost:6379 npx tsx nexus/packages/core/src/run-queue.test.ts
 *
 * Or skipped (always exits 0) when REDIS_URL is unset.
 *
 * 5 cases per the plan <behavior> block:
 *   1. enqueue + worker calls factory with correct args
 *   2. per-user concurrency=1 — second job for same user delayed
 *   3. multi-user parallelism — two users run within the same window
 *   4. factory throws → markError on RunStore + active counter ends 0
 *   5. stop() closes worker; subsequent enqueue() throws "RunQueue stopped"
 */

import { setTimeout as sleep } from 'node:timers/promises';

const REDIS_URL_RAW = process.env.REDIS_URL;
if (!REDIS_URL_RAW) {
  console.warn(
    'REDIS_URL not set — RunQueue tests skipped (bullmq requires real Redis)',
  );
  process.exit(0);
}
// After the guard, capture as a non-undefined string so TS narrows correctly
// inside async closures below (process.exit doesn't propagate narrowing).
const REDIS_URL: string = REDIS_URL_RAW;

const { Redis } = await import('ioredis');
const { RunQueue } = await import('./run-queue.js');
const { RunStore } = await import('./run-store.js');

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

// Each test gets a unique queue name to avoid cross-test contamination
// (parallel CI / re-runs / abandoned-state-from-previous-failures).
let queueCounter = 0;
function uniqueQueueName(): string {
  return `liv:agent-jobs-test-${Date.now()}-${queueCounter++}`;
}

/**
 * Recording factory — captures (runId, task) per call into an array. Optional
 * holdMs lets us stretch a job to verify concurrency gates. Optional
 * throwError forces the factory to reject (for the failed-event test).
 */
type FactoryCall = { runId: string; task: string; ts: number };
function recordingFactory(
  records: FactoryCall[],
  opts: { holdMs?: number; throwError?: Error } = {},
): (runId: string, task: string) => Promise<void> {
  return async (runId: string, task: string) => {
    records.push({ runId, task, ts: Date.now() });
    if (opts.holdMs) await sleep(opts.holdMs);
    if (opts.throwError) throw opts.throwError;
  };
}

/**
 * Wait for `cond()` to return true, polling every 20ms up to deadlineMs.
 * Throws if deadline elapses without the condition becoming true.
 */
async function waitFor(
  cond: () => boolean | Promise<boolean>,
  deadlineMs: number,
  errMsg: string,
): Promise<void> {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    if (await cond()) return;
    await sleep(20);
  }
  throw new Error(`waitFor timeout after ${deadlineMs}ms: ${errMsg}`);
}

// ── Tests ────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`RunQueue tests — backend: real Redis @ ${REDIS_URL}`);

  const sharedRedis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  // Best-effort cleanup of any leaked test state from prior runs.
  await sharedRedis.flushdb();

  // Test 1: enqueue + worker calls factory with correct args.
  await test('enqueue → worker invokes factory with correct (runId, task)', async () => {
    const factoryCalls: FactoryCall[] = [];
    const runStore = new RunStore(sharedRedis);
    const runQueue = new RunQueue({
      redisClient: sharedRedis,
      runStore,
      livAgentRunnerFactory: recordingFactory(factoryCalls),
      queueName: uniqueQueueName(),
    });
    try {
      await runQueue.start();
      await runQueue.enqueue({
        runId: 'r1',
        userId: 'u1',
        task: 't1',
        enqueuedAt: Date.now(),
      });

      await waitFor(
        () => factoryCalls.length === 1,
        5000,
        'factory was not called within 5s',
      );

      assert(factoryCalls.length === 1, `expected 1 call, got ${factoryCalls.length}`);
      assert(factoryCalls[0].runId === 'r1', `runId mismatch: ${factoryCalls[0].runId}`);
      assert(factoryCalls[0].task === 't1', `task mismatch: ${factoryCalls[0].task}`);

      // Active counter should drop to 0 after completion.
      await waitFor(
        async () => (await runQueue.getActiveCount('u1')) === 0,
        2000,
        'active counter for u1 did not drop to 0',
      );
    } finally {
      await runQueue.stop();
    }
  });

  // Test 2: per-user concurrency=1 — second job for same user gets serialized.
  await test('per-user concurrency=1 — same-user jobs serialize', async () => {
    const factoryCalls: FactoryCall[] = [];
    const runStore = new RunStore(sharedRedis);
    const runQueue = new RunQueue({
      redisClient: sharedRedis,
      runStore,
      livAgentRunnerFactory: recordingFactory(factoryCalls, { holdMs: 500 }),
      queueName: uniqueQueueName(),
    });
    try {
      await runQueue.start();

      // Enqueue two for the same user back-to-back.
      await runQueue.enqueue({ runId: 'r-u1-a', userId: 'u1', task: 'a', enqueuedAt: Date.now() });
      await runQueue.enqueue({ runId: 'r-u1-b', userId: 'u1', task: 'b', enqueuedAt: Date.now() });

      // Wait until at least one factory call has fired.
      await waitFor(
        () => factoryCalls.length >= 1,
        3000,
        'factory did not start running within 3s',
      );

      // While the first 500ms-hold is ongoing, factoryCalls should stay at 1
      // (gate blocks the second). Sample mid-hold.
      await sleep(200);
      assert(
        factoryCalls.length === 1,
        `expected exactly 1 in-flight call mid-hold, got ${factoryCalls.length}`,
      );

      // Wait for both to drain (1st 500ms + delay + 2nd 500ms ~= 2s budget).
      await waitFor(
        () => factoryCalls.length === 2,
        8000,
        'second job never ran within 8s',
      );

      // Order check: 'a' before 'b' (FIFO at enqueue time, even with re-queue).
      // NB: BullMQ's moveToDelayed re-queues at the tail, so 'b' may run after
      // 'a' completes — that's the serialization guarantee we want.
      assert(
        factoryCalls[0].task === 'a' && factoryCalls[1].task === 'b',
        `order wrong: ${factoryCalls.map((c) => c.task).join(',')}`,
      );

      // Active counter for u1 should drop to 0.
      await waitFor(
        async () => (await runQueue.getActiveCount('u1')) === 0,
        2000,
        'active counter did not return to 0',
      );
    } finally {
      await runQueue.stop();
    }
  });

  // Test 3: multi-user parallelism — different users run within the same window.
  await test('multi-user parallelism — u1 + u2 run concurrently', async () => {
    const factoryCalls: FactoryCall[] = [];
    const runStore = new RunStore(sharedRedis);
    const runQueue = new RunQueue({
      redisClient: sharedRedis,
      runStore,
      livAgentRunnerFactory: recordingFactory(factoryCalls, { holdMs: 500 }),
      queueName: uniqueQueueName(),
    });
    try {
      await runQueue.start();

      // Two different users — gate is per-user, so both should run in parallel
      // (within globalConcurrency=5 default).
      await runQueue.enqueue({ runId: 'r-u1', userId: 'u1', task: 't-u1', enqueuedAt: Date.now() });
      await runQueue.enqueue({ runId: 'r-u2', userId: 'u2', task: 't-u2', enqueuedAt: Date.now() });

      // Both factory calls should land within the 500ms hold window — i.e.
      // factoryCalls reaches length 2 BEFORE the first call's hold resolves.
      await waitFor(
        () => factoryCalls.length === 2,
        3000,
        'second user never started within 3s — gate is too strict',
      );

      // Sanity: timestamp delta between the two starts should be << 500ms
      // (true parallelism, not serialization). Allow up to 400ms slack for
      // BullMQ's poll cadence.
      const delta = Math.abs(factoryCalls[0].ts - factoryCalls[1].ts);
      assert(
        delta < 400,
        `cross-user starts not parallel: delta=${delta}ms (expected < 400ms)`,
      );

      // Wait for both to drain.
      await waitFor(
        async () =>
          (await runQueue.getActiveCount('u1')) === 0 &&
          (await runQueue.getActiveCount('u2')) === 0,
        3000,
        'active counters did not return to 0',
      );
    } finally {
      await runQueue.stop();
    }
  });

  // Test 4: factory throws → markError on RunStore + active counter ends 0.
  await test('factory throws → RunStore.markError called + counter clears', async () => {
    const factoryCalls: FactoryCall[] = [];
    const markErrorCalls: Array<{ runId: string; error: any }> = [];
    const fakeRunStore = {
      markError: async (runId: string, error: any) => {
        markErrorCalls.push({ runId, error });
      },
    } as unknown as InstanceType<typeof RunStore>;
    const runQueue = new RunQueue({
      redisClient: sharedRedis,
      runStore: fakeRunStore,
      livAgentRunnerFactory: recordingFactory(factoryCalls, {
        throwError: new Error('boom'),
      }),
      queueName: uniqueQueueName(),
    });
    try {
      await runQueue.start();
      await runQueue.enqueue({
        runId: 'r-fail',
        userId: 'u-fail',
        task: 't',
        enqueuedAt: Date.now(),
      });

      await waitFor(
        () => markErrorCalls.length === 1,
        5000,
        'markError was not called within 5s',
      );

      assert(markErrorCalls.length === 1, `expected 1 markError call, got ${markErrorCalls.length}`);
      assert(
        markErrorCalls[0].runId === 'r-fail',
        `runId mismatch: ${markErrorCalls[0].runId}`,
      );
      assert(
        markErrorCalls[0].error?.message === 'boom',
        `error.message mismatch: ${markErrorCalls[0].error?.message}`,
      );
      assert(
        typeof markErrorCalls[0].error?.stack === 'string',
        `expected error.stack to be a string, got ${typeof markErrorCalls[0].error?.stack}`,
      );

      // Active counter should drop to 0 (decremented in onJobFailed).
      await waitFor(
        async () => (await runQueue.getActiveCount('u-fail')) === 0,
        2000,
        'active counter did not return to 0 after failure',
      );
    } finally {
      await runQueue.stop();
    }
  });

  // Test 5: stop() closes worker; subsequent enqueue() throws "RunQueue stopped".
  await test('stop() closes worker; subsequent enqueue throws', async () => {
    const factoryCalls: FactoryCall[] = [];
    const runStore = new RunStore(sharedRedis);
    const runQueue = new RunQueue({
      redisClient: sharedRedis,
      runStore,
      livAgentRunnerFactory: recordingFactory(factoryCalls),
      queueName: uniqueQueueName(),
    });

    await runQueue.start();
    // One successful enqueue + drain to prove the queue was alive.
    await runQueue.enqueue({
      runId: 'r-stop',
      userId: 'u-stop',
      task: 't',
      enqueuedAt: Date.now(),
    });
    await waitFor(() => factoryCalls.length === 1, 5000, 'first job did not run');

    await runQueue.stop();

    // After stop(), enqueue MUST throw "RunQueue stopped".
    let threw = false;
    let errMsg = '';
    try {
      await runQueue.enqueue({
        runId: 'r-after-stop',
        userId: 'u-stop',
        task: 't',
        enqueuedAt: Date.now(),
      });
    } catch (e) {
      threw = true;
      errMsg = (e as Error).message;
    }
    assert(threw, 'enqueue after stop did not throw');
    assert(
      errMsg.includes('RunQueue stopped'),
      `error did not include "RunQueue stopped": ${errMsg}`,
    );
  });

  // ── Cleanup ───────────────────────────────────────────────────
  await sharedRedis.flushdb();
  await sharedRedis.quit();

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Test runner crashed:', e);
  process.exit(1);
});
