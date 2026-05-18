#!/usr/bin/env bash
# scripts/install/__tests__/test-subdomain-args.sh
# Plan 140-07 — host-side bash test for --subdomain arg parsing + the
# --api-key auto-fetch-token alternative to --cf-tunnel-token. Same pattern as
# test-mode-tunnel-args.sh (Plan 104-09) and test-mode-hybrid-args.sh (Plan
# 134-01) — static / dry-run assertions on install.sh exit codes and stderr
# messages, no network calls (the actual /api/me/tunnel-token fetch is
# exercised by operator UAT once the endpoint is deployed).
#
# Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f
#
# Invoke:  bash scripts/install/__tests__/test-subdomain-args.sh
# Returns: exit 0 = all green; exit 1 = at least one failure

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
INSTALL_SH="$REPO_ROOT/scripts/install.sh"
PARSE_CLI_SH="$REPO_ROOT/scripts/install/parse-cli.sh"
MODE_TUNNEL_SH="$REPO_ROOT/scripts/install/mode-tunnel.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0

pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── TEST 1: --help mentions --subdomain ─────────────────────────────────────
info "TEST 1: install.sh --help mentions --subdomain"
help_out=$(bash "$INSTALL_SH" --help 2>&1)
if echo "$help_out" | grep -qF -- "--subdomain"; then
    pass "--help mentions --subdomain"
else
    fail "--help does NOT mention --subdomain"
fi
# Confirm the new "automatic token fetch" copy lands in --help too
if echo "$help_out" | grep -qiE 'fetched automatically|auto-fetch'; then
    pass "--help mentions automatic token fetch (Plan 140-07 copy)"
else
    fail "--help does NOT mention automatic token fetch"
fi

# ── TEST 2: --subdomain X (alone) + --api-key passes parse_cli ──────────────
info "TEST 2: --subdomain X + --api-key liv_k_... parses clean (fall through to root check)"
# Plan 145-01: set LIVOS_SKIP_API_KEY_RESOLVE=1 so the new auto-resolver does
# NOT make a network call against the fake api-key (would exit 1 on net-fail).
out=$(LIVOS_SKIP_API_KEY_RESOLVE=1 bash "$INSTALL_SH" --subdomain lucy --api-key liv_k_test4xxx 2>&1)
rc=$?
# Should pass parse_cli (exit != 64) and fall through to root / OS gate.
if [[ $rc -ne 64 ]]; then
    pass "--subdomain + --api-key parsed clean (exit $rc, not 64)"
else
    fail "--subdomain + --api-key REJECTED by parse_cli (exit 64). Output:"
    echo "$out" | sed 's/^/    /'
fi
# And the derivation log line should appear in stderr.
if echo "$out" | grep -qF "derived domain: lucy.livinity.io"; then
    pass "--subdomain derives lucy → lucy.livinity.io"
else
    fail "--subdomain lucy did NOT log derived domain: lucy.livinity.io"
fi
# And the deferred-fetch info line should appear.
if echo "$out" | grep -qF "will fetch from /api/me/tunnel-token"; then
    pass "--api-key without --cf-tunnel-token triggers deferred-fetch info"
else
    fail "--api-key without --cf-tunnel-token did NOT log deferred-fetch"
fi

# ── TEST 3: --subdomain X + --domain X.Y rejected (both-set error) ──────────
info "TEST 3: --subdomain + --domain both set → exit 64"
out=$(LIVOS_SKIP_API_KEY_RESOLVE=1 bash "$INSTALL_SH" --subdomain lucy --domain lucy.livinity.io --api-key liv_k_x 2>&1)
rc=$?
if [[ $rc -eq 64 ]]; then
    pass "both --subdomain and --domain → exit 64"
else
    fail "both --subdomain and --domain set should exit 64, got $rc"
fi
if echo "$out" | grep -qE 'Pick either|not both'; then
    pass "both-set error message names the conflict"
else
    fail "both-set error message should say 'Pick either ... not both'"
fi

# ── TEST 4: neither --subdomain nor --domain in hybrid mode → exit 64 ───────
info "TEST 4: --mode hybrid with neither --subdomain nor --domain → exit 64"
out=$(LIVOS_SKIP_API_KEY_RESOLVE=1 bash "$INSTALL_SH" --mode hybrid --api-key liv_k_x 2>&1)
rc=$?
if [[ $rc -eq 64 ]]; then
    pass "no domain at all → exit 64"
else
    fail "no domain at all should exit 64, got $rc"
fi
if echo "$out" | grep -qE 'requires --subdomain'; then
    pass "no-domain error message recommends --subdomain"
else
    fail "no-domain error should recommend --subdomain"
fi

# ── TEST 5: --subdomain with invalid shape (dot, space, leading dash) ───────
info "TEST 5: --subdomain shape validation"
for bad in "foo.bar" "-leading" "trailing-" "with space"; do
    out=$(LIVOS_SKIP_API_KEY_RESOLVE=1 bash "$INSTALL_SH" --subdomain "$bad" --api-key liv_k_x 2>&1)
    rc=$?
    if [[ $rc -eq 64 ]]; then
        pass "--subdomain '$bad' → exit 64"
    else
        fail "--subdomain '$bad' should exit 64, got $rc"
    fi
done

# ── TEST 6: backward-compat — --domain + --cf-tunnel-token still works ──────
info "TEST 6: backward-compat: --domain + --cf-tunnel-token (no --api-key) parses clean"
out=$(bash "$INSTALL_SH" \
    --mode hybrid \
    --domain bruce.livinity.live \
    --cf-tunnel-token long-fake-cf-tunnel-token 2>&1)
rc=$?
if [[ $rc -ne 64 ]]; then
    pass "backward-compat invocation parsed clean (exit $rc, not 64)"
else
    fail "backward-compat invocation REJECTED by parse_cli (exit 64). Output:"
    echo "$out" | sed 's/^/    /'
fi

# ── TEST 7: neither token nor api-key in hybrid → exit 64 ───────────────────
info "TEST 7: --mode hybrid + --domain but no token AND no api-key → exit 64"
out=$(bash "$INSTALL_SH" --mode hybrid --domain bruce.livinity.live 2>&1)
rc=$?
if [[ $rc -eq 64 ]]; then
    pass "no token + no api-key → exit 64"
else
    fail "no token + no api-key should exit 64, got $rc"
fi
if echo "$out" | grep -qE 'requires.*--cf-tunnel-token.*--api-key|requires.*--api-key.*--cf-tunnel-token'; then
    pass "error message mentions BOTH --cf-tunnel-token and --api-key options"
else
    fail "error message should mention both --cf-tunnel-token and --api-key"
fi

# ── TEST 8: _fetch_cf_tunnel_token_from_api function exists in mode-tunnel.sh
info "TEST 8: mode-tunnel.sh defines _fetch_cf_tunnel_token_from_api"
if grep -qE '^_fetch_cf_tunnel_token_from_api\(\)' "$MODE_TUNNEL_SH"; then
    pass "_fetch_cf_tunnel_token_from_api function defined"
else
    fail "_fetch_cf_tunnel_token_from_api function NOT defined in mode-tunnel.sh"
fi
# And it's wired into install_mode_tunnel before _write_cf_tunnel_token_secret
if grep -A 10 '^install_mode_tunnel()' "$MODE_TUNNEL_SH" \
        | awk '/_fetch_cf_tunnel_token_from_api/{f=NR} /_write_cf_tunnel_token_secret/{w=NR} END{exit !(f>0 && w>0 && f<w)}'; then
    pass "_fetch runs BEFORE _write in install_mode_tunnel"
else
    fail "_fetch_cf_tunnel_token_from_api should run BEFORE _write_cf_tunnel_token_secret"
fi

# ── TEST 9: api-key never echoed verbatim into stderr (basic secret hygiene)
info "TEST 9: --api-key value never appears verbatim in install.sh stderr"
secret="liv_k_supersecretvalue123456789"
out=$(LIVOS_SKIP_API_KEY_RESOLVE=1 bash "$INSTALL_SH" --subdomain test --api-key "$secret" 2>&1 || true)
# The argv loop logs `--api-key prefix: liv_k_supe...` (10-char prefix). We
# assert the FULL secret tail (post-prefix) doesn't leak. Note: bash's
# `warn "ignoring unknown arg: $1"` WILL echo a stray secret if the operator
# accidentally passes it as a positional (no `--api-key` flag) — that's a
# user-error / opex problem, not a parse-cli bug. We only assert the
# correctly-flagged-secret path here.
tail_str="${secret#liv_k_supe}"   # everything after the 10-char prefix
if echo "$out" | grep -qF "$tail_str"; then
    fail "--api-key tail '$tail_str' leaked into stderr"
else
    pass "--api-key tail did not leak into stderr (only 10-char prefix)"
fi

# ── TEST 10: bash -n syntax check on all touched files ──────────────────────
info "TEST 10: bash -n syntax check (parse-cli + mode-tunnel + install)"
for f in "$INSTALL_SH" "$PARSE_CLI_SH" "$MODE_TUNNEL_SH"; do
    if bash -n "$f" 2>/dev/null; then
        pass "bash -n $(basename "$f")"
    else
        fail "bash -n FAILED on $f"
    fi
done

# ── TEST 11: Sacred SHA preserved in the touched files ──────────────────────
info "TEST 11: Sacred SHA f3538e1d... present in modified files"
SACRED='f3538e1d811992b782a9bb057d1b7f0a0189f95f'
for f in "$PARSE_CLI_SH" "$MODE_TUNNEL_SH" "$INSTALL_SH"; do
    if grep -qF "$SACRED" "$f"; then
        pass "Sacred SHA present in $(basename "$f")"
    else
        fail "Sacred SHA MISSING from $(basename "$f")"
    fi
done

# ── TEST 12: Phase 145 — auto-resolve block present in parse-cli.sh ─────────
info "TEST 12: parse-cli.sh contains the Phase 145 auto-resolve block"
if grep -qF "Plan 145-01" "$PARSE_CLI_SH"; then
    pass "Phase 145 marker present in parse-cli.sh"
else
    fail "Phase 145 marker MISSING from parse-cli.sh"
fi
if grep -qF "Plan 145-01: api-key auto-resolve BEGIN" "$PARSE_CLI_SH" \
    && grep -qF "Plan 145-01: api-key auto-resolve END" "$PARSE_CLI_SH"; then
    pass "Phase 145 outer sentinels present"
else
    fail "Phase 145 outer sentinels MISSING (auto-resolve BEGIN/END markers)"
fi
if grep -qF "auto-resolved subdomain from api-key:" "$PARSE_CLI_SH"; then
    pass "auto-resolve INFO line present"
else
    fail "auto-resolve INFO line MISSING"
fi
if grep -qF "overridden by api-key owner" "$PARSE_CLI_SH"; then
    pass "conflict-WARN line present"
else
    fail "conflict-WARN line MISSING (should never fail-stop on conflict)"
fi
if grep -qF "/api/me/profile" "$PARSE_CLI_SH"; then
    pass "resolver endpoint URL present"
else
    fail "resolver endpoint URL MISSING"
fi
if grep -qF "custom apex --domain" "$PARSE_CLI_SH"; then
    pass "custom-apex defer branch present"
else
    fail "custom-apex defer branch MISSING (CONTEXT line 49 requires it)"
fi

# ── TEST 13: Phase 145 — help text mentions optional --subdomain + new example
info "TEST 13: --help mentions Phase 145 single-flag install + OPTIONAL --subdomain"
help_out=$(bash "$INSTALL_SH" --help 2>&1)
if echo "$help_out" | grep -qF "Phase 145 — single-flag install"; then
    pass "--help promotes the Phase 145 api-key-only one-liner"
else
    fail "--help does NOT promote the api-key-only one-liner"
fi
if echo "$help_out" | grep -qF "OPTIONAL when"; then
    pass "--help marks --subdomain OPTIONAL when --api-key is set"
else
    fail "--help does NOT mark --subdomain as optional"
fi

# ── TEST 14: Phase 145 — conflict-WARN branch is WARN-only (no fail/exit)
# Use the Plan 145-01 sentinel markers to extract ONLY the conflict-WARN body
# (sed range, exact match) and grep for any fail/exit call inside it. This
# replaces the brittle awk/regex approach. The sentinels are part of Task 2's
# acceptance criteria so this anchor is stable across edits.
info "TEST 14: conflict-warn path uses warn only, never fail/exit"
conflict_body=$(sed -n '/Plan 145-01: conflict-WARN BEGIN/,/Plan 145-01: conflict-WARN END/p' "$PARSE_CLI_SH")
if [[ -z "$conflict_body" ]]; then
    fail "could not locate conflict-WARN sentinel range (Plan 145-01: conflict-WARN BEGIN/END missing)"
elif echo "$conflict_body" | grep -qE '(^|[^a-z_])(fail|exit)[[:space:]]'; then
    fail "conflict-WARN branch contains fail/exit — must be WARN only (Phase 145 contract)"
else
    pass "conflict-WARN branch is WARN-only (no fail/exit in the sentinel range)"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo
echo "================================================================"
echo "  Plan 140-07 test results: ${pass_count} PASS, ${fail_count} FAIL"
echo "================================================================"
if [[ $fail_count -ne 0 ]]; then
    exit 1
fi
exit 0
