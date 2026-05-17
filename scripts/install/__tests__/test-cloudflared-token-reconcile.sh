#!/usr/bin/env bash
# scripts/install/__tests__/test-cloudflared-token-reconcile.sh
# Phase 141-09 — regression: cloudflared.service token reconciliation logic.
# Validates the sed contract used in mode-tunnel.sh:_register_cloudflared_service
# without needing systemctl / root / a real cloudflared install.
#
# Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f
#
# Invoke:  bash scripts/install/__tests__/test-cloudflared-token-reconcile.sh
# Returns: exit 0 = all green; exit 1 = at least one failure

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
MODE_TUNNEL_SH="$REPO_ROOT/scripts/install/mode-tunnel.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0

pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Build a mock systemd unit identical to what `cloudflared service install` writes.
write_mock_unit() {
    local token="$1"
    cat > "$TMP/cloudflared.service" <<UNIT
[Unit]
Description=cloudflared
After=network-online.target
Wants=network-online.target

[Service]
TimeoutStartSec=0
Type=notify
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --metrics 0.0.0.0:60123 run --token ${token}
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
UNIT
}

# Run the EXTRACT + COMPARE + SED logic in isolation (port of the snippet in
# mode-tunnel.sh:_register_cloudflared_service — keep them in sync).
reconcile() {
    local unit_file="$1" expected_token="$2"
    local current_token
    if [[ -f "$unit_file" ]] && grep -q -- "--token " "$unit_file"; then
        current_token=$(grep -oE -- "--token [A-Za-z0-9_=.-]+" "$unit_file" | head -1 | awk '{print $2}')
        if [[ -n "$current_token" && "$current_token" != "$expected_token" ]]; then
            sed -i "s|--token ${current_token}|--token ${expected_token}|" "$unit_file"
            echo "rewrote"
            return 0
        else
            echo "no-change"
            return 0
        fi
    fi
    echo "no-token-arg"
    return 0
}

# ── TEST 1: token drift → rewrite ───────────────────────────────────────────
info "TEST 1: stale token in unit → rewrite to expected"
write_mock_unit "OLD_LUCY_TOKEN_xxx123"
result=$(reconcile "$TMP/cloudflared.service" "NEW_SOCINITY_TOKEN_abc456")
[[ "$result" == "rewrote" ]] && pass "logic reports 'rewrote'" || fail "expected 'rewrote', got '$result'"
if grep -q "OLD_LUCY_TOKEN_xxx123" "$TMP/cloudflared.service"; then
    fail "stale token still in unit"
else
    pass "stale token removed"
fi
if grep -q "\-\-token NEW_SOCINITY_TOKEN_abc456" "$TMP/cloudflared.service"; then
    pass "new token in ExecStart"
else
    fail "new token NOT in ExecStart. Unit:"; cat "$TMP/cloudflared.service" | sed 's/^/    /'
fi

# ── TEST 2: token already correct → no-op ──────────────────────────────────
info "TEST 2: token already matches expected → no-op"
write_mock_unit "ALREADY_CORRECT_token"
result=$(reconcile "$TMP/cloudflared.service" "ALREADY_CORRECT_token")
[[ "$result" == "no-change" ]] && pass "logic reports 'no-change'" || fail "expected 'no-change', got '$result'"

# ── TEST 3: realistic JWT-shaped tokens with special chars ─────────────────
info "TEST 3: JWT-shaped tokens (=._-) round-trip cleanly through sed"
OLD="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.OLD_PAYLOAD.signature_xxx"
NEW="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.NEW_PAYLOAD.signature_yyy"
write_mock_unit "$OLD"
result=$(reconcile "$TMP/cloudflared.service" "$NEW")
[[ "$result" == "rewrote" ]] && pass "JWT token rewrite reports 'rewrote'" || fail "expected 'rewrote', got '$result'"
if grep -q -- "--token $NEW" "$TMP/cloudflared.service" && ! grep -q -- "$OLD" "$TMP/cloudflared.service"; then
    pass "JWT-shaped token swap is exact"
else
    fail "JWT swap left residue"; cat "$TMP/cloudflared.service" | sed 's/^/    /'
fi

# ── TEST 4: unit without --token arg → skipped (not a sed-failure path) ────
info "TEST 4: unit using EnvironmentFile (no --token in ExecStart) → skip safely"
cat > "$TMP/cloudflared.service" <<UNIT
[Service]
EnvironmentFile=/etc/livos/secrets/cf-tunnel-token
ExecStart=/usr/bin/cloudflared tunnel run \${CF_TUNNEL_TOKEN}
UNIT
result=$(reconcile "$TMP/cloudflared.service" "NEW_TOKEN_xyz")
[[ "$result" == "no-token-arg" ]] && pass "EnvironmentFile shape → 'no-token-arg' (skipped, not failed)" || fail "expected 'no-token-arg', got '$result'"
if grep -q "EnvironmentFile=/etc/livos/secrets/cf-tunnel-token" "$TMP/cloudflared.service"; then
    pass "EnvironmentFile unit untouched"
else
    fail "EnvironmentFile unit got mangled. Unit:"; cat "$TMP/cloudflared.service" | sed 's/^/    /'
fi

# ── TEST 5: source mode-tunnel.sh's reconcile block exists ─────────────────
info "TEST 5: mode-tunnel.sh contains the Phase 141-09 reconcile block"
if grep -q "Phase 141-09" "$MODE_TUNNEL_SH"; then
    pass "Phase 141-09 marker present in mode-tunnel.sh"
else
    fail "Phase 141-09 marker MISSING from mode-tunnel.sh"
fi
if grep -q 'sed -i "s|--token' "$MODE_TUNNEL_SH"; then
    pass "ExecStart sed-replace line present"
else
    fail "ExecStart sed-replace line MISSING"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo
if [[ $fail_count -eq 0 ]]; then
    echo -e "${GREEN}All $pass_count assertions PASSED${NC}"
    exit 0
else
    echo -e "${RED}$fail_count FAIL / $pass_count PASS${NC}"
    exit 1
fi
