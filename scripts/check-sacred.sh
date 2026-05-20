#!/usr/bin/env sh
# D-100-SACRED gate (Phase 173-03 rewrite):
# Read scripts/sacred-shas-v38.json and verify every (path, expected_sha)
# pair via git hash-object. Replaces the original hardcoded single-file
# check while preserving the exit-code contract for .husky/pre-commit.
#
# Exit codes:
#   0  — PASS, all sacred files unchanged
#   1  — FAIL, at least one sacred SHA mismatch OR missing file
#   2  — Setup error (registry missing, jq unavailable for fallback, etc)

set -e

REGISTRY="scripts/sacred-shas-v38.json"

if [ ! -f "$REGISTRY" ]; then
    echo "[sacred-sha] ERROR: registry not found: $REGISTRY" >&2
    exit 2
fi

# Use node (always present in this repo via package.json engines) to extract
# (path TAB expected_sha TAB frozen_in_phase) lines from the JSON registry.
# This keeps the hook portable across Linux / macOS / Windows-git-bash without
# requiring jq.
LINES=$(node -e '
const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
if (!Array.isArray(r)) { console.error("registry is not an array"); process.exit(2); }
for (const e of r) {
    if (!e.path || !e.expected_sha || !e.frozen_in_phase) {
        console.error("[sacred-sha] bad entry: " + JSON.stringify(e));
        process.exit(2);
    }
    process.stdout.write(e.path + "\t" + e.expected_sha + "\t" + e.frozen_in_phase + "\n");
}
' "$REGISTRY") || {
    echo "[sacred-sha] ERROR: failed to parse $REGISTRY" >&2
    exit 2
}

FAIL_COUNT=0
TOTAL=0

# IFS="\n" to handle paths safely; we control the JSON so no spaces in paths.
OLDIFS=$IFS
IFS='
'
for LINE in $LINES; do
    TOTAL=$((TOTAL + 1))
    FILE=$(printf '%s' "$LINE" | cut -f1)
    EXPECTED=$(printf '%s' "$LINE" | cut -f2)
    FROZEN=$(printf '%s' "$LINE" | cut -f3)

    if [ ! -f "$FILE" ]; then
        echo "[sacred-sha] ERROR: file not found: $FILE (frozen_in_phase=$FROZEN)" >&2
        FAIL_COUNT=$((FAIL_COUNT + 1))
        continue
    fi

    ACTUAL=$(git hash-object "$FILE")
    if [ "$ACTUAL" != "$EXPECTED" ]; then
        echo "[sacred-sha] ABORT: D-100-SACRED violated." >&2
        echo "[sacred-sha]   file:           $FILE" >&2
        echo "[sacred-sha]   expected SHA:   $EXPECTED" >&2
        echo "[sacred-sha]   actual SHA:     $ACTUAL" >&2
        echo "[sacred-sha]   frozen_in_phase: $FROZEN" >&2
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done
IFS=$OLDIFS

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo "[sacred-sha] FAIL: $FAIL_COUNT of $TOTAL sacred files violated." >&2
    exit 1
fi

echo "[sacred-sha] PASS: $TOTAL files verified"
exit 0
