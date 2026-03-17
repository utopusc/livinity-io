/**
 * Relay Server Configuration
 *
 * All configuration is read from environment variables with sensible defaults.
 * Default values target local development; production overrides via env vars.
 */

function envInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (val === undefined) return defaultValue;
  const parsed = parseInt(val, 10);
  if (Number.isNaN(parsed)) {
    console.warn(`[config] Invalid integer for ${key}: "${val}", using default ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

function envStr(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  /** Port the relay HTTP/WS server listens on */
  RELAY_PORT: envInt('RELAY_PORT', 4000),

  /** PostgreSQL connection URL */
  DATABASE_URL: envStr('DATABASE_URL', 'postgresql://platform:LivPlatform2024!@localhost:5432/platform'),

  /** Redis connection URL */
  REDIS_URL: envStr('REDIS_URL', 'redis://:LivRelayRedis2024!@localhost:6379'),

  /** Base domain for subdomain parsing (e.g., "livinity.io") */
  RELAY_HOST: envStr('RELAY_HOST', 'livinity.io'),

  /** Maximum payload size in bytes (request + response bodies) */
  MAX_PAYLOAD_BYTES: envInt('MAX_PAYLOAD_BYTES', 50 * 1024 * 1024), // 50 MB

  /** Interval between heartbeat pings to tunnel clients */
  HEARTBEAT_INTERVAL_MS: envInt('HEARTBEAT_INTERVAL_MS', 30_000), // 30s

  /** Timeout for HTTP requests forwarded through the tunnel */
  REQUEST_TIMEOUT_MS: envInt('REQUEST_TIMEOUT_MS', 30_000), // 30s

  /** Timeout for WebSocket upgrade handshake through the tunnel */
  WS_UPGRADE_TIMEOUT_MS: envInt('WS_UPGRADE_TIMEOUT_MS', 10_000), // 10s

  /** Timeout for tunnel client authentication after WebSocket connect */
  AUTH_TIMEOUT_MS: envInt('AUTH_TIMEOUT_MS', 5_000), // 5s

  /** Grace period for tunnel client reconnection (keeps session alive) */
  RECONNECT_BUFFER_MS: envInt('RECONNECT_BUFFER_MS', 30_000), // 30s

  /** Maximum buffered requests during reconnect grace period */
  RECONNECT_BUFFER_MAX_REQUESTS: envInt('RECONNECT_BUFFER_MAX_REQUESTS', 100),

  /** Interval for flushing bandwidth counters from memory to PostgreSQL */
  BANDWIDTH_FLUSH_INTERVAL_MS: envInt('BANDWIDTH_FLUSH_INTERVAL_MS', 60_000), // 60s

  /** Free tier bandwidth limit per month in bytes (50 GB) */
  FREE_TIER_BYTES: envInt('FREE_TIER_BYTES', 53_687_091_200),

  /** TTL for cached API key auth results (avoids DB lookup on every message) */
  AUTH_CACHE_TTL_S: envInt('AUTH_CACHE_TTL_S', 300), // 5 min
} as const;

export type Config = typeof config;
