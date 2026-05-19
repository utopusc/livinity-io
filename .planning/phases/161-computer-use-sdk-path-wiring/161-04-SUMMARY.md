---
phase: 161-computer-use-sdk-path-wiring
plan: 04
subsystem: testing
tags: [computer-use, ui-hook, prefix-invariant, verification-only, vitest, source-text-invariant, phase-161]

# Dependency graph
requires:
  - phase: 161-computer-use-sdk-path-wiring
    provides: "D-161-E (use-native-app-agent.ts is a NEAR no-op — verification-only)"
  - phase: 159-native-app-agent-hook
    provides: "use-native-app-agent.ts emits `native:<id>:<rand>` conversationId prefix unconditionally"
  - phase: 95-06-webapp-agent-session
    provides: "use-webapp-agent.ts emits `webapp:<id>:<rand>` conversationId prefix + makeFreshConversationId helper"
provides:
  - "Source-text invariant lock for native: conversationId prefix-emit + verbatim pass-through to agent.sendMessage"
  - "Source-text invariant lock for webapp: conversationId prefix-emit + verbatim pass-through to agent.sendMessage"
  - "no-mutation guard (two-step filter) detecting any convId reassignment that is NOT the legitimate lazy mint"
  - "Self-referential Phase 161-04 markers across both test files for grep discoverability"
affects: [161-01, 161-02, 161-03, future-ui-hook-refactors, isComputerUseSession-detection-chain]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-step reassignment filter (collect + reject-by-RHS) — avoids backtracking false-positives in single-regex `\\s*[^X]` patterns"
    - "TDD RED-control via intentional broken marker → green via real invariant (preserves RED gate audit trail in commit history)"
    - "Self-referential test markers (`Phase 161-04` in test file body, asserted by test) for grep-based regression discovery"

key-files:
  created: []
  modified:
    - "livos/packages/ui/src/hooks/use-native-app-agent.test.ts — +4 Phase 161-04 invariant tests (verbatim pass-through, let-binding + lazy mint, no-mutation guard, self-marker)"
    - "livos/packages/ui/src/hooks/use-webapp-agent.unit.test.tsx — +4 symmetric Phase 161-04 invariant tests (skips redundant prefix-emit since line 36-38 already locks it)"

key-decisions:
  - "Replaced plan's defective `/^\\s*convId\\s*=\\s*[^m]/gm` no-mutation regex with two-step filter (Rule 1 deviation): the original pattern false-positives on the legitimate `convId = makeFreshConversationId(...)` lazy mint when `=` is followed by a single space, because regex backtracking lets `\\s*` consume 0 chars and a space matches `[^m]`. Two-step preserves the landmine's INTENT (allow lazy mint, reject mutation) without ambiguity."
  - "Used native `__dirname` (CommonJS-compat in vitest jsdom) for marker tests instead of `fileURLToPath(import.meta.url)` — both test files already import `__dirname` via `resolve(__dirname, ...)`, so no new ESM-helper imports needed (D-NO-NEW-DEPS-friendlier)."
  - "TDD RED-control: intentionally-broken marker test added first → red proven → replaced with real invariants → green. Documented in commit history (RED phase exists implicitly in working-tree audit, not as a separate commit)."

patterns-established:
  - "Phase 161-04 marker pattern: every regression-test lock-in block contains the literal `Phase 161-04` AND asserts on its own presence via `readFileSync(__filename, 'utf8')`. Future investigators run `grep -r 'Phase 161-04' livos/packages/ui/` to locate both regression suites instantly."
  - "Two-step reassignment filter: `match-all` then `filter-reject-by-RHS-prefix` is more robust than a single regex with character-class exclusions when the RHS contains both legitimate and illegitimate patterns differing only in identifier prefix."

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-05-19
---

# Phase 161 Plan 04: Computer-Use SDK Path Wiring — UI Hook Prefix Invariant Lock Summary

**Locked the `native:` + `webapp:` conversationId prefix-emit + verbatim pass-through contract via 8 new source-text invariant tests; zero source-file changes per D-161-E verification-only contract.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-19T13:41:00Z
- **Completed:** 2026-05-19T13:47:20Z
- **Tasks:** 2 (both TDD: RED→GREEN)
- **Files modified:** 2 (test files only)

## Accomplishments

- Added Phase 161-04 invariant block to `use-native-app-agent.test.ts` (4 new assertions; 12→16 tests; all green)
- Added Phase 161-04 invariant block to `use-webapp-agent.unit.test.tsx` (4 new assertions; 13→17 tests; all green)
- Locked the SDK-path computer-use detection signal at the UI layer: any future refactor mutating `convId` between mint and `agent.sendMessage` fires red, preventing silent regression of Plan 161-01's `isComputerUseSession(session.conversationId)` Haiku routing
- Re-confirmed end-to-end prefix trace stays intact (per RESEARCH Q5): `makeFreshConversationId` → `let convId = conversationId` → lazy mint → `agent.sendMessage(text, undefined, convId, attachments)` → useAgentSocket WS `start` envelope → ws-agent.ts → AgentSessionManager.session.conversationId

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend use-native-app-agent.test.ts with Phase 161-04 prefix-pass-through invariant** — `91fee041` (test)
2. **Task 2: Extend use-webapp-agent.unit.test.tsx with equivalent Phase 161-04 prefix-pass-through invariants** — `f7ddeff7` (test)

**Plan metadata:** _(pending — final docs commit appended after this SUMMARY is written; see commit log)_

_Note: TDD RED phase performed via intentional broken marker in working tree (verified test failure with 1 failed / 12 passed for native, 1 failed / 13 passed for webapp), then replaced with real invariants and committed as the single GREEN test commit per task. RED was not committed separately because the plan is type=execute (not type=tdd) — plan-level RED gate not required._

## Files Created/Modified

- `livos/packages/ui/src/hooks/use-native-app-agent.test.ts` — appended `Phase 161-04 — native: prefix downstream invariants` describe block with 4 assertions (verbatim pass-through, let-binding + lazy mint, no-mutation guard via two-step filter, self-referential marker). Pre-existing 12 tests untouched.
- `livos/packages/ui/src/hooks/use-webapp-agent.unit.test.tsx` — appended symmetric `Phase 161-04 — webapp: prefix downstream invariants` describe block with 4 assertions (skipped redundant prefix-emit since line 36-38 already locks the `webapp:<webappId>:` template literal). Pre-existing 13 tests untouched.

## Decisions Made

- **Two-step filter over single defective regex:** Plan's `/^\s*convId\s*=\s*[^m]/gm` was defective due to regex backtracking (documented in Deviations below). Replaced with collect-then-filter pattern that preserves the landmine's INTENT (allow `convId = makeFreshConversationId(...)`, reject anything else) without ambiguity.
- **Skip redundant webapp prefix-emit assertion:** Plan 161-04 Task 2 step 6 explicitly allows skipping the template-literal-emit test if the existing test file already locks it. Line 36-38 of `use-webapp-agent.unit.test.tsx` does (`expect(HOOK_SRC).toMatch(/`webapp:\$\{webappId\}:/)`), so the new block ships only the 4 complementary invariants (pass-through, binding, no-mutation, marker).
- **Native `__dirname` over `fileURLToPath`:** Plan's landmine #5 (ESM compat) suggested `fileURLToPath(import.meta.url)` as a precaution. Both test files already import `__dirname` and use it via `resolve(__dirname, ...)` at the top — vitest/jsdom resolves `__dirname` natively in this config, so no new ESM helpers needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's no-mutation regex `/^\s*convId\s*=\s*[^m]/gm` is defective due to regex backtracking**

- **Found during:** Task 1 GREEN phase (initial vitest run after adding real invariants)
- **Issue:** The regex was intended to match `convId = <something-not-starting-with-m>` to detect illegitimate reassignment while excluding the legitimate lazy mint `convId = makeFreshConversationId(...)`. The `[^m]` character class IS supposed to do that exclusion. However, regex backtracking lets `\s*` (the whitespace-after-`=`) consume 0 chars when the source has `convId = makeFresh...`, putting position on the space ` `, which DOES match `[^m]` — false positive. The actual source line 88 (`				convId = makeFreshConversationId(nativeAppId)`) matched, fired the test red even though the implementation is exactly the legitimate lazy mint the regex was supposed to allow.
- **Fix:** Replaced single-regex pattern with two-step filter:
  ```typescript
  const allReassigns = SRC.match(/^\s*convId\s*=\s*([^\n]+)$/gm) ?? []
  const illegitimate = allReassigns.filter((line) => {
    const rhs = line.replace(/^\s*convId\s*=\s*/, '').trim()
    return !/^makeFreshConversationId\s*\(/.test(rhs)
  })
  expect(illegitimate).toEqual([])
  ```
  Step 1 collects ALL reassignment lines; Step 2 rejects any whose RHS does NOT start with `makeFreshConversationId(`. Preserves the landmine's INTENT (allow lazy mint, reject mutation) without backtracking ambiguity.
- **Files modified:** `use-native-app-agent.test.ts`, `use-webapp-agent.unit.test.tsx` (same fix mirrored)
- **Verification:** After the fix, native 16/16 green and webapp 17/17 green. The test still fires red if anyone adds e.g. `convId = convId.replace(/^native:/, '')` — verified mentally by walking the regex.
- **Committed in:** `91fee041` (Task 1) + `f7ddeff7` (Task 2)
- **Hard-guardrail note:** The Plan's `<hard_guardrails>` #6 said "No-mutation regex defensive lock: `/^\s*convId\s*=\s*[^m]/gm` is intentional (excludes legitimate `convId = makeFreshConversationId(...)` reassignment). Don't 'fix' it." However, the regex did NOT actually exclude the legitimate mint — that was the bug. The fix here PRESERVES the guardrail's INTENT (allow lazy mint, reject mutation) via a different mechanism. Documenting this transparently rather than silently overriding.

**2. [Rule 1 - Bug] Plan's binding test `/const\s+convId\s*=\s*makeFreshConversationId\(nativeAppId\)/` does not match actual source**

- **Found during:** Task 1 read-first analysis (before writing any test code)
- **Issue:** Plan's example regex asserted `const convId = makeFreshConversationId(nativeAppId)` (single-line const-binding) but the actual implementation at `use-native-app-agent.ts:86-91` is `let convId = conversationId` + a separate `convId = makeFreshConversationId(nativeAppId)` lazy mint inside an `if (!convId)` block. The const-binding regex would have failed.
- **Fix:** Split the binding invariant into two assertions reflecting the actual implementation:
  ```typescript
  expect(SRC).toMatch(/let\s+convId\s*=\s*conversationId/)
  expect(SRC).toMatch(/convId\s*=\s*makeFreshConversationId\(nativeAppId\)/)
  ```
- **Files modified:** `use-native-app-agent.test.ts`, `use-webapp-agent.unit.test.tsx` (same correction mirrored with `webappId`)
- **Verification:** Both lines exist verbatim in source; regex passes.
- **Committed in:** `91fee041` + `f7ddeff7`

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bugs in plan's regex examples)
**Impact on plan:** Both fixes preserve plan intent — the verbatim pass-through + no-mutation lock is fully achieved. No scope creep; verification-only contract preserved (zero source-file diffs).

## Issues Encountered

- None beyond the 2 Rule-1 plan-regex bugs above.

## Threat Model Compliance

- **T-161-04-03 (Repudiation — UI mutates convId, no test catches it):** Mitigated. The two-step no-mutation filter installed in both test files is the explicit STRIDE mitigation. Any future PR that adds e.g. `convId = stripPrefix(convId)` fires red on `pnpm --filter ui test:run use-{native,webapp}-app-agent`.
- **T-161-04-01 (Tampering — malicious extension/XSS):** Accept (out of scope per plan threat register).
- **T-161-04-02 (Information Disclosure via journalctl):** Accept (same surface as Phase 159, no privacy delta).

## Guardrail Verification

All 6 hard guardrails GREEN at end of plan:

| # | Guardrail | Verification | Result |
|---|-----------|--------------|--------|
| 1 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` | `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts` | UNCHANGED ✓ |
| 2 | D-09 verbatim (`luse-system-prompt.ts` bytes UNCHANGED) | `git diff HEAD~2 -- livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` | empty ✓ |
| 3 | D-NO-NEW-DEPS | `git diff HEAD~2 -- '**/package.json'` | empty ✓ |
| 4 | Verification-only contract: `use-native-app-agent.ts` byte-identical | `git diff HEAD~2 -- livos/packages/ui/src/hooks/use-native-app-agent.ts` | empty ✓ |
| 4 | Verification-only contract: `use-webapp-agent.ts` byte-identical | `git diff HEAD~2 -- livos/packages/ui/src/hooks/use-webapp-agent.ts` | empty ✓ |
| 5 | ESM test compat (only an issue if `fileURLToPath` was needed) | Not needed — both test files use native `__dirname` resolved by vitest/jsdom | N/A ✓ |
| 6 | No-mutation regex preserves landmine intent | Two-step filter rejects any non-`makeFreshConversationId(...)` reassignment of `convId`; manually walked — fires red on `convId = convId.replace(...)`, `convId = stripPrefix(...)`, etc. | preserved ✓ |

## Prefix Trace Re-Confirmation (per RESEARCH Q5)

End-to-end conversationId prefix flow, verified intact post-161-04:

```
use-native-app-agent.ts:33-39
  makeFreshConversationId(nativeAppId) → `native:${nativeAppId}:${rand}`

use-native-app-agent.ts:86-91
  let convId = conversationId
  if (!convId) {
    convId = makeFreshConversationId(nativeAppId)   // mint
    setFreshConversationId(convId)                  // persist for next render
  }
  agent.sendMessage(text, undefined, convId, attachments)   // VERBATIM PASS

use-agent-socket.ts (sendMessage signature: text, model?, conversationId?, attachments?)
  → WS start envelope includes conversationId verbatim

ws-agent.ts:226-235
  → sessionManager.handleMessage receives conversationId verbatim
  → session.conversationId = `native:...` (or `webapp:...`)

agent-session.ts (Plan 161-01 — pending wave 1 of 161 phase, NOT yet shipped)
  → isComputerUseSession(session.conversationId?.startsWith('native:') || .startsWith('webapp:'))
  → tier override: 'haiku' → model: 'claude-haiku-4-5-20251001' (Plan 161-01)
  → systemPrompt: buildLuseSystemPromptWithOverlayResolved() (Plan 161-02)
```

Same trace for `webapp:` via `use-webapp-agent.ts:89-98` + lines 245-250.

## Next Phase Readiness

- **Plan 161-04 CODE-COMPLETE.** Verification-only contract satisfied; no operator UAT required (test-only delta).
- **Unblocks Plans 161-01, 161-02, 161-03** which can now safely depend on the conversationId prefix being emitted unconditionally — any future refactor that breaks the contract triggers `use-native-app-agent.test.ts` or `use-webapp-agent.unit.test.tsx` red on CI.
- **No outstanding work for this plan.** Wave 1 dispatch can proceed in parallel for 161-01/02/03 as planned in RESEARCH "wave-planning consideration".

## Self-Check: PASSED

Verified at SUMMARY-write time:

```bash
# Test files exist + invariant blocks present
$ grep -c "Phase 161-04" livos/packages/ui/src/hooks/use-native-app-agent.test.ts
7

$ grep -c "Phase 161-04" livos/packages/ui/src/hooks/use-webapp-agent.unit.test.tsx
8

# Test runs green
$ cd livos && pnpm --filter ui run test:run use-native-app-agent
✓ 16/16 passed
$ cd livos && pnpm --filter ui run test:run use-webapp-agent
✓ 17/17 passed

# Commits exist
$ git log --oneline HEAD~2..HEAD
f7ddeff7 test(161-04): lock webapp: convId prefix-emit + pass-through invariants
91fee041 test(161-04): lock native: convId prefix-emit + pass-through invariants

# Sacred SHA preserved
$ git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts
100644 blob f3538e1d811992b782a9bb057d1b7f0a0189f95f	liv/packages/core/src/sdk-agent-runner.ts
```

All claims in this SUMMARY verified.

---
*Phase: 161-computer-use-sdk-path-wiring*
*Completed: 2026-05-19*
