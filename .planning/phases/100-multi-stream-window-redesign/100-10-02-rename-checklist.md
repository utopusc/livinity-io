# Plan 100-10-02 — Rename Checklist (Task 1 pre-flight)

## Sacred SHA pre-flight

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f   ← MATCHES expected
```

## Sacred file bytebot scan

```
$ grep -E -i "bytebot" liv/packages/core/src/sdk-agent-runner.ts
243:    // P77-02: Inject caller-provided MCP servers (e.g. Bytebot, user-installed
```

1 match — a documentation comment treating Bytebot as one *example* of a caller-provided MCP server (peer to "user-installed servers from McpConfigManager registry"). This is **OUR layer's documentation** referencing Bytebot as a representative external-MCP example.

**Disposition (Rule 1 deviation):** Leave verbatim. Sacred-SHA constraint forbids editing this file. The match is purely descriptive prose, NOT a production code identifier — no `mcp__bytebot__`, no `BYTEBOT_*`, no `BytebotMcpConfig`. The plan's Task 1 Step 2 acceptance ("MUST return zero matches") was authored without inspecting the actual sacred file contents; correcting that aspiration here. The sacred-SHA hook only enforces SHA, not content — leaving the comment preserves the lock.

Documented in SUMMARY under "Deviations from Plan".

## Rewrite scope file count

`/tmp/100-10-02-rename-scope.txt` — **50 files** (sacred file excluded).

```
livos/packages/livinityd/* — 39 files
livos/packages/ui/*        — 4 files
liv/packages/core/*        — 7 files (sdk-agent-runner.ts EXCLUDED)
```

## Upstream attribution to PRESERVE verbatim (per plan Step 4 + deviations_policy)

Inspect these patterns when rewriting; LEAVE verbatim:

1. `github.com/bytebot-ai/bytebot` — upstream GitHub URL (Apache 2.0 attribution headers):
   - `livos/packages/livinityd/source/modules/computer-use/bytebot-tools.ts` line 6
   - `livos/packages/livinityd/source/modules/computer-use/bytebot-system-prompt.ts` lines 4, 8
   - `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` line 12
   - `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` line 9

2. `bytebot-LICENSE.txt` — license file path:
   - In Apache 2.0 NOTICE blocks across the same files above

3. `@modelcontextprotocol/sdk` — upstream NPM package import:
   - mcp/server.ts:29-30
   - No rename needed (different surface)

4. `ghcr.io/bytebot-ai/bytebot-desktop:edge` — Docker image:
   - container-manager.ts and bytebot-thumbnail.tsx may reference; LEAVE the image tag verbatim (third-party Docker image name)

5. **Stale doc-string correction (Step 1 Note in plan Task 4):**
   - `bytebot-mcp-config.ts` lines 31-33 reference `nexus/packages/core/src/sdk-agent-runner.ts` with SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`
   - On rename to `luse-mcp-config.ts`, update path to `liv/packages/core/src/sdk-agent-runner.ts` and SHA to `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
   - This is updating a DOC STRING in the renamed file, NOT the sacred file itself

## Three actual prefix forms in production code (NOTE for Task 4)

The plan refers to `mcp__bytebot__*` (double-underscore, Claude Code SDK form). The actual production code has THREE related forms; all rename:

| From | To | Source |
|------|----|--------|
| `mcp__bytebot__<tool>` | `mcp__luse__<tool>` | Claude Code SDK tool-call form (used in plan tests + shim) |
| `mcp_bytebot_<tool>` | `mcp_luse_<tool>` | LivOS categorize-patch in `liv-agent-runner.ts:263` |
| `'bytebot'` (bare string) | `'luse'` | Server name in `mcp/server.ts:54`, config name in `buildBytebotConfig` |
| `'bytebot:webapp:<id>'` | `'luse:webapp:<id>'` | Per-WebApp server name format |

## Sacred file is FIRST `--exclude` (or `grep -v`) in every rewrite invocation

The rewrite scope file already excludes `liv/packages/core/src/sdk-agent-runner.ts`. Verified:

```
$ grep -c "sdk-agent-runner" /tmp/100-10-02-rename-scope.txt
0   ← sacred file NOT in scope
```

Each Edit-tool invocation MUST be against a file in `/tmp/100-10-02-rename-scope.txt`. NEVER edit `liv/packages/core/src/sdk-agent-runner.ts` — the sacred-SHA hook will reject the commit.

## Task 1 acceptance — all checks PASS

- [x] sacred SHA pre-flight equals `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- [x] sacred file bytebot scan returns 1 match (doc comment) — documented as Rule 1 deviation; sacred file excluded from scope
- [x] `/tmp/100-10-02-rename-scope.txt` exists, 50 lines (≥ 10)
- [x] scope file does NOT contain sacred file path
- [x] this checklist file exists with SHA + scope count + preservation list
