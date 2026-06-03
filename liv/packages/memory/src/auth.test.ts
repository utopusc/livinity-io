/**
 * Phase 256-04 Task 3 — memory API auth fail-CLOSED (LIVOS-025).
 *
 * Locks: requireApiKey READS process.env.LIV_API_KEY at call time and FAILS
 * CLOSED (503, no next()) when unset; gates correctly when set.
 *
 * Runner: tsx + node:assert/strict. Run with: npx tsx src/auth.test.ts
 */
import assert from 'node:assert/strict';

const ORIGINAL = process.env.LIV_API_KEY;

const { requireApiKey } = await import('./auth.js');

type MockRes = {
  statusCode: number;
  body: unknown;
  status(code: number): MockRes;
  json(payload: unknown): MockRes;
};

function makeRes(): MockRes {
  return {
    statusCode: 0,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function makeReq(headers: Record<string, string> = {}) {
  return { headers } as any;
}

function test1_memoryFailClosedUnset() {
  delete process.env.LIV_API_KEY;
  let nextCalled = false;
  const res = makeRes();
  requireApiKey(makeReq({ 'x-api-key': 'whatever' }), res as any, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false, 'memory next() must NOT run when LIV_API_KEY unset');
  assert.equal(res.statusCode, 503, 'memory requireApiKey must return 503 when unset');
  console.log('  PASS: memory fails CLOSED (503) when LIV_API_KEY unset');
}

function test2_memoryPresent() {
  process.env.LIV_API_KEY = 'liv_memory_test_key_0123456789';

  let okNext = false;
  const okRes = makeRes();
  requireApiKey(makeReq({ 'x-api-key': 'liv_memory_test_key_0123456789' }), okRes as any, () => {
    okNext = true;
  });
  assert.equal(okNext, true, 'matching key → next()');

  let wrongNext = false;
  const wrongRes = makeRes();
  requireApiKey(makeReq({ 'x-api-key': 'wrong-key-of-some-length-zz' }), wrongRes as any, () => {
    wrongNext = true;
  });
  assert.equal(wrongNext, false, 'wrong key → no next()');
  assert.equal(wrongRes.statusCode, 401, 'wrong key → 401');

  console.log('  PASS: memory gates correctly when LIV_API_KEY set (match→next, wrong→401)');
}

async function main() {
  console.log('memory auth fail-closed (Phase 256-04 LIVOS-025):');
  test1_memoryFailClosedUnset();
  test2_memoryPresent();

  if (ORIGINAL === undefined) delete process.env.LIV_API_KEY;
  else process.env.LIV_API_KEY = ORIGINAL;

  console.log('ALL MEMORY AUTH TESTS PASSED');
}

await main();
