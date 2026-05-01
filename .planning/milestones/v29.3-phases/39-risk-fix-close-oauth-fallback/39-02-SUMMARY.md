# Plan 39-02 Summary — Delete Fallbacks & Reroute

**Plan:** 39-02 Delete Fallbacks and Reroute
**Phase:** 39 Risk Fix — Close OAuth Fallback
**Completed:** 2026-04-29
**Requirements:** FR-RISK-01 (deletion + typed error landed; final test invariants in Plan 39-03)

---

## Commit

**SHA:** `aa3384044fe007fd54eae480185c44e56f4efc4c` (short: `aa338404`)
**Title:** `refactor(39-02): close OAuth fallback in ClaudeProvider.getClient (FR-RISK-01)`
**Files changed:** 1
**Diff:** `nexus/packages/core/src/providers/claude.ts | 93 ++++++++++++++++------------- — 1 file changed, 50 insertions(+), 43 deletions(-)`

## Invariant Grep Counts (post-commit)

```
grep -c "authToken:" nexus/packages/core/src/providers/claude.ts        → 0  ✓
grep -c "ANTHROPIC_AUTH_TOKEN" nexus/packages/core/src/providers/claude.ts → 0  ✓
grep -c "claudeAiOauth" nexus/packages/core/src/providers/claude.ts     → 1  ✓ (line 473, inside submitLoginCode — OAuth FLOW that WRITES creds, preserved)
grep -c "credsPath" nexus/packages/core/src/providers/claude.ts         → 0  ✓
grep -n "export class ClaudeAuthMethodMismatchError" → match at line 34   ✓
grep -n "throw new ClaudeAuthMethodMismatchError"    → match at line 121  ✓ (inside getClient catch block)
```

## Sacred File Integrity

| Phase | SHA | Match? |
|-------|-----|--------|
| Pre-Phase-39 baseline (from 39-AUDIT.md Section 5) | `2b3b005bf1594821be6353268ffbbdddea5f9a3a` | — |
| Pre-edit (Task 1 verification) | `2b3b005bf1594821be6353268ffbbdddea5f9a3a` | ✓ matches baseline |
| Post-edit (Task 6 verification) | `2b3b005bf1594821be6353268ffbbdddea5f9a3a` | ✓ matches baseline |

`git diff nexus/packages/core/src/sdk-agent-runner.ts` produces 0 lines of output. The sacred file is byte-identical pre- and post-commit.

## Build

```
$ cd nexus && npm run build --workspace=packages/core
> @nexus/core@1.0.0 build
> tsc

(exit 0 — zero TypeScript errors)
```

## Hand-off to Plan 39-03

Plan 39-03 will pin the deletion via three test files. The deletion enables these invariants:

1. **Unit test (a) — API-key path regression:** stub Redis returns a fake API key → `provider.isAvailable()` returns `true`. Proves the explicit-API-key flow is intact (preserves the `try { const apiKey = await this.getApiKey(); ... }` success branch).

2. **Unit test (b) — sdk-subscription mode misroute:** stub Redis returns null for the API key + `'sdk-subscription'` for the auth method → calling `provider.chat(...)` throws `ClaudeAuthMethodMismatchError` with `mode === 'subscription-required'` and the verbatim D-39-05 error message text.

3. **Unit test (c) — no-credentials misroute:** stub Redis returns null for both keys (auth method defaults to `'api-key'`) → calling `provider.chat(...)` throws `ClaudeAuthMethodMismatchError` with `mode === 'no-credentials'` and the verbatim D-39-05 message.

4. **Grep regression (`no-authtoken-regression.test.ts`):** asserts `claude.ts` source contains zero substrings `authToken:`. Future re-introduction (in code OR comments) fails the test.

5. **Sacred integrity (`sdk-agent-runner-integrity.test.ts`):** pins `nexus/packages/core/src/sdk-agent-runner.ts` to git blob SHA `2b3b005bf1594821be6353268ffbbdddea5f9a3a` (the baseline from 39-AUDIT.md Section 5). Future modifications fail the test, forcing intentional changes to update the baseline + audit for re-opened OAuth-fallback risk.

## Notes on Implementation Choices

- **Comment phrasing tightened:** the inline `// Deleted in v29.3 Phase 39 (FR-RISK-01)` documentation block does not literally repeat the strings `authToken:` or `ANTHROPIC_AUTH_TOKEN`. This was done specifically so Plan 39-03's `no-authtoken-regression.test.ts` (which does NOT strip comments) can keep the strictest possible invariant: zero substrings of `authToken:` anywhere in `claude.ts`, comments included. Future contributors who want to reference the deletion in a comment must use a different phrasing — a deliberate friction that keeps the regression test simple and uncompromised.

- **One-line `logger.warn(...)` retained inside the catch block** before the throw. Per Task 3 behavior spec — helps post-deploy diagnosis if anyone bumps into the deletion in production. The minimum hook for the deferred "telemetry on the deleted-fallback warning" item from CONTEXT.md.

- **`claudeAiOauth` retained at line 473 only** — inside `submitLoginCode()`, the OAuth FLOW that writes the credentials file. This is the legitimate per-user OAuth setup path used by `/api/claude/submit-code`, distinct from the deleted READ-at-request-time fallback. Plan 39-02 Task 4's CRITICAL note explicitly preserved it.
