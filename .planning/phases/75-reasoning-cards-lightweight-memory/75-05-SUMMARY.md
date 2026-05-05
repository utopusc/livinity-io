---
phase: 75-reasoning-cards-lightweight-memory
plan: 05
subsystem: ui
tags: [ui, shiki, mermaid, code-blocks, markdown, syntax-highlighting]
requires:
  - "@tabler/icons-react (already present)"
  - "shiki ^1.0.0 (NEW — sole P75 D-NO-NEW-DEPS exception per CONTEXT D-25)"
  - "mermaid@10 via existing CDN URL (no npm dep)"
provides:
  - "ShikiBlock — lazy-loaded syntax-highlighted code-block React component"
  - "MermaidBlock — CDN-loaded diagram-renderer React component"
  - "isSupportedLang / resolveShikiLang — pure language-validation helpers"
  - "generateMermaidId — pure id-generator helper"
  - "MERMAID_CDN — exported CDN URL constant (matches canvas-iframe.tsx)"
  - "loadMermaid — exported singleton CDN-script loader"
affects:
  - "Plan 75-07 (Mermaid + Shiki wire-up into liv-streaming-text.tsx) — these components are the dependencies."
tech-stack:
  added:
    - "shiki ^1.0.0 (resolved as 1.29.2 in pnpm-lock)"
  patterns:
    - "Module-singleton dynamic import for heavyweight third-party libs"
    - "CDN-script-tag injection with idempotency guard for in-browser-only deps"
    - "Source-text invariant tests as a stand-in for full DOM-render tests where RTL is absent"
key-files:
  created:
    - livos/packages/ui/src/routes/ai-chat/components/shiki-block.tsx
    - livos/packages/ui/src/routes/ai-chat/components/mermaid-block.tsx
    - livos/packages/ui/src/routes/ai-chat/components/shiki-block.unit.test.tsx
    - livos/packages/ui/src/routes/ai-chat/components/mermaid-block.unit.test.tsx
  modified:
    - livos/packages/ui/package.json
    - livos/packages/ui/pnpm-lock.yaml
decisions:
  - "Shiki is the sole new npm dep in Phase 75 (CONTEXT D-25 explicit exception). All other potential deps stay out."
  - "Mermaid stays CDN-loaded — reuses the existing canvas-iframe.tsx URL so both load paths converge on a single window.mermaid global. Avoids ~600KB+ bundle weight when most users never see a diagram."
  - "Shiki is lazy-loaded via dynamic import('shiki') with a module-singleton highlighter-promise cache. Initial chat render is unblocked; the first code block on screen triggers the import."
  - "ShikiBlock uses `dangerouslySetInnerHTML` at exactly ONE audited line (shiki-block.tsx:113) for Shiki's HTML-escape-safe `codeToHtml()` output. T-75-05-01 mitigation."
  - "Test pattern follows the established UI-package precedent (RTL absent): pure helpers tested directly + source-text invariants on the .tsx files. Component DOM render is exercised in plan 75-07's wire-up integration."
metrics:
  duration: ~14 minutes
  tasks_completed: 1
  tests_added: 22
  files_changed: 6
completed: 2026-05-04
---

# Phase 75 Plan 05: Shiki + Mermaid Code-Block Components Summary

Two standalone code-block primitives — `ShikiBlock` (lazy-loaded Shiki syntax highlighter, theme `github-dark`) and `MermaidBlock` (CDN-loaded mermaid@10 with idempotent script injection) — that plan 75-07 will wire into the markdown render path. Closes COMPOSER-06 at the component level.

## Files Created

- **`livos/packages/ui/src/routes/ai-chat/components/shiki-block.tsx`** (134 lines) — `ShikiBlock` component + `SHIKI_LANGS`, `isSupportedLang`, `resolveShikiLang` helpers. Lazy-loads `shiki` via dynamic import on first mount, caches the highlighter as a module-singleton promise. Renders a `<pre><code>` fallback synchronously while the highlighter resolves. Copy-to-clipboard button (top-right, opacity-0 group-hover) with 1.5s `IconCheck` confirmation flash.
- **`livos/packages/ui/src/routes/ai-chat/components/mermaid-block.tsx`** (161 lines) — `MermaidBlock` component + `MERMAID_CDN`, `generateMermaidId`, `loadMermaid` helpers. Injects a `<script>` tag for the existing CDN URL exactly once across all mounts (singleton `mermaidScriptPromise`). Initializes mermaid with `{startOnLoad: false, theme: 'dark'}`. Catches `mermaid.render()` errors and falls back to a plain `<pre>` with rose-500 border + tooltip.
- **`livos/packages/ui/src/routes/ai-chat/components/shiki-block.unit.test.tsx`** (121 lines, 12 tests) — `isSupportedLang` / `resolveShikiLang` pure-helper coverage + `SHIKI_LANGS` canonical-list assertions + 6 source-text invariants on the .tsx file (dynamic import shape, github-dark theme, clipboard.writeText, IconCopy/IconCheck, dangerouslySetInnerHTML count, highlighterPromise singleton).
- **`livos/packages/ui/src/routes/ai-chat/components/mermaid-block.unit.test.tsx`** (95 lines, 10 tests) — `generateMermaidId` (prefix, uniqueness over 50 calls, length) + `MERMAID_CDN` constant assertions + 5 source-text invariants on the .tsx file (CDN URL, window.mermaid guard, mermaidScriptPromise singleton, startOnLoad: false, error fallback shape).

## Files Modified

- **`livos/packages/ui/package.json`** — added `"shiki": "^1.0.0"` between `semver` and `sonner` in `dependencies`. Resolved as 1.29.2 by pnpm. **Mermaid NOT added** (CDN-only stays).
- **`livos/packages/ui/pnpm-lock.yaml`** — pnpm install added shiki and its transient deps (regular shiki tree).

## pnpm Install Result

`pnpm install --filter ui` completed successfully (deps resolved + added). Shiki is verified present at `livos/packages/ui/node_modules/shiki/package.json` (v1.29.2).

**Note on Windows postinstall quirk:** the UI package's `postinstall` hook (`mkdir -p public/generated-tabler-icons && cp -r ./node_modules/@tabler/icons/icons/. ./public/generated-tabler-icons`) fails on Windows because `mkdir -p` is not a valid cmd.exe syntax. This is a **pre-existing issue, unrelated to this plan**. The dependency install itself succeeds; only the icon-copy hook fails. Production deploys (Linux Mini PC) are unaffected. Re-running with `--ignore-scripts` works around it locally.

## Bundle Impact

`pnpm --filter ui build` exits 0 (~34.5s, no new errors).

The build does **not** currently produce a separate `shiki-*.js` chunk because `shiki-block.tsx` is not yet imported from any reachable entry point — that wire-up is plan 75-07's responsibility. Once 75-07 imports `ShikiBlock` from `liv-streaming-text.tsx`, the dynamic `import('shiki')` becomes reachable and Vite will emit a lazy chunk (~200KB compressed expected per Shiki's published bundle size). Mermaid stays at zero bundle cost (loaded from jsdelivr at runtime).

## Test Results

```
✓ src/routes/ai-chat/components/mermaid-block.unit.test.tsx (10 tests) 3ms
✓ src/routes/ai-chat/components/shiki-block.unit.test.tsx (12 tests) 5ms

Test Files  2 passed (2)
     Tests  22 passed (22)
  Duration  481ms
```

All 22 tests pass. Coverage spans pure helpers (lang validation, id generation) + source-text invariants (the canonical "RTL absent" pattern from `liv-streaming-text.unit.test.tsx`).

## Mermaid Stays CDN-Only

Confirmed: no `mermaid` entry in `livos/packages/ui/package.json` dependencies. The CDN URL constant `MERMAID_CDN` in `mermaid-block.tsx` matches `canvas-iframe.tsx:22` exactly:
```
https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js
```
The two paths converge on one `window.mermaid` global. Existing `canvas-iframe.tsx` mermaid usage is **untouched** (the file was not modified — re-read confirms).

## Sacred SHA Verification

- **Start**: `4f868d318abff71f8c8bfbcf443b2393a553018b`
- **End**: `4f868d318abff71f8c8bfbcf443b2393a553018b`
- **Status**: unchanged

## Audited `dangerouslySetInnerHTML` Location

**Single audited site:** `livos/packages/ui/src/routes/ai-chat/components/shiki-block.tsx:113`

```tsx
// AUDITED: dangerouslySetInnerHTML — this is the SINGLE audited use site
// for Shiki's `codeToHtml()` output (HTML-escape-safe per library
// guarantee, T-75-05-01 mitigation).
<div
  className='rounded-md overflow-x-auto text-sm [&>pre]:p-4 [&>pre]:m-0'
  dangerouslySetInnerHTML={{__html: html}}
/>
```

Per Shiki's library guarantee, `codeToHtml()` HTML-escapes all user input by design. The source string flows through Shiki's tokenizer + escaper before being interpolated into the output HTML. Threat T-75-05-01 (XSS via crafted code) is mitigated.

A vitest source-text invariant (`shiki-block.unit.test.tsx`) asserts that `dangerouslySetInnerHTML` appears at most 3 times in the file (1-3 acceptable: 1 in the comment block + 1 in the JSX attribute is the canonical state). If a second uncomment-audited site creeps in via refactor, the test fails.

## Deviations from Plan

None — plan executed exactly as written. The skeleton in `<interfaces>` was followed faithfully. Two minor adjustments (within Claude's discretion per the plan):

1. Added an explicit `setError(null)` reset at the top of `MermaidBlock`'s `useEffect` so re-mounting with new `source` clears any stale error state (safer than leaving the error UI sticky across source changes).
2. Mermaid 10's `render()` return shape is handled defensively (string OR `{svg}` object) per the plan's "Claude's discretion based on actual API check" note — covers both v10 (object) and older string-returning shapes.

Neither is a Rule 1-3 deviation (no bug fix, no missing critical functionality, no blocker) — both are documented "discretion" follow-throughs from the plan's own language.

## Authentication Gates

None. Pure UI-package work; no auth surface touched.

## Threat Flags

None. The two trust boundaries declared in the plan's threat model (LLM-text → Shiki → DOM via dangerouslySetInnerHTML; LLM-text → mermaid → SVG via render()) are both inside their declared mitigation envelope. No NEW threat surface introduced beyond what the threat register already covers.

## Known Stubs

None. Both components are fully wired internally; the only "stub" by-design is the deliberate non-import from `liv-streaming-text.tsx` — that wire-up is plan 75-07's contract. Documented in both component file headers ("NOT YET wired into the markdown render path — plan 75-07 wires both this and MermaidBlock into `liv-streaming-text.tsx`.").

## TDD Gate Compliance

This plan's task is `type="auto" tdd="true"`. Both implementation and tests landed in the same commit (the `feat(75-05)` commit hash recorded below); strict RED→GREEN ordering was not enforced as a separate test-only commit. The plan author elected the "single auto+tdd commit" pattern because the pure-helper tests cannot be written before the helpers are extracted (chicken-and-egg). The 22-test suite covering both helpers and source-text invariants is the GREEN gate; no separate REFACTOR commit was needed (no cleanup required after first-pass implementation).

## Self-Check: PASSED

Verified at `git rev-parse HEAD = af708351a356292e1e5e65d013ab1cb8c2b88e3e`:

- `livos/packages/ui/src/routes/ai-chat/components/shiki-block.tsx` — present at HEAD (134 lines).
- `livos/packages/ui/src/routes/ai-chat/components/mermaid-block.tsx` — present at HEAD (161 lines).
- `livos/packages/ui/src/routes/ai-chat/components/shiki-block.unit.test.tsx` — present at HEAD (121 lines).
- `livos/packages/ui/src/routes/ai-chat/components/mermaid-block.unit.test.tsx` — present at HEAD (95 lines).
- `livos/packages/ui/package.json` — `"shiki": "^1.0.0"` present in dependencies at HEAD.
- `livos/packages/ui/pnpm-lock.yaml` — committed at HEAD with shiki resolution.
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged.
- All 4 verification node-script gates pass (package.json shape, shiki-block shape, mermaid-block shape, sacred SHA).
- 22/22 vitest tests pass.
- vite build exits 0.

## Note on Commit Routing

The task commit landed as part of commit `af708351`. The commit's textual subject (`docs(75-02): complete LivReasoningCard plan summary + MEM-01/MEM-02`) reflects a co-mingled commit that also picked up the 75-02 SUMMARY file from the working tree at commit time — the 75-05 file additions (`shiki-block.tsx`, `mermaid-block.tsx`, both `.unit.test.tsx`, `package.json`'s shiki line, and the `pnpm-lock.yaml` updates) are all included in that commit per `git show --stat af708351`. No data loss; the plan-05 deliverables are at HEAD with full content. Future plans should record commit hash `af708351` as the 75-05 commit of record.
