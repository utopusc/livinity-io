// Phase 92-09 — `webapp` tRPC namespace.
//
// Single procedure for v33 Phase 92:
//   webapp.extractMetadata({url}) → MetadataResult
//
// Wired in to the root router under namespace `webapp` from
// server/trpc/index.ts. The procedure path `webapp.extractMetadata` is
// registered in `httpOnlyPaths` (server/trpc/common.ts) so the React
// client routes the call over HTTP — fetch can take up to 8s on a clean
// cache miss and we don't want to risk a half-broken WS dropping the
// response after a `systemctl restart livos` (memory pitfall B-12 / X-04).
//
// CRUD procedures (`webapp.create / list / delete / update`) are deferred
// to P94 with the desktop UI dialog — see CONTEXT.md Out-of-scope.

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {privateProcedure, router} from '../server/trpc/trpc.js'

import {
	extractMetadata as runExtractMetadata,
	ExtractionError,
	type ExtractionErrorCode,
	type MetadataResult,
} from './metadata-extractor.js'
import {
	WebappCapExceededError,
	WindowNotFoundError,
} from './window-manager.js'

// Map ExtractionError codes → tRPC TRPCError codes per CONTEXT gray-area #7.
function trpcErrorForExtraction(code: ExtractionErrorCode): {
	code: 'BAD_REQUEST' | 'TIMEOUT' | 'NOT_FOUND' | 'INTERNAL_SERVER_ERROR' | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE'
} {
	switch (code) {
		case 'BAD_REQUEST':
			return {code: 'BAD_REQUEST'}
		case 'TIMEOUT':
			return {code: 'TIMEOUT'}
		case 'TOO_MANY_REDIRECTS':
		case 'NETWORK_ERROR':
		case 'BAD_STATUS':
			return {code: 'INTERNAL_SERVER_ERROR'}
		case 'NOT_HTML':
			return {code: 'UNSUPPORTED_MEDIA_TYPE'}
		case 'RESPONSE_TOO_LARGE':
			return {code: 'PAYLOAD_TOO_LARGE'}
		default:
			return {code: 'INTERNAL_SERVER_ERROR'}
	}
}

const extractMetadataInput = z.object({
	url: z.string().url().max(2048),
})

// Phase 93-11 — webapp.window.* sub-router.
// Lives under the existing P92 `webapp` namespace (singular) — the plan
// referenced `webapps.window.*` but the actual P92 namespace is `webapp`,
// so we extend in place for transport consistency. httpOnlyPaths gets the
// four `webapp.window.*` paths via this router's mount.
const windowSpawnInput = z.object({
	webappId: z.string().min(1).max(64),
	url: z.string().url().max(2048),
	expectedTitle: z.string().max(256).optional(),
})

const windowFocusInput = z.object({webappId: z.string().min(1).max(64)})
const windowCloseInput = z.object({
	webappId: z.string().min(1).max(64),
	killWindow: z.boolean().optional(),
})

const windowRouter = router({
	spawn: privateProcedure.input(windowSpawnInput).mutation(async ({ctx, input}) => {
		const userId = ctx.currentUser?.id
		if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
		const wm = ctx.livinityd?.webappWindowManager
		if (!wm) {
			throw new TRPCError({code: 'SERVICE_UNAVAILABLE', message: 'WebAppWindowManager not initialised'})
		}
		ctx.logger?.info?.(`webapp.window.spawn user=${userId} webappId=${input.webappId}`)
		try {
			return await wm.spawn({
				userId,
				webappId: input.webappId,
				url: input.url,
				expectedTitle: input.expectedTitle,
			})
		} catch (err) {
			if (err instanceof WindowNotFoundError) {
				throw new TRPCError({code: 'NOT_FOUND', message: err.message, cause: err})
			}
			if (err instanceof WebappCapExceededError) {
				throw new TRPCError({
					code: 'TOO_MANY_REQUESTS',
					message: `webapp cap exceeded (limit ${err.limit})`,
					cause: err,
				})
			}
			throw err
		}
	}),

	focus: privateProcedure.input(windowFocusInput).mutation(async ({ctx, input}) => {
		const userId = ctx.currentUser?.id
		if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
		const wm = ctx.livinityd?.webappWindowManager
		if (!wm) {
			throw new TRPCError({code: 'SERVICE_UNAVAILABLE'})
		}
		ctx.logger?.info?.(`webapp.window.focus user=${userId} webappId=${input.webappId}`)
		const r = await wm.focus({webappId: input.webappId, userId})
		if (!r.ok && r.code === 'NOT_FOUND') {
			throw new TRPCError({code: 'NOT_FOUND'})
		}
		return r
	}),

	close: privateProcedure.input(windowCloseInput).mutation(async ({ctx, input}) => {
		const userId = ctx.currentUser?.id
		if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
		const wm = ctx.livinityd?.webappWindowManager
		if (!wm) {
			throw new TRPCError({code: 'SERVICE_UNAVAILABLE'})
		}
		ctx.logger?.info?.(`webapp.window.close user=${userId} webappId=${input.webappId}`)
		const r = await wm.close({
			webappId: input.webappId,
			userId,
			killWindow: input.killWindow,
		})
		if (!r.ok) throw new TRPCError({code: 'NOT_FOUND'})
		return r
	}),

	list: privateProcedure.query(async ({ctx}) => {
		const userId = ctx.currentUser?.id
		if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
		const wm = ctx.livinityd?.webappWindowManager
		if (!wm) return []
		return wm.list({userId})
	}),
})

const webappRouter = router({
	extractMetadata: privateProcedure
		.input(extractMetadataInput)
		.query(async ({ctx, input}): Promise<MetadataResult> => {
			const isAdmin = ctx.currentUser?.role === 'admin'
			try {
				return await runExtractMetadata({url: input.url, isAdmin})
			} catch (err) {
				if (err instanceof ExtractionError) {
					const mapped = trpcErrorForExtraction(err.code)
					throw new TRPCError({
						code: mapped.code,
						message: err.message,
						cause: err,
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err instanceof Error ? err.message : 'Unknown extraction failure',
					cause: err,
				})
			}
		}),
	// Phase 93-11 — window manager sub-router (webapp.window.*)
	window: windowRouter,
})

export default webappRouter
