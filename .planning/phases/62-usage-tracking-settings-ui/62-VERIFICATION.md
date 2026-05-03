---
phase: 62-usage-tracking-settings-ui
verified: 2026-05-02T00:00:00Z
status: human_needed
score: 9/9 code-verifiable must-haves verified (4 roadmap SCs deferred to Phase 63 live UAT)
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "User sends Anthropic streaming + sync + OpenAI streaming + sync requests through broker → Settings > Usage shows 4 fresh rows with non-zero prompt_tokens + completion_tokens (ROADMAP SC1)"
    addressed_in: "Phase 63"
    evidence: "Phase 63 goal: 'Validate v30.0's broker architecture works end-to-end with real external clients on real Mini PC hardware'. 63-CONTEXT.md explicitly: 'SSH Mini PC: psql ... SELECT * FROM broker_usage ORDER BY created_at DESC LIMIT 5 → fresh rows visible with non-zero tokens + api_key_id populated (Phase 62)'."
  - truth: "User opens Settings > AI Configuration → sees keys with id/label/prefix/created_at/last_used_at/revoked_at columns and can Create / Revoke (ROADMAP SC2)"
    addressed_in: "Phase 63"
    evidence: "63-CONTEXT.md: 'API key = freshly-minted liv_sk_* from Settings > AI Configuration > API Keys (Phase 62 UI)' — live mint workflow gated by Phase 63 UAT battery."
  - truth: "User filters Usage subsection by api_key_id from dropdown → table + 30-day chart show only that key's rows (ROADMAP SC3)"
    addressed_in: "Phase 63"
    evidence: "Phase 63 hand-off in PHASE-SUMMARY: 'Filter by the new key → chart + per-app table show ONLY that key's request' — listed as Phase 63 verification battery item #3."
  - truth: "Admin filters cross-user Usage view by api_key_id → only that key's traffic across all users (ROADMAP SC4)"
    addressed_in: "Phase 63"
    evidence: "Phase 63 verification battery item #7: 'As admin, view View as admin → 4-chip filter (user_id + app_id + model + api_key_id Select); filter by api_key_id, verify only that key's traffic shown across users'."
human_verification:
  - test: "Live broker round-trip with Bearer key (ROADMAP SC1)"
    expected: "After Anthropic + OpenAI streaming + sync requests, broker_usage table has 4 fresh rows with non-zero prompt/completion tokens AND populated api_key_id"
    why_human: "Requires Mini PC deploy of Phase 62 + curl with real Anthropic/OpenAI traffic + psql verification. Routes through capture middleware → bearer middleware → broker → upstream provider — entire chain only exercised live."
  - test: "Settings > AI Configuration UI walkthrough (ROADMAP SC2)"
    expected: "ApiKeysSection renders above UsageSection; Create button opens modal; submitting reveals plaintext ONCE in show-once step with Copy + amber warning; closing dismisses plaintext from React state; Revoke is two-step"
    why_human: "Visual rendering, modal open/close interaction, clipboard write, sonner toast appearance — not programmatically verifiable without browser harness."
  - test: "Filter dropdown UX in UsageSection (ROADMAP SC3)"
    expected: "Select dropdown labeled 'All keys' appears above chart; selecting a key filters chart + per-app table; localStorage persists across reload; revoked keys show '(revoked)' suffix"
    why_human: "Requires live tRPC backend + real broker_usage rows + DOM rendering + localStorage round-trip across page reloads."
  - test: "Admin cross-user filter (ROADMAP SC4)"
    expected: "Admin's Cross-User view 4-chip filter (user_id, app_id, model, api_key_id Select) returns only that key's traffic across all users"
    why_human: "Requires multi-user database state + admin role JWT + visual confirmation that only matching rows render."
---

# Phase 62: E1+E2 Usage Tracking Accuracy + Settings UI Verification Report

**Phase Goal:** Every successful broker completion (Anthropic + OpenAI, streaming + sync) writes a `broker_usage` row attributable to the specific API key used; users have a Settings UI to manage keys and inspect per-key usage breakdowns.

**Verified:** 2026-05-02
**Status:** human_needed (all code-level must-haves PASS; 4 ROADMAP success criteria require Phase 63 live UAT — explicitly deferred)
**Re-verification:** No — initial verification

## Goal Achievement

### Code-Level Must-Haves (Plan Frontmatter)

| #   | Must-Have                                                                                                  | Status     | Evidence                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `broker_usage.api_key_id` UUID column with FK references `api_keys(id)` ON DELETE SET NULL                 | VERIFIED   | `livos/packages/livinityd/source/modules/database/schema.sql:368-373` — DO-block ALTER TABLE ADD COLUMN IF NOT EXISTS, REFERENCES api_keys(id) ON DELETE SET NULL |
| 2   | Partial index on `api_key_id` WHERE NOT NULL                                                              | VERIFIED   | `schema.sql:375-377` — `CREATE INDEX IF NOT EXISTS idx_broker_usage_api_key_id ON broker_usage(api_key_id) WHERE api_key_id IS NOT NULL`                  |
| 3   | `insertUsage` writes 8 columns including `api_key_id`                                                      | VERIFIED   | `usage-tracking/database.ts:51-53` — `INSERT INTO broker_usage (user_id, app_id, api_key_id, model, ...) VALUES ($1..$8)`; column order matches schema    |
| 4   | Capture middleware reads `req.apiKeyId` when `req.authMethod === 'bearer'`                                | VERIFIED   | `capture-middleware.ts:58` — `const apiKeyId = req.authMethod === 'bearer' ? req.apiKeyId ?? null : null` then passed to `insertUsage`                    |
| 5   | tRPC `usage.getMine` accepts `apiKeyId` filter (camelCase)                                                | VERIFIED   | `usage-tracking/routes.ts:36` — `apiKeyId: z.string().uuid().optional()`; line 59 forwards to `queryUsageByUser`                                          |
| 6   | tRPC `usage.getAll` accepts `api_key_id` filter (snake_case) under `adminProcedure`                       | VERIFIED   | `usage-tracking/routes.ts:81,91,101` — `adminProcedure`-gated; `api_key_id: z.string().uuid().optional()`; forwarded as `apiKeyId` to `queryUsageAll`     |
| 7   | `<ApiKeysSection />` mounted above `<UsageSection />` in Settings > AI Configuration (FLAT, no Tabs)      | VERIFIED   | `ai-config.tsx:10` import; `ai-config.tsx:689` `<ApiKeysSection />` directly above `:692 <UsageSection />`; no Tabs wrapper                              |
| 8   | Show-once create modal: two-state input → plaintext + Copy + amber warning + dismiss                     | VERIFIED   | `api-keys-create-modal.tsx:41` `Step = 'input' \| 'show-once'`; lines 122-155 input step; 157-196 show-once with `<TbAlertTriangle/>` amber + Copy + dismiss; cleanup useEffect at 68-75 + handleClose at 77-85 |
| 9   | Filter dropdown wired in `usage-section.tsx` + `admin-cross-user-view.tsx`; localStorage key spelled exactly `livinity:usage:filter:apiKeyId` with SSR guard | VERIFIED   | `usage-section.tsx:140-156` Select; `admin-cross-user-view.tsx:96-112` Select; `use-usage-filter.ts:22` `KEY = 'livinity:usage:filter:apiKeyId'` verbatim; `:26,37` `typeof window === 'undefined'` guards |

**Score:** 9/9 code-level must-haves verified.

### ROADMAP Success Criteria (Live-Behavior)

The 4 ROADMAP success criteria all describe live, observable user-visible behaviors that require: (a) deployed Mini PC running Phase 62 source, (b) real PostgreSQL with applied migration, (c) real broker traffic to upstream Anthropic/OpenAI, (d) browser session against `bruce.livinity.io`. Phase 63 (`63-mandatory-live-verification`) is the explicit phase that owns these UATs.

| #   | ROADMAP SC                                                                          | Status                          | Evidence                                                                                                                              |
| --- | ----------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| SC1 | 4 fresh rows (Anthropic stream/sync + OpenAI stream/sync) with non-zero tokens     | DEFERRED → Phase 63             | 63-CONTEXT.md verification step: "psql ... → fresh rows visible with non-zero tokens + api_key_id populated (Phase 62)"               |
| SC2 | Settings > "API Keys" tab list + Create show-once + Revoke                          | DEFERRED → Phase 63             | 63-CONTEXT.md: "API key = freshly-minted liv_sk_* from Settings > AI Configuration > API Keys (Phase 62 UI)"                          |
| SC3 | User filter by api_key_id → chart + per-app table update                            | DEFERRED → Phase 63             | PHASE-SUMMARY hand-off battery item #3: "Filter by the new key → chart + per-app table show ONLY that key's request"                 |
| SC4 | Admin api_key_id filter → only that key's traffic across users                      | DEFERRED → Phase 63             | PHASE-SUMMARY hand-off battery item #7: admin filter dimension validation                                                             |

### Required Artifacts

| Artifact                                                                                                | Status     | Substantive | Wired      | Notes                                                                                  |
| ------------------------------------------------------------------------------------------------------- | ---------- | ----------- | ---------- | -------------------------------------------------------------------------------------- |
| `livos/packages/livinityd/source/modules/database/schema.sql`                                          | VERIFIED   | YES         | YES        | DO-block ALTER + partial index at lines 361-377                                        |
| `livos/packages/livinityd/source/modules/usage-tracking/database.ts`                                   | VERIFIED   | YES         | YES        | 8-param `insertUsage`; `apiKeyId`-aware `queryUsageByUser` + `queryUsageAll`           |
| `livos/packages/livinityd/source/modules/usage-tracking/capture-middleware.ts`                         | VERIFIED   | YES         | YES        | Reads `req.apiKeyId` at line 58; mounted at server/index.ts:1229                       |
| `livos/packages/livinityd/source/modules/usage-tracking/routes.ts`                                     | VERIFIED   | YES         | YES        | Both `getMineProc` + `getAllProc` accept apiKeyId filters                              |
| `livos/packages/ui/src/routes/settings/_components/api-keys-section.tsx` (181 LOC)                     | VERIFIED   | YES         | YES        | Imported + rendered at `ai-config.tsx:10,689`; uses `trpcReact.apiKeys.list`            |
| `livos/packages/ui/src/routes/settings/_components/api-keys-create-modal.tsx` (200 LOC)                | VERIFIED   | YES         | YES        | Imported + rendered by ApiKeysSection at line 168; two-state Step machine confirmed    |
| `livos/packages/ui/src/routes/settings/_components/api-keys-revoke-modal.tsx` (95 LOC)                 | VERIFIED   | YES         | YES        | Imported + conditionally rendered by ApiKeysSection at lines 170-177                   |
| `livos/packages/ui/src/routes/settings/_components/usage-section.tsx` (filter dropdown added)          | VERIFIED   | YES         | YES        | Select wired at lines 140-156; consumes `useUsageFilter` + `apiKeys.list`              |
| `livos/packages/ui/src/routes/settings/_components/admin-cross-user-view.tsx` (filter chip added)      | VERIFIED   | YES         | YES        | Select wired at lines 96-112; consumes `apiKeys.listAll`                                |
| `livos/packages/ui/src/routes/settings/_components/use-usage-filter.ts`                                | VERIFIED   | YES         | YES        | KEY constant verbatim; SSR guards present                                              |

### Key Link Verification

| From                                          | To                                              | Via                                                                | Status |
| --------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ | ------ |
| `schema.sql` (line 370)                       | `broker_usage.api_key_id` column                | DO-block `ALTER TABLE broker_usage ADD COLUMN IF NOT EXISTS`      | WIRED  |
| `database.ts insertUsage`                     | `broker_usage` 8-column INSERT                  | Parameterized SQL at `database.ts:51-63`                          | WIRED  |
| `capture-middleware.ts recordRow`             | `insertUsage({apiKeyId, ...})`                  | Reads `req.apiKeyId` after Phase 59 bearer middleware sets it     | WIRED  |
| Express middleware mount order                | capture < bearer < broker                       | `server/index.ts:1229,1239,1245`                                  | WIRED  |
| `usage.getMine`/`getAll` Zod inputs           | `queryUsageByUser`/`queryUsageAll` apiKeyId     | `routes.ts:59,101` forward `input?.apiKeyId`/`input?.api_key_id`  | WIRED  |
| `ai-config.tsx`                               | `<ApiKeysSection />` rendered                   | Import at line 10; render at line 689 above `<UsageSection />`    | WIRED  |
| `ApiKeysSection`                              | `<ApiKeysCreateModal>` + `<ApiKeysRevokeModal>` | Lines 168, 170-177 conditional rendering                          | WIRED  |
| `ApiKeysCreateModal.onSuccess`                | Show plaintext + invalidate list cache          | Lines 50-63 setPlaintext + setStep + utils.apiKeys.list.invalidate | WIRED  |
| `usage-section.tsx` Select                    | `useUsageFilter` localStorage                   | Lines 63 hook + 140-156 Select; KEY at use-usage-filter.ts:22     | WIRED  |
| `admin-cross-user-view.tsx` Select            | `apiKeys.listAll` + tRPC `getAll`               | Lines 48 listAll query + 54 forwards api_key_id to getAll         | WIRED  |

### Data-Flow Trace (Level 4)

| Artifact                       | Data Variable          | Source                                   | Real Data | Status     |
| ------------------------------ | ---------------------- | ---------------------------------------- | --------- | ---------- |
| `ApiKeysSection`               | `listQ.data`           | `trpcReact.apiKeys.list.useQuery()` → Phase 59 router → `apiKeys` table | YES (Phase 59 contract) | FLOWING |
| `usage-section.tsx`            | `query.data` + `keysQ.data` | `usage.getMine` + `apiKeys.list` (real DB queries) | YES | FLOWING |
| `admin-cross-user-view.tsx`    | `query.data` + `allKeysQ.data` | `usage.getAll` + `apiKeys.listAll` (real DB queries) | YES | FLOWING |
| `capture-middleware`           | `apiKeyId`             | `req.apiKeyId` set by Phase 59 bearer middleware | YES (live request only) | FLOWING (per source) — live confirmation deferred to Phase 63 |

### Behavioral Spot-Checks

| Behavior                                    | Command                                                     | Result                  | Status |
| ------------------------------------------- | ----------------------------------------------------------- | ----------------------- | ------ |
| Sacred SHA D-30-07 unchanged                | `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | PASS — byte-identical to D-30-07 lock |
| Mount order capture < bearer < broker       | grep server/index.ts                                        | Lines 1229 < 1239 < 1245 | PASS |
| localStorage key verbatim                   | grep `'livinity:usage:filter:apiKeyId'`                     | Found at `use-usage-filter.ts:22` | PASS |
| No Tabs wrapper introduced in ai-config     | grep `Tabs\|TabsContent\|TabsTrigger` in ai-config.tsx     | 0 matches               | PASS |
| Idempotent ALTER pattern in schema.sql      | grep `ADD COLUMN IF NOT EXISTS api_key_id`                  | Found at line 371       | PASS |
| Phase 62 commits exist on master            | git log --oneline -- usage-tracking/ + ApiKeysSection      | `434967c0`, `fd0a75a6`, `54e7289d`, `39527673`, `8d151c84`, `ec44608c`, `fd7ba777`, `9ecc7545`, `f1cfa8f4` (9 work commits) | PASS |

### Requirements Coverage

| Requirement       | Source Plan      | Description                                                                                       | Status     | Evidence                                                                                              |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| FR-BROKER-E1-01   | 62-01            | `broker_usage.api_key_id` nullable column referencing `api_keys(id)`; backward-compat NULL       | SATISFIED  | schema.sql:368-373; insertUsage 8-param; 5 schema-migration tests GREEN                                |
| FR-BROKER-E1-02   | 62-02            | Capture middleware writes `apiKeyId` from `req.apiKeyId` when `authMethod === 'bearer'`           | SATISFIED  | capture-middleware.ts:58; 8/8 capture-middleware tests GREEN (incl. 2 new)                             |
| FR-BROKER-E1-03   | 62-02 + 62-05    | OpenAI streaming integration test → `broker_usage` row with non-zero `prompt_tokens` + tokens    | SATISFIED  | integration.test.ts FR-BROKER-E1-03 GREEN; pinned by Plan 05                                           |
| FR-BROKER-E2-01   | 62-04            | Settings "API Keys" surface lists keys + Create show-once + Revoke                                | SATISFIED  | ApiKeysSection (181 LOC) + Create modal (200 LOC two-state) + Revoke modal (95 LOC two-step); 23/23 tests GREEN |
| FR-BROKER-E2-02   | 62-03 + 62-05    | tRPC accepts apiKeyId/api_key_id filter; UI dropdowns wired with localStorage persistence         | SATISFIED  | routes.ts:36,91; usage-section.tsx:140-156; admin-cross-user-view.tsx:96-112; 27 GREEN tests           |

**5/5 requirements satisfied at code level.**

### Anti-Patterns Found

None. Grep for TODO/FIXME/XXX/HACK/placeholder returned ONLY:
- 1 legitimate `placeholder=` HTML attribute on Input field
- 4 legitimate `<SelectValue placeholder='All keys'>` Select prop usages
- 3 legitimate `placeholder` attributes on text Input filters
- 1 documentation comment about "$N placeholder" (parameterized SQL)

No code-level stubs, no empty `return null` in production paths, no `console.log`-only handlers, no hardcoded empty arrays in render paths.

### Human Verification Required

The 4 ROADMAP success criteria all describe live observable behaviors that require Mini PC deploy + real broker traffic + browser session. Per Phase 63 plan, these are the explicit Phase 63 verification battery items 1, 2, 3, and 7. They cannot be verified at code-review level without:

1. Live broker round-trip (curl Anthropic + OpenAI streaming + sync against `https://api.livinity.io`) → SSH Mini PC psql to confirm 4 rows with non-zero tokens + populated `api_key_id`.
2. Browser walkthrough of Settings > AI Configuration → ApiKeysSection visual placement above UsageSection, Create modal show-once flow, Revoke two-step.
3. UsageSection filter dropdown end-to-end: select key → chart + per-app table update; reload page → localStorage restores selection; revoked key shows `(revoked)` suffix.
4. Admin cross-user view filter: 4-chip filter (user_id + app_id + model + api_key_id Select) returns only matching key's traffic.

**These are NOT gaps in Phase 62 — they are the deliberate scope of Phase 63's live verification gate (D-LIVE-VERIFICATION-GATE), which is the next phase in v30.0.**

### Gaps Summary

**No code-level gaps found.** All 9 plan-frontmatter must-haves PASS. All 5 requirements (FR-BROKER-E1-01..03 + E2-01..02) have implementation evidence + GREEN tests. Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical (D-30-07 preserved). No anti-patterns. Mount order correct. localStorage key verbatim. No Tabs wrapper.

The 4 ROADMAP success criteria describe live behaviors deferred to Phase 63 — they are listed under `deferred:` and `human_verification:` rather than `gaps:` because Phase 63 is the named owner of these UATs (verification battery items 1, 2, 3, 7 in PHASE-SUMMARY.md hand-off).

---

_Verified: 2026-05-02_
_Verifier: Claude (gsd-verifier)_
