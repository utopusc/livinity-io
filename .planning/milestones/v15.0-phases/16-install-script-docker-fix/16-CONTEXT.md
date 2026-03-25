# Phase 16: Install Script Docker Fix - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix install.sh so a single `curl | bash --api-key KEY` command results in a fully working LivOS with auth-server + tor Docker containers running, torrc created, and tunnel connected. No manual Docker steps needed.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

Key fixes needed:
1. `setup_docker_images()` at line 311 — pulls getumbrel images and tags as livos/*. This works but needs error handling: if pull fails, compose up will also fail
2. `torrc` file must be created BEFORE docker compose up — compose mounts `$LIVINITY_TORRC` which points to data/tor/torrc
3. `tor/data` directory must exist with correct permissions (1000:1000)
4. The Kimi CLI section (line 1140) should not abort the entire install if kimi is missing — wrap in `|| true`
5. `docker compose up` in livinityd starts containers — needs livos/tor and livos/auth-server tags to exist first

Files to modify:
- `livos/install.sh` — setup_docker_images, add torrc creation, fix kimi error handling

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `livos/install.sh` — full installer script (~1200 lines)
- `setup_docker_images()` at line 311 — pulls and tags Docker images
- `write_env_file()` — writes .env with LIVINITY_TORRC, AUTH_PORT, TOR_PROXY_IP etc.
- `docker-compose.yml` at `packages/livinityd/source/modules/apps/legacy-compat/` — defines auth + tor_proxy services

### Established Patterns
- install.sh uses step/ok/warn/error helper functions for output
- set -euo pipefail with trap for error handling
- All paths relative to LIVOS_DIR=/opt/livos

### Integration Points
- write_env_file creates LIVINITY_TORRC path variable
- docker compose reads LIVINITY_TORRC, AUTH_PORT, TOR_PROXY_IP from .env
- livinityd starts docker compose on boot

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure fix phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
