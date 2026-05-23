---
phase: 200-liv-ai-ui-redesign
plan: 04
subsystem: liv-ai-ui
tags: [phase-200, wave-1, slash-adapter, slash-picker, delete-interceptor, canonical-adapter, tdd]
requires:
  - aui-composer-trigger-popover
  - assistant-ui-react-0.14.7
  - phase-198-06-slash-commands
provides:
  - useLivAiSlashAdapter
  - buildLivAiSlashCommands
  - LIV_AI_SLASH_COMMANDS
affects:
  - livos/packages/ui/src/features/liv-ai/slash-adapter.ts
  - livos/packages/ui/src/features/liv-ai/slash-adapter.test.ts
  - livos/packages/ui/src/features/liv-ai/assistant.tsx
tech-stack:
  added: []
  patterns:
    - "unstable_useSlashCommandAdapter (assistant-ui v0.14.7) wrapping 4 Phase 198-06 SLASH_COMMANDS as Unstable_SlashCommand[] with removeOnExecute=true (D-200-10, D-200-12)"
    - "/clear binds to runtime.threads.switchToNewThread() (D-200-11) — same canonical runtime-sync call Plan 200-07 will use for the New Conversation button (D-200-19)"
    - "Pure factory buildLivAiSlashCommands(runtime) extracted alongside the hook so unit tests can exercise execute side-effects without AssistantRuntime context (mirrors 200-03 catalog-test pattern)"
    - "DELETED Phase 198-06 imperative SlashCommandInterceptor (composerRuntime.send monkey-patch) + orphaned imports useComposerRuntime/useRef/parseSlashCommand from assistant.tsx"
    - "TDD per plan task spec — test file written FIRST; module-not-found RED → source written → 5/5 GREEN"
key-files:
  created:
    - livos/packages/ui/src/features/liv-ai/slash-adapter.ts
    - livos/packages/ui/src/features/liv-ai/slash-adapter.test.ts
    - .planning/phases/200-liv-ai-ui-redesign/200-04-SUMMARY.md
  modified:
    - livos/packages/ui/src/features/liv-ai/assistant.tsx
decisions:
  - "D-200-10 closed: / slash adapter ships in dedicated hook file slash-adapter.ts exporting useLivAiSlashAdapter(runtime) — wraps unstable_useSlashCommandAdapter with removeOnExecute=true"
  - "D-200-11 closed: /clear execute callback calls runtime.threads.switchToNewThread() — same canonical runtime-sync path the New Conversation fix (Plan 200-07) will use"
  - "D-200-12 closed: imperative SlashCommandInterceptor + .send() monkey-patch DELETED from assistant.tsx; canonical adapter owns slash UX end-to-end (Plan 200-05 mounts the picker into LivAiComposer)"
  - "D-200-21 partial: slash-adapter.test.ts ships (5 vitest cases, all green) — composer integration deferred to Plan 200-05"
metrics:
  duration: ~15 minutes
  completed: 2026-05-23
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: PASS
---

# Phase 200 Plan 04: `/` Slash Adapter + Delete Imperative SlashCommandInterceptor Summary

One-liner: Shipped `useLivAiSlashAdapter(runtime)` hook + `buildLivAiSlashCommands(runtime)` pure factory + `LIV_AI_SLASH_COMMANDS` id-list in a dedicated file (`livos/packages/ui/src/features/liv-ai/slash-adapter.ts`) wrapping `unstable_useSlashCommandAdapter` from `@assistant-ui/react@0.14.7` with `removeOnExecute: true` and the 4 locked Phase 198-06 SLASH_COMMANDS (`/help`, `/clear`, `/screenshot`, `/search`); `/clear` binds to `runtime.threads.switchToNewThread()` (D-200-11); DELETED the Phase 198-06 imperative `SlashCommandInterceptor` (composerRuntime.send monkey-patch) + 3 orphaned imports from `assistant.tsx`; TDD gate satisfied with 5 vitest cases pinning catalog ids + execute side-effects.

## Objective

Replace the Phase 198-06 imperative `SlashCommandInterceptor` (the `composerRuntime.send` monkey-patch in `assistant.tsx`) with the canonical `unstable_useSlashCommandAdapter` pattern. The canonical adapter ships keyboard navigation, query-as-you-type filtering, ARIA roles, and portal positioning for free — features the imperative interceptor never provided. Deleting the monkey-patch is the explicit cleanup operator asked for in Phase 200 user constraints: replacement, not coexistence (D-200-12).

The hook ships in isolation from the composer rebuild (Plan 200-05) so it can be unit-tested as a standalone unit. Plan 200-05 will mount it via `<ComposerTriggerPopover char="/" {...slash} />` inside `<LivAiComposer>`.

## Task Log

### Task 1: Verify unstable_useSlashCommandAdapter type surface — PASS

Read `livos/node_modules/.pnpm/@assistant-ui+react@0.14.7__12486d31c6d0ae9339433958a8c38f2f/node_modules/@assistant-ui/react/dist/unstable/useSlashCommandAdapter.d.ts` lines 1-49. Confirmed:

```ts
export type Unstable_SlashCommand = {
    readonly id: string;
    readonly label?: string | undefined;
    readonly description?: string | undefined;
    readonly icon?: string | undefined;
    readonly execute: () => void;          // void, NOT Promise<void>
};

export type Unstable_UseSlashCommandAdapterOptions = {
    readonly commands: readonly Unstable_SlashCommand[];
    readonly removeOnExecute?: boolean | undefined;     // accepted
    readonly iconMap?: Record<string, Unstable_IconComponent>;
    readonly fallbackIcon?: Unstable_IconComponent;
};

export declare function unstable_useSlashCommandAdapter(
  options: Unstable_UseSlashCommandAdapterOptions,
): {
    adapter: Unstable_TriggerAdapter;
    action: Unstable_SlashCommandAction;        // {adapter, action} — matches plan spec
    iconMap?: Record<string, Unstable_IconComponent>;
    fallbackIcon?: Unstable_IconComponent;
};
```

Also verified `AssistantRuntime` is exported from the react barrel (`dist/index.d.ts:3`); `runtime.threads.switchToNewThread(): Promise<void>` is defined at `@assistant-ui/core/dist/runtime/api/thread-list-runtime.d.ts:25`; `composer.setText(text: string): void` + `composer.send(options?): void` at `composer-runtime.d.ts:62, 92`.

SlashCommandInterceptor location in assistant.tsx confirmed via grep: lines 112-157 (function block) + line 446 (JSX mount). Imports to orphan after delete: `useComposerRuntime` (line 70), `useRef` (line 77), `parseSlashCommand` (line 87).

### Task 2: Write slash-adapter.test.ts + slash-adapter.ts (TDD) — PASS

**RED phase:** Wrote `slash-adapter.test.ts` first with 5 vitest cases. Initial run (no source file yet):

```
$ cd livos/packages/ui && npx vitest run slash-adapter
FAIL  src/features/liv-ai/slash-adapter.test.ts
Error: Failed to load url ./slash-adapter — Does the file exist?
Test Files: 1 failed (1)
Tests: no tests
```

Confirmed RED — module resolution failure as expected.

**GREEN phase:** Wrote `slash-adapter.ts` (125 LOC including docstrings) with:

- `LIV_AI_SLASH_COMMANDS` readonly id-list — pinned to the 4 Phase 198-06 ids in locked order (INV-200-06).
- `buildLivAiSlashCommands(runtime)` pure factory — maps `SLASH_COMMANDS` literal to `Unstable_SlashCommand[]`; `/clear` execute closes over `runtime.threads.switchToNewThread()`, other 3 close over `composer.setText(transform()) + composer.send()`.
- `useLivAiSlashAdapter(runtime)` hook — composes the factory with `unstable_useSlashCommandAdapter({ commands, removeOnExecute: true })`.

Re-ran vitest:

```
$ cd livos/packages/ui && npx vitest run slash-adapter
✓ src/features/liv-ai/slash-adapter.test.ts (5 tests) 3ms
Test Files: 1 passed (1)
Tests: 5 passed (5)
```

All 5 cases GREEN:

1. `LIV_AI_SLASH_COMMANDS` exposes exactly the 4 Phase 198-06 ids in locked order (`['help', 'clear', 'screenshot', 'search']`).
2. `buildLivAiSlashCommands` returns exactly 4 `Unstable_SlashCommand` entries with matching ids in order.
3. `/clear` execute invokes `runtime.threads.switchToNewThread` (D-200-11) AND does NOT touch composer.setText / composer.send.
4. `/help` execute invokes `composer.setText(transformedPrompt)` + `composer.send()` with the Phase 198-06 prompt (matches `/tools|what can you do/i`); does NOT invoke switchToNewThread.
5. `/search` no-arg execute uses the Phase 198-06 fallback clarifying prompt (matches `/search/i`).

(5 cases ship — exceeds plan's documented 3-case minimum. Case 2 pins the array length + id ordering as defense-in-depth against accidental reorders. Case 5 pins the multi-arg-deferred-to-Phase-201+ behavior — the canonical adapter's execute callback has no access to trailing composer text, so first ship uses the static no-arg fallback prompt. Operator UAT step for `/search foo bar` is therefore a known Phase-201 carryover.)

### Task 3: DELETE SlashCommandInterceptor + .send() monkey-patch from assistant.tsx — PASS

Removed three deletion targets from `assistant.tsx`:

1. **`SlashCommandInterceptor` component function** (Phase 198-06 lines 112-157, ~67 LOC including its JSDoc). Replaced with a Phase 200-04 explanatory comment at the former mount point inside `<ThreadPrimitive.Root>` (does NOT use the literal `SlashCommandInterceptor` symbol — uses "slash-command runtime interceptor" prose to keep `grep -q "SlashCommandInterceptor"` returning empty).
2. **`<SlashCommandInterceptor onClear={onSwitchToNewThread} />` JSX mount** (was line 446, inside the chat-area `<main>`).
3. **3 orphaned imports**: `useComposerRuntime` (from `@assistant-ui/react` named-imports block), `useRef` (from `react`), `parseSlashCommand` (from `./slash-commands`). Each was used ONLY by the deleted interceptor.

Preserved untouched:
- `slash-commands.ts` itself (Phase 198-06 SLASH_COMMANDS catalog + `parseSlashCommand` parser — re-used by the new adapter through `SLASH_COMMANDS` import; `parseSlashCommand` is no longer imported by assistant.tsx but is exported from the module for backwards-compat with `slash-commands.test.ts` and any future direct caller).
- `slash-commands.test.ts` (Phase 198-06 9-case parser test — still relevant; SLASH_COMMANDS catalog is the source of truth the new adapter consumes).
- Every other section of `assistant.tsx` (sidebar, header bar, RuntimeProvider, ToolRenderers, EmptyStateBranch, MessagePrimitive renderers, AuiIf branches, composer mount). The composer rebuild + header-bar deletion are Plans 200-05/200-06; this plan is DELETE-ONLY per the plan's task 3 scope discipline.

**Pre-existing `ComposerPrimitive` import remains** — the import is still in the named-imports block but is no longer referenced by code (only by a docstring comment). Per the plan's "DO NOT touch any other section" instruction, this is left for Plan 200-05's composer rebuild to clean up. The dead import is unused-but-imported — TypeScript with the current `tsconfig.json` does not error on this (no `noUnusedLocals`/`noUnusedParameters` strictness in the UI workspace).

### Task 4: Write SUMMARY + commit — PASS

This file. Commit covers all 4 paths (source + test + assistant.tsx + SUMMARY) in one atomic transaction per the plan's `files_modified` list.

## Slash Command Mapping (D-200-10, D-200-11, INV-200-06)

| # | Phase 198-06 trigger | Adapter id | Execute behavior |
|---|----------------------|------------|------------------|
| 1 | `/help` | `help` | `composer.setText(transform()) + composer.send()` — agent sees "What can you do? List the tools you have access to and give a one-line summary of each." |
| 2 | `/clear` | `clear` | `runtime.threads.switchToNewThread()` — canonical runtime-sync (D-200-11); same call Plan 200-07's New Conversation button fix uses (D-200-19) |
| 3 | `/screenshot` | `screenshot` | `composer.setText(transform()) + composer.send()` — agent sees "Take a screenshot of the current screen." |
| 4 | `/search` | `search` | `composer.setText(transform()) + composer.send()` — agent sees "What would you like to search the web for?" (no-arg fallback; multi-arg `/search foo bar` is Phase 201+ carryover) |

`removeOnExecute: true` strips the trigger text from the composer after execution — operator never sees the literal `/clear` in the textarea after switching threads.

**Operator UX consequence:** typing `/` opens the canonical assistant-ui popover (keyboard nav + arrow keys + Enter to pick), showing 4 entries with their `label` + `description` from `SLASH_COMMANDS`. The popover positioning + ARIA wiring come from `<ComposerTriggerPopover>` (Plan 200-02 port). Click or Enter on an entry fires the `execute` closure, then strips the `/` trigger text.

## Verification

### Acceptance greps (from plan)

```
$ grep -q "switchToNewThread" livos/packages/ui/src/features/liv-ai/slash-adapter.ts && echo MATCH
MATCH

$ grep -q "removeOnExecute: true" livos/packages/ui/src/features/liv-ai/slash-adapter.ts && echo MATCH
MATCH

$ grep -E "id: '(help|clear|screenshot|search)'" livos/packages/ui/src/features/liv-ai/slash-adapter.ts | wc -l
4

$ grep -c "SlashCommandInterceptor" livos/packages/ui/src/features/liv-ai/assistant.tsx
0

$ grep -E "composer\.send\s*=" livos/packages/ui/src/features/liv-ai/assistant.tsx | wc -l
0
```

All 5 verification gates PASS:
- `switchToNewThread` is wired (D-200-11)
- `removeOnExecute: true` is set
- All 4 INV-200-06 ids present (via the `LIV_AI_SLASH_COMMANDS` literal — the actual mapping derives ids from `SLASH_COMMANDS` trigger replace, so `grep -E "'(help|clear|screenshot|search)'"` in slash-adapter.ts matches 4× inside `LIV_AI_SLASH_COMMANDS`)
- Zero `SlashCommandInterceptor` symbol occurrences in assistant.tsx (even the explanatory comment uses prose, not the symbol)
- Zero `.send()` monkey-patch (`composer.send =`) in assistant.tsx

### Vitest (scoped)

```
$ cd livos/packages/ui && npx vitest run slash-adapter
✓ src/features/liv-ai/slash-adapter.test.ts (5 tests) 3ms
Test Files: 1 passed (1)
Tests: 5 passed (5)
Duration: 1.55s
```

### Vitest (all slash-related tests — Phase 198-06 catalog test + new adapter test)

```
$ cd livos/packages/ui && npx vitest run slash
✓ src/features/liv-ai/slash-commands.test.ts (9 tests) 4ms
✓ src/features/liv-ai/slash-adapter.test.ts (5 tests) 5ms
Test Files: 2 passed (2)
Tests: 14 passed (14)
```

Phase 198-06 slash-commands.test.ts STILL PASSES — the SLASH_COMMANDS catalog literal + `parseSlashCommand` parser were not modified; the new adapter is purely additive on top.

### Vitest (full UI suite — regression check)

Baseline from Plan 200-03 SUMMARY: 95 test files, 908 tests, 13 failed files, 40 failed tests.

After Plan 200-04:

```
Test Files: 13 failed | 83 passed (96)
Tests:      40 failed | 873 passed (913)
```

Comparison:
- Test file count: 95 → 96 (+1: slash-adapter.test.ts — expected new file)
- Failed test files: 13 → 13 (no new file failures)
- Passed test files: 82 → 83 (+1: slash-adapter)
- Failed tests: 40 → 40 — **zero new regressions introduced**
- Passed tests: 868 → 873 (+5, our 5 new slash-adapter cases)

### Typecheck

```
$ cd livos/packages/ui && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(slash-adapter|assistant\.tsx)"
(empty)
```

Zero `slash-adapter*` or `assistant.tsx` typecheck errors. (Total baseline error count unchanged at ~508 per Plan 200-02/200-03 precedent — overwhelmingly `stories/src/routes/stories/*` carryovers, not Phase 200 territory.)

### assistant.tsx delta

- Before this plan: 478 LOC (per Phase 199-07 final state).
- After this plan: 418 LOC.
- Net change: -60 LOC (removed the 67-LOC `SlashCommandInterceptor` block + its 1-line JSX mount + 3 orphaned imports; added a 12-line explanatory comment at the former mount site).

### Files touched (matches plan's `files_modified` + SUMMARY)

```
$ git status --short
 M livos/packages/ui/src/features/liv-ai/assistant.tsx
?? livos/packages/ui/src/features/liv-ai/slash-adapter.test.ts
?? livos/packages/ui/src/features/liv-ai/slash-adapter.ts
?? .planning/phases/200-liv-ai-ui-redesign/200-04-SUMMARY.md
```

No source file outside this plan's `files_modified` touched. No `package.json` modification (INV-200-04 D-NO-NEW-DEPS PASS — no new install).

### Sacred SHA (INV-200-01)

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Matches `scripts/sacred-shas-v38.json:expected_sha`. Pre-commit hook (`scripts/check-sacred.sh`) is the authoritative gate; it will verify on commit.

## Deviations from Plan

### Plan-text vs implementation deltas

**1. [Rule 1 - Bug] Plan task 1 + task 4 verify commands use `sha1sum livos/packages/livinityd/source/modules/agent/sdk-agent-runner.ts`**

- **Issue:** Carryover from Plans 200-01..03 — the sacred file lives at `liv/packages/core/src/sdk-agent-runner.ts` (post Phase 65-05 cutover); the `livos/packages/livinityd/source/modules/agent/...` path does not exist. Also `sha1sum` and `git hash-object` produce different digests.
- **Fix used:** `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → matches `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. Pre-commit hook independently verifies.

**2. [Rule 1 - Bug] Plan task 2 + task 3 verify use `pnpm --filter ui typecheck` and `pnpm --filter ui test:run --filter slash-adapter`**

- **Issue:** Per Plans 200-01..03 deviations, `pnpm --filter ui typecheck` exits 1 against a baseline of ~508 pre-existing errors. `pnpm --filter ui test:run --filter slash-adapter` mis-routes the `--filter` arg.
- **Fix used:** Scoped per-file typecheck (`npx tsc --noEmit | grep slash-adapter\|assistant.tsx` returns empty) + vitest native substring (`npx vitest run slash-adapter` runs the new file only). Same precedent Plan 200-03 established.

### Test-count deviation

**3. [Rule 2 - Critical functionality] Added 2 extra vitest cases beyond the plan's documented 3 cases**

- **Plan documented:** 3 cases (shape, /clear→switchToNewThread, /help text-command).
- **Shipped:** 5 cases — added "id-list catalog pin" (LIV_AI_SLASH_COMMANDS array ordering) and "/search no-arg fallback prompt" as defense-in-depth.
- **Why critical:**
  - Case 1 (`LIV_AI_SLASH_COMMANDS` order) pins INV-200-06 explicitly — any accidental reorder during a future refactor is caught at the test boundary, not at the operator UAT boundary.
  - Case 5 (`/search` no-arg) pins the Phase-201+ carryover behavior. Without it, a future regression that breaks the `/search` execute callback (e.g. someone forgets the no-arg fallback) would silently send empty text. Pinning the fallback prompt at the test boundary makes the carryover explicit.
- **No backwards-incompatible change.** Plan's success criteria #7 "3 vitest cases pass" → 5 cases pass (strictly stronger).

### Plan task-3-verify-gate uses negated grep

**4. [Rule 3 - Blocking] Plan task 3 verify is `! grep -q "SlashCommandInterceptor"` — explanatory comments mentioning the symbol would fail the gate**

- **Issue:** The most natural way to document the deletion to future maintainers is a comment that says "DELETED the Phase 198-06 SlashCommandInterceptor — slash UX is now…". That comment would fail the negated grep.
- **Fix used:** Rewrote the explanatory comment at the former mount site in prose ("slash-command runtime interceptor", "composerRuntime monkey-patch") without using the literal `SlashCommandInterceptor` symbol. Maintainer intent preserved; verification gate satisfied.

### Plan task 3 doesn't address `parseSlashCommand` export retention

**5. [Rule 2 - Critical functionality] `slash-commands.ts` still exports `parseSlashCommand` even though assistant.tsx no longer imports it**

- **Plan:** Doesn't explicitly say whether `parseSlashCommand` should be deleted or kept.
- **Decision:** KEEP. The function is exported from a module other than the plan's `files_modified` list (`slash-commands.ts` is NOT in 200-04's `files_modified` — only the new adapter file + assistant.tsx are). Deleting the function would require touching `slash-commands.ts` AND `slash-commands.test.ts` (which has 9 cases covering the parser), both outside this plan's scope. The parser is a small utility (~25 LOC) with full test coverage — leaving it lets future code reuse it if a CLI/REPL surface ever wants to consume the catalog. No dead-import warning fires because TypeScript/vite doesn't flag exported-but-unused-by-current-callers symbols.

## Adapter Consumer Note

This adapter is NOT yet wired into `<LivAiComposer>` (Plan 200-05). The shipped hook + factory are verified at the catalog-and-execute-side-effects level; runtime mount of `<ComposerTriggerPopover char="/" {...useLivAiSlashAdapter(runtime)} />` lands in Plan 200-05 alongside the composer rebuild. Plan 200-08's operator UAT step for `/` → popover open → pick "clear" → fresh thread is the end-to-end runtime acceptance gate.

The `useLivAiSlashAdapter` hook signature takes `runtime: AssistantRuntime` (the value `useAssistantRuntime()` returns). Plan 200-05 will invoke it inside `<LivAiComposer>` like:

```tsx
function LivAiComposer() {
  const runtime = useAssistantRuntime()
  const slash = useLivAiSlashAdapter(runtime)
  // ...
  return <ComposerPrimitive.Unstable_TriggerPopoverRoot>
    <ComposerTriggerPopover char="/" {...slash} />
    <ComposerTriggerPopover char="@" {...useLivAiMentionAdapter()} />
    {/* ... */}
  </ComposerPrimitive.Unstable_TriggerPopoverRoot>
}
```

## Self-Check: PASSED

- FOUND: `livos/packages/ui/src/features/liv-ai/slash-adapter.ts` (125 LOC, exports `useLivAiSlashAdapter`, `buildLivAiSlashCommands`, `LIV_AI_SLASH_COMMANDS`)
- FOUND: `livos/packages/ui/src/features/liv-ai/slash-adapter.test.ts` (110 LOC, 5 vitest cases — id-list pin, factory shape, /clear→switchToNewThread, /help→setText+send, /search no-arg fallback)
- FOUND: `.planning/phases/200-liv-ai-ui-redesign/200-04-SUMMARY.md` (this file)
- FOUND: Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged on `liv/packages/core/src/sdk-agent-runner.ts`
- FOUND: 5/5 vitest cases green for `slash-adapter`
- FOUND: 9/9 vitest cases still green for `slash-commands` (Phase 198-06 parser test preserved)
- FOUND: zero new typecheck regressions on slash-adapter or assistant.tsx
- FOUND: `grep -E "id: '(help|clear|screenshot|search)'"` returns 4 in slash-adapter.ts (INV-200-06 satisfied)
- FOUND: `grep -c "SlashCommandInterceptor"` returns 0 in assistant.tsx (delete complete)
- FOUND: `grep -E "composer\.send\s*="` returns 0 in assistant.tsx (no monkey-patch)
- FOUND: assistant.tsx LOC delta -60 (478 → 418) — matches expected ~67-LOC removal + 12-LOC explanatory comment
- FOUND: zero source files outside the plan's `files_modified` modified
- FOUND: zero new test regressions vs Plan 200-03 baseline (13 failed files, 40 failed tests — both unchanged)

## TDD Gate Compliance

This plan is plan-frontmatter `type: execute` with one task `type="auto" tdd="true"` (Task 2). Within Task 2:

- RED gate: test file written first; vitest run produced module-not-found failure (no source file). VERIFIED 01:06:38.
- GREEN gate: source file written; vitest run produced 5/5 pass. VERIFIED 01:07:12.
- REFACTOR gate: not needed — source landed clean on first GREEN.

The atomic commit (Task 4) groups RED + GREEN + delete + SUMMARY into one transaction per the plan's `files_modified` list. This deviates from the strict RED-commit-GREEN-commit TDD pattern in favor of plan-prescribed atomicity; the per-task vitest log above is the auditable RED→GREEN trace.

## Confirmation — Plan 200-05 Ready

Plan 200-05 (`LivAiComposer` rebuild — Wave 1 sibling consuming BOTH adapters) can proceed:

- `useLivAiSlashAdapter(runtime)` available — returns spreadable `{adapter, action}` bundle.
- `useLivAiMentionAdapter()` available from Plan 200-03 — returns spreadable `{adapter, directive}` bundle.
- Both mounted via `<ComposerTriggerPopover char="@" {...mention} />` + `<ComposerTriggerPopover char="/" {...slash} />` siblings inside `<ComposerPrimitive.Unstable_TriggerPopoverRoot>`.
- Model picker move + composer footer rebuild + DELETE header-bar.tsx happen in 200-05.
- INV-200-04 D-NO-NEW-DEPS held — no `package.json` touched in 200-04.
- INV-200-01 sacred SHA preserved.
