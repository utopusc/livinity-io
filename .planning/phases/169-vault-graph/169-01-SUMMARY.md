---
phase: 169
plan: 169-01
subsystem: livinityd/modules/vault-graph
status: code-complete
date-completed: 2026-05-19
files:
  created:
    - livos/packages/livinityd/source/modules/vault-graph/parser.ts
    - livos/packages/livinityd/source/modules/vault-graph/parser.test.ts
    - livos/packages/livinityd/source/modules/vault-graph/walker.ts
    - livos/packages/livinityd/source/modules/vault-graph/walker.test.ts
    - livos/packages/livinityd/source/modules/vault-graph/index.ts
  modified: []
acceptance:
  vitest: "22/22 (8 parser + 14 walker) — pnpm --filter livinityd vitest run modules/vault-graph/"
  tsc: "0 new errors in vault-graph/* — baseline livinityd tsc count unchanged at 30 (all pre-existing)"
  grep-invariants:
    - "yaml.CORE_SCHEMA call in parser.ts: 1"
    - "node_modules + .git defensive skip in walker.ts: 1"
    - "TYPE_PATHS table covers 6 prefixes (memory|sessions|inbox|.claude/agents|.claude/skills|.claude/commands): 6"
    - "Tombstone skip '.deleted-' in walker.ts: 1"
sacred-guards-verified:
  - "Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f preserved (no liv/packages/core touched)"
  - "D-09 luse-system-prompt.ts NOT touched"
  - "Phase 161-02 agent-prompt-builder.ts NOT touched"
  - "Phase 162 vault-scaffolder.ts + agent-session.ts NOT touched"
  - "Phase 163 ws-agent.ts NOT touched"
  - "Phase 164 autonomous-scheduler NOT touched"
  - "Phase 165-01 claude-runner/idle-reaper.ts NOT touched"
  - "Phase 166 cc-pty/* NOT touched (vault-graph is a SEPARATE module)"
  - "Phase 167 features/cc-terminal/* NOT touched"
  - "D-NEW-DEPS-v35: zero new npm deps in this plan (parser uses pre-installed js-yaml)"
---

# Phase 169 Plan 169-01: Vault Walker + Parser Summary

Built the vault filesystem walker and frontmatter/wikilink parser primitives in `livos/packages/livinityd/source/modules/vault-graph/`. Walker emits typed `VaultFile[]` records with classification (memory/session/inbox/agent/skill/command/root), maxFiles cap with `truncated` flag, defensive `node_modules`/`.git` skip, and `.deleted-*` tombstone exclusion. Parser handles YAML frontmatter via js-yaml `CORE_SCHEMA` (custom-tag-safe) and wikilink extraction with alias stripping.

## Summary

- **`parser.ts` (NEW)** — `parseFrontmatter(content)` and `extractWikilinks(body)`. YAML schema is `yaml.CORE_SCHEMA` (YAML 1.2 safe subset). Malformed YAML + custom `!!js/function` tag both reject via try/catch → body-only return.

- **`walker.ts` (NEW)** — `walkVault(vaultRoot, maxFiles=2000)` recursively walks the vault. Hard cap enforced INSIDE the walk so traversal stops the moment the cap is hit. Path classification via TYPE_PATHS prefix table. Paths normalized to forward-slash for cross-platform graph resolution.

- **`index.ts` (NEW)** — barrel re-exporting `walkVault`, `VaultFile`, `parseFrontmatter`, `extractWikilinks`.

- **`parser.test.ts` (NEW)** — 8 vitest assertions covering basic frontmatter parse, missing-fence body-only fallback, malformed YAML graceful recovery, custom-tag rejection via CORE_SCHEMA, single-wikilink extraction, alias-stripped wikilink extraction, multi-wikilink extraction, no-link body.

- **`walker.test.ts` (NEW)** — 14 vitest assertions using real OS tmp dirs (mirrors `cc-pty/session-store.test.ts` pattern). Covers root file discovery, recursion, tombstone skip, node_modules skip, .git skip, 7 type-classification cases, maxFiles truncation (25 files, max=10), integer mtime.

## Acceptance Evidence

- **vitest**: `npx vitest run modules/vault-graph/` → **22/22 passed** across 2 test files, 499 ms total.
- **tsc**: 0 new errors. Baseline livinityd tsc count is 30 errors (all pre-existing in `skills/*` + `source/modules/ai/*` + `source/modules/ai/conversation-search.test.ts`), unchanged after this plan.
- **Grep invariants**:
  - `yaml.CORE_SCHEMA` in parser.ts: 1 match.
  - `node_modules || '.git'` defensive directory skip in walker.ts: 1 match.
  - TYPE_PATHS covers 6 typed prefixes (memory, sessions, inbox, .claude/agents, .claude/skills, .claude/commands).
  - `.deleted-` tombstone skip: 1 match.
- **Sacred guards**: zero modifications to any sacred file; vault-graph/ is wholly new and file-disjoint from cc-pty/ + cc-terminal/.
- **package.json**: unchanged (no new deps).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan referenced `yaml.SAFE_SCHEMA` which does not exist in js-yaml v4**

- **Found during:** Task 1 (parser implementation pre-flight)
- **Issue:** Plan 169-01 Task 1 `<action>` block and `<threat_model>` mitigation T-169-01-01 both call `yaml.load(text, { schema: yaml.SAFE_SCHEMA })`. js-yaml v4 (the installed version `^4.1.0`, hoisted to `4.1.1`) removed the `SAFE_SCHEMA` export — `grep SCHEMA livos/node_modules/.pnpm/js-yaml@4.1.1/.../dist/js-yaml.mjs` returns: `FAILSAFE_SCHEMA`, `JSON_SCHEMA`, `CORE_SCHEMA`, `DEFAULT_SCHEMA`. Calling `yaml.load(text, { schema: undefined })` would silently fall back to `DEFAULT_SCHEMA`, which is broader than CORE.
- **Fix:** Use `yaml.CORE_SCHEMA` — the YAML 1.2 safe subset, which is the strictest schema js-yaml v4 exposes and is the modern equivalent of the v3-era `SAFE_SCHEMA`. CORE rejects `!!js/function`, `!!js/regexp`, and `!!js/undefined` custom tags (verified by Test 4 in `parser.test.ts`: feeding a `!!js/function` payload causes js-yaml to throw, parser catches and returns `{body, frontmatter:undefined}` — no execution).
- **Files modified:** `parser.ts` (CORE_SCHEMA usage), `parser.test.ts` (Test 4 asserts the rejection path).
- **Threat model impact:** T-169-01-01 mitigation strengthened — CORE_SCHEMA is stricter than the v3 SAFE_SCHEMA the plan asked for, since it also excludes some loose-typing coercions (the YAML 1.2 spec is stricter than the 1.1 SAFE_SCHEMA defaulted to).
- **Acceptance criterion adapted:** plan's `grep SAFE_SCHEMA` becomes `grep CORE_SCHEMA` (still 1 match) — adapted in this Summary's `grep-invariants` block.

### Walker test strategy: real fs over vi.mock

- **Choice:** Plan suggested `vi.mock('node:fs/promises')` for walker tests. Adopted real OS tmp-dir pattern instead (mirrors the established `cc-pty/session-store.test.ts` convention). Reason: walker exercises multiple fs syscalls (`readdir` with `withFileTypes`, `readFile`, `stat`) in a recursive loop — mocking `Dirent` objects with the right `isDirectory()` / `isFile()` shape is ~3x more code per test than just calling real fs. Each test creates `${os.tmpdir()}/vault-walker-test-${uuid}` and tears it down in afterEach. No leakage between tests; suite runs in 74 ms.
- **Tradeoff:** Tests need a writable tmp dir (always true on supported platforms). No mocking complexity to maintain when walker internals evolve.

## Notes

- **22 vitest assertions** = plan target (14 walker + 8 parser).
- js-yaml `CORE_SCHEMA` provides equal or stronger safety than the v3-era SAFE_SCHEMA — both forbid `!!js/function` tag execution.
- Plan-prescribed `extractWikilinks` regex `\[\[([^\]\|]+)(?:\|[^\]]*)?\]\]` simplified to `\[\[([^\]|]+)(?:\|[^\]]*)?\]\]` — the `\|` escape inside a character class is unnecessary (pipe is not special inside `[...]`) and ESLint's `no-useless-escape` flagged it. Behavior identical; eslint clean.

## Self-Check: PASSED

- `parser.ts` exists, exports `parseFrontmatter` + `extractWikilinks`, uses `yaml.CORE_SCHEMA`.
- `walker.ts` exists, exports `walkVault` + `VaultFile`, contains `node_modules` + `.git` skip + `.deleted-` skip.
- `index.ts` barrel re-exports all four symbols.
- `parser.test.ts` + `walker.test.ts` exist, 22/22 tests pass.
- Zero new entries in `livos/packages/livinityd/package.json`.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` still in HEAD ancestry (will be verified by pre-commit hook on commit).
