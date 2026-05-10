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

// ─────────────────────────────────────────────────────────────────
// Phase 100-09-05 — drawer Chat replaced by inline bottom bar.
// ─────────────────────────────────────────────────────────────────

const BOTTOM_BAR_PATH = resolve(__dirname, 'app-contents/webapp-chat-bottom-bar.tsx')
const STORE_PATH = resolve(__dirname, 'webapp-drawer-store.ts')
const FLOATING_BAR_PATH = resolve(__dirname, 'webapp-floating-action-bar.tsx')

function safeRead(path: string): string {
	try {
		return readFileSync(path, 'utf8')
	} catch {
		return ''
	}
}

describe('Phase 100-09-05 inline chat at bottom', () => {
	it("T-09-05-01: renders <WebAppChatBottomBar/> inside webapp-stream-window.tsx", () => {
		expect(SRC).toMatch(/<WebAppChatBottomBar\b/)
		expect(SRC).toMatch(/from '\.\/webapp-chat-bottom-bar'/)
	})

	it('T-09-05-02: Sheet drawer host no longer renders chat branch', () => {
		expect(SRC).not.toMatch(/openDrawer === 'chat'\s*\?\s*<WebAppChatDrawer/)
		// The Sheet open prop should explicitly exclude 'chat':
		expect(SRC).toMatch(/openDrawer !== null && openDrawer !== 'chat'/)
	})

	it('T-09-05-05: WebAppChatBottomBar component file exists, anchored absolute bottom, uses required hooks', () => {
		const bottomSrc = safeRead(BOTTOM_BAR_PATH)
		expect(bottomSrc.length).toBeGreaterThan(0)
		expect(bottomSrc).toMatch(/absolute\s+inset-x-0\s+bottom-0/)
		expect(bottomSrc).toMatch(/useWebAppAgent/)
		expect(bottomSrc).toMatch(/chatLogExpandedByWebappId/)
		expect(bottomSrc).toMatch(/ChatInput/)
	})
})

describe('Phase 100-09-05 drawer store + floating bar', () => {
	it('T-09-05-03: drawer store has toggleChatLog action + chatLogExpandedByWebappId state', () => {
		const storeSrc = safeRead(STORE_PATH)
		expect(storeSrc).toMatch(/toggleChatLog/)
		expect(storeSrc).toMatch(/chatLogExpandedByWebappId/)
	})

	it('T-09-05-04: floating bar Chat icon calls toggleChatLog (not drawer toggle for chat)', () => {
		const barSrc = safeRead(FLOATING_BAR_PATH)
		expect(barSrc).toMatch(/toggleChatLog\(webappId\)/)
		// Sentinel: chat must be branch-distinguished:
		expect(barSrc).toMatch(/id === 'chat'/)
	})
})

// ─────────────────────────────────────────────────────────────────
// Phase 100-09-06 — drawer Teach replaced by popup host + skills popover.
// ─────────────────────────────────────────────────────────────────

describe('Phase 100-09-06 teach popup + skills popover + drawer store', () => {
	it('T-09-06-U1: <WebAppTeachPopupHost/> rendered in webapp-stream-window.tsx', () => {
		expect(SRC).toMatch(/<WebAppTeachPopupHost\b/)
		expect(SRC).toMatch(/from '\.\/webapp-teach-popup-host'/)
	})

	it('T-09-06-U2: <WebAppSkillsPopover/> rendered in webapp-stream-window.tsx', () => {
		expect(SRC).toMatch(/<WebAppSkillsPopover\b/)
		expect(SRC).toMatch(/from '\.\/webapp-skills-popover'/)
	})

	it('T-09-06-U3: Sheet drawer host excludes both chat AND teach branches', () => {
		expect(SRC).not.toMatch(/openDrawer === 'teach'\s*\?\s*<WebAppTeachDrawer/)
		expect(SRC).toMatch(/openDrawer !== null && openDrawer !== 'chat' && openDrawer !== 'teach'/)
	})

	it('T-09-06-U4: drawer store has isRecordingByWebappId + toggleTeachRecording', () => {
		const storeSrc = safeRead(STORE_PATH)
		expect(storeSrc).toMatch(/isRecordingByWebappId/)
		expect(storeSrc).toMatch(/toggleTeachRecording/)
	})

	it('T-09-06-U5: floating bar Teach icon calls toggleTeachRecording (not drawer toggle for teach)', () => {
		const barSrc = safeRead(FLOATING_BAR_PATH)
		expect(barSrc).toMatch(/toggleTeachRecording\(webappId\)/)
		expect(barSrc).toMatch(/id === 'teach'/)
	})
})

// ─────────────────────────────────────────────────────────────────
// Phase 100-09-08 — Chat UX rewrite: action bar 2-mode state machine.
//
// 09-05 shipped a persistent inline `WebAppChatBottomBar` INSIDE the
// WebApp window — user feedback says this is wrong: "Message Liv...
// kismi pencerenin icinde olmamasi lazimdi assagida message iconuna
// tikladigimda o kisimin butun olarak inputa donusmesi lazimdi". The
// fix: the floating action bar (rendered OUTSIDE the window per 100-06)
// becomes a 2-mode state machine — default mode='icons' (4 buttons),
// Chat icon click flips to mode='chat-input' (text input + Send + Close).
// Send/Enter sends + returns to icons. Close/Escape returns to icons
// without sending. The persistent inline `WebAppChatBottomBar` JSX
// render is REMOVED from `webapp-stream-window.tsx`.
//
// Following the file's established source-text invariant precedent
// (D-NO-NEW-DEPS — no React Testing Library), these assertions lock the
// contract via regex over the affected file sources.
// ─────────────────────────────────────────────────────────────────

describe('Phase 100-09-08 action bar 2-mode chat input', () => {
	it('T-09-08-01: drawer store exposes chatInputModeByWebappId + setChatInputMode', () => {
		const storeSrc = safeRead(STORE_PATH)
		expect(storeSrc).toMatch(/chatInputModeByWebappId/)
		expect(storeSrc).toMatch(/setChatInputMode/)
		// Mode union type must include both states:
		expect(storeSrc).toMatch(/['"]icons['"]/)
		expect(storeSrc).toMatch(/['"]chat-input['"]/)
	})

	it("T-09-08-02: floating bar is a 2-mode state machine — Chat icon click sets mode='chat-input'", () => {
		const barSrc = safeRead(FLOATING_BAR_PATH)
		// Subscribe to the per-webappId mode slot:
		expect(barSrc).toMatch(/chatInputModeByWebappId/)
		// Chat icon's onClick must flip mode to 'chat-input' (NOT the old
		// `toggleChatLog` wire from 09-05).
		expect(barSrc).toMatch(/setChatInputMode\(\s*webappId\s*,\s*['"]chat-input['"]/)
		// The 09-05 `toggleChatLog` wire is replaced — assert it's no longer
		// the Chat icon's onClick. Grep the literal store accessor to make
		// sure the subscription line is gone too.
		expect(barSrc).not.toMatch(/toggleChatLog\(webappId\)/)
		expect(barSrc).not.toMatch(/chatLogExpandedByWebappId\[webappId\]/)
	})

	it("T-09-08-03: floating bar ChatInputBar exits to mode='icons' on Send and Close paths", () => {
		const barSrc = safeRead(FLOATING_BAR_PATH)
		// Send + Close + Escape paths all call setChatInputMode(..., 'icons').
		// Lock the literal call shape so a future edit can't silently break
		// the return-to-icons invariant.
		expect(barSrc).toMatch(/setChatInputMode\(\s*webappId\s*,\s*['"]icons['"]/)
		// The chat-input branch must wire Escape key handling to the same exit.
		expect(barSrc).toMatch(/['"]Escape['"]/)
		// useWebAppAgent powers Send/Enter — chat-input branch must consume it.
		expect(barSrc).toMatch(/useWebAppAgent/)
		// Send + close icons from lucide-react (or @tabler) — we only assert
		// SOME send-affordance + close-affordance exists. The icons we ship
		// match the <interfaces> sketch's `Send` + `X` lucide imports.
		expect(barSrc).toMatch(/\b(Send|IconSend)\b/)
		expect(barSrc).toMatch(/\b(X|IconX)\b/)
	})

	it('T-09-08-04: webapp-stream-window.tsx no longer renders <WebAppChatBottomBar/>', () => {
		// Sentinel: the persistent inline bar from 09-05 is gone. The JSX
		// render call is removed AND its import is removed. The file retains
		// references to the component name in the deprecation comment, so we
		// assert the JSX opening tag specifically.
		expect(SRC).not.toMatch(/<WebAppChatBottomBar\b/)
		expect(SRC).not.toMatch(/from '\.\/webapp-chat-bottom-bar'/)
	})

	it('T-09-08-05: webapp-chat-bottom-bar.tsx carries DEPRECATED 2026-05-10 (P100-09-08) banner', () => {
		const bottomSrc = safeRead(BOTTOM_BAR_PATH)
		// File preserved for revert safety — must carry the deprecation note.
		expect(bottomSrc).toMatch(/DEPRECATED 2026-05-10 \(P100-09-08\)/)
	})
})
