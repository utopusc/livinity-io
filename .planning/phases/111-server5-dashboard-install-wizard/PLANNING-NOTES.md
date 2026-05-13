# Phase 111 Planning Notes — Multi-Source Coverage Audit + Plan Reorder Rationale

**Planner:** gsd-planner (Opus 4.7), 2026-05-13
**Mode:** standard cross-repo
**Phase dir:** `.planning/phases/111-server5-dashboard-install-wizard/`

## Plan reorder vs ROADMAP

ROADMAP.md (lines 167-172) listed plans P111-01..05 in a different order than the orchestrator's `<phase_scope>` (which prepended a P111-00 install.sh URL fix). I consolidated to **5 plans in execution order**:

| Plan | Coverage | Wave |
|------|----------|------|
| **111-01** | Install.sh URL fix (orchestrator's P111-00 — prerequisite) | 1 |
| **111-02** | API keys CRUD + multi-key migration (ROADMAP P111-01) | 1 |
| **111-03** | CF zone resolver (ROADMAP P111-02) | 1 |
| **111-04** | Wizard UI 3-step flow + checkpoint UAT (ROADMAP P111-03) | 2 |
| **111-05** | Mode reference docs panel (ROADMAP P111-04) | 3 |

Plans 111-01, 111-02, 111-03 are **Wave 1 parallel-safe** — they touch zero overlapping files. Plan 111-04 depends on 111-02 + 111-03 (Wave 2). Plan 111-05 depends on 111-04 because it edits the same wizard components (Wave 3).

**Deferred:** ROADMAP's P111-05 (verification polling, marked "optional") → **DEFERRED to Phase 112+** to keep plan budget at 5. Justification: the existing `/dashboard` already polls `relay /internal/user-status` every 10s and shows `server.online`, so user has a workable post-install verify path without an additional dedicated polling endpoint. Carry-forward documented in 111-05 SUMMARY.

## Multi-source coverage audit

### GOAL (ROADMAP phase goal)

> Add a first-login onboarding wizard to the Server5 livinity.io dashboard where a new (or existing) user picks an install type, fills in mode-specific fields, and gets a ready-to-paste one-liner install command with all secrets baked in. User pastes the one-liner on a fresh VPS → install completes end-to-end → App Store works without any manual API key entry.

| Sub-goal | Plan(s) | Status |
|----------|---------|--------|
| Wizard accessible at /onboarding/install | 111-04 (page.tsx + layout.tsx) | COVERED |
| Mode selection (4 options, 2 functional) | 111-04 (mode-cards.tsx) + 111-05 (docs panel) | COVERED |
| Mode-specific fields (Local + Hybrid) | 111-04 (local-form.tsx + hybrid-form.tsx) | COVERED |
| CF zone-id auto-resolution | 111-03 (cf/resolve-zone) + 111-04 (hybrid-form on-blur) | COVERED |
| Fresh API key minted per wizard run | 111-02 (POST /api/account/api-keys) + 111-04 (step 3 useEffect) | COVERED |
| Multi-key per user (drop UNIQUE constraint) | 111-02 (migration 0010) | COVERED |
| Generated one-liner with all flags baked in | 111-04 (install-command-display.tsx buildCommand) | COVERED |
| Copy-to-clipboard button | 111-04 (CopyButton inside install-command-display) | COVERED |
| livinity.io/install.sh serves Phase 104+ modular installer | 111-01 (route.ts patch) | COVERED |
| Install on fresh VPS completes end-to-end | 111-04 Task 4 checkpoint (operator-walked UAT) | COVERED (binding gate) |

### REQ (REQUIREMENTS.md phase_req_ids)

`init.plan-phase` returned `phase_req_ids: null` for phase 111 (no formal requirement IDs declared in REQUIREMENTS.md for this phase). v34.0 milestone tracks phases at a less granular level than v30.0 broker work. No REQ coverage gaps.

### RESEARCH (RESEARCH.md)

Phase 111 dir has no RESEARCH.md (`has_research: false` from init). Discovery was inline via SSH probing of `/opt/platform/web` source + Postgres schema introspection. Findings:
- Server5 NOT a Git repo (direct file edits)
- pm2 unit name: `web`
- Existing auth: `getSession` from `@/lib/auth`
- Existing key-gen pattern (`/api/dashboard` POST): bcrypt cost 10 + nanoid(20) + 14-char prefix
- `api_keys` table managed by raw SQL, NOT Drizzle (Drizzle had 5 other tables but missed api_keys)
- install.sh route already points to GitHub raw, just with the WRONG path (`livos/install.sh` instead of `scripts/install.sh`)

All findings flow into plan interfaces sections. No RESEARCH gap.

### CONTEXT (CONTEXT.md / `<critical_invariants>`)

Phase 111 dir has no CONTEXT.md (`has_context: false`). Decisions came from orchestrator's `<critical_invariants>` block.

| Decision ID | Where implemented | Verified by |
|-------------|-------------------|-------------|
| D-NO-LIVOS-CHANGE | Every plan's commit touches ONLY `.planning/` artifacts | `git diff` post-commit shows zero `livos/`/`liv/` files |
| D-111-EXISTING-AUTH | 111-02 (routes use `getSession`), 111-04 (layout.tsx uses `getSession`) | grep `getSession` in plan files |
| D-111-KEY-NEVER-RE-SHOWN | 111-02 POST returns plain key ONCE; GET returns prefix only; 111-04 step 3 state cleared on Back + key revoked | code review |
| D-111-CF-TOKEN-NEVER-PERSISTED | 111-03 grep audit (no pool.query/redis.set/fs.write); 111-04 hybrid-form NO localStorage | grep in plan verify steps |
| D-111-RELAY-DATA-PLANE-DOC | 111-04 step 3 advisory + 111-05 Hybrid securityTradeoffs paste of "Zero relay data plane" | grep |
| D-111-INSTALL-CMD-COPY-FRIENDLY | 111-04 buildCommand returns single-line template literal; grep for `\\\n` | grep |
| Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | every plan's final task validates `git hash-object` | git hash-object check |

All 7 critical invariants COVERED.

## Wave structure

| Wave | Plans | Reason |
|------|-------|--------|
| 1 | 111-01, 111-02, 111-03 | No `files_modified` overlap (install.sh route, api_keys routes, cf route — separate directories) |
| 2 | 111-04 | Depends on 111-02 (api-keys API) + 111-03 (cf-zone API) + 111-01 (install.sh URL) |
| 3 | 111-05 | Depends on 111-04 (edits same wizard components: page.tsx + mode-cards.tsx) |

**Parallel execution opportunity:** Wave 1 can dispatch 3 executors simultaneously per memory `feedback_autonomous` (autonomous workflow preference). Each Wave-1 plan is 2 tasks → ~25-35% context, leaving plenty headroom.

## Cross-repo execution model

Every PLAN's tasks include explicit SSH command blocks:
- File creation via `cat > <path> << "TSEOF" ... TSEOF`
- Backups (`cp <path> <path>.pre-111-NN.bak`) for rollback
- Rebuild + reload (`pnpm install && pnpm build && pm2 reload web`)
- Live curl UAT (using session token from `sudo -u postgres psql` for test user)
- `git commit` in this repo touches ONLY `.planning/` artifacts

Per memory `feedback_ssh_rate_limit`: each task batches all SSH ops into a SINGLE `ssh root@... '<block>'` invocation to avoid fail2ban sshd jail.

## Scope reduction prohibition self-check

- No "v1" / "static for now" / "simplified" language in any plan's `<action>` block — verified.
- All locked decisions (D-111-*) directly implemented, NOT split across "v1/v2".
- The only DEFERRED item is ROADMAP's P111-05 (verification polling, ROADMAP-marked "optional") — documented in 111-05 SUMMARY with carry-forward.
- No feature judged "too hard" — every must_have has a concrete plan covering it.

## Context budget self-check (per plan)

| Plan | Files | Action paragraphs | Est. context | Tasks |
|------|-------|-------------------|--------------|-------|
| 111-01 | 1 + 1 doc | Short — single sed swap | ~12% | 2 |
| 111-02 | 4 + 1 doc | Medium — migration + 2 routes + UAT | ~30% | 4 |
| 111-03 | 1 + 1 doc | Medium — single route w/ CF integration | ~22% | 2 |
| 111-04 | 7 + 1 doc | Heavy — wizard state machine + 5 components | ~45% | 4 |
| 111-05 | 3 + 1 doc | Medium — docs panel + 2 patches | ~25% | 2 |

Plan 111-04 is the only plan near the 50% ceiling — acceptable because (a) frontend components share a single mental model (state machine + sub-components), (b) most content is the components themselves (not many decision points), (c) interface contracts already specified in `<interfaces>` block so executor doesn't explore codebase.
