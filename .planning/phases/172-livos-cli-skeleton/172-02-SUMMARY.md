---
phase: 172-livos-cli-skeleton
plan: 02
subsystem: cli
tags:
  - cli
  - trpc-client
  - filesystem-fallback
  - http-client
  - auth-resolver
dependency_graph:
  requires:
    - 172-01 (@livos/cli scaffold with vitest devDep)
    - 171-04 (vault.items.* tRPC surface — CONSUMED via HTTP, not imported)
  provides:
    - createQueryClient (typed tRPC HTTP client for vault.items.*)
    - resolveApiKey (LIV_API_KEY env > ~/.livos/api-key file > null)
    - readItemsFromDisk / readTreeFromDisk (filesystem-mode fallback)
    - FilesystemModeMutationError (sentinel for write ops when daemon offline)
  affects:
    - 172-03 (will wire createQueryClient into the 10 yargs command handlers)
    - 172-05 (E2E test will exercise this client against running livinityd)
tech_stack:
  added: []   # zero new deps — uses Node 22 native fetch + node:fs/promises + node:os + node:path
  patterns:
    - "tRPC v11 HTTP wire shape: GET with ?input=<urlencoded-json> for queries; POST with {json:<input>} body for mutations; response unwrap result.data.json"
    - "Native fetch ECONNREFUSED detection via err.cause.code (Node 22 surfaces refused connections this way)"
    - "Filesystem-mode mirrors D-V38-T on-disk layout WITHOUT importing livinityd modules (cross-package boundary respected)"
key_files:
  created:
    - livos/packages/cli/src/auth.ts
    - livos/packages/cli/src/query-client.ts
    - livos/packages/cli/src/filesystem-mode.ts
    - livos/packages/cli/src/query-client.test.ts
    - livos/packages/cli/src/filesystem-mode.test.ts
    - livos/packages/cli/vitest.config.ts
  modified: []
decisions:
  - "Read-ops (list/get) silently fall back to filesystem-mode on ECONNREFUSED; mutation ops fail-fast with FilesystemModeMutationError to prevent skipping ItemStore validation gates"
  - "Auth header is lowercase 'x-livinity-api-key' for Node fetch consistency (HTTP headers are case-insensitive but the daemon middleware accepts either casing)"
  - "Default endpoint http://localhost:3001/trpc; override via LIVINITY_TRPC_ENDPOINT env"
  - "API key resolution: env > ~/.livos/api-key file > null (caller decides). File ENOENT is non-fatal; other fs errors bubble"
  - "Re-export FilesystemModeMutationError from query-client.ts so callers need only one import path"
  - "Filesystem-mode list returns the raw array; daemon returns {items: [...]}. Client unwraps based on lastFallback flag — single QueryClient.list() surface for both paths"
metrics:
  duration_seconds: 420
  completed_date: 2026-05-20
  vitest_assertions: 14
  vitest_files: 2
  files_created: 6
  files_modified: 0
---

# Phase 172 Plan 02: tRPC HTTP Client + Filesystem Fallback Summary

**One-liner:** Shipped @livos/cli's tRPC v11 HTTP wrapper for vault.items.* with auto-fallback to direct disk reads on ECONNREFUSED for read-ops, fail-fast `FilesystemModeMutationError` for write-ops, plus env-or-file API key resolver — 14 vitest assertions PASS, sacred SHA preserved.

## Objective Outcome

The @livos/cli now has the network layer required to talk to a running livinityd:
- `createQueryClient(opts)` returns a typed `QueryClient` with all 7 vault.items.* procedures + `lastUsedFilesystemMode()` introspection.
- HTTP wire shape matches tRPC v11 verbatim (GET `?input=` for queries, POST `{json:...}` body for mutations, response unwrap `result.data.json`).
- Filesystem-mode fallback engages on ECONNREFUSED/ENOTFOUND/ETIMEDOUT/EHOSTUNREACH for read-ops; writes throw `FilesystemModeMutationError` so the operator cannot inadvertently corrupt the vault by skipping ItemStore invariants.
- `resolveApiKey()` honors the documented priority (LIV_API_KEY env > ~/.livos/api-key file > null).

## Files Created

- `livos/packages/cli/src/auth.ts` (49 lines) — `resolveApiKey(opts?)` async resolver
- `livos/packages/cli/src/filesystem-mode.ts` (86 lines) — `readItemsFromDisk`, `readTreeFromDisk`, `FilesystemModeMutationError`
- `livos/packages/cli/src/query-client.ts` (182 lines) — `createQueryClient`, `QueryClient` interface, ECONNREFUSED detection, dual-mode dispatch
- `livos/packages/cli/src/filesystem-mode.test.ts` (64 lines, 6 vitest assertions)
- `livos/packages/cli/src/query-client.test.ts` (127 lines, 8 vitest assertions)
- `livos/packages/cli/vitest.config.ts` (9 lines)

## Quality Gates

| Gate | Status |
| ---- | ------ |
| `pnpm --filter @livos/cli build` clean | PASS |
| `pnpm --filter @livos/cli test` — 14/14 assertions | PASS |
| `pnpm --filter @livos/cli exec tsc --noEmit` clean | PASS |
| Sacred SHA `f3538e1d` (sdk-agent-runner.ts) unchanged | PASS |
| D-09 SHA `2083f0a3` (luse-system-prompt.ts) unchanged | PASS |
| No edits to `livos/packages/livinityd/**` | PASS |
| No edits to `livos/packages/ui/**` | PASS |
| No edits to `liv/**` | PASS |
| Lockfile diff = empty (zero new deps) | PASS |
| Acceptance grep `vault\.items\.` in query-client.ts | 6 (≥1) |
| Acceptance grep `ECONNREFUSED` in query-client.ts | 3 (≥1) |
| Acceptance grep `x-livinity-api-key` in query-client.ts | 2 (≥1) |
| Acceptance grep `FilesystemModeMutationError` across CLI src | 15 (≥2) |

## Must-Have Truths Verification

| Truth | Verification |
| ----- | ------------ |
| "query-client wraps fetch to http://localhost:<port>/trpc/vault.items.<proc> with the LIV_API_KEY header injected" | query-client.test.ts assertions 1-3 (header inject + URL path + create POST body) |
| "ECONNREFUSED from livinityd triggers filesystem-mode fallback for read-only ops (list, get)" | query-client.test.ts assertion 4 (list ECONNREFUSED → fs-mode `[]` + `lastUsedFilesystemMode()===true`) |
| "Mutation ops (create, update, move, archive, delete) refuse to run in filesystem-mode and exit non-zero with a clear error" | query-client.test.ts assertion 5 (`create` on ECONNREFUSED throws `FilesystemModeMutationError`) |
| "Auth resolution priority: LIV_API_KEY env > ~/.livos/api-key file > unauthenticated (exit 1)" | auth.ts inline test from Task 1 verify block (env=test, home=/tmp → returns 'test'); priority logic in auth.ts lines 38-46 |
| "vitest run for cli package exits 0 with ≥10 passing assertions" | 14 passing (6 fs-mode + 8 query-client) |

## tRPC Wire Shape Captured

The client emits and consumes the following shapes verified against `livos/packages/livinityd/source/modules/server/trpc/vault-items-router.ts` and `common.ts:543-549` (httpOnlyPaths registration):

**Mutation request (e.g., create):**
```
POST http://localhost:3001/trpc/vault.items.create
Content-Type: application/json
X-Livinity-Api-Key: <key>

{"json": {"type":"project","name":"foo","parentId":null}}
```

**Query request (e.g., list):**
```
GET http://localhost:3001/trpc/vault.items.list?input=%7B%22json%22%3A%7B%7D%7D
X-Livinity-Api-Key: <key>
```

**Response envelope (both):**
```json
{"result":{"data":{"json":{"item":{...}}}}}
```

## Deviations from Plan

### §1 — Commit boundary leak from parallel-agent race

**Found during:** Task 1 commit + Task 2 staging
**Issue:** The Plan 172-04 parallel executor was racing with 172-02 in the same working tree. Although the two plans are file-disjoint by design (172-04 touches `prompts/skills/`, `prompts/workflows/`, `scripts/postinstall.{js,test.js}`, and the additive `package.json scripts.postinstall` key — none of which overlap 172-02's `src/` work), they share the same `livos/packages/cli/` directory. As a result:

1. My Task 1 commit `1ecac522` (`feat(172-02): auth resolver + vitest config`) inadvertently captured 172-04's working-tree changes (`scripts/postinstall.js`, `scripts/postinstall.test.js`, and `package.json` postinstall key) because they were present in the index when the commit fired. The 172-04 commit message earlier (`e85c9b1e`, only skills+workflows) had NOT included those files yet.
2. The 172-04 summary commit `68b38711` (`docs(172-04): complete bundled skills + idempotent postinstall plan`) then captured my Task 2 working-tree files (`filesystem-mode.ts`, `filesystem-mode.test.ts`, `query-client.ts`, `query-client.test.ts`) because they were present in the index when that commit fired. The 172-04 SUMMARY explicitly notes this with "Deviation §1: Task 2 files landed in commit 1ecac522 due to parallel-agent race with 172-02" (the agent observed the inverse direction of the race).

**Resolution:** No code damage; all 172-02 file contents are byte-identical to the plan spec and 14/14 tests PASS. The work shipped — just with a smudged commit boundary. Future archaeology can use this SUMMARY to map plan-to-commit.

**Fix:** None needed. Code-complete. The commit log accurately captures all file contents; only the per-plan attribution is mixed.

**Files affected by leak:**
- Into `1ecac522` (claimed by 172-02): `livos/packages/cli/scripts/postinstall.js`, `scripts/postinstall.test.js`, `package.json` (postinstall key) — belong to 172-04
- Into `68b38711` (claimed by 172-04): `livos/packages/cli/src/filesystem-mode.ts`, `filesystem-mode.test.ts`, `query-client.ts`, `query-client.test.ts` — belong to 172-02

**Sacred guards:** Sacred SHA + D-09 verified UNCHANGED at every step. Husky `pre-commit` (`scripts/check-sacred.sh`) gated all commits.

## Sacred Guards

| Guard | SHA | Status |
| ----- | --- | ------ |
| `liv/packages/core/src/sdk-agent-runner.ts` | f3538e1d811992b782a9bb057d1b7f0a0189f95f | PRESERVED |
| `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` (D-09) | 2083f0a3dfc798b4841613b9576b94929f2faf2f | PRESERVED |
| Phase 162-171 source unchanged | — | PASS (git diff --stat livinityd/ ui/ liv/ = empty) |

## Commits

| Hash | Files In Scope For This Plan | Notes |
| ---- | --- | --- |
| 1ecac522 | `src/auth.ts`, `vitest.config.ts` (correct for 172-02) | Also captured 172-04 working-tree files (see Deviation §1) |
| 68b38711 | `src/filesystem-mode.ts`, `src/filesystem-mode.test.ts`, `src/query-client.ts`, `src/query-client.test.ts` (172-02 work that landed in 172-04 commit due to race) | All 172-02 byte-identical to plan |

## Self-Check: PASSED

- `livos/packages/cli/src/auth.ts` — FOUND
- `livos/packages/cli/src/query-client.ts` — FOUND
- `livos/packages/cli/src/filesystem-mode.ts` — FOUND
- `livos/packages/cli/src/query-client.test.ts` — FOUND
- `livos/packages/cli/src/filesystem-mode.test.ts` — FOUND
- `livos/packages/cli/vitest.config.ts` — FOUND
- Commit 1ecac522 — FOUND in git log
- Commit 68b38711 — FOUND in git log
- 14 vitest assertions PASS verified by re-running `pnpm test` post-write
