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
	// T-09-05-01 RETIRED 2026-05-10 (P100-09-08). The 09-05 contract was:
	// "webapp-stream-window.tsx renders <WebAppChatBottomBar/> inline."
	// Per user feedback this was wrong — see 09-08 plan + T-09-08-04.
	// The inverse invariant (no JSX render) is now T-09-08-04.

	it('T-09-05-02: Sheet drawer host no longer renders chat branch', () => {
		expect(SRC).not.toMatch(/openDrawer === 'chat'\s*\?\s*<WebAppChatDrawer/)
		// The Sheet open prop should explicitly exclude 'chat':
		expect(SRC).toMatch(/openDrawer !== null && openDrawer !== 'chat'/)
	})

	it('T-09-05-05: WebAppChatBottomBar component file is preserved (DEPRECATED reference target)', () => {
		// Phase 100-09-08: file kept for revert safety; v34 cleanup may
		// delete it if no consumers surface. The original 09-05 internal
		// shape (absolute inset-x-0 bottom-0, useWebAppAgent, ChatInput)
		// is still inside the file but no longer rendered anywhere.
		const bottomSrc = safeRead(BOTTOM_BAR_PATH)
		expect(bottomSrc.length).toBeGreaterThan(0)
		expect(bottomSrc).toMatch(/absolute\s+inset-x-0\s+bottom-0/)
		expect(bottomSrc).toMatch(/useWebAppAgent/)
		expect(bottomSrc).toMatch(/chatLogExpandedByWebappId/)
		expect(bottomSrc).toMatch(/ChatInput/)
	})
})

describe('Phase 100-09-05 drawer store + floating bar', () => {
	it('T-09-05-03: drawer store retains toggleChatLog action + chatLogExpandedByWebappId state', () => {
		// Phase 100-09-08: slots preserved for back-compat with the
		// (now-unrendered) WebAppChatBottomBar. v34 cleanup may remove
		// alongside the deprecated component.
		const storeSrc = safeRead(STORE_PATH)
		expect(storeSrc).toMatch(/toggleChatLog/)
		expect(storeSrc).toMatch(/chatLogExpandedByWebappId/)
	})

	// T-09-05-04 RETIRED 2026-05-10 (P100-09-08). The 09-05 contract was:
	// "floating bar Chat icon calls toggleChatLog." Per user feedback this
	// was wrong — Chat icon now flips floating-bar mode to 'chat-input'
	// via setChatInputMode. The new invariant is T-09-08-02.
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

// ─────────────────────────────────────────────────────────────────
// Phase 100-09-09 — Teach UX rewrite v2: red icon button + click count.
//
// 09-06 shipped a `TeachRecordingOverlay` at the top-right of the WebApp
// window — a pulse-red badge showing "Recording · N events" with a
// separate Stop button. User feedback after the 09-06 deploy: "Suan
// teach e tikliyorum geri tikladigimda duruyor bu guzel ama tikladiktan
// sonra kirmizi buton olsun teach. sag yukarida stop butonu olmasin ve
// sure saymasin sadece clickleri saysin."
//
// Translation: "Right now I click teach, click again it stops — that's
// good. But after clicking, the teach button should be red. No stop
// button at top-right, no time counter, only count clicks."
//
// Fix: the Teach ICON BUTTON in the floating action bar (the same one
// that started recording) becomes red while `isRecording` is true and
// renders a small numeric badge showing the click count
// (`events.length` from `useTeachRecorder`). The top-right
// `TeachRecordingOverlay` JSX render is REMOVED from
// `webapp-stream-window.tsx`. Clicking the now-red Teach icon button
// stops recording — same flow as before (drawer-store toggle → existing
// useEffect → recorder.stop + SaveSkillDialog).
//
// Source-text invariants (D-NO-NEW-DEPS — no React Testing Library)
// matching the file's established precedent.
// ─────────────────────────────────────────────────────────────────

describe('Phase 100-09-09 teach button red + click count badge', () => {
	it('T-09-09-01: floating bar IconBar Teach button background flips to bg-red-500 when isRecording', () => {
		const barSrc = safeRead(FLOATING_BAR_PATH)
		// The Teach icon button's className must include a conditional
		// `bg-red-500` (with optional opacity suffix) tied to the recording
		// state. Lock the literal class + the conditional shape.
		expect(barSrc).toMatch(/bg-red-500/)
		// The active-state branch must be `isRecording` (NOT the open-drawer
		// `active` flag from 09-06's earlier wire — that one used `bg-primary`).
		// Look for an `isRecording &&` conditional applying a red class.
		expect(barSrc).toMatch(/isRecording\s*&&\s*['"`][^'"`]*bg-red-500/)
	})

	it('T-09-09-02: floating bar IconBar reads clickCount from recorder events.length', () => {
		const barSrc = safeRead(FLOATING_BAR_PATH)
		// Lock the literal `events.length` access — the plan's must_haves
		// key_link pattern. Click count is derived from the recorder's
		// events array (not a time elapsed counter).
		expect(barSrc).toMatch(/events\.length/)
		// And it must NOT be a `Date.now()` / time-elapsed accessor.
		expect(barSrc).not.toMatch(/Date\.now\(\)\s*-\s*startedAt/)
	})

	it('T-09-09-03: floating bar IconBar renders a numeric click-count badge when isRecording && count > 0', () => {
		const barSrc = safeRead(FLOATING_BAR_PATH)
		// The badge JSX is positioned at the top-right corner of the button
		// (`-top-1 -right-1` per the plan's interfaces sketch). Lock the
		// literal class shape so a future edit can't silently break the
		// badge position.
		expect(barSrc).toMatch(/-top-1\s+-right-1/)
		// And the conditional: render badge only when recording AND count > 0.
		expect(barSrc).toMatch(/isRecording\s*&&\s*clickCount\s*>\s*0/)
	})

	it('T-09-09-04: webapp-stream-window.tsx no longer renders <TeachRecordingOverlay/> (top-right widget removed)', () => {
		// Sentinel: the 09-06 top-right recording overlay JSX render is gone.
		// The component function definition may stay (revert safety) but
		// there must be no JSX render call.
		expect(SRC).not.toMatch(/<TeachRecordingOverlay\b/)
		// And no recorder.recording-gated render block that includes the
		// stop button + event count text (the canonical shape of the old
		// overlay — `Recording · N events` text + Stop button).
		expect(SRC).not.toMatch(/recorder\.recording\s*\?\s*\(\s*<TeachRecordingOverlay/)
	})

	it('T-09-09-05: webapp-teach-popup-host.tsx contains no Date.now / elapsed / seconds time-display', () => {
		const popupSrc = safeRead(resolve(__dirname, 'app-contents/webapp-teach-popup-host.tsx'))
		expect(popupSrc.length).toBeGreaterThan(0)
		// No Date.now() — toast text must not compute elapsed time.
		expect(popupSrc).not.toMatch(/Date\.now\(/)
		// No "elapsed" word in any string literal.
		expect(popupSrc).not.toMatch(/elapsed/i)
		// No "seconds" word in any string literal.
		expect(popupSrc).not.toMatch(/seconds/i)
	})
})

// ─────────────────────────────────────────────────────────────────
// Phase 100-10-05 — UI cleanup (D-100-10-D, F, G).
//
// Three coordinated fixes:
//   D-100-10-D: Skill button moved OUTSIDE the WebApp window at
//   top-right. New file `webapp-floating-skills-button.tsx`. The
//   inside-window `<WebAppSkillsPopover/>` JSX render is removed.
//   D-100-10-F: noVNC canvas wrapper gets `object-fit: cover` (or
//   equivalent Tailwind `object-cover`) so the stream fills the
//   entire WebApp window content area (no more black space below).
//   D-100-10-G: Auto button removed from the floating action bar.
//   `webapp-auto-drawer.tsx` DELETED. `WebAppMode` + `WebAppDrawerMode`
//   types narrowed from `'chat' | 'teach' | 'auto'` to `'chat' | 'teach'`.
//   Backend P97 capability stays untouched — UI-only removal.
//
// Source-text invariants (D-NO-NEW-DEPS — no React Testing Library)
// matching the file's established precedent.
// ─────────────────────────────────────────────────────────────────

const FLOATING_SKILLS_BUTTON_PATH = resolve(
	__dirname,
	'webapp-floating-skills-button.tsx',
)
const AUTO_DRAWER_PATH = resolve(
	__dirname,
	'app-contents/webapp-auto-drawer.tsx',
)
const MODE_SELECTOR_PATH = resolve(__dirname, 'webapp-mode-selector.tsx')
const WINDOWS_CONTAINER_PATH = resolve(__dirname, 'windows-container.tsx')

describe('Phase 100-10-05 UI cleanup: skill outside + stream full-fit + remove Auto', () => {
	it('T-10-05-01: new file webapp-floating-skills-button.tsx exists and exports WebAppFloatingSkillsButton', () => {
		const src = safeRead(FLOATING_SKILLS_BUTTON_PATH)
		expect(src.length).toBeGreaterThan(0)
		expect(src).toMatch(/export function WebAppFloatingSkillsButton/)
	})

	it('T-10-05-02: webapp-floating-skills-button.tsx uses fixed positioning + windowX + windowWidth props (mirrors floating action bar pattern)', () => {
		const src = safeRead(FLOATING_SKILLS_BUTTON_PATH)
		expect(src).toMatch(/['"]fixed/)
		expect(src).toMatch(/windowX/)
		expect(src).toMatch(/windowWidth/)
	})

	it('T-10-05-03: webapp-stream-window.tsx no longer renders <WebAppSkillsPopover/> inline', () => {
		expect(SRC).not.toMatch(/<WebAppSkillsPopover\b/)
	})

	it('T-10-05-04: webapp-stream-window.tsx no longer imports WebAppSkillsPopover', () => {
		expect(SRC).not.toMatch(/from\s+['"]\.\/webapp-skills-popover['"]/)
	})

	it('T-10-05-05: webapp-stream-window.tsx contains no WebAppAutoDrawer reference (import + JSX gone)', () => {
		expect(SRC).not.toMatch(/WebAppAutoDrawer/)
	})

	it('T-10-05-06: webapp-auto-drawer.tsx file does NOT exist on disk', () => {
		// Use existsSync directly — safeRead returns empty string for both
		// missing files AND empty files; existsSync disambiguates.
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const {existsSync} = require('node:fs') as typeof import('node:fs')
		expect(existsSync(AUTO_DRAWER_PATH)).toBe(false)
	})

	it("T-10-05-07: webapp-drawer-store.ts WebAppDrawerMode type is 'chat' | 'teach' (no 'auto')", () => {
		const storeSrc = safeRead(STORE_PATH)
		expect(storeSrc).toMatch(/export type WebAppDrawerMode\s*=\s*['"]chat['"]\s*\|\s*['"]teach['"]/)
		// Also negative: the type def line must not include the 'auto' literal.
		// We grep the specific line shape to avoid false positives elsewhere.
		expect(storeSrc).not.toMatch(/export type WebAppDrawerMode[^;\n]*['"]auto['"]/)
	})

	it("T-10-05-08: webapp-mode-selector.tsx WebAppMode is 'chat' | 'teach' (no 'auto') and MODE_ORDER drops 'auto'", () => {
		const selectorSrc = safeRead(MODE_SELECTOR_PATH)
		expect(selectorSrc).toMatch(/export type WebAppMode\s*=\s*['"]chat['"]\s*\|\s*['"]teach['"]/)
		expect(selectorSrc).not.toMatch(/export type WebAppMode[^;\n]*['"]auto['"]/)
		// MODE_ORDER array must not include 'auto' literal.
		expect(selectorSrc).not.toMatch(/MODE_ORDER[^=]*=[^;\n]*['"]auto['"]/)
	})

	it("T-10-05-09: webapp-floating-action-bar.tsx MODES array does NOT contain id: 'auto'", () => {
		const barSrc = safeRead(FLOATING_BAR_PATH)
		expect(barSrc).not.toMatch(/id:\s*['"]auto['"]/)
	})

	it('T-10-05-10: webapp-stream-window.tsx noVNC canvas wrapper applies object-cover / object-fit: cover (D-100-10-F)', () => {
		// Locks the CSS-cover invariant per G-100-10-D default. Either the
		// Tailwind `object-cover` class OR a literal `object-fit: cover`
		// inline style satisfies the contract.
		expect(SRC).toMatch(/object-cover|object-fit:\s*['"]?cover/)
	})

	it('T-10-05-11: windows-container.tsx renders WebAppFloatingSkillsButton outside the WebApp window', () => {
		const containerSrc = safeRead(WINDOWS_CONTAINER_PATH)
		expect(containerSrc).toMatch(/WebAppFloatingSkillsButton/)
	})
})
