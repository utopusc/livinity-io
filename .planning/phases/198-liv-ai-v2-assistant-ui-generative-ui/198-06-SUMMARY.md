---
phase: 198-liv-ai-v2-assistant-ui-generative-ui
plan: 06
subsystem: ui
tags: [composer, slash-commands, suggested-prompts, attachments, multimodal, wave-3]

requires:
  - phase: 198-liv-ai-v2-assistant-ui-generative-ui
    plan: 02
    provides: AssistantRuntimeProvider + useChatRuntime + AssistantChatTransport mount point inside <Assistant />
  - phase: 198-liv-ai-v2-assistant-ui-generative-ui
    plan: 05
    provides: useThreadListAdapter().onSwitchToNewThread — wired into the /clear slash-command branch as the "no-send" UI-level action
provides:
  - "4 slash commands shipped — /help, /clear, /screenshot, /search via SLASH_COMMANDS catalog at livos/packages/ui/src/features/liv-ai/slash-commands.ts (parseSlashCommand returns ParsedSlash|null; /clear transformedText=null suppresses send; other commands transform composer text before forwarding to runtime.send)"
  - "4 suggested-prompt chips on empty thread — DEFAULT_SUGGESTED_PROMPTS array at livos/packages/ui/src/features/liv-ai/suggested-prompts.tsx ('What is the weather in Istanbul?', 'Take a screenshot of my screen', 'List my open windows', 'What can you do?'); <SuggestedPrompts onPick hidden /> component renders 4 chip buttons + data-testid='liv-ai-suggested-prompts' container + per-chip testids"
  - "Image attachment adapter — createImageAttachmentAdapter() at livos/packages/ui/src/features/liv-ai/attachment-adapter.ts returns CompositeAttachmentAdapter wrapping SimpleImageAttachmentAdapter; accepts image/png|jpeg|webp|gif up to 10 MB; PDF + audio + non-image MIME types rejected (deferred to Phase 199)"
  - "<Assistant /> extended with three inner components: EmptyStateSuggestedPrompts overlay (uses useThread() to read messages.length, useThreadRuntime().append() to inject chip text; hidden when messages > 0); SlashCommandInterceptor wraps composerRuntime.send() to parse-then-rewrite-or-redirect; useChatRuntime adapters.attachments wired to the new adapter"
  - "T-198-06 mitigations honored — adapter rejects non-image MIME types (T-198-06-01 deferred-feature accept); slash interceptor only acts on registered triggers (T-198-06-02 injection accept — operator types literally, no XSS surface); composer.reset() on /clear prevents the literal '/clear' from leaking to the agent"
affects: [198-07-empty-state-theming, 198-08-deploy-uat]

tech-stack:
  added: []
  patterns:
    - "Composer send-wrapping idempotency — SlashCommandInterceptor captures `originalSend = composerRuntime.send.bind(composerRuntime)` and reassigns composerRuntime.send to a wrapper guarded by useRef so React strict-mode double-mount cannot double-wrap. Cleanup restores originalSend on unmount. Pattern reusable for any future composer-level interception (e.g. @-mention rewriting, prompt-prefix injection)."
    - "Suppress-send slash pattern (transformedText=null) — SlashCommands carrying transformedText=null signal the UI to take an alternative action instead of routing the message to the agent. /clear is the canonical example (composer.reset() + onSwitchToNewThread). Future commands like /export, /share, /settings can ride the same null-as-suppress convention."
    - "Empty-state overlay via absolute positioning over Thread.Viewport — instead of fighting Thread's internal layout, EmptyStateSuggestedPrompts mounts as an absolute pointer-events-none floating layer with a pointer-events-auto inner pill bar. When messages.length > 0, SuggestedPrompts returns null and the overlay div has zero rendered children, so it stays out of the way visually. This avoids needing to modify thread.tsx (the scaffold from Plan 198-02 is unmodified)."
    - "Image-only attachment adapter via CompositeAttachmentAdapter([SimpleImageAttachmentAdapter()]) — wrapping the single Simple adapter in a Composite (even though it's a 1-child composite) is intentional: Phase 199 can plug in a PDF adapter or audio adapter without touching the call site inside useChatRuntime. The Composite pattern is the assistant-ui-canonical way to extend attachment surfaces."

key-files:
  created:
    - livos/packages/ui/src/features/liv-ai/slash-commands.ts (121 LOC — SLASH_COMMANDS catalog + parseSlashCommand + SlashCommand/ParsedSlash interfaces)
    - livos/packages/ui/src/features/liv-ai/slash-commands.test.ts (82 LOC — 9 vitest cases covering parser + catalog shape + edge cases)
    - livos/packages/ui/src/features/liv-ai/suggested-prompts.tsx (82 LOC — DEFAULT_SUGGESTED_PROMPTS + <SuggestedPrompts> component with onPick/hidden/prompts props)
    - livos/packages/ui/src/features/liv-ai/suggested-prompts.test.tsx (121 LOC — 5 vitest cases via react-dom/client + jsdom)
    - livos/packages/ui/src/features/liv-ai/attachment-adapter.ts (123 LOC — acceptsFile + readFileAsBase64 + attachFile + createImageAttachmentAdapter + AttachedFile interface + ACCEPTED_MIME_TYPES + MAX_IMAGE_SIZE_BYTES)
    - livos/packages/ui/src/features/liv-ai/attachment-adapter.test.ts (99 LOC — 9 vitest cases covering acceptance/rejection + size limit + attachFile error + Composite smoke check)
  modified:
    - livos/packages/ui/src/features/liv-ai/assistant.tsx (+129 LOC, -3 LOC — EmptyStateSuggestedPrompts inner component; SlashCommandInterceptor inner component; useChatRuntime adapters.attachments wired; <main className='relative'> + overlay + interceptor + Thread mount order)

key-decisions:
  - "Slash command interception via send() wrapper (not custom ComposerPrimitive.Send) — keeps thread.tsx (Plan 198-02 manual-copy fallback) untouched; the assistant-ui composer-runtime exposes send/setText/reset on a stable interface, so wrapping in a useEffect after the AssistantRuntimeProvider mounts is the cleanest interception point that doesn't fight the framework. useRef guards against React strict-mode double-mount."
  - "/clear suppresses send by setting transformedText=null (not by intercepting the trigger string elsewhere) — the parser returns transformedText=null which the interceptor reads as the signal to call composer.reset() + onSwitchToNewThread() and skip the underlying send. Future commands wanting the same suppress-send semantics just return null from their transform; no parser or interceptor changes needed."
  - "Image MIME allow-list (image/png|jpeg|webp|gif) — explicit Set rather than wildcard image/* — defense-in-depth against File.type spoofing (some browsers report unusual subtypes). The 4 listed types cover ~98% of operator screenshot / camera-roll content; image/heic and image/avif intentionally excluded until Phase 199 confirms Grok vision handles them."
  - "10 MB ceiling (MAX_IMAGE_SIZE_BYTES) — matches the assistant-ui SimpleImageAttachmentAdapter default and Grok's documented per-image limit. Operators uploading raw camera photos (~5 MB) fit comfortably; massive screenshots from 8K monitors (~12 MB) get rejected with a clear error message."
  - "Empty-state overlay rendered ABOVE Thread (not inside Thread.Empty primitive) — Plan 198-02's thread.tsx already uses <ThreadPrimitive.Empty> for the 'Hello there!' welcome card; layering SuggestedPrompts there would require editing the manual-copy scaffold (which we want to keep minimal for Plan 198-07's polish wave). The absolute-positioned overlay achieves the same UX without touching thread.tsx and is removed automatically when messages.length > 0 via the SuggestedPrompts.hidden prop."
  - "Plan optional test on attachment-adapter elevated to mandatory — plan said 'optional simple test' but adapter behaviour gates Phase 198 acceptance envelope #9 (image attachment drag-drop). Shipping 9 vitest cases including a Composite smoke check is cheap insurance against future @assistant-ui/react upgrades silently breaking the adapter constructor surface."
  - "TDD honoured per task tdd='true' — slash-commands.test.ts shipped as RED first commit (parser-source-not-found); slash-commands.ts shipped as GREEN second commit; same RED→GREEN sequence for suggested-prompts. Attachment-adapter shipped GREEN-only (plan task did not mandate TDD)."

patterns-established:
  - "composerRuntime.send() interception via captured-bind + useRef idempotency guard — reusable for any future composer-level intercept (e.g. @-mention auto-completion, prompt-prefix injection, content-moderation pre-checks)."
  - "Suppress-send slash semantics via transformedText=null — any future slash command wanting UI-level redirect instead of agent invocation just returns null from transform; the interceptor handles the suppress + redirect without needing parser changes."
  - "Empty-state overlay positioning over Thread without editing the Thread scaffold — pointer-events-none container + pointer-events-auto inner pill keeps the overlay decoupled from Thread internals and survives Plan 198-07 polish-wave Thread rewrites."

requirements-completed: []

duration: ~6min
completed: 2026-05-23
---

# Phase 198 Plan 06: Composer Power Features — Slash Commands + Suggested Prompts + Image Attachments Summary

**Layers the three locked composer power features onto the assistant-ui Thread shipped by Plans 198-02..05: (1) 4 slash commands (`/help`, `/clear`, `/screenshot`, `/search`) parsed via `SLASH_COMMANDS` + `parseSlashCommand()`; (2) 4 suggested-prompt chips on the empty thread state via `<SuggestedPrompts>` with locked default texts; (3) image attachment adapter (`createImageAttachmentAdapter()`) accepting image/png|jpeg|webp|gif up to 10 MB and forwarding via the AI-SDK message stream as multimodal context for xAI/Grok vision. `<Assistant />` extended with two inner components: `SlashCommandInterceptor` wraps `composerRuntime.send()` to parse-then-rewrite-or-redirect on `/`-prefixed input, and `EmptyStateSuggestedPrompts` overlays the 4 chips above `<Thread />` when `messages.length === 0`. 6 atomic commits across 4 tasks (Tasks 1 + 2 split RED/GREEN per `tdd='true'`; Tasks 3 + 4 single-commit). 23 new vitest PASS (9 slash + 5 suggested + 9 attachment) plus 48 prior = 71/71 liv-ai+tool-ui suite PASS, zero regressions. `pnpm --filter ui build` EXIT 0 in 36.51s. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved 6/6 commits.**

## Performance

- **Duration:** ~6 min (single-session, autonomous, sequential mode)
- **Tasks:** 4/4 committed atomically (6 commits — Tasks 1 + 2 split RED + GREEN per `tdd="true"`)
- **Files created:** 6 (3 source + 3 test)
- **Files modified:** 1 (assistant.tsx — +129 LOC, −3 LOC)
- **Net LOC:** +543 LOC (-3) across 7 files (slash 121+82 + suggested 82+121 + attachment 123+99 + assistant +129/−3)
- **Vite build:** EXIT 0 in 36.51s (liv-ai-content chunk 562.61 kB / 157.67 kB gzip — ~+5 kB vs 198-05 baseline, accountable to SLASH_COMMANDS catalog + SuggestedPrompts + adapter wrapper)
- **Vitest:** 71/71 PASS in 3.07s (48 prior — 5 redact + 4 thread-list + 39 tool-renderers — + 23 new — 9 slash + 5 suggested + 9 attachment)
- **Sacred SHA pre-commit hook:** PASS × 6 commits (20/20 files verified each commit)

## Accomplishments

- **SLASH_COMMANDS catalog + parser** (`livos/packages/ui/src/features/liv-ai/slash-commands.ts`, 121 LOC) — 4 locked triggers (`/help`, `/clear`, `/screenshot`, `/search`) with typed `SlashCommand` entries (trigger/label/description/transform). `parseSlashCommand(input)` returns `ParsedSlash|null` — tolerates leading whitespace, returns `null` for non-slash inputs / unknown commands, returns `{command, transformedText}` for matches. `/clear` returns `transformedText=null` (UI-level redirect, no agent call); other commands transform input to a clean natural-language prompt (e.g. `/screenshot` → 'Take a screenshot of the current screen.', `/search foo bar` → 'Search the web for: foo bar', `/search` with no args → clarifying prompt fallback).

- **<SuggestedPrompts> component** (`livos/packages/ui/src/features/liv-ai/suggested-prompts.tsx`, 82 LOC) — `DEFAULT_SUGGESTED_PROMPTS` array ships exactly the 4 locked prompts from Plan 198-06 must_haves ('What is the weather in Istanbul?', 'Take a screenshot of my screen', 'List my open windows', 'What can you do?'). Component accepts `onPick(text)` callback (parent wires this to the composer runtime), `hidden?: boolean` (parent passes `hidden={messageCount > 0}`), and `prompts?: ReadonlyArray<string>` (override default). Rounded-pill buttons with Tailwind dark-mode styling, `data-testid='liv-ai-suggested-prompts'` container + per-chip `data-testid='liv-ai-suggested-prompt-{slug}'` for future Playwright walks.

- **Image attachment adapter** (`livos/packages/ui/src/features/liv-ai/attachment-adapter.ts`, 123 LOC) — `createImageAttachmentAdapter()` returns a `CompositeAttachmentAdapter` wrapping a single `SimpleImageAttachmentAdapter`. Pure helpers `acceptsFile(file)` (allow-list MIME + size check), `readFileAsBase64(file)` (FileReader Promise wrapper, strips `data:image/...;base64,` prefix), `attachFile(file)` (validate + read + return `AttachedFile {id, name, mimeType, base64, size}`). `MAX_IMAGE_SIZE_BYTES = 10 MB` matches Grok's per-image limit. `ACCEPTED_MIME_TYPES = {image/png, image/jpeg, image/webp, image/gif}` — explicit allow-list (not `image/*` wildcard) for defense-in-depth against File.type spoofing.

- **<Assistant /> extended** (`livos/packages/ui/src/features/liv-ai/assistant.tsx`, +129/−3 LOC) — three integration points:
  1. **`useChatRuntime` `adapters.attachments`** wired to `createImageAttachmentAdapter()`; composer Attachment surface now accepts image drag-drop or click, base64-encodes via the SimpleImageAttachmentAdapter, and the AI-SDK message stream carries the bytes as multimodal content for xAI/Grok vision.
  2. **`SlashCommandInterceptor` inner component** uses `useComposerRuntime()` to wrap `composerRuntime.send()` in a useEffect (guarded by `useRef` for strict-mode idempotency). The wrapper calls `parseSlashCommand(state.text)`; on `/clear` → `composer.reset()` + `onSwitchToNewThread()` + skip underlying send (agent never sees the literal '/clear'); on other registered slash commands → `composer.setText(transformedText)` + forward to original send; on non-slash → forward unmodified. Cleanup restores `originalSend` on unmount.
  3. **`EmptyStateSuggestedPrompts` inner component** uses `useThread(t => t.messages.length)` to determine empty state + `useThreadRuntime().append({role:'user', content:[{type:'text', text}]})` to inject chip text directly as a user message. Mounted as absolute-positioned overlay above `<Thread />` (`pointer-events-none` outer, `pointer-events-auto` inner pill bar) so chips float without leaking layout when `messages > 0` — `<SuggestedPrompts hidden={messageCount > 0} />` returns null in that branch.

- **Sacred SHA preservation** — `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` UNCHANGED across all 6 commits; pre-commit hook `[sacred-sha] PASS: 20 files verified` × 6.

## Task Commits

Each task was committed atomically with the sacred-SHA hook passing on every commit:

1. **Task 1 RED: slash-commands tests** — `0e17cb31` (test)
   - File created: `livos/packages/ui/src/features/liv-ai/slash-commands.test.ts` (82 LOC, 9 tests)
   - Vitest RED confirmed: `Failed to load url ./slash-commands` (parser-source-not-found — the intended RED signal)
   - Pre-commit sacred-SHA hook PASS

2. **Task 1 GREEN: SLASH_COMMANDS catalog + parser** — `95e7befc` (feat)
   - File created: `livos/packages/ui/src/features/liv-ai/slash-commands.ts` (121 LOC)
   - Vitest: 9/9 NEW PASS in 3ms
   - Acceptance grep: `grep -cE "trigger:\s*'/(help|clear|screenshot|search)'" slash-commands.ts` = 4 PASS
   - Pre-commit sacred-SHA hook PASS

3. **Task 2 RED: SuggestedPrompts tests** — `081a2b29` (test)
   - File created: `livos/packages/ui/src/features/liv-ai/suggested-prompts.test.tsx` (121 LOC, 5 tests)
   - Vitest RED confirmed: import-not-found for `./suggested-prompts`
   - Pre-commit sacred-SHA hook PASS

4. **Task 2 GREEN: SuggestedPrompts component** — `17b5acdc` (feat)
   - File created: `livos/packages/ui/src/features/liv-ai/suggested-prompts.tsx` (82 LOC)
   - Vitest: 5/5 NEW PASS in 26ms
   - Acceptance grep: `grep -c "DEFAULT_SUGGESTED_PROMPTS" suggested-prompts.tsx` = 4 PASS (≥ 2)
   - Pre-commit sacred-SHA hook PASS

5. **Task 3: Image attachment adapter** — `c9d55b63` (feat)
   - Files created: `livos/packages/ui/src/features/liv-ai/attachment-adapter.ts` (123 LOC) + `attachment-adapter.test.ts` (99 LOC)
   - Vitest: 9/9 NEW PASS in 8ms
   - Acceptance greps: `grep -c "ACCEPTED_MIME_TYPES" attachment-adapter.ts` = 3 PASS (≥ 2); `grep -c "MAX_IMAGE_SIZE_BYTES" attachment-adapter.ts` = 3 PASS (≥ 1)
   - Pre-commit sacred-SHA hook PASS

6. **Task 4: wire into <Assistant />** — `c9a696b8` (feat)
   - File extended: `livos/packages/ui/src/features/liv-ai/assistant.tsx` (+129 LOC, −3 LOC — EmptyStateSuggestedPrompts + SlashCommandInterceptor + adapters.attachments + relative-positioned main + overlay JSX)
   - Acceptance greps: `grep -c "SuggestedPrompts" assistant.tsx` = 5 PASS (≥ 2); `grep -cE "parseSlashCommand|SLASH_COMMANDS" assistant.tsx` = 5 PASS (≥ 1); `grep -cE "CompositeAttachmentAdapter|attachFile|SimpleImageAttachmentAdapter|createImageAttachmentAdapter" assistant.tsx` = 2 PASS (≥ 1)
   - Vite build: EXIT 0 in 36.51s (liv-ai-content chunk 562.61 kB / 157.67 kB gzip)
   - Vitest: full liv-ai + tool-ui suite 71/71 PASS (48 prior + 23 new from 198-06)
   - Pre-commit sacred-SHA hook PASS

## Files Created/Modified

**Created (6 files):**
- `livos/packages/ui/src/features/liv-ai/slash-commands.ts` (121 LOC — SLASH_COMMANDS catalog + parseSlashCommand parser + SlashCommand/ParsedSlash interfaces)
- `livos/packages/ui/src/features/liv-ai/slash-commands.test.ts` (82 LOC — 9 vitest tests)
- `livos/packages/ui/src/features/liv-ai/suggested-prompts.tsx` (82 LOC — DEFAULT_SUGGESTED_PROMPTS + <SuggestedPrompts> component)
- `livos/packages/ui/src/features/liv-ai/suggested-prompts.test.tsx` (121 LOC — 5 vitest tests via react-dom/client)
- `livos/packages/ui/src/features/liv-ai/attachment-adapter.ts` (123 LOC — acceptsFile + readFileAsBase64 + attachFile + createImageAttachmentAdapter + interfaces + constants)
- `livos/packages/ui/src/features/liv-ai/attachment-adapter.test.ts` (99 LOC — 9 vitest tests)

**Modified (1 file):**
- `livos/packages/ui/src/features/liv-ai/assistant.tsx` (+129 LOC, −3 LOC — EmptyStateSuggestedPrompts inner component + SlashCommandInterceptor inner component + useChatRuntime adapters.attachments wired + relative main + overlay mount)

## Decisions Made

- **Composer send-wrapping via captured-bind + useRef idempotency guard** — instead of editing thread.tsx to swap `<ComposerPrimitive.Send>` for a custom wrapper, the SlashCommandInterceptor inner component captures `originalSend = composerRuntime.send.bind(composerRuntime)` in a useEffect and reassigns `composerRuntime.send` to a parse-then-route wrapper. `useRef` guards prevent React strict-mode double-mount from stacking wrappers. Cleanup restores `originalSend` on unmount. Keeps Plan 198-02's manual-copy thread.tsx scaffold untouched (so Plan 198-07 polish wave doesn't merge-conflict).
- **`/clear` suppresses send by returning `transformedText: null`** — the parser signals "no-send" by returning `null` for transformedText; the interceptor reads this as "call composer.reset() + onSwitchToNewThread() and skip the underlying send". Future commands wanting the same suppress-send semantics (e.g. `/export`, `/share`, `/settings`) just return `null` from their transform — no parser or interceptor changes needed.
- **Empty-state overlay via absolute positioning over Thread.Viewport** — Plan 198-02's thread.tsx uses `<ThreadPrimitive.Empty>` for the welcome card; mounting `<SuggestedPrompts>` inside `<ThreadPrimitive.Empty>` would require editing thread.tsx. Absolute positioning the overlay above `<Thread />` (pointer-events-none outer, pointer-events-auto inner pill bar) achieves the same UX without touching thread.tsx and disappears automatically when `messages.length > 0` (via `<SuggestedPrompts hidden>`).
- **Image MIME allow-list (image/png|jpeg|webp|gif)** rather than `image/*` wildcard — defense-in-depth against File.type spoofing. The 4 listed types cover ~98% of operator screenshot / camera-roll content; image/heic and image/avif intentionally excluded until Phase 199 confirms Grok vision handles them.
- **10 MB ceiling (MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024)** — matches the assistant-ui SimpleImageAttachmentAdapter default and Grok's documented per-image limit. Operators uploading raw camera photos (~5 MB) fit comfortably; very large screenshots (~12 MB) get rejected with a clear error message via attachFile().
- **CompositeAttachmentAdapter wrapping a single SimpleImageAttachmentAdapter** — even though it's a 1-child composite today, wrapping in CompositeAttachmentAdapter is intentional: Phase 199 can plug in a PDF adapter or audio adapter without touching the call site in `useChatRuntime`. The Composite pattern is the assistant-ui-canonical way to extend attachment surfaces.
- **TDD honoured per task tdd='true'** — Tasks 1 + 2 shipped as RED-then-GREEN commit pairs (slash-commands.test before .ts, suggested-prompts.test before .tsx). Task 3 (attachment-adapter) and Task 4 (assistant.tsx wire-up) shipped GREEN-only per plan task spec.
- **Plan-optional attachment-adapter test elevated to mandatory** — plan said "(Optional simple test)" but adapter behaviour gates Phase 198 acceptance envelope #9 (image attachment drag-drop). 9 vitest cases including a Composite smoke check is cheap insurance against future @assistant-ui/react upgrades silently breaking the adapter constructor surface. Documented as a Rule-2 deviation (auto-add missing critical functionality — testing coverage).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Critical Functionality] Plan-optional attachment-adapter test elevated to mandatory**
- **Found during:** Task 3 implementation
- **Issue:** Plan Task 3 step 2 marked the attachment-adapter test as "(Optional simple test)" but the adapter's behaviour directly gates Phase 198 acceptance envelope #9 (operator-walked: "Image attachment drag-drop works → multimodal context passed to Grok"). Shipping the adapter without test coverage would leave a regression-risk surface uncovered by the test suite.
- **Fix:** Wrote 9 vitest cases (`attachment-adapter.test.ts`, 99 LOC) covering ACCEPTED_MIME_TYPES catalog shape (1), acceptsFile per-MIME-type accept/reject (4), oversize rejection (1), empty MIME rejection (1), attachFile descriptive-error path (1), and createImageAttachmentAdapter Composite smoke check (1).
- **Files modified:** Net-new test file only — no source changes.
- **Verification:** 9/9 PASS in 8ms; full liv-ai+tool-ui suite 71/71 PASS.
- **Committed in:** `c9d55b63` (Task 3 — adapter source + test shipped together; plan permitted GREEN-only for Task 3, RED-first was not required).

---

**Total deviations:** 1 (Rule-2 elevation of plan-optional test coverage to mandatory). Plan otherwise executed exactly as written. The single deviation does NOT alter:
- Public API of slash-commands.ts / suggested-prompts.tsx / attachment-adapter.ts (all functions + types match plan literal)
- The 4-slash-command catalog shape (`/help`, `/clear`, `/screenshot`, `/search`)
- The 4-prompt DEFAULT_SUGGESTED_PROMPTS array literal
- The image-only attachment scope (PDF + audio deferred to Phase 199 per plan must_haves)
- Any STRIDE mitigation behavior
- The sacred SHA constraint

All acceptance criteria pass; Plans 198-07 + 198-08 inherit a fully-functional composer power-feature surface.

## Issues Encountered

- **No new unknown issues** — Plans 198-01..05 already absorbed the recurring Windows pnpm postinstall ELIFECYCLE + jsdom polyfill + AuiProvider context issues; Plan 198-06 builds on the same stable foundation. The composer-runtime send-wrapping pattern was previously untested in this codebase but the @assistant-ui/core type surface is stable enough that the bind + reassign pattern compiled cleanly on first attempt.

## User Setup Required

None. Plan 198-07 (Empty state + theming + DevTools) is unblocked and inherits:
- A working empty-state surface (overlay + 4 chips) that Plan 198-07 can polish with the Liv AI logo / tagline / illustration without re-engineering the overlay positioning
- Composer slash-command interception that survives Plan 198-07 theme changes (interception is data-flow, not visual)
- Image attachment adapter wired into the runtime — Plan 198-07 can add a drop-zone visual treatment + per-attachment thumbnail preview without changing the adapter contract

## Next Phase Readiness

**Ready for Plan 198-07 (Empty state + onboarding + theming + DevTools):**
- Empty-state overlay positioned absolute above Thread; Plan 198-07 can mount a Liv AI logo + tagline ("LivOS'un yapay zekası — ekranını yönetir, sorularına cevap verir, hatırlar") inside the same overlay container without re-engineering the absolute positioning.
- 4 suggested-prompt chips render via `<SuggestedPrompts>`; Plan 198-07 can add hover lift + icon-per-chip + brand-cyan accents while preserving the `DEFAULT_SUGGESTED_PROMPTS` array and onPick contract.
- Slash-command interception is data-flow (not visual); theme changes can flow freely without touching the interceptor.

**Ready for Plan 198-08 (Deploy + UAT):**
- All Plans 198-01..06 ship without backend Mastra surface modifications (B-02 lock preserved); Plan 198-08 update.sh walk inherits the same rsync + pnpm install + vite build pipeline used through Phase 197.
- UAT walk additions for Plan 198-06:
  - Operator types `/help` → composer rewrites to "What can you do? List the tools…" + agent stream begins
  - Operator types `/clear` → thread switches to a fresh UUID; no agent call fires
  - Operator types `/search istanbul restaurants` → composer rewrites to "Search the web for: istanbul restaurants"
  - Operator opens new thread → 4 suggested-prompt chips visible; clicking a chip injects the text as user message
  - Operator drags a PNG screenshot into the composer → attachment row appears + agent receives multimodal content

**Sacred constraints verified:**
- sdk-agent-runner.ts SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED (6/6 commits, pre-commit hook `[sacred-sha] PASS: 20 files verified` × 6)
- destructiveToolNames N-01 lock unchanged on backend (Plan 198-06 is UI-only)
- W-02 lock unchanged — Reject path still resolves via REJECTED_TOOL_RESULT sentinel; this plan adds composer features, not approval flow changes
- B-02 lock unchanged — this plan is UI-only; zero mastra/index.ts or backend Mastra surface modifications (git diff shows 0 lines changed in `livos/packages/livinityd/source/modules/mastra/*`)
- D-NO-NEW-DEPS preserved — zero new npm packages installed in Plan 198-06 (uses already-installed @assistant-ui/react CompositeAttachmentAdapter + SimpleImageAttachmentAdapter + useThread + useComposerRuntime + useThreadRuntime; React useEffect/useRef only on top of existing imports)

## Self-Check: PASSED

**Files verified to exist:**
- `livos/packages/ui/src/features/liv-ai/slash-commands.ts` FOUND
- `livos/packages/ui/src/features/liv-ai/slash-commands.test.ts` FOUND
- `livos/packages/ui/src/features/liv-ai/suggested-prompts.tsx` FOUND
- `livos/packages/ui/src/features/liv-ai/suggested-prompts.test.tsx` FOUND
- `livos/packages/ui/src/features/liv-ai/attachment-adapter.ts` FOUND
- `livos/packages/ui/src/features/liv-ai/attachment-adapter.test.ts` FOUND
- `livos/packages/ui/src/features/liv-ai/assistant.tsx` FOUND (extended)

**Commits verified to exist in git log:**
- `0e17cb31` FOUND (Task 1 RED — slash-commands test scaffolding)
- `95e7befc` FOUND (Task 1 GREEN — slash-commands.ts catalog + parser)
- `081a2b29` FOUND (Task 2 RED — suggested-prompts test scaffolding)
- `17b5acdc` FOUND (Task 2 GREEN — SuggestedPrompts component)
- `c9d55b63` FOUND (Task 3 — image attachment adapter)
- `c9a696b8` FOUND (Task 4 — wire into <Assistant />)

**Sacred SHA verification:** PASS — `bash scripts/verify-sacred-sha.sh` exits 0; `liv/packages/core/src/sdk-agent-runner.ts = f3538e1d811992b782a9bb057d1b7f0a0189f95f`.

**Acceptance grep verification:**
- `grep -cE "trigger:\s*'/(help|clear|screenshot|search)'" slash-commands.ts` = 4 PASS (= 4)
- `grep -c "DEFAULT_SUGGESTED_PROMPTS" suggested-prompts.tsx` = 4 PASS (≥ 2)
- `grep -c "ACCEPTED_MIME_TYPES" attachment-adapter.ts` = 3 PASS (≥ 2)
- `grep -c "MAX_IMAGE_SIZE_BYTES" attachment-adapter.ts` = 3 PASS (≥ 1)
- `grep -c "SuggestedPrompts" assistant.tsx` = 5 PASS (≥ 2)
- `grep -cE "parseSlashCommand|SLASH_COMMANDS" assistant.tsx` = 5 PASS (≥ 1)
- `grep -cE "CompositeAttachmentAdapter|attachFile|SimpleImageAttachmentAdapter|createImageAttachmentAdapter" assistant.tsx` = 2 PASS (≥ 1)
- `pnpm --filter ui test:run src/features/liv-ai/slash-commands.test src/features/liv-ai/suggested-prompts.test` = 14/14 PASS (9 + 5)
- `pnpm --filter ui test:run src/features/liv-ai/ src/components/tool-ui/` = 71/71 PASS in 3.07s (48 prior + 23 new)
- `pnpm --filter ui build` EXIT 0 in 36.51s

## TDD Gate Compliance

Plan Tasks 1 + 2 are both `tdd="true"` — the full RED → GREEN cycle was honoured for each:

**Task 1 (slash-commands):**
1. **RED commit** `0e17cb31` (test) — 9 tests written, vitest run fails with `Failed to load url ./slash-commands` (parser source not yet created — the intended RED signal).
2. **GREEN commit** `95e7befc` (feat) — slash-commands.ts created → 9/9 NEW PASS.
3. **REFACTOR**: not needed; the catalog + parser are minimal and direct.

**Task 2 (suggested-prompts):**
1. **RED commit** `081a2b29` (test) — 5 tests written, vitest run fails with import-not-found for `./suggested-prompts`.
2. **GREEN commit** `17b5acdc` (feat) — suggested-prompts.tsx created → 5/5 NEW PASS.
3. **REFACTOR**: not needed; the component is minimal pure-presentation JSX.

**Tasks 3 + 4** are NOT `tdd="true"` per plan spec; shipped as GREEN-only commits (`c9d55b63` + `c9a696b8`). Task 3 still includes 9 vitest cases as a Rule-2 critical-coverage elevation (documented under Deviations).

Gate sequence verified in `git log --oneline -8`:
```
c9a696b8 feat(198-06): wire slash + suggested-prompts + attachments into Assistant (Wave 3)
c9d55b63 feat(198-06): image attachment adapter (Wave 3)
17b5acdc feat(198-06): SuggestedPrompts component (Wave 3 GREEN)
081a2b29 test(198-06): add failing tests for SuggestedPrompts (Wave 3 RED)
95e7befc feat(198-06): slash-commands.ts catalog + parser (Wave 3 GREEN)
0e17cb31 test(198-06): add failing tests for slash-commands parser (Wave 3 RED)
ed8df964 docs(198-05): complete plan 198-05 — ThreadList sidebar + per-thread Memory scoping
```

Both `test(...)` commits (RED gates) and `feat(...)` commits (GREEN gates) exist; the sequences are correctly ordered RED → GREEN within each TDD task.

---
*Phase: 198-liv-ai-v2-assistant-ui-generative-ui*
*Plan: 06 — Slash commands + suggested prompts + image attachments wired into <Assistant />*
*Completed: 2026-05-23*
