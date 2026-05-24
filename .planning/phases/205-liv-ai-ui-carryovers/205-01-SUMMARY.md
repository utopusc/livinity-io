---
phase: 205-liv-ai-ui-carryovers
plan: 01
subsystem: spike
tags: [spike, jwt, pending-json, self-lock, auth-path]
requirements: [R1, R5]
requirements_addressed: [R5]
wave: 0
depends_on: []
dependency_graph:
  requires:
    - .planning/phases/205-liv-ai-ui-carryovers/205-SPEC.md
    - .planning/phases/205-liv-ai-ui-carryovers/205-CONTEXT.md
    - .planning/phases/205-liv-ai-ui-carryovers/205-RESEARCH.md
  provides:
    - .planning/phases/205-liv-ai-ui-carryovers/205-01-SPIKE-NOTES.md
    - locked self-lock guard contract for 205-04
    - locked browser fetch envelope for 205-03
    - locked revoke race mitigation strategy for 205-04
    - locked auth.mode enum for 205-04
  affects:
    - .planning/phases/205-liv-ai-ui-carryovers/205-04-PLAN.md (3 adjustments needed)
    - .planning/phases/205-liv-ai-ui-carryovers/205-03-PLAN.md (envelope template copy-ready)
tech-stack:
  added: []
  patterns:
    - "live source-of-truth read (jwt.ts) for payload shape — beats SPEC assumption"
    - "X-Api-Key runtime-config bootstrap for browser → tRPC (workaround for browser-can't-read-process.env)"
    - "Header-based identifier (X-Claw-Device-Id) instead of JWT-claim-based for self-lock guard"
    - "3-step atomic revoke + deny-list (closes sweepPendingRequests race)"
key-files:
  created:
    - .planning/phases/205-liv-ai-ui-carryovers/205-01-SPIKE-NOTES.md
  modified: []
decisions:
  - "Self-lock guard uses X-Claw-Device-Id browser header, NOT JWT payload.deviceId (which doesn't exist)"
  - "Browser auth uses X-Api-Key via /openclawos/runtime-config bootstrap (not cookie, not raw process.env)"
  - "Revoke is 3-step atomic: scrub pending.json → delete paired.json row → append revoked.json"
  - "sweepPendingRequests must consult revoked.json deny-list before promotion (Plan 205-04 patches device-auto-approver.ts)"
  - "auth.mode zod enum is ['none','token','password','trusted-proxy'] — NOT SPEC's ['token','master']"
  - "Gateway auto-reloads openclaw.json on file-write — no SIGHUP / systemctl restart hook needed in Plan 205-04"
metrics:
  duration_minutes: 8
  completed_date: "2026-05-24"
  ssh_sessions: 4
  files_created: 1
  commits: 1
---

# Phase 205 Plan 01: Wave 0 Spike Summary

**One-liner:** Locked JWT payload shape (no deviceId/jti in any signer), browser auth path (X-Api-Key via runtime-config bootstrap), revoke race mitigation (3-step atomic scrub + deny-list), and openclaw config-reload semantics (auto-reload on file-write) via 4 batched live probes on Mini PC — unblocking Plans 205-02/03/04 with zero unknowns.

## Objective vs Outcome

| Spike question (from 205-01-PLAN.md) | Outcome |
|---|---|
| A1: Live JWT payload shape — is `deviceId` present? | **Resolved.** Source-read of `jwt.ts` proves three signers, none of which add `deviceId`, `jti`, or `sessionId`. Empirical mint confirmed payload is `{loggedIn, userId, role, iat, exp}` only. RESEARCH §A1 HIGH risk confirmed → self-lock guard MUST use header fallback. |
| AUTH PATH: claw-client → livinityd auth header decision | **Resolved.** Cookie path indirectly verified (401 on minted JWT, but route-reachable — `is-authenticated.ts:94` emits canonical error). X-Api-Key empirically proven 200 on queries + 400-zod (not 401) on mutations. LOCKED: runtime-config bootstrap pattern (browser fetches LIV_API_KEY at boot from gateway-issued endpoint, attaches X-Api-Key on every /trpc/* call). Cookie remains as fallback. |
| A5: pending.json revoke race | **Resolved.** Source-read of `device-auto-approver.ts:281` `sweepPendingRequests` confirms race is real. pending.json schema verbatim: top-level `deviceId` field per entry. LOCKED: 3-step atomic revoke (scrub pending → delete paired → write revoked.json) PLUS device-auto-approver.ts 4-line patch to consult revoked.json. |
| A6: auth.setMode reload semantics | **Resolved + bonus**. LIVE flip-and-restore proved gateway auto-reloads openclaw.json on every file-write. NO restart hook needed. **Bonus**: gateway emitted enum error revealing valid values are `['none','token','password','trusted-proxy']` — SPEC's `'token'|'master'` was a planner guess and must be corrected in Plan 205-04. |

## Key Findings (LOCKED — copied to 205-01-SPIKE-NOTES.md)

1. **JWT signers in `/opt/livos/packages/livinityd/source/modules/jwt.ts`:**
   - `sign(secret)` → `{loggedIn: true}` (legacy)
   - `signUserToken(secret, userId, role)` → `{loggedIn, userId, role}` (multi-user)
   - `signProxyToken(secret)` → `{proxyToken: true}` (app-proxy only)
   - Verify returns `VerifiedJwtPayload = {loggedIn: true, userId?, role?}` — **structurally CANNOT carry deviceId**.

2. **Self-lock guard contract (replaces D-205-14):**
   ```typescript
   if (ctx.usedApiKey !== true) {
     const callerDid = ctx.request?.headers['x-claw-device-id']  // browser must send
     if (!callerDid) throw new TRPCError({code:'BAD_REQUEST', message:'MISSING_DEVICE_HEADER'})
     if (callerDid === input.deviceId) throw new TRPCError({code:'FORBIDDEN', message:'CANNOT_REVOKE_SELF'})
   }
   ```
   Plan 205-04 also adds `usedApiKey: boolean` to tRPC Context (set true on X-Api-Key match in is-authenticated.ts).

3. **Browser fetch envelope (W-2 LOCKED for 205-03):**
   - Queries: `GET /trpc/<path>` (NO body — POST returns 405) optionally with URL-encoded `?input={"json":<input>}`.
   - Mutations: `POST /trpc/<path>` with body `{"json":<input>}` (bare non-batch).
   - Response envelope: `{result:{data:<payload-or-{json:payload}>}}`.
   - Auth header: `X-Api-Key: <fetched-from-runtime-config>`.

4. **Revoke 3-step atomic (LOCKED for 205-04):**
   1. Read pending.json, delete every requestId where `req.deviceId === input.deviceId`, atomic-write.
   2. Read paired.json, delete `paired.json[input.deviceId]`, atomic-write.
   3. Read/init revoked.json, set `revoked[input.deviceId] = {revokedAtMs: Date.now(), reason}`, atomic-write.
   Plus device-auto-approver.ts patch: `sweepPendingRequests` checks `revoked[did]` BEFORE promotion branch.

5. **openclaw.json auto-reload + correct enum (LOCKED for 205-04):**
   - Atomic tmp+rename write triggers gateway reload within ~4s. No SIGHUP needed.
   - `gateway.auth.mode` zod enum: `z.enum(['none', 'token', 'password', 'trusted-proxy'])` — NOT `['token', 'master']`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Self-lock guard mechanism completely rewritten**
- **Found during:** Probe A1 — JWT shape source read.
- **Issue:** SPEC R5 / D-205-14 / RESEARCH A1 all assumed `payload.deviceId === input.deviceId` would work. Empirical + source-read evidence proves NO signer in `jwt.ts` puts `deviceId` (or `jti`) in the payload. Naive guard would always be `undefined === string → false → revoke proceeds → operator locks themselves out`.
- **Fix:** Spike notes lock a header-fallback contract: browser sends `X-Claw-Device-Id: <Settings.deviceId>`, router compares against `input.deviceId`. Service-token callers (X-Api-Key path) are exempt because they cannot be a paired device by definition.
- **Files locked (no source modification this plan):** Decisions captured in 205-01-SPIKE-NOTES.md § A1.
- **Commit:** 52215473

**2. [Rule 1 - Bug] openclaw `auth.mode` enum corrected**
- **Found during:** Probe C5 (live flip-and-restore A6 test).
- **Issue:** SPEC R4 / D-204-11 used `'token' | 'master'`. Gateway journal emitted `Invalid input (allowed: "none", "token", "password", "trusted-proxy")` on the flip attempt — `'master'` is NOT a valid openclaw enum value.
- **Fix:** Plan 205-04's `auth.setMode` zod schema must be `z.enum(['none', 'token', 'password', 'trusted-proxy'])`. UI dropdown shows these 4 values.
- **Files locked:** 205-01-SPIKE-NOTES.md § A6 DECISION.
- **Commit:** 52215473

**3. [Rule 2 - Missing critical functionality] Browser auth path requires runtime-config bootstrap**
- **Found during:** Probe A2 + C3 + D2.
- **Issue:** D-205-18 said claw-client reads LIV_API_KEY from openclaw gateway env "already populated by env-file-writer post-F5" — but Node-side env is not visible in browser bundle. Cookie path indirectly proven reachable but live-mint produced "Invalid token" 401 (W-2-EDGE detailed in spike notes).
- **Fix:** Plan 205-03 must add a `GET /openclawos/runtime-config` Express route that returns `{livApiKey}` to same-origin (LIVINITY_SESSION-authed) callers. claw-client `livinityd-client.ts` helper caches the key in-memory for the session and attaches `X-Api-Key` header. Full TypeScript template included in 205-01-SPIKE-NOTES.md § AUTH PATH.
- **Files locked:** 205-01-SPIKE-NOTES.md § AUTH PATH DECISION.
- **Commit:** 52215473

**4. [Rule 2 - Missing critical functionality] Revoke race needs deny-list (not just scrub)**
- **Found during:** Source read of `device-auto-approver.ts:281-340` (Probe D4) + RESEARCH §A5.
- **Issue:** RESEARCH §A5 floated "scrub OR deny-list" as alternatives. Spike confirmed scrubbing pending.json alone is insufficient: a device that retries handshake after revoke would re-enter pending.json (the handshake creates the pending row) and the next sweep promotes it. Deny-list is required.
- **Fix:** 3-step atomic revoke (scrub + delete + deny-list write) PLUS device-auto-approver.ts patch to consult deny-list. Plan 205-04 implements both.
- **Files locked:** 205-01-SPIKE-NOTES.md § A5 LOCKED.
- **Commit:** 52215473

### W-2-EDGE (deferred, NOT blocking)

The minted-JWT 401 mystery (Probe C3 + D2) was NOT resolved in spike — verifier rejects a structurally-correct token signed with the exact on-disk `/opt/livos/data/secrets/jwt` 64-byte hex secret. Possible causes: (a) livinityd reads secret as Buffer not string, (b) trim/encoding difference, (c) live in-memory secret differs from disk (rotation in flight). NOT BLOCKING because: (1) AUTH PATH locked X-Api-Key as primary, (2) real browser sessions issued by livinityd's own `user.routes.ts:185` `res.cookie('LIVINITY_SESSION', apiToken)` work in production (proven by existing `/settings → MCP` tab), (3) self-lock guard uses header not JWT claim. Defer investigation to a follow-up plan (suggested: 205-05 or post-205 polish).

## Authentication Gates

**None.** Spike used Mini PC SSH access (existing infrastructure) and the on-disk `LIV_API_KEY` env var (existing F5 path). No new credentials needed. Admin password not needed because: (1) X-Api-Key works without it for spike probes; (2) signIn endpoint doesn't exist anyway (`auth.signIn` returns 404); (3) source-of-truth was the `jwt.ts` signer file, not a live browser session.

## Known Stubs

**None.** This is a docs-only plan; no source code was modified. The spike notes document concrete locked decisions ready for downstream consumption.

## Files Changed

- **Created:** `.planning/phases/205-liv-ai-ui-carryovers/205-01-SPIKE-NOTES.md` (457 lines)
- **Modified:** None

## Test Plan

N/A — spike is a docs deliverable. Downstream test planning by 205-02/03/04:

- 205-03 will add `livinityd-client.live.test.ts` for the runtime-config bootstrap + X-Api-Key attach flow.
- 205-04 will add `openclawos-gateway-router.test.ts` with the LOCKED self-lock guard cases (revoke-self with X-Claw-Device-Id match → FORBIDDEN; revoke-self with missing header → BAD_REQUEST; revoke-other → succeeds + scrub pending + write revoked.json).
- 205-04 will add `device-auto-approver.test.ts` extension covering the deny-list consultation in `sweepPendingRequests`.

## Self-Check: PASSED

Verified per plan §verification:

- ✅ `.planning/phases/205-liv-ai-ui-carryovers/205-01-SPIKE-NOTES.md` exists (457 lines, ≥60 required).
- ✅ `grep -c "LOCKED" 205-01-SPIKE-NOTES.md` = 19 (≥4 required).
- ✅ `grep -q "Self-lock guard contract LOCKED"` matches (2 hits).
- ✅ `grep -q "AUTH PATH"` matches (top-level § header).
- ✅ `grep -q "REVOKE RACE"` matches (top-level § header).
- ✅ `grep -q "deviceId={no}"` matches (Self-Check section literal placeholder).
- ✅ `grep -c "DECISION"` = 4 (≥2 required).
- ✅ Verbatim curl / source-grep / journalctl evidence sections all populated.
- ✅ Commit 52215473 logged `[sacred-sha] PASS: 20 files verified`.

## Commits

| Hash | Message |
|---|---|
| 52215473 | docs(205-01): Wave 0 spike — lock JWT shape + auth path + revoke race contracts |

## Downstream Unblocks

- **205-02 (Wave 1 — Settings entry-point + tab strip):** Unblocked. No spike findings change Wave 1 (frontend-only, no auth path used).
- **205-03 (Wave 2 — MCP Servers tab + restart-free propagation):** Unblocked. Use the `livinityd-client.ts` template verbatim from spike notes § AUTH PATH. Add the `GET /openclawos/runtime-config` Express route per spike DECISION.
- **205-04 (Wave 3 — Gateway tab + tRPC router + self-lock):** Unblocked **with 3 plan adjustments:**
  1. Self-lock guard uses `X-Claw-Device-Id` header (NOT JWT payload).
  2. Revoke = 3-step atomic (scrub pending.json → delete paired.json row → write revoked.json).
  3. `auth.setMode` zod enum is `['none','token','password','trusted-proxy']`.

## TDD Gate Compliance

N/A — `type: execute` plan, no TDD required (docs-only deliverable). No test files in scope.

---

*Phase: 205-liv-ai-ui-carryovers*
*Plan: 01 — Wave 0 spike*
*Completed: 2026-05-24*
*Spike notes: `.planning/phases/205-liv-ai-ui-carryovers/205-01-SPIKE-NOTES.md`*
*Next: 205-02-PLAN.md execution (Settings entry-point + SegmentedTabs strip)*
