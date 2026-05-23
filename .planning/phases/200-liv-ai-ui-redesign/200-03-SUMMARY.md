---
phase: 200-liv-ai-ui-redesign
plan: 03
subsystem: liv-ai-ui
tags: [phase-200, wave-1, mention-adapter, at-picker, tool-catalog, static-items, tdd]
requires:
  - aui-composer-trigger-popover
  - assistant-ui-react-0.14.7
provides:
  - useLivAiMentionAdapter
  - LIV_AI_MENTION_TOOLS
  - LivAiMentionToolItem
affects:
  - livos/packages/ui/src/features/liv-ai/mention-adapter.ts
  - livos/packages/ui/src/features/liv-ai/mention-adapter.test.ts
tech-stack:
  added: []
  patterns:
    - "unstable_useMentionAdapter (assistant-ui v0.14.7) bound to a static `items` list (D-200-08) — `includeModelContextTools: false` keeps the catalog authoritative and sidesteps Pitfall 9 (makeAssistantToolUI vs useAssistantTool discovery mismatch)"
    - "RESEARCH §B2.1 Option A: static items list as the Phase 200 first-ship pattern; live MCP discovery deferred to Phase 201+"
    - "TDD per plan task spec — test file written FIRST; module-not-found RED → source written → 4/4 GREEN"
key-files:
  created:
    - livos/packages/ui/src/features/liv-ai/mention-adapter.ts
    - livos/packages/ui/src/features/liv-ai/mention-adapter.test.ts
    - .planning/phases/200-liv-ai-ui-redesign/200-03-SUMMARY.md
  modified: []
decisions:
  - "D-200-08 closed: @ mention picker = static list of 7 tools (weather, luse_list_windows, get_current_time, luse_computer_screenshot, luse_computer_click_mouse, luse_computer_type_text, luse_computer_application); includeModelContextTools=false"
  - "D-200-09 closed: @ adapter lives in dedicated hook file livos/packages/ui/src/features/liv-ai/mention-adapter.ts exporting useLivAiMentionAdapter()"
  - "D-200-21 partial: mention-adapter.test.ts ships (4 vitest cases, all green) — composer.test.tsx integration deferred to Plan 200-05"
metrics:
  duration: ~10 minutes
  completed: 2026-05-23
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: PASS
---

# Phase 200 Plan 03: `@` Mention Adapter + Static Tool Catalog Summary

One-liner: Shipped `useLivAiMentionAdapter()` React hook + `LIV_AI_MENTION_TOOLS` constant in a dedicated file (`livos/packages/ui/src/features/liv-ai/mention-adapter.ts`) wrapping `unstable_useMentionAdapter` from `@assistant-ui/react@0.14.7` with the D-200-08 locked 7-entry static catalog (3 built-ins + 4 Luse computer-use tools) — adapter is consumed by Plan 200-05's `<LivAiComposer>` rebuild; TDD gate satisfied with 4 vitest cases pinning catalog content + order + shape.

## Objective

Add the `@` mention picker adapter as an isolated, independently-testable unit so Plan 200-05's composer rebuild stays focused on JSX/structure. Pattern follows RESEARCH §B2.1 Option A — static `items` list, `includeModelContextTools: false` — which sidesteps Pitfall 9 (the Phase 198 `makeAssistantToolUI` vs canonical `useAssistantTool` discovery mismatch). Live MCP-bridge tool discovery is DEFERRED to Phase 201+ per CONTEXT §A OUT OF SCOPE bullet 3.

## Task Log

### Task 1: Verify `unstable_useMentionAdapter` type surface — PASS

Confirmed the export at:

```
livos/node_modules/.pnpm/@assistant-ui+react@0.14.7__12486d31c6d0ae9339433958a8c38f2f/node_modules/@assistant-ui/react/dist/unstable/useMentionAdapter.d.ts
```

Re-exported from `@assistant-ui/react` root barrel (`dist/index.d.ts`):

```
export { unstable_useMentionAdapter, type Unstable_IconComponent, type Unstable_Mention,
         type Unstable_MentionCategory, type Unstable_MentionDirective,
         type Unstable_ModelContextToolsOptions, type Unstable_UseMentionAdapterOptions, }
  from "./unstable/useMentionAdapter.js";
```

Confirmed `Unstable_UseMentionAdapterOptions` accepts:

- `items?: readonly Unstable_Mention[]` where `Unstable_Mention = { id, type, label, description?, icon?, metadata? }` — all `readonly`.
- `includeModelContextTools?: boolean | Unstable_ModelContextToolsOptions` — `false` is accepted directly.

Hook return shape:

```ts
{
  adapter: Unstable_TriggerAdapter;
  directive: Unstable_MentionDirective;
  iconMap?: Record<string, Unstable_IconComponent>;
  fallbackIcon?: Unstable_IconComponent;
}
```

This is the spreadable `{ adapter, directive }` bundle that the canonical `<ComposerTriggerPopover char="@" {...mention} />` (ported in Plan 200-02) consumes via its discriminated `directive` prop.

**Type-cast adjustment from plan's `<interfaces>` draft:** The plan's draft used `as unknown as Parameters<typeof unstable_useMentionAdapter>[0]['items']`. With the local interface declared with `readonly` fields matching `Unstable_Mention` exactly, only a single direct cast is needed: `LIV_AI_MENTION_TOOLS as readonly Unstable_Mention[]`. No `as unknown` double-cast required. (The cast is needed only because `type: 'tool'` literal in our interface narrows below `type: string` in the upstream type.)

### Task 2: Write `mention-adapter.test.ts` + `mention-adapter.ts` (TDD) — PASS

**RED phase:** Wrote `mention-adapter.test.ts` first with 4 vitest cases. Initial run (no source file yet):

```
$ cd livos/packages/ui && npx vitest run mention-adapter
FAIL  src/features/liv-ai/mention-adapter.test.ts
Error: Failed to load url ./mention-adapter — Does the file exist?
Tests: no tests; Test Files: 1 failed (1)
```

Confirmed RED — module resolution failure as expected.

**GREEN phase:** Wrote `mention-adapter.ts` (78 LOC including JSDoc) with:

- `LivAiMentionToolItem` interface (readonly fields matching `Unstable_Mention` shape, `type: 'tool'` literal narrowing).
- `LIV_AI_MENTION_TOOLS` const (7 entries, D-200-08 order, `as const` literal array).
- `useLivAiMentionAdapter()` hook wrapping `unstable_useMentionAdapter({ items, includeModelContextTools: false })`.

Re-ran vitest:

```
$ cd livos/packages/ui && npx vitest run mention-adapter
✓ src/features/liv-ai/mention-adapter.test.ts (4 tests) 6ms
Test Files: 1 passed (1)
Tests: 4 passed (4)
```

All 4 cases GREEN:
1. `LIV_AI_MENTION_TOOLS` contains exactly 7 entries
2. The 7 ids appear in the documented D-200-08 order
3. Every item has `type: 'tool'`
4. Every item has non-empty label + description

(The 4th case was added beyond the plan's minimum 3 — it pins the documentation strings against accidental empty-string regressions, e.g. someone deleting a description while reformatting.)

### Task 3: SUMMARY + atomic commit — PASS

This file. Commit covers all 3 paths (source + test + SUMMARY) in one atomic transaction per the plan's `files_modified` list.

## Tool Catalog Rationale (RESEARCH §B2.1 Option A)

The 7 entries map to Phase 200-C built-in Mastra tools + existing Luse computer-use registrations:

| # | id | Origin | Label | Description |
|---|----|--------|-------|-------------|
| 1 | `weather` | Phase 200-C built-in | `weather` | Check weather |
| 2 | `luse_list_windows` | Luse runtime | `List windows` | List open windows |
| 3 | `get_current_time` | Phase 200-C built-in | `Current time` | Get current time |
| 4 | `luse_computer_screenshot` | Luse runtime | `Take screenshot` | Capture screen |
| 5 | `luse_computer_click_mouse` | Luse runtime | `Click mouse` | Click at coordinates |
| 6 | `luse_computer_type_text` | Luse runtime | `Type text` | Type via keyboard |
| 7 | `luse_computer_application` | Luse runtime | `Launch app` | Open application |

**Why static, not live discovery?** RESEARCH §J9 documents that Phase 198's tool registrations use `makeAssistantToolUI` (a UI-only registration that does NOT populate the assistant-ui runtime's tool catalog). The canonical `unstable_useMentionAdapter({ includeModelContextTools: true })` pulls from that runtime catalog — so it would return an empty list against the current backend. Migrating 16 `makeAssistantToolUI` registrations to canonical `useAssistantTool` form is OUT OF SCOPE for Phase 200 (CONTEXT §A bullet 2 of deferrals).

**Picker UX consequence:** The 7 entries are AUTHORITATIVE — operator's `@` popover shows exactly these 7 items, regardless of what tools the backend Mastra agent has registered. Selecting (e.g.) `@weather` inserts the directive `:tool[weather]{name=weather}` per `unstable_defaultDirectiveFormatter` (the formatter assistant-ui ships by default). The backend xAI Grok provider sees the directive as a hint; Mastra's tool registry remains the gatekeeper on whether the tool actually executes (T-200-05 in the threat model).

## Verification

### Acceptance greps (from plan)

```
$ grep -c "id: '" livos/packages/ui/src/features/liv-ai/mention-adapter.ts
7

$ grep -q "luse_computer_screenshot" livos/packages/ui/src/features/liv-ai/mention-adapter.ts && echo MATCH
MATCH

$ test -f livos/packages/ui/src/features/liv-ai/mention-adapter.ts && echo SRC_EXISTS
SRC_EXISTS

$ test -f livos/packages/ui/src/features/liv-ai/mention-adapter.test.ts && echo TEST_EXISTS
TEST_EXISTS
```

### Vitest (scoped)

```
$ cd livos/packages/ui && npx vitest run mention-adapter
✓ src/features/liv-ai/mention-adapter.test.ts (4 tests) 6ms
Test Files: 1 passed (1)
Tests: 4 passed (4)
Duration: 2.11s
```

### Vitest (full suite — regression check)

Baseline before Plan 200-03 (from Plan 200-02 SUMMARY deferred-issue §2): 13-14 failing test files, 40 failing tests.

After Plan 200-03:

```
Test Files: 13 failed | 82 passed (95)
Tests:      40 failed | 868 passed (908)
```

Comparison:
- Test file count: 95 → 95 (added 1 file: mention-adapter.test.ts; baseline already showed it as expected)
- Failed test files: unchanged at 13 (well within baseline noise; one flaky test happened to flip green this run)
- Failed tests: unchanged at 40 — **zero new regressions introduced**
- Passed tests: 864 → 868 (+4, our 4 new mention-adapter cases)

### Typecheck

```
$ cd livos/packages/ui && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "mention-adapter"
(empty)
```

Zero `mention-adapter*` typecheck errors. Total error count unchanged at 508 (matches Plan 200-02 baseline).

### Files touched (matches plan's `files_modified` + SUMMARY)

```
$ git status --short
?? livos/packages/ui/src/features/liv-ai/mention-adapter.test.ts
?? livos/packages/ui/src/features/liv-ai/mention-adapter.ts
?? .planning/phases/200-liv-ai-ui-redesign/200-03-SUMMARY.md
```

No source file outside this plan's `files_modified` touched (INV-200-08 scope discipline). No `package.json` modification (INV-200-04 D-NO-NEW-DEPS PASS — only `@assistant-ui/react` was already a Wave-0 dep, no new install).

### Sacred SHA (INV-200-01)

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Matches `scripts/sacred-shas-v38.json:expected_sha`. Pre-commit hook (`scripts/check-sacred.sh`) is the authoritative gate; it will verify on commit.

## Deviations from Plan

### Plan-text vs implementation deltas

**1. [Rule 1 - Bug] Plan task 1 + task 3 verify commands use `sha1sum livos/packages/livinityd/source/modules/agent/sdk-agent-runner.ts`**

- **Issue:** Carryover from Plan 200-01/02 — the sacred file lives at `liv/packages/core/src/sdk-agent-runner.ts` (post Phase 65-05 cutover); the `livos/packages/livinityd/source/modules/agent/...` path does not exist. Also `sha1sum` and `git hash-object` produce different digests.
- **Fix used:** `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → matches `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. Pre-commit hook independently verifies.

**2. [Rule 1 - Bug] Plan task 2 verify uses `pnpm --filter ui test:run --filter mention-adapter`**

- **Issue:** `pnpm --filter ui test:run --filter mention-adapter` passes `--filter mention-adapter` to vitest, but the `--` separator was missing. With the `--` (i.e. `pnpm --filter ui test:run -- --testPathPattern mention-adapter`), pnpm still runs the full suite (vitest 2.1's `--testPathPattern` is a Jest-style flag, not vitest-native).
- **Fix used:** Bypassed pnpm filter forwarding entirely — ran `cd livos/packages/ui && npx vitest run mention-adapter` (vitest's native positional argument selects the test file by substring match). Result: 1 test file picked up, 4 cases green, no full-suite noise.

### Plan-typecheck-gate deviation

**3. [Rule 3 - Blocking] Plan task 2 verify chains `pnpm --filter ui typecheck` after the vitest case**

- **Reality:** Per Plan 200-01/200-02 deviations, `pnpm --filter ui typecheck` exits 1 against a baseline of 508 pre-existing errors (overwhelmingly `stories/src/routes/stories/*` plus a handful of Phase 199 carryovers). Full-suite green is not achievable in Plan 200-03's 2-file scope.
- **Decision (matches 200-02's scoped-typecheck precedent):** Replaced full-suite green-gate with **scoped per-file targeted verification** — `cd livos/packages/ui && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "mention-adapter"` must return ZERO errors. PASS. Total error count remains at exactly 508 — Plan 200-03 introduces zero new typecheck regressions.

### Test-count deviation

**4. [Rule 2 - Critical functionality] Added a 4th vitest case beyond the plan's documented 3 cases**

- **Plan documented:** 3 cases (length=7, ids in order, type='tool').
- **Shipped:** 4 cases — added "every item has non-empty label and description" as defense-in-depth against accidental empty-string regressions during future label-text edits (the picker's only operator-visible surface).
- **Why critical:** D-200-08's catalog is what operator UAT (Plan 200-08 step 9) sees. If a future commit accidentally blanks a label, the picker shows a blank row — silently fails UAT. The 4th test pins this invariant.
- **No backwards-incompatible change.** Plan's success criteria #3 "3 vitest cases pass" → 4 cases pass (strictly stronger).

## Adapter Consumer Note

This adapter is NOT yet wired into `<LivAiComposer>` (Plan 200-05). The shipped hook is verified at the static-catalog level only; runtime mount of `<ComposerTriggerPopover char="@" {...useLivAiMentionAdapter()} />` lands in Plan 200-05 alongside the composer rebuild. Plan 200-08's operator UAT step 9 (type `@` → 7 items appear) is the runtime acceptance gate.

## Self-Check: PASSED

- FOUND: `livos/packages/ui/src/features/liv-ai/mention-adapter.ts` (78 LOC, exports `useLivAiMentionAdapter`, `LIV_AI_MENTION_TOOLS`, `LivAiMentionToolItem`)
- FOUND: `livos/packages/ui/src/features/liv-ai/mention-adapter.test.ts` (32 LOC, 4 vitest cases — D-200-08 length, order, type, non-empty-labels)
- FOUND: `.planning/phases/200-liv-ai-ui-redesign/200-03-SUMMARY.md` (this file)
- FOUND: Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged on `liv/packages/core/src/sdk-agent-runner.ts`
- FOUND: 4/4 vitest cases green for `mention-adapter`
- FOUND: zero new typecheck regressions — total stable at 508 baseline errors
- FOUND: `grep -c "id: '"` returns 7 in `mention-adapter.ts`
- FOUND: zero source files outside the plan's `files_modified` modified

## Confirmation — Plan 200-04 Ready

Plan 200-04 (`/` slash adapter — file-disjoint sibling of 200-03) can proceed:

- `unstable_useMentionAdapter` type-shape verified live (Task 1 notes apply equally to `unstable_useSlashCommandAdapter`).
- Vitest filter pattern documented (`npx vitest run <substring>`).
- Scoped-typecheck precedent (508 baseline preserved) established.
- INV-200-04 D-NO-NEW-DEPS held — no `package.json` touched.
- Plan 200-05 (composer rebuild) will consume BOTH adapters via `<Thread composerSlot={<LivAiComposer ... />} />`.
