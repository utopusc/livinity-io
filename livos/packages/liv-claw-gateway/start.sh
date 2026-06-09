#!/usr/bin/env bash
# Liv AI Claw Gateway — systemd ExecStart wrapper. Phase 203-03.
#
# Thin shell wrapper around `node start.js`. Exists so the systemd unit can
# stay short (`ExecStart=/usr/bin/env bash .../start.sh`) and so any future
# pre-flight that has to happen in shell (env probing, log redirects, etc.)
# has a place to live.
#
# Production invocation (Mini PC):
#   /opt/livos/packages/liv-claw-gateway/start.sh
#
# Run this manually for local debugging (Windows operators should `node start.js`
# directly — start.sh assumes POSIX shell).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Resolve node — systemd unit may not have the operator's PATH so look in the
# usual places.
NODE_BIN="${NODE_BIN:-}"
if [[ -z "$NODE_BIN" ]]; then
    for candidate in /usr/bin/node /usr/local/bin/node "$(command -v node 2>/dev/null || true)"; do
        if [[ -x "$candidate" ]]; then
            NODE_BIN="$candidate"
            break
        fi
    done
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
    echo "[liv-claw-gateway] FATAL: node executable not found in PATH or standard locations" >&2
    exit 127
fi

# Defaults the systemd unit may override via Environment=
: "${PORT:=18789}"
: "${OPENCLAW_BIND:=loopback}"
: "${OPENCLAW_GATEWAY_AUTH:=token}"

export PORT OPENCLAW_BIND OPENCLAW_GATEWAY_AUTH

exec "$NODE_BIN" "${SCRIPT_DIR}/start.js" "$@"
