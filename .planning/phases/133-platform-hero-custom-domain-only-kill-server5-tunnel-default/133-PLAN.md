# Phase 133 — Custom-Domain-Only Hero + Wizard Auto-Register (Master)

> Status: PLANNED 2026-05-17 — manual write (`agents_installed: false`).
> Sacred SHA invariant: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
> on `liv/packages/core/src/sdk-agent-runner.ts`. Verify before/after
> every commit.

## Goal

Stop the platform from EVER displaying `${username}.livinity.io` as a
user's "computer URL" in the dashboard hero. Instead, the hero reads
from `custom_domains` (the user's chosen hybrid domain). Wizard
Generate auto-registers the chosen domain so the round-trip is closed
end-to-end.

Per user directive 2026-05-17: *"Hiç bir şekilde Server5'deki tunnel'i
kullansın istemiyorum"*.

## Sub-plans

| # | Plan | Bug | Files | autonomous |
|---|------|-----|-------|------------|
| 1 | 133-01 | A (wizard auto-register) + C (subdomain pre-fill) | Server5 `/opt/platform/web/src/app/api/account/api-keys/route.ts` (Bug A handler) + `/opt/landing/livinity.io/dashboard-install.html` (Bug A fetch body + Bug C HybridStep pre-fill) + pm2 restart web | true |
| 2 | 133-02 | B (hero) + lucylu hotfix | Server5 `/opt/landing/livinity.io/dashboard.html` + DB INSERT for lucylu | false (needs operator to confirm lucylu's chosen domain) |
| 3 | 133-03 | UAT (Flows A/B/C/D — D covers Bug C subdomain pre-fill) | Operator-walked fresh-user verify | false |

Plans 133-01 and 133-02 are file-disjoint and can ship in parallel.
Both are Server5 on-server canonical (same shape as 132-01 and 132-02).

## Order of execution

1. **Wave 1 (parallel-safe):** 133-01 (platform API) + 133-02 (static
   HTML + lucylu data hotfix). File-disjoint, no deps.
2. **Wave 2 (operator):** 133-03 — fresh-user end-to-end UAT once
   133-01 + 133-02 are live.

## Verification protocol (each plan)

1. Before edit: `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts`
   prints `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
2. Server5 on-server: `.bak-pre-133-XX-<timestamp>` written before any sed.
3. Patch applied via Python regex script with strict match-once guard
   (refuse if regex matches 0 or >1 times).
4. Static check: `grep -c "<new marker>" <file>` returns expected count.
5. For 133-01: `npm run build` succeeds, `pm2 restart web` → `online`,
   smoke-test the API endpoint returns expected shape.
6. For 133-02: hero URL renders custom_domain in browser walkthrough.
7. Sacred SHA after commit: same check.
8. Commit message: `fix(133/<area>): <one-line>` with
   `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

## Deployment after ship

After 133-01 and 133-02 land:

1. **133-01:** SSH applied + `cd /opt/platform/web && npm run build &&
   pm2 restart web` (mirror of 132-02 deploy).
2. **133-02:** SSH applied; no service restart required (static file
   re-read per request by Caddy file_server handler at `/opt/landing/livinity.io/`).
3. **lucylu hotfix:** included in 133-02 as a one-shot
   `INSERT INTO custom_domains` SQL (psql on Server5).

## Resume command after `/clear`

> "Phase 133 başla — Server5 tunnel kill + custom-domain-only hero.
>  Read 133-CONTEXT.md first. Run /gsd-execute-phase 133-01 (autonomous)
>  then 133-02 (needs operator to provide lucylu's chosen domain), then
>  surface 133-03 UAT for operator walk."
