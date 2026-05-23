/**
 * Phase 203-07 — LivOSAgent (Branch A: openclaw built-in LLM dispatch).
 *
 * Successor to `LivOSMastra` (mastra/index.ts). Branch A locked per Plan
 * 203-01 SPIKE / D-203-06 — openclaw self-dispatches LLM, LivOSAgent is a
 * thin wrapper that holds:
 *   - `agentClient` (OpenclawClient) — control-plane shim to the gateway
 *   - `memory`, `mcpBridge`, `registry`, `scheduler`, `approvalManager`,
 *     `agentInstance` — slot-for-slot mirror of LivOSMastra so the boot
 *     wire-up in `livinityd/source/index.ts` swaps with minimal change
 *
 * attach* surface (1:1 with LivOSMastra except the two D-203-07 renames):
 *   attachMemory           ← LivOSMastra.attachMemory
 *   attachMcpBridge        ← LivOSMastra.attachMcpBridge
 *   attachRegistry         ← LivOSMastra.attachRegistry
 *   attachScheduler        ← LivOSMastra.attachScheduler
 *   attachApprovalManager  NEW — surface the approval gate explicitly so
 *                          downstream code stops fishing it out of mcpBridge
 *   attachAgentClient      ← (renamed slot) — replaces attachLivAiAgent;
 *                          accepts the OpenclawClient instead of a Mastra Agent
 *   attachAgentInstance    ← LivOSMastra.attachMastraInstance (D-203-07 rename)
 *
 * The `agents` slot is preserved as a typed dict so chat-route's back-compat
 * reader (`deps.livOSMastra.agents.livAi`) keeps working during the
 * 203-07/08 coexistence window. Plan 203-08 narrows the type to
 * `OpenclawAgentHandle | undefined` after the Mastra Agent class is purged.
 *
 * Feature flag: `LIVOS_AGENT_RUNTIME` env var read in boot:
 *   `mastra`   (default) → boot still wires LivOSMastra (back-compat)
 *   `openclaw`           → boot wires this LivOSAgent
 *
 * Sacred SHA preserved (INV-203-01 — this file is NEW, not on the 20-file list).
 */

import type {
	AgentRuntimeLogger,
	ConversationMemoryAdapter,
	OpenclawAgentHandle,
	ProviderRouter,
} from './types.js'
import {OpenclawClient} from './openclaw-client.js'
// Phase 203-08 — concrete types for the LivOSAgent slots so tRPC routers
// (agent-router, agent-task-router) can call `.refresh()` / `.runOnce()` /
// memory.* methods without unknown-cast gymnastics. Mirrors the LivOSMastra
// slot-shape contract these routers consumed pre-203-08.
import type {AgentRegistry} from './agents/agent-registry.js'
import type {AgentScheduler} from './scheduler.js'
import type {McpBridge} from './mcp-bridge.js'
import type {ApprovalManager} from './approval-manager.js'
import type {LocalAgent} from './agents/agent-factory.js'

// Re-export the openclaw client + types so consumers import everything via
// the agent-runtime barrel (parallel to mastra/index.ts shape).
export {OpenclawClient} from './openclaw-client.js'
export type {
	OpenclawClientConfig,
	InvokeRequest,
	InvokeStreamChunk,
} from './openclaw-client.js'
export {
	OpenclawClientError,
	OpenclawClientAuthError,
	OpenclawClientUnavailableError,
} from './openclaw-client.js'
export type {
	OpenclawAgentHandle,
	ConversationMemoryAdapter,
	AgentRuntimeLogger,
	ProviderRouter,
	ApprovalGate,
} from './types.js'
export {createAgentFromRow} from './agents/agent-factory.js'
export type {
	AgentFactoryDeps,
	AgentFactoryDeps as AgentRuntimeFactoryDeps,
	LocalAgent,
} from './agents/agent-factory.js'

// Phase 203-08 — re-export the framework-agnostic helpers that the boot
// wire-up + chat-route + tRPC routers consume. Lets the boot file's
// agent-runtime imports stay compact.
export {createProviderRouter} from './provider-router.js'
export {ProviderNotConfiguredError} from './errors.js'

/**
 * Phase 203-08 — slot types narrowed to the concrete classes the boot
 * wire-up attaches. The tRPC routers (agent-router / agent-task-router) call
 * `.refresh()` on registry/scheduler and `saveThread/listThreads/recall/...`
 * on memory; previously these were `unknown` (203-07 coexistence window)
 * which forced unsafe casts at every call site.
 */
export type LivOSAgentMemory = ConversationMemoryAdapter | unknown
export type LivOSAgentMcpBridge = McpBridge | null
export type LivOSAgentRegistry = AgentRegistry | null
export type LivOSAgentScheduler = AgentScheduler | null
export type LivOSAgentApprovalManager = ApprovalManager | null
/**
 * Future-feature hook point matching `LivOSMastra.mastraInstance`. Branch A
 * has no equivalent "gateway instance" object (the gateway lives in its own
 * process — the client IS the surface). Kept as `unknown` so a future runtime
 * adapter (e.g. a per-process control object) can be attached without surface
 * change.
 */
export type LivOSAgentInstance = unknown

export interface LivOSAgentDeps {
	providerRouter: ProviderRouter
	logger?: AgentRuntimeLogger
}

export class LivOSAgent {
	readonly providerRouter: ProviderRouter
	readonly logger: AgentRuntimeLogger
	/**
	 * Back-compat slot mirroring `LivOSMastra.agents.livAi`. During the
	 * 203-07/08 coexistence window this holds an `OpenclawAgentHandle` for
	 * the seeded `livAi` row (populated from `registry.getByName('livAi')`
	 * the same way LivOSMastra does today). Chat-route's legacy reader keeps
	 * working without re-routing.
	 */
	/**
	 * Phase 203-08 — `livAi` slot type widened to `LocalAgent | OpenclawAgentHandle`.
	 * The registry now returns LocalAgent (per the Mastra purge); the
	 * back-compat OpenclawAgentHandle path stays so the 203-07 test surface
	 * (livos-agent.test.ts) keeps compiling.
	 */
	readonly agents: {livAi?: LocalAgent | OpenclawAgentHandle} = {}
	agentClient: OpenclawClient | null = null
	memory: LivOSAgentMemory | null = null
	mcpBridge: LivOSAgentMcpBridge = null
	registry: LivOSAgentRegistry = null
	scheduler: LivOSAgentScheduler = null
	approvalManager: LivOSAgentApprovalManager = null
	agentInstance: LivOSAgentInstance | null = null

	constructor(deps: LivOSAgentDeps) {
		this.providerRouter = deps.providerRouter
		this.logger = deps.logger ?? {
			info: () => {},
			warn: () => {},
		}
	}

	/**
	 * Attach the openclaw HTTP client. Constructed by the boot wire-up with
	 * the gateway base URL + the device-token resolver (Plan 203-05) wired
	 * in.
	 */
	attachAgentClient(client: OpenclawClient): void {
		this.agentClient = client
	}

	/**
	 * Surface the seeded `livAi` handle (or any default agent the
	 * chat-route legacy reader is allowed to assume). Mirrors
	 * `LivOSMastra.attachLivAiAgent` but takes an OpenclawAgentHandle, not a
	 * Mastra Agent. Renamed per D-203-07 — `attachLivAiAgent` → `attachLivAi`
	 * to drop the Mastra-specific suffix while keeping the wire-up readable.
	 */
	attachLivAi(handle: LocalAgent | OpenclawAgentHandle): void {
		this.agents.livAi = handle
	}

	attachMemory(memory: LivOSAgentMemory): void {
		this.memory = memory
	}

	attachMcpBridge(bridge: LivOSAgentMcpBridge): void {
		this.mcpBridge = bridge
	}

	attachRegistry(registry: LivOSAgentRegistry): void {
		this.registry = registry
	}

	attachScheduler(scheduler: LivOSAgentScheduler): void {
		this.scheduler = scheduler
	}

	attachApprovalManager(mgr: LivOSAgentApprovalManager): void {
		this.approvalManager = mgr
	}

	/**
	 * Future-feature hook (D-203-07 rename of `attachMastraInstance`). Branch A
	 * has no equivalent "wrap object" — kept here for boot-wire-up symmetry so
	 * downstream code that opportunistically reads `livOSAgent.agentInstance`
	 * does not crash on undefined.
	 */
	attachAgentInstance(instance: LivOSAgentInstance): void {
		this.agentInstance = instance
	}
}
