#!/usr/bin/env sh
# D-100-SACRED gate: refuse any commit that mutates
# liv/packages/core/src/sdk-agent-runner.ts away from the locked SHA.
set -e
LOCKED_SHA="f3538e1d811992b782a9bb057d1b7f0a0189f95f"
SACRED_FILE="liv/packages/core/src/sdk-agent-runner.ts"
if [ ! -f "$SACRED_FILE" ]; then
  echo "[sacred-sha] ERROR: $SACRED_FILE not found" >&2
  exit 1
fi
ACTUAL_SHA="$(git hash-object "$SACRED_FILE")"
if [ "$ACTUAL_SHA" != "$LOCKED_SHA" ]; then
  echo "[sacred-sha] ABORT: D-100-SACRED violated." >&2
  echo "[sacred-sha]   expected: $LOCKED_SHA" >&2
  echo "[sacred-sha]   actual:   $ACTUAL_SHA" >&2
  echo "[sacred-sha]   file:     $SACRED_FILE" >&2
  exit 1
fi
exit 0
