// Phase 290 — `shortcut` tRPC namespace.
//
// Mirrors webapps/trpc-router.ts. Procedures:
//   shortcut.list             () → Shortcut[]
//   shortcut.create           (CreateShortcutInput) → Shortcut (idempotent on dedup_key)
//   shortcut.update           ({id, patch}) → Shortcut
//   shortcut.delete           ({id}) → {ok: true}
//   shortcut.probeFrameable   ({url}) → {frameable, reason}      (H3 — authoritative)
//   shortcut.terminalTemplates() → TerminalTemplate[]           (M5 — claude has NO flags)
//
// All paths are registered in httpOnlyPaths (server/trpc/common.ts) in the
// SAME change for WS-reconnect survival (H6), BEFORE any UI uses them.
//
// open_mode is derived server-side at create time:
//   web      → probeFrameable → 'iframe' | 'browser-stream'  (H3)
//   terminal → 'terminal'
//   local    → 'local-port'   (forward-compat; UI deferred)

import {TRPCError} from '@trpc/server'

import {privateProcedure, router} from '../server/trpc/trpc.js'
import {getPool} from '../database/index.js'
import {validateUrl} from '../webapps/url-validator.js'

import {
	createShortcutInput,
	updateShortcutInput,
	deleteShortcutInput,
	probeFrameableInput,
	computeDedupKey,
	type ShortcutKind,
	type ShortcutOpenMode,
	type ShortcutPayload,
} from './shortcut-schema.js'
import {
	createShortcut,
	listShortcuts,
	deleteShortcut,
	updateShortcut,
	findShortcutById,
	type ShortcutRow,
} from './shortcuts-repository.js'
import {probeFrameable as runProbeFrameable, openModeForWeb} from './frame-probe.js'
import {TERMINAL_TEMPLATES, type TerminalTemplate} from './terminal-templates.js'

// Public wire shape (camelCase).
export type Shortcut = {
	id: string
	userId: string
	kind: ShortcutKind
	title: string
	iconUrl: string
	openMode: ShortcutOpenMode
	payload: ShortcutPayload
	position: number
	source: string
	createdAt: Date
}

function rowToShortcut(row: ShortcutRow): Shortcut {
	return {
		id: row.id,
		userId: row.userId,
		kind: row.kind,
		title: row.title,
		iconUrl: row.iconUrl,
		openMode: row.openMode,
		payload: row.payload,
		position: row.position,
		source: row.source,
		createdAt: row.createdAt,
	}
}

function requirePool() {
	const pool = getPool()
	if (!pool) throw new TRPCError({code: 'SERVICE_UNAVAILABLE', message: 'database not initialised'})
	return pool
}

const shortcutRouter = router({
	list: privateProcedure.query(async ({ctx}): Promise<Shortcut[]> => {
		const userId = ctx.currentUser?.id
		if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
		const pool = requirePool()
		const rows = await listShortcuts(pool, userId)
		return rows.map(rowToShortcut)
	}),

	// H3 — authoritative frame-probe. Used by the Web tab to badge "opens as
	// stream" and consumed server-side at create() time for the stored open_mode.
	probeFrameable: privateProcedure
		.input(probeFrameableInput)
		.query(async ({ctx, input}): Promise<{frameable: boolean; reason: string}> => {
			const isAdmin = ctx.currentUser?.role === 'admin'
			return runProbeFrameable({url: input.url, isAdmin})
		}),

	// M5 — curated terminal templates. The `claude` template ships with NO
	// flags (hint only); never pre-fill --dangerously-skip-permissions.
	terminalTemplates: privateProcedure.query(async (): Promise<readonly TerminalTemplate[]> => {
		return TERMINAL_TEMPLATES
	}),

	create: privateProcedure
		.input(createShortcutInput)
		.mutation(async ({ctx, input}): Promise<Shortcut> => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			const isAdmin = ctx.currentUser?.role === 'admin'
			const pool = requirePool()

			// #3 — defensive mandatory-icon gate (schema also enforces NOT NULL +
			// the Zod input requires a non-empty iconUrl; this is belt-and-braces).
			if (!input.iconUrl || input.iconUrl.trim().length === 0) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'MISSING_ICON'})
			}

			let openMode: ShortcutOpenMode
			let dedupKey: string
			let payload: ShortcutPayload

			if (input.kind === 'web') {
				// Normalize the URL via the same validator the web dedup key + the
				// frame-probe consume (M2 — stable key; SSRF guard for non-admins).
				const validation = validateUrl(input.payload.url, {isAdmin})
				if (!validation.ok) {
					throw new TRPCError({code: 'BAD_REQUEST', message: validation.reason})
				}
				const normalizedUrl = validation.normalized.toString()
				payload = {url: normalizedUrl}
				dedupKey = computeDedupKey({kind: 'web', normalizedUrl})
				// H3 — open_mode authoritative from the backend probe at create time.
				const probe = await runProbeFrameable({url: normalizedUrl, isAdmin})
				openMode = openModeForWeb(probe)
			} else if (input.kind === 'terminal') {
				payload = {command: input.payload.command, templateId: input.payload.templateId}
				dedupKey = computeDedupKey({
					kind: 'terminal',
					command: input.payload.command,
					title: input.title,
				})
				openMode = 'terminal'
			} else {
				// local — forward-compat path; UI deferred this session.
				const path = input.payload.path ?? '/'
				payload = {appId: input.payload.appId, path, transport: input.payload.transport ?? 'http'}
				dedupKey = computeDedupKey({
					kind: 'local',
					appId: input.payload.appId,
					path,
					title: input.title,
				})
				openMode = 'local-port'
			}

			const row = await createShortcut(pool, {
				userId,
				kind: input.kind,
				title: input.title,
				iconUrl: input.iconUrl,
				openMode,
				payload,
				dedupKey,
				source: 'user',
			})
			ctx.logger?.log?.(`shortcut.create user=${userId} id=${row.id} kind=${row.kind} mode=${row.openMode}`)
			return rowToShortcut(row)
		}),

	update: privateProcedure
		.input(updateShortcutInput)
		.mutation(async ({ctx, input}): Promise<Shortcut> => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			const pool = requirePool()
			const patch: {title?: string; iconUrl?: string} = {}
			if ('title' in input.patch && input.patch.title !== undefined) patch.title = input.patch.title
			if ('iconUrl' in input.patch && input.patch.iconUrl !== undefined) patch.iconUrl = input.patch.iconUrl
			const updated = await updateShortcut(pool, userId, input.id, patch)
			if (!updated) {
				const exists = await findShortcutById(pool, userId, input.id)
				if (!exists) throw new TRPCError({code: 'NOT_FOUND'})
				return rowToShortcut(exists)
			}
			ctx.logger?.log?.(`shortcut.update user=${userId} id=${updated.id}`)
			return rowToShortcut(updated)
		}),

	delete: privateProcedure
		.input(deleteShortcutInput)
		.mutation(async ({ctx, input}): Promise<{ok: true}> => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			const pool = requirePool()
			const ok = await deleteShortcut(pool, userId, input.id)
			if (!ok) throw new TRPCError({code: 'NOT_FOUND'})
			ctx.logger?.log?.(`shortcut.delete user=${userId} id=${input.id}`)
			return {ok: true}
		}),
})

export default shortcutRouter
