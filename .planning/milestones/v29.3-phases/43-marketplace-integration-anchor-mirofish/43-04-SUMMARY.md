# Plan 43-04 Summary — Integration Tests + Schema Test + UI Badge + test:phase43 Script

**Plan:** 43-04
**Phase:** 43 — Marketplace Integration (Anchor: MiroFish)
**Status:** COMPLETE
**Requirements:** FR-MARKET-01, FR-MARKET-02

## Files Modified

| File | Type | Change |
|------|------|--------|
| `livos/packages/livinityd/source/modules/apps/install-for-user-injection.test.ts` | NEW | 142-line integration test simulating the per-user compose pipeline (positive + negative + userId propagation) |
| `livos/packages/livinityd/source/modules/apps/manifest-mirofish.test.ts` | NEW | 41-line schema validation test for Plan 43-03 draft manifest |
| `livos/packages/ui/src/modules/app-store/app-page/app-content.tsx` | edit | Add Badge import + conditional `<Badge variant='outline'>Uses your Claude subscription</Badge>` render in both desktop + mobile layouts |
| `nexus/packages/core/package.json` | edit | Add `"test:phase43": "npm run test:phase42"` to scripts |

## Test Results

### Plan 43-04 vitest tests (NEW)

```
$ cd livos/packages/livinityd && pnpm exec vitest run source/modules/apps/install-for-user-injection.test.ts source/modules/apps/manifest-mirofish.test.ts
 ✓ source/modules/apps/install-for-user-injection.test.ts (3 tests)
 ✓ source/modules/apps/manifest-mirofish.test.ts (2 tests)
 Test Files  2 passed (2)
      Tests  5 passed (5)
```

5/5 vitest tests pass:
- POSITIVE — manifest with `requiresAiProvider: true` → captured YAML contains 3 env vars + extra_hosts
- NEGATIVE — manifest WITHOUT flag → captured YAML lacks broker env vars (FR-MARKET-01 SC #2 / Risk R6 verified at integration level)
- USER_ID PROPAGATION — userId verbatim in URL (Risk R5 verified)
- MiroFish manifest passes AppManifestSchema validation
- MiroFish manifest has all FR-MARKET-02 required fields

### Plan 43-02 unit tests (re-run)

14/14 tests still pass (no regression from Plan 43-04 changes).

### test:phase43 chain

```
$ cd nexus/packages/core && npm run test:phase43
> npm run test:phase42
> npm run test:phase41
> tsx src/providers/api-home-override.test.ts && npm run test:phase40
> tsx src/providers/sdk-agent-runner-home-override.test.ts && npm run test:phase39
> tsx src/providers/claude.test.ts && tsx src/providers/no-authtoken-regression.test.ts && tsx src/providers/sdk-agent-runner-integrity.test.ts

All sdk-agent-runner-home-override.test.ts tests passed (4/4)
All claude.test.ts tests passed (3/3)
All no-authtoken-regression.test.ts tests passed (1/1)
All sdk-agent-runner-integrity.test.ts tests passed (1/1)
```

9/9 nexus chained tests pass (4 home-override + 3 claude + 1 no-authtoken + 1 sdk-agent-runner-integrity). Phase 39 + 40 + 41 + 42 regression coverage preserved.

## Implementation Notes

### Integration test approach

Rather than mock the full `Apps` class (which has many DB / Redis / store / logger / native-app constructor dependencies — extremely brittle to mock), the integration test uses a **simulation function** (`simulateInstallForUserPipeline`) that mirrors the same YAML transformation pipeline as `apps.ts:906-967`. The Phase 43 injection step (`injectAiProviderConfig`) is the SAME function imported from production code, so the test exercises the EXACT injection logic that runs in production.

This pragmatic approach trades full-stack mocking complexity for a focused integration assertion: "given the same input pipeline, the function chain produces the expected YAML." The "real installForUser end-to-end" verification (with database writes + container spawn) is delegated to Plan 43-05 manual UAT on Mini PC.

### RegistryApp type propagation

Per Plan 43-01 audit Section 5: `RegistryApp` is INFERRED from a tRPC router output type (`livos/packages/ui/src/trpc/trpc.ts:135`). The router returns the parsed manifest (via `validateManifest`, which currently uses a permissive cast — TODO: enable Zod validation). The new `requiresAiProvider` field flows automatically through the inference chain. **No explicit interface/type edit required.** TypeScript checks confirm zero errors related to the new field.

### Badge variant choice

`livos/packages/ui/src/shadcn-components/ui/badge.tsx` defines variants: `default | primary | destructive | outline`. **No `secondary` variant exists.** Used `variant='outline'` instead — the closest semantic match for a non-disruptive informational badge.

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

## FR-MARKET-01 + FR-MARKET-02 Structural Gates

| Gate | Source | Status |
|------|--------|--------|
| FR-MARKET-01 SC #1 (env vars present when flag true) | inject-ai-provider.test.ts Test 2/3/5/6 + install-for-user-injection.test.ts POSITIVE + USER_ID | PASS (unit + integration) |
| FR-MARKET-01 SC #2 (env vars absent when flag false/omitted) | inject-ai-provider.test.ts Test 1a/1b/8 + install-for-user-injection.test.ts NEGATIVE | PASS (unit + integration) |
| FR-MARKET-02 SC #3 (MiroFish UI loads + Claude responds) | live UAT only | DEFERRED to Plan 43-05 (operator) |
| FR-MARKET-02 SC #4 (zero "API key" prompts in MiroFish UI) | live UAT only | DEFERRED to Plan 43-05 (operator) |
| MiroFish manifest validates against AppManifestSchema | manifest-mirofish.test.ts | PASS |
| D-43-12 UI badge ships | app-content.tsx Badge wire | PASS (file content; runtime verification = Plan 43-05 UAT) |
