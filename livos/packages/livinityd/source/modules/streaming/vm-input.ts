/**
 * Phase 367 (VMENC-03) — pure, DOM/ws-agnostic input-frame validation + rate limiting
 * for the encoded VM stream's hybrid input channel.
 *
 * Wire format (client → server TEXT frames on the ALREADY-ADMITTED /ws/vm-stream socket):
 *   {t:'p', x, y, b}     pointer — absolute guest coords + 5-bit RFB button mask (0..31)
 *   {t:'k', k, d}        key     — X11 keysym (u32, 1..0xFFFFFFFF) + down flag (0|1)
 *   {t:'w', x, y, dy, b} wheel   — absolute coords + direction (sign-normalized to ±1) +
 *                        OPTIONAL held-buttons mask (0..31, ABSENT → 0; WR-02: the server
 *                        ORs it into both pulse masks so a scroll mid-drag keeps the drag)
 *
 * This module is the LOAD-BEARING validation (research Pitfall 3): vnc-rfb-client's
 * sendPointerEvent/sendKeyEvent feed raw numbers into Buffer.writeUInt16BE/writeUInt32BE,
 * which throw RangeError on non-integers or out-of-range values — and livinityd has no
 * daemon-wide uncaughtException guard (364 RESIDUAL-1). So every field that reaches a
 * Buffer write is type/range-checked HERE, fail-closed to null, before any relay:
 *   - b/k/d/dy are fully bounded here (they flow to the wire verbatim)
 *   - x/y are INTEGER-checked here but NOT bounds-checked — the server clamps them to the
 *     session's guest dims in sendVmInput (the wire may not know the dims; the clamp bound
 *     is the WR-01-capped session geometry, ≤8192/axis)
 * Keysym ALLOWLISTING is deliberately NOT done: the trust boundary is the admin gate, not
 * the key value (research §3) — any admin may type any key into their own VM.
 *
 * parseVmInput NEVER throws — garbage/oversize/wrong-type input returns null and the
 * caller drops the frame (persistent garbage strikes toward a 1008 close in the WS branch).
 */

/** A validated client→server input frame (post-parseVmInput — safe to relay). */
export type VmInputMessage =
	| {t: 'p'; x: number; y: number; b: number}
	| {t: 'k'; k: number; d: 0 | 1}
	| {t: 'w'; x: number; y: number; dy: -1 | 1; b: number}

/** Max raw bytes per input frame. The largest legitimate frame is ~50 B of JSON; 256 B is
 *  generous headroom while capping the per-message JSON.parse work (T-367-04 DoS posture). */
export const MAX_INPUT_MSG_BYTES = 256

/** Sustained per-socket input rate (events/sec). ~125 ev/s is a fast human mouse; 400
 *  never throttles a real user while bounding a flood (T-367-04). */
export const INPUT_EVENTS_PER_SEC = 400

/** Token-bucket burst ceiling — absorbs legitimate event bursts (fast drags, key repeat)
 *  without ever QUEUING: a denied event is DROPPED by the caller (ghost-replay hazard). */
export const INPUT_BURST = 800

/** Accumulated garbage/oversize frames (NOT rate-drops) before the WS branch closes the
 *  socket with 1008 — a well-behaved client never sends even one. */
export const MAX_INPUT_STRIKES = 50

/** Integer-in-range check — the writeUInt16BE/writeUInt32BE RangeError guard primitive. */
function isInt(v: unknown): v is number {
	return typeof v === 'number' && Number.isInteger(v)
}

/**
 * Parse + validate one raw client frame. Returns the typed message (a FRESH object — no
 * client-controlled extra properties survive) or null on ANY failure. Never throws.
 */
export function parseVmInput(raw: string | Buffer): VmInputMessage | null {
	if (Buffer.byteLength(raw) > MAX_INPUT_MSG_BYTES) return null
	let parsed: unknown
	try {
		parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'))
	} catch {
		return null
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
	const obj = parsed as Record<string, unknown>
	switch (obj.t) {
		case 'p': {
			const {x, y, b} = obj
			if (!isInt(x) || !isInt(y)) return null
			if (!isInt(b) || b < 0 || b > 31) return null
			return {t: 'p', x, y, b}
		}
		case 'k': {
			const {k, d} = obj
			if (!isInt(k) || k < 1 || k > 0xff_ff_ff_ff) return null
			if (d !== 0 && d !== 1) return null
			return {t: 'k', k, d}
		}
		case 'w': {
			const {x, y, dy, b} = obj
			if (!isInt(x) || !isInt(y)) return null
			if (!isInt(dy) || dy === 0) return null
			// WR-02: optional held-buttons mask — same bounds as the pointer path.
			// ABSENT → 0 (pre-WR-02 client compat); present-but-invalid → reject.
			if (b !== undefined && (!isInt(b) || b < 0 || b > 31)) return null
			return {t: 'w', x, y, dy: dy < 0 ? -1 : 1, b: b === undefined ? 0 : b}
		}
		default:
			return null
	}
}

/**
 * Per-socket token bucket (T-367-04). Refills continuously at `ratePerSec` up to `burst`;
 * each allowed event spends one token. DROP-not-queue is the CALLER's contract — a denied
 * event is discarded silently (queuing would replay ghost input seconds later). `now` is
 * injectable for deterministic tests (no fake timers needed).
 */
export class VmInputRateLimiter {
	readonly #rate: number
	readonly #burst: number
	#tokens: number
	#last: number | null = null

	constructor(ratePerSec = INPUT_EVENTS_PER_SEC, burst = INPUT_BURST) {
		this.#rate = ratePerSec
		this.#burst = burst
		this.#tokens = burst
	}

	allow(now = Date.now()): boolean {
		if (this.#last !== null && now > this.#last) {
			this.#tokens = Math.min(this.#burst, this.#tokens + ((now - this.#last) / 1000) * this.#rate)
		}
		this.#last = now
		if (this.#tokens < 1) return false
		this.#tokens -= 1
		return true
	}
}
