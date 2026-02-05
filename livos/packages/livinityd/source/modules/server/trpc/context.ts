import {type CreateExpressContextOptions} from '@trpc/server/adapters/express'
import type Livinityd from '../../../index.js'

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

export const createContextWss = ({livinityd, logger}: {livinityd: Livinityd; logger: Livinityd['logger']}) => {
	return {
		...createContext({livinityd, logger}),
		transport: 'ws' as const,
	}
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
