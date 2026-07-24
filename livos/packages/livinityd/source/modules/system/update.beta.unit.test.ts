// Phase 311 UPDSAFE-01 — offline unit proof of the beta-channel semver-max
// selector. PURE function (no Redis/Docker/network), so this runs offline
// unlike the env-blocked integration suites. Follows the module's *.unit.test.ts
// convention.
//
// Phase 311 CR-01 — the CROSS-SELECTOR agreement suite (below) additionally
// proves this TS selector and update.sh's shell selector pick the SAME tag for
// a shared input set. See also the self-contained bash proof at
// update.beta-selector.test.sh.
//
// SemVer migration hardening (v1.1.1-beta.1 cut, 2026-07-24): the selector is
// now STRICT — only 3-part vMAJOR.MINOR.PATCH[-prerelease] tags participate;
// legacy 2-part tags (v45.30, v45.31-beta.11) are DROPPED, never coerced.
// Coercion made every legacy tag outrank the entire v1.x line forever, so a
// post-migration beta cut could never be selected and a beta-channel box would
// re-deploy the stale legacy prerelease. update.sh's shell selector carries the
// same rule via a grep filter (replicated in BETA_SELECTOR_PIPELINE below).
import {spawnSync} from 'node:child_process'

import {$} from 'execa'
import {describe, it, expect} from 'vitest'

import {pickMaxReleaseTag} from './update.js'

describe('pickMaxReleaseTag (311-01 UPDSAFE-01, strict-semver since v1.1.1-beta.1)', () => {
	it('picks the semver-max tag including a prerelease', () => {
		expect(pickMaxReleaseTag(['v1.0.1', 'v1.1.1-beta.1', 'v1.0.0'])).toBe('v1.1.1-beta.1')
	})

	it('returns the original tag string (leading v + prerelease preserved)', () => {
		const result = pickMaxReleaseTag(['v1.0.1', 'v1.1.1-beta.1', 'v1.0.0'])
		expect(result).toBe('v1.1.1-beta.1')
		expect(result?.startsWith('v')).toBe(true)
		expect(result).toContain('-beta')
	})

	it('drops invalid tags and never throws', () => {
		expect(pickMaxReleaseTag(['v1.0.1', 'not-a-version', 'v1.0.2'])).toBe('v1.0.2')
	})

	it('returns null for an empty list', () => {
		expect(pickMaxReleaseTag([])).toBeNull()
	})

	it('returns the single tag when only one is present', () => {
		expect(pickMaxReleaseTag(['v1.0.1'])).toBe('v1.0.1')
	})

	it('selects the semver-max among strict 3-part tags', () => {
		expect(pickMaxReleaseTag(['v1.0.0', 'v1.2.0', 'v1.1.9'])).toBe('v1.2.0')
		expect(pickMaxReleaseTag(['v1.0.0', 'v1.0.1-beta.1', 'v1.0.1'])).toBe('v1.0.1')
		expect(pickMaxReleaseTag(['v1.1.0-beta.1', 'v1.1.0-beta.2', 'v1.1.0-beta.10'])).toBe(
			'v1.1.0-beta.10',
		)
	})

	// The migration pin: legacy 2-part tags are EXCLUDED from selection, so a
	// fresh v1.x beta wins even while the legacy releases still exist on GitHub.
	// (Before this hardening, coercion ranked 45.31.0 > 1.1.1-beta.1 and the
	// beta channel was permanently stuck on the legacy line.)
	it('drops legacy 2-part tags so the v1.x line wins beta selection', () => {
		expect(pickMaxReleaseTag(['v45.30', 'v45.31-beta.11', 'v1.1.1-beta.1'])).toBe('v1.1.1-beta.1')
		expect(pickMaxReleaseTag(['v45.30', 'v1.0.0'])).toBe('v1.0.0')
	})

	it('returns null when ONLY legacy 2-part tags exist (graceful no-update)', () => {
		expect(pickMaxReleaseTag(['v45.30', 'v45.31-beta.11', 'v44.2'])).toBeNull()
	})
})

// Phase 311 CR-01 — the shared input set used by BOTH the pure-TS pins and the
// bash cross-selector comparison. Each entry pins the tag both selectors MUST
// agree on. The first case is the headline promotion bug (a beta promoted to
// its own final release under the same base): both selectors must resolve the
// final, never the older beta. Cases use strict 3-part tags per the migration.
const CROSS_SELECTOR_CASES: Array<{tags: string[]; expected: string}> = [
	{tags: ['v1.1.0', 'v1.1.1-beta.1', 'v1.1.1'], expected: 'v1.1.1'}, // promotion (was the bug)
	{tags: ['v1.1.1', 'v1.1.1-beta.1', 'v1.1.0'], expected: 'v1.1.1'}, // reversed API order
	{tags: ['v1.1.0', 'v1.1.1-beta.1'], expected: 'v1.1.1-beta.1'}, // beta only -> beta wins
	{tags: ['v1.1.0', 'v1.1.1'], expected: 'v1.1.1'}, // stable only, unaffected
	{tags: ['v1.1.1-beta.1', 'v1.1.1-beta.2', 'v1.1.1-beta.10'], expected: 'v1.1.1-beta.10'}, // numeric beta order
	{tags: ['v45.31-beta.11', 'v45.30', 'v1.1.1-beta.1'], expected: 'v1.1.1-beta.1'}, // legacy tags dropped (migration)
]

describe('pickMaxReleaseTag CR-01 promotion precedence (pure TS pins)', () => {
	it.each(CROSS_SELECTOR_CASES)(
		'resolves $expected for $tags (semver prerelease precedence, order-independent)',
		({tags, expected}) => {
			expect(pickMaxReleaseTag(tags)).toBe(expected)
		},
	)

	it('a promoted final release outranks its own beta regardless of array order', () => {
		expect(pickMaxReleaseTag(['v1.1.1-beta.1', 'v1.1.1'])).toBe('v1.1.1')
		expect(pickMaxReleaseTag(['v1.1.1', 'v1.1.1-beta.1'])).toBe('v1.1.1')
	})
})

// The shell side of update.sh's beta branch, replicated byte-for-byte here so a
// drift between the two selectors is caught by CI. Includes the strict 3-part
// grep filter added by the SemVer-migration hardening. GNU-coreutils `sort -V`
// only: the `~`-before-release semantics are GNU/Debian-specific, so skip on a
// host without a GNU sort (macOS/BSD) — the pure-TS pins above +
// update.beta-selector.test.sh (run by the 311-05 shell gate on the Ubuntu box)
// still lock the agreement there.
const BETA_SELECTOR_PIPELINE =
	"grep -E '^v?[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z.-]+)?$' | sed 's/-/~/' | sort -V | tail -1 | sed 's/~/-/'"
const hasGnuSort = (() => {
	try {
		const r = spawnSync('bash', ['-c', 'sort --version'], {encoding: 'utf8'})
		return r.status === 0 && /coreutils/i.test(r.stdout ?? '')
	} catch {
		return false
	}
})()

async function shellSelectBeta(tags: string[]): Promise<string> {
	const input = tags.length ? tags.join('\n') + '\n' : ''
	const {stdout} = await $({input})`bash -c ${BETA_SELECTOR_PIPELINE}`
	return stdout.trim()
}

describe.skipIf(!hasGnuSort)('CR-01 cross-selector agreement (TS pickMaxReleaseTag == shell sort -V)', () => {
	it.each(CROSS_SELECTOR_CASES)(
		'both selectors resolve $expected for $tags',
		async ({tags, expected}) => {
			const shellPick = await shellSelectBeta(tags)
			const tsPick = pickMaxReleaseTag(tags)
			// Both must equal each other AND the pinned expectation — this is the
			// joint proof that update.sh and update.ts never disagree on beta.
			expect(shellPick).toBe(expected)
			expect(tsPick).toBe(expected)
			expect(tsPick).toBe(shellPick)
		},
	)
})
