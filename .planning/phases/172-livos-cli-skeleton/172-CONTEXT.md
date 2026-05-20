# Phase 172: `@livos/cli` Package Skeleton

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Master plan § Phase 172 + § GSD-Style 3-Layer Architecture + D-V38-G/H
**Wave:** 1 (parallel with 171 + 178 + 182 — file-disjoint)

<domain>
## Phase Boundary

Build the `@livos/cli` workspace package — npm-publishable, exposes `liv` binary. Clones GSD's 3-layer architecture: CLI binary + bundled skills + bundled templates installed via `postinstall` symlink.

**Phase 172 sonu:**
- NEW workspace pkg `livos/packages/cli/`
- `liv` bin exposed; commands: `init`, `project new`, `agent new`, `chat`, `list --tree`, `attach`, `config get/set`, `doctor`, `migrate`, `query <argv...>`
- tRPC HTTP client to running livinityd (auth via `LIV_API_KEY` env or `~/.livos/api-key`)
- Filesystem-mode fallback for read-only ops when daemon offline
- `postinstall` script symlinks bundled `prompts/skills/liv-*` to `~/.claude/skills/` (Windows: copy fallback)
- `query` subcommand registry mirrors GSD's `gsd-sdk query` pattern: longest-prefix argv matching, ~15 handlers initially
</domain>

<decisions>

### Plan 172-01: Package scaffold + bin entry
- NEW `packages/cli/package.json` (name `@livos/cli`, bin: `liv`, type: module, ESM)
- NEW `packages/cli/src/cli.ts` — yargs-based CLI dispatcher
- MOD root `package.json` workspaces array
- Minimal deps: `yargs`, `chalk`, `nanoid` (reuse from Phase 171), `node-fetch` (or native fetch for Node ≥18)
- Acceptance: `npx --workspace @livos/cli liv --version` exits 0 and prints version; `liv --help` lists 10+ commands

### Plan 172-02: tRPC HTTP client + filesystem-mode fallback
- NEW `packages/cli/src/query-client.ts` — wraps tRPC HTTP fetch, parses LIV_API_KEY
- NEW `packages/cli/src/filesystem-mode.ts` — direct vault disk reads when daemon offline
- Acceptance: 10 vitest assertions — auth header injection, fallback path activates on ECONNREFUSED, read-only commands work in fallback

### Plan 172-03: Query registry + command handlers
- NEW `packages/cli/src/commands/{init,project,agent,chat,list,attach,config,doctor,migrate,query}.ts`
- NEW `packages/cli/src/query/index.ts` — handler registry with longest-prefix routing (mirror GSD pattern from `gsd-sdk query`)
- Initial query handlers: `tree.list`, `tree.get-item`, `item.create-project`, `item.create-agent`, `item.create-chat`, `item.move`, `item.archive`, `config.get`, `config.set`, `doctor.check`
- Acceptance: 14 vitest assertions — each high-level command translates to correct tRPC call; query argv longest-prefix routing matches GSD behaviour

### Plan 172-04: Bundled skills + postinstall symlink
- NEW `packages/cli/prompts/skills/liv-*/SKILL.md` (≥3 example skills — `liv-add-item`, `liv-list-tree`, `liv-doctor`)
- NEW `packages/cli/prompts/workflows/*.md` (`add-item.md`, `doctor.md`)
- NEW `packages/cli/scripts/postinstall.js` — symlinks (Linux/Mac) or copies (Windows) `prompts/skills/*` → `~/.claude/skills/`
- Acceptance: post-install creates `~/.claude/skills/liv-add-item/SKILL.md` matching the bundled file; idempotent on re-install

### Plan 172-05: `liv init` + `liv doctor` + smoke E2E
- `liv init [path]` — bootstraps a vault at path or `~/liv/`. Writes vault.json, tree.json (empty), settings/, items/, commands/, skills/, inbox/
- `liv doctor` — validates vault integrity (items/ dir consistency, tree.json freshness, orphan tmux sessions, schema version)
- Acceptance: e2e test — fresh `liv init` produces valid vault, `liv doctor` reports green, `liv list --tree` shows empty tree with Main Liv root
</decisions>

<canonical_refs>
- `.planning/v38-LIV-AGENT-PLATFORM-MASTER.md` § GSD-Style 3-Layer Architecture
- `@gsd-build/sdk` source at `C:\Users\hello\AppData\Roaming\npm\node_modules\@gsd-build\sdk\` (CLI structure reference)
- `gsd-sdk query *` registry pattern (130+ handlers, longest-prefix argv resolution)
- `livos/packages/livinityd/source/modules/server/trpc/` (tRPC routes the CLI calls)
- `livos/pnpm-workspace.yaml` (workspace pkg pattern)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 172-01 | NEW packages/cli/{package.json, src/cli.ts, src/version.ts}; MOD root package.json |
| 172-02 | NEW packages/cli/src/{query-client,filesystem-mode}.ts + tests |
| 172-03 | NEW packages/cli/src/commands/*.ts (10 files) + query/index.ts + tests |
| 172-04 | NEW packages/cli/prompts/skills/liv-*/SKILL.md (3) + prompts/workflows/*.md (2) + scripts/postinstall.js |
| 172-05 | NEW packages/cli/src/commands/{init,doctor}.ts + e2e test |

**Sacred guards:** all prior Phase 162-170 source files unchanged. D-NEW-DEPS-v38: only `yargs` + `chalk` + `nanoid` (Phase 171 shared) — light deps, considered universal CLI infra. If any of these are non-trivial they get rolled into the dep ceiling.

</specifics>

<deferred>
- Publishing `@livos/cli` to npm registry → v38.1
- Daemon-offline write-mode (currently only read-mode works offline) → v38.x
- `liv project new --template` with non-blank templates → v38.x polish
</deferred>

---

*Phase: 172-livos-cli-skeleton*
*Wave: 1 (parallel with 171 + 178 + 182 — file-disjoint)*
*Estimated: ~2-3 days agent work*
