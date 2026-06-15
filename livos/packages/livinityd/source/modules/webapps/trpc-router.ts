// Phase 92-09 + Phase 94-01 — `webapp` tRPC namespace.
//
// P92 shipped:
//   webapp.extractMetadata({url}) → MetadataResult
//
// P93 added the window sub-router:
//   webapp.window.{spawn, focus, close, list}
//
// P94 adds CRUD on the persisted `webapps` Postgres table (mounted on the
// same singular `webapp` namespace per CONTEXT — extend in place rather
// than introducing a parallel `webapps.*` namespace):
//   webapp.create  ({url, title?, faviconUrl?, description?}) → WebApp (idempotent on (userId, url))
//   webapp.list    () → WebApp[]
//   webapp.delete  ({id}) → {ok: true}
//   webapp.update  ({id, patch}) → WebApp
//
// All four CRUD paths are registered in `httpOnlyPaths` (server/trpc/common.ts)
// for the same WS-reconnect-survival reasons as the rest of the long-lived
// mutation cluster (memory pitfall B-12 / X-04).

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {privateProcedure, router} from '../server/trpc/trpc.js'
import {getPool} from '../database/index.js'

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
import {
	createWebApp,
	listWebApps,
	deleteWebApp,
	updateWebApp,
	findWebAppById,
	type WebAppRow,
} from './webapps-repository.js'
import {
	findWebAppAgentSession,
	upsertWebAppAgentSession,
	type WebAppAgentSessionRow,
} from './webapp-agent-sessions-repository.js'
import skillsRouter from './skills-router.js'

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
	// WS2 (WebApp multi-instance) — per-window id (the UI windowId). Each window
	// of the same webappId spawns its own Xvfb/Chrome/stream. Omitted → backend
	// keys on webappId (legacy single-instance).
	instanceId: z.string().min(1).max(128).optional(),
})

const windowFocusInput = z.object({webappId: z.string().min(1).max(64)})
const windowCloseInput = z.object({
	webappId: z.string().min(1).max(64),
	killWindow: z.boolean().optional(),
	// WS2 — close a specific window instance (mirrors spawn's instanceId).
	instanceId: z.string().min(1).max(128).optional(),
})

const windowRouter = router({
	spawn: privateProcedure.input(windowSpawnInput).mutation(async ({ctx, input}) => {
		const userId = ctx.currentUser?.id
		if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
		const wm = ctx.livinityd?.webappWindowManager
		if (!wm) {
			throw new TRPCError({code: 'SERVICE_UNAVAILABLE', message: 'WebAppWindowManager not initialised'})
		}
		ctx.logger?.log?.(
			`webapp.window.spawn user=${userId} webappId=${input.webappId} instanceId=${input.instanceId ?? '(default)'}`,
		)
		try {
			return await wm.spawn({
				userId,
				webappId: input.webappId,
				url: input.url,
				expectedTitle: input.expectedTitle,
				instanceId: input.instanceId,
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
		ctx.logger?.log?.(`webapp.window.focus user=${userId} webappId=${input.webappId}`)
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
		ctx.logger?.log?.(
			`webapp.window.close user=${userId} webappId=${input.webappId} instanceId=${input.instanceId ?? '(default)'}`,
		)
		const r = await wm.close({
			webappId: input.webappId,
			userId,
			killWindow: input.killWindow,
			instanceId: input.instanceId,
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

// Phase 94-01 — CRUD inputs.
//
// `description` is accepted on the input surface for forward-compat with the
// dialog UI (which extracts and displays description in the preview card),
// but the current `webapps` table has no description column — the value is
// silently dropped at the repo layer. v34 may add a column + migration if
// the persistent description becomes a real product surface.
const webappCreateInput = z.object({
	url: z.string().url().max(2048),
	title: z.string().max(512).nullable().optional(),
	faviconUrl: z.string().url().max(2048).nullable().optional(),
	description: z.string().max(2048).nullable().optional(),
})

const webappUpdateInput = z.object({
	id: z.string().uuid(),
	patch: z.object({
		title: z.string().max(512).nullable().optional(),
		faviconUrl: z.string().url().max(2048).nullable().optional(),
		description: z.string().max(2048).nullable().optional(),
	}),
})

const webappDeleteInput = z.object({
	id: z.string().uuid(),
})

// Public output shape — exported via the router type so the React client
// can reference it. `description` is always null on the wire today (no DB
// column) but kept on the surface for forward-compat with the dialog.
export type WebApp = {
	id: string
	userId: string
	url: string
	title: string | null
	faviconUrl: string | null
	description: string | null
	position: number
	createdAt: Date
}

function rowToWebApp(row: WebAppRow): WebApp {
	return {
		id: row.id,
		userId: row.userId,
		url: row.url,
		title: row.title,
		faviconUrl: row.faviconUrl,
		description: null,
		position: row.position,
		createdAt: row.createdAt,
	}
}

function requirePool() {
	const pool = getPool()
	if (!pool) {
		throw new TRPCError({code: 'SERVICE_UNAVAILABLE', message: 'database not initialised'})
	}
	return pool
}

// Phase 95-05 — webapp.agent.session.* sub-router.
//
// Per-WebApp agent run state. The hook (use-webapp-agent.ts) reads on mount
// and upserts after the first sendMessage produces a runId, then debounces
// last_seen_idx upserts on each chunk processed (D-95-09 SSE reconnect).
//
// Both procedures verify ownership at the SQL layer — queries are scoped by
// ctx.currentUser.id. A different user cannot read or upsert another user's
// session row even if they know the webappId.
const sessionGetInput = z.object({webappId: z.string().uuid()})

const sessionUpsertInput = z.object({
	webappId: z.string().uuid(),
	runId: z.string().min(1).max(256).nullable().optional(),
	lastSeenIdx: z.number().int().min(-1).optional(),
})

type SessionWireShape = {
	id: string
	userId: string
	webappId: string
	runId: string | null
	createdAt: Date
	lastActiveAt: Date
	lastSeenIdx: number
}

function rowToSessionWire(row: WebAppAgentSessionRow): SessionWireShape {
	return {
		id: row.id,
		userId: row.userId,
		webappId: row.webappId,
		runId: row.runId,
		createdAt: row.createdAt,
		lastActiveAt: row.lastActiveAt,
		lastSeenIdx: row.lastSeenIdx,
	}
}

const sessionRouter = router({
	get: privateProcedure
		.input(sessionGetInput)
		.query(async ({ctx, input}): Promise<SessionWireShape | null> => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			const pool = requirePool()
			// Confirm webapp ownership before returning the session — prevents
			// guessing webappIds across users.
			const webapp = await findWebAppById(pool, userId, input.webappId)
			if (!webapp) return null
			const row = await findWebAppAgentSession(pool, userId, input.webappId)
			return row ? rowToSessionWire(row) : null
		}),

	upsert: privateProcedure
		.input(sessionUpsertInput)
		.mutation(async ({ctx, input}): Promise<SessionWireShape> => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			const pool = requirePool()
			// Confirm webapp ownership before writing the session — defense in
			// depth on top of the FK cascade.
			const webapp = await findWebAppById(pool, userId, input.webappId)
			if (!webapp) throw new TRPCError({code: 'NOT_FOUND', message: 'webapp not found'})
			const row = await upsertWebAppAgentSession(pool, {
				userId,
				webappId: input.webappId,
				...('runId' in input ? {runId: input.runId ?? null} : {}),
				...('lastSeenIdx' in input ? {lastSeenIdx: input.lastSeenIdx ?? -1} : {}),
			})
			return rowToSessionWire(row)
		}),
})

const agentRouter = router({
	session: sessionRouter,
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

	// Phase 94-01 — CRUD on the persisted `webapps` Postgres table.
	create: privateProcedure
		.input(webappCreateInput)
		.mutation(async ({ctx, input}): Promise<WebApp> => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			const pool = requirePool()
			const row = await createWebApp(pool, {
				userId,
				url: input.url,
				title: input.title ?? null,
				faviconUrl: input.faviconUrl ?? null,
			})
			ctx.logger?.log?.(`webapp.create user=${userId} id=${row.id} url=${row.url}`)
			return rowToWebApp(row)
		}),

	list: privateProcedure.query(async ({ctx}): Promise<WebApp[]> => {
		const userId = ctx.currentUser?.id
		if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
		const pool = requirePool()
		const rows = await listWebApps(pool, userId)
		return rows.map(rowToWebApp)
	}),

	delete: privateProcedure
		.input(webappDeleteInput)
		.mutation(async ({ctx, input}): Promise<{ok: true}> => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			const pool = requirePool()
			const ok = await deleteWebApp(pool, userId, input.id)
			if (!ok) throw new TRPCError({code: 'NOT_FOUND'})
			ctx.logger?.log?.(`webapp.delete user=${userId} id=${input.id}`)
			return {ok: true}
		}),

	update: privateProcedure
		.input(webappUpdateInput)
		.mutation(async ({ctx, input}): Promise<WebApp> => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			const pool = requirePool()
			// Only include keys actually present on the wire — otherwise an
			// undefined value would be passed to the repo and the explicit
			// `'title' in patch` check there would treat it as "clear to null".
			const repoPatch: {title?: string | null; faviconUrl?: string | null} = {}
			if ('title' in input.patch) repoPatch.title = input.patch.title ?? null
			if ('faviconUrl' in input.patch) repoPatch.faviconUrl = input.patch.faviconUrl ?? null
			const updated = await updateWebApp(pool, userId, input.id, repoPatch)
			if (!updated) {
				const exists = await findWebAppById(pool, userId, input.id)
				if (!exists) throw new TRPCError({code: 'NOT_FOUND'})
				return rowToWebApp(exists)
			}
			ctx.logger?.log?.(`webapp.update user=${userId} id=${updated.id}`)
			return rowToWebApp(updated)
		}),

	// Phase 93-11 — window manager sub-router (webapp.window.*)
	window: windowRouter,

	// Phase 270-RFB — the webapp.input.* sub-router (click/move/keypress/
	// type/scroll → xdotool dispatch) was REMOVED. WebApp streams now use
	// real RFB input (noVNC viewOnly:false) straight into the per-WebApp
	// Xvfb via x11vnc XTest — same model as native app streams. The
	// client-side coordinate-mapping + xdotool-forwarding layer (and the
	// 270-DRAG drag patch) are retired.

	// Phase 95-05 — per-WebApp agent session state (webapp.agent.session.{get, upsert}).
	agent: agentRouter,

	// Phase 96-02 — Teach-mode skills sub-router (webapp.skills.{create,
	// list, get, delete, discard, uploadFrame}). httpOnlyPaths entries
	// added in common.ts for the same WS-reconnect-survival reasons as
	// the rest of the long-lived mutation cluster (memory pitfall B-12 /
	// X-04). uploadFrame in particular is mutation-shaped at frame rate
	// (1Hz heartbeat + per-input-event captures) — silent WS hangs
	// during a half-broken reconnect would lose recorder data.
	skills: skillsRouter,
})

export default webappRouter
