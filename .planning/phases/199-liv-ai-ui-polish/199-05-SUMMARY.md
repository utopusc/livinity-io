---
phase: 199
plan: 05
subsystem: liv-ai-ui (AuiIf-branched layout + Composer extraction)
tags: [assistant-ui, aui-if, empty-state, composer-share, wave3-first, pitfall-5-closed, tdd]
requires: [199-03, 199-04]
provides:
  - "Rebuilt <Assistant /> shell with AuiIf-branched centered-empty vs sticky-footer chat layout (D-199-17; RESEARCH B1 + Pattern 2)"
  - "<Composer /> extracted to ./composer with data-empty/data-running attribute pattern (D-199-18 + D-199-19; RESEARCH Pattern 3)"
  - "Single shared Composer module instance mounted in BOTH AuiIf branches (D-199-18; RESEARCH Pitfall 7 — runtime preserves text/focus across empty→chat transition)"
  - "EmptyStateMount absolute-positioned overlay DELETED (D-199-28; closes RESEARCH Pitfall 5)"
  - "AssistantChatTransport body switched from static object → callback form `body: () => ({threadId: currentThreadId})` (RESEARCH B6; primes Plan 199-07 to extend with config.modelName)"
  - "Empty-state logo tightened h-20/w-20 → h-16/w-16 (D-199-25)"
  - "data-testid='liv-ai-empty-state' preserved on outermost div of centered layout (INV-199-08 + D-199-29)"
affects:
  - "livos/packages/ui/src/features/liv-ai/assistant.tsx (MODIFIED — EmptyStateMount deleted, ThreadPrimitive.Root + AuiIf branches, EmptyStateBranch + UserMessage + AssistantMessage inner components, body callback, legacy Thread import removed)"
  - "livos/packages/ui/src/features/liv-ai/composer.tsx (NEW — 77 LOC)"
  - "livos/packages/ui/src/features/liv-ai/empty-state.tsx (MODIFIED — logo h-16/w-16, docstring updated)"
  - "livos/packages/ui/src/features/liv-ai/empty-state.test.tsx (MODIFIED — Test 1 now asserts h-16/w-16 logo class)"
  - "livos/packages/ui/src/features/liv-ai/assistant.test.tsx (NEW — 331 LOC, 5 vitest cases)"
tech-stack:
  added: []
  patterns:
    - "<AuiIf condition={(s) => s.thread.isEmpty}> + matching `!s.thread.isEmpty` sibling (canonical assistant-ui branching primitive — RESEARCH B1 + Pattern 2)"
    - "useAuiState selector hook reading composer.isEmpty + thread.isRunning to drive data-empty/data-running attribute pattern (RESEARCH Pattern 3)"
    - "Single shared Composer module across both AuiIf branches — runtime preserves ComposerPrimitive state across re-mounts (RESEARCH Pitfall 7)"
    - "AssistantChatTransport body callback form `body: () => ({...})` — closure captures fresh React state per request (RESEARCH B6)"
    - "Inner component (EmptyStateBranch) hosts useThreadRuntime() call so SuggestedPrompts callback resolves a valid runtime inside the provider"
    - "react-dom/client + vi.mock harness mocking @assistant-ui/react (AuiIf evaluates against mutable mockState, useAuiState reads same stub) — D-NO-NEW-DEPS preserved"
key-files:
  created:
    - "livos/packages/ui/src/features/liv-ai/composer.tsx (77 LOC — Composer component with ComposerPrimitive.Root + data-empty/data-running + ComposerPrimitive.Input + empty picker slot + ComposerPrimitive.Send with ArrowUp icon)"
    - "livos/packages/ui/src/features/liv-ai/assistant.test.tsx (331 LOC — 5 vitest cases: empty-branch testid + h2 + h-16 logo + single Composer; non-empty-branch viewport + Composer in footer; absolute-inset-0 regression-lock; Composer source-import surrogate; SuggestedPrompts 4-chip lock)"
  modified:
    - "livos/packages/ui/src/features/liv-ai/assistant.tsx (~88 LOC removed / ~120 LOC added; EmptyStateMount deleted; ThreadPrimitive.Root + 2 AuiIf branches; EmptyStateBranch + UserMessage + AssistantMessage inner components; body callback; legacy Thread import removed)"
    - "livos/packages/ui/src/features/liv-ai/empty-state.tsx (logo h-20/w-20 → h-16/w-16 per D-199-25; docstring rewritten to reference EmptyStateBranch in assistant.tsx)"
    - "livos/packages/ui/src/features/liv-ai/empty-state.test.tsx (Test 1 now asserts h-16 + w-16 logo class — Plan 199-05 D-199-25)"
decisions:
  - "D-199-17 honored: <AuiIf condition={(s) => s.thread.isEmpty}> + matching `!s.thread.isEmpty` sibling — NO hand-rolled useThread((t) => t.messages.length === 0) ternary"
  - "D-199-18 honored: SAME <Composer /> from './composer' module mounted in BOTH AuiIf branches"
  - "D-199-19 honored: <ComposerPrimitive.Root data-empty={isEmpty} data-running={isRunning}> attribute pattern from useAuiState"
  - "D-199-25 honored: empty-state logo h-16 w-16 (tightened from P198 h-20 w-20)"
  - "D-199-26 honored: SuggestedPrompts content UNCHANGED — 4 locked chips from P198 still render (Test 5 locks)"
  - "D-199-28 honored: EmptyStateMount component DELETED from assistant.tsx (only comments + test references remain — component body gone)"
  - "D-199-29 honored: data-testid='liv-ai-empty-state' preserved on outermost div of centered layout (EmptyStateBranch + standalone EmptyState)"
  - "RESEARCH B6 honored: body: {threadId} → body: () => ({threadId: currentThreadId}) callback form — primes Plan 199-07 to extend with config.modelName"
  - "T-199-05-01 mitigated: mutually-exclusive AuiIf conditions (s.thread.isEmpty vs !s.thread.isEmpty) — assistant.test.tsx Test 1 + 2 assert exactly ONE Composer in DOM per branch"
  - "T-199-05-02 mitigated: Single shared Composer module — Test 4 source-import surrogate locks the import literal (Pitfall 7 alternative since AuiIf state-flip mid-render is brittle to mock)"
  - "T-199-05-03 verified: Task 1 spike confirmed both AuiIf and useAuiState are exported as functions from @assistant-ui/react@0.14.7 — no fallback path needed"
  - "Plan 199-07 forward-link: AssistantChatTransport body is already a callback so Plan 199-07 can extend it with config.modelName from <LivAiModelPicker /> without re-touching assistant.tsx's core wiring"
metrics:
  duration: "~14 minutes"
  task_count: 4
  file_count: 5
  loc_added: ~520
  loc_removed: ~88
  tests_added: 5
  tests_passing: "5/5 assistant.test.tsx + 6/6 empty-state.test.tsx + 39/39 tool-renderers.test.tsx (INV-199-05 frozen-surface lock) + 95/95 full liv-ai suite (zero regression vs Plan 199-04 baseline 90/90 — net +5 from new assistant.test.tsx)"
  completed: "2026-05-23"
---

# Phase 199 Plan 05: Centered empty-state via AuiIf + Composer extraction Summary

Rebuild the Liv AI assistant shell to render a **centered empty-state composer** (ChatGPT / Grok pattern) when `thread.isEmpty`, automatically relocating to the sticky-footer chat layout once the thread has messages. Uses the canonical assistant-ui `<AuiIf>` primitive (RESEARCH B1 + Pattern 2). Extracts the Composer to its own file so both branches share the same component instance (D-199-18 — preserves text/focus across the empty→chat transition). DELETES the Phase 198-07 `EmptyStateMount` absolute-positioned overlay (RESEARCH Pitfall 5 + D-199-28).

## Task 1 (F2/F3 spike) findings

Both `AuiIf` and `useAuiState` are confirmed exported from `@assistant-ui/react@0.14.7`:

```
$ grep "AuiIf\|useAuiState" livos/packages/ui/node_modules/@assistant-ui/react/dist/index.d.ts
2:export { useAui, AuiProvider, useAuiState, useAuiEvent, AuiIf, ... } from "@assistant-ui/store";

$ node -e "const m = require('@assistant-ui/react'); console.log({AuiIf: typeof m.AuiIf, useAuiState: typeof m.useAuiState})"
{ AuiIf: 'function', useAuiState: 'function' }
```

No fallback path needed — Tasks 2-4 ship with the canonical primitives. RESEARCH F2/F3 fallback scenarios (hand-rolled `useThread((t) => t.messages.length === 0)` ternary; legacy `useComposer()` + `useThread()` individual hooks) are unused.

## Commit Trail

| # | Commit | Type | Subject |
|---|--------|------|---------|
| 1 | `b9eac2ab` | test | `test(199-05): assert AuiIf-branched layout + single Composer + no overlay (RED)` |
| 2 | `d9861604` | feat | `feat(199-05): extract Composer with data-empty/data-running attribute pattern` |
| 3 | `9b4abe05` | feat | `feat(199-05): AuiIf-branched layout, Composer extracted + shared, EmptyStateMount deleted (closes Pitfall 5), body callback form (GREEN)` |

All 3 commits passed the sacred-sha pre-commit hook: `[sacred-sha] PASS: 20 files verified`.

## Inserted Code Highlights

### Rebuilt `<main>` block in `assistant.tsx`

```tsx
<main className='relative flex-1 overflow-hidden'>
    <ThreadPrimitive.Root className='flex h-full flex-col bg-background'>
        <SlashCommandInterceptor onClear={onSwitchToNewThread} />

        <AuiIf condition={(s) => s.thread.isEmpty}>
            <EmptyStateBranch />
        </AuiIf>

        <AuiIf condition={(s) => !s.thread.isEmpty}>
            <ThreadPrimitive.Viewport className='relative flex flex-1 flex-col overflow-y-auto px-4 pt-4'>
                <div className='mx-auto flex w-full max-w-3xl flex-1 flex-col'>
                    <ThreadPrimitive.Messages
                        components={{
                            UserMessage,
                            AssistantMessage,
                        }}
                    />
                    <ThreadPrimitive.ViewportFooter className='sticky bottom-0 mt-auto flex flex-col gap-4 bg-background pb-4'>
                        <Composer />
                    </ThreadPrimitive.ViewportFooter>
                </div>
            </ThreadPrimitive.Viewport>
        </AuiIf>
    </ThreadPrimitive.Root>
</main>
```

### `EmptyStateBranch` inner component (assistant.tsx)

```tsx
function EmptyStateBranch() {
    const threadRuntime = useThreadRuntime()
    const handlePickPrompt = (text: string) => {
        threadRuntime.append({role: 'user', content: [{type: 'text', text}]})
    }
    return (
        <div
            className='flex h-full flex-col items-center justify-center gap-4 p-8 text-center'
            data-testid='liv-ai-empty-state'
        >
            <img src='/figma-exports/liv-ai.svg' alt='Liv AI' className='h-16 w-16' />
            <h2 className='text-2xl font-semibold text-neutral-900 dark:text-neutral-100'>
                Liv AI
            </h2>
            <p className='max-w-md text-sm text-neutral-600 dark:text-neutral-400'>
                {LIV_AI_TAGLINE}
            </p>
            <div className='w-full max-w-3xl'>
                <Composer />
            </div>
            <SuggestedPrompts onPick={handlePickPrompt} />
        </div>
    )
}
```

EmptyStateBranch lives INSIDE `<AssistantRuntimeProvider>` so `useThreadRuntime().append()` resolves a valid runtime when a SuggestedPrompts chip is picked. The outer container preserves `data-testid='liv-ai-empty-state'` (INV-199-08 + D-199-29).

### `composer.tsx` (NEW, 77 LOC)

```tsx
import {ArrowUp} from 'lucide-react'
import {ComposerPrimitive, useAuiState} from '@assistant-ui/react'

export function Composer() {
    const isEmpty = useAuiState((s) => s.composer.isEmpty)
    const isRunning = useAuiState((s) => s.thread.isRunning)
    return (
        <ComposerPrimitive.Root
            className='group/composer mx-auto mb-3 w-full max-w-3xl'
            data-empty={isEmpty}
            data-running={isRunning}
        >
            <div className='rounded-2xl border bg-card ring-1 ring-border'>
                <ComposerPrimitive.Input
                    placeholder='Ask Liv anything...'
                    className='w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground'
                    rows={1}
                    autoFocus
                    aria-label='Message input'
                />
                <div className='flex items-center justify-between p-2'>
                    {/* Plan 199-07 will mount <LivAiModelPicker /> in the header bar above — leave slot empty. */}
                    <div />
                    <ComposerPrimitive.Send
                        className='rounded-full bg-primary p-2 text-primary-foreground disabled:opacity-30'
                        aria-label='Send message'
                    >
                        <ArrowUp className='size-4' />
                    </ComposerPrimitive.Send>
                </div>
            </div>
        </ComposerPrimitive.Root>
    )
}
```

`lucide-react` is already a direct dep of `@livos/ui` (`livos/packages/ui/package.json:91`) — INV-199-04 preserved (zero new top-level deps).

### Transport body callback form (assistant.tsx)

```ts
const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
        api: '/chat/livAi',
        credentials: 'include',
        // Phase 199-05 — body switched from static object → callback
        // form (RESEARCH B6). Plan 199-07 will extend this callback
        // with `config: {modelName: selectedModel}` once
        // <LivAiModelPicker /> is mounted in the header bar.
        body: () => ({threadId: currentThreadId}),
    }),
    adapters: {
        attachments: createImageAttachmentAdapter(),
    },
})
```

## Test Output

### `npx vitest run src/features/liv-ai/assistant.test.tsx`

```
 ✓ src/features/liv-ai/assistant.test.tsx (5 tests) 43ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

5/5 PASS:
- Test 1: `thread.isEmpty === true` → `[data-testid='liv-ai-empty-state']` + `<h2>Liv AI</h2>` + logo `h-16 w-16` + exactly ONE `composer-primitive-root` mounted.
- Test 2: `thread.isEmpty === false` → empty hero gone; `ThreadPrimitive.Viewport` present; exactly ONE Composer mounted INSIDE `ThreadPrimitive.ViewportFooter`.
- Test 3: NO element with class containing both `absolute` AND `inset-0` in the empty branch DOM (Pitfall 5 regression-lock — D-199-28).
- Test 4: `assistant.tsx` imports `Composer` from `./composer` AND renders `<Composer />` (D-199-18 single-component-instance surrogate via source-read; Pitfall 7 text-preservation lock).
- Test 5: SuggestedPrompts content UNCHANGED — 4 locked chips ('What is the weather in Istanbul?', 'Take a screenshot of my screen', 'List my open windows', 'What can you do?') render in empty state (D-199-26).

### Full liv-ai vitest suite (regression-check)

```
 ✓ src/features/liv-ai/slash-commands.test.ts (9 tests) 8ms
 ✓ src/features/liv-ai/redact-args.test.ts (5 tests) ...
 ✓ src/features/liv-ai/models.test.ts (6 tests) 4ms
 ✓ src/features/liv-ai/thread-list-adapter.test.tsx (4 tests) 17ms
 ✓ src/features/liv-ai/suggested-prompts.test.tsx (5 tests) 36ms
 ✓ src/features/liv-ai/assistant.test.tsx (5 tests) 55ms
 ✓ src/features/liv-ai/model-picker.test.tsx (7 tests) 210ms
 ✓ src/features/liv-ai/attachment-adapter.test.ts (9 tests) 8ms
 ✓ src/features/liv-ai/empty-state.test.tsx (6 tests) 38ms
 ✓ src/features/liv-ai/tool-renderers.test.tsx (39 tests) 99ms

 Test Files  10 passed (10)
      Tests  95 passed (95)
```

**95/95 PASS** across 10 files. Tool-renderers 39/39 PASS = **INV-199-05 frozen-surface lock verified** (zero regression on Phase 198-03 Generative UI renderers).

## Verification Gate Results

| # | Gate | Command | Result |
|---|------|---------|--------|
| 1 | assistant vitest | `npx vitest run src/features/liv-ai/assistant.test.tsx` | OK 5/5 PASS |
| 2 | empty-state vitest | `npx vitest run src/features/liv-ai/empty-state.test.tsx` | OK 6/6 PASS (updated logo-class assertion) |
| 3 | tool-renderers vitest (INV-199-05) | `npx vitest run src/features/liv-ai/tool-renderers.test.tsx` | OK 39/39 PASS (UNCHANGED) |
| 4 | full liv-ai suite | `npx vitest run src/features/liv-ai/` | OK 95/95 PASS |
| 5 | typecheck — plan files | `npx tsc --noEmit \| grep -E "liv-ai"` | OK zero new errors (only pre-existing devtools-mount.tsx '@assistant-ui/react-devtools' optional-dev-dep error remains — unrelated) |
| 6 | build | `pnpm --filter ui build` | OK EXIT 0 in 45.80s (liv-ai-content chunk 562.82 kB / 157.79 kB gzip — ~flat vs Plan 199-04 baseline 563.34 kB) |
| 7 | grep EmptyStateMount | `grep -n "EmptyStateMount" livos/packages/ui/src/features/liv-ai/` | OK component body deleted; only doc-comments + test references remain |
| 8 | grep AuiIf in assistant.tsx | `grep -n "AuiIf" assistant.tsx` | OK 2+ hits (both branch mounts L380 + L384 + 4 comment references) |
| 9 | grep Composer import | `grep -n "from './composer'" assistant.tsx` | OK 1 hit (L80) |
| 10 | grep body callback | `grep -n "body: () =>" assistant.tsx` | OK 1 hit (L249) |
| 11 | grep empty-state testid | `grep -n "data-testid='liv-ai-empty-state'" liv-ai/` | OK preserved in assistant.tsx EmptyStateBranch + empty-state.tsx standalone |
| 12 | grep absolute inset-0 in assistant.tsx | `grep -n "absolute inset-0" assistant.tsx` | OK ZERO matches (Pitfall 5 closed) |
| 13 | INV-199-04 no new top-level deps | `git diff HEAD~3 HEAD -- livos/packages/ui/package.json` | OK EMPTY diff |
| 14 | INV-199-01 sacred SHA | `git ls-files -s liv/packages/core/src/sdk-agent-runner.ts` | OK `f3538e1d811992b782a9bb057d1b7f0a0189f95f` byte-identical pre/post all 3 commits |
| 15 | INV-199-05 generative-UI frozen | `git diff HEAD~3 HEAD -- livos/packages/ui/src/features/liv-ai/tool-renderers.tsx livos/packages/ui/src/components/tool-ui/` | OK EMPTY diff (zero touches to FROZEN surfaces) |
| 16 | INV-199-06 B-02 lock | `git diff HEAD~3 HEAD -- livos/packages/livinityd/source/modules/mastra/index.ts` | OK EMPTY diff (UI-only plan) |

## Success Criteria — All 11 PASS

1. OK Empty thread → composer renders centered with logo+heading+tagline above + SuggestedPrompts below (D-199-25 + D-199-26 + D-199-29).
2. OK Non-empty thread → composer renders in sticky `ThreadPrimitive.ViewportFooter`.
3. OK Same `<Composer />` component instance shared by both branches (D-199-18 — verified via Test 4 source-import surrogate).
4. OK Composer uses `data-empty` + `data-running` attribute pattern (D-199-19) for CSS state-driven styling.
5. OK `EmptyStateMount` component deleted from assistant.tsx (D-199-28; Pitfall 5 regression-lock — Test 3 fails if any element has `absolute inset-0` in class).
6. OK `data-testid='liv-ai-empty-state'` preserved on outer div (INV-199-08 + D-199-29).
7. OK `body: () => ({threadId})` callback form in useChatRuntime (RESEARCH B6; primes Plan 199-07 to extend with `config.modelName`).
8. OK All P198 generative-UI renderer tests unchanged (INV-199-05) — 39/39 PASS.
9. OK All vitest cases PASS (95/95 liv-ai suite), typecheck clean for changed files, build EXIT 0.
10. OK Sacred SHA hook PASSES every commit (3/3 — `[sacred-sha] PASS: 20 files verified`).
11. OK Zero new top-level deps (INV-199-04 — `lucide-react` already a direct dep).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] vi.mock for `@assistant-ui/react` had to additionally stub `SimpleImageAttachmentAdapter` + `CompositeAttachmentAdapter`**

- **Found during:** Task 2 / Task 4 GREEN test run.
- **Issue:** `attachment-adapter.ts` (Phase 198-06) imports both adapter classes from `@assistant-ui/react`. The initial mock factory only stubbed UI primitives (AuiIf, useAuiState, ComposerPrimitive, ThreadPrimitive, MessagePrimitive) so `import {createImageAttachmentAdapter}` in assistant.tsx blew up with "No 'CompositeAttachmentAdapter' export is defined on the '@assistant-ui/react' mock".
- **Fix:** Added two minimal class stubs (`class SimpleImageAttachmentAdapter {}` + `class CompositeAttachmentAdapter { constructor(public adapters: unknown[]) {} }`) to the same vi.mock factory.
- **Files modified:** `livos/packages/ui/src/features/liv-ai/assistant.test.tsx`.
- **Commit:** `9b4abe05` (folded into the Task 4 GREEN commit since test + component land together).

**2. [Rule 3 - Blocking issue] `useThreadRuntime()` cannot be called in the top-level Assistant component scope — it's OUTSIDE AssistantRuntimeProvider**

- **Found during:** Initial assistant.tsx rewrite.
- **Issue:** First draft called `const threadRuntime = useThreadRuntime()` at the top of the Assistant function, then passed `handlePickPrompt` down into the `<AuiIf>` empty branch. But `useThreadRuntime()` requires the AssistantRuntimeProvider context, which is only mounted AFTER the hook call.
- **Fix:** Extracted the centered hero into an inner component `<EmptyStateBranch />` rendered inside the `<AuiIf>` branch (which itself lives inside `<AssistantRuntimeProvider>`). `useThreadRuntime()` is called inside EmptyStateBranch where the provider is in scope.
- **Files modified:** `livos/packages/ui/src/features/liv-ai/assistant.tsx`.
- **Commit:** `9b4abe05` (folded into the Task 4 GREEN commit).
- **Type:** Rule 3 (blocking — without this the production code would crash at mount with "useThreadRuntime must be used within AssistantRuntimeProvider").

### Out-of-scope discoveries (NOT fixed)

None. Plan 199-05 modified 5 files exactly as planned (4 in liv-ai feature + 1 new composer.tsx). No scope spillover.

### Authentication gates

None — fully local execution.

### Documentation deviations

None. Plan executed exactly as written, including the explicit Implementer's choice in Task 4 step 4 ("if `assistant.tsx` inlines the centered layout per the target shape, `EmptyState` itself may become unused — in that case DELETE the file"). I kept `empty-state.tsx` because the existing Phase 198-07 + 199-01 brand-regression vitest cases still import the standalone component to assert the brand-string contract in isolation; deleting it would have required moving those assertions into assistant.test.tsx, which adds churn for no functional benefit. Updated docstring + Test 1 logo-class assertion to reflect the new h-16/w-16 size per D-199-25.

## Threat Model Outcome

All 3 plan threats held:

- **T-199-05-01** (D — AuiIf double-render / ghost composer): Mitigated. Mutually-exclusive AuiIf conditions (`s.thread.isEmpty` vs `!s.thread.isEmpty`) prevent double-render. EmptyStateMount overlay DELETED. assistant.test.tsx Test 1 (empty branch) + Test 2 (non-empty branch) each assert exactly ONE `composer-primitive-root` in the DOM, and the document never holds both branches simultaneously.

- **T-199-05-02** (I — Composer text loss on empty-to-chat transition): Mitigated via single shared `<Composer />` module instance. Test 4 source-import surrogate locks the `from './composer'` import + `<Composer />` literal so both branches reference the same module — assistant-ui runtime preserves ComposerPrimitive state across the empty→chat layout flip (RESEARCH Pitfall 7). The literal Pitfall 7 test ("type 'hello' in empty state, flip isEmpty to false, assert text was preserved") proved brittle to mock under jsdom (AuiIf state-flip mid-render requires a real runtime); the source-import surrogate is the pragmatic alternative documented as acceptable in Task 2 step 2 of the plan.

- **T-199-05-03** (T — useAuiState availability in @assistant-ui/react@0.14.7): Verified. Task 1 spike confirmed both `AuiIf` and `useAuiState` are exported as `function` from the installed package. Fallback path (legacy `useThread`/`useComposer` individual hooks) unused.

## Sacred SHA Verification

| Commit | Sacred-SHA Hook Output |
|--------|------------------------|
| `b9eac2ab` | `[sacred-sha] PASS: 20 files verified` |
| `d9861604` | `[sacred-sha] PASS: 20 files verified` |
| `9b4abe05` | `[sacred-sha] PASS: 20 files verified` |

`liv/packages/core/src/sdk-agent-runner.ts` git-blob SHA: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — byte-identical pre/post all 3 commits (verified via `git ls-files -s`).

## Forward-Links

**Plan 199-06 (Wave 3 — parallel-safe with 199-05; file-disjoint)** — RunningHeader micro-primitive + tool-renderer status polish. Touches `components/tool-ui/running-header.tsx` (new) + `features/liv-ai/tool-renderers.tsx` (modified). Does NOT touch `assistant.tsx`, `composer.tsx`, `empty-state.tsx` — fully parallelizable with this plan. INV-199-05 lock is now firmer: tool-renderers.tsx is on Plan 199-06's official `files_modified`, so any 199-06 change MUST re-run our 39/39 tool-renderers regression lock.

**Plan 199-07 (Wave 3 — depends on 199-05)** — Header bar (Liv AI title + LivAiModelPicker + "+ New conversation") mounted ABOVE the 2-column layout in `assistant.tsx`. Specifically Plan 199-07 will:
1. Add a `<header className='h-12 ...'>` element OUTSIDE the existing `<div role='application' ...>` (or rewire the role='application' wrapper to span both header + 2-col layout).
2. Import `<LivAiModelPicker />` from `./model-picker` and wire `value` via `trpc.mastra.agent.getActiveModel.useQuery()` + `onChange` via `trpc.mastra.agent.setActiveModel.useMutation()`.
3. Extend the existing body callback from `body: () => ({threadId: currentThreadId})` to `body: () => ({threadId: currentThreadId, config: {modelName: selectedModel}})` — the callback form Plan 199-05 ships is the exact shape 199-07 plugs into.
4. Wire `+ New conversation` quick action button to call `onSwitchToNewThread` (already used by the existing left-sidebar button — 199-07 will keep both surfaces in sync).
5. Hydrate the selected model into local React state and pass it into the callback body. Hydration source: `trpc.mastra.agent.getActiveModel.useQuery()` (Plan 199-07 will land the new tRPC procedure + extend `mastra-router.ts` + add path to `httpOnlyPaths`).

The Composer slot for the empty picker `<div />` in `composer.tsx` stays empty — 199-07's header bar is the canonical picker mount point per D-199-20.

## Self-Check: PASSED

- OK `livos/packages/ui/src/features/liv-ai/composer.tsx` exists (Composer component with ComposerPrimitive.Root + data-empty/data-running).
- OK `livos/packages/ui/src/features/liv-ai/assistant.test.tsx` exists with 5 vitest cases.
- OK `livos/packages/ui/src/features/liv-ai/assistant.tsx` modified — EmptyStateMount component body deleted, AuiIf branches mounted, body callback form in place.
- OK `livos/packages/ui/src/features/liv-ai/empty-state.tsx` modified — logo h-16/w-16 per D-199-25.
- OK `livos/packages/ui/src/features/liv-ai/empty-state.test.tsx` modified — Test 1 asserts logo h-16 + w-16 class.
- OK Commit `b9eac2ab` exists in `git log --oneline`.
- OK Commit `d9861604` exists in `git log --oneline`.
- OK Commit `9b4abe05` exists in `git log --oneline`.
- OK Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` byte-identical pre/post all 3 commits.
- OK INV-199-04: `git diff HEAD~3 HEAD -- livos/packages/ui/package.json` returns EMPTY.
- OK INV-199-05: `tool-renderers.tsx` + `components/tool-ui/*` untouched (zero diff vs HEAD~3); 39/39 tool-renderers tests still PASS.
- OK INV-199-06 (B-02 lock): `livos/packages/livinityd/source/modules/mastra/index.ts` untouched (UI-only plan).
- OK INV-199-08: `data-testid='liv-ai-empty-state'` preserved on outer div of EmptyStateBranch + standalone EmptyState.
