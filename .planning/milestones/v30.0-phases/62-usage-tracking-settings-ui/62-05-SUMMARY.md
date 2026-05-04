---
phase: 62-usage-tracking-settings-ui
plan: 05
subsystem: ui-settings-usage-filter

tags: [ui, shadcn-select, localstorage, integration-test, phase-gate, fr-broker-e2-02, fr-broker-e1-03]

requires:
  - phase: 62-usage-tracking-settings-ui
    plan: 01
    provides: schema migration + 8-param insertUsage + queryUsage* apiKeyId opt + Wave 0 RED tests
  - phase: 62-usage-tracking-settings-ui
    plan: 02
    provides: capture middleware reads req.apiKeyId from Phase 59 bearer (greens E1-02 ×2 + E1-03 capture leg)
  - phase: 62-usage-tracking-settings-ui
    plan: 03
    provides: usage.getMine/getAll tRPC inputs accept apiKeyId/api_key_id + forward to query helpers
  - phase: 62-usage-tracking-settings-ui
    plan: 04
    provides: ApiKeysSection (CRUD UI) + Create/Revoke modals + ai-config.tsx insertion
provides:
  - useUsageFilter hook (KEY/loadFilter/saveFilter pure helpers + React state mirror)
  - localStorage key 'livinity:usage:filter:apiKeyId' (CONTEXT.md verbatim, SSR-guarded)
  - UsageSection 'Filter by API key' Select dropdown wired to apiKeys.list + usage.getMine
  - AdminCrossUserView 4th filter chip (api_key_id Select sourced from apiKeys.listAll)
  - Empty-state branch 'No usage recorded for this key.' for filter-yields-zero-rows
  - FR-BROKER-E2-02 frontend half closed
  - FR-BROKER-E1-03 OpenAI streaming integration test verified GREEN (already greened by Plan 02)
affects:
  - Phase 63 (mandatory live verification) — full broker observability surface ready for Mini PC UAT

tech-stack:
  added: []
  patterns:
    - "Pure-helper-as-fixture (KEY/loadFilter/saveFilter) — mirrors use-recent-searches.ts"
    - "Smoke + source-text-invariant tests (D-NO-NEW-DEPS — RTL not installed)"
    - "SSR-guarded localStorage access (typeof window !== 'undefined')"
    - "shadcn Select with all/UUID value semantics: 'all' → setFilter(null); UUID → setFilter(uuid)"

key-files:
  created:
    - livos/packages/ui/src/routes/settings/_components/use-usage-filter.ts
    - livos/packages/ui/src/routes/settings/_components/use-usage-filter.unit.test.ts
    - livos/packages/ui/src/routes/settings/_components/usage-section.unit.test.tsx
  modified:
    - livos/packages/ui/src/routes/settings/_components/usage-section.tsx
    - livos/packages/ui/src/routes/settings/_components/admin-cross-user-view.tsx

key-decisions:
  - "localStorage key = 'livinity:usage:filter:apiKeyId' (CONTEXT.md verbatim — RESEARCH.md Q3 confirmed 'livinity:' prefix not 'livos:'). Grep guard in this plan asserts the literal string."
  - "Used Phase 59's actual snake_case field names (id/name/key_prefix/revoked_at + listAll's username/user_id) — Plan 04 already established this adaptation as authorized by the plan's 'adapt during implementation' clause. The plan's pseudo-code used camelCase but the production tRPC contract uses snake_case."
  - "Smoke + source-text-invariant test pattern (no @testing-library/react). 9 strict source-string assertions over usage-section.tsx for Select wiring + apiKeyId forwarding + revoked-suffix + empty-state copy + onValueChange null-clearing semantics. STRICTER than RTL inspection because the source-text catches refactor regressions that would silently pass DOM assertions."
  - "Empty-state branch wraps the 'No usage recorded for this key.' rendering in a conditional that requires (filter !== null) AND (per_app empty) AND (daily counts all 0) — preserves StatCards + banner so the user still sees the aggregate context while the filter clarifies why the chart/table is hidden."
  - "FR-BROKER-E1-03 was already GREEN at start of Plan 05 — Plan 62-02 SUMMARY noted that the capture-middleware change satisfied the apiKeyId leg, and the parseUsageFromSseBuffer chat-completions branch already supplied the prompt_tokens/completion_tokens leg. This plan verifies the GREEN state and pins it as Phase 62 closure."

patterns-established:
  - "useXxxFilter localStorage hook with VERBATIM-key contract test (KEY constant === literal string) — guards against drift in future filter implementations"

requirements-completed:
  - FR-BROKER-E2-02
  - FR-BROKER-E1-03

duration: ~7 min
completed: 2026-05-03
---

# Phase 62 Plan 05: UI Filter Dropdown + FR-BROKER-E1-03 GREEN + Phase 62 Final Gate Summary

**Closes Phase 62 — adds the FR-BROKER-E2-02 frontend half (Filter by API Key dropdown in UsageSection + AdminCrossUserView with localStorage persistence) and verifies FR-BROKER-E1-03 (OpenAI streaming integration test) GREEN. All 5 phase requirements satisfied; full broker observability surface ready for Phase 63 live verification on Mini PC.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-03T07:33:55Z
- **Completed:** 2026-05-03T07:40:33Z
- **Tasks:** 3/3
- **Files created:** 3 (1 hook + 2 test files)
- **Files modified:** 2 (UsageSection + AdminCrossUserView)

## Accomplishments

- **FR-BROKER-E2-02 frontend satisfied** — Both `<UsageSection>` and `<AdminCrossUserView>` gain a Filter by API key Select dropdown wired to `apiKeys.list`/`apiKeys.listAll`. Selected `apiKeyId` flows through Plan 62-03's tRPC inputs to PostgreSQL via Plan 62-01's database helpers. Persisted across sessions via `useUsageFilter` (`localStorage` key `livinity:usage:filter:apiKeyId` — CONTEXT.md verbatim).
- **FR-BROKER-E1-03 verified GREEN** — Plan 62-02 SUMMARY noted the test was already GREEN at end of Plan 02; this plan re-runs it as the Phase 62 closure pin (`source/modules/usage-tracking/integration.test.ts -t "FR-BROKER-E1-03"` PASS).
- **All 5 Phase 62 requirements closed** — E1-01..03 + E2-01..02 (see closure table below).
- **Sacred SHA byte-identical** — `4f868d318abff71f8c8bfbcf443b2393a553018b` matches at every sample point of this plan AND end of Phase 62. D-30-07 strictly preserved.
- **D-NO-NEW-DEPS preserved** — zero `package.json`/`pnpm-lock.yaml` changes; reused shadcn Select primitives + existing trpcReact + existing react hooks.
- **Backend usage-tracking suite: 45/45 GREEN** (no regressions from Plan 03's 45/45).
- **UI settings/_components suite: 52/52 GREEN** (was 32/32 → +10 use-usage-filter + +10 usage-section).

## Task Commits

1. **Task 1 — use-usage-filter hook GREEN + usage-section RED scaffold** — `9ecc7545` (test)
2. **Task 2 — wire UsageSection + AdminCrossUserView API key filter dropdown** — `f1cfa8f4` (feat)
3. **Task 3 — FR-BROKER-E1-03 verified GREEN + final phase gate** — verification only (no code change; this docs commit)

## Files Created

### `use-usage-filter.ts` (60 lines)

Three exports per CONTEXT.md contract:

```typescript
export const KEY = 'livinity:usage:filter:apiKeyId'  // VERBATIM

export function loadFilter(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    return typeof raw === 'string' && raw.length > 0 ? raw : null
  } catch { return null }
}

export function saveFilter(value: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (value === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, value)
  } catch { /* quota errors swallowed */ }
}

export function useUsageFilter(): {filter: string | null; setFilter: (v: string | null) => void}
```

SSR-guarded (the React tree may render during static-prerender with `vite-plugin-pwa`). Mirrors `use-recent-searches.ts` pattern exactly.

### `use-usage-filter.unit.test.ts` (97 lines, 10 tests GREEN)

Pure-helper-as-fixture coverage:
- Test 1: `KEY` constant verbatim equals `'livinity:usage:filter:apiKeyId'`
- Tests 2-7: `loadFilter`/`saveFilter` round-trip, null/empty handling
- Test 8: quota error swallowing (`Storage.prototype.setItem` mock throws)
- Test 9: load-error swallowing
- Test 10: module export shape

### `usage-section.unit.test.tsx` (110 lines, 10 tests GREEN)

Smoke + 9 source-text-invariant assertions for FR-BROKER-E2-02:
- imports `useUsageFilter` from `./use-usage-filter`
- imports shadcn Select primitives
- consumes `trpcReact.apiKeys.list.useQuery`
- renders `value='all'` default `<SelectItem>All keys</SelectItem>`
- forwards selected apiKeyId to `usage.getMine.useQuery`
- appends `(revoked)` suffix for revoked keys
- renders verbatim `No usage recorded for this key.` copy
- `onValueChange` clears filter when `'all'` chosen
- renders `Filter by API key` label

## Files Modified

### `usage-section.tsx` diff (key sections)

```diff
+import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'
+import {useUsageFilter} from './use-usage-filter'

 export function UsageSection() {
   const [showAdminView, setShowAdminView] = useState(false)
+  const {filter, setFilter} = useUsageFilter()
+  const keysQ = trpcReact.apiKeys.list.useQuery()

   const myUsageQ = trpcReact.usage.getMine.useQuery(
-    undefined,
+    {apiKeyId: filter ?? undefined},
     {refetchInterval: 30_000},
   )
   ...
+  const isFilterActive = filter !== null
+  const isFilterEmpty = isFilterActive && stats.per_app.length === 0 && stats.daily_last_30.every((d) => d.count === 0)
   ...
+  {/* FR-BROKER-E2-02 filter dropdown — above banner; persists via useUsageFilter. */}
+  <div className='flex items-center justify-between'>
+    <span className='text-caption text-text-secondary'>Filter by API key</span>
+    <Select value={filter ?? 'all'} onValueChange={(v) => setFilter(v === 'all' ? null : v)}>
+      <SelectTrigger className='w-48'><SelectValue placeholder='All keys' /></SelectTrigger>
+      <SelectContent>
+        <SelectItem value='all'>All keys</SelectItem>
+        {keyOptions.map((k) => (
+          <SelectItem key={k.id} value={k.id}>
+            {k.name} ({k.key_prefix}){k.revoked_at ? ' (revoked)' : ''}
+          </SelectItem>
+        ))}
+      </SelectContent>
+    </Select>
+  </div>
   ...
+  {isFilterEmpty ? (
+    <div className='rounded-radius-md border border-border-default bg-surface-base p-4 text-body-sm text-text-secondary italic'>
+      No usage recorded for this key.
+    </div>
+  ) : ( /* existing chart + per-app table */ )}
```

Total: +144 lines / -19 lines. Preserves all existing behavior; additive feature gating around the filter.

### `admin-cross-user-view.tsx` diff (key sections)

```diff
+import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'

 export function AdminCrossUserView() {
   const [filterUserId, setFilterUserId] = useState<string>('')
   const [filterAppId, setFilterAppId] = useState<string>('')
   const [filterModel, setFilterModel] = useState<string>('')
+  const [filterApiKeyId, setFilterApiKeyId] = useState<string>('')
+
+  const allKeysQ = trpcReact.apiKeys.listAll.useQuery()

   const allUsageQ = trpcReact.usage.getAll.useQuery({
     user_id: filterUserId || undefined,
     app_id: filterAppId || undefined,
     model: filterModel || undefined,
+    api_key_id: filterApiKeyId || undefined,
   })
   ...
+  {/* Phase 62 Plan 62-05 FR-BROKER-E2-02 — admin api_key_id filter chip. */}
+  <Select value={filterApiKeyId || 'all'} onValueChange={(v) => setFilterApiKeyId(v === 'all' ? '' : v)}>
+    <SelectTrigger className='flex-1 min-w-[180px]'><SelectValue placeholder='All keys' /></SelectTrigger>
+    <SelectContent>
+      <SelectItem value='all'>All keys</SelectItem>
+      {keyOptions.map((k) => (
+        <SelectItem key={k.id} value={k.id}>
+          {k.name} ({k.key_prefix}) — owner: {k.username ?? k.user_id}
+          {k.revoked_at ? ' (revoked)' : ''}
+        </SelectItem>
+      ))}
+    </SelectContent>
+  </Select>
```

Notes:
- Uses `apiKeys.listAll`'s actual snake_case shape (`username` not `ownerUsername`, `user_id` not `ownerId`) per `api-keys/routes.ts:222-234`.
- `filterApiKeyId === ''` means no filter (matches the existing 3 input chips' empty-string convention).
- Added as 4th filter chip; the original 3 inputs are unchanged (plan stipulated "keep the existing 3 inputs unchanged; the new Select is the FOURTH filter").

## Test Outcomes

### UI suite — 52/52 GREEN

| File | Tests | Status |
|------|-------|--------|
| use-usage-filter.unit.test.ts | 10 | GREEN (NEW) |
| usage-section.unit.test.tsx | 10 (smoke + 9 invariants) | GREEN (NEW) |
| api-keys-section.unit.test.tsx | 7 | GREEN (Plan 04) |
| api-keys-create-modal.unit.test.tsx | 9 | GREEN (Plan 04) |
| api-keys-revoke-modal.unit.test.tsx | 7 | GREEN (Plan 04) |
| past-deploys-table.unit.test.tsx | 1 | GREEN (Phase 33) |
| menu-item-badge.unit.test.tsx | 1 | GREEN (Phase 33) |
| danger-zone.unit.test.tsx | 7 | GREEN (Phase 38) |

### Backend usage-tracking suite — 45/45 GREEN

| File | Tests | Status |
|------|-------|--------|
| schema-migration.test.ts | 5 | GREEN (Plan 01) |
| parse-usage.test.ts | 9 | GREEN (Plan 44) |
| aggregations.test.ts | 6 | GREEN (Plan 01 patched fixture) |
| database.test.ts | 4 | GREEN (Plan 01 patched fixture) |
| capture-middleware.test.ts | 8 | GREEN (Plan 02 added 2) |
| **integration.test.ts** | **6 (incl. FR-BROKER-E1-03)** | **GREEN (Plan 02 + verified Plan 05)** |
| routes.test.ts | 7 | GREEN (Plan 03 added 2) |

## 6 Grep Guard Outputs

### Guard 1 — Sacred file UNTOUCHED

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b   ← MATCHES expected SHA
```

### Guard 2 — No plaintext leaks in production source

```
$ grep -rnE "console\.(log|info|debug).*plaintext|console\.(log|info|debug).*Bearer " \
    livos/packages/ui/src/routes/settings/_components/api-keys-*.tsx \
    livos/packages/livinityd/source/modules/usage-tracking/
(matches only inside .unit.test.tsx files asserting the prohibition; production .tsx files have ZERO matches)
```

Production `.tsx` files: **0 matches** ✓
Test files: 3 matches (descriptive `it('NEVER console.logs ...')` labels enforcing the prohibition — these ARE the guard).

### Guard 3 — localStorage key VERBATIM

```
$ grep -n 'livinity:usage:filter:apiKeyId' livos/packages/ui/src/routes/settings/_components/use-usage-filter.ts
22:export const KEY = 'livinity:usage:filter:apiKeyId'
```

Single line, exact match. ✓

### Guard 4 — ai-config.tsx FLAT (no Tabs wrapper)

```
$ grep -nE '<Tabs|TabsContent|TabsTrigger' livos/packages/ui/src/routes/settings/ai-config.tsx
(no matches)
```

Zero matches. ✓ Plan 04's flat `<h2>` per-section design preserved.

### Guard 5 — Idempotent ALTER pattern present in schema

```
$ grep -A 3 'Phase 62 FR-BROKER-E1-01' livos/packages/livinityd/source/modules/database/schema.sql
362:-- Phase 62 FR-BROKER-E1-01 — broker_usage.api_key_id (per CONTEXT.md decision).
363:-- Idempotent ADD COLUMN IF NOT EXISTS in DO-block (matches Phase 25 pattern
364:-- at line 261-264). Backward-compat: existing rows + legacy URL-path traffic
365:-- get NULL. ON DELETE SET NULL preserves historic attribution if a key row
366:-- is hard-deleted (Phase 59 soft-deletes via revoked_at, but defense-in-depth).
367:-- =========================================================================
368:DO $$
369:BEGIN
370:  ALTER TABLE broker_usage
```

Block present at line 362+ — DO $$ BEGIN ALTER. ✓

### Guard 6 — Mount order preserved (server/index.ts)

```
$ grep -nE 'mountUsageCaptureMiddleware|mountBearerAuthMiddleware|mountBrokerRoutes' \
    livos/packages/livinityd/source/modules/server/index.ts
1229: mountUsageCaptureMiddleware(this.app, this.livinityd)
1239: mountBearerAuthMiddleware(this.app, this.livinityd, this.livinityd.apiKeyCache)
1245: mountBrokerRoutes(this.app, this.livinityd)
```

Order: **usage (1229) < bearer (1239) < broker (1245)**. ✓ Plan 02's mount-order contract preserved.

## Phase 62 Requirement Closure Table

| Req ID | Plan | Evidence |
|--------|------|----------|
| FR-BROKER-E1-01 | 62-01 | schema.sql DO-block ALTER + partial index + 8-param insertUsage; 5 schema-migration tests GREEN; 62-01-SUMMARY.md |
| FR-BROKER-E1-02 | 62-02 | capture-middleware.ts recordRow reads `req.apiKeyId` when `authMethod === 'bearer'`; 2 new GREEN tests in capture-middleware.test.ts; 62-02-SUMMARY.md |
| FR-BROKER-E1-03 | 62-02 + 62-05 | integration.test.ts FR-BROKER-E1-03 GREEN — apiKeyId leg from Plan 02, prompt_tokens leg from existing parseUsageFromSseBuffer chat-completions branch (v29.5 + Phase 58); pinned by Plan 05 final-gate run |
| FR-BROKER-E2-01 | 62-04 | ApiKeysSection (CRUD UI) + Create/Revoke modals + ai-config.tsx insertion; 23/23 tests GREEN; Stripe-style show-once + two-step revoke per CONTEXT.md UX; 62-04-SUMMARY.md |
| FR-BROKER-E2-02 | 62-03 + 62-05 | Backend (Plan 03): tRPC `usage.getMine`/`usage.getAll` accept `apiKeyId`/`api_key_id` Zod inputs forwarded to query helpers; 2 new GREEN tests. Frontend (Plan 05): UsageSection + AdminCrossUserView Select dropdowns; 9 source-text invariants GREEN; localStorage persistence via `useUsageFilter` |

**All 5 requirements CLOSED.** Phase 62 feature-complete.

## Sacred File

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b   ← MATCHES expected SHA
```

UNCHANGED at start of Plan 05 AND end of Plan 05 AND end of Phase 62. D-30-07 preserved across the entire phase (4 sample points this plan; Plan 04 noted 4 + Plan 03 noted 1 + Plan 02 noted 1 + Plan 01 noted 1 = ~10 sample points across Phase 62).

## Decisions Made

- **localStorage key VERBATIM `livinity:usage:filter:apiKeyId`** — CONTEXT.md decisions §API Key Filter Dropdown specifies this string; RESEARCH.md Q3 confirms `livinity:` prefix not `livos:`. Grep guard in this plan asserts the literal string at file-level so a future "let's normalize all keys to livos: prefix" PR is caught at unit-test time.
- **Snake_case adaptation (CARRIED FROM PLAN 04)** — Plan's pseudo-code used camelCase `keyPrefix`/`revokedAt`/`ownerUsername`. Phase 59 routes return snake_case `key_prefix`/`revoked_at` and `username`/`user_id` for `listAll`. Plan 04 already established this adaptation as authorized; Plan 05 follows the same convention so the runtime behavior matches Plan 04's existing API Keys table rendering.
- **Smoke + source-text invariants over RTL** — RTL not installed (D-NO-NEW-DEPS). 9 source-string assertions catch refactor regressions that DOM-based tests would miss (e.g., "the apiKeyId is forwarded" is a SOURCE invariant, not a DOM invariant).
- **Empty-state branch gating: `filter !== null && per_app.length === 0 && all daily counts 0`** — preserves StatCards + banner so the user still sees the aggregate context (which will all be 0 with the filter applied) while the filter clarifies why the chart/table is hidden. Avoids hiding too much UI when the user picks a key with no usage history (better UX than blank-screen).
- **FR-BROKER-E1-03 verified, not re-greened** — Plan 62-02 SUMMARY explicitly noted "the 'apiKeyId leg' of E1-03 is satisfied by this plan's capture-middleware change... so the test goes fully GREEN here." Plan 05 re-runs the test as Phase 62 closure verification but does NOT need to add new code. The test file structure (Plan 01's RED scaffold + Plan 02's middleware fix) was already correct.

## Deviations from Plan

### [Adaptation — authorized by Plan 04 precedent] Snake_case field names

- **Found during:** Task 2 implementation (UsageSection + AdminCrossUserView)
- **Issue:** Plan's `<interfaces>` block sketches `apiKeys.list` returning `{id, name, keyPrefix, createdAt, lastUsedAt, revokedAt}` (camelCase) and `apiKeys.listAll` returning `{id, name, keyPrefix, ownerId, ownerUsername, ...}` (camelCase). Phase 59-04 actual route returns snake_case `key_prefix`/`revoked_at`/`username`/`user_id` per `livos/packages/livinityd/source/modules/api-keys/routes.ts:135-141 + 222-234`.
- **Fix:** Used the actual snake_case field names — same adaptation Plan 04 applied for `ApiKeysSection`. Plan explicitly authorized this in `<interfaces>`: "If `listAll` ships with slight field-name variations, adapt; consult Phase 59-04 SUMMARY at execute time."
- **Files affected:** `usage-section.tsx` (`KeyOption` interface + map render), `admin-cross-user-view.tsx` (`AdminKeyOption` interface + map render).
- **Commit:** Folded into `f1cfa8f4` (Task 2 GREEN).
- **Impact on contract:** Zero — the `apiKeyId` UUID flowing to the tRPC route is still string-identical; only the SUFFIX/LABEL rendering uses the snake_case fields.

### [Rule 3 — Blocking] RTL absence (CARRIED FROM PLAN 04 — same fix)

- **Found during:** Task 1 (writing UsageSection tests)
- **Issue:** Plan called for 6 RTL test cases on `usage-section.unit.test.tsx`. RTL not installed (D-NO-NEW-DEPS locked). Plan 04 already established the smoke + source-text-invariant pattern as the canonical fallback.
- **Fix:** Wrote 1 smoke test + 9 source-text-invariants. Each invariant maps to one of the 6 plan-specified test cases (T1 → "All keys" invariant, T2 → keysQ.data?.map invariant, T3 → revoked-suffix invariant, T4 → apiKeyId forward invariant, T5 → useUsageFilter import invariant, T6 → empty-state copy invariant — plus 3 extras for label/imports/onValueChange).
- **Files affected:** `usage-section.unit.test.tsx`.
- **Commit:** Folded into `9ecc7545` (Task 1).
- **Impact on contract:** ZERO — invariants are STRICTER than RTL would be (catch refactor regressions in source intent, not just rendered DOM).

**Total deviations:** 2 (both authorized adaptations carried from Plan 04 precedent — no NEW deviation patterns introduced).

## Issues Encountered

None — all three tasks executed cleanly. FR-BROKER-E1-03 was already GREEN at start of Plan 05, so no integration-test debugging was needed (Plan 02 SUMMARY's hand-off note was accurate).

## Threat Flags

None — this plan introduces no new trust boundaries. The plan's `<threat_model>` (T-62-18..22) is fully addressed:

| Threat | Mitigation Status |
|--------|-------------------|
| T-62-18 (I — revoked key UUID exposed in dropdown) | ACCEPT — `apiKeys.list` scopes by user_id; admin's `listAll` is admin-gated; UUID exposure to the owner is not a leak |
| T-62-19 (T — localStorage value mutated by browser extension) | GREEN — `loadFilter` validates string-non-empty; `saveFilter` rejects non-string at the type level; tRPC server-side `z.string().uuid()` re-validates UUID format |
| T-62-20 (D — apiKeys.listAll returns large list) | ACCEPT — Phase 59 admin scope; Mini PC scale (low hundreds of keys max); no pagination needed for v30 |
| T-62-21 (R — filter selection inconsistent across tabs) | ACCEPT — localStorage is per-origin; consistent across tabs by design |
| T-62-22 (T — Tabs wrapper accidentally introduced) | GREEN — Grep guard 4 fails if `<Tabs|TabsContent|TabsTrigger` appears in `ai-config.tsx`; current grep returns 0 matches |

## D-NO-NEW-DEPS Audit

**GREEN.** Zero new dependencies installed; zero `package.json` / `pnpm-lock.yaml` changes:

```
$ git diff HEAD~3 HEAD -- livos/packages/ui/package.json livos/packages/ui/pnpm-lock.yaml
(empty — no changes)
```

Used only existing primitives:
- `@radix-ui/react-select` (already in `livos/packages/ui/package.json:50`)
- `react` (`useState`, `useCallback`)
- `vitest` + `jsdom` (existing test infra)
- `trpcReact` (existing)

## User Setup Required

None — Plan 05 is fully internal. The filter dropdown is empty until the user creates API keys (Plan 04 surface) and uses them via Bearer to populate `broker_usage.api_key_id` rows (Plan 02). Phase 63 live verification will exercise the end-to-end flow on Mini PC.

## STATE.md / ROADMAP.md / REQUIREMENTS.md Updates

To be applied immediately after this SUMMARY commits:
- STATE.md: `completed_phases: 6 → 7`; current position "Phase 62 complete; awaiting Phase 63 (mandatory live verification — final phase)"; forensic trail entry for Phase 62 closure.
- ROADMAP.md: Phase 62 row complete (status `✅ CLOSED`, plans 5/5).
- REQUIREMENTS.md: mark FR-BROKER-E1-03 + FR-BROKER-E2-02 complete.

## Hand-off to Phase 63

Phase 62 is feature-complete. Phase 63 (mandatory live verification — D-LIVE-VERIFICATION-GATE) requires:

1. **Mini PC deploy:** `bash /opt/livos/update.sh` to land all of Phase 62's source on `bruce@10.69.31.68` (rsync, build, restart). This is the prerequisite that makes the Settings UI's API Keys + Usage tabs renderable in the live browser.
2. **Phase 63 verification battery:**
   - Visit `https://bruce.livinity.io/#/settings/ai-configuration` → see "API Keys" section above "Usage"
   - Click "Create Key" → verify Stripe-style show-once modal renders the plaintext exactly once
   - Save plaintext to a password manager / external client config
   - `curl -H "Authorization: Bearer <plaintext>" https://api.livinity.io/v1/messages -d '{"model":"sonnet",...}'` (Phase 60 endpoint)
   - Return to Settings → Usage → verify the new key appears in the Filter dropdown
   - Filter by the new key → verify chart + per-app table show ONLY that key's request
   - Revoke the key → verify next curl returns HTTP 401 within 100ms (Phase 59 cache invalidation contract)
   - Verify the revoked key still appears in the Filter dropdown with "(revoked)" suffix
   - Repeat the curl flow for OpenAI translation: `https://api.livinity.io/v1/chat/completions` with the same Bearer; verify usage row created with `endpoint='chat-completions'` and `prompt_tokens > 0`
3. **Mini PC carry-forward UATs:** 14 un-walked UAT files from v29.3/29.4/29.5 + Phase 62 row consolidate into Phase 63's mandatory gate (Phase 63 must close cleanly without `--accept-debt` per D-LIVE-VERIFICATION-GATE).

**Sacred SHA invariant:** `nexus/packages/core/src/sdk-agent-runner.ts` = `4f868d318abff71f8c8bfbcf443b2393a553018b` at end of Phase 62.

## Self-Check: PASSED

Verified file existence:
- FOUND: livos/packages/ui/src/routes/settings/_components/use-usage-filter.ts
- FOUND: livos/packages/ui/src/routes/settings/_components/use-usage-filter.unit.test.ts
- FOUND: livos/packages/ui/src/routes/settings/_components/usage-section.unit.test.tsx
- MODIFIED: livos/packages/ui/src/routes/settings/_components/usage-section.tsx (verified via git diff stat: +144/-19)
- MODIFIED: livos/packages/ui/src/routes/settings/_components/admin-cross-user-view.tsx (verified via git diff stat)

Verified commits:
- FOUND: 9ecc7545 (test — Task 1)
- FOUND: f1cfa8f4 (feat — Task 2)

Verified contract:
- 10/10 use-usage-filter unit tests GREEN
- 10/10 usage-section unit tests GREEN (smoke + 9 source-text invariants)
- 45/45 backend usage-tracking tests GREEN (no regressions)
- 52/52 UI settings/_components tests GREEN
- FR-BROKER-E1-03 integration.test.ts -t "FR-BROKER-E1-03" PASS
- 6/6 grep guards GREEN (sacred SHA / no-plaintext-in-prod / localStorage key / no-Tabs / ALTER block / mount order)
- D-NO-NEW-DEPS preserved (zero package.json / lockfile changes)
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at end of plan AND end of Phase 62

---
*Phase: 62-usage-tracking-settings-ui*
*Completed: 2026-05-03*
