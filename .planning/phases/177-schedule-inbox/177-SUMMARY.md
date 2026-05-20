---
phase: 177-schedule-inbox
plan: "01-04"
subsystem: scheduler, inbox, ui
tags: [tdd, node-cron, redis-lock, filesystem-inbox, tRPC, react-ui]
dependency_graph:
  requires:
    - 164-autonomous-scheduler (node-cron + scheduler.ts substrate)
    - 166-cc-pty (CcPtyManager.createSession substrate)
    - 171-vault-items (ItemStore + vaultRoot context)
    - 175-ui-item-detail (AgentDetail component)
  provides:
    - vault.inbox.listByAgent tRPC procedure
    - vault.inbox.listGlobal tRPC procedure
    - vault.inbox.markRead tRPC mutation
    - vault.inbox.get tRPC query
    - AgentScheduleRegistry (per-agent cron task management)
    - AgentRunner (Redis lock + PTY spawn + inbox write)
    - InboxReader (filesystem inbox walker)
    - ItemTreeRow inbox badge (unread count)
    - GlobalInboxWindow (cross-agent inbox browser)
  affects:
    - livos/packages/livinityd/source/index.ts (InboxReader boot wire-up)
    - livos/packages/livinityd/source/modules/server/trpc/index.ts (inbox router)
    - livos/packages/ui/src/features/item-detail/AgentDetail.tsx (live inbox data)
tech_stack:
  added:
    - node-cron (already in deps — no new install)
    - js-yaml (already in deps — used for frontmatter parsing in InboxReader)
  patterns:
    - TDD RED/GREEN/REFACTOR per wave
    - Redis NX PX lock for agent run deduplication
    - Filesystem-as-index inbox (no DB table needed — D-V38-S)
    - vi.hoisted() tRPC mock pattern for React component tests
key_files:
  created:
    - livos/packages/livinityd/source/modules/vault-items/agent-schedule.ts
    - livos/packages/livinityd/source/modules/vault-items/agent-schedule.test.ts
    - livos/packages/livinityd/source/modules/vault-items/agent-runner.ts
    - livos/packages/livinityd/source/modules/vault-items/agent-runner.test.ts
    - livos/packages/livinityd/source/modules/vault-items/inbox-reader.ts
    - livos/packages/livinityd/source/modules/vault-items/inbox-reader.test.ts
    - livos/packages/livinityd/source/modules/server/trpc/inbox-router.ts
    - livos/packages/livinityd/source/modules/server/trpc/inbox-router.test.ts
    - livos/packages/ui/src/features/inbox/GlobalInboxWindow.tsx
    - livos/packages/ui/src/features/inbox/GlobalInboxWindow.test.tsx
  modified:
    - livos/packages/livinityd/source/modules/autonomous-scheduler/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
    - livos/packages/livinityd/source/index.ts
    - livos/packages/ui/src/features/sidebar-tree/ItemTreeRow.tsx
    - livos/packages/ui/src/features/sidebar-tree/ItemTreeRow.test.tsx
    - livos/packages/ui/src/features/item-detail/AgentDetail.tsx
    - livos/packages/ui/src/features/item-detail/AgentDetail.test.tsx
decisions:
  - "Inbox files stored at <vaultRoot>/items/<agentId>/inbox/<runId>.md (filesystem IS the index — no DB table)"
  - "agentId validated with /^[0-9A-Za-z_-]{20,}$/ before filesystem path construction"
  - "assertUnderItemsDir() throws if resolved path escapes <vaultRoot>/items/ prefix"
  - "Redis lock key liv:agent:running:<agentId> with PX 900_000 NX (ioredis 5 arg order)"
  - "vault.inbox.* added to httpOnlyPaths in common.ts (not WebSocket compatible)"
  - "AgentScheduleRegistry + AgentRunner exported from autonomous-scheduler/index.ts (sacred vault-items/index.ts not touched)"
  - "tRPC procedures return {entries:[]} shape (not bare arrays) for type safety"
metrics:
  duration: "~3 hours (multi-session)"
  completed: "2026-05-20"
  tasks_completed: 9
  files_created: 10
  files_modified: 9
---

# Phase 177 Plans 01-04: Schedule Engine + Inbox System Summary

JWT auth with node-cron per-agent scheduling, Redis run-lock deduplication, filesystem inbox (YAML frontmatter), and full tRPC vault.inbox router wired into React UI.

## Plans Executed

| Plan | Name | Tests | Status |
|------|------|-------|--------|
| 177-01 | AgentScheduleRegistry | 10 | PASS |
| 177-02 | AgentRunner | 12 | PASS |
| 177-03 | InboxReader + vault.inbox router | 16 | PASS |
| 177-04 | Inbox UI — badge, AgentDetail, GlobalInboxWindow | 30 | PASS |

**Total: 68 assertions passing** (target was 40+)

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `b14dac8c` | test | add 10 failing tests for AgentScheduleRegistry (RED) |
| `4ce75323` | feat | implement AgentScheduleRegistry + additive index.ts export (GREEN) |
| `6926abdd` | test | add 12 failing tests for AgentRunner (RED) |
| `dd568ae7` | feat | implement AgentRunner + wire run_agent tool (GREEN) |
| `63d4cf3c` | test | add 8 failing tests for InboxReader + inbox-router (RED) |
| `3ee56d2b` | feat | implement InboxReader + vault.inbox tRPC router (GREEN) |
| `9cab441f` | test | add 10 failing tests for inbox UI badge + AgentDetail + GlobalInboxWindow (RED) |
| `1bd2b7e4` | feat | wire inbox badge + AgentDetail tRPC + GlobalInboxWindow (GREEN) |
| `950347d7` | fix | resolve TypeScript errors + data shape alignment |

## Architecture Decisions

### Inbox Storage (D-V38-S)
Inbox entries are stored as plain Markdown files with YAML frontmatter at:
```
<vaultRoot>/items/<agentId>/inbox/<runId>.md
```
The filesystem IS the index — no separate DB table required. `InboxReader.listGlobal()` walks all agent directories and merges entries sorted newest-first.

### Path Traversal Guard
`assertUnderItemsDir(vaultRoot, resolvedPath)` is called before every read/write operation. It throws if the resolved path does not start with `<vaultRoot>/items/<sep>`, preventing directory traversal attacks (T-177-03-01/02).

### Redis Run-Lock
```typescript
this.redis.set(lockKey, runId, 'PX', 900_000, 'NX')
```
ioredis 5 requires `PX <ms> NX` order (not `NX PX <ms>`). Lock TTL is 15 minutes. Released in `finally` block unconditionally.

### tRPC Data Shape
All `listByAgent` and `listGlobal` procedures return `{entries: InboxEntry[]}` (not bare arrays). This was required for TypeScript type inference to work correctly across the tRPC boundary.

### Sacred File Protection
All 25 sacred SHAs verified (PASS) on every commit via pre-commit hook. The following sacred files were never modified:
- `vault-items/index.ts` — exports routed through `autonomous-scheduler/index.ts` instead
- `autonomous-scheduler/scheduler.ts` — additive exports only in `index.ts`
- `cc-pty/manager.ts` — used as substrate, not modified

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed bootSweepAgentSchedules skipped count for non-agent items**
- **Found during:** Task 177-01 (T-SCHED-01 initial run)
- **Issue:** Non-agent items (projects) hit `continue` without incrementing `skipped` counter, causing T-SCHED-01 to fail with `skipped:1` instead of `skipped:2`
- **Fix:** Added `skipped++` before `continue` in the `item.type !== 'agent'` branch
- **Files modified:** `agent-schedule.ts`
- **Commit:** `4ce75323`

**2. [Rule 1 - Bug] Fixed esbuild parse error from JSDoc comment**
- **Found during:** Task 177-03 (GREEN phase build)
- **Issue:** JSDoc comment contained `items/*/inbox/` — the `*/` sequence confused esbuild parser with `Expected ; but found /`
- **Fix:** Changed comment to `items/<agentId>/inbox/` (no glob wildcard)
- **Files modified:** `inbox-reader.ts`
- **Commit:** `3ee56d2b`

**3. [Rule 1 - Bug] Fixed inbox-router.test.ts IR-08 test pattern**
- **Found during:** Task 177-03 (test authoring)
- **Issue:** Test checked `not.toMatch(/items\//)` but the import path `../../vault-items/inbox-reader.js` contains `vault-items/` which has `items/` in it
- **Fix:** Changed IR-08 to check `not.toMatch(/readdir|readFile|writeFile/)` — more meaningful guard against direct FS access in router
- **Files modified:** `inbox-router.test.ts`
- **Commit:** `63d4cf3c`

**4. [Rule 1 - Bug] Fixed ioredis 5 SET argument order**
- **Found during:** Final TypeScript check
- **Issue:** `redis.set(key, val, 'NX', 'PX', 900_000)` fails TypeScript 2769 — ioredis 5 expects `('PX', ms, 'NX')` order
- **Fix:** Swapped to `redis.set(key, val, 'PX', 900_000, 'NX')`; updated test assertion to match
- **Files modified:** `agent-runner.ts`, `agent-runner.test.ts`
- **Commit:** `950347d7`

**5. [Rule 1 - Bug] Fixed tRPC data shape mismatch ({entries:[]} vs bare array)**
- **Found during:** Final UI test run after TypeScript fix
- **Issue:** tRPC procedures return `{entries:[...]}` but UI components accessed `data ?? []` as if data were a bare array; test mocks also used bare arrays
- **Fix:** Updated `AgentDetail.tsx` and `GlobalInboxWindow.tsx` to use `data?.entries ?? []`; updated test mocks to return `{entries: [...]}`
- **Files modified:** `AgentDetail.tsx`, `AgentDetail.test.tsx`, `GlobalInboxWindow.tsx`, `GlobalInboxWindow.test.tsx`
- **Commit:** `950347d7`

**6. [Rule 2 - Missing] Added InboxEntry type export back to AgentDetail.tsx**
- **Found during:** Final TypeScript check
- **Issue:** Phase 175's `index.ts` re-exports `InboxEntry` from `AgentDetail.tsx`, but the type was removed when tRPC was wired in
- **Fix:** Added `InboxEntry` interface back to `AgentDetail.tsx` (documents the shape, not a prop)
- **Files modified:** `AgentDetail.tsx`, `index.ts` (no change needed)
- **Commit:** `950347d7`

## Known Stubs

None — all inbox data paths are wired to real tRPC procedures.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: path-traversal | inbox-reader.ts | `assertUnderItemsDir()` guards all read/write ops — mitigated |
| threat_flag: id-injection | inbox-router.ts | agentId validated with `ID_RE = /^[0-9A-Za-z_-]{20,}$/` — mitigated |
| threat_flag: xss | ItemTreeRow.tsx | badge count cast with `Math.floor(Number(...))` — mitigated |

## TDD Gate Compliance

| Plan | RED commit | GREEN commit | Status |
|------|-----------|--------------|--------|
| 177-01 | `b14dac8c` | `4ce75323` | PASS |
| 177-02 | `6926abdd` | `dd568ae7` | PASS |
| 177-03 | `63d4cf3c` | `3ee56d2b` | PASS |
| 177-04 | `9cab441f` | `1bd2b7e4` | PASS |

## Self-Check: PASSED

All 6 key created files present on disk. All 9 Phase 177 commits verified in git log.
