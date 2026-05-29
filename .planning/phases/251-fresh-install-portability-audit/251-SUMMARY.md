---
phase: 251-fresh-install-portability-audit
plan: 09
subsystem: planning/audit
tags: [portability, fresh-install, luse, terminal, installer, synthesis, audit]
dependency-graph:
  requires: [251-01, 251-02, 251-03, 251-04, 251-05, 251-06, 251-07, 251-08]
  provides: [PORTABILITY-AUDIT, REMEDIATION-BACKLOG, phase-252-seed]
  affects: []
tech-stack:
  added: []
  patterns: [read-only-audit-synthesis, severity-ranked-backlog]
key-files:
  created:
    - .planning/phases/251-fresh-install-portability-audit/PORTABILITY-AUDIT.md
    - .planning/phases/251-fresh-install-portability-audit/REMEDIATION-BACKLOG.md
    - .planning/phases/251-fresh-install-portability-audit/251-SUMMARY.md
  modified:
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "Verdict: NO-GO for a seamless fresh install of the terminal + Luse-display features — 5 P0 blockers."
  - "imagemagick/import confirmed NOT a code dependency (251-03) — excluded from the backlog."
  - "Live Mini PC corroboration SKIPPED per D-251-LIVE-OPTIONAL; the one live-only question (get.livinity.io alias) is a DNS/Vercel question unanswerable by SSH, captured as backlog R11."
metrics:
  duration: ~25min
  completed: 2026-05-29
  tasks: 4
  commits: 3
  files: 3
---

# Phase 251 Plan 09: Fresh-Install Portability Audit Synthesis Summary

Aggregated the eight Wave-1 findings docs into a single `PORTABILITY-AUDIT.md` (per-dimension
COVERED/GAP/RISK matrix + Q1/Q2 verdicts) and a severity-ranked `REMEDIATION-BACKLOG.md` (16 items, R1-R16,
ready to become Phase 252). Read-only synthesis — no source touched.

## What was audited

The v44 Luse display-lifecycle (P248) + 243/246 terminal panel + 250-hotfix change neighbourhood, against the
repo and every installer script, across eight dimensions: luse Redis-URL resolution (251-01), display backend
Xephyr/Xvfb (251-02), external-binary matrix (251-03), identity hardcodes (251-04), install-root & sandbox
paths (251-05), systemd env delivery (251-06), terminal hot-fixes (251-07), installer-path divergence &
MCP-seed integrity (251-08).

## Headline verdict

**Q1 (any session-introduced hardcode that breaks portability?):** YES — three NEW hardcodes: `xterm` hard-dep
(P0, silently swallowed), PTY `username:'bruce'` triple-pin with no lookup (P1), `/opt/livos` Redis-fallback
literal (P2). Plus two un-reproducible live-only hand artifacts (`redis-env.conf` drop-in + manual apt
installs) that mask gaps on the Mini PC.

**Q2 (would a brand-new install come up seamlessly?):** **NO-GO.** The daemon, screenshot/xvfb/input stack, WS
routes, Caddy, and cookie-auth are portable — but terminal + Luse-display are dead on a fresh Path-A box until
5 P0 blockers are fixed: install `xserver-xephyr` + `xterm`; add `create_display` error handler; fix PTY
sudoers/self-sudo; seed the `terminal_panel` flag; and pin `get.livinity.io` to Path A (only Path A seeds the
Luse MCP catalog — Path B writes `CHANGEME`, Path C seeds no MCP config).

## Reports

- **PORTABILITY-AUDIT.md** — consolidated verdict + 30-row per-dimension matrix + de-duplicated cross-refs +
  live-corroboration note (SKIPPED).
- **REMEDIATION-BACKLOG.md** — R1-R16 ordered P0→P2 with file:line / change / effort / kind, a copy-pasteable
  apt block, and a 5-wave Phase 252 sequencing plan.

## Deviations from Plan

None — plan executed exactly as written. Task 3 (optional live ssh) handled as SKIPPED per
D-251-LIVE-OPTIONAL and documented inline in PORTABILITY-AUDIT.md; it never blocked synthesis.

## Self-Check: PASSED

- PORTABILITY-AUDIT.md exists (156 lines ≥ 60 min) — commit `4929916f`
- REMEDIATION-BACKLOG.md exists (153 lines ≥ 40 min) — commit `6bc1ee70`
- Both commits present in `git log` (verified below)
