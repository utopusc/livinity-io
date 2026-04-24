---
gsd_state_version: 1.0
milestone: v27.0
milestone_name: Docker Management Upgrade
current_plan: "01 of 02 (Phase 20 in progress)"
status: in_progress
stopped_at: Completed 20-01-PLAN.md
last_updated: "2026-04-24T23:19:00.984Z"
last_activity: 2026-04-24 — Plan 20-01 executed in 5 minutes; scheduler module (types/store/jobs/index) + scheduled_jobs PG table + node-cron@3 wired into Livinityd boot; 3 atomic commits (0ac62751, d54b9e3c, 9f3301ad); 0 deviations; SCH-01/02 satisfied
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 8
  completed_plans: 7
  percent: 88
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-24)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v27.0 — Docker Management Upgrade
**Current focus:** Phase 17 complete; Phase 18 (Container File Browser) next

## Current Position

Phase: 20 — Scheduled Tasks + Backup (IN PROGRESS — 1 of 2 plans complete; SCH-01/02 satisfied; SCH-03/04/05 remain for Plan 20-02)
Current Plan: 01 of 02 (Phase 20 in progress)
Status: 20-01 complete (scheduler module shipped — types/store/jobs/index; scheduled_jobs PG table with 13 cols + 2 indexes; node-cron@3.0.3 + @types/node-cron@3.0.11 added; 3 default jobs seeded on first boot — image-prune Sun 3am ENABLED, container-update-check daily 6am ENABLED, git-stack-sync hourly DISABLED placeholder; Scheduler class with in-flight Set mutex, cron.validate guard, fresh-row re-fetch in runJob; wired into Livinityd lifecycle non-fatally; image-prune wraps existing pruneImages(); container-update-check uses docker buildx imagetools inspect with manifest-inspect fallback for digest comparison).
Last activity: 2026-04-24 — Plan 20-01 executed in 5 minutes, 3 atomic commits (0ac62751, d54b9e3c, 9f3301ad); 0 deviations

**Progress:** [█████████░] 88%

## v27.0 Phase Structure

| Phase | Name | Requirements | Depends On |
|-------|------|--------------|------------|
| 17 | Docker Quick Wins | QW-01/02/03/04 | — (foundation) |
| 18 | Container File Browser | CFB-01/02/03/04/05 | Phase 17 |
| 19 | Compose Graph + Vuln Scan | CGV-01/02/03/04 | Phase 17 |
| 20 | Scheduled Tasks + Backup | SCH-01/02/03/04/05 | Phase 17 |
| 21 | GitOps Stack Deployment | GIT-01/02/03/04/05 | Phase 17, Phase 20 |
| 22 | Multi-host Docker | MH-01/02/03/04/05 | Phase 17 |
| 23 | AI-Powered Diagnostics | AID-01/02/03/04/05 | Phase 17, Phase 19 |

Coverage: 33/33 v27.0 requirements mapped ✓

## Performance Metrics

| Phase-Plan | Duration | Tasks | Files | Completed |
|------------|----------|-------|-------|-----------|
| 17-01 | 7 min | 4 | 9 | 2026-04-24 |
| 17-02 | 8 min | 4 | 7 | 2026-04-24 |
| 18-01 | 6 min | 3 (+1 fixup) | 4 | 2026-04-24 |
| 18-02 | 6 min | 2 (+1 deviation) | 3 | 2026-04-24 |
| 19-01 | 5 min | 2 | 4 | 2026-04-24 |
| 19-02 | 7 min | 2 | 6 | 2026-04-24 |
| 20-01 | 5 min | 3 | 8 | 2026-04-24 |

**Prior milestone (v26.0 — Device Security & User Isolation):**
| Phase 11-16 | 6 phases | 11 plans | 15/15 requirements satisfied |
| Audit: passed (42/42 must-haves, 4 attack vectors blocked, auto-approve constraint preserved) |

## Accumulated Context

### v27.0 Roadmap Decisions

- Phase 17 is foundation (real-time logs, secret env, redeploy button, AI tool expansion) — unblocks UI polish downstream
- Phases 18/19/20/22 parallelizable (only depend on Phase 17)
- Phase 21 (GitOps) depends on Phase 20's scheduler for auto-sync
- Phase 23 (AI diagnostics) depends on Phase 19's vulnerability scanning for AID-04
- Dockhand-inspired features: file browser, graph viewer, vuln scan, GitOps stacks, multi-host — all catching up to competitor parity
- AI-powered diagnostics (Phase 23) = Livinity's unique moat, no competing Docker manager has this

### Plan 17-01 Decisions (2026-04-24)

- Reused `stripDockerStreamHeaders` by exporting it unchanged from `docker.ts` (single source of truth for Docker frame parsing)
- `editStack` uses incremental delete-missing + set-non-empty (NOT `deleteAll`) — allows UI to submit blank-value secret rows to preserve stored values on edit
- `controlStack('up')` also injects secret envOverrides (otherwise stop→up cycles would lose secret env)
- `removeStack` purges Redis secret hash best-effort (`.catch(() => {})`) — a Redis outage cannot block stack teardown
- LogsTab search input is visible v1 placeholder; xterm search addon deferred to v28 per plan guidance
- `JWT_SECRET_PATH` hardcoded to `/opt/livos/data/secrets/jwt` — lift to env var only if dev environment needs a different location
- Pattern establishment: WebSocket streaming handler factory is the reference for Phase 18 (file browser) and Phase 20 (scheduler tail); AES-256-GCM-with-JWT-key is the reference for Phase 21 GIT-01 (git credential encryption)

### Plan 17-02 Decisions (2026-04-24)

- AI `docker_manage` stays on local Docker socket + host `docker compose` CLI (via `child_process.exec`) — NOT livinityd tRPC. Matches existing start/stop/restart/inspect/logs ops; no JWT plumbing needed. Compose files under `/opt/livos/data/stacks/<name>/` are shared with livinityd so AI-created stacks appear in the UI immediately.
- `PROTECTED_STACK_PREFIXES = ['livos', 'nexus-infrastructure', 'caddy']` guards `DockerManager.removeStack` — mirrors livinityd's container-level protection at stack level since `isProtectedContainer` isn't cross-process reachable.
- `controlStack('pull-and-up')` re-injects secret env overrides (same path as `'up'`) — upgrading a secret-bearing stack via the Redeploy button keeps its encrypted env vars intact.
- Renamed inner `exec` local to `execInstance` in `DockerManager.exec()` to avoid shadowing the module-scoped `promisify(cpExec)` — zero behavioral change, required by TypeScript.
- Redeploy ActionButton reuses `color='blue'` (no new `'violet'` variant) per plan explicit guidance; distinguishes via title "Redeploy (pull latest images)".
- AI `stack-deploy` does NOT expose `secret: true` flag on envVars — the secret store is a livinityd-owned concern. Deferred to v28: either route AI stack-deploy through livinityd tRPC with an internal JWT, or grant nexus DockerManager read access to the same Redis key.

### Plan 19-02 Decisions (2026-04-24)

- Picked execa-driven `docker run --rm aquasec/trivy:latest …` over `dockerode.run()` — simpler stdout capture, native timeout (5min) and maxBuffer (64MB for large CVE JSON), `reject:false` lets us inspect exitCode + stderr together. No dockerode multiplexed-stream demuxing required.
- `--quiet --format json` combination on Trivy → guarantees pure-JSON stdout (Trivy progress messages route to stderr). Combined with `--severity CRITICAL,HIGH,MEDIUM,LOW` we never receive UNKNOWN entries from Trivy itself; defense-in-depth `SEVERITY_SET.has()` check still drops UNKNOWN at parse time per CGV-02.
- Description trimmed to 500 chars in CveEntry — Trivy descriptions can run multiple paragraphs; UI uses them as tooltip text only. Saves Redis bytes.
- Best-of-vendor CVSS via `Math.max(nvd.V3, redhat.V3, ghsa.V3, nvd.V2, redhat.V2)` — single sortable score across heterogeneous Trivy output. Sort key: severity ASC by SEVERITY_ORDER → cvss DESC → id ASC (stable tie-break).
- Cache key strips `sha256:` prefix → `nexus:vuln:<hex>` per 19-CONTEXT.md spec. Same digest under different tags shares the cache entry — `getCachedScan('alpine:3.19')` returns the entry created by `scanImage('mytag:foo')` if both pulled the same digest.
- Persisted result has `cached: false`; `getCachedScan` and the cache-hit fast-path in `scanImage` flip the flag in-memory. Storage stays canonical.
- Lazy `ensureTrivyImage` — only invoked from `scanImage`, never on module import. Avoids 250MB pull at boot. First-scan UX is the only place users wait.
- `getCachedScan` is a query (not mutation): read-only, idempotent, latency-tolerant → stays on WebSocket. `scanImage` is a mutation that can take 30-90s → added to httpOnlyPaths so it cannot silently hang on a disconnected WS client (the Phase 18 gotcha).
- ImageHistoryRow → ImageHistoryPanel refactor: original returned bare `<TableRow>` siblings, which is invalid inside a `<TabsContent>`. Rewrote to render its own `<Table>` inside the panel.
- Per-image active-tab state stored as `Record<id, 'history'|'scan'>` in ImagesTab; Scan button writes 'scan' so click auto-flips the tab without losing manual selections on other rows.
- Bracketed-error-code mapping: `[image-not-found]` → NOT_FOUND, `[trivy-timeout]` → TIMEOUT, `[trivy-failed]` / `[trivy-parse]` / `[trivy-unavailable]` → INTERNAL_SERVER_ERROR. Frontend toast shows the unprefixed message.
- Pre-existing typecheck noise (~338 errors in livinityd unrelated modules + ~38 ActionButton-icon type errors in server-control across pre-existing usages) logged to `.planning/phases/19-compose-graph-vuln-scan/deferred-items.md` per scope-boundary rule. Build is the gating signal (livinityd runs via tsx; UI build passed).
- Pattern established for v28 SBOM/license/grype: ephemeral-container CLI tool wrapped in execa with bracketed-error mapping + digest-keyed Redis cache. CGV-04 explicitly forbids any auto-scheduling (`docker.scanImage` is mutation-only, no cron, no event listener, no auto-trigger on `pullImage`).

### Plan 20-01 Decisions (2026-04-24)

- Picked node-cron 3.x over 4.x — 3.x is the long-stable line shipping ESM-compatible CommonJS for our `"type": "module"` package; 4.x has breaking API changes around schedule() options. Single dep choice — no Bull/Agenda — node-cron is sufficient for the 3-handler maintenance workload and adds zero infra (no Redis queue).
- Mutex via in-flight `Set<jobId>` — concurrent firings of the same job are dropped+logged rather than queued. Matches the "idempotent maintenance" nature of these jobs (a 2nd image-prune mid-run is wasted work, not lost work). Logged-and-dropped is the simpler, more predictable contract than a queue.
- container-update-check shells out to `docker buildx imagetools inspect <ref> --format '{{json .Manifest}}'` (preferred — multi-arch index aware, no hand-rolled registry HTTP auth) with `docker manifest inspect --verbose` fallback for environments without buildx (older Docker). Per-container failures degrade gracefully: the entry gets `updateAvailable: null` + `error` string, the job overall stays `'success'`. One unreachable registry must not blank-out the whole report. 15s timeout per registry call. Digest-pinned refs (`sha256:…`) and `<none>` tags get `pinned: true` and skip remote lookup.
- git-stack-sync ships as a `status: 'skipped'` placeholder so Phase 21 can simply replace `BUILT_IN_HANDLERS['git-stack-sync']` without DB migration. Default row is `enabled=false` so it doesn't spam logs hourly until Phase 21 turns it on. Pattern: handler registry decoupled from runner — Plan 20-02 backup handler plugs into `BUILT_IN_HANDLERS['volume-backup']` without touching `scheduler/index.ts`.
- BUILT_IN_HANDLERS['volume-backup'] throws explicitly — a user who creates a volume-backup job in the UI before Plan 20-02 ships gets a clear error instead of a silent no-op.
- Scheduler.start() failures are caught and logged (non-fatal). Livinityd boots with scheduler-disabled behavior rather than crashing if PG is down — matches the existing `initDatabase()` fallback pattern. `registerTask()` validates cron expressions via `cron.validate()` before scheduling — invalid schedules log + skip rather than throw.
- Re-fetch fresh row inside `runJob()` before invoking handler — config or enabled flag may have changed since cron registration; if `!enabled` at fire time, the run is silently dropped.
- Idempotent default seed via `INSERT … ON CONFLICT (name) DO NOTHING` — manually-disabled defaults survive restarts. Pattern: PG row is source of truth; node-cron tasks are stateless registrations rebuilt on every `Scheduler.start()`. `Scheduler.runNow()` and `Scheduler.reload()` are already public for Plan 20-02 admin tRPC routes.
- Pre-existing pnpm UI postinstall fail on Windows (mkdir -p / cp -r in cmd) is documented in STATE; pnpm install still resolved node-cron correctly. Pre-existing 324 livinityd typecheck errors are unrelated to scheduler files (zero new errors from this plan); per scope-boundary rule, livinityd runs via tsx and gates on UI build, not livinityd tsc.

### Plan 19-01 Decisions (2026-04-24)

- Picked `reactflow@^11.11.4` over `@xyflow/react@^12` — v12 mandates React 19; @livos/ui pins React 18.2, so 11.x is the highest stable line we can adopt without a React major.
- Topological grid layout (Kahn's algorithm + per-column row counter) instead of dagre/elkjs — adds zero KB; sufficient for ≤ 10-service home-server stacks. Future large-stack support can layer dagre behind a flag.
- `nodeTypes` registered at module scope (NOT inside the component) per documented React Flow gotcha — avoids per-render remount and the "It looks like you've created a new nodeTypes object" warning.
- Compose-spec parsing fallbacks: services with no `networks:` key get `['default']` to match docker compose's actual behaviour; both array and object forms supported for `depends_on`/`networks`/`ports`.
- Lazy mount via Radix Tabs default (inactive `<TabsContent>` panes unmount) — `getStackCompose` query fires only when the user clicks the Graph tab; zero extra API load for users who never click.
- `pnpm --filter ui add ... --ignore-scripts` is required on Windows because the existing `postinstall: copy-tabler-icons` uses Unix `mkdir -p` / `cp -r .` which fails under cmd. Pre-existing repo quirk; safe to skip when adding deps because the icon copy already ran on a prior successful install.
- Pattern established for future stack-detail tabs (Resource Usage, Logs, Vuln overlay): `Tabs(...)` block lives directly inside the existing `<TableRow><TableCell>` expanded-row container.
- Tile rendering combines Plan-spec basics (image, port pills) with per-service network pills inside each node — gives users two simultaneous reads (legend below + per-node colours), no extra data fetch.

### Plan 18-02 Decisions (2026-04-24)

- Inferred `ContainerFileEntry` from `RouterOutput['docker']['containerListDir']` rather than duplicating the interface client-side — single source of truth in `container-files.ts`.
- Plain styled `<textarea>` for the edit modal (not Monaco — Monaco is NOT installed; verified by grepping package.json). Styling matches the existing compose YAML editor at `server-control/index.tsx` line 2509 — keeps bundle flat.
- Imperative `utils.docker.containerReadFile.fetch()` for read-on-edit-open instead of conditional `useQuery` — modal data is one-shot, doesn't need React-Query caching.
- POSIX path helpers (`posixJoin`, `posixDirname`, `segmentsOf`) are private-module-local — never use `node:path` because it resolves to win32 on Windows hosts and container paths are POSIX.
- Edit button is rendered DISABLED (not hidden) for non-text or large files so the affordance is discoverable; click on disabled writes inline error rather than opening modal.
- Recursive-delete checkbox is the ONLY enabler for the directory delete button — file deletes get a single confirm button with no checkbox, mirroring `removeContainer` UX.
- Drop zone uses `useDropzone` with `noClick: false` so users can drag-drop AND click-to-browse; uploads are sequential to avoid hammering the multipart endpoint.
- Download is a same-origin `<a download>` anchor (not fetch+blob) — auth cookie rides automatically; tRPC can't carry tar streams anyway.
- **Rule 3 deviation:** `docker.containerWriteFile` and `docker.containerDeleteFile` were missing from `httpOnlyPaths` in Plan 18-01 — added in this plan. Without it, mutations would silently hang on disconnected WS clients per CLAUDE.md known-pitfall.
- Pattern carried forward to future v28 expansions (file preview, chmod UI, chunked upload): the component's `currentPath` is the single source of truth for both display and uploads — adding modes is pure addition, no restructuring.

### Plan 18-01 Decisions (2026-04-24)

- Module-local Dockerode in `container-files.ts` — mirrors docker-exec-socket / docker-logs-socket; the connection is just `/var/run/docker.sock` so per-module instantiation is essentially free.
- Custom `demuxDockerStream` (vs reusing `stripDockerStreamHeaders`) so non-TTY exec can separate stdout from stderr — needed to surface accurate context on `[ls-failed]` / `[read-failed]` / `[delete-failed]`.
- `writeFile` uses `archiver` tar + `container.putArchive` (binary/multiline-safe). No `echo > file` shell-out.
- REST endpoints (not tRPC) for download + upload because tRPC is JSON-only — `/api/docker/container/:name/file` GET (tar stream) and POST (multipart). Both gated by `LIVINITY_SESSION` cookie via `verifyToken`, mirroring `/api/desktop/resize`.
- `busboy@1.6.0` chosen over `multer` — smaller dep, streaming parse, no tmp files. 110MB cap with explicit truncation→HTTP 413.
- Filename slashes stripped server-side (`replace(/[\\/]/g, '_')`) — defense against path-traversal even though the path is interpreted inside the container.
- Buffer/Stream casts (`as unknown as Uint8Array[]` / `NodeJS.WritableStream`) accepted as a one-line concession to stricter `@types/node` 22+ — Buffer extends Uint8Array, Busboy/PassThrough are Writables; runtime unchanged.
- Pattern carried forward to Plan 18-02: tRPC for JSON paths + REST for binary/multipart, all session-cookie-gated. `ContainerFileEntry` type drives both backend and UI.

### Carried from v26.0

- Deployment warning: REDIS_URL must be set on platform/web for SESS-03 instant teardown
- Stale comment at server/index.ts:984 refers to old recordAuthFailure name
- v25.0 tech debt: wa_outbox dead code, chunkForWhatsApp unused, Integrations menu label, linkIdentity() never called

### Pending Todos

None

### Blockers/Concerns

- Mini PC SSH direct IP (10.69.31.68) currently unreachable — deploys to bruce will need tunnel-based access or network reconnection
- Phase 22 (multi-host agent) is the largest in scope (3 plans); may split further during plan-phase

## Session Continuity

Last session: 2026-04-24T23:18:48.729Z
Stopped at: Completed 20-01-PLAN.md
Resume with: `/gsd:execute-plan 20-02` to ship the backup module (volumeBackupHandler + S3/SFTP/local destinations + admin tRPC routes + Settings UI). Plan 20-01 satisfied SCH-01/02; Plan 20-02 will satisfy SCH-03/04/05 by registering the volume-backup handler into the existing BUILT_IN_HANDLERS map.
