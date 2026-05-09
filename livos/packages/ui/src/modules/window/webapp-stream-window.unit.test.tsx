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

	it('copyUrl uses navigator.clipboard.writeText with the webapp.url (D-95-15)', () => {
		expect(SRC).toMatch(/navigator\.clipboard\.writeText\(/)
	})

	it('fullscreen calls vnc.requestFullscreen (D-95-05)', () => {
		expect(SRC).toMatch(/vnc\.requestFullscreen\(\)/)
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

	it('disables the composer in non-chat modes (PLAN 95-07.C)', () => {
		expect(SRC).toMatch(/composerDisabled\s*=\s*mode\s*!==\s*['"]chat['"]/)
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
})

describe('WebAppStreamWindow — smoke import', () => {
	it('module exports a default React component', async () => {
		const mod = await import('./app-contents/webapp-stream-window')
		expect(typeof mod.default).toBe('function')
	})
})
