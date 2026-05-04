# Phase 62: E1+E2 Usage Tracking Accuracy + Settings UI (API Keys + Usage tabs) - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous); frontend + backend phase

<domain>
## Phase Boundary

Phase 62 finishes the broker observability story:

- **E1 — Usage Tracking Accuracy:** Every successful broker completion (Anthropic + OpenAI; streaming + sync) writes one `broker_usage` row with attributable `api_key_id` (FK to Phase 59's `api_keys.id`). Closes v29.3 C4 carry-forward (OpenAI streaming had no usage rows). Existing per-user usage stays accurate; new per-API-key dimension added.
- **E2 — Settings UI (API Keys + Usage tabs):** Two new UI surfaces in `Settings > AI Configuration`:
  - **API Keys tab** — list user's keys (id / label / prefix / created_at / last_used_at / revoked_at columns); "Create Key" button opens copy-to-clipboard modal with plaintext (one-time only); "Revoke" button on each row sets `revoked_at`. Wires Phase 59's tRPC routes (`apiKeys.create/list/revoke`) to React UI.
  - **Usage subsection enhancement** — existing v29.3 Phase 44 Usage subsection gains a "Filter by API Key" dropdown. Per-app table + 30-day chart update on filter change. Admin view (`usage.getAll`) gains the same `api_key_id` filter dimension.

What's IN scope for Phase 62:
- `broker_usage` schema migration: ADD COLUMN `api_key_id UUID NULLABLE REFERENCES api_keys(id) ON DELETE SET NULL`. Backward-compat: existing rows get NULL (legacy URL-path identity, no Bearer key used).
- Capture middleware update — when `req.authMethod === 'bearer'` (set by Phase 59 middleware), include resolved `api_key_id` in the usage row.
- All 4 broker paths (Anthropic streaming, Anthropic sync, OpenAI streaming, OpenAI sync) verified to emit usage rows. v29.3 Phase 42 already covered Anthropic sync + OpenAI sync. v29.5 commit `2518cf91` added token plumbing. Phase 58 plans cover OpenAI streaming usage chunk. Phase 62's verification confirms all 4 paths are wired end-to-end.
- New React component `<ApiKeysTab>` with Create + Revoke flows.
- Enhanced `<UsageSubsection>` with API key filter dropdown.
- Admin `<UsageAllView>` enhancement with `api_key_id` filter.

What's OUT of scope (deferred):
- Sacred file edits.
- Per-API-key rate limits (Phase 60 / 61 already handled rate-limit perimeter; per-key quotas defer to monetization).
- Mobile UI (desktop-only per REQUIREMENTS.md Out of Scope).
- Webhook events.
- Usage export to CSV/JSON (defer if user requests post-MVP).
- Cost calculation in dollars (token counts only — pricing logic defers to monetization milestone).

</domain>

<decisions>
## Implementation Decisions

### `broker_usage` Schema Migration

```sql
ALTER TABLE broker_usage
  ADD COLUMN IF NOT EXISTS api_key_id UUID
  REFERENCES api_keys(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_broker_usage_api_key_id
  ON broker_usage(api_key_id)
  WHERE api_key_id IS NOT NULL;
```

- `IF NOT EXISTS` for idempotent re-application (matches v29.3 Phase 44 + Phase 59 pattern).
- Partial index — only non-NULL rows (most legacy rows are NULL until Bearer adoption).
- `ON DELETE SET NULL` — preserves historic usage even if key deleted (which Phase 59 doesn't do — keys soft-revoke via `revoked_at`; but defensive in case of future hard-delete).

Migration appended to `livos/packages/livinityd/source/modules/database/schema.sql` (per Phase 59 pattern — no migration framework; schema applied at boot via `client.query(schemaSql)` with idempotent guards).

### Capture Middleware Update

Existing `livos/packages/livinityd/source/modules/usage-tracking/capture-middleware.ts` (v29.3 Phase 44):
- Currently inserts `broker_usage` row with `user_id` + `app_id` + token counts.
- Phase 62 adds: when `req.authMethod === 'bearer'` (set by Phase 59 Bearer middleware), include `req.apiKeyId` in INSERT.
- `req.apiKeyId` set by Phase 59's bearer-auth middleware after successful key resolution.
- Legacy URL-path traffic: `req.authMethod = 'url-path'` (or undefined); `api_key_id = NULL`.

### tRPC Route Updates (Phase 44 → enhanced)

`usage.getMine` (existing, private):
- Add optional input field `apiKeyId?: string`. If provided, filter rows: `WHERE api_key_id = $1 AND user_id = ctx.currentUser.id`.

`usage.getAll` (existing, admin):
- Add optional input field `apiKeyId?: string`. If provided, filter: `WHERE api_key_id = $1` (admin sees all users' rows for the key).

Both routes return existing shape + new optional `apiKeyId` echoed in response for UI sync.

`apiKeys.list` (Phase 59):
- Already returns the key list. Phase 62 UI consumes this for the dropdown options.

### React Component Structure

`livos/packages/ui/src/...` — exact path TBD by researcher (likely `livos/packages/ui/src/components/settings/ai-configuration/`).

New components:

```
ai-configuration/
  api-keys-tab.tsx         (NEW)        — list / create / revoke flows
  api-keys-create-modal.tsx (NEW)       — copy-to-clipboard plaintext, ONE-TIME-ONLY warning
  api-keys-revoke-modal.tsx (NEW)       — confirmation modal "this will break clients using this key"
  usage-subsection.tsx     (ENHANCED)   — add Filter dropdown above existing chart + table
  usage-all-view.tsx       (ENHANCED)   — admin view, same dropdown
```

Tab navigation in parent `ai-configuration-settings.tsx`:
- Existing tabs: Provider Toggle | Usage
- Phase 62 adds: API Keys tab between Provider Toggle and Usage

### Plaintext Show-Once UX

Create flow:
1. User clicks "Create Key" → modal opens with input field for "Key name/label" (1-64 chars).
2. User submits → tRPC `apiKeys.create({name})` → returns `{id, plaintext, prefix, name, created_at}`.
3. Modal switches to "Key Created" state showing:
   - Large monospace text box with the plaintext (`liv_sk_<base64url-32>`).
   - Copy-to-clipboard button (uses `navigator.clipboard.writeText`).
   - Warning admonition: "⚠️ Save this key now. You will NOT be able to see it again. Store it in a password manager or your client's config."
   - "I've saved it, close" dismiss button.
4. After dismiss, list refreshes (`apiKeys.list` re-query); new row appears with prefix preview only.

### Revoke Confirmation UX

Revoke flow:
1. User clicks "Revoke" on a row → confirmation modal: "Revoking will immediately invalidate this key. Clients using it will get HTTP 401 on their next request. This cannot be undone."
2. User confirms → tRPC `apiKeys.revoke({id})` → returns `{id, revoked_at}`.
3. Row updates in place: `revoked_at` populated; "Revoke" button disabled/hidden; row visually faded.

### API Key Filter Dropdown

In existing `<UsageSubsection>`:
- Above the chart + per-app table, add a `<Select>` with options: "All keys" (default; current behavior) + one row per active+revoked key (shows `name (prefix)`).
- On selection change: re-query `usage.getMine({apiKeyId: selectedId})`. Chart + table update.
- Persist last-selected filter in `localStorage` (key: `livinity:usage:filter:apiKeyId`) so user returning to Settings sees their last filter.

Admin variant in `<UsageAllView>`:
- Same dropdown, but options come from `apiKeys.listAll` (Phase 59 admin route).
- Display option as `name (prefix) — owner: <username>`.

### Data Flow Diagram

```
User clicks Create Key
   ↓
tRPC apiKeys.create({name})
   ↓
livinityd-side createApiKey() generates plaintext, INSERT row with key_hash
   ↓
returns {id, plaintext, prefix, ...} to UI
   ↓
UI shows plaintext in show-once modal
   ↓
... user copies and saves ...
   ↓
Subsequent broker requests with Bearer header
   ↓
bearer-auth middleware (Phase 59): req.userId + req.apiKeyId set
   ↓
broker handles request, response flows back
   ↓
capture middleware (v29.3 Phase 44 + Phase 62 enhanced):
   INSERT broker_usage(user_id, app_id, api_key_id, prompt_tokens, ...)
   ↓
Settings > Usage tab queries usage.getMine({apiKeyId?})
   ↓
chart + table render filtered data
```

### Sacred File — UNTOUCHED

Phase 62 only touches:
- `livos/packages/livinityd/source/modules/database/schema.sql` (append migration)
- `livos/packages/livinityd/source/modules/usage-tracking/capture-middleware.ts` (extend INSERT)
- `livos/packages/livinityd/source/modules/usage-tracking/routes.ts` (enhance tRPC inputs)
- `livos/packages/ui/src/...` (new + enhanced components)

NO edits to `nexus/packages/core/src/sdk-agent-runner.ts`. SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged.

### UI Style Guidelines

- Reuse existing v29.3 Phase 44 Usage subsection styling. NEW components match the existing design language (shadcn/ui + Tailwind).
- Modals use existing `<Dialog>` from shadcn/ui.
- Copy-to-clipboard button uses existing pattern (find precedent in repo — likely in v22.0+ marketplace UI or v26.0 device key flows).
- Empty state for API Keys tab: "You don't have any keys yet. [Create your first key]" prominent CTA.

### Claude's Discretion

- Exact tab order in AI Configuration (API Keys before Usage, or after?). Default: API Keys → Usage (creation flow before consumption flow).
- Sort order in API Keys list (newest first, oldest first, by name?). Default: newest first.
- Sort order in Usage rows (already exists; Phase 62 doesn't change).
- Confirmation modal copy text — exact wording.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 44 + Phase 59)
- `livos/packages/livinityd/source/modules/usage-tracking/capture-middleware.ts` (Phase 44) — Phase 62 extends.
- `livos/packages/livinityd/source/modules/usage-tracking/routes.ts` (Phase 44) — Phase 62 enhances `getMine` + `getAll` inputs.
- `livos/packages/livinityd/source/modules/api-keys/` (Phase 59) — provides `apiKeys.{create,list,revoke,listAll}` tRPC routes.
- `livos/packages/livinityd/source/modules/database/schema.sql` — Phase 59 already added `api_keys` table; Phase 62 ALTER's `broker_usage`.
- `livos/packages/ui/src/components/settings/ai-configuration/usage-subsection.tsx` (Phase 44) — Phase 62 enhances with filter dropdown.
- v22.0 device flows + v26.0 multi-user — existing copy-to-clipboard precedents to reuse.
- shadcn/ui `<Dialog>`, `<Select>`, `<Button>` — Phase 62 reuses unchanged.

### Established Patterns
- v29.3 Phase 44 — `broker_usage` table + Express middleware + tRPC routes split into private/admin. Phase 62 extends the same files.
- v22.0+ Settings tab pattern — multiple sub-tabs inside a single section.
- v26.0 multi-user — admin-vs-private route pattern with `adminProcedure`.

### Integration Points
- DB schema — single `ALTER TABLE` block appended to `schema.sql`.
- Capture middleware — single field added to INSERT statement.
- tRPC routes — input schema (`z.object`) updated with optional `apiKeyId`.
- React components — new files under `ai-configuration/`; one parent file (the AI Configuration settings root) updated to add new tab.

</code_context>

<specifics>
## Specific Ideas

- **End-to-end flow test (Phase 63 verification):** User creates a key → uses it via curl → returns to Settings > Usage → filters by that key → sees only their request rows. This is Phase 62's "happy path" canon.
- **Empty state copy:** "No API keys yet. Create one to start authenticating with Bearer tokens."
- **Plaintext warning copy:** "⚠️ This is the only time you'll see this key. Save it now."
- **Revoke confirm copy:** "Revoking 'My Bolt.diy Key' will invalidate it immediately. All clients using this key will get HTTP 401 errors on their next request. This cannot be undone."
- **API key filter empty result:** "No usage recorded for this key yet."

</specifics>

<deferred>
## Deferred Ideas

- **CSV/JSON usage export** — defer post-MVP if user requests.
- **Cost calculation in dollars** — defer to monetization (token counts only in v30).
- **Per-key rate limits** — defer to monetization.
- **Key auto-expiration / rotation** — defer to v30+ (Phase 59 deferred).
- **Mobile UI** — defer per REQUIREMENTS.md Out of Scope.
- **Multi-key bulk operations** (revoke all, etc.) — defer; one-by-one is fine for v30.
- **Webhook events on key create/revoke** — defer.
- **Audit log surface in UI** — backend already records audit events (Phase 59 D-30-decision); admin UI for viewing them defers.

</deferred>
