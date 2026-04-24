import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from '../server/trpc/trpc.js'
import {recordDeviceEvent} from './index.js'
import {getPool} from '../database/index.js'

/**
 * Phase 16 ADMIN-01 + ADMIN-02: admin-only cross-user device management.
 *
 * adminListAll — returns every cached device across every user, enriched with the owner's
 * username from the local users table. Member-role callers receive tRPC FORBIDDEN before
 * the handler runs (adminProcedure gate).
 *
 * adminForceDisconnect — sends an admin_force_disconnect tunnel message to the relay,
 * which closes the matching DeviceConnection WebSocket with code 4403 reason
 * 'admin_disconnect'. Crosses user boundaries by design; attributed to the admin's
 * user_id in the device_audit_log.
 *
 * Both operations append exactly one row to device_audit_log (Phase 15 writer):
 *   list_all       → tool_name='admin.list_all', success=true, params={count}
 *   force_disconnect success → tool_name='admin.force_disconnect', success=true, params={deviceId, targetUserId}
 *   force_disconnect miss    → tool_name='admin.force_disconnect', success=false, error='device_not_connected'
 */

interface AdminDeviceRow {
	deviceId: string
	deviceName: string
	platform: string
	ownerUserId: string
	ownerUsername: string | null // null if user row was deleted (shouldn't happen — FK ON DELETE RESTRICT)
	online: boolean
	connectedAt: number
}

export default router({
	adminListAll: adminProcedure.query(async ({ctx}) => {
		const bridge = ctx.livinityd!.deviceBridge
		const adminUserId = ctx.currentUser!.id // adminProcedure guarantees currentUser exists

		// 1) Pull all cached devices from Redis.
		const devices = await bridge.getAllDevicesFromRedis()

		// 2) Batch-resolve usernames from Postgres (local livinityd users table).
		//    Empty-set shortcut avoids a spurious `WHERE id IN ()` which PG rejects.
		const userIds = [...new Set(devices.map((d) => d.userId).filter(Boolean))]
		let usernameById = new Map<string, string>()
		const pool = getPool()
		if (pool && userIds.length > 0) {
			const {rows} = await pool.query<{id: string; username: string}>(
				`SELECT id, username FROM users WHERE id = ANY($1::uuid[])`,
				[userIds],
			)
			usernameById = new Map(rows.map((r) => [r.id, r.username]))
		}

		// 3) Enrich + shape the response.
		const enriched: AdminDeviceRow[] = devices.map((d) => ({
			deviceId: d.deviceId,
			deviceName: d.deviceName,
			platform: d.platform,
			ownerUserId: d.userId,
			ownerUsername: usernameById.get(d.userId) ?? null,
			online: d.online,
			connectedAt: d.connectedAt,
		}))

		// 4) Phase 16 audit: one row per admin query, attributed to the admin user.
		//    Fire-and-forget; never blocks the response.
		void recordDeviceEvent(bridge.redis, {
			userId: adminUserId,
			deviceId: '', // no single device — this is a fleet query
			toolName: 'admin.list_all',
			params: {count: enriched.length},
			success: true,
			error: null,
		})

		return {devices: enriched}
	}),

	adminForceDisconnect: adminProcedure
		.input(z.object({deviceId: z.string().min(1)}))
		.mutation(async ({ctx, input}) => {
			const bridge = ctx.livinityd!.deviceBridge
			const adminUserId = ctx.currentUser!.id

			// Resolve the device's owner from the Redis cache — required for the relay-side
			// DeviceRegistry.getDevice(userId, deviceId) lookup. If Redis has no entry, the
			// device is already offline — audit the attempt and return a clear error.
			const device = await bridge.getDeviceFromRedis(input.deviceId)
			if (!device) {
				void recordDeviceEvent(bridge.redis, {
					userId: adminUserId,
					deviceId: input.deviceId,
					toolName: 'admin.force_disconnect',
					params: {deviceId: input.deviceId},
					success: false,
					error: 'device_not_connected',
				})
				throw new TRPCError({code: 'NOT_FOUND', message: 'Device is not currently connected'})
			}

			// Fire the tunnel message — relay will close the WS with 4403 'admin_disconnect'.
			bridge.forceDisconnect(device.userId, input.deviceId)

			void recordDeviceEvent(bridge.redis, {
				userId: adminUserId,
				deviceId: input.deviceId,
				toolName: 'admin.force_disconnect',
				params: {deviceId: input.deviceId, targetUserId: device.userId},
				success: true,
				error: null,
			})

			return {success: true, targetUserId: device.userId}
		}),
})
