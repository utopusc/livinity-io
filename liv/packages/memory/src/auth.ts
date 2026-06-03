/**
 * API Key Authentication Middleware for Memory Service
 * Uses constant-time comparison to prevent timing attacks
 */

import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware that requires a valid API key in the X-API-Key header.
 *
 * Phase 256-04 (LIVOS-025): FAILS CLOSED. The key is read at CALL time so a
 * late-seeded key is honored and tests can toggle it.
 * - If LIV_API_KEY is not configured: returns 503 (refuses — was: allow-through)
 * - If X-API-Key header is missing: returns 401
 * - If X-API-Key header is invalid: returns 401
 * - If X-API-Key header is valid: calls next()
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  // Phase 256-04 (LIVOS-025): FAIL CLOSED when the key is unset — refuse the
  // request (503) instead of disabling authentication. A dropped key must not
  // expose the memory API unauthenticated.
  const expected = process.env.LIV_API_KEY;
  if (!expected) {
    console.error('[Memory] LIV_API_KEY not configured — refusing requests (fail-closed)');
    res.status(503).json({ error: 'Server auth not configured' });
    return;
  }

  const providedKey = req.headers['x-api-key'];

  // Check if API key header is present
  if (!providedKey || typeof providedKey !== 'string') {
    res.status(401).json({
      error: 'Missing API key',
      hint: 'Provide X-API-Key header',
    });
    return;
  }

  try {
    // Convert to buffers for constant-time comparison
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(providedKey, 'utf8');

    // Check length first (required for timingSafeEqual)
    if (expectedBuffer.length !== providedBuffer.length) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    // Constant-time comparison to prevent timing attacks
    if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    // Valid API key
    next();
  } catch {
    // Any error during comparison should result in 401
    res.status(401).json({ error: 'Invalid API key' });
  }
}
