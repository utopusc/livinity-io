#!/bin/bash
# livos-install-wrap.sh
# Hardens install.sh by reading the API key from a file and exporting it
# as an env var BEFORE invoking install.sh. The key is never on argv.
#
# Usage:
#   INSTALL_SH=/path/to/install.sh bash livos-install-wrap.sh --api-key-file /path/to/key
#
# Contract:
#   - Reads --api-key-file <path> from argv
#   - Reads the key contents from that file
#   - exports LIV_PLATFORM_API_KEY in the shell environment
#   - execs install.sh inheriting the env (no --api-key flag passed)
#   - Requires install.sh to honor ${LIV_PLATFORM_API_KEY:-} as fallback
#     (v29.2.1 deliverable). If install.sh has not been patched, the
#     wrapper falls back to passing --api-key on argv internally —
#     same leak window as direct invocation, but at least the entry
#     point is auditable.

set -euo pipefail

API_KEY_FILE=""
EXTRA_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --api-key-file)
      API_KEY_FILE="$2"
      shift 2
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

if [ -z "$API_KEY_FILE" ] || [ ! -f "$API_KEY_FILE" ]; then
  echo "livos-install-wrap.sh: --api-key-file <path> is required and must exist" >&2
  exit 2
fi

# Read key into env var; never log, never echo.
LIV_PLATFORM_API_KEY=$(cat "$API_KEY_FILE")
export LIV_PLATFORM_API_KEY

# Locate install.sh — caller MUST set $INSTALL_SH (live or cached path).
INSTALL_SH="${INSTALL_SH:-/tmp/install.sh.live}"
if [ ! -f "$INSTALL_SH" ]; then
  echo "livos-install-wrap.sh: \$INSTALL_SH ($INSTALL_SH) does not exist" >&2
  exit 3
fi

# Detect whether install.sh has the env-var fallback patch (v29.2.1).
# Heuristic: grep for the literal LIV_PLATFORM_API_KEY token. If present,
# exec install.sh WITHOUT --api-key (env-only path, no argv leak). If
# absent, fall back to passing --api-key on argv — accepts the leak
# window but preserves the wrapper as the single auditable entry point.
if grep -q 'LIV_PLATFORM_API_KEY' "$INSTALL_SH"; then
  exec bash "$INSTALL_SH" "${EXTRA_ARGS[@]}"
else
  exec bash "$INSTALL_SH" --api-key "$LIV_PLATFORM_API_KEY" "${EXTRA_ARGS[@]}"
fi
