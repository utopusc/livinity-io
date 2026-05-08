// Phase 96-02 — skills-storage.ts.
//
// On-disk persistence for Teach-mode screenshots. Layered below the tRPC
// `webapps.skills.*` router (see skills-router.ts).
//
// Path convention:
//   <LIV_DATA_ROOT>/webapp-skills/<userId>/<sessionId>/<ts>.jpg
//   <LIV_DATA_ROOT>/webapp-skills/<userId>/<sessionId>/<ts>.thumb.jpg
//
// LIV_DATA_ROOT defaults to `/opt/livos/data` per CLAUDE.md "Storage convention".
//
// Re-encode policy (96-CONTEXT §gray-area #4):
//   - Input is a base64-encoded PNG or JPEG (whatever canvas.toDataURL emits).
//   - Server re-encodes to JPEG q=80, max 1280×800 (resize-down only, no upscale).
//   - Thumbnail variant 320×200 q=70 written alongside the full frame.
//   - Pre-encode size cap: 4 MB. Larger payloads → BAD_REQUEST.
//   - Allowed input MIMEs: image/png, image/jpeg.
//
// Path-traversal defense:
//   - userId MUST be UUID v4 shape (caller guarantees from ctx.currentUser.id,
//     but we re-validate here as defense in depth).
//   - sessionId MUST match /^[0-9a-f-]{36}$/.
//   - ts MUST match /^[0-9]+$/.
//   - The constructed absolute path MUST start with the resolved
//     <LIV_DATA_ROOT>/webapp-skills/<userId>/ prefix or we throw.
//
// `discardSession` is idempotent — non-existent directory is a no-op.

import {Buffer} from 'node:buffer'
import {promises as fs} from 'node:fs'
import {sep, join, resolve} from 'node:path'

import {TRPCError} from '@trpc/server'
import sharp from 'sharp'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TS_RE = /^[0-9]+$/

const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024
const FULL_MAX_W = 1280
const FULL_MAX_H = 800
const FULL_QUALITY = 80
const THUMB_W = 320
const THUMB_H = 200
const THUMB_QUALITY = 70

export type SupportedMime = 'image/png' | 'image/jpeg'

function dataRoot(): string {
	return process.env.LIV_DATA_ROOT ?? '/opt/livos/data'
}

function skillsRoot(): string {
	return join(dataRoot(), 'webapp-skills')
}

function assertUuid(value: string, label: string): void {
	if (!UUID_RE.test(value)) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: `${label} must be a UUID`,
		})
	}
}

function assertTs(value: string): void {
	if (!TS_RE.test(value)) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'ts must be a positive integer string',
		})
	}
}

// Returns the absolute session directory after validating that the path
// stays inside `<skillsRoot>/<userId>/`.
function sessionDir(userId: string, sessionId: string): string {
	assertUuid(userId, 'userId')
	assertUuid(sessionId, 'sessionId')
	const userRoot = resolve(skillsRoot(), userId)
	const dir = resolve(userRoot, sessionId)
	// Defense-in-depth path-traversal guard.
	if (!dir.startsWith(userRoot + sep) && dir !== userRoot) {
		throw new TRPCError({code: 'BAD_REQUEST', message: 'invalid session path'})
	}
	return dir
}

export type WriteFrameInput = {
	userId: string
	sessionId: string
	ts: string
	imageData: Buffer | string // raw bytes or base64 string
	mimeType: string
}

export type WriteFrameResult = {
	screenshotRef: string // path stored inside the action log
	thumbRef: string
}

/**
 * Re-encode the supplied PNG/JPEG to JPEG q=80 max 1280×800 and write it
 * alongside a 320×200 q=70 thumbnail. Returns relative paths suitable for
 * embedding in the canonical action log.
 */
export async function writeFrame(input: WriteFrameInput): Promise<WriteFrameResult> {
	if (input.mimeType !== 'image/png' && input.mimeType !== 'image/jpeg') {
		throw new TRPCError({
			code: 'UNSUPPORTED_MEDIA_TYPE',
			message: `mimeType must be image/png or image/jpeg, got ${input.mimeType}`,
		})
	}
	assertTs(input.ts)
	const dir = sessionDir(input.userId, input.sessionId)

	const buf =
		typeof input.imageData === 'string'
			? Buffer.from(input.imageData, 'base64')
			: input.imageData
	if (buf.length > MAX_PAYLOAD_BYTES) {
		throw new TRPCError({
			code: 'PAYLOAD_TOO_LARGE',
			message: `frame ${buf.length} bytes exceeds ${MAX_PAYLOAD_BYTES}`,
		})
	}
	if (buf.length === 0) {
		throw new TRPCError({code: 'BAD_REQUEST', message: 'empty frame payload'})
	}

	await fs.mkdir(dir, {recursive: true})

	const fullPath = join(dir, `${input.ts}.jpg`)
	const thumbPath = join(dir, `${input.ts}.thumb.jpg`)

	const fullBytes = await sharp(buf)
		.resize({width: FULL_MAX_W, height: FULL_MAX_H, fit: 'inside', withoutEnlargement: true})
		.jpeg({quality: FULL_QUALITY})
		.toBuffer()
	await fs.writeFile(fullPath, fullBytes)

	const thumbBytes = await sharp(buf)
		.resize({width: THUMB_W, height: THUMB_H, fit: 'fill'})
		.jpeg({quality: THUMB_QUALITY})
		.toBuffer()
	await fs.writeFile(thumbPath, thumbBytes)

	const screenshotRef = `${input.userId}/${input.sessionId}/${input.ts}.jpg`
	const thumbRef = `${input.userId}/${input.sessionId}/${input.ts}.thumb.jpg`
	return {screenshotRef, thumbRef}
}

export type LoadFrameInput = {
	userId: string
	sessionId: string
	ts: string
	variant?: 'full' | 'thumb'
}

/**
 * Read a previously-written JPEG. Path-traversal defended at sessionDir.
 * Returns null when the file doesn't exist (caller maps to NOT_FOUND).
 */
export async function loadFrame(input: LoadFrameInput): Promise<Buffer | null> {
	assertTs(input.ts)
	const dir = sessionDir(input.userId, input.sessionId)
	const suffix = input.variant === 'thumb' ? '.thumb.jpg' : '.jpg'
	const file = join(dir, `${input.ts}${suffix}`)
	try {
		return await fs.readFile(file)
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code
		if (code === 'ENOENT') return null
		throw err
	}
}

export type DiscardSessionInput = {
	userId: string
	sessionId: string
}

/**
 * Remove the entire session directory. Idempotent — missing dir is a
 * silent no-op so cancel-from-Save-dialog and skill-delete cascade can
 * both call it without checking existence first.
 */
export async function discardSession(input: DiscardSessionInput): Promise<void> {
	const dir = sessionDir(input.userId, input.sessionId)
	await fs.rm(dir, {recursive: true, force: true})
}

/**
 * Internal helper exposed for tests + the file-streaming HTTP route in
 * skills-router (frame URL endpoint). Returns the absolute on-disk path
 * for a given (userId, sessionId, ts, variant).
 */
export function frameAbsolutePath(input: LoadFrameInput): string {
	assertTs(input.ts)
	const dir = sessionDir(input.userId, input.sessionId)
	const suffix = input.variant === 'thumb' ? '.thumb.jpg' : '.jpg'
	return join(dir, `${input.ts}${suffix}`)
}
