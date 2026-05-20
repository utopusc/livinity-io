#!/usr/bin/env bash
# scripts/install/__tests__/test-systemd-env-liv-vault-root.sh
# Phase 173-04 — verify _dld_write_systemd_unit emits Environment=LIV_VAULT_ROOT=/root/liv
# CI-safe: stubs _DLD_* paths under tmpdir, no systemctl, no real /etc/.

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
DEPLOY_SH="$REPO_ROOT/scripts/install/deploy-livinityd.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0
pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── AC-173-04-1: shape — deploy script exists + bash -n clean ────────────────
info "AC-173-04-1: shape"
[[ -f "$DEPLOY_SH" ]] && pass "deploy-livinityd.sh exists" || { fail "deploy-livinityd.sh missing"; exit 1; }
bash -n "$DEPLOY_SH" 2>/dev/null && pass "bash -n clean" || fail "bash -n failed"

# ── AC-173-04-2: source-grep — the literal Environment line is in the heredoc ─
info "AC-173-04-2: source grep for Environment line"
if grep -qF "Environment=LIV_VAULT_ROOT=/root/liv" "$DEPLOY_SH"; then
    pass "Environment=LIV_VAULT_ROOT=/root/liv present in source"
else
    fail "Environment=LIV_VAULT_ROOT=/root/liv missing from source"
fi

# ── AC-173-04-3: comment marker — Phase 173-04 comment line is present ───────
info "AC-173-04-3: Phase 173-04 comment present"
if grep -qF "# Phase 173-04" "$DEPLOY_SH"; then
    pass "Phase 173-04 comment marker present"
else
    fail "Phase 173-04 comment marker missing"
fi

# ── AC-173-04-4: positional invariant — Environment= is between EnvironmentFile= and ExecStart= ─
info "AC-173-04-4: ordering — Environment= between EnvironmentFile= and ExecStart="
env_file_line=$(grep -n "EnvironmentFile=" "$DEPLOY_SH" | head -1 | cut -d: -f1)
env_line=$(grep -n "Environment=LIV_VAULT_ROOT=/root/liv" "$DEPLOY_SH" | head -1 | cut -d: -f1)
exec_line=$(grep -n "ExecStart=/usr/bin/npx tsx" "$DEPLOY_SH" | head -1 | cut -d: -f1)
if [[ -n "$env_file_line" && -n "$env_line" && -n "$exec_line" ]]; then
    if (( env_file_line < env_line && env_line < exec_line )); then
        pass "ordering correct (line $env_file_line < $env_line < $exec_line)"
    else
        fail "ordering wrong (EnvironmentFile=$env_file_line Environment=$env_line ExecStart=$exec_line)"
    fi
else
    fail "could not locate one of the marker lines (env_file=$env_file_line env=$env_line exec=$exec_line)"
fi

# ── AC-173-04-5: heredoc exec — source the function and trigger the heredoc ──
info "AC-173-04-5: source + invoke _dld_write_systemd_unit under sandbox"
SANDBOX=$(mktemp -d)
export _DLD_LIVOS_DIR="$SANDBOX/opt-livos"
export _DLD_SYSTEMD_UNIT="$SANDBOX/livos.service"
export _DLD_ENV_FILE="$SANDBOX/opt-livos/.env"
export _DLD_LIVOS_DATA_DIR="$SANDBOX/opt-livos/data"
export _DLD_LIVOS_PORT=8080
mkdir -p "$_DLD_LIVOS_DIR" "$_DLD_LIVOS_DATA_DIR"
touch "$_DLD_ENV_FILE"

# Stub helper functions that the deploy script expects from _logging.sh
step() { :; }; info()  { :; }; ok() { :; }; warn() { :; }; fail_helper() { :; }
export -f step info ok warn 2>/dev/null || true

# Stub systemctl so the function's daemon-reload / enable / reset-failed / restart calls are no-ops
systemctl() { return 0; }
export -f systemctl

# Source deploy-livinityd.sh in a SUBSHELL to isolate side-effects and stub the
# _logging.sh source line if it errors (we don't actually need the real loggers).
# NOTE: deploy-livinityd.sh sets _DLD_* constants unconditionally at top-level,
# so we MUST re-assign our sandbox paths AFTER source completes.
(
    # Re-shadow any logging function that the source line might overwrite
    source "$DEPLOY_SH" 2>/dev/null || true
    step() { :; }; info() { :; }; ok() { :; }; warn() { :; }
    # Re-pin sandbox paths post-source (top-level _DLD_*= assignments clobbered our exports)
    _DLD_LIVOS_DIR="$SANDBOX/opt-livos"
    _DLD_SYSTEMD_UNIT="$SANDBOX/livos.service"
    _DLD_ENV_FILE="$SANDBOX/opt-livos/.env"
    _DLD_LIVOS_DATA_DIR="$SANDBOX/opt-livos/data"
    _DLD_LIVOS_PORT=8080
    _dld_write_systemd_unit
) > "$SANDBOX/run.log" 2>&1 || true

if [[ -f "$_DLD_SYSTEMD_UNIT" ]]; then
    pass "unit file generated at $_DLD_SYSTEMD_UNIT"
else
    fail "unit file NOT generated; run.log: $(cat "$SANDBOX/run.log")"
    rm -rf "$SANDBOX"
    echo ""
    echo "PASS: $pass_count   FAIL: $fail_count"
    exit 1
fi

# ── AC-173-04-6: generated unit file contains Environment= line ──────────────
info "AC-173-04-6: generated unit content"
if grep -qF "Environment=LIV_VAULT_ROOT=/root/liv" "$_DLD_SYSTEMD_UNIT"; then
    pass "generated unit file contains Environment=LIV_VAULT_ROOT=/root/liv"
else
    fail "generated unit file missing Environment line. Content:"
    cat "$_DLD_SYSTEMD_UNIT" >&2
fi

# ── AC-173-04-7: generated unit file has correct section structure ───────────
info "AC-173-04-7: section structure"
for sect in "[Unit]" "[Service]" "[Install]"; do
    if grep -qF "$sect" "$_DLD_SYSTEMD_UNIT"; then
        pass "section $sect present"
    else
        fail "section $sect missing"
    fi
done

rm -rf "$SANDBOX"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
echo "PASS: $pass_count   FAIL: $fail_count"
echo "─────────────────────────────────────────"
[[ $fail_count -eq 0 ]] && exit 0 || exit 1
