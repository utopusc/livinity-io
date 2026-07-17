import nodePath from 'node:path'
import {pipeline} from 'node:stream/promises'

import express from 'express'
import fse from 'fs-extra'
import bcrypt from 'bcryptjs'

import {findUserByUsername, findUserById} from '../database/index.js'

import type {ApiOptions} from '../server/index.js'
import {fileUserContext, type FileUserInfo} from './files.js'
import {webdavHomeDir} from './webdav.js'
import {
	hashKey,
	findShareByHash,
	incrementDownload,
	touchLastAccessed,
	constantTimeHashEqual,
	ShareTokenNegativeCache,
	type FileShareRow,
} from './share-tokens.js'

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

// Phase 329-05 FILES-05 (D-07 / T-329-14) — loopback-only guard for the SFTPGo
// external_auth_hook endpoint. Only the local SFTPGo daemon may reach it.
// NOTE: Caddy reverse-proxies PUBLIC traffic to 127.0.0.1:8080 too, so a loopback
// peer address alone is necessary-but-NOT-sufficient. The discriminator is the
// reverse-proxy forwarding headers: Caddy stamps X-Forwarded-* on every proxied
// (public) request, whereas SFTPGo's direct hook POST carries none. So we require
// BOTH a loopback TCP peer AND the total absence of any forwarding header.
function isLoopbackWebdavAuthRequest(request: express.Request): boolean {
	const remote = request.socket.remoteAddress ?? ''
	const isLoopbackPeer = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
	if (!isLoopbackPeer) return false
	const forwardedHeaders = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip']
	if (forwardedHeaders.some((header) => request.headers[header] !== undefined)) return false
	return true
}

export default function api({publicApi, privateApi, livinityd}: ApiOptions) {
	// Phase 329-05 FILES-05 (D-07) — the SFTPGo `external_auth_hook` target.
	// Registered on the RAW app (NOT the /api/files router, which SFTPGo can't
	// address) at the ABSOLUTE path the 329-04 wrapper points webdavd at:
	//   http://127.0.0.1:8080/api/internal/webdav-auth  (external_auth_scope=1)
	// LOOPBACK-ONLY (isLoopbackWebdavAuthRequest, T-329-14): only the local SFTPGo
	// daemon may reach it. It reads the presented username+password (SFTPGo's
	// password-scope hook body), looks the user up in the EXISTING PG bcrypt user
	// table (findUserByUsername) and bcrypt-compares — livinityd stays the SOLE
	// source of truth, NO hash is duplicated into SFTPGo. On success it returns the
	// SFTPGo user object (status 1, per-user home_dir, full perms on that home); on
	// ANY failure it returns an empty `{}` — a CONSTANT response (SFTPGo denies a
	// user with no username) that NEVER reveals whether the username or the password
	// was wrong. The password is NEVER logged.
	if (livinityd.server.app) {
		livinityd.server.app.post(
			'/api/internal/webdav-auth',
			// Route-scoped JSON parser (the module has no global body parser). SFTPGo's
			// hook body is tiny (username/password/ip/protocol) — a 4kb cap is ample.
			express.json({limit: '4kb'}),
			async (request, response) => {
				// Reject anything that isn't a direct local SFTPGo call (loopback + no XFF).
				if (!isLoopbackWebdavAuthRequest(request)) return response.status(403).json({})

				const body = (request.body ?? {}) as {username?: unknown; password?: unknown}
				const username = typeof body.username === 'string' ? body.username : ''
				const password = typeof body.password === 'string' ? body.password : ''

				// Empty JSON body → SFTPGo treats a user with no username as auth-denied.
				// Single constant failure path (no username/password oracle).
				const deny = () => response.status(200).json({})

				if (!username || !password) return deny()

				try {
					const user = await findUserByUsername(username)
					if (!user || !user.isActive || !user.hashedPassword) return deny()

					const passwordOk = await bcrypt.compare(password, user.hashedPassword)
					if (!passwordOk) return deny()

					// SUCCESS — the SFTPGo user object. home_dir = the user's OWN data root
					// (per-user isolation, D-07 — never Samba's shared account); full
					// permissions scoped to that home only.
					return response.status(200).json({
						status: 1,
						username: user.username,
						home_dir: webdavHomeDir(livinityd, user.username),
						permissions: {'/': ['*']},
					})
				} catch (error) {
					// Fail closed. Never leak internals; the password is never in scope of the log.
					livinityd.logger.error('webdav-auth lookup failed', error)
					return deny()
				}
			},
		)
	}

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

			// Phase 336 (ACLUI-01) — /upload writes DIRECTLY (unlike save-text, it
			// does NOT go through saveTextFile's getAllowedOperations 'writable'
			// gate), so a read-only /Shared cross-user path would otherwise be
			// writable here. Require a WRITE grant on a /Shared target before any
			// write; a no-op for own-tree paths (governed by their own rules).
			try {
				await livinityd.files.assertSharedWritable(request.query.path)
			} catch {
				response.setHeader('Connection', 'close')
				return response.status(403).json({error: '[operation-not-allowed]'})
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

	// ═══════════════════════════════════════════════════════════════════════
	// Phase 324-01 FILES-01 — PUBLIC share links (D-01..D-05, D-18).
	//
	// The ONE deliberate unauthenticated surface in the file API. Registered on
	// `publicApi` (NO LIVINITY_PROXY_TOKEN gate) with `/api/files/share/` added
	// to APEX_PUBLIC_PREFIXES. The signed opaque `liv_share_<32>` token IS the
	// auth. THREE independent GET routes — /share/:token, /:token/download,
	// /:token/thumbnail — each INDEPENDENTLY re-run the FULL validation chain via
	// resolveShare(): NO `req.shareOk` trusted across handlers (CVE-2026-45282).
	// Path resolution ALWAYS runs inside fileUserContext.run(owner) — a no-cookie
	// request resolves the OWNER's tree, never anon/admin/another-user (D-04).
	// not-found / revoked / expired / exhausted / deactivated-owner / escaped
	// sub-path ALL collapse to the IDENTICAL generic 404 `[share-not-available]`
	// (D-05 enumeration resistance). Password-required MAY differ (401); wrong-
	// password vs rate-limited MUST NOT differ (Task 3 / D-05).
	// ═══════════════════════════════════════════════════════════════════════

	// Per-process negative cache for the token-hash hot path (D-01) — a
	// brute-force-throttle aid; the per-token Redis rate-limit (D-03) is the
	// non-negotiable control.
	const shareNegCache = new ShareTokenNegativeCache()

	// The single generic "not available" response. not-found == revoked ==
	// expired == exhausted == deactivated-owner == escaped-path (D-05).
	const shareNotAvailable = (response: express.Response) =>
		response.status(404).json({error: '[share-not-available]'})

	// Phase 324-01 (D-03/D-05) — per-token password rate-limit window.
	const SHARE_PW_MAX_ATTEMPTS = 10 // per window, per token
	const SHARE_PW_WINDOW_SECONDS = 300 // 5 min

	// The ONE password-denial response (D-05). Called by BOTH the wrong-password
	// branch AND the rate-limited branch so the two are byte-identical — an
	// attacker cannot tell a bad password from a throttle. DISTINCT from the
	// password-required prompt (no submission), which MAY differ (UX, D-05).
	const sharePasswordDenied = (response: express.Response) =>
		response.status(401).json({error: '[share-wrong-password]'})

	// Per-token brute-force rate-limit (D-03) — hand-built from Redis INCR+EXPIRE
	// (no rate-limit middleware exists). Keyed on the token HASH so throttling one
	// token never affects another. Fails OPEN on a Redis error (the 192-bit token
	// + bcryptjs are the primary controls; a Redis outage must not lock out a
	// legitimate viewer) — the outage is logged WITHOUT the password.
	const shareRateLimited = async (tokenHash: string): Promise<boolean> => {
		try {
			const redis = livinityd.ai.redis
			const key = `share:rl:${tokenHash}`
			const count = await redis.incr(key)
			if (count === 1) await redis.expire(key, SHARE_PW_WINDOW_SECONDS)
			return count > SHARE_PW_MAX_ATTEMPTS
		} catch (error) {
			livinityd.logger.error('[files.share] rate-limit check failed — failing open', error)
			return false
		}
	}

	// Per-share unlock-grant cookie name (D-03). Bound to the row id; a UUID
	// stripped to alnum is a valid cookie-name token.
	const shareCookieName = (shareId: string) => `livshare_${shareId.replace(/[^a-zA-Z0-9]/g, '')}`

	// Confine a client-supplied sub-path to WITHIN the share's virtual path
	// (directory shares, D-06). Reject anything that normalises outside the share
	// root BEFORE it reaches virtualToSystemPath (which independently re-checks
	// escapes-base against the owner's base dir — belt AND suspenders, D-04).
	const confineSubPath = (shareVirtualPath: string, sub: string): string => {
		if (!sub) return shareVirtualPath
		const joined = nodePath.posix.normalize(nodePath.posix.join(shareVirtualPath, sub))
		if (joined !== shareVirtualPath && !joined.startsWith(`${shareVirtualPath}/`)) {
			throw new Error('[escapes-share]')
		}
		return joined
	}

	type ResolvedShare = {row: FileShareRow; owner: FileUserInfo}

	// Verify the per-token unlock-grant cookie (D-03). True IFF a valid,
	// unexpired grant bound to THIS shareId is present (audience + shareId
	// binding — a grant for another share is rejected).
	const shareGrantValid = async (request: express.Request, shareId: string): Promise<boolean> => {
		const cookie = request.cookies?.[shareCookieName(shareId)]
		if (typeof cookie !== 'string' || !cookie) return false
		try {
			const claims = await livinityd.server.verifyShareGrant(cookie)
			return claims.shareId === shareId
		} catch {
			return false
		}
	}

	// The FULL validation chain, re-run independently by EVERY sub-route. Returns
	// the resolved {row, owner} on success, or null AFTER having already written
	// the (generic) failure response. NEVER trusts a caller-supplied "ok" flag.
	//
	// Task 2 scope: hash → not-revoked → not-expired (baked into findShareByHash)
	// → constant-time compare → password-grant-cookie → download-limit → owner.
	// Task 3 augments the password branch with the bcryptjs submission compare +
	// the per-token Redis rate-limit + grant-cookie minting.
	const resolveShare = async (
		request: express.Request,
		response: express.Response,
	): Promise<ResolvedShare | null> => {
		const token = request.params.token
		if (typeof token !== 'string' || !token) {
			shareNotAvailable(response)
			return null
		}
		const tokenHash = hashKey(token)

		// Negative-cache fast path — an already-known-invalid token skips PG.
		if (shareNegCache.isInvalid(tokenHash)) {
			shareNotAvailable(response)
			return null
		}

		// findShareByHash filters revoked_at IS NULL AND not-expired in SQL, so a
		// not-found / revoked / expired share ALL map to null — indistinguishable.
		let row: FileShareRow | null = null
		try {
			row = await findShareByHash(tokenHash)
		} catch (error) {
			// Fail closed — a PG outage must not leak a 500 stack to the public.
			livinityd.logger.error('[files.share] findShareByHash threw — failing closed', error)
			shareNotAvailable(response)
			return null
		}
		if (!row) {
			shareNegCache.setInvalid(tokenHash)
			shareNotAvailable(response)
			return null
		}

		// Defense-in-depth constant-time compare (T-324-01). SELECT_COLS excludes
		// token_hash so this is a degenerate self-compare that pins the code path
		// to the constant-time primitive without changing the posture (mirrors
		// api-keys/bearer-auth.ts:205-210).
		const rowHash = (row as {tokenHash?: string}).tokenHash ?? tokenHash
		if (!constantTimeHashEqual(tokenHash, rowHash)) {
			shareNegCache.setInvalid(tokenHash)
			shareNotAvailable(response)
			return null
		}

		// ── Password branch (D-03) ───────────────────────────────────────────
		// A password-protected share is satisfied by EITHER a still-valid per-token
		// unlock grant cookie OR a fresh correct password submitted this request.
		//   - no grant + no submitted password → 401 password-required (MAY differ)
		//   - over the per-token rate-limit      → 401 wrong-password (identical to↓)
		//   - wrong password                     → 401 wrong-password
		//   - correct password                   → mint a ~30-min grant cookie
		// The submitted password rides the `x-share-password` header (never the
		// URL/query) and is NEVER logged.
		if (row.passwordHash) {
			const alreadyUnlocked = await shareGrantValid(request, row.id)
			if (!alreadyUnlocked) {
				const submittedHeader = request.headers['x-share-password']
				const submitted = typeof submittedHeader === 'string' ? submittedHeader : ''
				if (!submitted) {
					// No submission — prompt for the password (MAY differ, D-05).
					response.status(401).json({error: '[share-password-required]'})
					return null
				}
				// Rate-limit BEFORE the compare (per token). Over-cap is a DENIAL
				// byte-identical to a wrong password (no throttle oracle, D-05).
				if (await shareRateLimited(tokenHash)) {
					sharePasswordDenied(response)
					return null
				}
				const passwordOk = await bcrypt.compare(submitted, row.passwordHash)
				if (!passwordOk) {
					sharePasswordDenied(response)
					return null
				}
				// Correct password → mint a short-lived grant BOUND to this share
				// (audience livinityd-share + shareId), scoped to the share routes.
				const {token: grant} = await livinityd.server.signShareGrant(row.id)
				response.cookie(shareCookieName(row.id), grant, {
					httpOnly: true,
					secure: true,
					sameSite: 'strict',
					path: '/api/files/share',
					maxAge: 30 * 60 * 1000, // ~30 min, matches the grant TTL
				})
			}
		}

		// ── Download-limit (D-01) ────────────────────────────────────────────
		// An exhausted share is indistinguishable from not-available (D-05).
		if (row.maxDownloads !== null && row.downloadCount >= row.maxDownloads) {
			shareNotAvailable(response)
			return null
		}

		// ── Owner resolution (D-04) ──────────────────────────────────────────
		// Resolve the OWNER (never anon/admin). A deleted / deactivated owner →
		// generic not-available. The path is resolved by the CALLER inside
		// fileUserContext.run(owner) so it can only reach the owner's tree.
		let owner
		try {
			owner = await findUserById(row.ownerUserId)
		} catch (error) {
			livinityd.logger.error('[files.share] owner lookup threw — failing closed', error)
			shareNotAvailable(response)
			return null
		}
		if (!owner || !owner.isActive) {
			shareNotAvailable(response)
			return null
		}

		return {row, owner: {username: owner.username, role: owner.role as FileUserInfo['role']}}
	}

	// GET /api/files/share/:token — share metadata (+ directory listing). The
	// full chain is re-run here independently (CVE-2026-45282).
	publicApi.get('/share/:token', async (request, response) => {
		const resolved = await resolveShare(request, response)
		if (!resolved) return
		await fileUserContext.run(resolved.owner, async () => {
			try {
				const sub = typeof request.query.path === 'string' ? request.query.path : ''
				const targetVirtual = confineSubPath(resolved.row.virtualPath, sub)
				const systemPath = await livinityd.files.virtualToSystemPath(targetVirtual)
				const status = await livinityd.files.status(systemPath)

				// Best-effort access accounting (not a download).
				await touchLastAccessed(resolved.row.id).catch(() => {})

				const base = {
					name: status.name,
					type: status.type,
					size: status.size,
					modified: status.modified,
					hasPassword: resolved.row.passwordHash !== null,
					expiresAt: resolved.row.expiresAt,
					downloadsRemaining:
						resolved.row.maxDownloads === null
							? null
							: Math.max(0, resolved.row.maxDownloads - resolved.row.downloadCount),
				}

				if (status.type === 'directory') {
					const listing = await livinityd.files.list(targetVirtual)
					// Project children to sub-paths RELATIVE to the share root — never
					// leak the owner's absolute base-dir layout; these relative paths
					// feed straight back into /download?path= and /thumbnail?path=.
					const entries = (listing.files ?? [])
						.filter((f): f is NonNullable<typeof f> => Boolean(f))
						.map((f) => ({
							name: f.name,
							type: f.type,
							size: f.size,
							modified: f.modified,
							subPath: nodePath.posix.relative(resolved.row.virtualPath, f.path),
							hasThumbnail: Boolean(f.thumbnail),
						}))
					return response.json({...base, entries})
				}
				return response.json(base)
			} catch (error) {
				// Deleted / escaped / unreadable → generic not-available (D-04/D-05).
				return shareNotAvailable(response)
			}
		})
	})

	// GET /api/files/share/:token/download[?path=<subpath>] — stream a shared
	// file (or a confined file within a shared directory). Re-runs the FULL chain.
	publicApi.get('/share/:token/download', async (request, response) => {
		const resolved = await resolveShare(request, response)
		if (!resolved) return
		await fileUserContext.run(resolved.owner, async () => {
			let systemPath: string
			try {
				const sub = typeof request.query.path === 'string' ? request.query.path : ''
				const targetVirtual = confineSubPath(resolved.row.virtualPath, sub)
				systemPath = await livinityd.files.virtualToSystemPath(targetVirtual)
				if (!(await fse.exists(systemPath))) throw new Error('not found')
			} catch (error) {
				return shareNotAvailable(response)
			}

			const stat = await fse.stat(systemPath)
			if (stat.isDirectory()) {
				// Directory zip-download is DEFERRED (D-06). The share itself is
				// valid (already authenticated) so this is not an enumeration oracle.
				return response.status(400).json({error: '[directory-download-unsupported]'})
			}

			// Best-effort download accounting BEFORE streaming (D-01).
			await incrementDownload(resolved.row.id).catch(() => {})

			const filename = nodePath.basename(systemPath)
			response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
			return response.sendFile(systemPath)
		})
	})

	// GET /api/files/share/:token/thumbnail[?path=<subpath>] — serve an EXISTING
	// thumbnail for a shared file (never generates one). Re-runs the FULL chain.
	publicApi.get('/share/:token/thumbnail', async (request, response) => {
		const resolved = await resolveShare(request, response)
		if (!resolved) return
		await fileUserContext.run(resolved.owner, async () => {
			try {
				const sub = typeof request.query.path === 'string' ? request.query.path : ''
				const targetVirtual = confineSubPath(resolved.row.virtualPath, sub)
				const systemPath = await livinityd.files.virtualToSystemPath(targetVirtual)
				const hash = await livinityd.files.thumbnails.getThumbnailHash(systemPath)
				const thumbnailSystemPath = livinityd.files.thumbnails.hashToThumbnailSystemPath(hash)
				if (!(await fse.exists(thumbnailSystemPath))) return shareNotAvailable(response)
				return response.sendFile(thumbnailSystemPath)
			} catch (error) {
				return shareNotAvailable(response)
			}
		})
	})
}
