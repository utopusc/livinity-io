/**
 * Phase 14 SESS-03: Session Revocation Publisher
 *
 * When a user logs out (or a session is otherwise revoked), publishes the
 * session's UUID to the 'livos:sessions:revoked' Redis channel so that the
 * relay can close any device bridges bound to that session.
 *
 * The publisher is a module-level ioredis singleton — ioredis handles
 * reconnection internally, so we don't need per-request connection lifecycle.
 * If Redis is unavailable, PUBLISH fails silently (logged); logout still
 * succeeds locally and the device bridges will be closed at latest by the
 * next token-expiry watchdog cycle (Plan 14-01, 60s).
 */

import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

// Lazy singleton — instantiated on first publish call so that non-logout
// request paths don't pay the connection cost.
let publisher: Redis | null = null;

function getPublisher(): Redis {
  if (publisher === null) {
    publisher = new Redis(REDIS_URL, {
      // Fire-and-forget: we don't want logout waiting on reconnect backoff
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    publisher.on('error', (err) => {
      // Don't throw — publish failures must not break logout
      console.error('[session-revocation] Redis publisher error:', err.message);
    });
  }
  return publisher;
}

export const SESSION_REVOKED_CHANNEL = 'livos:sessions:revoked';

/**
 * Publish a session revocation event.
 * @param sessionId The sessions.id UUID of the revoked session.
 *                  This matches DeviceConnection.sessionId at the relay
 *                  (established by Plan 14-01's handshake binding).
 */
export async function publishSessionRevoked(sessionId: string): Promise<void> {
  if (!sessionId || typeof sessionId !== 'string') {
    console.warn('[session-revocation] Refusing to publish empty sessionId');
    return;
  }
  try {
    const pub = getPublisher();
    const receivers = await pub.publish(SESSION_REVOKED_CHANNEL, sessionId);
    console.log(`[session-revocation] Published ${sessionId} to ${SESSION_REVOKED_CHANNEL} (${receivers} receiver(s))`);
  } catch (err) {
    // Soft-fail: logout must not be blocked by Redis outage
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[session-revocation] publish failed for session ${sessionId}: ${msg}`);
  }
}
