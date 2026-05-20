# Phase 182: Settings Restructure

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Master plan § Phase 182 + Settings research Topic 2, D-V38-L/M/N
**Wave:** 4 (parallel with 181)

<domain>
## Phase Boundary

Restructure Settings sidebar: PERSONAL / WORKSPACE / AI / SYSTEM groups. Remove ChatBackendPanel + route. Drop top-menu Agents tile (sidebar absorbs). Rename "Autonomous Agents" → "Scheduled Agents". Add `<AiChatSettingsPanel>` (7 fields) + `<McpServersPanel>` (lifted from chat sidebar).

**Phase 182 sonu:**
- Settings `MENU_ITEMS` regrouped with `group: 'personal'|'workspace'|'ai'|'system'` field
- ChatBackendPanel + `routes/settings/chat-backend.tsx` DELETED (D-V38-L)
- Top-menu Agents tile DELETED (`providers/apps.tsx` LIVINITY_subagents entry removed)
- "Autonomous Agents" → "Scheduled Agents" rename
- NEW `<AiChatSettingsPanel>` with 7 form fields (dangerously-skip toggle, default cwd, idle hours, max sessions, allowed paths, force terminal on phone, default model)
- NEW `<McpServersPanel>` — two-column (list / detail), featured-MCP section, lifted from `routes/ai-chat/mcp-panel.tsx`
- Footer cluster: gear-icon button + Advanced + Troubleshoot (moved from inline list)
- `default model` picker absorbed into existing `ai-config.tsx`
</domain>

<decisions>

### Plan 182-01: Delete ChatBackend + top-menu Agents tile + rename
- DELETE `routes/settings/chat-backend.tsx`, `modules/settings/ChatBackendPanel.tsx` + tests
- DROP `chat-backend` from MENU_ITEMS + Routes table
- DELETE LIVINITY_subagents entry from `providers/apps.tsx`
- Rename `autonomous-agents` → "Scheduled Agents"
- Move "default model" picker into `ai-config.tsx`
- Acceptance: tsc clean, vitest of Settings stays green, grep proves no orphan imports

### Plan 182-02: Sidebar grouping + footer
- MOD `routes/settings/_components/settings-content.tsx` — extend `MenuItem` with `group` field, render group headers
- 4 groups: PERSONAL (account, theme, language, 2fa, voice) / WORKSPACE (memory, usage, integrations) / AI (ai-config, ai-chat-settings, mcp-servers, scheduled-agents) / SYSTEM (users, devices, my-domains, chrome-profile, scheduler, backups, software-update)
- Footer cluster: gear icon + Advanced + Troubleshoot (moved out of inline list)
- Acceptance: 8 vitest assertions — group headers render, footer cluster styled distinct

### Plan 182-03: AiChatSettingsPanel
- NEW `routes/settings/ai-chat-settings.tsx` + lazy slot
- 7 form fields backed by Redis keys:
  - `liv:config:cc_pty_skip_perms` (toggle, default true per D-V38-K, red warning chip)
  - `liv:config:cc_pty_default_cwd` (text + Browse button)
  - `liv:config:cc_pty_idle_h` (number 1-168, default 24)
  - `liv:config:cc_pty_max_sessions` (number 1-50, default 10)
  - `liv:config:cc_pty_allowed_paths` (textarea, validate existence)
  - `liv:config:cc_pty_force_terminal_phone` (toggle, default false — Phase 181 honors)
  - `liv:config:cc_pty_default_model` (select, absorbed)
- tRPC routes: `ccPty.getConfig`, `ccPty.setConfig`, `ccPty.validatePaths`
- Debounced auto-save 800ms; confirm dialog on skip-perms ON transition
- Acceptance: 14 vitest assertions

### Plan 182-04: McpServersPanel (lifted from chat sidebar)
- Refactor `routes/ai-chat/mcp-panel.tsx` into presentational `<McpServerList>` + `<McpServerDetail>`
- NEW `routes/settings/mcp-servers.tsx` mounts both
- Featured-MCP one-click install path stays here
- Acceptance: 12 vitest assertions

### Plan 182-05: Settings router cleanup + deep-link audit
- Audit `routes/settings/index.tsx` Routes table — remove orphaned entries (`liv-agent`, `dm-pairing` route-only, etc.)
- Confirm deep-link routes for new panels (`/settings/ai-chat-settings`, `/settings/mcp-servers`) work
- Acceptance: 6 vitest assertions
</decisions>

<canonical_refs>
- Settings research Topic 2 — 24-entry audit, group structure proposal
- `routes/settings/_components/settings-content.tsx` (MENU_ITEMS source of truth)
- `routes/settings/index.tsx` (Routes table)
- `routes/ai-chat/mcp-panel.tsx` (component being lifted)
- `providers/apps.tsx` (LIVINITY_subagents entry to drop)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 182-01 | DEL chat-backend.tsx + ChatBackendPanel.tsx; MOD MENU_ITEMS/Routes; MOD providers/apps.tsx; MOD ai-config.tsx |
| 182-02 | MOD settings-content.tsx (groups + footer) + test |
| 182-03 | NEW ai-chat-settings.tsx + test; NEW tRPC ccPty.getConfig/setConfig/validatePaths + test |
| 182-04 | REFACTOR mcp-panel.tsx → presentational; NEW mcp-servers.tsx + test |
| 182-05 | MOD routes/settings/index.tsx (audit) + test |

**Sacred guards:** Phase 164 AutonomousAgentsPanel STAYS (rename only). Phase 165-02 ChatBackendPanel DELETED — explicit per D-V38-L.

</specifics>

<deferred>
- Per-user vault dir multi-tenant ready picker → v38.1 (Q2 option b)
- Hooks/automation panel → v39
</deferred>

---

*Phase: 182-settings-restructure*
*Wave: 4 (parallel with 181)*
*Estimated: ~2-3 days agent work*
