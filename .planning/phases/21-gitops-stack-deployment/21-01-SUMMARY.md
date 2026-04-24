---
phase: 21-gitops-stack-deployment
plan: 01
subsystem: infra
tags: [gitops, docker, postgres, simple-git, hmac-sha256, aes-gcm, webhooks, trpc]

# Dependency graph
requires:
  - phase: 17-docker-quick-wins
    provides: stack-secrets.ts AES-256-GCM-with-JWT-key crypto pattern (reused for git_credentials)
  - phase: 19-multi-user
    provides: PostgreSQL `users` table (FK target for git_credentials.user_id)
  - phase: 20-scheduled-tasks-backup
    provides: scheduler/store.ts PG CRUD pattern (mirrored for git_credentials store)
provides:
  - PostgreSQL `git_credentials` table (UUID PK, AES-256-GCM-encrypted credentials, FK users)
  - PostgreSQL `stacks` table (git-backed only; YAML stacks remain filesystem-only)
  - `git-credentials.ts` module (createCredential, getCredential, listCredentials, deleteCredential, decryptCredentialData)
  - `git-deploy.ts` module (cloneOrPull blobless, syncRepo, copyComposeToStackDir, readComposeFromRepo)
  - Extended `deployStack({name, git: {url, branch, credentialId, composePath}})` — mutually exclusive with composeYaml
  - `getGitStack`, `listGitStacks`, `updateGitStackSyncSha` helpers for the webhook + Plan 21-02 UI
  - `removeStack` cleanup of `/opt/livos/data/git/<name>` + `DELETE FROM stacks` row
  - 3 new admin tRPC routes (`docker.listGitCredentials`, `docker.createGitCredential`, `docker.deleteGitCredential`)
  - `POST /api/webhooks/git/:stackName` Express endpoint (HMAC-SHA256 verified, 202+background redeploy)
affects: [21-02, gitops, stacks, scheduler]

# Tech tracking
tech-stack:
  added:
    - simple-git@^3.27.0 (system-git wrapper for blobless clones)
  patterns:
    - "Reuse: AES-256-GCM-with-JWT-key crypto from 17-01 stack-secrets.ts (now applied to git_credentials)"
    - "Pattern: optional PG row only for git-backed stacks — YAML deploy path 100% backwards compatible"
    - "Pattern: blobless clone (--filter=blob:none --depth=1 --single-branch --branch X) for minimal disk + bandwidth"
    - "Pattern: ephemeral auth files (GIT_ASKPASS shell script / SSH temp keyfile) cleaned up in finally block"
    - "Pattern: webhook responds 202 then redeploys in background — stays under GitHub's 10s webhook timeout"
    - "Pattern: HMAC verification length-checks BEFORE timingSafeEqual to avoid different-length crash"

key-files:
  created:
    - livos/packages/livinityd/source/modules/docker/git-credentials.ts
    - livos/packages/livinityd/source/modules/docker/git-deploy.ts
  modified:
    - livos/packages/livinityd/source/modules/database/schema.sql
    - livos/packages/livinityd/source/modules/docker/stacks.ts
    - livos/packages/livinityd/source/modules/docker/routes.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
    - livos/packages/livinityd/source/modules/server/index.ts
    - livos/packages/livinityd/package.json
    - livos/pnpm-lock.yaml

key-decisions:
  - "stacks PG table holds ONLY git-backed stacks; YAML stacks remain filesystem-only (no PG row, no migration churn)"
  - "Mutually exclusive deployStack input: either composeYaml OR git, never both — explicit validation error"
  - "Webhook endpoint is unauthenticated at cookie/JWT layer; security model IS the per-stack HMAC secret"
  - "Webhook responds 202 immediately and redeploys in fire-and-forget Promise to stay under GitHub's 10s webhook timeout"
  - "Blobless clone (--filter=blob:none) over isomorphic-git's full clone — minimal disk for sample stacks, fast pulls"
  - "AES key derived via SHA-256 of JWT secret (same as stack-secrets.ts) — single source of truth for at-rest encryption"
  - "decryptCredentialData is internal-only; encrypted_data NEVER returned by list/get/CRUD APIs"

patterns-established:
  - "Pattern: PG-row-when-needed — schema rows only exist when extra metadata is required (git-backed stacks); legacy paths stay zero-DB-touch"
  - "Pattern: ephemeral credential injection via tmpdir() temp files cleaned up in finally{} — no plaintext on disk after the operation"

requirements-completed: [GIT-01, GIT-02, GIT-03]

# Metrics
duration: 6min
completed: 2026-04-24
---

# Phase 21 Plan 01: GitOps Backend (Schema + Git Module + DeployStack + Webhook) Summary

**Backend infrastructure for git-pinned compose stacks: PG schema for git-backed stacks, AES-256-GCM credentials, simple-git blobless clone/pull, deployStack git path, and HMAC-SHA256-verified webhook endpoint that responds 202 and redeploys in background.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-24T23:50:33Z
- **Completed:** 2026-04-24T23:56:07Z
- **Tasks:** 4 / 4
- **Files modified:** 7 (2 new + 5 modified, plus package.json + lockfile)

## Accomplishments

- New `git_credentials` and `stacks` PG tables with idempotent `IF NOT EXISTS` create blocks; `git_credentials.encrypted_data` is AES-256-GCM (same JWT-keyed pattern as `stack-secrets.ts`).
- `git-deploy.ts` blobless clone/pull module: `--filter=blob:none --depth=1 --single-branch --branch <X>`, with HTTPS auth via temp `GIT_ASKPASS` shell script and SSH auth via temp keyfile (both cleaned up in finally{}).
- `deployStack` extended with optional `git: {url, branch, credentialId, composePath}` input, mutually exclusive with `composeYaml`. Git path generates a 64-hex `webhook_secret`, persists a row in `stacks`, copies the compose file into `/opt/livos/data/stacks/<name>/`, and runs the existing compose-up code (no fork). YAML path is byte-for-byte unchanged.
- `POST /api/webhooks/git/:stackName` registered before the tRPC handler and catch-all routes. Verifies `X-Hub-Signature-256: sha256=<hex>` via `crypto.timingSafeEqual` (length-checked first) and responds 202 immediately; redeploy fires in a background Promise (`syncRepo` -> if HEAD changed -> `copyComposeToStackDir` -> `controlStack('pull-and-up')` -> `updateGitStackSyncSha`).
- 3 new admin-only tRPC routes (`docker.listGitCredentials`, `docker.createGitCredential`, `docker.deleteGitCredential`) added to `httpOnlyPaths` to avoid the documented WS-mutation hang issue.
- `removeStack` extended to clean up `/opt/livos/data/git/<name>` working tree + `DELETE FROM stacks` row, both best-effort.

## Task Commits

Each task was committed atomically:

1. **Task 1: schema + simple-git install** — `fa38cc71` (feat)
2. **Task 2: git-credentials module + tRPC routes** — `67db624b` (feat)
3. **Task 3: git-deploy module + extend deployStack** — `4f11adf7` (feat)
4. **Task 4: GitOps webhook endpoint** — `49ea6fdb` (feat)

## Files Created/Modified

- `livos/packages/livinityd/source/modules/docker/git-credentials.ts` (new) — AES-256-GCM crypto + PG CRUD; mirrors `stack-secrets.ts`. encrypted_data never exposed via API.
- `livos/packages/livinityd/source/modules/docker/git-deploy.ts` (new) — simple-git blobless clone/pull, HEAD sync detection, compose copy, ephemeral HTTPS/SSH auth.
- `livos/packages/livinityd/source/modules/database/schema.sql` — append `git_credentials` + `stacks` CREATE TABLE blocks with indexes (idempotent).
- `livos/packages/livinityd/source/modules/docker/stacks.ts` — add `StackGitInput` type, extend `deployStack` (composeYaml now optional, mutually exclusive with git), add `getGitStack`/`listGitStacks`/`updateGitStackSyncSha` helpers, extend `removeStack` cleanup.
- `livos/packages/livinityd/source/modules/docker/routes.ts` — extend `deployStack` zod schema with `git` input + new error mappings, 3 new admin routes for git credentials CRUD.
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — add 3 new git-credential routes to `httpOnlyPaths`.
- `livos/packages/livinityd/source/modules/server/index.ts` — register `/api/webhooks/git/:stackName` (express.raw + HMAC-SHA256 + 202+background redeploy) BEFORE `/trpc` handler and catch-all.
- `livos/packages/livinityd/package.json`, `livos/pnpm-lock.yaml` — add `simple-git@^3.27.0`.

## Decisions Made

- **PG row only for git-backed stacks.** YAML-only stacks stay filesystem-only at `/opt/livos/data/stacks/<name>/docker-compose.yml` — zero migration risk on upgrade, zero DB load for users who never use GitOps.
- **Webhook = unauthenticated route, HMAC = the auth.** Per-stack 32-byte (64-hex) webhook secret generated at deploy time, returned in `deployStack` response so the UI can copy it to clipboard. No cookie or JWT auth on the route.
- **202 + background redeploy.** Redeploy can take 10-60s for image pulls; we MUST ack the webhook before then or GitHub retries. Background errors are logged-only.
- **Length-check before `timingSafeEqual`.** Constant-time compare crashes on different-length buffers; we explicitly compare lengths and short-circuit to 401 first.
- **Blobless clone (`--filter=blob:none`) over isomorphic-git's full clone.** isomorphic-git is already in deps (used elsewhere) but doesn't support `--filter=blob:none` cleanly; system git CLI via simple-git is the right tool for this job.
- **HTTPS uses GIT_ASKPASS shell script (mode 0o700) and SSH uses temp key (mode 0o600), both cleaned up in `finally{}`.** No plaintext credential ever lives on disk after the clone/pull operation completes.
- **`git_credentials.user_id` is `UUID REFERENCES users(id) ON DELETE SET NULL`** — admin user deletion shouldn't orphan-cascade away credentials that other admins might still need.

## Deviations from Plan

None — plan executed exactly as written. All 4 task verifications passed on first run.

## Issues Encountered

- **Pre-existing repo-wide TypeScript errors** in `ai/routes.ts`, unrelated `server/index.ts` lines (lines 66, 167, 634, 772, 1570 — all asyncHandler / Apps type issues that pre-date this plan). Per plan success criteria (and 17-01 / 20-01 SUMMARYs), these are out of scope. Touched files (`git-credentials.ts`, `git-deploy.ts`, the new code in `stacks.ts`, `routes.ts`, the new webhook block in `server/index.ts`) report no new errors.

## User Setup Required

None for backend deploy. Smoke test on server4 (post-`git pull` + livinityd restart):

```bash
sudo -u postgres psql -d livos -c '\dt' | grep -E "stacks|git_credentials"
# Expect: stacks + git_credentials rows
sudo -u postgres psql -d livos -c '\d stacks' | head -20
# Expect: name, git_url, git_branch, git_credential_id, compose_path, webhook_secret, last_synced_sha, last_synced_at
```

End-to-end deploy (admin-authed):

```bash
curl -b "LIVINITY_SESSION=$JWT" -X POST http://localhost:3001/trpc/docker.deployStack \
  -H "Content-Type: application/json" \
  -d '{"name":"webhook-test","git":{"url":"https://github.com/livinity/sample-stack.git","branch":"main"}}'
# Expect: webhookSecret (64 hex chars) in response
```

Webhook verification:

```bash
SECRET=$(sudo -u postgres psql -d livos -tAc "SELECT webhook_secret FROM stacks WHERE name='webhook-test';")
PAYLOAD='{"ref":"refs/heads/main"}'
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')
curl -i -X POST http://localhost:3001/api/webhooks/git/webhook-test \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -H "Content-Type: application/json" -d "$PAYLOAD"
# Expect: 202 Accepted, redeploy fires in background (check logs)
```

## Next Phase Readiness

**Plan 21-02 unblocked.** All backend primitives are in place:

- UI can call `docker.listGitCredentials` / `createGitCredential` / `deleteGitCredential` (admin) for credential management.
- UI can call `docker.deployStack` with `git: {...}` input and receive `webhookSecret` to copy.
- UI can fetch git-backed stacks via `getGitStack` / `listGitStacks` (Plan 21-02 will add a tRPC route around these).
- Plan 20's `git_stack_sync` scheduler placeholder can now use `listGitStacks` + `syncRepo` + `copyComposeToStackDir` + `controlStack('pull-and-up')` to do real work (Plan 21-02 wires this).

---
*Phase: 21-gitops-stack-deployment*
*Plan: 21-01*
*Completed: 2026-04-24*

## Self-Check: PASSED

- All 9 created/modified files verified on disk
- All 4 task commits verified in git log: `fa38cc71`, `67db624b`, `4f11adf7`, `49ea6fdb`
