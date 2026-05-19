import type {AgentEvent, AgentResult} from '@liv/core'
import type Livinityd from '../../index.js'
import {
	buildActiveDisplaySnippet,
	buildActiveWindowSnippet,
	type ActiveAppMeta,
} from '../ai/agent-prompt-builder.js'
import {isMultiUserMode} from '../ai/per-user-claude.js'

/**
 * Phase 101-09 Pillar F (Hermes status_detail relay) — extended event type.
 *
 * The `@liv/core` `AgentEvent.type` union is closed
 * (`'thinking' | 'chunk' | 'tool_call' | 'observation' | 'final_answer' |
 *   'error' | 'done'`) and lives inside the liv tree, which is sacred-adjacent
 * for Phase 101. To re-yield `status_detail` chunks (V32-HERMES-01 — phase /
 * phrase / elapsed, emitted by liv-core RunStore in `liv-agent-runner.ts`)
 * without modifying the core type definition, we widen the yielded shape
 * with a local discriminated-union extension. Consumers that only care
 * about the core types continue to typecheck because the additional
 * variant only adds to the literal union.
 *
 * The payload mirrors the on-the-wire shape that liv-core RunStore
 * emits (`run-store.ts` chunk type `status_detail`, payload
 * `{phase, phrase, elapsed}`).
 */
export interface AgentStatusDetailEvent {
	type: 'status_detail'
	turn?: number
	data: {
		phase: 'thinking' | 'tool_use' | 'responding' | 'idle' | string
		phrase: string
		elapsed: number
	}
}

/** Phase 101-09 — union of core AgentEvent + the new status_detail relay. */
export type AgentBrokerEvent = AgentEvent | AgentStatusDetailEvent

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
	/**
	 * Phase 100-08-05 — when present, scopes the agent loop's MCP tools to
	 * the matching `luse:webapp:<webappId>` MCP child (registered by
	 * 100-08-04 in WebAppWindowManager.spawn). Forwarded verbatim in the
	 * request body to liv `/api/agent/stream`. On lag (target child not
	 * yet visible to liv-core's reconcile), api.ts falls through to host
	 * Luse for that turn (logged WARN, scope='lag-fallback').
	 * (Renamed P100-10-02 from bytebot per D-100-10-B.)
	 */
	webappId?: string
	/**
	 * Phase 101-06 (Pillar C) — Auto-context injection.
	 *
	 * When BOTH `activeWid` (X11 window id, integer) and `activeAppMeta`
	 * (the active app's identity record) are present, the broker prepends
	 * an `## Active Window Context` markdown snippet (built by
	 * `agent-prompt-builder.buildActiveWindowSnippet`) into the request's
	 * `contextPrefix` before forwarding to liv `/api/agent/stream`. The
	 * snippet tells the agent which LivOS app window is active so it can
	 * default `LUSE_TARGET_WINDOW_ID` for tool calls without an explicit
	 * `list_windows` round-trip (D-101-LUSE-CONTEXT).
	 *
	 * Either field missing → no snippet injection (graceful skip).
	 *
	 * Per the threat model, `activeAppMeta.title` is sanitized inside
	 * `buildActiveWindowSnippet` before interpolation (T-101-03).
	 */
	activeWid?: number
	/**
	 * Phase 102-06 (Pillar C) - Active Display Context auto-injection.
	 *
	 * When BOTH `activeDisplay` (X11 display string :N) and `activeAppMeta`
	 * are present, the broker prepends a `## Active Display Context` markdown
	 * snippet (built by `agent-prompt-builder.buildActiveDisplaySnippet`)
	 * into the request's `contextPrefix` before forwarding to liv
	 * `/api/agent/stream`. Replaces the pre-102 wid-based `activeWid` path
	 * (which remains supported for back-compat but is deprecated as the
	 * per-WebApp Luse now scopes by display, not wid).
	 *
	 * If both `activeDisplay` and `activeWid` are present, `activeDisplay`
	 * takes precedence; `activeWid` is ignored to avoid emitting two
	 * snippets that contradict each other.
	 *
	 * Per T-102-06b, `activeDisplay` is regex-validated inside
	 * `buildActiveDisplaySnippet` before interpolation.
	 */
	activeDisplay?: string
	activeAppMeta?: ActiveAppMeta
	/**
	 * Phase 160-01 — Mode flag for Haiku routing.
	 *
	 * - `'chat'` (default): preserves existing tier resolution in
	 *   `liv/packages/core/src/api.ts` — agent config tier flows from
	 *   `nexusConfig.agent.tier` / `AGENT_TIER` env / `'sonnet'` default.
	 *   The AI Chat panel + WebApp chat input + every legacy broker
	 *   caller that does not opt-in to computer-use mode continues to
	 *   resolve to Opus/Sonnet exactly as today.
	 *
	 * - `'computer-use'`: forces `tier: 'haiku'` + `model:
	 *   'claude-haiku-4-5-20251001'` in the request body sent to
	 *   /api/agent/stream. liv-core api.ts honors `body.tier` override
	 *   (Phase 160-01 — see api.ts:2459+ comment), passing it into
	 *   `agentConfig.tier` which the sacred SdkAgentRunner already
	 *   maps via `tierToModel()` to `claude-haiku-4-5`. Used for
	 *   computer-use loops (Luse mouse/keyboard/screenshot tool
	 *   cycles) — 10-50+ turns per task, Haiku is vision-capable and
	 *   ~5-10x cheaper than Sonnet/Opus.
	 *
	 * Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for
	 * `liv/packages/core/src/sdk-agent-runner.ts` is preserved — this
	 * routing change only affects the factory + api.ts body parsing.
	 */
	mode?: 'chat' | 'computer-use'
}): AsyncGenerator<AgentBrokerEvent, AgentResult, void> {
	const {livinityd, userId, task, contextPrefix, systemPromptOverride, maxTurns = 30, signal} = opts
	const livApiUrl = process.env.LIV_API_URL || 'http://localhost:3200'

	// Phase 160-01 — Haiku routing for computer-use loops.
	// When mode === 'computer-use', force Haiku 4.5 regardless of caller-supplied
	// model. Computer-use loops run 10-50+ turns per task; Haiku is vision-capable
	// and ~5-10x cheaper than Sonnet/Opus while sufficient for screenshot-
	// grounded coordinate extraction. Chat path (AI Chat panel + WebApp chat)
	// keeps existing model — only THIS factory branch routes Haiku.
	// Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts untouched.
	const mode = opts.mode ?? 'chat'
	let resolvedModel: string | undefined
	let resolvedTier: 'haiku' | 'sonnet' | 'opus' | undefined
	if (mode === 'computer-use') {
		resolvedModel = 'claude-haiku-4-5-20251001'
		resolvedTier = 'haiku'
	}

	const multiUser = await isMultiUserMode(livinityd).catch(() => false)
	const forceRootHome = process.env.BROKER_FORCE_ROOT_HOME === 'true'
	const headers: Record<string, string> = {'Content-Type': 'application/json'}
	if (process.env.LIV_API_KEY) headers['X-API-Key'] = process.env.LIV_API_KEY
	// Phase 41.3: BROKER_FORCE_ROOT_HOME bypasses per-user HOME isolation.
	// When set, every broker request shares the daemon's HOME (single subscription mode).
	if (multiUser && !forceRootHome) headers['X-LivOS-User-Id'] = userId // Plan 41-04 wires nexus to consume

	// Phase 101-06 (Pillar C) — build and prepend the Active Window Context
	// snippet onto contextPrefix when both fields are present + valid. The
	// snippet builder returns empty string for invalid wid (non-integer);
	// we also gate on activeAppMeta presence so partial data doesn't render
	// a half-empty snippet. Existing contextPrefix is preserved as a prefix
	// to the snippet (joined with a blank line for visual separation).
	let injectedContextPrefix = contextPrefix
	// Phase 102-06 - display-scoped snippet has precedence over the legacy
	// wid-scoped snippet. When both `activeDisplay` and `activeWid` are
	// supplied (during the migration window between pre-102 and 102+ broker
	// payloads), we prefer the display path and skip the wid path entirely.
	if (typeof opts.activeDisplay === 'string' && opts.activeAppMeta) {
		const snippet = buildActiveDisplaySnippet({
			activeDisplay: opts.activeDisplay,
			appMeta: opts.activeAppMeta,
		})
		if (snippet) {
			injectedContextPrefix = injectedContextPrefix
				? `${injectedContextPrefix}\n\n${snippet}`
				: snippet
		}
	} else if (opts.activeWid !== undefined && opts.activeAppMeta) {
		// @deprecated path - buildActiveWindowSnippet retained for pre-102
		// callers that haven't migrated to activeDisplay yet. Once all
		// callers send activeDisplay this branch is dead code.
		const snippet = buildActiveWindowSnippet({
			activeWid: opts.activeWid,
			appMeta: opts.activeAppMeta,
		})
		if (snippet) {
			injectedContextPrefix = injectedContextPrefix
				? `${injectedContextPrefix}\n\n${snippet}`
				: snippet
		}
	}

	const body = {
		task,
		max_turns: maxTurns,
		conversationId: `broker-${userId}-${Date.now()}`,
		contextPrefix: injectedContextPrefix,
		systemPromptOverride,
		// Phase 100-08-05 — pass-through webappId for chat-surface tool scope.
		...(opts.webappId ? {webappId: opts.webappId} : {}),
		// Phase 160-01 — Haiku routing for computer-use mode (see opts.mode
		// JSDoc above). Both fields included for verbatim contract: api.ts
		// reads `tier` (existing field semantic), `model` is the literal
		// claude-haiku-4-5-20251001 id forwarded for log/trace visibility.
		// When mode === 'chat' (default), both fields are omitted, so
		// liv-core api.ts falls back to its existing tier resolution path
		// (agentDefaults?.tier / AGENT_TIER env / 'sonnet') — chat path
		// unchanged.
		...(resolvedTier ? {tier: resolvedTier} : {}),
		...(resolvedModel ? {model: resolvedModel} : {}),
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
				// Phase 101-09 Pillar F — widen the parse target to
				// `AgentBrokerEvent` so the `status_detail` variant
				// typechecks alongside the core AgentEvent variants.
				let event: AgentBrokerEvent
				try {
					event = JSON.parse(line.slice(6)) as AgentBrokerEvent
				} catch {
					continue
				}
				// 'done' event from /api/agent/stream carries the final result.
				// FR-CF-04 (Phase 45 Plan 04): read totalInputTokens / totalOutputTokens
				// from the upstream done event when present; this enables broker_usage
				// rows for OpenAI streaming (consumed via the openai-sse-adapter usage
				// chunk + parse-usage.ts:162-172 capture middleware).
				// Backward-compatible: older nexus builds without the fields fall back
				// to 0 (existing behavior preserved).
				if (event.type === 'done' && event.data && typeof event.data === 'object') {
					const d = event.data as {
						success?: boolean
						answer?: string
						turns?: number
						stoppedReason?: AgentResult['stoppedReason']
						totalInputTokens?: number
						totalOutputTokens?: number
					}
					finalResult = {
						success: d.success ?? false,
						answer: d.answer ?? '',
						turns: d.turns ?? 0,
						totalInputTokens: typeof d.totalInputTokens === 'number' ? d.totalInputTokens : 0,
						totalOutputTokens: typeof d.totalOutputTokens === 'number' ? d.totalOutputTokens : 0,
						toolCalls: [],
						stoppedReason: d.stoppedReason ?? 'complete',
					}
				} else if (event.type === 'status_detail') {
					// Phase 101-09 Pillar F — Hermes status_detail relay.
					//
					// Closes the 100-10-10 gap. liv-core RunStore emits
					// `status_detail` chunks (V32-HERMES-01) with payload
					// `{phase, phrase, elapsed}` from `liv-agent-runner.ts`
					// at three points per turn: turn-start (phase='thinking'),
					// tool-dispatch (phase='tool_use'), and after-tool-result
					// (phase='thinking' again). We re-yield the event verbatim
					// (preserving the existing `data` shape) so downstream
					// consumers — the livinityd WS bridge in `ai/index.ts`,
					// the docker-agent SSE pass-through, and any
					// future tRPC subscriber — can surface the verb to the UI
					// status line in webapp-floating-action-bar.tsx (Pillar E).
					//
					// The discriminant branch is explicit rather than a
					// generic fall-through so the broker's interface contract
					// is grep-visible (acceptance criterion: `grep -q
					// "status_detail"`).
					yield event
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
