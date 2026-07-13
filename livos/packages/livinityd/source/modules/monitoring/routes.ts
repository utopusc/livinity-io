import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, privateProcedure, router} from '../server/trpc/trpc.js'
import {getNetworkStats, getDiskIO, getProcesses} from './monitoring.js'
import {listDrives, getDrive, runSelfTest, DEVICE_ID_RE} from './smart.js'
import {listSmartAlerts, dismissSmartAlert} from './smart-alerts.js'

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

	// Phase 313 SMART-01/SMART-04 — per-drive SMART health, nested under the
	// existing `monitoring` namespace (no new top-level namespace). Reads are
	// privateProcedure; the side-effecting self-test is adminProcedure. Every
	// deviceId input is regex-validated at THIS boundary (defense-in-depth on top
	// of smart.ts's own DEVICE_ID_RE guard) — T-313-11.
	diskHealth: router({
		list: privateProcedure.query(async () => {
			try {
				return await listDrives()
			} catch (err: any) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to list drive health',
				})
			}
		}),

		get: privateProcedure
			.input(z.object({deviceId: z.string().regex(DEVICE_ID_RE, 'invalid device id')}))
			.query(async ({input}) => {
				try {
					return await getDrive(input.deviceId)
				} catch (err: any) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: err.message || 'Failed to get drive health',
					})
				}
			}),

		// adminProcedure (T-313-12): a self-test kicks off drive firmware I/O — a
		// non-admin must not be able to trigger it.
		runSelfTest: adminProcedure
			.input(
				z.object({
					deviceId: z.string().regex(DEVICE_ID_RE, 'invalid device id'),
					mode: z.enum(['short', 'long']),
				}),
			)
			.mutation(async ({input}) => {
				try {
					return await runSelfTest(input.deviceId, input.mode)
				} catch (err: any) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: err.message || 'Failed to start self-test',
					})
				}
			}),

		// M-02 — the dismissable smart_alerts AUDIT list. listSmartAlerts /
		// dismissSmartAlert were exported + unit-tested but wired to no route, so the
		// table was write-only in production. list is privateProcedure (a read);
		// dismiss is adminProcedure (it mutates the row's dismissed_at state).
		alerts: router({
			list: privateProcedure
				.input(
					z
						.object({
							includeDismissed: z.boolean().optional(),
							limit: z.number().int().min(1).max(200).optional(),
						})
						.optional(),
				)
				.query(async ({input}) => {
					try {
						return await listSmartAlerts({
							includeDismissed: input?.includeDismissed,
							limit: input?.limit,
						})
					} catch (err: any) {
						throw new TRPCError({
							code: 'INTERNAL_SERVER_ERROR',
							message: err.message || 'Failed to list SMART alerts',
						})
					}
				}),

			dismiss: adminProcedure
				.input(z.object({id: z.string().uuid('invalid alert id')}))
				.mutation(async ({input}) => {
					try {
						return await dismissSmartAlert(input.id)
					} catch (err: any) {
						throw new TRPCError({
							code: 'INTERNAL_SERVER_ERROR',
							message: err.message || 'Failed to dismiss SMART alert',
						})
					}
				}),
		}),
	}),
})
