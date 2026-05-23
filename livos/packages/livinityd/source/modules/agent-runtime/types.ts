/**
 * Phase 203-07 — Shared types for the openclaw-backed agent runtime.
 *
 * Branch A locked per Plan 203-01 SPIKE (D-203-06) — `LivOSAgent` is a thin
 * wrapper around the openclaw gateway client + ApprovalManager + Memory
 * adapter. The agent itself does NOT dispatch LLM calls; the openclaw gateway
 * does. This module's runtime contract is intentionally framework-agnostic so
 * Plan 203-08 can purge `@mastra/*` without further surface change.
 *
 * Mirrors the slot shape of `LivOSMastra` (mastra/index.ts) so the boot
 * wire-up in `livinityd/source/index.ts` only changes the class name + the
 * provider routing branch. attach* method names are 1:1 with LivOSMastra's
 * except `attachLivAiAgent` → `attachLivAi` and `attachMastraInstance` →
 * `attachAgentInstance` (D-203-07 rename).
 */

/**
 * Generic "runtime agent" — the value flowing through AgentRegistry +
 * AgentScheduler in the openclaw branch. During the 203-07/08 coexistence
 * window this type is a UNION (`Agent | OpenclawAgentHandle`) because the
 * registry still also holds Mastra Agent instances on the back-compat branch.
 * Plan 203-08 narrows this to `OpenclawAgentHandle` alone after Mastra purge.
 */
export interface OpenclawAgentHandle {
	readonly id: string
	readonly name: string
	readonly instructions: string
	readonly modelName: string
	readonly toolIds: readonly string[]
	/**
	 * Stable kind discriminator. Lets consumers branch on agent provenance
	 * without instanceof checks (the Mastra `Agent` class is opaque).
	 */
	readonly kind: 'openclaw'
}

/**
 * Conversation memory surface the LivOSAgent runtime expects. During the
 * 203-07/08 coexistence window the concrete implementation BACKS this with
 * Mastra Memory (PgStore + PgVector) so existing thread state is preserved.
 * Plan 203-08 can swap the backing store without altering callers.
 */
export interface ConversationMemoryAdapter {
	/**
	 * Append (or save) a thread. Mirrors Mastra's saveThread shape so the
	 * existing scheduler.ts pass-through stays unchanged.
	 */
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
 * Minimal logger surface — matches McpBridgeLogger / SchedulerLogger so the
 * boot wire-up passes the same object to every module.
 */
export interface AgentRuntimeLogger {
	info: (msg: string) => void
	warn: (msg: string, error?: unknown) => void
}

/**
 * Phase 203-08 — provider router + approval gate types now live under the
 * agent-runtime/ subtree (modules/mastra/ deleted with the Mastra purge).
 */
export type {ProviderRouter} from './provider-router.js'
export type {ApprovalGate} from './agents/wrap-tool-with-approval.js'
