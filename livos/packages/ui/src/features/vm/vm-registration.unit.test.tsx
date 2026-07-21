// @vitest-environment jsdom
//
// Phase 352-01 (VMAPP-01) — VM app registration + admin-gate tests.
//
// `@testing-library/react` is NOT installed in this UI package (verified
// via package.json devDeps). Per the established danger-zone.unit.test.tsx
// idiom we ship three parts (no DOM render):
//   A. Smoke import — decideVmVisibility is a function.
//   B. Exhaustive pure-fn coverage of decideVmVisibility (4 combos → 3 states).
//   C. REGISTRY-SPRAWL GUARD — the ONLY offline catch for a missed registry
//      touchpoint (tsc/pnpm build will NOT flag a missing plain-object map
//      entry). Reads the raw source of the 5 mandatory registry files and
//      asserts the LIVINITY_vm id appears in each, plus per-map depth checks
//      inside dock-item's three maps + window-content's fullHeightApps Set +
//      the window-content lazy import & switch arm.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

// ── Part A: smoke ────────────────────────────────────────────────────────
describe('VM app scaffold smoke', () => {
	it('decide-vm-visibility exports decideVmVisibility as a function', async () => {
		const mod = await import('./decide-vm-visibility')
		expect(typeof mod.decideVmVisibility).toBe('function')
	})
})

// ── Part B: exhaustive pure-fn coverage ──────────────────────────────────
describe('decideVmVisibility (whole-surface admin gate)', () => {
	it('isLoading=true -> "loading" regardless of isAdmin (admin)', async () => {
		const {decideVmVisibility} = await import('./decide-vm-visibility')
		expect(decideVmVisibility({isLoading: true, isAdmin: true})).toBe('loading')
	})
	it('isLoading=true -> "loading" regardless of isAdmin (non-admin)', async () => {
		const {decideVmVisibility} = await import('./decide-vm-visibility')
		expect(decideVmVisibility({isLoading: true, isAdmin: false})).toBe('loading')
	})
	it('isLoading=false + isAdmin=true -> "vm-app"', async () => {
		const {decideVmVisibility} = await import('./decide-vm-visibility')
		expect(decideVmVisibility({isLoading: false, isAdmin: true})).toBe('vm-app')
	})
	it('isLoading=false + isAdmin=false -> "non-admin-note"', async () => {
		const {decideVmVisibility} = await import('./decide-vm-visibility')
		expect(decideVmVisibility({isLoading: false, isAdmin: false})).toBe('non-admin-note')
	})
	it('the three states are exhaustive (all 4 input combos map onto exactly 3 states)', async () => {
		const {decideVmVisibility} = await import('./decide-vm-visibility')
		const got = new Set([
			decideVmVisibility({isLoading: false, isAdmin: false}),
			decideVmVisibility({isLoading: false, isAdmin: true}),
			decideVmVisibility({isLoading: true, isAdmin: false}),
			decideVmVisibility({isLoading: true, isAdmin: true}),
		])
		expect(got).toEqual(new Set(['non-admin-note', 'vm-app', 'loading']))
	})
})

// ── Part C: registry-sprawl guard ────────────────────────────────────────
// process.cwd() at vitest run-time is the UI package root (livos/packages/ui).
const registryFiles = [
	'src/providers/apps.tsx',
	'src/modules/desktop/system-windowed-routes.ts',
	'src/modules/desktop/dock-item.tsx',
	'src/components/launchpad-grid.tsx',
	'src/modules/window/window-content.tsx',
]

describe('registry-sprawl guard: LIVINITY_vm across all 5 mandatory touchpoints', () => {
	for (const rel of registryFiles) {
		it(`${rel} registers LIVINITY_vm`, () => {
			const src = readFileSync(resolve(process.cwd(), rel), 'utf8')
			expect(src).toMatch(/LIVINITY_vm/)
		})
	}

	// A registry mention without the switch arm (or without the lazy import)
	// still dead-ends into NotFound. Assert BOTH exist in window-content.
	const wcSrc = readFileSync(resolve(process.cwd(), 'src/modules/window/window-content.tsx'), 'utf8')
	it('window-content.tsx has the vm-content lazy import', () => {
		expect(wcSrc).toMatch(/import\(['"]\.\/app-contents\/vm-content['"]\)/)
	})
	it('window-content.tsx has the LIVINITY_vm switch arm', () => {
		expect(wcSrc).toMatch(/case ['"]LIVINITY_vm['"]/)
	})
})

// ── Part C-2: per-map / per-Set depth checks ─────────────────────────────
// A single whole-file match passes even if LIVINITY_vm landed in only ONE of
// dock-item's THREE maps (silent no-glyph/no-tint tile bug tsc can't catch).
describe('dock-item per-map depth: LIVINITY_vm in every map', () => {
	const dockSrc = readFileSync(resolve(process.cwd(), 'src/modules/desktop/dock-item.tsx'), 'utf8')
	for (const mapName of ['DOCK_LABELS', 'DOCK_ICONS', 'DOCK_TINTS']) {
		it(`dock-item ${mapName} contains LIVINITY_vm`, () => {
			// Extract the object-literal block for this map (up to the closing
			// `}` that starts a line) and assert membership independently.
			const block = dockSrc.match(new RegExp(mapName + '[\\s\\S]*?\\n\\}'))?.[0] ?? ''
			expect(block).toMatch(/LIVINITY_vm/)
		})
	}
})

describe('window-content fullHeightApps depth', () => {
	const wcSrc = readFileSync(resolve(process.cwd(), 'src/modules/window/window-content.tsx'), 'utf8')
	it('fullHeightApps Set includes LIVINITY_vm', () => {
		const block = wcSrc.match(/fullHeightApps = new Set\(\[[\s\S]*?\]\)/)?.[0] ?? ''
		expect(block).toMatch(/LIVINITY_vm/)
	})
})
