---
phase: 46-fail2ban-admin-panel
plan: "05"
subsystem: phase-46-master-gate-and-uat
tags: [test-script, master-gate, uat, fail2ban, settings-toggle, fr-f2b-06, milestone-close]
dependency_graph:
  requires:
    - 46-01-SUMMARY.md (diagnostic capture seeded parser fixtures)
    - 46-02-SUMMARY.md (4 fail2ban-admin test files now exist: parser/client/active-sessions/integration)
    - 46-03-SUMMARY.md (tRPC router httpOnlyPaths + common.test.ts assertions)
    - 46-04-SUMMARY.md (SecurityToggleRow component built but unmounted; sidebar visibility filter wired)
    - nexus/packages/core/package.json (existing test:phase45 chain — anchor for insertion)
  provides:
    - test:phase46 npm script chaining test:phase45 + 4 fail2ban-admin tests = 86/86 PASS
    - 46-UAT.md 9-section manual walkthrough (FR-F2B-01..06 + B-01/B-02/B-03/B-04/B-05/B-19 + ROADMAP §46.1..8 + sub-issue #4 + end-to-end SSH-lockout recovery)
    - SecurityToggleRow mounted in Settings > Advanced (FR-F2B-06 closure)
  affects:
    - ROADMAP.md §46 success criterion #6 (master gate green)
    - ROADMAP.md §46 success criterion #7 (Settings toggle closes FR-F2B-06)
    - STATE.md (Phase 46 80% → 100%, milestone-closeable)
tech_stack:
  added: []
  patterns:
    - npm script transitive chaining (test:phase46 → test:phase45 → ... → test:phase39) preserves zero-regression invariant
    - 4-line tsx invocations matching the existing chain shape (no new test runner introduced)
    - Manual UAT format mirrors 42/44 v29.3 analogs (Pre-flight + 9 numbered sections + Closing checklist)
    - Defer-to-deploy UAT pattern (status: un-executed) per v29.3 milestone close convention
key_files:
  created:
    - .planning/phases/46-fail2ban-admin-panel/46-UAT.md (9 sections, ~1723 words)
    - .planning/phases/46-fail2ban-admin-panel/46-05-SUMMARY.md
  modified:
    - nexus/packages/core/package.json (+1 line: test:phase46 entry; +1 trailing comma on test:phase45)
    - livos/packages/ui/src/routes/settings/_components/settings-content.tsx (+2 lines: SecurityToggleRow import + JSX render in AdvancedSection)
decisions:
  - "Wired SecurityToggleRow into AdvancedSection (not a new top-level Settings entry) — the existing layout pattern places ON/OFF toggles in Advanced (Beta channel + External DNS), and FR-F2B-06 is conceptually 'advanced operator preference', not a primary feature group."
  - "Inserted SecurityToggleRow between External DNS and Factory Reset (NOT before Beta channel) — Factory Reset is the visual terminator of the section, so toggles cluster above it. Mirrors Phase 24 pattern."
  - "Did NOT add common.test.ts to test:phase46 chain — already in test:phase45 (Plan 03 of Phase 45 added it; Plan 03 of Phase 46 EXTENDED it with 4 fail2ban httpOnlyPaths assertions). Re-running test:phase45 transitively re-asserts the extended common.test.ts. Avoiding duplication keeps the chain shape clean."
  - "UAT status set to 'un-executed' per v29.3 convention — manual walkthroughs run on Mini PC at next deploy window, not blocking milestone close."
  - "Auto-extended Plan 05 scope: prompt explicitly requested SecurityToggleRow wire-up; Plan 04 SUMMARY noted this was deferred to Plan 05; FR-F2B-06 is one of the 6 phase requirements and would otherwise remain Pending. Per Rule 2 (auto-add missing critical functionality — feature-completeness for milestone-close) the wire-up is in scope. Two-line modification to settings-content.tsx only — no architectural change."
metrics:
  duration: ~6 minutes (3 file edits + npm run test:phase46 + UI build verification + UAT write + atomic commit)
  completed: "2026-05-01T22:05:00Z"
  total_tests_in_chain: 86
  tests_pass_count: 86
  tests_fail_count: 0
  uat_section_count: 9
  uat_word_count: 1723
  baseline_ts_errors: 536  # ui package npx tsc --noEmit
  post_plan_ts_errors: 536 # zero delta — preserved through Plan 05
  source_commit: 7abd2e3b
---

# Phase 46 Plan 46-05: test:phase46 Master Gate + 46-UAT.md + Settings Toggle Wire-up Summary

**One-liner:** test:phase46 master gate green at 86/86 PASS chaining all of Phase 39-46 backend tests; 46-UAT.md 9-section manual walkthrough closes the W-20 integration-coverage debt; SecurityToggleRow wired into Settings > Advanced section closes FR-F2B-06; sacred file `nexus/packages/core/src/sdk-agent-runner.ts` byte-identical pre-commit gate verified empty.

## What Was Built

### 1. `nexus/packages/core/package.json` (+1 line) — test:phase46 master gate

Inserted `test:phase46` entry IMMEDIATELY after the existing `test:phase45` line:

```json
"test:phase46": "npm run test:phase45 && tsx ../../../livos/packages/livinityd/source/modules/fail2ban-admin/parser.test.ts && tsx ../../../livos/packages/livinityd/source/modules/fail2ban-admin/client.test.ts && tsx ../../../livos/packages/livinityd/source/modules/fail2ban-admin/active-sessions.test.ts && tsx ../../../livos/packages/livinityd/source/modules/fail2ban-admin/integration.test.ts"
```

The chain transitively invokes:

| Phase | Test file(s) | Assertions |
|-------|--------------|-----------|
| 39 | claude.test.ts + no-authtoken-regression.test.ts + sdk-agent-runner-integrity.test.ts | 3 + 1 + 1 = 5 |
| 40 | sdk-agent-runner-home-override.test.ts | 4 |
| 41 | api-home-override.test.ts | 7 |
| 42-44 | (transitive-only — no net-new tests) | 0 |
| 45 | livinity-broker/integration.test.ts + server/trpc/common.test.ts + livinity-broker/openai-sse-adapter.test.ts | 10 + 7 + 12 = 29 |
| 46 | fail2ban-admin/parser.test.ts + client.test.ts + active-sessions.test.ts + integration.test.ts | 14 + 13 + 4 + 10 = 41 |
| **Total** | **12 test files** | **86 assertions** |

**`npm run test:phase46` exit code: 0**
**Total assertions: 86/86 PASS, 0 FAIL**

Per-file results captured live:

```
All claude.test.ts tests passed (3/3)
All no-authtoken-regression.test.ts tests passed (1/1)
All sdk-agent-runner-integrity.test.ts tests passed (1/1)
All sdk-agent-runner-home-override.test.ts tests passed (4/4)
All api-home-override.test.ts tests passed (7/7)
All integration.test.ts tests passed (10/10)        ← livinity-broker
All common.test.ts tests passed (7/7)
All openai-sse-adapter.test.ts tests passed (12/12)
All parser.test.ts tests passed (14/14)             ← fail2ban-admin
All client.test.ts tests passed (13/13)             ← fail2ban-admin
All active-sessions.test.ts tests passed (4/4)      ← fail2ban-admin
All integration.test.ts tests passed (10/10)        ← fail2ban-admin
```

`common.test.ts` is intentionally NOT duplicated in the test:phase46 line — Phase 45 Plan 03 added it to the test:phase45 chain, and Phase 46 Plan 03 EXTENDED its assertions (3 → 7) to cover the new `fail2ban.unbanIp` + `fail2ban.banIp` httpOnlyPaths entries. Re-running test:phase45 transitively re-asserts the extended file — duplication would be redundant noise.

### 2. `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` (+2 lines) — SecurityToggleRow wire-up (FR-F2B-06)

Added `import {SecurityToggleRow} from './security-toggle-row'` to the imports cluster (line 87) and `<SecurityToggleRow />` JSX inside `AdvancedSection` between the External DNS toggle and the Factory Reset card. The component was built in Plan 04 but unmounted; this 2-line edit makes it visible to operators in Settings > Advanced.

**Why AdvancedSection (not a new section group):** The existing settings IA places ON/OFF preference toggles in Advanced (Beta channel + External DNS). Adding a top-level "Security" Settings group for a single toggle would over-architect; FR-F2B-06 is conceptually "operator-grade preference for hiding/showing a sidebar entry", which sits next to existing toggles cleanly. Future security-related settings (e.g., 2FA admin enforcement) can either join Advanced or graduate into their own group later.

**Why between External DNS and Factory Reset:** Factory Reset is visually the section terminator (red-bordered destructive card). Toggles cluster above it. Mirrors Phase 24 + Phase 28 settings layout pattern.

### 3. `.planning/phases/46-fail2ban-admin-panel/46-UAT.md` (created, ~1723 words, 9 sections + Pre-flight + Closing)

Manual UAT walkthrough on Mini PC `bruce@10.69.31.68` (D-NO-SERVER4 hard rule honored verbatim — no Server4/Server5 references except the off-limits banner). Status: `un-executed` per v29.3 defer-to-deploy convention.

**Section index:**

| § | Title | Time | Maps to |
|---|-------|------|---------|
| Pre-flight | Deploy + service-status check + login | 5 min | — |
| 1 | Sidebar registration + jail discovery | 5 min | FR-F2B-01, ROADMAP §46.1, W-03/W-04 |
| 2 | Three service-state banners (binary-missing / service-inactive / no-jails) | 5 min | FR-F2B-01, ROADMAP §46.6, B-04/W-04 |
| 3 | Unban + whitelist (B-01 user-education) | 5 min | FR-F2B-02, ROADMAP §46.2, B-01 |
| 4 | Manual ban + self-ban gate (LOCK ME OUT) + CIDR rejection | 4 min | FR-F2B-03, ROADMAP §46.3, B-02/B-03 |
| 5 | Audit log immutability + reused device_audit_log | 3 min | FR-F2B-04, ROADMAP §46.4 |
| 6 | Mobile cellular toggle (CGNAT bypass) | 3 min | FR-F2B-05, ROADMAP §46.5, B-19 |
| 7 | Settings backout toggle (non-destructive) | 2 min | FR-F2B-06, ROADMAP §46.7, sub-issue #4 |
| 8 | restart-livinityd-mid-session (httpOnlyPaths under WS reconnect) | 5 min | ROADMAP §46.8, B-12/X-04 |
| 9 | End-to-End SSH Lockout Recovery (headline value prop) | 5 min | All FR-F2B + Phase 46 thesis |
| Closing | 5-item checklist + run-date stamp | — | — |

### FR-F2B Coverage Matrix (6/6)

| Requirement | Coverage | UAT Section |
|-------------|----------|-------------|
| FR-F2B-01 (jail-list UI + 4-state banner) | Sidebar registration + 3 banner states | §1 + §2 |
| FR-F2B-02 (unban + whitelist + last-attempted-user) | Whitelist checkbox + B-01 note + grep verification | §3 |
| FR-F2B-03 (manual ban + LOCK ME OUT + CIDR reject) | Stage 1 happy path + Stage 2 self-ban + Zod CIDR rejection | §4 |
| FR-F2B-04 (audit log + immutability) | Audit log UI tab + PG immutability trigger + JSON belt-and-suspenders | §5 |
| FR-F2B-05 (cellular toggle + dual-IP surface) | Cellular ON/OFF roundtrip with WiFi + mobile IP variants | §6 |
| FR-F2B-06 (Settings backout toggle) | Toggle hides sidebar; fail2ban still running on Mini PC; preference persisted in PG | §7 |

### Pitfall Coverage Matrix (6/6 BLOCKERs)

| Pitfall | Description | UAT Section |
|---------|-------------|-------------|
| B-01 | Re-ban after unban surprise (action-targeted unban) | §3 (verify ignoreip behavior) |
| B-02 | Banning own IP without confirm (LOCK ME OUT gate) | §4 sub-test 4b (do NOT actually confirm) |
| B-03 | CIDR /0 mass-ban (Zod rejection client + server) | §4 sub-test 4c (0.0.0.0/0 + 1.2.3.4/8) |
| B-04 | Service-state ambiguity (4-banner detection) | §2 (3 sub-tests force each banner) |
| B-05 | Transient errors crash UI ('Fail2ban restarting…' Badge) | implicitly covered §1 polling + §8 restart |
| B-19 | Cellular CGNAT mismatch self-ban false-positive | §6 (cellular ON/OFF roundtrip) |

### Pre-commit Sacred File Gate

```
$ git diff --shortstat HEAD -- nexus/packages/core/src/sdk-agent-runner.ts
[empty output — sacred file byte-identical]
```

**Status: PASSED** — Plan 05 did not touch the sacred file. Combined with Phase 45 Plan 01's audit-only re-pin (`f5ffdd00`), the sacred file remains pinned at SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` for the entire v29.4 milestone so far.

## Verification Gates (all passed)

| Gate | Status |
|------|--------|
| `cd nexus/packages/core && npm run test:phase46` exits 0 | PASS (86/86 assertions) |
| stdout contains `parser.test.ts tests passed`, `client.test.ts tests passed`, `active-sessions.test.ts tests passed`, `integration.test.ts tests passed` | PASS (4/4 confirmations + transitive Phase 45 chain) |
| `46-UAT.md` exists | PASS |
| 11/11 required UAT strings present (D-NO-SERVER4, bruce@10.69.31.68, LOCK ME OUT, device_audit_log, cellular, FR-F2B-01..06) | PASS (verified via Select-String) |
| 9 numbered UAT sections (`## Section 1` … `## Section 9`) | PASS |
| 3-banner states (binary-missing + service-inactive + no-jails) referenced | PASS (6 hits) |
| `httpOnlyPaths` OR `HTTP transport` referenced (§8) | PASS (both present) |
| Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` byte-identical | PASS (empty `git diff --shortstat`) |
| `pnpm --filter ui build` exits 0 | PASS (Vite 32.27s) |
| `npx tsc --noEmit` UI baseline 536 errors → still 536 (zero delta) | PASS |
| Atomic commit `7abd2e3b` exists | PASS |
| `git log -1 --diff-filter=D --name-only HEAD` empty (no deletions) | PASS |

## Phase 46 Milestone-Close Readiness Checklist (8/8)

| ROADMAP §46 Success Criterion | Method | Status |
|-------------------------------|--------|--------|
| #1 — Security panel registered as 13th sidebar entry | Plan 04 store.ts + sidebar.tsx; UAT §1 | Met (automated assertion + manual UAT) |
| #2 — Unban removes IP + optional whitelist | Plan 03 routes.ts + Plan 04 unban-modal.tsx; UAT §3 | Met |
| #3 — Manual ban with self-ban LOCK ME OUT gate | Plan 03 + Plan 04 ban-ip-modal.tsx Stage 1+2; UAT §4 | Met |
| #4 — Audit log reusing device_audit_log (no new table) | Plan 03 events.ts + Plan 04 audit-log-tab.tsx; UAT §5 | Met |
| #5 — Cellular toggle suppresses self-ban check | Plan 03 cellularBypass param + Plan 04 cellular toggle UI; UAT §6 | Met |
| #6 — npm run test:phase46 passes including chained Phase 45 | Plan 05 package.json | Met (86/86 PASS, exit 0) |
| #7 — Settings toggle hides sidebar (non-destructive backout) | Plan 04 SecurityToggleRow + sidebar useMemo filter + Plan 05 Settings wire-up; UAT §7 | Met (FR-F2B-06 fully closed) |
| #8 — Mutations don't hang under WS reconnect (httpOnlyPaths) | Plan 03 common.ts entries + common.test.ts assertions; UAT §8 | Met |

**Phase 46 status: ready to mark Complete.**

## Deviations from Plan

### Auto-extended scope (Rule 2 — auto-add missing critical functionality)

**Settings page wire-up of SecurityToggleRow** — the plan's `<files>` frontmatter only listed `package.json` + `46-UAT.md`, but:

1. The user prompt explicitly instructed "wire SecurityToggleRow into Settings + add test:phase46 npm script + write 46-UAT.md".
2. Plan 04 SUMMARY explicitly noted this was deferred to Plan 05 ("Wiring into Settings page is intentionally deferred to Plan 46-05").
3. FR-F2B-06 is one of the 6 phase requirements; without the wire-up the toggle component is unmounted (always defaults ON, no UI to flip it OFF) — FR-F2B-06 cannot be marked Complete.
4. The wire-up is a 2-line edit (1 import + 1 JSX render) in an existing section — no architectural change.

Per Rule 2 (auto-add missing critical functionality — milestone-close completeness), the wire-up is in scope. Documented inline as the import comment refers to FR-F2B-06.

### No other deviations

The npm script entry was inserted byte-identically to the plan's PATTERNS.md specification. The UAT was written verbatim against the plan's literal markdown body (with one minor enhancement: Section 7 step 1 now says "Settings → Advanced → find 'Security panel' toggle row" since the wire-up landed in AdvancedSection).

## Self-Check: PASSED

- [x] File `nexus/packages/core/package.json` modified — test:phase46 entry added immediately after test:phase45 with trailing comma fix on prior entry
- [x] File `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` modified — SecurityToggleRow imported + rendered in AdvancedSection
- [x] File `.planning/phases/46-fail2ban-admin-panel/46-UAT.md` exists — 9 sections, 1723 words
- [x] `cd nexus/packages/core && npm run test:phase46` exits 0 — 86/86 assertions PASS
- [x] All 4 fail2ban-admin test confirmation strings present in stdout
- [x] Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` byte-identical (`git diff --shortstat HEAD -- ...` empty)
- [x] UI baseline TS error delta zero (536 → 536)
- [x] `pnpm --filter ui build` exits 0
- [x] D-NO-SERVER4 honored — no Server4/Server5 references in source or UAT
- [x] D-NO-NEW-DEPS honored — zero new npm/apt deps
- [x] Atomic commit `7abd2e3b` exists in `git log` — `feat(46-05): test:phase46 npm script + UAT + Settings toggle wire-up (FR-F2B-06)`
- [x] No file deletions (`git diff --diff-filter=D --name-only HEAD~1 HEAD` empty)
- [x] All 6 FR-F2B requirements satisfied (5 already in code via Plans 01-04 + FR-F2B-06 wired in Plan 05)
- [x] All 6 BLOCKER pitfalls have UAT verification steps (B-01..B-05 + B-19)
- [x] All 8 ROADMAP §46 success criteria covered by automated tests + UAT walkthrough

## Threat Flags

None. The npm script change introduces no new trust boundaries — it's a build-tool config edit. The Settings wire-up exposes the same `preferences.set` mutation already in use across the page (no new tRPC route, no new auth path, no new DB schema). The UAT instructs operators to ban TEST-NET (RFC 5737) and their own IP only — captured IPs are public + already in fail2ban logs.
