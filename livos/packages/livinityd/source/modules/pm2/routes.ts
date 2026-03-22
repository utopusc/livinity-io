import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from '../server/trpc/trpc.js'
import {listProcesses, manageProcess, getProcessLogs, describeProcess} from './pm2.js'

export default router({
	list: adminProcedure.query(async () => {
		return listProcesses()
	}),

	manage: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255),
				operation: z.enum(['start', 'stop', 'restart']),
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await manageProcess(input.name, input.operation)
			} catch (err: any) {
				if (err.message?.includes('[protected-process]')) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: err.message.replace('[protected-process] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to ${input.operation} process ${input.name}`,
				})
			}
		}),

	logs: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255),
				lines: z.number().min(10).max(2000).optional().default(200),
			}),
		)
		.query(async ({input}) => {
			return getProcessLogs(input.name, input.lines)
		}),

	describe: adminProcedure
		.input(z.object({name: z.string().min(1).max(255)}))
		.query(async ({input}) => {
			try {
				return await describeProcess(input.name)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to describe process ${input.name}`,
				})
			}
		}),
})
