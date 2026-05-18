#!/usr/bin/env bash
# scripts/install/__tests__/test-factory-reset.sh
# Phase 141-10 — regression for factory-reset.sh arg parsing + safety gates.
# All assertions are static / non-destructive: no PG drop, no rm -rf, no
# systemctl. We trip the safety gates (root check, --confirm-destroy gate)
# rather than letting the body run.
#
# Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f
#
# Invoke:  bash scripts/install/__tests__/test-factory-reset.sh
# Returns: exit 0 = all green; exit 1 = at least one failure

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
SCRIPT="$REPO_ROOT/scripts/install/factory-reset.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0

pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── TEST 0: bash -n (syntax check) ─────────────────────────────────────────
info "TEST 0: bash -n syntax check"
if bash -n "$SCRIPT" 2>/tmp/factory-reset-syntax.err; then
    pass "factory-reset.sh parses cleanly (bash -n)"
else
    fail "factory-reset.sh has syntax errors:"; cat /tmp/factory-reset-syntax.err | sed 's/^/    /'
fi
rm -f /tmp/factory-reset-syntax.err

# ── TEST 1: refuses without --confirm-destroy ──────────────────────────────
info "TEST 1: refuses to run without --confirm-destroy"
out=$(bash "$SCRIPT" 2>&1)
rc=$?
if [[ $rc -ne 0 ]] && echo "$out" | grep -q "Refusing to run without --confirm-destroy"; then
    pass "exits non-zero with refusal message when --confirm-destroy missing"
else
    fail "expected refusal, got exit=$rc out:"; echo "$out" | head -5 | sed 's/^/    /'
fi

# ── TEST 2: --help prints usage and exits 0 ────────────────────────────────
info "TEST 2: --help prints usage + exits 0"
out=$(bash "$SCRIPT" --help 2>&1)
rc=$?
if [[ $rc -eq 0 ]]; then
    pass "--help exits 0"
else
    fail "--help exited non-zero: $rc"
fi
if echo "$out" | grep -qE 'Usage:|factory-reset'; then
    pass "--help output mentions usage"
else
    fail "--help output missing usage marker"
fi

# ── TEST 3: unknown arg rejected with exit 64 ─────────────────────────────
info "TEST 3: unknown arg → exit 64"
out=$(bash "$SCRIPT" --pls-wipe 2>&1)
rc=$?
if [[ $rc -eq 64 ]]; then
    pass "unknown arg → exit 64"
else
    fail "expected exit 64, got $rc"
fi
if echo "$out" | grep -qF "unknown arg"; then
    pass "rejects with 'unknown arg' message"
else
    fail "missing 'unknown arg' message"
fi

# ── TEST 4: root-check refuses when not root ──────────────────────────────
info "TEST 4: non-root with --confirm-destroy → exits 1"
if [[ $EUID -ne 0 ]]; then
    out=$(bash "$SCRIPT" --confirm-destroy 2>&1)
    rc=$?
    if [[ $rc -ne 0 ]] && echo "$out" | grep -q "must run as root"; then
        pass "non-root invocation refused"
    else
        fail "expected non-root refusal, got exit=$rc"
    fi
else
    info "  running as root in CI — skipping non-root assertion"
    pass "skipped (running as root)"
fi

# ── TEST 5: script declares sacred SHA ─────────────────────────────────────
info "TEST 5: sacred SHA invariant in factory-reset.sh"
if grep -qF "f3538e1d811992b782a9bb057d1b7f0a0189f95f" "$SCRIPT"; then
    pass "sacred SHA present in factory-reset.sh"
else
    fail "sacred SHA MISSING from factory-reset.sh"
fi

# ── TEST 6: dry-run flag parses (would need root to actually reach body) ──
info "TEST 6: --dry-run + --confirm-destroy parse together"
out=$(bash "$SCRIPT" --dry-run --confirm-destroy 2>&1 || true)
# As non-root: hits the root check and exits 1 with "must run as root".
# As root: would print the banner + actually execute body in dry-run.
# We just want to confirm the parser accepted both flags.
if echo "$out" | grep -qE "must run as root|starting in"; then
    pass "--dry-run + --confirm-destroy accepted by arg parser"
else
    fail "arg parser may have rejected --dry-run + --confirm-destroy:"; echo "$out" | head -5 | sed 's/^/    /'
fi

# ── TEST 7: --keep-postgres flag parses ────────────────────────────────────
info "TEST 7: --keep-postgres + --confirm-destroy parse together"
out=$(bash "$SCRIPT" --keep-postgres --confirm-destroy --dry-run 2>&1 || true)
if echo "$out" | grep -qE "must run as root|starting in|Skipping PG"; then
    pass "--keep-postgres accepted by arg parser"
else
    fail "arg parser may have rejected --keep-postgres:"; echo "$out" | head -5 | sed 's/^/    /'
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo
if [[ $fail_count -eq 0 ]]; then
    echo -e "${GREEN}All $pass_count assertions PASSED${NC}"
    exit 0
else
    echo -e "${RED}$fail_count FAIL / $pass_count PASS${NC}"
    exit 1
fi
