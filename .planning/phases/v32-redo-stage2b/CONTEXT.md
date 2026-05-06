# v32-redo Stage 2b — Backend Wiring for ai-chat-suna

## Position in milestone

- Stage 1a (`79f480b3`): Suna dashboard layout port — visual only, mocks everywhere.
- Stage 2a (`5783dfd9`) + 2a-fix2 (`c316a330`): brand sweep + sidebar polish.
- **Stage 2b (THIS):** Replace mocks with real LivOS infrastructure. After this stage the AI Chat window is functionally usable: real user, real conversations, real composer that streams an agent run, real thread view rendering messages.
- Stage 2c+ (future): polish (status detail card, tool snapshots inline, attachments, etc.).

## Existing infrastructure to consume (NO new backends written)

- `livos/packages/livinityd/source/modules/database/conversations-repository.ts` — `upsert / getById / listForUser / deleteById`. Privacy-scoped by `user_id`.
- `livos/packages/livinityd/source/modules/database/messages-repository.ts` — `insertOne / upsertMany / listByConversation / search`. Same privacy boundary.
- `livos/packages/livinityd/source/modules/database/index.ts` — `getPool()` lazy DB pool getter.
- `livos/packages/ui/src/hooks/use-current-user.ts` — `useCurrentUser()` returning `{user, userId, username, role}` from `trpc.user.get`.
- `livos/packages/ui/src/lib/use-liv-agent-stream.ts` — Zustand-backed SSE consumer. API: `{messages, status, currentStatus, sendMessage, stop, runId, retry}`.
- `livos/packages/livinityd/source/modules/ai/agent-runs.ts` — POST `/api/agent/start` already accepts `{task, conversationId?}` and enqueues to RunQueue, returning `{runId, sseUrl}`.
- `livos/packages/ui/src/components/markdown.tsx` — `<Markdown>` component, hardened against XSS, used elsewhere in LivOS for assistant prose.

## Scope (Stage 2b only — no scope creep)

### Backend (livinityd)
1. **New tRPC router** `conversations` with five procedures:
   - `conversations.list` (privateProcedure query) — sidebar feed.
   - `conversations.get` (privateProcedure query) — single conversation row.
   - `conversations.create` (privateProcedure mutation) — `{title}` returns the row (id is server-generated UUID).
   - `conversations.delete` (privateProcedure mutation) — `{id}`.
   - `conversations.appendMessage` (privateProcedure mutation) — `{conversationId, role, content, reasoning?}`. Powers post-stream persistence of user + assistant turns. Touches the conversation's `updated_at` so the sidebar reorders correctly.
   - `conversations.listMessages` (privateProcedure query) — `{conversationId}` thread view feed.
2. **Mount the router** in `server/trpc/index.ts` under namespace `conversations`.
3. **httpOnlyPaths additions** in `server/trpc/common.ts` — all 6 paths so mutations survive `systemctl restart livos` (memory pitfall B-12 / X-04, established precedent).

The new tRPC router is a thin wrapper around the existing `ConversationsRepository` + `MessagesRepository` — NO business logic, NO new SQL.

### Frontend (ui)

1. **`sidebar/nav-user-with-teams.tsx`** — drop `MOCK_USER`, read `useCurrentUser()`. Show `displayName` (or `username` fallback). Drop the `Ultra` tier badge entirely (LivOS has no tier concept). Drop the email line if real user lacks one.
2. **`sidebar/sidebar-left.tsx`** — drop `MOCK_USER` import; build `user` prop from `useCurrentUser()`. Falls back to `'…'` while loading.
3. **`sidebar/nav-agents.tsx`** — drop `MOCK_THREADS`. Replace with `trpc.conversations.list.useQuery()`. Real delete via `trpc.conversations.delete.useMutation()`. Click on item -> calls a setter from a new ConversationContext (see #5). Drop the multi-select machinery for Stage 2b — single delete per dropdown is enough; multi-select can return in 2c if needed.
4. **`sidebar/search-search.tsx`** — drop `MOCK_THREADS`. Replace with the same `trpc.conversations.list.useQuery()`. Local-filter on `title.toLowerCase().includes(q)`.
5. **New `ChatRouterContext`** at `routes/ai-chat-suna/lib/chat-router.tsx` (replacing `lib/mock-data.ts`). Provides `{selectedConversationId, selectConversation, clearSelection}`. Lives at the `<DashboardLayout>` level, consumed by `nav-agents` (writes), `dashboard` (reads — only visible when no selection), `thread.tsx` (reads — only visible when selection set). NO React Router URL params (the AI chat is rendered inside a LivOS window, not a route — using `?conv=` would mutate the host app's URL).
6. **New `routes/ai-chat-suna/thread.tsx`** — message list with markdown rendering, auto-scroll to bottom on new content, distinguishes `user` (right-aligned bubble with `bg-muted`) from `assistant` (left-aligned prose, no bubble), composer at the bottom for follow-up messages. Combines persisted messages from `conversations.listMessages` with the live in-memory messages from `useLivAgentStream` (live wins for the most recent assistant message while streaming; persistence backfills after `complete`).
7. **`routes/ai-chat-suna/dashboard.tsx`** — wire the composer to actually send. Flow:
   - If `selectedConversationId` is null: composer sends → calls `conversations.create` → calls `conversations.appendMessage(role:'user')` → calls `sendMessage(text)` on the SSE hook → `selectConversation(newId)` so the layout swaps to thread view → on the SSE `complete` status, calls `conversations.appendMessage(role:'assistant', content: assistantText)`.
   - If `selectedConversationId` is set: composer is rendered inside `thread.tsx` instead, identical flow minus the create.
8. **`routes/ai-chat-suna/index.tsx`** — switches between `<DashboardPage />` and `<ThreadPage />` based on `selectedConversationId` from the context.
9. **DELETE `lib/mock-data.ts`** at the end. Verify zero remaining consumers.

## Hard constraints

- `liv/packages/core/` sacred SHA stays `47cb12bfce56e24015dc877ac456b89119f6ad16`. Verify before+after.
- ZERO new dependencies — `react-markdown`, `lucide-react`, `zustand`, `@trpc/react-query` already present.
- Use existing `Markdown` component for assistant prose (XSS-hardened).
- Use OKLCH liv-* tokens via existing Tailwind utilities (`bg-muted`, `text-muted-foreground`, `border-input`, etc.) — no hardcoded hex.
- D-NO-VERBATIM: write own JSX. Suna files read for UX reference only.
- D-LIV-NATIVE: use existing primitives (`Button`, `Avatar`, `Tooltip`, `DropdownMenu` from `ui/`).

## Verification gates

- `pnpm --filter ui build` exits 0.
- `cd livos/packages/livinityd && npx tsc --noEmit` zero new errors.
- Sacred SHA preserved.
- `mock-data.ts` file deleted, zero remaining importers (`grep -r "mock-data\|MOCK_USER\|MOCK_THREADS" livos/packages/ui/src/` returns nothing).
- Manual UAT: open AI Chat window → see real user name in profile; sidebar shows real (possibly empty) conversation list; type a message and press Enter → conversation appears in sidebar, view switches to thread, assistant text streams in.

## Out of scope (deferred to 2c+)

- Tool call pills inline.
- Status detail card (animated phrase).
- Attachments / file upload.
- Voice input.
- Multi-select delete in sidebar.
- Inline conversation rename.
- Persisting tool snapshots and reasoning to messages-repo.
