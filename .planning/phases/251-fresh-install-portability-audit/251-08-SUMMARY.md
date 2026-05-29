---
phase: 251-fresh-install-portability-audit
plan: 08
subsystem: installer
tags: [audit, read-only, installer, mcp-seed, portability]
requires: []
provides: "Installer-path divergence & MCP-seed integrity findings"
affects: []
tech-stack:
  added: []
  patterns: [read-only-audit]
key-files:
  created:
    - .planning/phases/251-fresh-install-portability-audit/findings/251-08-FINDINGS.md
  modified: []
decisions:
  - "get.livinity.io->script mapping is UNPROVABLE from the repo (no Vercel route/rewrite/DNS config) = CRITICAL open question for 251-09"
  - "The 'Phase 241 seed' recon couldn't find is a livinityd-boot runtime orchestrator (seedAionUiMcpConfig, seed.ts:64), NOT a shell script"
  - "AionUi luse first-create works ONLY on Path A (deploy_livinityd) because it is downstream of a populated liv:mcp:config"
metrics:
  duration: ~12m
  completed: 2026-05-29
---

# Phase 251 Plan 08: Installer-Path Divergence & MCP-Seed Integrity Summary

Read-only audit determining which install entrypoint `get.livinity.io` runs and whether the chosen path
seeds real secrets + a correct `liv:mcp:config` luse entry including the AionUi agent first-create.

## What was done

Traced all install entrypoints in the repo + the MCP-seed lifecycle, producing
`findings/251-08-FINDINGS.md` (133 lines) with a 4-row path-divergence table, a 6-row MCP-seed-integrity
table, and 5 prioritized remediation items.

## Key findings

- **Four install entrypoints exist, not two:** `scripts/install.sh` (Path A, `deploy_livinityd`, real
  secrets + `liv:mcp:config` seed), `/install.sh` (Path B, Phase 196-02, `CHANGEME` secrets, no MCP seed),
  `livos/install.sh` (Path C, real `openssl rand` secrets but NO MCP seed), and
  `platform/web/src/app/install.sh/route.ts` (Path D shim → proxies A, fallback clones+runs C).
- **`get.livinity.io` → script mapping is UNPROVABLE from the repo** — it appears only as display text
  (`README.md:93`, landing JSX). No Vercel route, `next.config.ts` rewrite, or `vercel.json` maps it.
  This is a CRITICAL open question: the fresh-install outcome depends entirely on which body it resolves to.
- **MCP-seed integrity (Path A):** the `liv:mcp:config` luse entry DOES receive a real, non-stale Redis
  URL via sed-substitution of `__LIVOS_REDIS_URL__` (`deploy-livinityd.sh:1138`, `seeds/mcp-servers.json:177`).
  COVERED on Path A.
- **The missing "Phase 241 seed" is a runtime, not a shell, step:** `seedAionUiMcpConfig`
  (`mcp-registrar/seed.ts:64`, wired `index.ts:670`) POSTs the luse entry into AionUi at livinityd boot.
  Recon couldn't find it in shell scripts because it is TypeScript.
- **GAP:** that boot orchestrator is downstream of `liv:mcp:config` being populated (`seed.ts:101-104` —
  empty catalog → silent skip). On Path B/C the catalog is never seeded → AionUi never gets luse →
  Liv AI computer-use silently absent, no operator-visible error.
- **Seed luse `DISPLAY=:1` + `XAUTHORITY=/run/user/1000/gdm/Xauthority` are bare literals** (not
  substituted) → GDM-less fresh box mismatch (dup of 251-02/04).

## Deviations from Plan

The plan framed the question as "Path A vs Path B" (two paths). The audit found **four** entrypoints and
that `get.livinity.io` is unprovable in-repo. The finding documents the full reality rather than the
2-path simplification — this is fidelity to D-251-EVIDENCE, not a scope change. No source files modified
(D-251-READONLY honored).

## Self-Check: PASSED

- FOUND: `.planning/phases/251-fresh-install-portability-audit/findings/251-08-FINDINGS.md` (133 lines, > 40 min)
- FOUND: commit `5fc74f4c`
