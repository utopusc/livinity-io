---
status: partial
phase: 211
verified_at: 2026-05-26T09:38:53Z
verifier: claude-opus-4-7 (autonomous mode)
---

# Phase 211 Verification — MCP/App install reliability

## Ship-gate result: PARTIAL (211.1 shipped defensively; 211.2 + 211.3 deferred to carries)

### 211.1 — Dual-writer collision guard at `liv:mcp:config`

**Status:** PARTIAL — defensive coexistence shipped; full unification filed as CARRY-P211-UNIFY.

Evidence:
- `liv/packages/core/src/mcp-config-manager.ts:saveAndPublish()` — added pre-SET type check that refuses on Redis HASH key (the livinityd-owned primitive) and adds cross-publish on `liv:mcp:updated`.
- `liv/packages/core/src/mcp-config-manager.test.ts` — 4/4 vitest cases PASS:
  - refuses-to-SET-when-HASH
  - SETs-when-none
  - SETs-when-string
  - publishes-on-both-channels

```
Test Files  1 passed (1)
Tests       4 passed (4)
Duration    206ms
```

### 211.2 — `EnvironmentOverridesDialog` for AI installs

**Status:** DEFERRED — filed as CARRY-P211-DIALOG. ~6-8 hours UI buildout exceeds remaining session budget.

### 211.3 — Admin-only install gate

**Status:** DEFERRED — filed as CARRY-P211-ADMIN-GATE. Blocked on Phase 212's Supabase `is_admin BOOLEAN` migration. Estimated ~2 hours once unblocked.

## REQ coverage

| REQ | Status | Notes |
|-----|--------|-------|
| INST-01 — single writer at `liv:mcp:config` | PARTIAL — defensive guard only | Full unification = CARRY-P211-UNIFY |
| INST-02 — install MCP via UI → tools/list w/o restart | DEFERRED to P217 UAT | Cross-publish wires it for liv-core path; livinityd path already wired pre-P211. |
| INST-03 — `envSchema` dialog for required env | DEFERRED | CARRY-P211-DIALOG |
| INST-04 — atomic per-user env file update | DEFERRED | CARRY-P211-DIALOG |
| INST-05 — modal instead of generic toast | DEFERRED | CARRY-P211-DIALOG |
| INST-06 — 3 sample MCPs one-click in <60s | DEFERRED to P217 UAT | Live verification |

## Files changed in repo

```
M liv/packages/core/src/mcp-config-manager.ts                                     (defensive guard + cross-publish)
+ liv/packages/core/src/mcp-config-manager.test.ts                                (4 vitest cases)
+ .planning/phases/211-mcp-install-reliability/211-CONTEXT.md
+ .planning/phases/211-mcp-install-reliability/211-VERIFICATION.md
+ .planning/phases/211-mcp-install-reliability/211-SUMMARY.md
~ .planning/ROADMAP.md (status flip to 🟡 PARTIAL with carry list)
```

## Sacred SHA

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` — UNTOUCHED (INV-211-01 PASS).

## Carries filed

- **CARRY-P211-UNIFY** — Full HASH-primitive unification of `liv:mcp:config` writers (~2 hours).
- **CARRY-P211-DIALOG** — `EnvironmentOverridesDialog` UI component + tRPC envSchema query (~6-8 hours).
- **CARRY-P211-ADMIN-GATE** — Enforce `is_admin=true` on install routes (~2 hours, blocked on Phase 212).
