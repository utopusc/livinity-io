# v32-redo Stage 2b-fix — Reuse legacy ai-chat components inside Suna shell

## Problem

Stage 2b (commit `a8f6af3a`) wrote custom Composer + ThreadPage from scratch
and broke the chat:

| Symptom | Root cause |
| --- | --- |
| "Loading conversation…" hangs forever | `thread.tsx` waits for both `conversations.listMessages` AND `conversations.get` before rendering — but `useLivAgentStream({autoStart:true})` opens an SSE EventSource against the conversationId on mount, and on a fresh selection the server has no run for that id so it blocks the component shape until query loaders resolve. Loading state and stream subscription confuse each other. |
| Composer Send doesn't stream / no AI response | `composer.tsx` calls `useLivAgentStream({conversationId: streamKey})` then `sendMessage(task)`. `sendMessage` POSTs to `/api/agent/start` *and waits for SSE*. But it does NOT register the conversation with the legacy WebSocket (`useAgentSocket`) which is what the live infrastructure on the Mini PC actually expects. The Stage 2b SSE wrapper is incomplete — the real stream surface is the WebSocket (`/ws/agent`) consumed by `useAgentSocket`. |
| Tool calls not visible (no tool panel) | Stage 2b's custom `MessageBubble` only renders `content` as Markdown. It has no awareness of `ChatMessage.blocks` (the interleaved text/tool array `useAgentSocket` builds), no tool snapshot store bridge, no `<LivToolPanel />` mount. |
| Sidebar too wide | `SIDEBAR_WIDTH = '16rem'` in `ui/sidebar.tsx`. Suna's actual production default is also 16rem (256px). Visually we want it tighter — 14rem or strict 256px. |
| Sidebar toggle doesn't fully hide | `<Sidebar collapsible="icon">` in `sidebar-left.tsx` collapses to a 3rem icon strip rather than off-canvas. User wants click → sidebar slides off entirely. |
| Profile invisible at bottom-left | Mostly visible already (it IS rendered inside `<SidebarFooter>` per Stage 2b commit) — but `state !== 'collapsed'` guard around CTACard pushes layout down; on collapsed-icon mode the footer is squashed. With offcanvas-mode the issue goes away naturally; verify. |

## Reuse strategy

The legacy `routes/ai-chat/` directory has battle-tested components that
already solve every symptom above. They consume `useAgentSocket` (WebSocket
backed by livinityd `/ws/agent`) and bridge tool snapshots into
`useLivToolPanelStore` for the side panel.

We DROP IN the legacy components inside the Suna shell:

| Suna shell file (Stage 2b custom — broken) | Replacement (legacy reuse) |
| --- | --- |
| `composer.tsx` | DELETED — both call sites now mount `<LivComposer />` from `routes/ai-chat/liv-composer.tsx` |
| `thread.tsx` `MessageBubble` map | `<ChatMessageItem />` from `routes/ai-chat/chat-messages.tsx` |
| Stage 2b SSE-only wiring (`useLivAgentStream` standalone) | `useAgentSocket()` (WebSocket) + `useLivAgentStream()` snapshot bridge (matches legacy `index.tsx` pattern) |
| Custom "Loading conversation…" hang | `utils.ai.getConversationMessages.fetch` + `agent.loadConversation()` — the legacy proven loader |
| Stage 2b custom message persistence (`appendMessage` after SSE complete) | DROP — `useAgentSocket` already pushes everything to Redis via `/ws/agent`; the sidebar list query (`conversations.list` via PostgreSQL) is the orthogonal concern |

NOTE on the conversations vs ai dichotomy: Stage 2b backend added a
`conversations.*` tRPC router backed by PostgreSQL for the sidebar list +
delete. Legacy uses `ai.listConversations` backed by Redis. Both stores
exist on the Mini PC — they just track different surfaces. To keep the
sidebar working with the existing Stage 2b PostgreSQL router AND have the
legacy chat machinery driving the actual conversation, we **also call
`conversations.appendMessage`** after each user/assistant turn so the
sidebar list reflects activity. This is the same pattern Stage 2b already
implemented — we keep it; we just wire it OFF the working WebSocket flow
instead of the broken SSE-only flow.

## File-by-file changes (planned)

1. `routes/ai-chat-suna/index.tsx` — wrap with `useAgentSocket()` + tool
   panel store bridge; pass agent down to dashboard + thread.
2. `routes/ai-chat-suna/dashboard.tsx` — render `<LivComposer />` instead
   of `<Composer />`. On first send, create conversation via
   `conversations.create`, then call `agent.sendMessage(text, ..., newId)`.
3. `routes/ai-chat-suna/thread.tsx` — render `<ChatMessageItem />` for each
   `agent.messages[]`. On mount with conversationId, call
   `utils.ai.getConversationMessages.fetch({id}).then(agent.loadConversation)`.
   Mount `<LivToolPanel />`. Composer below uses `agent.sendFollowUp` while
   streaming.
4. `routes/ai-chat-suna/composer.tsx` — DELETE (file emptied / reduced to a
   thin re-export of LivComposer if anything wants it).
5. `routes/ai-chat-suna/sidebar/sidebar-left.tsx` — change
   `collapsible="icon"` → `collapsible="offcanvas"`.
6. `routes/ai-chat-suna/ui/sidebar.tsx` — `SIDEBAR_WIDTH = '14rem'` (was
   16rem) for tighter feel; `SIDEBAR_WIDTH_ICON` left as-is (only used in
   icon-mode which we're abandoning).
7. `routes/ai-chat-suna/sidebar/nav-user-with-teams.tsx` — verify
   `<SidebarFooter>` wrapping in sidebar-left.tsx; confirm visible (no code
   change needed — offcanvas mode removes the icon-strip squash).
8. `routes/ai-chat-suna/sidebar/nav-agents.tsx` — keep
   `conversations.list/delete` wiring; add `agent.loadConversation` + URL-
   less `selectConversation` (it already does this — verify no regression).
9. Add a small effect in either thread.tsx or index.tsx that mirrors
   `useAgentSocket` user/assistant turn completions to
   `conversations.appendMessage` so the sidebar list reorders. (Mirror only;
   the WebSocket itself is the source of truth for live UI.)

## Hard constraints

- ZERO changes to `liv/packages/core/` (sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` stays).
- ZERO changes to `routes/ai-chat/*` LEGACY files (we REUSE them; don't modify).
- ZERO changes to backend (tRPC routers from Stage 2b stay as-is).
- D-LIV-NATIVE: this is reuse of OUR own LivOS components — encouraged.
- Suna shell visuals (sidebar layout, "Hey, I am Liv" hero copy, profile
  menu trim list) stay as-is.

## Verification gates

- `pnpm --filter ui build` exits 0
- TypeScript clean
- Sacred SHA preserved
- LivComposer renders without throwing
- Click thread → ChatMessages renders messages (no infinite loading)
- Send a message → streaming visible → tool calls visible → AI responds
- Sidebar toggle hides sidebar fully (no icon strip)
- Profile button visible at sidebar bottom

## Commit policy

ONE commit when done; do NOT push.
