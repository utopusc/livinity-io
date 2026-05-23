/**
 * Phase 197-01 — LivOSMastra singleton.
 *
 * **B-02 lock**: This file ships the FINAL contract in Wave 1. Plans
 * 197-02/03/04/05 only CALL the attach helpers below; they NEVER modify
 * this class. The typed `agents.livAi?: Agent` slot + `memory` + `mcpBridge`
 * slots are pre-declared with forward type aliases (`unknown` here) so the
 * later plans can attach concrete instances without rewriting the contract.
 */

import type {Agent} from '@mastra/core/agent'

import type {ProviderRouter} from './provider-router.js'
import type {AgentRegistry} from './agents/agent-registry.js'
import type {AgentScheduler} from './scheduler.js'

// Forward type aliases — narrowed structurally by the concrete inhabitants
// shipped from Plans 197-02 (McpBridge) and 197-03 (Memory). Kept `unknown`
// here so neither downstream plan needs to TOUCH this file.
export type LivOSMastraMemory = unknown
export type LivOSMastraMcpBridge = unknown

export class LivOSMastra {
	readonly providerRouter: ProviderRouter
	readonly agents: {livAi?: Agent} = {}
	memory: LivOSMastraMemory | null = null
	mcpBridge: LivOSMastraMcpBridge | null = null
	// Phase 202-02 — additive B-02-respecting extension. The class shape gains
	// ONE new nullable slot + ONE new attach method. The pre-existing
	// `agents.livAi?` slot stays — boot wire-up doubles up by populating it
	// from `registry.getByName('livAi')` so the Phase 198-01 chat-route slot
	// reader (chat-route.ts:107 `deps.livOSMastra.agents.livAi`) keeps working
	// during the one-release back-compat window. Plan 202-02 Task 4 then
	// migrates chat-route to read via the registry exclusively.
	registry: AgentRegistry | null = null
	// Phase 202-03 — additive B-02-respecting extension. Plan 202-03 ships a
	// node-cron + Redis SET NX PX scheduler; the boot wire-up constructs it
	// AFTER `registry.init()` (the scheduler needs the registry to look up
	// agents at fire time) and AFTER `attachMemory()` (it persists task
	// records via Memory.saveThread). The tRPC `agents.{create,update,delete}`
	// mutations in `agent-router.ts` call `scheduler?.refresh()` so cron
	// changes hot-reload without a livinityd restart.
	scheduler: AgentScheduler | null = null

	constructor(deps: {providerRouter: ProviderRouter}) {
		this.providerRouter = deps.providerRouter
	}

	// B-02 lock — these three attach methods are the FINAL surface.
	// Plans 197-02..05 CALL these; they never replace or extend this class.

	attachLivAiAgent(agent: Agent): void {
		this.agents.livAi = agent
	}

	attachMemory(memory: LivOSMastraMemory): void {
		this.memory = memory
	}

	attachMcpBridge(bridge: LivOSMastraMcpBridge): void {
		this.mcpBridge = bridge
	}

	// Phase 202-02 — additive attach helper (INV-202-03). Mirrors the
	// shape of the three existing attach* methods above so the boot
	// wire-up reads consistently.
	attachRegistry(registry: AgentRegistry): void {
		this.registry = registry
	}

	// Phase 202-03 — additive attach helper (INV-202-03). Mirrors the
	// existing attach* methods. Called from livinityd boot wire-up AFTER the
	// scheduler is constructed + initialised. tRPC mutations then call
	// `livOSMastra.scheduler?.refresh()` to rebuild the cron table after
	// every CRUD change.
	attachScheduler(scheduler: AgentScheduler): void {
		this.scheduler = scheduler
	}
}

// Barrel re-exports so Plan 197-01 callers can:
//   import {LivOSMastra, createProviderRouter} from './modules/mastra/index.js'
export {createProviderRouter} from './provider-router.js'
export type {ProviderRouter} from './provider-router.js'
export {ProviderNotConfiguredError} from './errors.js'
