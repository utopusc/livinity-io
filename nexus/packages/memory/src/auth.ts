/**
 * API Key Authentication Middleware for Memory Service
 * Uses constant-time comparison to prevent timing attacks
 */

import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const LIV_API_KEY = process.env.LIV_API_KEY;

/**
 * Middleware that requires a valid API key in the X-API-Key header.
 *
 * - If LIV_API_KEY is not configured: logs warning and allows request (graceful degradation)
 * - If X-API-Key header is missing: returns 401
 * - If X-API-Key header is invalid: returns 401
 * - If X-API-Key header is valid: calls next()
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  // Graceful degradation: if no API key configured, warn and allow
  if (!LIV_API_KEY) {
    console.warn('[Memory] LIV_API_KEY not configured - authentication disabled');
    next();
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
    const expectedBuffer = Buffer.from(LIV_API_KEY, 'utf8');
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
