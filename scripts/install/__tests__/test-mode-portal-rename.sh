#!/usr/bin/env bash
# scripts/install/__tests__/test-mode-portal-rename.sh
# Phase 142-02 — install.sh --mode contract after the hybrid → portal rename
# and 142-01/142-03 mode-set collapse.
#
# Asserts:
#   - `portal` is the new default mode
#   - `hybrid` and `tunnel` are silently accepted + normalized to `portal`
#   - `local-lan` is rejected (Phase 142-01 retired)
#   - `cloud` is rejected with a Coming Soon message (Phase 142-03 stub)
#   - --help advertises portal as DEFAULT + lists the back-compat aliases
#   - The MODE_WHITELIST in parse-cli.sh still contains the alias entries so
#     normalization fires (defense against an accidental whitelist trim)
#
# Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f
#
# Invoke:  bash scripts/install/__tests__/test-mode-portal-rename.sh
# Returns: exit 0 = all green; exit 1 = at least one failure

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
INSTALL_SH="$REPO_ROOT/scripts/install.sh"
PARSE_CLI_SH="$REPO_ROOT/scripts/install/parse-cli.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0

pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── TEST 1: --help calls portal the DEFAULT mode ────────────────────────────
info "TEST 1: --help advertises portal as DEFAULT + mentions back-compat aliases"
help_out=$(bash "$INSTALL_SH" --help 2>&1)
if echo "$help_out" | grep -qE "^\s*portal\s+DEFAULT"; then
    pass "--help: portal is labeled DEFAULT"
else
    fail "--help did not surface portal as DEFAULT. Tail:"; echo "$help_out" | head -15 | sed 's/^/    /'
fi
if echo "$help_out" | grep -qE "hybrid\s+Back-compat alias" && echo "$help_out" | grep -qE "tunnel\s+Back-compat alias"; then
    pass "--help: hybrid + tunnel both labeled back-compat aliases"
else
    fail "--help missing back-compat alias copy"
fi

# ── TEST 2: --mode local-lan rejected with retired-mode pointer ────────────
info "TEST 2: --mode local-lan rejected with Phase 142-01 retired message"
out=$(bash "$INSTALL_SH" --mode local-lan 2>&1)
rc=$?
if [[ $rc -eq 64 ]] && echo "$out" | grep -qE "retired in Phase 142-01|--mode portal instead"; then
    pass "--mode local-lan → exit 64 + retired-mode pointer"
else
    fail "--mode local-lan rejection broken (exit=$rc):"; echo "$out" | head -3 | sed 's/^/    /'
fi

# ── TEST 3: --mode cloud rejected with Coming Soon ─────────────────────────
info "TEST 3: --mode cloud rejected with Coming Soon (Phase 142-03)"
out=$(bash "$INSTALL_SH" --mode cloud 2>&1)
rc=$?
if [[ $rc -eq 64 ]] && echo "$out" | grep -qiE "Coming Soon"; then
    pass "--mode cloud → exit 64 + Coming Soon copy"
else
    fail "--mode cloud Coming Soon rejection broken (exit=$rc):"; echo "$out" | head -3 | sed 's/^/    /'
fi

# ── TEST 4: --mode hybrid normalized → portal (info line + behaves as portal) ──
info "TEST 4: --mode hybrid normalized → portal (info line)"
out=$(bash "$INSTALL_SH" --mode hybrid --domain foo.example.com --cf-tunnel-token faketok 2>&1 || true)
if echo "$out" | grep -qE "renamed → portal"; then
    pass "--mode hybrid logs 'renamed → portal' info line"
else
    fail "--mode hybrid did not surface normalization. Output:"; echo "$out" | head -5 | sed 's/^/    /'
fi
if echo "$out" | grep -qE "Mode: portal"; then
    pass "--mode hybrid normalized → 'Mode: portal' confirmed"
else
    fail "--mode hybrid not normalized; expected 'Mode: portal'"
fi

# ── TEST 5: --mode tunnel normalized → portal ──────────────────────────────
info "TEST 5: --mode tunnel normalized → portal"
out=$(bash "$INSTALL_SH" --mode tunnel --domain foo.example.com --cf-tunnel-token faketok 2>&1 || true)
if echo "$out" | grep -qE "Mode: portal"; then
    pass "--mode tunnel normalized → 'Mode: portal'"
else
    fail "--mode tunnel not normalized to portal. Output:"; echo "$out" | head -5 | sed 's/^/    /'
fi

# ── TEST 6: omitting --mode defaults to portal ─────────────────────────────
info "TEST 6: no --mode flag → default = portal"
out=$(bash "$INSTALL_SH" --domain foo.example.com --cf-tunnel-token faketok 2>&1 || true)
if echo "$out" | grep -qE "Mode: portal"; then
    pass "no --mode flag → default = portal"
else
    fail "default mode broken; expected portal. Output:"; echo "$out" | head -5 | sed 's/^/    /'
fi

# ── TEST 7: portal explicit also works ─────────────────────────────────────
info "TEST 7: --mode portal explicit"
out=$(bash "$INSTALL_SH" --mode portal --domain foo.example.com --cf-tunnel-token faketok 2>&1 || true)
if echo "$out" | grep -qE "Mode: portal"; then
    pass "--mode portal accepted explicitly"
else
    fail "--mode portal explicit failed. Output:"; echo "$out" | head -5 | sed 's/^/    /'
fi

# ── TEST 8: MODE_WHITELIST in parse-cli.sh contains the alias entries ─────
info "TEST 8: MODE_WHITELIST contains hybrid + tunnel + portal (defense)"
if grep -qE 'MODE_WHITELIST="[^"]*\bportal\b' "$PARSE_CLI_SH" \
    && grep -qE 'MODE_WHITELIST="[^"]*\bhybrid\b' "$PARSE_CLI_SH" \
    && grep -qE 'MODE_WHITELIST="[^"]*\btunnel\b' "$PARSE_CLI_SH"; then
    pass "MODE_WHITELIST contains portal + hybrid + tunnel"
else
    fail "MODE_WHITELIST missing one of: portal / hybrid / tunnel"
fi

# ── TEST 9: sacred SHA in parse-cli.sh ────────────────────────────────────
info "TEST 9: sacred SHA invariant in parse-cli.sh"
if grep -qF "f3538e1d811992b782a9bb057d1b7f0a0189f95f" "$PARSE_CLI_SH"; then
    pass "sacred SHA present in parse-cli.sh"
else
    fail "sacred SHA MISSING from parse-cli.sh"
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
