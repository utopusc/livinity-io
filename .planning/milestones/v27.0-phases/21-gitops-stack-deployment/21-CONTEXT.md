# Phase 21: GitOps Stack Deployment - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped)

<domain>
## Phase Boundary

Deploy and auto-sync compose stacks from git repositories with HMAC-verified webhooks for CI/CD on push.

**Scope:**
- Stack schema extension: git_url, git_branch, git_credential_id columns
- Encrypted git credentials table (PG) — same AES-256-GCM pattern from Phase 17/20
- deployStack with git: blobless clone (`git clone --filter=blob:none --depth=1`), copy compose, deploy
- Webhook endpoint `POST /api/webhooks/git/:stackName` with HMAC-SHA256 verification
- UI: "Deploy from Git" tab in stack create/edit; webhook secret auto-generated and copyable
- Auto-sync: hook into Phase 20's git-stack-sync scheduler

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- simple-git for git operations (well-supported, used in many projects)
- HMAC-SHA256 with timing-safe comparison
- Per-stack webhook secret (32 random bytes, hex-encoded)
- GitHub-style payload signature header `X-Hub-Signature-256`
- Auto-sync = Phase 20 scheduler git-stack-sync handler now wired (was placeholder)
- Credentials stored in `git_credentials` PG table (id, user_id, name, type=ssh|https, encrypted_data)

</decisions>

<specifics>
## Specific Ideas

**Plans (target 2):**
- Plan 21-01: Backend — schema extension, git module, deployStack git path, webhook endpoint
- Plan 21-02: UI — Deploy from Git tab + git_stack_sync handler implementation

</specifics>

<deferred>
## Deferred Ideas

- Multiple compose files per repo (compose-path picker beyond default) — v28.0
- GitLab/Bitbucket-specific webhook formats — v28.0 (GitHub format only for v27.0)
- SSH key generation in UI — v28.0 (paste only)

</deferred>
