# Plan 43-02 Summary — Schema Field + Injection Module + 14 Unit Tests + Wiring

**Plan:** 43-02
**Phase:** 43 — Marketplace Integration (Anchor: MiroFish)
**Status:** COMPLETE
**Requirement:** FR-MARKET-01

## Files Modified

| File | Type | Change |
|------|------|--------|
| `livos/packages/livinityd/source/modules/apps/schema.ts` | edit | Add optional `requiresAiProvider: z.boolean().optional()` field with JSDoc (between `optimizedForLivinityHome` and `torOnly`) |
| `livos/packages/livinityd/source/modules/apps/inject-ai-provider.ts` | NEW | 73-line pure function module exporting `injectAiProviderConfig(composeData, userId, manifest)` |
| `livos/packages/livinityd/source/modules/apps/inject-ai-provider.test.ts` | NEW | 173-line bare-tsx test file with 14 test cases (TDD) |
| `livos/packages/livinityd/source/modules/apps/apps.ts` | edit | (a) Add import line 20; (b) Add `injectAiProviderConfig(composeData, userId, manifest)` call at line 963 (between per-service patches and host-port mapping) |

## Test Results

```
$ cd livos/packages/livinityd && npx tsx source/modules/apps/inject-ai-provider.test.ts
✔ Test 1a: flag false → compose unchanged
✔ Test 1b: flag undefined → compose unchanged
✔ Test 2: flag true on bare service → 3 env vars + extra_hosts added
✔ Test 3: existing env preserved, broker keys added (no overwrite)
✔ Test 3b: pre-existing ANTHROPIC_BASE_URL is PRESERVED (do not overwrite)
✔ Test 4: existing extra_hosts → broker host appended
✔ Test 4b: extra_hosts already contains broker → no duplicate
✔ Test 5: userId verbatim in URL (no encoding)
✔ Test 6: multi-service compose → only first service mutated
✔ Test 7a: schema accepts requiresAiProvider: true
✔ Test 7b: schema accepts requiresAiProvider: false
✔ Test 7c: schema accepts manifest without the field (optional)
✔ Test 7d: schema rejects non-boolean requiresAiProvider
✔ Test 8: regression — flag false on populated compose → deep-equal unchanged
ℹ tests 14
ℹ pass 14
ℹ fail 0
```

**14/14 unit tests pass.** TDD cycle complete: RED (module not found) → GREEN (all tests pass).

## TypeScript Sanity Check

`npx tsc --noEmit` — zero errors in `inject-ai-provider.ts`, `inject-ai-provider.test.ts`, schema.ts changes, and apps.ts changes. Three PRE-EXISTING errors at apps.ts:115, 116, 155 (Buffer/string type issues — unrelated to Phase 43; not in scope per Rule 3 scope boundary).

## Sacred File + Broker Verification

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
623a65b9a50a89887d36f770dcd015b691793a7f
$ git diff HEAD -- nexus/packages/core/src/sdk-agent-runner.ts | wc -l
0
$ git diff HEAD -- livos/packages/livinityd/source/modules/livinity-broker/ | wc -l
0
```

Sacred file SHA byte-identical to Phase 40 baseline. Broker module untouched.

## FR-MARKET-01 Structural Enforcement

- **SC #1 (env vars present when flag true):** structurally enforced at the unit level by Test 2, Test 3, Test 5, Test 6.
- **SC #2 (env vars absent when flag false/omitted):** structurally enforced at the unit level by Test 1a, Test 1b, Test 8 (deep-equal regression).

The full integration path verification (live `installForUser` end-to-end) is delivered by Plan 43-04 via vitest-mocked integration test.
