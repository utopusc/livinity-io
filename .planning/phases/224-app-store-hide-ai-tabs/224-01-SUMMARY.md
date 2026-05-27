---
phase: 224-app-store-hide-ai-tabs
plan: 01
subsystem: livinityd-trpc + ui-hooks
tags: [v42, feature-flag, trpc, redis, ui-hook, publicProcedure, http-only]
requirements: [SC-01, SC-02, SC-04, SC-05]
dependency_graph:
  requires: []
  provides:
    - "trpc:config.getV42MigrationActive"
    - "hook:useV42MigrationActive"
    - "redis-key:liv:config:liv_v42_migration_active"
  affects:
    - "Phase 224-02 nav filters (consumes the hook)"
    - "Phase 224-03 banner (consumes the hook)"
tech_stack:
  added: []
  patterns:
    - "factory-DI router with empty-injection Proxy stub (mirrors mcp-config-router.ts / xai-auth-router.ts)"
    - "publicProcedure (pre-auth callable from login screen)"
    - "httpOnlyPaths registration (avoids WS-handshake flicker on first paint)"
    - "default-ON loading state (hide-first, reveal-on-confirmation)"
key_files:
  created:
    - "livos/packages/livinityd/source/modules/server/trpc/config-router.ts"
    - "livos/packages/ui/src/hooks/use-v42-migration-active.ts"
  modified:
    - "livos/packages/livinityd/source/modules/server/trpc/index.ts"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts"
    - "livos/packages/livinityd/source/index.ts"
decisions:
  - "publicProcedure (not adminProcedure) — login screen mounts the same React tree that calls the hook; restricting to authenticated sessions would flicker the about-to-be-hidden surfaces between mount and post-login refetch."
  - "Loading default = true (hide-first) — operator never glimpses about-to-be-hidden Skills/MCP/AI tabs during the cold-paint window."
  - "Single Redis string key (not a hash) — Phase 224 has exactly one flag; HSET overhead unjustified."
  - "Empty-injection Proxy stub throws PRECONDITION_FAILED / CONFIG_ROUTER_NOT_WIRED — loud failure if boot wire-up regresses, instead of silent default-true."
  - "staleTime 30_000 + refetchOnWindowFocus — operator can flip the Redis key from the Mini PC shell and alt-tab into the UI to see the change without hard reload."
metrics:
  duration_seconds: 259
  tasks_completed: 3
  files_created: 2
  files_modified: 3
  commits: 3
  completed_date: "2026-05-27"
---

# Phase 224 Plan 01: Backend procedure + UI hook scaffolding Summary

## One-liner

Backend `config.getV42MigrationActive` publicProcedure tRPC query (Redis-key-backed, default-ON) plus matching React hook `useV42MigrationActive()` — the shared feature-flag accessor every Phase 224-02 / 224-03 hide consumes.

## What shipped

### Backend

- **Procedure path**: `config.getV42MigrationActive`
- **Type**: `publicProcedure` (readable pre-auth — login screen sits in the same React tree)
- **Redis key**: `liv:config:liv_v42_migration_active`
- **Return shape**: `{active: boolean}`
- **Default semantics**:
  - Key missing → `{active: true}` (default-ON; v42 migration mode active during v42 development)
  - Value `=== 'false'` (literal string) → `{active: false}` (rollback path)
  - Any other value (incl. `'true'`, `'1'`, whitespace, etc.) → `{active: true}`
- **Transport**: HTTP via `httpOnlyPaths` registration (avoids WS-handshake-delay flicker on first paint AND lets the hook resolve before WS hand-shake)
- **Wire-up**: production `createConfigRouter({redis: this.ai.redis})` injected at line ~1834 of `livos/packages/livinityd/source/index.ts`; default empty-injection Proxy stub throws `PRECONDITION_FAILED / CONFIG_ROUTER_NOT_WIRED` until the factory call lands.

### Frontend

- **Hook export**: `useV42MigrationActive(): boolean`
- **File**: `livos/packages/ui/src/hooks/use-v42-migration-active.ts`
- **Return contract**: `true` while loading or on error (hide-first), `true` when the server reports `active: true`, `false` only when the server reports `active: false`.
- **Cache**: `staleTime: 30_000`, `refetchOnWindowFocus: true` (operator can flip Redis and alt-tab to see the change).

## Commits

| Task | Description                                                   | Commit     |
| ---- | ------------------------------------------------------------- | ---------- |
| 1    | `config.getV42MigrationActive` tRPC procedure                 | `e688b5fb` |
| 2    | Mount config router + httpOnlyPaths + production wire         | `43742e1c` |
| 3    | `useV42MigrationActive` React hook                            | `285885f9` |

## Sacred SHA verification

D-V42-SACRED: Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED. The pre-commit hook (`[sacred-sha] PASS: 20 files verified`) ran on every Task 1/2/3 commit and PASSED. No files under `liv/packages/core/` were touched by this plan:

```
git diff --stat 28f39757..HEAD -- liv/packages/core/
(empty)
```

## Rollback contract

D-V42-ROLLBACK reversibility (live, no restart, no code revert):

```bash
# On Mini PC, as bruce or root with REDIS_URL exported:
redis-cli -a "$(awk -F= '/^REDIS_URL=/{print $2}' /opt/livos/.env | sed 's|.*://.*:||;s|@.*||')" SET liv:config:liv_v42_migration_active false
# Next window-focus refetch (or 30s staleTime expiry) → UI reverts to pre-Phase-224 visibility.

# To re-enable:
redis-cli ... DEL liv:config:liv_v42_migration_active
# (or SET ... true — equivalent, since any value != 'false' reads as ON)
```

## Deviations from Plan

None — plan executed exactly as written. The plan's `<action>` blocks for all 3 tasks were followed byte-for-byte (procedure signature, error code, hook signature, comment text). Pre-existing typecheck errors in `webapps/`, `widgets/`, `xai-auth/`, `xvfb-display.ts`, and `stories/` (UI workspace) are OUT OF SCOPE per executor scope boundary — none touch the Phase 224 surface, and they were present on `master` before this plan landed (confirmed via `git stash` + typecheck-before-after diff).

## Self-Check: PASSED

All required artifacts exist:

- FOUND: `livos/packages/livinityd/source/modules/server/trpc/config-router.ts`
- FOUND: `livos/packages/ui/src/hooks/use-v42-migration-active.ts`
- FOUND: commit `e688b5fb` (Task 1)
- FOUND: commit `43742e1c` (Task 2)
- FOUND: commit `285885f9` (Task 3)

All acceptance-criteria grep counts confirmed:

- `V42_MIGRATION_REDIS_KEY = 'liv:config:liv_v42_migration_active'` → 1
- `export function createConfigRouter` → 1
- `export const configRouter` → 1
- `publicProcedure` in config-router.ts → 4 (1 import + 3 procedure decls/refs)
- `raw === null ? true : raw !== 'false'` → 1
- `'config.getV42MigrationActive'` in common.ts → 1
- `config: opts.config ?? configRouter` in index.ts → 1
- `createConfigRouter` in livinityd/source/index.ts → 2 (import + factory call)
- `export function useV42MigrationActive` in hook → 1
- `trpcReact.config.getV42MigrationActive` in hook → 1
- `if (q.isLoading || q.isError) return true` in hook → 1

Sacred SHA hook PASSED on all 3 task commits. Zero edits under `liv/packages/core/**`.
