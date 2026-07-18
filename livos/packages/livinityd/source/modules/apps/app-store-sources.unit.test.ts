// Phase 341-01 (REPO-01, D-341-1/D-341-3) — source-id + namespacing helpers.
//
// Pure-function tests (no network, no store). The namespace is the anti-shadow
// control: an official bare id can never begin with `fed-`, and every federated
// id is `fed-<sourceId12hex>-<slug>`, so a federated app can never structurally
// impersonate an official one.
import {describe, it, expect} from 'vitest'

import {
	FED_ID_PREFIX,
	deriveSourceId,
	namespacedAppId,
	isFederatedAppId,
	parseFederatedAppId,
} from './app-store-sources.js'

describe('app-store-sources: deriveSourceId', () => {
	it('is a stable 12-hex string', () => {
		const id = deriveSourceId('https://store.example.com/catalog.json')
		expect(id).toMatch(/^[0-9a-f]{12}$/)
		expect(deriveSourceId('https://store.example.com/catalog.json')).toBe(id)
	})

	it('is case- and whitespace-insensitive on the URL', () => {
		const a = deriveSourceId('https://Store.Example.com/Catalog.json')
		const b = deriveSourceId('  https://store.example.com/catalog.json  ')
		expect(a).toBe(b)
	})
})

describe('app-store-sources: namespacedAppId', () => {
	it('produces fed-<12hex>-<slug> and is docker/subdomain-safe (no colon)', () => {
		const sourceId = deriveSourceId('https://store.example.com/catalog.json')
		const id = namespacedAppId(sourceId, 'immich')
		expect(id).toBe(`${FED_ID_PREFIX}${sourceId}-immich`)
		expect(id).not.toContain(':')
		// docker container_name / subdomain charset
		expect(id).toMatch(/^[a-z0-9-]+$/)
	})

	it('round-trips through parseFederatedAppId', () => {
		const sourceId = deriveSourceId('https://store.example.com/catalog.json')
		const id = namespacedAppId(sourceId, 'my-app-2')
		expect(parseFederatedAppId(id)).toEqual({sourceId, catalogSlug: 'my-app-2'})
	})

	it.each(['../evil', 'UPPER', 'has space', '', '-leading', 'trailing-', 'a_b'])(
		'throws on a bad slug: %j',
		(slug) => {
			const sourceId = deriveSourceId('https://store.example.com/catalog.json')
			expect(() => namespacedAppId(sourceId, slug)).toThrow(/invalid catalog slug/)
		},
	)
})

describe('app-store-sources: parseFederatedAppId', () => {
	it('returns null for an official bare id (immich)', () => {
		expect(isFederatedAppId('immich')).toBe(false)
		expect(parseFederatedAppId('immich')).toBeNull()
	})

	it('returns null for a malformed fed id (short/absent hex)', () => {
		expect(parseFederatedAppId('fed-xyz-immich')).toBeNull() // non-hex sourceId
		expect(parseFederatedAppId('fed-abc123-immich')).toBeNull() // hex too short
		expect(parseFederatedAppId('fed-')).toBeNull()
	})

	it('rejects an uppercase slug inside an otherwise well-formed fed id', () => {
		expect(parseFederatedAppId('fed-0123456789ab-Immich')).toBeNull()
	})
})
