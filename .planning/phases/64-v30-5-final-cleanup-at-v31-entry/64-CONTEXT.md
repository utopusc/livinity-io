# Phase 64: v30.5 Final Cleanup at v31 Entry - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** Autonomous (`--auto`) — decisions locked from `.planning/v31-DRAFT.md` recommendations and prior memory

<domain>
## Phase Boundary

Resolve all v30.0 carry-forward items so v31.0 doesn't build on a half-broken state:

1. **Suna sandbox network blocker (F7)** — `kortix-api` cannot reach `kortix-sandbox` over Docker bridge; "Navigate to google.com" smoke test fails through Suna UI. Fix and verify on Mini PC.
2. **14 carryforward UATs** — 4× v29.5, 4× v29.4, 6× v29.3 verification documents that were never live-walked. Each must be classified `verified-by-script` / `needs-human-walk` / `failed`. **Never silently treat `human_needed` as `passed`** (per `feedback_milestone_uat_gate.md`).
3. **Phase 63 R-series formal walkthrough** — 11 plans (R3.1..R3.11) of v30.0 broker professionalization. Same classification rule as #2.
4. **External client compat matrix** — single tabular doc covering Bolt.diy, Cursor, Cline, Continue.dev, Open WebUI: auth modes, streaming behavior, tool-calling protocol, known quirks.
5. **3 v28.0 quick-tasks** — `260425-sfg`, `260425-v1s`, `260425-x6q` — review each, resolve if trivial or move to BACKLOG.md with rationale.

**Out of scope:** New code features (those are P65+). v30.5 informal scope items F2/F3/F4/F5 (those are P74). Bytebot/Suna/computer-use UI work (P71+).

</domain>

<decisions>
## Implementation Decisions

### Suna sandbox network blocker (F7)
- **D-01:** Fix approach is the **env-override candidate (3) from v31-DRAFT line 107**: set `KORTIX_SANDBOX_URL=http://host.docker.internal:14000` in the Suna compose template. Sidesteps Docker DNS entirely. Lower risk than patching Suna source.
- **D-02:** **Validation order:** (a) live-test candidate (1) on Mini PC first — `docker network connect suna_default kortix-sandbox` to confirm the diagnosis; (b) once confirmed, ship candidate (3) as the permanent fix in `livinity-apps` repo's Suna manifest; (c) if `host.docker.internal` is unavailable on the Mini PC's Linux Docker, fall back to candidate (2) source patch.
- **D-03:** Smoke test is **"Navigate to google.com"** through the Suna UI in the user's browser — this is a `needs-human-walk` UAT item. The agent will: deploy the fix, run scriptable verifications (curl from kortix-api container to kortix-sandbox port), and document the human-walk smoke test for the user.

### 14 UAT walks (v29.3-v29.5 carryforward)
- **D-04:** Each UAT gets a status line in a new `.planning/phases/64-.../64-UAT-MATRIX.md`: file path, owning phase, status (`script-verified` / `needs-human-walk` / `failed` / `obsolete`), evidence (commit/log/curl output for `script-verified`; manual steps + expected outcome for `needs-human-walk`).
- **D-05:** **Hard rule:** any UAT that fundamentally requires a real browser (UI rendering, PWA cache, click flows) is classified `needs-human-walk` — NEVER `script-verified`. The `feedback_milestone_uat_gate.md` lesson is canonical: v29.4 shipped broken because `human_needed` was silently treated as `passed`.
- **D-06:** Scriptable UATs to attempt (best-effort): API-level checks (curl), service health (systemctl status), Redis state (redis-cli), DB state (psql), tool-registry presence (livinityd `/v1/tools` enumeration). UI-level checks defer to human walk.

### Phase 63 R-series walkthrough (11 plans)
- **D-07:** Same matrix format as UATs. R3.1..R3.11 each get a status line. Most R-series plans were code-only changes — those are auto-pass via test:phaseN suite where present, or commit-existence verification where not.
- **D-08:** R-series plans that require live broker tool routing tests (e.g., R3.11 `/v1/messages` translation) get a curl-based scriptable test against the user's broker on Mini PC. Successful curls go to `script-verified` with the response body cited.

### External client compat matrix
- **D-09:** Output: `.planning/docs/external-client-compat.md` (single file, no subdirectory yet — first compat doc).
- **D-10:** Format: markdown table, one row per client (Bolt.diy, Cursor, Cline, Continue.dev, Open WebUI), columns: `Auth mode`, `Endpoint`, `Streaming`, `Tool calls`, `Verified status` (✓/✗/?), `Known quirks`, `Reference commit/PR`.
- **D-11:** Source of truth for compat data: existing memory entries (`reference_broker_protocols_verified.md`, `feedback_subscription_only.md`), v30.0 phase summaries, and live curl tests where memory is stale (`reference_broker_protocols_verified.md` is dated 2026-05-03 — reverify with `Bash` curl against api.livinity.io if uncertainty arises).
- **D-12:** Doc explicitly notes which clients have an open carryover (Bolt plain-text bug → carries to P74 if not closed by F2-F5).

### 3 v28.0 quick-tasks
- **D-13:** Decision per task: read `.planning/quick/{task}/PLAN.md` (and SUMMARY if any), check current code state for the relevant file paths, decide:
  - **Resolve:** the issue is trivially fixable now or already fixed (verify via grep/test) → write SUMMARY.md, commit fix if needed, mark complete.
  - **Backlog:** non-trivial or out of scope for v31 entry → append to `.planning/BACKLOG.md` with the original PLAN.md context preserved, then archive the quick-task dir.
- **D-14:** Default lean is **resolve** if the file paths in the quick-task are obviously unchanged or fixable in <30min; **backlog** otherwise.

### Claude's Discretion
- File naming inside the phase dir (matrix files, intermediate scratch).
- Exact curl/scriptable verification command shapes (use simplest sufficient form).
- Whether to combine UAT-MATRIX and R-MATRIX into one file or two — single file preferred for grep-ability.
- Commit granularity: one commit per major artifact (UAT matrix, R matrix, compat doc, Suna fix, each quick-task resolution) so any single commit is reverpable.

</decisions>

<specifics>
## Specific Ideas

- "Never declare milestone passed without UAT" is the canonical lesson — it must be honored even under `--auto`. Better to surface 8 `needs-human-walk` items honestly than fake `script-verified` for items that need a browser.
- v31-DRAFT.md line 116 estimates this phase at 1-3 hours. That's optimistic if the Suna fix needs source-patch fallback. Plan for 1-3h scriptable + a documented human-walk handoff for browser items.
- Compat matrix is a one-shot reference doc — no incremental scope. Write it once, link it from PROJECT.md, done.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and recommendations
- `.planning/v31-DRAFT.md` §P64 (lines 100-117) — Suna fix candidate ranking, deliverables, estimate
- `.planning/ROADMAP.md` §"Phase 64" (lines 80-93) — phase goal + 5 success criteria
- `.planning/STATE.md` §"Deferred Items" (lines 72-86) — original carry-forward source

### Suna sandbox blocker (F7)
- `.planning/v31-DRAFT.md` §P64 (lines 104-108) — three fix candidates with risk ranking

### UAT carry-forward sources
- `.planning/milestones/v29.3-phases/` — 6× v29.3 VERIFICATION.md files
- `.planning/milestones/v29.4-phases/` — 4× v29.4 VERIFICATION.md files
- `.planning/milestones/v29.5-phases/` — 4× v29.5 VERIFICATION.md files
- `.planning/v29.4-REGRESSIONS.md` — autopsy of the milestone-without-UAT failure mode

### Phase 63 R-series source
- `.planning/milestones/v30.0-phases/63-*/` — Phase 63 plan + summary files (R3.1..R3.11)

### Compat matrix data
- Memory: `reference_broker_protocols_verified.md` (2026-05-03 live curl proofs)
- Memory: `feedback_subscription_only.md` (D-NO-BYOK constraint)
- Memory: `project_v30_5_resume.md` (v30.5 close state — F2-F5 deferred to P74)

### Quick tasks
- `.planning/quick/260425-sfg-v28-0-hot-patch-bundle-tailwind-sync-bg-/PLAN.md`
- `.planning/quick/260425-v1s-v28-0-hot-patch-round-2-activity-overflo/PLAN.md`
- `.planning/quick/260425-x6q-v28-0-hot-patch-round-3-window-only-nav-/PLAN.md`

### UAT discipline
- Memory: `feedback_milestone_uat_gate.md` — never silently mark `human_needed` as `passed`

### Server/infra reference
- Memory: `reference_minipc_ssh.md` — SSH command for Mini PC
- `.planning/STATE.md` §"Mini PC" (lines 89-97) — service layout, env, fail2ban guidance
- Memory: `feedback_ssh_rate_limit.md` — batch SSH calls, fail2ban-aware

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets
- **livinity-apps repo** (separate GitHub repo: `utopusc/livinity-apps`) — Suna manifest lives here. Fix lands in the manifest's `docker_compose` field (jsonb).
- **Mini PC `update.sh`** — `/opt/livos/update.sh`. Has known quirks (pnpm-store first-match dir per `MEMORY.md`). Don't modify it for this phase; just use it.
- **Server5 `apps` table** (PostgreSQL `platform.apps`) — contains 26 published apps. Suna fix updates this row's `docker_compose` field. Template SQL: `scripts/suna-insert.sql`.
- **`.planning/BACKLOG.md`** — append new backlog items (used by quick-task triage).

### Established patterns
- VERIFICATION.md frontmatter convention: `status: passed | human_needed | gaps_found | failed`. Any new matrix doc here follows the same vocabulary so audit-milestone can parse it.
- Phase summary convention: one SUMMARY.md per plan, linked from STATE.md updates.
- Subscription-only path is sacred (`feedback_subscription_only.md`). No phase-64 work touches the broker code path; Suna fix is config-only.

### Integration points
- **Mini PC** — only deploy target. SSH single-batch sessions per `feedback_ssh_rate_limit.md`. Run scripted verifications batched.
- **Server5** — `apps` table for the public Suna manifest update (D-NO-SERVER4 hard rule still applies; never touch Server4).

</code_context>

<deferred>
## Deferred Ideas

- **F2-F5 (token cadence streaming, multi-turn tool_result, Caddy timeout, identity preservation)** — these are P74 (BROKER-CARRY). Phase 64 only flags them in compat doc; no fix work here.
- **"Compat matrix as a generated artifact"** (one-test-per-row CI) — out of scope. Written by hand in P64; future automation is a post-v31 idea, log to BACKLOG.md if it comes up.
- **Bytebot integration** — P71. Phase 64 only ensures Suna's existing browser path works.
- **Computer-use Mini PC infra hardening** — P71/P72.

</deferred>

---

*Phase: 64-v30-5-final-cleanup-at-v31-entry*
*Context gathered: 2026-05-04*
