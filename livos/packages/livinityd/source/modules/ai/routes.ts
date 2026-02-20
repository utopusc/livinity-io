import {z} from 'zod'
import {observable} from '@trpc/server/observable'
import {TRPCError} from '@trpc/server'

import {privateProcedure, router} from '../server/trpc/trpc.js'

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
})

/** Get Nexus API URL from env */
function getNexusApiUrl(): string {
	return process.env.NEXUS_API_URL || process.env.LIV_API_URL || 'http://localhost:3200'
}

export default router({
	// ── AI Config ─────────────────────────────────────────

	/** Get current AI configuration (keys are masked) */
	getConfig: privateProcedure.query(async ({ctx}) => {
		const redis = ctx.livinityd.ai.redis
		const geminiKey = await redis.get('livos:config:gemini_api_key') || process.env.GEMINI_API_KEY || ''
		const anthropicKey = await redis.get('nexus:config:anthropic_api_key') || process.env.ANTHROPIC_API_KEY || ''
		const primaryProvider = await redis.get('nexus:config:primary_provider') || 'claude'
		return {
			geminiApiKey: maskKey(geminiKey),
			hasGeminiKey: geminiKey.length > 0,
			anthropicApiKey: maskKey(anthropicKey),
			hasAnthropicKey: anthropicKey.length > 0,
			primaryProvider,
		}
	}),

	/** Set AI configuration (API keys and provider selection) */
	setConfig: privateProcedure
		.input(
			z.object({
				geminiApiKey: z.string().min(1).max(256).optional(),
				anthropicApiKey: z.string().min(1).max(256).optional(),
				primaryProvider: z.enum(['claude', 'gemini']).optional(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const redis = ctx.livinityd.ai.redis

			if (input.geminiApiKey) {
				await redis.set('livos:config:gemini_api_key', input.geminiApiKey)
				await redis.publish('livos:config:updated', 'gemini_api_key')
				ctx.livinityd.logger.log('Gemini API key updated via Settings UI')
			}

			if (input.anthropicApiKey) {
				await redis.set('nexus:config:anthropic_api_key', input.anthropicApiKey)
				await redis.publish('livos:config:updated', 'anthropic_api_key')
				ctx.livinityd.logger.log('Anthropic API key updated via Settings UI')
			}

			if (input.primaryProvider) {
				await redis.set('nexus:config:primary_provider', input.primaryProvider)
				await redis.publish('livos:config:updated', 'primary_provider')
				ctx.livinityd.logger.log(`Primary provider set to ${input.primaryProvider} via Settings UI`)
			}

			return {success: true}
		}),

	/** Validate an API key by making a lightweight test call */
	validateKey: privateProcedure
		.input(
			z.object({
				provider: z.enum(['claude', 'gemini']),
				apiKey: z.string().min(1).max(256),
			}),
		)
		.mutation(async ({ctx, input}): Promise<{valid: boolean; error?: string}> => {
			try {
				if (input.provider === 'claude') {
					const response = await fetch('https://api.anthropic.com/v1/messages', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'x-api-key': input.apiKey,
							'anthropic-version': '2023-06-01',
						},
						body: JSON.stringify({
							model: 'claude-haiku-4-5-20250610',
							max_tokens: 1,
							messages: [{role: 'user', content: 'Hi'}],
						}),
					})

					if (response.status === 401) {
						return {valid: false, error: 'Invalid API key'}
					}
					if (response.status === 403) {
						return {valid: false, error: 'API key does not have permission'}
					}
					// 200 or 429 (rate limited) both mean the key is valid
					if (response.ok || response.status === 429) {
						return {valid: true}
					}
					const data = (await response.json().catch(() => ({}))) as {error?: {message?: string}}
					return {valid: false, error: data.error?.message || `Unexpected status: ${response.status}`}
				} else if (input.provider === 'gemini') {
					const response = await fetch(
						`https://generativelanguage.googleapis.com/v1beta/models?key=${input.apiKey}`,
					)

					if (response.status === 400 || response.status === 403) {
						return {valid: false, error: 'Invalid API key'}
					}
					if (response.ok) {
						return {valid: true}
					}
					return {valid: false, error: `Unexpected status: ${response.status}`}
				}

				return {valid: false, error: 'Unknown provider'}
			} catch (error) {
				ctx.livinityd.logger.error('API key validation failed', error)
				return {valid: false, error: getErrorMessage(error)}
			}
		}),

	// ── Claude CLI / SDK Auth ─────────────────────────────────

	/** Check Claude CLI installation and auth status (for SDK subscription mode) */
	getClaudeCliStatus: privateProcedure.query(async ({ctx}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/claude-cli/status`, {
				headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
			})
			if (!response.ok) {
				throw new Error(`Nexus API error: ${response.status}`)
			}
			return (await response.json()) as {
				installed: boolean
				authenticated: boolean
				user?: string
				authMethod: 'api-key' | 'sdk-subscription'
			}
		} catch (error) {
			ctx.livinityd.logger.error('Failed to get Claude CLI status', error)
			return {installed: false, authenticated: false, authMethod: 'api-key' as const}
		}
	}),

	/** Start Claude CLI OAuth login — returns URL user opens in browser to authenticate */
	startClaudeLogin: privateProcedure.mutation(async ({ctx}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/claude-cli/login`, {
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
				url?: string
				error?: string
				alreadyAuthenticated?: boolean
			}
		} catch (error) {
			if (error instanceof TRPCError) throw error
			ctx.livinityd.logger.error('Failed to start Claude login', error)
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: getErrorMessage(error) || 'Failed to start Claude login',
			})
		}
	}),

	/** Submit OAuth code to the running claude auth login process */
	submitClaudeLoginCode: privateProcedure
		.input(z.object({code: z.string().min(1)}))
		.mutation(async ({ctx, input}) => {
			try {
				const nexusUrl = getNexusApiUrl()
				const response = await fetch(`${nexusUrl}/api/claude-cli/login-code`, {
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
				return (await response.json()) as {success: boolean; error?: string}
			} catch (error) {
				if (error instanceof TRPCError) throw error
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: getErrorMessage(error) || 'Failed to submit login code',
				})
			}
		}),

	/** Log out from Claude (delete credentials) */
	claudeLogout: privateProcedure.mutation(async ({ctx}) => {
		try {
			const nexusUrl = getNexusApiUrl()
			const response = await fetch(`${nexusUrl}/api/claude-cli/logout`, {
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
			return (await response.json()) as {success: boolean; error?: string}
		} catch (error) {
			if (error instanceof TRPCError) throw error
			ctx.livinityd.logger.error('Failed to logout from Claude', error)
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: getErrorMessage(error) || 'Failed to logout',
			})
		}
	}),

	/** Set Claude auth method (api-key or sdk-subscription) */
	setClaudeAuthMethod: privateProcedure
		.input(z.object({method: z.enum(['api-key', 'sdk-subscription'])}))
		.mutation(async ({ctx, input}) => {
			const redis = ctx.livinityd.ai.redis
			await redis.set('nexus:config:claude_auth_method', input.method)
			await redis.publish('livos:config:updated', 'claude_auth_method')
			ctx.livinityd.logger.log(`Claude auth method set to ${input.method} via Settings UI`)
			return {success: true}
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
			const result = await ai.chat(input.conversationId, input.message)
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

				ai.chat(input.conversationId, input.message, (event) => {
					emit.next({type: event.type, data: event.data})
				})
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
		const conversation = ctx.livinityd.ai.getConversation(input.id)
		if (!conversation) throw new TRPCError({code: 'NOT_FOUND', message: 'Conversation not found'})
		return conversation
	}),

	/** List all conversations */
	listConversations: privateProcedure.query(async ({ctx}) => {
		return ctx.livinityd.ai.listConversations()
	}),

	/** Delete a conversation */
	deleteConversation: privateProcedure.input(z.object({id: z.string()})).mutation(async ({ctx, input}) => {
		return ctx.livinityd.ai.deleteConversation(input.id)
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
			const redis = ctx.livinityd.ai.redis

			// Get channels from Redis (only Telegram and Discord)
			const channelTypes = ['telegram', 'discord'] as const
			const channels = await Promise.all(
				channelTypes.map(async (type) => {
					const [configStr, statusStr] = await Promise.all([
						redis.get(`nexus:${type}:config`),
						redis.get(`nexus:${type}:status`),
					])
					const config = configStr ? JSON.parse(configStr) : null
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
			ctx.livinityd.logger.error('Failed to get channels', error)
			return {channels: []}
		}
	}),

	/** Update channel config (for Integrations dialog) */
	updateChannel: privateProcedure
		.input(
			z.object({
				type: z.enum(['telegram', 'discord']),
				config: z.record(z.any()),
			}),
		)
		.mutation(async ({ctx, input}) => {
			try {
				const redis = ctx.livinityd.ai.redis
				const existingStr = await redis.get(`nexus:${input.type}:config`)
				const existing = existingStr ? JSON.parse(existingStr) : {}

				const newConfig = {...existing, ...input.config, enabled: true}
				await redis.set(`nexus:${input.type}:config`, JSON.stringify(newConfig))

				// Notify Nexus about the config change
				await redis.publish('nexus:channel:updated', JSON.stringify({channel: input.type}))

				ctx.livinityd.logger.log(`Channel config updated for ${input.type}`)
				return {success: true}
			} catch (error) {
				ctx.livinityd.logger.error(`Failed to update ${input.type} config`, error)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: getErrorMessage(error) || 'Failed to update channel config',
				})
			}
		}),

	/** Get integration config for a channel */
	getIntegrationConfig: privateProcedure
		.input(z.object({channel: z.enum(['discord', 'telegram', 'slack', 'matrix'])}))
		.query(async ({ctx, input}) => {
			try {
				const redis = ctx.livinityd.ai.redis
				const config = await redis.get(`nexus:${input.channel}:config`)
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
				ctx.livinityd.logger.error(`Failed to get ${input.channel} config`, error)
				return null
			}
		}),

	/** Get integration status for a channel */
	getIntegrationStatus: privateProcedure
		.input(z.object({channel: z.enum(['discord', 'telegram', 'slack', 'matrix'])}))
		.query(async ({ctx, input}) => {
			try {
				const redis = ctx.livinityd.ai.redis
				const [configStr, statusStr] = await Promise.all([
					redis.get(`nexus:${input.channel}:config`),
					redis.get(`nexus:${input.channel}:status`),
				])

				const config = configStr ? JSON.parse(configStr) : null
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
				ctx.livinityd.logger.error(`Failed to get ${input.channel} status`, error)
				return {enabled: false, connected: false, error: getErrorMessage(error)}
			}
		}),

	/** Save integration config for a channel */
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
				const redis = ctx.livinityd.ai.redis
				const existingStr = await redis.get(`nexus:${input.channel}:config`)
				const existing = existingStr ? JSON.parse(existingStr) : {}

				const newConfig = {...existing, ...input.config}
				await redis.set(`nexus:${input.channel}:config`, JSON.stringify(newConfig))

				// Notify Nexus about the config change
				await redis.publish('nexus:channel:updated', JSON.stringify({channel: input.channel}))

				ctx.livinityd.logger.log(`Integration config saved for ${input.channel}`)
				return {success: true}
			} catch (error) {
				ctx.livinityd.logger.error(`Failed to save ${input.channel} config`, error)
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
				const response = await fetch(`${nexusUrl}/api/channels/${input.channel}/test`, {
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

})
