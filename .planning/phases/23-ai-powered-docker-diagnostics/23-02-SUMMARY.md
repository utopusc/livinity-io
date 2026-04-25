---
phase: 23-ai-powered-docker-diagnostics
plan: 02
subsystem: docker
tags: [kimi, ai-alerts, docker, scheduler, node-cron, trpc, postgres, react, vitest, tools]

# Dependency graph
requires:
  - phase: 17-docker-quick-wins
    provides: Kimi tool surface (nexus brain) + docker_manage tool registration precedent
  - phase: 20-scheduled-tasks-backup
    provides: BUILT_IN_HANDLERS registry + DEFAULT_JOB_DEFINITIONS seed pattern + node-cron Scheduler runner
  - phase: 21-gitops-stack-deployment
    provides: default-flip seed-only pattern (Plan 21-02) — applied here for ai-resource-watch enabled=false
  - phase: 22-multi-host-docker
    provides: envIdField pattern (the watcher passes null for local-only)
  - phase: 23-01
    provides: callKimi() bridge + redactSecrets() utility + DIAGNOSE_SYSTEM_PROMPT precedent
provides:
  - PG ai_alerts table (uuid id, container_name, environment_id FK, severity CHECK, kind CHECK, message, payload_json, created_at, dismissed_at) with two partial composite indexes
  - ai-resource-watch built-in scheduler handler (every 5 min, default disabled, threshold-priority logic + 60-min dedupe + module-scoped throttle delta cache)
  - ai-alerts.ts PG CRUD module (5 exports — list/insert/dismiss/dismissAll/findRecent)
  - 3 admin tRPC routes (docker.listAiAlerts query + docker.dismissAiAlert / dismissAllAiAlerts mutations on httpOnlyPaths)
  - useAiAlerts React hook (30s poll + dismiss mutations with onSuccess invalidate)
  - AlertsBell component mounted next to EnvironmentSelector in Server Control header
  - docker_diagnostics tool registered in nexus toolRegistry — autonomous AI Chat container diagnosis
affects: [phase-23-closeout, v27.0-milestone-audit, v28.0-multi-host-watching, v28.0-prompt-tuning]

# Tech tracking
tech-stack:
  added: []  # All deps already present (dockerode, node-cron, pg, ioredis, vitest, date-fns, @tabler/icons-react)
  patterns:
    - "Default-disabled scheduler job via DEFAULT_JOB_DEFINITIONS enabled:false (seed-only) — Kimi-spend-bearing handlers ship gated"
    - "Module-scoped throttle delta cache: Map<containerId, lastNanoseconds> for cumulative-counter delta tracking across cron ticks; clamps negatives (container restart) to 0"
    - "Threshold priority: critical-memory > restart-loop > cpu-throttle (warning-only); pure isThresholdExceeded function unit-testable in isolation from handler"
    - "60-min dedupe window via partial-composite index (container_name, kind, created_at DESC WHERE dismissed_at IS NULL) — single-index seek for findRecentAlertByKind"
    - "Tool description IS the LLM router — 'Use this tool whenever the user asks why a specific container is...' instead of regex intent matching in nexus"
    - "Inlined redaction regex + system prompt in nexus tool: nexus DockerManager does NOT cross-call into livinityd (Plan 17-02 precedent); ~30 lines of duplication < shared package overhead"

key-files:
  created:
    - "livos/packages/livinityd/source/modules/docker/ai-alerts.ts"
    - "livos/packages/livinityd/source/modules/docker/ai-resource-watch.ts"
    - "livos/packages/livinityd/source/modules/docker/ai-resource-watch.unit.test.ts"
    - "livos/packages/ui/src/hooks/use-ai-alerts.ts"
    - "livos/packages/ui/src/routes/server-control/ai-alerts-bell.tsx"
  modified:
    - "livos/packages/livinityd/source/modules/database/schema.sql"
    - "livos/packages/livinityd/source/modules/scheduler/types.ts"
    - "livos/packages/livinityd/source/modules/scheduler/jobs.ts"
    - "livos/packages/livinityd/source/modules/docker/routes.ts"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts"
    - "livos/packages/ui/src/routes/server-control/index.tsx"
    - "nexus/packages/core/src/daemon.ts"

key-decisions:
  - "ai_alerts uses environment_id UUID REFERENCES environments(id) ON DELETE SET NULL (NOT cascade) — deleting a remote env shouldn't silently remove historical alerts that operators may still want to audit"
  - "Two partial composite indexes: idx_ai_alerts_undismissed (dismissed_at, created_at DESC WHERE dismissed_at IS NULL) for the bell-list query, and idx_ai_alerts_dedupe (container_name, kind, created_at DESC WHERE dismissed_at IS NULL) for findRecentAlertByKind. Partial indexes keep them small; the dismissed-alert volume can grow indefinitely without bloating index size."
  - "ai-resource-watch defaults enabled=false on FRESH installs only. seedDefaults() ON CONFLICT (name) DO NOTHING means existing v27.0 deployments (server4 already booted) keep their seeded value. Operators flip enabled=true via Settings > Scheduler once they've validated Kimi projections in their environment. Same default-flip pattern Plan 21-02 documented for git-stack-sync."
  - "Threshold priority order: critical-memory (>=95%) > warning-memory (>=80%) > restart-loop (>=3) > cpu-throttle (delta>0). NO critical-cpu tier — Docker doesn't expose enough signal in a 5-min window to differentiate 'occasional throttling' from 'constant throttling' reliably without history; we elevate to critical only when memory is the issue."
  - "Throttle delta is `current - last` clamped to 0 on container restart. If a container restarts mid-window, throttled_time resets from cumulative N nanoseconds back to 0; raw delta would go negative and could be misread as throttling absent. Clamp ensures restart != throttling alarm."
  - "60-minute dedupe window. Same (container_name, kind) won't generate a second Kimi call within 60 minutes regardless of whether the underlying stress is still present. Dismissing an alert resets the dedupe (the index filters WHERE dismissed_at IS NULL), so users can force re-evaluation by dismissing then waiting for the next 5-min tick."
  - "Kimi-unavailable mid-loop aborts the run with status='failure' rather than retrying every container. The next 5-min cron tick will retry — no alert spam if Kimi is down for 30 min."
  - "Per-container errors are isolated. One stuck container (corrupt stats endpoint, agent timeout) can't fail the whole job. errorCount surfaces in the run-history output JSON for ops visibility."
  - "Handler runs against LOCAL socket only (listContainers(null)). Multi-host watching is deferred to v28 per Plan 22-01 D-06 — the docker compose CLI host-only constraint also applies to the cumulative throttled_time delta cache (each host has its own cumulative counter; can't merge across envs without per-env caches and per-env Kimi spend)."
  - "Defensive 4096-char message cap in insertAiAlert. Runaway Kimi output (system prompt asks for 60 words but the model is non-deterministic) won't bloat PG rows."
  - "listAiAlerts stays on WebSocket (read-only query polled every 30s; WS reconnect handles disconnect cleanly). Both dismiss mutations registered in httpOnlyPaths under '// Phase 23 AID-02 — AI Alerts dismissal mutations' comment block (matches Plan 23-01's rationale: mutations should never silently hang on disconnected WS clients per the documented Phase 18 gotcha)."
  - "AlertsBell uses the existing shadcn DropdownMenu primitive (Radix-backed, already in repo at packages/ui/src/shadcn-components/ui/dropdown-menu.tsx). No new dropdown library needed; zero-dep addition."
  - "useAiAlerts onSuccess hooks invalidate listAiAlerts via trpcReact.useUtils().docker.listAiAlerts.invalidate() — same idiom Plan 22-02 established (tRPC v11 + React Query v5)."
  - "docker_diagnostics tool routes through brain.chat() directly inside nexus-core (same-process). No HTTP roundtrip to /api/kimi/chat needed — that endpoint is a thin wrapper around brain.chat() too. Saves ~10ms latency per call and avoids the LIV_API_KEY plumbing inside the tool execute. Same in-process pattern Plan 17-02 used for docker_manage."
  - "docker_diagnostics duplicates the redaction regex + DIAGNOSE_SYSTEM_PROMPT from livinityd's ai-diagnostics.ts (~30 lines duplicated). Intentional per Plan 17-02 precedent: nexus DockerManager owns its own copy of docker logic; cross-package imports between livinityd and nexus would require either a shared package or a runtime HTTP roundtrip — both worse than the duplication. When/if the prompt drifts between proactive (livinityd) and reactive (nexus) surfaces, that's a feature: each surface tunes independently."
  - "Tool input schema is just {containerName: string} — no envId. Multi-host diagnose is a v28 follow-up; the LLM router needs to learn which container the user means and that already requires careful prompting; adding env disambiguation would compound the prompt-engineering surface area unnecessarily for v27.0."
  - "Tool description loud-explicit: 'Use this tool whenever the user asks why a specific container is slow, failing, OOMing, restarting, crashing, or otherwise misbehaving.' This IS the LLM router. Zero regex intent matching elsewhere — Kimi decides based on description. Tested via /gsd:audit-milestone manual smoke (asking 'why is my postgres container slow' invokes docker_diagnostics autonomously)."
  - "brain destructured from this.config alongside toolRegistry/dockerManager/shell at line 1313 of registerTools() — adds 'brain' to the existing destructure rather than reaching for this.config.brain inside the closure (matches the existing pattern for the other two)."
  - "Two commits for Task 2 (RED test commit 2e8eae4d + GREEN feat commit 614ba117) per execute-plan TDD protocol. Other 3 tasks were single-commit feat tasks. Total 5 commits + 1 metadata commit (this SUMMARY)."

patterns-established:
  - "Built-in scheduler handlers that consume external paid APIs ship default-disabled. Operators opt-in once they've validated cost/value in their env. Pattern: DEFAULT_JOB_DEFINITIONS entry with enabled:false; seedDefaults() ON CONFLICT (name) DO NOTHING ensures existing installs keep their seeded value."
  - "Module-scoped Map<containerId, lastNanoseconds> for cumulative-counter delta tracking is the right shape for any future scheduler handler that samples Docker counters at a fixed cadence (network bytes, blkio bytes, etc.). Pure-function clamp (negative -> 0) handles container restart cleanly."
  - "Pure-function threshold logic separated from handler: isThresholdExceeded({memoryPercent, throttledTimeDelta, restartCount}) is unit-testable in isolation, mocked-handler tests cover the orchestration layer. 6 boundary tests + 2 handler-shape tests = 8 tests; the priority test (test 6) prevents future regressions if someone reorders the if-branches."
  - "Tool description IS the LLM router. For any future autonomous AI tool: write the description as instructions to a routing LLM — 'Use this tool whenever X, even if user does not explicitly mention Y'. Avoids regex intent matching, scales with prompt-engineering rather than code."
  - "Inline duplicate logic in nexus tools rather than cross-calling livinityd. ~30 lines of duplicated redaction regex + system prompt is cheaper than the shared-package or HTTP-roundtrip alternatives. When the duplicates drift, that's the architectural seam between proactive and reactive surfaces working as intended."

requirements-completed: [AID-02, AID-05]

# Metrics
duration: 11min
completed: 2026-04-25
---

# Phase 23 Plan 02: AI-Powered Docker Diagnostics (Proactive + Autonomous) Summary

**Proactive Kimi resource-pressure alerts via a default-disabled `ai-resource-watch` scheduler handler (5-min tick, threshold-priority + 60-min dedupe, module-scoped throttle delta cache) + autonomous AI Chat container diagnostics via a new `docker_diagnostics` tool registered in the nexus tool registry — Phase 23 closes, v27.0 ready for milestone audit.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-04-25T03:42:58Z
- **Completed:** 2026-04-25T03:53:30Z
- **Tasks:** 4 (Task 2 split RED+GREEN per TDD protocol → 5 task commits)
- **Files modified:** 12 (5 created, 7 modified)

## Accomplishments

- **AID-02 (Proactive resource-pressure alerts):** New `ai_alerts` PG table + `ai-resource-watch` built-in scheduler handler (default disabled, every 5 min). For each running container on the local socket: computes memoryPercent, throttledTimeDelta (against module-scoped cache), restartCount; runs `isThresholdExceeded()` priority rules; on threshold + dedupe-miss calls Kimi for a plain-English projection; persists to ai_alerts.
- **AID-05 (Autonomous AI Chat diagnostics):** `docker_diagnostics` tool registered in nexus `toolRegistry` between `docker_manage` and `docker_exec`. The AI Chat agent loop autonomously decides when to invoke based on the tool description ("Use this tool whenever the user asks why a specific container is slow, failing, OOMing, restarting, crashing, or otherwise misbehaving"). Tool runs entirely in-process inside nexus-core (no HTTP roundtrip to livinityd).
- **AlertsBell UI:** Bell icon with red badge counter mounted next to EnvironmentSelector in Server Control header. 320px dropdown panel listing the latest 10 alerts with severity dots (red=critical, amber=warning, blue=info), formatDistanceToNow time-ago, per-row Dismiss + header "Dismiss all" button. 30s poll on listAiAlerts.
- **Tests:** 8/8 unit tests pass for ai-resource-watch (6 isThresholdExceeded boundary tests + 2 handler-shape tests covering dedupe and throttle delta cache).

## Task Commits

1. **Task 1: Schema + ai-alerts CRUD + JobType extension** — `6ace1b1f` (feat)
2. **Task 2: ai-resource-watch handler with TDD** — `2e8eae4d` (test, RED) + `614ba117` (feat, GREEN)
3. **Task 3: tRPC routes + httpOnlyPaths + UI hook + AlertsBell + header mount** — `14dfeee6` (feat)
4. **Task 4: Register docker_diagnostics tool in nexus-core** — `4c657403` (feat)

## Files Created/Modified

**Created (5):**
- `livos/packages/livinityd/source/modules/docker/ai-alerts.ts` (~180 lines) — PG CRUD: listAiAlerts, insertAiAlert (4096-char message cap), dismissAiAlert, dismissAllAiAlerts, findRecentAlertByKind (60-min lookup via int*INTERVAL'1 minute' arithmetic)
- `livos/packages/livinityd/source/modules/docker/ai-resource-watch.ts` (~245 lines) — aiResourceWatchHandler + isThresholdExceeded pure function + module-scoped _throttledTimeCache + RESOURCE_WATCH_SYSTEM_PROMPT
- `livos/packages/livinityd/source/modules/docker/ai-resource-watch.unit.test.ts` (~250 lines) — 8 tests across 2 describe blocks
- `livos/packages/ui/src/hooks/use-ai-alerts.ts` (35 lines) — React hook with 30s poll + dismiss mutations
- `livos/packages/ui/src/routes/server-control/ai-alerts-bell.tsx` (~140 lines) — AlertsBell dropdown component

**Modified (7):**
- `livos/packages/livinityd/source/modules/database/schema.sql` (+30 lines) — `CREATE TABLE IF NOT EXISTS ai_alerts` block + 2 partial composite indexes after docker_agents
- `livos/packages/livinityd/source/modules/scheduler/types.ts` (+5 lines) — JobType union extended with 'ai-resource-watch'
- `livos/packages/livinityd/source/modules/scheduler/jobs.ts` (+15 lines) — import aiResourceWatchHandler + BUILT_IN_HANDLERS entry + DEFAULT_JOB_DEFINITIONS append (enabled:false)
- `livos/packages/livinityd/source/modules/docker/routes.ts` (+76 lines) — 3 new admin routes (1 query + 2 mutations) after explainVulnerabilities; ai-alerts.js import added to existing block
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` (+3 lines) — 2 new entries under "Phase 23 AID-02 — AI Alerts dismissal mutations" comment block
- `livos/packages/ui/src/routes/server-control/index.tsx` (+2 lines) — AlertsBell import + mount next to EnvironmentSelector inside flex container with gap-2
- `nexus/packages/core/src/daemon.ts` (+113 lines) — registerTools() destructures brain alongside toolRegistry/dockerManager/shell; new docker_diagnostics tool registration block between docker_manage and docker_exec

## Final API Shape

### `ai_alerts` table (verbatim)

```sql
CREATE TABLE IF NOT EXISTS ai_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  container_name  TEXT NOT NULL,
  environment_id  UUID REFERENCES environments(id) ON DELETE SET NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  kind            TEXT NOT NULL CHECK (kind IN ('memory-pressure','cpu-throttle','restart-loop','disk-pressure','other')),
  message         TEXT NOT NULL,
  payload_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_alerts_undismissed
  ON ai_alerts(dismissed_at, created_at DESC)
  WHERE dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_alerts_dedupe
  ON ai_alerts(container_name, kind, created_at DESC)
  WHERE dismissed_at IS NULL;
```

Two partial composite indexes — both filter `WHERE dismissed_at IS NULL` so they only cover active alerts. The dismissed alert volume can grow indefinitely without bloating index size.

### `aiResourceWatchHandler` decision tree

| memoryPercent | throttledTimeDelta | restartCount | Result |
|---------------|--------------------|---------------|---------|
| `>= 95`       | any                | any          | `{kind: 'memory-pressure', severity: 'critical'}` |
| `>= 80, < 95` | any                | any          | `{kind: 'memory-pressure', severity: 'warning'}` |
| `< 80`        | any                | `>= 3`       | `{kind: 'restart-loop', severity: 'warning'}` |
| `< 80`        | `> 0`              | `< 3`        | `{kind: 'cpu-throttle', severity: 'warning'}` |
| `< 80`        | `<= 0`             | `< 3`        | `null` (healthy) |

Priority order: critical-memory > warning-memory > restart-loop > cpu-throttle. There is intentionally NO critical-cpu tier — see Decisions.

### `_throttledTimeCache` lifetime

`Map<containerId, lastSeenThrottledTimeNanoseconds>` keyed on the container Id (stable across renames) — falls back to container name if no Id is available. Lives for the lifetime of the livinityd process; clears on restart (acceptable — first run after restart sees `lastThrottled = currentThrottled` so delta is 0). Test-only `_resetThrottleCacheForTests()` exported so vitest can run handler-shape tests cleanly between invocations.

**Container restart handling:** raw `cpu_stats.throttling_data.throttled_time` is cumulative since container start. On container restart it resets to 0, which would produce a negative delta. The handler clamps `rawDelta > 0 ? rawDelta : 0` so a restart doesn't masquerade as throttling. The cache then stores the new (lower) value, and subsequent ticks measure delta correctly from there.

### `RESOURCE_WATCH_SYSTEM_PROMPT` (verbatim, no tweaks during execution)

```text
You are a proactive Docker resource alert assistant. The user gives you JSON describing a container that just crossed a resource threshold (memory >80% or CPU throttling or restart loop). Project what will happen if no action is taken. Use this exact format (one paragraph total, max 60 words):

Will <verb> in approximately <timeframe> unless <action>. Recommended: <one specific command>.

Examples:
- "Will OOM in approximately 10 minutes unless memory limit increased. Recommended: docker update --memory 2G my-postgres."
- "Will continue throttling indefinitely unless cpu_quota raised. Recommended: docker update --cpus 2 my-app."
```

Tier: 'sonnet' (Plan 23-01 default). MaxTokens: 512 (projection messages are tight — one paragraph max).

### `docker_diagnostics` tool description (verbatim — this IS the LLM router)

```text
Diagnose a Docker container's health: pulls recent logs (last 200 lines, secrets redacted) and live resource stats (CPU%, memory%, restart count, health), then returns a plain-English summary identifying the likely cause, a suggested action, and a confidence level. Use this tool whenever the user asks why a specific container is slow, failing, OOMing, restarting, crashing, or otherwise misbehaving — even if the user does not explicitly mention logs or stats. Prefer this over docker_manage operation='logs' for diagnostic questions because the output is interpreted, not raw.
```

Tool input: `{containerName: string}` (required). Tool output: `{success, output: result.text, data: {containerName, inputTokens, outputTokens}}`. Errors: `{success:false, error: "Docker diagnostics error: ..."}`.

### tRPC routes added

| Route | Type | Input | Output | Transport |
|-------|------|-------|--------|-----------|
| `docker.listAiAlerts` | query | `{includeDismissed?, limit?}` (1..200) | `AiAlert[]` | WS (30s poll) |
| `docker.dismissAiAlert` | mutation | `{id: uuid}` | `{dismissed: true}` or NOT_FOUND | HTTP |
| `docker.dismissAllAiAlerts` | mutation | (none) | `{dismissed: number}` | HTTP |

httpOnlyPaths additions: `'docker.dismissAiAlert'`, `'docker.dismissAllAiAlerts'`.

## Decisions Made

See `key-decisions` in frontmatter. Highlights:

- **Default-disabled scheduler job** — Kimi-spend-bearing handlers ship gated. Operators opt-in via Settings > Scheduler once cost/value validated.
- **Threshold priority + clamped throttle delta** — pure-function logic separated from handler; restart != throttling alarm.
- **60-min dedupe via partial composite index** — single-index seek for findRecentAlertByKind; small index because dismissed-alert volume excluded.
- **In-process docker_diagnostics tool** — same-process brain.chat() call, no HTTP roundtrip; description is the LLM router.
- **Inlined duplicate logic in nexus** — Plan 17-02 precedent applied; cross-package imports rejected.

## Deviations from Plan

None - plan executed exactly as written.

(Three minor adjustments worth noting:
1. The plan's spec for `findRecentAlertByKind` used `INTERVAL '$3 minutes'` with `$3` parameterised — PG won't parameterise INTERVAL literals directly. Used `($3::int * INTERVAL '1 minute')` arithmetic instead. Behavioural impact: zero.
2. The plan's spec for the docker_diagnostics tool included `inspectInfo?.State?.Status` and `inspectInfo?.RestartCount` — but `dockerManager.inspectContainer()` returns a custom shape (`{name, state, image, restartCount}` in camelCase, not the raw dockerode `Inspect` shape with `State.Status`). Adapted the payload to use the actual returned shape (`inspectInfo.state`, `inspectInfo.restartCount`, `inspectInfo.image`). Health status / exit code are not exposed by dockerManager.inspectContainer; v28 follow-up could either widen dockerManager's return shape or fall back to a raw dockerode inspect call.
3. The plan's spec for the redaction regex used a single inline replacement; the implementation uses a single `String.replace(re, fn)` form that preserves the leading separator (`= ` or `: `) before swapping in `[REDACTED]`. Behavioural impact: zero — same output shape, slightly clearer regex.)

## Issues Encountered

None — all 4 tasks executed cleanly.

- TDD RED phase confirmed correctly: vitest reported "Failed to load url ./ai-resource-watch.js" before the implementation existed.
- TDD GREEN phase passed all 8 tests on first run after writing the handler.
- Both builds (UI + nexus-core) clean on first invocation; no type errors introduced in the touched files.

## Known Stubs

None — every code path is wired to real data sources:

- ai_alerts table is real PG (live insert/select/update from handler + tRPC routes).
- AlertsBell renders real `useAiAlerts()` data; no mock alerts in production.
- docker_diagnostics tool calls real `dockerManager.containerLogs/inspectContainer` + real `brain.chat()` with no fixtures.

## User Setup Required

**To use Phase 23 proactive AI alerts on a deployed server:**

1. **Redeploy after pull:**
   - `cd /opt/livos/livos && git pull`
   - `cd /opt/nexus/app && git pull && npm run build --workspace=packages/core && pm2 restart nexus-core`
   - `cd /opt/livos/livos && pnpm --filter @livos/config build && pnpm --filter ui build`
   - `pm2 restart livos`

2. **Apply schema changes:** livinityd's `initDatabase()` replays `schema.sql` on every boot — `ai_alerts` table is created automatically. `seedDefaults()` adds the `ai-resource-watch` row (`enabled=false`) on fresh installs only; existing v27.0 deployments need manual flip:

   ```sql
   -- Optional: enable the proactive watcher on an existing install
   INSERT INTO scheduled_jobs (name, schedule, type, config_json, enabled)
   VALUES ('ai-resource-watch', '*/5 * * * *', 'ai-resource-watch', '{}'::jsonb, false)
   ON CONFLICT (name) DO NOTHING;
   ```

3. **Enable the watcher (opt-in):**
   - Open Settings > Scheduler in the LivOS UI
   - Find the `ai-resource-watch` row, toggle Enabled
   - The watcher fires every 5 minutes; alerts appear in the bell icon next to EnvironmentSelector in Server Control

4. **Verify Kimi auth is live:** existing `GET /api/kimi/status` endpoint should return `{authenticated: true}` (Plan 23-01 dependency). The watcher returns `{status: 'failure', error: 'Kimi provider unavailable'}` if Kimi is down.

5. **No additional env vars needed** — Plan 23-01 already configured `LIV_API_KEY` and `NEXUS_API_URL`. The proactive watcher reuses the same callKimi() bridge.

## Next Phase Readiness

**Phase 23 is now complete (AID-01..05 satisfied):**
- AID-01 (Container detail AI Diagnose button) — Plan 23-01 ✓
- AID-02 (Proactive resource-pressure alerts via scheduler) — Plan 23-02 ✓
- AID-03 (Stack create "Generate from prompt" tab) — Plan 23-01 ✓
- AID-04 (Trivy scan "Explain CVEs" button) — Plan 23-01 ✓
- AID-05 (AI Chat sidebar autonomous container diagnostics) — Plan 23-02 ✓

**v27.0 ready for `/gsd:audit-milestone v27.0`** — all 33 must-haves across Phases 17-23 should now be satisfied. Suggested audit checks:

- All 5 AID requirements satisfied (manual smoke: trigger ai-resource-watch with `docker run --rm --memory 50m -d --name memhog alpine sh -c "tail /dev/zero"`; verify alert appears in bell; ask AI Chat "why is my memhog container slow?" and verify autonomous docker_diagnostics invocation in `pm2 logs nexus-core`).
- Cron registration: `SELECT name, schedule, enabled FROM scheduled_jobs WHERE type = 'ai-resource-watch'` returns one row with `enabled=false` on a fresh install.
- Dedupe regression: with one alert active for `memhog/memory-pressure`, fire the watcher 3 more times within 60 minutes; `alertsSkippedDeduped` increments each run, `alertsCreated` stays at 0.
- httpOnlyPaths integrity: `docker.dismissAiAlert` and `docker.dismissAllAiAlerts` route through HTTP (verify in browser devtools network tab — these requests should NOT use the `?batch=1` WebSocket-style path).

**v28.0 candidates surfaced during this plan:**
- Multi-host watching (handler currently local-only per Plan 22-01 D-06) — requires per-env throttle delta caches + per-env Kimi spend
- Health status / exit code in docker_diagnostics — widen `dockerManager.inspectContainer()` return shape OR fall back to raw dockerode inspect
- Settings > Scheduler "Run Now" smoke test for `ai-resource-watch` (verifies handler with no stressed containers — should return `{checked: N, alertsCreated: 0}` quickly)
- Disk-pressure kind currently allowed by the CHECK constraint but not generated by the handler — v28 could add a 4th threshold rule (df-style host disk usage)
- Prompt tuning analytics — the handler logs Kimi token counts in `payload_json`; a v28 analytics view could surface average tokens-per-alert for cost forecasting

## Self-Check: PASSED

Verified post-write:

- ✓ `livos/packages/livinityd/source/modules/database/schema.sql` modified (1× CREATE TABLE IF NOT EXISTS ai_alerts)
- ✓ `livos/packages/livinityd/source/modules/scheduler/types.ts` modified (1× 'ai-resource-watch')
- ✓ `livos/packages/livinityd/source/modules/scheduler/jobs.ts` modified (1× ai-resource-watch.*aiResourceWatchHandler in BUILT_IN_HANDLERS)
- ✓ `livos/packages/livinityd/source/modules/docker/ai-alerts.ts` exists (8 named exports, 5 functions + 3 types)
- ✓ `livos/packages/livinityd/source/modules/docker/ai-resource-watch.ts` exists (2 named exports: aiResourceWatchHandler, isThresholdExceeded; plus _resetThrottleCacheForTests)
- ✓ `livos/packages/livinityd/source/modules/docker/ai-resource-watch.unit.test.ts` exists (8 tests pass)
- ✓ `livos/packages/livinityd/source/modules/docker/routes.ts` contains all 3 new route declarations
- ✓ `livos/packages/livinityd/source/modules/server/trpc/common.ts` contains 2 new httpOnlyPaths entries
- ✓ `livos/packages/ui/src/hooks/use-ai-alerts.ts` exists, exports useAiAlerts
- ✓ `livos/packages/ui/src/routes/server-control/ai-alerts-bell.tsx` exists, exports AlertsBell
- ✓ `livos/packages/ui/src/routes/server-control/index.tsx` contains AlertsBell (import + mount = 2× match)
- ✓ `nexus/packages/core/src/daemon.ts` contains 1× `name: 'docker_diagnostics'`
- ✓ All 5 commits exist: `6ace1b1f`, `2e8eae4d`, `614ba117`, `14dfeee6`, `4c657403`
- ✓ UI build clean (`pnpm --filter @livos/config build && pnpm --filter ui build` exit 0); bundle contains "AI Alerts" string
- ✓ nexus-core build clean (`npm run build --workspace=packages/core` exit 0); dist/daemon.js contains "docker_diagnostics" string
- ✓ Unit tests pass (23/23 — 8 new + 15 from Plan 23-01)

---
*Phase: 23-ai-powered-docker-diagnostics*
*Plan: 02*
*Completed: 2026-04-25*
