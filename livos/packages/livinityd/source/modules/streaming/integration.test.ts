/**
 * Phase 93-12 — Streaming integration test.
 *
 * End-to-end vitest using the `fake-encoder.cjs` fixture binary. Spawns
 * the StreamManager with the fake encoder as the spawn target, attaches a
 * subscriber socket to the resulting Fmp4Fanout, and asserts:
 *   1. Init segment received as the FIRST sent payload (ftyp + moov)
 *   2. ≥3 media fragments received within 1s
 *   3. stopStream triggers encoder exit + fanout close + map cleanup
 *
 * No real ffmpeg, no X server. The fixture binary is the boundary.
 */

import {describe, it, expect} from 'vitest'
import {spawn as nodeSpawn} from 'node:child_process'
import {join} from 'node:path'
import {StreamManager} from './stream-manager.js'
import type {SubscriberSocket} from './fmp4-fanout.js'

const FAKE_ENCODER_PATH = join(import.meta.dirname, '__fixtures__', 'fake-encoder.cjs')

class CapturingSocket implements SubscriberSocket {
	bufferedAmount = 0
	readyState = 1
	sent: Buffer[] = []
	closeCode: number | null = null
	send(data: Buffer): void {
		this.sent.push(Buffer.from(data))
	}
	close(code?: number): void {
		this.closeCode = code ?? 1000
	}
}

function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
	const deadline = Date.now() + timeoutMs
	return new Promise((resolve, reject) => {
		const tick = () => {
			if (predicate()) return resolve()
			if (Date.now() >= deadline) return reject(new Error(`waitFor(${label}) timed out after ${timeoutMs}ms`))
			setTimeout(tick, 25)
		}
		tick()
	})
}

describe('Streaming integration — fake-encoder ↔ StreamManager ↔ Fmp4Fanout', () => {
	it('start → frames received → stop → cleanup', async () => {
		const mgr = new StreamManager({
			caps: {vaapi: false, profiles: []},
			spawn: (_cmd, _args) => {
				// Always spawn the fake-encoder regardless of cmd/args
				return nodeSpawn('node', [FAKE_ENCODER_PATH], {
					stdio: ['ignore', 'pipe', 'pipe'],
				})
			},
			stopTimeoutMs: 500,
		})

		const start = mgr.startStream({
			userId: 'u1',
			mode: 'desktop',
			target: {display: ':0.0', width: 320, height: 240},
		})
		expect(start.streamId).toBeTruthy()

		const sock = new CapturingSocket()
		const ok = mgr.addSubscriber(start.streamId, sock)
		expect(ok).toBe(true)

		// Wait for init segment (sent[0]) + at least 3 fragments
		await waitFor(() => sock.sent.length >= 4, 3000, 'init+3 fragments')
		expect(sock.sent.length).toBeGreaterThanOrEqual(4)

		// First send must be the init segment (ftyp + moov concatenated)
		const init = sock.sent[0]
		expect(init.subarray(4, 8).toString('ascii')).toBe('ftyp')
		// moov starts at offset = ftyp box total size
		const ftypSize = init.readUInt32BE(0)
		expect(init.subarray(ftypSize + 4, ftypSize + 8).toString('ascii')).toBe('moov')

		// Subsequent sends are moof+mdat pairs (concatenated into one Buffer)
		const frag1 = sock.sent[1]
		expect(frag1.subarray(4, 8).toString('ascii')).toBe('moof')

		// Stop the stream → encoder SIGTERM → exit → fanout close
		const stopResult = await mgr.stopStream(start.streamId)
		expect(stopResult.stopped).toBe(true)

		// listStreams now returns empty for u1
		expect(mgr.listStreams({userId: 'u1'})).toEqual([])

		// The subscriber's socket was closed by the fanout (code 1011)
		await waitFor(() => sock.closeCode !== null, 1000, 'subscriber close')
		expect(sock.closeCode).toBe(1011)
	}, 10_000)
})
