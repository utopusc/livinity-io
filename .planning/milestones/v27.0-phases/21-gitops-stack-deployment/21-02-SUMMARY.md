---
phase: 21-gitops-stack-deployment
plan: 02
subsystem: ui-and-scheduler
tags: [gitops, ui, tabs, credential-picker, webhooks, scheduler, react, trpc]

# Dependency graph
requires:
  - phase: 21-gitops-stack-deployment
    provides: stacks PG table + listGitStacks/syncRepo/copyComposeToStackDir/updateGitStackSyncSha helpers + git_credentials tRPC routes + deployStack git input + webhook endpoint (Plan 21-01)
  - phase: 20-scheduled-tasks-backup
    provides: scheduler/jobs.ts BUILT_IN_HANDLERS registry + DEFAULT_JOB_DEFINITIONS seed + git-stack-sync placeholder slot
provides:
  - Real `gitStackSyncHandler` iterating listGitStacks() — per-stack syncRepo + redeploy on HEAD change; per-stack failures isolated
  - DEFAULT_JOB_DEFINITIONS git-stack-sync flipped to enabled=true (fresh installs only — existing PG rows untouched by ON CONFLICT DO NOTHING)
  - DeployStackForm Tabs UI: 'Deploy from YAML' (existing) | 'Deploy from Git' (new — URL/branch/compose-path/credential picker)
  - AddGitCredentialDialog nested dialog for inline HTTPS/SSH credential creation
  - Webhook URL + secret display panel after successful git deploy with copy-to-clipboard buttons
  - useStacks hook: DeployStackInput / DeployStackGitInput types + lastDeployResult / clearLastDeployResult state surface
affects: [21-gitops-stack-deployment, v27.0-milestone-close]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern: form-stays-open-on-success — git deploy holds the form open until user clicks Done so the one-time webhook secret can be copied (it's never retrievable via API afterward)"
    - "Pattern: nested-dialog inline resource creation — AddGitCredentialDialog inside DeployStackForm avoids the navigate-away-then-come-back UX trap"
    - "Pattern: tab-aware form validation — disabled Deploy button rule branches on active tab (gitUrl required vs composeYaml required)"
    - "Reuse: per-target try/catch loop with action enum ('redeployed'|'no-op'|'failed') from container-update-check (Plan 20-01) — one bad target doesn't tank the whole hourly job"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/scheduler/jobs.ts
    - livos/packages/ui/src/hooks/use-stacks.ts
    - livos/packages/ui/src/routes/server-control/index.tsx

key-decisions:
  - "git-stack-sync flipped enabled:true at the seed level only; ON CONFLICT (name) DO NOTHING means existing PG installs (e.g., server4 booted Phase 20) keep their previously-disabled row — operators must manually flip it via Settings > Scheduler UI or SQL"
  - "Form stays open after a successful git deploy until the user clicks Done — webhook secret is shown only once at deploy time and is never retrievable via list/get APIs (encrypted_data isn't exposed); auto-closing would lose it"
  - "Edit mode stays YAML-only in v1 — switching a YAML stack to git (or vice versa) requires backend extension of editStack which is out of scope; remove + redeploy is the v1 escape hatch"
  - "Git credential picker is a plain <select> not Combobox — credential lists are short (most users will have 1-2) and the inline 'Add credential' button covers the create flow without a separate command palette"
  - "Per-stack failures in gitStackSyncHandler are caught and recorded with action:'failed' — the overall job still returns status:'success' so a single bad repo (network error, deleted credential) can't block the hourly cron from processing the rest"
  - "Catastrophic failures (listGitStacks throws because PG is down) bubble up as status:'failure' with the error string — distinguishes infrastructure outage from per-stack issues in scheduler run history"

patterns-established:
  - "Pattern: Tabs primitive wrapping divergent input modes (YAML vs git) inside a shared form — stack name + env vars stay outside the tabs since they apply to both paths. Reusable for any future 'multiple ways to specify the same resource' form (e.g., container create from image vs Dockerfile build)"
  - "Pattern: hook-level lastResult state slot — useStacks stores lastDeployResult so a follow-on UI panel can render the response asynchronously without forcing the form to use the mutation directly. Generalizable to any post-mutation success-display UX"

requirements-completed: [GIT-04, GIT-05]

# Metrics
duration: 4min
completed: 2026-04-25
---

# Phase 21 Plan 02: UI Git Tab + Auto-Sync Handler Summary

**User-visible GitOps surface area: a 'Deploy from Git' tab in the stack create dialog with credential picker + post-deploy webhook URL display, plus the real hourly auto-sync scheduler handler that closes the GIT-04 + GIT-05 loop and ships v27.0's GitOps milestone.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-24T23:59:49Z
- **Completed:** 2026-04-25T00:03:58Z
- **Tasks:** 2 / 2
- **Files modified:** 3 (no new files)

## Accomplishments

- Replaced the Phase 20 `gitStackSyncHandler` placeholder with a real implementation that loops `listGitStacks()` and runs the canonical `syncRepo → if changed → copyComposeToStackDir + controlStack('pull-and-up') + updateGitStackSyncSha` 4-step recipe per stack. Per-stack errors are caught and recorded with `action: 'failed'` so one bad repo can't tank the hourly run; catastrophic failures (DB down) bubble up as `status: 'failure'`.
- Flipped `DEFAULT_JOB_DEFINITIONS` git-stack-sync from `enabled: false` to `enabled: true` — fresh installs now auto-sync hourly without operator action. Existing PG installs (server4) keep their previous `enabled: false` row because `seedDefaults` uses `ON CONFLICT (name) DO NOTHING`.
- Extended `DeployStackForm` with a Tabs primitive splitting "Deploy from YAML" (existing) and "Deploy from Git" (new). Git tab exposes URL, branch, compose-path, and a credential `<select>` populated by `docker.listGitCredentials`. Stack name and env vars stay outside the tabs (shared between both paths).
- Built `AddGitCredentialDialog` — nested Dialog inside the form that creates an HTTPS-PAT or SSH-key credential via `docker.createGitCredential`. On success the new credential id is auto-selected in the picker, eliminating the navigate-away-then-come-back trap.
- After a successful git deploy, the form holds open and renders a green success panel with the auto-generated webhook URL (`${origin}/api/webhooks/git/${name}`) and the 64-hex secret, both in readonly inputs with Copy buttons. The user clicks Done to close (which also calls `onDeploySuccess` to refresh the stacks list). The secret is shown only once at deploy time — it can't be re-fetched, so auto-closing would lose it.
- Widened `useStacks().deployStack` input to optional `composeYaml` + optional `git` discriminator and added a `lastDeployResult` state slot so the form can render the webhook panel asynchronously after `onSuccess` fires.

## Task Commits

Each task was committed atomically:

1. **Task 1: real gitStackSyncHandler + flip default to enabled=true** — `9110e4ab` (feat)
2. **Task 2: UI Git tab + credential picker + webhook URL display** — `f0902cfb` (feat)

## Files Created/Modified

- `livos/packages/livinityd/source/modules/scheduler/jobs.ts` — replace placeholder gitStackSyncHandler with real impl (~80 lines); add imports of `listGitStacks`/`updateGitStackSyncSha`/`controlStack`/`syncRepo`/`copyComposeToStackDir`; flip `DEFAULT_JOB_DEFINITIONS['git-stack-sync'].enabled` to `true`.
- `livos/packages/ui/src/hooks/use-stacks.ts` — export `DeployStackGitInput` + `DeployStackInput` types; widen `deployStack`/`editStack` input types; add `lastDeployResult` + `clearLastDeployResult` state slot keyed off the mutation's `onSuccess(data, variables)` capturing `data.webhookSecret`.
- `livos/packages/ui/src/routes/server-control/index.tsx` — add `IconCheck` import; add 6 new useState slots in `DeployStackForm` for git tab state; fetch `listGitCredentials` when form open and not in edit mode; replace compose YAML block with conditional Tabs (only when `!isEditMode`); branch `handleSubmit` by active tab; add webhook URL display panel inside the git tab; add new `AddGitCredentialDialog` component; render the dialog inside `DeployStackForm`; widen footer Deploy button disabled rule to respect active tab.

## Decisions Made

- **`git-stack-sync` default flip is seed-only.** `DEFAULT_JOB_DEFINITIONS` change from `enabled: false` to `enabled: true` only affects fresh PG installs because `seedDefaults` uses `INSERT … ON CONFLICT (name) DO NOTHING`. Existing v27.0 servers (server4 already booted Phase 20) keep their previous disabled row — operators must run `UPDATE scheduled_jobs SET enabled=true WHERE name='git-stack-sync';` or flip it via the Settings > Scheduler UI shipped in Plan 20-02.
- **Form stays open after git deploy.** The webhook secret is shown only at deploy time. The `deployStack` response includes `webhookSecret`, but `getGitStack` / `listGitStacks` deliberately don't expose it (encrypted_data is internal). If the form auto-closed on success, the user would lose the secret with no recovery path. The Done button is the explicit "I've copied it" handoff.
- **Edit mode is YAML-only in v1.** Plan 21-01's `editStack` was not extended for git. The Tabs structure is conditionally rendered only when `!isEditMode` — edit mode shows the original single-textarea layout. v28.0 follow-up: extend `editStack` to accept either `composeYaml` or `git` (or allow toggling) so users can switch a stack between modes without remove+redeploy.
- **Per-stack failures isolated in scheduler.** A single repo with a stale credential or transient network error must not stop the hourly cron from processing the other 9 stacks. Per-stack `try/catch` + `action: 'failed'` + continue to next is the right shape; catastrophic failures (DB down) bubble up as `status: 'failure'` so operators can distinguish infrastructure problems from per-target issues in the run-history UI.
- **Plain `<select>` for credential picker, not Combobox.** Credential lists are short (most users will have 1-2). The inline "Add credential" button next to the select handles the creation flow without a separate command-palette pattern.
- **`DeployStackInput.composeYaml` made optional in the hook.** Required for the git path (where `composeYaml` is undefined and `git` is provided). The runtime check is at handleSubmit (`!gitUrl.trim()` for git, `!composeYaml.trim()` for YAML); the type system reflects "exactly one of composeYaml / git is required" via the `|`-style discriminator at the call site.

## Deviations from Plan

None — plan executed exactly as written. Both tasks committed atomically; Task 1 verification (jobs.ts string-match script) passed first try; Task 2 verification (UI string-match scripts + `pnpm --filter @livos/config build && pnpm --filter ui build`) passed first try with UI build exiting 0 in 37.3s.

## Issues Encountered

- **Pre-existing typecheck noise** unchanged from Plan 21-01: `ai/routes.ts` and `server/index.ts` lines 66/167/634/772/1570 (asyncHandler / Apps / livinityd-undefined patterns). Out of scope per scope-boundary rule. No new errors introduced by Plan 21-02 — touched files (`scheduler/jobs.ts`, `use-stacks.ts`, the new UI code in `server-control/index.tsx`) report no new TS errors. Build is the gating signal; UI build passed.

## Known Stubs

None. The webhook URL panel uses real data from `lastDeployResult.webhookSecret` (live from the mutation response) and `lastDeployResult.name` (echoed from the input). The credential picker is wired to live `listGitCredentials` data. The git-stack-sync handler iterates real `listGitStacks` rows.

## User Setup Required

**For fresh installs (new server):** No action required. `DEFAULT_JOB_DEFINITIONS['git-stack-sync'].enabled = true` means new PG installs will auto-sync hourly the moment livinityd boots.

**For existing v27.0 installs (server4 already booted Phase 20):** Manual one-time enable. The seed used `ON CONFLICT (name) DO NOTHING`, so the existing `enabled: false` row was preserved on Phase 20 deploy. Two options:

```bash
# Option A: Settings > Scheduler UI (shipped in Plan 20-02)
# Open the git-stack-sync row, toggle Enabled, Save.

# Option B: SQL
sudo -u postgres psql -d livos -c "UPDATE scheduled_jobs SET enabled=true WHERE name='git-stack-sync';"
# Then trigger reload (no restart needed):
curl -b "LIVINITY_SESSION=$JWT" -X POST http://localhost:3001/trpc/scheduler.reload \
  -H "Content-Type: application/json" -d '{}'
```

End-to-end UI smoke test on server4 (after `git pull` + `pm2 restart livos`):

1. Navigate to Server Control → Stacks → Deploy Stack. Verify two tabs: "Deploy from YAML" (default) and "Deploy from Git".
2. Click "Deploy from Git". Verify fields: URL, Branch (placeholder 'main'), Compose File Path (placeholder 'docker-compose.yml'), Credential picker (default '— None (public repo) —').
3. Click "Add credential". Verify HTTPS / SSH toggle; submit a test HTTPS credential. Verify it auto-selects in the picker.
4. Submit a public git deploy. Verify the green success panel appears with copyable webhook URL + secret. Verify Done button closes the form.
5. Confirm `SELECT name, webhook_secret FROM stacks` matches the secret shown in the UI.

End-to-end auto-sync smoke test (with at least one git stack present):

```bash
# Trigger via tRPC scheduler.runNow with the git-stack-sync job id
JOB_ID=$(sudo -u postgres psql -d livos -tAc "SELECT id FROM scheduled_jobs WHERE name='git-stack-sync';")
curl -b "LIVINITY_SESSION=$JWT" -X POST http://localhost:3001/trpc/scheduler.runNow \
  -H "Content-Type: application/json" -d "{\"id\":\"$JOB_ID\"}"
sudo -u postgres psql -d livos -c "SELECT last_run_status, last_run_output FROM scheduled_jobs WHERE name='git-stack-sync';"
# Expect last_run_output: {"checked": N, "redeployed": M, "results": [{name, oldSha, newSha, action}, ...]}
```

## Next Phase Readiness

**v27.0 GitOps milestone closed.** All five GIT-* requirements satisfied across Phase 21:

- GIT-01 (PG schema + AES-256-GCM credentials) — Plan 21-01
- GIT-02 (deployStack git path + simple-git blobless clone) — Plan 21-01
- GIT-03 (HMAC-verified webhook endpoint with 202+background redeploy) — Plan 21-01
- GIT-04 (UI Tabs in stack create dialog + credential picker + webhook URL display) — Plan 21-02 (this plan)
- GIT-05 (auto-sync scheduler handler hourly) — Plan 21-02 (this plan)

**v28.0 follow-up items captured:**

- Extend `editStack` to accept either `composeYaml` or `git` so users can switch a stack between modes without remove+redeploy.
- Surface git-backed stacks visually in the Stacks tab (badge on rows that have a `stacks` PG row + last-synced timestamp).
- Webhook secret rotation UI (regenerate secret + show new value, invalidate old).
- Optional: switch the credential picker to a Combobox once average user credential count exceeds 5 (instrumentation TBD).

---
*Phase: 21-gitops-stack-deployment*
*Plan: 21-02*
*Completed: 2026-04-25*

## Self-Check: PASSED

- All 3 modified files verified on disk
- All 2 task commits verified in git log: `9110e4ab`, `f0902cfb`
