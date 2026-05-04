---
phase: 70
plan: 04
subsystem: ui/ai-chat/streaming
tags: [streaming-text, typewriter-caret, markdown, react-markdown, remark-gfm, p66-reuse]
requirements: [COMPOSER-05]
dependency_graph:
  requires:
    - "P66-02: livos/packages/ui/src/components/motion/TypewriterCaret.tsx (anchorRef API)"
    - "P66-02: livos/packages/ui/src/components/motion/index.ts (barrel export)"
    - "react-markdown ^9.0.1 (already in deps)"
    - "remark-gfm ^4.0.0 (already in deps)"
  provides:
    - "LivStreamingText React function component (named export)"
    - "shouldRenderCaret pure helper for caret-toggle decision"
    - "isMarkdownAvailable gate-state reporter"
  affects:
    - "70-08 integration plan: chat-messages.tsx will swap streaming-message render -> LivStreamingText for assistant messages"
tech-stack:
  added: []
  patterns:
    - "react-markdown + remark-gfm for streaming-text rendering"
    - "P66 TypewriterCaret anchored via useRef to content wrapper div"
    - "Pure helper + source-text-invariant test pattern (RTL-absent precedent)"
key-files:
  created:
    - "livos/packages/ui/src/routes/ai-chat/components/liv-streaming-text.tsx (86 lines)"
    - "livos/packages/ui/src/routes/ai-chat/components/liv-streaming-text.unit.test.tsx (90 lines)"
    - ".planning/phases/70-composer-streaming-ux-polish/.markdown-deps-check.txt (recorded markdown gate decision)"
  modified: []
decisions:
  - "Markdown path active — react-markdown ^9.0.1 + remark-gfm ^4.0.0 BOTH present in livos/packages/ui/package.json; D-07 D-NO-NEW-DEPS satisfied without install."
  - "TypewriterCaret API requires anchorRef: RefObject<HTMLElement> (verified by reading the source). Component wraps the markdown-rendered content in a ref'd div and passes the ref to TypewriterCaret. Plan example showed zero-prop <TypewriterCaret /> but plan said 'handles both cases — confirm the actual API on read' — confirmed and used the actual API."
  - "Caret render-gate: streaming AND content non-empty. Empty-content+streaming returns NO caret to avoid orphan caret on empty assistant placeholder (the typing-dots component in 70-05 handles 'waiting for first token' UX)."
  - "Tests use the established UI-package 'RTL-absent' posture (no @testing-library/react). Pure helpers tested directly + two meta-tests assert source-file render path and package.json reality both agree with isMarkdownAvailable() — this is the canary against silent gate drift."
metrics:
  duration_minutes: 4
  completed_date: 2026-05-04
  tasks_completed: 2
  tests_added: 7
  build_status: pass
---

# Phase 70 Plan 04: liv-streaming-text Summary

**One-liner:** `LivStreamingText` renders streaming assistant content via `react-markdown` + `remark-gfm` and pins P66's `TypewriterCaret` to the trailing edge of the rendered content via a `useRef` anchor — caret hugs the last token while streaming, vanishes when streaming ends.

## What Was Built

A thin streaming-text renderer at `livos/packages/ui/src/routes/ai-chat/components/liv-streaming-text.tsx` that:

1. **Markdown path** (active in this build): renders `content` through `<ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>` inside a `useRef`-tracked wrapper.
2. **Caret-hugging behavior**: when `isStreaming && content.length > 0`, mounts `<TypewriterCaret anchorRef={anchorRef} />` as a sibling — P66-02's caret walks the anchor's last text node and pins itself via `MutationObserver` + `requestAnimationFrame`, so the 2px cyan cursor visually hugs the latest streamed character.
3. **Orphan-caret guard**: empty-content + streaming returns NO caret. Avoids the "blinking cursor on a blank message" anti-pattern; the 70-05 typing-dots component handles "waiting for first token" UX instead.

The component is intentionally thin (~86 LOC) so the caret is reusable across reasoning cards (P75) and other streaming surfaces.

## Markdown Gate Decision

| Dependency      | Required for markdown path | In `livos/packages/ui/package.json` | Result    |
| --------------- | -------------------------- | ----------------------------------- | --------- |
| `react-markdown` | yes                        | `^9.0.1` ✓                         | present   |
| `remark-gfm`    | yes                        | `^4.0.0` ✓                         | present   |
| **Decision**    | —                          | —                                   | **markdown path** |

Recorded in `.planning/phases/70-composer-streaming-ux-polish/.markdown-deps-check.txt` (the file was already written by 70-01; verified for 70-04 and content matches reality). D-07 D-NO-NEW-DEPS upheld — no `npm install` performed.

If a future change ever removes either dep, the file should flip to `=absent`, the component swaps to a `<pre className='whitespace-pre-wrap font-sans'>{content}</pre>` fallback, and `isMarkdownAvailable()` flips to `false`. Two of the seven unit tests are drift-canaries that fail loudly if any of these flip without the others.

## Public API

```typescript
export interface LivStreamingTextProps {
  content: string
  isStreaming: boolean
  className?: string
}

export function shouldRenderCaret(args: {isStreaming: boolean; content: string}): boolean
export function isMarkdownAvailable(): boolean
export function LivStreamingText(props: LivStreamingTextProps): JSX.Element
```

`shouldRenderCaret` truth table:

| isStreaming | content | result |
| ----------- | ------- | ------ |
| true        | "hi"    | true   |
| true        | ""      | false  |
| false       | "hi"    | false  |
| false       | ""      | false  |

## P66 Reuse

- **`TypewriterCaret`** from `@/components/motion` is the SOLE caret implementation (CONTEXT D-09). Zero bespoke caret CSS in this file. The caret's MutationObserver-driven last-text-node tracking is what makes the caret "hug" the latest streamed character without any per-render layout work in `LivStreamingText` itself.
- The component imports from the P66 motion barrel (`@/components/motion`), not the underlying `./TypewriterCaret` path — keeps the import surface tied to the documented public API.

## Verification

| Check                                                         | Result |
| ------------------------------------------------------------- | ------ |
| File `liv-streaming-text.tsx` exists, 86 lines (≥80 min)       | ✓ pass  |
| File contains `LivStreamingText`, `shouldRenderCaret`, `isMarkdownAvailable`, `TypewriterCaret`, `content`, `isStreaming` | ✓ pass  |
| Markdown gate consistent (pkg has md=true, src uses md=true)  | ✓ pass  |
| Test file `liv-streaming-text.unit.test.tsx` exists, 90 lines (≥60 min) | ✓ pass  |
| 7 vitest tests, all pass                                      | ✓ pass  |
| `pnpm --filter ui build` exit 0                               | ✓ pass  |
| Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged pre/post each task | ✓ pass  |
| No new npm dependencies added                                 | ✓ pass  |

### Test Output (vitest)

```
✓ shouldRenderCaret (D-09, D-33) > returns true when streaming and content non-empty
✓ shouldRenderCaret (D-09, D-33) > returns false when streaming and content empty (orphan-caret guard)
✓ shouldRenderCaret (D-09, D-33) > returns false when not streaming regardless of content
✓ shouldRenderCaret (D-09, D-33) > returns false when both not streaming and content empty
✓ isMarkdownAvailable (D-07, D-33) > returns a boolean
✓ isMarkdownAvailable (D-07, D-33) > agrees with the source-file render path (no internal drift)
✓ isMarkdownAvailable (D-07, D-33) > agrees with package.json reality (D-NO-NEW-DEPS gate)

Test Files  1 passed (1)
     Tests  7 passed (7)
  Duration  1.91s
```

### Build Output

`pnpm --filter ui build` ran in ~44s, exit 0. The pre-existing 1.4MB `index-*.js` chunk-size warning is out of scope (P66 known issue). No new errors introduced by this plan.

## Commits

| Task | Hash       | Message                                                                       |
| ---- | ---------- | ----------------------------------------------------------------------------- |
| 1    | `bf615c8c` | feat(70-04): add LivStreamingText with markdown gate + TypewriterCaret anchor |
| 2    | `c0d4966d` | test(70-04): add LivStreamingText unit tests (caret toggle + markdown gate)   |

## Deviations from Plan

**Note:** The plan example code showed `<TypewriterCaret />` as a zero-prop usage. The actual P66-02 shipped API requires `anchorRef: RefObject<HTMLElement>` (verified by reading `livos/packages/ui/src/components/motion/TypewriterCaret.tsx`). The plan explicitly anticipated this:

> "The plan handles both cases — confirm the actual API on read."

So this is **not a deviation** — it's the plan's branching behavior taking the "use the actual API" branch. The component wraps the markdown-rendered content in a `useRef<HTMLDivElement>` div and threads the ref into `TypewriterCaret`. Functionally equivalent to the plan's example pseudocode (caret renders as a sibling after content), just wired through the proper anchor pattern.

No Rule 1/2/3 auto-fixes were applied — plan executed cleanly.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file-access, or schema changes. The single trust boundary (server-emitted content → DOM render) is mitigated by `react-markdown`'s default behavior of NOT rendering raw HTML and not invoking `dangerouslySetInnerHTML`. Threat register T-70-04-01..03 from PLAN frontmatter remain accurate (mitigate / accept / accept).

## Self-Check: PASSED

- File `livos/packages/ui/src/routes/ai-chat/components/liv-streaming-text.tsx` — FOUND (86 lines)
- File `livos/packages/ui/src/routes/ai-chat/components/liv-streaming-text.unit.test.tsx` — FOUND (90 lines)
- File `.planning/phases/70-composer-streaming-ux-polish/.markdown-deps-check.txt` — FOUND
- Commit `bf615c8c` — FOUND in git log
- Commit `c0d4966d` — FOUND in git log
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — UNCHANGED
- Test count ≥ 6: 7 tests — PASS
- Build exit 0 — PASS
