import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from '../server/trpc/trpc.js'
import {listContainers, manageContainer} from './docker.js'

export default router({
	listContainers: adminProcedure
		.input(z.object({all: z.boolean().optional().default(true)}).optional())
		.query(async ({input}) => {
			return listContainers()
		}),

	manageContainer: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
				operation: z.enum(['start', 'stop', 'restart', 'remove']),
				force: z.boolean().optional().default(false),
				confirmName: z.string().optional(),
			}),
		)
		.mutation(async ({input}) => {
			// For remove, require confirmName to match container name (SEC-03 backend validation)
			if (input.operation === 'remove') {
				if (!input.confirmName || input.confirmName !== input.name) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'Container name confirmation required for removal. confirmName must match name.',
					})
				}
			}

			try {
				return await manageContainer(input.name, input.operation, input.force)
			} catch (err: any) {
				if (err.message?.includes('[protected-container]')) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: err.message.replace('[protected-container] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to ${input.operation} container ${input.name}`,
				})
			}
		}),
})
