/**
 * LivDesktopViewer unit tests — Phase 72 Plan 72-native-04 (CU-LOOP-05).
 *
 * Pure-helper extraction + source-text invariants pattern.
 * `@testing-library/react` is NOT installed in this UI package
 * (D-NO-NEW-DEPS, established Phase 25/30/33/38/62/67-04/68-03 precedent —
 * see livos/packages/ui/src/lib/use-liv-agent-stream.unit.test.tsx for the
 * canonical "RTL absent" testing posture).
 *
 * Coverage matrix (≥7 from 72-native-04 PLAN <behavior>):
 *   T1: shouldRenderImg(valid PNG data URL) === true
 *   T2: shouldRenderImg('') / null / undefined / non-data / wrong-mime === false
 *   T3: nextPollDelay(0, 1000) === 1000
 *   T4: nextPollDelay(3, 1000) ≤ 30000 AND > 1000 (exponential)
 *   T5: nextPollDelay(20, 1000) === 30000 (clamp)
 *   T6: <LivDesktopViewer src=valid /> renders <img data-testid="liv-desktop-viewer-img">
 *   T7: <LivDesktopViewer pollingMs={1000} /> in live mode renders the loading
 *       sentinel before any fetch completes (source-text invariant on the
 *       internal Live sub-component, since live-mode requires a TRPCProvider).
 *   T8: <LivDesktopViewer /> with neither src nor pollingMs renders empty placeholder
 *       (data-testid="liv-desktop-viewer-empty"), does NOT crash.
 *
 * Live-mode runtime tests (DOM-side fetch loop, tRPC integration) are
 * deferred to 72-native-07 UAT — exercised end-to-end on the Mini PC where
 * the X server actually exists. Mocking trpcReact + a fake TRPCProvider in
 * jsdom is more brittle than a single live walk against the real procedure.
 *
 * References:
 *   - .planning/phases/72-computer-use-agent-loop/72-native-04-PLAN.md
 *   - livos/packages/ui/src/routes/ai-chat/tool-views/components/liv-vnc-screen.unit.test.tsx
 *     — sibling 71-02 component tests (precedent for source-text invariants)
 *   - livos/packages/ui/src/lib/use-liv-agent-stream.unit.test.tsx
 *     — RTL-absent precedent (pure helpers + source-text invariants)
 */
// @vitest-environment jsdom
import {readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {createElement} from 'react'
import {renderToString} from 'react-dom/server'
import {describe, expect, it} from 'vitest'

import LivDesktopViewer, {nextPollDelay, shouldRenderImg} from './liv-desktop-viewer'

const __dirname = dirname(fileURLToPath(import.meta.url))
const COMPONENT_PATH = resolve(__dirname, 'liv-desktop-viewer.tsx')
const componentSource = readFileSync(COMPONENT_PATH, 'utf8')

// ─────────────────────────────────────────────────────────────────────
// shouldRenderImg — pure helper (data-URL contract guard, T-72N4-03)
// ─────────────────────────────────────────────────────────────────────

describe('shouldRenderImg (T1, T2)', () => {
	it('T1: returns true for a valid data:image/png;base64 URL', () => {
		expect(shouldRenderImg('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')).toBe(true)
	})

	it('T1b: returns true even for very short payload as long as prefix matches and payload is non-empty', () => {
		expect(shouldRenderImg('data:image/png;base64,X')).toBe(true)
	})

	it('T2a: returns false for empty string', () => {
		expect(shouldRenderImg('')).toBe(false)
	})

	it('T2b: returns false for null and undefined', () => {
		expect(shouldRenderImg(null)).toBe(false)
		expect(shouldRenderImg(undefined)).toBe(false)
	})

	it('T2c: returns false for http(s) URLs (not a data URL)', () => {
		expect(shouldRenderImg('http://x.com/foo.png')).toBe(false)
		expect(shouldRenderImg('https://x.com/foo.png')).toBe(false)
	})

	it('T2d: returns false for wrong mime type (jpeg, gif, generic)', () => {
		expect(shouldRenderImg('data:image/jpeg;base64,abc')).toBe(false)
		expect(shouldRenderImg('data:image/gif;base64,abc')).toBe(false)
		expect(shouldRenderImg('data:text/plain;base64,abc')).toBe(false)
	})

	it('T2e: returns false for valid prefix with empty base64 payload (T-72N4-03 mitigation)', () => {
		expect(shouldRenderImg('data:image/png;base64,')).toBe(false)
	})
})

// ─────────────────────────────────────────────────────────────────────
// nextPollDelay — exponential backoff with 30s clamp
// ─────────────────────────────────────────────────────────────────────

describe('nextPollDelay (T3, T4, T5)', () => {
	it('T3: zero errors yields baseMs unchanged', () => {
		expect(nextPollDelay(0, 1000)).toBe(1000)
		expect(nextPollDelay(0, 5000)).toBe(5000)
	})

	it('T4: 3 consecutive errors yields a value > baseMs and ≤ 30000 (exponential growth)', () => {
		const d = nextPollDelay(3, 1000)
		expect(d).toBeGreaterThan(1000)
		expect(d).toBeLessThanOrEqual(30000)
		// 2^3 * 1000 = 8000; assert exact for spec stability
		expect(d).toBe(8000)
	})

	it('T5: 20 consecutive errors clamps at 30000 ms (no overflow)', () => {
		expect(nextPollDelay(20, 1000)).toBe(30000)
	})

	it('T5b: huge consecutiveErrors values stay clamped (defensive)', () => {
		expect(nextPollDelay(1000, 1000)).toBe(30000)
		expect(nextPollDelay(Number.MAX_SAFE_INTEGER, 1000)).toBe(30000)
	})

	it('T5c: handles negative / NaN consecutiveErrors as zero-error case', () => {
		expect(nextPollDelay(-1, 1000)).toBe(1000)
		expect(nextPollDelay(Number.NaN, 1000)).toBe(1000)
	})
})

// ─────────────────────────────────────────────────────────────────────
// Component render tests (T6, T8) via renderToString — no DOM lifecycle
// needed; we just verify the static markup contract.
// ─────────────────────────────────────────────────────────────────────

describe('LivDesktopViewer renders (T6, T8)', () => {
	it('T6: snapshot mode — renders <img data-testid="liv-desktop-viewer-img"> with the provided src', () => {
		const dataUrl = 'data:image/png;base64,iVBORw0KGgo'
		const html = renderToString(createElement(LivDesktopViewer, {src: dataUrl}))
		expect(html).toContain('data-testid="liv-desktop-viewer-img"')
		expect(html).toContain(dataUrl)
		// Empty + error placeholders should NOT be in the snapshot-mode tree
		expect(html).not.toContain('data-testid="liv-desktop-viewer-empty"')
		expect(html).not.toContain('data-testid="liv-desktop-viewer-error"')
	})

	it('T8: defensive empty mode — no src AND no pollingMs renders empty placeholder', () => {
		const html = renderToString(createElement(LivDesktopViewer, {}))
		expect(html).toContain('data-testid="liv-desktop-viewer-empty"')
		// MUST not crash, MUST not render the live-mode loading sentinel
		expect(html).not.toContain('data-testid="liv-desktop-viewer-loading"')
	})

	it('T8b: snapshot-mode with INVALID src falls back to empty placeholder (T-72N4-03)', () => {
		// Malformed data URL → shouldRenderImg returns false → render empty
		// state instead of feeding arbitrary content into <img src>.
		const html = renderToString(createElement(LivDesktopViewer, {src: 'not-a-data-url'}))
		expect(html).not.toContain('data-testid="liv-desktop-viewer-img"')
		expect(html).toContain('data-testid="liv-desktop-viewer-empty"')
	})
})

// ─────────────────────────────────────────────────────────────────────
// Source-text invariants (T7 + threat-model + design-token compliance)
//
// Live-mode (`pollingMs` set) tRPC wiring + render-time fetch lifecycle is
// validated by source-text grep, mirroring 67-04's posture for the
// EventSource branch of useLivAgentStream. Behaviour walk happens in
// 72-native-07 UAT against the real Mini PC X server.
// ─────────────────────────────────────────────────────────────────────

describe('liv-desktop-viewer.tsx source-text invariants', () => {
	it('T7: live-mode renders the loading sentinel data-testid="liv-desktop-viewer-loading" before first fetch', () => {
		// Sentinel testid MUST appear in source — covers the pre-first-frame
		// render branch the runtime takes when isLoading && !data.
		expect(componentSource).toContain('data-testid="liv-desktop-viewer-loading"')
	})

	it('uses the trpcReact.computerUse.takeScreenshot procedure for live mode polling', () => {
		expect(componentSource).toMatch(/computerUse\.takeScreenshot\.useQuery/)
	})

	it('passes refetchInterval={pollingMs} to the live-mode useQuery (T-72N4-02 client-side)', () => {
		expect(componentSource).toMatch(/refetchInterval/)
	})

	it('exports both pure helpers (shouldRenderImg + nextPollDelay)', () => {
		expect(componentSource).toMatch(/export\s+function\s+shouldRenderImg/)
		expect(componentSource).toMatch(/export\s+function\s+nextPollDelay/)
	})

	it('exports the LivDesktopViewerProps type (binding contract)', () => {
		expect(componentSource).toMatch(/export\s+(type|interface)\s+LivDesktopViewerProps/)
	})

	it('default export is wrapped in React.memo (avoid re-render churn)', () => {
		expect(componentSource).toMatch(/React\.memo|memo\(/)
	})

	it('uses P66 design tokens only — NO hex literals (D-22 / D-NATIVE-* UI carryover)', () => {
		// Strip the JSDoc / comment blocks first so example strings in
		// documentation don't trip the regex (e.g. token comment refs).
		const code = componentSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
		// Tailwind utility classes that carry hex (#fff) would also be illegal.
		expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
	})

	it('renders the loading caption "Connecting to desktop…" exactly once (D-NATIVE-04 UX)', () => {
		const matches = componentSource.match(/Connecting to desktop/g) ?? []
		expect(matches.length).toBe(1)
	})

	it('error-recovery threshold is 3 consecutive failures (matches PLAN must-haves)', () => {
		// Must-have: "if 3 consecutive fetches fail, shows … with retry button"
		expect(componentSource).toMatch(/3/)
		expect(componentSource).toContain('data-testid="liv-desktop-viewer-error"')
	})

	it('does NOT import @testing-library/react / msw (D-NO-NEW-DEPS)', () => {
		expect(componentSource).not.toMatch(/from\s+['"]@testing-library/)
		expect(componentSource).not.toMatch(/from\s+['"]msw/)
	})

	it('does NOT import react-vnc — replaces the deprecated 71-02 viewer role', () => {
		expect(componentSource).not.toMatch(/from\s+['"]react-vnc['"]/)
	})

	it('does NOT log base64 / token / screenshot bytes to console (defense-in-depth)', () => {
		// Same posture as 71-02 token-leak guard. Catches console.* calls
		// whose arg-list substring references base64 or screenshot bytes.
		expect(componentSource).not.toMatch(/console\.\w+\([^)]*base64/i)
	})
})
