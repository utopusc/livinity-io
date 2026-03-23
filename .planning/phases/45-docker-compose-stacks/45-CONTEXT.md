# Phase 45: Docker Compose Stacks - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Docker Compose stack management: list stacks (grouped by compose project), deploy new stack from YAML editor, edit and redeploy, start/stop stacks, remove with optional volume cleanup, and stack-level env vars. New "Stacks" tab in Server Management.

</domain>

<decisions>
## Implementation Decisions

### Backend — Stack Management
- Docker Compose stacks are identified by the `com.docker.compose.project` label on containers
- `docker.listStacks` query: group containers by compose project label → return array of {name, status (running/stopped/partial), containerCount, containers[]}
- `docker.deployStack` mutation: takes {name, composeYaml, envVars?}, writes to temp dir, runs `docker compose -f ... up -d`
- `docker.editStack` mutation: takes {name, composeYaml, envVars?}, overwrites compose file, runs `docker compose -f ... up -d --remove-orphans`
- `docker.controlStack` mutation: takes {name, operation: 'up'|'down'|'stop'|'start'|'restart'}
- `docker.removeStack` mutation: takes {name, removeVolumes?: boolean}, runs `docker compose ... down [--volumes]`
- Stack compose files stored at `/opt/livos/data/stacks/{name}/docker-compose.yml`
- Stack env files stored at `/opt/livos/data/stacks/{name}/.env`
- Uses execa for docker compose CLI (not dockerode — compose is a CLI tool)
- All mutations admin-only + httpOnlyPaths

### Frontend — Stacks Tab
- New tab in Server Management (between Networks and PM2)
- Stack list: table with Name, Status (badge), Containers (count), Actions (Start/Stop/Remove/Edit)
- "Deploy Stack" button → opens full-page form with:
  - Stack name input
  - YAML editor (monospace textarea or code editor)
  - Environment variables (key-value rows)
  - Deploy button
- "Edit Stack" → same form pre-filled with current compose YAML + env vars
- Remove stack: confirmation dialog with "also remove volumes" checkbox
- Click stack row → expandable showing constituent containers

### Claude's Discretion
- YAML editor: simple textarea with monospace font vs syntax-highlighted editor
- Stack status computation logic (all running = running, all stopped = stopped, mixed = partial)
- Temp dir cleanup after compose operations

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- execa already used in PM2 module (Phase 38)
- Container table pattern for showing stack's containers
- Form dialog pattern from network/volume creation
- adminProcedure and httpOnlyPaths patterns

### Integration Points
- New `modules/docker/stacks.ts` for stack domain functions (separate from docker.ts to keep it manageable)
- Extend `docker/routes.ts` with stack routes
- Add Stacks tab to server-control/index.tsx
- Create `/opt/livos/data/stacks/` directory on first use

</code_context>

<specifics>
- Use `docker compose` (v2, not `docker-compose` v1)
- The `--project-directory` flag sets where compose looks for files
</specifics>

<deferred>
- Stack from Git repo — v14.0
- Stack templates/marketplace — v14.0
- Stack auto-update — v14.0
</deferred>
