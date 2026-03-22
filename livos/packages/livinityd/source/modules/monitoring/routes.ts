import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {privateProcedure, router} from '../server/trpc/trpc.js'
import {getNetworkStats, getDiskIO, getProcesses} from './monitoring.js'

export default router({
	networkStats: privateProcedure.query(async () => {
		try {
			return await getNetworkStats()
		} catch (err: any) {
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: err.message || 'Failed to get network stats',
			})
		}
	}),

	diskIO: privateProcedure.query(async () => {
		try {
			return await getDiskIO()
		} catch (err: any) {
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: err.message || 'Failed to get disk I/O stats',
			})
		}
	}),

	processes: privateProcedure
		.input(z.object({sortBy: z.enum(['cpu', 'memory']).optional().default('cpu')}).optional())
		.query(async ({input}) => {
			try {
				return await getProcesses(input?.sortBy ?? 'cpu')
			} catch (err: any) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to get process list',
				})
			}
		}),
})
