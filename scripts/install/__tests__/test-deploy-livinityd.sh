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
# Internal helpers (prefixed with _dld_) should all be defined
for fn in _dld_install_system_packages _dld_setup_postgres _dld_setup_redis \
          _dld_clone_source _dld_build_packages _dld_generate_jwt_secret \
          _dld_write_env_file _dld_write_systemd_unit _dld_health_check \
          _dld_update_caddy_to_livinityd; do
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

# ── TEST 10: Scope boundary — liv-core/liv-worker NOT deployed by this plan ─
info "TEST 10: liv-core/liv-worker NOT in deploy-livinityd.sh"
# Should NOT have systemctl invocations for liv-core / liv-worker / liv-memory.
# These are documented as deferred to Plan 104-12.
if grep -qE 'systemctl.*liv-core|systemctl.*liv-worker|systemctl.*liv-memory' "$DEPLOY_SH"; then
    fail "deploy-livinityd.sh references liv-core/worker/memory (scope boundary violation)"
else
    pass "no liv-core/liv-worker/liv-memory systemctl calls (scope boundary preserved)"
fi
# And the file must mention Plan 104-12 to document the carry-forward
if grep -qE '104-12|liv-core.*defer|DEFER.*liv-core|DEFERRED' "$DEPLOY_SH"; then
    pass "deploy-livinityd.sh documents Plan 104-12 carry-forward for liv-core"
else
    fail "deploy-livinityd.sh should document Plan 104-12 carry-forward"
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

# ── Summary ─────────────────────────────────────────────────────────────────
echo
echo "================================================================"
echo "  Plan 104-11 test results: $pass_count PASS, $fail_count FAIL"
echo "================================================================"
if (( fail_count > 0 )); then
    exit 1
fi
exit 0
