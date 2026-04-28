#!/usr/bin/env bash
# Phase 32 bash unit test aggregator. Runs all 5 bash tests:
#   - precheck-disk.sh, precheck-write.sh, precheck-net.sh (Plan 32-01)
#   - rollback-no-prev-sha.sh, rollback-loop-guard.sh (Plan 32-02)
# Exits non-zero on any failure. Prints PASS/FAIL per test + final summary.

set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

TESTS=(
    "precheck-disk.sh"
    "precheck-write.sh"
    "precheck-net.sh"
    "rollback-no-prev-sha.sh"
    "rollback-loop-guard.sh"
)

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
FAILED_TESTS=()

for test_name in "${TESTS[@]}"; do
    test_path="$SCRIPT_DIR/$test_name"
    if [[ ! -f "$test_path" ]]; then
        echo "SKIP $test_name (not found — Plan 32-02 may not have authored it yet)"
        SKIP_COUNT=$((SKIP_COUNT + 1))
        continue
    fi
    if bash "$test_path"; then
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        FAILED_TESTS+=("$test_name")
    fi
done

echo
echo "=== Phase 32 bash test summary ==="
echo "Passed:  $PASS_COUNT"
echo "Failed:  $FAIL_COUNT"
echo "Skipped: $SKIP_COUNT"
if (( FAIL_COUNT > 0 )); then
    echo "Failed tests: ${FAILED_TESTS[*]}"
    exit 1
fi
exit 0
