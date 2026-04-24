---
gsd_state_version: 1.0
milestone: v27.0
milestone_name: Docker Management Upgrade
current_plan: 01 of 02 (Phase 21 — GitOps Stack Deployment in progress; Plan 21-01 backend complete)
status: in_progress
stopped_at: Completed 21-01-PLAN.md
last_updated: "2026-04-24T23:57:53.015Z"
last_activity: 2026-04-24 — Plan 21-01 executed in ~6 minutes, 4 atomic commits (fa38cc71, 67db624b, 4f11adf7, 49ea6fdb); 0 deviations
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 10
  completed_plans: 9
  percent: 90
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-24)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v27.0 — Docker Management Upgrade
**Current focus:** Phase 21 (GitOps Stack Deployment) — Plan 21-01 backend complete (schema + git module + deployStack + webhook); Plan 21-02 (UI + git_stack_sync handler) next

## Current Position

Phase: 21 — GitOps Stack Deployment (IN PROGRESS — 1 of 2 plans complete; GIT-01/02/03 satisfied)
Current Plan: 01 of 02 (Phase 21 — GitOps Stack Deployment in progress; Plan 21-01 backend complete)
Status: 21-01 complete (PostgreSQL git_credentials + stacks tables — git-backed only, YAML stacks remain filesystem-only; AES-256-GCM-with-JWT-key reused from 17-01 for encrypted credential storage; simple-git@^3.27.0 blobless clone --filter=blob:none --depth=1 --single-branch with ephemeral GIT_ASKPASS shell script for HTTPS auth + GIT_SSH_COMMAND temp keyfile for SSH auth, both cleaned up in finally{}; deployStack extended with optional git input mutually exclusive with composeYaml — git path generates 64-hex webhook_secret, persists stacks PG row, copies compose, runs existing compose-up code; new helpers getGitStack/listGitStacks/updateGitStackSyncSha; removeStack cleans up /opt/livos/data/git/<name> + DELETE FROM stacks; 3 admin-only tRPC routes for git_credentials CRUD — all wired through httpOnlyPaths; POST /api/webhooks/git/:stackName HMAC-SHA256-verified via crypto.timingSafeEqual length-checked-first, responds 202 then redeploys in background to stay under GitHub's 10s webhook timeout — registered before /trpc handler and catch-all routes).
Last activity: 2026-04-24 — Plan 21-01 executed in ~6 minutes, 4 atomic commits (fa38cc71, 67db624b, 4f11adf7, 49ea6fdb); 0 deviations

**Progress:** [█████████░] 90%

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
| 20-02 | 12 min | 3 | 10 | 2026-04-24 |

**Prior milestone (v26.0 — Device Security & User Isolation):**
| Phase 11-16 | 6 phases | 11 plans | 15/15 requirements satisfied |
| Audit: passed (42/42 must-haves, 4 attack vectors blocked, auto-approve constraint preserved) |
| Phase 20 P02 | 12min | 3 tasks | 10 files |
| Phase 21-gitops-stack-deployment P01 | 6min | 4 tasks | 9 files |

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

### Plan 21-01 Decisions (2026-04-24)

- PG row only for git-backed stacks. YAML-only stacks stay filesystem-only at `/opt/livos/data/stacks/<name>/docker-compose.yml` — zero migration risk on upgrade, zero DB load for users who never use GitOps. The new `stacks` table is additive metadata; YAML deploy path is byte-for-byte unchanged.
- Webhook is unauthenticated at the cookie/JWT layer — security model IS the per-stack 32-byte (64-hex) HMAC secret returned in `deployStack` response. Verification: `crypto.createHmac('sha256', stack.webhookSecret).update(rawBody).digest('hex')` then length-check + `crypto.timingSafeEqual` (length-check first to avoid different-length crash).
- Webhook responds 202 immediately and runs the redeploy in a fire-and-forget background Promise — image pulls + compose up can take 10-60s and would exceed GitHub's 10s webhook timeout, triggering retries. Background errors logged-only (never thrown back to GitHub).
- Blobless clone (`--filter=blob:none --depth=1 --single-branch --branch <X>`) over isomorphic-git's full clone. simple-git wraps the system git binary which supports partial clone cleanly; isomorphic-git is already in deps but doesn't handle the partial-clone protocol well. Minimal disk + bandwidth for sample stacks; objects fetched on-demand if rev-parse needs older commits.
- Auth credentials live in tmpdir() temp files cleaned up in `finally{}`. HTTPS uses a `GIT_ASKPASS` shell script (mode 0o700) that echos username/PAT keyed on the prompt arg `$1`; SSH uses a temp keyfile (mode 0o600) referenced via `GIT_SSH_COMMAND="ssh -i <path> -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes"`. No plaintext credential persists to disk after the operation completes.
- AES-256-GCM crypto for `git_credentials.encrypted_data` is identical to `stack-secrets.ts` (Phase 17): SHA-256 of `/opt/livos/data/secrets/jwt` -> 32-byte key, output is `base64(iv12 || tag16 || ciphertext)`. `decryptCredentialData` is internal-only — `encrypted_data` NEVER returned by list/get/CRUD APIs.
- `git_credentials.user_id` is `UUID REFERENCES users(id) ON DELETE SET NULL` — admin user deletion shouldn't orphan-cascade away credentials that other admins might still need. `UNIQUE(user_id, name)` prevents duplicate names per user (and per global scope when user_id is NULL).
- 3 new tRPC routes (`docker.listGitCredentials`, `docker.createGitCredential`, `docker.deleteGitCredential`) added to `httpOnlyPaths` to avoid the documented WS-mutation hang issue. Pattern: every new admin-only credential/stack mutation goes through HTTP, never WebSocket.
- Pre-existing typecheck noise in `ai/routes.ts` (`ctx.livinityd is possibly undefined`) and `server/index.ts` (lines 66/167/634/772/1570 — asyncHandler / Apps types — pre-date this plan) noted as out-of-scope per scope-boundary rule. None of the Phase 21 touched files (git-credentials.ts, git-deploy.ts, the new code in stacks.ts/routes.ts/server index.ts) introduce new errors. livinityd runs via tsx so build is not gated on tsc.
- Pattern carried forward to Plan 21-02: `listGitStacks()` + `syncRepo()` + `copyComposeToStackDir()` + `controlStack('pull-and-up')` is the exact 4-step recipe Plan 20's `git_stack_sync` placeholder needs to become real. Plan 21-02 wires this into `BUILT_IN_HANDLERS['git-stack-sync']`.

### Plan 20-02 Decisions (2026-04-24)

- AES-256-GCM credential vault keyed off the JWT secret (mirrors Phase 17 stack-secrets) — Redis hash at `nexus:scheduler:backup-creds:{jobId}` with `{field -> base64(iv(12)||tag(16)||ciphertext)}`. No second master-key to manage; rotating JWT forces re-entry of backup creds (acceptable). config_json (PG) NEVER stores secrets — strict accessKeyId-public / secretAccessKey-vault split.
- Streaming tar via ephemeral `alpine:latest` container with `Cmd ['tar','czf','-','-C','/','data']` + `Binds:['<vol>:/data:ro']` + `AutoRemove:true`. Dockerode `attach({hijack:true})` + `modem.demuxStream(mux, stdout, stderr)` splits the 8-byte multiplexed frames; `container.wait()` promise destroys stdout PassThrough on non-zero exit so the upload reject-propagates with captured stderr (truncated to 500 chars). O(1) host-disk usage regardless of volume size.
- `@aws-sdk/lib-storage` `Upload` over manual `PutObjectCommand` — auto-multipart for >5MB streams (we don't know volume size in advance) + correct backpressure between tar producer and S3 consumer. Endpoint override + forcePathStyle support R2/B2/MinIO.
- `ssh2-sftp-client` `connect → put(stream, remoteFile) → end` wrapped in try/finally so the SFTP socket is always cleaned up even on tar failure mid-upload. Password OR privateKey+passphrase via `authMethod` discriminator.
- Discriminated-union Zod schema (`z.discriminatedUnion('type', [s3, sftp, local])`) — strong runtime validation + correct TS narrowing in handler. PG unique-violation (`code: '23505'`) maps to `CONFLICT` TRPCError; missing id → `NOT_FOUND`.
- `upsertJob` mutation splits creds from config: writes encrypted blob to Redis vault (`getBackupSecretStore.setCreds`), persists only non-sensitive config to `scheduled_jobs.config_json`, then calls `ctx.livinityd.scheduler.reload()` so cron picks up new/edited rows without restart. `deleteJob` cascades cred deletion via `deleteAll(jobId)`.
- 5 tRPC routes (`listJobs` query + `upsertJob`/`deleteJob`/`runNow`/`testBackupDestination` mutations); all 4 mutations registered in `httpOnlyPaths` (queries stay on WS). `testDestination` uploads a 22-byte probe + best-effort delete, returning `{success, latencyMs, bytesUploaded}` for the UI Test Destination button.
- Settings > Scheduler section: 10s poll on `listJobs` surfaces Last Run flips live; AddBackupDialog `Test Destination` and `Save` share the same `buildPayload()` to eliminate "test passed, save failed" surprises from drifted serialization. Built-in jobs (image-prune, container-update-check, git-stack-sync) cannot be deleted from UI — they're seeded by 20-01's `seedDefaults` and would respawn on next boot anyway.
- No default `volume-backup` row in `DEFAULT_JOB_DEFINITIONS` — backups are always user-configured (no sensible default volume + destination). The `BUILT_IN_HANDLERS['volume-backup']` slot now points to `volumeBackupHandler` (replaces 20-01's throwing stub).
- Pattern established for Phase 21 GIT-01 git-credentials encryption: lift-and-shift `backup-secrets.ts` (rename Redis prefix to `nexus:git:credentials:{stackId}` + field names to `username/password/token/sshPrivateKey`); identical AES-256-GCM crypto + Redis-hash layout. Streaming-source-through-ephemeral-container pattern reusable for `alpine/git:latest git pull` runs in Phase 21.
- Pre-existing typecheck noise: `'ctx.livinityd' is possibly 'undefined'` matches the identical pattern across `ai/routes.ts` (10+) and `widgets/routes.ts` (3+) — Context-merge produces optional `livinityd` field but every existing route assumes it's present at runtime (always true — set by Express/WS context creators). Out-of-scope per scope-boundary rule; livinityd runs via tsx with no compilation gate.

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

Last session: 2026-04-24T23:57:53.010Z
Stopped at: Completed 21-01-PLAN.md
Resume with: `/gsd:execute-plan 20-02` to ship the backup module (volumeBackupHandler + S3/SFTP/local destinations + admin tRPC routes + Settings UI). Plan 20-01 satisfied SCH-01/02; Plan 20-02 will satisfy SCH-03/04/05 by registering the volume-backup handler into the existing BUILT_IN_HANDLERS map.
