---
phase: 200-liv-ai-ui-redesign
plan: 06
subsystem: livos/packages/ui (features/liv-ai + components/assistant-ui)
status: code-complete
completed_at: "2026-05-23"
tags: [phase-200, wave-1, thread-mount, composer-slot, english-tagline, action-bar-copy, d-200-16, d-200-18, inv-200-05]
requirements: [REQ-200-07, REQ-200-10]
provides:
  - canonical-thread-mounted-with-livaicomposer-slot
  - english-liv-ai-tagline-in-emptystate-and-threadwelcome
  - actionbar-copy-button-verified-on-canonical-thread
requires:
  - 200-02 (Thread with composerSlot prop)
  - 200-05 (LivAiComposer ready for slot injection)
affects:
  - livos/packages/ui/src/features/liv-ai/assistant.tsx (rewritten — inline ThreadPrimitive.Root composition collapsed into <Thread composerSlot> mount)
  - livos/packages/ui/src/features/liv-ai/empty-state.tsx (LIV_AI_TAGLINE: Turkish → English D-200-18)
  - livos/packages/ui/src/features/liv-ai/empty-state.test.tsx (Test 2 updated; Test 2b sentinel added for INV-200-05 diacritic guard)
  - livos/packages/ui/src/features/liv-ai/assistant.test.tsx (Tests 1/2/5 rewritten for canonical Thread mount; Test 4 extended; Thread mock now renders composerSlot)
  - livos/packages/ui/src/components/assistant-ui/thread.tsx (ThreadWelcome subtitle injection — D-200-18 third <p>, the second intentional registry-port delta after composerSlot)
metrics:
  assistant_tsx_loc_before: 433
  assistant_tsx_loc_after: 319
  assistant_tsx_loc_delta: -114
  test_files_updated: 2
  test_files_added: 0
  files_deleted: 0
  ui_tests_pass_before: 875 / 915 (40 pre-existing failed)
  ui_tests_pass_after: 876 / 916 (40 pre-existing failed; +1 net test = new INV-200-05 sentinel)
  scoped_tests_pass: 70 / 70 (empty-state 7, assistant 11, composer 7, tool-renderers 45)
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: preserved
decisions:
  - "D-200-16 closed: Thread mounted via <Thread composerSlot={<LivAiComposer .../>} /> — assistant.tsx is the single caller"
  - "D-200-18 closed: LIV_AI_TAGLINE = 'Liv AI — your operating system\\'s assistant.' (English) — replaces Turkish 'LivOS\\'un yapay zekası — ekranını yönetir, sorularına cevap verir, hatırlar.'"
key-files:
  modified:
    - livos/packages/ui/src/features/liv-ai/assistant.tsx
    - livos/packages/ui/src/features/liv-ai/assistant.test.tsx
    - livos/packages/ui/src/features/liv-ai/empty-state.tsx
    - livos/packages/ui/src/features/liv-ai/empty-state.test.tsx
    - livos/packages/ui/src/components/assistant-ui/thread.tsx
  created:
    - .planning/phases/200-liv-ai-ui-redesign/200-06-SUMMARY.md
---

# Phase 200 Plan 06: Thread Mount + English Tagline + Copy Button Verification

One-liner: Wired the canonical `<Thread />` (Plan 200-02 registry port) into
`assistant.tsx` via the `composerSlot={<LivAiComposer .../>}` prop (D-200-16),
replaced the Turkish `LIV_AI_TAGLINE` with the English D-200-18 string in
`empty-state.tsx`, and injected the same English tagline as the third `<p>`
under the canonical `ThreadWelcome` heading in `thread.tsx` (second
intentional registry-port delta after composerSlot) — operator now sees
"Hello there! / How can I help you today? / Liv AI — your operating
system's assistant." on the empty state. The Phase 199-05 inline
`ThreadPrimitive.Root + AuiIf` composition + `EmptyStateBranch` /
`UserMessage` / `AssistantMessage` local renderers are GONE; the canonical
Thread owns the entire chat surface, including `ActionBarPrimitive.Copy`
on hover (REQ-200-07 verified — shipped via Plan 200-02 verbatim port).

## What Shipped

### Task 1 — English `LIV_AI_TAGLINE` constant

`livos/packages/ui/src/features/liv-ai/empty-state.tsx`:

```diff
-export const LIV_AI_TAGLINE =
-	"LivOS'un yapay zekası — ekranını yönetir, sorularına cevap verir, hatırlar."
+export const LIV_AI_TAGLINE =
+	"Liv AI — your operating system's assistant."
```

The exported `EmptyState` component continues to render this constant in
its existing centered-hero shape (preserved for storybook / regression-
lock tests; the production assistant.tsx no longer mounts EmptyState
directly — see Task 3). Operator-visible behavior of any future
caller (dock tooltip, onboarding step copy) automatically picks up the
English wording.

`livos/packages/ui/src/features/liv-ai/empty-state.test.tsx`:

- **Test 2 (existing)** — rewritten to assert the new English wording:
  `expect(text).toContain('Liv AI')` + `expect(text).toContain("your
  operating system's assistant")`. The historical Turkish assertions
  (`ekranını yönetir`, `sorularına cevap verir`, `hatırlar`) replaced.
- **Test 2b (new)** — INV-200-05 sentinel that explicitly asserts:
  1. `LIV_AI_TAGLINE === "Liv AI — your operating system's assistant."`
  2. `LIV_AI_TAGLINE` matches no Turkish diacritics
     (`/[ğüşıöçĞÜŞİÖÇ]/` regex). Any future regression that reintroduces
     Turkish wording into the Liv AI tagline surface fails CI.

The Phase 198-07 + 199-01 brand regression-lock cases (Tests 1-3 of the
second describe block — `Liv AI` `<h2>` literal + `data-testid` lock +
`systemApps` entry name lock) are preserved verbatim.

### Task 2 — `ThreadWelcome` subtitle injection in canonical `thread.tsx`

`livos/packages/ui/src/components/assistant-ui/thread.tsx` `ThreadWelcome`:

```diff
   <p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-muted-foreground text-xl delay-75 duration-200">
     How can I help you today?
   </p>
+  {/* Phase 200-06 (D-200-18) — second intentional delta from upstream
+    registry (same justification as Plan 200-02 composerSlot). The Liv
+    AI English tagline is injected as a third <p> below the canonical
+    heading + subtitle, slightly delayed fade-in, smaller text size,
+    muted-foreground/70. INV-200-05 ENGLISH-only. */}
+  <p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-muted-foreground/70 text-sm delay-150 duration-200">
+    Liv AI — your operating system's assistant.
+  </p>
 </div>
```

This is the second intentional registry-port delta from upstream (the
first was the `composerSlot?: ReactNode` prop in Plan 200-02). Both
deltas are documented in this file's leading comments as well as the
respective SUMMARYs. The canonical heading + subtitle ("Hello there! /
How can I help you today?") are PRESERVED — the Liv AI tagline is a
third-line addition, not a replacement.

### Task 3 — `<Thread composerSlot={<LivAiComposer .../>} />` mount in assistant.tsx

`livos/packages/ui/src/features/liv-ai/assistant.tsx` (433 LOC → 319
LOC; -114 net):

**What was deleted:**

- The inline `<ThreadPrimitive.Root>` block (the entire `<main>` body) +
  the dual `<AuiIf condition={(s) => s.thread.isEmpty}>` / `<AuiIf
  condition={(s) => !s.thread.isEmpty}>` branches that Phase 199-05
  built to host the centered-empty vs sticky-footer layouts.
- The `EmptyStateBranch` component (centered hero with logo + 'Liv AI'
  heading + `LIV_AI_TAGLINE` paragraph + LivAiComposer + SuggestedPrompts).
  The canonical `ThreadWelcome` in thread.tsx now owns the empty-state
  hero surface (canonical heading + Plan 200-06 Liv AI subtitle), and
  the `ThreadSuggestions` surface ships with the canonical Thread
  (registry-port `ThreadPrimitive.Suggestions` — no Phase 198
  `SuggestedPrompts` chips for now; runtime ships zero suggestion
  entries today, deferred wire-up is acceptable).
- The local `UserMessage` and `AssistantMessage` renderers (Phase 199-05
  minimal versions) — the canonical Thread's `ThreadMessage` →
  `UserMessage` / `AssistantMessage` / `EditComposer` switch (with full
  `MessagePrimitive.GroupedParts` reasoning + tool-call routing) owns
  this now.
- Imports that became orphaned: `AuiIf`, `ComposerPrimitive`,
  `MessagePrimitive`, `ThreadPrimitive`, `useThreadRuntime` from
  `@assistant-ui/react`; `LIV_AI_TAGLINE` from `./empty-state`;
  `SuggestedPrompts` from `./suggested-prompts`.

**What was added:**

- Imports: `import {Thread} from '@/components/assistant-ui/thread'`
  (the canonical Plan 200-02 registry-ported component with the
  `composerSlot` prop already in place).
- JSX: a single `<main>` body that mounts the canonical Thread:

```tsx
<main className='relative flex-1 overflow-hidden'>
  <Thread
    composerSlot={
      <LivAiComposer
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
      />
    }
  />
</main>
```

**What was preserved verbatim:**

- `AssistantRuntimeProvider` + `useChatRuntime` setup + transport with
  the Phase 199-07 `body: () => ({threadId, config: {modelName:
  selectedModel}})` callback envelope — D-199-09 / `mid-conversation
  model switching` UAT step 9 wiring unchanged.
- `ToolRenderers` mounted BEFORE `<Thread />` — INV-200-03 generative
  UI renderers stay frozen; the canonical Thread's
  `MessagePrimitive.GroupedParts` switch routes `tool-call` parts
  through `part.toolUI ?? <ToolFallback />` so the 16 Phase 198
  `makeAssistantToolUI` registrations paint unchanged.
- `DevToolsMount` (dev-only assistant-ui DevTools panel).
- The Phase 198-05 ThreadList sidebar `<aside>` with the Phase 200-05
  "+ New conversation" button (`data-testid="liv-ai-new-thread"`) — the
  Plan 200-07 New Conversation runtime-sync fix locus.
- The `role="application" aria-label="Liv AI chat"` a11y wrapper
  (Phase 198-07 must_haves truth #5).
- The `selectedModel` `useState` hook + the Redis-backed Phase 199-07
  hydration (`getActiveModel.useQuery` + `useEffect` + `setActiveModel.
  useMutation` round-trip) — verbatim, no logic change.

### Task 3 — `assistant.test.tsx` updates (Rule 3 — blocking)

Following the plan task's "small edit; do NOT rewrite assistant.test.tsx
wholesale" directive, the following 5 tests were updated in-place (the
remaining 6 tests pass without modification, including Tests 9, 10, 11
which assert the transport-body envelope + sidebar new-conversation
button + source-import surrogate):

1. **`@/components/assistant-ui/thread` mock** rewritten from a
   trivial `<div data-testid='legacy-thread' />` stub into a
   ThreadWelcome-shaped surrogate that renders the canonical heading +
   D-200-18 subtitle + a `composerSlot`-rendering ViewportFooter so
   the LivAiComposer (which carries `LivAiModelPicker`) lands in the
   DOM for Tests 7-9 to assert against.
2. **Test 1** — rewritten from "centered hero with `liv-ai-empty-state`
   testid" to "canonical Thread root + ThreadWelcome with D-200-18
   subtitle + exactly ONE LivAiComposer mounted via composerSlot".
3. **Test 2** — rewritten from "Phase 199-05 ThreadPrimitive.Viewport
   testid" to "canonical Thread viewport + LivAiComposer nested inside
   ThreadViewportFooter via composerSlot prop wiring".
4. **Test 4** — extended to additionally assert the new import (`from
   '@/components/assistant-ui/thread'`) + the JSX usage
   (`composerSlot={`). Plan 200-05's existing `from './composer'` +
   `<LivAiComposer` assertions are preserved.
5. **Test 5** — repurposed from "SuggestedPrompts 4 locked chips" to
   "canonical ThreadWelcome subtitle = D-200-18 + sentinel against
   Turkish diacritics in the empty-state surface". The Phase 198-06
   SuggestedPrompts catalog is no longer mounted by `assistant.tsx`
   (the canonical Thread owns its own ThreadSuggestions surface); the
   4 locked default-prompts strings will be re-introduced when the
   runtime ships `ThreadPrimitive.Suggestions` entries (deferred).

## Audit Results

### INV-200-05 — Turkish-string audit

```
$ grep -rE "(LivOS'un|ekranını|sorularına|hatırlar|yönetir)" \
    livos/packages/ui/src/features/liv-ai \
    livos/packages/ui/src/components/assistant-ui
(empty)
```

PASS. After Plan 200-06, no Turkish strings remain in either tree.

### REQ-200-07 — ActionBarPrimitive.Copy verification

```
$ grep -n "ActionBarPrimitive.Copy" \
    livos/packages/ui/src/components/assistant-ui/thread.tsx
325:      <ActionBarPrimitive.Copy asChild>
334:      </ActionBarPrimitive.Copy>
```

PASS. The canonical Thread's `AssistantActionBar` (Plan 200-02 verbatim
registry port, lines 313-359) wires:

- `<ActionBarPrimitive.Copy asChild>` with a TooltipIconButton tooltip
  "Copy"
- Flips between `<CopyIcon>` / `<CheckIcon>` via the runtime
  `s.message.isCopied` boolean (AuiIf branches)
- `autohide="not-last"` + `hideWhenRunning` — visible on hover for
  non-streaming, non-last assistant messages
- Sibling `ActionBarPrimitive.Reload` (Refresh tooltip) and
  `ActionBarPrimitive.ExportMarkdown` (in the MorePrimitive overflow
  menu) ship as bonuses

The behavior of the Copy button (visible-on-hover, click → checkmark
for ~3s, writes assistant text to `navigator.clipboard`) is the
canonical assistant-ui Thread behavior — Plan 200-08 step 9 of the
operator browser UAT walks through the live verification (no
additional vitest assertion needed here per the plan's recommendation
— "behavior verified live in Plan 200-08 UAT step 9").

### Subtitle delta in `thread.tsx`

```
$ grep -nE "your operating system's assistant" \
    livos/packages/ui/src/components/assistant-ui/thread.tsx
136:            Liv AI — your operating system's assistant.
```

PASS. The D-200-18 English Liv AI tagline ships as the third `<p>`
under the canonical "Hello there!" / "How can I help you today?"
ThreadWelcome heading-and-subtitle pair.

### `composerSlot` mount in `assistant.tsx`

```
$ grep -n "composerSlot={" \
    livos/packages/ui/src/features/liv-ai/assistant.tsx
303:            composerSlot={
```

PASS. Single mount point (line 303). The slot is wired to
`<LivAiComposer selectedModel={selectedModel} onModelChange={handleModelChange} />`.

## Test Counts

| Surface (this plan touches)           | Tests | Status        |
| ------------------------------------- | ----- | ------------- |
| empty-state.test.tsx                  | 7     | PASS (7/7)    |
| assistant.test.tsx                    | 11    | PASS (11/11)  |
| composer.test.tsx (Plan 200-05)       | 7     | PASS (7/7)    |
| tool-renderers.test.tsx (INV-200-03)  | 45    | PASS (45/45)  |
| **Scoped total**                      | **70** | **70/70 PASS** |

Full ui test suite (before plan 200-06 → after):
- Test files: 13 failed / 96 total → 13 failed / 96 total
- Tests: 40 failed / 915 total → 40 failed / 916 total (+1 = new
  INV-200-05 sentinel `Test 2b`)

Net: **0 new failed tests, 0 new failed files**. All 13 failing files
and 40 failing tests are pre-existing — see
[deferred-items.md](deferred-items.md).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `assistant.test.tsx` Tests 1/2/5/7/8 broke after the canonical Thread swap**

- **Found during:** Task 3 (post-mount vitest run revealed 5/11 assistant tests
  fail — `Test 1`, `Test 2`, `Test 5`, `Test 7`, `Test 8`).
- **Root cause:** The `@/components/assistant-ui/thread` mock was a
  trivial `<div data-testid='legacy-thread' />` because Phase 199-05's
  inline `ThreadPrimitive.Root` composition never actually rendered the
  canonical Thread component. Plan 200-06 swaps to `<Thread
  composerSlot={...}/>`, so the mock now needs to actually render the
  composerSlot (otherwise the LivAiComposer — which carries the model
  picker for Tests 7/8 — never lands in the DOM). Additionally,
  Tests 1/2/5 asserted against legacy Phase 199-05 testids
  (`liv-ai-empty-state`, `thread-primitive-viewport`,
  `liv-ai-suggested-prompts`) that the canonical Thread doesn't emit.
- **Fix:** Rewrote the `@/components/assistant-ui/thread` mock into a
  ThreadWelcome-shaped surrogate that renders the canonical heading +
  D-200-18 subtitle + `composerSlot` inside a ViewportFooter. Rewrote
  Tests 1/2/5 to assert against the new canonical-Thread DOM shape
  (Thread root + ThreadWelcome with English subtitle + composerSlot-
  hosted LivAiComposer). Tests 7/8 auto-resolved once the
  LivAiComposer landed via composerSlot.
- **Files modified:** `livos/packages/ui/src/features/liv-ai/assistant.test.tsx`
- **Verification:** All 11 assistant tests pass post-edit
  (`pnpm --filter ui exec vitest run src/features/liv-ai/assistant.test.tsx`
  → 11/11 PASS).

The plan explicitly anticipates this in Task 3:
> "assistant.test.tsx may need adapter assertions updated to test for
> `<Thread />` mount instead of inline ThreadPrimitive — if so, update
> those assertions in-place (small edit; do NOT rewrite
> assistant.test.tsx wholesale)."

The edit was scoped (`-114 LOC` from assistant.tsx, `+131 / -X` LOC
from assistant.test.tsx — most additions are documentation/test-name
changes; the actual logical surface adjusted is 5 tests + 1 mock).

### Out-of-scope discoveries (deferred — NOT fixed)

None new. The pre-existing 40 failing tests in 13 files (mostly
`stories/`, `model-picker.test.tsx` Radix dropdown shim drift,
`settings-content.test.tsx` source-surrogate drift) are unchanged and
still tracked in [deferred-items.md](deferred-items.md).

The Phase 198-06 `SuggestedPrompts` 4-chip catalog is not mounted by
`assistant.tsx` post-Plan-200-06 — the canonical Thread owns
`ThreadPrimitive.Suggestions` which today receives zero entries from
the runtime. Re-introducing the 4 locked Phase 198-06 chips
(`weather`, `screenshot`, `windows`, `whatcanyoudo`) as
ThreadPrimitive.Suggestions entries is a Phase 201+ wire-up (or a
follow-up small plan if the operator UAT in Plan 200-08 flags the
empty suggestions area as a visual regression).

## Sacred SHA Verification

```
$ bash scripts/check-sacred.sh
[sacred-sha] PASS: 20 files verified
```

INV-200-01 PASS. No edits to `liv/packages/core/src/sdk-agent-runner.ts`
or any other entry in `scripts/sacred-shas-v38.json`.

## Build Verification

```
$ pnpm --filter ui build
✓ built in 47.61s
PWA v1.2.0  precache 142 entries (7576.15 KiB)
```

`pnpm --filter ui build` exit 0 — vite production build succeeds.

## Self-Check

Files modified (verified on disk):
- `livos/packages/ui/src/features/liv-ai/assistant.tsx` (319 LOC) — FOUND
- `livos/packages/ui/src/features/liv-ai/assistant.test.tsx` (updated) — FOUND
- `livos/packages/ui/src/features/liv-ai/empty-state.tsx` (LIV_AI_TAGLINE English) — FOUND
- `livos/packages/ui/src/features/liv-ai/empty-state.test.tsx` (Test 2/2b updated) — FOUND
- `livos/packages/ui/src/components/assistant-ui/thread.tsx` (ThreadWelcome subtitle) — FOUND

File created:
- `.planning/phases/200-liv-ai-ui-redesign/200-06-SUMMARY.md` — FOUND

Sacred SHA: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved
(check-sacred.sh PASS, 20 files verified).
