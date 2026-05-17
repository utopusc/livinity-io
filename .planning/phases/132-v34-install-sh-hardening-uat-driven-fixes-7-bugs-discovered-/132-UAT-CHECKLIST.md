# Phase 132 — UAT Checklist (Fresh VPS Install)

**UAT TARGET: FRESH VPS** (operator-provisioned Ubuntu 24.04, no LivOS history).

This checklist is the gate that flips Phase 132 from CODE-COMPLETE to
SHIPPED. Walk it end-to-end on a brand-new VPS. Mark each row PASS or
FAIL. If any row FAILS → copy failing rows into `132-UAT-FAILURES.md`,
open a 132.x hotfix sub-plan, do NOT mark the phase shipped.

## Pre-flight

| # | Action | PASS | FAIL |
|---|--------|:----:|:----:|
| P1 | Provision fresh Ubuntu 24.04 VPS (record provider + IP + sudo creds) | ☐ | ☐ |
| P2 | Verify SSH root login works (no LivOS state anywhere on disk) | ☐ | ☐ |
| P3 | Cloudflare API token created (Zone:DNS:Edit scope on chosen zone) | ☐ | ☐ |
| P4 | Subdomain chosen + zone ID recorded (e.g. `uat132.bruceoz.com`) | ☐ | ☐ |
| P5 | livinity.io platform user logged in, can reach `/dashboard` | ☐ | ☐ |

## Wizard walk (tests Bugs #1, #2, #3)

| # | Action | Expected | PASS | FAIL |
|---|--------|----------|:----:|:----:|
| W1 | Navigate to `https://livinity.io/dashboard` | Dashboard loads, "Install" link visible in nav (Bug #2 closed) | ☐ | ☐ |
| W2 | Click "Install" | Wizard loads within 5s, no babel errors in DevTools console (Bug #1 closed) | ☐ | ☐ |
| W3 | Select Hybrid mode; fill domain / cf-token / cf-zone-id | Step 2 renders correctly, no JS errors | ☐ | ☐ |
| W4 | Click "Generate API Key" | API key returned, install command displayed (Bug #3 closed) | ☐ | ☐ |
| W5 | Copy the install one-liner from the wizard | Clipboard contains valid `curl -fsSL https://livinity.io/install.sh \| sudo bash -s -- ...` with all 5 flags | ☐ | ☐ |

## Install run (tests Bugs #4, #5, #6, #7)

Paste the wizard's one-liner verbatim into the fresh VPS root shell at `/root`.

| # | Action | Expected | PASS | FAIL |
|---|--------|----------|:----:|:----:|
| I1 | Paste one-liner into VPS root shell at `/root` | "Self-bootstrap: downloading helpers from …" log line appears + install proceeds (Bug #4 closed) | ☐ | ☐ |
| I2 | Observe pnpm install step | No `ERR_PNPM_CONFIG_CONFLICT_BUILT_DEPENDENCIES` (Bug #5 closed) | ☐ | ☐ |
| I3 | Observe liv/ build step | `Building @liv/core (tsc)...` / `@liv/core built` log lines visible (Bug #6 build phase) | ☐ | ☐ |
| I4 | Observe `Phase 132-05` import-path verify step | Either `@liv/core/dist/lib.js exists at resolved path` OR auto-recovery rsync runs and succeeds — never `fail` (Bug #6 verify phase) | ☐ | ☐ |
| I5 | Observe livos.service start | `livos.service active after Ns` log line (1 ≤ N ≤ 30) | ☐ | ☐ |
| I6 | Observe Caddy start | `Caddy active after Ns` log line (1 ≤ N ≤ 30) (Bug #7 closed) | ☐ | ☐ |
| I7 | Install completes with OK banner | Final OK banner, no `fail` errors, ≤ 10 wall-clock minutes total | ☐ | ☐ |

## Post-install verification

| # | Action | Expected | PASS | FAIL |
|---|--------|----------|:----:|:----:|
| V1 | `systemctl is-active livos caddy` | Both `active` | ☐ | ☐ |
| V2 | `journalctl -u livos -n 20 --no-pager \| grep -i "ERR_MODULE_NOT_FOUND"` | No matches (Bug #6 not present) | ☐ | ☐ |
| V3 | Open `https://<subdomain>/` in browser | LivOS UI loads, valid LE wildcard cert (no browser warning) | ☐ | ☐ |
| V4 | Complete the LivOS onboarding flow in the UI | Setup wizard completes; can log in as the new admin user | ☐ | ☐ |
| V5 | Register an **additional** user on livinity.io (different from your existing account), open wizard, click "Generate" | API key returned without 403 (Bug #3 final independent check) | ☐ | ☐ |

## Bug-by-bug reproduction recheck

After install completes, re-run each of the 7 original UAT
reproductions from `132-CONTEXT.md` and verify each NO LONGER
triggers the failure.

| Bug | Repro recheck | PASS | FAIL |
|-----|---------------|:----:|:----:|
| #1 | Open wizard in browser, watch DevTools console | No `targets["esmodules"] must be a boolean` error | ☐ | ☐ |
| #2 | Visit `/dashboard`, look for Install link | Link present and clickable | ☐ | ☐ |
| #3 | New unverified user → Generate API Key | Returns 200 with `liv_k_*` token (not 403) | ☐ | ☐ |
| #4 | `curl -fsSL https://livinity.io/install.sh \| bash -s -- --help` from `/tmp/empty-$$` | Self-bootstrap log + help banner, exit 0 (not exit 2) | ☐ | ☐ |
| #5 | `cd /opt/livos && pnpm install --dry-run 2>&1 \| grep -i CONFLICT` | Empty output (no conflict) | ☐ | ☐ |
| #6 | `ls /opt/livos/packages/livinityd/node_modules/@liv/core/dist/lib.js` | File exists | ☐ | ☐ |
| #7 | `systemctl is-active caddy` after install | Returns `active` (not `failed`) | ☐ | ☐ |

## Sacred SHA + repo hygiene

| # | Check | Expected | PASS | FAIL |
|---|-------|----------|:----:|:----:|
| S1 | `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts` on local dev repo | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ☐ | ☐ |
| S2 | Same check on the deployed VPS: `cd /opt/liv && git ls-tree HEAD packages/core/src/sdk-agent-runner.ts` (if repo is cloned) | Same SHA | ☐ | ☐ |
| S3 | No on-server hand-patches required to complete the install | True | ☐ | ☐ |

## Verdict

- **If ALL boxes PASS:**
  - Flip `phase_132_status` in `.planning/STATE.md` to `SHIPPED`
  - Append commit hashes to `.planning/PROJECT.md` `## Phase 132 commits` section
  - Write `memory/project_phase_132_complete.md` summarising the ship
    (follow the [project_phase_131_partial_state](../../../memory/project_phase_131_partial_state.md) pattern)
  - Commit the STATE + memory updates as `docs(132/uat): fresh-VPS install passed — Phase 132 SHIPPED`

- **If ANY box FAILS:**
  - Create `132-UAT-FAILURES.md` listing every failing row with diagnostic output
  - For each independent failure, open a `132.X-PLAN.md` hotfix sub-plan
  - Re-run this checklist after each hotfix lands

---

| Field | Value |
|-------|-------|
| OPERATOR NAME | ________________ |
| OPERATOR DATE | ________________ |
| VPS PROVIDER | ________________ |
| VPS PUBLIC IP | ________________ |
| SUBDOMAIN USED | ________________ |
| WALL-CLOCK INSTALL TIME | ________________ |
| GIT SHA AT TIME OF UAT (master) | ________________ |
| FINAL VERDICT (SHIPPED / FAILED) | ________________ |
