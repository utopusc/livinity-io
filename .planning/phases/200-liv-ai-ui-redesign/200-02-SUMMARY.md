---
phase: 200-liv-ai-ui-redesign
plan: 02
subsystem: liv-ai-ui
tags: [phase-200, wave-0, registry-port, assistant-ui, shadcn, verbatim, path-remap, composer-slot]
requires:
  - shadcn-avatar-primitive
  - shadcn-collapsible-primitive
provides:
  - aui-thread-component
  - aui-markdown-text
  - aui-tooltip-icon-button
  - aui-attachment
  - aui-reasoning
  - aui-tool-group
  - aui-tool-fallback
  - aui-composer-trigger-popover
  - aui-directive-text
affects:
  - livos/packages/ui/src/components/assistant-ui/thread.tsx
  - livos/packages/ui/src/components/assistant-ui/markdown-text.tsx
  - livos/packages/ui/src/components/assistant-ui/tooltip-icon-button.tsx
  - livos/packages/ui/src/components/assistant-ui/attachment.tsx
  - livos/packages/ui/src/components/assistant-ui/reasoning.tsx
  - livos/packages/ui/src/components/assistant-ui/tool-group.tsx
  - livos/packages/ui/src/components/assistant-ui/tool-fallback.tsx
  - livos/packages/ui/src/components/assistant-ui/composer-trigger-popover.tsx
  - livos/packages/ui/src/components/assistant-ui/directive-text.tsx
tech-stack:
  added: []
  patterns:
    - "verbatim shadcn registry port (D-200-02) via curl against r.assistant-ui.com/*.json"
    - "deterministic node-script path-remap (D-200-04): @/lib/utils → @/shadcn-lib/utils, @/components/ui/* → @/shadcn-components/ui/*, ./badge → @/shadcn-components/ui/badge, import { Slot } from 'radix-ui' → import { Slot } from '@radix-ui/react-slot'"
    - "composerSlot? slot pattern (D-200-16) for caller-supplied Composer injection without forking canonical Thread"
key-files:
  created:
    - livos/packages/ui/src/components/assistant-ui/markdown-text.tsx
    - livos/packages/ui/src/components/assistant-ui/tooltip-icon-button.tsx
    - livos/packages/ui/src/components/assistant-ui/attachment.tsx
    - livos/packages/ui/src/components/assistant-ui/reasoning.tsx
    - livos/packages/ui/src/components/assistant-ui/tool-group.tsx
    - livos/packages/ui/src/components/assistant-ui/tool-fallback.tsx
    - livos/packages/ui/src/components/assistant-ui/composer-trigger-popover.tsx
    - livos/packages/ui/src/components/assistant-ui/directive-text.tsx
    - .planning/phases/200-liv-ai-ui-redesign/200-02-SUMMARY.md
  modified:
    - livos/packages/ui/src/components/assistant-ui/thread.tsx
decisions:
  - "D-200-01 closed: assistant-ui shadcn registry adopted as Liv AI structural baseline"
  - "D-200-02 closed: manual-copy port via curl + node script (NOT npx shadcn add — postinstall blocks on Windows host)"
  - "D-200-03 closed: 9 registry files ported in one atomic Wave 0 commit"
  - "D-200-04 closed: path-remap rules applied uniformly via deterministic node script"
  - "D-200-16 closed: Thread accepts composerSlot?: ReactNode (single intentional delta from upstream)"
  - "D-200-23 partial: per-file typecheck-clean confirmed; full-suite typecheck baseline preserved at 508 pre-existing errors"
metrics:
  duration: ~25 minutes
  completed: 2026-05-23
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: PASS
---

# Phase 200 Plan 02: Port 9 Canonical assistant-ui Registry Files Summary

One-liner: Ported 9 canonical assistant-ui shadcn registry files verbatim from `r.assistant-ui.com/*.json` into `livos/packages/ui/src/components/assistant-ui/` with Vite path-remaps applied uniformly via a deterministic node script — replaces the 127-line Phase 198-02 minimal Thread scaffold with the full registry surface (Thread + GroupedParts + AssistantActionBar with Copy/Reload/Export + BranchPicker + EditComposer + 8 sibling primitives) plus a single intentional `composerSlot?: ReactNode` prop deviation (D-200-16) for assistant.tsx to inject `<LivAiComposer />` in Plan 200-06.

## Objective

Port the canonical assistant-ui shadcn registry baseline as the Phase 200 structural foundation. All 9 files fetched fresh 2026-05-23 from `r.assistant-ui.com/*.json` via curl, extracted via `files[0].content`, path-remapped to Vite-compatible imports (D-200-04), and written atomically. Phase 198 generative-UI renderers (`tool-renderers.tsx`) are FROZEN (INV-200-03) — the new Thread's `MessagePrimitive.GroupedParts` switch routes `tool-call` parts through `part.toolUI ?? <ToolFallback />` so existing 16 `makeAssistantToolUI` registrations paint unchanged.

## Per-File Port Log

| File | Source URL | Bytes | LOC | Source method |
|------|-----------|-------|-----|----------------|
| `thread.tsx` | r.assistant-ui.com/thread.json | 16,631 | 454 | curl → JSON.files[0].content (replaces Phase 198-02 127-LOC scaffold) |
| `markdown-text.tsx` | r.assistant-ui.com/markdown-text.json | 6,436 | 248 | curl → JSON.files[0].content |
| `tooltip-icon-button.tsx` | r.assistant-ui.com/tooltip-icon-button.json | 1,565 | 49 | curl → JSON.files[0].content |
| `attachment.tsx` | r.assistant-ui.com/attachment.json | 6,703 | 223 | curl → JSON.files[0].content |
| `reasoning.tsx` | r.assistant-ui.com/reasoning.json | 8,662 | 282 | curl → JSON.files[0].content |
| `tool-group.tsx` | r.assistant-ui.com/tool-group.json | 6,786 | 231 | curl → JSON.files[0].content |
| `tool-fallback.tsx` | r.assistant-ui.com/tool-fallback.json | 8,541 | 324 | curl → JSON.files[0].content |
| `composer-trigger-popover.tsx` | r.assistant-ui.com/composer-trigger-popover.json | 8,319 | 245 | curl → JSON.files[0].content |
| `directive-text.tsx` | r.assistant-ui.com/directive-text.json | 2,553 | 75 | curl → JSON.files[0].content |
| **TOTAL** | — | **66,196** | **2,131** | — |

All 9 payloads fetched live via `curl https://r.assistant-ui.com/<name>.json` on 2026-05-23 (no truncation — full `files[0].content` extracted regardless of RESEARCH.md quote-state per the plan's `<interfaces>` block). The `.tmp-port-registry.cjs` helper script (not committed) drove the port deterministically — re-running it would produce byte-identical outputs modulo the manual fix-ups documented in Deviations.

## Path-Remap Stats

Counts of D-200-04 remaps applied per file (before → after):

| File | `@/lib/utils` | `@/components/ui/` | `from "radix-ui"` | `./badge` |
|------|---------------|--------------------|--------------------|-----------|
| thread.tsx | 1 → 0 | 1 → 0 | 0 → 0 | 0 → 0 |
| markdown-text.tsx | 1 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| tooltip-icon-button.tsx | 1 → 0 | 2 → 0 | 1 → 0 | 0 → 0 |
| attachment.tsx | 1 → 0 | 3 → 0 | 0 → 0 | 0 → 0 |
| reasoning.tsx | 1 → 0 | 1 → 0 | 0 → 0 | 0 → 0 |
| tool-group.tsx | 1 → 0 | 1 → 0 | 0 → 0 | 0 → 0 |
| tool-fallback.tsx | 1 → 0 | 1 → 0 | 0 → 0 | 0 → 0 |
| composer-trigger-popover.tsx | 1 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| directive-text.tsx | 0 → 0 | 0 → 0 | 0 → 0 | 1 → 0 |
| **Total** | **8 → 0** | **9 → 0** | **1 → 0** | **1 → 0** |

**Verification:**
```
$ grep -rE "from \"@/lib/utils\"|from \"radix-ui\"" livos/packages/ui/src/components/assistant-ui/
(empty)
```

All banned import strings eliminated. INV-200-04 (D-NO-NEW-DEPS) honored — zero `package.json` modifications in this plan; the 4 audit-permitted deps (`zustand`, `remark-gfm`, `@radix-ui/react-avatar`, `@radix-ui/react-collapsible`) were all closed by Plan 200-01.

## composerSlot Deviation (D-200-16) — The ONE Intentional Delta

Per D-200-16, `thread.tsx` adopts one intentional delta from the upstream registry source: it accepts a `composerSlot?: ReactNode` prop. This avoids forking the canonical Composer wholesale (Plan 200-06 will mount `<Thread composerSlot={<LivAiComposer ... />} />` from `assistant.tsx`).

```tsx
export type ThreadProps = { composerSlot?: ReactNode };

export const Thread: FC<ThreadProps> = ({ composerSlot }) => {
  return (
    <ThreadPrimitive.Root ...>
      <ThreadPrimitive.Viewport ...>
        <div ...>
          ...
          <ThreadPrimitive.ViewportFooter ...>
            <ThreadScrollToBottom />
            {composerSlot ?? <Composer />}
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};
```

The default `Composer` const remains in-file as the canonical fallback when no slot is supplied. Internal `Composer` is NOT exported — only `Thread` (with the new prop) is the public API surface.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Local `Button` variant/size names diverge from shadcn defaults**

- **Found during:** Task 4 (post-port typecheck)
- **Issue:** The canonical registry source assumes the upstream shadcn `Button` with `variant="outline"`, `size="icon"`, and `variant="ghost"`. Our local `livos/packages/ui/src/shadcn-components/ui/button.tsx` is a LIVINITY DS variant of shadcn — same name, different variants. Available variants: `default | primary | secondary | destructive | ghost | liv-primary | v36-primary | v36-ghost | v36-danger`. Available sizes: `sm | md | md-squared | default | input-short | dialog | lg | xl | icon-only | v36-pill | v36-pill-sm | v36-pill-lg | v36-icon-square`. No `outline` variant, no `icon` size.
- **Fix mapping:**
  - `variant="outline"` → `variant="default"` (the local `default` already includes `border border-border-default` — visually equivalent surface).
  - `size="icon"` → `size="icon-only"` (matches local naming).
- **Files modified:** `thread.tsx` (1× outline → default, 2× icon → icon-only), `attachment.tsx` (1× icon → icon-only), `tooltip-icon-button.tsx` (1× icon → icon-only).
- **Commit:** included in atomic Plan 200-02 commit (per plan task 4 spec).

**2. [Rule 1 - Bug] `@radix-ui/react-slot@1.0.2` exposes `Slottable` as a named export, not as `Slot.Slottable`**

- **Found during:** Task 4 typecheck — `tooltip-icon-button.tsx` errored: `Property 'Slottable' does not exist on type 'ForwardRefExoticComponent<SlotProps & RefAttributes<HTMLElement>>'`.
- **Root cause:** The registry source uses the newer `radix-ui` umbrella package import pattern: `import { Slot } from "radix-ui"; ... <Slot.Slottable>`. Our path-remap target `@radix-ui/react-slot` (v1.0.2 resolved) exports `Slottable` as a sibling named export, not a property on `Slot`. (Verified in `node_modules/.pnpm/@radix-ui+react-slot@1.0.2_.../dist/index.d.ts`.)
- **Fix:** Import `Slottable` directly, drop unused `Slot` import: `import { Slottable } from "@radix-ui/react-slot"`, then `<Slottable>{children}</Slottable>`.
- **Files modified:** `tooltip-icon-button.tsx` (import + JSX).
- **Commit:** included in atomic Plan 200-02 commit.

**3. [Rule 1 - Bug] Local `Badge` lacks `info` variant and `size` prop**

- **Found during:** Task 4 typecheck — `directive-text.tsx` errored on `variant="info"` and `size="sm"`.
- **Root cause:** Upstream shadcn Badge has `info` variant + `size` prop. Our `livos/packages/ui/src/shadcn-components/ui/badge.tsx` has variants `default | primary | destructive | outline | liv-status-running` and NO `size` prop.
- **Fix mapping:**
  - `variant="info"` → `variant="primary"` (closest semantic — brand-tinted highlight on the chip).
  - `size="sm"` prop dropped (local Badge does not accept it; the chip's small visual treatment continues to come from the `className` `text-[13px] leading-none` overrides already in the registry source).
- **Files modified:** `directive-text.tsx` (1× variant remap + size prop dropped).
- **Commit:** included in atomic Plan 200-02 commit.

**4. [Rule 3 - Blocking] Full-suite `pnpm --filter ui typecheck` is not green (baseline 508 pre-existing errors per Plan 200-01)**

- **Found during:** Task 1 verify (`pnpm --filter ui typecheck` required to exit 0 between every leaf-primitive port).
- **Reality:** Per Plan 200-01 deviation §4, the baseline has 508 pre-existing errors — overwhelmingly in `stories/src/routes/stories/*` (Vite stories workspace) plus a handful of Phase 199 carryovers in `devtools-mount.tsx` and `model-picker.test.tsx`. These are out-of-scope for Plan 200-02 per SCOPE BOUNDARY.
- **Decision:** Replaced full-suite green-gate with **scoped per-file targeted verification** — `cd livos/packages/ui && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "src/components/assistant-ui"` must return ZERO new errors. After fixing deviations 1-3 above, this gate is GREEN. Total full-suite error count remains at exactly 508 — Plan 200-02 introduces **zero new typecheck regressions**.
- **Carryover:** Plan 200-01 already flagged this baseline cleanup as a pre-Phase-200-close hygiene pass. Recommend a single 30-line plan to remediate `stories/` and `devtools-mount.tsx` before final phase close.

### Plan-text vs reality reconciliation

**5. [Rule 1 - Bug] Plan task 4 verify command uses `sha1sum livos/packages/livinityd/source/modules/agent/sdk-agent-runner.ts`; correct path + tool is `git hash-object liv/packages/core/src/sdk-agent-runner.ts`**

- **Issue (carryover from Plan 200-01 §2):** The sacred file lives at `liv/packages/core/src/sdk-agent-runner.ts` (post Phase 65-05 cutover); the `livos/packages/livinityd/source/modules/agent/sdk-agent-runner.ts` path does not exist. Also `sha1sum` returns a different digest than `git hash-object` (the latter prepends a `blob {len}\0` git-blob header).
- **Fix used:** `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (matches expected). Pre-commit hook (`.husky/pre-commit` → `scripts/check-sacred.sh`) is the authoritative gate and will verify on commit.

## Acceptance Greps (per plan)

All passing (verified 2026-05-23):

```
$ ls livos/packages/ui/src/components/assistant-ui/
attachment.tsx
composer-trigger-popover.tsx
directive-text.tsx
markdown-text.tsx
reasoning.tsx
thread.tsx
tool-fallback.tsx
tool-group.tsx
tooltip-icon-button.tsx

$ grep -rE "from \"@/lib/utils\"|from \"radix-ui\"" livos/packages/ui/src/components/assistant-ui/
(empty)

$ grep -nE "MessagePrimitive.GroupedParts" livos/packages/ui/src/components/assistant-ui/thread.tsx
249:        <MessagePrimitive.GroupedParts
295:        </MessagePrimitive.GroupedParts>

$ grep -nE "ActionBarPrimitive.Copy" livos/packages/ui/src/components/assistant-ui/thread.tsx
317:      <ActionBarPrimitive.Copy asChild>
326:      </ActionBarPrimitive.Copy>

$ grep -nE "composerSlot" livos/packages/ui/src/components/assistant-ui/thread.tsx
52:// `composerSlot` lets callers (assistant.tsx) inject a custom Composer
55:export type ThreadProps = { composerSlot?: ReactNode };
57:export const Thread: FC<ThreadProps> = ({ composerSlot }) => {
88:            {composerSlot ?? <Composer />}

$ grep -nE "Unstable_TriggerPopover|unstable_defaultDirectiveFormatter" livos/packages/ui/src/components/assistant-ui/composer-trigger-popover.tsx
18 occurrences (Unstable_TriggerPopover{,Root,Categories,Items,...} + unstable_defaultDirectiveFormatter)

$ grep -rE "(LivOS'un|ekranını|sorularına|hatırlar)" livos/packages/ui/src/components/assistant-ui
(empty — INV-200-05 PASS, English UI only)
```

## INV-200-03: Phase 198 generative-UI renderers frozen

Verified by running just the tool-renderers vitest suite (no other Phase 200 code path touches it):

```
$ cd livos/packages/ui && npx vitest run tool-renderers
✓ src/features/liv-ai/tool-renderers.test.tsx (45 tests) 72ms
 Test Files  1 passed (1)
      Tests  45 passed (45)
```

All 45 Phase 198 tool-renderer tests green. `git status` confirms `livos/packages/ui/src/features/liv-ai/tool-renderers.tsx` has **zero modifications** in Plan 200-02. INV-200-03 PASS.

## Sacred SHA Verification

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

INV-200-01 PASS — matches `scripts/sacred-shas-v38.json:expected_sha`. Pre-commit hook (`scripts/check-sacred.sh`) is the authoritative gate; it will independently verify on commit.

## Confirmation

Plan 200-03 (the `@` mention adapter) can proceed:

- All 9 canonical assistant-ui registry files are on disk at `livos/packages/ui/src/components/assistant-ui/`, path-remapped, and compile clean against `tsconfig.json` (zero new typecheck errors).
- `Thread` accepts a `composerSlot?: ReactNode` prop (the one intentional D-200-16 delta) — Plan 200-06 will use this to inject `<LivAiComposer />` once it exists.
- `MessagePrimitive.GroupedParts` routes `tool-call` parts through `part.toolUI` first — Phase 198 generative-UI renderers (16 registrations in `tool-renderers.tsx`) paint unchanged. 45/45 vitest cases green.
- `composer-trigger-popover.tsx` ships the discriminated-union `directive` + `action` props that Plans 200-03/04 will consume to bind the `@` and `/` pickers.
- `directive-text.tsx` ships the chip renderer that Plan 200-06 will mount as `<MessagePrimitive.Parts components={{ Text: DirectiveText }} />` in UserMessage.
- Sacred SHA preserved.

## Deferred Issues

Carried over from Plan 200-01; not in scope for Plan 200-02:

1. **Baseline 508 typecheck errors** in `stories/src/routes/stories/*` and Phase 199 carryovers (`devtools-mount.tsx`, `model-picker.test.tsx`). Plan 200-02 did not introduce any of these; they predate Phase 200.
2. **`pnpm --filter ui test:run` full-suite has 13 failing test files** (40 tests) — all pre-existing test failures unrelated to assistant-ui registry surface. The scoped `tool-renderers` run (the only test the plan explicitly gates on) is green.

Recommend a single ~30-line hygiene plan before Phase 200 final close.

## Self-Check: PASSED

- FOUND: `livos/packages/ui/src/components/assistant-ui/thread.tsx` (16,631 bytes, 454 LOC — replaces Phase 198-02 scaffold)
- FOUND: `livos/packages/ui/src/components/assistant-ui/markdown-text.tsx` (6,436 bytes, 248 LOC)
- FOUND: `livos/packages/ui/src/components/assistant-ui/tooltip-icon-button.tsx` (1,565 bytes, 49 LOC)
- FOUND: `livos/packages/ui/src/components/assistant-ui/attachment.tsx` (6,703 bytes, 223 LOC)
- FOUND: `livos/packages/ui/src/components/assistant-ui/reasoning.tsx` (8,662 bytes, 282 LOC)
- FOUND: `livos/packages/ui/src/components/assistant-ui/tool-group.tsx` (6,786 bytes, 231 LOC)
- FOUND: `livos/packages/ui/src/components/assistant-ui/tool-fallback.tsx` (8,541 bytes, 324 LOC)
- FOUND: `livos/packages/ui/src/components/assistant-ui/composer-trigger-popover.tsx` (8,319 bytes, 245 LOC)
- FOUND: `livos/packages/ui/src/components/assistant-ui/directive-text.tsx` (2,553 bytes, 75 LOC)
- FOUND: Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged on `liv/packages/core/src/sdk-agent-runner.ts`
- FOUND: zero `@/lib/utils` + zero `from "radix-ui"` import occurrences across assistant-ui directory
- FOUND: 45/45 `tool-renderers` vitest cases green (INV-200-03 frozen)
- FOUND: total full-suite typecheck error count unchanged at 508 (no new regressions)
- Commit hash: `b198c5d6` (10 files changed, 2404 insertions(+), 118 deletions(-) — Phase 198 scaffold replaced + 8 new sibling primitives + SUMMARY).
- Sacred-SHA pre-commit hook output: `[sacred-sha] PASS: 20 files verified`.
