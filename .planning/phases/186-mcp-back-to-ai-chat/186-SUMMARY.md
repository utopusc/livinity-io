---
phase: 186-mcp-back-to-ai-chat
plan: 01-03
subsystem: ui
tags: [react, mcp, ai-chat, tab-nav, settings, vitest, tdd]

# Dependency graph
requires:
  - phase: 182-mcp-settings-page
    provides: McpServerList, McpServerDetail, featured-mcps.ts — consumed as-is
  - phase: 185-sidebar-mount-shell
    provides: split layout for ai-chat/index.tsx (left pane + right pane tab nav)

provides:
  - MCP Servers tab in AI Chat window (third tab alongside Terminal + Vault Graph)
  - FeaturedMcpInstaller shared component (6-card one-click install grid)
  - McpServerList + McpServerDetail mounted in AI Chat MCP tab
  - FeaturedMcpInstaller also mounted in Settings MCP page (single source of truth)
  - Deletion of 1316-line orphan routes/ai-chat/mcp-panel.tsx

affects: [ai-chat, settings-mcp-servers, mcp-infrastructure, v38-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy REST fetch: useEffect + useCallback gated on activeTab === 'mcp' (15s polling)"
    - "FeaturedMcpInstaller: pure presentational component with installedNames Set + onInstall prop"
    - "TDD RED/GREEN for all new UI logic via createRoot + act (no @testing-library/react)"

key-files:
  created:
    - livos/packages/ui/src/components/mcp/FeaturedMcpInstaller.tsx
    - livos/packages/ui/src/components/mcp/FeaturedMcpInstaller.test.tsx
  modified:
    - livos/packages/ui/src/routes/ai-chat/index.tsx
    - livos/packages/ui/src/routes/ai-chat/ai-chat.test.tsx
    - livos/packages/ui/src/routes/settings/mcp-servers.tsx
    - livos/packages/ui/src/routes/settings/mcp-servers.test.tsx
  deleted:
    - livos/packages/ui/src/routes/ai-chat/mcp-panel.tsx (1316 lines, 0 live imports)

key-decisions:
  - "FeaturedMcpInstaller is a shared component — both AI Chat and Settings import from components/mcp/"
  - "MCP tab uses REST fetch (not tRPC) mirroring settings/mcp-servers.tsx pattern"
  - "FeaturedMcpInstaller shown only when no server is selected (collapses on server select)"
  - "mcp-servers.test.tsx B6 updated: inline card markup moved to FeaturedMcpInstaller; test asserts on INSTALLER_SRC"

patterns-established:
  - "Lazy tab fetch: only activate polling when the tab is active, clear on deactivate"
  - "Tab union extension: additive — existing tabs unchanged, new 'mcp' value appended"

requirements-completed: [MCP-CHAT-01, MCP-CHAT-02, MCP-CHAT-03]

# Metrics
duration: 45min
completed: 2026-05-20
---

# Phase 186: Restore MCP Panel in AI Chat Window Summary

**MCP Servers tab added to AI Chat window (third tab) with FeaturedMcpInstaller one-click install + McpServerList/McpServerDetail; orphan mcp-panel.tsx (1316 lines) deleted**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-05-20T00:00:00Z
- **Completed:** 2026-05-20T00:45:00Z
- **Tasks:** 5 (RED + GREEN per plan-01, RED + GREEN per plan-02, DELETE per plan-03)
- **Files modified/created/deleted:** 7

## Accomplishments

- AI Chat window gains a third tab "MCP Servers" with McpServerList (left 256px) + McpServerDetail (right flex-1) wired via REST `/api/mcp/servers` with 15s polling
- New shared `FeaturedMcpInstaller` component (6 one-click install cards: brave-search, github, filesystem, puppeteer, postgres, memory) mounted above the list/detail in AI Chat AND in Settings MCP page
- 1316-line orphan `routes/ai-chat/mcp-panel.tsx` deleted; grep audit confirmed 0 live imports
- 60 total new + updated assertions: 42 ai-chat.test.tsx + 6 FeaturedMcpInstaller.test.tsx + 12 mcp-servers.test.tsx all GREEN

## Task Commits

1. **test(186-01): add failing tests for MCP tab in AI Chat** - `ccfbe62f`
2. **feat(186-01): add 3rd 'mcp' tab mounting McpServerList + McpServerDetail** - `a7e1bc5f`
3. **test(186-02): add failing tests for FeaturedMcpInstaller** - `9d1bd260`
4. **feat(186-02): NEW components/mcp/FeaturedMcpInstaller.tsx mounted in AI Chat (+ Settings)** - `88ade7cc`
5. **chore(186-03): delete orphan routes/ai-chat/mcp-panel.tsx + grep audit zero imports** - `dfcae745`

## Files Created/Modified/Deleted

- `livos/packages/ui/src/components/mcp/FeaturedMcpInstaller.tsx` — New shared 6-card install grid component
- `livos/packages/ui/src/components/mcp/FeaturedMcpInstaller.test.tsx` — 6 vitest assertions
- `livos/packages/ui/src/routes/ai-chat/index.tsx` — Tab union extended + MCP state + FeaturedMcpInstaller mount
- `livos/packages/ui/src/routes/ai-chat/ai-chat.test.tsx` — McpServerList/Detail mocks + 6 new B1-B6 assertions
- `livos/packages/ui/src/routes/settings/mcp-servers.tsx` — FeaturedMcpInstaller replaces inline card markup
- `livos/packages/ui/src/routes/settings/mcp-servers.test.tsx` — B6 updated to assert on FeaturedMcpInstaller source
- `livos/packages/ui/src/routes/ai-chat/mcp-panel.tsx` — DELETED (1316 lines)

## Decisions Made

- AI Chat is the PRIMARY MCP surface (per operator preference v38.0 UAT finding #2)
- Settings page keeps FeaturedMcpInstaller too — power users can configure without opening chat
- FeaturedMcpInstaller is purely presentational (caller handles fetch); onInstall prop decouples from transport
- Featured installer collapses when a server is selected (more screen space for detail view)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] B5 test needed fetch mock for server resolution**
- **Found during:** Task 2 GREEN (186-01 — MCP tab implementation)
- **Issue:** B5 test clicked the list mock to call onSelect('brave-search'), but mcpServers was empty (fetch not called in test env), so mcpSelectedServer resolved to null and McpServerDetail received server=null, showing mcp-detail-empty instead of mcp-server-detail-mock
- **Fix:** Updated B5 to mock `fetch` returning a server list before clicking the MCP tab; used `await act(async ...)` to let the useEffect fetch complete before asserting
- **Files modified:** livos/packages/ui/src/routes/ai-chat/ai-chat.test.tsx
- **Committed in:** a7e1bc5f (Task 2 feat commit)

**2. [Rule 1 - Bug] B1 FeaturedMcpInstaller test selector matched wrapper div**
- **Found during:** Task 2 GREEN (186-02 — FeaturedMcpInstaller creation)
- **Issue:** `[data-testid^="featured-mcp-"]` matched both the wrapper div (`featured-mcp-installer`) and the 6 card divs, returning 7 instead of expected 6
- **Fix:** Changed selector to `:not([data-testid="featured-mcp-installer"])` to exclude the wrapper
- **Files modified:** livos/packages/ui/src/components/mcp/FeaturedMcpInstaller.test.tsx
- **Committed in:** 88ade7cc (Task 2 feat commit)

**3. [Rule 1 - Bug] mcp-servers.test.tsx B6 stale after inline markup lift**
- **Found during:** Task 2 GREEN (186-02 — Settings integration)
- **Issue:** B6 asserted `data-testid=\{`featured-mcp-\${mcp.name}\`` in mcp-servers.tsx source, but that markup was moved to FeaturedMcpInstaller.tsx
- **Fix:** Updated B6 to read `INSTALLER_SRC` (FeaturedMcpInstaller.tsx) and assert there instead; added `INSTALLER_SRC` constant to test file header
- **Files modified:** livos/packages/ui/src/routes/settings/mcp-servers.test.tsx
- **Committed in:** 88ade7cc (Task 2 feat commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bug fixes in tests)
**Impact on plan:** All three fixes were test-correctness issues, not behavioral changes. No scope creep.

## Deferred Items

- Per-conversation MCP enable/disable (MCP servers are global today) → v39+
- MCP server logs viewer in the detail pane → v38.2
- MCP server marketplace integration (browse 100+ community servers) → v39+

## Issues Encountered

None beyond the 3 auto-fixed deviations above.

## Known Stubs

None — all 6 FeaturedMcpInstaller cards read from the real `FEATURED_MCPS` constant; McpServerList/Detail are real Phase 182-04 components. No placeholder data flows to UI.

## Threat Flags

No new network endpoints or auth paths introduced. All REST calls use `credentials: include` (same pattern as Phase 182-04 settings page). No new attack surface.

## Next Phase Readiness

- AI Chat MCP tab is complete; operator can install/manage MCP servers from the chat window
- v38.0 UAT finding #2 resolved
- Pre-existing test failures (25 in unrelated suites) remain unchanged — out of scope

---
*Phase: 186-mcp-back-to-ai-chat*
*Completed: 2026-05-20*

## Self-Check: PASSED

- `FeaturedMcpInstaller.tsx` — FOUND
- `FeaturedMcpInstaller.test.tsx` — FOUND
- `mcp-panel.tsx` — DELETED (correct)
- Commits `ccfbe62f`, `a7e1bc5f`, `9d1bd260`, `88ade7cc`, `dfcae745` — all exist in git log
- ai-chat.test.tsx 42/42 PASS
- FeaturedMcpInstaller.test.tsx 6/6 PASS
- mcp-servers.test.tsx 12/12 PASS
- Sacred SHA check: 25/25 PASS across all 5 commits
