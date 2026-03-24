# Phase 5: Configurability - Research

**Researched:** 2026-02-04
**Domain:** Configuration Consumption & Hardcoded Reference Replacement
**Confidence:** HIGH

## Summary

This phase focuses on consuming the @livos/config package (created in Phase 1) to replace all hardcoded domain and path references throughout the codebase. The goal is to achieve zero hardcoded "livinity.cloud" domain references and zero hardcoded "/opt/livos" or "/opt/nexus" path references.

The existing @livos/config package already provides:
- Zod-validated schemas for paths, domains, and services
- Environment variable loading with sensible defaults
- Frozen config objects via Object.freeze()
- Re-exported schemas for custom validation needs

The primary work involves systematic replacement of hardcoded values with config imports. There are three distinct migration patterns required:
1. **Server-side TypeScript** - Direct import from @livos/config
2. **Frontend (Vite/React)** - Build-time or runtime configuration injection
3. **Infrastructure files** - PM2 ecosystem.config.cjs, shell scripts

**Primary recommendation:** Systematically replace hardcoded values using grep-driven discovery, categorizing each reference by its context (server/frontend/infra) and applying the appropriate migration pattern.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @livos/config | 0.1.0 | Centralized config | Already created in Phase 1 |
| zod | ^3.21.4 | Schema validation | Already in use, provides runtime validation |
| dotenv | ^16.3.1 | Environment loading | Already in use via @livos/config |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vite-plugin-runtime-env | N/A | Runtime env in frontend | NOT recommended - use build-time |
| None additional | - | - | @livos/config covers all needs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct env access | @livos/config | Config provides validation + defaults |
| Runtime config in UI | Build-time VITE_ vars | Build-time is simpler, more secure |
| Manual path construction | Node.js path.join | Cross-platform compatibility |

**Installation:**
```bash
# No new packages needed - @livos/config already exists
# Just add it as dependency where needed:
pnpm add @livos/config --filter @livos/livinityd
```

## Architecture Patterns

### Pattern 1: Server-Side Config Import
**What:** Import frozen config objects from @livos/config
**When to use:** All Node.js/TypeScript server code
**Example:**
```typescript
// Source: @livos/config pattern from Phase 1
import { paths, domains, services } from '@livos/config';

// BEFORE
const skillsDir = process.env.SKILLS_DIR || '/opt/nexus/app/skills';

// AFTER
const skillsDir = process.env.SKILLS_DIR || paths.nexusSkills;
```

### Pattern 2: Frontend Configuration via VITE_ Variables
**What:** Expose config at build time via VITE_ prefixed environment variables
**When to use:** Frontend code that needs domain/URL configuration
**Example:**
```typescript
// vite.config.ts - Source: https://vite.dev/guide/env-and-mode
export default defineConfig({
  define: {
    // Build-time replacement
    'import.meta.env.VITE_MARKETPLACE_URL': JSON.stringify(
      process.env.MARKETPLACE_URL || 'https://apps.livinity.io'
    ),
  },
  server: {
    proxy: {
      '/trpc': {
        target: process.env.VITE_BACKEND_URL || 'https://livinity.cloud',
        changeOrigin: true,
      },
    },
  },
});

// Component usage
const MARKETPLACE_URL = import.meta.env.VITE_MARKETPLACE_URL;
```

### Pattern 3: Infrastructure Config via Environment Variables
**What:** Pass config via environment variables in ecosystem.config.cjs
**When to use:** PM2 config, shell scripts, Docker configurations
**Example:**
```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'livos',
    script: 'source/cli.ts',
    cwd: process.env.LIVOS_BASE_DIR || '/opt/livos/packages/livinityd',
    args: `--data-directory ${process.env.LIVOS_DATA_DIR || '/opt/livos/data'} --port 8080`,
    log_file: `${process.env.LIVOS_LOGS_DIR || '/opt/livos/logs'}/livos.log`,
  }],
};
```

### Pattern 4: Domain Configuration with CSP Headers
**What:** Configure Content Security Policy dynamically based on domain config
**When to use:** Server middleware that sets security headers
**Example:**
```typescript
// Source: livos/packages/livinityd/source/modules/server/index.ts
import { domains } from '@livos/config';

const marketplaceDomain = process.env.MARKETPLACE_DOMAIN || 'apps.livinity.io';

helmet.contentSecurityPolicy({
  directives: {
    frameSrc: [
      "'self'",
      `https://${marketplaceDomain}`,
      `https://*.${domains.primary}`,
    ],
  },
});
```

### Pattern 5: Dynamic Path Construction
**What:** Use path.join with config base paths instead of string concatenation
**When to use:** Any path construction from base directories
**Example:**
```typescript
import path from 'node:path';
import { paths } from '@livos/config';

// BEFORE
const logPath = '/opt/nexus/logs/nexus.log';

// AFTER
const logPath = path.join(paths.nexusBase, 'logs', 'nexus.log');
```

### Recommended Project Structure for Config
```
livos/packages/config/        # Already exists from Phase 1
  src/
    index.ts           # Main export with paths, domains, services
    paths.ts           # Path configuration schema
    domains.ts         # Domain configuration schema
    services.ts        # Service URL configuration schema
    env.ts             # Environment variable helpers
```

### Anti-Patterns to Avoid
- **Scattered process.env access:** Don't read env vars throughout codebase; use @livos/config
- **String concatenation for paths:** Use path.join() with config values
- **Hardcoded fallbacks:** Always use config defaults, not inline hardcoded values
- **Frontend secrets:** Never expose sensitive config via VITE_ variables (visible in bundle)
- **Runtime config mutation:** Config objects are frozen; don't try to modify them

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path joining | String concatenation | path.join + @livos/config | Cross-platform, consistent |
| Config validation | Manual if/else | Zod schemas (already in config) | Type inference, error messages |
| Env loading | Custom loader | dotenv (via @livos/config) | Battle-tested, handles edge cases |
| Frontend env | Custom injection | Vite's import.meta.env | Built-in, well-documented |
| CSP domains | Manual string lists | Config-driven generation | Single source of truth |

**Key insight:** @livos/config already solves the hard problems. This phase is about CONSUMPTION, not creation.

## Common Pitfalls

### Pitfall 1: Missing Frontend Config Migration
**What goes wrong:** Server-side config works but frontend still has hardcoded domains
**Why it happens:** Frontend requires different pattern (VITE_ variables or define)
**How to avoid:** Explicitly categorize each hardcoded reference by context (server/frontend/infra)
**Warning signs:** grep finds hardcoded values only in packages/ui/

### Pitfall 2: Incomplete Grep Search
**What goes wrong:** Some hardcoded values missed during migration
**Why it happens:** Search patterns miss edge cases (template literals, comments, variations)
**How to avoid:** Use multiple search patterns:
```bash
# Domain patterns
grep -rn "livinity\.cloud" --include="*.ts" --include="*.tsx"
grep -rn "livinity\.io" --include="*.ts" --include="*.tsx"
grep -rn "apps\.livinity" --include="*.ts" --include="*.tsx"
grep -rn "api\.livinity" --include="*.ts" --include="*.tsx"

# Path patterns
grep -rn "/opt/livos" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.cjs"
grep -rn "/opt/nexus" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.cjs"
```
**Warning signs:** Errors only on machines with different paths/domains

### Pitfall 3: Circular Dependency with Config
**What goes wrong:** "Cannot access 'X' before initialization" errors
**Why it happens:** Module importing config also imports something that imports original module
**How to avoid:** Keep config imports at top level; config module is pure data
**Warning signs:** Startup crashes with initialization order errors

### Pitfall 4: Skills Files with Hardcoded Paths in Prompts
**What goes wrong:** AI agent skills still reference /opt/livos in their prompts
**Why it happens:** Skills use string templates with paths for agent instructions
**How to avoid:** Skills should construct paths dynamically at runtime
**Warning signs:** AI agents save files to wrong directories

### Pitfall 5: PM2 Ecosystem Not Reading Environment
**What goes wrong:** ecosystem.config.cjs ignores .env file
**Why it happens:** PM2 config is CommonJS, doesn't auto-load dotenv
**How to avoid:** Either: (1) Set env vars before PM2 start, or (2) Use pm2's env_production feature
**Warning signs:** PM2 processes use default paths even with .env configured

### Pitfall 6: Frontend CSP Blocking Marketplace
**What goes wrong:** Marketplace iframe blocked after domain change
**Why it happens:** CSP frameSrc not updated with new domain config
**How to avoid:** CSP configuration must read from domain config, not hardcoded
**Warning signs:** Console errors: "Refused to frame 'X' because it violates Content-Security-Policy"

## Code Examples

### Replacing Hardcoded Domain in Backend
```typescript
// Source: livos/packages/livinityd/source/modules/system/update.ts
// BEFORE
const updateUrl = new URL('https://api.livinity.cloud/latest-release');

// AFTER
import { domains } from '@livos/config';
const apiDomain = process.env.LIVOS_API_DOMAIN || `api.${domains.primary}`;
const updateUrl = new URL(`https://${apiDomain}/latest-release`);
```

### Replacing Hardcoded Domain in Frontend
```typescript
// Source: livos/packages/ui/src/modules/window/app-contents/app-store-routes/marketplace-app-window.tsx
// BEFORE
const MARKETPLACE_URL = 'https://apps.livinity.io';

// AFTER (using vite.config.ts define)
// In vite.config.ts:
define: {
  '__MARKETPLACE_URL__': JSON.stringify(process.env.MARKETPLACE_URL || 'https://apps.livinity.io'),
}

// In component:
declare const __MARKETPLACE_URL__: string;
const MARKETPLACE_URL = __MARKETPLACE_URL__;
```

### Replacing Hardcoded Path in Nexus
```typescript
// Source: nexus/packages/core/src/logger.ts
// BEFORE
new winston.transports.File({ filename: '/opt/nexus/logs/nexus.log' });

// AFTER
import { paths } from '@livos/config';
import path from 'node:path';
new winston.transports.File({
  filename: path.join(paths.nexusBase, 'logs', 'nexus.log')
});
```

### Replacing Hardcoded Path in Skills
```typescript
// Source: livos/skills/research.ts
// BEFORE
`Save the report to a file at /opt/livos/output/research-${Date.now()}.md`

// AFTER
import { paths } from '@livos/config';
import path from 'node:path';
const outputPath = path.join(paths.base, 'output', `research-${Date.now()}.md`);
`Save the report to a file at ${outputPath}`
```

### Replacing Hardcoded Values in ecosystem.config.cjs
```javascript
// Source: livos/ecosystem.config.cjs
// BEFORE
{
  cwd: '/opt/livos/packages/livinityd',
  args: '--data-directory /opt/livos/data --port 8080',
  log_file: '/opt/livos/logs/livos.log',
}

// AFTER
// Note: CommonJS file can't import ESM @livos/config directly
// Use environment variables with defaults
const LIVOS_BASE = process.env.LIVOS_BASE_DIR || '/opt/livos';
{
  cwd: `${LIVOS_BASE}/packages/livinityd`,
  args: `--data-directory ${process.env.LIVOS_DATA_DIR || LIVOS_BASE + '/data'} --port 8080`,
  log_file: `${process.env.LIVOS_LOGS_DIR || LIVOS_BASE + '/logs'}/livos.log`,
}
```

### CSP Configuration with Dynamic Domains
```typescript
// Source: livos/packages/livinityd/source/modules/server/index.ts
// BEFORE
frameSrc: ["'self'", 'https://apps.livinity.io', 'https://*.livinity.io'],

// AFTER
const marketplaceDomain = process.env.MARKETPLACE_DOMAIN || 'apps.livinity.io';
const baseDomain = process.env.LIVOS_DOMAIN || 'livinity.io';
frameSrc: [
  "'self'",
  `https://${marketplaceDomain}`,
  `https://*.${baseDomain}`,
],
```

## Inventory: Files to Modify

### Domain Hardcoding (6 locations in 3 files)
| File | Line | Hardcoded Value | Migration Pattern |
|------|------|-----------------|-------------------|
| livos/packages/ui/vite.config.ts | 19 | `https://livinity.cloud` | VITE_ env variable |
| livos/packages/ui/src/utils/misc.ts | 61 | `livinity.cloud` (comment only) | Update comment or remove |
| livos/packages/livinityd/source/modules/system/update.ts | 52 | `https://api.livinity.cloud` | @livos/config domain |
| livos/packages/livinityd/source/modules/server/index.ts | 137 | `apps.livinity.io` | env var / config |
| livos/packages/ui/src/modules/.../marketplace-app-window.tsx | 7 | `https://apps.livinity.io` | VITE_ variable |
| livos/packages/ui/src/modules/.../marketplace-app-window.tsx | 23 | `apps.livinity.io` | VITE_ variable |

### Path Hardcoding - Nexus Core (7 locations)
| File | Line | Hardcoded Value | Migration Pattern |
|------|------|-----------------|-------------------|
| nexus/packages/core/src/logger.ts | 14 | `/opt/nexus/logs/nexus.log` | @livos/config paths |
| nexus/packages/core/src/daemon.ts | 567, 998 | `/opt/nexus/logs/nexus.log` | @livos/config paths |
| nexus/packages/core/src/shell.ts | 21 | `/opt/nexus` | @livos/config paths |
| nexus/packages/core/src/index.ts | 38 | `/opt/nexus` | @livos/config paths |
| nexus/packages/core/src/index.ts | 41 | `/opt/nexus/app/skills` | @livos/config paths |
| nexus/packages/core/src/index.ts | 87 | `/opt/nexus` | @livos/config paths |

### Path Hardcoding - Skills (6 locations)
| File | Line | Hardcoded Value | Migration Pattern |
|------|------|-----------------|-------------------|
| livos/skills/research.ts | 83 | `/opt/livos/output/` | @livos/config + path.join |
| livos/skills/leadgen-auto.ts | 88 | `/opt/livos/output/` | @livos/config + path.join |
| livos/skills/site-audit.ts | 82 | `/opt/livos/output/` | @livos/config + path.join |
| livos/skills/content.ts | 101 | `/opt/livos/output/` | @livos/config + path.join |
| livos/packages/livinityd/skills/content.ts | 101 | `/opt/livos/output/` | @livos/config + path.join |
| livos/packages/livinityd/skills/leadgen-auto.ts | 88 | `/opt/livos/output/` | @livos/config + path.join |

### Path Hardcoding - Infrastructure (ecosystem.config.cjs)
| File | Line | Hardcoded Value | Migration Pattern |
|------|------|-----------------|-------------------|
| livos/ecosystem.config.cjs | 9-17 | Multiple /opt/livos paths | process.env with defaults |
| livos/ecosystem.config.cjs | 24-32 | Multiple /opt/livos paths | process.env with defaults |
| livos/ecosystem.config.cjs | 40-47 | Multiple /opt/livos paths | process.env with defaults |
| livos/ecosystem.config.cjs | 52-61 | Multiple /opt/livos paths | process.env with defaults |

### Config Package Defaults (acceptable - these ARE the defaults)
| File | Status |
|------|--------|
| livos/packages/config/src/paths.ts | KEEP - These are intentional defaults |
| livos/.env.example | KEEP - Documentation of defaults |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded strings | Centralized config | Phase 1 | Type-safe, validated |
| process.env everywhere | Config module | Phase 1 | Single source of truth |
| String path concat | path.join + config | Best practice | Cross-platform safety |

**Deprecated/outdated:**
- Direct process.env access: Should go through @livos/config
- String concatenation for paths: Use path.join()

## Open Questions

### 1. Nexus Package Dependency
**What we know:** Nexus is a separate workspace (npm vs pnpm)
**What's unclear:** How to add @livos/config as dependency to nexus
**Recommendation:** Either: (1) Copy config package to nexus, (2) Use npm link, or (3) Add @livos/config to nexus workspace. Simplest is option 1 or using environment variables with the same naming convention.

### 2. Output Directory for Skills
**What we know:** Skills reference `/opt/livos/output/` for saving reports
**What's unclear:** Should output be a separate config value or derived from base?
**Recommendation:** Add `output: z.string().default('/opt/livos/output')` to PathsConfigSchema and env var LIVOS_OUTPUT_DIR

### 3. Marketplace Domain Configuration
**What we know:** Marketplace is at apps.livinity.io (external service)
**What's unclear:** Should this be in @livos/config or separate env var?
**Recommendation:** Add MARKETPLACE_URL as standalone env var since it's an external service, not part of the installation

## Sources

### Primary (HIGH confidence)
- @livos/config package: `livos/packages/config/src/` - existing implementation
- Phase 1 Research: `.planning/phases/01-foundation/01-RESEARCH.md` - established patterns
- Codebase analysis via Grep/Glob - direct inventory of hardcoded values

### Secondary (MEDIUM confidence)
- [Vite Environment Variables](https://vite.dev/guide/env-and-mode) - frontend config patterns
- [Nx TypeScript Monorepo](https://nx.dev/blog/managing-ts-packages-in-monorepos) - monorepo config patterns

### Tertiary (LOW confidence)
- WebSearch results for TypeScript configuration patterns - general best practices

## Metadata

**Confidence breakdown:**
- Migration patterns: HIGH - based on existing @livos/config and established patterns
- Inventory completeness: HIGH - comprehensive grep analysis of codebase
- Frontend migration: MEDIUM - Vite patterns well-documented but require testing
- Infrastructure migration: MEDIUM - PM2/CommonJS has limitations with ESM config

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (stable domain, patterns unlikely to change)
