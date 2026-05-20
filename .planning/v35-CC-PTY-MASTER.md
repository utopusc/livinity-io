# v35.0 — Claude Code PTY Embed + Vault Memory Graph

**Opened:** 2026-05-19
**Closes:** v34.x ↔ Claude Code Full Integration cycle
**Theme:** Main Chat surface (AI Chat dock window) becomes a real Claude Code terminal embedded via xterm.js + tmux PTY; vault memory graph view added as second tab. Other chat surfaces (WebApp/NativeApp) keep SDK approach per Phase 161/163.

---

## Pre-Flight Verified (2026-05-19, Mini PC live)

| Check | Result |
|-------|--------|
| Node version | v22.22.1 |
| Python3 + make + g++ | all present (`/usr/bin/python3`, `/usr/bin/make`, `/usr/bin/g++`) |
| `claude` binary | v2.1.84 at `/usr/bin/claude` |
| CC flags verified | `--resume`, `--continue`, `--fork-session`, `--from-pr`, `--agent`, `--effort` |
| HOME contract | livinityd /proc env confirms `HOME=/root` (subscription path) |
| Credentials file | `/root/.claude/.credentials.json` 634B, mtime today |
| @xterm refs in pnpm-lock | 8 (already a transitive dep from Phase 99 VNC) |
| node-pty refs in pnpm-lock | 3 (already a transitive dep) |
| d3-force refs in pnpm-lock | 6 (transitive — react-force-graph foundation) |
| Disk free | 800GB / 900GB |
| RAM free | 27GB / 31GB |
| **tmux** | ❌ **NOT installed** — Phase 166 install step required |
| **react-force-graph-2d** | ❌ NOT in lockfile — Phase 169 adds it |

**D-NEW-DEPS-v35:** v35.0 milestone explicitly permits two new dependencies:
- `react-force-graph-2d` (npm, ~80KB minified)
- `tmux` (apt, Ubuntu repo, ~600KB)

D-NO-NEW-DEPS guardrail from v34.x is RETIRED for this milestone. All other sacred guards (Sacred SHA, D-09, Phase 161-02 helper, Phase 162 vault scaffolder, Phase 163 surface routing, Phase 164 autonomous scheduler core) REMAIN LOCKED.

---

## Locked Architectural Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| **D-V35-A** | PTY backend = **node-pty + tmux** (both required) | tmux gives free session persistence (survives WebSocket disconnect, livinityd restart). node-pty bridges Node ↔ tmux master process. |
| **D-V35-B** | WS protocol = JSON control envelopes + base64 stdout frames | Matches existing `ws-agent.ts` shape; binary frames future-optimisation. |
| **D-V35-C** | Session metadata storage = `vault/.claude/livos-cc-sessions.json` (JSON array) | Lives in vault (Obsidian-visible), survives livinityd restart, single source of truth. |
| **D-V35-D** | Idle reaper default = **24h** (`liv:config:cc_pty_idle_h`, configurable) | Power-user CC sessions may run overnight builds; 24h is honest safety net. |
| **D-V35-E** | Multi-attach mode = **mirror** (tmux default) | Multi-device same-session viewing; concurrent typing is rare edge case. |
| **D-V35-F** | Vault graph data source = **on-demand fetch + manual refresh button** | fs.watch live updates deferred (complexity); manual refresh is enough for v1. |
| **D-V35-G** | Mobile = SDK chat stays on separate route `/chat-mobile`; CC PTY desktop-only | Two-route maintenance < forcing CC PTY on mobile (unusable UX). |
| **D-V35-H** | Concurrent CC session cap per user = **10** (`liv:config:cc_pty_max_sessions`) | Memory pressure cap; user can override via Redis. |
| **D-V35-I** | Graph scope v1 = vault `*.md` files only (memory + sessions + inbox) | System state (RBAC, devices, agents) deferred to v35.x or v36. |
| **D-V35-J** | xterm.js theme = **LivOS dark theme tokens** (live-bound to Settings → Theme) | UI consistency; CC's color scheme adapts to LivOS theme. |
| **D-V35-K** | Legacy SDK Main Chat = **REMOVED** from AI dock window (replaced by CC PTY) | Two code paths = tech debt. Mobile route retains SDK separately. Single revert restores legacy if catastrophic. |
| **D-V35-L** | Other chat surfaces (WebApp Chat, NativeApp Chat) = **UNCHANGED** (SDK kept) | Per user's explicit scope statement; CC PTY pivot scoped to AI dock window only. |
| **D-V35-M** | Subagent UX = inherits CC's native Task tool UX | luse-driver subagent (Phase 165) already on disk in vault/.claude/agents/; CC discovers automatically. |
| **D-V35-N** | Session persistence = tmux owns the process; livinityd restart does NOT kill sessions | tmux daemon survives livinityd cycles; reattach is fresh WS over existing tmux. |

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| node-pty native build fails on Mini PC | Medium | Pre-flight verified build toolchain present; phase 166 task 1 = build smoke test before any wiring |
| tmux session leak (zombie sessions) | Medium | 24h idle reaper + explicit user delete + livinityd boot sweep |
| CC Ctrl+C/Ctrl+D/Ctrl+L don't propagate through PTY | Medium | Phase 166 task 4 = signal propagation test before frontend work |
| xterm.js mobile UX broken | Low | D-V35-G: mobile users see "open on desktop" message, fall back to mobile SDK chat |
| Vault graph performance at 1000+ nodes | Low | react-force-graph-2d handles 5000+ nodes; cap node count at 2000 with warning |
| Subagent (luse-driver) tools not visible to CC inside PTY | Medium | CC reads `vault/.claude/agents/*.md` via `settingSources: ['project']` — but PTY-spawned CC inherits cwd from spawn dir, which we set to vault root |
| Concurrent WS attach race (multi-device) | Low | tmux handles natively (mirroring); UI must show "another device is attached" indicator |

---

## Phase Breakdown (5 phases, 3 waves)

### Wave 1 — Foundation (parallel)

| Phase | Goal | Files modified | Tasks | Autonomous |
|-------|------|----------------|-------|------------|
| **166** CC PTY Backend | livinityd `cc-pty-manager.ts` module: tmux session lifecycle (spawn/attach/kill), `/ws/cc-pty` WebSocket endpoint, session metadata at `vault/.claude/livos-cc-sessions.json`, idle reaper integration | `livos/packages/livinityd/source/modules/cc-pty/{index,manager,session-store,ws-handler}.ts` + tests; `source/index.ts` boot wire-up; `package.json` (node-pty already there, verify build) | 5 plans | yes |
| **167** xterm.js Frontend Component | `<CcTerminal>` React component, WS protocol implementation, resize sync, copy/paste, theme-bound colors, mobile fallback message | `livos/packages/ui/src/features/cc-terminal/{CcTerminal,terminal-ws-client,terminal-theme,terminal-keybindings}.tsx` + tests; `routes/ai-chat/index.tsx` (replace legacy SDK chat) | 4 plans | yes |
| **169** Vault Memory Graph | `/api/vault/graph` backend endpoint (vault walker + wikilink parser + JSON emitter); `<VaultGraph>` React component with react-force-graph-2d; click → side panel preview; manual refresh; node count cap 2000 | `livos/packages/livinityd/source/modules/vault-graph/{index,walker,parser,routes}.ts` + tests; `livos/packages/ui/src/features/vault-graph/{VaultGraph,GraphNodeDetail}.tsx`; integrate as 2nd tab next to terminal in AI chat | 5 plans | yes |

### Wave 2 — Integration (depends on Wave 1)

| Phase | Goal | Files modified | Tasks | Autonomous |
|-------|------|----------------|-------|------------|
| **168** Session Sidebar + Lifecycle UI | Replace current AI Chat session list with CC sessions list backed by 166. New Session button → POST → tmux new + sidebar reflects. Click session → WS attach in `<CcTerminal>`. Rename/delete actions. Last-message preview parses CC session jsonl. Cross-tab/cross-device "attached elsewhere" indicator. | `livos/packages/ui/src/features/cc-sessions/{SessionSidebar,SessionItem,NewSessionButton}.tsx`; tRPC `cc-pty-router.ts` (list, create, rename, delete, get-preview); httpOnlyPaths +5 entries | 4 plans | yes |

### Wave 3 — Ship (depends on all)

| Phase | Goal | Files modified | Tasks | Autonomous |
|-------|------|----------------|-------|------------|
| **170** Mini PC Deploy + UAT + v35-VERIFICATION | apt install tmux; deploy; live UAT walk (session persistence test, graph render, subagent spawn via CC native Task UX, theme-binding); consolidated v35-VERIFICATION.md; safety state | `.planning/phases/170-v35-deploy-uat/v35-VERIFICATION.md`; STATE.md; ROADMAP.md milestone close | 3 plans | mostly auto (1 checkpoint:human-verify for browser walk) |

**Total: 21 plans across 5 phases, 3 waves. Parallel execution → ~5-6 day wall-clock; sequential ~10-11 days.**

---

## Sacred Guardrails (every phase enforces)

- **Sacred SHA**: `liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED
- **D-09**: `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` byte-identical
- **Phase 161-02 helper**: `livos/.../ai/agent-prompt-builder.ts` byte-identical
- **Phase 162-01**: `vault-scaffolder.ts` source byte-identical (templates tree may gain new files = additive)
- **Phase 162-02**: `agent-session.ts` byte-identical (CC PTY does NOT route through AgentSessionManager — it's a parallel surface)
- **Phase 163 surface routing**: `ws-agent.ts` `resolveSessionVaultPath` + composite sessionKey UNCHANGED
- **Phase 164 scheduler core**: `autonomous-scheduler/scheduler.ts` core logic UNCHANGED (165-02 read-getters retained)
- **Other chat surfaces UNCHANGED**: WebApp Chat + NativeApp Chat continue to use SDK via Phase 161/163 path; CC PTY is a NEW parallel surface scoped to AI dock window only

**D-NEW-DEPS-v35 EXCEPTION**: Two new deps explicitly authorized in this milestone:
- `react-force-graph-2d` (Phase 169)
- `tmux` apt package (Phase 166 — system-level, not npm)

---

## Success Criteria

1. Operator opens AI Chat dock window → sees Terminal tab + Graph tab + Session sidebar
2. Click "New Session" → tmux session spawns; CC prompts; first message routes correctly with vault context (CLAUDE.md loaded, model identifiable via SDK init event)
3. Close browser tab → reopen → session still alive (tmux process still running, terminal reattaches with full scrollback)
4. Run `/agents` in CC → luse-driver visible (Phase 165 subagent loaded via `settingSources: ['project']`)
5. Ask CC: "screenshot the desktop" → CC spawns luse-driver Task → screenshot result returns → main chat summarizes
6. Switch to Graph tab → vault nodes render (memory/, sessions/, inbox/ entries) → click node → side panel shows file content
7. Sacred SHA + D-09 + agent-session.ts + vault-scaffolder.ts byte-identical pre/post deploy
8. Other surfaces (WebApp Chat for installed n8n, NativeApp Chat for Obsidian) still work — SDK chat-path-untouched contract preserved
9. Mobile route (`/chat-mobile`) loads SDK chat fallback (legacy path retained)
10. v35-VERIFICATION.md status = `passed` (or `passed-pending-OperatorUAT` for browser walk items)

---

## Resume on /clear

```
/clear
/gsd-autonomous --from 166
```

Agents will:
1. Read this master plan
2. Read each phase's CONTEXT.md
3. Plan → execute → verify each phase
4. Dispatch waves in parallel (166 + 167 + 169 simultaneously; 168 after wave 1; 170 after all)
5. Mini PC deploy in Phase 170 via detached SSH + log poll (per `reference_zerotier_unstable`)
6. Sacred guardrails enforced every commit

**Hard guardrails (Claude/agent autonomy boundary):**
- D-V35-K: legacy SDK Main Chat REMOVAL is intentional; do not preserve as fallback in same route
- Sacred SHA pre-commit hook live on master; never skip via --no-verify
- v34.x phases (162-165) are READ-ONLY; do not modify their files
- tmux apt install requires `sudo apt install tmux` on Mini PC — Phase 170 deploy step handles this

---

## Carry-overs (NOT in v35.0 scope)

- **Stream window fullscreen gray bars fix** → defer to v35.x polish (or v34.x phase 165.1 hotfix)
- **WebApp/NativeApp window chat icon contextual routing bug** → defer to v35.x (separate from CC PTY)
- **AI Chat transparent UI fix** → defer to v35.x polish
- **In-header model picker** → folded into Phase 167 (xterm dock has model badge from CC's init event; switching means new session)
- **Live fs.watch graph updates** → v35.1
- **System state nodes (RBAC, devices, agents) in graph** → v35.1
- **CC PTY for mobile via remote terminal app integration** → v36 or later
- **WebApp/NativeApp CC PTY pivot** → v36 (after main chat proven)

---

*Master Plan: v35-CC-PTY-MASTER.md*
*Pre-flight verified: 2026-05-19*
*Approach: GSD autonomous wave-based dispatch*
*Total estimate: ~10 days (parallel: ~5-6 days wall-clock)*
*Closes: v35.0 LivOS Claude Code Embed milestone*
