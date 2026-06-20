// Phase 290 R3 (REQ3b / H2 / H3) — gated native icon proxy route tests.
//
// Cases:
//   1. 401 — no LIVINITY_PROXY_TOKEN cookie (privateApi gate).
//   2. 400 — bad icon name (rejects `/`, `..`, empty, >128, disallowed chars).
//   3. 404 — name resolves to nothing.
//   4. 200 + content-type — name resolves to an existing allow-listed file.
//   5. icon-file: 400 bad path, 404 outside allow-list, 200 in allow-list.
import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import type {AddressInfo} from 'node:net'
import {promises as fs} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import nativeIconApi from './native-icon-api.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let server: any = null
let baseUrl = ''
let tmpRoot = ''

// Mounts a tiny app mirroring server/index.ts's createApi(): a privateApi
// router behind a LIVINITY_PROXY_TOKEN cookie gate (401 if absent), with the
// native icon routes registered and pointed at the temp allow-list root.
async function mountApp(): Promise<void> {
	const app = express()
	app.use(cookieParser())

	const privateApi = express.Router()
	privateApi.use((request, response, next) => {
		const token = request.cookies?.LIVINITY_PROXY_TOKEN
		if (token !== 'valid') return response.status(401).json({error: 'unauthorized'})
		return next()
	})

	nativeIconApi(
		{publicApi: express.Router(), privateApi, livinityd: {} as never},
		{
			home: tmpRoot,
			// Allow-list = the temp root so we can create files there cross-platform.
			allowedRoots: () => [tmpRoot],
			// Bare-name resolver: <root>/icons/<name>.png if it exists, else null.
			resolveIcon: async (name: string) => {
				const candidate = path.join(tmpRoot, 'icons', `${name}.png`)
				try {
					await fs.stat(candidate)
					return candidate
				} catch {
					return null
				}
			},
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

beforeEach(async () => {
	tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'livos-icon-test-'))
	await fs.mkdir(path.join(tmpRoot, 'icons'), {recursive: true})
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

describe('GET /api/native/icon/:name', () => {
	test('401 without the proxy-token cookie', async () => {
		const res = await fetch(`${baseUrl}/api/native/icon/gimp`)
		expect(res.status).toBe(401)
	})

	test('400 for a bad icon name (path separator)', async () => {
		// `/` in the name makes Express route to a different (nonexistent) path →
		// 404; the validation is exercised by other disallowed chars below.
		const res = await fetch(`${baseUrl}/api/native/icon/${encodeURIComponent('a b')}`, {
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid'},
		})
		expect(res.status).toBe(400)
	})

	test('400 for a name with a disallowed character', async () => {
		const res = await fetch(`${baseUrl}/api/native/icon/${encodeURIComponent('gi!mp')}`, {
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid'},
		})
		expect(res.status).toBe(400)
	})

	test('404 when the name resolves to nothing', async () => {
		const res = await fetch(`${baseUrl}/api/native/icon/ghost`, {
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid'},
		})
		expect(res.status).toBe(404)
	})

	test('200 + image/png content-type for an existing allow-listed icon', async () => {
		await fs.writeFile(path.join(tmpRoot, 'icons', 'gimp.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
		const res = await fetch(`${baseUrl}/api/native/icon/gimp`, {
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid'},
		})
		expect(res.status).toBe(200)
		expect(res.headers.get('content-type')).toContain('image/png')
		expect(res.headers.get('cache-control')).toContain('max-age=86400')
	})
})

describe('GET /api/native/icon-file', () => {
	test('401 without the proxy-token cookie', async () => {
		const res = await fetch(`${baseUrl}/api/native/icon-file?path=${encodeURIComponent('/usr/share/x.png')}`)
		expect(res.status).toBe(401)
	})

	test('400 for a non-absolute path', async () => {
		const res = await fetch(`${baseUrl}/api/native/icon-file?path=${encodeURIComponent('relative/x.png')}`, {
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid'},
		})
		expect(res.status).toBe(400)
	})

	test('400 for a traversal segment', async () => {
		const res = await fetch(`${baseUrl}/api/native/icon-file?path=${encodeURIComponent('/usr/share/../etc/passwd')}`, {
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid'},
		})
		expect(res.status).toBe(400)
	})

	test('404 for an absolute path outside the allow-list', async () => {
		const res = await fetch(`${baseUrl}/api/native/icon-file?path=${encodeURIComponent('/usr/share/nope.png')}`, {
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid'},
		})
		expect(res.status).toBe(404)
	})

	test('200 for an absolute path inside the allow-list', async () => {
		const abs = path.join(tmpRoot, 'flat-icon.svg')
		await fs.writeFile(abs, '<svg></svg>')
		// The route only accepts forward-slash absolute paths (POSIX Icon= values).
		// On a POSIX test host tmpRoot is already `/...`; skip on Windows where the
		// temp path is a drive path the route's `startsWith('/')` guard rejects.
		if (!abs.startsWith('/')) return
		const res = await fetch(`${baseUrl}/api/native/icon-file?path=${encodeURIComponent(abs)}`, {
			headers: {cookie: 'LIVINITY_PROXY_TOKEN=valid'},
		})
		expect(res.status).toBe(200)
		expect(res.headers.get('content-type')).toContain('image/svg+xml')
	})
})
