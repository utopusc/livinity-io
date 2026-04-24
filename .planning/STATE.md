---
gsd_state_version: 1.0
milestone: v27.0
milestone_name: Docker Management Upgrade
current_plan: 02 of 02
status: completed
stopped_at: Completed 18-02-PLAN.md
last_updated: "2026-04-24T22:28:23.781Z"
last_activity: 2026-04-24 — Plan 18-02 executed in ~6 minutes, 2 tasks + 1 Rule-3 deviation fix committed atomically; Phase 18 complete (CFB-01..05 satisfied)
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-24)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v27.0 — Docker Management Upgrade
**Current focus:** Phase 17 complete; Phase 18 (Container File Browser) next

## Current Position

Phase: 18 — Container File Browser (COMPLETE)
Current Plan: 02 of 02
Status: 18-01 complete (backend: helpers + 4 tRPC procedures + 2 REST endpoints); 18-02 complete (UI Files tab + httpOnlyPaths fix). All five CFB requirements (CFB-01..05) satisfied.
Last activity: 2026-04-24 — Plan 18-02 executed in ~6 minutes, 2 tasks + 1 Rule-3 deviation fix committed atomically

**Progress:** [██████████] 100%

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

Last session: 2026-04-24T22:28:23.778Z
Stopped at: Completed 18-02-PLAN.md
Resume with: `/gsd:execute-phase 18` to run Plan 18-02 (UI Files tab — consumes the 18-01 backend)
