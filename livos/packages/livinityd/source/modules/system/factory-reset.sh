#!/bin/bash
# factory-reset.sh — LivOS v29.2 backend factory reset
#
# Argv:
#   $1 = --preserve-api-key | --no-preserve-api-key
#   $2 = absolute path to JSON event file
#
# Exit codes:
#   0 = success
#   1 = reinstall failed AND rollback succeeded (status:rolled-back)
#   2 = reinstall failed AND rollback also failed (half-deleted state)
#
# Per CONTEXT.md D-AUD-* / D-WIPE-* / D-KEY-* / D-INST-* / D-EVT-* / D-ERR-*.
# Per AUDIT-FINDINGS.md "## Phase 37 Readiness" Q1-Q4 (literal contract).

set -uo pipefail
# NOTE: NOT using `set -e` because the wipe sequence intentionally tolerates
# already-stopped services and missing files. We use explicit `|| true` on
# graceful-failure commands and explicit error checks on critical commands.

# ────────────────────────────────────────────────────────────────────────────
# Argv parsing + globals
# ────────────────────────────────────────────────────────────────────────────

PRESERVE_FLAG="${1:-}"
EVENT_PATH="${2:-}"

if [ -z "$EVENT_PATH" ] || [ -z "$PRESERVE_FLAG" ]; then
  echo "Usage: $0 --preserve-api-key|--no-preserve-api-key <event-json-path>" >&2
  exit 64
fi

case "$PRESERVE_FLAG" in
  --preserve-api-key) PRESERVE=true ;;
  --no-preserve-api-key) PRESERVE=false ;;
  *) echo "First arg must be --preserve-api-key or --no-preserve-api-key" >&2; exit 64 ;;
esac

# Hardcoded paths — NEVER use variables in rm -rf / DROP / docker volume rm targets.
# Per CONTEXT.md "no rm -rf of variable-derived paths".
readonly ENV_FILE=/opt/livos/.env
readonly APIKEY_TMP=/tmp/livos-reset-apikey
readonly INSTALL_SH_LIVE=/tmp/install.sh.live
readonly INSTALL_SH_CACHED=/opt/livos/data/cache/install.sh.cached
readonly WRAPPER=/opt/livos/data/wrapper/livos-install-wrap.sh
readonly SNAPSHOT_SIDECAR=/tmp/livos-pre-reset.path

TIMESTAMP_ISO=$(date -u +%Y%m%dT%H%M%SZ)
SNAPSHOT_PATH=/tmp/livos-pre-reset-${TIMESTAMP_ISO}.tar.gz
WIPE_START_MS=0
WIPE_END_MS=0
REINSTALL_START_MS=0
REINSTALL_END_MS=0
INSTALL_SH_EXIT=-1
INSTALL_SH_SOURCE=""    # "live" or "cache"

# D-KEY-03: cleanup trap — ALWAYS removes the apikey temp file, even on failure.
trap 'rm -f "$APIKEY_TMP" 2>/dev/null || true' EXIT

# ────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────

ms_now() { date +%s%3N; }

# write_event — emit the JSON event row at $EVENT_PATH.
# Schema per CONTEXT.md D-EVT-02.
write_event() {
  local status="$1"
  local error="${2:-null}"
  local error_json
  if [ "$error" = "null" ]; then
    error_json="null"
  else
    # JSON-escape: replace " with \" and wrap in quotes.
    error_json="\"$(echo -n "$error" | sed 's/"/\\"/g')\""
  fi
  local ended_at="null"
  if [ "$status" = "success" ] || [ "$status" = "failed" ] || [ "$status" = "rolled-back" ]; then
    ended_at="\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
  fi
  cat > "$EVENT_PATH" <<EOF
{
  "type": "factory-reset",
  "status": "$status",
  "timestamp": "$TIMESTAMP_ISO",
  "started_at": "$STARTED_AT",
  "ended_at": $ended_at,
  "preserveApiKey": $PRESERVE,
  "wipe_duration_ms": $((WIPE_END_MS - WIPE_START_MS)),
  "reinstall_duration_ms": $((REINSTALL_END_MS - REINSTALL_START_MS)),
  "install_sh_exit_code": $INSTALL_SH_EXIT,
  "install_sh_source": "$INSTALL_SH_SOURCE",
  "snapshot_path": "$SNAPSHOT_PATH",
  "error": $error_json
}
EOF
}

# attempt_rollback — restore from pre-wipe tar snapshot on reinstall failure.
# Defined BEFORE Step 3 because Step 3's install-sh-unreachable branch invokes it.
# Returns 1 on rollback success (caller exits 1 = rolled-back).
# Returns 2 on rollback failure (caller exits 2 = half-deleted).
attempt_rollback() {
  local err="$1"
  local snap
  snap=$(cat "$SNAPSHOT_SIDECAR" 2>/dev/null || true)
  if [ -n "$snap" ] && [ -f "$snap" ]; then
    if tar -xzf "$snap" -C / 2>/dev/null; then
      systemctl daemon-reload || true
      systemctl restart livos liv-core liv-worker liv-memory 2>/dev/null || true
      write_event "rolled-back" "$err"
      rm -f "$INSTALL_SH_LIVE"
      # Retain snapshot one cycle for post-mortem (per Recovery Model).
      return 1
    fi
  fi
  write_event "failed" "$err"
  return 2
}

# ────────────────────────────────────────────────────────────────────────────
# Initialise event row (in-progress)
# ────────────────────────────────────────────────────────────────────────────

STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mkdir -p "$(dirname "$EVENT_PATH")"
write_event "in-progress"

# ────────────────────────────────────────────────────────────────────────────
# Pre-flight: stash API key (D-KEY-01) — BEFORE the snapshot
# ────────────────────────────────────────────────────────────────────────────

if [ "$PRESERVE" = "true" ]; then
  if [ -r "$ENV_FILE" ]; then
    LIV_API_KEY=$(grep '^LIV_PLATFORM_API_KEY=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'") || LIV_API_KEY=""
    if [ -n "$LIV_API_KEY" ]; then
      (umask 077 && echo -n "$LIV_API_KEY" > "$APIKEY_TMP")
      chmod 0600 "$APIKEY_TMP"
    else
      echo "preserveApiKey=true but no LIV_PLATFORM_API_KEY found in $ENV_FILE" >&2
      write_event "failed" "no-api-key-in-env"
      exit 1
    fi
  fi
fi

# ────────────────────────────────────────────────────────────────────────────
# Step 1: Pre-wipe tar snapshot (D-AUD-03 / Recovery Model)
# Verbatim tar invocation from AUDIT-FINDINGS.md lines 330-342.
# ────────────────────────────────────────────────────────────────────────────

tar -czf "$SNAPSHOT_PATH" \
  /opt/livos \
  /opt/nexus \
  /etc/systemd/system/livos.service \
  /etc/systemd/system/liv-core.service \
  /etc/systemd/system/liv-worker.service \
  /etc/systemd/system/liv-memory.service \
  /etc/systemd/system/livos-rollback.service \
  /etc/systemd/system/livos.service.d \
  2>/dev/null || true
echo "$SNAPSHOT_PATH" > "$SNAPSHOT_SIDECAR"
chmod 600 "$SNAPSHOT_PATH" "$SNAPSHOT_SIDECAR" 2>/dev/null || true

# ────────────────────────────────────────────────────────────────────────────
# Step 2: Idempotent wipe (D-WIPE-01 through D-WIPE-06)
# ────────────────────────────────────────────────────────────────────────────

WIPE_START_MS=$(ms_now)

# 2a. Enumerate Docker containers BEFORE stopping PG (D-WIPE-02)
LIVOS_CONTAINERS=""
if command -v psql >/dev/null && sudo -u postgres psql -d livos -tAc "SELECT 1" >/dev/null 2>&1; then
  LIVOS_CONTAINERS=$(sudo -u postgres psql -d livos -tAc "SELECT container_name FROM user_app_instances" 2>/dev/null | tr '\n' ' ')
fi

# 2b. Stop services (D-WIPE-01) — only LivOS-managed units appear in the list; the
# remote-shell daemon is intentionally absent so the wipe never severs operator access.
# --no-block so the wipe doesn't wait on graceful shutdown timeouts.
systemctl stop --no-block livos liv-core liv-worker liv-memory livos-rollback caddy 2>/dev/null || true

# 2c. Stop and remove LivOS-managed Docker containers (D-WIPE-02).
# Word-splitting of $LIVOS_CONTAINERS is intentional — each whitespace-separated
# token is a container name.
if [ -n "$LIVOS_CONTAINERS" ]; then
  # shellcheck disable=SC2086
  docker stop $LIVOS_CONTAINERS 2>/dev/null || true
  # shellcheck disable=SC2086
  docker rm -f $LIVOS_CONTAINERS 2>/dev/null || true
fi

# 2d. Remove LivOS Docker volumes by naming convention (D-WIPE-03) — NEVER global prune.
docker volume ls --format '{{.Name}}' 2>/dev/null \
  | grep '^livos-' \
  | xargs -r docker volume rm 2>/dev/null \
  || true

# 2e. Drop database (D-WIPE-04) — IF EXISTS for idempotency.
sudo -u postgres psql -c "DROP DATABASE IF EXISTS livos;" 2>/dev/null || true
sudo -u postgres psql -c "DROP USER IF EXISTS livos;" 2>/dev/null || true

# 2f. Filesystem wipe (D-WIPE-05) — LITERAL paths only, all -rf/-f for idempotency.
rm -rf /opt/livos
rm -rf /opt/nexus
rm -f /etc/systemd/system/livos.service
rm -f /etc/systemd/system/liv-core.service
rm -f /etc/systemd/system/liv-worker.service
rm -f /etc/systemd/system/liv-memory.service
rm -f /etc/systemd/system/livos-rollback.service
rm -rf /etc/systemd/system/livos.service.d
systemctl daemon-reload || true

WIPE_END_MS=$(ms_now)
write_event "in-progress"

# ────────────────────────────────────────────────────────────────────────────
# Step 3: Fetch install.sh (live-then-cache fallback per AUDIT-FINDINGS.md Q1)
# ────────────────────────────────────────────────────────────────────────────

REINSTALL_START_MS=$(ms_now)

INSTALL_SH=""
RETRIES=0
while [ $RETRIES -lt 3 ]; do
  if curl -sSL --max-time 30 https://livinity.io/install.sh -o "$INSTALL_SH_LIVE"; then
    INSTALL_SH="$INSTALL_SH_LIVE"
    INSTALL_SH_SOURCE="live"
    break
  fi
  RETRIES=$((RETRIES + 1))
  sleep $((2 ** RETRIES))   # 2, 4, 8 seconds
done

if [ -z "$INSTALL_SH" ] && [ -f "$INSTALL_SH_CACHED" ]; then
  cp "$INSTALL_SH_CACHED" "$INSTALL_SH_LIVE"
  INSTALL_SH="$INSTALL_SH_LIVE"
  INSTALL_SH_SOURCE="cache"
fi

if [ -z "$INSTALL_SH" ]; then
  REINSTALL_END_MS=$(ms_now)
  INSTALL_SH_EXIT=-2
  # Wipe already destroyed /opt; rollback from pre-wipe snapshot is the only path.
  attempt_rollback "install-sh-unreachable"
  exit $?
fi

# ────────────────────────────────────────────────────────────────────────────
# Step 4: Run install.sh via wrapper (D-INST-01)
# ────────────────────────────────────────────────────────────────────────────

if [ "$PRESERVE" = "true" ] && [ -f "$WRAPPER" ] && [ -r "$APIKEY_TMP" ]; then
  INSTALL_SH="$INSTALL_SH" bash "$WRAPPER" --api-key-file "$APIKEY_TMP"
else
  # No-preserve path: run install.sh directly, no key. Wrapper requires
  # --api-key-file so direct invocation is correct here.
  bash "$INSTALL_SH"
fi
INSTALL_SH_EXIT=$?
REINSTALL_END_MS=$(ms_now)

# ────────────────────────────────────────────────────────────────────────────
# Step 5: Failure handling + finalisation (D-AUD-03 restore + D-ERR-01/02)
# ────────────────────────────────────────────────────────────────────────────

if [ "$INSTALL_SH_EXIT" -eq 0 ]; then
  write_event "success"
  # D-AUD-03 success cleanup — snapshot, sidecar, fetched install.sh.
  rm -f "$SNAPSHOT_PATH" "$SNAPSHOT_SIDECAR" "$INSTALL_SH_LIVE"
  exit 0
else
  # Map exit code to error string (D-ERR-01).
  # 401 / Server5 5xx detection is best-effort (D-ERR-01: "if not detectable,
  # fall back to generic"). Generic fallback is the only path here.
  ERR_KIND="install-sh-failed"
  attempt_rollback "$ERR_KIND"
  exit $?
fi
