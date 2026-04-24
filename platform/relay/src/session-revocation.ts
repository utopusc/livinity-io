/**
 * Phase 14 SESS-03: Session Revocation Subscriber
 *
 * Subscribes to Redis channel 'livos:sessions:revoked' and closes any
 * DeviceConnection whose sessionId matches the revoked UUID. The
 * DeviceConnection.sessionId binding was established by Plan 14-01's
 * handshake: each bridge's sessionId is the user's sessions.id UUID
 * (carried through the device JWT's sessionId claim).
 *
 * ioredis subscribe mode is connection-exclusive: the subscribed client
 * cannot issue any other commands. Therefore index.ts MUST pass a
 * DEDICATED Redis instance (not the shared command client).
 */

import type { Redis } from 'ioredis';
import type { DeviceRegistry } from './device-registry.js';

export const SESSION_REVOKED_CHANNEL = 'livos:sessions:revoked';

/**
 * Start the subscriber. Returns the Redis client so index.ts can close it
 * during graceful shutdown.
 *
 * @param subscriber  A dedicated ioredis instance (NOT the shared command client)
 * @param deviceRegistry  The relay's DeviceRegistry to iterate on each revocation
 */
export function startSessionRevocationSubscriber(
  subscriber: Redis,
  deviceRegistry: DeviceRegistry,
): void {
  subscriber.subscribe(SESSION_REVOKED_CHANNEL, (err, count) => {
    if (err) {
      console.error(`[session-revocation] Failed to subscribe to ${SESSION_REVOKED_CHANNEL}:`, err.message);
      return;
    }
    console.log(`[session-revocation] Subscribed to ${SESSION_REVOKED_CHANNEL} (${count} total subscription(s))`);
  });

  subscriber.on('message', (channel, message) => {
    if (channel !== SESSION_REVOKED_CHANNEL) return;
    const revokedSessionId = message?.trim();
    if (!revokedSessionId) {
      console.warn('[session-revocation] Ignoring empty revocation message');
      return;
    }

    let closed = 0;
    for (const connection of deviceRegistry.allConnections()) {
      if (connection.sessionId === revokedSessionId) {
        try {
          // 4403 = session_revoked; distinct from Plan 14-01's 4401 token_expired.
          // The device agent must re-auth with a FRESH grant + NEW session before reconnecting.
          connection.ws.close(4403, 'session_revoked');
        } catch {
          // Already closed — DeviceConnection.destroy will clean up on ws close event
        }
        closed++;
        console.log(`[session-revocation] Closed bridge for session_revoked: device=${connection.deviceId} user=${connection.userId} session=${connection.sessionId}`);
      }
    }
    console.log(`[session-revocation] Revocation ${revokedSessionId}: closed ${closed} bridge(s)`);
  });

  subscriber.on('error', (err) => {
    // ioredis auto-reconnects; log but don't crash the relay
    console.error('[session-revocation] Subscriber error:', err.message);
  });
}
