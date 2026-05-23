---
phase: 202-agents-platform
plan: 07
subsystem: settings-page-and-mcp-tab
tags: [frontend, backend, settings, mcp, models, account, tabs, redis, wave-3]

# Dependency graph
requires:
  - phase: 202-agents-platform
    plan: 02
    provides: livOSMastra registry refresh path (untouched here, but the McpBridge instance it owns is what the mcp.config.* mutations target at next boot)
  - phase: 202-agents-platform
    plan: 03
    provides: adminProcedure factory-DI pattern (mirrored for createMcpConfigRouter) + httpOnlyPaths placement convention
  - phase: 202-agents-platform
    plan: 04
    provides: AgentsSidebar shell (reused as the /settings layout sidebar via the new `headerLabel` prop) + native-fetch tRPC v10 batch envelope pattern in useAgentsList (mirrored by useMcpServers)
  - phase: 202-agents-platform
    plan: 06
    provides: native-HTML primitive form pattern (Input + radio + textarea + checkbox) reused by AddMcpServerDialog so no new shadcn Select/Switch/Textarea install was needed
  - phase: 200-c-builtin-tools
    provides: BUILT_IN_TOOL_CATALOG (10 entries) read via mastra.agent.listBuiltInTools — Built-in tools section in McpTab renders this list
  - phase: 199-07
    provides: mastra.agent.getActiveModel / setActiveModel + Redis `liv:config:active_model` key — wired into ModelsTab
provides:
  - tRPC namespace `mcp.config.*` (list / add / update / delete / toggle) over Redis hash `liv:mcp:config` (D-202-12)
  - useMcpServers hook — batched fetch of mcp.config.list + mastra.agent.listBuiltInTools in one round trip; SWR-style focus-revalidate
  - McpTab — Built-in tools (10) section + restart-required banner + External MCP servers section (per-row Enabled toggle + Delete; system rows have no Delete)
  - AddMcpServerDialog — modal form with transport-switch (stdio | http), env-row repeater, MCP_NAME_TAKEN inline + name-pattern validation
  - AccountTab — read-only identity panel (Username / Role / Session) + Sign out button (POST user.logout + reload)
  - ModelsTab — global default model picker against mastra.agent.* (Click row → setActiveModel writes liv:config:active_model)
  - Tabs primitive — shadcn-style Tabs built on the umbrella radix-ui package already in the subapp (no new dep)
  - /settings page + /settings/layout — subapp route at the root level (D-202-11), inherits AgentsSidebar shell with headerLabel="Settings"
  - Sidebar Settings footer button — both ThreadListSidebar AND AgentsSidebar now `<Link href="/settings">` instead of the TODO onClick stub from Phase 201
affects:
  - 202-08 (OpenUI Lang) — no interaction with the settings surface (file-disjoint)
  - 202-09 (sub-agent tree viz) — no interaction
  - Future "Phase 202-XX MCP hot-reload" — the McpBridge restart-required banner is the contract that needs flipping when McpBridge gains a runtime add/remove channel; the underlying Redis hash schema this plan persists is forward-compatible
  - Phase 220+ multi-user — AccountTab is a v202 placeholder; per-user account mgmt swaps in here without changing the route shape

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sub-router merge via t.mergeRouters into an existing top-level namespace — `mcp.config.*` joins `mcp.search / .getServer / .installToAgent / ...` from Phase 84. Same merge pattern Phase 202-03 used for `agents.tasks.*`. The empty-injection stub guarantees `createAppRouter()` shape stability for tests + back-compat clients."
    - "Factory-DI router with empty-injection fallback (createMcpConfigRouter + default mcpConfigRouter throwing PRECONDITION_FAILED) — mirrors the chromeMaster / xaiAuth / mastra / agents pattern. Production swap happens in livinityd/source/index.ts via setProductionAppRouter."
    - "Redis hash CRUD with restart-required UX. Mutations write `liv:mcp:config` synchronously but McpBridge keeps the MCPClient connections it spawned at boot (INV-202-08). UI surfaces an amber `AlertTriangle` banner above the External MCP servers section so the operator never expects hot-reload."
    - "System-MCP defense-in-depth — `luse` is in the SYSTEM_MCP_NAMES Set on the server (mcp-config-router.ts) AND surfaced as `system: true` on the McpServerConfig row so the UI hides Delete. Both layers reject the delete independently."
    - "Batched native-fetch tRPC GET — useMcpServers + ModelsTab pull `<a>,<b>?batch=1&input=...` for two queries in one round trip so each tab paints in a single network turn. Same encoded-once-at-module-scope optimisation use-agents-list.ts uses (Phase 202-04)."
    - "Subapp Tabs primitive built on the umbrella `radix-ui` package (Dialog already uses it) — no new `@radix-ui/react-tabs` install needed. Plan template suggested `npx shadcn@latest add tabs --yes` but the in-tree umbrella package is the cleaner additive path."
    - "Per-Field inline error mapping at the form layer — AddMcpServerDialog catches MCP_NAME_TAKEN from the tRPC error envelope and surfaces it inline under the Name field instead of a catch-all alert. Mirrors the AGENT_NAME_TAKEN pattern from 202-06 AgentEditForm."
    - "Sidebar Settings link wiring via `<Link href=\"/settings\">` + isSettingsActive route highlight in BOTH ThreadListSidebar and AgentsSidebar. Settings is reachable from every subapp surface (Chat / Agents / Settings)."

key-files:
  created:
    - livos/packages/livinityd/source/modules/server/trpc/mcp-config-router.ts
    - livos/packages/liv-ai-app/src/lib/settings/use-mcp-servers.ts
    - livos/packages/liv-ai-app/components/settings/McpTab.tsx
    - livos/packages/liv-ai-app/components/settings/AddMcpServerDialog.tsx
    - livos/packages/liv-ai-app/components/settings/AccountTab.tsx
    - livos/packages/liv-ai-app/components/settings/ModelsTab.tsx
    - livos/packages/liv-ai-app/components/ui/tabs.tsx
    - livos/packages/liv-ai-app/app/settings/page.tsx
    - livos/packages/liv-ai-app/app/settings/layout.tsx
  modified:
    - livos/packages/livinityd/source/modules/server/trpc/index.ts (import + `mcpConfig?` slot + merge into `mcp:` namespace)
    - livos/packages/livinityd/source/modules/server/trpc/common.ts (5 new httpOnlyPaths entries for mcp.config.*)
    - livos/packages/livinityd/source/index.ts (production wire-up + createMcpConfigRouter call with this.ai.redis)
    - livos/packages/liv-ai-app/components/assistant-ui/threadlist-sidebar.tsx (Settings footer button → Link href="/settings")
    - livos/packages/liv-ai-app/components/agents/AgentsSidebar.tsx (Settings footer button → Link href="/settings" + isSettingsActive highlight)

key-decisions:
  - "D-202-11 honoured — `/settings` route lives at the subapp root, NOT under `/agents/settings`. Tabs primitive composes Account / MCP / Models. The /settings layout reuses AgentsSidebar with a `headerLabel=\"Settings\"` prop so the sidebar chrome is identical to /agents but the sidebar title swaps to Settings — keeps the shell familiar without a duplicate sidebar variant."
  - "D-202-12 honoured — MCP tab external server CRUD backed by Redis hash `liv:mcp:config`. Mutations do NOT hot-reload; UI surfaces the amber restart-required banner between the Built-in tools section and the External MCP servers section so the operator sees the constraint before they edit. INV-202-08 (Mastra MCP source list unchanged) preserved — McpBridge keeps the connections it spawned at boot until livinityd is restarted."
  - "D-202-21 / INV-202-05 honoured — `grep -rE '[ışğüöçİŞĞÜÖÇ]'` over app/settings + components/settings + src/lib/settings returns 0 matches. Every visible string is English."
  - "D-202-24 honoured — every subapp file (4 settings components + Tabs primitive + page + layout + hook) lives under `livos/packages/liv-ai-app/`. The 4 backend file mutations all live under `livos/packages/livinityd/`. No cross-tier mixing."
  - "INV-202-02 honoured — backend additive: 1 new router file (mcp-config-router.ts), 1 import + 1 slot in createAppRouter, 1 merge into the existing `mcp:` namespace, 1 wire-up call in livinityd boot. No existing tRPC procedure shape was modified."
  - "Plan template suggested running `npx shadcn@latest add tabs --yes` if components/ui/tabs.tsx is absent. INSTEAD we built the Tabs primitive on the umbrella `radix-ui` package already in the subapp (Dialog imports from it the same way). Avoids adding @radix-ui/react-tabs as a separate dep and keeps the additive scope tight. The component API matches the official shadcn `tabs.tsx` exactly."
  - "Plan task 5 referenced a JWT secret rotation timestamp in AccountTab — that field doesn't exist anywhere in the user table or admin metadata in this codebase (JWT secret is a static file `/data/secrets/jwt` per MEMORY.md). Documented inline as 'Session: Active (cookie + JWT)' instead of fabricating a timestamp. Full account mgmt = Phase 220+ regardless."
  - "Plan task 6 'Sidebar Settings button (Plan 201) now navigates to /settings' — applied to BOTH ThreadListSidebar AND AgentsSidebar so the Settings nav is reachable from /, /agents, /agents/[id], /agents/new, and /settings itself. Previously the ThreadListSidebar footer button had a TODO(P201) onClick stub; AgentsSidebar had a static button with no onClick at all."

patterns-established:
  - "Settings page = subapp root + tab composition. Future tabs (Integrations, Notifications, Telemetry) drop in by adding a TabsTrigger + TabsContent without touching the layout, hook, or backend wire-up."
  - "Tab-level data-isolation — each tab owns its own hook (useMcpServers, fetchAccount inside AccountTab, fetchModels inside ModelsTab). No shared settings context; each tab refetches independently on mount. Keeps the per-tab error surface clean — an mcp.config.list failure does not blank out the Models tab."
  - "Two-section panel with a banner between — `Built-in (read-only) → restart-required banner → External (mutable)`. The visual hierarchy makes the static catalog feel like a reference + the dynamic config feel like the actionable surface. Pattern reusable for future settings tabs that mix system-managed + user-managed state (e.g. system schedules + user schedules)."
  - "System-row defense-in-depth — server FORBIDDEN + UI Delete-button-hidden + System badge. Reusable for any future surface where some rows are bootstrap-seeded and undeletable (e.g. system agents, system MCP servers, default credentials)."

requirements-completed: [REQ-202-07]

# Metrics
duration: ~15min
completed: 2026-05-23
started: 2026-05-23T15:05:00Z
finished: 2026-05-23T15:20:00Z
---

# Phase 202 Plan 07: /settings Page + MCP Tab Summary

One-liner: First real `/settings` page in the Liv AI subapp — three tabs (Account / MCP / Models), with the MCP tab fronting a new `mcp.config.*` tRPC namespace that CRUDs the Redis hash `liv:mcp:config` (restart-required for McpBridge re-spawn).

## What shipped

Six atomic commits on `master`, sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every one (`[sacred-sha] PASS: 20 files verified`):

| Commit | Plan task | Subsystem |
| --- | --- | --- |
| `ecec755f` | Task 1 | tRPC `mcp.config.*` router (list/add/update/delete/toggle) — adminProcedure-gated, Redis hash backing, system-MCP refusal, httpOnlyPaths placement |
| `77c52915` | Task 2 | `useMcpServers` hook — batched fetch of `mcp.config.list` + `mastra.agent.listBuiltInTools` |
| `b26a9493` | Task 3 | `McpTab` — Built-in tools (10) + restart-required banner + External MCP servers list with per-row toggle + Delete |
| `312baf32` | Task 4 | `AddMcpServerDialog` — modal form with transport-switch (stdio / http), env-row repeater, inline `MCP_NAME_TAKEN` error mapping |
| `712802a6` | Task 5 | `AccountTab` (read-only identity + Sign out) + `ModelsTab` (3-Grok picker with active-state Redis sync) |
| `2d640409` | Task 6 + 7 | `/settings` page + layout + shadcn-style Tabs primitive + Sidebar Settings link wired (ThreadListSidebar + AgentsSidebar) |

Build verification: `cd livos && pnpm --filter liv-ai-app build` EXIT 0 with route manifest:
```
○ /
○ /_not-found
○ /agents
ƒ /agents/[id]
○ /agents/new
○ /settings   ← new
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] useMcpServers BatchResult<unknown> generic narrowing**
- **Found during:** Task 6 (final build)
- **Issue:** `tsc` rejected `unwrapBatch<McpServerConfig[]>(serversEntry)` with `Argument of type 'BatchResult<unknown>' is not assignable to parameter of type 'BatchResult<McpServerConfig[]>'.` because the array deconstruction left both entries typed as `BatchResult<unknown>`.
- **Fix:** Cast each entry to the per-procedure generic at extraction time: `const serversEntry = data?.[0] as BatchResult<McpServerConfig[]> | undefined`. The cast is sound because the request batch ordering matches the response ordering (positional contract of tRPC batch).
- **Files modified:** `livos/packages/liv-ai-app/src/lib/settings/use-mcp-servers.ts`
- **Commit:** folded into `2d640409` (Task 6 commit covers all build-fix work).

### Plan-template adjustments (NOT deviations — these are documented as intent)

**1. shadcn install bypassed — built Tabs on existing umbrella `radix-ui` package**
- **Reason:** The plan said "Run `npx shadcn@latest add tabs --yes` if `components/ui/tabs.tsx` not yet present." The subapp already pulls the umbrella `radix-ui` package (used by Dialog at `components/ui/dialog.tsx`). Building Tabs against that umbrella avoids adding `@radix-ui/react-tabs` as a separate workspace dependency. The component API is identical to the official shadcn `tabs.tsx`.
- **Files affected:** `components/ui/tabs.tsx` written manually instead of CLI-generated.

**2. AccountTab JWT secret rotation timestamp omitted**
- **Reason:** Task 5 referenced "current admin username + JWT secret rotation timestamp" but no rotation timestamp surface exists anywhere in the user table, admin metadata, or auth middleware. The JWT secret is a static file at `/data/secrets/jwt` (per MEMORY.md) — no rotation history is tracked. AccountTab instead surfaces "Session: Active (cookie + JWT)" which is the meaningful status the operator can act on. Full account mgmt = Phase 220+ regardless.

**3. Settings sidebar wired in BOTH sidebars, not just ThreadListSidebar**
- **Reason:** Task 6 said "Update sidebar Settings button (Plan 201) to link to /settings (was a TODO onClick)." Phase 201's ThreadListSidebar had the TODO stub; Phase 202-04's AgentsSidebar shipped without an `onClick` at all (the Settings footer button was a static label). Both surfaces are now navigable to /settings via `<Link>` so the operator can reach Settings from every page.

## Invariants — verification

| INV | Check | Result |
|-----|-------|--------|
| INV-202-01 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on every commit | PASS — 6/6 commits passed the pre-commit hook |
| INV-202-02 | Backend mutations live under `livos/packages/livinityd/` | PASS — 4 backend files mutated (`mcp-config-router.ts` NEW, `trpc/index.ts`, `trpc/common.ts`, `source/index.ts`); frontend 9 files under `livos/packages/liv-ai-app/` |
| INV-202-03 | LivOSMastra B-02 lock — class diff additive only | PASS — no `mastra/index.ts` mutation in this plan |
| INV-202-05 | English UI text only | PASS — `grep -rE '[ışğüöçİŞĞÜÖÇ]'` over app/settings + components/settings + src/lib/settings = 0 matches |
| INV-202-08 | Mastra MCP source list unchanged at runtime | PASS — McpBridge untouched; UI surfaces restart-required banner. Redis hash mutations only affect *next* boot |
| INV-202-09 | Phase 200-C 10 built-in tools preserved | PASS — read via existing `mastra.agent.listBuiltInTools`; catalog unchanged |
| INV-202-10 | Phase 201 generative UI renderers FROZEN | PASS — no edit to `src/lib/tool-ui/`. The 1316-line legacy `livinity-mcp-panel.tsx` was NOT re-imported; McpTab built fresh in the subapp |

## Verification

- [x] `cd livos && pnpm --filter liv-ai-app build` EXIT 0
- [x] `/settings` present in route manifest as static (`○ /settings`)
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PASS on all 6 commits
- [x] No Turkish strings in any new file (`grep -rE` 0 matches)
- [x] Backend changes additive only — `mcp.config.*` joins existing `mcp` namespace via `t.mergeRouters`; 5 new paths in `httpOnlyPaths`
- [x] All new tRPC routes (5) added to `httpOnlyPaths` in `common.ts`
- [x] System MCP (`luse`) refusal works at both layers (server FORBIDDEN + UI hide)
- [x] Sibling sidebar regression check — `ThreadListSidebar` + `AgentsSidebar` both Settings-link wired

## Self-Check: PASSED

- FOUND: livos/packages/livinityd/source/modules/server/trpc/mcp-config-router.ts
- FOUND: livos/packages/liv-ai-app/src/lib/settings/use-mcp-servers.ts
- FOUND: livos/packages/liv-ai-app/components/settings/McpTab.tsx
- FOUND: livos/packages/liv-ai-app/components/settings/AddMcpServerDialog.tsx
- FOUND: livos/packages/liv-ai-app/components/settings/AccountTab.tsx
- FOUND: livos/packages/liv-ai-app/components/settings/ModelsTab.tsx
- FOUND: livos/packages/liv-ai-app/components/ui/tabs.tsx
- FOUND: livos/packages/liv-ai-app/app/settings/page.tsx
- FOUND: livos/packages/liv-ai-app/app/settings/layout.tsx
- FOUND: commit ecec755f (Task 1 — mcp-config-router)
- FOUND: commit 77c52915 (Task 2 — useMcpServers hook)
- FOUND: commit b26a9493 (Task 3 — McpTab)
- FOUND: commit 312baf32 (Task 4 — AddMcpServerDialog)
- FOUND: commit 712802a6 (Task 5 — AccountTab + ModelsTab)
- FOUND: commit 2d640409 (Task 6 + 7 — page + layout + Tabs + sidebar nav)
