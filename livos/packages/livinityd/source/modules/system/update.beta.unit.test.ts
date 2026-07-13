// Phase 311 UPDSAFE-01 — offline unit proof of the beta-channel semver-max
// selector. PURE function (no Redis/Docker/network), so this runs offline
// unlike the env-blocked integration suites. Follows the module's *.unit.test.ts
// convention.
//
// Phase 311 CR-01 — the CROSS-SELECTOR agreement suite (below) additionally
// proves this TS selector and update.sh's shell selector pick the SAME tag for
// a shared input set, closing the two-sided-consistency gap the code review
// surfaced (the shell's tilde-mapped `sort -V` must agree with pickMaxReleaseTag
// on the promotion case v44.1/v44.2-beta.1/v44.2 -> v44.2). See also the
// self-contained bash proof at update.beta-selector.test.sh.
import {spawnSync} from 'node:child_process'

import {$} from 'execa'
import {describe, it, expect} from 'vitest'

import {pickMaxReleaseTag} from './update.js'

describe('pickMaxReleaseTag (311-01 UPDSAFE-01)', () => {
	it('picks the semver-max tag including a prerelease', () => {
		expect(pickMaxReleaseTag(['v44.1', 'v44.2-beta.1', 'v44.0'])).toBe('v44.2-beta.1')
	})

	it('returns the original tag string, not the coerced form', () => {
		const result = pickMaxReleaseTag(['v44.1', 'v44.2-beta.1', 'v44.0'])
		// retains the leading 'v' and the -beta suffix (not the coerced '44.2.0')
		expect(result).toBe('v44.2-beta.1')
		expect(result?.startsWith('v')).toBe(true)
		expect(result).toContain('-beta')
	})

	it('drops uncoercible tags and never throws', () => {
		expect(pickMaxReleaseTag(['v44.1', 'not-a-version', 'v44.3'])).toBe('v44.3')
	})

	it('returns null for an empty list', () => {
		expect(pickMaxReleaseTag([])).toBeNull()
	})

	it('returns the single tag when only one is present', () => {
		expect(pickMaxReleaseTag(['v44.1'])).toBe('v44.1')
	})
})

// Phase 311 CR-01 — the shared input set used by BOTH the pure-TS pins and the
// bash cross-selector comparison. Each entry pins the tag both selectors MUST
// agree on. The first case is the headline promotion bug (a beta promoted to
// its own final release under the same base): pickMaxReleaseTag and the shell
// selector must BOTH resolve v44.2, never the older v44.2-beta.1.
const CROSS_SELECTOR_CASES: Array<{tags: string[]; expected: string}> = [
	{tags: ['v44.1', 'v44.2-beta.1', 'v44.2'], expected: 'v44.2'}, // promotion (was the bug)
	{tags: ['v44.2', 'v44.2-beta.1', 'v44.1'], expected: 'v44.2'}, // reversed API order
	{tags: ['v44.1', 'v44.2-beta.1'], expected: 'v44.2-beta.1'}, // beta only -> beta wins
	{tags: ['v44.1', 'v44.2'], expected: 'v44.2'}, // stable only, unaffected
	{tags: ['v44.2-beta.1', 'v44.2-beta.2', 'v44.2-beta.10'], expected: 'v44.2-beta.10'}, // numeric beta order
]

describe('pickMaxReleaseTag CR-01 promotion precedence (pure TS pins)', () => {
	it.each(CROSS_SELECTOR_CASES)(
		'resolves $expected for $tags (semver prerelease precedence, order-independent)',
		({tags, expected}) => {
			expect(pickMaxReleaseTag(tags)).toBe(expected)
		},
	)

	it('a promoted final release outranks its own beta regardless of array order', () => {
		// The bug was an order-dependent tie: coerce() strips -beta so both sides
		// tied at 44.2.0 and the winner depended on list order. Now v44.2 always wins.
		expect(pickMaxReleaseTag(['v44.2-beta.1', 'v44.2'])).toBe('v44.2')
		expect(pickMaxReleaseTag(['v44.2', 'v44.2-beta.1'])).toBe('v44.2')
	})
})

// The shell side of update.sh's beta branch, replicated byte-for-byte here so a
// drift between the two selectors is caught by CI. GNU-coreutils `sort -V` only:
// the `~`-before-release semantics are GNU/Debian-specific, so skip on a host
// without a GNU sort (macOS/BSD) — the pure-TS pins above + update.beta-selector.test.sh
// (run by the 311-05 shell gate on the Ubuntu box) still lock the agreement there.
const BETA_SELECTOR_PIPELINE = "sed 's/-/~/' | sort -V | tail -1 | sed 's/~/-/'"
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
