/**
 * Token Encryption — Phase 140-04
 *
 * AES-256-GCM wrapper used by the SaaS register flow to encrypt the
 * Cloudflare tunnel connector token before storing it as BYTEA in
 * `users.cf_tunnel_token_encrypted`. The plaintext token grants full
 * read/write on the user's tunnel, so it must never live at rest in
 * the database in clear form.
 *
 * Key material:
 *   `LIV_SECRET_KEY` env var — 64 hex chars (= 256 bits = 32 bytes).
 *   Operator generates with `openssl rand -hex 32` and adds to
 *   `platform/web/ecosystem.config.cjs` on Server5 before this code
 *   path is exercised. Per 140-04 plan, this is a one-time deploy
 *   step that happens AFTER this code lands.
 *
 * Validation strategy: LAZY / first-use. Reading the env at module
 * import would crash every Next.js route bundle (including ones that
 * never touch encryption) during dev / build / lint if the var isn't
 * set. Instead we resolve the key on first call to `encryptToken` /
 * `decryptToken`, cache the Buffer, and throw a descriptive error if
 * the var is missing or malformed at that point. Subsequent calls
 * reuse the cached key.
 *
 * Output layout (returned by encryptToken / consumed by decryptToken):
 *
 *   ┌────────────────┬────────────────┬───────────────────────┐
 *   │  iv (12 bytes) │ authTag (16 B) │  ciphertext (var. len)│
 *   └────────────────┴────────────────┴───────────────────────┘
 *
 * The 12-byte IV is the standard recommendation for AES-GCM. The
 * 16-byte authentication tag is GCM's full-length tag — tampering
 * with iv, authTag, or ciphertext causes decrypt to throw.
 *
 * Both functions are declared `async` for future flexibility (e.g.
 * if we ever swap to a KMS-backed key resolution) but the current
 * implementation is fully synchronous Node `crypto` calls under the
 * hood — the Promise resolves on the same microtask.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // bytes — NIST-recommended for GCM
const AUTH_TAG_LEN = 16; // bytes — full GCM tag
const KEY_HEX_LEN = 64; // 32 bytes hex-encoded
const KEY_BYTES = 32; // AES-256

// ---------------------------------------------------------------------------
// Lazy key resolution
// ---------------------------------------------------------------------------

let _cachedKey: Buffer | null = null;

function resolveKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const hex = process.env.LIV_SECRET_KEY;
  if (!hex) {
    throw new Error(
      'token-encryption: LIV_SECRET_KEY env var is not set. ' +
        'Generate with `openssl rand -hex 32` and add to ' +
        'platform/web ecosystem.config.cjs, then pm2 reload web --update-env.',
    );
  }
  if (hex.length !== KEY_HEX_LEN) {
    throw new Error(
      `token-encryption: LIV_SECRET_KEY must be exactly ${KEY_HEX_LEN} hex chars ` +
        `(got ${hex.length}). Generate a fresh one with \`openssl rand -hex 32\`.`,
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      'token-encryption: LIV_SECRET_KEY contains non-hex characters. ' +
        'Generate a fresh one with `openssl rand -hex 32`.',
    );
  }

  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== KEY_BYTES) {
    // Defensive — should be unreachable given the hex-length + regex checks
    // above, but make the failure mode explicit if someone bypasses them.
    throw new Error(
      `token-encryption: LIV_SECRET_KEY decoded to ${buf.length} bytes (expected ${KEY_BYTES}).`,
    );
  }

  _cachedKey = buf;
  return _cachedKey;
}

/**
 * Test-only: reset the cached key so the next call re-reads
 * `process.env.LIV_SECRET_KEY`. Not part of the public API; only
 * intended for `token-encryption.test.ts`.
 */
export function __resetKeyCacheForTests(): void {
  _cachedKey = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt a UTF-8 plaintext string with AES-256-GCM under `LIV_SECRET_KEY`.
 * Returns a single Buffer with layout `iv ‖ authTag ‖ ciphertext` suitable
 * for direct storage as a Postgres BYTEA column.
 *
 * Throws if `LIV_SECRET_KEY` is missing or malformed (lazy validation).
 */
export async function encryptToken(plaintext: string): Promise<Buffer> {
  const key = resolveKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/**
 * Decrypt a blob produced by `encryptToken`. Returns the original UTF-8
 * plaintext string.
 *
 * Throws if `LIV_SECRET_KEY` is missing or malformed (lazy validation),
 * the blob is shorter than `iv + authTag` (12 + 16 = 28 bytes), the
 * auth tag fails to verify (wrong key, tampered ciphertext, or tampered
 * tag), or decoding the resulting plaintext as UTF-8 fails.
 */
export async function decryptToken(blob: Buffer): Promise<string> {
  const key = resolveKey();
  if (blob.length < IV_LEN + AUTH_TAG_LEN) {
    throw new Error(
      `token-encryption: blob too short (${blob.length} bytes, need at least ${IV_LEN + AUTH_TAG_LEN}).`,
    );
  }
  const iv = blob.subarray(0, IV_LEN);
  const authTag = blob.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const ciphertext = blob.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
