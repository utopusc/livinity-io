#!/usr/bin/env bash
# Phase 32 REL-02 unit test: livos-rollback.sh aborts cleanly when
# .deployed-sha.previous is missing.
# Strategy: copy livos-rollback.sh to a tmp file, sed-rewrite /opt/livos
# paths to a sandbox dir, ensure .deployed-sha.previous is absent, run the
# patched copy, assert exit 1 + abort message.

set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROLLBACK_SH="$SCRIPT_DIR/../livos-rollback.sh"

if [[ ! -f "$ROLLBACK_SH" ]]; then
    echo "FAIL rollback-no-prev-sha: livos-rollback.sh not found at $ROLLBACK_SH" >&2
    exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Build the sandboxed /opt/livos
SANDBOX="$TMPDIR/opt-livos"
mkdir -p "$SANDBOX/data/update-history"
# Intentionally do NOT create $SANDBOX/.deployed-sha.previous — that's the test condition
# Intentionally do NOT touch $SANDBOX/.rollback-attempted — must NOT trigger loop guard

# Copy + path-rewrite the rollback script — rewrite BOTH /opt/livos and /opt/nexus
# so any future abort-path tests that reach nexus paths don't touch real host dirs.
PATCHED="$TMPDIR/livos-rollback.sh"
sed -e "s|/opt/livos|$SANDBOX|g" \
    -e "s|/opt/nexus|$SANDBOX/nexus|g" \
    "$ROLLBACK_SH" > "$PATCHED"
chmod +x "$PATCHED"
mkdir -p "$SANDBOX/nexus"

STDERR_FILE="$TMPDIR/stderr"
STDOUT_FILE="$TMPDIR/stdout"
EXIT_CODE=0
bash "$PATCHED" > "$STDOUT_FILE" 2> "$STDERR_FILE" || EXIT_CODE=$?

# Assert exit 1
if [[ "$EXIT_CODE" -ne 1 ]]; then
    echo "FAIL rollback-no-prev-sha: expected exit 1, got $EXIT_CODE" >&2
    echo "stdout was:" >&2
    cat "$STDOUT_FILE" >&2
    echo "stderr was:" >&2
    cat "$STDERR_FILE" >&2
    exit 1
fi

# Assert abort message present (the script tees stdout to a log file via
# `exec > >(tee -a ...)`, so the abort line lands in stdout AND the log file)
COMBINED="$STDOUT_FILE $STDERR_FILE"
if ! grep -qF '[ROLLBACK-ABORT] first deploy ever' $COMBINED; then
    # Also check the log file inside the sandbox in case `exec > >(tee ...)`
    # captured the line there only.
    if ! grep -rqF '[ROLLBACK-ABORT] first deploy ever' "$SANDBOX/data/update-history/" 2>/dev/null; then
        echo "FAIL rollback-no-prev-sha: missing '[ROLLBACK-ABORT] first deploy ever'" >&2
        echo "stdout was:" >&2
        cat "$STDOUT_FILE" >&2
        exit 1
    fi
fi

# Assert .deployed-sha was NOT modified (no sandbox/.deployed-sha created)
if [[ -f "$SANDBOX/.deployed-sha" ]]; then
    echo "FAIL rollback-no-prev-sha: .deployed-sha was created during abort path (should have been untouched)" >&2
    exit 1
fi

echo "PASS rollback-no-prev-sha"
exit 0
