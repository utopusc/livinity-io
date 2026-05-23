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
 * Provider router contract — re-used as-is from the mastra branch so the
 * existing ProviderRouter implementation continues to satisfy LivOSAgent.
 */
export type {ProviderRouter} from '../mastra/provider-router.js'

/**
 * Approval gate contract — re-exported under the agent-runtime namespace so
 * downstream code is not coupled to the mastra subtree. Plan 203-08 will
 * move ApprovalManager out of mastra/ altogether; until then this is a
 * type-only passthrough.
 */
export type {ApprovalGate} from '../mastra/agents/wrap-tool-with-approval.js'
