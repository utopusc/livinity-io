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

import {PassThrough, type Readable} from 'node:stream'

import Dockerode from 'dockerode'
import fse from 'fs-extra'
import path from 'node:path'
import {type Compose} from 'compose-spec-schema'

import {
	classifyVolumeEntry,
	expandVolumeTokens,
	namedVolumeRuntimeName,
} from './reconcile-volume-ownership.js'

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
 * Mutable docker seam (oom-watch oomInspector idiom). Offline tests overwrite
 * `.exportVolume` with a fixture Readable so NO real docker is touched. ESM internal
 * calls bind to this module-local ref, so routing through this object is the reliable seam.
 */
export const volumeTarAdapter: {exportVolume: (name: string) => Promise<Readable>} = {
	exportVolume: runVolumeTarExport,
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
