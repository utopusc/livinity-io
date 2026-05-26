---
status: passed
phase: 209
verified_at: 2026-05-26T09:23:50Z
verifier: claude-opus-4-7 (autonomous mode)
---

# Phase 209 Verification — openclaw → Claude CLI reuse + Haiku 4.5 default

## Ship-gate result: PASSED (4/4 gates green)

### G1 — Journalctl post-restart shows `claude-cli/claude-haiku-4-5` (AI-03)

**Status:** PASS

Evidence:
```
May 26 02:23:47 bruce-EQ env[2682196]: - claude-cli/claude-haiku-4-5 model configured, enabled automatically.
May 26 02:23:50 bruce-EQ env[2682196]: 2026-05-26T02:23:50.564-07:00 [gateway] agent model: claude-cli/claude-haiku-4-5 (thinking=medium, fast=off)
```

### G2 — `liv-claw-gateway` active (running) after restart (INV-209-03)

**Status:** PASS

Evidence:
```
$ systemctl is-active liv-claw-gateway
active

● liv-claw-gateway.service — Active: active (running) since Tue 2026-05-26 02:23:43 PDT
   Main PID: 2682132 (node)
   Memory: 218.5M
```

### G3 — Zero new `nemotron` lines post-restart (INV-209-04)

**Status:** PASS

Evidence: `journalctl --since "1 minute ago" | grep -i nemotron` returned empty.

### G4 — Patched openclaw.json round-trips as valid JSON (INV-209-01)

**Status:** PASS

Evidence: Python `json.dump` succeeded atomically (`tempfile.mkstemp + os.replace`), runtime read it cleanly on boot (otherwise gateway would have refused to start — it started in 4s).

Final value:
```json
"agents": {
  "defaults": {
    "model": { "primary": "claude-cli/claude-haiku-4-5" },
    "cliBackends": { "claude-cli": { "command": "/usr/bin/claude" } }
  }
}
```

## REQ coverage

| REQ | Status | Evidence |
|-----|--------|----------|
| AI-01 — Liv AI uses `claude-cli/claude-haiku-4-5` (not nemotron) | PASS | G1 + G3 journalctl |
| AI-02 — claude-cli backend reuses `/root/.claude/.credentials.json` (via copy to /home/bruce/.claude/) | PASS | bruce HOME seeded with mode-600 credential copy; gateway runs as bruce |
| AI-03 — Journalctl shows `agent model: claude-cli/claude-haiku-4-5` | PASS | G1 |
| AI-04 — Coord-click success ≥80% | **DEFERRED to P217 UAT** | Requires 30-min live UAT battery |
| AI-05 — Per-call latency p50 ≤1.5s | **DEFERRED to P217 UAT** | Requires 30-min live UAT battery |
| AI-06 — Zero subscription quota errors | **DEFERRED to P217 UAT** | Requires 30-min live UAT battery |

## Notes

- v41-DRAFT.md specified `anthropic/claude-haiku-4-5` model id and `openclaw models auth login --provider anthropic --method cli --set-default` command. Both were **corrected during execution** based on openclaw 2026.5.20 actual surface:
  - Model id is `claude-cli/claude-haiku-4-5` (provider is literally `claude-cli`, sourced from `dist/doctor-claude-cli-UgSJI9UJ.js`).
  - `openclaw capability model auth login` requires interactive TTY → not usable non-interactively. Bypassed via direct credential file seeding + JSON config patch (no interactive login command needed for cli-reuse path).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` untouched (INV-209-02) — Phase 209 makes zero source-code changes.
- Three operator-UAT REQs (AI-04, AI-05, AI-06) are intentionally deferred to Phase 217 E2E UAT (requires live 30-min chat battery — out of executor scope).

## Files changed on Mini PC

- `/opt/livos/data/openclaw/openclaw.json` — primary model + cliBackends patched (with `.bak.20260526` snapshot adjacent).
- `/home/bruce/.claude/.credentials.json` — newly created (copy of `/root/.claude/.credentials.json`, bruce-owned mode 0600).
- `/home/bruce/.claude/` — newly created (bruce-owned mode 0700).

## Files changed in repo

- `.planning/phases/209-openclaw-claude-cli-reuse/209-CONTEXT.md` (new)
- `.planning/phases/209-openclaw-claude-cli-reuse/209-PLAN.md` (new)
- `.planning/phases/209-openclaw-claude-cli-reuse/209-VERIFICATION.md` (new — this file)
- `.planning/phases/209-openclaw-claude-cli-reuse/209-SUMMARY.md` (new)
- `.planning/ROADMAP.md` — Phase 209 status flipped to 🟢 SHIPPED.

## Rollback (kept ready)

```bash
sudo cp /opt/livos/data/openclaw/openclaw.json.bak.20260526 /opt/livos/data/openclaw/openclaw.json
sudo rm -rf /home/bruce/.claude
sudo systemctl restart liv-claw-gateway
```
