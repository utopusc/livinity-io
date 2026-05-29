---
phase: 252-fresh-install-portability-remediation
plan: 03
subsystem: install-entrypoint
tags: [install, dns, vercel, caddy, route.ts, mcp-seed, resolution, checkpoint, R11]

# Dependency graph
requires:
  - phase: 251-fresh-install-portability-audit
    provides: 251-08 FOUR-entrypoint analysis (A/B/C/D) + why get.livinity.io is unprovable from the repo
  - phase: 252-fresh-install-portability-remediation
    plan: 02
    provides: Wave-2 terminal portability (ordering only — no code dependency)
provides:
  - "Resolved canonical install entrypoint: livinity.io/install.sh = Vercel route.ts (Path D shim) -> scripts/install.sh (Path A) -> deploy-livinityd.sh -> seeds liv:mcp:config (YES)"
  - "Documented legacy entrypoint: get.livinity.io = Caddy 154.12.245.35 -> 301 -> livos/install.sh (Path C, NO MCP seed) — operator confirms NOT in use"
  - "Identified the ONE real remaining gap for R9/252-04: route.ts fallback + legacy Path C both run livos/install.sh which seeds no MCP config"
affects: [252-04 (R9 — now targets livos/install.sh MCP-seed port, not just route.ts)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live DNS/HTTP probe resolution (curl -D -, nslookup) recorded as auditable evidence doc — the mapping is a live infra fact not provable in-repo"

key-files:
  created:
    - .planning/phases/252-fresh-install-portability-remediation/GET-LIVINITY-IO-RESOLUTION.md
  modified: []

key-decisions:
  - "CORRECTION (operator input): the automated Task-1 probe anchored on the WRONG URL (get.livinity.io), which the operator confirmed is legacy/not-working. The real panel-issued install command is `curl -fsSL https://livinity.io/install.sh | sudo bash -s <key>` — a DIFFERENT host (Vercel) serving a DIFFERENT script (Path A)."
  - "livinity.io/install.sh verified live: Server: Vercel, X-Matched-Path: /install.sh -> route.ts shim -> fetches raw scripts/install.sh (Path A, body header `# scripts/install.sh` + Sacred SHA f3538e1d) -> deploy-livinityd.sh seeds MCP. So the primary path is GOOD."
  - "get.livinity.io retained in the doc only to record that it (and the route.ts fallback) run Path C with NO MCP seed — the second motivation for porting the seed into livos/install.sh."
  - "R9/252-04 closure chosen (operator delegated): port _dld_seed_mcp_servers into livos/install.sh so BOTH the route.ts fallback AND legacy Path C seed liv:mcp:config, PLUS keep the original plan R9(2)/R9(3) route.ts + Path B hardening."

requirements-completed: [R11]

# Metrics
duration: ~25min (incl. operator correction cycle)
completed: 2026-05-29
---

# Phase 252 Plan 03: Install-Entrypoint Resolution (R11) Summary

**The live `get.livinity.io → install-script` mapping was resolved by curl+DNS probes, then CORRECTED by operator input: the real user-facing install command is `https://livinity.io/install.sh` (Vercel `route.ts` shim → `scripts/install.sh` = Path A, which DOES seed `liv:mcp:config`). `get.livinity.io` is a separate legacy Caddy host (301 → `livos/install.sh` = Path C, no MCP seed) the operator confirms is not in use. The one real remaining gap — `route.ts`'s fallback and the legacy Path C both run `livos/install.sh` with no MCP seed — is now the precise target for R9/252-04.**

## Performance
- **Duration:** ~25 min (one operator correction cycle)
- **Tasks:** 2 (Task 2 = human-verify checkpoint, resolved by operator)
- **Files modified:** 1 doc created (`GET-LIVINITY-IO-RESOLUTION.md`)

## Accomplishments
- **R11 (Task 1)** — Ran read-only `curl -sSL -D -` + `nslookup` probes against `get.livinity.io`/`/install`, captured headers + body, and recorded a full evidence trail in `GET-LIVINITY-IO-RESOLUTION.md`.
- **R11 (Task 2 checkpoint)** — Presented the verdict to the operator. Operator flagged that `get.livinity.io` was not the install path in use and supplied the real command (`curl -fsSL https://livinity.io/install.sh | sudo bash -s <key>`). A live probe of `livinity.io/install.sh` confirmed it is served by Vercel `route.ts` → `scripts/install.sh` (Path A). The resolution doc was rewritten to the corrected dual-URL picture and committed.

## Verdict (final)
`livinity.io/install.sh → route.ts (Path D shim) → scripts/install.sh (Path A) → deploy-livinityd.sh → seeds MCP: YES`
Legacy: `get.livinity.io/install → Caddy 301 → livos/install.sh (Path C) → seeds MCP: NO` (not in use).

## Implication for R9 / Plan 252-04
The real gap is `livos/install.sh` (Path C) lacking the MCP seed — reachable via the `route.ts` GitHub-raw-fetch **fallback** (`route.ts:30-36`) and the legacy `get.livinity.io` URL. Chosen closure (operator delegated the choice): **port the `_dld_seed_mcp_servers` step into `livos/install.sh`** so every entrypoint seeds `liv:mcp:config`, AND retain the plan's original R9(2) route.ts Path-A pin + R9(3) Path-B `CHANGEME`→`openssl rand` hardening.

## Verification
- `GET-LIVINITY-IO-RESOLUTION.md` exists, >= 20 lines, contains the literal `livinity.io/install.sh →` verdict line. ✓
- `.planning/` doc committed with `git add -f` (`df5006f4`). ✓
- No source files touched (ops/docs plan) → sacred SHA trivially preserved. ✓

## Notes
- The checkpoint correction is a textbook case for the human-verify gate: the automated probe was confidently wrong because it resolved a plausible-but-legacy URL. Operator knowledge of the panel-issued command was the missing fact.
