import { z } from 'zod';

/**
 * Configuration schema for domain settings.
 * Defaults to localhost for development.
 * Production values come from LIVOS_DOMAIN and LIVOS_USE_HTTPS environment variables.
 */
export const DomainsConfigSchema = z.object({
  /** Primary domain for the installation */
  primary: z.string().default('localhost'),
  /** Whether to use HTTPS */
  useHttps: z.boolean().default(false),
  /** Marketplace/app store domain */
  marketplace: z.string().default('apps.livinity.io'),
  /** API subdomain prefix (combined with primary to form api.{primary}) */
  api: z.string().default('api'),
});

export type DomainsConfig = z.infer<typeof DomainsConfigSchema>;
