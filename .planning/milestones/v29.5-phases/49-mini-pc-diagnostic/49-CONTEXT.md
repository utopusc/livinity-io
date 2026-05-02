# Phase 49: Mini PC Live Diagnostic (single-batch SSH) — Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Auto-generated from ROADMAP + MILESTONE-CONTEXT (workflow.skip_discuss=true)

<domain>
## Phase Boundary

**Goal:** Capture authoritative root-cause fixtures for the 4 v29.4 regressions (A1 tool registry empty / A2 streaming gone / A3 marketplace state wrong / A4 Security panel not rendering) via ONE batched SSH session to Mini PC + ONE batched SSH session to Server5. Output is the canonical `49-DIAGNOSTIC-FIXTURE.md` that Phases 50-53 consume instead of re-probing the live hosts.

**In scope:**
- ONE batched SSH session to Mini PC (`bruce@10.69.31.68`) using stacked `bash -c '...; ...; ...'` to capture all required fixtures atomically
- ONE batched SSH session to Server5 (`root@45.137.194.102`) to capture `platform_apps` SQL state + git log for Bolt.diy wipe attribution
- Writing `.planning/phases/49-mini-pc-diagnostic/49-DIAGNOSTIC-FIXTURE.md` with full command output + per-regression verdict
- Final connectivity check confirming orchestrator IP is NOT banned by Mini PC fail2ban

**Out of scope:**
- Any FIXES — this is a read-only diagnostic phase (Phases 50-53 do the fixing)
- Server4 anything (D-NO-SERVER4 hard rule)
- Multiple sequential SSH calls within the same phase (fail2ban auto-ban risk)
- Re-deploying or restarting services on Mini PC

</domain>

<decisions>
## Implementation Decisions

### D-49-01 (LOCKED): Single batched SSH per host

The Mini PC's fail2ban already auto-banned the orchestrator's IP during the previous diagnostic session (~6 SSH probes within 10 min). This phase MUST issue exactly ONE SSH invocation per host:

- Mini PC SSH: ONE call with stacked commands joined via `;` or `&&`. Commands captured in shell here-doc OR `bash -c "<all-commands>"` form.
- Server5 SSH: ONE call (different host, different fail2ban policy, but still batch).

If the planner produces a plan with multiple SSH calls, plan-checker MUST reject it. If a follow-up SSH probe is genuinely needed, schedule it at the START of Phase 50/51/52/53 (not within Phase 49).

### D-49-02 (LOCKED): Reuse REGRESSIONS.md as primary fixture

`.planning/v29.4-REGRESSIONS.md` already contains the diagnostic transcript from the prior session. Phase 49's job is to:
- VERIFY that fixture's data points still hold (not re-discover from scratch)
- FILL THE GAPS that the prior session couldn't reach (UI bundle mtime, security-section chunk presence, user_preferences row)
- DOCUMENT a confirmed root-cause verdict per regression

If a fixture data point already in REGRESSIONS.md still holds, just cite it — no need to re-capture.

### D-49-03 (LOCKED): SSH command source-of-truth

The Mini PC SSH command list (joined into ONE invocation):

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 'bash -c "
  echo === REDIS_TOOL_KEYS ===;
  source /opt/livos/.env && redis-cli -u \"$REDIS_URL\" --scan --pattern \"nexus:cap:tool:*\" | wc -l;
  echo === REDIS_CAP_PREFIX ===;
  source /opt/livos/.env && redis-cli -u \"$REDIS_URL\" --scan --pattern \"nexus:cap:*\" | wc -l;
  echo === UPDATE_LOG_TAIL ===;
  sudo tail -100 /opt/livos/data/cache/install.sh.cached/update.sh.log 2>/dev/null || ls /opt/livos/data/update-history/ | tail -5;
  echo === UI_BUNDLE_MTIME ===;
  sudo stat /opt/livos/livos/packages/ui/dist/index.html 2>/dev/null;
  sudo ls -la /opt/livos/livos/packages/ui/dist/assets/ 2>/dev/null | head -20;
  echo === SECURITY_SECTION_CHUNK ===;
  sudo grep -l 'security-section\\|SECTION_ID.*security\\|JailStatusCard' /opt/livos/livos/packages/ui/dist/assets/*.js 2>/dev/null | head -3;
  echo === PAST_DEPLOYS_TAIL ===;
  sudo ls -lt /opt/livos/data/update-history/ | head -10;
  echo === LIVOS_JOURNAL ===;
  sudo journalctl -u livos --since '1h ago' --no-pager 2>/dev/null | tail -50;
  echo === USER_PREFS ===;
  sudo -u postgres psql livos -c \"SELECT user_id, security_panel_visible FROM user_preferences;\" 2>/dev/null;
  echo === SERVICES ===;
  systemctl is-active livos liv-core liv-worker liv-memory;
  echo === END ===;
"' > .planning/phases/49-mini-pc-diagnostic/raw-minipc.txt 2>&1
```

The Server5 SSH command list (joined into ONE invocation):

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@45.137.194.102 'bash -c "
  echo === PLATFORM_APPS_STATE ===;
  sudo -u postgres psql livinity -c \"SELECT id, name, status, category FROM platform_apps WHERE id IN ('\''bolt.diy'\'', '\''mirofish'\'') ORDER BY id;\" 2>/dev/null;
  echo === PLATFORM_APPS_FULL_COUNT ===;
  sudo -u postgres psql livinity -c \"SELECT COUNT(*), status FROM platform_apps GROUP BY status;\" 2>/dev/null;
  echo === PLATFORM_GIT_LOG ===;
  cd /opt/livinity-io 2>/dev/null && git log --oneline -30 -- '\''**/platform_apps*'\'' '\''**/marketplace*'\'' '\''**/migrations/*'\'' 2>/dev/null;
  echo === PLATFORM_RECENT_COMMITS ===;
  cd /opt/livinity-io 2>/dev/null && git log --oneline -20;
  echo === END ===;
"' > .planning/phases/49-mini-pc-diagnostic/raw-server5.txt 2>&1
```

Note: actual SSH key paths and DB names should be verified from prior memory. Adjust if `livinity` is not the platform DB name on Server5.

### D-49-04 (LOCKED): Verdict template per regression

Each of A1, A2, A3, A4 gets a verdict block in `49-DIAGNOSTIC-FIXTURE.md`:

```markdown
### A{N} verdict

- **Status:** CONFIRMED | NEW HYPOTHESIS | INSUFFICIENT EVIDENCE
- **Hypothesis from REGRESSIONS.md:** <text>
- **Evidence captured:** <citations from raw-minipc.txt / raw-server5.txt>
- **Verdict:** <root cause statement, 1-2 sentences>
- **Recommended Phase 5x fix path:** <which of REGRESSIONS.md's options to take>
```

### D-49-05 (Claude's discretion): Fail2ban final connectivity check

Final success criterion #5 says orchestrator IP must NOT be banned at end. Implementation: a single small `ssh ... 'echo alive'` check ~30s after the main batched call. If it fails with connection refused / timeout, plan handles by sleeping 11 minutes (fail2ban default ban duration) and retrying once.

</decisions>

<code_context>
## Existing Code Insights

- **Mini PC layout** (validated 2026-04-25 per memory):
  - `/opt/livos/` — rsync-deployed, no `.git`
  - `/opt/livos/.env` — REDIS_URL with rotated password
  - `/opt/livos/data/secrets/jwt` — JWT secret
  - `/opt/livos/livos/packages/ui/dist/` — UI build output
  - `/opt/livos/data/update-history/` — Past Deploys JSON event rows
  - `/opt/livos/data/cache/install.sh.cached/update.sh.log` — last update.sh run log (or NOT, if Phase 33 OBS-01's tee path differs)
- **Capability registry prefix:** `nexus:cap:*` (NOT `nexus:capabilities:*`) per memory `reference_minipc_redis.md`
- **BUILT_IN_TOOL_IDS source:** `livos/packages/livinityd/source/modules/diagnostics/capabilities.ts` line ~174
- **Phase 47-02 SUMMARY** documented `D-WAVE5-SYNCALL-STUB` — production Re-sync writes ZERO keys to `nexus:cap:_pending:*` (no real seed flow). This is A1's fundamental cause.
- **Server5 layout** (less explored): NO `/opt/livos/`. Platform code at `/opt/livinity-io` or similar Next.js layout. PG database name and exact `platform_apps` schema needs to be discovered via the diagnostic SSH itself.

</code_context>

<specifics>
## Specific Requirements

- FR-A1-01 (root cause confirmation half): confirm via Mini PC SSH that `nexus:cap:tool:*` count is ≤8 (likely 0)
- FR-A2-01: identify A2 streaming root cause from UI bundle mtime + update.sh log + (optional) sacred-file diff
- FR-A3-04 (capture half): identify what wiped Bolt.diy via Server5 git log + platform_apps current state
- FR-A4-01: identify A4 root cause from UI dist asset chunks + user_preferences row + browser/PWA cache state

## Critical constraints

- **SINGLE SSH call per host** (D-49-01) — non-negotiable
- **No state-mutating commands** — read-only diagnostic only
- **No service restarts** — Phase 50+ will deploy + restart in their own scope
- **Final fail2ban liveness check** — orchestrator IP must remain unblocked at end of phase

</specifics>

<deferred>
## Deferred Ideas

- Hardening the Server5 platform_apps seed flow itself — out of scope per REQUIREMENTS Out-of-Scope (Phase 52 documents root cause but doesn't fix the seed flow)
- Liv-memory service restart-loop (pre-existing breakage from `update.sh` not building memory package) — separate fix outside v29.5
- Updating MILESTONES.md or memory files with this fixture's findings — Phase 50+ phases reference the fixture directly

</deferred>

## Plan Hints (for gsd-planner)

Recommended plan structure:
1. **Plan 49-01** — Mini PC single-batch SSH probe → write `raw-minipc.txt`
2. **Plan 49-02** — Server5 single-batch SSH probe → write `raw-server5.txt`
3. **Plan 49-03** — Synthesize `49-DIAGNOSTIC-FIXTURE.md` from raw outputs + per-regression verdict blocks
4. **Plan 49-04** — Final fail2ban liveness check + commit fixture

Plans 49-01 and 49-02 can run in parallel (different hosts). Plan 49-03 depends on both. Plan 49-04 runs last.

If the SSH commands are blocked by Windows shell quoting issues, use `Bash` tool with the explicit `ssh ... bash -c "..."` form (single-quoted outer, double-quoted inner) and verify quoting roundtrips correctly with a `echo TEST` smoke before the real probe. If a fail2ban ban is detected (connection refused), abort the phase and present a blocker — do NOT retry within the same phase.
