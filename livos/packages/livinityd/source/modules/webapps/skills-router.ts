// Phase 96-02 — webapp.skills.* sub-router.
//
// Wired into the parent webappRouter under the `skills` namespace so the
// fully-qualified procedure paths are `webapp.skills.{create,list,get,
// delete,discard,uploadFrame}`. Lives under the existing P92 `webapp`
// namespace (singular) — same convention chosen by P95's
// webapp.agent.session.* sub-router.
//
// All six paths are added to `httpOnlyPaths` in common.ts (96-02 entry).
// The recorder hook + sidebar + scrubber call them over HTTP for the
// usual long-lived-mutation WS-reconnect-survival reasons.
//
// Authorization model:
//   - `userId` is sourced from ctx.currentUser.id on every procedure.
//   - WebApp ownership is verified before any skill-row write (defense in
//     depth on top of the FK ON DELETE CASCADE rules in the schema).
//   - Skill ownership is enforced at the SQL WHERE — reads/writes are
//     scoped by user_id at the column level. User B asking for User A's
//     skillId returns NOT_FOUND, never the row (STRIDE I).

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {privateProcedure, router} from '../server/trpc/trpc.js'
import {getPool} from '../database/index.js'

import {findWebAppById} from './webapps-repository.js'
import {
	createWebAppSkill,
	listWebAppSkills,
	getWebAppSkill,
	deleteWebAppSkill,
} from './skills-repository.js'
import {
	writeFrame,
	discardSession,
	type SupportedMime,
} from './skills-storage.js'

// Canonical action-log schema (96-CONTEXT §In-scope). Strict version 1
// discriminated union — recorder hook drops unknown event types.
const coordsSchema = z.object({x: z.number(), y: z.number()})

const clickEventSchema = z.object({
	type: z.literal('click'),
	button: z.enum(['left', 'middle', 'right']),
	coords: coordsSchema,
	ts: z.number().int().min(0),
	screenshotRef: z.string().min(1).max(512),
})

const keyEventSchema = z.object({
	type: z.literal('key'),
	key: z.string().min(1).max(64),
	modifiers: z.array(z.string().max(32)).max(8),
	ts: z.number().int().min(0),
	screenshotRef: z.string().min(1).max(512),
})

const wheelEventSchema = z.object({
	type: z.literal('wheel'),
	dx: z.number(),
	dy: z.number(),
	ts: z.number().int().min(0),
	screenshotRef: z.string().min(1).max(512),
})

const scrollEventSchema = z.object({
	type: z.literal('scroll'),
	coords: coordsSchema,
	dx: z.number(),
	dy: z.number(),
	ts: z.number().int().min(0),
	screenshotRef: z.string().min(1).max(512),
})

const waitEventSchema = z.object({
	type: z.literal('wait'),
	durationMs: z.number().int().min(0),
	ts: z.number().int().min(0),
	screenshotRef: z.string().min(1).max(512),
})

const actionEventSchema = z.discriminatedUnion('type', [
	clickEventSchema,
	keyEventSchema,
	wheelEventSchema,
	scrollEventSchema,
	waitEventSchema,
])

const actionLogSchema = z.object({
	version: z.literal(1),
	webappId: z.string().uuid(),
	startedAt: z.number().int().min(0),
	endedAt: z.number().int().min(0),
	events: z.array(actionEventSchema).max(20_000),
	meta: z
		.object({
			droppedCount: z.number().int().min(0).optional(),
			sessionId: z.string().uuid().optional(),
		})
		.optional(),
})

// Slug-safe validator: 1-80 chars, [A-Za-z0-9 _-] only. Trim-collapse the
// router's caller responsibility (UI does the trim before submitting).
const SLUG_RE = /^[A-Za-z0-9 _-]{1,80}$/

const skillNameSchema = z
	.string()
	.min(1)
	.max(80)
	.refine(v => SLUG_RE.test(v), {
		message: 'name must be 1-80 chars of letters, digits, spaces, underscores or dashes',
	})

const createInput = z.object({
	webappId: z.string().uuid(),
	name: skillNameSchema,
	sessionId: z.string().uuid(),
	actionLog: actionLogSchema,
})

const listInput = z.object({
	webappId: z.string().uuid(),
})

const getInput = z.object({
	skillId: z.string().uuid(),
})

const deleteInput = z.object({
	skillId: z.string().uuid(),
})

const discardInput = z.object({
	sessionId: z.string().uuid(),
})

const uploadFrameInput = z.object({
	sessionId: z.string().uuid(),
	ts: z.number().int().min(0),
	imageDataBase64: z.string().min(1).max(8 * 1024 * 1024), // 8MB ceiling on the wire (4MB binary post-decode is enforced in skills-storage)
	mimeType: z.enum(['image/png', 'image/jpeg']),
})

function requirePool() {
	const pool = getPool()
	if (!pool) {
		throw new TRPCError({code: 'SERVICE_UNAVAILABLE', message: 'database not initialised'})
	}
	return pool
}

// Walk a saved actionLog and yield each unique sessionId referenced via
// screenshotRef. The ref shape is `<userId>/<sessionId>/<ts>.jpg`. We
// already stored sessionId in meta when 96-03 saved, but defending
// against older logs that lack it: we fall back to parsing screenshotRef.
function uniqueSessionIds(actionLog: unknown): string[] {
	const set = new Set<string>()
	const log = actionLog as
		| {events?: Array<{screenshotRef?: string}>; meta?: {sessionId?: string}}
		| null
		| undefined
	if (!log) return []
	if (log.meta?.sessionId) set.add(log.meta.sessionId)
	for (const e of log.events ?? []) {
		const ref = e?.screenshotRef
		if (typeof ref !== 'string') continue
		const parts = ref.split('/')
		if (parts.length >= 2) set.add(parts[1])
	}
	return [...set]
}

const skillsRouter = router({
	create: privateProcedure
		.input(createInput)
		.mutation(async ({ctx, input}) => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			const pool = requirePool()

			// Defense in depth: confirm the user owns the WebApp before persist.
			const webapp = await findWebAppById(pool, userId, input.webappId)
			if (!webapp) throw new TRPCError({code: 'NOT_FOUND', message: 'webapp not found'})

			// Stamp sessionId into meta if not already present so future
			// `delete` cascades can clean up disk without parsing refs.
			const stampedLog = {
				...input.actionLog,
				meta: {
					...(input.actionLog.meta ?? {}),
					sessionId: input.actionLog.meta?.sessionId ?? input.sessionId,
				},
			}

			try {
				const row = await createWebAppSkill(pool, {
					userId,
					webappId: input.webappId,
					skillName: input.name,
					actionLog: stampedLog,
				})
				ctx.logger?.log?.(
					`webapp.skills.create user=${userId} id=${row.id} webapp=${row.webappId} events=${input.actionLog.events.length}`,
				)
				return {id: row.id, createdAt: row.createdAt}
			} catch (err: any) {
				// Postgres unique-violation on (user_id, webapp_id, skill_name)
				if (err?.code === '23505') {
					throw new TRPCError({
						code: 'CONFLICT',
						message: `a skill named "${input.name}" already exists for this WebApp`,
						cause: err,
					})
				}
				throw err
			}
		}),

	list: privateProcedure
		.input(listInput)
		.query(async ({ctx, input}) => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			const pool = requirePool()
			const rows = await listWebAppSkills(pool, userId, input.webappId)
			return rows
		}),

	get: privateProcedure
		.input(getInput)
		.query(async ({ctx, input}) => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			const pool = requirePool()
			const row = await getWebAppSkill(pool, userId, input.skillId)
			if (!row) throw new TRPCError({code: 'NOT_FOUND'})
			return {
				id: row.id,
				webappId: row.webappId,
				skillName: row.skillName,
				actionLog: row.actionLog,
				createdAt: row.createdAt,
			}
		}),

	delete: privateProcedure
		.input(deleteInput)
		.mutation(async ({ctx, input}) => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			const pool = requirePool()
			const row = await deleteWebAppSkill(pool, userId, input.skillId)
			if (!row) throw new TRPCError({code: 'NOT_FOUND'})
			// Best-effort disk GC for every session referenced in the log.
			const sessions = uniqueSessionIds(row.actionLog)
			await Promise.all(
				sessions.map(sid =>
					discardSession({userId, sessionId: sid}).catch(err => {
						ctx.logger?.error?.(
							`webapp.skills.delete: discardSession failed user=${userId} sid=${sid}`,
							err,
						)
					}),
				),
			)
			ctx.logger?.log?.(`webapp.skills.delete user=${userId} id=${input.skillId}`)
			return {ok: true}
		}),

	discard: privateProcedure
		.input(discardInput)
		.mutation(async ({ctx, input}) => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			await discardSession({userId, sessionId: input.sessionId})
			ctx.logger?.log?.(`webapp.skills.discard user=${userId} sid=${input.sessionId}`)
			return {ok: true}
		}),

	uploadFrame: privateProcedure
		.input(uploadFrameInput)
		.mutation(async ({ctx, input}) => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			const result = await writeFrame({
				userId,
				sessionId: input.sessionId,
				ts: String(input.ts),
				imageData: input.imageDataBase64,
				mimeType: input.mimeType as SupportedMime,
			})
			return {screenshotRef: result.screenshotRef}
		}),
})

export default skillsRouter
