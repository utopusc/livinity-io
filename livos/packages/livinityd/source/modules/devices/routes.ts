import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {privateProcedure, router} from '../server/trpc/trpc.js'

/**
 * Phase 11 OWN-03: devices router filters by ctx.currentUser.id.
 *
 * Legacy single-user mode (no DB users yet) has ctx.currentUser === undefined;
 * in that case the router falls back to returning all devices — the pre-v7.0
 * behavior — so existing single-user deployments don't break.
 *
 * rename/remove additionally verify the target device is owned by the caller
 * (defense-in-depth preview of Phase 12's authorizeDeviceAccess helper).
 */
export default router({
	list: privateProcedure.query(async ({ctx}) => {
		const bridge = ctx.livinityd!.deviceBridge

		// Legacy single-user mode: no currentUser resolved -> return everything
		// (this is the pre-v7.0 behavior when no DB users exist yet).
		if (!ctx.currentUser) {
			return bridge.getAllDevicesFromRedis()
		}

		// Phase 11 OWN-03: filter to caller's own devices only.
		return bridge.getDevicesForUser(ctx.currentUser.id)
	}),

	auditLog: privateProcedure
		.input(
			z.object({
				deviceId: z.string().min(1),
				offset: z.number().int().min(0).default(0),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.query(async ({ctx, input}) => {
			const bridge = ctx.livinityd!.deviceBridge

			// Phase 11 OWN-03: verify caller owns the device before returning its audit log.
			if (ctx.currentUser) {
				const device = await bridge.getDeviceFromRedis(input.deviceId)
				if (!device) throw new TRPCError({code: 'NOT_FOUND', message: 'Device not found'})
				if (device.userId !== ctx.currentUser.id) {
					throw new TRPCError({code: 'FORBIDDEN', message: 'device_not_owned'})
				}
			}

			return bridge.getAuditLog(input.deviceId, input.offset, input.limit)
		}),

	rename: privateProcedure
		.input(
			z.object({
				deviceId: z.string().min(1),
				name: z.string().min(1).max(100),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const bridge = ctx.livinityd!.deviceBridge

			// Phase 11 OWN-03: ownership check before mutation.
			if (ctx.currentUser) {
				const device = await bridge.getDeviceFromRedis(input.deviceId)
				if (!device) throw new TRPCError({code: 'NOT_FOUND', message: 'Device not found'})
				if (device.userId !== ctx.currentUser.id) {
					throw new TRPCError({code: 'FORBIDDEN', message: 'device_not_owned'})
				}
			}

			const success = await bridge.renameDevice(input.deviceId, input.name)
			if (!success) throw new TRPCError({code: 'NOT_FOUND', message: 'Device not found'})
			return {success: true}
		}),

	remove: privateProcedure
		.input(
			z.object({
				deviceId: z.string().min(1),
				confirmName: z.string().min(1),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const bridge = ctx.livinityd!.deviceBridge

			// Verify confirmName matches actual device name (safety check) AND that
			// the caller owns the device (Phase 11 OWN-03).
			const device = await bridge.getDeviceFromRedis(input.deviceId)
			if (!device) throw new TRPCError({code: 'NOT_FOUND', message: 'Device not found'})
			if (ctx.currentUser && device.userId !== ctx.currentUser.id) {
				throw new TRPCError({code: 'FORBIDDEN', message: 'device_not_owned'})
			}
			if (device.deviceName !== input.confirmName) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'Device name confirmation does not match'})
			}
			const success = await bridge.removeDevice(input.deviceId)
			if (!success) throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: 'Failed to remove device'})
			return {success: true}
		}),
})
