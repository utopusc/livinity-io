// Phase 203-10 Task 4 — window-content.tsx OpenUI dispatch invariants.
//
// Source-text invariants (the D-NO-NEW-DEPS precedent from
// use-launch-native-app.test.tsx) — verifies the OPENUI_ prefix branch
// lands BEFORE the legacy switch statement, that the OpenUiAppContent
// import resolves, and that the iframe component file exposes the
// expected /liv-ai-app/apps/ URL pattern (T-203-06 same-origin).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const WIN_PATH = resolve(__dirname, 'window-content.tsx')
const WIN_SRC = readFileSync(WIN_PATH, 'utf8')

const OPENUI_PATH = resolve(__dirname, 'app-contents', 'openui-app-content.tsx')
const OPENUI_SRC = readFileSync(OPENUI_PATH, 'utf8')

describe('window-content.tsx — Phase 203-10 OpenUI dispatch', () => {
	it('declares OPENUI_APP_ID_PREFIX = "OPENUI_"', () => {
		expect(WIN_SRC).toMatch(/const\s+OPENUI_APP_ID_PREFIX\s*=\s*['"]OPENUI_['"]/)
	})

	it('imports OpenUiAppContent via React.lazy', () => {
		expect(WIN_SRC).toMatch(/OpenUiAppContent\s*=\s*React\.lazy/)
		expect(WIN_SRC).toMatch(/openui-app-content/)
	})

	it('defines isOpenUiAppKind discriminator', () => {
		expect(WIN_SRC).toMatch(/function\s+isOpenUiAppKind/)
	})

	it('includes isOpenUiAppKind in the full-height app branch', () => {
		// The OPENUI iframe needs h-full, mirroring webapp/native branches.
		expect(WIN_SRC).toMatch(/isOpenUiAppKind\(appId\)/)
	})

	it('routes OPENUI_ appIds to OpenUiAppContent BEFORE the switch', () => {
		// The OPENUI branch MUST fire before the literal-appId switch (which
		// would default to "Unknown app"). Assert by position.
		const openuiBranchPos = WIN_SRC.indexOf('<OpenUiAppContent')
		const switchPos = WIN_SRC.indexOf('switch (appId)')
		expect(openuiBranchPos).toBeGreaterThan(0)
		expect(switchPos).toBeGreaterThan(0)
		expect(openuiBranchPos).toBeLessThan(switchPos)
	})
})

describe('openui-app-content.tsx — T-203-06 iframe trust chain', () => {
	it('renders a same-origin iframe pointed at /liv-ai-app/apps/<slug>', () => {
		expect(OPENUI_SRC).toMatch(/\/liv-ai-app\/apps\//)
		expect(OPENUI_SRC).toMatch(/<iframe/)
	})

	it('encodeURIComponents the slug to prevent path injection', () => {
		expect(OPENUI_SRC).toMatch(/encodeURIComponent\(slug\)/)
	})

	it('forwards the app name as the iframe title (a11y)', () => {
		expect(OPENUI_SRC).toMatch(/title=\{name\}/)
	})

	it('exports OpenUiAppContent as the default', () => {
		expect(OPENUI_SRC).toMatch(/export\s+default\s+function\s+OpenUiAppContent/)
	})
})
