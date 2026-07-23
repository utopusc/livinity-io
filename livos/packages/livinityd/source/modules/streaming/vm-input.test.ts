/**
 * Phase 367 (VMENC-03) — vm-input unit tests: the LOAD-BEARING validation.
 *
 * Fully offline, pure functions — no ws, no fakes. This is the Pitfall-3 guard: an
 * unvalidated number reaching vnc-rfb-client's writeUInt16BE/writeUInt32BE throws a
 * RangeError inside the daemon (no uncaughtException guard — 364 RESIDUAL-1), so EVERY
 * field of EVERY client frame must be structurally rejected here before any Buffer
 * write. Coverage:
 *   1. parseVmInput accepts the three wire shapes (pointer/key/wheel), string or Buffer
 *   2. parseVmInput returns null (NEVER throws) on every malformed/out-of-range input
 *   3. dy is normalized to ±1 (0 → null)
 *   4. VmInputRateLimiter — token bucket, burst grant, deny past burst, refill over time
 *   5. wire consts pinned (single source of truth for the server branch + 367-02 client)
 */

import {describe, expect, it} from 'vitest'

import {
	INPUT_BURST,
	INPUT_EVENTS_PER_SEC,
	MAX_INPUT_MSG_BYTES,
	MAX_INPUT_STRIKES,
	parseVmInput,
	VmInputRateLimiter,
} from './vm-input.js'

describe('parseVmInput — accepted wire shapes', () => {
	it('accepts a pointer frame {t:"p",x,y,b}', () => {
		expect(parseVmInput('{"t":"p","x":312,"y":480,"b":1}')).toEqual({t: 'p', x: 312, y: 480, b: 1})
	})

	it('accepts a key frame {t:"k",k,d}', () => {
		expect(parseVmInput('{"t":"k","k":65293,"d":1}')).toEqual({t: 'k', k: 65293, d: 1})
		expect(parseVmInput('{"t":"k","k":65293,"d":0}')).toEqual({t: 'k', k: 65293, d: 0})
	})

	it('accepts a wheel frame {t:"w",x,y,dy} — ABSENT b defaults to 0 (pre-WR-02 client compat)', () => {
		expect(parseVmInput('{"t":"w","x":312,"y":480,"dy":-1}')).toEqual({t: 'w', x: 312, y: 480, dy: -1, b: 0})
	})

	it('accepts an optional held-buttons mask b on wheel at the bounds 0 and 31 (WR-02)', () => {
		expect(parseVmInput('{"t":"w","x":1,"y":2,"dy":1,"b":0}')).toEqual({t: 'w', x: 1, y: 2, dy: 1, b: 0})
		expect(parseVmInput('{"t":"w","x":1,"y":2,"dy":1,"b":1}')).toEqual({t: 'w', x: 1, y: 2, dy: 1, b: 1})
		expect(parseVmInput('{"t":"w","x":1,"y":2,"dy":-1,"b":31}')).toEqual({t: 'w', x: 1, y: 2, dy: -1, b: 31})
	})

	it('accepts Buffer raw input (ws delivers Buffers regardless of binaryType)', () => {
		expect(parseVmInput(Buffer.from('{"t":"p","x":1,"y":2,"b":0}'))).toEqual({t: 'p', x: 1, y: 2, b: 0})
	})

	it('accepts b at the mask bounds 0 and 31', () => {
		expect(parseVmInput('{"t":"p","x":0,"y":0,"b":0}')).toEqual({t: 'p', x: 0, y: 0, b: 0})
		expect(parseVmInput('{"t":"p","x":0,"y":0,"b":31}')).toEqual({t: 'p', x: 0, y: 0, b: 31})
	})

	it('accepts k at the u32 bounds 1 and 0xFFFFFFFF', () => {
		expect(parseVmInput('{"t":"k","k":1,"d":0}')).toEqual({t: 'k', k: 1, d: 0})
		expect(parseVmInput(`{"t":"k","k":${0xff_ff_ff_ff},"d":1}`)).toEqual({t: 'k', k: 0xff_ff_ff_ff, d: 1})
	})

	it('accepts extra-large / negative INTEGER coords (clamping is sendVmInput’s job, not parse’s)', () => {
		expect(parseVmInput('{"t":"p","x":-100000,"y":999999,"b":0}')).toEqual({t: 'p', x: -100000, y: 999999, b: 0})
	})
})

describe('parseVmInput — every malformed input returns null (never throws)', () => {
	it('rejects raw input over MAX_INPUT_MSG_BYTES', () => {
		const fat = `{"t":"p","x":1,"y":2,"b":0,"pad":"${'a'.repeat(300)}"}`
		expect(Buffer.byteLength(fat)).toBeGreaterThan(MAX_INPUT_MSG_BYTES)
		expect(parseVmInput(fat)).toBeNull()
		expect(parseVmInput(Buffer.from(fat))).toBeNull()
	})

	it('rejects non-JSON garbage', () => {
		expect(parseVmInput('not json at all')).toBeNull()
		expect(parseVmInput('{"t":"p","x":')).toBeNull()
		expect(parseVmInput(Buffer.from([0xde, 0xad, 0xbe, 0xef]))).toBeNull()
	})

	it('rejects JSON non-objects, arrays, and null', () => {
		expect(parseVmInput('42')).toBeNull()
		expect(parseVmInput('"p"')).toBeNull()
		expect(parseVmInput('true')).toBeNull()
		expect(parseVmInput('null')).toBeNull()
		expect(parseVmInput('[{"t":"p","x":1,"y":2,"b":0}]')).toBeNull()
	})

	it('rejects an unknown t', () => {
		expect(parseVmInput('{"t":"z","x":1,"y":2,"b":0}')).toBeNull()
		expect(parseVmInput('{"t":"","x":1,"y":2}')).toBeNull()
		expect(parseVmInput('{"x":1,"y":2,"b":0}')).toBeNull() // missing t entirely
	})

	it('rejects non-integer x/y/b/k/d/dy (floats, strings, NaN, Infinity)', () => {
		expect(parseVmInput('{"t":"p","x":1.5,"y":2,"b":0}')).toBeNull()
		expect(parseVmInput('{"t":"p","x":1,"y":"2","b":0}')).toBeNull()
		expect(parseVmInput('{"t":"p","x":1,"y":2,"b":0.5}')).toBeNull()
		expect(parseVmInput('{"t":"p","x":null,"y":2,"b":0}')).toBeNull()
		// NaN / Infinity are not valid JSON literals — they arrive as strings or not at all,
		// but guard the object path anyway via a crafted JSON with numeric-ish strings.
		expect(parseVmInput('{"t":"k","k":"NaN","d":1}')).toBeNull()
		expect(parseVmInput('{"t":"k","k":"Infinity","d":1}')).toBeNull()
		expect(parseVmInput('{"t":"k","k":1e999,"d":1}')).toBeNull() // JSON.parse → Infinity
		expect(parseVmInput('{"t":"w","x":1,"y":2,"dy":0.5}')).toBeNull()
		expect(parseVmInput('{"t":"w","x":1,"y":2,"dy":"down"}')).toBeNull()
	})

	it('rejects b outside 0..31', () => {
		expect(parseVmInput('{"t":"p","x":1,"y":2,"b":-1}')).toBeNull()
		expect(parseVmInput('{"t":"p","x":1,"y":2,"b":32}')).toBeNull()
		expect(parseVmInput('{"t":"p","x":1,"y":2,"b":255}')).toBeNull()
	})

	it('rejects a PRESENT-but-invalid wheel b — same 0..31 integer bounds as the pointer path (WR-02)', () => {
		expect(parseVmInput('{"t":"w","x":1,"y":2,"dy":1,"b":32}')).toBeNull()
		expect(parseVmInput('{"t":"w","x":1,"y":2,"dy":1,"b":-1}')).toBeNull()
		expect(parseVmInput('{"t":"w","x":1,"y":2,"dy":1,"b":0.5}')).toBeNull()
		expect(parseVmInput('{"t":"w","x":1,"y":2,"dy":1,"b":"1"}')).toBeNull()
		expect(parseVmInput('{"t":"w","x":1,"y":2,"dy":1,"b":null}')).toBeNull()
	})

	it('rejects d outside {0,1}', () => {
		expect(parseVmInput('{"t":"k","k":65293,"d":2}')).toBeNull()
		expect(parseVmInput('{"t":"k","k":65293,"d":-1}')).toBeNull()
	})

	it('rejects k outside 1..0xFFFFFFFF (writeUInt32BE RangeError class)', () => {
		expect(parseVmInput('{"t":"k","k":0,"d":1}')).toBeNull()
		expect(parseVmInput('{"t":"k","k":-1,"d":1}')).toBeNull()
		expect(parseVmInput(`{"t":"k","k":${2 ** 33},"d":1}`)).toBeNull()
	})

	it('rejects missing fields per type', () => {
		expect(parseVmInput('{"t":"p","x":1,"y":2}')).toBeNull() // no b
		expect(parseVmInput('{"t":"p","x":1,"b":0}')).toBeNull() // no y
		expect(parseVmInput('{"t":"k","k":65293}')).toBeNull() // no d
		expect(parseVmInput('{"t":"k","d":1}')).toBeNull() // no k
		expect(parseVmInput('{"t":"w","x":1,"y":2}')).toBeNull() // no dy
	})
})

describe('parseVmInput — wheel dy normalization', () => {
	it('normalizes any integer dy to ±1 (Math.sign)', () => {
		expect(parseVmInput('{"t":"w","x":1,"y":2,"dy":-120}')).toEqual({t: 'w', x: 1, y: 2, dy: -1, b: 0})
		expect(parseVmInput('{"t":"w","x":1,"y":2,"dy":3}')).toEqual({t: 'w', x: 1, y: 2, dy: 1, b: 0})
	})

	it('rejects dy 0 (a no-direction wheel frame is meaningless)', () => {
		expect(parseVmInput('{"t":"w","x":1,"y":2,"dy":0}')).toBeNull()
	})
})

describe('VmInputRateLimiter — drop-not-queue token bucket', () => {
	it('grants the full burst immediately, denies past it at the same timestamp', () => {
		const limiter = new VmInputRateLimiter()
		const t0 = 1_000_000
		for (let i = 0; i < INPUT_BURST; i++) {
			expect(limiter.allow(t0)).toBe(true)
		}
		expect(limiter.allow(t0)).toBe(false) // the 801st at the same instant is DENIED
	})

	it('refills by elapsed × rate and grants again after time advances', () => {
		const limiter = new VmInputRateLimiter()
		const t0 = 1_000_000
		for (let i = 0; i < INPUT_BURST; i++) limiter.allow(t0)
		expect(limiter.allow(t0)).toBe(false)
		// One second later the bucket holds ratePerSec tokens again.
		expect(limiter.allow(t0 + 1000)).toBe(true)
		for (let i = 0; i < INPUT_EVENTS_PER_SEC - 1; i++) {
			expect(limiter.allow(t0 + 1000)).toBe(true)
		}
		expect(limiter.allow(t0 + 1000)).toBe(false) // exactly ratePerSec restored, not more
	})

	it('never refills above the burst ceiling', () => {
		const limiter = new VmInputRateLimiter()
		const t0 = 1_000_000
		limiter.allow(t0) // arm the clock
		// A huge idle gap must cap at burst, not accumulate unboundedly.
		let granted = 0
		for (let i = 0; i < INPUT_BURST * 3; i++) {
			if (limiter.allow(t0 + 3_600_000)) granted += 1
		}
		expect(granted).toBe(INPUT_BURST)
	})
})

describe('wire consts — single source of truth for the server branch and the 367-02 client', () => {
	it('pins the 367 input consts', () => {
		expect(MAX_INPUT_MSG_BYTES).toBe(256)
		expect(INPUT_EVENTS_PER_SEC).toBe(400)
		expect(INPUT_BURST).toBe(800)
		expect(MAX_INPUT_STRIKES).toBe(50)
	})
})
