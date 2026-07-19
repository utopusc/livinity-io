// Phase 344-02 XFER-01 — cross-box single-app migration: the IMPORT engine.
//
// Consumes one `.livbundle` produced by 344-01 (app-bundle-export.ts) and reconstructs
// the app on a DIFFERENT box, treating the bundle as UNTRUSTED input even though it came
// from the operator's own box (D-344-4). This module owns the three purely-mechanical,
// docker-free primitives that apps.ts#importAppBundle() orchestrates:
//   1. runImportPrechecks  — schema / appId-charset / version-floor / collision / space
//   2. safeExtractBundle   — path-traversal-safe tar-stream extraction + sha256 verify
//   3. restoreVolumes + RollbackLedger + rollback — volume recreate behind a mockable seam
//
// ⚠️ Never-break: like the export engine, the docker calls are routed through a mutable
// `volumeRestoreAdapter` object (the oom-watch oomInspector / export volumeTarAdapter idiom)
// so offline unit tests overwrite it and NO real docker socket is touched on the dev host.
// D-344-6: bundles are PLAINTEXT — there is NO decrypt path here (deferred from v1).

import {createHash} from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import Dockerode from 'dockerode'
import fse from 'fs-extra'
import tarStream from 'tar-stream'

import {namedVolumeRuntimeName} from './reconcile-volume-ownership.js'
import {
	APP_DATA_PREFIX,
	APP_MANIFEST_ENTRY,
	BUNDLE_SCHEMA_VERSION,
	BundleManifestSchema,
	COMPOSE_ENTRY,
	MANIFEST_ENTRY,
	VOLUMES_PREFIX,
	sha256Hex,
	type BundleManifest,
} from './app-bundle-format.js'

// The App-constructor charset (app.ts:122). appId is the sole string that reaches a path
// on the import side; this is the B1 defense re-asserted right after extraction (the Zod
// refinement on BundleManifestSchema is the FIRST gate; this is belt-and-suspenders).
const APP_ID_RE = /^[a-zA-Z0-9-_]+$/

// Zip-bomb guards (T-344-08): a hard entry cap + a running-uncompressed-byte ceiling
// derived from the manifest's own declared totalBytes (× 1.1 headroom).
const MAX_ENTRIES = 5000
const BYTE_CEILING_FACTOR = 1.1

// The known top-level entry prefixes a valid bundle can carry (untrusted-extraction
// policy: an entry whose name is under NONE of these is rejected).
const EXACT_ENTRIES = new Set<string>([MANIFEST_ENTRY, APP_MANIFEST_ENTRY])
const PREFIX_ENTRIES = [APP_DATA_PREFIX, VOLUMES_PREFIX, 'compose/', 'meta/']

// ---------------------------------------------------------------------------
// 1. Prechecks — pure, docker-free, run as EARLY as possible so a doomed import
//    applies nothing (D-344-8). Order: manifest schema → appId charset → version
//    floor → collision → free space.
// ---------------------------------------------------------------------------

export function runImportPrechecks(
	manifest: BundleManifest,
	ctx: {installedAppIds: string[]; availableBytes: number},
): {ok: true} | {ok: false; reason: string} {
	// Validate the manifest SHAPE first — never trust a field before Zod has parsed it.
	const parsed = BundleManifestSchema.safeParse(manifest)
	if (!parsed.success) return {ok: false, reason: '[bundle-manifest-invalid]'}
	const m = parsed.data

	// B1 (belt-and-suspenders): the schema already pins appId, but assert again so a
	// caller that hand-builds a manifest object still cannot slip a path-y id through.
	if (!APP_ID_RE.test(m.appId)) return {ok: false, reason: '[bundle-manifest-invalid]'}

	// Version FLOOR — a bundle written by a NEWER box (schemaVersion the target does not
	// understand) is rejected honestly rather than half-applied (D-344-8).
	if (m.schemaVersion > BUNDLE_SCHEMA_VERSION) return {ok: false, reason: '[bundle-too-new]'}

	// Collision — importing an id that already exists is REJECTED (no in-place overwrite in
	// v1; the operator uninstalls first — safest, D-344-4).
	if (ctx.installedAppIds.includes(m.appId)) return {ok: false, reason: '[app-already-installed]'}

	// Free space — 20% headroom over the declared totalBytes (the extracted app-data + the
	// live volumes both land under dataDirectory).
	if (m.totalBytes * 1.2 > ctx.availableBytes) return {ok: false, reason: '[insufficient-space]'}

	return {ok: true}
}

// ---------------------------------------------------------------------------
// 2. safeExtractBundle — the UNTRUSTED-input surface. Every tar entry is validated
//    BEFORE a single byte is written; every manifest-declared sha256 is verified AFTER
//    the stream ends and BEFORE apps.ts applies anything (integrity-before-write, the
//    update.sh sacred-sha idiom).
// ---------------------------------------------------------------------------

/**
 * Validate + posix-normalize a tar entry name. Rejects a NUL byte, a backslash (a posix
 * bundle never carries one; on Windows path.join would treat it as a separator), an
 * absolute path, any `..` traversal, and any name under none of the known prefixes.
 * Returns the normalized posix-relative name. Throws '[unsafe-entry]' on any violation.
 */
function assertSafeEntryName(name: string): string {
	if (name.includes('\0')) throw new Error('[unsafe-entry] NUL byte in entry name')
	if (name.includes('\\')) throw new Error('[unsafe-entry] backslash in entry name')
	if (path.posix.isAbsolute(name)) throw new Error('[unsafe-entry] absolute path')
	const norm = path.posix.normalize(name)
	if (norm === '..' || norm.startsWith('../') || norm.startsWith('/') || path.posix.isAbsolute(norm)) {
		throw new Error('[unsafe-entry] path traversal')
	}
	const known = EXACT_ENTRIES.has(norm) || PREFIX_ENTRIES.some((p) => norm.startsWith(p))
	if (!known) throw new Error(`[unsafe-entry] unknown prefix: ${norm}`)
	return norm
}

/**
 * Native-filesystem containment re-check (W addendum): after path.join, the resolved
 * target MUST equal or live under the resolved staging root on THIS host's path style
 * (correct on the Windows test host too). Throws '[unsafe-entry]' on an escape.
 */
function assertContained(stagingRoot: string, target: string): void {
	const root = path.resolve(stagingRoot)
	const resolved = path.resolve(target)
	if (resolved !== root && !resolved.startsWith(root + path.sep)) {
		throw new Error('[unsafe-entry] escapes staging root')
	}
}

export async function safeExtractBundle(
	bundlePath: string,
	stagingRoot: string,
): Promise<{manifest: BundleManifest; total: number}> {
	await fse.ensureDir(stagingRoot)

	// name → {sha256, bytes} for every FILE entry actually written (manifest.json included).
	const recorded = new Map<string, {sha256: string; bytes: number}>()
	let manifest: BundleManifest | null = null
	let entryCount = 0
	// dataBytes counts ONLY the data entries (files + volumes), NOT manifest.json, so it is
	// directly comparable to manifest.totalBytes (which excludes manifest.json). The ceiling
	// is manifest.totalBytes × 1.1 (T-344-08 zip-bomb guard).
	let dataBytes = 0
	let ceiling = Infinity

	await new Promise<void>((resolve, reject) => {
		const extract = tarStream.extract()
		let aborted = false
		const abort = (err: unknown) => {
			if (aborted) return
			aborted = true
			extract.destroy()
			reject(err instanceof Error ? err : new Error(String(err)))
		}

		extract.on('entry', (header, stream, next) => {
			if (aborted) {
				stream.resume()
				return
			}
			try {
				entryCount++
				if (entryCount > MAX_ENTRIES) throw new Error('[unsafe-entry] entry-count ceiling exceeded')

				// Type allowlist — DENY symlink / hardlink / device / fifo / anything non file|dir.
				if (header.type !== 'file' && header.type !== 'directory') {
					throw new Error(`[unsafe-entry] disallowed entry type: ${header.type}`)
				}

				const norm = assertSafeEntryName(header.name)

				// The FIRST entry MUST be manifest.json (the exporter packs it first).
				if (entryCount === 1 && (norm !== MANIFEST_ENTRY || header.type !== 'file')) {
					throw new Error('[bundle-manifest-invalid] manifest.json must be the first entry')
				}

				const target = path.join(stagingRoot, norm)
				assertContained(stagingRoot, target)

				if (header.type === 'directory') {
					stream.resume()
					fse.ensureDir(target).then(() => next()).catch(abort)
					return
				}

				// manifest.json — buffer it, parse+validate, keep in memory for the post-pass.
				if (norm === MANIFEST_ENTRY) {
					const chunks: Buffer[] = []
					stream.on('data', (c: Buffer) => {
						chunks.push(c)
					})
					stream.on('error', abort)
					stream.on('end', () => {
						try {
							const buf = Buffer.concat(chunks)
							const parsed = BundleManifestSchema.safeParse(JSON.parse(buf.toString('utf8')))
							if (!parsed.success) throw new Error('[bundle-manifest-invalid]')
							manifest = parsed.data
							ceiling = manifest.totalBytes * BYTE_CEILING_FACTOR
							recorded.set(norm, {sha256: sha256Hex(buf), bytes: buf.length})
							next()
						} catch (e) {
							abort(e instanceof Error ? e : new Error('[bundle-manifest-invalid]'))
						}
					})
					return
				}

				// A regular file — stream to disk WHILE hashing, enforcing the byte ceiling.
				const hash = createHash('sha256')
				let bytes = 0
				fse
					.ensureDir(path.dirname(target))
					.then(() => {
						const ws = fs.createWriteStream(target)
						ws.on('error', abort)
						ws.on('finish', () => {
							if (aborted) return
							recorded.set(norm, {sha256: hash.digest('hex'), bytes})
							next()
						})
						stream.on('data', (c: Buffer) => {
							bytes += c.length
							dataBytes += c.length
							hash.update(c)
							if (dataBytes > ceiling) {
								ws.destroy()
								abort(new Error('[bundle-too-large] uncompressed-byte ceiling exceeded'))
							}
						})
						stream.on('error', abort)
						stream.pipe(ws)
					})
					.catch(abort)
			} catch (err) {
				stream.resume()
				abort(err)
			}
		})

		extract.on('finish', () => {
			if (!aborted) resolve()
		})
		extract.on('error', abort)

		const rs = fse.createReadStream(bundlePath)
		rs.on('error', abort)
		const gunzip = zlib.createGunzip()
		gunzip.on('error', abort)
		rs.pipe(gunzip).pipe(extract)
	})

	if (!manifest) throw new Error('[bundle-manifest-invalid] no manifest.json found')
	// TS control-flow cannot see the assignment happened inside the Promise closure.
	const m: BundleManifest = manifest

	// --- Post-pass integrity cross-check (BEFORE apps.ts applies anything) ---
	// Every manifest-declared entry+volume MUST be present with a MATCHING sha256; any
	// extracted file NOT declared in the manifest (other than manifest.json) is rejected.
	const expected = new Map<string, string>()
	for (const e of m.entries) expected.set(e.path, e.sha256)
	for (const v of m.volumes) expected.set(v.entryPath, v.sha256)

	for (const [name, sha] of expected) {
		const rec = recorded.get(name)
		if (!rec || rec.sha256 !== sha) throw new Error(`[integrity-failure] ${name}`)
	}
	for (const name of recorded.keys()) {
		if (name === MANIFEST_ENTRY) continue
		if (!expected.has(name)) throw new Error(`[unexpected-entry] ${name}`)
	}

	return {manifest: m, total: dataBytes}
}

// The known entry constant re-export for apps.ts staging (compose entry path).
export {COMPOSE_ENTRY}
