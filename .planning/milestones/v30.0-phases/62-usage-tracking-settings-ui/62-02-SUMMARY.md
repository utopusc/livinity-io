---
phase: 62-usage-tracking-settings-ui
plan: 02
subsystem: usage-tracking

tags: [capture-middleware, express, bearer-auth, broker-usage, tdd-green, surgical-edit]

requires:
  - phase: 62-usage-tracking-settings-ui
    plan: 01
    provides: UsageInsertInput.apiKeyId field + 8-param insertUsage + Wave 0 RED tests (E1-02 x2 + E1-03 capture leg)
  - phase: 59-bearer-token-auth
    plan: 03
    provides: Bearer middleware sets req.authMethod='bearer' and req.apiKeyId=<uuid> (Express.Request module augmentation)
provides:
  - capture-middleware.ts recordRow that reads req.apiKeyId at response time
  - Per-request api_key_id propagation from Bearer auth to broker_usage INSERT
  - Backward-compat: legacy URL-path traffic (req.authMethod undefined) → apiKeyId: null
  - 3 RED tests now GREEN: FR-BROKER-E1-02 (bearer leg), FR-BROKER-E1-02 (url-path leg), FR-BROKER-E1-03 (capture leg)
affects:
  - 62-03-usage-router-filter (api_key_id rows now exist for filter dropdown queries to surface)
  - 62-04-settings-ui (UI dropdown can now group/filter usage rows by api_key_id)
  - 62-05-integration (E2E flow can attribute broker requests to specific keys)

tech-stack:
  added: []
  patterns:
    - "Closure captures req at request-time; recordRow reads req.apiKeyId at response-time after Phase 59 bearer middleware has populated it"
    - "Explicit ternary coercion of undefined→null for non-bearer paths (matches insertUsage's `string | null` contract)"
    - "Mount-order dependency: capture (1229) < bearer (1239) < broker (1245) — capture installs patches at request-time; closure fires after bearer has run"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/usage-tracking/capture-middleware.ts

key-decisions:
  - "Coerce req.apiKeyId via `req.authMethod === 'bearer' ? req.apiKeyId ?? null : null` — explicit guard prevents spoofing if a future middleware sets req.apiKeyId without authMethod (T-62-07 mitigation)"
  - "No new module augmentation in capture-middleware.ts — reuses Phase 59's `declare global { namespace Express { interface Request { ... } } }` from bearer-auth.ts:54-63 (single source of truth)"
  - "Comment explicitly documents the mount-order subtlety so future maintainers don't 'fix' the perceived race by reordering mounts"

patterns-established:
  - "Surgical recordRow extension as the canonical place to attach per-request observability metadata"

requirements-completed:
  - FR-BROKER-E1-02

duration: 2 min
completed: 2026-05-03
---

# Phase 62 Plan 02: Capture Middleware Bearer Propagation Summary

**Surgical 7-line addition to `recordRow` in capture-middleware.ts: read `req.apiKeyId` set by Phase 59's bearer middleware at response time and pass it to `insertUsage`. Closes 3 RED tests handed off from Plan 01 (E1-02 ×2 + E1-03 capture leg).**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-03T07:09:56Z
- **Completed:** 2026-05-03T07:11:30Z
- **Tasks:** 1/1
- **Files modified:** 1

## Accomplishments

- **FR-BROKER-E1-02 satisfied** — Bearer-authenticated broker requests now write `broker_usage.api_key_id = <resolved uuid>`. URL-path-authenticated requests continue writing `NULL` (backward-compat preserved).
- **3 RED → GREEN** — All three Wave 0 RED tests Plan 01 handed off are now passing.
- **Zero regressions** — All 43 usage-tracking tests pass (was 40 GREEN + 3 RED in Plan 01).
- **Sacred file untouched** — SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` matches start.
- **D-NO-NEW-DEPS clean** — zero `package.json` edits.

## Task Commits

1. **Task 1: Extend recordRow to capture req.apiKeyId at response time** — `54e7289d` (feat)

## Files Modified

### capture-middleware.ts diff (recordRow body, lines 48-74)

```diff
 const recordRow = async (parsed: ParsedUsage | null): Promise<void> => {
   if (!parsed || captured) return
   captured = true
   try {
     const appId = await resolveAppIdFromIp(remoteIp)
+    // Phase 62 FR-BROKER-E1-02 — read apiKeyId set by Phase 59 bearer middleware.
+    // Mount order: capture < bearer < broker; bearer runs BEFORE res.end fires
+    // recordRow, so req.apiKeyId IS set here when authMethod === 'bearer'.
+    // Explicit coercion: legacy URL-path traffic has req.apiKeyId === undefined
+    // but insertUsage's UsageInsertInput types apiKeyId as `string | null`.
+    const apiKeyId = req.authMethod === 'bearer' ? req.apiKeyId ?? null : null
     await insertUsage({
       userId,
       appId,
+      apiKeyId,
       model: parsed.model ?? 'unknown',
       promptTokens: parsed.prompt_tokens,
       completionTokens: parsed.completion_tokens,
       requestId: parsed.request_id,
       endpoint: parsed.endpoint,
     })
   } catch (err) {
     livinityd.logger.verbose(
       `[usage-tracking] insertUsage failed (non-fatal): ${(err as Error).message}`,
     )
   }
 }
```

7 net insertions: 5 comment lines + 1 `apiKeyId` resolution line + 1 `apiKeyId,` field in the call. No imports added (Phase 59's global module augmentation already types `req.authMethod` and `req.apiKeyId`).

### Test Outcomes (capture-middleware.test.ts — 8/8 GREEN)

| Test | Status | Notes |
|------|--------|-------|
| T1 — sync Anthropic res.json triggers insertUsage | GREEN | Phase 44 baseline |
| T2 — SSE Anthropic stream calls insertUsage at res.end | GREEN | Phase 44 baseline |
| T3 — status 429 res.json triggers throttled row | GREEN | Phase 44 baseline (verifies recordRow's 429 fallthrough still works with apiKeyId reading) |
| T4 — malformed body (no usage) does NOT call insertUsage | GREEN | Phase 44 baseline |
| T5 — middleware skips when req.params.userId missing | GREEN | Phase 44 baseline |
| T6 — sync OpenAI chat-completions response triggers insertUsage | GREEN | Phase 44 baseline |
| **FR-BROKER-E1-02: bearer auth → apiKeyId propagated** | **GREEN (NEW)** | Plan 01 RED → Plan 02 GREEN |
| **FR-BROKER-E1-02: url-path auth → apiKeyId is null** | **GREEN (NEW)** | Plan 01 RED → Plan 02 GREEN |

### Bonus E1-03 GREEN (integration.test.ts — 6/6 GREEN)

`FR-BROKER-E1-03: OpenAI streaming writes broker_usage row with non-zero prompt_tokens AND api_key_id set` was Plan 01-handoff RED owned by Plans 62-02 + 62-05. The "apiKeyId leg" of E1-03 is satisfied by this plan's capture-middleware change (the integration test exercises the same recordRow with bearer auth). The "non-zero prompt_tokens leg" was already wired by v29.5 commit `2518cf91` upstream, so the test goes fully GREEN here. Plan 62-05 will add additional broker streaming verifications.

### Mount-order verification (server/index.ts)

```
46: import {mountBrokerRoutes} from '../livinity-broker/index.js'
47: import {mountUsageCaptureMiddleware} from '../usage-tracking/index.js'
48: import {mountBearerAuthMiddleware} from '../api-keys/bearer-auth.js'

1229: mountUsageCaptureMiddleware(this.app, this.livinityd)
1239: mountBearerAuthMiddleware(this.app, this.livinityd, this.livinityd.apiKeyCache)
1245: mountBrokerRoutes(this.app, this.livinityd)
```

Order: **capture (1229) < bearer (1239) < broker (1245)**. Capture's res.json/write/end patches install at request-time (line 1229's middleware runs first, calls next()), but the closure body executes at response-time AFTER bearer middleware has set `req.apiKeyId`. This is the subtlety the comment in recordRow documents.

### Sacred file

```
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b   ← MATCHES expected SHA
```

UNCHANGED start to end of plan.

## Decisions Made

- **Explicit ternary on `req.authMethod === 'bearer'`** — guards against a future middleware accidentally setting `req.apiKeyId` without the corresponding `authMethod = 'bearer'` (T-62-07 spoofing mitigation per plan's threat_model).
- **No new module augmentation** — reused Phase 59's `declare global { namespace Express { interface Request { ... } } }` block at `bearer-auth.ts:54-63`. Single source of truth; capture-middleware.ts has zero new types.
- **Multi-line comment block above the assignment** — captures the mount-order subtlety verbatim (closure semantics + bearer-runs-before-res.end timing) so a future "let's reorder mounts to fix this race" PR is immediately corrected by reading the comment.

## Deviations from Plan

None — plan executed exactly as written. The 7-line edit precisely matches the plan's `<action>` step 2-3 + comment from step 6.

## Issues Encountered

- **Pre-existing typecheck errors** (out of scope per Rule scope boundary): `pnpm --filter livinityd typecheck` reports errors in `user/routes.ts`, `user/user.ts`, `widgets/routes.ts`, `file-store.ts`. None involve files this plan modified. Confirmed via `pnpm --filter livinityd typecheck 2>&1 | grep -iE "capture-middleware|usage-tracking"` returning zero matches. Logged for awareness; not fixed (out of scope).

## Threat Flags

None — this plan introduces no new trust boundaries. Plan's existing threat_model (T-62-05..08) is fully addressed:

| Threat | Mitigation Status |
|--------|-------------------|
| T-62-05 (I — bearer plaintext logging) | GREEN — recordRow reads only `req.apiKeyId` (UUID); grep confirms zero `Bearer ` log lines |
| T-62-06 (T — apiKeyId injection) | ACCEPTED — Phase 59 owns Bearer validation; capture trusts the resolved UUID |
| T-62-07 (S — url-path spoofs as bearer) | GREEN — explicit `req.authMethod === 'bearer'` guard; non-bearer always writes NULL |
| T-62-08 (R — silent NULL writes) | GREEN — Plan 01 RED tests + this plan's GREEN tests double-defense; Phase 59 mount-order.test.ts is the cross-plan guard |

## D-NO-NEW-DEPS Audit

**GREEN.** Zero new dependencies installed; zero `package.json` edits. Only existing `express`, `vitest`, and Phase 59's already-augmented `Request` interface used.

## User Setup Required

None — no external configuration required.

## Hand-off to Wave 2 Plans 03 + 04

- **Plan 62-03 (usage-router-filter):** Wave 1's `queryUsageByUser`/`queryUsageAll` already accept `apiKeyId?` filter (delivered by Plan 01). This plan ensures rows actually exist with non-null `api_key_id` once a Bearer key is used. The router can now expose tRPC inputs that meaningfully filter; without this plan, all rows would have NULL `api_key_id` and the filter would always return empty.
- **Plan 62-04 (UI):** UI dropdown can now display "Filter by API Key" with real per-key rows backing the chart + table.
- **Plan 62-05 (integration E2E):** End-to-end `curl with Bearer → Settings > Usage filtered by key → row appears` flow is now wired end-to-end at the data layer. Plan 05's job is the E2E verification (browser → broker → row → UI) plus the E1-03 streaming-token leg (separate from the apiKeyId leg this plan greened).

**Sacred SHA invariant:** `nexus/packages/core/src/sdk-agent-runner.ts` = `4f868d318abff71f8c8bfbcf443b2393a553018b` at end of plan.

## Self-Check: PASSED

- `livos/packages/livinityd/source/modules/usage-tracking/capture-middleware.ts` modified (verified via `git diff --stat`)
- Commit `54e7289d` found in `git log --oneline -1`
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` verified at end of plan
- All 43 usage-tracking tests GREEN; 0 regressions

---
*Phase: 62-usage-tracking-settings-ui*
*Completed: 2026-05-03*
