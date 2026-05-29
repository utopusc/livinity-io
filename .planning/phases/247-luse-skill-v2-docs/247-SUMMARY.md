---
phase: 247
phase_name: luse-skill-v2-docs
status: shipped
shipped: 2026-05-28
plans_completed: 2
plans_total: 2
milestone: v44.0
tags: [docs, luse, patterns, troubleshooting, anti-patterns, integration-recipes, known-limits, cheat-sheet, shim-sync]
dependency_graph:
  requires:
    - Phase 242 (Luse universal skill set — sync-luse-skills.sh framework + canonical docs/luse/ scaffold)
  provides:
    - "Production-grade Luse reference (8 patterns + 4 anti-patterns + 6 failure modes + 5 agent recipes + 5 known limits + 1 cheat sheet) for all 4 shimmed CLI agents"
    - "Refreshed shim manifest covering 13 canonical docs (was 7 in Phase 242)"
key_files:
  created:
    - docs/luse/PATTERNS.md
    - docs/luse/ANTI-PATTERNS.md
    - docs/luse/CHEAT-SHEET.md
    - docs/luse/TROUBLESHOOTING.md
    - docs/luse/INTEGRATION-RECIPES.md
    - docs/luse/KNOWN-LIMITS.md
    - .claude/skills/luse/PATTERNS.md
    - .claude/skills/luse/ANTI-PATTERNS.md
    - .claude/skills/luse/CHEAT-SHEET.md
    - .claude/skills/luse/TROUBLESHOOTING.md
    - .claude/skills/luse/INTEGRATION-RECIPES.md
    - .claude/skills/luse/KNOWN-LIMITS.md
  modified:
    - docs/luse/tools/click.md
    - docs/luse/tools/type.md
    - docs/luse/tools/screenshot.md
    - docs/luse/tools/key.md
    - docs/luse/tools/scroll.md
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
  - "D-247-A — Honored Phase 242 D-242-C verbatim: 4 shim targets total (Claude/Aion/OpenCode/OpenClaw). Gemini section in INTEGRATION-RECIPES.md documents MCP tool-discovery only — no .gemini/ shim created."
  - "D-247-B — 8 patterns chosen for PATTERNS.md (plan asked >= 7) — included secrets-via-clipboard as Pattern 8 to cross-reference ANTI-PATTERNS.md#4 cleanly."
  - "D-247-C — Sync script extended via EXPLICIT-LIST manifest (not glob). Named `read_canonical` calls give deterministic concat order + stable shas; glob would have invalidated every source-sha on first run."
  - "D-247-D — Phase 247 top-level docs emit as standalone .claude/skills/luse/<NAME>.md files (parity with per-tool shape) AND join the concatenated payload for the 3 generic shims."
metrics:
  duration: "single day (2 sessions, ~45 min combined)"
  completed: 2026-05-28
  total_tasks: 4
  total_commits: 3
  files_created: 12
  files_modified: 14
  canonical_doc_lines_added: 848
---

# Phase 247: Luse skill set v2 — professional reference documentation Summary

**One-liner:** Layered 848 lines of production reference documentation (8 patterns, 4 anti-patterns, 6 named failure modes, 5 per-agent integration recipes, 5 known limits, single-page cheat sheet) on top of the Phase 242 minimum-viable Luse docs and propagated all of it through `scripts/sync-luse-skills.sh` to every shimmed CLI agent — Claude Code skill dir gets 6 new standalone .md files, Aion CLI / OpenCode / OpenClaw bundled shims gain the same content via the concatenated payload.

## Plan rollup

| Plan | Status      | Tasks | Commits                                                                                | Key output                                                                                       |
| ---- | ----------- | ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 01   | ✅ SHIPPED  | 2     | `f16f12e2` (patterns + anti-patterns + cheat-sheet), `41f4a96b` (troubleshooting + integration-recipes + known-limits + per-tool cross-refs) | 6 new canonical docs under `docs/luse/` (848 lines), 5 per-tool `## See also` cross-references     |
| 02   | ✅ SHIPPED  | 2     | `6cfcdf2f` (sync script + shim regen), this docs commit (SUMMARY + STATE/ROADMAP)      | 6 new `.claude/skills/luse/<NAME>.md` files, 4 generic shims refreshed, idempotency invariant preserved |

## What v2 docs added (canonical layer, from Plan 247-01)

| File                       | Lines | Headings count |
| -------------------------- | ----- | -------------- |
| `docs/luse/PATTERNS.md`              | 240 | 8 named patterns: screenshot-then-act, landmark-anchored clicks, retry-with-screenshot-verify, multi-step wizard, focus-before-type, modal dismissal, scroll-and-search, secrets via clipboard |
| `docs/luse/ANTI-PATTERNS.md`         | 147 | 4 banned patterns: brittle pixel coords, fire-and-forget clicks, modifier-key collisions with desktop shell, sensitive text via `computer_type_text` |
| `docs/luse/CHEAT-SHEET.md`           | 54  | 8-row tool table + at-a-glance reminders + composition shapes |
| `docs/luse/TROUBLESHOOTING.md`       | 168 | 6 named failure modes: display gone away, X server unreachable, Redis unreachable, wrong DISPLAY env, window not focused, xdotool race |
| `docs/luse/INTEGRATION-RECIPES.md`   | 144 | 5 agent sections: Claude Code / Aion CLI / OpenCode / Gemini / OpenClaw |
| `docs/luse/KNOWN-LIMITS.md`          | 95  | 5 limits: DPI/scaling, multi-monitor, Wayland gaps, snap/flatpak isolation, root-only apps |

Cross-references added to every per-tool doc (`tools/click.md`, `tools/type.md`, `tools/screenshot.md`, `tools/key.md`, `tools/scroll.md`) as additive `## See also` sections linking to relevant PATTERNS / ANTI-PATTERNS anchors. Body text not touched.

## What v2 propagation added (shim layer, from Plan 247-02)

- **Sync script manifest extended:** `scripts/sync-luse-skills.sh` gained 6 new `read_canonical` calls + 6 new sections in `CONCAT_PAYLOAD` + a second `for` loop in `generate_claude_skill` emitting standalone Claude skill files for each top-level doc.
- **6 new standalone Claude skill files:** `.claude/skills/luse/{PATTERNS,TROUBLESHOOTING,ANTI-PATTERNS,INTEGRATION-RECIPES,KNOWN-LIMITS,CHEAT-SHEET}.md`.
- **5 per-tool Claude skill files refreshed:** carry the new `See also` cross-references.
- **3 generic shim payloads refreshed:** `.aion/skills/luse.md`, `.opencode/skills/luse.md`, `.openclaw/skills/luse.md` now bundle 13 sections (LUSE + 5 tools + WORKFLOW + 6 new top-level docs).
- **No Gemini shim** (D-242-C + D-247-A) — Gemini section of INTEGRATION-RECIPES.md documents MCP tool-discovery as the only access path.

## Idempotency invariant

Phase 242 D-242-B requires that re-running `bash scripts/sync-luse-skills.sh` after any docs change reports `0 new / 0 updated / N unchanged` on the second invocation. Verified for Phase 247:

```
First run:  Synced 15 shims (6 new / 8 updated / 1 unchanged)
Second run: Synced 15 shims (0 new / 0 updated / 15 unchanged)  ✅
```

The 1 unchanged on first run is `.claude/skills/luse/SKILL.md` — its source (`docs/luse/LUSE.md`) was NOT touched in Plan 247-01, so the per-file sha matched and the file was left alone. This is the strongest possible evidence the marker idempotency operates at per-file granularity.

## Cross-reference smoke test (proves doc edits flow through)

```
$ grep -c 'PATTERNS.md'  .aion/skills/luse.md   → 32
$ grep -c 'Pattern 1'    .aion/skills/luse.md   →  2
$ grep -c 'screenshot-then-act' .aion/skills/luse.md → 4
$ grep -c 'landmark-anchored'   .aion/skills/luse.md → 6
```

The 32 PATTERNS.md hits in the Aion shim cover both the per-tool See-also sections (5 docs × ~3 hits each = 15) and the new top-level docs (PATTERNS.md itself + cross-links from CHEAT-SHEET / ANTI-PATTERNS / TROUBLESHOOTING / INTEGRATION-RECIPES / KNOWN-LIMITS = ~17). Matches expected propagation pattern.

## v44.0 sacred SHA invariant

D-V44-SACRED requires `git hash-object liv/packages/core/src/sdk-agent-runner.ts` to return `f3538e1d811992b782a9bb057d1b7f0a0189f95f` at every commit boundary.

Verified at every commit in this phase:

| Commit       | Plan | Sacred SHA on pre-commit hook |
| ------------ | ---- | ----------------------------- |
| `f16f12e2`   | 01   | PASS: 20 files verified       |
| `41f4a96b`   | 01   | PASS: 20 files verified       |
| `6cfcdf2f`   | 02   | PASS: 20 files verified       |
| this commit  | 02   | (to be verified at Commit B)  |

## Cumulative metrics

- **3 implementation commits** (`f16f12e2`, `41f4a96b`, `6cfcdf2f`) + **1 docs commit** (this aggregate close)
- **6 new canonical docs** (848 lines under `docs/luse/`)
- **6 new Claude skill files** (`.claude/skills/luse/<NAME>.md`)
- **14 files modified** (5 per-tool canonical + 5 per-tool Claude shim + 3 generic shims + 1 sync script)
- **Zero deviations** from plan
- **Zero Mini PC SSH / systemd / install-script edits** (docs-only phase per Phase 247 CONTEXT)
- **Zero new dependencies**
- **Zero compiled JS / .env touches**

## Deferred ideas

| Item                                                          | Why deferred                                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `docs/luse/DISPLAY-LIFECYCLE.md` cross-reference              | Phase 248 will author DISPLAY-LIFECYCLE.md; cross-link added by that phase, not 247        |
| Gemini skill format / `.gemini/skills/luse.md`                | No known Gemini skill system; MCP tool-discovery is the documented path (D-242-C, D-247-A) |
| Per-MCP-tool description "See: docs/luse/tools/<name>.md" link | Out-of-scope micro-phase (D-242-F deferred from Phase 242)                                  |

## Operator visibility / UAT

Docs-only phase — operator browser UAT NOT required. The Phase 247 success surface is:

1. Open `.claude/skills/luse/PATTERNS.md` in any editor — see 8 named patterns with concrete code examples.
2. Open `.aion/skills/luse.md` — see same content bundled in the concatenated payload behind an AUTO-GENERATED banner.
3. Cross-agent prose probe (carry-over from Phase 242 UAT-CHECKLIST.md): ask Claude Code / Aion CLI / OpenCode / OpenClaw inside Liv AI an identical Luse-related question, confirm hint copy is identical (proves all 4 agents pulled from the same canonical source).

Mini PC deployment NOT required — the docs live in this repo and are picked up by each CLI agent's skill loader the next time it scans its skills directory. Whether/when each agent re-scans is the agent's own concern.

## Self-Check: PASSED

- ✅ All 6 new canonical docs exist under `docs/luse/`
- ✅ All 6 new standalone Claude skill files exist under `.claude/skills/luse/`
- ✅ All 5 per-tool Claude shims have refreshed `source-sha:` markers
- ✅ All 3 generic shim payloads (Aion/OpenCode/OpenClaw) have refreshed `source-sha:` markers
- ✅ Phase 242 idempotency invariant preserved (second sync run: 0 new / 0 updated / 15 unchanged)
- ✅ Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved through all 3 implementation commits
- ✅ No `.gemini/skills/luse.md` created
- ✅ No Mini PC deploy artifacts, no compiled JS, no `.env` touches
- ✅ Per-plan SUMMARY files exist: 247-01-SUMMARY.md + 247-02-SUMMARY.md
- ✅ v44.0 milestone progress: 2/4 phases artifact-complete (P246 + P247 done; P248 + P249 planned)
