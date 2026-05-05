/**
 * run-recovery.test.ts — Phase 73-05.
 *
 * Standalone tsx-runnable script (matches P67-01 run-store.test.ts harness).
 * Backend: ioredis-mock (in-process Redis emulator); fall through to
 * process.env.REDIS_URL if the mock is unavailable; skip-with-warning if
 * neither path works.
 *
 * Run: `pnpm --filter @liv/core exec tsx src/run-recovery.test.ts`
 *
 * Coverage (4 tests per Plan 73-05 Task 2 behavior):
 *   1. listRuns: empty Redis → []
 *   2. listRuns: filters by userId AND status compose with AND
 *   3. recoverIncompleteRuns 'log-only' mode does NOT mutate Redis
 *   4. recoverIncompleteRuns 'mark-stale' mode marks stale runs as 'error'
 *      with literal message 'orphaned by daemon restart'.
 */

import { setTimeout as sleep } from 'node:timers/promises';

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
    console.warn(
      'REDIS_URL not set and ioredis-mock unavailable — run-recovery tests skipped',
    );
    process.exit(0);
  }
  const { Redis } = await import('ioredis');
  createRedis = () => new Redis(url, { maxRetriesPerRequest: null });
}

const { RunStore } = await import('./run-store.js');
const { recoverIncompleteRuns } = await import('./run-recovery.js');

// ── Test harness (matches run-store.test.ts) ─────────────────────
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

// ── Tests ────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(
    `run-recovery tests — backend: ${usingMock ? 'ioredis-mock' : 'real Redis'}`,
  );

  // Test 1: listRuns on empty Redis returns [].
  await test('listRuns: empty Redis returns []', async () => {
    const redis = createRedis();
    // ioredis-mock shares a process-wide keyspace across `new RedisMock()`
    // instances — flush before each test to prevent cross-test bleed.
    await redis.flushall();
    const store = new RunStore(redis);
    const runs = await store.listRuns();
    assert(Array.isArray(runs), 'listRuns did not return an array');
    assert(runs.length === 0, `expected [], got ${runs.length} entries`);
    await redis.quit();
  });

  // Test 2: listRuns filters by userId AND status (AND-composed).
  await test('listRuns: filters by userId AND status', async () => {
    const redis = createRedis();
    // ioredis-mock shares a process-wide keyspace across `new RedisMock()`
    // instances — flush before each test to prevent cross-test bleed.
    await redis.flushall();
    const store = new RunStore(redis);

    // Insert 3 runs with varied userIds + statuses.
    const runIdA = await store.createRun('alice', 'task-1'); // queued
    const runIdB = await store.createRun('bob', 'task-2'); // running (mark below)
    const runIdC = await store.createRun('alice', 'task-3'); // complete (mark below)

    // Manually bump statuses by writing the meta JSON directly — RunStore
    // doesn't have a public 'mark-running' helper but appendChunk implicitly
    // keeps status='queued', so we patch the meta key.
    const metaB = await store.getMeta(runIdB);
    metaB!.status = 'running';
    await redis.set(`liv:agent_run:${runIdB}:meta`, JSON.stringify(metaB));

    await store.markComplete(runIdC, { ok: true });

    // Filter: all
    const all = await store.listRuns();
    assert(all.length === 3, `expected 3 total, got ${all.length}`);

    // Filter: userId=alice → expect 2 (queued + complete)
    const aliceRuns = await store.listRuns({ userId: 'alice' });
    assert(
      aliceRuns.length === 2,
      `userId=alice: expected 2, got ${aliceRuns.length}`,
    );
    for (const r of aliceRuns) {
      assert(
        r.meta.userId === 'alice',
        `wrong userId in alice filter: ${r.meta.userId}`,
      );
    }

    // Filter: status=running → expect 1 (bob)
    const runningRuns = await store.listRuns({ status: 'running' });
    assert(
      runningRuns.length === 1,
      `status=running: expected 1, got ${runningRuns.length}`,
    );
    assert(
      runningRuns[0].meta.userId === 'bob',
      `running user mismatch: ${runningRuns[0].meta.userId}`,
    );

    // Filter: AND — userId=alice + status=complete → expect 1
    const aliceCompleteRuns = await store.listRuns({
      userId: 'alice',
      status: 'complete',
    });
    assert(
      aliceCompleteRuns.length === 1,
      `userId=alice+complete: expected 1, got ${aliceCompleteRuns.length}`,
    );
    assert(
      aliceCompleteRuns[0].runId === runIdC,
      `runId mismatch on alice+complete filter`,
    );

    // Filter: status=error → expect 0
    const errorRuns = await store.listRuns({ status: 'error' });
    assert(
      errorRuns.length === 0,
      `status=error: expected 0, got ${errorRuns.length}`,
    );

    await redis.quit();
  });

  // Test 3: recoverIncompleteRuns 'log-only' does NOT mutate Redis.
  await test(
    "recoverIncompleteRuns in 'log-only' mode does NOT mutate Redis",
    async () => {
      const redis = createRedis();
      await redis.flushall();
      const store = new RunStore(redis);

      // Insert a stale 'running' run with last chunk 10 minutes old.
      const runId = await store.createRun('user-stale', 'old-task');
      const metaStale = await store.getMeta(runId);
      metaStale!.status = 'running';
      await redis.set(
        `liv:agent_run:${runId}:meta`,
        JSON.stringify(metaStale),
      );
      // Inject a chunk with ts = now - 10 min via appendChunk's `ts` override
      // (P67-01 D-09 — supported per the reference signature).
      const tenMinAgo = Date.now() - 10 * 60 * 1000;
      await store.appendChunk(runId, {
        type: 'text',
        payload: 'old',
        ts: tenMinAgo,
      });

      const logs: string[] = [];
      const result = await recoverIncompleteRuns(store, {
        mode: 'log-only',
        logger: {
          log: (m: string) => logs.push(m),
          warn: (m: string) => logs.push(`WARN ${m}`),
        },
      });

      assert(
        result.scanned === 1,
        `expected scanned=1, got ${result.scanned}`,
      );
      assert(
        result.stale === 1,
        `expected stale=1, got ${result.stale}`,
      );
      assert(
        result.markedStale === 0,
        `expected markedStale=0 in log-only mode, got ${result.markedStale}`,
      );

      // Crucial assertion: status is STILL 'running' — Redis NOT mutated.
      const metaAfter = await store.getMeta(runId);
      assert(
        metaAfter !== null,
        'meta missing after log-only recovery (should not happen)',
      );
      assert(
        metaAfter!.status === 'running',
        `log-only mutated status: expected 'running', got '${metaAfter!.status}'`,
      );
      assert(
        metaAfter!.error === undefined,
        `log-only mutated error: ${JSON.stringify(metaAfter!.error)}`,
      );

      // Sanity: at least one log line referencing 'STALE'.
      const hasStaleLog = logs.some((l) => l.includes('STALE'));
      assert(
        hasStaleLog,
        `expected STALE log line, got: ${JSON.stringify(logs)}`,
      );

      await redis.quit();
    },
  );

  // Test 4: recoverIncompleteRuns 'mark-stale' marks stale runs as 'error'.
  await test(
    "recoverIncompleteRuns in 'mark-stale' mode marks stale runs as error",
    async () => {
      const redis = createRedis();
      await redis.flushall();
      const store = new RunStore(redis);

      // Stale running run (last chunk 10 min old)
      const staleRunId = await store.createRun('user-A', 'stale-task');
      const metaStale = await store.getMeta(staleRunId);
      metaStale!.status = 'running';
      await redis.set(
        `liv:agent_run:${staleRunId}:meta`,
        JSON.stringify(metaStale),
      );
      const tenMinAgo = Date.now() - 10 * 60 * 1000;
      await store.appendChunk(staleRunId, {
        type: 'text',
        payload: 'old',
        ts: tenMinAgo,
      });

      // Active running run (chunk 1 min old) — should NOT be marked.
      const activeRunId = await store.createRun('user-B', 'active-task');
      const metaActive = await store.getMeta(activeRunId);
      metaActive!.status = 'running';
      await redis.set(
        `liv:agent_run:${activeRunId}:meta`,
        JSON.stringify(metaActive),
      );
      const oneMinAgo = Date.now() - 60 * 1000;
      await store.appendChunk(activeRunId, {
        type: 'text',
        payload: 'recent',
        ts: oneMinAgo,
      });

      // Complete run (should not be scanned at all)
      const doneRunId = await store.createRun('user-C', 'done-task');
      await store.markComplete(doneRunId, { ok: true });

      const result = await recoverIncompleteRuns(store, {
        mode: 'mark-stale',
        // Use default staleAfterMs = 5 min
      });

      assert(
        result.scanned === 2,
        `expected scanned=2 (running + queued, NO complete), got ${result.scanned}`,
      );
      assert(
        result.stale === 1,
        `expected stale=1 (only the 10-min-old run), got ${result.stale}`,
      );
      assert(
        result.markedStale === 1,
        `expected markedStale=1, got ${result.markedStale}`,
      );

      // Stale run should now be in 'error' state with the exact message.
      const metaStaleAfter = await store.getMeta(staleRunId);
      assert(
        metaStaleAfter !== null,
        'stale-run meta missing after mark-stale',
      );
      assert(
        metaStaleAfter!.status === 'error',
        `expected stale-run status='error', got '${metaStaleAfter!.status}'`,
      );
      assert(
        metaStaleAfter!.error?.message === 'orphaned by daemon restart',
        `wrong error.message: ${JSON.stringify(metaStaleAfter!.error)}`,
      );

      // Active run must NOT be touched.
      const metaActiveAfter = await store.getMeta(activeRunId);
      assert(
        metaActiveAfter !== null,
        'active-run meta missing (should never mutate)',
      );
      assert(
        metaActiveAfter!.status === 'running',
        `active run was wrongly mutated: status='${metaActiveAfter!.status}'`,
      );

      await redis.quit();
    },
  );

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

// Defensive: avoid unhandled-promise-rejection crash on Windows.
await sleep(0);
main().catch((e) => {
  console.error('Test runner crashed:', e);
  process.exit(1);
});
