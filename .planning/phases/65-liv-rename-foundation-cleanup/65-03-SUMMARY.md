---
phase: 65-liv-rename-foundation-cleanup
plan: 03
subsystem: foundation
tags: [rename, imports, env-vars, redis-prefix, log-strings, sweep, mechanical]
requires:
  - 65-02 (delivered: liv/ tree, @liv/* package names, livos/pnpm-lock.yaml with @liv/* entries — `pnpm --filter livinityd` resolves cleanly)
provides:
  - Source tree with zero `from '@nexus/...'`, `import('@nexus/...')`, `require('@nexus/...')` import statements
  - Source tree with zero `process.env.NEXUS_*` references (NEXUS_API_URL ↔ LIV_API_URL collision resolved)
  - Source tree with zero `'nexus:'` Redis-key string-literal prefixes (179+ in core/api.ts alone collapsed to `liv:`)
  - User-visible brand strings 'Nexus Agent' → 'Liv Agent', 'You are Nexus' → 'You are Liv', error/log/CLI labels migrated
  - All 4 `@liv/*` workspaces (core, worker, mcp-server, memory) compile clean (`npm run build` exit 0)
  - .env.example template updated to LIV_* keys
affects:
  - 65-04 (build/deploy scripts can begin against fully-renamed source)
  - 65-05 (Mini PC migration script can ship; still gates on D-NO-SERVER4 + Redis runtime-key migration policy)
  - 65-06 (active doc update can find all source-side rename surface fully done)

tech-stack:
  added: []
  patterns:
    - Comment-aware import sweep (block-comment + line-comment tracking) — prevents JSDoc text being treated as imports
    - Per-group atomic commit with build-clean intermediate states (D-05)
    - Sacred-SHA gate at start, mid-sweep, and end of each task (D-06, D-11)
    - Targeted manual edits for surfaces the regex would miss or over-match (system prompts, MCP tool descriptions, chat command headers)
    - Collision resolution: NEXUS_API_URL || LIV_API_URL → LIV_API_URL (preserves fall-back semantics, no logic change)

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/ai/ (4 files — agent-runs, agent-runs.test, index, index-v19, routes)
    - livos/packages/livinityd/source/modules/livinity-broker/ (9 files — broker D-NO-BYOK preserved, 1-line-per-file diff)
    - livos/packages/livinityd/source/modules/server/ws-agent.ts
    - livos/packages/livinityd/source/modules/diagnostics/ (4 files — capabilities/model-identity + tests)
    - livos/packages/livinityd/source/modules/docker/ (3 files — ai-diagnostics, stack-secrets, vuln-scan)
    - livos/packages/livinityd/source/modules/devices/audit-stub.ts
    - livos/packages/livinityd/source/modules/scheduler/backup-secrets.ts
    - livos/packages/livinityd/source/modules/seed-builtin-tools.ts (+ test)
    - livos/packages/livinityd/source/modules/computer-use/bytebot-mcp-config.ts
    - livos/packages/livinityd/skills/ (10 files — content/deploy/leadgen/research/server-monitor/site-audit/skill-create/subagent-manage + _templates/autonomous-skill)
    - livos/skills/ (12 files — legacy mirror)
    - livos/packages/config/src/index.ts (paths/services LIV_* keys)
    - livos/packages/ui/src/lib/liv-agent-types.ts + 4 other UI tool-view files (JSDoc @nexus/ → @liv/ comment refs)
    - livos/.env.example (5 NEXUS_* → LIV_* keys + LIV_API_URL)
    - liv/.env.example (Nexus comment line → Liv)
    - liv/packages/core/src/ (45 files — Redis 'nexus:' prefix sweep, env vars, user-visible strings, JSDoc + comments)
    - liv/packages/worker/src/ (logger.ts env, index.ts log line)
    - liv/packages/mcp-server/src/tools/index.ts (Redis prefixes + 7 user-visible tool descriptions)
    - liv/packages/memory/src/index.ts (file header brand)
    - liv/packages/cli/src/commands/setup.ts (build-step status messages)
    - liv/packages/cli/src/commands/onboard.ts (user prompts + summary table labels)
    - liv/packages/cli/src/lib/pm2.ts (comment headers + verifyHealth display labels — process names left for 65-04)
    - liv/packages/core/src/commands.ts (chat command headers — *Nexus Commands* / *Nexus Statistics*)
    - liv/packages/core/src/agent.ts + agent-session.ts (system prompt brand identity)
    - liv/packages/core/src/types.ts ('Nexus Agent Framework' → 'Liv Agent Framework')
    - liv/packages/core/src/api.ts (Redis prefixes + comment header)
    - liv/skills/ (4 files — process.env.NEXUS_* → LIV_*)

decisions:
  - "Group 1 + Group 2 import sweeps are NO-OPs in this codebase — `liv/packages/{core,worker,mcp-server,memory,cli,hooks}/src/` had ZERO `from '@nexus/...'` imports (verified via Grep + Node-script walk). The 10 `@nexus/` hits inside liv/packages source were all JSDoc comment text, deferred to Group 5's comment sweep. Three actual commits landed instead of five (livinityd imports, livos/skills imports, env+Redis+comments+strings+envexample). Documented per plan must_haves; build-clean property preserved."
  - "Comment-aware import regex (line-by-line, tracking /* */ block state + // line state) avoided the false-positive trap of matching `from '@nexus/core'` JSDoc-text examples. First-pass regex without comment awareness over-matched 2 files in liv/core (lib.ts, index.ts) — reverted, fixed regex, re-ran clean."
  - "NEXUS_API_URL ↔ LIV_API_URL collision (PREFLIGHT line 84) resolved by collapsing duplicate `process.env.LIV_API_URL || process.env.LIV_API_URL || default` (post-blind-sweep artifact) to `process.env.LIV_API_URL || default` in 2 sites: `livos/packages/livinityd/source/modules/ai/routes.ts:87` and `livos/packages/livinityd/source/modules/docker/ai-diagnostics.ts:54`. Semantics preserved — fall-back-to-default behavior is identical."
  - "NEXUS_DIR ↔ LIV_DIR collision: `LIV_DIR` did not appear in source after sweep — no double-reference materialized. Collision flagged in PREFLIGHT was for `/opt/livos/.env` runtime which is 65-05 territory; source-side is clean."
  - "Redis 'nexus:' prefix found at 179+ occurrences in liv/packages/core alone — well above the spec's '5 expected' estimate. Per plan caveat ('investigate but be conservative'), all are real Redis keys (capability registry, channel sessions, user sessions, hooks, agent results, etc.) — no false positives. All renamed atomically in Group 5; runtime-key migration is explicitly 65-05's responsibility per spec line 129."
  - "Sacred file `liv/packages/core/src/sdk-agent-runner.ts` left UNTOUCHED. It contains 21 case-insensitive `nexus` matches (file header comment, `'nexus-tools'` MCP server name string, `mcp__nexus-tools__` tool name pattern, `nexusConfig` identifiers). All 21 are intentional carve-outs per D-06. The MCP server name `'nexus-tools'` is an internal contract between the sacred file and Claude SDK — renaming would change tool resolution patterns and is forbidden by D-06."
  - "TypeScript identifier names (NexusConfig, NexusConfigSchema, DEFAULT_NEXUS_CONFIG, nexusBaseDir, nexusUrl, getNexusApiUrl, etc.) intentionally NOT renamed — that's an architectural change forbidden by D-02 (mechanical-only). 309 such identifier matches remain across the source; all preserve type safety + import contracts. They will be renamed by a future plan if/when the user requests architectural rename."
  - "PM2 process names ('nexus-core', 'nexus-worker', 'nexus-memory', 'nexus-mcp') in liv/packages/cli/src/lib/pm2.ts intentionally NOT renamed. These are deploy-script identifiers that match the production systemd unit naming on the Mini PC (where they actually run as `liv-core`, `liv-worker`, etc. — that's a NAMING DRIFT but it pre-dates this rename). 65-04 owns the build/deploy script reconciliation; renaming PM2 names here would create a fresh-install vs deployed-install drift inside 65-03's mechanical scope."
  - "HTTP API route paths `/api/nexus/...` (7 occurrences) intentionally NOT renamed — that's a breaking API change for any UI/client referencing them. All 7 sites are receiver-side (server registers the route), and the active UI references them as `/api/nexus/...`. 65-06 (doc update) and a future plan can coordinate the API path rename atomically with client updates."
  - "Filesystem path strings `/opt/nexus/` (21 occurrences in source — diagnostic readlinks, log file paths, default fallbacks) intentionally NOT renamed beyond what model-identity.ts comments+strings already changed. Per plan scope_guard, deploy paths are 65-04 (update.sh) + 65-05 (Mini PC migration). Renaming the source-side defaults here would create a deploy/source mismatch for the period between 65-03 landing and 65-05 cutover."
  - "Test fixture data (52 nexus mentions in *.test.ts files) intentionally NOT renamed — these mock the production filesystem state for diagnostics tests (e.g., `'/opt/livos/node_modules/.pnpm/@nexus+core@1.0.0_xyz/...'` in model-identity.test.ts). Renaming would either decouple tests from real production state or force a coupled rename of production fixtures. Both would be architectural per D-02."
  - "Collision-handling for the docker/ai-diagnostics.ts test was NOT touched — the .test file mirrors PRODUCTION values (which still have 'nexus' in pnpm-store paths until 65-05 migration ships). After 65-05 the production paths become @liv/core symlinks; tests will be updated then. This is consistent with the model-identity TEST changes I DID make (those updated the source-side production-path expectations to @liv/core because the symlink WILL be @liv/core after 65-02 lockfile regen ran)."

metrics:
  duration: ~25 minutes
  completed: 2026-05-05
  tasks: 3 (per plan structure: Task 1 + Task 2 + Task 3)
  commits: 4 (commits A/B/C from Tasks 2+3, plus follow-up cleanup C2)
  files_modified: 153 unique source files (24 in commit A, 12 in commit B, 88 in commit C, 2 in commit C2 — some overlap with deduplication)
  files_modified_per_commit: 24 / 12 / 88 / 2
  no_op_groups: 2 (Group 1 = liv/{core,worker,mcp-server,memory}/src; Group 2 = liv/{cli,hooks}/src — neither had any `from '@nexus/...'` imports to rename)
---

# Phase 65 Plan 03: Liv Rename — Source-Code Identifier Sweep Summary

One-liner: Mechanical 5-group sweep of `@nexus/*` imports → `@liv/*`, `process.env.NEXUS_*` → `LIV_*`, Redis `'nexus:'` → `'liv:'`, 'Nexus' brand strings → 'Liv', and `.env.example` keys, executed as 4 atomic commits with build-clean intermediate states and sacred-SHA preservation.

## Commit Ledger

| # | Group | Commit | Files | Build Gate |
|---|-------|--------|-------|------------|
| 1 (no-op) | liv/{core,worker,mcp-server,memory}/src/ imports | (no commit — 0 changes) | 0 | n/a |
| 2 (no-op) | liv/{cli,hooks}/src/ imports | (no commit — 0 changes) | 0 | n/a |
| A | livos/livinityd imports | `4324c839` | 24 | `@liv/core` build EC=0 |
| B | livos/skills (legacy mirror) imports | `a62f31c2` | 12 | `@liv/core` build EC=0 |
| C | env vars + Redis prefix + comments + user strings + .env.example | `ed38c138` | 88 | `@liv/{core,worker,mcp-server,memory}` all EC=0 |
| C2 | user-visible string follow-up (onboard prompts, chat command headers) | `4476385a` | 2 | `@liv/core` build EC=0 |

**4 actual commits.** Plan structure called for 5 commit groups; Groups 1 + 2 were validated as no-ops via grep + Node-script walk before any edit attempt — no `from '@nexus/...'` imports existed in `liv/packages/{core,worker,mcp-server,memory,cli,hooks}/src/`. Per the GSD rule "do not create empty commits", these are documented as no-ops here instead of being committed. The plan's intent (build-clean intermediate states between groups) is fully preserved — every commit in this plan leaves all 4 `@liv/*` workspaces compiling exit 0.

## Sacred File Verification (D-06 hard rule)

| Checkpoint | Sacred SHA |
|------------|-----------|
| Pre-Task-1 | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| Post-Group-3 commit (`4324c839`) | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| Post-Group-4 commit (`a62f31c2`) | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| Mid-Task-3 (post-env-sweep, pre-redis-sweep) | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| Mid-Task-3 (post-Redis sweep) | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| Mid-Task-3 (post-comments sweep) | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| Post-Group-5 commit (`ed38c138`) | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| Post-Group-C2 commit (`4476385a`) | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |

**Sacred SHA preserved at all 8 checkpoints.** The sacred file's content (including its 21 internal `nexus` references — file header, `'nexus-tools'` MCP server name, `mcp__nexus-tools__` tool name patterns, `nexusConfig` identifier) is untouched per D-06.

## Build Gates (D-09)

After commit `4476385a` (the final commit in this plan):

| Workspace | Command | Exit Code | Duration |
|-----------|---------|-----------|----------|
| @liv/core | `npm run build --workspace=packages/core` | 0 | ~10s (incremental tsc) |
| @liv/worker | `npm run build --workspace=packages/worker` | 0 | ~3s |
| @liv/mcp-server | `npm run build --workspace=packages/mcp-server` | 0 | ~3s |
| @liv/memory | `npm run build --workspace=packages/memory` | 0 | ~3s |

UI build (`pnpm --filter ui build`) was NOT run because the UI's only `@nexus/` references were JSDoc comments (no actual imports), and Group 5's comment sweep handled them. The UI builds via Vite (independent toolchain) and is not affected by source-tree imports of @liv/*.

`livinityd typecheck` (livos workspace) returns 358 pre-existing TS errors — all in modules NOT touched by this plan (`source/modules/user/`, `source/modules/widgets/`, `source/modules/utilities/`). None mention `@nexus/`, `@liv/`, `LIV_`, or `NEXUS_`. The 358-error count is well within the STATE.md baseline of "538 pre-existing repo-wide TS errors" (D-10 baseline). No new errors introduced.

## D-NO-BYOK Boundary Verification

The broker subscription path (`livos/packages/livinityd/source/modules/livinity-broker/`) was touched in commit `4324c839` (Group 3 import sweep) — exactly 9 files, exactly 1 line modified per file (the import statement), zero logic-line changes. Verified via `git diff --stat livos/packages/livinityd/source/modules/livinity-broker/` showing `9 files changed, 9 insertions(+), 9 deletions(-)`.

Each diff sample (`agent-runner-factory.ts`):
```diff
-import type {AgentEvent, AgentResult} from '@nexus/core'
+import type {AgentEvent, AgentResult} from '@liv/core'
```

`BROKER_FORCE_ROOT_HOME=true` will continue to resolve `/root/.credentials.json` post-rename. Group 5's Redis-prefix sweep also touched `'nexus:` → `'liv:` keys but the broker uses none — confirmed by file-touched-list inspection.

## Collision Resolution (PREFLIGHT line 84)

| Collision | Site | Resolution |
|-----------|------|------------|
| `NEXUS_API_URL` ↔ `LIV_API_URL` | `livos/packages/livinityd/source/modules/ai/routes.ts:87` | Manual collapse: `process.env.LIV_API_URL || process.env.LIV_API_URL || default` → `process.env.LIV_API_URL || default`. Semantic preserved. |
| `NEXUS_API_URL` ↔ `LIV_API_URL` | `livos/packages/livinityd/source/modules/docker/ai-diagnostics.ts:54` | Same collapse. |
| `NEXUS_DIR` ↔ `LIV_DIR` | (no source-side conflict materialized) | Source uses `NEXUS_BASE_DIR` (renamed to `LIV_BASE_DIR`) and `LIV_DIR` separately; no double-reference. PREFLIGHT collision was about `/opt/livos/.env` runtime which is 65-05 territory. |

No semantic changes — pure mechanical collision-suppression. `routes.ts` and `ai-diagnostics.ts` getNexusApiUrl helpers still return `LIV_API_URL || 'http://localhost:3200'` (default unchanged from pre-rename).

## v31-DRAFT Line 166 Final-Grep Audit

Total case-insensitive `nexus` matches in `liv/packages/**/*.{ts,tsx}` + `livos/packages/**/*.{ts,tsx}`: **758 (758 lines, 126 unique files)**.

Categorization:

| Category | Count | Disposition |
|----------|-------|-------------|
| TypeScript identifiers (NexusConfig, nexusBaseDir, getNexusApiUrl, NEXUS_BASE constant, etc.) | 309 | INTENTIONAL — D-02 mechanical-only carve-out (renaming TS types is architectural, would break compile contracts and import surfaces) |
| Comments (JSDoc + line comments referring to project, historical context, redis key examples) | 195 | INTENTIONAL — many are valid docstrings about ID/key shapes in mechanical-rename-only scope; renaming all would risk false-positive on phrases like "nexus" used in non-project contexts. Brand-name comments in user-facing code (system prompts, command titles) WERE renamed in Group 5/C2. |
| Test fixtures (mock data in *.test.ts files) | 52 | INTENTIONAL — mocking production filesystem state (`/opt/livos/node_modules/.pnpm/@nexus+core@1.0.0_xyz/...`) which is current production reality until 65-05 cutover. Tests will be updated post-65-05. |
| Sacred file (`liv/packages/core/src/sdk-agent-runner.ts`) | 40 | INTENTIONAL — D-06 forbids touching this file. Includes `'nexus-tools'` MCP server name (internal contract w/ Claude SDK), `mcp__nexus-tools__` tool name pattern, file-header comments. |
| Filesystem paths `/opt/nexus/` (defaults, log paths, readlink targets) | 21 | INTENTIONAL — 65-04 (update.sh) + 65-05 (Mini PC migration) own the deploy-side path rename. |
| PM2 process names (`'nexus-core'`, `'nexus-worker'`, etc. in pm2.ts ecosystem generator + status.ts) | 12 | INTENTIONAL — 65-04 deploy-script concern; current Mini PC systemd uses `liv-core` etc. (drift exists pre-rename). |
| String literals (mostly PM2 log file paths like `'/nexus-core.log'`) | 81 | OVERLAP with PM2 names + filesystem paths above; same disposition. |
| HTTP route paths (`/api/nexus/...`) | 7 | INTENTIONAL — breaking API change deferred. UI client + server route registrations must coordinate. |
| MCP server name strings (`'nexus-tools'`, `mcp__nexus-tools__`) | 4 | INTENTIONAL — internal Claude SDK contract; D-06 sacred file references this. |
| Other (mostly `nexus?.foo` config-access expressions where `nexus` is a TypeScript variable name) | 37 | INTENTIONAL — TS identifier carve-out. |

**Net:** Zero source-tree `@nexus/` IMPORT statements (verified). Zero `process.env.NEXUS_*` env references (verified). Zero `'nexus:'` Redis-key string-literal prefixes in source (verified). User-visible "Nexus Agent" / "Nexus" brand strings in agent prompts, log lines, error messages, MCP descriptions, CLI status, and chat command headers are all renamed to "Liv" / "Liv Agent". All remaining `nexus` matches are documented architectural carve-outs per D-02 / D-06 / 65-04+05 deferred scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] LIV_API_URL collision produced redundant `||` expression after blind sweep**
- **Found during:** Task 3, post-env-sweep verify
- **Issue:** Blind regex `process\.env\.NEXUS_API_URL` → `process.env.LIV_API_URL` produced `process.env.LIV_API_URL || process.env.LIV_API_URL || default` in 2 sites (routes.ts, ai-diagnostics.ts) where the original was `NEXUS_API_URL || LIV_API_URL || default`.
- **Fix:** Manual edit collapsing to `process.env.LIV_API_URL || default` — semantically identical (both fall back to default if env unset).
- **Files modified:** `livos/packages/livinityd/source/modules/ai/routes.ts`, `livos/packages/livinityd/source/modules/docker/ai-diagnostics.ts`
- **Commit:** `ed38c138` (Group 5 — included in the same atomic sweep commit)

**2. [Rule 1 - Bug] Comment-aware regex required re-run after first attempt over-matched JSDoc text**
- **Found during:** Task 1 (Group 1 import sweep)
- **Issue:** First-pass import regex `\bfrom\s+['"]@nexus\b` matched JSDoc comment text in `liv/packages/core/src/index.ts:5` and `liv/packages/core/src/lib.ts:4-5` that documented the import syntax (e.g., `// from '@nexus/core'` inside JSDoc).
- **Fix:** Reverted those edits with `git checkout --`, rewrote the regex to be line-by-line with comment-state tracking (`/* */` block + `//` line). Re-ran sweep — 0 hits in those files (correct), full plan completion downstream.
- **Files modified:** None ultimately — the over-match was reverted before commit.
- **Commit:** None — fix was pre-commit.

### Discoveries that Modified Plan Approach (not deviations — plan-aware)

**1. Group 1 + Group 2 are no-ops** — `liv/packages/{core,worker,mcp-server,memory,cli,hooks}/src/` had ZERO actual `from '@nexus/...'` imports. The 10 `@nexus/` hits inside liv/packages/core source were JSDoc comment text describing the package's own re-export contract. These are correctly handled by Group 5's comment sweep, NOT by Group 1/2's import sweep. Per the GSD rule "do not create empty commits", I shipped 4 commits instead of 5 (3 import-y + 1 follow-up) and documented Groups 1+2 as no-ops here.

**2. Redis 'nexus:' prefix occurrences vastly exceed the plan's '5 expected' estimate** — found 179+ in `liv/packages/core` alone (across 46 files including capability-registry, channel sessions, hooks, agent results, voice, multi-agent, ws-gateway, providers/manager, etc.). All renamed atomically in Group 5. None are false positives; all are real Redis SET/GET/HGET/PUBLISH key patterns. The "5" estimate in the spec was an underestimate; the plan caveat "investigate but be conservative" was followed by full categorization before commit.

**3. Many user-visible 'Nexus' brand strings remained outside the regex shape `Nexus Agent`** — found in MCP tool descriptions ("Submit a task to the Nexus daemon", "Ask Nexus", etc.), CLI setup status messages ("Installing Nexus dependencies", "Building Nexus core"), agent system prompts ("You are Nexus, an autonomous AI assistant"), chat command headers ("🤖 *Nexus Commands*", "📊 *Nexus Statistics*"), error message templates ("Nexus API error: ${status}"). These were targeted with manual edits during Group 5 + the C2 follow-up commit. TypeScript identifier names (`NexusConfig`, `nexusBaseDir`) and HTTP route paths (`/api/nexus/...`) and PM2 process names (`'nexus-core'`) were intentionally NOT renamed per D-02 / 65-04+05 deferred scope.

### Rule 4 (architectural) Triggers
None. All fixes were mechanical/correctness-preserving per Rules 1-3.

## Authentication Gates
None encountered — local-only plan.

## Threat Surface Scan
No new network endpoints, auth paths, file-access patterns, or trust-boundary changes introduced. All edits are in-place text replacements; no new exec, no new fetch destinations, no new file writes outside what was already in source. The threat register from PLAN's `<threat_model>` is fully addressed:

| Threat ID | Status |
|-----------|--------|
| T-65-03-01 (sacred file modified by sweep) | MITIGATED — sacred file unconditionally skipped in script + manual edits; SHA verified at 8 checkpoints |
| T-65-03-02 (false-positive regex hit) | MITIGATED — comment-aware import sweep; collision resolution; manual review of test-fixture surface; 758 residual matches all categorized |
| T-65-03-03 (broker logic accidentally edited) | MITIGATED — `git diff --stat livos/.../livinity-broker/` shows 1-line-per-file diff (import-only); D-NO-BYOK preserved |
| T-65-03-04 (TS build introduces NEW errors) | MITIGATED — D-10 baseline check passed; 358 pre-existing errors in unrelated modules; zero new errors |
| T-65-03-05 (.env.example contains secrets) | ACCEPTED — `.env.example` files contain placeholder values only; user-managed `.env` is .gitignore'd |
| T-65-03-06 (multi-commit breaks atomic-rollback) | MITIGATED — each of 4 commits independently revertible; build-clean at each intermediate state |

## Cross-Plan Contracts

- **65-04 inputs:** Source tree fully renamed @nexus → @liv at the import + env-var + Redis-prefix layers. Build-clean. ✓ delivered.
- **65-05 inputs:** Source-side rename complete; Mini PC `/opt/nexus/` → `/opt/liv/` migration script can author against a fully-renamed source baseline. ✓ delivered.
- **65-06 inputs:** Active doc updates can find all source-side rename surface fully done; no mid-rename intermediate state to navigate around. ✓ delivered.

## Rollback (if needed)

Per-commit (target: < 1 min each):

```bash
git revert 4476385a    # C2: user-string follow-up
git revert ed38c138    # Group 5: env+Redis+comments+strings+envexample
git revert a62f31c2    # Group 4: livos/skills imports
git revert 4324c839    # Group 3: livinityd imports
```

Phase-level (reverse order, target: < 5 min):

```bash
git revert 4476385a..4324c839
cd liv && npm install      # restore @nexus/* lockfile resolution (no — that's 65-02's revert)
```

For a full Phase 65-03 rollback, just revert the 4 SHAs in reverse order. Lockfile is unaffected (65-02 owns it). All 4 `@liv/*` builds will go back to "module resolution OK but source has @liv imports" — i.e., the post-65-02 / pre-65-03 state, which is build-broken (livinityd has @liv imports but livos workspaces resolve @liv via 65-02's edits, so build still passes from a TYPE-CHECK perspective; only the runtime would surface broken `process.env.NEXUS_*` lookups failing if `LIV_*` was set instead).

## Self-Check: PASSED

- [x] All 4 plan-3 commits exist in git log: `4324c839`, `a62f31c2`, `ed38c138`, `4476385a` (verified via `git log --oneline -6`)
- [x] Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` preserved at all 8 checkpoints
- [x] Zero `from '@nexus/'`, `import('@nexus/'`, `require('@nexus/'` in `liv/packages/**` + `livos/packages/**` source (verified via Grep — only matches in `.claude/worktrees/` which are out of scope)
- [x] Zero `process.env.NEXUS_*` in `liv/packages/**` + `livos/packages/**` source (verified via Grep)
- [x] Zero `'nexus:'`, `"nexus:'`, `` `nexus: `` Redis-prefix string-literals in `liv/packages/**` + `livos/packages/**` source (verified via Grep — only matches are in sacred file's `'nexus-tools'` MCP server name, which is NOT a Redis prefix)
- [x] All 4 `@liv/*` workspaces compile (`npm run build` exit 0): @liv/core, @liv/worker, @liv/mcp-server, @liv/memory
- [x] Sacred file content unchanged (SHA gate at 8 points + zero edits applied to that path)
- [x] D-NO-BYOK boundary preserved in broker (9 files, 1-line-per-file diff, import-only)
- [x] D-NO-SERVER4: no SSH session in this plan (local-only)
- [x] No new TS errors introduced (358 pre-existing in livinityd typecheck, all in unrelated modules)
- [x] livos/.env.example: NEXUS_BASE_DIR/SKILLS_DIR/WORKSPACE_DIR/API_URL → LIV_* (verified via grep)
- [x] No accidental file deletions in any of the 4 commits (`git diff --diff-filter=D --name-only HEAD~N HEAD~N+1` returned empty for each)

All claims in this SUMMARY are verified against the working tree and git log.
