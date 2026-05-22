---
phase: 195-xai-oauth-onboarding
verified: 2026-05-22T02:18:00Z
status: human_needed
score: 5/5 plans code-complete (production DI wire-up + Mini PC UAT pending — explicitly deferred / human-only verifiable)
overrides_applied: 0
human_verification:
  - test: "Production DI wire-up at livinityd boot (livos/packages/livinityd/source/index.ts line 854-857)"
    expected: "createAppRouter({chromeMaster, xaiAuth: createXaiAuthRouter({flowService: new XaiAuthFlowService(), credsService: new XaiCredentialsService()})}) replaces current chromeMaster-only injection so the empty-injection Proxy default stops throwing on auth.xai.* calls"
    why_human: "All 5 plans explicitly defer this to a separate follow-up phase ('production wire-up at livinityd boot remains pending'). Decision required — split into Phase 195.1 or roll into Phase 196 LangGraph agent phase. Without this step the runtime auth.xai.start mutation will throw 'flowService not injected'."
  - test: "Mini PC OpenCode CLI install + version pin in deploy/update.sh"
    expected: "opencode binary at /usr/local/bin/opencode or in PATH on bruce@10.69.31.68; `opencode --version` ≥ 1.15 so spawnOpencodeLogin resolves correctly"
    why_human: "CONTEXT.md <deferred> explicitly punts this to 'Phase 195.1 or follow-up'. Without it, FlowService.start() throws OpencodeNotInstalledError on Mini PC even after DI wire-up lands."
  - test: "End-to-end UAT walk-through of the new ConnectAiStep on Mini PC"
    expected: "Operator runs setup wizard, clicks 'Sign in with xAI', sees a new tab open to https://x.ai/oauth/device?code=…, completes auth, returns to LivOS UI which now shows '✓ Connected — SuperGrok Tier 1' + chips [Chat, Tools, Image, Video] and Continue enabled"
    why_human: "Visual + interactive flow across browser tabs, real OpenCode CLI spawn, real xAI OAuth servers. Cannot be automated from this verification harness. Must run after the two prior items land."
  - test: "Token refresh round-trip on live Mini PC after ~5h55min of uptime"
    expected: "XaiCredentialsService background refresh fires when <5min from JWT exp; 'token-refreshed' event emitted; auth.json on disk updated atomically; subsequent api.x.ai calls still 200"
    why_human: "Single-flight + atomic write verified hermetically via vitest, but live refresh against auth.x.ai/oauth2/token requires real refresh_token + 6h elapsed wall-clock window. Operator can simulate via shortened JWT exp claim if desired."
  - test: "Voice endpoint behavior matches CONTEXT.md verified facts (403 speech, 404 transcriptions)"
    expected: "audioSpeech() throws XaiVoiceNotSupportedError without network call; audioTranscriptions() same. UI never lists 'Voice' or 'audio' chips in connected state."
    why_human: "Unit-tested but tier-1 contract verification is an operator-visible assertion best confirmed live in the running app."
---

# Phase 195: xAI OAuth Onboarding Verification Report

**Phase Goal:** Replace the dishonest Phase 136 "Claude connected" placeholder with a real, working xAI OAuth onboarding flow. User signs in with xAI in setup wizard; OpenCode CLI device-code flow is fully hidden; credentials are persisted + refreshed transparently; OpenAI-compatible xAI client scaffold is ready for Phase 196 (LangGraph) and Phase 197 (lean Livinity broker).

**Verified:** 2026-05-22
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Backend can spawn `opencode auth login -p xai -m <method>` as a child process and extract the xAI OAuth URL from stdout | ✓ VERIFIED | `livos/packages/livinityd/source/modules/xai-auth/flow-service.ts:355 LOC` with `XaiAuthFlowService.start()`; `opencode-spawner.ts:171 LOC` resolves binary via PATH + 4 fallbacks; `url-extractor.ts:40 LOC` regex extracts both `https://x.ai/oauth/...` and `https://auth.x.ai/oauth/...`. 15/15 vitest assertions PASS. |
| 2 | XaiCredentialsService is single source of truth: getToken triggers refresh <5min from expiry, single-flight collapses N concurrent callers to 1 HTTP call | ✓ VERIFIED | `credentials-service.ts:335 LOC` line 117 `refreshInFlight: Promise<string> \| null`; line 155-170 guard; live-tested 10× concurrent → refreshFn called exactly 1 time. EventEmitter emits `token-refreshed` / `token-expired` / `disconnected` (8 emit() sites). Atomic write via `tmpPath = authJsonPath + '.tmp.' + process.pid` + `fs.rename`. 24/24 vitest assertions PASS. |
| 3 | tRPC `auth.xai.*` router exposes 4 procedures (start / status / waitForCompletion / disconnect) — all adminProcedure, all HTTP-only | ✓ VERIFIED | `xai-auth-router.ts` lines 89/101/110/125 — 4 procedures all using `adminProcedure`. `common.ts:566-569` adds all 4 paths to `httpOnlyPaths`. `index.ts:188` mounts as `auth: router({xai: opts.xaiAuth ?? xaiAuthRouter})`. flowId generated server-side via `randomUUID()` (T-195-03-02 non-enumerable). 5/5 vitest assertions PASS. |
| 4 | Onboarding UI replaces 106-LOC Phase 136 Claude placeholder with a real state machine driving xAI OAuth | ✓ VERIFIED | `connect-ai-step.tsx:370 LOC` — `grep -c "Claude" = 0` confirmed (the 2 noisy matches earlier were case-folded false hits in "claude-runner" scoped search). State machine: idle → starting → awaiting-user → connected/error. `isXaiOAuthUrl()` uses URL constructor + hostname-equality (defeats subdomain trick AND userinfo trick). `window.open` always passes `'noopener,noreferrer'`. 10-min `setTimeout(600_000)` watchdog. 7/7 vitest+jsdom assertions PASS. |
| 5 | xai-provider scaffold ready for Phase 196/197 consumption: OpenAI-compatible client, 401-refresh-retry-once, voice endpoints throw without network call | ✓ VERIFIED | `xai-client.ts:228 LOC` — `createXaiClient(credsService, opts?)` factory. Authorization header only (zero query-string auth). 401 → force `credsService.getToken()` re-read → retry once → `XaiUnauthorizedError(attempts=2)`. `audioSpeech` and `audioTranscriptions` short-circuit BEFORE token read with `XaiVoiceNotSupportedError`. 7/7 vitest assertions PASS. |
| 6 | End-to-end runtime path: user clicks "Sign in with xAI" → OAuth tab → connected state in UI | ✗ NOT RUNTIME-WIRED | Plans 195-01..05 ship all code, BUT `livos/packages/livinityd/source/index.ts:854-857` calls `createAppRouter({chromeMaster: chromeMasterRouterInjected})` WITHOUT injecting `xaiAuth`. The empty-injection Proxy default mounts, so any runtime call to `trpc.auth.xai.start` throws `xai-auth-router: flowService not injected`. Explicitly deferred in 195-03 SUMMARY ("production wire-up at livinityd boot remains pending") and STATE.md ("Next: ... production wire-up at livinityd boot..."). |

**Score:** 5/6 truths verified — truth #6 is the runtime wiring gap that all 5 plans explicitly defer.

### Required Artifacts

#### Plan 195-01: xai-auth/

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/livinityd/source/modules/xai-auth/index.ts` | Barrel re-exports XaiAuthFlowService + 7 errors | ✓ VERIFIED | Present, 14 flat exports |
| `livos/packages/livinityd/source/modules/xai-auth/flow-service.ts` | XaiAuthFlowService class (≥120 LOC) | ✓ VERIFIED | 355 LOC, all methods present |
| `livos/packages/livinityd/source/modules/xai-auth/opencode-spawner.ts` | spawnOpencodeLogin + binary discovery | ✓ VERIFIED | 171 LOC, argv-array spawn (no shell:true) |
| `livos/packages/livinityd/source/modules/xai-auth/url-extractor.ts` | extractXaiOAuthUrl regex helper | ✓ VERIFIED | 40 LOC, both host variants |
| `livos/packages/livinityd/source/modules/xai-auth/url-extractor.test.ts` | ≥4 vitest assertions | ✓ VERIFIED | 8 assertions PASS |
| `livos/packages/livinityd/source/modules/xai-auth/flow-service.test.ts` | ≥4 vitest assertions | ✓ VERIFIED | 7 assertions PASS |

#### Plan 195-02: xai-credentials/

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `xai-credentials/index.ts` | Barrel | ✓ VERIFIED | 25 LOC |
| `xai-credentials/credentials-service.ts` | XaiCredentialsService extends EventEmitter (≥180 LOC) | ✓ VERIFIED | 335 LOC, single-flight + atomic write verified in code |
| `xai-credentials/jwt-decoder.ts` | decodeXaiJwt | ✓ VERIFIED | 130 LOC, exp normalization |
| `xai-credentials/token-refresher.ts` | refreshXaiToken | ✓ VERIFIED | 122 LOC, URLSearchParams body |
| `xai-credentials/auth-json-path.ts` | Cross-platform path resolver | ✓ VERIFIED | 42 LOC, zero `/root/` literals (Phase 192 hard rule honored) |
| 3× test files | ≥9 assertions combined | ✓ VERIFIED | 24 assertions PASS (9 + 5 + 10) |

#### Plan 195-03: server/trpc/

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/trpc/xai-auth-router.ts` (NEW) | 4 adminProcedure procedures (≥80 LOC) | ✓ VERIFIED | 159 LOC, `grep "publicProcedure\|privateProcedure" = 0`, randomUUID flowId |
| `server/trpc/xai-auth-router.test.ts` (NEW) | ≥4 assertions | ✓ VERIFIED | 5 assertions PASS |
| `server/trpc/index.ts` (MOD) | Mount auth.xai.* + import createXaiAuthRouter | ✓ VERIFIED | Line 104 import; line 188 mount `auth: router({xai: opts.xaiAuth ?? xaiAuthRouter})` |
| `server/trpc/common.ts` (MOD) | 4 httpOnlyPaths entries | ✓ VERIFIED | Lines 566-569: `auth.xai.start/status/waitForCompletion/disconnect` |

#### Plan 195-04: ui/onboarding-flow/

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `connect-ai-step.tsx` (MOD full-replace) | ≥150 LOC; `grep "Claude" = 0` | ✓ VERIFIED | 370 LOC; `grep -c "Claude" = 0` confirmed; "Sign in with xAI" present; `noopener,noreferrer` on every window.open |
| `connect-ai-step.test.tsx` (NEW) | RTL/vitest ≥5 assertions | ✓ VERIFIED | 7/7 vitest+jsdom PASS via react-dom/client harness (D-NO-NEW-DEPS) |

#### Plan 195-05: xai-provider/

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `xai-provider/index.ts` | Barrel | ✓ VERIFIED | 38 LOC |
| `xai-provider/xai-client.ts` | createXaiClient (≥200 LOC) | ✓ VERIFIED | 228 LOC; header-only auth; 401→retry-once→XaiUnauthorizedError(attempts=2); voice methods short-circuit |
| `xai-provider/errors.ts` | 6 typed error classes | ✓ VERIFIED | XAI_NOT_CONNECTED / XAI_UNAUTHORIZED / XAI_VOICE_NOT_SUPPORTED / XAI_RATE_LIMITED / XAI_MODEL_NOT_FOUND / XAI_NETWORK_ERROR |
| `xai-provider/types.ts` | TS interfaces | ✓ VERIFIED | XaiChatRequest/Response, XaiClient, image/video shapes |
| `xai-provider/xai-client.test.ts` | ≥4 assertions | ✓ VERIFIED | 7 assertions PASS |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `XaiAuthFlowService.start()` | `spawnOpencodeLogin` | child_process.spawn argv-array | ✓ WIRED | flow-service.ts imports + invokes spawner |
| `XaiAuthFlowService.waitForCompletion` | auth.json on disk | child exit code 0 detection + 10-min timeout | ✓ WIRED | flow-service.ts vitest covers timeout + abort + cleanup |
| `XaiCredentialsService.getToken()` | `refreshXaiToken` | in-process single-flight Promise (`refreshInFlight`) | ✓ WIRED | credentials-service.ts:117 single-flight field; 6 refreshInFlight matches; 10×concurrent test PASS |
| `refreshXaiToken` | auth.json | `fs.writeFile(tmpPath, ...) → fs.rename(tmpPath, authJsonPath)` atomic swap | ✓ WIRED | credentials-service.ts:309-318 writeAuthJsonAtomic |
| `xaiAuthRouter.start` | `XaiAuthFlowService.start` | DI via createXaiAuthRouter({flowService, credsService}) | ✓ WIRED (factory) / ⚠️ NOT-INJECTED (boot) | xai-auth-router.ts:89 calls deps.flowService.start; livinityd/source/index.ts:854 does NOT pass xaiAuth (deferred) |
| `xaiAuthRouter.waitForCompletion` | `XaiAuthFlowService.waitForCompletion` | long-poll up to 10min over HTTP | ✓ WIRED (factory) / ⚠️ NOT-INJECTED (boot) | Same as above |
| `trpc/index.ts createAppRouter` | `auth: router({xai: xaiAuthRouter})` | merged under `auth.xai.*` namespace | ✓ WIRED | index.ts:188 |
| `common.ts httpOnlyPaths` | 4 `auth.xai.*` paths | split-link routes to HTTP not WS | ✓ WIRED | common.ts:566-569 |
| `ConnectAiStep onClick` | `trpc.auth.xai.start.mutate()` | trpcReact React hook | ✓ WIRED | connect-ai-step.tsx:106 `trpcReact.auth.xai.start.useMutation()`; line 130 `mutateAsync()` |
| `ConnectAiStep` state machine | `trpc.auth.xai.waitForCompletion.mutate({flowId})` | HTTP long-poll | ✓ WIRED | connect-ai-step.tsx:107 useMutation; line 146 mutateAsync({flowId}) |
| `ConnectAiStep window.open` | validated URL via isXaiOAuthUrl | URL.hostname === 'x.ai' \|\| 'auth.x.ai' BEFORE every window.open | ✓ WIRED | connect-ai-step.tsx:134-143 (validate, fail to error, then open); line 173-177 (reopen path also validates) |
| `xai-client every method` | `credsService.getToken()` | called at request time per call | ✓ WIRED | xai-client.ts:97 + line 143 — every request reads token fresh, no client caching |
| `xai-client 401 handler` | refresh + retry once | force `getToken()` re-read → second 401 throws XaiUnauthorizedError(attempts=2) | ✓ WIRED | xai-client.ts:131-167 — exactly 2 fetch calls, no recursion (test asserts mock call count === 2) |
| `livinityd start()` | `createAppRouter({chromeMaster, xaiAuth: createXaiAuthRouter({flowService, credsService})})` | factory DI mirror of chromeMaster pattern | ✗ NOT WIRED | livinityd/source/index.ts:854 still calls `createAppRouter({chromeMaster})` only — xaiAuth not passed, empty-injection Proxy default mounts. Explicitly flagged as deferred in 195-03 SUMMARY + STATE.md "Next" section. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ConnectAiStep` state | `state` (useReducer) | trpcReact.auth.xai.start + waitForCompletion + status hooks | YES (when production-DI wired) | ⚠️ HOLLOW UNTIL BOOT-WIRE — every hook call lands on Proxy stub today |
| `XaiCredentialsService.getStatus` | claims (decoded JWT) | fs.readFile(authJsonPath) → decodeXaiJwt(xai.access) | YES (real OpenCode CLI writes auth.json after device-code completes) | ✓ FLOWING (no opencode binary on Windows dev box, but the unit test path is hermetic with injectable authJsonPath) |
| `xai-client.chatCompletions` | response body | fetch(api.x.ai/v1/chat/completions) | YES (verified live with operator's own SuperGrok 2026-05-22 — HTTP 200, 8 models accessible) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All Phase 195 backend tests pass | `cd livos/packages/livinityd && npx vitest run source/modules/xai-auth/ source/modules/xai-credentials/ source/modules/server/trpc/xai-auth-router.test.ts source/modules/xai-provider/` | 7 files / 51 tests PASS in 601ms | ✓ PASS |
| Phase 195 UI test passes | `cd livos/packages/ui && npx vitest run src/features/onboarding-flow/steps/connect-ai-step.test.tsx` | 1 file / 7 tests PASS in 1.72s | ✓ PASS |
| Sacred SHA preserved | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ PASS |
| No code outside Phase 195's files_modified touched | `git diff HEAD~16 HEAD --name-only` (excl .planning) | All 25 files within plans' files_modified | ✓ PASS |
| `liv/packages/core/` untouched | `git diff HEAD~16 HEAD --stat -- liv/packages/core/` | empty | ✓ PASS |
| Deleted-module reintroduction in xai-* modules | `grep "cc-pty\|claude-runner\|livinity-broker\|vault-items\|computer-use\|autonomous-scheduler"` under xai-auth/, xai-credentials/, xai-provider/ | 0 files found | ✓ PASS |
| OpenCode CLI installed on local Windows dev box | spawnOpencodeLogin binary discovery | Skipped — not Mini PC; verifier env may differ | ? SKIP (operator verifies on Mini PC) |
| Live xAI OAuth round-trip | end-to-end through ConnectAiStep | Skipped — requires running livinityd + production DI wire-up + browser tab + xAI servers | ? SKIP (operator UAT) |

**Test totals:** 51 backend + 7 UI = **58 vitest assertions PASS** across Phase 195. Plans claimed: 15 + 24 + 5 + 7 + 7 = 58. Numbers match exactly.

### Requirements Coverage

REQUIREMENTS.md does NOT exist in `.planning/` (only versioned `REQUIREMENTS-v1.1.md` through `REQUIREMENTS-v4.0.md` archive files). The current GSD process uses PLAN frontmatter `requirements:` field as the de-facto registry for Phase 195. All 5 are accounted for by the artifacts above.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PHASE-195-PLAN-01-XaiAuthFlowService | 195-01 | Backend OpenCode CLI wrapper with start/waitForCompletion/abort | ✓ SATISFIED | flow-service.ts:355 LOC + 15 vitest PASS |
| PHASE-195-PLAN-02-XaiCredentialsService | 195-02 | Single source of truth for xAI tokens, single-flight refresh, atomic auth.json writes | ✓ SATISFIED | credentials-service.ts:335 LOC + 24 vitest PASS |
| PHASE-195-PLAN-03-XaiAuthRouter | 195-03 | tRPC auth.xai.* namespace, 4 adminProcedure procedures, httpOnlyPaths | ✓ SATISFIED | xai-auth-router.ts:159 LOC + 5 vitest PASS + index.ts/common.ts MOD verified |
| PHASE-195-PLAN-04-OnboardingUIReplacement | 195-04 | Replace Phase 136 placeholder with real OAuth state machine | ✓ SATISFIED | connect-ai-step.tsx:370 LOC + 7 vitest PASS, 0 "Claude" occurrences |
| PHASE-195-PLAN-05-XaiProviderScaffold | 195-05 | OpenAI-compatible xAI client for Phase 196+/197+ consumption | ✓ SATISFIED | xai-client.ts:228 LOC + 7 vitest PASS, 6 typed errors |

**No orphaned requirements detected.** No REQUIREMENTS.md cross-reference applicable (file does not exist in this milestone).

### Anti-Patterns Found

Scanned all 25 modified files under Phase 195:

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `livinityd/source/index.ts` | 854 | `createAppRouter({chromeMaster: chromeMasterRouterInjected})` does not pass `xaiAuth` — production DI gap | 🛑 Blocker (for end-to-end goal) | Without injection, runtime call to `trpc.auth.xai.start` throws "flowService not injected". Explicitly deferred per 195-03 SUMMARY + STATE.md. NOT a Phase 195 scope violation — but a goal-achievement gap that downstream phase must close. |

No TODOs, no placeholder strings ("coming soon" / "not yet implemented" / "PLACEHOLDER"), no `return null` hollow components, no console.log-only handlers found in Phase 195 source files. The single anti-pattern is the documented DI deferral.

### Human Verification Required

See frontmatter `human_verification:` block for full details. Summary:

1. **Production DI wire-up at livinityd boot** — code change required in `livinityd/source/index.ts:854-857` to inject `xaiAuth: createXaiAuthRouter({flowService, credsService})`. Decision: split into Phase 195.1 or fold into Phase 196 LangGraph phase.
2. **Mini PC OpenCode CLI install** — add to `/opt/livos/update.sh` or run manually. Required before any live xAI sign-in attempt on Mini PC.
3. **End-to-end UAT walk** — operator clicks through the new ConnectAiStep, verifies tab opens to xAI, completes auth, returns to "✓ Connected — SuperGrok Tier 1" UI with capability chips.
4. **6-hour token-refresh round-trip live test** — verifies XaiCredentialsService background refresh against real auth.x.ai/oauth2/token endpoint.
5. **Voice endpoint live behavior** — confirms 403/404 still holds and UI correctly omits Voice chips.

### Gaps Summary

Phase 195 is **code-complete for its declared scope** — all 5 plans landed exactly as planned, 58 vitest assertions PASS, sacred SHA preserved across all 16 commits (af226ee7 .. eba58de4), no scope creep, no deleted-module reintroduction, no anti-patterns inside Phase 195 files.

**However**, the phase goal as stated ("the user signs in with xAI in setup wizard") requires three additional steps that all 5 plans explicitly punt:

1. **Production DI wire-up at livinityd boot** (one-line scope; cited in 195-03 SUMMARY's "Next Phase Readiness" + STATE.md "Next" section)
2. **OpenCode CLI install on Mini PC** (CONTEXT.md `<deferred>`)
3. **Live UAT walk** (visual + interactive — cannot be automated)

These are NOT failures of Phase 195's contract. They are explicit deferrals documented BEFORE execution started. Treating them as gaps would penalize a phase that delivered exactly what it planned. Routing them through `human_needed` lets the operator decide whether to ship a Phase 195.1 hot-fix or roll the wire-up into Phase 196 LangGraph work.

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across ALL 16 Phase 195 commits — pre-commit hook gate continues to be the firewall against accidental edits to `sdk-agent-runner.ts`.

---

_Verified: 2026-05-22T02:18:00Z_
_Verifier: Claude (gsd-verifier)_
