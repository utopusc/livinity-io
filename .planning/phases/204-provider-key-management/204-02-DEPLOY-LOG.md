---
phase: 204-provider-key-management
plan: 204-02
deploy_date: 2026-05-24
deployed_sha_pre: bcef01038812cf3d96d98437ff0026d85d8a59fc
deployed_sha_post: TBD-after-update.sh
deploy_method: bash /opt/livos/update.sh (background via nohup + sudo)
---

# Plan 204-02 — Mini PC deploy log

## Pre-deploy state

- Deployed SHA on Mini PC before this deploy: `bcef01038812cf3d96d98437ff0026d85d8a59fc` (Phase 203-13 close)
- 7 systemd units active per Phase 203 verification
- Bootstrap script + sudoers drop-in NOT yet present on Mini PC

## Commits being deployed

| SHA | Description |
|---|---|
| `fc9769cf` | docs(204): scaffold Phase 204 — CONTEXT + 2 plans + ROADMAP heading |
| `0fcf0e2f` | feat(204-01): provider.config.* tRPC + Redis key store + env-file writer + restart hook |
| `7e967740` | docs(204-01): Plan 204-01 SUMMARY — backend complete (18/18 vitest PASS) |
| `5d98e3f2` | feat(204-02): /settings → Providers tab + sudoers drop-in + bootstrap script |

## Deploy steps

### Step 1 — `sudo bash /opt/livos/update.sh` (background)

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68
rm -f /tmp/upd-204.log
nohup sudo bash /opt/livos/update.sh > /tmp/upd-204.log 2>&1 < /dev/null &
```

Result: TBD on completion.

### Step 2 — Bootstrap (sudoers + fallback dir + unit patch)

After update.sh completes, the bootstrap script is rsynced into place. Run it once:

```bash
sudo bash /opt/livos/scripts/install/204-provider-bootstrap.sh
```

Expected output lines (idempotent — safe to re-run):
```
[Phase 204-02] installing sudoers drop-in to /etc/sudoers.d/livos-claw-gateway
[Phase 204-02] sudoers drop-in installed + validated
[Phase 204-02] creating fallback env dir /opt/livos/etc (bruce:bruce 0700)
[Phase 204-02] creating empty fallback env file /opt/livos/etc/liv-claw-gateway.env (bruce:bruce 0600)
[Phase 204-02] patching /etc/systemd/system/liv-claw-gateway.service with EnvironmentFile=-/opt/livos/etc/liv-claw-gateway.env
[Phase 204-02] reloading systemd to pick up unit changes
[Phase 204-02] bootstrap complete.
```

## Smoke battery (6 checks per CONTEXT.md acceptance envelope)

Run after update.sh + bootstrap both complete.

| # | Check | Status | Evidence |
|---|---|---|---|
| 1 | update.sh runs clean + 7 systemd units active | TBD | `systemctl is-active livos liv-core liv-worker liv-memory liv-claw-gateway livos-app-liv-ai caddy` |
| 2 | `/liv-ai-app/settings` Providers tab loads + empty state | DEFERRED-OPERATOR | Browser walk required |
| 3 | Save flow: paste → Save → restarting → healthy within 30s | DEFERRED-OPERATOR | Browser walk required |
| 4 | Refresh: row shows redacted preview only | DEFERRED-OPERATOR | Browser walk required |
| 5 | SSH check: env file contains key + mode 0600 | TBD | `sudo cat /etc/default/liv-claw-gateway && stat -c '%a' /etc/default/liv-claw-gateway` |
| 6 | Negative log: no raw key in livinityd journal | TBD | `sudo journalctl -u livos --since '10 min ago' \| grep -E 'sk-\|xai-\|gsk_'` |

Smoke results 1, 5, 6 can be confirmed by the executor; 2-4 require operator browser walk (CONTEXT.md acceptance envelope explicitly notes ≥ 5/6 PASS = ship gate, so deferring 2-4 to operator UAT is in-spec).
