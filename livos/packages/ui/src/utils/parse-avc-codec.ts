// Phase 365-01 (VMENC-01, UI half) — pure avcC → codec-string derivation.
//
// DOM-FREE ON PURPOSE: this file imports no `window`/`MediaSource`/`document`.
// It is a plain data transform (fMP4 init-segment bytes → an `avc1.PPCCLL`
// codec string) so it can be tested BEHAVIORALLY (real bytes in, exact string
// out) — the one place in phase 365 where a source-regex test cannot catch a
// subtly-wrong hex derivation. The DOM-touching MSE lifecycle lives in
// use-vm-encoded-screen.ts and is covered by source-regex only (jsdom has no
// MediaSource to mock).
//
// WHY NOT HARDCODED: the 364 VAAPI encoder (`h264_vaapi -qp 23`, no explicit
// -profile/-level) emits a driver-default profile/level that this repo does not
// pin (varies by iGPU/driver). Hardcoding `avc1.640028` would either silently
// fail isTypeSupported on a mismatch or, worse, pass a coincidentally-valid
// string a stricter browser later rejects at appendBuffer time. Instead we read
// the REAL AVCDecoderConfigurationRecord bytes out of the received init segment
// and gate the result with MediaSource.isTypeSupported() before playback.

/**
 * AVCDecoderConfigurationRecord (ISO/IEC 14496-15) → an RFC-6381 `avc1.PPCCLL`
 * codec string, where PP/CC/LL are the profile_idc / constraint-flags /
 * level_idc bytes as 2 UPPERCASE zero-padded hex digits each. The `avc1.`
 * prefix stays lowercase.
 *
 * Takes the avcC PAYLOAD starting at `configurationVersion` (byte 0), so:
 *   byte 1 = AVCProfileIndication (profile_idc)
 *   byte 2 = profile_compatibility (constraint-set flags)
 *   byte 3 = AVCLevelIndication (level_idc)
 *
 * A record shorter than 4 bytes returns null — never throws, never reads OOB.
 */
export function codecFromAvcCRecord(avcC: Uint8Array): string | null {
	if (avcC.length < 4) return null
	const hex = (b: number) => b.toString(16).padStart(2, '0').toUpperCase()
	return `avc1.${hex(avcC[1])}${hex(avcC[2])}${hex(avcC[3])}`
}

// Container boxes on the avcC path whose payload is itself a run of child boxes.
const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl'])
// stsd: 4-byte version+flags, 4-byte entry_count, THEN the sample-entry boxes.
const STSD_HEADER = 8
// avc1 VisualSampleEntry header before its child boxes (6 reserved + 2
// data_ref_index + 16 predefined/reserved + 2+2 width/height + 4+4 resolutions
// + 4 reserved + 2 frame_count + 32 compressorname + 2 depth + 2 pre_defined).
const AVC1_HEADER = 78

/**
 * Walk the fMP4 box tree (moov → trak → mdia → minf → stbl → stsd → avc1 →
 * avcC) of an init segment and derive the codec string from the real avcC
 * bytes. Every box size/offset read is bounds-checked (`size >= 8` and
 * `offset + size <= end`); a malformed / truncated / avcC-missing input returns
 * null. The whole walk is wrapped in try/catch as defense-in-depth so a parse
 * miss falls back cleanly (→ the hook's fail() → the 355 RFB fallback) and
 * NEVER throws into the render tree.
 */
export function codecStringFromInitSegment(init: Uint8Array): string | null {
	try {
		const view = new DataView(init.buffer, init.byteOffset, init.byteLength)

		const walk = (start: number, end: number): string | null => {
			let o = start
			while (o + 8 <= end) {
				const size = view.getUint32(o)
				// Bounds guard: a box must fit within its parent's payload.
				if (size < 8 || o + size > end) return null
				const type = String.fromCharCode(init[o + 4], init[o + 5], init[o + 6], init[o + 7])

				if (type === 'avcC') {
					return codecFromAvcCRecord(init.subarray(o + 8, o + size))
				}

				const childStart = o + 8
				if (CONTAINER_BOXES.has(type)) {
					const found = walk(childStart, o + size)
					if (found) return found
				} else if (type === 'stsd') {
					const found = walk(childStart + STSD_HEADER, o + size)
					if (found) return found
				} else if (type === 'avc1') {
					const found = walk(childStart + AVC1_HEADER, o + size)
					if (found) return found
				}
				// Non-container / unrelated boxes (ftyp, mvhd, …) are skipped.

				o += size
			}
			return null
		}

		return walk(0, init.length)
	} catch {
		return null
	}
}
