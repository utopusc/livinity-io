# Phase 2: Security Foundation - Research

**Researched:** 2026-02-03
**Domain:** Secret Management & Environment Configuration Security
**Confidence:** HIGH

## Summary

This phase secures environment configuration by removing hardcoded secrets from committed .env files and establishing proper .env.example templates. The research reveals a critical security issue: two .env files with real secrets exist on disk (livos/.env and livos/packages/liv/.env), containing API keys, JWT secrets, and Redis credentials. However, these files are NOT tracked by git due to existing .gitignore patterns.

The primary work is: (1) verify .env files are properly gitignored at all levels, (2) create comprehensive .env.example templates with proper documentation, (3) ensure the Phase 1 @livos/config package environment variables are all documented, and (4) establish developer setup documentation.

The existing .env.example files have inconsistent formats - some contain placeholder values like "sk-ant-xxx" (potentially confusing), others use empty values or "CHANGE_ME" patterns. Standardization is needed.

**Primary recommendation:** Standardize on empty values with documentation comments in .env.example files, ensure all .gitignore files have complete .env patterns, and create a canonical root .env.example that documents ALL environment variables across the monorepo.

## Current State Analysis

### .env Files Found on Disk

| File | Contains Secrets | Git Tracked | Status |
|------|------------------|-------------|--------|
| `livos/.env` | YES - API keys, JWT, Redis password | NO | SECURE (gitignored) |
| `livos/packages/liv/.env` | YES - Duplicate of above | NO | SECURE (gitignored) |

### Secrets Currently in .env Files (NOT committed)

**CRITICAL SECRETS FOUND (HIGH severity):**
1. `GEMINI_API_KEY=[REDACTED]` - Real Google AI API key
2. `JWT_SECRET=574509854d205e24d87b369430b4e96b4ad8b64578aa5e2c803789f0bd819b5a` - Production JWT secret
3. `LIV_API_KEY=d3952b4a59dde06252bc97552be6fe7fc6cb59d21b91851d4e3aae3621ee9ad2` - Internal API key
4. `REDIS_URL=redis://:LivRedis2024!@localhost:6379` - Redis password in URL

**These keys should be rotated after this phase is complete** as they have been visible in the codebase during development.

### Existing .gitignore Coverage

| Location | Covers .env | Coverage Quality |
|----------|-------------|------------------|
| `/.gitignore` | `.env`, `.env.local`, `.env.*.local` | GOOD |
| `/livos/.gitignore` | `.env`, `.env.*`, `!.env.example`, `packages/liv/.env` | EXCELLENT |
| `/livos/packages/ui/.gitignore` | `*.local` only | PARTIAL - needs .env |

### Existing .env.example Files

| File | Quality | Issues |
|------|---------|--------|
| `livos/.env.example` | GOOD | Uses empty values and CHANGE_ME placeholders |
| `livos/packages/liv/.env.example` | POOR | Contains "xxx" placeholders, has real-looking passwords |
| `nexus/.env.example` | POOR | Contains "xxx" placeholders, has real-looking passwords |
| `livos/packages/ui/stories/.env.example` | OK | Simple, development-only |

## Standard Stack

This phase does not introduce new libraries. It establishes conventions using existing tooling.

### Core
| Tool | Purpose | Why Standard |
|------|---------|--------------|
| dotenv | .env file loading | Already installed in Phase 1 |
| .gitignore | Prevent secret commits | Git standard |
| .env.example | Document required variables | Industry standard practice |

### No Additional Dependencies Needed

Phase 1 already installed dotenv. This phase is purely configuration and documentation.

## Architecture Patterns

### Recommended .env.example Structure

```
# ==============================================================================
# ENVIRONMENT CONFIGURATION TEMPLATE
# ==============================================================================
# Copy this file to .env and fill in the values:
#   cp .env.example .env
#
# NEVER commit .env files with real values!
# ==============================================================================

# === AI API Keys ===
# Required for AI features. Get from provider dashboards.
GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# === Database ===
# Required: Redis connection for caching and pub/sub
# Format: redis://[:password@]host[:port]
REDIS_URL=redis://localhost:6379

# Optional: PostgreSQL for persistent storage
# Format: postgresql://user:pass@host:port/database
DATABASE_URL=

# === Security ===
# Required: JWT signing secret (min 32 bytes)
# Generate with: openssl rand -hex 32
JWT_SECRET=

# Required: Internal API authentication key
# Generate with: openssl rand -hex 32
LIV_API_KEY=

# === Server ===
# Environment mode (development, production, test)
NODE_ENV=development

# === Ports ===
# Server ports (defaults shown)
MCP_PORT=3100
API_PORT=3200
MEMORY_PORT=3300

# === Daemon ===
# AI daemon polling interval in milliseconds
DAEMON_INTERVAL_MS=30000
# Default AI model to use
DEFAULT_MODEL=gemini-2.0-flash
```

### Pattern 1: Empty Values with Generation Instructions
**What:** Leave secret values empty, provide generation command in comment
**When to use:** All cryptographic secrets (JWT, API keys you generate)
**Example:**
```bash
# Required: JWT signing secret (min 32 bytes)
# Generate with: openssl rand -hex 32
JWT_SECRET=
```

### Pattern 2: Sensible Defaults for Non-Secrets
**What:** Provide working defaults for development
**When to use:** Ports, URLs, feature flags
**Example:**
```bash
# Server ports (defaults shown)
MCP_PORT=3100
API_PORT=3200
```

### Pattern 3: Format Documentation
**What:** Show the expected format in comments
**When to use:** Complex values like URLs, connection strings
**Example:**
```bash
# Format: redis://[:password@]host[:port]
REDIS_URL=redis://localhost:6379
```

### Anti-Patterns to Avoid
- **Placeholder secrets like "xxx" or "sk-ant-xxx":** Developers may accidentally use these
- **Real-looking fake passwords:** "LivDB2024!" looks real, causes confusion
- **Missing required/optional labels:** Developers don't know what's mandatory
- **No generation instructions:** Developers create weak secrets

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret generation | Custom random | `openssl rand -hex 32` | Cryptographically secure |
| .gitignore patterns | Manual per-directory | Root-level comprehensive | Single source of truth |
| Environment validation | Runtime checks | Zod schemas (@livos/config) | Already built in Phase 1 |

**Key insight:** Phase 1 created @livos/config with Zod validation. This phase documents what variables that system expects, not duplicates validation.

## Common Pitfalls

### Pitfall 1: Placeholder Values That Look Real
**What goes wrong:** Developer uses "sk-ant-xxx" thinking it's a test key
**Why it happens:** .env.example has fake-but-real-looking values
**How to avoid:** Use empty values or obvious placeholders like `<YOUR_API_KEY>`
**Warning signs:** "Invalid API key" errors in development

### Pitfall 2: Incomplete .gitignore Coverage
**What goes wrong:** .env committed from a subdirectory
**Why it happens:** Subdirectory .gitignore doesn't cover .env
**How to avoid:** Root .gitignore with `**/.env` pattern, or ensure all .gitignore files cover .env
**Warning signs:** `git status` shows .env files

### Pitfall 3: Forgetting to Update .env.example
**What goes wrong:** New env var added but not documented
**Why it happens:** Developer adds to .env, forgets .env.example
**How to avoid:** Add @livos/config validation that fails fast for missing required vars
**Warning signs:** "Works on my machine" problems

### Pitfall 4: Secrets in Git History
**What goes wrong:** Secret was committed, then removed - still in history
**Why it happens:** .gitignore added after initial commit
**How to avoid:** Verify with `git log --all -- "*/.env"` that no .env was ever committed
**Warning signs:** `git log` shows .env files (we verified: no .env in history - GOOD)

### Pitfall 5: Inconsistent Variable Names
**What goes wrong:** livos/.env uses REDIS_URL, nexus expects REDIS_CONNECTION
**Why it happens:** Independent development, no standard
**How to avoid:** Single canonical .env.example at root with ALL variables
**Warning signs:** Services fail to connect despite .env being set

## Code Examples

### Creating a Secure .env from .env.example
```bash
# Source: Development workflow

# 1. Copy template
cp .env.example .env

# 2. Generate secrets
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "LIV_API_KEY=$(openssl rand -hex 32)" >> .env

# 3. Add your API keys from provider dashboards
# Edit .env and fill in GEMINI_API_KEY, ANTHROPIC_API_KEY
```

### Comprehensive .gitignore Pattern
```gitignore
# Source: Best practices from getfishtank.com

# Environment files (never commit secrets)
.env
.env.local
.env.*.local
.env.development
.env.staging
.env.production

# But DO commit the template
!.env.example
```

### Environment Variable Documentation Format
```bash
# Source: Best practices from dev.to

# === Section Name ===
# Description of this section

# Required: Brief description
# Format: format-specification-if-complex
# Generate with: command-if-applicable
VARIABLE_NAME=default-if-any
```

## Environment Variables Inventory

Variables that must be documented in .env.example, aligned with @livos/config from Phase 1:

### From @livos/config (Phase 1)
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LIVOS_BASE_DIR` | No | `/opt/livos` | Base installation directory |
| `NEXUS_BASE_DIR` | No | `/opt/nexus` | Nexus base directory |
| `LIVOS_DATA_DIR` | No | `/opt/livos/data` | Persistent storage |
| `LIVOS_LOGS_DIR` | No | `/opt/livos/logs` | Log files |
| `LIVOS_SKILLS_DIR` | No | `/opt/livos/skills` | LivOS skills |
| `NEXUS_SKILLS_DIR` | No | `/opt/nexus/app/skills` | Nexus skills |
| `NEXUS_WORKSPACE_DIR` | No | `/opt/nexus/workspace` | Workspace directory |
| `LIVOS_DOMAIN` | No | `localhost` | Primary domain |
| `LIVOS_USE_HTTPS` | No | `false` | Use HTTPS |
| `NEXUS_API_URL` | No | `http://localhost:3200` | Nexus API URL |
| `MEMORY_SERVICE_URL` | No | `http://localhost:3300` | Memory service URL |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection |

### From Existing .env Files (Additional)
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes* | - | Google AI API key |
| `ANTHROPIC_API_KEY` | No | - | Anthropic Claude API key |
| `JWT_SECRET` | Yes | - | JWT signing secret |
| `LIV_API_KEY` | Yes | - | Internal API key |
| `NODE_ENV` | No | `development` | Environment mode |
| `DAEMON_INTERVAL_MS` | No | `30000` | AI daemon interval |
| `DEFAULT_MODEL` | No | `gemini-2.0-flash` | Default AI model |
| `MCP_PORT` | No | `3100` | MCP server port |
| `API_PORT` | No | `3200` | API server port |
| `MEMORY_PORT` | No | `3300` | Memory service port |
| `DATABASE_URL` | No | - | PostgreSQL connection |
| `WHATSAPP_ENABLED` | No | `false` | WhatsApp integration |
| `NOTIFICATION_EMAIL` | No | - | Notification email |
| `SMTP_HOST` | No | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | - | SMTP username |
| `SMTP_PASS` | No | - | SMTP password |

*At least one AI API key required for AI features

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.env.template` | `.env.example` | Standardized | Naming convention |
| Fake placeholder secrets | Empty with generation docs | 2024+ | Clearer, safer |
| Per-directory .gitignore | Root-level comprehensive | Always | Single source of truth |
| Manual secret generation | Documented generation commands | Best practice | Reproducible setup |

## Open Questions

1. **Should secrets be rotated after this phase?**
   - What we know: Real secrets exist in .env files that developers may have seen
   - What's unclear: Whether these were ever shared or committed (git log shows: no)
   - Recommendation: Recommend rotation in phase documentation, but not mandatory

2. **Single root .env or per-package?**
   - What we know: Currently both exist (livos/.env AND livos/packages/liv/.env with same content)
   - What's unclear: Whether packages need independent config
   - Recommendation: Single root .env.example, packages inherit via dotenv path resolution

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis via Grep/Glob/Read tools
- Phase 1 research and @livos/config implementation
- Git status verification of tracked files

### Secondary (MEDIUM confidence)
- [Fishtank: Best Practices for .env Files](https://www.getfishtank.com/insights/best-practices-for-committing-env-files-to-version-control) - .gitignore patterns
- [OneUpTime: Docker Environment Files](https://oneuptime.com/blog/post/2026-01-16-docker-env-files/view) - Template structure
- [DEV.to: Environment Variables Best Practices](https://dev.to/khalidk799/environment-variables-its-best-practices-1o1o) - Documentation format
- [DEV.to: Documenting .env Files](https://dev.to/mrsauravsahu/documenting-env-files-for-nodejs-projects-3a9j) - Comment conventions

### Tertiary (LOW confidence)
- None required - this is a well-established domain

## Metadata

**Confidence breakdown:**
- Current state analysis: HIGH - Direct file reads
- .gitignore coverage: HIGH - Verified with git status and file reads
- Best practices: MEDIUM - WebSearch verified with multiple sources
- Variable inventory: HIGH - Derived from @livos/config + existing .env files

**Research date:** 2026-02-03
**Valid until:** 2026-04-03 (stable domain, conventions rarely change)

## Checklist for Planner

The planner should create tasks for:

1. [ ] Verify all .gitignore files properly exclude .env files
2. [ ] Create canonical root `.env.example` with all variables documented
3. [ ] Update/replace existing inconsistent .env.example files
4. [ ] Add setup instructions for generating secrets
5. [ ] Optionally: Add pre-commit hook to prevent .env commits
6. [ ] Document secret rotation recommendation in SUMMARY.md
