#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Phase 32 REL-01: precheck() + record_previous_sha() helpers
#
# This file is the SOURCE-OF-TRUTH for the bash block that Plan 32-03's
# phase32-systemd-rollback-patch.sh will splice into /opt/livos/update.sh.
#
# DO NOT execute this file directly — it is sourced/cat-ed by the patch script.
# Bash unit tests under tests/precheck-*.sh source this file then invoke the
# functions in isolation with mocked df/mktemp/curl.
#
# Marker (used by Plan 32-03 patch script for idempotency):
#   # ── Phase 32 REL-01: precheck ──
# ──────────────────────────────────────────────────────────────────────────────

# ── Phase 32 REL-01: precheck ──
# Refuses to start update.sh if the host can't possibly succeed.
# Three guards: disk free >= 2GB on /opt/livos, /opt/livos writable,
# api.github.com/repos/utopusc/livinity-io reachable within 5s.
# Output format `PRECHECK-FAIL: <reason>` MUST stay parser-friendly — Phase 34
# UX-01 toast handler matches `^PRECHECK-FAIL: (.+)$` regex on this string.
# Single-line, < 200 chars, no ANSI codes.
#
# On any failure: writes <iso-ts>-precheck-fail.json to update-history/ AND
# exits 1 (Phase 33 OBS-02 will render these as "deploy attempted, blocked").
#
# IMPORTANT — call-site convention: the patch script inserts `precheck || exit 1`
# (not bare `precheck`). This function uses `exit 1` internally (not `return 1`)
# by design — it must only be called from a non-subshell context. The `|| exit 1`
# at the call site is a defensive belt-and-suspenders guard: if this function is
# ever refactored to use `return 1` semantics, the calling update.sh will still
# correctly abort rather than silently continuing past a failed precheck.
precheck() {
    local start_ts end_ts duration_ms iso_ts history_dir
    start_ts=$(date -u +%s%3N 2>/dev/null || echo $(($(date -u +%s) * 1000)))
    iso_ts=$(date -u +%Y-%m-%dT%H-%M-%SZ)
    history_dir="/opt/livos/data/update-history"

    # FIRST action: ensure history dir exists (so the failure-row write below
    # has a target). Phase 33 also creates this — idempotent.
    mkdir -p "$history_dir" 2>/dev/null || true

    local fail_reason=""

    # Guard 1: disk free >= 2 GB on /opt/livos's mount
    local avail_gb
    avail_gb=$(df -BG -P /opt/livos 2>/dev/null | awk 'NR==2 {gsub(/G/,"",$4); print $4+0}')
    if [[ -z "${avail_gb:-}" ]]; then
        fail_reason="PRECHECK-FAIL: cannot determine free disk space on /opt/livos (df failed — check mountpoint exists)"
    elif (( avail_gb < 2 )); then
        fail_reason="PRECHECK-FAIL: insufficient disk space on /opt/livos (need >=2GB, have ${avail_gb}GB)"
    fi

    # Guard 2: /opt/livos writable (only if guard 1 passed)
    if [[ -z "$fail_reason" ]]; then
        local probe
        if ! probe=$(mktemp -p /opt/livos .precheck-XXXXXX 2>/dev/null); then
            fail_reason="PRECHECK-FAIL: /opt/livos is not writable (check mount/perms — root must own dir)"
        else
            rm -f "$probe"
        fi
    fi

    # Guard 3: GitHub reachable (only if guards 1+2 passed)
    if [[ -z "$fail_reason" ]]; then
        local curl_exit=0
        curl -fsI -m 5 https://api.github.com/repos/utopusc/livinity-io >/dev/null 2>&1 || curl_exit=$?
        if (( curl_exit != 0 )); then
            fail_reason="PRECHECK-FAIL: GitHub api.github.com unreachable (curl exit ${curl_exit} — check network or rate-limit)"
        fi
    fi

    # On failure: write precheck-failed.json + emit reason to stderr + exit 1
    if [[ -n "$fail_reason" ]]; then
        end_ts=$(date -u +%s%3N 2>/dev/null || echo $(($(date -u +%s) * 1000)))
        duration_ms=$((end_ts - start_ts))
        local json_path="${history_dir}/${iso_ts}-precheck-fail.json"
        # Escape double-quotes in reason for JSON safety
        local escaped_reason=${fail_reason//\"/\\\"}
        # Wrap the heredoc redirect in a brace group so bash's own
        # "no such file or directory" complaint is also silenced when the
        # history dir couldn't be created (e.g. precheck running on a host
        # where /opt/livos does not exist — test environments). The
        # PRECHECK-FAIL stderr message below is the contract; the JSON write
        # is best-effort logging that Phase 33 consumes.
        { cat > "$json_path" <<JSON
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "precheck-failed",
  "reason": "${escaped_reason}",
  "duration_ms": ${duration_ms}
}
JSON
        } 2>/dev/null
        chmod 644 "$json_path" 2>/dev/null || true
        echo "$fail_reason" >&2
        exit 1
    fi
}

# ── Phase 32 REL-02 prep: SHA rotation ──
# Shifts current /opt/livos/.deployed-sha to .deployed-sha.previous BEFORE
# update.sh writes the new SHA. Plan 32-02's livos-rollback.sh reads
# .deployed-sha.previous to know which SHA to revert to.
# No-op on first-ever deploy (no .deployed-sha to rotate).
record_previous_sha() {
    if [[ -f /opt/livos/.deployed-sha ]]; then
        cp /opt/livos/.deployed-sha /opt/livos/.deployed-sha.previous
        chmod 644 /opt/livos/.deployed-sha.previous 2>/dev/null || true
    fi
}
