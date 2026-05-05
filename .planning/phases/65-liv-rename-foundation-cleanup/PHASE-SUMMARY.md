# Phase 65 — Liv Rename + Foundation Cleanup — PHASE SUMMARY (in progress)

**Status as of:** 2026-05-05 (post 65-04 + 65-06 landing — concurrent commits)
**Plans shipped:** 5/6 (65-01 + 65-02 + 65-03 + 65-04 + 65-06)
**Plans pending:** 65-05 (Mini PC migration script + LIVE CUTOVER user-walk)
**Sacred SHA:** `4f868d318abff71f8c8bfbcf443b2393a553018b` preserved across all 5 shipped plans
**Live cutover status:** PENDING — Mini PC `/opt/nexus/` still in pre-cutover layout; awaits 65-05

---

## Outcomes vs ROADMAP P65 success criteria

1. ✅ `git grep -i "nexus" liv/ livos/` returns 0 acceptable matches (allowed: archived planning docs, sacred file path historical refs, Phase 65 spec text describing the rename target). Achieved by 65-03 source sweep + 65-06 active doc update.
2. ⏳ All systemd units green on Mini PC after `/opt/nexus/` → `/opt/liv/` migration. Awaits 65-05 LIVE CUTOVER user-walk.
3. ⏳ Subscription Claude responds via `/v1/messages` post-rename. Awaits 65-05 smoke test.
4. ⏳ Mini PC migration script idempotent + rollback-ready (< 10 min target). Pending 65-05 script authoring (`scripts/migrate-nexus-to-liv.sh` + paired `scripts/rollback-liv-to-nexus.sh`).

---

## Per-plan summaries

| Plan | Status | Commit(s) | Notes |
|------|--------|-----------|-------|
| 65-01 | ✅ | (read-only preflight) | Sacred SHA `4f868d31...8b` baseline recorded; 65-01-PREFLIGHT.md captured Mini PC systemd state + repo file inventory. SUMMARY: `65-01-SUMMARY.md`. |
| 65-02 | ✅ | `31bde121` (commit) + `c08f7e9d` (docs SUMMARY) | Atomic `git mv nexus liv` + 6 package.json `@nexus/*` → `@liv/*` edits. Sacred SHA preserved through git rename detection. SUMMARY: `65-02-SUMMARY.md`. |
| 65-03 | ✅ | `4324c839` + `a62f31c2` + `ed38c138` + `4476385a` (4 refactor commits) + `b60b4b6f` (docs SUMMARY) | Source-code identifier sweep across 5 commit groups: livinityd imports, livos/skills imports, env vars + Redis prefix + comments + user strings + .env.example, user-visible follow-ups (onboard prompts + chat commands). Sacred SHA preserved at 8 checkpoints. `@liv/{core,worker,mcp-server,memory}` build clean. Livinityd typecheck baseline 358 pre-existing errors unchanged. SUMMARY: `65-03-SUMMARY.md`. |
| 65-04 | ✅ | `65d584dc` (refactor) + `c6640c12` (docs SUMMARY) | Build/deploy script rename. Single atomic commit. update.sh 35 changes; livos/install.sh 26 env-var renames; deploy.yml full delete-and-stub of legacy Server4 deploy job (per HARD RULE 2026-04-27); update-sh-smoke.yml 4 build pairs. pnpm-store glob `@nexus+core*` → `@liv+core*` confirmed. YAML validation passed via Python yaml.safe_load. SUMMARY: `65-04-SUMMARY.md`. |
| 65-05 | ⏳ | — | Pending. Plan body covers script authoring (`scripts/migrate-nexus-to-liv.sh` + paired rollback) PLUS Mini PC dry-run (autonomous-safe, single batched SSH session) PLUS LIVE CUTOVER (USER-WALK gate per CONTEXT execution_safety). Script authoring is autonomous-safe; cutover is human-supervised only. |
| 65-06 | ✅ | `4332e71a` (atomic doc commit) | Active documentation update. 6 repo doc files committed in single atomic commit (STATE.md + ROADMAP.md + v31-DRAFT.md + README.md + ONBOARDING.md + liv/HEARTBEAT.md). Memory file updated separately (outside git) with HARD RULES preserved verbatim. RENAME-13 marked complete. SUMMARY: `65-06-SUMMARY.md`. |

---

## Outstanding Items

1. **65-05 — Mini PC migration script authoring** (autonomous-safe). Script-write phase produces `scripts/migrate-nexus-to-liv.sh` + `scripts/rollback-liv-to-nexus.sh`.
2. **65-05 — Mini PC LIVE CUTOVER** (USER-SUPERVISED ONLY per CONTEXT execution_safety). After dry-run validates the script on Mini PC, the live cutover is a human-walk gate. Steps: stop liv-* services → rsync `/opt/nexus/` → `/opt/liv/` → update systemd `WorkingDirectory` → reload + restart → smoke test → archive `/opt/nexus/` → `/opt/nexus.archived-2026-MM-DD/`.

Phase 65 will be marked SHIPPED in ROADMAP.md once 65-05 (script-write phase) lands. The Mini PC live cutover is a separate user-walk gate that does not block plan-execution closure.

---

## Note on Plan Order

65-06 ran out-of-order ahead of 65-04 + 65-05 per user direction (current task brief). The rationale:

- Source tree is **already** renamed (post 65-02/03): `liv/` directory + `@liv/*` packages + `LIV_*` env vars + `liv:*` Redis prefixes + Liv user strings.
- Documentation now accurately describes that source-tree state.
- Deploy scripts (65-04) and Mini PC deployment paths (65-05) are independent of source-tree state — they have their own target deltas, captured in their own plan bodies.
- This documentation update was the lowest-risk plan in the phase (pure additive edits, no source touched), so executing it earlier increases continuity for future Claude sessions reading docs to understand current ground truth.

This out-of-order execution is documented in:
- `.planning/STATE.md` — Phase 65 progress block notes "65-06 ran out-of-order ahead of 65-04/65-05"
- `.planning/ROADMAP.md` — Phase 65 marked `[~]` (in-progress) with explicit per-criterion shipped/pending markers
- `65-06-SUMMARY.md` — Deviation #1 documents Rule 3 auto-adjustment

---

## Net file count touched (so far)

- 8 source `package.json` edits (65-02; 6 in `nexus/` rename + 2 livinityd/livos)
- ~38 source files (65-03; imports renamed)
- 5 source files (65-03; env vars + Redis prefix + comments + user strings + .env.example)
- 6 active doc files (65-06; STATE + ROADMAP + v31-DRAFT + README + ONBOARDING + liv/HEARTBEAT)
- 1 memory file (65-06; outside git, HARD RULES preserved verbatim)
- 0 archived planning docs touched (D-15 honored — verified by `git diff --name-only HEAD~7..HEAD` containing zero `.planning/milestones/v*-phases/` or `.planning/phases/01-*..64-*` paths)

**Pending after 65-04 + 65-05:**
- 3 deploy scripts (`update.sh` + `livos/install.sh` + `.github/workflows/deploy.yml`)
- 2 NEW migration scripts (`scripts/migrate-nexus-to-liv.sh` + `scripts/rollback-liv-to-nexus.sh`)

---

## Sacred SHA verification

- **At phase start (65-01):** `4f868d318abff71f8c8bfbcf443b2393a553018b` baseline recorded.
- **After 65-02 (git mv):** `4f868d318abff71f8c8bfbcf443b2393a553018b` — preserved through git rename detection (file path changed `nexus/packages/core/src/sdk-agent-runner.ts` → `liv/packages/core/src/sdk-agent-runner.ts` but blob SHA unchanged).
- **After 65-03 (4 refactor commits):** `4f868d318abff71f8c8bfbcf443b2393a553018b` — 8 checkpoints all green per 65-03-SUMMARY.
- **After 65-06 (this plan):** `4f868d318abff71f8c8bfbcf443b2393a553018b` — verified at each task gate (start of Task 1, end of Task 1, end of Task 2, mid Task 3, end of Task 3).

**Sacred file content has not been modified since baseline. The path changed via `git mv`; the content (SHA) did not.**
