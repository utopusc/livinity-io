/**
 * Token Encryption — Phase 140-04, per-user key derivation added Phase 284 (v46.0)
 *
 * AES-256-GCM wrapper used by the SaaS provisioning flow to encrypt the
 * Cloudflare tunnel connector token before storing it as BYTEA in
 * `users.cf_tunnel_token_encrypted`. The plaintext token grants full
 * read/write on the user's tunnel, so it must never live at rest in the
 * database in clear form.
 *
 * Key material:
 *   `LIV_SECRET_KEY` env var — 64 hex chars (= 256 bits = 32 bytes), the
 *   master key. Generate with `openssl rand -hex 32`; set as a Vercel env
 *   secret (NOT in the DB). A DB leak alone never exposes tokens.
 *
 * Per-user derivation (Phase 284): when a `userId` is supplied, the actual
 * AES key is HKDF-SHA256(masterKey, salt=userId, info='cf-tunnel-token-v1').
 * This is defense-in-depth (key separation per tenant) — note it does NOT
 * protect against master-key compromise, since the salt (userId) is not
 * secret; that requires key rotation / a KMS, tracked separately. Decryption
 * is BACKWARD-COMPATIBLE: it tries the per-user key first, then falls back to
 * the master key so tokens written before this change still decrypt. On the
 * next write (reprovision / restore) a legacy blob is re-encrypted per-user.
 *
 * Validation strategy: LAZY / first-use (reading env at import would crash
 * unrelated route bundles during dev/build/lint if the var isn't set).
 *
 * Output layout (unchanged): `iv (12B) ‖ authTag (16B) ‖ ciphertext`.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // bytes — NIST-recommended for GCM
const AUTH_TAG_LEN = 16; // bytes — full GCM tag
const KEY_HEX_LEN = 64; // 32 bytes hex-encoded
const KEY_BYTES = 32; // AES-256
const HKDF_INFO = 'cf-tunnel-token-v1';

// ---------------------------------------------------------------------------
// Lazy master-key resolution
// ---------------------------------------------------------------------------

let _cachedKey: Buffer | null = null;

function resolveKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const hex = process.env.LIV_SECRET_KEY;
  if (!hex) {
    throw new Error(
      'token-encryption: LIV_SECRET_KEY env var is not set. ' +
        'Generate with `openssl rand -hex 32` and set it as a Vercel env secret.',
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
    throw new Error(
      `token-encryption: LIV_SECRET_KEY decoded to ${buf.length} bytes (expected ${KEY_BYTES}).`,
    );
  }

  _cachedKey = buf;
  return _cachedKey;
}

// HKDF-SHA256 → a 32-byte per-user key bound to the master key + userId salt.
function deriveUserKey(userId: string): Buffer {
  const okm = crypto.hkdfSync(
    'sha256',
    resolveKey(),
    Buffer.from(userId, 'utf8'),
    Buffer.from(HKDF_INFO, 'utf8'),
    KEY_BYTES,
  );
  return Buffer.from(okm);
}

/**
 * Test-only: reset the cached master key so the next call re-reads
 * `process.env.LIV_SECRET_KEY`.
 */
export function __resetKeyCacheForTests(): void {
  _cachedKey = null;
}

// ---------------------------------------------------------------------------
// Low-level GCM helpers
// ---------------------------------------------------------------------------

function encryptWith(key: Buffer, plaintext: string): Buffer {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

function decryptWith(key: Buffer, blob: Buffer): string {
  const iv = blob.subarray(0, IV_LEN);
  const authTag = blob.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const ciphertext = blob.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt a UTF-8 plaintext with AES-256-GCM. When `userId` is supplied the
 * key is HKDF-derived per user (preferred); otherwise the master key is used
 * directly (legacy callers + pure-crypto tests). Returns `iv ‖ authTag ‖ ct`.
 */
export async function encryptToken(plaintext: string, userId?: string): Promise<Buffer> {
  const key = userId ? deriveUserKey(userId) : resolveKey();
  return encryptWith(key, plaintext);
}

/**
 * Decrypt a blob from `encryptToken`. When `userId` is supplied, try the
 * per-user key first and fall back to the master key (so tokens written before
 * per-user derivation still decrypt). GCM's auth tag makes a wrong-key attempt
 * fail cleanly, so trying both keys is safe and unambiguous.
 *
 * Throws if the key is missing/malformed, the blob is shorter than
 * `iv + authTag` (28 bytes), or every candidate key fails to authenticate.
 */
export async function decryptToken(blob: Buffer, userId?: string): Promise<string> {
  if (blob.length < IV_LEN + AUTH_TAG_LEN) {
    throw new Error(
      `token-encryption: blob too short (${blob.length} bytes, need at least ${IV_LEN + AUTH_TAG_LEN}).`,
    );
  }

  const keys = userId ? [deriveUserKey(userId), resolveKey()] : [resolveKey()];
  let lastErr: unknown;
  for (const key of keys) {
    try {
      return decryptWith(key, blob);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('token-encryption: decryption failed (no candidate key authenticated).');
}
