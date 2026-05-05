# Phase 85 (Schema Slice) — Summary

**Wave:** 1 (parallel with P80, P87)
**Slice:** Schema-only. P85-UI lands in Wave 2 and consumes this repo via tRPC.
**Status:** Complete. 23/23 new tests pass; 0 regressions across the database
test suite (86/86 total in `source/modules/database/`).

## Files Created

- `livos/packages/livinityd/source/modules/database/migrations/2026-05-05-v32-agents.sql`
  — agents table DDL + 3 indexes + agent_templates backfill (V32-AGENT-01, V32-AGENT-04)
- `livos/packages/livinityd/source/modules/database/migrations/2026-05-05-v32-agents-seed.sql`
  — 5-agent system seed mirror (V32-AGENT-03, documentation/manual-deploy artifact)
- `livos/packages/livinityd/source/modules/database/migrations/index.ts`
  — Migration registry stub (forward-compat for a future runner)
- `livos/packages/livinityd/source/modules/database/agents-repo.ts`
  — Function-export DAO with full CRUD + clone + publish + listPublic (V32-AGENT-02)
- `livos/packages/livinityd/source/modules/database/agents-repo.test.ts`
  — 23 vitest cases (mocked-pool pattern, matches Phase 76 discipline)
- `livos/packages/livinityd/source/modules/database/seeds/agents.ts`
  — 5 system agents with stable hand-authored UUIDs + idempotent runner (V32-AGENT-03)

## Files Modified

- `livos/packages/livinityd/source/modules/database/schema.sql`
  — Appended agents DDL + 3 indexes + V32-AGENT-04 backfill (mirror of migration SQL)
- `livos/packages/livinityd/source/modules/database/seeds/index.ts`
  — Re-exported `seedAgents`, `AGENT_SEEDS`, types
- `livos/packages/livinityd/source/modules/database/index.ts`
  — Re-exported all `agents-repo.ts` symbols + wired `seedAgents()` into
    `initDatabase()` after the existing `seedAgentTemplates()` call (same
    try/catch pattern: seed failure must not block boot)

## Migration Runner Pattern (which existing convention I matched)

**No real migration runner exists** in livinityd. The canonical schema lives
in `schema.sql` and is applied at boot via `initDatabase()` with
`CREATE TABLE IF NOT EXISTS`. I matched that convention while ALSO creating
discrete `.sql` files in a new `migrations/` directory for review and manual
hand-running on production.

The two paths are kept in sync:
- **schema.sql** — boot-applied, idempotent, source-of-truth for fresh installs
- **migrations/2026-05-05-v32-agents.sql** — discrete artifact for change review
- **migrations/2026-05-05-v32-agents-seed.sql** — SQL mirror of the TS seed runner

The TS seed runner (`seeds/agents.ts`) is the canonical seed source — invoked
from `initDatabase()` after schema apply, identical pattern to the existing
Phase 76 `seeds/agent-templates.ts` runner. The SQL mirror exists for hand-runs.

The new `migrations/index.ts` is a registry stub: it exports the ordered list
of migration filenames so a future runner can discover them, but is not
currently invoked by anything. v33 cleanup may grow this into a real runner.

## System-User vs Nullable user_id Decision

**Chose: nullable `user_id`** (NOT a system-user UUID constant).

Reasoning:
- `agent_templates` has NO `user_id` column at all (it's a global catalog),
  so there's no exact precedent to mirror.
- The closest precedent with a `user_id` column is `git_credentials`
  (schema.sql line 175-183), which uses
  `user_id UUID REFERENCES users(id) ON DELETE SET NULL` (nullable).
  `registry_credentials` uses the same pattern.
- Nullable user_id is byte-for-byte simpler than reserving a sentinel
  system-user UUID and managing its lifecycle (creation, FK constraints,
  accidentally deleting it).
- The 5 v32 system seeds and the V32-AGENT-04 agent_templates backfill all
  insert with `user_id = NULL, is_public = TRUE`. They survive
  user-row deletions by definition (CASCADE on a NULL FK is a no-op).

Repo encodes this via:
- `getAgent` matches when `user_id = $userId OR user_id IS NULL OR is_public = TRUE`
- `listAgents({includePublic: true})` merges system + user rows
- `cloneAgentToLibrary` source must satisfy `is_public = TRUE OR user_id IS NULL`
- `setMarketplacePublished` and `updateAgent` require `user_id = $userId`
  (callers can't toggle visibility on a row they don't own — system seeds
  are immutable from the API surface)

## Schema Deviations from CONTEXT.md DDL (documented)

CONTEXT.md specifies `agent_id UUID PRIMARY KEY` and `user_id NOT NULL
REFERENCES users(user_id)`. I deviated on three points:

1. **`agent_id` -> `id`** — Every other table in `schema.sql` uses
   `id UUID PRIMARY KEY` (users, sessions, environments, docker_agents,
   api_keys, messages, scheduled_jobs, ai_alerts, custom_domains,
   channel_identity_map, device_audit_log, broker_usage, pinned_messages,
   computer_use_tasks, etc.). Consistency with siblings beats CONTEXT verbatim.

2. **`users(user_id)` -> `users(id)`** — The `users` table PK column is
   literally `id` (schema.sql line 5). The CONTEXT DDL referenced a
   non-existent column.

3. **`user_id NOT NULL` -> `user_id` nullable** — Required for system seeds
   per V32-AGENT-03 ("agents.user_id allows NULL OR uses a system user UUID;
   pick the existing pattern from agent_templates"). See "System-User vs
   Nullable" section above.

All three deviations are noted in the SQL file's comment header so future
readers see the rationale at the source.

## The 5 Seed UUIDs (stable forever — reference these by id literal)

```
🤖 Liv Default        11111111-1111-4111-8111-111111111111
🔬 Researcher         22222222-2222-4222-8222-222222222222
💻 Coder              33333333-3333-4333-8333-333333333333
🖥️ Computer Operator  44444444-4444-4444-8444-444444444444
📊 Data Analyst       55555555-5555-4555-8555-555555555555
```

These are NOT `gen_random_uuid()` — they are hand-authored, stable, and
shape-validated at module-import time (`validateSeedsAtImport()` in
`seeds/agents.ts`). Wave 2 P85-UI tRPC code may reference them by id
for "Reset to Default" or curated featured-list features.

The seed runner uses `INSERT ... ON CONFLICT (id) DO NOTHING` so re-runs
on every boot are safe and idempotent.

## V32-AGENT-04 Backfill Mapping (agent_templates -> agents)

The backfill INSERT...SELECT explicitly maps each column (no `SELECT *`):

```
agent_templates.slug          -> dropped (agents has no slug column)
agent_templates.name          -> agents.name
agent_templates.description   -> agents.description
agent_templates.system_prompt -> agents.system_prompt
agent_templates.tools_enabled -> agents.agentpress_tools (jsonb array
                                  of tool name strings -> jsonb object
                                  via jsonb_object_agg(name, true))
agent_templates.tags          -> agents.tags
agent_templates.mascot_emoji  -> agents.avatar
(no source col)               -> agents.avatar_color  = NULL
(no source col)               -> agents.model_tier    = 'sonnet'
(no source col)               -> agents.configured_mcps = '[]'
(constants)                   -> is_public=TRUE, is_default=FALSE,
                                  marketplace_published_at=NOW()
```

Backfill is idempotent via `WHERE NOT EXISTS` on `(name, user_id IS NULL)` —
re-running boot does not duplicate the 8 Phase 76 templates as agent rows.
`agent_templates` table itself is NOT dropped (kept readonly per CONTEXT;
v33 cleanup will retire it).

## Verification Commands Run + Exit Codes

```
cd livos/packages/livinityd
npm run typecheck                                          # exit 0 for my files
                                                            #  (pre-existing
                                                            #  errors in routes/skills
                                                            #  unrelated to P85)
npx vitest run source/modules/database/agents-repo.test.ts # exit 0, 23/23 pass
npx vitest run source/modules/database/                    # exit 0, 86/86 pass
                                                            #  (no regressions on
                                                            #  agent-templates,
                                                            #  conversations,
                                                            #  messages, pinned)
```

The migration was NOT applied against the Mini PC (production deploy is
end-of-Wave verification per the orchestrator protocol). The schema is
already protected by `IF NOT EXISTS` on the next boot.

## Wave 2 Hand-off (P85-UI consumer notes)

Wave 2 P85-UI will:
1. Add tRPC routes that call `listAgents`, `getAgent`, `createAgent`, etc.
   from `database/index.ts` barrel re-export.
2. Likely register these routes in `httpOnlyPaths` in `common.ts` (per the
   existing v7.0 multi-user route pattern noted in MEMORY.md).
3. Use the camelCase `Agent` type from the barrel (NOT raw rows).
4. The 5 system seed UUIDs are stable references for any UI "default agent"
   chip / "reset" affordance.

The repo intentionally does not include a `setDefaultAgent` helper —
`updateAgent({isDefault: true})` is the only writer. The
`idx_agents_default` partial unique-ish index assumes the UI enforces "max
one default per user" at the application layer (the index is non-unique to
avoid a multi-write race).

## Commit SHA

`9a276a11` — feat(85-schema): agents table + repo + 5 seed migration
(10 files changed, 1738 insertions(+), 0 deletions). Not pushed; orchestrator
batches Wave 1.
