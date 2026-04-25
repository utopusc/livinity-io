---
phase: 21-gitops-stack-deployment
verified: 2026-04-24T00:00:00Z
status: passed
score: 11/11 must-haves verified
---

# Phase 21: GitOps Stack Deployment — Verification Report

**Phase Goal:** Deploy and auto-sync compose stacks from git repositories with HMAC-verified webhooks for CI/CD on push.
**Verified:** 2026-04-24
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Plan 21-01)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | PostgreSQL has a `stacks` table with all required columns | VERIFIED | schema.sql lines 193-206: name PK, git_url, git_branch, git_credential_id FK, compose_path, webhook_secret, last_synced_sha, last_synced_at, created_at, updated_at |
| 2  | PostgreSQL has a `git_credentials` table with id UUID PK, user_id FK, name, type check, encrypted_data, created_at | VERIFIED | schema.sql lines 175-185: all columns present, CHECK(type IN ('ssh','https')), UNIQUE(user_id,name) |
| 3  | `encrypted_data` is AES-256-GCM ciphertext keyed off JWT secret | VERIFIED | git-credentials.ts lines 23-35: SHA-256(jwt.trim()) -> 32-byte key; createCipheriv('aes-256-gcm'); base64(iv12+tag16+ct) |
| 4  | `deployStack` git path: clone blobless, copy compose, persist stacks row with random 64-hex webhook_secret, run compose up | VERIFIED | stacks.ts: cloneOrPull + copyComposeToStackDir called; randomBytes(32).toString('hex') webhook_secret; INSERT INTO stacks with ON CONFLICT UPDATE |
| 5  | POST /api/webhooks/git/:stackName verifies HMAC-SHA256 via timingSafeEqual; valid → 202 + background redeploy; invalid → 401 | VERIFIED | server/index.ts lines 1021-1100: express.raw body, x-hub-signature-256 header, length check + timingSafeEqual, 202 with fire-and-forget redeploy |
| 6  | simple-git used for clone/pull | VERIFIED | livinityd/package.json line 120: "simple-git": "^3.27.0"; node_modules/simple-git exists; git-deploy.ts line 7: import {simpleGit} from 'simple-git' |

### Observable Truths (Plan 21-02)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 7  | Stack form has YAML and Git tabs | VERIFIED | index.tsx line 2802: TabsTrigger value='git' with text "Deploy from Git"; Tabs wraps YAML+Git content |
| 8  | Git tab fields: URL, branch, credential picker, compose path | VERIFIED | index.tsx lines 2833/2844/2853/2864: all four fields present |
| 9  | Post-deploy webhook URL + secret displayed copyable | VERIFIED | index.tsx lines 2889-2940: showWebhookPanel conditional; navigator.clipboard.writeText; Copy buttons; secret in password input |
| 10 | gitStackSyncHandler is real (not placeholder) — iterates stacks PG, syncRepo, per-stack failures isolated | VERIFIED | jobs.ts lines 169-252: listGitStacks() called; per-stack try/catch; action:'redeployed'/'no-op'/'failed'; no placeholder text |
| 11 | git-stack-sync default enabled=true | VERIFIED | jobs.ts line 282: `{name: 'git-stack-sync', schedule: '0 * * * *', type: 'git-stack-sync', enabled: true}` |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `livos/packages/livinityd/source/modules/database/schema.sql` | VERIFIED | Both `git_credentials` and `stacks` CREATE TABLE IF NOT EXISTS blocks present |
| `livos/packages/livinityd/source/modules/docker/git-credentials.ts` | VERIFIED | Exports: createCredential, getCredential, listCredentials, deleteCredential, decryptCredentialData; AES-256-GCM with JWT key |
| `livos/packages/livinityd/source/modules/docker/git-deploy.ts` | VERIFIED | Exports: cloneOrPull, syncRepo, copyComposeToStackDir, readComposeFromRepo; GIT_ASKPASS and GIT_SSH_COMMAND auth paths |
| `livos/packages/livinityd/source/modules/docker/stacks.ts` | VERIFIED | StackGitInput, getGitStack, listGitStacks, updateGitStackSyncSha, git path in deployStack; removeStack cleans up git dir + PG row |
| `livos/packages/livinityd/source/modules/docker/routes.ts` | VERIFIED | deployStack zod schema has `git: z.object({url,branch,credentialId,composePath}).optional()`; listGitCredentials, createGitCredential, deleteGitCredential routes |
| `livos/packages/livinityd/source/modules/server/index.ts` | VERIFIED | Webhook at line 1021, before /trpc (1109) and catch-all (1222); express.raw; timingSafeEqual |
| `livos/packages/livinityd/source/modules/scheduler/jobs.ts` | VERIFIED | Real gitStackSyncHandler; enabled:true in DEFAULT_JOB_DEFINITIONS |
| `livos/packages/ui/src/routes/server-control/index.tsx` | VERIFIED | "Deploy from Git" tab, AddGitCredentialDialog, webhook URL display panel, credential picker |
| `livos/packages/ui/src/hooks/use-stacks.ts` | VERIFIED | DeployStackGitInput, DeployStackInput with `git?:`, lastDeployResult, clearLastDeployResult, webhookSecret captured in onSuccess |

---

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| git-deploy.ts cloneOrPull | simple-git binary | `simpleGit().clone(url, dir, ['--filter=blob:none','--depth=1','--branch',branch,'--single-branch'])` | WIRED |
| git-deploy.ts buildAuth | GIT_ASKPASS / GIT_SSH_COMMAND | decryptCredentialData → temp script (HTTPS) or temp keyfile (SSH) | WIRED |
| stacks.ts deployStack git path | git-deploy.cloneOrPull then copyComposeToStackDir then compose-up | cloneOrPull + copyComposeToStackDir called; shared compose-up code path continues | WIRED |
| server/index.ts webhook | stacks PG → git-deploy.syncRepo → controlStack('pull-and-up') | getGitStack lookup → HMAC verify → syncRepo → copyComposeToStackDir → controlStack → updateGitStackSyncSha | WIRED |
| git_credentials encrypted_data | JWT secret at /opt/livos/data/secrets/jwt | SHA-256 of jwt.trim() → AES-256-GCM key, same pattern as stack-secrets.ts | WIRED |
| git-stack-sync handler | stacks.listGitStacks() → per-stack syncRepo → controlStack('pull-and-up') | for loop over stacks; per-row try/catch; redeployed/no-op/failed tracking | WIRED |
| DeployStackForm Git tab submit | trpcReact.docker.deployStack.mutate({name, git:{...}}) | handleSubmit branches on tab==='git'; uses useStacks().deployStack() | WIRED |
| Credential picker | trpcReact.docker.listGitCredentials.useQuery() + createGitCredential.useMutation | credentialsQuery mapped into select options; AddGitCredentialDialog calls createGitCredential.useMutation | WIRED |
| Webhook URL display | deployStack response.webhookSecret + window.location.origin | lastDeployResult captured in onSuccess; showWebhookPanel uses it; navigator.clipboard.writeText on copy | WIRED |

---

### Requirements Coverage

| Requirement | Plan | Description | Status |
|-------------|------|-------------|--------|
| GIT-01 | 21-01 | Stack schema + git_credentials encrypted at rest | SATISFIED |
| GIT-02 | 21-01 | deployStack with git blobless clone | SATISFIED |
| GIT-03 | 21-01 | Webhook endpoint HMAC-SHA256 | SATISFIED |
| GIT-04 | 21-02 | UI "Deploy from Git" tab | SATISFIED |
| GIT-05 | 21-02 | Auto-sync via Phase 20 scheduler (real handler) | SATISFIED |

---

### Anti-Patterns Found

None blocking. No placeholder strings, no hardcoded empty returns, no TODO stubs in any of the 8 implementation files.

---

### Human Verification Required

#### 1. End-to-end Git Deploy Flow

**Test:** Navigate to Server Control > Stacks > Deploy Stack. Click "Deploy from Git" tab. Paste a public repo URL, click Deploy.
**Expected:** Form stays open showing green "Stack deployed" panel with webhook URL and secret; Copy buttons work.
**Why human:** Navigator.clipboard.writeText and visual panel rendering cannot be verified programmatically.

#### 2. Webhook Trigger on Live Server

**Test:** Use the webhook secret from a deployed stack and send a signed POST to `/api/webhooks/git/:stackName`.
**Expected:** 202 response; background redeploy runs; logs show SHA transition.
**Why human:** Requires a live server with git binary, network access to a git host, and Docker.

#### 3. Existing Server git-stack-sync Enable Note

**Test:** On server4 (existing install), verify `SELECT enabled FROM scheduled_jobs WHERE name='git-stack-sync'` returns false (seed used ON CONFLICT DO NOTHING). Manual UPDATE required.
**Expected:** Operator must run `UPDATE scheduled_jobs SET enabled=true WHERE name='git-stack-sync'` on existing installs.
**Why human:** Server-side DB state — not verifiable from codebase alone.

---

## Summary

All 11 must-have truths verified against the actual codebase. All 9 artifacts exist and are substantive (not stubs). All 9 key links are wired. No anti-patterns. GIT-01 through GIT-05 are fully satisfied. The only items requiring human verification are runtime/UI behaviors (clipboard, live webhook, existing-server DB state).

---

_Verified: 2026-04-24_
_Verifier: Claude (gsd-verifier)_
