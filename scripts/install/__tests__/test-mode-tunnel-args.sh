#!/usr/bin/env bash
# scripts/install/__tests__/test-mode-tunnel-args.sh
# Plan 104-09 — host-side bash test for --mode tunnel / --cf-tunnel-token /
# --api-key argument handling + the tunnel-mode invariants in mode-tunnel.sh.
#
# Runs WITHOUT root and WITHOUT a fresh Ubuntu host: these are static / dry-run
# tests of install.sh + grep-based source invariants on mode-tunnel.sh. The
# end-to-end install behavior is exercised by docker/local-uat (separate suite)
# and the CF Tunnel daemon end-to-end path is verified by an operator walk.
#
# Invoke:    bash scripts/install/__tests__/test-mode-tunnel-args.sh
# Returns:   exit 0 = all green; exit 1 = at least one failure
#
# Sibling: test-mode-hybrid-args.sh (Plan 104-08) — same pattern.

set -uo pipefail   # intentionally NOT -e — we want to capture exit codes from
                   # install.sh probes and assert on them

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
INSTALL_SH="$REPO_ROOT/scripts/install.sh"
MODE_TUNNEL_SH="$REPO_ROOT/scripts/install/mode-tunnel.sh"
PARSE_CLI_SH="$REPO_ROOT/scripts/install/parse-cli.sh"
SHOW_BANNER_SH="$REPO_ROOT/scripts/install/show-banner.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0

pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── TEST 1: --help shows tunnel, --cf-tunnel-token, --api-key (>= 3 lines) ────
info "TEST 1: install.sh --help mentions tunnel + --cf-tunnel-token + --api-key"
help_out=$(bash "$INSTALL_SH" --help 2>&1)
help_rc=$?
if [[ $help_rc -ne 0 ]]; then
    fail "install.sh --help exited $help_rc (expected 0)"
else
    pass "install.sh --help exited 0"
fi
# Count lines mentioning tunnel-mode-related strings (>= 3 expected — one for
# the mode list, one for --cf-tunnel-token, one for --api-key, plus example
# block bonus matches).
matched_lines=$(echo "$help_out" | grep -cE 'tunnel|--cf-tunnel-token|--api-key' || true)
if [[ $matched_lines -ge 3 ]]; then
    pass "--help mentions tunnel/--cf-tunnel-token/--api-key on $matched_lines lines (>=3)"
else
    fail "--help mentions tunnel-mode strings on only $matched_lines lines (expected >=3)"
fi
# Specific flag presence — use `-- "$flag"` separator (104-08 lesson learned).
for flag in --cf-tunnel-token --api-key; do
    if echo "$help_out" | grep -qF -- "$flag"; then
        pass "--help mentions $flag"
    else
        fail "--help does NOT mention $flag"
    fi
done
# Tunnel-mode example block should include the canonical invocation shape.
if echo "$help_out" | grep -qE 'mode.tunnel.*--domain' \
        || echo "$help_out" | grep -qE '\-\-mode tunnel'; then
    pass "--help shows tunnel-mode example"
else
    fail "--help should include a --mode tunnel example invocation"
fi

# ── TEST 2: --mode tunnel without --cf-tunnel-token exits non-0 with usage ───
info "TEST 2: --mode tunnel without --cf-tunnel-token exits non-zero"
err_out=$(bash "$INSTALL_SH" --mode tunnel --domain bruceoz.com 2>&1)
err_rc=$?
if [[ $err_rc -ne 0 ]]; then
    pass "install.sh --mode tunnel --domain ... (no --cf-tunnel-token) exited $err_rc (non-zero)"
else
    fail "install.sh --mode tunnel without --cf-tunnel-token unexpectedly exited 0"
fi
if echo "$err_out" | grep -qE 'requires.*--cf-tunnel-token|--cf-tunnel-token.*required'; then
    pass "error message names the missing --cf-tunnel-token flag"
else
    fail "error message should name the missing --cf-tunnel-token flag"
fi

# ── TEST 3: --mode tunnel --cf-tunnel-token foo WITHOUT --domain exits non-0 ─
info "TEST 3: --mode tunnel --cf-tunnel-token without --domain exits non-zero"
err_out=$(bash "$INSTALL_SH" --mode tunnel --cf-tunnel-token sometoken 2>&1)
err_rc=$?
if [[ $err_rc -ne 0 ]]; then
    pass "install.sh --mode tunnel --cf-tunnel-token ... (no --domain) exited $err_rc (non-zero)"
else
    fail "install.sh --mode tunnel without --domain unexpectedly exited 0"
fi
if echo "$err_out" | grep -qE 'requires.*--domain|--domain.*required'; then
    pass "error message names the missing --domain flag"
else
    fail "error message should name the missing --domain flag"
fi

# Also: --cf-tunnel-token without --mode tunnel is rejected
err_out2=$(bash "$INSTALL_SH" --mode hybrid --cf-tunnel-token oops 2>&1)
err_rc2=$?
if [[ $err_rc2 -ne 0 ]]; then
    pass "install.sh --mode hybrid --cf-tunnel-token ... rejected (non-zero)"
else
    fail "install.sh --mode hybrid --cf-tunnel-token ... unexpectedly exited 0"
fi

# ── TEST 4: --api-key without `liv_k_` prefix exits non-0 ────────────────────
info "TEST 4: --api-key without liv_k_ prefix exits non-zero"
err_out=$(bash "$INSTALL_SH" --mode tunnel --domain bruceoz.com \
    --cf-tunnel-token toktok --api-key sk-bad-prefix 2>&1)
err_rc=$?
if [[ $err_rc -ne 0 ]]; then
    pass "install.sh --api-key sk-bad-prefix exited $err_rc (non-zero)"
else
    fail "install.sh --api-key sk-bad-prefix unexpectedly exited 0"
fi
if echo "$err_out" | grep -qE 'liv_k_'; then
    pass "error message names the required liv_k_ prefix"
else
    fail "error message should name the required liv_k_ prefix"
fi

# ── TEST 5: full valid invocation passes parse_cli + exits at root check ─────
# parse_cli is INFO-level only; the next gate is the root EUID check, which is
# guaranteed to fire when running these tests as a non-root user. Therefore a
# successful parse_cli flows through and exits at the root check with a known
# message — we assert on that message.
info "TEST 5: full valid invocation parses clean (exits at root check)"
err_out=$(bash "$INSTALL_SH" \
    --mode tunnel \
    --domain bruceoz.com \
    --cf-tunnel-token long-fake-cf-tunnel-token \
    --api-key liv_k_iCCxIa7vlFgbpOl-fPwd 2>&1)
err_rc=$?
# We expect non-zero (must-run-as-root) but NOT 64 (which is parse-cli's exit code).
if [[ $err_rc -ne 64 ]]; then
    pass "full valid invocation exits non-64 (got $err_rc — parse_cli accepted args)"
else
    fail "full valid invocation exited 64 (parse_cli REJECTED args — see output below)"
    echo "$err_out" | sed 's/^/    /'
fi
if echo "$err_out" | grep -qE 'must run as root|EUID|Unsupported OS|requires Ubuntu' ; then
    # parse_cli accepted args cleanly — install.sh continued past arg-parsing
    # into platform detection / root check (we run as non-root, possibly on
    # non-Ubuntu hosts like Windows/Mac dev box, so either of those gates may
    # fire first). Either way, the parse_cli pre-flight passed.
    pass "parse_cli passed cleanly (downstream gate fired: $(echo "$err_out" | grep -oE 'must run as root|Unsupported OS|EUID' | head -1))"
else
    fail "expected downstream-gate error after parse_cli; got: $(echo "$err_out" | tail -3 | tr '\n' ' ')"
fi
# Also verify the token was NOT echoed back into the visible output (basic
# secret-hygiene — the token shouldn't appear in any log line).
if echo "$err_out" | grep -qF "long-fake-cf-tunnel-token"; then
    fail "CF Tunnel token leaked into install.sh stdout/stderr — security regression"
else
    pass "CF Tunnel token did NOT appear in install.sh output (no log leak)"
fi

# ── TEST 6: D-104-RELAY-ZERO-DATA-PLANE — no Server5 refs in mode-tunnel.sh ──
info "TEST 6: mode-tunnel.sh has zero Server5 / livinity.io relay references"
bad_refs=$(grep -nE 'livinity\.io|45\.137\.194\.10[23]|nexus\.livinity|relay\.livinity' \
    "$MODE_TUNNEL_SH" 2>/dev/null || true)
if [[ -z "$bad_refs" ]]; then
    pass "mode-tunnel.sh contains no Server5 / livinity.io references"
else
    fail "mode-tunnel.sh references forbidden Server5 / livinity.io strings:"
    echo "$bad_refs" | sed 's/^/    /'
fi

# ── TEST 7: token never expanded onto curl/cloudflared argv via env-var ──────
info "TEST 7: CF Tunnel token never expanded onto argv via \${LIVOS_CF_TUNNEL_TOKEN}"
bad_lines=$(grep -v '^\s*#' "$MODE_TUNNEL_SH" \
    | grep -E '(curl|cloudflared).*\$\{?LIVOS_CF_TUNNEL_TOKEN' || true)
if [[ -z "$bad_lines" ]]; then
    pass "no curl/cloudflared invocation interpolates LIVOS_CF_TUNNEL_TOKEN onto argv"
else
    fail "found token expanded onto argv:"
    echo "$bad_lines" | sed 's/^/    /'
fi
# Same check for LIVOS_API_KEY — it should ONLY land in the secret file via
# printf+redirection, never argv.
bad_apikey=$(grep -v '^\s*#' "$MODE_TUNNEL_SH" \
    | grep -E '(curl|cloudflared).*\$\{?LIVOS_API_KEY' || true)
if [[ -z "$bad_apikey" ]]; then
    pass "no curl/cloudflared invocation interpolates LIVOS_API_KEY onto argv"
else
    fail "found LIVOS_API_KEY expanded onto argv:"
    echo "$bad_apikey" | sed 's/^/    /'
fi

# ── TEST 8: bash -n syntax check on all 4 touched files ──────────────────────
info "TEST 8: bash -n syntax check"
for f in "$INSTALL_SH" "$PARSE_CLI_SH" "$MODE_TUNNEL_SH" "$SHOW_BANNER_SH"; do
    if bash -n "$f" 2>/dev/null; then
        pass "bash -n $(basename "$f")"
    else
        fail "bash -n FAILED on $f"
    fi
done

# ── TEST 9 (bonus): env-var equivalence — LIVOS_CF_TUNNEL_TOKEN env without ──
# --cf-tunnel-token CLI flag should ALSO unlock tunnel-mode gating (it's the
# same env-var binding pattern as plan 104-08).
info "TEST 9: LIVOS_CF_TUNNEL_TOKEN env var equivalent to --cf-tunnel-token"
env_out=$(LIVOS_CF_TUNNEL_TOKEN=envtok \
    bash "$INSTALL_SH" --mode tunnel --domain bruceoz.com 2>&1)
env_rc=$?
# Same shape as TEST 5 — should pass parse_cli and fall through to root check.
if [[ $env_rc -ne 64 ]]; then
    pass "LIVOS_CF_TUNNEL_TOKEN env (no CLI flag) accepted by parse_cli (exit $env_rc)"
else
    fail "LIVOS_CF_TUNNEL_TOKEN env not equivalent to --cf-tunnel-token flag"
fi

# ── TEST 10: Phase 134 — hybrid mode now uses CF Tunnel transport ───────────
# Phase 134 superseded Plan 104-08's `--cf-token`/`--cf-zone-id` gating; hybrid
# now requires `--cf-tunnel-token` (same shape as tunnel mode). See
# test-mode-hybrid-args.sh for the full Phase 134 contract; this is the cross-
# fixture sanity that hybrid + tunnel modes converge on the same gating.
info "TEST 10: Phase 134 — hybrid --domain without --cf-tunnel-token is gated"
err_out=$(bash "$INSTALL_SH" --mode hybrid --domain foo.example.com 2>&1)
err_rc=$?
if [[ $err_rc -ne 0 ]] && echo "$err_out" | grep -qE "requires.*--cf-tunnel-token"; then
    pass "hybrid --domain without --cf-tunnel-token gated (Phase 134 invariant)"
else
    fail "Phase 134 regression: hybrid --domain validation broken"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo
echo "================================================================"
echo "  Plan 104-09 test results: ${pass_count} PASS, ${fail_count} FAIL"
echo "================================================================"
if [[ $fail_count -ne 0 ]]; then
    exit 1
fi
exit 0
