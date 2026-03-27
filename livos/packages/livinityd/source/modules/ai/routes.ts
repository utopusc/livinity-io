import {z} from 'zod'
import {observable} from '@trpc/server/observable'
import {TRPCError} from '@trpc/server'

import {privateProcedure, router} from '../server/trpc/trpc.js'
import {getUserPreference, setUserPreference} from '../database/index.js'

/** Mask an API key: show first 4 and last 4 chars */
function maskKey(key: string): string {
	if (!key || key.length < 12) return key ? '****' : ''
	return key.slice(0, 4) + '****' + key.slice(-4)
}

/** Extract error message with proper type narrowing */
function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

/** Nexus config schema for validation */
const NexusConfigSchema = z.object({
	retry: z.object({
		enabled: z.boolean().optional(),
		attempts: z.number().int().min(1).max(10).optional(),
		minDelayMs: z.number().int().min(100).max(10000).optional(),
		maxDelayMs: z.number().int().min(1000).max(60000).optional(),
		jitter: z.number().min(0).max(1).optional(),
	}).optional(),
	agent: z.object({
		maxTurns: z.number().int().min(1).max(100).optional(),
		maxTokens: z.number().int().min(1000).max(1000000).optional(),
		timeoutMs: z.number().int().min(10000).max(3600000).optional(),
		tier: z.enum(['flash', 'sonnet', 'opus']).optional(),
		maxDepth: z.number().int().min(1).max(10).optional(),
		streamEnabled: z.boolean().optional(),
	}).optional(),
	subagents: z.object({
		maxConcurrent: z.number().int().min(1).max(20).optional(),
		maxTurns: z.number().int().min(1).max(20).optional(),
		maxTokens: z.number().int().min(1000).max(500000).optional(),
		timeoutMs: z.number().int().min(5000).max(1800000).optional(),
	}).optional(),
	session: z.object({
		idleMinutes: z.number().int().min(5).max(1440).optional(),
		maxHistoryMessages: z.number().int().min(10).max(500).optional(),
	}).optional(),
	logging: z.object({
		level: z.enum(['silent', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
		redactSensitive: z.boolean().optional(),
	}).optional(),
	heartbeat: z.object({
		enabled: z.boolean().optional(),
		intervalMinutes: z.number().int().min(5).max(1440).optional(),
		target: z.enum(['telegram', 'discord', 'all', 'none']).optional(),
	}).optional(),
	response: z.object({
		style: z.enum(['detailed', 'concise', 'direct']).optional(),
		showSteps: z.boolean().optional(),
		showReasoning: z.boolean().optional(),
		language: z.string().optional(),
		maxLength: z.number().int().min(100).max(10000).optional(),
	}).optional(),
	approval: z.object({
		policy: z.enum(['always', 'destructive', 'never']).optional(),
		timeoutMs: z.number().int().min(10000).max(3600000).optional(),
	}).optional(),
})

/** Get Nexus API URL from env */
function getNexusApiUrl(): string {
	return process.env.NEXUS_API_URL || process.env.LIV_API_URL || 'http://localhost:3200'
}

export default router({
	// ── AI Config ─────────────────────────────────────────

	/** Get current AI configuration */
	getConfig: privateProcedure.query(async () => {
		return {}
	}),

	/** Validate an API key by making a lightweight test call */
	validateKey: privateProcedure
		.input(
			z.object({
				provider: z.enum(['kimi']),
				apiKey: z.string().min(1).max(256),
			}),
		)
		.mutation(async ({ctx, input}): Promise<{valid: boolean; error?: string}> => {
			try {
				// Validate by listing models -- lightweight API call
				const response = await fetch('https://api.kimi.com/coding/v1/models', {
					headers: {
						'Authorization': `Bearer ${input.apiKey}`,
					},
				})
				if (response.status === 401) {
					return {valid: false, error: 'Invalid API key'}
				}
				if (response.status === 403) {
					return {valid: false, error: 'API key does not have permission'}
				}
				if (response.ok || response.status === 429) {
					return {valid: true}
				}
				const data = (await response.json().catch(() => ({}))) as {error?: {message?: string}}
				return {valid: false, error: data.error?.message || `Unexpected status: ${response.status}`}
			} catch (error) {
				ctx.livinityd.logger.error('Kimi API key validation failed', error)
				return {valid: false, error: getErrorMessage(error)}
			}
		}),

	// ── Kimi Auth ────────────────────────────────────────────

	/** Check Kimi CLI auth status (proxies to Nexus /api/kimi/status) */
	getKimiStatus: privateProcedure.query(async ({ctx}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/kimi/status`, {
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				throw new Error(`Nexus API error: ${response.status}`)
			}
			return (await response.json()) as {
				authenticated: boolean
				provider: string
			}
		} catch (error) {
			ctx.livinityd.logger.error('Failed to get Kimi status', error)
			return {authenticated: false, provider: 'kimi'}
		}
	}),

	/** Start Kimi CLI login — returns auth URL and session ID for polling */
	kimiLogin: privateProcedure
		.mutation(async ({ctx}) => {
			try {
				const nexusUrl = getNexusApiUrl()
				const response = await fetch(`${nexusUrl}/api/kimi/login`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
					},
				})
				if (!response.ok) {
					const errorData = (await response.json().catch(() => ({}))) as {error?: string}
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: errorData.error || `Nexus API error: ${response.status}`,
					})
				}
				return (await response.json()) as {
					sessionId: string
					verificationUrl: string
					userCode: string
				}
			} catch (error) {
				if (error instanceof TRPCError) throw error
				ctx.livinityd.logger.error('Failed to start Kimi login', error)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: getErrorMessage(error) || 'Failed to start Kimi login',
				})
			}
		}),

	/** Poll Kimi login session status */
	kimiLoginPoll: privateProcedure
		.input(z.object({sessionId: z.string()}))
		.query(async ({ctx, input}) => {
			try {
				const nexusUrl = getNexusApiUrl()
				const response = await fetch(`${nexusUrl}/api/kimi/login/poll/${input.sessionId}`, {
					headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
				})
				if (!response.ok) {
					if (response.status === 404) {
						return {status: 'expired' as const}
					}
					throw new Error(`Nexus API error: ${response.status}`)
				}
				return (await response.json()) as {
					status: 'starting' | 'waiting' | 'success' | 'error'
					verificationUrl?: string
					userCode?: string
					error?: string
				}
			} catch (error) {
				ctx.livinityd.logger.error('Failed to poll Kimi login', error)
				return {status: 'error' as const, error: getErrorMessage(error)}
			}
		}),

	/** Logout from Kimi CLI (proxies to Nexus /api/kimi/logout) */
	kimiLogout: privateProcedure.mutation(async ({ctx}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/kimi/logout`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
				},
			})
			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as {error?: string}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: errorData.error || `Nexus API error: ${response.status}`,
				})
			}
			return (await response.json()) as {success: boolean}
		} catch (error) {
			if (error instanceof TRPCError) throw error
			ctx.livinityd.logger.error('Failed to logout from Kimi', error)
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: getErrorMessage(error) || 'Failed to logout from Kimi',
			})
		}
	}),

	// ── Claude Auth ──────────────────────────────────────────

	/** Check Claude auth status (proxies to Nexus /api/claude/status) */
	getClaudeStatus: privateProcedure.query(async ({ctx}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/claude/status`, {
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				throw new Error(`Nexus API error: ${response.status}`)
			}
			return (await response.json()) as {
				authenticated: boolean
				method?: string
				provider: string
			}
		} catch (error) {
			ctx.livinityd.logger.error('Failed to get Claude status', error)
			return {authenticated: false, provider: 'claude'}
		}
	}),

	/** Set Claude API key (proxies to Nexus /api/claude/set-api-key) */
	setClaudeApiKey: privateProcedure
		.input(z.object({apiKey: z.string().min(1)}))
		.mutation(async ({ctx, input}) => {
			try {
				const nexusUrl = getNexusApiUrl()
				const response = await fetch(`${nexusUrl}/api/claude/set-api-key`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
					},
					body: JSON.stringify({apiKey: input.apiKey}),
				})
				if (!response.ok) {
					const errorData = (await response.json().catch(() => ({}))) as {error?: string}
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: errorData.error || `Nexus API error: ${response.status}`,
					})
				}
				return {success: true}
			} catch (error) {
				if (error instanceof TRPCError) throw error
				ctx.livinityd.logger.error('Failed to set Claude API key', error)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: getErrorMessage(error) || 'Failed to set Claude API key',
				})
			}
		}),

	/** Start Claude OAuth PKCE login (proxies to Nexus /api/claude/start-login) */
	claudeStartLogin: privateProcedure.mutation(async ({ctx}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/claude/start-login`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
				},
			})
			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as {error?: string}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: errorData.error || `Nexus API error: ${response.status}`,
				})
			}
			return (await response.json()) as Record<string, unknown>
		} catch (error) {
			if (error instanceof TRPCError) throw error
			ctx.livinityd.logger.error('Failed to start Claude login', error)
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: getErrorMessage(error) || 'Failed to start Claude login',
			})
		}
	}),

	/** Submit OAuth code for Claude login (proxies to Nexus /api/claude/submit-code) */
	claudeSubmitCode: privateProcedure
		.input(z.object({code: z.string().min(1)}))
		.mutation(async ({ctx, input}) => {
			try {
				const nexusUrl = getNexusApiUrl()
				const response = await fetch(`${nexusUrl}/api/claude/submit-code`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
					},
					body: JSON.stringify({code: input.code}),
				})
				if (!response.ok) {
					const errorData = (await response.json().catch(() => ({}))) as {error?: string}
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: errorData.error || `Nexus API error: ${response.status}`,
					})
				}
				return {success: true}
			} catch (error) {
				if (error instanceof TRPCError) throw error
				ctx.livinityd.logger.error('Failed to submit Claude code', error)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: getErrorMessage(error) || 'Failed to submit Claude login code',
				})
			}
		}),

	/** Logout from Claude (proxies to Nexus /api/claude/logout) */
	claudeLogout: privateProcedure.mutation(async ({ctx}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/claude/logout`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
				},
			})
			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as {error?: string}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: errorData.error || `Nexus API error: ${response.status}`,
				})
			}
			return (await response.json()) as {success: boolean}
		} catch (error) {
			if (error instanceof TRPCError) throw error
			ctx.livinityd.logger.error('Failed to logout from Claude', error)
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: getErrorMessage(error) || 'Failed to logout from Claude',
			})
		}
	}),

	// ── Provider Management ──────────────────────────────────

	/** Get all providers with availability (proxies to Nexus /api/providers) */
	getProviders: privateProcedure.query(async ({ctx}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/providers`, {
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				throw new Error(`Nexus API error: ${response.status}`)
			}
			return (await response.json()) as {
				providers: Array<{name: string; available: boolean}>
				primaryProvider: string
				fallbackOrder: string[]
			}
		} catch (error) {
			ctx.livinityd.logger.error('Failed to get providers', error)
			return {providers: [], primaryProvider: 'kimi', fallbackOrder: ['kimi']}
		}
	}),

	/** Set primary AI provider (proxies to Nexus PUT /api/provider/primary) */
	setPrimaryProvider: privateProcedure
		.input(z.object({provider: z.enum(['claude', 'kimi'])}))
		.mutation(async ({ctx, input}) => {
			try {
				const nexusUrl = getNexusApiUrl()
				const response = await fetch(`${nexusUrl}/api/provider/primary`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
					},
					body: JSON.stringify({provider: input.provider}),
				})
				if (!response.ok) {
					const errorData = (await response.json().catch(() => ({}))) as {error?: string}
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: errorData.error || `Nexus API error: ${response.status}`,
					})
				}
				return (await response.json()) as {
					success: boolean
					primaryProvider: string
					fallbackOrder: string[]
				}
			} catch (error) {
				if (error instanceof TRPCError) throw error
				ctx.livinityd.logger.error('Failed to set primary provider', error)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: getErrorMessage(error) || 'Failed to set primary provider',
				})
			}
		}),

	// ── Nexus Config ─────────────────────────────────────────

	/** Get Nexus AI configuration from backend */
	getNexusConfig: privateProcedure.query(async ({ctx}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/nexus/config`, {
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				throw new Error(`Nexus API error: ${response.status}`)
			}
			const data = (await response.json()) as {config?: Record<string, unknown>}
			return {config: data.config || {}}
		} catch (error) {
			ctx.livinityd.logger.error('Failed to fetch Nexus config', error)
			// Return empty config on error so UI doesn't break
			return {config: {}}
		}
	}),

	/** Update Nexus AI configuration */
	updateNexusConfig: privateProcedure
		.input(NexusConfigSchema)
		.mutation(async ({ctx, input}) => {
			try {
				const nexusUrl = getNexusApiUrl()
				const response = await fetch(`${nexusUrl}/api/nexus/config`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
					},
					body: JSON.stringify(input),
				})
				if (!response.ok) {
					const errorData = (await response.json().catch(() => ({}))) as {error?: string}
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: errorData.error || `Nexus API error: ${response.status}`,
					})
				}
				const data = (await response.json()) as {success?: boolean; errors?: string[]}
				ctx.livinityd.logger.log('Nexus config updated via Settings UI')
				return {success: data.success, errors: data.errors}
			} catch (error) {
				if (error instanceof TRPCError) throw error
				ctx.livinityd.logger.error('Failed to update Nexus config', error)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: getErrorMessage(error) || 'Failed to update Nexus config',
				})
			}
		}),

	/** Reset Nexus AI configuration to defaults */
	resetNexusConfig: privateProcedure.mutation(async ({ctx}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/nexus/config/reset`, {
				method: 'POST',
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				throw new Error(`Nexus API error: ${response.status}`)
			}
			ctx.livinityd.logger.log('Nexus config reset via Settings UI')
			return {success: true}
		} catch (error) {
			ctx.livinityd.logger.error('Failed to reset Nexus config', error)
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: getErrorMessage(error) || 'Failed to reset Nexus config',
			})
		}
	}),

	// ── Chat ──────────────────────────────────────────────


	/** Get live chat status (for polling during AI processing) */
	getChatStatus: privateProcedure.input(z.object({conversationId: z.string()})).query(({ctx, input}) => {
		const status = ctx.livinityd.ai.chatStatus.get(input.conversationId)
		return status || null
	}),

	/** Pause an active computer use session */
	pauseComputerUse: privateProcedure.input(z.object({conversationId: z.string()})).mutation(({ctx, input}) => {
		const status = ctx.livinityd.ai.chatStatus.get(input.conversationId)
		if (!status || !status.computerUse) {
			throw new TRPCError({code: 'NOT_FOUND', message: 'No active computer use session'})
		}
		ctx.livinityd.ai.chatStatus.set(input.conversationId, {...status, paused: true})
		return {ok: true}
	}),

	/** Resume a paused computer use session */
	resumeComputerUse: privateProcedure.input(z.object({conversationId: z.string()})).mutation(({ctx, input}) => {
		const status = ctx.livinityd.ai.chatStatus.get(input.conversationId)
		if (!status || !status.computerUse) {
			throw new TRPCError({code: 'NOT_FOUND', message: 'No active computer use session'})
		}
		ctx.livinityd.ai.chatStatus.set(input.conversationId, {...status, paused: false})
		return {ok: true}
	}),

	/** Stop an active computer use session (aborts SSE stream and clears session state) */
	stopComputerUse: privateProcedure.input(z.object({conversationId: z.string()})).mutation(({ctx, input}) => {
		const status = ctx.livinityd.ai.chatStatus.get(input.conversationId)
		if (!status) {
			throw new TRPCError({code: 'NOT_FOUND', message: 'No active session'})
		}
		// Abort the active SSE stream to nexus — this kills the agent loop
		const controller = ctx.livinityd.ai.activeStreams.get(input.conversationId)
		if (controller) {
			controller.abort()
		}
		ctx.livinityd.ai.chatStatus.delete(input.conversationId)
		return {ok: true}
	}),

	/** Grant consent for computer use on an active session (SEC-01) */
	grantConsent: privateProcedure.input(z.object({conversationId: z.string()})).mutation(({ctx, input}) => {
		const status = ctx.livinityd.ai.chatStatus.get(input.conversationId)
		if (!status) {
			throw new TRPCError({code: 'NOT_FOUND', message: 'No active session'})
		}
		ctx.livinityd.ai.chatStatus.set(input.conversationId, {...status, computerUseConsent: true})
		return {ok: true}
	}),

	/** Deny consent for computer use (aborts the session) (SEC-01) */
	denyConsent: privateProcedure.input(z.object({conversationId: z.string()})).mutation(({ctx, input}) => {
		const controller = ctx.livinityd.ai.activeStreams.get(input.conversationId)
		if (controller) controller.abort()
		ctx.livinityd.ai.chatStatus.delete(input.conversationId)
		return {ok: true}
	}),

	/** Get pending tool approvals */
	getPendingApprovals: privateProcedure.query(async () => {
		const apiUrl = getNexusApiUrl()
		const resp = await fetch(`${apiUrl}/api/approvals`, {
			headers: {'X-Api-Key': process.env.LIV_API_KEY || ''},
		})
		if (!resp.ok) return []
		const data = await resp.json() as {approvals?: Array<{id: string; tool: string; params: Record<string, unknown>; thought: string; createdAt: number; expiresAt: number}>}
		return data.approvals || []
	}),

	/** Resolve a pending tool approval from the chat UI */
	resolveApproval: privateProcedure.input(z.object({
		requestId: z.string(),
		decision: z.enum(['approve', 'deny']),
	})).mutation(async ({input}) => {
		const apiUrl = getNexusApiUrl()
		const resp = await fetch(`${apiUrl}/api/approvals/${input.requestId}/resolve`, {
			method: 'POST',
			headers: {'Content-Type': 'application/json', 'X-Api-Key': process.env.LIV_API_KEY || ''},
			body: JSON.stringify({decision: input.decision}),
		})
		if (!resp.ok) throw new Error(`Approval resolve failed: ${resp.status}`)
		return {ok: true}
	}),

	/** Send a message and get the AI response */
	send: privateProcedure
		.input(
			z.object({
				conversationId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
				message: z.string().min(1).max(50000),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const ai = ctx.livinityd.ai
			const userId = ctx.currentUser?.id
			const result = await ai.chat(input.conversationId, input.message, undefined, userId)
			return result
		}),

	/** Stream a chat response as it happens (SSE subscription) */
	stream: privateProcedure
		.input(
			z.object({
				conversationId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
				message: z.string().min(1).max(50000),
			}),
		)
		.subscription(({ctx, input}) => {
			return observable<{type: string; data: unknown}>((emit) => {
				const ai = ctx.livinityd.ai
				const userId = ctx.currentUser?.id

				ai.chat(input.conversationId, input.message, (event) => {
					emit.next({type: event.type, data: event.data})
				}, userId)
					.then((result) => {
						emit.next({type: 'final_answer', data: result})
						emit.next({type: 'done', data: null})
						emit.complete()
					})
					.catch((error) => {
						emit.next({type: 'error', data: {message: getErrorMessage(error)}})
						emit.complete()
					})
			})
		}),

	/** Get a single conversation */
	getConversation: privateProcedure.input(z.object({id: z.string()})).query(async ({ctx, input}) => {
		const userId = ctx.currentUser?.id
		const conversation = ctx.livinityd.ai.getConversation(input.id, userId)
		if (!conversation) throw new TRPCError({code: 'NOT_FOUND', message: 'Conversation not found'})
		return conversation
	}),

	/** List all conversations */
	listConversations: privateProcedure.query(async ({ctx}) => {
		const userId = ctx.currentUser?.id
		return ctx.livinityd.ai.listConversations(userId)
	}),

	/** Delete a conversation */
	deleteConversation: privateProcedure.input(z.object({id: z.string()})).mutation(async ({ctx, input}) => {
		const userId = ctx.currentUser?.id
		return ctx.livinityd.ai.deleteConversation(input.id, userId)
	}),

	/** Get conversation messages in UI ChatMessage format */
	getConversationMessages: privateProcedure
		.input(z.object({id: z.string()}))
		.query(async ({ctx, input}) => {
			const userId = ctx.currentUser?.id
			const conversation = await ctx.livinityd!.ai.getConversation(input.id, userId)
			if (!conversation) return {messages: []}
			// Transform backend ChatMessage to UI ChatMessage format
			const messages = conversation.messages.map((msg) => ({
				id: msg.id,
				role: msg.role as 'user' | 'assistant',
				content: msg.content,
				toolCalls: msg.toolCalls?.map((tc, i) => ({
					id: `${msg.id}_tool_${i}`,
					name: tc.tool,
					input: tc.params,
					status: (tc.result.success ? 'complete' : 'error') as 'complete' | 'error',
					output: tc.result.output,
					...(tc.result.success ? {} : {errorMessage: tc.result.output}),
				})),
				isStreaming: false,
				timestamp: msg.timestamp,
			}))
			return {messages, title: conversation.title}
		}),

	/** Update a conversation title */
	updateConversationTitle: privateProcedure
		.input(z.object({id: z.string(), title: z.string().min(1).max(200)}))
		.mutation(async ({ctx, input}) => {
			const userId = ctx.currentUser?.id
			const conversation = await ctx.livinityd!.ai.getConversation(input.id, userId)
			if (!conversation) throw new TRPCError({code: 'NOT_FOUND', message: 'Conversation not found'})
			conversation.title = input.title
			conversation.updatedAt = Date.now()
			await ctx.livinityd!.ai.saveConversation(conversation, userId)
			return {success: true}
		}),

	// ── Tools ──────────────────────────────────────────────

	/** List all registered AI tools */
	listTools: privateProcedure.query(({ctx}) => {
		const registry = ctx.livinityd.ai.toolRegistry
		return registry.list().map((name: string) => {
			const tool = registry.get(name)
			if (!tool) return {name, description: '', parameters: []}
			return {
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters,
			}
		})
	}),

	// ── Subagents (via Nexus API) ──────────────────────────────────────────

	/** List all subagents */
	listSubagents: privateProcedure.query(async ({ctx}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/subagents`, {
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				throw new Error(`Nexus API error: ${response.status}`)
			}
			return await response.json()
		} catch (error) {
			ctx.livinityd.logger.error('Failed to list subagents', error)
			return []
		}
	}),

	/** Create a new subagent */
	createSubagent: privateProcedure
		.input(
			z.object({
				id: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
				name: z.string().min(1).max(100),
				description: z.string().max(500),
				skills: z.array(z.string()).default(['*']),
				systemPrompt: z.string().max(10000).optional(),
				schedule: z.string().optional(),
				scheduledTask: z.string().max(5000).optional(),
				tier: z.enum(['flash', 'sonnet', 'opus']).default('sonnet'),
				maxTurns: z.number().default(10),
			}),
		)
		.mutation(async ({ctx, input}) => {
			try {
				const nexusUrl = getNexusApiUrl()
				const response = await fetch(`${nexusUrl}/api/subagents`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
					},
					body: JSON.stringify({
						...input,
						status: 'active',
						createdBy: 'ui',
					}),
				})
				if (!response.ok) {
					const errorData = (await response.json().catch(() => ({}))) as {error?: string}
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: errorData.error || `Nexus API error: ${response.status}`,
					})
				}
				return await response.json()
			} catch (error) {
				if (error instanceof TRPCError) throw error
				ctx.livinityd.logger.error('Failed to create subagent', error)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: getErrorMessage(error) || 'Failed to create subagent',
				})
			}
		}),

	/** Update a subagent */
	updateSubagent: privateProcedure
		.input(
			z.object({
				id: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
				updates: z.object({
					name: z.string().max(100).optional(),
					description: z.string().max(500).optional(),
					skills: z.array(z.string()).max(50).optional(),
					systemPrompt: z.string().max(10000).optional(),
					schedule: z.string().max(100).optional(),
					scheduledTask: z.string().max(5000).optional(),
					tier: z.enum(['flash', 'sonnet', 'opus']).optional(),
					maxTurns: z.number().min(1).max(50).optional(),
					status: z.enum(['active', 'paused', 'stopped']).optional(),
				}).strict(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			try {
				const nexusUrl = getNexusApiUrl()
				const response = await fetch(`${nexusUrl}/api/subagents/${input.id}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
					},
					body: JSON.stringify(input.updates),
				})
				if (!response.ok) {
					const errorData = (await response.json().catch(() => ({}))) as {error?: string}
					throw new TRPCError({
						code: response.status === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
						message: errorData.error || `Nexus API error: ${response.status}`,
					})
				}
				return await response.json()
			} catch (error) {
				if (error instanceof TRPCError) throw error
				ctx.livinityd.logger.error('Failed to update subagent', error)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: getErrorMessage(error) || 'Failed to update subagent',
				})
			}
		}),

	/** Delete a subagent */
	deleteSubagent: privateProcedure.input(z.object({id: z.string()})).mutation(async ({ctx, input}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/subagents/${input.id}`, {
				method: 'DELETE',
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as {error?: string}
				throw new TRPCError({
					code: response.status === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
					message: errorData.error || `Nexus API error: ${response.status}`,
				})
			}
			return await response.json()
		} catch (error) {
			if (error instanceof TRPCError) throw error
			ctx.livinityd.logger.error('Failed to delete subagent', error)
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: getErrorMessage(error) || 'Failed to delete subagent',
			})
		}
	}),

	/** Execute a subagent with a message */
	executeSubagent: privateProcedure
		.input(
			z.object({
				id: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
				message: z.string().min(1).max(50000),
			}),
		)
		.mutation(async ({ctx, input}) => {
			// Get subagent from Nexus
			try {
				const nexusUrl = getNexusApiUrl()
				const response = await fetch(`${nexusUrl}/api/subagents/${input.id}`, {
					headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
				})
				if (!response.ok) {
					throw new TRPCError({code: 'NOT_FOUND', message: 'Subagent not found'})
				}
				const subagent = await response.json()
				const prompt = subagent.systemPrompt
					? `[Acting as subagent "${subagent.name}": ${subagent.systemPrompt}]\n\n${input.message}`
					: input.message
				const result = await ctx.livinityd.ai.chat(`subagent-${input.id}-${Date.now()}`, prompt)
				return {content: result.content}
			} catch (error) {
				if (error instanceof TRPCError) throw error
				ctx.livinityd.logger.error('Failed to execute subagent', error)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: getErrorMessage(error) || 'Failed to execute subagent',
				})
			}
		}),

	// ── Schedules / Cron (via Nexus API) ──────────────────────────────────

	/** List all scheduled jobs */
	listSchedules: privateProcedure.query(async ({ctx}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/schedules`, {
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				throw new Error(`Nexus API error: ${response.status}`)
			}
			return await response.json()
		} catch (error) {
			ctx.livinityd.logger.error('Failed to list schedules', error)
			return []
		}
	}),

	/** Add or update a schedule */
	addSchedule: privateProcedure
		.input(
			z.object({
				subagentId: z.string(),
				task: z.string().min(1).max(5000),
				cron: z.string().min(9).max(100).regex(/^[0-9*,\/-\s]+$/),
				timezone: z.string().optional(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			try {
				const nexusUrl = getNexusApiUrl()
				const response = await fetch(`${nexusUrl}/api/schedules`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
					},
					body: JSON.stringify(input),
				})
				if (!response.ok) {
					const errorData = (await response.json().catch(() => ({}))) as {error?: string}
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: errorData.error || `Nexus API error: ${response.status}`,
					})
				}
				return await response.json()
			} catch (error) {
				if (error instanceof TRPCError) throw error
				ctx.livinityd.logger.error('Failed to add schedule', error)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: getErrorMessage(error) || 'Failed to add schedule',
				})
			}
		}),

	/** Remove a schedule */
	removeSchedule: privateProcedure.input(z.object({subagentId: z.string()})).mutation(async ({ctx, input}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/schedules/${input.subagentId}`, {
				method: 'DELETE',
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as {error?: string}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: errorData.error || `Nexus API error: ${response.status}`,
				})
			}
			return await response.json()
		} catch (error) {
			if (error instanceof TRPCError) throw error
			ctx.livinityd.logger.error('Failed to remove schedule', error)
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: getErrorMessage(error) || 'Failed to remove schedule',
			})
		}
	}),

	// ── Messaging Integrations ─────────────────────────────────

	/** Get all channel statuses (for Integrations dialog) */
	getChannels: privateProcedure.query(async ({ctx}) => {
		try {
			const redis = ctx.livinityd!.ai.redis

			// Get channels from Redis (only Telegram and Discord)
			const channelTypes = ['telegram', 'discord'] as const
			const channels = await Promise.all(
				channelTypes.map(async (type) => {
					// Per-user: read from PostgreSQL
					let config: any = null
					if (ctx.currentUser) {
						config = await getUserPreference(ctx.currentUser.id, `integration:${type}`)
					}
					if (!config) {
						const configStr = await redis.get(`nexus:${type}:config`)
						config = configStr ? JSON.parse(configStr) : null
					}

					const statusStr = await redis.get(`nexus:${type}:status`)
					const status = statusStr ? JSON.parse(statusStr) : null
					return {
						id: type,
						type,
						enabled: config?.enabled ?? false,
						connected: status?.connected ?? false,
						config: config ? {...config, botToken: config.botToken ? '****' : undefined} : undefined,
						error: status?.error,
					}
				}),
			)

			return {channels}
		} catch (error) {
			ctx.livinityd!.logger.error('Failed to get channels', error)
			return {channels: []}
		}
	}),

	/** Update channel config (for Integrations dialog) — per-user */
	updateChannel: privateProcedure
		.input(
			z.object({
				type: z.enum(['telegram', 'discord']),
				config: z.record(z.any()),
			}),
		)
		.mutation(async ({ctx, input}) => {
			try {
				const redis = ctx.livinityd!.ai.redis

				// Per-user: store in PostgreSQL
				if (ctx.currentUser) {
					const existing = (await getUserPreference(ctx.currentUser.id, `integration:${input.type}`)) || {}
					const newConfig = {...existing, ...input.config, enabled: true}
					await setUserPreference(ctx.currentUser.id, `integration:${input.type}`, newConfig)

					// Admin also syncs to Redis for nexus-core
					if (ctx.currentUser.role === 'admin') {
						await redis.set(`nexus:${input.type}:config`, JSON.stringify(newConfig))
						await redis.publish('nexus:channel:updated', JSON.stringify({channel: input.type}))
					}
				} else {
					// Legacy: write to Redis directly
					const existingStr = await redis.get(`nexus:${input.type}:config`)
					const existing = existingStr ? JSON.parse(existingStr) : {}
					const newConfig = {...existing, ...input.config, enabled: true}
					await redis.set(`nexus:${input.type}:config`, JSON.stringify(newConfig))
					await redis.publish('nexus:channel:updated', JSON.stringify({channel: input.type}))
				}

				ctx.livinityd!.logger.log(`Channel config updated for ${input.type}`)
				return {success: true}
			} catch (error) {
				ctx.livinityd!.logger.error(`Failed to update ${input.type} config`, error)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: getErrorMessage(error) || 'Failed to update channel config',
				})
			}
		}),

	/** Get integration config for a channel (per-user scoped) */
	getIntegrationConfig: privateProcedure
		.input(z.object({channel: z.enum(['discord', 'telegram', 'slack', 'matrix'])}))
		.query(async ({ctx, input}) => {
			try {
				// Per-user: read from PostgreSQL user_preferences
				if (ctx.currentUser) {
					const pref = await getUserPreference(ctx.currentUser.id, `integration:${input.channel}`)
					if (pref) return pref as {
						enabled: boolean
						token?: string
						appToken?: string
						webhookUrl?: string
						webhookSecret?: string
						homeserverUrl?: string
						roomId?: string
					}
					// No per-user config saved yet — return null (unconfigured for this user)
					return null
				}
				// Legacy single-user: read from Redis
				const redis = ctx.livinityd!.ai.redis
				const key = `nexus:${input.channel}:config`
				const config = await redis.get(key)
				if (!config) return null
				return JSON.parse(config) as {
					enabled: boolean
					token?: string
					appToken?: string
					webhookUrl?: string
					webhookSecret?: string
					homeserverUrl?: string
					roomId?: string
				}
			} catch (error) {
				ctx.livinityd!.logger.error(`Failed to get ${input.channel} config`, error)
				return null
			}
		}),

	/** Get integration status for a channel (per-user scoped) */
	getIntegrationStatus: privateProcedure
		.input(z.object({channel: z.enum(['discord', 'telegram', 'slack', 'matrix'])}))
		.query(async ({ctx, input}) => {
			try {
				const redis = ctx.livinityd!.ai.redis

				// Per-user: read config from PostgreSQL, status from Redis (global)
				let config: any = null
				if (ctx.currentUser) {
					config = await getUserPreference(ctx.currentUser.id, `integration:${input.channel}`)
				}
				if (!config) {
					const configStr = await redis.get(`nexus:${input.channel}:config`)
					config = configStr ? JSON.parse(configStr) : null
				}

				// Status is global (nexus-core manages the active bot)
				const statusStr = await redis.get(`nexus:${input.channel}:status`)
				const status = statusStr ? JSON.parse(statusStr) : null

				return {
					enabled: config?.enabled ?? false,
					connected: status?.connected ?? false,
					error: status?.error,
					lastConnect: status?.lastConnect,
					lastMessage: status?.lastMessage,
					botName: status?.botName,
					botId: status?.botId,
				}
			} catch (error) {
				ctx.livinityd!.logger.error(`Failed to get ${input.channel} status`, error)
				return {enabled: false, connected: false, error: getErrorMessage(error)}
			}
		}),

	/** Save integration config for a channel (per-user scoped) */
	saveIntegrationConfig: privateProcedure
		.input(
			z.object({
				channel: z.enum(['discord', 'telegram', 'slack', 'matrix']),
				config: z.object({
					enabled: z.boolean().optional(),
					token: z.string().optional(),
					appToken: z.string().optional(),
					webhookUrl: z.string().optional(),
					webhookSecret: z.string().optional(),
					homeserverUrl: z.string().optional(),
					roomId: z.string().optional(),
				}),
			}),
		)
		.mutation(async ({ctx, input}) => {
			try {
				const redis = ctx.livinityd!.ai.redis

				// Per-user: store in PostgreSQL user_preferences
				if (ctx.currentUser) {
					const existing = (await getUserPreference(ctx.currentUser.id, `integration:${input.channel}`)) || {}
					const newConfig = {...existing, ...input.config}
					await setUserPreference(ctx.currentUser.id, `integration:${input.channel}`, newConfig)

					// Admin's config also syncs to global Redis for nexus-core
					if (ctx.currentUser.role === 'admin') {
						await redis.set(`nexus:${input.channel}:config`, JSON.stringify(newConfig))
						await redis.publish('nexus:channel:updated', JSON.stringify({channel: input.channel}))
					}
				} else {
					// Legacy single-user: write to Redis directly
					const key = `nexus:${input.channel}:config`
					const existingStr = await redis.get(key)
					const existing = existingStr ? JSON.parse(existingStr) : {}
					const newConfig = {...existing, ...input.config}
					await redis.set(key, JSON.stringify(newConfig))
					await redis.publish('nexus:channel:updated', JSON.stringify({channel: input.channel}))
				}

				ctx.livinityd!.logger.log(`Integration config saved for ${input.channel}`)
				return {success: true}
			} catch (error) {
				ctx.livinityd!.logger.error(`Failed to save ${input.channel} config`, error)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: getErrorMessage(error) || 'Failed to save config',
				})
			}
		}),

	/** Test integration connection */
	testIntegration: privateProcedure
		.input(z.object({channel: z.enum(['discord', 'telegram', 'slack', 'matrix'])}))
		.mutation(async ({ctx, input}) => {
			try {
				const nexusUrl = getNexusApiUrl()
				const url = `${nexusUrl}/api/channels/${input.channel}/test`
				const response = await fetch(url, {
					method: 'POST',
					headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
				})
				if (!response.ok) {
					const errorData = (await response.json().catch(() => ({}))) as {error?: string}
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: errorData.error || `Test failed: ${response.status}`,
					})
				}
				return await response.json()
			} catch (error) {
				if (error instanceof TRPCError) throw error
				ctx.livinityd.logger.error(`Failed to test ${input.channel}`, error)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: getErrorMessage(error) || 'Test failed',
				})
			}
		}),

	// ── Docker (Direct) ─────────────────────────────────────

	/** List all Docker containers directly via Dockerode */
	listDockerContainers: privateProcedure.query(async () => {
		const Dockerode = (await import('dockerode')).default
		const docker = new Dockerode()
		const containers = await docker.listContainers({all: true})
		return containers.map((c) => ({
			id: c.Id.slice(0, 12),
			name: c.Names[0]?.replace('/', '') ?? c.Id.slice(0, 12),
			image: c.Image,
			state: c.State,
			status: c.Status,
		}))
	}),

	/** Start, stop, or restart a Docker container directly */
	manageDockerContainer: privateProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
				operation: z.enum(['start', 'stop', 'restart']),
			}),
		)
		.mutation(async ({input}) => {
			const Dockerode = (await import('dockerode')).default
			const docker = new Dockerode()
			const container = docker.getContainer(input.name)
			switch (input.operation) {
				case 'start':
					await container.start()
					break
				case 'stop':
					await container.stop()
					break
				case 'restart':
					await container.restart()
					break
			}
			return {success: true, message: `Container ${input.name} ${input.operation}ed successfully`}
		}),

	// ── DM Pairing ─────────────────────────────────────────

	/** Get pending DM pairing requests */
	getDmPairingPending: privateProcedure.query(async () => {
		const nexusUrl = getNexusApiUrl()
		const response = await fetch(`${nexusUrl}/api/dm-pairing/pending`, {
			headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
		})
		if (!response.ok) return {pending: []}
		return await response.json() as {pending: Array<{channel: string; userId: string; userName: string; code: string; createdAt: number; channelChatId: string}>}
	}),

	/** Get DM pairing allowlist for a channel */
	getDmPairingAllowlist: privateProcedure
		.input(z.object({channel: z.string()}))
		.query(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/dm-pairing/allowlist/${input.channel}`, {
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) return {channel: input.channel, users: []}
			return await response.json() as {channel: string; users: string[]}
		}),

	/** Get DM pairing policy for a channel */
	getDmPairingPolicy: privateProcedure
		.input(z.object({channel: z.string()}))
		.query(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/dm-pairing/policy/${input.channel}`, {
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) return {channel: input.channel, policy: 'pairing'}
			return await response.json() as {channel: string; policy: string}
		}),

	/** Update DM pairing policy for a channel */
	setDmPairingPolicy: privateProcedure
		.input(z.object({channel: z.string(), policy: z.enum(['pairing', 'allowlist', 'open', 'disabled'])}))
		.mutation(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/dm-pairing/policy/${input.channel}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
				},
				body: JSON.stringify({policy: input.policy}),
			})
			if (!response.ok) {
				const err = (await response.json().catch(() => ({}))) as {error?: string}
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.error || 'Failed to update policy'})
			}
			return await response.json()
		}),

	/** Approve a DM pairing request */
	approveDmPairing: privateProcedure
		.input(z.object({channel: z.string(), userId: z.string()}))
		.mutation(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/dm-pairing/approve`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
				},
				body: JSON.stringify({channel: input.channel, userId: input.userId}),
			})
			if (!response.ok) {
				const err = (await response.json().catch(() => ({}))) as {error?: string}
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.error || 'Failed to approve'})
			}
			return await response.json()
		}),

	/** Deny a DM pairing request */
	denyDmPairing: privateProcedure
		.input(z.object({channel: z.string(), userId: z.string()}))
		.mutation(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/dm-pairing/deny`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
				},
				body: JSON.stringify({channel: input.channel, userId: input.userId}),
			})
			if (!response.ok) {
				const err = (await response.json().catch(() => ({}))) as {error?: string}
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.error || 'Failed to deny'})
			}
			return await response.json()
		}),

	/** Remove a user from the DM pairing allowlist */
	removeDmPairingAllowlist: privateProcedure
		.input(z.object({channel: z.string(), userId: z.string()}))
		.mutation(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/dm-pairing/allowlist/${input.channel}/${input.userId}`, {
				method: 'DELETE',
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				const err = (await response.json().catch(() => ({}))) as {error?: string}
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.error || 'Failed to remove'})
			}
			return await response.json()
		}),

	// ── Usage Tracking ─────────────────────────────────────────

	/** Get overall usage overview */
	getUsageOverview: privateProcedure.query(async () => {
		const nexusUrl = getNexusApiUrl()
		const response = await fetch(`${nexusUrl}/api/usage/overview`, {
			headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
		})
		if (!response.ok) {
			return {totalInputTokens: 0, totalOutputTokens: 0, totalSessions: 0, totalTurns: 0, estimatedCostUsd: 0, activeUsers: 0}
		}
		return await response.json() as {
			totalInputTokens: number
			totalOutputTokens: number
			totalSessions: number
			totalTurns: number
			estimatedCostUsd: number
			activeUsers: number
		}
	}),

	/** Get daily usage for a user */
	getUsageDaily: privateProcedure
		.input(z.object({userId: z.string(), days: z.number().int().min(1).max(90).optional()}))
		.query(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const days = input.days || 30
			const response = await fetch(`${nexusUrl}/api/usage/daily/${encodeURIComponent(input.userId)}?days=${days}`, {
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				return {daily: []}
			}
			return await response.json() as {
				daily: Array<{
					date: string
					userId: string
					inputTokens: number
					outputTokens: number
					sessions: number
					turns: number
					toolCalls: number
					avgTtfbMs: number
					estimatedCostUsd: number
				}>
			}
		}),

	/** Get usage summary for a user */
	getUsageSummary: privateProcedure
		.input(z.object({userId: z.string()}))
		.query(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/usage/summary/${encodeURIComponent(input.userId)}`, {
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				return {
					currentSession: null,
					today: {date: '', userId: '', inputTokens: 0, outputTokens: 0, sessions: 0, turns: 0, toolCalls: 0, avgTtfbMs: 0, estimatedCostUsd: 0},
					cumulative: {inputTokens: 0, outputTokens: 0, sessions: 0, turns: 0, toolCalls: 0, firstSeen: 0, lastSeen: 0},
					displayMode: 'off' as const,
				}
			}
			return await response.json()
		}),

	// ── Webhook Management ─────────────────────────────────────

	/** List all webhooks (secrets stripped by API) */
	getWebhooks: privateProcedure.query(async () => {
		const nexusUrl = getNexusApiUrl()
		const response = await fetch(`${nexusUrl}/api/webhooks`, {
			headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
		})
		if (!response.ok) {
			return {webhooks: []}
		}
		return await response.json() as {
			webhooks: Array<{
				id: string
				name: string
				createdAt: string
				lastUsed: string | null
				deliveryCount: number
			}>
		}
	}),

	/** Create a new webhook — returns id, url, and secret (shown only once) */
	createWebhook: privateProcedure
		.input(z.object({name: z.string().min(1).max(100), secret: z.string().optional()}))
		.mutation(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/webhooks`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
				},
				body: JSON.stringify({name: input.name, secret: input.secret}),
			})
			if (!response.ok) {
				const err = (await response.json().catch(() => ({}))) as {error?: string}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.error || `Nexus API error: ${response.status}`,
				})
			}
			return await response.json() as {id: string; url: string; secret: string}
		}),

	/** Delete a webhook by ID */
	deleteWebhook: privateProcedure
		.input(z.object({id: z.string().uuid()}))
		.mutation(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/webhooks/${encodeURIComponent(input.id)}`, {
				method: 'DELETE',
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				const err = (await response.json().catch(() => ({}))) as {error?: string}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.error || `Nexus API error: ${response.status}`,
				})
			}
			return await response.json() as {ok: boolean; message: string}
		}),

	// ── Voice Config ─────────────────────────────────────────────

	/** Get voice pipeline configuration (keys masked) — per-user */
	getVoiceConfig: privateProcedure.query(async ({ctx}) => {
		const defaultVoice = {enabled: false, hasDeepgramKey: false, hasCartesiaKey: false, cartesiaVoiceId: '', sttLanguage: 'en', sttModel: 'nova-3'}

		// Per-user: read from PostgreSQL user_preferences
		if (ctx.currentUser) {
			const pref = await getUserPreference(ctx.currentUser.id, 'voice:config')
			if (pref && typeof pref === 'object') {
				return {
					enabled: pref.enabled ?? false,
					hasDeepgramKey: !!pref.deepgramApiKey,
					hasCartesiaKey: !!pref.cartesiaApiKey,
					cartesiaVoiceId: pref.cartesiaVoiceId ?? '',
					sttLanguage: pref.sttLanguage ?? 'en',
					sttModel: pref.sttModel ?? 'nova-3',
				}
			}
			return defaultVoice
		}

		// Legacy: proxy to nexus-core
		const nexusUrl = getNexusApiUrl()
		const response = await fetch(`${nexusUrl}/api/voice/config`, {
			headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
		})
		if (!response.ok) return defaultVoice
		return await response.json() as {
			enabled: boolean
			hasDeepgramKey: boolean
			hasCartesiaKey: boolean
			cartesiaVoiceId: string
			sttLanguage: string
			sttModel: string
		}
	}),

	/** Update voice pipeline configuration — per-user */
	updateVoiceConfig: privateProcedure
		.input(z.object({
			deepgramApiKey: z.string().optional(),
			cartesiaApiKey: z.string().optional(),
			cartesiaVoiceId: z.string().optional(),
			sttLanguage: z.string().optional(),
			sttModel: z.string().optional(),
			enabled: z.boolean().optional(),
		}))
		.mutation(async ({ctx, input}) => {
			// Per-user: store in PostgreSQL user_preferences
			if (ctx.currentUser) {
				const existing = (await getUserPreference(ctx.currentUser.id, 'voice:config')) || {}
				const newConfig = {...existing, ...input}
				await setUserPreference(ctx.currentUser.id, 'voice:config', newConfig)

				// Admin's config also syncs to nexus-core for backward compat
				if (ctx.currentUser.role === 'admin') {
					const nexusUrl = getNexusApiUrl()
					await fetch(`${nexusUrl}/api/voice/config`, {
						method: 'PUT',
						headers: {
							'Content-Type': 'application/json',
							...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
						},
						body: JSON.stringify(input),
					}).catch(() => {}) // Don't fail if nexus-core is unavailable
				}

				return {
					enabled: newConfig.enabled ?? false,
					hasDeepgramKey: !!newConfig.deepgramApiKey,
					hasCartesiaKey: !!newConfig.cartesiaApiKey,
					cartesiaVoiceId: newConfig.cartesiaVoiceId ?? '',
					sttLanguage: newConfig.sttLanguage ?? 'en',
					sttModel: newConfig.sttModel ?? 'nova-3',
				}
			}

			// Legacy: proxy to nexus-core
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/voice/config`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
				},
				body: JSON.stringify(input),
			})
			if (!response.ok) {
				const err = (await response.json().catch(() => ({}))) as {error?: string}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.error || `Nexus API error: ${response.status}`,
				})
			}
			return await response.json() as {
				enabled: boolean
				hasDeepgramKey: boolean
				hasCartesiaKey: boolean
				cartesiaVoiceId: string
				sttLanguage: string
				sttModel: string
			}
		}),

	// ── Gmail OAuth ─────────────────────────────────────────────

	/** Get Gmail connection status — per-user */
	getGmailStatus: privateProcedure.query(async ({ctx}) => {
		const defaultStatus = {connected: false, enabled: false, configured: false, email: null as string | null, error: null as string | null, lastMessage: null as string | null}

		// Per-user: read from PostgreSQL user_preferences
		if (ctx.currentUser) {
			const pref = await getUserPreference(ctx.currentUser.id, 'gmail:status')
			if (pref && typeof pref === 'object') return {...defaultStatus, ...pref}
			return defaultStatus
		}

		// Legacy: proxy to nexus-core
		const nexusUrl = getNexusApiUrl()
		const response = await fetch(`${nexusUrl}/api/gmail/oauth/status`, {
			headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
		})
		if (!response.ok) return defaultStatus
		return await response.json() as typeof defaultStatus
	}),

	/** Save Gmail OAuth credentials (Client ID + Secret) — per-user */
	saveGmailCredentials: privateProcedure.input(z.object({
		clientId: z.string().min(1),
		clientSecret: z.string().min(1),
	})).mutation(async ({ctx, input}) => {
		// Per-user: store in PostgreSQL user_preferences
		if (ctx.currentUser) {
			const existing = (await getUserPreference(ctx.currentUser.id, 'gmail:config')) || {}
			await setUserPreference(ctx.currentUser.id, 'gmail:config', {...existing, clientId: input.clientId, clientSecret: input.clientSecret})

			// Admin also syncs to nexus-core
			if (ctx.currentUser.role === 'admin') {
				const nexusUrl = getNexusApiUrl()
				await fetch(`${nexusUrl}/api/gmail/credentials`, {
					method: 'POST',
					headers: {'Content-Type': 'application/json', ...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {})},
					body: JSON.stringify({clientId: input.clientId, clientSecret: input.clientSecret}),
				}).catch(() => {})
			}
			return {ok: true}
		}

		// Legacy: proxy to nexus-core
		const nexusUrl = getNexusApiUrl()
		const response = await fetch(`${nexusUrl}/api/gmail/credentials`, {
			method: 'POST',
			headers: {'Content-Type': 'application/json', ...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {})},
			body: JSON.stringify({clientId: input.clientId, clientSecret: input.clientSecret}),
		})
		if (!response.ok) {
			const err = (await response.json().catch(() => ({}))) as {error?: string}
			throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.error || `Nexus API error: ${response.status}`})
		}
		return await response.json() as {ok: boolean}
	}),

	/** Get Gmail settings (processing mode, filters, notifications) — per-user */
	getGmailSettings: privateProcedure.query(async ({ctx}) => {
		// Per-user: read from PostgreSQL user_preferences
		if (ctx.currentUser) {
			const pref = await getUserPreference(ctx.currentUser.id, 'gmail:settings')
			return pref || null
		}

		// Legacy: proxy to nexus-core
		const nexusUrl = getNexusApiUrl()
		const response = await fetch(`${nexusUrl}/api/gmail/settings`, {
			headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
		})
		if (!response.ok) return null
		return await response.json()
	}),

	/** Update Gmail settings — per-user */
	updateGmailSettings: privateProcedure.input(z.object({
		processingMode: z.enum(['disabled', 'notify_only', 'full']).optional(),
		sendProtection: z.boolean().optional(),
		senderWhitelist: z.array(z.string()).optional(),
		senderBlacklist: z.array(z.string()).optional(),
		subjectKeywords: z.array(z.string()).optional(),
		importantSenders: z.array(z.string()).optional(),
		notifyChannel: z.string().optional(),
		notifyChatId: z.string().optional(),
		gmailPollIntervalSec: z.number().min(30).max(3600).optional(),
		maxEmailsPerPoll: z.number().min(1).max(50).optional(),
	})).mutation(async ({ctx, input}) => {
		// Per-user: store in PostgreSQL
		if (ctx.currentUser) {
			const existing = (await getUserPreference(ctx.currentUser.id, 'gmail:settings')) || {}
			await setUserPreference(ctx.currentUser.id, 'gmail:settings', {...existing, ...input})

			// Admin also syncs to nexus-core
			if (ctx.currentUser.role === 'admin') {
				const nexusUrl = getNexusApiUrl()
				await fetch(`${nexusUrl}/api/gmail/settings`, {
					method: 'PUT',
					headers: {'Content-Type': 'application/json', ...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {})},
					body: JSON.stringify(input),
				}).catch(() => {})
			}
			return {ok: true}
		}

		// Legacy: proxy to nexus-core
		const nexusUrl = getNexusApiUrl()
		const response = await fetch(`${nexusUrl}/api/gmail/settings`, {
			method: 'PUT',
			headers: {'Content-Type': 'application/json', ...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {})},
			body: JSON.stringify(input),
		})
		if (!response.ok) {
			const err = (await response.json().catch(() => ({}))) as {error?: string}
			throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.error || `Nexus API error: ${response.status}`})
		}
		return await response.json() as {ok: boolean}
	}),

	/** Start Gmail OAuth flow — returns consent screen URL (admin only, proxies to nexus-core) */
	startGmailOauth: privateProcedure.input(z.object({
		publicUrl: z.string().min(1),
	})).mutation(async ({input}) => {
		const nexusUrl = getNexusApiUrl()
		const response = await fetch(`${nexusUrl}/api/gmail/oauth/start?publicUrl=${encodeURIComponent(input.publicUrl)}`, {
			headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
		})
		if (!response.ok) {
			const err = (await response.json().catch(() => ({}))) as {error?: string}
			throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.error || `Nexus API error: ${response.status}`})
		}
		return await response.json() as {url: string}
	}),

	/** Disconnect Gmail — clears tokens and stops polling */
	disconnectGmail: privateProcedure.mutation(async ({ctx}) => {
		// Per-user: clear Gmail preferences
		if (ctx.currentUser) {
			await setUserPreference(ctx.currentUser.id, 'gmail:status', {connected: false, enabled: false, configured: false, email: null})
			await setUserPreference(ctx.currentUser.id, 'gmail:config', {})

			// Admin also disconnects in nexus-core
			if (ctx.currentUser.role === 'admin') {
				const nexusUrl = getNexusApiUrl()
				await fetch(`${nexusUrl}/api/gmail/oauth/disconnect`, {
					method: 'POST',
					headers: {'Content-Type': 'application/json', ...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {})},
				}).catch(() => {})
			}
			return {ok: true, message: 'Gmail disconnected'}
		}

		// Legacy: proxy to nexus-core
		const nexusUrl = getNexusApiUrl()
		const response = await fetch(`${nexusUrl}/api/gmail/oauth/disconnect`, {
			method: 'POST',
			headers: {'Content-Type': 'application/json', ...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {})},
		})
		if (!response.ok) {
			const err = (await response.json().catch(() => ({}))) as {error?: string}
			throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.error || `Nexus API error: ${response.status}`})
		}
		return await response.json() as {ok: boolean; message: string}
	}),

	// ── LivHub Registry Management ─────────────────────────────

	/** List skill registries (proxied from Nexus) */
	listRegistries: privateProcedure.query(async () => {
		const nexusUrl = getNexusApiUrl()
		const response = await fetch(`${nexusUrl}/api/skills/registries`, {
			headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
		})
		if (!response.ok) return {registries: []}
		const data = await response.json() as {registries: string[]}
		return data
	}),

	/** Add a skill registry (proxied from Nexus) */
	addRegistry: privateProcedure
		.input(z.object({url: z.string().url()}))
		.mutation(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/skills/registries`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
				},
				body: JSON.stringify({url: input.url}),
			})
			if (!response.ok) {
				const data = await response.json().catch(() => ({error: 'Failed'})) as {error?: string}
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: data.error || `Error: ${response.status}`})
			}
			return await response.json()
		}),

	/** Remove a skill registry (proxied from Nexus) */
	removeRegistry: privateProcedure
		.input(z.object({url: z.string()}))
		.mutation(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/skills/registries`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
					...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
				},
				body: JSON.stringify({url: input.url}),
			})
			if (!response.ok) {
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: `Error: ${response.status}`})
			}
			return await response.json()
		}),

	/** Refresh skill catalog (proxied from Nexus) */
	refreshCatalog: privateProcedure.mutation(async () => {
		const nexusUrl = getNexusApiUrl()
		const response = await fetch(`${nexusUrl}/api/skills/refresh`, {
			method: 'POST',
			headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
		})
		if (!response.ok) {
			throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: `Error: ${response.status}`})
		}
		return await response.json()
	}),

	// ── Canvas Artifacts (Live Canvas) ─────────────────────────────

	/** Get a canvas artifact by ID (proxied from Nexus) */
	getCanvasArtifact: privateProcedure
		.input(z.object({id: z.string().min(1)}))
		.query(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/canvas/${encodeURIComponent(input.id)}`, {
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				if (response.status === 404) return null
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: `Nexus API error: ${response.status}`})
			}
			return await response.json() as {
				id: string
				type: string
				title: string
				content: string
				conversationId: string
				createdAt: number
				updatedAt: number
				version: number
			}
		}),

	/** List canvas artifacts for a conversation (proxied from Nexus) */
	listCanvasArtifacts: privateProcedure
		.input(z.object({conversationId: z.string().min(1)}))
		.query(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(
				`${nexusUrl}/api/canvas?conversationId=${encodeURIComponent(input.conversationId)}`,
				{headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}},
			)
			if (!response.ok) {
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: `Nexus API error: ${response.status}`})
			}
			const data = await response.json() as {artifacts: Array<{
				id: string
				type: string
				title: string
				content: string
				conversationId: string
				createdAt: number
				updatedAt: number
				version: number
			}>}
			return data.artifacts || []
		}),

	/** Delete a canvas artifact (proxied from Nexus) */
	deleteCanvasArtifact: privateProcedure
		.input(z.object({id: z.string().min(1)}))
		.mutation(async ({input}) => {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/canvas/${encodeURIComponent(input.id)}`, {
				method: 'DELETE',
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: `Nexus API error: ${response.status}`})
			}
			return await response.json() as {success: boolean}
		}),

	// ── Computer Use Consent Settings ──────────────────────────

	/** Get computer use auto-consent setting */
	getComputerUseAutoConsent: privateProcedure.query(async ({ctx}) => {
		try {
			const redis = ctx.livinityd.ai.redis
			const val = await redis.get('nexus:config:computer_use_auto_consent')
			return {autoConsent: val === 'true' || val === '1'}
		} catch {
			return {autoConsent: false}
		}
	}),

	/** Set computer use auto-consent (skip permission dialog) */
	setComputerUseAutoConsent: privateProcedure
		.input(z.object({enabled: z.boolean()}))
		.mutation(async ({ctx, input}) => {
			const redis = ctx.livinityd.ai.redis
			await redis.set('nexus:config:computer_use_auto_consent', input.enabled ? 'true' : 'false')
			return {ok: true, autoConsent: input.enabled}
		}),

})
