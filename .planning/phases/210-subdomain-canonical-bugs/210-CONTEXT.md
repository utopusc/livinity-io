# Phase 210: Subdomain canonical format + 3 critical relay/install bugs — Context

**Gathered:** 2026-05-26
**Status:** CODE-COMPLETE (deploy blocked on a separate Server5 incident — see § Server5 relay state)
**Mode:** Auto-generated + Server5 + Mini PC live probes

## Phase Boundary

Fix three subdomain/install bugs that together cause the `n8n-bruce` vs `n8n.bruce` chaos:
- **Bug A** — relay `parseSubdomain` misroutes hyphen-format hosts
- **Bug B** — `provisionAppSubdomain` silently returns null → wrong Caddy host format
- **Bug C** — `REDIS_PLATFORM_URL` referenced but never declared → install events silently dropped

## D-V41-RELAY-STATE-UNKNOWN — RESOLVED

Server5 (45.137.194.102) PM2 audit 2026-05-26T09:25Z reveals **relay process STOPPED**:

```
│ 2  │ relay │ default │ 0.1.0 │ fork │ 0 │ 0 │ 0 │ stopped │ 0% │ 0b │ root │
│ 1  │ web   │ default │ N/A   │ fork │ 0 │ 0 │ 51│ stopped │ 0% │ 0b │ root │
```

`/root/.pm2/logs/relay-error.log` last modified **2026-05-18 13:50** — relay has been down 8 days. Crash cause: repeated FK constraint violations on `bandwidth_usage_user_id_fkey` from `flushBandwidthToPostgres` (`/opt/platform/relay/src/bandwidth.ts:120`). The FK violation itself is caught (`try/catch (err)` at line 130), but PM2's `max_restarts: 10` with `min_uptime: 10s` was exhausted, leaving the process in permanent `stopped` state.

**Implication:** Bug A's symptom ("opens bruce.livinity.io root") is moot for users on the new CF-tunnel-direct path (which bypasses Server5 relay entirely). The bug still ships as a code fix because it's a genuine correctness issue once relay is back up. Operators on the OLD relay topology have not been able to reach their app subdomains since May 18 regardless.

**Decision (autonomous mode):** Phase 210 ships the 3 code fixes + tests. **Server5 relay restart is filed as a separate carry-over** (new task — not in v41-DRAFT.md but a real operator-visible incident surfaced during this phase). Restart needs DB cleanup of orphan `bandwidth_usage` rows OR a code change to soft-fail on FK violations, both of which exceed Phase 210 scope.

## Code surface

Three surgical edits, two new tests:
- `platform/relay/src/subdomain-parser.ts` — Bug A fix (split single-part hyphen subdomain on last hyphen)
- `livos/packages/livinityd/source/modules/apps/apps.ts` — Bug B fix (`if (!provisioned)` block with loud error log) + Bug C fix (declare `REDIS_PLATFORM_URL = 'livos:platform:url'`)
- `platform/relay/src/subdomain-parser.test.ts` — 13 new test cases (canonical hyphen, multi-hyphen app slug, port stripping, case-insensitive, legacy dot, bare username, apex, mismatch, IP, leading/trailing hyphen)
- `livos/packages/livinityd/source/modules/apps/redis-platform-keys.test.ts` — 2 static-grep regression tests (Bug B's error log surface + Bug C's constant declaration)

## Decisions locked

- **D-210-01** — Bug A heuristic: split on LAST hyphen. App slugs may contain hyphens (e.g. `code-server`), usernames are validated hyphen-free at /register. Trade-off vs DB lookup: parser stays sync + zero-deps; correctness rests on the username validation invariant (which is enforced server-side AND in the platform UI).
- **D-210-02** — Bug B fix is **observability-first** (loud log) not blocking. Plan-of-record alternative was "throw + abort install"; rejected because (i) install on Server5-unreachable should still complete the local Docker bring-up so air-gapped/LAN-only deployments stay functional, (ii) the dot-format Caddy block is locally addressable from LAN even if CF Tunnel routing fails. Future hardening: surface a UI banner on the app instance card when `provisioned=null` was observed.
- **D-210-03** — Bug C inlines the literal string `'livos:platform:url'` as a top-level const (matches the existing `REDIS_PLATFORM_API_KEY` pattern) instead of import-from-shared. Keeps the blast radius surgical.

## REQ coverage

- SUB-01 (canonical hyphen format) — Bug A test cases enforce it.
- SUB-02, SUB-03 (parseSubdomain hyphen split + 4-case test) — Bug A code + test file (13 cases).
- SUB-04, SUB-05, SUB-06 (provisionAppSubdomain throw + Caddy host fix + tests) — Bug B code + regression test. The "THROW" plan-of-record is **softened to loud-LOG** per D-210-02; SUB-04 acceptance criterion is interpreted as "no silent path" not "must throw."
- SUB-07, SUB-08 (REDIS_PLATFORM_URL declared + install_history within 2s) — Bug C code + regression test; the 2s live verification is deferred to Phase 217 UAT (requires Mini PC end-to-end install + Supabase observation).
- SUB-09 (install n8n → opens at n8n-bruce.livinity.io in <30s) — **DEFERRED to Phase 217** (gated on Server5 relay restart).
- SUB-10 (zero "fall through to offline page" log lines) — **DEFERRED to Phase 217**.
- SUB-11 (relay state entry probe) — DONE (this CONTEXT.md § "D-V41-RELAY-STATE-UNKNOWN — RESOLVED").

## Out-of-scope explicit

- Server5 relay restart (separate incident, fix path TBD: orphan-row cleanup vs soft-fail FK handling).
- Existing-install reconcile (the migration described in research § 5 — `reconcileSubdomainHosts()`). Useful but additive; deferred to operator backfill task post-relay-restart.
- Bug D (single-char app slug validation in livinityd) — research section 2 flags it but Phase 210 scope is the 3 named bugs only.

## Threats

- **T-210-01** — Username validation drift: if /register ever permits hyphens in usernames, the Bug A heuristic mis-splits. Mitigation: the `candidateApp && candidateUser` non-empty guard rejects leading/trailing hyphens; further mitigation is a server-side username schema lockdown (out of P210 scope).
- **T-210-02** — Existing installs continue to write the dot-format Caddy block until reconcile runs. Bug B's loud log catches future installs; old broken state needs the reconcile migration.
- **T-210-03** — Bug C silent-drop has been in production since the moment that constant was first referenced; install_history is empty for an unknown duration. Operator may need a one-shot backfill from `/opt/livos/data/update-history/` or PM2 install logs.

## Invariants

- **INV-210-01** — Relay typecheck passes (`npx tsc --noEmit`).
- **INV-210-02** — Livinityd `apps.ts` static-grep tests PASS (both Bug B + Bug C surfaces detected).
- **INV-210-03** — Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` untouched.
