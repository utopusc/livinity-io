---
phase: 65-liv-rename-foundation-cleanup
plan: 06
subsystem: docs
tags: [rename, docs, state, claude-md, readme, memory, RENAME-13]
requires: [65-02, 65-03]
provides: [active-docs-aligned-with-post-rename-source-tree, memory-aligned-hard-rules-preserved]
affects: [.planning/STATE.md, .planning/ROADMAP.md, .planning/v31-DRAFT.md, README.md, ONBOARDING.md, liv/HEARTBEAT.md, MEMORY.md (outside git)]
tech-stack:
  added: []
  patterns: [judgment-call-find-replace, hard-rule-preservation, archived-docs-untouched]
key-files:
  created:
    - .planning/phases/65-liv-rename-foundation-cleanup/PHASE-SUMMARY.md
    - ONBOARDING.md (was previously untracked; now committed for the first time)
  modified:
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/v31-DRAFT.md
    - .planning/REQUIREMENTS.md
    - README.md
    - liv/HEARTBEAT.md
    - C:/Users/hello/.claude/projects/C--Users-hello-Desktop-Projects-contabo-livinity-io/memory/MEMORY.md (outside git)
decisions:
  - 65-06-D1: Out-of-order execution ahead of 65-04/65-05 per user brief — Rule 3 deviation documented; STATE/ROADMAP describe post-65-02/03 source-tree state and explicitly call out 65-04/05 as pending
  - 65-06-D2: HARD RULES (lines starting with `> **HARD RULE` or `> **CORRECTED`) in MEMORY.md preserved verbatim including all `nexus`/`Server4` substrings (D-15)
  - 65-06-D3: Historical decision-log entries in STATE.md with `nexus/` path refs updated to `liv/` post-65-02 paths with explicit "(was @nexus/core pre-65-02 rename)" annotations — keeps grep-discoverability of the rename in the decision log without falsifying the historical narrative
  - 65-06-D4: ONBOARDING.md was untracked at 65-06 start; staged + committed as new file (rather than left untracked); contained legitimate project-onboarding content
  - 65-06-D5: Phase 65 marked `[~]` (in-progress) in ROADMAP rather than `[x]` (complete) because 65-04 + 65-05 are still pending; per-criterion shipped/pending markers added inline to the success criteria block
metrics:
  duration_minutes: ~15
  completed: 2026-05-05T15:50Z
  files_modified: 7
  files_created: 2
  commits: 1 (atomic doc commit `4332e71a`)
---

# Phase 65 Plan 06: Post-Rename Documentation Update — Summary

**One-liner:** Active project docs (STATE/ROADMAP/v31-DRAFT/README/ONBOARDING/liv-HEARTBEAT) and Claude memory file aligned with post-65-02/03 source-tree state (`liv/` + `@liv/*` + `LIV_*` + `liv:*`); HARD RULES preserved verbatim; archived planning docs untouched per D-15.

---

## What was done

### Task 1: STATE.md + ROADMAP.md + v31-DRAFT.md + REQUIREMENTS.md

**`.planning/STATE.md`:**
- YAML frontmatter `status:` updated to "Phase 65 source-tree rename complete (65-01..65-03 shipped + 65-06 docs); 65-04 + 65-05 pending; active docs reflect liv/ paths per RENAME-13"
- `last_updated:` bumped to 2026-05-05T15:49Z
- `last_activity:` updated to 65-06 entry
- `progress.completed_plans:` 73 → 74 (65-06 shipped); `percent:` 83 → 84
- `**Current milestone:**` line: `Nexus → Liv rename` → `Liv rename (was Nexus)` (description-style historical correctness)
- `Current Position` block: phase progress 3/6 → 4/6 plans complete; explicit list of completed (01/02/03/06) and pending (04/05)
- New `## Phase 65 Progress` block (mirroring sibling phase progress blocks) listing per-plan status with commits
- New `## Phase 65 Outstanding Items` block listing 65-04 (autonomous-safe) + 65-05 (script-write autonomous-safe + LIVE CUTOVER user-supervised)
- Historical decision-log entries (P67-01/04, P67-03, P72-native-05, P73-04, P68-01, P76-03, P76-06): `@nexus/core` import path refs → `@liv/core` with explicit "(was @nexus/core pre-65-02 rename)" annotations to keep grep-discoverability of the rename in the log
- "Sacred file note" line in Mini PC Server / Infra Reference: explicit annotation that Mini PC `/opt/nexus/` is the pre-65-05 layout and 65-05 will migrate it via `scripts/migrate-nexus-to-liv.sh`

**`.planning/ROADMAP.md`:**
- Phase 65 checklist line: `- [ ]` → `- [~]` (in-progress, NOT complete) + appended `**Progress 2026-05-05:**` annotation listing 4/6 plans shipped
- Phase 65 Phase Details section: new `**Progress (2026-05-05):**` line under Goal listing shipped/pending plans + sacred SHA preservation note
- Per-criterion shipped/pending markers on success criteria 1-4 (criterion 1 ✅ achieved by 65-03; 2-4 ⏳ awaits 65-05)

**`.planning/v31-DRAFT.md`:**
- Top-of-file breadcrumb added (line 3, blockquote): "P65 IN PROGRESS 2026-05-05 — 4/6 plans shipped..."
- P65 spec content (lines 122-181 in current file) PRESERVED VERBATIM as historical record (per plan must-haves)

**`.planning/REQUIREMENTS.md`:**
- RENAME-13 marked complete with annotation: "shipped 65-06 commit `4332e71a` — STATE/ROADMAP/v31-DRAFT/README/ONBOARDING/HEARTBEAT updated; MEMORY.md updated separately with HARD RULES preserved verbatim; archived planning docs untouched per D-15"

### Task 2: README.md + ONBOARDING.md + liv/HEARTBEAT.md

**`README.md` (repo root, 13740 bytes):**
- Project description: "LivOS features **Nexus**, an integrated AI assistant" → "LivOS features **Liv**, an integrated AI assistant"
- "AI Assistant (Nexus)" section heading → "AI Assistant (Liv)"
- Install instructions: `cd ../nexus` → `cd ../liv`; "Install Nexus dependencies" → "Install Liv dependencies"
- Server Ports table: `API_PORT` description "Nexus API server port" → "Liv API server port"
- Paths table: `NEXUS_BASE_DIR` → `LIV_BASE_DIR` (default `/opt/liv`); `NEXUS_SKILLS_DIR` → `LIV_SKILLS_DIR`; `NEXUS_WORKSPACE_DIR` → `LIV_WORKSPACE_DIR` (descriptions also renamed)
- Service URLs table: `NEXUS_API_URL` → `LIV_API_URL`
- Architecture diagram (monorepo structure): `└── nexus/` → `└── liv/`; "Nexus skill definitions" → "Liv skill definitions"
- Service architecture diagram: `Nexus API` → `Liv API` box label
- Key Components table: "Nexus Core" → "Liv Core"

**`ONBOARDING.md` (repo root, 3916 bytes; was untracked, now committed for first time):**
- Codebases checklist: `(main monorepo: livos/ + nexus/)` → `(main monorepo: livos/ + liv/)`
- All other content preserved verbatim (skills tips, MCP servers, workflow, instruction-for-Claude block)

**`liv/HEARTBEAT.md` (under `liv/` per user brief, 643 bytes):**
- Title: `# Nexus Heartbeat Tasks` → `# Liv Heartbeat Tasks`
- Body: `Add tasks below that Nexus should monitor` → `that Liv should monitor`
- Body: `Nexus will check each one` → `Liv will check each one`

### Task 3: MEMORY.md (outside git) + atomic commit + PHASE-SUMMARY

**`C:/Users/hello/.claude/projects/C--Users-hello-Desktop-Projects-contabo-livinity-io/memory/MEMORY.md`:**

HARD RULES preserved verbatim:
- Line 23 (`> **HARD RULE 2026-04-27 (user-confirmed):** **Server 4 is NOT yours.** ...`) — UNCHANGED. Contains `Server4` and `nexus` substrings — preserved.
- Line 25 (`> **CORRECTED 2026-04-26:** ...`) — UNCHANGED.

Other content updated:
- Project Overview: `Monorepo: livos/ (pnpm) + nexus/ (npm)` → `livos/ (pnpm) + liv/ (npm)` + annotation "renamed from `nexus/` 2026-05-05 via Phase 65 (sacred SHA `4f868d31...` preserved through `git mv`)"
- Server4 section: code-layout description annotated with "(Mini PC current state — pre-65-05 cutover)" and "65-05 will migrate `/opt/nexus/` → `/opt/liv/` via `scripts/migrate-nexus-to-liv.sh`"
- systemd services line: `liv-core.service (nexus core dist, port 3200)` → `liv-core.service (liv core dist, port 3200)`
- Deployment line: `builds @livos/config, UI (vite), nexus core/worker/mcp-server (tsc)` → `builds @livos/config, UI (vite), liv core/worker/mcp-server (tsc)` + annotation that source tree renamed 2026-05-05; update.sh awaits 65-04 patch
- update.sh pnpm-store quirk: paths updated to post-cutover steady state (`@liv+core*`, `/opt/liv/packages/core/dist`, `node_modules/@liv/core`) with "(Pre-65-05 cutover, the on-Mini-PC paths are still `@nexus+core*` and `/opt/nexus/`...)"
- LIV_API_KEY line: `/opt/nexus/app/start-core.sh` → `/opt/liv/app/start-core.sh`
- Pre-existing breakage line: `liv-memory.service ... /opt/nexus/packages/memory/dist/index.js` → `/opt/liv/packages/memory/dist/index.js` + annotation "(On Mini PC pre-65-05 cutover this path is still `/opt/nexus/packages/memory/dist/index.js`)"
- Kimi AI Provider section: `Provider file: nexus/packages/core/src/providers/kimi.ts` → `liv/packages/core/src/providers/kimi.ts`; Redis keys `nexus:config:kimi_api_key`/`nexus:kimi:authenticated` → `liv:config:kimi_api_key`/`liv:kimi:authenticated`
- Key Technical Notes: `Nexus API` → `Liv API`; `nexus-core runs compiled JS` → `liv-core runs compiled JS`
- Deployment section: PM2 process names retired in favor of systemd unit names (`pm2 restart nexus-core` → `systemctl restart liv-core`; `pm2 restart livos` → `systemctl restart livos`); PM2 nvm-source line removed (no longer applicable; current Mini PC uses systemd)
- Drift / Pitfall Memories: capability-registry-prefix entry updated `nexus:cap:*` → `liv:cap:*` post Phase 65-03 (with "was nexus:cap:* pre-rename" breadcrumb)
- New entry appended at bottom: "[Phase 65 Liv rename in progress](feedback_p65_rename_complete.md) — 2026-05-05: ..." (multi-line breadcrumb covering source-tree status, sacred SHA preservation, subscription path D-07 verification, pending 65-04/05, HARD RULES preservation note)

**Verification (post-edit):**
- `node -e ...` checked memory file: `hasLiv: true HARD RULES: 1 CORRECTED: 1` — original count of HARD RULES + CORRECTED markers preserved.

**Atomic commit:** Single git commit `4332e71a` for all 6 repo-tracked doc files. Memory file edited directly (outside git, no commit).

**PHASE-SUMMARY.md:** Written to `.planning/phases/65-liv-rename-foundation-cleanup/PHASE-SUMMARY.md` documenting phase-level rollup of all 6 plans + outstanding items + sacred SHA verification across phase.

---

## Deviations from Plan

### 1. [Rule 3 - Blocking issue] Out-of-order execution ahead of 65-04/65-05

- **Found during:** Plan startup
- **Issue:** Plan 65-06 declares `depends_on: [65-05]` and many must-haves describe "Phase 65 marked SHIPPED" / "live cutover status COMPLETED|PENDING". Reality: 65-04 + 65-05 have NOT been executed yet (no commits, no SUMMARY files). User brief explicitly says "65-02 + 65-03 + 65-04 (or in-flight) done" — meaning user is aware 65-04 may not be complete.
- **Fix:** Executed plan against actual ground truth (4/6 plans complete after this run). Updated STATE.md/ROADMAP.md to reflect Phase 65 as `[~]` in-progress (NOT `[x]` complete); added explicit notes about out-of-order execution + 65-04/05 pending status; per-criterion shipped/pending markers added to ROADMAP success criteria.
- **Files modified:** `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/v31-DRAFT.md`, this SUMMARY, `PHASE-SUMMARY.md`
- **Commit:** `4332e71a`

### 2. [Rule 3 - Blocking issue] CLAUDE.md does not exist at repo root

- **Found during:** Task 2 read_first
- **Issue:** Plan 65-06 lists `CLAUDE.md` (repo root) as a target file. `ls` confirmed no such file exists in repo root, no `liv/CLAUDE.md`, no nested `**/CLAUDE.md` anywhere in tracked tree.
- **Fix:** Skip the CLAUDE.md edit. Document in this SUMMARY that the file simply doesn't exist; future Claude sessions read project-level CLAUDE instructions from the user's persistent memory file (which IS being updated as part of Task 3).
- **Files modified:** None (file absent)

### 3. [Rule 3 - Blocking issue] HEARTBEAT.md location

- **Found during:** Task 2 read_first
- **Issue:** Plan 65-06 lists `HEARTBEAT.md` (repo root) as a target. `ls` confirmed no `HEARTBEAT.md` at repo root. Glob found `liv/HEARTBEAT.md` (post 65-02 git mv from `nexus/HEARTBEAT.md`).
- **Fix:** Targeted `liv/HEARTBEAT.md` per user brief explicit option ("liv/HEARTBEAT.md if exists OR repo-root if exists"). Edit applied; staged + committed in atomic doc commit.
- **Files modified:** `liv/HEARTBEAT.md`

### 4. [Rule 2 - Auto-add missing critical functionality] REQUIREMENTS.md RENAME-13 mark-complete

- **Found during:** Task 3 verification
- **Issue:** RENAME-13 was the requirement satisfied by this plan but was still `[ ]` unchecked in REQUIREMENTS.md. Without marking it complete, the requirements traceability would be inconsistent with what was just shipped.
- **Fix:** Marked `[x]` with annotation referencing this plan's commit + completed scope.
- **Files modified:** `.planning/REQUIREMENTS.md`
- **Commit:** Included in `4332e71a` atomic commit (REQUIREMENTS.md was added to the staged set late but landed in same commit).

### 5. [Rule 3 - Out of scope deferred] Sibling-agent worktree race-condition

- **Found during:** `git status` at commit time
- **Issue:** Massive (~600 file) "deleted" + "untracked" file list in `git status` from concurrent worktrees that are running other phases (65, 68, 69, 70, 71, 72, 73, 74, 75, 76 plans). Per `<destructive_git_prohibition>` and the established 68-05/68-06/68-07/70-06/70-07 pattern of decisions, these are NOT 65-06's files and must not be touched.
- **Fix:** Staged ONLY the 6 files my plan owns by explicit name (`git add` with explicit paths, no `git add -A` / `git add .`). Untracked files left alone; deleted files left alone. The 6-file commit is exactly what 65-06 changed.
- **Files modified:** None additional (deferred to whichever sibling agent owns those files).

---

## Final v31-DRAFT line 166 gate (max-scope grep)

Command:
```bash
git grep -i 'nexus' -- ':!.planning/milestones/' ':!.planning/phases/01-*..64-*' \
  ':!.planning/phases/65-*/65-CONTEXT.md' ':!.planning/phases/65-*/65-*-PLAN.md' \
  ':!**/dist/**' ':!**/node_modules/**' ':!.claude/worktrees/**' \
  ':!liv/packages/core/src/sdk-agent-runner.ts'
```

Remaining matches (all accountable; documented per plan):

| File | Hits | Reason for keeping |
|------|------|--------------------|
| `.github/workflows/deploy.yml` | 1 | Pending 65-04 patch (out of 65-06 scope per `<scope_guard>`). |
| `.planning/BACKLOG.md` | ~10 | Historical bug-pattern documentation describing pre-cutover Mini PC pnpm-store quirk. Each entry is a still-valid breadcrumb of how the Mini PC currently is. |
| `.planning/MILESTONES.md` | ~30 | Archived milestone retrospectives (v6.0 - v30.0). D-15: archived plans+summaries — historical record. Sacred file path "nexus/packages/core/src/sdk-agent-runner.ts" mentions are HISTORICAL references to where the file lived during v29-v30 phases — renaming would falsify the historical record. |
| `.planning/PROJECT.md` | ~15 | Milestone archive + v31 description that's intentionally describing the rename ("Replace Nexus identity with Liv"). All historical-correct. |
| `.planning/REQUIREMENTS-v1.1.md`, `-v2.0.md`, `-v3.0.md` | 4 | Versioned/archived requirements docs (historical). |
| `.planning/REQUIREMENTS.md` | 11 | RENAME-* checklist items — must mention `nexus` because the requirements describe the source-to-target rename. RENAME-13 marked `[x]` by this plan. |
| `.planning/RETROSPECTIVE.md` | ~5 | Archived retrospectives (Phase 23, 41, etc.) describing how nexus's SdkAgentRunner was reused via Strategy B HTTP-proxy bridge. Historical-correct. |
| `.planning/ROADMAP-v1.1.md`, `-v3.0.md` | 2 | Versioned/archived roadmaps. |
| `.planning/ROADMAP.md` | 4 | This plan's own edits — Phase 65 description + per-criterion markers explicitly mention the rename target. |
| `.planning/STATE.md` | ~14 | This plan's own edits — explicit historical breadcrumbs in Phase 65 progress block + decision-log path-rename annotations + Mini PC pre-cutover state notes. |
| `.planning/TEST-PLAN.md` | 3 | Archived test plan (versioned). |

**Net:** Zero unintentional remaining matches. Every hit falls into one of the plan's allowed categories: (a) intentional historical breadcrumbs, (b) phase-description text describing the rename target, (c) Server4 disabled-comments inside HARD RULES (untouched), (d) versioned/archived planning docs.

---

## Key Decisions

- **65-06-D1 (out-of-order):** 65-06 ran ahead of 65-04/65-05 per user brief. Documentation describes post-65-02/03 source-tree state honestly; deploy/migration paths flagged as still-pending. Phase 65 marked `[~]` in-progress, NOT `[x]` complete.
- **65-06-D2 (HARD RULES verbatim):** MEMORY.md HARD RULE (line 23) and CORRECTED (line 25) preserved EXACTLY including their `Server4`/`nexus` substrings. D-15 user-locked invariants honored.
- **65-06-D3 (decision-log path annotations):** Historical decision logs in STATE.md (P67/P72/P73/P76/P68 entries) had `@nexus/core` import-path references updated to `@liv/core` with explicit "(was @nexus/core pre-65-02 rename)" annotations. Maintains grep-discoverability of the rename without falsifying the historical narrative.
- **65-06-D4 (ONBOARDING.md as new file):** ONBOARDING.md was untracked at plan start; committed as a new file (substantive 70-line onboarding content). Alternative would be leaving it untracked; chose to commit since the rename edit is now permanent and the file content is legitimate.
- **65-06-D5 (per-criterion markers in ROADMAP):** Rather than mark Phase 65 success criteria as a single ✅/⏳ pair, broke out each of the 4 criteria with shipped/pending markers (criterion 1 ✅ by 65-03; 2-4 ⏳ awaits 65-05). More accurate communication of partial progress.

---

## Post-Plan Note: Parallel 65-04 Landing

Between this plan's atomic commit (`4332e71a`) and this SUMMARY write, a sibling agent landed plan 65-04 (commits `65d584dc` + `c6640c12`). That commit:
- Updated STATE.md status + last_activity to "65-04 shipped" (overrode parts of this plan's STATE.md edits, but the structural Phase 65 progress block + decision-log path-rename annotations + Mini PC `/opt/nexus/` annotations all remain intact).
- Marked RENAME-09/10/11 complete in REQUIREMENTS.md (in addition to RENAME-13 from this plan).
- Bumped completed_plans 74 → 75; percent 84 → 85.

This is the same parallel-worktree race-condition pattern documented in 68-05 D-RACE / 68-06 D-RACE / 70-06 D-LEAK. Per `<destructive_git_prohibition>` no `git reset --hard` was invoked. The outcome is **net positive**: phase progress is now accurate at 5/6 plans complete; only 65-05 (Mini PC migration script + LIVE CUTOVER user-walk) remains. Phase 65 SHIPPED is one plan away.

**Net commits owned by 65-06:** `4332e71a` (this plan's atomic doc commit). PHASE-SUMMARY.md text below describes the 4-of-6 state at this plan's commit time; current ground truth is now 5/6 with 65-04 also shipped (PHASE-SUMMARY.md content is preserved as historical record of this plan's run; future Claude reading the file should consult `.planning/STATE.md` for current ground truth).

---

## Self-Check: PASSED

- ✅ `.planning/STATE.md` — exists, contains "Phase 65 source-tree rename complete" + "65-06 ✅" + "@liv" — verified.
- ✅ `.planning/ROADMAP.md` — exists, contains `[~] **Phase 65: Liv Rename` + `**Progress (2026-05-05):**` annotation — verified.
- ✅ `.planning/v31-DRAFT.md` — exists, contains "P65 IN PROGRESS 2026-05-05" top-of-file breadcrumb — verified.
- ✅ `.planning/REQUIREMENTS.md` — exists, contains `[x] **RENAME-13` — verified.
- ✅ `README.md` — exists, contains "AI Assistant (Liv)" + `└── liv/` + `LIV_BASE_DIR` — verified.
- ✅ `ONBOARDING.md` — exists, contains `livos/ + liv/` — verified.
- ✅ `liv/HEARTBEAT.md` — exists, contains `# Liv Heartbeat Tasks` — verified.
- ✅ `MEMORY.md` (outside git) — exists, contains `@liv/core`, HARD RULE count = 1 (verbatim), CORRECTED count = 1 (verbatim) — verified via node script.
- ✅ Atomic commit `4332e71a` exists in `git log` — verified (`git log --oneline -3`).
- ✅ Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` preserved at end of plan — verified.
- ✅ `PHASE-SUMMARY.md` — exists, contains "Phase 65 — Liv Rename + Foundation Cleanup — PHASE SUMMARY" header — verified.

---

## Sacred SHA verification

| Gate | Time | SHA | Result |
|------|------|-----|--------|
| Plan start | Task 1 start | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✅ baseline |
| Task 1 end / Task 2 start | mid-plan | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✅ preserved |
| Task 2 end / Task 3 start | mid-plan | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✅ preserved |
| Task 3 mid (post-commit) | after `4332e71a` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✅ preserved |
| Plan end | final | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✅ preserved |

---

**RENAME-13 satisfied.** Phase 65 will be marked SHIPPED in ROADMAP.md once 65-04 + 65-05 (script-write phase) land.
