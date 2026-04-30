---
phase: 44
plan: SUMMARY
subsystem: dashboard
tags: [dashboard, usage, tokens, rate-limit, recharts, multi-user, v29.3-finale]
requires:
  - Phase 43 marketplace mechanism (broker traffic source)
  - Phase 41 + 42 broker (`livinity-broker` /v1/messages + /v1/chat/completions)
  - Sacred sdk-agent-runner.ts SHA 623a65b9a50a89887d36f770dcd015b691793a7f
provides:
  - PostgreSQL `broker_usage` table (9 cols, 2 indexes, ON DELETE CASCADE to users)
  - usage-tracking module (parse-usage / database / container-resolver / capture-middleware / aggregations / routes)
  - Express response capture middleware mounted BEFORE broker on /u/:userId/v1
  - tRPC `usage.getMine` (privateProcedure) + `usage.getAll` (adminProcedure)
  - Settings > AI Configuration "Usage" subsection (banner / 3 stat cards / 30d chart / per-app table / admin filter view)
  - test:phase44 npm script chaining test:phase43 (full v29.3 nexus chain)
  - 44-UAT.md (9-section operator manual UAT)
affects:
  - livos/packages/livinityd/source/modules/database/schema.sql (append-only)
  - livos/packages/livinityd/source/modules/usage-tracking/ (NEW module, 12 files)
  - livos/packages/livinityd/source/modules/server/index.ts (1 import + 1 mount line)
  - livos/packages/livinityd/source/modules/server/trpc/index.ts (1 import + 1 register line)
  - livos/packages/ui/src/routes/settings/ai-config.tsx (1 import + 1 render line)
  - livos/packages/ui/src/routes/settings/_components/ (5 NEW components)
  - nexus/packages/core/package.json (test:phase44 script)
tech-stack:
  added: []
  patterns:
    - Express response middleware that wraps OUTSIDE the broker module (broker stays edit-frozen)
    - vi.mock('./database.js') for tests without a PG pool
    - Pure aggregation functions (testable without IO)
    - Recharts BarChart for last-30-days daily counts (no new dep)
key-files:
  created:
    - .planning/phases/44-per-user-usage-dashboard/44-AUDIT.md
    - .planning/phases/44-per-user-usage-dashboard/44-UAT.md
    - livos/packages/livinityd/source/modules/usage-tracking/parse-usage.ts
    - livos/packages/livinityd/source/modules/usage-tracking/parse-usage.test.ts
    - livos/packages/livinityd/source/modules/usage-tracking/database.ts
    - livos/packages/livinityd/source/modules/usage-tracking/database.test.ts
    - livos/packages/livinityd/source/modules/usage-tracking/container-resolver.ts
    - livos/packages/livinityd/source/modules/usage-tracking/capture-middleware.ts
    - livos/packages/livinityd/source/modules/usage-tracking/capture-middleware.test.ts
    - livos/packages/livinityd/source/modules/usage-tracking/index.ts
    - livos/packages/livinityd/source/modules/usage-tracking/aggregations.ts
    - livos/packages/livinityd/source/modules/usage-tracking/aggregations.test.ts
    - livos/packages/livinityd/source/modules/usage-tracking/routes.ts
    - livos/packages/livinityd/source/modules/usage-tracking/routes.test.ts
    - livos/packages/livinityd/source/modules/usage-tracking/integration.test.ts
    - livos/packages/livinityd/source/modules/usage-tracking/schema-migration.test.ts
    - livos/packages/ui/src/routes/settings/_components/usage-section.tsx
    - livos/packages/ui/src/routes/settings/_components/usage-banner.tsx
    - livos/packages/ui/src/routes/settings/_components/per-app-table.tsx
    - livos/packages/ui/src/routes/settings/_components/admin-cross-user-view.tsx
    - livos/packages/ui/src/routes/settings/_components/daily-counts-chart.tsx
  modified:
    - livos/packages/livinityd/source/modules/database/schema.sql
    - livos/packages/livinityd/source/modules/server/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/index.ts
    - livos/packages/ui/src/routes/settings/ai-config.tsx
    - nexus/packages/core/package.json
decisions:
  - D-44-01..03 (broker_usage schema; idempotent IF NOT EXISTS append; no backfill)
  - D-44-04..06 (Express response capture middleware; separate module; mount BEFORE broker)
  - D-44-07 (best-effort dockerode IP→container reverse lookup; null fallback)
  - D-44-08..10 (hardcoded RATE_LIMIT_BY_TIER; live today_count; banner thresholds)
  - D-44-11 (429 captured via res.statusCode tap; throttled row endpoint)
  - D-44-12..14 (tRPC getMine privateProcedure + getAll adminProcedure; queries on WS)
  - D-44-15..17 (UI Usage section as last sibling; recharts BarChart)
  - D-44-18..19 (sacred file + broker module byte-identical — 0 diff)
  - D-44-20..23 (test plan: schema migration + 5 capture + 4 db + 6 aggregations + 5 routes + 5 integration)
  - D-44-24..25 (cost forecasting + per-request audit deferred)
metrics:
  commits: 5
  livinityd-tests-added: 39
  total-source-lines-added: 3517
  duration: ~30min
  completed-date: 2026-04-30
---

# Phase 44 Summary — Per-User Usage Dashboard (FINAL phase of v29.3)

## One-liner

Per-user broker usage dashboard surfaces token totals, per-app stats, last-30-days
chart, and rate-limit banners in Settings > AI Configuration; admin sees cross-user
filterable view; broker module + sacred SdkAgentRunner stay byte-identical
throughout — capture middleware lives in a separate `usage-tracking` module
that imports zero symbols from `livinity-broker/*`.

## Plans Executed

| Plan | Title | Commit | Files Modified |
|------|-------|--------|----------------|
| 44-01 | Codebase audit | `686a1030` | 1 (44-AUDIT.md, 679 lines) |
| 44-02 | broker_usage capture middleware + schema | `f8f8775b` | 10 source (8 NEW + 2 edited; 1151 insertions) |
| 44-03 | tRPC usage router (getMine + getAll) | `aa2e96c2` | 5 source (4 NEW + 1 edited; 550 insertions) |
| 44-04 | UI dashboard | `e3f1dd86` | 6 source (5 NEW + 1 edited; 441 insertions) |
| 44-05 | Integration + schema regression + test:phase44 + UAT | `f38897e6` | 4 source (3 NEW + 1 edited; 696 insertions) |

**Total commits:** 5 (one atomic commit per plan).
**Total source lines added (livos/ + nexus/ + .planning/):** 3517 lines across 22 files.

## ROADMAP Phase 44 Success Criteria — Pass/Fail

### SC #1 — Per-user dashboard populates from broker_usage table (FR-DASH-01)

> After a user makes marketplace-app requests using their Claude subscription,
> Settings > AI Integrations shows their cumulative input + output tokens, request
> count broken down by app, and current-month total — data persisted in PostgreSQL
> (`broker_usage` table or equivalent), one row per request from Anthropic Messages
> `usage` object, viewable per-user, without entering an API key.

**Status: MECHANISM-PASS, LIVE-UAT-DEFERRED**

Mechanism verified by:
- Plan 44-02 capture-middleware.test.ts T1 (sync Anthropic res.json triggers
  insertUsage with prompt_tokens=5, completion_tokens=3, endpoint='messages',
  requestId='msg_abc')
- Plan 44-02 capture-middleware.test.ts T6 (sync OpenAI chat-completions triggers
  insertUsage with endpoint='chat-completions')
- Plan 44-02 capture-middleware.test.ts T2 (Anthropic SSE accumulates input_tokens
  from message_start + output_tokens from message_delta and inserts at res.end)
- Plan 44-03 routes.test.ts T1 (usage.getMine returns {stats, today_count, banner}
  with cumulative_prompt_tokens=10, per_app=[{mirofish, ...}])
- Plan 44-04 ai-config.tsx renders <UsageSection /> as the last child of
  max-w-lg space-y-8 with cumulative + per-app + 30-day chart
- Plan 44-05 integration.test.ts T1 (full middleware → stub broker → insertUsage
  call shape verification: userId, model, promptTokens, completionTokens,
  requestId, endpoint all match)

Live UAT (Section C of 44-UAT.md) requires Mini PC deploy + MiroFish chat session
— operator action, deferred per scope_boundaries.

### SC #2 — Admin cross-user view (FR-DASH-02)

> Admin user, viewing Settings > AI Integrations as admin, sees a multi-user
> filterable view: per-app usage stats showing which user, which model, request
> count, and token total — with filter chips for user / app / model.

**Status: MECHANISM-PASS, LIVE-UAT-DEFERRED**

Mechanism verified by:
- Plan 44-03 routes.test.ts T3 (admin caller → getAll returns rows + stats with
  app_id filter applied)
- Plan 44-03 routes.test.ts T4 (CRITICAL: non-admin caller → TRPCError code
  'FORBIDDEN'; queryUsageAll NOT called — gate fires before resolver)
- Plan 44-04 admin-cross-user-view.tsx renders 3 filter inputs (user_id,
  app_id, model) + 3 stat cards + per-app table
- Plan 44-04 usage-section.tsx admin probe pattern: silent getAll call with
  retry:false; success → toggle visible, failure → toggle hidden

Backend authoritative gate verified (Plan 44-03 T4). UI cosmetic gate verified
(Plan 44-04 admin probe). Live UAT (Section D of 44-UAT.md) requires admin login
+ multiple users — operator action.

### SC #3 — 80% warning banner (FR-DASH-03)

> When a user reaches 80% of their Claude subscription daily rate limit (Pro
> 200/day), a non-blocking warning banner appears in the AI Integrations panel
> showing remaining requests; banner disappears at next day's reset.

**Status: MECHANISM-PASS, LIVE-UAT-SYNTHETIC**

Mechanism verified by:
- Plan 44-03 aggregations.test.ts T2 (computeBannerState transitions: <80% none,
  =80% warn, =100% critical, recent-429 critical override)
- Plan 44-03 aggregations.test.ts T6 (RATE_LIMIT_BY_TIER values: pro=200,
  max5x=1000, max20x=4000)
- Plan 44-04 usage-banner.tsx renders yellow banner when state='warn' with
  "X/Y daily messages used (tier)" + "Resets at midnight UTC."
- Plan 44-04 usage-section.tsx polls usage.getMine every 30s so today_count is
  fresh

Live UAT requires synthetic INSERT of 161 rows (Section E.1 of 44-UAT.md) — the
practical UAT for v29.3. Real-traffic UAT (Section E.2) deferred to natural
usage observation post-deploy.

### SC #4 — 429 propagation + UI surfacing (FR-DASH-03)

> When a user's subscription returns HTTP 429 from Anthropic (rate limit hit),
> the broker propagates the 429 (with Retry-After header) back to the calling
> marketplace app, AND the AI Integrations UI surfaces the rate-limit-reached
> state to the user.

**Status: MECHANISM-PASS, LIVE-UAT-SYNTHETIC**

Mechanism verified by:
- Phase 41/42: 429 propagation by broker (out of Phase 44 scope; carried forward).
- Plan 44-02 capture-middleware.test.ts T3 (status 429 → insertUsage with
  endpoint='429-throttled', tokens=0)
- Plan 44-05 integration.test.ts T3 (full middleware → stub 429 handler →
  res.statusCode=429 + Retry-After header preserved + throttled row written)
- Plan 44-03 routes.test.ts (banner critical state computed when most recent
  430-throttled row's created_at is within 1 hour)
- Plan 44-04 usage-banner.tsx renders red critical banner with "Subscription
  cap reached (tier)" + "Last 429 at <UTC ts> UTC. Resets at midnight UTC."
  (timestamp formatted with `{timeZone: 'UTC'}` — NOT local TZ)

Live UAT via synthetic 429-throttled INSERT (Section F of 44-UAT.md).

## Sacred File + Broker Module Integrity

**Phase 44 baseline SHA: `623a65b9a50a89887d36f770dcd015b691793a7f`**

Verified at:
- Phase 44 START (Plan 44-01 audit Section 0)
- After EACH commit (Plans 44-02, 44-03, 44-04, 44-05 — pre/post integrity gates)
- Phase 44 END (this summary)

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
623a65b9a50a89887d36f770dcd015b691793a7f

$ PHASE44_BASE=$(git log --oneline | grep '44-01.*audit' | head -1 | awk '{print $1}')~1
$ git diff "$PHASE44_BASE" HEAD -- nexus/packages/core/src/sdk-agent-runner.ts | wc -l
0

$ git diff "$PHASE44_BASE" HEAD -- livos/packages/livinityd/source/modules/livinity-broker/ | wc -l
0

$ grep -rEn '^(import|from).*livinity-broker' livos/packages/livinityd/source/modules/usage-tracking/
(no matches)
```

**Sacred file: byte-identical across all 5 Phase 44 commits.**
**Broker module: byte-identical across all 5 Phase 44 commits.**
**usage-tracking module: ZERO `import` / `from` references to livinity-broker/*** (only doc comments mention the boundary by name; the strict regex `^(import|from)` returns zero matches).

The `sdk-agent-runner-integrity.test.ts` (Phase 39) re-asserts SHA in CI; passing
in `npm run test:phase44`.

## Test Counts

| Phase | Test command | Tests |
|-------|--------------|-------|
| Phase 39 | `npm run test:phase39` | 5 (3 claude + 1 no-authtoken + 1 sdk-agent-runner-integrity) |
| Phase 40 | `npm run test:phase40` | 4 + Phase 39 = 9 |
| Phase 41 | `npm run test:phase41` | 7 + Phase 40 = 16 nexus chained |
| Phase 42 | `npm run test:phase42` | 0 + Phase 41 = 16 nexus chained |
| Phase 43 | `npm run test:phase43` | 0 + Phase 42 = 16 nexus chained |
| Phase 44 | `npm run test:phase44` | 0 + Phase 43 = 16 nexus chained |

Phase 44 livinityd-side test counts (NOT in nexus chain — run via vitest):

| Suite | Tests |
|-------|-------|
| `parse-usage.test.ts` | 9 |
| `database.test.ts` | 4 |
| `capture-middleware.test.ts` | 6 |
| `aggregations.test.ts` | 6 |
| `routes.test.ts` | 5 |
| `schema-migration.test.ts` | 4 |
| `integration.test.ts` | 5 |
| **Total Phase 44 new livinityd tests** | **39** |

(Plan estimate was 32; actual 39 because each suite added 1-2 extra defensive
cases during execution.)

## Honest Deferrals

| Item | Reason | Owner |
|------|--------|-------|
| `app_id` reverse lookup may resolve null | Container IPs may not match dockerode lookup pattern (custom networks, host network) | D-44-07 — observability not security |
| Auto tier detection | Hardcoded `pro` (200/day); Max5x and Max20x users see incorrect threshold percentages | D-44-08 — future enhancement |
| Cost forecasting | Out of v29.3 scope | FR-DASH-future-01 |
| Per-request audit trail / message logging | Privacy + storage cost; Phase 44 stores token counts only | FR-OBS-future-01, D-44-25 |
| Configurable rate limits via Redis | Hardcoded for v29.3 | D-44-08 |
| OpenAI SSE usage tracking | Current OpenAI SSE adapter doesn't emit a `usage` chunk; sync OpenAI tracks correctly | AUDIT.md Section 6 |
| Push notifications when token-expiring-soon | Out of scope | Future |
| CSV / JSON export | Out of scope | Future |
| Webhook on rate-limit-reached | Out of scope | Future |
| Real-traffic 80% UAT | Synthetic INSERT shortcut documented; natural-traffic UAT deferred | Section E.2 of 44-UAT.md |
| Mini PC deploy + UAT walkthrough | Operator action per scope_boundaries | Operator |
| supertest dep | Not introduced — manual req/res stubs used instead (Plan 44-02 + Plan 44-05) | Scope: no new deps |

## Pre-existing Issues NOT Addressed by Phase 44

- 534 pre-existing TypeScript errors in `livos/packages/ui` (deferred from prior
  phases). Phase 44 introduces ZERO new TS errors.
- 2 pre-existing TS errors in `livos/packages/livinityd/source/modules/server/trpc/index.ts`
  (lines 62, 76 — WebSocket handler typing). Phase 44 introduces ZERO new TS
  errors in this file beyond the pre-existing baseline.

## v29.3 Milestone Status — FEATURE-COMPLETE LOCALLY

All 6 phases of v29.3 are shipped locally:

| Phase | Title | Reqs | Status |
|-------|-------|------|--------|
| 39 | Risk Fix — Close OAuth Fallback | FR-RISK-01 | ✅ Shipped |
| 40 | Per-User Claude OAuth + HOME Isolation | FR-AUTH-01..03 | ✅ Shipped |
| 41 | Anthropic Messages Broker | FR-BROKER-A-01..04 | ✅ Shipped |
| 42 | OpenAI-Compatible Broker | FR-BROKER-O-01..04 | ✅ Shipped |
| 43 | Marketplace Integration (MiroFish) | FR-MARKET-01..02 | ✅ Shipped |
| **44** | **Per-User Usage Dashboard** | **FR-DASH-01..03** | **✅ Shipped (this phase)** |

**17 / 17 requirements satisfied (mechanism-pass).**

Sacred file SHA stays at `623a65b9a50a89887d36f770dcd015b691793a7f` across all
6 phases. Broker module byte-identical to its Phase 42 baseline across Phases
43 + 44.

## Recommendation for Next Step

**Phase 44 mechanism is COMPLETE locally. v29.3 is feature-complete.**

Operator next steps (in order):
1. Code review the 5 Phase 44 commits + summary:
   `git show 686a1030 f8f8775b aa2e96c2 e3f1dd86 f38897e6`
2. Run nexus chain: `cd nexus/packages/core && npm run test:phase44`
3. Run livinityd suite: `cd livos/packages/livinityd && pnpm exec vitest run source/modules/usage-tracking/`
4. `git push origin master` (currently 44+ commits ahead)
5. Mini PC deploy: `ssh -i ~/.ssh/minipc bruce@10.69.31.68 "sudo bash /opt/livos/update.sh"`
6. Walk all 6 UAT files in order:
   - `.planning/phases/39-risk-fix-close-oauth-fallback/...` (claude.ts code-path absence)
   - `.planning/phases/40-per-user-claude-oauth-home-isolation/40-UAT.md`
   - `.planning/phases/41-anthropic-messages-broker/41-UAT.md`
   - `.planning/phases/42-openai-compatible-broker/42-UAT.md`
   - `.planning/phases/43-marketplace-integration-anchor-mirofish/43-UAT.md`
   - `.planning/phases/44-per-user-usage-dashboard/44-UAT.md` (this phase)
7. Mark v29.3 SHIPPED in PROJECT.md (move from "Current milestone" to "Validated").
8. Begin v30.0 (Backup & Restore — DEFINED, paused; needs phase renumber to start at Phase 45).

## Self-Check: PASSED

All claims verified via filesystem and git:

```
$ git log --oneline -5 .planning/phases/44-per-user-usage-dashboard/
f38897e6 test(44-05): integration + schema regression + test:phase44 + UAT (FR-DASH-01..03)
e3f1dd86 feat(44-04): per-user usage dashboard UI (FR-DASH-01, FR-DASH-02, FR-DASH-03)
aa2e96c2 feat(44-03): tRPC usage router (getMine + getAll) (FR-DASH-02, FR-DASH-03)
f8f8775b feat(44-02): broker_usage capture middleware + schema (FR-DASH-01)
686a1030 docs(44-01): codebase audit for per-user usage dashboard (Phase 44 prep)

$ ls livos/packages/livinityd/source/modules/usage-tracking/
aggregations.test.ts  capture-middleware.test.ts  database.test.ts  index.ts                   integration.test.ts        parse-usage.test.ts  routes.test.ts        schema-migration.test.ts
aggregations.ts       capture-middleware.ts       database.ts       container-resolver.ts      parse-usage.ts             routes.ts

$ ls livos/packages/ui/src/routes/settings/_components/ | grep -E "(usage|per-app|daily|admin-cross)"
admin-cross-user-view.tsx
daily-counts-chart.tsx
per-app-table.tsx
usage-banner.tsx
usage-section.tsx

$ pnpm exec vitest run source/modules/usage-tracking/ → 39/39 pass
$ npm run test:phase44 → full v29.3 nexus chain pass
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts → 623a65b9a50a89887d36f770dcd015b691793a7f
$ git diff 686a1030~1 HEAD -- livos/packages/livinityd/source/modules/livinity-broker/ → 0 lines
```

All 5 commits exist. All deliverable files exist. All tests pass. Sacred file +
broker module byte-identical to Phase 42 baseline. v29.3 milestone is
feature-complete locally.

---

*Phase 44 — Per-User Usage Dashboard — FINAL phase of v29.3 Marketplace AI Broker.*
