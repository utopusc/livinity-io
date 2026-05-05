---
phase: 75-reasoning-cards-lightweight-memory
plan: 07
subsystem: integration
tags: [integration, wire-up, write-through, system-prompt, reasoning-card, sidebar, export, checkpoint]
status: tasks-1-and-2-shipped-task-3-checkpoint-pending

requires:
  - 75-01 (conversations + messages tables + repos)
  - 75-02 (LivReasoningCard primitive)
  - 75-03 (pinned_messages table + repo + getContextString)
  - 75-04 (exportToMarkdown + exportToJSON utilities)
  - 75-05 (ShikiBlock + MermaidBlock primitives)
  - 75-06 (conversation-search HTTP route + LivConversationSearch + HighlightedText)

provides:
  - "POST /api/pinned-messages, DELETE /api/pinned-messages/:id, GET /api/pinned-messages — JWT-authed"
  - "Postgres write-through from AiModule.saveConversation (CONTEXT D-10)"
  - "One-shot Redis→Postgres backfill on boot (CONTEXT D-11, env-gated)"
  - "System-prompt pinned-context auto-injection in chat() (CONTEXT D-19)"
  - "LivReasoningCard mounted above assistant text in chat-messages.tsx"
  - "ShikiBlock + MermaidBlock wired into liv-streaming-text.tsx markdown render"
  - "<LivPinButton> on hover for User + Assistant messages"
  - "<LivPinnedSidebarSection> in sessions sidebar"
  - "<LivConversationSearch> in sessions sidebar"
  - "Export menu (Markdown / JSON) in conversation header"

affects:
  - "P75 success criteria 1-4 (reasoning card, FTS search, pinned auto-inject, export)"
  - "Mini PC livinityd boot path (backfill fire-and-forget)"
  - "Mini PC chat() task assembly (pinned section prepended)"

tech-stack:
  added: []
  patterns:
    - "Write-through Redis-FIRST + Postgres-SECOND with try/catch (T-75-07-04)"
    - "Fire-and-forget boot backfill (env-gated via LIV_SKIP_FTS_BACKFILL=true)"
    - "Lazy-init repositories on first use (DB pool may not be ready in constructor)"
    - "Deterministic SHA-1-truncated UUID for legacy Redis messages without ids (CONTEXT D-12)"
    - "JWT auth helper duplicated from agent-runs.ts / conversation-search.ts"
    - "Source-text invariants test pattern (D-NO-NEW-DEPS lock — no @testing-library/react)"

key-files:
  created:
    - "livos/packages/livinityd/source/modules/ai/pinned-routes.ts (~270 LOC)"
    - "livos/packages/livinityd/source/modules/ai/pinned-routes.test.ts (~250 LOC, 6/6 vitest pass)"
    - "livos/packages/ui/src/routes/ai-chat/components/liv-pin-button.tsx (~110 LOC)"
    - "livos/packages/ui/src/routes/ai-chat/components/liv-pin-button.unit.test.tsx (~120 LOC, 9/9 vitest pass)"
    - "livos/packages/ui/src/routes/ai-chat/components/liv-pinned-sidebar-section.tsx (~150 LOC)"
  modified:
    - "livos/packages/livinityd/source/modules/ai/index.ts (+167 LOC — repos + persistToPostgres + runBackfill + system-prompt injection + barrel re-export)"
    - "livos/packages/livinityd/source/modules/server/index.ts (+10 LOC — mountPinnedRoutes import + mount call)"
    - "livos/packages/ui/src/hooks/use-agent-socket.ts (+18 LOC — reasoning + reasoningDurationMs optional ChatMessage fields)"
    - "livos/packages/ui/src/routes/ai-chat/chat-messages.tsx (+62 LOC — LivReasoningCard mount above assistant text + LivPinButton on User + Assistant hover + ChatMessageItem props extended)"
    - "livos/packages/ui/src/routes/ai-chat/components/liv-streaming-text.tsx (+30 LOC — ShikiBlock + MermaidBlock components prop wire)"
    - "livos/packages/ui/src/routes/ai-chat/index.tsx (+98 LOC — DropdownMenu export menu + LivConversationSearch + LivPinnedSidebarSection mount + buildConversationData adapter)"

decisions:
  - "Repositories are lazy-initialised on first use via private ensureRepos(): the AiModule constructor must NEVER block on DB pool being ready. ensureRepos returns false on null pool — Redis stays source-of-truth and persistToPostgres becomes a silent no-op."
  - "deterministicId() lives at module scope (not inside the AiModule class) so backfill replays produce identical ids for the same Redis content. SHA-1 truncated to 32 hex chars laid out as a UUID. Idempotent on ON CONFLICT DO NOTHING."
  - "saveConversation hooks the Postgres write AFTER the Redis write (.catch swallow at the call site + try/catch inside persistToPostgres). The double-catch is intentional belt-and-suspenders — Redis is source-of-truth (D-10)."
  - "System-prompt injection prepends pinnedSection to the existing `task` body (the contextPrefix + recent history + 'Current message: ...' shape). The pinned section is treated as a prefix to the task, keeping the existing wire to nexus's /api/agent/stream byte-identical for users with zero pins."
  - "ChatMessage gains optional `reasoning` + `reasoningDurationMs` fields (use-agent-socket.ts) but this hook does NOT yet populate them — the legacy WebSocket path doesn't emit reasoning chunks. The fields are forward-compat for when useLivAgentStream replaces the legacy path or starts feeding into the same reducer."
  - "AssistantMessage now renders LivReasoningCard ABOVE the assistant text whenever message.reasoning is non-empty. isStreaming derives from (message.isStreaming && isLastMessage) per CONTEXT D-16."
  - "Pin button on UserMessage AND AssistantMessage (D-17). User pins capture prompts the user wants Liv to remember; assistant pins capture good answers Liv should re-use as context. Both use the same /api/pinned-messages POST."
  - "Sidebar layout: LivConversationSearch at top → LivPinnedSidebarSection (auto-hides at zero pins) → conversation list. Search results & pinned cards both jump via onSelect(conversationId) to load that conversation."
  - "Export menu lives in the connection-status bar at the right edge (after $cost), reachable via DropdownMenu (shadcn). Renders only when activeConversationId && messages.length > 0 — empty conversations have nothing to export."
  - "buildConversationData adapts in-memory ChatMessage[] (which has blocks, toolCalls, isStreaming) to ConversationData (Plan 75-04's flat role/content/reasoning/toolCalls shape). System role narrows to 'system' so the export helper's type union accepts it."

metrics:
  duration_minutes: 12  # Tasks 1 + 2; Task 3 is human-walk
  completed_date_partial: "2026-05-05"
  task_count: 3
  tasks_completed: 2
  task_3_status: "checkpoint:human-verify (Mini PC UAT walk pending)"
  tests_added: 15  # 6 backend + 9 frontend
  tests_passing_75_07: "15/15 (6 pinned-routes + 9 liv-pin-button)"
  tests_passing_regression: "57/57 across reasoning-card / streaming-text / shiki / mermaid / conversation-search"
  build_runtime_s: 32.13
  build_status: "clean (exit 0)"

requirements_satisfied_pending_uat:
  - "MEM-03 (chat-messages renders reasoning via LivReasoningCard)"
  - "MEM-06 (sidebar search input live, mounted)"
  - "MEM-07 (pin/unpin + auto-inject working)"
  - "MEM-08 (export Markdown + JSON menu live)"
  - "COMPOSER-06 (Shiki + Mermaid in code blocks)"
---

# Phase 75 Plan 07: Wire-up Integration (Tasks 1 + 2 SHIPPED — Task 3 checkpoint:human-verify pending)

**One-liner (Tasks 1+2):** All P75 primitives from plans 75-01..75-06 are now wired into the live chat experience — reasoning cards render above assistant messages, pinned content auto-injects into the agent system prompt, the sidebar search returns FTS hits with `<mark>` highlighting, code blocks syntax-highlight via Shiki, mermaid blocks render as SVG diagrams, the conversation header has a Markdown/JSON export menu, and the Postgres FTS index gets populated transparently via write-through from `saveConversation` plus a one-shot Redis→Postgres backfill on boot.

## Status

- **Task 1 (Backend integration)** — SHIPPED. Commit `f9100a9a`.
- **Task 2 (Frontend integration)** — SHIPPED. Commit `1a9bb9c0`.
- **Task 3 (Mini PC UAT walk)** — `## CHECKPOINT REACHED` (human-verify). 9-step walk per the plan's `<how-to-verify>` block reproduced below. This SUMMARY will be amended to `status: complete` after the UAT verdict.

## Files Created (5)

| File | Lines | Purpose |
|---|---|---|
| `livos/packages/livinityd/source/modules/ai/pinned-routes.ts` | ~270 | POST/DELETE/GET /api/pinned-messages — JWT-authed, scoped by userId |
| `livos/packages/livinityd/source/modules/ai/pinned-routes.test.ts` | ~250 | 6 vitest cases: auth-fail, pin success, missing content (400), unpin, list, repo throw (500) |
| `livos/packages/ui/src/routes/ai-chat/components/liv-pin-button.tsx` | ~110 | Icon button POSTing /api/pinned-messages — group-hover visibility, Bearer auth, IconPin → IconPinFilled flip |
| `livos/packages/ui/src/routes/ai-chat/components/liv-pin-button.unit.test.tsx` | ~120 | 8 source-text invariants + 1 idle smoke render = 9 tests |
| `livos/packages/ui/src/routes/ai-chat/components/liv-pinned-sidebar-section.tsx` | ~150 | Fetches GET /api/pinned-messages on mount; renders pin cards with unpin X; click jumps to source conversation |

## Files Modified (6)

| File | LOC delta | What changed |
|---|---|---|
| `livos/packages/livinityd/source/modules/ai/index.ts` | +167 | Repository fields (lazy-init), persistToPostgres write-through, runBackfill (fire-and-forget on boot), system-prompt pinned-context injection in chat(), barrel re-export of mountPinnedRoutes |
| `livos/packages/livinityd/source/modules/server/index.ts` | +10 | Import + mountPinnedRoutes(this.app, this.livinityd) call alongside mountConversationSearchRoute |
| `livos/packages/ui/src/hooks/use-agent-socket.ts` | +18 | Optional ChatMessage.reasoning + reasoningDurationMs fields |
| `livos/packages/ui/src/routes/ai-chat/chat-messages.tsx` | +62 | LivReasoningCard mount above assistant text, LivPinButton on User + Assistant hover, ChatMessageItem accepts conversationId + isLastMessage |
| `livos/packages/ui/src/routes/ai-chat/components/liv-streaming-text.tsx` | +30 | components prop on ReactMarkdown maps inline → native code, mermaid → MermaidBlock, default → ShikiBlock |
| `livos/packages/ui/src/routes/ai-chat/index.tsx` | +98 | DropdownMenu export menu in connection bar, LivConversationSearch + LivPinnedSidebarSection in sidebar, buildConversationData adapter for ChatMessage[] → ConversationData |

## Test Results

| Suite | File | Tests | Pass | Duration |
|---|---|---|---|---|
| backend (75-07) | `pinned-routes.test.ts` | 6 | 6 | 47ms |
| backend (regression) | `conversation-search.test.ts` | 6 | 6 | 37ms |
| backend (regression) | `agent-runs.test.ts` | 14 | 14 | 67ms |
| frontend (75-07) | `liv-pin-button.unit.test.tsx` | 9 | 9 | 15ms |
| frontend (regression) | `liv-reasoning-card.unit.test.tsx` | 20 | 20 | 4ms |
| frontend (regression) | `liv-streaming-text.unit.test.tsx` | 7 | 7 | 4ms |
| frontend (regression) | `shiki-block.unit.test.tsx` | 12 | 12 | 4ms |
| frontend (regression) | `mermaid-block.unit.test.tsx` | 10 | 10 | 3ms |
| frontend (regression) | `liv-conversation-search.unit.test.tsx` | 8 | 8 | 17ms |
| **TOTAL** | | **92** | **92** | |

`pnpm --filter ui build` — clean, exit 0, **32.13s**.

## Sacred SHA Verification

| Gate | SHA |
|---|---|
| Start of plan | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| End of Task 1 | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| End of Task 2 | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| Post-build | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |
| Post-commit | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✅ |

`nexus/packages/core/src/sdk-agent-runner.ts` UNCHANGED — D-35 honored at every checkpoint.

## D-NO-NEW-DEPS Verification

`livos/packages/ui/package.json` UNCHANGED. `livos/packages/livinityd/package.json` UNCHANGED. All used imports were already wired before this plan: `pg`, `express`, `ioredis`, `react`, `react-markdown`, `remark-gfm`, `@tabler/icons-react`, `framer-motion`, `vitest`, `shiki` (the sole P75 D-NO-NEW-DEPS exception added in 75-05). No `dropdown-menu` lookup required — `@/shadcn-components/ui/dropdown-menu` is part of the existing shadcn surface and was already on disk.

## Hard-Rule Compliance

- D-NO-BYOK — no Anthropic API key path touched. Pinned routes use the same JWT shape as agent-runs / conversation-search.
- D-NO-SERVER4 — Mini PC + Server5 are the only deploy targets; this plan only modifies source code.
- D-NO-NEW-DEPS — zero `package.json` changes (Plan 75-05's `shiki` add stands).
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged.
- Schema edits — none. Phase 75-01 + 75-03 already shipped the relevant tables.
- Files staged individually (no `git add .` / `git add -A`).
- All SQL parameterized in pinned-routes (delegated to PinnedMessagesRepository).
- All reads/deletes scoped by `user_id` (multi-user privacy boundary T-75-07-03).

## Auto-Fixes / Deviations from Plan

### Auto-fixed

**1. [Rule 3 — Blocking] react-markdown 9 inline-detection signature**

- **Found during:** Task 2 step 3, while writing the `components.code` handler.
- **Issue:** Plan reference snippet `code({inline, className, children}) => ...` assumes the v8 prop signature. react-markdown 9's `inline` prop is detected via the `node` parent context; depending on plugin chain it may or may not be passed.
- **Fix:** Wrote a defensive detector — `const isInline = inline === true || !codeClassName` — falls back to "inline if no language-* className" which is what react-markdown emits for backtick-inline code. Tests + visual smoke pass.
- **Files modified:** `liv-streaming-text.tsx`
- **Commit:** Folded into `1a9bb9c0`.

**2. [Rule 2 — Missing critical functionality] ChatMessage.reasoning extension**

- **Found during:** Task 2 step 2 — the existing `ChatMessage` interface in `use-agent-socket.ts` had no `reasoning` field, so referencing `message.reasoning` from `chat-messages.tsx` would have been a TypeScript error.
- **Fix:** Added optional `reasoning` + `reasoningDurationMs` fields to `ChatMessage` in `use-agent-socket.ts`. Backwards-compat (both optional). The legacy WebSocket path doesn't yet populate them — future migration to `useLivAgentStream` (P67-04) or a parallel reasoning channel will populate the field.
- **Files modified:** `use-agent-socket.ts`
- **Commit:** Folded into `1a9bb9c0`.

### Did NOT Auto-Fix

- The legacy WebSocket path (`use-agent-socket.ts`) does NOT yet emit reasoning chunks. The `LivReasoningCard` will only render when `message.reasoning` is set, which today happens via the parallel `useLivAgentStream` SSE path (P67-04) when activeConversationId is wired. Mini PC's chat() route still goes through the WebSocket path, so the reasoning card may not appear during the UAT walk unless the user toggles to the SSE-driven path. This is **plan scope** — wiring reasoning chunks through the legacy reducer is a follow-up plan (75-08 backlog candidate) per CONTEXT D-08 D-NO-DELETE on the WebSocket path.
- The user table users with no Redis conversations are still iterated in runBackfill (each user does a `SELECT COUNT(*)` per-user). Acceptable for v1 — Mini PC has 1-2 users today.
- Pin button does NOT yet show "already pinned" state when the same message is re-rendered after a page reload. The pinned set is fetched ad-hoc from the sidebar; the pin button is fire-and-forget local state. A future enhancement (75-08) could lift the pinned-ids set into a Zustand store and surface it to LivPinButton.

## Threat Surface Compliance

| Threat ID | Mitigation in this plan |
|---|---|
| T-75-07-01 (prompt injection via pinned content) | accept — single-user-per-pin; getContextString hard-cap at 4096 chars + 100 pins |
| T-75-07-02 (boot DoS via backfill) | mitigate — fire-and-forget; logs errors; env-gate via LIV_SKIP_FTS_BACKFILL=true |
| T-75-07-03 (cross-user pin leak) | mitigate — JWT-authed routes scope by userId; PinnedMessagesRepository SQL has `WHERE user_id = $userId` |
| T-75-07-04 (Postgres write-through corrupts Redis) | mitigate — Redis-FIRST + Postgres-SECOND with try/catch + outer `.catch(() => {})` |
| T-75-07-05 (pin spam DoS) | mitigate — UI exposes pin per message (no bulk-pin API); 100-pin cap in getContextString |
| T-75-07-06 (XSS via search snippet) | mitigate — Plan 75-06's HighlightedText splits on literal `<mark>` tags via React text nodes |

No NEW threat surface introduced.

## Threat Flags

None. All security-relevant surface (the pinned routes, the system-prompt injection, the boot backfill) was either declared in the threat register OR is purely additive code paths inside existing trust boundaries (the chat() method already had write access to the agent task; injecting pinned context is a pure prefix on user-controlled text).

## Auth Gates

None. All changes are pure source code; no external service required new credentials. Mini PC + livinityd already have `JWT_SECRET` + `DATABASE_URL` + `REDIS_URL` wired.

## Per-Task Commits

| Task | Type | Commit | Files |
|---|---|---|---|
| 1 (Backend) | feat | `f9100a9a` | pinned-routes.ts, pinned-routes.test.ts, ai/index.ts, server/index.ts |
| 2 (Frontend) | feat | `1a9bb9c0` | liv-pin-button.tsx (+test), liv-pinned-sidebar-section.tsx, chat-messages.tsx, liv-streaming-text.tsx, index.tsx, use-agent-socket.ts |

## TDD Gate Compliance

This plan's tasks are `type="auto"` (NOT `tdd="true"`). Backend Task 1 + frontend Task 2 are integration wire-ups, not green-field components — the underlying primitives already had RED→GREEN coverage from plans 75-01..75-06. The new `pinned-routes.test.ts` and `liv-pin-button.unit.test.tsx` were authored alongside their implementation files in the same commit (the test runs immediately verify the contract). No standalone RED commits.

## Self-Check: PASSED (Tasks 1 + 2)

Files verified at HEAD `1a9bb9c0`:

- `livos/packages/livinityd/source/modules/ai/pinned-routes.ts` — FOUND
- `livos/packages/livinityd/source/modules/ai/pinned-routes.test.ts` — FOUND
- `livos/packages/ui/src/routes/ai-chat/components/liv-pin-button.tsx` — FOUND
- `livos/packages/ui/src/routes/ai-chat/components/liv-pin-button.unit.test.tsx` — FOUND
- `livos/packages/ui/src/routes/ai-chat/components/liv-pinned-sidebar-section.tsx` — FOUND
- `livos/packages/livinityd/source/modules/ai/index.ts` — modified (persistToPostgres, runBackfill, getContextString injection, repos, deterministicId)
- `livos/packages/livinityd/source/modules/server/index.ts` — modified (mountPinnedRoutes import + call)
- `livos/packages/ui/src/routes/ai-chat/chat-messages.tsx` — modified (LivReasoningCard, LivPinButton, ChatMessageItem props)
- `livos/packages/ui/src/routes/ai-chat/components/liv-streaming-text.tsx` — modified (ShikiBlock + MermaidBlock components prop)
- `livos/packages/ui/src/routes/ai-chat/index.tsx` — modified (export menu, sidebar mounts, buildConversationData)
- `livos/packages/ui/src/hooks/use-agent-socket.ts` — modified (reasoning + reasoningDurationMs optional fields)

Commits verified to exist:

- `f9100a9a` (backend) — `git log --oneline | grep f9100a9a` matches
- `1a9bb9c0` (frontend) — `git log --oneline | grep 1a9bb9c0` matches

Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — unchanged.

`pnpm --filter ui build` — exit 0, 32.13s.

92/92 tests pass (15 new + 77 regression).

---

## Task 3 (CHECKPOINT — human-verify) — Mini PC UAT Walk

**This SUMMARY will be amended after the UAT verdict.** The 9-step walk steps and checkpoint message follow at the end of the executor output (`## CHECKPOINT REACHED`). The Mini PC redeploy + walk is the human-action that closes P75-07.

After the walk:
- If all 9 walks succeed → user types `approved` → this section gets amended with the UAT verdict + `status: complete` frontmatter flip + MEM-03/06/07/08 + COMPOSER-06 marked complete in REQUIREMENTS.md.
- If any walk fails → user describes the failure → 75-07 spawns a follow-up patch plan or 75-08 gap-closure plan.

## Next

After UAT approval:
- Mark MEM-03, MEM-06, MEM-07, MEM-08, COMPOSER-06 in REQUIREMENTS.md.
- Advance STATE.md current plan past 75-07.
- Update ROADMAP.md Phase 75 progress to 7/7 plans complete.
- Phase 75 closes; v31.0 milestone progresses to next phase per the wave plan.
