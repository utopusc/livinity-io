#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Phase 33 patch for /opt/livos/update.sh:
#
#   OBS-01: structured per-deploy log file + machine-readable JSON record.
#           Wraps update.sh in a tee-to-log-file + EXIT-trap that writes the
#           canonical .log + .json records the Phase 33 UI consumes.
#
# Two splices, both guarded by `grep -qF` markers (idempotent re-apply):
#   Splice 1 (LOG_TEE):     trap block + tee-redirect, inserted AFTER the
#                            `set -euo pipefail` line at the top of update.sh.
#                            Goes BEFORE Phase 32's precheck() call so precheck
#                            stdout/stderr is also captured in the log.
#   Splice 2 (SHA_CAPTURE): `LIVOS_UPDATE_TO_SHA=$(git -C ...)` inserted AFTER
#                            update.sh's existing `git clone --depth 1` line.
#                            This lets phase33_finalize rename .pending log to
#                            include the 7-char SHA on success.
#
# Apply via:  ssh <host> 'sudo bash -s' < phase33-update-sh-logging-patch.sh
#
# Backup safety: writes /opt/livos/update.sh.pre-phase33 BEFORE any change.
# Final `bash -n` syntax check on patched output. On syntax fail, restores from
# backup + exit 1 (Phase 31/32 lesson — never leave update.sh half-patched).
#
# Caller responsible for sudo. Script does NOT call `sudo` internally.
#
# Trap body sync: the HEREDOC body below is the production variant of the
# `phase33-trap-block.sh.tmpl` test template (sibling at tests/). Both files
# are committed to the repo for review. Future maintainers MUST update both
# in lockstep — the only allowed differences are:
#   - This (production) variant has fixed paths, no *_OVERRIDE env vars
#   - Test template honors HISTORY_DIR_OVERRIDE / DEPLOYED_SHA_FILE_OVERRIDE /
#     LIVOS_UPDATE_START_ISO_FS_OVERRIDE so the bash test can sandbox writes
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

UPDATE_SH="/opt/livos/update.sh"
HISTORY_DIR="/opt/livos/data/update-history"

MARKER_LOG_TEE="# ── Phase 33 OBS-01: log file emission ──"
MARKER_SHA_CAPTURE="# ── Phase 33 OBS-01 prep: capture target SHA for log filename rename ──"

if [[ ! -f "$UPDATE_SH" ]]; then
    echo "ERROR: $UPDATE_SH not found on this host" >&2
    exit 1
fi

# ── Snapshot original (Phase 31/32 precedent — keep .pre-phaseNN backup) ─────
if [[ ! -f "$UPDATE_SH.pre-phase33" ]]; then
    cp "$UPDATE_SH" "$UPDATE_SH.pre-phase33"
    echo "Backup written: $UPDATE_SH.pre-phase33"
else
    echo "Backup already exists: $UPDATE_SH.pre-phase33 (re-run safe)"
fi

# Ensure history dir exists (Phase 32 also creates it — idempotent)
mkdir -p "$HISTORY_DIR"

# ──────────────────────────────────────────────────────────────────────────────
# Patch 1/2: LOG_TEE — splice trap block at top of update.sh
# ──────────────────────────────────────────────────────────────────────────────
if grep -qF "$MARKER_LOG_TEE" "$UPDATE_SH"; then
    echo "ALREADY-PATCHED (LOG_TEE): trap block present in update.sh"
else
    # Anchor on `set -euo pipefail` (line ~8 of update.sh; both Mini PC and Server4)
    ANCHOR_LINE=$(grep -n '^set -euo pipefail' "$UPDATE_SH" | head -1 | cut -d: -f1)
    if [[ -z "$ANCHOR_LINE" ]]; then
        echo "ERROR: cannot find 'set -euo pipefail' anchor for LOG_TEE insertion" >&2
        exit 1
    fi
    INSERT_AT=$((ANCHOR_LINE + 1))

    PATCH_BLOCK=$(mktemp)
    cat <<'EOLOGTEE' > "$PATCH_BLOCK"

# ── Phase 33 OBS-01: log file emission ──
# Tee all stdout+stderr to a per-deploy log file and write the machine-readable
# JSON record on exit. Mirrors Phase 32's precheck-fail.json + livos-rollback.sh
# JSON write idiom — Phase 33 UI reads these via system.listUpdateHistory.
HISTORY_DIR="/opt/livos/data/update-history"
DEPLOYED_SHA_FILE="/opt/livos/.deployed-sha"
mkdir -p "$HISTORY_DIR"

LIVOS_UPDATE_START_TS=$(date -u +%s)
LIVOS_UPDATE_START_TS_MS=$(date -u +%s%3N 2>/dev/null || echo $((LIVOS_UPDATE_START_TS * 1000)))
LIVOS_UPDATE_START_ISO_FS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
LIVOS_UPDATE_START_ISO_JSON=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LIVOS_UPDATE_LOG_FILE="${HISTORY_DIR}/update-${LIVOS_UPDATE_START_ISO_FS}-$$-pending.log"
LIVOS_UPDATE_FROM_SHA=$(cat "$DEPLOYED_SHA_FILE" 2>/dev/null | tr -d '[:space:]' || echo "unknown")
LIVOS_UPDATE_TO_SHA=""

exec > >(tee -a "$LIVOS_UPDATE_LOG_FILE") 2>&1

phase33_finalize() {
    local exit_code=$?
    local end_ts end_ts_ms duration_ms status reason_field
    end_ts=$(date -u +%s)
    end_ts_ms=$(date -u +%s%3N 2>/dev/null || echo $((end_ts * 1000)))
    duration_ms=$((end_ts_ms - LIVOS_UPDATE_START_TS_MS))

    # Skip-on-precheck-fail (per O-08 / R-06): if Phase 32 precheck() wrote a
    # precheck-fail row with our START_ISO_FS prefix, rename .pending log to
    # <ts>-precheck-fail.log + backfill log_path into the existing JSON.
    local precheck_json="${HISTORY_DIR}/${LIVOS_UPDATE_START_ISO_FS}-precheck-fail.json"
    if [[ -f "$precheck_json" ]]; then
        local pf_log="${HISTORY_DIR}/${LIVOS_UPDATE_START_ISO_FS}-precheck-fail.log"
        if [[ -f "$LIVOS_UPDATE_LOG_FILE" ]]; then
            mv "$LIVOS_UPDATE_LOG_FILE" "$pf_log" 2>/dev/null || true
        fi
        if ! grep -q '"log_path"' "$precheck_json" 2>/dev/null; then
            local tmp; tmp=$(mktemp)
            # Insert "log_path": "<pf_log>" before the closing brace. Two-pass
            # awk: collect all lines, then re-emit with the extra field inserted
            # before the final '}'. Robust against trailing newlines and any
            # field ordering inside the JSON body.
            awk -v lp="$pf_log" '
                { lines[NR] = $0 }
                END {
                    last_brace = 0
                    for (i = NR; i >= 1; i--) {
                        if (lines[i] ~ /^[[:space:]]*\}[[:space:]]*$/) { last_brace = i; break }
                    }
                    if (last_brace == 0) {
                        for (i = 1; i <= NR; i++) print lines[i]
                    } else {
                        for (i = 1; i < last_brace; i++) {
                            if (i == last_brace - 1) {
                                line = lines[i]
                                if (line !~ /,[[:space:]]*$/) {
                                    sub(/[[:space:]]*$/, "", line)
                                    line = line ","
                                }
                                print line
                            } else {
                                print lines[i]
                            }
                        }
                        print "  \"log_path\": \"" lp "\""
                        for (i = last_brace; i <= NR; i++) print lines[i]
                    }
                }
            ' "$precheck_json" > "$tmp" 2>/dev/null && mv "$tmp" "$precheck_json" 2>/dev/null || rm -f "$tmp"
            chmod 644 "$precheck_json" 2>/dev/null || true
        fi
        return
    fi

    if (( exit_code == 0 )); then
        status="success"
    else
        status="failed"
    fi

    local final_log_file="$LIVOS_UPDATE_LOG_FILE"
    if [[ -n "$LIVOS_UPDATE_TO_SHA" ]]; then
        final_log_file="${HISTORY_DIR}/update-${LIVOS_UPDATE_START_ISO_FS}-${LIVOS_UPDATE_TO_SHA:0:7}.log"
        mv "$LIVOS_UPDATE_LOG_FILE" "$final_log_file" 2>/dev/null || true
    fi

    # IMPORTANT: extract reason BEFORE appending the [PHASE33-SUMMARY] line.
    # The summary line contains the literal substring "failed" which would
    # match the reason regex below and `tail -1` would pick the summary itself
    # instead of the real error line.
    reason_field=""
    if [[ "$status" == "failed" ]]; then
        local last_err
        last_err=$(grep -E '\[FAIL\]|fail|Error|error' "$final_log_file" 2>/dev/null \
            | grep -vF '[PHASE33-SUMMARY]' \
            | tail -1 | tr -d '"' | cut -c1-200)
        reason_field=", \"reason\": \"${last_err:-unknown error (exit $exit_code)}\""
    fi

    {
        echo ""
        echo "[PHASE33-SUMMARY] status=$status exit_code=$exit_code duration_seconds=$((duration_ms / 1000))"
    } >> "$final_log_file" 2>/dev/null || true

    local from_field=""
    [[ -n "$LIVOS_UPDATE_FROM_SHA" ]] && [[ "$LIVOS_UPDATE_FROM_SHA" != "unknown" ]] && from_field=", \"from_sha\": \"$LIVOS_UPDATE_FROM_SHA\""
    local to_field=""
    [[ -n "$LIVOS_UPDATE_TO_SHA" ]] && to_field=", \"to_sha\": \"$LIVOS_UPDATE_TO_SHA\""

    local json_path="${HISTORY_DIR}/${LIVOS_UPDATE_START_ISO_FS}-${status}.json"
    cat > "$json_path" <<JSON
{
  "timestamp": "${LIVOS_UPDATE_START_ISO_JSON}",
  "status": "${status}"${from_field}${to_field},
  "duration_ms": ${duration_ms},
  "log_path": "${final_log_file}"${reason_field}
}
JSON
    chmod 644 "$json_path" 2>/dev/null || true
}
trap phase33_finalize EXIT

EOLOGTEE

    awk -v line="$INSERT_AT" -v patchfile="$PATCH_BLOCK" '
        BEGIN { while ((getline pl < patchfile) > 0) patch = patch pl ORS }
        NR == line { printf "%s", patch }
        { print }
    ' "$UPDATE_SH" > "$UPDATE_SH.new"
    mv "$UPDATE_SH.new" "$UPDATE_SH"
    chmod +x "$UPDATE_SH"
    rm -f "$PATCH_BLOCK"
    echo "PATCH-OK (LOG_TEE): trap block inserted after line $ANCHOR_LINE"
fi

# ──────────────────────────────────────────────────────────────────────────────
# Patch 2/2: SHA_CAPTURE — capture LIVOS_UPDATE_TO_SHA after `git clone --depth 1`
# ──────────────────────────────────────────────────────────────────────────────
if grep -qF "$MARKER_SHA_CAPTURE" "$UPDATE_SH"; then
    echo "ALREADY-PATCHED (SHA_CAPTURE): TO_SHA capture present in update.sh"
else
    CLONE_LINE=$(grep -n 'git clone --depth 1' "$UPDATE_SH" | head -1 | cut -d: -f1 || true)
    if [[ -z "$CLONE_LINE" ]]; then
        echo "WARN: cannot find 'git clone --depth 1' anchor — SHA_CAPTURE NOT wired."
        echo "WARN: trap will still write JSON, but log filename will lack SHA suffix."
    else
        INSERT_AT=$((CLONE_LINE + 1))
        awk -v line="$INSERT_AT" -v marker="$MARKER_SHA_CAPTURE" '
            NR == line {
                print marker
                print "LIVOS_UPDATE_TO_SHA=$(git -C \"$TEMP_DIR\" rev-parse HEAD 2>/dev/null || echo \"\")"
            }
            { print }
        ' "$UPDATE_SH" > "$UPDATE_SH.new"
        mv "$UPDATE_SH.new" "$UPDATE_SH"
        chmod +x "$UPDATE_SH"
        echo "PATCH-OK (SHA_CAPTURE): TO_SHA capture inserted after line $CLONE_LINE"
    fi
fi

# ──────────────────────────────────────────────────────────────────────────────
# Final safety net: bash syntax check on patched update.sh
# ──────────────────────────────────────────────────────────────────────────────
if ! bash -n "$UPDATE_SH"; then
    echo "FATAL: patched $UPDATE_SH failed bash syntax check — restoring backup" >&2
    cp "$UPDATE_SH.pre-phase33" "$UPDATE_SH"
    chmod +x "$UPDATE_SH"
    echo "RESTORED: $UPDATE_SH reverted to pre-phase33 backup" >&2
    exit 1
fi

echo
echo "=== PHASE 33 PATCH COMPLETE ==="
echo "Backup:            $UPDATE_SH.pre-phase33"
echo "Patched update.sh: $UPDATE_SH"
echo "history dir:       $HISTORY_DIR"
echo
echo "Markers in update.sh:"
grep -nE "Phase 33 OBS-01" "$UPDATE_SH" | head -5 || true
