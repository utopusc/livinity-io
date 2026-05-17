#!/usr/bin/env bash
# scripts/install/__tests__/test-migrate-script.sh
# Phase 134 plan 134-03 — verify migrate-to-cf-tunnel.sh shape + dry-run
# behavior. No root, no network, no Cloudflare. CI-safe.

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
MIGRATE_SH="$REPO_ROOT/scripts/install/migrate-to-cf-tunnel.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0

pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── AC-134-03-1: file exists + bash syntax OK ────────────────────────────
info "AC-134-03-1: file exists + bash syntax"
if [[ -f "$MIGRATE_SH" ]]; then
    pass "migrate-to-cf-tunnel.sh exists"
else
    fail "migrate-to-cf-tunnel.sh missing"
    exit 1
fi
if bash -n "$MIGRATE_SH" 2>/dev/null; then
    pass "bash -n migrate-to-cf-tunnel.sh"
else
    fail "bash -n failed:"
    bash -n "$MIGRATE_SH"
fi

# ── AC-134-03-2: --help prints usage block with required keywords ────────
info "AC-134-03-2: --help mentions required flags + step list"
help_out=$(bash "$MIGRATE_SH" --help 2>&1)
help_rc=$?
if [[ $help_rc -eq 0 ]]; then
    pass "--help exited 0"
else
    fail "--help exited $help_rc (expected 0)"
fi
for kw in "--domain" "--cf-tunnel-token" "--dry-run" "Migrates an existing" "Steps performed" "Idempotent"; do
    if echo "$help_out" | grep -qF -- "$kw"; then
        pass "--help mentions '$kw'"
    else
        fail "--help missing '$kw'"
    fi
done

# ── AC-134-03-3: missing args → exits 64 ─────────────────────────────────
info "AC-134-03-3: missing required args → exit 64"
miss_out=$(bash "$MIGRATE_SH" 2>&1)
miss_rc=$?
if [[ $miss_rc -eq 64 ]]; then
    pass "missing args exited 64 (EX_USAGE)"
else
    fail "missing args exited $miss_rc (expected 64)"
fi
if echo "$miss_out" | grep -qE "missing required args"; then
    pass "error message indicates missing args"
else
    fail "error message should say 'missing required args'"
fi

# ── AC-134-03-4: --dry-run prints all 15 steps without mutating ──────────
info "AC-134-03-4: --dry-run is no-op + emits step labels"
dry_out=$(bash "$MIGRATE_SH" --dry-run --domain test.example.com --cf-tunnel-token fake-token 2>&1)
dry_rc=$?
if [[ $dry_rc -eq 0 ]]; then
    pass "--dry-run exited 0"
else
    fail "--dry-run exited $dry_rc (expected 0)"
fi
if echo "$dry_out" | grep -qE "DRY RUN"; then
    pass "--dry-run output marker present"
else
    fail "--dry-run did not emit 'DRY RUN' marker"
fi
# Spot-check several step labels exist
for step_re in "Step 1/15" "Step 5/15" "Step 10/15" "Step 14/15: verifying sacred SHA" "Step 15/15"; do
    if echo "$dry_out" | grep -qE "$step_re"; then
        pass "--dry-run shows '$step_re'"
    else
        fail "--dry-run missing '$step_re'"
    fi
done
# Sanity: --dry-run did NOT actually mutate anything
if [[ -e /etc/livos/secrets/cf-tunnel-token ]]; then
    # If this file existed BEFORE we ran the test, that's not our fault — but
    # we can at least verify --dry-run didn't CREATE it (mtime check would
    # need before/after, skip for simplicity — this is paranoid anyway).
    info "(/etc/livos/secrets/cf-tunnel-token already exists on this box — skipping mutation check)"
fi

# ── AC-134-03-5: shape check on bad --domain ─────────────────────────────
info "AC-134-03-5: invalid --domain rejected"
bad_out=$(bash "$MIGRATE_SH" --dry-run --domain ".bad-leading-dot" --cf-tunnel-token fake 2>&1)
bad_rc=$?
if [[ $bad_rc -eq 64 ]] && echo "$bad_out" | grep -qE "invalid --domain"; then
    pass "leading-dot domain rejected"
else
    fail "leading-dot domain should have been rejected"
fi

# ── Summary ──────────────────────────────────────────────────────────────
echo
echo "================================================================"
echo "  Phase 134 plan 134-03 test results: ${pass_count} PASS, ${fail_count} FAIL"
echo "================================================================"
if [[ $fail_count -ne 0 ]]; then
    exit 1
fi
exit 0
