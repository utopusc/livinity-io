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
})

export default webappRouter
