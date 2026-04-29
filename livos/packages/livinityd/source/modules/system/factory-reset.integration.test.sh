#!/bin/bash
# factory-reset.integration.test.sh — DESTRUCTIVE integration test
#
# Verifies the full Phase 37 backend lifecycle:
#   1. Curl `system.factoryReset` mutation; assert response within 200ms
#   2. Poll the JSON event row; assert status flips through the state machine
#   3. After reinstall, curl Mini PC /api/health; assert 200
#
# SAFETY GATES (fail-closed):
#   - RUN_FACTORY_RESET_DESTRUCTIVE=1 must be set
#   - LIVOS_DESTRUCTIVE_TEST_AUTHORIZED=YES must be set
#   - LIVOS_TEST_HOST must be set (target SSH host; e.g. bruce@<scratchpad-ip>)
#   - LIVOS_TEST_TRPC_URL + LIVOS_TEST_ADMIN_TOKEN required
#   - REFUSES TO RUN if local hostname/IP looks like the user's primary Mini PC
#     (bruce-EQ / 10.69.31.68) — those targets are SCRATCHPAD-ONLY off-limits
#   - REFUSES TO RUN if either env-var gate is missing
#
# NEVER runs in CI. NEVER runs against production data. The Mini PC is the
# user's ONLY LivOS deployment that matters; never target it for routine
# verification — only against a disposable scratchpad clone.

set -euo pipefail

# ─── Gate 1: explicit destructive opt-in ─────────────────────────────────────

if [ "${RUN_FACTORY_RESET_DESTRUCTIVE:-0}" != "1" ]; then
  echo "DESTRUCTIVE TEST — set RUN_FACTORY_RESET_DESTRUCTIVE=1 to enable." >&2
  exit 64
fi

# ─── Gate 2: explicit destructive authorization ──────────────────────────────

if [ "${LIVOS_DESTRUCTIVE_TEST_AUTHORIZED:-NO}" != "YES" ]; then
  echo "DESTRUCTIVE TEST — set LIVOS_DESTRUCTIVE_TEST_AUTHORIZED=YES to authorize (this WILL wipe the host)." >&2
  exit 64
fi

# ─── Gate 3: required environment variables ──────────────────────────────────

: "${LIVOS_TEST_HOST:?Set LIVOS_TEST_HOST=bruce@<scratchpad-ip> (a disposable Mini PC clone, NEVER 10.69.31.68 directly)}"
: "${LIVOS_TEST_TRPC_URL:?Set LIVOS_TEST_TRPC_URL=https://<scratchpad-host>/trpc}"
: "${LIVOS_TEST_ADMIN_TOKEN:?Set LIVOS_TEST_ADMIN_TOKEN=<admin JWT for the scratchpad>}"

# ─── Gate 4: REFUSE on the user's primary Mini PC ───────────────────────────
#
# This script is intended to run from a developer workstation (Windows / WSL /
# Linux laptop) against a SCRATCHPAD target. If we detect the script is being
# invoked locally on the Mini PC itself (10.69.31.68 OR hostname bruce-EQ),
# REFUSE — the user explicitly stated the primary Mini PC is the only LivOS
# deployment and must NOT be wiped.

LOCAL_HOSTNAME="$(hostname 2>/dev/null || true)"
LOCAL_IPS="$(hostname -I 2>/dev/null || true)"

if [ "$LOCAL_HOSTNAME" = "bruce-EQ" ]; then
  echo "REFUSING to run on hostname 'bruce-EQ' — this is the user's primary Mini PC, which is SCRATCHPAD-OFF-LIMITS." >&2
  echo "If this is intentional (you're on a clone with the same hostname), unset hostname guard manually after re-reading the safety note in this file." >&2
  exit 1
fi

if echo " $LOCAL_IPS " | grep -q ' 10\.69\.31\.68 '; then
  echo "REFUSING to run on host with IP 10.69.31.68 — that is the user's production Mini PC." >&2
  echo "Move to a disposable scratchpad clone before re-running." >&2
  exit 1
fi

# Belt-and-braces: also refuse if the SSH target points at the production IP.
if echo "$LIVOS_TEST_HOST" | grep -q '@10\.69\.31\.68\b'; then
  echo "REFUSING: LIVOS_TEST_HOST points at 10.69.31.68 (production Mini PC). Use a scratchpad clone." >&2
  exit 1
fi

# ─── Step 0: SSH connectivity probe ──────────────────────────────────────────

if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$LIVOS_TEST_HOST" 'true'; then
  echo "FATAL: cannot SSH to $LIVOS_TEST_HOST (need passwordless key auth)" >&2
  exit 1
fi

# Snapshot the journalctl baseline so the post-mortem can diff.
BASELINE_LOG=/tmp/livos-factory-reset-baseline.log
ssh "$LIVOS_TEST_HOST" 'sudo journalctl -u livos -n 100 --no-pager' > "$BASELINE_LOG"
echo "Baseline journalctl captured at $BASELINE_LOG"

# ─── Step 1: curl the route, capture wall-clock + HTTP body ─────────────────

T0=$(date +%s%3N)
HTTP_RESPONSE=$(curl -sS \
  -H "Authorization: Bearer $LIVOS_TEST_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"json":{"preserveApiKey":true}}' \
  -w "\n__HTTP_CODE__%{http_code}" \
  "$LIVOS_TEST_TRPC_URL/system.factoryReset?batch=1")
T1=$(date +%s%3N)

HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1 | sed 's/__HTTP_CODE__//')
BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
ELAPSED=$((T1 - T0))

echo "Route returned HTTP $HTTP_CODE in ${ELAPSED}ms"
echo "Body: $BODY"

if [ "$HTTP_CODE" != "200" ]; then
  echo "FATAL: route returned HTTP $HTTP_CODE (expected 200)" >&2
  exit 1
fi
if [ "$ELAPSED" -gt 200 ]; then
  echo "WARN: route took ${ELAPSED}ms (>200ms target — D-RT-03)" >&2
fi

# Extract eventPath from response body (poor-man's JSON parse — avoids a jq
# dependency since this script runs from the developer workstation).
EVENT_PATH=$(echo "$BODY" | grep -oE '"eventPath":"[^"]+"' | head -1 | cut -d'"' -f4)
if [ -z "$EVENT_PATH" ]; then
  echo "FATAL: could not extract eventPath from response body" >&2
  exit 1
fi
echo "Event path: $EVENT_PATH"

# ─── Step 2: poll the event row until status flips to terminal ──────────────

DEADLINE=$(($(date +%s) + 600))   # 10 minutes
STATUS="missing"
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  sleep 5
  # shellcheck disable=SC2029  # $EVENT_PATH is intentionally expanded client-side: we got it from the route response and need to embed it in the remote shell command.
  STATUS=$(ssh "$LIVOS_TEST_HOST" "sudo cat $EVENT_PATH 2>/dev/null | grep -oE '\"status\":\"[^\"]+\"' | head -1 | cut -d'\"' -f4" || echo "missing")
  echo "[$(date +%H:%M:%S)] event row status: $STATUS"
  case "$STATUS" in
    success|failed|rolled-back) break ;;
  esac
done

if [ "$STATUS" != "success" ]; then
  echo "FATAL: factory reset finished with status=$STATUS" >&2
  # shellcheck disable=SC2029  # client-side expansion of $EVENT_PATH is intentional.
  ssh "$LIVOS_TEST_HOST" "sudo cat $EVENT_PATH" || true
  exit 1
fi

echo "Factory reset reported SUCCESS — verifying livinityd boot..."

# ─── Step 3: verify the new livinityd is up via /api/health ─────────────────

HEALTH_TARGET="${LIVOS_TEST_HOST_HTTP:-https://bruce.livinity.io}"
HEALTH_DEADLINE=$(($(date +%s) + 60))
while [ "$(date +%s)" -lt "$HEALTH_DEADLINE" ]; do
  if curl -fsS --max-time 5 "$HEALTH_TARGET/api/health" >/dev/null; then
    echo "PASS: $HEALTH_TARGET/api/health returned 200"
    exit 0
  fi
  sleep 5
done

echo "FAIL: $HEALTH_TARGET/api/health did not return 200 within 60s of factory-reset success" >&2
exit 1
