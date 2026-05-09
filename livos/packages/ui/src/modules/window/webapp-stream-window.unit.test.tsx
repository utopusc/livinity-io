// @vitest-environment jsdom
//
// Phase 95-08 — webapp-stream-window source-text invariants.
//
// `@testing-library/react` is NOT installed (D-NO-NEW-DEPS — same precedent
// as 95-04 / 95-06 / 67-04). This file ships source-text invariants that
// lock the contract with the spawn/close mutations, the VNC + agent hooks,
// the resizable layout, and the persistence key shape (D-95-04).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const COMPONENT_PATH = resolve(__dirname, 'app-contents/webapp-stream-window.tsx')
const SRC = readFileSync(COMPONENT_PATH, 'utf8')

describe('WebAppStreamWindow — source-text invariants', () => {
	it('imports the spawn + close mutations from the webapp.window namespace (P93 contract)', () => {
		expect(SRC).toMatch(/webapp\.window\.spawn\.useMutation/)
		expect(SRC).toMatch(/webapp\.window\.close\.useMutation/)
	})

	it('reads the WebApp row from webapp.list (D-95-15 — copy-URL source)', () => {
		expect(SRC).toMatch(/webapp\.list\.useQuery/)
	})

	it('uses the new VNC + agent hooks (95-04 / 95-06)', () => {
		expect(SRC).toMatch(/from\s+['"]@\/hooks\/use-webapp-vnc['"]/)
		expect(SRC).toMatch(/from\s+['"]@\/hooks\/use-webapp-agent['"]/)
		expect(SRC).toMatch(/useWebAppVnc\(/)
		expect(SRC).toMatch(/useWebAppAgent\(/)
	})

	it('default mode is "chat" (D-95-10)', () => {
		expect(SRC).toMatch(/useState<WebAppMode>\(\s*['"]chat['"]\s*\)/)
	})

	it('back/forward chord uses Alt + ArrowLeft / ArrowRight via noVNC sendKey (D-95-14)', () => {
		expect(SRC).toMatch(/KEY_ALT_LEFT\s*=\s*0xffe9/)
		expect(SRC).toMatch(/KEY_ARROW_LEFT\s*=\s*0xff51/)
		expect(SRC).toMatch(/KEY_ARROW_RIGHT\s*=\s*0xff53/)
	})

	it('refresh chord is F5 keysym 0xffc2', () => {
		expect(SRC).toMatch(/KEY_F5\s*=\s*0xffc2/)
	})

	it('handles SERVICE_UNAVAILABLE with a friendly retry banner (D-95-12 + P98 carryover)', () => {
		expect(SRC).toMatch(/SERVICE_UNAVAILABLE/)
		expect(SRC).toMatch(/SpawnErrorBanner/)
		expect(SRC).toMatch(/Retry/)
	})

	it('fires close.mutate on unmount (D-95-CLEANUP — fire-and-forget)', () => {
		expect(SRC).toMatch(/closeMutationRef/)
		expect(SRC).toMatch(/closeMutationRef\.current\.mutate\(\s*\{webappId\}\s*\)/)
	})

	it('drops WebAppToolbar import (V33-MULTI-02 / G-100-E E1)', () => {
		expect(SRC).not.toMatch(/from\s+['"]\.\.\/webapp-toolbar['"]/)
		expect(SRC).not.toMatch(/<WebAppToolbar\b/)
	})

	it('drops ResizablePanelGroup vertical split (no inline agent panel below stream)', () => {
		expect(SRC).not.toMatch(/ResizablePanelGroup/)
	})

	it('uses flex-col root container (full-bleed; 100-04 bottom-bar will anchor here)', () => {
		expect(SRC).toMatch(/flex h-full w-full flex-col/)
	})

	it('reserves bottom space via pb-9 (Plan A locked — bottom-bar overlay anchored over reserved 36px)', () => {
		// Locks the canonical bottom-bar layout: stream wrapper has pb-9 so the
		// overlay bar (absolute inset-x-0 bottom-0 z-20 h-9 from 100-04) never
		// occludes stream pixels. Failing this guard means a future edit removed
		// the bottom reservation and UAT Row 5 will surface the regression.
		expect(SRC).toMatch(/pb-9/)
	})

	// ─────────────────────────────────────────────────────────────────
	// Phase 100-04 — bottom action-bar + drawer wiring invariants.
	// ─────────────────────────────────────────────────────────────────

	it('imports Sheet drawer from shadcn (G-100-D D2)', () => {
		expect(SRC).toMatch(/from\s+['"]@\/shadcn-components\/ui\/sheet['"]/)
		expect(SRC).toMatch(/<Sheet\b/)
		expect(SRC).toMatch(/closeButton=\{false\}/)
		expect(SRC).toMatch(/!w-\[35%\]/)
	})

	it('Phase 100-06: action-bar render moved OUT of stream-window (lives in webapp-floating-action-bar.tsx)', () => {
		// The bar's icon imports are no longer in this component:
		expect(SRC).not.toMatch(/\bMessageCircle\b/)
		expect(SRC).not.toMatch(/\bGraduationCap\b/)
		expect(SRC).not.toMatch(/\bBot\b/)
		expect(SRC).not.toMatch(/\bEye\b/) // Watch dropped entirely
		// And no inline overlay bar absolute-positioned at the bottom:
		expect(SRC).not.toMatch(/absolute\s+inset-x-0\s+bottom-0\s+z-20/)
	})

	it('subscribes to webapp-drawer-store for openDrawer state (Phase 100-06)', () => {
		expect(SRC).toMatch(/from\s+['"]\.\.\/webapp-drawer-store['"]/)
		expect(SRC).toMatch(/useWebAppDrawerStore/)
		expect(SRC).toMatch(/openByWebappId\[webappId\]/)
	})
})

describe('WebAppFloatingActionBar — source-text invariants (Phase 100-06)', () => {
	const BAR_SRC = readFileSync(
		resolve(__dirname, 'webapp-floating-action-bar.tsx'),
		'utf8',
	)

	it('renders 3 modes only — Watch dropped', () => {
		expect(BAR_SRC).toMatch(/MessageCircle/)
		expect(BAR_SRC).toMatch(/GraduationCap/)
		expect(BAR_SRC).toMatch(/\bBot\b/)
		expect(BAR_SRC).not.toMatch(/\bEye\b/)
	})

	it('uses round buttons with backdrop-blur + soft shadow (mirrors window-chrome.tsx)', () => {
		expect(BAR_SRC).toMatch(/rounded-full/)
		expect(BAR_SRC).toMatch(/backdrop-blur-xl/)
		expect(BAR_SRC).toMatch(/shadow-\[0_2px_8px/)
	})

	it('positions the bar OUTSIDE the window using fixed coords + Magnetic wrapper', () => {
		expect(BAR_SRC).toMatch(/className=['"]fixed select-none['"]/)
		expect(BAR_SRC).toMatch(/windowBottomY/)
		expect(BAR_SRC).toMatch(/<Magnetic\b/)
	})

	it('preserves WEBAPP_MODE_CHANGE_EVENT dispatch (Phase 96/97 listener compat)', () => {
		expect(BAR_SRC).toMatch(/WEBAPP_MODE_CHANGE_EVENT/)
		expect(BAR_SRC).toMatch(/dispatchEvent\(/)
	})

	it('subscribes to webapp-drawer-store', () => {
		expect(BAR_SRC).toMatch(/useWebAppDrawerStore/)
		expect(BAR_SRC).toMatch(/from\s+['"]\.\/webapp-drawer-store['"]/)
	})
})

describe('WebAppStreamWindow — smoke import', () => {
	it('module exports a default React component', async () => {
		const mod = await import('./app-contents/webapp-stream-window')
		expect(typeof mod.default).toBe('function')
	})
})
