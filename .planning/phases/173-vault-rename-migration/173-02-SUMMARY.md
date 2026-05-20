---
phase: 173-vault-rename-migration
plan: 02
subsystem: vault-items
tags:
  - vault-rename
  - session-migration
  - chat-items
  - backup
  - tdd
  - phase-173
requirements:
  - D-V38-A
  - D-V38-B
  - D-V38-T
dependency-graph:
  requires:
    - vault-items/item-store.ts (Phase 171-02 — public API: create, update, list)
    - vault-items/types.ts (Phase 171-01 — ChatItem / BaseItem)
    - cc-pty/types.ts (Phase 166-01 — CcPtySession type, type-only import)
  provides:
    - migrateV35SessionsToV38() pure async function (DI-friendly)
    - MigrationResult discriminated result type {migrated, skipped, reason}
  affects:
    - none directly — caller (Phase 173-05 deploy or future boot path) decides when to invoke
tech-stack:
  added: []
  patterns:
    - DI ItemStore for testability (no Redis/tRPC/boot coupling)
    - Idempotency gate via backup-file existence (filesystem-persistent, survives restart)
    - Atomic source->backup move via single fs.rename (POSIX-atomic)
    - Title fallback via new Date(createdAt).toISOString() (matches assertion 3 regex)
    - v35 metadata pass-through via ItemStore.update() as extension fields on item.json
key-files:
  created:
    - livos/packages/livinityd/source/modules/vault-items/migration-v35-to-v38.ts (150 lines)
    - livos/packages/livinityd/source/modules/vault-items/migration-v35-to-v38.test.ts (159 lines)
  modified: []
decisions:
  - Idempotency keyed off backup-file existence (NOT in-memory state) — survives livinityd restart cleanly
  - v35 metadata (tmuxName, lastAttachedAt, lastMessageAt) preserved via ItemStore.update() extension-keys; ChatItem schema NOT widened (Phase 171-01 freeze stays sacred)
  - Atomic move via single fs.rename — backup-write and source-remove are one syscall (no two-step write-then-unlink race)
  - Title fallback uses ISO timestamp (not local-time) for cross-locale reproducibility
  - Partial-failure mid-migration is accepted-risk per master plan §"Migration constraints" (rare; duplicates can be deleted from SidebarTree in Phase 174)
metrics:
  duration_minutes: 16
  completed: 2026-05-20
  tasks_completed: 2
  assertions_passed: 8
  files_created: 2
  files_modified: 0
---

# Phase 173 Plan 02: Session Migration Writer Summary

One-liner: Pure DI migration function translates Phase 168 `livos-cc-sessions.json` flat-JSON envelope into Phase 171 ChatItems under Main Liv root, with backup-file-gated idempotency and 8/8 vitest coverage.

## Outcome

NEW `migrateV35SessionsToV38()` async function delivered as a side-effect-free, DI-injectable utility consuming Phase 171's `ItemStore` and Phase 166's `CcPtySession` shape. The function:

1. Reads `<vaultRoot>/.claude/livos-cc-sessions.json` (Phase 168 SessionStore format)
2. Parses the `{schemaVersion:1, sessions:[CcPtySession,...]}` envelope
3. Creates one `ChatItem` per session under Main Liv root (`parentId: null`)
4. Preserves `ccSessionId` natively (BaseItem extension) plus `tmuxName`, `lastAttachedAt`, `lastMessageAt` as pass-through extension keys on `item.json`
5. Generates `Session <ISO-timestamp>` titles for sessions without a custom `title`
6. Atomically renames source → `<vaultRoot>/.backups/v35-cc-sessions.json` (single `fs.rename` syscall)
7. Returns `{migrated:N, skipped:false}` on success, or `{migrated:0, skipped:true, reason:'already-migrated'|'no-source'}` on no-op paths

## Tasks Executed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write `migration-v35-to-v38.test.ts` (RED, 8 assertions) | `23e8cb6a` | `migration-v35-to-v38.test.ts` |
| 2 | Implement `migration-v35-to-v38.ts` (GREEN) | `1cf25364` | `migration-v35-to-v38.ts` |

## Test Coverage (8/8 PASS)

```
✓ Assertion 1: N sessions in → N ChatItems out at root level
✓ Assertion 2: ccSessionId preserved on every migrated ChatItem
✓ Assertion 3: empty/missing title → generated `Session <ISO>` name
✓ Assertion 4: custom non-empty title preserved verbatim
✓ Assertion 5: source file moved away from original path
✓ Assertion 6: backup at .backups/v35-cc-sessions.json contains original envelope
✓ Assertion 7: idempotency — second run = no-op
✓ Assertion 8: no-source no-op when source file absent

Test Files  1 passed (1)
     Tests  8 passed (8)
  Duration  ~110ms (tests only)
```

Run command: `cd livos/packages/livinityd && npx vitest run source/modules/vault-items/migration-v35-to-v38.test.ts`

## Key Decisions

### Decision 1: Idempotency Strategy — Backup-file Gate

The function checks for `<vaultRoot>/.backups/v35-cc-sessions.json` first. If it exists, migration already ran → return `{skipped:true, reason:'already-migrated'}`. This is filesystem-persistent, so it survives livinityd restart, vault clones, and crash recovery without needing in-memory state, Redis flags, or sentinel files anywhere else.

### Decision 2: v35 Metadata Pass-through (No Schema Widening)

`ChatItem` (Phase 171-01) only natively carries `ccSessionId`. The plan's `must_haves` require preserving `tmuxName`, `lastAttachedAt`, `lastMessageAt` on each migrated item too. Instead of widening `ChatItem` (which would mutate the sacred Phase 171-01 type surface), the migration uses `ItemStore.update(id, {...} as never)` to write extra keys directly into `item.json`. `ItemStore.update()` strips immutable keys (`id`/`type`/`createdAt`/`schemaVersion`) but otherwise merges the patch verbatim, so unknown keys land on disk where Phase 175 reconciliation tooling can read them later.

The extension keys are namespaced as `v35LastAttachedAt` / `v35LastMessageAt` to make their origin obvious; `tmuxName` is preserved with its original key for direct reconciliation with the legacy `livos-cc-sessions.json` shape.

### Decision 3: Atomic source→backup via fs.rename

Single `fs.rename(sourceFile, backupFile)` does two things in one syscall: writes the backup AND removes the source. This eliminates the two-step "write backup then unlink source" race where a crash between operations could leave both copies on disk (and trigger duplicate migration on next boot). `mkdir -p .backups` precedes the rename so the destination directory exists.

### Decision 4: ISO Title Fallback

`new Date(createdAt).toISOString()` produces `2026-05-20T12:00:00.000Z`-style strings — locale-independent, sortable, and matches the test regex `/^Session 2026-05-20T/`. Local-time formatting was rejected because it would break tests across timezones and cause inconsistent display when the vault is opened from different boxes.

## Deviations from Plan

None — plan executed exactly as written. Both task `<action>` code blocks were used verbatim. Both vitest verification commands passed on first GREEN run with no debug iterations.

## Sacred Guard Compliance

`git diff` confirms ONLY 2 NEW files added; no modifications to:
- `livos/packages/livinityd/source/modules/vault-items/item-store.ts` (Phase 171-02 freeze)
- `livos/packages/livinityd/source/modules/vault-items/types.ts` (Phase 171-01 freeze)
- `livos/packages/livinityd/source/modules/vault-items/vault-root-resolver.ts` (Phase 171-01 freeze)
- `livos/packages/livinityd/source/modules/cc-pty/types.ts` (Phase 166-01 freeze — type-only import)
- `livos/packages/livinityd/source/modules/cc-pty/session-store.ts` (Phase 166-02 freeze — NOT imported; we read JSON directly)
- `liv/packages/core/src/sdk-agent-runner.ts` (Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`)

Pre-commit hook output on both task commits: `[sacred-sha] PASS: 25 files verified`.

## Threats Mitigated / Accepted

| Threat ID | Description | Disposition |
|-----------|-------------|-------------|
| T-173-02-01 | Tampered source JSON (bad envelope shape) | Mitigate — explicit `Array.isArray(envelope.sessions)` check throws before any `store.create()` call |
| T-173-02-02 | Partial-failure mid-migration (K of N created, then rename fails) | Accept — documented in master plan §"Migration constraints"; duplicates manageable from SidebarTree (Phase 174) |
| T-173-02-03 | Unsafe `vaultRoot` path (empty/non-string) | Mitigate — explicit guard at function entry; `ItemStore` constructor enforces absolute-path normalization downstream |

## Verification

- [x] `cd livos/packages/livinityd && npx vitest run source/modules/vault-items/migration-v35-to-v38.test.ts` exits 0 with `8/8 PASS` (verified)
- [x] `npx tsc --noEmit` clean for the 2 new files (verified via grep for `migration-v35`)
- [x] New module imports ONLY from `./item-store.js`, `../cc-pty/types.js` (type-only), and node stdlib — NOT from `session-store.ts` (verified via grep)
- [x] Sacred SHA hook PASS on both commits (`23e8cb6a` and `1cf25364`)
- [x] `git diff --name-status HEAD~2 HEAD` shows ONLY 2 new files added

## Output Artifacts

- `livos/packages/livinityd/source/modules/vault-items/migration-v35-to-v38.ts` (150 lines, exports `migrateV35SessionsToV38`, `MigrationOptions`, `MigrationResult`)
- `livos/packages/livinityd/source/modules/vault-items/migration-v35-to-v38.test.ts` (159 lines, 8 vitest assertions in one `describe` block)

## Carryover / Wire-up (Future Phases)

This plan delivers the migration **function** but does NOT wire it into any caller. Two future phases will pick it up:

1. **Phase 173-05** (or the deploy-script wave): invoke `migrateV35SessionsToV38()` from `scripts/migrate-v35-to-v38.sh` after the vault path rename, so on-disk Phase 168 sessions land in the v38 tree at deploy time.
2. **Phase 174** (sidebar consumer): SidebarTree reads from `ItemStore.list({parentId: null})` and will surface the migrated ChatItems alongside the v35 sidebar entries during the Phase 175 transition window.

The DI shape was deliberately kept opaque (`{store, vaultRoot}`) so either caller can pass a freshly-constructed `ItemStore` or share a singleton with the rest of livinityd's vault-items consumers.

## Self-Check: PASSED

- File: `migration-v35-to-v38.ts` — FOUND (150 lines)
- File: `migration-v35-to-v38.test.ts` — FOUND (159 lines)
- Commit: `23e8cb6a` (RED test) — FOUND in git log
- Commit: `1cf25364` (GREEN impl) — FOUND in git log
- 8 vitest assertions PASS (verified verbose reporter output)

---
*Phase: 173-vault-rename-migration*
*Plan: 173-02*
*Wave: 1 (parallel with 173-01, 173-03, 173-04)*
*Completed: 2026-05-20*
