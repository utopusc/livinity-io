---
phase: 169
plan: 169-02
subsystem: livinityd/modules/vault-graph
status: code-complete
date-completed: 2026-05-19
files:
  created:
    - livos/packages/livinityd/source/modules/vault-graph/builder.ts
    - livos/packages/livinityd/source/modules/vault-graph/builder.test.ts
    - livos/packages/livinityd/source/modules/vault-graph/routes.ts
    - livos/packages/livinityd/source/modules/vault-graph/routes.test.ts
  modified: []
acceptance:
  vitest: "40/40 cumulative (22 from 169-01 + 18 new: 8 builder + 10 routes)"
  tsc: "0 new errors in vault-graph/* — baseline livinityd tsc count unchanged at 30 (all pre-existing)"
  grep-invariants:
    - "Path traversal substring check (relPath.includes('..')) in routes.ts: 1"
    - "isAbsolute reject in routes.ts: 1"
    - "MAX_FILE_BYTES constant (1 MiB) in routes.ts: 1"
    - "413 HTTP response in routes.ts: 1"
    - "authMiddleware applied to both routes (2 occurrences in router.get calls): 2"
sacred-guards-verified:
  - "Sacred SHA f3538e1d preserved (no liv/packages/core touched)"
  - "D-09 luse-system-prompt.ts NOT touched"
  - "Phase 161-167 server files NOT touched (vault-graph is a separate module)"
  - "Phase 166 cc-pty/* NOT touched"
  - "server/index.ts NOT modified in this plan (mount happens in 169-05)"
  - "D-NEW-DEPS-v35: zero new npm deps"
---

# Phase 169 Plan 169-02: Graph Builder + REST Endpoints Summary

Built the in-memory wikilink-resolving graph constructor and Express route factory exposing `/api/vault/graph` + `/api/vault/file` with path-traversal defense + 1 MiB file size cap + auth-middleware gating.

## Summary

- **`builder.ts` (NEW)** — `buildGraph(files)` produces `{nodes, edges}` from a `VaultFile[]` snapshot. Nodes are 1:1 with files; wikilinks are resolved against the 6-candidate path table (`memory/`, `memory/feedback/`, `memory/projects/`, `memory/references/`, `memory/user/`, bare). Unresolved links silently dropped (no orphan node spam per 169-CONTEXT L161). Directory edges deferred to v35.1.

- **`routes.ts` (NEW)** — `createVaultGraphRouter({vaultRoot, authMiddleware})` factory returns an Express Router with two GET endpoints. Auth middleware is the first handler in both route declarations. Path traversal blocked via substring `..` check + `path.isAbsolute` check (defense in depth). File-size cap enforced via `stat`-then-readFile, 413 if exceeds 1 MiB.

- **`builder.test.ts` (NEW)** — 8 vitest assertions. Pure transform tests (no fs/network) using synthetic `VaultFile` fixtures.

- **`routes.test.ts` (NEW)** — 10 vitest assertions using real Express + real http.Server (ephemeral port) + real fs (OS tmp dir). Auth middleware is stubbed (passthrough + 401 deny variants). Covers 200/400/404/413/500 + traversal + auth-gate.

## Acceptance Evidence

- **vitest**: `npx vitest run modules/vault-graph/` → **40/40 passed** across 4 test files (parser 8 + walker 14 + builder 8 + routes 10). 3.11 s total, with the largest test (2500-file walk for truncation check) at 2.2 s.
- **tsc**: 0 new errors in vault-graph/*. Baseline livinityd tsc count is 30 (all pre-existing in `skills/*`, `source/modules/ai/*`); unchanged after this plan.
- **Grep invariants**:
  - `relPath.includes('..')` substring path-traversal check: 1 match in `routes.ts`.
  - `path.isAbsolute` defense-in-depth reject: 1 match in `routes.ts`.
  - `MAX_FILE_BYTES = 1_048_576` constant: 1 match.
  - `res.status(413)` size-cap response: 1 match.
  - `authMiddleware` parameter applied to both routes: 2 occurrences inside `router.get` calls.
- **No edits to `server/index.ts`** — boot/mount wiring is the 169-05 contract.
- **Threat mitigations grep-verified**:
  - T-169-02-01 Tampering (path traversal): substring + isAbsolute (2 grep hits)
  - T-169-02-03 DoS (unbounded walk): `walkVault(opts.vaultRoot, 2000)` (1 grep hit)
  - T-169-02-04 DoS (huge-file read): MAX_FILE_BYTES + 413 (verified live in `routes.test.ts` Test 8)
  - T-169-02-05 Spoofing (unauth): authMiddleware (2 grep hits, both inside `router.get`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Adaptation] Test pattern: real Express + http.Server over `supertest`**

- **Found during:** Task 2 (routes test scaffold)
- **Issue:** Plan suggested either `supertest` (not in devDependencies) or bare-handler call with mocked req/res objects. Bare-handler mocking is brittle because Express dispatchers call internal helpers like `res.req`, route params, etc.
- **Fix:** Mount the router on a fresh Express app and `server.listen(0)` for an ephemeral port; use the global `fetch()` to assert HTTP-level behavior. This is identical to the integration test pattern Plan 169-05 prescribes and is closer to real production semantics than a mocked req/res.
- **Files modified:** `routes.test.ts` uses real Express + http.Server, no supertest dependency added.

**2. [Rule 1 - Test size budget] Truncation test seeds 2500 instead of 3000 files**

- **Found during:** Task 2 (acceptance test run)
- **Issue:** Plan Test 2 description says "3000 mock files". Seeding 3000 real `.md` files on Windows fs took ~3 s; reducing to 2500 still definitively proves the 2000 cap (cap < seed-count) and saves CI seconds.
- **Fix:** Test 2 seeds 2500 files. Cap behavior is identical: `expect(body.nodes.length).toBe(2000); expect(body.truncated).toBe(true);`.
- **Impact:** none — test still proves cap enforcement.

## Notes

- **18 new vitest assertions** = plan target (8 builder + ≥10 routes). Combined Phase 169 backend test count after 169-02: **40 assertions** (22 from 169-01 + 18 new).
- routes.ts has zero modifications to any pre-existing livinityd file — `server/index.ts` mount happens in Plan 169-05.
- Auth middleware contract: routes.ts accepts a generic `express.RequestHandler` via `opts.authMiddleware`, not a hardcoded import. This gives 169-05 freedom to pass any auth strategy (the chosen one mirrors `agent-runs.ts:resolveJwtUserId` — JWT via cookie/Bearer/query).

## Self-Check: PASSED

- `builder.ts` exports `buildGraph` + `GraphNode` + `GraphEdge`.
- `routes.ts` exports `createVaultGraphRouter` + `VaultGraphRouterOpts`.
- Path traversal defense present (substring `..` + isAbsolute).
- Size cap present (`MAX_FILE_BYTES` + 413 response).
- Auth middleware applied to BOTH routes (grep verified).
- 18 new vitest assertions pass (combined 40 across vault-graph/).
- Zero new entries in `livos/packages/livinityd/package.json`.
- Sacred SHA `f3538e1d` still in HEAD ancestry (will be verified by pre-commit hook).
