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

# ── LIVOS-043 (262 WS3): scoped LIVINITYD_FAIL2BAN fail2ban grant ────────────
# The blanket 99-bruce drop-in provisioning is gone (deploy-livinityd.sh);
# the fail2ban Settings panel must keep working via this narrow alias invoked
# with `sudo -n` from fail2ban-admin/client.ts.
info "LIVOS-043: LIVINITYD_FAIL2BAN scoped fail2ban grant"
if grep -qE "^Cmnd_Alias[[:space:]]+LIVINITYD_FAIL2BAN[[:space:]]*=" "$SUDOERS_FILE"; then
    pass "LIVOS-043: Cmnd_Alias LIVINITYD_FAIL2BAN present"
else
    fail "LIVOS-043: Cmnd_Alias LIVINITYD_FAIL2BAN missing"
fi

# Alias must grant ONLY /usr/bin/fail2ban-client subcommand shapes — exactly
# the argv set fail2ban-admin/client.ts builds. NEVER a bare
# `/usr/bin/fail2ban-client *` (that would also grant the global-flush
# `unban`, config reload, `set ... action*`, etc.).
f2b_line=$(grep -E "^Cmnd_Alias[[:space:]]+LIVINITYD_FAIL2BAN[[:space:]]*=" "$SUDOERS_FILE" \
    | sed -E 's/^Cmnd_Alias[[:space:]]+LIVINITYD_FAIL2BAN[[:space:]]*=[[:space:]]*//')
f2b_bad=0
IFS=',' read -ra f2b_members <<< "$f2b_line"
for m in "${f2b_members[@]}"; do
    m_trimmed=$(echo "$m" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')
    case "$m_trimmed" in
        "/usr/bin/fail2ban-client status") ;;
        "/usr/bin/fail2ban-client status *") ;;
        "/usr/bin/fail2ban-client set * banip *") ;;
        "/usr/bin/fail2ban-client set * unbanip *") ;;
        "/usr/bin/fail2ban-client set * addignoreip *") ;;
        *)
            fail "LIVOS-043: unexpected LIVINITYD_FAIL2BAN member: '$m_trimmed'"
            f2b_bad=1
            ;;
    esac
done
if [[ $f2b_bad -eq 0 && -n "$f2b_line" ]]; then
    pass "LIVOS-043: LIVINITYD_FAIL2BAN grants ONLY the exact fail2ban-client status/banip/unbanip/addignoreip shapes"
fi

# Alias must be wired into a bruce ALL=(root) NOPASSWD: user-spec line
# (fail2ban-client talks to the root-owned /var/run/fail2ban socket).
if grep -qE "^bruce[[:space:]]+ALL=\(root\)[[:space:]]+NOPASSWD:.*LIVINITYD_FAIL2BAN" "$SUDOERS_FILE"; then
    pass "LIVOS-043: LIVINITYD_FAIL2BAN referenced by a bruce ALL=(root) NOPASSWD: user-spec"
else
    fail "LIVOS-043: LIVINITYD_FAIL2BAN not referenced by a bruce ALL=(root) line"
fi

# Re-assert the no-blanket invariant FILE-WIDE (AC-192-01-3 covers active
# rules; this LIVOS-043 lock also covers comments — header reworded in 262-03).
if grep -qE "NOPASSWD: ?ALL([[:space:]]|,|$)" "$SUDOERS_FILE"; then
    fail "LIVOS-043: blanket NOPASSWD ALL text present (active rule or comment)"
else
    pass "LIVOS-043: zero blanket NOPASSWD ALL occurrences anywhere in fragment"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
echo "PASS: $pass_count   FAIL: $fail_count"
echo "─────────────────────────────────────────"
[[ $fail_count -eq 0 ]] && exit 0 || exit 1
