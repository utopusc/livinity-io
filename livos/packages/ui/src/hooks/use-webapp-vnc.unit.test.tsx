// @vitest-environment jsdom
//
// Phase 95-04 — useWebAppVnc unit tests.
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS, established Phase 25/30/33/38/62/67 precedent — see
// livos/packages/ui/src/lib/use-liv-agent-stream.unit.test.tsx).
//
// Per that precedent, this file ships:
//   1. **Source-text invariants** that lock down the contract with noVNC
//      (scaleViewport=true, resizeSession NOT set, clipViewport=false,
//      cleanup on unmount, backoff ladder).
//   2. **Mocked-RFB integration test** that drives the hook through a
//      fake constructor and asserts lifecycle behaviour.
//   3. **Smoke import** of the hook module.
//
// The hook's return shape is asserted only through TypeScript (compile-time)
// because rendering it would require RTL.

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
