# Phase 183: tmux status off + dangerously-skip default + sidebar Settings gear

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Master plan § Phase 183 + D-V38-K/R + operator explicit requests
**Wave:** 4 (parallel with 175 — depends 174, 182)

<domain>
## Phase Boundary

Three tightly-scoped polish patches:
1. `tmux set -g status off` on every session spawn (eliminates status line — operator explicit request)
2. `cc-pty/manager.ts` injects `--dangerously-skip-permissions` flag conditionally on Redis `liv:config:cc_pty_skip_perms` (default true per D-V38-K)
3. Sidebar bottom-left gear-icon Settings button wired to open Settings window (D-V38-N)

**Phase 183 sonu:**
- New CC PTY sessions spawn with `tmux set -g status off` applied → no status line visible in xterm.js
- `cc-pty/manager.ts` reads Redis on each createSession; appends `--dangerously-skip-permissions` to claude command if config true
- Settings panel toggle (Phase 182's AiChatSettingsPanel) honored: changing toggle takes effect on NEXT new session (existing sessions unchanged)
- SidebarTree gear icon (placed in Phase 174) gets click handler → opens Settings window via existing WindowManager
</domain>

<decisions>

### Plan 183-01: tmux status off + dangerously-skip injection
- MOD `cc-pty/manager.ts` (additive — sacred SHA stays via additive-only) — child command now `'LANG=... LC_ALL=... HOME=/root claude ${skipPerms ? "--dangerously-skip-permissions" : ""}'`
- Plus tmux command: `tmux new-session -d ... ; set -g status off`
- Redis read at createSession time: `redis.get('liv:config:cc_pty_skip_perms')` (default 'true')
- Acceptance: 8 vitest assertions — flag injected when config true, omitted when false; tmux status off via tmux command grep

### Plan 183-02: Sidebar gear → Settings click wiring
- MOD `features/sidebar-tree/SidebarTree.tsx` — gear icon footer button calls `windowManager.openWindow('settings')`
- Acceptance: 4 vitest assertions — click opens Settings window, idempotent if already open
</decisions>

<canonical_refs>
- D-V38-K (dangerously-skip default ON), D-V38-R (tmux status off), D-V38-N (sidebar gear)
- `cc-pty/manager.ts` (Phase 166-03 + 167.2 hotfixes — modified additively in 183-01)
- `features/sidebar-tree/SidebarTree.tsx` (Phase 174 — footer slot placed but click handler stubbed)
- Existing WindowManager API (`livos/packages/ui/src/modules/window/`)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 183-01 | MOD cc-pty/manager.ts (additive) + tests update |
| 183-02 | MOD features/sidebar-tree/SidebarTree.tsx (handler) + test |

**Sacred guards:** Phase 166 manager.ts modified ADDITIVELY only — existing 23 vitest assertions stay green; new fields tested incrementally.

</specifics>

<deferred>
- Per-session override of skip-perms flag (currently only global) → v38.1
- tmux global config file at `~/.tmux.conf` (currently per-session set) → v38.x polish
</deferred>

---

*Phase: 183-polish-tmux-skipperms-gear*
*Wave: 4 (parallel with 175 — depends 174, 182)*
*Depends on: Phase 174, 182*
*Estimated: ~0.5 days agent work*
