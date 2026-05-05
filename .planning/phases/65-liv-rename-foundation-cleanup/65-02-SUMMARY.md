---
phase: 65-liv-rename-foundation-cleanup
plan: 02
subsystem: foundation
tags: [rename, git-mv, package-json, atomic, sacred-file]
requires:
  - 65-01 (preflight snapshot — provided baseline SHAs and rollback reference)
provides:
  - liv/ directory tree (formerly nexus/)
  - @liv/core, @liv/worker, @liv/mcp-server, @liv/memory package names
  - livos/pnpm-lock.yaml with @liv/* entries
  - stable directory layout for 65-03 source-code import sweep
affects:
  - 65-03 (depends on stable @liv/* package graph for mechanical text replacement)
  - 65-04 (depends on liv/ filesystem layout for update.sh refactor)
  - 65-05 (Mini PC migration — needs renamed dirs as the source-side ground truth)
  - 65-06 (final verification reads liv/ tree)

tech-stack:
  added: []
  patterns:
    - git-mv preserves rename detection + history (--follow traces sacred file)
    - file:protocol workspace deps (livinityd uses file:../../../liv/packages/core not workspace:*)
    - sacred-SHA gate at 4 checkpoints (pre-mv, post-mv, post-edit, in-index, post-commit)

key-files:
  created: []
  modified:
    - liv/package.json (renamed from nexus/package.json; name: nexus -> liv)
    - liv/packages/core/package.json (name: @nexus/core -> @liv/core)
    - liv/packages/worker/package.json (name: @nexus/worker -> @liv/worker)
    - liv/packages/mcp-server/package.json (name: @nexus/mcp-server -> @liv/mcp-server)
    - liv/packages/memory/package.json (name: @nexus/memory -> @liv/memory)
    - livos/packages/livinityd/package.json (@nexus/core -> @liv/core; file path updated)
    - livos/pnpm-lock.yaml (regenerated, @nexus/* purged, @liv/* added)
  renamed:
    - nexus/ -> liv/ (177 files, full subtree, git rename detection 100%)

decisions:
  - "Used git mv nexus liv (NOT cp+rm) — git rename detection preserved, sacred file SHA blob unchanged across the move."
  - "Atomic single-commit transaction (commit 31bde121) — rollback is `git revert 31bde121` + `cd livos && pnpm install`."
  - "pnpm install run from livos/ (where pnpm-workspace.yaml lives) — repo root has no monorepo manifest. nexus/ used internal npm workspaces, NOT a separate pnpm workspace at root."
  - "Discovered livinityd uses file: protocol (`file:../../../nexus/packages/core`) NOT `workspace:*` — both KEY (@nexus/core -> @liv/core) AND VALUE (path) had to be updated."
  - "@nexus/cli (named `livinity` not `@nexus/cli`) and @nexus/hooks (no package.json — pure source dir) had no name to change; both moved with the directory rename."
  - "ui package postinstall (mkdir -p && cp -r) is a pre-existing Windows shell incompatibility — accepted as out-of-scope (not caused by rename, per scope-boundary rule)."

metrics:
  duration: ~5 minutes
  completed: 2026-05-05
  tasks: 2
  files_modified: 7 (5 packages.json in liv + livinityd package.json + pnpm-lock.yaml)
  files_renamed: 177
  commits: 1 (31bde121)
---

# Phase 65 Plan 02: Liv Rename + Foundation Cleanup — Big Atomic Rename

One-liner: Atomic `nexus/` -> `liv/` filesystem rename via `git mv` plus 6 package.json name updates, executed as a single commit with sacred-SHA preservation gates at every checkpoint.

## Execution Outcome

| Metric | Value |
|---|---|
| Starting commit (HEAD before plan) | `fc1b4e35` |
| Plan commit (atomic rename + edits) | `31bde121` |
| Sacred SHA (start) | `4f868d318abff71f8c8bfbcf443b2393a553018b` |
| Sacred SHA (post-mv) | `4f868d318abff71f8c8bfbcf443b2393a553018b` (unchanged) |
| Sacred SHA (post-edit) | `4f868d318abff71f8c8bfbcf443b2393a553018b` (unchanged) |
| Sacred SHA (in-index, staged) | `4f868d318abff71f8c8bfbcf443b2393a553018b` (unchanged) |
| Sacred SHA (post-commit) | `4f868d318abff71f8c8bfbcf443b2393a553018b` (unchanged) |
| Sacred SHA preservation gates passed | 5 of 5 |
| Files renamed (R-status) | 177 (matches `git ls-files nexus/` count from pre-mv) |
| Files modified (M-status) in this plan | 2 (livinityd package.json + pnpm-lock.yaml) |
| Files modified via rename-and-edit (RM) | 5 (liv root + 4 sub-package package.json files) |
| `pnpm install` filtered to livinityd | EC=0 |
| `pnpm install` full from livos/ root | EC=1 (pre-existing ui-postinstall Windows shell issue, out-of-scope) |

## Sacred File Verification (D-06 hard rule)

Sacred file: `liv/packages/core/src/sdk-agent-runner.ts` (post-rename path).

The expected SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` was confirmed at all 5 checkpoints during execution:

1. Pre-mv (Task 1 step 1): `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` -> match.
2. Post-mv (Task 1 step 4): `git hash-object liv/packages/core/src/sdk-agent-runner.ts` -> match.
3. Post-edit (Task 2 step 11): same hash-object on liv path after package.json edits -> match.
4. In-index (post-`git add`): `git ls-files -s` returned blob SHA -> match.
5. Post-commit (after `git commit`): `git hash-object` on the now-committed file -> match.

`git log --follow liv/packages/core/src/sdk-agent-runner.ts` correctly traces history through the rename back to its origin in `nexus/packages/core/src/sdk-agent-runner.ts` — confirming rename detection (NOT cp+rm) was used.

## Package.json Edits (D-07 — exactly the 6 files in scope)

| # | File | Change |
|---|---|---|
| 1 | liv/package.json | `"name": "nexus"` -> `"name": "liv"` |
| 2 | liv/packages/core/package.json | `"name": "@nexus/core"` -> `"name": "@liv/core"` |
| 3 | liv/packages/worker/package.json | `"name": "@nexus/worker"` -> `"name": "@liv/worker"` |
| 4 | liv/packages/mcp-server/package.json | `"name": "@nexus/mcp-server"` -> `"name": "@liv/mcp-server"` |
| 5 | liv/packages/memory/package.json | `"name": "@nexus/memory"` -> `"name": "@liv/memory"` |
| 6 | livos/packages/livinityd/package.json | dep key `"@nexus/core"` -> `"@liv/core"` AND value `"file:../../../nexus/packages/core"` -> `"file:../../../liv/packages/core"` |

**Inter-package `@nexus/*` workspace deps inside liv/packages/*:** NONE. Each of core/worker/mcp-server/memory has only third-party deps (anthropic, ioredis, express, etc.) — no `@nexus/core` -> `@nexus/memory` style internal references. (This was discovered during the read-first pass; saved one Edit per package.)

**Out-of-scope discoveries (left untouched per scope-guard):**
- liv/packages/cli/package.json: `"name": "livinity"` (not `@nexus/cli`) — no rename needed; moved via git mv.
- liv/packages/hooks/: no package.json (pure-source directory) — moved via git mv.
- nexus.code-workspace and other IDE configs: not present at repo root — nothing to edit.

## pnpm install Outcome

Ran `pnpm install --no-frozen-lockfile` from `livos/` (where the workspace manifest lives — repo root has no pnpm-workspace.yaml; nexus/ used internal npm workspaces).

- Resolved 2878 packages, reused 2707, added 3 (the new `@liv/*` workspace symlinks).
- `livos/pnpm-lock.yaml`: 3 occurrences of `@liv/`, 0 occurrences of `@nexus/` (verified via grep).
- Workspace symlink: `livos/packages/livinityd/node_modules/@liv/core` -> `.pnpm/@liv+core@file+...+liv+packa_*/node_modules/@liv/core` (resolves correctly).
- `livos/packages/livinityd/node_modules/@nexus/`: does not exist (purged).
- `pnpm install --filter livinityd`: EC=0 (proves @liv/core resolves cleanly).
- Full `pnpm install` from livos/ root: EC=1 due to `packages/ui` postinstall script (`mkdir -p public/generated-tabler-icons && cp -r ./node_modules/@tabler/icons/icons/. ./public/generated-tabler-icons`). This is a Windows shell incompatibility (`mkdir -p` is bash-only; cmd.exe rejects it). The directory already exists from prior runs (icons populated), so this is non-blocking. **Pre-existing — unrelated to the rename.** Per plan scope-boundary rule: pre-existing issues NOT directly caused by current task changes are out of scope; documented for awareness, not fixed here.

## Build-Clean Verification (relaxed gate per plan must_haves #11)

The plan explicitly relaxed the build gate: only `pnpm install` workspace resolution must succeed; TS build is **expected to fail** until 65-03 sweeps `from '@nexus/...'` -> `from '@liv/...'` in source files.

Build was NOT run in this plan. The build-fail story is intentional and is 65-03's responsibility. Workspace resolution success (proven by `--filter livinityd` EC=0 + lockfile @liv/* entries) satisfies the gate this plan owns.

## Deviations from Plan

### Auto-fixed Issues
None.

### Discoveries that Modified Plan Approach (not deviations — plan-aware)

1. **`pnpm install` runs from `livos/`, not repo root.** Plan said "Run `pnpm install` from repo root" — but the only `pnpm-workspace.yaml` lives at `livos/pnpm-workspace.yaml`. `nexus/` used npm workspaces (`workspaces: ["packages/*"]` in its own package.json). Repo root has no monorepo manifest. Adapted to run install from `livos/` — this matches what production update.sh does on the Mini PC.

2. **livinityd uses `file:` protocol not `workspace:*`.** The plan documented `workspace:*` as the expected protocol — actual is `"@nexus/core": "file:../../../nexus/packages/core"`. Update required BOTH key (@nexus/core -> @liv/core) AND value (the path: nexus -> liv). This is correctly captured in the commit.

3. **No `@nexus/*` inter-package deps inside nexus/packages/*.** Plan worried `worker/package.json` might depend on `@nexus/core` — none of the 4 sub-packages have any `@nexus/*` keys in their dependencies. Saved 4 Edit operations.

4. **`packages/ui` postinstall script fails on Windows (pre-existing).** This is `mkdir -p && cp -r` syntax incompatible with cmd.exe. Not caused by rename. Documented; not fixed (out of scope per scope-boundary rule).

### Rule 4 (architectural) Triggers
None.

## Authentication Gates
None encountered.

## Rollback (if needed)

```bash
git revert 31bde121
cd livos && pnpm install --no-frozen-lockfile
```

This restores `nexus/` directory and `@nexus/*` lockfile entries. Full pre-plan state at `fc1b4e35`.

If revert fails for any reason: `git reset --hard fc1b4e35 && cd livos && pnpm install --no-frozen-lockfile`.

## Cross-Plan Contracts

- **65-03 inputs:** stable `liv/` directory tree, all 4 `@liv/*` package names, lockfile with `@liv/*` entries. ✓ delivered.
- **65-04 inputs:** `liv/packages/core/src/sdk-agent-runner.ts` exists with sacred SHA `4f868d31...` for build-pipeline integrity verification. ✓ delivered.
- **65-05 inputs:** local source has `liv/` filesystem; lockfile is `@liv/*`. Mini PC `/opt/nexus/` -> `/opt/liv/` migration is unblocked. ✓ delivered.
- **65-06 inputs:** baseline `liv/` tree exists for end-to-end smoke verification. ✓ delivered.

## Build Status Note

TS build is intentionally expected to fail between 65-02 and 65-03. The failure mode IS module resolution (e.g., `Cannot find module '@nexus/core'` when source still has `from '@nexus/core'` imports). 65-03 is a mechanical text replacement to update those imports. After 65-03 ships, build will be green again.

## Self-Check: PASSED

- [x] `nexus/` directory does NOT exist (verified post-mv via `[ -d nexus ]` check + `ls`).
- [x] `liv/` directory exists with full subtree (verified `[ -f liv/packages/core/src/sdk-agent-runner.ts ]`).
- [x] Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` preserved at all 5 checkpoints.
- [x] All 6 package.json files edited correctly (verified via JSON parse + key inspection).
- [x] Zero `@nexus/` strings in tracked package.json files (verified via `git ls-files | xargs grep -l`).
- [x] `pnpm-lock.yaml` regenerated with `@liv/*` entries (3 occurrences) and zero `@nexus/*`.
- [x] `pnpm install --filter livinityd` exits 0.
- [x] Single atomic commit `31bde121` exists in git log (verified via `git log -1`).
- [x] `git log --follow liv/packages/core/src/sdk-agent-runner.ts` traces history through rename (verified — predecessor commit `9f1562be` shown).

All claims in this SUMMARY are verified against the working tree and git index.
