import type {AgentEvent, AgentResult} from '@nexus/core'
import type Livinityd from '../../index.js'
import {isMultiUserMode} from '../ai/per-user-claude.js'

/**
 * Phase 45 Plan 02 (FR-CF-01) — typed upstream error.
 *
 * Thrown by createSdkAgentRunnerForUser when the upstream nexus
 * /api/agent/stream call returns a non-OK Response. Captures status
 * + Retry-After header so the router catch blocks can forward
 * verbatim per the strict 429-only allowlist (pitfall B-09).
 *
 * Retry-After is preserved BYTE-IDENTICAL — both delta-seconds
 * (`'60'`) and HTTP-date (`'Wed, 21 Oct 2026 07:28:00 GMT'`)
 * formats are forwarded as-is, no parsing, no normalization
 * (pitfall B-10 / RFC 7231 §7.1.3).
 */
export class UpstreamHttpError extends Error {
	readonly status: number
	readonly retryAfter: string | null
	constructor(message: string, status: number, retryAfter: string | null) {
		super(message)
		this.name = 'UpstreamHttpError'
		this.status = status
		this.retryAfter = retryAfter
	}
}

/**
 * Strategy B per Plan 41-03 <interfaces>:
 * Run a task through nexus's existing /api/agent/stream endpoint via HTTP,
 * with per-user HOME isolation threaded via the `X-LivOS-User-Id` header
 * (consumed by Plan 41-04's nexus-side handler).
 *
 * Multi-user mode: sends `X-LivOS-User-Id` header → nexus sets
 *                  AgentConfig.homeOverride to /opt/livos/data/users/<userId>/.claude
 *                  → SdkAgentRunner spawn HOME = that dir.
 * Single-user mode: omits the header → nexus uses process.env.HOME
 *                   (pre-Phase-41 behavior preserved).
 *
 * Phase 41.3 hotfix — env override `BROKER_FORCE_ROOT_HOME=true`:
 *   When set, the X-LivOS-User-Id header is NEVER sent regardless of
 *   multi-user mode. Every broker request resolves to the daemon's
 *   process.env.HOME (typically /root for Mini PC root-run livinityd) and
 *   uses that single shared `~/.claude/.credentials.json`.
 *   Use case: deployments where one Claude subscription is shared across
 *   all LivOS users (the user's explicit "tek subscription, root only"
 *   choice). Avoids the per-user HOME bug where SdkAgentRunner subprocess
 *   ends up with HOME=<...>/.claude and can't find credentials at the
 *   correct ~/.claude/.credentials.json path.
 *
 * Returns an async generator yielding AgentEvent values, with the AgentResult
 * as the generator's return value.
 *
 * Per D-41-09 + D-41-10 + sacred-file constraint: SdkAgentRunner is sacred.
 * The broker invokes it indirectly via /api/agent/stream rather than
 * instantiating in-process — Strategy A (direct instantiation) would require
 * a livinityd-side handle to nexus's brain + toolRegistry which doesn't exist
 * today. Strategy B reuses the existing AI Chat proxy pattern unchanged.
 *
 * Name `createSdkAgentRunnerForUser` is kept for future migration to
 * Strategy A if ever desired.
 */
export async function* createSdkAgentRunnerForUser(opts: {
	livinityd: Livinityd
	userId: string
	task: string
	contextPrefix?: string
	systemPromptOverride?: string
	maxTurns?: number
	signal?: AbortSignal
}): AsyncGenerator<AgentEvent, AgentResult, void> {
	const {livinityd, userId, task, contextPrefix, systemPromptOverride, maxTurns = 30, signal} = opts
	const livApiUrl = process.env.LIV_API_URL || 'http://localhost:3200'

	const multiUser = await isMultiUserMode(livinityd).catch(() => false)
	const forceRootHome = process.env.BROKER_FORCE_ROOT_HOME === 'true'
	const headers: Record<string, string> = {'Content-Type': 'application/json'}
	if (process.env.LIV_API_KEY) headers['X-API-Key'] = process.env.LIV_API_KEY
	// Phase 41.3: BROKER_FORCE_ROOT_HOME bypasses per-user HOME isolation.
	// When set, every broker request shares the daemon's HOME (single subscription mode).
	if (multiUser && !forceRootHome) headers['X-LivOS-User-Id'] = userId // Plan 41-04 wires nexus to consume

	const body = {
		task,
		max_turns: maxTurns,
		conversationId: `broker-${userId}-${Date.now()}`,
		contextPrefix,
		systemPromptOverride,
	}

	const response = await fetch(`${livApiUrl}/api/agent/stream`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
		signal,
	})

	if (!response.ok || !response.body) {
		const retryAfter = response.headers.get('Retry-After')
		throw new UpstreamHttpError(
			`/api/agent/stream returned ${response.status} ${response.statusText}`,
			response.status,
			retryAfter,
		)
	}

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''
	let finalResult: AgentResult | null = null

	try {
		while (true) {
			const {done, value} = await reader.read()
			if (done) break
			buffer += decoder.decode(value, {stream: true})
			const lines = buffer.split('\n')
			buffer = lines.pop() || ''
			for (const line of lines) {
				if (!line.startsWith('data: ')) continue
				let event: AgentEvent
				try {
					event = JSON.parse(line.slice(6)) as AgentEvent
				} catch {
					continue
				}
				// 'done' event from /api/agent/stream carries the final result
				if (event.type === 'done' && event.data && typeof event.data === 'object') {
					const d = event.data as {
						success?: boolean
						answer?: string
						turns?: number
						stoppedReason?: AgentResult['stoppedReason']
					}
					finalResult = {
						success: d.success ?? false,
						answer: d.answer ?? '',
						turns: d.turns ?? 0,
						totalInputTokens: 0, // not surfaced by /api/agent/stream — Phase 44 may augment
						totalOutputTokens: 0,
						toolCalls: [],
						stoppedReason: d.stoppedReason ?? 'complete',
					}
				} else {
					yield event
				}
			}
		}
	} finally {
		reader.releaseLock()
	}

	return (
		finalResult ?? {
			success: false,
			answer: '',
			turns: 0,
			totalInputTokens: 0,
			totalOutputTokens: 0,
			toolCalls: [],
			stoppedReason: 'error',
		}
	)
}
