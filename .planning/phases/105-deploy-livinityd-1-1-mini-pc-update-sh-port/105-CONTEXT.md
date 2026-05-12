# Phase 105: deploy-livinityd 1:1 Mini-PC update.sh Port — Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Source:** USER DECISION 2026-05-12 (Path A locked) + project memory `project_p104_deploy_gap.md` + Phase 104 live test results on mainserver `154.53.56.75` + canonical reference `update.sh` (repo root, 703 lines)

<domain>
## Phase Boundary

**In scope:**
- Rewrite `scripts/install/deploy-livinityd.sh` to be a faithful 1:1 port of Mini PC's `update.sh` (canonical reference at repo root)
- Adapt `update.sh`'s update-flow assumptions (existing services, .deployed-sha file, cgroup escape) to first-install case where those don't apply
- Preserve first-install-only helpers from Plans 104-11/12/13 (PG bootstrap, Redis requirepass, JWT secret generation, `.env` write, schema.sql apply) — these wrap around the ported update.sh logic, NOT replace it
- Extend `scripts/install/__tests__/test-deploy-livinityd.sh` test suite to verify byte-equivalence between deploy-livinityd output and update.sh's expected state
- Live VPS UAT plan: fresh Ubuntu 24.04 box → install.sh --mode hybrid → all 5 GO/NO-GO criteria PASS
- All existing 104-* test suites (test-mode-hybrid-args.sh 18/18, test-mode-tunnel-args.sh 24/24, test-deploy-livinityd.sh 71→N) MUST continue passing

**Out of scope (hard):**
- Modifying Mini PC's `update.sh` (read-only canonical reference; Mini PC keeps running update.sh exactly as-is)
- Changing the TLS pipeline from 104-08 / 104-09 (zero changes to caddy/CF/LE wiring)
- Touching sacred `liv/packages/core/src/sdk-agent-runner.ts` (SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED)
- Adding a parallel deploy implementation (Docker compose / Ansible — those are Path B / Path C explicitly rejected)
- Any changes to install.sh CLI surface (`--mode hybrid --domain X --cf-token Y --cf-zone-id Z` must work byte-equivalent to 104-13)
- New runtime dependencies beyond what update.sh already uses (no new apt packages, no new node modules)

</domain>

<decisions>
## Locked Decisions

### Canonical Reference
- **`update.sh` at repo root (703 lines)** is the canonical source-of-truth for the deploy flow. Every step in deploy-livinityd.sh MUST trace to a corresponding section in update.sh. Where update.sh and deploy-livinityd.sh diverge, document WHY in a header comment.

### Step Mapping (update.sh → deploy-livinityd.sh)

#### Pre-flight (update.sh lines 1-300)
- **D-105-PREFLIGHT-OMIT:** cgroup escape (lines 15-29), PIPE trap (line 45), JSON log emission (lines 47-172), Phase 32 precheck() (lines 192-268), record_previous_sha() (line 275) — OMIT in deploy-livinityd first-install case (no existing service to escape, no prior SHA to compare, no precheck applicable to fresh box)
- **D-105-PREFLIGHT-KEEP:** verify_build() helper (lines 282-295) — KEEP, port as `_dld_verify_build` because BUILD-FAIL guards are needed for first-install too
- **D-105-PREFLIGHT-EUID-CHECK:** root check (line 302) — already in 104-11, keep
- **D-105-PREFLIGHT-CONSTANTS:** LIVOS_DIR=/opt/livos, LIV_DIR=/opt/liv, TEMP_DIR=/tmp/livinity-update-$$ — match update.sh:174-178 (104-12 already aligned)

#### Step 1: Pull code (update.sh:319-337)
- **D-105-STEP1-CLONE-NOT-PULL:** Replace `git pull` (update flow) with `git clone` (first-install). Use same source URL `https://github.com/utopusc/livinity-io` per Mini PC. Capture target SHA same way (line 332: `LIVOS_UPDATE_TO_SHA=$(cd "$TEMP_DIR" && git rev-parse HEAD)`)

#### Step 1b: apt packages for streaming (update.sh:339-405)
- **D-105-STEP1B-PORT-VERBATIM:** Port the full apt-get block including: ffmpeg, x11-utils, x11-xserver-utils, ydotool, xdotool, scrot, imagemagick + ydotoold systemd unit creation. Idempotent (apt-get install is idempotent; ydotoold unit only written if missing). 104-11 currently lacks these — gap closure.

#### Step 2: LivOS rsync (update.sh:406-466)
- **D-105-STEP2-RSYNC-DIRECT:** `rsync -a --delete --exclude='.git' "$TEMP_DIR/livos/" "$LIVOS_DIR/"` — verbatim from update.sh:411-414
- **D-105-STEP2-EXCLUDE-ANCHORED:** Use `--exclude='/docker/'` (anchored to top-level), NEVER `--exclude='docker/'` (over-matches `packages/ui/src/routes/docker/` per memory `project_p104_deploy_gap.md` bug #4)
- **D-105-STEP2-SELF-RSYNC:** update.sh self-deploys update.sh from temp dir (update.sh:425-430) — port for forward-compat (deploy-livinityd installs the same update.sh into /opt/livos/ so future updates work)
- **D-105-STEP2-COPY-LOCKFILES:** `pnpm-lock.yaml` + `pnpm-workspace.yaml` separately copied (update.sh:437-438) since rsync of root may miss them depending on exclude patterns. Keep verbatim.
- **D-105-STEP2-NESTED-SYNCS:** UI public (update.sh:457), config (update.sh:446-454), routes (update.sh:462-465) — port verbatim. Each is a targeted sync of nested dirs.

#### Step 3: Liv rsync (update.sh:467-491)
- **D-105-STEP3-LIV-SIBLING:** `rsync -a --delete --exclude='.git' "$TEMP_DIR/liv/" "$LIV_DIR/"` — verbatim from update.sh:475-477
- **D-105-STEP3-GUARD:** Only run if `$LIV_DIR` (`/opt/liv/`) exists or is being created (104-12 already syncs from clone)

#### Step 4: Dependencies (update.sh:493-506)
- **D-105-STEP4-PNPM:** `pnpm install --frozen-lockfile 2>/dev/null || pnpm install` in `$LIVOS_DIR` — verbatim from update.sh:498
- **D-105-STEP4-NPMRC-PNPM11:** BEFORE pnpm install, write `/opt/livos/.npmrc` with `block-exotic-subdeps=false` (Plan 104-13 kept — pnpm 11+ on fresh Ubuntu 24.04 enforces; Mini PC's older pnpm doesn't)
- **D-105-STEP4-NPM-LIV:** `npm install --omit=optional` in `$LIV_DIR` (update.sh:504-505)

#### Step 5: Build (update.sh:508-594)
- **D-105-STEP5-LIVOS-BUILD:** `pnpm --filter @livos/config build && pnpm --filter ui build` in `$LIVOS_DIR` — verbatim from update.sh:528-532 BUT add `verify_build` guard after each (BUILD-FAIL pattern from update.sh:287-295)
- **D-105-STEP5-LIV-BUILD:** For each of core/worker/mcp-server/memory: `cd "$LIV_DIR/packages/X" && npm run build` + verify_build (update.sh:541-561)
- **D-105-STEP5-DIST-COPY-MULTI:** Iterate ALL `@liv+core*` AND `@liv+worker*` AND `@liv+memory*` AND `@liv+mcp-server*` dirs under `$LIVOS_DIR/node_modules/.pnpm/`, rsync dist into each (update.sh:575-589 covers @liv+core* only; 104-12's `_dld_sync_liv_dist_into_pnpm_store` extends to all 4 packages — keep that extension)
- **D-105-STEP5-DIST-COPY-FAIL:** If ZERO matching dirs found, FAIL loudly (update.sh:590-591)

#### Step 6: Gallery cache (update.sh:596-610)
- **D-105-STEP6-GALLERY:** Port verbatim. Idempotent on missing `$GALLERY_CACHE_DIR/.git` (graceful skip).

#### Step 7: Permissions (update.sh:612-622)
- **D-105-STEP7-CHOWN:** `chown -R "$LIVOS_USER:$LIVOS_USER" /opt/livos /opt/liv` — port BUT make `$LIVOS_USER` configurable (default `root` for first-install; Mini PC uses `bruce` because that user existed before LivOS). Future enhancement: `--user` install.sh flag.

#### Step 8: Services (update.sh:624-655)
- **D-105-STEP8-DAEMON-RELOAD:** `systemctl daemon-reload` first (update.sh:627)
- **D-105-STEP8-ENABLE-NOW:** For first-install, use `systemctl enable --now` instead of `systemctl restart` (no existing services to restart) for: livos, liv-core, liv-worker, liv-memory
- **D-105-STEP8-UNIT-FILES:** Write all 4 systemd unit files BEFORE enable --now (104-12 already does 3; verify livos.service unit shape matches Mini PC's `/etc/systemd/system/livos.service`)
- **D-105-STEP8-NO-MCP-UNIT:** liv-mcp-server intentionally has NO systemd unit (P77 on-demand spawn — D-104-12-MCP-SERVER-NO-SYSTEMD preserved)
- **D-105-STEP8-START-ORDER:** memory → worker → core → livos (memory has no inter-deps, worker depends on memory via redis pubsub, core depends on worker via memory protocol, livos depends on core via HTTP)
- **D-105-STEP8-HEALTH-CHECK:** Curl `:8080/healthz` with 30s timeout — WARN-not-FAIL (D-104-11-HEALTH-NONFATAL preserved)

#### Step 9: Cleanup (update.sh:672-682)
- **D-105-STEP9-CLEANUP:** `rm -rf "$TEMP_DIR"` — port verbatim

### First-Install-Only Additions (Wrap Around update.sh Logic)

These are NOT in update.sh because update.sh assumes infra already exists. Deploy-livinityd MUST run them ONCE on a fresh box, then SKIP on subsequent runs:

- **D-105-INFRA-PG:** PostgreSQL apt install + role/DB create + schema.sql apply (from 104-11 `_dld_setup_postgres`). Reuse pattern.
- **D-105-INFRA-REDIS:** Redis apt install + requirepass append + restart (from 104-11 `_dld_setup_redis`). Idempotent via sed-remove-then-append.
- **D-105-INFRA-NODE-PNPM:** Node 22 LTS via NodeSource + `npm install -g pnpm` (from 104-11 `_dld_install_system_packages`)
- **D-105-INFRA-JWT:** Generate `/opt/livos/data/secrets/jwt` mode 0600 if missing (from 104-11 `_dld_write_jwt_secret`)
- **D-105-INFRA-ENV:** Write `/opt/livos/.env` with random PG/Redis passwords mode 0600. REUSE on rerun: read existing `.env` first, preserve PG/Redis passwords if present (D-104-11-REUSE-NOT-ROTATE preserved). Write .env.bak backup before any modification.
- **D-105-INFRA-CADDY-MODE:** Caddyfile shape per install.sh `$MODE` (hybrid/tunnel/local-lan/cloud) — preserve 104-11 logic
- **D-105-INFRA-CADDY-RELOAD:** `systemctl reload caddy` at the end (or `restart` if Caddyfile is new)

### Pipeline Order (deploy_livinityd entry point)

The top-level `deploy_livinityd` function MUST run helpers in this order:

1. **Pre-flight:** root check, $MODE arg validation, define constants
2. **Infra (first-install-only):** apt system packages → PG → Redis → Node/pnpm/npm
3. **Clone source:** git clone repo → /tmp + capture target SHA + extract /tmp/livos + /tmp/liv
4. **Apt streaming packages:** Step 1b port (ffmpeg + xdotool + ydotool + ydotoold unit)
5. **Rsync sources:** Step 2 (livos) + Step 3 (liv)
6. **Bootstrap secrets:** JWT secret + .env (BEFORE pnpm install so any env-dependent steps see them)
7. **Write .npmrc:** Plan 104-13's block-exotic-subdeps=false in /opt/livos/.npmrc (before pnpm install)
8. **Install deps:** Step 4 (pnpm in livos + npm in liv)
9. **Build packages:** Step 5 (livos config+ui + liv core/worker/mcp-server/memory + dist copy to ALL pnpm-store dirs + verify_build guards)
10. **Gallery cache:** Step 6 (idempotent)
11. **Permissions:** Step 7 (chown)
12. **Systemd units:** Write liv-memory, liv-worker, liv-core, livos service files
13. **Daemon-reload + enable --now:** Step 8 in dependency order (memory → worker → core → livos)
14. **Health check:** curl :8080/healthz with WARN-not-FAIL
15. **Caddyfile:** Rewrite per $MODE (preserve 104-11) + reload caddy
16. **Cleanup:** Step 9 (rm /tmp/livinity-update-*)

### Test Strategy

- **D-105-TEST-EXTEND:** Extend `scripts/install/__tests__/test-deploy-livinityd.sh` from current 71 assertions to ~100+ assertions covering:
  - TEST N: For each major helper, assert: function defined, called in correct order, contains the key literal from update.sh
  - TEST N+1: Negative grep — assert `update.sh` is NOT modified (no diff vs `git show HEAD~:update.sh`)
  - TEST N+2: Step ordering (helpers called in pipeline order above)
  - TEST N+3: pnpm-store iteration covers all 4 @liv+* packages
  - TEST N+4: Caddyfile reload happens AFTER service enable (so reverse_proxy target is ready)
- **D-105-TEST-EQUIV-HARNESS:** New test: spawn a Docker container running Ubuntu 24.04, copy update.sh + deploy-livinityd.sh in, run both against parallel /opt/ trees, `diff -rq /opt/livos-from-update /opt/livos-from-deploy` — expect zero diff (modulo first-install-only files: data/, .env, jwt secret)
- **D-105-TEST-REGRESSION:** 104-08 (18 PASS) + 104-09 (24 PASS) MUST continue passing as regression smoke

### Live UAT Gate (GO/NO-GO)

Run `bash install.sh --mode hybrid --domain <user-domain> --cf-token <token> --cf-zone-id <zone>` on a fresh Ubuntu 24.04 VPS. PASS = all 5 of:

1. **Services:** `systemctl is-active livos liv-core liv-worker liv-memory` → 4× "active"
2. **HTTP:** `curl -sk https://<domain>` returns LivOS login HTML (NOT Caddy placeholder, NOT 502)
3. **Browser:** Green padlock + LivOS UI renders (operator-verified screenshot)
4. **Sacred SHA:** `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
5. **Update parity:** Re-running `bash /opt/livos/update.sh` on the same box succeeds idempotently (proves deploy-livinityd produced an update.sh-compatible layout)

### Claude's Discretion

- Helper naming convention (`_dld_*` per 104-11 vs `step_N_*` matching update.sh names — pick one, be consistent)
- Internal refactor of existing 104-11 helpers if they don't cleanly map (e.g., split `_dld_install_system_packages` into infra-only + streaming-specific halves)
- Comment style: update.sh has elaborate phase-citation headers (`# ── Phase 31 BUILD-03: root-cause fix ──`); deploy-livinityd may or may not match — pick one
- Test file decomposition: keep monolithic `test-deploy-livinityd.sh` vs split into `test-deploy-livinityd-step1.sh`, etc. — current monolithic is fine

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source of truth
- `update.sh` (repo root, 703 lines) — production-tested Mini PC update flow. Line-by-line canonical reference.
- `scripts/install/deploy-livinityd.sh` (829 lines, current state shipped in 104-13) — the file being rewritten. Existing helpers (`_dld_setup_postgres`, `_dld_setup_redis`, `_dld_clone_source`, `_dld_build_packages`, `_dld_sync_liv_dist_into_pnpm_store`, `_dld_write_liv_systemd_units`, `_dld_write_livos_systemd_unit`, `_dld_write_caddyfile`, `_dld_write_jwt_secret`, `_dld_write_pnpm_npmrc`, etc.) are starting scaffold.

### Test harness
- `scripts/install/__tests__/test-deploy-livinityd.sh` (71 PASS after 104-13) — extends to ~100+ in this phase
- `scripts/install/__tests__/test-mode-hybrid-args.sh` (18 PASS) — regression smoke, MUST keep passing
- `scripts/install/__tests__/test-mode-tunnel-args.sh` (24 PASS) — regression smoke, MUST keep passing

### Install orchestration
- `scripts/install/install.sh` — top-level entry; calls deploy-livinityd
- `scripts/install/parse-cli.sh` — flag parsing (--mode, --domain, --cf-token, --cf-zone-id, --cf-tunnel-token, --api-key, --skip-deploy)
- `scripts/install/mode-hybrid.sh` — 104-08 TLS pipeline (Caddy + caddy-dns/cloudflare + LE DNS-01)
- `scripts/install/mode-tunnel.sh` — 104-09 CF Tunnel mode
- `scripts/install/mode-local-lan.sh` — 104-03 dnsmasq + tls internal
- `scripts/install/mode-cloud.sh` — 104-06 cloud regression mode

### Phase 104 lineage
- `.planning/phases/104-local-install-and-docker-uat/104-11-PLAN.md` — original deploy-livinityd creation
- `.planning/phases/104-local-install-and-docker-uat/104-12-PLAN.md` — path-bug fix + liv-stack
- `.planning/phases/104-local-install-and-docker-uat/104-13-PLAN.md` — pnpm blockExoticSubdeps hotfix

### Memory anchors
- `~/.claude/projects/.../memory/project_p104_deploy_gap.md` — 6+ cascading bugs documented + Path A decision locked
- `~/.claude/projects/.../memory/feedback_update_sh_drift.md` — update.sh source/production drift warning (irrelevant here since we're not modifying update.sh, but informs why we trust it)
- `~/.claude/projects/.../memory/reference_minipc.md` — Mini PC layout reference
- `~/.claude/projects/.../memory/feedback_milestone_uat_gate.md` — Never declare passed without UAT

### Sacred file
- `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — UNTOUCHED (deploy-livinityd does not touch source files, only deploys them, so trivially preserved; still verify in UAT)

</canonical_refs>

<specifics>
## Specific Patterns From update.sh Worth Quoting

### verify_build (update.sh:287-295)
```bash
verify_build() {
    local pkg="$1"
    local dist="$2"
    if [[ ! -d "$dist" ]]; then
        fail "BUILD-FAIL: $pkg dist directory missing: $dist"
    fi
    if [[ -z "$(ls -A "$dist" 2>/dev/null)" ]]; then
        fail "BUILD-FAIL: $pkg dist directory empty: $dist"
    fi
}
```
Use this exact pattern in deploy-livinityd. Don't reinvent.

### pnpm-store iteration (update.sh:575-591)
```bash
COPY_COUNT=0
for store_dir in /opt/livos/node_modules/.pnpm/@liv+core*/; do
    [[ -d "$store_dir" ]] || continue
    rsync -a --delete /opt/liv/packages/core/dist/ "$store_dir/node_modules/@liv/core/dist/"
    COPY_COUNT=$((COPY_COUNT + 1))
done
if [[ $COPY_COUNT -eq 0 ]]; then
    echo "DIST-COPY-FAIL: no @liv+core* dirs found under /opt/livos/node_modules/.pnpm/" >&2
    fail "..."
fi
```
104-12 already extends this to all 4 packages; verify the extension is verbatim-equivalent.

### Step 1b ydotoold unit (update.sh:380-405)
The ydotoold systemd unit creation block is non-trivial — port verbatim including the `daemon-reload + enable` sequence.

### rsync nested syncs (update.sh:446-465)
Three separate rsync calls for config, ui/public, ui/src/routes — each with specific --exclude patterns. Port verbatim.

</specifics>

<deferred>
## Deferred Ideas

- **Docker compose alternative** (Path B from memory) — deferred indefinitely. Trade-offs documented in `project_p104_deploy_gap.md`.
- **Ansible playbook** (Path C from memory) — deferred. Path A first.
- **`--user` install.sh flag** for non-root chown target — Phase 105 implements infrastructure (configurable `$LIVOS_USER` variable) but defaults to `root`. Exposing the CLI flag is a follow-up.
- **Mini PC update.sh refactor** — out of scope. Mini PC keeps running update.sh exactly as-is.
- **Backup/restore before/after deploy** — out of scope. Future phase.
- **Telemetry/observability** — JSON history-log scaffolding from update.sh:47-172 is preserved but full deploy-time event emission is deferred.

</deferred>

---

*Phase: 105-deploy-livinityd-1-1-mini-pc-update-sh-port*
*Context gathered: 2026-05-12 inline (locked decisions from memory + roadmap + 104 live-test learnings)*
