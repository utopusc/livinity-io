/**
 * sse-adapter.ts — Phase 88 (V32-MIGRATE-01)
 *
 * Pure helpers projecting `useLivAgentStream` outputs (P67-04 wire shapes:
 * `Message`, `ToolCallSnapshot` from `@/lib/liv-agent-types`) into v32 chat
 * surface shapes (`ChatMessage`, `ToolCallSnapshot` from `../types`).
 *
 * Why an adapter rather than reshaping either side:
 *   - P67-04's `Message` is a flat `{id, role, text, reasoning?, ts}` shape
 *     used by the SSE consumer state machine; it is consumed by other callers
 *     (the unit-test file asserts the shape directly).
 *   - P81's `ChatMessage` is a richer presentation shape with `status`,
 *     `attachments`, `toolCalls[]`, and `timestamp`.
 *   - Both contracts are signed off — the adapter keeps them decoupled.
 *
 * D-LIV-STYLED + D-NO-NEW-DEPS — pure data, no deps.
 */

import type {
	Message as SseMessage,
	StatusDetailPayload,
	StreamStatus,
	ToolCallSnapshot as SseToolCallSnapshot,
} from '@/lib/liv-agent-types'

import type {ChatMessage, ToolCallSnapshot as V32ToolCallSnapshot} from '../types'

/**
 * Convert a P67-04 SSE `ToolCallSnapshot` into the v32 `ToolCallSnapshot`
 * shape consumed by `MessageThread` and `ToolCallPanel`.
 *
 * Field map:
 *   - toolName    → name
 *   - assistantCall.input → input
 *   - toolResult.output (stringified if non-string) → output
 *   - status 'done' → 'complete'  ('running' / 'error' pass through)
 *   - startedAt → startedAt
 *   - completedAt → endedAt
 *   - batchId not present in SSE shape (P67-04 predates P87) — left undefined
 */
export function sseSnapshotToV32(snap: SseToolCallSnapshot): V32ToolCallSnapshot {
	const status: V32ToolCallSnapshot['status'] =
		snap.status === 'done' ? 'complete' : snap.status

	let output: string | undefined
	if (snap.toolResult !== undefined) {
		const raw = snap.toolResult.output
		if (typeof raw === 'string') {
			output = raw
		} else if (raw === null || raw === undefined) {
			output = ''
		} else {
			try {
				output = JSON.stringify(raw)
			} catch {
				output = String(raw)
			}
		}
	}

	return {
		toolId: snap.toolId,
		name: snap.toolName,
		input: snap.assistantCall.input,
		output,
		status,
		startedAt: snap.startedAt,
		endedAt: snap.completedAt,
		// batchId left undefined; P87 backend stamps it on liv-agent-runner
		// emissions, but the SSE wire shape mirrored in liv-agent-types.ts
		// has not been extended to surface it yet. Future plan can thread it.
	}
}

/**
 * Project SSE state into the v32 `ChatMessage[]` thread shape.
 *
 * Tool snapshots are attached to the LAST assistant message in the thread.
 * If there are tool snapshots but no assistant message yet, an empty
 * placeholder assistant message is created so the panel can still render.
 *
 * Streaming status is determined per-message:
 *   - The trailing assistant message is `'streaming'` when stream `status`
 *     is `'starting'` or `'running'`
 *   - All earlier assistant messages are `'complete'`
 *   - The trailing assistant message is `'error'` when stream `status` is
 *     `'error'`
 *
 * @param sseMessages   - the `messages` array from useLivAgentStream
 * @param sseSnapshots  - the `snapshots` Map from useLivAgentStream
 * @param streamStatus  - the `status` field from useLivAgentStream
 */
export function sseStateToChatMessages(
	sseMessages: SseMessage[],
	sseSnapshots: Map<string, SseToolCallSnapshot>,
	streamStatus: StreamStatus,
): ChatMessage[] {
	const v32ToolCalls: V32ToolCallSnapshot[] = Array.from(sseSnapshots.values())
		.sort((a, b) => a.startedAt - b.startedAt)
		.map(sseSnapshotToV32)

	const messages: ChatMessage[] = sseMessages.map((m, idx) => {
		const isLast = idx === sseMessages.length - 1
		const isAssistant = m.role === 'assistant'

		let status: ChatMessage['status'] = 'complete'
		if (isAssistant && isLast) {
			if (streamStatus === 'starting' || streamStatus === 'running') {
				status = 'streaming'
			} else if (streamStatus === 'error') {
				status = 'error'
			} else {
				status = 'complete'
			}
		}

		return {
			id: m.id,
			role: m.role,
			content: m.text,
			status,
			timestamp: m.ts,
		}
	})

	// Attach all tool calls to the trailing assistant message. If the trailing
	// message is a user message OR thread is empty AND we have tool calls,
	// synthesize a placeholder assistant message so the panel still renders.
	if (v32ToolCalls.length > 0) {
		const lastAssistantIdx = findLastAssistantIdx(messages)
		if (lastAssistantIdx >= 0) {
			messages[lastAssistantIdx] = {
				...messages[lastAssistantIdx],
				toolCalls: v32ToolCalls,
			}
		} else {
			messages.push({
				id: `synthetic_${Date.now()}`,
				role: 'assistant',
				content: '',
				status: streamStatus === 'running' ? 'streaming' : 'complete',
				timestamp: Date.now(),
				toolCalls: v32ToolCalls,
			})
		}
	}

	return messages
}

/** Return the latest tool snapshot list in v32 shape, sorted by startedAt. */
export function sseSnapshotsToV32List(
	sseSnapshots: Map<string, SseToolCallSnapshot>,
): V32ToolCallSnapshot[] {
	return Array.from(sseSnapshots.values())
		.sort((a, b) => a.startedAt - b.startedAt)
		.map(sseSnapshotToV32)
}

/** Pure helper: returns true when the stream is in an active phase. */
export function isStreamActive(status: StreamStatus): boolean {
	return status === 'starting' || status === 'running' || status === 'reconnecting'
}

/** Map StreamStatus to the simpler agentStatus prop expected by ToolCallPanel. */
export function streamStatusToAgentStatus(
	status: StreamStatus,
): 'idle' | 'running' | 'complete' | 'error' {
	switch (status) {
		case 'starting':
		case 'running':
		case 'reconnecting':
			return 'running'
		case 'error':
			return 'error'
		case 'complete':
			return 'complete'
		case 'idle':
		default:
			return 'idle'
	}
}

// ── internal ─────────────────────────────────────────────────────────────

function findLastAssistantIdx(messages: ChatMessage[]): number {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === 'assistant') return i
	}
	return -1
}

// Re-export StatusDetailPayload alias so v32 callers have a single import surface.
export type {StatusDetailPayload}
