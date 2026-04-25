// Phase 22 MH-04 — Wire protocol for outbound docker-agent.
//
// KEEP IN SYNC with livos/packages/docker-agent/src/protocol.ts. The agent
// binary speaks this protocol over a single WebSocket connection to
// `/agent/connect`. Every message has a `type` discriminator.

/**
 * Agent → Server: handshake. Sent IMMEDIATELY after WS open. The server
 * resolves `token` to a docker_agents row (verifying revoked_at IS NULL)
 * and replies with `registered` or closes with code 4401.
 */
export interface AgentRegister {
	type: 'register'
	token: string
	agentVersion: string
	platform: string
	dockerVersion?: string
}

/**
 * Server → Agent: handshake ack. After this, the server may send `request`
 * messages and expects `response` back.
 */
export interface AgentRegistered {
	type: 'registered'
	agentId: string
	serverTime: number
}

/**
 * Server → Agent: invoke a Docker API method. The agent dispatches via the
 * shared method dispatch table (proxy.ts) and replies with `response`.
 *
 * `method` examples: 'listContainers', 'container.start', 'image.pull'
 *                    (object.method form for Dockerode handle methods)
 * `args`   matches the Dockerode method signature, JSON-serialised
 */
export interface AgentRequest {
	type: 'request'
	requestId: string
	method: string
	args: unknown[]
}

/**
 * Agent → Server: response to a request. Either `result` (success) OR
 * `error` (failure). Mutually exclusive.
 */
export interface AgentResponse {
	type: 'response'
	requestId: string
	result?: unknown
	error?: {message: string; code?: string; statusCode?: number}
}

/**
 * Agent → Server: streaming progress (e.g. `image.pull` layer downloads).
 * v27.0 uses synchronous-style `pull` (agent waits, replies once); reserved
 * for v28 streaming pulls.
 */
export interface AgentProgress {
	type: 'progress'
	requestId: string
	data: unknown
}

/**
 * Server → Agent: liveness check (every 30s). Agent must reply with `pong`.
 * Server uses absent pongs as a hint to mark agent_status='offline' (the WS
 * close itself is authoritative; ping is just a faster-than-TCP-keepalive
 * detection mechanism).
 */
export interface AgentPing {
	type: 'ping'
	ts: number
}

/**
 * Agent → Server: pong reply. Server uses receipt timestamp to bump
 * docker_agents.last_seen for "agent is alive" UI signals.
 */
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
