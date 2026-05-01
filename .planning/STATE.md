---
gsd_state_version: 1.0
milestone: v29.4
milestone_name: Server Management Tooling + Bug Sweep
status: in-progress
stopped_at: 2026-05-01 -- Phase 45 (Carry-Forward Sweep) FULLY SHIPPED — all 4 plans complete (45-01 + 45-02 + 45-03 + 45-04). Plan 45-04 (FR-CF-04 OpenAI SSE usage chunk + real token plumbing + test:phase45 master gate) shipped in commit c6061f76. test:phase45 chain green (38/38 PASS, exit 0). Ready for /gsd-plan-phase 46 (Fail2ban Admin Panel).
last_updated: "2026-05-01T20:00:00Z"
last_activity: 2026-05-01 -- Phase 45 Plan 04 (FR-CF-04) shipped in atomic commit c6061f76 — OpenAIChatCompletionChunk extended with optional usage{prompt_tokens, completion_tokens, total_tokens}; makeChunk gained 3rd usage? param; final_answer/error AgentEvent branches refactored to deferred-emission (capture stoppedReasonHint instead of writing terminal chunk + [DONE] inline); finalize(stoppedReason?, usage?) now SOLE canonical terminal emitter (writes chunk-with-usage BEFORE [DONE], pitfall B-13 wire-order); agent-runner-factory.ts done-event reads optional totalInputTokens/totalOutputTokens with backward-compatible 0 fallback; openai-router.ts streaming finally-block captures full streamFinalResult and threads tokens through adapter.finalize; openai-sse-adapter.test.ts gained Tests 11+12 (12/12 PASS, wire-order + zero-token degenerate) plus caller-convention update for Tests 3+10; new test:phase45 npm script chains test:phase44 (transitively 39→44 with re-pinned BASELINE_SHA 4f868d31...) + integration.test.ts (45-02, 10/10) + common.test.ts (45-03, 4/4) + openai-sse-adapter.test.ts (this plan, 12/12) = 38/38 total PASS; sacred file UNTOUCHED (Wave 2 isolation contract upheld through ALL 4 Phase 45 plans).
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-01 after v29.3 milestone close)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Last shipped milestone:** v29.3 Marketplace AI Broker (Subscription-Only) — 2026-05-01 (local; awaiting deploy)
**Current focus:** v29.4 — Server Management Tooling + Bug Sweep (defining-plans; Phases 45-48)

## Milestone Metadata

| Field | Value |
|-------|-------|
| Milestone | v29.4 — Server Management Tooling + Bug Sweep |
| Phases | 4 (45 → 48; continues from v29.3 Phase 44, NO reset) |
| Requirements | 18 / 18 mapped (FR-CF / FR-F2B / FR-TOOL / FR-MODEL / FR-PROBE / FR-SSH) |
| Granularity | fine |
| Parallelization | false (strict linear chain) |
| Mode | yolo |
| Workflow | research=true, plan_check=true, verifier=true, skip_discuss=true, ui_phase=false |
| Status | **defining-plans** (ready for `/gsd-plan-phase 45`) |
| LOC delta target | ~940 (per `v29.4-STACK.md`) |
| New deps | 0 (D-NO-NEW-DEPS) |

## Current Position

| Phase | Plan | Status | Progress |
|-------|------|--------|----------|
| 45 — Carry-Forward Sweep | 04/04 (FR-CF-01 + FR-CF-02 + FR-CF-03 + FR-CF-04 ALL SHIPPED) | **Complete** | `[██████████] 100%` |
| 46 — Fail2ban Admin Panel | (none yet) | Pending | `[░░░░░░░░░░] 0%` |
| 47 — AI Diagnostics (Registry + Identity + Probe) | (none yet) | Pending | `[░░░░░░░░░░] 0%` |
| 48 — Live SSH Session Viewer | (none yet) | Pending | `[░░░░░░░░░░] 0%` |

**Overall milestone progress:** `[███░░░░░░░] 25%` (Phase 45 of 4 phases fully closed; Plans 45-01 + 45-02 + 45-03 + 45-04 of ~16 plans shipped)
**Active phase:** Phase 46 next (Phase 45 Carry-Forward Sweep COMPLETE — all four C1/C2/C3/C4 carry-forwards shipped)
**Next step:** Run `/gsd-plan-phase 46` to decompose Phase 46 (Fail2ban Admin Panel) into plans

## Performance Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Phases | 4 | TBD |
| Plans (estimate) | 12-16 (3-4 per phase under fine granularity) | TBD |
| Automated tests | 50+ | TBD |
| LOC delta | ~940 (per `v29.4-STACK.md`) | TBD |
| Manual UAT items | 4-6 (one per phase) | TBD |
| New npm/apt deps | 0 (D-NO-NEW-DEPS) | TBD |
| Sacred-file edits | 1 audit-only re-pin (FR-CF-02) + ≤1 surgical edit (FR-MODEL-02 Branch B if taken) | 1 audit-only re-pin shipped (Phase 45 P01, commit `f5ffdd00`); Plans 45-02 + 45-03 + 45-04 all left sacred file byte-identical (Wave 2 isolation upheld through ALL 4 Phase 45 plans) |
| Server4 patches | 0 (D-NO-SERVER4 hard-wall) | TBD |

## Accumulated Context

### Locked Decisions (carry from REQUIREMENTS.md → enforced in every phase)

- **D-NO-BYOK** — Subscription-only AI provider path (no API key field anywhere). [carry from v29.3]
- **D-NO-SERVER4** — Mini PC `bruce@10.69.31.68` ONLY. Server4 + Server5 off-limits.
- **D-TOS-02** — Broker NEVER through raw `@anthropic-ai/sdk`; always Agent SDK `query()`. [carry from v29.3]
- **D-NO-NEW-DEPS** — 0 new npm/apt deps for v29.4. (`maxmind` for geo-IP enrichment of Phase 48 SSH viewer DEFERRED to v30+.)
- **D-LIVINITYD-IS-ROOT** — livinityd runs as root on Mini PC; sudoers/polkit/D-Bus brokers are net-new attack surface for zero gain.
- **D-DIAGNOSTICS-CARD** — Phase 47 cards (FR-TOOL + FR-MODEL + FR-PROBE) share single `diagnostics-section.tsx` scaffold (~25% LOC saving).
- **D-D-40-01-RITUAL** — every surgical edit to sacred `sdk-agent-runner.ts` follows Phase 40 ritual (pre-edit SHA verify → behavior-preserving change → post-edit SHA verify → integrity test re-pinned with audit comment).
- **D-FAIL2BAN-CLIENT-ONLY** — text-parse `fail2ban-client status` output; no JSON wrappers; no Python `dbus` bindings; no `fail2ban` npm wrapper.

### Sacred File State

`nexus/packages/core/src/sdk-agent-runner.ts`:
- v29.3 Phase 40 baseline (audited): `623a65b9...`
- v43.x model-bump drift (un-audited at the time): → `4f868d31...` (current)
- Phase 45 FR-CF-02 (Plan 01) — **SHIPPED 2026-05-01 in commit `f5ffdd00`**: audit-only re-pin to `4f868d31...` with audit comment listing every drift commit (9f1562be / 47890a85 / 9d368bb5). Sacred file source bytes unchanged. Integrity test green.
- Phase 47 FR-MODEL-02 Branch B (if taken): ONE more surgical edit at system-prompt construction site — re-pins integrity test a second time on top of `f5ffdd00`

### Carry-from v29.3 (accepted debt at milestone close 2026-05-01)

- **C1 (FR-CF-01 in v29.4)**: ~~`livinity-broker/router.ts:159` collapses ALL upstream errors to HTTP 500; `agent-runner-factory.ts:75-76` drops `Retry-After` header. UI banner-section can render but FR-DASH-03 only synthetic-verifiable until C1 fix lands.~~ **CLOSED 2026-05-01 in Phase 45 Plan 02, commit `cdd34445`** — UpstreamHttpError class threads upstream {status, retryAfter} through agent-runner-factory.ts; Anthropic + OpenAI sync catch blocks branch on instanceof with strict 429-only allowlist; 5 new integration tests (10/10 PASS) covering 18 status-code sub-cases (9 statuses × 2 routers via Tests 7+9 loops) + 2 Retry-After format cases (delta-seconds + HTTP-date byte-identical). v29.3 FR-DASH-03 banner-section now end-to-end correct (no longer "synthetic-verifiable only").
- **C2 (FR-CF-02 in v29.4)**: ~~`sdk-agent-runner-integrity.test.ts:33` `BASELINE_SHA = '623a65b9...'` is stale (drifted to `4f868d31...` due to v43.x model bumps).~~ **CLOSED 2026-05-01 in Phase 45 Plan 01, commit `f5ffdd00`** — audit-only re-pin to `4f868d31...` with audit block citing v43.x drift commits.
- **C3 (FR-CF-03 in v29.4)**: ~~`claudePerUserStartLogin` (sub) + `usage.getMine` (q) + `usage.getAll` (q) NOT in `httpOnlyPaths` at `livos/packages/livinityd/source/modules/server/trpc/common.ts:8` — UX hang risk under WS reconnect.~~ **CLOSED 2026-05-01 in Phase 45 Plan 03, commit `d2c99e8a`** — three namespaced strings inserted immediately after the Claude-auth cluster, preceded by FR-CF-03 cluster comment; new `common.test.ts` (4 tests, bare tsx + node:assert/strict, runs <1s) asserts presence + bare-name footgun guard. Restart-livinityd-mid-session integration test deferred to UAT on Mini PC per pitfall W-20.
- **C4 (FR-CF-04 in v29.4)**: ~~`livinity-broker/openai-sse-adapter.ts` does not emit final `usage` chunk before `data: [DONE]` → zero `broker_usage` rows for OpenAI streaming traffic.~~ **CLOSED 2026-05-01 in Phase 45 Plan 04, commit `c6061f76`** — OpenAIChatCompletionChunk gained optional usage field; final_answer/error AgentEvent branches refactored to deferred-emission so finalize() can thread usage into terminal chunk; agent-runner-factory.ts done-event reads optional upstream totalInputTokens/totalOutputTokens (backward-compatible 0 fallback); openai-router.ts streaming finally-block threads real tokens through adapter.finalize; new Tests 11+12 (wire-order assertion + zero-token degenerate) bring openai-sse-adapter.test.ts to 12/12 PASS; new test:phase45 npm script chains 39→44 + Phase 45 broker tests (38/38 PASS, exit 0). Verbatim openai Python SDK live-network smoke test deferred to UAT on Mini PC per pitfall W-20.

### Carry-from v29.3 (manual UAT deferred — opt-in, not blockers for v29.4)

- 6 UAT files (`40-UAT.md`, `41-UAT.md`, `42-UAT.md`, `43-UAT.md`, `44-UAT.md`) un-executed pending Mini PC deploy.
- v29.3 ALSO leaves `liv-memory.service` in restart-loop on Mini PC (memory dist never compiled by `update.sh`); separate fix outside v29.4 scope but worth surfacing if Phase 47 FR-MODEL-02 Branch A patches `update.sh`.

### Critical Sequencing Constraint

**FR-CF-02 (Phase 45) MUST land BEFORE FR-MODEL-02 Branch B (Phase 47).**
- C2 = audit-only commit (no source change). Re-pins `BASELINE_SHA` from `623a65b9...` to `4f868d31...`.
- FR-MODEL-02 Branch B = surgical edit on top of post-C2 SHA. Re-pins integrity test a second time.
- Strict linear chain (`parallelization: false`) enforces this naturally.

### Verified File Paths (from `v29.4-ARCHITECTURE.md`)

- `httpOnlyPaths` lives at `livos/packages/livinityd/source/modules/server/trpc/common.ts:8` (NOT `nexus/packages/api/src/common.ts` — milestone-context block was wrong; architecture research corrected).
- `device_audit_log` schema at `livos/packages/livinityd/source/modules/database/schema.sql:109-118` (REUSE for Phase 46 audit log via `device_id := 'fail2ban-host'` sentinel — NO new table).
- `LIVINITY_docker` `SECTION_IDS` at `livos/packages/ui/src/routes/docker/store.ts:40-53` (currently 12 entries; Phase 46 adds 13th = "Security").
- Sacred file at `nexus/packages/core/src/sdk-agent-runner.ts`; integrity test at `nexus/packages/core/src/sdk-agent-runner-integrity.test.ts:33`.
- v29.3 broker module shape: `livos/packages/livinityd/source/modules/livinity-broker/` (5 files: index.ts, router.ts, agent-runner-factory.ts, openai-sse-adapter.ts, ...) — Phase 46 `fail2ban-admin/` mirrors this shape.

### Active Todos

- [x] Run `/gsd-plan-phase 45` to decompose Phase 45 (Carry-Forward Sweep) into plans (done 2026-05-01)
- [x] Phase 45 Plan 01 (FR-CF-02 audit-only sacred-SHA re-pin) shipped (commit `f5ffdd00`, 2026-05-01)
- [x] Phase 45 Plan 02 (FR-CF-01 broker 429 forwarding + Retry-After preservation) shipped (commit `cdd34445`, 2026-05-01)
- [x] Phase 45 Plan 03 (FR-CF-03 httpOnlyPaths additions for ai.claudePerUserStartLogin + usage.getMine + usage.getAll) shipped (commit `d2c99e8a`, 2026-05-01)
- [x] Phase 45 Plan 04 (FR-CF-04 OpenAI SSE usage chunk + real token plumbing + test:phase45 master gate) shipped (commit `c6061f76`, 2026-05-01)
- [x] **Phase 45 (Carry-Forward Sweep) COMPLETE** — all 4 plans / all 4 carry-forwards (C1/C2/C3/C4) shipped; test:phase45 chain green (38/38 PASS, exit 0); sacred file UNTOUCHED through all 4 plans (Wave 2 isolation contract upheld)
- [ ] Run `/gsd-plan-phase 46` for Fail2ban Admin Panel
- [ ] After Phase 46 ships, run `/gsd-plan-phase 47` for AI Diagnostics
- [ ] After Phase 47 ships, run `/gsd-plan-phase 48` for Live SSH Session Viewer
- [ ] At v29.4 milestone close: run `/gsd-complete-milestone v29.4` to archive

### Blockers

None. Workflow is `mode=yolo, skip_discuss=true` — proceed directly to plan-phase 45.

### Known Risks (per `v29.4-PITFALLS.md`)

- **B-04 sacred file SHA coordination failure** — mitigated by strict linear chain (45 before 47) + Phase 47 enforces D-D-40-01-RITUAL.
- **B-05 A2 wrong-root-cause fix** — mitigated by Phase 47 FR-MODEL-01 6-step on-Mini-PC diagnostic BEFORE any code change.
- **B-01 fail2ban self-ban re-cycle** — mitigated by FR-F2B-02 action-targeted unban + whitelist checkbox.
- **B-02 banning admin's own IP without confirmation** — mitigated by FR-F2B-03 type-`LOCK ME OUT` strict gate.
- **B-06 tool registry flush+resync race window** — mitigated by FR-TOOL-02 atomic-swap via temp prefix.
- **B-07 user-override revert on resync** — mitigated by FR-TOOL-02 re-applying overrides post-resync.
- **X-04 httpOnlyPaths invariant** — every new tRPC mutation explicitly enumerated in phase success criteria.
- **X-01 D-NO-SERVER4 hard-wall** — every Phase patch script must grep for `45.137.194.103` and refuse if found.

## Next Steps

1. `/gsd-plan-phase 45` — decompose Phase 45 (Carry-Forward Sweep) into 3-4 plans (C1/C2/C3/C4 each get a plan or are bundled by surgical-fix family).
2. After Phase 45 close, push to origin: `git push origin master` (will be ~50 commits ahead given v29.3's un-pushed 44+).
3. **Optional — deploy + run v29.3 UATs:** any time post-Phase 45, walk `40-UAT.md` → `44-UAT.md` end-to-end on the Mini PC. UATs are opt-in and do not block v29.4 phases.

## Deferred Items (carry from v29.3 close)

| Category | Item | Status |
|----------|------|--------|
| uat | Phase 40 — 40-UAT.md (27 steps) | un-executed (next deploy) |
| uat | Phase 41 — 41-UAT.md (34 steps) | un-executed (next deploy) |
| uat | Phase 42 — 42-UAT.md (9 sections, includes openai Python SDK smoke test) | un-executed (next deploy); openai SDK test is FR-CF-04 verification path |
| uat | Phase 43 — 43-UAT.md (9 sections, MiroFish dropped per user) | un-executed; FR-MARKET-02 dropped from carry-forward |
| uat | Phase 44 — 44-UAT.md (9 sections) | un-executed (next deploy) |
| quick_task | 260425-sfg-v28.0-hot-patch-bundle-tailwind-sync-bg | unresolved (legacy v28.0 tech debt; not v29.4 scope) |
| quick_task | 260425-v1s-v28.0-hot-patch-round-2-activity-overflow | unresolved (legacy v28.0 tech debt) |
| quick_task | 260425-x6q-v28.0-hot-patch-round-3-window-only-nav | unresolved (legacy v28.0 tech debt) |

UAT items remain executable any time post-deploy via the existing UAT files in `.planning/milestones/v29.3-phases/<phase>/`. Audit-found integration gaps now formal v29.4 requirements (FR-CF-01..04 in Phase 45). FR-MARKET-02 (MiroFish) explicitly dropped per user 2026-05-01 — NOT in v29.4 scope.

## Recently Shipped

### v29.3 Marketplace AI Broker (Subscription-Only) (2026-05-01, local)

6-phase milestone delivering subscription-only Claude broker for marketplace AI apps:
- Phase 39 (FR-RISK-01): closed `claude.ts` raw-SDK OAuth fallback
- Phase 40 (FR-AUTH-01..03): per-user `.claude/` synthetic dirs + `homeOverride` plumbing in sacred `SdkAgentRunner` (1 surgical line edit)
- Phase 41 (FR-BROKER-A-01..04): Anthropic Messages broker via HTTP-proxy Strategy B + `X-LivOS-User-Id` header pipeline
- Phase 42 (FR-BROKER-O-01..04): OpenAI Chat Completions broker (in-process TS translation)
- Phase 43 (FR-MARKET-01 satisfied; FR-MARKET-02 **dropped 2026-05-01**): manifest auto-injection
- Phase 44 (FR-DASH-01..02 satisfied; FR-DASH-03 **partial — debt accepted**): per-user usage dashboard

See `.planning/milestones/v29.3-ROADMAP.md` for full archive · `v29.3-MILESTONE-AUDIT.md` for gap analysis · `v29.3-INTEGRATION-CHECK.md` for cross-phase wiring detail · `v29.3-REQUIREMENTS.md` for final disposition per REQ-ID.

### v29.2 Factory Reset (2026-04-29)

3-phase mini-milestone delivering one-click factory reset (`/login` reroute on success+preserve, `/onboarding` on success+fresh, recovery page on rolled-back). See `.planning/milestones/v29.2-ROADMAP.md` for full archive.
