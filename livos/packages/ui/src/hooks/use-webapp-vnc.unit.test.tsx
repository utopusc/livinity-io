// @vitest-environment jsdom
//
// Phase 95-04 — useWebAppVnc unit tests.
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS, established Phase 25/30/33/38/62/67 precedent — see
// livos/packages/ui/src/lib/use-liv-agent-stream.unit.test.tsx).
//
// Per that precedent (no RTL available), this file ships:
//   1. **Source-text invariants** that lock down the contract with noVNC
//      (scaleViewport=true, resizeSession NOT set, clipViewport=false,
//      cleanup on unmount, backoff ladder, and the Phase 303 clipboard bridge:
//      capture-phase paste interception, secure-context fallback ordering,
//      key-repeat suppression, focus-gated copy, unmount cleanup).
//   2. **Smoke import** of the hook module.
//
// The hook's return shape + runtime behaviour are asserted only through
// TypeScript (compile-time) and the source-text invariants; a live RTL/mocked-
// RFB integration test is intentionally NOT shipped (RTL is not a dependency
// here — D-NO-NEW-DEPS).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const HOOK_PATH = resolve(__dirname, 'use-webapp-vnc.ts')
const HOOK_SRC = readFileSync(HOOK_PATH, 'utf8')

describe('useWebAppVnc — source-text invariants', () => {
	it('sets rfb.scaleViewport = true (D-95-02)', () => {
		expect(HOOK_SRC).toMatch(/rfb\.scaleViewport\s*=\s*true/)
	})

	it('does NOT set rfb.resizeSession = true (D-95-02 — keep host x11vnc geometry stable)', () => {
		expect(HOOK_SRC).not.toMatch(/rfb\.resizeSession\s*=\s*true/)
	})

	it('sets rfb.clipViewport = false (full-fit scaling, no scrollbars)', () => {
		expect(HOOK_SRC).toMatch(/rfb\.clipViewport\s*=\s*false/)
	})

	it('imports noVNC RFB from @novnc/novnc/lib/rfb (G-1 / D-95-01 chosen path)', () => {
		expect(HOOK_SRC).toMatch(/['"]@novnc\/novnc\/lib\/rfb['"]/)
	})

	it('listens for the canonical noVNC events: connect, disconnect, securityfailure', () => {
		expect(HOOK_SRC).toMatch(/addEventListener\(\s*['"]connect['"]/)
		expect(HOOK_SRC).toMatch(/addEventListener\(\s*['"]disconnect['"]/)
		expect(HOOK_SRC).toMatch(/addEventListener\(\s*['"]securityfailure['"]/)
	})

	it('maps a credentialsrequired event to an honest error status (Phase 355, additive)', () => {
		// Previously unlistened → status stuck at 'connecting' forever. The
		// listener is generation-guarded like the other four and flips to 'error'.
		expect(HOOK_SRC).toMatch(/addEventListener\('credentialsrequired'/)
		expect(HOOK_SRC).toMatch(/credentialsrequired[\s\S]{0,400}setStatus\('error'\)/)
	})

	it('exposes a reconnect() that resets the backoff step', () => {
		expect(HOOK_SRC).toMatch(/backoffStepRef\.current\s*=\s*0/)
	})

	it('declares the 1s/2s/4s/8s reconnect backoff ladder (D-95-04 spec)', () => {
		// The literal array must contain 1000, 2000, 4000, 8000 — order matters.
		expect(HOOK_SRC).toMatch(/BACKOFF_LADDER_MS\s*=\s*\[\s*1000\s*,\s*2000\s*,\s*4000\s*,\s*8000\s*\]/)
	})

	it('disconnects RFB and cancels timers on cleanup (no leak)', () => {
		// teardownRfb is called from the unmount path.
		expect(HOOK_SRC).toMatch(/teardownRfb\(\)/)
		// And the reconnect timer is cleared.
		expect(HOOK_SRC).toMatch(/clearTimeout\(reconnectTimerRef\.current\)/)
	})

	it('exposes sendKey wired to rfb.sendKey (toolbar back/forward/refresh — D-95-14)', () => {
		expect(HOOK_SRC).toMatch(/inst\.sendKey\(\s*keysym\s*,\s*code\s*,\s*down\s*\)/)
	})

	it('requestFullscreen targets the container element (D-95-05 — browser-native)', () => {
		expect(HOOK_SRC).toMatch(/el\.requestFullscreen\(\)/)
	})

	it('uses ResizeObserver, not a setInterval poll, for autoresize (D-95-AUTORESIZE)', () => {
		expect(HOOK_SRC).toMatch(/new ResizeObserver/)
		// And we don't accidentally fall back to a polling timer.
		expect(HOOK_SRC).not.toMatch(/setInterval/)
	})
})

describe('useWebAppVnc — clipboard bridge (Phase 303)', () => {
	it('listens for the noVNC "clipboard" event (guest→host copy)', () => {
		expect(HOOK_SRC).toMatch(/addEventListener\(\s*['"]clipboard['"]/)
	})

	it('reads the guest copy from detail.text, NOT the (wrong) clipboardData field', () => {
		// noVNC dispatches CustomEvent('clipboard', {detail: {text}}). The
		// original plan assumed `event.clipboardData` — that field does not
		// exist on this event. Lock the correct accessor.
		expect(HOOK_SRC).toMatch(/\.detail\?\.text/)
		expect(HOOK_SRC).not.toMatch(/clipboardData/)
	})

	it('mirrors the guest copy into the local browser clipboard (writeText)', () => {
		expect(HOOK_SRC).toMatch(/navigator\.clipboard\?\.writeText/)
	})

	it('exposes pasteToGuest wired to rfb.clipboardPasteFrom (host→guest)', () => {
		expect(HOOK_SRC).toMatch(/inst\.clipboardPasteFrom\(text\)/)
		expect(HOOK_SRC).toMatch(/pasteToGuest,?\s*\n\s*\}/) // returned from the hook
	})

	it('intercepts paste in the CAPTURE phase so it beats noVNC\'s canvas handler', () => {
		// The third addEventListener arg MUST be `true` (capture) — noVNC's own
		// keydown handler is a bubble-phase listener on the child <canvas>, so
		// only a capture-phase listener on the parent runs first.
		expect(HOOK_SRC).toMatch(/addEventListener\(\s*['"]keydown['"]\s*,[^,]+,\s*true\s*\)/)
		expect(HOOK_SRC).toMatch(/removeEventListener\(\s*['"]keydown['"]\s*,[^,]+,\s*true\s*\)/)
	})

	it('gesture-gates the host clipboard read on the Ctrl/Cmd+V keydown', () => {
		// `navigator.clipboard.readText()` — `\s*` tolerates the fluent line wrap.
		expect(HOOK_SRC).toMatch(/navigator\.clipboard\s*\.readText\(\)/)
		expect(HOOK_SRC).toMatch(/e\.ctrlKey\s*\|\|\s*e\.metaKey/)
	})

	it('blocks noVNC from forwarding the raw paste key (preventDefault + stopPropagation)', () => {
		expect(HOOK_SRC).toMatch(/e\.preventDefault\(\)/)
		expect(HOOK_SRC).toMatch(/e\.stopPropagation\(\)/)
	})

	it('opts viewOnly streams out of the paste interception (read-only)', () => {
		// Gated live inside the handler with `!== false`, consistent with how
		// rfb.viewOnly is derived (so unspecified/true viewOnly never bridges).
		expect(HOOK_SRC).toMatch(/optionsRef\.current\?\.viewOnly\s*!==\s*false/)
	})

	it('checks clipboard availability BEFORE blocking the key (secure-context fallback)', () => {
		// If the host clipboard is unreadable we must NOT preventDefault — noVNC
		// then forwards the raw Ctrl+V so the guest pastes its own buffer. Assert
		// the availability guard appears before the preventDefault in source.
		const guardIdx = HOOK_SRC.indexOf('!navigator.clipboard?.readText) return')
		const preventIdx = HOOK_SRC.indexOf('e.preventDefault()')
		expect(guardIdx).toBeGreaterThan(-1)
		expect(preventIdx).toBeGreaterThan(-1)
		expect(guardIdx).toBeLessThan(preventIdx)
	})

	it('ignores OS key-repeat so a held Ctrl+V pastes exactly once', () => {
		expect(HOOK_SRC).toMatch(/if\s*\(\s*e\.repeat\s*\)\s*return/)
	})

	it('synthesizes ONE self-contained Ctrl+V (no physical-modifier assumption)', () => {
		// The old per-OS `if (useCtrl)` branch is gone; we always drive Ctrl_L
		// down→V→Ctrl_L up so the paste is correct regardless of which host
		// modifier was held or whether it was released during the async read.
		expect(HOOK_SRC).not.toMatch(/if\s*\(\s*useCtrl\s*\)/)
		expect(HOOK_SRC).toMatch(/sendKey\(KEYSYM_CONTROL_L, 'ControlLeft', true\)/)
		expect(HOOK_SRC).toMatch(/sendKey\(KEYSYM_CONTROL_L, 'ControlLeft', false\)/)
	})

	it('abandons an in-flight paste on unmount (cancelled flag + cleared settle timer)', () => {
		expect(HOOK_SRC).toMatch(/if\s*\(\s*cancelled[\s\S]*?return/)
		expect(HOOK_SRC).toMatch(/clearTimeout\(settleTimer\)/)
	})

	it('does not auto-write the guest copy into the host clipboard while unfocused', () => {
		expect(HOOK_SRC).toMatch(/document\.hasFocus\(\)/)
	})
})

describe('useWebAppVnc — module smoke', () => {
	it('imports without crashing and exports useWebAppVnc', async () => {
		const mod = await import('./use-webapp-vnc')
		expect(typeof mod.useWebAppVnc).toBe('function')
	})

	it('returns idle status when wsUrl is undefined (no RFB construction)', async () => {
		// We can't render the hook (no RTL), but the source-text invariant +
		// type signature documents the no-op path. Assert the literal early-
		// return guard is present.
		expect(HOOK_SRC).toMatch(/if\s*\(\s*!\s*wsUrl\s*\)\s*\{\s*\n[^}]*setStatus\(\s*['"]idle['"]/m)
	})
})
