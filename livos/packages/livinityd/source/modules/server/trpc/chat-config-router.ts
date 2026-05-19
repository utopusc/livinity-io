// Phase 165-02 — Chat backend + model selector tRPC router.
//
// Settings UI ChatBackendPanel calls these. All adminProcedure-gated.
// setBackend / setModel write Redis + update AiModule in-place so the
// NEXT /ws/agent connection picks up the new value via the
// resolveVaultModeConfig getter wired in server/index.ts (Task 4).
// No livinityd restart needed (CONTEXT.md decision).

import {z} from 'zod'
import {adminProcedure, router} from './trpc.js'

const MODEL_ENUM = z.enum([
	'claude-opus-4-7',
	'claude-sonnet-4-6',
	'claude-haiku-4-5-20251001',
])

const chatConfigRouter = router({
	getBackend: adminProcedure.query(async ({ctx}) => {
		return {backend: ctx.livinityd!.ai.chatBackend}
	}),
	setBackend: adminProcedure
		.input(z.object({backend: z.enum(['vault', 'legacy'])}).strict())
		.mutation(async ({ctx, input}) => {
			await ctx.livinityd!.ai.redis.set('liv:config:chat_backend', input.backend)
			ctx.livinityd!.ai.chatBackend = input.backend
			return {ok: true}
		}),
	getModel: adminProcedure.query(async ({ctx}) => {
		return {model: ctx.livinityd!.ai.defaultChatModel ?? 'claude-opus-4-7'}
	}),
	setModel: adminProcedure
		.input(z.object({model: MODEL_ENUM}).strict())
		.mutation(async ({ctx, input}) => {
			await ctx.livinityd!.ai.redis.set(
				'liv:config:default_chat_model',
				input.model,
			)
			ctx.livinityd!.ai.defaultChatModel = input.model
			return {ok: true}
		}),
})

export default chatConfigRouter
