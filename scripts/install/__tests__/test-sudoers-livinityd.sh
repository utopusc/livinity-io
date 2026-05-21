#!/usr/bin/env bash
# scripts/install/__tests__/test-sudoers-livinityd.sh
# Phase 192-01 — verify scripts/install/sudoers.d/livinityd shape + syntax.
# CI-safe (no root, no /etc/ writes, no actual sudoers install).

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
SUDOERS_FILE="$REPO_ROOT/scripts/install/sudoers.d/livinityd"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0
pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── AC-192-01-1: file exists ─────────────────────────────────────────────────
info "AC-192-01-1: file existence"
if [[ -f "$SUDOERS_FILE" ]]; then
    pass "scripts/install/sudoers.d/livinityd exists"
else
    fail "scripts/install/sudoers.d/livinityd missing"
    exit 1
fi

# ── AC-192-01-2: `bruce ALL=(...)` rule line is present ──────────────────────
info "AC-192-01-2: bruce ALL=() rule present"
if grep -qE "^bruce[[:space:]]+ALL=\(" "$SUDOERS_FILE"; then
    pass "bruce ALL=(...) line present"
else
    fail "bruce ALL=(...) line missing"
fi

# ── AC-192-01-3: NO broad `NOPASSWD: ALL` grant ──────────────────────────────
info "AC-192-01-3: no broad NOPASSWD: ALL"
# Match `NOPASSWD: ALL` only when ALL stands alone (followed by end-of-line,
# whitespace, or comma) — not when ALL is a prefix of an alias name (e.g.,
# ALL_FILES). Skip comment lines (the security-model header text mentions
# NOPASSWD: ALL when describing what we are REPLACING).
violating=$(grep -nE "NOPASSWD:[[:space:]]+ALL([[:space:]]|,|$)" "$SUDOERS_FILE" \
    | grep -vE "^[0-9]+:[[:space:]]*#")
if [[ -n "$violating" ]]; then
    fail "broad NOPASSWD: ALL found (security regression): $violating"
else
    pass "no broad NOPASSWD: ALL grant on active rules"
fi

# ── AC-192-01-4: visudo -cf syntax check (skipped if visudo unavailable) ─────
info "AC-192-01-4: visudo -cf syntax"
if command -v visudo >/dev/null 2>&1; then
    if visudo -cf "$SUDOERS_FILE" >/dev/null 2>&1; then
        pass "visudo -cf clean"
    else
        # visudo may complain about a missing include directive context when
        # the file is not in /etc/sudoers.d/. Capture stderr to diagnose.
        visudo_out=$(visudo -cf "$SUDOERS_FILE" 2>&1 || true)
        fail "visudo -cf failed: $visudo_out"
    fi
else
    info "visudo not available on this host — skipping syntax check (production install runs it)"
    pass "visudo skip (CI-only)"
fi

# ── AC-192-01-5: every Cmnd_Alias is referenced by a `bruce ALL=` line ───────
info "AC-192-01-5: no orphan Cmnd_Alias entries"
# Extract Cmnd_Alias names (everything between `Cmnd_Alias` and `=`).
aliases=$(grep -E "^Cmnd_Alias[[:space:]]+[A-Z_][A-Z0-9_]*[[:space:]]*=" "$SUDOERS_FILE" \
    | sed -E 's/^Cmnd_Alias[[:space:]]+([A-Z_][A-Z0-9_]*)[[:space:]]*=.*/\1/')
orphan_count=0
for alias in $aliases; do
    if ! grep -qE "(bruce[[:space:]]+ALL=\(.*\)[[:space:]]+NOPASSWD:.*|,[[:space:]]*)${alias}([[:space:]]*,|[[:space:]]*$)" "$SUDOERS_FILE"; then
        fail "Cmnd_Alias $alias defined but not referenced by any bruce ALL= line"
        orphan_count=$((orphan_count + 1))
    fi
done
if [[ "$orphan_count" -eq 0 ]]; then
    alias_count=$(echo "$aliases" | wc -w)
    pass "all $alias_count Cmnd_Alias entries referenced"
fi

# ── AC-192-01-6: header docs the 0440 root:root deploy mode ──────────────────
info "AC-192-01-6: header deploy instructions"
if grep -qE "install\s+-m\s+0440" "$SUDOERS_FILE"; then
    pass "header documents install -m 0440 deploy"
else
    fail "header missing 0440 deploy instructions"
fi

# ── AC-192-01-7: at least one Cmnd_Alias is defined (sanity) ─────────────────
info "AC-192-01-7: at least one Cmnd_Alias defined"
cmnd_alias_count=$(grep -cE "^Cmnd_Alias[[:space:]]" "$SUDOERS_FILE")
if (( cmnd_alias_count >= 1 )); then
    pass "$cmnd_alias_count Cmnd_Alias entries defined"
else
    fail "no Cmnd_Alias entries (file is empty or comment-only)"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
echo "PASS: $pass_count   FAIL: $fail_count"
echo "─────────────────────────────────────────"
[[ $fail_count -eq 0 ]] && exit 0 || exit 1
