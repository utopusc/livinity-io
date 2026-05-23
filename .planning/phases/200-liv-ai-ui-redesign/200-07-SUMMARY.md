---
phase: 200-liv-ai-ui-redesign
plan: 07
type: execute
wave: 2
shipped: 2026-05-23
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
requires: [200-06]
provides:
  - "useThreadListAdapter — runtime-synced onSwitchToNewThread + onDelete-of-current paths"
  - "AssistantShell — inner component that hosts useThreadListAdapter inside AssistantRuntimeProvider"
affects:
  - "Sidebar New Conversation button now correctly resets the runtime's UIMessage store"
  - "Sidebar delete-current-thread cleanup no longer leaves a tombstone in the runtime view"
key-files:
  modified:
    - livos/packages/ui/src/features/liv-ai/thread-list-adapter.ts
    - livos/packages/ui/src/features/liv-ai/thread-list-adapter.test.tsx
    - livos/packages/ui/src/features/liv-ai/assistant.tsx
    - livos/packages/ui/src/features/liv-ai/assistant.test.tsx
  created:
    - .planning/phases/200-liv-ai-ui-redesign/200-07-SUMMARY.md
decisions:
  - D-200-19 "New Conversation runtime sync = single locus in thread-list-adapter.ts"
  - D-200-20 "switchToThread(oldId) runtime sync DEFERRED to Phase 201 — Option A first ship"
requirements: [REQ-200-08]
tags: [phase-200, wave-2, bug-fix, runtime-sync, new-conversation, switch-to-new-thread, hitl]
metrics:
  duration_minutes: 14
  tasks: 3
  files_modified: 4
  files_created: 1
  vitest_in_scope_pass: "18/18 (7 thread-list-adapter + 11 assistant)"
---

# Phase 200 Plan 07: New Conversation Runtime Sync Fix Summary

Wired `runtime.threads.switchToNewThread()` into `useThreadListAdapter` so the sidebar "+ New conversation" button and current-thread delete both reset the assistant-ui runtime's internal UIMessage store — closing the long-standing "ghost messages after switching threads" UAT defect (REQ-200-08).

---

## Bug Recap (RESEARCH §G — single-locus root cause)

**Symptom (Phase 198/199 UAT):** Operator clicks "+ New conversation" in the sidebar. Local sidebar state rotates (button highlight moves to the new row, message viewport visually appears to clear). Operator types a message + sends. Backend correctly receives the fresh `threadId` in the body envelope and opens a new Memory thread. BUT the runtime's `state.messages` still holds the prior thread's UIMessages → the new turn renders AFTER the stale turns, creating a "ghost conversation" UX.

**Root cause:** `useThreadListAdapter().onSwitchToNewThread()` only flipped local React state (`setCurrentThreadId(newThreadId())`); it never called the canonical `runtime.threads.switchToNewThread()` on the AssistantRuntime. The runtime's UIMessage store was never reset.

**Single-locus fix (INV-200-08):** `livos/packages/ui/src/features/liv-ai/thread-list-adapter.ts:onSwitchToNewThread`. Wire `useAssistantRuntime()` at the top of the hook; make the callback async; `await runtime.threads.switchToNewThread()` BEFORE the local state flip (RESEARCH §J4 — forgetting `await` is a documented race-condition pitfall). Same canonical call `/clear` uses via `slash-adapter.ts:89` (D-200-11) — both paths converge.

---

## Code Delta

### `livos/packages/ui/src/features/liv-ai/thread-list-adapter.ts`

```ts
import {useAssistantRuntime} from '@assistant-ui/react'   // NEW
// ...

export function useThreadListAdapter(): ThreadListAdapter {
  const runtime = useAssistantRuntime()                    // NEW (D-200-19)
  const [currentThreadId, setCurrentThreadId] = useState<string>(() => newThreadId())
  // ... tRPC queries unchanged ...

  const onSwitchToNewThread = useCallback(async () => {    // async (was sync void)
    await runtime.threads.switchToNewThread()              // NEW canonical runtime call
    setCurrentThreadId(newThreadId())
  }, [runtime])

  const onSwitchToThread = useCallback((threadId: string) => {
    // TODO(phase-201): Option B sync via ExternalStoreThreadListAdapter
    // (D-200-20) — first-ship known limitation: old-thread sidebar
    // click flips local state + sets next-send body threadId but does
    // NOT reload the prior thread's UIMessages into the runtime.
    setCurrentThreadId(threadId)
  }, [])

  const onDelete = useCallback(async (threadId: string): Promise<void> => {
    if (deleteMut?.mutateAsync) await deleteMut.mutateAsync({threadId})
    if (threadId === currentThreadId) {
      await runtime.threads.switchToNewThread()            // NEW cleanup (D-200-19)
      setCurrentThreadId(newThreadId())
    }
  }, [deleteMut, currentThreadId, runtime])
  // ...
}
```

ThreadListAdapter interface: `onSwitchToNewThread: () => void` → `onSwitchToNewThread: () => Promise<void>` (existing callers in sidebar JSX continue to work — fire-and-forget is fine; the body callback closure picks up the fresh threadId on next request).

### `livos/packages/ui/src/features/liv-ai/assistant.tsx` — minimal restructure (Task 1 pitfall-guard fix)

Task 1 verified that `useThreadListAdapter()` was previously called at the top of the outer `Assistant()` function (line 99) — BEFORE `<AssistantRuntimeProvider>` opens (line 178). Since `useAssistantRuntime()` only resolves from a descendant of the provider, the hook call had to move INSIDE the provider. Restructure:

- Outer `Assistant()` keeps: model state (selectedModel + Redis hydration), `useChatRuntime()` construction, `<AssistantRuntimeProvider>` mount, `<ToolRenderers />` + `<DevToolsMount />`, plus a new `currentThreadIdRef` (React.MutableRefObject) used by the `useChatRuntime` body callback.
- New inner `<AssistantShell />` component renders INSIDE the provider; owns `useThreadListAdapter()` + the entire sidebar JSX + the canonical `<Thread />` mount. A `useEffect` keeps `currentThreadIdRef.current` in lockstep with the adapter's `currentThreadId` state so the outer body callback's closure always reads the latest value.

Net surface change: ~70 LOC moved from one function into a new sibling function; zero behavioral change to model picker, transport body envelope shape (`{threadId, config: {modelName}}`), tRPC wiring, sidebar layout, or empty-state surface. Plan 200-06 ThreadWelcome + LivAiComposer composerSlot path preserved exactly.

### Test additions

`livos/packages/ui/src/features/liv-ai/thread-list-adapter.test.tsx` — 3 new vitest cases:

- **Test 5:** `onSwitchToNewThread` calls `runtime.threads.switchToNewThread` exactly once, then `currentThreadId` rotates to a new UUID.
- **Test 6:** `onDelete(currentThreadId)` calls both `threads.delete.mutateAsync({threadId})` AND `runtime.threads.switchToNewThread` (cleanup path).
- **Test 7:** `onDelete(other-id)` calls only `threads.delete.mutateAsync` — NOT `runtime.threads.switchToNewThread` (negative case: deleting an unrelated thread leaves the runtime untouched).

New `vi.mock('@assistant-ui/react', ...)` factory stubs `useAssistantRuntime` so the hook executes without booting a real provider. Test 3 (existing) updated to `async` + `await act(async () => ...)` because `onSwitchToNewThread` is now async.

`livos/packages/ui/src/features/liv-ai/assistant.test.tsx` — Rule 1 deviation: the file's `vi.mock('@assistant-ui/react', ...)` factory previously did not export `useAssistantRuntime`. The new `<AssistantShell />` → `useThreadListAdapter` → `useAssistantRuntime()` call surfaced this as a runtime error in 4 of the 11 cases. Added a `useAssistantRuntime` stub returning `{threads: {switchToNewThread: vi.fn(...)}}`. All 11 cases pass.

---

## Vitest Verification (in-scope only)

```
src/features/liv-ai/thread-list-adapter.test.tsx  7 PASS  (4 existing + 3 new)
src/features/liv-ai/assistant.test.tsx            11 PASS (no regressions)
─────────────────────────────────────────────────────────────────
Total in-scope                                    18/18 PASS
```

TDD RED → GREEN walk: tests 5 + 6 first failed with `expected "spy" to be called 1 times, but got 0 times` → after the production patch they passed; test 3 was made async-aware to consume the new Promise return type.

`pnpm --filter ui typecheck` of Plan 200-07 surface (`thread-list-adapter.ts`, `assistant.tsx`, both test files) — clean. Pre-existing repo-wide tsc failures in `stories/`, `devtools-mount.tsx`, `model-picker.test.tsx` are documented in deferred-items.md (Plan 200-05 entries). Plan 200-07 adds no new typecheck errors.

`pnpm --filter ui exec vitest run` full suite: 879 pass / 40 fail. All 40 failures pre-existed on master at `33af07c4` — verified via `git stash` of Plan 200-07's 4-file diff: same failures reproduce in the same 13 test files. Deferred-items.md updated with the full list (see Plan 200-07 section).

---

## Option B Deferral (D-200-20) — Known Limitation

**Deferred to Phase 201:** `onSwitchToThread(oldThreadId)` runtime sync — clicking an OLD thread in the sidebar still only flips local state + sets the next-send body `threadId`. It does NOT reload that thread's UIMessages into the runtime. The runtime's UIMessage store still shows the previously-active thread's history until either (a) the operator sends a new message in the old thread context — backend Memory (PostgresStore) returns the full history on `agent.stream()` resolve and the new run hydrates the runtime; or (b) the operator refreshes the window.

**Rationale (RESEARCH §G4):** Option B requires wiring `ExternalStoreThreadListAdapter` (assistant-ui upstream) plus loading thread history from PG into the runtime's external store on every old-thread click — estimated >120 LOC of plumbing, plus a tRPC `mastra.agent.threads.getHistory` route addition. Out of scope for Plan 200-07's single-locus fix.

**Tracking:** TODO comment in `thread-list-adapter.ts:onSwitchToThread` body links the Phase 201 follow-up.

---

## Invariant Verification

### INV-200-01 — Sacred SHA preserved

```
$ bash scripts/check-sacred.sh
[sacred-sha] PASS: 20 files verified
```

`liv/packages/core/src/sdk-agent-runner.ts` SHA1 unchanged at `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. (CONTEXT.md's `livos/packages/livinityd/source/modules/agent/sdk-agent-runner.ts` path is stale repo-layout text from before the 65-02 Liv rename; the authoritative SHA-pin registry at `scripts/sacred-shas-v38.json` lists the correct path.)

### INV-200-04 — D-NO-NEW-DEPS

`livos/packages/ui/package.json` untouched. `useAssistantRuntime` imports from the already-present `@assistant-ui/react@0.14.7`.

### INV-200-05 — English UI only

No new string literals added. The TODO comment is internal code documentation.

### INV-200-08 — Single point of change

```
$ grep -rn "runtime.threads" livos/packages/ui/src/features/liv-ai/
```

Matches in exactly the expected files:

| File | Hits | Status |
|------|------|--------|
| `thread-list-adapter.ts` | 8 (2 active calls + 6 docstring lines) | Plan 200-07 NEW |
| `thread-list-adapter.test.tsx` | 9 (3 test bodies + 6 comment lines) | Plan 200-07 NEW |
| `slash-adapter.ts` | 4 (1 active call + 3 doc lines) | Plan 200-04 (D-200-11) — pre-existing |
| `slash-adapter.test.ts` | 4 (3 spy refs + 1 doc line) | Plan 200-04 — pre-existing |
| `assistant.tsx` | 3 (docstring + inline comments only — NO active `runtime.threads.*` call) | Plan 200-07 doc-only refs |

Active `runtime.threads.switchToNewThread()` invocations live in exactly 2 source files: `thread-list-adapter.ts` (2 — `onSwitchToNewThread` + `onDelete`-of-current) and `slash-adapter.ts` (1 — `/clear` execute, D-200-11). Both call the same canonical assistant-ui API; both converge on the same runtime + local-state reset path. INV-200-08 holds.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] assistant.test.tsx mock missing `useAssistantRuntime` export**
- **Found during:** Task 2 — full-suite vitest run after the production patch landed
- **Issue:** `assistant.test.tsx`'s `vi.mock('@assistant-ui/react', ...)` factory exported `AssistantRuntimeProvider / AuiIf / useAuiState / useThread / useThreadRuntime / useComposerRuntime / ComposerPrimitive / ...` but NOT `useAssistantRuntime`. Plan 200-07's restructure routes `useThreadListAdapter()` through `<AssistantShell />` (inside the mocked provider) → adapter calls `useAssistantRuntime()` → mock module throws `No "useAssistantRuntime" export is defined`. 4 of 11 cases failed.
- **Fix:** Added `useAssistantRuntime: () => ({threads: {switchToNewThread: vi.fn(async () => undefined)}})` to the mock module's return object.
- **Files modified:** `livos/packages/ui/src/features/liv-ai/assistant.test.tsx` (mock factory additions only — no production-code edits triggered by this finding).
- **Scope justification:** Directly caused by Plan 200-07's hook restructure surfacing in a test file that also exercises the rebuilt path. Within Plan 200-07's blast radius — not pre-existing.

**2. [Rule 1 - Bug] Test 3 (`onSwitchToNewThread() generates a new client-side threadId...`) became flaky after the async refactor**
- **Found during:** Task 2 — TDD GREEN re-run
- **Issue:** Test 3 wrapped `captured!.onSwitchToNewThread()` in a sync `act(() => ...)` block. With the async refactor (`onSwitchToNewThread` now returns `Promise<void>` and the local state flip happens inside the resolved continuation), the sync `act()` returned before React 18 flushed the state update → the `second` read of `currentThreadId` saw the unchanged value → `expect(second).not.toBe(first)` fired.
- **Fix:** Rewrote Test 3 as `it('...', async () => { await act(async () => { await captured!.onSwitchToNewThread() }) })`.
- **Files modified:** `livos/packages/ui/src/features/liv-ai/thread-list-adapter.test.tsx` Test 3 block.
- **Scope justification:** Direct cascade from the production callback's signature change. Within Plan 200-07 blast radius.

### Architectural Choice (resolved without Rule 4)

**`useAssistantRuntime()` call site — in-hook vs hook-parameter:** Plan 200-07's `<interfaces>` example writes `const runtime = useAssistantRuntime()` inside the hook. The user's `<critical_constraints>` allowed either (in-hook OR runtime-param). The slash-adapter precedent (`useLivAiSlashAdapter(runtime)`) uses the parameter pattern. Chose the in-hook pattern per the plan's must_haves truths #1 — "useThreadListAdapter wires useAssistantRuntime() at the top of the hook". Consequence: required moving the hook call inside `<AssistantRuntimeProvider>` via the `<AssistantShell />` extraction (Task 2 pitfall-guard, explicitly authorized in the plan task action text). Not a Rule 4 escalation — the plan's pitfall guard covered the restructure as in-scope.

### Out-of-scope discoveries logged to `deferred-items.md`

Full-suite vitest reported 40 failures across 13 files. All confirmed pre-existing via `git stash` of Plan 200-07's 4-file diff → identical failures reproduce on master at `33af07c4`. None touched by Plan 200-07. Cluster: jsdom shim drift, localStorage harness flakiness, Playwright suites picked up by vitest. Logged to deferred-items.md as a Plan 200-07-era finding for a future test-cleanup pass.

---

## Manual Smoke (planned for Plan 200-08 UAT)

Plan 200-07 ships the code-level fix. The 10-step operator browser UAT in Plan 200-08 (UAT-CHECKLIST step 8) exercises the New Conversation button live on Mini PC:

1. Open Liv AI from the dock; observe canonical ThreadWelcome.
2. Send a message; verify assistant turn renders.
3. Click "+ New conversation" in the sidebar.
4. **Expected:** message viewport CLEARS immediately (runtime UIMessage store reset by `runtime.threads.switchToNewThread()`); composer focus retained; sidebar highlight rotates to a fresh row.
5. Send a follow-up message.
6. **Expected:** PG `mastra_threads` rows show 2 distinct UUIDs; second turn is NOT mixed with first thread's history.
7. Delete the current thread row.
8. **Expected:** message viewport clears (D-200-19 cleanup path); a new UUID-shaped sidebar row appears as active.

---

## Self-Check: PASSED

Created files:
- `FOUND: .planning/phases/200-liv-ai-ui-redesign/200-07-SUMMARY.md`

Modified files:
- `FOUND: livos/packages/ui/src/features/liv-ai/thread-list-adapter.ts` (8 occurrences of `runtime.threads.switchToNewThread` — 2 active calls + 6 doc refs)
- `FOUND: livos/packages/ui/src/features/liv-ai/thread-list-adapter.test.tsx` (7 vitest cases, 3 new)
- `FOUND: livos/packages/ui/src/features/liv-ai/assistant.tsx` (AssistantShell extracted, currentThreadIdRef wired)
- `FOUND: livos/packages/ui/src/features/liv-ai/assistant.test.tsx` (useAssistantRuntime mock added)

Sacred SHA: `liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (verified via `bash scripts/check-sacred.sh` → PASS: 20 files verified).

Vitest in-scope: 18/18 PASS (7 thread-list-adapter + 11 assistant).
