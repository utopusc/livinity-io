/**
 * Phase 93-04 — Fmp4Fanout unit tests.
 *
 * Coverage (≥7 cases per acceptance):
 *   1. Single fragment broadcast (ftyp + moov + moof + mdat → 1 init send + 1 frag)
 *   2. Multi-subscriber broadcast — both receive identical bytes
 *   3. Late subscriber receives init segment + next fragment
 *   4. Slow subscriber dropped on bufferedAmount > threshold (close 1013)
 *   5. close() terminates all subscribers with code 1011
 *   6. Box parser handles split chunks (one box across two feed() calls)
 *   7. Malformed bytes logged + skipped without crashing
 *   8. removeSubscriber stops further sends to that ws
 */

import {describe, it, expect, vi} from 'vitest'
import {Fmp4Fanout, makeBox, type SubscriberSocket} from './fmp4-fanout.js'

class FakeSocket implements SubscriberSocket {
	bufferedAmount = 0
	readyState = 1
	sent: Buffer[] = []
	closed: {code?: number; reason?: string} | null = null
	send(data: Buffer): void {
		// guard against late sends after close
		if (this.closed) throw new Error('send-after-close')
		this.sent.push(Buffer.from(data))
	}
	close(code?: number, reason?: string): void {
		this.closed = {code, reason}
	}
}

function ftypBox(): Buffer {
	return makeBox('ftyp', Buffer.from('isomavc1', 'ascii'))
}
function moovBox(): Buffer {
	return makeBox('moov', Buffer.from('moov-payload', 'ascii'))
}
function moofBox(seq: number): Buffer {
	return makeBox('moof', Buffer.from(`moof-${seq}`, 'ascii'))
}
function mdatBox(seq: number): Buffer {
	return makeBox('mdat', Buffer.from(`mdat-${seq}`, 'ascii'))
}

describe('Fmp4Fanout', () => {
	it('Test 1: single-fragment broadcast — init + 1 fragment to one subscriber', () => {
		const fan = new Fmp4Fanout()
		const sock = new FakeSocket()
		fan.addSubscriber(sock)

		fan.feed(ftypBox())
		fan.feed(moovBox())
		// init segment delivered after moov
		expect(sock.sent.length).toBe(1)
		expect(sock.sent[0].subarray(4, 8).toString('ascii')).toBe('ftyp')

		fan.feed(moofBox(1))
		fan.feed(mdatBox(1))
		// fragment delivered as a single concatenated buffer
		expect(sock.sent.length).toBe(2)
		const frag = sock.sent[1]
		expect(frag.subarray(4, 8).toString('ascii')).toBe('moof')
		// moof + mdat concatenated → moof box ends, then mdat box header at offset moofLen
		const moofLen = frag.readUInt32BE(0)
		expect(frag.subarray(moofLen + 4, moofLen + 8).toString('ascii')).toBe('mdat')
	})

	it('Test 2: multi-subscriber broadcast — both receive identical bytes', () => {
		const fan = new Fmp4Fanout()
		const a = new FakeSocket()
		const b = new FakeSocket()
		fan.addSubscriber(a)
		fan.addSubscriber(b)
		fan.feed(Buffer.concat([ftypBox(), moovBox(), moofBox(1), mdatBox(1)]))
		expect(a.sent.length).toBe(2)
		expect(b.sent.length).toBe(2)
		expect(a.sent[0].equals(b.sent[0])).toBe(true)
		expect(a.sent[1].equals(b.sent[1])).toBe(true)
	})

	it('Test 3: late subscriber receives init segment immediately + next fragment', () => {
		const fan = new Fmp4Fanout()
		// Feed init segment + one fragment BEFORE any subscriber
		fan.feed(Buffer.concat([ftypBox(), moovBox(), moofBox(1), mdatBox(1)]))
		const late = new FakeSocket()
		fan.addSubscriber(late)
		// On addSubscriber: init segment sent immediately
		expect(late.sent.length).toBe(1)
		expect(late.sent[0].subarray(4, 8).toString('ascii')).toBe('ftyp')
		// Now feed another fragment — late subscriber gets it
		fan.feed(Buffer.concat([moofBox(2), mdatBox(2)]))
		expect(late.sent.length).toBe(2)
	})

	it('Test 4: slow subscriber (bufferedAmount > threshold) dropped + closed 1013', () => {
		const fan = new Fmp4Fanout({backpressureBytes: 100})
		const slow = new FakeSocket()
		slow.bufferedAmount = 1024 // way over threshold
		fan.addSubscriber(slow)
		// init segment goes through (addSubscriber doesn't check backpressure)
		fan.feed(Buffer.concat([ftypBox(), moovBox()]))
		expect(slow.sent.length).toBe(1)
		// Now broadcast a fragment — slow socket dropped + closed
		fan.feed(Buffer.concat([moofBox(1), mdatBox(1)]))
		expect(slow.closed?.code).toBe(1013)
		expect(fan.getSubscriberCount()).toBe(0)
		// Subsequent fragments NOT sent to slow (would throw send-after-close)
		fan.feed(Buffer.concat([moofBox(2), mdatBox(2)]))
		expect(slow.sent.length).toBe(1) // only the init from earlier
	})

	it('Test 5: close() terminates all subscribers with code 1011', () => {
		const fan = new Fmp4Fanout()
		const a = new FakeSocket()
		const b = new FakeSocket()
		fan.addSubscriber(a)
		fan.addSubscriber(b)
		fan.close('test-stop')
		expect(a.closed?.code).toBe(1011)
		expect(b.closed?.code).toBe(1011)
		expect(a.closed?.reason).toBe('test-stop')
		expect(fan.getSubscriberCount()).toBe(0)
	})

	it('Test 6: box parser handles split chunks across multiple feed() calls', () => {
		const fan = new Fmp4Fanout()
		const sock = new FakeSocket()
		fan.addSubscriber(sock)
		const stream = Buffer.concat([ftypBox(), moovBox(), moofBox(1), mdatBox(1)])
		// Split at every byte — worst case
		for (let i = 0; i < stream.length; i++) {
			fan.feed(stream.subarray(i, i + 1))
		}
		expect(sock.sent.length).toBe(2)
		expect(sock.sent[0].subarray(4, 8).toString('ascii')).toBe('ftyp')
	})

	it('Test 7: malformed bytes are logged + skipped without crashing', () => {
		const warn = vi.fn()
		const fan = new Fmp4Fanout({logger: {warn}})
		const sock = new FakeSocket()
		fan.addSubscriber(sock)
		// Feed a corrupt size=2 box (< 8 byte header) before the real init
		const corrupt = Buffer.alloc(8)
		corrupt.writeUInt32BE(2, 0)
		corrupt.write('XXXX', 4, 'ascii')
		fan.feed(corrupt)
		fan.feed(Buffer.concat([ftypBox(), moovBox()]))
		expect(warn).toHaveBeenCalled()
		// Still produces an init segment after recovering
		expect(sock.sent.length).toBe(1)
		expect(sock.sent[0].subarray(4, 8).toString('ascii')).toBe('ftyp')
	})

	it('Test 8: removeSubscriber stops sends to that ws', () => {
		const fan = new Fmp4Fanout()
		const a = new FakeSocket()
		const b = new FakeSocket()
		fan.addSubscriber(a)
		fan.addSubscriber(b)
		fan.feed(Buffer.concat([ftypBox(), moovBox()]))
		expect(a.sent.length).toBe(1)
		expect(b.sent.length).toBe(1)
		fan.removeSubscriber(a)
		fan.feed(Buffer.concat([moofBox(1), mdatBox(1)]))
		expect(a.sent.length).toBe(1) // unchanged
		expect(b.sent.length).toBe(2)
	})

	it('Test 9: addSubscriber after close() immediately closes the new socket 1011', () => {
		const fan = new Fmp4Fanout()
		fan.close('done')
		const sock = new FakeSocket()
		fan.addSubscriber(sock)
		expect(sock.closed?.code).toBe(1011)
	})
})
