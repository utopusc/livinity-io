// Phase 344-01 XFER-01 — offline unit tests for the export engine (app-bundle-export.ts).
// NO real docker (the volumeTarAdapter seam is overwritten), NO network. All fs work
// happens under an os.tmpdir() scratch dir created/removed per test.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {Readable} from 'node:stream'

import fse from 'fs-extra'
import {type Compose} from 'compose-spec-schema'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {
	enumerateNamedVolumes,
	listBundleFiles,
	pruneBundles,
	volumeTarAdapter,
} from './app-bundle-export.js'

let tmp: string

beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livbundle-test-'))
})
afterEach(() => {
	fse.removeSync(tmp)
})

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
