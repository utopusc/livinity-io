#!/usr/bin/env bash
# Phase 60 - B2 Public Endpoint smoke battery.
# Usage:
#   LIV_SK_TOKEN=liv_sk_xxxxxxxx ./platform/relay/scripts/phase-60-smoke.sh
#
# Requires: dig, curl, openssl, jq.
# Outputs to stdout AND .planning/phases/60-public-endpoint-rate-limit/60-SMOKE-RESULTS.md.
# Exit 0 on full success; non-zero on any failed assertion.
#
# RESEARCH.md Pitfall 8: do NOT run from a host that is also the orchestrator's
# source IP for the per-IP rate-limit zone (30/min). For section 3 (rate-limit
# blast), this script intentionally fires 100 requests; if your IP is also
# being used for other test traffic at the same time, you may self-lockout
# briefly. Recommended source: sandbox VPS / tethered laptop / Server5 ssh.

set -uo pipefail
# NOT set -e - we want to capture failures and continue, not exit early.

OUT="${SMOKE_OUT:-/tmp/phase-60-smoke.txt}"
RESULT_MD="${RESULT_MD:-.planning/phases/60-public-endpoint-rate-limit/60-SMOKE-RESULTS.md}"
TOKEN="${LIV_SK_TOKEN:-MISSING}"
EXPECTED_IP="45.137.194.102"
EXPECTED_SACRED_SHA="4f868d318abff71f8c8bfbcf443b2393a553018b"

PASS=0
FAIL=0
RESULTS=()

# Truncate previous output file so re-runs start clean.
: > "$OUT"

note() {
  echo "[smoke] $*" | tee -a "$OUT"
}

assert_eq() {
  # assert_eq <name> <actual> <expected>
  if [ "$2" = "$3" ]; then
    note "PASS $1: $2"
    PASS=$((PASS+1))
    RESULTS+=("|$1|PASS|$2|")
  else
    note "FAIL $1: got '$2', want '$3'"
    FAIL=$((FAIL+1))
    RESULTS+=("|$1|FAIL|got '$2', want '$3'|")
  fi
}

assert_match() {
  # assert_match <name> <actual> <regex>
  if echo "$2" | grep -qE "$3"; then
    note "PASS $1: matched /$3/"
    PASS=$((PASS+1))
    RESULTS+=("|$1|PASS|matched /$3/|")
  else
    note "FAIL $1: '$2' did not match /$3/"
    FAIL=$((FAIL+1))
    RESULTS+=("|$1|FAIL|did not match /$3/|")
  fi
}

# ============================================================
# Section 1 - DNS resolution (Phase 60 success criterion 4)
# ============================================================
note "=== Section 1: DNS resolution ==="
DNS_CF=$(dig +short api.livinity.io @1.1.1.1 | head -1)
DNS_GOOGLE=$(dig +short api.livinity.io @8.8.8.8 | head -1)
assert_eq "DNS-1.1.1.1"   "$DNS_CF"     "$EXPECTED_IP"
assert_eq "DNS-8.8.8.8"   "$DNS_GOOGLE" "$EXPECTED_IP"

# ============================================================
# Section 2 - TLS validity (Phase 60 success criterion 4)
# ============================================================
note "=== Section 2: TLS cert validity ==="
TLS_OUT=$(openssl s_client -connect api.livinity.io:443 -servername api.livinity.io < /dev/null 2>&1)
TLS_VERIFY_LINE=$(echo "$TLS_OUT" | grep -E "Verify return code:" | head -1)
TLS_SUBJECT=$(echo "$TLS_OUT" | grep -E "subject=" | head -1)
assert_match "TLS-Verify"      "$TLS_VERIFY_LINE" "Verify return code: 0 \\(ok\\)"
assert_match "TLS-Subject-CN"  "$TLS_SUBJECT"     "api\\.livinity\\.io"

# ============================================================
# Section 3 - Bearer-authed request reaches broker (success criterion 1)
# ============================================================
note "=== Section 3: Bearer-authed request through Caddy -> relay -> tunnel -> livinityd ==="
if [ "$TOKEN" = "MISSING" ]; then
  note "SKIP Section 3: LIV_SK_TOKEN not provided. Re-run with LIV_SK_TOKEN=liv_sk_xxx ./phase-60-smoke.sh"
  RESULTS+=("|Bearer-authed|SKIP|LIV_SK_TOKEN not set|")
else
  BEARER_RESP=$(curl -sN \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --max-time 30 \
    -o /tmp/phase-60-bearer-body.txt \
    -w "HTTP_STATUS=%{http_code}" \
    -d '{"model":"claude-sonnet-4-5","max_tokens":50,"messages":[{"role":"user","content":"Reply with the single word PHASE60OK."}]}' \
    https://api.livinity.io/v1/messages 2>&1)
  BEARER_STATUS=$(echo "$BEARER_RESP" | grep -oE "HTTP_STATUS=[0-9]+" | cut -d= -f2)
  note "Bearer status: $BEARER_STATUS"
  note "Bearer body (first 500 chars):"
  head -c 500 /tmp/phase-60-bearer-body.txt | tee -a "$OUT"

  # Acceptable outcomes:
  # - 200 + Anthropic-shape body (full success - Mini PC has been update.sh-deployed with IP-guard-removed broker)
  # - 401 + authentication_error (Phase 59 says token invalid OR token rejected by Mini PC; chain WORKS but token bad)
  # - 401 + "request source ip ... not on broker allowlist" (IP-guard still active on Mini PC - update.sh deploy needed; chain works up to broker)
  if [ "$BEARER_STATUS" = "200" ]; then
    note "PASS Bearer reached broker AND succeeded (Mini PC deploy current with Phase 60)"
    PASS=$((PASS+1))
    RESULTS+=("|Bearer-authed|PASS|HTTP 200 + Anthropic-shape|")
  elif [ "$BEARER_STATUS" = "401" ]; then
    BODY=$(cat /tmp/phase-60-bearer-body.txt)
    if echo "$BODY" | grep -q "broker allowlist"; then
      note "PARTIAL Bearer reached broker but Mini PC IP-guard still active. Operator must run 'bash /opt/livos/update.sh' on Mini PC then re-run."
      RESULTS+=("|Bearer-authed|PARTIAL|Mini PC needs update.sh - chain works to broker|")
    else
      note "PARTIAL Bearer reached broker, returned 401 auth error (token invalid?). Chain works."
      RESULTS+=("|Bearer-authed|PARTIAL|Token invalid; chain Caddy->relay->tunnel->livinityd works|")
    fi
    # treat partial as soft-pass for chain verification but FAIL the success criterion 1 check
    FAIL=$((FAIL+1))
  else
    note "FAIL Bearer status $BEARER_STATUS unexpected"
    FAIL=$((FAIL+1))
    RESULTS+=("|Bearer-authed|FAIL|status=$BEARER_STATUS|")
  fi
fi

# ============================================================
# Section 4 - Rate-limit blast (success criterion 3)
# ============================================================
note "=== Section 4: Rate-limit blast (100 concurrent -> expect >=1 x 429) ==="
note "RESEARCH.md Pitfall 8: ensure this host is NOT the orchestrator's normal source IP"
sleep 2
mkdir -p /tmp/phase-60-blast
rm -f /tmp/phase-60-blast/r-*

for i in $(seq 1 100); do
  (curl -s -o /tmp/phase-60-blast/r-$i.body \
    -D /tmp/phase-60-blast/r-$i.headers \
    -w "HTTP_STATUS=%{http_code}\n" \
    --max-time 15 \
    -H "Authorization: Bearer ${TOKEN:-liv_sk_invalid_for_blast}" \
    -H "Content-Type: application/json" \
    -d '{"model":"claude-sonnet-4-5","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}' \
    https://api.livinity.io/v1/messages > /tmp/phase-60-blast/r-$i.status 2>&1) &
done
wait

RL_429_COUNT=$(grep -lE "HTTP_STATUS=429" /tmp/phase-60-blast/r-*.status 2>/dev/null | wc -l)
note "429 count: $RL_429_COUNT / 100"
if [ "$RL_429_COUNT" -ge 1 ]; then
  PASS=$((PASS+1))
  RESULTS+=("|RateLimit-429-count|PASS|$RL_429_COUNT x 429|")
else
  FAIL=$((FAIL+1))
  RESULTS+=("|RateLimit-429-count|FAIL|0 x 429 in 100 reqs|")
fi

# Body shape on a 429
ONE_429_FILE=$(grep -lE "HTTP_STATUS=429" /tmp/phase-60-blast/r-*.status 2>/dev/null | head -1)
if [ -n "$ONE_429_FILE" ]; then
  IDX=$(basename "$ONE_429_FILE" | sed 's/r-//; s/.status//')
  BODY_429=$(cat /tmp/phase-60-blast/r-$IDX.body)
  HDR_429=$(cat /tmp/phase-60-blast/r-$IDX.headers)
  note "Sample 429 body: $BODY_429"
  note "Sample 429 headers (filtered):"
  echo "$HDR_429" | grep -iE '^(retry-after|content-type)' | tee -a "$OUT"

  HAS_TYPE_ERROR=$(echo "$BODY_429"  | jq -e '.type == "error"'                                              > /dev/null 2>&1 && echo yes || echo no)
  HAS_RL_TYPE=$(echo "$BODY_429"     | jq -e '.error.type == "rate_limit_error"'                             > /dev/null 2>&1 && echo yes || echo no)
  HAS_MESSAGE=$(echo "$BODY_429"     | jq -e '.error.message | type == "string" and length > 0'              > /dev/null 2>&1 && echo yes || echo no)
  HAS_REQ_ID=$(echo "$BODY_429"      | jq -e '.request_id | test("^req_")'                                   > /dev/null 2>&1 && echo yes || echo no)
  HAS_RETRY_AFTER=$(echo "$HDR_429"  | grep -iE '^retry-after:' >/dev/null 2>&1 && echo yes || echo no)

  assert_eq "429-body-type-error"        "$HAS_TYPE_ERROR"      "yes"
  assert_eq "429-body-rate_limit_error"  "$HAS_RL_TYPE"         "yes"
  assert_eq "429-body-message"           "$HAS_MESSAGE"         "yes"
  assert_eq "429-body-request_id-prefix" "$HAS_REQ_ID"          "yes"
  assert_eq "429-header-Retry-After"     "$HAS_RETRY_AFTER"     "yes"
fi

# ============================================================
# Section 5 - Existing *.livinity.io regression (no broken stack)
# ============================================================
note "=== Section 5: existing wildcard regression ==="
RELAY_HEAD=$(curl -sI --max-time 5 https://relay.livinity.io | head -1)
BARE_HEAD=$(curl -sI --max-time 5 https://livinity.io       | head -1)
note "relay.livinity.io: $RELAY_HEAD"
note "livinity.io:       $BARE_HEAD"
# pass if neither shows 502 / 503 / connection failure
if echo "$RELAY_HEAD" | grep -qE "HTTP/.+ (200|301|302|308|404)"; then
  PASS=$((PASS+1)); RESULTS+=("|Regression-relay|PASS|$RELAY_HEAD|")
else
  FAIL=$((FAIL+1)); RESULTS+=("|Regression-relay|FAIL|$RELAY_HEAD|")
fi
if echo "$BARE_HEAD" | grep -qE "HTTP/.+ (200|301|302|308|404)"; then
  PASS=$((PASS+1)); RESULTS+=("|Regression-bare|PASS|$BARE_HEAD|")
else
  FAIL=$((FAIL+1)); RESULTS+=("|Regression-bare|FAIL|$BARE_HEAD|")
fi

# ============================================================
# Section 6 - Caddy log filter check (Authorization header should NOT appear)
# ============================================================
# Requires Server5 ssh access; orchestrator-only step. Skip if no ssh available.
if [ -n "${SERVER5_SSH:-}" ]; then
  note "=== Section 6: Caddy log filter check ==="
  LOG_HAS_AUTH=$($SERVER5_SSH 'sudo head -50 /var/log/caddy/api.livinity.io.log 2>/dev/null | grep -ic Authorization' || echo "0")
  assert_eq "Caddy-log-no-Authorization" "$LOG_HAS_AUTH" "0"
fi

# ============================================================
# Section 7 - Sacred file final gate
# ============================================================
note "=== Section 7: sacred file SHA gate ==="
ACTUAL_SHA=$(git hash-object nexus/packages/core/src/sdk-agent-runner.ts 2>/dev/null || echo "missing")
assert_eq "Sacred-file-SHA" "$ACTUAL_SHA" "$EXPECTED_SACRED_SHA"

# ============================================================
# Render results table
# ============================================================
note "=== TOTAL: $PASS passed, $FAIL failed ==="

{
  echo "# 60-SMOKE-RESULTS - Phase 60 Wave 4"
  echo
  echo "**Captured:** $(date -u +%FT%TZ)"
  echo "**Source IP:** $(curl -s --max-time 3 https://api.ipify.org 2>/dev/null || echo unknown)"
  echo
  echo "## Summary"
  echo
  echo "- Pass: $PASS"
  echo "- Fail: $FAIL"
  echo
  echo "## Verdict per Check"
  echo
  echo "| Check | Status | Detail |"
  echo "|-------|--------|--------|"
  for row in "${RESULTS[@]}"; do
    echo "$row"
  done
  echo
  echo "## ROADMAP Phase 60 Success Criteria Mapping"
  echo
  echo "| # | Criterion | Smoke Section | Result |"
  echo "|---|-----------|---------------|--------|"
  echo "| 1 | curl + Bearer -> Anthropic-shape | section 3 | <see Bearer-authed row above> |"
  echo "| 2 | Open WebUI from outside Mini PC LAN | section 3 + Phase 63 | proxy/auth chain verified here; full UI test in Phase 63 |"
  echo "| 3 | Rate-limit blast -> 429 + 4-field body + Retry-After | section 4 | <see RateLimit rows above> |"
  echo "| 4 | Valid TLS cert | section 1 + section 2 | <see DNS + TLS rows above> |"
  echo
  echo "## Sacred file SHA"
  echo
  echo "    $ACTUAL_SHA"
  echo "    expected: $EXPECTED_SACRED_SHA"
} > "$RESULT_MD"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
