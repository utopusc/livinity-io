// livos/packages/livinityd/source/modules/apps/schema.test.ts
// Phase 258 WS-A (258-01) — AppManifestSchema gains publicAccess + neverPublic.
// These are the app-author DECLARATION of public-access support (mode enum +
// suggested paths + own-auth signal) and the never-public class marker. The
// per-install operator toggle lives elsewhere (resolvePublicAccess + 258-03).
// validateManifest still bypasses the zod parse, so we exercise .parse directly.
import {describe, it, expect} from 'vitest'
import {AppManifestSchema, type AppManifest} from './schema.js'

const baseManifest = {
	manifestVersion: '1.0.0',
	id: 'test',
	name: 'Test',
	tagline: 't',
	category: 'c',
	version: '1.0.0',
	port: 8080,
	description: 'd',
	website: 'https://example.com',
	support: 'https://example.com',
	gallery: [],
}

describe('AppManifestSchema publicAccess / neverPublic (258-01 WS-A)', () => {
	it('parses publicAccess {mode:paths, paths, hasOwnAuth}', () => {
		const parsed = AppManifestSchema.parse({
			...baseManifest,
			publicAccess: {mode: 'paths', paths: ['/booking/'], hasOwnAuth: true},
		})
		expect(parsed.publicAccess).toEqual({mode: 'paths', paths: ['/booking/'], hasOwnAuth: true})
		// inferred type exposes the field
		const typed: AppManifest = parsed
		expect(typed.publicAccess?.mode).toBe('paths')
	})

	it('rejects an invalid mode (enum is none|whole-app|paths)', () => {
		expect(() =>
			AppManifestSchema.parse({
				...baseManifest,
				publicAccess: {mode: 'wide-open'},
			}),
		).toThrow()
	})

	it('parses neverPublic:true (and absence is fine)', () => {
		const parsed = AppManifestSchema.parse({...baseManifest, neverPublic: true})
		expect(parsed.neverPublic).toBe(true)
		const without = AppManifestSchema.parse({...baseManifest})
		expect(without.neverPublic).toBeUndefined()
	})

	it('backward compat: a manifest with NEITHER field still parses (SC5)', () => {
		const parsed = AppManifestSchema.parse({...baseManifest})
		expect(parsed.publicAccess).toBeUndefined()
		expect(parsed.neverPublic).toBeUndefined()
	})
})
