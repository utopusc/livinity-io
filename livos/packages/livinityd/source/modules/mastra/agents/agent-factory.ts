/**
 * Phase 202-02 — Agent factory.
 *
 * Turns a persisted `LivosAgent` row into a live Mastra `Agent`. Replaces the
 * single hard-coded `createLivAiAgent` factory with a generic one driven by
 * the `livos_agents` table.
 *
 * The factory is invoked from `AgentRegistry` (this same plan, Task 2) — once
 * on boot per row, then again on every CRUD mutation that calls
 * `registry.refresh()`. The repository-row is the only configuration surface;
 * provider routing, MCP tool catalog, approval gate, and memory are injected
 * via `deps` so concrete instances stay swappable across tests + future
 * provider work.
 *
 * Locks honoured:
 *   W-02 — destructive tools wrapped via wrapToolWithApproval (preserved per
 *          INV-202-04). Wrap order is the SAME as Phase 197-04's livAi
 *          factory: filterMcp(rawTools) → wrapDestructive(filtered) → spread
 *          builtIns (which are wrapDestructive'd separately). Built-ins
 *          shadow MCP tools of the same name, matching the existing
 *          intentional behaviour from Phase 198 UAT hot-fix #3.
 *   B-02 — does NOT modify ../index.ts (LivOSMastra contract is FINAL —
 *          Phase 202-02 only ADDS a new `registry` slot + `attachRegistry`
 *          method in a separate edit; this file never touches the singleton).
 *   N-01 — destructive detection uses the NAMED destructiveToolNames Set
 *          from mcp-bridge.ts (carried forward from Phase 197-04).
 *   D-202-03 — Supervisor pattern: parent agents with children receive an
 *              `agents: { childName: childAgent }` map via the `subAgents`
 *              dep. Children themselves are constructed without `agents:`
 *              (depth 2 cap — D-202-13 / INV-202-06).
 *   D-202-17 — sub-agents share the parent Memory instance (passed in
 *              `deps.memory` — Mastra Supervisor default). A fresh thread
 *              per delegation is the runtime's job; the factory just hands
 *              the same Memory object down.
 *   D-202-20 — preserved by the registry's seeding pattern: the livAi row
 *              flows through this factory exactly like any other row, so its
 *              tool catalog stays Phase 200-C built-ins + Luse MCP without
 *              special-casing here (toolIds=[] = inherit-everything is read
 *              by the factory as "no filter").
 *
 * Threat mitigations:
 *   T-202-04 (runtime double-check) — if `subAgents` map is provided AND any
 *           of those sub-agents would itself be a parent, the registry-side
 *           pass logs a warning and refuses to wire them deeper. This factory
 *           ONLY consumes the already-flattened map — the depth check happens
 *           in the registry to keep this surface pure.
 */

import {Agent} from '@mastra/core/agent'
import type {RequestContext} from '@mastra/core/request-context'

import type {ProviderRouter} from '../provider-router.js'
import type {McpBridge} from '../mcp-bridge.js'
import {destructiveToolNames} from '../mcp-bridge.js'
import {builtInTools} from './built-in-tools.js'
import {filterMcpTools} from './liv-ai.js'
import {
	wrapToolWithApproval,
	type ApprovalGate,
	type MinimalTool,
} from './wrap-tool-with-approval.js'
import type {LivosAgent} from '../../../db/schema.js'

/**
 * W-02 lock — wraps every tool whose namespaced id is in destructiveToolNames
 * with wrapToolWithApproval. Non-destructive tools pass through unmodified.
 *
 * Identical body to liv-ai.ts:wrapDestructiveTools — duplicated here only to
 * keep agent-factory standalone without a back-import that would create a
 * circular dep (liv-ai.ts already imports from this file's siblings).
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

/**
 * Per-agent tool filter — when `row.toolIds` is non-empty, only tools whose
 * KEY appears in the list survive the filter. Empty list = inherit
 * everything (the default for the seeded livAi row, per D-202-20).
 *
 * Applied AFTER the MCP allow-list filter (filterMcpTools) and BEFORE the
 * approval-wrap pass so a destructive Luse tool excluded via row.toolIds
 * never even reaches the approval gate.
 */
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
	 * Phase 202-02 D-202-03 — Supervisor map for parent agents.
	 * Keys = sub-agent NAME (matches Mastra's Supervisor expectation that
	 * agent keys are usable as tool-style names by the parent's planner).
	 * Values = already-constructed Mastra Agent instances.
	 *
	 * Absent or empty = construct a plain agent with no sub-agents (the
	 * common case — children + leaf agents).
	 */
	subAgents?: Record<string, Agent>
}

/**
 * Phase 202-02 entry point. Builds a Mastra Agent from a single livos_agents
 * row + the shared runtime deps.
 *
 * The returned Agent reuses the SAME contract Phase 197-04 ships: dynamic
 * model resolver pulling `modelName` off the RequestContext per turn, async
 * tool catalog re-evaluated per call, Memory instance handed through verbatim.
 *
 * D-202-17 sub-agent memory inheritance: when `subAgents` is populated, those
 * child agents were ALREADY constructed via this same factory with the same
 * `deps.memory` — the SUPERVISOR Agent does not double-wrap memory; Mastra
 * handles the per-delegation fresh-thread spawn under the shared instance.
 */
export function createAgentFromRow(
	row: LivosAgent,
	deps: AgentFactoryDeps,
): Agent {
	// Static instructions per row. Field defaults to '' in the DB; an empty
	// string is a legal Mastra value (no instructions = base model behaviour).
	const instructions = row.instructions

	// Phase 199-03 — per-request dynamic model resolver. We forward whatever
	// the RequestContext yields (may be undefined when the chat-route
	// frontend hasn't pushed a modelName yet). `resolveAgentModel` coerces
	// undefined / unknown ids to the XAI default per D-199-24 soft
	// validation. Row.modelName is NOT used here — the registry-driven
	// per-row default would diverge from the Phase 199-03 contract that
	// liv-ai.test.ts (Test 12) regression-locks. Future per-row default
	// overrides should be injected by chat-route building the
	// RequestContext from the resolved row's modelName, not by the factory.
	void row.modelName // reserved for future per-row default surfacing

	const modelResolver = (({
		requestContext,
	}: {
		requestContext: RequestContext
	}) => {
		const requestModelName = requestContext.get('modelName') as
			| string
			| undefined
		return deps.providerRouter.resolveAgentModel(requestModelName)
	}) as never

	// Per-turn async tool resolver. Mirrors the Phase 197-04 livAi factory's
	// wrap order: (filterMcp(rawTools) → wrapDestructive) merged with
	// wrapDestructive(builtInTools). The row-level allow-list applies to the
	// COMBINED catalog AFTER both halves are merged — preserving the
	// intentional shadow rule (built-ins shadow MCP entries with the same
	// name) AND letting the operator carve out a subset of built-ins per
	// agent via the UI (D-202-09 + Phase 202-04+ tool picker).
	const toolsResolver = (async () => {
		const mcpFiltered = filterMcpTools(await deps.mcpBridge.listTools())
		const mcpWrapped = wrapDestructiveTools(
			mcpFiltered,
			deps.approvalManager,
		)
		const builtInsWrapped = wrapDestructiveTools(
			builtInTools,
			deps.approvalManager,
		)
		const combined: Record<string, unknown> = {
			...mcpWrapped,
			...builtInsWrapped, // built-ins shadow MCP entries with same name
		}
		return applyRowToolFilter(combined, row.toolIds)
	}) as never

	// D-202-03 Supervisor wire: include `agents: {...}` only when the
	// registry hands us a non-empty subAgents map. Mastra interprets an empty
	// map differently from undefined in some edge paths; we keep undefined as
	// the "no supervisor" signal.
	const hasSubAgents =
		deps.subAgents !== undefined && Object.keys(deps.subAgents).length > 0

	const config: Record<string, unknown> = {
		id: row.id,
		name: row.name,
		instructions,
		model: modelResolver,
		tools: toolsResolver,
		memory: deps.memory as never,
	}
	if (hasSubAgents) {
		config.agents = deps.subAgents
	}

	return new Agent(config as never)
}
