// Phase 22 MH-04 — In-process registry of connected docker-agents.
//
// Tracks Map<agentId, {ws, pendingRequests}>. AgentDockerClient calls
// `sendRequest(agentId, method, args)` which:
//   1. Looks up the agent by id (rejects [agent-offline] if not connected)
//   2. Generates a requestId and stores a {resolve, reject, timeout} entry
//      in the agent's pending Map
//   3. Sends the AgentRequest JSON over the WS
//   4. When the agent replies with AgentResponse(requestId), `handleResponse`
//      pops the pending entry and resolves/rejects the awaiting promise
//   5. If 30s elapse without a response, the timeout fires [agent-timeout]
//
// Pattern reused from devices/device-bridge.ts (pendingRequests Map +
// requestId-driven response demux).

import {randomUUID} from 'node:crypto'
import type {WebSocket} from 'ws'

import type {AgentRequest, AgentResponse} from './agent-protocol.js'

interface PendingRequest {
	resolve: (result: unknown) => void
	reject: (err: Error) => void
	timeout: ReturnType<typeof setTimeout>
}

interface ConnectedAgent {
	ws: WebSocket
	pending: Map<string, PendingRequest>
}

const REQUEST_TIMEOUT_MS = 30_000

export class AgentRegistry {
	private agents = new Map<string, ConnectedAgent>()

	/**
	 * Register a freshly-handshaked agent. If an existing connection is present
	 * for the same agentId (e.g. agent reconnected before the previous WS close
	 * propagated), drop the old connection so newer-wins. Pending requests on
	 * the displaced connection are rejected with [agent-replaced].
	 */
	registerAgent(agentId: string, ws: WebSocket): void {
		const existing = this.agents.get(agentId)
		if (existing) {
			try {
				existing.ws.close(4409, 'replaced-by-new-connection')
			} catch {
				// best-effort close — old WS may already be dead
			}
			for (const [, pending] of existing.pending) {
				clearTimeout(pending.timeout)
				pending.reject(new Error('[agent-replaced]'))
			}
		}
		this.agents.set(agentId, {ws, pending: new Map()})
	}

	/**
	 * Drop the agent from the registry and reject any pending requests.
	 * Called from the WS close handler in agent-socket.ts. Idempotent.
	 */
	unregisterAgent(agentId: string): void {
		const conn = this.agents.get(agentId)
		if (!conn) return
		for (const [, pending] of conn.pending) {
			clearTimeout(pending.timeout)
			pending.reject(new Error('[agent-disconnected]'))
		}
		this.agents.delete(agentId)
	}

	isAgentOnline(agentId: string): boolean {
		return this.agents.has(agentId)
	}

	/**
	 * Send a Docker API request to a connected agent and await the response.
	 * Throws:
	 *   [agent-offline]    — agent not connected (UI should show offline banner)
	 *   [agent-timeout]    — no response within 30s
	 *   [agent-send-failed] — WS send threw (typically TCP-level error)
	 *   [agent-replaced]   — connection was displaced by a newer one mid-flight
	 *   [agent-disconnected] — connection closed mid-flight
	 *   <docker-error>     — agent forwarded a Dockerode error (statusCode + message preserved)
	 */
	async sendRequest(agentId: string, method: string, args: unknown[]): Promise<unknown> {
		const conn = this.agents.get(agentId)
		if (!conn) throw new Error(`[agent-offline] agent ${agentId} is not connected`)
		const requestId = randomUUID()
		const message: AgentRequest = {type: 'request', requestId, method, args}
		return new Promise<unknown>((resolve, reject) => {
			const timeout = setTimeout(() => {
				conn.pending.delete(requestId)
				reject(
					new Error(
						`[agent-timeout] ${method} did not respond within ${REQUEST_TIMEOUT_MS}ms`,
					),
				)
			}, REQUEST_TIMEOUT_MS)
			conn.pending.set(requestId, {resolve, reject, timeout})
			try {
				conn.ws.send(JSON.stringify(message))
			} catch (err: any) {
				clearTimeout(timeout)
				conn.pending.delete(requestId)
				reject(new Error(`[agent-send-failed] ${err.message ?? String(err)}`))
			}
		})
	}

	/**
	 * Pop the pending entry for response.requestId and resolve / reject it.
	 * Called from agent-socket.ts on incoming `response` messages.
	 * If the agent or pending entry is gone (e.g. timeout already fired), drops silently.
	 */
	handleResponse(agentId: string, response: AgentResponse): void {
		const conn = this.agents.get(agentId)
		if (!conn) return
		const pending = conn.pending.get(response.requestId)
		if (!pending) return
		clearTimeout(pending.timeout)
		conn.pending.delete(response.requestId)
		if (response.error) {
			const err = new Error(response.error.message)
			;(err as any).statusCode = response.error.statusCode
			;(err as any).code = response.error.code
			pending.reject(err)
		} else {
			pending.resolve(response.result)
		}
	}

	/**
	 * Used by the Redis revocation subscriber: closes the agent's WS with code
	 * 4403 'token-revoked'. The WS close handler in agent-socket.ts will then
	 * call unregisterAgent() and mark environments.agent_status='offline'.
	 */
	forceDisconnect(agentId: string, reason: string): void {
		const conn = this.agents.get(agentId)
		if (!conn) return
		try {
			conn.ws.close(4403, reason)
		} catch {
			// best-effort — if close throws, the WS is already gone
		}
	}
}

// Module-level singleton — match the pattern used by Dockerode factory
// (one process-wide registry shared across all routes / boot wiring).
export const agentRegistry = new AgentRegistry()
