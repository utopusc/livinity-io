# Phase 176: Main Liv Root Agent + 4 LivOS-Native Skills

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Master plan § Phase 176 + § Liv (Part F research) + Q7 operator decision (LivOS-native 4-pack)
**Wave:** 5 (parallel with 181 — depends 171, 175)

<domain>
## Phase Boundary

Build Main Liv root agent and ship 4 LivOS-native default skills. Liv greets new users, has 6 mutation tools to manage the vault, and can spawn the 4 default subagents on demand.

**Phase 176 sonu:**
- Main Liv synthetic root row in sidebar (NOT an Item, always top)
- `~/liv/settings/liv-rootagent.md` — Liv's system prompt (user-editable)
- 6 Liv-specific MCP tools: `create_item`, `list_items`, `move_item`, `archive_item`, `open_item`, `run_agent`
- 4 LivOS-native default subagents scaffolded into `~/liv/.claude/agents/`:
  - **`luse-driver.md`** — computer use (Phase 165 luse MCP re-registered)
  - **`livos-operator.md`** — LivOS architecture knowledge (systemd, vault layout, phases, sacred files)
  - **`appstore.md`** — install/uninstall/list apps via existing `apps.*` tRPC
  - **`window-manager.md`** — list/focus/close/pin windows via Phase 159 WindowManager tRPC
- Empty-state UI: centered Liv terminal when vault has no Items
- Liv's tmux session auto-spawned on first boot with system prompt loaded
</domain>

<decisions>

### Plan 176-01: Liv-rootagent.md template + scaffolder extension
- NEW `livinityd/source/modules/vault/templates/liv-rootagent.md` (Liv's default system prompt — per master plan Part F text)
- MOD Phase 162-01 `vault-scaffolder.ts`? NO — sacred. Instead: NEW `vault-items/liv-scaffolder.ts` that runs at vault-items module init, drops the file if absent
- Liv's system prompt: warm + terse, knows the vault state, suggests next moves, speaks user's last language, can call 6 mutation tools + 4 default subagents
- Acceptance: 4 vitest assertions — template content valid YAML+md, scaffolder idempotent, doesn't overwrite user edits

### Plan 176-02: Liv's 6 mutation MCP tools
- NEW `vault-items/tools/liv-tools.ts` — registers 6 MCP tools via livinityd's existing MCP infra (Phase 77 pattern)
- `create_item`, `list_items`, `move_item`, `archive_item`, `open_item` → wrap `vault.items.*` tRPC
- `run_agent({agentId, oneShot?, message?})` → triggers Phase 177 scheduler bypass (stub for now, full impl in 177)
- Acceptance: 12 vitest assertions — each tool's input schema validates, dispatch hits correct tRPC, audit-log entry written per invocation

### Plan 176-03: LivOS-native default subagent files
- NEW templates at `livinityd/source/modules/vault/templates/skills/{luse-driver,livos-operator,appstore,window-manager}.md`
- Each is a CC-compatible subagent .md with frontmatter (name, description, tools, model) + body
- `luse-driver.md` = Phase 165 file verbatim (re-shipped under v38)
- `livos-operator.md` = NEW, knows: systemd services, vault layout, Phase history (top 5), sacred files, troubleshooting flowcharts
- `appstore.md` = NEW, tools: `apps.list`, `apps.install`, `apps.uninstall` via tRPC
- `window-manager.md` = NEW, tools: `windows.list`, `windows.focus`, `windows.close`, `windows.pin` via Phase 159 tRPC
- Scaffolder copies these into `~/liv/.claude/agents/` on vault init (or on missing file detection at boot)
- Acceptance: 8 vitest assertions — 4 files scaffolded with correct frontmatter, can be picked up by CC's native `settingSources: ['project']` discovery when Liv's tmux runs in `cwd: ~/liv/`

### Plan 176-04: Empty-state UI + Liv tmux auto-spawn
- MOD `routes/ai-chat/index.tsx` — when `vault.items.list` returns empty (only Main Liv), render centered Liv terminal directly
- NEW `<LivWelcomeTerminal>` — wraps `<CcTerminal>` with a deterministic tmux session name (`livos-liv-root-<userId>`)
- Liv's tmux session auto-created on first user boot if missing; uses `~/liv/` as cwd; system prompt loaded via `claude --append-system-prompt`
- Greeting line streamed to xterm on first attach: "Hi, I'm Liv. Tell me what to build..."
- Acceptance: 6 vitest assertions — empty-state render, terminal mount, tmux session creation idempotent

### Plan 176-05: Liv `/agents` discoverability + sidebar handoff
- When Liv calls `create_item` for an Agent, Phase 174 sidebar tree updates via Redis pub/sub
- When Liv calls `open_item`, UI focuses the row (via WebSocket message → SidebarTree handler)
- Acceptance: 6 vitest assertions — Liv creates Agent → sidebar shows it within 100ms; Liv calls open_item → SidebarTree focused row matches
</decisions>

<canonical_refs>
- Master plan § Phase 176 + Part F (Liv root agent spec)
- `vault/.claude/agents/luse-driver.md` (Phase 165 existing — re-shipped)
- Phase 165-02 ChatBackendPanel pattern (referenced for tool-registration shape)
- `livos/packages/livinityd/source/modules/apps/` (apps.* tRPC routes for appstore.md)
- `livos/packages/livinityd/source/modules/webapps/` (windows.* tRPC routes for window-manager.md)
- Phase 162-01 scaffolder pattern (mirror, but don't modify)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 176-01 | NEW vault/templates/liv-rootagent.md; NEW vault-items/liv-scaffolder.ts + test |
| 176-02 | NEW vault-items/tools/liv-tools.ts + test; MOD MCP server registration |
| 176-03 | NEW 4 subagent templates; MOD scaffolder copy logic |
| 176-04 | MOD routes/ai-chat/index.tsx (empty-state branch); NEW features/liv-welcome/LivWelcomeTerminal.tsx + test |
| 176-05 | MOD SidebarTree (handle open_item WebSocket event); MOD pubsub forwarder |

**Sacred guards:** Phase 162-01 vault-scaffolder.ts UNCHANGED. Phase 165 luse-driver.md UNCHANGED in its current location, just copy-on-scaffold to new vault root.

</specifics>

<deferred>
- `run_agent` real implementation (cron + on-demand) → Phase 177
- Liv's 5th skill (e.g., journal/diary) → v38.1 polish
- Multi-language Liv personality variants → v38.x polish (Q4 default = bilingual auto-detect)
</deferred>

---

*Phase: 176-main-liv-rootagent*
*Wave: 5 (parallel with 181 — depends 171, 175)*
*Depends on: Phase 171, 175*
*Estimated: ~2 days agent work*
