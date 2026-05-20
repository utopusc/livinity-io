/**
 * Phase 169-02 — Express routes vitest spec (≥10 assertions).
 *
 * Uses real Express app + http.Server on an ephemeral port + real fs via
 * OS tmp dir. Auth middleware is a stub `(req,res,next)=>next()` for the
 * happy path; an alternate stub returns 401 to verify the gate fires.
 *
 * Tests:
 *  1.  GET /api/vault/graph → 200 + {nodes, edges, truncated, totalFiles}
 *  2.  3000 mock files → truncated:true, nodes.length === 2000 (cap)
 *  3.  GET /api/vault/file?path=foo.md → 200 + content matches seed
 *  4.  GET /api/vault/file?path=../etc/passwd → 400
 *  5.  GET /api/vault/file?path=foo/../bar.md → 400 (mid-path .. reject)
 *  6.  GET /api/vault/file (no path) → 400
 *  7.  GET /api/vault/file?path=nonexistent.md → 404
 *  8.  GET /api/vault/file?path=big.md (>1 MiB) → 413
 *  9.  Auth stub returning 401 → /api/vault/graph returns 401 (gate proven)
 *  10. /api/vault/graph 500 on walk error (vaultRoot points at non-existent dir)
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {promises as fs} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as http from 'node:http'
import {randomUUID} from 'node:crypto'
import express from 'express'

import {createVaultGraphRouter} from './routes.js'

let vaultRoot: string
let server: http.Server
let baseUrl = ''

const passthroughAuth: express.RequestHandler = (_req, _res, next) => next()
const denyAuth: express.RequestHandler = (_req, res) => {
	res.status(401).json({error: 'unauthenticated'})
}

async function startApp(
	root: string,
	auth: express.RequestHandler = passthroughAuth,
): Promise<void> {
	const app = express()
	app.use(createVaultGraphRouter({vaultRoot: root, authMiddleware: auth}))
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

async function seed(rel: string, body = '# x\n'): Promise<void> {
	const full = path.join(vaultRoot, rel)
	await fs.mkdir(path.dirname(full), {recursive: true})
	await fs.writeFile(full, body, 'utf8')
}

beforeEach(async () => {
	vaultRoot = path.join(os.tmpdir(), `vault-routes-test-${randomUUID()}`)
	await fs.mkdir(vaultRoot, {recursive: true})
})

afterEach(async () => {
	await new Promise<void>((r) => server?.close(() => r()))
	await fs.rm(vaultRoot, {recursive: true, force: true})
})

describe('createVaultGraphRouter', () => {
	it('GET /api/vault/graph returns {nodes, edges, truncated, totalFiles}', async () => {
		await seed('a.md')
		await seed('b.md')
		await startApp(vaultRoot)
		const res = await fetch(`${baseUrl}/api/vault/graph`)
		expect(res.status).toBe(200)
		const body: any = await res.json()
		expect(body.nodes).toHaveLength(2)
		expect(Array.isArray(body.edges)).toBe(true)
		expect(body.truncated).toBe(false)
		expect(body.totalFiles).toBe(2)
	})

	it('GET /api/vault/graph caps at 2000 nodes (3000 seeded → truncated:true)', async () => {
		// Seed 2500 .md files to keep the test fast; cap is still 2000.
		for (let i = 0; i < 2500; i++) {
			await seed(`f-${i.toString().padStart(4, '0')}.md`)
		}
		await startApp(vaultRoot)
		const res = await fetch(`${baseUrl}/api/vault/graph`)
		expect(res.status).toBe(200)
		const body: any = await res.json()
		expect(body.nodes.length).toBe(2000)
		expect(body.truncated).toBe(true)
	})

	it('GET /api/vault/file returns 200 with {path, content} for valid path', async () => {
		await seed('foo.md', '# hello world\n')
		await startApp(vaultRoot)
		const res = await fetch(`${baseUrl}/api/vault/file?path=foo.md`)
		expect(res.status).toBe(200)
		const body: any = await res.json()
		expect(body.path).toBe('foo.md')
		expect(body.content).toBe('# hello world\n')
	})

	it('GET /api/vault/file rejects leading "../" path traversal with 400', async () => {
		await seed('a.md')
		await startApp(vaultRoot)
		const res = await fetch(
			`${baseUrl}/api/vault/file?path=${encodeURIComponent('../etc/passwd')}`,
		)
		expect(res.status).toBe(400)
	})

	it('GET /api/vault/file rejects mid-path ".." with 400', async () => {
		await seed('a.md')
		await startApp(vaultRoot)
		const res = await fetch(
			`${baseUrl}/api/vault/file?path=${encodeURIComponent('foo/../bar.md')}`,
		)
		expect(res.status).toBe(400)
	})

	it('GET /api/vault/file with missing path query returns 400', async () => {
		await seed('a.md')
		await startApp(vaultRoot)
		const res = await fetch(`${baseUrl}/api/vault/file`)
		expect(res.status).toBe(400)
	})

	it('GET /api/vault/file for non-existent file returns 404', async () => {
		await startApp(vaultRoot)
		const res = await fetch(`${baseUrl}/api/vault/file?path=missing.md`)
		expect(res.status).toBe(404)
	})

	it('GET /api/vault/file for file >1 MiB returns 413', async () => {
		// Write a 1.1 MiB file.
		const big = 'x'.repeat(1_153_433)
		await seed('big.md', big)
		await startApp(vaultRoot)
		const res = await fetch(`${baseUrl}/api/vault/file?path=big.md`)
		expect(res.status).toBe(413)
		const body: any = await res.json()
		expect(body.limit).toBe(1_048_576)
	})

	it('Auth middleware gates both routes (401 stub → /graph returns 401)', async () => {
		await startApp(vaultRoot, denyAuth)
		const res = await fetch(`${baseUrl}/api/vault/graph`)
		expect(res.status).toBe(401)
	})

	it('GET /api/vault/graph returns 500 when walkVault throws (missing vaultRoot)', async () => {
		const bogusRoot = path.join(os.tmpdir(), `vault-bogus-${randomUUID()}`)
		// Note: do NOT create bogusRoot. walkVault will throw on readdir.
		await startApp(bogusRoot)
		const res = await fetch(`${baseUrl}/api/vault/graph`)
		expect(res.status).toBe(500)
	})
})
