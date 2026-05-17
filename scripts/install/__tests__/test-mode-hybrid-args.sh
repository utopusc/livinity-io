#!/usr/bin/env bash
# scripts/install/__tests__/test-mode-hybrid-args.sh
# Phase 134 — test fixture rewritten. Asserts the new contract:
#   - --mode hybrid (the default) now uses CF Tunnel transport (delegation to
#     install_mode_tunnel from mode-tunnel.sh).
#   - --cf-tunnel-token is valid (and REQUIRED) in hybrid mode (was tunnel-only
#     pre-Phase-134).
#   - --cf-zone-id is no longer required in hybrid mode.
#   - Legacy direct-LAN identifiers (xcaddy, caddy-dns/cloudflare, the LE DNS-01
#     A-record paths, Server5 mint) are absent from mode-hybrid.sh.
#
# Static / dry-run only — no root, no network, no Cloudflare. Runs in CI.
#
# Pre-Phase-134 version of this file asserted the OPPOSITE (direct-LAN Server5
# mint paths). See git history for the legacy fixture if you need to recover it.

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
INSTALL_SH="$REPO_ROOT/scripts/install.sh"
MODE_HYBRID_SH="$REPO_ROOT/scripts/install/mode-hybrid.sh"
MODE_TUNNEL_SH="$REPO_ROOT/scripts/install/mode-tunnel.sh"
PARSE_CLI_SH="$REPO_ROOT/scripts/install/parse-cli.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0

pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── AC-134-01-1: mode-hybrid.sh is a thin delegator (≤ 35 LOC) ───────────
info "AC-134-01-1: mode-hybrid.sh ≤ 35 lines and delegates to install_mode_tunnel"
loc=$(wc -l < "$MODE_HYBRID_SH")
if [[ $loc -le 35 ]]; then
    pass "mode-hybrid.sh is $loc lines (≤ 35)"
else
    fail "mode-hybrid.sh is $loc lines (expected ≤ 35) — legacy direct-LAN code may still be present"
fi
if grep -q 'install_mode_tunnel' "$MODE_HYBRID_SH"; then
    pass "mode-hybrid.sh references install_mode_tunnel (delegation present)"
else
    fail "mode-hybrid.sh does NOT call install_mode_tunnel"
fi

# ── AC-134-01-2: legacy direct-LAN identifiers fully removed ──────────────
info "AC-134-01-2: legacy direct-LAN identifiers absent from mode-hybrid.sh"
LEGACY_RE='caddy-dns/cloudflare|xcaddy|_verify_caddy_cloudflare_plugin|_provision_hybrid_subdomain|_provision_user_owned_domain|_write_cf_token_secret'
# Allow mentions in comments only (git history pointers). The script body must
# be free of these tokens. We strip comment-only lines before grepping.
bad=$(grep -vE '^\s*#' "$MODE_HYBRID_SH" | grep -E "$LEGACY_RE" || true)
if [[ -z "$bad" ]]; then
    pass "no legacy direct-LAN identifiers in mode-hybrid.sh code"
else
    fail "legacy direct-LAN identifiers found in mode-hybrid.sh code:"
    echo "$bad" | sed 's/^/    /'
fi

# ── AC-134-01-3: --help exits 0 and lists new contract ────────────────────
info "AC-134-01-3: --help exits 0 and documents Phase 134 contract"
help_out=$(bash "$INSTALL_SH" --help 2>&1)
help_rc=$?
if [[ $help_rc -eq 0 ]]; then
    pass "install.sh --help exited 0"
else
    fail "install.sh --help exited $help_rc (expected 0)"
fi
# Required keywords for Phase 134
for kw in "Cloudflare Tunnel" "--cf-tunnel-token" "--domain" "DEFAULT" "livinity.io/dashboard/install"; do
    if echo "$help_out" | grep -qF -- "$kw"; then
        pass "--help mentions '$kw'"
    else
        fail "--help missing '$kw'"
    fi
done

# ── AC-134-01-4: --mode hybrid REQUIRES --cf-tunnel-token ─────────────────
info "AC-134-01-4: --mode hybrid without --cf-tunnel-token exits 64"
err_out=$(bash "$INSTALL_SH" --mode hybrid --domain foo.example.com 2>&1)
err_rc=$?
if [[ $err_rc -ne 0 ]]; then
    pass "--mode hybrid without --cf-tunnel-token exited non-zero ($err_rc)"
else
    fail "--mode hybrid without --cf-tunnel-token unexpectedly exited 0"
fi
if echo "$err_out" | grep -qE "requires.*--cf-tunnel-token"; then
    pass "error message names the missing --cf-tunnel-token flag"
else
    fail "error message should name the missing --cf-tunnel-token flag"
fi

# ── AC-134-01-5: --mode hybrid + --cf-tunnel-token is valid ───────────────
# We can't run the full install (not root + needs Ubuntu), but parse_cli
# returns before the root check. We invoke install.sh and look for the
# "Mode: hybrid" + "Domain: ..." info lines emitted by parse-cli's success
# path. The script then exits with the no-root error which we ignore.
info "AC-134-01-5: --mode hybrid --domain X --cf-tunnel-token Y is accepted by parse_cli"
ok_out=$(bash "$INSTALL_SH" --mode hybrid --domain foo.example.com \
                            --cf-tunnel-token fake-token-1234 2>&1 || true)
if echo "$ok_out" | grep -qE "(Mode: hybrid|Domain: foo\.example\.com)"; then
    pass "parse_cli accepted --mode hybrid --domain --cf-tunnel-token combo"
else
    fail "parse_cli did NOT accept the new flag combo — see output below"
    echo "$ok_out" | sed 's/^/    /' | head -20
fi

# ── AC-134-01-6: --cf-zone-id no longer required in hybrid (back-compat OK)
info "AC-134-01-6: --cf-zone-id is accepted but no longer required in hybrid"
back_out=$(bash "$INSTALL_SH" --mode hybrid --domain foo.example.com \
                              --cf-tunnel-token fake \
                              --cf-zone-id legacy-zone-id 2>&1 || true)
if echo "$back_out" | grep -qE "(Mode: hybrid|Domain: foo\.example\.com)"; then
    pass "legacy --cf-zone-id is silently accepted (back-compat)"
else
    fail "legacy --cf-zone-id flag broke parse_cli"
fi

# ── AC-134-01-7: --cf-tunnel-token rejected in cloud / local-lan modes ────
info "AC-134-01-7: --cf-tunnel-token only valid in hybrid / tunnel"
rej_out=$(bash "$INSTALL_SH" --mode cloud --cf-tunnel-token fake 2>&1)
rej_rc=$?
if [[ $rej_rc -ne 0 ]] && echo "$rej_out" | grep -qE "only valid with --mode hybrid or --mode tunnel"; then
    pass "--cf-tunnel-token rejected in --mode cloud (exit $rej_rc + clear error)"
else
    fail "--cf-tunnel-token should be rejected in --mode cloud"
fi

# ── AC-134-01-8: --mode tunnel still works (back-compat alias) ────────────
info "AC-134-01-8: --mode tunnel back-compat alias still accepted"
alias_out=$(bash "$INSTALL_SH" --mode tunnel --domain foo.example.com \
                              --cf-tunnel-token fake 2>&1 || true)
if echo "$alias_out" | grep -qE "(Mode: tunnel|Domain: foo\.example\.com)"; then
    pass "--mode tunnel still accepted (back-compat)"
else
    fail "--mode tunnel alias broken"
fi

# ── AC-134-01-9: bash -n syntax on the touched files ──────────────────────
info "AC-134-01-9: bash -n syntax check"
for f in "$INSTALL_SH" "$PARSE_CLI_SH" "$MODE_HYBRID_SH" "$MODE_TUNNEL_SH"; do
    if bash -n "$f" 2>/dev/null; then
        pass "bash -n $(basename "$f")"
    else
        fail "bash -n FAILED on $f"
    fi
done

# ── AC-134-01-10: LIVOS_DOMAIN env-var gating equivalent to --domain flag ─
info "AC-134-01-10: LIVOS_DOMAIN env triggers same gating as --domain"
env_out=$(LIVOS_DOMAIN=foo.example.com bash "$INSTALL_SH" --mode hybrid 2>&1)
env_rc=$?
if [[ $env_rc -ne 0 ]] && echo "$env_out" | grep -qE "requires.*--cf-tunnel-token"; then
    pass "LIVOS_DOMAIN env without LIVOS_CF_TUNNEL_TOKEN gated"
else
    fail "LIVOS_DOMAIN env gating not equivalent to --domain flag"
fi

# ── Summary ───────────────────────────────────────────────────────────────
echo
echo "================================================================"
echo "  Phase 134 plan 134-01 test results: ${pass_count} PASS, ${fail_count} FAIL"
echo "================================================================"
if [[ $fail_count -ne 0 ]]; then
    exit 1
fi
exit 0
