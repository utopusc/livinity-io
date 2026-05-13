// @vitest-environment jsdom
//
// Phase 108-01 Task 2 — AppStoreWindowContent source-text invariants
// (D-108-NO-API-KEY-FOR-LOCAL + D-108-PLATFORM-OPT-IN-PRESERVED).
//
// We assert on raw source text — same pattern as webapp-teach-popup-host.test.tsx
// (@testing-library/react is NOT installed; D-NO-NEW-DEPS). These assertions
// gate the Phase 108 behavioural contract:
//   1. The local-mode Navigate redirect to /app-store is present.
//   2. The legacy gate component / prompt copy are gone.
//   3. The platform-mode iframe path (livinity.io/store + useAppStoreBridge)
//      is preserved — opt-in mode regression-free.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const COMPONENT_PATH = resolve(__dirname, 'app-store-content.tsx')
const COMPONENT_SRC = readFileSync(COMPONENT_PATH, 'utf8')

describe('AppStoreWindowContent — Phase 108 source-text invariants', () => {
	it('imports Navigate from react-router-dom (local-mode redirect)', () => {
		expect(COMPONENT_SRC).toMatch(/import\s*\{[^}]*\bNavigate\b[^}]*\}\s*from\s*['"]react-router-dom['"]/)
	})

	it('renders <Navigate to="/app-store" /> for local-mode default (D-108-NO-API-KEY-FOR-LOCAL)', () => {
		// Accept either quoting style for the path.
		expect(COMPONENT_SRC).toMatch(/<Navigate\s+to=['"]\/app-store['"]/)
	})

	it('does NOT contain NoApiKeyMessage (legacy gate fully removed)', () => {
		expect(COMPONENT_SRC).not.toMatch(/NoApiKeyMessage/)
	})

	it('does NOT contain the legacy "Connect to Livinity Platform" prompt copy', () => {
		expect(COMPONENT_SRC).not.toMatch(/Connect to Livinity Platform/)
	})

	it('preserves the platform-mode iframe URL (D-108-PLATFORM-OPT-IN-PRESERVED)', () => {
		expect(COMPONENT_SRC).toMatch(/https:\/\/livinity\.io\/store/)
	})

	it('preserves useAppStoreBridge wiring for platform mode', () => {
		expect(COMPONENT_SRC).toMatch(/useAppStoreBridge/)
	})
})
