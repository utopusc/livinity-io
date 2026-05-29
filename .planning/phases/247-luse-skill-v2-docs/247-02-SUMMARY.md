---
phase: 247
plan: 02
status: complete
subsystem: docs
tags: [docs, luse, shim-sync, sha256, idempotency, claude-code, aion-cli, opencode, openclaw]
dependency_graph:
  requires:
    - phase: 247
      plan: 01
      provides: "6 new canonical docs (PATTERNS / TROUBLESHOOTING / ANTI-PATTERNS / INTEGRATION-RECIPES / KNOWN-LIMITS / CHEAT-SHEET) + 5 per-tool cross-reference edits"
    - phase: 242
      plan: 01
      provides: "sync-luse-skills.sh sha256-marker idempotency framework"
  provides:
    - "Regenerated 4 agent shim targets carrying v2 docs"
    - "Extended sync-luse-skills.sh manifest covering all 13 canonical docs (LUSE + WORKFLOW + 5 tools + 6 top-level)"
    - "Verified Phase 242 D-242-B idempotency invariant holds after manifest extension"
tech_stack:
  added: []
  patterns:
    - "Explicit-list manifest extension (vs glob) for deterministic sha order"
    - "Standalone .claude/skills/luse/<NAME>.md per top-level doc (parity with per-tool shim shape)"
    - "Concatenated payload appends 6 new sections in deterministic order for stable sha"
key_files:
  created:
    - .claude/skills/luse/PATTERNS.md
    - .claude/skills/luse/TROUBLESHOOTING.md
    - .claude/skills/luse/ANTI-PATTERNS.md
    - .claude/skills/luse/INTEGRATION-RECIPES.md
    - .claude/skills/luse/KNOWN-LIMITS.md
    - .claude/skills/luse/CHEAT-SHEET.md
  modified:
    - scripts/sync-luse-skills.sh
    - .claude/skills/luse/click.md
    - .claude/skills/luse/type.md
    - .claude/skills/luse/screenshot.md
    - .claude/skills/luse/key.md
    - .claude/skills/luse/scroll.md
    - .aion/skills/luse.md
    - .opencode/skills/luse.md
    - .openclaw/skills/luse.md
decisions:
  - "D-247-02-A — Honored Phase 242 D-242-C: no Gemini shim added. The orchestrator's additional_context only listed 4 shim dirs (`.claude/skills/luse/`, `.aion/skills/luse.md`, `.opencode/skills/luse.md`, `.openclaw/skills/luse.md`), matching 247-CONTEXT.md and D-242-C. Gemini agents discover Luse via MCP tool-discovery only."
  - "D-247-02-B — Extended script via EXPLICIT-LIST manifest (NOT glob). The Phase 242 script already used named `read_canonical` calls for each doc, giving deterministic concat order and stable shas. Adding a glob would have broken existing source-sha values on every doc rename; named appends keep the invariant local."
  - "D-247-02-C — Emit 6 new top-level docs as STANDALONE .claude/skills/luse/<NAME>.md files (not concatenated into SKILL.md body). Parity with the existing per-tool shape; Claude Code skill loader expects discoverable per-capability files."
  - "D-247-02-D — Concat order in CONCAT_PAYLOAD chosen deterministically: PATTERNS → TROUBLESHOOTING → ANTI-PATTERNS → INTEGRATION-RECIPES → KNOWN-LIMITS → CHEAT-SHEET. Same ordering as the plan frontmatter `created:` list."
metrics:
  duration: "single session (~20 min)"
  completed: 2026-05-28
  tasks_completed: 2
  files_created: 6
  files_modified: 9
  commits: 2
---

# Phase 247 Plan 02: Luse skill v2 shim sync + idempotency verification Summary

**One-liner:** Extended `scripts/sync-luse-skills.sh` manifest with the 6 new top-level canonical docs from Plan 247-01, regenerated all 4 agent shim targets, and proved Phase 242's sha256-marker idempotency invariant still holds — second sync run reports `0 new / 0 updated / 15 unchanged`.

## What shipped

### Sync script extension (`scripts/sync-luse-skills.sh`)

Two surgical additions on top of the Phase 242 baseline (213 → 247 lines, +34):

1. **Six new `read_canonical` calls** + variable assignments (`PATTERNS_MD`, `TROUBLESHOOTING_MD`, `ANTI_PATTERNS_MD`, `INTEGRATION_RECIPES_MD`, `KNOWN_LIMITS_MD`, `CHEAT_SHEET_MD`) wired into the existing payload-build block.
2. **`CONCAT_PAYLOAD`** extended with 6 new `---\n\n## <NAME>\n\n%s` sections (deterministic order matching plan frontmatter `created:` list).
3. **`generate_claude_skill`** gains a second `for` loop emitting 6 standalone `.claude/skills/luse/<NAME>.md` files with the same HTML-comment `source-sha` + `AUTO-GENERATED FROM docs/luse/<NAME>.md` header shape as the existing per-tool shims.

No edits to: `set -euo pipefail`, sha256_of_string fallback, read_existing_sha logic, write_shim function, generate_generic_shim function, final stdout `Synced N shims (...)` formatter (counters auto-pick up the new files).

### Audit decision (Step 1 of Plan)

Script's existing manifest used explicit `read_canonical "$CANONICAL_DIR/<file>"` calls, NOT a `docs/luse/*.md` glob. **Manifest extension was required** (NOT the no-op glob case). Decision per D-247-02-B kept the extension to local named appends rather than introducing a glob (which would have invalidated every source-sha and broken the Phase 242 idempotency invariant on the first run).

### Regenerated shim payloads

| Shim target                        | Status              | Source(s)                                                            | source-sha (post-sync)                                                |
| ---------------------------------- | ------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `.claude/skills/luse/SKILL.md`     | unchanged           | LUSE.md (untouched in 247-01)                                        | `510a727e26c2bb76eda4b228781836c904ae4c8040cadcfdbe67cd6138904471` (carry-over from 242) |
| `.claude/skills/luse/click.md`     | updated             | tools/click.md (per-tool See-also from 247-01)                       | `ae44c01535a6dec5aaa2d52cc71ce4b9e5f4bae18a4715d3992af6466fcf400d` (refreshed) |
| `.claude/skills/luse/type.md`      | updated             | tools/type.md                                                        | refreshed                                                             |
| `.claude/skills/luse/screenshot.md`| updated             | tools/screenshot.md                                                  | refreshed                                                             |
| `.claude/skills/luse/key.md`       | updated             | tools/key.md                                                         | refreshed                                                             |
| `.claude/skills/luse/scroll.md`    | updated             | tools/scroll.md                                                      | refreshed                                                             |
| `.claude/skills/luse/PATTERNS.md`  | **NEW**             | PATTERNS.md (247-01)                                                 | `6cbbc05e3500328708d426fa35562ceafe042ff3901c7f743ab962939e8a412f`     |
| `.claude/skills/luse/TROUBLESHOOTING.md` | **NEW**       | TROUBLESHOOTING.md (247-01)                                          | refreshed                                                             |
| `.claude/skills/luse/ANTI-PATTERNS.md` | **NEW**         | ANTI-PATTERNS.md (247-01)                                            | refreshed                                                             |
| `.claude/skills/luse/INTEGRATION-RECIPES.md` | **NEW**   | INTEGRATION-RECIPES.md (247-01)                                      | refreshed                                                             |
| `.claude/skills/luse/KNOWN-LIMITS.md` | **NEW**          | KNOWN-LIMITS.md (247-01)                                             | refreshed                                                             |
| `.claude/skills/luse/CHEAT-SHEET.md` | **NEW**           | CHEAT-SHEET.md (247-01)                                              | refreshed                                                             |
| `.aion/skills/luse.md`             | updated (bundled)   | LUSE + 5 tools + WORKFLOW + 6 new top-level docs concatenated        | `16bbf3c1311f44f2062f986660ac8e16ddacb18272db3501a26c9ef14c3afd79` (refreshed) |
| `.opencode/skills/luse.md`         | updated (bundled)   | Same as Aion CLI                                                     | `030df65134c58680ddea71ecabfc41eaa5626fe3e6ae04e4e1a097019f2cf454` (refreshed) |
| `.openclaw/skills/luse.md`         | updated (bundled)   | Same as Aion CLI                                                     | `21accc8c83de535c15ba42e8dfadb6ec9ee94d9f020cc7ed3b425b5d4c1d5e61` (refreshed) |

**Note on generic-shim source-shas being non-identical across agents:** each generic-shim payload includes the `Agent: <name>` line in its HTML comment header (Aion CLI / OpenCode / OpenClaw), so the computed payload sha differs per shim by design. This is Phase 242 behavior, preserved.

## Verification evidence

### Sync run output (verbatim)

**First run** (manifest extension freshly applied):

```
$ bash scripts/sync-luse-skills.sh
Synced 15 shims (6 new / 8 updated / 1 unchanged)
```

- 6 new: the 6 standalone `.claude/skills/luse/<NAME>.md` top-level docs
- 8 updated: 4 generic shims (Aion/OpenCode/OpenClaw bundled payload changed) + 5 per-tool Claude shims (per-tool docs gained `See also` sections in 247-01) — minus the 1 unchanged (see below)
- 1 unchanged: `.claude/skills/luse/SKILL.md` — its source LUSE.md was NOT touched in Plan 247-01, so the sha matched the existing marker and the file was left untouched. **This is the strongest evidence the sha-marker idempotency works at the per-file granularity, not the per-shim-group granularity.**

**Second run** (immediate idempotency check):

```
$ bash scripts/sync-luse-skills.sh
Synced 15 shims (0 new / 0 updated / 15 unchanged)
```

✅ Phase 242 D-242-B invariant intact after the manifest extension.

### Cross-reference smoke test

```
$ grep -c 'PATTERNS.md' .aion/skills/luse.md
32
$ grep -c 'Pattern 1' .aion/skills/luse.md
2
$ grep -c 'screenshot-then-act' .aion/skills/luse.md
4
$ grep -c 'landmark-anchored' .aion/skills/luse.md
6
$ grep -c 'Focus-before-type' .aion/skills/luse.md
1
```

PATTERNS.md cross-references propagate through the bundled payload at all 3 generic shims (each shows 32 hits — identical, since the only difference between the 3 shims is the agent name in the header comment). Canonical pattern names from Plan 247-01 are present in the Aion shim, proving the entire v2 doc set flowed through the concatenated payload.

### Source-sha marker check

```
$ for f in .claude/skills/luse/SKILL.md .aion/skills/luse.md .opencode/skills/luse.md .openclaw/skills/luse.md; do
    grep -o 'source-sha: [0-9a-f]\{64\}' "$f" | head -1
  done
source-sha: 510a727e26c2bb76eda4b228781836c904ae4c8040cadcfdbe67cd6138904471
source-sha: 16bbf3c1311f44f2062f986660ac8e16ddacb18272db3501a26c9ef14c3afd79
source-sha: 030df65134c58680ddea71ecabfc41eaa5626fe3e6ae04e4e1a097019f2cf454
source-sha: 21accc8c83de535c15ba42e8dfadb6ec9ee94d9f020cc7ed3b425b5d4c1d5e61
```

All 4 shim targets carry valid 64-hex source-sha markers.

### Sacred SHA preservation

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Match against D-V44-SACRED expected SHA: ✅ identical. The pre-commit hook fired `[sacred-sha] PASS: 20 files verified` on Commit A.

## Commits

| Step | Commit hash | Message                                                                                                         |
| ---- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| A    | `6cfcdf2f`  | `feat(247-02): propagate luse v2 docs to all 4 agent shims via sync-luse-skills.sh`                             |
| B    | TBD         | `docs(247-02): SUMMARY + phase aggregate + STATE/ROADMAP rollover — Phase 247 SHIPPED`                          |

## Deviations from Plan

None — plan executed exactly as written. The audit step (Plan Task 1 Step 1) correctly identified that the existing script used explicit `read_canonical` calls (not a glob), so the script-extension branch was taken per the plan's Decision tree.

## Self-Check: PASSED

- ✅ `bash scripts/sync-luse-skills.sh` ran successfully on first invocation (`Synced 15 shims (6 new / 8 updated / 1 unchanged)`)
- ✅ Second invocation reported `0 new / 0 updated / 15 unchanged` (Phase 242 D-242-B idempotency intact)
- ✅ All 4 shim targets carry `source-sha:` markers (SKILL.md / .aion / .opencode / .openclaw)
- ✅ `.aion/skills/luse.md` contains 32 `PATTERNS.md` references (>= 1 required)
- ✅ Pattern 1 / screenshot-then-act / landmark-anchored / Focus-before-type all visible in Aion shim
- ✅ Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved (Commit A pre-commit hook PASS)
- ✅ No `.gemini/skills/luse.md` created (D-242-C honored)
- ✅ Commit A `6cfcdf2f` present in `git log`
- ✅ 6 new `.claude/skills/luse/<NAME>.md` files created (PATTERNS, TROUBLESHOOTING, ANTI-PATTERNS, INTEGRATION-RECIPES, KNOWN-LIMITS, CHEAT-SHEET)
