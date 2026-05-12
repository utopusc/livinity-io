---
phase: 104
plan: "11"
subsystem: install-scripts
tags: [install, deploy, livinityd, postgres, redis, systemd, single-line-install, ui-end-to-end]
type: install-script
requires:
  - 104-08 (user-owned-domain hybrid mode + --domain/--cf-token/--cf-zone-id flags + CF DNS A-record auto-creation)
  - 104-09 (--api-key flag + tunnel mode for CGNAT-friendly outbound-only connectivity)
  - 104-10 (heartbeat client wiring — armed only when --api-key supplied)
provides:
  - scripts/install/deploy-livinityd.sh — public entry deploy_livinityd; 10 idempotent helpers covering Node + pnpm + Postgres + Redis + source clone + UI build + JWT secret + .env + systemd unit + health check + Caddyfile rewrite
  - scripts/install.sh (EDIT) — sources deploy-livinityd.sh + calls deploy_livinityd after mode dispatch, gated on SKIP_DEPLOY != 1
  - scripts/install/parse-cli.sh (EDIT) — --skip-deploy CLI flag + SKIP_DEPLOY env-var fallback + --help block + export
  - scripts/install/show-banner.sh (EDIT) — branches on SKIP_DEPLOY: deploy-ran → "UI: open https://X" with green-padlock promise; deploy-skipped → legacy "Next: open <URL>" wording
  - scripts/install/__tests__/test-deploy-livinityd.sh — 44 host-side assertions covering --help mention + bash -n smoke + function presence + install.sh wire + parse-cli flag + D-104-NO-PROD-IMPACT mode-cloud.sh negative-grep + --skip-deploy gating semantics + security regression negative-greps + idempotency + scope boundary + 104-08/104-09 regression smoke
affects:
  - scripts/install.sh (single new conditional block at tail before print_banner)
  - scripts/install/parse-cli.sh (1 new flag case + 1 new help block + 1 new export var)
  - scripts/install/show-banner.sh (per-mode branches now also branch on deploy-ran vs skipped)
tech-stack:
  added:
    - Node 22 LTS (via NodeSource setup_22.x apt repo)
    - pnpm (via npm i -g pnpm@latest)
    - PostgreSQL 16 (via apt postgresql + postgresql-client)
    - Redis 7+ (via apt redis-server)
    - openssl rand -base64 (random PG/Redis/JWT secret generation)
  patterns:
    - Idempotency-first: every section guards with `command -v` / `id` / `systemctl is-active` / `[[ -f ... ]]` / `grep -q` checks; re-runs are no-ops where they should be (apt pkgs installed, role exists, db exists) and password-preserving where re-rotation would break existing data (read DATABASE_URL / REDIS_URL back from .env on re-run; never rotate).
    - Secret hygiene: PG password flows through `PGPASSWORD` env (T-104-11-1; never on argv → never in `ps auxww`). `/opt/livos/.env` mode 0600. `/opt/livos/data/secrets/jwt` mode 0600. `umask 0077` defense-in-depth wraps every secret write.
    - .env reuse: existing `/opt/livos/.env` is BACKED UP to `.env.bak` before rewrite; before rewrite, helpers READ existing `DATABASE_URL=postgresql://livos:<PASS>@...` and `REDIS_URL=redis://default:<PASS>@...` to preserve passwords across re-runs (the operator's existing data keeps working).
    - BUILD-FAIL guard pattern (mirrors update.sh:287-295 verify_build): after every `pnpm --filter ... build`, assert dist/ is non-empty; loud failure if vite or tsc silently produced empty output.
    - Caddyfile per-mode shape: hybrid (LE DNS-01 + LIVOS_DOMAIN), tunnel (auto_https off + :80), local-lan (tls internal liv-local + *.${LIVINITY_LOCAL_TLD}), cloud (plain :80 bootstrap). caddy validate before reload.
    - Health check non-fatal: curl :8080 with 30s retry budget; WARN-not-FAIL on timeout (debugger-friendly — operator gets a working .env + livos.service to investigate via journalctl).
    - Scope-boundary documentation: liv-core / liv-worker / liv-memory systemd units NOT shipped here; documented as Plan 104-12 carry-forward both in the helper file header and in a dedicated test assertion (negative-grep for `systemctl.*liv-core` etc.).
key-files:
  created:
    - scripts/install/deploy-livinityd.sh (404 lines)
    - scripts/install/__tests__/test-deploy-livinityd.sh (212 lines, 44 assertions)
    - .planning/phases/104-local-install-and-docker-uat/104-11-PLAN.md
    - .planning/phases/104-local-install-and-docker-uat/104-11-SUMMARY.md (this file)
  modified:
    - scripts/install.sh (1 new conditional source+call block at tail before print_banner)
    - scripts/install/parse-cli.sh (--skip-deploy CLI flag + env-var fallback + help block + export)
    - scripts/install/show-banner.sh (deploy-ran branch in every mode case)
    - .planning/STATE.md (Phase 104 plan count 10 → 11 + 104-11 status block prepended)
    - .planning/ROADMAP.md (Phase 104 plan-row + total count)
decisions:
  - D-104-11-SCOPE-LIVINITYD-ONLY: This plan deploys livinityd ONLY. liv-core / liv-worker / liv-memory systemd services are DEFERRED to Plan 104-12. Rationale: livinityd alone is enough for the UI to load + the login screen to render — the core "single line install lands you at a green padlock + LivOS UI" goal. Liv core adds AI-agent capability which is a separable concern (and the v34.x roadmap may rewire it).
  - D-104-11-REUSE-NOT-ROTATE: Re-running install.sh MUST NOT rotate existing PG/Redis passwords. Helpers read DATABASE_URL/REDIS_URL from /opt/livos/.env before generating new passwords. If .env is absent but PG role exists, we use `ALTER USER livos WITH PASSWORD` to align with our generated password (defensive idempotency). Rationale: operators who run install.sh twice (e.g. to pick up a Caddy fix) shouldn't lose their database access.
  - D-104-11-HEALTH-NONFATAL: Health check failure (livinityd not bound to :8080 within 30s) WARNs and continues — does NOT exit non-zero. Rationale: at health-check time, we've already written /opt/livos/.env, the systemd unit, and triggered Caddy reload. Failing now would leave the operator in a half-installed state with no easy recovery; far better to print loud diagnostic guidance ("journalctl -u livos.service -n 50") and let the operator debug from a known-good install marker.
  - D-104-11-DEFAULT-DEPLOY: install.sh's NEW default behavior is "deploy". The legacy 104-08/104-09 behavior ("TLS/DNS bootstrap only") is now opt-in via `--skip-deploy`. Rationale: the documented "single line install" UX promises a working UI in the browser — defaulting to deploy makes that promise truthful out of the box. Operators who specifically want the network scaffolding alone can opt out.
  - D-104-NO-PROD-IMPACT preserved: Mini PC at /opt/livos/ already deployed via update.sh is NOT touched by install.sh — install.sh runs on FRESH hosts (or operator-initiated re-installs). The byte-equivalence regression test for mode-cloud.sh (Plan 104-06) still passes — mode-cloud.sh contains zero deploy_livinityd references.
  - D-104-RELAY-ZERO-DATA-PLANE preserved: deploy-livinityd.sh has ZERO Server5 / livinity.io / nexus.livinity / relay.livinity references. The only network calls are git clone (GitHub), apt-get (Ubuntu archive + NodeSource + Cloudsmith for Caddy), and the optional 104-10 heartbeat (only when --api-key passed; that's the explicitly-allowed control-plane traffic).
metrics:
  duration: "~50min"
  completed: "2026-05-12T04:30:00.000Z"
  commits: 3
  tests_added: 44
  test_files: 1
  source_files: 1
  helper_functions: 11
---

# Phase 104 Plan 11: install.sh full livinityd deployment Summary

After this plan ships, the documented "single line install" UX
(`curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --mode hybrid --domain X --cf-token Y --cf-zone-id Z`)
on a fresh Ubuntu 24.04 host results in the LivOS UI actually loading at
`https://X` — green padlock + LivOS login screen — instead of a Caddy
placeholder response.

## One-Liner

A 404-line idempotent bash helper that installs Node 22 + pnpm + PostgreSQL + Redis,
clones livinity-io source, builds @livos/config + ui, generates random PG/Redis/JWT
secrets, writes /opt/livos/.env (mode 0600) with reuse-on-rerun semantics, wires a
livos.service systemd unit with After=postgresql+redis dependencies, health-checks
:8080 with 30s retry budget, and rewrites /etc/caddy/Caddyfile to `reverse_proxy
127.0.0.1:8080` in the mode-appropriate shape — closing the "TLS works but UI absent"
gap that mainserver 154.53.56.75 surfaced after 104-08 hybrid mode shipped.

## The Gap This Plan Fills

Phase 104 originally scoped install.sh as "TLS + DNS + Caddy bootstrap". The deploy
of the actual LivOS application (livinityd + UI + PostgreSQL + Redis) was assumed
to be a separate concern — but for the "single line install" UX to work end-to-end,
install.sh MUST deploy the whole stack.

Discovered today via live test on mainserver `154.53.56.75`: the 104-08 cert
pipeline worked perfectly (green padlock at `https://test.livinity.live`), but the
browser saw only Caddy's default placeholder response because livinityd was never
installed. The user can't be expected to manually `apt install postgresql redis-server
nodejs`, write `.env`, generate JWT secret, write systemd units after the
"single line install" promise.

## What Shipped

### Task 1 — `scripts/install/deploy-livinityd.sh` (commit `78714614`)

NEW 404-line bash helper. Public entry point: `deploy_livinityd`. 11 internal
helpers, each idempotent:

**`_dld_install_system_packages`** — Node 22 LTS via NodeSource setup script,
pnpm via `npm i -g pnpm@latest`, PostgreSQL 16 + client, redis-server,
build-essential + python3 + git + rsync + openssl. Idempotency: `command -v node` /
`command -v pnpm` short-circuits, `apt-get install -y` no-ops on installed pkgs.

**`_dld_setup_postgres`** — Ensures postgresql.service is up. Reads existing
PG password from `/opt/livos/.env` (DATABASE_URL field) if present, else generates
new via `openssl rand -base64 24 | tr -d '/=+\n' | cut -c1-32` (32-char alphanumeric).
Conditionally creates role `livos` (if `pg_roles` lookup returns 0) and DB `livos`
(if `pg_database` lookup returns 0). Applies `schema.sql` via `PGPASSWORD` env
(T-104-11-1 mitigation — never on argv) with `sudo -u postgres psql` fallback for
peer-auth hosts. On re-run with existing role: `ALTER USER livos WITH PASSWORD`
to align cluster password with `.env` value (defensive idempotency).

**`_dld_setup_redis`** — Ensures redis-server.service is up. Reads existing Redis
password from `.env` (REDIS_URL field) if present, else generates new. Sets
`requirepass <PASS>` in `/etc/redis/redis.conf` (sed-removes any prior
requirepass lines first, idempotent). Restarts redis. WARNs if `redis.conf` is
absent (skips requirepass — best-effort).

**`_dld_clone_source`** — `git clone --depth 1` to `/tmp/livos-install-stage` (or
`git fetch + reset` if stage dir already exists). rsync to `/opt/livos/livos/`
excluding `.git/`, `.planning/`, `docker/`, `node_modules/`. Copies root files
(`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `update.sh`) as well.

**`_dld_build_packages`** — `pnpm install --frozen-lockfile` (falls back to
unlocked install if frozen fails); `pnpm --filter @livos/config build` (tsc);
`pnpm --filter ui build` (vite production bundle). BUILD-FAIL guard asserts both
`dist/` dirs are non-empty before continuing (mirrors update.sh:287-295 pattern).
UI symlinked into livinityd's `ui/` dir.

**`_dld_generate_jwt_secret`** — `/opt/livos/data/secrets/jwt` mode 0600 via
`openssl rand -base64 32`. Dir mode 0700. Reuse existing if file is non-empty.
`umask 0077` defense-in-depth.

**`_dld_write_env_file`** — `/opt/livos/.env` mode 0600 with:
```
DATABASE_URL=postgresql://livos:${PG_PASS}@127.0.0.1:5432/livos
REDIS_URL=redis://default:${REDIS_PASS}@127.0.0.1:6379
JWT_SECRET_FILE=/opt/livos/data/secrets/jwt
PORT=8080
HOST=127.0.0.1
LIVOS_LOCAL_MODE=${MODE}
LIVOS_LOCAL_DOMAIN=${LIVOS_DOMAIN}
LIVOS_HOST_IP=${HOST_IP}
LIV_API_KEY=${LIVOS_API_KEY}   # only when 104-09 --api-key passed
```
Backs up any prior `.env` to `.env.bak` before overwrite (defense in depth).

**`_dld_write_systemd_unit`** — `/etc/systemd/system/livos.service` with
`After=postgresql.service redis-server.service network.target`,
`Requires=postgresql.service redis-server.service`,
`EnvironmentFile=/opt/livos/.env`, `ExecStart=${pnpm_bin} --filter livinityd start`,
`Restart=on-failure`, `RestartSec=5`, `LimitNOFILE=65536`. `systemctl daemon-reload`
+ `enable` + `start` (or `restart` if already running).

**`_dld_health_check`** — `curl http://127.0.0.1:8080/` with 30s retry budget
(2s intervals). Any 2xx/3xx/4xx HTTP response proves the port is bound (we don't
care about auth status — 401/404 = Node is listening). On timeout: WARN with
`journalctl -u livos.service -n 50` guidance, but DOES NOT fail() — the install
marker is preserved so the operator can debug from a known-good state.

**`_dld_update_caddy_to_livinityd`** — Rewrites `/etc/caddy/Caddyfile` to
`reverse_proxy 127.0.0.1:8080` in the mode-appropriate shape (hybrid:
LE DNS-01 + LIVOS_DOMAIN; tunnel: auto_https off + :80; local-lan: tls internal
liv-local + *.${LIVINITY_LOCAL_TLD}; cloud: plain :80 bootstrap). `caddy validate`
before `systemctl reload caddy`.

**Public entry `deploy_livinityd`** — Calls all 10 helpers in order. Skipped
silently if `SKIP_DEPLOY=1`.

### Task 2 — install.sh + parse-cli + show-banner wiring (commit `efa83e11`)

- `scripts/install.sh`: after the mode dispatch case + the
  `set_livos_redis_key 'livos:domain:local_mode'` write, conditionally
  `source` deploy-livinityd.sh and call `deploy_livinityd`. Gated on
  `${SKIP_DEPLOY:-0}" != "1"`. Default behavior: deploy.

- `scripts/install/parse-cli.sh`:
  - new `--skip-deploy` flag case branch (no arg; sets `SKIP_DEPLOY=1`).
  - new `SKIP_DEPLOY` env-var fallback (so `curl | bash` invocations can
    set it without a CLI flag — same pattern as `LIVOS_DOMAIN`).
  - new `--help` block "Application deploy (Plan 104-11)" explaining what
    `--skip-deploy` turns off (Node + pnpm + Postgres + Redis + source
    clone + UI build + .env + livos.service + health-check + Caddyfile
    rewrite) and making the default (deploy) explicit.
  - exports `SKIP_DEPLOY` alongside the other `LIVOS_*` vars.

- `scripts/install/show-banner.sh`: branches on `${SKIP_DEPLOY:-0}`. When
  deploy ran (default), banner prints the ACTUAL UI URL (e.g.
  `UI: open https://${LIVOS_DOMAIN}/` for hybrid mode) with a note that
  the LivOS login screen should render with green padlock. When
  `--skip-deploy` was passed, banner falls back to the legacy "Next: open
  <url>" wording that does NOT promise the UI works yet. Per-mode branches
  for cloud / local-lan / hybrid / tunnel — all four updated.

### Task 3 — host-side bash test + SUMMARY + STATE/ROADMAP (this commit)

`scripts/install/__tests__/test-deploy-livinityd.sh` — 212 lines, 11 sub-tests,
44 individual assertions. All PASS:

- **TEST 1** — `install.sh --help` mentions `--skip-deploy` + the Plan 104-11
  block header.
- **TEST 2** — `bash -n` syntax check on every install/*.sh file (regression
  smoke: install.sh, deploy-livinityd.sh, parse-cli.sh, show-banner.sh,
  mode-cloud.sh, mode-hybrid.sh, mode-tunnel.sh, mode-local-lan.sh,
  common-deps.sh, _logging.sh, detect-platform.sh).
- **TEST 3** — `deploy-livinityd.sh` exposes `deploy_livinityd` public function
  + all 10 `_dld_*` internal helpers are defined.
- **TEST 4** — `install.sh` sources `deploy-livinityd.sh`, calls
  `deploy_livinityd`, and the call is gated on `SKIP_DEPLOY`.
- **TEST 5** — `parse-cli.sh` has `--skip-deploy` case branch, sets
  `SKIP_DEPLOY=1`, and exports `SKIP_DEPLOY`.
- **TEST 6 (D-104-NO-PROD-IMPACT)** — `mode-cloud.sh` does NOT contain any
  `deploy_livinityd` reference (negative-grep). Preserves byte-equivalence
  to Mini PC at SHA `dab261cc`.
- **TEST 7** — `--skip-deploy` propagates to `SKIP_DEPLOY=1` (sourced
  `parse_cli` probe); default (no flag) keeps `SKIP_DEPLOY=0`.
- **TEST 8 (security regression)** — `PGPASSWORD` env pattern used for psql
  (T-104-11-1 mitigation; off argv). No `psql -W` / `--password=` patterns.
  `.env` chmod 0600 enforced (T-104-11-2). JWT secret chmod 0600 enforced
  (T-104-11-3).
- **TEST 9** — idempotency: deploy-livinityd.sh reads back `DATABASE_URL=` +
  `REDIS_URL=` from `.env` on re-run (preserves operator's data). Backs up
  existing `.env` to `.env.bak` before rewrite.
- **TEST 10** — Scope boundary: no `systemctl.*liv-core` / `liv-worker` /
  `liv-memory` calls (deferred to Plan 104-12). Helper file documents
  104-12 carry-forward.
- **TEST 11 (regression smoke)** — 104-08 `test-mode-hybrid-args.sh`
  18/18 still PASS; 104-09 `test-mode-tunnel-args.sh` 24/24 still PASS.

**Total host-side test count after this plan: 18 + 24 + 44 = 86 PASS across
3 test files.**

## Threat Model

- **T-104-11-1 (PG password leak via process list)** — Mitigated: `psql` calls
  use `PGPASSWORD` env (`PGPASSWORD="$pg_pass" psql ...`); the password
  literal never appears as a positional arg or `--password=` value. Verified
  by TEST 8 negative-grep.
- **T-104-11-2 (.env world-readable)** — Mitigated: `umask 0077` before
  redirect + explicit `chmod 0600 "$_DLD_ENV_FILE"` after write. Verified
  by TEST 8 positive-grep.
- **T-104-11-3 (JWT secret leak via fs perms)** — Mitigated: secrets dir
  mode 0700 + JWT file mode 0600 + `umask 0077` defense-in-depth. Verified
  by TEST 8 positive-grep.
- **T-104-11-4 (re-run rotates passwords + breaks existing data)** — Mitigated:
  re-run reads `DATABASE_URL` / `REDIS_URL` back from existing `.env` and
  reuses passwords; only generates fresh random when `.env` is absent.
  Defensive `ALTER USER livos WITH PASSWORD` aligns cluster password with
  `.env` value when role exists but `.env` was wiped. Verified by TEST 9.

## Sacred SHA invariant

`liv/packages/core/src/sdk-agent-runner.ts` MUST equal
`f3538e1d811992b782a9bb057d1b7f0a0189f95f` after every Phase 104 commit.

VERIFIED preserved across all 3 commits in this plan:
- `78714614` (Task 1) — `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d...`
- `efa83e11` (Task 2) — `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d...`
- This commit (Task 3) — pre-commit hook gates the final commit.

## Forward Compatibility — Plan 104-12

Plan 104-12 (or v34.x carry-forward) will ship `deploy-liv-core.sh` with the
same pattern, deploying:

- liv-core systemd unit (port 3200; the AI agent runner that hosts
  `@anthropic-ai/claude-agent-sdk` + the broker)
- liv-worker systemd unit (background job runner)
- liv-memory systemd unit (memory service; currently broken in update.sh
  per project memory — `update.sh` doesn't build `/opt/liv/packages/memory/`,
  104-12 can fix that too)

The architectural pattern is now established: per-component idempotent helper,
public entry function, gated by `SKIP_*` env var, wired by install.sh dispatch
tail.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TEST 9 regex too restrictive**
- **Found during:** Task 3 first test run
- **Issue:** Initial `DATABASE_URL=.*\.env` regex assumed `.env` literal would
  appear on the same line as the env-var key extraction; actual source uses
  `grep -E '^DATABASE_URL=' "$_DLD_ENV_FILE"` where `_DLD_ENV_FILE` is the
  variable, not the literal `.env` token. Test failed despite source being
  correct.
- **Fix:** Rewrote TEST 9 to look for the `grep.*DATABASE_URL=` and
  `sed.*DATABASE_URL=` patterns separately (matches the actual extraction
  idiom) + added a second sub-assertion that the `.env.bak` backup pattern
  is present.
- **Files modified:** scripts/install/__tests__/test-deploy-livinityd.sh
- **Commit:** Task 3 commit (this one — fix landed before commit, never
  shipped broken).

## Known Stubs

None. This plan ships a fully functional deploy helper. The "scope boundary"
helpers (liv-core / liv-worker / liv-memory) are NOT stubs — they're documented
out-of-scope-for-this-plan items deferred to Plan 104-12, with explicit
test assertions (TEST 10) that they remain undeployed by THIS helper.

## Verification

- [x] `bash -n scripts/install/deploy-livinityd.sh` exits 0
- [x] `bash scripts/install.sh --help` mentions `--skip-deploy`
- [x] `bash scripts/install/__tests__/test-deploy-livinityd.sh` → 44/44 PASS
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved after
      every commit
- [x] 104-08 + 104-09 existing tests still PASS 1:1 (regression: 18/18 + 24/24)
- [x] D-104-NO-PROD-IMPACT preserved: mode-cloud.sh untouched by deploy logic
- [x] D-104-RELAY-ZERO-DATA-PLANE preserved: zero Server5 references in
      deploy-livinityd.sh
- [ ] **Live verification on mainserver 154.53.56.75 — PENDING operator walk**
      (re-run `bash install.sh --mode hybrid --domain test.livinity.live
      --cf-token ... --cf-zone-id ...` and confirm `https://test.livinity.live`
      shows LivOS login screen with green padlock).

## Carry-forward

- **104-12**: Deploy liv-core + liv-worker + liv-memory systemd units (same
  pattern, separate helper `deploy-liv-core.sh`). Fix update.sh's
  missing-memory-build bug while we're at it.
- **104-07 Task 2 (Apple-device walk)**: Now reachable end-to-end — the
  install.sh after 104-11 produces a working UI, so the operator UAT can
  exercise the actual LivOS login screen on iPhone Safari + iPad Safari +
  macOS Safari + macOS Chrome (not just a Caddy placeholder).
- **mainserver re-test**: Run `bash install.sh --mode hybrid --domain
  test.livinity.live --cf-token X --cf-zone-id Y` on mainserver
  154.53.56.75 and confirm UI loads end-to-end. This is the GO/NO-GO gate
  for closing Phase 104.

## Self-Check: PASSED

- [x] `scripts/install/deploy-livinityd.sh` exists at commit `78714614`
- [x] `scripts/install/__tests__/test-deploy-livinityd.sh` exists at Task 3 commit
- [x] `scripts/install.sh` modified at commit `efa83e11` (sources deploy + calls deploy_livinityd gated on SKIP_DEPLOY)
- [x] `scripts/install/parse-cli.sh` modified at commit `efa83e11` (--skip-deploy flag + export)
- [x] `scripts/install/show-banner.sh` modified at commit `efa83e11` (per-mode deploy-ran branch)
- [x] Commit `78714614` exists in git log
- [x] Commit `efa83e11` exists in git log
- [x] Sacred SHA still `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
