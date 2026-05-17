# Phase 132 — Install.sh Hardening (Master)

> Status: PLANNED 2026-05-16 — manual write (GSD subagents not installed
> in this project; planner orchestrator skipped per `agents_installed: false`).
> Sacred SHA invariant: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on
> `liv/packages/core/src/sdk-agent-runner.ts`. Verify before/after every commit.

## Goal

Make the canonical `curl -fsSL https://livinity.io/install.sh | sudo bash -s -- ...`
one-liner **JUST WORK** on a fresh Ubuntu 24.04 VPS, without any manual
intervention. Seven bugs were discovered during a real-customer UAT
on 2026-05-16; each gets a focused fix commit, then a final
fresh-VPS end-to-end test proves the install path is shippable.

Per the [feedback_milestone_uat_gate](../../../memory/feedback_milestone_uat_gate.md)
preference: never declare a phase passed without real UAT. Phase 111
was marked CODE-COMPLETE without UAT — this phase corrects that gap.

## Sub-plans

| # | Plan | Bug | Files | autonomous |
|---|------|-----|-------|------------|
| 1 | 132-01 | #1 + #2 (Server5 platform HTML) | `dashboard-install.html`, `dashboard.html` in the platform repo | true |
| 2 | 132-02 | #3 (emailVerified gate) | `/api/account/api-keys/route.ts` + UI hint | true |
| 3 | 132-03 | #4 (install.sh self-bootstrap) | `scripts/install.sh` | true |
| 4 | 132-04 | #5 (pnpm config conflict) | `livos/pnpm-workspace.yaml` | true |
| 5 | 132-05 | #6 (liv/ build step) | `scripts/install/deploy-livinityd.sh` | true |
| 6 | 132-06 | #7 (Caddy start) | `scripts/install/mode-hybrid.sh` or `deploy-livinityd.sh` | true |
| 7 | 132-07 | UAT walk | fresh VPS, operator-walked | false |

Plans 132-01 through 132-06 are file-disjoint and can ship in parallel.

## Order of execution

1. **Wave 1 (parallel)**: 132-01, 132-02, 132-03, 132-04, 132-06 — file-disjoint, no deps.
2. **Wave 2**: 132-05 (depends on 132-04 because the deploy script needs the
   pnpm config fix to land first; otherwise its `pnpm install` step blows up).
3. **Wave 3 (operator)**: 132-07 — fresh-VPS UAT once 132-01..06 are deployed
   to Server5 (so the wizard serves the fixed `install.sh`).

## Verification protocol (each plan)

1. Before edit: `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts`
   prints `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
2. Type-check: where applicable, `npx tsc --noEmit -p .` produces no NEW errors.
3. Shell scripts: `bash -n` syntax check passes.
4. Sacred SHA after commit: same check.
5. Commit message: `fix(132/<area>): <one-line>` with trailing
   `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

## Deployment after ship

After 132-01..06 land in repo:

1. **Server5 platform** redeploy:
   - For HTML fixes (#1, #2): rsync `dashboard.html` + `dashboard-install.html`
     to `/opt/landing/livinity.io/`. No Caddy reload needed (static files
     are re-read per request).
   - For email-verified bypass (#3): rebuild + `pm2 restart web`.
2. **Repo install.sh** (#4): commit + push to `utopusc/livinity-io`.
     `https://livinity.io/install.sh` is served from Server5's clone of
     this repo OR fetched live from GitHub — verify which (see Plan 132-03
     for the path). Pull + reload as appropriate.
3. **Repo pnpm config + deploy-livinityd.sh + mode-hybrid.sh** (#5, #6, #7):
     commit + push. New `curl | bash` runs will pick up the fix automatically
     (these helpers are fetched as part of the install flow).

## Resume command after `/clear`

> "Phase 132 başla — install.sh hardening UAT-driven fixes. Read
>  .planning/phases/132-v34-install-sh-hardening-uat-driven-fixes-7-bugs-discovered-/132-CONTEXT.md
>  first for the 7 bugs and on-server patches already applied. Run
>  /gsd-execute-phase 132 to ship 132-01..06 in parallel waves, then
>  surface 132-07 UAT for operator walk on fresh VPS."
