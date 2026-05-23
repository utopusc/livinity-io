---
phase: 201-liv-ai-nextjs-iframe
plan: 04
subsystem: liv-ai-app
tags: [composer, mention, slash, model-picker, thread-list, native-fetch, wave-1]
requirements: [REQ-201-04]
provides:
  - subapp.composer.LivAiComposer
  - subapp.composer.mention-adapter
  - subapp.composer.slash-adapter
  - subapp.composer.model-picker
  - subapp.thread-list-adapter (native fetch)
  - subapp.thread.composerSlot
  - subapp.assistant.shell (state + body callback)
depends_on: [201-02, 201-03]
key-files:
  created:
    - livos/packages/liv-ai-app/src/lib/liv-ai/mention-adapter.ts
    - livos/packages/liv-ai-app/src/lib/liv-ai/slash-adapter.ts
    - livos/packages/liv-ai-app/src/lib/liv-ai/slash-commands.ts
    - livos/packages/liv-ai-app/src/lib/liv-ai/models.ts
    - livos/packages/liv-ai-app/src/lib/liv-ai/model-picker.tsx
    - livos/packages/liv-ai-app/src/lib/liv-ai/composer.tsx
    - livos/packages/liv-ai-app/src/lib/liv-ai/thread-list-adapter.ts
    - livos/packages/liv-ai-app/components/assistant-ui/composer-trigger-popover.tsx
    - livos/packages/liv-ai-app/components/ui/dropdown-menu.tsx
  modified:
    - livos/packages/liv-ai-app/app/assistant.tsx
    - livos/packages/liv-ai-app/components/assistant-ui/thread.tsx
decisions:
  - D-201-09 native-fetch transport — adapter rewrites use /trpc batch HTTP
  - D-201-21 reuse Phase 200-05 composer 1:1 with subapp path remap
  - D-201-23 D-200-19 New Conversation runtime sync preserved (4 call sites)
metrics:
  commit: ed1a41c6
  duration_min: ~25
  files_created: 9
  files_modified: 2
  build: pnpm build EXIT 0
  sacred_sha_hook: "PASS: 20 files verified"
---

# Phase 201 Plan 04: Port Adapters + Wire LivAiComposer via composerSlot Summary

Ported Phase 200's six Liv AI composer adapters into the `liv-ai-app` Next.js subapp, rewrote `thread-list-adapter` + model-picker fetches to native `fetch` against livinityd's `/trpc/mastra.agent.*` batch endpoints (no tRPC client added to subapp per D-201-09), extended `app/assistant.tsx` with `selectedModel` state + ref-based `AssistantChatTransport.body` callback feeding `{threadId, config.modelName}` per request, and mounted the composer through a new `composerSlot?: ReactNode` prop on `<Thread>` (D-201-21).

## What landed

### Adapters ported (`src/lib/liv-ai/`)

- **`mention-adapter.ts`** — D-200-08 static catalog of 7 `@`-mention tool entries; thin `unstable_useMentionAdapter` wrapper.
- **`slash-adapter.ts` + `slash-commands.ts`** — 4-command canonical `/` adapter (`/help`, `/clear`, `/screenshot`, `/search`); `/clear` calls `runtime.threads.switchToNewThread()` directly (D-200-11 — converges with the New Conversation button cleanup path).
- **`models.ts`** — 3-model Grok registry (`grok-4.20-0309-non-reasoning` default + reasoning + 4.3); P199 UAT-verified IDs.
- **`model-picker.tsx`** — shadcn DropdownMenu over `LIV_AI_MODELS`; pure UI (`value` + `onChange`).
- **`composer.tsx`** — Plan 200-05 `LivAiComposer` ported 1:1 (Grok footer-strip pattern, `Unstable_TriggerPopoverRoot` wrapper, `data-empty` / `data-running` collapse-while-typing CSS, inline model picker LEFT, Send/Stop RIGHT, English-only copy `"Ask Liv anything…"`).
- **`thread-list-adapter.ts`** — REWRITE: replaced the `@trpc/react-query` `listQ` + `deleteMut` hooks with native `fetch('/trpc/mastra.agent.threads.list?batch=1&input=…')` GET + `fetch('/trpc/mastra.agent.threads.delete?batch=1', {method:'POST'})` POST. Phase 200-07 D-200-19 / D-201-23 `runtime.threads.switchToNewThread()` calls preserved at both call sites (onSwitchToNewThread + onDelete-current cleanup).

### Path remaps applied during port

- `@/shadcn-components/ui/dropdown-menu` → `@/components/ui/dropdown-menu`
- `@/shadcn-components/ui/button` → `@/components/ui/button`
- `@/components/assistant-ui/attachment` → `@/components/attachment`
- `@/components/assistant-ui/tooltip-icon-button` → `@/components/tooltip-icon-button`
- `@/components/assistant-ui/composer-trigger-popover` (unchanged — ported into subapp at same path)
- Button variant remap: `variant="primary"` → `variant="default"`, `size="icon-only"` → `size="icon"` (subapp shadcn registry doesn't expose the `primary` / `icon-only` variants from the livos UI fork). See Deviations.

### Supporting ports

- **`components/assistant-ui/composer-trigger-popover.tsx`** — ported from livos/packages/ui (Plan 200-02 ship). Self-contained — uses `ComposerPrimitive.Unstable_TriggerPopover*` from `@assistant-ui/react`, NO shadcn `popover` dependency required.
- **`components/ui/dropdown-menu.tsx`** — installed via `npx shadcn@latest add dropdown-menu` (the model picker's only new shadcn dep).

### `app/assistant.tsx` extended

- Three-component shell: `AssistantShell` (model state + hydration) → `AssistantShellWithRuntime` (`useChatRuntime` with body callback) → `ThreadListSync` (bridges `useThreadListAdapter().currentThreadId` into the ref).
- `fetchActiveModel()` + `postSetActiveModel()` native-fetch helpers against `/trpc/mastra.agent.getActiveModel` (GET batch) + `/trpc/mastra.agent.setActiveModel` (POST batch).
- `useEffect` hydrates `selectedModel` from server on mount.
- `selectedModelRef` + `currentThreadIdRef` updated via `useEffect` mirrors so the `AssistantChatTransport.body` closure always reads the freshest values (RESEARCH §J5 closure-staleness pitfall — refs, not state, in the body callback).
- `body: () => ({ threadId: currentThreadIdRef.current, config: { modelName: selectedModelRef.current } })` shape exactly per Plan Task 4 spec.

### `components/assistant-ui/thread.tsx` extended

- New `ThreadProps` interface exporting `composerSlot?: ReactNode`.
- `Thread` is now `FC<ThreadProps>`; ViewportFooter renders `composerSlot ?? <Composer />` (minimum-diff pattern — preserves the welcome panel, suggestions, ToolRenderers, message group, and default Composer fallback).

## Verification

```
$ pnpm --filter liv-ai-app build
✓ Compiled successfully in 6.4s
  Running TypeScript ...
  Finished TypeScript in 5.5s ...
✓ Generating static pages (4/4) in 891ms
Route (app)
┌ ○ /
└ ○ /_not-found
```

Acceptance grep results:

| Grep | Required | Got |
|---|---|---|
| `@/shadcn-` in `src/lib/liv-ai/` | 0 | 0 |
| `trpcReact\|useQuery\|useMutation` in `thread-list-adapter.ts` | 0 | 0 |
| `runtime.threads.switchToNewThread` in `thread-list-adapter.ts` | ≥2 | 4 |
| `fetchActiveModel\|postSetActiveModel` in `assistant.tsx` | ≥2 | 5 |
| `composerSlot={<LivAiComposer` in `assistant.tsx` | 1 | 1 |
| `body: () =>` in `assistant.tsx` | 1 | 1 |
| `composerSlot` in `components/assistant-ui/thread.tsx` | ≥2 | 5 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Button `variant="primary"` + `size="icon-only"` not in subapp shadcn registry**
- **Found during:** Task 1 (composer.tsx port)
- **Issue:** Source composer (livos UI fork) uses `<Button variant="primary" size="icon-only">` for the Stop button. The subapp's `components/ui/button.tsx` is the canonical shadcn registry — it has `variant="default"` and `size="icon"` only.
- **Fix:** Remapped `variant="primary"` → `variant="default"` and `size="icon-only"` → `size="icon"` in composer.tsx. The TooltipIconButton for Send already uses default `variant="ghost"` size="icon"` internally so no change needed there (removed the explicit `variant="primary"` prop pass since TooltipIconButton's default cn merge handles styling).
- **Files modified:** `livos/packages/liv-ai-app/src/lib/liv-ai/composer.tsx`
- **Commit:** ed1a41c6

**2. [Rule 3 — Blocking] `components/assistant-ui/composer-trigger-popover.tsx` missing in subapp**
- **Found during:** Task 1 (composer.tsx port — import resolution audit)
- **Issue:** Plan implied composer-trigger-popover already lived in the subapp from earlier 201 plans; only Phase 200 ship lived under `livos/packages/ui/`. The subapp's `components/assistant-ui/` had only `thread.tsx` + `threadlist-sidebar.tsx`.
- **Fix:** Ported the source 1:1 with `@/shadcn-lib/utils` → `@/lib/utils` path remap. Self-contained (no shadcn popover dep).
- **Files modified:** `livos/packages/liv-ai-app/components/assistant-ui/composer-trigger-popover.tsx` (NEW)
- **Commit:** ed1a41c6

**3. [Rule 3 — Blocking] Subapp had no shadcn `dropdown-menu`**
- **Found during:** Task 1 (model-picker.tsx port)
- **Issue:** Model picker imports `DropdownMenu*` from `@/components/ui/dropdown-menu`; not installed in the subapp.
- **Fix:** Plan allowed `npx shadcn@latest add <missing> --yes`. Ran from subapp dir, installed `components/ui/dropdown-menu.tsx` (no new npm deps — radix-ui already present).
- **Files modified:** `livos/packages/liv-ai-app/components/ui/dropdown-menu.tsx` (NEW)
- **Commit:** ed1a41c6

**4. [Rule 1 — Bug] tRPC v10/v11 response envelope shape ambiguity**
- **Found during:** Task 2 (thread-list-adapter native fetch shape)
- **Issue:** Plan example reads `data?.[0]?.result?.data?.threads`. The livinityd tRPC v11 build can wrap responses as `data?.[0]?.result?.data?.json?.threads` (superjson roundtrip). If the backend ever upgrades, the literal `data.threads` access would silently return `undefined` and show 0 threads.
- **Fix:** Defensive fallback chain — try `.data?.threads` first, fall back to `.data?.json?.threads`, otherwise return `[]`. Same pattern applied to `fetchActiveModel`. No backend changes (INV-201-02).
- **Files modified:** `src/lib/liv-ai/thread-list-adapter.ts`, `app/assistant.tsx`
- **Commit:** ed1a41c6

### Architectural notes

- **Three-component assistant.tsx shell** (vs. Plan Task 4's single `AssistantShell` example): the plan example shows `useThreadListAdapter()` being called above `useChatRuntime()` but inside `AssistantShell`. That doesn't actually work — `useThreadListAdapter` calls `useAssistantRuntime()` internally, which requires a parent `<AssistantRuntimeProvider>` in the React tree. The provider only mounts AFTER `useChatRuntime` resolves. Split into `AssistantShell → AssistantShellWithRuntime → ThreadListSync` so the adapter hook fires inside the provider, and we mirror `currentThreadId` into a ref the transport body closure can read. Same semantics as the plan, correct render-tree ordering. Documented in component-level docstrings.

## Known Stubs

None — all wired surfaces hit real backend procedures or local state. `onSwitchToThread` (clicking an existing thread in a future sidebar) is INTENTIONALLY a state-only flip — the runtime-side `UIMessages` reload is deferred to a later Phase 201 plan per D-200-20 / D-201-23 carry. Documented inline as `TODO(phase-201+)`.

## Threat Flags

None — no new network surface introduced. All `fetch` calls hit existing livinityd `/trpc/mastra.agent.*` adminProcedures already in the threat register from Phase 197/198/200. `credentials: 'include'` carries the LivOS session cookie (same trust boundary as the livos UI host shell).

## TDD Gate Compliance

Plan type is `execute` (not `tdd`). No RED/GREEN/REFACTOR gate sequence required. Manual acceptance grep verification + clean `pnpm build` validates the surface.

## Self-Check: PASSED

- File `livos/packages/liv-ai-app/src/lib/liv-ai/mention-adapter.ts` FOUND
- File `livos/packages/liv-ai-app/src/lib/liv-ai/slash-adapter.ts` FOUND
- File `livos/packages/liv-ai-app/src/lib/liv-ai/slash-commands.ts` FOUND
- File `livos/packages/liv-ai-app/src/lib/liv-ai/models.ts` FOUND
- File `livos/packages/liv-ai-app/src/lib/liv-ai/model-picker.tsx` FOUND
- File `livos/packages/liv-ai-app/src/lib/liv-ai/composer.tsx` FOUND
- File `livos/packages/liv-ai-app/src/lib/liv-ai/thread-list-adapter.ts` FOUND
- File `livos/packages/liv-ai-app/components/assistant-ui/composer-trigger-popover.tsx` FOUND
- File `livos/packages/liv-ai-app/components/ui/dropdown-menu.tsx` FOUND
- File `livos/packages/liv-ai-app/app/assistant.tsx` FOUND (modified)
- File `livos/packages/liv-ai-app/components/assistant-ui/thread.tsx` FOUND (modified)
- Commit `ed1a41c6` FOUND in `git log` (sacred-sha hook PASS: 20 files verified)
