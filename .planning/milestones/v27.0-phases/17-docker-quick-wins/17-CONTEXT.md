# Phase 17: Docker Quick Wins - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped)

<domain>
## Phase Boundary

Four tightly-scoped, high-value upgrades to the existing Docker management backend and UI:
1. Real-time container log streaming via WebSocket (replaces 5s snapshot polling)
2. Stack secrets injection as shell env vars (never written to .env on disk)
3. "Redeploy (pull latest)" action for stacks
4. Extended AI docker_manage tool covering stacks + image operations + container create

All four build on existing code — no new architectural patterns needed. Phase 17 is the foundation that unblocks Phases 18-23.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- QW-01: WebSocket pattern already exists for Docker exec (docker-exec-socket.ts) — reuse for logs at `/ws/docker/logs?container=X&follow=true`. Stream `container.logs({follow:true, stdout:true, stderr:true})` over WS. UI uses xterm.js already present in container-detail-sheet.tsx.
- QW-02: In stacks.ts `deployStack()`, split envVars array into {secret:true} vs {secret:false}. Write non-secret to .env for visibility. Inject secrets via execa env option at `docker compose up` time only. Redis-only storage of secret values (encrypted with JWT_SECRET).
- QW-03: Add `'pull-and-up'` operation to controlStack tRPC route — runs `docker compose pull -p <name> -f <composePath>` then `docker compose up -d`. UI button in stack detail: "Redeploy (pull latest)" with confirmation modal.
- QW-04: Nexus `docker_manage` tool in daemon.ts currently handles start/stop/restart/inspect/logs. Extend to also handle: stack-deploy, stack-control, stack-remove, image-pull, container-create. Route via HTTP to livinityd tRPC (same pattern as existing docker tools).

</decisions>

<specifics>
## Specific Ideas

**Success criteria (from ROADMAP):**
1. User opens container detail panel and sees log output stream in real time with ANSI colors; new log lines appear within 1s; no 5s polling gap
2. Stack create/edit UI has a `secret` checkbox per env var; secrets are never written to stacks/{name}/.env on disk; shell env injection succeeds
3. Stack detail has a "Redeploy (pull latest)" button that pulls all images first then recreates containers
4. AI calling docker_manage with operation="stack-deploy" or "image-pull" succeeds end-to-end

**Plans (target 2):**
- Plan 17-01: Real-time log WebSocket + stack secrets as shell env
- Plan 17-02: Redeploy-with-pull button + extended AI docker_manage tool

</specifics>

<deferred>
## Deferred Ideas

- Terminal tab rewrite to use log WebSocket — v28.0
- Per-secret rotation UI — v28.0
- AI tool for compose generation — Phase 23

</deferred>
