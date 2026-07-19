// Phase 344-01 XFER-01 — cross-box single-app migration: the EXPORT engine.
//
// Produces one self-contained, integrity-checked `.livbundle` (a plaintext tar.gz —
// D-344-6) from a running app with ZERO kopia/Backups-v2 dependency. The bundle carries
// the app's bind-mount dir (settings.yml DEK-secrets STRIPPED, D-344-5), every named
// volume (via an alpine-tar sidecar), its compose + livinity-app.yml, an optional
// subdomain capture, and a manifest recording a sha256 for every packed entry so the
// importer (344-02) can verify integrity BEFORE applying any data.
//
// ⚠️ Never-break: this module COPIES the alpine-tar idiom from scheduler/backup.ts — it
// does NOT import backup.ts and does NOT touch the backup job path. The docker seam is
// routed through a mutable `volumeTarAdapter` object (the oom-watch oomInspector idiom)
// so offline unit tests overwrite it and no real docker socket is touched on the dev host.

import {createHash} from 'node:crypto'
import fs from 'node:fs'
import {PassThrough, type Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import zlib from 'node:zlib'

import Dockerode from 'dockerode'
import fse from 'fs-extra'
import yaml from 'js-yaml'
import path from 'node:path'
import tar from 'tar-stream'
import {type Compose} from 'compose-spec-schema'

import getDirectorySize from '../utilities/get-directory-size.js'
import {getDiskUsageByPath} from '../system/system.js'
import {
	classifyVolumeEntry,
	expandVolumeTokens,
	namedVolumeRuntimeName,
} from './reconcile-volume-ownership.js'
import {
	APP_DATA_PREFIX,
	APP_MANIFEST_ENTRY,
	BUNDLE_SCHEMA_VERSION,
	COMPOSE_ENTRY,
	MANIFEST_ENTRY,
	SUBDOMAIN_ENTRY,
	VOLUMES_PREFIX,
	sha256Hex,
	stripDekSecrets,
	type BundleEntry,
	type BundleManifest,
	type BundleVolume,
} from './app-bundle-format.js'

// Local socket only (same as scheduler/backup.ts). Never used in offline tests — the
// volumeTarAdapter seam is overwritten there so this Dockerode instance is never called.
const docker = new Dockerode({socketPath: '/var/run/docker.sock'})

// ---------------------------------------------------------------------------
// alpine:latest tar sidecar — COPIED from scheduler/backup.ts (Never-break: the
// original job path is byte-untouched; this is an independent copy of the idiom).
// Streams `tar czf - -C / data` with the volume mounted read-only at /data.
// ---------------------------------------------------------------------------

async function ensureAlpineImage(): Promise<void> {
	try {
		await docker.getImage('alpine:latest').inspect()
		return
	} catch (err: any) {
		if (err?.statusCode !== 404 && err?.reason !== 'no such image') throw err
	}
	await new Promise<void>((resolve, reject) => {
		docker.pull('alpine:latest', (err: any, stream: any) => {
			if (err) return reject(err)
			docker.modem.followProgress(stream, (e: any) => (e ? reject(e) : resolve()))
		})
	})
}

/**
 * Run `tar czf - data` inside an ephemeral alpine container with `runtimeVolumeName`
 * mounted read-only at /data. Returns a Readable of the tar.gz bytes. On non-zero exit
 * the stream is destroyed with an error carrying the captured stderr (caller propagates).
 *
 * T-344-04: the image tag (`alpine:latest`) and Cmd are FIXED literals — no caller/manifest
 * string ever reaches Image/Cmd; the volume is mounted `:ro`. Same idiom as the backup path.
 */
async function runVolumeTarExport(runtimeVolumeName: string): Promise<Readable> {
	await ensureAlpineImage()
	const container = await docker.createContainer({
		Image: 'alpine:latest',
		Cmd: ['tar', 'czf', '-', '-C', '/', 'data'],
		AttachStdout: true,
		AttachStderr: true,
		Tty: false,
		HostConfig: {
			Binds: [`${runtimeVolumeName}:/data:ro`],
			AutoRemove: true,
		},
	})
	const muxStream = await container.attach({stream: true, stdout: true, stderr: true, hijack: true})
	await container.start()

	const stdout = new PassThrough()
	const stderr = new PassThrough()
	docker.modem.demuxStream(muxStream, stdout, stderr)

	muxStream.on('end', () => {
		stdout.end()
		stderr.end()
	})
	muxStream.on('error', (err) => stdout.destroy(err))

	const stderrChunks: Buffer[] = []
	stderr.on('data', (c: Buffer) => stderrChunks.push(c))

	container
		.wait()
		.then((res: any) => {
			if (res?.StatusCode !== 0) {
				const errText = Buffer.concat(stderrChunks).toString('utf-8').slice(0, 500)
				stdout.destroy(new Error(`[bundle-tar-failed] alpine tar exit ${res?.StatusCode}: ${errText}`))
			}
		})
		.catch((err) => stdout.destroy(err))

	return stdout
}

/**
 * Estimate a named volume's raw byte size via `du -sb /data` in the same read-only
 * alpine sidecar. Used by the B3 precheck (before app.stop) so a doomed export never
 * incurs downtime. Best-effort: any failure returns 0 (the precheck is a floor, not a
 * hard cap — an unknown volume just does not add to the estimate). Fixed literal Cmd/Image.
 */
async function runVolumeSizeEstimate(runtimeVolumeName: string): Promise<number> {
	await ensureAlpineImage()
	const container = await docker.createContainer({
		Image: 'alpine:latest',
		Cmd: ['du', '-sb', '/data'],
		AttachStdout: true,
		AttachStderr: true,
		Tty: false,
		HostConfig: {
			Binds: [`${runtimeVolumeName}:/data:ro`],
			AutoRemove: true,
		},
	})
	const muxStream = await container.attach({stream: true, stdout: true, stderr: true, hijack: true})
	const stdout = new PassThrough()
	const stderr = new PassThrough()
	docker.modem.demuxStream(muxStream, stdout, stderr)
	const chunks: Buffer[] = []
	stdout.on('data', (c: Buffer) => chunks.push(c))
	await container.start()
	await container.wait().catch(() => {})
	const out = Buffer.concat(chunks).toString('utf-8').trim()
	const n = parseInt(out.split(/\s+/)[0], 10)
	return Number.isFinite(n) ? n : 0
}

/**
 * Mutable docker seam (oom-watch oomInspector idiom). Offline tests overwrite
 * `.exportVolume` / `.estimateBytes` with fixtures so NO real docker is touched. ESM
 * internal calls bind to this module-local ref, so routing through this object is the seam.
 */
export const volumeTarAdapter: {
	exportVolume: (name: string) => Promise<Readable>
	estimateBytes: (name: string) => Promise<number>
} = {
	exportVolume: runVolumeTarExport,
	estimateBytes: runVolumeSizeEstimate,
}

// ---------------------------------------------------------------------------
// Named-volume enumeration — REUSES the tested reconcile helpers (no re-implementation
// of volume classification). Returns the runtime name of every non-external top-level
// named volume ACTUALLY referenced by a service, de-duplicated.
// ---------------------------------------------------------------------------

export function enumerateNamedVolumes(
	compose: Compose,
	appDataDir: string,
	projectName: string,
	rootDir: string,
): {key: string; runtimeName: string}[] {
	const topLevelVols = (compose as any).volumes ?? {}
	const namedVolumeKeys = new Set(
		Object.keys(topLevelVols).filter((k) => !(topLevelVols[k] && topLevelVols[k].external === true)),
	)
	const services = compose.services ?? {}
	const seen = new Set<string>()
	const out: {key: string; runtimeName: string}[] = []
	for (const [, service] of Object.entries(services)) {
		for (const rawEntry of (service as any).volumes ?? []) {
			const entry = expandVolumeTokens(rawEntry, appDataDir, rootDir)
			const cls = classifyVolumeEntry(entry, namedVolumeKeys, appDataDir)
			if (cls.kind !== 'named') continue
			if (seen.has(cls.key)) continue
			seen.add(cls.key)
			out.push({key: cls.key, runtimeName: namedVolumeRuntimeName(projectName, cls.key)})
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// exports-dir housekeeping — list + prune old bundles. Missing dir → empty, no throw.
// ---------------------------------------------------------------------------

const BUNDLE_EXT = '.livbundle'

export async function listBundleFiles(
	exportsDir: string,
): Promise<{path: string; bytes: number; mtimeMs: number}[]> {
	if (!(await fse.pathExists(exportsDir))) return []
	const names = (await fse.readdir(exportsDir)) as string[]
	const out: {path: string; bytes: number; mtimeMs: number}[] = []
	for (const name of names) {
		if (!name.endsWith(BUNDLE_EXT)) continue
		const full = path.join(exportsDir, name)
		try {
			const st = await fse.stat(full)
			if (!st.isFile()) continue
			out.push({path: full, bytes: st.size, mtimeMs: st.mtimeMs})
		} catch {
			// Raced deletion / transient stat failure — skip this entry, never throw.
		}
	}
	// Newest first (mtime desc).
	out.sort((a, b) => b.mtimeMs - a.mtimeMs)
	return out
}

/**
 * Keep the `keepLast` NEWEST `.livbundle` files, delete the rest. Returns the removed
 * paths. Missing dir → nothing removed, no throw.
 */
export async function pruneBundles(exportsDir: string, {keepLast}: {keepLast: number}): Promise<string[]> {
	const files = await listBundleFiles(exportsDir) // already newest-first
	const doomed = files.slice(Math.max(0, keepLast))
	const removed: string[] = []
	for (const f of doomed) {
		try {
			await fse.remove(f.path)
			removed.push(f.path)
		} catch {
			// Best-effort prune — a failed delete must not abort the export.
		}
	}
	return removed
}

// ---------------------------------------------------------------------------
// exportAppBundle — stop → pack (per-entry sha256, DEK-strip) → start → prune.
// ---------------------------------------------------------------------------

/** The App surface exportAppBundle needs — structural so offline tests pass a double. */
export interface ExportableApp {
	id: string
	dataDirectory: string
	state: string
	readCompose: () => Promise<Compose>
	readManifest: () => Promise<{version?: string; [k: string]: unknown}>
	stop: (opts?: {persistState?: boolean}) => Promise<unknown>
	start: () => Promise<unknown>
}

export interface ExportDeps {
	/** source box release string, recorded in the manifest (informational). */
	boxRelease: string
	/** directory the `.livbundle` is written to (created if missing). */
	exportsDir: string
	/** livinityd data root for ${UMBREL_ROOT}/${LIVINITY_ROOT} token expansion; default = strip /app-data/<id>. */
	dataDirectory?: string
	/** SubdomainConfig capture (Redis-backed, NOT in app-data) — packed at meta/subdomain.json. */
	subdomainCapture?: unknown
	/** how many newest bundles to retain after this export (default 5). */
	keepLast?: number
	/** injectable app-data size (bytes) — default real `du`; offline tests stub it. */
	getDirSize?: (p: string) => Promise<number>
	/** injectable free-space (bytes available) at a path — default real `df`; offline tests stub it. */
	getDiskFree?: (p: string) => Promise<number>
}

type ProgressFn = (p: {progress: number; description: string}) => void

// Recursively list every regular file under `dir` as POSIX-relative paths.
async function walkFiles(dir: string, base = dir): Promise<string[]> {
	const out: string[] = []
	let names: string[]
	try {
		names = (await fse.readdir(dir)) as string[]
	} catch {
		return out
	}
	for (const name of names) {
		const full = path.join(dir, name)
		let st: fs.Stats
		try {
			st = await fse.lstat(full)
		} catch {
			continue
		}
		if (st.isDirectory()) {
			out.push(...(await walkFiles(full, base)))
		} else if (st.isFile()) {
			out.push(path.relative(base, full).split(path.sep).join('/'))
		}
		// symlinks / sockets / devices are skipped (not portable app data).
	}
	return out
}

// Stream-hash a file → {sha256, bytes} WITHOUT buffering it whole (multi-GB safe).
async function hashFile(filePath: string): Promise<{sha256: string; bytes: number}> {
	const hash = createHash('sha256')
	let bytes = 0
	await pipeline(fs.createReadStream(filePath), async function* (source) {
		for await (const chunk of source) {
			bytes += (chunk as Buffer).length
			hash.update(chunk as Buffer)
			// generator consumes the stream; we yield nothing (sink).
		}
	})
	return {sha256: hash.digest('hex'), bytes}
}

// One prepared thing to pack: bytes already live at `filePath` (a temp file or a
// source file); the manifest records `entryPath` + sha256 + bytes.
interface Packable {
	entryPath: string
	filePath: string
	bytes: number
	sha256: string
	isVolume: boolean
	volumeKey?: string
}

// Pack one already-sized file into the tar stream (streamed, never buffered whole).
function packFileEntry(pack: tar.Pack, name: string, filePath: string, size: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const entry = pack.entry({name, size}, (err) => (err ? reject(err) : resolve()))
		const rs = fs.createReadStream(filePath)
		rs.on('error', reject)
		rs.pipe(entry)
	})
}

// Pack an in-memory buffer entry.
function packBufferEntry(pack: tar.Pack, name: string, buf: Buffer): Promise<void> {
	return new Promise((resolve, reject) => {
		pack.entry({name, size: buf.length}, buf, (err) => (err ? reject(err) : resolve()))
	})
}

/**
 * Export ONE app to a single `.livbundle` (plaintext tar.gz — D-344-6). Non-destructive:
 * the app is stopped, packed, then started again (unless it was ALREADY stopped, in which
 * case the operator's deliberate stop is preserved — W addendum). Every packed entry has a
 * sha256 recorded in the manifest; `manifest.json` is packed FIRST so the importer verifies
 * integrity before applying any data (D-344-8). DEK secrets (`*Enc`) are stripped from the
 * settings.yml COPY that is packed; the live settings.yml is never touched (D-344-5).
 */
export async function exportAppBundle(
	app: ExportableApp,
	deps: ExportDeps,
	onProgress?: ProgressFn,
): Promise<{bundlePath: string; manifest: BundleManifest}> {
	const report: ProgressFn = onProgress ?? (() => {})
	const appDataDir = app.dataDirectory
	const rootDir =
		deps.dataDirectory ?? appDataDir.replace(/[\\/]app-data[\\/][^\\/]+[\\/]?$/, '')
	const getDirSize = deps.getDirSize ?? getDirectorySize
	const getDiskFree = deps.getDiskFree ?? (async (p: string) => (await getDiskUsageByPath(p)).available)

	await fse.ensureDir(deps.exportsDir)

	// Read compose while the app is still up (enumeration + canonical copy).
	const compose = await app.readCompose()
	const manifestDoc = await app.readManifest()
	const appVersion = String(manifestDoc?.version ?? 'unknown')
	const namedVols = enumerateNamedVolumes(compose, appDataDir, app.id, rootDir)

	// --- B3 precheck (BEFORE app.stop — a doomed export must never incur downtime) ---
	report({progress: 0, description: 'Checking free space'})
	const appDataBytes = await getDirSize(appDataDir).catch(() => 0)
	let volEstimate = 0
	for (const v of namedVols) volEstimate += await volumeTarAdapter.estimateBytes(v.runtimeName).catch(() => 0)
	const requiredBytes = appDataBytes + volEstimate
	const freeBytes = await getDiskFree(deps.exportsDir)
	if (freeBytes < requiredBytes) {
		throw new Error(
			`[bundle-export] insufficient free space in exports dir: need ~${requiredBytes} bytes, have ${freeBytes} (app not stopped)`,
		)
	}

	// prior state gates the finally restart (W: preserve a deliberate operator stop).
	const priorState = app.state
	const bundlePath = path.join(deps.exportsDir, `${app.id}-${Date.now()}.livbundle`)
	const staging = (await fse.mkdtemp(path.join(deps.exportsDir, '.livexport-'))) as string
	let succeeded = false

	try {
		report({progress: 5, description: 'Stopping app'})
		await app.stop()

		// --- Pass 1: prepare + hash every packable (temps for generated content) ---
		report({progress: 10, description: 'Packing app data'})
		const packables: Packable[] = []
		let strippedSecrets: string[] = []

		// Pre-clean settings.yml (DEK-strip a COPY; never touch the live file).
		const settingsPath = path.join(appDataDir, 'settings.yml')
		let cleanedSettingsTemp: string | null = null
		if (await fse.pathExists(settingsPath)) {
			const parsed = (yaml.load(await fse.readFile(settingsPath, 'utf8')) ?? {}) as Record<string, unknown>
			const {clean, stripped} = stripDekSecrets(parsed)
			strippedSecrets = stripped
			cleanedSettingsTemp = path.join(staging, 'settings.yml')
			await fse.writeFile(cleanedSettingsTemp, yaml.dump(clean))
		}

		// app-data/* — the whole app dir; settings.yml substituted with the cleaned copy.
		for (const rel of await walkFiles(appDataDir)) {
			const entryPath = APP_DATA_PREFIX + rel
			const src = rel === 'settings.yml' && cleanedSettingsTemp ? cleanedSettingsTemp : path.join(appDataDir, rel)
			const {sha256, bytes} = await hashFile(src)
			packables.push({entryPath, filePath: src, bytes, sha256, isVolume: false})
		}

		// Canonical compose copy (importer reads COMPOSE_ENTRY for sanitize/volume-restore).
		const composePath = path.join(appDataDir, 'docker-compose.yml')
		if (await fse.pathExists(composePath)) {
			const {sha256, bytes} = await hashFile(composePath)
			packables.push({entryPath: COMPOSE_ENTRY, filePath: composePath, bytes, sha256, isVolume: false})
		}

		// Canonical manifest copy (dumped from the parsed manifest — filename may be
		// livinity-app.yml OR umbrel-app.yml on disk; the canonical entry normalizes it).
		const manifestTemp = path.join(staging, 'livinity-app.yml')
		await fse.writeFile(manifestTemp, yaml.dump(manifestDoc))
		{
			const {sha256, bytes} = await hashFile(manifestTemp)
			packables.push({entryPath: APP_MANIFEST_ENTRY, filePath: manifestTemp, bytes, sha256, isVolume: false})
		}

		// meta/subdomain.json — SubdomainConfig capture (Redis-backed).
		const hasSubdomain = !!deps.subdomainCapture
		const subdomainTemp = path.join(staging, 'subdomain.json')
		await fse.writeFile(subdomainTemp, JSON.stringify(deps.subdomainCapture ?? null))
		{
			const {sha256, bytes} = await hashFile(subdomainTemp)
			packables.push({entryPath: SUBDOMAIN_ENTRY, filePath: subdomainTemp, bytes, sha256, isVolume: false})
		}

		// volumes/<key>.tar.gz — stream each named volume to a temp file, hash it.
		let vi = 0
		for (const v of namedVols) {
			vi++
			report({
				progress: 10 + Math.round((vi / Math.max(1, namedVols.length)) * 70),
				description: `Packing volume ${v.key}`,
			})
			const volTemp = path.join(staging, `vol-${v.key}.tar.gz`)
			const stream = await volumeTarAdapter.exportVolume(v.runtimeName)
			await pipeline(stream, fs.createWriteStream(volTemp))
			const {sha256, bytes} = await hashFile(volTemp)
			packables.push({
				entryPath: VOLUMES_PREFIX + `${v.key}.tar.gz`,
				filePath: volTemp,
				bytes,
				sha256,
				isVolume: true,
				volumeKey: v.key,
			})
		}

		// --- Build the manifest (entries = non-volume, volumes = volume packables) ---
		const entries: BundleEntry[] = packables
			.filter((p) => !p.isVolume)
			.map((p) => ({path: p.entryPath, sha256: p.sha256, bytes: p.bytes}))
		const volumes: BundleVolume[] = packables
			.filter((p) => p.isVolume)
			.map((p) => ({key: p.volumeKey!, entryPath: p.entryPath, sha256: p.sha256, bytes: p.bytes}))
		const totalBytes =
			entries.reduce((s, e) => s + e.bytes, 0) + volumes.reduce((s, e) => s + e.bytes, 0)

		const manifest: BundleManifest = {
			schemaVersion: BUNDLE_SCHEMA_VERSION,
			appId: app.id,
			appVersion,
			boxRelease: deps.boxRelease,
			createdAt: Date.now(),
			entries,
			volumes,
			strippedSecrets,
			hasSubdomain,
			totalBytes,
		}

		// --- Pass 2: pack manifest.json FIRST, then every packable in order ---
		// (two-pass is why we hashed to temp files above: the manifest references entries
		// added AFTER it, so all sizes+hashes must be known BEFORE the manifest is packed.)
		report({progress: 90, description: 'Finalizing bundle'})
		const pack = tar.pack()
		const gzip = zlib.createGzip()
		const ws = fs.createWriteStream(bundlePath)
		const writeDone = new Promise<void>((resolve, reject) => {
			ws.on('finish', () => resolve())
			ws.on('error', reject)
			gzip.on('error', reject)
			pack.on('error', reject)
		})
		pack.pipe(gzip).pipe(ws)

		await packBufferEntry(pack, MANIFEST_ENTRY, Buffer.from(JSON.stringify(manifest)))
		for (const p of packables) await packFileEntry(pack, p.entryPath, p.filePath, p.bytes)
		pack.finalize()
		await writeDone

		succeeded = true
		await pruneBundles(deps.exportsDir, {keepLast: deps.keepLast ?? 5})
		return {bundlePath, manifest}
	} finally {
		await fse.remove(staging).catch(() => {})
		// Remove a partial bundle on failure so a doomed run leaves no half-written file.
		if (!succeeded) await fse.remove(bundlePath).catch(() => {})
		// Restart ONLY if the app was not already stopped before we started (W addendum).
		if (priorState !== 'stopped') {
			report({progress: 100, description: 'Restarting app'})
			await app.start().catch(() => {})
		}
	}
}
