#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# scripts/migrate-nexus-to-liv.sh
# Phase 65 (RENAME-12) — Mini PC /opt/nexus/ → /opt/liv/ atomic migration.
#
# Usage:
#   bash scripts/migrate-nexus-to-liv.sh --dry-run    # default-safe, prints plan
#   bash scripts/migrate-nexus-to-liv.sh --execute    # LIVE cutover (USER-WALK)
#
# Hard rules (CONTEXT 65-CONTEXT.md):
#   D-NO-SERVER4   — refuses to run on Server4 (45.137.194.103). Identity check.
#   D-NO-BYOK      — preserves BROKER_FORCE_ROOT_HOME=true on liv-core.service.
#   D-13           — paired rollback in scripts/rollback-liv-to-nexus.sh, < 10min.
#   D-14           — archives /opt/nexus → /opt/nexus.archived-YYYY-MM-DD on success.
#   sacred file    — never edited; only path-level rsync.
#
# Authored by 65-05 (autonomous script-write phase). LIVE CUTOVER is gated as a
# checkpoint:human-action — user runs --execute interactively in a focused SSH
# session on the Mini PC.
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Argument parsing ─────────────────────────────────────────────────────────
MODE="${1:-}"
if [[ "$MODE" != "--dry-run" && "$MODE" != "--execute" ]]; then
    cat >&2 <<USAGE
Usage: $0 [--dry-run | --execute]

  --dry-run    Print every action without execution (idempotent, no state change).
  --execute    LIVE cutover. Run only on Mini PC (bruce@10.69.31.68) under
               user supervision. < 10 min wall-clock target.

This script is gated as checkpoint:human-action in 65-05-PLAN.md. Do NOT
invoke --execute autonomously.
USAGE
    exit 2
fi

# ── Identity check (D-NO-SERVER4) ────────────────────────────────────────────
# REFUSE to run on Server4. Allow Mini PC (bruce-EQ / 10.69.31.68) only.
SERVER4_IP="45.137.194.103"
HOSTNAME_CURRENT="$(hostname 2>/dev/null || echo unknown)"
IPS_CURRENT="$(hostname -I 2>/dev/null || echo "")"

if [[ "$IPS_CURRENT" == *"$SERVER4_IP"* ]]; then
    echo "FATAL: This script REFUSES to run on Server4 ($SERVER4_IP)." >&2
    echo "       D-NO-SERVER4 hard rule (memory 2026-04-27 user directive)." >&2
    echo "       Server4 is not the user's deployment. Aborting." >&2
    exit 3
fi

# Soft warning if hostname doesn't match expected Mini PC (bruce-EQ).
# Allow override for unexpected-but-not-Server4 hosts via LIV_MIGRATE_FORCE=1.
if [[ "$HOSTNAME_CURRENT" != "bruce-EQ" && "$HOSTNAME_CURRENT" != "bruce" ]]; then
    if [[ "${LIV_MIGRATE_FORCE:-0}" != "1" ]]; then
        echo "WARN: hostname '$HOSTNAME_CURRENT' is not 'bruce-EQ' (Mini PC)." >&2
        echo "      This script is designed for Mini PC only. To bypass, set" >&2
        echo "      LIV_MIGRATE_FORCE=1 (use only if you are certain)." >&2
        if [[ "$MODE" == "--execute" ]]; then
            exit 4
        fi
        echo "      Continuing in --dry-run for inspection only." >&2
    fi
fi

# ── Mode flag ────────────────────────────────────────────────────────────────
if [[ "$MODE" == "--dry-run" ]]; then
    RUN="echo [DRY-RUN]"
    echo "==============================================================="
    echo "  DRY-RUN MODE — no state will change."
    echo "  Re-invoke with --execute to perform live cutover."
    echo "==============================================================="
else
    RUN=""
    echo "==============================================================="
    echo "  EXECUTE MODE — LIVE cutover starting on $HOSTNAME_CURRENT"
    echo "  Rollback (if anything fails):"
    echo "    bash scripts/rollback-liv-to-nexus.sh"
    echo "==============================================================="
fi

# ── Constants ────────────────────────────────────────────────────────────────
ARCHIVE_DATE="$(date +%F)"
ARCHIVE_PATH="/opt/nexus.archived-${ARCHIVE_DATE}"
LIV_DIR="/opt/liv"
NEXUS_DIR="/opt/nexus"
LIV_SERVICES=(liv-core liv-worker liv-memory liv-mcp-server livos)
SYSTEMD_UNITS=(liv-core liv-worker liv-memory liv-mcp-server)
TS_NOW="$(date +%s)"
LOG_FILE="/tmp/migrate-65-05-${TS_NOW}.log"

# ── Tee log output (idempotent for both modes) ───────────────────────────────
# Skip exec-redirect under bash -n (syntax check) — `bash -n` won't reach here
# anyway, but be defensive.
if [[ -z "${LIV_MIGRATE_NO_TEE:-}" ]]; then
    exec > >(tee -a "$LOG_FILE") 2>&1
fi

echo "Migration started: $(date -u +%FT%TZ)"
echo "Host: $HOSTNAME_CURRENT (IPs: $IPS_CURRENT)"
echo "Mode: $MODE"
echo "Log:  $LOG_FILE"
echo "---------------------------------------------------------------"

# ── Pre-flight: source dir must exist ────────────────────────────────────────
if [[ ! -d "$NEXUS_DIR" ]]; then
    if [[ -d "$LIV_DIR" && ! -L "$LIV_DIR" ]]; then
        echo "Pre-flight: $NEXUS_DIR missing but $LIV_DIR exists."
        echo "             Looks like migration already ran. Idempotent exit."
        echo "             To force re-run, restore /opt/nexus from archive first."
        exit 0
    fi
    echo "FATAL: source $NEXUS_DIR not found and $LIV_DIR not present either." >&2
    exit 5
fi

# ── Step 1/7: Stop liv-* services ────────────────────────────────────────────
echo ""
echo "=== Step 1/7: Stopping liv-* services ==="
for svc in "${LIV_SERVICES[@]}"; do
    if systemctl list-unit-files "${svc}.service" --no-legend 2>/dev/null | grep -q "${svc}.service"; then
        $RUN sudo systemctl stop "$svc" || echo "  WARN: $svc stop returned non-zero (may already be stopped)"
    else
        echo "  SKIP: ${svc}.service unit-file not present"
    fi
done

# ── Step 2/7: Rsync /opt/nexus → /opt/liv ────────────────────────────────────
echo ""
echo "=== Step 2/7: Rsync $NEXUS_DIR → $LIV_DIR ==="
$RUN sudo mkdir -p "$LIV_DIR"
# --delete keeps target a faithful mirror (idempotent re-runs safe).
# Excluding node_modules: per memory, Mini PC's pnpm-store lives under
# /opt/livos/node_modules — /opt/nexus typically has no node_modules of its own,
# but we exclude defensively to keep the rsync fast.
$RUN sudo rsync -a --delete --exclude=node_modules "$NEXUS_DIR/" "$LIV_DIR/"
echo "  Rsync complete. Verify: sudo du -sh $LIV_DIR (should match $NEXUS_DIR)"

# ── Step 3/7: Rewrite systemd unit paths ────────────────────────────────────
echo ""
echo "=== Step 3/7: Rewrite systemd WorkingDirectory + ExecStart paths ==="
for svc in "${SYSTEMD_UNITS[@]}"; do
    unit_file="/etc/systemd/system/${svc}.service"
    if [[ ! -f "$unit_file" ]]; then
        echo "  SKIP: $unit_file not found"
        continue
    fi

    # Backup with timestamp (rollback uses these .bak-* files).
    backup_path="${unit_file}.bak-${TS_NOW}"
    $RUN sudo cp "$unit_file" "$backup_path"

    # Idempotent: if file already references /opt/liv exclusively, the sed is a no-op.
    if [[ "$MODE" == "--execute" ]]; then
        if sudo grep -q "/opt/nexus" "$unit_file"; then
            sudo sed -i 's|/opt/nexus|/opt/liv|g' "$unit_file"
            echo "  PATCHED: $unit_file (backup: $backup_path)"
        else
            echo "  SKIP-NO-CHANGE: $unit_file already references /opt/liv only"
        fi
    else
        echo "  [DRY-RUN] Would: sudo sed -i 's|/opt/nexus|/opt/liv|g' $unit_file"
        # Show what would change (visible without mutation):
        sudo grep -n "/opt/nexus" "$unit_file" 2>/dev/null | head -5 \
            || echo "    (no /opt/nexus refs found — would be a no-op patch)"
    fi

    # D-NO-BYOK verify: confirm BROKER_FORCE_ROOT_HOME survived. The sed above
    # is path-only and shouldn't touch env-var values, but verify defensively.
    if [[ "$svc" == "liv-core" ]]; then
        if sudo grep -q "BROKER_FORCE_ROOT_HOME" "$unit_file" 2>/dev/null; then
            echo "  D-NO-BYOK ✓: BROKER_FORCE_ROOT_HOME present in $unit_file"
        else
            echo "  D-NO-BYOK WARN: BROKER_FORCE_ROOT_HOME not found in $unit_file"
            echo "                 (may live in EnvironmentFile=/opt/livos/.env — verify)"
        fi
    fi
done

# Note: livos.service references /opt/livos (NOT /opt/nexus) per memory layout.
# Not edited above; double-check in dry-run output.

# ── Step 4/7: daemon-reload ──────────────────────────────────────────────────
echo ""
echo "=== Step 4/7: systemctl daemon-reload ==="
$RUN sudo systemctl daemon-reload

# ── Step 5/7: pnpm-store quirk fix ───────────────────────────────────────────
echo ""
echo "=== Step 5/7: pnpm-store @liv/core symlink resolution check ==="
# Per memory: /opt/livos/node_modules/.pnpm/@liv+core* may have multiple
# resolution dirs (sharp version drift). Ensure livinityd's @liv/core symlink
# points to a dir containing the freshly-rsynced dist.
PNPM_BASE="/opt/livos/node_modules/.pnpm"
if [[ -d "$PNPM_BASE" ]]; then
    # shellcheck disable=SC2012
    PNPM_DIRS=$(sudo ls -d "${PNPM_BASE}"/@liv+core* 2>/dev/null || echo "")
    if [[ -z "$PNPM_DIRS" ]]; then
        echo "  WARN: no @liv+core* dirs in $PNPM_BASE"
        echo "        — fresh pnpm install may be needed via update.sh"
    else
        DIR_COUNT=$(echo "$PNPM_DIRS" | wc -l | tr -d ' ')
        echo "  Found $DIR_COUNT @liv+core* resolution dir(s)"
        if [[ "$DIR_COUNT" -gt 1 ]]; then
            SYM_TARGET=$(sudo readlink -f /opt/livos/node_modules/@liv/core 2>/dev/null || echo "")
            if [[ -n "$SYM_TARGET" && -d "$LIV_DIR/packages/core/dist" ]]; then
                echo "  Multiple @liv+core* dirs — copying $LIV_DIR/packages/core/dist → $SYM_TARGET/"
                $RUN sudo cp -r "$LIV_DIR/packages/core/dist" "$SYM_TARGET/"
            else
                echo "  WARN: cannot resolve @liv/core symlink target ($SYM_TARGET)"
                echo "        or dist missing at $LIV_DIR/packages/core/dist"
            fi
        fi
    fi
else
    echo "  SKIP: $PNPM_BASE not present"
fi

# ── Step 6/7: Start services + smoke test ────────────────────────────────────
echo ""
echo "=== Step 6/7: Start liv-* services ==="
for svc in "${LIV_SERVICES[@]}"; do
    if systemctl list-unit-files "${svc}.service" --no-legend 2>/dev/null | grep -q "${svc}.service"; then
        $RUN sudo systemctl start "$svc" || echo "  WARN: $svc start returned non-zero"
    else
        echo "  SKIP: ${svc}.service unit-file not present"
    fi
done

if [[ "$MODE" == "--execute" ]]; then
    echo "  Sleeping 5s for services to warm up..."
    sleep 5
else
    echo "  [DRY-RUN] Would sleep 5s for service warm-up"
fi

# Smoke test: hit BOTH /api/agent/stream (regular agent path, D-06) AND
# /v1/messages (subscription path, D-07). Smoke fail aborts BEFORE the archive
# step (step 7) — preserving /opt/nexus for instant rollback.
echo ""
echo "=== Step 6b: Smoke test ==="
SMOKE_OUT_AGENT="/tmp/65-05-smoke-agent-${TS_NOW}.txt"
SMOKE_OUT_BROKER="/tmp/65-05-smoke-broker-${TS_NOW}.txt"

# Build the LIV_API_KEY header. In dry-run we can't read the .env file, but in
# execute mode we must — extract it for the curl. Failure to read is
# non-fatal in dry-run, fatal in execute.
LIV_API_KEY_VAL=""
if [[ -r /opt/livos/.env ]]; then
    LIV_API_KEY_VAL="$(sudo grep -E '^LIV_API_KEY=' /opt/livos/.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || echo "")"
fi

if [[ "$MODE" == "--execute" ]]; then
    if [[ -z "$LIV_API_KEY_VAL" ]]; then
        echo "  SMOKE FAIL: LIV_API_KEY not readable from /opt/livos/.env" >&2
        echo "  ROLLBACK: bash scripts/rollback-liv-to-nexus.sh" >&2
        exit 6
    fi

    # Smoke 1 — agent stream endpoint (D-06). Expect 200 + non-empty body.
    if ! curl -fsS -X POST \
        -H "X-Api-Key: ${LIV_API_KEY_VAL}" \
        -H "Content-Type: application/json" \
        http://localhost:3200/api/agent/stream \
        -d '{"task":"smoke-test-65-05"}' \
        --max-time 15 \
        -o "$SMOKE_OUT_AGENT"; then
        echo "  SMOKE 1 FAIL: /api/agent/stream did not return 200" >&2
        echo "  ROLLBACK: bash scripts/rollback-liv-to-nexus.sh" >&2
        exit 7
    fi
    if [[ ! -s "$SMOKE_OUT_AGENT" ]]; then
        echo "  SMOKE 1 FAIL: /api/agent/stream returned empty body" >&2
        echo "  ROLLBACK: bash scripts/rollback-liv-to-nexus.sh" >&2
        exit 7
    fi
    echo "  SMOKE 1 ✓: /api/agent/stream OK ($(wc -c <"$SMOKE_OUT_AGENT") bytes)"

    # Smoke 2 — subscription /v1/messages (D-07). Critical: this proves
    # BROKER_FORCE_ROOT_HOME survived the systemd unit edit.
    if ! curl -fsS -X POST http://localhost:8080/v1/messages \
        -H "Authorization: Bearer subscription" \
        -H "Content-Type: application/json" \
        -d '{"model":"claude-sonnet-4","max_tokens":50,"messages":[{"role":"user","content":"smoke 65-05"}]}' \
        --max-time 30 \
        -o "$SMOKE_OUT_BROKER"; then
        echo "  SMOKE 2 FAIL: /v1/messages subscription path regressed" >&2
        echo "  ROLLBACK: bash scripts/rollback-liv-to-nexus.sh" >&2
        exit 8
    fi
    if [[ ! -s "$SMOKE_OUT_BROKER" ]]; then
        echo "  SMOKE 2 FAIL: /v1/messages returned empty body" >&2
        echo "  ROLLBACK: bash scripts/rollback-liv-to-nexus.sh" >&2
        exit 8
    fi
    echo "  SMOKE 2 ✓: /v1/messages subscription OK ($(wc -c <"$SMOKE_OUT_BROKER") bytes)"
else
    echo "  [DRY-RUN] Would: curl -fsS -X POST -H 'X-Api-Key: <redacted>' http://localhost:3200/api/agent/stream -d '{\"task\":\"smoke-test-65-05\"}'"
    echo "  [DRY-RUN] Would: curl -fsS -X POST http://localhost:8080/v1/messages -H 'Authorization: Bearer subscription' ..."
    echo "  [DRY-RUN] In execute mode, smoke fail aborts BEFORE archive (step 7)."
fi

# ── Step 7/7: Archive /opt/nexus → /opt/nexus.archived-YYYY-MM-DD ────────────
echo ""
echo "=== Step 7/7: Archive $NEXUS_DIR → $ARCHIVE_PATH ==="
if [[ -d "$ARCHIVE_PATH" ]]; then
    # Idempotent: already archived under this date. Rename with -$$ suffix.
    ARCHIVE_PATH="${ARCHIVE_PATH}-$$"
    echo "  Archive path collision; using $ARCHIVE_PATH"
fi
$RUN sudo mv "$NEXUS_DIR" "$ARCHIVE_PATH"

echo ""
echo "==============================================================="
echo "✓ Migration COMPLETE (mode: $MODE)"
echo "  Archive: $ARCHIVE_PATH"
echo "  Log:     $LOG_FILE"
echo "  Rollback (if needed within 24h):"
echo "    bash scripts/rollback-liv-to-nexus.sh --archive-path $ARCHIVE_PATH"
echo "==============================================================="
