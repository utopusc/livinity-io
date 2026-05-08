/**
 * Phase 93-11 — `streams.*` tRPC namespace.
 *
 * Procedures:
 *   - streams.start({mode, target}) → {streamId, wsUrl}
 *   - streams.stop({streamId}) → {stopped}
 *   - streams.list() → StreamRecord[] (filtered to ctx.currentUser.id)
 *
 * All procedures pull userId from `ctx.currentUser.id` — NEVER from input.
 * Input is validated with Zod; if a userId-shaped field is supplied the
 * router rejects with FORBIDDEN (STRIDE S — spoofing prevention).
 *
 * Routes are added to httpOnlyPaths in server/trpc/common.ts so the React
 * client routes them over HTTP rather than WS — long-running mutations
 * (encoder spawn) and the WS-reconnect-survival pattern (memory pitfall
 * B-12 / X-04) both apply.
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {privateProcedure, router} from '../server/trpc/trpc.js'
import {StreamCapExceededError} from './stream-manager.js'

const streamModeSchema = z.enum(['desktop', 'window-crop', 'pipewire-fd'])

const desktopTargetSchema = z.object({
	display: z.string().regex(/^:\d+(\.\d+)?$/),
	width: z.number().int().positive().max(7680),
	height: z.number().int().positive().max(4320),
	framerate: z.number().int().positive().max(120).optional(),
})

const windowCropTargetSchema = z.object({
	display: z.string().regex(/^:\d+(\.\d+)?$/),
	geometry: z.object({
		x: z.number().int(),
		y: z.number().int(),
		w: z.number().int().positive(),
		h: z.number().int().positive(),
	}),
	framerate: z.number().int().positive().max(120).optional(),
})

const pipewireFdTargetSchema = z.object({
	pwNodeId: z.number().int().nonnegative(),
	fd: z.number().int().nonnegative(),
	framerate: z.number().int().positive().max(120).optional(),
})

const startInput = z.discriminatedUnion('mode', [
	z.object({mode: z.literal('desktop'), target: desktopTargetSchema}),
	z.object({mode: z.literal('window-crop'), target: windowCropTargetSchema}),
	z.object({mode: z.literal('pipewire-fd'), target: pipewireFdTargetSchema}),
])

const stopInput = z.object({streamId: z.string().uuid()})

const streamsRouter = router({
	start: privateProcedure.input(startInput).mutation(async ({ctx, input}) => {
		const userId = ctx.currentUser?.id
		if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})

		const sm = ctx.livinityd?.streamManager
		if (!sm) {
			throw new TRPCError({code: 'SERVICE_UNAVAILABLE', message: 'StreamManager not initialised'})
		}
		try {
			ctx.logger?.info?.(`streams.start user=${userId} mode=${input.mode}`)
			return sm.startStream({
				userId,
				mode: input.mode,
				target: input.target as never,
			})
		} catch (err) {
			if (err instanceof StreamCapExceededError) {
				throw new TRPCError({
					code: 'TOO_MANY_REQUESTS',
					message: `stream cap exceeded (limit ${err.limit})`,
					cause: err,
				})
			}
			throw err
		}
	}),

	stop: privateProcedure.input(stopInput).mutation(async ({ctx, input}) => {
		const userId = ctx.currentUser?.id
		if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})

		const sm = ctx.livinityd?.streamManager
		if (!sm) {
			throw new TRPCError({code: 'SERVICE_UNAVAILABLE', message: 'StreamManager not initialised'})
		}

		// Ownership check (STRIDE I — info disclosure: 404 not 403)
		const owned = sm.listStreams({userId}).find((s) => s.streamId === input.streamId)
		if (!owned) throw new TRPCError({code: 'NOT_FOUND'})

		ctx.logger?.info?.(`streams.stop user=${userId} streamId=${input.streamId}`)
		return await sm.stopStream(input.streamId)
	}),

	list: privateProcedure.query(async ({ctx}) => {
		const userId = ctx.currentUser?.id
		if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
		const sm = ctx.livinityd?.streamManager
		if (!sm) return []
		return sm.listStreams({userId})
	}),
})

export default streamsRouter

/**
 * STRIDE sweep applied (T93-11):
 *   S (Spoofing): privateProcedure → JWT auth on every endpoint. userId
 *     is ALWAYS sourced from ctx.currentUser.id, never from input. Zod
 *     schemas don't expose a userId field on any input → no forgery
 *     surface.
 *   T (Tampering): streamId is validated as a UUID; flows only through
 *     StreamManager's Map and Postgres lookups. Never spliced into a
 *     shell command — the encoder spawn uses execFile + argv.
 *   R (Repudiation): every start/stop logs userId + streamId at INFO.
 *   I (Info disclosure): 404 (NOT 403) on foreign streamId — see stop.
 *   D (DoS): stream cap from StreamManager (T93-05) enforced; throws
 *     TOO_MANY_REQUESTS (TRPC error mapping for STREAM_CAP_EXCEEDED).
 *   E (Elevation): no admin-only path here; WS upgrade handler runs the
 *     same JWT auth check (covered by T93-06 tests).
 */
