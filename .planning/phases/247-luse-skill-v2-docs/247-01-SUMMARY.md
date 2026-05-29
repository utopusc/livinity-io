---
phase: 247
plan: 01
subsystem: docs
tags: [docs, luse, patterns, troubleshooting, anti-patterns, integration-recipes, known-limits, cheat-sheet]
dependency_graph:
  requires:
    - Phase 242 (initial Luse docs scaffold under docs/luse/)
  provides:
    - docs/luse/PATTERNS.md (named production patterns)
    - docs/luse/ANTI-PATTERNS.md (banned patterns + corrective links)
    - docs/luse/CHEAT-SHEET.md (single-page tool reference)
    - docs/luse/TROUBLESHOOTING.md (named failure modes with diagnostic commands)
    - docs/luse/INTEGRATION-RECIPES.md (per-agent invocation recipes)
    - docs/luse/KNOWN-LIMITS.md (DPI / multi-monitor / Wayland / sandbox / root-app limits)
  affects:
    - docs/luse/tools/{click,type,screenshot,key,scroll}.md (additive See-also sections)
tech_stack:
  added: []
  patterns:
    - "Cross-references from per-tool docs (../PATTERNS.md#anchor) — additive, body-stable"
key_files:
  created:
    - docs/luse/PATTERNS.md
    - docs/luse/ANTI-PATTERNS.md
    - docs/luse/CHEAT-SHEET.md
    - docs/luse/TROUBLESHOOTING.md
    - docs/luse/INTEGRATION-RECIPES.md
    - docs/luse/KNOWN-LIMITS.md
  modified:
    - docs/luse/tools/click.md
    - docs/luse/tools/type.md
    - docs/luse/tools/screenshot.md
    - docs/luse/tools/key.md
    - docs/luse/tools/scroll.md
decisions:
  - "Honored 247-CONTEXT.md gemini_decision: 4 shim files (.claude/.aion/.opencode/.openclaw) — Gemini section documents MCP tool-discovery only, no shim"
  - "8 patterns (plan asked for ≥7) — included secrets-via-clipboard as Pattern 8 to cross-reference ANTI-PATTERNS.md#4 cleanly"
  - "CHEAT-SHEET.md uses a markdown table + 'At-a-glance reminders' + 'Common composition shapes' to hit the ≥40 line bar without filler"
metrics:
  duration: "single session (~25 min)"
  completed: 2026-05-28
  tasks_completed: 2
  files_created: 6
  files_modified: 5
  commits: 2
---

# Phase 247 Plan 01: Luse skill v2 docs — canonical reference + cross-refs Summary

**One-liner:** Layered the production reference docs (PATTERNS / TROUBLESHOOTING / ANTI-PATTERNS / INTEGRATION-RECIPES / KNOWN-LIMITS / CHEAT-SHEET) on top of the Phase 242 minimum-viable Luse skill set and cross-referenced them from every per-tool doc — no shim regeneration yet (that's Plan 02).

## What shipped

### Six new canonical docs under `docs/luse/`

| File                       | Lines | Headings                                                                                                                            |
| -------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PATTERNS.md`              | 240   | 8 named patterns (screenshot-then-act, landmark-anchored clicks, retry-with-screenshot-verify, multi-step wizard, focus-before-type, modal dismissal, scroll-and-search, secrets via clipboard) |
| `ANTI-PATTERNS.md`         | 147   | 4 banned patterns (brittle pixel coords, fire-and-forget clicks, modifier-key collisions with desktop shell, sensitive text via `computer_type_text`) |
| `CHEAT-SHEET.md`           | 54    | 8-row tool table + at-a-glance reminders + common composition shapes                                                                |
| `TROUBLESHOOTING.md`       | 168   | 6 named failure modes (display gone away, X server unreachable, Redis unreachable, wrong DISPLAY env, window not focused, xdotool race) |
| `INTEGRATION-RECIPES.md`   | 144   | 5 agent sections (Claude Code, Aion CLI, OpenCode, Gemini, OpenClaw)                                                                |
| `KNOWN-LIMITS.md`          | 95    | 5 limits (DPI/scaling table, multi-monitor, Wayland gaps, snap/flatpak isolation, root-only apps)                                   |

Total new lines: 848.

### Five per-tool doc cross-references (additive only)

Each of `docs/luse/tools/{click,type,screenshot,key,scroll}.md` gained a `## See also` section at the bottom linking to the relevant PATTERNS.md / ANTI-PATTERNS.md anchors. The existing body text was not touched — the edits append-only.

| Per-tool doc       | Linked anchors                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/click.md`   | PATTERNS#pattern-2 (landmark-anchored), PATTERNS#pattern-3 (retry-with-screenshot-verify), ANTI-PATTERNS#anti-pattern-1 (brittle pixel coords)                                                  |
| `tools/type.md`    | PATTERNS#pattern-5 (focus-before-type), PATTERNS#pattern-8 (secrets via clipboard), ANTI-PATTERNS#anti-pattern-4 (sensitive text via `computer_type_text`)                                       |
| `tools/screenshot.md` | PATTERNS#pattern-1 (screenshot-then-act), PATTERNS#pattern-7 (scroll-and-search)                                                                                                              |
| `tools/key.md`     | PATTERNS#pattern-6 (modal dismissal), ANTI-PATTERNS#anti-pattern-3 (modifier-key collisions with desktop shell)                                                                                  |
| `tools/scroll.md`  | PATTERNS#pattern-7 (scroll-and-search)                                                                                                                                                          |

### Pattern names chosen (PATTERNS.md)

1. Screenshot-then-act
2. Landmark-anchored clicks (not pixel coords)
3. Retry-with-screenshot-verify (cap 3 attempts)
4. Multi-step wizard navigation
5. Focus-before-type
6. Modal dismissal
7. Scroll-and-search
8. Secrets via clipboard (NOT type)

### Anti-pattern names chosen (ANTI-PATTERNS.md)

1. Brittle pixel coords without screenshot verify
2. Fire-and-forget clicks without exit-criteria check
3. Modifier-key collisions with desktop shell
4. Sensitive text via `computer_type_text` instead of `computer_paste_text` + `isSensitive`

### Agent sections written (INTEGRATION-RECIPES.md)

| Agent       | Shim location                                                       | Notes                                                                                |
| ----------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Claude Code | `.claude/skills/luse/SKILL.md`                                      | MCP tool-use block shape                                                             |
| Aion CLI    | `.aion/skills/luse.md`                                              | Single-file skill                                                                    |
| OpenCode    | `.opencode/skills/luse.md`                                          | Single-file skill                                                                    |
| Gemini      | none — MCP tool-discovery only (Phase 242 D-242-C honored verbatim) | Discovery-only path; no skill file. Future sync target intentionally deferred.       |
| OpenClaw    | `.openclaw/skills/luse.md`                                          | Single-file skill                                                                    |

## Verification

All acceptance criteria from the plan's automated `<verify>` blocks pass:

**Task 1 (Patterns / Anti-Patterns / Cheat-Sheet):**

```
$ wc -l docs/luse/PATTERNS.md docs/luse/ANTI-PATTERNS.md docs/luse/CHEAT-SHEET.md
  240 docs/luse/PATTERNS.md          (≥ 120 required)
  147 docs/luse/ANTI-PATTERNS.md     (≥ 60 required)
   54 docs/luse/CHEAT-SHEET.md       (≥ 40, ≤ 80 required)
```

- `grep -cE '^## Pattern' docs/luse/PATTERNS.md` → 8 (≥ 7 required)
- `grep -cE '^## Anti-Pattern' docs/luse/ANTI-PATTERNS.md` → 4
- Real MCP tool names verified: `computer_screenshot`, `computer_click_mouse`, `computer_paste_text`, `computer_press_keys`, `computer_scroll`, `computer_type_text`, `computer_application`, `computer_wait` all present
- `isSensitive` appears in ANTI-PATTERNS.md

**Task 2 (Troubleshooting / Integration-Recipes / Known-Limits / cross-refs):**

```
$ wc -l docs/luse/TROUBLESHOOTING.md docs/luse/INTEGRATION-RECIPES.md docs/luse/KNOWN-LIMITS.md
  168 docs/luse/TROUBLESHOOTING.md      (≥ 80 required)
  144 docs/luse/INTEGRATION-RECIPES.md  (≥ 100 required)
   95 docs/luse/KNOWN-LIMITS.md         (≥ 60 required)
```

- Named failure modes verified: `Display gone away`, `X server unreachable`, `Luse MCP cannot reach Redis`, `Wrong DISPLAY env`, `Window not focused`, `xdotool race conditions`
- All 5 agent headings present (Claude Code / Aion CLI / OpenCode / Gemini / OpenClaw)
- Gemini section contains the exact phrase `MCP tool-discovery` (D-242-C honored)
- All 5 limits present (DPI, multi-monitor, Wayland, snap/flatpak, root-only apps)
- `PATTERNS.md` link present in all 5 per-tool docs

## Sacred SHA preservation evidence

```
$ git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Match against D-V44-SACRED expected SHA: ✅ identical. The `[sacred-sha]` pre-commit hook fired `PASS: 20 files verified` on both Task 1 commit (`f16f12e2`) and Task 2 commit (`41f4a96b`).

## Commits

| Task | Commit hash | Message                                                                                                                                                          |
| ---- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `f16f12e2`  | `docs(247-01): luse patterns + anti-patterns + cheat-sheet`                                                                                                      |
| 2    | `41f4a96b`  | `docs(247-01): luse troubleshooting + integration-recipes + known-limits + per-tool cross-refs`                                                                  |

## Deviations from Plan

None — plan executed exactly as written. The Gemini section in INTEGRATION-RECIPES.md follows the `<gemini_decision>` block in the plan (4 shim files, Gemini documented as MCP-discovery-only) rather than the orchestrator's "5 shim dirs" hint.

## Self-Check: PASSED

- ✅ `docs/luse/PATTERNS.md` exists (commit `f16f12e2`)
- ✅ `docs/luse/ANTI-PATTERNS.md` exists (commit `f16f12e2`)
- ✅ `docs/luse/CHEAT-SHEET.md` exists (commit `f16f12e2`)
- ✅ `docs/luse/TROUBLESHOOTING.md` exists (commit `41f4a96b`)
- ✅ `docs/luse/INTEGRATION-RECIPES.md` exists (commit `41f4a96b`)
- ✅ `docs/luse/KNOWN-LIMITS.md` exists (commit `41f4a96b`)
- ✅ 5 per-tool docs modified (commit `41f4a96b`)
- ✅ Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on both commits
- ✅ Commits `f16f12e2` and `41f4a96b` present in `git log`
