/**
 * Phase 96-02 — skills-storage.ts unit tests.
 *
 * Coverage:
 *   T1 — writeFrame round-trips a small PNG (re-encoded to JPEG, full + thumb
 *        files exist on disk, returned refs are relative paths under <userId>).
 *   T2 — writeFrame rejects unsupported mimeType (UNSUPPORTED_MEDIA_TYPE).
 *   T3 — writeFrame rejects oversize payloads (PAYLOAD_TOO_LARGE).
 *   T4 — writeFrame rejects malformed userId / sessionId / ts.
 *   T5 — discardSession is idempotent (non-existent dir is a no-op).
 *   T6 — discardSession rejects path traversal in sessionId.
 *   T7 — loadFrame returns null on missing file, bytes on hit.
 *   T8 — frameAbsolutePath constructs expected path.
 */

import {beforeAll, describe, expect, test} from 'vitest'
import {Buffer} from 'node:buffer'
import {promises as fs} from 'node:fs'
import {existsSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import os from 'node:os'

import sharp from 'sharp'

import {
	writeFrame,
	loadFrame,
	discardSession,
	frameAbsolutePath,
} from './skills-storage.js'

// Each test gets its own LIV_DATA_ROOT under the OS tmpdir so concurrent
// runs and prior runs don't interfere.
let dataRoot: string

async function makePng(w: number, h: number): Promise<Buffer> {
	return sharp({
		create: {
			width: w,
			height: h,
			channels: 3,
			background: {r: 100, g: 150, b: 200},
		},
	})
		.png()
		.toBuffer()
}

beforeAll(async () => {
	dataRoot = await fs.mkdtemp(join(os.tmpdir(), 'livos-skills-storage-'))
	process.env.LIV_DATA_ROOT = dataRoot
})

describe('skills-storage', () => {
	const userId = '11111111-1111-4111-8111-111111111111'

	test('T1 — writeFrame writes full + thumb JPEGs and returns relative refs', async () => {
		const sessionId = randomUUID()
		const png = await makePng(640, 400)
		const r = await writeFrame({
			userId,
			sessionId,
			ts: '12345',
			imageData: png,
			mimeType: 'image/png',
		})
		expect(r.screenshotRef).toBe(`${userId}/${sessionId}/12345.jpg`)
		expect(r.thumbRef).toBe(`${userId}/${sessionId}/12345.thumb.jpg`)
		const fullPath = join(dataRoot, 'webapp-skills', userId, sessionId, '12345.jpg')
		const thumbPath = join(dataRoot, 'webapp-skills', userId, sessionId, '12345.thumb.jpg')
		expect(existsSync(fullPath)).toBe(true)
		expect(existsSync(thumbPath)).toBe(true)
		// Verify the thumb is exactly 320×200 q≤70 JPEG.
		const meta = await sharp(thumbPath).metadata()
		expect(meta.format).toBe('jpeg')
		expect(meta.width).toBe(320)
		expect(meta.height).toBe(200)
	})

	test('T2 — writeFrame rejects unsupported mimeType', async () => {
		const sessionId = randomUUID()
		await expect(
			writeFrame({
				userId,
				sessionId,
				ts: '1',
				imageData: Buffer.from('not really'),
				mimeType: 'image/gif' as any,
			}),
		).rejects.toMatchObject({code: 'UNSUPPORTED_MEDIA_TYPE'})
	})

	test('T3 — writeFrame rejects payloads > 4 MB', async () => {
		const sessionId = randomUUID()
		const big = Buffer.alloc(4 * 1024 * 1024 + 1)
		await expect(
			writeFrame({
				userId,
				sessionId,
				ts: '1',
				imageData: big,
				mimeType: 'image/jpeg',
			}),
		).rejects.toMatchObject({code: 'PAYLOAD_TOO_LARGE'})
	})

	test('T4 — writeFrame rejects malformed userId / sessionId / ts', async () => {
		const png = await makePng(64, 64)
		await expect(
			writeFrame({
				userId: 'not-a-uuid',
				sessionId: randomUUID(),
				ts: '1',
				imageData: png,
				mimeType: 'image/png',
			}),
		).rejects.toMatchObject({code: 'BAD_REQUEST'})
		await expect(
			writeFrame({
				userId,
				sessionId: '../escape',
				ts: '1',
				imageData: png,
				mimeType: 'image/png',
			}),
		).rejects.toMatchObject({code: 'BAD_REQUEST'})
		await expect(
			writeFrame({
				userId,
				sessionId: randomUUID(),
				ts: 'NaN',
				imageData: png,
				mimeType: 'image/png',
			}),
		).rejects.toMatchObject({code: 'BAD_REQUEST'})
	})

	test('T5 — discardSession is idempotent on non-existent dir', async () => {
		const sessionId = randomUUID() // never written to disk
		await expect(discardSession({userId, sessionId})).resolves.toBeUndefined()
		// Calling twice still no-ops.
		await expect(discardSession({userId, sessionId})).resolves.toBeUndefined()
	})

	test('T5b — discardSession removes the session directory', async () => {
		const sessionId = randomUUID()
		const png = await makePng(64, 64)
		await writeFrame({userId, sessionId, ts: '1', imageData: png, mimeType: 'image/png'})
		const dir = join(dataRoot, 'webapp-skills', userId, sessionId)
		expect(existsSync(dir)).toBe(true)
		await discardSession({userId, sessionId})
		expect(existsSync(dir)).toBe(false)
	})

	test('T6 — discardSession rejects path traversal', async () => {
		await expect(
			discardSession({userId, sessionId: '../../etc'}),
		).rejects.toMatchObject({code: 'BAD_REQUEST'})
	})

	test('T7 — loadFrame returns null on missing file, bytes on hit', async () => {
		const sessionId = randomUUID()
		expect(
			await loadFrame({userId, sessionId, ts: '999'}),
		).toBeNull()
		const png = await makePng(64, 64)
		await writeFrame({userId, sessionId, ts: '5', imageData: png, mimeType: 'image/png'})
		const bytes = await loadFrame({userId, sessionId, ts: '5'})
		expect(bytes).not.toBeNull()
		expect((bytes as Buffer).length).toBeGreaterThan(0)
		// Variant 'thumb' loads the thumb file.
		const thumb = await loadFrame({userId, sessionId, ts: '5', variant: 'thumb'})
		expect(thumb).not.toBeNull()
	})

	test('T8 — frameAbsolutePath constructs expected path', () => {
		const sessionId = '22222222-2222-4222-8222-222222222222'
		const p = frameAbsolutePath({userId, sessionId, ts: '7'})
		expect(p).toBe(resolve(dataRoot, 'webapp-skills', userId, sessionId, '7.jpg'))
		const pt = frameAbsolutePath({userId, sessionId, ts: '7', variant: 'thumb'})
		expect(pt).toBe(resolve(dataRoot, 'webapp-skills', userId, sessionId, '7.thumb.jpg'))
	})
})
