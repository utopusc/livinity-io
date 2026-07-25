import crypto from 'node:crypto'
import {URL} from 'node:url'

// @ts-expect-error no @types/thirty-two available
import base32 from 'thirty-two'

// Number of periods checked either side of the current one. 10 × 30s = the
// ±300s window this box has always accepted; verified empirically in totp.test.ts.
// Do NOT widen it — a drifted clock is reported to the user (SKEW-01), not
// tolerated.
const WINDOW_PERIODS = 10

export function generateUri(label: string, issuer: string) {
	const secret = crypto.randomBytes(32)
	const encodedSecret = base32.encode(secret).toString('utf8').replace(/=/g, '')
	const uri = `otpauth://totp/${label}?secret=${encodedSecret}&period=30&digits=6&algorithm=SHA1&issuer=${issuer}`

	return uri
}

/**
 * PAD-01 (Phase 368.7) — RFC 6238 code for a single counter step.
 *
 * This replaces `notp`, which was subtly wrong. `notp`'s hotp.gen ends with
 * `v.substr(v.length - 6, 6)` on the decimal string of the 31-bit truncation
 * value. When that value is below 100000 the string is shorter than 6, so
 * `v.length - 6` goes NEGATIVE — and a negative `substr` start counts from the
 * END, so "57117" became "7". Meanwhile every authenticator app zero-pads and
 * shows "057117". The two never matched, and a valid code was rejected with no
 * explanation roughly 1 in 21 475 attempts (100000 / 2**31).
 *
 * Note the earlier attempt at this fix — retrying the token with its leading
 * zeros stripped — could not work: it compared "57117" against notp's "7".
 *
 * Everything else is unchanged: HMAC-SHA1, dynamic truncation, mod 10^digits.
 * totp.test.ts cross-checks this against a from-scratch reference implementation
 * so the replacement can never silently drift from the standard.
 */
function codeForCounter(secret: Buffer, counter: number, digits: number): string {
	const counterBuffer = Buffer.alloc(8)
	counterBuffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
	counterBuffer.writeUInt32BE(counter >>> 0, 4)

	const hmac = crypto.createHmac('sha1', secret).update(counterBuffer).digest()
	const offset = hmac[hmac.length - 1]! & 0x0f
	const truncated =
		((hmac[offset]! & 0x7f) << 24) |
		((hmac[offset + 1]! & 0xff) << 16) |
		((hmac[offset + 2]! & 0xff) << 8) |
		(hmac[offset + 3]! & 0xff)

	return String(truncated % 10 ** digits).padStart(digits, '0')
}

function parse(uri: string) {
	const parsedUri = new URL(uri)
	const secret = base32.decode(parsedUri.searchParams.get('secret')) as Buffer
	const period = Number(parsedUri.searchParams.get('period')) || 30
	const digits = Number(parsedUri.searchParams.get('digits')) || 6
	return {secret, period, digits}
}

export function verify(uri: string, token: string) {
	const {secret, period, digits} = parse(uri)

	const candidate = String(token ?? '').trim()
	if (candidate.length !== digits || !/^\d+$/.test(candidate)) return false

	const counter = Math.floor(Date.now() / 1000 / period)
	let matched = false
	// No early return: the loop is 21 HMACs either way, and a uniform cost keeps
	// the response time from hinting at how far off the submitted code was.
	for (let i = counter - WINDOW_PERIODS; i <= counter + WINDOW_PERIODS; i++) {
		// RFC 6238 counters start at 0. Only reachable when the clock is set near the
		// epoch (tests, or a box with a dead RTC), but an unguarded negative counter
		// throws out of writeUInt32BE and would surface as a 500 instead of a plain
		// "wrong code".
		if (i < 0) continue
		if (codeForCounter(secret, i, digits) === candidate) matched = true
	}

	return matched
}

// Only used in tests
export function generateToken(uri: string) {
	const {secret, period, digits} = parse(uri)
	return codeForCounter(secret, Math.floor(Date.now() / 1000 / period), digits)
}
