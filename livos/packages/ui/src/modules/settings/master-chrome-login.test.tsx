// @vitest-environment jsdom
//
// Phase 102-07 Task 4 — MasterChromeLogin source-text invariants.
//
// `@testing-library/react` is NOT installed in @livos/ui (D-NO-NEW-DEPS).
// Mirrors the dock/native-app-icon.test.tsx pattern: source-text grep
// invariants over the component file + a smoke-import. Verifies the
// component wires the right tRPC hooks, button labels, AlertDialog, and
// admin-gated reset confirm.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const SRC_PATH = resolve(__dirname, 'master-chrome-login.tsx')
const SRC = readFileSync(SRC_PATH, 'utf8')

describe('MasterChromeLogin — title + status indicator', () => {
	it('renders "Chrome Master Login" title (D-102-MASTER-LOGIN-UI)', () => {
		expect(SRC).toMatch(/Chrome Master Login/)
	})

	it('renders "Logged in" / "Not logged in" status text (driven by status.data.hasCookies)', () => {
		expect(SRC).toMatch(/Logged in/)
		expect(SRC).toMatch(/Not logged in/)
		// The branch is keyed off hasCookies
		expect(SRC).toMatch(/hasCookies/)
	})

	it('renders "Master Chrome running" indicator (driven by status.data.running)', () => {
		expect(SRC).toMatch(/Master Chrome running/)
		expect(SRC).toMatch(/\.running/)
	})

	it('applies green class when loggedIn === true', () => {
		// loggedIn ? 'text-green-...' : 'text-...' ternary
		expect(SRC).toMatch(/text-green-/)
	})
})

describe('MasterChromeLogin — tRPC wiring', () => {
	it('polls trpcReact.chromeMaster.status (refetchInterval keeps the indicator current)', () => {
		expect(SRC).toMatch(/trpcReact\.chromeMaster\.status\.useQuery/)
		expect(SRC).toMatch(/refetchInterval/)
	})

	it('startLogin button calls trpcReact.chromeMaster.startLogin.useMutation().mutate', () => {
		expect(SRC).toMatch(/trpcReact\.chromeMaster\.startLogin\.useMutation/)
		expect(SRC).toMatch(/startMut\.mutate/)
	})

	it('reset confirm calls trpcReact.chromeMaster.reset.useMutation().mutate({backup: true})', () => {
		expect(SRC).toMatch(/trpcReact\.chromeMaster\.reset\.useMutation/)
		expect(SRC).toMatch(/resetMut\.mutate\(\s*\{\s*backup\s*:\s*true\s*\}/)
	})

	it('invalidates chromeMaster.status after successful mutations', () => {
		expect(SRC).toMatch(/utils\.chromeMaster\.status\.invalidate/)
	})
})

describe('MasterChromeLogin — button labels + AlertDialog confirm', () => {
	it('shows "Open Master Chrome" button label', () => {
		expect(SRC).toMatch(/Open Master Chrome/)
	})

	it('shows "Reset Master Profile" destructive button (T-102-07c confirm gate)', () => {
		expect(SRC).toMatch(/Reset Master Profile/)
		// destructive variant signals data-loss UI affordance
		expect(SRC).toMatch(/variant=['"]destructive['"]/)
	})

	it('Reset button opens an AlertDialog (confirm-before-destroy)', () => {
		expect(SRC).toMatch(/<AlertDialog\b/)
		expect(SRC).toMatch(/<AlertDialogContent\b/)
		expect(SRC).toMatch(/<AlertDialogAction\b/)
		expect(SRC).toMatch(/<AlertDialogCancel\b/)
	})

	it('Reset AlertDialog mentions /opt/livos/data/chrome-master.backup (user-visible recovery path)', () => {
		expect(SRC).toMatch(/chrome-master\.backup/)
	})
})

describe('MasterChromeLogin — disabled-when-running affordances', () => {
	it('Open Master Chrome button is disabled while running (singleton-lock UX)', () => {
		// disabled={running || startMut.isPending}
		expect(SRC).toMatch(/disabled=\{[^}]*running[^}]*\}/)
	})

	it('Reset Master Profile button is disabled while running (cannot reset while master Chrome holds dir)', () => {
		// At least two disabled={...running...} sites — start + reset
		const matches = SRC.match(/disabled=\{[^}]*running[^}]*\}/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(2)
	})
})

describe('MasterChromeLogin — exports + smoke import', () => {
	it('exports MasterChromeLogin as a named export', () => {
		expect(SRC).toMatch(/export\s+function\s+MasterChromeLogin\b/)
	})

	it('module loads without throwing', async () => {
		await expect(import('./master-chrome-login')).resolves.toBeTruthy()
	})
})
