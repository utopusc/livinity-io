# Phase 42 Codebase Audit — OpenAI-Compatible Broker Extension Points

**Audit date:** 2026-04-30
**Audited by:** Phase 42 executor (Plan 42-01)
**Purpose:** Pin EXACT extension points so Plans 42-02..05 don't have to re-discover them.
**Predecessor:** Phase 41 (Anthropic Messages broker) — module + IP guard + HTTP-proxy SdkAgentRunner integration already shipped.
**Sacred file baseline:** `nexus/packages/core/src/sdk-agent-runner.ts` blob `623a65b9a50a89887d36f770dcd015b691793a7f` (Phase 40 baseline; byte-identical chain since Phase 40).

---

## Section 1: Sacred File Baseline Re-Verification

**Pre-Phase-42 verification commands run:**

```bash
$ git log -1 --format="%H" -- nexus/packages/core/src/sdk-agent-runner.ts
2cf59b1f07679b451834fb1bf6e5338d31e2e41c

$ git ls-tree HEAD nexus/packages/core/src/sdk-agent-runner.ts
100644 blob 623a65b9a50a89887d36f770dcd015b691793a7f	nexus/packages/core/src/sdk-agent-runner.ts

$ git diff HEAD -- nexus/packages/core/src/sdk-agent-runner.ts | wc -l
0
```

**Result:** Sacred file blob SHA at HEAD = `623a65b9a50a89887d36f770dcd015b691793a7f`. This MATCHES the Phase 40 baseline + Phase 41 final SHA recorded in `41-SUMMARY.md` (sacred-file-final-sha). Working-tree diff against HEAD is empty. The sacred file is untouched and Phase 42 inherits a clean baseline.

**Last commit that touched the sacred file:** `2cf59b1f07679b451834fb1bf6e5338d31e2e41c` (Phase 40 — `feat(40-02): add homeOverride to SdkAgentRunner for per-user OAuth isolation`). No commits since Phase 40 have modified the sacred file body.

**Phase 42 baseline statement:**
> Phase 42 baseline = `623a65b9a50a89887d36f770dcd015b691793a7f` (Phase 41 final = Phase 40 baseline; byte-identical chain since Phase 40).

This SHA must remain unchanged after every Plan 42-02..05 commit. Each plan re-asserts via `git diff HEAD -- nexus/packages/core/src/sdk-agent-runner.ts | wc -l` (must equal 0).

---

## Section 2: Mount Surface

The broker is mounted at exactly ONE point in the existing livinityd Express app, established by Phase 41:

**File:** `livos/packages/livinityd/source/modules/server/index.ts:1215`

Verbatim 5 lines around the mount call (evidence):

```typescript
		// ── Livinity Broker (Phase 41 — Anthropic Messages API for marketplace apps) ──
		// Routes: POST /u/:userId/v1/messages (sync + SSE per Plan 41-03)
		// See livos/packages/livinityd/source/modules/livinity-broker/ +
		// .planning/phases/41-anthropic-messages-broker/
		mountBrokerRoutes(this.app, this.livinityd)
```

**`mountBrokerRoutes` definition** (`livos/packages/livinityd/source/modules/livinity-broker/index.ts:25`):

```typescript
export function mountBrokerRoutes(app: express.Application, livinityd: Livinityd): void {
	const router = createBrokerRouter({livinityd})
	app.use('/u', router)
	livinityd.logger.log('[livinity-broker] routes mounted at /u/:userId/v1/messages')
}
```

**Phase 42 mount strategy:** ZERO edits to `livos/packages/livinityd/source/modules/server/index.ts`. The existing `createBrokerRouter()` factory in `router.ts:25` will be extended to also register the `/v1/chat/completions` route — automatically picked up by the existing mount call. No new mount points, no new ports, no new health checks.

The full URL pattern after Phase 42 will be:
- Existing (Phase 41): `POST /u/:userId/v1/messages`
- New (Phase 42): `POST /u/:userId/v1/chat/completions`

Both share the `/u/:userId/v1` prefix per D-42-03.

---

## Section 3: Helpers to Reuse Verbatim

Phase 42's `openai-router.ts` will import and reuse these Phase 41 helpers IDENTICALLY — no duplication, no parametrization needed:

| Helper | Source file (Phase 41) | Import path | Reuse pattern |
|--------|------------------------|-------------|---------------|
| `containerSourceIpGuard` | `auth.ts:23` | `./auth.js` | Already applied at router level via `router.use(containerSourceIpGuard)` (router.ts:29). Phase 42 inherits transparently — NO re-application needed. Covers BOTH `/v1/messages` and `/v1/chat/completions` |
| `resolveAndAuthorizeUserId(req, res, livinityd)` | `auth.ts:69` | `./auth.js` | Called inside the OpenAI handler the SAME way `/v1/messages` calls it. Returns `{userId}` on success, undefined after writing 400/404/403 response. |
| `express.json({limit: '10mb'})` body parser | `router.ts:32` | n/a | Already applied at router level. NO re-application needed. |
| `createSdkAgentRunnerForUser(opts)` | `agent-runner-factory.ts:29` | `./agent-runner-factory.js` | The SAME async generator the Anthropic route uses. OpenAI route reuses it identically — only the input translation (OpenAI → SdkRunArgs) and output adapter (AgentEvent → OpenAI chunks) differ. |
| `aggregateChunkText()` | `sync-response.ts:51` | `./sync-response.js` | Reusable as-is for OpenAI sync response. Text concatenation is format-agnostic — `event.type === 'chunk' && typeof event.data === 'string'` push, `parts.join('')` get. |

**Helpers NOT reused (Anthropic-spec-specific, would require parametrization):**

- `writeSseChunk` (sse-adapter.ts:62) — emits `event: <name>\ndata: <json>\n\n`. OpenAI spec rejects the `event:` line. See Section 4.
- `createSseAdapter` (sse-adapter.ts:89) — discriminated union over 8 Anthropic event shapes. OpenAI shapes are different enough that a separate adapter is cleaner.
- `buildSyncAnthropicResponse` (sync-response.ts:22) — Anthropic Messages JSON shape. OpenAI Chat Completion shape needs its own builder (`buildSyncOpenAIResponse`).
- `translateAnthropicMessagesToSdkArgs` (translate-request.ts:32) — Anthropic Messages format. OpenAI Chat Completions has different role semantics (system extracted to top-level field) and different content shape (string OR text-block array). Phase 42 ships `translateOpenAIChatToSdkArgs` as a sibling.

---

## Section 4: OpenAI SSE Strategy Decision

**Phase 41's `writeSseChunk` writes BOTH `event:` and `data:` lines** (sse-adapter.ts:62-69):

```typescript
export function writeSseChunk(res: Response, chunk: AnthropicSseChunk): void {
	if (res.writableEnded) return
	res.write(`event: ${chunk.event}\n`)
	res.write(`data: ${JSON.stringify(chunk.data)}\n\n`)
	const flushable = res as unknown as {flush?: () => void}
	if (typeof flushable.flush === 'function') flushable.flush()
}
```

**OpenAI Chat Completions streaming wants `data:`-only lines** (per https://platform.openai.com/docs/api-reference/chat/streaming):

```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk",...}\n\n
data: {"id":"chatcmpl-...","object":"chat.completion.chunk",...}\n\n
data: [DONE]\n\n
```

NO `event:` prefix anywhere. The terminal sentinel is the LITERAL string `data: [DONE]\n\n` (NOT a JSON object). The official `openai` Python SDK's stream parser strictly validates this — any `event:` prefix → SDK throws.

**DECISION: Create a NEW file `openai-sse-adapter.ts` rather than parametrizing the existing `sse-adapter.ts`.**

**Rationale:**

1. **Type-safety blast radius.** Phase 41's adapter is a tightly-coupled discriminated union over 8 Anthropic event shapes (`AnthropicSseChunk`). Adding OpenAI shapes would balloon the union from 8 → ~12 variants and risk regressing Phase 41 tests via type inference fallout in the writeSseChunk overload.

2. **Two narrow files vs one wide file.** Two adapters = two narrow files, each with its own type-safe chunk discriminator, easier to test independently. Mirrors the Phase 41 pattern of one-file-per-format (translate-request.ts is already format-specific; openai-translator.ts will be too).

3. **Phase 41 sse-adapter.ts is feature-frozen.** Per the executor's `<sacred_files>` block, Phase 41's `sse-adapter.ts` is feature-frozen for Phase 42. Touching it could break the Phase 41 integrity tests (`sse-adapter.test.ts` — 4 cases verifying Anthropic event order). Verified after every Plan 42-XX commit by `git diff HEAD -- livos/packages/livinityd/source/modules/livinity-broker/sse-adapter.ts | wc -l` (must equal 0).

**EXPLICIT STATEMENT FOR DOWNSTREAM PLANS:**
> Phase 41's `sse-adapter.ts` is NOT modified in Phase 42. A new sibling file `openai-sse-adapter.ts` will house OpenAI chunk writer (`writeOpenAISseChunk`), the literal terminator constant (`OPENAI_SSE_DONE = 'data: [DONE]\n\n'`), and the stateful adapter (`createOpenAISseAdapter`).

---

## Section 5: Router Middleware Order in OpenAI Handler

`createBrokerRouter()` in `router.ts:25` is the single Express.Router factory. Phase 42 extends it by registering a SECOND POST handler AFTER the existing `/v1/messages` handler, BEFORE the `return router` line.

**Existing structure (Phase 41 — DO NOT MODIFY router.use lines):**

```typescript
export function createBrokerRouter(deps: BrokerDeps): express.Router {
	const router = express.Router()
	router.use(containerSourceIpGuard)            // Line 29 — applies to ALL routes
	router.use(express.json({limit: '10mb'}))     // Line 32 — applies to ALL routes
	router.post('/:userId/v1/messages', async (req, res) => { ... })  // Line 35
	return router  // Line 165
}
```

**Phase 42 extension (2 lines added in Plan 42-02):**

```typescript
import {registerOpenAIRoutes} from './openai-router.js'  // Add at top

// ... existing handler ...

	// Phase 42: register OpenAI Chat Completions endpoint on the same router
	// (inherits containerSourceIpGuard + express.json middleware applied above).
	registerOpenAIRoutes(router, deps)

	return router
}
```

**Inside the OpenAI handler (`registerOpenAIRoutes` call wraps `router.post('/:userId/v1/chat/completions', ...)`)**, the order MUST be:

1. **`resolveAndAuthorizeUserId(req, res, deps.livinityd)`** — returns `{userId}` or undefined (response already written for 400/404/403).
2. **Body validation** — `model` non-empty string; `messages` non-empty array; OpenAI error shape `{error: {message, type: 'invalid_request_error', code}}` on failure (NOT Anthropic shape).
3. **Tool fields ignore + warn log** — if `body.tools.length > 0` OR `body.tool_choice !== undefined` OR `body.function_call !== undefined` OR `body.functions.length > 0`, log a warn line per D-42-12 (carry-forward of D-41-14). Never reach upstream.
4. **Translate OpenAI → SdkRunArgs** via `translateOpenAIChatToSdkArgs(body)` (new in Plan 42-02). Throws on invalid shape → respond with 400 OpenAI-shaped error.
5. **Resolve model alias** via `resolveModelAlias(body.model)` (new in Plan 42-02). Returns `{actualModel, warn}`. If `warn === true`, log a warn line. Returned `model` field in response echoes the CALLER'S requested model (D-42-11), not the resolved Claude model.
6. **Branch on `body.stream`:**
   - `stream === true` → SSE response. Plan 42-02 ships a 501 stub (Plan 42-03 replaces with real SSE adapter using `createOpenAISseAdapter`).
   - `stream === false` (or undefined) → buffer all chunks via `aggregateChunkText()`, build response via `buildSyncOpenAIResponse({requestedModel, bufferedText, result})`, respond 200 JSON.
7. **Reuse `createSdkAgentRunnerForUser`** for the upstream call (same as `/v1/messages`). Same generator, same X-LivOS-User-Id header, same per-user HOME isolation.

---

## Section 6: SdkAgentRunner Reuse Path (Strategy B Inheritance)

Phase 41 chose **Strategy B** (HTTP proxy to nexus's `/api/agent/stream`) over Strategy A (direct in-process `SdkAgentRunner` instantiation in livinityd). Documented in `41-SUMMARY.md` ("Strategy B Decision") and inherited from `agent-runner-factory.ts:29`:

```typescript
export async function* createSdkAgentRunnerForUser(opts: {
	livinityd: Livinityd
	userId: string
	task: string
	contextPrefix?: string
	systemPromptOverride?: string
	maxTurns?: number
	signal?: AbortSignal
}): AsyncGenerator<AgentEvent, AgentResult, void>
```

The function:
- POSTs to `${LIV_API_URL}/api/agent/stream` (defaults `http://localhost:3200`).
- Sets `X-API-Key` header from `LIV_API_KEY` env var (gates nexus's `/api/*` surface).
- In multi-user mode: sets `X-LivOS-User-Id` header → nexus's Plan 41-04 wiring computes `homeOverride` → `SdkAgentRunner` spawns `claude` CLI subprocess with that user's `/opt/livos/data/users/<userId>/.claude` HOME.
- In single-user mode: omits the header → nexus uses `process.env.HOME` (pre-Phase-41 behavior preserved).
- Yields `AgentEvent` values, returns `AgentResult` from generator.

**Phase 42 inheritance:** The OpenAI route MUST call `createSdkAgentRunnerForUser` IDENTICALLY to the Anthropic route. No new HTTP-proxy code. No direct SdkAgentRunner instantiation.

**EXPLICIT STATEMENT FOR DOWNSTREAM PLANS:**
> OpenAI route does NOT touch `nexus/packages/core/src/api.ts`. The X-LivOS-User-Id header path established by Plan 41-04 carries forward unchanged. Phase 42 has ZERO nexus changes — all work is in `livos/packages/livinityd/source/modules/livinity-broker/`.

This means:
- No new tests in `nexus/packages/core/src/`.
- `test:phase42` npm script chains `test:phase41` (which already chains `test:phase40` → `test:phase39` → sacred-file integrity test).
- Phase 41's `api-home-override.test.ts` (7 cases) automatically validates the OpenAI route's per-user HOME isolation too — same machinery, same mechanism.

---

## Section 7: Test Infrastructure (vitest? bare tsx?)

**Phase 41 pattern (verified by reading `integration.test.ts:1-302` + the 3 unit tests):**

- **NO Vitest, NO Jest.** Bare `node:assert/strict` + `tsx` execution per file.
- Each test file runs individually as `npx tsx ./source/modules/livinity-broker/<name>.test.ts`.
- Tests print `PASS Test N: ...` per case and a summary line `All <name>.test.ts tests passed (N/N)`.
- Exit code 0 = success; failure throws and process.exit(1).

**Integration test pattern (`integration.test.ts:39-152`):**

1. **Patch `pg.Pool.prototype` BEFORE database module import** (lines 39-55):
   ```typescript
   ;(pg.Pool.prototype as any).connect = async function () { ... }
   ;(pg.Pool.prototype as any).query = async function (sql, params) { return mockPoolQuery(sql, params) }
   ;(pg.Pool.prototype as any).end = async function () { /* no-op */ }
   ```
   Then call `await import('../database/index.js'); await dbMod.initDatabase(...)` so the module-level pool gets a real `Pool` whose prototype methods are mocked. `mockPoolQuery(sql, params)` dispatches on SQL substring patterns (e.g. `/FROM users WHERE id = \$1/`).

2. **Per-test `globalThis.fetch` monkey-patch SCOPED to `/api/agent/stream` only** (lines 108-129):
   ```typescript
   globalThis.fetch = (async (input, init) => {
     const urlStr = typeof input === 'string' ? input : input?.url || ''
     if (!urlStr.includes('/api/agent/stream')) return original(input, init)
     // ... return mocked SSE Response with ReadableStream of `data: <json>\n\n` lines ...
   }) as any
   ```
   The "scope to upstream" check is critical — without it, the test's own fetch to the broker on `127.0.0.1:<port>` gets intercepted too.

3. **Ephemeral `127.0.0.1` server via `http.createServer`** (lines 131-152):
   ```typescript
   const app = express()
   app.use('/u', createBrokerRouter({livinityd}))
   const server = http.createServer(app)
   server.listen(0, '127.0.0.1', () => { ... })
   ```
   Port 0 = let OS assign. `127.0.0.1` = naturally allowed by `containerSourceIpGuard`.

**Phase 42's `openai-integration.test.ts` MUST mirror this pattern verbatim.** Plan 42-04 specifies the test file structure.

**Run command for Phase 42 tests:**

```bash
cd livos/packages/livinityd
npx tsx ./source/modules/livinity-broker/openai-translator.test.ts        # 16/16 PASS
npx tsx ./source/modules/livinity-broker/openai-sse-adapter.test.ts       # 10/10 PASS
npx tsx ./source/modules/livinity-broker/openai-integration.test.ts       # 6/6 PASS
```

**Chained `npm run test:phase42` strategy:**

Phase 42 has NO nexus-side changes (per Section 6). The chained nexus tests stay at 16/16 (Phase 41 surface unchanged). The `test:phase42` script simply chains `test:phase41` and re-asserts the sacred SHA via the chained `sdk-agent-runner-integrity.test.ts` (already in `test:phase39`, transitively included).

**DECISION:**
> Phase 42 adds NO new nexus tests. `test:phase42` definition: `"test:phase42": "npm run test:phase41"`. Total chained nexus tests = 16/16 (unchanged from Phase 41).

The 32 NEW Phase 42 tests live in livinityd-side files and are run individually via `npx tsx`. The full Phase 42 verification surface = 32 (new livinityd) + 16 (chained nexus) + 26 (chained Phase 41 livinityd) = **74 tests total**.

---

## Section 8: Risks & Open Questions for Plans 42-02..05

Pinned for downstream plans — these are NOT blockers, just calls-out so Plan 42-02..05 implementations are unambiguous.

### Risk R1: SDK args translator output shape parity

**Risk:** OpenAI translator must produce a shape that `createSdkAgentRunnerForUser` accepts identically to Phase 41's translator. If shapes diverge, the upstream call would silently fail or produce odd behavior.

**Verification (read `agent-runner-factory.ts:29-37`):**

```typescript
export async function* createSdkAgentRunnerForUser(opts: {
	livinityd: Livinityd
	userId: string
	task: string                       // ← required
	contextPrefix?: string             // ← optional
	systemPromptOverride?: string      // ← optional
	maxTurns?: number
	signal?: AbortSignal
}): AsyncGenerator<AgentEvent, AgentResult, void>
```

Phase 41's `translateAnthropicMessagesToSdkArgs` returns `SdkRunArgs = {task, contextPrefix?, systemPromptOverride?}` (translate-request.ts:4-8).

**Confirmed:** OpenAI translator can return the SAME `SdkRunArgs` shape and reuse `createSdkAgentRunnerForUser` directly. Plan 42-02 imports `SdkRunArgs` type from `./translate-request.js` (no re-declaration).

### Risk R2: `aggregateChunkText` reusability for OpenAI sync response

**Risk:** Phase 41's `aggregateChunkText` operates on `AgentEvent` with `type === 'chunk'` and `typeof event.data === 'string'`. OpenAI sync response just needs the concatenated text — same call, format-agnostic. But what if OpenAI handler needs additional aggregation (e.g., per-choice index)?

**Verification (read `sync-response.ts:51-59`):**

```typescript
export function aggregateChunkText(): {push: (event: AgentEvent) => void; get: () => string} {
	const parts: string[] = []
	return {
		push(event) {
			if (event.type === 'chunk' && typeof event.data === 'string') parts.push(event.data)
		},
		get: () => parts.join(''),
	}
}
```

OpenAI Chat Completions sync response only emits ONE choice (no `n` param support in v29.3). The single concatenated text becomes `choices[0].message.content`. **Confirmed safe to reuse.**

### Risk R3: First-chunk role requirement (OpenAI streaming)

**Risk:** OpenAI Chat Completions streaming spec REQUIRES `delta.role: "assistant"` on the FIRST chunk only. Subsequent chunks have `delta.content` only (no role). The official `openai` Python SDK's `Stream.__iter__` validates this — missing role on first chunk → `IndexError` or `AttributeError`.

**Mitigation for Plan 42-03:** `createOpenAISseAdapter` MUST track a `firstChunkSent` boolean. On the first text chunk, emit `delta: {role: 'assistant', content: <text>}`. On subsequent chunks, emit `delta: {content: <text>}` only.

Documented in Plan 42-03's `<behavior>` block. Adapter code will use `firstChunkSent` flag (see Plan 42-03 task 1 example code).

### Risk R4: SSE `data:`-only format + literal `[DONE]` terminator

**Risk:** Any `event:` prefix in the OpenAI SSE output → official `openai` Python SDK throws (its parser strictly checks `data: ` prefix on every line). Missing literal `data: [DONE]\n\n` terminator → SDK hangs waiting for stream close + then throws on EOF.

**Mitigation for Plan 42-03:** `writeOpenAISseChunk` helper emits `data: <json>\n\n` (no `event:` line). `OPENAI_SSE_DONE` constant = the literal `'data: [DONE]\n\n'` string. Adapter's `finalize()` method (called from finally block) ALWAYS writes the terminator — even on error paths or empty streams (degenerate case).

Verified in Plan 42-04 via:
- `openai-sse-adapter.test.ts` Test 6: assert `!buffer.includes('event:')` for any output.
- `openai-sse-adapter.test.ts` Test 4: assert `OPENAI_SSE_DONE === 'data: [DONE]\n\n'` (byte-identical).
- `openai-sse-adapter.test.ts` Test 8: assert `finalize()` with no prior events writes role+terminal+[DONE].

### Risk R5: Model alias table & response echo

**Risk:** Per D-42-11, the `model` field in the OpenAI response MUST echo the CALLER'S requested model (e.g., `gpt-4`), NOT the resolved Claude model. Internal logging records both. Marketplace apps hardcode the model name they sent and may break if the response.model differs.

**Hardcoded alias table (D-42-11 verbatim):**

| Requested model | Resolved Claude model | Warn? |
|-----------------|----------------------|-------|
| `gpt-4`, `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`, `gpt-*` | `claude-sonnet-4-6` | No |
| `claude-sonnet-4-6`, `claude-sonnet*` | `claude-sonnet-4-6` (pass-through) | No |
| `claude-opus*` | `claude-opus-4-6` | No |
| `claude-haiku*` | `claude-haiku-4-5` | No |
| Anything else | `claude-sonnet-4-6` (default) | **YES** |

**Mitigation for Plan 42-02:**
- `resolveModelAlias(requested: string): {actualModel: string; warn: boolean}` returns the table-resolved model + warn flag.
- Caller (router) logs warn line: `[livinity-broker:openai] WARN unknown model '<requested>' — defaulting to claude-sonnet-4-6`.
- `buildSyncOpenAIResponse({requestedModel, ...})` echoes `requestedModel` as the response `model` field.
- `createOpenAISseAdapter({requestedModel, res})` echoes `requestedModel` as the `model` field on every chunk.

Verified in Plan 42-04 via:
- `openai-translator.test.ts` Test 1-5: verify all 5 alias-table branches.
- `openai-translator.test.ts` Test 14: verify response.model === requestedModel.
- `openai-integration.test.ts` Test 4: verify unknown model still 200 + warn logged + response.model echoes "foobar-llm".

---

## Summary

| Question | Answer |
|----------|--------|
| Does Phase 42 modify `server/index.ts`? | **NO** (mount surface unchanged) |
| Does Phase 42 modify `nexus/packages/core/`? | **NO** (Strategy B inherited unchanged) |
| Does Phase 42 modify `sdk-agent-runner.ts`? | **NO** (sacred file byte-identical at `623a65b9...`) |
| Does Phase 42 modify `sse-adapter.ts`? | **NO** (Phase 41 adapter feature-frozen) |
| Does Phase 42 modify `router.ts`? | **YES — 2 lines added** (import + `registerOpenAIRoutes(router, deps)` call) |
| New files in `livinity-broker/`? | 4 source + 3 test = 7 new files (`openai-types.ts`, `openai-translator.ts`, `openai-router.ts`, `openai-sse-adapter.ts` + 3 test files) |
| New files elsewhere? | None (no nexus changes) |
| New npm scripts? | 1 line in `nexus/packages/core/package.json` (`test:phase42` chains `test:phase41`) |
| Verification surface | 32 new tests + 16 chained nexus + 26 chained Phase 41 livinityd = **74 tests** |
| Sacred file SHA after Phase 42 | Must equal `623a65b9a50a89887d36f770dcd015b691793a7f` (re-verify after every commit) |

Plans 42-02..05 can begin without re-reading Phase 41 source files. All extension points are pinned with concrete paths + line numbers + reuse decisions + downstream-plan-relevant risks.

---

*Audit complete. Phase 42 implementation is unblocked.*
