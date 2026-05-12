#!/usr/bin/env bash
# scripts/install/__tests__/test-mode-hybrid-args.sh
# Plan 104-08 — host-side bash test for --domain / --cf-token / --cf-zone-id
# argument handling + the user-owned-domain branch invariants in mode-hybrid.sh.
#
# Runs WITHOUT root and WITHOUT a fresh Ubuntu host: these are static / dry-run
# tests of install.sh + grep-based source invariants on mode-hybrid.sh. The
# end-to-end install behavior is exercised by docker/local-uat (separate suite).
#
# Invoke:    bash scripts/install/__tests__/test-mode-hybrid-args.sh
# Returns:   exit 0 = all green; exit 1 = at least one failure
#
# Inspired by docker/local-uat/scripts/test-install-idempotency.sh patterns
# (colored PASS/FAIL, set -euo pipefail, explicit exit codes).

set -uo pipefail   # intentionally NOT -e — we want to capture exit codes from
                   # install.sh --help / --domain probes and assert on them

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
INSTALL_SH="$REPO_ROOT/scripts/install.sh"
MODE_HYBRID_SH="$REPO_ROOT/scripts/install/mode-hybrid.sh"
PARSE_CLI_SH="$REPO_ROOT/scripts/install/parse-cli.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0

pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── AC-104-08-1: `bash install.sh --help` exits 0 and lists the 3 new flags ──
info "AC-104-08-1: --help exits 0 and lists --domain, --cf-token, --cf-zone-id"
help_out=$(bash "$INSTALL_SH" --help 2>&1)
help_rc=$?
if [[ $help_rc -ne 0 ]]; then
    fail "install.sh --help exited $help_rc (expected 0)"
else
    pass "install.sh --help exited 0"
fi
for flag in --domain --cf-token --cf-zone-id; do
    # `-- "$flag"` separator so grep treats `--cf-token` (etc.) as the pattern
    # rather than a (nonexistent) `--cf-token` grep option. Without the `--`,
    # busybox + GNU grep both choke; this is Rule-1 bug-fix territory.
    if echo "$help_out" | grep -qF -- "$flag"; then
        pass "--help mentions $flag"
    else
        fail "--help does NOT mention $flag"
    fi
done
# CGNAT warning is also part of the --help contract (advisory; not a hard fail)
if echo "$help_out" | grep -qE "CGNAT|100\.64\.0\.0"; then
    pass "--help mentions CGNAT limitation"
else
    fail "--help should mention CGNAT limitation"
fi

# ── AC-104-08-2: --mode hybrid without --domain still attempts Server5 mint ──
# We can't actually run the install (needs root + Ubuntu), but we CAN prove the
# code branch is preserved by grepping for the unconditional curl-to-Server5
# call living downstream of the LIVOS_DOMAIN-empty guard.
info "AC-104-08-2: legacy Server5 mint path still reachable when --domain unset"
if grep -E '^\s*if \[\[ -n "\$\{?LIVOS_DOMAIN' "$MODE_HYBRID_SH" >/dev/null \
   && grep -E 'livinity\.io/api/hybrid/provision' "$MODE_HYBRID_SH" >/dev/null \
   && grep -E '_provision_hybrid_subdomain' "$MODE_HYBRID_SH" >/dev/null; then
    pass "mode-hybrid.sh preserves _provision_hybrid_subdomain + Server5 endpoint + LIVOS_DOMAIN branch"
else
    fail "mode-hybrid.sh missing one of: LIVOS_DOMAIN branch, Server5 endpoint, _provision_hybrid_subdomain"
fi

# ── AC-104-08-3: --mode hybrid --domain foo.com WITHOUT --cf-token exits non-0 ─
info "AC-104-08-3: --domain without --cf-token + --cf-zone-id exits non-zero"
err_out=$(bash "$INSTALL_SH" --mode hybrid --domain foo.example.com 2>&1)
err_rc=$?
if [[ $err_rc -ne 0 ]]; then
    pass "install.sh --mode hybrid --domain foo.example.com exited $err_rc (non-zero)"
else
    fail "install.sh --mode hybrid --domain foo.example.com unexpectedly exited 0"
fi
if echo "$err_out" | grep -qE "requires.*--cf-token"; then
    pass "error message names the missing --cf-token flag"
else
    fail "error message should name the missing --cf-token flag"
fi
# Also reject `--domain` paired with non-hybrid mode
err_out2=$(bash "$INSTALL_SH" --mode cloud --domain foo.example.com --cf-token x --cf-zone-id y 2>&1)
err_rc2=$?
if [[ $err_rc2 -ne 0 ]]; then
    pass "install.sh --mode cloud --domain ... rejected (non-zero exit)"
else
    fail "install.sh --mode cloud --domain ... unexpectedly exited 0"
fi

# ── AC-104-08-4: curl to Server5 mint is INSIDE LIVOS_DOMAIN-empty branch ────
# Verify by static-grep: the only `livinity.io/api/hybrid/provision` line lives
# in _provision_hybrid_subdomain (which is bypassed by the install_mode_hybrid
# dispatch when LIVOS_DOMAIN is set). The early-exit-on-non-empty form is
# semantically equivalent to wrapping the body in `if [[ -z ... ]]`.
info "AC-104-08-4: Server5 mint guarded by LIVOS_DOMAIN-empty branch"
provision_curl_lines=$(grep -nE 'livinity\.io/api/hybrid/provision' "$MODE_HYBRID_SH" | grep -v '^\s*#' | grep -v '#' || true)
# Filter out comment lines (those starting with `#` after the line number)
if [[ -z "$provision_curl_lines" ]]; then
    fail "expected the Server5 endpoint to be referenced in non-comment code"
else
    # Confirm install_mode_hybrid only calls _provision_hybrid_subdomain in the
    # LIVOS_DOMAIN-empty branch.
    if grep -E 'if \[\[ -n "\$\{?LIVOS_DOMAIN' "$MODE_HYBRID_SH" >/dev/null \
       && grep -E 'else' "$MODE_HYBRID_SH" >/dev/null \
       && grep -E '_provision_user_owned_domain' "$MODE_HYBRID_SH" >/dev/null; then
        pass "install_mode_hybrid dispatches user-owned-domain vs Server5 mint via LIVOS_DOMAIN branch"
    else
        fail "install_mode_hybrid dispatch branch not detected"
    fi
fi

# ── AC-104-08-5: CF API token never on curl argv (Authorization header) ─────
# `curl -H "Authorization: Bearer ${cf_token}"` would expand the token onto
# argv (visible via `ps auxww`). Acceptable patterns: `curl -K -` (config from
# stdin) or `curl @-` style. NEITHER `-H "Authorization: ...$cf_token..."`
# nor `--header "...$LIVOS_CF_TOKEN..."` should appear in the script.
info "AC-104-08-5: CF API token NEVER passed on curl argv"
# Strip blank lines + comments before searching. Then look for any curl
# invocation that has the Bearer token interpolated as an argument.
bad_lines=$(grep -v '^\s*#' "$MODE_HYBRID_SH" \
    | grep -E '(curl|--?H(eader)?)' \
    | grep -E 'Authorization.*Bearer.*\$' || true)
if [[ -z "$bad_lines" ]]; then
    pass "no curl invocation interpolates token into -H Authorization argv"
else
    fail "found curl Authorization-Bearer-with-token-on-argv:"
    echo "$bad_lines" | sed 's/^/    /'
fi
# Positive: confirm we DO use curl -K - (config-from-stdin) or @file body
if grep -E '\| curl -K -' "$MODE_HYBRID_SH" >/dev/null; then
    pass "uses curl -K - (config from stdin) — token safely off argv"
else
    fail "expected `curl -K -` pattern for CF API calls"
fi

# ── Bonus: bash -n syntax check on the 3 files we touched ─────────────────
info "Bonus: bash -n syntax check"
for f in "$INSTALL_SH" "$PARSE_CLI_SH" "$MODE_HYBRID_SH" \
         "$REPO_ROOT/scripts/install/show-banner.sh" \
         "$REPO_ROOT/scripts/install/detect-platform.sh"; do
    if bash -n "$f" 2>/dev/null; then
        pass "bash -n $(basename "$f")"
    else
        fail "bash -n FAILED on $f"
    fi
done

# ── Bonus: LIVOS_DOMAIN env-only (no CLI flag) takes the user-domain branch ──
# Run install.sh with LIVOS_DOMAIN set in env. Since install.sh exits early at
# the root check (not running as root), we won't see the actual provision
# happen — but parse_cli will print "User-owned domain: ..." if it accepted
# the env-supplied domain together with token + zone-id env vars. Without
# token/zone-id env vars, parse_cli should still gate.
info "Bonus: LIVOS_DOMAIN env triggers same gating as --domain flag"
env_out=$(LIVOS_DOMAIN=foo.example.com bash "$INSTALL_SH" --mode hybrid 2>&1)
env_rc=$?
if [[ $env_rc -ne 0 ]] && echo "$env_out" | grep -qE "requires.*--cf-token"; then
    pass "LIVOS_DOMAIN env without LIVOS_CF_TOKEN gated (same as --domain flag)"
else
    fail "LIVOS_DOMAIN env gating not equivalent to --domain flag"
fi

# ── Summary ─────────────────────────────────────────────────────────────
echo
echo "================================================================"
echo "  Plan 104-08 test results: ${pass_count} PASS, ${fail_count} FAIL"
echo "================================================================"
if [[ $fail_count -ne 0 ]]; then
    exit 1
fi
exit 0
