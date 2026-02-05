# Phase 1: Foundation - Research

**Researched:** 2026-02-03
**Domain:** Configuration Management & Repository Cleanup
**Confidence:** HIGH

## Summary

This phase establishes a centralized configuration system to replace hardcoded paths (`/opt/livos`, `/opt/nexus`) and domains (`livinity.cloud`), and removes repository artifacts (`.bak` files).

The codebase already has a sophisticated Zod-based config system in `nexus/packages/core/src/config/` that handles runtime configuration. However, this system does NOT handle:
1. Path configuration (hardcoded as `/opt/livos`, `/opt/nexus`)
2. Domain configuration (hardcoded as `livinity.cloud`)
3. Cross-monorepo sharing (livos and nexus are separate workspaces)

The recommended approach is to create a minimal, shared config package that:
- Uses Zod for validation (already a dependency in both projects)
- Loads from environment variables with sensible defaults
- Provides typed access to paths, domains, and service URLs
- Can be imported by both livos and nexus packages

**Primary recommendation:** Create `packages/config` in the livos monorepo, export path/domain config, and have nexus symlink or copy it during build.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^3.21.4 | Schema validation & types | Already used in both projects, provides runtime validation + TypeScript types |
| dotenv | ^16.x | Environment variable loading | Industry standard, 40M+ weekly downloads |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv-mono | ^1.x | Monorepo .env sharing | If single .env at root is desired |
| None needed | - | - | Zod + dotenv covers all needs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| zod | convict | convict has its own schema format; zod already in codebase |
| zod | nconf | nconf lacks validation; would need separate type definitions |
| dotenv | cosmiconfig | cosmiconfig is for file discovery; overkill for env vars |

**Installation:**
```bash
# Already have zod, just need dotenv if not present
pnpm add dotenv -w
```

## Architecture Patterns

### Recommended Project Structure
```
livos/packages/config/
  src/
    index.ts           # Main export
    paths.ts           # Path configuration
    domains.ts         # Domain configuration
    services.ts        # Service URL configuration
    env.ts             # Environment variable loader
  package.json
  tsconfig.json
```

### Pattern 1: Zod Schema with Environment Defaults
**What:** Define schemas that validate env vars and provide typed defaults
**When to use:** All configuration values
**Example:**
```typescript
// Source: Existing pattern in nexus/packages/core/src/config/schema.ts
import { z } from 'zod';

export const PathsConfigSchema = z.object({
  /** Base installation directory */
  base: z.string().default('/opt/livos'),
  /** Data directory for persistent storage */
  data: z.string().default('/opt/livos/data'),
  /** Logs directory */
  logs: z.string().default('/opt/livos/logs'),
  /** Skills directory */
  skills: z.string().default('/opt/livos/skills'),
});

export type PathsConfig = z.infer<typeof PathsConfigSchema>;
```

### Pattern 2: Environment Variable Override
**What:** Load from process.env with validation
**When to use:** Runtime configuration that varies by environment
**Example:**
```typescript
// Source: Pattern from nexus/packages/core/src/config/manager.ts
function loadFromEnv(): Partial<PathsConfig> {
  return {
    base: process.env.LIVOS_BASE_DIR,
    data: process.env.LIVOS_DATA_DIR,
    logs: process.env.LIVOS_LOGS_DIR,
    skills: process.env.LIVOS_SKILLS_DIR,
  };
}

// Merge with defaults
const config = PathsConfigSchema.parse({
  ...defaults,
  ...loadFromEnv(),
});
```

### Pattern 3: Singleton Config Export
**What:** Export a validated, frozen config object
**When to use:** When config should be immutable after initialization
**Example:**
```typescript
// packages/config/src/index.ts
import { PathsConfigSchema } from './paths.js';
import { DomainsConfigSchema } from './domains.js';
import 'dotenv/config'; // Load .env

export const paths = Object.freeze(PathsConfigSchema.parse({
  base: process.env.LIVOS_BASE_DIR,
  data: process.env.LIVOS_DATA_DIR,
  // ...
}));

export const domains = Object.freeze(DomainsConfigSchema.parse({
  primary: process.env.LIVOS_DOMAIN,
  // ...
}));
```

### Anti-Patterns to Avoid
- **Scattered process.env access:** Don't read env vars throughout the codebase; centralize in config module
- **String concatenation for paths:** Don't do `base + '/data'`; define each path explicitly for discoverability
- **Optional without defaults:** Every config value should have a sensible default for development
- **Mutable config:** Config should be frozen after load to prevent runtime mutations

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Env var parsing | Custom parser | dotenv | Battle-tested, handles edge cases |
| Schema validation | Manual if/else | Zod | Type inference, error messages |
| Path joining | String concat | Node.js path module | Cross-platform compatibility |
| Type-safe config | Interface + casting | Zod inference | Runtime validation matches types |

**Key insight:** The existing nexus config system is well-designed; this phase extends it with path/domain config, not replaces it.

## Common Pitfalls

### Pitfall 1: Hardcoded Defaults That Leak
**What goes wrong:** Default values assume production paths, break development
**Why it happens:** Developers test on server, forget local setup
**How to avoid:** Use development-friendly defaults (relative paths, localhost)
**Warning signs:** Tests fail locally but pass on server

### Pitfall 2: Circular Dependencies
**What goes wrong:** Config imports from module that imports config
**Why it happens:** Config module grows to include business logic
**How to avoid:** Keep config module pure data/validation only
**Warning signs:** "Cannot access X before initialization" errors

### Pitfall 3: Async Config Loading
**What goes wrong:** Config not ready when modules initialize
**Why it happens:** Loading from remote sources, files
**How to avoid:** Sync environment loading, async only for Redis/DB config
**Warning signs:** Undefined config values at startup

### Pitfall 4: Missing .env in Production
**What goes wrong:** Defaults used instead of production values
**Why it happens:** .env not deployed, env vars not set
**How to avoid:** Fail fast with required vars; log config at startup
**Warning signs:** Wrong domain/paths in production logs

### Pitfall 5: Forgetting to Remove All Hardcoded References
**What goes wrong:** Some files still have `/opt/livos` after migration
**Why it happens:** Grep misses edge cases (string templates, comments)
**How to avoid:** Use multiple search patterns; verify with full-text search
**Warning signs:** Errors only on machines with different install paths

## Code Examples

Verified patterns from existing codebase and official sources:

### Loading Config from Environment
```typescript
// Source: Pattern from nexus/packages/core/src/config/manager.ts
import 'dotenv/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  baseDir: z.string().default('/opt/livos'),
  dataDir: z.string().default('/opt/livos/data'),
  domain: z.string().default('localhost'),
  nexusApiUrl: z.string().url().default('http://localhost:3200'),
});

export const config = ConfigSchema.parse({
  baseDir: process.env.LIVOS_BASE_DIR,
  dataDir: process.env.LIVOS_DATA_DIR,
  domain: process.env.LIVOS_DOMAIN,
  nexusApiUrl: process.env.NEXUS_API_URL,
});
```

### Replacing Hardcoded Paths
```typescript
// BEFORE (found in nexus/packages/core/src/index.ts)
const skillsDir = process.env.SKILLS_DIR || '/opt/nexus/app/skills';

// AFTER
import { paths } from '@livos/config';
const skillsDir = process.env.SKILLS_DIR || paths.skills;
```

### Replacing Hardcoded Domains
```typescript
// BEFORE (found in livos/packages/ui/src/utils/misc.ts)
const domain = 'livinity.cloud';

// AFTER
import { domains } from '@livos/config';
const domain = domains.primary;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| config + convict | Zod schemas | 2023-2024 | Type inference, smaller bundle |
| Multiple .env files | dotenv-mono | 2023 | Simpler monorepo config |
| Runtime type checks | Zod parse at load | 2022+ | Fail-fast validation |

**Deprecated/outdated:**
- convict: Still maintained but Zod preferred for TypeScript projects
- nconf: Limited TypeScript support, no validation

## Open Questions

Things that couldn't be fully resolved:

1. **Where should config package live?**
   - What we know: livos is pnpm, nexus is npm; they're separate workspaces
   - What's unclear: Should nexus depend on livos package, or duplicate?
   - Recommendation: Create in livos, symlink/copy to nexus (simpler than npm link)

2. **What about existing nexus ConfigManager?**
   - What we know: It handles runtime AI/agent config well
   - What's unclear: Should path config merge into it or stay separate?
   - Recommendation: Keep separate - paths are static, AI config is dynamic

3. **Environment variable naming convention?**
   - What we know: Current mix of LIVOS_, LIV_, NEXUS_ prefixes
   - What's unclear: Should we standardize?
   - Recommendation: Use LIVOS_ for shared, NEXUS_ for Nexus-specific

## Inventory: Files to Modify

### .bak Files to Delete (AICON-08)
```
livos/packages/liv/node_modules/@liv/core/src/daemon.ts.bak
livos/packages/liv/packages/core/src/daemon.ts.bak
livos/packages/livcoreai/src/daemon.ts.bak
livos/packages/livinityd/node_modules/@livos/.ignored_livcoreai/src/daemon.ts.bak
```

### Files with Hardcoded /opt/livos or /opt/nexus (90 files)
Key source files (excluding node_modules, dist, _archive):
- `nexus/packages/core/src/logger.ts` - hardcoded log path
- `nexus/packages/core/src/daemon.ts` - hardcoded log paths (2 locations)
- `nexus/packages/core/src/index.ts` - shell cwd, skills dir, workspace dir
- `nexus/packages/core/src/shell.ts` - default cwd
- `livos/packages/livcoreai/src/daemon.ts` - references
- `livos/packages/livcoreai/src/shell.ts` - references
- `livos/packages/livcoreai/src/logger.ts` - references
- Various skill files (6+ files)

### Files with Hardcoded livinity.cloud (9 files)
Key source files:
- `livos/packages/livinityd/source/modules/system/update.ts`
- `livos/packages/ui/src/utils/misc.ts`
- `livos/packages/ui/vite.config.ts`

## Sources

### Primary (HIGH confidence)
- Nexus config system: `nexus/packages/core/src/config/` - existing patterns
- Zod documentation (Context7 verified)
- Codebase analysis via Grep/Glob

### Secondary (MEDIUM confidence)
- [npm trends comparison](https://npmtrends.com/config-vs-convict-vs-dotenv-vs-nconf) - library popularity
- [dotenv-mono npm](https://www.npmjs.com/package/dotenv-mono) - monorepo env sharing
- [TypeScript monorepo best practices](https://nx.dev/blog/managing-ts-packages-in-monorepos) - workspace patterns

### Tertiary (LOW confidence)
- WebSearch results for "centralized config TypeScript monorepo" - general patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Zod already in use, dotenv is industry standard
- Architecture: HIGH - Based on existing nexus config patterns
- Pitfalls: MEDIUM - Based on general Node.js config experience
- Inventory: HIGH - Direct codebase analysis via Grep

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (stable domain, low churn)
