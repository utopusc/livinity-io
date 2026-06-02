---
phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-
plan: 06
subsystem: api
tags: [trpc, authorization, rbac, vnc, computer-use, stride, tdd, vitest]

# Dependency graph
requires:
  - phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-
    provides: "displays.getVncUrl tRPC mutation + owner-scoped gate (254-01); :1 host display registered with EMPTY owner_session (254-05)"
provides:
  - "Exported pure canAccessDisplay({ownerSession, callerSession, callerRole}) authorization predicate"
  - "Admin-role bypass in getVncUrl so the single-tenant Mini PC operator (admin) can reach MCP-created displays (owner_session='bruce') despite the UUID-vs-luse-id mismatch"
  - "Preserved multi-user isolation: a non-admin member/guest is STILL FORBIDDEN from a foreign non-empty owner_session"
  - "Preserved shared path: empty owner_session readable by any authenticated user"
affects: [254 live-VNC display window operator UAT, future getVncUrl/displays authz work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extract authorization decision into a PURE exported predicate so the authz matrix is unit-testable without a full tRPC caller harness (mirrors config-router extract-and-test pattern)"
    - "Admin-role bypass scoped to role==='admin' ONLY — documented as a deliberate STRIDE-I (T-254-01) amendment, isolation preserved for non-admins"

key-files:
  created:
    - livos/packages/livinityd/source/modules/computer-use/__tests__/trpc-router-authz.test.ts
  modified:
    - livos/packages/livinityd/source/modules/computer-use/trpc-router.ts

key-decisions:
  - "CR-01 Option A: admin-role caller BYPASSES the owner-session check (single-tenant operator is admin); non-admins keep id===owner_session isolation"
  - "Predicate compares record.owner_session already in hand from dm.list() — removed the redundant dm.isOwner round-trip (incidentally resolves WR-01's double-list concern)"
  - "Read caller role as ctx.currentUser?.role ?? 'member' (default to least-privileged non-guest if somehow absent, matching CR-01 Option A)"

patterns-established:
  - "Pure exported authz predicate (canAccessDisplay) unit-tested directly via vitest matrix — no tRPC caller harness"

requirements-completed: [GOAL-254-VNC-RESOLVE]

# Metrics
duration: 6 min
completed: 2026-06-02
---

# Phase 254 Plan 06: Admin-bypass authorization for getVncUrl (Gap 2 / CR-01) Summary

**Extracted a pure `canAccessDisplay` predicate and added an admin-role bypass to `getVncUrl` so the single-tenant Mini PC operator (an admin) can resolve VNC ws URLs for MCP-created displays (owner_session='bruce') that the UUID-vs-luse-id comparison was wrongly FORBIDDING — while non-admin isolation and the shared-display path are preserved.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-02T11:13:00Z (approx.)
- **Completed:** 2026-06-02T11:19:27Z
- **Tasks:** 2 (Task 1 TDD: RED + GREEN; Task 2: wire-in)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Closed Gap 2 (CR-01): the headline VNC feature is reachable again for the admin operator. Previously `getVncUrl` compared `ctx.currentUser.id` (a PostgreSQL UUID) against a display's `owner_session` (a luse session string like 'bruce'); these never match, so EVERY MCP-created display returned FORBIDDEN to the UI.
- Added an exported pure predicate `canAccessDisplay({ownerSession, callerSession, callerRole})`: empty owner_session → any authenticated caller; `callerRole==='admin'` → bypass; `callerSession===ownerSession` → legitimate owner; else FORBIDDEN.
- Wired the predicate into `getVncUrl` using `record.owner_session` already fetched from `dm.list()`, removing the redundant `dm.isOwner` round-trip.
- Amended the router's top STRIDE comment block (T-254-01 amended) to document the deliberate admin bypass and why it does not loosen multi-user isolation.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): add failing authz matrix** - `6510e67f` (test)
2. **Task 1 (GREEN): add pure canAccessDisplay predicate** - `e2396bc7` (feat)
3. **Task 2: wire canAccessDisplay admin-bypass into getVncUrl + amend STRIDE comment** - `3309b1b4` (fix)

**Plan metadata:** (this SUMMARY) — `docs(254-06)`

_TDD gate sequence: RED (`6510e67f` test) precedes GREEN (`e2396bc7` feat) — gate honored. No REFACTOR needed (GREEN implementation was minimal and clean)._

## Files Created/Modified
- `livos/packages/livinityd/source/modules/computer-use/__tests__/trpc-router-authz.test.ts` - vitest covering the 5-case admin-bypass / owner / shared authorization matrix (imports the pure predicate, no tRPC caller harness).
- `livos/packages/livinityd/source/modules/computer-use/trpc-router.ts` - added the exported `canAccessDisplay` predicate; replaced the broken id-vs-owner_session gate in `getVncUrl` with a call to it; amended the top STRIDE comment block.

## Authorization Matrix (verified GREEN)

| callerRole | ownerSession | callerSession | result | meaning |
|------------|--------------|---------------|--------|---------|
| guest      | '' (empty)   | anyone        | ALLOW  | host/shared — any authenticated caller |
| admin      | 'bruce'      | some-uuid     | ALLOW  | admin bypass — operator on MCP-created display |
| member     | 'bruce'      | 'bruce'       | ALLOW  | owner match — non-admin reaches own display |
| member     | 'bruce'      | some-uuid     | FORBID | non-admin, not owner — isolation preserved |
| guest      | 'bruce'      | some-uuid     | FORBID | guest, foreign owned display — isolation preserved |

## Decisions Made
- **CR-01 Option A (admin bypass)** chosen over re-mapping the luse id ↔ UI UUID. The single-tenant Mini PC operator IS admin, so a role-scoped bypass restores the feature with the smallest, most auditable change while leaving multi-user isolation intact.
- **Removed the `dm.isOwner` round-trip** inside the gate — `record.owner_session` is already in hand from the `dm.list()` lookup above, so the predicate compares it directly (no extra Redis round-trip).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. RED failed for the right reason (`canAccessDisplay is not a function` — genuine missing export, not an import/syntax error), GREEN passed all 5 cases on first run, and the `tsc --noEmit` grep for `computer-use/trpc-router` printed no errors (zero new errors introduced; the file's only pre-existing baseline is in unrelated modules).

## Security / Threat Model
- **T-254-01 (amended) — mitigate:** admin bypass scoped to `callerRole === 'admin'` ONLY (in `canAccessDisplay`). A non-admin member/guest is STILL FORBIDDEN from a display whose non-empty owner_session is not their own session.
- **T-254-02 — mitigate:** `userId` AND role come from `ctx.currentUser` ONLY (never input); `privateProcedure` gates the route.
- **T-254-03 — mitigate:** the log line emits only `user=` + `display=`, never the wsUrl capability token (unchanged from 254-01).
- **T-254-09 — accept:** role is set server-side by `isAuthenticated` from the verified JWT/DB user record; a client cannot forge it through the tRPC input.

No new threat surface introduced beyond the plan's threat_model.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `getVncUrl` is now reachable for the admin operator on MCP-created displays — the live VNC window (254-03) and the hover strip (254-04) work end-to-end on the Mini PC for admin once deployed.
- Takes effect on next livinityd deploy (these commits are unpushed; same deploy posture as the rest of Phase 254 — tar+scp or update.sh once master is pushed).
- Gap 1 (254-05) + Gap 2 (254-06) close the verification-report gaps for the VNC resolution path.

## Self-Check: PASSED
- `livos/packages/livinityd/source/modules/computer-use/__tests__/trpc-router-authz.test.ts` — FOUND on disk.
- `livos/packages/livinityd/source/modules/computer-use/trpc-router.ts` — FOUND on disk (contains `export function canAccessDisplay` and `canAccessDisplay({` call).
- Commits `6510e67f` (test RED), `e2396bc7` (feat GREEN), `3309b1b4` (fix wire-in) — all FOUND in `git log`.
- 5/5 authz matrix vitest GREEN; tsc introduces zero new errors for `computer-use/trpc-router`.

---
*Phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-*
*Completed: 2026-06-02*
