/**
 * Phase 203-08 — Local agent factory.
 *
 * REPLACES the Phase 202-02 Mastra-based factory. After the Plan 203-08
 * Mastra purge, agents are NOT constructed via `new Agent({...})` from
 * `@mastra/core/agent`. Instead, this factory returns a `LocalAgent` — a
 * minimal handle carrying the row metadata + a `.stream()` shim that the
 * scheduler's cron-tick path can await without crashing.
 *
 * Real LLM dispatch flows through the openclaw HTTP gateway via
 * `LivOSAgent.agentClient.streamInvoke(...)` (Plan 203-07). The LocalAgent
 * `.stream()` returned here is a placeholder for the legacy duck-typed
 * `{text: Promise<string>}` consumer in scheduler.drainAgentStream — the
 * scheduler completes its lifecycle cleanly without invoking a real provider.
 *
 * The scheduler.runOnce → drainAgentStream path duck-types the return of
 * agent.stream() as `{text: Promise<string>} | AsyncIterable<unknown>`; the
 * shim returned here satisfies the first shape (`{text}`).
 *
 * Locks honoured (carried forward from the pre-203-08 factory):
 *   W-02 — destructive tools wrapped via wrapToolWithApproval (INV-202-04)
 *   N-01 — destructive detection by name via destructiveToolNames Set
 *   D-202-03 — Supervisor sub-agent shape preserved via `subAgentNames`
 *   D-202-17 — sub-agents share parent memory; factory just hands memory through
 *
 * The pre-203-08 factory's per-turn `RequestContext` resolver + Mastra
 * Supervisor wiring are DROPPED — both are gateway concerns now.
 */

import type {ProviderRouter} from '../provider-router.js'
import type {McpBridge} from '../mcp-bridge.js'
import {destructiveToolNames} from '../mcp-bridge.js'
import {builtInTools} from './built-in-tools.js'
import {
	wrapToolWithApproval,
	type ApprovalGate,
	type MinimalTool,
} from './wrap-tool-with-approval.js'
import type {LivosAgent} from '../../../db/schema.js'

/**
 * Phase 203-08 — Local agent shape replacing `@mastra/core/agent` Agent.
 * Carries the row metadata + a minimal `.stream()` for the scheduler's
 * cron-tick dispatch path. Real LLM dispatch flows through the openclaw
 * gateway (LivOSAgent.agentClient.streamInvoke) — this handle is just the
 * registry's projection of the row.
 */
export interface LocalAgent {
	readonly id: string
	readonly name: string
	readonly instructions: string
	readonly modelName: string
	readonly toolIds: readonly string[]
	readonly subAgentNames?: readonly string[]
	readonly tools: Record<string, unknown>
	stream(
		messages: unknown,
		opts?: unknown,
	): {text: Promise<string>}
}

/**
 * Phase 203-08 — Allow-listed MCP tool prefixes (carried forward from the
 * pre-203-08 `filterMcpTools` helper). Adding a future MCP source requires
 * updating this list.
 */
const ALLOWED_TOOL_PREFIXES = ['luse_', 'selfclaude_'] as const

export function filterMcpTools(
	rawTools: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [name, def] of Object.entries(rawTools)) {
		if (ALLOWED_TOOL_PREFIXES.some((p) => name.startsWith(p))) {
			out[name] = def
		}
	}
	return out
}

/**
 * W-02 lock — wrap every destructive tool with the approval gate. Carried
 * forward verbatim from the pre-203-08 factory (Phase 197-04 wrap order).
 */
function wrapDestructiveTools(
	tools: Record<string, unknown>,
	gate: ApprovalGate,
): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [name, def] of Object.entries(tools)) {
		if (destructiveToolNames.has(name)) {
			out[name] = wrapToolWithApproval(def as MinimalTool, name, gate)
		} else {
			out[name] = def
		}
	}
	return out
}

function applyRowToolFilter(
	tools: Record<string, unknown>,
	toolIds: readonly string[],
): Record<string, unknown> {
	if (toolIds.length === 0) return tools
	const allow = new Set(toolIds)
	const out: Record<string, unknown> = {}
	for (const [name, def] of Object.entries(tools)) {
		if (allow.has(name)) out[name] = def
	}
	return out
}

export interface AgentFactoryDeps {
	providerRouter: ProviderRouter
	memory: unknown
	mcpBridge: McpBridge
	approvalManager: ApprovalGate
	/**
	 * D-202-03 — Supervisor map for parent agents. Pre-203-08 callers passed
	 * concrete Mastra Agent objects; after 203-08 the registry hands
	 * LocalAgent handles. The factory only records the keys as
	 * `subAgentNames` because the openclaw gateway resolves supervisor
	 * dispatch by name (the gateway has its own agent map).
	 */
	subAgents?: Record<string, LocalAgent>
}

/**
 * Phase 203-08 entry point. Builds a LocalAgent from a single livos_agents
 * row + the shared runtime deps. Tool catalog assembly:
 *   1. wrap destructive built-ins with the approval gate (W-02)
 *   2. apply the row's toolIds allow-list (empty = inherit everything)
 * MCP tools are NOT merged here — Mastra used an async tools resolver per
 * turn; the openclaw gateway has its own MCP tool registry wired via
 * `liv-claw-plugin` (Plan 203-06 plugin-rpc). The factory only exposes the
 * built-in catalog so the registry's row-level tool inspection
 * (`agent.tools[name]`) still works for any operator-facing UI that surfaces
 * "this agent has access to ..." metadata.
 */
export function createAgentFromRow(
	row: LivosAgent,
	deps: AgentFactoryDeps,
): LocalAgent {
	// Intentionally consume deps used by pre-203-08 factory to silence
	// "unused argument" lint warnings while documenting the contract.
	void deps.providerRouter
	void deps.memory
	void deps.mcpBridge

	const builtInsWrapped = wrapDestructiveTools(builtInTools, deps.approvalManager)
	const initialTools = applyRowToolFilter(builtInsWrapped, row.toolIds)

	const subAgentNames =
		deps.subAgents !== undefined
			? (Object.keys(deps.subAgents) as readonly string[])
			: undefined

	const agent: LocalAgent = {
		id: row.id,
		name: row.name,
		instructions: row.instructions,
		modelName: row.modelName,
		toolIds: row.toolIds,
		...(subAgentNames && subAgentNames.length > 0 ? {subAgentNames} : {}),
		tools: initialTools,
		stream(_messages, _opts) {
			// Phase 203-08 — placeholder `.stream()` for the back-compat
			// scheduler path. Real LLM dispatch flows through
			// LivOSAgent.agentClient.streamInvoke (wired into the boot scope
			// in livinityd/source/index.ts). The scheduler's drain awaits
			// `.text` to flip the status SSE channel back to `idle`; we
			// resolve immediately with a notice string so the lifecycle
			// completes cleanly without invoking a real provider.
			return {
				text: Promise.resolve(
					'[agent-runtime/agent-factory] LocalAgent.stream() placeholder — dispatch flows through OpenclawClient.streamInvoke (LIV_AGENT_RUNTIME=openclaw).',
				),
			}
		},
	}
	return agent
}
