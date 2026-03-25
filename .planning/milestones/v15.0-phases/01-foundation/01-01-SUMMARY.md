---
phase: 01
plan: 01
subsystem: configuration
tags: [typescript, zod, monorepo, config]
dependency-graph:
  requires: []
  provides:
    - "@livos/config package for centralized configuration"
    - "Zod schemas for paths, domains, services"
    - "Typed exports with environment variable overrides"
  affects:
    - "Phase 5 (Configurability) - will use these imports"
    - "All packages needing path/domain/service config"
tech-stack:
  added:
    - "zod: ^3.21.4 (validation)"
    - "dotenv: ^16.3.1 (env loading)"
  patterns:
    - "Zod schemas with .default() for development defaults"
    - "Object.freeze() for immutable runtime config"
    - "Environment variable prefix convention (LIVOS_, NEXUS_)"
key-files:
  created:
    - "livos/packages/config/package.json"
    - "livos/packages/config/tsconfig.json"
    - "livos/packages/config/src/env.ts"
    - "livos/packages/config/src/paths.ts"
    - "livos/packages/config/src/domains.ts"
    - "livos/packages/config/src/services.ts"
    - "livos/packages/config/src/index.ts"
  modified:
    - "livos/pnpm-workspace.yaml"
decisions:
  - key: "env-prefix"
    choice: "LIVOS_ for shared, NEXUS_ for Nexus-specific"
    reason: "Clear ownership and searchability"
  - key: "freeze-config"
    choice: "Object.freeze() on exported config objects"
    reason: "Prevent runtime mutations (anti-pattern from research)"
  - key: "schema-reexport"
    choice: "Re-export schemas alongside parsed values"
    reason: "Allow consumers to do custom validation if needed"
metrics:
  duration: "3 minutes"
  completed: "2026-02-04"
---

# Phase 1 Plan 1: Config Package Summary

**One-liner:** Created @livos/config package with Zod schemas for paths, domains, and services configuration with environment variable overrides.

## What Was Built

The `@livos/config` package provides:
- **PathsConfig**: Base directories, data, logs, skills paths for LivOS and Nexus
- **DomainsConfig**: Primary domain and HTTPS toggle
- **ServicesConfig**: URLs for Nexus API, Memory service, Redis

All configuration values:
1. Have sensible defaults for local development (localhost, /opt/livos paths)
2. Can be overridden via environment variables
3. Are validated at load time using Zod schemas
4. Are frozen to prevent runtime mutations

## Key Files

| File | Purpose |
|------|---------|
| `src/paths.ts` | PathsConfigSchema with 7 path defaults |
| `src/domains.ts` | DomainsConfigSchema with primary domain and useHttps |
| `src/services.ts` | ServicesConfigSchema with 3 service URLs |
| `src/env.ts` | getEnv/requireEnv helpers |
| `src/index.ts` | Main export with frozen config objects |

## Commits

| Hash | Description |
|------|-------------|
| b9a836c | Create config package structure |
| 4905b0f | Add Zod schemas for paths, domains, and services |
| df57723 | Create main index with frozen config exports |

## Environment Variables

| Variable | Config Path | Default |
|----------|-------------|---------|
| LIVOS_BASE_DIR | paths.base | /opt/livos |
| NEXUS_BASE_DIR | paths.nexusBase | /opt/nexus |
| LIVOS_DATA_DIR | paths.data | /opt/livos/data |
| LIVOS_LOGS_DIR | paths.logs | /opt/livos/logs |
| LIVOS_SKILLS_DIR | paths.skills | /opt/livos/skills |
| NEXUS_SKILLS_DIR | paths.nexusSkills | /opt/nexus/app/skills |
| NEXUS_WORKSPACE_DIR | paths.workspace | /opt/nexus/workspace |
| LIVOS_DOMAIN | domains.primary | localhost |
| LIVOS_USE_HTTPS | domains.useHttps | false |
| NEXUS_API_URL | services.nexusApi | http://localhost:3200 |
| MEMORY_SERVICE_URL | services.memoryService | http://localhost:3300 |
| REDIS_URL | services.redis | redis://localhost:6379 |

## Usage Example

```typescript
import { paths, domains, services } from '@livos/config';

// All values typed and validated
console.log(paths.skills);      // /opt/livos/skills
console.log(domains.primary);   // localhost
console.log(services.nexusApi); // http://localhost:3200

// Schemas available for custom validation
import { PathsConfigSchema } from '@livos/config';
PathsConfigSchema.parse({ base: '/custom/path' });
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @types/node to devDependencies**
- **Found during:** Task 3 verification
- **Issue:** TypeScript build failed with "Cannot find name 'process'"
- **Fix:** Added `@types/node: ^22.0.0` to devDependencies
- **Files modified:** package.json
- **Commit:** df57723

## Testing Verification

```bash
# Build succeeds
pnpm build  # No errors

# Defaults work
node -e "import('./dist/index.js').then(c => console.log(c.paths))"
# { base: '/opt/livos', ... }

# Environment overrides work
LIVOS_DOMAIN=test.local node -e "import('./dist/index.js').then(c => console.log(c.domains.primary))"
# test.local
```

## Next Phase Readiness

Ready for Plan 2 (Environment & Constants Cleanup):
- Config package provides typed imports to replace hardcoded values
- Environment variable convention established (LIVOS_*, NEXUS_*)
- Schemas available for any additional validation needs
