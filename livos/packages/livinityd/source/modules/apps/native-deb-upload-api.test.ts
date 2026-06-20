// Phase 290-r6 — admin .deb upload route tests.
//
// Mirrors native-icon-api.test.ts: a tiny Express app with a privateApi router
// behind a LIVINITY_PROXY_TOKEN cookie gate (401 if absent) that ALSO populates
// `request.currentUser` from a test header (standing in for the LIVINITY_SESSION
// JWT decode the real createApi middleware does). Seams (installLocalDeb / pool /
// tmpDir) are injected so it runs on the Windows test host without apt/dpkg.
//
// Cases:
//   1. admin gate — non-admin currentUser → 403.
//   2. magic bytes — a non-deb buffer → 400; a buffer with the ar magic +
//      debian-binary member → passes validation (reaches installLocalDeb).
//   3. size cap — an oversize body → 413.
//   4. happy path — admin + valid .deb → 200 {ok:true,...}.

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import type {AddressInfo} from 'node:net'
import {promises as fs} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import nativeDebUploadApi, {
	validateDebMagic,
	validateSnapMagic,
	validateAppImageMagic,
} from './native-deb-upload-api.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let server: any = null
let baseUrl = ''
let tmpRoot = ''
// Records the last installer call (per format) so tests can assert which fn ran.
let installCalls: Array<{format: string; debPath: string; name?: string}> = []
// What the injected installers return.
let installResult: {ok: boolean; name: string; nativeConfigId?: string; message?: string} = {
	ok: true,
	name: 'Discord',
	nativeConfigId: 'cfg-1',
}

// Build a minimal valid squashfs (snap) header: first 4 bytes "hsqs" + slack.
function makeFakeSnap(): Buffer {
	const buf = Buffer.alloc(64)
	buf.write('hsqs', 0, 'ascii')
	return buf
}

// Build a minimal valid ELF (AppImage) header: 0x7f 'E' 'L' 'F' + slack.
function makeFakeAppImage(): Buffer {
	const buf = Buffer.alloc(64)
	buf[0] = 0x7f
	buf.write('ELF', 1, 'ascii')
	// Bonus type-2 AppImage signature at offset 8 (not required by the validator).
	buf[8] = 0x41 // 'A'
	buf[9] = 0x49 // 'I'
	buf[10] = 0x02
	return buf
}

// Build a minimal valid .deb header buffer: ar magic + a first member named
// `debian-binary`. We don't need a real package — only the leading bytes the
// route's validateDebMagic reads — padded past MIN_DEB_BYTES (132).
function makeFakeDeb(): Buffer {
	const magic = Buffer.from('!<arch>\n', 'ascii')
	// ar member header = 60 bytes: name(16) mtime(12) uid(6) gid(6) mode(8) size(10) end(2)
	const header = Buffer.alloc(60, 0x20) // space-filled
	header.write('debian-binary   ', 0, 'ascii') // 16-byte name, space-padded
	header.write('`\n', 58, 'ascii') // ar header end marker
	// `4\n   ` body for the debian-binary member + padding to clear MIN_DEB_BYTES.
	const body = Buffer.alloc(132)
	body.write('2.0\n', 0, 'ascii')
	return Buffer.concat([magic, header, body])
}

async function mountApp(opts: {maxBytes?: number} = {}): Promise<void> {
	const app = express()
	app.use(cookieParser())

	const privateApi = express.Router()
	privateApi.use((request, response, next) => {
		const token = request.cookies?.LIVINITY_PROXY_TOKEN
		if (token !== 'valid') return response.status(401).json({error: 'unauthorized'})
		// Stand-in for the JWT decode: read the test role from a header.
		const role = request.header('x-test-role')
		if (role) {
			;(request as unknown as {currentUser: {id: string; role: string}}).currentUser = {
				id: 'admin-id',
				role,
			}
		}
		return next()
	})

	nativeDebUploadApi(
		{publicApi: express.Router(), privateApi, livinityd: {
			ai: {redis: {} as never},
			nativeAppConfigStore: {} as never,
			logger: {log() {}, error() {}, warn() {}},
		} as never},
		{
			tmpDir: tmpRoot,
			maxBytes: opts.maxBytes,
			getPool: (() => ({}) as never) as never,
			installLocalDeb: (async (
				debPath: string,
				_ctx: unknown,
				_store: unknown,
				o?: {name?: string},
			) => {
				installCalls.push({format: 'deb', debPath, name: o?.name})
				return installResult
			}) as never,
			installLocalAppImage: (async (
				p: string,
				_ctx: unknown,
				_store: unknown,
				o?: {name?: string},
			) => {
				installCalls.push({format: 'appimage', debPath: p, name: o?.name})
				return installResult
			}) as never,
			installLocalFlatpak: (async (
				p: string,
				_ctx: unknown,
				_store: unknown,
				o?: {name?: string},
			) => {
				installCalls.push({format: 'flatpak', debPath: p, name: o?.name})
				return installResult
			}) as never,
			installLocalSnap: (async (
				p: string,
				_ctx: unknown,
				_store: unknown,
				o?: {name?: string},
			) => {
				installCalls.push({format: 'snap', debPath: p, name: o?.name})
				return installResult
			}) as never,
		},
	)

	const api = express.Router()
	api.use(privateApi)
	app.use('/api/native', api)

	await new Promise<void>((resolve) => {
		server = app.listen(0, '127.0.0.1', () => resolve())
	})
	const addr = server.address() as AddressInfo
	baseUrl = `http://127.0.0.1:${addr.port}`
}

async function remount(opts: {maxBytes?: number}): Promise<void> {
	if (server) {
		await new Promise<void>((resolve) => server.close(() => resolve()))
		server = null
	}
	await mountApp(opts)
}

beforeEach(async () => {
	tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'livos-deb-test-'))
	installCalls = []
	installResult = {ok: true, name: 'Discord', nativeConfigId: 'cfg-1'}
	await mountApp()
})

afterEach(async () => {
	if (server) {
		await new Promise<void>((resolve) => server.close(() => resolve()))
		server = null
	}
	if (tmpRoot) {
		await fs.rm(tmpRoot, {recursive: true, force: true}).catch(() => {})
		tmpRoot = ''
	}
})

describe('POST /api/native/upload-deb — admin gate', () => {
	test('401 without the proxy-token cookie', async () => {
		const res = await fetch(`${baseUrl}/api/native/upload-deb?name=Discord`, {
			method: 'POST',
			body: makeFakeDeb(),
		})
		expect(res.status).toBe(401)
	})

	test('403 when the caller is authenticated but NOT an admin', async () => {
		const res = await fetch(`${baseUrl}/api/native/upload-deb?name=Discord`, {
			method: 'POST',
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid', 'x-test-role': 'member'},
			body: makeFakeDeb(),
		})
		expect(res.status).toBe(403)
		const body = (await res.json()) as {ok: boolean}
		expect(body.ok).toBe(false)
		// The install must NOT have run for a non-admin.
		expect(installCalls).toHaveLength(0)
	})

	test('403 when currentUser is absent (no role header)', async () => {
		const res = await fetch(`${baseUrl}/api/native/upload-deb?name=Discord`, {
			method: 'POST',
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid'},
			body: makeFakeDeb(),
		})
		expect(res.status).toBe(403)
		expect(installCalls).toHaveLength(0)
	})
})

describe('POST /api/native/upload-deb — magic-byte validation', () => {
	test('400 for a non-deb buffer (admin)', async () => {
		const res = await fetch(`${baseUrl}/api/native/upload-deb?name=Discord`, {
			method: 'POST',
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid', 'x-test-role': 'admin'},
			// 200 bytes of zeros — past MIN_DEB_BYTES but wrong magic.
			body: Buffer.alloc(200),
		})
		expect(res.status).toBe(400)
		const body = (await res.json()) as {ok: boolean}
		expect(body.ok).toBe(false)
		expect(installCalls).toHaveLength(0)
	})

	test('200 ok:true for a valid .deb (passes validation → reaches install)', async () => {
		const res = await fetch(`${baseUrl}/api/native/upload-deb?name=Discord`, {
			method: 'POST',
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid', 'x-test-role': 'admin'},
			body: makeFakeDeb(),
		})
		expect(res.status).toBe(200)
		const body = (await res.json()) as {ok: boolean; name: string; nativeConfigId?: string}
		expect(body.ok).toBe(true)
		expect(body.name).toBe('Discord')
		expect(body.nativeConfigId).toBe('cfg-1')
		// install reached with the streamed tmp path + the ?name= query.
		expect(installCalls).toHaveLength(1)
		expect(installCalls[0].name).toBe('Discord')
	})

	test('200 ok:false surfaces a clean install failure message', async () => {
		installResult = {ok: false, name: 'Discord', message: 'apt could not satisfy a dependency'}
		const res = await fetch(`${baseUrl}/api/native/upload-deb?name=Discord`, {
			method: 'POST',
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid', 'x-test-role': 'admin'},
			body: makeFakeDeb(),
		})
		expect(res.status).toBe(200)
		const body = (await res.json()) as {ok: boolean; message: string}
		expect(body.ok).toBe(false)
		expect(body.message).toContain('dependency')
	})
})

describe('POST /api/native/upload-deb — size cap', () => {
	test('413 when the body exceeds the size cap', async () => {
		// Remount with a tiny cap (1 KB) and stream a body just over it so the
		// per-chunk byte counter trips the abort → 413, WITHOUT the install ever
		// running. Exercises the real streaming-cap code path deterministically.
		await remount({maxBytes: 1024})
		const oversize = Buffer.alloc(4096) // 4 KB > 1 KB cap
		const res = await fetch(`${baseUrl}/api/native/upload-deb?name=Discord`, {
			method: 'POST',
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid', 'x-test-role': 'admin'},
			body: oversize,
		})
		expect(res.status).toBe(413)
		const body = (await res.json()) as {ok: boolean; code?: string}
		expect(body.ok).toBe(false)
		expect(body.code).toBe('too_large')
		expect(installCalls).toHaveLength(0)
	})
})

describe('POST /api/native/upload-app — format dispatch', () => {
	test('400 for an unknown/missing format', async () => {
		const res = await fetch(`${baseUrl}/api/native/upload-app?name=X&format=msi`, {
			method: 'POST',
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid', 'x-test-role': 'admin'},
			body: makeFakeDeb(),
		})
		expect(res.status).toBe(400)
		const body = (await res.json()) as {ok: boolean; message: string}
		expect(body.ok).toBe(false)
		expect(body.message).toMatch(/unknown or missing format/)
		expect(installCalls).toHaveLength(0)
	})

	test('403 for a non-admin (admin gate still enforced on the new route)', async () => {
		const res = await fetch(`${baseUrl}/api/native/upload-app?name=X&format=snap`, {
			method: 'POST',
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid', 'x-test-role': 'member'},
			body: makeFakeSnap(),
		})
		expect(res.status).toBe(403)
		expect(installCalls).toHaveLength(0)
	})

	test('snap: valid squashfs magic (hsqs) → reaches installLocalSnap', async () => {
		const res = await fetch(`${baseUrl}/api/native/upload-app?name=Spotify&format=snap`, {
			method: 'POST',
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid', 'x-test-role': 'admin'},
			body: makeFakeSnap(),
		})
		expect(res.status).toBe(200)
		expect(installCalls).toHaveLength(1)
		expect(installCalls[0].format).toBe('snap')
		expect(installCalls[0].name).toBe('Spotify')
	})

	test('snap: bad magic → 400 (installer NOT reached)', async () => {
		const res = await fetch(`${baseUrl}/api/native/upload-app?name=X&format=snap`, {
			method: 'POST',
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid', 'x-test-role': 'admin'},
			body: Buffer.alloc(64), // zeros — not "hsqs"
		})
		expect(res.status).toBe(400)
		const body = (await res.json()) as {ok: boolean; message: string}
		expect(body.ok).toBe(false)
		expect(body.message).toMatch(/squashfs/i)
		expect(installCalls).toHaveLength(0)
	})

	test('appimage: valid ELF magic → reaches installLocalAppImage', async () => {
		const res = await fetch(`${baseUrl}/api/native/upload-app?name=Cursor&format=appimage`, {
			method: 'POST',
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid', 'x-test-role': 'admin'},
			body: makeFakeAppImage(),
		})
		expect(res.status).toBe(200)
		expect(installCalls).toHaveLength(1)
		expect(installCalls[0].format).toBe('appimage')
		expect(installCalls[0].name).toBe('Cursor')
	})

	test('appimage: bad magic (not ELF) → 400', async () => {
		const res = await fetch(`${baseUrl}/api/native/upload-app?name=X&format=appimage`, {
			method: 'POST',
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid', 'x-test-role': 'admin'},
			body: Buffer.alloc(64),
		})
		expect(res.status).toBe(400)
		const body = (await res.json()) as {ok: boolean; message: string}
		expect(body.message).toMatch(/ELF/)
		expect(installCalls).toHaveLength(0)
	})

	test('flatpak: no magic — any body reaches installLocalFlatpak', async () => {
		const res = await fetch(`${baseUrl}/api/native/upload-app?name=Telegram&format=flatpak`, {
			method: 'POST',
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid', 'x-test-role': 'admin'},
			body: Buffer.alloc(200), // arbitrary — flatpak install validates
		})
		expect(res.status).toBe(200)
		expect(installCalls).toHaveLength(1)
		expect(installCalls[0].format).toBe('flatpak')
		expect(installCalls[0].name).toBe('Telegram')
	})

	test('deb via /upload-app?format=deb → reaches installLocalDeb (alias parity)', async () => {
		const res = await fetch(`${baseUrl}/api/native/upload-app?name=Discord&format=deb`, {
			method: 'POST',
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid', 'x-test-role': 'admin'},
			body: makeFakeDeb(),
		})
		expect(res.status).toBe(200)
		expect(installCalls).toHaveLength(1)
		expect(installCalls[0].format).toBe('deb')
	})
})

describe('validateDebMagic (unit)', () => {
	test('accepts a buffer with ar magic + debian-binary first member', async () => {
		const file = path.join(tmpRoot, 'good.deb')
		await fs.writeFile(file, makeFakeDeb())
		expect(await validateDebMagic(file)).toBeNull()
	})

	test('rejects a too-small file', async () => {
		const file = path.join(tmpRoot, 'tiny.deb')
		await fs.writeFile(file, Buffer.from('!<arch>\n'))
		expect(await validateDebMagic(file)).toMatch(/too small/i)
	})

	test('rejects a file with the wrong magic', async () => {
		const file = path.join(tmpRoot, 'bad.deb')
		await fs.writeFile(file, Buffer.alloc(200))
		expect(await validateDebMagic(file)).toMatch(/ar magic/i)
	})

	test('rejects a file whose first ar member is not debian-binary', async () => {
		const magic = Buffer.from('!<arch>\n', 'ascii')
		const header = Buffer.alloc(60, 0x20)
		header.write('control.tar.gz  ', 0, 'ascii')
		header.write('`\n', 58, 'ascii')
		const file = path.join(tmpRoot, 'wrong-member.deb')
		await fs.writeFile(file, Buffer.concat([magic, header, Buffer.alloc(132)]))
		expect(await validateDebMagic(file)).toMatch(/debian-binary/i)
	})
})

describe('validateSnapMagic (unit)', () => {
	test('accepts a squashfs (hsqs) header', async () => {
		const file = path.join(tmpRoot, 'good.snap')
		await fs.writeFile(file, makeFakeSnap())
		expect(await validateSnapMagic(file)).toBeNull()
	})

	test('rejects a non-squashfs file', async () => {
		const file = path.join(tmpRoot, 'bad.snap')
		await fs.writeFile(file, Buffer.alloc(64))
		expect(await validateSnapMagic(file)).toMatch(/squashfs/i)
	})
})

describe('validateAppImageMagic (unit)', () => {
	test('accepts an ELF header (with type-2 AI signature)', async () => {
		const file = path.join(tmpRoot, 'good.AppImage')
		await fs.writeFile(file, makeFakeAppImage())
		expect(await validateAppImageMagic(file)).toBeNull()
	})

	test('accepts a type-1 ELF (no AI\\x02 signature)', async () => {
		const buf = Buffer.alloc(64)
		buf[0] = 0x7f
		buf.write('ELF', 1, 'ascii')
		// no AI signature at offset 8 — still valid (type-1)
		const file = path.join(tmpRoot, 'type1.AppImage')
		await fs.writeFile(file, buf)
		expect(await validateAppImageMagic(file)).toBeNull()
	})

	test('rejects a non-ELF file', async () => {
		const file = path.join(tmpRoot, 'bad.AppImage')
		await fs.writeFile(file, Buffer.alloc(64))
		expect(await validateAppImageMagic(file)).toMatch(/ELF/)
	})
})

// Silence an unused-import lint if vi is not otherwise referenced.
void vi
