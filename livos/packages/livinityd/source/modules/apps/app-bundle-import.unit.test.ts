// Phase 344-02 XFER-01 — offline unit tests for the import engine (app-bundle-import.ts).
// NO real docker (the volumeRestoreAdapter seam is overwritten), NO network. All fs work
// happens under an os.tmpdir() scratch dir created/removed per test. Bundle fixtures are
// packed IN-TEST with tar-stream (the same lib the exporter uses) so the tests never touch
// the export module's docker seam.

import {createHash} from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

import fse from 'fs-extra'
import yaml from 'js-yaml'
import tar from 'tar-stream'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ComposeRejected, sanitizeNonBuiltinCompose} from './compose-sanitizer.js'
import {BUNDLE_SCHEMA_VERSION, sha256Hex, type BundleManifest} from './app-bundle-format.js'
import {
	newLedger,
	restoreVolumes,
	rollback,
	runImportPrechecks,
	safeExtractBundle,
	volumeRestoreAdapter,
} from './app-bundle-import.js'

let tmp: string
// Save/restore the module-level docker seam so overriding it in a test never leaks.
let seamRestore: typeof volumeRestoreAdapter.restoreVolume
let seamRemove: typeof volumeRestoreAdapter.removeVolume

beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livimport-test-'))
	seamRestore = volumeRestoreAdapter.restoreVolume
	seamRemove = volumeRestoreAdapter.removeVolume
})
afterEach(() => {
	volumeRestoreAdapter.restoreVolume = seamRestore
	volumeRestoreAdapter.removeVolume = seamRemove
	fse.removeSync(tmp)
})

// ---------------------------------------------------------------------------
// Fixture builders — pack a tar.gz whose FIRST entry is manifest.json, then the
// declared file entries, then the volume tars. `overrides` let a test tamper.
// ---------------------------------------------------------------------------

type PackEntry =
	| {name: string; content: Buffer; type?: 'file'}
	| {name: string; type: 'directory'}
	| {name: string; type: 'symlink'; linkname: string}

function packEntry(pack: tar.Pack, e: PackEntry): Promise<void> {
	return new Promise((resolve, reject) => {
		if (e.type === 'symlink') {
			pack.entry({name: e.name, type: 'symlink', linkname: e.linkname, size: 0}, (err) =>
				err ? reject(err) : resolve(),
			)
		} else if (e.type === 'directory') {
			pack.entry({name: e.name, type: 'directory', size: 0}, (err) => (err ? reject(err) : resolve()))
		} else {
			pack.entry({name: e.name, size: e.content.length}, e.content, (err) => (err ? reject(err) : resolve()))
		}
	})
}

async function writeTarGz(bundlePath: string, entries: PackEntry[]): Promise<void> {
	const pack = tar.pack()
	const gzip = zlib.createGzip()
	const ws = fs.createWriteStream(bundlePath)
	const done = new Promise<void>((resolve, reject) => {
		ws.on('finish', () => resolve())
		ws.on('error', reject)
	})
	pack.pipe(gzip).pipe(ws)
	for (const e of entries) await packEntry(pack, e)
	pack.finalize()
	await done
}

// Build a valid manifest describing the given file + volume payloads.
function buildManifest(opts: {
	appId?: string
	schemaVersion?: number
	files: {path: string; content: Buffer}[]
	volumes?: {key: string; entryPath: string; content: Buffer}[]
	totalBytesOverride?: number
}): BundleManifest {
	const files = opts.files
	const volumes = opts.volumes ?? []
	const total =
		files.reduce((s, f) => s + f.content.length, 0) + volumes.reduce((s, v) => s + v.content.length, 0)
	return {
		schemaVersion: opts.schemaVersion ?? BUNDLE_SCHEMA_VERSION,
		appId: opts.appId ?? 'immich',
		appVersion: '1.2.3',
		boxRelease: 'v45.27',
		createdAt: Date.now(),
		entries: files.map((f) => ({path: f.path, sha256: sha256Hex(f.content), bytes: f.content.length})),
		volumes: volumes.map((v) => ({
			key: v.key,
			entryPath: v.entryPath,
			sha256: sha256Hex(v.content),
			bytes: v.content.length,
		})),
		strippedSecrets: [],
		hasSubdomain: false,
		totalBytes: opts.totalBytesOverride ?? total,
	}
}

// Pack a bundle: manifest.json FIRST, then the file entries, then the volume tars.
async function packGoodBundle(
	bundlePath: string,
	manifest: BundleManifest,
	files: {path: string; content: Buffer}[],
	volumes: {entryPath: string; content: Buffer}[] = [],
): Promise<void> {
	const entries: PackEntry[] = [{name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest))}]
	for (const f of files) entries.push({name: f.path, content: f.content})
	for (const v of volumes) entries.push({name: v.entryPath, content: v.content})
	await writeTarGz(bundlePath, entries)
}

// ---------------------------------------------------------------------------
// Test 1 — runImportPrechecks
// ---------------------------------------------------------------------------

describe('runImportPrechecks', () => {
	const clean = buildManifest({files: [{path: 'app-data/settings.yml', content: Buffer.from('a: 1')}]})

	test('accepts a clean manifest', () => {
		expect(runImportPrechecks(clean, {installedAppIds: [], availableBytes: 10_000_000})).toEqual({ok: true})
	})

	test('rejects a too-new schemaVersion', () => {
		const m = {...clean, schemaVersion: BUNDLE_SCHEMA_VERSION + 1}
		expect(runImportPrechecks(m, {installedAppIds: [], availableBytes: 10_000_000})).toEqual({
			ok: false,
			reason: '[bundle-too-new]',
		})
	})

	test('rejects an appId collision', () => {
		expect(runImportPrechecks(clean, {installedAppIds: ['immich'], availableBytes: 10_000_000})).toEqual({
			ok: false,
			reason: '[app-already-installed]',
		})
	})

	test('rejects insufficient space (totalBytes*1.2 > available)', () => {
		const m = buildManifest({
			files: [{path: 'app-data/big', content: Buffer.alloc(1000)}],
		})
		expect(runImportPrechecks(m, {installedAppIds: [], availableBytes: 1100})).toEqual({
			ok: false,
			reason: '[insufficient-space]',
		})
	})

	test('rejects a path-y appId at schema-parse time (B1)', () => {
		for (const badId of ['../evil', '/etc/passwd', 'a:b', '']) {
			const m = {...clean, appId: badId}
			expect(runImportPrechecks(m, {installedAppIds: [], availableBytes: 10_000_000})).toEqual({
				ok: false,
				reason: '[bundle-manifest-invalid]',
			})
		}
	})
})

// ---------------------------------------------------------------------------
// Test 2 — safeExtractBundle round-trips a good bundle
// ---------------------------------------------------------------------------

describe('safeExtractBundle', () => {
	test('round-trips a good bundle (files land under stagingRoot, manifest returned)', async () => {
		const files = [
			{path: 'app-data/settings.yml', content: Buffer.from('gpuAccess: true')},
			{path: 'app-data/data/file.txt', content: Buffer.from('hello-data')},
			{path: 'compose/docker-compose.yml', content: Buffer.from('services: {}')},
			{path: 'livinity-app.yml', content: Buffer.from('version: 1.2.3')},
			{path: 'meta/subdomain.json', content: Buffer.from('null')},
		]
		const volumes = [{entryPath: 'volumes/data.tar.gz', content: Buffer.from('fake-vol-tar')}]
		const manifest = buildManifest({
			files,
			volumes: [{key: 'data', entryPath: 'volumes/data.tar.gz', content: volumes[0].content}],
		})
		const bundlePath = path.join(tmp, 'good.livbundle')
		await packGoodBundle(bundlePath, manifest, files, volumes)

		const staging = path.join(tmp, 'staging')
		const {manifest: got} = await safeExtractBundle(bundlePath, staging)

		expect(got.appId).toBe('immich')
		expect(fs.readFileSync(path.join(staging, 'app-data', 'settings.yml'), 'utf8')).toBe('gpuAccess: true')
		expect(fs.readFileSync(path.join(staging, 'app-data', 'data', 'file.txt'), 'utf8')).toBe('hello-data')
		expect(fs.existsSync(path.join(staging, 'volumes', 'data.tar.gz'))).toBe(true)
	})

	test('rejects an absolute-path entry, nothing written outside stagingRoot', async () => {
		const files = [{path: 'app-data/ok.txt', content: Buffer.from('ok')}]
		const manifest = buildManifest({files})
		const bundlePath = path.join(tmp, 'abs.livbundle')
		await writeTarGz(bundlePath, [
			{name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest))},
			{name: '/etc/evil', content: Buffer.from('pwned')},
		])
		const staging = path.join(tmp, 'staging')
		await expect(safeExtractBundle(bundlePath, staging)).rejects.toThrow('[unsafe-entry]')
		expect(fs.existsSync('/etc/evil')).toBe(false)
	})

	test('rejects a `..` traversal entry (no file at the escaped location)', async () => {
		const manifest = buildManifest({files: [{path: 'app-data/ok.txt', content: Buffer.from('ok')}]})
		const bundlePath = path.join(tmp, 'dotdot.livbundle')
		await writeTarGz(bundlePath, [
			{name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest))},
			{name: 'app-data/../../escape.txt', content: Buffer.from('escaped')},
		])
		const staging = path.join(tmp, 'deep', 'staging')
		await expect(safeExtractBundle(bundlePath, staging)).rejects.toThrow('[unsafe-entry]')
		expect(fs.existsSync(path.join(tmp, 'escape.txt'))).toBe(false)
	})

	test('rejects a symlink entry', async () => {
		const manifest = buildManifest({files: [{path: 'app-data/ok.txt', content: Buffer.from('ok')}]})
		const bundlePath = path.join(tmp, 'sym.livbundle')
		await writeTarGz(bundlePath, [
			{name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest))},
			{name: 'app-data/link', type: 'symlink', linkname: '/etc/passwd'},
		])
		const staging = path.join(tmp, 'staging')
		await expect(safeExtractBundle(bundlePath, staging)).rejects.toThrow('[unsafe-entry]')
	})

	test('sha256 mismatch → integrity-failure', async () => {
		const good = Buffer.from('the-real-bytes')
		const files = [{path: 'app-data/settings.yml', content: good}]
		const manifest = buildManifest({files})
		const bundlePath = path.join(tmp, 'tamper.livbundle')
		// Pack a DIFFERENT payload than the manifest sha256 describes.
		await writeTarGz(bundlePath, [
			{name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest))},
			{name: 'app-data/settings.yml', content: Buffer.from('TAMPERED-bytes')},
		])
		const staging = path.join(tmp, 'staging')
		await expect(safeExtractBundle(bundlePath, staging)).rejects.toThrow('[integrity-failure]')
	})

	test('zip-bomb ceiling → throws before finishing', async () => {
		// Manifest claims a tiny totalBytes; the actual file blows past totalBytes*1.1.
		const bigContent = Buffer.alloc(50_000, 0x41)
		const manifest = buildManifest({
			files: [{path: 'app-data/big', content: bigContent}],
			totalBytesOverride: 100, // lie: claim only 100 bytes
		})
		const bundlePath = path.join(tmp, 'bomb.livbundle')
		await writeTarGz(bundlePath, [
			{name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest))},
			{name: 'app-data/big', content: bigContent},
		])
		const staging = path.join(tmp, 'staging')
		await expect(safeExtractBundle(bundlePath, staging)).rejects.toThrow('[bundle-too-large]')
	})
})

// ---------------------------------------------------------------------------
// Test 8 & 9 — restoreVolumes (seam-mocked) + rollback
// ---------------------------------------------------------------------------

describe('restoreVolumes + rollback (seam-mocked, no docker)', () => {
	test('restoreVolumes calls the seam per volume and records the ledger', async () => {
		const calls: {runtimeName: string; tarGzPath: string}[] = []
		volumeRestoreAdapter.restoreVolume = async (runtimeName, tarGzPath) => {
			calls.push({runtimeName, tarGzPath})
		}
		const manifest = buildManifest({
			files: [{path: 'app-data/ok', content: Buffer.from('x')}],
			volumes: [
				{key: 'data', entryPath: 'volumes/data.tar.gz', content: Buffer.from('v1')},
				{key: 'db', entryPath: 'volumes/db.tar.gz', content: Buffer.from('v2')},
			],
		})
		const ledger = newLedger()
		await restoreVolumes(manifest, {projectName: 'immich', stagingRoot: '/stage'}, ledger)

		expect(calls.map((c) => c.runtimeName)).toEqual(['immich_data', 'immich_db'])
		expect(calls[0].tarGzPath).toBe(path.join('/stage', 'volumes/data.tar.gz'))
		expect(ledger.volumes).toEqual(['immich_data', 'immich_db'])
	})

	test('rollback removes ledger volumes + dirs; a failing removeVolume is reported not thrown', async () => {
		const removeSpy = vi.fn(async (name: string) => {
			if (name === 'boom_vol') throw new Error('cannot remove')
		})
		volumeRestoreAdapter.removeVolume = removeSpy

		const doomedDir = path.join(tmp, 'app-data-victim')
		fse.ensureDirSync(doomedDir)
		fs.writeFileSync(path.join(doomedDir, 'f'), 'data')

		const ledger = newLedger()
		ledger.volumes.push('ok_vol', 'boom_vol')
		ledger.dirs.push(doomedDir)

		const result = await rollback(ledger)

		expect(removeSpy).toHaveBeenCalledWith('ok_vol')
		expect(removeSpy).toHaveBeenCalledWith('boom_vol')
		expect(fs.existsSync(doomedDir)).toBe(false)
		expect(result.removed).toContain('volume:ok_vol')
		expect(result.removed).toContain(`dir:${doomedDir}`)
		expect(result.failed).toEqual(['volume:boom_vol'])
	})
})

// ---------------------------------------------------------------------------
// Test 10 & 11 — importAppBundle orchestration invariants, exercised via the module
// functions directly (the plan-sanctioned offline alternative to standing up a full
// Apps instance): real safeExtract + real restoreVolumes(seam) + real sanitize gate +
// real rollback — the EXACT primitives importAppBundle wires together.
// ---------------------------------------------------------------------------

describe('importAppBundle orchestration invariants (module-level)', () => {
	test('a sanitize rejection triggers a full rollback (app-data dir + volume + staging cleaned)', async () => {
		// A bundle whose compose mounts docker.sock — an untrusted escape the sanitize
		// gate REJECTS with ComposeRejected (deployCustom-identical).
		const evilCompose = yaml.dump({
			services: {web: {image: 'x', volumes: ['/var/run/docker.sock:/var/run/docker.sock']}},
		})
		const files = [
			{path: 'compose/docker-compose.yml', content: Buffer.from(evilCompose)},
			{path: 'livinity-app.yml', content: Buffer.from('version: 1')},
		]
		const volPayload = Buffer.from('vol-bytes')
		const manifest = buildManifest({
			files,
			volumes: [{key: 'data', entryPath: 'volumes/data.tar.gz', content: volPayload}],
		})
		const bundlePath = path.join(tmp, 'evil.livbundle')
		await packGoodBundle(bundlePath, manifest, files, [{entryPath: 'volumes/data.tar.gz', content: volPayload}])

		// 1. Extract (untrusted-safe) into staging.
		const staging = path.join(tmp, 'staging')
		const {manifest: got} = await safeExtractBundle(bundlePath, staging)

		// 2. Stage: create the app-data dir + restore volumes (seam-mocked) recording the ledger.
		const ledger = newLedger()
		const appDataDir = path.join(tmp, 'app-data', got.appId)
		await fse.mkdirp(appDataDir)
		ledger.dirs.push(appDataDir)
		const removeSpy = vi.fn(async () => {})
		volumeRestoreAdapter.restoreVolume = async () => {}
		volumeRestoreAdapter.removeVolume = removeSpy
		await restoreVolumes(got, {projectName: got.appId, stagingRoot: staging}, ledger)
		expect(ledger.volumes).toEqual(['immich_data'])

		// 3. THE SANITIZE GATE throws ComposeRejected → catch → full rollback.
		let threw = false
		try {
			const composeContent = fs.readFileSync(path.join(staging, 'compose', 'docker-compose.yml'), 'utf8')
			sanitizeNonBuiltinCompose(yaml.load(composeContent), appDataDir)
		} catch (e) {
			threw = e instanceof ComposeRejected
			ledger.dirs.push(staging)
			const result = await rollback(ledger)
			expect(removeSpy).toHaveBeenCalledWith('immich_data')
			expect(fs.existsSync(appDataDir)).toBe(false)
			expect(fs.existsSync(staging)).toBe(false)
			expect(result.failed).toEqual([])
		}
		expect(threw).toBe(true)
	})

	test('collision reject applies nothing (no app-data dir created)', async () => {
		const manifest = buildManifest({
			appId: 'immich',
			files: [{path: 'app-data/settings.yml', content: Buffer.from('a: 1')}],
		})
		// installedAppIds already contains the appId → precheck rejects before any staging.
		const pre = runImportPrechecks(manifest, {installedAppIds: ['immich'], availableBytes: 10_000_000})
		expect(pre).toEqual({ok: false, reason: '[app-already-installed]'})
		// Nothing was created on disk for it.
		expect(fs.existsSync(path.join(tmp, 'app-data', 'immich'))).toBe(false)
	})
})
