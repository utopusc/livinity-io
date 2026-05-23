---
phase: 199
plan: 07
subsystem: liv-ai-ui (header bar + Redis-backed active model persistence)
tags: [header-bar, model-picker-mount, redis-active-model, trpc-mutation, persistence, wave3-last]
requires: [199-04, 199-05]
provides:
  - "<LivAiHeaderBar> component: title + LivAiModelPicker + '+ New conversation' (D-199-21)"
  - "Backend mastra.agent.getActiveModel: privateProcedure.query reading liv:config:active_model with coerceModel fallback (D-199-10 + D-199-24)"
  - "Backend mastra.agent.setActiveModel: adminProcedure.mutation with z.enum(ALLOWED_XAI_MODELS) input gate (D-199-10 + T-199-07-02)"
  - "httpOnlyPaths += mastra.agent.getActiveModel + mastra.agent.setActiveModel (D-199-12 / MEMORY.md WS-reconnect pitfall)"
  - "AssistantChatTransport body callback EXTENDED: body: () => ({threadId, config: {modelName: selectedModel}}) (D-199-09)"
  - "selectedModel React state hydrated from getActiveModel useQuery on mount; falls back to DEFAULT_LIV_AI_MODEL_ID"
  - "MastraRouterDeps extended with optional redis: MastraRedisClient (narrow .get/.set surface)"
  - "Boot marker '[liv-ai] Phase 199-07 — header bar + Redis-backed active model persistence …' in livinityd/source/index.ts"
affects:
  - "livos/packages/ui/src/features/liv-ai/header-bar.tsx (NEW)"
  - "livos/packages/ui/src/features/liv-ai/header-bar.test.tsx (NEW)"
  - "livos/packages/ui/src/features/liv-ai/assistant.tsx (MODIFIED — header bar mounted + tRPC wiring + body callback)"
  - "livos/packages/ui/src/features/liv-ai/assistant.test.tsx (MODIFIED — 6 new cases T6-T11)"
  - "livos/packages/livinityd/source/modules/server/trpc/mastra-router.ts (MODIFIED — 2 new procedures + redis DI)"
  - "livos/packages/livinityd/source/modules/server/trpc/mastra-router.test.ts (MODIFIED — 7 new cases T20-T26)"
  - "livos/packages/livinityd/source/modules/server/trpc/common.ts (MODIFIED — 2 new httpOnlyPaths entries)"
  - "livos/packages/livinityd/source/modules/server/trpc/common.test.ts (MODIFIED — Test 17 + Test 18)"
  - "livos/packages/livinityd/source/index.ts (MODIFIED — redis injected into createMastraRouter + boot marker)"
tech-stack:
  added: []
  patterns:
    - "MastraRedisClient narrow surface DI — only .get(key) + .set(key,value) — matches both ioredis runtime + makeRedisStub test mock"
    - "z.enum(ALLOWED_XAI_MODELS as unknown as [AllowedXaiModel, ...AllowedXaiModel[]]) zod cast — z.enum needs non-empty tuple; readonly tuple from `as const` requires explicit cast to satisfy TS"
    - "coerceModel() defense-in-depth on getActiveModel — corrupt/stale/null Redis value never escapes the allow-list (D-199-24 soft validation)"
    - "Adminprocedure gate on setActiveModel — non-admin sessions rejected at middleware before Redis touch (T-199-07-01)"
    - "Optimistic local-state flip + onSuccess refetch — picker updates immediately; ground-truth re-hydration handles concurrent operator updates (T-199-07-05)"
    - "JSX wrapper-shell pattern — new flex-column outer div hosts <LivAiHeaderBar> + the existing role='application' 2-column flex (now flex-1 to consume remaining vertical space)"
    - "AssistantChatTransport mock captures lastTransportOpts so the body callback can be invoked synchronously in tests (Tests 9 + 10 source-of-truth)"
    - "Compare-document-position DOM-order check — Test 6 proves header is sibling-before app-shell without depending on classname coupling"
key-files:
  created:
    - "livos/packages/ui/src/features/liv-ai/header-bar.tsx (64 LOC)"
    - "livos/packages/ui/src/features/liv-ai/header-bar.test.tsx (145 LOC, 5 vitest cases)"
  modified:
    - "livos/packages/ui/src/features/liv-ai/assistant.tsx (+50 LOC — selectedModel state + tRPC wire-up + JSX wrap + extended body callback)"
    - "livos/packages/ui/src/features/liv-ai/assistant.test.tsx (+200 LOC — 6 new test cases + mock extensions + radix shims)"
    - "livos/packages/livinityd/source/modules/server/trpc/mastra-router.ts (+105 LOC — 2 new procedures + DI surface + empty-injection defaults)"
    - "livos/packages/livinityd/source/modules/server/trpc/mastra-router.test.ts (+135 LOC — 7 new test cases + makeRedisStub helper)"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts (+10 LOC — 2 httpOnlyPaths entries with comment block)"
    - "livos/packages/livinityd/source/modules/server/trpc/common.test.ts (+40 LOC — Test 17 + Test 18 footgun guards)"
    - "livos/packages/livinityd/source/index.ts (+4 LOC — redis injected into createMastraRouter + boot marker)"
decisions:
  - "D-199-09 honored: body callback extended to {threadId, config: {modelName: selectedModel}}"
  - "D-199-10 honored: Redis key literal 'liv:config:active_model' (pinned as REDIS_ACTIVE_MODEL_KEY const)"
  - "D-199-11 honored: getActiveModel = privateProcedure (any JWT user reads); setActiveModel = adminProcedure (admin-only write)"
  - "D-199-12 honored: both new routes added to httpOnlyPaths"
  - "D-199-20 honored: model picker MOUNTED in header bar (spawn-prompt override on RESEARCH composer-local recommendation)"
  - "D-199-21 honored: header bar ~48px tall (h-12) + title left + ModelPicker right + '+ New conversation' right"
  - "D-199-24 honored: backend getActiveModel coerces invalid/missing Redis value to DEFAULT (no 400)"
  - "INV-199-06 B-02 lock honored: mastra/index.ts UNTOUCHED — redis DI flows through mastra-router only"
  - "INV-199-03 honored: active model lives in Redis ONLY (no .env / package.json / source const drift)"
  - "T-199-07-01 mitigated: adminProcedure gate verified by Test T25 + T26 contrast"
  - "T-199-07-02 mitigated: zod enum + redis MUST NOT be touched on invalid input — verified by Test T24"
  - "T-199-07-03 mitigated: both routes in httpOnlyPaths verified by common.test.ts Test 17"
  - "T-199-07-05 accepted: onSuccess refetch keeps the picker in sync after concurrent operator updates"
metrics:
  duration: "~12 minutes"
  task_count: 4
  file_count: 9
  loc_added: ~700
  loc_removed: ~5
  tests_added: 14 (7 mastra-router T20-T26 + 2 common Test 17/18 + 5 header-bar + 6 assistant Tests 6-11 = 20; net add 14 after counting baseline shifts)
  tests_passing: "21/21 mastra-router + 18/18 common + 11/11 assistant + 5/5 header-bar + 112/112 full liv-ai UI suite"
  completed: "2026-05-23"
---

# Phase 199 Plan 07: Header bar + Redis-backed active model persistence Summary

Land the **Liv AI header bar** above the 2-column layout, mount the Phase 199-04 `<LivAiModelPicker />` in the right cluster, and close the **end-to-end Redis persistence loop** (UI ↔ tRPC ↔ Redis ↔ chat-route body ↔ provider-router dynamic-model resolver). This is the LAST Wave 3 plan; Wave 4 (Plan 199-08) deploys to Mini PC and walks the 10-step operator UAT.

The header bar consumes Plan 199-04's pure-UI `<LivAiModelPicker value onChange />` and Plan 199-05's body-callback transport form — both designed in advance to make this plan a wiring-only operation. New backend procedures `mastra.agent.getActiveModel` (private read) + `mastra.agent.setActiveModel` (admin write) front the `liv:config:active_model` Redis key with the `coerceModel()` allow-list filter Plan 199-02 shipped, so a corrupt or pre-existing value never escapes as a bogus model id.

## Commit Trail

| # | Commit | Type | Subject |
|---|--------|------|---------|
| 1 | `5fef7219` | test | `test(199-07): assert getActiveModel + setActiveModel + httpOnlyPaths (RED)` |
| 2 | `ded0f757` | feat | `feat(199-07): mastra.agent.getActiveModel + setActiveModel + httpOnlyPaths (GREEN)` |
| 3 | `bc4b8f98` | feat | `feat(199-07): LivAiHeaderBar component with model picker + new-thread CTA` |
| 4 | `3bc8a07a` | feat | `feat(199-07): mount LivAiHeaderBar in assistant; selectedModel state hydrated from Redis via tRPC; body.config.modelName threaded` |
| 5 | `3a9b40f8` | chore | `chore(199-07): boot marker for Phase 199-07 header bar + active model persistence` |

All 5 commits passed the sacred-sha pre-commit hook: `[sacred-sha] PASS: 20 files verified`.

## Inserted Code Highlights

### `header-bar.tsx` (full file — 64 LOC)

```tsx
import {PlusIcon} from 'lucide-react'

import {Button} from '@/shadcn-components/ui/button'

import {LivAiModelPicker} from './model-picker'
import type {LivAiModelId} from './models'

export interface LivAiHeaderBarProps {
    selectedModel: LivAiModelId
    onModelChange: (next: LivAiModelId) => void
    onNewThread: () => void
}

export function LivAiHeaderBar({
    selectedModel,
    onModelChange,
    onNewThread,
}: LivAiHeaderBarProps) {
    return (
        <header
            className='flex h-12 items-center justify-between border-b bg-background px-4'
            data-testid='liv-ai-header-bar'
        >
            <h1 className='text-base font-medium' data-testid='liv-ai-header-title'>
                Liv AI
            </h1>
            <div className='flex items-center gap-2'>
                <LivAiModelPicker value={selectedModel} onChange={onModelChange} />
                <Button
                    variant='ghost'
                    size='sm'
                    onClick={onNewThread}
                    className='gap-1.5'
                    data-testid='liv-ai-header-new-thread'
                >
                    <PlusIcon className='size-4' />
                    New conversation
                </Button>
            </div>
        </header>
    )
}

export default LivAiHeaderBar
```

### `assistant.tsx` — selectedModel state + hydration block

```tsx
const [selectedModel, setSelectedModel] = useState<LivAiModelId>(
    DEFAULT_LIV_AI_MODEL_ID,
)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trpcAny = trpcReact as any
const activeModelQuery = trpcAny.mastra?.agent?.getActiveModel?.useQuery?.()
useEffect(() => {
    const next = activeModelQuery?.data?.modelName as LivAiModelId | undefined
    if (next) {
        setSelectedModel(next)
    }
}, [activeModelQuery?.data?.modelName])
const setActiveModelMutation = trpcAny.mastra?.agent?.setActiveModel?.useMutation?.({
    onSuccess: () => activeModelQuery?.refetch?.(),
})
const handleModelChange = (next: LivAiModelId) => {
    setSelectedModel(next)
    setActiveModelMutation?.mutate?.({modelName: next})
}
```

### `assistant.tsx` — extended body callback

```ts
body: () => ({threadId: currentThreadId, config: {modelName: selectedModel}}),
```

### `assistant.tsx` — header bar mount

```tsx
<div className='flex h-full flex-col overflow-hidden'>
    <LivAiHeaderBar
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        onNewThread={onSwitchToNewThread}
    />
    <div
        role='application'
        aria-label='Liv AI chat'
        className='flex flex-1 overflow-hidden'
    >
        {/* existing ThreadList sidebar + main 2-column children unchanged */}
    </div>
</div>
```

### `mastra-router.ts` — new procedure hunks

```ts
// MastraRouterDeps surface widened:
export interface MastraRedisClient {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<unknown>
}

export interface MastraRouterDeps {
    livOSMastra: LivOSMastra
    approvalManager: ApprovalManager
    redis?: MastraRedisClient  // Phase 199-07 (optional for back-compat)
}

const REDIS_ACTIVE_MODEL_KEY = 'liv:config:active_model'

// Inside createMastraRouter → router({agent: router({ ... }):
getActiveModel: privateProcedure.query(async () => {
    if (!deps.redis) {
        throw new TRPCError({code: 'PRECONDITION_FAILED', message: '…'})
    }
    try {
        const raw = await deps.redis.get(REDIS_ACTIVE_MODEL_KEY)
        const modelName = coerceModel(raw)
        return {modelName}
    } catch (err) { /* redactError + INTERNAL_SERVER_ERROR */ }
}),

setActiveModel: adminProcedure
    .input(
        z.object({
            modelName: z.enum(
                ALLOWED_XAI_MODELS as unknown as [
                    AllowedXaiModel,
                    ...AllowedXaiModel[],
                ],
            ),
        }),
    )
    .mutation(async ({input}) => {
        if (!deps.redis) {
            throw new TRPCError({code: 'PRECONDITION_FAILED', message: '…'})
        }
        try {
            await deps.redis.set(REDIS_ACTIVE_MODEL_KEY, input.modelName)
            return {modelName: input.modelName}
        } catch (err) { /* redactError + INTERNAL_SERVER_ERROR */ }
    }),
```

### `common.ts` — httpOnlyPaths additions

```ts
// Phase 199-07 — Liv AI active-model persistence. (full comment block in source)
'mastra.agent.getActiveModel',
'mastra.agent.setActiveModel',
```

### `livinityd/source/index.ts` — redis injection + boot marker

```ts
mastraRouterProductionInstance = createMastraRouter({
    livOSMastra,
    approvalManager,
    // Phase 199-07 — Redis client for `liv:config:active_model` persistence.
    redis: this.ai.redis,
})
…
webappLogger.info(
    '[liv-ai] Phase 199-07 — header bar + Redis-backed active model persistence (mastra.agent.getActiveModel/setActiveModel) ready',
)
```

## Test Output

### Backend (livinityd)

```
mastra-router.test.ts: 21 tests | 21 passed
  Includes T20-T26 (Phase 199-07): coverage of getActiveModel coerce-null,
  coerce-bogus, valid-value pass-through, setActiveModel write, zod reject,
  adminProcedure gate, and privateProcedure semantics with admin/member contrast.

common.test.ts: 18/18 PASS
  Test 17: 'mastra.agent.getActiveModel' + 'mastra.agent.setActiveModel' present
  Test 18: bare + half-namespaced footgun guards (mastra.agent.* convention preserved)
```

### Frontend (ui)

```
header-bar.test.tsx: 5 tests | 5 passed
  T1-T5: title literal, picker reflects selectedModel, '+' click fires onNewThread,
  outer <header> testid + landmark tag, h-12/border-b/flex layout tokens.

assistant.test.tsx: 11 tests | 11 passed
  Phase 199-05 baseline (T1-T5) — UNCHANGED, still PASS.
  Phase 199-07 (T6-T11): header above app-shell DOM order, getActiveModel hydration,
  default fallback, body envelope {threadId, config:{modelName}}, '+ New conv' rotates
  threadId, source-import surrogate (assistant.tsx wires header bar + tRPC procs).

Full liv-ai suite: 11 test files | 112 tests | 112 passed
  models.test.ts (6), model-picker.test.tsx (7), header-bar.test.tsx (5),
  assistant.test.tsx (11), empty-state.test.tsx (6), tool-renderers.test.tsx (45),
  thread-list-adapter.test.tsx (4), suggested-prompts.test.tsx (5),
  redact-args.test.ts (5), slash-commands.test.ts (9), attachment-adapter.test.ts (9)

  INV-199-05 frozen-surface lock verified: tool-renderers 45/45 PASS unchanged.
```

## Verification Gate Results

| # | Gate | Command | Result |
|---|------|---------|--------|
| 1 | mastra-router vitest | `npx vitest run source/modules/server/trpc/mastra-router.test.ts` | OK 21/21 PASS |
| 2 | common.test.ts | `npx tsx source/modules/server/trpc/common.test.ts` | OK 18/18 PASS |
| 3 | ui header-bar + assistant vitest | `npx vitest run src/features/liv-ai/header-bar.test.tsx src/features/liv-ai/assistant.test.tsx` | OK 16/16 PASS |
| 4 | full liv-ai suite | `npx vitest run src/features/liv-ai/` | OK 112/112 PASS |
| 5 | typecheck — plan files (livinityd) | `npx tsc --noEmit \| grep -E "mastra-router\|trpc/common\|livinityd/source/index.ts.*MastraRouter"` | OK ZERO errors on Plan 199-07 surface |
| 6 | typecheck — plan files (ui) | `npx tsc --noEmit \| grep -E "header-bar\|features/liv-ai/assistant"` | OK ZERO errors on Plan 199-07 surface (only pre-existing devtools-mount '@assistant-ui/react-devtools' optional-dev-dep noise) |
| 7 | build — ui | `pnpm --filter ui build` | OK EXIT 0 in 45.01s (liv-ai-content chunk 568.11 kB / 159.32 kB gzip — same baseline as Plan 199-06) |
| 8 | grep LivAiHeaderBar mount | `grep -n "LivAiHeaderBar" livos/packages/ui/src/features/liv-ai/assistant.tsx` | OK 2 hits (import L85 + JSX L344) |
| 9 | grep new procedures in mastra-router | `grep -nE "getActiveModel\|setActiveModel" livos/packages/livinityd/source/modules/server/trpc/mastra-router.ts` | OK ≥2 hits (production + empty-injection default) |
| 10 | grep new httpOnlyPaths | `grep -nE "mastra.agent.getActiveModel\|mastra.agent.setActiveModel" livos/packages/livinityd/source/modules/server/trpc/common.ts` | OK 2 hits (lines 619 + 620) |
| 11 | grep body envelope | `grep -n "config: {modelName: selectedModel}" livos/packages/ui/src/features/liv-ai/assistant.tsx` | OK 1 hit (line 297) |
| 12 | grep boot marker | `grep -n "Phase 199-07" livos/packages/livinityd/source/index.ts` | OK 2 hits (redis comment + marker line) |
| 13 | INV-199-04 no new deps | `git diff HEAD~5 -- livos/packages/{ui,livinityd}/package.json` | OK EMPTY diff |
| 14 | INV-199-06 B-02 lock | `git diff HEAD~5 -- livos/packages/livinityd/source/modules/mastra/index.ts` | OK EMPTY diff |
| 15 | INV-199-01 sacred SHA | `git ls-files -s liv/packages/core/src/sdk-agent-runner.ts` | OK `f3538e1d811992b782a9bb057d1b7f0a0189f95f` byte-identical pre/post all 5 commits |

## Success Criteria — All 13 PASS

1. OK Header bar visible at top of Liv AI window: 'Liv AI' title left + model picker right + '+ New conversation' right. h-12 (~48px / D-199-21).
2. OK Model picker reflects Redis-persisted selection on mount; default 'Grok 4.20 Fast' if Redis empty.
3. OK Selecting a model triggers `setActiveModel` mutation → Redis write to `liv:config:active_model`.
4. OK Sending a message includes `config: {modelName: selectedModel}` in the POST body (Test 9 lock).
5. OK `+ New conversation` button fires `onSwitchToNewThread` (Test 10 lock — threadId rotates in body envelope).
6. OK `getActiveModel` + `setActiveModel` tRPC procedures behave per the 7 backend tests (T20-T26).
7. OK Both new routes in httpOnlyPaths (MEMORY.md pitfall avoided — Test 17 + Test 18 lock).
8. OK adminProcedure gate on setActiveModel; privateProcedure on getActiveModel (T25 + T26 contrast).
9. OK Boot marker `[liv-ai] Phase 199-07 — header bar + Redis-backed active model persistence …` logs.
10. OK Plan 199-05 assistant tests still PASS (T1-T5 — INV-199-05 + INV-199-08 hold).
11. OK Sacred SHA hook PASSES every commit (5/5 — `[sacred-sha] PASS: 20 files verified`).
12. OK `mastra/index.ts` untouched (INV-199-06 B-02 lock).
13. OK Zero new top-level deps (INV-199-04).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test T26 originally tried `makeNonAdminCtx()` (bypass=false) — failed with "Invalid token"**

- **Found during:** Task 1 GREEN test run.
- **Issue:** The plan T26 says "getActiveModel callable by non-admin (privateProcedure semantics)". The existing `makeNonAdminCtx()` sets `dangerouslyBypassAuthentication: false` AND no request token, so `isAuthenticated` middleware fails BEFORE the privateProcedure gate can be tested — every call rejects with UNAUTHORIZED regardless of role. This conflates "unauthenticated" with "non-admin authenticated".
- **Fix:** Built a `memberCtx` inside T26 that spreads `makeNonAdminCtx()` and overrides `dangerouslyBypassAuthentication: true`. This skips token verification but keeps `currentUser.role: 'member'`, isolating the test to the privateProcedure-vs-adminProcedure contrast. Added a defense-in-depth assertion in the same test: the SAME member caller must be REJECTED by `setActiveModel` (adminProcedure). One test now proves both halves of the gate contract.
- **Files modified:** `livos/packages/livinityd/source/modules/server/trpc/mastra-router.test.ts` (T26 body).
- **Commit:** Folded into `ded0f757` (GREEN — test fix lands with the implementation).
- **Type:** Rule 1 (the original RED test was wrong about the auth gate boundary).

**2. [Rule 1 - Bug] Test 11 source-import regex `/getActiveModel\.useQuery/` didn't match `?.` chaining**

- **Found during:** Task 3 GREEN test run.
- **Issue:** The codebase trpcReact pattern uses optional chaining (`trpcAny.mastra?.agent?.getActiveModel?.useQuery?.()`) — the literal `?.` between procedure name and `.useQuery` defeated the simple regex.
- **Fix:** Updated regex to `/getActiveModel\??\.useQuery/` (optional `?` before the dot), keeping the source-import surrogate semantics intact while accepting the existing optional-chaining style. Same fix applied to the `setActiveModel\??\.useMutation` regex.
- **Files modified:** `livos/packages/ui/src/features/liv-ai/assistant.test.tsx` (Test 11 regex).
- **Commit:** Folded into `3bc8a07a` (Task 3 GREEN — test and implementation land together).
- **Type:** Rule 1 (the RED regex was too strict to match the production code shape).

### Out-of-scope discoveries (NOT fixed)

None. Plan 199-07 modified 9 files exactly as planned (2 new + 7 modified). No scope spillover.

### Authentication gates

None — fully local execution.

### Documentation deviations

None.

## Threat Model Outcome

All 5 plan threats held:

- **T-199-07-01** (E — setActiveModel privilege escalation): Mitigated. `adminProcedure` middleware rejects non-admin callers BEFORE the procedure body runs (verified by Test T25 — non-admin call rejects, redis.set not invoked). Test T26 strengthens the proof by showing an authenticated member can READ via `getActiveModel` but CANNOT write via `setActiveModel` — contrast assertion proves the two procedures have intentionally different gates.

- **T-199-07-02** (T — tampered modelName Redis write): Mitigated. `z.object({modelName: z.enum(ALLOWED_XAI_MODELS as unknown as [AllowedXaiModel, ...AllowedXaiModel[]])})` rejects any value outside the 4-id allow-list at the zod parse step (BAD_REQUEST). Test T24 asserts the `'rm -rf /'` payload triggers `.rejects.toThrow()` AND that `redis.set` is NOT called — defense-in-depth: even if zod were bypassed, the cleanup at read time via `coerceModel()` would mask the corruption.

- **T-199-07-03** (D — tRPC mutation hangs on WebSocket transport): Mitigated. Both `mastra.agent.getActiveModel` and `mastra.agent.setActiveModel` added to `httpOnlyPaths` in `common.ts`. Common.test.ts Test 17 asserts presence; Test 18 catches the bare-name footgun where a future contributor might add `'getActiveModel'` instead of the namespaced path.

- **T-199-07-04** (I — active_model in shared logs): Accepted. Model ids (`grok-4.20-0309-fast` etc.) are public xAI catalogue names; persisting them in livinityd logs is harmless and aids the Plan 199-08 UAT walk (operator can grep `journalctl -u livos` after a model switch to confirm the mutation landed).

- **T-199-07-05** (T — selectedModel state out-of-sync after concurrent operator updates): Accepted. Single-user LivOS today (memory resource = 'admin'); concurrent edits unlikely. Defense-in-depth: `useMutation({onSuccess: () => activeModelQuery.refetch()})` re-hydrates the picker from ground-truth Redis after every successful write, so a stale local closure converges within one round-trip.

## Sacred SHA Verification

| Commit | Sacred-SHA Hook Output |
|--------|------------------------|
| `5fef7219` | `[sacred-sha] PASS: 20 files verified` |
| `ded0f757` | `[sacred-sha] PASS: 20 files verified` |
| `bc4b8f98` | `[sacred-sha] PASS: 20 files verified` |
| `3bc8a07a` | `[sacred-sha] PASS: 20 files verified` |
| `3a9b40f8` | `[sacred-sha] PASS: 20 files verified` |

`liv/packages/core/src/sdk-agent-runner.ts` git-blob SHA: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — byte-identical pre/post all 5 commits.

## INV-199-06 B-02 Lock Verification

`git diff HEAD~5 -- livos/packages/livinityd/source/modules/mastra/index.ts` returns **EMPTY**.

Redis access flowed through `MastraRouterDeps.redis` (mastra-router-only surface widening) instead of mutating LivOSMastra. The B-02 lock holds; future plans can continue to extend behavior via the mastra-router DI shape without touching the LivOSMastra contract.

## Forward-Link to Plan 199-08

Plan 199-08 (Mini PC deploy + 10-step operator UAT) consumes this plan's output as follows:

1. **Deploy step:** SSH to Mini PC → `bash /opt/livos/update.sh` → rsync the 9 modified files → tsx auto-picks up livinityd changes → `systemctl restart livos liv-core liv-worker liv-memory` (the ui chunk is the only build artifact — vite build emits `liv-ai-content-*.js` containing the new header bar + tRPC wiring).
2. **Boot marker grep:** `journalctl -u livos --since "1 minute ago" | grep "Phase 199-07"` should surface the line `[liv-ai] Phase 199-07 — header bar + Redis-backed active model persistence …`. If absent → wiring failed; rollback.
3. **Live tRPC smoke test (sequential):**
   - `curl -b cookies.txt https://bruce.livinity.io/trpc/mastra.agent.getActiveModel` → expect 200 + `{result: {data: {modelName: 'grok-4.20-0309-fast'}}}` (Redis empty on first boot).
   - `curl -b cookies.txt -X POST https://bruce.livinity.io/trpc/mastra.agent.setActiveModel -H 'Content-Type: application/json' -d '{"modelName": "grok-4.3"}'` → expect 200 + `{result: {data: {modelName: 'grok-4.3'}}}`. Followed by a re-get to confirm Redis persisted.
   - Non-admin (member JWT) hits `setActiveModel` → expect 403 (adminProcedure gate live in production).
4. **UAT step 9** (mid-conversation model switch) — operator opens Liv AI in browser, picks 'Grok 4.3' from header dropdown, sends "explain MCP". Reload window → trigger still shows 'Grok 4.3' (Redis persistence — Acceptance Envelope item #12).
5. **STATE/ROADMAP flip** after UAT PASS — phase 199 marked CODE-COMPLETE + DEPLOYED, plan counter advances to 199-08 done, milestone 'Bootstrap Polish + First-Run UX' (v34.0 per init context) flips to next.

If UAT discovers a regression in the integration (e.g. Redis returns stale value across sessions, or chat-route ignores `config.modelName`), the symptom localizes to one of these three surfaces: (a) `getActiveModel` resolver path — check `journalctl` for `MastraRouterDeps.redis` injection failure; (b) `setActiveModel` write path — check Redis `MONITOR` for `liv:config:active_model` SET commands; (c) `chat-route` consumption of `config.modelName` — check Plan 199-03's `RequestContext.get('modelName')` flows into `provider-router.resolveAgentModel`.

## Self-Check: PASSED

- OK `livos/packages/ui/src/features/liv-ai/header-bar.tsx` exists (64 LOC; LivAiHeaderBar named + default export).
- OK `livos/packages/ui/src/features/liv-ai/header-bar.test.tsx` exists with 5 vitest cases.
- OK `livos/packages/ui/src/features/liv-ai/assistant.tsx` modified — imports LivAiHeaderBar + DEFAULT_LIV_AI_MODEL_ID + LivAiModelId + trpcReact; selectedModel state + useEffect hydration + handleModelChange; body callback extended with `config: {modelName: selectedModel}`; JSX wraps role='application' inside a flex-column with `<LivAiHeaderBar>` first.
- OK `livos/packages/ui/src/features/liv-ai/assistant.test.tsx` modified — 6 new Phase 199-07 test cases T6-T11; mock extensions for getActiveModel + setActiveModel + AssistantChatTransport body capture; jsdom radix shims; 11/11 PASS.
- OK `livos/packages/livinityd/source/modules/server/trpc/mastra-router.ts` modified — MastraRedisClient interface + optional redis dep; REDIS_ACTIVE_MODEL_KEY const; getActiveModel + setActiveModel production procedures with redactError + PRECONDITION_FAILED + zod enum; empty-injection defaults also extended.
- OK `livos/packages/livinityd/source/modules/server/trpc/mastra-router.test.ts` modified — 7 new test cases T20-T26 + makeRedisStub helper; 21/21 PASS.
- OK `livos/packages/livinityd/source/modules/server/trpc/common.ts` modified — 2 new httpOnlyPaths entries with comment block.
- OK `livos/packages/livinityd/source/modules/server/trpc/common.test.ts` modified — Test 17 + Test 18 (footgun guards); 18/18 PASS.
- OK `livos/packages/livinityd/source/index.ts` modified — `redis: this.ai.redis` injected into createMastraRouter + boot marker line.
- OK Commit `5fef7219` exists in `git log --oneline -7`.
- OK Commit `ded0f757` exists in `git log --oneline -7`.
- OK Commit `bc4b8f98` exists in `git log --oneline -7`.
- OK Commit `3bc8a07a` exists in `git log --oneline -7`.
- OK Commit `3a9b40f8` exists in `git log --oneline -7`.
- OK Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` byte-identical pre/post all 5 commits.
- OK INV-199-04: `git diff HEAD~5 -- livos/packages/{ui,livinityd}/package.json` returns EMPTY.
- OK INV-199-05: `tool-renderers.tsx` + `components/tool-ui/*` untouched (zero diff vs HEAD~5).
- OK INV-199-06 (B-02 lock): `livos/packages/livinityd/source/modules/mastra/index.ts` untouched (zero diff vs HEAD~5).
- OK INV-199-08: `data-testid='liv-ai-empty-state'` preserved (Plan 199-05 cases still PASS — T1 + T3 lock the testid).
