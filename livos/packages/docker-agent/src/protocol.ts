// Phase 22 MH-04 — Outbound docker-agent wire protocol.
//
// KEEP IN SYNC with livos/packages/livinityd/source/modules/docker/agent-protocol.ts.
// Both sides parse the same JSON envelope; types here are duplicated so this
// package has zero runtime deps on livinityd (it ships standalone to remote
// hosts that do NOT have livinityd installed).

export interface AgentRegister {
	type: 'register'
	token: string
	agentVersion: string
	platform: string
	dockerVersion?: string
}

export interface AgentRegistered {
	type: 'registered'
	agentId: string
	serverTime: number
}

export interface AgentRequest {
	type: 'request'
	requestId: string
	method: string
	args: unknown[]
}

export interface AgentResponse {
	type: 'response'
	requestId: string
	result?: unknown
	error?: {message: string; code?: string; statusCode?: number}
}

export interface AgentProgress {
	type: 'progress'
	requestId: string
	data: unknown
}

export interface AgentPing {
	type: 'ping'
	ts: number
}

export interface AgentPong {
	type: 'pong'
	ts: number
}

export type AgentMessage =
	| AgentRegister
	| AgentRegistered
	| AgentRequest
	| AgentResponse
	| AgentProgress
	| AgentPing
	| AgentPong
