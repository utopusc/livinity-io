/**
 * Phase 203-07 — ConversationMemoryAdapter (Branch A, coexistence window).
 *
 * Wraps an underlying memory store behind the `ConversationMemoryAdapter`
 * interface so consumers (AgentScheduler, future task-list surfaces) stop
 * being coupled to the Mastra Memory class shape. Plan 203-08 will swap the
 * backing store to either openclaw's built-in memory (SQLite under
 * `tasks/runs.sqlite`) or a plain pg pool — without touching this adapter
 * surface.
 *
 * For Plan 203-07 the adapter is BACKED by Mastra Memory (the existing
 * `createLivOSMemory` factory) so existing conversation threads + Phase 202
 * scheduler.runOnce + Phase 202-05 RecentTasksList all keep working
 * unchanged. The only new surface is the adapter wrapper itself.
 *
 * Sacred SHA preserved (INV-203-01 — this file is NEW).
 */

import type {ConversationMemoryAdapter} from './types.js'

/**
 * Minimal Mastra-Memory-shaped surface this adapter calls. Typed locally so
 * we do not import @mastra/memory directly (Plan 203-08 purge guard).
 */
interface MastraMemoryLike {
	saveThread(opts: {
		thread: {
			id: string
			resourceId: string
			title?: string
			metadata?: Record<string, unknown>
		}
		memoryConfig?: unknown
	}): Promise<unknown>
}

/**
 * Wrap an existing Mastra Memory (or any saveThread-compatible store) as a
 * `ConversationMemoryAdapter`. The adapter is a transparent pass-through —
 * any methods callers want beyond saveThread should add an explicit field on
 * `ConversationMemoryAdapter` first (keeps the cross-runtime contract honest).
 *
 * Pattern lifted from `mastra/scheduler.ts:MemoryThreadAPI` — same
 * structural shape, different namespace.
 */
export function createConversationMemoryAdapter(
	backing: MastraMemoryLike,
): ConversationMemoryAdapter {
	return {
		saveThread: (opts) => backing.saveThread(opts),
	}
}

/**
 * Test-friendly in-memory adapter. Backed by a plain Map so unit tests
 * (livos-agent.test.ts) can verify attach* round-trips without spinning up
 * Postgres. NOT used in production.
 */
export function createInMemoryAdapter(): ConversationMemoryAdapter & {
	readonly threads: ReadonlyMap<string, unknown>
} {
	const threads = new Map<string, unknown>()
	return {
		saveThread: async (opts) => {
			threads.set(opts.thread.id, opts.thread)
			return opts.thread
		},
		get threads() {
			return threads
		},
	}
}
