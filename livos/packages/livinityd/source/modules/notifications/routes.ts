import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {router, privateProcedure, adminProcedure} from '../server/trpc/trpc.js'

export default router({
	// Gets all notifications
	get: privateProcedure.query(async ({ctx}) => ctx.livinityd.notifications.get()),

	// Removes a notification
	clear: privateProcedure.input(z.string()).mutation(async ({ctx, input}) => ctx.livinityd.notifications.clear(input)),

	// Phase 310-02 (ALERT-01/03) — admin-only external alert-channel CRUD.
	//
	// `ctx.livinityd!` mirrors the is-authenticated.ts convention: the `!` keeps
	// this NEW code off the ctx-partial tsc baseline (ctx.livinityd is always set
	// on a real request — it is only optional in the type because Context merges
	// the express + ws shapes). list() NEVER returns a secret — only
	// {id, kind, target, enabled, severityFilter, hasSecret}. Errors are mapped
	// with the [alert-*] bracket convention, mirroring docker/routes.ts's [ai-*].
	channels: router({
		list: adminProcedure.query(async ({ctx}) => ctx.livinityd!.notificationChannels.list()),

		upsert: adminProcedure
			.input(
				z.object({
					id: z.string().optional(),
					kind: z.enum([
						'liv:telegram',
						'liv:discord',
						'liv:slack',
						'liv:matrix',
						'liv:gmail',
						'liv:whatsapp',
						'webhook',
						'ntfy',
					]),
					target: z.string(),
					secret: z.string().optional(),
					enabled: z.boolean(),
					severityFilter: z.array(z.enum(['critical', 'warning', 'info'])),
				}),
			)
			.mutation(async ({ctx, input}) => {
				try {
					return await ctx.livinityd!.notificationChannels.upsert(input)
				} catch (err) {
					const msg = (err as Error).message || ''
					// A private/internal target URL is a client error, not a 500.
					if (msg.startsWith('SSRF blocked')) throw new TRPCError({code: 'BAD_REQUEST', message: msg})
					throw new TRPCError({code: 'BAD_REQUEST', message: msg || 'Failed to save channel'})
				}
			}),

		delete: adminProcedure
			.input(z.object({id: z.string()}))
			.mutation(async ({ctx, input}) => ctx.livinityd!.notificationChannels.delete(input.id)),

		test: adminProcedure
			.input(z.object({id: z.string()}))
			.mutation(async ({ctx, input}) => {
				try {
					return await ctx.livinityd!.notificationChannels.test(input.id)
				} catch (err) {
					const msg = (err as Error).message || ''
					if (msg.includes('[alert-timeout]'))
						throw new TRPCError({code: 'TIMEOUT', message: msg.replace('[alert-timeout] ', '')})
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: msg.replace(/\[alert-[a-z-]+\] /, '') || 'Test failed',
					})
				}
			}),
	}),
})
