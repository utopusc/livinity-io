#!/usr/bin/env bash
# scripts/install/__tests__/test-deploy-livinityd.sh
# Plan 104-11 — host-side bash test for deploy-livinityd.sh + --skip-deploy
# flag handling + install.sh dispatch wire.
#
# Runs WITHOUT root and WITHOUT a fresh Ubuntu host: these are static / dry-run
# tests of install.sh + grep-based source invariants on deploy-livinityd.sh.
# The end-to-end livinityd-actually-bound-to-:8080 verification is the
# operator-walked acceptance criterion (see 104-CONTEXT.md mainserver target).
#
# Invoke:    bash scripts/install/__tests__/test-deploy-livinityd.sh
# Returns:   exit 0 = all green; exit 1 = at least one failure
#
# Siblings: test-mode-hybrid-args.sh (104-08), test-mode-tunnel-args.sh (104-09)

set -uo pipefail   # intentionally NOT -e — we want to capture exit codes from
                   # install.sh probes and assert on them

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
INSTALL_SH="$REPO_ROOT/scripts/install.sh"
DEPLOY_SH="$REPO_ROOT/scripts/install/deploy-livinityd.sh"
PARSE_CLI_SH="$REPO_ROOT/scripts/install/parse-cli.sh"
SHOW_BANNER_SH="$REPO_ROOT/scripts/install/show-banner.sh"
MODE_CLOUD_SH="$REPO_ROOT/scripts/install/mode-cloud.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0

pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── TEST 1: --help mentions --skip-deploy ───────────────────────────────────
info "TEST 1: install.sh --help mentions --skip-deploy"
help_out=$(bash "$INSTALL_SH" --help 2>&1)
help_rc=$?
if [[ $help_rc -ne 0 ]]; then
    fail "install.sh --help exited $help_rc (expected 0)"
else
    pass "install.sh --help exited 0"
fi
if echo "$help_out" | grep -qF -- "--skip-deploy"; then
    pass "--help mentions --skip-deploy"
else
    fail "--help does NOT mention --skip-deploy"
fi
# Plan 104-11 block header should appear in --help
if echo "$help_out" | grep -qE 'Application deploy.*104-11|104-11.*deploy'; then
    pass "--help includes 'Application deploy (Plan 104-11)' block"
else
    fail "--help should include the Plan 104-11 deploy block"
fi

# ── TEST 2: bash -n syntax check on all install/*.sh ────────────────────────
info "TEST 2: bash -n syntax check (regression smoke)"
for f in "$INSTALL_SH" "$DEPLOY_SH" "$PARSE_CLI_SH" "$SHOW_BANNER_SH" \
         "$MODE_CLOUD_SH" \
         "$REPO_ROOT/scripts/install/mode-hybrid.sh" \
         "$REPO_ROOT/scripts/install/mode-tunnel.sh" \
         "$REPO_ROOT/scripts/install/mode-local-lan.sh" \
         "$REPO_ROOT/scripts/install/common-deps.sh" \
         "$REPO_ROOT/scripts/install/_logging.sh" \
         "$REPO_ROOT/scripts/install/detect-platform.sh"; do
    if [[ ! -f "$f" ]]; then
        info "  skip (file not found): $(basename "$f")"
        continue
    fi
    if bash -n "$f" 2>/dev/null; then
        pass "bash -n $(basename "$f")"
    else
        fail "bash -n $(basename "$f") FAILED"
    fi
done

# ── TEST 3: deploy-livinityd.sh exposes deploy_livinityd public function ────
info "TEST 3: deploy-livinityd.sh exposes deploy_livinityd public function"
if grep -qE '^deploy_livinityd\(\)' "$DEPLOY_SH"; then
    pass "deploy_livinityd() function defined"
else
    fail "deploy_livinityd() function NOT found in $DEPLOY_SH"
fi
# Internal helpers (prefixed with _dld_) should all be defined.
# 104-12 adds: _dld_build_liv_packages, _dld_sync_liv_dist_into_pnpm_store,
# _dld_write_liv_systemd_units.
for fn in _dld_install_system_packages _dld_setup_postgres _dld_setup_redis \
          _dld_clone_source _dld_build_packages _dld_generate_jwt_secret \
          _dld_write_env_file _dld_write_systemd_unit _dld_health_check \
          _dld_update_caddy_to_livinityd \
          _dld_build_liv_packages _dld_sync_liv_dist_into_pnpm_store \
          _dld_write_liv_systemd_units; do
    if grep -qE "^${fn}\(\)" "$DEPLOY_SH"; then
        pass "internal helper ${fn}() defined"
    else
        fail "internal helper ${fn}() NOT found"
    fi
done

# ── TEST 4: install.sh sources deploy-livinityd.sh + calls deploy_livinityd ─
info "TEST 4: install.sh wires deploy_livinityd"
if grep -qE 'source.*deploy-livinityd\.sh' "$INSTALL_SH"; then
    pass "install.sh sources deploy-livinityd.sh"
else
    fail "install.sh does NOT source deploy-livinityd.sh"
fi
if grep -qE 'deploy_livinityd' "$INSTALL_SH"; then
    pass "install.sh calls deploy_livinityd"
else
    fail "install.sh does NOT call deploy_livinityd"
fi
# The call MUST be gated on SKIP_DEPLOY != 1
if grep -qE 'SKIP_DEPLOY.*!=.*1|"\$\{SKIP_DEPLOY:-0\}".*!=.*"1"' "$INSTALL_SH"; then
    pass "deploy_livinityd call is gated on SKIP_DEPLOY"
else
    fail "deploy_livinityd call should be gated on SKIP_DEPLOY"
fi

# ── TEST 5: parse-cli.sh recognizes --skip-deploy flag ──────────────────────
info "TEST 5: parse-cli.sh handles --skip-deploy"
if grep -qE '\-\-skip-deploy\)' "$PARSE_CLI_SH"; then
    pass "parse-cli.sh has --skip-deploy case branch"
else
    fail "parse-cli.sh does NOT handle --skip-deploy"
fi
if grep -qE 'SKIP_DEPLOY=1' "$PARSE_CLI_SH"; then
    pass "parse-cli.sh sets SKIP_DEPLOY=1"
else
    fail "parse-cli.sh does NOT set SKIP_DEPLOY=1"
fi
if grep -qE 'export.*SKIP_DEPLOY' "$PARSE_CLI_SH"; then
    pass "parse-cli.sh exports SKIP_DEPLOY"
else
    fail "parse-cli.sh does NOT export SKIP_DEPLOY"
fi

# ── TEST 6: D-104-NO-PROD-IMPACT — mode-cloud.sh strict subset preserved ────
# mode-cloud.sh is the byte-equivalent-to-Mini-PC path (Plan 104-06). It MUST
# NOT call deploy_livinityd directly — the call lives in install.sh's tail,
# which is mode-agnostic. We negative-grep mode-cloud.sh for deploy_livinityd
# to assert nobody added a mode-specific call inside the cloud branch.
info "TEST 6: D-104-NO-PROD-IMPACT — mode-cloud.sh does not call deploy_livinityd"
if grep -qE 'deploy_livinityd' "$MODE_CLOUD_SH"; then
    fail "mode-cloud.sh contains deploy_livinityd reference (breaks D-104-NO-PROD-IMPACT)"
else
    pass "mode-cloud.sh does NOT reference deploy_livinityd"
fi

# ── TEST 7: --skip-deploy actually skips (gating semantics) ─────────────────
# Hard to test without sudo + a real Ubuntu host. The closest static test we
# can run is: parse --skip-deploy and observe SKIP_DEPLOY=1 propagates.
# We do this by sourcing parse-cli.sh in a subshell and probing the env.
info "TEST 7: --skip-deploy propagates to SKIP_DEPLOY=1"
out=$(bash -c "
    set -e
    source '$REPO_ROOT/scripts/install/_logging.sh' 2>/dev/null || true
    source '$PARSE_CLI_SH'
    parse_cli --mode hybrid --domain example.com --cf-token X --cf-zone-id Y --skip-deploy
    echo \"SKIP_DEPLOY=\$SKIP_DEPLOY\"
" 2>&1 | tail -1)
if [[ "$out" == "SKIP_DEPLOY=1" ]]; then
    pass "--skip-deploy sets SKIP_DEPLOY=1 (observed via sourced parse_cli)"
else
    fail "--skip-deploy did not set SKIP_DEPLOY=1 (got: $out)"
fi

# Default (no --skip-deploy) → SKIP_DEPLOY=0
out2=$(bash -c "
    set -e
    source '$REPO_ROOT/scripts/install/_logging.sh' 2>/dev/null || true
    source '$PARSE_CLI_SH'
    parse_cli --mode hybrid --domain example.com --cf-token X --cf-zone-id Y
    echo \"SKIP_DEPLOY=\$SKIP_DEPLOY\"
" 2>&1 | tail -1)
if [[ "$out2" == "SKIP_DEPLOY=0" ]]; then
    pass "default (no --skip-deploy) keeps SKIP_DEPLOY=0"
else
    fail "default should keep SKIP_DEPLOY=0 (got: $out2)"
fi

# ── TEST 8: deploy-livinityd.sh security — secrets only in /opt/livos/.env ──
# T-104-11-1 (postgres password leak via process list) → mitigated via
# PGPASSWORD env. Negative-grep: no `psql ... --password` or `psql -P` argv
# pattern that would leak the password to ps auxww.
info "TEST 8: T-104-11-1 — PGPASSWORD env (not argv) for psql"
if grep -qE 'PGPASSWORD=.*psql' "$DEPLOY_SH"; then
    pass "PGPASSWORD env used for psql (off argv)"
else
    fail "PGPASSWORD env pattern not found"
fi
# Sanity: no `psql ... -W` or `--password=` that would prompt or expose
if grep -qE 'psql.*-W|psql.*--password=' "$DEPLOY_SH"; then
    fail "deploy-livinityd.sh has psql -W or --password= (security regression)"
else
    pass "no psql -W / --password= patterns"
fi

# T-104-11-2 (.env world-readable) → chmod 0600
if grep -qE 'chmod 0?600.*\.env|chmod 0?600.*_DLD_ENV_FILE' "$DEPLOY_SH"; then
    pass "T-104-11-2 — .env chmod 0600 enforced"
else
    fail "T-104-11-2 — .env chmod 0600 NOT enforced"
fi

# T-104-11-3 (JWT secret world-readable) → chmod 0600
if grep -qE 'chmod 0?600.*jwt|chmod 0?600.*_DLD_JWT_FILE' "$DEPLOY_SH"; then
    pass "T-104-11-3 — JWT secret chmod 0600 enforced"
else
    fail "T-104-11-3 — JWT secret chmod 0600 NOT enforced"
fi

# ── TEST 9: idempotency — reuses .env passwords on re-run ───────────────────
info "TEST 9: idempotency — re-run preserves existing .env passwords"
# Look for the DATABASE_URL=... regex (used to extract the existing PG password
# from /opt/livos/.env) and the REDIS_URL=... counterpart for Redis. Both are
# `grep -E '^DATABASE_URL='` style assignments that prove re-run reuse logic.
db_reuse=0
redis_reuse=0
if grep -qE "grep.*DATABASE_URL=|sed.*DATABASE_URL=" "$DEPLOY_SH"; then
    db_reuse=1
fi
if grep -qE "grep.*REDIS_URL=|sed.*REDIS_URL=" "$DEPLOY_SH"; then
    redis_reuse=1
fi
if (( db_reuse == 1 )) && (( redis_reuse == 1 )); then
    pass "deploy-livinityd.sh reads back DATABASE_URL + REDIS_URL from .env on re-run"
else
    fail "deploy-livinityd.sh missing .env reuse logic (db_reuse=$db_reuse, redis_reuse=$redis_reuse)"
fi
# Also assert .env is backed up on re-run before overwrite
if grep -qE '\.env\.bak|ENV_FILE.*bak' "$DEPLOY_SH"; then
    pass "deploy-livinityd.sh backs up existing .env to .env.bak before rewrite"
else
    fail "deploy-livinityd.sh should back up .env to .env.bak before rewrite"
fi

# ── TEST 10: 104-12 scope — liv-core/liv-worker/liv-memory ARE NOW deployed ─
# Plan 104-12 extends 104-11 to deploy the liv/ sibling packages. The scope
# boundary that 104-11 carried forward is now CLOSED — this test was
# previously a NEGATIVE-grep (assert absence); 104-12 inverts it to assert
# the systemd units + build helper are PRESENT.
info "TEST 10: 104-12 — liv-core/liv-worker/liv-memory systemd units written"
# liv-core / liv-worker / liv-memory systemd unit templates must all be
# embedded in deploy-livinityd.sh (heredoc-style; we grep for the Description=
# line of each unit).
for svc in liv-core liv-worker liv-memory; do
    if grep -qE "(Description=Liv (core|worker|memory)|@liv/${svc#liv-}|liv-${svc#liv-}\.service)" "$DEPLOY_SH"; then
        pass "${svc}.service template present in deploy-livinityd.sh"
    else
        fail "${svc}.service template NOT found"
    fi
done
# systemctl enable/start calls for each liv service
if grep -qE 'systemctl.*enable.*liv-' "$DEPLOY_SH" || grep -qE 'systemctl enable.*\$\{svc\}\.service|systemctl enable "\$\{svc\}\.service"' "$DEPLOY_SH"; then
    pass "systemctl enable for liv-* services present"
else
    fail "systemctl enable for liv-* NOT found"
fi
# Dist-copy loop: iterates ALL @liv+<pkg>* dirs (not head -1 — Phase 31 BUILD-02 fix)
if grep -qE '@liv\+\$\{pkg\}|@liv\+core|@liv\+worker|@liv\+memory|@liv\+mcp-server' "$DEPLOY_SH"; then
    pass "pnpm-store iteration pattern (@liv+\${pkg}*) present"
else
    fail "pnpm-store iteration pattern NOT found"
fi
# rsync --delete in dist-copy (purges stale files from prior builds)
if grep -qE 'rsync.*--delete.*dist|rsync -a --delete' "$DEPLOY_SH"; then
    pass "rsync --delete pattern in dist-copy (purges stale)"
else
    fail "rsync --delete NOT found in dist-copy"
fi
# Also assert the rsync of repo/liv/ → /opt/liv/ (sibling sync)
if grep -qE 'rsync.*liv/.*_DLD_LIV_DIR|STAGE_DIR/liv/' "$DEPLOY_SH"; then
    pass "rsync repo/liv/ → /opt/liv/ present (sibling sync — closes ENOENT bug)"
else
    fail "rsync repo/liv/ → /opt/liv/ NOT found"
fi
# mcp-server should NOT have a systemd unit (livinityd spawns on-demand)
if grep -qE '_DLD_SYSTEMD_LIV_MCP|liv-mcp-server\.service|Description=Liv mcp-server' "$DEPLOY_SH"; then
    fail "liv-mcp-server.service should NOT exist (livinityd spawns on-demand)"
else
    pass "no liv-mcp-server systemd unit (correct — on-demand spawn)"
fi

# ── TEST 11: 104-08 + 104-09 regression — those tests still pass ────────────
info "TEST 11: 104-08 + 104-09 regression smoke (run sibling test scripts)"
if bash "$REPO_ROOT/scripts/install/__tests__/test-mode-hybrid-args.sh" >/dev/null 2>&1; then
    pass "104-08 test-mode-hybrid-args.sh still PASSes (regression smoke)"
else
    fail "104-08 test-mode-hybrid-args.sh FAILED — D-104-NO-PROD-IMPACT regression"
fi
if bash "$REPO_ROOT/scripts/install/__tests__/test-mode-tunnel-args.sh" >/dev/null 2>&1; then
    pass "104-09 test-mode-tunnel-args.sh still PASSes (regression smoke)"
else
    fail "104-09 test-mode-tunnel-args.sh FAILED — D-104-NO-PROD-IMPACT regression"
fi

# ── TEST 12: 104-12 path-bug fix — no live /opt/livos/livos/ paths ──────────
# Critical assertion: the nested /opt/livos/livos/ layout is gone. Any
# remaining references must be COMMENTS documenting the old bug (lines
# starting with optional whitespace + `#`).
info "TEST 12: 104-12 path-bug fix — /opt/livos/livos/ only in comments"
live_hits=$(grep -nE '/opt/livos/livos' "$DEPLOY_SH" 2>/dev/null | grep -v '^[0-9]*:[[:space:]]*#' || true)
if [[ -z "$live_hits" ]]; then
    pass "no LIVE /opt/livos/livos/ paths (all remaining hits are comments documenting old bug)"
else
    fail "LIVE /opt/livos/livos/ paths still present:"
    echo "$live_hits"
fi
# Also assert _DLD_LIVOS_SRC is fully retired (was the nested-path constant)
if grep -qE '^[^#]*_DLD_LIVOS_SRC' "$DEPLOY_SH"; then
    fail "_DLD_LIVOS_SRC still referenced in non-comment lines (should be retired)"
else
    pass "_DLD_LIVOS_SRC fully retired (104-12)"
fi
# And the flat-layout sibling _DLD_LIV_DIR constant IS defined
if grep -qE '^_DLD_LIV_DIR=' "$DEPLOY_SH"; then
    pass "_DLD_LIV_DIR constant defined (104-12 sibling path)"
else
    fail "_DLD_LIV_DIR constant NOT defined"
fi
# The pre-flight check (assert /opt/liv/packages/core/ exists before pnpm install)
if grep -qE 'PRE-FLIGHT-FAIL.*core|packages/core.*missing' "$DEPLOY_SH"; then
    pass "pre-flight check for /opt/liv/packages/core/ present (catches ENOENT loudly)"
else
    fail "pre-flight check for /opt/liv/packages/core/ NOT found"
fi
# systemd WorkingDirectory for livos.service must be /opt/livos (NOT nested).
# Match the heredoc body which writes `WorkingDirectory=${_DLD_LIVOS_DIR}`.
if grep -qE 'WorkingDirectory=\$\{?_DLD_LIVOS_DIR' "$DEPLOY_SH"; then
    pass "livos.service WorkingDirectory uses _DLD_LIVOS_DIR (flat /opt/livos)"
else
    fail "livos.service WorkingDirectory should reference _DLD_LIVOS_DIR (flat)"
fi
# schema.sql path uses _DLD_LIVOS_DIR (flat) — NOT _DLD_LIVOS_SRC (nested)
if grep -qE 'schema_file=.*_DLD_LIVOS_DIR.*packages/livinityd' "$DEPLOY_SH"; then
    pass "schema.sql path uses _DLD_LIVOS_DIR (flat layout)"
else
    fail "schema.sql path should use _DLD_LIVOS_DIR"
fi

# ── TEST 13: 104-12 liv-stack build calls present ───────────────────────────
info "TEST 13: 104-12 liv-stack build pipeline"
# npm install in /opt/liv (NOT pnpm — liv uses npm per Mini PC reference)
if grep -qE 'npm install.*omit=optional|cd.*_DLD_LIV_DIR.*npm install' "$DEPLOY_SH" \
   || grep -qE 'cd "?\$_DLD_LIV_DIR"?' "$DEPLOY_SH"; then
    pass "liv: cd into _DLD_LIV_DIR + npm install pattern"
else
    fail "liv: npm install pattern NOT found"
fi
# Build loop iterates core, worker, mcp-server, memory
if grep -qE 'core worker mcp-server memory|core.*worker.*mcp-server.*memory' "$DEPLOY_SH"; then
    pass "liv build loop iterates all 4 packages (core/worker/mcp-server/memory)"
else
    fail "liv build loop should iterate core/worker/mcp-server/memory"
fi
# BUILD-FAIL guard on liv dist (mirrors update.sh:287-295 pattern)
if grep -qE 'BUILD-FAIL.*@liv|BUILD-FAIL.*liv/' "$DEPLOY_SH"; then
    pass "BUILD-FAIL guard on @liv/* dist (non-empty assertion)"
else
    fail "BUILD-FAIL guard on @liv/* should be present"
fi
# Entry point detection: node $entry where entry = $pkg_dir/dist/index.js
if grep -qE 'dist/index\.js' "$DEPLOY_SH"; then
    pass "liv systemd ExecStart uses node dist/index.js"
else
    fail "liv systemd ExecStart should use node dist/index.js"
fi

# ── TEST 14: deploy_livinityd order — liv units BEFORE livos.service ────────
# livos.service has `After=liv-core.service` so the unit needs to exist when
# livos.service is enabled. Assert the call order in deploy_livinityd().
info "TEST 14: deploy_livinityd call order — liv stack before livos unit"
# Extract the body of deploy_livinityd() (lines between `^deploy_livinityd\(\)` and
# the matching closing `^}`).
order_body=$(awk '/^deploy_livinityd\(\)/,/^}/' "$DEPLOY_SH")
liv_line=$(echo "$order_body" | grep -n '_dld_write_liv_systemd_units' | head -1 | cut -d: -f1)
livos_line=$(echo "$order_body" | grep -n '_dld_write_systemd_unit' | grep -v 'liv' | head -1 | cut -d: -f1)
if [[ -n "$liv_line" ]] && [[ -n "$livos_line" ]] && (( liv_line < livos_line )); then
    pass "_dld_write_liv_systemd_units called BEFORE _dld_write_systemd_unit (line $liv_line < $livos_line)"
else
    fail "liv units should be written BEFORE livos.service (liv=$liv_line livos=$livos_line)"
fi
# Build liv BEFORE writing units (otherwise dist/index.js wouldn't exist)
build_line=$(echo "$order_body" | grep -n '_dld_build_liv_packages' | head -1 | cut -d: -f1)
if [[ -n "$build_line" ]] && [[ -n "$liv_line" ]] && (( build_line < liv_line )); then
    pass "_dld_build_liv_packages called BEFORE _dld_write_liv_systemd_units (line $build_line < $liv_line)"
else
    fail "liv build should happen BEFORE writing units (build=$build_line units=$liv_line)"
fi
# Dist-sync into pnpm store after liv build but before livos systemd unit
sync_line=$(echo "$order_body" | grep -n '_dld_sync_liv_dist_into_pnpm_store' | head -1 | cut -d: -f1)
if [[ -n "$sync_line" ]] && [[ -n "$build_line" ]] && (( build_line < sync_line )); then
    pass "dist sync runs AFTER liv build (line $sync_line > $build_line)"
else
    fail "dist sync should run AFTER liv build (build=$build_line sync=$sync_line)"
fi

# ── TEST 15: 104-13 — pnpm block-exotic-subdeps .npmrc helper ───────────────
# Plan 104-13 adds `_dld_write_pnpm_npmrc` to allow baileys → libsignal
# git-repository subdep on pnpm 11+. Helper must:
#   (a) be defined,
#   (b) target $_DLD_LIVOS_DIR/.npmrc,
#   (c) write the literal `block-exotic-subdeps=false` directive,
#   (d) be idempotent (re-run no-op when directive already present),
#   (e) be called in deploy_livinityd AFTER _dld_clone_source and BEFORE
#       _dld_build_packages so pnpm sees the file at install time.
info "TEST 15: 104-13 — _dld_write_pnpm_npmrc helper"

if grep -qE '^_dld_write_pnpm_npmrc\(\)' "$DEPLOY_SH"; then
    pass "_dld_write_pnpm_npmrc() function defined"
else
    fail "_dld_write_pnpm_npmrc() function NOT found"
fi

# Helper body must write `block-exotic-subdeps=false` literal
if grep -qE '^block-exotic-subdeps=false' "$DEPLOY_SH"; then
    pass "block-exotic-subdeps=false literal present in deploy-livinityd.sh"
else
    fail "block-exotic-subdeps=false literal NOT found"
fi

# Helper must target .npmrc under _DLD_LIVOS_DIR
if grep -qE 'npmrc=.*_DLD_LIVOS_DIR.*\.npmrc|_DLD_LIVOS_DIR.*\.npmrc' "$DEPLOY_SH"; then
    pass "_dld_write_pnpm_npmrc targets .npmrc under _DLD_LIVOS_DIR"
else
    fail "_dld_write_pnpm_npmrc should target \$_DLD_LIVOS_DIR/.npmrc"
fi

# Idempotency: helper greps for existing directive before appending
if grep -qE 'grep -q "\^block-exotic-subdeps='"'"'?=|grep -q .\^block-exotic-subdeps=' "$DEPLOY_SH"; then
    pass "_dld_write_pnpm_npmrc idempotent (grep -q ^block-exotic-subdeps= guard)"
else
    fail "_dld_write_pnpm_npmrc should be idempotent (grep -q for existing directive)"
fi

# Call order: AFTER _dld_clone_source, BEFORE _dld_build_packages.
# Reuse same awk-based extraction pattern as TEST 14.
order_body_13=$(awk '/^deploy_livinityd\(\)/,/^}/' "$DEPLOY_SH")
clone_line=$(echo "$order_body_13" | grep -n '_dld_clone_source' | head -1 | cut -d: -f1)
npmrc_line=$(echo "$order_body_13" | grep -n '_dld_write_pnpm_npmrc' | head -1 | cut -d: -f1)
build_line=$(echo "$order_body_13" | grep -n '_dld_build_packages' | head -1 | cut -d: -f1)
if [[ -n "$clone_line" ]] && [[ -n "$npmrc_line" ]] && [[ -n "$build_line" ]] \
   && (( clone_line < npmrc_line )) && (( npmrc_line < build_line )); then
    pass "_dld_write_pnpm_npmrc called AFTER clone ($clone_line) and BEFORE build ($build_line) at line $npmrc_line"
else
    fail "_dld_write_pnpm_npmrc must be between clone and build (clone=$clone_line npmrc=$npmrc_line build=$build_line)"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo
echo "================================================================"
echo "  Plan 104-11/12/13 test results: $pass_count PASS, $fail_count FAIL"
echo "================================================================"
if (( fail_count > 0 )); then
    exit 1
fi
exit 0
