---
status: partial
phase: 233-v42-e2e-uat
source: [233-DEPLOY-LOG.md]
started: 2026-05-27T15:03:21Z
updated: 2026-05-27T15:03:21Z
---

## Current Test

[auto-approved per workflow._auto_chain_active=true; operator may walk these 3 items at any time without blocking Phase 231 gate]

## Tests

### 1. SC-08.a visual -- Open Liv Assistant from dock + first chat turn end-to-end
expected: From `https://bruce.livinity.io/`, click the Liv Assistant dock tile. A LivOS window opens with the AionUi UI iframe-loaded from `/liv/`. Log in with credentials from `/etc/livos/liv-assistant-credentials` (run `sudo cat /etc/livos/liv-assistant-credentials` on Mini PC; username `admin`, password captured by Phase 223-03 helper). Select the Claude Code agent. Send a single chat turn (e.g. "hello"). Confirm a non-empty assistant response appears within ~30s.
result: [pending]

### 2. SC-08.b visual -- Model picker (Sonnet <-> Opus <-> Haiku)
expected: In the same Liv Assistant session, locate the model picker control in the AionUi UI. Switch between Sonnet, Opus, and Haiku. Confirm the picker updates without console errors. UI-only check; no need to send a turn per model.
result: [pending]

### 3. SC-08.c visual -- Dock tile visibility
expected: Visit `https://bruce.livinity.io/`. Confirm the bottom dock contains a "Liv Assistant" tile (selector `[data-test-dock-item="liv-assistant"]`, gated by Phase 224 Redis flag `liv:config:liv_v42_migration_active=true` default-ON). Hover state + click target work as expected.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

(none recorded yet -- all 3 items pending operator walk; non-blocking for Phase 231 gate per chain protocol)

## Operator notes

- All curl-verifiable SCs (SC-01..SC-07) GREEN per `233-DEPLOY-LOG.md` verdict table.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` byte-identical on Mini PC vs repo (Mini PC sha256 `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`).
- The 3 deferred items are UI-only confirmations of paths already functionally proven via SC-01 (Liv reachable + iframe-friendly), SC-02 (auth + Claude agent available via /api/agents `id=2d23ff1c available=True`), SC-03 (WS upgrade 101 on `/liv/ws`).
- Phase 231 (POINT OF NO RETURN -- OpenClawOS retirement) is gated on Phase 233's GREEN verdict (Claude-walked subset). SC-08 is partial-by-design and does NOT block 231 per the auto-chain protocol.
- Rollback if operator UAT surfaces a regression: Phase 230-02 `/opt/livos/backups/pre-v42-cutover-2026-05-27.tgz` tarball (sha256 `ad532b80c5a1f8c43a307056b412a6b83c5d343edbf350000c707e023cd2f1d8`, 3.8 GB) + Restore procedure in 230-02-DEPLOY-LOG.md.
