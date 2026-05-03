---
phase: 63-mandatory-live-verification
plan: 01
subsystem: live-verification-gate
tags:
  - phase-63
  - wave-0
  - pre-flight
  - hard-block
  - sacred-file
  - architectural-defect
dependency_graph:
  requires:
    - "Phases 56-62 EXECUTED (all 7 SUMMARY + VERIFICATION present on master)"
    - "Sacred file SHA 4f868d318abff71f8c8bfbcf443b2393a553018b at start of Phase 63"
    - "Mini PC bruce@10.69.31.68 SSH reachable (LAN + fail2ban)"
    - "Server5 root@45.137.194.102 SSH reachable"
    - "DNS api.livinity.io → 45.137.194.102"
    - "TLS api.livinity.io valid LE cert"
    - "Phase 60 broker IP-guard removed AND deployed AND working live"
    - "Phase 61 alias seed in Mini PC Redis (≥10 entries)"
    - "Phase 62 Settings > AI Configuration > API Keys tab visible in browser"
  provides:
    - ".planning/phases/63-mandatory-live-verification/63-pre-flight.log (392-line forensic trail)"
    - ".planning/phases/63-mandatory-live-verification/63-UAT-RESULTS.md (canonical skeleton for Wave 4)"
    - ".planning/phases/63-mandatory-live-verification/evidence/ (directory marker)"
    - "Pre-flight VERDICT block: OVERALL BLOCK with R1+R2+R3 remediation"
    - "Phase 60 production-defect surfacing — findAdminTunnel column-mismatch (relay log evidence)"
  affects:
    - "Phase 63 Waves 1-5 are NOT unblocked — R1+R2+R3 remediation required first"
    - "v30.0 milestone close is BLOCKED until R1 fixed (D-LIVE-VERIFICATION-GATE forbids --accept-debt)"
    - "Phase 60 PHASE-SUMMARY claim 'live perimeter LIVE' is invalidated for the live-Bearer code path"
tech_stack:
  added: []
  patterns:
    - "Single-batched SSH per host (fail2ban discipline)"
    - "Pre-flight log as append-only forensic trail"
    - "Auxiliary diagnostics distinguish 'Mini PC offline' vs 'Phase 60 query defect' as independent failure modes"
key_files:
  created:
    - ".planning/phases/63-mandatory-live-verification/63-pre-flight.log (392 lines)"
    - ".planning/phases/63-mandatory-live-verification/63-UAT-RESULTS.md (canonical skeleton)"
    - ".planning/phases/63-mandatory-live-verification/evidence/.gitkeep"
    - ".planning/phases/63-mandatory-live-verification/63-01-SUMMARY.md (this file)"
  modified: []
decisions:
  - "Loosened CHECK 1 strictness to recognize Phase 60 + Phase 62 'human_needed' VERIFICATION status as BY-DESIGN deferral when 'deferred:' / 'phase_63_walker_readiness: ready' frontmatter is present (those deferrals are exactly Phase 63's mandate to resolve)."
  - "Phase 60 findAdminTunnel column-mismatch surfaced as an architectural defect (Rule 4 trigger) requiring a hot-patch BEFORE Phase 63 Wave 1 — NOT silently auto-fixed in Wave 0 (out of scope)."
  - "Recommended R1 remediation: hardcode WHERE username='admin' (Option a) — least-invasive, matches existing single-tenant v30 schema, T-60-20 username-spoofing threat moot under closed-signup single-admin design."
  - "Did NOT auto-retry Mini PC SSH beyond the 1 documented retry (fail2ban discipline; only 1 extra attempt to confirm timeout vs transient)."
metrics:
  duration_minutes: 5
  completed: "2026-05-03T07:59:53Z"
  log_lines: 392
  pre_flight_checks_run: 8 (1, 2A, 2B, 2C, 3A, 3B, 3C, 3D)
  pre_flight_checks_green: 4 (1, 2B, 2C, 3A)
  pre_flight_checks_blocked: 4 (2A, 3B-partial, 3C, 3D)
---

# Phase 63 Plan 01: Wave 0 Pre-Flight Gate — Summary

**One-liner:** Pre-flight gate executed; 4/8 checks GREEN, 4/8 BLOCK — Phase 63 STOPS with red-light verdict (Mini PC offline + Phase 60 production-relay defect surfaced).

## Pre-Flight Checklist Results (One Line Each)

| Check | Description | Result | Evidence |
|-------|-------------|--------|----------|
| 1 | Phases 56-62 EXECUTED (SUMMARY + VERIFICATION present) | GREEN | All 7 phase dirs have ≥1 SUMMARY + 1 VERIFICATION; Phase 60+62 'human_needed' is BY-DESIGN deferral to Phase 63 (verified via 'deferred:' / 'phase_63_walker_readiness: ready' frontmatter) |
| 2A | Mini PC bruce@10.69.31.68 SSH reachable | BLOCK | `ssh: connect to host 10.69.31.68 port 22: Connection timed out` (2 attempts, both timeout — not fail2ban-banned, pure unreachable) |
| 2B | Server5 root@45.137.194.102 SSH reachable | GREEN | hostname=vmi2892422, uptime 178 days, caddy active v2.11.2, ports 80/443/4000 listening, exit 0 |
| 2C | Sacred file SHA local (D-30-07) | GREEN | `git hash-object` returns `4f868d318abff71f8c8bfbcf443b2393a553018b` (byte-identical to expected) |
| 3A | DNS api.livinity.io → Server5 IP | GREEN | local resolver (192.168.20.1) + 1.1.1.1 BOTH return `45.137.194.102` |
| 3B | TLS valid + endpoint returns 401 | PARTIAL | TLS PASS (LE E8 / Verify return code: 0); endpoint returns **HTTP 503** not 401 — see two root causes below |
| 3C | Phase 61 Redis alias seed ≥10 entries | BLOCK | Cannot probe — Mini PC SSH unreachable per CHECK 2A |
| 3D | Phase 62 Settings > AI Configuration > API Keys tab visible | BLOCK | bruce.livinity.io routes through Mini PC tunnel (offline) + broken findAdminTunnel — UI unreachable |

## Mini PC Reachability

`ssh exit code 255` (Connection timed out, port 22) on 2 attempts within 60s. No `Connection refused` (so not fail2ban). Network unreachable / Mini PC powered off / off-LAN. Subsequent `ping`-style probes withheld to avoid orchestrator IP triggering fail2ban on resume.

## Server5 Reachability

`ssh exit code 0`. Server5 healthy:
- hostname `vmi2892422`, uptime 178 days
- `caddy active` (v2.11.2 — `iOlpsSiSKqEW+SIXrcZsZ/NO74SzB/ycqqvAIEfIm64=`)
- Ports 80, 443, 4000 (relay) listening
- `/etc/caddy/Caddyfile` modified 2026-05-03T07:23 (Phase 60 deploy)

## DNS Check Result

GREEN. `api.livinity.io` → `45.137.194.102` from BOTH local resolver (Unifi Dream router 192.168.20.1) AND 1.1.1.1 Cloudflare DNS. No propagation lag.

## TLS Check Result

GREEN for cert. `subject=CN=api.livinity.io`, `issuer=Let's Encrypt CN=E8`, `Verify return code: 0 (ok)`, TLSv1.3 / TLS_AES_128_GCM_SHA256.

But endpoint returned **HTTP 503** (not 401) — see "Phase 60 production defect" below.

## Sacred SHA — Local

`4f868d318abff71f8c8bfbcf443b2393a553018b` (matches expected). D-30-07 strictly preserved on orchestrator side.

## Sacred SHA — Mini PC (Remote)

NOT VERIFIED — Mini PC unreachable. Will verify in next Wave 0 re-run after R2 remediation.

## Verdict: RED-LIGHT

**OVERALL: BLOCK — Phase 63 STOPS at Wave 0. DO NOT proceed to Wave 1 (63-02).**

### Three Remediation Tasks (Required Before Re-Running Wave 0)

**R1 — PHASE 60 RELAY HOT-PATCH (architectural defect surfaced by pre-flight)**

- **File:** `platform/relay/src/admin-tunnel.ts:43`
- **Defect:** Query `SELECT id, username FROM users WHERE role = $1` errors with `column "role" does not exist` on EVERY api.livinity.io request
- **Root cause:** Phase 60 Wave 2 spec referenced a `users.role` column that does not exist in the platform DB schema (verified via `psql \d users` on Server5 — 11 columns, zero `role`-like). The Phase 60 unit tests passed against a mock pg.Pool; the live schema was never consulted.
- **Evidence:** Server5 relay logs (PM2 process 18) show `[relay] findAdminTunnel DB error: error: column "role" does not exist` repeatedly, with `internalPosition: '38'`, `code: '42703'`, source `parse_relation.c:3722`.
- **Recommended fix (Option a):** Hardcode `WHERE username = $1` with sentinel `'admin'` (or `'bruce'` per the actual single-tenant deployment). Update doc comment to reflect that T-60-20 username-spoofing threat is moot in single-tenant closed-signup design. Re-deploy Server5 relay (`scp` + `pm2 restart relay`).
- **Alternative (Option b):** Add `role text NOT NULL DEFAULT 'user'` column to `platform.users` + `UPDATE users SET role='admin' WHERE username='bruce'`. More invasive; adds a column the rest of the codebase does not consume.
- **Phase 60 PHASE-SUMMARY misleading claim invalidated:** "live perimeter LIVE on Server5" was true ONLY for the perimeter cert/DNS/rate-limit sub-chain; the dispatch sub-chain (relay → admin tunnel) was 100% broken on every request. The `60-SMOKE-RESULTS.md §4 — 30 × 503 sendBrokerTunnelOffline envelopes` was misinterpreted as "chain alive but Mini PC offline" when in fact it was "chain dead at findAdminTunnel".

**R2 — Mini PC online + reachable from orchestrator**

- Verify Mini PC powered on, on LAN, fail2ban not banning orchestrator IP.
- After hardware/network restored, re-run CHECK 2A in single batched ssh.

**R3 — `bash /opt/livos/update.sh` on Mini PC**

- Per Phase 60 + 62 verifier hand-off — deploys Phase 60-04 broker IP-guard removal, Phase 61 (rate-limit headers + alias seed + BrokerProvider), Phase 62 (broker_usage.api_key_id schema migration + capture middleware + tRPC apiKeyId filter + UI).
- After deploy, CHECK 3C (alias seed ≥10) and CHECK 3D (Settings UI tab visible) become probeable.

### Re-Run Protocol

Re-run THIS plan (`63-01-PLAN.md`) from scratch after R1+R2+R3 complete. Do NOT skip to Wave 1 even if the orchestrator believes "we already ran Wave 0" — the plan demands a fresh OVERALL: GREEN before Wave 1 unblocks.

DO NOT pass `--accept-debt` at v30.0 close — R1 is a real production defect, not a stylistic gap.

## Deviations from Plan

### Auto-Adapted

**1. [Rule 1 — Bug surfacing] Recognized Phase 60+62 'human_needed' VERIFICATION as BY-DESIGN deferral**

- **Found during:** CHECK 1 first pass returned BLOCK on Phase 60 + Phase 62
- **Issue:** Naive grep for `status: human_needed` would have hard-failed CHECK 1 on otherwise-shipped phases
- **Fix:** Inspected the VERIFICATION.md `deferred:` and `phase_63_walker_readiness:` frontmatter — both phases EXPLICITLY hand off live UATs to Phase 63 by design. Re-classified as GREEN with deferral hand-off recognized.
- **Files modified:** `.planning/phases/63-mandatory-live-verification/63-pre-flight.log` (CHECK 1 DISPOSITION block appended)
- **Commit:** (this plan's atomic commit)

### Architectural Discovery (Rule 4 — STOP)

**2. [Rule 4 — Architectural defect] Phase 60 findAdminTunnel column-mismatch is a relay-wide production blocker**

- **Found during:** Auxiliary diagnostic 2 (relay logs) — was investigating "why HTTP 503 not 401" in CHECK 3B
- **Issue:** `admin-tunnel.ts:43` queries `users.role` which doesn't exist in production schema; relay errors `column "role" does not exist` on every request, returns 503 envelope before even reaching admin tunnel WebSocket dispatch.
- **Why Rule 4 (not auto-fix):** This is NOT a Wave 0 bug — it's a Phase 60 production defect that needs:
  (a) a Phase 60 hot-patch plan with proper schema-vs-source reconciliation
  (b) re-deploy of relay binary on Server5 with restart
  (c) re-run of phase-60-smoke.sh §4 against a NOW-functional dispatch chain
  Out of Wave 0 scope. Documented as R1 in verdict.
- **Files NOT modified:** Did NOT auto-patch admin-tunnel.ts. Did NOT touch Server5. Did NOT bypass.
- **Tracked in:** `.planning/phases/63-mandatory-live-verification/63-pre-flight.log` AUXILIARY 2 + 3 + VERDICT R1.

### Auth Gates

None encountered. Both SSH attempts used non-interactive key auth.

### Out-of-Scope Discoveries (Logged Only)

- `tunnel_connections` table has zero rows historically (in-memory registry semantics; persistence not used). Not a defect, just FYI.
- `liv-memory.service` pre-existing breakage (per project memory) was not re-investigated — Mini PC SSH unreachable.

## Self-Check: PASSED

- File `.planning/phases/63-mandatory-live-verification/63-pre-flight.log` exists (392 lines; FOUND).
- File `.planning/phases/63-mandatory-live-verification/63-UAT-RESULTS.md` exists with canonical table header (FOUND).
- Directory `.planning/phases/63-mandatory-live-verification/evidence/` exists with `.gitkeep` (FOUND).
- File `.planning/phases/63-mandatory-live-verification/63-01-SUMMARY.md` exists (this file; FOUND).
- Sacred SHA `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` = `4f868d318abff71f8c8bfbcf443b2393a553018b` (matches expected; FOUND).
- Pre-flight log contains final `=== PHASE 63 PRE-FLIGHT VERDICT ===` block with explicit `OVERALL: BLOCK` and 3 named remediations R1/R2/R3 (FOUND).
- ZERO `--accept-debt` invocations. ZERO new override row added to MILESTONES.md.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: production-defect | `platform/relay/src/admin-tunnel.ts:43` | Schema-vs-source drift — Phase 60 unit tests mocked pg.Pool and never asserted query against live `users` schema. Future Phase 60-style tests should `pg-mem` or test-DB-bootstrap from `schema.sql` to catch column-existence drift. |
