// Phase 290-r6 — admin .deb upload → auto-install → native tile.
// v44.56+ — GENERALIZED to multi-format native app upload (.deb / .AppImage /
// .flatpak / .snap).
//
// Apps like Discord / Chrome are NOT in apt; their official Linux package is a
// .deb (or AppImage / Flatpak bundle / Snap). This route lets a box ADMIN upload
// a local package in the Add Shortcut → Native tab and have it installed and
// surfaced as a native app tile.
//
// Mounted via server/index.ts's `createApi(...)` on the SAME `/api/native`
// namespace as nativeIconApi, so it inherits the EXISTING privateApi
// LIVINITY_PROXY_TOKEN gate (verifyProxyToken). The browser auto-sends that
// cookie (same as /api/files/upload) — NO auth header needed.
//
// SECURITY (critical): EVERY format runs arbitrary code (a .deb / .snap runs
// maintainer scripts; an AppImage / Flatpak runs app code; a Snap installs root).
// The proxy-token gate proves authenticated + box-scope, NOT admin — so this
// route ADDITIONALLY asserts the session user's role === "admin" (the real
// boundary; currentUser is populated from the LIVINITY_SESSION JWT by the
// createApi privateApi middleware). It then:
//   - streams the RAW octet-stream body to a randomUUID /tmp file (pipeline —
//     never express.raw, which would buffer 500 MB in RAM), aborting at the
//     500 MB cap → 413;
//   - validates the written file by format (magic bytes for deb/snap/appimage;
//     extension-trust for flatpak) → 400 otherwise;
//   - calls the format's installer (privileged for deb/snap, unprivileged for
//     appimage/flatpak) + tile derivation;
//   - ALWAYS unlinks the tmp file in a finally.
//
// Contract (shared with the UI agent):
//   POST /api/native/upload-app?name=<displayName>&format=<deb|appimage|flatpak|snap>
//   POST /api/native/upload-deb?name=<displayName>   — alias for format=deb (kept
//                                                       so v44.56 clients work)
//   body = raw package bytes (octet-stream)
//   200 {ok:true,  name, nativeConfigId?}   — installed
//   200 {ok:false, message}                  — clean install failure (incl.
//                                              "runtime not installed" / snapd absent)
//   403 {ok:false, message}                  — caller is not an admin
//   400 {ok:false, message}                  — invalid file (magic / unknown format)
//   413 {ok:false, message}                  — over the 500 MB size cap

import {randomUUID} from 'node:crypto'
import {createWriteStream, promises as fs} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import type express from 'express'

import type {ApiOptions} from '../server/index.js'
import {getPool} from '../database/index.js'
import {buildInstallContext} from './v37-install-service.js'
import {NativeAppConfigStore} from './native-app-config.js'
import {
	installLocalDeb as installLocalDebImpl,
	installLocalAppImage as installLocalAppImageImpl,
	installLocalFlatpak as installLocalFlatpakImpl,
	installLocalSnap as installLocalSnapImpl,
} from './native-installer.js'

// 500 MB cap (raised from 300 MB in v44.56 — AppImages / Snaps can be large;
// Chrome's .deb is ~110 MB, but a bundled AppImage can be several hundred MB).
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024
// Back-compat export name kept for any importer of the old constant.
const MAX_DEB_BYTES = MAX_UPLOAD_BYTES

// ── Format registry ──────────────────────────────────────────────────────────

export type NativeUploadFormat = 'deb' | 'appimage' | 'flatpak' | 'snap'
const VALID_FORMATS: ReadonlySet<string> = new Set(['deb', 'appimage', 'flatpak', 'snap'])

// /tmp extension per format (server-generated randomUUID basename, fixed ext).
const TMP_EXT: Record<NativeUploadFormat, string> = {
	deb: '.deb',
	appimage: '.AppImage',
	flatpak: '.flatpak',
	snap: '.snap',
}

// ── Magic-byte validators (return null when valid, else a human message) ──────

// Debian archive = an `ar` archive. The magic is the 8-byte signature
// `!<arch>\n`, and the FIRST member of a valid .deb is always `debian-binary`.
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

// A Snap is a squashfs image: the first 4 bytes are the little-endian magic
// `hsqs` (0x68 0x73 0x71 0x73). (Big-endian squashfs `sqsh` exists historically
// but snapd always emits little-endian `hsqs`.)
const SQUASHFS_MAGIC = Buffer.from([0x68, 0x73, 0x71, 0x73]) // "hsqs"
const MIN_SNAP_BYTES = 4

async function validateSnapMagic(
	filePath: string,
	deps: {open?: typeof fs.open; stat?: typeof fs.stat} = {},
): Promise<string | null> {
	const statFn = deps.stat ?? fs.stat
	const openFn = deps.open ?? fs.open
	const st = await statFn(filePath)
	if (st.size < MIN_SNAP_BYTES) return 'file too small to be a .snap'
	const handle = await openFn(filePath, 'r')
	try {
		const head = Buffer.alloc(4)
		await handle.read(head, 0, 4, 0)
		if (!head.equals(SQUASHFS_MAGIC)) {
			return 'not a Snap package (bad squashfs magic — expected hsqs)'
		}
		return null
	} finally {
		await handle.close()
	}
}

// An AppImage is an ELF executable: the first 4 bytes are 0x7f 'E' 'L' 'F'.
// AppImage type-2 additionally writes the signature 0x41 0x49 0x02 ("AI\x02") at
// offset 8 — a BONUS confirmation, NOT required (type-1 AppImages lack it).
const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]) // 0x7f E L F
const MIN_APPIMAGE_BYTES = 4

async function validateAppImageMagic(
	filePath: string,
	deps: {open?: typeof fs.open; stat?: typeof fs.stat} = {},
): Promise<string | null> {
	const statFn = deps.stat ?? fs.stat
	const openFn = deps.open ?? fs.open
	const st = await statFn(filePath)
	if (st.size < MIN_APPIMAGE_BYTES) return 'file too small to be an .AppImage'
	const handle = await openFn(filePath, 'r')
	try {
		// Read 11 bytes so we can opportunistically check the type-2 AI\x02 sig too.
		const head = Buffer.alloc(11)
		await handle.read(head, 0, 11, 0)
		if (!head.subarray(0, 4).equals(ELF_MAGIC)) {
			return 'not an AppImage (bad ELF magic)'
		}
		// Bonus (not required): type-2 AppImages carry "AI\x02" at offset 8.
		return null
	} finally {
		await handle.close()
	}
}

/** Per-format validator. `flatpak` has no magic → trust the extension (the
 *  flatpak CLI validates the bundle at install time). */
async function validateByFormat(
	format: NativeUploadFormat,
	filePath: string,
): Promise<string | null> {
	switch (format) {
		case 'deb':
			return validateDebMagic(filePath)
		case 'snap':
			return validateSnapMagic(filePath)
		case 'appimage':
			return validateAppImageMagic(filePath)
		case 'flatpak':
			return null // no magic — flatpak install validates
		default:
			return 'unknown format'
	}
}

/**
 * Test-injectable seams. Production passes nothing → the real fs / store / the
 * per-format installers. The mount in server/index.ts supplies only ApiOptions,
 * so `deps` stays default.
 */
export interface NativeDebUploadApiDeps {
	installLocalDeb?: typeof installLocalDebImpl
	installLocalAppImage?: typeof installLocalAppImageImpl
	installLocalFlatpak?: typeof installLocalFlatpakImpl
	installLocalSnap?: typeof installLocalSnapImpl
	getPool?: typeof getPool
	validateDebMagic?: typeof validateDebMagic
	/** Override the per-format validator (tests). Defaults to validateByFormat. */
	validateByFormat?: typeof validateByFormat
	tmpDir?: string
	/** Override the 500 MB cap (tests use a tiny cap to exercise the stream abort). */
	maxBytes?: number
}

export default function nativeDebUploadApi(
	{privateApi, livinityd}: ApiOptions,
	deps: NativeDebUploadApiDeps = {},
) {
	const installLocalDeb = deps.installLocalDeb ?? installLocalDebImpl
	const installLocalAppImage = deps.installLocalAppImage ?? installLocalAppImageImpl
	const installLocalFlatpak = deps.installLocalFlatpak ?? installLocalFlatpakImpl
	const installLocalSnap = deps.installLocalSnap ?? installLocalSnapImpl
	const poolFn = deps.getPool ?? getPool
	// Back-compat: a caller (the existing test) may inject only `validateDebMagic`.
	// Honor it for the deb format while defaulting the others.
	const debValidator = deps.validateDebMagic ?? validateDebMagic
	const validate =
		deps.validateByFormat ??
		(async (format: NativeUploadFormat, filePath: string) =>
			format === 'deb' ? debValidator(filePath) : validateByFormat(format, filePath))
	const tmpDir = deps.tmpDir ?? os.tmpdir()
	const maxBytes = deps.maxBytes ?? MAX_UPLOAD_BYTES

	/**
	 * Shared upload handler. `format` is resolved by the caller (the alias route
	 * forces 'deb'; the generalized route reads ?format=). All the streamed-to-tmp
	 * machinery, the admin gate, the size cap, and the install-context wiring are
	 * identical across formats — ONLY the validator + installer differ.
	 */
	async function handleUpload(
		request: express.Request,
		response: express.Response,
		format: NativeUploadFormat,
	): Promise<express.Response> {
		// (a) ADMIN GATE — privateApi proves authenticated/box-scope, NOT admin.
		// Every format runs arbitrary code; admin is the real boundary.
		const currentUser = (request as unknown as {currentUser?: {role?: string; id?: string}}).currentUser
		if (currentUser?.role !== 'admin') {
			response.setHeader('Connection', 'close')
			return response.status(403).json({ok: false, message: 'admin only'})
		}

		const name = typeof request.query.name === 'string' ? request.query.name : undefined

		// (b) Stream the RAW body to a randomUUID tmp file, enforcing the size cap
		// by counting bytes. NEVER express.raw (would buffer 500 MB in RAM).
		const tmp = path.join(tmpDir, `livos-native-upload-${randomUUID()}${TMP_EXT[format]}`)
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
					// would let the validator read a partial file. Over-cap resolves
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
					.json({ok: false, message: `upload exceeds the ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB size limit`, code: 'too_large'})
			}

			// (c) Magic-byte / extension validation by format.
			let magicErr: string | null
			try {
				magicErr = await validate(format, tmp)
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
				userId: currentUser.id ?? 'admin',
				redis: redis as never,
				pg: pool,
				logger: {
					info: (m: string) => logger?.log?.(m),
					warn: (m: string) => logger?.error?.(m),
					error: (m: string, extra?: unknown) => logger?.error?.(m, extra as Error | undefined),
				},
			})

			// (e) Install by format. deb/snap run privileged (apt/snap), appimage and
			// flatpak run as the unprivileged daemon user. Every installer returns the
			// SAME {ok,name,nativeConfigId?,message?} shape.
			let result: {ok: boolean; name: string; nativeConfigId?: string; message?: string}
			switch (format) {
				case 'deb':
					result = await installLocalDeb(tmp, installCtx, configStore, {name})
					break
				case 'appimage':
					result = await installLocalAppImage(tmp, installCtx, configStore, {name})
					break
				case 'flatpak':
					result = await installLocalFlatpak(tmp, installCtx, configStore, {name})
					break
				case 'snap':
					result = await installLocalSnap(tmp, installCtx, configStore, {name})
					break
				default:
					await cleanup()
					return response.status(400).json({ok: false, message: 'unknown format'})
			}

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
	}

	// POST /api/native/upload-app?name=<displayName>&format=<deb|appimage|flatpak|snap>
	privateApi.post('/upload-app', async (request, response) => {
		const rawFormat = typeof request.query.format === 'string' ? request.query.format.toLowerCase() : ''
		if (!VALID_FORMATS.has(rawFormat)) {
			response.setHeader('Connection', 'close')
			return response
				.status(400)
				.json({ok: false, message: `unknown or missing format: ${JSON.stringify(request.query.format ?? null)}`})
		}
		return handleUpload(request, response, rawFormat as NativeUploadFormat)
	})

	// POST /api/native/upload-deb?name=<displayName> — back-compat alias (v44.56
	// clients). Identical to /upload-app?format=deb.
	privateApi.post('/upload-deb', async (request, response) => handleUpload(request, response, 'deb'))
}

// Exported for unit tests.
export {validateDebMagic, validateSnapMagic, validateAppImageMagic, validateByFormat, MAX_UPLOAD_BYTES, MAX_DEB_BYTES}
