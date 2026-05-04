/**
 * RunStore unit tests — Phase 67-01.
 *
 * Standalone tsx-runnable script (NOT vitest — matches the existing test:phase39
 * pattern in @nexus/core package.json). Top-level async IIFE with try/catch per
 * test case, exit 0 on all-pass, exit 1 on any failure.
 *
 * Test backend: ioredis-mock (in-process Redis emulator). If the require fails
 * (install drift), falls back to process.env.REDIS_URL with skip-if-absent
 * behaviour — this matches the dual-strategy escape hatch documented in
 * 67-01-PLAN.md action step 2.
 *
 * Run: `npx tsx nexus/packages/core/src/run-store.test.ts`
 */

import { setTimeout as sleep } from 'node:timers/promises';

// ── Redis client factory ─────────────────────────────────────────
// ioredis-mock exposes the same surface as ioredis: rpush, lrange, set, get,
// expire, ttl, publish, subscribe, duplicate(). Sufficient for all 6 tests.
let createRedis: () => any;
let usingMock = false;

try {
  // Dynamic import so a missing ioredis-mock falls through to REDIS_URL.
  const mod: any = await import('ioredis-mock');
  const RedisMock = mod.default ?? mod;
  createRedis = () => new RedisMock();
  usingMock = true;
} catch {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('REDIS_URL not set and ioredis-mock unavailable — RunStore tests skipped');
    process.exit(0);
  }
  const { Redis } = await import('ioredis');
  createRedis = () => new Redis(url, { maxRetriesPerRequest: null });
}

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

// ── Tests ────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`RunStore tests — backend: ${usingMock ? 'ioredis-mock' : 'real Redis'}`);

  // Test 1: createRun returns a valid UUID and persists meta.
  await test('createRun returns valid UUID + persists meta', async () => {
    const redis = createRedis();
    const store = new RunStore(redis);
    const runId = await store.createRun('user-1', 'hello world');
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(runId),
      `runId not a UUID v4-shape: ${runId}`);
    const meta = await store.getMeta(runId);
    assert(meta !== null, 'meta is null after createRun');
    assert(meta!.userId === 'user-1', `userId mismatch: ${meta!.userId}`);
    assert(meta!.task === 'hello world', `task mismatch: ${meta!.task}`);
    assert(meta!.status === 'queued', `status mismatch: ${meta!.status}`);
    assert(meta!.createdAt > 0, `createdAt not set: ${meta!.createdAt}`);
    await redis.quit();
  });

  // Test 2: appendChunk increments idx 0, 1, 2.
  await test('appendChunk increments idx monotonically', async () => {
    const redis = createRedis();
    const store = new RunStore(redis);
    const runId = await store.createRun('user-2', 't');
    const r0 = await store.appendChunk(runId, { type: 'text', payload: 'a' });
    const r1 = await store.appendChunk(runId, { type: 'text', payload: 'b' });
    const r2 = await store.appendChunk(runId, { type: 'reasoning', payload: 'thinking' });
    assert(r0.idx === 0, `first idx not 0: ${r0.idx}`);
    assert(r1.idx === 1, `second idx not 1: ${r1.idx}`);
    assert(r2.idx === 2, `third idx not 2: ${r2.idx}`);
    await redis.quit();
  });

  // Test 3: getChunks returns in order; fromIndex respected.
  await test('getChunks returns ordered slice from fromIndex', async () => {
    const redis = createRedis();
    const store = new RunStore(redis);
    const runId = await store.createRun('user-3', 't');
    await store.appendChunk(runId, { type: 'text', payload: 'first' });
    await store.appendChunk(runId, { type: 'text', payload: 'second' });
    await store.appendChunk(runId, { type: 'text', payload: 'third' });

    const all = await store.getChunks(runId, 0);
    assert(all.length === 3, `expected 3 chunks, got ${all.length}`);
    assert(all[0].idx === 0 && all[0].payload === 'first', `chunk[0] wrong: ${JSON.stringify(all[0])}`);
    assert(all[1].idx === 1 && all[1].payload === 'second', `chunk[1] wrong: ${JSON.stringify(all[1])}`);
    assert(all[2].idx === 2 && all[2].payload === 'third', `chunk[2] wrong: ${JSON.stringify(all[2])}`);

    const tail = await store.getChunks(runId, 2);
    assert(tail.length === 1, `expected 1 tail chunk, got ${tail.length}`);
    assert(tail[0].idx === 2 && tail[0].payload === 'third', `tail[0] wrong: ${JSON.stringify(tail[0])}`);

    const empty = await store.getChunks(runId, 99);
    assert(Array.isArray(empty) && empty.length === 0, `expected empty array, got ${JSON.stringify(empty)}`);
    await redis.quit();
  });

  // Test 4: subscribeChunks fires on append + unsubscribe stops further callbacks.
  await test('subscribeChunks fires on append, unsubscribe stops callback', async () => {
    const redis = createRedis();
    const store = new RunStore(redis);
    const runId = await store.createRun('user-4', 't');

    const received: any[] = [];
    const unsubscribe = await store.subscribeChunks(runId, (chunk) => {
      received.push(chunk);
    });

    await store.appendChunk(runId, { type: 'text', payload: 'pubsub-1' });
    // Pub/Sub is async — wait for callback to fire.
    const deadline = Date.now() + 2000;
    while (received.length === 0 && Date.now() < deadline) {
      await sleep(20);
    }
    assert(received.length === 1, `expected 1 received chunk, got ${received.length}`);
    assert(received[0].payload === 'pubsub-1', `received payload wrong: ${JSON.stringify(received[0])}`);
    assert(received[0].idx === 0, `received idx wrong: ${received[0].idx}`);

    await unsubscribe();

    // After unsubscribe, further appends should NOT trigger callback.
    await store.appendChunk(runId, { type: 'text', payload: 'after-unsub' });
    await sleep(200);
    assert(received.length === 1, `unsubscribe leaked: got ${received.length} callbacks after unsubscribe`);

    await redis.quit();
  });

  // Test 5: control set/get round-trip.
  await test('setControl / getControl round-trip', async () => {
    const redis = createRedis();
    const store = new RunStore(redis);
    const runId = await store.createRun('user-5', 't');

    const before = await store.getControl(runId);
    assert(before === null, `expected null before set, got ${JSON.stringify(before)}`);

    await store.setControl(runId, 'stop');

    const after = await store.getControl(runId);
    assert(after === 'stop', `expected 'stop' after set, got ${JSON.stringify(after)}`);

    await redis.quit();
  });

  // Test 6: TTL refresh on appendChunk.
  await test('TTL refresh on appendChunk keeps keys within 24h window', async () => {
    const redis = createRedis();
    const store = new RunStore(redis);
    const runId = await store.createRun('user-6', 't');

    // Manually shrink TTL to a small value, then verify appendChunk pushes it back.
    const chunksKey = `liv:agent_run:${runId}:chunks`;
    const metaKey = `liv:agent_run:${runId}:meta`;

    // Push a sentinel chunk first so chunks key exists, then shrink TTLs.
    await store.appendChunk(runId, { type: 'text', payload: 'sentinel' });
    await redis.expire(metaKey, 60);
    await redis.expire(chunksKey, 60);
    const ttlMetaBefore = await redis.ttl(metaKey);
    const ttlChunksBefore = await redis.ttl(chunksKey);
    assert(ttlMetaBefore > 0 && ttlMetaBefore <= 60, `meta TTL not shrunk: ${ttlMetaBefore}`);
    assert(ttlChunksBefore > 0 && ttlChunksBefore <= 60, `chunks TTL not shrunk: ${ttlChunksBefore}`);

    // Append should refresh TTLs back to ~24h.
    await store.appendChunk(runId, { type: 'text', payload: 'refresh' });
    const ttlMetaAfter = await redis.ttl(metaKey);
    const ttlChunksAfter = await redis.ttl(chunksKey);
    const TWENTY_FOUR_HOURS = 24 * 60 * 60;
    // Allow small slop because the mock clock is imprecise; refreshed TTL must be
    // strictly > the artificially-small window we set above.
    assert(ttlMetaAfter > ttlMetaBefore, `meta TTL not refreshed: before=${ttlMetaBefore} after=${ttlMetaAfter}`);
    assert(ttlChunksAfter > ttlChunksBefore, `chunks TTL not refreshed: before=${ttlChunksBefore} after=${ttlChunksAfter}`);
    assert(ttlMetaAfter <= TWENTY_FOUR_HOURS && ttlMetaAfter > TWENTY_FOUR_HOURS - 5,
      `meta TTL not within 24h window: ${ttlMetaAfter}`);
    assert(ttlChunksAfter <= TWENTY_FOUR_HOURS && ttlChunksAfter > TWENTY_FOUR_HOURS - 5,
      `chunks TTL not within 24h window: ${ttlChunksAfter}`);

    await redis.quit();
  });

  // Test 7 (bonus, satisfies behavior bullet on markComplete / markError):
  await test('markComplete + markError update meta.status', async () => {
    const redis = createRedis();
    const store = new RunStore(redis);

    const runIdA = await store.createRun('user-7', 'task-a');
    await store.markComplete(runIdA, { result: 'ok' });
    const metaA = await store.getMeta(runIdA);
    assert(metaA !== null, 'meta A null');
    assert(metaA!.status === 'complete', `markComplete status wrong: ${metaA!.status}`);
    assert(metaA!.completedAt && metaA!.completedAt > 0, `completedAt not set: ${metaA!.completedAt}`);
    assert(JSON.stringify(metaA!.finalResult) === JSON.stringify({ result: 'ok' }),
      `finalResult wrong: ${JSON.stringify(metaA!.finalResult)}`);

    const runIdB = await store.createRun('user-7', 'task-b');
    await store.markError(runIdB, { message: 'boom', stack: 'stack-trace' });
    const metaB = await store.getMeta(runIdB);
    assert(metaB !== null, 'meta B null');
    assert(metaB!.status === 'error', `markError status wrong: ${metaB!.status}`);
    assert(metaB!.error?.message === 'boom', `error.message wrong: ${metaB!.error?.message}`);

    await redis.quit();
  });

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Test runner crashed:', e);
  process.exit(1);
});
