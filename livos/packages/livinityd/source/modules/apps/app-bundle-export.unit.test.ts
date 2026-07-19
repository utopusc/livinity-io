// Phase 344-01 XFER-01 — offline unit tests for the export engine (app-bundle-export.ts).
// NO real docker (the volumeTarAdapter seam is overwritten), NO network. All fs work
// happens under an os.tmpdir() scratch dir created/removed per test.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import zlib from 'node:zlib'

import fse from 'fs-extra'
import yaml from 'js-yaml'
import tar from 'tar-stream'
import {type Compose} from 'compose-spec-schema'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {sha256Hex} from './app-bundle-format.js'
import {
	enumerateNamedVolumes,
	exportAppBundle,
	listBundleFiles,
	pruneBundles,
	volumeTarAdapter,
	type ExportableApp,
} from './app-bundle-export.js'

let tmp: string
// Save/restore the module-level docker seam so overriding it in a test never leaks.
let seamExport: typeof volumeTarAdapter.exportVolume
let seamEstimate: typeof volumeTarAdapter.estimateBytes

beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livbundle-test-'))
	seamExport = volumeTarAdapter.exportVolume
	seamEstimate = volumeTarAdapter.estimateBytes
})
afterEach(() => {
	volumeTarAdapter.exportVolume = seamExport
	volumeTarAdapter.estimateBytes = seamEstimate
	fse.removeSync(tmp)
})

// ---------------------------------------------------------------------------
// exportAppBundle test scaffolding — a tmpdir App double + a bundle extractor.
// ---------------------------------------------------------------------------

const FIXTURE_VOLUME_TARGZ = Buffer.from('fake-volume-tar-gz-bytes')

function makeApp(opts: {id?: string; state?: string; settings?: Record<string, unknown>} = {}): {
	app: ExportableApp
	calls: string[]
	appDataDir: string
} {
	const id = opts.id ?? 'immich'
	const appDataDir = path.join(tmp, 'app-data', id)
	fse.ensureDirSync(appDataDir)
	fse.ensureDirSync(path.join(appDataDir, 'data'))
	fs.writeFileSync(path.join(appDataDir, 'data', 'file.txt'), 'hello-data')
	fs.writeFileSync(
		path.join(appDataDir, 'settings.yml'),
		yaml.dump(opts.settings ?? {immichApiKeyEnc: 'ciphertext', gpuAccess: true}),
	)
	const compose: Compose = {
		services: {web: {volumes: ['data:/var/lib', './localbind:/y']}},
		volumes: {data: {}},
	} as any
	fs.writeFileSync(path.join(appDataDir, 'docker-compose.yml'), yaml.dump(compose))

	const calls: string[] = []
	const app: ExportableApp = {
		id,
		dataDirectory: appDataDir,
		state: opts.state ?? 'ready',
		readCompose: async () => compose,
		readManifest: async () => ({version: '1.2.3'}),
		stop: async () => {
			calls.push('stop')
			return true
		},
		start: async () => {
			calls.push('start')
			return true
		},
	}
	return {app, calls, appDataDir}
}

function baseDeps(exportsDir: string) {
	return {
		boxRelease: 'v45.27',
		exportsDir,
		// stub the du/df seams so no real `du`/`df` runs on the Windows host.
		getDirSize: async () => 100,
		getDiskFree: async () => 10_000_000,
	}
}

// Extract a produced bundle into [{name, content}] preserving tar entry order.
function extractBundle(bundlePath: string): Promise<{name: string; content: Buffer}[]> {
	return new Promise((resolve, reject) => {
		const out: {name: string; content: Buffer}[] = []
		const extract = tar.extract()
		extract.on('entry', (header, stream, next) => {
			const chunks: Buffer[] = []
			stream.on('data', (c: Buffer) => chunks.push(c))
			stream.on('end', () => {
				out.push({name: header.name, content: Buffer.concat(chunks)})
				next()
			})
			stream.on('error', reject)
		})
		extract.on('finish', () => resolve(out))
		extract.on('error', reject)
		fs.createReadStream(bundlePath).pipe(zlib.createGunzip()).pipe(extract)
	})
}

describe('enumerateNamedVolumes — non-external named vols only, deduped', () => {
	test('picks the non-external named vol, drops external + bind', () => {
		const compose: Compose = {
			services: {
				web: {volumes: ['data:/var/data', 'ext:/e', './localbind:/b']},
				// a SECOND service referencing the same named vol must not duplicate it.
				worker: {volumes: ['data:/var/data']},
			},
			volumes: {
				data: {},
				ext: {external: true},
			},
		} as any

		const result = enumerateNamedVolumes(compose, path.join(tmp, 'app-data'), 'immich', tmp)
		expect(result).toEqual([{key: 'data', runtimeName: 'immich_data'}])
	})

	test('no volumes → empty', () => {
		const compose: Compose = {services: {web: {}}} as any
		expect(enumerateNamedVolumes(compose, tmp, 'app', tmp)).toEqual([])
	})
})

describe('volumeTarAdapter seam is overridable (no real docker needed)', () => {
	test('overwriting .exportVolume yields the fixture bytes', async () => {
		const original = volumeTarAdapter.exportVolume
		try {
			volumeTarAdapter.exportVolume = async () => Readable.from([Buffer.from('X')])
			const stream = await volumeTarAdapter.exportVolume('anything')
			const chunks: Buffer[] = []
			for await (const c of stream) chunks.push(c as Buffer)
			expect(Buffer.concat(chunks).toString()).toBe('X')
		} finally {
			volumeTarAdapter.exportVolume = original
		}
	})
})

describe('listBundleFiles + pruneBundles', () => {
	function writeBundle(name: string, mtimeMs: number): string {
		const p = path.join(tmp, name)
		fs.writeFileSync(p, name)
		const t = mtimeMs / 1000
		fs.utimesSync(p, t, t)
		return p
	}

	test('pruneBundles keepLast removes exactly the oldest, list then returns the rest', async () => {
		const oldest = writeBundle('a-1000.livbundle', 1_000_000)
		writeBundle('b-2000.livbundle', 2_000_000)
		writeBundle('c-3000.livbundle', 3_000_000)
		// a non-bundle file must be ignored by both list and prune.
		fs.writeFileSync(path.join(tmp, 'notes.txt'), 'ignore me')

		const removed = await pruneBundles(tmp, {keepLast: 2})
		expect(removed).toEqual([oldest])
		expect(fs.existsSync(oldest)).toBe(false)

		const remaining = await listBundleFiles(tmp)
		expect(remaining.map((f) => path.basename(f.path))).toEqual(['c-3000.livbundle', 'b-2000.livbundle'])
	})

	test('listBundleFiles on a missing dir returns [] (no throw)', async () => {
		await expect(listBundleFiles(path.join(tmp, 'does-not-exist'))).resolves.toEqual([])
	})
})

describe('exportAppBundle — stop → pack → start orchestration', () => {
	test('stops before packing then starts after (round-trip, non-destructive)', async () => {
		const exportsDir = path.join(tmp, 'exports')
		const {app, calls} = makeApp()
		volumeTarAdapter.exportVolume = async () => Readable.from([FIXTURE_VOLUME_TARGZ])
		volumeTarAdapter.estimateBytes = async () => 10

		const {bundlePath} = await exportAppBundle(app, baseDeps(exportsDir))

		expect(fs.existsSync(bundlePath)).toBe(true)
		expect(calls).toEqual(['stop', 'start']) // stop first, start after — round-trip.
	})

	test('start is STILL called when packing fails (finally restart)', async () => {
		const exportsDir = path.join(tmp, 'exports')
		const {app, calls} = makeApp()
		// The volume export rejects → the pack throws mid-run.
		volumeTarAdapter.exportVolume = async () => {
			throw new Error('boom-volume')
		}
		volumeTarAdapter.estimateBytes = async () => 10

		await expect(exportAppBundle(app, baseDeps(exportsDir))).rejects.toThrow('boom-volume')
		expect(calls).toEqual(['stop', 'start']) // source restored despite the failure.
	})

	test('manifest records a sha256 for every entry and volume (matches packed bytes)', async () => {
		const exportsDir = path.join(tmp, 'exports')
		const {app} = makeApp()
		volumeTarAdapter.exportVolume = async () => Readable.from([FIXTURE_VOLUME_TARGZ])
		volumeTarAdapter.estimateBytes = async () => 10

		const {bundlePath, manifest} = await exportAppBundle(app, baseDeps(exportsDir))
		const packed = await extractBundle(bundlePath)
		const byName = new Map(packed.map((e) => [e.name, e.content]))

		// Expected non-volume entries are present.
		const entryPaths = manifest.entries.map((e) => e.path)
		expect(entryPaths).toContain('app-data/settings.yml')
		expect(entryPaths).toContain('app-data/data/file.txt')
		expect(entryPaths).toContain('compose/docker-compose.yml')
		expect(entryPaths).toContain('livinity-app.yml')
		expect(entryPaths).toContain('meta/subdomain.json')

		// The named volume is captured.
		expect(manifest.volumes).toHaveLength(1)
		expect(manifest.volumes[0].key).toBe('data')
		expect(manifest.volumes[0].entryPath).toBe('volumes/data.tar.gz')

		// Every recorded sha256 equals the hash of the ACTUAL packed bytes.
		const allHashed: {tarPath: string; sha256: string}[] = [
			...manifest.entries.map((e) => ({tarPath: e.path, sha256: e.sha256})),
			...manifest.volumes.map((v) => ({tarPath: v.entryPath, sha256: v.sha256})),
		]
		for (const e of allHashed) {
			const bytes = byName.get(e.tarPath)
			expect(bytes, `bytes present for ${e.tarPath}`).toBeDefined()
			expect(sha256Hex(bytes!)).toBe(e.sha256)
		}
		// The volume tar bytes are exactly the fixture the seam yielded.
		expect(sha256Hex(FIXTURE_VOLUME_TARGZ)).toBe(manifest.volumes[0].sha256)
	})

	test('DEK secrets (*Enc) stripped from the packed settings.yml + listed in manifest', async () => {
		const exportsDir = path.join(tmp, 'exports')
		const {app} = makeApp({settings: {immichApiKeyEnc: 'ciphertext', gpuAccess: true, cpuLimit: 2}})
		volumeTarAdapter.exportVolume = async () => Readable.from([FIXTURE_VOLUME_TARGZ])
		volumeTarAdapter.estimateBytes = async () => 10

		const {bundlePath, manifest} = await exportAppBundle(app, baseDeps(exportsDir))
		const packed = await extractBundle(bundlePath)
		const settingsBytes = packed.find((e) => e.name === 'app-data/settings.yml')!.content
		const settings = yaml.load(settingsBytes.toString()) as Record<string, unknown>

		expect(settings).not.toHaveProperty('immichApiKeyEnc')
		expect(settings).toMatchObject({gpuAccess: true, cpuLimit: 2})
		expect(manifest.strippedSecrets).toEqual(['immichApiKeyEnc'])
	})

	test('manifest.json is the FIRST entry in the packed stream', async () => {
		const exportsDir = path.join(tmp, 'exports')
		const {app} = makeApp()
		volumeTarAdapter.exportVolume = async () => Readable.from([FIXTURE_VOLUME_TARGZ])
		volumeTarAdapter.estimateBytes = async () => 10

		const {bundlePath} = await exportAppBundle(app, baseDeps(exportsDir))
		const packed = await extractBundle(bundlePath)
		expect(packed[0].name).toBe('manifest.json')
	})

	// PLAN-CHECK ADDENDUM B3 — precheck BEFORE app.stop; a doomed export incurs NO downtime.
	test('B3: insufficient free space rejects BEFORE the app is stopped (no downtime)', async () => {
		const exportsDir = path.join(tmp, 'exports')
		const {app, calls} = makeApp()
		volumeTarAdapter.exportVolume = async () => Readable.from([FIXTURE_VOLUME_TARGZ])
		volumeTarAdapter.estimateBytes = async () => 10

		await expect(
			exportAppBundle(app, {
				boxRelease: 'v45.27',
				exportsDir,
				getDirSize: async () => 1_000_000, // app-data alone needs ~1MB
				getDiskFree: async () => 1, // only 1 byte free
			}),
		).rejects.toThrow(/insufficient free space/)
		expect(calls).toEqual([]) // app.stop() was NEVER called — no downtime for a doomed run.
	})

	// PLAN-CHECK ADDENDUM W — an already-stopped app is NOT restarted (preserve operator stop).
	test('W: an app that was already stopped is not started again', async () => {
		const exportsDir = path.join(tmp, 'exports')
		const {app, calls} = makeApp({state: 'stopped'})
		volumeTarAdapter.exportVolume = async () => Readable.from([FIXTURE_VOLUME_TARGZ])
		volumeTarAdapter.estimateBytes = async () => 10

		const {bundlePath} = await exportAppBundle(app, baseDeps(exportsDir))
		expect(fs.existsSync(bundlePath)).toBe(true)
		expect(calls).not.toContain('start') // deliberate operator stop preserved.
	})
})
