/**
 * Phase 256-04 Task 3 — liv-core API auth fail-CLOSED (LIVOS-014/018/019).
 *
 * Locks: requireApiKey + verifyApiKey READ process.env.LIV_API_KEY at call
 * time and FAIL CLOSED when it is unset:
 *   - verifyApiKey('') / any key → false when LIV_API_KEY unset (was true).
 *   - requireApiKey → 503 (NOT next()) when LIV_API_KEY unset.
 *   - With LIV_API_KEY set: matching X-API-Key → next(); wrong → 401; missing → 401.
 *
 * Runner: tsx + node:assert/strict. Run with: npx tsx src/auth.test.ts
 */
import assert from 'node:assert/strict';

const ORIGINAL = process.env.LIV_API_KEY;

// Import after we can toggle env; the impl must read env at CALL time, so the
// static import is fine — each test sets/clears process.env.LIV_API_KEY first.
const { requireApiKey, verifyApiKey } = await import('./auth.js');

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

function test1_coreFailClosedUnset() {
  delete process.env.LIV_API_KEY;
  // verifyApiKey returns false (not true) when unset
  assert.equal(verifyApiKey('anything'), false, 'verifyApiKey must FAIL CLOSED (false) when LIV_API_KEY unset');

  // requireApiKey 503 + does NOT call next()
  let nextCalled = false;
  const res = makeRes();
  requireApiKey(makeReq({ 'x-api-key': 'whatever' }), res as any, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false, 'next() must NOT run when LIV_API_KEY unset');
  assert.equal(res.statusCode, 503, 'requireApiKey must return 503 when unset');
  console.log('  PASS: core fails CLOSED (503 + verifyApiKey=false) when LIV_API_KEY unset');
}

function test2_corePresent() {
  process.env.LIV_API_KEY = 'liv_core_test_key_0123456789';

  // matching → next()
  let okNext = false;
  const okRes = makeRes();
  requireApiKey(makeReq({ 'x-api-key': 'liv_core_test_key_0123456789' }), okRes as any, () => {
    okNext = true;
  });
  assert.equal(okNext, true, 'matching key → next()');
  assert.equal(verifyApiKey('liv_core_test_key_0123456789'), true, 'verifyApiKey true for matching key');

  // wrong → 401
  let wrongNext = false;
  const wrongRes = makeRes();
  requireApiKey(makeReq({ 'x-api-key': 'wrong-key-of-some-length-here' }), wrongRes as any, () => {
    wrongNext = true;
  });
  assert.equal(wrongNext, false, 'wrong key → no next()');
  assert.equal(wrongRes.statusCode, 401, 'wrong key → 401');

  // missing → 401
  let missNext = false;
  const missRes = makeRes();
  requireApiKey(makeReq({}), missRes as any, () => {
    missNext = true;
  });
  assert.equal(missNext, false, 'missing key → no next()');
  assert.equal(missRes.statusCode, 401, 'missing key → 401');

  console.log('  PASS: core gates correctly when LIV_API_KEY set (match→next, wrong→401, missing→401)');
}

async function main() {
  console.log('liv-core auth fail-closed (Phase 256-04 LIVOS-014/018/019):');
  test1_coreFailClosedUnset();
  test2_corePresent();

  if (ORIGINAL === undefined) delete process.env.LIV_API_KEY;
  else process.env.LIV_API_KEY = ORIGINAL;

  console.log('ALL CORE AUTH TESTS PASSED');
}

await main();
