---
phase: 163-surface-vault-contexts
plan: 03
subsystem: agent-session-test
tags: [test, source-invariants, surface-overlay, composition-lock, tsx, no-source-change]
dependency_graph:
  requires:
    - phase: 163
      plan: 02
      reason: ws-agent.ts surface routing (resolveSessionVaultPath + prefix branches) is the lock target for Inv 9-10
    - phase: 163
      plan: 02.5
      reason: agent-session.ts decoupled gate + overlay-preserving systemPrompt/settingSources gates are the lock target for Inv 1-5
    - phase: 162
      plan: 04
      reason: ws-agent.ts buildSessionKey closure literal `opts.vaultModeConfig === undefined` is the lock target for Inv 8
    - phase: 161
      plan: 01
      reason: isComputerUseSession helper signature + body fingerprint (Inv 7) and dated Haiku literal `claude-haiku-4-5-20251001` (Inv 6) are upstream invariants for the composition this plan locks
  provides:
    - "Pure-text composition lock test for the post-163-02.5 + post-163-02 + post-162-04 + post-161 composed state"
    - "CI red signal if any future refactor breaks the surface-overlay composition matrix without an explicit invariants update"
    - "Mirror-style sibling to agent-session.vault-mode.test.ts using same cross-package readFileSync pattern"
  affects: []
tech_stack:
  added: []
  patterns:
    - "tsx runtime script + node:assert/strict (Phase 161/162 convention preserved)"
    - "Cross-package source-text reads via resolve(__dirname, '../../../../livos/...')"
    - "split-and-count substring matching with assert.equal for exact-count invariants"
    - "Permissive boolean (||) on 4 acceptable forms for Inv 10's prefix branches — matches the kind-equality post-split form actually shipped by 163-02 while also accepting future-proof startsWith forms"
key_files:
  created:
    - "liv/packages/core/src/agent-session.surface-overlay.test.ts (229 lines, 10 invariants, tsx + node:assert/strict)"
  modified: []
decisions:
  - "Inv 10 accepts 4 forms (kind !== / kind === / .startsWith('webapp:') / conversationId.startsWith('webapp:'))  to tolerate future refactors that flatten the post-split form back to .startsWith without weakening the original intent (both prefixes must be referenced)"
  - "Inv 6 used regex match-count (≥2) rather than exact split-count because the Phase 161 dated literal appears in both the override-resolution block and the fallback assertion site; ≥2 lets us future-proof against an additional reference without forcing this test to be edited"
  - "Inv 7 split body fingerprint into 2 includes() checks (guard + return) instead of a single multi-line literal because line-ending normalization (CRLF on Windows worktree) would cause false-positive failures on a single multi-line literal compare; per-line includes() bypasses that"
  - "test removes process listeners pre-exit (per 162-04 SUMMARY's Windows SDK teardown noise note) even though this test does not import the SDK — defensive parity with sibling tests"
metrics:
  duration: "~10min"
  date_completed: "2026-05-19"
  tasks_completed: 1
  files_created: 1
  files_modified: 0
  commits: 1
---

# Phase 163 Plan 03: Surface Overlay Composition Lock Test Summary

Surface-text invariant test that locks the post-163-02.5 + post-163-02 + post-162-04 + post-161 composed state via 10 deterministic source-text assertions — no source code changes anywhere, no behavioral spies, no SKIPPED tests, no buildSession stubs, no vitest, no NOT_IMPLEMENTED throws.

## What Shipped

**Single file:** `liv/packages/core/src/agent-session.surface-overlay.test.ts` (229 lines)

**Single commit:** `0cd6be14` — `test(163-03): lock post-163-02.5 surface overlay composition (10 invariants)`

## The 10 Invariants

### agent-session.ts post-163-02.5 + Phase 161 contracts (Invariants 1-7)

| # | Invariant | Form | Pass condition |
|---|-----------|------|----------------|
| 1 | post-163-02.5 decoupled gate literal | substring count | exactly 1 match of `const vaultMode = this.vaultModeConfig !== null` |
| 2 | overlay-preserving systemPrompt gate | substring count | exactly 1 match of `systemPrompt: vaultMode && !computerUse ? undefined : systemPrompt,` |
| 3 | skills-suppress settingSources gate | substring count | exactly 1 match of `settingSources: vaultMode && !computerUse ? ['project'] : undefined,` |
| 4 | cwd threading line (now reaches SDK for computer-use too) | substring count | exactly 1 match of `cwd: sessionCwd,` |
| 5 | OLD pre-163-02.5 coupled gate fully removed | substring count | exactly 0 matches of `const vaultMode = !computerUse && this.vaultModeConfig !== null` |
| 6 | Phase 161 dated Haiku literal preserved | regex count | `claude-haiku-4-5-20251001` appears ≥2 times (actually 3 in current source) |
| 7 | isComputerUseSession helper fingerprint | signature + body lines | export signature appears exactly 1×; body guard line + startsWith branch line both present |

### ws-agent.ts post-163-02 surface routing + Phase 162-04 sessionKey (Invariants 8-10)

| # | Invariant | Form | Pass condition |
|---|-----------|------|----------------|
| 8 | Phase 162-04 buildSessionKey closure literal | substring count | exactly 1 match of `opts.vaultModeConfig === undefined` |
| 9 | Phase 163-02 resolveSessionVaultPath export | regex match | `export\s+function\s+resolveSessionVaultPath` matches |
| 10 | Surface prefix branches for both webapp + native | boolean OR on 4 forms each | both `webapp` and `native` referenced via kind-equality OR startsWith |

## Test Result

```
agent-session.surface-overlay.test.ts

Phase 163-02.5 post-revision composition (Invariants 1-7):
PASS: Inv 1: agent-session.ts contains `const vaultMode = this.vaultModeConfig !== null`
PASS: Inv 2: agent-session.ts contains `systemPrompt: vaultMode && !computerUse ? undefined : systemPrompt,`
PASS: Inv 3: agent-session.ts contains `settingSources: vaultMode && !computerUse ? ['project'] : undefined,`
PASS: Inv 4: agent-session.ts contains `cwd: sessionCwd,` exactly once
PASS: Inv 5: agent-session.ts does NOT contain OLD literal `const vaultMode = !computerUse && this.vaultModeConfig !== null`
PASS: Inv 6: agent-session.ts contains 'claude-haiku-4-5-20251001' ≥2 times
PASS: Inv 7: agent-session.ts contains Phase 161 isComputerUseSession helper exactly once with known fingerprint

Phase 163-02 surface routing + Phase 162-04 sessionKey (Invariants 8-10):
PASS: Inv 8: ws-agent.ts contains Phase 162-04 buildSessionKey closure literal `opts.vaultModeConfig === undefined` exactly 1 match
PASS: Inv 9: ws-agent.ts exports Phase 163-02 resolveSessionVaultPath function
PASS: Inv 10: ws-agent.ts contains surface prefix branches for both webapp: and native:

10 PASS / 0 FAIL
```

Exit code 0.

## Sibling Regression (all green)

| Test file | Result |
|-----------|--------|
| `liv/packages/core/src/agent-session.computer-use.test.ts` | All Phase 161-01 + 161-02 tests passed |
| `liv/packages/core/src/agent-session.vault-mode.test.ts` | 14/14 vault-mode invariants passed |
| `liv/packages/core/src/agent-session.multi-instance.test.ts` | 6/6 multi-instance invariants passed |

## Hard Guardrails — All Preserved

| Guardrail | Evidence |
|-----------|----------|
| Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sdk-agent-runner.ts) | `git ls-tree HEAD -- liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| D-09 verbatim (luse-system-prompt.ts) | `git diff HEAD~ -- livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts \| wc -l` → 0 |
| Phase 161-02 helper (agent-prompt-builder.ts) | `git diff HEAD~ -- livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts \| wc -l` → 0 |
| agent-session.ts UNCHANGED by THIS plan | `git diff HEAD~ -- liv/packages/core/src/agent-session.ts \| wc -l` → 0 |
| ws-agent.ts UNCHANGED by THIS plan | `git diff HEAD~ -- livos/packages/livinityd/source/modules/server/ws-agent.ts \| wc -l` → 0 |
| D-NO-NEW-DEPS | `git diff HEAD~ -- '**/package.json' \| wc -l` → 0 |
| No NOT_IMPLEMENTED throw | `grep -c "NOT_IMPLEMENTED" liv/packages/core/src/agent-session.surface-overlay.test.ts` → 0 |
| No SKIPPED tests | `grep -c "SKIPPED" liv/packages/core/src/agent-session.surface-overlay.test.ts` → 0 |
| No vitest dependency | `grep -c "vitest" liv/packages/core/src/agent-session.surface-overlay.test.ts` → 0 |

## Deviations from Plan

**None.** Plan executed exactly as written — the entire test file content was specified verbatim in the plan's `<action>` block; the executor's job was to land that content, run it, and verify guardrails.

The plan's Verify block expected `git diff HEAD~ -- liv/packages/core/src/agent-session.ts | wc -l` → 0 and `git diff HEAD~ -- livos/packages/livinityd/source/modules/server/ws-agent.ts | wc -l` → 0 — both confirmed at HEAD~ position (this plan's only commit added a new file, so HEAD~ comparison for those existing files yields 0 diff as required).

## Composition Matrix Locked

This test pins the post-163-02.5 composition table from the plan's `<objective>`:

| vaultModeConfig | computerUse | systemPrompt | cwd | settingSources |
|---|---|---|---|---|
| set | true (webapp:/native:) | builder() | vaultPath | undefined |
| set | false (Main Chat) | undefined | vaultPath | ['project'] |
| null | true | builder() | undefined | undefined |
| null | false | <BASE> | undefined | undefined |

The 10 invariants together force the source to compose exactly this matrix — if any future refactor breaks the surface-overlay composition (e.g., re-couples vaultMode to !computerUse, or drops the !computerUse conjunction from systemPrompt/settingSources, or moves cwd back behind the computerUse fence), at least one invariant fails and CI fires red.

## Note on Plan Supersession

This test locks the **post-163-02.5** composition (computer-use sessions DO receive surface CWD; systemPrompt and settingSources are skipped on computer-use even when vault mode is on so the Phase 161-02 overlay builder + Haiku model precedence remain intact). The pre-163-02.5 mutual-exclusion shape described in CONTEXT.md as "Plan 163-03 Option A" is now **superseded** by this composition — the original Option A would have failed the original BLOCKER #1 acceptance ("WebApp/Native get surface CWD"), which is precisely why 163-02.5 was inserted between 163-02 and 163-03.

## Self-Check

- [x] Created file `liv/packages/core/src/agent-session.surface-overlay.test.ts` — FOUND
- [x] Commit `0cd6be14` exists in `git log --oneline` — FOUND
- [x] Test runs via `npx tsx` and prints `10 PASS / 0 FAIL`, exit 0 — VERIFIED
- [x] grep counts for NOT_IMPLEMENTED, SKIPPED, vitest all = 0 — VERIFIED
- [x] agent-session.ts and ws-agent.ts unchanged at HEAD~ comparison — VERIFIED (`git diff HEAD~ -- <path> | wc -l` → 0 for both)
- [x] Sacred SHA preserved at HEAD — VERIFIED (`f3538e1d811992b782a9bb057d1b7f0a0189f95f`)
- [x] Sibling regression: computer-use + vault-mode (14/14) + multi-instance (6/6) all green — VERIFIED
- [x] D-09 + 161-02 helper + D-NO-NEW-DEPS all 0-line diff — VERIFIED

## Self-Check: PASSED
