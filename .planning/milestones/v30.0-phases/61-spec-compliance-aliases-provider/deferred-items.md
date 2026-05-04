# Phase 61 Deferred Items

Out-of-scope discoveries logged during plan execution. Per Rule 3 scope
boundary — these are NOT fixed in Phase 61.

## Plan 02 (Wave 2 — provider stubs)

### Pre-existing broker test files with no test suites

Discovered 2026-05-03 during Task 2 verify (`vitest run source/modules/livinity-broker/`).

5 broker test files report `No test suite found in file`:
- `source/modules/livinity-broker/integration.test.ts`
- `source/modules/livinity-broker/openai-integration.test.ts`
- `source/modules/livinity-broker/openai-sse-adapter.test.ts`
- `source/modules/livinity-broker/sse-adapter.test.ts`
- `source/modules/livinity-broker/translate-request.test.ts`

Confirmed pre-existing by `git stash && vitest run ... && git stash pop` round-trip:
baseline (without Plan 02 changes) reports the same 5 failures.

These appear to be empty/stub test files OR conditionally-skipped suites
that vitest's collector cannot identify. Out of scope for Plan 02 — needs
its own investigation phase.

Plan 02 introduces ZERO new "No test suite found" failures. Net regression
from Plan 02: 0.
