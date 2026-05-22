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
}

// Barrel re-exports so Plan 197-01 callers can:
//   import {LivOSMastra, createProviderRouter} from './modules/mastra/index.js'
export {createProviderRouter} from './provider-router.js'
export type {ProviderRouter} from './provider-router.js'
export {ProviderNotConfiguredError} from './errors.js'
