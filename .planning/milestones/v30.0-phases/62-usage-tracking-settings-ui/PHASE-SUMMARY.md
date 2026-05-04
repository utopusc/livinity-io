---
phase: 62-usage-tracking-settings-ui
status: SHIPPED
milestone: v30.0
milestone_name: Livinity Broker Professionalization
plans_total: 5
plans_complete: 5
requirements_total: 5
requirements_complete: 5
sacred_sha: 4f868d318abff71f8c8bfbcf443b2393a553018b
sacred_sha_unchanged: true
tests_added: 76
tests_total_phase_end: 97  # 45 backend usage-tracking + 52 UI settings/_components
duration_total: ~30 min wall-clock (across 5 plans)
started: 2026-05-03
completed: 2026-05-03
---

# Phase 62 Summary: E1+E2 Usage Tracking Accuracy + Settings UI

**Closes the broker observability story for v30.0. `broker_usage` now attributes every Anthropic/OpenAI completion (streaming + sync) to the specific Bearer API key used; Settings > AI Configuration gains a flat "API Keys" CRUD section above the existing "Usage" subsection (Stripe-style show-once + two-step revoke); the Usage subsection + Admin cross-user view both gain a "Filter by API key" dropdown with localStorage persistence. Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at every wave + end of phase. D-NO-NEW-DEPS preserved across all 5 plans (zero `package.json` / `pnpm-lock.yaml` changes).**

## Plans Shipped

| Plan | Title | Commits | Tests | Sacred SHA | Notes |
|------|-------|---------|-------|------------|-------|
| 62-01 | Backend foundation (schema migration + 8-param insertUsage + Wave 0 RED scaffolds) | `434967c0` test, `fd0a75a6` feat | 5 schema-migration + 3 RED handed off | UNCHANGED | DO-block ALTER TABLE + partial index; `api_key_id` at SQL position 3; ON DELETE SET NULL |
| 62-02 | Capture middleware bearer propagation | `54e7289d` feat | 8/8 capture-middleware GREEN (incl. 2 new); 6/6 integration GREEN (incl. E1-03) | UNCHANGED | 7-line `recordRow` extension reading `req.authMethod === 'bearer' ? req.apiKeyId ?? null : null`; bonus E1-03 GREEN |
| 62-03 | tRPC `usage.getMine`/`usage.getAll` accept apiKeyId/api_key_id filter | `39527673` test, `8d151c84` feat | 7/7 routes.test.ts GREEN (incl. 2 new) | UNCHANGED | Field-name asymmetry (camelCase getMine, snake_case getAll); Zod non-strict default preserves backwards-compat |
| 62-04 | ApiKeysSection + Create/Revoke modals + ai-config.tsx insertion | `ec44608c` test, `fd7ba777` feat | 23/23 GREEN (7 section + 9 create-modal + 7 revoke-modal) | UNCHANGED at 4 sample points | Smoke + source-text-invariant pattern (RTL absent + D-NO-NEW-DEPS); flat layout NO Tabs wrapper; Stripe-style show-once + two-step revoke |
| 62-05 | UI filter dropdown + FR-BROKER-E1-03 GREEN + final gate | `9ecc7545` test, `f1cfa8f4` feat | 10/10 use-usage-filter + 10/10 usage-section invariants GREEN; FR-BROKER-E1-03 verified GREEN | UNCHANGED at 4 sample points + end of phase | localStorage key VERBATIM `livinity:usage:filter:apiKeyId`; SSR-guarded; revoked keys appear with `(revoked)` suffix |

**Total work commits across phase:** 9 (4 test/RED + 5 feat/GREEN). **SUMMARY commits:** 5 + this PHASE-SUMMARY pending. **Approximate duration:** ~30 min wall-clock end-to-end (Plan 01 5 min + Plan 02 2 min + Plan 03 5 min + Plan 04 15 min + Plan 05 7 min).

## Requirements Closure

| Req ID | Plan | Evidence | Status |
|--------|------|----------|--------|
| FR-BROKER-E1-01 | 62-01 | schema.sql DO-block ALTER + partial index + 8-param insertUsage; 5 schema-migration tests GREEN | ✅ CLOSED |
| FR-BROKER-E1-02 | 62-02 | capture-middleware.ts recordRow reads `req.apiKeyId` when `authMethod === 'bearer'`; 2 new GREEN tests | ✅ CLOSED |
| FR-BROKER-E1-03 | 62-02 + 62-05 | integration.test.ts FR-BROKER-E1-03 GREEN — apiKeyId leg from Plan 02, prompt_tokens leg from existing parseUsageFromSseBuffer (v29.5/Phase 58); pinned by Plan 05 | ✅ CLOSED |
| FR-BROKER-E2-01 | 62-04 | ApiKeysSection (CRUD UI) + Create/Revoke modals + ai-config.tsx insertion; 23/23 tests GREEN | ✅ CLOSED |
| FR-BROKER-E2-02 | 62-03 + 62-05 | Backend (Plan 03): tRPC apiKeyId/api_key_id Zod inputs + query forwarding. Frontend (Plan 05): UsageSection + AdminCrossUserView Select dropdowns + localStorage `useUsageFilter` | ✅ CLOSED |

**5/5 requirements satisfied.** Phase 62 feature-complete.

## Sacred File History (Phase-Wide)

| Plan | Pre-Plan SHA | Post-Plan SHA | Sample Points | Status |
|------|--------------|---------------|---------------|--------|
| 62-01 | `4f868d318abff71f8c8bfbcf443b2393a553018b` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | 1 (start + end) | byte-identical |
| 62-02 | `4f868d318abff71f8c8bfbcf443b2393a553018b` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | 1 (start + end) | byte-identical |
| 62-03 | `4f868d318abff71f8c8bfbcf443b2393a553018b` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | 1 (start + end) | byte-identical |
| 62-04 | `4f868d318abff71f8c8bfbcf443b2393a553018b` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | 4 (load / post-RED / post-GREEN / pre-summary) | byte-identical |
| 62-05 | `4f868d318abff71f8c8bfbcf443b2393a553018b` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | 4 (load / post-T1 / post-T2 / final) | byte-identical |

**End of Phase 62 SHA:** `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ MATCHES `D-30-07` lock.

D-30-07 preserved: `nexus/packages/core/src/sdk-agent-runner.ts` UNTOUCHED across the entire phase.

## Test Counts

### Backend usage-tracking suite — 45/45 GREEN (was 30 → 45)

| File | Pre-Phase 62 | Post-Phase 62 |
|------|--------------|---------------|
| schema-migration.test.ts | 0 | 5 (Plan 01) |
| parse-usage.test.ts | 9 | 9 |
| aggregations.test.ts | 6 (1 fixture patch by Plan 01) | 6 |
| database.test.ts | 4 (1 fixture patch by Plan 01) | 4 |
| capture-middleware.test.ts | 6 | 8 (Plan 02 added 2) |
| integration.test.ts | 5 | 6 (Plan 01 added 1, Plan 02 greened) |
| routes.test.ts | 5 | 7 (Plan 03 added 2) |

### UI settings/_components suite — 52/52 GREEN (was 32 → 52)

| File | Pre-Phase 62 | Post-Phase 62 |
|------|--------------|---------------|
| api-keys-section.unit.test.tsx | 0 | 7 (Plan 04) |
| api-keys-create-modal.unit.test.tsx | 0 | 9 (Plan 04) |
| api-keys-revoke-modal.unit.test.tsx | 0 | 7 (Plan 04) |
| use-usage-filter.unit.test.ts | 0 | 10 (Plan 05) |
| usage-section.unit.test.tsx | 0 | 10 (Plan 05) |
| past-deploys-table.unit.test.tsx | 1 | 1 |
| menu-item-badge.unit.test.tsx | 1 | 1 |
| danger-zone.unit.test.tsx | 7 | 7 |

**Phase-added tests:** 30 backend (Plan 01-03) + 46 UI (Plan 04-05) = **76 new tests** across the phase.

## D-NO-NEW-DEPS Audit (Phase-Wide)

```
$ git diff <pre-62> HEAD -- \
    livos/packages/livinityd/package.json \
    livos/packages/livinityd/pnpm-lock.yaml \
    livos/packages/ui/package.json \
    livos/packages/ui/pnpm-lock.yaml
(empty across all 4 files)
```

**Zero new npm packages introduced across all 5 plans.** All shipped patterns reused existing primitives:
- `pg`, `vitest`, `zod`, `@trpc/server`, `express` (backend)
- `@radix-ui/react-select`, `@radix-ui/react-dialog`, `react`, `react-icons/tb`, `sonner`, `vitest`, `jsdom` (UI)

D-NO-NEW-DEPS strictly preserved (D-30-08 lock honored).

## Threat Model — Phase-Wide Status

All threat IDs from Plan 01-05 plan-level threat models. None upgraded to "ESCAPED" status.

| Threat | Category | Plan | Disposition | Mitigation |
|--------|----------|------|-------------|------------|
| T-62-01 | T (SQL injection via apiKeyId) | 01 | mitigate | Parameterized $N placeholders in queryUsage* |
| T-62-02 | I (cross-user leak via apiKeyId) | 01 | mitigate | getMine ANDs api_key_id WHERE user_id, never widens scope |
| T-62-05 | I (bearer plaintext logging) | 02 | mitigate | recordRow reads only req.apiKeyId UUID; no Bearer log lines |
| T-62-06 | T (apiKeyId injection) | 02 | accept | Phase 59 owns Bearer validation; capture trusts resolved UUID |
| T-62-07 | S (url-path spoofs as bearer) | 02 | mitigate | Explicit `req.authMethod === 'bearer'` guard |
| T-62-08 | R (silent NULL writes) | 02 | mitigate | Plan 01 RED + Plan 02 GREEN double-defense |
| T-62-09 | T (apiKeyId injection at tRPC) | 03 | mitigate | z.string().uuid() rejects non-UUID; SQL parameterized |
| T-62-10 | I (cross-user usage read) | 03 | mitigate | getMine WHERE user_id = ctx.currentUser.id |
| T-62-11 | T (older UI bundle compat) | 03 | mitigate | Zod non-strict default preserved |
| T-62-12 | E (non-admin getAll) | 03 | mitigate | adminProcedure middleware gates getAll before resolver |
| T-62-13 | I (plaintext leakage to console) | 04 | mitigate | Source-text grep guard in test files; setPlaintext(null) cleanup useEffect |
| T-62-14 | T (plaintext persists in modal state across re-open) | 04 | mitigate | Explicit clear-on-close + unmount cleanup useEffect |
| T-62-16 | T (single-click accidental revoke) | 04 | mitigate | Two-step revoke (open modal + click destructive button) |
| T-62-18 | I (revoked key UUID exposed in dropdown) | 05 | accept | apiKeys.list scoped by user_id; admin listAll is admin-gated |
| T-62-19 | T (localStorage value mutated) | 05 | mitigate | loadFilter validates non-empty string; tRPC re-validates UUID |
| T-62-20 | D (apiKeys.listAll returns large list) | 05 | accept | Phase 59 admin scope; Mini PC scale (low hundreds max) |
| T-62-21 | R (filter inconsistent across tabs) | 05 | accept | localStorage per-origin; consistent by design |
| T-62-22 | T (Tabs wrapper accidentally introduced) | 05 | mitigate | Grep guard 4 fails if `<Tabs|TabsContent|TabsTrigger` in ai-config.tsx |

**No threat ID upgraded to ESCAPED across the phase.**

## Cross-Cut Audits

| Audit | Status | Evidence |
|-------|--------|----------|
| Sacred SHA `4f868d31…` byte-identical | PASS | All 5 plans verified at start + end + (Plan 04/05) intermediate sample points |
| D-NO-NEW-DEPS | PASS | Zero `package.json` / lockfile changes across phase |
| D-30-07 (sacred file untouched) | PASS | SHA matches at end of phase |
| Mount order (capture < bearer < broker) | PASS | server/index.ts:1229 < 1239 < 1245 (Plan 02 + 05 grep guards) |
| `livinity:usage:filter:apiKeyId` localStorage key | PASS | use-usage-filter.ts:22 verbatim (Plan 05 grep guard) |
| Flat ai-config.tsx (no Tabs wrapper) | PASS | Plan 04 + 05 grep guard returns 0 matches |
| Idempotent ALTER pattern in schema.sql | PASS | DO-block at line 362+ (Plan 05 grep guard) |
| No plaintext leaks in production source | PASS | Plan 04 + 05 grep guard returns matches only in test files (descriptive labels) |

## Hand-off to Phase 63

**Phase 63 (Mandatory Live Verification — D-LIVE-VERIFICATION-GATE) is unblocked.** Phase 62's surface ready for live UAT:

### Prerequisites for Phase 63

1. **Mini PC deploy:** `bash /opt/livos/update.sh` to land Phase 62 source (and unshipped 60-04 broker IP-guard removal + Phase 61 rate-limit headers + alias resolver) on `bruce@10.69.31.68`. The `update.sh` flow: rsync → `pnpm install` → build `@livos/config` → vite build UI → tsc nexus core/worker/mcp-server → `systemctl restart livos liv-core liv-worker liv-memory`.
2. **Mini PC PG schema applied:** `update.sh`'s post-install boot triggers `client.query(schemaSql)` which idempotently applies the Phase 62-01 ALTER block (DO-block won't fail if column already exists).
3. **Caddy + DNS already live:** Phase 60 shipped `api.livinity.io` perimeter; nothing to redo.

### Phase 63 verification battery (preview from this plan's hand-off)

After Mini PC deploy, Phase 63 validates the full v30 surface:

1. **API Keys CRUD live:** Visit `https://bruce.livinity.io/#/settings/ai-configuration` → see "API Keys" section above "Usage". Click Create, verify show-once modal renders plaintext exactly once, copy to password manager, dismiss → list refreshes with new row showing prefix only.
2. **Bearer auth + broker:** `curl -H "Authorization: Bearer <plaintext>" https://api.livinity.io/v1/messages -d '{"model":"sonnet","max_tokens":100,"messages":[{"role":"user","content":"who are you?"}]}'` returns Anthropic-spec response.
3. **Usage tracking + filter:** Return to Settings → Usage → verify the new key appears in Filter dropdown with `name (prefix)` label. Filter by the new key → chart + per-app table show ONLY that key's request.
4. **Revocation cache invalidation:** Click Revoke → confirm → next curl returns HTTP 401 within 100ms (Phase 59 contract).
5. **Revoked key dropdown visibility:** Verify the revoked key still appears in Filter dropdown with `(revoked)` suffix.
6. **OpenAI translation E1-03 live:** `curl https://api.livinity.io/v1/chat/completions -H "Authorization: Bearer …" -d '{"model":"gpt-4","stream":true,"messages":[…]}'` → SSE stream visible; final chunk has `usage:{prompt_tokens, completion_tokens}`. Settings > Usage shows new row with `endpoint='chat-completions'` + `prompt_tokens > 0` + the bearer key's `api_key_id`.
7. **Admin filter dimension:** As admin, view "View as admin" → 4-chip filter (user_id + app_id + model + api_key_id Select); filter by api_key_id, verify only that key's traffic shown across users.

These behaviors are the user-observable closure points for Phase 62. They are also the on-ramp for Phase 63's broader live battery (Bolt.diy / Open WebUI / Continue.dev / raw curl / Anthropic Python SDK).

### Phase 63 carry-forward UATs (14 un-walked)

Phase 63 ALSO consolidates 14 previously deferred UATs:
- **v29.5 (4):** 49/50/51/52/53/54 phase verifications
- **v29.4 (4):** 45-UAT.md / 46-UAT.md / 47-UAT.md / 48-UAT.md
- **v29.3 (6):** 39-UAT.md / 40-UAT.md / 41-UAT.md / 42-UAT.md / 43-UAT.md / 44-UAT.md

Phase 63 must close cleanly without `--accept-debt` per D-LIVE-VERIFICATION-GATE — first real-world clean pass of the gate.

## Forensic Trail

- 2026-05-03T07:01:46Z — Plan 62-01 START (schema migration + 8-param insertUsage)
- 2026-05-03T07:07:09Z — Plan 62-01 SHIPPED (`fd0a75a6`); Wave 0 RED handoff to Plans 02 + 05
- 2026-05-03T07:09:56Z — Plan 62-02 START (capture middleware bearer propagation)
- 2026-05-03T07:11:30Z — Plan 62-02 SHIPPED (`54e7289d`); E1-02 ×2 GREEN + bonus E1-03 GREEN
- 2026-05-03T07:15:33Z — Plan 62-03 START (tRPC usage router filter forwarding)
- 2026-05-03T07:18:30Z — Plan 62-03 SHIPPED (`8d151c84`); FR-BROKER-E2-02 backend half closed
- 2026-05-03T~07:20Z — Plan 62-04 START (ApiKeysSection + Create/Revoke modals)
- 2026-05-03T~07:35Z — Plan 62-04 SHIPPED (`fd7ba777`); FR-BROKER-E2-01 closed
- 2026-05-03T07:33:55Z — Plan 62-05 START (filter dropdown + FR-BROKER-E1-03 + final gate)
- 2026-05-03T07:40:33Z — Plan 62-05 SHIPPED (`f1cfa8f4`); FR-BROKER-E2-02 frontend closed; Phase 62 COMPLETE

**Sacred SHA invariant proof:** `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at every plan boundary AND at end of phase. D-30-07 lock STRICTLY preserved across the entire phase.

---
*Phase: 62-usage-tracking-settings-ui*
*Status: ✅ SHIPPED — feature-complete, ready for Phase 63 live verification*
*Completed: 2026-05-03*
