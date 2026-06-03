import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

// Phase 256-04 (LIVOS-014): LIV_API_KEY is read at CALL time inside
// verifyApiKey/requireApiKey (so a late-seeded key is honored and the fns can
// fail closed) — no module-load capture (which would freeze an unset value).

// Cached JWT secret (read once from /data/secrets/jwt)
let cachedJwtSecret: string | null = null;

/**
 * Decoded JWT payload from a LivOS token.
 * Legacy tokens only have { loggedIn: true }.
 * New multi-user tokens also include userId and role.
 */
export type JwtPayload = {
  loggedIn: boolean;
  userId?: string;
  role?: string;
  exp?: number;
  iat?: number;
};

/**
 * Read the JWT secret from disk and cache it.
 * Path: /data/secrets/jwt (plain text file)
 */
async function getJwtSecret(): Promise<string | null> {
  if (cachedJwtSecret !== null) return cachedJwtSecret;
  try {
    const secret = (await readFile('/data/secrets/jwt', 'utf8')).trim();
    if (secret) {
      cachedJwtSecret = secret;
      return secret;
    }
  } catch (err: any) {
    logger.warn('[Auth] Could not read JWT secret from /data/secrets/jwt', { error: err.message });
  }
  return null;
}

/**
 * Base64url decode (JWT uses base64url, not standard base64).
 */
function base64urlDecode(str: string): Buffer {
  // Replace URL-safe chars back to standard base64
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Pad if needed
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

/**
 * Verify a JWT token manually using HMAC-SHA256 (HS256).
 * No external dependency needed -- uses Node's crypto module.
 *
 * Checks:
 * 1. Valid 3-part JWT structure
 * 2. HMAC-SHA256 signature matches
 * 3. Payload contains { loggedIn: true }
 * 4. Token is not expired (if exp claim exists)
 *
 * Accepts both legacy {loggedIn: true} and new {loggedIn: true, userId, role} tokens.
 */
export async function verifyJwt(token: string): Promise<boolean> {
  const secret = await getJwtSecret();
  if (!secret) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  try {
    // Verify header algorithm
    const header = JSON.parse(base64urlDecode(parts[0]).toString('utf8'));
    if (header.alg !== 'HS256') return false;

    // Verify signature
    const signingInput = `${parts[0]}.${parts[1]}`;
    const expectedSig = createHmac('sha256', secret).update(signingInput).digest();
    const actualSig = base64urlDecode(parts[2]);

    if (expectedSig.length !== actualSig.length) return false;
    if (!timingSafeEqual(expectedSig, actualSig)) return false;

    // Decode and verify payload
    const payload = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));

    // Check loggedIn claim (required for both legacy and new tokens)
    if (payload.loggedIn !== true) return false;

    // Check expiration if present
    if (payload.exp && typeof payload.exp === 'number') {
      if (Date.now() / 1000 > payload.exp) return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Verify a JWT and return the decoded payload (including userId if present).
 * Returns null if verification fails.
 */
export async function verifyAndDecodeJwt(token: string): Promise<JwtPayload | null> {
  const secret = await getJwtSecret();
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    // Verify header algorithm
    const header = JSON.parse(base64urlDecode(parts[0]).toString('utf8'));
    if (header.alg !== 'HS256') return null;

    // Verify signature
    const signingInput = `${parts[0]}.${parts[1]}`;
    const expectedSig = createHmac('sha256', secret).update(signingInput).digest();
    const actualSig = base64urlDecode(parts[2]);

    if (expectedSig.length !== actualSig.length) return null;
    if (!timingSafeEqual(expectedSig, actualSig)) return null;

    // Decode payload
    const payload = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));

    // Check loggedIn claim
    if (payload.loggedIn !== true) return null;

    // Check expiration
    if (payload.exp && typeof payload.exp === 'number') {
      if (Date.now() / 1000 > payload.exp) return null;
    }

    return {
      loggedIn: true,
      userId: payload.userId,
      role: payload.role,
      exp: payload.exp,
      iat: payload.iat,
    };
  } catch {
    return null;
  }
}

/**
 * Extract userId from a request's JWT token (if present).
 * Checks Authorization header first, then LIVINITY_SESSION cookie.
 * Returns undefined for legacy tokens without userId.
 */
export async function extractUserIdFromRequest(req: Request): Promise<string | undefined> {
  // Try Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyAndDecodeJwt(token);
    if (payload?.userId) return payload.userId;
  }

  // Try LIVINITY_SESSION cookie (forwarded from livinityd proxy)
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.match(/LIVINITY_SESSION=([^;]+)/);
    if (match) {
      const payload = await verifyAndDecodeJwt(match[1]);
      if (payload?.userId) return payload.userId;
    }
  }

  return undefined;
}

/**
 * Verify an API key using constant-time comparison.
 * Extracted from requireApiKey middleware for reuse (e.g., WebSocket upgrade).
 * Returns true if the key is valid.
 */
export function verifyApiKey(key: string): boolean {
  // Phase 256-04 (LIVOS-014/018/019): read the key at CALL time (so a
  // late-seeded key is honored and tests can toggle it) and FAIL CLOSED —
  // if no API key is configured, reject ALL keys (was: fail-open `return true`,
  // which silently disabled auth on every /api route incl. skill-install RCE).
  const expected = process.env.LIV_API_KEY;
  if (!expected) return false;

  try {
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(key, 'utf8');

    if (expectedBuffer.length !== providedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}

/**
 * API key authentication middleware for Nexus API.
 * Validates X-API-Key header against LIV_API_KEY environment variable.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  // Phase 256-04 (LIVOS-014/018/019): FAIL CLOSED. Read the key at CALL time;
  // if LIV_API_KEY is unset, REFUSE the request (503) instead of running next()
  // — an env/deploy regression that drops the key must NOT expose the
  // unauthenticated agent-RCE surface (/api/skills/install etc.).
  const expected = process.env.LIV_API_KEY;
  if (!expected) {
    logger.error('[Auth] LIV_API_KEY not configured — refusing requests (fail-closed)');
    res.status(503).json({ error: 'Server auth not configured' });
    return;
  }

  const providedKey = req.headers['x-api-key'];

  // Check if API key header is present
  if (!providedKey || typeof providedKey !== 'string') {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }

  if (verifyApiKey(providedKey)) {
    next();
  } else {
    res.status(401).json({ error: 'Invalid API key' });
  }
}
