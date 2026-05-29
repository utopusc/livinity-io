---
status: partial
phase: 252-fresh-install-portability-remediation
source: [252-VERIFICATION.md]
started: 2026-05-29
updated: 2026-05-29
---

## Current Test

[awaiting human testing]

## Tests

### 1. Fresh-install smoke test on a clean VPS
expected: Running `curl -fsSL https://livinity.io/install.sh | sudo bash -s <liv_k_key>` on a clean Ubuntu 24.04 server brings up the full stack with NO manual steps: apt packages (`xserver-xephyr`, `xterm`, `gnome-terminal`, `x11-utils`, `xclip`, `wmctrl`) installed; `livos:v43:terminal_panel` seeded; `liv:mcp:config` populated as a HASH with a REAL `DISPLAY` value (`:1`, NOT the literal `__LIVOS_DISPLAY__`); the UI terminal opens without a password prompt; no `REDIS_URL`/auth errors in the `liv-assistant` journal; Liv AI gets the luse computer-use MCP.
result: [pending]

### 2. XDG_RUNTIME_DIR marker path after update.sh (Mini PC)
expected: After the next `update.sh` on the Mini PC, with a WebApp window active, the active-webapp-wid marker lives under `$XDG_RUNTIME_DIR/livos/` (e.g. `/run/user/<uid>/livos/`) — NOT under world-shared `/tmp/`. The luse temp workspace allowlist resolves under `$XDG_RUNTIME_DIR/luse-`.

result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
