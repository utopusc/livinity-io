# Phase 20: Conversation Persistence & History - Research

**Researched:** 2026-03-28
**Domain:** Frontend state management, tRPC data loading, Redis conversation storage
**Confidence:** HIGH

## Summary

This phase addresses the user-reported issue that AI Chat messages disappear when the tab is closed and reopened. Investigation of the current codebase reveals that the backend infrastructure is **fully functional** -- conversations are persisted to Redis, `listConversations` and `getConversationMessages` tRPC routes work correctly, and the `ConversationSidebar` component is already implemented with click-to-load support. The gaps are entirely in the **frontend mount/initialization logic**.

The root cause is clear: when the user opens `/ai-chat` without a `?conv=` URL parameter (the normal case after closing and reopening a tab), `activeConversationId` defaults to a brand-new `conv_${Date.now()}` value, so no history is fetched. The `initialConvLoaded` effect only triggers when `?conv=` is already present. There is also a secondary bug where the `getConversation` tRPC route is missing `await`, though this route is not used by the primary message-loading flow.

**Primary recommendation:** Fix the on-mount initialization to automatically load the most recent conversation when no `?conv=` param exists, and fix the missing `await` bug in the backend route.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- On AI Chat mount, check for active conversation (from URL param or last-used) and load messages from Redis via `getConversation` tRPC query
- Use the existing `conversationIdRef` pattern from v20.0 Phase 17 to track current conversation
- Restore messages into the `useReducer` state via a batch `LOAD_HISTORY` action
- Use the existing `ConversationSidebar` component (already exists from v20.0 Phase 17)
- Ensure it properly fetches conversations via `listConversations` on mount
- Click handler should update `conversationIdRef` and load the selected conversation's messages
- Show title (auto-generated from first message), timestamp, and message count

### Claude's Discretion
- Exact visual styling of the conversation list items
- Whether to add a "New Chat" button in the sidebar (recommended)
- How to handle edge cases (deleted conversations, empty conversations)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAT-04 | User can close and reopen the AI Chat tab and see previous messages loaded from Redis | Gap analysis shows mount-time auto-load is missing; fix initialConvLoaded logic + auto-select last conversation |
| CHAT-05 | User can see a list of past conversations in a sidebar panel | ConversationSidebar already exists and works; listConversations tRPC query polls every 10s; minor polish only |
| CHAT-06 | User can click a past conversation to load its full message history | handleSelectConversation already implemented and functional; no changes needed beyond CHAT-04 fixes |
</phase_requirements>

## Architecture Patterns

### Current Architecture (Working)

```
Browser (index.tsx)
  |-- useAgentSocket() hook
  |     |-- WebSocket /ws/agent
  |     |-- useReducer for message state
  |     |-- loadConversation(messages, id) action
  |     |-- conversationIdRef (useRef)
  |
  |-- ConversationSidebar (inline component)
  |     |-- trpcReact.ai.listConversations.useQuery (10s poll)
  |     |-- onSelect -> handleSelectConversation
  |     |-- onNew -> handleNewConversation
  |     |-- onDelete -> handleDeleteConversation
  |
  |-- Initial load effect (useEffect on mount)
  |     |-- Checks ?conv= URL param
  |     |-- Fetches via utils.ai.getConversationMessages.fetch()
  |     |-- Calls agent.loadConversation()

Server (livinityd)
  |-- AiModule (modules/ai/index.ts)
  |     |-- Redis storage: liv:ui:conv:{id} (JSON), liv:ui:convs (Set)
  |     |-- In-memory cache: Map<string, Conversation>
  |     |-- getConversation(), listConversations(), saveConversation()
  |
  |-- ws-agent.ts handler
  |     |-- saveToConversation() after each turn
  |     |-- AgentSessionManager for SDK sessions
  |
  |-- routes.ts (tRPC)
  |     |-- ai.getConversationMessages (transforms to UI format)
  |     |-- ai.listConversations (returns sorted list)
  |     |-- ai.deleteConversation
```

### Gap Analysis: What's Broken/Missing

**Gap 1: No auto-load of last conversation on mount (CHAT-04 root cause)**

```typescript
// CURRENT (broken): line 164 of index.tsx
const activeConversationId = searchParams.get('conv') || `conv_${Date.now()}`

// When user opens /ai-chat (no ?conv= param):
// - activeConversationId = "conv_1711619200000" (random new ID)
// - initialConvLoaded effect skips (convId is null from searchParams)
// - User sees empty chat -- messages are GONE
```

**Fix:** On mount, if no `?conv=` param, query `listConversations` and auto-select the most recent one (first item, since backend sorts by `updatedAt` DESC). Set the URL param to that conversation's ID and load its messages.

**Gap 2: `initialConvLoaded` ref never resets between navigations**

```typescript
// CURRENT: line 279-292 of index.tsx
const initialConvLoaded = useRef(false)
useEffect(() => {
    const convId = searchParams.get('conv')
    if (convId && !initialConvLoaded.current && agent.isConnected) {
        initialConvLoaded.current = true
        // ... loads conversation
    }
}, [searchParams, agent.isConnected, utils])
```

If the component mounts, loads once, then the user navigates away and comes back, the ref stays `true` from the previous mount because React re-uses the component in SPA routing. However, since `useRef` initializes to `false` on each fresh mount, this is only an issue if the component stays mounted but the user changes the URL param manually. The real issue is Gap 1 above.

**Gap 3: Missing `await` in `getConversation` tRPC route (minor bug)**

```typescript
// CURRENT: line 641 of routes.ts
const conversation = ctx.livinityd.ai.getConversation(input.id, userId) // Missing await!
// Returns a Promise (truthy), so `if (!conversation)` never triggers NOT_FOUND
```

This route is NOT used by the primary message-loading flow (the frontend uses `getConversationMessages` instead), but it should still be fixed for correctness. The `getConversationMessages` route at line 663 correctly uses `await`.

**Gap 4: No "last used conversation" persistence**

There is no `localStorage` or backend mechanism to remember which conversation the user was last viewing. The URL `?conv=` param is the only state, and it's lost when the tab is closed.

**Fix:** Store `lastConversationId` in `localStorage` when the user switches conversations or sends a message. On mount, check localStorage before falling back to the most recent conversation from the list.

### Recommended Fix Pattern

```typescript
// On mount, determine which conversation to show:
// 1. URL param ?conv= (highest priority -- user shared/bookmarked a link)
// 2. localStorage lastConversationId (returning user)
// 3. Most recent conversation from listConversations (fallback)
// 4. Empty state / new conversation (no history at all)

useEffect(() => {
    const convParam = searchParams.get('conv')
    if (convParam) {
        // Already handled by existing initialConvLoaded logic
        return
    }

    // No URL param -- try localStorage, then most recent
    const lastId = localStorage.getItem('liv:lastConversationId')
    if (lastId) {
        setSearchParams({conv: lastId}, {replace: true})
        return
    }

    // Fetch most recent conversation
    utils.ai.listConversations.fetch().then((convs) => {
        if (convs && convs.length > 0) {
            setSearchParams({conv: convs[0].id}, {replace: true})
        }
    })
}, []) // Run once on mount
```

### Anti-Patterns to Avoid

- **Generating `conv_${Date.now()}` as default**: This creates phantom conversations. Only generate a new ID when the user explicitly clicks "New Chat".
- **Using `activeConversationId` as a derived value from searchParams.get('conv') || random**: This re-derives on every render and creates timing issues with effects. Instead, treat the URL param as the source of truth and set it explicitly.
- **Double-fetching on mount**: The `initialConvLoaded` guard and the auto-load logic must coordinate to avoid loading messages twice.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Conversation list sorting | Custom sort on frontend | Backend already sorts by `updatedAt` DESC in `listConversations` | Consistent, authoritative sort order |
| Message format transformation | Manual mapping | Existing `getConversationMessages` route | Already handles backend->UI format mapping including toolCalls |
| WebSocket conversation persistence | Custom save logic | `ws-agent.ts` `saveToConversation()` | Already saves each turn after completion |
| URL state management | Custom URL sync | `useSearchParams` from react-router-dom | Already in use, standard React Router pattern |

## Common Pitfalls

### Pitfall 1: Race condition between auto-load and WebSocket connect
**What goes wrong:** Auto-load effect fires before WebSocket is connected, `agent.loadConversation()` works but then WebSocket connects and doesn't know about the loaded conversation, so `conversationIdRef` may not be set when user sends a new message.
**Why it happens:** `agent.isConnected` is async -- WebSocket connects after mount.
**How to avoid:** The auto-load should set `searchParams` which triggers the existing `initialConvLoaded` effect, which already gates on `agent.isConnected`. Do NOT call `agent.loadConversation` from the auto-load effect directly.
**Warning signs:** First message after tab reopen creates a new conversation instead of appending to the existing one.

### Pitfall 2: Stale `conversationIdRef` after loadConversation
**What goes wrong:** User loads conversation A, starts typing. The `conversationIdRef` wasn't updated because `loadConversation` was called from a different code path.
**Why it happens:** `loadConversation` in `use-agent-socket.ts` correctly sets `conversationIdRef`, but if the component loads messages without calling `loadConversation`, the ref remains null.
**How to avoid:** Always use `agent.loadConversation(messages, id)` to load history -- it sets both the reducer state AND the ref.

### Pitfall 3: Empty conversations appearing in sidebar
**What goes wrong:** Every time the user opens AI Chat without `?conv=`, a phantom `conv_${Date.now()}` ID is generated. If any tRPC query uses this ID (e.g., `listCanvasArtifacts`), it may create an empty conversation record.
**Why it happens:** The current `activeConversationId` derivation creates a new ID on every mount.
**How to avoid:** Only generate a new conversation ID when the user explicitly clicks "New Chat". On mount, use `null` as the conversation ID until one is determined.

### Pitfall 4: `initialConvLoaded` preventing reload after conversation switch
**What goes wrong:** User opens tab (loads conv A via initialConvLoaded), clicks conv B in sidebar (loads via handleSelectConversation), then refreshes page. The URL has `?conv=B` but initialConvLoaded is reset to false. This actually works correctly because the ref resets on mount.
**Why it happens:** React `useRef` initializes fresh on each mount.
**How to avoid:** This is NOT actually a pitfall -- the current design handles it. Document for clarity.

### Pitfall 5: localStorage stale after conversation deletion
**What goes wrong:** User deletes conversation A, which was stored in localStorage as `lastConversationId`. Next time they open the tab, it tries to load a deleted conversation and gets empty results.
**Why it happens:** localStorage is not synced with backend state.
**How to avoid:** When deleting a conversation, also clear localStorage if the deleted ID matches. The `getConversationMessages` route already returns `{messages: []}` for missing conversations, so this is gracefully handled, but the UX is better if we clear it.

## Code Examples

### Example 1: Auto-load most recent conversation on mount

```typescript
// In AiChat component, replace the current activeConversationId derivation
// Source: analysis of index.tsx lines 164, 279-292

// Remove this line:
// const activeConversationId = searchParams.get('conv') || `conv_${Date.now()}`

// Replace with:
const activeConversationId = searchParams.get('conv') ?? null

// Add auto-load effect (runs once on mount):
const autoLoadAttempted = useRef(false)
useEffect(() => {
    if (autoLoadAttempted.current) return
    if (searchParams.get('conv')) return // URL already has a conversation
    autoLoadAttempted.current = true

    const lastId = localStorage.getItem('liv:lastConversationId')
    if (lastId) {
        setSearchParams({conv: lastId}, {replace: true})
        return
    }

    // Fetch most recent conversation from backend
    utils.ai.listConversations.fetch().then((convs) => {
        if (convs && convs.length > 0) {
            setSearchParams({conv: convs[0].id}, {replace: true})
        }
    }).catch(() => {
        // No conversations -- stay on empty state
    })
}, [searchParams, setSearchParams, utils])
```

### Example 2: Save last conversation ID to localStorage

```typescript
// Source: analysis of handleSelectConversation and handleSend in index.tsx

// In handleSelectConversation:
const handleSelectConversation = useCallback(async (id: string) => {
    setSearchParams({conv: id})
    localStorage.setItem('liv:lastConversationId', id) // Persist for next visit
    // ... rest of existing logic
}, [setSearchParams, utils, agent])

// In handleSend (after the first message creates a conversation):
// The URL param is already set by this point, so save it:
useEffect(() => {
    const convId = searchParams.get('conv')
    if (convId) {
        localStorage.setItem('liv:lastConversationId', convId)
    }
}, [searchParams])
```

### Example 3: Fix missing await in getConversation route

```typescript
// Source: routes.ts line 641
// BEFORE (bug):
getConversation: privateProcedure.input(z.object({id: z.string()})).query(async ({ctx, input}) => {
    const userId = ctx.currentUser?.id
    const conversation = ctx.livinityd.ai.getConversation(input.id, userId) // Missing await
    if (!conversation) throw new TRPCError({code: 'NOT_FOUND', message: 'Conversation not found'})
    return conversation
}),

// AFTER (fixed):
getConversation: privateProcedure.input(z.object({id: z.string()})).query(async ({ctx, input}) => {
    const userId = ctx.currentUser?.id
    const conversation = await ctx.livinityd.ai.getConversation(input.id, userId)
    if (!conversation) throw new TRPCError({code: 'NOT_FOUND', message: 'Conversation not found'})
    return conversation
}),
```

### Example 4: Handle null activeConversationId throughout the component

```typescript
// When activeConversationId is null (no conversation selected yet),
// queries that depend on it should be disabled:

const canvasQuery = trpcReact.ai.listCanvasArtifacts.useQuery(
    {conversationId: activeConversationId!}, // non-null assertion safe because of `enabled`
    {
        enabled: !!activeConversationId && agent.isStreaming,
        refetchInterval: agent.isStreaming ? 1000 : false,
    },
)
```

### Example 5: Clear localStorage on conversation deletion

```typescript
const handleDeleteConversation = async (id: string) => {
    await deleteMutation.mutateAsync({id})
    // Clear localStorage if this was the last-used conversation
    if (localStorage.getItem('liv:lastConversationId') === id) {
        localStorage.removeItem('liv:lastConversationId')
    }
    if (id === activeConversationId) {
        handleNewConversation()
    }
    conversationsQuery.refetch()
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tRPC `ai.send` mutation (legacy) | WebSocket `/ws/agent` streaming | v20.0 Phase 17 | Messages stream via WebSocket, fallback to tRPC still exists |
| No conversation persistence | Redis-backed conversation storage | v20.0 Phase 17 | Backend stores conversations, but frontend doesn't load on mount |
| No conversation sidebar | ConversationSidebar component inline in index.tsx | v20.0 Phase 17 | Sidebar exists with list/select/delete -- fully functional |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual verification (no automated test framework detected in UI package) |
| Config file | none |
| Quick run command | Manual: open AI Chat, verify behavior |
| Full suite command | Manual: full flow test |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-04 | Close and reopen AI Chat tab shows previous messages | manual-only | Navigate to /ai-chat, verify messages from Redis load | N/A |
| CHAT-05 | Past conversations visible in sidebar panel | manual-only | Check sidebar shows conversation list with title/timestamp | N/A |
| CHAT-06 | Click past conversation loads its message history | manual-only | Click a conversation in sidebar, verify messages load | N/A |

**Manual-only justification:** This is a UI-only phase modifying React components. The project has no existing frontend test infrastructure (no jest/vitest config, no test files in the UI package). Adding test infrastructure is out of scope for this phase.

### Sampling Rate
- **Per task commit:** Manual verification -- open AI Chat, check behavior matches requirement
- **Per wave merge:** Full flow: send messages, close tab, reopen, verify messages load, click sidebar conversations
- **Phase gate:** All 3 success criteria verified manually

### Wave 0 Gaps
None -- no automated test infrastructure needed for this UI-only phase.

## Existing Code Inventory

### Files to Modify

| File | What Changes | Why |
|------|-------------|-----|
| `livos/packages/ui/src/routes/ai-chat/index.tsx` | Auto-load logic, activeConversationId handling, localStorage persistence | Core of CHAT-04 fix |
| `livos/packages/livinityd/source/modules/ai/routes.ts` | Add `await` to `getConversation` route (line 641) | Bug fix |

### Files That Stay Unchanged

| File | Why No Changes |
|------|---------------|
| `use-agent-socket.ts` | `loadConversation`, `LOAD_MESSAGES` reducer action already work correctly |
| `chat-messages.tsx` | Message rendering already handles all message types |
| `streaming-message.tsx` | Content rendering already works |
| `modules/ai/index.ts` | Redis storage, getConversation, listConversations all work correctly |
| `ws-agent.ts` | saveToConversation already persists turns correctly |
| `chat-input.tsx` | Input component needs no changes |

## Open Questions

1. **Conversation ID format consistency**
   - What we know: Frontend generates `conv_${Date.now()}`, backend stores whatever ID is provided
   - What's unclear: Are there existing conversations with old-format IDs that might not match the regex `^[a-zA-Z0-9_-]+$` in the tRPC route?
   - Recommendation: Not a concern -- `conv_${Date.now()}` always matches the pattern. No action needed.

2. **Redis TTL on conversations**
   - What we know: Conversations are stored with `redis.set()` without any TTL/expiry
   - What's unclear: Should old conversations eventually expire?
   - Recommendation: Out of scope for this phase. Conversations persist indefinitely, which is acceptable.

## Sources

### Primary (HIGH confidence)
- Direct code analysis of `livos/packages/ui/src/routes/ai-chat/index.tsx` (657 lines)
- Direct code analysis of `livos/packages/ui/src/hooks/use-agent-socket.ts` (681 lines)
- Direct code analysis of `livos/packages/livinityd/source/modules/ai/index.ts` (689 lines)
- Direct code analysis of `livos/packages/livinityd/source/modules/ai/routes.ts` (lines 596-695)
- Direct code analysis of `livos/packages/livinityd/source/modules/server/ws-agent.ts` (158 lines)
- Direct code analysis of `livos/packages/livinityd/source/modules/server/trpc/common.ts` (httpOnlyPaths)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries needed, all existing infrastructure is functional
- Architecture: HIGH - direct code analysis reveals exact gaps and fixes needed
- Pitfalls: HIGH - all identified through code tracing, not hypothetical

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- no external dependencies changing)
