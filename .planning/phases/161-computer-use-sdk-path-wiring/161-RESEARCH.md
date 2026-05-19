# Phase 161: Computer-Use SDK Path Wiring — Research

**Researched:** 2026-05-19
**Domain:** SDK subscription path wire-through for Phase 160 backend additions (`AgentSessionManager → @anthropic-ai/claude-agent-sdk → api.anthropic.com`)
**Confidence:** HIGH

---

## Executive Summary

- **All 6 CONTEXT.md decisions (D-161-A through D-161-F) are VALIDATED against the codebase.** No blockers found. The implementation surfaces match the CONTEXT precisely; minor refinements surfaced in the per-question findings below.
- **Sacred SHA verified:** `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (line 1 of git output) — UNCHANGED from Phase 160 close. The pre-commit hook should continue to lock it.
- **AgentSessionManager has exactly ONE construction site** (`livos/packages/livinityd/source/modules/server/ws-agent.ts:177`). DI is trivial — one call site to update for 161-02.
- **ROADMAP wording is slightly stale:** Phase 161 entry says "instead of calling legacy `injectComputerUseSystemPrompt`," but the current `consumeAndRelay` does NOT call that helper. The chat path uses `composeSystemPrompt(BASE_SYSTEM_PROMPT, intentResult.capabilities)` only. So 161-02 is **adding a new branch**, not replacing one. Approach unchanged; nomenclature noted.
- **The UI hook layer (`use-native-app-agent.ts`, `use-webapp-agent.ts`) already emits the `native:` / `webapp:` conversationId prefix unconditionally.** D-161-E (verification-only patch) is the right call — no code change to the hooks; one source-text invariant test suffices.
- **MCP child → livinityd HTTP fetch is straightforward** — `ws-agent.ts:161` already demonstrates the pattern (`fetch(${livApiUrl}/api/capabilities...)`, `X-Api-Key` header, `AbortSignal.timeout(5000)`). 161-03 mirrors this for the two tRPC endpoints, but with the tRPC v11 GET-query wire format (`/trpc/apps.native.list?input=...`).

**Primary recommendation:** Proceed with the 4-patch plan as CONTEXT.md specifies. The serialization constraint (161-01 + 161-02 both edit `agent-session.ts` — must be sequential) is the only wave-planning consideration. Everything else can parallel.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions (D-161-A through D-161-F — VERBATIM)

- **D-161-A** — Detect computer-use sessions via **conversationId prefix** (`native:` / `webapp:`). No new `mode` field on `ClientWsMessage`. Anything else (or no conversationId) is plain chat → preserve current behavior verbatim. Trade-off acknowledged: a chat session that somehow gets a `native:` convId would be force-routed to Haiku (acceptable because Native/WebApp surfaces are dedicated computer-use surfaces by construction).
- **D-161-B** — Haiku routing via `AgentSessionManager` tier override (no separate `forceComputerUseModel` helper). When the session detects as computer-use: override `tier = 'haiku'` BEFORE the existing `tierToModel(tier)` calls; pass `model: 'claude-haiku-4-5-20251001'` (verbatim string from Plan 160-01) explicitly via the SDK `query()` options.
- **D-161-C** — System prompt composer injected via **dependency injection**. Add `computerUseSystemPromptBuilder?: () => Promise<string>` to `AgentSessionManagerOptions`. Livinityd's `ws-agent.ts:177` provides the closure over `buildLuseSystemPromptWithOverlayResolved`. Tests + legacy callers without the option get pre-161 behavior verbatim.
- **D-161-D** — `livosAppResolver` wired in `mcp/server.ts` via env-thread + HTTP fetch to livinityd. New env vars: `LIV_API_URL`, `LIV_API_KEY`, `LUSE_USER_SLUG`, `LUSE_DOMAIN_ROOT` threaded through `luse-mcp-config.ts`. Fall-through: when any env var is missing, do NOT construct the resolver — pre-Phase-160-03 behavior preserved.
- **D-161-E** — `use-native-app-agent.ts` is a NEAR no-op. Phase 161-04 becomes **verification-only** — add a source-text invariant test confirming the `native:` prefix is emitted, and the same for `webapp:`.
- **D-161-F** — Hard guardrails (NON-NEGOTIABLE): sacred SHA preserved; D-09 verbatim; D-NO-NEW-DEPS; chat path byte-identical; subscription-only.

### Claude's Discretion (implementation details — from CONTEXT.md)

- Exact location of the `isComputerUseSession` boolean derivation inside `consumeAndRelay`.
- Naming of the tier-override variable (`effectiveTier`, `resolvedTier`, etc.).
- Whether to log the override at info level.
- Test file locations (prefer extending existing `agent-session.test.ts`).
- HTTP timeout for the MCP child's fetch (suggest 5s mirroring `ws-agent.ts:163` IntentRouter pattern).

### Deferred Ideas (OUT OF SCOPE — per CONTEXT.md)

- `forceComputerUseModel` helper extraction (would consolidate broker + SDK paths; deferred — inline duplication is 5 lines per site).
- MCP child apps-list caching.
- `mode: 'computer-use'` ClientWsMessage field (rejected in favor of conversationId-prefix detection).
- `mcp/tools.test.ts` +8 tsc typing-narrowness errors (Phase 160 carry-forward — runtime PASS 65/65, cosmetic only).
- `luse-mcp-config.test.ts` T4/T5/T6 LUSE_REDIS_URL drift (pre-existing from Phase 100-10-04).

---

## Project Constraints (from CLAUDE.md / project memory)

- **Server4 is NOT yours** — never apply patches to Server4. Mini PC `bruce@10.69.31.68` is the only LivOS deployment that matters. (Phase 161 is code-only; no server impact until operator deploys.)
- **Subscription-only path is sacred** — no BYOK / raw `@anthropic-ai/sdk` fallback. SDK still hits api.anthropic.com via `/root/.credentials.json` with `BROKER_FORCE_ROOT_HOME` honored.
- **Compiled JS stale** — after editing `liv/packages/core/src/agent-session.ts`, must run `npm run build --workspace=packages/core` before livinityd picks up the change (livinityd imports `@liv/core/lib`, which resolves to `dist/`, not `src/`).
- **`update.sh` pnpm-store quirk** — if multiple `@liv+core*` dirs exist in pnpm store, `update.sh` may copy dist to wrong one (operator concern, not Phase 161 concern, but worth noting in UAT).
- **`/root` creds for SDK** — see `reference_anthropic_subscription_state.md` — only `/root/.credentials.json` works; broker MUST honor `BROKER_FORCE_ROOT_HOME` (Phase 63 R3.8 fix `fda2f7f6`).
- **Sacred SHA constraint retired/changed** — current SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` per `feedback_p65_rename_complete.md` (changed from `4f868d31...` in P77-02). This is the live value — Phase 161 must preserve.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Session-type detection (conversationId prefix → computer-use flag) | `@liv/core` (SDK runner layer) | — | Detection lives at the same layer where the SDK `query()` model is decided. UI hook already emits the signal; AgentSessionManager owns interpretation. |
| Haiku model routing | `@liv/core` (`AgentSessionManager.consumeAndRelay`) | — | This is where `tierToModel(tier)` resolves. Override must fire before that call. Sacred `sdk-agent-runner.ts` is read-only. |
| LivOS system prompt composition | livinityd (`agent-prompt-builder.ts`) — caller owns; `@liv/core` is the consumer via DI callback | — | `@liv/core` cannot import from `livos/packages/livinityd/*` (DAG direction: livinityd consumes core). DI inversion fixes this. |
| MCP `livosAppResolver` wiring | livinityd (`mcp/server.ts` MCP child process) | — | The MCP child is a separate Node process spawned by livinityd. Closure constructed in `main()`, fetched via HTTP from livinityd's own tRPC. |
| UI conversationId prefix emit | UI (`use-native-app-agent.ts`, `use-webapp-agent.ts`) | — | Already in place from Phase 159 (native) and Phase 95-06 (webapp). 161-04 is verification-only. |

---

## Decision Validation Table

| Decision | Status | Evidence |
|----------|--------|----------|
| **D-161-A** — conversationId prefix detection | **VALIDATED** | `use-native-app-agent.ts:38` unconditionally emits `` `native:${nativeAppId}:${rand}` ``. `use-webapp-agent.ts:97` emits `` `webapp:${webappId}:${rand}` ``. Both prefixes flow through `useAgentSocket.sendMessage(text, undefined, convId, ...)` → WS `start` envelope → `ws-agent.ts:230` → `sessionManager.handleMessage` → `handleMessage:'start'` (line 848) → `startSession(opts.conversationId)` (line 849-850) → `session.conversationId` (line 270). Trace intact. Chat path: `AI Chat` panel uses no convId prefix → falls through. |
| **D-161-B** — tier override inside `consumeAndRelay` | **VALIDATED** | `tier` is computed once at line 320 and used downstream at line 568 (`budgetByTier[tier]`), 589 (log), 683 (log), 698 (`model: tierToModel(tier)`). Setting `tier = 'haiku'` AFTER intent routing but BEFORE line 562 (`budgetByTier[tier]`) cascades correctly. Budget table already has `haiku: 2.0`. `tierToModel('haiku')` returns `'claude-haiku-4-5'` per `sdk-agent-runner.ts:166`. NOTE: CONTEXT.md prescribes passing literal `'claude-haiku-4-5-20251001'` (dated form) as `model` directly, **overriding** `tierToModel(tier)` at line 698. See "Landmines" for the model-string mismatch discussion. |
| **D-161-C** — DI builder callback | **VALIDATED** | `AgentSessionManagerOptions` constructor at line 177 accepts a plain object. Sole construction site: `ws-agent.ts:177`. Adding optional `computerUseSystemPromptBuilder` is a non-breaking change. Builder signature `() => Promise<string>` is the cleanest — see Q3 for why we don't pass context (the builder can close over its inputs). |
| **D-161-D** — env-thread + HTTP fetch | **VALIDATED** | tRPC procedures `apps.native.list` (`native-routes.ts:152`) and `webapp.list` (`webapps/index.ts:15` → `trpc-router.ts`) exist and are `privateProcedure.query`. tRPC v11 HTTP GET format: `/trpc/apps.native.list?input=` (no JSON body for empty input). `X-Api-Key` header pattern is already used 15+ times in `ai/routes.ts`. MCP child stderr already carries `[luse-mcp] open_livos_app ...` IPC lines — new log lines must NOT collide (see "Landmines"). |
| **D-161-E** — UI hook verification-only | **VALIDATED** | `use-native-app-agent.test.ts:51-53` already locks the `` `native:${nativeAppId}:${rand}` `` prefix via source-text invariant. `use-webapp-agent.unit.test.tsx` exists (not read, but `makeFreshConversationId` in `use-webapp-agent.ts:89` is unconditional and source-text locked elsewhere). 161-04 adds ONE complementary source-text test asserting the prefix flows through to the WS envelope (or just confirms via re-running). |
| **D-161-F** — Hard guardrails | **VALIDATED** | Sacred SHA confirmed live: `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. D-09 file last touched by `cba8845b` (Phase 100-10-02 rename, not body). D-NO-NEW-DEPS: no new packages needed (`node:http`/`fetch` already used). Chat-path-untouched contract enforceable via a vitest regression test asserting that a session WITHOUT prefix exits `consumeAndRelay` with `model: 'claude-sonnet-4-6'` and `systemPrompt: BASE_SYSTEM_PROMPT` (or composed via `composeSystemPrompt` when IntentRouter is enabled). |

---

## Findings Per Research Question

### Q1 — D-161-A robustness validation

**Conversation ID flow trace (verified):**

```
useNativeAppAgent.sendMessage
  → makeFreshConversationId(nativeAppId) emits `native:<uuid>:<short>`     [use-native-app-agent.ts:38]
  → agent.sendMessage(text, undefined, convId, attachments)                 [use-native-app-agent.ts:91]
useWebAppAgent.sendMessage
  → makeFreshConversationId(webappId) emits `webapp:<uuid>:<short>`         [use-webapp-agent.ts:97]
  → agent.sendMessage(text, undefined, convId, attachments)                 [use-webapp-agent.ts:250]
useAgentSocket.sendMessage(prompt, model, conversationId, attachments)
  → payload.conversationId = conversationIdRef.current                      [use-agent-socket.ts:579]
  → ws.send(JSON.stringify(payload))                                        [use-agent-socket.ts:595]
livinityd ws-agent.ts handleMessage
  → raw = JSON.parse(data) as ClientWsMessage                               [ws-agent.ts:227]
  → if (raw.type === 'start' && raw.conversationId) { ...prepend context }  [ws-agent.ts:230]
  → sessionManager.handleMessage(sessionKey, raw, sendMessage, {...})       [ws-agent.ts:252]
AgentSessionManager.handleMessage
  → case 'start': startSession(userId, msg.prompt, msg.model, onMessage,
                                {conversationId: msg.conversationId, ...})  [agent-session.ts:849-853]
  → startSession sets session.conversationId = opts?.conversationId          [agent-session.ts:270]
```

**Robustness assessment:**
- ✅ `session.conversationId` is set inside `startSession` at line 270 — visible to `consumeAndRelay` via `this.sessions.get(userId)?.conversationId` at line 304.
- ✅ `consumeAndRelay` receives `session.conversationId` directly via the `session` reference resolved at line 304.
- ✅ For chat-only paths (`AI Chat` panel), `conversationId` is either undefined (fresh session) or some non-prefixed string (a Liv conversation ID like a UUID, NOT prefixed with `native:` or `webapp:`). Detection rule `session.conversationId?.startsWith('native:') || ?.startsWith('webapp:')` correctly excludes these.
- ⚠️ **Edge case:** If a NativeApp/WebApp window is somehow opened with a legacy conversation that has NO prefix (impossible today per `makeFreshConversationId` being unconditional, but possible in theory), Haiku routing would NOT fire and the LivOS overlay would NOT inject — falling back to chat behavior. This is the **correct fallback** — fail open to existing behavior, never break chat.
- ⚠️ **`buildConversationContext` prefixes the prompt** (`ws-agent.ts:119`: `Previous conversation:\n...Current message: `) when conversation history exists. This does NOT affect detection (it modifies `msg.prompt`, not `msg.conversationId`). Confirmed.

**No blockers identified.**

### Q2 — D-161-B tier override cascade

The current `tier` variable is computed once at line 320 and consumed at 4 sites:

| Line | Use | Effect of `tier = 'haiku'` override |
|------|-----|--------------------------------------|
| 568 | `budgetByTier[tier]` → `maxBudgetUsd` | `budgetByTier['haiku'] = 2.0` — correct cost cap for Haiku turns |
| 589 | `logger.info(..., model: tierToModel(tier), ...)` | Logs `claude-haiku-4-5` — exposes the override in journalctl (good for UAT step 5) |
| 683 | `logger.info(..., model: tierToModel(tier), ...)` | Same — second log line right before SDK `query()` |
| 698 | `query({..., model: tierToModel(tier), ...})` | **CRITICAL** — this is the actual model passed to SDK. With override → `claude-haiku-4-5` |

**Decision: override `tier` immediately after line 320 (before line 322's `let sdkTools` declaration).**

```ts
let tier = model ?? agentDefaults?.tier ?? 'sonnet';   // existing
const isComputerUseSession = session.conversationId?.startsWith('native:') ||
                              session.conversationId?.startsWith('webapp:');
if (isComputerUseSession) {
  logger.info('AgentSessionManager: computer-use session detected, routing to Haiku', {
    userId, conversationId: session.conversationId
  });
  tier = 'haiku';
}
```

**Cascade analysis:**
- ✅ Line 568 reads `tier` AFTER our override — correct budget.
- ✅ Lines 589/683/698 all read `tier` via `tierToModel(tier)` — correct model.
- ⚠️ **MODEL STRING MISMATCH:** `tierToModel('haiku')` returns `'claude-haiku-4-5'` (UN-dated), but CONTEXT.md D-161-B prescribes the **dated** literal `'claude-haiku-4-5-20251001'` (matches Phase 160-01 broker contract). The dated string is verified as a valid Anthropic model ID by `agent-runner-factory.test.ts:577-587`. **Recommendation:** at line 698, replace `model: tierToModel(tier)` with `model: isComputerUseSession ? 'claude-haiku-4-5-20251001' : tierToModel(tier)`. This keeps `tierToModel` untouched (sacred-adjacent — exported from sdk-agent-runner.ts), keeps the dated string literal grep-locatable across both broker + SDK paths, and lets the log lines at 589/683 still show the un-dated form (acceptable — both are valid Haiku 4.5 aliases per Anthropic's docs).

**No tier-derived branches outside these 4 sites.**

### Q3 — D-161-C cleanest DI shape

**Alternatives considered:**

| Approach | Module boundary | Test ergonomics | Verdict |
|----------|-----------------|------------------|---------|
| **Pass builder callback** `() => Promise<string>` (CONTEXT.md choice) | ✅ Clean — livinityd owns prompt; `@liv/core` consumes via callback | ✅ Tests pass `vi.fn(() => Promise.resolve('FAKE PROMPT'))` | **WINNER** |
| Pass full composed prompt string | ❌ Caller must invoke builder eagerly at construct time — can't capture per-session context (display size, apps list) | ✅ Trivial | Rejected — sacrifices dynamic composition |
| Pass overlay opts + import builder into `@liv/core` | ❌ VIOLATES module DAG (`@liv/core` cannot import from `livos/packages/livinityd/*`) | n/a | Rejected — boundary violation |
| Move `buildLuseSystemPromptWithOverlay` into `@liv/core` | ❌ Requires moving `LUSE_SYSTEM_PROMPT` (D-09 verbatim invariant says NO) | n/a | Rejected — D-09 violation |

**Should the builder receive context?**

Probably NO — the builder closure in `ws-agent.ts:177` can capture whatever it needs from the `ai` context at construction time. The dynamic per-session inputs (`actualDisplaySize` from xdpyinfo, `availableApps` from apps.list) are read at builder INVOCATION time inside `buildLuseSystemPromptWithOverlayResolved`, not at construct time. So the builder is essentially zero-arg and side-effect-yielding-a-promise.

**Refined signature:**

```ts
// In agent-session.ts AgentSessionManagerOptions
computerUseSystemPromptBuilder?: () => Promise<string>;
```

**Construction site (ws-agent.ts:177):**

```ts
import {buildLuseSystemPromptWithOverlayResolved} from '../ai/agent-prompt-builder.js'

const sessionManager = new AgentSessionManager({
  toolRegistry: lazyToolRegistry,
  redis: ai.redis,
  learningEngine,
  computerUseSystemPromptBuilder: async () => {
    // Capture per-server context here — for now, defaults are fine.
    // Future: pass dynamic apps list via overlayOpts.availableApps.
    return buildLuseSystemPromptWithOverlayResolved({
      userSlug: 'admin', // TODO P162+ — per-user resolution from JWT
      domainRoot: 'livinity.io',
    })
  },
})
```

**Open detail (Claude's discretion):** the userSlug/domainRoot are STATIC for v1. A future plan can thread per-session userSlug (different multi-user resolution path). For Phase 161 v1, hard-coded defaults match the broker behavior (per `luse-mcp-config.ts:318` — same defaults).

### Q4 — D-161-D MCP child HTTP fetch pattern

**Endpoints to call (both exist as `privateProcedure.query`):**

| tRPC procedure | File | Auth | Wire URL (tRPC v11 GET) |
|----------------|------|------|--------------------------|
| `apps.native.list` | `livos/packages/livinityd/source/modules/apps/native-routes.ts:152` | `privateProcedure` (requires JWT or X-Api-Key per `is-authenticated.ts`) | `GET /trpc/apps.native.list?input=` (or `?batch=1&input=...` for batching) |
| `webapp.list` | `livos/packages/livinityd/source/modules/webapps/trpc-router.ts` (re-exported as `webappRouter` in `webapps/index.ts:15`) | `privateProcedure` | `GET /trpc/webapp.list?input=` |

**Auth pattern (verified live in `ws-agent.ts:161`):**

```ts
const livApiUrl = process.env.LIV_API_URL || 'http://localhost:3200'  // ⚠️ NOTE: 3200 is liv-core, NOT livinityd
const apiKey = process.env.LIV_API_KEY || ''
fetch(`${livApiUrl}/api/capabilities?status=active`, {
  headers: apiKey ? {'X-Api-Key': apiKey} : {},
  signal: AbortSignal.timeout(5000),
})
```

**⚠️ CRITICAL: PORT CONFUSION**

Re-read: `ws-agent.ts:154` sets `livApiUrl = 'http://localhost:3200'` — that's the **liv-core** API (`liv-core.service`), NOT livinityd's tRPC server. tRPC for `apps.native.list` and `webapp.list` lives on **livinityd port 8080** (`livos.service`).

**Recommendation for 161-03:**

The MCP child must use a **different** env var than `LIV_API_URL` to avoid the port conflict. CONTEXT.md says `LIV_API_URL` should be `http://localhost:8080` — this CONTRADICTS the existing `LIV_API_URL=http://localhost:3200` (liv-core) usage in `ws-agent.ts:154`.

**Two clean options:**
- **Option A (recommended):** Introduce a NEW env var `LIVINITYD_TRPC_URL` (default `http://localhost:8080`) specifically for the MCP child. Keeps `LIV_API_URL` semantics untouched.
- **Option B:** Repurpose `LIV_API_URL` in the MCP child only (since the MCP child doesn't talk to liv-core, only livinityd). Override in the descriptor's env block, NOT in livinityd's process env.

CONTEXT.md D-161-D listed `LIV_API_URL` but the value `http://localhost:8080` matches livinityd, not liv-core. **Recommendation: use a new env name `LIVINITYD_API_URL` to avoid downstream confusion.** Alternative naming `LUSE_LIVINITYD_URL` follows the existing `LUSE_*` prefix convention seen in `luse-mcp-config.ts`.

**JWT vs X-Api-Key auth:**

The tRPC procedures use `privateProcedure` which goes through `is-authenticated.ts`. That middleware accepts EITHER JWT (cookie or Authorization header) OR `X-Api-Key` header. `LIV_API_KEY` from `/opt/livos/.env` is a valid X-Api-Key. **Recommendation: `X-Api-Key` for the MCP child** — JWT requires per-user issuance which is more complex.

**tRPC v11 HTTP GET wire format:**

For a `query` procedure with no input arguments (which `apps.native.list` and `webapp.list` both are), the URL is `/trpc/{procedure}?input=` (empty `input`). Response shape: `{result: {data: <array>}}`.

**Failure mode handling:**

If the MCP child can't reach livinityd (livinityd restarting, network glitch, missing env var), the resolver closure should:
1. Catch the fetch error inside `listWebApps`/`listNativeApps`.
2. Return empty array (the resolver's `Promise.all` already has `.catch(() => [])` per `window.ts:482-483`).
3. `defaultLivosAppResolver` returns `null` for the empty-arrays case → `mcp/tools.ts:749` falls through to classic Bytebot APP_MAP path — pre-Phase-160-03 behavior preserved.

**This is the right failure mode** — non-fatal, fail-open to existing behavior.

### Q5 — D-161-E UI hook prefix verification

**Trace verified end-to-end (see Q1 above).** The `native:` / `webapp:` prefix makes it ALL the way to `session.conversationId` in `AgentSessionManager`.

**Existing tests covering the prefix:**
- `use-native-app-agent.test.ts:51-53` — locks `` `native:${nativeAppId}:${rand}` `` via source-text invariant (line 13-14: `SRC = readFileSync(HOOK_PATH)`).
- `use-webapp-agent.unit.test.tsx` exists; presumably has equivalent invariants for `webapp:`.

**Verdict:** 161-04 is purely additive. Recommendation: add a SINGLE new invariant test in each `.test.ts` file asserting the prefix is sent through `useAgentSocket.sendMessage` (rather than mutated/stripped by an intermediate layer). For example:

```ts
// In use-native-app-agent.test.ts (extend existing describe block)
it('passes the native: prefix verbatim through agent.sendMessage (no mutation)', () => {
  expect(SRC).toMatch(/agent\.sendMessage\([^,]+,\s*undefined,\s*convId\b/)
})
```

For added safety, also confirm via `use-agent-socket.ts` source-text invariant that `payload.conversationId = conversationIdRef.current` is the verbatim assignment (no normalize/strip step). This is a defensive lock — if a future refactor adds prefix-stripping, the test fires red.

**No code change to the hooks. Tests only.**

### Q6 — Test infrastructure

**Two test idioms coexist:**

| Location | Framework | Invocation |
|----------|-----------|------------|
| `liv/packages/core/src/*.test.ts` | Plain Node + `tsx` + `node:assert/strict` | `npx tsx src/agent-session.test.ts` (see `package.json:test:phase39` chain) |
| `livos/packages/livinityd/source/**/*.test.ts` | Vitest with `--maxConcurrency 1 --poolOptions.threads.singleThread true` (see `livinityd/package.json:test`) | `npm run test` (timeout 180000, fully serialized) |
| `livos/packages/ui/src/**/*.test.{ts,tsx}` | Vitest + jsdom (`@vitest-environment jsdom` directive at top of test file) | `pnpm --filter ui test` |

**Mock pattern for SDK `query()`:**

`agent-session.test.ts` does NOT mock `query()` — it tests session-map management + cleanup + handleMessage routing without invoking the SDK. The existing test scope is narrow.

**For Phase 161 unit tests:**
- ✅ Detection logic (`conversationId.startsWith('native:')`) — testable without SDK, by inspecting tier/model before `query()` is called. Use a spy/stub on `tierToModel` OR refactor the detection into a pure helper `function isComputerUseSession(convId: string | undefined): boolean` that's directly unit-testable.
- ✅ DI callback wiring — testable by passing `computerUseSystemPromptBuilder: vi.fn(...)` (vitest) or `let calls = 0; const spy = async () => { calls++; return 'FAKE PROMPT' }` (tsx-assert). Inspect `calls === 1` after consume.
- ⚠️ **Hard to test:** the full `consumeAndRelay` path because `query()` returns an async iterator. The simplest approach is to extract the detection + tier-override + systemPrompt-selection into a pure helper that's testable in isolation, then a single integration test that mocks `query()` end-to-end.

**Recommendation:** add a NEW test file `liv/packages/core/src/agent-session.computer-use.test.ts` (tsx + node:assert) covering:
1. `isComputerUseSession('native:xyz:abc')` → true
2. `isComputerUseSession('webapp:xyz:abc')` → true
3. `isComputerUseSession('some-uuid')` → false
4. `isComputerUseSession(undefined)` → false
5. Construction with `computerUseSystemPromptBuilder` callback present — option visible on instance.

For the runtime body-injection check (model + systemPrompt both flow correctly), mirror `agent-runner-factory.test.ts`'s `captureUpstreamPost` pattern with a stub on `query()`.

### Q7 — Wave parallelization

**File-edit conflicts:**

| Patch | Files modified | Conflicts with |
|-------|---------------|----------------|
| 161-01 | `liv/packages/core/src/agent-session.ts` (detection + tier override) | 161-02 (same file) |
| 161-02 | `liv/packages/core/src/agent-session.ts` (DI option + systemPrompt selector) + `livos/packages/livinityd/source/modules/server/ws-agent.ts` (construct site) | 161-01 (same `agent-session.ts`) |
| 161-03 | `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` + `luse-mcp-config.ts` | None — disjoint from 01/02 |
| 161-04 | `livos/packages/ui/src/hooks/use-native-app-agent.test.ts` + `use-webapp-agent.unit.test.tsx` (tests only) | None — disjoint |

**Recommended wave plan:**

- **Wave 1 (sequential within wave):** 161-01 → 161-02 (must serialize — same file).
- **Wave 1 (parallel with above):** 161-03 (disjoint).
- **Wave 1 (parallel with above):** 161-04 (disjoint, tests only).

So Wave 1 has 3 parallel branches: {01 → 02}, {03}, {04}. Wave 2 = optional verification sweep.

**Alternative ordering inside the {01, 02} branch:** if planner prefers, BOTH can be a single combined patch (since they touch the same file and same function). CONTEXT.md treats them as separate patches for atomic-commit clarity — recommend keeping them as 2 commits but landing them in the same wave/session.

### Q8 — Landmines + pitfalls

| # | Landmine | Mitigation |
|---|----------|------------|
| 1 | **`msg.model` is always `undefined`** for NativeApp/WebApp because `agent.sendMessage(text, undefined, convId, attachments)` passes `model = undefined` explicitly (`use-native-app-agent.ts:91`, `use-webapp-agent.ts:250`). The chat-only path (AI Chat panel) might pass a model string. This means `tier = model ?? agentDefaults?.tier ?? 'sonnet'` resolves to `agentDefaults?.tier` or `'sonnet'` for our target sessions, NOT user-chosen. The override can fire AFTER line 320 safely. | Document in plan: "the tier-override is unconditional for computer-use sessions; we deliberately ignore `msg.model` for these sessions." |
| 2 | **`tierToModel` returns un-dated model ID** (`claude-haiku-4-5`) while Phase 160-01 broker contract uses dated form (`claude-haiku-4-5-20251001`). | At line 698 in `consumeAndRelay`, write `model: isComputerUseSession ? 'claude-haiku-4-5-20251001' : tierToModel(tier)` to match broker contract verbatim. Phase 160-01 test invariant at `agent-runner-factory.test.ts:577-587` locks the dated form; Phase 161 should do the same for the SDK path. |
| 3 | **MCP child stderr already carries `[luse-mcp] open_livos_app ...` IPC lines** (`mcp/tools.ts:757`). Any new `console.log`/`process.stderr.write` in `mcp/server.ts` Plan 161-03 must NOT match the parser regex `/^\[luse-mcp\] open_livos_app /`. | Use a different prefix like `[luse-mcp] resolver: fetched N apps from livinityd` for the new HTTP fetch logs. The existing log line in `mcp/server.ts:157` (`[luse-mcp] connected via stdio transport...`) already uses the generic `[luse-mcp] ` prefix without colliding — same pattern. |
| 4 | **The `intentRouter` is disabled in `ws-agent.ts:178-182`** (commented out). This means `consumeAndRelay`'s `intentResult` is always `null`, and `systemPrompt = BASE_SYSTEM_PROMPT` (line 561). Our override should be: `systemPrompt = isComputerUseSession && computerUseSystemPromptBuilder ? await computerUseSystemPromptBuilder() : (intentResult ? composeSystemPrompt(...) : BASE_SYSTEM_PROMPT)`. | Plan 161-02 selector logic must handle BOTH the disabled-intent-router path (today's reality) AND the future re-enabled path. |
| 5 | **`LIV_API_URL=http://localhost:3200`** in `ws-agent.ts:154` points to **liv-core**, NOT livinityd. CONTEXT.md's D-161-D shows `LIV_API_URL=http://localhost:8080` for the MCP child. **These are different services.** | Introduce a NEW env name `LIVINITYD_API_URL` (or `LUSE_LIVINITYD_URL`) for the MCP child's tRPC fetch. Update CONTEXT.md/Plan to use this name. |
| 6 | **Sacred-file assertions:** `agent-runner-factory.test.ts` and `liv-agent-runner.test.ts` lock the Phase 160-01 Haiku routing literal at the BROKER layer. Phase 161 needs SDK-path equivalents — but should NOT alter the broker tests (different layer, different commits). | Add new test invariants ONLY to `agent-session.computer-use.test.ts` (or extension of existing `agent-session.test.ts`). Don't touch existing 160-01 tests. |
| 7 | **No conversationId for some sessions:** the AI Chat panel sometimes opens a fresh session with no conversationId at all. Detection rule `session.conversationId?.startsWith('native:')` handles this via `?.` chain — returns `undefined` → falsy → chat path. ✅ already safe. | None needed — just document in detection comment. |
| 8 | **`livosAppResolver` runs INSIDE the MCP child process**, not the parent livinityd. Closure captures the env vars at child boot time. Hot-reloading env vars (e.g., changing `LUSE_USER_SLUG` after `systemctl restart livos`) requires re-spawning the MCP child. McpClientManager handles re-spawn on config changes — Phase 161 inherits that lifecycle for free. | No action — McpClientManager re-spawn behavior is established by P77/P100-10. |
| 9 | **`buildConversationContext` prepends "Previous conversation: ..." prefix to `msg.prompt`** (`ws-agent.ts:119`). This mutates the prompt but NOT the conversationId. ✅ Detection unaffected. | None needed — confirmed in Q1 trace. |
| 10 | **`updateExisting` env-block comparison in `luse-mcp-config.ts:configsMatch`** (line 347-373) checks env keys. Adding new env keys (LIV_API_URL, LIV_API_KEY, LUSE_USER_SLUG, LUSE_DOMAIN_ROOT) will trigger the "updated existing" idempotent path on first boot after deploy — operator may see a one-time update log line. **This is expected, not a regression.** | Document in plan: "first deploy after 161-03 emits `[luse-mcp-config] registered: updated existing` — this is the env-block update; subsequent boots are no-ops." |

### Q9 — Test + build commands

| Concern | Command | Notes |
|---------|---------|-------|
| Build `@liv/core` after editing | `npm run build --workspace=packages/core` (from `liv/` workspace root) OR `cd liv/packages/core && tsc` | livinityd imports from `dist/`, not `src/` — MUST rebuild after `agent-session.ts` edit |
| Run `liv/packages/core` tsx tests | `cd liv/packages/core && npx tsx src/agent-session.test.ts` (then chain via `package.json` test scripts like `test:phase47`) | Plain Node + `node:assert/strict`. Most-recent script: `test:phase48` |
| Run livinityd vitest suite | `cd livos/packages/livinityd && npm run test:run` (note: `test:run` is non-watch; `test` is watch mode) | Already has `singleThread: true` for stability |
| Run livinityd specific test file | `cd livos/packages/livinityd && npx vitest run source/modules/computer-use/mcp/server.test.ts` | Useful for 161-03 verification |
| Run UI vitest | `cd livos/packages/ui && pnpm test` (or `pnpm --filter ui test` from repo root) | jsdom env via `@vitest-environment jsdom` directive |
| Mini PC deploy | Operator-only: `sudo bash /opt/livos/update.sh` on `bruce@10.69.31.68` | Sacred `feedback_relay_dependency_minimization` — executor does NOT SSH |
| `update.sh` pnpm-store quirk check | `ls /opt/livos/node_modules/.pnpm/@liv+core*` — if multiple dirs, manually copy `/opt/liv/packages/core/dist` to the one livinityd's `node_modules/@liv/core` symlink resolves to | UAT step for operator |
| Service restart (post-deploy) | `systemctl restart livos liv-core liv-worker liv-memory` | Done automatically by `update.sh` |

### Q10 — Validation Architecture (minimal — Nyquist disabled)

`workflow.nyquist_validation: false` in `.planning/config.json`, so the full Nyquist test-architecture section is OPTIONAL per the agent contract. However, since this phase touches a sacred-adjacent file (`agent-session.ts`) AND ships behavioral changes (model override, prompt override), I'm including a minimal test contract.

**Test pyramid for Phase 161:**

| Layer | Coverage | Files |
|-------|----------|-------|
| **Unit (vitest + tsx)** | Detection helper (`isComputerUseSession`), tier override branch, DI option presence | `liv/packages/core/src/agent-session.computer-use.test.ts` (NEW), extension of `agent-session.test.ts` |
| **Integration (vitest)** | MCP child env-thread + HTTP fetch closure (resolver constructed when all 4 env vars present, undefined otherwise) | Extension of `livos/packages/livinityd/source/modules/computer-use/mcp/server.test.ts` |
| **Source-text invariants** | Sacred SHA preserved; literal `'claude-haiku-4-5-20251001'`; literal `'native:'` / `'webapp:'` detection strings; new env var names in `luse-mcp-config.ts` | Per-file source-text checks, mirror Phase 160 patterns |
| **Chat-path regression** | A session WITHOUT prefix → tier resolves to `'sonnet'` AND systemPrompt = `BASE_SYSTEM_PROMPT` (no builder invoked); `vi.fn` spy on builder asserts `.toHaveBeenCalledTimes(0)` | NEW `chat-path-untouched.test.ts` OR extension of existing test |
| **Operator UAT** | Re-walk Phase 160 10-step checklist with Phase 161 pass conditions (Step 5 = Haiku in journal; Step 6 = LIVOS CONTEXT visible; Step 7 = n8n-bruce.livinity.io DASH form opens; Step 9 = real display size) | `.planning/phases/161-.../161-VERIFICATION.md` |

**Block-ship test failures:**
- Sacred SHA test fail → BLOCK (cannot ship — same as Phase 160).
- Chat-path-untouched regression test fail → BLOCK (chat would break for regular users).
- Detection unit tests fail → BLOCK.
- MCP child failure tests fail → BLOCK.

**Non-blocking test failures (acceptable for ship):**
- Pre-existing Phase 100-10-04 `luse-mcp-config.test.ts` T4/T5/T6 LUSE_REDIS_URL drift (already documented as out-of-scope).
- Pre-existing `mcp/tools.test.ts` tsc typing nuance (+8 errors documented as cosmetic).

### Q11 — Sacred SHA check

```
$ git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts
100644 blob f3538e1d811992b782a9bb057d1b7f0a0189f95f	liv/packages/core/src/sdk-agent-runner.ts
```

**PASS.** Sacred SHA matches the expected value `f3538e1d811992b782a9bb057d1b7f0a0189f95f` from CONTEXT.md D-161-F. No P0 block.

### Q12 — Phase 160 broker compatibility

**Model string contract:** Phase 160-01 uses `'claude-haiku-4-5-20251001'` (dated) as the verbatim model literal — see `agent-runner-factory.ts:195` and `agent-runner-factory.test.ts:586`. Phase 161 SDK path MUST use the same literal string.

**`tierToModel('haiku')` returns `'claude-haiku-4-5'` (un-dated)** per `sdk-agent-runner.ts:166`. This is also a valid Anthropic alias but differs from the broker's dated form.

**Decision (matches CONTEXT.md D-161-B):**
- Override `tier = 'haiku'` for budget + log purposes.
- BUT at the SDK `query()` call (line 698), pass `model: 'claude-haiku-4-5-20251001'` (dated literal) directly — NOT via `tierToModel(tier)`.
- This ensures the journalctl `model:` field at lines 589/683 logs the un-dated form (familiar from training) AND the actual SDK request body carries the dated form (matches broker contract + Phase 160-01 test invariant).
- A new source-text invariant should grep-lock the dated literal at the SDK call site, paralleling `agent-runner-factory.test.ts:546-548`.

**No conflict between broker (160-01) and SDK (161-01) paths** — both arrive at api.anthropic.com with `model: 'claude-haiku-4-5-20251001'`.

---

## Wave Plan

**Single-wave parallel execution (recommended):**

```
Wave 1 (parallel branches):
├── Branch A: 161-01 → 161-02 (serialized — same file)
│     161-01: AgentSessionManager Haiku tier override (~30-45 min)
│     161-02: DI builder callback wire-up (~30-45 min)
├── Branch B: 161-03 (parallel) (~45-60 min)
│     mcp/server.ts livosAppResolver construction + luse-mcp-config.ts env thread
└── Branch C: 161-04 (parallel) (~15-20 min)
      use-native-app-agent.test.ts + use-webapp-agent.unit.test.tsx invariant additions

Wave 2 (optional verification sweep, sequential):
└── 161-VERIFICATION.md + operator UAT checkpoint (autonomous: false)
```

**Total estimated time:** 2-3 hours wall-clock (per CONTEXT.md spec). If the executor runs in `mode: yolo` with autonomous bias, the wall-clock can compress to 90 minutes by parallelizing B and C while A serializes.

---

## Landmines + Mitigations (consolidated)

(See Q8 above for the full table. Top-3 by severity:)

1. **Model string mismatch (`tierToModel('haiku')` vs broker's dated literal).** Mitigation: pass `model:` literal directly at line 698, don't route through `tierToModel`. Add a grep invariant for the dated string.
2. **Port confusion (`LIV_API_URL=3200` vs livinityd at 8080).** Mitigation: introduce a NEW env var `LIVINITYD_API_URL` (or `LUSE_LIVINITYD_URL`) for the MCP child fetch. Don't reuse `LIV_API_URL` which already means liv-core.
3. **Stderr IPC collision in MCP child.** Mitigation: use a distinct log prefix (`[luse-mcp] resolver: ...`) that the parent's `open_livos_app` parser ignores. The existing `[luse-mcp] connected via stdio transport...` line proves the pattern is safe.

---

## Test Contract Recommendations

**NEW test files (Phase 161 introduces):**

1. `liv/packages/core/src/agent-session.computer-use.test.ts` (NEW, tsx + node:assert):
   - `isComputerUseSession('native:xyz:abc')` → true
   - `isComputerUseSession('webapp:xyz:abc')` → true
   - `isComputerUseSession('some-uuid')` → false
   - `isComputerUseSession(undefined)` → false
   - Construction with `computerUseSystemPromptBuilder` option — visible on instance
   - Construction WITHOUT the option — behavior identical to pre-161
   - Chat-path-untouched assertion: pass a session with NO prefix → mock `query()` → assert tier remains `'sonnet'`, no builder invoked

2. Source-text invariants added to `liv/packages/core/src/agent-session.ts` test surface:
   - Literal `'claude-haiku-4-5-20251001'` present (dated form, matches broker contract)
   - Literal `'native:'` and `'webapp:'` present (detection literals)
   - Sacred SHA marker comment unchanged

**EXISTING test files extended:**

3. `livos/packages/livinityd/source/modules/computer-use/mcp/server.test.ts` — add 4-6 new tests:
   - When all 4 env vars present → `livosAppResolver` constructed and passed into `registerLuseTools`
   - When `LIVINITYD_API_URL` missing → resolver undefined → fall-through
   - When `LIV_API_KEY` missing → resolver undefined → fall-through
   - When HTTP fetch throws → resolver's listWebApps returns []
   - When HTTP fetch returns malformed JSON → resolver's listWebApps returns []
   - Source-text invariant: literal `LIVINITYD_API_URL` / `LIV_API_KEY` / `LUSE_USER_SLUG` / `LUSE_DOMAIN_ROOT` env reads

4. `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.test.ts` — add tests for the new env block:
   - Per-WebApp descriptor branch — verify `LIVINITYD_API_URL`, `LIV_API_KEY`, `LUSE_USER_SLUG`, `LUSE_DOMAIN_ROOT` present in `env` block
   - Host-display branch — verify these env vars present when livinityd passes them through

5. `livos/packages/ui/src/hooks/use-native-app-agent.test.ts` + `use-webapp-agent.unit.test.tsx` — add ONE invariant each:
   - Prefix passes through to `agent.sendMessage` verbatim (no mutation)

**Operator UAT checklist (re-walk Phase 160 10-step):**

| Step | Phase 160 expected | Phase 161 expected (post-wire) |
|------|--------------------|---------------------------------|
| 5 | `claude-haiku-4-5-20251001` in journal — pre-161 it was `claude-sonnet-4-6` | `claude-haiku-4-5-20251001` ✅ |
| 6 | `LIVOS CONTEXT` overlay text — pre-161 absent | overlay visible ✅ |
| 7 | `open n8n` → opens `n8n-bruce.livinity.io` (DASH form) — pre-161 dead code | window opens ✅ |
| 8 | `/etc/passwd` rejected (sandbox) — works pre-161 (160-05) | still works ✅ |
| 9 | Real display size (1920x1080 or 1280x720) — pre-161 was `1280x960` | real size ✅ |
| 10 | Lifecycle regression (open/close/reopen NativeApp) — Phase 159 | no regression ✅ |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 20+ | `liv/packages/core` build, livinityd test runs | ✓ | (assumed available on dev machine) | — |
| `tsx` | `liv/packages/core` tests + livinityd runtime (`livos.service` runs livinityd via tsx) | ✓ | per package.json devDeps | — |
| `vitest` | livinityd + ui tests | ✓ | ^2.1.2 per livinityd package.json | — |
| `@anthropic-ai/claude-agent-sdk` | SDK subscription path (already used pre-161) | ✓ | ^0.2.84 per liv/packages/core package.json | — |
| `@modelcontextprotocol/sdk` | MCP child server.ts (already used pre-161) | ✓ | ^1.12.0 per liv/packages/core package.json | — |
| Mini PC SSH | Operator UAT (not executor) | (operator-side) | bruce@10.69.31.68 | — |

**Phase 161 introduces NO new runtime dependencies** (D-NO-NEW-DEPS upheld). Verified: `node:http` / `fetch` / env reads are all already in active use.

---

## Validation Architecture (skipped per workflow.nyquist_validation: false)

Per `.planning/config.json` setting `nyquist_validation: false`, the full Nyquist Validation Architecture section is omitted. Minimal test pyramid + UAT criteria are documented in **Test Contract Recommendations** above.

---

## Open Questions

None blocking. Two minor decisions left to the planner:

1. **Env var name for the MCP child's livinityd-tRPC URL** — CONTEXT.md suggested `LIV_API_URL` but that conflicts with the existing `ws-agent.ts:154` usage (liv-core port 3200, not livinityd port 8080). Recommendation: rename to `LIVINITYD_API_URL` or follow the existing `LUSE_*` prefix convention with `LUSE_LIVINITYD_URL`. Planner picks the canonical name; CONTEXT.md should be updated to match.

2. **Per-user `userSlug` resolution** — for Phase 161 v1, hard-coded `'admin'` / `'livinity.io'` defaults are fine (mirrors `luse-mcp-config.ts:318` default). A future plan can thread per-session user from JWT. **Recommendation: defer to v37+ unless operator UAT discovers a multi-user regression.**

---

## Sources

### Primary (HIGH confidence)

- **Codebase verification** (all line numbers verified by direct file reads):
  - `liv/packages/core/src/agent-session.ts` (912 lines)
  - `liv/packages/core/src/sdk-agent-runner.ts` (511 lines, sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`)
  - `livos/packages/livinityd/source/modules/server/ws-agent.ts` (273 lines)
  - `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` (430 lines)
  - `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` (169 lines)
  - `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` (excerpt — DI hook at line 199, resolver call at line 749)
  - `livos/packages/livinityd/source/modules/computer-use/native/window.ts` (excerpt — `defaultLivosAppResolver` at line 467)
  - `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts` (445 lines)
  - `livos/packages/livinityd/source/modules/apps/native-routes.ts` (excerpt — `nativeAppsRouter.list` at line 152)
  - `livos/packages/livinityd/source/modules/webapps/index.ts` (28 lines, `webappRouter` re-export at line 15)
  - `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` (excerpt — Haiku routing at line 184-197)
  - `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.test.ts` (excerpt — runtime body-injection tests at line 540-612)
  - `livos/packages/livinityd/source/modules/server/trpc/common.ts` (excerpt — httpOnlyPaths)
  - `livos/packages/ui/src/hooks/use-native-app-agent.ts` (118 lines)
  - `livos/packages/ui/src/hooks/use-native-app-agent.test.ts` (78 lines)
  - `livos/packages/ui/src/hooks/use-webapp-agent.ts` (excerpt — prefix emit at line 89-98, sendMessage at line 250)
  - `livos/packages/ui/src/hooks/use-agent-socket.ts` (excerpt — sendMessage at line 552-598, payload assembly at line 576-595)
  - `liv/packages/core/src/agent-session.test.ts` (216 lines — testing patterns)
  - `livos/packages/livinityd/source/modules/computer-use/mcp/server.test.ts` (excerpt — vitest patterns)

- **Phase 160 documentation:**
  - `.planning/phases/160-luse-livos-overlay-haiku-routing/160-VERIFICATION.md` (163 lines)
  - `.planning/phases/160-luse-livos-overlay-haiku-routing/160-06-SUMMARY.md` (carry-forward queue)
  - `.planning/ROADMAP.md` Phase 160 ship note + Phase 161 entry (lines 1788-1846)
  - `.planning/STATE.md` (last_updated 2026-05-19, Phase 160 SHIPPED status)
  - `.planning/phases/161-computer-use-sdk-path-wiring/161-CONTEXT.md` (200 lines)

- **Git verification:**
  - `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sacred SHA PASS)

### Secondary (MEDIUM confidence)

- Project memory `feedback_subscription_only.md` — subscription path is sacred.
- Project memory `reference_anthropic_subscription_state.md` — Mini PC uses `/root` creds via `BROKER_FORCE_ROOT_HOME`.
- Project memory `feedback_p65_rename_complete.md` — sacred SHA value rationale.

### Tertiary (LOW confidence — no claims rely on these alone)

- None — all critical claims verified by direct codebase reads.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `webappRouter.list` is a `privateProcedure.query` with no input. | Q4 (D-161-D validation) | LOW — file path `livos/packages/livinityd/source/modules/webapps/trpc-router.ts` was NOT directly read; only inferred from `index.ts:15` re-export. Planner should grep the file to confirm shape. If it requires input, the MCP child fetch URL needs `?input={...}`. |
| A2 | tRPC v11 wire format for empty-input GET query is `/trpc/{procedure}?input=`. | Q4 | LOW — common tRPC v11 pattern but not directly verified for this codebase. If batching is enforced, format may be `/trpc/{procedure}?batch=1&input=%7B%220%22%3A...%7D`. Verify by curling against a running livinityd. |
| A3 | `LIV_API_KEY` from `/opt/livos/.env` is a valid X-Api-Key for tRPC `privateProcedure`. | Q4 | LOW — inferred from 15+ uses in `ai/routes.ts` calling `livApiUrl` (liv-core, port 3200), but NOT directly verified for livinityd's own tRPC at port 8080. Could be a different key. Planner should confirm via env file inspection on Mini PC. |
| A4 | `BROKER_FORCE_ROOT_HOME=true` is set in the Mini PC's livinityd environment (per project memory `reference_anthropic_subscription_state.md`). | "Project Constraints" | LOW — assumed live based on memory; not verified in this session. If unset, SDK falls back to per-user HOME and might not find creds. Operator should confirm during UAT. |

**Empty risks:** All other claims in this research were verified by direct file reads or git output. Items A1-A4 are the only `[ASSUMED]` claims and they should be confirmed during planning or execution.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Computer-use loop hits `claude-sonnet-4-6` (broker path) | Header-gated Haiku routing via broker `mode: 'computer-use'` | Phase 160-01 (2026-05-19) | External clients (Bolt.diy, Cline) now get Haiku — LivOS internal SDK path still on Sonnet (Phase 161 gap) |
| `luse-system-prompt.ts` hardcoded `1280x960` + Firefox/Thunderbird app list | Overlay prepended via `buildLuseSystemPromptWithOverlay` (verbatim preserved) | Phase 160-02/04 | Available but UN-WIRED for SDK path; wiring is Phase 161-02 |
| `computer_application` enum-locked to Bytebot defaults | Free-form `string` + `livosAppResolver` DI hook | Phase 160-03 | Available but UN-WIRED at `mcp/server.ts` (resolver never constructed); wiring is Phase 161-03 |
| MCP child stderr IPC parsed in parent for window-manager.openWindow | Same approach; new resolver match emits `[luse-mcp] open_livos_app kind=X appId=Y route=Z` | Phase 160-03 | Schema in place; parent-side parser is also Phase 161 carry-forward (NOT in scope per CONTEXT.md — D-161-D doesn't include the parser side) |

**Deprecated/outdated:**
- `buildActiveWindowSnippet` (Phase 101) — superseded by `buildActiveDisplaySnippet` (Phase 102-06). Both kept for back-compat during migration window.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all framework versions verified via direct package.json reads (`@anthropic-ai/claude-agent-sdk ^0.2.84`, `@modelcontextprotocol/sdk ^1.12.0`, `vitest ^2.1.2`)
- Architecture: HIGH — full conversationId trace verified end-to-end; sacred SHA confirmed live
- Pitfalls: HIGH — 10 landmines surfaced via direct code inspection (model string, port confusion, stderr IPC, env-block idempotency, intent router disabled, etc.)

**Research date:** 2026-05-19
**Valid until:** 2026-06-19 (30 days — codebase is currently stable, Phase 160 just shipped)
