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

describe('connect deadline lifecycle — armed before the await, CLEARED on connected (CR-01/WR-01, IN-03)', () => {
	it('arms the deadline BEFORE the startEncodedScreen await (WR-01: a hung mutation is bounded)', () => {
		const src = read(HOOK)
		// setStatus('connecting') → deadline setTimeout → THEN the mutation await,
		// so the timer covers the entire connect (mutation + WS + first frame).
		expect(src).toMatch(
			/setStatus\('connecting'\)[\s\S]{0,600}deadlineTimerRef\.current = setTimeout[\s\S]{0,600}startEncodedScreen/,
		)
	})
	it('CLEARS the deadline the moment playback is confirmed (CR-01: healthy stream must not self-destruct at 15 s)', () => {
		const src = read(HOOK)
		// The onPlaying/connected block must disarm the shared timer before it
		// latches 'connected'; without this the deadline fires on the happy path
		// and demotes the working <video> to RFB. This pin would have caught CR-01.
		expect(src).toMatch(/clearTimeout\(deadlineTimerRef[\s\S]{0,160}setStatus\('connected'\)/)
	})
	it('clears the deadline in exactly one place besides teardown (the connected latch)', () => {
		const src = read(HOOK)
		// teardown() clears it (unmount/vmId-change) + onPlaying clears it (success)
		// = two clearTimeout(deadlineTimerRef sites; the success clear is the CR-01 fix.
		const clears = src.match(/clearTimeout\(deadlineTimerRef/g) ?? []
		expect(clears.length).toBe(2)
	})
})

describe('SourceBuffer live-window eviction — bounded memory + init never evicted (WR-02, IN-01)', () => {
	it('evicts decoded media behind the live window via sb.remove on a time range (WR-02)', () => {
		const src = read(HOOK)
		expect(src).toMatch(/\.remove\(\s*start\s*,\s*target\s*\)/)
		expect(src).toMatch(/KEEP_SECONDS/)
	})
	it('guards eviction on !sb.updating so it never removes-while-updating', () => {
		const src = read(HOOK)
		// The evict() helper bails while the buffer is updating (append/remove in
		// flight) — removing mid-update throws.
		expect(src).toMatch(/const evict = \(\)[\s\S]{0,200}sb\.updating/)
	})
	it('holds the init segment apart from the drop-oldest queue so a pre-sourceopen burst cannot evict it (IN-01)', () => {
		const src = read(HOOK)
		// Init is stored in its own ref (not enqueue()d into the byte-capped FIFO),
		// and pump() appends it first, exactly once, before any media chunk.
		expect(src).toMatch(/initSegmentRef\.current = data/)
		expect(src).toMatch(/initAppendedRef/)
		// The old drop-oldest loop only ever shifts MEDIA chunks now — the init
		// segment is no longer enqueued, so `enqueue(data)` for the init is gone.
		expect(src).not.toMatch(/enqueue\(data\)/)
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
