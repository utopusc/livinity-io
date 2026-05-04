---
phase: 70-composer-streaming-ux-polish
plan: 03
subsystem: ui/ai-chat
tags: [welcome-screen, suggestions, time-of-day, fade-in, p66-motion]
requires:
  - P66-02 motion barrel (FadeIn, StaggerList)
  - P66-04 LivIcons map (webSearch, fileEdit, terminal, screenShare)
  - P66-01 liv-tokens.css (--liv-text-*, --liv-bg-*, --liv-border-subtle, --liv-accent-cyan)
  - tailwind.config.ts liv type scale (text-display-2, text-body, text-caption)
provides:
  - LivWelcome React component (default export)
  - LIV_WELCOME_SUGGESTIONS array (4 cards, configurable in source)
  - getTimeOfDayGreeting + formatGreeting pure helpers
affects:
  - livos/packages/ui/src/routes/ai-chat/components/ (new co-located component dir)
tech-stack:
  added: []
  patterns:
    - Pure helpers extracted from component for testability (no DOM in vitest)
    - Props-only userName threading (deferred tRPC plumbing to 70-08)
    - className passthrough on both FadeIn (wraps inner div) and StaggerList (forwards to AnimatedGroup)
key-files:
  created:
    - livos/packages/ui/src/routes/ai-chat/components/liv-welcome.tsx (186 lines)
    - livos/packages/ui/src/routes/ai-chat/components/liv-welcome.unit.test.tsx (90 lines)
  modified: []
decisions:
  - "FadeIn delay value: plan suggested {100} but P66-02 API treats delay as seconds; used 0.1 (= 100ms) to honour intent. Documented in component header."
  - "tRPC user-name lookup deferred to 70-08 mount step. Component reads userName from props and falls back to 'there'; this avoids needing a tRPC provider in the unit-test environment and keeps the helper tests pure."
  - "StaggerList accepts className directly (verified in StaggerList.tsx line 41-51) — no wrapping div needed."
  - "Suggestion icon set restricted to webSearch / fileEdit / terminal / screenShare (CONTEXT D-42); locked down by an explicit allow-list test."
metrics:
  duration_minutes: 8
  completed_at: "2026-05-04T21:52:46Z"
  vitest_tests_passing: 11
  build_seconds: 45.01
  sacred_sha: 4f868d318abff71f8c8bfbcf443b2393a553018b
---

# Phase 70 Plan 03: Welcome Screen + Suggestions Summary

First-open `<LivWelcome>` ships an animated time-of-day greeting + 4 suggestion cards (in a 2x2 md / 1-col mobile grid) + slash-menu hint, wired to P66 motion primitives, the `LivIcons` map, and the `--liv-*` token system. No new deps, sacred SHA unchanged, 11/11 vitest pass, vite build clean.

## Files

### Created

- `livos/packages/ui/src/routes/ai-chat/components/liv-welcome.tsx` (186 lines)
  - `LivWelcomeSuggestion` interface
  - `LIV_WELCOME_SUGGESTIONS` array (4 entries — see below)
  - `getTimeOfDayGreeting(hour: number): string` — pure helper (CONTEXT D-43)
  - `formatGreeting(name: string|null|undefined, hour: number): string` — pure helper
  - `LivWelcomeProps` interface (`userName?`, `onSelectSuggestion`, `className?`)
  - `LivWelcome` React FC

- `livos/packages/ui/src/routes/ai-chat/components/liv-welcome.unit.test.tsx` (90 lines)
  - 11 vitest `it()` cases (plan minimum: 8)

## 4 Default Suggestions (CONTEXT D-42)

| # | Title              | Icon (LivIcons key) | Prompt                                                              |
|---|--------------------|---------------------|---------------------------------------------------------------------|
| 1 | Search the web     | `webSearch`         | Search the web for the latest news on AI agents                     |
| 2 | Help me write      | `fileEdit`          | Help me write a thank-you email to my team                          |
| 3 | Run a command      | `terminal`          | List all Docker containers and their status on my server            |
| 4 | Take a screenshot  | `screenShare`       | Take a screenshot of my desktop and describe what you see           |

Locked-down by `it('every suggestion icon is one of the documented LivIcons keys')` — any future PR that drifts the icon-set fails CI.

## Time-of-Day Boundary Coverage

| Hour | Expected greeting   | Test assertion                        |
|------|---------------------|----------------------------------------|
| 0    | Good morning        | `getTimeOfDayGreeting(0)`             |
| 8    | Good morning        | `getTimeOfDayGreeting(8)`             |
| 11   | Good morning        | `getTimeOfDayGreeting(11)`            |
| 12   | Good afternoon      | `getTimeOfDayGreeting(12)`            |
| 15   | Good afternoon      | `getTimeOfDayGreeting(15)`            |
| 17   | Good afternoon      | `getTimeOfDayGreeting(17)`            |
| 18   | Good evening        | `getTimeOfDayGreeting(18)`            |
| 20   | Good evening        | `getTimeOfDayGreeting(20)`            |
| 23   | Good evening        | `getTimeOfDayGreeting(23)`            |

All 9 boundary cases pass. `formatGreeting` is exercised with provided names ('bruce'/'Alice'/'Liv'), null, undefined, empty string, single-space, and `'\t\n'` (whitespace-only).

## Build + Test Status

- `pnpm --filter ui exec vitest run --reporter=verbose src/routes/ai-chat/components/liv-welcome.unit.test.tsx` → **11/11 pass** (1.02s)
- `pnpm --filter ui build` → **clean** (45.01s; only the pre-existing 1.4MB chunk warning is reported, unrelated to this file)
- Sacred SHA `nexus/packages/core/src/sdk-agent-runner.ts` = `4f868d318abff71f8c8bfbcf443b2393a553018b` (unchanged)
- `git diff --stat HEAD~1 HEAD -- '**/package.json'` → empty (D-07 honoured)

## Commits

| Hash       | Message                                                                            |
|------------|------------------------------------------------------------------------------------|
| `8a1b45da` | test(70-03): add failing tests for LivWelcome helpers + suggestions (RED)          |
| `075c9a96` | feat(70-03): implement LivWelcome welcome screen + greeting helpers (GREEN)        |

`git merge-base --is-ancestor 8a1b45da HEAD` → 0 (RED commit is reachable from HEAD via file-history graph, so the TDD RED → GREEN sequence is preserved on the test file even though concurrent sibling-agent commits reordered the linear log).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FadeIn delay unit mismatch**
- **Found during:** Task 1 implementation
- **Issue:** Plan example uses `<FadeIn delay={100}>`, but the shipped P66-02 API at `livos/packages/ui/src/components/motion/FadeIn.tsx:23` documents `delay` as **seconds** (forwarded to framer-motion's `transition.delay`). Passing `100` would produce a 100-second delay, masking the entrance animation entirely.
- **Fix:** Used `delay={0.1}` (= 100ms), matching the original design intent. Added a `NOTE on <FadeIn delay>` comment in the component header documenting the unit and citing the API source.
- **Files modified:** `livos/packages/ui/src/routes/ai-chat/components/liv-welcome.tsx`
- **Commit:** `075c9a96`

**2. [Rule 2 - Critical] Added focus-visible ring + button type='button'**
- **Found during:** Task 1 implementation
- **Issue:** Plan card markup omitted `type='button'` (defaults to `submit` inside a `<form>`, which would trigger composer submit if 70-08 ever wraps welcome in a form) and lacked a keyboard-visible focus ring. Both are accessibility correctness requirements (WCAG 2.4.7 / 4.1.2).
- **Fix:** Added `type='button'` and `focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--liv-accent-cyan)]` to each suggestion card.
- **Files modified:** `livos/packages/ui/src/routes/ai-chat/components/liv-welcome.tsx`
- **Commit:** `075c9a96`

**3. [Rule 2 - Test coverage] Added 3 extra it-cases beyond plan minimum**
- **Found during:** Task 2 implementation
- **Issue:** Plan minimum was 8 it-cases. Added 3 more for stronger lock-down: `'every suggestion icon is one of the documented LivIcons keys'` (allow-list), `'suggestion titles are unique'`, `'suggestion prompts are unique'`. These prevent future drift from CONTEXT D-42 and prevent accidental duplicate cards.
- **Files modified:** `livos/packages/ui/src/routes/ai-chat/components/liv-welcome.unit.test.tsx`
- **Commit:** `8a1b45da`

No architectural changes. No checkpoints reached.

## Threat Surface Scan

Reviewed both new files against P70-03 `<threat_model>` (T-70-03-01..03 all dispositioned `accept`). No new surface introduced. Suggestion strings are hardcoded in source (no user-controlled data path); user-name passthrough is React-escaped by default (no `dangerouslySetInnerHTML`); no network calls, no file IO, no auth boundaries. Threat model unchanged.

## Known Stubs

None. The component is fully wired against props it accepts. The `userName` prop will be threaded by 70-08; until then default fallback `'there'` renders correctly.

## Follow-ups (not in scope for this plan)

1. **70-08 mount step** — wire `<LivWelcome>` into `index.tsx`'s `messages.length === 0 && !isStreaming` branch and thread `trpc.users.getCurrent.useQuery().data?.name` into `userName`.
2. **Per-user / configurable suggestions** — backlog (CONTEXT scope_guard explicitly defers).
3. **Analytics on suggestion click** — backlog (no telemetry hook in this component yet; 70-08 may add).

## Self-Check: PASSED

- ✅ `livos/packages/ui/src/routes/ai-chat/components/liv-welcome.tsx` exists in HEAD (186 lines)
- ✅ `livos/packages/ui/src/routes/ai-chat/components/liv-welcome.unit.test.tsx` exists in HEAD (90 lines)
- ✅ Commit `075c9a96` (GREEN) reachable from HEAD
- ✅ Commit `8a1b45da` (RED) reachable from HEAD as ancestor (`git merge-base --is-ancestor` returns 0)
- ✅ Sacred SHA `4f868d31...` unchanged
- ✅ No `package.json` modifications in this plan's commits
