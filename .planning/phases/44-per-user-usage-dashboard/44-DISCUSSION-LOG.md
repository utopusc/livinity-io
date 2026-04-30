# Phase 44: Per-User Usage Dashboard - Discussion Log

> **Audit trail only.** Decisions in 44-CONTEXT.md.

**Date:** 2026-04-30
**Phase:** 44-per-user-usage-dashboard (FINAL phase of v29.3)
**Mode:** `--chain` (Claude presented 8-decision batch summary, user accepted all)

## Batch Decision Summary

| # | Decision | Recommended | Selected |
|---|----------|-------------|----------|
| 1 | DB table | NEW `broker_usage` table (id, user_id, app_id, model, prompt_tokens, completion_tokens, request_id, endpoint, created_at) | ✓ |
| 2 | Capture method | Express response middleware OUTSIDE broker (broker source stays edit-frozen) | ✓ |
| 3 | User dashboard | Settings > AI Configurations > new "Usage" subsection | ✓ |
| 4 | Admin dashboard | Same UI, admin toggle → cross-user filterable view | ✓ |
| 5 | Rate limit | Hardcoded Pro=200/day, warn at 80% (Max tier deferred to Redis config) | ✓ |
| 6 | 429 propagation | Broker already passes 429; UI subscribes to error events for banner | ✓ |
| 7 | DB migration | schema.sql idempotent with `IF NOT EXISTS`, runs at livinityd startup | ✓ |
| 8 | Tests | Capture middleware unit + integration + tRPC route + schema migration regression | ✓ |

**User's choice:** "Hepsini onayla, devam et"

## Claude's Discretion
- app_id reverse-lookup approach (dockerode direct vs wrapper)
- Chart library choice (or skip charts)
- usage.getMine pagination strategy

## Deferred Ideas
- Cost forecasting (FR-DASH-future-01)
- Per-request audit trail (FR-OBS-future-01)
- Configurable rate limits via Redis
- Auto tier detection
- Push notifications
- Cross-month/quarter/year aggregations
- CSV/JSON export
- Webhook on rate-limit-reached
