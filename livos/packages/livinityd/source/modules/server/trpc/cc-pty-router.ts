// Phase 168-01 — CC PTY session lifecycle tRPC router.
//
// 5 procedures (list / create / rename / delete / getPreview) wrapping
// Phase 166's CcPtyManager. All adminProcedure-gated (RBAC enforced).
// All 5 paths added to httpOnlyPaths in common.ts (B-12 / X-04 cluster
// — mutations must survive `systemctl restart livos` mid-flight).
//
// Cross-user mutation/read guard: rename / delete / getPreview fetch the
// session first and assert session.userId === ctx.currentUser.id before
// touching the manager. Mismatch → TRPCError FORBIDDEN.
//
// Sacred SHA f3538e1d + D-09 + Phase 161-02 helper + Phase 162-01
// vault-scaffolder + Phase 162-02 agent-session.ts + Phase 163 ws-agent.ts
// + Phase 164 + Phase 165 + Phase 166 server modules all UNCHANGED.

import {z} from 'zod'
import {TRPCError} from '@trpc/server'
import {observable} from '@trpc/server/observable'
import {readFile} from 'node:fs/promises'
import * as path from 'node:path'
import {adminProcedure, router} from './trpc.js'
import type {CcPtySession} from '../../cc-pty/types.js'

// Phase 168-04 — Redis channel for cross-tab attach status broadcasts.
// Must stay in sync with cc-pty/manager.ts ATTACH_CHANNEL constant.
const ATTACH_CHANNEL = 'liv:cc-pty:attached'

// CC jsonl path constant. HOME=/root because Anthropic SDK subscription
// credentials + CC project dir live under /root/.claude on the Mini PC
// (per Phase 166 manager.ts; vault scaffolder mounts vault at
// /home/bruce/livinity-vault → project-encoded segment).
const CC_PROJECT_DIR = '/root/.claude/projects/-home-bruce-livinity-vault'

async function requireOwnedSession(
	ctx: any,
	id: string,
): Promise<CcPtySession> {
	const session = await ctx.livinityd!.ccPtyManager!.getSession(id)
	if (!session) {
		throw new TRPCError({code: 'NOT_FOUND', message: `session ${id} not found`})
	}
	if (session.userId !== ctx.currentUser!.id) {
		throw new TRPCError({code: 'FORBIDDEN', message: 'session does not belong to caller'})
	}
	return session
}

const ccPtyRouter = router({
	list: adminProcedure.query(async ({ctx}) => {
		const userId = ctx.currentUser!.id
		const sessions = await ctx.livinityd!.ccPtyManager!.listSessions(userId)
		return {sessions}
	}),

	create: adminProcedure
		.input(
			z
				.object({
					title: z.string().min(1).max(100).optional(),
					cwd: z.string().optional(),
				})
				.strict(),
		)
		.mutation(async ({ctx, input}) => {
			const userId = ctx.currentUser!.id // server-authoritative; NEVER from input
			const session = await ctx.livinityd!.ccPtyManager!.createSession({
				userId,
				title: input.title,
				cwd: input.cwd,
			})
			return {session}
		}),

	rename: adminProcedure
		.input(
			z
				.object({
					id: z.string().uuid(),
					title: z.string().min(1).max(100),
				})
				.strict(),
		)
		.mutation(async ({ctx, input}) => {
			await requireOwnedSession(ctx, input.id)
			await ctx.livinityd!.ccPtyManager!.renameSession(input.id, input.title)
			return {ok: true as const}
		}),

	delete: adminProcedure
		.input(z.object({id: z.string().uuid()}).strict())
		.mutation(async ({ctx, input}) => {
			await requireOwnedSession(ctx, input.id)
			await ctx.livinityd!.ccPtyManager!.killSession(input.id)
			return {ok: true as const}
		}),

	getPreview: adminProcedure
		.input(z.object({id: z.string().uuid()}).strict())
		.query(async ({ctx, input}) => {
			const session = await requireOwnedSession(ctx, input.id)
			if (!session.ccSessionId) return {preview: null}
			// ccSessionId originates from CC itself (jsonl filename it writes);
			// we still constrain the join — `path.join` rejects null bytes and
			// the input.id is uuid-validated upstream, but ccSessionId is opaque.
			// Defense in depth: only the basename portion is used.
			const safeName = path.basename(session.ccSessionId)
			const jsonlPath = path.join(CC_PROJECT_DIR, `${safeName}.jsonl`)
			try {
				const content = await readFile(jsonlPath, 'utf8')
				const lines = content.split('\n').filter(Boolean)
				const firstUserMessage = lines.find((line) => {
					try {
						const parsed = JSON.parse(line)
						return parsed.role === 'user'
					} catch {
						return false
					}
				})
				if (!firstUserMessage) return {preview: null}
				const parsed = JSON.parse(firstUserMessage)
				const text =
					typeof parsed.content === 'string'
						? parsed.content
						: JSON.stringify(parsed.content)
				return {preview: text.slice(0, 120)}
			} catch {
				return {preview: null}
			}
		}),

	// Phase 168-04 — Cross-tab attach status subscription. Streams
	// {sessionId, attachId, attachedAt, action} JSON envelopes published on
	// 'liv:cc-pty:attached'. UI consumers compute attachedElsewhere by
	// comparing payload.attachId to their local tab's attachId.
	//
	// Note: subscription routes over WS by design (the WHOLE POINT of
	// subscriptions is server-push). It does NOT belong in httpOnlyPaths.
	//
	// userId scoping: the onMessage handler fetches the session and
	// suppresses emit if session.userId !== ctx.currentUser.id. This is a
	// defense-in-depth overlay (single-user mode means single owner) ready
	// for v36+ multi-user landing.
	subscribeAttachStatus: adminProcedure.subscription(({ctx}) => {
		return observable<{
			sessionId: string
			attachId: string
			attachedAt: number
			action: 'attached' | 'detached'
		}>((emit) => {
			// Duplicate the Redis client because subscribe-mode connections
			// can't run normal commands (ioredis idiom).
			const sub = ctx.livinityd!.ai.redis.duplicate()
			sub.subscribe(ATTACH_CHANNEL).catch((err) =>
				ctx.livinityd!.logger.error('[cc-pty] subscribe failed', err),
			)
			const onMessage = async (channel: string, msg: string) => {
				if (channel !== ATTACH_CHANNEL) return
				try {
					const parsed = JSON.parse(msg)
					if (
						typeof parsed.sessionId !== 'string' ||
						typeof parsed.attachId !== 'string' ||
						typeof parsed.attachedAt !== 'number' ||
						(parsed.action !== 'attached' && parsed.action !== 'detached')
					) {
						return // malformed shape — drop
					}
					// userId scoping overlay (T-168-04-03). Defense-in-depth
					// ahead of v36 multi-user — suppresses cross-user emits.
					const session = await ctx.livinityd!.ccPtyManager!.getSession(
						parsed.sessionId,
					)
					if (!session || session.userId !== ctx.currentUser!.id) return
					emit.next(parsed)
				} catch {
					/* malformed payload — silently drop */
				}
			}
			sub.on('message', onMessage)
			return () => {
				sub.off('message', onMessage)
				sub.unsubscribe(ATTACH_CHANNEL).catch(() => {})
				sub.quit().catch(() => {})
			}
		})
	}),
})

export default ccPtyRouter
