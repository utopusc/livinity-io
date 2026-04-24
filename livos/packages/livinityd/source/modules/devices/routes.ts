import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {privateProcedure, router} from '../server/trpc/trpc.js'
import {authorizeDeviceAccess, recordDeviceEvent} from './index.js'
import type {DeviceBridge} from './device-bridge.js'

/**
 * Phase 11 OWN-03 + Phase 12 AUTHZ-01/02: devices router filters by
 * ctx.currentUser.id and delegates all per-device ownership checks to
 * authorizeDeviceAccess (single source of truth).
 *
 * Legacy single-user mode (no DB users yet) has ctx.currentUser === undefined;
 * in that case the router falls back to returning all devices / skipping the
 * ownership check — matching the pre-v7.0 behavior so existing deployments
 * don't break. Phase 12 preserves this fallback deliberately (see Phase 11-02
 * key-decisions "tRPC list uses privateProcedure + legacy fallback").
 */
async function ensureOwnership(
	ctx: {livinityd?: {deviceBridge: DeviceBridge} | undefined; currentUser?: {id: string}},
	deviceId: string,
	action: string,
): Promise<void> {
	// Legacy single-user fallback: no currentUser => skip check (Phase 11 decision).
	if (!ctx.currentUser) return

	const bridge = ctx.livinityd!.deviceBridge
	const auth = await authorizeDeviceAccess(bridge.redis, ctx.currentUser.id, deviceId)
	if (auth.authorized) return

	// Phase 15 AUDIT-01/02: PG-backed audit. The `action` string becomes the
	// toolName ('devices.rename', 'devices.auditLog', etc.). params is empty
	// because tRPC auth failures happen before we process the mutation body.
	void recordDeviceEvent(bridge.redis, {
		userId: ctx.currentUser.id,
		deviceId,
		toolName: action,
		params: {},
		success: false,
		error: auth.reason || 'unknown',
	})

	if (auth.reason === 'device_not_found') {
		throw new TRPCError({code: 'NOT_FOUND', message: 'Device not found'})
	}
	// device_not_owned OR missing_user (missing_user is impossible here since we
	// already returned on !ctx.currentUser above, but we map it to FORBIDDEN for safety).
	throw new TRPCError({code: 'FORBIDDEN', message: 'device_not_owned'})
}

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
			await ensureOwnership(ctx, input.deviceId, 'devices.auditLog')
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
			await ensureOwnership(ctx, input.deviceId, 'devices.rename')

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
			await ensureOwnership(ctx, input.deviceId, 'devices.remove')

			// confirmName check happens AFTER ownership (Phase 11 decision: safety UX
			// is orthogonal to authorization). Fetch device again for the name.
			const device = await bridge.getDeviceFromRedis(input.deviceId)
			if (!device) throw new TRPCError({code: 'NOT_FOUND', message: 'Device not found'})
			if (device.deviceName !== input.confirmName) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'Device name confirmation does not match'})
			}

			const success = await bridge.removeDevice(input.deviceId)
			if (!success) throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: 'Failed to remove device'})
			return {success: true}
		}),
})
