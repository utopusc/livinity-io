#!/usr/bin/env bash
#
# GC-F (Phase 253 gap closure) — make LivOS's own MCP servers importable from
# Liv AI's "Tek Tıkla İçe Aktar" (one-click MCP import).
#
# AionUi's import modal lists MCP servers grouped by SOURCE and filters them by
# the selected CLI agent's backend id (e.g. "claude"). LivOS registers its own
# MCP servers (liv-vault, liv-system, liv-docker, liv-apps, luse) with aioncore
# under source "aionui" — which is NOT a selectable CLI-agent backend — so they
# never appeared under any agent and the operator saw only claude.ai's GDrive +
# Gmail. The Claude agent adapter, however, reads the user's ~/.claude.json
# `mcpServers` block and re-exposes those under source "claude". So we copy the
# aioncore "aionui"-source stdio servers into ~/.claude.json `mcpServers`, where
# the Claude agent picks them up and the importer can finally surface them.
#
# Source of truth = aioncore's own agent-configs API (already carries the exact
# command + env, including the per-box LIV_API_KEY / LUSE_REDIS_URL secrets), so
# nothing is hardcoded here. Idempotent: only adds servers not already present.
#
set -euo pipefail

LIV_USER="${LIV_USER:-bruce}"
LIV_HOME="$(getent passwd "$LIV_USER" 2>/dev/null | cut -d: -f6 || true)"
LIV_HOME="${LIV_HOME:-/home/${LIV_USER}}"
CLAUDE_JSON="${LIV_HOME}/.claude.json"
API="${LIV_MCP_API:-http://127.0.0.1:3020/api/mcp/agent-configs}"

log() { printf '[seed-liv-mcp] %s\n' "$*"; }

command -v python3 >/dev/null 2>&1 || { log "python3 not found — skipping"; exit 0; }

# Fetch the agent-configs (retry while liv-assistant finishes booting).
CONFIGS=""
for _i in 1 2 3 4 5; do
  CONFIGS="$(curl -fsS --max-time 5 "$API" 2>/dev/null || true)"
  [ -n "$CONFIGS" ] && break
  sleep 2
done
if [ -z "$CONFIGS" ]; then
  log "agent-configs API unreachable at $API — skipping (non-fatal)"
  exit 0
fi

# Merge the aionui-source stdio servers into ~/.claude.json mcpServers.
# Pure-stdlib python; idempotent; preserves all other claude.json content.
# NB: the python script is delivered via the `<<PY` heredoc (which IS stdin),
# so the API JSON cannot also come through stdin — pass it via a temp file arg.
_SEED_TMP="$(mktemp)"
printf '%s' "$CONFIGS" > "$_SEED_TMP"
trap 'rm -f "$_SEED_TMP"' EXIT
ADDED="$(python3 - "$CLAUDE_JSON" "$_SEED_TMP" <<'PY'
import json, sys, os

claude_path = sys.argv[1]
with open(sys.argv[2], "r", encoding="utf-8") as _f:
    api_raw = _f.read()

try:
    api = json.loads(api_raw)
except Exception as e:
    print("ERR_API_JSON", file=sys.stderr); sys.exit(0)

groups = (api or {}).get("data") or []
liv_servers = {}
for g in groups:
    if g.get("source") != "aionui":
        continue
    for s in g.get("servers") or []:
        t = s.get("transport") or {}
        if t.get("type") != "stdio":
            continue
        name = s.get("name")
        cmd = t.get("command")
        if not name or not cmd:
            continue
        entry = {"command": cmd}
        if t.get("args"):
            entry["args"] = t["args"]
        if t.get("env"):
            entry["env"] = t["env"]
        liv_servers[name] = entry

if not liv_servers:
    print("0"); sys.exit(0)

# Load existing claude.json (tolerate missing/empty).
data = {}
if os.path.exists(claude_path):
    try:
        with open(claude_path, "r", encoding="utf-8") as f:
            data = json.load(f) or {}
    except Exception:
        data = {}

mcp = data.get("mcpServers")
if not isinstance(mcp, dict):
    mcp = {}

added = 0
for name, entry in liv_servers.items():
    if name not in mcp:
        mcp[name] = entry
        added += 1

if added:
    data["mcpServers"] = mcp
    tmp = claude_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, claude_path)

print(str(added))
PY
)" || { log "merge step failed — skipping (non-fatal)"; exit 0; }

# Keep the file owned by the LivOS user (root writes it during update.sh).
if id "$LIV_USER" >/dev/null 2>&1 && [ -f "$CLAUDE_JSON" ]; then
  chown "$LIV_USER:$LIV_USER" "$CLAUDE_JSON" 2>/dev/null || true
fi

log "registered $ADDED LivOS MCP server(s) into ${CLAUDE_JSON} mcpServers (GC-F)"
