---
phase: 228-claude-auth-bridge
plan: 01
subsystem: docs + systemd-audit
tags: [v42, liv-assistant, claude-auth, docs, audit, repo-only]
requires:
  - Phase 223-02 (systemd unit shipped with HOME=/home/bruce + ReadWritePaths=/home/bruce/.claude)
  - Phase 223-04 (docs/liv-assistant-install.md scaffold)
  - Phase 221 (LivOS Settings → Claude Auth OAuth login flow that writes /home/bruce/.claude/.credentials.json)
provides:
  - docs/liv-assistant-install.md "Claude subscription credentials (Phase 228)" section
  - audit verdict — Environment="HOME=/home/bruce" confirmed present on line 14 of systemd/liv-assistant.service
affects: []
tech-stack:
  added: []
  patterns: [docs-append-before-anchor, audit-no-op-happy-path]
key-files:
  created: []
  modified:
    - docs/liv-assistant-install.md (+51 lines)
decisions:
  - "Happy path — systemd unit already has HOME=/home/bruce (Phase 223-02 lineage); no diff to the unit file"
  - "Docs section inserted BEFORE ## Locked invariants to preserve operator-reading order (install → re-install → upgrade → password → credentials → invariants → limits → troubleshooting)"
  - "Smoke commands in the docs match Plan 228-02 SC-01/SC-02 literals byte-for-byte for runbook ↔ deploy parity"
metrics:
  duration: ~6m
  completed: 2026-05-27
---

# Phase 228 Plan 01: Audit liv-assistant systemd unit + document Claude creds path Summary

Pure repo edit — audit confirmed `Environment="HOME=/home/bruce"` already present in `systemd/liv-assistant.service` line 14 (Phase 223-02 lineage, no drift). Added new `## Claude subscription credentials (Phase 228)` section to `docs/liv-assistant-install.md` (51 lines) documenting credential file path, ownership/mode, the systemd guards that make it readable, three verify commands matching Plan 228-02 smoke literals, two recovery paths (LivOS Settings UI / interactive `claude` CLI), and rationale.

## Tasks completed

| Task | Name | Commit | Files |
|---|---|---|---|
| 1 | Audit systemd unit + append Claude creds section | `52f01a35` | `docs/liv-assistant-install.md` |

## Audit verdict

- **systemd/liv-assistant.service line 14:** `Environment="HOME=/home/bruce"` — PRESENT (no diff, happy path).
- **systemd/liv-assistant.service line 26:** `ReadWritePaths=/opt/liv-assistant/data /home/bruce/.claude /home/bruce/.bun /home/bruce/.cache` — PRESENT.

## Docs section anchors

- Header: `## Claude subscription credentials (Phase 228)` (exactly once)
- Position: between `## Password rotation` and `## Locked invariants (don't break these)` (preserves operator-reading order)
- `/home/bruce/.claude/.credentials.json` referenced 5 times (table + verify + recovery + section text + smoke literal)
- `Phase 221` referenced 5 times (existing line 145 "Related phases" entry + 4 new in-section references)
- Smoke literal `sudo -u bruce test -r /home/bruce/.claude/.credentials.json` present (Plan 228-02 SC-01 uses identical literal)

## Decisions

1. **Happy-path docs-only commit** — no edit to systemd unit because HOME=/home/bruce already ships from Phase 223-02. Audit verdict captured via the docs append rather than a no-op unit touch.
2. **Insertion point before `## Locked invariants`** — operator-reading sequence flows naturally (install → re-install → upgrade → password → **credentials** → invariants → limits → troubleshooting → related phases).
3. **Smoke literal parity** — `sudo -u bruce test -r /home/bruce/.claude/.credentials.json` in the docs matches Plan 228-02 SC-01 byte-for-byte so runbook readers see the same command as the deploy verification.

## Sacred SHA verification

- Repo side: `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (UNCHANGED).
- Pre-commit hook: `[sacred-sha] PASS: 20 files verified`.
- `git log -1 --name-only` shows only `docs/liv-assistant-install.md` (no `liv/packages/core/` paths touched).

## Deviations from Plan

None — plan executed exactly as written (happy path, docs-only diff, single atomic commit).

## Self-Check: PASSED

- `docs/liv-assistant-install.md` (modified): FOUND
- Commit `52f01a35` in `git log --oneline`: FOUND
- Sacred SHA UNCHANGED: VERIFIED
