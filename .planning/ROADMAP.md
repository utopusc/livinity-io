# Roadmap — LivOS

## Milestones

- ✅ **v29.3 Marketplace AI Broker (Subscription-Only)** — Phases 39-44 (shipped local 2026-05-01 with `gaps_found` accepted; MiroFish dropped) — see [milestones/v29.3-ROADMAP.md](milestones/v29.3-ROADMAP.md)
- ✅ **v29.4 Server Management Tooling + Bug Sweep** — Phases 45-48 (shipped local 2026-05-01, status `passed`, 18/18 reqs) — see [milestones/v29.4-ROADMAP.md](milestones/v29.4-ROADMAP.md)
- 🟢 **v29.5 v29.4 Hot-Patch Recovery + Verification Discipline** — Phases 49-55 (started 2026-05-02; 26 reqs across A1/A2/A3/A4/B1/VERIFY)
- ⏸ **v30.0 Backup & Restore** — paused, 8 phases / 47 BAK-* reqs defined in [milestones/v30.0-DEFINED/](milestones/v30.0-DEFINED/) (resumes after v29.5 with phase renumber)

---

# v29.5 — v29.4 Hot-Patch Recovery + Verification Discipline

**Milestone:** v29.5
**Started:** 2026-05-02
**Granularity:** fine
**Total phases:** 7 (49-55)
**Total v1 requirements covered:** 26 / 26 (100%)

## Goal

Close 4 user-reported v29.4 regressions (A1 tool registry empty, A2 streaming gone, A3 Bolt.diy missing + MiroFish still present, A4 Fail2ban Security panel not rendering) and establish a **mandatory live-verification gate** so future milestones cannot ship `passed` without on-Mini-PC UAT execution.

## Architectural Constraints (carry from v29.4)

- **D-NO-NEW-DEPS** — no new npm/apt deps
- **D-NO-SERVER4** — Server4 is off-limits; Mini PC + Server5 only
- **D-LIVINITYD-IS-ROOT** — livinityd runs as root; no privilege drops
- **Sacred file** `nexus/packages/core/src/sdk-agent-runner.ts` — current SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`. Any edit follows D-40-01 ritual: byte-counted before/after, SHA pin updated, audit comment added.
- **D-LIVE-VERIFICATION-GATE (NEW)** — milestones cannot close `passed` without on-Mini-PC UAT execution per relevant phase
- **Mini PC SSH rate-limit** — fail2ban auto-bans rapid probes; ALL diagnostic SSH calls MUST batch into a single invocation

## Phases

- [ ] **Phase 49: Mini PC Live Diagnostic (single-batch SSH)** — Capture root-cause fixtures for A1-A4 regressions in one SSH session.
- [ ] **Phase 50: A1 — Tool Registry Built-in Seed** — Defensive eager seed of 9 BUILT_IN_TOOL_IDS to `nexus:cap:tool:*` on livinityd boot, idempotent + isolated-Redis tested.
- [ ] **Phase 51: A2 — Streaming Regression Fix** — Apply targeted fix along Phase 49's identified path (UI build / PWA cache / sacred file D-40-01 edit / preset switch).
- [ ] **Phase 52: A3 — Marketplace State Correction (Server5)** — Re-seed Bolt.diy + un-seed MiroFish on Server5 `platform_apps`; document Bolt.diy wipe root cause.
- [ ] **Phase 53: A4 — Fail2ban Security Panel Render Fix** — Apply targeted fix along Phase 49's identified path (PWA / `user_preferences.security_panel_visible` default / sidebar `useMemo` filter).
- [ ] **Phase 54: B1 — Live-Verification Gate (Process Change)** — Add hard-block on `human_needed` UAT count to `/gsd-complete-milestone`; retroactively re-audit v29.4 to validate the gate.
- [ ] **Phase 55: Mandatory Milestone-Level Live Verification** — Deploy v29.5 to Mini PC + walk all 4 v29.4 + 6 v29.3 carry-forward UATs + confirm each regression CLOSED.

## Phase Details

### Phase 49: Mini PC Live Diagnostic (single-batch SSH)
**Goal**: Capture authoritative root-cause fixtures for A1-A4 regressions via ONE batched SSH session (no fail2ban self-DoS).
**Depends on**: Nothing
**Requirements**: FR-A1-01 (root cause confirmation), FR-A2-01, FR-A4-01, FR-A3-04 (Bolt.diy wipe root cause)
**Success Criteria** (what must be TRUE):
  1. A single SSH invocation has captured: `redis-cli KEYS 'nexus:cap:tool:*'` count, `update.sh` last-run log tail (vite build output), UI bundle mtime (`/opt/livos/livos/packages/ui/dist/index.html`), Past Deploys JSON tail, `journalctl -u livos --since '1h ago'`, `user_preferences` row for admin (`security_panel_visible`), and Phase 46 `security-section` chunk presence in `dist/assets/`.
  2. A separate Server5 SSH invocation has captured `SELECT id, name, status FROM platform_apps WHERE id IN ('bolt.diy', 'mirofish')` and recent platform git log (last 30 commits) for Bolt.diy wipe attribution.
  3. The diagnostic output is committed to `.planning/phases/49-mini-pc-diagnostic/49-DIAGNOSTIC-FIXTURE.md` so subsequent phases reference it instead of re-probing the Mini PC.
  4. Each of A1, A2, A3, A4 has a documented root-cause verdict (CONFIRMED hypothesis from REGRESSIONS.md, OR a new hypothesis with evidence).
  5. The orchestrator's IP is NOT banned by Mini PC fail2ban at the end of the phase (verified by a final connectivity check).
**Plans**: TBD

### Phase 50: A1 — Tool Registry Built-in Seed
**Goal**: 9 BUILT_IN_TOOL_IDS are deterministically present in `nexus:cap:tool:*` after every livinityd boot, surviving factory resets and partial syncs.
**Depends on**: Phase 49
**Requirements**: FR-A1-01, FR-A1-02
**Success Criteria** (what must be TRUE):
  1. A new `seed-builtin-tools.ts` module writes the 9 BUILT_IN_TOOL_IDS (shell, docker_run, docker_ps, docker_logs, docker_stop, files_read, files_write, files_search, web_search) to `nexus:cap:tool:*` idempotently as the first step after Redis connection in livinityd boot.
  2. An integration test against an isolated Redis instance asserts: ≥9 keys after seed, identical Redis state after re-seed (idempotent), correct `nexus:cap:meta:lastSeedAt` sentinel set.
  3. The seed module reuses the existing `BUILT_IN_TOOL_IDS` source-of-truth from `livos/packages/livinityd/source/modules/diagnostics/capabilities.ts` (no duplication of the manifest list).
  4. Live verification on Mini PC is deferred to Phase 55 (FR-A1-03 / FR-A1-04).
**Plans**: TBD

### Phase 51: A2 — Streaming Regression Fix
**Goal**: AI Chat shows token-by-token streaming again on live Mini PC (root cause from Phase 49 fixed at the right layer).
**Depends on**: Phase 49
**Requirements**: FR-A2-02, FR-A2-04
**Success Criteria** (what must be TRUE):
  1. The Phase 49 verdict on A2 root cause (UI bundle stale / PWA SW cache / sacred file model preset / upstream buffer) has a corresponding code or pipeline fix landed in this phase's commits.
  2. If the fix touches the sacred file `nexus/packages/core/src/sdk-agent-runner.ts`, the D-40-01 ritual is followed verbatim: byte count before/after recorded in plan SUMMARY, BASELINE_SHA pin in `sdk-agent-runner-integrity.test.ts` updated from `4f868d318abff71f8c8bfbcf443b2393a553018b` to the new value, audit comment added listing the surgical change rationale.
  3. If FR-MODEL-02's Branch N decision from v29.4 is reversed (model identity preset switch lands here), PROJECT.md Key Decisions section gains a new row documenting the reversal with rationale: "verdict=neither based on `response.model` field alone is insufficient evidence — colloquial chat behavior was the actual user-observable regression".
  4. Unit/integration tests cover the chosen fix path (e.g., if PWA SW cache: SW version-bump test; if sacred file: integrity test re-pinned + behavior-preserving snapshot test).
  5. Live verification on Mini PC is deferred to Phase 55 (FR-A2-03).
**Plans**: TBD
**UI hint**: yes

### Phase 52: A3 — Marketplace State Correction (Server5)
**Goal**: Server5 `platform_apps` table reflects user-intended state (Bolt.diy present, MiroFish absent) and the wipe root cause is documented for future hardening.
**Depends on**: Phase 49
**Requirements**: FR-A3-01, FR-A3-02, FR-A3-04
**Success Criteria** (what must be TRUE):
  1. Server5 SSH (`root@45.137.194.102`, NOT Mini PC) has executed an idempotent SQL migration that re-INSERTs Bolt.diy with `status='published'` (or platform-equivalent) and category metadata so it appears in marketplace Featured/Dev Tools.
  2. The same migration removes MiroFish (`DELETE` row OR `UPDATE status='archived'` per platform's soft-delete pattern, whichever matches existing schema).
  3. Any Server5-side cache (Redis platform cache, Cloudflare cache, Next.js ISR) is invalidated so the marketplace UI reflects the new state immediately.
  4. The migration is committed to a versioned location (e.g., `livinity-io-platform/migrations/<ts>-v29.5-marketplace-state.sql`) so it is reproducible and survives platform redeploys.
  5. FR-A3-04 root cause is documented in the phase SUMMARY: what wiped Bolt.diy between v43.11 and 2026-05-02 (Server5 deploy / manual SQL / cache desync / something else). Hardening the seed flow itself is explicitly out of scope per REQUIREMENTS Out-of-Scope.
  6. Live verification (browser visit to `livinity.io/marketplace`) is deferred to Phase 55 (FR-A3-03).
**Plans**: TBD

### Phase 53: A4 — Fail2ban Security Panel Render Fix
**Goal**: The 13th `LIVINITY_docker` sidebar entry "Security" renders for admin users, and clicking it shows the Phase 46 JailStatusCard + UnbanModal + AuditLog tabs.
**Depends on**: Phase 49
**Requirements**: FR-A4-02
**Success Criteria** (what must be TRUE):
  1. The Phase 49 verdict on A4 root cause (UI bundle stale / PWA SW cache / `user_preferences.security_panel_visible` defaults OFF / sidebar `useMemo` filter logic) has a corresponding fix landed in this phase's commits.
  2. If the fix is a DB migration (default ON), the migration ALTERs the column default AND backfills existing rows where value is NULL or false-by-default-bug, and the migration is reversible.
  3. If the fix is sidebar filter logic, the filter explicitly treats `preferences === undefined` and `preferences.security_panel_visible === undefined` as "visible" (default-allow for new sections shipped without preference rows).
  4. If the fix is PWA service worker cache, the SW version constant is bumped AND a cache-busting comment documents the user-facing implication ("first load post-deploy will re-fetch all assets").
  5. Unit/integration tests cover the chosen fix path (e.g., sidebar filter test for undefined preferences; migration up/down test).
  6. Live verification on Mini PC is deferred to Phase 55 (FR-A4-03 / FR-A4-04).
**Plans**: TBD
**UI hint**: yes

### Phase 54: B1 — Live-Verification Gate (Process Change)
**Goal**: `/gsd-complete-milestone` cannot return `passed` while any phase has `human_needed` verification status; v29.4's audit re-runs to `human_needed` proving the gate works on a known-failed case.
**Depends on**: Nothing (independent — runs in parallel with 50-53)
**Requirements**: FR-B1-01, FR-B1-02, FR-B1-03, FR-B1-04, FR-B1-05
**Success Criteria** (what must be TRUE):
  1. `/gsd-complete-milestone` workflow code scans every phase directory's `*-VERIFICATION.md` file and counts entries where `status: human_needed`.
  2. When the count is > 0, the workflow returns audit status `human_needed` (NOT `passed`) by default — the prior automatic-pass behavior is removed.
  3. The workflow asks the user via `AskUserQuestion` "Did you walk every UAT live on the target host?" with default answer "No" so that an accidental enter-key-to-confirm cannot bypass the gate.
  4. A `--accept-debt` override flag is supported for genuine emergencies; when invoked, an entry is appended to `MILESTONES.md` with timestamp, user-supplied reason, and the count of `human_needed` UATs that were waived (forensic trail).
  5. Re-running `/gsd-audit-milestone v29.4` after Phase 54 lands returns audit status `human_needed` (NOT the prior `passed`) until v29.5 Phase 55 walks the deferred v29.4 UATs — proving the gate logic on a known-failed milestone.
**Plans**: TBD

### Phase 55: Mandatory Milestone-Level Live Verification
**Goal**: All v29.5 fixes (Phases 50-53) and the v29.4 deferred UATs are confirmed live on Mini PC; each user-reported regression A1-A4 is independently confirmed CLOSED via fresh browser session; the new B1 gate signs off cleanly.
**Depends on**: Phase 50, 51, 52, 53, 54
**Requirements**: FR-A1-03, FR-A1-04, FR-A2-03, FR-A3-03, FR-A4-03, FR-A4-04, FR-VERIFY-01, FR-VERIFY-02, FR-VERIFY-03, FR-VERIFY-04, FR-VERIFY-05
**Success Criteria** (what must be TRUE — all USER-OBSERVABLE behaviors, NOT mechanism checks):
  1. **Deploy succeeds:** Mini PC has been deployed via `bash /opt/livos/update.sh` with all v29.5 source; Past Deploys panel shows a `<ts>-success.json` row for the v29.5 SHA; all four services (`livos`, `liv-core`, `liv-worker`, `liv-memory`) report `active` via `systemctl status`.
  2. **A1 closed:** On Mini PC, `redis-cli KEYS 'nexus:cap:tool:*'` returns ≥9 keys, AND a fresh AI Chat session successfully invokes `shell`, `docker_ps`, `files_read`, and `web_search` end-to-end with visible tool-call results in the chat UI (not "No such tool available" errors).
  3. **A2 closed:** On Mini PC, AI Chat shows visible token-by-token streaming for any prompt expected to take longer than 2 seconds — words appear progressively in the chat bubble, not all at once after the model finishes. If FR-MODEL-02 reversal happened in Phase 51, asking Nexus "Hangi modelsin?" three times produces consistent self-identification.
  4. **A3 closed:** A fresh browser session at `livinity.io/marketplace` shows Bolt.diy in Featured/Dev Tools with correct icon and metadata, AND MiroFish is absent from all marketplace category lists.
  5. **A4 closed:** A fresh browser session on Mini PC after a hard-reload shows the Server Management sidebar with 13 entries including "Security"; clicking Security renders JailStatusCard + UnbanModal + AuditLog tabs as built in Phase 46 with no console errors.
  6. **All deferred UATs walked:** Each of the 4 v29.4 UAT files (`45-UAT.md`, `46-UAT.md`, `47-UAT.md`, `48-UAT.md`) AND the 6 v29.3 carry-forward UAT files (`39-UAT.md` through `44-UAT.md`) has been executed step-by-step on live Mini PC, with each step result (PASS / FAIL / BLOCKED with reason) recorded in `.planning/phases/55-live-verification/55-UAT-RESULTS.md`.
  7. **Audit returns `passed`:** `v29.5-MILESTONE-AUDIT.md` returns status `passed` only after the new Phase 54 gate confirms `human_needed` count = 0 across all v29.5 phases.
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 49. Mini PC Live Diagnostic | 0/0 | Not started | - |
| 50. A1 Tool Registry Seed | 0/0 | Not started | - |
| 51. A2 Streaming Fix | 0/0 | Not started | - |
| 52. A3 Marketplace State | 0/0 | Not started | - |
| 53. A4 Security Panel Render | 0/0 | Not started | - |
| 54. B1 Verification Gate | 0/0 | Not started | - |
| 55. Live Milestone Verification | 0/0 | Not started | - |

## Dependency Graph

```
Phase 49 (diagnostic — single-batch SSH)
   |
   +--> Phase 50 (A1 tool seed)
   +--> Phase 51 (A2 streaming)
   +--> Phase 52 (A3 marketplace state — Server5)
   +--> Phase 53 (A4 security panel)
                                                 \
Phase 54 (B1 gate — independent, parallel-able)   +--> Phase 55 (live verify)
                                                 /
```

Phase 54 has no upstream dependency on Phase 49 — the gate code change is self-contained and can run in parallel with Phases 50-53. Phase 55 hard-depends on all of 50-54 because it walks UATs for each fix and exercises the new gate.

## Coverage

All 26 v29.5 requirements mapped to exactly one phase:

| Requirement | Phase |
|---|---|
| FR-A1-01 (root cause + seed module) | 49 (root cause), 50 (seed module) — split across diagnostic + fix |
| FR-A1-02 (idempotent seed integration test) | 50 |
| FR-A1-03 (live ≥9 keys post-deploy) | 55 |
| FR-A1-04 (live tool invocation succeeds) | 55 |
| FR-A2-01 (root cause identified) | 49 |
| FR-A2-02 (targeted fix applied) | 51 |
| FR-A2-03 (live token streaming visible) | 55 |
| FR-A2-04 (Branch N reversal documented) | 51 |
| FR-A3-01 (Bolt.diy re-seeded on Server5) | 52 |
| FR-A3-02 (MiroFish removed on Server5) | 52 |
| FR-A3-03 (live marketplace shows correct apps) | 55 |
| FR-A3-04 (Bolt.diy wipe root cause) | 49 (capture) — documented in 52 SUMMARY |
| FR-A4-01 (root cause identified) | 49 |
| FR-A4-02 (targeted fix applied) | 53 |
| FR-A4-03 (live sidebar shows 13 entries) | 55 |
| FR-A4-04 (live Security renders tabs) | 55 |
| FR-B1-01 (workflow scans VERIFICATION files) | 54 |
| FR-B1-02 (count > 0 returns human_needed) | 54 |
| FR-B1-03 (AskUserQuestion default "No") | 54 |
| FR-B1-04 (--accept-debt forensic trail) | 54 |
| FR-B1-05 (v29.4 retroactive re-audit) | 54 |
| FR-VERIFY-01 (deploy success) | 55 |
| FR-VERIFY-02 (4 v29.4 UATs walked) | 55 |
| FR-VERIFY-03 (6 v29.3 UATs walked) | 55 |
| FR-VERIFY-04 (4 regressions independently CLOSED) | 55 |
| FR-VERIFY-05 (audit `passed` only after gate clears) | 55 |

**Coverage:** 26/26 v29.5 requirements mapped (FR-A1-01 and FR-A3-04 each appear under two phases because the requirement spans diagnostic capture + downstream fix/documentation; the work is split by responsibility but each requirement closes only when both halves complete).

## Notes

- **Phase 49 SSH constraint:** ONE invocation to Mini PC, ONE invocation to Server5. Use `ssh ... 'bash -c "<all commands joined with semicolons>"'` pattern. Do NOT issue follow-up SSH calls within the same phase — if a follow-up is genuinely needed, schedule it 5+ minutes later.
- **Phase 51 sacred file edit (if root cause demands it):** Pre-edit SHA must equal `4f868d318abff71f8c8bfbcf443b2393a553018b`. Post-edit, update `sdk-agent-runner-integrity.test.ts` BASELINE_SHA constant to the new value. Add audit comment block above the edit listing: rationale, byte delta, sanity checks performed.
- **Phase 52 host targeting:** Server5 (`45.137.194.102`), NOT Mini PC, NOT Server4. Verify SSH target before running any SQL. Server4 references in any older planning artifact must be silently dropped per D-NO-SERVER4.
- **Phase 54 forensic trail format:** When `--accept-debt` is invoked, append to `MILESTONES.md` under a new "Live-Verification Gate Overrides" section: timestamp (ISO 8601 UTC) | milestone | UAT count waived | user-supplied reason | git SHA at time of override.
- **Phase 55 UAT results file:** `.planning/phases/55-live-verification/55-UAT-RESULTS.md` is the canonical output. Each UAT step gets one row: step ID | description | result (PASS / FAIL / BLOCKED) | evidence (screenshot path or shell output snippet) | timestamp.

---

## Project-Level Milestone Index (carry-over)

- v19.0 Custom Domain Management (shipped 2026-03-27)
- v20.0 Live Agent UI (shipped 2026-03-27)
- v21.0 Autonomous Agent Platform (shipped 2026-03-28)
- v22.0 Livinity AGI Platform (shipped 2026-03-29)
- v23.0 Mobile PWA (shipped 2026-04-01)
- v24.0 Mobile Responsive UI (shipped 2026-04-01)
- v25.0 Memory & WhatsApp Integration (shipped 2026-04-03)
- v26.0 Device Security & User Isolation (shipped 2026-04-24)
- v27.0 Docker Management Upgrade (shipped 2026-04-25)
- v28.0 Docker Management UI (Dockhand-Style) (shipped 2026-04-26)
- v29.0 Deploy & Update Stability (shipped 2026-04-27)
- v29.2 Factory Reset (shipped 2026-04-29)
- v29.3 Marketplace AI Broker (Subscription-Only) (shipped local 2026-05-01)
- v29.4 Server Management Tooling + Bug Sweep (shipped local 2026-05-01)
- **v29.5 v29.4 Hot-Patch Recovery + Verification Discipline** (started 2026-05-02)
- v30.0 Backup & Restore — PAUSED (8 phases defined; resumes after v29.5)

---

*Last updated: 2026-05-02 — v29.5 roadmap created from `v29.4-REGRESSIONS.md` fixture and `MILESTONE-CONTEXT.md`. Phases 49-55 derived from 26 reqs across 6 categories (A1/A2/A3/A4/B1/VERIFY) with 100% coverage.*
