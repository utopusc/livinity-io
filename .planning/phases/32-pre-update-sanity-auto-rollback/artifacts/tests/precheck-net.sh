#!/usr/bin/env bash
# Phase 32 REL-01 unit test: precheck() must fail when GitHub is unreachable.
# Strategy: PATH-inject df + mktemp stubs so guards 1+2 pass, then PATH-inject
# a curl stub that exits 7 (CURLE_COULDNT_CONNECT — network unreachable).

set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BLOCK_FILE="$SCRIPT_DIR/../precheck-block.sh"

if [[ ! -f "$BLOCK_FILE" ]]; then
    echo "FAIL precheck-net: precheck-block.sh not found" >&2
    exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Stub df: 50G free
cat > "$TMPDIR/df" <<'STUB'
#!/usr/bin/env bash
echo "Filesystem     1G-blocks  Used Available Capacity Mounted on"
echo "/dev/fake         100G    50G       50G      50% /"
STUB
chmod +x "$TMPDIR/df"

# Stub mktemp: when called with -p /opt/livos, redirect the temp file into our
# test TMPDIR (so guard 2 "writable" check passes regardless of whether
# /opt/livos exists on the test host — Windows/CI/sandbox cases). Other args
# delegate to real mktemp so the test's own `mktemp -d` etc. still work.
REAL_MKTEMP=$(command -v mktemp)
cat > "$TMPDIR/mktemp" <<STUB
#!/usr/bin/env bash
# If first arg is -p /opt/livos, swap target to our TMPDIR so the call succeeds
# without needing a real /opt/livos on the test host.
if [[ "\$1" == "-p" ]] && [[ "\$2" == "/opt/livos" ]]; then
    shift 2
    exec "$REAL_MKTEMP" -p "$TMPDIR" "\$@"
fi
exec "$REAL_MKTEMP" "\$@"
STUB
chmod +x "$TMPDIR/mktemp"

# Stub curl: always exit 7 (network unreachable)
cat > "$TMPDIR/curl" <<'STUB'
#!/usr/bin/env bash
exit 7
STUB
chmod +x "$TMPDIR/curl"

STDERR_FILE="$TMPDIR/stderr"
EXIT_CODE=0
PATH="$TMPDIR:$PATH" bash -c "source '$BLOCK_FILE'; precheck" 2> "$STDERR_FILE" || EXIT_CODE=$?

if [[ "$EXIT_CODE" -ne 1 ]]; then
    echo "FAIL precheck-net: expected exit 1, got $EXIT_CODE" >&2
    cat "$STDERR_FILE" >&2
    exit 1
fi

if ! grep -qF 'PRECHECK-FAIL: GitHub api.github.com unreachable' "$STDERR_FILE"; then
    echo "FAIL precheck-net: stderr missing 'PRECHECK-FAIL: GitHub api.github.com unreachable'" >&2
    cat "$STDERR_FILE" >&2
    exit 1
fi

if ! grep -qF 'curl exit 7' "$STDERR_FILE"; then
    echo "FAIL precheck-net: stderr missing curl exit code 'curl exit 7'" >&2
    cat "$STDERR_FILE" >&2
    exit 1
fi

echo "PASS precheck-net"
exit 0
