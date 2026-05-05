#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# scripts/rollback-liv-to-nexus.sh
# Phase 65 (D-13) — paired inverse of scripts/migrate-nexus-to-liv.sh.
# Target wall-clock: < 10 min.
#
# Usage:
#   bash scripts/rollback-liv-to-nexus.sh
#   bash scripts/rollback-liv-to-nexus.sh --archive-path /opt/nexus.archived-2026-05-05
#
# Rollback strategy (inverse of migrate's 7 steps):
#   1. Identity check (D-NO-SERVER4) — refuse to run on Server4.
#   2. Stop liv-* services.
#   3. Restore /opt/nexus from archive (mv preferred; rsync from /opt/liv as fallback).
#   4. Revert systemd unit paths via inverse sed (or restore latest .bak-* file).
#   5. systemctl daemon-reload.
#   6. Start liv-* services.
#   7. Smoke test (same shape as migrate's step 6 — confirms post-rollback state).
#
# Idempotent: re-runnable if first attempt fails partway through.
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Argument parsing ─────────────────────────────────────────────────────────
ARCHIVE_PATH_OVERRIDE=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --archive-path)
            ARCHIVE_PATH_OVERRIDE="$2"
            shift 2
            ;;
        --help|-h)
            cat <<USAGE
Usage: $0 [--archive-path /opt/nexus.archived-YYYY-MM-DD]

Rolls back the Phase 65 Mini PC migration.
  --archive-path PATH    Specific archive to restore (default: most-recent
                         /opt/nexus.archived-* directory).

Hard rules:
  D-NO-SERVER4    refuses to run on Server4 (45.137.194.103).
  D-13            target wall-clock: < 10 min.
USAGE
            exit 0
            ;;
        *)
            echo "Unknown arg: $1" >&2
            exit 2
            ;;
    esac
done

# ── Identity check (D-NO-SERVER4) ────────────────────────────────────────────
SERVER4_IP="45.137.194.103"
HOSTNAME_CURRENT="$(hostname 2>/dev/null || echo unknown)"
IPS_CURRENT="$(hostname -I 2>/dev/null || echo "")"

if [[ "$IPS_CURRENT" == *"$SERVER4_IP"* ]]; then
    echo "FATAL: This script REFUSES to run on Server4 ($SERVER4_IP)." >&2
    echo "       D-NO-SERVER4 hard rule. Aborting." >&2
    exit 3
fi

# ── Constants ────────────────────────────────────────────────────────────────
LIV_DIR="/opt/liv"
NEXUS_DIR="/opt/nexus"
LIV_SERVICES=(liv-core liv-worker liv-memory liv-mcp-server livos)
SYSTEMD_UNITS=(liv-core liv-worker liv-memory liv-mcp-server)
TS_NOW="$(date +%s)"
LOG_FILE="/tmp/rollback-65-05-${TS_NOW}.log"
WALL_CLOCK_START="$(date +%s)"

# Resolve archive path: explicit --archive-path > most-recent /opt/nexus.archived-*.
if [[ -n "$ARCHIVE_PATH_OVERRIDE" ]]; then
    ARCHIVE_PATH="$ARCHIVE_PATH_OVERRIDE"
else
    # shellcheck disable=SC2012
    ARCHIVE_PATH="$(sudo ls -1dt /opt/nexus.archived-* 2>/dev/null | head -1 || echo "")"
fi

# ── Tee log output ───────────────────────────────────────────────────────────
exec > >(tee -a "$LOG_FILE") 2>&1

echo "==============================================================="
echo "  ROLLBACK started: $(date -u +%FT%TZ)"
echo "  Host:    $HOSTNAME_CURRENT (IPs: $IPS_CURRENT)"
echo "  Archive: ${ARCHIVE_PATH:-<none-detected>}"
echo "  Log:     $LOG_FILE"
echo "==============================================================="

# ── Step 1/6: Stop liv-* services ────────────────────────────────────────────
echo ""
echo "=== Step 1/6: Stopping liv-* services ==="
for svc in "${LIV_SERVICES[@]}"; do
    if systemctl list-unit-files "${svc}.service" --no-legend 2>/dev/null | grep -q "${svc}.service"; then
        sudo systemctl stop "$svc" || echo "  WARN: $svc stop returned non-zero"
    else
        echo "  SKIP: ${svc}.service unit-file not present"
    fi
done

# ── Step 2/6: Restore /opt/nexus ─────────────────────────────────────────────
echo ""
echo "=== Step 2/6: Restore $NEXUS_DIR ==="
if [[ -d "$NEXUS_DIR" ]]; then
    # Idempotent: /opt/nexus already exists. Backup and continue.
    SAFETY_BAK="${NEXUS_DIR}.pre-rollback-${TS_NOW}"
    echo "  $NEXUS_DIR already exists; moving to $SAFETY_BAK before restore"
    sudo mv "$NEXUS_DIR" "$SAFETY_BAK"
fi

if [[ -n "$ARCHIVE_PATH" && -d "$ARCHIVE_PATH" ]]; then
    echo "  Restoring archive: mv $ARCHIVE_PATH → $NEXUS_DIR"
    sudo mv "$ARCHIVE_PATH" "$NEXUS_DIR"
elif [[ -d "$LIV_DIR" ]]; then
    echo "  Archive missing; falling back to rsync $LIV_DIR → $NEXUS_DIR"
    sudo mkdir -p "$NEXUS_DIR"
    sudo rsync -a --delete --exclude=node_modules "$LIV_DIR/" "$NEXUS_DIR/"
else
    echo "FATAL: no archive at '$ARCHIVE_PATH' AND $LIV_DIR missing — cannot restore" >&2
    exit 4
fi

# ── Step 3/6: Revert systemd unit paths ──────────────────────────────────────
echo ""
echo "=== Step 3/6: Revert systemd WorkingDirectory + ExecStart paths ==="
for svc in "${SYSTEMD_UNITS[@]}"; do
    unit_file="/etc/systemd/system/${svc}.service"
    if [[ ! -f "$unit_file" ]]; then
        echo "  SKIP: $unit_file not found"
        continue
    fi

    # Strategy: prefer restoring from latest .bak-* file (created by migrate
    # script). Fallback: inverse sed s|/opt/liv|/opt/nexus|g (keeps file's
    # other unrelated edits intact).
    # shellcheck disable=SC2012
    LATEST_BAK="$(sudo ls -1t "${unit_file}.bak-"* 2>/dev/null | head -1 || echo "")"

    if [[ -n "$LATEST_BAK" && -f "$LATEST_BAK" ]]; then
        echo "  Restoring from backup: $LATEST_BAK → $unit_file"
        # Snapshot current state before clobbering (rollback-of-rollback safety).
        sudo cp "$unit_file" "${unit_file}.pre-rollback-${TS_NOW}"
        sudo cp "$LATEST_BAK" "$unit_file"
    else
        echo "  No .bak-* found; using inverse sed on $unit_file"
        sudo cp "$unit_file" "${unit_file}.pre-rollback-${TS_NOW}"
        sudo sed -i 's|/opt/liv|/opt/nexus|g' "$unit_file"
    fi
done

# ── Step 4/6: daemon-reload ──────────────────────────────────────────────────
echo ""
echo "=== Step 4/6: systemctl daemon-reload ==="
sudo systemctl daemon-reload

# ── Step 5/6: Start liv-* services ───────────────────────────────────────────
echo ""
echo "=== Step 5/6: Start liv-* services ==="
for svc in "${LIV_SERVICES[@]}"; do
    if systemctl list-unit-files "${svc}.service" --no-legend 2>/dev/null | grep -q "${svc}.service"; then
        sudo systemctl start "$svc" || echo "  WARN: $svc start returned non-zero"
    else
        echo "  SKIP: ${svc}.service unit-file not present"
    fi
done

echo "  Sleeping 5s for service warm-up..."
sleep 5

# ── Step 6/6: Smoke test ─────────────────────────────────────────────────────
echo ""
echo "=== Step 6/6: Post-rollback smoke test ==="
SMOKE_OUT_AGENT="/tmp/65-05-rollback-smoke-agent-${TS_NOW}.txt"
SMOKE_OUT_BROKER="/tmp/65-05-rollback-smoke-broker-${TS_NOW}.txt"

LIV_API_KEY_VAL=""
if [[ -r /opt/livos/.env ]]; then
    LIV_API_KEY_VAL="$(sudo grep -E '^LIV_API_KEY=' /opt/livos/.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || echo "")"
fi

SMOKE_OK=1

if [[ -z "$LIV_API_KEY_VAL" ]]; then
    echo "  WARN: LIV_API_KEY not readable; agent smoke skipped" >&2
    SMOKE_OK=0
else
    if curl -fsS -X POST \
        -H "X-Api-Key: ${LIV_API_KEY_VAL}" \
        -H "Content-Type: application/json" \
        http://localhost:3200/api/agent/stream \
        -d '{"task":"rollback-smoke-65-05"}' \
        --max-time 15 \
        -o "$SMOKE_OUT_AGENT"; then
        if [[ -s "$SMOKE_OUT_AGENT" ]]; then
            echo "  SMOKE 1 ✓: /api/agent/stream OK ($(wc -c <"$SMOKE_OUT_AGENT") bytes)"
        else
            echo "  SMOKE 1 WARN: /api/agent/stream returned empty body"
            SMOKE_OK=0
        fi
    else
        echo "  SMOKE 1 FAIL: /api/agent/stream did not return 200"
        SMOKE_OK=0
    fi
fi

if curl -fsS -X POST http://localhost:8080/v1/messages \
    -H "Authorization: Bearer subscription" \
    -H "Content-Type: application/json" \
    -d '{"model":"claude-sonnet-4","max_tokens":50,"messages":[{"role":"user","content":"rollback smoke"}]}' \
    --max-time 30 \
    -o "$SMOKE_OUT_BROKER"; then
    if [[ -s "$SMOKE_OUT_BROKER" ]]; then
        echo "  SMOKE 2 ✓: /v1/messages OK ($(wc -c <"$SMOKE_OUT_BROKER") bytes)"
    else
        echo "  SMOKE 2 WARN: /v1/messages returned empty body"
        SMOKE_OK=0
    fi
else
    echo "  SMOKE 2 FAIL: /v1/messages subscription path still broken"
    SMOKE_OK=0
fi

WALL_CLOCK_END="$(date +%s)"
WALL_CLOCK_SECS=$((WALL_CLOCK_END - WALL_CLOCK_START))

echo ""
echo "==============================================================="
if [[ "$SMOKE_OK" == "1" ]]; then
    echo "✓ ROLLBACK COMPLETE — services restored on $NEXUS_DIR paths"
else
    echo "⚠ ROLLBACK FILESYSTEM RESTORED but smoke test had warnings"
    echo "  Manual investigation required. Logs:"
    echo "    Agent:  $SMOKE_OUT_AGENT"
    echo "    Broker: $SMOKE_OUT_BROKER"
fi
echo "  Wall-clock: ${WALL_CLOCK_SECS}s (target: <600s = D-13 < 10 min)"
echo "  Log:        $LOG_FILE"
echo "==============================================================="

# Exit non-zero if smoke had issues so the user notices.
[[ "$SMOKE_OK" == "1" ]] || exit 9
