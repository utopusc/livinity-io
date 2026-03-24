import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from '../server/trpc/trpc.js'

export default router({
	list: adminProcedure.query(async ({ctx}) => {
		return ctx.livinityd!.deviceBridge.getAllDevicesFromRedis()
	}),

	rename: adminProcedure
		.input(
			z.object({
				deviceId: z.string().min(1),
				name: z.string().min(1).max(100),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const success = await ctx.livinityd!.deviceBridge.renameDevice(input.deviceId, input.name)
			if (!success) throw new TRPCError({code: 'NOT_FOUND', message: 'Device not found'})
			return {success: true}
		}),

	remove: adminProcedure
		.input(
			z.object({
				deviceId: z.string().min(1),
				confirmName: z.string().min(1),
			}),
		)
		.mutation(async ({ctx, input}) => {
			// Verify confirmName matches actual device name (safety check)
			const device = await ctx.livinityd!.deviceBridge.getDeviceFromRedis(input.deviceId)
			if (!device) throw new TRPCError({code: 'NOT_FOUND', message: 'Device not found'})
			if (device.deviceName !== input.confirmName) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'Device name confirmation does not match'})
			}
			const success = await ctx.livinityd!.deviceBridge.removeDevice(input.deviceId)
			if (!success) throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: 'Failed to remove device'})
			return {success: true}
		}),
})
