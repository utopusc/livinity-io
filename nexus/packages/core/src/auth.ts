import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

const LIV_API_KEY = process.env.LIV_API_KEY;

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

  try {
    // Convert both keys to buffers for constant-time comparison
    const expectedBuffer = Buffer.from(LIV_API_KEY, 'utf8');
    const providedBuffer = Buffer.from(providedKey, 'utf8');

    // Length must match for timingSafeEqual
    if (expectedBuffer.length !== providedBuffer.length) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    // Constant-time comparison to prevent timing attacks
    if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    // Valid API key - proceed to route handler
    next();
  } catch (err) {
    logger.error('[Auth] Error validating API key', { error: err instanceof Error ? err.message : String(err) });
    res.status(401).json({ error: 'Invalid API key' });
  }
}
