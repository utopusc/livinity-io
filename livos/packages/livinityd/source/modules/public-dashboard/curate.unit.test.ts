// Phase 345-03 (GUEST-01) — leak-focused unit tests for the anonymous public
// dashboard curation. Fully offline (pure module, no I/O). Every test names a
// concrete leak/exclusion invariant from D-345-5/6/7.
import {describe, it, expect} from 'vitest'

import {
	curatePublicDashboard,
	sanitizeLinks,
	MAX_PUBLIC_LINKS,
	type PublicDashboardCandidate,
} from './curate.js'

// A clean, publishable candidate (opted in, not forbidden, global, has a url).
function candidate(over: Partial<PublicDashboardCandidate> = {}): PublicDashboardCandidate {
	return {
		id: 'nextcloud',
		name: 'Nextcloud',
		icon: 'https://icons/nextcloud.svg',
		url: 'https://nextcloud-bruce.livinity.io',
		showOnPublicDashboard: true,
		forbidden: false,
		isPerUser: false,
		...over,
	}
}

describe('curatePublicDashboard — field-exact output', () => {
	it('emits EXACTLY the keys {name, icon, url} and nothing else', () => {
		const [app] = curatePublicDashboard([candidate()])
		expect(app).toBeDefined()
		expect(Object.keys(app).sort()).toEqual(['icon', 'name', 'url'])
		expect(app).toEqual({
			name: 'Nextcloud',
			icon: 'https://icons/nextcloud.svg',
			url: 'https://nextcloud-bruce.livinity.io',
		})
	})

	it('never carries the candidate id into the output', () => {
		const [app] = curatePublicDashboard([candidate({id: 'secret-app-id'})])
		expect(Object.keys(app)).not.toContain('id')
	})
})

describe('curatePublicDashboard — exclusions', () => {
	it('excludes an app with showOnPublicDashboard=false', () => {
		expect(curatePublicDashboard([candidate({showOnPublicDashboard: false})])).toEqual([])
	})

	it('excludes a 258-forbidden app even when toggled on', () => {
		expect(curatePublicDashboard([candidate({forbidden: true, showOnPublicDashboard: true})])).toEqual([])
	})

	it('excludes a private per-user instance even when toggled on', () => {
		expect(curatePublicDashboard([candidate({isPerUser: true, showOnPublicDashboard: true})])).toEqual([])
	})

	it('excludes an app with no url (no subdomain ⇒ nothing to link)', () => {
		expect(curatePublicDashboard([candidate({url: undefined})])).toEqual([])
	})

	it('returns [] for an empty candidate list (defensive default-off path)', () => {
		expect(curatePublicDashboard([])).toEqual([])
	})

	it('includes only the eligible apps from a mixed list', () => {
		const out = curatePublicDashboard([
			candidate({id: 'a', name: 'A'}), // eligible
			candidate({id: 'b', name: 'B', showOnPublicDashboard: false}), // off
			candidate({id: 'c', name: 'C', forbidden: true}), // forbidden
			candidate({id: 'd', name: 'D', isPerUser: true}), // per-user
			candidate({id: 'e', name: 'E', url: undefined}), // no url
			candidate({id: 'f', name: 'F'}), // eligible
		])
		expect(out.map((a) => a.name)).toEqual(['A', 'F'])
	})
})

describe('curatePublicDashboard — structural leak guarantee', () => {
	// The input TYPE has no secret-bearing field, so the curator cannot project one.
	// This test PROVES it at runtime: even if a caller (via `any`) smuggles a secret
	// property onto a candidate object, curation drops it — only {name,icon,url} survive.
	it('drops any smuggled secret-bearing property (input type carries none)', () => {
		const smuggled = {
			...candidate(),
			// none of these exist on PublicDashboardCandidate — TS would reject them
			// on a typed literal; the `as any` proves the runtime projection is fixed.
			credentials: {defaultPassword: 'hunter2'},
			environmentOverrides: {SECRET: 'x'},
			meteredKeyId: 'mk_123',
			immichApiKeyEnc: 'enc...',
			oidcLastProvision: {ok: true},
			state: 'running',
		} as unknown as PublicDashboardCandidate
		const [app] = curatePublicDashboard([smuggled])
		expect(Object.keys(app).sort()).toEqual(['icon', 'name', 'url'])
		expect(JSON.stringify(app)).not.toMatch(/hunter2|SECRET|mk_123|enc\.\.\.|oidcLastProvision|running/)
	})
})

describe('sanitizeLinks', () => {
	it('trims label/url and drops entries with an empty label or url', () => {
		expect(
			sanitizeLinks([
				{label: '  Blog  ', url: '  https://blog.example  '},
				{label: '', url: 'https://x'},
				{label: 'y', url: ''},
				{label: '   ', url: '   '},
			]),
		).toEqual([{label: 'Blog', url: 'https://blog.example'}])
	})

	it('caps the count at MAX_PUBLIC_LINKS', () => {
		const many = Array.from({length: MAX_PUBLIC_LINKS + 5}, (_, i) => ({
			label: `L${i}`,
			url: `https://x/${i}`,
		}))
		expect(sanitizeLinks(many)).toHaveLength(MAX_PUBLIC_LINKS)
	})

	it('emits EXACTLY {label, url} per entry (no extra key survives)', () => {
		const out = sanitizeLinks([{label: 'A', url: 'https://a', extra: 'nope'} as any])
		expect(Object.keys(out[0]).sort()).toEqual(['label', 'url'])
	})

	it('returns [] for undefined/null/non-array input', () => {
		expect(sanitizeLinks(undefined)).toEqual([])
		expect(sanitizeLinks(null)).toEqual([])
		expect(sanitizeLinks('nope' as any)).toEqual([])
	})
})
