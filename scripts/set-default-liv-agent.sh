#!/usr/bin/env bash
# set-default-liv-agent.sh
#
# Idempotent post-restart helper: ensures the AionUi backend's
# client_settings have Claude Code (id=2d23ff1c) set as the default
# selected agent (`guid.lastSelectedAgent`). Without this, AionUi
# defaults to `aionrs` (the Aion CLI agent), which the operator does
# not want as the default — although operator preference is to keep
# Aion CLI VISIBLE in the picker (`agents.hidden` + `agents.disabled`
# stay empty arrays).
#
# Phase 236 fixed this once via a one-shot PUT, but the value was
# subsequently observed reverted to `aionrs` (cause unknown — possibly
# a code path that reseeds defaults under certain conditions). Phase
# 238.3 makes the fix REPEATABLE by re-applying it idempotently on
# every install-script / update.sh run, so even if something resets
# the value out-of-band, the next deploy restores it.
#
# Usage: run AFTER `systemctl restart liv-assistant` and AFTER the
# /api/auth/status 200 probe (i.e., AionUi is listening on :3020).
# update.sh's existing post-restart sequence is the natural call site.
#
# Behavior:
#   1. Check current value via GET /api/settings/client
#   2. If already "2d23ff1c", log no-op and exit 0
#   3. Otherwise PUT the new value + verify via re-read
#   4. Always log result; never fail the deploy on transient API
#      hiccups (best-effort post-restart hook).
#
# Locked invariants:
#   - D-V42-NO-DATA-LOSS : we only mutate client_settings (operator
#     can override via UI any time); we do NOT touch sessions/secrets/
#     conversations/skills.
#   - Operator preference (2026-05-27 evening): "disable etmene gerek
#     yok cli kalabilir" → never set agents.hidden / agents.disabled
#     to anything except [].

set -euo pipefail
IFS=$'\n\t'

API="http://127.0.0.1:3020"
DESIRED_AGENT_ID="2d23ff1c"  # Claude Code agent (id from /api/agents)
PROBE_TIMEOUT=5

log() { echo "[set-default-liv-agent] $*" >&2; }

# Dependencies — curl is in update.sh's path; python3 for JSON parsing
for c in curl python3; do
  command -v "$c" >/dev/null 2>&1 || { log "WARN: missing $c; skipping default-agent step"; exit 0; }
done

# Step 1 — read current value
CURRENT="$(curl -sS --max-time "${PROBE_TIMEOUT}" "${API}/api/settings/client" 2>/dev/null \
  | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  print(d.get("data",{}).get("guid.lastSelectedAgent",""))
except Exception:
  print("")' 2>/dev/null || echo "")"

if [[ "${CURRENT}" == "${DESIRED_AGENT_ID}" ]]; then
  log "guid.lastSelectedAgent already ${DESIRED_AGENT_ID} (Claude Code); no-op"
  # Also normalize agents.hidden/disabled to [] in case they got dirty out-of-band
  curl -sS -X PUT -H 'Content-Type: application/json' \
    -d '{"agents.hidden":[],"agents.disabled":[]}' \
    --max-time "${PROBE_TIMEOUT}" "${API}/api/settings/client" >/dev/null 2>&1 || true
  exit 0
fi

# Step 2 — PUT desired value + clear any hidden/disabled lists (operator: CLI visible)
log "Setting guid.lastSelectedAgent: '${CURRENT}' -> '${DESIRED_AGENT_ID}' (Claude Code)"
PUT_RESULT="$(curl -sS -X PUT -H 'Content-Type: application/json' \
  -d "{\"guid.lastSelectedAgent\":\"${DESIRED_AGENT_ID}\",\"agents.hidden\":[],\"agents.disabled\":[]}" \
  --max-time "${PROBE_TIMEOUT}" "${API}/api/settings/client" 2>/dev/null || echo "")"

if [[ "${PUT_RESULT}" != *"\"success\":true"* ]]; then
  log "WARN: PUT did not return success (got: ${PUT_RESULT:0:80}); skipping verify"
  exit 0  # never fail the deploy on transient API issues
fi

# Step 3 — verify
VERIFY="$(curl -sS --max-time "${PROBE_TIMEOUT}" "${API}/api/settings/client" 2>/dev/null \
  | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  print(d.get("data",{}).get("guid.lastSelectedAgent",""))
except Exception:
  print("")' 2>/dev/null || echo "")"

if [[ "${VERIFY}" == "${DESIRED_AGENT_ID}" ]]; then
  log "OK: guid.lastSelectedAgent = ${DESIRED_AGENT_ID} (Claude Code default)"
else
  log "WARN: PUT succeeded but verify read returned '${VERIFY}' (expected '${DESIRED_AGENT_ID}')"
fi
exit 0
