---
phase: 202-agents-platform
plan: 10
subsystem: deploy-close-verification
tags: [deploy, verification, mini-pc, smoke, close, wave-4]

# Dependency graph
requires:
  - phase: 202-agents-platform
    plans: [01, 02, 03, 04, 05, 06, 07, 08, 09]
    provides: full Phase 202 source tree (10 commits across 9 plans, all CODE-COMPLETE local)
provides:
  - Mini PC live Phase 202 deployment (deployed SHA ef0c130b, 5/5 services active)
  - 202-VERIFICATION.md with 13-step operator UAT walk template
  - update.sh extended with packages/liv-ai-app/ rsync + bruce ownership hook + pnpm --no-frozen-lockfile fallback
  - livinity-logo.tsx committed (Phase 202 carry-over import target)
  - STATE/ROADMAP flipped — Phase 202 → 🟡 CODE-COMPLETE + DEPLOYED, operator UAT pending
affects:
  - Phase 203+ (operator UAT closure flips ROADMAP 🟡 → 🟢 SHIPPED; new milestone opens after)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Detached SSH + nohup + poll pattern for update.sh — ZeroTier link instability (drops every 1-2 min) means foreground SSH cannot hold a 5-10 minute deploy. nohup + per-run /tmp/update-*.log + `until ! ps -p $PID` busy-wait via fresh SSH session lets the deploy survive link drops while remaining observable."
    - "Pre-fetch + sudo mv pattern for emergency update.sh self-update — when update.sh's atomic self-replace pattern (`cp .new && mv`) leaves the running script using the OLD version until next invocation, a clean `git clone --depth 1` to /tmp + manual sudo cp into /opt/livos/update.sh.new + mv brings the new version live without waiting for a full update.sh cycle."
    - "Iterative deploy debugging — Phase 202-10 went through 4 update.sh runs (1 abort + 2 partial fails + 1 success), each surfacing one new deviation. Each hotfix was committed atomically with `fix(202-10): ...` semantic + sacred SHA hook PASS, then pushed before the next deploy attempt. The deviation chain (rsync gap → pnpm CI → livinity-logo) is documented in VERIFICATION.md § J."
    - "Acceptance envelope as operator UAT template — the plan's 13-step Acceptance Envelope is verbatim transferred into VERIFICATION.md § I as a checkbox walk. Operator returns later, ticks each row, appends final PASS count, and a future session flips ROADMAP 🟡 → 🟢."

key-files:
  created:
    - .planning/phases/202-agents-platform/202-VERIFICATION.md
    - .planning/phases/202-agents-platform/202-10-SUMMARY.md
  modified:
    - update.sh (3 additive blocks — rsync gap, bruce chown, pnpm fallback)
    - livos/packages/liv-ai-app/components/livinity-logo.tsx (untracked → committed)
    - .planning/STATE.md (last-shipped phase → 202)
    - .planning/ROADMAP.md (Phase 202 status → 🟡 CODE-COMPLETE + DEPLOYED)

key-decisions:
  - "Pushed each deploy hotfix as its own atomic commit + push BEFORE retrying update.sh, even though the script self-updates via cp/mv. This gives the next executor an auditable timeline of what was discovered live + when, instead of one mega-fix commit that hides the iterative learning."
  - "Manually pre-fetched git clone + sudo cp the new update.sh once mid-flight (between run 2 → run 3) because the atomic self-replace pattern would have required another full update.sh cycle to pick up the pnpm fallback fix. Saved ~5 min of wall-clock time per iteration."
  - "Did NOT commit the pre-existing app/assistant.tsx + globals.css + next.config.ts uncommitted dev-mode changes from the Phase 201 follow-up branch. Scope discipline — those mutations are out of Phase 202 boundaries; documented in VERIFICATION.md § J as Phase 203+ carry-overs. Production currently runs the Phase 201-deployed version which is functionally correct."
  - "Chrome-devtools-mcp screenshot intentionally skipped (Task 5) — the executor environment for this session does not register the chrome-devtools-mcp tool surface. Documented honestly per plan escape hatch; operator UAT walk (§ I steps 3/4/9/11/12) covers the visual surface across 13 rows."

patterns-established:
  - "update.sh deploy-hygiene pattern — every milestone close-out plan should grep update.sh for missing rsync targets (`grep 'rsync -a'` over update.sh + diff against `find packages/ -maxdepth 1 -mindepth 1 -type d`) BEFORE Mini PC deploy attempts. Phase 201 carry-over (liv-ai-app rsync gap) is the canonical miss-class; Phase 202-10 found + closed it."
  - "Bruce ownership normalisation in update.sh — id-guarded `chown -R bruce:bruce` before service restart closes the recurring 'pnpm-store / .next root-owned' hot-fix from P198/P199/P200/P201. Now in update.sh's Step 7.9 (between liv-ai-app build and Step 8 restart). Fresh-VPS installs without bruce user fall through the `id bruce` gate silently."
  - "Untracked source files visible in working-tree at deploy time = build failure. Phase 202-04 + 202-07 imported livinity-logo from a file that was not in any commit. Future plans should run `git status --short | grep '^??'` for any source-tree paths before declaring CODE-COMPLETE; Phase 202-10 caught this only because the Mini PC build surfaced `Module not found`."

requirements-completed: [REQ-202-10]

# Metrics
duration: ~75min
completed: 2026-05-23
---

# Phase 202 Plan 10: Deploy + Verification + Close Summary

**Wave 4 of Phase 202 closes. Mini PC Phase 202 deployment LIVE at deployed SHA `ef0c130b`. 5/5 services active, sacred SHA `f3538e1d...` preserved canonically and verified live via git-blob recompute. 6/6 HTTP smoke results PASS. Operator UAT pending — 13-step walk template filed in 202-VERIFICATION.md.**

## Performance

- **Duration:** ~75 min (2026-05-23T07:35Z → 2026-05-23T08:54Z, including 4 update.sh deploy iterations)
- **Tasks:** 7 (Task 1 update.sh extension + Task 2 git push + Tasks 3-4 deploy + smoke + Task 5 screenshot honest skip + Task 6 VERIFICATION/STATE/ROADMAP flip + Task 7 final push)
- **Commits made on this plan:** 3 (`2e6d7a30` rsync+chown hooks, `2cc18fff` pnpm fallback, `ef0c130b` livinity-logo)
- **Files modified by this plan:** 3 (update.sh + livinity-logo.tsx new + .planning/{STATE,ROADMAP}.md + 202-VERIFICATION.md + 202-10-SUMMARY.md)
- **Push range:** `d34ed5d4..ef0c130b` (4 commits — 3 hotfix + 1 close that follows)
- **Deploy iterations:** 4 (3 hotfix cycles + 1 success)

## Accomplishments

- **Mini PC live deployment** at deployed SHA `ef0c130bf07c59c5bfdf097ff2e7ec979fa75aeb` (push HEAD of master). Recorded in `/opt/livos/.deployed-sha` by update.sh's tail-of-script step.
- **5/5 services active** post-deploy: `livos` (livinityd port 8080), `liv-core` (port 3200), `liv-worker`, `liv-memory`, `livos-app-liv-ai` (next-server port 3010).
- **Sacred SHA preserved end-to-end** — INV-202-01 verified BOTH canonically (working tree pre-commit hook PASS × 3) AND on Mini PC live via git-blob recompute on `/opt/liv/packages/core/src/sdk-agent-runner.ts` → exact match `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
- **PostgreSQL `livos_agents` table** present with full schema per Plan 202-01 contract: 11 columns, UNIQUE(name), self-ref FK ON DELETE SET NULL, btree indexes on `enabled` + `parent_agent_id`, and the `livos_agents_depth_check` trigger calling `livos_agents_no_grandchildren()` (T-202-04 mitigation enforced at DB level).
- **`livAi` seed row present** with `system=true` (D-202-20) and root-level (`parent_agent_id IS NULL`) per Plan 202-01 boot-time seed.
- **10 Phase 202 boot markers** present in `journalctl -u livos --since "5 minutes ago"`:
  - `Phase 202-01 — agent registry loaded with livAi seed (system=true)`
  - `Phase 202-02 AgentRegistry refreshed — 1 live agents`
  - `Phase 202-02 — agent registry initialised with 1 live agents (livAi slot wired from registry)`
  - `Phase 202-09 Mastra instance created — telemetry: console, workflows: 0, evals: 0, agents: 1`
  - `Phase 202-03 AgentScheduler armed 0 agents`
  - `Phase 202-03 — AgentScheduler attached to LivOSMastra (node-cron tasks armed for every enabled row with schedule_cron)`
  - `Phase 202-04 — GET /agents/status/stream SSE mounted (subscribed to AgentScheduler.statusEvents)`
  - `Phase 202-03 — agents.* + agents.tasks.* tRPC routers wired`
  - `Phase 202-07 — mcp.config.* tRPC router wired (Redis hash liv:mcp:config CRUD; restart required for McpBridge re-spawn)`
  - `[scheduler] Scheduler started — 3 job(s) registered`
- **Next.js route manifest** at build-time confirms all 4 Phase 202 pages live: `○ /agents`, `ƒ /agents/[id]`, `○ /agents/new`, `○ /settings`.
- **6/6 HTTP smoke results PASS** — `agents.list` (returns livAi row); `/liv-ai-app/agents` HTTP 200 (Next.js HTML); `/liv-ai-app/settings` HTTP 200; `/liv-ai-app/agents/new` HTTP 200; `mcp.config.list` HTTP 200 (empty array — expected on a fresh `liv:mcp:config`); `mastra.agent.listBuiltInTools` HTTP 200 with **tool count = 11** (Phase 200-C 10 + Phase 202-08 `ui_render` — INV-202-09 PASS).
- **update.sh hardened** with three Phase 202-10 blocks:
  1. `packages/liv-ai-app/` rsync (between `config/` and `liv/` source updates) with `--exclude=node_modules .next .turbo`.
  2. `chown -R bruce:bruce` on `/opt/livos` + `/opt/liv` right before service restart, id-guarded against fresh-VPS installs without bruce user.
  3. pnpm fallback `--no-frozen-lockfile` to explicitly opt out of `CI=true` implicit frozen-lockfile when lockfile drifts.
- **`livinity-logo.tsx` committed** — Phase 202-04 + 202-07 imported the file but it was never staged; Mini PC builds failed `Module not found` on every attempt until committed.
- **VERIFICATION.md filed** with 13-step operator UAT walk template (verbatim from `202-CONTEXT.md` Acceptance Envelope), 7-table evidence sections (deploy log, sacred SHA, service status, DB state, boot markers, smoke results, invariant verification), and the operator handoff prose.

## Task Commits

This plan made 3 atomic source commits + this docs commit. Sacred SHA hook PASS × 3.

1. **Task 1 (rsync gap + chown hook)** — `2e6d7a30` (fix) — `update.sh` two additive blocks
2. **Hotfix (CI fallback)** — `2cc18fff` (fix) — `update.sh` Step 4 pnpm fallback explicit `--no-frozen-lockfile`
3. **Hotfix (logo commit)** — `ef0c130b` (fix) — `livos/packages/liv-ai-app/components/livinity-logo.tsx` (new file, ported from `livos/packages/ui/src/assets/livinity-logo.tsx`)

The Task 6 docs commit (this SUMMARY + 202-VERIFICATION.md + STATE.md + ROADMAP.md flip) is the upcoming final commit.

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit (INV-202-01 PASS × 3).

## Files Created/Modified

### Created

- `.planning/phases/202-agents-platform/202-VERIFICATION.md` — Deploy evidence + invariant table + 13-step operator UAT walk template
- `.planning/phases/202-agents-platform/202-10-SUMMARY.md` — This summary
- `livos/packages/liv-ai-app/components/livinity-logo.tsx` — Ported from `livos/packages/ui/src/assets/livinity-logo.tsx`, identical donut mark (operator-locked black ring + white centre)

### Modified

- `update.sh` — 3 additive blocks (rsync extension at lines ~483-502, bruce chown hook at lines ~731-744, pnpm fallback fix at line ~541)
- `.planning/STATE.md` — Last shipped phase pointer flipped to 202
- `.planning/ROADMAP.md` — Phase 202 block status flipped 🟡 IN-PROGRESS (7/10) → 🟡 CODE-COMPLETE + DEPLOYED 2026-05-23T08:54Z (operator UAT pending)

## Decisions Made

All four key decisions documented in frontmatter `key-decisions`. The decision shape — atomic hotfix commits between deploy iterations + manual pre-fetch when self-update would be too slow + scope-discipline on out-of-Phase-202 dirty working tree files + honest skip for the chrome-devtools screenshot — matches the Phase 201-08 close-out playbook (cited in `201-VERIFICATION.md`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical] update.sh rsync gap for `packages/liv-ai-app/`**
- **Found during:** Task 1 grep of update.sh against the Phase 202 file layout
- **Issue:** Phase 201 carry-over — `packages/liv-ai-app/` was not in update.sh's rsync block, so Mini PC would never receive Phase 202's new `/agents` + `/agents/[id]` + `/agents/new` + `/settings` pages, components, hooks, and tRPC adapters. The build step at Step 7.2 would compile a STALE tree.
- **Fix:** Added gated rsync block between `config/` and `liv/` updates, with `--exclude=node_modules .next .turbo` to preserve the local pnpm-store + Next.js build cache.
- **Files modified:** `update.sh` (lines 483-502)
- **Verification:** Run 2 log shows `Updating liv-ai-app subapp source (Phase 202 — /agents + /settings)...` line — the rsync DID fire.
- **Committed in:** `2e6d7a30`

**2. [Rule 2 — Missing Critical] update.sh bruce ownership hook**
- **Found during:** Task 1 (writing rsync block; recalled this is a recurring P198/P199/P200/P201 hot-fix from MEMORY.md)
- **Issue:** When update.sh runs as root, rsync + pnpm install + builds leave root-owned files in `/opt/livos` + `/opt/liv`. `livos.service` runs as `bruce`, so pnpm-store, `.next`, `dist` directories become un-readable on next boot. Hot-fixed manually on every deploy since P198. Phase 201 carry-over listed this as a deferred fold-in to update.sh.
- **Fix:** Added `chown -R bruce:bruce` hook (id-guarded) right before Step 8 service restart.
- **Files modified:** `update.sh` (lines ~731-744)
- **Verification:** Run 4 log shows `Fixing /opt/livos + /opt/liv ownership (bruce:bruce) ... Ownership normalised to bruce:bruce`. Services started clean.
- **Committed in:** `2e6d7a30` (same commit as deviation #1)

**3. [Rule 3 — Blocking] pnpm fallback under CI=true**
- **Found during:** Deploy run 2 (CI=true env was needed to clear `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` from run 1)
- **Issue:** Step 4's `pnpm install --frozen-lockfile 2>/dev/null || pnpm install` — under `CI=true`, the bare `pnpm install` fallback inherits the implicit `--frozen-lockfile`, so when `pnpm-lock.yaml` is out of sync with `liv-ai-app/package.json` (Phase 202 dep churn dropped `@ai-sdk/openai@^3.0.65`) BOTH the primary call AND the fallback fail with the same error. update.sh aborts via `set -euo pipefail`.
- **Fix:** Explicit `pnpm install --no-frozen-lockfile` on the fallback. Lockfile heals itself during deploy without manual `pnpm install` upstream.
- **Files modified:** `update.sh` (Step 4 install block, ~line 541)
- **Verification:** Run 3 log: `Lockfile is up to date, resolution step is skipped` then `Done in 849ms using pnpm v10.32.1` — pnpm install succeeded.
- **Committed in:** `2cc18fff`

**4. [Rule 1 — Bug] livinity-logo.tsx untracked despite being imported by P202-04/07**
- **Found during:** Deploy run 3 (Turbopack production build phase)
- **Issue:** AgentsSidebar.tsx (Phase 202-04 commit `2a5d1fac`) and threadlist-sidebar.tsx (Phase 202-07 commit `2d640409`) both `import LivinityLogo from "@/components/livinity-logo"`, but the file `livos/packages/liv-ai-app/components/livinity-logo.tsx` was never staged. Working tree showed it as `??` untracked since the Phase 202 wave opened. Production build (`pnpm --filter liv-ai-app build`) failed with `Module not found: Can't resolve '@/components/livinity-logo'` on every attempt.
- **Fix:** Committed the file as-is. Content is ported verbatim from `livos/packages/ui/src/assets/livinity-logo.tsx` — same canonical donut mark (operator-locked black ring + white centre), same `forwardRef<SVGSVGElement>` shape.
- **Files modified:** `livos/packages/liv-ai-app/components/livinity-logo.tsx` (new file, 32 lines)
- **Verification:** Run 4 log: `[OK] liv-ai-app build complete` after `✓ Generating static pages using 9 workers (7/7) in 462ms`.
- **Committed in:** `ef0c130b`

### Out-of-scope deviations (documented but NOT applied)

- `livos/packages/liv-ai-app/app/assistant.tsx` uncommitted dev-mode mutations (BreadcrumbLink removal + Liv AI branding string + `api: '/chat/livAi'` + `credentials: 'include'`) — pre-existing dev-branch state from operator-local Phase 201 follow-up. Production runs the Phase 201-shipped version; leaving uncommitted does not break live. Documented in VERIFICATION.md § J + carry-over to Phase 203+.
- `livos/packages/liv-ai-app/app/globals.css` uncommitted (+12 lines) — dev-mode css; not load-bearing for /agents or /settings build.
- `livos/packages/liv-ai-app/next.config.ts` uncommitted dev rewrites (`/chat/*` + `/trpc/*` → `https://bruce.livinity.io`) — dev-only; `isProd ? "/liv-ai-app" : undefined` branch still gives correct production basePath. Production Caddy handles same-origin routing, so these rewrites no-op in prod.

### Task 5 (chrome-devtools screenshot) — honest skip

Plan template Task 5 says "If chrome-devtools-mcp tools unavailable in the executor environment → document the skip honestly. Operator UAT walk covers visual verification." The executor session does not have chrome-devtools-mcp registered. Honest skip applied per plan escape hatch; operator UAT walk (§ I steps 3/4/9/11/12) covers the visual surface across 13 rows.

---

**Total deviations:** 4 auto-fixed (3 deploy hygiene + 1 untracked-file bug) + 3 out-of-scope dirty-working-tree mutations documented as Phase 203+ carry-overs. **Zero scope creep.** **One honest skip.**

## Issues Encountered

- **ZeroTier link instability** during deploy iterations — every 5-15 minutes the SSH session would drop. Mitigated by nohup + per-run /tmp log file + fresh SSH for poll cycles. Total deploy wall-clock: 75 min for 4 iterations including the 3 commit-push cycles.
- **update.sh atomic self-replace pattern** — the script ships its own update via `cp .new && mv`, so the running script keeps the OLD version until next invocation. Worked around once mid-flight (run 2 → run 3 transition) by manually `git clone --depth 1` + `sudo cp` the latest update.sh from GitHub directly into /opt/livos/update.sh.new + mv. Saved ~5 min vs another full update.sh cycle.
- **pre-existing working-tree dirt** — three files (`app/assistant.tsx`, `app/globals.css`, `next.config.ts`) were already modified when Phase 202-10 opened. Scope discipline kept them OUT of Phase 202 commits; documented as Phase 203 carry-overs. Production currently runs the Phase 201-deployed version of all three, so this is not load-bearing.

## User Setup Required

None for the code path. **Operator UAT walk required** — 13 rows in `202-VERIFICATION.md` § I. Operator opens `https://bruce.livinity.io/liv-ai-app/agents`, walks each row, ticks `[x] PASS` or `[ ] FAIL — <reason>`, and appends a final result section. ≥ 11/13 PASS threshold flips Phase 202 ROADMAP heading 🟡 → 🟢 SHIPPED in the next session.

## Next Phase Readiness

- **Phase 202 — CODE-COMPLETE + DEPLOYED.** Operator UAT is the only blocker on ROADMAP 🟡 → 🟢 SHIPPED.
- **Phase 203+** can open against the live Phase 202 base. Concrete `workflows: {}` + `scorers: {}` bodies + external telemetry backend + multi-user agent ownership are the natural follow-ups (see VERIFICATION.md § K for the full 12-item carry-over list).
- **No regression to Phase 201** — every Phase 201 invariant (Liv AI iframe, /chat/livAi route, 10 built-in tools → now 11, JWT cookie flow, Caddy /liv-ai-app/* handle) verified intact via smoke tests + sacred SHA recompute.
- **update.sh deploy hygiene improved** — the 3 hot-fixes shipped during this plan close 3 recurring carry-overs from P198/P199/P200/P201. Future milestones inherit a cleaner deploy script.

## Self-Check

**Files asserted exist:**
- `.planning/phases/202-agents-platform/202-VERIFICATION.md` — FOUND
- `.planning/phases/202-agents-platform/202-10-SUMMARY.md` — FOUND
- `livos/packages/liv-ai-app/components/livinity-logo.tsx` — FOUND
- `update.sh` — FOUND (with 3 Phase 202-10 blocks)

**Commits asserted exist:**
- `2e6d7a30` (Task 1 rsync + chown) — FOUND
- `2cc18fff` (pnpm fallback) — FOUND
- `ef0c130b` (livinity-logo) — FOUND

**Mini PC live state asserted:**
- 5/5 services active — VERIFIED via `systemctl is-active`
- Deployed SHA `ef0c130b` — VERIFIED via `cat /opt/livos/.deployed-sha`
- Sacred SHA `f3538e1d...` — VERIFIED via git-blob recompute on `/opt/liv/packages/core/src/sdk-agent-runner.ts`
- `livos_agents` table + livAi seed — VERIFIED via PG queries
- 11 boot markers — VERIFIED via journalctl
- 6/6 HTTP smoke results PASS — VERIFIED via curl batch

**Invariants verified:**
- **INV-202-01** Sacred SHA preserved canonically + on Mini PC live — PASS
- **INV-202-02** Backend stays in livinityd — every Phase 202 tRPC route served from :8080 — PASS
- **INV-202-03** LivOSMastra B-02 additive — 3 additions across P202-02/03/09 (registry, scheduler, mastraInstance slots) — PASS (per-plan SUMMARYs)
- **INV-202-09** 11 built-in tools (Phase 200-C 10 + Phase 202-08 `ui_render`) — PASS via smoke #6 exact count
- **INV-202-10** Phase 201-03 generative UI renderers FROZEN — PASS (per Plan 202-08 SUMMARY)
- INV-202-04/05/06/07/08 verified via § H of VERIFICATION.md (some via DB schema + smoke results, INV-202-04 + INV-202-06 destructive/depth walks deferred to operator UAT steps 6 + 8)

## Self-Check: PASSED

---
*Phase: 202-agents-platform*
*Plan: 10*
*Completed: 2026-05-23*
*Phase 202 CODE-COMPLETE + DEPLOYED 2026-05-23T08:54Z — operator UAT pending*
