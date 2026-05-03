---
phase: 57-passthrough-mode-agent-mode
plan: 01
subsystem: testing
tags: [broker, passthrough, vitest, anthropic-sdk, scaffolding, phase-57]

requires:
  - phase: 56-research-spike
    provides: D-30-01 (HTTP-proxy strategy), D-30-02 (forward tools verbatim), D-30-03 (header opt-in), D-30-07 (sacred file untouched)
provides:
  - "RED test surface for resolveMode() (mode-dispatch.test.ts — 11 cases)"
  - "RED test surface for readSubscriptionToken() (credential-extractor.test.ts — 7 cases)"
  - "RED test surface for passthroughAnthropicMessages() (passthrough-handler.test.ts — 8 cases)"
  - "Test fixture mirroring real ~/.claude/.credentials.json shape (FIXTURE token, non-functional)"
  - "README.md documenting dual-mode dispatch contract for any future internal caller"
  - "@anthropic-ai/sdk reachable from livinityd context (Risk-B mitigated)"
affects:
  - 57-02 (Wave 1 — implements mode-dispatch.ts + credential-extractor.ts → turns first 18 RED tests GREEN)
  - 57-03 (Wave 2 — implements passthrough-handler.ts → turns last 8 RED tests GREEN)
  - 57-04 (Wave 3 — wires passthrough into router.ts + openai-router.ts)
  - 57-05 (Wave 4 — integration tests + Mini PC smoke)

tech-stack:
  added:
    - "@anthropic-ai/sdk@^0.80.0 (added to livinityd package.json — same version already hoisted via @nexus/core; no new npm registry entry, just workspace-level reachability declaration)"
  patterns:
    - "RED-then-GREEN test scaffolding: failing tests authored in Wave 0 before any production file exists, defining the contract Waves 1+2 must satisfy"
    - "vi.mock for @anthropic-ai/sdk to prevent any test from making real network calls to api.anthropic.com (T-57-02 mitigation)"
    - "FIXTURE-DO-NOT-USE-IN-PRODUCTION sentinel string in test credentials so any leak is immediately recognizable as non-functional (T-57-01 mitigation)"
    - "Sacred file SHA pre-flight + post-execute verification on every task (T-57-03 mitigation)"

key-files:
  created:
    - "livos/packages/livinityd/source/modules/livinity-broker/README.md"
    - "livos/packages/livinityd/source/modules/livinity-broker/__fixtures__/credentials.fixture.json"
    - "livos/packages/livinityd/source/modules/livinity-broker/mode-dispatch.test.ts"
    - "livos/packages/livinityd/source/modules/livinity-broker/credential-extractor.test.ts"
    - "livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.test.ts"
  modified:
    - "livos/packages/livinityd/package.json (added @anthropic-ai/sdk dep)"
    - "livos/pnpm-lock.yaml (regenerated for hoisted sdk)"

key-decisions:
  - "Adding @anthropic-ai/sdk to livinityd package.json is the correct path under D-NO-NEW-DEPS — the same version is already in pnpm-lock.yaml via @nexus/core's transitive deps, so no new package version reaches the npm registry. The plan and CONTEXT.md explicitly authorize this as 'reusing the existing hoisted version, not adding a new dep.'"
  - "Three test files use the .js import suffix (e.g. './mode-dispatch.js') matching the existing livinity-broker/*.ts ESM convention so the RED state asserts on missing production modules and Wave 1+2 implementations can be picked up without rewriting imports."
  - "Credential-extractor tests mock the per-user-claude module so isMultiUserMode() resolves true without needing the database to be online (test isolation)."

patterns-established:
  - "Pattern: Wave 0 RED scaffolding — author failing tests covering all FR-* acceptance criteria before any production file exists, then Wave N implementations satisfy each test in turn. Future GSD plans for greenfield modules can copy this approach."
  - "Pattern: D-NO-NEW-DEPS with workspace transitive reuse — when a sub-package needs a dep already in another sub-package's deps, add the package.json entry pinning the same version; pnpm hoists, no new registry resolution."

requirements-completed:
  - FR-BROKER-A1-01
  - FR-BROKER-A1-02
  - FR-BROKER-A1-03
  - FR-BROKER-A1-04
  - FR-BROKER-A2-01

duration: 22min
completed: 2026-05-02
---

# Phase 57 Plan 01: Wave 0 Test Scaffolding + README + SDK Reachability Audit Summary

**26 RED unit/integration tests + a dual-mode dispatch README + a non-functional fixture credentials.json scaffold the v30.0 passthrough mode before any production code is written; @anthropic-ai/sdk is now reachable from livinityd via a same-version pnpm hoist.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-05-02T18:00Z (approx, plan kickoff)
- **Completed:** 2026-05-02T18:25Z
- **Tasks:** 2 (both completed)
- **Files modified:** 7 (5 created + 2 dep manifests)

## Accomplishments

- **3 NEW test files (26 RED cases total)** — `mode-dispatch.test.ts` (11), `credential-extractor.test.ts` (7), `passthrough-handler.test.ts` (8). Every FR-BROKER-A1-01..03 + A2-01 + A1-04 acceptance criterion has a deterministic test signal Wave 1+2 must satisfy.
- **README.md** documenting the `X-Livinity-Mode: agent` opt-in contract — covers all 6 required sections (overview, modes table, when-to-use-agent-mode, sacred file boundary, curl examples, future caller checklist) plus a module layout table for the broker directory post-Phase-57.
- **credentials.fixture.json** mirroring the real `~/.claude/.credentials.json` shape with the `FIXTURE-DO-NOT-USE-IN-PRODUCTION` sentinel token — passes T-57-01 acceptance grep and is non-functional at api.anthropic.com.
- **@anthropic-ai/sdk reachability** — added pinned `^0.80.0` entry to `livinityd/package.json`; `pnpm install` succeeded; `node -e "require.resolve('@anthropic-ai/sdk')"` exits 0 from livinityd's working dir. Wave 2 production code can `import Anthropic from '@anthropic-ai/sdk'` without further dep work.
- **Sacred file UNTOUCHED** — `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical pre-flight, after Task 1, after Task 2, and at end-of-plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: README + fixture + SDK reachability** — `340ff587` (docs)
2. **Task 2: Three RED test files** — `d3dfb52f` (test)

## Files Created/Modified

- `livos/packages/livinityd/source/modules/livinity-broker/README.md` (97 lines) — dual-mode dispatch contract; passthrough vs agent mode with curl examples
- `livos/packages/livinityd/source/modules/livinity-broker/__fixtures__/credentials.fixture.json` — non-functional fixture mirroring real Claude Code credentials.json
- `livos/packages/livinityd/source/modules/livinity-broker/mode-dispatch.test.ts` (104 lines, 11 cases) — RED tests for `resolveMode()`
- `livos/packages/livinityd/source/modules/livinity-broker/credential-extractor.test.ts` (157 lines, 7 cases) — RED tests for `readSubscriptionToken()`
- `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.test.ts` (337 lines, 8 cases) — RED tests for `passthroughAnthropicMessages()` with mocked @anthropic-ai/sdk
- `livos/packages/livinityd/package.json` — added `@anthropic-ai/sdk: ^0.80.0` to dependencies (alphabetical)
- `livos/pnpm-lock.yaml` — regenerated to surface the hoisted sdk to livinityd's resolution chain

## Decisions Made

- **D-NO-NEW-DEPS interpretation:** Adding `@anthropic-ai/sdk` to `livos/packages/livinityd/package.json` is consistent with D-NO-NEW-DEPS because the exact same version (`0.80.0`) was already in `livos/pnpm-lock.yaml` via `@nexus/core`'s transitive dependency. No new package version was downloaded from the npm registry — pnpm reused the already-hoisted store entry. The plan's `<action>` Step 2 and CONTEXT.md "Anthropic SDK Already Available — Reuse" explicitly authorize this path.
- **`.js` import suffix in test files:** All three test files import production modules via `./mode-dispatch.js`, `./credential-extractor.js`, `./passthrough-handler.js` (with the `.js` extension). This matches the existing ESM convention in `livinity-broker/*.ts` and ensures Wave 1+2 implementations are picked up without import-path rewrites.
- **`isMultiUserMode` mocked at the module boundary** in `credential-extractor.test.ts` to keep the test free of database / per-user-claude module dependencies (test isolation per the existing broker test patterns).
- **Fixture sentinel string:** `FIXTURE-DO-NOT-USE-IN-PRODUCTION` chosen so any accidental leak (e.g., this token appearing in a real log line) is immediately recognizable as non-functional and harmless.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Added @anthropic-ai/sdk entry to livinityd package.json**
- **Found during:** Task 1, Step 2 — the SDK reachability probe (`node -e "require.resolve('@anthropic-ai/sdk')"`) failed because pnpm did not hoist `@anthropic-ai/sdk` to a location resolvable from `livos/packages/livinityd`. The package was present in `livos/node_modules/.pnpm/@anthropic-ai+sdk@0.80.0_zod@3.25.76/node_modules/@anthropic-ai/sdk` (via `@nexus/core` transitive) but the workspace did not surface it.
- **Issue:** The plan's `<must_haves>` explicitly requires "@anthropic-ai/sdk is reachable as an import from the broker directory" and the Task 1 acceptance criterion `cd livos/packages/livinityd && node -e "require.resolve('@anthropic-ai/sdk')" exits 0` was a hard fail.
- **Fix:** Added `"@anthropic-ai/sdk": "^0.80.0"` to `livos/packages/livinityd/package.json` `dependencies` block (alphabetical, immediately before `@aws-sdk/client-s3`). Ran `pnpm install --frozen-lockfile=false` from `livos/`. pnpm reused the already-hoisted store entry (no new download) and surfaced the sdk to livinityd's resolution chain.
- **Files modified:** `livos/packages/livinityd/package.json`, `livos/pnpm-lock.yaml`
- **Verification:** Post-fix `node -e "require.resolve('@anthropic-ai/sdk')"` from `livos/packages/livinityd/` resolves to `livos/node_modules/.pnpm/@anthropic-ai+sdk@0.80.0_zod@3.25.76/node_modules/@anthropic-ai/sdk/index.js` (exit 0). Sacred file SHA unchanged.
- **Committed in:** `340ff587` (Task 1 commit)
- **D-NO-NEW-DEPS audit:** Still GREEN. The plan and CONTEXT.md (line 28) explicitly authorize this as "OK to reuse from broker — D-NO-NEW-DEPS preserved since same version is hoisted."

---

**Total deviations:** 1 auto-fixed (1 blocking — same-version dep declaration that the plan explicitly anticipated as a possible fallback path)

**Impact on plan:** Zero scope creep. The deviation is exactly the fallback path enumerated in the plan's `<action>` Step 2: "If tsc fails to resolve `@anthropic-ai/sdk`: add `"@anthropic-ai/sdk": "^0.80.0"` to `livos/packages/livinityd/package.json` `dependencies` block (alphabetical), run `pnpm install --frozen-lockfile=false` from repo root, retry probe."

## Issues Encountered

- **Pre-existing UI postinstall script failure on Windows.** During `pnpm install` for the dep addition, `packages/ui` postinstall script ran `mkdir -p public/generated-tabler-icons && cp -r ./node_modules/@tabler/icons/icons/. ./public/generated-tabler-icons` which fails on PowerShell because of Windows shell semantics ("The syntax of the command is incorrect"). This is a pre-existing breakage unrelated to this plan — the install succeeded for the dep tree (`Packages: +17 -2`, the SDK and its deps were installed) and only the UI's postinstall failed. The reachability probe still passes, so this does not block Wave 0 acceptance. Logged as deferred-item context for future Windows-compat work.

## Self-Check: PASSED

- [x] `livos/packages/livinityd/source/modules/livinity-broker/README.md` exists (97 lines)
- [x] `livos/packages/livinityd/source/modules/livinity-broker/__fixtures__/credentials.fixture.json` exists, parses as JSON, contains `claudeAiOauth.accessToken` + FIXTURE sentinel
- [x] `livos/packages/livinityd/source/modules/livinity-broker/mode-dispatch.test.ts` exists (104 lines, 11 cases, references `resolveMode` + `X-Livinity-Mode`)
- [x] `livos/packages/livinityd/source/modules/livinity-broker/credential-extractor.test.ts` exists (157 lines, 7 cases, references `readSubscriptionToken` + `claudeAiOauth` + `BROKER_FORCE_ROOT_HOME`)
- [x] `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.test.ts` exists (337 lines, 8 cases, references `passthroughAnthropicMessages` + `authToken` + `Anthropic` + `messagesCreate`)
- [x] All three test files use `./X.js` ESM import suffix
- [x] All three test files RED with expected error "Failed to load url ./X.js — Does the file exist?"
- [x] Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at end of plan
- [x] No edits to any file under `nexus/packages/core/src/` (`git status` clean for nexus dir)
- [x] @anthropic-ai/sdk reachable from livinityd: `node -e "require.resolve('@anthropic-ai/sdk')"` exits 0
- [x] Both task commits exist: `340ff587` (Task 1 docs), `d3dfb52f` (Task 2 tests)

## Next Phase Readiness

- **Wave 1 (Plan 57-02) unblocked:** The 18 RED tests across `mode-dispatch.test.ts` + `credential-extractor.test.ts` define the exact contract Wave 1 must satisfy. Wave 1 author should:
  - Create `livinity-broker/mode-dispatch.ts` exporting `resolveMode(req): BrokerMode` (header trim + lowercase + array-form handling)
  - Create `livinity-broker/credential-extractor.ts` exporting `readSubscriptionToken({livinityd, userId})` reading `<homeOverride>/.claude/.credentials.json` (multi-user mode) OR `process.env.HOME/.claude/.credentials.json` (BROKER_FORCE_ROOT_HOME mode); never log credential paths on failure
  - Run vitest on `mode-dispatch.test.ts` + `credential-extractor.test.ts` — must turn all 18 cases GREEN
- **Wave 2 (Plan 57-03) unblocked:** The 8 RED passthrough-handler tests define the contract Wave 2 must satisfy. Wave 2 author should:
  - Create `livinity-broker/passthrough-handler.ts` exporting `passthroughAnthropicMessages({livinityd, userId, body, res})`
  - Use `new Anthropic({authToken, defaultHeaders: {'anthropic-version': '2023-06-01'}})` (NOT apiKey)
  - Forward body verbatim (`system`, `tools`, `messages`) to `client.messages.create(...)`
  - Catch Anthropic.APIError → throw `UpstreamHttpError(message, status, retryAfter)` so existing router.ts 429 forwarder applies
  - Run vitest on `passthrough-handler.test.ts` — must turn all 8 cases GREEN
- **No test scaffolding gaps surfaced.** All FR-BROKER-A1-01..04 + FR-BROKER-A2-01 requirements have at least one corresponding test. FR-BROKER-A2-02 (agent mode byte-identical) is intentionally tested by the existing v29.5 `integration.test.ts` re-run unchanged — no new test needed in Wave 0.
- **No blockers for Waves 1 + 2 + 3 + 4.** Each wave's input contract is fully visible in the RED tests + README.

## Threat Flags

None — all files created (test scaffolding + README + fixture + dep manifest update) introduce no new network endpoints, auth paths, file access patterns, or schema changes. The fixture credentials.json contains a sentinel non-functional token. All passthrough handler tests use `vi.mock('@anthropic-ai/sdk')` to prevent any real network call.

---
*Phase: 57-passthrough-mode-agent-mode*
*Completed: 2026-05-02*
