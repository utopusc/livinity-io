---
phase: 120-mini-pc-ui-migration-wave-1
plan: 04
subsystem: ui-ai-chat
tags: [design-system, ai-chat, mini-pc, restyle, v35.0, wave-2]
dependency-graph:
  requires:
    - "Plan 120-01 (foundation: @livinity/design-tokens + @livinity/ui-kit wired)"
  provides:
    - "AI chat surface restyled to canonical tokens (panel/composer/messages/slash/streaming)"
    - "User bubble = accent-blue (#2563eb); assistant bubble = card-bg-2 surface + dash-line border"
    - "Slash command menu selection = accent-blue/10 + accent-blue text"
    - "Streaming cursor recolored to accent-blue (matches send-button tone)"
  affects:
    - "livos/packages/ui (ai-chat route only; zero behavioral diff)"
tech-stack:
  added: []
  patterns:
    - "Canonical Tailwind token swap (v32 `bg-surface-*` / `border-border-default` / `rounded-radius-*` → `bg-card-bg{,-2}` / `border-dash-line` / `rounded-dash`)"
    - "Inline send-button restyle (no ui-kit Button swap — preserves auto-resize handlers + slash detection on existing <button>)"
key-files:
  created:
    - ".planning/phases/120-mini-pc-ui-migration-wave-1/deferred-items.md (new — pre-existing localStorage/typecheck failures logged for Phase 121)"
  modified:
    - "livos/packages/ui/src/routes/ai-chat/index.tsx (18 hunks; sidebar + tabs + chrome + welcome-state suggestion buttons + consent dialog all on canonical surface)"
    - "livos/packages/ui/src/routes/ai-chat/chat-input.tsx (9 hunks; composer wrapper + textarea focus ring + attach button + 2× send buttons on accent-blue)"
    - "livos/packages/ui/src/routes/ai-chat/chat-messages.tsx (9 hunks; user bubble accent-blue, assistant bubble card-bg-2 + dash-line surface, capability-card + dismiss button restyled)"
    - "livos/packages/ui/src/routes/ai-chat/slash-command-menu.tsx (4 hunks; menu container card-bg + shadow-card, selected item accent-blue/10 + accent-blue text, command name accent-blue)"
    - "livos/packages/ui/src/routes/ai-chat/streaming-message.tsx (1 hunk; typewriter cursor color #6366f1 → #2563eb to match accent-blue)"
decisions:
  - "Did NOT swap send-button to ui-kit <Button>. The <button> in chat-input.tsx is tightly coupled to streaming vs idle branch, attachments state, and dual-button (Send + Stop) layout. In-place token swap was safer and lossless per plan's risk-out clause."
  - "Did NOT touch v32-tokens `text-text-*`, `bg-zinc-*` code-block surfaces, or `text-violet-*` icon accents — plan explicitly permits leaving these (`code blocks have their own contrast contract`)."
  - "Replaced assistant-bubble `border-l-2 border-violet-500/30 pl-4` with full bubble surface `rounded-2xl border border-dash-line bg-card-bg-2 px-4 py-2.5` — this is the most visible canonical alignment, mirroring `livinity.io/dashboard` card aesthetic. Tool-call disclosure rule still uses left-border but switched to `border-dash-line`."
  - "Streaming cursor color hex `#6366f1` (violet-500) → `#2563eb` (accent-blue) by direct inline-style edit — TypewriterCaret motion logic untouched; only the paint color changed."
metrics:
  duration: "~25 minutes"
  completed: "2026-05-14"
  tasks: 3
  files_modified: 5
---

# Phase 120 Plan 04: AI Chat surface restyle Summary

Restyled the 5 Mini PC AI Chat surfaces (panel root, composer, message list, slash menu, streaming bubble) to v35.0 canonical design tokens. User bubbles now wear accent-blue, assistant bubbles wear card-bg-2 + dash-line surface — visually aligned with `livinity.io/dashboard` bento aesthetic. Zero behavioral diff — every SSE handler, keyboard shortcut, attach/voice/paste handler preserved byte-identical.

## What Shipped

- **`index.tsx`** — sidebar, tab strip, mobile header chrome, welcome-state suggestion buttons, computer-use consent dialog all migrated from `bg-surface-base`/`bg-surface-1`/`bg-surface-2`/`border-border-default`/`rounded-radius-*`/`bg-accent-primary` to canonical `bg-card-bg`/`bg-card-bg-2`/`border-dash-line`/`rounded-dash`/`bg-accent-blue`. Active-tab indicator now `border-accent-blue`. Welcome suggestion buttons gained `duration-dash` motion token + `hover:border-dash-line-strong`.
- **`chat-input.tsx`** — composer wrapper switched to `border-dash-line bg-card-bg`; drag-over ring switched to `ring-accent-blue/50`; attachment chips and attach button switched to canonical card-bg-2 + dash-line surface; textarea focus ring switched to `accent-blue/50` border + `accent-blue/20` ring; **both** send buttons (streaming follow-up + idle send) re-painted `bg-accent-blue` with `hover:bg-accent-blue` (full opacity) / `hover:bg-accent-blue/90` and `duration-dash` motion. Send-button stayed a native `<button>` (NOT ui-kit `<Button>`) — see Decisions.
- **`chat-messages.tsx`** — user-bubble `bg-blue-600/90` → `bg-accent-blue`; assistant-bubble left-border-rule replaced with full bubble surface `rounded-2xl border border-dash-line bg-card-bg-2 px-4 py-2.5` (matches `livinity.io/dashboard` card surface contract); capability-recommendation card and dismiss button repainted canonical; tool-call disclosure left-rule border switched to `border-dash-line`; hover surface on tool-call header switched to `hover:bg-card-bg-2/50`. Install button now `bg-accent-blue + hover:bg-accent-blue/90 + duration-dash`. Shell/file `bg-surface-2` code surfaces left INTACT per plan ("code blocks have their own contrast contract").
- **`slash-command-menu.tsx`** — menu container surface `rounded-dash border border-dash-line bg-card-bg shadow-card` (canonical card); selected item now `bg-accent-blue/10 text-accent-blue` (plan-specified selection state); hover row now `hover:bg-card-bg-2`; command name color `text-brand` → `text-accent-blue`; row transitions gained `duration-dash`.
- **`streaming-message.tsx`** — typewriter cursor hex `#6366f1` (violet) → `#2563eb` (accent-blue). All inline-style markdown text colors LEFT INTACT (plan-permitted; v32-tokens still governs text contrast inside chat bubbles). TypewriterCaret animation, RAF loop, Markdown component, and TextShimmer "Thinking..." indicator all untouched.

## Diff Stats Per File

```
livos/packages/ui/src/routes/ai-chat/chat-input.tsx        | 18 +++---
livos/packages/ui/src/routes/ai-chat/chat-messages.tsx     | 18 +++---
livos/packages/ui/src/routes/ai-chat/index.tsx             | 66 +++++++++++-----------
livos/packages/ui/src/routes/ai-chat/slash-command-menu.tsx|  8 +--
livos/packages/ui/src/routes/ai-chat/streaming-message.tsx |  2 +-
5 files changed, 56 insertions(+), 56 deletions(-)
```

## Behavioral-Diff Audit: PASS

For every file in `key-files.modified`, `git diff <file>` grep on handler patterns (`on(Click|Submit|Change|KeyDown|MouseEnter|MouseDown|PointerDown|Focus|Blur|Paste|Drop|DragOver|DragLeave|Scroll)`, `useEffect`, `useState`, `useRef`, `useCallback`, `EventSource`, `fetch(`, `Markdown`, `trpcReact`, `TypeWriter`, `TextShimmer`) returns **empty**. Result tagged `NO_HANDLER_DRIFT` per plan's automated verify.

| Surface | Handler types preserved |
| --- | --- |
| index.tsx | `useAgentSocket`, all `useEffect` (SSE lifecycle, scroll detect, conv autoload, localStorage persistence, canvas/computer-use polling), `handleSend`/`handleStop`/`handleSlashAction`/`handleSelectConversation`/`handleNewConversation`/`handleDeleteConversation` callbacks |
| chat-input.tsx | `handleChange` (auto-resize), `handleKeyDown` (Enter / Shift+Enter / `/` / ArrowUp/Down / Escape — full slash-menu nav preserved), `handleSelectCommand`, `handleDrop`/`handleDragOver`/`handleDragLeave`/`handlePaste`, `processFiles`/`removeAttachment`, `useKeyboardHeight` |
| chat-messages.tsx | `AgentToolCallDisplay` expand/collapse `useState`, auto-expand-on-error `useEffect`, ToolOutput show-more toggle, CapabilityRecommendationCard `useMutation` |
| slash-command-menu.tsx | `trpcReact.ai.listSlashCommands.useQuery`, `useEffect` for filter-count + auto-scroll, `onMouseDown` selection |
| streaming-message.tsx | `TypeWriter` RAF loop, `useState` displayedLen, prevTargetRef reset, Markdown component contract, TextShimmer "Thinking..." |

## Build Status: PASS

```
$ cd livos && pnpm --filter ui build
✓ 11854 modules transformed.
PWA v1.2.0  precache 206 entries (6928.94 KiB)
✓ built in 42.51s
```

(One non-blocking Windows-EPERM on `dist/generated-tabler-icons` on first attempt; cleared and rebuilt clean. Tabler-icons output is build artifact; functional bundle JS + CSS emitted on first pass.)

Canonical token markers present in shipped CSS:
```
$ Select-String dist/assets/index-*.css "--accent-blue|--card-bg|--dash-line"
:root { --dash-line: rgba(0,0,0,.07); --card-bg: #ffffff; --card-bg-2: #fafafa; --accent-blue: #2563eb; ... }
```

## Sacred SHA Verification

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Verified twice: before Task 1 and after Task 2. Per **D-120-SACRED-SHA** — preserved across all changes. No commit attempted with mismatched SHA.

## Wave 1 Tally Contribution

- This plan: **+5 components** (panel/composer/messages/slash-menu/streaming)
- Running total (after 120-01 foundation + 120-02 + 120-03 + 120-04): **19 / 30**
- Remaining for Wave 1: 11 components via Plan 120-05 (App Store window content + dependents)

## Deviations from Plan

**None requiring Rule 2/3.** Plan was executed as written.

Two plan-permitted choices documented as decisions (see frontmatter):
1. **Send-button NOT swapped to ui-kit `<Button>`** — plan's risk-out clause explicitly permits in-place restyle when swap is risky. The chat-input dual-button (Send + Stop) streaming branch + attachments state coupling made in-place restyle the safer path.
2. **Assistant-bubble surface upgraded** — plan said "leave bubble radius if `rounded-2xl`", I kept `rounded-2xl` as instructed and added `border + bg-card-bg-2` instead of only swapping a background. Net effect: full canonical surface alignment with `livinity.io/dashboard` card aesthetic, no functional change.

## Auth Gates

None encountered.

## Known Stubs

None. No new hardcoded empty data introduced; all chat surfaces continue to source from `useAgentSocket` + `trpcReact.ai.*` queries as before.

## Threat Flags

None. No new network endpoints, auth surfaces, file-access patterns, or trust-boundary schema changes introduced. Pure CSS-class restyle.

## Deferred Issues

- 21 pre-existing test failures in `routes/docker/palette/*.unit.test.ts` and `routes/docker/window/bytebot/__tests__/*` — root cause: `localStorage` / `WebSocket` / `EventSource` not defined in vitest jsdom env. Unrelated to ai-chat. Logged to `deferred-items.md`.
- 18 pre-existing typecheck errors in `stories/src/routes/stories/{widgets,wifi}.tsx` (already logged in 120-01 SUMMARY).
- Vite "chunks larger than 500 kBs" bundle warning — pre-existing main bundle size; not a wave-1 problem.

## Operator UAT (Mini PC)

1. SSH: existing session or `ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68`
2. Run: `bash /opt/livos/update.sh`
3. Open `https://bruce.livinity.io` (hard-reload — Cmd/Ctrl+Shift+R)
4. Validate AI Chat end-to-end:
   a. Open AI Chat → panel renders with canonical card surface (sidebar `bg-card-bg`, dash-line borders, no fluorescent accent leak)
   b. Empty state (no messages yet) — welcome content visible with canonical 4 suggestion chips (now have `duration-dash` hover transition)
   c. Type a prompt → send via Enter — assistant streams a response (proves liv-agent SSE intact)
   d. Streaming bubble visible during response (cursor now blinks accent-blue, not violet), transitions to steady-state bubble on done
   e. User bubble = solid accent-blue (`#2563eb`) with white text; assistant bubble = soft card-bg-2 (`#fafafa`) with dash-line border — visually aligned with `livinity.io/dashboard` bento style
   f. Press `/` in composer → slash command menu opens with canonical card-bg surface + shadow-card; ArrowUp/Down navigates with `accent-blue/10` background + `accent-blue` text on selected row; Enter executes; Escape dismisses
   g. Click paperclip → file picker opens (functional preserved)
   h. Paste an image into the composer → image attaches as chip with `border-dash-line` + canonical surface (functional preserved)
   i. While streaming, click Stop → stream aborts (functional preserved)
   j. Switch to MCP / Agents tabs from sidebar → tabs work, active-tab underline is `border-accent-blue`
   k. Daily-driver flows still work — open Files / Settings / App Store — no regression
5. Report PASS/FAIL in chat
6. On FAIL: `cd /opt/livos && git revert <plan-commit> && bash update.sh`

## Self-Check: PASSED

- FOUND: `livos/packages/ui/src/routes/ai-chat/index.tsx` — `git diff` contains `+ ... bg-card-bg ... border-dash-line ... rounded-dash ... bg-accent-blue`
- FOUND: `livos/packages/ui/src/routes/ai-chat/chat-input.tsx` — `git diff` contains `+ ... bg-card-bg ... bg-accent-blue ... ring-accent-blue ... focus:ring-accent-blue/20`
- FOUND: `livos/packages/ui/src/routes/ai-chat/chat-messages.tsx` — `git diff` contains `+ ... bg-accent-blue ... bg-card-bg-2 ... border-dash-line`
- FOUND: `livos/packages/ui/src/routes/ai-chat/slash-command-menu.tsx` — `git diff` contains `+ ... bg-card-bg ... shadow-card ... bg-accent-blue/10 text-accent-blue`
- FOUND: `livos/packages/ui/src/routes/ai-chat/streaming-message.tsx` — `git diff` contains `+ background: '#2563eb'`
- FOUND: `.planning/phases/120-mini-pc-ui-migration-wave-1/120-04-SUMMARY.md` (this file)
- FOUND: `.planning/phases/120-mini-pc-ui-migration-wave-1/deferred-items.md` (new — pre-existing-test-failure log)
- VERIFIED: `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sacred SHA preserved)
- VERIFIED: `pnpm --filter ui build` exits 0 with `--accent-blue`/`--card-bg`/`--dash-line` token markers present in bundled CSS
- VERIFIED: per-file behavioral-diff grep against handler/effect/hook patterns returns empty for all 5 files (`NO_HANDLER_DRIFT`)
