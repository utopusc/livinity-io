import {type CreateExpressContextOptions} from '@trpc/server/adapters/express'
import type Livinityd from '../../../index.js'
import type {CurrentUser} from '../../database/index.js'

export const createContextExpress = ({req, res}: CreateExpressContextOptions) => {
	const livinityd = req.app.get('livinityd') as Livinityd
	const logger = req.app.get('logger') as Livinityd['logger']
	// Phase 346-02 (D-346-7) — MCP attribution. Purely attributive, NOT authz:
	// this header is only meaningful on the loopback /trpc call an MCP tool
	// handler makes (Plan 03), which ALSO carries LIV_API_KEY for authentication.
	// A direct external caller cannot reach /trpc without LIV_API_KEY
	// (loopback-trust), so spoofing this header requires already being full-admin
	// (T-346-10 accept). It surfaces mcpKeyId into the audit row so MCP-initiated
	// actions are distinguishable from a human admin.
	const mcpKeyIdHeader = req.headers['x-mcp-key-id']
	return {
		...createContext({livinityd, logger}),
		transport: 'express' as const,
		request: req,
		response: res,
		mcpKeyId: typeof mcpKeyIdHeader === 'string' ? mcpKeyIdHeader : undefined,
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
				} else if (payload) {
					// Backups-v2 P0 (review F1): legacy (no-userId) tokens must get the
					// same admin mapping over ws that isAuthenticated gives them over
					// HTTP — otherwise every adminProcedure is FORBIDDEN on legacy
					// single-user sessions riding the ws link (all authed UI calls do).
					try {
						const {getAdminUser} = await import('../../database/index.js')
						const adminUser = await getAdminUser()
						if (adminUser) {
							ctx.currentUser = {
								id: adminUser.id,
								username: adminUser.username,
								role: adminUser.role,
							}
						} else {
							ctx.legacySingleUser = true
						}
					} catch {
						// Genuine single-user mode (no DB) — explicit admin-equivalent
						// flag, mirroring isAuthenticated's Phase 256-04 fix E semantics.
						ctx.legacySingleUser = true
					}
				}
			}
		} catch {
			// Non-fatal: an undecodable token just yields an unauthenticated ctx
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
		// Phase 256-04 (LIVOS-004 / fix E): explicit admin-equivalent marker.
		// Set by isAuthenticated ONLY for genuine legacy single-user mode (no
		// DB admin) and the X-Api-Key service-token no-DB path. requireRole
		// admits an absent currentUser ONLY when this flag is true — it never
		// infers admin from a merely unresolved currentUser.
		legacySingleUser: undefined as boolean | undefined,
		// Phase 346-02 (D-346-7): MCP-key attribution. Defaults undefined so the
		// type flows to BOTH express + ws contexts and non-MCP traffic is
		// byte-identical; createContextExpress overrides it from the
		// x-mcp-key-id header when present.
		mcpKeyId: undefined as string | undefined,
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
