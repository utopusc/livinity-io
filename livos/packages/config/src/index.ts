import 'dotenv/config';
import { PathsConfigSchema, type PathsConfig } from './paths.js';
import { DomainsConfigSchema, type DomainsConfig } from './domains.js';
import { ServicesConfigSchema, type ServicesConfig } from './services.js';

/**
 * Paths configuration loaded from environment variables with LIVOS_/NEXUS_ prefix.
 * Frozen to prevent runtime mutations.
 */
export const paths: PathsConfig = Object.freeze(PathsConfigSchema.parse({
  base: process.env.LIVOS_BASE_DIR,
  nexusBase: process.env.NEXUS_BASE_DIR,
  data: process.env.LIVOS_DATA_DIR,
  logs: process.env.LIVOS_LOGS_DIR,
  skills: process.env.LIVOS_SKILLS_DIR,
  nexusSkills: process.env.NEXUS_SKILLS_DIR,
  workspace: process.env.NEXUS_WORKSPACE_DIR,
  output: process.env.LIVOS_OUTPUT_DIR,
}));

/**
 * Domains configuration loaded from environment variables.
 * Frozen to prevent runtime mutations.
 */
export const domains: DomainsConfig = Object.freeze(DomainsConfigSchema.parse({
  primary: process.env.LIVOS_DOMAIN,
  useHttps: process.env.LIVOS_USE_HTTPS === 'true',
  marketplace: process.env.LIVOS_MARKETPLACE_DOMAIN,
  api: process.env.LIVOS_API_SUBDOMAIN,
}));

/**
 * Service URLs configuration loaded from environment variables.
 * Frozen to prevent runtime mutations.
 */
export const services: ServicesConfig = Object.freeze(ServicesConfigSchema.parse({
  nexusApi: process.env.NEXUS_API_URL,
  memoryService: process.env.MEMORY_SERVICE_URL,
  redis: process.env.REDIS_URL,
}));

// Re-export types and schemas for consumers who need them
export { PathsConfigSchema, type PathsConfig } from './paths.js';
export { DomainsConfigSchema, type DomainsConfig } from './domains.js';
export { ServicesConfigSchema, type ServicesConfig } from './services.js';
export { getEnv, requireEnv } from './env.js';
