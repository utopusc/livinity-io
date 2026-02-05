import 'dotenv/config';

/**
 * Helper to access environment variables with optional default values.
 * Centralizes all process.env access for the config package.
 */
export function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

/**
 * Get an environment variable or throw if not set and no default provided.
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}
