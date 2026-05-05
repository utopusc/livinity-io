---
phase: 75-reasoning-cards-lightweight-memory
plan: 01
subsystem: livinityd-database
tags: [postgres, fts, tsvector, gin, repository, search, mem-04, mem-05]

requires:
  - users table (existing schema.sql line 4)
  - pg.Pool (already wired via livos/packages/livinityd/source/modules/database/index.ts)
  - vitest (already wired in livinityd devDependencies)

provides:
  - "conversations table (PG)"
  - "messages table (PG) with content_tsv TSVECTOR GENERATED STORED + GIN index"
  - "ConversationsRepository (DAO)"
  - "MessagesRepository (DAO) with FTS search()"

affects:
  - "Plan 75-02 (write-through from Redis) — imports both repositories"
  - "Plan 75-03 (pinned_messages) — appends to same schema.sql; clean trailing newline preserved"
  - "Plan 75-06 (search API + UI) — wraps MessagesRepository.search() in HTTP route"

tech-stack:
  added: []
  patterns:
    - "pg parameterized queries ($1, $2, ...) — zero string interpolation of user input"
    - "snake_case (DB) -> camelCase (TS) row mappers"
    - "Pool injected via constructor (pure DAO, no globals)"
    - "Postgres GENERATED STORED column (PG12+) for tsvector — no triggers"
    - "GIN index on content_tsv for sub-100ms FTS"

key-files:
  created:
    - "livos/packages/livinityd/source/modules/database/conversations-repository.ts (88 LOC)"
    - "livos/packages/livinityd/source/modules/database/conversations-repository.test.ts (174 LOC)"
    - "livos/packages/livinityd/source/modules/database/messages-repository.ts (203 LOC)"
    - "livos/packages/livinityd/source/modules/database/messages-repository.test.ts (345 LOC)"
  modified:
    - "livos/packages/livinityd/source/modules/database/schema.sql (+41 LOC, +2 tables, +4 indexes)"

decisions:
  - "Schema additions placed at the very end of schema.sql, AFTER existing tables and DO-blocks (Phase 75-03 will continue appending pinned_messages)"
  - "content_tsv is a STORED GENERATED column, NOT a trigger — PG12+ feature, simpler + atomic with row writes (CONTEXT D-07)"
  - "Default LIMIT 200 for listByConversation, 25 for search() — matches CONTEXT D-08"
  - "search() rejects <2 chars + >200 chars at the repository layer (T-75-01-03 DoS), no DB hit"
  - "upsertMany builds ONE multi-row INSERT (not per-row) per CONTEXT D-discretion — caller chunks at 500"
  - "Repositories are pure DAOs — no logger, no env, no business logic; errors bubble up"
  - "Used randomUUID() from node:crypto (already in stdlib) for absent ids — no new deps"

metrics:
  duration: "~10 minutes (continuous; no checkpoints)"
  completed: "2026-05-04"
  tasks_completed: 2
  files_created: 4
  files_modified: 1
  tests_written: 31
  tests_passing: 31
---

# Phase 75 Plan 01: Postgres FTS Foundation (Conversations + Messages Tables + Repositories) Summary

Two new Postgres tables (`conversations`, `messages` with `content_tsv` TSVECTOR GENERATED STORED + GIN index) and two pure-DAO repositories (`ConversationsRepository`, `MessagesRepository`) shipped — the data layer for v31 lightweight memory. `MessagesRepository.search()` implements CONTEXT D-08 verbatim (ts_headline + ts_rank + plainto_tsquery + content_tsv @@ predicate).

## What Shipped

### Schema additions (`livos/packages/livinityd/source/modules/database/schema.sql`)

Appended after the last existing block (line 377 → 415):

```sql
-- =========================================================================
-- Conversations + Messages (Phase 75 MEM-04 — Postgres FTS)
-- =========================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
  ON conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content         TEXT NOT NULL,
  reasoning       TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content_tsv     TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_created         ON messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_content_tsv          ON messages USING GIN (content_tsv);
```

- All `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` — idempotent on every livinityd boot per existing pattern (`database/index.ts:68` runs `await client.query(schemaSql)`).
- Existing 17 tables untouched.
- File ends with a clean newline (verified with byte-level inspection: last 2 bytes are `0x0D 0x0A`) — Phase 75-03's append for `pinned_messages` will not conflict.

### `ConversationsRepository` (88 LOC)

| Method | SQL shape |
|---|---|
| `upsert(conv)` | `INSERT INTO conversations (...) VALUES (...) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, updated_at = EXCLUDED.updated_at` (5 params; createdAt/updatedAt fall back to `NOW()` via COALESCE) |
| `getById(id, userId)` | `SELECT ... FROM conversations WHERE id = $1 AND user_id = $2` |
| `listForUser(userId, limit=50)` | `SELECT ... FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2` |
| `deleteById(id, userId)` | `DELETE FROM conversations WHERE id = $1 AND user_id = $2` |

### `MessagesRepository` (203 LOC)

| Method | SQL shape |
|---|---|
| `insertOne(msg)` | `INSERT INTO messages (...) VALUES (...) ON CONFLICT (id) DO NOTHING` (8 params; returns id) |
| `upsertMany(msgs)` | empty array → 0 (no DB hit); else single multi-row INSERT, `($1..$8), ($9..$16), ...`, ON CONFLICT DO NOTHING |
| `listByConversation(cid, uid, limit=200)` | `WHERE conversation_id = $1 AND user_id = $2 ORDER BY created_at ASC LIMIT $3` |
| `search(uid, query, limit=25)` | CONTEXT D-08 verbatim: `ts_headline('english', m.content, plainto_tsquery('english', $1), 'StartSel=<mark>, StopSel=</mark>, MaxWords=18, MinWords=8, MaxFragments=2') AS snippet, ts_rank(m.content_tsv, plainto_tsquery('english', $1)) AS rank ... WHERE m.user_id = $2 AND m.content_tsv @@ plainto_tsquery('english', $1) ORDER BY rank DESC, m.created_at DESC LIMIT $3` |

### Search query-length validation (D-30 / T-75-01-03)

```typescript
const trimmed = query.trim()
if (trimmed.length < 2) return []
if (trimmed.length > 200) throw new Error('query too long')
```

Empty / whitespace-only / 1-char queries short-circuit to `[]` with **no DB hit**. Oversized queries throw before invoking ts_headline (which would otherwise be expensive on giant inputs).

## Test Results

| File | Tests | Pass | Duration |
|---|---|---|---|
| `conversations-repository.test.ts` | 10 | 10 | 7 ms |
| `messages-repository.test.ts` | 21 | 21 | 9 ms |
| **Total** | **31** | **31** | **~17 ms** |

```
Test Files  2 passed (2)
     Tests  31 passed (31)
  Duration  497ms (transform 82ms, setup 0ms, collect 106ms, tests 17ms, environment 0ms, prepare 319ms)
```

Run command (livinityd workspace):

```bash
./node_modules/.bin/vitest run \
  source/modules/database/conversations-repository.test.ts \
  source/modules/database/messages-repository.test.ts
```

(`pnpm --filter livinityd exec vitest` reported "Command not found" because pnpm's per-workspace exec lookup misfired — vitest IS installed in livinityd's local `node_modules/.bin/vitest`. The direct invocation works and is the canonical fallback.)

### Test coverage highlights

- **upsert/insertOne shape**: `INSERT ... ON CONFLICT (id) DO UPDATE/DO NOTHING` substring asserted; param count + position verified.
- **getById null path**: `mock.setNextResult({rows: []}) → repo.getById('x','u') === null`.
- **camelCase mapping**: snake_case columns (`user_id`, `created_at`, `message_id`, `conversation_title`) mapped to `userId`, `createdAt`, `messageId`, `conversationTitle`.
- **upsertMany([]) → 0 with no DB hit**: pool.query never called.
- **upsertMany 3-row INSERT**: placeholders `$1..$24`, values length 24.
- **search empty/short/whitespace queries**: all short-circuit, queries.length === 0.
- **search >200 chars throws 'query too long'**: rejects without DB hit.
- **search SQL substrings**: `plainto_tsquery('english'`, `ts_headline`, `ts_rank`, `content_tsv @@`, `StartSel=<mark>`, `MaxWords=18`, `MinWords=8`, `MaxFragments=2`, `LIMIT $3`, `LEFT JOIN conversations` — all present.
- **search trims query before passing as $1**: `'   needle   '` → `'needle'` in values[0].
- **SQL injection mitigation (T-75-01-01)**: malicious strings (`'; DROP TABLE messages; --`) flow into `values[N]`, never into the SQL text. Tested for both `upsert.id` and `search.query` and `insertOne.content`.
- **Multi-user privacy boundary (T-75-01-02)**: every method's SQL contains `user_id =` substring (or `WHERE m.user_id = $2` for search).

## Schema Diff Summary

- **Tables added:** 2 (`conversations`, `messages`)
- **Indexes added:** 4 (`idx_conversations_user_updated`, `idx_messages_conversation_created`, `idx_messages_user_created`, `idx_messages_content_tsv` GIN)
- **Tables modified:** 0
- **Tables removed:** 0
- **Conflicts with existing names:** none. Both `conversations` and `messages` are fresh — no prior CREATE TABLE for either name in schema.sql.

## Sacred SHA Verification (D-35)

| Phase | `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` |
|---|---|
| Start of Task 1 | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| End of Task 1 | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| End of Task 2 | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |

`nexus/` was not touched by this plan at any point.

## Confirmation: No broker / sacred / endpoint surface touched

- ✅ `nexus/packages/core/src/sdk-agent-runner.ts` — SHA unchanged (D-35).
- ✅ No new top-level dependencies added to `livos/packages/livinityd/package.json`. `pg` already a direct dep; `vitest` already a devDep; `randomUUID` from `node:crypto` (stdlib).
- ✅ No existing tables, columns, indexes, or triggers altered (purely additive).
- ✅ No HTTP endpoints touched — repositories are wire-up-ready but not yet mounted (Plans 75-02 and 75-06 will).
- ✅ D-NO-BYOK: this plan is pure DB layer, no auth surface affected.
- ✅ D-NO-SERVER4: no server-side deploy.

## Deviations from CONTEXT D-05..D-09

**None.** SQL shapes (table DDL, GIN index, search query with ts_headline/ts_rank/plainto_tsquery) match CONTEXT verbatim. The only minor extras are:

- `mapSearchRow.rank` — defensive `typeof r.rank === 'number' ? r.rank : Number(r.rank)` cast. Postgres `numeric`/`real` types come back as JS numbers from `pg` driver in practice, but `Number()` fallback covers the rare `pg.types` config where they arrive as strings.
- Search `mapSearchRow.conversationTitle` — uses `r.conversation_title ?? null` rather than relying on JS coercion. Behavioral parity with the LEFT JOIN that allows orphan messages.

Both are mapping-layer hygiene, not SQL-shape changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] vitest invocation path**

- **Found during:** Task 1 verification step
- **Issue:** `pnpm --filter livinityd exec vitest` exited with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "vitest" not found`. The plan's verify step used this invocation.
- **Root cause:** pnpm's recursive-exec lookup didn't find vitest under livinityd's local `node_modules/.bin` reliably on Windows. vitest IS installed there.
- **Fix:** Used direct `./node_modules/.bin/vitest run` from the livinityd workspace directory. Both test suites pass.
- **Files modified:** none (only test invocation method).
- **Commit:** N/A (verification fix, not source change).

No other deviations. Rules 1, 2, 4 not triggered.

## Auth Gates

None. This plan is pure DB code.

## Per-Task Commits

| Task | Type | Commit | Files |
|---|---|---|---|
| 1 (RED) | test | `a814c810` | `conversations-repository.test.ts` |
| 1 (GREEN) | feat | `b9b6bfe6` | `schema.sql`, `conversations-repository.ts` |
| 2 (RED) | test | `72367292` | `messages-repository.test.ts` (folded into a parallel commit by another agent — see note below) |
| 2 (GREEN) | feat | `12fa3a77` | `messages-repository.ts` |

**Note on commit `72367292`:** A parallel executor (Phase 70-06 LivStopButton) ran concurrently and inadvertently picked up `messages-repository.test.ts` while it sat staged in the index. The test file content is unchanged from what this plan staged — it is the RED test described under Task 2. The commit message references 70-06 but the test file content corresponds to 75-01 RED. No content drift.

## TDD Gate Compliance

- ✅ RED commit (test, fails because impl missing): `a814c810` (Task 1) + `72367292` carries Task 2 RED test
- ✅ GREEN commit (feat, makes test pass): `b9b6bfe6` (Task 1) + `12fa3a77` (Task 2)
- No REFACTOR commit (impl was minimal and clean from start).

## Self-Check: PASSED

- [x] `livos/packages/livinityd/source/modules/database/schema.sql` — modified (415 lines, was 377)
- [x] `livos/packages/livinityd/source/modules/database/conversations-repository.ts` — created (88 LOC, ≥80 required)
- [x] `livos/packages/livinityd/source/modules/database/conversations-repository.test.ts` — created (174 LOC, ≥80 required)
- [x] `livos/packages/livinityd/source/modules/database/messages-repository.ts` — created (203 LOC, ≥140 required)
- [x] `livos/packages/livinityd/source/modules/database/messages-repository.test.ts` — created (345 LOC, ≥120 required)
- [x] Commit `a814c810` (test 75-01 RED) — found in `git log --oneline -- livos/packages/livinityd/source/modules/database/`
- [x] Commit `b9b6bfe6` (feat 75-01 schema + ConversationsRepository) — found
- [x] Commit `72367292` (carries messages-repository.test.ts) — found
- [x] Commit `12fa3a77` (feat 75-01 MessagesRepository) — found
- [x] Sacred SHA `4f868d31...` unchanged (verified at end)
- [x] All 31 vitest tests pass
- [x] Schema-shape grep gates pass (`CREATE TABLE IF NOT EXISTS conversations`, `TSVECTOR GENERATED ALWAYS`, `idx_messages_content_tsv`, `USING GIN`, all FK constraints)
- [x] Repository-shape grep gates pass (class names, all 4 methods each, exported types, `ON CONFLICT (id) DO UPDATE/DO NOTHING`, `plainto_tsquery`, `ts_headline`, `ts_rank`, `content_tsv @@`, `query too long`)
