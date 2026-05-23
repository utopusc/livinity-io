/**
 * Phase 203-07 — Agent factory (Branch A: openclaw built-in LLM dispatch).
 *
 * Contract-equivalent counterpart to `mastra/agents/agent-factory.ts`. Turns
 * a persisted `LivosAgent` row into a runtime handle (`OpenclawAgentHandle`)
 * that the AgentRegistry + AgentScheduler + chat-route allow-list can store
 * + resolve interchangeably with a Mastra Agent during the 203-07/08
 * coexistence window.
 *
 * Branch A says openclaw self-dispatches LLM — there is NO model resolver,
 * NO async tool catalog, NO Memory injection at the factory layer. The
 * gateway owns all of that. The factory's job is to project a livos_agents
 * row into the metadata the runtime needs to invoke the gateway (id, name,
 * instructions, model name, tool filter) PLUS preserve the same `subAgents`
 * contract the Mastra factory exposes (per D-202-03 Supervisor pattern) so
 * AgentRegistry's two-pass Supervisor wiring continues to work unchanged.
 *
 * Sub-agent wiring: openclaw's gateway-level agent registry supports nested
 * agents natively (per 203-01 SPIKE — `agents.upsert(...)` accepts a `tools`
 * array that includes sub-agent ids). The factory simply records the
 * `subAgents` map on the handle so the gateway-projection layer (a future
 * `livOSAgent.start()` step that emits `agents.upsert(...)` frames) can wire
 * children at the gateway side. For Plan 203-07 we record-only.
 *
 * Sacred SHA preserved (INV-203-01 — this file is NEW).
 */

import type {LivosAgent} from '../../db/schema.js'
import type {OpenclawAgentHandle, ProviderRouter} from './types.js'

export interface AgentRuntimeFactoryDeps {
	providerRouter: ProviderRouter
	/**
	 * Branch A note — memory + mcpBridge + approvalManager are NOT injected
	 * into the handle (the gateway owns memory; tool calls fan out via the
	 * Plan 203-06 plugin-RPC, not via the factory). The fields are accepted
	 * for SIGNATURE compatibility with the Mastra factory so AgentRegistry
	 * can call `createAgentFromRow(row, deps)` with the same deps object
	 * regardless of branch (the registry doesn't know which factory it's
	 * calling). Branch A simply ignores them.
	 */
	memory?: unknown
	mcpBridge?: unknown
	approvalManager?: unknown
	/**
	 * D-202-03 Supervisor map — preserved for contract parity. Recorded on
	 * the handle as `subAgentNames` (just the keys, not the children
	 * themselves — the gateway resolves children by id when projecting).
	 */
	subAgents?: Record<string, OpenclawAgentHandle>
}

/**
 * Build an `OpenclawAgentHandle` from a `livos_agents` row + runtime deps.
 *
 * The handle is INTENTIONALLY shallow — it carries metadata only. Invocation
 * happens via `livOSAgent.agentClient.invoke({agentId: handle.id, ...})`.
 * This keeps the factory pure + cheap (no allocations of LLM clients, no
 * Memory wiring), matching the gateway-owns-everything posture of Branch A.
 *
 * Row-level tool filter (`row.toolIds`) is recorded on the handle so the
 * gateway-projection layer (future `livOSAgent.start()`) can pass it through
 * to `agents.upsert(...)`. Empty list = inherit-everything per D-202-20.
 */
export function createAgentFromRow(
	row: LivosAgent,
	deps: AgentRuntimeFactoryDeps,
): OpenclawAgentHandle {
	// providerRouter is referenced for model-name resolution parity with
	// the Mastra factory's `resolveAgentModel` call. Branch A still wants
	// the row's modelName resolved through the same provider router so
	// per-request modelName overrides (Phase 199-03) keep working — the
	// gateway accepts whatever string we hand it.
	const resolvedModel =
		row.modelName && row.modelName.trim().length > 0
			? row.modelName
			: resolveDefaultModel(deps.providerRouter)

	const subAgentNames = deps.subAgents
		? Object.keys(deps.subAgents)
		: []

	return {
		id: row.id,
		name: row.name,
		instructions: row.instructions,
		modelName: resolvedModel,
		toolIds: row.toolIds,
		kind: 'openclaw',
		// Sub-agent record kept off the public type (typed as readonly
		// metadata for the projection layer); attached as a non-enumerable
		// field would require Object.defineProperty + a `Record<string,
		// unknown>` widening — instead we surface it via the typed
		// extension below.
		...(subAgentNames.length > 0
			? {subAgentNames: subAgentNames as readonly string[]}
			: {}),
	} as OpenclawAgentHandle & {subAgentNames?: readonly string[]}
}

/**
 * Resolve the default model name when a row has no modelName set. Falls
 * through to providerRouter.resolveAgentModel(undefined) which yields the
 * provider default (per Phase 199-03 D-199-24 soft validation).
 */
function resolveDefaultModel(providerRouter: ProviderRouter): string {
	try {
		const resolved = (
			providerRouter as unknown as {
				resolveAgentModel?: (n: string | undefined) => unknown
			}
		).resolveAgentModel?.(undefined)
		if (typeof resolved === 'string') return resolved
		if (
			resolved &&
			typeof resolved === 'object' &&
			'modelId' in resolved &&
			typeof (resolved as {modelId: unknown}).modelId === 'string'
		) {
			return (resolved as {modelId: string}).modelId
		}
		return 'anthropic/claude-sonnet-4-6'
	} catch {
		return 'anthropic/claude-sonnet-4-6'
	}
}
