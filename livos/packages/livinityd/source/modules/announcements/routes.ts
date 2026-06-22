// livos/packages/livinityd/source/modules/announcements/routes.ts
//
// Announcements tRPC router — Phase 292.
//
//   announcements.listActive      → reads the box-local Redis cache the
//                                    announcement-poller maintains (no central
//                                    round-trip, no key needed).
//   announcements.markSeen        → key-injecting proxy → POST /api/me/announcements/seen
//   announcements.submitVote      → key-injecting proxy → POST /api/me/announcements/feedback
//   announcements.submitFeedback  → key-injecting proxy → POST /api/me/announcements/feedback
//
// The browser NEVER holds the box-owner API key: the write-back mutations read
// `process.env.LIV_API_KEY` server-side (mirrors feedback/routes.ts) and add it
// as `X-Api-Key`. The mutation INPUTS carry no key. The markSeen/submitVote/
// submitFeedback paths are added to httpOnlyPaths in ../server/trpc/common.ts so
// they survive a WS reconnect after `systemctl restart livos`.

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {router, publicProcedure} from '../server/trpc/trpc.js'

// Env override honored for staging / mainserver testing (mirrors feedback/routes.ts).
const LIVINITY_PLATFORM_URL =
	process.env.LIVINITY_PLATFORM_URL || 'https://livinity.io'

// 10s upstream timeout (mirrors feedback/routes.ts REQUEST_TIMEOUT_MS).
const REQUEST_TIMEOUT_MS = 10_000

// The box-local cache the announcement-poller writes (DEC-11).
const REDIS_KEY_CACHE = 'livos:announcements:active'

// Shared key-injecting POST to a central /api/me/announcements/* route. The
// box-owner key is read here (server-side) and never returned to the UI.
async function postToCentral(
	path: string,
	body: unknown,
): Promise<{ok: true} & Record<string, unknown>> {
	const apiKey = process.env.LIV_API_KEY
	if (!apiKey) {
		throw new TRPCError({
			code: 'UNAUTHORIZED',
			message:
				'Announcements unavailable: this box is not linked to a Livinity account (LIV_API_KEY missing).',
		})
	}

	const url = `${LIVINITY_PLATFORM_URL}${path}`
	const controller = new AbortController()
	const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

	let response: Response
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Api-Key': apiKey,
				'User-Agent': 'LivOS-announcements/1',
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		})
	} catch (err) {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'Could not reach the announcements service. Please try again later.',
			cause: err,
		})
	} finally {
		clearTimeout(timeoutHandle)
	}

	if (!response.ok) {
		let upstreamText = ''
		try {
			upstreamText = (await response.text()).slice(0, 1000)
		} catch {
			// body may be empty / unreadable
		}
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: `Announcements service returned ${response.status}${
				upstreamText ? `: ${upstreamText}` : ''
			}`,
		})
	}

	try {
		const data = (await response.json()) as Record<string, unknown>
		return {ok: true, ...data}
	} catch {
		return {ok: true}
	}
}

export default router({
	/**
	 * Read the active announcements from the box-local Redis cache (maintained
	 * by the announcement-poller every 60s). No central call, no key required.
	 */
	listActive: publicProcedure.query(async ({ctx}) => {
		try {
			const redis = ctx.livinityd?.ai?.redis
			if (!redis) return []
			const raw = await redis.get(REDIS_KEY_CACHE)
			if (!raw) return []
			const parsed = JSON.parse(raw) as unknown
			return Array.isArray(parsed) ? parsed : []
		} catch {
			// Redis down / parse error → degrade to "no announcements".
			return []
		}
	}),

	/** Report the user has seen (or dismissed) an announcement. */
	markSeen: publicProcedure
		.input(
			z.object({
				announcement_id: z.string().min(1),
				dismissed: z.boolean().optional(),
			}),
		)
		.mutation(async ({input}) => postToCentral('/api/me/announcements/seen', input)),

	/** Submit a poll vote for a block. */
	submitVote: publicProcedure
		.input(
			z.object({
				announcement_id: z.string().min(1),
				block_id: z.string().optional(),
				vote_option: z.string().min(1).max(256),
			}),
		)
		.mutation(async ({input}) => postToCentral('/api/me/announcements/feedback', input)),

	/** Submit free-text feedback for a block. */
	submitFeedback: publicProcedure
		.input(
			z.object({
				announcement_id: z.string().min(1),
				block_id: z.string().optional(),
				free_text: z.string().min(1).max(8000),
			}),
		)
		.mutation(async ({input}) => postToCentral('/api/me/announcements/feedback', input)),
})
