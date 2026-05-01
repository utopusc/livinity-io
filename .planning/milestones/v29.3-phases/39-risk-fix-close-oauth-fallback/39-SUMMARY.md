---
phase: 39-risk-fix-close-oauth-fallback
milestone: v29.3
status: complete
completed: 2026-04-29
requirements:
  - FR-RISK-01
plans:
  - 39-01-caller-audit
  - 39-02-delete-fallbacks-and-reroute
  - 39-03-tests-and-verification
commits:
  - ab62df01 — feat(39-01): caller audit
  - aa338404 — refactor(39-02): close OAuth fallback
  - eb3c93ff — test(39-03): regression tests
sacred-file-baseline: 2b3b005bf1594821be6353268ffbbdddea5f9a3a
sacred-file-final: 2b3b005bf1594821be6353268ffbbdddea5f9a3a
sacred-file-untouched: true
tests-run: 5
tests-passed: 5
deferred: []
---

# Phase 39: Risk Fix — Close OAuth Fallback — Summary

**One-liner:** Deleted `claude.ts` env-var-based and credentials-file-based OAuth bearer-token fallbacks in `getClient()`, added typed `ClaudeAuthMethodMismatchError`, pruned the lying `isAvailable()` creds-file branch, and pinned all three invariants with regression tests — all without touching the sacred `sdk-agent-runner.ts`.

## Files Modified / Added

**Modified:**
- `nexus/packages/core/src/providers/claude.ts` — deleted `getClient()` env-var + creds-file fallbacks (lines 91-115 of pre-Phase-39 source), deleted `isAvailable()` creds-file branch (lines 293-302 of pre-Phase-39 source), added `ClaudeAuthMethodMismatchError` exported class.
- `nexus/packages/core/package.json` — added `test:phase39` npm script.

**Added (planning artifacts):**
- `.planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md` — caller inventory + classification + reroute spec + sacred file baseline SHA.
- `.planning/phases/39-risk-fix-close-oauth-fallback/39-01-SUMMARY.md` — Plan 39-01 audit output summary.
- `.planning/phases/39-risk-fix-close-oauth-fallback/39-02-SUMMARY.md` — Plan 39-02 deletion summary.
- `.planning/phases/39-risk-fix-close-oauth-fallback/39-03-SUMMARY.md` — Plan 39-03 test summary.

**Added (test artifacts):**
- `nexus/packages/core/src/providers/claude.test.ts` — 3 unit tests for `ClaudeProvider.getClient()` new error behavior.
- `nexus/packages/core/src/providers/no-authtoken-regression.test.ts` — grep-based regression preventing `authToken:` re-introduction.
- `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` — sacred file SHA pin.

## Commits

| Plan | SHA | Title |
|------|-----|-------|
| 39-01 | `ab62df01` | `feat(39-01): caller audit for OAuth fallback closure (FR-RISK-01)` |
| 39-02 | `aa338404` | `refactor(39-02): close OAuth fallback in ClaudeProvider.getClient (FR-RISK-01)` |
| 39-03 | `eb3c93ff` | `test(39-03): pin OAuth-fallback closure with regression tests (FR-RISK-01)` |

**Total:** 3 atomic commits on master, all on the same day.

## ROADMAP Phase 39 Success Criteria (4/4 PASSED)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `grep -rn "authToken: token" nexus/packages/core/src/providers/claude.ts` returns zero matches that reference `claudeAiOauth` | **PASS** | Stronger invariant achieved: `grep -c "authToken:" claude.ts` returns 0 (no matches at all, in code or comments). Codified by `no-authtoken-regression.test.ts`. |
| 2 | When subscription-only user triggers any code path that previously called `ClaudeProvider.getClient()`, the call routes through `SdkAgentRunner` OR throws a clear "use Agent SDK / subscription mode" error — never silent fallback | **PASS** | (a) `isAvailable()` now returns `false` for OAuth-only users → ProviderManager skips Claude → falls through to Kimi (existing behavior, no break). (b) If a caller bypasses `isAvailable()` and calls `chat()` directly, `getClient()` throws `ClaudeAuthMethodMismatchError` with verbatim D-39-05 message naming SdkAgentRunner explicitly. Asserted by `claude.test.ts` test (b). |
| 3 | When user with explicit Redis-stored API key calls `ClaudeProvider.getClient()`, existing API-key path continues to work | **PASS** | The `try { const apiKey = await this.getApiKey(); ... }` success branch in `getClient()` is unchanged — same client construction, same cache logic. Asserted by `claude.test.ts` test (a) via `isAvailable()` proxy (avoids hitting real Anthropic API in tests). |
| 4 | `nexus/packages/core/src/sdk-agent-runner.ts` byte-identical to pre-Phase-39 SHA | **PASS** | Pre-baseline + post-edit + post-test SHA all match: `2b3b005bf1594821be6353268ffbbdddea5f9a3a`. `git diff` returns zero output. Codified by `sdk-agent-runner-integrity.test.ts` `BASELINE_SHA` constant. |

## Sacred File Integrity (verified at every checkpoint)

| Checkpoint | SHA | Match? |
|------------|-----|--------|
| Pre-Phase-39 baseline (39-AUDIT.md Section 5) | `2b3b005bf1594821be6353268ffbbdddea5f9a3a` | — |
| Plan 39-02 Task 1 pre-edit verification | `2b3b005bf1594821be6353268ffbbdddea5f9a3a` | YES |
| Plan 39-02 Task 6 post-edit verification | `2b3b005bf1594821be6353268ffbbdddea5f9a3a` | YES |
| Plan 39-03 Task 5 pre-test-commit verification | `2b3b005bf1594821be6353268ffbbdddea5f9a3a` | YES |
| Final post-Phase-39 (this summary) | `2b3b005bf1594821be6353268ffbbdddea5f9a3a` | YES |

`git diff nexus/packages/core/src/sdk-agent-runner.ts` returned 0 lines at every check.

## Tests Run

**Total:** 5 assertions across 3 test files, all PASS.

```
$ cd nexus/packages/core && npm run test:phase39
  PASS: Test (a) — API-key path still works
  PASS: Test (b) — subscription mode throws with mode=subscription-required + verbatim D-39-05 message
  PASS: Test (c) — no-creds api-key mode throws with mode=no-credentials + verbatim D-39-05 message
  PASS: no-authtoken-regression — claude.ts contains zero `authToken:` occurrences
  PASS: sdk-agent-runner.ts integrity verified (SHA: 2b3b005bf1594821be6353268ffbbdddea5f9a3a)
```

Build verification: `npm run build --workspace=packages/core` exits 0 with zero TypeScript errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Comment-block phrasing originally repeated `authToken:` and `ANTHROPIC_AUTH_TOKEN` literally**

- **Found during:** Plan 39-02 Task 6 invariant verification (after Tasks 2-4 edits, grep counts came back 1 each instead of 0).
- **Issue:** The `// Deleted in v29.3 Phase 39 (FR-RISK-01)` documentation comment block I added inside `getClient()` literally referenced `process.env.ANTHROPIC_AUTH_TOKEN` and `new Anthropic({ authToken: ... })` to explain what was deleted. This caused `grep -c "authToken:" claude.ts` to return 1 and `grep -c "ANTHROPIC_AUTH_TOKEN" claude.ts` to return 1 — both should be 0 per Plan 39-02's verify automation, AND per Plan 39-03's `no-authtoken-regression.test.ts` (which explicitly does NOT strip comments — see the plan's explanatory comment: "the test should NOT strip comments — it asserts NO substring `authToken:` anywhere in claude.ts source, comments included. That's the strongest invariant; a future contributor adding `// authToken: was deleted` comment would have to choose a different phrasing, which is fine.").
- **Fix:** Rewrote the documentation comment using descriptive phrasing ("env-var-based OAuth bearer fallback", "OAuth credentials-file bearer fallback", "constructed an Anthropic client using a bearer token") that explains what was deleted without repeating the literal substrings. This honors the strictest interpretation of the regression test invariant.
- **Files modified:** `nexus/packages/core/src/providers/claude.ts` (one Edit call within Plan 39-02, before commit).
- **Commit:** `aa338404` (the fix landed before the commit, so the final committed state is correct).
- **Documented in:** `39-02-SUMMARY.md` "Notes on Implementation Choices" section.

### Auth Gates

None encountered.

### Blockers

None.

## Known Stubs

None. The deletion is complete; no stub data, placeholder values, or "TODO" wires remain.

## Threat Flags

None. Phase 39 closes a threat surface (T-39-02-01: subscription token reaches raw SDK with OpenClaw fingerprint risk) — it does NOT introduce any new network endpoints, auth paths, file access patterns, or schema changes. The new `ClaudeAuthMethodMismatchError` is a typed exception, not a new trust boundary.

## Carry-Forwards

**None for Phase 39.** Strategy A (gate at `isAvailable()`) handled all subscription-mode-reachable callers in a single chokepoint; zero `TODO(FR-RISK-01-followup)` comments planted in source.

Pre-existing milestone-level carry-forwards (Phases 40-44 work) proceed on their own track per the v29.3 ROADMAP.

## Recommendation for Next Step

**Phase 40 (Per-User Claude OAuth + HOME Isolation) is UNBLOCKED and ready to plan.**

Phase 39 satisfied its dependency contract for Phase 40 — the raw-SDK fallback path is structurally closed, so per-user OAuth tokens introduced in Phase 40 cannot leak through it. Phase 40 can now safely:
- Surface "Connect my Claude account" UI in Settings > AI Integrations (FR-AUTH-02).
- Spawn `claude login` with per-user `HOME` (FR-AUTH-01, FR-AUTH-03).
- Trust that no surprise code path will quietly read those credentials and ship them to `@anthropic-ai/sdk`.

**No human review required to proceed.** All 4 ROADMAP success criteria are codified by passing tests; the sacred file is byte-identical; the typed error gives operators a clear diagnostic if a future caller misroutes; and the regression tests ensure the deletion stays deleted.

**No deployment in this phase per scope_boundaries.** The Mini PC `bash /opt/livos/update.sh` deployment is OUT of scope for the executor — it lands when the user explicitly initiates the next deploy cycle.

## Self-Check: PASSED

- [x] `nexus/packages/core/src/providers/claude.ts` modified — exists with new error class + reduced `getClient()` + reduced `isAvailable()`.
- [x] `nexus/packages/core/package.json` modified — `test:phase39` script present.
- [x] `nexus/packages/core/src/providers/claude.test.ts` exists.
- [x] `nexus/packages/core/src/providers/no-authtoken-regression.test.ts` exists.
- [x] `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` exists.
- [x] `.planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md` exists.
- [x] `.planning/phases/39-risk-fix-close-oauth-fallback/39-01-SUMMARY.md` exists.
- [x] `.planning/phases/39-risk-fix-close-oauth-fallback/39-02-SUMMARY.md` exists.
- [x] `.planning/phases/39-risk-fix-close-oauth-fallback/39-03-SUMMARY.md` exists.
- [x] Commit `ab62df01` exists in git log.
- [x] Commit `aa338404` exists in git log.
- [x] Commit `eb3c93ff` exists in git log.
- [x] Sacred file SHA `2b3b005bf1594821be6353268ffbbdddea5f9a3a` matches at every checkpoint.
- [x] All 5 test assertions PASS via `npm run test:phase39`.
