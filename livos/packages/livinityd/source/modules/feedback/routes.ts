// livos/packages/livinityd/source/modules/feedback/routes.ts
//
// Feedback proxy router — `feedback.submit`.
//
// The LivOS UI (browser) collects a feedback payload and calls this tRPC
// mutation. livinityd adds the box-owner API key server-side and forwards the
// payload to the CENTRAL platform (`https://livinity.io/api/feedback`). The
// browser must NEVER hold the key, so the key read + the upstream POST both
// happen here in livinityd.
//
// Key source: `process.env.LIV_API_KEY` (the robust path — mirrors
// computer-use/mcp/server.ts:271 and account/heartbeat-sender.ts which both
// authenticate to the platform via the `X-Api-Key` header).
//
// Platform base URL: `LIVINITY_PLATFORM_URL` env override → defaults to
// `https://livinity.io` (mirrors apps/apps.ts:83 so staging / mainserver
// testing can repoint the central endpoint).
//
// DEFENSIVE-BY-CONTRACT: the central /api/feedback handler must be tolerant of
// the Supabase `feedback` table being absent (operator applies the schema
// separately) — this router simply surfaces whatever upstream status/text it
// gets. We never crash livinityd over a feedback POST.
//
// SECURITY
//   - The API key flows via the `X-Api-Key` header only — never returned to
//     the UI, never echoed in error messages.
//   - 10s request timeout via AbortController so a hung platform can't pile up
//     unresolved fetch promises inside livinityd.

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {router, publicProcedure} from '../server/trpc/trpc.js'

// Env override honored for staging / mainserver testing where the platform
// lives at a different host (mirrors apps/apps.ts:83).
const LIVINITY_PLATFORM_URL =
	process.env.LIVINITY_PLATFORM_URL || 'https://livinity.io'

// 10s upstream timeout (mirrors heartbeat-sender.ts REQUEST_TIMEOUT_MS).
const REQUEST_TIMEOUT_MS = 10_000

// ── Contract (zod input) ───────────────────────────────────────────────────
// `message` is the only REQUIRED field. Everything else is optional. We accept
// ANY unicode / language in free-text fields — never reject on content, only on
// length sanity (DoS guard) + the small enums.
const feedbackInput = z.object({
	type: z
		.enum(['bug', 'feedback', 'request', 'question', 'other'])
		.default('bug'),
	title: z.string().max(300).optional(),
	area: z.string().max(200).optional(),
	severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
	// REQUIRED. Any language / unicode. Min 1 char, max ~8000 (DoS guard).
	message: z.string().min(1).max(8000),
	steps: z.string().max(8000).optional(),
	contact: z.string().max(500).optional(),
	app_version: z.string().max(100).optional(),
	user_agent: z.string().max(1000).optional(),
	page_url: z.string().max(2000).optional(),
})

export type FeedbackInput = z.infer<typeof feedbackInput>

export default router({
	/**
	 * Forward a feedback payload to the central platform with the box-owner
	 * API key. The browser supplies the payload; livinityd supplies the key.
	 */
	submit: publicProcedure
		.input(feedbackInput)
		.mutation(async ({input}) => {
			// Read the key the robust way (mirrors mcp/server.ts:271). The
			// browser never sees it — it lives only in livinityd's env.
			const apiKey = process.env.LIV_API_KEY
			if (!apiKey) {
				throw new TRPCError({
					code: 'UNAUTHORIZED',
					message:
						'Feedback unavailable: this box is not linked to a Livinity account (LIV_API_KEY missing).',
				})
			}

			const url = `${LIVINITY_PLATFORM_URL}/api/feedback`

			// Abort hung requests so a misbehaving platform can't leak fetch
			// promises inside livinityd (mirrors heartbeat-sender.ts).
			const controller = new AbortController()
			const timeoutHandle = setTimeout(
				() => controller.abort(),
				REQUEST_TIMEOUT_MS,
			)

			let response: Response
			try {
				response = await fetch(url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-Api-Key': apiKey,
						'User-Agent': 'LivOS-feedback/1',
					},
					body: JSON.stringify(input),
					signal: controller.signal,
				})
			} catch (err) {
				// Network error / timeout / DNS failure → surface as a clean
				// 500 to the tRPC error boundary so the UI can toast it.
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message:
						'Could not reach the feedback service. Please try again later.',
					cause: err,
				})
			} finally {
				clearTimeout(timeoutHandle)
			}

			if (!response.ok) {
				// Read upstream body (best-effort) so the operator can see the
				// real reason in the toast. Never includes the API key.
				let upstreamText = ''
				try {
					upstreamText = (await response.text()).slice(0, 1000)
				} catch {
					// ignore — body may be empty / unreadable
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Feedback service returned ${response.status}${
						upstreamText ? `: ${upstreamText}` : ''
					}`,
				})
			}

			// Pass the upstream JSON through when present (e.g. the created
			// feedback id); otherwise return a plain ok envelope.
			try {
				const data = (await response.json()) as Record<string, unknown>
				return {ok: true, ...data}
			} catch {
				return {ok: true}
			}
		}),
})
