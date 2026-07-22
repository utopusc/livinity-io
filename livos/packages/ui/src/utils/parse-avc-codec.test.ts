// Phase 365-01 (VMENC-01, UI half) — behavioral suite for the pure avcC→codec
// derivation. This is the ONE place in phase 365 where real behavioral testing
// matters (not source-regex): a subtly-wrong hex digit means MediaSource picks
// the wrong codec string → isTypeSupported false / a silent no-playback, the
// exact class of bug a structural pin cannot catch. So we feed REAL fMP4 box
// bytes and assert exact strings + exact nulls (no throw, no OOB read).

import {describe, expect, it} from 'vitest'

import {codecFromAvcCRecord, codecStringFromInitSegment} from './parse-avc-codec'

/** Build one fMP4 box: [size(4 BE)][type(4 ascii)][payload]. size includes the
 *  8-byte header — mirrors the repo's own Fmp4Fanout box layout. */
function box(type: string, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
	const size = 8 + payload.length
	const out = new Uint8Array(size)
	const dv = new DataView(out.buffer)
	dv.setUint32(0, size)
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
	out.set(payload, 8)
	return out
}

function concat(...arrs: Uint8Array[]): Uint8Array {
	const total = arrs.reduce((n, a) => n + a.length, 0)
	const out = new Uint8Array(total)
	let o = 0
	for (const a of arrs) {
		out.set(a, o)
		o += a.length
	}
	return out
}

/** Build a minimal init segment nesting a single avcC with the given
 *  [version, profile, constraint, level] record bytes. */
function initSegmentWithAvcC(record: number[]): Uint8Array {
	const avcC = box('avcC', new Uint8Array(record))
	const avc1 = box('avc1', concat(new Uint8Array(78), avcC)) // 78-byte VisualSampleEntry header
	const stsd = box('stsd', concat(new Uint8Array(8), avc1)) // 8-byte version+flags+entry_count
	const stbl = box('stbl', stsd)
	const minf = box('minf', stbl)
	const mdia = box('mdia', minf)
	const trak = box('trak', mdia)
	const moov = box('moov', trak)
	const ftyp = box('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d])) // 'isom'
	return concat(ftyp, moov)
}

describe('codecFromAvcCRecord — exact uppercase, zero-padded hex from profile/constraint/level bytes', () => {
	it('High@4.0 [0x01,0x64,0x00,0x28] → avc1.640028', () => {
		expect(codecFromAvcCRecord(new Uint8Array([0x01, 0x64, 0x00, 0x28]))).toBe('avc1.640028')
	})
	it('uppercases hex letters [0x01,0x4D,0x40,0x1E] → avc1.4D401E', () => {
		expect(codecFromAvcCRecord(new Uint8Array([0x01, 0x4d, 0x40, 0x1e]))).toBe('avc1.4D401E')
	})
	it('zero-pads single-hex-digit bytes [0x01,0x08,0x00,0x0A] → avc1.08000A', () => {
		expect(codecFromAvcCRecord(new Uint8Array([0x01, 0x08, 0x00, 0x0a]))).toBe('avc1.08000A')
	})
	it('keeps the avc1 prefix lowercase, only the hex triplet uppercase', () => {
		const s = codecFromAvcCRecord(new Uint8Array([0x01, 0x4d, 0x40, 0x1e]))
		expect(s).toMatch(/^avc1\./)
		expect(s).not.toMatch(/^AVC1/)
	})
	it('too-short record (len < 4) → null, never throws / never reads OOB', () => {
		expect(codecFromAvcCRecord(new Uint8Array([0x01, 0x64]))).toBeNull()
		expect(codecFromAvcCRecord(new Uint8Array([]))).toBeNull()
	})
})

describe('codecStringFromInitSegment — bounds-checked box walk moov→…→avcC', () => {
	it('walks a real minimal init segment to the exact codec string', () => {
		expect(codecStringFromInitSegment(initSegmentWithAvcC([0x01, 0x64, 0x00, 0x28]))).toBe('avc1.640028')
	})
	it('derives Main@3.0-style letters through the full nesting', () => {
		expect(codecStringFromInitSegment(initSegmentWithAvcC([0x01, 0x4d, 0x40, 0x1e]))).toBe('avc1.4D401E')
	})
	it('no avcC present (just an ftyp) → null', () => {
		const ftyp = box('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d]))
		expect(codecStringFromInitSegment(ftyp)).toBeNull()
	})
	it('a box whose declared size runs past the buffer → null (no OOB read)', () => {
		const bad = new Uint8Array(16)
		const dv = new DataView(bad.buffer)
		dv.setUint32(0, 0xffff) // declared size far beyond the 16-byte buffer
		for (let i = 0; i < 4; i++) bad[4 + i] = 'moov'.charCodeAt(i)
		expect(codecStringFromInitSegment(bad)).toBeNull()
	})
	it('empty / garbage input → null, never throws', () => {
		expect(codecStringFromInitSegment(new Uint8Array(0))).toBeNull()
		expect(codecStringFromInitSegment(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull()
	})
})
