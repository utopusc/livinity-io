import {type CreateExpressContextOptions} from '@trpc/server/adapters/express'
import type Livinityd from '../../../index.js'
import type {CurrentUser} from '../../database/index.js'

export const createContextExpress = ({req, res}: CreateExpressContextOptions) => {
	const livinityd = req.app.get('livinityd') as Livinityd
	const logger = req.app.get('logger') as Livinityd['logger']
	return {
		...createContext({livinityd, logger}),
		transport: 'express' as const,
		request: req,
		response: res,
	}
}

export const createContextWss = async ({livinityd, logger, req}: {livinityd: Livinityd; logger: Livinityd['logger']; req?: any}) => {
	const ctx = {
		...createContext({livinityd, logger}),
		transport: 'ws' as const,
	}

	// Extract user info from the JWT in the WebSocket URL query params.
	// The upgrade handler already verified the token, but we need to decode
	// the payload here to populate ctx.currentUser for per-user features.
	if (req?.url) {
		try {
			const {searchParams} = new URL(`https://localhost${req.url}`)
			const token = searchParams.get('token')
			if (token) {
				const payload = await livinityd.server.verifyToken(token)
				if (payload && typeof payload === 'object' && 'userId' in payload && payload.userId) {
					const {findUserById} = await import('../../database/index.js')
					const dbUser = await findUserById(payload.userId as string)
					if (dbUser && dbUser.isActive) {
						ctx.currentUser = {
							id: dbUser.id,
							username: dbUser.username,
							role: dbUser.role,
						}
					}
				}
			}
		} catch {
			// Non-fatal: legacy tokens without userId still work
		}
	}

	return ctx
}

const createContext = ({livinityd, logger}: {livinityd: Livinityd; logger: Livinityd['logger']}) => {
	const server = livinityd.server
	const user = livinityd.user
	const appStore = livinityd.appStore
	const apps = livinityd.apps
	return {
		livinityd,
		server,
		user,
		appStore,
		apps,
		logger,
		dangerouslyBypassAuthentication: false,
		currentUser: undefined as CurrentUser | undefined,
	}
}

// Helper that flattens the resulting intersection so the IDE shows
// a single object type instead of A & B & C …
type Simplify<T> = {[K in keyof T]: T[K]}

/**
 * Merge two object types:
 * - Keys that exist in **both** A and B are **required** and their type is `A[K] | B[K]`
 * - Keys that exist in **only one** side become **optional**
 */
type Merge<A, B> = Simplify<
	// 1. keys in both → required, union of the two property types
	{[K in keyof A & keyof B]: A[K] | B[K]} & {[K in Exclude<keyof A, keyof B>]?: A[K]} & {
		// 2. keys only in A → optional // 3. keys only in B → optional
		[K in Exclude<keyof B, keyof A>]?: B[K]
	}
>

// Combined type that satisfies both the websocket and express contexts
type ContextWss = ReturnType<typeof createContextWss>
type ContextExpress = ReturnType<typeof createContextExpress>
export type Context = Merge<ContextWss, ContextExpress>
