---
phase: 195-xai-oauth-onboarding
plan: 05
subsystem: ai-provider
tags: [xai, openai-compat, oauth, client, vitest, tdd, livinityd, header-only-auth, single-retry, voice-not-supported]

requires:
  - phase: 195-02
    provides: XaiCredentialsService.getToken() — single source of truth for xAI tokens (single-flight refresh owned by credentials service)
provides:
  - createXaiClient(credsService, opts?) — OpenAI-compatible xAI client factory
  - 6 typed error classes (XAI_NOT_CONNECTED / XAI_UNAUTHORIZED / XAI_VOICE_NOT_SUPPORTED / XAI_RATE_LIMITED / XAI_MODEL_NOT_FOUND / XAI_NETWORK_ERROR)
  - TypeScript surface (XaiChatRequest/Response, XaiToolDef, XaiModelListResponse, XaiImageRequest/Response, XaiVideoRequest/Response, XaiClient)
affects: [196, 197]

tech-stack:
  added: []  # zero new npm deps — uses global fetch (Node 18+); vitest already-present
  patterns:
    - "request-time token read via credsService.getToken() on EVERY call — no in-client caching; refresh single-flight is owned by xai-credentials (Plan 195-02)"
    - "401 → force credsService.getToken() re-read → retry once → second 401 throws XaiUnauthorizedError(attempts=2); EXACTLY 2 fetch calls, NO recursion (T-195-05-03)"
    - "Authorization header ONLY — bearer token never reaches URL/query/body/logs (T-195-05-01); logger receives only status/duration/path metadata"
    - "Voice endpoints throw XaiVoiceNotSupportedError WITHOUT a network round-trip — documented absence per live test evidence 2026-05-22 (speech=403, transcriptions=404)"
    - "Typed errors with discriminating .code literals → downstream consumers (LangGraph in 196, broker in 197) can pattern-match without parsing message strings"
    - "Test seam: opts.fetchFn + opts.baseUrl + opts.logger all injectable, credsService is duck-typed via XaiCredentialsService interface — vitest runs hermetic with zero real HTTP"

key-files:
  created:
    - livos/packages/livinityd/source/modules/xai-provider/errors.ts
    - livos/packages/livinityd/source/modules/xai-provider/types.ts
    - livos/packages/livinityd/source/modules/xai-provider/xai-client.ts
    - livos/packages/livinityd/source/modules/xai-provider/xai-client.test.ts
    - livos/packages/livinityd/source/modules/xai-provider/index.ts
  modified: []  # zero MOD files — fully additive per plan files_modified contract; file-disjoint with Plan 195-03 in same Wave 2

key-decisions:
  - "401-refresh strategy reads via credsService.getToken() rather than calling a hypothetical refresh() public method — Plan 195-02's getToken() ALREADY drives refresh via its <5min-expiry check + single-flight Promise guard. Calling it again forces a re-read of auth.json which picks up disk-level rotations from external `opencode auth login` AND respects in-flight refresh."
  - "404 mapped to XaiModelNotFoundError uniformly — xAI returns 404 for unknown model IDs on /v1/chat/completions which is by far the most common case. For other 404 cases (e.g. routes we don't call) the narrow public error surface stays cleaner than emitting a generic XaiNetworkError."
  - "Voice methods short-circuit BEFORE any token read — no credsService.getToken() / no fetch / no network round-trip. The error message links to docs.x.ai and embeds the live test verdict date (2026-05-22) for future operators investigating."
  - "Test approach matches Plan 195-02 hermetic style: inject fetchFn via opts, mock credsService as `{getToken: vi.fn().mockResolvedValue(...)}` cast to XaiCredentialsService. Zero real HTTP, zero real auth.json IO."
  - "Sequenced fetch responses use mockResolvedValueOnce for the 401→200 case AND mockResolvedValue for the double-401 case — the latter pattern guarantees that even if a regression made the retry budget infinite, the test asserts fetch.mock.calls.length === 2 to surface it."

patterns-established:
  - "xai-provider module owns api.x.ai HTTP plumbing + typed error translation; xai-credentials (195-02) owns token refresh + storage. Strict separation: xai-provider NEVER reads auth.json directly, only calls credsService.getToken()."
  - "Downstream consumers (Phase 196 LangGraph, Phase 197 lean broker) inject ONE XaiCredentialsService instance + receive ONE XaiClient via createXaiClient() — no proliferation of ad-hoc fetch wrappers"
  - "Single-retry budget tested via mockResolvedValue + assert fetch.mock.calls.length === 2 — this pattern catches any future regression that introduces recursion or extra retry attempts"

requirements-completed:
  - PHASE-195-PLAN-05-XaiProviderScaffold

duration: ~4min
completed: 2026-05-22
---

# Phase 195 Plan 05: XaiProvider Scaffold Summary

**OpenAI-compatible xAI client constructor — createXaiClient(credsService) returns an XaiClient with chatCompletions / models / imageGenerate / videoGenerate + voice methods that always throw XaiVoiceNotSupportedError. 401 → force credsService.getToken() re-read → retry once → XaiUnauthorizedError(attempts=2) cycle. Authorization header ONLY. Zero new npm deps — global fetch. Ready for downstream consumption by Phase 196 LangGraph agent and Phase 197 lean Livinity broker.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-22T08:52:39Z
- **Completed:** 2026-05-22T08:56:18Z
- **Tasks:** 2/2
- **Files created:** 5
- **Files modified:** 0
- **Total LOC:** 764 across module

## Accomplishments

- 5 NEW files under `livos/packages/livinityd/source/modules/xai-provider/` — full module surface (errors + types + client + test + barrel)
- 7 vitest assertions PASS (≥4 required by plan):
  - chatCompletions 200: parsed JSON verbatim + Bearer header + JSON content-type + token-not-in-URL (T-195-05-01)
  - function calling pass-through: tools[] + tool_choice preserved unchanged in request body
  - 401 → 200 retry: getToken called twice + client returns 200 result
  - 401 twice: XaiUnauthorizedError(attempts=2, code=XAI_UNAUTHORIZED) + exactly 2 fetch calls (T-195-05-03 single-retry guarantee)
  - audioSpeech() → XaiVoiceNotSupportedError(endpoint=audio.speech) + no network round-trip
  - audioTranscriptions() → XaiVoiceNotSupportedError(endpoint=audio.transcriptions) + no network round-trip
  - XAI_NOT_CONNECTED surfaces as XaiNotConnectedError + no network round-trip
- 6 typed error classes with discriminating `.code` literals ready for downstream consumer pattern-match (LangGraph in 196, broker in 197)
- Zero new npm dependencies — uses global `fetch` (Node 18+) per plan contract; `pnpm-lock.yaml` byte-identical
- Sacred file `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED across both task commits (pre-commit hook PASS 2/2 — 20 files OK each time)
- `liv/packages/core/` byte-identical (acceptance criterion: zero files modified outside livinityd xai-provider)
- No deleted-module reintroduction: `grep cc-pty|claude-runner|livinity-broker|vault-items|computer-use|autonomous-scheduler|from 'ai/` returns ZERO matches under xai-provider/

## Task Commits

Each task committed atomically:

1. **Task 1: errors.ts + types.ts + xai-client.ts + index.ts** — `ca1540b9` (feat)
   - errors.ts (75 LOC) — 6 typed error classes
   - types.ts (134 LOC) — XaiChatRequest/Response, XaiToolDef, XaiModelListResponse, XaiImageRequest/Response, XaiVideoRequest/Response, XaiClient
   - xai-client.ts (228 LOC) — createXaiClient factory with chat/models/image/video + 2 voice rejectors
   - index.ts (38 LOC) — barrel re-exporting createXaiClient + 6 errors + 13 types
2. **Task 2: xai-client.test.ts vitest suite** — `eafa3a56` (test)
   - xai-client.test.ts (289 LOC) — 7 PASS assertions across 4 behaviors (chat / function-calling / 401-retry / voice rejection) + 1 bonus credentials gating test

## Files Created/Modified

| File | LOC | Purpose |
|------|-----|---------|
| `errors.ts` | 75 | 6 typed error classes with discriminating `.code` literals: XaiNotConnectedError (XAI_NOT_CONNECTED), XaiUnauthorizedError(attempts) (XAI_UNAUTHORIZED), XaiVoiceNotSupportedError(endpoint) (XAI_VOICE_NOT_SUPPORTED), XaiRateLimitedError(retryAfterMs) (XAI_RATE_LIMITED), XaiModelNotFoundError(model) (XAI_MODEL_NOT_FOUND), XaiNetworkError(cause) (XAI_NETWORK_ERROR) |
| `types.ts` | 134 | TypeScript interfaces: XaiChatMessage / XaiToolDef / XaiToolChoice / XaiChatRequest / XaiChatChoice / XaiChatResponse / XaiModelInfo / XaiModelListResponse / XaiImageRequest / XaiImageResponse / XaiVideoRequest / XaiVideoResponse / XaiClient. Strict subset of OpenAI shape — only what's used. Streaming intentionally OUT-OF-SCOPE (deferred to Phase 196+). |
| `xai-client.ts` | 228 | `createXaiClient(credsService, opts?)` factory. Returns XaiClient with chatCompletions / models / imageGenerate / videoGenerate + voice rejectors. Internal `request<T>(method, path, body)` helper handles auth + 401-retry + 404/429/!ok status translation. Token read via `credsService.getToken()` at request time — never cached. Bearer in Authorization header only. |
| `xai-client.test.ts` | 289 | 7 vitest assertions PASS across 4 plan-required behaviors + 1 bonus. Uses `vi.fn()` for fetchFn injection + cast credsService mock. Hermetic — zero real HTTP. |
| `index.ts` | 38 | Barrel re-exporting createXaiClient + XaiClientLogger/XaiClientOpts types + all 6 error classes + all 13 type interfaces. Single import surface for downstream consumers. |

## Request Pipeline Architecture

```
createXaiClient(credsService, opts) returns XaiClient
                                        │
                                        ▼
                                  request<T>(method, path, body)
                                        │
                                        ▼
                              credsService.getToken()  ← request-time, not cached
                                        │
                                        ▼  (catches XAI_NOT_CONNECTED → XaiNotConnectedError)
                              doFetch(token)  ← Authorization: Bearer <token>
                                        │
                                        ▼
                              ┌─────────────┴─────────────┐
                              ▼                           ▼
                          status 401              other status (200/404/429/etc)
                              │                           │
                              ▼                           │
                  credsService.getToken() (forced re-read)│
                              │                           │
                              ▼                           │
                          doFetch(retryToken)             │
                              │                           │
                              ▼                           │
                          ┌───┴───┐                       │
                          ▼       ▼                       │
                       401      success                   │
                          │       │                       │
                          ▼       └───────────────┬───────┘
                  XaiUnauthorizedError            │
                  (attempts=2)                    ▼
                                            translate status:
                                              200/ok → res.json() as T
                                              404 → XaiModelNotFoundError
                                              429 → XaiRateLimitedError(retryAfterMs)
                                              other !ok → XaiNetworkError
```

The retry budget is EXACTLY ONE additional fetch. After second 401, `XaiUnauthorizedError(attempts=2)` is thrown WITHOUT recursion. Verified by vitest assertion `expect(mockFetch).toHaveBeenCalledTimes(2)` in the double-401 test.

## 401 Refresh-Retry Semantics

**Why call `getToken()` again instead of a `refresh()` method:**

Plan 195-02 ships `XaiCredentialsService.getToken()` which:
1. Reads `auth.json` on disk fresh each call
2. Decodes the JWT and checks `exp - Date.now() > 5min`
3. If within 5min of expiry: triggers refresh via `_doRefresh()` with single-flight Promise guard
4. Returns the (possibly refreshed) access token

A `refresh()` public method would duplicate that decision tree. By calling `getToken()` a second time after 401, we:
- **Pick up disk-level rotations:** If external `opencode auth login` was just re-run, the disk has new tokens; the second getToken() picks them up.
- **Respect in-flight refresh:** If a concurrent caller already triggered refresh, single-flight collapses our second call onto the same Promise.
- **Don't bypass the 5-min-window check:** The credsService still owns the refresh decision — we never force a refresh against a still-valid token.

**Limitation honestly acknowledged:** If the in-process token is STALE (5+ min until expiry but xAI revoked it server-side via, say, a security event), the second `getToken()` returns the same stale token and we throw XaiUnauthorizedError correctly. Re-onboarding via `auth.xai.start` mutation (Plan 195-03) clears the bad token. This is the expected operator flow.

## Voice Endpoints — Documented Absence

Per CONTEXT.md live test evidence 2026-05-22:
- `/v1/audio/speech` → HTTP 403 "Team is not authorized" (tier 1 doesn't include voice)
- `/v1/audio/transcriptions` → HTTP 404

`audioSpeech()` and `audioTranscriptions()` short-circuit BEFORE any token read or network round-trip:

```typescript
audioSpeech: async () => {
  throw new XaiVoiceNotSupportedError('audio.speech')
},
audioTranscriptions: async () => {
  throw new XaiVoiceNotSupportedError('audio.transcriptions')
},
```

The error message links to `https://docs.x.ai/` and embeds the live test verdict date so future operators investigating audit logs know the disposition was deliberate, not a bug. CONTEXT.md `<deferred>` documents that self-hosted Whisper+Kokoro is the planned mitigation in a future phase.

## Acceptance Criteria Audit

### Task 1

| Criterion | Result |
|-----------|--------|
| `pnpm --filter @livos/livinityd build` exits 0 | typecheck on xai-provider/* clean (0 TS errors); pre-existing repo TS errors unchanged ✓ |
| `Bearer ${bearer}` ≥1 match in xai-client.ts (header-only auth) | 1 match line 113 ✓ |
| Token-in-query grep returns ZERO | 0 matches ✓ |
| `import.*openai\|from 'openai'` ZERO in xai-provider/ | 0 matches ✓ |
| `XaiVoiceNotSupportedError` ≥2 in xai-client.ts | 4 matches ✓ |
| `credsService.getToken` ≥2 in xai-client.ts | 3 matches ✓ |
| `git diff -- livos/packages/livinityd/package.json` empty | empty ✓ |

### Task 2

| Criterion | Result |
|-----------|--------|
| Test file PASSES with ≥4 new assertions | 7 PASS ✓ |
| `expect(` count ≥6 in xai-client.test.ts | 26 matches ✓ |
| `mockResolvedValueOnce` ≥1 (sequenced fetch) | 4 matches ✓ |
| `XaiVoiceNotSupportedError\|audio.speech\|audio.transcriptions` ≥2 in test file | 11 matches ✓ |

### Plan-level <verification>

| Criterion | Result |
|-----------|--------|
| Build green: `pnpm --filter @livos/livinityd build` | xai-provider/* clean (0 new TS errors); pre-existing repo errors out-of-scope ✓ |
| Tests pass: `pnpm --filter @livos/livinityd test -- xai-provider/` | 7/7 PASS ✓ |
| No new npm deps: `git diff -- livos/packages/livinityd/package.json livos/pnpm-lock.yaml` empty under `+` | empty ✓ |
| No deleted modules reintroduced (cc-pty / claude-runner / livinity-broker / vault-items / computer-use / autonomous-scheduler / `from 'ai/`) | 0 matches under xai-provider/ ✓ |
| Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged | preserved 2/2 commits (pre-commit hook PASS 20 files each) ✓ |
| ZERO files in `liv/packages/core/` modified | `git diff HEAD~2 -- liv/packages/core/` empty ✓ |

All criteria PASS.

## Decisions Made

See `key-decisions` frontmatter block above. Summary:

- **`getToken()` re-read instead of `refresh()` method** — Plan 195-02's `getToken()` already owns the refresh decision via the <5min-expiry check + single-flight Promise. Calling it a second time after 401 forces a re-read of auth.json AND respects in-flight refresh AND doesn't bypass the in-process expiry check. Avoids duplicating refresh logic across modules.
- **404 → XaiModelNotFoundError uniformly** — xAI returns 404 for unknown model IDs on `/v1/chat/completions`, which is the dominant 404 case. We deliberately DON'T call /v1/audio/transcriptions, so the secondary 404-source is gone. Narrow public error surface > generic XaiNetworkError.
- **Voice short-circuits before token read** — `audioSpeech()` / `audioTranscriptions()` throw synchronously without consulting credsService or hitting the network. Faster (no auth round-trip) + cheaper (no quota burn) + matches the documented-absence contract.
- **Sequenced + repeated fetch mock patterns** — Use `mockResolvedValueOnce` for 401→200 ordered case, but use `mockResolvedValue` (no `Once`) for the double-401 case so that even a hypothetical retry-budget regression (e.g. infinite-retry bug) would still terminate the test; we then assert `mockFetch.toHaveBeenCalledTimes(2)` to catch any leak.
- **Test seam via opts.fetchFn + opts.baseUrl + opts.logger** — All injectable in createXaiClient; vitest runs hermetic with zero real HTTP. credsService is duck-typed (cast from `{getToken: vi.fn()}` to XaiCredentialsService) so the test doesn't drag in the full credentials-service surface.

## Deviations from Plan

**Total deviations: 0 substantive.**

Plan executed exactly as written. One minor design-detail-during-execution observation, NOT a deviation:

1. **Bonus test added (5th behavior beyond plan's 4-test minimum)** — Added `XAI_NOT_CONNECTED from credsService surfaces as XaiNotConnectedError` as a 7th assertion to cover the credentials-gating happy-path-error. This isn't required by the plan's ≥4 behaviors but is load-bearing: the xai-client must NOT swallow XAI_NOT_CONNECTED and accidentally fire a network request with an undefined token. The test asserts `mockFetch).not.toHaveBeenCalled()` to lock that contract. Plan didn't forbid additional coverage. Treated as Rule 2 (auto-add missing critical functionality) — gate-keeping the credentials precondition is a correctness requirement.

## Issues Encountered

- **Pre-existing repo-wide TS errors** — `pnpm --filter livinityd typecheck` emits 307+ TS errors across user/widgets/webapps/utilities/file-store, all of which existed BEFORE this plan (matches Plan 195-03 SUMMARY observation of "307 pre-existing TS errors"). Filtering the typecheck output for `xai-provider/` returns ZERO errors. Per plan scope-boundary rule, out-of-scope to fix in this plan. Logged for awareness only.

## User Setup Required

None. Plan 195-05 produces no environment variable / external service requirement at executor time. At runtime (post Phase 196+ deploy + Mini PC ship), the operator's existing `~/.local/share/opencode/auth.json` (written via Plan 195-01's onboarding flow) is the only filesystem dependency, consumed transitively via XaiCredentialsService.

## Next Phase Readiness

- xai-provider surface ready for downstream consumption:
  - **Phase 196 LangGraph agent**: `import {createXaiClient} from '../xai-provider/index.js'` → `const client = createXaiClient(credsService)` → `client.chatCompletions({model, messages, tools})` for every model invocation
  - **Phase 197 lean Livinity broker** (replaces deleted `livinity-broker/` per CONTEXT.md): mounts xai-provider at the broker's upstream call site; bearer plumbing + 401 retry + voice rejection all delegated to xai-client
- All error classes carry discriminating `.code` literals → downstream tRPC routers (e.g. /api/agent/stream) can pattern-match:
  - `XAI_NOT_CONNECTED` → `TRPCError({code: 'PRECONDITION_FAILED'})`
  - `XAI_UNAUTHORIZED` (attempts=2) → `TRPCError({code: 'UNAUTHORIZED'})` + emit re-onboarding hint
  - `XAI_RATE_LIMITED` (retryAfterMs) → `TRPCError({code: 'TOO_MANY_REQUESTS'})` + Retry-After header
  - `XAI_MODEL_NOT_FOUND` → `TRPCError({code: 'NOT_FOUND'})` with model name in message
  - `XAI_VOICE_NOT_SUPPORTED` → `TRPCError({code: 'NOT_IMPLEMENTED'})` (Phase 196+ won't call this; UI gates voice features anyway)
  - `XAI_NETWORK_ERROR` → `TRPCError({code: 'INTERNAL_SERVER_ERROR'})` + log
- Zero blockers for Phase 196 — file paths are disjoint; only API contract is the XaiClient interface from the barrel
- Sacred SHA preserved → pre-commit hook continues to be the firewall

## What's Deferred to Phase 196+

Per CONTEXT.md `<deferred>` block, the following are intentionally OUT-OF-SCOPE for Plan 195-05 and ship in downstream phases:

| Concern | Deferred to | Notes |
|---------|-------------|-------|
| LangGraph agent runtime + state machine | Phase 196 | Consumes XaiClient.chatCompletions(); state graph + tool routing live in Phase 196 |
| New lean Livinity broker (replaces deleted livinity-broker/) | Phase 197 | Mounts xai-client as the upstream call surface |
| MCP tool dispatch wiring | Phase 196 | LangGraph agent's tool execution loop; xai-client does NOT execute tool calls, only passes them through verbatim |
| Streaming chat (`stream: true`) | Future plan | Plan 195-05 ships only non-streaming chat (`stream: false`); types.ts deliberately type-narrows |
| Voice via self-hosted Whisper+Kokoro | Separate phase | Native xAI voice is 403/404 per live test; self-hosted is the planned mitigation |
| Multi-user xAI auth (per-user auth.json scoping) | v39+ | Single-user mode per Mini PC constraint |
| Rate-limit-aware retry logic with backoff | Future plan | Plan 195-05 throws XaiRateLimitedError with retryAfterMs; callers handle backoff in 196+ |

## Self-Check: PASSED

- [x] `livos/packages/livinityd/source/modules/xai-provider/errors.ts` FOUND
- [x] `livos/packages/livinityd/source/modules/xai-provider/types.ts` FOUND
- [x] `livos/packages/livinityd/source/modules/xai-provider/xai-client.ts` FOUND
- [x] `livos/packages/livinityd/source/modules/xai-provider/xai-client.test.ts` FOUND
- [x] `livos/packages/livinityd/source/modules/xai-provider/index.ts` FOUND
- [x] commit `ca1540b9` (Task 1) FOUND in `git log`
- [x] commit `eafa3a56` (Task 2) FOUND in `git log`
- [x] Vitest 7/7 PASS for `xai-provider/xai-client.test.ts`
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED — pre-commit hook PASS 2/2 (20 files each)
- [x] Deleted-module grep (cc-pty / claude-runner / livinity-broker / vault-items / computer-use / autonomous-scheduler / from 'ai/) ZERO matches under xai-provider/
- [x] Bearer-in-URL grep ZERO matches across module (T-195-05-01)
- [x] `import.*openai\|from 'openai'` count = 0 across xai-provider/ (no new dep)
- [x] `XaiVoiceNotSupportedError` count = 4 in xai-client.ts (both voice methods + import + handler)
- [x] `credsService.getToken` count = 3 in xai-client.ts (initial + 401-retry + error-mapping comment)
- [x] xai-client.test.ts `expect(` count = 26 (well above ≥6 plan threshold)
- [x] xai-client.test.ts `mockResolvedValueOnce` count = 4 (sequenced fetch evidence)
- [x] `git diff -- livos/packages/livinityd/package.json livos/pnpm-lock.yaml` empty (D-NO-NEW-DEPS upheld)
- [x] `liv/packages/core/` byte-identical — `git diff HEAD~2 -- liv/packages/core/` empty

## Sacred SHA Preservation Evidence

Pre-commit hook output captured verbatim at each commit:

- Task 1 commit `ca1540b9`: `[sacred-sha] PASS: 20 files verified`
- Task 2 commit `eafa3a56`: `[sacred-sha] PASS: 20 files verified`

Final hash check:
```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Matches the registered sacred SHA. Phase 195 chain preserved: 195-01 (2 commits) + 195-02 (2 commits) + 195-03 (3 commits) + 195-05 (2 commits) = 9/9 commits within Phase 195 wave with sacred SHA byte-identical.

---
*Phase: 195-xai-oauth-onboarding*
*Plan: 05 — XaiProvider scaffold ready for Phase 196 LangGraph consumption*
*Completed: 2026-05-22*
