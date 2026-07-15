import nodePath from 'node:path'
import {pipeline} from 'node:stream/promises'

import express from 'express'
import fse from 'fs-extra'

import type {ApiOptions} from '../server/index.js'
import {fileUserContext, type FileUserInfo} from './files.js'

// Extract FileUserInfo from Express request (set by privateApi middleware in server/index.ts)
function getFileUserFromRequest(request: express.Request): FileUserInfo | undefined {
	const user = (request as any).currentUser
	if (user?.username && user?.role) {
		return {username: user.username, role: user.role}
	}
	return undefined
}

// Phase 329-07 FILES-04 (D-02) — server-side size ceilings enforced BEFORE any
// content crosses to the browser viewers/editor. Over-cap → the client falls back
// to the existing DownloadDialog. Text edit ≤ 5 MB, read-only preview ≤ 25 MB.
const TEXT_EDIT_MAX_BYTES = 5 * 1024 * 1024 // 5 MB (editor)
const PREVIEW_MAX_BYTES = 25 * 1024 * 1024 // 25 MB (docx/xlsx/pdf preview)

export default function api({publicApi, privateApi, livinityd}: ApiOptions) {
	// Serve thumbnails from the thumbnails directory
	// GET /api/files/thumbnail/:thumbnail
	privateApi.use(
		'/thumbnail',
		// Serve the thumbnail assets
		express.static(livinityd.files.thumbnails.thumbnailDirectory, {
			// Thumbnail assets are named with a hash that only changes when the file is modified
			// So we can cache these aggressively
			maxAge: '1 year',
			immutable: true,
			// Don't serve directory indexes
			index: false,
		}),
		// If we don't get a file hit, return a 404
		(request, response) => response.status(404).json({error: 'not found'}),
	)

	// Downloads a file, directory or multiple files
	// GET /api/files/download?path=/Home/file.txt&path=/Home/file-2.txt
	privateApi.get('/download', async (request, response) => {
		const userInfo = getFileUserFromRequest(request)
		await fileUserContext.run(userInfo, async () => {
			// Normalise a single path or multiple paths into an array
			let virtualPaths: string[] = []
			if (typeof request.query.path === 'string') virtualPaths = [String(request.query.path)]
			if (Array.isArray(request.query.path)) virtualPaths = request.query.path.map(String)

			// Check that at least one path is provided
			if (virtualPaths.length < 1) return response.status(400).json({error: 'bad request'})

			// Get file data
			const files = await Promise.all(
				virtualPaths.map(async (path) => {
					try {
						const systemPath = await livinityd.files.virtualToSystemPath(path)
						if (!(await fse.exists(systemPath))) throw new Error('not found')
						return systemPath
					} catch (error) {
						// This means a file doesn't exist (or can't be safely resolved) so we return a 404
						response.status(404).json({error: 'not found'})
						throw error
					}
				}),
			)

			// If we only have a single file, serve it directly
			if (files.length === 1 && (await fse.stat(files[0])).isFile()) {
				const filename = nodePath.basename(files[0])
				response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
				return response.sendFile(files[0])
			}

			// Create an archive and stream it to the response
			try {
				// For directory or multiple files, create zip archive
				const filename = livinityd.files.archive.zipName(files, {defaultName: 'livinity-files.zip'})
				response.setHeader('Content-Type', 'application/zip')
				response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)

				const zipStream = await livinityd.files.archive.createZipStream(files)
				await pipeline(zipStream, response)
			} catch (error) {
				if ((error as Error).message === 'paths must be in same directory') {
					return response.status(400).json({error: (error as Error).message})
				}

				throw error
			}
		})
	})

	// Views a file
	// GET /api/files/view?path=/Home/file.txt
	privateApi.get('/view', async (request, response) => {
		const userInfo = getFileUserFromRequest(request)
		await fileUserContext.run(userInfo, async () => {
			try {
				if (typeof request.query.path !== 'string') return response.status(400).json({error: 'path is required'})
				const systemPath = await livinityd.files.virtualToSystemPath(request.query.path)
				const status = await livinityd.files.status(systemPath)
				if (status.type === 'directory') return response.status(400).json({error: 'cannot view a directory'})

				// Phase 329-07 FILES-04 (D-02) — expose the file size + the text-edit
				// ceiling so the editor UI can route text files > 5 MB to the
				// DownloadDialog itself, and HARD-reject anything past the 25 MB preview
				// ceiling before streaming — no unbounded content reaches the browser
				// viewers. Small text/preview files serve exactly as before.
				response.setHeader('X-File-Size', String(status.size))
				response.setHeader('X-Edit-Max-Bytes', String(TEXT_EDIT_MAX_BYTES))
				if (status.size > PREVIEW_MAX_BYTES) {
					return response.status(413).json({
						error: '[file-too-large]',
						size: status.size,
						maxBytes: PREVIEW_MAX_BYTES,
					})
				}

				response.sendFile(systemPath)
			} catch (error) {
				return response.status(404).json({error: 'not found'})
			}
		})
	})

	// Saves UTF-8 text content to a file (in-browser editor save path)
	// POST /api/files/save-text   body: {path, content}
	// Phase 329-07 FILES-04 (D-05). Delegates to files.saveTextFile(), which applies
	// the `writable` + per-user quota gate (unlike /upload) and writes atomically.
	// This is a DEDICATED route — the /upload quota bypass is neither reused nor
	// touched. express.json is scoped to this route (the module has no global JSON
	// body parser); the limit is generous enough for a 5 MB text body + JSON
	// envelope, with the exact 5 MB ceiling enforced on `content` below.
	privateApi.post('/save-text', express.json({limit: '8mb'}), async (request, response) => {
		const userInfo = getFileUserFromRequest(request)
		await fileUserContext.run(userInfo, async () => {
			const {path, content} = (request.body ?? {}) as {path?: unknown; content?: unknown}
			if (typeof path !== 'string' || typeof content !== 'string') {
				return response.status(400).json({error: 'path and content are required'})
			}

			// Server-side text-edit ceiling (D-02): reject > 5 MB; the editor UI routes
			// oversize files to the DownloadDialog rather than the editor.
			if (Buffer.byteLength(content, 'utf8') > TEXT_EDIT_MAX_BYTES) {
				return response.status(413).json({error: '[file-too-large]', maxBytes: TEXT_EDIT_MAX_BYTES})
			}

			try {
				const savedPath = await livinityd.files.saveTextFile(path, content)
				return response.status(200).json({path: savedPath})
			} catch (error) {
				const message = (error as Error)?.message ?? 'error saving file'
				// Surface the module's standard error tokens as sensible HTTP statuses.
				if (message === '[quota-exceeded]') return response.status(413).json({error: message})
				if (message === '[operation-not-allowed]') return response.status(403).json({error: message})
				// Path-resolution rejections ([invalid-base]/[escapes-base]/[path-not-absolute]).
				if (message.startsWith('[')) return response.status(400).json({error: message})
				return response.status(500).json({error: 'error saving file'})
			}
		})
	})

	// Uploads a file
	// POST /api/files/upload?path=/Home/file.txt&collision=error|keep-both|replace
	// Note: We must set the `Connection: close` header on error to prevent the XHR upload logic
	// from uploading the entire file before checking for errors in the response. cURL handles this
	// without the extra header, I'm not sure why it's only needed in the browser.
	privateApi.post('/upload', async (request, response) => {
		const userInfo = getFileUserFromRequest(request)
		await fileUserContext.run(userInfo, async () => {
			// Check we have a path
			if (typeof request.query.path !== 'string') {
				response.setHeader('Connection', 'close')
				return response.status(400).json({error: 'path is required'})
			}

			// Get the collision strategy
			const collision = typeof request.query.collision === 'string' ? request.query.collision : 'error'
			const isValidCollisionParameter = ['error', 'keep-both', 'replace'].includes(collision)
			if (!isValidCollisionParameter) {
				response.setHeader('Connection', 'close')
				return response.status(400).json({error: 'invalid collision parameter'})
			}

			// Check path is valid
			let systemPath = await livinityd.files.virtualToSystemPath(request.query.path).catch((error) => {
				response.setHeader('Connection', 'close')
				response.status(400).json({error: 'invalid path'})
				throw error
			})

			// Handle name conflicts
			// TODO: Implement resume support
			const exists = await fse.pathExists(systemPath)
			if (exists) {
				if (collision === 'error') {
					response.setHeader('Connection', 'close')
					return response.status(400).json({error: '[destination-already-exists]'})
					// For 'keep-both' we generate a unique name for the file
				} else if (collision === 'keep-both') systemPath = await livinityd.files.getUniqueName(systemPath)
				// For 'replace' we simply continue with the upload over the original file
			}

			// TODO: Check available disk space
			// We need the frontend to provide the total size of the file

			// Temporary file to store the uploaded data
			const fileName = nodePath.basename(systemPath)
			const directory = nodePath.dirname(systemPath)
			const temporarySystemPath = nodePath.join(directory, `.${fileName}.livinity-upload`)

			// Ensure containing directories exist
			await fse.ensureDir(nodePath.dirname(temporarySystemPath))

			// Write the file
			await pipeline(request, fse.createWriteStream(temporarySystemPath)).catch(async (error) => {
				// Clean up the temporary file
				await fse.remove(temporarySystemPath).catch(() => {})

				// Return an error
				response.setHeader('Connection', 'close')
				response.status(500).json({error: 'error writing file'})
				throw error
			})

			// Rename the temporary file to the final path
			await fse.rename(temporarySystemPath, systemPath)

			// Return success
			return response.status(200).json({path: livinityd.files.systemToVirtualPath(systemPath)})
		})
	})
}
