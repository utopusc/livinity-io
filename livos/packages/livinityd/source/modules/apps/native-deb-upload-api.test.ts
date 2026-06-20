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

import nativeDebUploadApi, {validateDebMagic} from './native-deb-upload-api.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let server: any = null
let baseUrl = ''
let tmpRoot = ''
// Records the last installLocalDeb call so tests can assert it was (not) reached.
let installCalls: Array<{debPath: string; name?: string}> = []
// What the injected installLocalDeb returns.
let installResult: {ok: boolean; name: string; nativeConfigId?: string; message?: string} = {
	ok: true,
	name: 'Discord',
	nativeConfigId: 'cfg-1',
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
				installCalls.push({debPath, name: o?.name})
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

// Silence an unused-import lint if vi is not otherwise referenced.
void vi
