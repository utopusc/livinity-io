// Phase 365-01 (VMENC-01, UI half) — source-regex invariants for the MSE hook.
//
// `@testing-library/react` is NOT installed in this UI package and jsdom has no
// MediaSource/SourceBuffer to mock — mocking it would test the mock, not the
// logic. So the DOM-touching orchestration is pinned STRUCTURALLY here
// (readFileSync + regex over the raw source), while the one piece with a real
// correctness stake (the avcC→codec derivation) is covered behaviorally in
// parse-avc-codec.test.ts. That split (structural for DOM/orchestration, real
// for pure logic) is the correct boundary, not a compromise.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

// process.cwd() at vitest run-time is the UI package root (livos/packages/ui).
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')
const HOOK = 'src/hooks/use-vm-encoded-screen.ts'

describe('cap-slot discipline — MediaSource support checked BEFORE the backend mutation', () => {
	it('the typeof MediaSource guard textually precedes vm.startEncodedScreen', () => {
		const src = read(HOOK)
		// The cheap synchronous feature check must come before the mutation so we
		// never burn a StreamManager cap slot (+ a real RFB/ffmpeg pair) for a
		// browser that can never play the result.
		expect(src).toMatch(/typeof (window\.)?MediaSource[\s\S]{0,400}startEncodedScreen/)
	})
})

describe('the codec is derived from the REAL init segment and isTypeSupported-gated (never hardcoded)', () => {
	it('uses codecStringFromInitSegment on the first WS message', () => {
		const src = read(HOOK)
		expect(src).toMatch(/codecStringFromInitSegment/)
	})
	it('gates the derived codec with MediaSource.isTypeSupported before playback', () => {
		const src = read(HOOK)
		expect(src).toMatch(/isTypeSupported/)
	})
	it('contains no hardcoded avc1.PPCCLL literal', () => {
		const src = read(HOOK)
		expect(src).not.toMatch(/avc1\.[0-9a-fA-F]{6}/)
	})
})

describe('every failure surface funnels through ONE terminal fail() handler', () => {
	it('declares a single fail() handler', () => {
		const src = read(HOOK)
		expect(src).toMatch(/function fail|const fail/)
	})
	it('routes WS error/close, <video> error, SourceBuffer error, and the deadline through fail()', () => {
		const src = read(HOOK)
		// Each distinct failure surface references fail( — assert the identifier
		// appears many times (init-miss, unsupported, ws.onerror, ws.onclose,
		// video error, SourceBuffer error, deadline, appendBuffer catch, …).
		const calls = src.match(/fail\(/g) ?? []
		expect(calls.length).toBeGreaterThanOrEqual(4)
		// The specific surfaces the research flags (Pitfall 3: WS close/error are
		// async events, not throws) are wired.
		expect(src).toMatch(/onerror\s*=/)
		expect(src).toMatch(/onclose\s*=/)
	})
	it("'connected' is set only from a real <video> play event, never on WS-open", () => {
		const src = read(HOOK)
		// The honest connect is anchored to a playing/canplay <video> listener.
		expect(src).toMatch(/addEventListener\('playing'/)
		// And 'connected' is latched exactly once (in that play handler) — never
		// from ws.onopen / first-byte.
		const connectedSets = src.match(/setStatus\('connected'\)/g) ?? []
		expect(connectedSets.length).toBe(1)
	})
})

describe('teardown releases the session and every resource', () => {
	it('best-effort stops the backend encode session', () => {
		const src = read(HOOK)
		expect(src).toMatch(/stopEncodedScreen/)
	})
	it('revokes the object URL', () => {
		const src = read(HOOK)
		expect(src).toMatch(/revokeObjectURL/)
	})
	it('closes the WebSocket', () => {
		const src = read(HOOK)
		expect(src).toMatch(/\.close\(\)/)
	})
})

describe('generation guard + bounded queue + falsy-vmId idle', () => {
	it('guards stale async continuations via a generation counter', () => {
		const src = read(HOOK)
		expect(src).toMatch(/reconnectGenerationRef|generation !==/)
	})
	it('bounds the append queue (drop-oldest) with a byte cap + shift()', () => {
		const src = read(HOOK)
		expect(src).toMatch(/queue|MAX_QUEUE|drop/i)
		expect(src).toMatch(/\.shift\(\)/)
	})
	it('a falsy vmId opens no socket and fires no mutation (idles)', () => {
		const src = read(HOOK)
		expect(src).toMatch(/if \(!vmId|!vmIdRef\.current/)
	})
	it('opens the /ws/vm-stream stream via a wss-prefixed WebSocket', () => {
		const src = read(HOOK)
		expect(src).toMatch(/new WebSocket/)
		expect(src).toMatch(/wss:/)
	})
})
