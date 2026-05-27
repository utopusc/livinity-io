# Liv AI — Install Runbook

> **What this is:** Liv AI is the v42 in-LivOS AI chat surface. It is the
> upstream [iOfficeAI/AionUi](https://github.com/iOfficeAI/AionUi) WebUI binary
> (vendored upstream AionUi v2.1.4), **vendored unmodified** (no source fork),
> wrapped in a systemd unit and an idempotent install script. Brand overlay
> (Livinity Design) ships separately via Caddy `sub` in Phase 232. The
> install script also applies an idempotent post-extract brand rebrand pass
> (Phase 234-03) that rewrites `AionUi` → `Liv AI` inside the extracted SPA
> bundle's HTML/JS/CSS files; LICENSE and NOTICE are preserved per
> Apache-2.0 attribution (D-V42-APACHE-NOTICE). See "Phase 234 — Brand
> rebrand" section below.

## Upstream provenance

| Field | Value |
|---|---|
| Upstream repo | https://github.com/iOfficeAI/AionUi |
| Release | v2.1.4 |
| Tarball | `aionui-web-2.1.4-linux-x86_64.tar.gz` |
| Download URL | https://github.com/iOfficeAI/AionUi/releases/download/v2.1.4/aionui-web-2.1.4-linux-x86_64.tar.gz |
| SHA256 (pinned) | `0bb02d0028d932c2e65e676c63074bcee2079508aa954e088c16ece92ba36778` |
| License | Apache-2.0 (preserved at `/opt/liv-assistant/LICENSE`) |
| Spike verdict | `.planning/phases/222-aionui-spike/222-SPIKE.md` — PROCEED |

## File layout (Mini PC)

```
/opt/liv-assistant/
├── cache/aionui-web-2.1.4-linux-x86_64.tar.gz   # SHA-verified download cache
├── aionui-web-2.1.4/aionui-web/                 # extracted upstream tree (root:root, read-only)
│   ├── aionui-web                               # 94 MB Bun-compiled CLI binary
│   ├── bundled-aioncore/linux-x64/aioncore      # backend daemon
│   └── static/                                  # renderer assets
├── current -> aionui-web-2.1.4/aionui-web/      # stable symlink (atomic upgrades)
├── data/                                        # bruce:bruce, SQLite + logs
├── LICENSE                                      # Apache-2.0
├── NOTICE                                       # upstream NOTICE if present
└── UPSTREAM.md                                  # provenance file written by installer
```

Credentials:

```
/etc/livos/liv-assistant-credentials             # mode 0600, owner bruce:bruce
  username=admin
  password=<captured from first-boot journald>
```

Runtime context:

| Item | Value |
|---|---|
| systemd unit | `liv-assistant.service` |
| Run-as user | `bruce` |
| HTTP port | `3020` (loopback + LAN; Caddy adds public routing in Phase 226) |
| Data dir | `/opt/liv-assistant/data` |
| Bun (required by Claude Code agent) | `/home/bruce/.bun/bin/bun` |
| Logs | journald, `journalctl -u liv-assistant -f` |

## Install (fresh Mini PC)

```bash
# From a clone of utopusc/livinity-io on the Mini PC, OR via rsync from this repo:
sudo bash scripts/install-liv-assistant.sh
sudo install -m 0644 systemd/liv-assistant.service /etc/systemd/system/liv-assistant.service
sudo systemctl daemon-reload
sudo systemctl enable --now liv-assistant

# Wait ~5s for first boot, then capture the auto-generated admin password:
for i in 1 2 3 4 5; do
  sudo bash scripts/capture-liv-assistant-password.sh
  if sudo grep -qE '^password=.+' /etc/livos/liv-assistant-credentials 2>/dev/null; then
    break
  fi
  sleep 2
done

# Verify:
systemctl is-active liv-assistant     # expect: active
curl -sSI http://127.0.0.1:3020/      # expect: HTTP/1.1 200 OK, no X-Frame-Options
sudo cat /etc/livos/liv-assistant-credentials   # expect: username=admin, password=<...>
```

## Re-install / idempotency

`scripts/install-liv-assistant.sh` is idempotent. Re-running it:

- Skips the download if `cache/<tarball>` already matches the pinned SHA256
- Skips extraction if `/opt/liv-assistant/aionui-web-2.1.4/aionui-web/aionui-web` already exists
- Re-points the `current` symlink (cheap, atomic)
- Skips bun install if `/home/bruce/.bun/bin/bun` exists or `bun` is on PATH
- Rewrites `UPSTREAM.md` with the current timestamp
- Skips the Phase 234-03 brand-rebrand sed pass if zero `AionUi`/`aionui`
  matches remain in `${CURRENT_LINK}/static/` HTML/JS/CSS (no-op on
  second-and-later runs against the same pinned tarball)

Running it twice in a row produces no other changes on disk.

## Phase 234 — Brand rebrand (AionUi → Liv AI)

The install script applies an idempotent sed-replace pass over HTML/JS/CSS
files in `${CURRENT_LINK}/static/` (resolved real-path
`/opt/liv-assistant/aionui-web-2.1.4/aionui-web/static/`) to rewrite
`AionUi` → `Liv AI`, `aionui-web` → `liv-ai-web`, and `aionui` → `liv-ai`
for user-visible strings in the React SPA bundle. The compound rewrite
ordering (long-match-first) is essential to avoid double-substitution.

**Excluded from the rebrand pass** (D-V42-APACHE-NOTICE + runtime safety):

- `/opt/liv-assistant/LICENSE` — Apache-2.0 license text, attribution required
- `/opt/liv-assistant/NOTICE` — upstream NOTICE, attribution required
- `/opt/liv-assistant/UPSTREAM.md` — our provenance doc, intentionally names AionUi
- `${CURRENT_LINK}/package.json` — `"name": "aionui-web"` required by Bun's package resolution
- `${CURRENT_LINK}/aionui-web` — 94 MB Bun-compiled CLI binary (corruption if sed-edited)
- `${CURRENT_LINK}/bundled-aioncore/linux-x64/aioncore` — native Rust binary (corruption if sed-edited)

These exclusions are enforced **structurally** by scoping the `find` target
to `static/` only — none of the protected paths live under that subtree.

**Idempotency**: a `grep -ril` pre-check counts remaining `AionUi`/`aionui`
matches; if zero, the sed pass is skipped entirely and logged as
`Rebrand: AionUi/aionui strings already replaced (or absent); skipping sed pass`.

**Defensive post-check**: after the sed pass (or skip), the script greps
`LICENSE` and `NOTICE` for the literal `AionUi` token and logs
`OK: ... still contains AionUi attribution (Apache-2.0 preserved)` if
present. A future code change that broadens the `find` target to include
`LICENSE`/`NOTICE` would silently break Apache-2.0 attribution; this log
line is the canary.

**Verification after deploy** (`bash /opt/livos/update.sh`):

```bash
# Inside Mini PC (sudo required to read /opt/liv-assistant/):
sudo grep -ril 'AionUi\|aionui' /opt/liv-assistant/current/static/ \
  --include='*.html' --include='*.js' --include='*.css' | wc -l
# expect: 0

sudo grep -c AionUi /opt/liv-assistant/LICENSE /opt/liv-assistant/NOTICE
# expect: ≥ 1 on each (attribution preserved)

# External relay path (any host with internet):
curl -sS https://bruce.livinity.io/liv/ | grep -c 'Liv AI'   # expect ≥ 1
curl -sS https://bruce.livinity.io/liv/ | grep -c 'AionUi'   # expect 0
```

**Provenance preserved**: this docs file and `UPSTREAM.md` deliberately
continue to name the upstream project as **AionUi** — they document
**what was vendored**, not what the operator sees. The user-visible brand
on the running SPA is **Liv AI**.

## Upgrade (future versions)

1. Update the four pinned constants at the top of `scripts/install-liv-assistant.sh`:
   `AIONUI_VERSION`, `AIONUI_TARBALL`, `AIONUI_URL`, `EXPECTED_SHA256`.
2. Re-run `sudo bash scripts/install-liv-assistant.sh` — it extracts to a new versioned
   dir and atomically re-points `current`.
3. `sudo systemctl restart liv-assistant`.
4. If the upgrade misbehaves, roll back: `sudo ln -sfn /opt/liv-assistant/aionui-web-<old>/aionui-web /opt/liv-assistant/current && sudo systemctl restart liv-assistant`.

## Password rotation

To regenerate the admin password (e.g. after suspected leak):

```bash
sudo systemctl stop liv-assistant
sudo -u bruce env PATH=/home/bruce/.bun/bin:$PATH /opt/liv-assistant/current/aionui-web resetpass --data-dir /opt/liv-assistant/data
# Note the new password printed to stdout, then:
sudo systemctl start liv-assistant
# (The capture-liv-assistant-password.sh script targets the FIRST-boot password line in
# journald and is intentionally no-op after first capture. For rotation, the LivOS UI
# in Phase 227+ will surface a "rotate password" action that updates the credentials
# file directly.)
```

## Claude subscription credentials (Phase 228)

Liv Assistant ships AionUi's built-in Claude Code agent. That agent uses the
host's `claude` CLI to talk to Anthropic, which reads its session token from
`$HOME/.claude/.credentials.json`. The systemd unit sets `HOME=/home/bruce`
explicitly so the agent (running as `bruce`) finds the file at the expected
path.

| Field | Value |
|---|---|
| Credentials file | `/home/bruce/.claude/.credentials.json` |
| Owner / mode | `bruce:bruce 0600` |
| Written by | Phase 221 LivOS Settings → Claude Auth (OAuth code exchange), or interactive `claude` CLI login |
| Read by | AionUi's vendored Claude Code agent on agent spawn (per-chat-turn) |
| systemd grant | `liv-assistant.service` `ReadWritePaths=/home/bruce/.claude` (Phase 223-02) |
| Required env | `liv-assistant.service` `Environment="HOME=/home/bruce"` (Phase 223-02) |

### Verify creds are usable by the service

```bash
sudo -u bruce test -r /home/bruce/.claude/.credentials.json && echo OK
# expect: OK
ls -la /home/bruce/.claude/.credentials.json
# expect: -rw------- 1 bruce bruce ... .credentials.json
systemctl show liv-assistant -p Environment | grep -o 'HOME=/home/bruce'
# expect: HOME=/home/bruce
```

If any line fails, the agent will show `available: false` in `/api/agents`
(see Troubleshooting row "Claude Code agent shows `available: false`" below).

### Recovery — credentials missing or expired

1. **Preferred — LivOS Settings (Phase 221 UI):** Open
   `https://bruce.livinity.io` → Settings → Claude Auth → "Sign in to Claude".
   Walk the OAuth device-code prompt. Phase 221's `submitLoginCode(code)` writes
   `/home/bruce/.claude/.credentials.json` with the correct ownership + mode.
2. **CLI fallback:** SSH to the Mini PC as `bruce` (or `sudo -u bruce`) and run
   `HOME=/home/bruce claude` — the binary's interactive login flow writes the
   credentials file directly. Then `sudo systemctl restart liv-assistant` to
   re-pick up the file.
3. **Post-recovery smoke:** Re-run the three verify commands in the table above.

### Why this is split out from the install runbook

Install (Phase 223) only stands up AionUi's process; the Claude credentials are
a separate concern that depends on the operator having a Claude subscription
linked via Phase 221. Phase 228 is the audit + docs that wire these together
so a future operator onboarding from a fresh Mini PC knows the exact file path
and recovery flow without spelunking the systemd unit.

## Locked invariants (don't break these)

- **D-V42-SACRED:** `liv/packages/core/src/sdk-agent-runner.ts` blob SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` is NEVER modified. Pre-commit hook enforces.
- **D-V42-APACHE-NOTICE:** `/opt/liv-assistant/LICENSE` (Apache-2.0) must accompany the binary. Installer enforces.
- **D-V42-NO-PHONE-HOME:** AionUi was audited for telemetry in Phase 222. If a future upgrade adds telemetry, audit before bumping `AIONUI_VERSION`.
- **D-V42-NO-DATA-LOSS:** The installer never touches `/opt/livos/data/`, `~bruce/livinity/`, or Redis. Liv Assistant state lives exclusively under `/opt/liv-assistant/data/`.

## Known limitations (v42, see PROJECT.md)

- Single-tenant — one admin per install (matches Mini PC single-user posture).
- Random admin password on first boot — captured by `capture-liv-assistant-password.sh`.
- Requires `bun` on PATH for the Claude Code ACP bridge — installed automatically.
- Initial Claude Code agent spawn downloads `@agentclientprotocol/claude-agent-acp` from npm (~10s cold start). Not air-gap-friendly.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `systemctl status liv-assistant` shows `code=127` | `bun` not on PATH | Verify `Environment="PATH=..."` line in unit; reinstall bun: `sudo -u bruce bash -c 'curl -fsSL https://bun.sh/install | bash'` |
| Port 3020 in use | Another service collided | `sudo ss -tlnp \| grep ':3020 '` to identify; either stop the other service or change the unit's `--port` AND port in Phase 226 Caddy config |
| `capture-liv-assistant-password.sh` logs "not yet in journald" | Service still booting | Wait 5s, retry. If persistent, check `journalctl -u liv-assistant -n 50` for crash |
| `curl http://127.0.0.1:3020/` returns connection refused | Service not running OR bound to wrong interface | `systemctl is-active liv-assistant`; check unit's ExecStart `--port` value |
| Claude Code agent shows `available: false` in `/api/agents` | `bun` missing OR `claude` CLI missing OR `~/.claude/.credentials.json` missing | Verify all three: `which bun`, `which claude`, `ls -la /home/bruce/.claude/.credentials.json` |

## Related phases

- **222** (spike): `.planning/phases/222-aionui-spike/222-SPIKE.md` — feasibility verdict.
- **226** (Caddy): adds `bruce.livinity.io/liv` reverse proxy → port 3020.
- **227** (UI): replaces `OpenClawWindow` with `LivAssistantWindow` (iframe).
- **228** (auth bridge): wires Phase 221 Claude OAuth → Liv Assistant credentials surface.
- **231** (cleanup): retires `liv-claw-gateway.service` after UAT green.
- **232** (brand overlay): Caddy `sub` injects Livinity Design CSS — no source patch.
