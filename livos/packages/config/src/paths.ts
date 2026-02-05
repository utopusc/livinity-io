import { z } from 'zod';

/**
 * Configuration schema for filesystem paths.
 * All paths have sensible defaults for development.
 * Production values come from LIVOS_* and NEXUS_* environment variables.
 */
export const PathsConfigSchema = z.object({
  /** Base installation directory for LivOS */
  base: z.string().default('/opt/livos'),
  /** Base installation directory for Nexus */
  nexusBase: z.string().default('/opt/nexus'),
  /** Data directory for persistent storage */
  data: z.string().default('/opt/livos/data'),
  /** Logs directory */
  logs: z.string().default('/opt/livos/logs'),
  /** Skills directory for LivOS */
  skills: z.string().default('/opt/livos/skills'),
  /** Skills directory for Nexus */
  nexusSkills: z.string().default('/opt/nexus/app/skills'),
  /** Workspace directory for Nexus operations */
  workspace: z.string().default('/opt/nexus/workspace'),
  /** Output directory for generated files (reports, exports) */
  output: z.string().default('/opt/livos/output'),
});

export type PathsConfig = z.infer<typeof PathsConfigSchema>;
