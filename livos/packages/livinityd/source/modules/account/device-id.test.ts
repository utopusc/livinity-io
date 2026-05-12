import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {mkdtemp, rm, readFile, writeFile, chmod} from 'node:fs/promises'

describe('account/device-id.ts — Phase 104 plan 104-10', () => {
	let tmpDir: string

	beforeEach(async () => {
		tmpDir = await mkdtemp(path.join(tmpdir(), 'livos-device-id-test-'))
	})
	afterEach(async () => {
		await rm(tmpDir, {recursive: true, force: true}).catch(() => {})
	})

	it('generates a v4 UUID on first call and persists it', async () => {
		const {getOrCreateDeviceId} = await import('./device-id.js')
		const filePath = path.join(tmpDir, 'device-id')
		const uuid = await getOrCreateDeviceId(filePath)
		expect(uuid).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		)
		const persisted = (await readFile(filePath, 'utf-8')).trim()
		expect(persisted).toBe(uuid)
	})

	it('returns the same UUID on subsequent calls (stable per box)', async () => {
		const {getOrCreateDeviceId} = await import('./device-id.js')
		const filePath = path.join(tmpDir, 'device-id')
		const first = await getOrCreateDeviceId(filePath)
		const second = await getOrCreateDeviceId(filePath)
		const third = await getOrCreateDeviceId(filePath)
		expect(second).toBe(first)
		expect(third).toBe(first)
	})

	it('regenerates the UUID when the on-disk file is malformed', async () => {
		const {getOrCreateDeviceId} = await import('./device-id.js')
		const filePath = path.join(tmpDir, 'device-id')
		await writeFile(filePath, 'not-a-uuid-at-all\n', 'utf-8')
		const uuid = await getOrCreateDeviceId(filePath)
		expect(uuid).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		)
		// And the file is overwritten with the new valid UUID:
		const persisted = (await readFile(filePath, 'utf-8')).trim()
		expect(persisted).toBe(uuid)
	})

	it('creates parent directory if missing (recursive mkdir)', async () => {
		const {getOrCreateDeviceId} = await import('./device-id.js')
		const nestedPath = path.join(tmpDir, 'a', 'b', 'c', 'device-id')
		const uuid = await getOrCreateDeviceId(nestedPath)
		expect(uuid).toMatch(/^[0-9a-f-]{36}$/i)
		const persisted = (await readFile(nestedPath, 'utf-8')).trim()
		expect(persisted).toBe(uuid)
	})

	it('persists with mode 0600 (best-effort; skipped on FS that does not enforce)', async () => {
		const {getOrCreateDeviceId} = await import('./device-id.js')
		const filePath = path.join(tmpDir, 'device-id')
		await getOrCreateDeviceId(filePath)
		// On POSIX FS, mode would be 0o600. On Windows / NTFS the FS may
		// not enforce POSIX modes — the chmod helper is wrapped in
		// try/catch precisely to handle that gracefully. We assert the
		// happy-path POSIX behavior when available and accept the test
		// env reality otherwise.
		const {stat} = await import('node:fs/promises')
		const s = await stat(filePath)
		// Only assert on POSIX-mode-aware platforms:
		if (process.platform !== 'win32') {
			expect(s.mode & 0o777).toBe(0o600)
		} else {
			expect(typeof s.mode).toBe('number')
		}
	})

	it('UUIDv4 is statistically unique across separate paths (sanity)', async () => {
		const {getOrCreateDeviceId} = await import('./device-id.js')
		const a = await getOrCreateDeviceId(path.join(tmpDir, 'a'))
		const b = await getOrCreateDeviceId(path.join(tmpDir, 'b'))
		expect(a).not.toBe(b)
	})

	it('handles a pre-existing file with surrounding whitespace', async () => {
		const {getOrCreateDeviceId} = await import('./device-id.js')
		const filePath = path.join(tmpDir, 'device-id')
		const known = '550e8400-e29b-41d4-a716-446655440000'
		await writeFile(filePath, `\n  ${known}  \n`, 'utf-8')
		const uuid = await getOrCreateDeviceId(filePath)
		expect(uuid).toBe(known)
	})
})

describe('account/device-id.ts — chmod retry path', () => {
	it('survives a chmod failure without throwing (non-fatal)', async () => {
		// Patch chmod to throw on first call; helper must catch & continue.
		vi.resetModules()
		vi.doMock('node:fs/promises', async (orig) => {
			const real = (await orig()) as typeof import('node:fs/promises')
			return {
				...real,
				chmod: vi.fn().mockRejectedValue(new Error('EPERM')),
			}
		})
		const tmp = await mkdtemp(path.join(tmpdir(), 'livos-device-id-test-'))
		try {
			const {getOrCreateDeviceId} = await import('./device-id.js')
			const filePath = path.join(tmp, 'device-id')
			const uuid = await getOrCreateDeviceId(filePath)
			expect(uuid).toMatch(/^[0-9a-f-]{36}$/i)
		} finally {
			await rm(tmp, {recursive: true, force: true}).catch(() => {})
			vi.doUnmock('node:fs/promises')
		}
	})
})
