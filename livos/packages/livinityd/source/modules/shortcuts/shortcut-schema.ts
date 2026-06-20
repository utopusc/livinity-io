// Phase 290 — shortcut Zod schemas + shared types + dedup-key derivation.
//
// The `shortcuts` table (schema.sql) stores a discriminated union keyed on
// `kind` ('web' | 'terminal' | 'local'). Per-kind payload shapes live here as
// Zod schemas so the tRPC router validates input once and the repository can
// trust the JSONB it persists.
//
// H1 — there is NO 'native' kind (native apps already tile via apps.list).
// L1 — 'new-tab' is a runtime-only open-mode of the engine, never persisted.
//
// dedup_key (M2 FIX — avoid swallowing distinct shortcuts):
//   web      → sha256('web|'      + normalizedUrl)              (idempotent re-add)
//   terminal → sha256('terminal|' + command + '|' + title)      (same cmd, diff label = distinct)
//   local    → sha256('local|'    + appId + '|' + path + '|' + title)
// The web key consumes the EXACT url-validator.ts normalization (lowercase
// host, default-port strip, root-path trailing-slash drop, fragment strip).

import {createHash} from 'node:crypto'

import {z} from 'zod'

// ── Kind / open-mode unions ──────────────────────────────────────────────

export const SHORTCUT_KINDS = ['web', 'terminal', 'local'] as const
export type ShortcutKind = (typeof SHORTCUT_KINDS)[number]

export const SHORTCUT_OPEN_MODES = ['iframe', 'browser-stream', 'local-port', 'terminal'] as const
export type ShortcutOpenMode = (typeof SHORTCUT_OPEN_MODES)[number]

export const SHORTCUT_SOURCES = ['user', 'deploy', 'migrated'] as const
export type ShortcutSource = (typeof SHORTCUT_SOURCES)[number]

// ── Per-kind payload Zod schemas ─────────────────────────────────────────

export const webPayloadSchema = z.object({
	// Normalized https/http URL (the router normalizes via url-validator before
	// storing; this just bounds the length + asserts shape).
	url: z.string().url().max(2048),
})
export type WebPayload = z.infer<typeof webPayloadSchema>

// H4 — `cwd` is advisory (it runs in the user's own PTY, no escalation) but
// must be length-bounded AND reject control chars (\n / \r / \0) that could
// inject extra shell lines when the launcher prefixes `cd <cwd> && <command>`.
const cwdField = z
	.string()
	.max(2048)
	.refine((v) => !/[\n\r\0]/.test(v), {message: 'cwd must not contain newlines or NUL'})

export const terminalPayloadSchema = z.object({
	command: z.string().min(1).max(2000),
	templateId: z.string().max(64).optional(),
	// Phase 290 R2 — optional per-shortcut working directory. Stored in the JSONB
	// payload (no schema.sql change); the launcher runs `cd <cwd> && <command>`.
	cwd: cwdField.optional(),
})
export type TerminalPayload = z.infer<typeof terminalPayloadSchema>

// `local` is defined for forward-compat (Wave 4); its UI is NOT wired this
// session. Kept in the schema so the table/types stay stable.
export const localPayloadSchema = z.object({
	appId: z.string().min(1).max(128),
	path: z.string().max(2048).default('/'),
	transport: z.enum(['http', 'ws', 'stream']).default('http'),
})
export type LocalPayload = z.infer<typeof localPayloadSchema>

export type ShortcutPayload = WebPayload | TerminalPayload | LocalPayload

// ── Create input (discriminated by kind) ─────────────────────────────────
//
// title + iconUrl are mandatory at the TYPE level (#3 — no blank tiles). The
// router additionally rejects MISSING_ICON defensively. open_mode is derived
// server-side (web → probeFrameable; terminal → 'terminal'; local → 'local-port').

const titleField = z.string().min(1).max(256)
// Phase 290 R3 — iconUrl may be an http(s) URL OR a `data:` URL (custom icon
// upload). A 256 KB image base64-encodes to ~350 KB; cap at 512000 chars so a
// data-URL icon fits while still bounding the column (H2/H3). `.min(1)` keeps
// the icon mandatory (#3 — no blank tiles).
const iconUrlField = z.string().min(1).max(512000)

export const createShortcutInput = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('web'),
		title: titleField,
		iconUrl: iconUrlField,
		payload: webPayloadSchema,
	}),
	z.object({
		kind: z.literal('terminal'),
		title: titleField,
		iconUrl: iconUrlField,
		payload: terminalPayloadSchema,
	}),
	z.object({
		kind: z.literal('local'),
		title: titleField,
		iconUrl: iconUrlField,
		payload: localPayloadSchema,
	}),
])
export type CreateShortcutInput = z.infer<typeof createShortcutInput>

export const updateShortcutInput = z.object({
	id: z.string().uuid(),
	patch: z.object({
		title: titleField.optional(),
		iconUrl: iconUrlField.optional(),
	}),
})
export type UpdateShortcutInput = z.infer<typeof updateShortcutInput>

export const deleteShortcutInput = z.object({id: z.string().uuid()})

export const probeFrameableInput = z.object({url: z.string().url().max(2048)})

// ── User terminal templates (Phase 290 R2) ───────────────────────────────
//
// H2 — bounds mirror terminalPayloadSchema: label ≤256, command ≤2000, cwd
// ≤2048 + control-char reject (cwdField), iconUrl bounded (≤512000, optional).
export const createUserTemplateInput = z.object({
	label: z.string().min(1).max(256),
	command: z.string().min(1).max(2000),
	hint: z.string().max(512).optional(),
	iconUrl: z.string().max(512000).optional(),
	cwd: cwdField.optional(),
})
export type CreateUserTemplateInput = z.infer<typeof createUserTemplateInput>

export const deleteUserTemplateInput = z.object({id: z.string().uuid()})

// ── dedup_key derivation (M2) ────────────────────────────────────────────

function sha256(input: string): string {
	return createHash('sha256').update(input).digest('hex')
}

/**
 * Derive the dedup_key for a shortcut. Pure — no I/O. The web variant expects
 * an already-normalized URL string (the router runs url-validator first so the
 * key is stable across with/without-trailing-slash, host casing, default port).
 */
export function computeDedupKey(args:
	| {kind: 'web'; normalizedUrl: string}
	| {kind: 'terminal'; command: string; title: string; cwd?: string}
	| {kind: 'local'; appId: string; path: string; title: string},
): string {
	switch (args.kind) {
		case 'web':
			return sha256(`web|${args.normalizedUrl}`)
		case 'terminal':
			// L1 — include cwd in the tuple so the same command in two different
			// working directories is two distinct shortcuts (not deduped away).
			return sha256(`terminal|${args.command}|${args.title}|${args.cwd ?? ''}`)
		case 'local':
			return sha256(`local|${args.appId}|${args.path}|${args.title}`)
	}
}
