// Phase 290-r6 — admin .deb upload → auto-install → native tile.
//
// Apps like Discord / Chrome are NOT in apt; their official Linux package is a
// .deb. This route lets a box ADMIN upload a local .deb in the Add Shortcut →
// Native tab and have it installed (apt resolves deps) and surfaced as a native
// app tile.
//
// Mounted via server/index.ts's `createApi(...)` on the SAME `/api/native`
// namespace as nativeIconApi, so it inherits the EXISTING privateApi
// LIVINITY_PROXY_TOKEN gate (verifyProxyToken). The browser auto-sends that
// cookie (same as /api/files/upload) — NO auth header needed.
//
// SECURITY (critical): a .deb runs maintainer scripts as ROOT via apt. The
// proxy-token gate proves authenticated + box-scope, NOT admin — so this route
// ADDITIONALLY asserts the session user's role === "admin" (the real boundary;
// currentUser is populated from the LIVINITY_SESSION JWT by the createApi
// privateApi middleware). It then:
//   - streams the RAW octet-stream body to a randomUUID /tmp file (pipeline —
//     never express.raw, which would buffer 300 MB in RAM), aborting at the
//     300 MB cap → 413;
//   - validates the written file is a real Debian archive (ar magic `!<arch>`
//     + first member `debian-binary`) → 400 otherwise;
//   - calls installLocalDeb (privileged apt install + tile derivation);
//   - ALWAYS unlinks the tmp file in a finally.
//
// Contract (shared with the UI agent):
//   POST /api/native/upload-deb?name=<displayName>
//   body = raw .deb bytes (octet-stream)
//   200 {ok:true,  name, nativeConfigId?}   — installed
//   200 {ok:false, message}                  — clean install failure
//   403 {ok:false, message}                  — caller is not an admin
//   400 {ok:false, message}                  — not a valid .deb (magic bytes)
//   413 {ok:false, message}                  — over the 300 MB size cap

import {randomUUID} from 'node:crypto'
import {createWriteStream, promises as fs} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import type express from 'express'

import type {ApiOptions} from '../server/index.js'
import {getPool} from '../database/index.js'
import {buildInstallContext} from './v37-install-service.js'
import {NativeAppConfigStore} from './native-app-config.js'
import {installLocalDeb as installLocalDebImpl} from './native-installer.js'

// 300 MB cap (Chrome's .deb is ~110 MB; 300 MB is generous headroom).
const MAX_DEB_BYTES = 300 * 1024 * 1024

// Debian archive = an `ar` archive. The magic is the 8-byte signature
// `!<arch>\n`, and the FIRST member of a valid .deb is always `debian-binary`.
// We read the leading bytes of the written file and assert both.
const AR_MAGIC = '!<arch>\n'
// ar header: 16-byte member name (space-padded), then 12+6+6+8+10 byte fields,
// then the 2-byte end marker — the name sits at bytes [8, 24).
const AR_FIRST_MEMBER_NAME_OFFSET = 8
const AR_FIRST_MEMBER_NAME_LEN = 16
const MIN_DEB_BYTES = 132 // ar magic (8) + one full 60-byte header + slack

/**
 * Validate the written file is a real Debian archive. Reads only the leading
 * header bytes. Returns null when valid, else a human message.
 */
async function validateDebMagic(
	filePath: string,
	deps: {open?: typeof fs.open; stat?: typeof fs.stat} = {},
): Promise<string | null> {
	const statFn = deps.stat ?? fs.stat
	const openFn = deps.open ?? fs.open
	const st = await statFn(filePath)
	if (st.size < MIN_DEB_BYTES) return 'file too small to be a .deb'
	const handle = await openFn(filePath, 'r')
	try {
		const header = Buffer.alloc(AR_FIRST_MEMBER_NAME_OFFSET + AR_FIRST_MEMBER_NAME_LEN)
		await handle.read(header, 0, header.length, 0)
		const magic = header.toString('ascii', 0, AR_MAGIC.length)
		if (magic !== AR_MAGIC) return 'not a Debian package (bad ar magic)'
		const firstMember = header
			.toString('ascii', AR_FIRST_MEMBER_NAME_OFFSET, AR_FIRST_MEMBER_NAME_OFFSET + AR_FIRST_MEMBER_NAME_LEN)
			.trim()
		// dpkg writes the member name as `debian-binary` (often `debian-binary/`
		// in some toolchains — accept either, but the name MUST start with it).
		if (!firstMember.startsWith('debian-binary')) {
			return 'not a Debian package (first ar member is not debian-binary)'
		}
		return null
	} finally {
		await handle.close()
	}
}

/**
 * Test-injectable seams. Production passes nothing → the real fs / store / apt
 * install. The mount in server/index.ts supplies only ApiOptions, so `deps`
 * stays default.
 */
export interface NativeDebUploadApiDeps {
	installLocalDeb?: typeof installLocalDebImpl
	getPool?: typeof getPool
	validateDebMagic?: typeof validateDebMagic
	tmpDir?: string
	/** Override the 300 MB cap (tests use a tiny cap to exercise the stream abort). */
	maxBytes?: number
}

export default function nativeDebUploadApi(
	{privateApi, livinityd}: ApiOptions,
	deps: NativeDebUploadApiDeps = {},
) {
	const installLocalDeb = deps.installLocalDeb ?? installLocalDebImpl
	const poolFn = deps.getPool ?? getPool
	const validate = deps.validateDebMagic ?? validateDebMagic
	const tmpDir = deps.tmpDir ?? os.tmpdir()
	const maxBytes = deps.maxBytes ?? MAX_DEB_BYTES

	// POST /api/native/upload-deb?name=<displayName>
	privateApi.post('/upload-deb', async (request, response) => {
		// (a) ADMIN GATE — privateApi proves authenticated/box-scope, NOT admin.
		// A .deb runs maintainer scripts as root; admin is the real boundary.
		const currentUser = (request as unknown as {currentUser?: {role?: string}}).currentUser
		if (currentUser?.role !== 'admin') {
			response.setHeader('Connection', 'close')
			return response.status(403).json({ok: false, message: 'admin only'})
		}

		const name = typeof request.query.name === 'string' ? request.query.name : undefined

		// (b) Stream the RAW body to a randomUUID tmp file, enforcing the size cap
		// by counting bytes. NEVER express.raw (would buffer 300 MB in RAM).
		const tmp = path.join(tmpDir, `livos-deb-upload-${randomUUID()}.deb`)
		let bytes = 0
		let overCap = false
		let cleaned = false
		const cleanup = async () => {
			if (cleaned) return
			cleaned = true
			await fs.unlink(tmp).catch(() => {})
		}

		try {
			try {
				await new Promise<void>((resolve, reject) => {
					const out = createWriteStream(tmp)
					const onError = (err: unknown) => {
						// Once over cap we've intentionally torn down the write stream, so
						// any 'write after end'/destroy error from it is expected — ignore.
						if (overCap) return
						reject(err)
					}
					request.on('data', (chunk: Buffer) => {
						bytes += chunk.length
						if (bytes > maxBytes && !overCap) {
							overCap = true
							// Over cap: stop writing, discard the partial file, PAUSE the
							// request to stop pulling more bytes, and resolve immediately so
							// the handler can send the 413 (with `Connection: close`, so the
							// socket — and any not-yet-read remainder — is torn down right
							// after the response is flushed). We do NOT request.destroy()
							// here: destroying mid-stream can race the response write and the
							// client sees a socket reset instead of a clean 413.
							request.unpipe(out)
							out.destroy()
							request.pause()
							resolve()
						}
					})
					request.on('error', onError)
					// Normal path resolves on the write stream's 'finish' (file fully
					// flushed) — NOT on request 'end', which fires before the flush and
					// would let validateDebMagic read a partial file. Over-cap resolves
					// eagerly in the data handler above.
					out.on('error', onError)
					out.on('finish', () => resolve())
					request.pipe(out)
				})
			} catch (err) {
				await cleanup()
				response.setHeader('Connection', 'close')
				return response
					.status(500)
					.json({ok: false, message: `error receiving upload: ${err instanceof Error ? err.message : String(err)}`})
			}

			if (overCap) {
				await cleanup()
				response.setHeader('Connection', 'close')
				return response
					.status(413)
					.json({ok: false, message: `.deb exceeds the ${Math.floor(MAX_DEB_BYTES / (1024 * 1024))} MB size limit`, code: 'too_large'})
			}

			// (c) Magic-byte validation — real Debian archive?
			let magicErr: string | null
			try {
				magicErr = await validate(tmp)
			} catch (err) {
				magicErr = err instanceof Error ? err.message : String(err)
			}
			if (magicErr) {
				await cleanup()
				response.setHeader('Connection', 'close')
				return response.status(400).json({ok: false, message: magicErr})
			}

			// (d) Resolve the install context wiring (redis / pg / store / logger).
			const redis = livinityd?.ai?.redis
			const pool = poolFn()
			const store = livinityd?.nativeAppConfigStore
			if (!redis || !pool) {
				await cleanup()
				return response
					.status(200)
					.json({ok: false, message: 'install service not ready (Redis/Postgres unavailable)'})
			}
			// NativeAppConfigStore is a thin stateless wrapper over redis — build one
			// on demand if the eager boot wiring is absent (documented boot race).
			const configStore = store ?? new NativeAppConfigStore(redis as never)

			const logger = livinityd?.logger
			const installCtx = buildInstallContext({
				userId: (currentUser as {id?: string}).id ?? 'admin',
				redis: redis as never,
				pg: pool,
				logger: {
					info: (m: string) => logger?.log?.(m),
					warn: (m: string) => logger?.error?.(m),
					error: (m: string, extra?: unknown) => logger?.error?.(m, extra as Error | undefined),
				},
			})

			// (e) Install — apt resolves deps; the helper derives the tile.
			const result = await installLocalDeb(tmp, installCtx, configStore, {name})

			// (f) Respond per the contract — clean failure is a 200 {ok:false}.
			return response.status(200).json(
				result.ok
					? {ok: true, name: result.name, ...(result.nativeConfigId ? {nativeConfigId: result.nativeConfigId} : {})}
					: {ok: false, message: result.message ?? 'install failed'},
			)
		} catch (err) {
			response.setHeader('Connection', 'close')
			return response
				.status(200)
				.json({ok: false, message: `install failed: ${err instanceof Error ? err.message : String(err)}`})
		} finally {
			// (g) ALWAYS remove the tmp file.
			await cleanup()
		}
	})
}

// Exported for unit tests.
export {validateDebMagic, MAX_DEB_BYTES}
