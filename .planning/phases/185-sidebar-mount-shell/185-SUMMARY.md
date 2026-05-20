---
phase: 185
plan: all
subsystem: ui
tags: [sidebar, split-layout, item-routing, mobile-collapse, add-modal, tdd]
dependency_graph:
  requires: [Phase 174 SidebarTree, Phase 175 AddItemModal/Detail views, Phase 176 open_item, Phase 183 gear button]
  provides: [AI Chat window split layout, SidebarTree left pane, right-pane item routing]
  affects: [livos/packages/ui/src/routes/ai-chat/index.tsx, livos/packages/ui/src/routes/ai-chat/ai-chat.test.tsx]
tech_stack:
  patterns: [TDD vitest, React useState, conditional rendering, Radix Dialog portal]
key_files:
  modified:
    - livos/packages/ui/src/routes/ai-chat/index.tsx
    - livos/packages/ui/src/routes/ai-chat/ai-chat.test.tsx
  documentation:
    - .planning/phases/184-v38-deploy-uat/184-03-probes-log.md
decisions:
  - Mobile early-return ("AI Chat requires a desktop browser") replaced by collapsed sidebar pattern (sidebarOpen=false on mobile, hamburger toggle reveals it) — cleaner and enables the same sidebar on all viewports
  - All 3 plans (185-01/02/03) implemented in one Green pass after combined RED; committed as single atomic feat commit to avoid intermediate broken states
metrics:
  duration: ~60 minutes
  completed: 2026-05-20T21:51:03Z
  tasks_completed: 4
  files_changed: 3
  test_assertions_added: 22
  test_assertions_retained: 14
  total_assertions: 36
---

# Phase 185: Mount SidebarTree in AI Chat Window (Left Pane) — Summary

**One-liner:** SidebarTree mounted as 280px left pane in AI Chat window with item routing (Chat/Project/Agent → detail view) and mobile collapse/AddItemModal trigger.

## What Was Built

Phase 185 wires together Phases 174-176-183 into a working AI Chat workspace:

1. **185-01 — Split layout**: `routes/ai-chat/index.tsx` restructured from tab-only column to horizontal split — `data-testid="ai-chat-sidebar"` (w-[280px]) + `data-testid="ai-chat-right-pane"` (flex-1). `<SidebarTree>` mounted as the left pane.

2. **185-02 — Item routing**: `selectedItemId` state + `handleItemSelect` callback wired to `SidebarTree onSelect`. Right pane's Terminal tab switches: Chat item → `<ChatDetail>`, Project → `<ProjectDetail>`, Agent → `<AgentDetail>`. Vault Graph tab always overrides; Terminal tab restores on switch-back.

3. **185-03 — Mobile UX**: `sidebarOpen` defaults to `!isMobile` (false on mobile, true on desktop). Hamburger button (`data-testid="sidebar-toggle-btn"`) in tab-nav row — mobile only. `+` Add button (`data-testid="add-item-btn"`) at top of left pane opens `<AddItemModal>` via `addModalOpen` state.

4. **185-04 — Docs**: P-185 10-step UAT probe appended to `184-03-probes-log.md`. ROADMAP Phase 185 already marked CODE-COMPLETE in planning.

## Test Results

```
36 / 36 PASS in ai-chat.test.tsx
  - 14 assertions retained (pre-existing)
  - 22 assertions added (185-01: 6, 185-02: 8, 185-03: 4, updated: 4)
```

## Commits

| Hash | Message |
|------|---------|
| `615caafc` | feat(185-01/02/03): mount SidebarTree as left pane in AI Chat window |
| `fd38ff96` | docs(185-04): append P-185 UAT probe to 184-03-probes-log.md |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mobile early-return replaced with collapsed-sidebar pattern**
- **Found during:** Task GREEN implementation (Plan 185-03)
- **Issue:** Plans 185-01/02 expected `data-testid="ai-chat-sidebar"` to be absent on mobile (B1 passed with old early-return), and 185-03 expected `sidebar-toggle-btn` present on mobile (B2 requires split layout to be rendered). Old early-return showed "AI Chat requires a desktop browser" screen — hamburger never appeared. The two test sets were mutually exclusive.
- **Fix:** Replaced early-return with collapsed sidebar: `sidebarOpen=useState(false)` on mobile, split layout always renders, hamburger shows/hides sidebar. Mobile branch tests updated to match new correct behavior (`mounts without throwing` + `renders Terminal/Vault Graph buttons`). Source-text invariant for `/chat-mobile` link updated (link moved to /chat-mobile route).
- **Files modified:** `routes/ai-chat/index.tsx`, `ai-chat.test.tsx`
- **Commit:** `615caafc`

**2. [Rule 2 - Type safety] TypeScript cast in test mock access**
- **Found during:** tsc --noEmit check
- **Issue:** `sidebarTreeMock.mock.calls[0]?.[0]` caused TS2493 (tuple type `[]` has no element at index 0).
- **Fix:** Cast `mock.calls` to `any[]` first, then optional-chain to `[0]?.[0]`.
- **Files modified:** `ai-chat.test.tsx`
- **Commit:** `615caafc`

## Deferred Items

| Item | Reason | Target |
|------|--------|--------|
| Resizable split (drag border between sidebar and content) | UX enhancement, not required for correctness | v38.2 |
| Sidebar collapse-to-rail (icon-only mode) | UX enhancement | v38.2 |

## Known Stubs

None — SidebarTree, ChatDetail, ProjectDetail, AgentDetail all wire to real tRPC data sources from their respective phases.

## Sacred SHA

Sacred SHA check: 25/25 PASS on all commits.

## Self-Check: PASSED

- `livos/packages/ui/src/routes/ai-chat/index.tsx` — FOUND (modified)
- `livos/packages/ui/src/routes/ai-chat/ai-chat.test.tsx` — FOUND (modified)
- commit `615caafc` — FOUND
- commit `fd38ff96` — FOUND
- 36 test assertions PASS
