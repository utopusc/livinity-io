---
phase: 113
plan: 01
status: complete
completed: 2026-05-13
commits: [52fe695f, 6df3cb8b]
sacred_sha_preserved: true
deviation: "Mechanism revised mid-flight (Rule 1+3): strip --environ flag instead of migrate Environment=. Same objective/scope/locked decisions."
---

# Phase 113-01 SUMMARY

## Outcome

Caddy systemd unit no longer leaks `CLOUDFLARE_API_TOKEN` plaintext to journald. Root cause was Caddy's `--environ` debug flag in the base unit's `ExecStart` — not (as initially assumed) inline `Environment=` declarations. The token storage was already correctly secured via `EnvironmentFile=/etc/livos/secrets/cf-token` (chmod 600 root:root) from an earlier session. Fix: added a second drop-in `strip-environ-flag.conf` that resets `ExecStart=` and re-declares it without `--environ`, then restarted Caddy. Post-restart journal is clean. TLS uninterrupted for `test.livinity.live` + wildcard subdomain.

## Live Evidence

**Before fix** (from 113-01-INVESTIGATION.md):
- 5 plaintext `caddy[PID]: CLOUDFLARE_API_TOKEN=cfut_REDACTED` lines in journalctl since boot
- 2 in last 24h, most recent `May 13 18:24` (proves real, recent leak)

**After fix** (from 113-01-DEPLOY.md):
- `AFTER_COUNT_SINCE_RESTART=0` — no new plaintext token occurrences post-restart
- Resolved `argv[]=/usr/bin/caddy run --config /etc/caddy/Caddyfile` (no `--environ`)
- `curl -sIL https://test.livinity.live` → `HTTP/2 200` (TLS works)
- `curl -sIL -H "Host: n8n.test.livinity.live" https://test.livinity.live` → `HTTP/2 302` (wildcard cert works, Phase 112 routing preserved)
- Cert dir intact: `test.livinity.live` + `wildcard_.test.livinity.live`

## Files (server-side, NOT in this repo)

| File | State | Mode |
|---|---|---|
| `/etc/systemd/system/caddy.service.d/livos-cf-token.conf` | UNCHANGED (already had EnvironmentFile from earlier session) | 600 |
| `/etc/systemd/system/caddy.service.d/strip-environ-flag.conf` | **NEW** (Phase 113 fix) | 644 |
| `/etc/livos/secrets/cf-token` | UNCHANGED, 75 bytes | 600 |
| `/etc/caddy/Caddyfile` | UNCHANGED | 644 |

## Files (this repo)

| File | Change |
|---|---|
| `.planning/phases/113-caddy-cloudflare-api-token-log-leak-remediation/113-CONTEXT.md` | NEW (planning phase) |
| `.planning/phases/113-caddy-cloudflare-api-token-log-leak-remediation/113-01-PLAN.md` | NEW (planning phase) |
| `.planning/phases/113-caddy-cloudflare-api-token-log-leak-remediation/113-01-INVESTIGATION.md` | NEW (Task 1, commit 52fe695f) |
| `.planning/phases/113-caddy-cloudflare-api-token-log-leak-remediation/113-01-DEPLOY.md` | NEW (Task 2, commit 6df3cb8b) |
| `.planning/phases/113-caddy-cloudflare-api-token-log-leak-remediation/113-01-SUMMARY.md` | NEW (this file) |

NO source-tree code changes (D-113-MAINSERVER-ONLY honored).

## Sacred SHA Gate

`liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all Phase 113 commits (verified after Task 1 commit `52fe695f` and Task 2 commit `6df3cb8b`).

## Locked Decisions Honored

- **D-113-NO-CADDY-DOWNTIME:** `systemctl restart caddy` was used (not just reload) because drop-in `ExecStart=` only takes effect on next start. Restart was <500ms; user-facing impact = brief moment of TCP reset for inflight connections. Wildcard cert renewal continues normally. Caddy `is-active: active` confirmed within 3s.
- **D-113-NO-DNS-DROP:** Cloudflare DNS-01 token still loaded via `EnvironmentFile=/etc/livos/secrets/cf-token`. `{env.CLOUDFLARE_API_TOKEN}` in Caddyfile resolves. Wildcard cert renewal works (`curl https://n8n.test.livinity.live` → 302). Cert dir intact (both `test.livinity.live` and `wildcard_.test.livinity.live`).
- **D-113-MAINSERVER-ONLY:** One new drop-in file on mainserver (`strip-environ-flag.conf`). Zero source-tree commits — only `.planning/` documentation.
- **D-113-SACRED-SHA-UNTOUCHED:** Verified post-each-commit. Hash unchanged.

## Deviation Recorded

**Rule 1+3 deviation:** Plan's Task 2 (migrate inline `Environment=` to `EnvironmentFile=`) was moot — migration was already done in an earlier session. Inline `Environment=` was empty when Task 1 probed; `EnvironmentFile=/etc/livos/secrets/cf-token` was already wired via `livos-cf-token.conf` drop-in (dated `May 13 18:20`). Real leak source was Caddy's `--environ` flag in the base unit's `ExecStart` (`argv[]=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile`), which prints `os.Environ()` to stdout on every start/reload — including env vars loaded from `EnvironmentFile=`.

Revised Task 2 (strip `--environ` flag via new drop-in that resets `ExecStart=` and re-declares it without the flag) preserved objective/scope/blast-radius/locked-decisions. Full diagnostic rationale in `113-01-INVESTIGATION.md`. No user input needed per Rule 4 (same target, same risk, correct mechanism — not an architectural change).

## Follow-ups (DEFERRED — out of Phase 113 scope)

- **Journal vacuum:** 5 historic leaked entries remain in journal (pre-fix). Operator can purge with `journalctl --vacuum-time=1s` if desired. Destructive — explicit operator decision, NOT auto-applied. Adversary with prior root-on-mainserver could have read them; rotation (next bullet) is the durable mitigation.
- **CF token rotation:** The token currently in `EnvironmentFile` is the same one that leaked historically. After this fix lands, operator should rotate via Cloudflare dashboard and update `/etc/livos/secrets/cf-token` (chmod 600 preserved). Phase 113 does NOT auto-rotate — token rotation is operator-only because it requires Cloudflare dashboard access.
- **Similar leaks for other secrets:** Other systemd units (livos.service, Redis, PostgreSQL) may have analogous debug flags. Out of scope for Phase 113; recommend a v34.x audit phase if concerned. Quick check: `grep -r "Environment=" /usr/lib/systemd/system/ /etc/systemd/system/` for inline secret-bearing variables, plus `grep -r "\-\-environ\|--debug-env" /usr/lib/systemd/system/` for similar diagnostic flags.
- **Carry to scripts/install/ for fresh installs:** The Caddy install in `scripts/install/deploy-livinityd.sh` (or wherever Caddy is provisioned for fresh VPS) should write this drop-in by default. Optional follow-up to fold into Phase 114 or v34.x polish — currently fresh installs would inherit the `--environ` leak until manually patched.

## Self-Check

- [x] `113-01-INVESTIGATION.md` exists (Task 1, commit `52fe695f`)
- [x] `113-01-DEPLOY.md` exists (Task 2, commit `6df3cb8b`)
- [x] `113-01-SUMMARY.md` exists (this file)
- [x] Commit `52fe695f` present in git log
- [x] Commit `6df3cb8b` present in git log
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved (verified)

## Self-Check: PASSED
