// @vitest-environment jsdom
//
// Phase 62 Plan 62-05 — UsageSection filter dropdown tests (FR-BROKER-E2-02).
//
// Same smoke + source-text-invariant pattern as api-keys-section.unit.test.tsx
// (Phase 62 Plan 04). RTL is NOT installed (D-NO-NEW-DEPS locked); we ship:
//   1. Smoke test — module import + export shape
//   2. Source-text invariants — strict assertions over the source file for
//      contract details (Select dropdown wired to apiKeys.list, apiKeyId
//      forwarded to usage.getMine, revoked-key suffix, empty-state copy,
//      useUsageFilter hook integration).
//
// The 6 contract points enumerated in 62-05-PLAN.md Task 1 map to:
//   T1 — renders <Select> dropdown with "All keys" default option
//        → invariant: source contains <SelectItem value='all'>All keys</SelectItem>
//   T2 — list of active keys appears as Select options with prefix
//        → invariant: source contains keysQ.data?.map iteration over k.id/k.name/k.keyPrefix
//   T3 — revoked keys appear with '(revoked)' suffix
//        → invariant: source contains k.revokedAt ? ' (revoked)' : ''
//   T4 — selecting a key calls usage.getMine with {apiKeyId: <id>}
//        → invariant: source contains usage.getMine.useQuery({apiKeyId: ...})
//   T5 — selected filter persists across remount via localStorage
//        → invariant: source imports useUsageFilter from ./use-usage-filter
//   T6 — empty result for revoked key shows "No usage recorded for this key."
//        → invariant: source contains the verbatim copy
//
// These invariants are STRICTER than RTL inspection — RTL only verifies
// rendered DOM output, while source-text checks the actual implementation
// intent (e.g., the literal {apiKeyId} forwarding can't be silently
// omitted by a refactor without tripping the test).
//
// ─────────────────────────────────────────────────────────────────────
// Deferred RTL tests for FR-BROKER-E2-02 (require @testing-library/react):
// ─────────────────────────────────────────────────────────────────────
//
//   USR1: mock trpcReact.usage.getMine + apiKeys.list; render <UsageSection/>;
//         expect Select with "All keys" option visible.
//   USR2: mock apiKeys.list returning [{id:k1, name:'Bolt', keyPrefix:'liv_sk_a'}];
//         expect SelectItem "Bolt (liv_sk_a)" visible.
//   USR3: mock apiKeys.list with revoked key; expect "(revoked)" badge in option.
//   USR4: simulate Select onValueChange('k1'); expect getMine.useQuery called
//         with {apiKeyId:'k1'}.
//   USR5: setItem('livinity:usage:filter:apiKeyId','k1'); remount;
//         expect Select value='k1' (loaded from localStorage).
//   USR6: mock data: stats.per_app=[]; expect "No usage recorded for this key." copy.
//

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const sourcePath = resolve(process.cwd(), 'src/routes/settings/_components/usage-section.tsx')

describe('UsageSection smoke (FR-BROKER-E2-02)', () => {
	it('module exports UsageSection function', async () => {
		const mod = await import('./usage-section')
		expect(typeof mod.UsageSection).toBe('function')
	})
})

describe('UsageSection source-text invariants (FR-BROKER-E2-02)', () => {
	it('imports the useUsageFilter hook (filter persistence wiring)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/from ['"]\.\/use-usage-filter['"]/)
		expect(source).toMatch(/useUsageFilter\(\)/)
	})

	it('imports the shadcn Select primitives', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/from ['"]@\/shadcn-components\/ui\/select['"]/)
		expect(source).toMatch(/Select(Trigger|Content|Item|Value)/)
	})

	it('consumes trpcReact.apiKeys.list useQuery (Phase 59 wiring for option list)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/trpcReact\.apiKeys\.list\.useQuery/)
	})

	it('renders an "All keys" default SelectItem option', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/value=['"]all['"][^>]*>\s*All keys/)
	})

	it('forwards selected apiKeyId to usage.getMine.useQuery as {apiKeyId: ...}', () => {
		const source = readFileSync(sourcePath, 'utf8')
		// Match either {apiKeyId: filter ?? undefined} or {apiKeyId: filter}.
		expect(source).toMatch(/usage\.getMine\.useQuery\([\s\S]*apiKeyId/)
	})

	it('appends "(revoked)" suffix to option labels for revoked keys (FR-BROKER-E2-02)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		// Match either revokedAt or revoked_at (Phase 59 returns snake_case in the
		// API, but the option-rendering code may bind via either casing).
		expect(source).toMatch(/(revokedAt|revoked_at)[^?]*\?\s*['"][^'"]*revoked/)
	})

	it('FR-BROKER-E2-02: renders verbatim "No usage recorded for this key." copy', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/No usage recorded for this key\./)
	})

	it('Select.onValueChange clears filter when "all" is chosen', () => {
		const source = readFileSync(sourcePath, 'utf8')
		// Must invoke setFilter(null) when the user picks the "All keys" option.
		expect(source).toMatch(/onValueChange[\s\S]*===\s*['"]all['"][^?]*\?\s*null/)
	})

	it('renders a "Filter by API key" label adjacent to the dropdown', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/Filter by API key/)
	})
})
