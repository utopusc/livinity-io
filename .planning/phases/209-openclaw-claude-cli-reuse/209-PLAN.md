# Phase 209 PLAN — openclaw → Claude CLI reuse + Haiku 4.5 default

**Created:** 2026-05-26
**Mode:** Single-plan, Mini PC ops only (no source code changes).
**Estimated effort:** 5 min wall-clock.

## Tasks (executed as one batched SSH session)

### Task 1 — Snapshot rollback artifact
```bash
sudo cp /opt/livos/data/openclaw/openclaw.json /opt/livos/data/openclaw/openclaw.json.bak.20260526
```

### Task 2 — Seed bruce's HOME with the Max OAuth credential
```bash
sudo mkdir -p /home/bruce/.claude
sudo cp /root/.claude/.credentials.json /home/bruce/.claude/.credentials.json
sudo chown -R bruce:bruce /home/bruce/.claude
sudo chmod 700 /home/bruce/.claude
sudo chmod 600 /home/bruce/.claude/.credentials.json
```

### Task 3 — Patch openclaw.json (atomic) — set default model + claude-cli backend hint
Use python to mutate JSON atomically (preserves all unrelated keys, validates round-trip).
```bash
sudo python3 -c '
import json, os, tempfile
p = "/opt/livos/data/openclaw/openclaw.json"
d = json.load(open(p))
d.setdefault("agents", {}).setdefault("defaults", {}).setdefault("model", {})["primary"] = "claude-cli/claude-haiku-4-5"
d["agents"]["defaults"].setdefault("cliBackends", {}).setdefault("claude-cli", {})["command"] = "/usr/bin/claude"
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(p), prefix=".openclaw.", suffix=".json")
with os.fdopen(fd, "w") as f:
    json.dump(d, f, indent=2)
os.replace(tmp, p)
os.chown(p, 1000, 1000)  # bruce
os.chmod(p, 0o644)
print("patched")
'
```

### Task 4 — Restart gateway
```bash
sudo systemctl restart liv-claw-gateway
sleep 3
sudo systemctl status liv-claw-gateway --no-pager | head -10
```

### Task 5 — Verify journalctl shows new model
```bash
sudo journalctl -u liv-claw-gateway --no-pager -n 100 --since "30 seconds ago" | grep -E "agent model|model configured" | tail -5
```
**Expected:** lines containing `claude-cli/claude-haiku-4-5` (NOT `nemotron`).

### Task 6 — Smoke test: live chat round-trip
```bash
# Read the gateway auth token from openclaw.json, send a one-shot chat message,
# confirm an Anthropic-shaped response comes back (not an upstream error).
TOKEN=$(sudo cat /opt/livos/data/openclaw/openclaw.json | python3 -c 'import sys,json; print(json.load(sys.stdin)["gateway"]["auth"]["token"])')
curl -sS -X POST http://127.0.0.1:18789/openclawos/rpc \
  -H "Content-Type: application/json" \
  -H "X-OpenClaw-Auth: $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"agent.ping","params":{}}' | head -c 500
```
(If `agent.ping` is not registered, this falls back to a 404 — we still capture journalctl model line for ground truth.)

### Task 7 — Rollback hook (kept as escape hatch, NOT auto-executed)
```bash
# Only run if Task 5 fails to show claude-cli/claude-haiku-4-5
sudo cp /opt/livos/data/openclaw/openclaw.json.bak.20260526 /opt/livos/data/openclaw/openclaw.json
sudo rm -rf /home/bruce/.claude
sudo systemctl restart liv-claw-gateway
```

## Verification gates

- **G1 (AI-03)** — journalctl line contains `claude-cli/claude-haiku-4-5` post-restart.
- **G2 (INV-209-03)** — `systemctl status liv-claw-gateway` shows `active (running)` after restart.
- **G3 (INV-209-04)** — journalctl contains NO `nemotron` lines newer than the restart timestamp.
- **G4 (INV-209-01)** — `python3 -c 'import json; json.load(open(...))'` validates patched openclaw.json.

## Plan complete when all of G1..G4 pass.

AI-04 (≥80% coord-click success) + AI-05 (≤1.5s p50 latency) + AI-06 (zero quota errors) are **operator-driven UAT** — they require a 30-min live chat session. They are deferred to Phase 217 (E2E UAT). Phase 209 ship-gate is G1-G4 only.
