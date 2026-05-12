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
# 105-01 update: helper extracted to _dld_verify_build — accept either the
# inline BUILD-FAIL literal (pre-105-01) OR a _dld_verify_build call with
# an @liv/* argument (post-105-01). The semantic invariant is preserved.
if grep -qE 'BUILD-FAIL.*@liv|BUILD-FAIL.*liv/|_dld_verify_build "@liv/' "$DEPLOY_SH"; then
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

# ── TEST 16: 105-01 — _dld_verify_build helper extracted (was inlined) ─────
# Plan 105-01 ports update.sh:287-295 verify_build() to a named helper for
# reuse + grepability. Closes RESEARCH G1.
info "TEST 16: 105-01 — _dld_verify_build helper extraction"

if grep -qE '^_dld_verify_build\(\)' "$DEPLOY_SH"; then
    pass "_dld_verify_build() function defined"
else
    fail "_dld_verify_build() function NOT found"
fi

# Helper body must contain the canonical update.sh:289-294 logic
if grep -qE 'BUILD-FAIL.*produced empty' "$DEPLOY_SH"; then
    pass "BUILD-FAIL literal preserved (matches update.sh:291)"
else
    fail "BUILD-FAIL literal missing"
fi

# At least 3 call sites: @livos/config + @livos/ui + @liv/<pkg> loop
verify_count=$(grep -cE '_dld_verify_build ' "$DEPLOY_SH")
if (( verify_count >= 4 )); then
    pass "_dld_verify_build called >=4x (1 def + 3+ sites): $verify_count occurrences"
else
    fail "_dld_verify_build only $verify_count occurrences (expected >=4: 1 def + 3 sites)"
fi

# No remaining inlined BUILD-FAIL `if [[ ! -d ... ]]` checks (negative — Task 1 should
# have replaced all three). Comments referencing BUILD-FAIL are OK.
inline_count=$(grep -cE '\[\[ ! -d "?\$\{?_DLD_LIVOS_DIR.*dist|\[\[ ! -d "?\$pkg_dir/dist' "$DEPLOY_SH")
if (( inline_count == 0 )); then
    pass "no inlined BUILD-FAIL [[ ! -d ... ]] guards remain (extracted to helper)"
else
    fail "$inline_count inlined BUILD-FAIL guards still present (should be 0 after extraction)"
fi

# ── TEST 19: 105-01 — anchored docker exclude (D-105-STEP2-EXCLUDE-ANCHORED) ─
# update.sh and CONTEXT.md require --exclude='/docker/' (anchored) NOT
# --exclude='docker/' which over-matched packages/ui/src/routes/docker/.
# Bug documented in memory: project_p104_deploy_gap.md bug #4.
info "TEST 19: 105-01 — anchored /docker/ rsync exclude"

# Positive: anchored form must be present
if grep -qE "exclude='/docker/'" "$DEPLOY_SH"; then
    pass "anchored --exclude='/docker/' present"
else
    fail "anchored --exclude='/docker/' NOT found"
fi

# Negative: un-anchored form must be GONE (was the bug)
if grep -qE "exclude='docker/'" "$DEPLOY_SH"; then
    fail "un-anchored --exclude='docker/' STILL present (over-matches UI routes/docker/)"
else
    pass "un-anchored --exclude='docker/' fully removed"
fi

# ── TEST 31: 105-01 — _DLD_TEMP_DIR alias matches update.sh:174-178 convention ─
# update.sh uses TEMP_DIR="/tmp/livinity-update-$$". deploy-livinityd retains
# the persistent _DLD_STAGE_DIR for re-run speed but adds an alias for grep
# parity. PID-scoped + cleanup deferred to 105-02 (G7).
info "TEST 31: 105-01 — _DLD_TEMP_DIR alias defined"

if grep -qE '^_DLD_TEMP_DIR=' "$DEPLOY_SH"; then
    pass "_DLD_TEMP_DIR alias constant defined"
else
    fail "_DLD_TEMP_DIR alias NOT defined"
fi

# Alias references the existing _DLD_STAGE_DIR (proves it's an alias, not a divergent path)
if grep -qE '_DLD_TEMP_DIR="?\$\{?_DLD_STAGE_DIR' "$DEPLOY_SH"; then
    pass "_DLD_TEMP_DIR aliases _DLD_STAGE_DIR (persistent semantics preserved)"
else
    fail "_DLD_TEMP_DIR should alias _DLD_STAGE_DIR (got divergent path)"
fi

# ── TEST 17: 105-02 (G2) — apt streaming packages block ────────────────────
# update.sh:339-353: full list of streaming pkgs (ffmpeg + xdotool + ydotool +
# xvfb + fluxbox + VAAPI). Helper _dld_install_streaming_packages must port
# the block verbatim.
info "TEST 17: 105-02 G2 — streaming packages"

if grep -qE '^_dld_install_streaming_packages\(\)' "$DEPLOY_SH"; then
    pass "_dld_install_streaming_packages() function defined"
else
    fail "_dld_install_streaming_packages() function NOT found"
fi

# Extract the _dld_install_streaming_packages function body and grep for each
# package name as a whole word. The function uses multi-line apt-get install
# with backslash continuations, so a single-line regex against `apt-get install.*pkg`
# is insufficient — we need to grep within the function body for each pkg name.
streaming_fn_body=$(awk '/^_dld_install_streaming_packages\(\)/,/^}/' "$DEPLOY_SH")
for pkg in ffmpeg xdotool ydotool xvfb fluxbox; do
    if echo "$streaming_fn_body" | grep -qE "(^|[[:space:]])${pkg}([[:space:]]|\\\\|\$)"; then
        pass "apt-get install lists ${pkg}"
    else
        fail "apt-get install missing ${pkg}"
    fi
done

# ── TEST 18: 105-02 (G2) — ydotoold systemd unit template ──────────────────
# update.sh:381-395: conditional ydotoold.service write (only if desktop user
# UID≥1000 found). Template embedded as heredoc in deploy-livinityd.
info "TEST 18: 105-02 G2 — ydotoold systemd unit"

if grep -qE '/etc/systemd/system/ydotoold\.service' "$DEPLOY_SH"; then
    pass "ydotoold.service target path present"
else
    fail "ydotoold.service target path NOT found"
fi

if grep -qE 'ExecStart=/usr/bin/ydotoold' "$DEPLOY_SH"; then
    pass "ydotoold ExecStart present"
else
    fail "ydotoold ExecStart NOT found"
fi

if grep -qE 'getent passwd.*UID.*1000|awk.*1000' "$DEPLOY_SH"; then
    pass "desktop-user detection (UID≥1000) present"
else
    fail "desktop-user detection NOT found"
fi

# ── TEST 20: 105-02 (G3) — atomic update.sh self-rsync (.new + mv) ─────────
# update.sh:419-430: cp to .new + mv pattern. Atomic rename ensures running
# bash on a re-run doesn't read partial new content mid-execution.
info "TEST 20: 105-02 G3 — atomic update.sh self-rsync (.new + mv)"

if grep -qE 'update\.sh\.new' "$DEPLOY_SH"; then
    pass "update.sh.new staging path present"
else
    fail "update.sh.new staging path NOT found"
fi

if grep -qE 'mv.*update\.sh\.new.*update\.sh' "$DEPLOY_SH"; then
    pass "atomic mv update.sh.new → update.sh present"
else
    fail "atomic mv pattern NOT found"
fi

# ── TEST 21: 105-02 (G5) — gallery cache helper ────────────────────────────
# update.sh:596-610: find $LIVOS_DIR/data/app-stores/*livinity-apps* + git
# fetch + git reset --hard origin/main. Idempotent on missing .git.
info "TEST 21: 105-02 G5 — gallery cache update"

if grep -qE '^_dld_update_gallery_cache\(\)' "$DEPLOY_SH"; then
    pass "_dld_update_gallery_cache() function defined"
else
    fail "_dld_update_gallery_cache() function NOT found"
fi

if grep -qE 'app-stores.*livinity-apps' "$DEPLOY_SH"; then
    pass "gallery cache target (app-stores/*livinity-apps*) present"
else
    fail "gallery cache target NOT found"
fi

if grep -qE 'git fetch.*origin' "$DEPLOY_SH"; then
    pass "git fetch origin pattern present"
else
    fail "git fetch origin NOT found"
fi

# ── TEST 22: 105-02 (G6) — chown -R helper ─────────────────────────────────
# update.sh:619-620: chown -R LIVOS_USER:LIVOS_USER on /opt/livos + /opt/liv.
# Default LIVOS_USER=root for first-install (matches update.sh).
info "TEST 22: 105-02 G6 — chown helper"

if grep -qE '^_dld_fix_permissions\(\)' "$DEPLOY_SH"; then
    pass "_dld_fix_permissions() function defined"
else
    fail "_dld_fix_permissions() function NOT found"
fi

if grep -qE 'chown -R.*_DLD_LIVOS_DIR|chown -R.*_DLD_LIVOS_USER.*_DLD_LIVOS_DIR|chown -R.*livos_user.*_DLD_LIVOS_DIR' "$DEPLOY_SH"; then
    pass "chown -R targets _DLD_LIVOS_DIR"
else
    fail "chown -R for _DLD_LIVOS_DIR NOT found"
fi

if grep -qE 'chown -R.*_DLD_LIV_DIR|chown -R.*_DLD_LIVOS_USER.*_DLD_LIV_DIR|chown -R.*livos_user.*_DLD_LIV_DIR' "$DEPLOY_SH"; then
    pass "chown -R targets _DLD_LIV_DIR"
else
    fail "chown -R for _DLD_LIV_DIR NOT found"
fi

# ── TEST 23: 105-02 (G6) — app-script chmod +x ─────────────────────────────
# update.sh:616: chmod +x on legacy-compat/app-script. Without it, tRPC apps
# router returns 500 on first-install hosts.
info "TEST 23: 105-02 G6 — app-script chmod +x"

if grep -qE 'chmod \+x.*legacy-compat/app-script' "$DEPLOY_SH"; then
    pass "chmod +x on legacy-compat/app-script present"
else
    fail "chmod +x on legacy-compat/app-script NOT found"
fi

# ── TEST 24: 105-02 (G7) — temp dir cleanup ────────────────────────────────
# update.sh:672-682: rm -rf TEMP_DIR + LIVOS_UPDATE_COMPLETED=1 sentinel.
# Gated on _DLD_CLEAR_STAGE for re-run cache preservation.
info "TEST 24: 105-02 G7 — temp dir cleanup"

if grep -qE '^_dld_cleanup_temp_dir\(\)' "$DEPLOY_SH"; then
    pass "_dld_cleanup_temp_dir() function defined"
else
    fail "_dld_cleanup_temp_dir() function NOT found"
fi

if grep -qE 'LIVOS_UPDATE_COMPLETED=1' "$DEPLOY_SH"; then
    pass "LIVOS_UPDATE_COMPLETED=1 sentinel exported (forward-compat with update.sh phase33_finalize)"
else
    fail "LIVOS_UPDATE_COMPLETED=1 sentinel NOT found"
fi

# ── TEST 25: 105-02 (G8) — UI rm -rf dist before vite build ────────────────
# update.sh:531: rm -rf dist BEFORE vite build (Phase 51 v29.5 A2 defensive
# fresh-build). Prevents stale dist surviving deploys.
info "TEST 25: 105-02 G8 — UI rm -rf dist"

if awk '/_dld_build_packages\(\)/,/^}/' "$DEPLOY_SH" | grep -qE 'rm -rf.*packages/ui/dist'; then
    pass "rm -rf packages/ui/dist present inside _dld_build_packages"
else
    fail "rm -rf packages/ui/dist NOT found inside _dld_build_packages"
fi

# ── TEST 26: D-105-NO-PROD-IMPACT — update.sh never opened for write ───────
# Critical invariant: deploy-livinityd ONLY READS from $_DLD_STAGE_DIR/update.sh
# (cp source) and WRITES to $_DLD_LIVOS_DIR/update.sh (cp target, atomic .new+mv).
# It MUST NEVER write directly to the repo's update.sh (canonical reference).
info "TEST 26: D-105-NO-PROD-IMPACT — repo update.sh never opened for write"

# Negative: no `> update.sh` or `cat ... > update.sh` redirect targeting the
# bare filename (the repo root version). Allowed: writes to $_DLD_LIVOS_DIR/update.sh
# and .new sibling — both qualify the path with $_DLD_LIVOS_DIR or absolute /opt/livos.
if grep -qE '^[^#]*>[[:space:]]*update\.sh[[:space:]]*$' "$DEPLOY_SH"; then
    fail "deploy-livinityd has bare > update.sh redirect (violates D-105-NO-PROD-IMPACT)"
else
    pass "no bare > update.sh redirect (repo update.sh untouched)"
fi

if grep -qE 'sed -i.*update\.sh[^A-Za-z._]|sed -i.*update\.sh$' "$DEPLOY_SH"; then
    fail "deploy-livinityd has sed -i on update.sh (violates D-105-NO-PROD-IMPACT)"
else
    pass "no sed -i on update.sh (repo canonical reference preserved)"
fi

# ── TEST 27: Pipeline order — health BEFORE caddy reload (Hazard #2) ───────
# RESEARCH §4 Hazard #2: if Caddy reloads before livos.service is verified up,
# Caddy reverse_proxies to a dead :8080 → 502 window 5-30s during install.
info "TEST 27: pipeline order — _dld_health_check BEFORE _dld_update_caddy_to_livinityd"

order_body_p105=$(awk '/^deploy_livinityd\(\)/,/^}/' "$DEPLOY_SH")
health_line=$(echo "$order_body_p105" | grep -n '_dld_health_check' | head -1 | cut -d: -f1)
caddy_line=$(echo "$order_body_p105" | grep -n '_dld_update_caddy_to_livinityd' | head -1 | cut -d: -f1)
if [[ -n "$health_line" ]] && [[ -n "$caddy_line" ]] && (( health_line < caddy_line )); then
    pass "_dld_health_check before _dld_update_caddy_to_livinityd (health=$health_line caddy=$caddy_line)"
else
    fail "health check must come BEFORE caddy reload (health=$health_line caddy=$caddy_line)"
fi

# ── TEST 28: Pipeline order — dist-copy BEFORE livos.service (Hazard #3) ───
# RESEARCH §4 Hazard #3: if dist-copy runs AFTER livos.service start, livinityd
# boots with stale @liv/* dist and crashes on first SDK runner spawn.
info "TEST 28: pipeline order — _dld_sync_liv_dist_into_pnpm_store BEFORE _dld_write_systemd_unit"

sync_line_p105=$(echo "$order_body_p105" | grep -n '_dld_sync_liv_dist_into_pnpm_store' | head -1 | cut -d: -f1)
livos_unit_line=$(echo "$order_body_p105" | grep -n '_dld_write_systemd_unit' | grep -v 'liv' | head -1 | cut -d: -f1)
if [[ -n "$sync_line_p105" ]] && [[ -n "$livos_unit_line" ]] && (( sync_line_p105 < livos_unit_line )); then
    pass "dist-copy before livos.service unit (sync=$sync_line_p105 livos=$livos_unit_line)"
else
    fail "dist-copy must come BEFORE livos.service unit (sync=$sync_line_p105 livos=$livos_unit_line)"
fi

# ── TEST 28b: D-105-STEP8-DAEMON-RELOAD — explicit daemon-reload before enable ─
# Without daemon-reload between unit writes and systemctl enable, systemd may
# enable stale-cached unit definitions. update.sh:629 always pairs unit writes
# with daemon-reload — deploy-livinityd must mirror this.
info "TEST 28b: D-105-STEP8-DAEMON-RELOAD — systemctl daemon-reload present"

if grep -qE 'systemctl[[:space:]]+daemon-reload' "$DEPLOY_SH"; then
    pass "systemctl daemon-reload present (guards against stale unit caching)"
else
    fail "systemctl daemon-reload NOT found (D-105-STEP8-DAEMON-RELOAD regression)"
fi

# ── TEST 28c: D-105-STEP8-START-ORDER — memory → worker → core start order ──
# update.sh:664 starts liv-* services in memory → worker → core order so that
# core (which depends on memory + worker over IPC) finds them alive when
# initializing. The for-loop iteration order encodes this dependency.
info "TEST 28c: D-105-STEP8-START-ORDER — for svc in memory worker core"

if grep -qE 'for[[:space:]]+svc[[:space:]]+in[[:space:]]+liv-memory[[:space:]]+liv-worker[[:space:]]+liv-core' "$DEPLOY_SH"; then
    pass "for-loop iterates liv-memory → liv-worker → liv-core (matches update.sh)"
elif grep -qE 'for[[:space:]]+svc[[:space:]]+in[[:space:]]+memory[[:space:]]+worker[[:space:]]+core' "$DEPLOY_SH"; then
    pass "for-loop iterates memory → worker → core (bare-package form, matches update.sh order)"
else
    fail "liv-* start order NOT in memory→worker→core sequence (D-105-STEP8-START-ORDER regression)"
fi

# ── TEST 28d: D-105-STEP8-HEALTH-CHECK — WARN, not FAIL on :8080 unreachable ─
# Per CONTEXT D-105-STEP8-HEALTH-CHECK: health check times out at 30s but does
# NOT fail() the installer — the operator must investigate post-install via
# journalctl. Without this WARN-semantic, a slow-boot livinityd kills the
# entire deploy on hosts with cold-cache pnpm.
info "TEST 28d: D-105-STEP8-HEALTH-CHECK — warn-semantic on :8080 timeout"

# Extract _dld_health_check body, look for warn + 'did not respond' / 'Continuing'
# pattern. NEGATIVE check: no `fail` call inside the health-check function body.
health_body=$(awk '/^_dld_health_check\(\)/,/^}/' "$DEPLOY_SH")
if echo "$health_body" | grep -qE 'warn[[:space:]].*(did not respond|did not pass|timed out|investigate)'; then
    pass "health check uses warn (not fail) on :8080 timeout"
else
    fail "health check missing warn-semantic on timeout (D-105-STEP8-HEALTH-CHECK regression)"
fi
if echo "$health_body" | grep -qE '^[[:space:]]*fail[[:space:]]+"'; then
    fail "health check contains fail() call — D-105-STEP8-HEALTH-CHECK requires warn-only"
else
    pass "health check has no fail() call inside body (WARN-only semantic preserved)"
fi

# ── TEST 29: Hazard #1 — _dld_setup_postgres uses shell-scope $pg_pass / $_DLD_PG_PASS ─
# RESEARCH §4 Hazard #1: after Plan 105-01 reorders _dld_write_env_file earlier
# in the pipeline, _dld_setup_postgres must NOT regress to inline-grepping
# DATABASE_URL out of the env-file at the PGPASSWORD assignment line. The
# password must come from a shell-scope variable (local pg_pass or exported
# _DLD_PG_PASS) so the schema apply works on first-install where .env may be
# empty/partial at that moment.
info "TEST 29: Hazard #1 — postgres password sourced from shell-scope, not env-file grep at PGPASSWORD"

# Extract _dld_setup_postgres function body
pg_fn_body=$(awk '/^_dld_setup_postgres\(\) \{/,/^\}/' "$DEPLOY_SH")

# POSITIVE: PGPASSWORD assignment uses shell-scope variable (pg_pass or _DLD_PG_PASS)
if echo "$pg_fn_body" | grep -qE 'PGPASSWORD="?\$\{?(pg_pass|_DLD_PG_PASS)\}?"?'; then
    pass "PGPASSWORD uses shell-scope \$pg_pass or \$_DLD_PG_PASS (correct)"
else
    fail "PGPASSWORD must use shell-scope variable (\$pg_pass / \$_DLD_PG_PASS) — Hazard #1 regression"
fi

# NEGATIVE: no inline grep substitution on env-file AT the PGPASSWORD assignment
# (a `$(grep ... env-file)` substitution feeding PGPASSWORD is the regression
# pattern we want to catch). Allowed: a grep earlier in the function to reuse
# an existing password into the LOCAL pg_pass variable, then PGPASSWORD="$pg_pass".
if echo "$pg_fn_body" | grep -qE 'PGPASSWORD="?\$\(grep'; then
    fail "PGPASSWORD assigned from inline \$(grep ... env-file) — Hazard #1 regression"
else
    pass "no inline \$(grep ... env-file) feeding PGPASSWORD (correct)"
fi

# ── TEST 30: Sacred SHA — sdk-agent-runner.ts NEVER opened for write ───────
# Sacred constraint: liv/packages/core/src/sdk-agent-runner.ts SHA
# f3538e1d811992b782a9bb057d1b7f0a0189f95f must never change. deploy-livinityd
# only READS the file (via rsync of /opt/liv from clone) and never WRITES to it.
info "TEST 30: sacred SHA — sdk-agent-runner.ts negative-grep on writes"

if grep -qE '^[^#]*>[[:space:]]*.*sdk-agent-runner' "$DEPLOY_SH"; then
    fail "deploy-livinityd has redirect targeting sdk-agent-runner.ts (sacred SHA violation)"
else
    pass "no redirect targeting sdk-agent-runner.ts"
fi

if grep -qE 'sed -i.*sdk-agent-runner|sed.*-i.*sdk-agent-runner' "$DEPLOY_SH"; then
    fail "deploy-livinityd has sed -i on sdk-agent-runner.ts (sacred SHA violation)"
else
    pass "no sed -i on sdk-agent-runner.ts"
fi

# ── TEST 32a: livos.service heredoc-write via $_DLD_SYSTEMD_UNIT ───────────
# deploy-livinityd.sh line 561 area: `cat > "$_DLD_SYSTEMD_UNIT" <<EOF`.
# Note: the unit target path is via variable reference (NOT literal
# /etc/systemd/system/livos.service in the heredoc redirect line).
info "TEST 32a: livos.service heredoc-write via \$_DLD_SYSTEMD_UNIT"

if grep -qE 'cat > "?\$\{?_DLD_SYSTEMD_UNIT\}?"? *<<' "$DEPLOY_SH"; then
    pass "cat > \$_DLD_SYSTEMD_UNIT heredoc present (livos.service write)"
else
    fail "cat > \$_DLD_SYSTEMD_UNIT heredoc NOT found"
fi

# ── TEST 32b: _DLD_SYSTEMD_LIV_CORE_UNIT constant defined ──────────────────
# liv-* units are written inside a for-loop via `cat > "$unit_path" <<EOF`.
# The unit_path comes from one of three constants — we positive-grep each.
info "TEST 32b: _DLD_SYSTEMD_LIV_CORE_UNIT constant defined"

if grep -qE '^_DLD_SYSTEMD_LIV_CORE_UNIT=.*liv-core\.service' "$DEPLOY_SH"; then
    pass "_DLD_SYSTEMD_LIV_CORE_UNIT defined and points at liv-core.service"
else
    fail "_DLD_SYSTEMD_LIV_CORE_UNIT constant NOT found or wrong target"
fi

# ── TEST 32c: _DLD_SYSTEMD_LIV_WORKER_UNIT constant defined ────────────────
info "TEST 32c: _DLD_SYSTEMD_LIV_WORKER_UNIT constant defined"

if grep -qE '^_DLD_SYSTEMD_LIV_WORKER_UNIT=.*liv-worker\.service' "$DEPLOY_SH"; then
    pass "_DLD_SYSTEMD_LIV_WORKER_UNIT defined and points at liv-worker.service"
else
    fail "_DLD_SYSTEMD_LIV_WORKER_UNIT constant NOT found or wrong target"
fi

# ── TEST 32d: _DLD_SYSTEMD_LIV_MEMORY_UNIT constant defined ────────────────
info "TEST 32d: _DLD_SYSTEMD_LIV_MEMORY_UNIT constant defined"

if grep -qE '^_DLD_SYSTEMD_LIV_MEMORY_UNIT=.*liv-memory\.service' "$DEPLOY_SH"; then
    pass "_DLD_SYSTEMD_LIV_MEMORY_UNIT defined and points at liv-memory.service"
else
    fail "_DLD_SYSTEMD_LIV_MEMORY_UNIT constant NOT found or wrong target"
fi

# ── TEST 32e: ydotoold.service heredoc (literal path — 105-02 G2 addition) ─
# Plan 105-02 G2 adds an unconditional ydotoold.service heredoc with the
# literal /etc/systemd/system/ydotoold.service path inside the heredoc
# redirect line. This is the ONLY systemd unit written with a literal path
# (the 4 liv* units use variable refs).
info "TEST 32e: ydotoold.service heredoc with literal /etc/systemd/system path"

if grep -qE 'cat > /etc/systemd/system/ydotoold\.service' "$DEPLOY_SH"; then
    pass "ydotoold.service literal-path heredoc present (105-02 G2)"
else
    fail "ydotoold.service heredoc NOT found (105-02 G2 regression)"
fi

# ── Plan 105-05 regression tests (Bug #1-#5 UAT back-port) ──────────────────
# Five assertions covering each in-scope bug discovered during Phase 105
# live UAT walk on mainserver 154.53.56.75 (Ubuntu 24.04.3 + pnpm 11.1.1).
# See UAT-CHECKLIST.md "Bugs discovered during UAT" section for full
# root-cause + reproduction details.

# TEST 34: Bug #1 — pnpm install uses --config.dangerously-allow-all-builds=true
# pnpm 11+ exits non-zero on ERR_PNPM_IGNORED_BUILDS; Mini PC's older pnpm doesn't.
# Both --frozen-lockfile and fallback paths need the flag.
info "TEST 34 (Bug #1): pnpm install uses --config.dangerously-allow-all-builds=true"

pnpm_lines=$(grep -cE 'pnpm install --config\.dangerously-allow-all-builds=true' "$DEPLOY_SH" || echo 0)
if (( pnpm_lines >= 3 )); then
    pass "pnpm install passes --config.dangerously-allow-all-builds=true on all 3 invocations (105-05 Bug #1)"
else
    fail "pnpm install MISSING --config.dangerously-allow-all-builds=true on some/all invocations (found $pnpm_lines, expected ≥3)"
fi

# TEST 35: Bug #2 — _dld_update_gallery_cache find pipeline tolerates missing dir
# Under set -euo pipefail, `find /nonexistent | head -1` kills script silently
# at the local-var assignment. Append `|| true` to make missing-dir tolerable.
info "TEST 35 (Bug #2): gallery_cache_dir find pipeline has || true"

if grep -qE "gallery_cache_dir=\\\$\\(find.*-name '\\*livinity-apps\\*'.*\\| head -1\\) \\|\\| true" "$DEPLOY_SH"; then
    pass "gallery_cache_dir find pipeline tolerates missing /opt/livos/data/app-stores/ via || true (105-05 Bug #2)"
else
    fail "gallery_cache_dir find pipeline MISSING || true tail — set -euo pipefail will kill script on fresh VPS (105-05 Bug #2 regression)"
fi

# TEST 36: Bug #3 — _dld_fix_permissions chmods source/cli.ts to +x
# After rsync, cli.ts inherits 0600 (no +x). systemd ExecStart invokes
# ./source/cli.ts via shebang → Permission denied without +x.
info "TEST 36 (Bug #3): _dld_fix_permissions chmods source/cli.ts +x"

if awk '/^_dld_fix_permissions\(\) \{/,/^\}/' "$DEPLOY_SH" | grep -qE 'chmod \+x .*packages/livinityd/source/cli\.ts'; then
    pass "_dld_fix_permissions chmods cli.ts +x (105-05 Bug #3)"
else
    fail "_dld_fix_permissions does NOT chmod cli.ts +x — livos.service will fail with Permission denied (105-05 Bug #3 regression)"
fi

# TEST 37: Bug #4 — _dld_update_caddy_to_livinityd chmods Caddyfile 0644
# Default root umask writes Caddyfile 0600; caddy user can't read.
# (Cannot use awk function-body extraction here — Caddyfile heredocs contain
#  literal `}` that prematurely end awk's /^\}/ range. Use direct grep.)
info "TEST 37 (Bug #4): _dld_update_caddy_to_livinityd chmods Caddyfile 0644"

if grep -qE 'chmod 0644 "\$_DLD_CADDYFILE"' "$DEPLOY_SH"; then
    pass "_dld_update_caddy_to_livinityd chmods Caddyfile 0644 (105-05 Bug #4)"
else
    fail "_dld_update_caddy_to_livinityd does NOT chmod Caddyfile 0644 — caddy user will get permission denied (105-05 Bug #4 regression)"
fi

# TEST 38: Bug #5 — livos.service ExecStart uses npx tsx + --data-directory + --port
# The previous `pnpm --filter livinityd start` runs cli.ts WITHOUT args; livinityd
# constructor crashes at path.resolve(undefined). Must match Mini PC pattern.
info "TEST 38 (Bug #5): livos.service ExecStart uses npx tsx with --data-directory + --port"

if awk '/^_dld_write_systemd_unit\(\) \{/,/^\}/' "$DEPLOY_SH" | grep -qE 'ExecStart=/usr/bin/npx tsx .*cli\.ts --data-directory .* --port'; then
    pass "livos.service ExecStart matches Mini PC pattern (npx tsx + --data-directory + --port) (105-05 Bug #5)"
else
    fail "livos.service ExecStart does NOT match Mini PC pattern — livinityd will crash at path.resolve(undefined) (105-05 Bug #5 regression)"
fi

# Negative: pnpm --filter livinityd start MUST NOT appear in unit-write helper
# (the old broken pattern). Catches any partial revert.
info "TEST 38b (Bug #5 negative): no 'pnpm --filter livinityd start' in livos.service"

if awk '/^_dld_write_systemd_unit\(\) \{/,/^\}/' "$DEPLOY_SH" | grep -qE 'ExecStart=.*pnpm --filter livinityd start'; then
    fail "livos.service still uses 'pnpm --filter livinityd start' — this is the buggy pattern from Phase 104-11 that 105-05 Bug #5 fixes"
else
    pass "livos.service does not use buggy 'pnpm --filter livinityd start' pattern (105-05 Bug #5 negative)"
fi

# TEST 39: Bug #6 — _dld_setup_docker_images helper present (Mini PC pattern)
# Phase 105 UAT discovered livinityd's legacy-compat docker-compose references
# livos/auth-server:1.0.5 + livos/tor:0.4.7.8 by image: field. These don't exist
# under livos/* on Docker Hub — they're local re-tags of getumbrel/* per
# Mini PC's livos/install.sh:408-443 setup_docker_images() pattern.
info "TEST 39 (Bug #6): _dld_setup_docker_images helper defined"

if grep -qE '^_dld_setup_docker_images\(\) \{' "$DEPLOY_SH"; then
    pass "_dld_setup_docker_images helper defined (105-05 Bug #6)"
else
    fail "_dld_setup_docker_images helper MISSING — livinityd Apps module will crash on docker compose up (105-05 Bug #6 regression)"
fi

# TEST 40: Bug #6 — helper pulls getumbrel/auth-server:1.0.5 + retags as livos/*
info "TEST 40 (Bug #6): pull+retag entries for auth-server + tor"

if grep -qE '"getumbrel/auth-server:1\.0\.5\|livos/auth-server:1\.0\.5"' "$DEPLOY_SH" && \
   grep -qE '"getumbrel/tor:0\.4\.7\.8\|livos/tor:0\.4\.7\.8"' "$DEPLOY_SH"; then
    pass "pull+retag entries match Mini PC pattern (getumbrel/* → livos/*) (105-05 Bug #6)"
else
    fail "pull+retag entries MISSING or malformed (expected Mini PC livos/install.sh:413-414 pattern) (105-05 Bug #6 regression)"
fi

# TEST 41: Bug #6 — pipeline calls _dld_setup_docker_images between streaming
# packages and JWT secret generation (image setup is a runtime dep, not a build dep)
info "TEST 41 (Bug #6): pipeline calls _dld_setup_docker_images after streaming pkgs"

if awk '/^deploy_livinityd\(\) \{/,/^\}/' "$DEPLOY_SH" | \
   grep -B0 -A2 '_dld_install_streaming_packages' | grep -q '_dld_setup_docker_images'; then
    pass "deploy_livinityd calls _dld_setup_docker_images after streaming packages (105-05 Bug #6)"
else
    fail "deploy_livinityd pipeline does NOT call _dld_setup_docker_images right after _dld_install_streaming_packages (105-05 Bug #6 regression)"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo
echo "================================================================"
echo "  Plan 104-11/12/13 + 105-01/02/03/05 (+Bug6) test results: $pass_count PASS, $fail_count FAIL"
echo "================================================================"
if (( fail_count > 0 )); then
    exit 1
fi
exit 0
