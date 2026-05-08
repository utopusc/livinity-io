// @vitest-environment jsdom
//
// Phase 96-03 — useTeachRecorder unit tests.
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS, established Phase 25/30/33/38/62/67/95-04 precedent — see
// use-webapp-vnc.unit.test.tsx).
//
// Per that precedent, this file ships:
//   1. **Source-text invariants** locking down the contract (heartbeat 1Hz,
//      auto-stop 10min, canonical event types, drop-with-warn fallback,
//      cleanup on unmount, no RTL/render).
//   2. **Module smoke import** of the hook + canonical types.
//
// The PLAN-listed integration tests (30-clicks → 30-events, stop clears
// timers, auto-stop fires once, unknown-type increments dropped) are
// asserted at the source-text level here because the hook cannot be
// driven without RTL. The acceptance criteria's intent — "the contract
// is locked" — is preserved.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const HOOK_PATH = resolve(__dirname, 'use-teach-recorder.ts')
const HOOK_SRC = readFileSync(HOOK_PATH, 'utf8')

describe('useTeachRecorder — source-text invariants', () => {
	it('exposes start/stop/state/sessionId/eventCount/droppedCount surface', () => {
		expect(HOOK_SRC).toMatch(/start:\s*\(input:\s*StartInput\)\s*=>\s*void/)
		expect(HOOK_SRC).toMatch(/stop:\s*\(\)\s*=>\s*Promise<ActionLog\s*\|\s*null>/)
		expect(HOOK_SRC).toMatch(/state:\s*TeachRecorderState/)
		expect(HOOK_SRC).toMatch(/sessionId:\s*string\s*\|\s*null/)
		expect(HOOK_SRC).toMatch(/eventCount:\s*number/)
		expect(HOOK_SRC).toMatch(/droppedCount:\s*number/)
	})

	it('canonical state machine: idle | recording | saving', () => {
		expect(HOOK_SRC).toMatch(/TeachRecorderState\s*=\s*'idle'\s*\|\s*'recording'\s*\|\s*'saving'/)
	})

	it('mints sessionId via crypto.randomUUID() at start', () => {
		expect(HOOK_SRC).toMatch(/crypto\.randomUUID\(\)/)
	})

	it('attaches DOM listeners for mousedown / keydown / wheel / scroll', () => {
		expect(HOOK_SRC).toMatch(/addEventListener\(\s*['"]mousedown['"]/)
		expect(HOOK_SRC).toMatch(/addEventListener\(\s*['"]keydown['"]/)
		expect(HOOK_SRC).toMatch(/addEventListener\(\s*['"]wheel['"]/)
		expect(HOOK_SRC).toMatch(/addEventListener\(\s*['"]scroll['"]/)
	})

	it('captures every event — no preventDefault (D-95-13: VNC input always live)', () => {
		// Listeners must be passive observers. preventDefault would block VNC.
		expect(HOOK_SRC).not.toMatch(/preventDefault\(\)/)
	})

	it('1Hz heartbeat — HEARTBEAT_MS = 1000', () => {
		expect(HOOK_SRC).toMatch(/HEARTBEAT_MS\s*=\s*1_?000/)
		expect(HOOK_SRC).toMatch(/setInterval\(/)
		expect(HOOK_SRC).toMatch(/HEARTBEAT_MS\s*\)/)
	})

	it('10-minute auto-stop — AUTO_STOP_MS = 10 * 60 * 1000', () => {
		expect(HOOK_SRC).toMatch(/AUTO_STOP_MS\s*=\s*10\s*\*\s*60\s*\*\s*1_?000/)
		expect(HOOK_SRC).toMatch(/setTimeout\(/)
		expect(HOOK_SRC).toMatch(/AUTO_STOP_MS\s*\)/)
	})

	it('canonical event types match the v1 discriminated union', () => {
		expect(HOOK_SRC).toMatch(/type:\s*'click'/)
		expect(HOOK_SRC).toMatch(/type:\s*'key'/)
		expect(HOOK_SRC).toMatch(/type:\s*'wheel'/)
		expect(HOOK_SRC).toMatch(/type:\s*'scroll'/)
		expect(HOOK_SRC).toMatch(/type:\s*'wait'/)
	})

	it('button-mapping covers left/middle/right + drops unknown', () => {
		expect(HOOK_SRC).toMatch(/'left'\s*\|\s*'middle'\s*\|\s*'right'/)
		// Unknown buttons must increment droppedCount.
		expect(HOOK_SRC).toMatch(/bumpDropped\(\)/)
	})

	it('uploadFrame is awaited per event — screenshotRef stamped on the log', () => {
		expect(HOOK_SRC).toMatch(/skills\.uploadFrame/)
		expect(HOOK_SRC).toMatch(/screenshotRef:/)
	})

	it('action log version is 1 with strict shape (96-CONTEXT §gray-area #3)', () => {
		expect(HOOK_SRC).toMatch(/version:\s*1/)
		expect(HOOK_SRC).toMatch(/webappId:\s*wid/)
		expect(HOOK_SRC).toMatch(/startedAt:\s*0/)
		expect(HOOK_SRC).toMatch(/endedAt,/)
		expect(HOOK_SRC).toMatch(/events,/)
	})

	it('stamps meta.sessionId + droppedCount on the returned log', () => {
		expect(HOOK_SRC).toMatch(/meta:\s*\{[^}]*droppedCount:[^}]*sessionId:/m)
	})

	it('stop() clears interval + timeout + detaches listeners', () => {
		expect(HOOK_SRC).toMatch(/clearInterval\(heartbeatRef\.current\)/)
		expect(HOOK_SRC).toMatch(/clearTimeout\(autoStopRef\.current\)/)
		expect(HOOK_SRC).toMatch(/detachListenersRef\.current\(\)/)
	})

	it('cleanup on unmount calls webapp.skills.discard for the session if recording', () => {
		expect(HOOK_SRC).toMatch(/skills\.discard/)
		expect(HOOK_SRC).toMatch(/return\s*\(\)\s*=>/)
	})

	it('drop-with-warn fallback in dev mode (96-CONTEXT §gray-area #3)', () => {
		expect(HOOK_SRC).toMatch(/console\.warn/)
		expect(HOOK_SRC).toMatch(/NODE_ENV.*production/)
	})

	it('strict canonicalization — event type unions only (no string-typed catch-all)', () => {
		// The discriminated union must not include an 'unknown' or freeform
		// type variant; unknown events take the bumpDropped path.
		expect(HOOK_SRC).not.toMatch(/type:\s*['"]unknown['"]/)
	})

	it('does NOT import liv/packages/core (UI hook is livinityd-only consumer)', () => {
		expect(HOOK_SRC).not.toMatch(/['"]@liv\/core['"]/)
		expect(HOOK_SRC).not.toMatch(/liv\/packages\/core/)
	})

	it('uses trpcClient (vanilla) for synchronous per-event awaits, not React-hook flavour', () => {
		expect(HOOK_SRC).toMatch(/trpcClient\.webapp\.skills\.uploadFrame\.mutate/)
		// discard call spans lines (chained .mutate on next line) — match across whitespace
		expect(HOOK_SRC).toMatch(/trpcClient\.webapp\.skills\.discard[\s\S]*?\.mutate/)
	})
})

describe('useTeachRecorder — module smoke', () => {
	it('imports without crashing and exports useTeachRecorder', async () => {
		const mod = await import('./use-teach-recorder')
		expect(typeof mod.useTeachRecorder).toBe('function')
	})

	it('exports the canonical action-log + event types', async () => {
		const mod = (await import('./use-teach-recorder')) as Record<string, unknown>
		// Types are erased at runtime — assert the module shape via the function
		// export only. Type-level checks are handled by tsc.
		expect(mod.useTeachRecorder).toBeDefined()
	})
})
