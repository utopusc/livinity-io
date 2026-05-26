# Phase 211 Summary — MCP/App install reliability

**Status:** 🟡 PARTIAL — 211.1 defensive coexistence shipped; 211.2 + 211.3 filed as carries.

## Shipped this session

**211.1 — Dual-writer collision guard** (atomic defensive fix):
- Live Mini PC `redis-cli TYPE liv:mcp:config` returned `none` — the dual-writer crash is LATENT, not yet triggered in production.
- `liv/packages/core/src/mcp-config-manager.ts:saveAndPublish()` now type-checks `liv:mcp:config` before SET. Refuses with a loud error when the key is already a HASH (livinityd-owned primitive). Prevents a WRONGTYPE crash the moment a UI Settings → MCP write lands first.
- Also added cross-publish on `liv:mcp:updated` so liv-core mutations notify livinityd's `mcp-bridge` subscriber.
- 4 new vitest cases (4/4 PASS).

## NOT shipped this session

**211.2 — EnvironmentOverridesDialog** (~6-8 hours UI buildout) → CARRY-P211-DIALOG.
**211.3 — Admin-only install gate** (~2 hours, blocked on Phase 212 Supabase migration) → CARRY-P211-ADMIN-GATE.
**Full unification of `liv:mcp:config` writers** (~2 hours, supersedes the defensive guard) → CARRY-P211-UNIFY.

## Why partial

Phase 211's draft scope is 2-3 days of code work spanning UI components, tRPC routes, and a database migration that belongs to Phase 212. Defensive coexistence + cross-publish is the minimum atomic deliverable that prevents the latent WRONGTYPE-crash without compromising scope on the bigger pieces.

## Sacred SHA

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` — UNTOUCHED.

## Effort

~25 min wall-clock total: ~10 min trace dual-writer surface + ~5 min defensive fix + ~5 min tests + ~5 min docs.
