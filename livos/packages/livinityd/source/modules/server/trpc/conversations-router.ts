/**
 * v32-redo Stage 2b — conversations tRPC router.
 *
 * Six privateProcedure endpoints that wrap ConversationsRepository +
 * MessagesRepository (Phase 75-01). Powers the ai-chat-suna sidebar feed
 * + thread view + composer persistence path.
 *
 *   - conversations.list           query    — sidebar feed (most recent first)
 *   - conversations.get            query    — single conversation row
 *   - conversations.create         mutation — composer "first send" path
 *   - conversations.delete         mutation — sidebar "..." > Delete
 *   - conversations.listMessages   query    — thread view feed
 *   - conversations.appendMessage  mutation — persist user/assistant turns
 *
 * Multi-user privacy:
 *   The repos already enforce `WHERE user_id = $userId` on every read +
 *   write (Phase 75-01 T-75-01-02). The router additionally throws
 *   UNAUTHORIZED when ctx.currentUser is missing so a malformed JWT can
 *   never bypass the boundary at the procedure layer.
 *
 * httpOnlyPaths discipline:
 *   All 6 paths are added to common.ts httpOnlyPaths. The conversation
 *   list is the sidebar's page-render dependency (HTTP avoids the
 *   WS-handshake-delay flicker). appendMessage runs AFTER /api/agent/start
 *   completes — losing it to a half-broken WS after `systemctl restart
 *   livos` would silently drop the persisted assistant turn (memory pitfall
 *   B-12 / X-04). Mirrors the agents-router convention (Phase 85).
 *
 * No new SQL: the router is a thin adapter over the existing repos. Any
 * schema or query change MUST live inside the repos, not here.
 */

import {randomUUID} from 'node:crypto'

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {privateProcedure, router} from './trpc.js'
import {getPool} from '../../database/index.js'
import {ConversationsRepository} from '../../database/conversations-repository.js'
import {MessagesRepository} from '../../database/messages-repository.js'

// ─── Input schemas ──────────────────────────────────────────────────────────

const MAX_TITLE_LEN = 200
const MAX_CONTENT_LEN = 200_000 // ~50k tokens; assistant turns can be large
const MAX_REASONING_LEN = 200_000

const createInput = z.object({
	title: z.string().trim().min(1).max(MAX_TITLE_LEN),
})

const idInput = z.object({
	conversationId: z.string().uuid(),
})

const appendMessageInput = z.object({
	conversationId: z.string().uuid(),
	role: z.enum(['user', 'assistant', 'system', 'tool']),
	content: z.string().max(MAX_CONTENT_LEN),
	reasoning: z.string().max(MAX_REASONING_LEN).optional(),
})

const listInput = z
	.object({
		limit: z.number().int().min(1).max(200).optional(),
	})
	.optional()

const listMessagesInput = z.object({
	conversationId: z.string().uuid(),
	limit: z.number().int().min(1).max(500).optional(),
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function requirePool() {
	const pool = getPool()
	if (!pool) {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'Database not initialized',
		})
	}
	return pool
}

function requireUser(ctx: {currentUser?: {id: string; username: string; role: string}}) {
	if (!ctx.currentUser) {
		throw new TRPCError({code: 'UNAUTHORIZED', message: 'No authenticated user'})
	}
	return ctx.currentUser
}

// ─── Router definition ──────────────────────────────────────────────────────

const conversationsRouter = router({
	// ── list ──────────────────────────────────────────────────────────────
	// Sidebar feed. ConversationsRepository.listForUser returns most-recent
	// updated_at first (LIMIT 50 default). Empty page when DB pool is not yet
	// initialized so the sidebar renders its empty state instead of erroring.
	list: privateProcedure.input(listInput).query(async ({ctx, input}) => {
		const user = requireUser(ctx)
		const pool = getPool()
		if (!pool) return []
		const repo = new ConversationsRepository(pool)
		return repo.listForUser(user.id, input?.limit ?? 50)
	}),

	// ── get ───────────────────────────────────────────────────────────────
	// Single conversation. Privacy boundary at the repo layer — returns null
	// when the conversation belongs to a different user.
	get: privateProcedure.input(idInput).query(async ({ctx, input}) => {
		const user = requireUser(ctx)
		const pool = requirePool()
		const repo = new ConversationsRepository(pool)
		const row = await repo.getById(input.conversationId, user.id)
		if (!row) {
			throw new TRPCError({code: 'NOT_FOUND', message: 'Conversation not found'})
		}
		return row
	}),

	// ── create ────────────────────────────────────────────────────────────
	// Composer "first send" path: generates a UUID server-side, upserts an
	// empty conversation, returns the row. The composer then issues
	// appendMessage + sendMessage.
	create: privateProcedure.input(createInput).mutation(async ({ctx, input}) => {
		const user = requireUser(ctx)
		const pool = requirePool()
		const repo = new ConversationsRepository(pool)
		const id = randomUUID()
		const now = new Date()
		await repo.upsert({
			id,
			userId: user.id,
			title: input.title,
			createdAt: now,
			updatedAt: now,
		})
		return {
			id,
			userId: user.id,
			title: input.title,
			createdAt: now,
			updatedAt: now,
		}
	}),

	// ── delete ────────────────────────────────────────────────────────────
	// Hard delete. CASCADE wipes child messages (FK in schema). Idempotent —
	// double-clicks on the confirm don't error.
	delete: privateProcedure.input(idInput).mutation(async ({ctx, input}) => {
		const user = requireUser(ctx)
		const pool = requirePool()
		const repo = new ConversationsRepository(pool)
		await repo.deleteById(input.conversationId, user.id)
		return {deleted: true}
	}),

	// ── listMessages ──────────────────────────────────────────────────────
	// Thread view feed. Chronological order (ASC) so the auto-scroll-to-
	// bottom in thread.tsx puts the latest turn at the bottom edge.
	listMessages: privateProcedure
		.input(listMessagesInput)
		.query(async ({ctx, input}) => {
			const user = requireUser(ctx)
			const pool = getPool()
			if (!pool) return []
			const repo = new MessagesRepository(pool)
			return repo.listByConversation(input.conversationId, user.id, input.limit ?? 200)
		}),

	// ── appendMessage ─────────────────────────────────────────────────────
	// Persist a user or assistant turn AFTER it lands in the UI. The composer
	// calls this twice per send: once for the user message immediately before
	// kicking off /api/agent/start, and once for the assistant message when
	// the SSE stream reaches `complete`. Touches the conversation's
	// updated_at so the sidebar reorders correctly.
	//
	// We also re-upsert the conversation row with the new updated_at to keep
	// list ordering consistent (the repo's upsert ON CONFLICT updates only
	// title + updated_at, leaving created_at intact).
	appendMessage: privateProcedure
		.input(appendMessageInput)
		.mutation(async ({ctx, input}) => {
			const user = requireUser(ctx)
			const pool = requirePool()
			const messagesRepo = new MessagesRepository(pool)
			const conversationsRepo = new ConversationsRepository(pool)

			// Verify ownership BEFORE writing the message — a write to a
			// conversation the user does not own would FK-violate but we want
			// a clean 404 surface instead of a 500.
			const conv = await conversationsRepo.getById(input.conversationId, user.id)
			if (!conv) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Conversation not found or not owned by current user',
				})
			}

			const messageId = await messagesRepo.insertOne({
				conversationId: input.conversationId,
				userId: user.id,
				role: input.role,
				content: input.content,
				reasoning: input.reasoning ?? null,
			})

			// Bump updated_at via re-upsert so the sidebar list ordering reflects
			// the new activity. Title stays as it was.
			await conversationsRepo.upsert({
				id: conv.id,
				userId: user.id,
				title: conv.title,
				createdAt: conv.createdAt,
				updatedAt: new Date(),
			})

			return {messageId}
		}),
})

export default conversationsRouter
