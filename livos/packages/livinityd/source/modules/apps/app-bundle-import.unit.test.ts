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
import tar from 'tar-stream'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {BUNDLE_SCHEMA_VERSION, sha256Hex, type BundleManifest} from './app-bundle-format.js'
import {runImportPrechecks, safeExtractBundle} from './app-bundle-import.js'

let tmp: string

beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livimport-test-'))
})
afterEach(() => {
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

// buildManifest/packGoodBundle/writeTarGz + vi are reused by the Task 2/3 suites below.
void vi
void packGoodBundle
