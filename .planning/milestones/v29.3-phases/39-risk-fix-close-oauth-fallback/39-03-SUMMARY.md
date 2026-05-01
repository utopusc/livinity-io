# Plan 39-03 Summary — Tests and Verification

**Plan:** 39-03 Tests and Verification
**Phase:** 39 Risk Fix — Close OAuth Fallback
**Completed:** 2026-04-29
**Requirements:** FR-RISK-01 (final invariant tests landed; deletion now durable)

---

## Commit

**SHA:** `eb3c93ff` (full: `eb3c93ff...`)
**Title:** `test(39-03): pin OAuth-fallback closure with regression tests (FR-RISK-01)`
**Files added/changed:** 4 (3 new test files + 1 modified package.json)

## Test Run Output (`npm run test:phase39`)

```
> @nexus/core@1.0.0 test:phase39
> tsx src/providers/claude.test.ts && tsx src/providers/no-authtoken-regression.test.ts && tsx src/providers/sdk-agent-runner-integrity.test.ts

  PASS: Test (a) — API-key path still works (isAvailable returns true with stub Redis API key)
[WARN] ClaudeProvider.getClient() invoked without API key — subscription users must use SdkAgentRunner (FR-RISK-01).
  PASS: Test (b) — subscription mode throws with mode=subscription-required + verbatim D-39-05 message
[WARN] ClaudeProvider.getClient() invoked without API key — subscription users must use SdkAgentRunner (FR-RISK-01).
  PASS: Test (c) — no-creds api-key mode throws with mode=no-credentials + verbatim D-39-05 message

All claude.test.ts tests passed (3/3)
  PASS: no-authtoken-regression — claude.ts contains zero `authToken:` occurrences

All no-authtoken-regression.test.ts tests passed (1/1)
  PASS: sdk-agent-runner.ts integrity verified (SHA: 2b3b005bf1594821be6353268ffbbdddea5f9a3a)

All sdk-agent-runner-integrity.test.ts tests passed (1/1)
```

**Total:** 5 assertions across 3 files, all PASS, exit 0.

The two `[WARN]` lines are the `logger.warn(...)` from `getClient()` firing in tests (b) and (c) — they are expected and prove the warn-log line lands before the throw (per Plan 39-02 Task 3 behavior spec).

## Invariant Verifications

```
$ grep -rn "authToken:" nexus/packages/core/src/providers/claude.ts | grep -v test
(empty — zero matches)

$ git diff nexus/packages/core/src/sdk-agent-runner.ts
(empty — zero output)

$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
2b3b005bf1594821be6353268ffbbdddea5f9a3a
```

## Sacred File Baseline SHA

The `BASELINE_SHA` constant in `sdk-agent-runner-integrity.test.ts` is set to:

```
2b3b005bf1594821be6353268ffbbdddea5f9a3a
```

This matches:
- `39-AUDIT.md` Section 5 (Plan 39-01 baseline)
- `39-02-SUMMARY.md` post-edit verification (Plan 39-02 Task 6)
- The current `git hash-object` output (Plan 39-03 Task 5)

All four sources agree.

## Implementation Note: Vitest vs node:assert

CONTEXT.md (D-39-10) said "Vitest framework (existing)". This was incorrect — `nexus/packages/core/package.json` has NO vitest in `devDependencies`. The actual existing test pattern (see `nexus/packages/core/src/agent-session.test.ts`) uses `node:assert/strict` + `tsx`.

Plan 39-03 followed the actual project pattern — no vitest devDependency added, no new tooling, just `node:assert` + the existing `tsx` dev tool. This sticks to CONTEXT.md "Claude's Discretion" allowance: "Whether the grep-regression test runs in vitest or as a separate package.json script — planner can pick." We picked the established pattern.

## Phase 39 Closure Statement

**FR-RISK-01 satisfied.** Phase 39 ready to close. Phase 40 (Per-User OAuth + HOME Isolation) unblocked.

All 4 ROADMAP Phase 39 success criteria are now codified:
1. Zero `authToken: token` matches → `no-authtoken-regression.test.ts` enforces.
2. Subscription users → SdkAgentRunner OR clear typed error → `claude.test.ts` test (b) asserts.
3. Existing API-key path still works → `claude.test.ts` test (a) asserts (proxy via `isAvailable`).
4. `sdk-agent-runner.ts` byte-identical → `sdk-agent-runner-integrity.test.ts` pins SHA.
