# Phase 35: GitHub Actions update.sh Smoke Test - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

A PR can no longer merge an `update.sh` regression — every PR runs the full deploy build pipeline inside CI and verifies livinityd actually boots and serves `/health`; failed PRs are blocked at the GitHub merge gate.

**Requirements covered:** BUILD-04 (PR-time CI smoke test for build pipeline + livinityd boot)

</domain>

<decisions>
## Implementation Decisions

### Scope clarification (vs. ROADMAP literal text)
ROADMAP says "boots a fresh Ubuntu 24.04 Docker container... runs the full `update.sh` against the PR's HEAD SHA". Strict reading would require Docker-in-Docker + simulating production rsync/systemctl flow. **Practical interpretation (locked here):** the workflow runs the BUILD pipeline that update.sh exercises (pnpm install, all package builds, dist verification per Phase 31 BUILD-01) AND boots livinityd against ephemeral PostgreSQL + Redis services + a minimal .env, then asserts `curl /health` returns 200. This catches the same regression class (silent build failure → livinityd boot break) without re-implementing production /opt/livos/ paths in CI.

### Trigger paths (success criterion #1)
Workflow fires on PRs that touch:
- `livos/**` (all livinityd / ui / config source)
- `nexus/**` (all nexus packages)
- `.github/workflows/update-sh-smoke.yml` (workflow self-test)
- `.planning/phases/3*/artifacts/*.sh` (Phase 31/32/33 patch scripts that affect production update.sh)
- `livos/scripts/update.sh.minipc` (the canonical update.sh file)

### Runtime budget (success criterion #4)
- Hard ceiling: 15 min (`timeout-minutes: 15` on the job)
- Target median: ~5-8 min via `actions/cache@v4` for pnpm-store + npm cache + node_modules

### Stack choices
- Runner: `ubuntu-22.04` (24.04 GA on GitHub Actions but 22.04 is more battle-tested; LivOS Mini PC uses 24.04 but the build steps don't depend on kernel-level features that differ)
- Node: 22 (matches Mini PC)
- pnpm: 10.x (matches Mini PC's pnpm v10.32.1)
- PostgreSQL: 16 (matches Mini PC system PG)
- Redis: 7 (matches Mini PC)
- Services declared via GitHub Actions `services:` block (managed Docker containers, no docker-compose needed)

### Health check protocol (success criterion #2)
1. Start livinityd in background: `pnpm --filter livinityd dev > livinityd.log 2>&1 &` and capture PID
2. Poll `curl -fsS http://localhost:8080/health` every 2s for up to 60s
3. On first 200 → SUCCESS; report duration
4. On timeout → FAIL, `cat livinityd.log` for diagnosis
5. Always kill background PID at end (cleanup `kill -TERM $LIVINITYD_PID || true`)

### Validation strategy (success criterion #3)
The workflow's PASS-on-clean-PR demonstrates SC-1 + SC-2. SC-3 (intentional break is BLOCKED) requires actually opening a PR with a deliberate TS error → observing the workflow fails. **This is a one-time validation step** done after the workflow ships; documented in SUMMARY for future reference. Not blocking phase completion.

### Patch artifact
None. Pure CI workflow file + minimal .env template + maybe a helper script for local dry-run testing.

</decisions>

<code_context>
## Existing Code Insights

- `.github/workflows/deploy.yml` exists but is an old SSH-based PM2 deploy — **NOT RELATED to Phase 35**. New workflow is a separate file.
- `livos/packages/livinityd/source/server/index.ts` — express setup, registers `/health` endpoint (verify by reading)
- `livos/packages/livinityd/.env.example` (if exists) — template for required env vars
- `livos/scripts/update.sh.minipc` — current production update.sh, post-Phase-31/32/33 patches
- Build commands per package (mirror update.sh):
  - `pnpm install --frozen-lockfile` (workspace root)
  - `pnpm --filter @livos/config build` (tsc)
  - `pnpm --filter ui build` (vite)
  - `npm run build --workspace=packages/core` (nexus core, tsc)
  - `npm run build --workspace=packages/worker` (nexus worker)
  - `npm run build --workspace=packages/mcp-server` (nexus mcp-server)
  - `npm run build --workspace=packages/memory` (nexus memory)
- Phase 31 verify_build helper (idempotently checks dist/ is non-empty per package)

</code_context>

<specifics>
## Specific Ideas

### Plan 35-01 (single plan, 2 tasks)

**Task 1:** Author `.github/workflows/update-sh-smoke.yml`. Single job, runs on PR. Steps:
1. Checkout PR HEAD (full history not needed — `fetch-depth: 1`)
2. Setup Node 22 + pnpm (use `actions/setup-node@v4` + `pnpm/action-setup@v3`)
3. Cache pnpm store: `actions/cache@v4` keyed on `pnpm-lock.yaml` hash
4. Cache nexus node_modules: separate cache key on nexus `package-lock.json` hash
5. Services: postgres:16 + redis:7 with health checks
6. Install dependencies: `pnpm install --frozen-lockfile` (workspace) + `npm install` (nexus)
7. Build all packages (mirror update.sh order): config → ui → nexus core/worker/mcp-server/memory
8. Verify dist non-empty on each (mirror Phase 31 BUILD-01 verify_build): `test -s dist/index.js` or equivalent
9. Generate minimal .env: DATABASE_URL, REDIS_URL (using service host/port), JWT_SECRET, LIV_API_KEY (random)
10. Run database migration (livinityd schema.sql)
11. Start livinityd in background via tsx
12. Poll /health for up to 60s
13. On success: echo "✓ Smoke test passed in Ns" and exit 0
14. On failure: cat livinityd.log; exit 1
15. Cleanup trap: `kill $LIVINITYD_PID` always

**Task 2:** Document the validation procedure (SC-3) in `.planning/phases/35-github-actions-update-sh-smoke-test/artifacts/test-pr-validation.md`. Steps to validate: open a PR with intentional TS error in `nexus/packages/core/src/index.ts`, observe workflow FAILS, close the PR. NOT executed automatically — opt-in operator action.

</specifics>

<deferred>
## Deferred Ideas

- True Docker-in-Docker simulation of /opt/livos/ paths — overkill, build smoke catches 90%+ of regressions
- Integration test of full update.sh including SSH mock — too complex, not worth the maintenance
- Auto-comment on PR with workflow result — GitHub already does this via the status checks UI
- Slack notification on failed master push — defer to v30+

</deferred>
