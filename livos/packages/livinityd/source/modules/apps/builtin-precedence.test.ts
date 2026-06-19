import {describe, it, expect} from 'vitest'

import {BUILTIN_PRECEDENCE_ALLOWLIST, shouldPreferCatalog} from './builtin-precedence.js'

describe('apps/builtin-precedence.ts — Phase 286 plan 286-03 (SC5: catalog>builtin precedence)', () => {
	it('Test 1: plain builtin (n8n) → prefer the catalog', () => {
		// n8n is in builtin-apps.ts but is NOT operator-curated special — its
		// catalog def (named volume + pinned 2.26.4 + port 41292) is strictly
		// better than the stale builtin (bind mount + :latest + port 5678).
		expect(shouldPreferCatalog('n8n', BUILTIN_PRECEDENCE_ALLOWLIST)).toBe(true)
	})

	it('Test 2: allowlisted special (portainer) → keep builtin precedence', () => {
		// portainer carries docker.sock + privileged + net-host the catalog
		// does not replicate — it must keep its builtin def.
		expect(shouldPreferCatalog('portainer', BUILTIN_PRECEDENCE_ALLOWLIST)).toBe(false)
	})

	it('Test 3: allowlisted special (suna) → keep builtin precedence', () => {
		// suna is an AI-broker + docker.sock app — builtin precedence preserved.
		expect(shouldPreferCatalog('suna', BUILTIN_PRECEDENCE_ALLOWLIST)).toBe(false)
	})

	it('Test 4: catalog-only app (not a builtin) → prefer the catalog', () => {
		// Not in builtin-apps.ts at all → catalog is the only source. The
		// resolver still falls back to builtin (which is null) correctly.
		expect(shouldPreferCatalog('some-catalog-only-app', BUILTIN_PRECEDENCE_ALLOWLIST)).toBe(true)
	})

	it('Test 5: the allowlist contains exactly the 6 approved special builtins', () => {
		// Task-1 checkpoint decision: approve-as-proposed (the 6-app set).
		const expected = ['portainer', 'open-webui', 'mirofish', 'bolt-diy', 'suna', 'bytebot-desktop']
		expect(BUILTIN_PRECEDENCE_ALLOWLIST.size).toBe(expected.length)
		for (const id of expected) {
			expect(BUILTIN_PRECEDENCE_ALLOWLIST.has(id)).toBe(true)
		}
	})

	it('uses the module-default allowlist when none is passed (binding sanity)', () => {
		// shouldPreferCatalog(appId) with no second arg must behave the same.
		expect(shouldPreferCatalog('n8n')).toBe(true)
		expect(shouldPreferCatalog('portainer')).toBe(false)
	})
})
