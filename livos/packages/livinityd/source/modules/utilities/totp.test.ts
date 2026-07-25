/**
 * Phase 368.7 — TOTP forensics + PAD-01 regression.
 *
 * Two external testers reported that no authenticator code was ever accepted
 * during first-run setup. Before changing any product behaviour we had to know
 * whether our TOTP was actually wrong, so this file cross-checks the production
 * implementation against a from-scratch RFC 4648 / RFC 6238 implementation that
 * shares NO code with it — the same computation Google Authenticator, 1Password
 * and Aegis perform. Verifying our code against itself would have proved nothing.
 *
 * Verdict (tests A–F): the crypto, the secret, the QR payload and the URI are all
 * correct, and the accepted window is exactly −300s…+300s. The setup blocker was a
 * client-side state-machine regression, not TOTP. See 368.7-CONTEXT.md.
 *
 * Test G pins PAD-01, the one genuine defect this investigation did find.
 */
import crypto from 'node:crypto'
import {URL} from 'node:url'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {generateUri, verify, generateToken} from './totp.js'

// ─────────────────────────────────────────────────────────────────────────────
// INDEPENDENT reference implementation (node:crypto only). Deliberately shares
// nothing with source/modules/utilities/totp.ts.
// ─────────────────────────────────────────────────────────────────────────────

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** RFC 4648 base32 decode, padding-tolerant. Independent of `thirty-two`. */
function refBase32Decode(input: string): Buffer {
	const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '')
	let bits = 0
	let value = 0
	const out: number[] = []
	for (const char of clean) {
		const index = B32_ALPHABET.indexOf(char)
		if (index === -1) throw new Error(`ref base32: bad char ${char}`)
		value = (value << 5) | index
		bits += 5
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 0xff)
			bits -= 8
		}
	}
	return Buffer.from(out)
}

/** RFC 4648 base32 encode. Independent of `thirty-two`. */
function refBase32Encode(buffer: Buffer): string {
	let bits = 0
	let value = 0
	let out = ''
	for (const byte of buffer) {
		value = (value << 8) | byte
		bits += 8
		while (bits >= 5) {
			out += B32_ALPHABET[(value >>> (bits - 5)) & 0x1f]
			bits -= 5
		}
	}
	if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 0x1f]
	return out
}

/** The 31-bit dynamic-truncation value behind an RFC 6238 code. */
function refTruncated(secret: Buffer, counter: number): number {
	const counterBuffer = Buffer.alloc(8)
	counterBuffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
	counterBuffer.writeUInt32BE(counter >>> 0, 4)
	const hmac = crypto.createHmac('sha1', secret).update(counterBuffer).digest()
	const offset = hmac[hmac.length - 1]! & 0x0f
	return (
		((hmac[offset]! & 0x7f) << 24) |
		((hmac[offset + 1]! & 0xff) << 16) |
		((hmac[offset + 2]! & 0xff) << 8) |
		(hmac[offset + 3]! & 0xff)
	)
}

/** RFC 6238 TOTP, HMAC-SHA1, 6 digits, ZERO-PADDED (what every real app shows). */
function refTotp(secret: Buffer, atMs: number, period = 30, digits = 6): string {
	const counter = Math.floor(atMs / 1000 / period)
	return String(refTruncated(secret, counter) % 10 ** digits).padStart(digits, '0')
}

function secretFromUri(uri: string): string {
	return new URL(uri).searchParams.get('secret')!
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TOTP — independent cross-check of the production implementation', () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	test('A. our base32 round-trips through an independent RFC 4648 decoder', () => {
		for (let i = 0; i < 200; i++) {
			const uri = generateUri('Livinity', 'livinity.local')
			const b32 = secretFromUri(uri)
			const decoded = refBase32Decode(b32)
			expect(b32).toMatch(/^[A-Z2-7]+$/)
			expect(b32.length).toBe(52)
			expect(decoded.length).toBe(32)
			expect(refBase32Encode(decoded)).toBe(b32)
		}
	})

	test('B. a code from the INDEPENDENT implementation is accepted by verify()', () => {
		const uri = generateUri('Livinity', 'livinity.local')
		const secret = refBase32Decode(secretFromUri(uri))
		const code = refTotp(secret, Date.now())
		expect(code).toMatch(/^\d{6}$/)
		expect(verify(uri, code)).toBe(true)
	})

	test('C. our generateToken() agrees with the independent implementation', () => {
		const mismatches: Array<{ours: string; ref: string}> = []
		for (let i = 0; i < 300; i++) {
			const uri = generateUri('Livinity', 'livinity.local')
			const secret = refBase32Decode(secretFromUri(uri))
			const ours = String(generateToken(uri))
			const ref = refTotp(secret, Date.now())
			if (ours !== ref) mismatches.push({ours, ref})
		}
		expect(mismatches).toEqual([])
	})

	test('D. the accepted window is ±300s around the SERVER clock', () => {
		const uri = generateUri('Livinity', 'livinity.local')
		const secret = refBase32Decode(secretFromUri(uri))
		const now = Date.now()

		// A code minted 6 minutes out — the drift a VM guest without time sync
		// reaches easily — must NOT be accepted; the fix for that is to tell the
		// user their clock is wrong (SKEW-01), never to widen this window.
		expect(verify(uri, refTotp(secret, now + 360_000))).toBe(false)
		expect(verify(uri, refTotp(secret, now - 360_000))).toBe(false)

		let maxPositive = 0
		for (let s = 0; s <= 900; s += 30) {
			if (verify(uri, refTotp(secret, now + s * 1000))) maxPositive = s
			else break
		}
		let maxNegative = 0
		for (let s = 0; s <= 900; s += 30) {
			if (verify(uri, refTotp(secret, now - s * 1000))) maxNegative = s
			else break
		}
		expect(maxPositive).toBeGreaterThanOrEqual(240)
		expect(maxNegative).toBeGreaterThanOrEqual(240)
	})

	test('E. full QR round-trip: the URI the UI renders → app → verify()', () => {
		const uri = generateUri('Livinity', 'livinity.local')
		const parsed = new URL(uri)
		expect(parsed.searchParams.get('period')).toBe('30')
		expect(parsed.searchParams.get('digits')).toBe('6')
		expect(parsed.searchParams.get('algorithm')).toBe('SHA1')
		const appSecret = refBase32Decode(parsed.searchParams.get('secret')!)
		expect(verify(uri, refTotp(appSecret, Date.now()))).toBe(true)
	})

	test('F. a code for one secret is rejected against a different secret', () => {
		const uriScanned = generateUri('Livinity', 'livinity.local')
		const uriSubmitted = generateUri('Livinity', 'livinity.local')
		expect(secretFromUri(uriScanned)).not.toBe(secretFromUri(uriSubmitted))
		const code = refTotp(refBase32Decode(secretFromUri(uriScanned)), Date.now())
		expect(verify(uriSubmitted, code)).toBe(false)
	})

	// ───────────────────────────────────────────────────────────────────────────

	test('G. PAD-01 — a code with a leading zero verifies (the notp defect)', () => {
		// The previous implementation delegated to `notp`, whose hotp.gen ends with
		// `v.substr(v.length - 6, 6)` on the decimal string of the 31-bit truncation
		// value. Below 100000 that string is shorter than 6, so the start index goes
		// negative — and a negative substr start counts from the END. A value of
		// 57117 was emitted as "7" while the authenticator displayed "057117", and a
		// valid code was rejected with no explanation ~1 in 21 475 attempts.
		//
		// Deterministic: fixed key, scan for the pathological counters, pin the clock
		// there with fake timers.
		const key = Buffer.from('4c6976696e697479203336382e37205041442d3031206669786564206b657921', 'hex')
		expect(key.length).toBe(32)
		const uri = `otpauth://totp/Livinity?secret=${refBase32Encode(key)}&period=30&digits=6&algorithm=SHA1&issuer=livinity.local`

		// (a) Any code whose displayed form carries a leading zero — ~1 in 10.
		let leadingZeroCounter = -1
		for (let counter = 1; counter < 100_000; counter++) {
			if (refTruncated(key, counter) % 1_000_000 < 100_000) {
				leadingZeroCounter = counter
				break
			}
		}
		expect(leadingZeroCounter).toBeGreaterThan(0)
		const leadingZeroCode = refTotp(key, leadingZeroCounter * 30 * 1000)
		expect(leadingZeroCode).toMatch(/^0\d{5}$/)

		// (b) The exact historical case: the WHOLE value below 100000, which is what
		// made notp emit a single character. ≈ 2**31 / 100000 ≈ 21 475 counters.
		let shortValueCounter = -1
		for (let counter = 1; counter < 2_000_000; counter++) {
			if (refTruncated(key, counter) < 100_000) {
				shortValueCounter = counter
				break
			}
		}
		expect(shortValueCounter).toBeGreaterThan(0)
		const shortValueCode = refTotp(key, shortValueCounter * 30 * 1000)
		// What notp used to compare against — proof the old path could never match.
		const notpWouldHaveEmitted = String(refTruncated(key, shortValueCounter)).substr(
			String(refTruncated(key, shortValueCounter)).length - 6,
			6,
		)
		expect(notpWouldHaveEmitted.length).toBeLessThan(6)
		expect(notpWouldHaveEmitted).not.toBe(shortValueCode)

		vi.useFakeTimers()

		vi.setSystemTime(leadingZeroCounter * 30 * 1000)
		expect(verify(uri, leadingZeroCode)).toBe(true)

		vi.setSystemTime(shortValueCounter * 30 * 1000)
		// The regression: this is the code on the user's phone. It must verify.
		expect(verify(uri, shortValueCode)).toBe(true)
		// …and the broken short form must NOT be accepted as a substitute.
		expect(verify(uri, notpWouldHaveEmitted)).toBe(false)
		expect(verify(uri, '000000')).toBe(false)
	})

	test('H. the PAD-01 retry cannot be used to smuggle a non-numeric token', () => {
		const uri = generateUri('Livinity', 'livinity.local')
		expect(verify(uri, '0abcde')).toBe(false)
		expect(verify(uri, '0')).toBe(false)
		expect(verify(uri, '')).toBe(false)
		expect(verify(uri, '000000000')).toBe(false)
	})
})
