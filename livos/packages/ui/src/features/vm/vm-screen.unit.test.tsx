// @vitest-environment jsdom
//
// Phase 355-01 (VMVNC-01, VMVNC-02) — VM screen honesty + jargon guard tests.
//
// `@testing-library/react` is NOT installed in this UI package (danger-zone
// precedent, verified 2026-07-21) — no render/screen. These are source-text
// invariants over the raw component text (readFileSync) pinning the honesty
// guarantees the threat model (T-355-01/02) depends on, which tsc/pnpm build
// cannot catch (they are string/structure invariants, not type errors).
//
// 355 retargets the honesty guard away from the retired iframe onLoad/timeout
// heuristic onto the native RFB status machine (connecting/disconnected/error)
// and adds a durable jargon guard over the vm.screen.* locale values.

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

describe('running VM shows LivOS\'s own native RFB canvas — no iframe (VMVNC-01)', () => {
	it('vm-screen.tsx renders a native RFB canvas via useWebAppVnc, not a dockur-page iframe', () => {
		const src = read(SCREEN)
		// The iframe (and its /vm/<id>/ page src) is GONE.
		expect(src).not.toMatch(/<iframe/)
		expect(src).not.toMatch(/src=\{`\/vm\/\$\{vm\.id\}\/`\}/)
		// The screen is now the shared RFB hook, interactive (viewOnly:false),
		// rendered into our own container ref.
		expect(src).toMatch(/useWebAppVnc\(/)
		expect(src).toMatch(/viewOnly:\s*false/)
		expect(src).toMatch(/vnc\.containerRef/)
		// The canvas mounts ONLY while running.
		expect(src).toMatch(/isRunning[\s\S]{0,200}vnc\.containerRef/)
	})
	it('vm-screen.tsx opens the same-origin /vm/<id>/websockify WS bridge with cookie auth (no ?token)', () => {
		const src = read(SCREEN)
		// Same-origin websockify URL (353 gate reads the session cookie).
		expect(src).toMatch(/\/vm\/\$\{[^}]+\}\/websockify/)
		// Cookie-only — NEVER a token query on the WS URL.
		expect(src).not.toMatch(/websockify\?token/)
	})
})

describe('the canvas is NEVER presented as working without a real RFB connect (VMVNC-01 / T-355-01)', () => {
	it('vm-screen.tsx drives honest connecting/disconnected/error states off the RFB status machine', () => {
		const src = read(SCREEN)
		// Honest states from real RFB events (replaces the retired onLoad/timeout
		// blank-frame heuristic — strictly MORE honest).
		expect(src).toMatch(/vnc\.status === 'connecting'/)
		expect(src).toMatch(/vnc\.status === 'disconnected'/)
		expect(src).toMatch(/vnc\.status === 'error'/)
		// Disconnected/error surface an honest Reconnect affordance.
		expect(src).toMatch(/vnc\.reconnect/)
		expect(src).toMatch(/vm\.screen\.error\.retry/)
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

describe('zero user-facing VNC jargon — every vm.screen.* value is jargon-free (VMVNC-02 / T-355-02)', () => {
	it('no vm.screen.* EN or TR locale value contains VNC/noVNC/RFB/websockify', () => {
		const en = JSON.parse(read(EN)) as Record<string, string>
		const tr = JSON.parse(read(TR)) as Record<string, string>
		for (const locale of [en, tr]) {
			for (const [k, v] of Object.entries(locale)) {
				if (!k.startsWith('vm.screen.')) continue
				expect(v, `jargon in ${k}: ${v}`).not.toMatch(/VNC|noVNC|RFB|websockify/i)
			}
		}
	})
	it('vm-screen.tsx never renders raw hook jargon (no \'VNC error\' literal, no vnc.errorMessage)', () => {
		const src = read(SCREEN)
		// The hook can set English strings like 'VNC security failure' / 'VNC
		// error' — the VM screen must render ONLY jargon-free t() copy instead.
		expect(src).not.toContain("'VNC error'")
		expect(src).not.toMatch(/vnc\.errorMessage/)
	})
})

describe('VmScreen stays 356-ready — unchanged {vm, onBack} export surface', () => {
	it('vm-screen.tsx keeps the named VmScreen({vm, onBack}) export so 356 can host it in a window', () => {
		const src = read(SCREEN)
		expect(src).toMatch(/export function VmScreen\(\{vm, onBack\}/)
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
