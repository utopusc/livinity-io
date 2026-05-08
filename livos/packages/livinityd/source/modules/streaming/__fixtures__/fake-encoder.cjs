#!/usr/bin/env node
/**
 * Phase 93-12 — fake-encoder fixture.
 *
 * Mimics an ffmpeg fragmented-MP4 encoder for the integration test. Emits
 * a synthetic byte sequence on stdout:
 *   1. ftyp box + moov box (init segment)
 *   2. Five (moof + mdat) pairs at 100ms intervals
 *
 * On SIGTERM: cleanly exits with code 0. The integration test verifies
 * the StreamManager's stopStream → encoder exit → fanout close chain.
 */

'use strict'

function makeBox(type, payload) {
	if (type.length !== 4) throw new Error('box type must be 4 chars')
	const total = 8 + payload.length
	const buf = Buffer.alloc(total)
	buf.writeUInt32BE(total, 0)
	buf.write(type, 4, 'ascii')
	payload.copy(buf, 8)
	return buf
}

function ftypBox() {
	return makeBox('ftyp', Buffer.from('isomavc1', 'ascii'))
}
function moovBox() {
	// 32 bytes of "moov" payload — simulates a tiny realistic header. The
	// fan-out doesn't introspect content, only box boundaries.
	return makeBox('moov', Buffer.alloc(32, 0xAA))
}
function moofBox(seq) {
	const payload = Buffer.alloc(8)
	payload.writeUInt32BE(seq, 0)
	payload.writeUInt32BE(seq * 1000, 4)
	return makeBox('moof', payload)
}
function mdatBox(seq) {
	// 64 bytes per fragment payload (totally synthetic — represents NAL units
	// in real fMP4)
	return makeBox('mdat', Buffer.alloc(64, seq & 0xff))
}

let stopRequested = false

process.on('SIGTERM', () => {
	stopRequested = true
	// Exit on the next tick so any pending stdout write flushes
	setImmediate(() => process.exit(0))
})

process.on('SIGINT', () => {
	stopRequested = true
	setImmediate(() => process.exit(0))
})

async function main() {
	// Init segment
	process.stdout.write(ftypBox())
	process.stdout.write(moovBox())

	// Five fragments at 50ms intervals
	for (let i = 1; i <= 5; i++) {
		if (stopRequested) break
		await new Promise((resolve) => setTimeout(resolve, 50))
		if (stopRequested) break
		process.stdout.write(moofBox(i))
		process.stdout.write(mdatBox(i))
	}

	// Stay alive after final fragment so stopStream actually exercises the
	// SIGTERM path — without this we'd race the natural exit.
	if (!stopRequested) {
		await new Promise((resolve) => setTimeout(resolve, 5000))
	}
}

main().catch((err) => {
	process.stderr.write(`fake-encoder error: ${err.stack || err}\n`)
	process.exit(1)
})
