#!/usr/bin/env bash
# Phase 32 REL-01 unit test: precheck() must fail when /opt/livos is not writable.
# Strategy: PATH-inject a df stub that reports plenty of space (so guard 1 passes),
# then PATH-inject an mktemp stub that always fails with exit 1 (simulating EROFS
# or chmod 555 on /opt/livos — we cannot actually chmod /opt/livos in CI).

set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BLOCK_FILE="$SCRIPT_DIR/../precheck-block.sh"

if [[ ! -f "$BLOCK_FILE" ]]; then
    echo "FAIL precheck-write: precheck-block.sh not found" >&2
    exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Stub df: report 50G available so guard 1 passes
cat > "$TMPDIR/df" <<'STUB'
#!/usr/bin/env bash
echo "Filesystem     1G-blocks  Used Available Capacity Mounted on"
echo "/dev/fake         100G    50G       50G      50% /"
STUB
chmod +x "$TMPDIR/df"

# Stub mktemp: when called with -p /opt/livos, exit 1 (simulate not writable).
# When called with other args, delegate to real mktemp (the trap above needs it).
REAL_MKTEMP=$(command -v mktemp)
cat > "$TMPDIR/mktemp" <<STUB
#!/usr/bin/env bash
# If first arg is -p /opt/livos, fail
if [[ "\$1" == "-p" ]] && [[ "\$2" == "/opt/livos" ]]; then
    exit 1
fi
exec "$REAL_MKTEMP" "\$@"
STUB
chmod +x "$TMPDIR/mktemp"

STDERR_FILE="$TMPDIR/stderr"
EXIT_CODE=0
PATH="$TMPDIR:$PATH" bash -c "source '$BLOCK_FILE'; precheck" 2> "$STDERR_FILE" || EXIT_CODE=$?

if [[ "$EXIT_CODE" -ne 1 ]]; then
    echo "FAIL precheck-write: expected exit 1, got $EXIT_CODE" >&2
    cat "$STDERR_FILE" >&2
    exit 1
fi

if ! grep -qF 'PRECHECK-FAIL: /opt/livos is not writable' "$STDERR_FILE"; then
    echo "FAIL precheck-write: stderr missing 'PRECHECK-FAIL: /opt/livos is not writable'" >&2
    cat "$STDERR_FILE" >&2
    exit 1
fi

echo "PASS precheck-write"
exit 0
