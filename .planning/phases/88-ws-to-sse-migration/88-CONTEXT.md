# Phase 88 — WebSocket → SSE Migration (v32 chat)

**Milestone:** v32 AI Chat Ground-up Rewrite
**Wave:** 4 (paralel with P89 theme/a11y, file-disjoint)
**Effort:** ~10h
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST remain unchanged. P88 touches ONLY UI files under `livos/packages/ui/src/routes/ai-chat/v32/` and the additive UI mirror in `livos/packages/ui/src/lib/liv-agent-types.ts`. ZERO `liv/packages/core/` changes.

## Goal

Replace the mock streaming simulation in `routes/ai-chat/v32/index.tsx` with real SSE wiring via `useLivAgentStream` (P67-04). Bridge new Hermes `status_detail` chunks (P87) into a Liv-styled animated phrase card. Auto-open `ToolCallPanel` when the latest tool snapshot is visual. Add a small agent selector (top of chat) backed by `agents.list` tRPC so future enhancements (composer "+ MCP") have an addressable agent.

Legacy `useAgentSocket` is left untouched — `routes/ai-chat/index.tsx` (legacy) keeps using it during P88-P89 grace; P90 cuts over by routing `/ai-chat` to v32.

## Requirements (V32-MIGRATE-01..05)

- **V32-MIGRATE-01 — useLivAgentStream wiring**
  - `routes/ai-chat/v32/index.tsx` imports `useLivAgentStream` from `@/lib/use-liv-agent-stream` (no longer `useAgentSocket`)
  - Constructs `conversationId` per chat session (stable for the page lifetime via `useState(() => 'v32-' + uuid)`-style or random per mount; v32 has no persistence yet)
  - Calls `sendMessage(text)` on composer submit
  - `stop()` invoked when SendButton is in stop state
  - Reconnect-with-after-idx is built into the hook (P67-04 internal); index.tsx does NOT need to re-implement it
  - Bridge SSE state (hook outputs: `messages`, `snapshots`, `status`, `runId`) → v32 `ChatMessage[]` shape consumed by `MessageThread`
    - SSE `Message` (`{id, role, text, reasoning?, ts}`) → v32 `ChatMessage` (`{id, role, content, status, timestamp, toolCalls?}`)
    - SSE `snapshots: Map<toolId, ToolCallSnapshot>` (P67-04 shape) → v32 `ToolCallSnapshot[]` (P81 shape) — adapter helper, see Decisions

- **V32-MIGRATE-02 — `status_detail` chunk consumption**
  - Add `'status_detail'` to UI mirror `ChunkType` union in `livos/packages/ui/src/lib/liv-agent-types.ts` (additive — matches `liv/packages/core/src/run-store.ts` already shipped by P87)
  - Extend `applyChunk()` reducer in `use-liv-agent-stream.ts` to track `currentStatus: {phase, phrase, elapsed} | null` on the conversation slice — set on `status_detail` chunk, clear on `status='complete'/'error'/'stopped'`
  - Expose `currentStatus` on `UseLivAgentStreamReturn`
  - In v32/index.tsx, when `currentStatus` is non-null AND the latest message is the streaming assistant message, render a small animated phrase card immediately above the streaming caret
  - Visual: spinner/pulse-dots/wrench/hourglass icon by phase + phrase + elapsed ms tag — Liv-styled per D-LIV-STYLED, NO Hermes KAWAII

- **V32-MIGRATE-03 — Auto-open ToolCallPanel via shouldAutoOpen**
  - v32/index.tsx renders `<ToolCallPanel toolCalls={…} isOpen={panelOpen} onClose={…} agentStatus={…} />`
  - useEffect on tool-calls list: when `shouldAutoOpen(toolCalls)` returns true AND was false on previous render, set `panelOpen=true`
  - Panel close (X / Cmd+I) sets `panelOpen=false` — auto-open does NOT re-trigger until next visual tool snapshot arrives
  - Panel dispatches `liv-sidebar-toggled` event on its open/close — v32/index.tsx listens and shifts thread max-width accordingly

- **V32-MIGRATE-04 — Agent selector**
  - Top-of-chat compact button: `🤖 Liv Default ▼` (avatar + name only)
  - Backing data: `useAgents({})` → tRPC `agents.list`
  - Default selection: `is_default === true` agent OR fallback to seed UUID `11111111-1111-4111-8111-111111111111` (Liv Default seed) OR first agent in the list
  - Selected agent's `id` (UUID) is the addressable target for future "+ MCP" install — currently passed as `agentId` query/state but NOT yet sent to backend (backend ignores extra body fields per Express defaults)
  - Uses shadcn `Select` (already in package — no new deps)

- **V32-MIGRATE-05 — Sidebar layout-shift event listener**
  - v32/index.tsx adds a `window.addEventListener('liv-sidebar-toggled', …)` in useEffect
  - On event `detail.open === true`, set thread container class `max-w-[calc(100%-480px-2rem)]`
  - On event `detail.open === false`, revert to `max-w-3xl`
  - Smoothed via `transition-all duration-300`

## Files Affected

**Created:**
- `livos/packages/ui/src/routes/ai-chat/v32/AgentSelector.tsx` (compact dropdown using shadcn Select + agents.list tRPC)
- `livos/packages/ui/src/routes/ai-chat/v32/StatusDetailCard.tsx` (animated phrase card consuming status_detail payload)
- `livos/packages/ui/src/routes/ai-chat/v32/lib/sse-adapter.ts` (pure helpers: SSE shapes → v32 shapes)
- `.planning/phases/88-ws-to-sse-migration/88-CONTEXT.md` (this file)
- `.planning/phases/88-ws-to-sse-migration/88-SUMMARY.md` (after impl)

**Modified:**
- `livos/packages/ui/src/routes/ai-chat/v32/index.tsx` (HEAVY: replace mock streaming with useLivAgentStream, mount ToolCallPanel + AgentSelector + StatusDetailCard, listen for liv-sidebar-toggled)
- `livos/packages/ui/src/lib/liv-agent-types.ts` (ADDITIVE: add `'status_detail'` to ChunkType, add optional `currentStatus` to ConversationStreamState, add `StatusDetailPayload` type)
- `livos/packages/ui/src/lib/use-liv-agent-stream.ts` (ADDITIVE: extend applyChunk to handle status_detail, expose currentStatus on hook return)

**NOT modified (sacred / lane discipline):**
- `liv/packages/core/src/sdk-agent-runner.ts` ← SHA `f3538e1d…` MUST be unchanged at end (verified by `git hash-object`)
- `liv/packages/core/**` ← P87 owns all backend changes
- `livos/packages/livinityd/**` ← server lane untouched
- `livos/packages/ui/src/routes/ai-chat/index.tsx` ← legacy chat (P90 cuts over)
- `livos/packages/ui/src/hooks/use-agent-socket.ts` ← legacy WS hook (deprecated for v32 only; legacy chat keeps it)
- `livos/packages/ui/src/routes/ai-chat/v32/types.ts` ← P81's lane (additive-only; no changes needed for P88)
- `livos/packages/ui/src/routes/ai-chat/v32/ToolCallPanel.tsx` ← P82's lane
- `livos/packages/ui/src/routes/ai-chat/v32/views/**` ← P83's lane
- `livos/packages/ui/src/components/mcp/**` ← P84's lane
- `livos/packages/livinityd/source/modules/server/trpc/agents-router.ts` ← P85's lane
- `livos/packages/livinityd/source/modules/server/trpc/marketplace-router.ts` ← P86's lane
- `livos/packages/livinityd/source/modules/server/trpc/mcp-router.ts` ← P84's lane

## Sacred / Constraint Notes

- **D-NO-BYOK** — OAuth subscription path completely untouched (P88 is UI-only)
- **D-LIV-STYLED** — Status detail card uses Liv tokens + Tabler icons; spinner is CSS, NOT KAWAII
- **D-NO-NEW-DEPS** — All deps already present: `zustand` (transitive via lib), `framer-motion`, `@tabler/icons-react`, `sonner`, shadcn `Select`/`Slider`
- **D-NO-KAWAII** — `status_detail` UI shows phrase text only with a spinner / phase icon. ZERO Hermes ASCII faces. Phrases come from backend (THINKING_VERBS already shipped by P87).
- **D-ADDITIVE-ONLY** — Changes to `liv-agent-types.ts` and `use-liv-agent-stream.ts` only ADD fields; existing consumers (P67-04 unit tests, legacy non-v32 callers) keep working
- **D-COEXISTENCE** — Legacy `/ai-chat` keeps using `useAgentSocket` + WebSocket; only `/ai-chat-v2` (and post-P90 `/ai-chat`) uses SSE

## Decisions

### D-88-01 — Adapter layer instead of contract change
SSE hook's `Message`/`ToolCallSnapshot` shapes (P67-04) differ from v32 `ChatMessage`/`ToolCallSnapshot` shapes (P81). Rather than refactor either side (both contracts are signed off and have downstream consumers), introduce a small pure adapter `lib/sse-adapter.ts` exporting:
- `sseMessagesToChatMessages(msgs, snapshots, currentStatus): ChatMessage[]` — projects SSE state into the v32 thread shape, attaching tool snapshots to the trailing assistant message
- `sseSnapshotToV32(snap): ToolCallSnapshot` — field rename (toolName → name, assistantCall.input → input, toolResult.output → output, status `done` → `complete`)

Pure helpers — testable without RTL.

### D-88-02 — Single conversationId per page lifetime (v32 scope)
v32 has no conversation persistence yet. Generate one stable id at mount via `useState(() => 'v32-' + crypto.randomUUID())`. P85+ will replace this with real conversation routing.

### D-88-03 — currentStatus expiration
`currentStatus` is set on every `status_detail` chunk and cleared on terminal status (`complete`/`error`/`stopped`). It is NOT auto-cleared on text chunks — backend explicitly emits a `status_detail` with `phase:'thinking'` between tool calls (per P87 SUMMARY), so the field reflects "what the agent is currently doing" and naturally turns over.

### D-88-04 — Agent selector is presentational right now
Backend `/api/agent/start` does not yet accept an `agentId` body field (verified at agent-runs.ts:253-254). The selector is wired so its choice updates a local `selectedAgentId` state — currently a no-op for stream behaviour, but addressable so a future plan (P90 cutover OR a follow-up plan) can include `agentId` in the request body alongside `task`.

This satisfies the spec: "Don't necessarily implement that button — just make the agentId addressable so a future enhancement can."

### D-88-05 — Auto-open trigger guard
The useEffect tracking `shouldAutoOpen(toolCalls)` uses a ref (`prevShouldAutoOpenRef`) to detect the false→true transition only. This avoids re-opening the panel every render when toolCalls grows but the panel was just manually closed by the user.

### D-88-06 — Layout-shift container
Listening for `liv-sidebar-toggled` and toggling a `max-w-*` class on the thread wrapper preserves the existing `mx-auto max-w-3xl` Suna pattern when panel is closed and shrinks to leave room for the 480px panel + 2rem gutter when open.

## Verification

- [ ] `git hash-object liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (before AND after)
- [ ] `pnpm --filter ui build` exits 0
- [ ] `pnpm --filter ui exec tsc --noEmit` introduces zero new errors in v32/ files (pre-existing livinityd errors unchanged)
- [ ] `grep -r "useAgentSocket" livos/packages/ui/src/routes/ai-chat/v32/` returns NOTHING (verifies legacy hook fully removed from v32 lane)
- [ ] `grep -r "useLivAgentStream" livos/packages/ui/src/routes/ai-chat/v32/index.tsx` returns at least one hit (verifies new hook is wired)
- [ ] `/ai-chat-v2` route still loads without runtime error in dev build
- [ ] `useLivAgentStream` unit test (`use-liv-agent-stream.unit.test.tsx`) still passes after applyChunk extension

## Reference

- P67-04 SUMMARY (useLivAgentStream contract — D-23/24/25)
- P81 SUMMARY (v32/index.tsx mock data layout — what we replace)
- P82 SUMMARY (ToolCallPanel API surface for P81/P88)
- P87 SUMMARY (status_detail chunk type, batchId field, ChunkType union)
- v32-DRAFT.md §3 P88 description + §1.B Streaming protocol decision
