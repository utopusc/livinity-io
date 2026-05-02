# Phase 45: Carry-Forward Sweep — Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 4 modified source files + 3 modified/extended test files
**Analogs found:** 7 / 7 (all in-tree — every fix has a sibling pattern in the same module)

> **Phase character.** Every file in this phase is **MODIFIED, not NEW**. The analogs are not "files in another module that look like what we're building" — they are **the same files** (or their immediate siblings) showing the existing surface we are extending. Pattern extraction here means "show the planner the exact byte-region around each surgical edit so plan actions can reference file:line anchors directly."

---

## File Classification

| Carry-Forward | File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|------|-----------|----------------|---------------|
| **C1** | `livos/packages/livinityd/source/modules/livinity-broker/router.ts` (line 157-162) | controller (Express handler) | request-response, error-translation | self (line 157-162) + `openai-router.ts:234-242` (sibling sync error catch) | exact (self-edit) |
| **C1** | `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` (lines 75-77) | service (HTTP fetch wrapper) | streaming, request-response | self (lines 68-77) | exact (self-edit) |
| **C1 test** | `livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts` | test (integration, mock-fetch) | request-response | self — extend with new "upstream 429 → broker 429" + parameterized 9-status-code test | exact (test-extension) |
| **C2** | `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` (line 33) | test (sacred-file integrity meta-test) | hash-comparison | self (line 30-33 = previous Phase 40 re-pin audit comment block) | exact (precedent re-pin) |
| **C3** | `livos/packages/livinityd/source/modules/server/trpc/common.ts` (around line 169-173) | config (tRPC routing allowlist) | configuration array | self — every existing entry of `httpOnlyPaths` is the same shape (string literal + comment) | exact (homogeneous list extension) |
| **C3 test** | new restart-livinityd-mid-session test | test (integration, server lifecycle) | request-response | `integration.test.ts` (broker pattern: ephemeral express + node-assert/strict, no Vitest) | role-match (closest harness) |
| **C4** | `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts` | service (SSE stream-state machine) | streaming, transform | self (line 109-110 = `final_answer` terminal-chunk emission) + `openai-translator.ts:177-194` (sync usage shape — to mirror in streaming) | exact (self) + role-match (sibling `usage` builder) |
| **C4 test** | `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.test.ts` | test (unit, fake-Response buffer) | streaming chunk parse | self (Test 3 + 4 at lines 82-95) — extend with usage-presence assertion | exact (test-extension) |

---

## Pattern Assignments

### C1a — `router.ts:157-162` (broker Anthropic Messages sync error path)

**Analog:** self (lines 157-162 = the literal block C1 patches)
**File:** `livos/packages/livinityd/source/modules/livinity-broker/router.ts`

**Current (broken) shape — sync (non-stream) error catch — lines 157-162:**
```typescript
} catch (err: any) {
    res.status(500).json({
        type: 'error',
        error: {type: 'api_error', message: err?.message || 'broker error'},
    })
}
```

**Where the upstream Response object lives** — `agent-runner-factory.ts:68-77`. The fetch result `response` is closed over inside the `createSdkAgentRunnerForUser` generator; `response.status` and `response.headers.get('Retry-After')` are NOT currently surfaced to the caller. The error thrown at `agent-runner-factory.ts:76` swallows them via:

```typescript
throw new Error(`/api/agent/stream returned ${response.status} ${response.statusText}`)
```

→ The router's `catch (err: any)` only ever sees a string; `err.message` is `/api/agent/stream returned 429 Too Many Requests`. Status code is in the message but not in any structured property.

**Sibling reference for the OpenAI-side catch (same shape, same fix needed)** — `openai-router.ts:234-242`:
```typescript
} catch (err: any) {
    res.status(500).json({
        error: {
            message: err?.message || 'broker error',
            type: 'api_error',
            code: 'upstream_failure',
        },
    })
}
```

> **Plan note for the planner.** C1's fix needs to thread upstream `status` + `Retry-After` through the boundary at `agent-runner-factory.ts:75-77` (where `response` is in scope) so the catch block at `router.ts:157` and `openai-router.ts:234` can both inspect them. Recommended primitive: a custom error class (e.g. `UpstreamHttpError extends Error` with `status: number` + `retryAfter: string | null` properties) thrown at `agent-runner-factory.ts:76` instead of the bare `Error`. Both error catches then `instanceof`-check and forward verbatim when `status === 429` (strict allowlist per pitfall B-09).

**Strict 429-only allowlist (per B-09 pitfall):**
```typescript
} catch (err: any) {
    if (err instanceof UpstreamHttpError && err.status === 429) {
        if (err.retryAfter) res.setHeader('Retry-After', err.retryAfter)
        res.status(429).json({
            type: 'error',
            error: {type: 'rate_limit_error', message: err.message},
        })
        return
    }
    // All other upstream errors (502, 503, 504, etc.) → preserve their actual status
    if (err instanceof UpstreamHttpError) {
        res.status(err.status).json({
            type: 'error',
            error: {type: 'api_error', message: err.message},
        })
        return
    }
    // Truly internal errors → 500
    res.status(500).json({
        type: 'error',
        error: {type: 'api_error', message: err?.message || 'broker error'},
    })
}
```

---

### C1b — `agent-runner-factory.ts:75-77` (upstream Response → throw)

**Analog:** self (lines 68-77)
**File:** `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts`

**Current (lossy) lines 68-77:**
```typescript
const response = await fetch(`${livApiUrl}/api/agent/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
})

if (!response.ok || !response.body) {
    throw new Error(`/api/agent/stream returned ${response.status} ${response.statusText}`)
}
```

**The fix** — capture status + Retry-After before throwing:
```typescript
if (!response.ok || !response.body) {
    const retryAfter = response.headers.get('Retry-After')
    throw new UpstreamHttpError(
        `/api/agent/stream returned ${response.status} ${response.statusText}`,
        response.status,
        retryAfter,
    )
}
```

The `UpstreamHttpError` class can live inline in this file (it's a single ~10-line declaration), or in a sibling `errors.ts` if the planner prefers per-module separation. Either works — no existing convention for in-broker error classes today (one new export).

---

### C1 test — `integration.test.ts` extension (parameterized 9-status-code test)

**Analog:** self — extend the existing 5-test file with a 6th + 7th test
**File:** `livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts`

**Existing fetch-mocking primitive — lines 108-129:**
```typescript
function mockUpstreamSse(events: Array<{type: string; data?: unknown; turn?: number}>): () => void {
    const original = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
        const urlStr = typeof input === 'string' ? input : input?.url || ''
        if (!urlStr.includes('/api/agent/stream')) {
            return original(input, init)
        }
        const lines = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(lines))
                controller.close()
            },
        })
        return new Response(stream, {status: 200, headers: {'Content-Type': 'text/event-stream'}})
    }) as any
    return () => { globalThis.fetch = original }
}
```

**Extension recipe for C1 tests** — add a sibling helper that returns an arbitrary status + headers (no body / minimal body):
```typescript
function mockUpstreamError(opts: {status: number; retryAfter?: string}): () => void {
    const original = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
        const urlStr = typeof input === 'string' ? input : input?.url || ''
        if (!urlStr.includes('/api/agent/stream')) return original(input, init)
        const headers = new Headers({'Content-Type': 'text/plain'})
        if (opts.retryAfter) headers.set('Retry-After', opts.retryAfter)
        return new Response('upstream error', {status: opts.status, headers})
    }) as any
    return () => { globalThis.fetch = original }
}
```

**Test 6 + Test 7 shape (mirror existing Test 1 lines 174-205):**
```typescript
// Test 6: upstream 429 with Retry-After:60 → broker 429 with Retry-After:60
{
    setMockUsers(users)
    const restoreFetch = mockUpstreamError({status: 429, retryAfter: '60'})
    const {url, close} = await startBrokerApp(livinityd, createBrokerRouter)
    const res = await fetch(`${url}/u/admin-1/v1/messages`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({model: 'claude-sonnet-4-6', messages: [{role: 'user', content: 'hi'}]}),
    })
    assert.equal(res.status, 429, `expected 429, got ${res.status}`)
    assert.equal(res.headers.get('retry-after'), '60', 'Retry-After preserved verbatim')
    await close(); restoreFetch()
}

// Test 7: parameterized — strict allowlist
for (const status of [400, 401, 403, 429, 500, 502, 503, 504, 529]) {
    setMockUsers(users)
    const restoreFetch = mockUpstreamError({status})
    const {url, close} = await startBrokerApp(livinityd, createBrokerRouter)
    const res = await fetch(`${url}/u/admin-1/v1/messages`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({model: 'x', messages: [{role: 'user', content: 'hi'}]}),
    })
    assert.equal(res.status, status, `${status} from upstream → ${status} from broker (no remap)`)
    await close(); restoreFetch()
}
```

> **Test-harness convention.** Note this file uses **bare `tsx` + `node:assert/strict`**, NOT Vitest (see line 1-2 of the file: `import assert from 'node:assert/strict'`). All Phase 45 test extensions in the broker module must follow this same harness. Only `usage-tracking/` uses Vitest (`expect(...)` style at `usage-tracking/database.test.ts:42`).

---

### C2 — `sdk-agent-runner-integrity.test.ts:33` (BASELINE_SHA re-pin)

**Analog:** self (lines 28-33 = the previous Phase 40 re-pin block — exact precedent for the format)
**File:** `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts`

**Current lines 28-33 (the audit comment block that already shows the re-pin format):**
```typescript
// Baseline SHA originally recorded in .planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md Section 5.
// BASELINE updated 2026-04-30 by v29.3 Phase 40 (homeOverride addition for per-user OAuth isolation).
// See .planning/phases/40-per-user-claude-oauth-home-isolation/40-CONTEXT.md D-40-02 / D-40-11.
// Computed via: git hash-object nexus/packages/core/src/sdk-agent-runner.ts
const BASELINE_SHA = '623a65b9a50a89887d36f770dcd015b691793a7f';
```

**The C2 patch — REPLACE the whole 4-line comment block + the constant** (audit-only, source byte-identical):
```typescript
// Baseline SHA originally recorded in .planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md Section 5.
// BASELINE updated 2026-04-30 by v29.3 Phase 40 (homeOverride addition for per-user OAuth isolation).
// BASELINE re-pinned 2026-05-01 by v29.4 Phase 45 (Carry-Forward C2). Source byte-identical;
// SHA moved from 623a65b9... to 4f868d31... due to v43.x model-bump drift commits:
//   - 9f1562be feat(43.12): bump tierToModel to Claude 4.X (Opus 4.7 / Sonnet 4.6)
//   - 47890a85 feat(43.10): inject model identity line — fix Claude 3.5 Sonnet hallucination
//   - [list every v43.x commit that touched sdk-agent-runner.ts — fill from `git log nexus/packages/core/src/sdk-agent-runner.ts` between 623a65b9 and 4f868d31]
// See .planning/phases/40-per-user-claude-oauth-home-isolation/40-CONTEXT.md D-40-02 / D-40-11.
// Computed via: git hash-object nexus/packages/core/src/sdk-agent-runner.ts
const BASELINE_SHA = '4f868d31...'; // ← REPLACE WITH ACTUAL CURRENT git hash-object OUTPUT
```

**Hard guard (per pitfall B-11):** the C2 commit MUST satisfy
```bash
git diff --shortstat HEAD~1 -- nexus/packages/core/src/sdk-agent-runner.ts
```
returning EMPTY. If the diff is non-empty, the commit silently mixed a source change into an "audit-only" commit — abort & re-do the commit. Plan action MUST include a verification step that runs the above command and asserts empty output before staging.

> **Sequencing constraint.** C2 lands FIRST in any phase that also touches `sdk-agent-runner.ts` (e.g. future Phase 46 / A2 Branch 2). C2's BASELINE_SHA captures the *current* sacred-file SHA *before* any v29.4 source edit. Otherwise the integrity test would fail twice (once for v43.x drift, once for the new edit). For Phase 45 in isolation, C2 is the only sacred-file-adjacent change.

---

### C3 — `common.ts` (httpOnlyPaths additions, lines 167-194)

**Analog:** self — every existing entry is the canonical shape
**File:** `livos/packages/livinityd/source/modules/server/trpc/common.ts`

**Existing nearby entries — lines 167-173 (Claude auth cluster — alphabetical-ish neighborhood for `claudePerUserStartLogin`):**
```typescript
// Claude auth and provider management -- use HTTP to avoid WS connection dependency
'ai.setClaudeApiKey',
'ai.claudeStartLogin',
'ai.claudeSubmitCode',
'ai.claudeLogout',
'ai.setPrimaryProvider',
'ai.setComputerUseAutoConsent',
```

**Extension recipe — INSERT three new entries** (drop after line 173, before the existing `'ai.executeSubagent'` block):
```typescript
// Claude auth and provider management -- use HTTP to avoid WS connection dependency
'ai.setClaudeApiKey',
'ai.claudeStartLogin',
'ai.claudeSubmitCode',
'ai.claudeLogout',
'ai.setPrimaryProvider',
'ai.setComputerUseAutoConsent',
// v29.4 Phase 45 C3 — Phase 40 per-user Claude OAuth + Phase 44 usage routes:
// long-running mutations / queries that must survive WS reconnect after
// `systemctl restart livos`. Mirrors the same WS-reconnect-hang reasoning as
// system.update / docker.scanImage / ai.claudeStartLogin above.
'ai.claudePerUserStartLogin',
'usage.getMine',
'usage.getAll',
```

> **Naming check (planner — verify before writing).** The pattern-mapping context says exactly `'claudePerUserStartLogin'`. The actual route is exposed under the `ai.*` namespace at `ai/routes.ts:403` — so the literal string in `httpOnlyPaths` must match the namespaced form `'ai.claudePerUserStartLogin'` (NOT bare `'claudePerUserStartLogin'`). Cross-check by reading the surrounding entries: `'ai.claudeStartLogin'`, `'ai.claudeSubmitCode'` — all `ai.*`-prefixed. Same applies to `usage.getMine` / `usage.getAll` which are correctly namespaced (the `usage` router lives at `usage-tracking/routes.ts`).

> **Test gap analog.** `common.ts` has no existing test that asserts specific path presence — but pitfall X-04 demands one. Closest harness is `livinity-broker/integration.test.ts`'s ephemeral express + node-assert/strict pattern. The C3 test should:
> 1. Import the `httpOnlyPaths` constant from `common.ts` and assert each of the 3 new strings is present (a static-array test — no server lifecycle needed).
> 2. Optionally: a fuller restart-livinityd-mid-session integration test that POSTs each route while WS is mid-reconnect — but this requires a real livinityd boot harness which doesn't exist today as a reusable fixture. **Recommend:** start with the static-array test (cheap, in-tree); defer the full restart test to UAT on Mini PC.

---

### C4 — `openai-sse-adapter.ts` (emit usage chunk before [DONE])

**Analog:** self — the existing `final_answer` block at lines 102-111 + the sync usage shape at `openai-translator.ts:177-194`
**File:** `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts`

**Existing `final_answer` terminal block — lines 102-111 (the byte-region C4 modifies):**
```typescript
} else if (event.type === 'final_answer') {
    // If we never sent a chunk (no text streamed), emit role chunk first so OpenAI SDK is happy
    if (!firstChunkSent) {
        firstChunkSent = true
        writeOpenAISseChunk(res, makeChunk({role: 'assistant', content: ''}, null))
    }
    // Terminal chunk
    writeOpenAISseChunk(res, makeChunk({}, 'stop'))
    if (!res.writableEnded) res.write(OPENAI_SSE_DONE)
    finalized = true
}
```

**Existing chunk-write primitive — lines 40-45 (re-use as-is for the new usage chunk):**
```typescript
export function writeOpenAISseChunk(res: Response, chunk: OpenAIChatCompletionChunk): void {
    if (res.writableEnded) return
    res.write(`data: ${JSON.stringify(chunk)}\n\n`)
    const flushable = res as unknown as {flush?: () => void}
    if (typeof flushable.flush === 'function') flushable.flush()
}
```

**Sibling reference — `openai-translator.ts:177-194` (the sync `usage` shape that streaming MUST mirror):**
```typescript
const promptTokens = result.totalInputTokens || 0
const completionTokens = result.totalOutputTokens || 0
// ... shape:
usage: {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
}
```

**Type-shape extension — `openai-sse-adapter.ts:20-30` (the `OpenAIChatCompletionChunk` interface MUST gain optional `usage`):**
```typescript
export interface OpenAIChatCompletionChunk {
    id: string
    object: 'chat.completion.chunk'
    created: number
    model: string
    choices: Array<{
        index: 0
        delta: {role?: 'assistant'; content?: string}
        finish_reason: OpenAIFinishReason | null
    }>
    /** Phase 45 C4: present ONLY on the final chunk (with finish_reason: 'stop'). */
    usage?: {prompt_tokens: number; completion_tokens: number; total_tokens: number}
}
```

**The C4 patch — modify the `finalize()` method + the `final_answer` block + the `error` block to emit ONE final chunk with `usage` BEFORE `OPENAI_SSE_DONE`:**

Per OpenAI streaming spec (and pitfall B-13), the wire order is:
```
data: {"...","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":N,"completion_tokens":M,"total_tokens":K}}\n\n
data: [DONE]\n\n
```

→ The chunk with `finish_reason: 'stop'` AND the `usage` field is the SAME chunk. The existing `makeChunk({}, 'stop')` at line 109 already emits the terminal chunk; it just needs the `usage` field tacked on:

```typescript
function makeChunk(
    delta: {role?: 'assistant'; content?: string},
    finishReason: OpenAIFinishReason | null,
    usage?: {prompt_tokens: number; completion_tokens: number; total_tokens: number},
): OpenAIChatCompletionChunk {
    const chunk: OpenAIChatCompletionChunk = {
        id, object: 'chat.completion.chunk', created, model: requestedModel,
        choices: [{index: 0, delta, finish_reason: finishReason}],
    }
    if (usage) chunk.usage = usage
    return chunk
}
```

→ Then `finalize(stoppedReason?, usage?)` and the `final_answer` / `error` paths call `makeChunk({}, 'stop', usage)` — passing `usage` only for the terminal chunk.

> **Source-of-truth question for the planner.** Where does `usage` come from in the streaming path? The `createSdkAgentRunnerForUser` generator at `agent-runner-factory.ts:103-115` currently sets `totalInputTokens: 0` and `totalOutputTokens: 0` on the final result (see comment line 111: "not surfaced by /api/agent/stream — Phase 44 may augment"). **Phase 45 C4 may need to also surface real token counts from the upstream nexus stream — OR** rely on the existing `parseUsageFromSseBuffer` capture middleware (`usage-tracking/parse-usage.ts:111-183`) which already scans the SSE buffer for terminal usage chunks. Recommend: emit zero-token usage chunk for now (satisfies the spec — chunk PRESENT) and let the capture middleware extract real numbers via `parseUsageFromSseBuffer` (which lines 162-172 already handle: "scan for a chunk that has usage at top level" — the C4 emission slots in cleanly here). This decouples wire-format compliance from token-accuracy. **The planner should call this out as a known sub-issue and either ship zero-token usage chunks OR plumb real counts through `agent-runner-factory.ts` — the success criterion only requires the chunk to be PRESENT with non-zero `prompt_tokens` AND `completion_tokens`, so real-count plumbing IS in scope.**

---

### C4 test — `openai-sse-adapter.test.ts` extension (usage-chunk-presence assertion)

**Analog:** self (Tests 3 + 4 at lines 82-95 — the existing terminal-chunk + DONE assertion)
**File:** `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.test.ts`

**Existing assertion shape — lines 82-95:**
```typescript
{
    const {res, getBuffer} = makeFakeRes()
    const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
    adapter.onAgentEvent({type: 'chunk', data: 'X'} as AgentEvent)
    adapter.onAgentEvent({type: 'final_answer', data: 'X'} as AgentEvent)
    const chunks = parseDataChunks(getBuffer())
    // Expect: 1 content chunk + 1 terminal chunk + DONE sentinel = 3 entries
    assert.equal(chunks.length, 3)
    const terminal = chunks[1]!
    assert.deepEqual(terminal.json.choices[0].delta, {}, 'terminal delta is empty')
    assert.equal(terminal.json.choices[0].finish_reason, 'stop')
    assert.equal(chunks[2]!.json, null, 'last entry is [DONE]')
    assert.equal(chunks[2]!.raw, 'data: [DONE]')
}
```

**C4 extension — Test 11 (new) asserts `usage` is present on the terminal chunk:**
```typescript
{
    const {res, getBuffer} = makeFakeRes()
    const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
    adapter.onAgentEvent({type: 'chunk', data: 'hello'} as AgentEvent)
    adapter.finalize('complete', {prompt_tokens: 7, completion_tokens: 3, total_tokens: 10})
    const chunks = parseDataChunks(getBuffer())
    const terminal = chunks.find((c) => c.json && c.json.choices[0].finish_reason !== null)
    assert.ok(terminal, 'terminal chunk present')
    assert.deepEqual(terminal.json.usage, {prompt_tokens: 7, completion_tokens: 3, total_tokens: 10},
        'usage on terminal chunk per OpenAI spec')
    // Wire-order check (B-13 mitigation): usage chunk MUST come BEFORE [DONE]
    const buffer = getBuffer()
    const usageIdx = buffer.indexOf('"usage"')
    const doneIdx = buffer.indexOf('[DONE]')
    assert.ok(usageIdx < doneIdx, 'usage chunk emitted before [DONE]')
    ok('Test 11: terminal chunk carries usage{prompt,completion,total} BEFORE [DONE]')
}
```

---

## Shared Patterns

### Test-harness convention (broker module)
**Source:** `livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts:1-2` + `openai-sse-adapter.test.ts:1-3`
**Apply to:** all Phase 45 test extensions for C1, C4
```typescript
import assert from 'node:assert/strict'
// NO Vitest, NO `expect()` — bare tsx + node:assert
// Run with: npx tsx <test-file>
```
**Counterexample (do NOT use this for broker tests):** `usage-tracking/database.test.ts:42` uses Vitest's `expect(sql).toMatch(...)` — that's the `usage-tracking/` module convention, not broker's.

### Sacred-file ritual (per Phase 40 D-40-01)
**Source:** `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts:28-33`
**Apply to:** C2 (the only Phase 45 fix touching the sacred-file integrity surface)
- Pre-edit SHA capture: `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` BEFORE any `git add`
- Audit comment block: cite every drift commit between previous BASELINE and new BASELINE
- Post-commit gate: `git show <commit> -- nexus/packages/core/src/sdk-agent-runner.ts` MUST be empty for an "audit-only" commit (B-11 mitigation)

### Strict 429-only allowlist (per pitfall B-09)
**Source:** new pattern (no prior in-tree analog — this IS the C1 contribution)
**Apply to:** C1 (both the Anthropic-side `router.ts:157` catch and the OpenAI-side `openai-router.ts:234` catch)
- Forward `429` verbatim WITH `Retry-After` header preserved byte-identical (no parsing — pitfall B-10)
- Forward all other status codes (400/401/403/500/502/503/504/529) at their actual upstream code, NOT remapped
- Reserve `500` for genuinely-internal broker errors (translation failure, runner crash) where no upstream `Response` exists

### OpenAI streaming wire-order (per pitfall B-13)
**Source:** OpenAI Streaming Chat Completion spec + `openai-sse-adapter.ts:33` (`OPENAI_SSE_DONE = 'data: [DONE]\n\n'` constant)
**Apply to:** C4
- Order: `data: <chunk-with-finish_reason+usage>\n\n` THEN `data: [DONE]\n\n`
- Same chunk carries BOTH `finish_reason: 'stop'` AND `usage: {...}` — do NOT split into two chunks
- The `choices` array MUST be present (OpenAI clients reject chunks without `choices`)

### httpOnlyPaths invariant (per X-04)
**Source:** `common.ts:8-194` — every existing entry shows the convention (string literal, namespaced as `<router>.<route>`, with cluster comment)
**Apply to:** C3
- Routes are referenced by their FULLY-NAMESPACED path (`ai.claudePerUserStartLogin`, NOT bare `claudePerUserStartLogin`)
- Group new entries under a comment that names the milestone phase + reasoning ("v29.4 Phase 45 C3 — ...")

---

## No Analog Found

None — every Phase 45 fix has a same-file or sibling-file analog in the codebase. This is the typical "carry-forward sweep" character: surgical edits to existing surfaces, no greenfield modules.

The closest thing to a "no analog" is C3's restart-livinityd-mid-session test — the broker's ephemeral-express harness is a *partial* analog (gives the request shape) but doesn't cover livinityd lifecycle (kill / restart / WS reconnect). **Recommendation:** for Phase 45, ship a static-array test that asserts the 3 strings are present in `httpOnlyPaths`. Defer the full lifecycle integration test to UAT on Mini PC (mirrors v29.3 broker UAT-deferred pattern from pitfall W-20).

---

## Build Order Recommendation (parallel-safe within Phase 45)

All 4 carry-forwards are independent. Recommended **wave structure** for clean atomic commits + parallel-safe execution:

```
Wave 1 (foundational, lands first — establishes pre-conditions for Wave 2/3)
  └── C2: BASELINE_SHA re-pin (audit-only, no source change)
        └── DEPENDS ON: nothing
        └── BLOCKS: any future sacred-file edit (e.g. Phase 46 / A2 Branch 2)
        └── Verification gate: `git diff --shortstat HEAD~1 -- nexus/.../sdk-agent-runner.ts` returns empty

Wave 2 (independent surgical fixes — can land in any order or parallel commits)
  ├── C1: broker 429 forwarding + Retry-After preservation
  │     ├── Files: router.ts:157, agent-runner-factory.ts:75 + new UpstreamHttpError
  │     ├── Tests: integration.test.ts (Test 6 + parameterized Test 7)
  │     └── DEPENDS ON: nothing — purely additive error-class plumbing
  │
  ├── C3: httpOnlyPaths additions
  │     ├── File: common.ts (3 new strings + cluster comment)
  │     ├── Tests: static-array assertion (cheapest possible) + UAT note for restart test
  │     └── DEPENDS ON: nothing — pure routing config
  │
  └── C4: OpenAI SSE usage chunk emission
        ├── Files: openai-sse-adapter.ts (interface + makeChunk + finalize) + (optional) agent-runner-factory.ts for real token plumbing
        ├── Tests: openai-sse-adapter.test.ts (Test 11 — usage-presence + wire-order)
        └── DEPENDS ON: nothing — same harness as C1's test extensions (mock-fetch ≠ touched here, pure adapter unit)

Wave 3 (nothing — Phase 45 ends with Wave 2)
```

**Test-bundle amortization:** C1 and C4 both extend integration tests in the same module (`livos/packages/livinityd/source/modules/livinity-broker/`). The `mockUpstreamSse` helper at `integration.test.ts:108-129` is the shared-fixture seed — C1's new `mockUpstreamError` helper sits next to it. Implement C1 first to add `mockUpstreamError`, then C4 can reuse the harness shape (though C4's tests are unit-level and don't actually need `mockUpstreamError` — they only need the existing `makeFakeRes()` from `openai-sse-adapter.test.ts:9-21`).

**Commit cadence recommendation:** 4 separate commits (one per carry-forward). C2 commit message must literally say "audit-only" + cite the empty-diff-shortstat verification (per B-11). Push to `origin/master` after each commit (per W-17 — "44+ commits ahead" lesson from v29.3).

---

## Metadata

**Analog search scope:**
- `livos/packages/livinityd/source/modules/livinity-broker/` (broker module — C1, C4)
- `livos/packages/livinityd/source/modules/server/trpc/` (tRPC routing — C3)
- `livos/packages/livinityd/source/modules/usage-tracking/` (sibling for usage shape reference)
- `nexus/packages/core/src/providers/` (sacred-file integrity test — C2)
- `nexus/packages/core/src/` (sacred-file location reference)

**Files scanned:**
- `livinity-broker/router.ts` (171 lines, full)
- `livinity-broker/agent-runner-factory.ts` (137 lines, full)
- `livinity-broker/openai-router.ts` (245 lines, full)
- `livinity-broker/openai-sse-adapter.ts` (140 lines, full)
- `livinity-broker/integration.test.ts` (302 lines, full)
- `livinity-broker/openai-sse-adapter.test.ts` (158 lines, full)
- `livinity-broker/openai-types.ts` (80 lines, partial — types section)
- `server/trpc/common.ts` (195 lines, full)
- `usage-tracking/parse-usage.ts` (lines 75-183, partial)
- `usage-tracking/routes.ts` (grep-only — confirmed `getMine` / `getAll` route names)
- `usage-tracking/database.test.ts` (grep-only — Vitest harness contrast)
- `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` (74 lines, full)
- `livinity-broker/openai-translator.ts` (grep — usage shape lines 177-194)

**Pattern extraction date:** 2026-05-01

**Sources cross-referenced:**
- `.planning/phases/45-carry-forward-sweep/45-CONTEXT.md` — phase boundary + success criteria
- `.planning/research/v29.4-ARCHITECTURE.md` — file-landing-zone verification (especially C3 path correction: NOT `nexus/packages/api/src/common.ts`, IS `livos/packages/livinityd/source/modules/server/trpc/common.ts:8`)
- `.planning/research/v29.4-PITFALLS.md` — B-09 (status-code allowlist), B-10 (Retry-After verbatim), B-11 (sacred-file diff empty), B-12 (httpOnlyPaths), B-13 (SSE chunk order), W-20 (no mocking external binaries — informs UAT deferral for C3 restart test)
