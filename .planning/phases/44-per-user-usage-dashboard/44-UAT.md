# Phase 44 — Per-User Usage Dashboard — UAT (operator)

**Final phase of v29.3 Marketplace AI Broker.**

This UAT walks an operator through Mini PC verification of all 4 ROADMAP
Phase 44 success criteria. Synthetic-data shortcuts are documented for the
two scenarios that are infeasible to trigger via real traffic during a UAT
session (80% threshold and live 429).

---

## Section 0 — Test command summary

Local test runs (no deploy required):

```bash
# Nexus-side chained test surface (Phases 39 → 40 → 41 → 42 → 43 → 44):
cd nexus/packages/core && npm run test:phase44

# Livinityd-side Phase 43 + Phase 44 vitest suites:
cd livos/packages/livinityd && \
  pnpm exec vitest run \
    source/modules/apps/inject-ai-provider.test.ts \
    source/modules/apps/install-for-user-injection.test.ts \
    source/modules/apps/manifest-mirofish.test.ts \
    source/modules/usage-tracking/
```

Phase 44 livinityd test counts (in order):

| Suite | Tests |
|-------|-------|
| `parse-usage.test.ts` | 9 |
| `database.test.ts` | 4 |
| `capture-middleware.test.ts` | 6 |
| `aggregations.test.ts` | 6 |
| `routes.test.ts` | 5 |
| `schema-migration.test.ts` | 4 |
| `integration.test.ts` | 5 |
| **Total Phase 44 new tests** | **39** |

(Note: the plan estimated 32; actual count is 39 because each subsection
gained 1-2 extra defensive cases during execution.)

---

## Section A — Mini PC deploy prerequisites

This UAT assumes the operator has already shipped Phases 39-43 to the Mini PC
(per their respective UATs). Phase 44 commits sit on `master` locally and need
deploy:

```bash
git push origin master

ssh -i ~/.ssh/minipc bruce@10.69.31.68
sudo bash /opt/livos/update.sh

# Wait for "Deploy succeeded" — should restart livos / liv-core / liv-worker / liv-memory
```

Verify livinityd is up:

```bash
sudo systemctl status livos
sudo journalctl -u livos -n 50 --no-pager | grep -E "(usage-tracking|broker)"
```

Expected:
```
[usage-tracking] capture middleware mounted at /u/:userId/v1 (BEFORE broker)
[livinity-broker] routes mounted at /u/:userId/v1/messages
```

The capture middleware MUST mount BEFORE the broker — log order is the
operator-visible verification.

---

## Section B — Schema migration verification (D-44-20)

```bash
ssh -i ~/.ssh/minipc bruce@10.69.31.68

# Get DATABASE_URL password if needed:
grep DATABASE_URL /opt/livos/.env

sudo -u postgres psql livos -c "\\d broker_usage"
sudo -u postgres psql livos -c "\\di idx_broker_usage_*"
```

Expected output: `broker_usage` table exists with all 9 columns from D-44-01;
both `idx_broker_usage_user_created` and `idx_broker_usage_app` indexes exist.

Idempotency check (re-running the schema):

```bash
# Restart livinityd. schema.sql is applied at startup (initDatabase).
sudo systemctl restart livos
sudo journalctl -u livos -n 30 --no-pager | grep -i "schema applied"
```

Expected: no SQL errors. Logs show "Database schema applied successfully"
(idempotent CREATE TABLE/INDEX IF NOT EXISTS).

---

## Section C — SC #1: Per-user dashboard populates after broker traffic (FR-DASH-01)

> ROADMAP: After a user makes marketplace-app requests using their Claude
> subscription, Settings > AI Integrations shows their cumulative input +
> output tokens, request count broken down by app, and current-month total.

### Setup

1. Confirm Phase 43 marketplace integration is deployed and MiroFish is
   installed for User A (Phase 43 UAT Section D).
2. Confirm User A has run `claude login` per Phase 40 UAT.

### Steps

1. Log into LivOS as User A: `https://<user-a>.livinity.io`.
2. Open MiroFish from the launcher (it's the marketplace AI app).
3. Type a prompt in MiroFish: e.g., "What is 2+2?"
4. Wait for the Claude response.
5. Open Settings → AI Configuration. Scroll to the bottom.

### Expected (PASS)

- "Usage" section is the LAST section on the page.
- Three stat cards show:
  - "Today: 1 / 200" (or higher if more requests sent) with "0% of pro cap"
    (or "1% of pro cap" depending on count)
  - "Prompt tokens (30d): N" where N > 0
  - "Completion tokens (30d): M" where M > 0
- Last 30 days bar chart shows today's bar with height 1+ requests.
- Per-app table shows one row:
  - App: `mirofish_user-a` (or whatever `app_id` reverse lookup resolves;
    MAY be `(unresolved)` per D-44-07 — see Honest Deferrals)
  - Requests: 1+
  - Prompt tokens: matches the cumulative
  - Completion tokens: matches the cumulative
  - Last used: today's UTC timestamp

### Synthetic shortcut (if MiroFish UAT didn't run yet)

If Phase 43 isn't fully wired but you want to verify the dashboard renders:

```bash
ssh -i ~/.ssh/minipc bruce@10.69.31.68
sudo -u postgres psql livos -c "
  INSERT INTO broker_usage (user_id, app_id, model, prompt_tokens, completion_tokens, request_id, endpoint)
  SELECT id, 'mirofish_test', 'claude-sonnet-4-6', 25, 12, 'msg_synthetic', 'messages'
  FROM users WHERE username = '<user-a-username>';
"
```

Refresh Settings > AI Configuration. The Usage section now shows the synthetic
row with prompt_tokens=25, completion_tokens=12.

---

## Section D — SC #2: Admin cross-user view (FR-DASH-02)

> ROADMAP: Admin user sees a multi-user filterable view: per-app usage stats
> showing which user, which model, request count, and token total — with
> filter chips for user / app / model.

### Steps

1. Log out of User A. Log in as the admin user.
2. Open Settings → AI Configuration → scroll to Usage section.
3. Verify a "View as admin" link/button is visible (top-right of the Usage
   section).
4. Click "View as admin".
5. Verify three filter input boxes render: "Filter by user_id (UUID)",
   "Filter by app_id", "Filter by model".

### Expected (PASS)

- Cross-user totals (Total requests / Prompt tokens / Completion tokens) sum
  across ALL users, not just admin.
- Per-app table aggregates across users.
- Entering User A's UUID into "user_id" filter restricts the view to A's
  rows only.
- Entering "mirofish" into "app_id" filter restricts to MiroFish-only rows
  (across all users).

### Negative test

1. Log out as admin. Log in as a non-admin user (member or guest).
2. Open Settings → AI Configuration → Usage section.
3. Verify NO "View as admin" toggle is visible.

The toggle is hidden because the silent admin probe (`usage.getAll`) returns
TRPCError code='FORBIDDEN' for non-admins. Backend (Plan 44-03 Test T4) is
the authoritative gate; UI hide is cosmetic.

---

## Section E — SC #3: 80% warning banner (FR-DASH-03)

> ROADMAP: When a user reaches 80% of their Claude subscription daily rate
> limit (Pro 200/day), a non-blocking warning banner appears in the AI
> Integrations panel showing remaining requests; banner disappears at next
> day's reset.

### Synthetic shortcut (E.1) — recommended for UAT

Triggering 160 real Claude requests in a session is impractical. Insert
synthetic rows:

```bash
ssh -i ~/.ssh/minipc bruce@10.69.31.68

# 161 synthetic rows = 80.5% of pro cap (200) → yellow banner
sudo -u postgres psql livos -c "
  INSERT INTO broker_usage (user_id, app_id, model, prompt_tokens, completion_tokens, request_id, endpoint)
  SELECT u.id, 'mirofish_test', 'claude-sonnet-4-6', 10, 5, 'msg_' || g, 'messages'
  FROM users u, generate_series(1, 161) g
  WHERE u.username = '<user-a-username>';
"
```

Refresh Settings > AI Configuration as User A.

### Expected (PASS)

- Yellow warning banner above the stat cards reads:
  "161/200 daily messages used (pro tier)"
- Subtitle: "Resets at midnight UTC."
- Today stat card: "Today: 161 / 200" with "80% of pro cap"

### Cleanup

```bash
sudo -u postgres psql livos -c "
  DELETE FROM broker_usage
  WHERE app_id = 'mirofish_test' AND request_id LIKE 'msg_%';
"
```

### Real-traffic E.2 (deferred)

A natural-usage UAT requires sustained MiroFish chatting over hours. Defer
to natural usage observation post-deploy.

---

## Section F — SC #4: 429 propagation + UI surfacing (FR-DASH-03)

> ROADMAP: When a user's subscription returns HTTP 429 from Anthropic, the
> broker propagates the 429 (with Retry-After header) back to the calling
> marketplace app, AND the AI Integrations UI surfaces the rate-limit-reached
> state to the user.

### 429 broker propagation (Phase 41/42 — already verified)

This was tested in Phase 41/42 UATs. Confirm with:

```bash
sudo -u postgres psql livos -c "SELECT count(*) FROM broker_usage WHERE endpoint = '429-throttled';"
```

If count is 0, force a synthetic throttle row to verify UI surface:

```bash
sudo -u postgres psql livos -c "
  INSERT INTO broker_usage (user_id, app_id, model, prompt_tokens, completion_tokens, request_id, endpoint, created_at)
  SELECT id, 'mirofish_test', 'claude-sonnet-4-6', 0, 0, NULL, '429-throttled', NOW() - INTERVAL '5 minutes'
  FROM users WHERE username = '<user-a-username>';
"
```

Refresh Settings > AI Configuration as User A.

### Expected (PASS)

- Red critical banner above the stat cards reads:
  "Subscription cap reached (pro tier)"
- Subtitle: "Last 429 at <UTC timestamp> UTC. Resets at midnight UTC."
- Timestamp formatting MUST be in UTC (the broker_usage row's created_at,
  formatted with `{timeZone: 'UTC'}` per Plan 44-04).
- Banner uses red color tokens (border-red-500/30, bg-red-500/10).

### Cleanup

```bash
sudo -u postgres psql livos -c "
  DELETE FROM broker_usage WHERE app_id = 'mirofish_test' AND endpoint = '429-throttled';
"
```

---

## Section G — Sacred + broker integrity (FINAL Phase 44 verification)

```bash
# From your local repo:
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
# MUST be: 623a65b9a50a89887d36f770dcd015b691793a7f

# Phase 44 cumulative diff:
PHASE44_BASE=$(git log --oneline | grep '44-01.*audit' | head -1 | awk '{print $1}')~1
echo "Phase 44 baseline: $PHASE44_BASE"
git diff "$PHASE44_BASE" HEAD -- nexus/packages/core/src/sdk-agent-runner.ts | wc -l
# MUST be: 0

git diff "$PHASE44_BASE" HEAD -- livos/packages/livinityd/source/modules/livinity-broker/ | wc -l
# MUST be: 0

# Strict broker-import grep on usage-tracking:
grep -rEn '^(import|from).*livinity-broker' livos/packages/livinityd/source/modules/usage-tracking/
# Expected: zero matches (only doc comments mention the boundary)
```

Phase 44's structural promise: "broker stays edit-frozen, sacred stays
untouched, usage-tracking imports nothing from broker." If any of these checks
fails, the phase has been violated and a follow-up commit must restore the
invariant.

---

## Section H — Honest deferrals

| Item | Reason | Plan/Tag |
|------|--------|----------|
| `app_id` reverse lookup may resolve `null` | Container IPs may not match the dockerode lookup pattern (Mini PC custom networks, or container not in default `bridge`) | D-44-07 — observability, not security |
| Auto tier detection | Manual hardcoded `pro` (200/day). Max5x and Max20x users see incorrect threshold percentages | D-44-08 — future enhancement |
| Cost forecasting (predict end-of-month) | Out of v29.3 scope | FR-DASH-future-01 |
| Per-request audit trail / message logging | Privacy + storage cost. Phase 44 stores token counts only, never message content | FR-OBS-future-01, D-44-25 |
| Configurable rate limits via Redis | Hardcoded for v29.3; future: Redis-backed override | D-44-08 |
| OpenAI SSE usage tracking | Current OpenAI SSE adapter does NOT emit a `usage` chunk. Sync OpenAI requests track correctly. Streaming OpenAI silently no-ops (no row, no log spam) | AUDIT.md Section 6 |
| Push notifications when token-expiring-soon | Out of scope | Future |
| CSV / JSON export | Out of scope | Future |
| Webhook on rate-limit-reached | Out of scope | Future |
| Real-traffic 80% UAT (Section E.2) | Requires hours of natural usage; synthetic shortcut (E.1) is the practical UAT | Operator preference |
| Live MiroFish UI verification (Section C real path) | Requires Phase 43 MiroFish UAT to be complete | Phase 43 dependency |

---

## Section I — v29.3 Milestone Closure

Phase 44 is the FINAL phase of v29.3. After this UAT passes:

1. **All 6 phases** of v29.3 are shipped locally:
   - Phase 39: Risk Fix (FR-RISK-01) ✅
   - Phase 40: Per-User OAuth (FR-AUTH-01..03) ✅
   - Phase 41: Anthropic Messages Broker (FR-BROKER-A-01..04) ✅
   - Phase 42: OpenAI-Compatible Broker (FR-BROKER-O-01..04) ✅
   - Phase 43: Marketplace Integration (FR-MARKET-01..02) ✅
   - Phase 44: Per-User Usage Dashboard (FR-DASH-01..03) ✅
2. **All 17 FR-* requirements** are satisfied (mechanism-pass; live UATs may
   defer per individual phase summaries).
3. **Sacred file SHA stays at `623a65b9a50a89887d36f770dcd015b691793a7f`**
   throughout v29.3.
4. **Broker module is byte-identical** to its Phase 42 baseline across
   Phases 43 + 44.

### Recommended deploy + UAT order

1. `git push origin master` (40+ commits ahead of origin)
2. `bash /opt/livos/update.sh` on Mini PC
3. Walk through each phase UAT in order:
   - 39-UAT.md (claude.ts code-path absence)
   - 40-UAT.md (per-user OAuth — 27 steps)
   - 41-UAT.md (Anthropic broker)
   - 42-UAT.md (OpenAI broker — Python SDK smoke test)
   - 43-UAT.md (MiroFish marketplace anchor)
   - 44-UAT.md (this document)
4. Mark v29.3 SHIPPED in PROJECT.md and ROADMAP.md.
5. Begin v30.0 (Backup & Restore — currently DEFINED, paused).

---

*Phase 44 Plan 44-05. Final UAT for v29.3 milestone.*
