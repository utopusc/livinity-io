---
phase: 40-per-user-claude-oauth-home-isolation
plan: 02
status: complete
completed: 2026-04-30
requirements:
  - FR-AUTH-03
sacred-file-pre-edit-sha: 2b3b005bf1594821be6353268ffbbdddea5f9a3a
sacred-file-post-edit-sha: 623a65b9a50a89887d36f770dcd015b691793a7f
sacred-file-touched: true (surgical, behavior-preserving per D-40-01)
---

# Plan 40-02 Summary — Sacred File Surgical Edit + Integrity Test Re-Pin

## One-liner

Single-line surgical edit to `sdk-agent-runner.ts:266` adding `this.config.homeOverride ||` prefix to the HOME env assignment, plus optional `homeOverride?: string` field on `AgentConfig` interface in `agent.ts` (NON-sacred), plus integrity test BASELINE_SHA re-pinned from Phase 39 baseline to new post-Phase-40 SHA. Zero behavior change for any existing caller — `homeOverride` is opt-in.

## Files Modified

| File | Lines added | Lines removed | Net change |
|------|-------------|---------------|------------|
| `nexus/packages/core/src/agent.ts` | 11 (1 field + 10 JSDoc/comment) | 0 | +11 |
| `nexus/packages/core/src/sdk-agent-runner.ts` | 1 | 1 | 0 (1 line modified) |
| `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` | 4 (3 comment + 1 SHA) | 2 | +2 |

**Sacred file diff: exactly 2 +/- lines (1 line modified, line 266).** Verified by `git diff nexus/packages/core/src/sdk-agent-runner.ts | grep -c "^[+-][^+-]"` → 2.

## Sacred File SHA Trail

| Checkpoint | SHA | Match? |
|------------|-----|--------|
| Phase 39 final baseline | `2b3b005bf1594821be6353268ffbbdddea5f9a3a` | — |
| Plan 40-02 Task 1 pre-edit verification | `2b3b005bf1594821be6353268ffbbdddea5f9a3a` | YES (matches Phase 39) |
| Plan 40-02 Task 3 post-edit (NEW BASELINE) | `623a65b9a50a89887d36f770dcd015b691793a7f` | NEW |
| Integrity test BASELINE_SHA constant | `623a65b9a50a89887d36f770dcd015b691793a7f` | MATCHES post-edit SHA |

`sdk-agent-runner-integrity.test.ts` PASS message:
```
PASS: sdk-agent-runner.ts integrity verified (SHA: 623a65b9a50a89887d36f770dcd015b691793a7f)
```

## Tests Run

`cd nexus/packages/core && npm run test:phase39` — **5/5 PASS**:

```
PASS: Test (a) — API-key path still works
PASS: Test (b) — subscription mode throws with mode=subscription-required + verbatim D-39-05 message
PASS: Test (c) — no-creds api-key mode throws with mode=no-credentials + verbatim D-39-05 message
PASS: no-authtoken-regression — claude.ts contains zero `authToken:` occurrences
PASS: sdk-agent-runner.ts integrity verified (SHA: 623a65b9a50a89887d36f770dcd015b691793a7f)
```

Phase 39 regression suite still green against the new baseline.

## Build

`cd nexus && npm run build --workspace=packages/core` exits 0 with zero TypeScript errors.

## ROADMAP Phase 40 Coverage

| Criterion | Status (this plan only) | Notes |
|-----------|--------------------------|-------|
| 1. User A login independent of User B | NOT YET — needs Plan 03 | Mechanism enabled here (homeOverride parameter exists) |
| 2. Cross-user file read fails permission denied | NOT YET — Plan 05 documents D-40-05 honest framing | — |
| 3. SdkAgentRunner subprocess HOME=user-a | **STRUCTURALLY ENABLED** | Caller passing `homeOverride` will see HOME redirected. Wiring user_id → homeOverride at the AI Chat boundary is Phase 41 broker scope (per planner's honest framing). |
| 4. Settings UI per-user login status | NOT YET — needs Plans 03+04 | — |

## Decisions Honored

- **D-40-01**: Sacred = behavior-preserving NOT byte-identical. ONE surgical line edit applied; all existing callers compile and run identically (homeOverride is `string | undefined`, defaulting to fall-through behavior).
- **D-40-02**: AgentConfig has `homeOverride?: string` with JSDoc; line 266 reads `this.config.homeOverride || process.env.HOME || '/root'`.
- **D-40-11**: BASELINE_SHA constant updated with 3-line documenting comment block referencing 40-CONTEXT.md D-40-02 / D-40-11.
- **D-40-15**: Integrity test passes against new baseline SHA.

## Plan 03 Unblocked

`AgentConfig.homeOverride` is now an opt-in parameter. Plan 03 will:
1. Create per-user `.claude/` dirs at `/opt/livos/data/users/<user_id>/.claude/`.
2. Build the `claudePerUserStartLogin` route that spawns `claude login` with HOME set to that dir.
3. Note: actual threading of homeOverride through `/api/agent/stream` for AI Chat is Phase 41 broker scope (planner's honest framing). Phase 40 only sets HOME for the `claude login` subprocess.

## Self-Check: PASSED

- [x] `nexus/packages/core/src/agent.ts` modified — `homeOverride?: string` added with JSDoc.
- [x] `nexus/packages/core/src/sdk-agent-runner.ts` modified — line 266 reads `this.config.homeOverride || ...`.
- [x] `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` BASELINE_SHA = `623a65b9a50a89887d36f770dcd015b691793a7f`.
- [x] `git diff` on sacred file = exactly 2 +/- lines.
- [x] `npm run test:phase39` exits 0 — 5/5 PASS.
- [x] `npm run build --workspace=packages/core` exits 0.
