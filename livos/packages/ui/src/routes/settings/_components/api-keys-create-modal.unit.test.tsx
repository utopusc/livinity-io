// @vitest-environment jsdom
//
// Phase 62 Plan 62-04 — ApiKeysCreateModal RED tests (Wave 2 / FR-BROKER-E2-01).
//
// `@testing-library/react` is NOT installed (D-NO-NEW-DEPS locked). Per
// established Phase 30/33/38 precedent, this file ships smoke + source-
// text invariants. The source-text checks enforce the security-critical
// contract:
//   - Two-state Dialog (input → show-once)
//   - navigator.clipboard.writeText with plaintext (Pattern 5)
//   - One-time warning admonition copy (D-NO-PERSIST-PLAINTEXT)
//   - Cleanup on close (setPlaintext(null) — T-62-14 mitigation)
//   - No console.log of plaintext (T-62-13 mitigation)
//
// ─────────────────────────────────────────────────────────────────────
// Deferred RTL tests for FR-BROKER-E2-01 (require @testing-library/react):
// ─────────────────────────────────────────────────────────────────────
//
//   AKM1 (FR-BROKER-E2-01 — initial state): render <ApiKeysCreateModal
//     open={true}/>; expect Input visible (name field) + Submit button.
//
//   AKM2 (FR-BROKER-E2-01 — Submit calls create): mock trpcReact.apiKeys
//     .create.useMutation → {mutateAsync: vi.fn().mockResolvedValue(...)};
//     fireEvent.change Input value='Test'; fireEvent.click Submit;
//     expect mutateAsync called with {name: 'Test'}.
//
//   AKM3 (FR-BROKER-E2-01 — show-once switch): resolve mutateAsync to
//     {id:'k1', plaintext:'liv_sk_xxx', prefix:'liv_sk_a', name:'Test',
//     created_at: new Date()}; expect plaintext 'liv_sk_xxx' visible,
//     Copy button visible, name input HIDDEN.
//
//   AKM4 (FR-BROKER-E2-01 — Copy invokes clipboard): vi.stubGlobal(
//     'navigator', {clipboard: {writeText: vi.fn().mockResolvedValue(
//     undefined)}}); click Copy; expect writeText called with the
//     plaintext (NOT prefix or name).
//
//   AKM5 (FR-BROKER-E2-01 — Close clears plaintext): click 'I've saved
//     it, close'; expect onClose called. Remount with open=true; expect
//     initial state (no plaintext leak — T-62-14 contract).
//
//   AKM6 (FR-BROKER-E2-01 — warning admonition): expect text matching
//     /save.*now|only time|won't be able to see|NOT be able/i in the
//     show-once state.
//
// References:
//   - 62-04-PLAN.md Task 1 behavior spec
//   - 62-RESEARCH.md §Pattern 5 (clipboard) §Pattern 6 (Dialog)
//   - environments-section.tsx:865-875 (clipboard precedent)
//   - D-NO-NEW-DEPS locked decision

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

describe('ApiKeysCreateModal smoke (FR-BROKER-E2-01)', () => {
	it('module exports ApiKeysCreateModal function', async () => {
		const mod = await import('./api-keys-create-modal')
		expect(typeof mod.ApiKeysCreateModal).toBe('function')
	})
})

describe('ApiKeysCreateModal source-text invariants (FR-BROKER-E2-01)', () => {
	const sourcePath = resolve(
		process.cwd(),
		'src/routes/settings/_components/api-keys-create-modal.tsx',
	)

	it('uses navigator.clipboard.writeText (Pattern 5 — env-section precedent)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/navigator\.clipboard\.writeText/)
	})

	it('imports shadcn Dialog primitives (no new deps)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/from\s+['"]@\/shadcn-components\/ui\/dialog['"]/)
	})

	it('imports sonner toast for copy feedback (project precedent)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/from\s+['"]sonner['"]/)
	})

	it('uses trpcReact.apiKeys.create mutation (Phase 59 wiring)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/trpcReact\.apiKeys\.create/)
	})

	it('contains the one-time warning copy (D-NO-PERSIST-PLAINTEXT contract)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		// Accept any of: "save it now", "only time", "won't be able", "NOT be able"
		expect(source).toMatch(/save.*now|only time|won.?t be able|NOT be able to see/i)
	})

	it('clears plaintext from state on close (T-62-14 mitigation)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		// Either setPlaintext(null) or setPlaintext('') in close handler
		expect(source).toMatch(/setPlaintext\(\s*(?:null|''|"")\s*\)/)
	})

	it('NEVER console.logs the plaintext (T-62-13 mitigation)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).not.toMatch(/console\.(log|info|debug)[^)]*plaintext/i)
	})

	it('renders a Copy button (icon or text)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/Copy|TbCopy/)
	})
})
