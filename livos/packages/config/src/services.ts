import { z } from 'zod';

/**
 * Configuration schema for service URLs.
 * Defaults to localhost URLs for development.
 * Production values come from NEXUS_API_URL, MEMORY_SERVICE_URL, REDIS_URL environment variables.
 */
export const ServicesConfigSchema = z.object({
  /** Nexus API base URL */
  nexusApi: z.string().url().default('http://localhost:3200'),
  /** Memory service URL */
  memoryService: z.string().url().default('http://localhost:3300'),
  /** Redis URL (not validated as URL since redis:// scheme may not be recognized) */
  redis: z.string().default('redis://localhost:6379'),
});

export type ServicesConfig = z.infer<typeof ServicesConfigSchema>;
