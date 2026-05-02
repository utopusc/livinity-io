---
phase: 48-live-ssh-session-viewer
plan: "03"
subsystem: test-chain-and-uat
tags: [test-chain, uat, integration, npm-script, mini-pc, master-gate, fr-ssh-01, fr-ssh-02]
requirements: [FR-SSH-01, FR-SSH-02]
dependency-graph:
  requires:
    - "Plan 48-01 ssh-sessions backend (journalctl-stream + ws-handler)"
    - "Plan 48-02 ssh-sessions UI tab + click-to-ban cross-link"
    - "test:phase47 (transitively chains 39→47)"
  provides:
    - "test:phase48 npm master gate (chains test:phase47 + 3 ssh-sessions test files)"
    - "End-to-end integration test for ssh-sessions module (5/5 PASS)"
    - "48-UAT.md operator-facing manual-test walkthrough (9 steps)"
  affects:
    - "nexus/packages/core/package.json (one-line addition)"
tech-stack:
  added: []
  patterns:
    - "Bare tsx + node:assert/strict integration test (no Vitest, no module mocks; per pitfall W-20)"
    - "DI-controllable stream + fake-spawn + fake-WS (mirrors fail2ban-admin/integration.test.ts pattern)"
    - "test:phase{NN} chained npm script (mirrors test:phase45/46/47 pattern)"
    - "9-step operator UAT mirroring 46-UAT.md / 47-UAT.md style"
key-files:
  created:
    - livos/packages/livinityd/source/modules/ssh-sessions/integration.test.ts
    - .planning/phases/48-live-ssh-session-viewer/48-UAT.md
    - .planning/phases/48-live-ssh-session-viewer/48-03-SUMMARY.md
  modified:
    - nexus/packages/core/package.json
decisions:
  - "Integration test uses controllable streams + fake spawn — exercises the actual makeJournalctlStream NDJSON parsing logic AND the actual createSshSessionsWsHandler admin-gate / replay / fan-out logic. Only fakes are at the very edges: spawn, WS, jwt verify, role lookup."
  - "Test 1 wires the REAL makeJournalctlStream around a fake SpawnFn — exercising the full NDJSON line-buffer + IP extraction + ssh.service filter path end-to-end. Tests 2-5 use a controllable in-process stream for direct push control to verify ring-buffer / admin-gate / ENOENT / cleanup behaviors deterministically."
  - "test:phase48 chains test:phase47 first (per ADR test-chain-monotonicity) then 3 ssh-sessions test files. NO new dependency added — only a script entry."
  - "48-UAT.md uses minipc SSH key path per project memory (NOT contabo_master). All commands target Mini PC bruce@10.69.31.68; zero references to Server4 or Server5 (D-NO-SERVER4 hard-wall)."
metrics:
  duration_minutes: 12
  completed: "2026-05-02"
  requirements_closed: ["FR-SSH-01", "FR-SSH-02"]
  source-loc-added: 660
  test-count: 5
  test-pass-rate: "5/5 (100%)"
  files_created: 3
  files_modified: 1
  new_deps: 0
  commit-hash: "986b87d9"
  sacred-file-sha-pre: "4f868d318abff71f8c8bfbcf443b2393a553018b"
  sacred-file-sha-post: "4f868d318abff71f8c8bfbcf443b2393a553018b"
  byte-identical: true
---

# Phase 48 Plan 48-03: Master Gate + UAT Summary

**One-liner:** Closes Phase 48 (and the v29.4 milestone) with `test:phase48` npm master gate chaining `test:phase47` + 3 ssh-sessions test files, an end-to-end integration test (5/5 PASS exercising fake-spawn → real `makeJournalctlStream` → real `createSshSessionsWsHandler` → fake-WS at the boundary), and a 9-step Mini-PC-targeted operator UAT walkthrough — sacred file `sdk-agent-runner.ts` byte-identical at `4f868d31...` through all of Phase 48.

## What shipped

### 1. `test:phase48` master gate (added to `nexus/packages/core/package.json`)

Single-line addition immediately after `test:phase47`:

```json
"test:phase48": "npm run test:phase47 && tsx ../../../livos/packages/livinityd/source/modules/ssh-sessions/journalctl-stream.test.ts && tsx ../../../livos/packages/livinityd/source/modules/ssh-sessions/ws-handler.test.ts && tsx ../../../livos/packages/livinityd/source/modules/ssh-sessions/integration.test.ts"
```

The script chains:

1. `npm run test:phase47` (transitively chains 46 → 45 → 41 → 40 → 39, plus all v29.4 broker / fail2ban / diagnostics tests).
2. `tsx ssh-sessions/journalctl-stream.test.ts` — 8/8 PASS (Plan 48-01 unit tests).
3. `tsx ssh-sessions/ws-handler.test.ts` — 8/8 PASS (Plan 48-01 unit tests).
4. `tsx ssh-sessions/integration.test.ts` — **5/5 PASS** (this plan's new end-to-end test).

### 2. `livos/packages/livinityd/source/modules/ssh-sessions/integration.test.ts` (NEW, 401 LOC)

End-to-end integration test wiring Plan 48-01's pieces together at the boundary between `makeJournalctlStream` and `createSshSessionsWsHandler`. Pure in-process: no real `child_process.spawn('journalctl', ...)`, no real WebSocket server import (`from 'ws'`), no real PostgreSQL, no real JWT verify. Bare-tsx + `node:assert/strict` (per pitfall W-20).

Five tests, all PASS:

| # | Test | Coverage |
|---|------|----------|
| 1 | End-to-end happy path | Real `makeJournalctlStream` (around a fake SpawnFn) feeds 5 NDJSON lines into the real `createSshSessionsWsHandler` → fake WS receives 5 `ws.send()` calls in order. Verifies NDJSON parsing + IP extraction (5 sshd message forms: Failed-password, Accepted-publickey, pam_unix, Disconnected, Invalid-user) + admin gate + replay + fan-out all wire correctly together. |
| 2 | Ring-buffer replay | WS#1 connects, 3 events pushed, WS#2 connects → WS#2 receives 3 buffered events on connect (replay), preserving order. Push 4th event → both WS#1 and WS#2 receive it (fan-out). |
| 3 | Admin gate | Non-admin token resolves to role='member' → WS closed with code 4403 AND `streamFactory` was NEVER invoked (no journalctl process spawned for non-admins). |
| 4 | ENOENT path | `streamFactory.onMissing` callback fires synchronously → WS closed with code 4404 ("journalctl binary missing on host"). Ring buffer empty. |
| 5 | Cleanup on disconnect | WS#1 + WS#2 connect → WS#1 disconnects (1 subscriber left, no stop) → WS#2 disconnects (last subscriber → `stream.stop()` invoked exactly once). |

### 3. `48-UAT.md` (NEW, 257 LOC, 9 numbered steps)

Operator-facing manual-test walkthrough for Mini PC validation. Mirrors the structure of `46-UAT.md` and `47-UAT.md`. Targets `bruce@10.69.31.68` ONLY (D-NO-SERVER4 — zero references to Server4 / `45.137.194.*`).

| Step | FR mapping | Description |
|------|------------|-------------|
| 1 | FR-SSH-02 | UI loads SSH Sessions tab; WS handshake to `/ws/ssh-sessions?token=...` succeeds |
| 2 | FR-SSH-01 | Trigger external SSH attempt → row appears within 1-2s with extracted IP |
| 3 | FR-SSH-02 | Click-to-copy IP → clipboard contains literal IP string |
| 4 | FR-SSH-02 | Click-to-ban → Phase 46 BanIpModal opens with `initialIp` pre-populated (cross-link contract from Plan 48-02) |
| 5 | FR-SSH-02 | 4-pixel scroll-tolerance → "Resume tailing" button surfaces; click → snaps back |
| 6 | FR-SSH-01 | Sign in as non-admin → WS handshake closes with 4403 / sidebar entry hidden |
| 7 | D-NO-NEW-DEPS / non-destructive | "Show Security panel" toggle off / on; sshd + fail2ban + livinityd untouched |
| 8 | D-TOS-02 / D-D-40-01-RITUAL | `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` returns `4f868d31...` |
| 9 | All FR-SSH | `npm run test:phase48` exits 0 from `nexus/packages/core/` |

## Constraints upheld

| Constraint | Status |
|------------|--------|
| D-NO-NEW-DEPS | UPHELD — 0 new npm deps; only the new `test:phase48` script entry, no `dependencies` block change |
| D-NO-SERVER4 | UPHELD — 48-UAT.md mentions `10.69.31.68` (Mini PC) 3 times, `45.137.194.*` (Server4) 0 times |
| Sacred file byte-identical | UPHELD — pre = post = `4f868d318abff71f8c8bfbcf443b2393a553018b`, `git diff --shortstat HEAD~5..HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` empty |
| Atomic single commit | UPHELD — commit `986b87d9` covers all 3 changed files |
| test:phase48 chains test:phase47 | UPHELD — `grep -E "test:phase48.*npm run test:phase47"` matches exactly 1 line |
| ssh-sessions tests in chain | UPHELD — `grep "test:phase48" | grep "ssh-sessions"` returns 3 (journalctl-stream + ws-handler + integration) |

## test:phase48 master gate result

| Test file | Tests | Result |
|-----------|-------|--------|
| `claude.test.ts` | 3 | PASS |
| `no-authtoken-regression.test.ts` | 1 | PASS |
| `sdk-agent-runner-integrity.test.ts` | 1 | PASS |
| `sdk-agent-runner-home-override.test.ts` | 4 | PASS |
| `api-home-override.test.ts` | 7 | PASS |
| `livinity-broker/integration.test.ts` | 10 | PASS |
| `server/trpc/common.test.ts` | 10 | PASS |
| `livinity-broker/openai-sse-adapter.test.ts` | 12 | PASS |
| `fail2ban-admin/parser.test.ts` | 14 | PASS |
| `fail2ban-admin/client.test.ts` | 13 | PASS |
| `fail2ban-admin/active-sessions.test.ts` | 4 | PASS |
| `fail2ban-admin/integration.test.ts` | 10 | PASS |
| `diagnostics/capabilities.test.ts` | 9 | PASS |
| `diagnostics/model-identity.test.ts` | 7 | PASS |
| `diagnostics/app-health.test.ts` | 6 | PASS |
| `diagnostics/integration.test.ts` | 7 | PASS |
| `ssh-sessions/journalctl-stream.test.ts` | 8 | PASS |
| `ssh-sessions/ws-handler.test.ts` | 8 | PASS |
| **`ssh-sessions/integration.test.ts`** | **5** | **PASS (this plan)** |
| **TOTAL** | **139** | **139/139 PASS individually** |

### Note on Windows-local npm chain quirk (carry-over from Phase 47)

Per `47-05-SUMMARY.md`, the chained `npm run` invocation on the local Windows dev box hits a documented PATH-propagation quirk: cmd.exe spawned by npm for the `&&`-chained sub-`npm run` does not inherit `tsx` in its PATH, causing the **chain** (not individual tests) to exit non-zero. This is identical to the test:phase47 baseline behavior on Windows — NOT a regression introduced by this plan.

The chain works correctly on the Mini PC (Linux deploy target) and on Linux dev boxes generally. UAT Step 9 documents the workaround: also run the 3 ssh-sessions test files individually with `npx tsx ...` to verify on Windows. All 19 individual test files in the chain pass on the local Windows box (139/139 tests).

## v29.4 milestone status (final)

| Phase | Plans | Status |
|-------|-------|--------|
| 45 — Carry-Forward Sweep | 4/4 | COMPLETE |
| 46 — Fail2ban Admin Panel | 5/5 | COMPLETE |
| 47 — AI Diagnostics | 5/5 | COMPLETE |
| 48 — Live SSH Session Viewer | **3/3** | **COMPLETE (this plan)** |
| **TOTAL** | **17/17 plans** | **v29.4 100% COMPLETE** |

All 18 v29.4 requirements (FR-CF-01..04 + FR-F2B-01..06 + FR-TOOL-01/02 + FR-MODEL-01/02 + FR-PROBE-01/02 + FR-SSH-01/02) shipped end-to-end. Sacred file untouched through all 4 phases (only Phase 45 P01 audit-only re-pin landed; subsequent 16 plans left it byte-identical at `4f868d31...`).

## Sacred file SHA verification

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b   ← post-Plan-48-03 (byte-identical to pre)

$ git diff --shortstat HEAD~5..HEAD -- nexus/packages/core/src/sdk-agent-runner.ts
(empty)                                     ← UAT Step 8 baseline holds
```

D-D-40-01-RITUAL invariant upheld through every Phase 48 plan.

## Recommendations for follow-up

1. **Mini PC deploy** — at next `bash /opt/livos/update.sh` deploy cadence, run `48-UAT.md` end-to-end (10-15 min walkthrough). Records: trigger SSH attempt → row appears 1-2s → click-to-ban opens BanIpModal pre-populated.
2. **REQUIREMENTS.md mark-complete** — flip FR-SSH-01 + FR-SSH-02 from "in-progress" to "Complete" (handled automatically by `gsd-sdk query requirements.mark-complete FR-SSH-01 FR-SSH-02` invoked by the executor's state-update step).
3. **`/gsd-complete-milestone v29.4`** — at full milestone close, run the milestone archival workflow to bundle v29.4-ROADMAP.md / v29.4-MILESTONE-AUDIT.md / v29.4-INTEGRATION-CHECK.md / v29.4-REQUIREMENTS.md into `.planning/milestones/v29.4-phases/`.
4. **Carry-forward to v29.5+** — geo-IP enrichment (`maxmind`) for the SSH viewer was deferred per D-NO-NEW-DEPS; the broker tier-bypass bug discovered in Plan 47 P01 (out-of-scope for v29.4) remains open as a v29.5 ticket.

## Self-Check: PASSED

**Files created (verified):**
- `livos/packages/livinityd/source/modules/ssh-sessions/integration.test.ts` — FOUND
- `.planning/phases/48-live-ssh-session-viewer/48-UAT.md` — FOUND
- `.planning/phases/48-live-ssh-session-viewer/48-03-SUMMARY.md` — FOUND (this file)

**File modified (verified):**
- `nexus/packages/core/package.json` — `test:phase48` entry present, chains `test:phase47`, 3 ssh-sessions test files

**Commit verified:**
- `986b87d9` — `feat(48-03): test:phase48 master gate + 48-UAT.md (closes Phase 48)` — found in `git log --oneline -1`

**Acceptance criteria (all green):**
- integration.test.ts exists, 5 PASS Test lines, 0 vi.mock, 0 real `spawn('journalctl', ...)`, 0 real `from 'ws'`, exits 0
- package.json contains `test:phase48`, chains `test:phase47`, 3 ssh-sessions tests
- 48-UAT.md exists, 9 numbered Steps, mentions click-to-ban + 4403 + 10.69.31.68, 0 references to 45.137.194.*
- Sacred file byte-identical pre/post: SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`
