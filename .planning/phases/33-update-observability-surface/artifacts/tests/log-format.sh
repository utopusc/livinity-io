#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Phase 33 OBS-01 — bash unit test for phase33_finalize trap behavior
#
# Runs 4 scenarios against a stub update.sh that sources the canonical Phase
# 33 trap block from `phase33-trap-block.sh.tmpl` (a sibling of this test).
# Each scenario mocks a different update.sh exit path:
#   1. test_success           — clean exit 0, SHA known
#   2. test_failed            — exit 1 mid-build, SHA known
#   3. test_precheck_fail_skip— precheck-fail.json pre-existing; trap MUST skip
#                                duplicate failed.json AND backfill log_path
#   4. test_no_clone_yet      — exit 1 before SHA captured; .pending stays
#
# Exit code: 0 on all-pass, 1 on any failure.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAP_TMPL="$SCRIPT_DIR/phase33-trap-block.sh.tmpl"

if [[ ! -f "$TRAP_TMPL" ]]; then
    echo "FATAL: trap template not found at $TRAP_TMPL"
    echo "       Plan 33-02 Task 2 must create this file alongside the patch script."
    exit 1
fi

PASSED=0
FAILED=0
FAIL_LOG=()

# Helper: run a single scenario in an isolated temp dir
# Args: $1 = test name, $2 = stub body file
# Echoes: sandbox path so the caller knows where outputs landed
run_scenario() {
    local name="$1"
    local stub_body="$2"
    local sandbox
    sandbox=$(mktemp -d)
    export PHASE33_TEST_HOME="$sandbox"

    # Mock /opt/livos/data/update-history under the sandbox
    mkdir -p "$sandbox/opt/livos/data/update-history"

    # Build the stub update.sh: source trap template (with HISTORY_DIR override),
    # then run the per-scenario stub body.
    cat > "$sandbox/update.sh" <<EOF
#!/usr/bin/env bash
set -uo pipefail   # NB: no -e so the stub can exit non-zero deliberately
HISTORY_DIR_OVERRIDE="$sandbox/opt/livos/data/update-history"
DEPLOYED_SHA_FILE_OVERRIDE="$sandbox/opt/livos/.deployed-sha"
echo "deadbeefcafebabe" > "\$DEPLOYED_SHA_FILE_OVERRIDE"
source "$TRAP_TMPL"
$(cat "$stub_body")
EOF
    chmod +x "$sandbox/update.sh"
    # Run; capture exit so set -e doesn't kill our test driver
    bash "$sandbox/update.sh" >/dev/null 2>&1 || true
    # Echo sandbox path so the assertion block knows where to look
    echo "$sandbox"
}

assert() {
    local desc="$1"
    local cond="$2"
    if eval "$cond"; then
        PASSED=$((PASSED + 1))
    else
        FAILED=$((FAILED + 1))
        FAIL_LOG+=("FAIL: $desc — condition: $cond")
    fi
}

# ── Scenario 1: success ──
test_success() {
    local stub
    stub=$(mktemp)
    cat > "$stub" <<'EOSTUB'
LIVOS_UPDATE_TO_SHA="abc1234567890abcdef"
echo "[STEP] precheck OK"
echo "[STEP] git clone OK"
echo "[STEP] build OK"
exit 0
EOSTUB
    local sandbox
    sandbox=$(run_scenario "success" "$stub")
    local hist="$sandbox/opt/livos/data/update-history"

    # Find the rename target — should be update-<ISO_FS>-abc1234.log
    local logf
    logf=$(ls "$hist"/update-*-abc1234.log 2>/dev/null | head -1 || true)
    assert "test_success: renamed log file with sha exists" "[[ -n '$logf' ]]"
    assert "test_success: log contains [PHASE33-SUMMARY]" "grep -q '\\[PHASE33-SUMMARY\\] status=success' '$logf' 2>/dev/null"
    local jsonf
    jsonf=$(ls "$hist"/*-success.json 2>/dev/null | head -1 || true)
    assert "test_success: success.json exists" "[[ -n '$jsonf' ]]"
    assert "test_success: success.json has status:success" "grep -q '\"status\": \"success\"' '$jsonf' 2>/dev/null"
    assert "test_success: success.json has to_sha" "grep -q '\"to_sha\": \"abc1234567890abcdef\"' '$jsonf' 2>/dev/null"
    assert "test_success: success.json has from_sha" "grep -q '\"from_sha\": \"deadbeefcafebabe\"' '$jsonf' 2>/dev/null"
    assert "test_success: success.json has duration_ms" "grep -qE '\"duration_ms\": [0-9]+' '$jsonf' 2>/dev/null"
    assert "test_success: success.json has log_path" "grep -q '\"log_path\":' '$jsonf' 2>/dev/null"
    assert "test_success: NO failed.json written" "! ls $hist/*-failed.json >/dev/null 2>&1"
    rm -f "$stub"
    rm -rf "$sandbox"
}

# ── Scenario 2: failed (SHA known) ──
test_failed() {
    local stub
    stub=$(mktemp)
    cat > "$stub" <<'EOSTUB'
LIVOS_UPDATE_TO_SHA="bad1234567890"
echo "[STEP] precheck OK"
echo "[STEP] git clone OK"
echo "[FAIL] simulated build break"
exit 1
EOSTUB
    local sandbox
    sandbox=$(run_scenario "failed" "$stub")
    local hist="$sandbox/opt/livos/data/update-history"

    local jsonf
    jsonf=$(ls "$hist"/*-failed.json 2>/dev/null | head -1 || true)
    assert "test_failed: failed.json exists" "[[ -n '$jsonf' ]]"
    assert "test_failed: failed.json has status:failed" "grep -q '\"status\": \"failed\"' '$jsonf' 2>/dev/null"
    assert "test_failed: failed.json has reason field" "grep -q '\"reason\":' '$jsonf' 2>/dev/null"
    assert "test_failed: reason contains build break excerpt" "grep -q 'simulated build break' '$jsonf' 2>/dev/null"
    assert "test_failed: NO success.json written" "! ls $hist/*-success.json >/dev/null 2>&1"
    rm -f "$stub"
    rm -rf "$sandbox"
}

# ── Scenario 3: precheck-fail already present, trap must SKIP ──
test_precheck_fail_skip() {
    local stub
    stub=$(mktemp)
    # Pre-create the precheck-fail.json BEFORE the stub starts (simulates Phase
    # 32's precheck() having written it just before exit 1)
    cat > "$stub" <<'EOSTUB'
# Phase 32 precheck would have written this just before exit 1
ISO_NOW=$(date -u +%Y-%m-%dT%H-%M-%SZ)
PRECHECK_PRE="$HISTORY_DIR_OVERRIDE/${ISO_NOW}-precheck-fail.json"
cat > "$PRECHECK_PRE" <<JSON
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "precheck-failed",
  "reason": "PRECHECK-FAIL: insufficient disk space (need >=2GB, have 1GB)",
  "duration_ms": 250
}
JSON
# Mirror this to the env so the trap's same-second detection finds it
export LIVOS_UPDATE_START_ISO_FS_OVERRIDE="$ISO_NOW"
echo "[STEP] precheck failed"
exit 1
EOSTUB
    local sandbox
    sandbox=$(run_scenario "precheck_fail_skip" "$stub")
    local hist="$sandbox/opt/livos/data/update-history"

    assert "test_precheck_fail_skip: NO failed.json written (trap skipped)" "! ls $hist/*-failed.json >/dev/null 2>&1"
    local jsonf
    jsonf=$(ls "$hist"/*-precheck-fail.json 2>/dev/null | head -1 || true)
    assert "test_precheck_fail_skip: precheck-fail.json still exists" "[[ -n '$jsonf' ]]"
    assert "test_precheck_fail_skip: precheck-fail.json now has log_path (backfilled)" "grep -q '\"log_path\":' '$jsonf' 2>/dev/null"
    local logf
    logf=$(ls "$hist"/*-precheck-fail.log 2>/dev/null | head -1 || true)
    assert "test_precheck_fail_skip: log file renamed to precheck-fail.log" "[[ -n '$logf' ]]"
    rm -f "$stub"
    rm -rf "$sandbox"
}

# ── Scenario 4: no clone yet (SHA never set, exit 1 early) ──
test_no_clone_yet() {
    local stub
    stub=$(mktemp)
    cat > "$stub" <<'EOSTUB'
echo "[FAIL] died before clone"
exit 1
EOSTUB
    local sandbox
    sandbox=$(run_scenario "no_clone_yet" "$stub")
    local hist="$sandbox/opt/livos/data/update-history"

    local jsonf
    jsonf=$(ls "$hist"/*-failed.json 2>/dev/null | head -1 || true)
    assert "test_no_clone_yet: failed.json exists" "[[ -n '$jsonf' ]]"
    assert "test_no_clone_yet: failed.json has status:failed" "grep -q '\"status\": \"failed\"' '$jsonf' 2>/dev/null"
    # Log file should remain as .pending since SHA was never captured
    local pendlog
    pendlog=$(ls "$hist"/update-*-pending.log 2>/dev/null | head -1 || true)
    assert "test_no_clone_yet: .pending log retained (no SHA to rename to)" "[[ -n '$pendlog' ]]"
    rm -f "$stub"
    rm -rf "$sandbox"
}

# ── Run all scenarios ──
test_success
test_failed
test_precheck_fail_skip
test_no_clone_yet

echo
echo "─── Phase 33 OBS-01 trap test summary ───"
echo "passed: $PASSED"
echo "failed: $FAILED"
if (( FAILED > 0 )); then
    printf '  %s\n' "${FAIL_LOG[@]}"
    exit 1
fi
echo "ALL GREEN"
exit 0
