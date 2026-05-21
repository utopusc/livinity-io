#!/usr/bin/env bash
# scripts/install/__tests__/test-systemd-user-bruce.sh
# Phase 192-02 — verify deploy-livinityd.sh emits User=bruce + Group=bruce in
# all 4 systemd unit heredocs and invokes _dld_run_bruce_migration before
# _dld_write_systemd_unit in the main flow.

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
DEPLOY_SH="$REPO_ROOT/scripts/install/deploy-livinityd.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0
pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── AC-192-02-T2-1: bash -n clean ────────────────────────────────────────────
info "AC-192-02-T2-1: bash -n clean"
if bash -n "$DEPLOY_SH" 2>/dev/null; then
    pass "bash -n clean"
else
    fail "bash -n failed"
    exit 1
fi

# ── AC-192-02-T2-2: User=bruce count ≥ 2 (livos + ≥1 liv-*) ──────────────────
info "AC-192-02-T2-2: User=bruce appearances"
# Heredoc lines look like `User=bruce` at column 0 (heredoc body indentation).
user_bruce_count=$(grep -cE "^User=bruce" "$DEPLOY_SH" || echo 0)
if (( user_bruce_count >= 2 )); then
    pass "User=bruce in ≥2 heredocs ($user_bruce_count occurrences)"
else
    fail "User=bruce in only $user_bruce_count locations (expected ≥2 for livos + liv-*)"
fi

# ── AC-192-02-T2-3: Group=bruce present ──────────────────────────────────────
info "AC-192-02-T2-3: Group=bruce present"
if grep -qE "^Group=bruce" "$DEPLOY_SH"; then
    group_count=$(grep -cE "^Group=bruce" "$DEPLOY_SH")
    pass "Group=bruce present ($group_count occurrences)"
else
    fail "Group=bruce missing"
fi

# ── AC-192-02-T2-4: User=root NOT in active heredocs ─────────────────────────
info "AC-192-02-T2-4: User=root absent from heredoc active lines"
# Exclude commented lines from match
violating=$(grep -nE "^User=root" "$DEPLOY_SH" || true)
if [[ -z "$violating" ]]; then
    pass "User=root absent from heredocs"
else
    fail "User=root still in heredocs: $violating"
fi

# ── AC-192-02-T2-5: migration script invocation present ──────────────────────
info "AC-192-02-T2-5: migration invocation present"
if grep -q "migrate-to-bruce-user.sh" "$DEPLOY_SH"; then
    pass "migrate-to-bruce-user.sh invocation present"
else
    fail "migrate-to-bruce-user.sh invocation missing"
fi

# ── AC-192-02-T2-6: positional invariant — migration BEFORE write_systemd_unit ─
info "AC-192-02-T2-6: ordering — _dld_run_bruce_migration before _dld_write_systemd_unit call"
# The function _dld_run_bruce_migration is referenced first (a) at its definition
# (NOT what we want to find) and (b) at the main-flow call site. We want the
# main-flow call. Skip function-def lines (start with `_dld_run_bruce_migration() {`)
# and grep for the bare call. The main flow has it as one of the orchestration
# calls in deploy_livinityd() — that line should be at indent ≥4 spaces.
mig_call_line=$(grep -n "^[[:space:]]\+_dld_run_bruce_migration[[:space:]]*$\|^[[:space:]]\+_dld_run_bruce_migration[[:space:]]\+#" "$DEPLOY_SH" | head -1 | cut -d: -f1)
# Find the LAST call-line of _dld_write_systemd_unit (excluding function def
# which is `_dld_write_systemd_unit() {`)
wu_call_line=$(grep -n "^[[:space:]]\+_dld_write_systemd_unit[[:space:]]*$\|^[[:space:]]\+_dld_write_systemd_unit[[:space:]]\+#" "$DEPLOY_SH" | tail -1 | cut -d: -f1)
if [[ -n "$mig_call_line" && -n "$wu_call_line" ]] && (( mig_call_line < wu_call_line )); then
    pass "migration call (line $mig_call_line) BEFORE write_systemd_unit call (line $wu_call_line)"
else
    fail "ordering wrong (mig_call=$mig_call_line write_unit_call=$wu_call_line)"
fi

# ── AC-192-02-T2-7: Phase 192-02 comment marker present ──────────────────────
info "AC-192-02-T2-7: Phase 192-02 comment marker"
if grep -q "Phase 192-02" "$DEPLOY_SH"; then
    marker_count=$(grep -c "Phase 192-02" "$DEPLOY_SH")
    pass "Phase 192-02 comment marker present ($marker_count occurrences)"
else
    fail "Phase 192-02 comment marker missing"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
echo "PASS: $pass_count   FAIL: $fail_count"
echo "─────────────────────────────────────────"
[[ $fail_count -eq 0 ]] && exit 0 || exit 1
