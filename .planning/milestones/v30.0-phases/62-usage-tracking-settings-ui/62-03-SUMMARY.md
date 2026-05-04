---
phase: 62-usage-tracking-settings-ui
plan: 03
subsystem: usage-tracking

tags: [trpc, zod, usage-tracking, additive-input, tdd-red-green, surgical-edit]

requires:
  - phase: 62-usage-tracking-settings-ui
    plan: 01
    provides: queryUsageByUser/queryUsageAll optional apiKeyId opt + database.ts row attribution
  - phase: 62-usage-tracking-settings-ui
    plan: 02
    provides: capture middleware writes api_key_id rows from req.apiKeyId (so the filter has data to surface)
provides:
  - usage.getMine tRPC input gains optional camelCase apiKeyId UUID (privateProcedure UI ergonomics)
  - usage.getAll tRPC input gains optional snake_case api_key_id UUID (matches user_id/app_id convention)
  - Both routes forward the opt to Plan 01's database helpers as camelCase apiKeyId
  - Zod non-strict default preserves backwards-compat for older UI bundles
  - 2 new GREEN tests asserting apiKeyId forwarding through both routes
affects:
  - 62-04-settings-ui (consumes the new tRPC input fields from the React filter dropdown)
  - 62-05-integration (E2E flow: curl-with-bearer → row written → UI filter surfaces it)

tech-stack:
  added: []
  patterns:
    - "Additive optional Zod field (.optional()) on existing tRPC input — backwards-compat by default"
    - "Field-name asymmetry: camelCase for privateProcedure UI ergonomics; snake_case for getAll matching existing user_id/app_id"
    - "Zod uuid() validation rejects malformed input at the route layer before SQL execution"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/usage-tracking/routes.ts
    - livos/packages/livinityd/source/modules/usage-tracking/routes.test.ts

key-decisions:
  - "Naming asymmetry: getMine uses camelCase apiKeyId (UI ergonomics); getAll uses snake_case api_key_id (matches existing user_id/app_id/model field convention). Both forward to camelCase apiKeyId on Plan 01's database opt — the asymmetry is at the Zod input layer only."
  - "Zod stays non-strict (no .strict()) — RESEARCH.md §Pitfall 2: older UI bundles passing no apiKeyId still validate cleanly. Backwards-compat preserved without fanout edits in client code."
  - "User-scope preserved: getMine still scopes WHERE user_id = ctx.currentUser.id; api_key_id is AND-ed (not OR-ed) at the database layer. T-62-10 cross-user leak prevention is bug-for-bug identical to Plan 01's contract."
  - "adminProcedure middleware gates getAll regardless of input shape — Zod is data validation, not authorization (T-62-12 unchanged)."

patterns-established:
  - "Surgical Zod additive enhancement as the canonical Wave-2 router-extension pattern (10-line diff: +5 input fields, +5 opts forwards/comments)"

requirements-completed:
  - FR-BROKER-E2-02

duration: ~5 min
completed: 2026-05-03
---

# Phase 62 Plan 03: tRPC `usage` Router Filter Forwarding Summary

**Surgical Zod additive: `usage.getMine` accepts optional `apiKeyId` (camelCase) and `usage.getAll` accepts optional `api_key_id` (snake_case); both forward to Plan 01's `queryUsageByUser`/`queryUsageAll` `apiKeyId` opt. 2 RED→GREEN tests confirm the wiring. Sacred SHA unchanged. Backwards-compat preserved (Zod non-strict).**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-03T07:15:33Z
- **Completed:** 2026-05-03T07:18:30Z (approx)
- **Tasks:** 1/1
- **Files modified:** 2

## Accomplishments

- **FR-BROKER-E2-02 satisfied (backend half)** — tRPC routes now accept the apiKeyId filter dimension and forward it to PostgreSQL with proper user-scoping preserved. UI half is now unblocked for Plan 04/05.
- **2 new GREEN tests** — both `FR-BROKER-E2-02: usage.getMine forwards apiKeyId` and `FR-BROKER-E2-02: usage.getAll forwards api_key_id` pass alongside the original 5 Plan 44-03 tests (T1–T5).
- **Zero regressions in usage-tracking suite** — full module: 45/45 GREEN (was 43/43; +2 new tests). All Wave 1 + Wave 2 work intact.
- **Sacred file untouched** — SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` matches start.
- **httpOnlyPaths already correct** — `usage.getMine` and `usage.getAll` are already in `common.ts:181-182`; no edits needed (the tRPC input shape change is transparent to the WS-vs-HTTP routing layer).
- **D-NO-NEW-DEPS clean** — zero `package.json` edits.

## Task Commits

1. **Task 1 (RED): add failing tests for FR-BROKER-E2-02 apiKeyId forwarding** — `39527673` (test)
2. **Task 1 (GREEN): forward apiKeyId/api_key_id from tRPC inputs to query helpers** — `8d151c84` (feat)

## Files Modified

### `routes.ts` diff (key sections)

`sinceInput` (line 28 → lines 28-39):

```diff
-const sinceInput = z.object({since: z.date().optional()}).optional()
+// Phase 62 Plan 03 FR-BROKER-E2-02 — UI filter dropdown can pass an apiKeyId.
+// camelCase here (privateProcedure UI ergonomics); getAll uses snake_case
+// `api_key_id` to match its existing user_id/app_id field convention.
+// Zod stays non-strict (default) so older UI bundles passing no apiKeyId
+// still validate (RESEARCH.md §Pitfall 2 — backwards-compat).
+const sinceInput = z
+	.object({
+		since: z.date().optional(),
+		apiKeyId: z.string().uuid().optional(),
+	})
+	.optional()
```

`getMineProc.query` body (queryUsageByUser call):

```diff
-		const rows: UsageRow[] = await queryUsageByUser({userId, since})
+		const rows: UsageRow[] = await queryUsageByUser({
+			userId,
+			since,
+			apiKeyId: input?.apiKeyId,
+		})
```

`getAllProc.input` Zod object:

```diff
 				model: z.string().optional(),
+				// Phase 62 Plan 03 FR-BROKER-E2-02 — admin filter dimension.
+				// snake_case to match user_id/app_id convention; forwarded as
+				// camelCase apiKeyId to queryUsageAll (Plan 01 contract).
+				api_key_id: z.string().uuid().optional(),
 				since: z.date().optional(),
```

`getAllProc.query` body (queryUsageAll call):

```diff
 		const rows = await queryUsageAll({
 			userId: input?.user_id,
 			appId: input?.app_id,
 			model: input?.model,
+			apiKeyId: input?.api_key_id,
 			since: input?.since,
 		})
```

Total: +21 / -2 in `routes.ts`.

### `routes.test.ts` diff

Two new tests appended after T5 inside the existing `describe('usage router Plan 44-03', ...)` block:

- **`FR-BROKER-E2-02: usage.getMine forwards apiKeyId to queryUsageByUser`** — calls `getMine({apiKeyId: '...0001'})`, asserts `queryUsageByUserMock` was called with `objectContaining({userId: 'user-uuid', since: undefined, apiKeyId: '...0001'})`.
- **`FR-BROKER-E2-02: usage.getAll forwards api_key_id to queryUsageAll`** — calls `getAll({api_key_id: '...0002'})` from an admin caller, asserts `queryUsageAllMock` was called with `objectContaining({apiKeyId: '...0002'})` (snake_case Zod input → camelCase db opt).

Total: +50 / -1 in `routes.test.ts`.

### Test Outcomes (`routes.test.ts` — 7/7 GREEN)

| Test | Status | Notes |
|------|--------|-------|
| T1 — getMine returns expected shape with stats + today_count + banner | GREEN | Plan 44-03 baseline |
| T2 — getMine respects since parameter | GREEN | Plan 44-03 baseline |
| T3 — getAll returns rows + stats for admin caller | GREEN | Plan 44-03 baseline |
| T4 — getAll REJECTS non-admin caller with FORBIDDEN code | GREEN | Plan 44-03 baseline (T-62-12 mitigation) |
| T5 — getMine returns empty shape gracefully when DB layer returns [] | GREEN | Plan 44-03 baseline |
| **FR-BROKER-E2-02: usage.getMine forwards apiKeyId to queryUsageByUser** | **GREEN (NEW)** | RED in commit `39527673`, GREEN in `8d151c84` |
| **FR-BROKER-E2-02: usage.getAll forwards api_key_id to queryUsageAll** | **GREEN (NEW)** | RED in commit `39527673`, GREEN in `8d151c84` |

### Full usage-tracking module: 45/45 GREEN

Includes the 7 routes tests above plus all Plan 01/02 work (database, aggregations, schema-migration, capture-middleware, integration). Zero regressions.

### `httpOnlyPaths` audit

`usage.getMine` (line 181) and `usage.getAll` (line 182) are already in `livos/packages/livinityd/source/modules/server/trpc/common.ts`. The Plan 03 input-shape change is transparent to the WS-vs-HTTP routing layer (Zod runs server-side after the transport decision), so no edits needed.

### Typecheck

```
pnpm --filter livinityd typecheck 2>&1 | grep -iE "usage-tracking" → ZERO matches
```

Pre-existing typecheck noise in `ai/routes.ts`, `skills/`, `widgets/`, `file-store.ts`, `user/` is out-of-scope (Plan 02 SUMMARY already documented this — not introduced by Phase 62, scope-boundary respected per Rule 3 fix-attempt limits).

### Sacred file

```
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b   ← MATCHES expected SHA
```

UNCHANGED start to end of plan.

## Decisions Made

- **Field-name asymmetry (camelCase for getMine, snake_case for getAll)** — matches plan's `<interfaces>` directive and CONTEXT.md naming-convention NOTE. The asymmetry is at the Zod input layer only; both forward to camelCase `apiKeyId` on the database helper. Rationale: getMine is the privateProcedure consumed directly by React UI (`{apiKeyId}` is idiomatic JS); getAll's existing fields are already `user_id`/`app_id`/`model` (snake_case), so adding `api_key_id` next to them keeps the admin shape coherent.
- **Zod non-strict default kept** — RESEARCH.md §Pitfall 2: older UI bundles still in browser cache that send `{since: x}` without `apiKeyId` continue to validate cleanly. `.strict()` would reject them and break in-flight users mid-refresh.
- **Comment-block above each new field** — three-line comments document the cross-route naming asymmetry inline so future maintainers don't "normalize" the field names and break the UI ergonomics or the existing admin convention.
- **No httpOnlyPaths edit** — `usage.*` paths already there from Plan 44-03; transport routing is decided before Zod input parsing, so input-shape changes are transparent.

## Deviations from Plan

None — plan executed exactly as written. The 21-line diff in `routes.ts` and the 50-line test addition in `routes.test.ts` precisely match the plan's `<action>` steps 1-7 and `<behavior>` block. RED → GREEN cycle clean; no auto-fixes invoked.

## Issues Encountered

- **Pre-existing typecheck errors** (out of scope, same as Plan 02): `ai/routes.ts`, `skills/_templates/`, `widgets/routes.ts`, `file-store.ts`, `user/routes.ts`. None involve usage-tracking. Logged for awareness; not fixed (Rule scope-boundary — only fix issues directly caused by current task changes).

## Threat Flags

None — this plan introduces no new trust boundaries. The plan's `<threat_model>` (T-62-09 through T-62-12) is fully addressed:

| Threat | Mitigation Status |
|--------|-------------------|
| T-62-09 (T — apiKeyId injection) | GREEN — `z.string().uuid()` rejects non-UUID at route layer; database.ts uses parameterized $N placeholders (Plan 01) |
| T-62-10 (I — user X reads user Y's usage by passing Y's apiKeyId) | GREEN — getMine still scopes `WHERE user_id = ctx.currentUser.id`; api_key_id AND-ed (not OR-ed) at db layer; even guessed UUIDs return zero rows |
| T-62-11 (T — older UI bundle sends no apiKeyId, .strict() rejects) | GREEN — Zod non-strict default kept; backwards-compat preserved |
| T-62-12 (E — non-admin invokes getAll with api_key_id) | GREEN — adminProcedure middleware gates getAll before resolver runs (verified by existing T4 test still GREEN) |

## D-NO-NEW-DEPS Audit

**GREEN.** Zero new dependencies installed; zero `package.json` edits. Only existing `zod`, `@trpc/server`, `vitest`, and Plan 01's already-extended `database.ts` helpers used.

## User Setup Required

None — no external configuration required. The Zod input change is server-side only; UI consumers (Plan 04) opt in by passing the new fields when ready.

## Hand-off to Plan 62-04 (Settings UI)

Plan 04's React filter dropdown can now invoke:

- **User filter:** `trpc.usage.getMine.useQuery({apiKeyId: selectedKeyId})` — passing `undefined` for `apiKeyId` returns the all-keys default (current behavior).
- **Admin filter:** `trpc.usage.getAll.useQuery({api_key_id: selectedKeyId, ...otherFilters})` — same all-keys default when omitted.

Plan 04 also needs to:
- Add `<Select>` UI component above the chart + per-app table in `usage-subsection.tsx`.
- Persist last-selected filter in `localStorage` (key: `livinity:usage:filter:apiKeyId`) per CONTEXT.md decisions §API Key Filter Dropdown.
- Display options as `name (prefix)` from `apiKeys.list` (and `name (prefix) — owner: <username>` for admin variant from `apiKeys.listAll`).

The tRPC contract is locked. No further router changes anticipated for Phase 62.

**Sacred SHA invariant:** `nexus/packages/core/src/sdk-agent-runner.ts` = `4f868d318abff71f8c8bfbcf443b2393a553018b` at end of plan.

## Self-Check: PASSED

- `livos/packages/livinityd/source/modules/usage-tracking/routes.ts` modified (verified — 21 insertions / 2 deletions; grep finds 8 apiKeyId/api_key_id matches)
- `livos/packages/livinityd/source/modules/usage-tracking/routes.test.ts` modified (verified — 50 insertions / 1 deletion; 2 new FR-BROKER-E2-02 tests)
- Both commits found in `git log --oneline -5`: `39527673` (test) + `8d151c84` (feat)
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` verified at end of plan
- All 45 usage-tracking tests GREEN; 0 regressions
- `httpOnlyPaths` already includes `usage.getMine` + `usage.getAll`

---
*Phase: 62-usage-tracking-settings-ui*
*Completed: 2026-05-03*
