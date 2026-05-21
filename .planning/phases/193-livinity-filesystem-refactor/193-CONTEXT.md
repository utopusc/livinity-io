# Phase 193: ~/livinity/ Filesystem Refactor (DROP "vault" Concept)

**Gathered:** 2026-05-21
**Status:** Ready for planning
**Source:** Operator directive 2026-05-21 ("ben sana bunu livinity-vault/ kullanmayalim demistim") + Hermes Agent + OpenClaw OS research synthesis
**Wave:** 2 (depends on Phase 192 bruce-user)

<domain>
## Phase Boundary

DROP the `vault` concept entirely. The architectural source of cascading v38.x bugs is the `vault/items/<uuid>/.agent/config.json` folder model — UUID-named dirs operator can't read, split between two sources of truth (config.json vs claude.md), `/root/livinity-vault/` vs `/home/bruce/livinity-vault/` confusion. Replace with the Hermes-style **single state root + slug-named subdirs + frontmatter-in-claude.md** model.

**Canonical state root:** `/home/bruce/livinity/` (after Phase 192, livinityd writes as bruce so this is natural).

**Phase 193 sonu:**

New filesystem shape:
```
/home/bruce/livinity/
├── CLAUDE.md                    ← Global memory (claude auto-discovers)
├── USER.md                      ← User model (operator persona/preferences)
├── agents/
│   ├── luse-control-agent/      ← Slug from agent name (NOT UUID)
│   │   ├── claude.md             ← YAML frontmatter (name, icon, tools, mcps, schedule) + body (system prompt)
│   │   └── sessions/             ← Per-agent run transcripts (.md files)
│   ├── deneme/
│   │   └── claude.md
│   └── ...
├── projects/
│   ├── my-app/                  ← Operator-developed projects live here
│   │   ├── CLAUDE.md             ← Project-specific Claude instructions
│   │   └── src/, package.json, ...
│   └── ...
├── sessions/                    ← Ad-hoc Claude/Terminal session logs (flat dir)
│   └── 2026-05-21-abc.md
└── .livinity/                   ← Internal state (NOT shown in UI)
    └── search-index.sqlite      ← FTS5 search index (Hermes-style)
```

Behavioral changes:
- Items table source-of-truth = filesystem walk + claude.md frontmatter parse (not Postgres, not a JSON list file — matches Hermes "files are source-of-truth, DB is only search index" model)
- `vault.items.list` tRPC keeps its public API name (don't break frontend) but internally reads `/home/bruce/livinity/agents/*/claude.md` + `/home/bruce/livinity/projects/*/CLAUDE.md`. Future rename to `livinity.items.list` deferred.
- Agent click → `cwd = /home/bruce/livinity/agents/<slug>/` (Phase 189-01 logic intact, just new path)
- Bare terminal click → `cwd = /home/bruce/` (operator's home)
- Project click → opens project root in Files-app + can be opened as workspace later

Migration (idempotent, runs once on deploy):
- Read existing `/root/livinity-vault/items/<uuid>/` and `/home/bruce/livinity-vault/items/<uuid>/`
- For each: read sidebar tree.json to find name → slugify → write to `/home/bruce/livinity/agents/<slug>/claude.md` merging `.agent/config.json` + existing claude.md into single frontmatter+body file
- Leave old dirs in place (don't delete) — operator can manually clean up after verifying
- Backup tree.json + sessions to `/home/bruce/livinity/.livinity/migration-backup-<ts>/`

Sacred Phase 162-01 vault-scaffolder.ts STAYS as code (SHA respected) but Phase 193 stops calling it. The new scaffolder is `livinity-scaffolder.ts` in `vault-items/` (additive — old scaffolder becomes dead code, removed in v38.4).
</domain>

<decisions>

### Plan 193-01: NEW filesystem scaffolder + slug-safe naming
- NEW `livos/packages/livinityd/source/modules/vault-items/livinity-scaffolder.ts` — creates `/home/bruce/livinity/` if missing with `agents/`, `projects/`, `sessions/`, `.livinity/` subdirs
- NEW `slugifyAgentName(name: string): string` helper — kebab-case, drop special chars, max 40 chars, append `-2` etc on collision
- Acceptance: scaffolder idempotent (twice = no-op), slug fn handles Turkish chars (ş→s, ç→c), spaces, etc

### Plan 193-02: claude.md frontmatter parser + writer
- NEW `vault-items/claude-md-format.ts` — parses YAML frontmatter (gray-matter or manual) from `claude.md`, exposes `{frontmatter: {name, icon, tools, mcps, schedule, setup_done}, body: string}` shape
- Writer composes the same shape back to disk atomically (tmp file + rename)
- Acceptance: round-trip preserves byte-equivalence; handles missing frontmatter (treats body as system prompt with empty config)

### Plan 193-03: ItemStore rewrite — filesystem-walk source-of-truth
- MOD `vault-items/item-store.ts` (or NEW `vault-items/livinity-item-store.ts` if too risky to edit existing):
  - `list()` = walk `/home/bruce/livinity/agents/*/claude.md` + `/home/bruce/livinity/projects/*/CLAUDE.md`, parse frontmatter, return Item[]
  - `create({name, type, icon})` = scaffolder + write empty claude.md with frontmatter
  - `read(id)` = id-to-slug map (kept in `.livinity/id-slug-map.json` for stable ids across renames) → read file
  - `update()` = re-write claude.md frontmatter
  - `delete()` = move dir to `.livinity/trash/<slug>-<ts>/`
- Backward compat: `vault.items.*` tRPC API surface UNCHANGED (returns same shape); only the disk reads change
- Acceptance: tests pass for create/list/read/update/delete cycle; existing UI tests stay green

### Plan 193-04: Migration script — /root/livinity-vault → /home/bruce/livinity
- NEW `scripts/migrate-vault-to-livinity.sh` — idempotent:
  - Detect existing `/root/livinity-vault/items/<uuid>/` or `/home/bruce/livinity-vault/items/<uuid>/`
  - For each item: read tree.json to find name → slugify → mkdir `/home/bruce/livinity/agents/<slug>/`
  - Merge `<uuid>/.agent/config.json` + `<uuid>/claude.md` into single `<slug>/claude.md` with frontmatter
  - Copy `<uuid>/.agent/sessions/*` to `<slug>/sessions/`
  - Write id-slug map to `/home/bruce/livinity/.livinity/id-slug-map.json`
  - Backup old dirs to `/home/bruce/livinity/.livinity/migration-backup-<ts>/`
  - NEVER delete old dirs in same run (defense in depth — operator confirms then deletes manually)
- Integration: call from `scripts/install/deploy-livinityd.sh` if no migration marker exists
- Acceptance: dry-run on Mini PC shows correct slug mapping for 2 existing agents (`Luse Control Agent` → `luse-control-agent`, `deneme` → `deneme`); re-run is no-op

### Plan 193-05: cc-pty manager + agent-session-hooks adapt
- MOD `cc-pty/manager.ts` — for `liv-agent-<slug>` sessions, cwd = `path.join('/home/bruce/livinity/agents', slug)` (not vault items)
- MOD `agent-session-hooks.ts` — `agentDir = /home/bruce/livinity/agents/<slug>/`; wizard prompt writes to `<agentDir>/claude.md` directly (no `.agent/config.json` anymore)
- The sessionId format changes from `liv-agent-<uuid>` to `liv-agent-<slug>` (more readable, stable)
- ws-handler prefix detection still works (`liv-agent-` prefix unchanged)
- Acceptance: agent click spawns CC PTY with cwd in new layout; first-launch wizard writes to new path

</decisions>

<canonical_refs>
- Operator directive 2026-05-21 (this CONTEXT triggering)
- [[feedback_v38_3_drop_vault_concept]] (saved memory)
- Hermes Agent README — `~/.hermes/skills/<name>/` pattern, `MEMORY.md` + `USER.md` at root
- OpenClaw OS README — single state dir, no per-item folders
- `feedback_v38_2_exact_spec` — operator's literal Agent UX from v38.2
- `livos/packages/livinityd/source/modules/vault-items/item-store.ts` (rewrite target)
- `livos/packages/livinityd/source/modules/vault-items/artifact-writer.ts` (Phase 188-02 — its writes become 193-02 claude.md frontmatter writes)
- `livos/packages/livinityd/source/modules/cc-pty/manager.ts` (cwd path change)
- `livos/packages/livinityd/source/modules/cc-pty/agent-session-hooks.ts` (path adapt)
- Phase 162-01 vault-scaffolder.ts (legacy — sacred SHA respected, no longer called)
- Phase 188-02 `.agent/config.json` artifact writer (legacy — migrated by 193-04 script)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 193-01 | NEW vault-items/livinity-scaffolder.ts + slugifyAgentName helper + test |
| 193-02 | NEW vault-items/claude-md-format.ts (parser + writer) + test |
| 193-03 | MOD vault-items/item-store.ts (filesystem-walk impl) OR NEW livinity-item-store.ts + adapter |
| 193-04 | NEW scripts/migrate-vault-to-livinity.sh; MOD scripts/install/deploy-livinityd.sh |
| 193-05 | MOD cc-pty/manager.ts (cwd path); MOD agent-session-hooks.ts (agentDir + claude.md write target) |

**Sacred guards:**
- sdk-agent-runner.ts (SHA f3538e1d...) UNCHANGED
- Phase 162-01 vault-scaffolder.ts UNCHANGED in code (legacy, no longer called — formal retirement in v38.4)
- Phase 188-02 artifact-writer.ts UNCHANGED in code (legacy — migration script reads its output one last time)
- sacred-shas-v38.json updated for files this phase touches (manager.ts, agent-session-hooks.ts, item-store.ts)

**Risks + rollback:**
- Migration script error → leaves both old AND new dirs intact; operator can re-run after fix
- Frontend `vault.items.*` tRPC unchanged → no UI rebuild needed for Phase 193 (Phase 194 polishes UI for new shape)
- Slug collision (two agents same slugified name) → append `-2`, `-3` etc; operator sees both in sidebar

</specifics>

<deferred>
- Postgres-backed search index (replace SQLite FTS5) → v39+
- Per-project workspace .CLAUDE.md inheritance → v38.4
- Drop `vault.*` tRPC names entirely → v38.4 (currently kept for backward compat with existing UI)
- Phase 162-01 vault-scaffolder.ts formal deletion + sacred unpin → v38.4

</deferred>

---

*Phase: 193-livinity-filesystem-refactor*
*Wave: 2 (depends on Phase 192 bruce-user switch)*
*Depends on: Phase 192*
*Estimated: ~1-1.5 days (biggest of v38.3 — TDD + migration testing)*
