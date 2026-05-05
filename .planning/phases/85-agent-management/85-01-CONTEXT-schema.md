# Phase 85-Schema — Agent Management DB Migration (Wave 1 Slice)

**Milestone:** v32 AI Chat Ground-up Rewrite
**Wave:** 1 (file-disjoint, paralel P80 + P87)
**Effort:** ~3h (just the schema/migration/repo/seed; P85 UI is Wave 2)
**Sacred SHA gate:** N/A (pure backend DB)

## Goal

Land the `agents` table + repository + seed migration **before** the P85 UI work in Wave 2. Decouples DB risk from UI build. After this slice, the schema is live in production, queryable via tRPC, ready for the UI to consume in Wave 2.

## Requirements (V32-AGENT-01..04 — schema slice only)

- **V32-AGENT-01** — DB migration `livos/packages/livinityd/source/modules/database/migrations/2026-05-05-v32-agents.sql` creates the `agents` table with this exact schema:
  ```sql
  CREATE TABLE IF NOT EXISTS agents (
    agent_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    system_prompt   TEXT NOT NULL DEFAULT 'You are a helpful assistant.',
    model_tier      TEXT NOT NULL DEFAULT 'sonnet' CHECK (model_tier IN ('haiku', 'sonnet', 'opus')),
    configured_mcps JSONB NOT NULL DEFAULT '[]'::jsonb,
    agentpress_tools JSONB NOT NULL DEFAULT '{}'::jsonb,
    avatar          TEXT,
    avatar_color    TEXT,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    is_public       BOOLEAN NOT NULL DEFAULT FALSE,
    marketplace_published_at TIMESTAMPTZ,
    download_count  INTEGER NOT NULL DEFAULT 0,
    tags            TEXT[] NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX idx_agents_user_id ON agents(user_id);
  CREATE INDEX idx_agents_is_public_published ON agents(is_public, marketplace_published_at) WHERE is_public = TRUE;
  CREATE INDEX idx_agents_default ON agents(user_id, is_default) WHERE is_default = TRUE;
  ```

- **V32-AGENT-02** — `livos/packages/livinityd/source/modules/database/agents-repo.ts` implements:
  - `listAgents(userId, opts: {search?, sort?, limit, offset})` → paginated agents
  - `getAgent(agentId, userId)` → row or null (user scoping)
  - `createAgent(userId, dto)` → inserts row
  - `updateAgent(agentId, userId, partial)` → updates with `updated_at = NOW()`
  - `deleteAgent(agentId, userId)` → CASCADE removes
  - `cloneAgentToLibrary(sourceAgentId, targetUserId)` → INSERT new row from public source
  - `setMarketplacePublished(agentId, userId, published: boolean)` → toggle is_public + marketplace_published_at
  - All methods use parameterized queries (pg pool via existing infra)

- **V32-AGENT-03** — Seed migration runs once on first deploy: 5 specialized agents inserted with `is_public:true is_default:false` (system-wide, not user-scoped — agents.user_id allows NULL for system seeds OR uses a system user UUID; pick the existing pattern from `agent_templates`):
  - 🤖 **Liv Default** — generic, all 8 tools enabled
  - 🔬 **Researcher** — web_search + web_scrape + browser_devtools
  - 💻 **Coder** — terminal + files + browser_devtools + git
  - 🖥️ **Computer Operator** — bytebot MCP preconfigured
  - 📊 **Data Analyst** — files + CSV preview + python_exec (if available)

- **V32-AGENT-04** — Existing `agent_templates` table data migrated into `agents` via INSERT...SELECT statement preserving slug, name, description, tags, etc. `agent_templates` table NOT dropped (kept readonly for now, deletion at v33 cleanup phase).

## Files Affected

**Created:**
- `livos/packages/livinityd/source/modules/database/migrations/2026-05-05-v32-agents.sql`
- `livos/packages/livinityd/source/modules/database/migrations/2026-05-05-v32-agents-seed.sql`
- `livos/packages/livinityd/source/modules/database/agents-repo.ts`
- `livos/packages/livinityd/source/modules/database/agents-repo.test.ts` (basic CRUD tests)

**Modified:**
- `livos/packages/livinityd/source/modules/database/migrations/index.ts` (register new migration)
- `livos/packages/livinityd/source/modules/database/index.ts` (export agents-repo)

## Sacred / Constraint Notes

- **No core changes** — pure livinityd DB module
- **No UI changes** — UI lands in P85-UI (Wave 2)
- **Migration must be idempotent** — `CREATE TABLE IF NOT EXISTS`, seed uses `ON CONFLICT (slug) DO NOTHING` if seed_slug column exists, or check existence before INSERT
- **Existing agent_templates preserved** — readonly during v32, dropped in v33

## Verification

- [ ] Migration runs on Mini PC without error
- [ ] `psql -d livos -c "\d agents"` shows table with all columns + indexes
- [ ] `psql -d livos -c "SELECT count(*) FROM agents WHERE is_public=TRUE"` returns ≥5 (the seeds)
- [ ] `agents-repo.test.ts` passes (CRUD + clone + publish)
- [ ] No regression on existing `agent_templates` table — still has same row count

## Reference

Suna agent shape: `C:/Users/hello/Desktop/Projects/contabo/suna-reference/frontend/src/app/(dashboard)/agents/_types/index.ts`
