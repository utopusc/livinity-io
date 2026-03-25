---
phase: 03-auth-config
verified: 2026-03-24T00:00:00Z
status: passed
score: 10/10 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "POST /api/claude/set-api-key with a live Anthropic API key"
    expected: "Returns 200 { success: true } and the key is readable from Redis as nexus:config:anthropic_api_key"
    why_human: "Requires a real Anthropic API key and a running Redis instance to test the network validation call against api.anthropic.com/v1/models"
  - test: "POST /api/claude/start-login followed by POST /api/claude/submit-code"
    expected: "OAuth PKCE URL returned from start-login; submitting the code grants CLI authentication"
    why_human: "Requires an interactive browser session and Anthropic OAuth to complete the device flow"
  - test: "PUT /api/provider/primary { provider: 'claude' } then GET /api/providers"
    expected: "Primary provider switches to claude; fallbackOrder in response is ['claude', 'kimi']"
    why_human: "Requires a running Nexus server with Redis to verify runtime ProviderManager state is updated in the same process"
---

# Phase 3: Auth & Config Verification Report

**Phase Goal:** Users can authenticate Claude with their API key (or OAuth), the key is securely stored, the config schema supports provider selection, and fallback between providers works
**Verified:** 2026-03-24
**Status:** PASSED
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /api/claude/set-api-key accepts an API key, validates it against Anthropic API, and stores it in Redis | VERIFIED | Lines 393-422 of api.ts: format check (`sk-ant-` prefix), fetch to api.anthropic.com/v1/models, then `redis.set('nexus:config:anthropic_api_key', apiKey)` |
| 2 | GET /api/claude/status returns Claude authentication state (api-key or sdk-subscription) | VERIFIED | Lines 425-452 of api.ts: reads `nexus:config:claude_auth_method`, branches on method, returns `{ authenticated, method, provider }` |
| 3 | POST /api/claude/start-login initiates OAuth PKCE flow and returns authorize URL | VERIFIED | Lines 455-470 of api.ts: calls `provider.startLogin()`, sets auth method to `sdk-subscription`, returns result |
| 4 | POST /api/claude/submit-code exchanges OAuth authorization code for tokens | VERIFIED | Lines 473-492 of api.ts: validates code presence, calls `provider.submitLoginCode(code)`, returns result |
| 5 | POST /api/claude/logout clears Claude credentials and auth state | VERIFIED | Lines 495-512 of api.ts: calls `provider.logout()`, deletes both `nexus:config:anthropic_api_key` and `nexus:config:claude_auth_method` from Redis |
| 6 | Config schema includes provider section with primary_provider field defaulting to kimi | VERIFIED | schema.ts lines 283-286: `ProviderSelectionSchema` with `primaryProvider: z.enum(['claude','kimi']).default('kimi')`; wired into `NexusConfigSchema` line 304 and `DEFAULT_NEXUS_CONFIG` lines 393-395 |
| 7 | ProviderManager reads primary_provider from Redis config on initialization and sets fallback order accordingly | VERIFIED | manager.ts lines 40-69: `async init()` reads `nexus:config:primary_provider`, then falls back to `nexus:config` JSON blob, sets fallback order |
| 8 | When primary provider fails with a fallbackable error, ProviderManager automatically falls back to secondary | VERIFIED | manager.ts lines 97-103, 151-157, 187-191: `isFallbackableError()` at line 200 covers 429/503/502/529/timeout/ECONNRESET — all three call paths (chat, chatStream, think) loop to next provider |
| 9 | GET /api/providers returns list of providers with availability status | VERIFIED | api.ts lines 517-532: calls `pm.listProviders()`, `pm.getFallbackOrder()`, reads `nexus:config:primary_provider`; returns `{ providers, primaryProvider, fallbackOrder }` |
| 10 | PUT /api/provider/primary allows switching the primary provider and immediately updates fallback order | VERIFIED | api.ts lines 535-569: validates provider, sets `nexus:config:primary_provider` in Redis, updates `nexus:config` JSON blob, calls `pm.setFallbackOrder([provider, secondary])` in-process |

**Score:** 10/10 truths verified

---

### Required Artifacts

| Artifact | Expected | Level 1: Exists | Level 2: Substantive | Level 3: Wired | Status |
|----------|----------|-----------------|----------------------|----------------|--------|
| `nexus/packages/core/src/api.ts` | Claude auth API routes | YES | YES — 5 routes at lines 393-512, all with real logic | YES — ClaudeProvider import at line 36, used via `brain.getProviderManager().getProvider('claude')` | VERIFIED |
| `nexus/packages/core/src/config/schema.ts` | ProviderSelectionSchema with primaryProvider | YES | YES — lines 283-288, full Zod schema with enum and default | YES — included in NexusConfigSchema (line 304) and DEFAULT_NEXUS_CONFIG (lines 393-395); manager.ts imports NexusConfigSchema at line 7 | VERIFIED |
| `nexus/packages/core/src/providers/manager.ts` | Config-driven fallback order initialization | YES | YES — `async init()` at lines 40-69 with dual-key Redis strategy | YES — Brain.ts line 50 calls `this.manager.init()` fire-and-forget in constructor | VERIFIED |
| `nexus/packages/core/src/api.ts` | Provider listing and switching routes | YES | YES — GET /api/providers (lines 517-532), PUT /api/provider/primary (lines 535-569) | YES — `brain.getProviderManager().setFallbackOrder()` / `getFallbackOrder()` called directly | VERIFIED |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| api.ts | providers/claude.ts | `import type { ClaudeProvider }` + `getProvider('claude') as ClaudeProvider` | WIRED | Line 36 import; used at lines 427, 457, 481, 497 |
| api.ts | Redis nexus:config:anthropic_api_key | `redis.set(...)` / `redis.get(...)` / `redis.del(...)` | WIRED | Lines 415, 436, 505 |
| api.ts | Redis nexus:config:claude_auth_method | `redis.set(...)` / `redis.get(...)` / `redis.del(...)` | WIRED | Lines 416, 433, 465, 506 |
| config/schema.ts | config/manager.ts | `NexusConfigSchema` import and `safeParse` | WIRED | manager.ts line 7 imports schema; lines 34, 83, 212 use `NexusConfigSchema.safeParse` |
| providers/manager.ts | Redis nexus:config:primary_provider | `this.redis.get('nexus:config:primary_provider')` in `init()` | WIRED | manager.ts line 46 |
| providers/manager.ts | Redis nexus:config (blob) | `this.redis.get('nexus:config')` + JSON parse in `init()` | WIRED | manager.ts lines 50-56 |
| api.ts | providers/manager.ts | `brain.getProviderManager().setFallbackOrder()` / `.getFallbackOrder()` | WIRED | api.ts lines 521, 562, 564, 565 |
| brain.ts | providers/manager.ts | `this.manager.init()` fire-and-forget | WIRED | brain.ts lines 50-52 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUTH-01 | 03-01-PLAN.md | User can enter Claude API key in Settings | SATISFIED | POST /api/claude/set-api-key (api.ts:393) + GET /api/claude/status (api.ts:425) — backend ready for Settings UI |
| AUTH-02 | 03-01-PLAN.md | Claude API key stored in Redis, not plaintext | SATISFIED | `redis.set('nexus:config:anthropic_api_key', apiKey)` at api.ts:415; key deleted (not persisted to files) on logout |
| AUTH-03 | 03-01-PLAN.md | Optional OAuth PKCE flow for Claude | SATISFIED | POST /api/claude/start-login (api.ts:455) + POST /api/claude/submit-code (api.ts:473); delegates to ClaudeProvider.startLogin() / submitLoginCode() |
| PROV-04 | 03-01-PLAN.md, 03-02-PLAN.md | Config schema has provider selection (claude or kimi) | SATISFIED | `ProviderSelectionSchema` in schema.ts:283, `primaryProvider` defaults to `'kimi'`; wired into NexusConfigSchema and ConfigManager |
| PROV-03 | 03-02-PLAN.md | ProviderManager fallback loop works with Claude + Kimi | SATISFIED | `isFallbackableError()` at manager.ts:200 + fallback loops in `chat()`, `chatStream()`, `think()`; `init()` loads order from Redis on startup |

**Orphaned requirements check:** REQUIREMENTS.md Traceability table maps AUTH-01, AUTH-02, AUTH-03, PROV-03, PROV-04 to Phase 3 — all five are accounted for in the plans. No orphans.

---

### Anti-Patterns Found

No anti-patterns detected in the modified files.

- No TODO/FIXME/placeholder comments in the Claude auth section (lines 390-569 of api.ts)
- No stub returns (empty arrays, hardcoded static responses)
- All API routes make real Redis reads/writes and delegate to ClaudeProvider methods
- Fallback loop iterates over actual providers, not mocked data
- Build passes with zero TypeScript errors (`tsc` exits cleanly)

---

### Human Verification Required

#### 1. Live API Key Validation

**Test:** Call `POST /api/claude/set-api-key` with `{ "apiKey": "sk-ant-api03-..." }` using a real Anthropic API key
**Expected:** Returns `{ success: true }` (200); Redis key `nexus:config:anthropic_api_key` is set; calling `GET /api/claude/status` returns `{ authenticated: true, method: "api-key", provider: "claude" }`
**Why human:** Requires a live Anthropic API key and running Redis + Nexus server to test the network validation call

#### 2. OAuth PKCE Flow Completion

**Test:** Call `POST /api/claude/start-login`, open the returned URL in a browser, authenticate, copy the code, then call `POST /api/claude/submit-code` with `{ "code": "..." }`
**Expected:** `start-login` returns a URL; `submit-code` returns `{ success: true }`; `GET /api/claude/status` returns `{ authenticated: true, method: "sdk-subscription" }`
**Why human:** Requires an interactive browser session and Anthropic OAuth device flow — cannot be verified programmatically

#### 3. Runtime Provider Switching

**Test:** `PUT /api/provider/primary { "provider": "claude" }` then `GET /api/providers`
**Expected:** Response shows `primaryProvider: "claude"`, `fallbackOrder: ["claude", "kimi"]`; AI requests thereafter route to Claude first
**Why human:** Verifying the in-process ProviderManager state update (that `setFallbackOrder` actually changes routing behavior for subsequent requests) requires a running server

---

### Gaps Summary

No gaps. All 10 observable truths are verified. All artifacts pass all three levels (exists, substantive, wired). All five requirement IDs are satisfied with direct code evidence. The TypeScript build passes with zero errors. Four atomic git commits are confirmed in history (593f51a, 960564d, 6eb1797, a457b41).

The three human verification items are standard integration/live-service tests that cannot be verified statically — they do not block the phase goal from being architecturally complete.

---

_Verified: 2026-03-24_
_Verifier: Claude (gsd-verifier)_
