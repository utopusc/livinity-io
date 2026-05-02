---
phase: 49
plan: 01
status: blocked
date: 2026-05-02
---

# Plan 49-01 — Mini PC Single-Batch Diagnostic SSH

## Outcome

**BLOCKED** — orchestrator IP banned by Mini PC fail2ban from prior diagnostic session.

## Command attempted

```
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o ConnectTimeout=20 -o BatchMode=yes bruce@10.69.31.68 'echo alive'
```

## Result

`ssh: connect to host 10.69.31.68 port 22: Connection timed out`

The diagnostic batch SSH was NOT issued — connectivity probe to Mini PC port 22 timed out (fail2ban DROP). Per D-49-01 (LOCKED), no retries within phase.

`raw-minipc.txt` written with `BAN_OR_AUTH_ERROR:` sentinel + recovery instructions.

## Per D-49-02 fallback

Phase 49 falls back to `.planning/v29.4-REGRESSIONS.md` as primary fixture for Mini PC data points (A1, A2, A4 verdicts cite REGRESSIONS.md instead of fresh capture). This fallback is encoded in CONTEXT.md.

## Files written

- `.planning/phases/49-mini-pc-diagnostic/raw-minipc.txt` — sentinel + recovery instructions

## Recommended next action (user)

Resolve the Mini PC fail2ban ban via one of:
1. Wait for auto-release (default 10 min, but escalates for recurrent offenders — could be 30+ min)
2. SSH from Mini PC console directly (physical/serial) to `sudo fail2ban-client unban <orchestrator-IP>`
3. Use a different egress IP for orchestrator
