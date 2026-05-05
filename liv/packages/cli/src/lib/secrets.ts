import { randomBytes } from 'node:crypto';

/**
 * Generate a cryptographically secure hex string.
 * @param bytes Number of random bytes (output is 2x chars as hex)
 */
export function generateSecret(bytes: number = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Generate a Redis-safe password (24 bytes = 48 hex chars).
 * All hex chars are alphanumeric-safe for embedding in URLs without encoding.
 */
export function generateRedisPassword(): string {
  return generateSecret(24);
}

/**
 * Generate a 32-byte (64 hex char) key suitable for JWT_SECRET or LIV_API_KEY.
 */
export function generateApiKey(): string {
  return generateSecret(32);
}
