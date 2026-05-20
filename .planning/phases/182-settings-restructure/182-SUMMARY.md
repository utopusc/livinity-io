---
phase: 182-settings-restructure
plan: "01-05"
subsystem: ui/settings
tags: [settings, mcp, cc-pty, sidebar, tRPC, REST]
dependency_graph:
  requires:
    - 181-mobile-cc-pty
    - 175-05 (cc-pty-router deleted)
    - 164 (AutonomousAgentsPanel sacred)
  provides:
    - Settings sidebar with PERSONAL/WORKSPACE/AI/SYSTEM groups
    - AiChatSettingsPage (7-field CC PTY config, ccPty tRPC router)
    - McpServersPage (two-column, REST /api/mcp/*)
    - /ai-chat-settings + /mcp-servers routes registered
  affects:
    - livos/packages/ui/src/routes/settings/
    - livos/packages/ui/src/components/mcp/
    - livos/packages/livinityd/source/modules/server/trpc/
tech_stack:
  added:
    - ccPtyConfigRouter (7-key Redis config, adminProcedure-gated)
    - McpServerList / McpServerDetail / featured-mcps (new components/mcp/ dir)
  patterns:
    - Source-text invariant tests (readFileSync + regex)
    - Two-column settings layout (list + detail)
    - 800ms debounced auto-save with AlertDialog confirm gate
key_files:
  created:
    - livos/packages/ui/src/routes/settings/ai-chat-settings.tsx
    - livos/packages/ui/src/routes/settings/ai-chat-settings.test.tsx
    - livos/packages/ui/src/routes/settings/mcp-servers.tsx
    - livos/packages/ui/src/routes/settings/mcp-servers.test.tsx
    - livos/packages/ui/src/routes/settings/index.test.tsx
    - livos/packages/ui/src/routes/settings/_components/settings-content.test.tsx
    - livos/packages/ui/src/components/mcp/McpServerList.tsx
    - livos/packages/ui/src/components/mcp/McpServerDetail.tsx
    - livos/packages/ui/src/components/mcp/featured-mcps.ts
    - livos/packages/livinityd/source/modules/server/trpc/cc-pty-config-router.ts
    - livos/packages/livinityd/source/modules/server/trpc/cc-pty-config-router.test.ts
  modified:
    - livos/packages/ui/src/routes/settings/_components/settings-content.tsx
    - livos/packages/ui/src/routes/settings/index.tsx
    - livos/packages/ui/src/routes/settings/autonomous-agents.tsx
    - livos/packages/ui/src/routes/settings/ai-config.tsx
    - livos/packages/ui/src/providers/apps.tsx
    - livos/packages/livinityd/source/modules/server/trpc/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
  deleted:
    - livos/packages/ui/src/routes/settings/chat-backend.tsx
    - livos/packages/ui/src/modules/settings/ChatBackendPanel.tsx
    - livos/packages/ui/src/modules/settings/ChatBackendPanel.test.tsx
decisions:
  - FieldRow API uses label/value/trailing props (not children pattern) — adapted AiChatSettings accordingly
  - mcp-panel uses REST /api/mcp/* (not tRPC) — McpServersPage reuses same REST pattern
  - LIVINITY_subagents dock/window references kept intact (only removed from providers/apps.tsx systemApps)
  - Source-text invariant test pattern used throughout to avoid DOM rendering complexity
metrics:
  duration: "~12 minutes (context continuation)"
  completed: "2026-05-20"
  tasks_completed: 7
  files_changed: 24
---

# Phase 182 Plans 01-05: Settings Restructure Summary

Settings sidebar restructured into PERSONAL/WORKSPACE/AI/SYSTEM groups with ChatBackend deletion, LIVINITY_subagents tile removal, Autonomous→Scheduled rename, ccPty tRPC router, AiChatSettingsPage, and McpServersPage with presentational MCP components.

## Plans Executed

| Plan | Name | Commit | Tests |
|------|------|--------|-------|
| 182-01 | Delete ChatBackend + LIVINITY_subagents + rename Autonomous | `81d655f3` | — |
| 182-02 | Settings sidebar PERSONAL/WORKSPACE/AI/SYSTEM groups | `ec22b4bb` | 11 pass |
| 182-03 | AiChatSettingsPanel + ccPty tRPC router | `97198867` | 14+19 pass |
| 182-04 | MCP components + settings/mcp-servers | `17ac0533` | 12 pass |
| 182-05 | Routes audit + /ai-chat-settings + /mcp-servers | `d9bd3a47` | 6 pass |

**Total assertions added this phase: 62**

## What Was Built

### Plan 182-01 — Cleanup
- Deleted `chat-backend.tsx` route, `ChatBackendPanel.tsx`, and its test
- Removed `LIVINITY_subagents` from `providers/apps.tsx` systemApps array
- Renamed "Autonomous agents" → "Scheduled Agents" in `autonomous-agents.tsx` (label change only; AutonomousAgentsPanel.tsx sacred, untouched)

### Plan 182-02 — Sidebar Groups
- Settings sidebar now renders PERSONAL / WORKSPACE / AI / SYSTEM group headers with `data-testid='settings-group-{name}'`
- Footer cluster with troubleshoot/advanced has `data-testid='settings-footer-cluster'`
- ai-chat-settings and mcp-servers added as adminOnly AI group items
- autonomous-agents renamed to "Scheduled Agents" in sidebar

### Plan 182-03 — AI Chat Settings + ccPty Router
- `cc-pty-config-router.ts` with 3 adminProcedure-gated tRPC procedures: `getConfig`, `setConfig`, `validatePaths`
- 7 Redis keys: `liv:config:cc_pty_{skip_perms,default_cwd,idle_h,max_sessions,allowed_paths,force_terminal_phone,default_model}`
- Path traversal guard in `validatePaths`: blocks `..` components
- `AiChatSettingsPage` with 7 form fields, 800ms debounced save, AlertDialog confirm on skip_perms enable
- Routed via `httpOnlyPaths` in `common.ts` to avoid WebSocket reconnect hangs
- `chatConfig.getModel` / `chatConfig.setModel` wired to ai-config.tsx

### Plan 182-04 — MCP Components + Page
- `components/mcp/McpServerList.tsx` — searchable list, status dots, enable/disable, remove
- `components/mcp/McpServerDetail.tsx` — transport info, tools list, error display
- `components/mcp/featured-mcps.ts` — shared FEATURED_MCPS constant (9 servers)
- `routes/settings/mcp-servers.tsx` — two-column layout, REST `/api/mcp/*` (same as mcp-panel.tsx), 15s poll interval

### Plan 182-05 — Route Audit
- `index.tsx` now has lazy imports + `<Route path='/ai-chat-settings'>` + `<Route path='/mcp-servers'>`
- `/chat-backend` confirmed absent (deleted in 182-01)
- All pre-existing routes verified intact (`/ai-config`, `/troubleshoot`, `/advanced`, etc.)

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed syntax error in mcp-servers.tsx generic type**
- **Found during:** Plan 182-04 Task 2 (test creation / context resumption)
- **Issue:** `mcpFetch<{servers: McpServerConfig[]; statuses: Record<string, McpServerStatus>>` missing closing `}` for outer object type
- **Fix:** Added the closing `}>` — `mcpFetch<{servers: McpServerConfig[]; statuses: Record<string, McpServerStatus>}>('/servers')`
- **Files modified:** `mcp-servers.tsx`
- **Commit:** `17ac0533`

**2. [Rule 2 - Adaptation] FieldRow API uses label/value/trailing (not children)**
- **Found during:** Plan 182-03
- **Issue:** Plan assumed `<FieldRow label=... description=...>{children}</FieldRow>` but actual API uses `label`, `value`, `trailing` props
- **Fix:** Adapted AiChatSettingsPage JSX to use the correct prop API
- **Commit:** `97198867`

**3. [Rule 2 - Adaptation] MCP panel uses REST not tRPC**
- **Found during:** Plan 182-04
- **Issue:** Plan assumed `mcp.listServers`, `mcp.getStatuses`, etc. tRPC procedures existed; actual `mcpRouter` has different procedures
- **Fix:** McpServersPage uses REST `fetch('/api/mcp/servers')` matching existing `mcp-panel.tsx` pattern
- **Commit:** `17ac0533`

**4. [Scope boundary] LIVINITY_subagents dock/window references kept**
- **Rationale:** `dock-item.tsx`, `window-content.tsx`, `window-manager.tsx` reference `LIVINITY_subagents` for dock icon, window title, and default window size — these are pre-existing window infrastructure, not the systemApps tile. Only `providers/apps.tsx` entry removed per plan requirement D-V38-M.

## Known Stubs

None — all data flows are wired (REST or tRPC). Featured MCPs default to no credentials (install path via POST /api/mcp/servers is functional).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-tRPC-surface | cc-pty-config-router.ts | New adminProcedure-gated tRPC router exposing setConfig (Redis writes) and validatePaths (filesystem stat). Both gated to admin role only. Path traversal guard applied. |

## Self-Check

Files created — verified:
- `livos/packages/ui/src/components/mcp/McpServerList.tsx` — FOUND
- `livos/packages/ui/src/components/mcp/McpServerDetail.tsx` — FOUND
- `livos/packages/ui/src/components/mcp/featured-mcps.ts` — FOUND
- `livos/packages/ui/src/routes/settings/mcp-servers.tsx` — FOUND
- `livos/packages/ui/src/routes/settings/mcp-servers.test.tsx` — FOUND
- `livos/packages/ui/src/routes/settings/index.test.tsx` — FOUND
- `livos/packages/livinityd/source/modules/server/trpc/cc-pty-config-router.ts` — FOUND
- `livos/packages/ui/src/routes/settings/ai-chat-settings.tsx` — FOUND

Commits verified:
- `81d655f3` chore(182-01) — FOUND
- `ec22b4bb` feat(182-02) — FOUND
- `97198867` feat(182-03) — FOUND
- `17ac0533` feat(182-04) — FOUND
- `d9bd3a47` feat(182-05) — FOUND

Sacred SHA: `git diff HEAD -- liv/packages/core/src/agent/sdk-agent-runner.ts` = empty (PASS)

## Self-Check: PASSED
