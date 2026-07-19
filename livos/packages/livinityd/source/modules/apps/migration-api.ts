// Phase 344-03 XFER-01 — the raw Express routes for cross-box single-app migration
// transport (D-344-2 = admin browser: download on source, upload on target). Mounted via
// server/index.ts's `createApi(...)` on `/api/app-migration`, inheriting the privateApi
// LIVINITY_PROXY_TOKEN gate; EACH route additionally asserts the session user's
// role === 'admin' (native-deb-upload precedent — proxy-token proves box-scope, NOT admin).
//
// Two routes, NO public/unauthenticated surface (Never-break: no new listening surface
// beyond these admin-gated ones):
//   - GET  /api/app-migration/download?file=<name>.livbundle  → streams a produced bundle
//     (traversal-safe, size-gated). The bundle is the app's DATA (D-344-6 plaintext) —
//     admin-only both sides is the transport's confidentiality boundary.
//   - POST /api/app-migration/upload?file=<name>.livbundle    → streams an uploaded bundle
//     to a temp file in the exports/incoming staging dir, then renames the COMPLETED file
//     up into the exports dir (temp+rename discipline mirroring files.ts /upload) so a
//     half-uploaded file never appears as a valid `.livbundle`. importBundle then consumes it.
//
// PLAN-CHECK ADDENDUM (W): the upload route is added HERE (not discovered at 344-04 runtime).
// D-344-6: NO passphrase params on either route — v1 bundles are plaintext.

import {randomUUID} from 'node:crypto'
import {createReadStream, createWriteStream} from 'node:fs'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'

import fse from 'fs-extra'
import type express from 'express'

import type {ApiOptions} from '../server/index.js'
import {migrationExportsDir, migrationIncomingDir, resolveBundleInDir} from './migration-routes.js'

// Basename charset (NO slashes → no traversal), ending in `.livbundle`. Mirrors the
// tRPC bundleFileNameSchema so the raw routes gate identically (T-344-13).
const BUNDLE_FILE_RE = /^[a-zA-Z0-9._-]+\.livbundle$/

// Defensive 50 GB ceilings. The bundle is admin-produced on this box; the gate documents
// intent + bounds a pathological transfer (T-344-16 accept / DoS floor). Both directions.
const MAX_BUNDLE_DOWNLOAD_BYTES = 50 * 1024 * 1024 * 1024
const MAX_BUNDLE_UPLOAD_BYTES = 50 * 1024 * 1024 * 1024

/** Admin gate shared by both routes (proxy-token proves box-scope, not admin). */
function requireAdmin(request: express.Request, response: express.Response): boolean {
	const currentUser = (request as unknown as {currentUser?: {role?: string}}).currentUser
	if (currentUser?.role !== 'admin') {
		response.setHeader('Connection', 'close')
		response.status(403).json({error: 'admin only'})
		return false
	}
	return true
}

export default function migrationApi({privateApi, livinityd}: ApiOptions) {
	// ── GET /download?file=<name>.livbundle — admin + traversal-safe + size-gated ──
	privateApi.get('/download', async (request, response) => {
		if (!requireAdmin(request, response)) return

		const file = String(request.query.file ?? '')
		if (!BUNDLE_FILE_RE.test(file)) {
			response.setHeader('Connection', 'close')
			return response.status(400).json({error: 'invalid file'})
		}

		const exportsDir = migrationExportsDir(livinityd)
		let resolved: string
		try {
			resolved = resolveBundleInDir(exportsDir, file) // dirname assert (defense-in-depth)
		} catch {
			response.setHeader('Connection', 'close')
			return response.status(400).json({error: 'invalid file'})
		}

		if (!(await fse.pathExists(resolved))) {
			response.setHeader('Connection', 'close')
			return response.status(404).json({error: 'not found'})
		}

		const {size} = await fse.stat(resolved)
		if (size > MAX_BUNDLE_DOWNLOAD_BYTES) {
			response.setHeader('Connection', 'close')
			return response.status(413).json({error: 'bundle exceeds the download size limit'})
		}

		response.setHeader('Content-Type', 'application/octet-stream')
		response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file)}`)
		response.setHeader('Content-Length', String(size))
		await pipeline(createReadStream(resolved), response)
	})

	// ── POST /upload?file=<name>.livbundle — admin + temp+rename + size-gated ──
	privateApi.post('/upload', async (request, response) => {
		if (!requireAdmin(request, response)) return

		const file = String(request.query.file ?? '')
		if (!BUNDLE_FILE_RE.test(file)) {
			response.setHeader('Connection', 'close')
			return response.status(400).json({error: 'invalid file'})
		}

		const exportsDir = migrationExportsDir(livinityd)
		let finalPath: string
		try {
			finalPath = resolveBundleInDir(exportsDir, file) // final lands strictly inside exportsDir
		} catch {
			response.setHeader('Connection', 'close')
			return response.status(400).json({error: 'invalid file'})
		}

		// Stream to a random temp in the incoming staging dir; a partial upload never
		// appears as a valid `.livbundle` in the listed exports dir (temp+rename discipline).
		const incomingDir = migrationIncomingDir(livinityd)
		await fse.ensureDir(incomingDir)
		const tmp = path.join(incomingDir, `${randomUUID()}.part`)
		let bytes = 0
		let overCap = false
		let cleaned = false
		const cleanup = async () => {
			if (cleaned) return
			cleaned = true
			await fse.remove(tmp).catch(() => {})
		}

		try {
			await new Promise<void>((resolve, reject) => {
				const out = createWriteStream(tmp)
				const onError = (err: unknown) => {
					if (overCap) return // teardown after cap is expected — ignore
					reject(err)
				}
				request.on('data', (chunk: Buffer) => {
					bytes += chunk.length
					if (bytes > MAX_BUNDLE_UPLOAD_BYTES && !overCap) {
						// Over cap: stop writing, discard the partial, pause the request, and
						// resolve so the handler can send a 413 (Connection: close tears the
						// socket down after flush). Same idiom as native-deb-upload-api.
						overCap = true
						request.unpipe(out)
						out.destroy()
						request.pause()
						resolve()
					}
				})
				request.on('error', onError)
				out.on('error', onError)
				out.on('finish', () => resolve())
				request.pipe(out)
			})

			if (overCap) {
				await cleanup()
				response.setHeader('Connection', 'close')
				return response.status(413).json({error: 'upload exceeds the bundle size limit'})
			}

			// Move the COMPLETED temp up into the exports dir under the validated name.
			await fse.ensureDir(exportsDir)
			await fse.move(tmp, finalPath, {overwrite: true})
			cleaned = true // moved — nothing left to clean
			return response.status(200).json({ok: true, file: path.basename(finalPath), bytes})
		} catch (err) {
			await cleanup()
			response.setHeader('Connection', 'close')
			return response
				.status(500)
				.json({ok: false, error: `error receiving upload: ${err instanceof Error ? err.message : String(err)}`})
		} finally {
			await cleanup()
		}
	})
}
