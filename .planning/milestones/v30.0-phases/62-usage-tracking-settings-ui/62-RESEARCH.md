# Phase 62: E1 Usage Tracking Accuracy + E2 Settings UI - Research

**Researched:** 2026-05-02
**Domain:** Postgres schema migration + Express middleware extension + tRPC input enhancement + React UI (shadcn/ui)
**Confidence:** HIGH

## Summary

Phase 62 is a low-risk, high-leverage phase: every file it touches already exists from Phase 44 + Phase 59, so the plan is "extend, do not invent." Five mutation surfaces: (1) `schema.sql` ALTER TABLE for `broker_usage.api_key_id`; (2) `capture-middleware.ts` reads `req.apiKeyId` and adds it to the existing INSERT; (3) `usage-tracking/database.ts` insert + query helpers gain `apiKeyId` plumbing; (4) `usage-tracking/routes.ts` Zod inputs gain optional `api_key_id`; (5) UI adds `<ApiKeysTab>` + filter dropdown to existing `<UsageSection>`. No new dependencies, no new shadcn components — all primitives (`Dialog`, `Select`, `Button`, `Input`, `Tabs`, `sonner` toast) already imported elsewhere.

**Primary recommendation:** Wave the work strictly bottom-up — schema → middleware/db → tRPC → UI. The parent settings page (`ai-config.tsx`) renders `<UsageSection>` as a flat sub-section (NOT a tabbed panel today); Phase 62 either keeps the flat layout and inserts a sibling `<ApiKeysSection>`, OR introduces shadcn `<Tabs>` to wrap both. Recommend the FLAT path (simpler, less diff, matches existing v29.3 design language) — name them "API Keys" and "Usage" as adjacent `<h2>` sections.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Schema migration:** `ALTER TABLE broker_usage ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL` + partial index `WHERE api_key_id IS NOT NULL`.
- **Capture middleware:** when `req.authMethod === 'bearer'`, include `req.apiKeyId` in the INSERT. Legacy URL-path traffic: `api_key_id = NULL`.
- **tRPC routes:** `usage.getMine` + `usage.getAll` gain optional `apiKeyId?: string` input. Both filter via `WHERE api_key_id = $N`.
- **UI components:** new `<ApiKeysTab>`, `<ApiKeysCreateModal>`, `<ApiKeysRevokeModal>`; enhanced `<UsageSubsection>` + `<AdminCrossUserView>` with key filter dropdown.
- **Plaintext show-once UX:** modal with `navigator.clipboard.writeText` + warning admonition + "I've saved it, close" dismiss.
- **Filter persistence:** `localStorage` key `livinity:usage:filter:apiKeyId`.
- **Sacred file UNTOUCHED:** SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` for `nexus/packages/core/src/sdk-agent-runner.ts`.
- **No new deps** (D-NO-NEW-DEPS).

### Claude's Discretion

- Tab order (API Keys before Usage, or after) — default API Keys → Usage.
- API Keys list sort order — default newest first.
- Confirmation modal exact wording.
- Tabs vs. flat sections layout.

### Deferred Ideas (OUT OF SCOPE)

- CSV/JSON export, dollar cost calculation, per-key rate limits, key auto-expiry/rotation, mobile UI, multi-key bulk ops, webhook events, audit log surface in UI.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-BROKER-E1-01 | `broker_usage` gains nullable `api_key_id` FK | schema.sql:324-337 — ALTER pattern proven at line 258-264 |
| FR-BROKER-E1-02 | All 4 broker paths write rows on success | capture-middleware.ts:69-145 already wraps `res.json` + `res.write` + `res.end`; Phase 58 emits `usage` chunk before `[DONE]` for OpenAI streaming; parser already in `parse-usage.ts` |
| FR-BROKER-E1-03 | Streaming integration test asserts non-zero tokens | existing `integration.test.ts` in usage-tracking module — Wave 0 extends |
| FR-BROKER-E2-01 | API Keys tab with create + revoke + show-once | shadcn Dialog at `@/shadcn-components/ui/dialog`; Phase 59 supplies `apiKeys.{create,list,revoke,listAll}` tRPC routes |
| FR-BROKER-E2-02 | Usage filter dropdown by API key | shadcn Select at `@/shadcn-components/ui/select`; existing `<UsageSection>` at `_components/usage-section.tsx`; admin variant at `_components/admin-cross-user-view.tsx` |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `api_key_id` column on usage rows | Database (PG) | — | FK enforcement + ON DELETE SET NULL is a DB-tier concern |
| Capture `req.apiKeyId` per request | Frontend Server (Express middleware) | — | Lives in livinityd between Phase 59 Bearer middleware and broker handler |
| Filter usage by key | Frontend Server (tRPC input) | Database (WHERE clause) | Zod input validation in tRPC layer; SQL filter in PG |
| Render API Keys list / Create modal / Revoke modal | Browser (React + shadcn/ui) | Frontend Server (tRPC mutations from Phase 59) | UI calls existing tRPC routes; no new backend logic |
| Persist last-selected key filter | Browser (localStorage) | — | Per-user UX preference; no server round-trip |

## Standard Stack

### Core (already in repo — Phase 62 reuses, never installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` (node-postgres) | existing | PG client | livinityd's only PG driver `[VERIFIED: usage-tracking/database.ts:9]` |
| `zod` | existing | tRPC input validation | already in `routes.ts:17` |
| `@trpc/server` + `@trpc/react-query` | existing | RPC layer | `trpcReact` exposed via `@/trpc/trpc` `[VERIFIED: usage-section.tsx:20]` |
| `@radix-ui/react-dialog` | existing | Modal primitive | wrapped at `@/shadcn-components/ui/dialog` `[VERIFIED]` |
| `@radix-ui/react-select` | existing | Dropdown primitive | wrapped at `@/shadcn-components/ui/select` `[VERIFIED]` |
| `@radix-ui/react-tabs` | existing | Tabs primitive (optional) | wrapped at `@/shadcn-components/ui/tabs` — used in `security-section.tsx`, `image-section.tsx` `[VERIFIED]` |
| `sonner` | existing | Toast notifications | `import {toast} from 'sonner'` per `environments-section.tsx:33` `[VERIFIED]` |
| `react-icons/tb` | existing | Tabler icons (Tb prefix) | settings page convention `[VERIFIED]` |
| `vitest` | existing | Test runner | `*.test.ts` colocated with source, `*.unit.test.tsx` for UI `[VERIFIED]` |

### Don't install anything new

D-NO-NEW-DEPS is locked. Every primitive Phase 62 needs is already imported by adjacent code.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────────┐
                     │ Bolt.diy / curl / OpenWebUI (Bearer client) │
                     └──────────────────────┬──────────────────────┘
                                            │ Authorization: Bearer liv_sk_*
                                            ▼
   /u/:userId/v1/* ──► [usage capture middleware]   ◄── Phase 62 reads req.apiKeyId here
                                            │
                                            ▼
                              [Phase 59 Bearer middleware]   sets req.userId, req.authMethod, req.apiKeyId
                                            │
                                            ▼
                              [livinity-broker handler]      sacred → untouched
                                            │
                                            ▼
                  res.json / res.write / res.end intercepted by capture middleware
                                            │
                                            ▼
                  parseUsageFromResponse / parseUsageFromSseBuffer
                                            │
                                            ▼
                  insertUsage({userId, appId, apiKeyId, ...})  ◄── Phase 62 adds apiKeyId param
                                            │
                                            ▼
                                broker_usage row in PG
                                            │
                                            ▲
                                            │ tRPC usage.getMine({apiKeyId?})
   Settings > AI Configuration ─────────────┘
   ├── <UsageSection>           ◄── Phase 62 adds <Select> dropdown above chart
   │     <Select> options from apiKeys.list
   │     localStorage key: livinity:usage:filter:apiKeyId
   ├── <ApiKeysSection>         ◄── NEW Phase 62
   │     ├── List rows (from apiKeys.list)
   │     ├── <ApiKeysCreateModal> (Dialog → plaintext show-once → Copy button)
   │     └── <ApiKeysRevokeModal> (Dialog → confirm → apiKeys.revoke)
   └── <AdminCrossUserView>     ◄── Phase 62 adds api_key_id filter (admin)
```

### Component Responsibilities (file-to-implementation mapping)

| File | Current Responsibility | Phase 62 Change |
|------|----------------------|-----------------|
| `livos/packages/livinityd/source/modules/database/schema.sql` (lines 324-337) | `broker_usage` CREATE TABLE | APPEND `DO $$ BEGIN ALTER TABLE broker_usage ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL; END$$;` + partial index |
| `livos/packages/livinityd/source/modules/usage-tracking/database.ts:38-55` | `insertUsage` 7-param INSERT | Add `apiKeyId: string \| null` to `UsageInsertInput`; INSERT becomes 8 columns / 8 params |
| `livos/packages/livinityd/source/modules/usage-tracking/database.ts:79-111` | `queryUsageAll` dynamic WHERE builder | Add `apiKeyId?: string` to opts; conditional `WHERE api_key_id = $N` |
| `livos/packages/livinityd/source/modules/usage-tracking/database.ts:61-73` | `queryUsageByUser` user-scoped query | Add `apiKeyId?: string` opt; conditional `AND api_key_id = $N` |
| `livos/packages/livinityd/source/modules/usage-tracking/capture-middleware.ts:48-67` | `recordRow` calls `insertUsage(...)` | Read `(req as Request).apiKeyId` (typed via Phase 59's module augmentation in `bearer-auth.ts`); pass to `insertUsage` |
| `livos/packages/livinityd/source/modules/usage-tracking/routes.ts:28` | `sinceInput` Zod schema | Replace with `z.object({since: z.date().optional(), apiKeyId: z.string().uuid().optional()}).optional()` |
| `livos/packages/livinityd/source/modules/usage-tracking/routes.ts:67-77` | `getAll` Zod input | Add `api_key_id: z.string().uuid().optional()` |
| `livos/packages/ui/src/routes/settings/_components/usage-section.tsx:29` | `getMine.useQuery(undefined, ...)` | Pass `{apiKeyId: selectedKey || undefined}`; add `<Select>` controlled by state synced to localStorage |
| `livos/packages/ui/src/routes/settings/_components/admin-cross-user-view.tsx:22-26` | `getAll.useQuery({user_id, app_id, model})` | Add `api_key_id` to query input + add 4th `<input>` filter chip (or shadcn `<Select>` populated from `apiKeys.listAll`) |
| `livos/packages/ui/src/routes/settings/ai-config.tsx:687-688` | renders `<UsageSection />` at end | Add `<ApiKeysSection />` (NEW) immediately above; both render as adjacent `<h2>` sections — NO `<Tabs>` wrapper needed |
| **NEW** `livos/packages/ui/src/routes/settings/_components/api-keys-section.tsx` | n/a | Lists keys (`apiKeys.list`), "Create Key" button → opens `<ApiKeysCreateModal>`, per-row "Revoke" → opens `<ApiKeysRevokeModal>` |
| **NEW** `livos/packages/ui/src/routes/settings/_components/api-keys-create-modal.tsx` | n/a | Two-state Dialog: (1) name input + Submit; (2) plaintext display + Copy + warning + Close |
| **NEW** `livos/packages/ui/src/routes/settings/_components/api-keys-revoke-modal.tsx` | n/a | Confirmation Dialog → `apiKeys.revoke({id})` → `utils.apiKeys.list.invalidate()` |
| **NEW** `livos/packages/ui/src/routes/settings/_components/use-usage-filter.ts` | n/a | localStorage hook (mirror `palette/use-recent-searches.ts` pattern: pure `loadFilter` + `saveFilter` + `useUsageFilter` hook) |

### Recommended Project Structure

```
livos/packages/livinityd/source/modules/
├── database/
│   └── schema.sql                    # APPEND ALTER TABLE block (Wave 1)
└── usage-tracking/
    ├── database.ts                   # Add apiKeyId to insert + queries (Wave 1)
    ├── capture-middleware.ts         # Read req.apiKeyId, pass to insertUsage (Wave 1)
    ├── routes.ts                     # Zod input gains apiKeyId (Wave 2)
    ├── *.test.ts                     # Wave 0 extends + Wave 1/2 GREEN

livos/packages/ui/src/routes/settings/
├── ai-config.tsx                     # Insert <ApiKeysSection /> (Wave 3)
└── _components/
    ├── usage-section.tsx             # Add <Select> + filter state (Wave 4)
    ├── admin-cross-user-view.tsx     # Add api_key_id filter (Wave 4)
    ├── api-keys-section.tsx          # NEW (Wave 3)
    ├── api-keys-create-modal.tsx     # NEW (Wave 3)
    ├── api-keys-revoke-modal.tsx     # NEW (Wave 3)
    └── use-usage-filter.ts           # NEW (Wave 4)
```

### Pattern 1: Idempotent ALTER TABLE (DO-block guard)

**What:** Phase 25 established the schema-migration pattern in this repo: every ALTER lives in a `DO $$ BEGIN ... END$$;` block to match the trigger-creation pattern from earlier phases. `IF NOT EXISTS` does the actual work.

**Source:** `livos/packages/livinityd/source/modules/database/schema.sql:258-264`:
```sql
-- Phase 25 DOC-06 — environment tags for filter chips. Idempotent ADD COLUMN
DO $$
BEGIN
  ALTER TABLE environments ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
END$$;
```

**Phase 62 application:**
```sql
-- Phase 62 FR-BROKER-E1-01 — broker_usage.api_key_id (FK to api_keys; legacy rows = NULL)
DO $$
BEGIN
  ALTER TABLE broker_usage
    ADD COLUMN IF NOT EXISTS api_key_id UUID
    REFERENCES api_keys(id) ON DELETE SET NULL;
END$$;

CREATE INDEX IF NOT EXISTS idx_broker_usage_api_key_id
  ON broker_usage(api_key_id)
  WHERE api_key_id IS NOT NULL;
```

### Pattern 2: Express request augmentation (already done by Phase 59)

**What:** Phase 59-03 plan injects the global module augmentation in `api-keys/bearer-auth.ts`:
```typescript
declare global {
  namespace Express {
    interface Request {
      userId?: string
      authMethod?: 'bearer' | 'url-path'
      apiKeyId?: string   // ← THIS is the attribute Phase 62 reads
    }
  }
}
```

**Source:** `.planning/phases/59-bearer-token-auth/59-03-PLAN.md` lines 141-152 (`<interfaces>`).

**Phase 62 application in capture-middleware.ts:**
```typescript
// inside captureMiddleware, after const userId = req.params?.userId:
const apiKeyId = req.authMethod === 'bearer' ? req.apiKeyId ?? null : null

// inside recordRow:
await insertUsage({
  userId,
  appId,
  apiKeyId,                                // ← NEW
  model: parsed.model ?? 'unknown',
  promptTokens: parsed.prompt_tokens,
  completionTokens: parsed.completion_tokens,
  requestId: parsed.request_id,
  endpoint: parsed.endpoint,
})
```

`[VERIFIED: 59-03-PLAN.md interfaces section]` — Phase 59 commits to `req.apiKeyId` as the exact attribute name. Phase 62 plan can rely on it; the Wave 0 mount-order test in 59-03 already enforces middleware-mount sequence (usage-capture BEFORE bearer-auth). **CRITICAL: usage-capture mounts at line 1228, Bearer middleware at ~1230, broker at 1234. Bearer runs AFTER capture's `next()` in the request phase, but capture's `res.write/end` patches fire DURING response phase — which runs AFTER bearer middleware's set of `req.apiKeyId`.** So `req.apiKeyId` IS readable at recordRow time. (Verified by reading capture-middleware.ts lifecycle: it patches response methods then calls `next()` — the rest of the pipeline runs and only afterward does `res.end` execute the closure that captures `req.apiKeyId`.)

### Pattern 3: tRPC Zod input enhancement (additive optional)

**What:** Backwards-compatible — existing UI clients send no `apiKeyId`, server treats absent as "no filter."

**Source:** `livos/packages/livinityd/source/modules/usage-tracking/routes.ts:28-77`:
```typescript
const sinceInput = z.object({since: z.date().optional()}).optional()
// → becomes:
const mineInput = z.object({
  since: z.date().optional(),
  apiKeyId: z.string().uuid().optional(),
}).optional()
```

For `getAll` admin route, add `api_key_id: z.string().uuid().optional()` (snake_case to match existing field convention `user_id`/`app_id`).

### Pattern 4: localStorage hook (load + push + useHook)

**Source:** `livos/packages/ui/src/routes/docker/palette/use-recent-searches.ts` (full file shown above):

```typescript
export const KEY = 'livinity:usage:filter:apiKeyId'

export function loadFilter(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    return typeof raw === 'string' && raw.length > 0 ? raw : null
  } catch { return null }
}

export function saveFilter(value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, value)
  } catch { /* ignore quota errors */ }
}

export function useUsageFilter(): {filter: string | null; setFilter: (v: string | null) => void} {
  const [filter, setFilterState] = useState<string | null>(() => loadFilter())
  const setFilter = useCallback((v: string | null) => {
    setFilterState(v)
    saveFilter(v)
  }, [])
  return {filter, setFilter}
}
```

### Pattern 5: Copy-to-clipboard with toast feedback

**Source:** `livos/packages/ui/src/routes/settings/_components/environments-section.tsx:865-875`:
```typescript
const onCopy = async () => {
  if (!token) return
  try {
    await navigator.clipboard.writeText(token)
    setCopied(true)
    toast.success('Token copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  } catch {
    toast.error('Could not access clipboard — copy manually')
  }
}
```

Identical pattern at `ai-config.tsx:189-195` (Kimi userCode copy) — toast is the established UX. Use `import {toast} from 'sonner'`.

### Pattern 6: Dialog wrapper convention

**Source:** `environments-section.tsx:884-890`:
```tsx
<Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
  <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
    <DialogHeader>
      <DialogTitle>...</DialogTitle>
    </DialogHeader>
    {/* body */}
  </DialogContent>
</Dialog>
```

Imports: `import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'`.

### Anti-Patterns to Avoid

- **DON'T add a new shadcn component file** — every primitive needed is in `livos/packages/ui/src/shadcn-components/ui/` already.
- **DON'T introduce `<Tabs>` wrapper around UsageSection + ApiKeysSection** unless user requests — `ai-config.tsx` is a flat single-column `<div className='max-w-lg space-y-8'>` with `<h2>` headers per section. Adding tabs is a layout-language departure.
- **DON'T log Bearer plaintext** — Phase 59-03 establishes that. Phase 62 only handles `apiKeyId` (UUID), never plaintext, but tests should still grep-guard.
- **DON'T assume `req.apiKeyId` is always set** — for legacy URL-path traffic it's `undefined`. Coerce to `null` before INSERT.
- **DON'T use `import {Dialog} from '@/components/ui/dialog'`** — that path is for repo-internal wrappers (e.g. `dialog-close-button`); the shadcn primitive lives at `@/shadcn-components/ui/dialog`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal lifecycle | Custom show/hide overlay | shadcn `<Dialog>` + Radix portal | Already imported; correct focus-trap + aria-* + escape |
| Dropdown | `<select>` HTML element | shadcn `<Select>` | Matches surrounding form aesthetic; keyboard nav handled |
| Confirmation dialog | `window.confirm` | shadcn `<Dialog>` w/ destructive variant Button | `confirm()` cannot be styled or async-awaited safely |
| Copy-to-clipboard | document.execCommand fallback | `navigator.clipboard.writeText` + `try/catch` + `toast` | Pattern 5 above is the project's standard |
| Persisting filter | URL query string | `localStorage` (via Pattern 4 hook) | URL is shared; per-machine UX preference belongs in localStorage |
| Schema migration framework | Add knex/drizzle/typeorm | DO-block + IF NOT EXISTS | Project convention since Phase 25; livinityd applies schema.sql at boot via `client.query(schemaSql)` |
| Toast plumbing | New notification context | `import {toast} from 'sonner'` | Already wired in `_app.tsx` provider chain (used by environments-section, webhooks, users, ssh-sessions-tab) |

## Runtime State Inventory

> NOT a rename/refactor phase. This phase ADDs a column + UI; no string replacement, no migration of existing string keys.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by grep `api_key_id` in `usage-tracking/` returns zero hits today | Schema migration on boot only adds column NULL; no data migration of existing rows |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None — `apiKeyId` is a UUID, not a secret name | None |
| Build artifacts | None | None |

The only "state change" is: existing `broker_usage` rows will have `api_key_id = NULL` post-migration. UI must render NULL gracefully ("All keys" / "Direct (URL-path)" labels — recommend "Legacy (no key)" in the dropdown distinct option).

## Common Pitfalls

### Pitfall 1: Mount-order race — capture middleware reads `req.apiKeyId` before Phase 59 sets it

**What goes wrong:** If anyone reorders middleware so capture mounts AFTER bearer-auth, `req.apiKeyId` is set BEFORE `next()` returns, fine. But if capture mounts AFTER bearer, capture's `res.json/write/end` patches install LATER — broker handler may have already responded by then. Symptom: rows are written but `api_key_id` is consistently NULL.

**Why it happens:** Express middleware order matters for both request-time AND response-time concerns. Capture patches response methods at request time; the patched closures read `req.apiKeyId` at response time, so as long as capture installs FIRST (so its closure exists when broker calls `res.end`) AND bearer-auth runs BEFORE broker handler (so `req.apiKeyId` is set before `res.end`), the design works.

**How to avoid:** Phase 59-03's `mount-order.test.ts` already enforces position(usage-capture) < position(bearer) < position(broker). Phase 62 adds an integration test asserting `api_key_id` is non-NULL when Bearer is supplied. **Wave 4 should add `mount-order.test.ts` assertion: capture < bearer < broker is preserved.**

**Warning signs:** broker_usage rows where api_key_id is NULL despite client sending Bearer.

### Pitfall 2: Zod input change is breaking for older UI bundles

**What goes wrong:** Adding `apiKeyId` as optional is additive — but if ZOd does `.strict()` on the input, an extra field fails. Today's `routes.ts:28` uses plain `z.object({...}).optional()` — non-strict by default — so an undefined `apiKeyId` from older bundles passes through untouched.

**Why it happens:** Production typically serves the UI bundle that's coterminous with the backend. But during a Mini PC `update.sh` run there's a window where UI is OLD and backend is NEW, or vice versa.

**How to avoid:** Keep input non-strict (don't add `.strict()`). Confirm with `pnpm --filter @livos/livinityd typecheck` after the input change; UI's `trpcReact.usage.getMine.useQuery({apiKeyId: undefined})` should compile against the new contract AND the old (which ignores the new field).

**Warning signs:** tRPC `BAD_INPUT` in browser console.

### Pitfall 3: FK migration locks broker_usage on production

**What goes wrong:** `ALTER TABLE ... ADD COLUMN ... REFERENCES api_keys(id)` adds a FK constraint that PG validates against existing rows. With `NULL` default + `IF NOT EXISTS` + `NOT VALID` skipped, PG should treat the column as nullable — no row scan, no validation. But wrapping in a DO-block doesn't prevent PG from still acquiring an `ACCESS EXCLUSIVE` lock briefly.

**Why it happens:** PG ALTER TABLE ... ADD COLUMN takes ACCESS EXCLUSIVE for the metadata change, but this is millisecond-fast for a NULL-default column with no row rewrite. Adding a FK without `NOT VALID` triggers a parallel reference scan that holds a SHARE lock on the referenced table (`api_keys`) only.

**How to avoid:** On a small `broker_usage` table (Mini PC scale ≤ low millions), the lock is sub-second. Do NOT add `NOT VALID` — the table is small, defer-validation isn't worth it. **Verify Mini PC PG row count first** (`SELECT COUNT(*) FROM broker_usage` post-Wave 1 deploy) — if > 10M, revisit.

**Warning signs:** Boot blocks > 5s on `client.query(schemaSql)`.

### Pitfall 4: UI tab/section order disrupts user muscle memory

**What goes wrong:** v29.3 users have learned "Settings > AI Configuration > scroll to bottom = Usage." Phase 62 either inserts API Keys above Usage (default) or below.

**Why it happens:** Spatial UI memory is durable.

**How to avoid:** Place API Keys ABOVE Usage (creation flow before consumption flow per CONTEXT default). Don't reorganize existing Provider/Kimi/Claude/Active Model/Computer Use sections.

### Pitfall 5: Filter dropdown shows revoked keys but query returns empty

**What goes wrong:** `apiKeys.list` (Phase 59) returns both active AND revoked keys (per CONTEXT.md decision: list includes `revoked_at`). User picks a revoked key from the dropdown, sees zero rows, thinks UI is broken.

**Why it happens:** `broker_usage` rows pre-revocation are still attributed to the revoked key, so SOMETIMES revoked keys do have rows; SOMETIMES (revoked before any use) they don't.

**How to avoid:** Add a visual badge "(revoked)" next to revoked-key options in the dropdown; show empty-state copy "No usage recorded for this key." Don't hide revoked keys — historical attribution is the whole point.

## Code Examples

### Migration Block (schema.sql — append after line 337)

```sql
-- Phase 62 FR-BROKER-E1-01 — broker_usage.api_key_id (idempotent + partial idx)
-- Backward-compat: existing rows + legacy URL-path traffic = NULL.
DO $$
BEGIN
  ALTER TABLE broker_usage
    ADD COLUMN IF NOT EXISTS api_key_id UUID
    REFERENCES api_keys(id) ON DELETE SET NULL;
END$$;

CREATE INDEX IF NOT EXISTS idx_broker_usage_api_key_id
  ON broker_usage(api_key_id)
  WHERE api_key_id IS NOT NULL;
```

### insertUsage 8-param form

```typescript
export type UsageInsertInput = {
  userId: string
  appId: string | null
  apiKeyId: string | null      // NEW
  model: string
  promptTokens: number
  completionTokens: number
  requestId: string | null
  endpoint: string
}

export async function insertUsage(input: UsageInsertInput): Promise<void> {
  const pool = getPool()
  if (!pool) return
  await pool.query(
    `INSERT INTO broker_usage
     (user_id, app_id, api_key_id, model, prompt_tokens, completion_tokens, request_id, endpoint)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [input.userId, input.appId, input.apiKeyId, input.model, input.promptTokens,
     input.completionTokens, input.requestId, input.endpoint],
  )
}
```

### tRPC `usage.getMine` enhanced input

```typescript
const mineInput = z.object({
  since: z.date().optional(),
  apiKeyId: z.string().uuid().optional(),
}).optional()

const getMineProc = privateProcedure
  .input(mineInput)
  .query(async ({ctx, input}) => {
    if (!ctx.currentUser) { /* same defensive empty branch */ }
    const userId = ctx.currentUser.id
    const rows = await queryUsageByUser({
      userId,
      since: input?.since,
      apiKeyId: input?.apiKeyId,        // NEW
    })
    // ... rest unchanged
  })
```

### `<UsageSection>` filter integration

```tsx
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'
import {useUsageFilter} from './use-usage-filter'

export function UsageSection() {
  const {filter, setFilter} = useUsageFilter()
  const [showAdminView, setShowAdminView] = useState(false)
  const myUsageQ = trpcReact.usage.getMine.useQuery(
    {apiKeyId: filter ?? undefined},
    {refetchInterval: 30_000},
  )
  const keysQ = trpcReact.apiKeys.list.useQuery()
  // ...
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2>Usage</h2>
        <Select value={filter ?? 'all'} onValueChange={(v) => setFilter(v === 'all' ? null : v)}>
          <SelectTrigger className='w-48'><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All keys</SelectItem>
            {keysQ.data?.map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {k.name} ({k.keyPrefix}){k.revokedAt ? ' (revoked)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* ... existing chart + table rendering ... */}
    </div>
  )
}
```

## Project Constraints (from CLAUDE.md / MEMORY.md)

- **Sacred file UNTOUCHED:** `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` MUST be byte-identical at end of every plan. Phase 62 doesn't touch nexus at all but every plan must verify.
- **Mini PC is the ONLY deploy target.** Do NOT include Server4 in deploy lists.
- **No PM2 — use `bash /opt/livos/update.sh`** which rsyncs source, builds, restarts `livos liv-core liv-worker liv-memory` via systemd.
- **livinityd runs TypeScript via tsx** — no compile step needed for backend changes; UI requires `pnpm --filter @livos/config build && pnpm --filter ui build`.
- **No new dependencies (D-NO-NEW-DEPS).** All shadcn primitives + sonner toast + tabler icons + zod are already in package.json.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing — already used by `usage-tracking/*.test.ts` and UI `*.unit.test.tsx`) |
| Backend config | `livos/packages/livinityd/vitest.config.ts` (existing) |
| UI config | `livos/packages/ui/vitest.config.ts` (existing) |
| Quick run command (backend) | `cd livos/packages/livinityd && npx vitest run source/modules/usage-tracking/` |
| Quick run command (UI) | `pnpm --filter ui test -- usage-section api-keys` |
| Full suite command | `pnpm -r test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR-BROKER-E1-01 | `api_key_id` column exists post-boot | unit (schema-migration test extends) | `cd livos/packages/livinityd && npx vitest run source/modules/usage-tracking/schema-migration.test.ts` | exists — extend |
| FR-BROKER-E1-01 | FK `ON DELETE SET NULL` works | integration | same as above | extend |
| FR-BROKER-E1-02 | capture middleware passes `apiKeyId` from `req.apiKeyId` | unit | `npx vitest run source/modules/usage-tracking/capture-middleware.test.ts -t "with bearer auth"` | exists — extend |
| FR-BROKER-E1-02 | All 4 broker paths write rows | integration | `npx vitest run source/modules/usage-tracking/integration.test.ts` | exists — extend with OpenAI streaming case |
| FR-BROKER-E1-03 | OpenAI streaming row has non-zero tokens | integration | same as above | extend |
| FR-BROKER-E2-01 | API Keys tab renders + create modal copy works | unit | `pnpm --filter ui test -- api-keys-section` | ❌ Wave 0 |
| FR-BROKER-E2-01 | Plaintext show-once → close → list refreshes | unit | `pnpm --filter ui test -- api-keys-create-modal` | ❌ Wave 0 |
| FR-BROKER-E2-02 | UsageSection filter calls getMine with apiKeyId | unit | `pnpm --filter ui test -- usage-section` | ❌ Wave 0 |
| FR-BROKER-E2-02 | Filter persists across mount via localStorage | unit | `pnpm --filter ui test -- use-usage-filter` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** vitest filter on the changed module path
- **Per wave merge:** `pnpm -r test` (root)
- **Phase gate:** Full suite green before `/gsd-verify-work` + sacred SHA assertion + grep guard for `req.apiKeyId` mention in capture-middleware.ts

### Wave 0 Gaps

- [ ] `livos/packages/ui/src/routes/settings/_components/api-keys-section.unit.test.tsx` — covers FR-BROKER-E2-01 list + create + revoke buttons
- [ ] `livos/packages/ui/src/routes/settings/_components/api-keys-create-modal.unit.test.tsx` — covers FR-BROKER-E2-01 plaintext show-once + copy + dismiss
- [ ] `livos/packages/ui/src/routes/settings/_components/api-keys-revoke-modal.unit.test.tsx` — covers FR-BROKER-E2-01 confirm flow
- [ ] `livos/packages/ui/src/routes/settings/_components/use-usage-filter.unit.test.ts` — covers FR-BROKER-E2-02 localStorage round-trip
- [ ] `livos/packages/ui/src/routes/settings/_components/usage-section.unit.test.tsx` — extend (or create) to cover apiKeyId filter prop wiring
- [ ] Backend: extend `capture-middleware.test.ts` with bearer-vs-url-path case asserting `apiKeyId` plumbing
- [ ] Backend: extend `integration.test.ts` with OpenAI streaming case asserting non-zero tokens written

(Framework install not needed — vitest already in both packages.)

## Environment Availability

> Phase 62 is pure code/config — no NEW external dependencies. Existing requirements (PG, Node, pnpm, tsx, vite) are already validated by Phase 44 + Phase 59 + ongoing v29.3 deploys.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | broker_usage table | ✓ (assumed — v29.3 deployed) | system PG | — |
| pnpm | UI build | ✓ | existing | — |
| vitest | tests | ✓ | existing | — |
| Phase 59 deployed | `api_keys` table + tRPC routes | ⚠ (parallel branch — must complete first) | — | Phase 62 cannot deploy until Phase 59 lands |

**Missing dependencies blocking execution:** Phase 59 must merge first (provides `api_keys` table + Bearer middleware setting `req.apiKeyId` + `apiKeys.{create,list,revoke,listAll}` tRPC routes).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | indirect (consumed from Phase 59) | Bearer middleware sets `req.apiKeyId`; Phase 62 only reads |
| V3 Session Management | no | tRPC procedures already gate on `ctx.currentUser` |
| V4 Access Control | yes | `getMine` is privateProcedure (own user); `getAll` is adminProcedure (cross-user) — backend is authoritative gate |
| V5 Input Validation | yes | Zod `z.string().uuid()` for `apiKeyId` — rejects malformed input before SQL |
| V6 Cryptography | no | no new crypto in Phase 62 (Phase 59 owns SHA-256 + timingSafeEqual) |
| V7 Data Protection | yes | plaintext key shown ONCE in modal, never persisted client-side, never logged |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User passes another user's apiKeyId to `usage.getMine` to read their data | I (info disclosure) | `getMine` already scopes `WHERE user_id = ctx.currentUser.id`; adding `AND api_key_id = $N` does NOT widen the scope — rows must be both user_id-matching AND key-matching. Even if attacker guesses someone else's key UUID, query returns zero rows. |
| Plaintext key leaks via tRPC log middleware | I | tRPC `apiKeys.create` response carries plaintext exactly once; ensure no `console.log` or telemetry logger captures the response. Phase 59 already establishes the "never log plaintext" rule; Phase 62 UI components must echo the rule (no `console.log` in copy handler). |
| Revoked key UUID still appears in dropdown | not a threat — informational | Visual "(revoked)" badge per Pitfall 5 |
| SQL injection via apiKeyId | T (Tampering) | Zod uuid validation + parameterized query — both layers; multiple defenses |
| ON DELETE SET NULL allows historical attribution loss if key hard-deleted | R (Repudiation) | Phase 59 soft-deletes via `revoked_at`, never hard-deletes; ON DELETE SET NULL is defensive belt-and-suspenders |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-user URL-path identity only | Bearer + URL-path with Bearer winning | Phase 59 (v30.0) | Phase 62 captures the new identity dimension |
| Aggregate usage rows (no key attribution) | Per-key attribution via `api_key_id` FK | Phase 62 (this) | UI gains per-key filter dimension |
| OpenAI streaming had no usage rows (v29.3 C4 carry-forward) | Phase 58 emits `usage` chunk before `[DONE]`; Phase 62 capture parses it | Phase 58 + Phase 62 | All 4 broker paths now write rows |

**Deprecated/outdated:** None — this phase is purely additive.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `apiKeys.list` (Phase 59) returns `keyPrefix` field with the 8-char preview | Architecture Patterns | UI dropdown won't show prefix; cosmetic only — re-query alternate field |
| A2 | `apiKeys.listAll` (admin) is part of Phase 59's tRPC surface | Architecture Patterns / admin filter | If Phase 59 only ships `list/create/revoke`, admin view falls back to free-text UUID input until Phase 62 adds `listAll` |
| A3 | Phase 58's `usage` chunk format is parseable by existing `parseUsageFromSseBuffer` (v29.3 logic) | Pitfall 5 / Validation | If chunk shape differs, parser needs an OpenAI-streaming-specific branch; FR-BROKER-E1-03 integration test catches this |
| A4 | `broker_usage` table on Mini PC is < 10M rows (sub-second ALTER) | Pitfall 3 | If larger, plan adds `NOT VALID` + `VALIDATE CONSTRAINT` two-step |
| A5 | `ai-config.tsx` flat layout (no Tabs) is acceptable for adding API Keys section | Component Responsibilities | If user wants tabs, plan adds shadcn `<Tabs>` wrapper — same primitive set, different layout |

`[ASSUMED]` flags surface to discuss-phase if user wants to lock these. Otherwise plan proceeds with these as working assumptions; integration tests (FR-BROKER-E1-03) will catch A3 mismatches at Wave 1 time.

## Open Questions

1. **Should the dropdown show ALL keys (active + revoked) or only active?**
   - What we know: CONTEXT.md says "options come from active+revoked keys" — locked.
   - What's unclear: whether to visually fade revoked rows.
   - Recommendation: show all + visual "(revoked)" suffix per Pitfall 5. Default sort: active first, then revoked.

2. **`<Tabs>` wrapper or flat layout?**
   - What we know: existing `ai-config.tsx` is flat (`<h2>` per section).
   - What's unclear: user preference.
   - Recommendation: FLAT (smaller diff, less surprise). If user later asks for tabs, swap is mechanical.

3. **localStorage key namespace — `livinity:` or `livos:`?**
   - What we know: existing keys use `livos:docker:palette:recent` (livos prefix).
   - What's unclear: CONTEXT.md says `livinity:usage:filter:apiKeyId`.
   - Recommendation: follow CONTEXT.md verbatim (`livinity:`) per locked-decision rule. Migration: not needed — fresh key, no legacy value.

## Sources

### Primary (HIGH confidence — verified against repo)

- `livos/packages/livinityd/source/modules/usage-tracking/capture-middleware.ts:1-156` — current INSERT structure, response-method patching pattern
- `livos/packages/livinityd/source/modules/usage-tracking/database.ts:38-130` — current `insertUsage` + queries
- `livos/packages/livinityd/source/modules/usage-tracking/routes.ts:1-95` — current Zod inputs (`sinceInput` + `getAll` filters)
- `livos/packages/livinityd/source/modules/database/schema.sql:258-264` — DO-block ALTER pattern (Phase 25)
- `livos/packages/livinityd/source/modules/database/schema.sql:324-337` — `broker_usage` CREATE TABLE
- `livos/packages/ui/src/routes/settings/_components/usage-section.tsx:1-147` — current Phase 44 component to extend
- `livos/packages/ui/src/routes/settings/_components/admin-cross-user-view.tsx:1-93` — admin filter UI to extend
- `livos/packages/ui/src/routes/settings/ai-config.tsx:687-688` — render slot for new `<ApiKeysSection>`
- `livos/packages/ui/src/routes/docker/palette/use-recent-searches.ts:1-69` — localStorage hook pattern
- `livos/packages/ui/src/routes/settings/_components/environments-section.tsx:865-905` — copy-to-clipboard + Dialog precedent
- `livos/packages/ui/src/shadcn-components/ui/{dialog,select,tabs,button,input}.tsx` — shadcn primitives confirmed present
- `.planning/phases/59-bearer-token-auth/59-03-PLAN.md:141-152` — Phase 59 commits to `req.apiKeyId` attribute name
- `.planning/phases/59-bearer-token-auth/59-CONTEXT.md:50-66` — `api_keys` table schema (`id` UUID, `key_prefix` VARCHAR(16), etc.)
- `.planning/phases/58-true-token-streaming/58-01-PLAN.md:235-239` — OpenAI streaming `usage` chunk shape

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md:67-72, 134-138` — FR-BROKER-E1/E2 definitions
- `.planning/ROADMAP.md:164-174` — Phase 62 success criteria

### Tertiary

- None — every claim in this research is repo-verified or sourced from a Phase 58/59 plan that locks the contract.

## Metadata

**Confidence breakdown:**
- Schema migration: HIGH — pattern verified at schema.sql:258-264
- Capture middleware extension: HIGH — `req.apiKeyId` contract verified in Phase 59-03 PLAN
- tRPC enhancement: HIGH — additive optional field, Zod non-strict, backwards compat trivial
- UI components: HIGH — every primitive verified in existing files
- Integration risk (Phase 59 prereq): MEDIUM — depends on Phase 59 landing first

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (stable — only invalidated if Phase 59 ships with different attribute name or `apiKeys.list` shape)
