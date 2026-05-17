# Phase 132 Context — Install.sh Hardening (UAT-Driven)

**Created:** 2026-05-16 after Mini PC reinstall UAT exposed 7 install-flow bugs.

## Why This Phase Exists

Phase 111 was marked `✅ CODE-COMPLETE 2026-05-13` but **never had a real
fresh-VPS UAT**. When the user (operating as a "customer") tried to
reinstall their Mini PC via the livinity.io install wizard, they hit
seven distinct bugs across the wizard UI, the install.sh dispatcher,
and the deploy step. Each bug is reproducible and would block any
new user from completing an install.

This phase ships the seven fixes as atomic commits + a final
**fresh-VPS end-to-end UAT** that proves the canonical one-liner
works without any manual intervention.

Per [feedback_milestone_uat_gate](feedback_milestone_uat_gate.md):
"Never declare milestone passed without UAT". Phase 111's
self-declared completion was wrong — this phase corrects that.

## The Seven Bugs

| # | Bug | Symptom | Repro |
|---|-----|---------|-------|
| 1 | `dashboard-install.html` uses `<script type="text/babel" data-type="module">` → Babel-standalone `targets.esmodules` config error | Wizard shows "Loading…" forever; console: `Uncaught t: .targets["esmodules"] must be a boolean, or undefined` | Open `https://livinity.io/dashboard/install` in any browser |
| 2 | `dashboard.html` has no nav link to `/dashboard/install` | User can't find the wizard; only first-run auto-redirect ever lands on it | Log into `https://livinity.io/dashboard` after first install, look for "Install" link |
| 3 | `emailVerified=false` returns 403 from `POST /api/account/api-keys`, but the platform has no email-verification delivery (no SMTP config) | New users can NEVER generate an API key, so wizard "Generate" button always 403s | Register new user on livinity.io, open wizard, click Generate |
| 4 | `scripts/install.sh` resolves helper files from `$PWD/scripts/install/` — when piped via `curl ... \| bash` from arbitrary directory, helpers are missing → `exit 2 "helper directory not found"` | Wizard's one-liner (`curl -fsSL https://livinity.io/install.sh \| sudo bash -s -- ...`) fails immediately on a fresh VPS | `curl -fsSL https://livinity.io/install.sh \| sudo bash -s -- --mode hybrid --domain x.example.com --cf-token X --cf-zone-id Y --api-key Z` from a clean root shell |
| 5 | `livos/pnpm-workspace.yaml` has `ignoredBuiltDependencies:` AND `livos/package.json` has `pnpm.onlyBuiltDependencies:` — pnpm 10 errors `ERR_PNPM_CONFIG_CONFLICT_BUILT_DEPENDENCIES: Cannot have both neverBuiltDependencies and onlyBuiltDependencies` | `pnpm install` fails mid-install, deploy aborts | `cd /opt/livos && pnpm install` after fresh clone |
| 6 | `scripts/install/deploy-livinityd.sh` clones LivOS source but does **not** run `npm install + npx tsc` for `/opt/liv/packages/{core,worker,mcp-server,memory}` → `/opt/liv/packages/core/dist/lib.js` is missing | `livos.service` boot fails with `ERR_MODULE_NOT_FOUND` for `@liv/core/dist/lib.js`, enters restart loop | Run install, then `systemctl status livos` → restart loop |
| 7 | After install completes, Caddy is left in `failed` state (from prior install attempts) and never `reset-failed` + `systemctl start caddy`-ed | TLS + DNS-01 wildcard cert acquired, Caddyfile valid, but HTTPS port 443 not bound — `https://bruce.<domain>` returns `HTTP 000` | Install on box where Caddy was previously failed, then `systemctl is-active caddy` → `failed` |

## On-Server Patches Already Applied (must back-port to repos)

During UAT triage I applied these as immediate fixes on Server5 (so
the user could continue). These need to be **back-ported to the
canonical source repos** as part of this phase:

- **Server5 `/opt/landing/livinity.io/dashboard-install.html`:**
  removed `data-type="module"` from the babel script tag.
  Backup at `dashboard-install.html.bak-pre-babel-fix`.
- **Server5 `/opt/landing/livinity.io/dashboard.html`:** inserted
  `<a href="/dashboard/install">Install</a>` after the existing
  Dashboard nav link. Backup at `dashboard.html.bak-pre-install-link`.
- **Server5 `/opt/platform/web/src/app/dashboard/page.tsx`:**
  inserted a "Set up new server" emerald button in the header. This
  edit was on the Next.js source but the live `/dashboard` is
  shadowed by the static `dashboard.html` (see Caddyfile static
  rewrites at lines 9-39), so the Next.js patch isn't user-visible
  yet. Either keep it (for when static rewrites are removed) or
  revert. **Decision**: revert in this phase — the static HTML is
  the canonical surface.
- **Mini PC `/opt/livos/pnpm-workspace.yaml`:** removed the
  `ignoredBuiltDependencies:` block. This is the Mini PC's local
  copy — the repo's canonical `pnpm-workspace.yaml` still has it.

## Source Repos Touched

- **`utopusc/livinity-io` (this repo):** bugs #4, #5, #6, #7 live here.
  - `scripts/install.sh` (bug #4)
  - `livos/pnpm-workspace.yaml` (bug #5)
  - `scripts/install/deploy-livinityd.sh` (bug #6)
  - `scripts/install/mode-hybrid.sh` or `deploy-livinityd.sh` (bug #7)
- **Server5 platform** (separate; live at `/opt/platform/web/` and
  `/opt/landing/livinity.io/`): bugs #1, #2, #3 live here.
  Need to find the canonical source repo for these (might be a
  separate `livinity-platform` repo, or the landing HTML files are
  hand-edited on Server5). **Plan 132-01 first task**: find the
  source repo for `/opt/landing/livinity.io/*.html` and commit there.

## Mini PC Current State (Half-Installed)

The user's Mini PC at `bruce@10.69.31.68` is mid-install:
- LivOS source at `/opt/livos` and `/opt/liv` (latest from GitHub)
- `livos.service` is `active` (we got it running via manual liv/ build)
- Caddy is `failed` (the bug #7 case — user needs to start it manually
  OR Phase 132-06 fix lands + re-deploy will start it)
- `bruce.livinity.live` DNS A → `192.168.20.33` (Mini PC LAN IP),
  resolved via Cloudflare
- LE wildcard cert acquired for `*.bruce.livinity.live`

**After Phase 132 ships**, user can re-run the (now-fixed) one-liner
on Mini PC for a CLEAN install, OR just `systemctl start caddy` to
finish the current state. Both should yield a working
`https://bruce.livinity.live`.

## Diagnostic Evidence

Reproductions captured during UAT session 2026-05-16:

```
# Bug #1 (browser console at /dashboard/install)
Uncaught t: .targets["esmodules"] must be a boolean, or undefined
    at SV (transform.ts:66:52)
    at FEe (index.ts:179:10)
    at transformScriptTags.ts:53:10

# Bug #3 (browser console at /dashboard/install after Generate)
POST https://livinity.io/api/account/api-keys 403 (Forbidden)
{"error":"Please verify your email before generating an API key"}

# Bug #5 (pnpm install on Mini PC)
ERR_PNPM_CONFIG_CONFLICT_BUILT_DEPENDENCIES  Cannot have both
neverBuiltDependencies and onlyBuiltDependencies
[WARN]  frozen-lockfile install failed; retrying without lockfile
ERR_PNPM_CONFIG_CONFLICT_BUILT_DEPENDENCIES  Cannot have both
[FAIL]  pnpm install failed

# Bug #6 (livos.service journalctl)
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'/opt/livos/packages/livinityd/node_modules/@liv/core/dist/lib.js'

# Bug #7 (Caddy)
× caddy.service - Caddy
     Active: failed (Result: exit-code) since Sun 2026-05-03
   (caddy validate says: Valid configuration  — config is fine,
    service just needs reset-failed + start after install)
```

## Acceptance Criteria

Final UAT (Plan 132-07): provision a **brand-new Ubuntu 24.04 VPS**
(Hetzner / Contabo / DigitalOcean — doesn't matter), get a CF token
+ zone for a fresh subdomain (e.g. `uat132.bruceoz.com`),
generate an API key via the wizard, paste the **one-liner exactly
as the wizard emits it** into a root shell.

Pass criteria:
- Install completes in ≤10 wall-clock minutes
- `systemctl is-active livos caddy` both return `active`
- `https://uat132.bruceoz.com` returns HTTP 200 with the LivOS UI
- The wildcard LE cert is valid (no browser warning)
- No manual on-server commands run
- No "run this first then the curl" workaround
- A NEW user (not bruce) can register on livinity.io, click
  "Generate API Key" in the wizard, and get a key without
  hitting 403 (i.e. bug #3 is properly resolved — either by
  enabling email delivery OR by removing the gate)

Fail criteria (any of these → phase NOT complete):
- Any error during install requiring manual intervention
- Wizard 403 for newly-created users
- HTTPS down after install completes
- LivOS UI not loadable in browser

## Sub-Plan Dependency Graph

```
132-01 (Server5 platform HTML fixes #1+#2) — autonomous, no deps
132-02 (Bug #3 email-verified bypass) — autonomous, no deps
132-03 (Bug #4 install.sh self-bootstrap) — autonomous, no deps
132-04 (Bug #5 pnpm config dedup) — autonomous, no deps
132-05 (Bug #6 deploy-livinityd.sh liv/ build) — autonomous, depends on 132-04
132-06 (Bug #7 Caddy reset+start) — autonomous, no deps
132-07 (Fresh-VPS UAT) — operator step, depends on ALL of 132-01..06
```

Plans 132-01 through 132-06 can ship in parallel (different files).
Plan 132-07 is sequential and operator-walked.

## Resume Command After /clear

> "phase 132 başla — install.sh hardening. CONTEXT at
>  .planning/phases/132-v34-install-sh-hardening-uat-driven-fixes-7-bugs-discovered-/132-CONTEXT.md
>  Run /gsd-execute-phase 132 to ship plans 01-06 in parallel,
>  then surface 132-07 UAT for operator walk."
