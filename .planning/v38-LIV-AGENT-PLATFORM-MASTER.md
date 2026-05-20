# v38.0 — Liv Agent Platform

**Opened:** 2026-05-20
**Closes:** v35.0 CC PTY Embed cycle → builds the tree paradigm on top
**Theme:** AI Chat sidebar pivots from flat session list to a tree of **Project / Agent / Chat** Items, each backed by a folder on disk. Main "Liv" root agent greets new users with **4 LivOS-native default skills** (luse-driver, livos-operator, appstore, window-manager). `npx liv` CLI clones `gsd-sdk`'s **3-layer architecture verbatim** — single npm package distributes CLI binary + skills library + per-vault templates. Vault Graph polished into Obsidian-class IA wrapped in Livinity Design tokens. Mobile `/chat-mobile` upgraded from SDK fallback to real Claude Code (tablet) or CC-backed bubble UI (phone). Settings restructured: ChatBackend killed, MCP lifted in, AI Chat config added.

---

## GSD-Style 3-Layer Architecture (Cloned for LivOS)

GSD ships as three independently-versioned layers. We mirror this exactly:

| Layer | GSD | LivOS v38 |
|-------|-----|-----------|
| **L1 — Binary** | `@gsd-build/sdk@0.1.0` npm pkg → `gsd-sdk` bin → CLI + headless agents + bootstrap | **`@livos/cli`** npm pkg → `liv` bin → CLI + headless Liv agent + vault bootstrap |
| **L2 — Skills + Workflows** | `~/.claude/skills/gsd-*/SKILL.md` (thin shims) + `~/.claude/get-shit-done/workflows/*.md` (logic) + `~/.claude/get-shit-done/templates/*.md` | **`~/.claude/skills/liv-*/SKILL.md`** + **`~/.claude/get-livin/workflows/*.md`** + **`~/.claude/get-livin/templates/*.md`** — installed via `@livos/cli`'s `postinstall` script (symlink, not copy) |
| **L3 — Per-Vault State** | `.planning/` (project-local) — STATE.md, ROADMAP.md, phases/, etc. | **`~/liv/`** (user-local) — vault.json, tree.json, items/, settings/, commands/, skills/, inbox/ — multi-project unlike GSD which is per-project |

**Skill → workflow → query chain (identical pattern to GSD):**

```
User types `/liv-add-item project`
  → harness loads ~/.claude/skills/liv-add-item/SKILL.md  (≤50 lines shim)
  → shim @-includes ~/.claude/get-livin/workflows/add-item.md
  → workflow calls `liv query tree.scaffold-project --name foo`  (bash)
  → CLI deterministically writes ~/liv/items/<uuid>/...
  → workflow continues (commits if vault is git-tracked, etc.)
```

**Query handlers** (mirroring GSD's 130 handlers, scoped to vault ops):
- `tree.{list,get,move,scaffold,prune,validate}`
- `item.{create,update,archive,delete,get,history}`
- `agent.{run,stop,inbox,schedule,status}`
- `chat.{attach,detach,history,export}`
- `project.{open,close,cwd,branch}`
- `config.{get,set,profile}`
- `liv.{tools,greet,handoff}` (Main Liv-specific)
- `doctor.{check,repair,migrate}`

**130 handler ceiling not the goal** — start with ~30, grow as we hit need.

**Distribution model improvement over GSD**: instead of GSD's split (npm pkg + separate Markdown library install), **everything ships in `@livos/cli`'s tarball**. `postinstall` script symlinks (or copies on Windows) the bundled `prompts/skills/` into `~/.claude/skills/liv-*/` and `prompts/workflows/` into `~/.claude/get-livin/`. Single `npm i -g @livos/cli` step.

---

## Pre-Flight Verified (2026-05-20, post v35.0 + 167.3 hotfix)

| Check | Result |
|-------|--------|
| v35.0 milestone | CODE-COMPLETE-AND-LIVE-VERIFIED (Mini PC `.deployed-sha=8310beb1`) |
| CC PTY backend | `cc-pty/manager.ts` shipped Phase 166; tmux 3.4 on Mini PC |
| Sacred SHA `sdk-agent-runner.ts` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across 26+3 commits |
| `claudeAiOauth` credentials | `/root/.claude/.credentials.json` valid, Max subscription, scope `user:sessions:claude_code` |
| Existing flat session UX | Phase 168 `SessionSidebar` + `SessionItem` + `NewSessionButton` — to be replaced |
| `vault-graph` backend | Phase 169 REST + walker shipped; UI primitive (`ForceGraph2D`) needs polish |
| `react-force-graph-2d` | `^1.29.1` in lockfile (Phase 169-03) |
| `streamdown` markdown renderer | already in repo (tailwind.config.ts content path) |
| `@xterm/addon-fit` | in lockfile; web-links + canvas NOT in lockfile (Phase 167 deviation) |
| `react-arborist` (tree UI) | ❌ NOT in lockfile — Wave 2 adds (~12KB, MIT) |
| `node-cron` (schedule engine) | needs check; livinityd already has scheduler skeleton (Phase 164) |
| `gsd-sdk` reference | `@gsd-build/sdk@0.1.0` installed globally — model for `@livos/cli` distribution |
| Mini PC disk | 800GB free; multi-vault layout fits |
| Open ports for new endpoints | `/trpc` reused, no new ports needed |

**D-NEW-DEPS-v38:** Three new npm dependencies authorized for this milestone:
- `react-arborist` (Wave 2 — tree sidebar UI)
- `node-cron` (Wave 3 — agent schedule engine, if not already transitive)
- `nanoid` (Wave 1 — UUID v7 generation; lightweight, ~1KB)

**Out of scope (D-NO-NEW-DEPS holds):** xterm clipboard addon, sigma.js WebGL graph, three.js 3D graph, monaco editor for agent prompts (use existing `streamdown`/textarea).

---

## Locked Architectural Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| **D-V38-A** | Vault root = **`~/liv/`** (user home; cleanest, brand-aligned). On Mini PC: `/root/liv/`. Phase 173 migrates existing `/root/livinity-vault/` → `/root/liv/` via atomic `mv` + symlink for back-compat with Phase 162/166/169 hard-coded paths. | "livinity-vault" was operator-rejected as ugly. `~/liv/` is shortest, scales to subdirs cleanly (`~/liv/items/`, `~/liv/settings/`), matches `liv` CLI bin name. |
| **D-V38-B** | Item super-type discriminated union: **`Project` \| `Agent` \| `Chat`**. Each Item = one folder under `items/<uuid-v7>/`. | UUID v7 = time-sortable directory names. Type-specific files inside. |
| **D-V38-C** | Tree is stored via `parentId` field on each Item + cached in `tree.json`. On-disk Item files are authoritative; `tree.json` is rebuildable view. | Survives `git mv`, manual edits, rsync. |
| **D-V38-D** | **Main Liv = synthetic root**, NOT an Item. Always at sidebar top. System prompt at `~/livos-vault/settings/liv-rootagent.md` (user-editable). | Avoids "Main Liv parented to itself" cycles. |
| **D-V38-E** | Tree depth soft cap = 4 (warn), hard cap = 8 (reject). | Dust caps at 4; we allow deeper for ambitious users but warn at the Dust ceiling. |
| **D-V38-F** | Tree component = `react-arborist` (D-NEW-DEPS-v38 authorized). | Mature, virtualized, drag-drop, ~12KB. Saves us 1000+ LoC of custom tree. |
| **D-V38-G** | CLI package = **`@livos/cli`** (scoped npm name). Binary = `liv`. Distribution = single npm package bundling CLI + skills + templates. | `liv` bin name conflicts with squatted unscoped pkg; scope is free. Single-package = symmetric with our existing monorepo. |
| **D-V38-H** | `npx liv` talks to running livinityd via tRPC over HTTP (auth via `LIV_API_KEY` env or `~/.livos/api-key`). Falls back to read-only filesystem mode if daemon offline. | Daemon is authoritative for tmux + scheduling; CLI is a thin client. |
| **D-V38-I** | Agent autonomy permission model: `autoCreateChildren` flag per Item, default **false** for all Items except Main Liv (which has it true). | Prevents runaway agent trees. User explicitly enables on Items they trust. |
| **D-V38-J** | Mobile UX split: **phone** (viewport `<640px` AND `pointer:coarse`) → CC-backed bubble UI; **tablet** (≥640px) → `<CcTerminal>` + virtual key bar + touch gestures. | xterm.js fundamentally broken on phones (no Ctrl, predictive keyboard); tablets work. |
| **D-V38-K** | `--dangerously-skip-permissions` default **ON** for new CC PTY sessions. Settings toggle to disable. Redis key `liv:config:cc_pty_skip_perms`. | User explicitly requested; vault scope + tmux jail give acceptable safety floor. |
| **D-V38-L** | ChatBackendPanel (Phase 165-02) **removed** from Settings. `/chat-mobile` route stays but renders CC PTY (tablet) or CC-backed bubble (phone) — never legacy SDK chat. | Single backend path = less drift. SDK chat code path retired entirely. |
| **D-V38-M** | MCP servers panel **moved to Settings** under new "AI" group (alongside AI Configuration + AI Chat Settings + Scheduled Agents). Top-menu Agents tile removed. | User explicit request. Sidebar is the new tree — top menu shouldn't compete. |
| **D-V38-N** | Settings sidebar regrouped into 4 sections: **PERSONAL** / **WORKSPACE** / **AI** / **SYSTEM**. Footer cluster (gear icon) absorbs Advanced + Troubleshoot. | 24-entry flat list is incoherent. Groups give scannability. |
| **D-V38-O** | Vault Graph color palette: curated 7-type taxonomy (steel-blue/violet/sage/amber/teal/plum/gray-mute), OKLCH-derived for dark/light/iridescent parity. **No `--blue` brand color on nodes** (reserved for focus rings + CTAs). | Honors v36 Livinity DS color contract. |
| **D-V38-P** | Schedule engine for autonomous agents = `node-cron` integrated into livinityd's existing autonomous-scheduler (Phase 164). No new service. | Phase 164 scheduler already runs; we extend its job registry to include per-Agent crons. |
| **D-V38-Q** | Phase 168 flat `SessionSidebar` deprecated. Existing sessions auto-migrated to ChatItems under Main Liv (timestamp preserved as title) on first v38 boot. | Migration is one-way; legacy sidebar deleted same commit. |
| **D-V38-R** | `tmux set-option -g status off` applied via tmux server config when livinityd starts. Removes the `[livos-cc-0:claude*  ...  01:37]` status line. | User explicit request; trivial. |
| **D-V38-S** | Inbox + autonomous output flow: each Agent has `items/<uuid>/inbox/<runId>.md`. Cross-Item global inbox view = derived (no separate storage). | Filesystem is the index. |
| **D-V38-T** | Per-Item folder layout, type-discriminated. Authoritative file list in §"Folder Layout" below. | Avoids per-phase re-derivation. |
| **D-V38-U** | CLAUDE.md inheritance: when running a Chat inside Agent inside Project, CC sees concat of (Project's CLAUDE.md + Agent's CLAUDE.md + Chat's pinned-context.md) prepended to the system prompt. Walking is parent-chain-up. | Matches Claude Code's existing nested CLAUDE.md convention. |

---

## Folder Layout (D-V38-T canonical)

```
~/liv/                          # vault root (D-V38-A)
├── vault.json                  # schema version, vault-wide config
├── tree.json                   # parentId-derived sorted view (rebuildable cache)
├── settings/
│   ├── liv-rootagent.md        # Main Liv system prompt (user-editable)
│   ├── mcp-servers.json        # absorbed from chat sidebar
│   └── theme.json
├── items/
│   └── <uuid-v7>/
│       ├── item.json           # BaseItem + type discriminator
│       ├── README.md           # rendered in detail view
│       ├── CLAUDE.md           # injected into nested CC sessions
│       ├── settings.json       # per-item overrides (tools, permissions)
│       └── <type-specific>     # see below
├── commands/                   # vault-level slash commands (*.md)
├── skills/                     # vault-level skills (SKILL.md per dir, mirrors ~/.claude/skills/ shape)
└── inbox/                      # global view of all agent inboxes (symlinks)

# Per Project Item:
items/<uuid>/
├── item.json                   # {type: 'project', cwd: '/path/to/repo', ...}
├── README.md, CLAUDE.md, settings.json
└── tasks.json                  # checklist visible in detail view

# Per Agent Item:
items/<uuid>/
├── item.json                   # {type: 'agent', schedule?: '0 7 * * *'}
├── agent.md                    # YAML frontmatter + system prompt (CC-compatible)
├── tools.json                  # allowed tool list
├── inbox/<runId>.md            # autonomous run outputs
└── runs/<runId>/{log.txt, transcript.json, meta.json}

# Per Chat Item:
items/<uuid>/
├── item.json                   # {type: 'chat', ccSessionId: 'cc-<uuid>'}
├── transcript.json             # CC PTY transcript snapshot
└── pinned-context.md           # optional sticky context
```

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| `--dangerously-skip-permissions` default ON enables destructive tool calls | **High** | (i) Vault-only cwd by default; (ii) `allowed_paths` whitelist in Settings; (iii) explicit red warning chip on toggle UI; (iv) Sacred SHA hook still blocks protected files; (v) operator can toggle OFF in Settings |
| Tree corruption (parentId cycle, orphan items) | Medium | (i) cycle-check on `mv`; (ii) `liv doctor` validates tree integrity; (iii) `tree.json` rebuildable from disk |
| react-arborist drag perf at >500 items | Medium | (i) virtualization built-in; (ii) lazy-load children at depth >2; (iii) Phase 4 escape hatch if profiled bottleneck |
| Schedule engine drift (cron misses, double-fires) | Medium | (i) reuse Phase 164 scheduler with idempotent run-locks; (ii) `liv:agent:lastRunAt:<id>` Redis keys |
| Phase 168 migration loses session metadata | Low | (i) migration writes to ChatItems atomically; (ii) original `livos-cc-sessions.json` backed up first |
| `npx liv` daemon-offline mode produces inconsistent state | Medium | (i) CLI refuses mutations when daemon offline (only `liv list`, `liv config get` allowed); (ii) explicit warning message |
| Mobile virtual key bar breaks Claude Code shortcuts | Low | (i) sticky-Ctrl pattern proven in Termux; (ii) explicit "Reset to defaults" Settings button |
| Vault Graph performance at 2000+ nodes | Low | (i) D-V38-O palette is hand-tuned for canvas perf; (ii) Phase 4 sigma.js escape if profiled bottleneck |
| Multiple users on Mini PC race on shared vault | Low | (i) per-user vault dir; (ii) Redis pub/sub `liv:tree:updated` for cross-tab sync within a user |
| Liv root agent accidentally creates abuse-pattern items | Low | (i) Liv's `create_item` tool calls audit-logged; (ii) inbox notification on every Liv-initiated create |
| `node-cron` Windows-vs-Linux quirks | Low | (i) Mini PC runs Linux (only deploy target); local Windows dev uses test-vault stubs |

---

## Phase Breakdown (14 phases, 7 waves, aggressive parallelism)

**Dependency-graph optimized:** original 5-wave breakdown serialized too eagerly. Re-analysis reveals 178 (Vault graph polish) and 182 (Settings restructure) have NO v38 dependencies — they can start in Wave 1 alongside 171 + 172. Similarly 179 (graph controls) chains from 178 in Wave 2, 180 (graph local+anim) chains from 179 in Wave 3 — entirely in parallel with the sidebar critical path 171→173→174→175. Net result: critical path drops from ~17-21 days serial to **~10-13 days wall-clock** with max-4 parallelism.

### Wave 1 — Independent foundations (max-4 parallel — NO v38 deps)

| Phase | Goal | Plans | Depends |
|-------|------|-------|---------|
| **171** Item Model + Storage Layer (livinityd `vault-items/`, tRPC, Redis pub/sub) | 5 | none |
| **172** `@livos/cli` Package Skeleton (`packages/cli/`, `liv` bin) | 5 | none |
| **178** Vault Graph MVP Polish (D-V38-O palette, streamdown, SearchBar) — touches `features/vault-graph/`, file-disjoint from 171/172/182 | 4 | none |
| **182** Settings Restructure (kill ChatBackend, drop top-menu Agents, groups, MCP panel, AiChatSettingsPanel) — touches `routes/settings/`, file-disjoint from rest | 5 | none |

**Parallel-safe rationale:** 171 touches livinityd modules; 172 creates a new workspace package; 178 touches UI features/vault-graph/; 182 touches UI routes/settings/. Zero file overlap. Worktree-isolated executor agents merge cleanly.

### Wave 2 — Chain extensions (max-2 parallel)

| Phase | Goal | Plans | Depends |
|-------|------|-------|---------|
| **173** Vault Rename + Phase 168 Migration + Sacred Freeze (deploy-time `mv` + compat symlink + `LIV_VAULT_ROOT` env resolver shim; Phase 162-01 scaffolder STAYS byte-identical) | 4 | 171 |
| **179** Vault Graph Controls Panel (Filters/Groups/Display/Forces + backend tags+topDir extension) | 5 | 178 |

**Parallel-safe:** 173 touches livinityd vault-items + deploy scripts; 179 touches UI features/vault-graph/ + livinityd vault-graph backend (additive). Disjoint enough.

### Wave 3 — Tree UI + Graph polish (max-2 parallel)

| Phase | Goal | Plans | Depends |
|-------|------|-------|---------|
| **174** SidebarTree Component (react-arborist, per-type rows, drag-drop, context menu, footer gear slot) | 5 | 171, 173 |
| **180** Local Graph + Animation Timeline (BFS depth mode, mtime-ordered reveal, LegendBadge) | 3 | 179 |

**Parallel-safe:** 174 = UI features/sidebar-tree/; 180 = UI features/vault-graph/. Different feature dirs.

### Wave 4 — UI extensions + lightweight polish (max-2 parallel)

| Phase | Goal | Plans | Depends |
|-------|------|-------|---------|
| **175** Add Modal + Item Detail Views (`<AddItemModal>`, `<ProjectDetail>`, `<AgentDetail>`; DELETE Phase 168 cc-sessions/* + cc-pty-router) | 5 | 174 |
| **183** Polish: tmux status off + dangerously-skip default + sidebar gear wire | 2 | 174, 182 |

**Parallel-safe:** 175 = UI features/item-detail/ + Phase 168 deletion; 183 = MOD cc-pty/manager.ts (additive) + MOD sidebar-tree (gear handler wire). Disjoint.

### Wave 5 — Liv root + Mobile (max-2 parallel)

| Phase | Goal | Plans | Depends |
|-------|------|-------|---------|
| **176** Main Liv Root Agent + 4 LivOS-native Skills (luse-driver, livos-operator, appstore, window-manager) + empty-state UI | 5 | 171, 175 |
| **181** Mobile CC PTY (tablet `<CcTerminal>` + virtual key bar; phone `<MobileBubbleChat>`; touch gestures; WS resilience) + DELETE legacy-ai-chat-panel | 4 | 175 |

**Parallel-safe:** 176 = NEW vault-items/tools/ + scaffolder templates + UI empty-state branch; 181 = NEW features/mobile-terminal/ + MOD chat-mobile route + MOD cc-terminal (additive). Disjoint.

### Wave 6 — Autonomous (sequential)

| Phase | Goal | Plans | Depends |
|-------|------|-------|---------|
| **177** Schedule Engine + Inbox System (node-cron extension of Phase 164 scheduler; inbox writer + UI; Liv `run_agent` tool full impl) | 4 | 171, 176 |

### Wave 7 — Ship (sequential, FINAL)

| Phase | Goal | Plans | Depends |
|-------|------|-------|---------|
| **184** v38.0 Mini PC Deploy + UAT + Milestone Close (push + update.sh + migration auto-run + 13 live probes + v38-VERIFICATION.md + STATE + ROADMAP close) | 5 | all prior |

---

**Total: 14 phases / 61 plans / 7 waves.**

**Critical path** (longest dep chain): 171 (2d) → 173 (1.5d) → 174 (2d) → 175 (2.5d) → 176 (2d) → 177 (2d) → 184 (1d) = **~13 days wall-clock**.

**Parallel branches consumed inside critical path window:**
- 172 (2.5d) fits day 0-3
- 178 (1.5d) + 179 (2.5d) + 180 (1.5d) = 5.5d chain fits days 0-6
- 182 (2.5d) fits day 0-3
- 181 (3d) fits days 8-11 (after 175 completes)
- 183 (0.5d) fits day 6 (after 174 + 182 both complete)

**Worst case (zero parallelism):** ~24-28 days serial.
**Best case (max-4 parallel):** ~10-13 days wall-clock.

**Plan breakdown by wave:**
- W1 = 5+5+4+5 = 19 plans (4 phases parallel)
- W2 = 4+5 = 9 plans (2 parallel)
- W3 = 5+3 = 8 plans (2 parallel)
- W4 = 5+2 = 7 plans (2 parallel)
- W5 = 5+4 = 9 plans (2 parallel)
- W6 = 4 plans
- W7 = 5 plans
- **TOTAL: 61 plans**

---

## Parallel Dispatch Strategy

The `/gsd-autonomous --from 171` orchestrator dispatches phases per-wave. For each wave with >1 phase, the orchestrator spawns `N` parallel executor agents — each isolated via `isolation: worktree` so commits don't race on master. After all wave-N agents complete, the orchestrator merges branches sequentially to master (Sacred SHA hook validates each merge), then proceeds to wave N+1.

**Worktree merge order rules:**
1. Phases with sacred-SHA-touching commits (175 deletion of Phase 168, 173 sacred freeze update) merge first within their wave
2. Within a wave, alphabetical phase number breaks ties
3. If a worktree fails Sacred SHA check on merge, that phase blocks → operator decision via `handle_blocker` checkpoint

**Failure isolation:** If 178 fails in Wave 1, 171 + 172 + 182 still ship. Wave 2 proceeds with 173 (no 178 dep). 179 + 180 + 158-feature blocked until 178 fixed in a follow-up phase.

---

## Sacred Guardrails (every phase enforces)

- **Sacred SHA**: `liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED
- **D-09**: `livos/.../luse-system-prompt.ts` body bytes UNCHANGED
- **Phase 161-02**: `agent-prompt-builder.ts` UNCHANGED
- **Phase 162-01**: `vault-scaffolder.ts` UNCHANGED (templates tree may gain new files = additive)
- **Phase 162-02**: `agent-session.ts` UNCHANGED
- **Phase 163**: `ws-agent.ts` UNCHANGED (cc-pty is separate surface)
- **Phase 164**: `autonomous-scheduler/scheduler.ts` core UNCHANGED — only ADDITIVE extension for cron registry in Phase 177
- **Phase 165-01**: `claude-runner/idle-reaper.ts` UNCHANGED
- **Phase 166 cc-pty backend**: `types.ts`, `session-store.ts`, `ws-handler.ts`, `idle-reaper.ts` UNCHANGED. `manager.ts` gains ADDITIVE flags in Phase 183 (dangerously-skip injection, tmux status off).
- **Phase 167 cc-terminal**: `CcTerminal.tsx`, `terminal-ws-client.ts`, `terminal-theme.ts` UNCHANGED. Phase 181 mobile is a NEW SIBLING component, not a modification.
- **Phase 168 sessions**: `cc-sessions/` and `cc-pty-router.ts` REPLACED by Phase 173 migration + Phase 174 SidebarTree. Migration is one-way.
- **Phase 169 vault-graph backend**: `walker.ts`, `parser.ts`, `builder.ts`, `routes.ts` ADDITIVE only — Phase 179 extends walker output, doesn't rewrite.

**D-NEW-DEPS-v38 EXCEPTION**: Three new npm deps explicitly authorized:
- `react-arborist` (Phase 174)
- `node-cron` (Phase 177; check if already transitive)
- `nanoid` (Phase 171; for UUID v7)

D-NO-NEW-DEPS guardrail holds for everything else.

---

## Success Criteria

1. Operator opens AI Chat dock window → sees tree-style sidebar with Main Liv at top + Settings gear bottom-left
2. Click "+ Add" → modal asks Project/Agent/Chat → form → new Item appears in sidebar
3. Right-click Item → context menu with rename/duplicate/archive/delete/export
4. Drag Project A onto Project B → A becomes child of B (cycle check rejects bad drops)
5. Empty vault state → Main Liv terminal centered, greeting user, accepting `create project foo` input
6. Liv responds to `create a project for my dotfiles` → calls `create_item` tool → new Project appears in sidebar within 500ms
7. Click Agent with schedule → see "next run in N hours" + Run Now button → click → autonomous run produces inbox entry within 60s
8. Vault Graph tab → 7-type curated palette, Filters/Groups/Display/Forces controls panel, Cmd+K search, click node → markdown-rendered detail drawer
9. `/chat-mobile` on tablet → `<CcTerminal>` + virtual key bar (sticky Ctrl works)
10. `/chat-mobile` on phone → bubble UI streaming real CC output (no SDK chat)
11. Settings sidebar → PERSONAL / WORKSPACE / AI / SYSTEM groups visible
12. Settings → AI → AI Chat Settings → toggle `--dangerously-skip-permissions` OFF → next new session spawns without the flag (verified in `ps aux`)
13. Settings → AI → MCP Servers → see chrome-devtools + Gmail/Drive/Calendar with status badges
14. Top-menu Agents tile GONE from desktop dock
15. `npx liv list --tree` from terminal prints the tree matching the sidebar
16. `npx liv agent new news --schedule '0 7 * * *'` creates an Agent that appears in sidebar within Redis-pubsub latency (~50ms)
17. Sacred SHA + D-09 + all Phase 162-167 guard files byte-identical pre/post all 14 phase commits
18. Phase 168 `SessionSidebar` no longer rendered anywhere in the desktop UI
19. `tmux list-sessions` shows no status line in attached terminals
20. v38-VERIFICATION.md status = `passed` or `passed-pending-OperatorUAT`

---

## Decisions Required from Operator Before Execute (consolidated 10 questions)

These need answers BEFORE `/gsd-autonomous --from 171`. Answer each with a number or short text.

### Q1. Tree depth caps confirm?
Soft warn at depth ≥ 5, hard reject at depth ≥ 8. Override?
- (a) Accept as proposed
- (b) Softer (warn ≥ 8, no hard cap)
- (c) Stricter (Dust-style hard 4)

### Q2. Vault location on Mini PC (post-rename to `~/liv/`)?
Phase 173 migrates `/root/livinity-vault/` → new path. Pick the new path:
- (a) `/root/liv/` — symmetric with developer machine `~/liv/`, simple (recommended)
- (b) `/opt/livos/data/vaults/<userId>/liv/` — per-user multi-tenant ready, but adds path complexity
- (c) Hybrid — single-user (default) at `/root/liv/`, multi-user mode auto-switches to (b) when `liv:system:multi_user` Redis flag is true

### Q3. Phase 168 session migration policy?
What happens to current flat sessions on first v38 boot?
- (a) Auto-migrate all to ChatItems under Main Liv with timestamp titles (recommended)
- (b) Auto-migrate but archive immediately (clean slate but recoverable)
- (c) Discard — start fresh

### Q4. Liv root agent personality / language default?
- (a) Bilingual — speaks user's last-seen language (English / Turkish auto-detect)
- (b) English-only (simpler, terser)
- (c) Turkish-primary (matches user's recent preference)

### Q5. Liv's auto-create permission?
Main Liv is the only Item with `autoCreateChildren: true` by default. Other Agents need explicit opt-in. Confirm?
- (a) Yes, only Liv has auto-create
- (b) All Agents start with auto-create true (more autonomous, more risky)
- (c) No Agent has auto-create — every create needs UI confirmation

### Q6. `npx liv` package name?
- (a) `@livos/cli` (bin: `liv`) — recommended
- (b) `livos-cli` (bin: `liv`)
- (c) Different name — specify

### Q7. Liv's "official skills" bundle — LivOS-native (operator-locked)?
**Generic productivity skills (gmail-summarizer, github-watcher, etc.) REJECTED by operator 2026-05-20.** Replaced with LivOS-native skill bundle that exposes the actual OS capabilities Liv has access to via existing livinityd infra. Confirm scope:

- (a) **Ship 4 LivOS-native default skills** (recommended):
  - **`luse-driver`** — Computer Use via Phase 165 luse MCP server. Screenshot, click, type, scroll, drag, key. Already exists at `vault/.claude/agents/luse-driver.md`; v38 just brings it into Liv's default tool registry.
  - **`livos-operator`** — Knows LivOS architecture (systemd services, vault layout, Phase history, sacred files, troubleshooting steps). Liv can answer "where do my apps live?", "why is liv-core in a restart loop?", "what's the deployed SHA?". Tools: Read, Bash (limited), tRPC system info routes.
  - **`appstore`** — Install / uninstall / list apps via existing `apps.*` tRPC routes. Can answer "install n8n", "what apps do I have?", "uninstall facebook". Reuses Phase v34 App Store backend.
  - **`window-manager`** — List open windows, focus, close, minimize, pin/unpin. Uses Phase 159 WindowManager tRPC routes. Liv can do "show me what's running", "close the browser windows", "pin the Chrome window I'm using for research".

- (b) Ship just (luse-driver + livos-operator) — minimal foundation, add others in v38.x polish
- (c) Custom set — specify which skills

Each skill ships as a subagent markdown file at `~/liv/.claude/agents/<skill>.md` (Phase 165 luse-driver convention; CC's native subagent discovery via `settingSources: ['project']` picks it up automatically when Liv's tmux session boots). Skills are also installable to other Items via `npx liv agent new --from-skill luse-driver`.

### Q8. Mobile phone bubble UI — what fidelity?
- (a) Minimal — single textarea + send button + bubble list (Cursor-mobile style)
- (b) Rich — slash command picker, attachment support, markdown rendering
- (c) Skip phone support — phones get "use a tablet or desktop" message

### Q9. Settings gear button placement?
Researcher flagged ambiguity ("bottom-left of sidebar"):
- (a) Bottom-left of the NEW SidebarTree (inside AI Chat window) — recommended, in-scope
- (b) Bottom-left of the Settings WINDOW sidebar (when Settings is open)
- (c) New global vertical sidebar on the desktop (large redesign, defer to v39)

### Q10. Vault Graph "ghost" nodes (referenced but not on disk)?
- (a) Hide ghosts by default, "Show ghost links" toggle in Filters
- (b) Always show as hollow circles (Obsidian-style)
- (c) Never render — only real files

---

## Resume on /clear

```
/clear
/gsd-autonomous --from 171
```

Agents will:
1. Read this master plan (`.planning/v38-LIV-AGENT-PLATFORM-MASTER.md`)
2. Read each phase's CONTEXT.md (created on-demand by `/gsd-plan-phase N`)
3. Apply user's Q1-Q10 decisions
4. Plan → execute → verify each phase
5. Dispatch waves in proper order (Wave 1 parallel-safe; Wave 2 sequential; Wave 3 has 2 parallel pairs; Wave 4 parallel; Wave 5 final)
6. Mini PC deploy in Phase 184 via detached SSH + log poll
7. Sacred guardrails enforced every commit (Sacred SHA hook live)

**Hard guardrails (Claude/agent autonomy boundary):**
- v35.0 / v37.x phases are READ-ONLY; do not modify their files except via documented ADDITIVE-only patches
- Sacred SHA pre-commit hook live on master; never skip via `--no-verify`
- D-V38-K dangerously-skip-permissions default ON for new sessions ONLY; existing sessions unaffected until user detaches
- tmux apt install is from v35.0 (no re-install)

---

## Carry-overs (NOT in v38.0 scope)

- **`npx liv` published to npm registry** → v38.1 (initial scope = workspace-local only, runnable via `pnpm --filter cli liv ...`)
- **3D Vault Graph mode** → v39+
- **WebGL sigma.js scale to 100k+ nodes** → triggered only when telemetry shows >5k node vaults
- **Cross-vault tree view** → v39+ (multi-vault switcher in Settings)
- **Drag-to-reparent across vaults** → v39+
- **Per-Agent VM isolation** (Devin-style) → out of LivOS scope (Mini PC is single host)
- **A2A protocol** (Cursor 2.5-style agent-to-agent talk) → v39+ once we have ≥3 agents per user
- **Plugin marketplace integration with v37 store** → v37.1 after v37 ships
- **Monaco editor for agent prompts** → v38.x polish (current = textarea + streamdown preview)
- **Item versioning / undo history** → v39+
- **Tree export to OPML** → v38.x polish

---

## Files Referenced (master plan inputs)

- v35-CC-PTY-MASTER.md — structural template
- v35-VERIFICATION.md — pre-flight state
- `.planning/phases/166-cc-pty-backend/` through `170-v35-deploy-uat/` — backend layer to build on
- Research outputs (in conversation context, not committed):
  - GSD architecture deep-dive (4 layers, 130 query handlers, skill→workflow→query chain)
  - Obsidian Graph hybrid UX (Parts A–F, 7 components, 4 implementation phases)
  - 10-platform agent tree UX comparative (Item model, react-arborist, npx liv command surface, Liv root agent)
  - Mobile CC PTY + Settings restructure (phone vs tablet split, virtual key bar, 24-entry Settings audit)

External sources cited in research (load on-demand during planning):
- Obsidian help docs (Graph view, Local graph)
- joshw.io node-graph post
- react-force-graph + sigma.js + cytoscape.js docs
- Cursor 2.4/2.5/3.x release notes, Subagents docs
- Cline, Continue.dev, Devin, Dust, OpenHands, Aider, Claude Projects docs
- Termux extra-keys, Blink Shell, code-server iPad docs
- xterm.js mobile issues (#1101, #1301, #3727, #5377)

---

*Master Plan: v38-LIV-AGENT-PLATFORM-MASTER.md*
*Drafted: 2026-05-20*
*Awaiting operator Q1–Q10 decisions before execute*
*Estimate: 14 phases / ~60 plans / 12-28 days*
*Closes: v38.0 Liv Agent Platform milestone*
