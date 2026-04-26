# Phase 32 Deferred Items

Items discovered during plan execution that are out-of-scope for the current plan and have been deferred per the GSD scope-boundary rule (only auto-fix issues directly caused by the current task's changes).

## From Plan 32-01

### 1. Pre-existing test failure: `update.unit.test.ts > getLatestRelease (UPD-01) > C: non-2xx GitHub response — throws Error matching /403/`

**Status:** Pre-existing — broken since Phase 30 hot-patch round 9 (commit fb0f25a2) introduced the in-memory commits cache.

**Symptom:**
```
AssertionError: promise resolved "{ available: true, …(6) }" instead of rejecting
```

**Root cause:** `getLatestRelease()` in `update.ts` was extended (rounds 9 + 10) to fall back to cached data when the GitHub API returns a non-2xx status. The original test C expected a throw on 403, but the new graceful-degradation logic returns the cached response from a prior test (test A1) instead. The cache module-state leaks across test cases because `vi.restoreAllMocks()` in `afterEach` doesn't reset module-level `let commitsCache`.

**Why deferred:** Plan 32-01's scope is REL-01 precheck — does NOT touch `getLatestRelease` or its tests. Fixing this requires either (a) adding a cache-reset hook to `update.ts` (modifies a file not in scope), (b) rewriting test C to verify the new "stale-cache fallback" behavior contract (out of scope — UPD-01 is Phase 30 territory), or (c) splitting the test file so each suite gets a fresh module state via `vi.resetModules()`.

**Suggested resolution:** Phase 35 or a Phase 30 follow-up should expose `_clearGitHubCaches()` from `update.ts` and call it in `beforeEach`, then update test C's assertion to match round-10 contract (no throw — returns `{available: false, sha: ''}` on cold-start GitHub failure).

**Verified scope of impact:** 0 other tests in livinityd's unit suite are affected by this pre-existing failure (all other tests pass). Plan 32-01's new test G passes cleanly.

### 2. Pre-existing UI postinstall failure on Windows

**Symptom:** `pnpm install` in `livos/` fails the `packages/ui postinstall` step:
```
packages/ui postinstall: > mkdir -p public/generated-tabler-icons && cp -r ./node_modules/@tabler/icons/icons/. ./public/generated-tabler-icons
packages/ui postinstall: The syntax of the command is incorrect.
```

**Root cause:** The UI postinstall script is a single shell command joined by `&&`. On Windows, npm/pnpm spawns this through cmd.exe by default, which doesn't understand `mkdir -p` or `cp -r` (those are POSIX/bash-only). The Mini PC and Server4 (Linux hosts) work fine; only Windows worktrees hit this.

**Why deferred:** Out of Plan 32-01 scope (`packages/ui` is not in `files_modified`). Workaround for Phase 32 work: livinityd's node_modules + .pnpm hoisting completed successfully before the UI postinstall failed, so the vitest suite runs without needing UI deps.

**Suggested resolution:** Either (a) rewrite the UI postinstall script as a Node.js one-liner using `fs.cpSync` for cross-platform compat, or (b) add a `prepare`/`postinstall` guard with `if [ "$OS" = "Windows_NT" ]; then exit 0; fi`.

### 3. pnpm-store nexus core dist propagation gap

**Symptom:** After `npm run build` in `nexus/packages/core`, the built `dist/` exists in the source location but NOT in pnpm's hoisted copy at `livos/node_modules/.pnpm/@nexus+core@.../node_modules/@nexus/core/dist/`. livinityd's symlink resolves to the pnpm-store copy, so the dist is invisible until manually copied.

**Why deferred:** Same root cause as the documented MEMORY.md "pnpm-store quirk" for `update.sh` on production. Not specific to Plan 32-01. The Phase 31-02 rollback artifact (memory build added to `update.sh`) exists for production; Windows worktree dev experience is a separate ergonomic concern.

**Suggested resolution:** Either (a) add a postbuild hook in `nexus/packages/core/package.json` that mirrors `dist/` into all matching pnpm-store copies, or (b) document the manual `cp -r nexus/packages/core/dist livos/node_modules/.pnpm/@nexus+core*/node_modules/@nexus/core/` step in the dev README.
