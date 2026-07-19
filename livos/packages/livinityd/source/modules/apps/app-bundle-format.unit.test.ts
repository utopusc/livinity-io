// Phase 344-01 XFER-01 — pure-contract unit tests for app-bundle-format.ts.
// Offline, no I/O beyond the crypto hash. Mirrors the describe/test style of the
// other apps/*.unit.test.ts suites.

import {describe, expect, test} from 'vitest'

import {
	BUNDLE_SCHEMA_VERSION,
	BundleManifestSchema,
	isDekEncryptedKey,
	sha256Hex,
	stripDekSecrets,
	type BundleManifest,
} from './app-bundle-format.js'

describe('sha256Hex', () => {
	test('is stable and matches node crypto (precomputed constant)', () => {
		// sha256('livinity-344') computed independently via node crypto.
		expect(sha256Hex(Buffer.from('livinity-344'))).toBe(
			'4fe31d10a6f8c8ddf9c10df89fe709c337fc80bfb7536f1ae16ec028e2f01741',
		)
	})
	test('accepts a Uint8Array and hashes identically to the Buffer', () => {
		const bytes = new Uint8Array([1, 2, 3, 4])
		expect(sha256Hex(bytes)).toBe(sha256Hex(Buffer.from([1, 2, 3, 4])))
	})
})

describe('isDekEncryptedKey — flags *Enc keys only', () => {
	test('true for the DEK-encrypted immichApiKeyEnc', () => {
		expect(isDekEncryptedKey('immichApiKeyEnc')).toBe(true)
	})
	test('false for non-Enc keys (gpuAccess, cpuSet, immichApiKeySet)', () => {
		expect(isDekEncryptedKey('gpuAccess')).toBe(false)
		expect(isDekEncryptedKey('cpuSet')).toBe(false)
		// the presence-flag sibling ends in `Set`, NOT `Enc` — must not be stripped.
		expect(isDekEncryptedKey('immichApiKeySet')).toBe(false)
	})
})

describe('stripDekSecrets — removes only *Enc keys and reports them', () => {
	test('deletes immichApiKeyEnc, keeps the rest, reports the removed name', () => {
		const {clean, stripped} = stripDekSecrets({immichApiKeyEnc: 'x', gpuAccess: true, cpuLimit: 2})
		expect(clean).not.toHaveProperty('immichApiKeyEnc')
		expect(clean).toEqual({gpuAccess: true, cpuLimit: 2})
		expect(stripped).toEqual(['immichApiKeyEnc'])
	})
	test('does not mutate the input object (operates on a copy — live settings untouched)', () => {
		const input = {immichApiKeyEnc: 'secret', keep: 1}
		stripDekSecrets(input)
		expect(input).toEqual({immichApiKeyEnc: 'secret', keep: 1})
	})
	test('no *Enc keys → empty stripped list', () => {
		const {clean, stripped} = stripDekSecrets({a: 1, b: 2})
		expect(clean).toEqual({a: 1, b: 2})
		expect(stripped).toEqual([])
	})
})

describe('BundleManifestSchema', () => {
	const valid: BundleManifest = {
		schemaVersion: BUNDLE_SCHEMA_VERSION,
		appId: 'immich',
		appVersion: '1.0.0',
		boxRelease: 'v45.27',
		createdAt: 1_700_000_000_000,
		entries: [{path: 'app-data/settings.yml', sha256: 'abc', bytes: 10}],
		volumes: [{key: 'data', entryPath: 'volumes/data.tar.gz', sha256: 'def', bytes: 20}],
		strippedSecrets: ['immichApiKeyEnc'],
		hasSubdomain: true,
		totalBytes: 30,
	}

	test('round-trips a valid manifest', () => {
		const parsed = BundleManifestSchema.parse(valid)
		expect(parsed).toEqual(valid)
	})
	test('rejects a string schemaVersion', () => {
		expect(() => BundleManifestSchema.parse({...valid, schemaVersion: '1'})).toThrow()
	})
	test('rejects a manifest missing entries', () => {
		const {entries, ...noEntries} = valid
		expect(() => BundleManifestSchema.parse(noEntries)).toThrow()
	})
})
