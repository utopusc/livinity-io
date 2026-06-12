#!/usr/bin/env bash
# scripts/install/__tests__/test-migrate-to-bruce-user.sh
# Phase 192-02 — verify scripts/migrate-to-bruce-user.sh shape + idempotency.
# CI-safe: TEST_ROOT=<tmpdir> + DRY_RUN=1, no root, no real /opt/livos touched.

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
SCRIPT="$REPO_ROOT/scripts/migrate-to-bruce-user.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0
pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── AC-192-02-1: shape — file exists + bash -n clean ─────────────────────────
info "AC-192-02-1: shape — exists + bash -n"
if [[ -f "$SCRIPT" ]]; then
    pass "script exists"
else
    fail "script missing"
    exit 1
fi
if bash -n "$SCRIPT" 2>/dev/null; then
    pass "bash -n clean"
else
    fail "bash -n failed"
fi

# ── AC-192-02-2: source-grep — required keywords present ─────────────────────
info "AC-192-02-2: source-grep keywords"
# WS1 (2026-06-11): the chown target is now the parameterized $DESKTOP_USER
# (derives from the platform username, defaults to bruce) — assert the
# parameterized form, not a literal bruce.
grep -q 'chown -R \$DESKTOP_USER:\$DESKTOP_USER' "$SCRIPT" && pass "chown -R \$DESKTOP_USER:\$DESKTOP_USER present" || fail "parameterized chown -R \$DESKTOP_USER missing"
grep -q 'DESKTOP_USER=' "$SCRIPT" && pass "DESKTOP_USER var defined (platform-username-derived)" || fail "DESKTOP_USER var missing"
grep -q "bruce-migrated" "$SCRIPT" && pass "idempotency marker keyword present" || fail "marker missing"
grep -q "install -m 0440" "$SCRIPT" && pass "sudoers install -m 0440 present" || fail "sudoers install missing"
grep -q "usermod -aG docker" "$SCRIPT" && pass "docker group add present" || fail "docker group add missing"

# ── AC-192-02-3: idempotency — second run detects marker + exits 0 ───────────
info "AC-192-02-3: idempotency via TEST_ROOT mode"
TMPDIR_T=$(mktemp -d "${TMPDIR:-/tmp}/migrate-bruce-test.XXXXXX")
mkdir -p "$TMPDIR_T/data"
# First run: no marker → migration runs
out1=$(TEST_ROOT="$TMPDIR_T" DRY_RUN=1 bash "$SCRIPT" 2>&1); rc1=$?
if [[ $rc1 -eq 0 ]]; then
    pass "first run (no marker, DRY_RUN) exits 0"
else
    fail "first run exited $rc1 — output: $out1"
fi
# Force-create the marker (simulating successful first run) then re-run
touch "$TMPDIR_T/data/.bruce-migrated"
out2=$(TEST_ROOT="$TMPDIR_T" bash "$SCRIPT" 2>&1); rc2=$?
if [[ $rc2 -eq 0 ]] && echo "$out2" | grep -q "already migrated"; then
    pass "idempotency: second run with marker → 'already migrated' + exit 0"
else
    fail "idempotency check failed — rc=$rc2 out=$out2"
fi
rm -rf "$TMPDIR_T"

# ── AC-192-02-4: TEST_ROOT mode does not require root ────────────────────────
info "AC-192-02-4: TEST_ROOT bypasses root-required check"
TMPDIR_T=$(mktemp -d "${TMPDIR:-/tmp}/migrate-bruce-test.XXXXXX")
mkdir -p "$TMPDIR_T/data"
out=$(TEST_ROOT="$TMPDIR_T" DRY_RUN=1 bash "$SCRIPT" 2>&1); rc=$?
if [[ $rc -eq 0 ]]; then
    pass "TEST_ROOT mode runs as non-root"
else
    fail "TEST_ROOT mode failed: rc=$rc out=$out"
fi
rm -rf "$TMPDIR_T"

# ── AC-192-02-5: visudo syntax check is gated behind non-TEST_ROOT mode ──────
info "AC-192-02-5: visudo gate keyword"
grep -q "visudo -cf" "$SCRIPT" && pass "visudo -cf syntax check present" || fail "visudo -cf missing"

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
echo "PASS: $pass_count   FAIL: $fail_count"
echo "─────────────────────────────────────────"
[[ $fail_count -eq 0 ]] && exit 0 || exit 1
