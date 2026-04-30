# Phase 44: Per-User Usage Dashboard - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning
**Mode:** `--chain` (Claude presented 8-decision batch summary, user accepted all)

<domain>
## Phase Boundary

Each LivOS user sees their own AI usage stats (per-app token breakdown, cumulative input + output, current month total) in Settings > AI Configurations > Usage. Admins see a cross-user filterable view in the same UI. Rate-limit warnings appear at 80% of Claude subscription daily cap (Pro 200/day default; Max tier 5x — Redis-configurable later but hardcoded for v29.3). When Anthropic returns 429 to the broker, the UI surfaces "your subscription cap reached" — distinct from a Livinity outage.

**Critical invariant:** Phase 41 + Phase 42 broker module is **edit-frozen**. Phase 44 adds usage capture via Express response middleware that wraps broker handlers from the OUTSIDE — broker source stays byte-identical. Sacred SdkAgentRunner stays at Phase 40 baseline `623a65b9...`.

**Scope anchor:**
- New PostgreSQL table `broker_usage` with idempotent migration in livinityd
- New Express response capture middleware (broker-adjacent file, not in livinity-broker module): reads response body or SSE stream, parses `usage` object, writes a row
- Mount middleware on the broker route prefix `/u/:userId/v1/*` (sits in front of OR behind broker handler — exact pattern picked in plan-phase audit)
- New tRPC routes: `usage.getMine` (current user's stats), `usage.getAll` (admin-only cross-user)
- Settings UI: new "Usage" subsection in AI Configurations card (table, totals, rate-limit banner)
- 429 propagation already done by broker; Phase 44 just adds UI surface

**Out of scope:**
- Modifying broker module files (`livinity-broker/*`)
- Modifying sacred SdkAgentRunner
- Cost forecasting (FR-DASH-future-01 — defer)
- Per-request audit trail (full message logging) (FR-OBS-future-01 — defer)
- Admin policy changes (rate-limit raises, manual top-ups, etc.)
- Push notifications when token expiring soon
- Configurable rate limit via Redis (locked as hardcoded for v29.3 per user choice)

</domain>

<decisions>
## Implementation Decisions

### DB Schema (D-44-01..03)
- **D-44-01:** New PostgreSQL table `broker_usage`:
  ```sql
  CREATE TABLE IF NOT EXISTS broker_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    app_id TEXT,                  -- container name or app id (best-effort source resolution)
    model TEXT NOT NULL,          -- echoed model from request (e.g., "gpt-4" or "claude-sonnet-4-6")
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    request_id TEXT,              -- chatcmpl-... or msg_... id from response
    endpoint TEXT NOT NULL,       -- 'messages' | 'chat-completions'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_broker_usage_user_created ON broker_usage (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_broker_usage_app ON broker_usage (app_id, created_at DESC);
  ```
- **D-44-02:** Migration is idempotent — runs at livinityd startup, uses `CREATE TABLE IF NOT EXISTS` (matches existing v7.0 multi-user schema migration pattern). Place in `livos/packages/livinityd/source/modules/database/schema.sql` or as a separate migration file (planner picks based on existing pattern).
- **D-44-03:** No backfill of existing broker traffic — table starts empty; first usage row lands when first broker request hits with usage data.

### Capture Strategy (D-44-04..06) — broker stays edit-frozen
- **D-44-04:** **Express response middleware** wraps broker routes from OUTSIDE:
  - For sync responses: middleware intercepts `res.json()` calls, parses the response body, extracts `usage.input_tokens` / `usage.output_tokens` (Anthropic) OR `usage.prompt_tokens` / `usage.completion_tokens` (OpenAI), writes row, then calls original `res.json()`.
  - For SSE responses: middleware intercepts `res.write()` calls, accumulates the stream, parses the final `message_delta` / terminal chunk for usage, writes row at stream end (`res.end()` hook).
- **D-44-05:** Middleware location: NEW file `livos/packages/livinityd/source/modules/usage-tracking/capture-middleware.ts` (separate module from livinity-broker). Imports nothing from broker module. Pure response wrapping.
- **D-44-06:** Mount in `server/index.ts` BEFORE broker routes — Express middleware ordering means capture wraps ALL `/u/:userId/v1/*` paths (catches both `/v1/messages` and `/v1/chat/completions`). Per-route mount: `app.use('/u/:userId/v1', captureMiddleware, brokerRouter)`.

### app_id Source Resolution (D-44-07)
- **D-44-07:** Best-effort `app_id` capture from request headers / source IP:
  - If `X-LivOS-Container-Name` header present (future Phase 43+ enhancement), use it.
  - Else use Docker source IP → container name reverse lookup (livinityd has Docker daemon access; `dockerode listContainers` can resolve container name from IP).
  - Else fall back to `null` (table allows it).
  Plan 44-01 audit confirms which approach is most reliable; defaults to `null` if reverse lookup adds too much complexity. Honest framing: app_id is observability, not security — never used for authorization.

### Rate Limit Detection (D-44-08..10)
- **D-44-08:** Hardcoded daily caps:
  ```typescript
  const RATE_LIMIT_BY_TIER = {
    pro: 200,    // Anthropic Pro: 200 messages/day
    max5x: 1000, // Anthropic Max 5x: 1000 messages/day
    max20x: 4000 // Anthropic Max 20x: 4000 messages/day (rare; estimate)
  };
  const WARN_THRESHOLD = 0.8; // warn at 80%
  ```
  No automatic tier detection — defaults to `pro` for v29.3. Future enhancement: detect from Anthropic API response or user setting.
- **D-44-09:** "Today's count" = `SELECT COUNT(*) FROM broker_usage WHERE user_id = $1 AND created_at >= CURRENT_DATE`. Computed live on each dashboard query (no caching — daily counts are small).
- **D-44-10:** UI banner states:
  - <80% of limit: no banner
  - 80-99% of limit: yellow banner "X/Y daily messages used (Pro tier)"
  - 100% (429 received): red banner "Subscription cap reached — resets at midnight UTC"
  - Last 429 timestamp tracked in `broker_usage` row's `request_id` (or new column if needed) so banner reflects actual last failure.

### 429 UX (D-44-11)
- **D-44-11:** Broker already passes Anthropic's 429 + Retry-After to caller (Phase 41/42 — verified). Phase 44 captures the 429 status code in middleware (`res.statusCode === 429`), writes a row with 0 tokens but flags it in metadata (e.g., `endpoint = '429-throttled'`). UI reads recent throttle events and surfaces them as the red banner.

### tRPC Routes (D-44-12..14)
- **D-44-12:** New tRPC router `usage` with 2 procedures:
  - `usage.getMine(input: { since?: Date })` — returns current user's stats:
    - Cumulative tokens (input + output)
    - Per-app breakdown: `[{ app_id, request_count, prompt_tokens, completion_tokens, last_used_at }, ...]`
    - Daily counts for last 30 days (chart data)
    - Today's count + rate-limit threshold + tier
  - `usage.getAll(input: { user_id?, app_id?, model?, since?: Date })` — admin-only, cross-user filtered view; same shape but unrestricted by user_id.
- **D-44-13:** Routes use existing auth middleware: `usage.getMine` is `privateProcedure` (any authenticated user); `usage.getAll` is `adminProcedure` (admin-only).
- **D-44-14:** Add to `httpOnlyPaths` in `common.ts` if mutation; queries are fine over WebSocket.

### UI: Settings > AI Configurations > Usage (D-44-15..17)
- **D-44-15:** New subsection in `livos/packages/ui/src/routes/settings/ai-config.tsx` (the same file Phase 40 modified for per-user OAuth UI). Add a "Usage" tab/section below the OAuth card.
- **D-44-16:** Layout:
  - **Top:** rate-limit banner (conditional render based on threshold logic from D-44-10)
  - **Middle:** stat cards (cumulative tokens, monthly total, today's request count vs cap)
  - **Bottom:** per-app table (sortable: app, requests, prompt tokens, completion tokens, last used)
  - **Admin:** toggle "View as admin" → renders cross-user filter chips (user / app / model dropdowns)
- **D-44-17:** Charts: simple ASCII-style or basic recharts/chart.js for last 30 days daily counts. Plan-phase decides based on existing UI deps (LivOS already uses framer-motion + tailwindcss; chart lib TBD).

### Sacred File + Broker Integrity (D-44-18..19)
- **D-44-18:** `nexus/packages/core/src/sdk-agent-runner.ts` — byte-identical to Phase 40 baseline `623a65b9a50a89887d36f770dcd015b691793a7f`. ZERO Phase 44 changes.
- **D-44-19:** `livos/packages/livinityd/source/modules/livinity-broker/*` — byte-identical to Phase 42 baseline. Phase 44 captures externally; broker source unmodified.
- **Verify both** at every plan commit.

### Tests (D-44-20..23)
- **D-44-20:** Schema migration test: run schema.sql on a fresh test DB, verify table + indexes exist. Run again, verify idempotency (no errors).
- **D-44-21:** Capture middleware unit tests:
  - Sync Anthropic response → correct usage row with `endpoint: 'messages'`
  - Sync OpenAI response → correct row with `endpoint: 'chat-completions'`
  - SSE response with terminal usage → row written at end
  - 429 response → row with throttle flag
  - Malformed response (no usage object) → no row written, no crash
- **D-44-22:** Integration test: mount middleware + mock broker handler → POST request → verify row in test DB
- **D-44-23:** tRPC route tests: `getMine` returns correct aggregations from seeded test data; `getAll` rejects non-admin; both filter correctly by date / app

### Out-of-Scope Carry-Forwards (D-44-24..25)
- **D-44-24:** Cost forecasting (FR-DASH-future-01) — defer
- **D-44-25:** Per-request full message audit trail (FR-OBS-future-01) — defer; Phase 44 stores token counts only, not message content (privacy + storage cost)

### Claude's Discretion
- Whether app_id reverse-lookup uses Docker socket directly or via existing dockerode wrapper — planner picks
- Chart library choice for last-30-days daily counts (or skip charts entirely; just show table) — planner picks
- Whether `usage.getMine` returns last 30 days fully or paginated — planner picks (probably last 30 days fully — small data per user)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 44 source files (target)
- `livos/packages/livinityd/source/modules/database/schema.sql` (or migrations dir) — add broker_usage table
- `livos/packages/livinityd/source/modules/usage-tracking/` (NEW module) — capture-middleware.ts + database helpers
- `livos/packages/livinityd/source/modules/server/index.ts` — mount middleware on `/u/:userId/v1`
- `livos/packages/livinityd/source/modules/ai/routes.ts` (or wherever tRPC routers live) — add `usage` router
- `livos/packages/ui/src/routes/settings/ai-config.tsx` — add Usage subsection
- `livos/packages/ui/src/...` (or wherever shared UI components live) — chart components if used

### DO NOT TOUCH
- `nexus/packages/core/src/sdk-agent-runner.ts` (sacred — Phase 40 baseline `623a65b9...`)
- `livos/packages/livinityd/source/modules/livinity-broker/*` (broker module — feature-frozen since Phase 42)

### Project-level constraints
- `.planning/PROJECT.md` (D-NO-BYOK; sacred SdkAgentRunner; D-NO-SERVER4)
- `.planning/REQUIREMENTS.md` (FR-DASH-01, FR-DASH-02, FR-DASH-03; FR-DASH-future-01 + FR-OBS-future-01 deferred)
- `.planning/ROADMAP.md` (Phase 44 — 4 success criteria)

### Phase 41 + 42 broker output contract (consumed)
- Anthropic Messages response includes `usage: { input_tokens, output_tokens }`
- OpenAI Chat Completions response includes `usage: { prompt_tokens, completion_tokens, total_tokens }`
- SSE: Anthropic terminal `message_delta` chunk includes `usage` object; OpenAI streaming has the `usage` only on opt-in (`stream_options.include_usage`) — Phase 44 may need to set this when proxying

### Memory references
- `MEMORY.md` Multi-User Architecture (v7.0) — PostgreSQL schema migration pattern, JWT user resolution
- `MEMORY.md` Mini PC notes — DATABASE_URL location, schema.sql idempotency expectations

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- v7.0 PostgreSQL multi-user schema (`schema.sql`) — established pattern for new tables; `users` table provides FK target
- Phase 40's `getUserClaudeDir` pattern — admin/user gating via `isMultiUserMode` reusable for dashboard
- Existing tRPC routers in `modules/ai/routes.ts` and elsewhere — established procedure patterns (privateProcedure, adminProcedure)
- ai-config.tsx (Phase 40 + Phase 43) — UI extension target; existing tabbed/sectioned layout
- dockerode (already a dep in livinityd for Phase 27 Docker management) — usable for app_id reverse lookup

### Established Patterns
- Idempotent SQL migration via `CREATE TABLE IF NOT EXISTS` at startup
- tRPC procedure conventions (privateProcedure / adminProcedure / queries vs mutations)
- Settings UI tabs pattern (existing components — investigate during plan-phase)
- Middleware ordering in Express (Phase 41 broker mount in server/index.ts ~line 1215)

### Integration Points
- Schema migration runs at livinityd startup (existing pattern)
- Capture middleware mounts BEFORE broker on the `/u/:userId/v1` prefix
- tRPC `usage` router registered alongside existing routers
- UI Usage section reads tRPC, renders below OAuth card

</code_context>

<specifics>
## Specific Ideas

- **Middleware approach keeps broker edit-frozen.** This was the user's explicit preference. Capture lives in a new `usage-tracking` module with zero imports from `livinity-broker/*`. Broker handler runs unchanged; middleware wraps response.
- **Hardcoded rate limits for v29.3.** Pro=200/day matches Anthropic's published cap. Max tier rare; can configure via Redis later.
- **Honest token observability.** v29.3 stores token counts only, not message content (privacy + cost). Per-request full audit trail deferred to FR-OBS-future-01.
- **Phase 44 closes v29.3.** After Phase 44 ships locally, milestone is feature-complete; remaining work is operator deploy + 5 phases × UAT.

</specifics>

<deferred>
## Deferred Ideas

- **Cost forecasting** (predict end-of-month based on trajectory) — FR-DASH-future-01
- **Per-request full message audit trail** — FR-OBS-future-01
- **Configurable rate limits via Redis** (D-44-08 hardcoded for v29.3)
- **Auto tier detection** from Anthropic API response or user setting
- **Push notifications when token-expiring-soon**
- **Cross-month / cross-quarter / cross-year aggregations** (current scope: last 30 days + monthly)
- **Export to CSV / JSON for accounting**
- **Webhook on rate-limit-reached** (alert integrations)

</deferred>

---

*Phase: 44-per-user-usage-dashboard*
*Context gathered: 2026-04-30*
*Decisions: 25 (D-44-01..D-44-25). User approved 8-recommendation summary as a batch.*
*Final phase of v29.3.*
