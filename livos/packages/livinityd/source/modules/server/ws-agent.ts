/**
 * WebSocket /ws/agent endpoint handler.
 *
 * Bridges the browser to the AgentSessionManager, which manages per-user
 * SDK query() sessions. Messages flow:
 *   Browser -> WebSocket -> this handler -> AgentSessionManager -> SDK -> relay back
 *
 * Session keys are per-connection (not per-user) so multiple tabs don't
 * cancel each other's sessions.
 *
 * Conversation history is loaded from Redis and prepended to the prompt
 * so the AI remembers previous messages in the same conversation.
 */

import {randomUUID} from 'node:crypto'
import {stat} from 'node:fs/promises'
import {WebSocket} from 'ws'
import type {IncomingMessage} from 'http'

import {
	AgentSessionManager,
	IntentRouter,
	LearningEngine,
	type AgentWsMessage,
	type ClientWsMessage,
	type TurnData,
	type CapabilityManifest,
} from '@liv/core/lib'

import type Livinityd from '../../index.js'
import type createLogger from '../utilities/logger.js'
import type AiModule from '../ai/index.js'
import type {ChatMessage, Conversation} from '../ai/index.js'
import {buildLuseSystemPromptWithOverlayResolved} from '../ai/agent-prompt-builder.js'

/**
 * Phase 163-02 — Resolve the per-session vault path from a conversationId.
 *
 * Mapping:
 *   `webapp:<id>:<anything>` -> `<baseVaultPath>/surfaces/webapp/<id>`
 *   `native:<id>:<anything>` -> `<baseVaultPath>/surfaces/native/<id>`
 *   anything else            -> `<baseVaultPath>` (Main Chat / no prefix)
 *
 * Phase 161 contract preserved: isComputerUseSession(convId) still returns
 * true for native:/webapp: prefixes — only the CWD differs here. The Haiku
 * tier override at agent-session.ts still fires and the dated Haiku literal
 * (lives in agent-session.ts, NOT here) still wins.
 *
 * Pure string parse — no I/O. Caller decides whether to fs.stat fallback.
 */
export function resolveSessionVaultPath(
	conversationId: string | undefined,
	baseVaultPath: string,
): string {
	if (!conversationId) return baseVaultPath
	const parts = conversationId.split(':')
	if (parts.length < 2) return baseVaultPath
	const [kind, id] = parts
	if (kind !== 'webapp' && kind !== 'native') return baseVaultPath
	if (!id || id.length === 0) return baseVaultPath
	return `${baseVaultPath}/surfaces/${kind}/${id}`
}

/**
 * Phase 163-02 — fs.stat fallback wrapper. If the resolved subsurface dir
 * does NOT exist (e.g. user opened WebApp chat before app install scaffolded
 * its surface), fall back to baseVaultPath so the chat still loads
 * something instead of crashing.
 */
export async function resolveSessionVaultPathWithFallback(
	conversationId: string | undefined,
	baseVaultPath: string,
): Promise<string> {
	const resolved = resolveSessionVaultPath(conversationId, baseVaultPath)
	if (resolved === baseVaultPath) return resolved
	try {
		const s = await stat(resolved)
		if (s.isDirectory()) return resolved
	} catch {
		// ENOENT (or other) — fall back
	}
	return baseVaultPath
}

/**
 * Save a completed turn's messages to Redis conversation storage.
 */
async function saveToConversation(
	turn: TurnData,
	userId: string,
	ai: AiModule,
	logger: ReturnType<typeof createLogger>,
): Promise<void> {
	if (!turn.conversationId) return

	try {
		const conversation = await ai.getOrCreateConversation(
			turn.conversationId,
			turn.userPrompt.slice(0, 60),
			userId,
		)

		const now = Date.now()

		// Strip "Previous conversation:" prefix before saving — store only the actual user message
		let cleanPrompt = turn.userPrompt
		if (cleanPrompt.startsWith('Previous conversation:')) {
			const match = cleanPrompt.match(/\nCurrent message: ([\s\S]*)$/)
			if (match) cleanPrompt = match[1]
		}

		const userMsg: ChatMessage = {
			id: `msg_${now}_user`,
			role: 'user',
			content: cleanPrompt,
			timestamp: now,
		}
		conversation.messages.push(userMsg)

		const assistantMsg: ChatMessage = {
			id: `msg_${now + 1}_assistant`,
			role: 'assistant',
			content: turn.assistantContent,
			toolCalls: turn.toolCalls.length > 0
				? turn.toolCalls.map((tc: TurnData['toolCalls'][number]) => ({
					tool: tc.name,
					params: tc.input,
					result: {
						success: !tc.isError,
						output: tc.output || '',
					},
				}))
				: undefined,
			timestamp: now + 1,
		}
		conversation.messages.push(assistantMsg)

		conversation.updatedAt = now
		await ai.saveConversation(conversation, userId)
	} catch (err: any) {
		logger.error('WS agent: failed to save conversation turn', err)
	}
}

/**
 * Build a context prefix from conversation history so the AI remembers
 * previous messages. Returns empty string if no history.
 */
async function buildConversationContext(
	conversationId: string | undefined,
	userId: string,
	ai: AiModule,
): Promise<string> {
	if (!conversationId) return ''

	try {
		const conversation = await ai.getConversation(conversationId, userId)
		if (!conversation || conversation.messages.length === 0) return ''

		// Take last 6 messages, truncate each to 300 chars to keep prompt manageable
		const recent = conversation.messages.slice(-6)
		const history = recent
			.map((m) => {
				const role = m.role === 'user' ? 'User' : 'Assistant'
				const text = m.content.length > 300 ? m.content.slice(0, 300) + '...' : m.content
				return `${role}: ${text}`
			})
			.join('\n\n')

		return `Previous conversation:\n${history}\n\nCurrent message: `
	} catch {
		return ''
	}
}

export function createAgentWebSocketHandler(opts: {
	livinityd: Livinityd
	logger: ReturnType<typeof createLogger>
	// Phase 162-02 — Pre-resolved vault mode config (computed by the caller
	// from AiModule.chatBackend + AiModule.defaultChatModel — see
	// server/index.ts /ws/agent mount). When undefined, AgentSessionManager
	// preserves Phase 161 behavior byte-identical. When set, sessions use
	// CC's settingSources + cwd loading via vault/CLAUDE.md.
	//
	// Init-once architecture: Redis reads live in AiModule.start(); this
	// factory STAYS synchronous so `wss.on('connection', handler)` keeps
	// working (cannot await a Promise<handler>).
	vaultModeConfig?: {vaultPath: string; defaultModel?: string}
}) {
	const ai = opts.livinityd.ai

	// Lazy ToolRegistry proxy — delegates to ai.toolRegistry when available
	const lazyToolRegistry = new Proxy({} as any, {
		get(_target, prop) {
			const real = ai.toolRegistry
			if (!real) {
				if (prop === 'listFiltered') return () => []
				if (prop === 'list') return () => []
				if (prop === 'listAll') return () => []
				if (prop === 'get') return () => undefined
				if (prop === 'size') return 0
				if (prop === 'execute') return async () => ({success: false, output: '', error: 'Tool registry not yet loaded'})
				return undefined
			}
			const value = (real as any)[prop]
			return typeof value === 'function' ? value.bind(real) : value
		},
	})

	// LearningEngine — logs tool calls and mines co-occurrence patterns
	const learningEngine = new LearningEngine({redis: ai.redis})

	// IntentRouter — fetches capabilities from nexus API, uses livinityd Redis for caching
	// brain is null in livinityd context (LLM fallback skipped — keyword matching only)
	const livApiUrl = process.env.LIV_API_URL || 'http://localhost:3200'
	const apiKey = process.env.LIV_API_KEY || ''

	const intentRouter = new IntentRouter({
		redis: ai.redis,
		getCapabilities: async () => {
			try {
				const res = await fetch(`${livApiUrl}/api/capabilities?status=active`, {
					headers: apiKey ? {'X-Api-Key': apiKey} : {},
					signal: AbortSignal.timeout(5000),
				})
				if (!res.ok) throw new Error(`HTTP ${res.status}`)
				const data = await res.json() as {capabilities: CapabilityManifest[]}
				return data.capabilities
			} catch (err: any) {
				opts.logger.error('IntentRouter: failed to fetch capabilities from nexus', err.message)
				return []
			}
		},
		learningEngine,
		// No brain in livinityd — LLM fallback is skipped, keyword matching only
	})

	// Phase 163-02 — `buildSessionManager` returns an AgentSessionManager scoped to
	// a specific resolved vault path. Used both for the default manager (factory time)
	// and for per-session managers built lazily when a surface-prefixed conversationId
	// resolves to a subsurface vaultPath that differs from the factory's. When
	// opts.vaultModeConfig is undefined (legacy chat_backend=legacy), we DON'T re-thread
	// vault config — preserves Phase 161 verbatim. The Phase 161-02 DI hook
	// (computerUseSystemPromptBuilder) is identical across all manager instances.
	const buildSessionManager = (resolvedVaultPath: string): AgentSessionManager => {
		const vaultModeConfigForSession = opts.vaultModeConfig
			? {vaultPath: resolvedVaultPath, defaultModel: opts.vaultModeConfig.defaultModel}
			: undefined
		return new AgentSessionManager({
			toolRegistry: lazyToolRegistry,
			// IntentRouter disabled — scoped tool selection filters out MCP tools.
			// Re-enable once CapabilityRegistry properly tracks MCP provides_tools
			// and IntentRouter preserves all MCP tools in scoped registry.
			// intentRouter,
			redis: ai.redis,
			learningEngine,
			// Phase 161-02 — DI callback wires Plan 160-02 + 160-04 LivOS overlay
			// composer into the SDK subscription path. The builder is invoked only
			// for computer-use sessions (conversationId starts with `native:` / `webapp:`
			// per Plan 161-01 detection). Hard-coded userSlug/domainRoot match
			// luse-mcp-config.ts:318 defaults; per-session resolution from JWT is
			// deferred to a future plan. Chat path untouched.
			computerUseSystemPromptBuilder: async () => {
				return buildLuseSystemPromptWithOverlayResolved({
					userSlug: 'admin',
					domainRoot: 'livinity.io',
				})
			},
			vaultModeConfig: vaultModeConfigForSession,  // Phase 162-02 — pass-through (or undefined for Phase 161 legacy); Phase 163-02 — per-session resolvedVaultPath
		})
	}

	// Phase 163-02 — Default sessionManager used for Main Chat (no surface prefix).
	// For surface-prefixed convIds, a per-session manager is built lazily with the
	// resolved subsurface vaultPath (see perSessionManagers Map below). When
	// opts.vaultModeConfig is undefined, this is byte-identical Phase 161/162-02.
	const defaultSessionManager = buildSessionManager(
		opts.vaultModeConfig?.vaultPath ?? '/home/bruce/livinity-vault',
	)

	return (ws: WebSocket, request: IncomingMessage) => {
		const logger = opts.logger

		// Each WebSocket connection gets a unique session key so multiple tabs
		// don't cancel each other's sessions.
		const connectionId = randomUUID().slice(0, 8)

		// Extract userId from JWT
		const url = new URL(request.url || '/', 'http://localhost')
		const token = url.searchParams.get('token')
		let userId = 'admin'

		if (token) {
			try {
				const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
				if (payload.userId) userId = payload.userId
			} catch {
				/* legacy token format */
			}
		}

		// Phase 162-04 — Surface-aware composite sessionKey.
		// Reads surfaceKind + surfaceId from WS URL params (`?surface=main|webapp|native|autonomous&surfaceId=<id>`)
		// emitted by the UI hook, OR from the WS `start` envelope body (`raw.surface`,
		// `raw.surfaceId`). Defaults to 'main' / 'default' for legacy chat that
		// doesn't emit a surface hint (most current callers).
		//
		// Backward-compat (D-V34-?): when chat_backend === 'legacy' (vaultModeConfig
		// undefined), the sessionKey drops surfaceKind + surfaceId so AgentSessionManager
		// keys exactly like Phase 161 (and pre-161). Per-tab isolation via connectionId
		// is preserved in BOTH modes — Phase 161's contract that "multiple tabs don't
		// cancel each other's sessions" still holds.
		//
		// Composite key shape lets the same userId run parallel sessions for
		// Main Chat (`admin:54c6caa5:main:default:conn01`) + WebApp Chat
		// (`admin:54c6caa5:webapp:suna-uuid:conn02`) + Autonomous
		// (`admin:54c6caa5:autonomous:nightly-backup:conn03`) without one
		// canceling the other.
		const surfaceKindFromUrl = url.searchParams.get('surface') ?? undefined
		const surfaceIdFromUrl = url.searchParams.get('surfaceId') ?? undefined

		const buildSessionKey = (surfaceKind?: string, surfaceId?: string): string => {
			if (opts.vaultModeConfig === undefined) {
				// Legacy — Phase 161 byte-identical
				return `${userId}:${connectionId}`
			}
			const sk = surfaceKind ?? 'main'
			const sid = surfaceId ?? 'default'
			return `${userId}:${sk}:${sid}:${connectionId}`
		}

		let sessionKey = buildSessionKey(surfaceKindFromUrl, surfaceIdFromUrl)

		// Phase 163-02 — Per-sessionKey AgentSessionManager cache. When the start
		// envelope's conversationId resolves to a surface-specific vaultPath
		// (different from the factory's vault root), a per-key manager is built
		// lazily and stored here for the lifetime of that sessionKey (across
		// multi-turn). Cleanup happens on ws close. Cleared at the same point
		// as the default manager's cleanup() call.
		const perSessionManagers = new Map<string, AgentSessionManager>()
		const managerFor = (key: string): AgentSessionManager =>
			perSessionManagers.get(key) ?? defaultSessionManager

		logger.log(`WS agent: connected, userId=${userId}, conn=${connectionId}`)

		// 15-second heartbeat
		const heartbeat = setInterval(() => {
			if (ws.readyState === WebSocket.OPEN) ws.ping()
		}, 15_000)

		const sendMessage = (msg: AgentWsMessage) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify(msg))
			}
		}

		// Handle incoming messages
		ws.on('message', async (data) => {
			try {
				const raw = JSON.parse(data.toString()) as ClientWsMessage

				// Phase 162-04 — If the start envelope carries a surface hint AND the
				// URL didn't already provide one, recompute sessionKey from the body.
				// This keeps the UI hooks free to emit surface info either way.
				if (
					raw.type === 'start' &&
					(raw as any).surface &&
					!surfaceKindFromUrl
				) {
					sessionKey = buildSessionKey((raw as any).surface, (raw as any).surfaceId)
				}

				// Phase 163-02 — Per-session vault path resolution. Only kicks in when
				// vault mode is active (opts.vaultModeConfig != null) AND the convId has
				// a surface prefix (`webapp:<id>:...` / `native:<id>:...`). fs.stat
				// fallback handles the not-yet-scaffolded case (chat opened before
				// Plan 163-01 install hook has materialized the surface dir).
				if (
					raw.type === 'start' &&
					opts.vaultModeConfig &&
					raw.conversationId
				) {
					const resolvedPath = await resolveSessionVaultPathWithFallback(
						raw.conversationId,
						opts.vaultModeConfig.vaultPath,
					)
					if (resolvedPath !== opts.vaultModeConfig.vaultPath) {
						// Build a per-sessionKey manager pinned to the subsurface vault path.
						// Reuse if already built for this sessionKey (same key across multi-turn).
						if (!perSessionManagers.has(sessionKey)) {
							perSessionManagers.set(sessionKey, buildSessionManager(resolvedPath))
							logger.log(`WS agent: surface vault path resolved sessionKey=${sessionKey} -> ${resolvedPath}`)
						}
					}
				}

				// For 'start' messages: prepend conversation history to prompt
				if (raw.type === 'start' && raw.conversationId) {
					const context = await buildConversationContext(raw.conversationId, userId, ai)
					if (context) {
						raw.prompt = context + raw.prompt
					}
				}

				// Pass attachments through to session manager
				if (raw.type === 'start' && raw.attachments) {
					;(raw as any)._attachments = raw.attachments
				}

				logger.verbose(`WS agent: received ${raw.type} from ${sessionKey}`)

				// V32-HERMES-04: 'steer' is fire-and-forget — inject guidance into the
				// active LivAgentRunner for this connection and send no reply.
				// All other message types are delegated to handleMessage on the
				// per-session manager (Phase 163-02: managerFor(sessionKey) picks the
				// surface-scoped manager when present, else falls back to the default).
				if (raw.type === 'steer') {
					managerFor(sessionKey).injectSteer(sessionKey, raw.guidance)
					return
				}

				await managerFor(sessionKey).handleMessage(sessionKey, raw, sendMessage, {
					onTurnComplete: (turn: TurnData) => saveToConversation(turn, userId, ai, logger),
				})
			} catch (err: any) {
				logger.error('WS agent: message handling error', err)
				sendMessage({type: 'error', message: err.message || 'Unknown error'})
			}
		})

		// Cleanup on close — kill this connection's session
		ws.on('close', () => {
			logger.log(`WS agent: disconnected, ${sessionKey}`)
			clearInterval(heartbeat)
			managerFor(sessionKey).cleanup(sessionKey)
			perSessionManagers.delete(sessionKey)
		})

		ws.on('error', (err) => {
			logger.error('WS agent: WebSocket error', err)
			clearInterval(heartbeat)
		})
	}
}
