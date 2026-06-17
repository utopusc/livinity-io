/**
 * token-encryption.test.ts — Phase 140-04
 *
 * Pure crypto roundtrip tests. No DB, no network, no env beyond an
 * explicit LIV_SECRET_KEY set per-test. Runnable with:
 *
 *   cd platform/web && npx tsx --test src/lib/token-encryption.test.ts
 *
 * Covers:
 *   - encrypt/decrypt roundtrip
 *   - distinct ciphertexts for the same plaintext (IV randomness)
 *   - wrong key fails to decrypt
 *   - tampered ciphertext fails
 *   - tampered authTag fails
 *   - tampered IV fails
 *   - truncated blob fails
 *   - missing key throws
 *   - malformed key (wrong length / non-hex) throws
 *
 * The module reads LIV_SECRET_KEY lazily on first call and caches the
 * Buffer, so each test sets the env value, calls
 * `__resetKeyCacheForTests()`, and re-imports nothing (functions are
 * imported once at the top — only the cached key needs to be
 * invalidated between key-switching tests).
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  __resetKeyCacheForTests,
  decryptToken,
  encryptToken,
} from './token-encryption';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

function setKey(hex: string): void {
  process.env.LIV_SECRET_KEY = hex;
  __resetKeyCacheForTests();
}

function unsetKey(): void {
  delete process.env.LIV_SECRET_KEY;
  __resetKeyCacheForTests();
}

test('encrypt/decrypt roundtrip preserves plaintext', async () => {
  setKey(KEY_A);
  const plaintext =
    'eyJhIjoiZmFrZS1jZi10dW5uZWwtdG9rZW4iLCJ0IjoxfQ.fakefakefakefakefakefakefakefake';
  const blob = await encryptToken(plaintext);
  const recovered = await decryptToken(blob);
  assert.equal(recovered, plaintext);
});

test('roundtrip works for empty string', async () => {
  setKey(KEY_A);
  const blob = await encryptToken('');
  // 12 (iv) + 16 (authTag) + 0 (ciphertext) = 28
  assert.equal(blob.length, 28);
  assert.equal(await decryptToken(blob), '');
});

test('roundtrip works for unicode plaintext', async () => {
  setKey(KEY_A);
  const plaintext = 'Ç-ö-ñ-€-🔐-中-token';
  const blob = await encryptToken(plaintext);
  assert.equal(await decryptToken(blob), plaintext);
});

test('two encryptions of the same plaintext produce distinct ciphertexts (random IV)', async () => {
  setKey(KEY_A);
  const plaintext = 'same-input-different-iv';
  const a = await encryptToken(plaintext);
  const b = await encryptToken(plaintext);
  assert.notEqual(a.toString('hex'), b.toString('hex'));
  assert.equal(await decryptToken(a), plaintext);
  assert.equal(await decryptToken(b), plaintext);
});

test('wrong key fails to decrypt', async () => {
  setKey(KEY_A);
  const blob = await encryptToken('cf-tunnel-token-123');
  setKey(KEY_B);
  await assert.rejects(() => decryptToken(blob));
});

test('tampered ciphertext byte fails to decrypt', async () => {
  setKey(KEY_A);
  const blob = await encryptToken('cf-tunnel-token-with-some-length');
  // Flip a byte deep in the ciphertext region (after iv + authTag = 28).
  const tampered = Buffer.from(blob);
  tampered[tampered.length - 1] ^= 0xff;
  await assert.rejects(() => decryptToken(tampered));
});

test('tampered authTag fails to decrypt', async () => {
  setKey(KEY_A);
  const blob = await encryptToken('cf-tunnel-token-authtag-tamper');
  const tampered = Buffer.from(blob);
  // authTag occupies bytes [12, 28). Flip byte 20.
  tampered[20] ^= 0x01;
  await assert.rejects(() => decryptToken(tampered));
});

test('tampered IV fails to decrypt (authTag verification catches it)', async () => {
  setKey(KEY_A);
  const blob = await encryptToken('cf-tunnel-token-iv-tamper');
  const tampered = Buffer.from(blob);
  tampered[0] ^= 0xff;
  await assert.rejects(() => decryptToken(tampered));
});

test('truncated blob fails to decrypt with descriptive error', async () => {
  setKey(KEY_A);
  // Anything shorter than iv (12) + authTag (16) = 28 bytes.
  await assert.rejects(
    () => decryptToken(Buffer.alloc(10)),
    /blob too short/,
  );
});

test('missing LIV_SECRET_KEY throws descriptive error on first use', async () => {
  unsetKey();
  await assert.rejects(
    () => encryptToken('anything'),
    /LIV_SECRET_KEY env var is not set/,
  );
});

test('malformed LIV_SECRET_KEY (wrong length) throws', async () => {
  setKey('a'.repeat(32)); // too short
  await assert.rejects(
    () => encryptToken('anything'),
    /must be exactly 64 hex chars/,
  );
});

test('malformed LIV_SECRET_KEY (non-hex) throws', async () => {
  setKey('z'.repeat(64));
  await assert.rejects(
    () => encryptToken('anything'),
    /contains non-hex characters/,
  );
});

test('key resolution is cached — repeated calls reuse the same key', async () => {
  setKey(KEY_A);
  // First call resolves + caches.
  const blob = await encryptToken('cached-key-test');
  // Mutate env underneath; cache should still hold KEY_A so decrypt works.
  process.env.LIV_SECRET_KEY = KEY_B;
  // Note: NO __resetKeyCacheForTests() — that's the whole point.
  assert.equal(await decryptToken(blob), 'cached-key-test');
});

// ── Per-user key derivation (Phase 284) ────────────────────────────────────

test('per-user roundtrip: encrypt + decrypt under the same userId', async () => {
  setKey(KEY_A);
  const pt = 'cf-tunnel-token-per-user';
  const blob = await encryptToken(pt, 'user-123');
  assert.equal(await decryptToken(blob, 'user-123'), pt);
});

test('a per-user blob does NOT decrypt under a different userId', async () => {
  setKey(KEY_A);
  const blob = await encryptToken('secret', 'user-A');
  await assert.rejects(() => decryptToken(blob, 'user-B'));
});

test('legacy master-key blob still decrypts when a userId is supplied (fallback)', async () => {
  setKey(KEY_A);
  const legacy = await encryptToken('legacy-token'); // no userId → master key
  // A reader that now passes userId must still recover pre-migration tokens.
  assert.equal(await decryptToken(legacy, 'user-123'), 'legacy-token');
});
