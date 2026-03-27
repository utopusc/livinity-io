---
phase: 17-session-management-history
verified: 2026-03-27T12:00:00Z
status: human_needed
score: 8/8 must-haves verified
human_verification:
  - test: "Send a message, then close and reopen the chat tab"
    expected: "The conversation is still visible in the sidebar and clicking it restores all messages to the chat view"
    why_human: "Requires a live browser + running backend; Redis persistence cannot be inspected programmatically here"
  - test: "Open the chat, send 2 messages, then use the address bar to navigate away and back to the same ?conv= URL"
    expected: "Messages reload automatically from Redis on mount — chat is not empty"
    why_human: "initialConvLoaded mount effect runs on agent.isConnected transition — live timing cannot be simulated"
  - test: "Sidebar shows conversations with correct auto-generated title (first 60 chars of prompt), a relative timestamp, and a message count badge"
    expected: "All three fields display real data, not zeros or placeholders"
    why_human: "listConversations query and sidebar rendering require runtime data from Redis"
  - test: "Click a past conversation from the sidebar, then send a follow-up message"
    expected: "The follow-up persists under the same conversation ID in Redis — no new conversation is created"
    why_human: "conversationId forwarding through WebSocket payload requires a live connected session to trace"
---

# Phase 17: Session Management + History Verification Report

**Phase Goal:** Conversations persist across sessions and users can browse and resume past conversations from a sidebar
**Verified:** 2026-03-27
**Status:** human_needed — all automated checks passed; 4 items need live-browser testing
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria + Plan must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SDK WebSocket sessions save user and assistant messages to Redis after each turn | VERIFIED | `saveToConversation` in ws-agent.ts (line 34-84) called via `onTurnComplete` callback; calls `ai.getOrCreateConversation` then `ai.saveConversation` |
| 2 | Conversation metadata (title, updatedAt, messageCount) is kept current in Redis | VERIFIED | `saveToConversation` updates `conversation.updatedAt = now` and calls `ai.saveConversation`; title set from `turn.userPrompt.slice(0, 60)` on first turn |
| 3 | A tRPC route returns conversation messages in the ChatMessage format used by the UI | VERIFIED | `getConversationMessages` route at routes.ts line 659-682 maps backend format to UI format with `id, role, content, toolCalls, isStreaming, timestamp` |
| 4 | User closes the chat window, reopens it, and sees the same conversation with all messages | HUMAN NEEDED | Mount effect at index.tsx line 279-291 calls `utils.ai.getConversationMessages.fetch` when `agent.isConnected` — code is wired, live test needed |
| 5 | Past conversations appear in sidebar with title, timestamp, and message count | HUMAN NEEDED | `conversationsQuery` (listConversations tRPC) feeds `ConversationSidebar` with `{id, title, updatedAt, messageCount}` array; displays `formatDistanceToNow` and title — needs live data |
| 6 | User clicks a past conversation and sees the full message history including tool call cards | HUMAN NEEDED | `handleSelectConversation` at index.tsx line 328-343 fetches via `utils.ai.getConversationMessages.fetch` and calls `agent.loadConversation`; `ChatMessageItem` renders tool calls — wired but needs live test |
| 7 | User can start a new conversation from sidebar without losing old ones | VERIFIED | `handleNewConversation` (line 311-318) calls `agent.clearMessages()`, sets new `conv_${Date.now()}` URL param; old conversations remain in Redis; sidebar refetches after streaming ends |
| 8 | Sending a new message in a loaded conversation saves it back to the same Redis record | HUMAN NEEDED | `sendMessage` at use-agent-socket.ts line 471-501 forwards `conversationIdRef.current` in the WebSocket payload; backend `saveToConversation` appends to existing — code is correct but wiring needs live end-to-end test |

**Score:** 8/8 truths have verified code — 4 also require human live testing

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `nexus/packages/core/src/agent-session.ts` | AgentSessionManager with `onTurnComplete` callback + `TurnData` interface + `conversationId` on `ClientWsMessage`/`ActiveSession` | VERIFIED | Lines 42-53: `TurnData` interface. Line 34: `conversationId?` on `ClientWsMessage`. Line 113: `conversationId?` on `ActiveSession`. Lines 141-175: `startSession` accepts `opts.onTurnComplete`. Lines 297-323: `flushTurn` helper calls `onTurnComplete` on `result` message and in `finally` block |
| `livos/packages/livinityd/source/modules/server/ws-agent.ts` | WebSocket handler with `saveToConversation` bridging `TurnData` to AiModule Redis storage | VERIFIED | Lines 34-84: `saveToConversation` function. Line 137: `onTurnComplete: (turn) => saveToConversation(turn, userId, ai, logger)` passed through `handleMessage` |
| `livos/packages/livinityd/source/modules/ai/routes.ts` | `getConversationMessages` tRPC route + `updateConversationTitle` mutation | VERIFIED | Lines 659-682: `getConversationMessages` query transforms backend to UI format. Lines 685-695: `updateConversationTitle` mutation |
| `livos/packages/livinityd/source/modules/ai/index.ts` | `saveConversation` public + `getOrCreateConversation` method | VERIFIED | Line 611: `saveConversation` is public (no `private` keyword). Lines 637-651: `getOrCreateConversation` method |
| `livos/packages/ui/src/hooks/use-agent-socket.ts` | `LOAD_MESSAGES` reducer action + `loadConversation` function + `conversationId` tracking | VERIFIED | Line 39: `LOAD_MESSAGES` action in union. Lines 104-105: reducer case. Line 124: `conversationIdRef`. Lines 540-544: `loadConversation`. Lines 471-501: `sendMessage` includes `conversationId` in payload. Lines 546-550: `clearMessages` resets ref |
| `livos/packages/ui/src/routes/ai-chat/index.tsx` | Sidebar resume wiring + `getConversationMessages` usage + `conversationId` management | VERIFIED | Lines 159: `utils = trpcReact.useUtils()`. Lines 279-291: mount effect loads conversation from URL param. Lines 328-343: `handleSelectConversation` fetches and loads messages. Lines 268-275: streaming-end refetch. Line 307: `agent.sendMessage(text, undefined, activeConversationId)` |
| `nexus/packages/core/src/lib.ts` | `TurnData` exported from `@nexus/core/lib` | VERIFIED | `export type { ActiveSession, AgentWsMessage, ClientWsMessage, TurnData } from './agent-session.js'` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ws-agent.ts onTurnComplete` | `AiModule.saveConversation` | `saveToConversation` helper → `ai.getOrCreateConversation` → `ai.saveConversation` | WIRED | ws-agent.ts line 137 passes callback; lines 43, 80 make the two AiModule calls |
| `ai-chat/index.tsx onSelect` | `getConversationMessages tRPC` | `utils.ai.getConversationMessages.fetch({id})` in `handleSelectConversation` | WIRED | index.tsx line 334 — imperative fetch via `useUtils()` |
| `ai-chat/index.tsx` | `useAgentSocket.loadConversation` | `agent.loadConversation(result.messages, id)` after fetch | WIRED | index.tsx lines 335-337 and 284-285 (mount effect) |
| `useAgentSocket.sendMessage` | WebSocket start payload | `payload.conversationId = conversationIdRef.current` | WIRED | use-agent-socket.ts lines 497-498 |
| `consumeAndRelay result message` | `flushTurn()` callback | `else if (msg.type === 'result') { flushTurn() }` at end of for-await loop | WIRED | agent-session.ts lines 408-411; also in `finally` block line 425 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SDK-06 | 17-01, 17-02 | Persist conversation sessions with session_id. Users can resume previous conversations. Sessions stored in Redis with metadata. | SATISFIED | Redis persistence via `saveToConversation` + `getOrCreateConversation`; frontend resume via `handleSelectConversation` + mount effect |
| SDK-07 | 17-02 | Browse past conversations in sidebar. Each shows title, timestamp, message count. Click to load and optionally resume. | SATISFIED | `listConversations` feeds sidebar; `ConversationSidebar` renders title + `formatDistanceToNow`; `handleSelectConversation` loads history on click |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `ws-agent.ts` | 93-95 | `AgentSessionManager` created without `nexusConfig` — tool policy and browser config not applied | Info | Pre-existing issue from phase 13; tools still work via default policy. Not a phase-17 regression |
| `ai-chat/index.tsx` | 164 | `activeConversationId` computed as `searchParams.get('conv') \|\| \`conv_${Date.now()}\`` — computed inline on each render, not stable for first send before URL param is set | Warning | On very first page load without `?conv=`, ID changes each render until `sendMessage` fires. In practice only the value at send-time is used, so persistence still works. Does not block the goal |

No stub patterns found. No TODO/FIXME/placeholder comments in modified files. No empty implementations.

---

## Human Verification Required

### 1. Page refresh restores conversation

**Test:** Send a message to the AI, note the `?conv=` URL param, then hard-refresh the page (Ctrl+R)
**Expected:** After the WebSocket reconnects, the previous messages load automatically from Redis into the chat view
**Why human:** The `initialConvLoaded` mount effect fires when `agent.isConnected` transitions to true — correct but requires a live connected session to observe the transition timing

### 2. Sidebar shows real persistence metadata

**Test:** Start a new conversation, type a multi-word first message (e.g. "List my Docker containers"), let it complete, then look at the sidebar
**Expected:** A new entry appears with the first ~60 characters of the prompt as the title, a relative timestamp ("a few seconds ago"), and the sidebar updates within 10 seconds (polling interval is 10s, or sooner via streaming-end refetch)
**Why human:** `listConversations` response and rendering requires runtime Redis data

### 3. Sidebar click loads full history with tool call cards

**Test:** Click a conversation that previously used tools (e.g., one that ran a shell command), check the chat area
**Expected:** Full message history appears including tool call cards showing tool name, input, and output — not just text messages
**Why human:** Tool call rendering in `ChatMessageItem` and the `getConversationMessages` tool call transformation (backend ChatMessage.toolCalls → UI ChatToolCall) require live data to confirm mapping is correct

### 4. Continued messages persist to same conversation

**Test:** Load a past conversation from the sidebar, send a follow-up message, then navigate away and back
**Expected:** The follow-up message appears in the conversation when you return — same `?conv=` ID, no new conversation created
**Why human:** The `conversationIdRef` in `useAgentSocket` is a ref (not state) — correct value at send time can only be confirmed in a live session

---

## Gaps Summary

No automated gaps found. All 8 must-have truths have complete, substantive, and wired implementations:

- **Backend persistence (Plan 01):** `AgentSessionManager.consumeAndRelay` accumulates turn data and calls `onTurnComplete` on each `result` message. `ws-agent.ts` bridges to `AiModule.saveConversation`. The `getConversationMessages` tRPC route transforms stored messages to the UI format.

- **Frontend history (Plan 02):** `useAgentSocket` gained `LOAD_MESSAGES`, `loadConversation`, and `conversationId` forwarding in `sendMessage`. The chat page wires sidebar clicks to `handleSelectConversation` (imperative tRPC fetch + `agent.loadConversation`), handles page-refresh restoration via the mount effect, and refetches the conversation list when streaming ends.

All 4 task commits (5e52067, 70a5f6f, 3d3a08b, 7b4d687) are confirmed present in git history.

The only items blocking a full `passed` status are live-browser behaviors that cannot be verified by static code inspection alone.

---

_Verified: 2026-03-27_
_Verifier: Claude (gsd-verifier)_
