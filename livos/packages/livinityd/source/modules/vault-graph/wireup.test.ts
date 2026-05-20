/**
 * Phase 169-05 — Wire-up integration test (4 end-to-end assertions).
 *
 * Spins up a real Express app on an ephemeral port. Uses `mountVaultGraphRoutes`
 * with a `vaultRootOverride` (tmp dir seeded per test) and an `authOverride`
 * (passthrough by default; one variant deny-401). Real fs, real HTTP — only
 * the auth middleware is mocked. Proves the 169-05 contract end-to-end:
 *
 *  1. /api/vault/graph returns nodes excluding `.deleted-*` tombstones
 *  2. /api/vault/file returns seeded markdown content
 *  3. /api/vault/file rejects `../etc/passwd` path traversal with 400
 *  4. Auth middleware gate: 401 stub → /api/vault/graph returns 401
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import express, {type RequestHandler} from 'express'
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'

import {mountVaultGraphRoutes} from './routes.js'

let tmpDir = ''
let server: http.Server
let baseUrl = ''

function fakeLivinityd() {
	return {
		server: {
			verifyToken: async () => ({userId: 'admin'}),
		},
		logger: {
			log: () => {},
			error: () => {},
		},
	}
}

async function startApp(authStub: RequestHandler): Promise<void> {
	const app = express()
	mountVaultGraphRoutes(app, fakeLivinityd(), {
		vaultRootOverride: tmpDir,
		authOverride: authStub,
	})
	await new Promise<void>((resolve) => {
		server = app.listen(0, () => {
			const addr = server.address()
			if (addr && typeof addr === 'object') {
				baseUrl = `http://127.0.0.1:${addr.port}`
			}
			resolve()
		})
	})
}

beforeEach(async () => {
	tmpDir = await mkdtemp(path.join(os.tmpdir(), 'vault-graph-wireup-'))
	await mkdir(path.join(tmpDir, 'memory'), {recursive: true})
	await writeFile(path.join(tmpDir, 'foo.md'), '# foo\n[[bar]]\n', 'utf8')
	await writeFile(path.join(tmpDir, 'memory', 'bar.md'), '# bar\n', 'utf8')
	await writeFile(path.join(tmpDir, 'memory', 'baz.md'), '# baz\n', 'utf8')
	await writeFile(path.join(tmpDir, '.deleted-old.md'), '# tomb\n', 'utf8')
})

afterEach(async () => {
	await new Promise<void>((r) => server.close(() => r()))
	await rm(tmpDir, {recursive: true, force: true})
})

describe('Phase 169-05 wire-up integration', () => {
	it('GET /api/vault/graph returns nodes excluding .deleted-* tombstones', async () => {
		await startApp((_req, _res, next) => next())
		const res = await fetch(`${baseUrl}/api/vault/graph`)
		expect(res.status).toBe(200)
		const body: any = await res.json()
		expect(body.nodes).toHaveLength(3) // foo.md, memory/bar.md, memory/baz.md
		expect(body.truncated).toBe(false)
		expect(body.totalFiles).toBe(3)
		// The wikilink edge foo.md → memory/bar.md must be present
		expect(body.edges).toContainEqual({
			source: 'foo.md',
			target: 'memory/bar.md',
			type: 'wikilink',
		})
	})

	it('GET /api/vault/file returns seeded markdown content', async () => {
		await startApp((_req, _res, next) => next())
		const res = await fetch(`${baseUrl}/api/vault/file?path=foo.md`)
		expect(res.status).toBe(200)
		const body: any = await res.json()
		expect(body.path).toBe('foo.md')
		expect(body.content).toContain('# foo')
	})

	it('GET /api/vault/file rejects "../" path traversal with 400', async () => {
		await startApp((_req, _res, next) => next())
		const res = await fetch(
			`${baseUrl}/api/vault/file?path=${encodeURIComponent('../etc/passwd')}`,
		)
		expect(res.status).toBe(400)
	})

	it('Auth middleware gate: deny stub → /api/vault/graph returns 401', async () => {
		await startApp((_req, res) => {
			res.status(401).json({error: 'unauthenticated'})
		})
		const res = await fetch(`${baseUrl}/api/vault/graph`)
		expect(res.status).toBe(401)
	})
})
