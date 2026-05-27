/**
 * Phase 221 T1 — `auth.claude.*` tRPC proxy router.
 *
 * Operator quote 2026-05-27: "Claude Auth mod geri eklenmisti ya openclaw a
 * onu geri getirebilir misin? UI dan auth yapmak istiyorum."
 *
 * The Claude OAuth (PKCE) flow lives in liv-core's ClaudeProvider
 * (`liv/packages/core/src/providers/claude.ts`) and is exposed as Express
 * endpoints on port 3200. This router proxies them through livinityd's
 * tRPC so the claw-client UI can call them with the same `callMutation/
 * callQuery` plumbing it already uses for every other admin action.
 *
 * Four admin-gated procedures:
 *
 *   - auth.claude.status       (query)    → {authenticated, method}
 *   - auth.claude.startLogin   (mutation) → {url?, alreadyAuthenticated?, error?}
 *   - auth.claude.submitCode   (mutation) → {success, error?}
 *   - auth.claude.logout       (mutation) → {ok}
 *
 * Pattern mirrors `auth.xai.*` (xai-auth-router.ts) for consistency. The
 * router needs no Redis / FS — every call is a fire-and-forget HTTP fetch
 * against liv-core. liv-core handles the PKCE state + writes the credentials
 * file to `/root/.claude/.credentials.json` (per BROKER_FORCE_ROOT_HOME).
 *
 * D-221-SACRED — sdk-agent-runner.ts (the SHA-locked subscription runner)
 * is NOT touched. Once the credentials file is on disk, the existing CLI
 * spawn path picks it up automatically on the next chat turn.
 */
import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from './trpc.js'

const LIV_CORE_URL = process.env.LIV_API_URL || 'http://localhost:3200'
const LIV_API_KEY = process.env.LIV_API_KEY ?? ''

async function callLivCore<T>(
	method: 'GET' | 'POST',
	path: string,
	body?: unknown,
): Promise<T> {
	const headers: Record<string, string> = {
		'content-type': 'application/json',
	}
	if (LIV_API_KEY) headers['X-API-Key'] = LIV_API_KEY
	let res: Response
	try {
		res = await fetch(`${LIV_CORE_URL}${path}`, {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined,
			signal: AbortSignal.timeout(15_000),
		})
	} catch (err) {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: `liv-core unreachable (${LIV_CORE_URL}${path}): ${(err as Error).message}`,
		})
	}
	const text = await res.text()
	let data: unknown
	try {
		data = text.length > 0 ? JSON.parse(text) : {}
	} catch {
		data = {raw: text}
	}
	if (!res.ok) {
		const msg = (data as {error?: string})?.error ?? `liv-core HTTP ${res.status}`
		throw new TRPCError({
			code: res.status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_SERVER_ERROR',
			message: msg,
		})
	}
	return data as T
}

export const claudeAuthRouter = router({
	// ── status ─────────────────────────────────────────────────────────────
	status: adminProcedure.query(async () => {
		return callLivCore<{
			authenticated: boolean
			method: string
			provider: string
		}>('GET', '/api/claude/status')
	}),

	// ── startLogin ─────────────────────────────────────────────────────────
	// Returns the OAuth authorize URL. UI opens it in a new tab; operator
	// completes the flow on claude.ai; the callback page renders an
	// authorization code; operator pastes it back into the UI which calls
	// `submitCode` below.
	startLogin: adminProcedure.mutation(async () => {
		return callLivCore<{
			url?: string
			alreadyAuthenticated?: boolean
			error?: string
		}>('POST', '/api/claude/start-login')
	}),

	// ── submitCode ─────────────────────────────────────────────────────────
	submitCode: adminProcedure
		.input(z.object({code: z.string().trim().min(1).max(1024)}))
		.mutation(async ({input}) => {
			return callLivCore<{success: boolean; error?: string}>(
				'POST',
				'/api/claude/submit-code',
				{code: input.code},
			)
		}),

	// ── logout ─────────────────────────────────────────────────────────────
	logout: adminProcedure.mutation(async () => {
		return callLivCore<{ok?: boolean; success?: boolean}>(
			'POST',
			'/api/claude/logout',
		)
	}),
})

export type ClaudeAuthRouter = typeof claudeAuthRouter
