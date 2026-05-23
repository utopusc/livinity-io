/**
 * Phase 197-04 — Liv AI agent factory.
 *
 * Composes the three Wave 1 outputs (providerRouter + memory + mcpBridge) +
 * the Wave 3 approval gate into a single Mastra Agent. Dynamic model + tools
 * resolvers re-run per turn so provider swaps + MCP hot-loads take effect
 * without restart.
 *
 * Locks honoured:
 *   W-02 — destructive tools wrapped with wrapToolWithApproval; Reject
 *          returns a tool-result sentinel, agent stays alive
 *   B-02 — this file does NOT modify ../index.ts (LivOSMastra class is FINAL)
 *   N-01 — uses destructiveToolNames named import from mcp-bridge.ts for
 *          name-based destructive detection (NOT chunk.tool.meta)
 *
 * T-197-04-01 — LIV_AI_SYSTEM_PROMPT is a static string literal, no
 *               interpolation (`${...}` substring count must be 0).
 * T-197-04-04 — filterMcpTools enforces allow-listed prefixes; any future
 *               MCP source must be added to ALLOWED_TOOL_PREFIXES explicitly.
 */

import {Agent} from '@mastra/core/agent'

import type {ProviderRouter} from '../provider-router.js'
import type {McpBridge} from '../mcp-bridge.js'
import {destructiveToolNames} from '../mcp-bridge.js'
import {builtInTools} from './built-in-tools.js'
import {
	wrapToolWithApproval,
	type ApprovalGate,
	type MinimalTool,
} from './wrap-tool-with-approval.js'

// Phase 197-04 T-197-04-01 — static string, no interpolation.
// The literal substring 'luse_*' + 'selfclaude_*' + 'take a screenshot FIRST'
// + 'Liv AI, the assistant built into LivOS' MUST all appear (regression-locked).
//
// Phase 198 UAT hot-fix #3 — TOOL HONESTY clauses added. Without registered
// MCP sources the agent was hallucinating tool calls ("I called Luse, found
// 3 windows…") as plain text. The clauses below tell the model to be honest
// about tool availability — both Turkish + English so the operator's normal
// chat language gets the same behaviour.
export const LIV_AI_SYSTEM_PROMPT =
	"You are Liv AI, the assistant built into LivOS. You can:\n" +
	"- Chat with the operator and answer questions\n" +
	"- Take screenshots, list windows, click, type, launch apps (via the luse_* and selfclaude_* tools)\n" +
	"- Remember the operator's preferences and past conversations across sessions\n" +
	"- Run as part of the operator's own LivOS install (you are NOT a cloud service)\n" +
	"- Defer destructive actions for explicit operator approval before executing\n" +
	"\n" +
	"Tone: concise, direct, no narration. When the operator asks for a desktop action, take a screenshot FIRST to see current state, then act, then confirm.\n" +
	"\n" +
	"LANGUAGE: If the operator writes in Turkish, respond in Turkish. Code, paths, command output stay in their original form.\n" +
	"\n" +
	"TOOL HONESTY (CRITICAL):\n" +
	"- The operator's UI shows your tool calls visually. If you describe a tool call without actually calling one, the operator sees it as text-only with NO tool-call chunk and knows you are fabricating.\n" +
	"- NEVER pretend you called a tool. NEVER say 'I just used X' or 'kontrol ediyorum' unless you actually invoked the tool in this same turn.\n" +
	"- If a tool you need is not in your available tools list, say so explicitly: 'I don't have that tool available' / 'Bu tool şu an bağlı değil'. Do NOT invent the result.\n" +
	"- When you DO call a tool, the result arrives as structured data and is rendered by the UI automatically (Generative UI). Do not re-print the data as markdown — a short confirmation is enough."

// Phase 197-04 T-197-04-04 — allow-list governs which MCP-namespaced tools
// reach the agent. Adding a future MCP source requires updating this list.
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
 * W-02 lock — wraps every tool whose namespaced id is in destructiveToolNames
 * with wrapToolWithApproval. Non-destructive tools pass through unmodified.
 *
 * Uses the NAMED EXPORT destructiveToolNames from mcp-bridge.ts (N-01 lock)
 * instead of reaching into chunk.tool.meta — name-based detection is stable
 * across Mastra internal-surface changes.
 */
export function wrapDestructiveTools(
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

export interface LivAiAgentDeps {
	providerRouter: ProviderRouter
	memory: unknown
	mcpBridge: McpBridge
	approvalManager: ApprovalGate
}

export function createLivAiAgent(deps: LivAiAgentDeps): Agent {
	// Phase 197-04 T-197-04-03 — no processor steps configured. Future plans
	// adding processors must validate steps array length > 0 before passing
	// (Mastra ProcessorRunner issue #9352).
	return new Agent({
		id: 'liv-ai',
		name: 'Liv AI',
		instructions: LIV_AI_SYSTEM_PROMPT,
		// Dynamic model resolver re-runs per turn so an active-provider change
		// in Redis takes effect on the next message without restart (T-197-04-02).
		model: (async () => deps.providerRouter.resolveAgentModel()) as never,
		// T-197-04-04 + T-197-04-05 — filter raw MCP tool map through the
		// allow-list, then wrap destructive tools through the approval gate.
		//
		// Phase 198 UAT hot-fix #3 — merge built-in tools AFTER the wrap so
		// the agent always has weather + luse_list_windows + get_current_time
		// even when no MCP source is connected. None of the built-ins are
		// in destructiveToolNames, so they do not need the approval wrap.
		tools: (async () => ({
			...wrapDestructiveTools(
				filterMcpTools(await deps.mcpBridge.listTools()),
				deps.approvalManager,
			),
			...builtInTools,
		})) as never,
		memory: deps.memory as never,
	} as never)
}
