#!/usr/bin/env bash
# Phase 32 REL-02 unit test: livos-rollback.sh aborts cleanly when
# .rollback-attempted lock is already present.
# Strategy: copy livos-rollback.sh to a tmp file, sed-rewrite /opt/livos
# to a sandbox, touch .rollback-attempted in the sandbox, run, assert.

set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROLLBACK_SH="$SCRIPT_DIR/../livos-rollback.sh"

if [[ ! -f "$ROLLBACK_SH" ]]; then
    echo "FAIL rollback-loop-guard: livos-rollback.sh not found at $ROLLBACK_SH" >&2
    exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

SANDBOX="$TMPDIR/opt-livos"
mkdir -p "$SANDBOX/data/update-history"
touch "$SANDBOX/.rollback-attempted"
# Also stage a fake .deployed-sha.previous so we KNOW the abort is from the
# loop guard (not from the no-prev-sha guard which would otherwise fire first
# in any other config — but loop guard runs FIRST per the script's order)
echo "abc1234" > "$SANDBOX/.deployed-sha.previous"

PATCHED="$TMPDIR/livos-rollback.sh"
sed "s|/opt/livos|$SANDBOX|g" "$ROLLBACK_SH" > "$PATCHED"
chmod +x "$PATCHED"

STDERR_FILE="$TMPDIR/stderr"
STDOUT_FILE="$TMPDIR/stdout"
EXIT_CODE=0
bash "$PATCHED" > "$STDOUT_FILE" 2> "$STDERR_FILE" || EXIT_CODE=$?

if [[ "$EXIT_CODE" -ne 1 ]]; then
    echo "FAIL rollback-loop-guard: expected exit 1, got $EXIT_CODE" >&2
    echo "stdout was:" >&2
    cat "$STDOUT_FILE" >&2
    echo "stderr was:" >&2
    cat "$STDERR_FILE" >&2
    exit 1
fi

# Assert abort message — the script substitutes $ROLLBACK_LOCK into the message,
# which after sed-rewrite is "$SANDBOX/.rollback-attempted"
if ! grep -qE '\[ROLLBACK-ABORT\].*\.rollback-attempted exists' "$STDOUT_FILE"; then
    if ! grep -rqE '\[ROLLBACK-ABORT\].*\.rollback-attempted exists' "$SANDBOX/data/update-history/" 2>/dev/null; then
        echo "FAIL rollback-loop-guard: missing '[ROLLBACK-ABORT] ... .rollback-attempted exists' message" >&2
        echo "stdout was:" >&2
        cat "$STDOUT_FILE" >&2
        echo "stderr was:" >&2
        cat "$STDERR_FILE" >&2
        exit 1
    fi
fi

# Assert .deployed-sha was NOT created (loop guard fired before any work)
if [[ -f "$SANDBOX/.deployed-sha" ]]; then
    echo "FAIL rollback-loop-guard: .deployed-sha was created (loop guard didn't abort early enough)" >&2
    exit 1
fi

echo "PASS rollback-loop-guard"
exit 0
