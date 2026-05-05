---
phase: 75-reasoning-cards-lightweight-memory
plan: 03
subsystem: livinityd-database
tags: [postgres, pinned, repository, memory, agent-context, mem-07]
requires:
  - 75-01 (conversations + messages tables — pinned_messages FK targets)
provides:
  - pinned_messages table (UUID PK, user-scoped, FK to users/conversations/messages)
  - PinnedMessagesRepository DAO (pin/unpin/unpinById/listForUser/getContextString)
  - getContextString system-prompt formatter (CONTEXT D-19 format)
affects:
  - livos/packages/livinityd/source/modules/database/schema.sql (+25 lines)
tech-stack:
  added: []
  patterns:
    - parameterized SQL ($1, $2, ...) for all values
    - WHERE user_id = $userId on every read/delete (privacy boundary)
    - ON CONFLICT (user_id, message_id) DO NOTHING for idempotent pin
    - oldest-pins-first truncation at 4096-char default budget
key-files:
  created:
    - livos/packages/livinityd/source/modules/database/pinned-messages-repository.ts
    - livos/packages/livinityd/source/modules/database/pinned-messages-repository.test.ts
  modified:
    - livos/packages/livinityd/source/modules/database/schema.sql
decisions:
  - "Append-only schema edit positioned BETWEEN 75-01's messages indexes and 76-01's agent_templates section under namespaced '-- Phase 75-03' comment header (avoids conflict with concurrent 76-01 work)."
  - "getContextString returns '' when only the header would fit — caller (plan 75-07) skips the section entirely instead of emitting a dangling header."
  - "Hard cap 100 pins fetched in getContextString (T-75-03-04 DoS mitigation), even when caller asks for more."
  - "Free-form pins (no messageId) are allowed — both message_id and conversation_id columns are nullable. Re-pin idempotency only applies when messageId is set (UNIQUE constraint)."
metrics:
  duration: 4 min
  completed: 2026-05-04
  tasks_completed: 1
  files_changed: 3
  lines_added: 556
  tests_passing: 17
---

# Phase 75 Plan 03: Pinned Messages Repository Summary

PinnedMessagesRepository DAO over a new `pinned_messages` table; ships the `getContextString` system-prompt formatter that plan 75-07 will wire into the agent run path.

## What Shipped

### `livos/packages/livinityd/source/modules/database/schema.sql` (modified, +25 lines)
- New `pinned_messages` table positioned AFTER 75-01's `messages` table and BEFORE 76-01's `agent_templates` table, under namespaced `-- Phase 75-03: Pinned Messages (MEM-07)` comment header.
- Columns: `id UUID PK gen_random_uuid()`, `user_id UUID NOT NULL FK users(id) ON DELETE CASCADE`, `conversation_id TEXT FK conversations(id) ON DELETE CASCADE` (nullable), `message_id UUID FK messages(id) ON DELETE CASCADE` (nullable for free-form pins), `content TEXT NOT NULL`, `label TEXT`, `pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `UNIQUE(user_id, message_id)`.
- Index: `idx_pinned_user_pinned ON pinned_messages(user_id, pinned_at DESC)`.
- Idempotent: `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` (re-runnable on every boot).

### `livos/packages/livinityd/source/modules/database/pinned-messages-repository.ts` (new, 177 lines)
- `class PinnedMessagesRepository` with `(pool: pg.Pool)` constructor.
- `async pin(input: PinInput): Promise<string>` — INSERT … ON CONFLICT (user_id, message_id) DO NOTHING RETURNING id; falls back to SELECT when conflict triggered.
- `async unpin(userId, messageId): Promise<void>` — DELETE by (user_id, message_id) unique key.
- `async unpinById(userId, pinId): Promise<void>` — DELETE by (user_id, id) — used for free-form pins.
- `async listForUser(userId, limit=50): Promise<PinnedMessageRow[]>` — ORDER BY pinned_at DESC LIMIT $2.
- `async getContextString(userId, maxChars=4096): Promise<string>` — formats pins per CONTEXT D-19. Header `'## Pinned Memory\n...'` followed by `- ${label}: ${content}\n` lines (label falls back to first 60 chars of content). Truncates oldest first by walking newest-first and stopping when the next line would burst budget. Returns `''` when zero pins OR when only the header would fit.
- `mapPinnedRow` snake_case → camelCase mapper.
- Exports: `PinnedMessageRow`, `PinInput`, `PinnedMessagesRepository`.

### `livos/packages/livinityd/source/modules/database/pinned-messages-repository.test.ts` (new, 354 lines)
- 17 vitest cases covering: pin INSERT path, pin ON CONFLICT fallback SELECT path, pin defensive empty-rows path, free-form pin (no messageId), parameterized unpin/unpinById, listForUser default + explicit limit + camelCase mapping, getContextString empty / header-built / label-fallback / budget-truncation-to-empty / partial-truncation, SQLi mitigation (`'; DROP TABLE …; --` parameterized), multi-user privacy boundary (every WHERE includes `user_id = $1`).

## Test Results

```
RUN  v2.1.9
✓ source/modules/database/pinned-messages-repository.test.ts (17 tests) 6ms
Test Files  1 passed (1)
     Tests  17 passed (17)
```

## Verification Gates

| Gate | Result |
|------|--------|
| schema.sql contains pinned_messages + UNIQUE + idx + 3 FKs | PASS |
| pinned_messages CREATE positioned AFTER messages CREATE | PASS |
| repository exports class + 5 methods + 2 types + ON CONFLICT clause + header literal | PASS |
| sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged at start AND end | PASS |
| `pnpm exec vitest run pinned-messages-repository.test.ts` exits 0 | PASS (17/17) |

## Schema Ordering Confirmation

`schema.sql` line layout after this plan:

```
... 75-01 conversations + messages tables (lines 387-415)
CREATE INDEX IF NOT EXISTS idx_messages_content_tsv ON messages USING GIN (content_tsv);

-- Phase 75-03: Pinned Messages (MEM-07)
CREATE TABLE IF NOT EXISTS pinned_messages (...)        ← THIS PLAN
CREATE INDEX IF NOT EXISTS idx_pinned_user_pinned (...) ← THIS PLAN

-- Phase 76: Agent Templates (MARKET-01)                ← 76-01 (already shipped)
CREATE TABLE IF NOT EXISTS agent_templates (...)
```

`pinned_messages` is positioned strictly AFTER `messages` (FK target) and slots cleanly between two namespaced sections. Both 75-01 schema additions (`conversations` + `messages` tables) were already present at plan start, so no wave-ordering escalation was needed.

## Wave-Ordering Note

Plan 75-03's `<implicit_dependency>` flagged a possible wave-bump scenario where 75-01's tables might not yet be present. **In practice, this plan's executor saw a clean schema.sql with both `conversations` (line 387) and `messages` (line 398) tables already present — 75-01 had landed cleanly before 75-03 ran.** No abort or escalation required. The append landed between 75-01's last index and 76-01's already-shipped section without any ordering conflict.

## Sacred SHA Verification

- Start: `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → `4f868d318abff71f8c8bfbcf443b2393a553018b`
- End:   `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → `4f868d318abff71f8c8bfbcf443b2393a553018b`

Match. The sacred file was never opened, never edited.

## Hard-Rule Compliance

- D-NO-BYOK — no Anthropic API key path touched.
- D-NO-SERVER4 — no server-side change; pure source-tree work in livinityd package.
- D-NO-NEW-DEPS — only existing `pg` + `vitest` used; no `package.json` modified.
- Sacred SHA unchanged.
- Schema edit is append-only (idempotent `CREATE TABLE IF NOT EXISTS`).
- Files staged individually (no `git add .` / `git add -A`).
- All SQL parameterized (`$1, $2, ...`).
- All reads/deletes scoped by `user_id` (multi-user privacy boundary).

## Deviations from Plan

None — plan executed exactly as written. TDD order: tests RED → repo file GREEN → schema append → final verification.

## Threat Surface

The plan's `<threat_model>` mitigations were all implemented:

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-75-03-01 SQLi | mitigate | All values via `$1, $2, ...`; tests assert SQL text never contains payload string |
| T-75-03-02 Cross-user pin access | mitigate | Every query has `WHERE user_id = $1`; test asserts substring on listForUser/unpin/unpinById |
| T-75-03-03 Prompt injection via pin content | accept-with-mitigation | getContextString caps at 4096 chars; deferred sanitization to v32 per plan |
| T-75-03-04 Pin spam DoS | mitigate | listForUser default 50, getContextString hard cap 100 |

No new threat surface introduced beyond the plan's threat register.

## Commit

- `2ed3e587` — feat(75-03): add pinned_messages table + DAO with system-prompt formatter

## Self-Check: PASSED

All claims verified:
- File `livos/packages/livinityd/source/modules/database/pinned-messages-repository.ts` exists.
- File `livos/packages/livinityd/source/modules/database/pinned-messages-repository.test.ts` exists.
- File `livos/packages/livinityd/source/modules/database/schema.sql` modified (pinned_messages block present after messages block).
- Commit `2ed3e587` exists in `git log`.
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged.
- vitest run reports 17/17 passing.
