/**
 * Phase 93-04 — fragmented MP4 box parser + WebSocket fan-out.
 *
 * Receives raw bytes from an encoder ChildProcess stdout (ffmpeg in
 * desktop/window-crop mode, gst-launch-1.0 in pipewire-fd mode), parses
 * fMP4 box boundaries, holds the initialization segment (`ftyp` + `moov`)
 * for late subscribers, and broadcasts each completed media fragment
 * (`moof` + `mdat` pair) to all subscribers via `WebSocket.send()`.
 *
 * Backpressure (D-93-08, GA-93-08): if a subscriber's `bufferedAmount`
 * exceeds `LIVOS_STREAM_BACKPRESSURE_BYTES` (default 4 MB), it is dropped
 * from the set and closed with WS code 1013 ("try again later").
 *
 * Decision (GA-93-03): hand-rolled box parser. The fMP4 box format is
 * trivially simple (4-byte big-endian size, 4-byte ASCII type, payload),
 * so pulling in the `mp4frag` dep (which also tries to parse codec params,
 * GOPs, keyframes — all things we don't need) is overkill. Parser handles
 * split chunks via an internal accumulator buffer.
 *
 * fMP4 byte layout:
 *
 *   ┌───────┬───────┬─ ─ ─ ┐
 *   │ size  │ type  │ data │
 *   │ 4 BE  │ 4 ASC │ ...  │
 *   └───────┴───────┴─ ─ ─ ┘
 *
 *   size includes the 8-byte header. size==1 means "next 8 bytes are 64-bit
 *   size"; we don't need this for fMP4 (fragments are always small enough)
 *   but we tolerate it.
 *
 * Init segment = ftyp + moov (always emitted before any moof).
 * Media fragment = moof + mdat (emitted as a pair, in order).
 */

import {EventEmitter} from 'node:events'
import type {WebSocket as WSType} from 'ws'

const FTYP = Buffer.from('ftyp')
const MOOV = Buffer.from('moov')
const MOOF = Buffer.from('moof')
const MDAT = Buffer.from('mdat')

const KNOWN_BOX_TYPES = ['ftyp', 'moov', 'moof', 'mdat', 'sidx', 'styp', 'mfra']

const DEFAULT_BACKPRESSURE_BYTES = 4 * 1024 * 1024

/** Subset of WebSocket the fan-out actually uses. */
export interface SubscriberSocket {
	send(data: Buffer): void
	close(code?: number, reason?: string): void
	bufferedAmount?: number
	readyState?: number
	on?: (event: string, cb: (...args: unknown[]) => void) => unknown
	off?: (event: string, cb: (...args: unknown[]) => void) => unknown
	removeListener?: (event: string, cb: (...args: unknown[]) => void) => unknown
}

export type Fmp4FanoutOptions = {
	backpressureBytes?: number
	logger?: {warn: (msg: string, err?: unknown) => void; verbose?: (msg: string) => void}
}

type Box = {type: string; data: Buffer}

export class Fmp4Fanout extends EventEmitter {
	private acc: Buffer = Buffer.alloc(0)
	/** ftyp seen but moov not yet → buffered here. initComplete stays false. */
	private initBuffer: Buffer | null = null
	private initComplete = false
	/** Frozen ftyp+moov, set once moov arrives. */
	private initSegment: Buffer | null = null
	private pendingMoof: Buffer | null = null
	private subscribers = new Set<SubscriberSocket>()
	private closed = false
	private readonly backpressureBytes: number
	private readonly logger: Fmp4FanoutOptions['logger']

	constructor(opts: Fmp4FanoutOptions = {}) {
		super()
		this.backpressureBytes = opts.backpressureBytes ?? DEFAULT_BACKPRESSURE_BYTES
		this.logger = opts.logger
	}

	/** Feed a chunk of bytes from the encoder stdout. */
	feed(chunk: Buffer): void {
		if (this.closed) return
		if (!chunk || chunk.length === 0) return
		this.acc = this.acc.length === 0 ? chunk : Buffer.concat([this.acc, chunk])

		// Loop until tryReadBox can't make progress. tryReadBox returns the
		// previous acc length when it modifies the buffer (resync) so we know
		// whether to keep going.
		let prevLen = this.acc.length
		while (true) {
			const box = this.tryReadBox()
			if (box) {
				this.handleBox(box)
				prevLen = this.acc.length
				continue
			}
			// No box returned — either we waited for more bytes (acc unchanged)
			// or we resynced (acc shrunk). Continue iff acc shrunk AND has
			// enough bytes to attempt another box read.
			if (this.acc.length === prevLen) break
			prevLen = this.acc.length
			if (this.acc.length < 8) break
		}
	}

	/**
	 * Try to parse a single box from `this.acc`. Returns `null` if the
	 * accumulator does not yet contain a complete box (caller should wait
	 * for more bytes).
	 */
	private tryReadBox(): Box | null {
		if (this.acc.length < 8) return null
		const size = this.acc.readUInt32BE(0)
		// size == 0 — box extends to end-of-stream. Not used in fMP4 muxers we
		// drive; if we see it we drop the rest of the buffer to avoid a stall.
		if (size === 0) {
			this.logger?.warn?.('fmp4-fanout: size=0 box (extend-to-EOF) — discarding accumulator')
			this.acc = Buffer.alloc(0)
			return null
		}
		// size == 1 — 64-bit largesize follows. Not expected for fMP4 fragments
		// but we tolerate it.
		let headerLen = 8
		let totalSize = size
		if (size === 1) {
			if (this.acc.length < 16) return null
			const hi = this.acc.readUInt32BE(8)
			const lo = this.acc.readUInt32BE(12)
			totalSize = hi * 0x1_0000_0000 + lo
			headerLen = 16
		}
		// Sanity: a box smaller than its header is corrupt. Resync by scanning
		// forward for a known box-type signature (ftyp/moov/moof/mdat/sidx).
		// Logged so it's visible in production.
		if (totalSize < headerLen) {
			this.logger?.warn?.(
				`fmp4-fanout: corrupt box (size ${totalSize} < header ${headerLen}) — resyncing`,
			)
			this.acc = resyncToKnownBox(this.acc.subarray(1))
			return null
		}
		// Sanity: also resync if the type at offset 4 is non-printable OR not
		// a known fMP4 box type. (Spurious large size with garbage type would
		// otherwise stall the parser forever waiting for `totalSize` bytes that
		// will never arrive.) For unknown-but-printable types we let the parser
		// pass them through (mfra/sidx/styp/etc.) — KNOWN_BOX_TYPES is the
		// allow-list at the resync gate; the actual handleBox dispatch is more
		// permissive about what to do with them.
		const probeType = this.acc.subarray(4, 8)
		if (!isPrintableAscii(probeType)) {
			this.logger?.warn?.(
				`fmp4-fanout: non-printable box type at offset 0 — resyncing`,
			)
			this.acc = resyncToKnownBox(this.acc.subarray(1))
			return null
		}
		const probeTypeStr = probeType.toString('ascii')
		if (!KNOWN_BOX_TYPES.includes(probeTypeStr)) {
			this.logger?.warn?.(
				`fmp4-fanout: unknown box type "${probeTypeStr}" at offset 0 — resyncing`,
			)
			this.acc = resyncToKnownBox(this.acc.subarray(1))
			return null
		}
		if (this.acc.length < totalSize) return null
		const typeBuf = this.acc.subarray(4, 8)
		const type = typeBuf.toString('ascii')
		const data = this.acc.subarray(0, totalSize)
		this.acc = this.acc.subarray(totalSize)
		return {type, data}
	}

	private handleBox(box: Box): void {
		const typeBuf = Buffer.from(box.type, 'ascii')
		if (!this.initComplete) {
			// Pre-init: we expect ftyp first, then moov. Concatenate them as the
			// init segment when moov arrives. Anything before ftyp (e.g. junk
			// from a bad encoder warmup) is logged + dropped.
			if (typeBuf.equals(FTYP)) {
				this.initBuffer = box.data
				return
			}
			if (typeBuf.equals(MOOV)) {
				if (!this.initBuffer) {
					this.logger?.warn?.('fmp4-fanout: moov before ftyp — using moov-only init')
					this.initSegment = box.data
				} else {
					this.initSegment = Buffer.concat([this.initBuffer, box.data])
				}
				this.initBuffer = null
				this.initComplete = true
				// Deliver init segment to existing subscribers WITHOUT applying
				// the backpressure threshold — init is a 1-shot prerequisite for
				// any subsequent fragment to be decodable. The fragment broadcasts
				// that follow ARE backpressure-checked, so a truly stuck client
				// is dropped on the next moof+mdat anyway.
				if (this.initSegment) this.sendInitToAll(this.initSegment)
				this.emit('init', this.initSegment)
				return
			}
			// Pre-init box of unknown type — just skip
			this.logger?.verbose?.(`fmp4-fanout: skipping pre-init ${box.type}`)
			return
		}

		// Post-init: pair moof + mdat as a fragment
		if (typeBuf.equals(MOOF)) {
			this.pendingMoof = box.data
			return
		}
		if (typeBuf.equals(MDAT)) {
			if (!this.pendingMoof) {
				this.logger?.warn?.('fmp4-fanout: mdat without preceding moof — discarding')
				return
			}
			const fragment = Buffer.concat([this.pendingMoof, box.data])
			this.pendingMoof = null
			this.broadcast(fragment)
			return
		}
		// Other top-level boxes (sidx, mfra, etc.) — pass through to all
		// subscribers as their own broadcast.
		this.broadcast(box.data)
	}

	private sendInitToAll(initSegment: Buffer): void {
		const snapshot = Array.from(this.subscribers)
		for (const ws of snapshot) {
			try {
				ws.send(initSegment)
			} catch (err) {
				this.logger?.warn?.('fmp4-fanout: init send failed — removing subscriber', err)
				this.subscribers.delete(ws)
			}
		}
	}

	private broadcast(data: Buffer): void {
		// Iterate over a snapshot — slow subscribers may be removed mid-iter.
		const snapshot = Array.from(this.subscribers)
		for (const ws of snapshot) {
			const buffered = ws.bufferedAmount ?? 0
			if (buffered > this.backpressureBytes) {
				this.logger?.warn?.(
					`fmp4-fanout: dropping slow subscriber (buffered=${buffered} > ${this.backpressureBytes})`,
				)
				try {
					ws.close(1013, 'try again later')
				} catch {
					/* noop */
				}
				this.subscribers.delete(ws)
				continue
			}
			try {
				ws.send(data)
			} catch (err) {
				this.logger?.warn?.('fmp4-fanout: send failed — removing subscriber', err)
				this.subscribers.delete(ws)
			}
		}
	}

	addSubscriber(ws: SubscriberSocket): void {
		if (this.closed) {
			try {
				ws.close(1011, 'fanout closed')
			} catch {
				/* noop */
			}
			return
		}
		this.subscribers.add(ws)
		if (this.initSegment) {
			try {
				ws.send(this.initSegment)
			} catch (err) {
				this.logger?.warn?.('fmp4-fanout: init-segment send failed', err)
				this.subscribers.delete(ws)
			}
		}
	}

	removeSubscriber(ws: SubscriberSocket): void {
		this.subscribers.delete(ws)
	}

	getSubscriberCount(): number {
		return this.subscribers.size
	}

	getInitSegment(): Buffer | null {
		return this.initSegment
	}

	close(reason: string = 'closed'): void {
		if (this.closed) return
		this.closed = true
		const snapshot = Array.from(this.subscribers)
		this.subscribers.clear()
		for (const ws of snapshot) {
			try {
				ws.close(1011, reason)
			} catch {
				/* noop */
			}
		}
		this.acc = Buffer.alloc(0)
		this.pendingMoof = null
		this.emit('close', reason)
	}
}

function isPrintableAscii(buf: Buffer): boolean {
	for (let i = 0; i < buf.length; i++) {
		const b = buf[i]
		if (b < 0x20 || b > 0x7e) return false
	}
	return true
}

/**
 * Scan forward in the buffer for a 4-byte sequence at offset 4 (positioned
 * as the box type field) that matches a known box type. Used for parser
 * recovery after corrupt input. Returns the buffer trimmed to the resynced
 * position, or an empty buffer if no signature was found.
 */
function resyncToKnownBox(buf: Buffer): Buffer {
	if (buf.length < 8) return buf
	for (let i = 0; i + 8 <= buf.length; i++) {
		const type = buf.subarray(i + 4, i + 8).toString('ascii')
		if (KNOWN_BOX_TYPES.includes(type)) {
			return buf.subarray(i)
		}
	}
	// No known signature in buffer yet — keep what we have, more bytes may
	// arrive in the next feed().
	return buf
}

/**
 * Helper: build a synthetic fMP4 box. Used by tests and integration fixtures.
 * Returns Buffer with [size BE, type ASCII, payload].
 */
export function makeBox(type: string, payload: Buffer): Buffer {
	if (type.length !== 4) throw new Error('box type must be 4 chars')
	const total = 8 + payload.length
	const buf = Buffer.alloc(total)
	buf.writeUInt32BE(total, 0)
	buf.write(type, 4, 'ascii')
	payload.copy(buf, 8)
	return buf
}

// Re-export for tests / consumers that don't want to import the WS type
export {WSType}
