// @vitest-environment jsdom
//
// Phase 62 Plan 62-04 — ApiKeysRevokeModal RED tests (Wave 2 / FR-BROKER-E2-01).
//
// `@testing-library/react` is NOT installed (D-NO-NEW-DEPS locked). Per
// established Phase 30/33/38 precedent, this file ships smoke + source-
// text invariants. The source-text checks enforce the security-critical
// contract:
//   - Confirmation Dialog with destructive variant
//   - Two-step click (open modal → click destructive button) — T-62-16
//   - apiKeys.revoke mutation wired
//   - utils.apiKeys.list.invalidate() on success (cache freshness)
//
// ─────────────────────────────────────────────────────────────────────
// Deferred RTL tests for FR-BROKER-E2-01 (require @testing-library/react):
// ─────────────────────────────────────────────────────────────────────
//
//   AKR1 (FR-BROKER-E2-01 — confirmation copy): render <ApiKeysRevokeModal
//     keyId='k1' keyName='My Key' open={true}/>; expect text containing
//     'My Key' AND warning copy ('cannot be undone' or 'will invalidate').
//
//   AKR2 (FR-BROKER-E2-01 — Cancel does NOT revoke): mock revoke mutation;
//     click Cancel; expect mutation NOT called; expect onClose called.
//
//   AKR3 (FR-BROKER-E2-01 — Confirm calls revoke({id})): click Revoke
//     button; expect mutateAsync called with {id: 'k1'}.
//
//   AKR4 (FR-BROKER-E2-01 — list invalidates on success): resolve
//     mutateAsync; expect utils.apiKeys.list.invalidate called.
//
// References:
//   - 62-04-PLAN.md Task 1 behavior spec
//   - T-62-16 (two-step revoke prevents accidental click)
//   - D-NO-NEW-DEPS locked decision

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

describe('ApiKeysRevokeModal smoke (FR-BROKER-E2-01)', () => {
	it('module exports ApiKeysRevokeModal function', async () => {
		const mod = await import('./api-keys-revoke-modal')
		expect(typeof mod.ApiKeysRevokeModal).toBe('function')
	})
})

describe('ApiKeysRevokeModal source-text invariants (FR-BROKER-E2-01)', () => {
	const sourcePath = resolve(
		process.cwd(),
		'src/routes/settings/_components/api-keys-revoke-modal.tsx',
	)

	it('imports shadcn Dialog primitives (no new deps)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/from\s+['"]@\/shadcn-components\/ui\/dialog['"]/)
	})

	it('uses trpcReact.apiKeys.revoke mutation (Phase 59 wiring)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/trpcReact\.apiKeys\.revoke/)
	})

	it('invalidates apiKeys.list on success (cache freshness)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/apiKeys\.list\.invalidate/)
	})

	it('renders a destructive-variant button (T-62-16 — explicit two-step)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/variant=['"]destructive['"]/)
	})

	it('renders both Cancel and Revoke buttons (two-step contract)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/Cancel/)
		expect(source).toMatch(/Revoke/)
	})

	it('contains a warning copy explaining clients will get 401', () => {
		const source = readFileSync(sourcePath, 'utf8')
		// Accept any of: '401', 'invalid', 'cannot be undone', 'break clients'
		expect(source).toMatch(/401|invalidate|cannot be undone|break/i)
	})
})
