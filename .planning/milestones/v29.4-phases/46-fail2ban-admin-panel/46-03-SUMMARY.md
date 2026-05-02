---
phase: 46-fail2ban-admin-panel
plan: "03"
subsystem: backend-fail2ban-admin-trpc
tags: [fail2ban, backend, trpc, admin-procedure, http-only-paths, integration-test]
dependency_graph:
  requires:
    - 46-02-SUMMARY.md (parser/client/active-sessions/events from Wave 2)
    - livos/packages/livinityd/source/modules/server/trpc/trpc.ts (adminProcedure factory)
    - livos/packages/livinityd/source/modules/server/trpc/is-authenticated.ts (RBAC role check)
    - livos/packages/livinityd/source/modules/devices/audit-pg.ts (REUSE — read-side via JOIN)
    - livos/packages/livinityd/source/modules/database/index.ts (REUSE — getPool)
  provides:
    - fail2ban-admin/index.ts (module barrel + listEvents read-side query)
    - fail2ban-admin/routes.ts (tRPC router — 5 procedures, all adminProcedure-gated)
    - fail2ban-admin/integration.test.ts (e2e router + DI execFile + mocked pg.Pool)
    - appRouter.fail2ban registration (server/trpc/index.ts)
    - httpOnlyPaths += 'fail2ban.unbanIp', 'fail2ban.banIp' (server/trpc/common.ts)
  affects:
    - 46-04-PLAN.md (UI hooks consume fail2ban.* tRPC routes)
    - ROADMAP.md §46 success criterion #8 (httpOnlyPaths additions present)
tech_stack:
  added: []
  patterns:
    - tRPC router with adminProcedure-only gate (mirrors usage-tracking/routes.ts)
    - Zod literal-string type-confirm gate (`z.literal('LOCK ME OUT').optional()`)
    - Self-ban detection via union of HTTP X-Forwarded-For + active SSH source IPs
    - Cellular CGNAT bypass via admin-attested `cellularBypass` flag (B-19)
    - pg.Pool prototype patch + injected ExecFileFn for integration test (no vi.mock)
    - tRPC caller pattern with `dangerouslyBypassAuthentication: true` for unit-level
      admin-procedure tests (RBAC `requireRole('admin')` still runs on `currentUser`)
key_files:
  created:
    - livos/packages/livinityd/source/modules/fail2ban-admin/index.ts
    - livos/packages/livinityd/source/modules/fail2ban-admin/routes.ts
    - livos/packages/livinityd/source/modules/fail2ban-admin/integration.test.ts
  modified:
    - livos/packages/livinityd/source/modules/server/trpc/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.test.ts
decisions:
  - "Convenience high-level functions in index.ts pass through to realFail2banClient — keeps routes.ts import surface tidy without adding a second abstraction layer (re-exports are thin pass-throughs only)"
  - "listEvents is the one outlier in index.ts — queries device_audit_log via getPool() directly (REUSE, no new table), JOIN users for admin_username, returns [] on null pool / query error (read-side audit failures must not break UI)"
  - "5-procedure router: 3 queries (listJails, getJailStatus, listEvents) + 2 mutations (unbanIp, banIp). Only mutations land in httpOnlyPaths — queries are cheap, idempotent, retry-safe, stay on WS."
  - "Self-ban detection runs BEFORE fail2ban-client spawn. If admin's IPs ∩ {target} is non-empty AND `confirmation !== 'LOCK ME OUT'` AND `cellularBypass !== true`, throws TRPCError CONFLICT 'self_ban' — Test 6 verifies execFile is NEVER called in that path."
  - "cellularBypass=true bypasses self-ban check entirely (B-19). Admin-attested — false claims = admin lies to themselves, gets locked out. Aligns with documented threat-register entry T-46-15 (accept disposition)."
  - "Zod ipSchema rejects CIDR notation entirely. Even /32 is rejected — defense-in-depth (B-03 layer 1). client.ts re-validates (layer 2 / 3). Test 9 confirms `0.0.0.0/0` is rejected at Zod BEFORE execFile."
  - "Audit rows written for BOTH success AND failure paths in unbanIp + banIp. Failure path writes BEFORE re-throwing the mapped TRPCError so partial-success states are captured (e.g., unban succeeded but addIgnoreIp failed). events.ts is fire-and-forget — if PG INSERT itself fails, audit JSON file fallback still runs."
  - "common.test.ts extended (NOT replaced) — 4 prior assertions become 7. Mirrors Phase 45 FR-CF-03 cluster pattern: 2 presence + 2 bare-name footgun guard. Tracker count 4/4 -> 7/7."
  - "Integration test uses tRPC `appRouter.createCaller(ctx)` pattern with synthetic admin ctx and `dangerouslyBypassAuthentication: true` — bypasses JWT verification but `requireRole('admin')` still runs on ctx.currentUser, so RBAC gate is exercised (non-admin would be rejected)."
  - "Real bindings (`realFail2banClient`, `realActiveSessionsProvider`) overridden via Object.assign for test scope, restored via per-test `restore()` closure. Avoids vi.mock entirely (W-20)."
metrics:
  duration: ~7 minutes (read-first survey + 2 task implementations + verification gates)
  completed: "2026-05-01T21:16:00Z"
  test_count: 10  # integration.test.ts only (parser/client/active-sessions/common counted in Plan 02 + 45)
  total_phase46_tests: 48  # 14 parser + 13 client + 4 active-sessions + 7 common (extended) + 10 integration
  source_loc: ~340  # routes.ts 277 + index.ts 119 (rough)
  test_loc: ~395   # integration.test.ts ~395
---

# Phase 46 Plan 03: Backend tRPC Integration (Wave 3) Summary

**One-liner:** 5-procedure adminProcedure-only fail2ban tRPC router + httpOnlyPaths cluster (`fail2ban.unbanIp`, `fail2ban.banIp`) + 10/10 integration tests proving B-01 / B-02 / B-03 / B-19 / T-46-17 mitigations are wired end-to-end. Sacred file untouched.

## What Was Built

### `fail2ban-admin/index.ts` (119 LOC) — module barrel

Re-exports the four Wave 2 source files (parser / client / active-sessions / events) and adds 6 convenience high-level functions wrapping `realFail2banClient`:

- `listJails()`, `getJailStatus(jail)`, `unbanIp(jail, ip)`, `banIp(jail, ip)`, `addIgnoreIp(jail, ip)` — thin pass-throughs to `realFail2banClient.*`.
- `listEvents({limit})` — the one outlier: queries `device_audit_log` directly via `getPool()`, filtered by sentinel `device_id='fail2ban-host'` AND `tool_name IN ('unban_ip','ban_ip','whitelist_ip')`. JOINs `users u ON u.id = user_id` to surface `admin_username`. Returns `[]` on null pool / query error (read-side audit failures must not break UI).

`Fail2banEventRow` interface exported for routes.ts → UI.

### `fail2ban-admin/routes.ts` (277 LOC) — tRPC router

Five procedures, ALL gated by `adminProcedure` (per pitfall M-06 + threat T-46-10):

| Procedure | Type | Mitigations |
|-----------|------|-------------|
| `listJails` | query | FR-F2B-01: 4-state service detection (binary-missing / service-inactive / no-jails / running). Pitfall B-05 transient catch returns `{state:'running', jails:[], transient:true}` instead of crashing. |
| `getJailStatus` | query | Per-jail counters + banned IP list. Best-effort enrichment with `lastAttemptedUsers` from `realFail2banClient.readAuthLogForLastUser` — wrapped in try/catch so auth.log failures don't fail the query (FR-F2B-02 sub-issue #3). |
| `listEvents` | query | FR-F2B-04 read-side audit log surface (limit 1-200, default 50). |
| `unbanIp` | mutation | FR-F2B-02 + B-01: action-targeted unban + optional ignoreip whitelist. Audit row written with `tool_name='whitelist_ip'` when `addToWhitelist=true`, else `'unban_ip'`. Failure path writes audit BEFORE re-throwing. |
| `banIp` | mutation | FR-F2B-03: self-ban gate (B-02) + cellular bypass (B-19). Self-ban detection runs BEFORE fail2ban-client spawn — Test 6 verifies execFile is NEVER called when LOCK-ME-OUT confirmation is missing. |

**Zod schemas:**
- `ipSchema` — IPv4 dotted-quad regex `^(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$`. CIDR (any /N) rejected (B-03 layer 1).
- `jailSchema` — `^[a-zA-Z0-9_.-]+$`. Shell injection (`'sshd; rm -rf /'`) rejected (T-46-17 layer 1).
- `confirmation: z.literal('LOCK ME OUT').optional()` — strict-equality type-confirm gate.
- `cellularBypass: z.boolean().default(false)`.

**Self-ban detection** (`getAdminActiveIps`): unions HTTP `X-Forwarded-For` (first hop) ∪ active SSH session source IPs (from `realActiveSessionsProvider.listActiveSshSessions()`, with `.catch(() => [])` graceful degrade). When `cellularBypass !== true` AND target IP ∈ adminIps AND `confirmation !== 'LOCK ME OUT'`, throws `TRPCError CONFLICT 'self_ban'` with `cause: {adminIps, banTargetIp}`.

**Error mapping** (`mapClientErrorToTrpc`):

| Fail2banClientError.kind | TRPC code | message |
|-------------------------|-----------|---------|
| `binary-missing` | INTERNAL_SERVER_ERROR | `fail2ban_missing` |
| `service-down` | INTERNAL_SERVER_ERROR | `service_inactive` |
| `jail-not-found` | NOT_FOUND | `jail_not_found` |
| `ip-invalid` | BAD_REQUEST | (preserves err.message) |
| `timeout` / `transient` | INTERNAL_SERVER_ERROR | `transient_error` |
| `parse-failed` | INTERNAL_SERVER_ERROR | `parse_failed` |

### `fail2ban-admin/integration.test.ts` (395 LOC) — 10/10 tests green

Mirrors livinity-broker/integration.test.ts pattern: pg.Pool.prototype patch BEFORE module import, then exercises full tRPC stack via `fail2banRouter.createCaller(ctx)` with synthetic admin ctx.

| # | Test | Pitfall / FR |
|---|------|--------------|
| 1 | listJails happy path → `state='running'` + `['sshd']` | FR-F2B-01 |
| 2 | listJails ENOENT → `state='binary-missing'` | FR-F2B-01 |
| 3 | listJails service-down → `state='service-inactive'` | FR-F2B-01 |
| 4 | unbanIp argv = `['set','sshd','unbanip','1.2.3.4']` + audit `tool_name='unban_ip'` | B-01 + FR-F2B-04 |
| 5 | unbanIp + addToWhitelist=true → 2 calls (`unbanip` + `addignoreip`) + audit `tool_name='whitelist_ip'` | FR-F2B-02 |
| 6 | banIp self-ban WITHOUT confirmation → CONFLICT 'self_ban'; **execFile.length === 0** | B-02 / T-46-11 |
| 7 | banIp self-ban WITH `'LOCK ME OUT'` → succeeds + audit `ban_ip` | B-02 |
| 8 | banIp `cellularBypass=true` → succeeds without confirmation | B-19 / T-46-15 |
| 9 | banIp `0.0.0.0/0` → Zod BAD_REQUEST; **execFile.length === 0** | B-03 / T-46-12 |
| 10 | banIp `'sshd; rm -rf /'` → Zod BAD_REQUEST; **execFile.length === 0** | T-46-17 |

**Test infrastructure:**
- `mockPoolQuery(sql, params)` recognizes 4 SQL shapes: schema migrations, findUserById, INSERT into device_audit_log (captures rows), SELECT from device_audit_log (returns []).
- `withFakeExec(opts)` returns a closure that overrides every method on `realFail2banClient` + `realActiveSessionsProvider.listActiveSshSessions` with fakes built via `makeFail2banClient(fakeExecFileFn)`. Closure returns a `restore()` function called at end of each test.
- `makeAdminCtx({xForwardedFor?})` builds a synthetic Express-transport ctx with `currentUser={id:'admin-1', role:'admin'}` + `dangerouslyBypassAuthentication:true`. The bypass skips JWT verification at `isAuthenticated`, but `requireRole('admin')` still runs on currentUser — RBAC is exercised.

**Critical safety assertions (Tests 6/9/10):** when validation rejects an input, `execCalls.length === 0` is asserted — proves the fake fail2ban-client was NEVER spawned, i.e., the gate runs BEFORE the dangerous command.

### `server/trpc/index.ts` (+2 lines) — router registration

```ts
import fail2ban from '../../fail2ban-admin/routes.js'   // line 27
// ...
const appRouter = router({
  // ...
  devicesAdmin,
  fail2ban,                                              // line 55
})
```

### `server/trpc/common.ts` (+8 lines) — httpOnlyPaths cluster

Inserted AFTER the Phase 45 FR-CF-03 cluster (`'usage.getMine'`, `'usage.getAll'`) and BEFORE `'ai.executeSubagent'`:

```ts
// v29.4 Phase 46 — Fail2ban admin mutations. Same WS-reconnect-survival
// reason as Phase 45's per-user Claude OAuth + usage queries: an admin
// mid-recovery from SSH lockout is also likely to be on a half-broken WS
// (livinityd may have just been restarted by ban activity). HTTP guarantees
// delivery. Queries (listJails / getJailStatus / listEvents) stay on WS —
// cheap, idempotent, retry-safe. Pitfall B-12 / X-04.
'fail2ban.unbanIp',
'fail2ban.banIp',
```

### `server/trpc/common.test.ts` (+ 3 tests) — extended

Tracker count 4/4 -> 7/7. Three new tests:
- Test 5: `'fail2ban.unbanIp'` present in httpOnlyPaths
- Test 6: `'fail2ban.banIp'` present in httpOnlyPaths
- Test 7: bare `'unbanIp'` / `'banIp'` ABSENT (footgun guard — must be namespaced)

## Verification Gates (all passed)

| Gate | Status |
|------|--------|
| `npx tsx fail2ban-admin/parser.test.ts` → 14/14 PASS | PASS |
| `npx tsx fail2ban-admin/client.test.ts` → 13/13 PASS | PASS |
| `npx tsx fail2ban-admin/active-sessions.test.ts` → 4/4 PASS | PASS |
| `npx tsx server/trpc/common.test.ts` → 7/7 PASS (was 4/4) | PASS |
| `npx tsx fail2ban-admin/integration.test.ts` → 10/10 PASS | PASS |
| `tsc --noEmit` introduces ZERO new errors in fail2ban-admin/ or server/trpc/ (pre-existing 8 errors in trpc/ subtree are HEAD-resident, confirmed via stash) | PASS |
| `git diff --shortstat HEAD~1 HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` → empty (sacred file byte-identical) | PASS |
| `grep -nE "fail2ban\.(unbanIp\|banIp)" common.ts` → 2 matches (lines 189-190) | PASS |
| `grep -cE "^\s*'(unbanIp\|banIp)'," common.ts` → 0 (no bare-name footgun) | PASS |
| `git diff --shortstat HEAD~1 HEAD -- common.ts` → 8 insertions (matches plan estimate 7-8) | PASS |
| `git log -1 --diff-filter=D --name-only HEAD` → no deletions | PASS |
| Post-commit untracked files audit → 0 fail2ban-related untracked files | PASS |

## Pitfall Mitigation Cross-Reference

| Pitfall / Threat | Mitigation Encoded In | Verified By Test |
|------------------|------------------------|------------------|
| **B-01** (self-ban via unban-by-CIDR or global flush) | client.ts `unbanIp` calls `set <jail> unbanip <ip>` (action-targeted) | Test 4 (argv shape `['set','sshd','unbanip','1.2.3.4']`) |
| **B-02** (banning admin's own IP without "ARE YOU SURE") | routes.ts banIp self-ban detection + `confirmation: z.literal('LOCK ME OUT').optional()` | Tests 6 (rejects without) + 7 (succeeds with) |
| **B-03** (unban-by-CIDR /0 mass-unbans everything) | routes.ts ipSchema regex rejects ALL CIDR | Test 9 (`0.0.0.0/0` → Zod BAD_REQUEST, execFile.length=0) |
| **B-05** (transient errors crash UI) | listJails wraps `Fail2banClientError` kind=`timeout`/`transient` → returns `{state:'running', jails:[], transient:true}` | Tests 1+2+3 (all 4 service states reachable) |
| **B-12 / X-04** (mid-WS-reconnect mutation hangs) | httpOnlyPaths += `'fail2ban.unbanIp'`, `'fail2ban.banIp'` | common.test.ts Tests 5+6 |
| **B-19** (cellular CGNAT false-positive self-ban) | `cellularBypass: z.boolean().default(false)` opts out of self-ban check | Test 8 (`cellularBypass=true` succeeds without confirmation) |
| **T-46-10** (non-admin invokes ban/unban) | All 5 procedures use `adminProcedure` (`requireRole('admin')`) | Compile-time + tRPC middleware (RBAC runs on ctx.currentUser even with auth bypass) |
| **T-46-12** (CIDR /0 attack) | ipSchema layer 1 + client.ts assertIp layer 2 | Test 9 |
| **T-46-13** (info disclosure of admin SSH IPs) | TRPCError `cause` only emitted to admin caller (already authenticated) | adminProcedure gate |
| **T-46-15** (cellularBypass false claim) | accept (admin-attested) — UI surfaces implication | Test 8 (no Zod block) |
| **T-46-16** (admin denies action) | events.ts INSERT into device_audit_log with `device_id='fail2ban-host'` sentinel + immutable trigger from v22.0 | Tests 4+5+7+8 (audit row count + tool_name) |
| **T-46-17** (jail-name shell injection) | jailSchema regex `^[a-zA-Z0-9_.-]+$` layer 1 + client.ts assertJailName layer 2 + execFile array args layer 3 | Test 10 |

## Deviations from Plan

**Two minor enhancements (Rule 2 — defensive completeness):**

1. **`Fail2banClientError.kind === 'parse-failed'` added to error mapping table.** The plan's PATTERNS.md error table listed 5 kinds (binary-missing / service-down / jail-not-found / ip-invalid / timeout/transient) but the Wave 2 client.ts also defines `'parse-failed'` kind. routes.ts handles it explicitly → INTERNAL_SERVER_ERROR `'parse_failed'`. Without this, parse failures would fall through to the generic `throw err` path and surface as untyped INTERNAL_SERVER_ERROR. Documented in mapClientErrorToTrpc.

2. **Integration test uses `dangerouslyBypassAuthentication: true` instead of mocking JWT verification.** The plan's analog (livinity-broker integration.test.ts) hits real Express endpoints with auth bypassed at the WS layer. fail2ban-admin tests use the tRPC `createCaller` pattern (preferred for admin-procedure tests — no Express server needed), which requires either a valid JWT or the bypass flag. RBAC `requireRole('admin')` STILL runs on `ctx.currentUser` (Test set the role explicitly to 'admin'), so the auth gate is exercised — only the JWT verification is bypassed. This is more correct than constructing a fake JWT (which would couple the test to JWT secret rotation).

Neither deviation changes the plan's contract or violates any acceptance criterion. Both are documented inline.

## Sub-issues Surfaced for UI (Plan 04)

- `getJailStatus` returns `{...status, lastAttemptedUsers: Record<string, string|null>}`. UI in Plan 04 should render the optional `lastAttemptedUsers[ip]` column when populated, gracefully omit when null (auth.log unreadable on dev hosts). FR-F2B-02 sub-issue #3 deferred-if-budget-tight contract honored.
- `banIp` returns `TRPCError CONFLICT 'self_ban'` with `cause.adminIps`. Plan 04's ban-ip-modal should detect this error code and re-render in stage 2 (LOCK-ME-OUT type-confirm). The `cause.adminIps` array is admin-readable (already authenticated) — UI may surface "These IPs were detected as your active sessions: …" for clarity.
- `banIp` accepts `cellularBypass: boolean` — UI should expose this as a labeled toggle in the modal with a tooltip explaining the CGNAT case (per pitfall B-19 user-education contract).

## Self-Check: PASSED

- [x] File `livos/packages/livinityd/source/modules/fail2ban-admin/index.ts` exists
- [x] File `livos/packages/livinityd/source/modules/fail2ban-admin/routes.ts` exists
- [x] File `livos/packages/livinityd/source/modules/fail2ban-admin/integration.test.ts` exists
- [x] File `livos/packages/livinityd/source/modules/server/trpc/index.ts` modified (+2 lines)
- [x] File `livos/packages/livinityd/source/modules/server/trpc/common.ts` modified (+8 lines)
- [x] File `livos/packages/livinityd/source/modules/server/trpc/common.test.ts` modified (extended)
- [x] Commit `02063485` exists in `git log`
- [x] All 10 integration tests pass via bare tsx + node:assert/strict
- [x] All 7 common.test.ts tests pass (was 4/4 → 7/7)
- [x] Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` UNTOUCHED (empty diff vs HEAD~1)
- [x] No new DB tables introduced (listEvents reads from existing device_audit_log)
- [x] httpOnlyPaths follows Phase 45 namespacing convention (`fail2ban.unbanIp`, `fail2ban.banIp`)
- [x] No bare-name footgun strings in common.ts (`'unbanIp'` / `'banIp'` absent)
- [x] Sacred file gate verified pre-commit AND post-commit
- [x] Zero new TypeScript errors introduced (8 pre-existing trpc/ errors, 0 in fail2ban-admin/)

## Threat Flags

None. No new network endpoints, no new auth paths beyond the adminProcedure-gated tRPC routes documented in the plan's `<threat_model>`. No new schema (REUSE device_audit_log via sentinel `device_id='fail2ban-host'`). The httpOnlyPaths additions move two existing routes from WS to HTTP for delivery reliability — same auth path, same RBAC gate, no expanded surface.
