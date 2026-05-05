---
phase: 75-reasoning-cards-lightweight-memory
plan: 04
subsystem: ui/ai-chat/export
tags: [ui, export, markdown, json, file-saver, utils, mem-08]
requires:
  - "livos/packages/ui/file-saver@^2.0.5 (already wired, package.json:72)"
  - "livos/packages/ui/@types/file-saver@^2.0.7 (already wired, package.json:128)"
provides:
  - "livos/packages/ui/src/routes/ai-chat/utils/export-conversation.ts → exportToMarkdown / exportToJSON / buildMarkdown / buildJSON / safeFilename + ConversationData / ConversationMessage / ConversationToolCall types"
affects:
  - "Plan 75-07 (UI wire-up: pin button + export button mounts these utilities into the conversation header)"
tech_stack:
  added: []
  patterns:
    - "Pure-helper + thin-wrapper split — buildMarkdown/buildJSON/safeFilename have zero side effects (testable without DOM); exportToMarkdown/exportToJSON wrap saveAs(blob, filename)"
    - "vi.mock('file-saver', …) BEFORE import — keeps tests free of jsdom Blob/File quirks"
    - "Markdown shape mirrors CONTEXT D-21 verbatim — header + role sections + reasoning blockquote + tool-call <details>"
key_files:
  created:
    - livos/packages/ui/src/routes/ai-chat/utils/export-conversation.ts
    - livos/packages/ui/src/routes/ai-chat/utils/export-conversation.unit.test.ts
  modified: []
decisions:
  - "Filename sanitization is a *replace* not a *strip* — `'!!!'` becomes `'___'` (non-empty, returned as-is). Empty fallback only triggers when input is the empty string (or whitespace-only after trim)."
  - "Tool call output rendering is type-aware: strings pass through unchanged, objects/arrays JSON.stringify with 2-space indent. Output block omitted when output is undefined."
  - "Reasoning section guarded by `m.reasoning && m.reasoning.trim().length > 0` — null, undefined, empty, and whitespace-only reasoning all skip the blockquote."
  - "PDF export intentionally NOT shipped (out of scope per CONTEXT D-21 — would require a new dep)."
metrics:
  duration_seconds: 220
  tasks_completed: 1
  files_changed: 2
  completed: "2026-05-04T17:59:00.000Z"
requirements_satisfied:
  - "MEM-08 (partial — utility shipped; UI wire-up lands in plan 75-07)"
---

# Phase 75 Plan 04: Conversation Export Utilities Summary

Conversation export helpers for the ai-chat surface — pure markdown/JSON formatters plus a thin `file-saver` browser-download wrapper, wired with 24 vitest cases that mock `file-saver` to keep the pure helpers DOM-free.

## What Shipped

### Files Created

| File | Lines | Purpose |
| --- | --- | --- |
| `livos/packages/ui/src/routes/ai-chat/utils/export-conversation.ts` | 163 | Pure helpers + saveAs wrappers |
| `livos/packages/ui/src/routes/ai-chat/utils/export-conversation.unit.test.ts` | 225 | 24 vitest cases (mocks file-saver) |

### Public Surface

```typescript
export type ConversationToolCall = { name: string; input: unknown; output?: unknown; isError?: boolean }
export type ConversationMessage = { id?: string; role: 'user'|'assistant'|'system'|'tool'; content: string; reasoning?: string|null; toolCalls?: ConversationToolCall[]; ts?: number }
export type ConversationData = { id: string; title: string; createdAt: number|string|Date; messages: ConversationMessage[] }

export function safeFilename(title: string): string
export function buildMarkdown(conv: ConversationData): string
export function buildJSON(conv: ConversationData): string
export function exportToMarkdown(conv: ConversationData): void   // saveAs wrapper
export function exportToJSON(conv: ConversationData): void       // saveAs wrapper
```

## Markdown Shape (CONTEXT D-21)

```
# ${title}
*Exported ${ISO} · ${count} messages*

---

## ${RoleLabel}

> **Reasoning:**
> line 1
> line 2

${content}

<details><summary>Tool: ${name}</summary>

\`\`\`json
${input}
\`\`\`

Result:

\`\`\`
${output}
\`\`\`

</details>
```

No deviations from CONTEXT D-21 shape — implementation follows the plan's `<interfaces>` block byte-for-byte.

## Test Coverage

24 vitest cases (plan minimum: 11):

| Group | Cases | Coverage |
| --- | --- | --- |
| `safeFilename` | 5 | strips unsafe, fallback for empty, replaces (not strips) all-unsafe, 64-char trim, preserves safe chars |
| `buildMarkdown` | 12 | title heading start, message count, ISO date, role labels (User/Assistant/System/Tool), reasoning blockquote present, reasoning skipped (null + empty), tool-call `<details>` rendering, output as string, output as object/JSON, output omission, separator `\n\n---\n\n` |
| `buildJSON` | 2 | round-trip parseable, 2-space indent |
| `exportToMarkdown` | 2 | saveAs called once + correct .md filename, Blob mime type `text/markdown;charset=utf-8` |
| `exportToJSON` | 2 | saveAs called once + correct .json filename, Blob mime type `application/json;charset=utf-8` |

**Test run (GREEN phase):**
```
✓ src/routes/ai-chat/utils/export-conversation.unit.test.ts (24 tests) 9ms
Test Files  1 passed (1)
Tests       24 passed (24)
Duration    1.42s
```

## Verification Gates

| Gate | Result |
| --- | --- |
| Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` (start) | matched |
| Sacred file SHA (end) | `4f868d318abff71f8c8bfbcf443b2393a553018b` — unchanged |
| Shape probe (required exports + forbidden patterns) | OK |
| `pnpm --filter ui exec vitest run …export-conversation.unit.test.ts` | 24/24 pass, exit 0 |
| `pnpm --filter ui build` | clean, 46.71s, exit 0 |
| New dependencies introduced | None (file-saver + @types/file-saver already wired) |
| Forbidden constructs (`dangerouslySetInnerHTML`, `jspdf`, `html-to-pdf`) | absent |

## Commits

| Phase | Commit | Message |
| --- | --- | --- |
| RED | `2c61d643` | test(75-04): add failing tests for conversation export utilities |
| GREEN | `73bc3a4f` | feat(75-04): implement conversation export utilities (markdown + JSON) |

## TDD Gate Compliance

- RED: `2c61d643` (test commit) — vitest reported `Failed to load url ./export-conversation` confirming the module under test was absent.
- GREEN: `73bc3a4f` (feat commit) — 24/24 cases green.
- REFACTOR: not needed; code matches plan's `<interfaces>` block byte-for-byte and has no duplication.

## Deviations from Plan

None — plan executed exactly as written. The `<interfaces>` block in 75-04-PLAN.md was complete and contradiction-free; both files match the contract verbatim with the only adjustment being **expanding test coverage from the minimum 11 to 24 cases** (covering additional edge cases like reasoning-as-empty-string, tool-output-omission, blob mime types).

## Threat Model Compliance

Per the plan's `<threat_model>`:

- **T-75-04-01 (Tampering — path traversal via filename)** — `mitigate`: `safeFilename` regex `[^\w\-. ]` strips `/` and `\`. Verified by `safeFilename('Hello "world"/<test>')` → `'Hello _world___test_'` test case.
- **T-75-04-02 (Information Disclosure — sensitive content on disk)** — `accept`: user-initiated action. No mitigation required.
- **T-75-04-03 (DoS — gigabyte download)** — `accept`: browser download dialog gates the action. No mitigation required.

No new threat surface introduced beyond the plan's `<threat_model>`.

## Auth Gates

None encountered.

## Known Stubs

None — every exported symbol is fully implemented and tested.

## Self-Check: PASSED

- `livos/packages/ui/src/routes/ai-chat/utils/export-conversation.ts` exists (163 lines)
- `livos/packages/ui/src/routes/ai-chat/utils/export-conversation.unit.test.ts` exists (225 lines)
- Commit `2c61d643` (RED) found in `git log`
- Commit `73bc3a4f` (GREEN) found in `git log`
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged
- 24/24 vitest cases pass
- vite build clean

## Next Plan

**Plan 75-07** wires the export buttons into the ai-chat header — imports `{exportToMarkdown, exportToJSON}` from this module and mounts them on a per-conversation menu.
