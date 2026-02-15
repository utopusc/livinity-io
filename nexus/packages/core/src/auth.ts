import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

const LIV_API_KEY = process.env.LIV_API_KEY;

// Cached JWT secret (read once from /data/secrets/jwt)
let cachedJwtSecret: string | null = null;

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

    // Check loggedIn claim
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
 * Verify an API key using constant-time comparison.
 * Extracted from requireApiKey middleware for reuse (e.g., WebSocket upgrade).
 * Returns true if the key is valid.
 */
export function verifyApiKey(key: string): boolean {
  // If no API key configured, allow through (graceful degradation)
  if (!LIV_API_KEY) return true;

  try {
    const expectedBuffer = Buffer.from(LIV_API_KEY, 'utf8');
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
  // Graceful degradation: if no API key configured, allow requests through with warning
  if (!LIV_API_KEY) {
    logger.warn('[Auth] LIV_API_KEY not configured - running without authentication');
    next();
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
