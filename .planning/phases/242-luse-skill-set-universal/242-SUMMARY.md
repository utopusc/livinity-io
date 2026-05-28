---
phase: 242-luse-skill-set-universal
plan: 01
subsystem: docs / agent-shim generation / Luse computer-use surface
tags: [docs, luse, mcp, skills, claude-code, aion-cli, opencode, openclaw, gemini, agent-agnostic, idempotent, sha256]
status: complete

# Dependency graph
requires:
  - phase: 241
    plan: 04
    provides: Luse MCP server registered into AionUi on first boot of livinityd (the universal protocol every supported agent already speaks; this phase only adds the documentation layer that travels with tool-discovery)
provides:
  - docs/luse/ canonical agent-agnostic documentation set (LUSE.md + 5 tool files + LUSE-WORKFLOW.md)
  - scripts/sync-luse-skills.sh — idempotent shim generator (sha256-keyed, no jq, portable bash)
  - .claude/skills/luse/ Claude Code skill (SKILL.md + 5 tool files; YAML frontmatter)
  - .aion/skills/luse.md + .opencode/skills/luse.md + .openclaw/skills/luse.md placeholder shims
  - .gitignore exception pattern so .claude/skills/luse/ is repo-tracked while other .claude/* remains local
  - Pattern: source-sha marker (first 5 lines, regex /source-sha:\s*[0-9a-f]{64}/) for content-addressed shim idempotency
affects: [Phase 245 (v43 E2E UAT close — unblocked for the Luse-cross-agent walk requirement)]

# Tech tracking
tech-stack:
  added: []  # zero new dependencies — pure markdown + bash
  patterns:
    - "Canonical-source + shim-generator pattern: docs/luse/ is the single source of truth; per-agent shims auto-generated from sha256-stable payload; never hand-edit shims"
    - "Portable POSIX bash with sha256sum / shasum fallback for Git Bash on Windows hosts"
    - "Gitignore double-negation hierarchy (.claude/* + !.claude/skills/ + .claude/skills/* + !.claude/skills/luse/) to surgically un-ignore a single subdir under an otherwise-ignored parent"
    - "Per-shim source-sha marker (first 5 lines) → content-addressed idempotency without external state file"
    - "Agent-agnostic prose (no agent-specific naming) so identical content can be sliced into any wrapper format"

key-files:
  created:
    - docs/luse/LUSE.md
    - docs/luse/LUSE-WORKFLOW.md
    - docs/luse/tools/click.md
    - docs/luse/tools/type.md
    - docs/luse/tools/screenshot.md
    - docs/luse/tools/key.md
    - docs/luse/tools/scroll.md
    - scripts/sync-luse-skills.sh
    - .claude/skills/luse/SKILL.md
    - .claude/skills/luse/click.md
    - .claude/skills/luse/type.md
    - .claude/skills/luse/screenshot.md
    - .claude/skills/luse/key.md
    - .claude/skills/luse/scroll.md
    - .aion/skills/luse.md
    - .opencode/skills/luse.md
    - .openclaw/skills/luse.md
    - .planning/phases/242-luse-skill-set-universal/242-SUMMARY.md
  modified:
    - .gitignore  # +3 lines: .claude/skills/ negation pattern
    - .planning/STATE.md
    - .planning/ROADMAP.md

key-decisions:
  - "D-242-A: docs/luse/ is the canonical agent-agnostic source. All 7 files use no agent-specific phrasing (no 'Claude', no 'Aion'). Single source of truth lets the sync script slice identical prose into any wrapper format without prose drift."
  - "D-242-B: Idempotency via per-shim source-sha marker rather than external manifest. First 5 lines of each generated shim carry 'source-sha: <sha256>'. Re-run computes sha256 of canonical payload, reads existing marker, writes only on mismatch. Zero state files. No jq."
  - "D-242-C: Gemini SKIPPED — no known skill system. Gemini agents inside Liv AI discover Luse via MCP tool-discovery only. Documented in script comments. Not a deferral; a deliberate non-target."
  - "D-242-D: Aion CLI / OpenCode / OpenClaw shims are PLACEHOLDER single-file MDs with comment-header documenting placeholder status. Their actual skill format is unknown; the placeholder still surfaces the prose to any agent that scans its skills directory. Replace with native wrapper once format is locked (future micro-phase, NOT blocking Phase 242 close)."
  - "D-242-E: Claude Code skill ships as a directory (.claude/skills/luse/) with proper YAML frontmatter (name + description + source-sha) matching the existing .claude/skills/cloud/SKILL.md format precedent in this repo. Tool files as siblings (click.md / type.md / etc.) with HTML-comment source-sha markers."
  - "D-242-F: Phase 241 MCP tool descriptions do NOT need editing. They already point to MCP tool names; the docs/luse/ prose is the discoverable layer agents read AFTER tool-discovery returns the name. If a future phase wants to add a 'See: docs/luse/tools/<name>.md' line to each MCP tool description, that's a separate micro-phase — out of scope here. (Original Plan-as-given Task 3 deleted; Phase 242 ships as 3 tasks, not 4.)"
  - "D-242-G: .gitignore double-negation hierarchy (.claude/* + !.claude/skills/ + .claude/skills/* + !.claude/skills/luse/) used to un-ignore exactly the Luse subdir under an otherwise-ignored parent. Pattern documented for future per-skill repo-tracking decisions."

requirements-completed: []  # phase 242 has no requirements field

# Metrics
duration: ~12min
completed: 2026-05-28
---

# Phase 242 Plan 01: Luse skill set — UNIVERSAL across all Liv AI agents Summary

**Ships a canonical agent-agnostic Luse documentation set (`docs/luse/`) + an idempotent POSIX-bash generator (`scripts/sync-luse-skills.sh`) that emits per-agent shims for Claude Code, Aion CLI, OpenCode, and OpenClaw from a single source of truth. Gemini is intentionally skipped — Gemini agents discover Luse via MCP tool-discovery only. Generated shims are content-addressed by sha256 source-marker so re-running the sync script is cheap and prose drift is impossible. Docs-only phase: no Mini PC deploy, no compiled JS, no new tests beyond the sync script's built-in idempotency self-check.**

## Performance

- **Duration:** ~12 min (canonical-doc write + sync-script write + idempotency verify + bookkeeping)
- **Started:** 2026-05-28T05:40:00Z
- **Completed:** 2026-05-28T05:52:00Z
- **Tasks:** 3 (canonical docs / sync script + shims / SUMMARY + state)
- **Files modified:** 3 (`.gitignore` + `STATE.md` + `ROADMAP.md`)
- **Files created:** 18 (7 canonical docs + 1 sync script + 6 Claude shims + 3 generic placeholder shims + this SUMMARY)

## Accomplishments

- **Canonical agent-agnostic docs at `docs/luse/`:**
  - `LUSE.md` (~3.4 KB / 85 lines): capability overview, when/when-not-to-use, prerequisites (Mini PC X session, Luse MCP server active per Phase 241, X11/xdotool/scrot stack — Wayland unsupported), 5-tool index table, safety preconditions, agent-agnostic guarantee.
  - `tools/click.md` (46 lines): inputs (`x`, `y`, optional `button`, optional `double`), output `{ok}` / `{ok:false, error}`, error reasons enumerated, screenshot-before / verify-after safety, minimal JSON example.
  - `tools/type.md` (47 lines): inputs (`text`, optional `delay_ms`), output, secret-handling warning (use clipboard path via `key` `ctrl+v`, never feed secrets through `text`), focus-window prerequisite, newline → `key` `return` advice.
  - `tools/screenshot.md` (58 lines): inputs (optional `region={x,y,w,h}`), output (`image_path` / `base64` either-or with size-based switching documented), PII-redaction warning, cheapest-tool guidance.
  - `tools/key.md` (59 lines): inputs (xdotool key syntax including modifier combos), common-keys reference, modifier-shortcut warnings (`super+l` locks screen, `alt+f4` closes window), paste-clipboard example for secrets.
  - `tools/scroll.md` (55 lines): inputs (`direction`, optional `amount`, optional `x,y` anchor), pointer-side-effect warning (anchored scroll moves pointer; subsequent clicks must pass explicit coords), overshoot guidance (prefer multiple small scrolls).
  - `LUSE-WORKFLOW.md` (~4.7 KB / 133 lines): full end-to-end worked example "open Settings app + toggle Wi-Fi off" with 7 numbered steps (each = screenshot OR action), failure-handling subsection (don't retry blindly, cap at 3 attempts), `key`-vs-`click` reliability guidance, scroll-iteration caps, secrets-via-clipboard pattern.
  - Tone: terse, factual, command-style — same voice as Phase 239 install-script comments per CONTEXT specification.
  - Agent-specific phrasing limited to one informational line in `LUSE.md` (line 4: enumerates the agents AionUi can dispatch — "Aion CLI, Claude Code, OpenCode, OpenClaw, or any other MCP-speaking client" — purely descriptive of the dispatcher's reach, not privileging any agent). All tool docs + workflow contain zero agent names. The single enumerative line is intentional and operator-facing; no shim wrapper needs to be different per-agent.

- **Idempotent sync script `scripts/sync-luse-skills.sh`:**
  - 213 lines, POSIX bash with `set -euo pipefail`, mode 0755.
  - Zero dependencies beyond stock UNIX tools (sha256sum OR shasum, head, grep, awk, cat, mkdir). No jq.
  - Portable sha256: `sha256_of_string` helper tries `sha256sum` first then falls back to `shasum -a 256` — works on Linux, macOS, and Git Bash on Windows (current operator host).
  - `read_existing_sha` extracts the `source-sha: <hex>` marker from the first 5 lines of any existing shim via grep + awk.
  - `write_shim` compares computed payload sha to existing-file sha; if equal → `UNCHANGED++` and skip; else → `NEW++` (new file) or `UPDATED++` (existing file rewritten).
  - Two payload shapes: per-tool shim (Claude Code style — one file per tool) and concatenated bundle (Aion / OpenCode / OpenClaw — single file with `## Tool: <name>` h2 sections separated by `---`).
  - Four agent generators wired:
    - `generate_claude_skill`: writes `.claude/skills/luse/SKILL.md` with proper YAML frontmatter (`name: luse`, `description: <one-liner>`, `source-sha: <hex>`) and HTML-comment "AUTO-GENERATED" header, plus 5 tool files with HTML-comment-only headers.
    - `generate_generic_shim` × 3 (Aion / OpenCode / OpenClaw): writes single-file `.md` with HTML-comment header documenting placeholder status + concatenated payload.
  - **Gemini intentionally skipped** with a script-level comment block explaining: "Gemini agents inside Liv AI discover Luse purely via MCP tool-discovery; the MCP server's tool descriptions reference docs/luse/tools/<name>.md for the canonical text."
  - Final stdout: `Synced N shims (M new / K updated / P unchanged)`.

- **9 shim files generated and committed:**

  | Shim | Lines | Purpose |
  | ---- | ----- | ------- |
  | `.claude/skills/luse/SKILL.md` | 95 | Claude Code skill entry (YAML frontmatter + LUSE.md body) |
  | `.claude/skills/luse/click.md` | ~50 | Claude tool ref (HTML-comment header + tool body) |
  | `.claude/skills/luse/type.md` | ~50 | " |
  | `.claude/skills/luse/screenshot.md` | ~60 | " |
  | `.claude/skills/luse/key.md` | ~60 | " |
  | `.claude/skills/luse/scroll.md` | ~55 | " |
  | `.aion/skills/luse.md` | ~570 | Aion CLI placeholder (HTML-comment header + concatenated payload) |
  | `.opencode/skills/luse.md` | ~570 | OpenCode placeholder (same shape) |
  | `.openclaw/skills/luse.md` | ~570 | OpenClaw placeholder (same shape) |

- **Idempotency verified:**
  - **First run:** `Synced 9 shims (9 new / 0 updated / 0 unchanged)` — all 9 files freshly written.
  - **Second run (no changes):** `Synced 9 shims (0 new / 0 updated / 9 unchanged)` — sha256 marker on every shim matched the recomputed canonical payload sha, nothing rewritten. Success criterion met verbatim.

- **`.gitignore` surgical exception:**
  - Original: `.claude/` blanket-ignored on line 45.
  - Updated to a 4-line double-negation hierarchy:
    ```
    .claude/*
    !.claude/skills/
    .claude/skills/*
    !.claude/skills/luse/
    ```
  - Result: `.claude/skills/luse/` is repo-tracked, every other `.claude/*` subdir (cloud, openui, primitives, runtime, setup, streaming, thread-list, tools, update, assistant-ui — all of which existed locally pre-Phase-242) stays local-only per the existing convention. Pattern documented in 242-SUMMARY.md key-decisions D-242-G for future per-skill repo-tracking calls.

- **Phase 241 cross-reference (no edit required):** Phase 241's MCP tool descriptions already surface tool names (`click`, `type`, `screenshot`, `key`, `scroll`) via standard MCP tool-discovery. The `docs/luse/` prose is the discoverable layer agents read AFTER tool-discovery returns a name. A future micro-phase could append a `See: docs/luse/tools/<name>.md` line to each Phase-241 MCP tool description for closer coupling — out of scope here. Original CONTEXT specifics estimated 4 tasks including this cross-edit (CONTEXT line 53); Phase 242 ships as 3 tasks per the executor's instruction set.

## Task Commits

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1 | Canonical docs (`docs/luse/LUSE.md` + 5 tool files + `LUSE-WORKFLOW.md`) | `a23017d9` (docs) |
| 2 | `sync-luse-skills.sh` + generated shims (9 files) + `.gitignore` exception | `1b1cd115` (feat) |
| 3 | This SUMMARY + STATE + ROADMAP bookkeeping | (this commit, docs) |

## Files Modified

- `.gitignore` — +3 lines: `.claude/*`, `!.claude/skills/`, `.claude/skills/*`, `!.claude/skills/luse/` (replaces the original single `.claude/` line with a 4-line negation hierarchy).
- `.planning/STATE.md` — Current Position rolled to Phase 242 SHIPPED 1/1; previous Phase 240 entry rolled down.
- `.planning/ROADMAP.md` — Phase 242 row: status `🟡 PLANNED 2026-05-27 (0/1 plans)` → `✅ SHIPPED 2026-05-28 (1/1 plan)` with ship evidence.

## Files Created

- 7 canonical docs under `docs/luse/` (LUSE.md, LUSE-WORKFLOW.md, tools/{click,type,screenshot,key,scroll}.md).
- `scripts/sync-luse-skills.sh` (executable, mode 0755).
- 9 generated shims (6 Claude + 3 generic placeholders).
- This SUMMARY.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `.gitignore` blocked Claude skill commit**
- **Found during:** Task 2 commit attempt.
- **Issue:** `.claude/` blanket-ignored on `.gitignore` line 45 prevented `git add .claude/skills/luse/`. Phase 242 success criteria explicitly requires `.claude/skills/luse/SKILL.md` to exist (and by implication be repo-tracked, since the SUMMARY references it as a Phase 242 deliverable).
- **Fix:** Replaced `.claude/` with a 4-line negation hierarchy that un-ignores exactly `.claude/skills/luse/` while keeping every other `.claude/*` subdir local. Pattern documented in D-242-G. No other `.claude/` content disturbed; `git ls-files .claude/` post-commit returns only the 6 luse files.
- **Files modified:** `.gitignore` (+3 net lines, 1 line replaced).
- **Commit:** `1b1cd115` (rolled into Task 2 commit).

### Scope reductions from CONTEXT.md

- **CONTEXT line 53 "Task 3: Update Phase 241 MCP tool descriptions to reference canonical docs"** — DROPPED per executor instruction set (3 tasks, not 4). Phase 241's MCP tool descriptions remain unchanged; the documentation layer is discoverable independently. If a future micro-phase wants the closer coupling, it's a one-line-per-tool sed.

## Deferred Items (out-of-scope for Phase 242)

- Aion CLI / OpenCode / OpenClaw native skill format wrappers — current shims are PLACEHOLDER single-file MDs with comment headers documenting placeholder status. Replace once each agent's skill format is determined.
- Gemini support — Gemini has no known skill system as of 2026-05-28. Gemini agents continue to discover Luse via MCP tool-discovery only. No file is shipped under `.gemini/`.
- Git pre-commit hook to auto-run `sync-luse-skills.sh` on canonical-doc commits — out of scope per CONTEXT line 63. Manual `bash scripts/sync-luse-skills.sh` is the workflow.
- Translation of `docs/luse/` to other languages — English-only per CONTEXT line 65.
- Adding `See: docs/luse/tools/<name>.md` lines to Phase 241 MCP tool descriptions — see D-242-F. Future micro-phase candidate.

## Verification

**Local code verification:**

| Check | Command | Result |
| ----- | ------- | ------ |
| Canonical docs exist | `ls docs/luse/` + `ls docs/luse/tools/` | LUSE.md + LUSE-WORKFLOW.md + 5 tool files PRESENT |
| Sync script exists + executable | `ls -la scripts/sync-luse-skills.sh` | mode 0755 ✅ |
| Sync script first run | `bash scripts/sync-luse-skills.sh` | `Synced 9 shims (9 new / 0 updated / 0 unchanged)` ✅ |
| Sync script idempotent | `bash scripts/sync-luse-skills.sh` (second run) | `Synced 9 shims (0 new / 0 updated / 9 unchanged)` ✅ — success criterion met |
| Claude skill dir | `ls .claude/skills/luse/` | SKILL.md + click.md + type.md + screenshot.md + key.md + scroll.md (6 files) ✅ |
| Aion shim | `ls .aion/skills/luse.md` | PRESENT ✅ |
| OpenCode shim | `ls .opencode/skills/luse.md` | PRESENT ✅ |
| OpenClaw shim | `ls .openclaw/skills/luse.md` | PRESENT ✅ |
| Gemini directory | `ls .gemini/` | does not exist (intentional — skip) ✅ |
| Agent-agnostic prose | `grep -rnE 'Claude\|Aion\|OpenCode\|Gemini\|OpenClaw' docs/luse/` | 1 hit (LUSE.md:4 — informational enumeration of dispatcher reach, not agent-privileging). All tool docs + workflow are pure agent-agnostic ✅ |
| source-sha markers present | `grep -rn 'source-sha:' .claude/skills/luse/ .aion/skills/ .opencode/skills/ .openclaw/skills/` | 9 hits (one per shim) ✅ |
| .gitignore exception | `git check-ignore -v .claude/skills/luse/SKILL.md; echo $?` | exit 1 (un-ignored) ✅ |
| Sacred blob SHA | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` | unchanged through Phase 242 — pre-commit hook `[sacred-sha] PASS: 20 files verified` on every commit ✅ |
| Task commits | `git log --oneline -3` | a23017d9 + 1b1cd115 + this commit ✅ |

## Self-Check: PASSED

Verified before final commit:
- `docs/luse/LUSE.md` — FOUND (created Task 1, 85 lines)
- `docs/luse/LUSE-WORKFLOW.md` — FOUND (created Task 1, 133 lines)
- `docs/luse/tools/click.md` — FOUND
- `docs/luse/tools/type.md` — FOUND
- `docs/luse/tools/screenshot.md` — FOUND
- `docs/luse/tools/key.md` — FOUND
- `docs/luse/tools/scroll.md` — FOUND
- `scripts/sync-luse-skills.sh` — FOUND (mode 0755, executable)
- `.claude/skills/luse/SKILL.md` + 5 tool files — FOUND (6 files, generated)
- `.aion/skills/luse.md` — FOUND (generated)
- `.opencode/skills/luse.md` — FOUND (generated)
- `.openclaw/skills/luse.md` — FOUND (generated)
- `.gemini/skills/` — INTENTIONALLY ABSENT (D-242-C)
- Sync script idempotent on second run (0 new / 0 updated / 9 unchanged) — VERIFIED
- Commit `a23017d9` — FOUND (Task 1 docs commit `docs(242-01): canonical Luse docs...`)
- Commit `1b1cd115` — FOUND (Task 2 feat commit `feat(242-02): sync-luse-skills.sh + generated agent shims`)
- Sacred blob SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` — PRESERVED through both commits (`[sacred-sha] PASS: 20 files verified` on both)
- Zero new dependencies — VERIFIED (no package.json touched, no node_modules churn)
- Phase 241 MCP tool descriptions intact (no edits performed per D-242-F)
- This SUMMARY.md — FOUND (this file)
