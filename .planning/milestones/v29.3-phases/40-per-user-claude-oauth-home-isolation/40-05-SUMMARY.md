---
phase: 40-per-user-claude-oauth-home-isolation
plan: 05
status: complete
completed: 2026-04-30
requirements:
  - FR-AUTH-01
  - FR-AUTH-03
sacred-file-touched: false
---

# Plan 40-05 Summary — Phase 40 Tests + UAT Checklist

## One-liner

Two new test files (4 nexus source-grep assertions for sacred-file invariants + 5 livinityd unit tests for per-user dir helpers), one new npm script (`test:phase40`) chaining home-override + Phase 39 regression suite as a single gate, and one 27-step manual UAT checklist (deferred to user's deploy cycle per scope_boundaries). All 14 automated assertions PASS on the executor's machine.

## Files Modified / Added

| File | Status | Lines | Notes |
|------|--------|-------|-------|
| `nexus/packages/core/src/providers/sdk-agent-runner-home-override.test.ts` | **Created** | 90 | 4 source-grep assertions per D-40-13 |
| `livos/packages/livinityd/source/modules/ai/per-user-claude.test.ts` | **Created** | 137 | 5 helper unit tests per D-40-14 |
| `nexus/packages/core/package.json` | Modified | +1 line | New `test:phase40` script chaining home-override + test:phase39 |
| `.planning/phases/40-per-user-claude-oauth-home-isolation/40-UAT.md` | **Created** | 100+ | 27 manual UAT steps |

## Test Results

### `npm run test:phase40` (nexus, single gate for Phase 39+40)

```
> tsx src/providers/sdk-agent-runner-home-override.test.ts && npm run test:phase39

  PASS: Test 1 — sdk-agent-runner.ts HOME line honors this.config.homeOverride
  PASS: Test 2 — sdk-agent-runner.ts contains "homeOverride" exactly once
  PASS: Test 3 — agent.ts AgentConfig has optional homeOverride?: string
  PASS: Test 4 — agent.ts homeOverride has JSDoc above it

All sdk-agent-runner-home-override.test.ts tests passed (4/4)

  PASS: Test (a) — API-key path still works
  PASS: Test (b) — subscription mode throws with mode=subscription-required
  PASS: Test (c) — no-creds api-key mode throws with mode=no-credentials

All claude.test.ts tests passed (3/3)

  PASS: no-authtoken-regression — claude.ts contains zero `authToken:` occurrences

All no-authtoken-regression.test.ts tests passed (1/1)

  PASS: sdk-agent-runner.ts integrity verified (SHA: 623a65b9a50a89887d36f770dcd015b691793a7f)

All sdk-agent-runner-integrity.test.ts tests passed (1/1)
```

**9/9 nexus assertions PASS.** Phase 39 regression suite stays green against the new BASELINE_SHA from Plan 02.

### `npx tsx source/modules/ai/per-user-claude.test.ts` (livinityd)

```
  PASS: Test 1 — getUserClaudeDir returns <data>/users/<id>/.claude
  PASS: Test 2 — getUserClaudeDir rejects ../../../etc
  PASS: Test 3 — getUserClaudeDir rejects empty string
  PASS: Test 4 — ensureUserClaudeDir is idempotent + mode 0o700 (POSIX)
  PASS: Test 5 — perUserClaudeLogout is idempotent + removes creds file

All per-user-claude.test.ts tests passed (5/5)
```

**5/5 livinityd assertions PASS** (Windows executor — POSIX mode-bit assertions skipped per platform check).

**Total automated assertions: 14/14 PASS.**

## ROADMAP Phase 40 Coverage

| Criterion | Automated | Manual UAT | Status |
|-----------|-----------|------------|--------|
| 1. User A login independent of User B | Partial (per-user dir helpers + multi-user gate logic via per-user-claude.test.ts) | Steps 1-12 | Mechanism PASS; live verification deferred to UAT |
| 2. Cross-user file read fails permission denied | N/A — D-40-05 honest framing: synthetic isolation, NOT POSIX-enforced | Steps 13-14 | Honestly documented in module + UAT |
| 3. SdkAgentRunner subprocess HOME=user-a | Source-grep assertion (sdk-agent-runner-home-override.test.ts Test 1) | Steps 15-18 | Mechanism PASS; AI Chat wiring deferred to Phase 41 (honest framing in UAT step 18) |
| 4. Settings UI per-user status accuracy + no API key field | UI build clean (Plan 04); JSX inspection (per-user branch has no API key Input) | Steps 19-22 | Structurally PASS; live UI verification in UAT |

## UAT Checklist Highlights

- 27 total steps, organized by ROADMAP criterion.
- 5-min pre-flight section: SSH, git log, systemctl status, `which claude`.
- Steps 1-12: User A independent login (FR-AUTH-01).
- Steps 13-14: Cross-user file read isolation — **honestly framed** as synthetic (livinityd-application-layer), not POSIX-enforced. UAT walks through the limitation explicitly.
- Steps 15-18: HOME env in subprocess. **Step 18 explicitly notes** the AI Chat path (`/api/agent/stream`) does NOT yet pick up `homeOverride` — that's Phase 41 broker scope. This avoids future false-positive "regression" reports.
- Steps 19-22: UI per-user status + no API key field in per-user variant.
- Steps 23-27: Single-user mode regression — confirms D-40-07 (Phase 40 logic is dead code in single-user mode).
- Operator notes: 5-min timeout adjustability, regex version-fragility, on-failure-only token refresh.

## Decisions Honored

- **D-40-13**: Sacred file behavior contract pinned via 4 source-grep assertions (HOME line correctness + occurs-once invariant + AgentConfig field + JSDoc presence).
- **D-40-14**: Per-user dir helper invariants pinned (path correctness + 2 input-validation guards + idempotency + mode bits + logout idempotency).
- **D-40-15**: Integrity test passes against new baseline (`623a65b9...` from Plan 02) — verified as part of `test:phase40` gate.

## Sacred File Untouched

`git hash-object nexus/packages/core/src/sdk-agent-runner.ts` = `623a65b9a50a89887d36f770dcd015b691793a7f` (matches Plan 40-02 baseline; this plan touched no sacred-file source).

## Phase 40 Complete

All 5 plans shipped locally (5 commits on master). All 14 automated assertions PASS. UAT checklist ready for next deploy cycle. Phase 41 (Anthropic Messages Broker) is unblocked from Phase 40's contract.

## Self-Check: PASSED

- [x] `nexus/packages/core/src/providers/sdk-agent-runner-home-override.test.ts` exists; 4/4 PASS via tsx.
- [x] `livos/packages/livinityd/source/modules/ai/per-user-claude.test.ts` exists; 5/5 PASS via tsx.
- [x] `nexus/packages/core/package.json` has `test:phase40` script chaining home-override + test:phase39.
- [x] `cd nexus/packages/core && npm run test:phase40` exits 0 — 9/9 PASS (4 home-override + 5 Phase 39).
- [x] `.planning/phases/40-per-user-claude-oauth-home-isolation/40-UAT.md` exists with 27 manual steps.
- [x] Sacred file SHA matches Plan 40-02 baseline (`623a65b9a50a89887d36f770dcd015b691793a7f`).
