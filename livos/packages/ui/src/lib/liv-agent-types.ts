// Frontend type mirrors of @nexus/core (Phase 67-02 LivAgentRunner outputs).
// MUST stay verbatim per CONTEXT.md D-12.
//
// Greppable invariants (asserted by use-liv-agent-stream.unit.test.tsx):
//   - 10-string ToolCategory union
//   - 6-string ChunkType union
//   - ToolCallSnapshot 7 fields (toolId, toolName, category, assistantCall,
//     toolResult?, status, startedAt, completedAt?)
//
// Why redeclare instead of import @nexus/core? — verified at execute time
// (Plan 67-04 Task 1 Step 3): @nexus/core is NOT a dependency of the UI
// package and is server-only (Node ESM). Redeclaring matches D-NO-NEW-DEPS
// and keeps the UI bundle browser-clean. P67-02 ships the canonical shape
// in @nexus/core; this file mirrors it byte-for-byte.

/**
 * Tool category — drives Tabler icon selection in P68/P69 per
 * livos/packages/ui/src/icons/liv-icons.ts (P66-04). Note that
 * `'computer-use'` is NOT yet present in `LivIcons` (the icon map uses
 * `screenShare`); the runtime LivAgentRunner emits `'computer-use'` per
 * D-12, and a future plan will reconcile the icon-map entry. Until then,
 * P68's dispatcher falls back to the `generic` icon for the
 * `'computer-use'` category.
 */
export type ToolCategory =
	| 'browser'
	| 'terminal'
	| 'file'
	| 'fileEdit'
	| 'webSearch'
	| 'webCrawl'
	| 'webScrape'
	| 'mcp'
	| 'computer-use'
	| 'generic'

/**
 * ToolCallSnapshot — D-12 verbatim. Consumer-side dedupe keys on `toolId`.
 * `toolResult` is undefined while the tool is running and gets merged in
 * once the tool_result block arrives.
 */
export type ToolCallSnapshot = {
	toolId: string
	toolName: string
	category: ToolCategory
	assistantCall: {input: Record<string, unknown>; ts: number}
	toolResult?: {output: unknown; isError: boolean; ts: number}
	status: 'running' | 'done' | 'error'
	startedAt: number
	completedAt?: number
}

/**
 * Chunk type — D-09 verbatim. Six members:
 *   - 'text'              streaming assistant text
 *   - 'reasoning'         streaming Kimi `reasoning_content`
 *   - 'tool_snapshot'     paired tool_use+tool_result snapshot (D-15 dedupe)
 *   - 'tool_call_partial' partial tool args while still streaming (P75 use)
 *   - 'error'             terminal error chunk
 *   - 'status'            terminal status chunk ('complete'|'error'|'stopped')
 */
export type ChunkType =
	| 'text'
	| 'reasoning'
	| 'tool_snapshot'
	| 'tool_call_partial'
	| 'error'
	| 'status'

export type Chunk = {
	idx: number
	type: ChunkType
	payload: unknown
	ts: number
}

/**
 * Client-side message synthesized from Chunk stream. The `id` is constructed
 * from the runId + the chunk idx that opened the message, so messages are
 * stable across re-renders and reconnect-after replays.
 */
export type Message = {
	id: string
	role: 'user' | 'assistant'
	text: string
	reasoning?: string
	ts: number
}

export type StreamStatus =
	| 'idle'
	| 'starting'
	| 'running'
	| 'reconnecting'
	| 'complete'
	| 'error'

/**
 * Per-conversation slice of useLivAgentStore state. The store's root holds
 * `Map<conversationId, ConversationStreamState>` so multiple conversations
 * can stream independently (D-24).
 */
export type ConversationStreamState = {
	conversationId: string
	runId: string | null
	status: StreamStatus
	messages: Message[]
	snapshots: Map<string, ToolCallSnapshot>
	lastSeenIdx: number
	reconnectAttempts: number
	errorMessage?: string
}

/**
 * Default initial slice — exported so the Zustand store and tests can both
 * use the same canonical empty shape.
 */
export function makeEmptyConversationState(
	conversationId: string,
): ConversationStreamState {
	return {
		conversationId,
		runId: null,
		status: 'idle',
		messages: [],
		snapshots: new Map(),
		lastSeenIdx: -1,
		reconnectAttempts: 0,
	}
}
