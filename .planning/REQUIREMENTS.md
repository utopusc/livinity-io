# Milestone v29.5 Requirements — v29.4 Hot-Patch Recovery + Verification Discipline

**Milestone:** v29.5
**Started:** 2026-05-02
**Goal:** Close 4 user-reported v29.4 regressions (A1-A4) and add a mandatory live-verification gate (B1) so future milestones cannot ship `passed` without on-Mini-PC UAT execution.

**Source context:**
- `.planning/v29.4-REGRESSIONS.md` — diagnostic transcript with root-cause analysis + fix paths per regression
- `.planning/PROJECT.md` — Current Milestone block with target features
- `.planning/STATE.md` — accumulated v29.4 context (locked decisions, Mini PC ground truth, outstanding UATs)

---

## Active Requirements

### A1 — Tool Registry Restoration

Smoking gun: Mini PC `redis-cli KEYS 'nexus:cap:tool:*'` returns 0 keys. Production Re-sync writes zero keys (`D-WAVE5-SYNCALL-STUB`). Defensive eager seed (Path 2) is the recommended approach — survives factory resets, partial syncs, registry corruption.

- [ ] **FR-A1-01** — `livinityd` boot writes the 9 `BUILT_IN_TOOL_IDS` (shell, docker_run, docker_ps, docker_logs, docker_stop, files_read, files_write, files_search, web_search) to `nexus:cap:tool:*` idempotently as the first thing after Redis connection.
- [ ] **FR-A1-02** — The seed module passes an integration test against an isolated Redis instance asserting ≥9 keys present after seed, and that re-running the seed produces identical Redis state (idempotent).
- [ ] **FR-A1-03** — After Mini PC deploy + `systemctl restart livos`, `redis-cli KEYS 'nexus:cap:tool:*'` returns ≥9 keys.
- [ ] **FR-A1-04** — A fresh AI Chat session on Mini PC can successfully invoke at least `shell`, `docker_ps`, `files_read`, and `web_search` tools (live-verified in Phase 55).

### A2 — Streaming Regression Fix

User report: "streaming tamamiyla gitmis artik tamamen butun islemi bitirdikten sonra gonderiyor". Root cause unknown — multiple candidates (UI bundle stale due to 1m 2s deploy too short for vite, PWA service worker cache, sacred file model identity preset, or upstream buffer). Branch N (verdict=neither) for FR-MODEL-02 was the wrong call and must be reversed if root cause is the model preset.

- [ ] **FR-A2-01** — Root cause of the streaming regression is identified and documented (UI bundle / PWA cache / sacred file preset / upstream buffer / other) via Phase 49 diagnostic.
- [ ] **FR-A2-02** — Targeted fix applied along the identified path. If a sacred file edit is required, the D-40-01 surgical-edit ritual is followed (one-line change, byte-counted before/after, SHA pin updated, audit comment added).
- [ ] **FR-A2-03** — On live Mini PC, AI Chat shows token-by-token streaming for any prompt expected to take longer than 2 seconds (live-verified in Phase 55).
- [ ] **FR-A2-04** — If FR-MODEL-02's Branch N decision is reversed, the new model-identity preset switch is documented in PROJECT.md Key Decisions with explicit rationale ("verdict=neither based on `response.model` field alone is insufficient evidence").

### A3 — Marketplace State Correction

Server5 `platform_apps` table has stale state — Bolt.diy missing (was seeded v43.11 but wiped by some factory reset / never propagated), MiroFish still present (was dropped at v29.3 close per user direction but seed entry never updated to status='archived' or DELETEd).

- [ ] **FR-A3-01** — Server5 `platform_apps` SQL re-inserts Bolt.diy with appropriate status (`published` or equivalent) and category metadata so it appears in marketplace Featured/Dev Tools.
- [ ] **FR-A3-02** — Server5 `platform_apps` SQL removes MiroFish (DELETE row OR status='archived' if soft-delete pattern is used).
- [ ] **FR-A3-03** — Browser visit to `livinity.io/marketplace` shows Bolt.diy in Featured/Dev Tools and MiroFish absent (live-verified in Phase 55).
- [ ] **FR-A3-04** — Root cause of the original Bolt.diy wipe is identified and documented (so the seed flow can be hardened later — out of scope for this milestone, but tracked).

### A4 — Fail2ban Security Panel Render Fix

Phase 46 added 13th SECTION_ID 'security' inside `LIVINITY_docker`. User says they don't see it. Multiple candidates: stale UI bundle (same root as A2), PWA service worker cache, `user_preferences.security_panel_visible` defaulting to OFF instead of ON (FR-F2B-06 said default ON), sidebar `useMemo` filter incorrectly hiding 'security' when feature flag is undefined.

- [ ] **FR-A4-01** — Root cause identified via Phase 49 diagnostic + browser hard-reload test on Mini PC (PWA cache vs DB default vs sidebar filter logic vs UI bundle stale).
- [ ] **FR-A4-02** — Targeted fix applied. If `user_preferences.security_panel_visible` defaults to OFF, migration ALTERs the default to ON and backfills existing rows. If sidebar filter hides on undefined, filter logic treats undefined as visible. If PWA cache, service worker version bumped.
- [ ] **FR-A4-03** — On live Mini PC after browser hard-reload, Server Management sidebar shows 13 entries including "Security" (live-verified in Phase 55).
- [ ] **FR-A4-04** — Opening Security renders JailStatusCard + UnbanModal + AuditLog tabs as built in Phase 46 (live-verified in Phase 55).

### B1 — Live-Verification Gate (Process Change)

The single most important deliverable. v29.4's audit returned `passed` because `human_needed` UAT deferrals were treated as routine. New rule: milestones cannot close `passed` until UAT has been executed live.

- [ ] **FR-B1-01** — `/gsd-complete-milestone` workflow scans all phase `*-VERIFICATION.md` files and counts those with `status: human_needed`.
- [ ] **FR-B1-02** — If the count is > 0, audit status returns `human_needed` (NOT `passed`) by default until UAT execution is confirmed.
- [ ] **FR-B1-03** — Workflow asks the user explicitly via `AskUserQuestion` whether live UATs were walked, defaulting to "No" so accidental enter-key-to-confirm cannot bypass the gate.
- [ ] **FR-B1-04** — `--accept-debt` override flag is supported for genuine emergencies. When used, the decision is logged to `MILESTONES.md` with timestamp and reason so it leaves a forensic trail.
- [ ] **FR-B1-05** — Re-running `/gsd-audit-milestone v29.4` retroactively (after the gate ships) produces status `human_needed` instead of `passed` until v29.5's Phase 55 walks the v29.4 UATs (validates the gate logic on a known-failed case).

### VERIFY — Mandatory Live Milestone-Level Verification

The verification phase that every future milestone should mirror. Without this, B1's gate cannot prove itself. Walks every outstanding UAT (v29.5's own 4-5 UATs + the 4 v29.4 carry-forwards + the 6 v29.3 carry-forwards = 14-15 UAT files total).

- [ ] **FR-VERIFY-01** — Mini PC deployed with all v29.5 source via `bash /opt/livos/update.sh`; deploy success confirmed via Past Deploys panel (`<ts>-success.json` row present, services `active`).
- [ ] **FR-VERIFY-02** — All 4 v29.4 phase UATs (`45-UAT.md`, `46-UAT.md`, `47-UAT.md`, `48-UAT.md`) walked step-by-step on live Mini PC; each step result (PASS / FAIL / BLOCKED with reason) recorded.
- [ ] **FR-VERIFY-03** — All 6 v29.3 carry-forward UATs (`39-UAT.md` through `44-UAT.md`) walked step-by-step on live Mini PC; each step result recorded.
- [ ] **FR-VERIFY-04** — Each of the 4 v29.4 regressions (A1-A4) is independently confirmed CLOSED via a fresh browser session on Mini PC (so the user's original complaints are demonstrably resolved).
- [ ] **FR-VERIFY-05** — `v29.5-MILESTONE-AUDIT.md` returns status `passed` only after FR-VERIFY-01..04 are all green AND B1's new gate confirms `human_needed` count = 0.

---

## Out of Scope

Explicitly NOT in v29.5:
- New chat UIs, marketplace anchor apps, multi-LLM routing
- v30.0 Backup unfreeze (still paused)
- B3b active SSH gateway via cloudflared (still deferred)
- POSIX-account-backed per-user isolation (D-40-05 still deferred to future security audit)
- macOS / Linux accessibility tree support
- Server4 anything (D-NO-SERVER4 hard rule)
- Hardening the Server5 `platform_apps` seed flow itself (FR-A3-04 documents root cause but the hardening fix is out of scope — only the immediate state correction is in scope)

## Locked Decisions (carry from v29.4)

- **D-NO-NEW-DEPS** preserved
- **D-NO-SERVER4** preserved (Mini PC + Server5 only; Server4 off-limits)
- **D-LIVINITYD-IS-ROOT** preserved
- **Sacred file** `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — A2 may require a surgical edit per D-40-01 ritual (one-line, SHA pin updated)
- **D-LIVE-VERIFICATION-GATE (NEW)** — milestones cannot close `passed` without on-Mini-PC UAT execution per relevant phase. Adds a hard checkpoint to `complete-milestone`. Implemented as FR-B1-01..05.

## Traceability

Filled 2026-05-02 by gsd-roadmapper. Phase mapping continues from v29.4's last phase (48); v29.5 phases start at 49.

**Phase summary:**
- Phase 49 — Mini PC Live Diagnostic (single-batch SSH)
- Phase 50 — A1 Tool Registry Built-in Seed
- Phase 51 — A2 Streaming Regression Fix
- Phase 52 — A3 Marketplace State Correction (Server5)
- Phase 53 — A4 Fail2ban Security Panel Render Fix
- Phase 54 — B1 Live-Verification Gate (Process Change)
- Phase 55 — Mandatory Milestone-Level Live Verification

| Requirement | Phase | Status |
|---|---|---|
| FR-A1-01 (boot seed module + root-cause confirmation) | 49 + 50 | pending |
| FR-A1-02 (idempotent isolated-Redis integration test) | 50 | pending |
| FR-A1-03 (live ≥9 keys post-deploy) | 55 | pending |
| FR-A1-04 (live tool invocation succeeds) | 55 | pending |
| FR-A2-01 (root cause identified) | 49 | pending |
| FR-A2-02 (targeted fix applied; D-40-01 ritual if sacred edit) | 51 | pending |
| FR-A2-03 (live token streaming visible) | 55 | pending |
| FR-A2-04 (Branch N reversal documented in PROJECT.md) | 51 | pending |
| FR-A3-01 (Bolt.diy re-seeded on Server5) | 52 | pending |
| FR-A3-02 (MiroFish removed on Server5) | 52 | pending |
| FR-A3-03 (live marketplace shows correct apps) | 55 | pending |
| FR-A3-04 (Bolt.diy wipe root cause documented) | 49 + 52 | pending |
| FR-A4-01 (root cause identified) | 49 | pending |
| FR-A4-02 (targeted fix applied) | 53 | pending |
| FR-A4-03 (live sidebar shows 13 entries incl. Security) | 55 | pending |
| FR-A4-04 (live Security renders Phase 46 tabs) | 55 | pending |
| FR-B1-01 (workflow scans VERIFICATION files) | 54 | pending |
| FR-B1-02 (count > 0 returns human_needed) | 54 | pending |
| FR-B1-03 (AskUserQuestion default "No") | 54 | pending |
| FR-B1-04 (--accept-debt forensic trail in MILESTONES.md) | 54 | pending |
| FR-B1-05 (v29.4 retroactive re-audit returns human_needed) | 54 | pending |
| FR-VERIFY-01 (Mini PC deploy success) | 55 | pending |
| FR-VERIFY-02 (4 v29.4 UATs walked) | 55 | pending |
| FR-VERIFY-03 (6 v29.3 UATs walked) | 55 | pending |
| FR-VERIFY-04 (4 regressions independently CLOSED) | 55 | pending |
| FR-VERIFY-05 (audit `passed` only after gate clears) | 55 | pending |

**Coverage:** 26/26 requirements mapped 100%. No orphans. FR-A1-01 and FR-A3-04 each span two phases (diagnostic capture + downstream fix/documentation) — the requirement closes only when both halves complete.

**Total:** 26 requirements across 6 categories.
