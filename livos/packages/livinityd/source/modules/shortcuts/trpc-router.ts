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
import {fileUserContext, type FileUserInfo} from '../files/files.js'

import {
	createShortcutInput,
	updateShortcutInput,
	deleteShortcutInput,
	probeFrameableInput,
	createUserTemplateInput,
	deleteUserTemplateInput,
	computeDedupKey,
	type ShortcutKind,
	type ShortcutOpenMode,
	type ShortcutPayload,
} from './shortcut-schema.js'
import {
	listUserTemplates,
	upsertUserTemplate,
	deleteUserTemplate,
	type UserTerminalTemplateRow,
} from './user-templates-repository.js'
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

// Phase 290 R2 — user terminal template wire shape (camelCase, ISO-ish dates
// serialize fine over tRPC; the UI reads label/command/hint/iconUrl/cwd).
export type UserTemplate = {
	id: string
	label: string
	command: string
	hint: string | null
	iconUrl: string | null
	cwd: string | null
}

function rowToUserTemplate(row: UserTerminalTemplateRow): UserTemplate {
	return {
		id: row.id,
		label: row.label,
		command: row.command,
		hint: row.hint,
		iconUrl: row.iconUrl,
		cwd: row.cwd,
	}
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

// Phase 290 R3 (REQ1 / B1 / M1 / L1) — convert the optional per-shortcut cwd
// from a LivOS-virtual path (`/Home/projects`) to the REAL filesystem path the
// shell can `cd` into (`${dataDir}/home/projects`, per-user via the Files
// module). The folder picker yields a virtual path, but the field is ALSO
// free-text, so a user may type a real absolute path (`/usr/local/projects`).
//
// Rules:
//   - undefined/empty cwd → undefined (no cwd persisted).
//   - cwd that is already a REAL absolute path that exists on disk OR does NOT
//     start with a known virtual base (`/Home`, `/Apps`, …) → pass through
//     UNCHANGED (M1 — never mangle a real path into `[invalid-base]`).
//   - otherwise convert via Files.virtualToSystemPath inside the per-user
//     fileUserContext (B1 — the conversion is single-arg, identity comes from
//     AsyncLocalStorage). On throw / `[invalid-base]` → drop cwd + log (L1).
//
// `virtualToSystemPath` is SINGLE-ARG; we wrap it in fileUserContext.run so a
// non-admin's cwd resolves under their own users/<username>/home subtree (the
// same withFileUser pattern as files/routes.ts:7).
const VIRTUAL_BASES = ['/Home', '/Trash', '/Apps', '/External', '/Backups', '/Network'] as const

function startsWithVirtualBase(p: string): boolean {
	return VIRTUAL_BASES.some((base) => p === base || p.startsWith(`${base}/`))
}

async function resolveTerminalCwd(args: {
	cwd: string | undefined
	currentUser?: {username: string; role: string}
	virtualToSystemPath: (p: string) => Promise<string>
	logger?: {log?: (message?: string) => void}
}): Promise<string | undefined> {
	const {cwd, currentUser, virtualToSystemPath, logger} = args
	if (!cwd || cwd.trim().length === 0) return undefined
	const trimmed = cwd.trim()

	// M1 — a real absolute path that is NOT under a known virtual base is passed
	// through unchanged (never fed to virtualToSystemPath, which would reject it
	// with [invalid-base]). A virtual base like /Home is converted below.
	if (trimmed.startsWith('/') && !startsWithVirtualBase(trimmed)) {
		return trimmed
	}

	// Anything not starting with '/' is neither a virtual nor a real absolute
	// path — drop it rather than guess.
	if (!trimmed.startsWith('/')) {
		logger?.log?.(`shortcut.create: dropping non-absolute cwd '${trimmed}'`)
		return undefined
	}

	const userInfo: FileUserInfo | undefined = currentUser
		? {username: currentUser.username, role: currentUser.role as FileUserInfo['role']}
		: undefined

	try {
		const real = await fileUserContext.run(userInfo, () => virtualToSystemPath(trimmed))
		if (!real || real.includes('[invalid-base]')) {
			logger?.log?.(`shortcut.create: dropping cwd '${trimmed}' (invalid base)`)
			return undefined
		}
		return real
	} catch (err) {
		logger?.log?.(
			`shortcut.create: dropping cwd '${trimmed}' (virtualToSystemPath threw: ${err instanceof Error ? err.message : String(err)})`,
		)
		return undefined
	}
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

	// Phase 290 R2 — user-authored, persisted Terminal templates.
	userTemplates: router({
		list: privateProcedure.query(async ({ctx}): Promise<UserTemplate[]> => {
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
			const pool = requirePool()
			const rows = await listUserTemplates(pool, userId)
			return rows.map(rowToUserTemplate)
		}),

		create: privateProcedure
			.input(createUserTemplateInput)
			.mutation(async ({ctx, input}): Promise<UserTemplate> => {
				const userId = ctx.currentUser?.id
				if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
				const pool = requirePool()
				const row = await upsertUserTemplate(pool, {
					userId,
					label: input.label,
					command: input.command,
					hint: input.hint ?? null,
					iconUrl: input.iconUrl ?? null,
					cwd: input.cwd ?? null,
				})
				ctx.logger?.log?.(`shortcut.userTemplates.create user=${userId} id=${row.id}`)
				return rowToUserTemplate(row)
			}),

		delete: privateProcedure
			.input(deleteUserTemplateInput)
			.mutation(async ({ctx, input}): Promise<{ok: true}> => {
				const userId = ctx.currentUser?.id
				if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})
				const pool = requirePool()
				const ok = await deleteUserTemplate(pool, userId, input.id)
				if (!ok) throw new TRPCError({code: 'NOT_FOUND'})
				ctx.logger?.log?.(`shortcut.userTemplates.delete user=${userId} id=${input.id}`)
				return {ok: true}
			}),
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
				// Phase 290 R2 — persist the optional per-shortcut cwd in the JSONB
				// payload (no schema.sql change); include it in the dedup tuple (L1).
				//
				// Phase 290 R3 (REQ1) — the folder picker yields a LivOS-virtual path
				// (`/Home/projects`). Convert it to the REAL fs path BEFORE persisting
				// AND before using it in the dedup tuple — the SAME converted value for
				// both, so re-adding the same shortcut stays idempotent.
				const files = ctx.livinityd?.files
				const realCwd = files
					? await resolveTerminalCwd({
							cwd: input.payload.cwd,
							currentUser: ctx.currentUser,
							virtualToSystemPath: (p) => files.virtualToSystemPath(p),
							logger: ctx.logger,
						})
					: undefined
				payload = {
					command: input.payload.command,
					templateId: input.payload.templateId,
					...(realCwd ? {cwd: realCwd} : {}),
				}
				dedupKey = computeDedupKey({
					kind: 'terminal',
					command: input.payload.command,
					title: input.title,
					cwd: realCwd,
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
			let updated = await updateShortcut(pool, userId, input.id, patch)

			// INV-1 (FIX B persist) — the repository patch only knows title/iconUrl;
			// persist an open_mode downgrade (iframe→browser-stream from the runtime
			// "Open as stream" affordance) with a scoped, user-bound UPDATE here so a
			// frame-deny Web shortcut sticks as a stream on next open. Additive — the
			// column already exists (created at create time).
			if ('openMode' in input.patch && input.patch.openMode !== undefined) {
				const {rows} = await pool.query(
					`UPDATE shortcuts SET open_mode = $1
					 WHERE id = $2 AND user_id = $3
					 RETURNING id, user_id, kind, title, icon_url, open_mode, payload, position, source, created_at`,
					[input.patch.openMode, input.id, userId],
				)
				if (rows.length > 0) {
					const r = rows[0]
					updated = {
						id: r.id,
						userId: r.user_id,
						kind: r.kind,
						title: r.title,
						iconUrl: r.icon_url,
						openMode: r.open_mode,
						payload: r.payload,
						dedupKey: '', // not selected; not part of the wire shape
						position: r.position,
						source: r.source,
						createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
					}
				}
			}

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
