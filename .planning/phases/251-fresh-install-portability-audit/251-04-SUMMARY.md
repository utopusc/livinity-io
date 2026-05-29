---
phase: 251-fresh-install-portability-audit
plan: 04
subsystem: pty-sessions / computer-use / luse / installer
tags: [audit, read-only, identity, username, uid, xauthority, display, portability, fresh-install]
requires: []
provides: "Identity-hardcode findings (Linux user / uid / Xauthority / X display / LUSE_USER_ID default) for the v44/250-hotfix change surface"
affects: []
tech-stack:
  added: []
  patterns: ["read-only evidence-backed audit (D-251-EVIDENCE)"]
key-files:
  created:
    - .planning/phases/251-fresh-install-portability-audit/findings/251-04-FINDINGS.md
  modified: []
decisions:
  - "PTY username 'bruce' is pinned in THREE independent layers (ws-handler.ts:466 literal + types.ts:31 literal type + session.ts:77 runtime guard / :82 hardcoded `--user bruce` argv) with NO Redis lookup — unlike Chrome which reads livos:desktop:user"
  - "LUSE_USER_ID has divergent fallback defaults in the SAME luse child process: server.ts:315 = 'admin', tools.ts:915-916 = 'bruce'; the var is unset on every fresh install (not in the seed)"
  - "Installer hard-creates bruce/uid-1000 but the user is parameterizable (_DLD_DESKTOP_USER) and uid is NOT guaranteed (auto-uid retry at deploy-livinityd.sh:299-302) — literals work by construction on a default install only"
  - "Seed XAUTHORITY=/run/user/1000/gdm/Xauthority is REAL-GAP (uid-1000 AND gdm assumptions; fresh Xvfb+fluxbox box has neither; not placeholder-substituted)"
metrics:
  duration: "~10 min"
  completed: 2026-05-29
---

# Phase 251 Plan 04: Identity Hardcode (user / uid / Xauthority / display) Audit Summary

Read-only audit enumerating every Linux-identity assumption (username, uid, Xauthority path, X display, and
the `LUSE_USER_ID` default) across the v44/250-hotfix terminal + Luse change surface and its immediate
neighbourhood. Result: an 11-row identity-literal table with lookup-status + per-box failure mode, plus the
fully-characterised SEVEREST finding (PTY `username:'bruce'` pinned in three layers with no lookup) and the
`admin`-vs-`bruce` `LUSE_USER_ID` default inconsistency, each risk-rated REAL-GAP vs LATENT-RISK against
installer evidence.

## What Was Done

- **Task 1 — identity enumeration (committed `ad40e87c`):** Read the PTY spawn path
  (`pty-sessions/ws-handler.ts:466`, `types.ts:31`, `session.ts:77,82-89`), the Chrome launch block
  (`server/index.ts:1774-1778`), the luse `LUSE_USER_ID` consumers (`mcp/server.ts:315`,
  `mcp/tools.ts:915-916`), the display fallback (`mcp/tools.ts:1612`), and the seed
  (`scripts/install/seeds/mcp-servers.json:174-182`). Built an 11-row table classifying each literal as
  HARD-LITERAL vs RESOLVED-AT-RUNTIME, NEW vs PRE-EXISTING, and giving the exact failure mode on a
  non-`bruce` / non-1000 / no-GDM box.
- **Task 2 — installer fragility + risk rating (same commit):** Read `_dld_create_desktop_user()`
  (`deploy-livinityd.sh:276-335`) and the systemd `User=bruce` lines (`:1477-1478`, `:1569-1570`,
  `systemd/liv-assistant.service:10-11`). Established that the installer hard-creates `bruce`/uid-1000 by
  default but the user is parameterizable and uid can auto-assign. Risk-rated each hardcode REAL-GAP vs
  LATENT-RISK and wrote 4 portable-fix recommendations for the 251-09 backlog.

## Key Findings (verdicts)

- **PTY `username:'bruce'` — SEVEREST, NEW, three-layer pin:** `ws-handler.ts:466` passes the literal with no
  `livos:desktop:user` lookup; `types.ts:31` types it as the string-literal `'bruce'`; `session.ts:77` guards
  `!== 'bruce'` (throws) and `:82-89` hardcodes `sudo --user bruce` argv. On any non-`bruce` box the terminal
  is dead. Contrast Chrome (`index.ts:1774`) which resolves `livos:desktop:user || 'bruce'`. **LATENT-RISK**
  on a default install (installer makes `bruce`), **REAL-GAP** the moment `_DLD_DESKTOP_USER` is overridden.
- **`LUSE_USER_ID` `admin`-vs-`bruce` divergence — REAL-GAP (consistency):** same env var, two fallbacks in the
  same process (`server.ts:315` = `'admin'`, `tools.ts:915-916` = `'bruce'`). Confirmed unset on fresh install
  (seed sets `LUSE_USER_SLUG`/`LUSE_DOMAIN_ROOT` but NOT `LUSE_USER_ID`). Practically `bruce` wins (drives the
  allowlist); the `admin` value is latent.
- **Seed `XAUTHORITY=/run/user/1000/gdm/Xauthority` — REAL-GAP:** hardcoded uid-1000 AND gdm; fresh Xvfb+fluxbox
  box has neither; not substituted by any installer placeholder.
- **uid `'1000'` fallback (`index.ts:1776`), `DISPLAY=:1` seed, `defaultDisplay ?? ':0'` (`tools.ts:1612`):**
  LATENT-RISK — runtime-resolved with literal fallbacks that rarely fire on a default install.
- **Chrome path (`index.ts:1774-1778`): COVERED** — the reference pattern (Redis lookup + `id -u` + Xauthority
  find-or-home-fallback) the PTY/seed gaps should copy.

## Remediation (for 251-09 backlog)

1. PTY: read `livos:desktop:user` (copy Chrome `index.ts:1774`), widen `types.ts:31` to `string`, relax
   `session.ts:77` guard to reject root/uid-0 instead of `=== 'bruce'`, and parameterize the `--user` argv.
2. Unify `LUSE_USER_ID` default to one value (recommend `'bruce'`) across `server.ts:315` + `tools.ts:915-916`,
   and seed `LUSE_USER_ID` explicitly in `mcp-servers.json`.
3. Derive uid via `id -u`; drop the `1000` literals from the seed `XAUTHORITY`.
4. Drop the `gdm` constraint; make `/home/${user}/.Xauthority` the primary non-GDM path.

## Deviations from Plan

None — plan executed exactly as written. Read-only audit; the ONLY file created is the findings doc under the
phase directory (D-251-READONLY satisfied). No source modified; sacred SHA preserved (commit hook
`[sacred-sha] PASS: 20 files verified`, D-V44-SACRED held). The two plan tasks were combined into one commit
since the identity table and the installer risk-rating form a single cohesive findings document.

## Self-Check: PASSED

- FOUND: `.planning/phases/251-fresh-install-portability-audit/findings/251-04-FINDINGS.md` (126 lines > 40 min)
- FOUND: commit `ad40e87c` `docs(251-04): identity hardcode (user/uid/Xauthority/display) audit findings`
