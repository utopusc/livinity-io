---
phase: 76-agent-marketplace-onboarding-tour
plan: 03
subsystem: ai-routes-trpc
tags: [agent-marketplace, trpc, routes, clone, nexus-bridge, tdd]
requires:
  - 76-01 (agent_templates table + repo + barrel re-export)
provides:
  - ai.listAgentTemplates tRPC procedure (catalog query, optional tag filter)
  - ai.getAgentTemplate tRPC procedure (single template by slug, NOT_FOUND)
  - ai.cloneAgentTemplate tRPC procedure (4-step bridge to nexus subagent)
affects:
  - 76-04 (UI consumes the 3 new procedures via trpcReact.ai.*)
  - 76-05 (admin/featured curation can build on getAgentTemplate)
tech-stack:
  added: []
  patterns:
    - createCallerFactory + stub Context (api-keys/routes.test.ts pattern)
    - vi.mock('../database/index.js') + globalThis.fetch spy (Pitfall-3)
    - getPool() free-function import (matches platform/routes.ts)
key-files:
  created:
    - livos/packages/livinityd/source/modules/ai/agent-templates-routes.test.ts
  modified:
    - livos/packages/livinityd/source/modules/ai/routes.ts
decisions:
  - "ctx pool access path discovered: `getPool()` free-function from `'../database/index.js'` (NOT `ctx.livinityd.db.getPool()` as the plan's interfaces snippet showed). The plan's auto-deviation rule explicitly directed verification — discovered shape locked + documented in test file header."
  - "nexus body field is `skills` (NOT `tools`): the existing `createSubagent` zod schema in this file (lines 899-913) uses `skills: z.array(z.string()).default(['*'])`. The plan reference said `tools: tpl.toolsEnabled` but reality is the canonical contract uses `skills`. Picked the existing contract to maximize compatibility with the unmodified nexus handler — D-09 (re-use, don't duplicate)."
  - "tRPC test pattern = createCallerFactory + stub Context (mirrors api-keys/routes.test.ts), NOT supertest, NOT app.listen(0) HTTP harness. The 6 must-have behaviors all live at the tRPC layer (input validation + repo-mock assertions + fetch-spy assertions on outbound POST), so HTTP-level routing is irrelevant."
  - "vi.mock('../database/index.js') stubs ALL exports the SUT imports including getPool(), listAgentTemplates, getAgentTemplate, incrementCloneCount, getUserPreference, setUserPreference. The router's existing imports (getUserPreference/setUserPreference) had to be re-stubbed to keep ESM module-load paths green. per-user-claude.js also stubbed (touches node-pty + filesystem at module-load)."
  - "Repo function imports aliased as `repoListAgentTemplates`/`repoGetAgentTemplate`/`repoIncrementCloneCount` — avoids shadowing the new tRPC procedure field names (`listAgentTemplates`/`getAgentTemplate`/`cloneAgentTemplate`) within the same `router({...})` literal scope. TS would compile without aliases (different scopes) but readability + grep-clarity wins."
  - "ctx.livinityd!.logger non-null assertion matches established style in this file (lines 778, 823, 1246, 1277) — the Context type is a Merge<wss, express> union making `livinityd` possibly-undefined under TS strict mode, but ALL existing routes in this file dereference it with `!`. Zero new typecheck errors above plan-relevant baseline."
  - "Build gate substituted (matches 76-01 SUMMARY decision): `livinityd` package has no `build` script — runs TS directly via tsx per project memory. `pnpm typecheck` (`tsc --noEmit`) used instead. Pre-existing typecheck errors (61 in routes.ts, also user/widgets/file-store) predate this plan. New code adds zero new errors above baseline."
  - "Defensive 7th test added (T7) — guards the T-76-03-05 contract that `cloneAgentTemplate({slug:'nope'})` short-circuits BEFORE any nexus call AND BEFORE incrementing clone_count. Plan asked for 6 cases; 7 keeps the count-drift threat fully covered."
metrics:
  duration: "~21 minutes"
  completed: "2026-05-05"
  tasks: 1
  tests_pass: 7
  total_test_files: 3 (agent-templates suite)
  total_tests_pass: 22 (76-01 repo + 76-02 seeds + 76-03 routes — no regressions)
---

# Phase 76 Plan 03: Agent Templates tRPC Routes Summary

**One-liner:** Three new tRPC procedures (`ai.listAgentTemplates`, `ai.getAgentTemplate`, `ai.cloneAgentTemplate`) bridging the 76-01 catalog repo to the existing nexus `/api/subagents` endpoint via a 4-step clone flow that increments `clone_count` ONLY on nexus 200 (T-76-03-05 mitigation).

## Context

Per CONTEXT D-06..D-09, the marketplace clone path **re-uses** the existing nexus subagent endpoint rather than creating a new `user_agents` table. This plan ships the data path the 76-04 UI will consume; the UI plan becomes pure rendering on top of locked tRPC contracts.

## What Shipped

### Procedures (appended inside the existing `router({...})` block in `livos/packages/livinityd/source/modules/ai/routes.ts`)

| Procedure | Type | Input | Behavior |
|-----------|------|-------|----------|
| `listAgentTemplates` | query | `{tags?: string[]}?` | Calls repo `listAgentTemplates(pool, opts)` — returns `AgentTemplate[]` ordered by `created_at ASC`. Tag filter uses GIN `@>` containment (76-01). |
| `getAgentTemplate` | query | `{slug: string(1..64)}` | Throws `TRPCError NOT_FOUND` for missing slugs (no null leakage to clients). |
| `cloneAgentTemplate` | mutation | `{slug: string, name?: string}` | 4-step bridge: (1) read template (404 short-circuits before nexus call) → (2) POST nexus `/api/subagents` with `cloneId = ${slug}-${userId.slice(0,8)}-${Date.now()}` truncated to 64 chars → (3) on 200 increment `clone_count` → (4) return nexus body. |

### Imports added at top of `routes.ts`

```typescript
import {
  getUserPreference,
  setUserPreference,
  getPool,
  listAgentTemplates as repoListAgentTemplates,
  getAgentTemplate as repoGetAgentTemplate,
  incrementCloneCount as repoIncrementCloneCount,
} from '../database/index.js'
```

### Test file (NEW)

`livos/packages/livinityd/source/modules/ai/agent-templates-routes.test.ts` — 290 LOC, 7 vitest tests:

| ID | Behavior | Mechanism |
|----|----------|-----------|
| T1 | `listAgentTemplates()` no input → forwards undefined opts | repo mock + caller assertion |
| T2 | `listAgentTemplates({tags:['research']})` → forwards filter | repo mock + caller assertion |
| T3 | `getAgentTemplate({slug:'researcher'})` → returns row | repo mock + caller assertion |
| T4 | `getAgentTemplate({slug:'nope'})` → throws NOT_FOUND | repo returns null + reject match |
| T5 | `cloneAgentTemplate({slug:'researcher'})` happy path → POST → on 200 increment + return body | repo + fetch spy + sequence assertions |
| T6 | nexus 503 → throws TRPCError; clone_count NOT incremented | fetch spy returns 503 + assert no increment call |
| T7 (defensive) | clone with missing slug → NOT_FOUND BEFORE any nexus call | fetch spy + assert never-called |

## Files Changed

| File | LOC delta | Purpose |
|------|-----------|---------|
| `livos/packages/livinityd/source/modules/ai/routes.ts` | +123 | 3 new procedures + 4 new imports + 5 ctx.livinityd! non-null assertions |
| `livos/packages/livinityd/source/modules/ai/agent-templates-routes.test.ts` | +290 (NEW) | 7 vitest tests covering 6 plan-mandated + 1 defensive case |

## Verification Results

| Gate | Result |
|------|--------|
| Sacred SHA pre | `4f868d318abff71f8c8bfbcf443b2393a553018b` |
| Sacred SHA post | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ unchanged |
| 7/7 vitest pass (76-03) | ✅ `Tests 7 passed (7)` in 8ms |
| Full agent-templates suite | ✅ `Tests 22 passed (22)` (76-01 repo + 76-02 seeds + 76-03 routes — no regressions) |
| `routes.ts` shape automated | ✅ all 5 required substrings present (`listAgentTemplates:`, `getAgentTemplate:`, `cloneAgentTemplate:`, `/api/subagents`, `incrementCloneCount`) |
| Existing `listSubagents:` count | ✅ exactly 1 (existing route preserved byte-for-byte) |
| New typecheck errors above baseline | ✅ 0 (matched established `ctx.livinityd!.logger` pattern) |

## Deviations from Plan

### Auto-fixed (Rule 1 — bug)

**1. ctx pool access path: plan wrote `ctx.livinityd.db?.getPool?.()`, reality is direct `getPool()` import**
- **Found during:** Task 1 step 3 (the explicit "verify, do NOT guess" gate)
- **Issue:** Plan's `<interfaces>` block showed `ctx.livinityd.db?.getPool?.()`. Reality: pool is module-level state in `database/index.ts`, exposed as a free `getPool()` function (mirrors `platform/routes.ts:48` and 17 other files in the codebase).
- **Fix:** Imported `getPool` directly from `'../database/index.js'` and call `getPool()` at the top of each handler.
- **Files modified:** `livos/packages/livinityd/source/modules/ai/routes.ts` (imports + 3 handlers)
- **Commit:** `9350b936`

**2. nexus subagent body field is `skills`, not `tools`**
- **Found during:** Task 1 step 6 (re-reading `createSubagent` reference at lines 899-944)
- **Issue:** Plan reference body used `tools: tpl.toolsEnabled`. Existing `createSubagent` zod schema (line 906) uses `skills: z.array(z.string()).default(['*'])`. The nexus side accepts `skills`, not `tools`.
- **Fix:** Sent `skills: tpl.toolsEnabled` to maximize compatibility with the unmodified nexus handler (D-09 — re-use, don't duplicate).
- **Files modified:** `livos/packages/livinityd/source/modules/ai/routes.ts:2913`
- **Commit:** `9350b936`

### Auto-fixed (Rule 3 — blocking issue)

**3. Test file MockInstance type collapse**
- **Found during:** Task 1 step 7 (typecheck gate)
- **Issue:** `let fetchSpy: ReturnType<typeof vi.spyOn> | null = null` collapsed to a generic `MockInstance<(this: unknown, ...args: unknown[]) => unknown>` that could not absorb `vi.spyOn(globalThis, 'fetch')`'s typed return. 3 type errors at the assignment sites.
- **Fix:** `let fetchSpy: any = null` with explanatory comment matching `livinity-broker/mode-dispatch.test.ts`'s Pitfall-3 workaround (`any` for spy variables in this codebase).
- **Files modified:** `livos/packages/livinityd/source/modules/ai/agent-templates-routes.test.ts:101-108`
- **Commit:** `9350b936`

**4. ctx.livinityd non-null assertion (matches existing style)**
- **Found during:** Task 1 step 7 (typecheck gate)
- **Issue:** 5 new TS18048 errors on `ctx.livinityd.logger.error(...)` — Context type is `Merge<wss, express>` making `livinityd` possibly-undefined.
- **Fix:** Switched to `ctx.livinityd!.logger.error(...)` matching the established pattern in this file (lines 778, 823, 1246, 1277). Zero new typecheck errors.
- **Files modified:** `livos/packages/livinityd/source/modules/ai/routes.ts` (5 sites in new code)
- **Commit:** `9350b936`

## Threat Surface Scan

No new attack surface introduced beyond what `<threat_model>` already enumerated:
- T-76-03-01 (cloneId tampering) — mitigated by per-user `slug + userId.slice(0,8) + Date.now()` pattern
- T-76-03-02 (system_prompt disclosure) — accepted per D-03 (templates are global, system_prompt is product copy)
- T-76-03-03 (privilege escalation via clone) — accepted (template.toolsEnabled inherited; admin auditable)
- T-76-03-04 (DoS via clone spam) — `privateProcedure` JWT gate + nexus rate-limit + INT32-tolerant clone_count
- T-76-03-05 (clone_count drift on nexus failure) — sequence guard verified by T6 + T7 tests

No new endpoints or schema mutations beyond the 3 tRPC procedures and the existing nexus POST.

## Self-Check: PASSED

- ✅ `livos/packages/livinityd/source/modules/ai/routes.ts` exists and contains all 5 required substrings
- ✅ `livos/packages/livinityd/source/modules/ai/agent-templates-routes.test.ts` exists (290 LOC > 120 minimum)
- ✅ Commit `113841ef` (RED test) exists in git log
- ✅ Commit `9350b936` (GREEN feat) exists in git log
- ✅ Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged at task start AND end
- ✅ All existing procedures byte-identical (listSubagents count = 1 — verified)

## TDD Gate Compliance

- RED commit: `113841ef test(76-03): add failing tRPC tests for agent-templates routes` ✅
- GREEN commit: `9350b936 feat(76-03): expose agent-templates catalog + clone via 3 tRPC procedures` ✅
- REFACTOR commit: not needed — implementation was minimal + readable on first GREEN.

## Outstanding for 76-04 (UI)

- Mount `trpcReact.ai.listAgentTemplates.useQuery({tags?})` for the catalog grid.
- `trpcReact.ai.getAgentTemplate.useQuery({slug})` for the agent detail modal.
- `trpcReact.ai.cloneAgentTemplate.useMutation()` for the "Add to Library" CTA. On success, the response body is the nexus subagent (with `id` field) — UI can route to `/agents/${result.id}` for immediate post-clone usage.
