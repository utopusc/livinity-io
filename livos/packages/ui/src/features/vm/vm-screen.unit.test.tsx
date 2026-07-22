// @vitest-environment jsdom
//
// Phase 353-02 (VMVIEW-01, VMVIEW-02) — VM screen honesty guard tests.
//
// `@testing-library/react` is NOT installed in this UI package (danger-zone
// precedent, verified 2026-07-21) — no render/screen. These are source-text
// invariants over the raw component text (readFileSync) pinning the honesty
// guarantees the threat model (T-353-06/07) depends on, which tsc/pnpm build
// cannot catch (they are string/structure invariants, not type errors).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

// process.cwd() at vitest run-time is the UI package root (livos/packages/ui).
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

const SCREEN = 'src/features/vm/components/vm-screen.tsx'
const LIST_ITEM = 'src/features/vm/components/vm-list-item.tsx'
const VM_LIST = 'src/features/vm/components/vm-list.tsx'
const EN = 'public/locales/en.json'
const TR = 'public/locales/tr.json'

describe('running VM shows a same-origin noVNC iframe (VMVIEW-01)', () => {
	it('vm-screen.tsx renders a same-origin /vm/<id> iframe with a testid', () => {
		const src = read(SCREEN)
		// Same-origin relative src onto the Plan-01 proxy route (no cross-subdomain).
		// ROOT with TRAILING SLASH (verified 2026-07-22): dockur/qemus serves the
		// viewer at `/` (not /vnc.html), and the trailing slash is required for the
		// viewer's relative assets + getURL()-derived /vm/<id>/{websockify,status} WS.
		expect(src).toMatch(/src=\{`\/vm\/\$\{vm\.id\}\/`\}/)
		// The iframe src itself must NOT carry the old /vnc.html guess (the doc
		// comment above legitimately references it, so scope the check to src=).
		expect(src).not.toMatch(/src=\{`[^`]*vnc\.html/)
		expect(src).toMatch(/data-testid='vm-screen-iframe'/)
		// Gated behind the running state.
		expect(src).toMatch(/isRunning/)
	})
	it('vm-screen.tsx uses a MINIMAL, exact sandbox token list (T-353-07 — no forms/popups/downloads)', () => {
		const src = read(SCREEN)
		expect(src).toMatch(/VM_SCREEN_SANDBOX = 'allow-same-origin allow-scripts'/)
		expect(src).not.toMatch(/allow-forms/)
		expect(src).not.toMatch(/allow-popups/)
		expect(src).not.toMatch(/allow-downloads/)
	})
})

describe('the iframe is NEVER presented as working until it confirms a load (VMVIEW-02 / T-353-06)', () => {
	it('vm-screen.tsx tracks onLoad/onError + a timeout, and shows a retry affordance on failure', () => {
		const src = read(SCREEN)
		// The blank-frame heuristic: onLoad -> loaded, onError -> failed, timeout -> failed.
		expect(src).toMatch(/onLoad=\{\(\) => setLoaded\(true\)\}/)
		expect(src).toMatch(/onError=\{\(\) => setFailed\(true\)\}/)
		expect(src).toMatch(/setTimeout\(\(\) => setFailed\(true\)/)
		// Failure branch shows an honest retry, not a bare iframe.
		expect(src).toMatch(/vm\.screen\.error\.blank-frame/)
		expect(src).toMatch(/vm\.screen\.error\.retry/)
		// The iframe is only rendered while running AND not failed.
		expect(src).toMatch(/isRunning && !failed/)
	})
})

describe('non-running states show honest affordances, not a screen', () => {
	it('vm-screen.tsx maps stopped -> start, creating/installing-os -> progress, error -> lastError', () => {
		const src = read(SCREEN)
		// stopped -> start affordance wired to vm.start.
		expect(src).toMatch(/vm\.state === 'stopped'/)
		expect(src).toMatch(/trpcReact\.vm\.start\.useMutation/)
		// creating / installing-os -> honest progress copy.
		expect(src).toMatch(/vm\.state === 'creating'/)
		expect(src).toMatch(/vm\.state === 'installing-os'/)
		expect(src).toMatch(/vm\.screen\.state\.creating/)
		expect(src).toMatch(/vm\.screen\.state\.installing-os/)
		// error -> honest copy + the RAW lastError.
		expect(src).toMatch(/vm\.state === 'error'/)
		expect(src).toMatch(/vm\.lastError/)
	})
})

describe('Windows VMs surface an RDP hint from getIpAddresses + rdpPort (VMVIEW-02)', () => {
	it('vm-screen.tsx renders the rdp-hint only for kind windows', () => {
		const src = read(SCREEN)
		expect(src).toMatch(/trpcReact\.system\.getIpAddresses\.useQuery/)
		expect(src).toMatch(/vm\.kind === 'windows'/)
		expect(src).toMatch(/vm\.rdpPort/)
		expect(src).toMatch(/vm\.screen\.rdp-hint/)
	})
})

describe('open-screen is wired to the screen view — no dead placeholder (VMVIEW-01)', () => {
	it('vm-list-item.tsx open-screen is enabled and calls onOpenScreen(vm), coming-353 retired', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/onOpenScreen/)
		expect(src).toMatch(/onClick=\{\(\) => onOpenScreen\(vm\)\}/)
		// The dishonest disabled placeholder is gone.
		expect(src).not.toMatch(/vm\.open-screen\.coming-353/)
	})
	it('vm-list.tsx owns the list<->screen view state and passes onOpenScreen', () => {
		const src = read(VM_LIST)
		expect(src).toMatch(/VmScreen/)
		expect(src).toMatch(/onOpenScreen/)
		expect(src).toMatch(/setScreenVm/)
	})
})

describe('EN/TR parity for every new vm.screen.* key (hard gate)', () => {
	it('every vm.screen.* EN key has an exact-match TR key', () => {
		const en = JSON.parse(read(EN)) as Record<string, string>
		const tr = JSON.parse(read(TR)) as Record<string, string>
		const screenKeys = Object.keys(en).filter((k) => k.startsWith('vm.screen.'))
		expect(screenKeys.length).toBeGreaterThan(0)
		for (const k of screenKeys) {
			expect(tr[k], `missing TR key: ${k}`).toBeTruthy()
		}
		// The retired dishonest key is gone from BOTH.
		expect(en['vm.open-screen.coming-353']).toBeUndefined()
		expect(tr['vm.open-screen.coming-353']).toBeUndefined()
	})
})
