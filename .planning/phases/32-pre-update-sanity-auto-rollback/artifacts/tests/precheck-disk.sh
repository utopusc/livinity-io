#!/usr/bin/env bash
# Phase 32 REL-01 unit test: precheck() must fail on < 2GB free disk.
# Strategy: PATH-inject a `df` stub that reports 1G available, source
# precheck-block.sh, invoke precheck() in a subshell, assert the exit code
# and stderr message.

set -uo pipefail  # NOT -e — we WANT to capture precheck's exit 1

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BLOCK_FILE="$SCRIPT_DIR/../precheck-block.sh"

if [[ ! -f "$BLOCK_FILE" ]]; then
    echo "FAIL precheck-disk: precheck-block.sh not found at $BLOCK_FILE" >&2
    exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Stub df: ignore arguments, print Available column = 1G
cat > "$TMPDIR/df" <<'STUB'
#!/usr/bin/env bash
# Mimic df -BG -P /opt/livos output:
#   Filesystem     1G-blocks  Used Available Capacity Mounted on
#   /dev/fake          50G    49G        1G      99% /
echo "Filesystem     1G-blocks  Used Available Capacity Mounted on"
echo "/dev/fake          50G    49G        1G      99% /"
STUB
chmod +x "$TMPDIR/df"

# Stub mktemp/curl so guards 2+3 don't fire — they shouldn't even run because
# guard 1 fails first
cat > "$TMPDIR/mktemp" <<'STUB'
#!/usr/bin/env bash
exec /usr/bin/mktemp "$@"
STUB
chmod +x "$TMPDIR/mktemp"

# Run precheck with stub PATH and capture
STDERR_FILE="$TMPDIR/stderr"
EXIT_CODE=0
PATH="$TMPDIR:$PATH" bash -c "source '$BLOCK_FILE'; precheck" 2> "$STDERR_FILE" || EXIT_CODE=$?

# Assert exit code 1
if [[ "$EXIT_CODE" -ne 1 ]]; then
    echo "FAIL precheck-disk: expected exit 1, got $EXIT_CODE" >&2
    echo "stderr was:" >&2
    cat "$STDERR_FILE" >&2
    exit 1
fi

# Assert stderr contains the expected PRECHECK-FAIL message
if ! grep -qF 'PRECHECK-FAIL: insufficient disk space' "$STDERR_FILE"; then
    echo "FAIL precheck-disk: stderr missing 'PRECHECK-FAIL: insufficient disk space'" >&2
    echo "stderr was:" >&2
    cat "$STDERR_FILE" >&2
    exit 1
fi

echo "PASS precheck-disk"
exit 0
