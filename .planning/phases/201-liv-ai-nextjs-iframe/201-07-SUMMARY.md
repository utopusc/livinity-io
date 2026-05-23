---
phase: 201
plan: 07
subsystem: ui
tags: [iframe, wire, wave-3, 201-07]
status: code-complete
deploy: pending-mini-pc
requires:
  - "Phase 201-04 (adapters + LivAiComposer in subapp — ed1a41c6)"
  - "Phase 201-06 (Caddy /liv-ai-app/* handle + systemd unit + update.sh — fc255096)"
provides:
  - "LivOS desktop Liv AI window mounts <iframe src='/liv-ai-app'> instead of the Vite-embedded <Assistant />"
  - "Same-origin LIVINITY_SESSION JWT auto-flow from parent → iframe → /chat/livAi (no postMessage bridge needed)"
affects:
  - "livos/packages/ui/src/modules/window/app-contents/liv-ai-content.tsx (REPLACED — 17/-10 line diff)"
  - "Window-content registry switch on appId='LIVINITY_liv-ai' (export-shape preserved)"
  - "livos/packages/ui/src/features/liv-ai/* — UNREFERENCED from window mount; left on disk per D-201-15 fallback grace"
tech-stack:
  added: []
  patterns:
    - "Same-origin iframe (no postMessage; cookie auto-flows)"
    - "allow='clipboard-read; clipboard-write' so the subapp Composer can paste/copy without prompts"
    - "Default-export shape preserved to match window-content.tsx switch consumer"
key-files:
  created: []
  modified:
    - livos/packages/ui/src/modules/window/app-contents/liv-ai-content.tsx
decisions:
  - "D-201-14 respected — entire file body replaced with the verbatim iframe-only shape from Plan 201-07 Task 1. Old `import {Assistant} from '@/features/liv-ai/assistant'` removed."
  - "D-201-05 respected — iframe src='/liv-ai-app' (relative same-origin path served by Caddy `handle /liv-ai-app/*` block from Plan 201-06, terminating on 127.0.0.1:3010)."
  - "D-201-15 respected — `livos/packages/ui/src/features/liv-ai/*` (assistant.tsx + composer.tsx + 6 adapters + tool-renderers + ApprovalCard etc.) NOT deleted. Files survive on disk as a one-release fallback; only the window-content mount-point reference is flipped."
  - "Export shape kept as `export default function LivAiContent()` — matched the pre-existing P198-02 file, matches the verbatim Plan Task 1 template, matches the window-content registry's default-import consumer."
metrics:
  duration_minutes: 4
  completed_date: "2026-05-23"
  tasks_completed: 2
  files_modified: 1
  files_created: 0
---

# Phase 201 Plan 07: Liv AI Window → iframe Wrap Summary

**One-liner:** Window-content `liv-ai-content.tsx` flipped from Vite-embedded `<Assistant />` to same-origin `<iframe src="/liv-ai-app">` — Wave 3 cut-over making the Next.js subapp the canonical Liv AI surface inside the LivOS desktop.

## Objective

Flip the LivOS desktop's Liv AI window from the Phase 198-02 Vite-embedded `<Assistant />` mount to a same-origin iframe pointing at the Phase 201-01..06 standalone Next.js App Router subapp running on 127.0.0.1:3010 behind Caddy's `handle /liv-ai-app/*` reverse-proxy block.

## What Was Built

### Task 1 — Replace liv-ai-content.tsx body

Replaced the entire body of `livos/packages/ui/src/modules/window/app-contents/liv-ai-content.tsx` with the verbatim shape from Plan 201-07 Task 1:

```tsx
export default function LivAiContent() {
  return (
    <iframe
      src="/liv-ai-app"
      title="Liv AI"
      className="h-full w-full border-0 bg-background"
      allow="clipboard-read; clipboard-write"
    />
  )
}
```

- Removed import: `import {Assistant} from '@/features/liv-ai/assistant'`
- Old jsx return: `<Assistant />`
- New jsx return: same-origin iframe with full-bleed sizing + clipboard `allow` for paste-into-Composer UX
- Export shape: **default export preserved** (matches the previous file shape exactly; window-content.tsx switch consumer is default-import-based)

### Task 2 — Commit

Atomic commit `1eb9e7de`:

```
feat(201-07): liv-ai-content.tsx -> iframe to /liv-ai-app (Next.js subapp)
```

Sacred SHA pre-commit hook: `[sacred-sha] PASS: 20 files verified`.

## Acceptance Criteria

| AC                                                                                              | Status |
| ----------------------------------------------------------------------------------------------- | ------ |
| `grep "/liv-ai-app" liv-ai-content.tsx` → ≥1 hit (iframe src=)                                  | PASS (2 hits — 1 in src=, 1 in doc-comment) |
| `grep -E "Assistant\|LivAiChatWindow\|trpcReact" liv-ai-content.tsx` → 0 hits in code           | PASS (only 1 doc-comment mention of `<Assistant />` historical context; 0 in imports/JSX) |
| `pnpm --filter ui build` EXIT 0                                                                 | PASS (built in 45.87s) |
| Sacred SHA hook PASS                                                                            | PASS (`[sacred-sha] PASS: 20 files verified`) |
| Export-shape preserved (default export consumed by window-content.tsx)                          | PASS (`export default function LivAiContent`) |

## Verification

```
$ git log --oneline 1eb9e7de -n 1
1eb9e7de feat(201-07): liv-ai-content.tsx -> iframe to /liv-ai-app (Next.js subapp)

$ grep "/liv-ai-app" livos/packages/ui/src/modules/window/app-contents/liv-ai-content.tsx
# 2 hits: src="/liv-ai-app" + doc-comment reference to Caddy path

$ grep -E "Assistant|LivAiChatWindow|trpcReact" livos/packages/ui/src/modules/window/app-contents/liv-ai-content.tsx
# 1 hit (doc-comment): "The previous Vite-embedded <Assistant /> ..."
# 0 hits in imports / JSX

$ cd livos && pnpm --filter ui build
✓ built in 45.87s (EXIT 0)
```

## Deviations from Plan

**None.** Plan executed exactly as written — single-file replacement with the verbatim template from Task 1. Default-export shape verified against the existing file before write (matched the plan's example exactly, no preservation branch needed).

## Invariants Preserved

- **Sacred SHA** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved (hook PASS on the feat commit; sacred file `liv/packages/core/src/sdk-agent-runner.ts` untouched).
- **D-201-15** — `livos/packages/ui/src/features/liv-ai/**` left on disk as one-release fallback. No deletes.
- **INV-201-02** — backend untouched. This plan only mutates the window-content mount file in the Vite UI package.
- **INV-201-05** — English-only UI (the new file is all English: title, doc comment, JSX text → none).
- **Export-shape compatibility** — `export default function LivAiContent()` matches the window-content registry's default-import consumer (no rename / no shape flip).

## Known Stubs

None. The iframe wrap is the final shape per D-201-14.

## Threat Flags

None. iframe is same-origin (no new trust boundary). `allow="clipboard-read; clipboard-write"` is permission-attribute scoped to the same-origin frame and required for the Composer's paste-image-from-clipboard UX (which exists in the subapp Composer per Plan 201-04).

## Carry-overs

- **Plan 201-08** (Wave 3 — final): Mini PC deploy walk via `bash /opt/livos/update.sh` + operator browser UAT against `bruce.livinity.io` (open Liv AI window → confirm iframe renders the Next.js subapp → send a message → assert SSE chunks arrive + tool-UI primitives render + ApprovalCard HITL works + ThreadList sidebar populates from `mastra.agent.threads.list`).
- **One-release window:** after Plan 201-08 UAT passes, the next milestone can delete `livos/packages/ui/src/features/liv-ai/**` (assistant.tsx + composer.tsx + 6 adapters + tool-renderers + ApprovalCard surface) since the iframe wrap supersedes them.

## Self-Check: PASSED

- File `livos/packages/ui/src/modules/window/app-contents/liv-ai-content.tsx`: FOUND, 22 lines, iframe-only body.
- Commit `1eb9e7de142e1ef758a62b9f018b150bf8d49adb`: FOUND in `git log`.
- Build EXIT 0 verified (45.87s, Vite PWA emit, no TS errors).
- Sacred SHA hook PASS verified (`[sacred-sha] PASS: 20 files verified` in commit output).
